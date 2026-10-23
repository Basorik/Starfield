import { router } from 'expo-router';
import { Check, Crown, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import {
  PRO_FALLBACK_PRICE,
  PRO_FEATURES,
  getProPrice,
  purchasePro,
  restorePro,
  type PurchaseOutcome,
} from '@/lib/billing';
import { useAppStore } from '@/store/useAppStore';

const MESSAGES: Record<Exclude<PurchaseOutcome, 'unlocked'>, string> = {
  cancelled: 'Purchase cancelled.',
  unavailable:
    'The store is unavailable right now. Connect to the internet once to unlock — Pro then works offline forever.',
  failed: 'Something went wrong. You have not been charged.',
};

export default function PaywallScreen() {
  const { palette, isPro, setPro } = useAppStore();
  const insets = useSafeAreaInsets();
  const [price, setPrice] = useState(PRO_FALLBACK_PRICE);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getProPrice().then(setPrice);
  }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const run = async (action: () => Promise<PurchaseOutcome>) => {
    setBusy(true);
    setMessage(null);
    const outcome = await action();
    setBusy(false);
    if (outcome === 'unlocked') {
      setPro(true);
      close();
    } else {
      setMessage(MESSAGES[outcome]);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row justify-end">
        <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close">
          <X size={24} color={palette.primary} />
        </Pressable>
      </View>

      <View className="items-center">
        <Crown size={40} color={palette.primary} />
        <Text className="mt-3 text-2xl font-bold text-primary">PolarGrid Pro</Text>
        <Text className="mt-1 text-center text-sm text-secondary">
          One-time lifetime unlock. No subscription. Works offline.
        </Text>
      </View>

      <View className="mt-6 rounded-xl border border-border bg-surface p-4">
        {PRO_FEATURES.map((f) => (
          <View key={f} className="flex-row items-start py-1.5">
            <Check size={16} color={palette.primary} style={{ marginTop: 1 }} />
            <Text className="ml-2 flex-1 text-sm text-primary">{f}</Text>
          </View>
        ))}
      </View>

      <Text className="mt-4 text-center text-xs text-secondary">
        Free forever: live polar scope reticle (Polaris + Octans) for here and now, plus tonight's top 3 targets.
      </Text>

      <View className="mt-6 gap-2">
        {isPro ? (
          <Text className="text-center text-sm font-bold text-primary">Already unlocked on this device.</Text>
        ) : (
          <Button
            label={busy ? 'Working…' : `Unlock Pro — ${price}`}
            variant="solid"
            disabled={busy}
            onPress={() => run(purchasePro)}
          />
        )}
        <Button label="Restore purchases" disabled={busy} onPress={() => run(restorePro)} />
      </View>
      {message && <Text className="mt-3 text-center text-xs text-warn">{message}</Text>}
    </ScrollView>
  );
}

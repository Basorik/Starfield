import { Lock } from 'lucide-react-native';
import { vars } from 'nativewind';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { paletteCssVars, type Palette } from '@/theme/palette';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <View className={`rounded-xl border border-border bg-surface p-4 ${className}`}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-widest text-secondary">{children}</Text>;
}

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  palette: Palette;
  locked?: boolean;
}

export function Chip({ label, active, onPress, palette, locked }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`flex-row items-center rounded-full border px-3 py-1.5 ${active ? 'border-primary bg-border' : 'border-border'}`}
    >
      {locked && <Lock size={11} color={palette.secondary} style={{ marginRight: 4 }} />}
      <Text className={`text-xs ${active ? 'font-bold text-primary' : 'text-secondary'}`}>{label}</Text>
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = 'outline',
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'solid' | 'outline';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`items-center rounded-lg border px-4 py-3 ${variant === 'solid' ? 'border-primary bg-border' : 'border-border'}`}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Text className={`text-sm ${variant === 'solid' ? 'font-bold text-primary' : 'text-primary'}`}>{label}</Text>
    </Pressable>
  );
}

/**
 * Bottom sheet that re-applies the palette variables: a Modal renders outside
 * the themed root on web, so it would otherwise lose the colour tokens.
 */
export function BottomSheet({
  visible,
  onClose,
  palette,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  palette: Palette;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[{ flex: 1, justifyContent: 'flex-end' }, vars(paletteCssVars(palette))]}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
          onPress={onClose}
          accessibilityLabel="Close"
        />
        <View
          className="rounded-t-2xl border border-border bg-bg px-4 pt-4"
          style={{ paddingBottom: insets.bottom + 16, maxHeight: '88%' }}
        >
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Switch tinted from the palette on every platform (react-native-web needs activeThumbColor). */
export function ThemedSwitch({
  value,
  onValueChange,
  palette,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  palette: Palette;
}) {
  const webProps = Platform.OS === 'web' ? ({ activeThumbColor: palette.primary } as object) : {};
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: palette.border, true: palette.secondary }}
      thumbColor={value ? palette.primary : palette.secondary}
      {...webProps}
    />
  );
}

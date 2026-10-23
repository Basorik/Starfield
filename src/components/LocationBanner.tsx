import { router } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import { Pressable, Text } from 'react-native';

import { useAppStore } from '@/store/useAppStore';

/** Warns when the app is not using a live or chosen location. Tap → Settings. */
export default function LocationBanner() {
  const { locationSource, gpsStatus, location, palette } = useAppStore();
  if (locationSource === 'manual' || locationSource === 'gps') return null;
  if (locationSource === 'lastGps' && gpsStatus === 'locating') return null;

  const message =
    locationSource === 'fallback'
      ? `No location yet — showing ${location.label?.replace('Default · ', '') ?? 'a default site'}. Tap to enable GPS or enter your site.`
      : 'Using your last GPS fix — no live fix this session. Tap to update.';

  return (
    <Pressable
      onPress={() => router.navigate('/settings')}
      accessibilityRole="button"
      className={`mb-3 flex-row items-center rounded-lg border px-3 py-2 ${locationSource === 'fallback' ? 'border-warn' : 'border-border'}`}
    >
      <MapPin size={14} color={locationSource === 'fallback' ? palette.warn : palette.secondary} />
      <Text className={`ml-2 flex-1 text-xs ${locationSource === 'fallback' ? 'text-warn' : 'text-secondary'}`}>
        {message}
      </Text>
    </Pressable>
  );
}

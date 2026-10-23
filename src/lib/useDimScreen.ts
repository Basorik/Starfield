import * as Brightness from 'expo-brightness';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Drop the screen to `level` (0–1) while the calling screen is focused and the
 * app is in the foreground, restoring the user's brightness afterwards. iOS
 * brightness is system-wide, so it is restored whenever the app backgrounds.
 */
export function useDimScreen(enabled: boolean, level: number) {
  useFocusEffect(
    useCallback(() => {
      if (!enabled || Platform.OS === 'web') return;
      let saved: number | null = null;
      let dimmed = false;
      // Serialize so a quick blur can never land between reading and setting brightness.
      let queue = Promise.resolve();
      const enqueue = (step: () => Promise<void>) => {
        queue = queue.then(step).catch(() => {});
      };

      const dim = () =>
        enqueue(async () => {
          if (dimmed) return;
          saved = await Brightness.getBrightnessAsync();
          await Brightness.setBrightnessAsync(level);
          dimmed = true;
        });
      const restore = () =>
        enqueue(async () => {
          if (!dimmed) return;
          dimmed = false;
          if (Platform.OS === 'android') await Brightness.restoreSystemBrightnessAsync();
          else if (saved !== null) await Brightness.setBrightnessAsync(saved);
        });

      dim();
      const sub = AppState.addEventListener('change', (state) => (state === 'active' ? dim() : restore()));
      return () => {
        sub.remove();
        restore();
      };
    }, [enabled, level]),
  );
}

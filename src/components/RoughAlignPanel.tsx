import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { DeviceMotion } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { headingError, polarAxisTarget } from '@/engine/poleFinder';
import type { Palette } from '@/theme/palette';

interface Props {
  latitude: number;
  palette: Palette;
}

const ALIGNED_DEG = 1;

interface HeadingReading {
  deg: number;
  isTrue: boolean;
  accuracy: number; // 0 (uncalibrated) … 3 (good)
}

/** Compass heading (true north when the OS can apply declination) and phone tilt. */
function useOrientation(active: boolean) {
  const [heading, setHeading] = useState<HeadingReading | null>(null);
  const [tiltDeg, setTiltDeg] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    if (Platform.OS === 'web') {
      setUnavailable('Compass and tilt sensors need the iOS or Android app.');
      return;
    }
    let cancelled = false;
    let headingSub: Location.LocationSubscription | null = null;
    let motionSub: { remove: () => void } | null = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setUnavailable('Location permission is needed for a true-north compass heading.');
        } else if (!cancelled) {
          headingSub = await Location.watchHeadingAsync((h) => {
            const isTrue = h.trueHeading >= 0;
            setHeading({ deg: isTrue ? h.trueHeading : h.magHeading, isTrue, accuracy: h.accuracy });
          });
        }
      } catch {
        if (!cancelled) setUnavailable('No compass on this device.');
      }
      if (await DeviceMotion.isAvailableAsync().catch(() => false)) {
        DeviceMotion.setUpdateInterval(100);
        motionSub = DeviceMotion.addListener(({ accelerationIncludingGravity: g }) => {
          const norm = Math.hypot(g.x, g.y, g.z);
          // Elevation of the phone's long axis above the horizon (sign-agnostic across platforms).
          if (norm > 0) setTiltDeg((Math.asin(Math.min(1, Math.abs(g.y) / norm)) * 180) / Math.PI);
        });
      }
      if (cancelled) {
        headingSub?.remove();
        motionSub?.remove();
      }
    })();

    return () => {
      cancelled = true;
      headingSub?.remove();
      motionSub?.remove();
    };
  }, [active]);

  return { heading, tiltDeg, unavailable };
}

function Gauge({
  label,
  target,
  current,
  error,
  advice,
  palette,
}: {
  label: string;
  target: string;
  current: string;
  error: number | null;
  advice: string;
  palette: Palette;
}) {
  const aligned = error !== null && Math.abs(error) <= ALIGNED_DEG;
  // ±10° across the bar.
  const offset = error === null ? 0 : Math.max(-1, Math.min(1, error / 10));
  return (
    <View className="mt-3 rounded-xl border border-border bg-surface p-4">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-xs uppercase tracking-widest text-secondary">{label}</Text>
        <Text className="font-mono text-xs text-secondary">target {target}</Text>
      </View>
      <Text className={`mt-1 font-mono text-3xl font-bold ${aligned ? 'text-accent' : 'text-primary'}`}>{current}</Text>
      <View className="mt-3 h-3 justify-center">
        <View style={{ height: 2, backgroundColor: palette.border }} />
        <View
          style={{
            position: 'absolute',
            left: '50%',
            width: 2,
            height: 12,
            marginLeft: -1,
            backgroundColor: palette.secondary,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: `${50 + offset * 50}%`,
            width: 12,
            height: 12,
            marginLeft: -6,
            borderRadius: 6,
            backgroundColor: aligned ? palette.accent : palette.primary,
          }}
        />
      </View>
      <Text className={`mt-2 text-sm ${aligned ? 'font-bold text-accent' : 'text-primary'}`}>{advice}</Text>
    </View>
  );
}

/**
 * Coarse polar alignment before the pole star is even visible: lay the phone on
 * the tracker's polar axis, top towards the pole, and zero both gauges.
 */
export default function RoughAlignPanel({ latitude, palette }: Props) {
  const { heading, tiltDeg, unavailable } = useOrientation(true);
  const target = polarAxisTarget(latitude);
  const towards = latitude >= 0 ? 'true north' : 'true south';

  const headingErr = heading ? headingError(heading.deg, target.headingDeg) : null;
  const tiltErr = tiltDeg === null ? null : target.altitudeDeg - tiltDeg;
  const aligned =
    headingErr !== null && tiltErr !== null && Math.abs(headingErr) <= ALIGNED_DEG && Math.abs(tiltErr) <= ALIGNED_DEG;

  const wasAligned = useRef(false);
  useEffect(() => {
    if (aligned && !wasAligned.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    wasAligned.current = aligned;
  }, [aligned]);

  const headingAdvice =
    headingErr === null
      ? unavailable
        ? 'Compass unavailable'
        : 'Waiting for compass…'
      : Math.abs(headingErr) <= ALIGNED_DEG
        ? 'On target'
        : `Rotate base ${Math.abs(headingErr).toFixed(1)}° ${headingErr > 0 ? 'right (clockwise)' : 'left (anticlockwise)'}`;
  const tiltAdvice =
    tiltErr === null
      ? unavailable
        ? 'Tilt sensor unavailable'
        : 'Waiting for tilt sensor…'
      : Math.abs(tiltErr) <= ALIGNED_DEG
        ? 'On target'
        : `${tiltErr > 0 ? 'Raise' : 'Lower'} the polar axis ${Math.abs(tiltErr).toFixed(1)}°`;

  return (
    <View>
      <Text className="text-sm text-primary">
        Lay the phone flat along the tracker's polar axis, top edge pointing {towards}. Keep it clear of steel tripod
        legs and counterweights — they deflect the compass.
      </Text>

      {unavailable && <Text className="mt-3 text-sm text-warn">{unavailable}</Text>}

      <Gauge
        label="Azimuth"
        target={`${target.headingDeg.toFixed(0)}° (${towards})`}
        current={heading ? `${heading.deg.toFixed(1)}°` : '—'}
        error={headingErr}
        advice={headingAdvice}
        palette={palette}
      />
      {heading && !heading.isTrue && (
        <Text className="mt-1 text-xs text-warn">Magnetic heading only — no declination correction available.</Text>
      )}
      {heading && heading.accuracy < 2 && (
        <Text className="mt-1 text-xs text-warn">Compass needs calibrating: move the phone in a figure-8.</Text>
      )}

      <Gauge
        label="Altitude"
        target={`${target.altitudeDeg.toFixed(1)}° (your latitude)`}
        current={tiltDeg === null ? '—' : `${tiltDeg.toFixed(1)}°`}
        error={tiltErr}
        advice={tiltAdvice}
        palette={palette}
      />

      <Text className="mt-3 text-xs text-secondary">
        Phone sensors get you within a degree or two — enough to put {latitude >= 0 ? 'Polaris' : 'σ Octantis'} in the
        polar scope. Finish with the Reticle view.
      </Text>
    </View>
  );
}

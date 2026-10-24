import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { headingError, polarAxisTarget } from '@/engine/poleFinder';
import { cameraDirection, enuToAzAlt, type Mat3 } from '@/engine/skyView';
import { useDeviceOrientation } from '@/lib/useDeviceOrientation';
import type { Palette } from '@/theme/palette';

interface Props {
  latitude: number;
  palette: Palette;
}

const ALIGNED_DEG = 1;

/** Which line through the phone is measured. */
type Axis = 'TOP_EDGE' | 'CAMERA';

/** Direction of the chosen phone axis: the top edge is device +y, the back camera −z. */
function axisDirection(basis: Mat3, axis: Axis) {
  return enuToAzAlt(axis === 'TOP_EDGE' ? { x: basis[3], y: basis[4], z: basis[5] } : cameraDirection(basis));
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
 * Coarse polar alignment before the pole star is even visible. Uses the same
 * fused orientation as the sky view, so both agree when the phone is held the
 * same way: lay it on the tracker with the top edge along the polar axis, or
 * sight along the back camera.
 */
export default function RoughAlignPanel({ latitude, palette }: Props) {
  const [axis, setAxis] = useState<Axis>('TOP_EDGE');
  const { basis, hasDeclination, compassAccuracy, unavailable } = useDeviceOrientation(true);
  const target = polarAxisTarget(latitude);
  const towards = latitude >= 0 ? 'true north' : 'true south';
  const reading = basis ? axisDirection(basis, axis) : null;

  const headingErr = reading ? headingError(reading.azimuthDeg, target.headingDeg) : null;
  const tiltErr = reading ? target.altitudeDeg - reading.altitudeDeg : null;
  const aligned =
    headingErr !== null && tiltErr !== null && Math.abs(headingErr) <= ALIGNED_DEG && Math.abs(tiltErr) <= ALIGNED_DEG;

  const wasAligned = useRef(false);
  useEffect(() => {
    if (aligned && !wasAligned.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    wasAligned.current = aligned;
  }, [aligned]);

  const waiting = unavailable ? 'Sensors unavailable' : 'Waiting for sensors…';
  const headingAdvice =
    headingErr === null
      ? waiting
      : Math.abs(headingErr) <= ALIGNED_DEG
        ? 'On target'
        : `Rotate base ${Math.abs(headingErr).toFixed(1)}° ${headingErr > 0 ? 'right (clockwise)' : 'left (anticlockwise)'}`;
  const tiltAdvice =
    tiltErr === null
      ? waiting
      : Math.abs(tiltErr) <= ALIGNED_DEG
        ? 'On target'
        : `${tiltErr > 0 ? 'Raise' : 'Lower'} the polar axis ${Math.abs(tiltErr).toFixed(1)}°`;

  return (
    <View>
      <View className="flex-row gap-2">
        <Chip
          label="Phone on mount"
          active={axis === 'TOP_EDGE'}
          palette={palette}
          onPress={() => setAxis('TOP_EDGE')}
        />
        <Chip
          label="Sight with camera"
          active={axis === 'CAMERA'}
          palette={palette}
          onPress={() => setAxis('CAMERA')}
        />
      </View>
      <Text className="mt-3 text-sm text-primary">
        {axis === 'TOP_EDGE'
          ? `Mount the phone (any way round, e.g. in a tracker phone holder) with its TOP EDGE parallel to the polar axis, pointing towards ${towards}. The gauges measure the top edge. Check: spinning the tracker about its axis should barely change the readings.`
          : `Hold the phone so its BACK CAMERA looks along the polar axis towards ${towards} (like the Sky view). The gauges measure the camera direction.`}{' '}
        Steel tripod legs, counterweights and the tracker's motor magnets can deflect the compass; altitude is
        unaffected.
      </Text>

      {unavailable && <Text className="mt-3 text-sm text-warn">{unavailable}</Text>}

      <Gauge
        label="Azimuth"
        target={`${target.headingDeg.toFixed(0)}° (${towards})`}
        current={reading ? `${reading.azimuthDeg.toFixed(1)}°` : '—'}
        error={headingErr}
        advice={headingAdvice}
        palette={palette}
      />
      {reading && !hasDeclination && (
        <Text className="mt-1 text-xs text-warn">Magnetic heading only — no declination correction available.</Text>
      )}
      {compassAccuracy !== null && compassAccuracy < 2 && (
        <Text className="mt-1 text-xs text-warn">Compass needs calibrating: move the phone in a figure-8.</Text>
      )}

      <Gauge
        label="Altitude"
        target={`${target.altitudeDeg.toFixed(1)}° (your latitude)`}
        current={reading ? `${reading.altitudeDeg.toFixed(1)}°` : '—'}
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

import * as Location from 'expo-location';
import { Accelerometer, Gyroscope, Magnetometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { mod } from '@/engine/coords';
import { OrientationFilter, orientationDelta } from '@/engine/orientationFilter';
import type { Vec3 } from '@/engine/poleFinder';
import { deviceBasis, type Mat3 } from '@/engine/skyView';

const SENSOR_MS = 20; // 50 Hz in
const MIN_FRAME_MS = 33; // ≤ 30 renders a second out
const MIN_CHANGE = 0.0009; // ~0.05°: below this the view does not re-render

interface Reading extends Vec3 {
  timestamp: number;
}

const finite = (v: Vec3 | undefined | null): v is Vec3 =>
  !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/**
 * The phone's orientation as a true-north ENU → device matrix (rows are the
 * device x, y, z axes; the back camera looks along −z, the top edge is +y).
 *
 * Gyroscope + accelerometer + magnetometer are fused by OrientationFilter so
 * motion is smooth and immediate while the compass keeps north honest.
 * Magnetic declination comes from the OS compass (trueHeading − magHeading).
 */
export function useDeviceOrientation(active: boolean) {
  const [basis, setBasis] = useState<Mat3 | null>(null);
  const [hasDeclination, setHasDeclination] = useState(false);
  const [compassAccuracy, setCompassAccuracy] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    if (Platform.OS === 'web') {
      setUnavailable('Motion sensors need the iOS or Android app.');
      return;
    }

    let cancelled = false;
    const filter = new OrientationFilter();
    let up: Vec3 | null = null;
    let field: Vec3 | null = null;
    let declination: number | null = null;
    const subs: { remove: () => void }[] = [];

    (async () => {
      const [hasAccel, hasMag, hasGyro] = await Promise.all([
        Accelerometer.isAvailableAsync().catch(() => false),
        Magnetometer.isAvailableAsync().catch(() => false),
        Gyroscope.isAvailableAsync().catch(() => false),
      ]);
      if (cancelled) return;
      if (!hasAccel || !hasMag) {
        setUnavailable('This device has no accelerometer or magnetometer.');
        return;
      }

      Accelerometer.setUpdateInterval(SENSOR_MS);
      Magnetometer.setUpdateInterval(SENSOR_MS);
      // iOS reports the direction of gravity; Android reports the upward reaction to it.
      const sign = Platform.OS === 'ios' ? -1 : 1;
      subs.push(
        Accelerometer.addListener((a: Reading) => {
          if (!finite(a)) return;
          up = { x: sign * a.x, y: sign * a.y, z: sign * a.z };
          if (!field) return;
          const measured = deviceBasis(up, field, declination ?? 0);
          if (measured) filter.measurement(measured, a.timestamp);
        }),
        Magnetometer.addListener((m: Reading) => {
          if (finite(m) && Math.hypot(m.x, m.y, m.z) > 1) field = m;
        }),
      );
      if (hasGyro) {
        Gyroscope.setUpdateInterval(SENSOR_MS);
        subs.push(
          Gyroscope.addListener((g: Reading) => {
            if (finite(g)) filter.gyro(g, g.timestamp);
          }),
        );
      }

      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted' && !cancelled) {
          const headingSub = await Location.watchHeadingAsync((h) => {
            if (h.trueHeading >= 0 && h.magHeading >= 0) {
              declination = mod(h.trueHeading - h.magHeading + 180, 360) - 180;
            }
            setCompassAccuracy(h.accuracy);
          });
          if (cancelled) headingSub.remove();
          else subs.push(headingSub);
        }
      } catch {
        // No declination: the view falls back to magnetic north.
      }
    })();

    // Publish at display rate, and only when the orientation actually changed.
    let published: Mat3 | null = null;
    let lastFrame = 0;
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const b = filter.basis;
      if (!b || now - lastFrame < MIN_FRAME_MS) return;
      if (published && orientationDelta(published, b) < MIN_CHANGE) return;
      published = b;
      lastFrame = now;
      setBasis(b);
      setHasDeclination(declination !== null);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      subs.forEach((s) => s.remove());
    };
  }, [active]);

  return { basis, hasDeclination, compassAccuracy, unavailable };
}

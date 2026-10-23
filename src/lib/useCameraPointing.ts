import * as Location from 'expo-location';
import { Accelerometer, Magnetometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { mod } from '@/engine/coords';
import { cameraPointing, type Vec3 } from '@/engine/poleFinder';

export interface CameraPointing {
  azimuthDeg: number; // from true north when declination is known, else magnetic
  altitudeDeg: number;
  hasDeclination: boolean;
}

const UPDATE_MS = 100;
const SMOOTHING = 0.2; // low-pass weight of each new sample

const finite = (v: Vec3 | undefined | null): v is Vec3 =>
  !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

const blend = (prev: Vec3 | null, next: Vec3): Vec3 =>
  prev
    ? {
        x: prev.x + SMOOTHING * (next.x - prev.x),
        y: prev.y + SMOOTHING * (next.y - prev.y),
        z: prev.z + SMOOTHING * (next.z - prev.z),
      }
    : next;

/**
 * Where the phone's back camera points, from the accelerometer and
 * magnetometer. Magnetic declination comes from the OS compass
 * (trueHeading − magHeading), which applies its own geomagnetic model offline.
 */
export function useCameraPointing(active: boolean) {
  const [pointing, setPointing] = useState<CameraPointing | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      setPointing(null);
      return;
    }
    if (Platform.OS === 'web') {
      setUnavailable('Live aim needs the iOS or Android app.');
      return;
    }

    let cancelled = false;
    let up: Vec3 | null = null;
    let field: Vec3 | null = null;
    let declination: number | null = null;
    const subs: { remove: () => void }[] = [];

    (async () => {
      const [hasAccel, hasMag] = await Promise.all([
        Accelerometer.isAvailableAsync().catch(() => false),
        Magnetometer.isAvailableAsync().catch(() => false),
      ]);
      if (cancelled) return;
      if (!hasAccel || !hasMag) {
        setUnavailable('This device has no accelerometer or magnetometer.');
        return;
      }

      Accelerometer.setUpdateInterval(UPDATE_MS);
      Magnetometer.setUpdateInterval(UPDATE_MS);
      // iOS reports the direction of gravity; Android reports the upward reaction to it.
      const sign = Platform.OS === 'ios' ? -1 : 1;
      subs.push(
        Accelerometer.addListener((a) => {
          if (finite(a)) up = blend(up, { x: sign * a.x, y: sign * a.y, z: sign * a.z });
        }),
        Magnetometer.addListener((m) => {
          if (finite(m) && Math.hypot(m.x, m.y, m.z) > 1) field = blend(field, m);
        }),
      );

      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted' && !cancelled) {
          const headingSub = await Location.watchHeadingAsync((h) => {
            if (h.trueHeading >= 0 && h.magHeading >= 0)
              declination = mod(h.trueHeading - h.magHeading + 180, 360) - 180;
          });
          if (cancelled) headingSub.remove();
          else subs.push(headingSub);
        }
      } catch {
        // No declination: the marker falls back to magnetic north.
      }
    })();

    const timer = setInterval(() => {
      if (!up || !field) return;
      const p = cameraPointing(up, field);
      if (!p) return;
      setPointing({
        azimuthDeg: mod(p.azimuthDeg + (declination ?? 0), 360),
        altitudeDeg: p.altitudeDeg,
        hasDeclination: declination !== null,
      });
    }, UPDATE_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      subs.forEach((s) => s.remove());
    };
  }, [active]);

  return { pointing, unavailable };
}

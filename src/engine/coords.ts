import * as Astronomy from 'astronomy-engine';

import type { ObserverLocation } from '@/types/astro';

export const SIDEREAL_RATE = 1.00273790935; // sidereal hours per solar hour

export const mod = (value: number, n: number): number => ((value % n) + n) % n;

export function toObserver(loc: ObserverLocation): Astronomy.Observer {
  return new Astronomy.Observer(loc.latitude, loc.longitude, loc.elevationMeters);
}

/** Local Apparent Sidereal Time in hours [0, 24). */
export function localSiderealTime(date: Date, longitudeDeg: number): number {
  const gast = Astronomy.SiderealTime(date);
  return mod(gast + longitudeDeg / 15.0, 24.0);
}

export interface EquatorialOfDate {
  raHours: number;
  decDeg: number;
  vector: Astronomy.Vector;
}

/**
 * Precess (and nutate) J2000 mean equatorial coordinates to the true equator
 * and equinox of `date`. Pass a cached rotation when converting many objects
 * for the same instant.
 */
export function precessToDate(
  raHoursJ2000: number,
  decDegJ2000: number,
  date: Date,
  rotation: Astronomy.RotationMatrix = Astronomy.Rotation_EQJ_EQD(date),
): EquatorialOfDate {
  const eqj = Astronomy.VectorFromSphere(
    new Astronomy.Spherical(decDegJ2000, raHoursJ2000 * 15.0, 1.0),
    date,
  );
  const eqd = Astronomy.RotateVector(rotation, eqj);
  const eq = Astronomy.EquatorFromVector(eqd);
  return { raHours: eq.ra, decDeg: eq.dec, vector: eqd };
}

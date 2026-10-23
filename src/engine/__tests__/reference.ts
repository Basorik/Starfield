/**
 * Independent low-precision reference formulas (Meeus, "Astronomical
 * Algorithms", 2nd ed.) used to cross-check the astronomy-engine based
 * engine. Deliberately shares no code with src/engine.
 */
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const norm360 = (x: number) => ((x % 360) + 360) % 360;

export function julianDay(date: Date): number {
  return date.getTime() / 86_400_000 + 2440587.5;
}

/** Greenwich Mean Sidereal Time in degrees (Meeus 12.4). */
export function gmstDeg(date: Date): number {
  const jd = julianDay(date);
  const t = (jd - 2451545.0) / 36525;
  return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t - (t * t * t) / 38710000);
}

/** Rigorous precession J2000 → mean equator of date (Meeus 21.2–21.4). */
export function precessJ2000(raHours: number, decDeg: number, date: Date): { raHours: number; decDeg: number } {
  const t = (julianDay(date) - 2451545.0) / 36525;
  const zeta = ((2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) / 3600) * D2R;
  const z = ((2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) / 3600) * D2R;
  const theta = ((2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) / 3600) * D2R;
  const a0 = raHours * 15 * D2R;
  const d0 = decDeg * D2R;
  const A = Math.cos(d0) * Math.sin(a0 + zeta);
  const B = Math.cos(theta) * Math.cos(d0) * Math.cos(a0 + zeta) - Math.sin(theta) * Math.sin(d0);
  const C = Math.sin(theta) * Math.cos(d0) * Math.cos(a0 + zeta) + Math.cos(theta) * Math.sin(d0);
  const ra = norm360((Math.atan2(A, B) + z) * R2D) / 15;
  const dec = Math.atan2(C, Math.hypot(A, B)) * R2D;
  return { raHours: ra, decDeg: dec };
}

/** Geometric altitude (no refraction) of an equator-of-date position. */
export function altitudeDeg(raHours: number, decDeg: number, latDeg: number, lonDeg: number, date: Date): number {
  const ha = (gmstDeg(date) + lonDeg - raHours * 15) * D2R;
  const lat = latDeg * D2R;
  const dec = decDeg * D2R;
  return Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha)) * R2D;
}

/** Low-precision apparent Sun RA/Dec (Meeus ch. 25), good to ~0.01°. */
export function sunEquatorial(date: Date): { raHours: number; decDeg: number } {
  const t = (julianDay(date) - 2451545.0) / 36525;
  const L0 = norm360(280.46646 + 36000.76983 * t + 0.0003032 * t * t);
  const M = norm360(357.52911 + 35999.05029 * t - 0.0001537 * t * t) * D2R;
  const C =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(M) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  const omega = (125.04 - 1934.136 * t) * D2R;
  const lambda = (L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) * D2R;
  const eps = (23.439291 - 0.0130042 * t + 0.00256 * Math.cos(omega)) * D2R;
  const ra = norm360(Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) * R2D) / 15;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)) * R2D;
  return { raHours: ra, decDeg: dec };
}

export function sunAltitudeDeg(latDeg: number, lonDeg: number, date: Date): number {
  const sun = sunEquatorial(date);
  return altitudeDeg(sun.raHours, sun.decDeg, latDeg, lonDeg, date);
}

/** Bisection for the instant the Sun crosses `targetAlt` between two bracketing times. */
export function sunCrossing(latDeg: number, lonDeg: number, from: Date, to: Date, targetAlt: number): Date {
  let a = from.getTime();
  let b = to.getTime();
  const f = (ms: number) => sunAltitudeDeg(latDeg, lonDeg, new Date(ms)) - targetAlt;
  const fa = f(a);
  for (let i = 0; i < 40; i++) {
    const mid = (a + b) / 2;
    if (Math.sign(f(mid)) === Math.sign(fa)) a = mid;
    else b = mid;
  }
  return new Date((a + b) / 2);
}

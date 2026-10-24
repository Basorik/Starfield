import * as Astronomy from 'astronomy-engine';

import type { Hemisphere, ObserverLocation } from '@/types/astro';
import { localSiderealTime, mod, precessToDate, toObserver } from './coords';
import { hemisphereFor, reticleAngleDeg } from './polarAlignment';

interface CatalogStar {
  name: string;
  raHours: number; // J2000
  decDeg: number; // J2000
  mag: number;
  /** Extended object drawn as a soft disc (Magellanic Clouds). */
  radiusDeg?: number;
}

const SOUTH_STARS: CatalogStar[] = [
  { name: 'Acrux', raHours: 12.4433, decDeg: -63.0991, mag: 0.8 },
  { name: 'Mimosa', raHours: 12.7954, decDeg: -59.6886, mag: 1.25 },
  { name: 'Gacrux', raHours: 12.5194, decDeg: -57.1132, mag: 1.6 },
  { name: 'δ Cru', raHours: 12.2524, decDeg: -58.7489, mag: 2.8 },
  { name: 'α Cen', raHours: 14.66, decDeg: -60.834, mag: -0.27 },
  { name: 'Hadar', raHours: 14.0637, decDeg: -60.373, mag: 0.6 },
  { name: 'Achernar', raHours: 1.6286, decDeg: -57.2367, mag: 0.46 },
  { name: 'Canopus', raHours: 6.3992, decDeg: -52.6957, mag: -0.74 },
  { name: 'Atria', raHours: 16.8111, decDeg: -69.0277, mag: 1.9 },
  { name: 'Peacock', raHours: 20.4275, decDeg: -56.735, mag: 1.9 },
  { name: 'α Hyi', raHours: 1.9796, decDeg: -61.5698, mag: 2.9 },
  { name: 'β Hyi', raHours: 0.4292, decDeg: -77.2542, mag: 2.8 },
  { name: 'ν Oct', raHours: 21.6913, decDeg: -77.39, mag: 3.8 },
  { name: 'σ Oct', raHours: 21.1461, decDeg: -88.9564, mag: 5.4 },
  { name: 'LMC', raHours: 5.3931, decDeg: -69.7561, mag: 0.9, radiusDeg: 4.5 },
  { name: 'SMC', raHours: 0.8792, decDeg: -72.8286, mag: 2.7, radiusDeg: 2.5 },
];

const NORTH_STARS: CatalogStar[] = [
  { name: 'Polaris', raHours: 2.5303, decDeg: 89.26411, mag: 2.0 },
  { name: 'Dubhe', raHours: 11.0621, decDeg: 61.751, mag: 1.8 },
  { name: 'Merak', raHours: 11.0307, decDeg: 56.3824, mag: 2.4 },
  { name: 'Phecda', raHours: 11.8972, decDeg: 53.6948, mag: 2.4 },
  { name: 'Megrez', raHours: 12.2571, decDeg: 57.0326, mag: 3.3 },
  { name: 'Alioth', raHours: 12.9005, decDeg: 55.9598, mag: 1.8 },
  { name: 'Mizar', raHours: 13.3988, decDeg: 54.9254, mag: 2.2 },
  { name: 'Alkaid', raHours: 13.7923, decDeg: 49.3133, mag: 1.9 },
  { name: 'Caph', raHours: 0.153, decDeg: 59.1498, mag: 2.3 },
  { name: 'Schedar', raHours: 0.6751, decDeg: 56.5373, mag: 2.2 },
  { name: 'γ Cas', raHours: 0.9451, decDeg: 60.7167, mag: 2.4 },
  { name: 'Ruchbah', raHours: 1.4303, decDeg: 60.2353, mag: 2.7 },
  { name: 'Segin', raHours: 1.9066, decDeg: 63.6701, mag: 3.4 },
  { name: 'Kochab', raHours: 14.8451, decDeg: 74.1555, mag: 2.1 },
  { name: 'Pherkad', raHours: 15.3455, decDeg: 71.834, mag: 3.0 },
];

const SOUTH_LINES: [string, string][] = [
  ['Gacrux', 'Acrux'],
  ['Mimosa', 'δ Cru'],
  ['α Cen', 'Hadar'],
];

const NORTH_LINES: [string, string][] = [
  ['Dubhe', 'Merak'],
  ['Merak', 'Phecda'],
  ['Phecda', 'Megrez'],
  ['Megrez', 'Dubhe'],
  ['Megrez', 'Alioth'],
  ['Alioth', 'Mizar'],
  ['Mizar', 'Alkaid'],
  ['Caph', 'Schedar'],
  ['Schedar', 'γ Cas'],
  ['γ Cas', 'Ruchbah'],
  ['Ruchbah', 'Segin'],
  ['Kochab', 'Pherkad'],
];

export interface FinderPoint {
  name: string;
  mag: number;
  x: number; // normalized (-1..1), +x right
  y: number; // +y up (towards the zenith when facing the pole)
  radius?: number; // normalized radius for extended objects
  altitudeDeg: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface FinderGuide {
  from: Vec2;
  to: Vec2;
  label: string;
}

export interface PoleFinderState {
  hemisphere: Hemisphere;
  radiusDeg: number;
  poleAltitudeDeg: number;
  stars: FinderPoint[];
  lines: [number, number][];
  guides: FinderGuide[];
  /** Horizon (altitude 0°) as polylines; empty when it lies outside the chart. */
  horizon: Vec2[][];
}

export const FINDER_RADIUS_DEG: Record<Hemisphere, number> = { SOUTH: 40, NORTH: 45 };

const D2R = Math.PI / 180;

function project(polarDistanceDeg: number, angleDeg: number, radiusDeg: number): Vec2 {
  const r = polarDistanceDeg / radiusDeg;
  return { x: r * Math.sin(angleDeg * D2R), y: r * Math.cos(angleDeg * D2R) };
}

/** Geometric altitude of a point `p` degrees from the visible pole at hour angle `h` (hours). */
function altitudeNearPole(latDeg: number, hemisphere: Hemisphere, p: number, h: number): number {
  const phi = latDeg * D2R;
  const dec = (hemisphere === 'NORTH' ? 90 - p : p - 90) * D2R;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h * 15 * D2R)) / D2R;
}

function horizonCurve(latDeg: number, hemisphere: Hemisphere, radiusDeg: number): Vec2[][] {
  const segments: Vec2[][] = [];
  let current: Vec2[] = [];
  for (let step = 0; step <= 120; step++) {
    const h = (step / 120) * 24;
    if (altitudeNearPole(latDeg, hemisphere, radiusDeg, h) > 0) {
      if (current.length > 1) segments.push(current);
      current = [];
      continue;
    }
    // Altitude falls monotonically from the pole outwards along a fixed hour angle.
    let a = 0;
    let b = radiusDeg;
    for (let i = 0; i < 30; i++) {
      const mid = (a + b) / 2;
      if (altitudeNearPole(latDeg, hemisphere, mid, h) > 0) a = mid;
      else b = mid;
    }
    current.push(project(a, reticleAngleDeg(h, hemisphere, false), radiusDeg));
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
const length = (a: Vec2) => Math.hypot(a.x, a.y);

function southGuides(at: (name: string) => Vec2): FinderGuide[] {
  const acrux = at('Acrux');
  const gacrux = at('Gacrux');
  const alphaCen = at('α Cen');
  const hadar = at('Hadar');
  const achernar = at('Achernar');

  // The long axis of the Southern Cross, extended ~4.5×, points at the pole.
  const cross = { from: acrux, to: add(acrux, scale(sub(acrux, gacrux), 4.5)), label: 'Crux ×4.5' };

  // The perpendicular bisector of the Pointers crosses the Crux line near the pole.
  const mid = scale(add(alphaCen, hadar), 0.5);
  const along = sub(hadar, alphaCen);
  let normal = { x: -along.y, y: along.x };
  if (normal.x * -mid.x + normal.y * -mid.y < 0) normal = scale(normal, -1);
  const pointers = {
    from: mid,
    to: add(mid, scale(normal, (length(mid) * 1.1) / length(normal))),
    label: 'Pointers ⊥',
  };

  // The pole lies roughly halfway between Achernar and Acrux.
  const halfway = { from: achernar, to: acrux, label: 'Achernar ↔ Acrux' };

  return [cross, pointers, halfway];
}

function northGuides(at: (name: string) => Vec2): FinderGuide[] {
  const dubhe = at('Dubhe');
  const merak = at('Merak');
  const polaris = at('Polaris');
  const dir = sub(dubhe, merak);
  const reach = length(sub(polaris, dubhe)) * 1.05;
  return [{ from: dubhe, to: add(dubhe, scale(dir, reach / length(dir))), label: 'Pointers ×5' }];
}

/** Naked-eye chart of the sky around the visible celestial pole, rotated to `date`. */
export function computePoleFinder(location: ObserverLocation, date: Date): PoleFinderState {
  const hemisphere = hemisphereFor(location.latitude);
  const radiusDeg = FINDER_RADIUS_DEG[hemisphere];
  const catalog = hemisphere === 'NORTH' ? NORTH_STARS : SOUTH_STARS;
  const lineNames = hemisphere === 'NORTH' ? NORTH_LINES : SOUTH_LINES;
  const observer = toObserver(location);
  const lastHours = localSiderealTime(date, location.longitude);
  const rotation = Astronomy.Rotation_EQJ_EQD(date);

  const stars: FinderPoint[] = catalog.map((star) => {
    const ofDate = precessToDate(star.raHours, star.decDeg, date, rotation);
    const hourAngle = mod(lastHours - ofDate.raHours, 24);
    const pos = project(90 - Math.abs(ofDate.decDeg), reticleAngleDeg(hourAngle, hemisphere, false), radiusDeg);
    const altitudeDeg = Astronomy.Horizon(date, observer, ofDate.raHours, ofDate.decDeg, 'normal').altitude;
    return {
      name: star.name,
      mag: star.mag,
      ...pos,
      radius: star.radiusDeg ? star.radiusDeg / radiusDeg : undefined,
      altitudeDeg,
    };
  });

  const index = new Map(stars.map((s, i) => [s.name, i]));
  const at = (name: string) => stars[index.get(name)!];

  return {
    hemisphere,
    radiusDeg,
    poleAltitudeDeg: Math.abs(location.latitude),
    stars,
    lines: lineNames.map(([a, b]) => [index.get(a)!, index.get(b)!]),
    guides: hemisphere === 'NORTH' ? northGuides(at) : southGuides(at),
    horizon: horizonCurve(location.latitude, hemisphere, radiusDeg),
  };
}

/** Rough alignment goal for the tracker's polar axis: true heading and tilt. */
export function polarAxisTarget(latitudeDeg: number): { headingDeg: number; altitudeDeg: number } {
  return { headingDeg: latitudeDeg >= 0 ? 0 : 180, altitudeDeg: Math.abs(latitudeDeg) };
}

/** Signed smallest turn from `currentDeg` to `targetDeg`: positive = clockwise (turn right). */
export function headingError(currentDeg: number, targetDeg: number): number {
  return mod(targetDeg - currentDeg + 180, 360) - 180;
}

export type Vec3 = { x: number; y: number; z: number };

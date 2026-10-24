import * as Astronomy from 'astronomy-engine';

import { CONSTELLATIONS, STAR_DATA, STAR_DESIGNATIONS, STAR_NAMES } from '@/data/skyCatalog';
import type { DSOObject, ObserverLocation } from '@/types/astro';
import { localSiderealTime, mod, toObserver } from './coords';
import { hemisphereFor } from './polarAlignment';
import type { Vec3 } from './poleFinder';

/** Row-major 3×3 matrix. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const apply = (m: Mat3, x: number, y: number, z: number): Vec3 => ({
  x: m[0] * x + m[1] * y + m[2] * z,
  y: m[3] * x + m[4] * y + m[5] * z,
  z: m[6] * x + m[7] * y + m[8] * z,
});

const mul = (a: Mat3, b: Mat3): Mat3 => {
  const r: number[] = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
  return r as unknown as Mat3;
};

export function raDecToVector(raDeg: number, decDeg: number): Vec3 {
  const ra = raDeg * D2R;
  const dec = decDeg * D2R;
  return { x: Math.cos(dec) * Math.cos(ra), y: Math.cos(dec) * Math.sin(ra), z: Math.sin(dec) };
}

/** Equator-of-date → local East-North-Up, from latitude and local apparent sidereal time. */
export function ofDateToEnuMatrix(latitudeDeg: number, lastHours: number): Mat3 {
  const L = lastHours * 15 * D2R;
  const phi = latitudeDeg * D2R;
  const [sL, cL, sP, cP] = [Math.sin(L), Math.cos(L), Math.sin(phi), Math.cos(phi)];
  return [-sL, cL, 0, -sP * cL, -sP * sL, cP, cP * cL, cP * sL, sP];
}

/** J2000 mean equator → local ENU, including precession, nutation and apparent sidereal time. */
export function j2000ToEnuMatrix(location: ObserverLocation, date: Date): Mat3 {
  const rot = Astronomy.Rotation_EQJ_EQD(date).rot;
  // astronomy-engine stores rotations column-major (RotateVector uses rot[j][i]).
  const precession: Mat3 = [
    rot[0][0],
    rot[1][0],
    rot[2][0],
    rot[0][1],
    rot[1][1],
    rot[2][1],
    rot[0][2],
    rot[1][2],
    rot[2][2],
  ];
  return mul(ofDateToEnuMatrix(location.latitude, localSiderealTime(date, location.longitude)), precession);
}

export function enuToAzAlt(v: Vec3): { azimuthDeg: number; altitudeDeg: number } {
  const n = Math.hypot(v.x, v.y, v.z) || 1;
  return {
    azimuthDeg: mod(Math.atan2(v.x, v.y) * R2D, 360),
    altitudeDeg: Math.asin(Math.max(-1, Math.min(1, v.z / n))) * R2D,
  };
}

export function azAltToEnu(azimuthDeg: number, altitudeDeg: number): Vec3 {
  const A = azimuthDeg * D2R;
  const a = altitudeDeg * D2R;
  return { x: Math.sin(A) * Math.cos(a), y: Math.cos(A) * Math.cos(a), z: Math.sin(a) };
}

const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit = (v: Vec3): Vec3 | null => {
  const n = Math.hypot(v.x, v.y, v.z);
  return n > 1e-9 ? { x: v.x / n, y: v.y / n, z: v.z / n } : null;
};

/**
 * Matrix taking true-north ENU vectors into device axes (x right, y towards
 * the top edge, z out of the screen), from gravity (`up`, pointing away from
 * the ground) and the magnetic field, both in device axes. `declinationDeg`
 * is true minus magnetic azimuth.
 */
export function deviceBasis(up: Vec3, magnetic: Vec3, declinationDeg = 0): Mat3 | null {
  const u = unit(up);
  if (!u) return null;
  const magEast = unit(cross(magnetic, u));
  if (!magEast) return null;
  const magNorth = cross(u, magEast);
  const d = declinationDeg * D2R;
  const [sd, cd] = [Math.sin(d), Math.cos(d)];
  const east = {
    x: sd * magNorth.x + cd * magEast.x,
    y: sd * magNorth.y + cd * magEast.y,
    z: sd * magNorth.z + cd * magEast.z,
  };
  const north = {
    x: cd * magNorth.x - sd * magEast.x,
    y: cd * magNorth.y - sd * magEast.y,
    z: cd * magNorth.z - sd * magEast.z,
  };
  // Columns are the world axes expressed in device coordinates.
  return [east.x, north.x, u.x, east.y, north.y, u.y, east.z, north.z, u.z];
}

/** Direction the back camera (device −z) looks, in ENU. */
export function cameraDirection(basis: Mat3): Vec3 {
  return { x: -basis[6], y: -basis[7], z: -basis[8] };
}

/** Gnomonic projection of a device-frame direction; `f` is the focal length in pixels. Y is up. */
export function projectDevice(v: Vec3, f: number): { x: number; y: number; inFront: boolean } {
  const depth = -v.z;
  if (depth <= 1e-6) return { x: v.x * 1e6, y: v.y * 1e6, inFront: false };
  return { x: (f * v.x) / depth, y: (f * v.y) / depth, inFront: true };
}

// ── Catalog, precomputed once ───────────────────────────────────────────

export const STAR_COUNT = STAR_DATA.length / 3;
const STAR_J2000 = new Float64Array(STAR_COUNT * 3);
for (let i = 0; i < STAR_COUNT; i++) {
  const v = raDecToVector(STAR_DATA[i * 3], STAR_DATA[i * 3 + 1]);
  STAR_J2000.set([v.x, v.y, v.z], i * 3);
}
export const starMagnitude = (i: number) => STAR_DATA[i * 3 + 2];
export const starLabel = (i: number): string | undefined => STAR_NAMES[i] ?? STAR_DESIGNATIONS[i];

const LINE_J2000 = CONSTELLATIONS.map((c) =>
  c.lines.map((poly) => {
    const out = new Float64Array((poly.length / 2) * 3);
    for (let k = 0; k < poly.length / 2; k++) {
      const v = raDecToVector(poly[k * 2], poly[k * 2 + 1]);
      out.set([v.x, v.y, v.z], k * 3);
    }
    return out;
  }),
);
const LABEL_J2000 = CONSTELLATIONS.map((c) => raDecToVector(c.label[0], c.label[1]));

function transformAll(m: Mat3, src: Float64Array): Float64Array {
  const out = new Float64Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i];
    const y = src[i + 1];
    const z = src[i + 2];
    out[i] = m[0] * x + m[1] * y + m[2] * z;
    out[i + 1] = m[3] * x + m[4] * y + m[5] * z;
    out[i + 2] = m[6] * x + m[7] * y + m[8] * z;
  }
  return out;
}

export type SkyObjectKind = 'pole' | 'moon' | 'planet' | 'star' | 'dso';

export interface SkyObject {
  id: string;
  name: string;
  kind: SkyObjectKind;
  enu: Vec3;
  mag?: number;
}

/** Everything the sky view draws, in local ENU for one instant. Rebuild about once a second. */
export interface SkyFrame {
  date: Date;
  latitudeDeg: number;
  stars: Float64Array; // 3 per star, catalog order (brightest first)
  lines: Float64Array[][]; // per constellation, per polyline, 3 per vertex
  constellationLabels: { name: string; enu: Vec3 }[];
  objects: SkyObject[]; // pole, Moon, planets, deep-sky targets
}

const PLANETS = [
  Astronomy.Body.Mercury,
  Astronomy.Body.Venus,
  Astronomy.Body.Mars,
  Astronomy.Body.Jupiter,
  Astronomy.Body.Saturn,
];

/** The visible celestial pole as an ENU direction. */
export function celestialPoleEnu(latitudeDeg: number): Vec3 {
  const phi = latitudeDeg * D2R;
  return hemisphereFor(latitudeDeg) === 'NORTH'
    ? { x: 0, y: Math.cos(phi), z: Math.sin(phi) }
    : { x: 0, y: -Math.cos(phi), z: -Math.sin(phi) };
}

export function buildSkyFrame(location: ObserverLocation, date: Date, dsos: readonly DSOObject[]): SkyFrame {
  const m = j2000ToEnuMatrix(location, date);
  const ofDate = ofDateToEnuMatrix(location.latitude, localSiderealTime(date, location.longitude));
  const observer = toObserver(location);
  const solarSystem = (body: Astronomy.Body) => {
    const eq = Astronomy.Equator(body, date, observer, true, true);
    return apply(ofDate, eq.vec.x / eq.dist, eq.vec.y / eq.dist, eq.vec.z / eq.dist);
  };

  const objects: SkyObject[] = [
    {
      id: 'pole',
      name: hemisphereFor(location.latitude) === 'NORTH' ? 'North celestial pole' : 'South celestial pole',
      kind: 'pole',
      enu: celestialPoleEnu(location.latitude),
    },
    { id: 'moon', name: 'Moon', kind: 'moon', enu: solarSystem(Astronomy.Body.Moon), mag: -12 },
    ...PLANETS.map((body) => ({
      id: `planet:${body}`,
      name: String(body),
      kind: 'planet' as const,
      enu: solarSystem(body),
      mag: Astronomy.Illumination(body, date).mag,
    })),
    ...dsos.map((d) => {
      const v = raDecToVector(d.raHours * 15, d.decDeg);
      return {
        id: `dso:${d.id}`,
        name: d.commonName,
        kind: 'dso' as const,
        enu: apply(m, v.x, v.y, v.z),
        mag: d.magnitude,
      };
    }),
  ];

  return {
    date,
    latitudeDeg: location.latitude,
    stars: transformAll(m, STAR_J2000),
    lines: LINE_J2000.map((polys) => polys.map((p) => transformAll(m, p))),
    constellationLabels: CONSTELLATIONS.map((c, i) => ({
      name: c.name,
      enu: apply(m, LABEL_J2000[i].x, LABEL_J2000[i].y, LABEL_J2000[i].z),
    })),
    objects,
  };
}

/** Named stars as selectable targets (current ENU from the frame). */
export function namedStarObjects(frame: SkyFrame): SkyObject[] {
  return Object.entries(STAR_NAMES).map(([key, name]) => {
    const i = Number(key);
    return {
      id: `star:${i}`,
      name,
      kind: 'star' as const,
      enu: { x: frame.stars[i * 3], y: frame.stars[i * 3 + 1], z: frame.stars[i * 3 + 2] },
      mag: starMagnitude(i),
    };
  });
}

export interface AimGuidance {
  camera: { azimuthDeg: number; altitudeDeg: number };
  target: { azimuthDeg: number; altitudeDeg: number };
  /** Signed turn to the target: positive = right (clockwise seen from above). */
  turnDeg: number;
  /** Positive = raise the phone. */
  raiseDeg: number;
  separationDeg: number;
}

export function aimGuidance(basis: Mat3, targetEnu: Vec3): AimGuidance {
  const cam = cameraDirection(basis);
  const camera = enuToAzAlt(cam);
  const target = enuToAzAlt(targetEnu);
  const t = unit(targetEnu) ?? targetEnu;
  const cosSep = Math.max(-1, Math.min(1, cam.x * t.x + cam.y * t.y + cam.z * t.z));
  return {
    camera,
    target,
    turnDeg: mod(target.azimuthDeg - camera.azimuthDeg + 180, 360) - 180,
    raiseDeg: target.altitudeDeg - camera.altitudeDeg,
    separationDeg: Math.acos(cosSep) * R2D,
  };
}

/**
 * Orientation of an upright, un-rolled virtual phone whose camera looks at
 * (az, alt): used for drag-to-pan when there are no motion sensors.
 */
export function basisLookingAt(azimuthDeg: number, altitudeDeg: number): Mat3 {
  const alt = Math.max(-89.9, Math.min(89.9, altitudeDeg));
  const cam = azAltToEnu(azimuthDeg, alt);
  const z = { x: -cam.x, y: -cam.y, z: -cam.z }; // screen normal, towards the viewer
  // Screen-up is the zenith projected onto the screen plane; screen-right completes the frame.
  const y = unit({ x: -z.z * z.x, y: -z.z * z.y, z: 1 - z.z * z.z })!;
  const x = cross(y, z);
  return [x.x, x.y, x.z, y.x, y.y, y.z, z.x, z.y, z.z];
}

import * as Astronomy from 'astronomy-engine';
import { describe, expect, it } from 'vitest';

import type { ObserverLocation } from '@/types/astro';
import { precessToDate, toObserver } from '../coords';
import { cameraPointing, computePoleFinder, horizontalToFinder, type Vec3 } from '../poleFinder';

const D2R = Math.PI / 180;
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / n, y: v.y / n, z: v.z / n };
};

/** Simulate sensor readings for a phone whose back camera points at (az, alt), rolled by `rollDeg`. */
function simulate(azDeg: number, altDeg: number, rollDeg: number, dipDeg: number) {
  const cam = {
    x: Math.sin(azDeg * D2R) * Math.cos(altDeg * D2R),
    y: Math.cos(azDeg * D2R) * Math.cos(altDeg * D2R),
    z: Math.sin(altDeg * D2R),
  };
  const z = { x: -cam.x, y: -cam.y, z: -cam.z }; // device +z (out of the screen)
  const upW = { x: 0, y: 0, z: 1 };
  let y = unit({ x: upW.x - dot(upW, z) * z.x, y: upW.y - dot(upW, z) * z.y, z: upW.z - dot(upW, z) * z.z });
  let x = cross(y, z);
  // Roll the phone about its camera axis.
  const r = rollDeg * D2R;
  [x, y] = [
    {
      x: x.x * Math.cos(r) + y.x * Math.sin(r),
      y: x.y * Math.cos(r) + y.y * Math.sin(r),
      z: x.z * Math.cos(r) + y.z * Math.sin(r),
    },
    {
      x: y.x * Math.cos(r) - x.x * Math.sin(r),
      y: y.y * Math.cos(r) - x.y * Math.sin(r),
      z: y.z * Math.cos(r) - x.z * Math.sin(r),
    },
  ];
  const toDevice = (w: Vec3): Vec3 => ({ x: dot(w, x), y: dot(w, y), z: dot(w, z) });
  const field = { x: 0, y: Math.cos(dipDeg * D2R), z: -Math.sin(dipDeg * D2R) }; // north and down
  return { up: toDevice(upW), magnetic: toDevice(field) };
}

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('camera pointing from gravity + magnetometer', () => {
  it('reads an upright phone looking north at the horizon', () => {
    const p = cameraPointing({ x: 0, y: 1, z: 0 }, { x: 0, y: -0.8, z: -0.6 })!;
    expect(angleDiff(p.azimuthDeg, 0)).toBeLessThan(1e-6);
    expect(Math.abs(p.altitudeDeg)).toBeLessThan(1e-6);
  });

  it('recovers azimuth and altitude at any roll and field dip', () => {
    for (const [az, alt, roll, dip] of [
      [180, 34, 0, -60],
      [180, 34, 25, -60],
      [0, 51, -40, 66],
      [95, 10, 90, 30],
      [270, 70, 10, -20],
    ]) {
      const { up, magnetic } = simulate(az, alt, roll, dip);
      const p = cameraPointing(up, magnetic)!;
      expect(angleDiff(p.azimuthDeg, az)).toBeLessThan(1e-6);
      expect(p.altitudeDeg).toBeCloseTo(alt, 6);
    }
  });

  it('returns null without a usable field', () => {
    expect(cameraPointing({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 })).toBeNull();
  });
});

describe('horizontal direction on the finder chart', () => {
  const SYDNEY: ObserverLocation = {
    latitude: -33.8688,
    longitude: 151.2093,
    elevationMeters: 0,
    isManualOverride: true,
  };
  const LONDON: ObserverLocation = {
    latitude: 51.5074,
    longitude: -0.1278,
    elevationMeters: 0,
    isManualOverride: true,
  };
  const now = new Date('2026-10-23T11:30:00Z');

  it('puts the celestial pole at the centre', () => {
    const s = horizontalToFinder(180, 33.8688, -33.8688, 40);
    expect(Math.hypot(s.x, s.y)).toBeLessThan(1e-9);
    const n = horizontalToFinder(0, 51.5074, 51.5074, 45);
    expect(Math.hypot(n.x, n.y)).toBeLessThan(1e-9);
  });

  for (const [name, site] of [
    ['Sydney', SYDNEY],
    ['London', LONDON],
  ] as const) {
    it(`agrees with the chart's own star positions (${name})`, () => {
      const finder = computePoleFinder(site, now);
      const observer = toObserver(site);
      let checked = 0;
      for (const star of finder.stars.filter((s) => Math.hypot(s.x, s.y) < 0.95)) {
        const r = Math.hypot(star.x, star.y) * finder.radiusDeg;
        if (r < 1) continue;
        // Horizontal coordinates of the same star (geometric) from astronomy-engine.
        const catalog = STARS[site === SYDNEY ? 'SOUTH' : 'NORTH'][star.name];
        if (!catalog) continue;
        const ofDate = precessToDate(catalog[0], catalog[1], now);
        const hor = Astronomy.Horizon(now, observer, ofDate.raHours, ofDate.decDeg);
        const p = horizontalToFinder(hor.azimuth, hor.altitude, site.latitude, finder.radiusDeg);
        expect(Math.hypot(p.x - star.x, p.y - star.y)).toBeLessThan(0.002);
        checked++;
      }
      expect(checked).toBeGreaterThanOrEqual(3);
    });
  }

  it('clamps directions beyond the chart to its rim', () => {
    const p = horizontalToFinder(0, 10, -33.8688, 40); // low in the north: far from the south pole
    expect(p.clamped).toBe(true);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 9);
  });
});

const STARS: Record<'SOUTH' | 'NORTH', Record<string, [number, number]>> = {
  SOUTH: {
    Acrux: [12.4433, -63.0991],
    Achernar: [1.6286, -57.2367],
    'β Hyi': [0.4292, -77.2542],
    Canopus: [6.3992, -52.6957],
  },
  NORTH: { Dubhe: [11.0621, 61.751], Schedar: [0.6751, 56.5373], Kochab: [14.8451, 74.1555] },
};

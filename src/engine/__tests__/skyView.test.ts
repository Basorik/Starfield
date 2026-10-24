import * as Astronomy from 'astronomy-engine';
import { describe, expect, it } from 'vitest';

import { DSO_CATALOG } from '@/data/dsoCatalog';
import { STAR_DATA, STAR_DESIGNATIONS, STAR_NAMES } from '@/data/skyCatalog';
import type { ObserverLocation } from '@/types/astro';
import { precessToDate, toObserver } from '../coords';
import {
  STAR_COUNT,
  aimGuidance,
  apply,
  azAltToEnu,
  basisLookingAt,
  buildSkyFrame,
  cameraDirection,
  deviceBasis,
  enuToAzAlt,
  namedStarObjects,
  projectDevice,
} from '../skyView';
import { simulate } from './sensorSim';

const SYDNEY: ObserverLocation = {
  latitude: -33.8688,
  longitude: 151.2093,
  elevationMeters: 0,
  isManualOverride: true,
};
const LONDON: ObserverLocation = { latitude: 51.5074, longitude: -0.1278, elevationMeters: 0, isManualOverride: true };
const NOW = new Date('2026-10-23T11:30:00Z');
const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

const indexOf = (name: string) => Number(Object.entries(STAR_NAMES).find(([, n]) => n === name)![0]);

describe('bundled sky catalog', () => {
  it('has the bright stars, names and the full Octans trapezoid', () => {
    expect(STAR_COUNT).toBeGreaterThan(2800);
    for (const name of ['Sirius', 'Canopus', 'Acrux', 'Polaris', 'Achernar', 'Vega'])
      expect(indexOf(name)).toBeGreaterThanOrEqual(0);
    const desigs = Object.values(STAR_DESIGNATIONS);
    for (const d of ['σ Oct', 'χ Oct', 'τ Oct', 'υ Oct']) expect(desigs).toContain(d);
    // Brightest first.
    expect(STAR_DATA[2]).toBeLessThan(-1); // Sirius
  });
});

describe('sky frame', () => {
  for (const [label, site] of [
    ['Sydney', SYDNEY],
    ['London', LONDON],
  ] as const) {
    it(`matches astronomy-engine alt/az for catalog stars (${label})`, () => {
      const frame = buildSkyFrame(site, NOW, []);
      const observer = toObserver(site);
      for (const name of ['Sirius', 'Acrux', 'Polaris', 'Vega', 'Achernar']) {
        const i = indexOf(name);
        const ofDate = precessToDate(STAR_DATA[i * 3] / 15, STAR_DATA[i * 3 + 1], NOW);
        const hor = Astronomy.Horizon(NOW, observer, ofDate.raHours, ofDate.decDeg);
        const mine = enuToAzAlt({ x: frame.stars[i * 3], y: frame.stars[i * 3 + 1], z: frame.stars[i * 3 + 2] });
        expect(mine.altitudeDeg).toBeCloseTo(hor.altitude, 2);
        if (Math.abs(hor.altitude) < 89) expect(angleDiff(mine.azimuthDeg, hor.azimuth)).toBeLessThan(0.02);
      }
    });
  }

  it('places the Moon, planets and the celestial pole correctly', () => {
    const frame = buildSkyFrame(SYDNEY, NOW, DSO_CATALOG);
    const observer = toObserver(SYDNEY);
    const moonEq = Astronomy.Equator(Astronomy.Body.Moon, NOW, observer, true, true);
    const moonHor = Astronomy.Horizon(NOW, observer, moonEq.ra, moonEq.dec);
    const moon = enuToAzAlt(frame.objects.find((o) => o.id === 'moon')!.enu);
    expect(moon.altitudeDeg).toBeCloseTo(moonHor.altitude, 2);
    expect(angleDiff(moon.azimuthDeg, moonHor.azimuth)).toBeLessThan(0.05);

    const pole = enuToAzAlt(frame.objects.find((o) => o.kind === 'pole')!.enu);
    expect(pole.azimuthDeg).toBeCloseTo(180, 6);
    expect(pole.altitudeDeg).toBeCloseTo(33.8688, 6);

    expect(frame.objects.filter((o) => o.kind === 'planet')).toHaveLength(5);
    expect(frame.objects.filter((o) => o.kind === 'dso')).toHaveLength(DSO_CATALOG.length);
    expect(namedStarObjects(frame).length).toBeGreaterThan(150);
  });
});

describe('phone orientation and projection', () => {
  it('centres whatever the camera points at, at any roll and declination', () => {
    for (const [az, alt, roll, dip, decl] of [
      [180, 34, 0, -60, 12],
      [40, 20, 30, 65, -15],
      [300, 75, -50, 20, 3],
    ]) {
      const { up, magnetic } = simulate(az, alt, roll, dip, decl);
      const basis = deviceBasis(up, magnetic, decl)!;
      const cam = enuToAzAlt(cameraDirection(basis));
      expect(angleDiff(cam.azimuthDeg, az)).toBeLessThan(1e-6);
      expect(cam.altitudeDeg).toBeCloseTo(alt, 6);

      const target = azAltToEnu(az, alt);
      const p = projectDevice(apply(basis, target.x, target.y, target.z), 1000);
      expect(p.inFront).toBe(true);
      expect(Math.hypot(p.x, p.y)).toBeLessThan(1e-6);
    }
  });

  it('puts objects to the right on the right and higher objects up (upright phone)', () => {
    const { up, magnetic } = simulate(180, 30, 0, -60);
    const basis = deviceBasis(up, magnetic)!;
    const right = azAltToEnu(190, 30); // further west when facing south = to the right
    const higher = azAltToEnu(180, 40);
    const pr = projectDevice(apply(basis, right.x, right.y, right.z), 1000);
    const ph = projectDevice(apply(basis, higher.x, higher.y, higher.z), 1000);
    expect(pr.x).toBeGreaterThan(100);
    expect(Math.abs(pr.y)).toBeLessThan(30);
    expect(ph.y).toBeGreaterThan(100);
    expect(Math.abs(ph.x)).toBeLessThan(1e-6);
    // Behind the phone.
    const behind = azAltToEnu(0, -30);
    expect(projectDevice(apply(basis, behind.x, behind.y, behind.z), 1000).inFront).toBe(false);
  });

  it('gives signed turn/raise guidance and the separation', () => {
    const { up, magnetic } = simulate(170, 20, 0, -60);
    const basis = deviceBasis(up, magnetic)!;
    const g = aimGuidance(basis, azAltToEnu(180, 33.87));
    expect(g.turnDeg).toBeCloseTo(10, 6);
    expect(g.raiseDeg).toBeCloseTo(13.87, 6);
    expect(g.separationDeg).toBeGreaterThan(13.87);
    expect(g.separationDeg).toBeLessThan(23.87);
    const back = aimGuidance(basis, azAltToEnu(160, 20));
    expect(back.turnDeg).toBeCloseTo(-10, 6);
  });

  it('builds a level virtual camera for manual panning', () => {
    for (const [az, alt] of [
      [180, 34],
      [10, 70],
      [250, -5],
    ]) {
      const basis = basisLookingAt(az, alt);
      const cam = enuToAzAlt(cameraDirection(basis));
      expect(angleDiff(cam.azimuthDeg, az)).toBeLessThan(1e-6);
      expect(cam.altitudeDeg).toBeCloseTo(alt, 6);
      // Screen-right stays horizontal (no roll).
      expect(Math.abs(basis[2])).toBeLessThan(1e-9);
    }
  });
});

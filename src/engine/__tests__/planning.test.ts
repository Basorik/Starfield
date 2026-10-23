import { describe, expect, it } from 'vitest';

import { DSO_CATALOG } from '@/data/dsoCatalog';
import type { ObserverLocation } from '@/types/astro';
import { computePoleFinder, headingError, polarAxisTarget } from '../poleFinder';
import {
  computeNightContext,
  computeTargetReport,
  darkSkyCalendar,
  moonSeparationRequiredDeg,
  rankTargets,
  resolveDarkLimit,
  summarizeNight,
} from '../targetPlanner';

const site = (latitude: number, longitude: number): ObserverLocation => ({
  latitude,
  longitude,
  elevationMeters: 0,
  isManualOverride: true,
});

const SYDNEY = site(-33.8688, 151.2093);
const LONDON = site(51.5074, -0.1278);
const EDINBURGH = site(55.9533, -3.1883);
const SOUTH_POLE = site(-89.99, 0);
const MIDSUMMER = new Date(2026, 5, 21);
const OCT_23 = new Date(2026, 9, 23);
const MIN = 60_000;

const byId = (id: string) => DSO_CATALOG.find((d) => d.id === id)!;

describe('darkness fallback', () => {
  it('uses astronomical darkness when the Sun gets low enough', () => {
    const limit = resolveDarkLimit(computeNightContext(SYDNEY, OCT_23), 'AUTO');
    expect(limit).toEqual({ level: 'ASTRONOMICAL', sunLimitDeg: -18, isFallback: false });
  });

  it('falls back to nautical darkness in a London midsummer and still finds targets', () => {
    const ctx = computeNightContext(LONDON, MIDSUMMER);
    expect(rankTargets(ctx, DSO_CATALOG).filter((r) => r.totalShootableMinutes > 0)).toHaveLength(0);

    const limit = resolveDarkLimit(ctx, 'AUTO');
    expect(limit).toEqual({ level: 'NAUTICAL', sunLimitDeg: -12, isFallback: true });
    const ranked = rankTargets(ctx, DSO_CATALOG, {
      minHorizonDeg: 30,
      avoidMoon: false,
      sunLimitDeg: limit.sunLimitDeg,
    });
    expect(ranked.filter((r) => r.totalShootableMinutes > 0).length).toBeGreaterThan(5);
    expect(ranked[0].sunLimitDeg).toBe(-12);
  });

  it('falls back to civil twilight in an Edinburgh midsummer', () => {
    expect(resolveDarkLimit(computeNightContext(EDINBURGH, MIDSUMMER), 'AUTO').level).toBe('CIVIL');
  });

  it('honours an explicit mode even when it leaves nothing to shoot', () => {
    const ctx = computeNightContext(LONDON, MIDSUMMER);
    expect(resolveDarkLimit(ctx, 'ASTRONOMICAL').isFallback).toBe(false);
    const summary = summarizeNight(ctx, resolveDarkLimit(ctx, 'ASTRONOMICAL'));
    expect(summary.darkMinutes).toBe(0);
    expect(summary.darkStart).toBeNull();
  });

  it('reports a polar night as dark for the whole session', () => {
    const ctx = computeNightContext(SOUTH_POLE, MIDSUMMER);
    expect(ctx.twilight.astronomicalDusk).toBeNull();
    const summary = summarizeNight(ctx, resolveDarkLimit(ctx, 'AUTO'));
    expect(summary.darkAllSession).toBe(true);
    expect(summary.darkMinutes).toBe(14 * 60);
  });
});

describe('Moon handling', () => {
  it('scales the avoidance distance with illumination and ignores a thin Moon', () => {
    expect(moonSeparationRequiredDeg(0.05)).toBe(0);
    expect(moonSeparationRequiredDeg(0.5)).toBe(45);
    expect(moonSeparationRequiredDeg(1)).toBe(60);
  });

  it('only measures separation while the Moon is above the horizon', () => {
    const ctx = computeNightContext(SYDNEY, OCT_23);
    for (const report of rankTargets(ctx, DSO_CATALOG)) {
      if (report.minMoonSeparationDeg === null) {
        expect(report.moonUpMinutesInWindow).toBe(0);
        expect(report.moonPenalty).toBe(0);
      } else {
        expect(report.moonUpMinutesInWindow).toBeGreaterThanOrEqual(0);
      }
      expect(report.score).toBeLessThanOrEqual(report.totalShootableMinutes);
    }
  });

  it('ranks by Moon-weighted score', () => {
    const ranked = rankTargets(computeNightContext(SYDNEY, OCT_23), DSO_CATALOG);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
  });

  it('avoidance never lengthens a window', () => {
    const ctx = computeNightContext(SYDNEY, OCT_23);
    const helix = byId('NGC 7293');
    const plain = computeTargetReport(ctx, helix, { minHorizonDeg: 30, avoidMoon: false });
    const avoid = computeTargetReport(ctx, helix, { minHorizonDeg: 30, avoidMoon: true });
    expect(avoid.totalShootableMinutes).toBeLessThanOrEqual(plain.totalShootableMinutes);
  });

  it('finds no Moon-free time when the Moon sets three minutes before dawn', () => {
    // 23 Oct 2026, Sydney: 92% Moon sets 04:31 AEDT, astronomical dawn 04:34.
    const ctx = computeNightContext(SYDNEY, OCT_23);
    const summary = summarizeNight(ctx, resolveDarkLimit(ctx, 'AUTO'));
    expect(summary.moonrise).toBeNull();
    expect(Math.abs(summary.moonset!.getTime() - summary.darkEnd!.getTime())).toBeLessThan(5 * MIN);
    expect(summary.moonFreeMinutes).toBe(0);
    expect(Math.abs(summary.darkStart!.getTime() - ctx.twilight.astronomicalDusk!.getTime())).toBeLessThan(MIN);
  });

  it('finds the Moon-free window between dusk and a waning Moon rising', () => {
    const ctx = computeNightContext(SYDNEY, new Date(2026, 9, 30));
    const summary = summarizeNight(ctx, resolveDarkLimit(ctx, 'AUTO'));
    expect(summary.moonrise).not.toBeNull();
    expect(summary.moonFreeMinutes).toBeGreaterThan(30);
    expect(summary.moonFreeMinutes).toBeLessThan(summary.darkMinutes);
    expect(Math.abs(summary.moonFreeStart!.getTime() - summary.darkStart!.getTime())).toBeLessThan(MIN);
    expect(Math.abs(summary.moonFreeEnd!.getTime() - summary.moonrise!.getTime())).toBeLessThan(3 * MIN);
  });

  it('builds a calendar where Moon-free darkness peaks around new Moon', () => {
    const nights = darkSkyCalendar(SYDNEY, new Date(2026, 9, 26), 30, 'AUTO');
    expect(nights).toHaveLength(30);
    const darkest = nights.reduce((a, b) => (b.moonFreeMinutes > a.moonFreeMinutes ? b : a));
    const brightest = nights.reduce((a, b) => (b.moonIlluminationPct > a.moonIlluminationPct ? b : a));
    expect(darkest.moonIlluminationPct).toBeLessThan(30);
    expect(brightest.moonFreeMinutes).toBeLessThan(darkest.moonFreeMinutes);
    for (const n of nights) expect(n.moonFreeMinutes).toBeLessThanOrEqual(n.darkMinutes);
  });
});

describe('pole finder', () => {
  const now = new Date('2026-10-23T11:30:00Z');

  it('southern star-hop guides converge on the south celestial pole', () => {
    const finder = computePoleFinder(SYDNEY, now);
    expect(finder.hemisphere).toBe('SOUTH');
    const [cross, pointers, halfway] = finder.guides;
    // Ends / midpoints within ~6° (0.15 of a 40° chart) of the pole.
    expect(Math.hypot(cross.to.x, cross.to.y)).toBeLessThan(0.15);
    expect(Math.hypot((halfway.from.x + halfway.to.x) / 2, (halfway.from.y + halfway.to.y) / 2)).toBeLessThan(0.15);
    const dx = pointers.to.x - pointers.from.x;
    const dy = pointers.to.y - pointers.from.y;
    const distToPole = Math.abs(pointers.from.x * dy - pointers.from.y * dx) / Math.hypot(dx, dy);
    expect(distToPole).toBeLessThan(0.15);
  });

  it('draws the horizon below the pole at the latitude distance', () => {
    const finder = computePoleFinder(SYDNEY, now);
    expect(finder.horizon.length).toBeGreaterThan(0);
    const lowest = Math.min(...finder.horizon.flat().map((p) => p.y));
    expect(lowest * finder.radiusDeg).toBeCloseTo(-33.87, 0);
    for (const s of finder.stars) {
      const r = Math.hypot(s.x, s.y) * finder.radiusDeg;
      expect(r).toBeLessThan(finder.radiusDeg);
    }
  });

  it('northern chart puts Polaris at the centre and the Big Dipper pointers aimed at it', () => {
    const finder = computePoleFinder(LONDON, now);
    expect(finder.hemisphere).toBe('NORTH');
    const polaris = finder.stars.find((s) => s.name === 'Polaris')!;
    expect(Math.hypot(polaris.x, polaris.y) * finder.radiusDeg).toBeLessThan(0.7);
    const [guide] = finder.guides;
    expect(Math.hypot(guide.to.x - polaris.x, guide.to.y - polaris.y)).toBeLessThan(0.08);
    // London's horizon is 51.5° from the pole — outside a 45° chart.
    expect(finder.horizon).toHaveLength(0);
  });

  it('computes the rough-alignment target and signed heading error', () => {
    expect(polarAxisTarget(-33.87)).toEqual({ headingDeg: 180, altitudeDeg: 33.87 });
    expect(polarAxisTarget(51.5)).toEqual({ headingDeg: 0, altitudeDeg: 51.5 });
    expect(headingError(350, 0)).toBe(10);
    expect(headingError(10, 0)).toBe(-10);
    expect(headingError(170, 180)).toBe(10);
    expect(headingError(190, 180)).toBe(-10);
  });
});

import { describe, expect, it } from 'vitest';

import type { DSOObject, ObserverLocation } from '@/types/astro';
import {
  OCTANS_STARS,
  POLARIS,
  RETICLE_FOV_RADIUS_DEG,
  clockStringFromAngle,
  computePolarAlignment,
  formatSiderealTime,
  reticleAngleDeg,
} from '../polarAlignment';
import { computeNightContext, computeTargetReport, rankTargets, sessionDateFor, targetHorizon } from '../targetPlanner';
import { altitudeDeg, gmstDeg, precessJ2000, sunCrossing } from './reference';

const SYDNEY: ObserverLocation = {
  latitude: -33.8688,
  longitude: 151.2093,
  elevationMeters: 58,
  isManualOverride: true,
};
const LONDON: ObserverLocation = { latitude: 51.5074, longitude: -0.1278, elevationMeters: 11, isManualOverride: true };
const NEW_YORK: ObserverLocation = {
  latitude: 40.7128,
  longitude: -74.006,
  elevationMeters: 10,
  isManualOverride: true,
};

const CARINA: DSOObject = {
  id: 'NGC 3372',
  commonName: 'Carina Nebula',
  type: 'Nebula',
  constellation: 'Carina',
  raHours: 10.7524,
  decDeg: -59.8678,
  sizeArcmin: 120,
  magnitude: 1,
  recommendedFocalLengthMm: [50, 200],
  hemisphereBias: 'SOUTH',
};

const M31: DSOObject = {
  id: 'M31',
  commonName: 'Andromeda Galaxy',
  type: 'Galaxy',
  constellation: 'Andromeda',
  raHours: 0.7123,
  decDeg: 41.269,
  sizeArcmin: 190,
  magnitude: 3.4,
  recommendedFocalLengthMm: [135, 400],
  hemisphereBias: 'NORTH',
};

// 23 Oct 2026 — the Sydney evening session (local calendar date, any device time zone).
const SESSION_DATE = new Date(2026, 9, 23);
const MIN = 60_000;

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** Reference hour angle (hours) from Meeus GMST + rigorous precession. */
function referenceHourAngle(ra: number, dec: number, lon: number, date: Date): number {
  const ofDate = precessJ2000(ra, dec, date);
  return ((((gmstDeg(date) + lon) / 15 - ofDate.raHours) % 24) + 24) % 24;
}

describe('reticle geometry', () => {
  it('maps hour angle to the 12-hour dial for both hemispheres and optics', () => {
    // A star at HA = 0h sits above the pole naked-eye and below it in an inverting polar scope.
    expect(clockStringFromAngle(reticleAngleDeg(0, 'NORTH', false))).toBe('12:00');
    expect(clockStringFromAngle(reticleAngleDeg(0, 'NORTH', true))).toBe('06:00');
    // North: westward (HA = 6h) motion is counter-clockwise → 9 o'clock naked eye.
    expect(clockStringFromAngle(reticleAngleDeg(6, 'NORTH', false))).toBe('09:00');
    expect(clockStringFromAngle(reticleAngleDeg(6, 'NORTH', true))).toBe('03:00');
    // South: the sky turns clockwise.
    expect(clockStringFromAngle(reticleAngleDeg(6, 'SOUTH', false))).toBe('03:00');
    expect(clockStringFromAngle(reticleAngleDeg(6, 'SOUTH', true))).toBe('09:00');
    expect(clockStringFromAngle(reticleAngleDeg(1, 'NORTH', true))).toBe('05:30');
  });

  it('formats sidereal time', () => {
    expect(formatSiderealTime(21.7366667)).toBe('21:44:12');
    expect(formatSiderealTime(0)).toBe('00:00:00');
  });
});

describe('Southern Hemisphere — Sydney, NSW, 23 Oct 2026', () => {
  const now = new Date('2026-10-23T11:30:00Z'); // 22:30 AEDT

  it('selects the Octans asterism with four valid reticle stars', () => {
    const state = computePolarAlignment(SYDNEY, now, true);
    expect(state.hemisphere).toBe('SOUTH');
    expect(state.targetStarName).toBe('Sigma Octantis (Octans)');
    expect(state.octansStarsScreenCoords).toHaveLength(4);
    expect(state.octansStarsScreenCoords.map((s) => s.name)).toEqual(OCTANS_STARS.map((s) => s.name));

    for (const [i, star] of state.octansStarsScreenCoords.entries()) {
      const r = Math.hypot(star.x, star.y);
      expect(r).toBeLessThan(1);
      expect(Number.isFinite(star.x) && Number.isFinite(star.y)).toBe(true);
      const ref = precessJ2000(OCTANS_STARS[i].raHours, OCTANS_STARS[i].decDeg, now);
      expect(r * RETICLE_FOV_RADIUS_DEG).toBeCloseTo(90 + ref.decDeg, 1);
    }
    // Sigma Octantis has drifted to ~1.1° from the pole by 2026 (precession).
    expect(state.poleStarOffsetDeg).toBeGreaterThan(1.0);
    expect(state.poleStarOffsetDeg).toBeLessThan(1.25);
  });

  it('places sigma Octantis at the reference hour angle', () => {
    const state = computePolarAlignment(SYDNEY, now, true);
    const refHa = referenceHourAngle(OCTANS_STARS[0].raHours, OCTANS_STARS[0].decDeg, SYDNEY.longitude, now);
    expect(angleDiff(state.hourAngleHours * 15, refHa * 15)).toBeLessThan(1.0);
    expect(angleDiff(state.octansRotationDeg, reticleAngleDeg(refHa, 'SOUTH', true))).toBeLessThan(1.0);
  });

  it('rotates the trapezoid rigidly and flips it 180° between scope and naked eye', () => {
    const inverted = computePolarAlignment(SYDNEY, now, true).octansStarsScreenCoords;
    const direct = computePolarAlignment(SYDNEY, now, false).octansStarsScreenCoords;
    for (let i = 0; i < 4; i++) {
      expect(inverted[i].x).toBeCloseTo(-direct[i].x, 6);
      expect(inverted[i].y).toBeCloseTo(-direct[i].y, 6);
    }
    // One sidereal hour later every star has turned 15° clockwise (southern sky).
    const later = computePolarAlignment(SYDNEY, new Date(now.getTime() + 3_590_170), true);
    const before = computePolarAlignment(SYDNEY, now, true);
    expect(angleDiff(later.octansRotationDeg, before.octansRotationDeg + 15)).toBeLessThan(0.05);
  });

  it('finds astronomical twilight matching an independent solar model', () => {
    const ctx = computeNightContext(SYDNEY, SESSION_DATE);
    const { astronomicalDusk, astronomicalDawn } = ctx.twilight;
    expect(astronomicalDusk).not.toBeNull();
    expect(astronomicalDawn).not.toBeNull();

    const refDusk = sunCrossing(
      SYDNEY.latitude,
      SYDNEY.longitude,
      new Date('2026-10-23T07:00:00Z'),
      new Date('2026-10-23T11:00:00Z'),
      -18,
    );
    const refDawn = sunCrossing(
      SYDNEY.latitude,
      SYDNEY.longitude,
      new Date('2026-10-23T16:00:00Z'),
      new Date('2026-10-23T19:00:00Z'),
      -18,
    );
    expect(Math.abs(astronomicalDusk!.getTime() - refDusk.getTime())).toBeLessThan(2 * MIN);
    expect(Math.abs(astronomicalDawn!.getTime() - refDawn.getTime())).toBeLessThan(2 * MIN);

    // Sanity: ~20:45 AEDT dusk and ~04:00 AEDT dawn (UTC+11).
    expect(astronomicalDusk!.toISOString()).toMatch(/^2026-10-23T09:/);
    expect(astronomicalDawn!.toISOString()).toMatch(/^2026-10-23T1[67]:/);
    // Twilight stages are ordered.
    const t = ctx.twilight;
    expect(t.civilDusk! < t.nauticalDusk! && t.nauticalDusk! < t.astronomicalDusk!).toBe(true);
    expect(t.astronomicalDawn! < t.nauticalDawn! && t.nauticalDawn! < t.civilDawn!).toBe(true);
  });

  it('computes Carina Nebula altitude matching spherical trigonometry', () => {
    const ctx = computeNightContext(SYDNEY, SESSION_DATE);
    for (const iso of ['2026-10-23T12:00:00Z', '2026-10-23T15:00:00Z', '2026-10-23T18:00:00Z']) {
      const t = new Date(iso);
      const ref = precessJ2000(CARINA.raHours, CARINA.decDeg, t);
      const refAlt = altitudeDeg(ref.raHours, ref.decDeg, SYDNEY.latitude, SYDNEY.longitude, t);
      const alt = targetHorizon(CARINA, ctx.observer, t).altitude;
      // astronomy-engine adds refraction (< 0.3° above 3° altitude).
      expect(Math.abs(alt - refAlt)).toBeLessThan(0.35);
    }
  });

  it('builds the Carina Nebula night report', () => {
    const ctx = computeNightContext(SYDNEY, SESSION_DATE);
    const report = computeTargetReport(ctx, CARINA, { minHorizonDeg: 30, avoidMoon: false });

    expect(report.samples).toHaveLength(85); // 14 h at 10-minute steps, inclusive
    // Circumpolar from Sydney: lower culmination ≈ 3.7°, upper ≈ 64°.
    const alts = report.samples.map((s) => s.targetAltitudeDeg);
    expect(Math.min(...alts)).toBeGreaterThan(2.5);
    expect(Math.min(...alts)).toBeLessThan(6);
    expect(report.maxAltitudeDeg).toBeLessThan(64.5);

    // In late October Carina climbs out of the south-east before dawn, so the
    // window is pre-dawn and ends exactly at astronomical dawn.
    expect(report.optimalStart).not.toBeNull();
    expect(report.optimalEnd).not.toBeNull();
    expect(Math.abs(report.optimalEnd!.getTime() - report.astronomicalDawn!.getTime())).toBeLessThan(MIN);
    expect(report.totalShootableMinutes).toBeGreaterThan(0);
    expect(report.totalShootableMinutes).toBeLessThan(120);
    const startAlt = targetHorizon(CARINA, ctx.observer, report.optimalStart!).altitude;
    expect(startAlt).toBeCloseTo(30, 0);

    // Upper transit happens after dawn (~09:30 AEDT), so no flip inside the window.
    const refHa = referenceHourAngle(CARINA.raHours, CARINA.decDeg, SYDNEY.longitude, report.meridianTransitTime);
    expect(Math.min(refHa, 24 - refHa) * 60).toBeLessThan(1.5); // minutes of HA
    expect(report.meridianFlipRequiredInWindow).toBe(false);
    expect(report.moonIlluminationPct).toBeGreaterThanOrEqual(0);
    expect(report.moonIlluminationPct).toBeLessThanOrEqual(100);
  });
});

describe('Northern Hemisphere — Polaris clock face', () => {
  for (const [name, site] of [
    ['London', LONDON],
    ['New York', NEW_YORK],
  ] as const) {
    it(`returns NORTH and an accurate Polaris clock position for ${name}`, () => {
      const now = new Date('2026-10-23T22:00:00Z');
      const state = computePolarAlignment(site, now, true);
      expect(state.hemisphere).toBe('NORTH');
      expect(state.targetStarName).toBe('Polaris');
      expect(state.octansStarsScreenCoords).toHaveLength(0);
      expect(state.clockFaceString).toMatch(/^(0[1-9]|1[0-2]):[0-5]\d$/);

      const refHa = referenceHourAngle(POLARIS.raHours, POLARIS.decDeg, site.longitude, now);
      // Reference omits nutation (~0.4° at Polaris' declination), hence the tolerance.
      expect(angleDiff(state.hourAngleHours * 15, refHa * 15)).toBeLessThan(1.0);
      expect(angleDiff(state.clockFaceAngleDeg, reticleAngleDeg(refHa, 'NORTH', true))).toBeLessThan(1.0);
      // Polaris is ~0.63° from the pole in 2026.
      expect(state.poleStarOffsetDeg).toBeGreaterThan(0.6);
      expect(state.poleStarOffsetDeg).toBeLessThan(0.68);
    });
  }

  it('precesses Polaris to ~3h RA of date in 2026', () => {
    const state = computePolarAlignment(LONDON, new Date('2026-10-23T22:00:00Z'));
    const ref = precessJ2000(POLARIS.raHours, POLARIS.decDeg, new Date('2026-10-23T22:00:00Z'));
    expect(ref.raHours).toBeGreaterThan(2.9);
    expect(ref.raHours).toBeLessThan(3.2);
    expect((((state.localSiderealTimeHours - state.hourAngleHours) % 24) + 24) % 24).toBeCloseTo(ref.raHours, 1);
  });

  it('flags a meridian flip when M31 transits mid-window over New York', () => {
    const ctx = computeNightContext(NEW_YORK, SESSION_DATE);
    const report = computeTargetReport(ctx, M31, { minHorizonDeg: 30, avoidMoon: false });
    expect(report.transitInSession).toBe(true);
    expect(report.maxAltitudeDeg).toBeGreaterThan(80); // 90 - |40.7 - 41.4|
    expect(report.meridianFlipRequiredInWindow).toBe(true);
    expect(report.meridianTransitTime > report.optimalStart!).toBe(true);
    expect(report.meridianTransitTime < report.optimalEnd!).toBe(true);
  });
});

describe('planner utilities', () => {
  it('ranks by usable minutes and hides nothing it cannot see', () => {
    const ctx = computeNightContext(SYDNEY, SESSION_DATE);
    const ranked = rankTargets(ctx, [CARINA, M31], { minHorizonDeg: 30, avoidMoon: false });
    expect(ranked).toHaveLength(2);
    // M31 never reaches 30° from Sydney (max ≈ 15°).
    expect(ranked[1].dso.id).toBe('M31');
    expect(ranked[1].totalShootableMinutes).toBe(0);
    expect(ranked[1].optimalStart).toBeNull();
  });

  it('picks the session evening from the site longitude, not the device time zone', () => {
    // 01:30 AEDT on the 24th (14:30 UTC on the 23rd) still belongs to the 23rd's night.
    expect(sessionDateFor(new Date('2026-10-23T14:30:00Z'), SYDNEY.longitude).getDate()).toBe(23);
    // 22:52 AEDT on the 23rd (11:52 UTC) — same night.
    expect(sessionDateFor(new Date('2026-10-23T11:52:00Z'), SYDNEY.longitude).getDate()).toBe(23);
    // 19:00 in New York on the 23rd (23:00 UTC).
    expect(sessionDateFor(new Date('2026-10-23T23:00:00Z'), NEW_YORK.longitude).getDate()).toBe(23);
    // 03:00 in New York on the 24th (07:00 UTC).
    expect(sessionDateFor(new Date('2026-10-24T07:00:00Z'), NEW_YORK.longitude).getDate()).toBe(23);
  });
});

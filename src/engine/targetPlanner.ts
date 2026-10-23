import * as Astronomy from 'astronomy-engine';

import type {
  AltitudeSample,
  DarkLimit,
  DarknessMode,
  DSOObject,
  NightSummary,
  NightWindowReport,
  ObserverLocation,
  TwilightTimes,
} from '@/types/astro';
import { SIDEREAL_RATE, localSiderealTime, mod, precessToDate, toObserver } from './coords';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const SESSION_START_HOUR = 17; // local mean solar time
export const SESSION_LENGTH_HOURS = 14; // 17:00 → 07:00 next morning
export const SAMPLE_STEP_MINUTES = 10;
export const ASTRONOMICAL_TWILIGHT_DEG = -18.0;
export const NAUTICAL_TWILIGHT_DEG = -12.0;
export const CIVIL_TWILIGHT_DEG = -6.0;
export const FLIP_MARGIN_MINUTES = 15;
/** Below this illumination the Moon is ignored by the avoidance rule. */
export const MOON_IGNORE_FRACTION = 0.1;

export interface PlannerOptions {
  minHorizonDeg: number;
  /** Require the Moon to be set, faint, or far enough away (see moonSeparationRequiredDeg). */
  avoidMoon: boolean;
  /** The Sun must be at or below this altitude (default: astronomical darkness, -18°). */
  sunLimitDeg?: number;
}

export const DEFAULT_PLANNER_OPTIONS: PlannerOptions = { minHorizonDeg: 30, avoidMoon: false };

/**
 * Pre-computed Sun/Moon ephemeris for one night at one site. It is shared by
 * every target so ranking a whole catalog only pays for the Sun and Moon once.
 */
export interface NightContext {
  location: ObserverLocation;
  observer: Astronomy.Observer;
  date: Date;
  sessionStart: Date;
  sessionEnd: Date;
  twilight: TwilightTimes;
  moonIlluminationPct: number;
  moonrise: Date | null;
  moonset: Date | null;
  times: Date[];
  rotations: Astronomy.RotationMatrix[];
  sunAltitudes: number[];
  moonAltitudes: number[];
  moonVectors: Astronomy.Vector[];
}

/**
 * Session anchors are expressed in local *mean solar* time at the observer's
 * longitude, so the night is always centred on true local midnight no matter
 * which time zone the device is set to. The calendar day is read from `date`'s
 * local fields (i.e. the evening the user picked).
 */
function localMeanTime(date: Date, longitudeDeg: number, hour: number): Date {
  const utcMs = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), hour);
  return new Date(utcMs - (longitudeDeg / 15.0) * HOUR_MS);
}

export function sessionBounds(location: ObserverLocation, date: Date): { start: Date; end: Date } {
  const start = localMeanTime(date, location.longitude, SESSION_START_HOUR);
  return { start, end: new Date(start.getTime() + SESSION_LENGTH_HOURS * HOUR_MS) };
}

/**
 * The evening whose session contains `now` at the observer's longitude: before
 * local mean noon the current session is the night that began yesterday.
 * Returned as device-local midnight of that calendar day (see localMeanTime).
 */
export function sessionDateFor(now: Date, longitudeDeg: number): Date {
  const lmt = new Date(now.getTime() + (longitudeDeg / 15.0) * HOUR_MS);
  const dayOffset = lmt.getUTCHours() < 12 ? -1 : 0;
  return new Date(lmt.getUTCFullYear(), lmt.getUTCMonth(), lmt.getUTCDate() + dayOffset);
}

function searchSun(observer: Astronomy.Observer, direction: 1 | -1, from: Date, altitude: number): Date | null {
  return Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, direction, from, 1, altitude)?.date ?? null;
}

export function computeTwilight(location: ObserverLocation, date: Date): TwilightTimes {
  const observer = toObserver(location);
  // Searching forward from local noon: the next descending crossing is this
  // evening's dusk and the next ascending crossing is tomorrow morning's dawn.
  const noon = localMeanTime(date, location.longitude, 12);
  return {
    civilDusk: searchSun(observer, -1, noon, CIVIL_TWILIGHT_DEG),
    nauticalDusk: searchSun(observer, -1, noon, NAUTICAL_TWILIGHT_DEG),
    astronomicalDusk: searchSun(observer, -1, noon, ASTRONOMICAL_TWILIGHT_DEG),
    astronomicalDawn: searchSun(observer, 1, noon, ASTRONOMICAL_TWILIGHT_DEG),
    nauticalDawn: searchSun(observer, 1, noon, NAUTICAL_TWILIGHT_DEG),
    civilDawn: searchSun(observer, 1, noon, CIVIL_TWILIGHT_DEG),
  };
}

/**
 * Twilight is defined by the Sun's geometric altitude, so the Sun is evaluated
 * without refraction ('normal' refraction still adds ~0.5° at -18°, which
 * would shift the crossing by ~3 minutes). The Moon keeps refraction.
 */
function bodyAltitude(body: Astronomy.Body, observer: Astronomy.Observer, time: Date) {
  const eq = Astronomy.Equator(body, time, observer, true, true);
  const refraction = body === Astronomy.Body.Sun ? undefined : 'normal';
  return { altitude: Astronomy.Horizon(time, observer, eq.ra, eq.dec, refraction).altitude, vector: eq.vec };
}

function moonEvent(observer: Astronomy.Observer, direction: 1 | -1, start: Date, end: Date): Date | null {
  const event = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, direction, start, 1)?.date ?? null;
  return event && event <= end ? event : null;
}

export function computeNightContext(location: ObserverLocation, date: Date): NightContext {
  const observer = toObserver(location);
  const { start, end } = sessionBounds(location, date);
  const steps = (SESSION_LENGTH_HOURS * 60) / SAMPLE_STEP_MINUTES;

  const times: Date[] = [];
  const rotations: Astronomy.RotationMatrix[] = [];
  const sunAltitudes: number[] = [];
  const moonAltitudes: number[] = [];
  const moonVectors: Astronomy.Vector[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = new Date(start.getTime() + i * SAMPLE_STEP_MINUTES * MINUTE_MS);
    times.push(t);
    rotations.push(Astronomy.Rotation_EQJ_EQD(t));
    sunAltitudes.push(bodyAltitude(Astronomy.Body.Sun, observer, t).altitude);
    const moon = bodyAltitude(Astronomy.Body.Moon, observer, t);
    moonAltitudes.push(moon.altitude);
    moonVectors.push(moon.vector);
  }

  const midSession = new Date((start.getTime() + end.getTime()) / 2);
  const moonIlluminationPct = Astronomy.Illumination(Astronomy.Body.Moon, midSession).phase_fraction * 100.0;

  return {
    location,
    observer,
    date,
    sessionStart: start,
    sessionEnd: end,
    twilight: computeTwilight(location, date),
    moonIlluminationPct,
    moonrise: moonEvent(observer, 1, start, end),
    moonset: moonEvent(observer, -1, start, end),
    times,
    rotations,
    sunAltitudes,
    moonAltitudes,
    moonVectors,
  };
}

/**
 * The Sun limit to plan against. AUTO prefers astronomical darkness and falls
 * back to nautical, then civil, twilight on nights the Sun never gets that low
 * (high-latitude summers), so the planner still has something to offer.
 */
export function resolveDarkLimit(ctx: NightContext, mode: DarknessMode): DarkLimit {
  if (mode === 'ASTRONOMICAL')
    return { level: 'ASTRONOMICAL', sunLimitDeg: ASTRONOMICAL_TWILIGHT_DEG, isFallback: false };
  if (mode === 'NAUTICAL') return { level: 'NAUTICAL', sunLimitDeg: NAUTICAL_TWILIGHT_DEG, isFallback: false };
  const lowestSun = Math.min(...ctx.sunAltitudes);
  if (lowestSun <= ASTRONOMICAL_TWILIGHT_DEG) {
    return { level: 'ASTRONOMICAL', sunLimitDeg: ASTRONOMICAL_TWILIGHT_DEG, isFallback: false };
  }
  if (lowestSun <= NAUTICAL_TWILIGHT_DEG) {
    return { level: 'NAUTICAL', sunLimitDeg: NAUTICAL_TWILIGHT_DEG, isFallback: true };
  }
  return { level: 'CIVIL', sunLimitDeg: CIVIL_TWILIGHT_DEG, isFallback: true };
}

/**
 * Separation the avoidance rule requires from a Moon of the given illuminated
 * fraction: ignored below 10%, 33° for a thin crescent, 60° at full Moon.
 */
export function moonSeparationRequiredDeg(illuminatedFraction: number): number {
  return illuminatedFraction < MOON_IGNORE_FRACTION ? 0 : 30 + 30 * illuminatedFraction;
}

/** Topocentric altitude/azimuth of a J2000 catalog position (refraction included). */
export function targetHorizon(
  dso: DSOObject,
  observer: Astronomy.Observer,
  time: Date,
  rotation?: Astronomy.RotationMatrix,
) {
  const ofDate = precessToDate(dso.raHours, dso.decDeg, time, rotation);
  const hor = Astronomy.Horizon(time, observer, ofDate.raHours, ofDate.decDeg, 'normal');
  return { altitude: hor.altitude, azimuth: hor.azimuth, ofDate };
}

function isShootable(sample: AltitudeSample, options: PlannerOptions, moonFraction: number): boolean {
  if (sample.sunAltitudeDeg > (options.sunLimitDeg ?? ASTRONOMICAL_TWILIGHT_DEG)) return false;
  if (sample.targetAltitudeDeg < options.minHorizonDeg) return false;
  if (
    options.avoidMoon &&
    sample.moonAltitudeDeg > 0 &&
    sample.moonSeparationDeg < moonSeparationRequiredDeg(moonFraction)
  ) {
    return false;
  }
  return true;
}

/** How much a sample is degraded by moonlight: illumination × closeness, 0 when the Moon is down. */
function moonPenaltyAt(sample: AltitudeSample, moonFraction: number): number {
  if (sample.moonAltitudeDeg <= 0) return 0;
  const closeness = Math.min(1, Math.max(0, 1 - (sample.moonSeparationDeg - 20) / 100));
  return moonFraction * closeness;
}

function sampleAt(ctx: NightContext, dso: DSOObject, time: Date, index?: number): AltitudeSample {
  const rotation = index === undefined ? undefined : ctx.rotations[index];
  const target = targetHorizon(dso, ctx.observer, time, rotation);
  let sunAlt: number;
  let moonAlt: number;
  let moonVec: Astronomy.Vector;
  if (index === undefined) {
    sunAlt = bodyAltitude(Astronomy.Body.Sun, ctx.observer, time).altitude;
    const moon = bodyAltitude(Astronomy.Body.Moon, ctx.observer, time);
    moonAlt = moon.altitude;
    moonVec = moon.vector;
  } else {
    sunAlt = ctx.sunAltitudes[index];
    moonAlt = ctx.moonAltitudes[index];
    moonVec = ctx.moonVectors[index];
  }
  return {
    time,
    targetAltitudeDeg: target.altitude,
    targetAzimuthDeg: target.azimuth,
    sunAltitudeDeg: sunAlt,
    moonAltitudeDeg: moonAlt,
    moonSeparationDeg: Astronomy.AngleBetween(moonVec, target.ofDate.vector),
  };
}

/** Indices [start, end] of the longest run of `true`, or null. */
function longestRun(flags: boolean[]): [number, number] | null {
  let best: [number, number] | null = null;
  for (let i = 0; i < flags.length;) {
    if (!flags[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < flags.length && flags[j + 1]) j++;
    if (!best || j - i > best[1] - best[0]) best = [i, j];
    i = j + 1;
  }
  return best;
}

/** Bisect the instant between a failing and a passing time to ~5 s. */
function bisect(pass: (t: Date) => boolean, outside: Date, inside: Date): Date {
  let a = outside.getTime();
  let b = inside.getTime();
  for (let i = 0; i < 7; i++) {
    const mid = (a + b) / 2;
    if (pass(new Date(mid))) b = mid;
    else a = mid;
  }
  return new Date(b);
}

/** Refined [start, end] instants of the longest run of passing samples. */
function refinedWindow(
  times: Date[],
  flags: boolean[],
  pass: (t: Date) => boolean,
): { start: Date | null; end: Date | null; minutes: number; run: [number, number] | null } {
  const run = longestRun(flags);
  if (!run) return { start: null, end: null, minutes: 0, run };
  const [i, j] = run;
  const start = i > 0 ? bisect(pass, times[i - 1], times[i]) : times[i];
  const end = j < times.length - 1 ? bisect(pass, times[j + 1], times[j]) : times[j];
  return { start, end, minutes: Math.round((end.getTime() - start.getTime()) / MINUTE_MS), run };
}

/** Upper transit (HA = 0h) nearest to the middle of the session. */
export function meridianTransit(ctx: NightContext, dso: DSOObject): Date {
  let t = new Date((ctx.sessionStart.getTime() + ctx.sessionEnd.getTime()) / 2);
  // Two passes so the transit uses the precessed RA of the transit instant itself.
  for (let pass = 0; pass < 2; pass++) {
    const ofDate = precessToDate(dso.raHours, dso.decDeg, t);
    const hourAngle = mod(localSiderealTime(t, ctx.location.longitude) - ofDate.raHours + 12.0, 24.0) - 12.0;
    t = new Date(t.getTime() - (hourAngle / SIDEREAL_RATE) * HOUR_MS);
  }
  return t;
}

export function computeTargetReport(
  ctx: NightContext,
  dso: DSOObject,
  options: PlannerOptions = DEFAULT_PLANNER_OPTIONS,
): NightWindowReport {
  const moonFraction = ctx.moonIlluminationPct / 100;
  const samples = ctx.times.map((t, i) => sampleAt(ctx, dso, t, i));
  const ok = samples.map((s) => isShootable(s, options, moonFraction));
  const window = refinedWindow(ctx.times, ok, (t) => isShootable(sampleAt(ctx, dso, t), options, moonFraction));

  const meridianTransitTime = meridianTransit(ctx, dso);
  const transitInSession = meridianTransitTime >= ctx.sessionStart && meridianTransitTime <= ctx.sessionEnd;

  let maxAltitudeDeg = Math.max(...samples.map((s) => s.targetAltitudeDeg));
  if (transitInSession) {
    maxAltitudeDeg = Math.max(maxAltitudeDeg, targetHorizon(dso, ctx.observer, meridianTransitTime).altitude);
  }

  // Moon figures only describe the shooting window (or the whole night when there is none).
  const windowSamples = window.run ? samples.slice(window.run[0], window.run[1] + 1) : samples;
  const moonUp = windowSamples.filter((s) => s.moonAltitudeDeg > 0);
  const minMoonSeparationDeg = moonUp.length ? Math.min(...moonUp.map((s) => s.moonSeparationDeg)) : null;
  const moonUpMinutesInWindow = window.run ? moonUp.length * SAMPLE_STEP_MINUTES : 0;
  const moonPenalty =
    windowSamples.reduce((sum, s) => sum + moonPenaltyAt(s, moonFraction), 0) / Math.max(1, windowSamples.length);
  const score = window.minutes * (1 - 0.6 * moonPenalty);

  const margin = FLIP_MARGIN_MINUTES * MINUTE_MS;
  const meridianFlipRequiredInWindow =
    !!window.start &&
    !!window.end &&
    meridianTransitTime.getTime() > window.start.getTime() + margin &&
    meridianTransitTime.getTime() < window.end.getTime() - margin;

  return {
    dso,
    date: ctx.date,
    sessionStart: ctx.sessionStart,
    sessionEnd: ctx.sessionEnd,
    astronomicalDusk: ctx.twilight.astronomicalDusk,
    astronomicalDawn: ctx.twilight.astronomicalDawn,
    twilight: ctx.twilight,
    meridianTransitTime,
    transitInSession,
    maxAltitudeDeg,
    moonIlluminationPct: ctx.moonIlluminationPct,
    minMoonSeparationDeg,
    moonUpMinutesInWindow,
    moonPenalty,
    score,
    sunLimitDeg: options.sunLimitDeg ?? ASTRONOMICAL_TWILIGHT_DEG,
    optimalStart: window.start,
    optimalEnd: window.end,
    totalShootableMinutes: window.minutes,
    meridianFlipRequiredInWindow,
    samples,
  };
}

/** Rank a catalog for one night: Moon-weighted usable time first, then highest altitude. */
export function rankTargets(
  ctx: NightContext,
  catalog: DSOObject[],
  options: PlannerOptions = DEFAULT_PLANNER_OPTIONS,
): NightWindowReport[] {
  return catalog
    .map((dso) => computeTargetReport(ctx, dso, options))
    .sort((a, b) => b.score - a.score || b.maxAltitudeDeg - a.maxAltitudeDeg);
}

/** Dark window, Moon events and the Moon-free part of the night. */
export function summarizeNight(ctx: NightContext, darkLimit: DarkLimit): NightSummary {
  const sunAltAt = (t: Date) => bodyAltitude(Astronomy.Body.Sun, ctx.observer, t).altitude;
  const moonAltAt = (t: Date) => bodyAltitude(Astronomy.Body.Moon, ctx.observer, t).altitude;
  const isDark = (t: Date) => sunAltAt(t) <= darkLimit.sunLimitDeg;

  const darkFlags = ctx.sunAltitudes.map((alt) => alt <= darkLimit.sunLimitDeg);
  const dark = refinedWindow(ctx.times, darkFlags, isDark);
  const moonFreeFlags = darkFlags.map((d, i) => d && ctx.moonAltitudes[i] <= 0);
  const moonFree = refinedWindow(ctx.times, moonFreeFlags, (t) => isDark(t) && moonAltAt(t) <= 0);

  return {
    date: ctx.date,
    sessionStart: ctx.sessionStart,
    sessionEnd: ctx.sessionEnd,
    darkLimit,
    darkStart: dark.start,
    darkEnd: dark.end,
    darkMinutes: dark.minutes,
    darkAllSession: darkFlags.every(Boolean),
    moonIlluminationPct: ctx.moonIlluminationPct,
    moonrise: ctx.moonrise,
    moonset: ctx.moonset,
    moonFreeStart: moonFree.start,
    moonFreeEnd: moonFree.end,
    moonFreeMinutes: moonFree.minutes,
  };
}

/** One summary per night for `nights` evenings starting at `firstDate` (device-local dates). */
export function darkSkyCalendar(
  location: ObserverLocation,
  firstDate: Date,
  nights: number,
  mode: DarknessMode,
): NightSummary[] {
  const out: NightSummary[] = [];
  for (let n = 0; n < nights; n++) {
    const date = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate() + n);
    const ctx = computeNightContext(location, date);
    out.push(summarizeNight(ctx, resolveDarkLimit(ctx, mode)));
  }
  return out;
}

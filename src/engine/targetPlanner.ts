import * as Astronomy from 'astronomy-engine';

import type {
  AltitudeSample,
  DSOObject,
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
export const MOON_AVOIDANCE_SEPARATION_DEG = 45.0;
export const FLIP_MARGIN_MINUTES = 15;

export interface PlannerOptions {
  minHorizonDeg: number;
  /** Also require the Moon to be set or at least 45° away from the target. */
  avoidMoon: boolean;
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

/** Before local noon the "current session" is the night that started yesterday evening. */
export function sessionDateFor(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (now.getHours() < 12) d.setDate(d.getDate() - 1);
  return d;
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
    civilDusk: searchSun(observer, -1, noon, -6),
    nauticalDusk: searchSun(observer, -1, noon, -12),
    astronomicalDusk: searchSun(observer, -1, noon, ASTRONOMICAL_TWILIGHT_DEG),
    astronomicalDawn: searchSun(observer, 1, noon, ASTRONOMICAL_TWILIGHT_DEG),
    nauticalDawn: searchSun(observer, 1, noon, -12),
    civilDawn: searchSun(observer, 1, noon, -6),
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
    times,
    rotations,
    sunAltitudes,
    moonAltitudes,
    moonVectors,
  };
}

/** Topocentric altitude/azimuth of a J2000 catalog position (refraction included). */
export function targetHorizon(dso: DSOObject, observer: Astronomy.Observer, time: Date, rotation?: Astronomy.RotationMatrix) {
  const ofDate = precessToDate(dso.raHours, dso.decDeg, time, rotation);
  const hor = Astronomy.Horizon(time, observer, ofDate.raHours, ofDate.decDeg, 'normal');
  return { altitude: hor.altitude, azimuth: hor.azimuth, ofDate };
}

function isShootable(sample: AltitudeSample, options: PlannerOptions): boolean {
  if (sample.sunAltitudeDeg > ASTRONOMICAL_TWILIGHT_DEG) return false;
  if (sample.targetAltitudeDeg < options.minHorizonDeg) return false;
  if (options.avoidMoon && sample.moonAltitudeDeg > 0 && sample.moonSeparationDeg < MOON_AVOIDANCE_SEPARATION_DEG) {
    return false;
  }
  return true;
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

/** Bisect the instant between a non-shootable and a shootable time to ~5 s. */
function refineEdge(ctx: NightContext, dso: DSOObject, options: PlannerOptions, outside: Date, inside: Date): Date {
  let a = outside.getTime();
  let b = inside.getTime();
  for (let i = 0; i < 7; i++) {
    const mid = (a + b) / 2;
    if (isShootable(sampleAt(ctx, dso, new Date(mid)), options)) b = mid;
    else a = mid;
  }
  return new Date(b);
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
  const samples = ctx.times.map((t, i) => sampleAt(ctx, dso, t, i));
  const ok = samples.map((s) => isShootable(s, options));

  // Longest contiguous run of shootable samples.
  let bestStart = -1;
  let bestEnd = -1;
  for (let i = 0; i < ok.length; ) {
    if (!ok[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < ok.length && ok[j + 1]) j++;
    if (bestStart < 0 || j - i > bestEnd - bestStart) {
      bestStart = i;
      bestEnd = j;
    }
    i = j + 1;
  }

  let optimalStart: Date | null = null;
  let optimalEnd: Date | null = null;
  if (bestStart >= 0) {
    optimalStart =
      bestStart > 0 ? refineEdge(ctx, dso, options, ctx.times[bestStart - 1], ctx.times[bestStart]) : ctx.times[bestStart];
    optimalEnd =
      bestEnd < ok.length - 1 ? refineEdge(ctx, dso, options, ctx.times[bestEnd + 1], ctx.times[bestEnd]) : ctx.times[bestEnd];
  }
  const totalShootableMinutes =
    optimalStart && optimalEnd ? Math.round((optimalEnd.getTime() - optimalStart.getTime()) / MINUTE_MS) : 0;

  const meridianTransitTime = meridianTransit(ctx, dso);
  const transitInSession =
    meridianTransitTime >= ctx.sessionStart && meridianTransitTime <= ctx.sessionEnd;

  let maxAltitudeDeg = Math.max(...samples.map((s) => s.targetAltitudeDeg));
  if (transitInSession) {
    maxAltitudeDeg = Math.max(maxAltitudeDeg, targetHorizon(dso, ctx.observer, meridianTransitTime).altitude);
  }

  const windowSamples =
    optimalStart && optimalEnd
      ? samples.filter((s) => s.time >= optimalStart! && s.time <= optimalEnd!)
      : samples;
  const minMoonSeparationDeg = Math.min(...(windowSamples.length ? windowSamples : samples).map((s) => s.moonSeparationDeg));

  const margin = FLIP_MARGIN_MINUTES * MINUTE_MS;
  const meridianFlipRequiredInWindow =
    !!optimalStart &&
    !!optimalEnd &&
    meridianTransitTime.getTime() > optimalStart.getTime() + margin &&
    meridianTransitTime.getTime() < optimalEnd.getTime() - margin;

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
    optimalStart,
    optimalEnd,
    totalShootableMinutes,
    meridianFlipRequiredInWindow,
    samples,
  };
}

/** Rank a catalog for one night: longest dark window first, then highest altitude. */
export function rankTargets(
  ctx: NightContext,
  catalog: DSOObject[],
  options: PlannerOptions = DEFAULT_PLANNER_OPTIONS,
): NightWindowReport[] {
  return catalog
    .map((dso) => computeTargetReport(ctx, dso, options))
    .sort((a, b) => b.totalShootableMinutes - a.totalShootableMinutes || b.maxAltitudeDeg - a.maxAltitudeDeg);
}

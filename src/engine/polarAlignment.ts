import * as Astronomy from 'astronomy-engine';

import type { Hemisphere, ObserverLocation, PolarAlignmentState, ReticleStar } from '@/types/astro';
import { localSiderealTime, mod, precessToDate } from './coords';

/** Radius of the simulated polar-scope field, in degrees from the celestial pole. */
export const RETICLE_FOV_RADIUS_DEG = 7.0;

interface CatalogStar {
  name: string;
  raHours: number; // J2000
  decDeg: number; // J2000
  mag: number;
}

export const POLARIS: CatalogStar = { name: 'Polaris', raHours: 2.5303, decDeg: 89.26411, mag: 1.98 };

export const OCTANS_STARS: CatalogStar[] = [
  { name: 'σ Oct', raHours: 21.1461, decDeg: -88.9564, mag: 5.4 },
  { name: 'χ Oct', raHours: 18.9128, decDeg: -87.6058, mag: 5.3 },
  { name: 'τ Oct', raHours: 23.4678, decDeg: -87.4822, mag: 5.5 },
  { name: 'υ Oct', raHours: 22.6289, decDeg: -85.9672, mag: 5.8 },
];

export function hemisphereFor(latitudeDeg: number): Hemisphere {
  return latitudeDeg >= 0 ? 'NORTH' : 'SOUTH';
}

/**
 * Clockwise angle (degrees from the top of the reticle) at which a star with the
 * given local hour angle appears around the celestial pole.
 *
 * Naked eye, facing the pole: the northern sky turns counter-clockwise, the
 * southern sky clockwise, and a star at HA = 0h sits directly above the pole.
 * A refracting polar scope has no diagonal, so its image is simply rotated 180°.
 */
export function reticleAngleDeg(hourAngleHours: number, hemisphere: Hemisphere, inverted: boolean): number {
  const diurnal = hemisphere === 'NORTH' ? -15.0 * hourAngleHours : 15.0 * hourAngleHours;
  return mod(diurnal + (inverted ? 180.0 : 0.0), 360.0);
}

/** "HH:MM" on a 12-hour dial with 12 at the top (0° → "12:00", 90° → "03:00"). */
export function clockStringFromAngle(angleDeg: number): string {
  const totalMinutes = Math.round((mod(angleDeg, 360.0) / 30.0) * 60.0) % 720;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h === 0 ? 12 : h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface StarPlacement {
  hourAngleHours: number;
  polarDistanceDeg: number;
  angleDeg: number;
  x: number;
  y: number;
}

function placeStar(
  star: CatalogStar,
  date: Date,
  lastHours: number,
  hemisphere: Hemisphere,
  inverted: boolean,
  rotation: Astronomy.RotationMatrix,
): StarPlacement {
  const ofDate = precessToDate(star.raHours, star.decDeg, date, rotation);
  const hourAngleHours = mod(lastHours - ofDate.raHours, 24.0);
  const polarDistanceDeg = 90.0 - Math.abs(ofDate.decDeg);
  const angleDeg = reticleAngleDeg(hourAngleHours, hemisphere, inverted);
  const r = polarDistanceDeg / RETICLE_FOV_RADIUS_DEG;
  const a = (angleDeg * Math.PI) / 180.0;
  return { hourAngleHours, polarDistanceDeg, angleDeg, x: r * Math.sin(a), y: r * Math.cos(a) };
}

export function computePolarAlignment(location: ObserverLocation, date: Date, inverted = true): PolarAlignmentState {
  const hemisphere = hemisphereFor(location.latitude);
  const lastHours = localSiderealTime(date, location.longitude);
  const rotation = Astronomy.Rotation_EQJ_EQD(date);

  if (hemisphere === 'NORTH') {
    const polaris = placeStar(POLARIS, date, lastHours, hemisphere, inverted, rotation);
    return {
      timestamp: date,
      hemisphere,
      localSiderealTimeHours: lastHours,
      targetStarName: 'Polaris',
      inverted,
      hourAngleHours: polaris.hourAngleHours,
      clockFaceAngleDeg: polaris.angleDeg,
      clockFaceString: clockStringFromAngle(polaris.angleDeg),
      poleStarOffsetDeg: polaris.polarDistanceDeg,
      octansRotationDeg: 0,
      octansStarsScreenCoords: [],
    };
  }

  const placements = OCTANS_STARS.map((star) => placeStar(star, date, lastHours, hemisphere, inverted, rotation));
  const sigma = placements[0];
  const stars: ReticleStar[] = placements.map((p, i) => ({
    name: OCTANS_STARS[i].name,
    mag: OCTANS_STARS[i].mag,
    x: p.x,
    y: p.y,
  }));

  return {
    timestamp: date,
    hemisphere,
    localSiderealTimeHours: lastHours,
    targetStarName: 'Sigma Octantis (Octans)',
    inverted,
    hourAngleHours: sigma.hourAngleHours,
    clockFaceAngleDeg: sigma.angleDeg,
    clockFaceString: clockStringFromAngle(sigma.angleDeg),
    poleStarOffsetDeg: sigma.polarDistanceDeg,
    octansRotationDeg: sigma.angleDeg,
    octansStarsScreenCoords: stars,
  };
}

/** Sidereal time formatted as "HH:MM:SS". */
export function formatSiderealTime(hours: number): string {
  const totalSeconds = Math.floor(mod(hours, 24.0) * 3600.0);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

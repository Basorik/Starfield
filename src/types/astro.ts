export type Hemisphere = 'NORTH' | 'SOUTH';
export type ReticleType = 'SW_CLOCK' | 'OCTANS_TRAPEZOID' | 'IOPTRON';

export interface ObserverLocation {
  latitude: number; // Decimal degrees (-90 to +90, negative = South)
  longitude: number; // Decimal degrees (-180 to +180, positive = East)
  elevationMeters: number;
  isManualOverride: boolean;
  label?: string; // e.g., "Coonabarabran, NSW" or "GPS Live"
}

export interface ReticleStar {
  name: string;
  mag: number;
  x: number; // Normalized reticle coordinates (-1.0 to 1.0), +x = right
  y: number; // +y = up (toward the top of the reticle)
}

export interface PolarAlignmentState {
  timestamp: Date;
  hemisphere: Hemisphere;
  localSiderealTimeHours: number; // 0.0 to 24.0
  targetStarName: 'Polaris' | 'Sigma Octantis (Octans)';
  inverted: boolean; // true = view through an erecting-less (inverting) polar scope
  // Hour angle of the pole star (Polaris in the north, Sigma Octantis in the south)
  hourAngleHours: number; // 0.0 to 24.0
  clockFaceAngleDeg: number; // 0 to 360 deg, clockwise from 12 o'clock (top of reticle)
  clockFaceString: string; // e.g., "04:42" on the 12-hour polar reticle ring
  poleStarOffsetDeg: number; // Angular distance of the pole star from the celestial pole
  // Southern Hemisphere (4-Star Octans asterism: Sigma, Chi, Tau, Upsilon Octantis)
  octansRotationDeg: number; // Clockwise rotation of the trapezoid vs. its reference pose (sigma at 12 o'clock)
  octansStarsScreenCoords: ReticleStar[];
}

export type DSOType = 'Nebula' | 'Galaxy' | 'Cluster' | 'Widefield' | 'Dark Nebula';

export interface DSOObject {
  id: string; // e.g., "NGC 3372", "M42", "Rho Ophiuchi"
  commonName: string; // e.g., "Carina Nebula", "Orion Nebula"
  type: DSOType;
  constellation: string;
  raHours: number; // Right Ascension J2000 in decimal hours (0 to 24)
  decDeg: number; // Declination J2000 in decimal degrees (-90 to +90)
  sizeArcmin: number; // Major axis angular size in arcminutes
  magnitude: number;
  recommendedFocalLengthMm: [number, number]; // e.g., [50, 200] for APS-C
  hemisphereBias: 'SOUTH' | 'NORTH' | 'BOTH';
  isCustom?: boolean;
}

export interface AltitudeSample {
  time: Date;
  targetAltitudeDeg: number;
  targetAzimuthDeg: number;
  moonAltitudeDeg: number;
  sunAltitudeDeg: number;
  moonSeparationDeg: number; // Angular separation between target and Moon
}

export interface TwilightTimes {
  civilDusk: Date | null; // Sun below -6°
  nauticalDusk: Date | null; // Sun below -12°
  astronomicalDusk: Date | null; // Sun below -18°
  astronomicalDawn: Date | null; // Sun above -18°
  nauticalDawn: Date | null;
  civilDawn: Date | null;
}

export interface NightWindowReport {
  dso: DSOObject;
  date: Date;
  sessionStart: Date;
  sessionEnd: Date;
  astronomicalDusk: Date | null; // Sun passes below -18°
  astronomicalDawn: Date | null; // Sun rises above -18°
  twilight: TwilightTimes;
  meridianTransitTime: Date; // Upper transit (Hour Angle = 0) nearest the middle of the night
  transitInSession: boolean;
  maxAltitudeDeg: number; // Highest altitude reached during the session
  moonIlluminationPct: number; // 0 to 100%
  minMoonSeparationDeg: number;
  // Longest contiguous window where Sun <= -18° AND Target Altitude >= minHorizonDeg (+ optional Moon rule)
  optimalStart: Date | null;
  optimalEnd: Date | null;
  totalShootableMinutes: number;
  meridianFlipRequiredInWindow: boolean;
  samples: AltitudeSample[]; // 10-minute interval samples across the session
}

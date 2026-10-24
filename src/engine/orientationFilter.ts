import type { Vec3 } from './poleFinder';
import type { Mat3 } from './skyView';

/**
 * Re-orthonormalize a world→device matrix (rows are the device x, y, z axes in
 * world coordinates) with Gram–Schmidt, keeping the camera axis (row z) exact.
 */
export function orthonormalize(m: Mat3): Mat3 {
  let [zx, zy, zz] = [m[6], m[7], m[8]];
  let n = Math.hypot(zx, zy, zz) || 1;
  [zx, zy, zz] = [zx / n, zy / n, zz / n];
  let [yx, yy, yz] = [m[3], m[4], m[5]];
  const d = yx * zx + yy * zy + yz * zz;
  [yx, yy, yz] = [yx - d * zx, yy - d * zy, yz - d * zz];
  n = Math.hypot(yx, yy, yz) || 1;
  [yx, yy, yz] = [yx / n, yy / n, yz / n];
  // x = y × z keeps the frame right-handed.
  const [xx, xy, xz] = [yy * zz - yz * zy, yz * zx - yx * zz, yx * zy - yy * zx];
  return [xx, xy, xz, yx, yy, yz, zx, zy, zz];
}

/**
 * Rotate the world→device matrix by a gyroscope reading `omega` (rad/s, device
 * axes, right-hand rule) over `dt` seconds: B' = (I − [ω dt]×) B.
 */
export function integrateGyro(b: Mat3, omega: Vec3, dt: number): Mat3 {
  const [ax, ay, az] = [omega.x * dt, omega.y * dt, omega.z * dt];
  const out: number[] = [];
  for (let col = 0; col < 3; col++) {
    const [r0, r1, r2] = [b[col], b[3 + col], b[6 + col]];
    // (I − [a]×) r = r − a × r
    out[col] = r0 - (ay * r2 - az * r1);
    out[3 + col] = r1 - (az * r0 - ax * r2);
    out[6 + col] = r2 - (ax * r1 - ay * r0);
  }
  return orthonormalize(out as unknown as Mat3);
}

/** Move `b` a fraction `k` (0–1) of the way towards `target`, then re-orthonormalize. */
export function blendTowards(b: Mat3, target: Mat3, k: number): Mat3 {
  return orthonormalize(b.map((v, i) => v + k * (target[i] - v)) as unknown as Mat3);
}

/** Largest change between two orientations, roughly in radians (for small differences). */
export function orientationDelta(a: Mat3, b: Mat3): number {
  let max = 0;
  for (let i = 0; i < 9; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
  return max;
}

/**
 * Complementary filter: the gyroscope carries the orientation smoothly and with
 * no lag; the accelerometer + magnetometer estimate pulls it back slowly so
 * gyro drift never builds up and north stays right. Without a gyroscope it
 * degrades to a smoothed accelerometer + magnetometer reading.
 */
export class OrientationFilter {
  basis: Mat3 | null = null;
  private lastGyroT: number | null = null;
  private lastMeasureT: number | null = null;

  constructor(
    /** Seconds for the sensor estimate to win back a disagreement with the gyro. */
    private readonly correctionSeconds = 0.6,
    /** Smoothing time constant when there is no gyroscope. */
    private readonly noGyroSeconds = 0.25,
    private hasGyro = false,
  ) {}

  gyro(omega: Vec3, t: number) {
    this.hasGyro = true;
    if (this.basis && this.lastGyroT !== null) {
      const dt = t - this.lastGyroT;
      if (dt > 0 && dt < 0.2) this.basis = integrateGyro(this.basis, omega, dt);
    }
    this.lastGyroT = t;
  }

  measurement(measured: Mat3, t: number) {
    if (!this.basis) {
      this.basis = measured;
      this.lastMeasureT = t;
      return;
    }
    const dt = Math.min(0.2, Math.max(0, this.lastMeasureT === null ? 0 : t - this.lastMeasureT));
    this.lastMeasureT = t;
    const tau = this.hasGyro ? this.correctionSeconds : this.noGyroSeconds;
    // A large disagreement (startup, or the gyro lost track) snaps rather than drifting slowly.
    const k = orientationDelta(this.basis, measured) > 0.5 ? 1 : 1 - Math.exp(-dt / tau);
    this.basis = blendTowards(this.basis, measured, k);
  }
}

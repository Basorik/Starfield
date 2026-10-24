import { describe, expect, it } from 'vitest';

import { OrientationFilter, integrateGyro, orientationDelta, orthonormalize } from '../orientationFilter';
import { cameraDirection, deviceBasis, enuToAzAlt, type Mat3 } from '../skyView';
import { simulate } from './sensorSim';

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const basisAt = (az: number, alt: number, roll = 0) => {
  const { up, magnetic } = simulate(az, alt, roll, -60);
  return deviceBasis(up, magnetic)!;
};
const camera = (b: Mat3) => enuToAzAlt(cameraDirection(b));

describe('gyro integration', () => {
  it('keeps the matrix orthonormal', () => {
    const m = orthonormalize([1, 0.1, 0, 0.05, 1, 0.02, 0, 0.03, 1]);
    const row = (i: number) => [m[i * 3], m[i * 3 + 1], m[i * 3 + 2]];
    for (let i = 0; i < 3; i++) {
      expect(Math.hypot(...row(i))).toBeCloseTo(1, 12);
      for (let j = i + 1; j < 3; j++) {
        const [a, b] = [row(i), row(j)];
        expect(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]).toBeCloseTo(0, 12);
      }
    }
  });

  it('turning an upright phone about its own y axis swings the camera left', () => {
    let b = basisAt(180, 0);
    const rate = (30 * Math.PI) / 180; // 30°/s
    for (let i = 0; i < 100; i++) b = integrateGyro(b, { x: 0, y: rate, z: 0 }, 0.01); // 1 s
    expect(angleDiff(camera(b).azimuthDeg, 150)).toBeLessThan(0.05);
    expect(camera(b).altitudeDeg).toBeCloseTo(0, 3);
    expect(orientationDelta(b, basisAt(150, 0))).toBeLessThan(1e-3);
  });

  it('tilting about the x axis raises the camera', () => {
    let b = basisAt(180, 20);
    const rate = (10 * Math.PI) / 180;
    for (let i = 0; i < 100; i++) b = integrateGyro(b, { x: rate, y: 0, z: 0 }, 0.01);
    expect(camera(b).altitudeDeg).toBeCloseTo(30, 1);
    expect(angleDiff(camera(b).azimuthDeg, 180)).toBeLessThan(0.05);
  });
});

describe('complementary filter', () => {
  it('starts from the first sensor estimate', () => {
    const f = new OrientationFilter();
    f.measurement(basisAt(120, 30), 0);
    expect(orientationDelta(f.basis!, basisAt(120, 30))).toBeLessThan(1e-12);
  });

  it('rejects magnetometer jitter while the phone is still', () => {
    const f = new OrientationFilter();
    const truth = basisAt(180, 34);
    f.measurement(truth, 0);
    let worst = 0;
    for (let i = 1; i <= 500; i++) {
      const t = i * 0.02;
      f.gyro({ x: 0, y: 0, z: 0 }, t);
      // ±3° of compass noise on every reading.
      f.measurement(basisAt(180 + (i % 2 ? 3 : -3), 34), t);
      worst = Math.max(worst, angleDiff(camera(f.basis!).azimuthDeg, 180));
    }
    expect(worst).toBeLessThan(0.3);
  });

  it('follows real motion from the gyro immediately and removes drift over time', () => {
    const f = new OrientationFilter();
    f.measurement(basisAt(180, 0), 0);
    const rate = (45 * Math.PI) / 180;
    // Turn 45° left in 1 s; the compass estimate tracks the true heading.
    for (let i = 1; i <= 50; i++) {
      const t = i * 0.02;
      f.gyro({ x: 0, y: rate, z: 0 }, t);
      f.measurement(basisAt(180 - 45 * (i / 50), 0), t);
    }
    expect(angleDiff(camera(f.basis!).azimuthDeg, 135)).toBeLessThan(0.5);

    // A biased gyro (0.5°/s drift) while still: the compass keeps it within a degree.
    const bias = (0.5 * Math.PI) / 180;
    for (let i = 51; i <= 1550; i++) {
      const t = i * 0.02;
      f.gyro({ x: 0, y: bias, z: 0 }, t);
      f.measurement(basisAt(135, 0), t);
    }
    expect(angleDiff(camera(f.basis!).azimuthDeg, 135)).toBeLessThan(1);
  });
});

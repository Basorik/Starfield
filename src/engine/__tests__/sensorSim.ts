import type { Vec3 } from '../poleFinder';

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

/**
 * Sensor readings (device axes) for a phone whose back camera points at true
 * (az, alt), rolled by `rollDeg` about the camera axis. The magnetic field dips
 * by `dipDeg` and its horizontal part points to true azimuth `declinationDeg`.
 */
export function simulate(azDeg: number, altDeg: number, rollDeg: number, dipDeg: number, declinationDeg = 0) {
  const cam = {
    x: Math.sin(azDeg * D2R) * Math.cos(altDeg * D2R),
    y: Math.cos(azDeg * D2R) * Math.cos(altDeg * D2R),
    z: Math.sin(altDeg * D2R),
  };
  const z = { x: -cam.x, y: -cam.y, z: -cam.z }; // device +z (out of the screen)
  const upW = { x: 0, y: 0, z: 1 };
  let y = unit({ x: upW.x - dot(upW, z) * z.x, y: upW.y - dot(upW, z) * z.y, z: upW.z - dot(upW, z) * z.z });
  let x = cross(y, z);
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
  const d = declinationDeg * D2R;
  const h = Math.cos(dipDeg * D2R);
  const field = { x: Math.sin(d) * h, y: Math.cos(d) * h, z: -Math.sin(dipDeg * D2R) };
  return { up: toDevice(upW), magnetic: toDevice(field) };
}

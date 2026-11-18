// Seeded mulberry32 RNG (the starter's exact algorithm): same seed => same city, same traffic,
// same autopilot, same screenshot frame every time.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Range helpers on top of createRandom.
export function randomNumber(random, min, max) { return min + random() * (max - min); }
export function randomInt(random, min, max) { return min + Math.floor(random() * (max - min + 1)); }
export function pick(random, choices) { return choices[randomInt(random, 0, choices.length - 1)]; }

export const ZERO = { x: 0, y: 0, z: 0 };
export function vector(x, y, z) { return { x: x === undefined ? 0 : x, y: y === undefined ? 0 : y, z: z === undefined ? 0 : z }; }
export function add(out, a, b) { out.x = a.x + b.x; out.y = a.y + b.y; out.z = a.z + b.z; return out; }
export function sub(out, a, b) { out.x = a.x - b.x; out.y = a.y - b.y; out.z = a.z - b.z; return out; }
export function scale(out, v, s) { out.x = v.x * s; out.y = v.y * s; out.z = v.z * s; return out; }
export function length(v) { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }
export function sqLength(v) { return v.x * v.x + v.y * v.y + v.z * v.z; }
export function normalize(out, v) {
  const l = length(v);
  if (l === 0) { out.x = 0; out.y = 0; out.z = 1; return out; }
  const inv = 1 / l; out.x = v.x * inv; out.y = v.y * inv; out.z = v.z * inv; return out;
}
export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function cross(out, a, b) {
  out.x = a.y * b.z - a.z * b.y;
  out.y = a.z * b.x - a.x * b.z;
  out.z = a.x * b.y - a.y * b.x;
  return out;
}
export function rotateVector(v, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: v.x * c - v.z * s, y: v.y, z: v.x * s + v.z * c };
}
// Yaw from a forward unit vector on the XZ plane: angle from +Z toward -X, degrees.
export function yawOf(v) { return (Math.atan2(-v.x, v.z) * 180) / Math.PI; }

export function rdist2(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz;
}

// Circle-rectangle (axis-aligned in XZ) overlap for player/ped circles vs cars and roads.
export function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  const dx = cx - closestX, dz = cy - closestY;
  return dx * dx + dz * dz <= r * r;
}

import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function wrapAngle(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }

export function rng(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rand = rng(20261021);
export const rr = (a, b) => a + (b - a) * rand();
export const pick = arr => arr[Math.floor(rand() * arr.length) % arr.length];

// ---------- value noise ----------
function hash(ix, iy) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 2 - 1;
}
export function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

// ---------- curves ----------
export function catmull(points, closed, step = 1) {
  const out = [];
  const n = points.length;
  const P = i => (closed ? points[(i + n) % n] : points[clamp(i, 0, n - 1)]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(2, Math.ceil(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(points[n - 1].slice());
  return out;
}
export function polyLength(pts, closed) {
  let L = 0;
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return L;
}
// closest point on polyline: returns {d, x, z, i, t, s} (s = arc length)
export function polyNearest(pts, x, z, closed) {
  let best = { d: 1e9, x: 0, z: 0, i: 0, t: 0, s: 0 };
  let acc = 0;
  const n = pts.length - (closed ? 0 : 1);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L2 = dx * dx + dz * dz || 1e-9;
    let t = ((x - a[0]) * dx + (z - a[1]) * dz) / L2;
    t = clamp(t, 0, 1);
    const px = a[0] + dx * t, pz = a[1] + dz * t;
    const d = Math.hypot(x - px, z - pz);
    const L = Math.sqrt(L2);
    if (d < best.d) best = { d, x: px, z: pz, i, t, s: acc + t * L };
    acc += L;
  }
  return best;
}

// ---------- colors ----------
const _c = new THREE.Color();
export function col(hex) { return new THREE.Color(hex); }
// returns linear rgb array of an sRGB hex, optionally jittered in brightness
export function lin(hex, jitter = 0) {
  _c.set(hex);
  if (jitter) { const f = 1 + (rand() - 0.5) * 2 * jitter; _c.r *= f; _c.g *= f; _c.b *= f; }
  return [_c.r, _c.g, _c.b];
}
export function mixc(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

// ---------- distance field on a grid ----------
export class Field {
  constructor(min, max, res, init = 1e9) {
    this.min = min; this.res = res;
    this.n = Math.round((max - min) / res) + 1;
    this.a = new Float32Array(this.n * this.n).fill(init);
  }
  // splat distance to a segment set within radius rad
  segments(pts, closed, rad) {
    const { n, res, min, a } = this;
    const m = pts.length - (closed ? 0 : 1);
    for (let i = 0; i < m; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const x0 = Math.min(p[0], q[0]) - rad, x1 = Math.max(p[0], q[0]) + rad;
      const z0 = Math.min(p[1], q[1]) - rad, z1 = Math.max(p[1], q[1]) + rad;
      const i0 = clamp(Math.floor((x0 - min) / res), 0, n - 1), i1 = clamp(Math.ceil((x1 - min) / res), 0, n - 1);
      const j0 = clamp(Math.floor((z0 - min) / res), 0, n - 1), j1 = clamp(Math.ceil((z1 - min) / res), 0, n - 1);
      const dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz || 1e-9;
      for (let j = j0; j <= j1; j++) {
        const z = min + j * res;
        for (let k = i0; k <= i1; k++) {
          const x = min + k * res;
          const t = clamp(((x - p[0]) * dx + (z - p[1]) * dz) / L2, 0, 1);
          const d = Math.hypot(x - p[0] - dx * t, z - p[1] - dz * t);
          const idx = j * n + k;
          if (d < a[idx]) a[idx] = d;
        }
      }
    }
  }
  circle(cx, cz, r, rad) {
    const { n, res, min, a } = this;
    const i0 = clamp(Math.floor((cx - r - rad - min) / res), 0, n - 1), i1 = clamp(Math.ceil((cx + r + rad - min) / res), 0, n - 1);
    const j0 = clamp(Math.floor((cz - r - rad - min) / res), 0, n - 1), j1 = clamp(Math.ceil((cz + r + rad - min) / res), 0, n - 1);
    for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) {
      const d = Math.max(0, Math.hypot(min + k * res - cx, min + j * res - cz) - r);
      const idx = j * n + k;
      if (d < a[idx]) a[idx] = d;
    }
  }
  // oriented box footprint (center, half sizes, rotation)
  box(cx, cz, hx, hz, rot, rad) {
    const { n, res, min, a } = this;
    const R = Math.hypot(hx, hz) + rad;
    const c = Math.cos(rot), s = Math.sin(rot);
    const i0 = clamp(Math.floor((cx - R - min) / res), 0, n - 1), i1 = clamp(Math.ceil((cx + R - min) / res), 0, n - 1);
    const j0 = clamp(Math.floor((cz - R - min) / res), 0, n - 1), j1 = clamp(Math.ceil((cz + R - min) / res), 0, n - 1);
    for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) {
      const x = min + k * res - cx, z = min + j * res - cz;
      const lx = x * c + z * s, lz = -x * s + z * c;
      const qx = Math.max(0, Math.abs(lx) - hx), qz = Math.max(0, Math.abs(lz) - hz);
      const d = Math.hypot(qx, qz);
      const idx = j * n + k;
      if (d < a[idx]) a[idx] = d;
    }
  }
  get(x, z) {
    const { n, res, min, a } = this;
    let fx = (x - min) / res, fz = (z - min) / res;
    if (fx < 0 || fz < 0 || fx > n - 1.001 || fz > n - 1.001) return 1e9;
    const i = Math.floor(fx), j = Math.floor(fz);
    fx -= i; fz -= j;
    const i00 = j * n + i;
    const v00 = a[i00], v10 = a[i00 + 1], v01 = a[i00 + n], v11 = a[i00 + n + 1];
    return (v00 * (1 - fx) + v10 * fx) * (1 - fz) + (v01 * (1 - fx) + v11 * fx) * fz;
  }
}

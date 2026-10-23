// Bridges, jump ramps and static colliders for decor.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Builder, Chunked, mesh, T, Tmul } from './builder.js';
import { M } from './materials.js';
import { lin, mixc, rand, TAU } from './util.js';
import { BRIDGES, DECK_Y, heightAt, RAMPS, RING } from './layout.js';
import { textGeo } from './zones.js';
import { TREES } from './decor.js';

const WOOD = [0xB98257, 0xA8714A, 0xC7926A, 0xB27A50].map(h => lin(h));
const STONE = [0xC9C1D6, 0xB7AEC8, 0xD6CFE0].map(h => lin(h));
export const rbox = (w, h, d, r = 0.06, s = 1) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));

function wedgeGeo(w, h, L) {
  // ramp rising toward local -z; top face carries chevron stripes via vertex colours
  const g = new THREE.BufferGeometry();
  const x0 = -w / 2, x1 = w / 2, zb = L / 2, zf = -L / 2;
  const P = [], C = [];
  const wood = lin(0xC28A5C), dark = lin(0x8E5E3E), stripeA = lin(0xFFC857), stripeB = lin(0x1E2340);
  const quad = (a, b, c, d, col) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); for (let i = 0; i < 6; i++) C.push(...(typeof col === 'function' ? col(i) : col)); };
  // top: split into stripes along the length
  const N = 8;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const za = zb + (zf - zb) * t0, zc = zb + (zf - zb) * t1, ya = h * t0, yc = h * t1;
    const col = i === N - 1 ? stripeA : (i % 2 ? wood : mixc(wood, [1, 1, 1], 0.12));
    quad([x0, ya, za], [x1, ya, za], [x1, yc, zc], [x0, yc, zc], col);
  }
  // front (high) face with stripes
  quad([x1, 0, zf], [x0, 0, zf], [x0, h, zf], [x1, h, zf], stripeB);
  // sides
  P.push(x0, 0, zb, x0, h, zf, x0, 0, zf); for (let i = 0; i < 3; i++) C.push(...dark);
  P.push(x1, 0, zb, x1, 0, zf, x1, h, zf); for (let i = 0; i < 3; i++) C.push(...dark);
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}

export function buildStructures(scene, phys) {
  const b = new Chunked({}, 30);
  // ---------- bridges ----------
  for (const br of BRIDGES) {
    const base = T(br.x, 0, br.z, 0, br.yaw, 0);
    const half = br.len / 2, w = br.w;
    // planks
    const n = Math.round(br.len / 0.62);
    for (let i = 0; i < n; i++) {
      const z = -half + (i + 0.5) * (br.len / n);
      b.add(rbox(w, 0.16, br.len / n - 0.06, 0.03), Tmul(base, T(0, DECK_Y - 0.08, z)), WOOD[i % WOOD.length]);
    }
    // beams under
    for (const x of [-w / 2 + 0.4, w / 2 - 0.4]) b.add(rbox(0.3, 0.4, br.len + 0.4, 0.05), Tmul(base, T(x, DECK_Y - 0.36, 0)), lin(0x7C5034));
    // rails
    for (const s of [-1, 1]) {
      const x = s * (w / 2 + 0.05);
      const posts = Math.max(3, Math.round(br.len / 2.2));
      for (let i = 0; i <= posts; i++) b.add(rbox(0.18, 1.0, 0.18, 0.04), Tmul(base, T(x, DECK_Y + 0.5, -half + i * br.len / posts)), lin(0x8E5E3E));
      b.add(rbox(0.14, 0.14, br.len + 0.2, 0.05), Tmul(base, T(x, DECK_Y + 0.95, 0)), lin(0xF2C27C));
      b.add(rbox(0.1, 0.1, br.len, 0.04), Tmul(base, T(x, DECK_Y + 0.55, 0)), lin(0xB98257));
      phys.box(br.x + Math.cos(br.yaw) * x, DECK_Y + 0.6, br.z - Math.sin(br.yaw) * x, 0.12, 0.6, half, br.yaw);
    }
    // stone abutments + approach ramps
    for (const s of [-1, 1]) {
      const zEnd = s * half;
      b.add(rbox(w + 0.9, 1.2, 0.9, 0.12), Tmul(base, T(0, -0.45, zEnd)), STONE[0]);
      const rampL = 2.8;
      const zr = zEnd + s * rampL / 2;
      const g = wedgeGeo(w, DECK_Y, rampL);
      b.add(g, Tmul(base, T(0, 0, zr, 0, s > 0 ? 0 : Math.PI, 0)), null);
      // physics ramp (thin rotated box)
      addRampBody(phys, br.x, br.z, br.yaw, zr, w, DECK_Y, rampL, s > 0 ? 0 : Math.PI);
    }
    // deck collider
    phys.box(br.x, DECK_Y - 0.2, br.z, w / 2, 0.2, half, br.yaw);
  }
  // ---------- jump ramps ----------
  for (const r of RAMPS) {
    const y = heightAt(r.x, r.z);
    b.add(wedgeGeo(r.w, r.h, r.len), T(r.x, y - 0.02, r.z, 0, r.yaw, 0), null);
    // support blocks under the high end
    addRampBody(phys, r.x, r.z, r.yaw, 0, r.w, r.h, r.len, 0, y - 0.02);
  }
  // ---------- start / finish gate of the lap ----------
  {
    const p = RING[0], q = RING[2], o = RING[RING.length - 2];
    const yaw = Math.atan2(q[0] - o[0], q[1] - o[1]);
    const base = T(p[0], heightAt(p[0], p[1]), p[1], 0, yaw, 0);
    const half = 3.4;
    const navy = lin(0x1E2340), cream = lin(0xFFF1DC), mag = lin(0xFF4FA0);
    for (const s of [-1, 1]) {
      b.add(rbox(0.5, 4.6, 0.5, 0.12), Tmul(base, T(s * half, 2.3, 0)), mag);
      for (let k = 0; k < 4; k++) b.add(rbox(0.54, 0.22, 0.54, 0.05), Tmul(base, T(s * half, 0.8 + k * 1.0, 0)), cream);
      b.add(rbox(0.7, 0.3, 0.7, 0.1), Tmul(base, T(s * half, 0.15, 0)), mag);
      const wx = p[0] + Math.cos(yaw) * s * half, wz = p[1] - Math.sin(yaw) * s * half;
      phys.box(wx, 2.3, wz, 0.25, 2.3, 0.25, yaw);
    }
    b.add(rbox(2 * half + 0.8, 1.15, 0.3, 0.1), Tmul(base, T(0, 4.55, 0)), navy);
    for (let i = 0; i < 16; i++) for (let r = 0; r < 2; r++) {
      const c = (i + r) % 2 ? lin(0x151936) : cream;
      b.add(new THREE.BoxGeometry(0.42, 0.04, 0.15), Tmul(base, T(-3.15 + i * 0.42, 5.13, -0.075 + r * 0.15)), c);
      b.add(new THREE.BoxGeometry(0.42, 0.21, 0.04), Tmul(base, T(-3.15 + i * 0.42, 4.2 + r * 0.21, 0.17)), c);
      b.add(new THREE.BoxGeometry(0.42, 0.21, 0.04), Tmul(base, T(-3.15 + i * 0.42, 4.2 + r * 0.21, -0.17)), c);
    }
    const tg = textGeo('Круг почёта', 0.42, 0.06, false);
    b.add(tg, Tmul(base, T(0, 4.62, 0.17)), cream);
    b.add(tg, Tmul(base, T(0, 4.62, -0.17, 0, Math.PI, 0)), cream);
  }
  const ms = b.meshes(M.solid, { name: 'structures' });
  scene.add(...ms);
  const m = ms[0];

  // ---------- colliders for trees / rocks ----------
  for (const t of TREES) phys.cyl(t.x, heightAt(t.x, t.z) - 0.3, t.z, Math.max(0.28, t.r), 3.2, 'ground', 6);
  return { mesh: m };
}

// a ramp whose top rises from local z=+L/2 (height 0) to z=-L/2 (height h); local frame = yaw about y, offset zc along local z
function addRampBody(phys, x, z, yaw, zc, w, h, L, flip = 0, y0 = 0) {
  const len = Math.hypot(L, h), a = Math.atan2(h, L), th = 0.25;
  const ry = yaw + flip;
  // centre in ramp-local coords
  const cy = h / 2 - th * Math.cos(a), cz = -th * Math.sin(a) * 1;
  // ramp-local -> world (yaw rotation of the bridge/ramp frame, then local offset along its z)
  const lz = zc;
  const wx = x + Math.sin(yaw) * lz + Math.sin(ry) * cz, wz = z + Math.cos(yaw) * lz + Math.cos(ry) * cz;
  phys.box(wx, y0 + cy, wz, w / 2, th, len / 2, ry, a);
}

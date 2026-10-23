// Stylised faceted mountains with strata colours and snow caps, plus cone colliders.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Chunked, T } from './builder.js';
import { M } from './materials.js';
import { lin, mixc, TAU, vnoise } from './util.js';
import { heightAt, MOUNTAINS } from './layout.js';
import { G_STATIC } from './physics.js';

const COL = {
  grass: [0x5DAE5A, 0x4F9E55, 0x6CB862].map(h => lin(h)),
  low: [0xC77F66, 0xB8694F, 0xD08A6A].map(h => lin(h)),
  mid: [0xA9606A, 0x9C5A72, 0x8E5E86].map(h => lin(h)),
  high: [0x7A5E8C, 0x6E5884, 0x86699A].map(h => lin(h)),
  snow: [0xF6F3FF, 0xE9E4FA, 0xFFFFFF].map(h => lin(h))
};
const pick = (arr, n) => arr[Math.abs(Math.floor(n * 997)) % arr.length];

function mountainGeo(R, H, seed, snow) {
  const S = 16, K = 9;
  const rings = [];
  for (let k = 0; k <= K; k++) {
    const t = k / K, row = [];
    const rot = vnoise(seed * 3.1, k * 1.7) * 0.25;
    for (let i = 0; i < S; i++) {
      const a = i / S * TAU + rot;
      const n = vnoise(Math.cos(a) * 2.2 + seed, Math.sin(a) * 2.2 + k * 0.9) * 0.22 + vnoise(a * 3 + seed, k * 2.3) * 0.1;
      let r, y;
      if (k === 0) { r = R * (1.02 + n * 0.12); y = -0.7; }
      else { r = R * Math.pow(1 - t, 1.12) * (1 + n) + (k === K ? 0 : 0); y = H * Math.pow(t, 0.92) + vnoise(a * 2 + seed, k) * H * 0.04; }
      row.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    rings.push(row);
  }
  const apex = [vnoise(seed, 9) * R * 0.08, H * 1.04, vnoise(9, seed) * R * 0.08];
  const pos = [], col = [];
  const face = (p0, p1, p2, salt) => {
    pos.push(...p0, ...p1, ...p2);
    const yy = (p0[1] + p1[1] + p2[1]) / 3, f = yy / H;
    const ax = (p0[0] + p1[0] + p2[0]) / 3, az = (p0[2] + p1[2] + p2[2]) / 3;
    const n = vnoise(ax * 0.7 + seed, az * 0.7 - seed) * 0.12;
    const fs = f + n;
    let c;
    if (fs < 0.1) c = pick(COL.grass, salt);
    else if (fs < 0.4) c = pick(COL.low, salt);
    else if (fs < 0.64) c = pick(COL.mid, salt);
    else if (snow && fs > 0.7 + vnoise(ax, az) * 0.08) c = pick(COL.snow, salt);
    else c = pick(COL.high, salt);
    const j = 1 + vnoise(ax * 3.3, az * 3.3 + seed) * 0.06;
    for (let k = 0; k < 3; k++) col.push(c[0] * j, c[1] * j, c[2] * j);
  };
  let salt = seed * 0.37;
  for (let k = 0; k < K; k++) for (let i = 0; i < S; i++) {
    const i2 = (i + 1) % S, a = rings[k][i], b = rings[k][i2], c = rings[k + 1][i], d = rings[k + 1][i2];
    if (k === K - 1) { face(a, apex, b, salt += 0.618); continue; }
    face(a, c, b, salt += 0.618); face(b, c, d, salt += 0.618);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function buildMountains(scene, phys) {
  const b = new Chunked({}, 40);
  MOUNTAINS.forEach((m, i) => {
    const y = heightAt(m.x, m.z);
    b.add(mountainGeo(m.r, m.h, i * 7.13 + 1.7, !!m.snow), T(m.x, y, m.z, 0, i * 1.3, 0), null);
    // a few boulders around the foot
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * TAU + i, d = m.r * (0.95 + vnoise(i, k) * 0.15), s = 0.6 + Math.abs(vnoise(k, i)) * 0.9;
      const bx = m.x + Math.cos(a) * d, bz = m.z + Math.sin(a) * d;
      const rg = new THREE.DodecahedronGeometry(1, 0);
      b.add(rg, T(bx, heightAt(bx, bz) + s * 0.25, bz, a, a * 2, 0, s, s * 0.7, s), pick(COL.mid, k + i));
    }
    // collider: a cone (convex cylinder with a small top)
    const body = new CANNON.Body({ mass: 0, material: phys.mat.ground, collisionFilterGroup: G_STATIC });
    body.addShape(new CANNON.Cylinder(m.r * 0.14, m.r * 0.9, m.h * 0.92, 9));
    body.position.set(m.x, y + m.h * 0.46 - 0.4, m.z);
    phys.world.addBody(body);
    phys.statics.push(body);
  });
  const meshes = b.meshes(M.solidFlat, { cast: true, receive: true, name: 'mountains' });
  scene.add(...meshes);
  return meshes;
}

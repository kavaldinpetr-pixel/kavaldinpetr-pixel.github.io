import * as THREE from 'three';
import { Builder, Chunked, mesh, T } from './builder.js';
import { M, U } from './materials.js';
import { buildFoliage } from './foliage.js';
import { buildGrass as buildBlades } from './grass.js';
import { stylize } from './style.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, fbm, lin, mixc, rand, rr, smooth, TAU, vnoise } from './util.js';
import { clearSpot, edgeDist, featD, grassAt, heightAt, inside, LIGHTHOUSE, PLAZA, RIVER_W, riverD, roadD } from './layout.js';
import { groundColor } from './terrain.js';
import { WINTER } from './season.js';

// simple spatial hash to keep things apart
export class Occupancy {
  constructor(cell = 4) { this.cell = cell; this.map = new Map(); }
  key(i, j) { return i * 100003 + j; }
  free(x, z, r) {
    const c = this.cell, i0 = Math.floor((x - r - 3) / c), i1 = Math.floor((x + r + 3) / c), j0 = Math.floor((z - r - 3) / c), j1 = Math.floor((z + r + 3) / c);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const arr = this.map.get(this.key(i, j));
      if (arr) for (const o of arr) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return false;
    }
    return true;
  }
  add(x, z, r) { const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)); if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push({ x, z, r }); }
}
export const occ = new Occupancy(4);

export function slopeAt(x, z) {
  const e = 0.5;
  return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
}

const G = {
  trunk: lin(0x7A4A5E), trunkDark: lin(0x5E3A50), birch: lin(0xD8CCD8),
  rocks: [0x8E88C4, 0x9C95CC, 0x8380B8, 0xA59ED0].map(h => lin(h))
};
// two-tone crown palettes: [shadow side, sun side]
export const PAL = {
  orange: [lin(0xC4482A), lin(0xFFA23E)],
  yellow: [lin(0xAA7C1C), lin(0xF4D24C)],
  red: [lin(0x9C283C), lin(0xF5623F)],
  pink: [lin(0xB8358A), lin(0xFF8FB6)],
  birch: [lin(0x8A9426), lin(0xE6DE5A)],
  olive: [lin(0x707A20), lin(0xCCC244)]
};

function jitterGeo(g, amt, seed) {
  const p = g.attributes.position;
  // keep shared vertices consistent: jitter by position hash
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = vnoise(x * 3.1 + seed, y * 3.7 + z * 2.3 - seed) * amt;
    p.setXYZ(i, x * (1 + n), y * (1 + n * 0.8), z * (1 + n));
  }
  g.computeVertexNormals();
  return g;
}

export function smoothGeo(g) { g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g); g.computeVertexNormals(); return g; }
const dotGeo = new THREE.IcosahedronGeometry(1, 0);
const trunkGeo = new THREE.CylinderGeometry(0.11, 0.2, 1, 6, 1);
const branchGeo = new THREE.CylinderGeometry(0.04, 0.08, 1, 5, 1);
const rockGeo = [0, 1, 2, 3].map(k => { const g = new THREE.DodecahedronGeometry(1, 0); return jitterGeo(g, 0.22, k * 3.3 + 1); });

export const TREES = []; // {x,z,r,id,type}
export const CLUSTERS = []; // leaf clouds {x,y,z,r,a,b,tree,seed}

function tint(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
function autumn(x, z) {
  const n = fbm(x * 0.045 + 3.3, z * 0.045 - 7.1, 2) + (rand() - 0.5) * 0.35;
  return n > 0.22 ? PAL.yellow : n < -0.18 ? PAL.red : PAL.orange;
}

export function addTree(b, x, z, type, s = 1, id = TREES.length) {
  const y = heightAt(x, z) - 0.1;
  const rot = rand() * TAU, ca = Math.cos(rot), sa = Math.sin(rot);
  const put = (px, py, pz, r, pal) => {
    const k = 0.9 + rand() * 0.18;
    CLUSTERS.push({ x: x + px * ca - pz * sa, y: y + py, z: z + px * sa + pz * ca, r, a: tint(pal[0], k), b: tint(pal[1], k), tree: id, seed: rand() });
  };
  if (type === 'pine') {
    // birch: tall white trunk, airy lime-gold crown
    const th = (2.3 + rand() * 0.7) * s, R = (0.95 + rand() * 0.25) * s;
    b.add(trunkGeo, T(x, y + th / 2 + 0.4, z, 0, rot, (rand() - 0.5) * 0.08, s * 0.7, th + 0.8, s * 0.7), G.birch, { sway: (lx, ly) => (ly + 0.5) * 0.12, tree: id });
    b.add(branchGeo, T(x + ca * 0.3, y + th * 0.7, z + sa * 0.3, 0, rot, 0.75, s, R * 1.1, s), G.birch, { sway: 0.3, tree: id });
    put(0, th + R * 0.55, 0, R * 1.05, PAL.birch);
    put(R * 0.35, th + R * 1.45, -R * 0.15, R * 0.82, PAL.birch);
    if (rand() < 0.7) put(-R * 0.55, th + R * 0.35, R * 0.35, R * 0.72, PAL.birch);
    TREES.push({ x, z, r: 0.26 * s, id, type, h: th + R * 2.3 });
    return;
  }
  const th = (1.5 + rand() * 0.7) * s;
  b.add(trunkGeo, T(x, y + th / 2 + 0.25, z, 0, rot, rand() * 0.08, s, th + 0.5, s), G.trunk, { sway: (lx, ly) => (ly + 0.5) * 0.15, tree: id });
  b.add(branchGeo, T(x + ca * 0.32, y + th * 0.85, z + sa * 0.32, 0, rot, 0.85, s * 1.2, 1.1 * s, s * 1.2), G.trunk, { sway: 0.35, tree: id });
  b.add(branchGeo, T(x - ca * 0.3, y + th * 0.95, z - sa * 0.3, 0, rot, -0.8, s * 1.2, 1.0 * s, s * 1.2), G.trunk, { sway: 0.35, tree: id });
  const pal = type === 'pink' ? PAL.pink : autumn(x, z);
  const R = (1.3 + rand() * 0.35) * s;
  put(0, th + R * 0.85, 0, R * 1.12, pal);
  put(R * 0.68, th + R * 0.55, R * 0.2, R * 0.8, pal);
  put(-R * 0.6, th + R * 0.6, -R * 0.35, R * 0.84, pal);
  if (rand() < 0.6) put(R * 0.05, th + R * 1.55, -R * 0.1, R * 0.7, pal);
  TREES.push({ x, z, r: 0.3 * s, id, type, h: th + R * 2 });
}

export function addRock(b, x, z, s, flat = 0.65) {
  const y = heightAt(x, z);
  const c = G.rocks[Math.floor(rand() * G.rocks.length)];
  b.add(rockGeo[Math.floor(rand() * 4)], T(x, y + s * 0.2, z, rand() * 0.3, rand() * TAU, rand() * 0.3, s, s * flat, s * (0.8 + rand() * 0.4)),
    (wx, wy, wz, lx, ly) => mixc(c, [1, 1, 1], clamp(ly, 0, 1) * 0.12));
}

// ---------- scattering ----------
function okSpot(x, z, opts) {
  if (!inside(x, z, opts.edge ?? 1.6)) return false;
  if (roadD.get(x, z) < (opts.road ?? 4.2)) return false;
  if (riverD.get(x, z) < RIVER_W + (opts.river ?? 2.6)) return false;
  if (featD.get(x, z) < (opts.feat ?? 3)) return false;
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 3) return false;
  if (slopeAt(x, z) > (opts.slope ?? 0.7)) return false;
  if (clearSpot(x, z, opts.clear ?? 1.6)) return false;
  return true;
}

export function buildDecor(scene, quality) {
  const fol = new Chunked({ sway: true, tree: true }, 30);
  const solid = new Chunked({}, 30);
  const flat = new Chunked({}, 30);
  // forests: density from noise, plus sparse singles
  let tries = 0;
  const want = quality.trees || 170;
  while (TREES.length < want && tries++ < 20000) {
    const a = rand() * TAU, r = Math.sqrt(rand()) * 90;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const dens = smooth(-0.15, 0.45, fbm(x * 0.045 + 9, z * 0.045 - 4, 3)) * 0.9 + 0.12;
    if (rand() > dens) continue;
    if (!okSpot(x, z, {})) continue;
    const big = 0.85 + rand() * 0.45;
    if (!occ.free(x, z, 1.9 * big)) continue;
    occ.add(x, z, 1.9 * big);
    const nz = fbm(x * 0.03 - 2, z * 0.03 + 5, 2);
    const type = nz > 0.28 ? 'pine' : (rand() < 0.14 ? 'pink' : 'round');
    addTree(fol, x, z, type, big);
  }
  // rocks
  for (let k = 0, t = 0; k < (quality.rocks || 60) && t < 6000; t++) {
    const a = rand() * TAU, r = Math.sqrt(rand()) * 90, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!okSpot(x, z, { road: 3.4, river: 1.2, feat: 2, slope: 1.2, edge: 0.6, clear: 0.4 })) continue;
    const s = 0.35 + Math.pow(rand(), 2) * 1.6;
    if (!occ.free(x, z, s)) continue;
    occ.add(x, z, s);
    addRock(flat, x, z, s);
    if (s > 1 && rand() < 0.6) addRock(flat, x + rr(-1, 1) * s, z + rr(-1, 1) * s, s * 0.45);
    k++;
  }
  // bushes: low leaf clouds, olive or autumn
  for (let k = 0, t = 0; k < (quality.bushes || 90) && t < 6000; t++) {
    const a = rand() * TAU, r = Math.sqrt(rand()) * 90, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!okSpot(x, z, { road: 3.3, river: 1.6, feat: 1.5, edge: 1, clear: 0.8 })) continue;
    if (!occ.free(x, z, 0.9)) continue;
    occ.add(x, z, 0.8);
    const y = heightAt(x, z);
    const pal = rand() < 0.55 ? PAL.olive : autumn(x, z);
    const n = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const s = rr(0.6, 0.9), kk = 0.9 + rand() * 0.18;
      CLUSTERS.push({ x: x + rr(-0.5, 0.5), y: y + s * 0.5, z: z + rr(-0.5, 0.5), r: s, a: tint(pal[0], kk), b: tint(pal[1], kk), tree: -1, seed: rand() });
    }
    if (rand() < 0.45) for (let i = 0; i < 5; i++) {
      const s = 0.08;
      solid.add(dotGeo, T(x + rr(-0.7, 0.7), y + rr(0.7, 1.1), z + rr(-0.7, 0.7), 0, 0, 0, s), lin(rand() < 0.5 ? 0xFF7FBF : 0xFFF3C4));
    }
  }
  const trunks = fol.meshes(M.foliage, { cast: true, receive: true, name: 'trunks' });
  const rocks = flat.meshes(M.solidFlat, { cast: true, receive: true, name: 'rocks' });
  const smalls = solid.meshes(M.solid, { cast: false, receive: true, name: 'smalls' });
  scene.add(...trunks, ...rocks, ...smalls);
  if (WINTER) {
    // frost: crowns turn cool and pale (the snow shader caps their tops white)
    const fa = lin(0x7F86B4), fb = lin(0xE6EBF8);
    for (const c of CLUSTERS) { c.a = mixc(c.a, fa, 0.45); c.b = mixc(c.b, fb, 0.5); }
  }
  const crowns = buildFoliage(scene, CLUSTERS, { K: quality.leafCards || 64 });
  const grass = buildBlades(scene, quality.blades || { n: 260, size: 56 });
  const flowers = WINTER ? [] : buildFlowers(scene, quality.flowers || 1400);
  const leaves = WINTER ? [] : buildLeaves(scene, quality.leaves || 2600);
  return { trunks, crowns, rocks, smalls, grass, flowers, leaves };
}

// distribute instances into grid tiles so each tile can be frustum-culled
function tiledInstances(scene, geo, mat, items, cell, opts = {}) {
  const tiles = new Map();
  for (const it of items) { const k = Math.floor(it.p.x / cell) + ',' + Math.floor(it.p.z / cell); if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(it); }
  const m4 = new THREE.Matrix4(), out = [];
  for (const list of tiles.values()) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => { im.setMatrixAt(i, m4.compose(it.p, it.q, it.s)); if (it.c) im.setColorAt(i, it.c); });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    if (im.boundingSphere) im.boundingSphere.radius += 1.5;
    im.receiveShadow = true; im.castShadow = false;
    im.frustumCulled = true;
    scene.add(im); out.push(im);
  }
  return out;
}
function buildFlowers(scene, count) {
  const head = new THREE.IcosahedronGeometry(0.11, 0);
  const g = new THREE.BufferGeometry();
  // head + tiny stem merged
  const b = new Builder();
  b.add(head, T(0, 0.3, 0, 0, 0, 0, 1, 0.75, 1), [1, 1, 1]);
  b.add(new THREE.CylinderGeometry(0.015, 0.02, 0.3, 3, 1, true), T(0, 0.15, 0), lin(0x3E8A45));
  const fg = b.build();
  const mat = M.solid;
  const cols = [0xFF7FBF, 0xFFFFFF, 0xFFE27A, 0xC9A6FF, 0xFF9F80].map(h => new THREE.Color(h));
  const items = [];
  let n = 0, t = 0;
  while (n < count && t++ < count * 20) {
    const a = rand() * TAU, r = Math.sqrt(rand()) * 90, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!inside(x, z, 1)) continue;
    if (roadD.get(x, z) < 3 || riverD.get(x, z) < RIVER_W + 2.2 || featD.get(x, z) < 1 || grassAt(x, z) < 0.6) continue;
    const meadow = fbm(x * 0.06 - 7, z * 0.06 + 3, 2);
    if (meadow < 0.15 || rand() > smooth(0.15, 0.5, meadow)) continue;
    const ci = Math.floor((fbm(x * 0.2, z * 0.2, 1) * 0.5 + 0.5) * cols.length * 1.3 + rand() * 1.2) % cols.length;
    const sc = 0.8 + rand() * 0.5;
    items.push({ p: new THREE.Vector3(x, heightAt(x, z), z), q: new THREE.Quaternion(), s: new THREE.Vector3(sc, sc, sc), c: cols[ci] });
    n++;
  }
  return tiledInstances(scene, fg, mat, items, 24);
}

// fallen leaves: lots on paths and plazas, heaps under the trees; nudged aside by the car
function leafShape() {
  const sh = new THREE.Shape();
  sh.moveTo(0, -0.12);
  sh.quadraticCurveTo(0.1, -0.05, 0.075, 0.04);
  sh.quadraticCurveTo(0.05, 0.11, 0, 0.15);
  sh.quadraticCurveTo(-0.05, 0.11, -0.075, 0.04);
  sh.quadraticCurveTo(-0.1, -0.05, 0, -0.12);
  const g = new THREE.ShapeGeometry(sh, 3);
  g.rotateX(-Math.PI / 2);
  return g;
}
function buildLeaves(scene, count) {
  const geo = leafShape();
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCar = U.car;
    sh.vertexShader = 'uniform vec3 uCar;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      {
        vec3 ic = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec2 aw = ic.xz - uCar.xz; float dd = length(aw);
        float push = (1.0 - smoothstep(0.4, 1.9, dd)) * step(abs(ic.y - uCar.y), 2.0);
        mvPosition.xz += aw / max(dd, 0.001) * push * 0.9;
        mvPosition.y += push * 0.08;
      }
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader.replace('normal *= faceDirection;', '');
  };
  mat.customProgramCacheKey = () => 'leaves';
  stylize(mat, { key: 'leaf', bounce: false });
  const cols = [0xC8382A, 0xE0552E, 0xB22A36, 0xF07A35, 0x9E2E2A, 0xE8A13A, 0xF2C14A, 0xA8452A].map(h => new THREE.Color(h));
  // top of whatever the leaf lies on: plaza discs and roads sit a little above the terrain
  const surf = (x, z) => {
    let y = heightAt(x, z);
    if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 0.2 || Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < LIGHTHOUSE.plaza + 0.2) y = Math.max(y, 0.066);
    else if (roadD.get(x, z) < 2.7) y = Math.max(y, 0.056);
    return y;
  };
  const items = [];
  const put = (x, z, scale = 1) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.25, rand() * TAU, (rand() - 0.5) * 0.25));
    const sc = (0.75 + rand() * 0.7) * scale;
    items.push({ p: new THREE.Vector3(x, surf(x, z) + 0.022 + rand() * 0.012, z), q, s: new THREE.Vector3(sc, sc, sc), c: cols[Math.floor(rand() * cols.length)] });
  };
  let t = 0;
  // on the paths
  const onPaths = Math.round(count * 0.62);
  while (items.length < onPaths && t++ < count * 40) {
    const a = rand() * TAU, r = Math.sqrt(rand()) * 92, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!inside(x, z, 0.8) || riverD.get(x, z) < RIVER_W + 1.4) continue;
    if (grassAt(x, z) > 0.45) continue;
    if (featD.get(x, z) < -0.5 && rand() < 0.7) continue; // fewer under buildings
    put(x, z);
  }
  // heaps under the trees (visible where the grass is short)
  t = 0;
  while (items.length < count && t++ < count * 40) {
    const tr = TREES[Math.floor(rand() * TREES.length)];
    if (!tr) break;
    const a = rand() * TAU, r = 0.4 + Math.pow(rand(), 0.7) * 3.4, x = tr.x + Math.cos(a) * r, z = tr.z + Math.sin(a) * r;
    if (!inside(x, z, 0.8) || riverD.get(x, z) < RIVER_W + 1.4) continue;
    if (grassAt(x, z) > 0.6 && rand() < 0.75) continue;
    put(x, z, 1.1);
  }
  const out = tiledInstances(scene, geo, mat, items, 24);
  out.forEach(m => { m.castShadow = false; });
  return out;
}

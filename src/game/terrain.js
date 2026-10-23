import * as THREE from 'three';
import { Builder, mesh, splitByCell } from './builder.js';
import { M, U, NOISE_GLSL } from './materials.js';
import { clamp, fbm, lerp, lin, mixc, smooth, TAU, vnoise } from './util.js';
import {
  BRIDGES, edgeDist, FALL, grassAt, heightAt, islandR, LIGHTHOUSE, PLAZA, POND, RIVER, RIVER_W, riverD, roadD, ROADS, WATER_Y
} from './layout.js';

// warm autumn palette: olive-gold grass, orange paths, teal water
const C = {
  gA: lin(0xB8B62E), gB: lin(0xA2A92F), gC: lin(0xCDB93A), gD: lin(0xB4A033),
  dirt: lin(0xFFA94E), dirt2: lin(0xF59A47),
  sand: lin(0xFFB867), wet: lin(0xD08A50), bed: lin(0x2E8C8E), rim: lin(0xD37A43),
  roadEdge: lin(0xEC9246), road: lin(0xFBA757), roadMid: lin(0xFFAE5E)
};
export const PALETTE = C;

export function groundColor(x, z, h) {
  const n1 = fbm(x * 0.05 + 11, z * 0.05 - 3, 3);
  const n2 = fbm(x * 0.021 - 5, z * 0.021 + 8, 3);
  let c = mixc(C.gA, C.gB, smooth(-0.5, 0.45, n1));
  c = mixc(c, C.gC, smooth(0.1, 0.65, n2) * 0.65);
  c = mixc(c, C.gD, smooth(0.4, 0.9, n1) * 0.4);
  const g = grassAt(x, z);
  const d = mixc(C.dirt, C.dirt2, smooth(-0.3, 0.5, vnoise(x * 0.31, z * 0.31)));
  c = mixc(d, c, g);
  const dRiv = riverD.get(x, z);
  if (dRiv < RIVER_W + 2.9) c = mixc(c, C.sand, 1 - smooth(RIVER_W + 1.9, RIVER_W + 2.9, dRiv));
  if (h < -0.15) {
    c = mixc(C.sand, C.wet, smooth(-0.15, -0.55, h));
    if (h < -0.55) c = mixc(C.wet, C.bed, smooth(-0.55, -1.5, h));
  }
  const e = edgeDist(x, z);
  c = mixc(c, C.rim, 1 - smooth(0.15, 1.1, e));
  const j = 1 + vnoise(x * 1.7, z * 1.7) * 0.035;
  return [c[0] * j, c[1] * j, c[2] * j];
}

// ---------- island top ----------
function buildTop() {
  let Rmax = 0;
  for (let i = 0; i < 360; i++) Rmax = Math.max(Rmax, islandR(i / 360 * TAU));
  const S = 0.7, L = Math.ceil((Rmax + 1.5) / S), N = 2 * L + 1;
  const ids = new Int32Array(N * N).fill(-1);
  const b = new Builder();
  const pos = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let x = (i - L) * S, z = (j - L) * S;
    const r = Math.hypot(x, z), a = Math.atan2(z, x), R = islandR(a);
    if (r > R + S * 1.5) continue;
    if (r > R - 0.02) { const k = (R - 0.02) / r; x *= k; z *= k; }
    const h = heightAt(x, z);
    const gc = groundColor(x, z, h), k = 1 - grassAt(x, z) * 0.3;
    ids[j * N + i] = b.vert(x, h, z, 0, 1, 0, [gc[0] * k, gc[1] * k, gc[2] * k]);
  }
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = ids[j * N + i], c = ids[j * N + i + 1], d = ids[(j + 1) * N + i], e = ids[(j + 1) * N + i + 1];
    if (a < 0 || c < 0 || d < 0 || e < 0) continue;
    // skip cells fully on the rim (all projected) - they are degenerate slivers
    b.tri(a, d, c); b.tri(c, d, e);
  }
  const g = b.build();
  // drop degenerate triangles
  const P = g.attributes.position.array, I = g.index.array, keep = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, c = I[t + 1] * 3, d = I[t + 2] * 3;
    const ux = P[c] - P[a], uz = P[c + 2] - P[a + 2], vx = P[d] - P[a], vz = P[d + 2] - P[a + 2];
    if (Math.abs(ux * vz - uz * vx) > 1e-4) keep.push(I[t], I[t + 1], I[t + 2]);
  }
  g.setIndex(keep);
  g.computeVertexNormals();
  const grp = new THREE.Group(); grp.name = 'top';
  for (const tg of splitByCell(g, 28)) grp.add(mesh(tg, M.ground, { cast: false, receive: true, name: 'topTile' }));
  return grp;
}

// ---------- rocky underside ----------
const STRATA = [0x8E4E3A, 0xD5794A, 0xE89A5E, 0xB8667A, 0x86508A, 0x5C4383, 0x372C66].map(h => lin(h));
function strata(t, n) {
  const f = clamp(t * (STRATA.length - 1) + n * 0.6, 0, STRATA.length - 1.001);
  const i = Math.floor(f);
  return mixc(STRATA[i], STRATA[i + 1], smooth(0.35, 0.65, f - i));
}
function buildUnderside() {
  const NA = 220, K = 15, D = 36;
  const b = new Builder();
  const ring = [];
  for (let k = 0; k <= K; k++) {
    const row = [];
    const t = k / K;
    for (let i = 0; i < NA; i++) {
      const a = i / NA * TAU, R = islandR(a);
      let r, y;
      const top = heightAt(Math.cos(a) * (R - 0.05), Math.sin(a) * (R - 0.05));
      if (k === 0) { r = R - 0.02; y = top; }
      else if (k === 1) { r = R + 0.32; y = Math.min(top, 0) - 0.55; }
      else if (k === 2) { r = R + 0.2 + vnoise(a * 13, 2) * 0.25; y = Math.min(top, 0) - 2.2 + vnoise(a * 7, 5) * 0.4; }
      else {
        const tt = (k - 2) / (K - 2);
        const prof = (1 - Math.pow(tt, 1.7)) * (1 - 0.12 * tt) * 0.97;
        const n = vnoise(a * 9 + k * 3.1, k * 0.7) * 0.5 + vnoise(a * 23, k * 1.9) * 0.25;
        r = Math.max(0.6, R * prof * (1 + n * 0.12) + (k < 4 ? 0.4 : 0));
        y = -2.4 - Math.pow(tt, 1.15) * D + vnoise(a * 5, k) * 1.2;
      }
      row.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    ring.push(row);
  }
  const tip = [0, -D - 7, 0];
  // flat shaded: emit per-face vertices
  const face = (p0, p1, p2, c) => {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const a = b.vert(p0[0], p0[1], p0[2], nx, ny, nz, c), d = b.vert(p1[0], p1[1], p1[2], nx, ny, nz, c), e = b.vert(p2[0], p2[1], p2[2], nx, ny, nz, c);
    b.tri(a, d, e);
  };
  for (let k = 0; k < K; k++) for (let i = 0; i < NA; i++) {
    const i2 = (i + 1) % NA;
    const p00 = ring[k][i], p01 = ring[k][i2], p10 = ring[k + 1][i], p11 = ring[k + 1][i2];
    const a = (i + 0.5) / NA * TAU;
    const n = vnoise(a * 6, k * 0.8) * 0.5 + vnoise(a * 17, k * 2.3) * 0.25;
    const c = k === 0 ? lin(0xA3A12E) : k === 1 ? lin(0xB8693F) : strata(k / K, n);
    const sh = 1 + (vnoise(a * 31, k * 5.7)) * 0.07;
    const cc = [c[0] * sh, c[1] * sh, c[2] * sh];
    face(p00, p01, p10, cc);
    face(p01, p11, p10, [cc[0] * 0.96, cc[1] * 0.96, cc[2] * 0.96]);
  }
  for (let i = 0; i < NA; i++) {
    const i2 = (i + 1) % NA;
    face(ring[K][i], ring[K][i2], tip, STRATA[STRATA.length - 1]);
  }
  const g = b.build();
  return mesh(g, M.cliff, { cast: false, receive: false, name: 'under' });
}

// ---------- roads ----------
function ribbon(b, pts, w, closed, y, skip) {
  const n = pts.length;
  const cols = [C.roadEdge, C.road, C.roadMid, C.road, C.roadEdge];
  const offs = [-w / 2, -w / 2 + 0.55, 0, w / 2 - 0.55, w / 2];
  let prev = null;
  const last = closed ? n : n - 1;
  for (let i = 0; i <= last; i++) {
    const p = pts[i % n];
    const a = pts[Math.max(0, (closed ? i - 1 + n : i - 1)) % n] || p, c = pts[Math.min(closed ? i + 1 : n - 1, i + 1) % n];
    let tx = c[0] - a[0], tz = c[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;
    const sk = skip(p[0], p[1]);
    const row = sk ? null : offs.map((o, k) => {
      const x = p[0] + nx * o, z = p[1] + nz * o;
      const c2 = cols[k], j = 1 + vnoise(x * 2.1, z * 2.1) * 0.03;
      return b.vert(x, y, z, 0, 1, 0, [c2[0] * j, c2[1] * j, c2[2] * j]);
    });
    if (row && prev) for (let k = 0; k < 4; k++) { b.tri(prev[k], prev[k + 1], row[k]); b.tri(prev[k + 1], row[k + 1], row[k]); }
    prev = row;
  }
}
function disc(b, cx, cz, r, y, ringsCol, seg = 64) {
  // concentric tiled disc
  const rings = ringsCol.length;
  const centre = b.vert(cx, y, cz, 0, 1, 0, ringsCol[0]);
  let prev = null;
  for (let k = 1; k <= rings; k++) {
    const rr = r * k / rings, row = [];
    for (let i = 0; i < seg; i++) {
      const a = i / seg * TAU;
      row.push(b.vert(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr, 0, 1, 0, ringsCol[k - 1]));
    }
    for (let i = 0; i < seg; i++) {
      const i2 = (i + 1) % seg;
      if (!prev) b.tri(centre, row[i2], row[i]);
      else { b.tri(prev[i], prev[i2], row[i]); b.tri(prev[i2], row[i2], row[i]); }
    }
    // duplicate ring for hard colour steps
    if (k < rings) { prev = row.map((_, i) => { const a = i / seg * TAU; return b.vert(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr, 0, 1, 0, ringsCol[k]); }); }
  }
}
// compass-rose mosaic: curb, segmented tile ring, brand band, star
function plazaMosaic(b, cx, cz, R, y) {
  let dy = 0;
  const up = (x, z, c) => b.vert(cx + x, y + dy, cz + z, 0, 1, 0, c);
  const ring = (r0, r1, seg, colFn) => {
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU, c = colFn(i);
      const p = [up(Math.cos(a0) * r0, Math.sin(a0) * r0, c), up(Math.cos(a1) * r0, Math.sin(a1) * r0, c), up(Math.cos(a1) * r1, Math.sin(a1) * r1, c), up(Math.cos(a0) * r1, Math.sin(a0) * r1, c)];
      b.tri(p[0], p[1], p[2]); b.tri(p[0], p[2], p[3]);
    }
  };
  const curb = lin(0xD9823F), t1 = lin(0xFFAE5C), t2 = lin(0xF8A253), seam = lin(0xE08A45), band = lin(0xFF4FA0), cream = lin(0xFFB566), navy = lin(0x2A3160), mag2 = lin(0xE0458F);
  ring(R - 0.45, R, 64, () => curb);
  ring(R * 0.66, R - 0.45, 56, i => (i % 2 ? t1 : t2));
  ring(R * 0.66 - 0.06, R * 0.66, 56, () => seam);
  ring(R * 0.6, R * 0.66 - 0.06, 64, () => band);
  ring(0, R * 0.6, 64, () => cream);
  // 8-point star (slightly raised to avoid z-fighting)
  dy = 0.012;
  const S = R * 0.5, s = R * 0.16;
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * TAU - Math.PI / 2, L = k % 2 ? S * 0.62 : S;
    const tip = [Math.cos(a) * L, Math.sin(a) * L];
    const l = [Math.cos(a - Math.PI / 8) * s, Math.sin(a - Math.PI / 8) * s], r = [Math.cos(a + Math.PI / 8) * s, Math.sin(a + Math.PI / 8) * s];
    const c1 = k % 2 ? navy : band, c2 = k % 2 ? lin(0x1E2340) : mag2;
    const o = up(0, 0, c1);
    b.tri(o, up(tip[0], tip[1], c1), up(l[0], l[1], c1));
    const o2 = up(0, 0, c2);
    b.tri(o2, up(r[0], r[1], c2), up(tip[0], tip[1], c2));
  }
}
function buildRoads() {
  const b = new Builder();
  const skip = (x, z) => riverD.get(x, z) < RIVER_W + 3.0 || Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r - 0.6;
  ROADS.forEach((r, i) => ribbon(b, r.pts, r.w, !!r.closed, 0.03 + i * 0.004, skip));
  const tiles = [0xFFB062, 0xF6A253, 0xFFB062, 0xF9A658, 0xFFAD5E, 0xF09A4C, 0xFFB062, 0xF6A253, 0xE48E45].map(h => lin(h));
  plazaMosaic(b, PLAZA.x, PLAZA.z, PLAZA.r, 0.05);
  disc(b, LIGHTHOUSE.x, LIGHTHOUSE.z, LIGHTHOUSE.plaza, 0.05, tiles.slice(0, 6), 56);
  return mesh(b.build(), M.road, { cast: false, receive: true, name: 'roads' });
}

// ---------- water ----------
export function waterMaterial(fall = false) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime: U.time, uDeep: { value: new THREE.Color(0x1C8FB0) }, uShallow: { value: new THREE.Color(0x4FD6E0) },
      uFoam: { value: new THREE.Color(0xF2FFFF) }, uLight: { value: 1 }, uFall: { value: fall ? 1 : 0 }
    },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uLight, uFall; uniform vec3 uDeep, uShallow, uFoam; varying vec2 vUv; varying vec3 vW;
      ${NOISE_GLSL}
      void main(){
        float e = abs(vUv.x - 0.5) * 2.0;
        vec3 c = mix(uDeep, uShallow, smoothstep(0.15, 0.95, e));
        float a = 0.9;
        if (uFall > 0.5) {
          float s = vUv.y;
          float n = vn(vec2(vUv.x * 14.0, s * 6.0 - uTime * 2.6)) * 0.6 + vn(vec2(vUv.x * 33.0, s * 12.0 - uTime * 4.1)) * 0.4;
          c = mix(uShallow, uFoam, smoothstep(0.45, 0.85, n) * 0.85 + s * 0.25);
          a = (1.0 - smoothstep(0.55, 1.0, s)) * (1.0 - smoothstep(0.75, 1.0, e)) * (0.75 + 0.25 * n);
        } else {
          float f = vUv.y * 0.5 - uTime * 0.45;
          float r1 = vn(vec2(vUv.x * 9.0, f * 1.4));
          float r2 = vn(vec2(vUv.x * 15.0 + 4.0, f * 2.3 - uTime * 0.2));
          float lines = smoothstep(0.7, 0.78, r1) * (1.0 - smoothstep(0.8, 0.9, r1)) + smoothstep(0.75, 0.82, r2) * (1.0 - smoothstep(0.84, 0.92, r2)) * 0.6;
          c = mix(c, uShallow * 1.25 + 0.05, lines * 0.45 * (1.0 - e * 0.5));
          float wob = 0.03 * sin(vUv.y * 2.3 + uTime * 1.6) + 0.02 * sin(vUv.y * 5.1 - uTime * 2.2);
          float shore = smoothstep(0.76, 0.82, e + wob) * (1.0 - smoothstep(0.9, 0.95, e + wob));
          c = mix(c, uFoam, shore * 0.8);
          float sp = pow(vn(vW.xz * 2.3 + vec2(uTime * 0.6, -uTime * 0.3)), 16.0);
          c += sp * 0.7;
        }
        gl_FragColor = vec4(c * uLight, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}
function buildWater() {
  const group = new THREE.Group();
  // river ribbon (until the fall)
  const end = FALL ? FALL.i : RIVER.length;
  const pts = RIVER.slice(0, end).map(p => p.slice());
  if (FALL) pts.push([FALL.x, FALL.z]);
  const pos = [], uv = [], idx = [];
  const w = RIVER_W + 2.1;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)];
    let tx = c[0] - a[0], tz = c[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    if (i > 0) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    pos.push(p[0] - tz * w, WATER_Y, p[1] + tx * w, p[0] + tz * w, WATER_Y, p[1] - tx * w);
    uv.push(0, s, 1, s);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mat = waterMaterial(false);
  const river = new THREE.Mesh(g, mat); river.renderOrder = 2; group.add(river);
  // pond
  const pg = new THREE.CircleGeometry(POND.r + 2.1, 48);
  const pu = pg.attributes.uv, pp = pg.attributes.position;
  for (let i = 0; i < pu.count; i++) { const x = pp.getX(i), y = pp.getY(i); const r = Math.hypot(x, y) / (POND.r + 2.1); pu.setXY(i, 0.5 + 0.5 * r, Math.atan2(y, x) * 2.0); }
  const pond = new THREE.Mesh(pg, mat); pond.rotation.x = -Math.PI / 2; pond.position.set(POND.x, WATER_Y, POND.z); pond.renderOrder = 2; group.add(pond);
  // waterfall
  if (FALL) {
    const J = 28, fpos = [], fuv = [], fidx = [];
    const dx = FALL.dx, dz = FALL.dz, nx = -dz, nz = dx;
    for (let j = 0; j <= J; j++) {
      const t = j / J;
      const out = 0.2 + t * 5.5 + Math.pow(t, 0.5) * 1.5, y = WATER_Y - Math.pow(t, 1.7) * 38;
      const ww = w * (1 + t * 0.9);
      const cx = FALL.x + dx * out, cz = FALL.z + dz * out;
      fpos.push(cx - nx * ww, y, cz - nz * ww, cx + nx * ww, y, cz + nz * ww);
      fuv.push(0, t, 1, t);
      if (j > 0) { const k = j * 2; fidx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
    fg.setIndex(fidx);
    const fm = waterMaterial(true); fm.side = THREE.DoubleSide;
    const fall = new THREE.Mesh(fg, fm); fall.renderOrder = 3; group.add(fall);
    group.userData.fallMat = fm;
  }
  group.userData.mat = mat;
  return group;
}

export function buildTerrain(scene) {
  const top = buildTop();
  const under = buildUnderside();
  const roads = buildRoads();
  const water = buildWater();
  scene.add(top, under, roads, water);
  return { top, under, roads, water };
}
export { BRIDGES };

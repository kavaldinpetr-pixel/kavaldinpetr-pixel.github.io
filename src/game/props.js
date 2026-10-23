// Dynamic and breakable physics props rendered with instancing, plus the playground (pitch, dominoes).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Builder, mesh, T } from './builder.js';
import { M, U } from './materials.js';
import { lin, mixc, rand, TAU } from './util.js';
import { G_CAR, G_DEBRIS, G_GROUND, G_PROP, G_STATIC } from './physics.js';
import { DOMINO, heightAt, inside, PITCH, PLAZA, RING, RIVER_W, riverD, roadD, featD, ROADS, ZONES, BRIDGES, edgeDist } from './layout.js';
import { rb, segM } from './zones.js';
import { occ } from './decor.js';
import { WINTER } from './season.js';

const C = {
  wood: lin(0xC28A5C), wood2: lin(0x9A6440), navy: lin(0x1E2340), cream: lin(0xFFF1DC), magenta: lin(0xFF4FA0), orange: lin(0xFF8A3D),
  white: lin(0xF7F5FA), black: lin(0x23263A), yellow: lin(0xFFC857), mint: lin(0x5BE3C8), sky: lin(0x7FB7FF), steel: lin(0x9AA0B8), red: lin(0xE5484D)
};

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);

// ---------------- generic instanced prop set ----------------
export class PropSet {
  constructor(scene, phys, def) {
    this.def = def; this.phys = phys;
    this.items = [];
    this.meshes = def.parts.map(p => {
      const im = new THREE.InstancedMesh(p.geo, p.mat, def.max);
      im.castShadow = p.cast !== false; im.receiveShadow = true;
      im.count = 0; im.frustumCulled = false;
      scene.add(im);
      return im;
    });
  }
  add(x, y, z, yaw = 0, opt = {}) {
    const d = this.def;
    const static0 = !!d.breakable;
    const body = new CANNON.Body({
      mass: static0 ? 0 : d.mass, type: static0 ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC,
      material: this.phys.mat[d.material || 'prop'], collisionFilterGroup: d.group || G_PROP, collisionFilterMask: G_GROUND | G_CAR | G_PROP | G_STATIC | G_DEBRIS
    });
    d.shape(body);
    body.position.set(x, y, z);
    body.quaternion.setFromEuler(opt.rx || 0, yaw, opt.rz || 0, 'YXZ');
    body.allowSleep = true; body.sleepSpeedLimit = d.sleepSpeed ?? 0.3; body.sleepTimeLimit = d.sleepTime ?? 0.7;
    body.linearDamping = d.linDamp ?? 0.05; body.angularDamping = d.angDamp ?? 0.12;
    this.phys.world.addBody(body);
    if (!static0) body.sleep();
    const idx = this.items.length;
    const it = { set: this, body, idx, home: { p: body.position.clone(), q: body.quaternion.clone() }, knocked: false, broken: false, gone: false, tint: opt.tint, id: opt.id };
    body.userData = it;
    this.items.push(it);
    this.meshes.forEach((im, k) => {
      im.count = this.items.length;
      const c = (opt.tints && opt.tints[k]) || opt.tint;
      if (c || this.def.parts[k].tinted) im.setColorAt(idx, c ? new THREE.Color().setRGB(c[0], c[1], c[2]) : new THREE.Color(1, 1, 1));
    });
    this.write(it);
    return it;
  }
  write(it, interp = false) {
    const b = it.body;
    if (it.gone) { _m.makeScale(0, 0, 0); }
    else {
      const p = interp ? b.interpolatedPosition : b.position, q = interp ? b.interpolatedQuaternion : b.quaternion;
      _m.compose(_p.set(p.x, p.y, p.z), _q.set(q.x, q.y, q.z, q.w), _s.set(1, 1, 1));
    }
    for (const im of this.meshes) im.setMatrixAt(it.idx, _m);
    this.dirty = true;
  }
  sync() {
    for (const it of this.items) if (it.body.type !== CANNON.Body.STATIC && it.body.sleepState !== CANNON.Body.SLEEPING) this.write(it, true);
    if (this.dirty) { for (const im of this.meshes) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; } this.dirty = false; }
  }
  breakIt(it, vel) {
    if (it.broken) return false;
    const b = it.body;
    it.broken = true;
    b.type = CANNON.Body.DYNAMIC;
    b.mass = this.def.mass;
    b.updateMassProperties();
    b.wakeUp();
    if (vel) { b.velocity.set(vel.x * 0.55, Math.abs(vel.length()) * 0.18 + 1.5, vel.z * 0.55); b.angularVelocity.set((rand() - 0.5) * 4, (rand() - 0.5) * 2, (rand() - 0.5) * 4); }
    return true;
  }
  reset(it) {
    const b = it.body;
    b.position.copy(it.home.p); b.quaternion.copy(it.home.q);
    b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
    b.interpolatedPosition.copy(b.position); b.interpolatedQuaternion.copy(b.quaternion);
    if (this.def.breakable) { b.type = CANNON.Body.STATIC; b.mass = 0; b.updateMassProperties(); it.broken = false; }
    else b.sleep();
    it.knocked = false; it.gone = false;
    this.write(it);
  }
}

// ---------------- geometry for props ----------------
function crateGeo(s) {
  const b = new Builder();
  b.add(rb(s, s, s, 0.06, 2), T(), C.wood);
  for (const y of [-0.32, 0.32]) for (const [ax, az] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) b.add(rb(az ? s + 0.04 : 0.1, 0.14, ax ? s + 0.04 : 0.1, 0.03), T(ax * s / 2, y * s, az * s / 2), C.wood2);
  for (const [ax, az] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) b.add(rb(az ? 0.12 : 0.1, s * 0.75, ax ? 0.12 : 0.1, 0.03), T(ax * s / 2, 0, az * s / 2, 0, 0, az ? 0.8 : 0, 1, 1, 1), C.wood2);
  return b.build();
}
function barrelGeo() {
  const b = new Builder();
  b.add(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 16), T(), [1, 1, 1]);
  for (const y of [-0.3, 0.3]) b.add(new THREE.TorusGeometry(0.43, 0.035, 5, 18), T(0, y, 0, Math.PI / 2, 0, 0), C.steel);
  b.add(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 14), T(0, 0.505, 0), C.steel);
  return b.build();
}
function tireGeo() {
  const b = new Builder();
  b.add(new THREE.TorusGeometry(0.36, 0.16, 8, 18), T(0, 0, 0, Math.PI / 2, 0, 0), C.black);
  b.add(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 14), T(), C.steel);
  return b.build();
}
function coneGeo() {
  const b = new Builder();
  b.add(new THREE.CylinderGeometry(0.06, 0.3, 0.72, 14), T(0, 0.02, 0), C.orange);
  b.add(new THREE.CylinderGeometry(0.155, 0.205, 0.14, 14), T(0, 0.08, 0), C.white);
  b.add(rb(0.68, 0.06, 0.68, 0.03), T(0, -0.35, 0), C.orange);
  return b.build();
}
function dominoGeo(w, h, d) {
  const b = new Builder();
  b.add(rb(w, h, d, 0.04), T(), [1, 1, 1]);
  for (const y of [-0.28, 0.28]) b.add(new THREE.CylinderGeometry(0.07, 0.07, w + 0.01, 10), T(0, y * h, 0, 0, 0, Math.PI / 2), C.white);
  b.add(rb(w + 0.01, 0.03, d * 0.8, 0.01), T(), C.white);
  return b.build();
}
function lampGeo() {
  const b = new Builder();
  b.add(new THREE.CylinderGeometry(0.07, 0.1, 2.6, 8), T(0, 0, 0), C.navy);
  b.add(rb(0.34, 0.16, 0.34, 0.05), T(0, -1.24, 0), C.navy);
  b.add(new THREE.CylinderGeometry(0.22, 0.12, 0.1, 8), T(0, 1.32, 0), C.navy);
  b.add(new THREE.ConeGeometry(0.27, 0.22, 8), T(0, 1.88, 0), C.navy);
  b.add(new THREE.IcosahedronGeometry(0.06, 0), T(0, 2.02, 0), C.navy);
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + Math.PI / 4; b.add(rb(0.035, 0.46, 0.035, 0.01), T(Math.cos(a) * 0.185, 1.56, Math.sin(a) * 0.185), C.navy); }
  return b.build();
}
function bulbGeo() { const b = new Builder(); b.add(new THREE.CylinderGeometry(0.17, 0.14, 0.42, 8), T(0, 1.56, 0), [1, 1, 1]); return b.build(); }
function fenceGeo() {
  const b = new Builder();
  for (const x of [-0.9, 0.9]) b.add(rb(0.14, 0.95, 0.14, 0.03), T(x, 0, 0), C.wood2);
  for (const y of [-0.12, 0.26]) b.add(rb(2.0, 0.13, 0.07, 0.03), T(0, y, 0), C.cream);
  return b.build();
}
function ballGeo() {
  const g = new THREE.IcosahedronGeometry(0.85, 2);
  const b = new Builder();
  const pent = [];
  const ico = new THREE.IcosahedronGeometry(1, 0).attributes.position;
  for (let i = 0; i < ico.count; i++) pent.push(new THREE.Vector3(ico.getX(i), ico.getY(i), ico.getZ(i)).normalize());
  b.add(g, T(), (wx, wy, wz) => { const v = new THREE.Vector3(wx, wy, wz).normalize(); for (const p of pent) if (v.dot(p) > 0.93) return C.navy; return C.white; });
  return b.build();
}
function duckGeo() {
  const b = new Builder();
  const Y = lin(0xFFD23F), O = lin(0xFF8A2A);
  b.add(new THREE.SphereGeometry(0.42, 16, 12), T(0, 0.3, 0, 0, 0, 0, 1.15, 0.8, 1), Y);
  b.add(new THREE.SphereGeometry(0.27, 16, 12), T(0, 0.78, -0.22), Y);
  b.add(new THREE.ConeGeometry(0.1, 0.24, 10), T(0, 0.74, -0.52, -Math.PI / 2, 0, 0, 1.3, 1, 0.6), O);
  for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.045, 8, 6), T(s * 0.13, 0.86, -0.43), C.navy);
  b.add(new THREE.ConeGeometry(0.12, 0.25, 8), T(0, 0.48, 0.42, Math.PI / 2 + 0.6, 0, 0), Y);
  return b.build();
}
function wrenchGeo() {
  const sh = new THREE.Shape();
  sh.moveTo(-0.9, -0.1); sh.lineTo(0.55, -0.1); sh.absarc(0.82, 0, 0.3, Math.PI + 0.45, Math.PI * 3 - 0.45, false); sh.lineTo(0.55, 0.1); sh.lineTo(-0.9, 0.1); sh.absarc(-0.9, 0, 0.1, Math.PI / 2, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 10 });
  g.center();
  const b = new Builder();
  b.add(g, T(0, 0, 0, -Math.PI / 2, 0, 0), lin(0xC9CFDF));
  return b.build();
}

// snowman: body origin is the centre of the middle ball, the ground is 1.3 below; it faces +z
const SNOWMEN = [[-6.8, 15.0, 0.5], [5.9, 14.1, -0.3], [-5.8, -48.6, 0.2], [14.6, 37.4, 0.3], [-12.8, 74.2, -0.2], [30, 8, 0.1], [-42.4, -0.6, 0.4]];
function snowmanGeo() {
  const b = new Builder();
  const W = lin(0xF3F6FD), coal = lin(0x23263A), carrot = lin(0xFF8A3D), twig = lin(0x6E4256), hat = lin(0x1E2340), band = lin(0xFF4FA0), scarf = lin(0xFF4FA0), scarf2 = lin(0xFFC857);
  b.add(new THREE.SphereGeometry(0.64, 18, 12), T(0, -0.72, 0, 0, 0, 0, 1, 0.9, 1), W);
  b.add(new THREE.SphereGeometry(0.47, 18, 12), T(0, 0.02, 0), W);
  b.add(new THREE.SphereGeometry(0.34, 16, 12), T(0, 0.66, 0), W);
  const onHead = (a, e, r = 0.335) => [Math.sin(a) * Math.cos(e) * r, 0.66 + Math.sin(e) * r, Math.cos(a) * Math.cos(e) * r];
  for (const s of [-1, 1]) { const p = onHead(s * 0.34, 0.26); b.add(new THREE.SphereGeometry(0.048, 8, 6), T(p[0], p[1], p[2]), coal); }
  for (let k = 0; k < 5; k++) { const a = (k - 2) * 0.24, p = onHead(a, -0.3 - 0.12 * (1 - (a / 0.5) ** 2)); b.add(new THREE.SphereGeometry(0.028, 6, 4), T(p[0], p[1], p[2]), coal); }
  b.add(new THREE.ConeGeometry(0.065, 0.36, 8), T(0, 0.64, 0.5, Math.PI / 2 - 0.08, 0, 0), carrot);
  for (const e of [0.42, 0.08, -0.26]) b.add(new THREE.SphereGeometry(0.05, 8, 6), T(0, 0.02 + Math.sin(e) * 0.462, Math.cos(e) * 0.462), coal);
  // scarf with a tail, hat with a pink band, twig arms
  b.add(new THREE.TorusGeometry(0.28, 0.08, 6, 20), T(0, 0.38, 0, Math.PI / 2, 0, 0, 1, 1, 0.8), scarf);
  b.add(rb(0.15, 0.46, 0.06, 0.025), T(0.17, 0.16, 0.34, 0.18, 0, 0.16), scarf);
  b.add(rb(0.155, 0.07, 0.065, 0.02), T(0.205, -0.03, 0.375, 0.18, 0, 0.16), scarf2);
  b.add(new THREE.CylinderGeometry(0.37, 0.37, 0.05, 18), T(0.03, 0.95, 0, 0, 0, -0.1), hat);
  b.add(new THREE.CylinderGeometry(0.22, 0.245, 0.36, 18), T(0.05, 1.14, 0, 0, 0, -0.1), hat);
  b.add(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 18), T(0.04, 1.0, 0, 0, 0, -0.1), band);
  for (const s of [-1, 1]) {
    b.add(new THREE.CylinderGeometry(0.022, 0.034, 0.74, 5), T(s * 0.72, 0.27, 0, 0, 0, -s * 1.13), twig);
    b.add(new THREE.CylinderGeometry(0.014, 0.02, 0.22, 4), T(s * 0.98, 0.5, 0, 0, 0, -s * 0.35), twig);
    b.add(new THREE.CylinderGeometry(0.014, 0.02, 0.2, 4), T(s * 1.02, 0.36, 0, 0, 0, -s * 1.7), twig);
  }
  return b.build();
}

export function buildProps(scene, phys, quality) {
  const sets = {};
  const solidI = M.inst, glossyI = M.instGlossy;
  const glowI = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  glowI.onBeforeCompile = sh => {
    sh.uniforms.uLamps = U.lamps;
    sh.fragmentShader = 'uniform float uLamps;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(vec3(0.85, 0.82, 0.75), vec3(2.6, 1.9, 1.1), uLamps);');
  };
  const vc = m => { const c = m.clone(); c.vertexColors = true; return c; };
  const solidVC = vc(solidI), glossyVC = vc(glossyI);

  sets.crate = new PropSet(scene, phys, { max: 40, mass: 4, parts: [{ geo: crateGeo(0.92), mat: solidVC }], shape: b => b.addShape(new CANNON.Box(new CANNON.Vec3(0.46, 0.46, 0.46))), kind: 'wood' });
  sets.barrel = new PropSet(scene, phys, { max: 20, mass: 6, parts: [{ geo: barrelGeo(), mat: glossyVC, tinted: true }], shape: b => b.addShape(new CANNON.Cylinder(0.42, 0.42, 1.0, 10)), kind: 'metal' });
  sets.tire = new PropSet(scene, phys, { max: 24, mass: 2.4, parts: [{ geo: tireGeo(), mat: solidVC }], shape: b => b.addShape(new CANNON.Cylinder(0.52, 0.52, 0.32, 10)), kind: 'rubber' });
  sets.cone = new PropSet(scene, phys, { max: 30, mass: 0.9, parts: [{ geo: coneGeo(), mat: glossyVC }], shape: b => { b.addShape(new CANNON.Cylinder(0.08, 0.3, 0.72, 8)); }, kind: 'plastic' });
  sets.domino = new PropSet(scene, phys, { max: 48, mass: 1.2, sleepSpeed: 0.04, sleepTime: 2.5, angDamp: 0.02, linDamp: 0.01, material: 'domino', parts: [{ geo: dominoGeo(0.18, 1.5, 0.78), mat: glossyVC, tinted: true }], shape: b => b.addShape(new CANNON.Box(new CANNON.Vec3(0.09, 0.75, 0.39))), kind: 'plastic' });
  sets.ball = new PropSet(scene, phys, { max: 1, mass: 2.2, material: 'ball', linDamp: 0.18, angDamp: 0.25, parts: [{ geo: ballGeo(), mat: glossyVC }], shape: b => b.addShape(new CANNON.Sphere(0.85)), kind: 'ball' });
  sets.lamp = new PropSet(scene, phys, { max: 40, mass: 14, breakable: true, parts: [{ geo: lampGeo(), mat: glossyVC }, { geo: bulbGeo(), mat: glowI, cast: false }], shape: b => { b.addShape(new CANNON.Box(new CANNON.Vec3(0.12, 1.3, 0.12))); b.addShape(new CANNON.Sphere(0.3), new CANNON.Vec3(0, 1.55, 0)); }, kind: 'metal' });
  sets.fence = new PropSet(scene, phys, { max: 60, mass: 3, breakable: true, parts: [{ geo: fenceGeo(), mat: solidVC }], shape: b => b.addShape(new CANNON.Box(new CANNON.Vec3(1.0, 0.45, 0.08))), kind: 'wood' });
  if (WINTER) sets.snowman = new PropSet(scene, phys, {
    max: SNOWMEN.length, mass: 3, breakable: true, poof: true, breakV: 1.2, parts: [{ geo: snowmanGeo(), mat: solidVC }], kind: 'snow',
    shape: b => { b.addShape(new CANNON.Sphere(0.6), new CANNON.Vec3(0, -0.72, 0)); b.addShape(new CANNON.Sphere(0.45), new CANNON.Vec3(0, 0.02, 0)); b.addShape(new CANNON.Sphere(0.32), new CANNON.Vec3(0, 0.66, 0)); }
  });

  // ---------- placements ----------
  const ground = (x, z) => Math.max(heightAt(x, z), -0.3);
  if (sets.snowman) for (const [x, z, yaw] of SNOWMEN) { sets.snowman.add(x, ground(x, z) + 1.3, z, yaw); occ.add(x, z, 1.6); }
  // crate pyramids
  const pyramid = (cx, cz, yaw, rows = 4) => {
    const s = 0.94;
    for (let r = 0; r < rows; r++) for (let i = 0; i < rows - r; i++) {
      const lx = (i - (rows - r - 1) / 2) * (s + 0.02);
      const x = cx + Math.cos(yaw) * lx, z = cz - Math.sin(yaw) * lx;
      sets.crate.add(x, ground(cx, cz) + 0.47 + r * s, z, yaw);
    }
    occ.add(cx, cz, 2.5);
  };
  pyramid(8.5, 25.5, 0.25, 4);
  pyramid(31.5, 34.5, -0.4, 3);
  pyramid(-30, 27, 0.6, 3);
  // barrels and tire stacks by the garage
  const bcols = [C.orange, lin(0x3A6FE0), C.orange, C.navy];
  [[45.9, 20.6], [46.8, 21.5], [45.2, 21.8], [56.8, 22.4], [57.6, 23.3]].forEach(([x, z], i) => sets.barrel.add(x, ground(x, z) + 0.5, z, rand() * TAU, { tint: bcols[i % 4] }));
  [[55.8, 33.2], [57.2, 33.0], [56.5, 34.4]].forEach(([x, z]) => { for (let k = 0; k < 4; k++) sets.tire.add(x, ground(x, z) + 0.16 + k * 0.33, z, rand()); });
  // cone slalom on the south road + some near the garage
  for (let k = 0; k < 6; k++) { const z = 21.5 + k * 2.2, x = (k % 2 ? 1.1 : -1.1); sets.cone.add(x, ground(x, z) + 0.36, z, 0); }
  [[36.5, 27.2], [37.4, 28.6], [38.3, 30]].forEach(([x, z]) => sets.cone.add(x, ground(x, z) + 0.36, z, 0));
  // dominoes in an S-curve, evenly spaced along the arc
  {
    const pal = [C.magenta, C.yellow, C.mint, C.sky, C.orange, C.cream];
    const dense = [];
    for (let t = 0; t <= 1.0001; t += 1 / 500) dense.push([DOMINO.x - 7.6 + t * 15.2, DOMINO.z + Math.sin(t * TAU * 0.95) * 2.4]);
    const pts = [dense[0]];
    let acc = 0;
    for (let i = 1; i < dense.length; i++) { acc += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]); if (acc >= 1.0) { pts.push(dense[i]); acc = 0; } }
    pts.forEach((p, i) => {
      const n = pts[Math.min(pts.length - 1, i + 1)], pr = pts[Math.max(0, i - 1)];
      const yaw = Math.atan2(-(n[1] - pr[1]), n[0] - pr[0]);
      sets.domino.add(p[0], ground(p[0], p[1]) + 0.76, p[1], yaw, { tint: pal[i % pal.length] });
    });
  }
  // ball
  sets.ball.add(PITCH.x, ground(PITCH.x, PITCH.z) + 0.86, PITCH.z, 0);
  // lamps along the roads
  const lamps = [];
  for (const r of ROADS) {
    const pts = r.pts, n = pts.length;
    let acc = 0, side = 1;
    for (let i = 1; i < n; i++) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc < (r.closed ? 15 : 13)) continue;
      const a = pts[i - 1], c = pts[(i + 1) % n];
      let tx = c[0] - a[0], tz = c[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const off = r.w / 2 + 0.9;
      const x = pts[i][0] - tz * off * side, z = pts[i][1] + tx * off * side;
      if (!inside(x, z, 1.5) || riverD.get(x, z) < RIVER_W + 3.6 || featD.get(x, z) < 0.6 || lamps.some(l => Math.hypot(l[0] - x, l[1] - z) < 7) || Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 0.5) continue;
      acc = 0; side = -side;
      lamps.push([x, z]);
    }
  }
  // lamps around the plaza
  for (const deg of [20, 160, 200, 340]) { const a = deg / 180 * Math.PI; lamps.push([PLAZA.x + Math.cos(a) * (PLAZA.r + 1.2), PLAZA.z + Math.sin(a) * (PLAZA.r + 1.2)]); }
  lamps.forEach(([x, z]) => { sets.lamp.add(x, ground(x, z) + 1.32, z, rand() * TAU); occ.add(x, z, 0.8); });
  // fences: pond (south arc) and along the pitch
  const fenceLine = (pts, closed = false) => {
    for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 2.0));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        const yaw = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
        sets.fence.add(x, ground(x, z) + 0.48, z, yaw);
      }
    }
  };
  {
    const arc = [];
    for (let k = 0; k <= 7; k++) { const a = Math.PI * 0.08 + k / 7 * Math.PI * 0.84; arc.push([-19 + Math.cos(a) * 7.6, -15 + Math.sin(a) * 7.6]); }
    fenceLine(arc);
    const P = PITCH, fx = P.hw + 1.2, fz = P.hz + 1.2;
    fenceLine([[P.x - fx + 1.2, P.z - fz], [P.x + fx - 1.2, P.z - fz]]);
    fenceLine([[P.x - fx + 1.2, P.z + fz], [P.x - 1.6, P.z + fz]]);
    fenceLine([[P.x + 1.6, P.z + fz], [P.x + fx - 1.2, P.z + fz]]);
  }

  // ---------- light pools under lamps (night) ----------
  const poolTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,214,150,1)'); gr.addColorStop(0.45, 'rgba(255,190,120,0.45)'); gr.addColorStop(1, 'rgba(255,170,100,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const poolGeo = new THREE.PlaneGeometry(6.5, 6.5); poolGeo.rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, sets.lamp.items.length);
  sets.lamp.items.forEach((it, i) => { const p = it.body.position; pools.setMatrixAt(i, _m.makeTranslation(p.x, ground(p.x, p.z) + 0.06, p.z)); });
  pools.instanceMatrix.needsUpdate = true; pools.frustumCulled = false; pools.renderOrder = 3;
  scene.add(pools);

  // ---------- football pitch ----------
  const pitch = new Builder();
  {
    const P = PITCH, y = ground(P.x, P.z) + 0.03;
    const stripes = 10;
    for (let i = 0; i < stripes; i++) {
      const x0 = P.x - P.hw + i * (2 * P.hw / stripes);
      pitch.add(new THREE.PlaneGeometry(2 * P.hw / stripes, 2 * P.hz).rotateX(-Math.PI / 2), T(x0 + P.hw / stripes, y, P.z), i % 2 ? lin(0x6CC662) : lin(0x5DB858));
    }
    const line = (x, z, w, d) => pitch.add(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), T(x, y + 0.006, z), C.white);
    line(P.x, P.z - P.hz, 2 * P.hw, 0.14); line(P.x, P.z + P.hz, 2 * P.hw, 0.14);
    line(P.x - P.hw, P.z, 0.14, 2 * P.hz); line(P.x + P.hw, P.z, 0.14, 2 * P.hz); line(P.x, P.z, 0.14, 2 * P.hz);
    const ring = new THREE.RingGeometry(1.6, 1.74, 40).rotateX(-Math.PI / 2);
    pitch.add(ring, T(P.x, y + 0.006, P.z), C.white);
    // goals
    for (const s of [-1, 1]) {
      const gx = P.x + s * (P.hw + 0.35);
      for (const zz of [-1.7, 1.7]) {
        pitch.add(new THREE.CylinderGeometry(0.09, 0.09, 1.9, 8), T(gx, y + 0.95, P.z + zz), C.white);
        phys.cyl(gx, y, P.z + zz, 0.12, 1.9);
      }
      pitch.add(new THREE.CylinderGeometry(0.09, 0.09, 3.5, 8), T(gx, y + 1.9, P.z, Math.PI / 2, 0, 0), C.white);
      // net (back + sides)
      pitch.add(new THREE.BoxGeometry(0.04, 1.8, 3.4), T(gx + s * 1.1, y + 0.9, P.z), lin(0xDCE3F5));
      for (const zz of [-1.7, 1.7]) pitch.add(new THREE.BoxGeometry(1.1, 1.8, 0.04), T(gx + s * 0.55, y + 0.9, P.z + zz), lin(0xDCE3F5));
      phys.box(gx + s * 1.12, y + 0.9, P.z, 0.06, 0.9, 1.7);
      for (const zz of [-1.7, 1.7]) phys.box(gx + s * 0.56, y + 0.9, P.z + zz, 0.56, 0.9, 0.05);
    }
  }
  const pitchMesh = mesh(pitch.build(), M.solid, { cast: true, receive: true, name: 'pitch' });
  scene.add(pitchMesh);

  // ---------- collectibles (no physics) ----------
  const duckSpots = [[-22.8, -18.6], [-4.5, -64.2], [46.5, -24.6], [55.5, 34.6], [-36.5, 33.5]];
  duckSpots.forEach(([x, z]) => occ.add(x, z, 2.8));
  const duckM = new THREE.Mesh(duckGeo(), glossyVC);
  const ducks = duckSpots.map(([x, z], i) => {
    const d = duckM.clone(); d.castShadow = true;
    const wy = riverD.get(x, z) < RIVER_W + 1.6 ? -0.42 : heightAt(x, z);
    d.position.set(x, wy, z); d.rotation.y = rand() * TAU; d.userData = { i, x, z, y: wy, got: false, water: wy === -0.42 };
    scene.add(d); return d;
  });
  const wrench = new THREE.Mesh(wrenchGeo(), glossyVC);
  wrench.castShadow = true;
  const wx = 11.5, wz = -56.5;
  occ.add(wx, wz, 3);
  wrench.position.set(wx, heightAt(wx, wz) + 0.4, wz);
  wrench.userData = { x: wx, z: wz, y: heightAt(wx, wz), got: false };
  scene.add(wrench);

  const all = Object.values(sets);
  const items = all.flatMap(s => s.items);
  return {
    sets, items, pools, poolMat, ducks, wrench,
    sync() { for (const s of all) s.sync(); },
    // a snowman hit by the car bursts into snow: hide it and park the body out of the way
    poof(it) {
      const b = it.body;
      b.type = CANNON.Body.STATIC; b.mass = 0; b.updateMassProperties();
      b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
      b.position.set(it.home.p.x, -60, it.home.p.z);
      it.gone = true; it.goneT = 0; it.set.write(it);
    },
    resetAll() { for (const s of all) for (const it of s.items) s.reset(it); },
    update(dt, t, night) {
      // snowmen build themselves again once the car has driven away
      if (sets.snowman) for (const it of sets.snowman.items) {
        if (!it.gone) continue;
        it.goneT += dt;
        const c = U.car.value;
        if (it.goneT > 6 && Math.hypot(c.x - it.home.p.x, c.z - it.home.p.z) > 26) sets.snowman.reset(it);
      }
      ducks.forEach((d, i) => { if (d.userData.got) return; d.rotation.y += dt * 0.8; d.position.y = d.userData.y + (d.userData.water ? Math.sin(t * 2 + i) * 0.05 : 0.15 + Math.abs(Math.sin(t * 3 + i)) * 0.25); });
      if (!wrench.userData.got) { wrench.rotation.y += dt * 1.6; wrench.position.y = wrench.userData.y + 0.45 + Math.sin(t * 2.4) * 0.12; }
    }
  };
}

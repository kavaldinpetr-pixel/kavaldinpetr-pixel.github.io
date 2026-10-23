// 3D titles made of separate physics letters: the car can knock them over, and they quietly
// return to their places once the car has driven far away (or on "reset world").
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { Builder } from './builder.js';
import { G_CAR, G_DEBRIS, G_GROUND, G_PROP, G_STATIC } from './physics.js';
import { heightAt } from './layout.js';

const Y1 = new CANNON.Vec3(0, 1, 0), _u = new CANNON.Vec3();
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);

// titles: [{ id, x, z, yaw, lines: [{ text, size, depth, dx, dz, face, side }] }]
export function buildLetters(scene, phys, mat, font, titles) {
  const items = [], groups = [], lines = [];
  const res = font.data.resolution;
  for (const t of titles) {
    const ca = Math.cos(t.yaw), sa = Math.sin(t.yaw);
    const toW = (lx, lz) => [t.x + lx * ca + lz * sa, t.z - lx * sa + lz * ca];
    const g = { id: t.id, items: [], x: t.x, z: t.z, moved: false, farT: 0 };
    for (const line of t.lines) {
      const size = line.size, depth = line.depth, scale = size / res, track = size * 0.07;
      const opts = { font, size, depth, curveSegments: size > 1 ? 3 : 2, bevelEnabled: true, bevelThickness: Math.min(depth * 0.3, size * 0.05), bevelSize: size * 0.028, bevelSegments: 1 };
      const gl = [];
      let pen = 0;
      for (const ch of line.text) {
        const gd = font.data.glyphs[ch] || font.data.glyphs['?'];
        const adv = (gd ? gd.ha : res * 0.5) * scale;
        if (ch.trim()) {
          const geo = new TextGeometry(ch, opts);
          geo.computeBoundingBox();
          const bb = geo.boundingBox;
          gl.push({ ch, geo, bb, cx: pen + (bb.min.x + bb.max.x) / 2, w: bb.max.x - bb.min.x });
        }
        pen += adv + track;
      }
      // never let two letter boxes overlap (they would push each other apart when woken)
      for (let i = 1; i < gl.length; i++) {
        const a = gl[i - 1], b = gl[i], gap = (b.cx - b.w / 2) - (a.cx + a.w / 2);
        if (gap < 0.05) { const d = 0.05 - gap; for (let k = i; k < gl.length; k++) gl[k].cx += d; }
      }
      if (!gl.length) continue;
      const left = gl[0].cx - gl[0].w / 2, right = gl[gl.length - 1].cx + gl[gl.length - 1].w / 2, off = -(left + right) / 2 + (line.dx || 0);
      { const [cx, cz] = toW(line.dx || 0, line.dz || 0); lines.push({ x: cx, z: cz, yaw: t.yaw, w: right - left, d: Math.max(...gl.map(L => L.bb.max.z - L.bb.min.z)), gy: heightAt(cx, cz) }); }
      for (const L of gl) {
        // the box stands on the baseline: descenders (р, у, p, y) and bevel overshoot sink into the stand,
        // so every letter of a word lines up
        const bb = L.bb, w = L.w, h = bb.max.y, d = bb.max.z - bb.min.z;
        L.geo.translate(-(bb.min.x + bb.max.x) / 2, -h / 2, -(bb.min.z + bb.max.z) / 2);
        const B = new Builder();
        B.add(L.geo, _m.identity(), (wx, wy, wz, lx, ly, lz, nx, ny, nz) => (Math.abs(nz) > 0.6 ? line.face : line.side));
        const geo = B.build();
        L.geo.dispose();
        const lx = L.cx + off, lz = line.dz || 0;
        const [wx, wz] = toW(lx, lz);
        const hx = w / 2, hz = d / 2;
        let gy = -Infinity;
        for (const [cx, cz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz], [0, 0]]) { const [px, pz] = toW(lx + cx, lz + cz); gy = Math.max(gy, heightAt(px, pz)); }
        const body = new CANNON.Body({
          mass: Math.max(2.5, Math.min(9, 5 * w * h * d)), material: phys.mat.prop,
          collisionFilterGroup: G_DEBRIS, collisionFilterMask: G_GROUND | G_CAR | G_PROP | G_STATIC | G_DEBRIS
        });
        body.addShape(new CANNON.Box(new CANNON.Vec3(hx * 0.98, h / 2, hz)));
        body.position.set(wx, gy + h / 2 + 0.004, wz);
        body.quaternion.setFromEuler(0, t.yaw, 0);
        body.allowSleep = true; body.sleepSpeedLimit = 0.22; body.sleepTimeLimit = 0.5;
        body.linearDamping = 0.04; body.angularDamping = 0.1;
        phys.world.addBody(body);
        body.sleep();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
        mesh.name = 'letter';
        scene.add(mesh);
        const it = { ch: L.ch, body, mesh, group: g, home: { p: body.position.clone(), q: body.quaternion.clone() }, knocked: false, dirty: true, set: { def: { kind: 'letter' } } };
        body.userData = it;
        body.addEventListener('wakeup', () => { g.moved = true; it.dirty = true; });
        body.addEventListener('sleep', () => { it.dirty = true; });
        items.push(it); g.items.push(it);
      }
    }
    groups.push(g);
  }

  const write = it => {
    const b = it.body, p = b.interpolatedPosition, q = b.interpolatedQuaternion;
    it.mesh.matrix.compose(_p.set(p.x, p.y, p.z), _q.set(q.x, q.y, q.z, q.w), _s);
    it.mesh.matrixWorldNeedsUpdate = true;
  };
  items.forEach(write);

  const resetGroup = g => {
    for (const it of g.items) {
      const b = it.body;
      b.position.copy(it.home.p); b.quaternion.copy(it.home.q);
      b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
      b.interpolatedPosition.copy(b.position); b.interpolatedQuaternion.copy(b.quaternion);
      b.previousPosition && b.previousPosition.copy(b.position);
      b.sleep();
      it.knocked = false;
      write(it);
    }
    g.moved = false; g.farT = 0;
  };

  let acc = 0;
  return {
    items, groups, lines,
    sync() {
      for (const it of items) {
        const b = it.body;
        if (b.sleepState !== CANNON.Body.SLEEPING || it.dirty) { write(it); it.dirty = false; }
      }
    },
    // knock counting + bringing letters home when nobody is looking
    update(dt, carPos, onKnock) {
      acc += dt;
      if (acc < 0.2) return;
      const step = acc; acc = 0;
      for (const g of groups) {
        if (!g.moved) continue;
        for (const it of g.items) {
          const b = it.body;
          if (b.position.y < -50 && b.sleepState !== CANNON.Body.SLEEPING) { b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); b.sleep(); }
          if (it.knocked) continue;
          const up = b.quaternion.vmult(Y1, _u).y;
          if (b.position.distanceTo(it.home.p) > 0.6 || up < 0.75) { it.knocked = true; if (onKnock) onKnock(it); }
        }
        const far = Math.hypot(carPos.x - g.x, carPos.z - g.z) > 38;
        g.farT = far ? g.farT + step : 0;
        if (g.farT > 2) resetGroup(g);
      }
    },
    resetAll() { groups.forEach(resetGroup); }
  };
}

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Builder, T } from './builder.js';
import { M } from './materials.js';
import { clamp, damp, lerp, lin } from './util.js';
import { heightAt } from './layout.js';
import { G_CAR, G_DEBRIS, G_GROUND, G_PROP, G_STATIC } from './physics.js';

export const OFF = 0.36; // chassis geometry sits this much above the centre of mass
export const CAR = {
  mass: 150, engine: 760, reverse: 420, boost: 1.75, vmax: 21, vmaxBoost: 31, vrev: 9,
  steerMax: 0.56, steerMin: 0.08, latAcc: 17.5, wheelbase: 1.69, brake: 9, idleBrake: 0.6,
  wheelR: 0.42, grip: 3.1, gripDrift: 1.4
};

// ---------------- physics ----------------
export class Car {
  constructor(phys) {
    this.phys = phys;
    const body = this.body = new CANNON.Body({ mass: CAR.mass, material: phys.mat.car, collisionFilterGroup: G_CAR, collisionFilterMask: G_GROUND | G_PROP | G_STATIC | G_DEBRIS });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.68, 0.27, 1.22)), new CANNON.Vec3(0, 0.12 + OFF, 0));
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.6, 0.27, 0.6)), new CANNON.Vec3(0, 0.64 + OFF, 0.25));
    body.angularDamping = 0.3; body.linearDamping = 0.02;
    body.updateMassProperties();
    body.inertia.x *= 1.6; body.inertia.z *= 1.4;
    body.invInertia.set(1 / body.inertia.x, 1 / body.inertia.y, 1 / body.inertia.z);
    body.updateInertiaWorld(true);
    body.allowSleep = false;
    const v = this.vehicle = new CANNON.RaycastVehicle({ chassisBody: body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
    const wo = {
      radius: CAR.wheelR, directionLocal: new CANNON.Vec3(0, -1, 0), suspensionStiffness: 34, suspensionRestLength: 0.4,
      frictionSlip: CAR.grip, dampingRelaxation: 2.8, dampingCompression: 4.8, maxSuspensionForce: 9000, rollInfluence: 0.02,
      axleLocal: new CANNON.Vec3(-1, 0, 0), chassisConnectionPointLocal: new CANNON.Vec3(), maxSuspensionTravel: 0.36,
      customSlidingRotationalSpeed: -30, useCustomSlidingRotationalSpeed: true
    };
    this.wheelPos = [[-0.71, OFF, -0.83], [0.71, OFF, -0.83], [-0.71, OFF, 0.86], [0.71, OFF, 0.86]];
    for (const p of this.wheelPos) { wo.chassisConnectionPointLocal.set(p[0], p[1], p[2]); v.addWheel(wo); }
    v.addToWorld(phys.world);
    // the wheels only feel the ground, buildings and props; loose debris (title letters, bowling pins)
    // is shoved by the body instead of being driven over (otherwise the jeep beaches itself on it)
    const w = phys.world, rayOpts = { skipBackfaces: true, collisionFilterMask: G_GROUND | G_STATIC | G_PROP };
    v.world = { rayTest: (from, to, res) => w.raycastClosest(from, to, rayOpts, res) };
    this.input = { throttle: 0, steer: 0, brake: false, boost: false };
    this.steer = 0; this.thr = 0;
    this.speed = 0; this.side = 0;
    this.air = 0; this.grounded = 0;
    this.flipT = 0;
    this.boosting = false;
    this.inWater = false;
    this._f = new CANNON.Vec3(); this._v = new CANNON.Vec3(); this._q = new CANNON.Quaternion();
    phys.world.addEventListener('preStep', () => this.preStep());
  }
  place(x, z, yaw, y) {
    const b = this.body;
    const h = y ?? heightAt(x, z);
    b.position.set(x, h + 0.62, z);
    b.quaternion.setFromEuler(0, yaw, 0);
    b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
    b.interpolatedPosition.copy(b.position); b.interpolatedQuaternion.copy(b.quaternion);
    b.previousPosition.copy(b.position); b.previousQuaternion.copy(b.quaternion);
    this.vehicle.wheelInfos.forEach(w => { w.suspensionLength = w.suspensionRestLength; w.deltaRotation = 0; w.rotation = 0; });
    this.steer = 0; this.air = 0; this.flipT = 0;
  }
  forward(out = new CANNON.Vec3()) { return this.body.quaternion.vmult(this._v.set(0, 0, -1), out); }
  up(out = new CANNON.Vec3()) { return this.body.quaternion.vmult(this._v.set(0, 1, 0), out); }
  get yaw() { const f = this.forward(new CANNON.Vec3()); return Math.atan2(-f.x, -f.z); }

  // per frame: map input to engine / brake / steering
  control(dt) {
    const v = this.vehicle, b = this.body, inp = this.input;
    const f = this.forward(new CANNON.Vec3());
    const right = b.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
    this.speed = b.velocity.dot(f);
    this.side = b.velocity.dot(right);
    const sp = this.speed;
    this.boosting = inp.boost && inp.throttle > 0.1 && this.grounded > 0;
    const vmax = this.boosting ? CAR.vmaxBoost : CAR.vmax;
    // keyboard throttle eases in (no jolt), lets go quickly
    this.thr = damp(this.thr, inp.throttle, Math.abs(inp.throttle) > Math.abs(this.thr) ? 7 : 12, dt);
    const thr = Math.abs(inp.throttle) > 0.05 ? this.thr : 0;
    let engine = 0, brake = 0;
    if (inp.throttle > 0.05) {
      if (sp < -0.8) brake = CAR.brake;
      else if (sp < vmax) engine = CAR.engine * Math.max(0, thr) * (this.boosting ? CAR.boost : 1) * (1 - 0.35 * clamp(sp / vmax, 0, 1));
    } else if (inp.throttle < -0.05) {
      if (sp > 0.8) brake = CAR.brake;
      else if (-sp < CAR.vrev) engine = CAR.reverse * Math.min(0, thr);
    } else brake = CAR.idleBrake;
    if (this.inWater) engine *= 0.35;
    // steering limited by a lateral-acceleration budget: tight at walking pace, calm at speed
    const vs = Math.max(Math.abs(sp), 0.5);
    let sMax = Math.min(CAR.steerMax, Math.max(CAR.steerMin, Math.atan(CAR.wheelbase * CAR.latAcc / (vs * vs))));
    if (inp.brake) sMax = Math.max(sMax, 0.34);
    const target = inp.steer * sMax;
    this.steer = damp(this.steer, target, Math.abs(target) < Math.abs(this.steer) || target * this.steer < 0 ? 13 : 8, dt);
    v.setSteeringValue(this.steer, 0); v.setSteeringValue(this.steer, 1);
    // 4x4: all wheels drive (rear a bit more)
    v.applyEngineForce(engine * 0.42, 0); v.applyEngineForce(engine * 0.42, 1);
    v.applyEngineForce(engine * 0.58, 2); v.applyEngineForce(engine * 0.58, 3);
    for (let i = 0; i < 4; i++) v.setBrake(brake, i);
    const hb = inp.brake;
    v.wheelInfos[2].frictionSlip = v.wheelInfos[3].frictionSlip = hb ? CAR.gripDrift : CAR.grip;
    v.wheelInfos[0].frictionSlip = v.wheelInfos[1].frictionSlip = hb ? CAR.grip * 0.85 : CAR.grip;
    if (hb) { v.setBrake(CAR.brake * 0.34, 2); v.setBrake(CAR.brake * 0.34, 3); }
    // contact state
    let n = 0;
    for (const w of v.wheelInfos) if (w.isInContact) n++;
    this.grounded = n;
    if (n === 0) this.air += dt; else this.air = 0;
    // stuck upside down -> flip back
    const up = this.up(new CANNON.Vec3());
    if (up.y < 0.35 && Math.abs(sp) < 3 && n < 2) this.flipT += dt; else this.flipT = 0;
    if (this.flipT > 1.3) { this.flipT = 0; const p = b.position; this.place(p.x, p.z, this.yaw, Math.max(heightAt(p.x, p.z), p.y - 0.8)); return 'flipped'; }
    return null;
  }

  // per physics substep: air control, downforce, water drag
  preStep() {
    const b = this.body;
    const av = b.angularVelocity;
    // arcade stabiliser: spring the up-vector toward the ground normal (or world up in the air) + damp pitch/roll
    {
      const q = b.quaternion;
      const up = q.vmult(this._f.set(0, 1, 0), this._f);
      let tx = 0, ty = 1, tz = 0;
      if (this.grounded > 0) {
        let nx = 0, ny = 0, nz = 0;
        for (const w of this.vehicle.wheelInfos) if (w.isInContact) { const n = w.raycastResult.hitNormalWorld; nx += n.x; ny += n.y; nz += n.z; }
        const l = Math.hypot(nx, ny, nz) || 1; tx = nx / l; ty = ny / l; tz = nz / l;
        if (ty < 0.6) { tx = 0; ty = 1; tz = 0; }
      }
      // axis = up x target
      const ax = up.y * tz - up.z * ty, ay = up.z * tx - up.x * tz, az = up.x * ty - up.y * tx;
      const k = this.grounded === 0 ? 0.16 : (this.grounded < 4 ? 0.12 : 0.05);
      av.x += ax * k * 6; av.y += ay * k * 6; av.z += az * k * 6;
      const inv = this._q.copy(q).conjugate();
      const wl = inv.vmult(av, this._v);
      const kd = this.grounded === 4 ? 0.95 : 0.88;
      wl.x *= kd; wl.z *= kd;
      if (wl.x > 2.6) wl.x = 2.6; else if (wl.x < -2.6) wl.x = -2.6;
      if (wl.z > 2.6) wl.z = 2.6; else if (wl.z < -2.6) wl.z = -2.6;
      q.vmult(wl, av);
    }
    // keep handbrake slides playful but never a full spin
    if (this.grounded > 0 && Math.abs(av.y) > 3.0) av.y *= this.input.brake ? 0.955 : 0.94;
    if (this.grounded > 0) {
      const v2 = b.velocity.x * b.velocity.x + b.velocity.z * b.velocity.z;
      b.applyForce(this._f.set(0, -Math.min(v2, 900) * 0.9, 0));
    }
    if (this.inWater) {
      b.velocity.x *= 0.97; b.velocity.z *= 0.97;
      if (b.velocity.y < 0) b.velocity.y *= 0.9;
    }
  }
}

// ---------------- model ----------------
const COL = {
  paint: 0xF0397E, gold: 0xE9B949, top: lin(0x2B2340), dark: lin(0x302A44), darker: lin(0x221D33), glass: lin(0x1C1A33), tire: lin(0x26212F),
  rim: lin(0xE9E3F2), red: lin(0xFF3B4A), amber: lin(0xFFB938), steel: lin(0x9AA0B8), hook: lin(0xFFC23A)
};
function rbox(w, h, d, r = 0.08, s = 3) { return new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)); }

// chunky toy off-roader: boxy tub, slotted grille, round lamps, flared arches, roof light bar
export function buildCarModel() {
  const group = new THREE.Group();
  const paint = new Builder(), trim = new Builder(), glass = new Builder(), lights = new Builder(), tail = new Builder();
  const W = [1, 1, 1];
  // tub + hood + cowl
  paint.add(rbox(1.42, 0.52, 2.38, 0.12), T(0, 0.16, 0.02), W);
  paint.add(rbox(1.36, 0.17, 1.02, 0.06), T(0, 0.47, -0.67, 0.05, 0, 0), W);
  paint.add(rbox(0.62, 0.05, 0.86, 0.025), T(0, 0.565, -0.66, 0.05, 0, 0), W);
  paint.add(rbox(1.32, 0.12, 0.3, 0.05), T(0, 0.5, -0.16), W);
  // windshield frame + glass
  paint.add(rbox(1.3, 0.5, 0.08, 0.035), T(0, 0.78, -0.2, -0.16, 0, 0), W);
  glass.add(rbox(1.12, 0.38, 0.05, 0.03), T(0, 0.79, -0.225, -0.16, 0, 0), COL.glass);
  // hard top with windows
  trim.add(rbox(1.36, 0.5, 1.14, 0.09), T(0, 0.8, 0.42), COL.top);
  trim.add(rbox(1.42, 0.08, 1.24, 0.04), T(0, 1.06, 0.4), COL.darker);
  glass.add(rbox(1.38, 0.26, 0.42, 0.04), T(0, 0.83, 0.16), COL.glass);
  glass.add(rbox(1.38, 0.26, 0.42, 0.04), T(0, 0.83, 0.68), COL.glass);
  glass.add(rbox(1.06, 0.26, 0.05, 0.03), T(0, 0.84, 0.995), COL.glass);
  // roof light bar
  trim.add(rbox(1.1, 0.09, 0.14, 0.03), T(0, 1.14, -0.06), COL.darker);
  for (let i = 0; i < 5; i++) { trim.add(rbox(0.05, 0.12, 0.05, 0.02), T(-0.48 + i * 0.24, 1.09, -0.02), COL.darker); lights.add(rbox(0.15, 0.075, 0.04, 0.015), T(-0.48 + i * 0.24, 1.14, -0.14), [1, 0.93, 0.74]); }
  // grille: body-coloured with seven dark slots, round lamps
  paint.add(rbox(1.0, 0.38, 0.06, 0.03), T(0, 0.22, -1.2), W);
  for (let i = 0; i < 7; i++) trim.add(rbox(0.055, 0.25, 0.05, 0.02), T(-0.21 + i * 0.07, 0.22, -1.224), COL.darker);
  const lens = new THREE.CylinderGeometry(0.115, 0.115, 0.05, 20), bezel = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 20);
  for (const x of [-0.43, 0.43]) {
    trim.add(bezel, T(x, 0.25, -1.215, Math.PI / 2, 0, 0), COL.darker);
    lights.add(lens, T(x, 0.25, -1.24, Math.PI / 2, 0, 0), [1, 0.95, 0.8]);
    tail.add(rbox(0.12, 0.06, 0.04, 0.015), T(x * 1.05, 0.06, -1.22), COL.amber);
  }
  // flared arches + rock sliders + bumpers
  for (const z of [-0.83, 0.86]) for (const x of [-1, 1]) {
    trim.add(rbox(0.3, 0.13, 1.04, 0.05), T(x * 0.77, 0.38, z, 0, 0, x * -0.18), COL.dark);
    trim.add(rbox(0.22, 0.2, 0.2, 0.05), T(x * 0.79, 0.24, z - 0.5, 0, 0, 0), COL.dark);
    trim.add(rbox(0.22, 0.2, 0.2, 0.05), T(x * 0.79, 0.24, z + 0.5, 0, 0, 0), COL.dark);
  }
  for (const x of [-0.75, 0.75]) trim.add(rbox(0.14, 0.09, 0.78, 0.035), T(x, -0.07, 0.02), COL.dark);
  trim.add(rbox(1.66, 0.22, 0.26, 0.07), T(0, -0.04, -1.32), COL.dark);
  trim.add(rbox(1.66, 0.22, 0.24, 0.07), T(0, -0.04, 1.3), COL.dark);
  for (const x of [-0.5, 0.5]) trim.add(rbox(0.08, 0.1, 0.12, 0.03), T(x, -0.02, -1.48), COL.hook);
  trim.add(rbox(1.1, 0.07, 2.1, 0.03), T(0, -0.14, 0), COL.darker);
  // snorkel
  trim.add(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), T(0.76, 0.66, -0.36, 0, 0, 0.04), COL.darker);
  trim.add(rbox(0.12, 0.1, 0.18, 0.04), T(0.75, 1.02, -0.4), COL.darker);
  // mirrors
  for (const sx of [-1, 1]) { trim.add(rbox(0.05, 0.05, 0.16, 0.02), T(sx * 0.72, 0.58, -0.3), COL.darker); trim.add(rbox(0.12, 0.14, 0.05, 0.03), T(sx * 0.81, 0.66, -0.33), COL.darker); }
  // tail lights
  for (const x of [-0.6, 0.6]) tail.add(rbox(0.16, 0.18, 0.05, 0.02), T(x, 0.26, 1.215), COL.red);
  // spare wheel with a body-coloured cover
  trim.add(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 22), T(0, 0.46, 1.36, Math.PI / 2, 0, 0), COL.tire);
  paint.add(new THREE.CylinderGeometry(0.29, 0.29, 0.06, 22), T(0, 0.46, 1.49, Math.PI / 2, 0, 0), W);
  trim.add(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12), T(0, 0.46, 1.52, Math.PI / 2, 0, 0), COL.rim);

  const paintMat = new THREE.MeshStandardMaterial({ color: COL.paint, roughness: 0.35, metalness: 0.05, vertexColors: true });
  const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.2 });
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const tailMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const parts = [[paint, paintMat], [trim, trimMat], [glass, glassMat], [lights, lightMat], [tail, tailMat]].map(([b, m]) => {
    const me = new THREE.Mesh(b.build(), m); me.castShadow = true; me.receiveShadow = true; return me;
  });
  const bodyG = new THREE.Group(); bodyG.position.y = OFF;
  parts.forEach(p => bodyG.add(p));
  group.add(bodyG);
  // antenna with flag
  const ant = new THREE.Group();
  ant.position.set(-0.6, 1.06, 0.92);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 1.2, 5), new THREE.MeshStandardMaterial({ color: 0x221D33 }));
  rod.position.y = 0.6; rod.castShadow = true;
  const flagG = new THREE.BufferGeometry();
  flagG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.24, 0, 0, -0.12, 0.38], 3));
  flagG.computeVertexNormals();
  const flag = new THREE.Mesh(flagG, new THREE.MeshStandardMaterial({ color: 0xFF4FA0, side: THREE.DoubleSide, roughness: 0.6 }));
  flag.position.y = 1.18; flag.castShadow = true;
  ant.add(rod, flag);
  bodyG.add(ant);

  // wheels: fat tyres with tread blocks and bright rims
  const wb = new Builder();
  const R = CAR.wheelR + 0.02;
  wb.add(new THREE.CylinderGeometry(R - 0.03, R - 0.03, 0.38, 24), T(0, 0, 0, 0, 0, Math.PI / 2), COL.tire);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    wb.add(rbox(0.36, 0.07, 0.12, 0.02, 1), T(0, Math.cos(a) * (R - 0.02), Math.sin(a) * (R - 0.02), a, 0, 0), COL.tire);
  }
  wb.add(new THREE.CylinderGeometry(0.24, 0.24, 0.4, 18), T(0, 0, 0, 0, 0, Math.PI / 2), COL.rim);
  wb.add(new THREE.CylinderGeometry(0.17, 0.17, 0.42, 6), T(0, 0, 0, 0, 0, Math.PI / 2), lin(COL.paint));
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; wb.add(new THREE.CylinderGeometry(0.025, 0.025, 0.43, 6), T(0, Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0, 0, Math.PI / 2), COL.darker); }
  const wheelGeo = wb.build();
  const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const wheels = [0, 1, 2, 3].map(() => { const w = new THREE.Mesh(wheelGeo, wheelMat); w.castShadow = true; w.receiveShadow = true; return w; });

  // headlight beam (night)
  const spot = new THREE.SpotLight(0xFFE2B8, 0, 22, 0.6, 0.7, 1.4);
  spot.position.set(0, 0.3, -1.2);
  spot.target.position.set(0, -1.4, -9);
  spot.castShadow = false;
  bodyG.add(spot, spot.target);
  return { group, body: bodyG, wheels, paintMat, lightMat, tailMat, antenna: ant, flag, spot, lean: { r: 0, rv: 0, p: 0, pv: 0, y: 0, yv: 0 } };
}

export function setCarPaint(model, gold) {
  model.paintMat.color.set(gold ? COL.gold : COL.paint);
  model.paintMat.metalness = gold ? 0.75 : 0.05;
  model.paintMat.roughness = gold ? 0.22 : 0.35;
  model.flag.material.color.set(gold ? COL.gold : 0xFF4FA0);
}

// visual-only body lean on springs: roll into corners, squat/dive on throttle and brakes
export function leanModel(model, dt, latAcc, lonAcc, vertAcc) {
  const L = model.lean, k = 120, d = 11;
  const tr = Math.max(-0.09, Math.min(0.09, -latAcc * 0.0065));
  const tp = Math.max(-0.07, Math.min(0.07, lonAcc * 0.005));
  const ty = Math.max(-0.08, Math.min(0.05, -vertAcc * 0.003));
  const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
  for (let i = 0; i < n; i++) {
    L.rv += ((tr - L.r) * k - L.rv * d) * h; L.r += L.rv * h;
    L.pv += ((tp - L.p) * k - L.pv * d) * h; L.p += L.pv * h;
    L.yv += ((ty - L.y) * k * 1.4 - L.yv * d) * h; L.y += L.yv * h;
  }
  model.body.rotation.set(L.p, 0, L.r);
  model.body.position.y = OFF + L.y;
}

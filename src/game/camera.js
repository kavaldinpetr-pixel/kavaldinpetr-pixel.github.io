import * as THREE from 'three';
import { clamp, damp, lerp, wrapAngle } from './util.js';

// Low, close, long-lens follow camera: fixed direction, smoothed focus, zooms out with speed.
export class CameraRig {
  constructor(camera, dom) {
    this.cam = camera;
    this.look = new THREE.Vector3();
    this.focus = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.yawT = 0;
    this.pitch = 0.64; this.dist = 22.5; this.zoom = 1; this.zoomT = 1; this.speedZoom = 0;
    this.mode = 'intro'; this.t = 0; this.blend = 1;
    this.fov = 26; this.fovKick = 0;
    this.shake = 0;
    this.roll = 0; this.rollV = 0;
    this.introZoom = 0.95;
    // cinematic shot (e.g. watching the giant TV): blended in and out smoothly
    this.cineK = 0; this.cineOn = false; this.cinePos = new THREE.Vector3(); this.cineLook = new THREE.Vector3(); this._cl = new THREE.Vector3();
    this.cineFov = 26; this.cineFitW = 0; this._cp = new THREE.Vector3();
    this.behind = false;
    this._p = new THREE.Vector3(); this._a = new THREE.Vector3();
    let drag = null;
    dom.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && (e.button === 0 || e.button === 2)) drag = { x: e.clientX, yaw: this.yawT }; });
    addEventListener('pointermove', e => { if (drag) this.yawT = drag.yaw - (e.clientX - drag.x) * 0.006; });
    addEventListener('pointerup', () => { drag = null; });
    dom.addEventListener('contextmenu', e => e.preventDefault());
    dom.addEventListener('wheel', e => { this.zoomT = clamp(this.zoomT * (e.deltaY > 0 ? 1.08 : 0.926), 0.68, 1.5); e.preventDefault(); }, { passive: false });
  }
  kick(strength = 1) { this.rollV += (Math.random() < 0.5 ? -1 : 1) * 0.05 * strength; }
  update(dt, target, vel, speed, boosting, carYaw) {
    const c = this.cam;
    this.t += dt;
    // smoothed velocity -> small look-ahead (filtered so physics steps never jitter the view)
    this.vel.x = damp(this.vel.x, vel.x, 3, dt); this.vel.z = damp(this.vel.z, vel.z, 3, dt);
    const ahead = this._a.set(this.vel.x, 0, this.vel.z).multiplyScalar(0.11);
    if (ahead.length() > 2.6) ahead.setLength(2.6);
    const desired = this._p.copy(target).add(ahead);
    if (this.mode === 'intro') desired.copy(target);
    this.look.x = damp(this.look.x, desired.x, 9, dt);
    this.look.z = damp(this.look.z, desired.z, 9, dt);
    this.look.y = damp(this.look.y, desired.y, 4, dt);
    if (this.behind) this.yawT = wrapAngle(carYaw - this.yaw) * 0.04 * Math.min(1, Math.abs(speed) / 6) + this.yaw;
    this.yaw = damp(this.yaw, this.yawT, 6, dt);
    this.zoom = damp(this.zoom, this.zoomT, 6, dt);
    this.speedZoom = damp(this.speedZoom, clamp((Math.abs(speed) - 5) / 22, 0, 1), 1.6, dt);
    if (this.mode === 'swoop') { this.blend = Math.min(1, this.blend + dt / 1.6); if (this.blend >= 1) this.mode = 'follow'; }
    const intro = this.mode === 'intro' ? 1 : this.mode === 'swoop' ? 1 - (1 - Math.pow(1 - this.blend, 3)) : 0;
    // portrait screens: widen the lens and pull back so the car keeps its surroundings
    const asp = c.aspect;
    const baseFov = asp >= 1.25 ? 26 : Math.min(42, 26 + (1.25 - asp) * 22);
    const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * asp);
    const fit = asp >= 1.25 ? 1 : Math.max(1, Math.tan(Math.atan(Math.tan(THREE.MathUtils.degToRad(26) / 2) * 1.25)) / Math.tan(hHalf) * 0.78);
    this.fit = fit;
    const dist = this.dist * this.zoom * fit * (1 + this.speedZoom * 0.34) * lerp(1, this.introZoom, intro);
    const pitch = this.pitch + intro * 0.06 + Math.sin(this.t * 0.25) * 0.012 * intro;
    const yaw = this.yaw + Math.sin(this.t * 0.18) * 0.05 * intro;
    const px = this.look.x + Math.sin(yaw) * Math.cos(pitch) * dist;
    const py = this.look.y + Math.sin(pitch) * dist;
    const pz = this.look.z + Math.cos(yaw) * Math.cos(pitch) * dist;
    c.position.set(px, py, pz);
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.5); const s = this.shake * this.shake * 0.3; c.position.x += (Math.random() - 0.5) * s; c.position.y += (Math.random() - 0.5) * s; }
    this.cineK = Math.max(0, Math.min(1, this.cineK + (this.cineOn ? dt / 1.6 : -dt / 1.1)));
    const ck = this.cineK * this.cineK * (3 - 2 * this.cineK);
    if (this.cineK > 0) {
      // narrow (portrait) screens: back the shot off until the subject's width fits
      const cp = this._cp.copy(this.cinePos);
      if (this.cineFitW > 0) {
        const hh = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.cineFov) / 2) * asp);
        const d0 = cp.distanceTo(this.cineLook), need = this.cineFitW / Math.tan(hh) * 1.08;
        if (need > d0) cp.sub(this.cineLook).multiplyScalar(need / d0).add(this.cineLook);
      }
      c.position.lerp(cp, ck);
      this._cl.copy(this.look).lerp(this.cineLook, ck);
      c.lookAt(this._cl);
    } else c.lookAt(this.look);
    // spring roll on impacts
    this.rollV += -this.roll * 90 * dt; this.rollV *= Math.max(0, 1 - 6 * dt); this.roll += this.rollV * dt * 10;
    c.rotateZ(this.roll);
    this.fovKick = damp(this.fovKick, boosting ? 3 : 0, 4, dt);
    const fov = lerp(baseFov + this.fovKick, this.cineFov, ck);
    this.fov = baseFov;
    if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
  }
  startSwoop() { this.mode = 'swoop'; this.blend = 0; }
  cine(on, pos, look, fov = 26, fitW = 0) { this.cineOn = on; if (on) { this.cinePos.copy(pos); this.cineLook.copy(look); this.cineFov = fov; this.cineFitW = fitW; } }
  snap(target) { this.look.copy(target); this.vel.set(0, 0, 0); }
  // centre of the ground area the camera sees (for the grass window)
  groundCentre(out) {
    const d = 4 + this.speedZoom * 4;
    return out.set(this.look.x - Math.sin(this.yaw) * d, this.look.y, this.look.z - Math.cos(this.yaw) * d);
  }
}

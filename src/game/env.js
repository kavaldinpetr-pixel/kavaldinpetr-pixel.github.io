import * as THREE from 'three';
import { SKY_U } from './sky.js';
import { U } from './materials.js';
import { SU } from './style.js';
import { WINTER } from './season.js';

const C = h => new THREE.Color(h);
const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

// light: colour of lit surfaces (x intensity), shade: colour multiplied into surfaces in shadow
export const PRESETS = {
  sunset: {
    label: 'Закат',
    top: C(0x2A1B5C), mid: C(0x6B3A8E), hor: C(0xFF9E7A), bot: C(0x3B2468),
    sun: V(-0.74, 0.55, 0.42), light: C(0xFFCDB3), lightI: 1.28, shade: C(0x8470FF), shadeI: 1.04, coreHi: 0.62, coreLo: -0.22,
    fog: C(0xE88C9C), fogNear: 46, fogFar: 135,
    cLow: C(0x5B3F94), cHigh: C(0xF2A5B8), cSun: C(0xFFC7A0), cFar: C(0xE596A8),
    stars: 0.3, deep: C(0x1E7E92), shallow: C(0x63CBBE), wl: 1.0, lamps: 0.45, night: 0, bloomT: 1.0, bloomS: 0.32
  },
  night: {
    label: 'Ночь',
    top: C(0x05061A), mid: C(0x0E1446), hor: C(0x2A2A78), bot: C(0x080A26),
    sun: V(0.38, 0.78, -0.5), light: C(0x9494F2), lightI: 1.4, shade: C(0x4A33C8), shadeI: 0.9, coreHi: 0.9, coreLo: -0.25,
    fog: C(0x1B1E5E), fogNear: 40, fogFar: 125,
    cLow: C(0x0C1236), cHigh: C(0x2A2F6E), cSun: C(0x4F60A0), cFar: C(0x1A2050),
    stars: 1.0, deep: C(0x0C2A55), shallow: C(0x22608E), wl: 0.85, lamps: 1.0, night: 1, bloomT: 0.95, bloomS: 0.6
  },
  day: {
    label: 'День',
    top: C(0x3A6FD8), mid: C(0x86A8F2), hor: C(0xFFD9C4), bot: C(0x96A4E8),
    sun: V(-0.42, 0.84, 0.34), light: C(0xFFE6D4), lightI: 1.3, shade: C(0x8E80FF), shadeI: 1.2, coreHi: 0.95, coreLo: -0.25,
    fog: C(0xC9B5F2), fogNear: 50, fogFar: 150,
    cLow: C(0x9AA6E0), cHigh: C(0xFFF4FA), cSun: C(0xFFFFFF), cFar: C(0xE2DEFF),
    stars: 0.0, deep: C(0x1F8EA6), shallow: C(0x6FD9CB), wl: 1.05, lamps: 0.0, night: 0, bloomT: 1.05, bloomS: 0.25
  }
};
export const ORDER = ['sunset', 'night', 'day'];
// winter: frosty air (day/sunset) and moonlit snow (night)
const WF_DAY = C(0xD3DCF5), WF_NIGHT = C(0x2C3878), W_LIGHT = C(0xF2F5FF), _w = new THREE.Color();

export class Env {
  constructor(renderer, scene, quality) {
    this.scene = scene;
    scene.environment = null;
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    const sh = this.sun.shadow;
    sh.mapSize.set(quality.shadow, quality.shadow);
    this.span = quality.shadowSpan;
    sh.camera.left = -this.span; sh.camera.right = this.span; sh.camera.top = this.span; sh.camera.bottom = -this.span;
    sh.camera.near = 1; sh.camera.far = 180;
    sh.bias = -0.0006; sh.normalBias = 0.04; sh.radius = 3;
    scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.Fog(0x888888, 46, 135);

    this.cur = {};
    for (const k in PRESETS.sunset) { const v = PRESETS.sunset[k]; this.cur[k] = v && v.clone ? v.clone() : v; }
    this.name = 'sunset';
    this.listeners = [];
    this.apply(1);
  }
  set(name) { this.name = name; this.listeners.forEach(f => f(name)); }
  next() { const i = ORDER.indexOf(this.name); this.set(ORDER[(i + 1) % ORDER.length]); return this.name; }
  apply(t) {
    const P = PRESETS[this.name], c = this.cur;
    for (const k in P) {
      const v = P[k];
      if (v && v.isColor) c[k].lerp(v, t);
      else if (v && v.isVector3) c[k].lerp(v, t).normalize();
      else if (typeof v === 'number') c[k] = c[k] + (v - c[k]) * t;
    }
    SKY_U.top.value.copy(c.top); SKY_U.mid.value.copy(c.mid); SKY_U.hor.value.copy(c.hor); SKY_U.bot.value.copy(c.bot);
    if (WINTER) { _w.copy(WF_DAY).lerp(WF_NIGHT, c.night); SKY_U.hor.value.lerp(_w, 0.22); SKY_U.bot.value.lerp(_w, 0.3); }
    SKY_U.sunDir.value.copy(c.sun); SKY_U.sunCol.value.copy(c.light); SKY_U.stars.value = c.stars;
    SKY_U.cLow.value.copy(c.cLow); SKY_U.cHigh.value.copy(c.cHigh); SKY_U.cSun.value.copy(c.cSun); SKY_U.cFar.value.copy(c.cFar);
    SU.uLightCol.value.copy(c.light); if (WINTER) SU.uLightCol.value.lerp(W_LIGHT, 0.2 * (1 - c.night)); SU.uLightCol.value.multiplyScalar(c.lightI);
    SU.uShadowCol.value.copy(c.shade).multiplyScalar(c.shadeI);
    SU.uCoreHi.value = c.coreHi; SU.uCoreLo.value = c.coreLo;
    SU.uSunW.value.copy(c.sun);
    this.sun.color.copy(c.light); this.sun.intensity = c.lightI;
    U.night.value = c.night;
    U.lamps.value = c.lamps;
    this.scene.fog.color.copy(c.fog);
    if (WINTER) { _w.copy(WF_DAY).lerp(WF_NIGHT, c.night); this.scene.fog.color.lerp(_w, 0.42); }
    this.scene.fog.near = c.fogNear; this.scene.fog.far = c.fogFar;
    if (this.cloudBase) this.cloudBase.material.color.copy(c.cLow).lerp(c.hor, 0.25);
  }
  update(dt, focus) {
    this.apply(1 - Math.exp(-dt * 2.2));
    // shadow camera follows the focus point, snapped to texels to avoid shimmer
    const dir = this.cur.sun;
    const s = this.sun;
    const texel = (this.span * 2) / s.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    s.target.position.set(fx, 0, fz);
    s.position.set(fx + dir.x * 80, dir.y * 80, fz + dir.z * 80);
    s.target.updateMatrixWorld();
  }
  get lamps() { return this.cur.lamps; }
  get night() { return this.cur.night; }
}

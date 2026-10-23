// Project locations: buildings, 3D titles, screens with real work, zone rings and their animations.
import * as THREE from 'three';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import fontData from '../assets/display.json';
import imgVpnHome from '../assets/vpn-home.webp';
import imgVpnTariffs from '../assets/vpn-tariffs.webp';
import imgAuto from '../assets/auto-site.webp';
import imgDt from '../assets/dt-screen.webp';
import imgSalon from '../assets/salon-screen.webp';
import { Builder, Chunked, mesh, T, Tmul } from './builder.js';
import { M, U, NOISE_GLSL } from './materials.js';
import { waterMaterial } from './terrain.js';
import { lin, mixc, rand, TAU } from './util.js';
import { FOUNTAIN, GUEST_SPOT, heightAt, LIGHTHOUSE, PLAZA, PLAZA_TITLE, SIGN, ZONE, ZONES } from './layout.js';
import { buildLetters } from './letters.js';
import { GUEST } from './guest.js';

export const WATER_MATS = [];
export const IMAGES = { vpnHome: imgVpnHome, vpnTariffs: imgVpnTariffs, auto: imgAuto, dt: imgDt, salon: imgSalon };
export const font = new Font(fontData);

const C = {
  navy: lin(0x1E2340), navy2: lin(0x2A3160), navy3: lin(0x161A33), cream: lin(0xFFF1DC), white: lin(0xF7F5FA), wood: lin(0xB98257), wood2: lin(0x7C5034),
  stone: lin(0xC9C1D6), stone2: lin(0xA79FBE), glass: lin(0x1A2140), magenta: lin(0xFF4FA0), magenta2: lin(0xC2367A), mint: lin(0x5BE3C8), yellow: lin(0xFFC857),
  orange: lin(0xFF8A3D), lilac: lin(0xC9B6FF), sky: lin(0x7FB7FF), red: lin(0xE5484D), grey: lin(0xD8DCEA), steel: lin(0x9AA0B8), warm: lin(0xFFC98A), roof: lin(0xD95B4F),
  black: lin(0x101322), green: lin(0x4FA556)
};
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

export const rb = (w, h, d, r = 0.08, s = 1) => new RoundedBoxGeometry(w, h, d, s, Math.max(0.001, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002)));
const cyl = (rt, rbm, h, seg = 16) => new THREE.CylinderGeometry(rt, rbm, h, seg);
const sph = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);

const LEDG = new THREE.BoxGeometry(0.16, 0.12, 0.06);
export function textGeo(str, size, depth, bevel = true) {
  const g = new TextGeometry(str, { font, size, depth, curveSegments: size > 1 ? 3 : 2, bevelEnabled: bevel, bevelThickness: Math.min(depth * 0.3, size * 0.05), bevelSize: size * 0.028, bevelSegments: 1 });
  g.computeBoundingBox();
  const bb = g.boundingBox;
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  g.computeBoundingBox();
  return g;
}
const faceSide = (face, side) => (wx, wy, wz, lx, ly, lz, nx, ny, nz) => (Math.abs(nz) > 0.6 ? face : side);

// glows: always-on (LEDs) and night windows
function nightMat() {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  m.onBeforeCompile = sh => {
    sh.uniforms.uLamps = U.lamps;
    sh.fragmentShader = 'uniform float uLamps;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(0.55, 1.9, uLamps);');
  };
  m.customProgramCacheKey = () => 'nightglow';
  return m;
}
function blinkMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.time },
    vertexShader: /* glsl */`attribute vec3 color; varying vec3 vC; varying vec3 vP; void main(){ vC = color; vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`uniform float uTime; varying vec3 vC; varying vec3 vP;
      void main(){ vec3 c = floor(vP * 3.0); float h = fract(sin(dot(c, vec3(12.98, 78.23, 45.16))) * 43758.5453);
        float b = step(0.35, fract(h * 7.0 + uTime * (0.4 + h * 1.6))); gl_FragColor = vec4(vC * (0.35 + 0.95 * b), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    toneMapped: false
  });
}

function loadTex(url, aniso = 4) {
  const t = new THREE.Texture();
  const img = new Image();
  img.onload = () => { t.image = img; t.needsUpdate = true; };
  img.src = url;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// matrix that maps a unit cylinder (axis y, length 1 when scaled) onto segment a->b
const _up = new THREE.Vector3(0, 1, 0);
export function segM(a, b) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.normalize());
  return new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, L, 1));
}
// local frame helper
function frame(x, z, yaw = 0, y) {
  const gy = y ?? heightAt(x, z);
  const base = T(x, gy, z, 0, yaw, 0);
  const f = (lx, ly, lz, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => Tmul(base, T(lx, ly, lz, rx, ry, rz, sx, sy, sz));
  f.w = (lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  f.y = gy; f.yaw = yaw;
  return f;
}

export function buildZones(scene, phys, quality) {
  const S = new Chunked({}, 30);        // solid, rough
  const G = new Chunked({}, 30);        // glossy
  const N = new Chunked({}, 30);        // night glow (windows)
  const L = new Chunked({}, 30);        // blinking LEDs
  const anim = [];
  const box = (f, lx, ly, lz, hx, hy, hz) => { const [wx, wz] = f.w(lx, lz); phys.box(wx, f.y + ly, wz, hx, hy, hz, f.yaw); };

  // ===================== titles: separate physics letters (knock them over) on a low stand =====================
  const titles = ZONES.map(z => {
    const [x, zz, yaw] = z.title;
    const face = lin(z.color);
    return { id: z.id, x, z: zz, yaw, lines: [{ text: z.name.toUpperCase(), size: z.name.length > 8 ? 1.6 : 1.95, depth: 0.6, face, side: shade(face, 0.55) }] };
  });
  {
    const [x, zz, yaw] = PLAZA_TITLE;
    titles.push({ id: 'plaza', x, z: zz, yaw, lines: [
      { text: 'ОСТРОВ', size: 2.15, depth: 0.65, dx: -0.3, dz: -3.0, face: C.magenta, side: C.magenta2 },
      { text: 'ПРОЕКТОВ', size: 2.15, depth: 0.65, dx: 0.3, dz: 0.25, face: C.cream, side: shade(C.cream, 0.7) }
    ] });
  }
  // personal link: the guest's company spelled on the plaza, right in front of the start
  if (GUEST.to) {
    const txt = [...GUEST.to.toUpperCase()].map(ch => (ch === ' ' || font.data.glyphs[ch] ? ch : ' ')).join('').replace(/\s+/g, ' ').trim();
    if (txt) titles.push({ id: 'guest', x: GUEST_SPOT.x, z: GUEST_SPOT.z, yaw: 0, lines: [{ text: txt, size: Math.min(1.45, 15.5 / Math.max(8, txt.length)), depth: 0.5, face: C.magenta, side: C.magenta2 }] });
  }
  const letters = buildLetters(scene, phys, M.solid, font, titles);
  for (const ln of letters.lines) S.add(rb(ln.w + 0.8, 0.12, ln.d + 0.9, 0.05), T(ln.x, ln.gy + 0.01, ln.z, 0, ln.yaw, 0), C.navy);

  // ===================== STEOVPN =====================
  {
    const z = ZONE.vpn;
    const f = frame(-55, -12.5, 0.18);
    S.add(rb(5.6, 0.6, 5.6, 0.15), f(0, 0.3, 0), C.navy2);
    G.add(rb(4.4, 8.8, 4.4, 0.4), f(0, 5.0, 0), C.navy);
    G.add(rb(4.8, 0.45, 4.8, 0.18), f(0, 9.55, 0), C.navy2);
    G.add(rb(3.6, 0.5, 3.6, 0.15), f(0, 10.0, 0), C.navy);
    // server rows on the front + sides
    for (let r = 0; r < 6; r++) for (let side = 0; side < 3; side++) {
      const yy = 1.7 + r * 0.95;
      const rot = side === 0 ? 0 : side === 1 ? Math.PI / 2 : -Math.PI / 2;
      const ca = Math.sin(rot) * 2.22, cz = Math.cos(rot) * 2.22;
      S.add(rb(3.2, 0.62, 0.14, 0.05), f(ca, yy, cz, 0, rot, 0), C.navy3);
      for (let k = 0; k < 7; k++) {
        const lx = -1.3 + k * 0.42;
        const col = (k + r) % 3 === 0 ? C.mint : (k + r) % 3 === 1 ? lin(0x7CFFB2) : lin(0x42B4FF);
        L.add(LEDG, Tmul(f(ca, yy, cz, 0, rot, 0), T(lx, 0.1, 0.08)), col);
      }
    }
    // shield emblem
    const sh = new THREE.Shape();
    const P = [[0, 1.0], [0.46, 0.85], [0.82, 0.78], [0.82, 0.18], [0.58, -0.42], [0, -0.98], [-0.58, -0.42], [-0.82, 0.18], [-0.82, 0.78], [-0.46, 0.85]];
    sh.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) sh.lineTo(P[i][0], P[i][1]);
    const shG = new THREE.ExtrudeGeometry(sh, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
    G.add(shG, f(0, 11.9, 0.1, 0, 0, 0, 1.3), faceSide(C.mint, shade(C.mint, 0.6)));
    const ck = new THREE.Shape(); ck.moveTo(-0.45, 0.05); ck.lineTo(-0.15, -0.3); ck.lineTo(0.5, 0.42); ck.lineTo(0.38, 0.54); ck.lineTo(-0.15, -0.05); ck.lineTo(-0.33, 0.17); ck.closePath();
    S.add(new THREE.ExtrudeGeometry(ck, { depth: 0.08, bevelEnabled: false }), f(0, 11.95, 0.53, 0, 0, 0, 1.3), C.navy);
    S.add(cyl(0.12, 0.18, 1.1, 8), f(0, 10.6, 0.2), C.navy2);
    // antenna
    S.add(cyl(0.05, 0.08, 2.4, 6), f(1.3, 11.4, -1.2), C.steel);
    L.add(sph(0.16, 1), f(1.3, 12.65, -1.2), C.red);
    box(f, 0, 4.8, 0, 2.5, 4.8, 2.5);
    // phones with the real screenshots
    const tex1 = loadTex(IMAGES.vpnHome), tex2 = loadTex(IMAGES.vpnTariffs);
    [[-51.2, -9.6, 0.62, tex1], [-50.4, -3.6, 0.95, tex2]].forEach(([x, zz, yaw, tex]) => {
      const pf = frame(x, zz, yaw);
      S.add(rb(1.9, 0.3, 1.2, 0.1), pf(0, 0.15, 0.1), C.navy2);
      S.add(rb(0.35, 1.4, 0.35, 0.08), pf(0, 0.8, 0.35, -0.3, 0, 0), C.navy2);
      G.add(rb(2.3, 4.7, 0.26, 0.32, 3), pf(0, 2.75, 0, -0.3, 0, 0), C.black);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.04, 4.42), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      screen.applyMatrix4(pf(0, 2.75, 0, -0.3, 0, 0)); screen.translateZ(0.135);
      screen.material.color.setScalar(0.92);
      scene.add(screen);
      const [wx, wz] = pf.w(0, 0.2); phys.box(wx, pf.y + 1.6, wz, 1.1, 1.6, 0.4, yaw);
    });
  }

  // ===================== Как работаю =====================
  {
    const z = ZONE.steps;
    const cols = [C.yellow, C.orange, C.magenta, C.mint];
    for (let i = 0; i < 4; i++) {
      const h = 1.2 + i * 1.0;
      const f = frame(-46.6 - i * 2.75, 15.2 + i * 0.25, 0.12);
      S.add(rb(2.55, h, 2.7, 0.18), f(0, h / 2, 0), C.cream);
      G.add(rb(2.65, 0.28, 2.8, 0.12), f(0, h + 0.1, 0), cols[i]);
      const dg = textGeo(String(i + 1), 1.15, 0.18);
      S.add(dg, f(0, Math.max(0.2, h / 2 - 0.55), 1.36), faceSide(C.navy, C.navy2));
      box(f, 0, h / 2, 0, 1.3, h / 2, 1.38);
      const top = h + 0.25;
      if (i === 0) { // speech bubble
        G.add(rb(1.5, 0.95, 0.5, 0.35), f(0, top + 0.75, 0), C.white);
        G.add(new THREE.ConeGeometry(0.22, 0.45, 4), f(-0.38, top + 0.22, 0, 0, 0, 0.5), C.white);
        for (let k = 0; k < 3; k++) S.add(sph(0.09, 1), f(-0.35 + k * 0.35, top + 0.76, 0.26), C.navy);
      } else if (i === 1) { // pencil
        const pm = f(0, top + 0.45, 0, 0, 0.6, 0.95);
        G.add(cyl(0.2, 0.2, 1.7, 6), Tmul(pm, T(0, 0, 0)), C.yellow);
        S.add(new THREE.ConeGeometry(0.2, 0.42, 6), Tmul(pm, T(0, 1.06, 0)), C.wood);
        S.add(new THREE.ConeGeometry(0.07, 0.15, 6), Tmul(pm, T(0, 1.22, 0)), C.navy);
        G.add(cyl(0.21, 0.21, 0.25, 6), Tmul(pm, T(0, -0.95, 0)), C.magenta);
      } else if (i === 2) { // laptop
        G.add(rb(1.7, 0.1, 1.15, 0.05), f(0, top + 0.06, 0.1), C.steel);
        G.add(rb(1.7, 1.08, 0.08, 0.05), f(0, top + 0.6, -0.45, -0.25, 0, 0), C.steel);
        N.add(rb(1.5, 0.88, 0.02, 0.03), f(0, top + 0.6, -0.4, -0.25, 0, 0), lin(0x8FD3FF));
      } else { // rocket
        const rf = new THREE.Group();
        const rbld = new Builder();
        rbld.add(cyl(0.32, 0.36, 1.4, 14), T(0, 0.7, 0), C.white);
        rbld.add(new THREE.ConeGeometry(0.32, 0.65, 14), T(0, 1.72, 0), C.magenta);
        rbld.add(cyl(0.12, 0.12, 0.06, 12), T(0, 1.0, 0.33, Math.PI / 2, 0, 0), lin(0x8FD3FF));
        for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; rbld.add(rb(0.08, 0.55, 0.42, 0.03), T(Math.sin(a) * 0.36, 0.2, Math.cos(a) * 0.36, 0, a, 0), C.magenta); }
        const rm = new THREE.Mesh(rbld.build(), M.glossy); rm.castShadow = true;
        const fl = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 10), new THREE.MeshBasicMaterial({ color: 0xFFB24A, toneMapped: false }));
        fl.rotation.x = Math.PI; fl.position.y = -0.3;
        rf.add(rm, fl);
        rf.position.set(...(() => { const [wx, wz] = f.w(0, 0); return [wx, f.y + top + 0.35, wz]; })());
        scene.add(rf);
        const by = rf.position.y;
        anim.push((dt, t) => { rf.position.y = by + 0.25 + Math.sin(t * 2.2) * 0.22; rf.rotation.y = t * 0.6; fl.scale.set(1, 0.8 + Math.sin(t * 23) * 0.25, 1); });
      }
    }
  }

  // ===================== Обо мне: house + campfire =====================
  {
    const f = frame(-33.5, -47.5, 0.2);
    S.add(rb(6.0, 0.45, 5.0, 0.12), f(0, 0.22, 0), C.stone);
    S.add(rb(5.2, 2.7, 4.2, 0.12), f(0, 1.75, 0), lin(0xFFE2C4));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.add(rb(0.3, 2.8, 0.3, 0.06), f(sx * 2.55, 1.8, sz * 2.05), C.wood);
    // gable roof
    for (const s of [-1, 1]) G.add(rb(6.0, 0.28, 2.95, 0.1), f(0, 3.75, s * 1.12, s * 0.58, 0, 0), C.roof);
    G.add(rb(6.1, 0.3, 0.32, 0.1), f(0, 4.55, 0), shade(C.roof, 0.8));
    const gab = new THREE.BufferGeometry();
    gab.setAttribute('position', new THREE.Float32BufferAttribute([-2.1, 0, 0, 2.1, 0, 0, 0, 1.35, 0], 3)); gab.computeVertexNormals();
    for (const s of [-1, 1]) S.add(gab, f(s * 2.58, 3.1, 0, 0, s * Math.PI / 2, 0), lin(0xFFE2C4));
    S.add(rb(0.7, 1.5, 0.7, 0.08), f(1.4, 4.4, -0.9), C.stone2);
    // door + windows
    S.add(rb(0.95, 1.75, 0.1, 0.06), f(-0.9, 1.33, 2.12), C.wood2);
    S.add(sph(0.06, 1), f(-0.6, 1.3, 2.2), C.yellow);
    for (const wx of [0.9, 2.0]) { S.add(rb(0.85, 0.85, 0.08, 0.04), f(wx, 2.0, 2.11), C.wood); N.add(rb(0.68, 0.68, 0.06, 0.03), f(wx, 2.0, 2.14), C.warm); }
    for (const wz of [-1, 0.6]) { S.add(rb(0.08, 0.8, 0.8, 0.04), f(2.61, 2.0, wz), C.wood); N.add(rb(0.06, 0.64, 0.64, 0.03), f(2.64, 2.0, wz), C.warm); }
    // porch + lantern
    S.add(rb(2.4, 0.15, 1.2, 0.05), f(-0.9, 0.48, 2.7), C.wood);
    N.add(sph(0.14, 1), f(-1.75, 2.45, 2.35), C.warm);
    box(f, 0, 1.8, 0, 2.7, 1.8, 2.2);
    // smoke anchor (chimney top)
    const [cx, cz] = f.w(1.4, -0.9);
    anim.smoke = [cx, f.y + 5.3, cz];
    // campfire
    const cf = frame(-30.2, -40.4, 0);
    for (let k = 0; k < 9; k++) { const a = k / 9 * TAU; S.add(new THREE.DodecahedronGeometry(0.28, 0), cf(Math.cos(a) * 0.95, 0.12, Math.sin(a) * 0.95, rand(), rand(), 0, 1, 0.7, 1), C.stone2); }
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; S.add(cyl(0.1, 0.13, 1, 7), Tmul(cf(0, 0, 0), segM([Math.cos(a) * 0.6, 0.05, Math.sin(a) * 0.6], [Math.cos(a) * 0.08, 1.0, Math.sin(a) * 0.08])), C.wood2); }
    // log benches
    for (const [bx, bz, a] of [[-1.9, 1.2, 0.5], [1.9, 1.0, -0.6], [0.2, -2.2, 1.6]]) { S.add(cyl(0.3, 0.3, 1.9, 10), cf(bx, 0.3, bz, 0, a, Math.PI / 2), C.wood); phys.box(...(() => { const [wx, wz] = cf.w(bx, bz); return [wx, cf.y + 0.3, wz]; })(), 0.95, 0.3, 0.32, a); }
    const fireG = new THREE.Group();
    const fm1 = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.25, 7), new THREE.MeshBasicMaterial({ color: 0xFF8A2A, toneMapped: false, transparent: true, opacity: 0.95 }));
    const fm2 = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.9, 7), new THREE.MeshBasicMaterial({ color: 0xFFE07A, toneMapped: false }));
    fm1.position.y = 0.75; fm2.position.y = 0.6;
    fireG.add(fm1, fm2);
    const [fx, fz] = cf.w(0, 0);
    fireG.position.set(fx, cf.y, fz);
    scene.add(fireG);
    let fireLight = null;
    if (!quality.lowLights) {
      fireLight = new THREE.PointLight(0xFF9A4A, 0, 9, 1.6);
      fireLight.position.set(fx, cf.y + 1.2, fz);
      scene.add(fireLight);
    }
    anim.fire = [fx, cf.y + 1.0, fz];
    anim.push((dt, t, night) => {
      const k = 1 + Math.sin(t * 17) * 0.12 + Math.sin(t * 7.3) * 0.08;
      fm1.scale.set(1, k, 1); fm2.scale.set(1, 2 - k, 1); fireG.rotation.y = t * 1.3;
      if (fireLight) fireLight.intensity = (4 + Math.sin(t * 13) * 0.8) * (0.25 + night * 0.9);
    });
    phys.cyl(fx, cf.y, fz, 1.1, 0.5);
  }

  // ===================== Маяк (lighthouse) =====================
  {
    const f = frame(0, -59.2, 0);
    const prof = [];
    for (let i = 0; i <= 10; i++) { const y = i * 1.1; prof.push(new THREE.Vector2(2.3 - (i / 10) * 0.8, y)); }
    const lathe = new THREE.LatheGeometry(prof, 28);
    S.add(lathe, f(0, 0.3, 0), (wx, wy, wz, lx, ly) => (Math.floor(ly / 2.2) % 2 === 0 ? C.cream : C.magenta));
    S.add(cyl(2.6, 2.8, 0.6, 28), f(0, 0.3, 0), C.stone);
    G.add(cyl(2.05, 2.05, 0.28, 28), f(0, 11.4, 0), C.navy);
    for (let k = 0; k < 20; k++) { const a = k / 20 * TAU; S.add(cyl(0.04, 0.04, 0.75, 4), f(Math.cos(a) * 1.92, 11.9, Math.sin(a) * 1.92), C.navy); }
    S.add(new THREE.TorusGeometry(1.92, 0.05, 6, 40), f(0, 12.25, 0, Math.PI / 2, 0, 0), C.navy);
    G.add(cyl(1.15, 1.15, 0.2, 20), f(0, 11.6, 0), C.navy);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; S.add(rb(0.12, 1.6, 0.12, 0.03), f(Math.cos(a) * 1.08, 12.5, Math.sin(a) * 1.08), C.navy); }
    N.add(cyl(1.0, 1.0, 1.55, 16), f(0, 12.48, 0), lin(0xFFE7B0));
    G.add(new THREE.ConeGeometry(1.4, 1.2, 20), f(0, 13.85, 0), C.magenta);
    G.add(sph(0.22, 1), f(0, 14.55, 0), C.yellow);
    S.add(rb(1.1, 1.9, 0.3, 0.1), f(0, 1.5, 2.2), C.navy);
    for (const y of [4.2, 7.6]) N.add(rb(0.45, 0.65, 0.12, 0.05), f(0, y, 2.05 - y * 0.065), C.warm);
    phys.cyl(...(() => { const [wx, wz] = f.w(0, 0); return [wx, f.y, wz]; })(), 2.4, 12);
    // beam
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xFFE9B0, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const beamG = new THREE.ConeGeometry(2.6, 26, 20, 1, true); beamG.translate(0, -13, 0); beamG.rotateZ(Math.PI / 2);
    const beam = new THREE.Group();
    const b1 = new THREE.Mesh(beamG, beamMat), b2 = new THREE.Mesh(beamG, beamMat); b2.rotation.y = Math.PI;
    beam.add(b1, b2);
    const [bx, bz] = f.w(0, 0);
    beam.position.set(bx, f.y + 12.5, bz);
    scene.add(beam);
    anim.push((dt, t, night) => { beam.rotation.y = t * 0.9; beamMat.opacity = 0.05 + night * 0.22; });
    // keeper's hut
    const h = frame(6.2, -58.6, -0.25);
    S.add(rb(3.4, 2.2, 2.8, 0.12), h(0, 1.1, 0), C.white);
    G.add(rb(3.8, 0.3, 3.2, 0.1), h(0, 2.3, 0), C.navy);
    S.add(rb(0.8, 1.4, 0.08, 0.05), h(-0.7, 0.75, 1.42), C.navy2);
    N.add(rb(0.7, 0.6, 0.06, 0.03), h(0.75, 1.3, 1.42), C.warm);
    box(h, 0, 1.1, 0, 1.75, 1.1, 1.45);
    // mailbox
    const mb = frame(5.2, -51, -0.4);
    S.add(cyl(0.08, 0.1, 1.1, 8), mb(0, 0.55, 0), C.navy);
    G.add(rb(0.7, 0.55, 0.95, 0.22), mb(0, 1.35, 0), C.magenta);
    S.add(rb(0.05, 0.35, 0.18, 0.02), mb(0.38, 1.6, -0.2), C.yellow);
    S.add(rb(0.5, 0.05, 0.02, 0.01), mb(0, 1.42, 0.48), C.navy);
    anim.mailbox = mb.w(0, 0);
  }

  // ===================== SProxy relay tower =====================
  {
    const f = frame(31.5, -48, 0.3);
    const H = 12.5, legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const at = (y, i) => { const s = 1.7 - (y / H) * 1.15; return [legs[i][0] * s, y, legs[i][1] * s]; };
    const seg = (a, b, r, col) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx, dy, dz), new THREE.Vector3(0, 1, 0.001));
      const g = cyl(r, r, L, 5); g.rotateX(Math.PI / 2);
      const mm = new THREE.Matrix4().makeTranslation((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2).multiply(m);
      S.add(g, Tmul(f(0, 0, 0), mm), col);
    };
    for (let i = 0; i < 4; i++) seg(at(0, i), at(H, i), 0.11, C.white);
    for (let k = 0; k < 6; k++) {
      const y0 = k * (H / 6), y1 = (k + 1) * (H / 6);
      const col = k % 2 ? C.sky : C.white;
      for (let i = 0; i < 4; i++) { seg(at(y1, i), at(y1, (i + 1) % 4), 0.06, col); seg(at(y0, i), at(y1, (i + 1) % 4), 0.045, col); }
    }
    G.add(rb(2.0, 0.2, 2.0, 0.06), f(0, H + 0.1, 0), C.navy);
    S.add(cyl(0.06, 0.08, 3.2, 6), f(0, H + 1.7, 0), C.steel);
    L.add(sph(0.18, 1), f(0, H + 3.35, 0), C.red);
    L.add(sph(0.12, 1), f(0.9, H * 0.66, 0.6), C.red);
    // dishes
    const dishG = new THREE.SphereGeometry(0.85, 16, 8, 0, TAU, 0, 1.1); dishG.scale(1, 0.45, 1);
    G.add(dishG, f(0.6, 8.9, 0.75, -1.35, 0.3, 0), C.white);
    G.add(dishG, f(-0.7, 7.1, 0.5, -1.3, -0.9, 0), C.white);
    box(f, 0, 2, 0, 1.6, 2, 1.6);
    // shed
    const sd = frame(26.5, -50.5, 0.1);
    S.add(rb(3.2, 2.1, 2.4, 0.12), sd(0, 1.05, 0), C.grey);
    G.add(rb(3.5, 0.24, 2.7, 0.08), sd(0, 2.2, 0), C.sky);
    S.add(rb(0.8, 1.4, 0.08, 0.04), sd(-0.8, 0.75, 1.22), C.navy2);
    for (let k = 0; k < 4; k++) L.add(rb(0.12, 0.08, 0.05, 0.02), sd(0.6 + k * 0.22, 1.5, 1.22), k % 2 ? C.mint : C.sky);
    box(sd, 0, 1.05, 0, 1.6, 1.05, 1.2);
    // paper planes circling the tower
    const planeG = new THREE.BufferGeometry();
    planeG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.6, -0.42, 0.05, 0.35, 0, -0.05, 0.25, 0, 0, -0.6, 0, -0.05, 0.25, 0.42, 0.05, 0.35, 0, 0, -0.6, 0, -0.05, 0.25, 0, -0.22, 0.3], 3));
    planeG.computeVertexNormals();
    const planeM = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide, roughness: 0.7 });
    const [tx, tz] = f.w(0, 0);
    const planes = [0, 1, 2].map(k => { const p = new THREE.Mesh(planeG, planeM); p.castShadow = true; p.scale.setScalar(1.3); scene.add(p); return p; });
    anim.push((dt, t) => planes.forEach((p, k) => {
      const a = t * (0.45 + k * 0.12) + k * 2.1, r = 4.2 + k * 1.6, y = f.y + 7 + k * 1.8 + Math.sin(t * 1.3 + k) * 0.6;
      p.position.set(tx + Math.cos(a) * r, y, tz + Math.sin(a) * r);
      p.rotation.set(0, -a, 0.35);
    }));
  }

  // ===================== Слой: studio, turntable, car wash =====================
  {
    const f = frame(55.5, -3.5, -0.12);
    S.add(rb(8.4, 0.4, 6.4, 0.12), f(0, 0.2, 0), C.stone);
    G.add(rb(8.0, 4.0, 6.0, 0.2), f(0, 2.4, 0), C.white);
    G.add(rb(8.6, 0.35, 6.6, 0.12), f(0, 4.5, 0), lin(0xECE6F8));
    G.add(rb(8.7, 0.12, 6.7, 0.05), f(0, 4.3, 0), C.navy);
    S.add(rb(6.4, 2.6, 0.12, 0.08), f(-0.4, 1.9, 3.0), C.glass);
    N.add(rb(6.0, 2.2, 0.06, 0.06), f(-0.4, 1.9, 3.05), lin(0xB8C8FF));
    G.add(rb(8.05, 0.3, 6.05, 0.08), f(0, 3.55, 0), C.lilac);
    // big phone with the concept
    const tex = loadTex(IMAGES.dt);
    const pf = frame(49.4, -11.6, -0.35);
    S.add(rb(1.9, 0.3, 1.2, 0.1), pf(0, 0.15, 0.1), C.navy2);
    G.add(rb(2.4, 4.9, 0.26, 0.34, 3), pf(0, 2.85, 0, -0.3, 0, 0), C.black);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.14, 4.58), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    screen.applyMatrix4(pf(0, 2.85, 0, -0.3, 0, 0)); screen.translateZ(0.135); screen.material.color.setScalar(0.92);
    scene.add(screen);
    { const [wx, wz] = pf.w(0, 0.2); phys.box(wx, pf.y + 1.6, wz, 1.2, 1.6, 0.4, -0.35); }
    box(f, 0, 2.2, 0, 4.2, 2.2, 3.1);
    // turntable with a two-tone car (before / after)
    const tt = new THREE.Group();
    const tb = new Builder();
    tb.add(cyl(2.3, 2.4, 0.3, 32), T(0, 0.15, 0), C.navy);
    tb.add(new THREE.TorusGeometry(2.3, 0.06, 6, 48), T(0, 0.3, 0, Math.PI / 2, 0, 0), C.lilac);
    const car = (bld, side, col) => {
      bld.add(rb(1.3, 0.55, 2.9, 0.22), T(side * 0.33, 0.75, 0, 0, 0, 0, 0.5, 1, 1), col);
      bld.add(rb(1.2, 0.5, 1.5, 0.25), T(side * 0.3, 1.2, 0.15, 0, 0, 0, 0.5, 1, 1), col);
    };
    const gb = new Builder(); car(gb, 1, lin(0x8B7BE0));
    const mbld = new Builder(); car(mbld, -1, lin(0x8C8796));
    for (const zz of [-0.95, 0.95]) for (const s of [-1, 1]) tb.add(cyl(0.3, 0.3, 0.22, 14), T(s * 0.62, 0.62, zz, 0, 0, Math.PI / 2), C.black);
    tb.add(rb(1.1, 0.4, 0.05, 0.05), T(0, 1.22, -0.62, -0.4, 0, 0), C.glass);
    const ttm = new THREE.Mesh(tb.build(), M.solid); ttm.castShadow = ttm.receiveShadow = true;
    const glossyCar = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.25, envMapIntensity: 1.6 }));
    const matteCar = new THREE.Mesh(mbld.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.1 }));
    glossyCar.castShadow = matteCar.castShadow = true;
    tt.add(ttm, glossyCar, matteCar);
    const [ttx, ttz] = frame(51.2, -11.2).w(0, 0);
    tt.position.set(ttx + 2.0, heightAt(51.2, -11.2), ttz + 0.2);
    scene.add(tt);
    phys.cyl(tt.position.x, tt.position.y, tt.position.z, 2.3, 1.6);
    anim.push((dt, t) => { tt.rotation.y = t * 0.45; });
    // car wash arch over the ring road
    const cw = frame(37.6, -10.6, -0.28);
    const W2 = 3.4;
    for (const s of [-1, 1]) { G.add(rb(0.7, 4.4, 1.2, 0.15), cw(s * W2, 2.2, 0), C.white); box(cw, s * W2, 2.2, 0, 0.35, 2.2, 0.6); }
    G.add(rb(2 * W2 + 0.7, 0.8, 1.3, 0.2), cw(0, 4.6, 0), C.lilac);
    const wt = textGeo('Мойка', 0.62, 0.12);
    S.add(wt, cw(0, 4.33, 0.66), faceSide(C.navy, C.navy2));
    const brushes = [];
    for (const s of [-1, 1]) {
      const bg = new THREE.Group();
      const bb = new Builder();
      for (let k = 0; k < 10; k++) bb.add(cyl(0.55, 0.55, 0.32, 14), T(0, 0.4 + k * 0.36, 0), k % 2 ? lin(0x5AA8FF) : C.magenta);
      bb.add(cyl(0.07, 0.07, 4.0, 6), T(0, 2.0, 0), C.steel);
      const bm = new THREE.Mesh(bb.build(), M.solid); bm.castShadow = true;
      bg.add(bm);
      const [wx, wz] = cw.w(s * (W2 - 1.0), 0);
      bg.position.set(wx, cw.y, wz);
      scene.add(bg); brushes.push(bg);
    }
    anim.push((dt, t) => { brushes[0].rotation.y = t * 4; brushes[1].rotation.y = -t * 4; });
    anim.wash = { x: cw.w(0, 0)[0], z: cw.w(0, 0)[1], yaw: -0.28 };
  }

  // ===================== Ключ на 10: garage =====================
  {
    const f = frame(50.5, 28.5, -0.25);
    S.add(rb(9.6, 0.4, 7.6, 0.12), f(0, 0.2, 0), C.stone);
    G.add(rb(9.0, 4.4, 7.0, 0.2), f(0, 2.6, 0), C.grey);
    G.add(rb(9.3, 0.5, 7.3, 0.12), f(0, 4.9, 0), C.orange);
    // door opening (dark) with roll-up door
    S.add(rb(4.6, 3.1, 0.2, 0.08), f(-1.4, 1.95, 3.45), lin(0x2A2E44));
    for (let k = 0; k < 5; k++) S.add(rb(4.5, 0.18, 0.12, 0.04), f(-1.4, 3.42 - k * 0.19, 3.56), k % 2 ? C.orange : C.white);
    // lift with a car inside
    S.add(rb(0.25, 1.6, 0.25, 0.05), f(-3.1, 1.2, 2.4), C.steel);
    S.add(rb(0.25, 1.6, 0.25, 0.05), f(0.3, 1.2, 2.4), C.steel);
    G.add(rb(2.6, 0.7, 1.4, 0.25), f(-1.4, 2.05, 2.4), lin(0x5A8CFF));
    G.add(rb(1.7, 0.55, 1.2, 0.25), f(-1.4, 2.6, 2.4), lin(0x5A8CFF));
    for (const s of [-1, 1]) S.add(cyl(0.3, 0.3, 0.2, 12), f(-1.4 + s * 0.9, 1.68, 3.05, Math.PI / 2, 0, 0), C.black);
    // windows
    for (const wx of [2.4, 3.7]) { S.add(rb(1.0, 1.2, 0.1, 0.05), f(wx, 2.6, 3.5), C.navy); N.add(rb(0.85, 1.05, 0.06, 0.04), f(wx, 2.6, 3.54), lin(0xFFD9A0)); }
    // giant wrench on the roof
    const wr = new THREE.Shape();
    wr.moveTo(-2.6, -0.32); wr.lineTo(1.6, -0.32); wr.absarc(2.35, 0, 0.82, Math.PI + 0.4, Math.PI * 3 - 0.4, false); wr.lineTo(1.6, 0.32); wr.lineTo(-2.6, 0.32); wr.absarc(-2.6, 0, 0.32, Math.PI / 2, Math.PI * 1.5, false);
    const hole = new THREE.Path(); hole.absarc(2.35, 0, 0.4, 0, TAU, true); wr.holes.push(hole);
    const wrG = new THREE.ExtrudeGeometry(wr, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 16 });
    G.add(wrG, f(0, 6.7, 0.2, 0, 0, 0.12), faceSide(C.orange, shade(C.orange, 0.65)));
    S.add(textGeo('10', 0.62, 0.1), f(-0.6, 6.42, 0.62, 0, 0, 0.12), faceSide(C.white, C.cream));
    for (const s of [-1.8, 1.8]) S.add(cyl(0.08, 0.08, 1.6, 6), f(s, 5.6, 0.2), C.navy);
    box(f, 0, 2.4, 0, 4.55, 2.4, 3.55);
    // billboard with the concept site
    const tex = loadTex(IMAGES.auto);
    const bf = frame(41.6, 33.6, -0.15);
    for (const s of [-1, 1]) { S.add(cyl(0.12, 0.14, 3.0, 8), bf(s * 2.4, 1.5, 0), C.navy); }
    G.add(rb(5.6, 3.9, 0.25, 0.12), bf(0, 4.05, 0, -0.18, 0, 0), C.navy);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(5.3, 3.6), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    scr.applyMatrix4(bf(0, 4.05, 0, -0.18, 0, 0)); scr.translateZ(0.13); scr.material.color.setScalar(0.92);
    scene.add(scr);
    { const [wx, wz] = bf.w(0, 0); phys.box(wx, bf.y + 1.5, wz, 2.6, 1.5, 0.3, -0.15); }
  }

  // ===================== Миндаль: beauty salon =====================
  {
    const cream = lin(0xF6EDE4), rose = lin(0xC98386), blush = lin(0xEBD3CB), cocoa = lin(0x3A2A26), sage = lin(0x9DA88F), gold = lin(0xD9B26A);
    const f = frame(26, 39.8, -0.3);
    S.add(rb(9.4, 0.4, 7.4, 0.12), f(0, 0.2, 0), C.stone);
    G.add(rb(8.4, 4.4, 6.4, 0.25), f(0, 2.6, 0), cream);
    G.add(rb(8.9, 0.42, 6.9, 0.14), f(0, 4.92, 0), rose);
    G.add(rb(8.1, 0.3, 6.1, 0.1), f(0, 5.25, 0), blush);
    // arched shop window with a mirror and a chair inside
    const arch = new THREE.Shape(); arch.moveTo(-1.45, 0); arch.lineTo(1.45, 0); arch.lineTo(1.45, 1.9); arch.absarc(0, 1.9, 1.45, 0, Math.PI, false); arch.lineTo(-1.45, 0);
    const archG = (s, d) => { const g = new THREE.ExtrudeGeometry(arch, { depth: d, bevelEnabled: false, curveSegments: 20 }); g.scale(s, s, 1); return g; };
    S.add(archG(1.12, 0.12), f(-1.6, 0.85, 3.17), gold);
    S.add(archG(1.0, 0.1), f(-1.6, 0.95, 3.22), lin(0x2A2236));
    N.add(archG(0.94, 0.04), f(-1.6, 1.0, 3.27), lin(0xFFD7C2));
    S.add(new THREE.TorusGeometry(0.55, 0.07, 8, 28), f(-1.6, 2.75, 3.36), gold);
    S.add(new THREE.CircleGeometry(0.5, 24), f(-1.6, 2.75, 3.355), lin(0xF4E7E2));
    S.add(rb(1.0, 0.5, 0.5, 0.15), f(-1.6, 1.32, 3.36), rose);
    S.add(rb(0.95, 0.85, 0.16, 0.12), f(-1.6, 1.85, 3.18), rose);
    // door with a scalloped awning, sign above
    S.add(rb(1.4, 2.5, 0.16, 0.08), f(2.3, 1.65, 3.24), rose);
    S.add(sph(0.07, 1), f(2.8, 1.65, 3.36), gold);
    for (let i = 0; i < 4; i++) S.add(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 10, 1, false, 0, Math.PI), f(1.52 + i * 0.52, 3.08, 3.62, Math.PI / 2, 0, 0), i % 2 ? cream : rose);
    S.add(rb(2.1, 0.08, 0.9, 0.03), f(2.3, 3.3, 3.25, -0.35, 0, 0), rose);
    S.add(rb(2.4, 0.6, 0.12, 0.06), f(2.3, 4.05, 3.24), cream);
    S.add(textGeo('САЛОН КРАСОТЫ', 0.3, 0.05, false), f(2.3, 3.9, 3.3), cocoa);
    // planters and a bench
    for (const lx of [0.95, 3.65]) { S.add(new THREE.CylinderGeometry(0.34, 0.27, 0.62, 12), f(lx, 0.71, 3.75), sage); S.add(sph(0.45, 1), f(lx, 1.28, 3.75), lin(0x8C9A6E)); }
    S.add(rb(1.9, 0.12, 0.55, 0.04), f(-1.6, 0.86, 4.25), C.wood); for (const s2 of [-0.75, 0.75]) S.add(rb(0.1, 0.45, 0.45, 0.03), f(-1.6 + s2, 0.6, 4.25), cocoa);
    box(f, 0, 2.4, 0, 4.25, 2.4, 3.25);
    { const [bx, bz] = f.w(-1.6, 4.25); phys.box(bx, f.y + 0.55, bz, 1.0, 0.35, 0.3, f.yaw); }
    // big phone with the concept
    const tex = loadTex(IMAGES.salon);
    const pf = frame(11.6, 43.4, 0.3);
    S.add(rb(1.9, 0.3, 1.2, 0.1), pf(0, 0.15, 0.1), C.navy2);
    G.add(rb(2.4, 4.9, 0.26, 0.34, 3), pf(0, 2.85, 0, -0.3, 0, 0), C.black);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.14, 4.6), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    screen.applyMatrix4(pf(0, 2.85, 0, -0.3, 0, 0)); screen.translateZ(0.135); screen.material.color.setScalar(0.92);
    scene.add(screen);
    { const [wx, wz] = pf.w(0, 0.2); phys.box(wx, pf.y + 1.6, wz, 1.2, 1.6, 0.4, 0.3); }
  }

  // ===================== plaza signpost =====================
  {
    const f = frame(SIGN.x, SIGN.z, 0);
    S.add(cyl(0.14, 0.18, 3.6, 8), f(0, 1.8, 0), C.wood2);
    S.add(sph(0.2, 1), f(0, 3.65, 0), C.magenta);
    const targets = ['vpn', 'contact', 'auto', 'dt'];
    targets.forEach((id, i) => {
      const zz = ZONE[id];
      const yaw = Math.atan2(zz.t[0] - SIGN.x, zz.t[1] - SIGN.z) - Math.PI / 2;
      const y = 3.0 - i * 0.55;
      const board = rb(2.5, 0.42, 0.1, 0.05);
      const m = f(0, y, 0, 0, yaw, 0);
      S.add(board, Tmul(m, T(1.25, 0, 0)), C.cream);
      S.add(new THREE.ConeGeometry(0.3, 0.4, 3), Tmul(m, T(2.6, 0, 0, 0, 0, -Math.PI / 2, 1, 1, 0.25)), C.cream);
      const tg = textGeo(zz.name, 0.28, 0.03, false);
      S.add(tg, Tmul(m, T(1.25, -0.13, 0.06)), lin(zz.color === 0xFFC857 ? 0x1E2340 : 0x1E2340));
      S.add(tg, Tmul(m, T(1.25, -0.13, -0.06, 0, Math.PI, 0)), C.navy);
    });
    phys.cyl(SIGN.x, heightAt(SIGN.x, SIGN.z), SIGN.z, 0.25, 3.6);
  }

  // ===================== fountain in the middle of the plaza =====================
  {
    const F = FOUNTAIN, gy = heightAt(F.x, F.z) + 0.05;
    const f = frame(F.x, F.z, 0, gy);
    const stone = lin(0xEDE7F5), stone2 = lin(0xD3CAE4);
    G.add(cyl(2.55, 2.72, 0.62, 40), f(0, 0.31, 0), stone);
    G.add(new THREE.TorusGeometry(2.56, 0.16, 8, 44), f(0, 0.62, 0, Math.PI / 2, 0, 0), stone2);
    G.add(cyl(0.36, 0.58, 1.25, 18), f(0, 1.24, 0), stone);
    const bowl = r => new THREE.LatheGeometry([new THREE.Vector2(0.12, 0), new THREE.Vector2(r * 0.55, 0.04), new THREE.Vector2(r, 0.3), new THREE.Vector2(r * 1.03, 0.37), new THREE.Vector2(r * 0.94, 0.38), new THREE.Vector2(r * 0.5, 0.2), new THREE.Vector2(0.12, 0.18)], 30);
    G.add(bowl(1.32), f(0, 1.84, 0), stone);
    G.add(cyl(0.15, 0.21, 0.72, 14), f(0, 2.56, 0), stone);
    G.add(bowl(0.74), f(0, 2.86, 0), stone);
    G.add(sph(0.2, 2), f(0, 3.42, 0), C.magenta);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; G.add(sph(0.12, 1), f(Math.cos(a) * 2.56, 0.72, Math.sin(a) * 2.56), C.magenta); }
    N.add(new THREE.TorusGeometry(2.32, 0.05, 6, 48), f(0, 0.47, 0, Math.PI / 2, 0, 0), lin(0x8FE3FF));
    // water surfaces
    const wm = waterMaterial(false);
    WATER_MATS.push(wm);
    wm.uniforms.uShallow.value.set(0x7FE3EE); wm.uniforms.uDeep.value.set(0x2AA6C8);
    const disc = (r, y) => {
      const g = new THREE.CircleGeometry(r, 40);
      const uv = g.attributes.uv, p = g.attributes.position;
      for (let i = 0; i < uv.count; i++) { const x = p.getX(i), yy = p.getY(i); uv.setXY(i, 0.5 + 0.5 * Math.hypot(x, yy) / r, Math.atan2(yy, x) * 1.5); }
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, wm); m.position.set(F.x, gy + y, F.z); m.renderOrder = 2; scene.add(m);
    };
    disc(2.42, 0.5); disc(1.22, 2.18); disc(0.68, 3.2);
    // falling water curtains
    const cm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: U.time, uCol: { value: new THREE.Color(0x9FE6F2) }, uLight: { value: 1 } },
      vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`${NOISE_GLSL}
        uniform float uTime, uLight; uniform vec3 uCol; varying vec2 vUv;
        void main(){ float s = 1.0 - vUv.y;
          float n = vn(vec2(vUv.x * 46.0, s * 5.0 - uTime * 3.4)) * 0.6 + vn(vec2(vUv.x * 93.0, s * 9.0 - uTime * 5.0)) * 0.4;
          float a = (0.22 + 0.55 * smoothstep(0.35, 0.8, n)) * (1.0 - smoothstep(0.72, 1.0, s)) * smoothstep(0.0, 0.06, s);
          gl_FragColor = vec4(mix(uCol, vec3(1.0), smoothstep(0.5, 0.85, n)) * uLight, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    WATER_MATS.push(cm);
    const curtain = (r0, r1, y0, y1) => { const g = new THREE.CylinderGeometry(r0, r1, y0 - y1, 36, 1, true); const m = new THREE.Mesh(g, cm); m.position.set(F.x, gy + (y0 + y1) / 2, F.z); m.renderOrder = 3; scene.add(m); };
    curtain(1.37, 1.75, 2.2, 0.5); curtain(0.78, 1.0, 3.22, 2.2);
    const b1 = phys.cyl(F.x, gy, F.z, 2.72, 0.72), b2 = phys.cyl(F.x, gy, F.z, 0.62, 3.3);
    b1.userData = b2.userData = { fountain: true };
    anim.fountain = { x: F.x, y: gy, z: F.z };
  }

  // ===================== build meshes =====================
  const nm = nightMat(), bm = blinkMat();
  scene.add(...S.meshes(M.solid, { name: 'zonesSolid' }), ...G.meshes(M.glossy, { name: 'zonesGlossy' }),
    ...N.meshes(nm, { cast: false, receive: false, name: 'zonesNight' }), ...L.meshes(bm, { cast: false, receive: false, name: 'zonesLeds' }));

  // ===================== zone rings + markers =====================
  const markers = ZONES.map(z => {
    const y = heightAt(z.t[0], z.t[1]) + 0.07;
    const col = new THREE.Color(z.color);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: U.time, uCol: { value: col }, uOn: { value: 0 } },
      vertexShader: /* glsl */`varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`uniform float uTime, uOn; uniform vec3 uCol; varying vec2 vP;
        void main(){ float r = length(vP); float a = atan(vP.y, vP.x);
          float R = ${z.r.toFixed(2)};
          float ring = smoothstep(R - 0.42, R - 0.3, r) * (1.0 - smoothstep(R - 0.06, R, r));
          float dash = step(0.42, fract(a / 6.2831 * 28.0 + uTime * 0.12));
          float fill = (1.0 - smoothstep(R - 0.5, R - 0.3, r)) * (0.10 + 0.14 * uOn + 0.05 * sin(uTime * 3.0 - r * 1.5));
          float alpha = ring * mix(0.55 + 0.45 * dash, 1.0, uOn) + fill;
          gl_FragColor = vec4(uCol * (1.0 + uOn * 0.6), alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(z.r, 64), mat);
    disc.rotation.x = -Math.PI / 2; disc.position.set(z.t[0], y, z.t[1]);
    // the shader reads local xz: rotate geometry instead so position.xz == local
    disc.geometry.rotateX(-Math.PI / 2); disc.rotation.x = 0;
    disc.renderOrder = 1;
    scene.add(disc);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, roughness: 0.3 }));
    gem.scale.set(1, 1.6, 1);
    gem.position.set(z.t[0], y + 3.4, z.t[1]);
    gem.castShadow = true;
    scene.add(gem);
    return { z, disc, gem, mat, y, on: 0 };
  });
  anim.push((dt, t) => markers.forEach((m, i) => {
    m.gem.position.y = m.y + 3.3 + Math.sin(t * 2 + i) * 0.25 - m.on * 0.4;
    m.gem.rotation.y = t * 1.4 + i;
    m.mat.uniforms.uOn.value += ((m.active ? 1 : 0) - m.mat.uniforms.uOn.value) * Math.min(1, dt * 6);
    m.on = m.mat.uniforms.uOn.value;
    m.gem.scale.setScalar(1 - m.on * 0.15); m.gem.scale.y = 1.6 * (1 - m.on * 0.15);
  }));

  return {
    markers, anim, letters,
    update(dt, t, night) { for (const f of anim) f(dt, t, night); }
  };
}

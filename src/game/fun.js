// Southern fun area: giant retro TV drive-in, bowling lane, jukebox and a UFO that only shows up at night.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Builder, mesh, T, Tmul } from './builder.js';
import { M, U } from './materials.js';
import { lin, rand, TAU } from './util.js';
import { BOWL, heightAt, JUKE, KIOSK, PARK, TV, UFO } from './layout.js';

export const VIDEO = { mp4: 'tv/big-buck-bunny.mp4', webm: 'tv/big-buck-bunny.webm', title: 'Big Buck Bunny', credit: '© 2008 Blender Foundation · CC BY 3.0' };
import { rb, textGeo } from './zones.js';
import { occ } from './decor.js';
import { PropSet } from './props.js';
import { G_DEBRIS } from './physics.js';
import { Cartoon } from './cartoon.js';

const C = {
  walnut: lin(0x9A5A3C), walnutDark: lin(0x6A3A2A), cream: lin(0xF6E6CC), ink: lin(0x231B2E), gold: lin(0xE9C46A), chrome: lin(0xD9D4E8),
  asphalt: lin(0x3D3352), line: lin(0xFFF1DC), wine: lin(0x7A1E40), pink: lin(0xFF4FA0), plank: lin(0xE8B878), plank2: lin(0xD9A466), gutter: lin(0x2E2440),
  white: lin(0xF7F4FA), red: lin(0xE5484D), silver: lin(0xC9C3DE)
};

const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false });

function crtMaterial(tex) {
  return new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex }, uTime: U.time, uOn: { value: 0 }, uBright: { value: 1.35 }, uScale: { value: new THREE.Vector2(1, 1) }, uStatic: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform float uTime, uOn, uBright, uStatic; uniform vec2 uScale; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 uv = vUv * 2.0 - 1.0;
        uv *= 1.0 + 0.055 * dot(uv, uv);
        uv = uv * 0.5 + 0.5;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { gl_FragColor = vec4(0.012, 0.01, 0.018, 1.0); return; }
        // picture area (letterbox for wide video)
        vec2 tv = (uv - 0.5) * uScale + 0.5;
        float inPic = step(0.0, tv.y) * step(tv.y, 1.0) * step(0.0, tv.x) * step(tv.x, 1.0);
        // a little horizontal wobble while the channel tunes in
        tv.x += (h(vec2(floor(uv.y * 90.0), floor(uTime * 24.0))) - 0.5) * 0.03 * uStatic;
        vec3 c;
        c.r = texture2D(uTex, tv + vec2(0.0016, 0.0)).r;
        c.g = texture2D(uTex, tv).g;
        c.b = texture2D(uTex, tv - vec2(0.0016, 0.0)).b;
        c *= inPic;
        float scan = 0.84 + 0.16 * sin(uv.y * 360.0 * 3.14159);
        float vig = smoothstep(1.25, 0.4, length((uv - 0.5) * vec2(1.25, 1.35)) * 1.5);
        float flick = 0.97 + 0.03 * sin(uTime * 57.0);
        float n = h(floor(uv * vec2(240.0, 180.0)) + floor(uTime * 30.0));
        float snow = max(1.0 - smoothstep(0.35, 1.0, uOn), uStatic);
        c = mix(c, vec3(n * 0.8), snow);
        c *= scan * vig * flick * uBright * smoothstep(0.0, 0.25, uOn);
        gl_FragColor = vec4(c, 1.0);
      }`
  });
}

function pinGeo() {
  const prof = [[0, 0], [0.16, 0], [0.24, 0.12], [0.275, 0.32], [0.25, 0.5], [0.17, 0.72], [0.12, 0.85], [0.13, 0.95], [0.15, 1.05], [0.13, 1.17], [0.07, 1.24], [0, 1.25]]
    .map(([r, y]) => new THREE.Vector2(r, y - 0.62));
  const b = new Builder();
  b.add(new THREE.LatheGeometry(prof, 14), T(), C.white);
  for (const y of [0.86, 0.94]) b.add(new THREE.TorusGeometry(0.128, 0.022, 5, 16), T(0, y - 0.62, 0, Math.PI / 2, 0, 0), C.red);
  return b.build();
}

export function buildFun(scene, phys, quality) {
  const out = { tv: null, bowl: null, juke: null, ufo: null };
  const solid = new Builder();
  const glowB = new Builder();

  // ================= giant retro TV =================
  const gy = heightAt(TV.x, TV.z);
  const TVW = 11.4, TVH = 8.0, TVD = 3.2, LEG = 1.15, cy = gy + LEG + TVH / 2, fz = TV.z + TVD / 2;
  solid.add(rb(TVW, TVH, TVD, 0.55, 2), T(TV.x, cy, TV.z), C.walnut);
  solid.add(rb(TVW - 0.5, 0.35, TVD + 0.1, 0.12), T(TV.x, cy + TVH / 2 - 0.05, TV.z), C.walnutDark);
  solid.add(rb(TVW - 0.5, 0.3, TVD + 0.1, 0.12), T(TV.x, cy - TVH / 2 + 0.1, TV.z), C.walnutDark);
  const sx = TV.x - 1.35, sy = cy + 0.15, SW = 7.2, SH = 5.4;
  solid.add(rb(SW + 0.75, SH + 0.75, 0.3, 0.3), T(sx, sy, fz + 0.05), C.cream);
  solid.add(rb(SW + 0.25, SH + 0.25, 0.3, 0.2), T(sx, sy, fz + 0.12), C.ink);
  // control panel: knobs + speaker
  solid.add(rb(2.0, TVH - 1.2, 0.2, 0.18), T(TV.x + 4.25, cy, fz + 0.05), C.cream);
  for (const [ky, kc] of [[cy + 2.3, C.gold], [cy + 0.75, C.gold]]) {
    solid.add(new THREE.CylinderGeometry(0.5, 0.55, 0.32, 18), T(TV.x + 4.25, ky, fz + 0.3, Math.PI / 2, 0, 0), kc);
    solid.add(rb(0.12, 0.62, 0.12, 0.04), T(TV.x + 4.25, ky, fz + 0.48), C.ink);
  }
  for (let i = 0; i < 6; i++) solid.add(rb(1.4, 0.12, 0.1, 0.04), T(TV.x + 4.25, cy - 1.0 - i * 0.36, fz + 0.2), C.walnutDark);
  // name plate under the screen
  {
    const tg = textGeo('ОСТРОВ ТВ', 0.42, 0.08, false);
    solid.add(tg, T(sx, cy - TVH / 2 + 0.38, fz + 0.12), C.cream);
  }
  // legs
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) solid.add(new THREE.CylinderGeometry(0.14, 0.22, LEG + 0.4, 8), T(TV.x + lx * (TVW / 2 - 1.0), gy + LEG / 2, TV.z + lz * (TVD / 2 - 0.6), lz * 0.12, 0, -lx * 0.12), C.walnutDark);
  // rabbit-ear antennas
  const top = cy + TVH / 2;
  solid.add(rb(1.4, 0.45, 1.0, 0.2), T(TV.x + 0.6, top + 0.15, TV.z), C.ink);
  for (const s of [-1, 1]) {
    const L = 4.6, a = s * 0.5;
    solid.add(new THREE.CylinderGeometry(0.05, 0.07, L, 6), Tmul(T(TV.x + 0.6, top + 0.35, TV.z, -0.2, 0, a), T(0, L / 2, 0)), C.chrome);
    solid.add(new THREE.SphereGeometry(0.2, 10, 8), Tmul(T(TV.x + 0.6, top + 0.35, TV.z, -0.2, 0, a), T(0, L, 0)), C.chrome);
  }
  phys.box(TV.x, cy, TV.z, TVW / 2, TVH / 2 + 0.4, TVD / 2);
  occ.add(TV.x, TV.z, 7);
  const cartoon = new Cartoon();
  const screenMat = crtMaterial(cartoon.tex);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), screenMat);
  screen.position.set(sx, sy, fz + 0.3);
  scene.add(screen);
  // the TV's light spills onto the parking lot at night
  const tvLight = new THREE.PointLight(0x9FD8FF, 0, 22, 1.4);
  tvLight.position.set(sx, sy, fz + 4);
  scene.add(tvLight);

  // ---- drive-in parking: asphalt, bays, wheel stops, string lights ----
  {
    const py = heightAt(PARK.x, PARK.z) + 0.04;
    solid.add(new THREE.BoxGeometry(PARK.hw * 2, 0.08, PARK.hz * 2), T(PARK.x, py - 0.03, PARK.z), C.asphalt);
    for (const dx of [-PARK.hw + 0.3, -2.1, 2.1, PARK.hw - 0.3]) solid.add(new THREE.BoxGeometry(0.16, 0.02, PARK.hz * 2 - 1.2), T(PARK.x + dx, py + 0.02, PARK.z + 0.3), C.line);
    for (const dx of [-4.15, 0, 4.15]) solid.add(rb(2.4, 0.22, 0.4, 0.08), T(PARK.x + dx, py + 0.1, PARK.z - PARK.hz + 0.9), C.cream);
    // poles + garlands of bulbs
    const poles = [[PARK.x - PARK.hw - 0.4, PARK.z + PARK.hz], [PARK.x + PARK.hw + 0.4, PARK.z + PARK.hz], [PARK.x - PARK.hw - 0.4, PARK.z - PARK.hz + 0.4], [PARK.x + PARK.hw + 0.4, PARK.z - PARK.hz + 0.4]];
    for (const [x, z] of poles) { solid.add(new THREE.CylinderGeometry(0.08, 0.11, 4.2, 6), T(x, py + 2.1, z), C.ink); phys.cyl(x, py, z, 0.15, 4.2); occ.add(x, z, 1); }
    const garland = (a, b) => {
      for (let i = 1; i < 12; i++) {
        const t = i / 12, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, y = py + 4.0 - Math.sin(t * Math.PI) * 0.9;
        glowB.add(new THREE.SphereGeometry(0.11, 8, 6), T(x, y, z), i % 3 === 0 ? [2.4, 1.2, 1.8] : i % 3 === 1 ? [2.6, 2.0, 1.0] : [1.2, 2.2, 2.4]);
      }
    };
    garland(poles[0], poles[1]); garland(poles[2], poles[3]); garland(poles[0], poles[2]); garland(poles[1], poles[3]);
  }

  // ================= jukebox =================
  {
    const jy = heightAt(JUKE.x, JUKE.z), x = JUKE.x, z = JUKE.z;
    solid.add(rb(1.8, 2.0, 1.0, 0.16), T(x, jy + 1.0, z), C.wine);
    const arch = new THREE.Shape(); arch.absarc(0, 0, 0.9, 0, Math.PI, false); arch.lineTo(0.9, 0);
    const ag = new THREE.ExtrudeGeometry(arch, { depth: 1.0, bevelEnabled: false, curveSegments: 18 }); ag.translate(0, 0, -0.5);
    solid.add(ag, T(x, jy + 2.0, z), C.wine);
    solid.add(rb(1.3, 0.9, 0.12, 0.08), T(x, jy + 1.35, z + 0.5), C.ink);
    solid.add(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 22), T(x, jy + 1.35, z + 0.57, Math.PI / 2, 0, 0), lin(0x111018));
    solid.add(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 14), T(x, jy + 1.35, z + 0.58, Math.PI / 2, 0, 0), C.pink);
    for (let i = 0; i < 5; i++) solid.add(rb(1.3, 0.06, 0.08, 0.02), T(x, jy + 0.3 + i * 0.13, z + 0.52), C.chrome);
    [[0.82, [3.2, 0.9, 2.1]], [0.68, [3.0, 2.4, 0.8]], [0.54, [0.7, 2.6, 2.2]]].forEach(([r, col]) => {
      glowB.add(new THREE.TorusGeometry(r, 0.055, 6, 26, Math.PI), T(x, jy + 2.0, z + 0.52), col);
    });
    glowB.add(rb(0.12, 1.7, 0.08, 0.04), T(x - 0.8, jy + 1.05, z + 0.52), [3.2, 0.9, 2.1]);
    glowB.add(rb(0.12, 1.7, 0.08, 0.04), T(x + 0.8, jy + 1.05, z + 0.52), [3.2, 0.9, 2.1]);
    phys.box(x, jy + 1.4, z, 0.9, 1.4, 0.5);
    occ.add(x, z, 2);
    out.juke = { x, z, y: jy + 2.6 };
  }

  // ================= popcorn stand =================
  {
    const x = KIOSK.x, z = KIOSK.z, ky = heightAt(x, z);
    solid.add(rb(2.4, 1.15, 1.3, 0.08), T(x, ky + 0.575, z), C.cream);
    for (let i = 0; i < 5; i++) solid.add(rb(0.24, 1.0, 0.06, 0.02), T(x - 0.96 + i * 0.48, ky + 0.58, z + 0.66), C.red);
    solid.add(rb(2.6, 0.12, 1.5, 0.04), T(x, ky + 1.2, z), C.wine);
    // popcorn machine: warm lit glass box full of popcorn, red cap
    solid.add(rb(1.1, 0.9, 0.8, 0.06), T(x + 0.45, ky + 1.71, z - 0.1), lin(0xFFE3A3));
    solid.add(rb(1.22, 0.2, 0.92, 0.06), T(x + 0.45, ky + 2.25, z - 0.1), C.red);
    solid.add(new THREE.CylinderGeometry(0.08, 0.12, 0.25, 8), T(x + 0.45, ky + 2.46, z - 0.1), C.gold);
    // striped paper cup with popcorn
    solid.add(new THREE.CylinderGeometry(0.2, 0.15, 0.42, 12), T(x - 0.65, ky + 1.47, z + 0.25), C.white);
    for (let i = 0; i < 4; i++) solid.add(new THREE.CylinderGeometry(0.205, 0.155, 0.42, 12, 1, true, i * Math.PI / 2, Math.PI / 4), T(x - 0.65, ky + 1.47, z + 0.25), C.red);
    for (let i = 0; i < 9; i++) solid.add(new THREE.IcosahedronGeometry(0.075, 0), T(x - 0.65 + (rand() - 0.5) * 0.3, ky + 1.7 + rand() * 0.12, z + 0.25 + (rand() - 0.5) * 0.3), rand() < 0.3 ? lin(0xF6D57A) : lin(0xFFF6E2));
    // poles + striped awning, sign on top
    for (const s of [-1, 1]) solid.add(new THREE.CylinderGeometry(0.06, 0.07, 2.9, 8), T(x + s * 1.15, ky + 1.45, z - 0.6), C.ink);
    for (let i = 0; i < 6; i++) solid.add(rb(0.46, 0.06, 1.7, 0.02), T(x - 1.15 + i * 0.46, ky + 2.72, z + 0.1, 0.32, 0, 0), i % 2 ? C.cream : C.red);
    for (let i = 0; i < 6; i++) solid.add(new THREE.CylinderGeometry(0.23, 0.23, 0.05, 10, 1, false, 0, Math.PI), T(x - 1.15 + i * 0.46, ky + 2.42, z + 0.9, Math.PI / 2, 0, 0), i % 2 ? C.cream : C.red);
    solid.add(rb(2.5, 0.62, 0.14, 0.06), T(x, ky + 3.3, z - 0.62), C.wine);
    solid.add(textGeo('ПОПКОРН', 0.4, 0.07, false), T(x, ky + 3.09, z - 0.52), C.cream);
    for (let i = 0; i < 7; i++) glowB.add(new THREE.SphereGeometry(0.06, 6, 5), T(x - 1.08 + i * 0.36, ky + 3.66, z - 0.56), i % 2 ? [2.6, 2.0, 1.0] : [2.4, 1.2, 1.8]);
    phys.box(x, ky + 0.75, z, 1.25, 0.75, 0.72);
    phys.cyl(x - 1.15, ky, z - 0.6, 0.1, 2.9); phys.cyl(x + 1.15, ky, z - 0.6, 0.1, 2.9);
    occ.add(x, z, 2.6);
    out.kiosk = { x, z, y: ky + 2.0 };
  }

  // ================= bowling =================
  {
    const by = heightAt((BOWL.x0 + BOWL.x1) / 2, BOWL.z) + 0.035, L = BOWL.x1 - BOWL.x0, cx = (BOWL.x0 + BOWL.x1) / 2, z = BOWL.z, hw = BOWL.hw;
    const n = 8;
    for (let i = 0; i < n; i++) solid.add(new THREE.BoxGeometry(L, 0.06, hw * 2 / n - 0.012), T(cx, by, z - hw + (i + 0.5) * hw * 2 / n), i % 2 ? C.plank : C.plank2);
    for (let k = 0; k < 7; k++) { const g = new THREE.ConeGeometry(0.13, 0.42, 3); g.rotateX(Math.PI / 2); g.rotateY(-Math.PI / 2); solid.add(g, T(BOWL.x0 + 6.5 + Math.abs(k - 3) * 0.35, by + 0.035, z - 1.5 + k * 0.5, 0, 0, 0, 1, 0.1, 1), C.wine); }
    solid.add(new THREE.BoxGeometry(0.08, 0.02, hw * 2), T(BOWL.x0 + 1.4, by + 0.035, z), C.ink);
    for (const s of [-1, 1]) {
      solid.add(new THREE.BoxGeometry(L, 0.05, 0.5), T(cx, by - 0.04, z + s * (hw + 0.25)), C.gutter);
      solid.add(rb(L, 0.5, 0.24, 0.08), T(cx, by + 0.22, z + s * (hw + 0.62)), C.wine);
      solid.add(rb(L, 0.08, 0.28, 0.04), T(cx, by + 0.5, z + s * (hw + 0.62)), C.cream);
      phys.box(cx, by + 0.3, z + s * (hw + 0.62), L / 2, 0.3, 0.12);
    }
    // backstop with a neon stripe
    solid.add(rb(0.6, 2.8, hw * 2 + 1.7, 0.1), T(BOWL.x1 + 0.7, by + 1.4, z), lin(0x2B2340));
    glowB.add(rb(0.1, 0.16, hw * 2 + 1.5, 0.04), T(BOWL.x1 + 0.38, by + 2.3, z), [3.2, 0.9, 2.1]);
    phys.box(BOWL.x1 + 0.7, by + 1.4, z, 0.3, 1.4, hw + 0.85);
    // a sign that faces the camera (south)
    {
      const sxp = cx + 2, szp = z - hw - 1.6;
      solid.add(rb(7.4, 1.6, 0.3, 0.12), T(sxp, by + 2.4, szp), lin(0x2B2340));
      for (const dx of [-3, 3]) { solid.add(new THREE.CylinderGeometry(0.1, 0.12, 2.0, 6), T(sxp + dx, by + 1.0, szp), C.ink); phys.cyl(sxp + dx, by, szp, 0.15, 2); }
      const tg = textGeo('Боулинг', 0.95, 0.12, false);
      solid.add(tg, T(sxp, by + 1.85, szp + 0.17), C.cream);
      occ.add(sxp, szp, 4);
    }
    const pins = new PropSet(scene, phys, {
      max: 10, mass: 1.0, linDamp: 0.06, angDamp: 0.1, sleepSpeed: 0.15, sleepTime: 0.6, material: 'pin',
      parts: [{ geo: pinGeo(), mat: (() => { const m = M.instGlossy.clone(); m.vertexColors = true; return m; })() }],
      shape: b => { b.addShape(new CANNON.Cylinder(0.16, 0.26, 0.9, 10), new CANNON.Vec3(0, -0.17, 0)); b.addShape(new CANNON.Sphere(0.16), new CANNON.Vec3(0, 0.42, 0)); },
      kind: 'pin', group: G_DEBRIS
    });
    const hx = BOWL.x1 - 4.4;
    for (let r = 0; r < 4; r++) for (let i = 0; i <= r; i++) pins.add(hx + r * 0.86, by + 0.64, z + (i - r / 2) * 0.92, 0);
    occ.add(cx, z, hw + 2);
    out.bowl = { pins, armed: false, t: 0, resetT: 0, x: hx + 1.4, z };
  }

  // ================= UFO (night only) =================
  {
    const g = new THREE.Group();
    const gy = heightAt(UFO.x, UFO.z);
    const prof = [[0, 0], [1.6, 0.05], [3.4, 0.35], [4.2, 0.65], [3.6, 0.95], [1.8, 1.15], [0, 1.2]].map(([r, y]) => new THREE.Vector2(r, y));
    const hull = new THREE.Mesh(new THREE.LatheGeometry(prof, 36), new THREE.MeshStandardMaterial({ color: 0xC9C3DE, roughness: 0.25, metalness: 0.4 }));
    hull.castShadow = true;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 10, 0, TAU, 0, Math.PI / 2), glow(0.6, 2.4, 2.5));
    dome.position.y = 1.1;
    const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), 16);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; lights.setMatrixAt(i, m4.makeTranslation(Math.cos(a) * 3.85, 0.62, Math.sin(a) * 3.85)); lights.setColorAt(i, new THREE.Color(1, 1, 1)); }
    const under = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24).rotateX(Math.PI / 2), glow(0.8, 2.6, 2.2));
    under.position.y = -0.02;
    const H = UFO.h + 0.4;
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: U.time, uBeam: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uTime, uBeam; varying vec2 vUv; void main(){ float r = 0.55 + 0.45 * sin(vUv.y * 40.0 - uTime * 9.0); float a = uBeam * (0.22 + 0.4 * vUv.y) * r; gl_FragColor = vec4(vec3(0.55, 1.6, 1.4) * a, a); }'
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 3.4, H, 32, 1, true), beamMat);
    beam.position.y = -H / 2;
    g.add(hull, dome, lights, under, beam);
    g.position.set(UFO.x, gy + UFO.h + 10, UFO.z);
    g.visible = false;
    scene.add(g);
    // soft glow on the crop circles under the saucer (additive disc, no extra light in the scene)
    const spotMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uK: { value: 0 }, uTime: U.time },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uK, uTime; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(0.0, 1.0, d)) * uK * (0.85 + 0.15 * sin(uTime * 3.0 - d * 9.0)); gl_FragColor = vec4(vec3(0.35, 1.0, 0.9) * a, a); }'
    });
    const spot = new THREE.Mesh(new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2), spotMat);
    spot.position.set(UFO.x, gy + 0.09, UFO.z);
    spot.renderOrder = 2; spot.visible = false;
    scene.add(spot);
    out.ufo = { g, lights, beamMat, spot, spotMat, gy, t: -1 };
    // the saucer only comes down when called (a honk in the circles at night), filmed by its own camera shot
    out.ufoStart = () => { out.ufo.t = 0; };
  }

  const solidMesh = mesh(solid.build(), M.solid, { cast: true, receive: true, name: 'fun' });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  glowMat.onBeforeCompile = sh => {
    sh.uniforms.uLamps = U.lamps;
    sh.fragmentShader = 'uniform float uLamps;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 0.55 + uLamps * 0.75;');
  };
  const glowMesh = mesh(glowB.build(), glowMat, { cast: false, receive: false, name: 'funGlow' });
  scene.add(solidMesh, glowMesh);

  // ---- programme: our own cartoon and a real one (video; http(s) only — file:// video can't be drawn by WebGL) ----
  const tv = out.tv = { cartoon, screenMat, tvLight, x: TV.x, z: TV.z, sx, sy, fz, on: 0, prog: 'toon', sw: 0, video: null, vtex: null, vok: false, vfail: false, played: 0 };
  const TOON_SCALE = new THREE.Vector2(1, 1), VIDEO_SCALE = new THREE.Vector2(0.875, 1.1667); // 16:9 shown as 14:9 on the 4:3 tube
  const setTex = () => {
    const vid = tv.prog === 'video' && tv.vtex;
    screenMat.uniforms.uTex.value = vid ? tv.vtex : cartoon.tex;
    screenMat.uniforms.uScale.value.copy(vid ? VIDEO_SCALE : TOON_SCALE);
  };
  const playVideo = () => {
    const v = tv.video, p = v.play();
    if (p && p.catch) p.catch(() => { if (!v.muted) { v.muted = true; v.play().catch(() => {}); } });
  };
  const switchTo = (prog, evs) => {
    tv.prog = prog; tv.sw = 0.9;
    if (prog === 'video') { const v = tv.video; v.pause(); try { v.currentTime = 0; } catch (e) {} tv.played++; if (evs) evs.push('video'); }
    else { cartoon.restart(); if (tv.video && !tv.video.paused) tv.video.pause(); }
    setTex();
  };
  const setupVideo = () => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous'; v.preload = 'auto'; v.playsInline = true; v.setAttribute('playsinline', ''); v.loop = false;
    v.addEventListener('error', () => { tv.vfail = true; tv.vok = false; if (tv.prog === 'video') switchTo('toon'); });
    v.addEventListener('loadeddata', () => {
      if (tv.vok || tv.vfail) return;
      try { const c = document.createElement('canvas'); c.width = c.height = 2; const g = c.getContext('2d'); g.drawImage(v, 0, 0, 2, 2); g.getImageData(0, 0, 1, 1); }
      catch (e) { tv.vfail = true; return; }
      const t = tv.vtex = new THREE.VideoTexture(v);
      t.colorSpace = THREE.SRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
      tv.vok = true;
      if (out.onVideo) out.onVideo(v);
    }, { once: false });
    v.src = v.canPlayType('video/mp4; codecs="avc1.4D401E, mp4a.40.2"') ? VIDEO.mp4 : VIDEO.webm;
    tv.video = v;
    v.load();
  };
  // parked in front of the screen: start the programme from the top (the real cartoon first when it is ready)
  tv.watchStart = () => {
    const evs = [];
    if (tv.vok) { if (tv.prog !== 'video' || tv.video.currentTime > 3) switchTo('video', evs); }
    else { if (cartoon.t > 3) cartoon.restart(); tv.pending = !tv.vfail; }
    return evs;
  };
  const col = new THREE.Color();
  out.update = (dt, t, ctx) => {
    // TV: switch on when someone is near, play the programme
    const near = ctx.camDist(tv.x, tv.z) < 75;
    tv.on = Math.max(0, Math.min(1, tv.on + (near ? dt * 1.2 : -dt * 2)));
    if (near && ctx.playing && !tv.video && !tv.vfail && /^https?:$/.test(location.protocol)) setupVideo();
    tv.sw = Math.max(0, tv.sw - dt);
    screenMat.uniforms.uOn.value = tv.on;
    screenMat.uniforms.uStatic.value = Math.min(1, tv.sw / 0.25);
    let events = [];
    // the real cartoon finished loading just after someone parked: put it on
    if (tv.pending && tv.vok) { tv.pending = false; if (tv.prog === 'toon' && cartoon.t < 6) switchTo('video', events); }
    if (tv.prog === 'toon') {
      events = events.concat(cartoon.update(dt, near && tv.sw <= 0));
      if (events.includes('end') && tv.vok) switchTo('video', events);
    } else {
      const v = tv.video;
      if (!tv.vok) switchTo('toon');
      else if (near && tv.sw <= 0.15) { if (v.paused && !v.ended) playVideo(); }
      else if (!v.paused) v.pause();
      if (tv.vok && (v.ended || (v.duration && v.currentTime >= v.duration - 0.08))) switchTo('toon');
    }
    tvLight.intensity = ctx.night * 30 * tv.on;
    // UFO: arrives from the sky, beams the jeep up and down again, leaves
    const u = out.ufo;
    let beamOn = 0;
    if (u.t >= 0) {
      u.t += dt;
      const T = u.t, base = u.gy + UFO.h;
      let y = base + Math.sin(t * 2.1) * 0.15;
      if (T < 1.3) { const k = 1 - Math.pow(1 - T / 1.3, 3); y = base + (1 - k) * 28; }
      else if (T > 6.3) { const k = (T - 6.3) / 1.3; y = base + k * k * 42; }
      u.g.position.y = y;
      u.g.scale.setScalar(T > 6.3 ? Math.max(0.05, 1 - (T - 6.3) / 1.3 * 0.6) : 1);
      u.g.rotation.y += dt * (T > 1.0 && T < 6.3 ? 3.2 : 1.2);
      for (let i = 0; i < 16; i++) { col.setHSL(((i / 16) + t * 0.6) % 1, 1, 0.6).multiplyScalar(2.6); u.lights.setColorAt(i, col); }
      u.lights.instanceColor.needsUpdate = true;
      beamOn = T > 1.05 && T < 6.2 ? 1 : 0;
      if (T > 7.6) u.t = -1;
    }
    u.g.visible = u.t >= 0;
    const bw = u.beamMat.uniforms.uBeam;
    bw.value += (beamOn - bw.value) * Math.min(1, dt * 5);
    // at night the circles glow faintly: something is expected here
    const sk = ctx.night * (0.2 + 0.12 * Math.sin(t * 1.3)) + bw.value * 0.9;
    u.spotMat.uniforms.uK.value = sk;
    u.spot.visible = sk > 0.01;
    return events;
  };
  return out;
}

import * as THREE from 'three';
import { U, NOISE_GLSL } from './materials.js';
import { Builder, mesh, T } from './builder.js';
import { M } from './materials.js';
import { fbm, lin, rand, rr, TAU, vnoise } from './util.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const CLOUD_Y = -64;

// tileable fbm noise texture for clouds
function noiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const P = 8; // lattice period
  const hash = (x, y, s) => { x = ((x % s) + s) % s; y = ((y % s) + s) % s; let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + s * 97; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const noise = (x, y, s) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0, amp = 0.5, n = 0, per = P;
    for (let o = 0; o < 5; o++) { s += amp * noise(x / size * per, y / size * per, per); n += amp; amp *= 0.5; per *= 2; }
    const v = s / n;
    // second channel: shifted worley-ish blobs for puffiness
    let s2 = 0; amp = 0.5; n = 0; per = 4;
    for (let o = 0; o < 4; o++) { s2 += amp * noise(x / size * per + 31, y / size * per + 17, per); n += amp; amp *= 0.5; per *= 2; }
    const i = (y * size + x) * 4;
    data[i] = v * 255; data[i + 1] = (s2 / n) * 255; data[i + 2] = 0; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

function nebulaTexture(w, h) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const el = (y / (h - 1) - 0.5) * Math.PI;
    for (let x = 0; x < w; x++) {
      const a = x / w * TAU;
      const cx = Math.cos(a), cz = Math.sin(a);
      const n1 = fbm(cx * 1.9 + el * 0.8 + 3, cz * 1.9 + el * 2.6, 4);
      const n2 = fbm(cx * 3.1 - 7 + el * 1.3, cz * 3.1 + el * 3.4 + 2, 3);
      const i = (y * w + x) * 4;
      data[i] = Math.max(0, Math.min(1, (n1 - 0.05) * 2.2)) * 255;
      data[i + 1] = Math.max(0, Math.min(1, (n2 - 0.15) * 2.4)) * 255;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

export const SKY_U = {
  top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() },
  sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, stars: { value: 0.5 },
  cLow: { value: new THREE.Color() }, cHigh: { value: new THREE.Color() }, cSun: { value: new THREE.Color() }, cFar: { value: new THREE.Color() }
};

export function buildSky(scene, opts = {}) {
  const group = new THREE.Group();
  // ---- dome: gradient + baked nebula ----
  const neb = nebulaTexture(512, 256);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1400, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uNeb: { value: neb }, ...SKY_U },
    vertexShader: /* glsl */`varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 top, mid, hor, bot, sunCol, sunDir; uniform float stars; uniform sampler2D uNeb; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        float y = d.y;
        vec3 c = y > 0.0 ? mix(mix(hor, mid, smoothstep(0.0, 0.28, y)), top, smoothstep(0.25, 0.95, y)) : mix(hor, bot, smoothstep(0.0, -0.35, y));
        vec2 uv = vec2(atan(d.z, d.x) * 0.15915 + 0.5, asin(clamp(y, -1.0, 1.0)) * 0.3183 + 0.5);
        vec4 n = texture2D(uNeb, uv);
        float band = smoothstep(-0.15, 0.35, y) * (1.0 - smoothstep(0.75, 1.0, y));
        c += (vec3(0.6, 0.17, 0.46) * n.r + vec3(0.2, 0.24, 0.62) * n.g) * band * 0.22 * stars;
        float sd = max(dot(d, sunDir), 0.0);
        c += sunCol * (pow(sd, 6.0) * 0.35 + pow(sd, 60.0) * 0.6 + smoothstep(0.9993, 0.9997, sd) * 4.0);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  dome.frustumCulled = false; dome.renderOrder = -10;
  group.add(dome);
  // ---- stars ----
  const SN = 2200, sp = new Float32Array(SN * 3), ss = new Float32Array(SN), sph = new Float32Array(SN);
  for (let i = 0; i < SN; i++) {
    const u = rand() * 2 - 1, a = rand() * TAU, r = Math.sqrt(1 - u * u);
    sp[i * 3] = Math.cos(a) * r * 1300; sp[i * 3 + 1] = u * 1300; sp[i * 3 + 2] = Math.sin(a) * r * 1300;
    ss[i] = Math.pow(rand(), 3) * 3.2 + 1.1; sph[i] = rand() * TAU;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sg.setAttribute('aSize', new THREE.Float32BufferAttribute(ss, 1));
  sg.setAttribute('aPh', new THREE.Float32BufferAttribute(sph, 1));
  const starPts = new THREE.Points(sg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.time, stars: SKY_U.stars, uPR: { value: 1 } },
    vertexShader: /* glsl */`attribute float aSize, aPh; uniform float uTime, stars, uPR; varying float vA;
      void main(){ vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww;
        float tw = 0.65 + 0.35 * sin(uTime * (0.8 + fract(aPh * 7.3) * 2.5) + aPh);
        vA = stars * tw * smoothstep(-0.25, 0.1, position.y / 1300.0); gl_PointSize = aSize * uPR; }`,
    fragmentShader: /* glsl */`varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(1.0, 0.95, 0.88) * a * vA, 1.0); }`
  }));
  starPts.frustumCulled = false; starPts.renderOrder = -9;
  group.add(starPts);

  // ---- cloud sea: soft lit puffs + a deep base layer ----
  const clouds = new THREE.Group();
  const puffN = opts.clouds || 420;
  const smoothIco = d => { let g = new THREE.IcosahedronGeometry(1, d); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g); g.computeVertexNormals(); return g; };
  const puffG = smoothIco(2), puffFar = smoothIco(1);
  const puffM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: 0.25 });
  const puffs = new THREE.InstancedMesh(puffG, puffM, puffN), far = new THREE.InstancedMesh(puffFar, puffM, puffN);
  let nf = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), cc = new THREE.Color();
  const tints = [0xFFFFFF, 0xFFF1F4, 0xF6EEFF, 0xFFF6EC];
  let n = 0;
  while (n < puffN) {
    const u = rand();
    const r = 18 + 900 * Math.pow(u, 2.1), a = rand() * TAU;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const S = 13 + r * 0.045 + rand() * 8;
    const k = 3 + Math.floor(rand() * 3);
    for (let j = 0; j < k && n < puffN; j++, n++) {
      const ox = (rand() - 0.5) * S * 1.6, oz = (rand() - 0.5) * S * 1.6;
      const s = S * (0.55 + rand() * 0.5);
      pv.set(cx + ox, CLOUD_Y + (rand() - 0.3) * S * 0.35, cz + oz);
      q.setFromAxisAngle(sv.set(0, 1, 0), rand() * TAU);
      sv.set(s, s * (0.5 + rand() * 0.18), s * (0.85 + rand() * 0.3));
      m4.compose(pv, q, sv); cc.set(tints[n % tints.length]);
      if (r < 260) { puffs.setMatrixAt(n - nf, m4); puffs.setColorAt(n - nf, cc); }
      else { far.setMatrixAt(nf, m4); far.setColorAt(nf, cc); nf++; }
    }
  }
  puffs.count = puffN - nf; far.count = nf;
  puffs.instanceMatrix.needsUpdate = true; far.instanceMatrix.needsUpdate = true;
  puffs.frustumCulled = false; far.frustumCulled = false;
  clouds.add(puffs, far);
  const base = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ color: 0x6E5E9E }));
  base.rotation.x = -Math.PI / 2; base.position.y = CLOUD_Y - 9;
  clouds.add(base);
  clouds.userData.base = base;
  group.add(clouds);

  // ---- ringed planet ----
  const planet = new THREE.Mesh(new THREE.SphereGeometry(150, 64, 32), new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, ...SKY_U },
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 sunDir, sunCol, hor; varying vec3 vN; varying vec3 vP;
      ${NOISE_GLSL}
      void main(){
        float lat = vP.y / 150.0;
        float b = sin(lat * 18.0 + fbm2(vec2(atan(vP.z, vP.x) * 2.0, lat * 6.0)) * 2.5);
        vec3 c = mix(vec3(0.95, 0.55, 0.62), vec3(0.55, 0.42, 0.85), 0.5 + 0.5 * b);
        c = mix(c, vec3(1.0, 0.82, 0.62), smoothstep(0.6, 1.0, b) * 0.4);
        vec3 L = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
        float d = max(dot(vN, L), 0.0);
        float rim = pow(1.0 - max(vN.z, 0.0), 3.0);
        c = c * (0.18 + 0.95 * d) + hor * rim * 0.6;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  const ringG = new THREE.RingGeometry(190, 330, 128, 1);
  const rp = ringG.attributes.position, ruv = ringG.attributes.uv;
  for (let i = 0; i < rp.count; i++) { const r = Math.hypot(rp.getX(i), rp.getY(i)); ruv.setXY(i, (r - 190) / 140, 0); }
  const ring = new THREE.Mesh(ringG, new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
    uniforms: { ...SKY_U },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 sunCol; varying vec2 vUv;
      void main(){ float t = vUv.x; float b = 0.5 + 0.5 * sin(t * 60.0) * sin(t * 13.0 + 1.0);
        float a = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.85, 1.0, t)) * (0.35 + 0.45 * b) * (1.0 - step(0.55, t) * step(t, 0.6) * 0.8);
        vec3 c = mix(vec3(1.0, 0.86, 0.72), vec3(0.85, 0.7, 1.0), t) * (0.5 + 0.5 * sunCol);
        gl_FragColor = vec4(c, a * 0.8);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  const pg = new THREE.Group();
  pg.add(planet, ring);
  ring.rotation.x = -Math.PI / 2 + 0.38; ring.rotation.y = 0.22;
  pg.position.set(-520, 210, -980);
  pg.rotation.z = 0.25;
  group.add(pg);

  // ---- floating islets ----
  const isl = new Builder();
  const rock = [0xB8694F, 0xA9606A, 0x80507A, 0x5A4373].map(h => lin(h));
  const islets = [];
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * TAU + rr(-0.2, 0.2), d = rr(88, 140), y = rr(-26, 2), s = rr(1.6, 4.2);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const g = new THREE.ConeGeometry(s, s * 2.6, 7, 3);
    g.rotateX(Math.PI);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (1 + vnoise(i, k) * 0.25), p.getY(i), p.getZ(i) * (1 + vnoise(k, i) * 0.25));
    const m = T(x, y - s * 1.3, z, 0, rr(0, TAU), 0);
    isl.add(g.toNonIndexed(), m, (wx, wy, wz, lx, ly) => rock[Math.max(0, Math.min(3, Math.floor((s * 1.3 - ly) / (s * 0.75))))]);
    const capG = new THREE.CylinderGeometry(s * 1.02, s * 0.98, 0.5, 7);
    isl.add(capG.toNonIndexed(), T(x, y + 0.0, z, 0, rr(0, TAU), 0), lin(0x62B95D));
    islets.push({ x, y, z, s });
  }
  const isletMesh = mesh(isl.build(), M.solidFlat, { cast: false, receive: false, name: 'islets' });
  group.add(isletMesh);

  scene.add(group);
  return { group, dome, stars: starPts, clouds, planet: pg, islets, isletMesh };
}

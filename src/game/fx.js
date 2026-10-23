// GPU point particles (soft dust, confetti, sparks) and tyre marks.
import * as THREE from 'three';
import { rand } from './util.js';

export class Particles {
  constructor(scene, max = 1800, additive = false) {
    this.max = max; this.n = 0;
    const N = max;
    this.p = new Float32Array(N * 3); this.v = new Float32Array(N * 3);
    this.life = new Float32Array(N); this.age = new Float32Array(N);
    this.s0 = new Float32Array(N); this.s1 = new Float32Array(N);
    this.c = new Float32Array(N * 3); this.a0 = new Float32Array(N);
    this.grav = new Float32Array(N); this.drag = new Float32Array(N); this.shape = new Float32Array(N); this.spin = new Float32Array(N);
    const g = this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(N * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aCol', this.aCol); g.setAttribute('aSize', this.aSize);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 400 } },
      vertexShader: /* glsl */`attribute vec4 aCol; attribute vec2 aSize; uniform float uScale; varying vec4 vCol; varying float vShape;
        void main(){ vCol = aCol; vShape = aSize.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize.x * uScale / max(0.1, -mv.z); }`,
      fragmentShader: /* glsl */`varying vec4 vCol; varying float vShape;
        void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q);
          float a = vShape < 0.5 ? smoothstep(0.5, 0.05, d) : (vShape < 1.5 ? step(max(abs(q.x), abs(q.y) * 1.6), 0.5) : step(d, 0.5));
          if (a < 0.01) discard;
          gl_FragColor = vec4(vCol.rgb, vCol.a * a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
    scene.add(this.points);
  }
  // shape: 0 soft, 1 confetti rectangle, 2 hard dot
  emit(x, y, z, vx, vy, vz, life, s0, s1, col, o = {}) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.age[i] = 0; this.s0[i] = s0; this.s1[i] = s1;
    this.c[i * 3] = col[0]; this.c[i * 3 + 1] = col[1]; this.c[i * 3 + 2] = col[2];
    this.a0[i] = o.alpha ?? 1; this.grav[i] = o.grav ?? 0; this.drag[i] = o.drag ?? 0.5; this.shape[i] = o.shape ?? 0;
  }
  burst(x, y, z, n, speed, up, life, s0, s1, cols, o = {}) {
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2, r = speed * (0.35 + rand() * 0.65);
      const col = Array.isArray(cols[0]) ? cols[Math.floor(rand() * cols.length)] : cols;
      this.emit(x + (rand() - 0.5) * (o.spread || 0), y, z + (rand() - 0.5) * (o.spread || 0), Math.cos(a) * r, up * (0.5 + rand() * 0.8), Math.sin(a) * r, life * (0.6 + rand() * 0.6), s0, s1, col, o);
    }
  }
  update(dt) {
    let j = 0;
    const P = this.aPos.array, Cc = this.aCol.array, Sz = this.aSize.array;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) continue;
      // compact into slot j
      if (j !== i) {
        for (let k = 0; k < 3; k++) { this.p[j * 3 + k] = this.p[i * 3 + k]; this.v[j * 3 + k] = this.v[i * 3 + k]; this.c[j * 3 + k] = this.c[i * 3 + k]; }
        this.life[j] = this.life[i]; this.age[j] = this.age[i]; this.s0[j] = this.s0[i]; this.s1[j] = this.s1[i];
        this.a0[j] = this.a0[i]; this.grav[j] = this.grav[i]; this.drag[j] = this.drag[i]; this.shape[j] = this.shape[i];
      }
      const d = Math.exp(-this.drag[j] * dt);
      this.v[j * 3] *= d; this.v[j * 3 + 1] = this.v[j * 3 + 1] * d - this.grav[j] * dt; this.v[j * 3 + 2] *= d;
      this.p[j * 3] += this.v[j * 3] * dt; this.p[j * 3 + 1] += this.v[j * 3 + 1] * dt; this.p[j * 3 + 2] += this.v[j * 3 + 2] * dt;
      const t = this.age[j] / this.life[j];
      P[j * 3] = this.p[j * 3]; P[j * 3 + 1] = this.p[j * 3 + 1]; P[j * 3 + 2] = this.p[j * 3 + 2];
      const fade = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
      Cc[j * 4] = this.c[j * 3]; Cc[j * 4 + 1] = this.c[j * 3 + 1]; Cc[j * 4 + 2] = this.c[j * 3 + 2]; Cc[j * 4 + 3] = this.a0[j] * Math.max(0, fade);
      Sz[j * 2] = this.s0[j] + (this.s1[j] - this.s0[j]) * t; Sz[j * 2 + 1] = this.shape[j];
      j++;
    }
    this.n = j;
    this.geo.setDrawRange(0, j);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
  clear() { this.n = 0; }
}

// tyre marks: ring buffer of quads that fade out
export class Skids {
  constructor(scene, max = 360, opts = {}) {
    this.max = max; this.i = 0; this.t = 0; this.life = opts.life || 9; this.hw = opts.width || 0.16; this.minSeg = opts.minSeg || 0.05;
    const col = opts.color || [0.16, 0.13, 0.15];
    this.uCol = { value: new THREE.Vector4(col[0], col[1], col[2], opts.alpha ?? 0.42) };
    const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 4 * 3); this.alpha = new Float32Array(max * 4); this.born = new Float32Array(max).fill(-100);
    const idx = [];
    for (let q = 0; q < max; q++) { const b = q * 4; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    g.setIndex(idx);
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aA = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aA', this.aA);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, uniforms: { uCol: this.uCol },
      vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec4 uCol; varying float vA; void main(){ gl_FragColor = vec4(uCol.rgb, vA * uCol.a); }'
    });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.last = [null, null, null, null];
  }
  // add a segment for wheel w from its previous point to (x, y, z)
  add(w, x, y, z) {
    const prev = this.last[w];
    if (!prev) { this.last[w] = [x, y, z]; return; }
    const dx = x - prev[0], dz = z - prev[2], L = Math.hypot(dx, dz);
    if (L < this.minSeg) return; // wait until the wheel has rolled far enough
    this.last[w] = [x, y, z];
    if (L > Math.max(2, this.minSeg * 3)) return;
    const nx = -dz / L * this.hw, nz = dx / L * this.hw;
    const q = this.i++ % this.max, b = q * 12;
    const P = this.pos;
    P[b] = prev[0] + nx; P[b + 1] = prev[1] + 0.035; P[b + 2] = prev[2] + nz;
    P[b + 3] = prev[0] - nx; P[b + 4] = prev[1] + 0.035; P[b + 5] = prev[2] - nz;
    P[b + 6] = x + nx; P[b + 7] = y + 0.035; P[b + 8] = z + nz;
    P[b + 9] = x - nx; P[b + 10] = y + 0.035; P[b + 11] = z - nz;
    this.born[q] = this.t;
    this.aPos.needsUpdate = true;
  }
  lift(w) { this.last[w] = null; }
  update(dt) {
    this.t += dt;
    for (let q = 0; q < this.max; q++) {
      const a = Math.max(0, 1 - (this.t - this.born[q]) / this.life);
      this.alpha[q * 4] = this.alpha[q * 4 + 1] = this.alpha[q * 4 + 2] = this.alpha[q * 4 + 3] = a;
    }
    this.aA.needsUpdate = true;
  }
}

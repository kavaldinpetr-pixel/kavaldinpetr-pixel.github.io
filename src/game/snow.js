// Winter snowfall: a box of flakes that follows the camera's view and wraps around it (one draw call).
import * as THREE from 'three';
import { U } from './materials.js';

export function buildSnowfall(scene, { n = 2200, w = 56, h = 24 } = {}) {
  const pos = new Float32Array(n * 3), rnd = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = Math.random() * w; pos[i * 3 + 1] = Math.random() * h; pos[i * 3 + 2] = Math.random() * w; rnd[i] = Math.random(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aR', new THREE.BufferAttribute(rnd, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const uni = { uTime: U.time, uCenter: { value: new THREE.Vector3() }, uW: { value: w }, uH: { value: h }, uScale: { value: 400 }, uCol: { value: new THREE.Color(0.95, 0.97, 1.0) } };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: uni,
    vertexShader: /* glsl */`
      attribute float aR; uniform float uTime, uW, uH, uScale; uniform vec3 uCenter; varying float vA;
      void main(){
        vec3 p = position;
        float t = uTime;
        p.y -= t * (0.85 + aR * 0.9);
        p.x += sin(t * (0.5 + aR) + aR * 20.0) * 0.7 + t * 0.4;
        p.z += cos(t * (0.4 + aR * 0.8) + aR * 13.0) * 0.6;
        vec2 rel = mod(p.xz - uCenter.xz + uW * 0.5, uW) - uW * 0.5;
        float y = mod(p.y - (uCenter.y - 3.0), uH) + uCenter.y - 3.0;
        vec4 mv = viewMatrix * vec4(uCenter.x + rel.x, y, uCenter.z + rel.y, 1.0);
        gl_Position = projectionMatrix * mv;
        float edge = 1.0 - smoothstep(uW * 0.36, uW * 0.5, max(abs(rel.x), abs(rel.y)));
        vA = edge * (0.5 + 0.5 * aR) * smoothstep(0.0, 1.5, y - uCenter.y + 3.0);
        vA *= smoothstep(4.0, 9.0, -mv.z);
        gl_PointSize = min(uScale * (0.06 + aR * 0.07) / max(-mv.z, 0.5), 22.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.12, d) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uCol, a);
      }`
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false; pts.renderOrder = 3; pts.name = 'snowfall';
  scene.add(pts);
  // night: moonlit blue flakes (grey ones read as yellow against the blue sky)
  return { pts, uni, update(cx, cy, cz, night) { uni.uCenter.value.set(cx, cy, cz); uni.uCol.value.setRGB(0.95 - 0.55 * night, 0.97 - 0.5 * night, 1.0 - 0.18 * night); } };
}

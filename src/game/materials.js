import * as THREE from 'three';

// Shared uniforms (time, wind, car position, tree wobble slots)
export const U = {
  time: { value: 0 },
  car: { value: new THREE.Vector3(0, -100, 0) },
  wob: { value: [new THREE.Vector4(-1, 0, 0, 0), new THREE.Vector4(-1, 0, 0, 0), new THREE.Vector4(-1, 0, 0, 0), new THREE.Vector4(-1, 0, 0, 0)] },
  night: { value: 0 },
  lamps: { value: 0.5 }
};

export const NOISE_GLSL = /* glsl */`
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm2(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }
`;

export function standard(opts = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.82, metalness: 0, envMapIntensity: 0.55 }, opts));
}

export const M = {};
export function initMaterials() {
  M.ground = standard({ vertexColors: true, roughness: 0.95, envMapIntensity: 0.35 });
  M.cliff = standard({ vertexColors: true, roughness: 0.9, flatShading: true, envMapIntensity: 0.3 });
  M.road = standard({ vertexColors: true, roughness: 0.9, envMapIntensity: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.solid = standard({ vertexColors: true, roughness: 0.7 });          // most static props (merged)
  M.solidFlat = standard({ vertexColors: true, roughness: 0.78, flatShading: true });
  M.glossy = standard({ vertexColors: true, roughness: 0.35, envMapIntensity: 0.9 });
  M.foliage = windMaterial(standard({ vertexColors: true, roughness: 0.85, envMapIntensity: 0.4 }));
  M.glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  M.glowNight = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: false });
  M.inst = standard({ roughness: 0.6 });                                 // instanced dynamic props (instanceColor)
  M.instGlossy = standard({ roughness: 0.4, envMapIntensity: 0.9 });
  return M;
}

// wind sway + hit wobble for merged foliage. needs attributes aSway (0..1) and aTree (id)
export function windMaterial(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time;
    sh.uniforms.uWob = U.wob;
    sh.vertexShader = 'attribute float aSway;\nattribute float aTree;\nuniform float uTime;\nuniform vec4 uWob[4];\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        float ph = transformed.x * 0.23 + transformed.z * 0.19;
        float sw = aSway;
        transformed.x += (sin(uTime * 1.6 + ph) * 0.07 + sin(uTime * 3.7 + ph * 2.1) * 0.02) * sw;
        transformed.z += cos(uTime * 1.25 + ph * 1.3) * 0.05 * sw;
        for (int i = 0; i < 4; i++) {
          if (abs(uWob[i].x - aTree) < 0.5) { transformed.x += uWob[i].z * sw; transformed.z += uWob[i].w * sw; transformed.y -= uWob[i].y * sw; }
        }
      }`);
  };
  mat.customProgramCacheKey = () => 'wind';
  return mat;
}

// instanced grass: wind + bending away from the car (mesh must have identity transform)
export function grassMaterial() {
  const mat = standard({ vertexColors: true, roughness: 0.9, envMapIntensity: 0.25, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time;
    sh.uniforms.uCar = U.car;
    sh.vertexShader = 'attribute float aTip;\nuniform float uTime;\nuniform vec3 uCar;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      {
        vec3 wp = mvPosition.xyz;
        vec2 aw = wp.xz - uCar.xz;
        float dd = length(aw);
        float push = (1.0 - smoothstep(0.5, 2.0, dd)) * aTip * step(abs(wp.y - uCar.y), 2.5);
        mvPosition.xz += aw / max(dd, 0.001) * push * 0.42;
        mvPosition.y -= push * 0.22;
        float ph = wp.x * 0.35 + wp.z * 0.27;
        mvPosition.x += (sin(uTime * 2.1 + ph) * 0.07 + sin(uTime * 4.3 + ph * 1.7) * 0.025) * aTip;
        mvPosition.z += cos(uTime * 1.7 + ph * 1.2) * 0.05 * aTip;
      }
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  const fs = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = sh => { prev(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', fs); };
  mat.customProgramCacheKey = () => 'grass';
  return mat;
}

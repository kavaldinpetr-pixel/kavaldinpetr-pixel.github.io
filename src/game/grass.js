// Dense grass: one camera-facing triangle per blade, laid out on a grid that wraps around
// the camera focus, so only the visible patch of the island is ever drawn.
import * as THREE from 'three';
import { NOISE_GLSL, U } from './materials.js';
import { stylize, SU } from './style.js';
import { rng } from './util.js';
import { WINTER } from './season.js';

export function buildGrass(scene, { n = 260, size = 56 } = {}) {
  const r = rng(77);
  const count = n * n, cell = size / n;
  const blade = new Float32Array(count * 3 * 3);
  const shape = new Float32Array(count * 3 * 2);
  const SH = [0, 1, 1, 0, -1, 0];
  let k = 0, q = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = (i / n - 0.5) * size + cell * 0.5 + (r() - 0.5) * cell;
    const z = (j / n - 0.5) * size + cell * 0.5 + (r() - 0.5) * cell;
    const rnd = r();
    for (let v = 0; v < 3; v++) {
      blade[k++] = x; blade[k++] = z; blade[k++] = rnd;
      shape[q++] = SH[v * 2]; shape[q++] = SH[v * 2 + 1];
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 9), 3));
  g.setAttribute('aBlade', new THREE.BufferAttribute(blade, 3));
  g.setAttribute('aShape', new THREE.BufferAttribute(shape, 2));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

  const uni = {
    uCenter: { value: new THREE.Vector2() }, uSize: { value: size },
    uBladeW: { value: 0.1 }, uBladeH: { value: 0.62 },
    uTime: U.time, uCar: U.car, uWinter: { value: WINTER ? 1 : 0 }
  };
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni, { uTerH: SU.uTerH, uTerC: SU.uTerC, uTerBox: SU.uTerBox });
    sh.vertexShader = /* glsl */`
      attribute vec3 aBlade; attribute vec2 aShape;
      uniform vec2 uCenter; uniform float uSize, uBladeW, uBladeH, uTime, uWinter; uniform vec3 uCar;
      uniform sampler2D uTerH; uniform sampler2D uTerC; uniform vec4 uTerBox;
      varying vec3 vGrassCol; varying float vGrassShade;
      ${NOISE_GLSL}
    ` + sh.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', /* glsl */`
        vec2 lp = aBlade.xy - uCenter;
        float hs = uSize * 0.5;
        lp = mod(lp + hs, uSize) - hs;
        vec2 wp = lp + uCenter;
        vec2 tuv = (wp - uTerBox.xy) * uTerBox.w;
        vec4 tc = texture(uTerC, tuv);
        float gh = texture(uTerH, tuv).r;
        float amt = tc.a;
        float edgeFade = 1.0 - smoothstep(hs * 0.82, hs, max(abs(lp.x), abs(lp.y)));
        float nh = vn(wp * 0.31) * 0.75 + vn(wp * 1.7 + 3.0) * 0.35;
        float height = uBladeH * (0.42 + 0.58 * aBlade.z) * (0.5 + nh) * amt * edgeFade * (1.0 - 0.42 * uWinter);
        float width = uBladeW * (0.7 + 0.3 * amt);
        vec3 transformed = vec3(wp.x, gh - 0.03, wp.y);
        vec2 toCam = normalize(cameraPosition.xz - wp + 1e-4);
        vec2 side = vec2(-toCam.y, toCam.x);
        transformed.xz += side * aShape.x * width;
        transformed.y += aShape.y * height;
        // wind: slow gusts rolling across the island + flutter
        float gust = vn(wp * 0.07 + vec2(uTime * 0.23, uTime * 0.11));
        vec2 wind = vec2(0.75, 0.45) * (gust * 0.9 - 0.25) + vec2(sin(uTime * 2.3 + wp.x * 0.6 + wp.y * 0.4), cos(uTime * 1.9 + wp.y * 0.7)) * 0.12;
        transformed.xz += wind * aShape.y * height * 0.75;
        // bend away from the car
        vec2 aw = wp - uCar.xz; float dd = length(aw);
        float push = (1.0 - smoothstep(0.5, 2.3, dd)) * aShape.y * step(abs(gh - uCar.y), 2.5);
        transformed.xz += aw / max(dd, 0.001) * push * height * 1.1;
        transformed.y -= push * height * 0.55;
        if (height < 0.02) transformed = vec3(wp.x, gh - 2.0, wp.y);
        vGrassCol = tc.rgb * (0.88 + 0.24 * aBlade.z);
        vGrassCol = mix(vGrassCol, vec3(0.80, 0.85, 0.95), uWinter * (0.4 + 0.55 * aShape.y)); // frosted tufts poking out of the snow
        vGrassShade = (1.0 - aShape.y) * 0.85;
      `);
    sh.fragmentShader = sh.fragmentShader.replace('normal *= faceDirection;', '');
  };
  mat.customProgramCacheKey = () => 'grassBlades';
  stylize(mat, {
    key: 'grass', bounce: false, snow: 0,
    fragPars: 'varying vec3 vGrassCol; varying float vGrassShade;\n',
    fragColor: 'diffuseColor.rgb *= vGrassCol;\n',
    extra: 'vGrassShade'
  });
  // normal_fragment_begin flips back faces; blades must stay lit from above
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, rr) => { prev(sh, rr); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '')); };
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'grassBlades';
  mesh.visible = !WINTER; // under the snow in winter
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);
  return {
    mesh, uni,
    update(cx, cz) { uni.uCenter.value.set(cx, cz); }
  };
}

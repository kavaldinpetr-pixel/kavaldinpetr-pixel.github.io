// Leafy crowns: every cluster is a cloud of camera-facing cards cut out by a leaf mask,
// shaded two-tone by the sun side and thinned out where they would hide the car.
import * as THREE from 'three';
import { U } from './materials.js';
import { stylize, SU } from './style.js';
import { rng, TAU } from './util.js';

// leaf mask: soft "distance" field of ~11 pointed leaves, so the alpha threshold sizes them
function leafTexture(N = 128) {
  const r = rng(5);
  const leaves = [];
  for (let i = 0; i < 30; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 0.36;
    const cx = 0.5 + Math.cos(a) * d, cy = 0.5 + Math.sin(a) * d;
    const ang = a + (r() - 0.5) * 1.8;
    const len = 0.06 + r() * 0.045, wid = len * (0.45 + r() * 0.12);
    leaves.push([cx, cy, Math.cos(ang), Math.sin(ang), len, wid]);
  }
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const px = (i + 0.5) / N, py = (j + 0.5) / N;
    let v = 0;
    for (const [cx, cy, ca, sa, len, wid] of leaves) {
      const dx = px - cx, dy = py - cy;
      const u = dx * ca + dy * sa, w = -dx * sa + dy * ca;
      const t = u / len;
      const taper = Math.max(0.05, 1 - t * t * 0.55);
      const dist = Math.sqrt(t * t + (w / (wid * taper)) * (w / (wid * taper)));
      v = Math.max(v, 1 - dist);
    }
    const k = (j * N + i) * 4;
    data[k] = data[k + 1] = data[k + 2] = 255;
    data[k + 3] = Math.round(Math.max(0, Math.min(1, v)) * 255);
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function clusterGeometry(K, seed) {
  const r = rng(seed);
  const pos = [], center = [], corner = [], uv = [], idx = [], cid = [];
  for (let k = 0; k < K; k++) {
    // mostly near the surface of the unit sphere, flattened a little at the bottom
    const u = r() * 2 - 1, th = r() * TAU, rad = 1 - Math.pow(r(), 3);
    const s = Math.sqrt(1 - u * u);
    const c = [Math.cos(th) * s * rad, u * rad * (u < 0 ? 0.75 : 1), Math.sin(th) * s * rad];
    const rot = r() * TAU, size = 0.78 + r() * 0.22;
    const ca = Math.cos(rot) * size * 0.5, sa = Math.sin(rot) * size * 0.5;
    const base = k * 4;
    for (const [qx, qy, tu, tv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      pos.push(0, 0, 0);
      center.push(c[0], c[1], c[2]);
      corner.push(qx * ca - qy * sa, qx * sa + qy * ca);
      uv.push(tu, tv);
      cid.push(k / K);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCenter', new THREE.Float32BufferAttribute(center, 3));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aCard', new THREE.Float32BufferAttribute(cid, 1));
  g.setIndex(idx);
  return g;
}

const VERT_PARS = /* glsl */`
attribute vec3 aCenter; attribute vec2 aCorner;
attribute vec4 iPos; attribute vec3 iColA; attribute vec3 iColB; attribute vec2 iInfo;
uniform float uTime; uniform vec4 uWob[4]; uniform vec3 uSunW;
varying vec3 vFolCol;
`;
const VERT_POS = /* glsl */`
  float iScale = iPos.w;
  vec3 fc = iPos.xyz + aCenter * iScale;
  float ph = iPos.x * 0.21 + iPos.z * 0.17 + iInfo.y * 6.0;
  float hgt = clamp(aCenter.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 sway = vec3(sin(uTime * 1.3 + ph) * 0.07 + sin(uTime * 2.9 + ph * 1.7) * 0.03, 0.0, cos(uTime * 1.1 + ph * 1.3) * 0.06) * (0.4 + hgt * 0.8) * min(iScale, 2.0);
  for (int i = 0; i < 4; i++) {
    if (abs(uWob[i].x - iInfo.x) < 0.5) { sway.x += uWob[i].z * 1.5 * (0.5 + hgt); sway.z += uWob[i].w * 1.5 * (0.5 + hgt); sway.y -= uWob[i].y; }
  }
  fc += sway;
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 transformed = fc + (camR * aCorner.x + camU * aCorner.y) * iScale;
`;

export function buildFoliage(scene, clusters, { K = 80, cell = 32 } = {}) {
  const tex = leafTexture();
  const base = clusterGeometry(K, 11);
  const uni = { uTime: U.time, uWob: U.wob, uSunW: SU.uSunW, uLeaf: { value: tex }, uTh: { value: 0.3 } };

  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = VERT_PARS + sh.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(aCenter * 1.0 + vec3(0.0, 0.35, 0.0) + vec3(aCorner * 0.25, 0.0));')
      .replace('#include <begin_vertex>', VERT_POS + /* glsl */`
        float tone = smoothstep(-0.35, 0.85, dot(normalize(aCenter + vec3(0.0, 0.3, 0.0)), uSunW));
        vFolCol = mix(iColA, iColB, tone);
      `)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvLeafUv = uv;')
      .replace('#include <shadowmap_vertex>', '#if defined( USE_SHADOWMAP )\nworldPosition.xyz += uSunW * 0.9;\n#endif\n#include <shadowmap_vertex>');
    sh.vertexShader = 'varying vec2 vLeafUv;\n' + sh.vertexShader;
    sh.fragmentShader = sh.fragmentShader.replace('normal *= faceDirection;', '');
  };
  mat.customProgramCacheKey = () => 'foliage';
  stylize(mat, {
    key: 'fol', bounce: false,
    fragPars: 'varying vec3 vFolCol; varying vec2 vLeafUv; uniform sampler2D uLeaf; uniform float uTh;\n',
    fragStart: /* glsl */`
      {
        float sdf = texture2D(uLeaf, vLeafUv).a;
        float fade = 1.0;
        if (vViewPosition.z < uCarScr.z - 0.6) {
          float rr = length(gl_FragCoord.xy - uCarScr.xy) / (uCarScr.w * 1.9);
          fade = smoothstep(0.3, 1.0, rr);
        }
        float a = sdf * (fade * (1.0 - uTh) + uTh) - uTh;
        if (a < 0.0) discard;
      }
    `,
    fragColor: 'diffuseColor.rgb = vFolCol;\n'
  });
  {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    };
  }

  // shadow caster: same billboards (they face the light in the shadow pass), cut by the mask
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.38 });
  depth.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni);
    // half of the cards are enough for a convincing crown shadow
    sh.vertexShader = 'attribute float aCard;\n' + VERT_PARS + sh.vertexShader.replace('#include <begin_vertex>', VERT_POS + `
      if (aCard > 0.55) transformed = iPos.xyz;
      else transformed = fc + (camR * aCorner.x + camU * aCorner.y) * iScale * 1.18;
    `);
  };
  depth.customProgramCacheKey = () => 'foliageDepth';

  // chunk clusters spatially so whole groups can be culled
  const groups = new Map();
  for (const c of clusters) {
    const key = Math.floor(c.x / cell) + ',' + Math.floor(c.z / cell);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const meshes = [];
  for (const list of groups.values()) {
    const g = new THREE.InstancedBufferGeometry();
    for (const name of ['position', 'aCenter', 'aCorner', 'uv', 'aCard']) g.setAttribute(name, base.getAttribute(name));
    g.setIndex(base.getIndex());
    const n = list.length;
    const iPos = new Float32Array(n * 4), iA = new Float32Array(n * 3), iB = new Float32Array(n * 3), iInfo = new Float32Array(n * 2);
    let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
    list.forEach((c, i) => {
      iPos.set([c.x, c.y, c.z, c.r], i * 4);
      iA.set(c.a, i * 3); iB.set(c.b, i * 3);
      iInfo.set([c.tree ?? -1, c.seed ?? Math.random()], i * 2);
      minX = Math.min(minX, c.x - c.r * 1.6); maxX = Math.max(maxX, c.x + c.r * 1.6);
      minY = Math.min(minY, c.y - c.r * 1.6); maxY = Math.max(maxY, c.y + c.r * 1.6);
      minZ = Math.min(minZ, c.z - c.r * 1.6); maxZ = Math.max(maxZ, c.z + c.r * 1.6);
    });
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 4));
    g.setAttribute('iColA', new THREE.InstancedBufferAttribute(iA, 3));
    g.setAttribute('iColB', new THREE.InstancedBufferAttribute(iB, 3));
    g.setAttribute('iInfo', new THREE.InstancedBufferAttribute(iInfo, 2));
    g.instanceCount = n;
    g.boundingBox = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    const m = new THREE.Mesh(g, mat);
    m.customDepthMaterial = depth;
    m.castShadow = true; m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.name = 'foliage';
    scene.add(m);
    meshes.push(m);
  }
  return { meshes, mat, depth, tex };
}

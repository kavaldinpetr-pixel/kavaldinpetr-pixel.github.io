// Terrain data textures sampled by the grass, foliage bounce light and props:
//   H: ground height (half float), C: ground colour (sRGB) + grass amount in alpha.
import * as THREE from 'three';
import { grassAt, heightAt } from './layout.js';
import { groundColor } from './terrain.js';
import { SU } from './style.js';

export const TBOX = { min: -96, size: 192, res: 384 };

export function buildTerrainData() {
  const N = TBOX.res, step = TBOX.size / N;
  const hData = new Uint16Array(N * N);
  const cData = new Uint8Array(N * N * 4);
  const toS = v => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  for (let j = 0; j < N; j++) {
    const z = TBOX.min + (j + 0.5) * step;
    for (let i = 0; i < N; i++) {
      const x = TBOX.min + (i + 0.5) * step;
      const h = heightAt(x, z), k = j * N + i;
      hData[k] = THREE.DataUtils.toHalfFloat(Math.max(h, -60));
      const g = h < -5 ? 0 : grassAt(x, z);
      const c = h < -5 ? [0, 0, 0] : groundColor(x, z, h);
      cData[k * 4] = toS(c[0]); cData[k * 4 + 1] = toS(c[1]); cData[k * 4 + 2] = toS(c[2]);
      cData[k * 4 + 3] = Math.round(g * 255);
    }
  }
  const hTex = new THREE.DataTexture(hData, N, N, THREE.RedFormat, THREE.HalfFloatType);
  hTex.magFilter = hTex.minFilter = THREE.LinearFilter;
  hTex.wrapS = hTex.wrapT = THREE.ClampToEdgeWrapping;
  hTex.needsUpdate = true;
  const cTex = new THREE.DataTexture(cData, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  cTex.colorSpace = THREE.SRGBColorSpace;
  cTex.magFilter = cTex.minFilter = THREE.LinearFilter;
  cTex.wrapS = cTex.wrapT = THREE.ClampToEdgeWrapping;
  cTex.needsUpdate = true;
  SU.uTerH.value = hTex;
  SU.uTerC.value = cTex;
  SU.uTerBox.value.set(TBOX.min, TBOX.min, TBOX.size, 1 / TBOX.size);
  return { hTex, cTex };
}

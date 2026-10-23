// Post effects: tilt-shift blur (miniature look) and the intro reveal over a dark grid floor.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export function tiltShiftPass() {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
      uStart: { value: 0.16 }, uEnd: { value: 0.5 }, uAmount: { value: 0.0065 }, uStrength: { value: 1 }
    },
    vertexShader: VS,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uStart, uEnd, uAmount, uStrength;
      varying vec2 vUv;
      float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
      void main(){
        vec4 base = texture2D(tDiffuse, vUv);
        float s = smoothstep(uStart, uEnd, abs(vUv.y - 0.52)) * uStrength;
        vec3 col = base.rgb;
        if (s > 0.002) {
          float r = s * uAmount;
          float rot = ign(gl_FragCoord.xy) * 6.2831853;
          vec3 acc = vec3(0.0);
          const int N = 18;
          for (int i = 0; i < N; i++) {
            float t = (float(i) + 0.5) / float(N);
            float a = rot + float(i) * 2.39996323;
            vec2 o = vec2(cos(a), sin(a)) * sqrt(t) * r;
            o.x *= uRes.y / uRes.x;
            acc += texture2D(tDiffuse, vUv + o).rgb;
          }
          col = mix(base.rgb, acc / float(N), min(1.0, s * 1.4));
        }
        // a whisper of noise against banding in gradients
        col += (ign(gl_FragCoord.xy + 17.0) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }`
  });
}

export function revealPass() {
  const p = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tDepth: { value: null },
      uProjInv: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
      uCenter: { value: new THREE.Vector2() }, uRadius: { value: 6 }, uThick: { value: 0.22 },
      uRim: { value: new THREE.Color(0.55, 0.75, 4.0) }, uFade: { value: 0 }, uFloorY: { value: 0.02 },
      uBg: { value: new THREE.Color(0x120A1E) }, uFloor: { value: new THREE.Color(0x1C1130) },
      uLine: { value: new THREE.Color(0x3A2658) }, uMark: { value: new THREE.Color(0x6A3FC0) }
    },
    vertexShader: VS,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse, tDepth;
      uniform mat4 uProjInv, uViewInv; uniform vec3 uCamPos;
      uniform vec2 uCenter; uniform float uRadius, uThick, uFade, uFloorY;
      uniform vec3 uRim, uBg, uFloor, uLine, uMark;
      varying vec2 vUv;
      vec3 toWorld(vec2 uv, float d){ vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w; return (uViewInv * v).xyz; }
      void main(){
        vec4 col = texture2D(tDiffuse, vUv);
        float d = texture2D(tDepth, vUv).r;
        vec3 wp = toWorld(vUv, d);
        float dist = d >= 0.99999 ? 1e6 : length(wp.xz - uCenter);
        // the floor: ray / plane
        vec3 rd = normalize(toWorld(vUv, 1.0) - uCamPos);
        vec3 fl = uBg;
        if (rd.y < -0.0001) {
          float t = (uFloorY - uCamPos.y) / rd.y;
          vec3 fp = uCamPos + rd * t;
          vec2 g = fp.xz;
          vec2 big = abs(fract(g / 6.0) - 0.5) * 6.0;
          float line = 1.0 - smoothstep(0.0, 0.05 + t * 0.0012, min(abs(big.x - 3.0), abs(big.y - 3.0)));
          vec2 c = fract(g / 1.5) - 0.5;
          vec2 cr = abs(vec2(c.x + c.y, c.x - c.y)) * 1.5;
          float mark = (1.0 - smoothstep(0.0, 0.035 + t * 0.0008, min(cr.x, cr.y))) * step(max(abs(c.x), abs(c.y)) * 1.5, 0.11);
          fl = mix(uFloor, uLine, line * 0.85);
          fl = mix(fl, uMark, mark);
          fl = mix(fl, uBg, smoothstep(30.0, 120.0, t));
          // glow of the reveal on the floor around the circle
          float rf = length(fp.xz - uCenter);
          fl += uRim * 0.05 * exp(-abs(rf - uRadius) * 1.4);
        }
        float outside = step(uRadius, dist);
        float rim = step(uRadius - uThick, dist) * (1.0 - outside);
        vec3 c = mix(col.rgb, uRim, rim * (1.0 - uFade));
        c = mix(c, fl, outside * (1.0 - uFade));
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  p.needsSwap = true;
  const render = p.render.bind(p);
  p.render = (renderer, writeBuffer, readBuffer, dt, mask) => {
    p.uniforms.tDepth.value = readBuffer.depthTexture;
    render(renderer, writeBuffer, readBuffer, dt, mask);
  };
  // keep the camera matrices in sync (call each frame before composer.render)
  p.sync = cam => {
    p.uniforms.uProjInv.value.copy(cam.projectionMatrixInverse);
    p.uniforms.uViewInv.value.copy(cam.matrixWorld);
    p.uniforms.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
  };
  return p;
}

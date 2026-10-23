// Illustrative lighting shared by every world material:
// albedo * light colour, blended toward albedo * shadow colour by max(core shadow, cast shadow).
// Shadows are tinted (violet at sunset, deep blue at night) instead of simply darker.
import * as THREE from 'three';
import { U } from './materials.js';

export const SU = {
  uLightCol: { value: new THREE.Color(1.2, 1.0, 0.9) },
  uShadowCol: { value: new THREE.Color(0.32, 0.2, 0.75) },
  uCoreLo: { value: -0.25 },
  uCoreHi: { value: 1.0 },
  uBounce: { value: 0.55 },
  uBounceDist: { value: 1.4 },
  uCarScr: { value: new THREE.Vector4(-1e5, -1e5, 0, 1) }, // px x, px y, view depth, radius px
  uTerH: { value: null },
  uTerC: { value: null },
  uTerBox: { value: new THREE.Vector4(-80, -80, 160, 1 / 160) },
  uTileCol: { value: new THREE.Color(0.8, 0.45, 0.2) },
  uSunW: { value: new THREE.Vector3(0, 1, 0) },
  uSnow: { value: 0 },
  uSnowCol: { value: new THREE.Color(0.86, 0.9, 1.0) },
  uTime: U.time
};

export const STYLE_PARS = /* glsl */`
uniform vec3 uLightCol;
uniform vec3 uShadowCol;
uniform float uCoreLo;
uniform float uCoreHi;
uniform float uBounce;
uniform float uBounceDist;
uniform vec4 uCarScr;
uniform sampler2D uTerH;
uniform sampler2D uTerC;
uniform vec4 uTerBox;
uniform float uSnow;
uniform vec3 uSnowCol;
varying vec3 vStW;
float stBayer(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int k = q.x + q.y * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[k] + 0.5) / 16.0;
}
vec2 stTerUV(vec2 xz) { return (xz - uTerBox.xy) * uTerBox.w; }
float stHash(vec2 p) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
float stNoise(vec2 p) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( stHash( i ), stHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( stHash( i + vec2( 0.0, 1.0 ) ), stHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
`;

// fragment lighting: replaces lights_fragment_begin / maps / end
export const STYLE_LIGHT = /* glsl */`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
{
  float stShadow = 1.0;
  vec3 stL = vec3( 0.0, 1.0, 0.0 );
  #if NUM_DIR_LIGHTS > 0
    stL = directionalLights[ 0 ].direction;
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
      if ( receiveShadow ) stShadow = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
    #endif
  #endif
  float stNdl = dot( geometryNormal, stL );
  float stCore = smoothstep( uCoreHi, uCoreLo, stNdl );
  float stMix = clamp( max( max( stCore, 1.0 - stShadow ), stExtra ), 0.0, 1.0 );
  vec3 stAlb = diffuseColor.rgb;
  #ifdef ST_BOUNCE
  {
    vec2 tuv = stTerUV( vStW.xz );
    float gh = texture2D( uTerH, tuv ).r;
    vec3 gc = mix( texture2D( uTerC, tuv ).rgb, uSnowCol, uSnow * 0.75 );
    vec3 nW = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
    float bo = smoothstep( -1.0, 1.0, - nW.y );
    float bd = clamp( ( uBounceDist - max( 0.0, vStW.y - gh ) ) / uBounceDist, 0.0, 1.0 );
    stAlb = mix( stAlb, gc, bo * bd * bd * uBounce );
  }
  #endif
  #ifndef ST_NOSNOW
  if ( uSnow > 0.0 ) {
    // winter: snow settles on everything that faces the sky
    vec3 nS = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
    float sn = smoothstep( 0.4, 0.8, nS.y ) * uSnow * ST_SNOWK;
    float dr = stNoise( vStW.xz * 0.45 ) * 0.6 + stNoise( vStW.xz * 1.9 ) * 0.4;
    stAlb = mix( stAlb, uSnowCol * ( 0.92 + 0.08 * dr ), sn );
  }
  #endif
  vec3 stCol = mix( stAlb * uLightCol, stAlb * uShadowCol, stMix );
  reflectedLight.directDiffuse += stCol;
  #ifdef ST_SPEC
  {
    vec3 hv = normalize( stL + geometryViewDir );
    float sp = pow( max( dot( geometryNormal, hv ), 0.0 ), ST_SHINE ) * ST_SPEC;
    reflectedLight.directSpecular += uLightCol * sp * ( 1.0 - stMix );
    float fr = pow( 1.0 - max( dot( geometryNormal, geometryViewDir ), 0.0 ), 4.0 );
    reflectedLight.directSpecular += mix( uShadowCol, uLightCol, 0.6 ) * fr * ST_SPEC * 0.35;
  }
  #endif
  #if NUM_POINT_LIGHTS > 0
  {
    IncidentLight pl;
    #pragma unroll_loop_start
    for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
      getPointLightInfo( pointLights[ i ], geometryPosition, pl );
      reflectedLight.directDiffuse += stAlb * pl.color * RECIPROCAL_PI * max( dot( geometryNormal, pl.direction ) * 0.75 + 0.25, 0.0 );
    }
    #pragma unroll_loop_end
  }
  #endif
  #if NUM_SPOT_LIGHTS > 0
  {
    IncidentLight sl;
    #pragma unroll_loop_start
    for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
      getSpotLightInfo( spotLights[ i ], geometryPosition, sl );
      reflectedLight.directDiffuse += stAlb * sl.color * RECIPROCAL_PI * max( dot( geometryNormal, sl.direction ), 0.0 );
    }
    #pragma unroll_loop_end
  }
  #endif
}
`;

// screen-space dither so anything standing between the camera and the car fades out
export const STYLE_OCCLUDE = /* glsl */`
#ifdef ST_OCCLUDE
{
  float rr = length( gl_FragCoord.xy - uCarScr.xy ) / uCarScr.w;
  if ( rr < 1.0 && vViewPosition.z < uCarScr.z - 1.6 ) {
    float f = 1.0 - smoothstep( 0.45, 1.0, rr );
    if ( stBayer( gl_FragCoord.xy ) < f * 0.92 ) discard;
  }
}
#endif
`;

// paving: square tiles with darker seams (world space)
export const STYLE_TILES = /* glsl */`
#ifdef ST_TILES
{
  vec2 tp = vStW.xz / 1.15;
  vec2 tf = abs( fract( tp ) - 0.5 );
  float seam = smoothstep( 0.455, 0.49, max( tf.x, tf.y ) );
  vec2 ti = floor( tp );
  float tv = fract( sin( dot( ti, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  diffuseColor.rgb *= ( 0.95 + tv * 0.08 ) * ( 1.0 - seam * 0.16 );
}
#endif
`;

const VERT_PARS = 'varying vec3 vStW;\n';
const VERT_WORLD = '\nvStW = ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );\n';

// patch a three.js lit material (Standard / Lambert / Phong) in place
export function stylize(mat, o = {}) {
  if (mat.userData.styled) return mat;
  mat.userData.styled = true;
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.defines = Object.assign({}, mat.defines || {});
  if (o.occlude) mat.defines.ST_OCCLUDE = '';
  if (o.bounce !== false) mat.defines.ST_BOUNCE = '';
  if (o.tiles) mat.defines.ST_TILES = '';
  if (o.spec) { mat.defines.ST_SPEC = o.spec.toFixed(3); mat.defines.ST_SHINE = (o.shine || 40).toFixed(1); }
  if (o.snow === 0) mat.defines.ST_NOSNOW = ''; else mat.defines.ST_SNOWK = (o.snow ?? 1).toFixed(2);
  const extra = o.extra || '0.0';
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, SU);
    sh.vertexShader = VERT_PARS + sh.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>' + VERT_WORLD);
    let fs = STYLE_PARS + (o.fragPars || '') + sh.fragmentShader;
    fs = fs.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + STYLE_OCCLUDE + (o.fragStart || ''));
    fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + STYLE_TILES + (o.fragColor || ''));
    fs = fs.replace('#include <lights_fragment_begin>', 'float stExtra = ' + extra + ';\n' + STYLE_LIGHT);
    fs = fs.replace('#include <lights_fragment_maps>', '').replace('#include <lights_fragment_end>', '');
    sh.fragmentShader = fs;
  };
  const key = 'st' + (o.occlude ? 'o' : '') + (o.tiles ? 't' : '') + (o.spec ? 's' + o.spec : '') + (o.bounce === false ? 'nb' : '') + (o.snow === undefined ? '' : 'w' + o.snow) + (o.key || '');
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + key;
  mat.needsUpdate = true;
  return mat;
}

// unlit materials (screens, signs) only get the see-through dither around the car
export function occludeBasic(mat) {
  if (mat.userData.occl) return mat;
  mat.userData.occl = true;
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uCarScr = SU.uCarScr;
    sh.vertexShader = 'varying float vStDepth;\n' + sh.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\nvStDepth = - mvPosition.z;');
    sh.fragmentShader = 'uniform vec4 uCarScr;\nvarying float vStDepth;\n' + STYLE_PARS_DITHER + sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      {
        float rr = length( gl_FragCoord.xy - uCarScr.xy ) / uCarScr.w;
        if ( rr < 1.0 && vStDepth < uCarScr.z - 1.6 ) {
          float f = 1.0 - smoothstep( 0.45, 1.0, rr );
          if ( stBayer( gl_FragCoord.xy ) < f * 0.92 ) discard;
        }
      }`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + 'occl';
  mat.needsUpdate = true;
  return mat;
}
const STYLE_PARS_DITHER = /* glsl */`
float stBayer(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int k = q.x + q.y * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[k] + 0.5) / 16.0;
}
`;

// walk the scene and style every lit material that is not styled yet
export function styleScene(root, opts = () => ({})) {
  const seen = new Set();
  root.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || seen.has(m) || m.userData.styled || m.userData.noStyle) continue;
      if (!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) continue;
      seen.add(m);
      stylize(m, opts(o, m));
    }
  });
}

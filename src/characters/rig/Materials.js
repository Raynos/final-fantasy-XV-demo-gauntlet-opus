import * as THREE from 'three';
import { makeTexture, normalFromHeight, canvasTexture, srgb } from '../../util/TextureGen.js';
import { Noise } from '../../util/Noise.js';

/**
 * Character materials.
 *
 * Two ideas keep the draw-call count low without flattening the look:
 *
 * 1. every character vertex carries `color` and `aMat` (roughness, metalness),
 *    so one shared material can render leather, denim, wool and rubber;
 * 2. skin and hair get a small shader patch — a wrap-lit fresnel term standing
 *    in for subsurface scattering, which is what stops procedural skin reading
 *    as painted plastic.
 */

/** View-space sun direction shared by every patched character material. */
export const SUN = {
  dir: { value: new THREE.Vector3(0, 1, 0) },
  color: { value: new THREE.Color(1, 0.95, 0.88) },
};

const _v = new THREE.Vector3();

/** Push the current sun into the shared uniforms (call once per frame). */
export function updateSun(sunLight, camera) {
  if (!sunLight || !camera) return;
  _v.copy(sunLight.position);
  if (sunLight.target) _v.sub(sunLight.target.position);
  _v.normalize().transformDirection(camera.matrixWorldInverse);
  SUN.dir.value.copy(_v);
  SUN.color.value.copy(sunLight.color).multiplyScalar(Math.min(1.4, sunLight.intensity * 0.35));
}

/**
 * Wire per-vertex roughness/metalness and an optional fake-SSS rim into a
 * standard/physical material.
 */
function patch(mat, { sss = 0, sssColor = 0xff5b3a, translucency = 0.5 } = {}) {
  mat.defines = mat.defines || {};
  mat.userData.sss = sss;
  const sssCol = { value: new THREE.Color().setHex(sssColor, THREE.SRGBColorSpace) };
  const sssAmt = { value: sss };
  const trans = { value: translucency };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSunDirView = SUN.dir;
    sh.uniforms.uSunColor = SUN.color;
    sh.uniforms.uSssColor = sssCol;
    sh.uniforms.uSssAmt = sssAmt;
    sh.uniforms.uTrans = trans;

    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aMat;\nvarying vec2 vMat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvMat = aMat;');

    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vMat;
uniform vec3 uSunDirView, uSunColor, uSssColor;
uniform float uSssAmt, uTrans;`)
      .replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\n\troughnessFactor = clamp( vMat.x, 0.035, 1.0 );')
      .replace('#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\n\tmetalnessFactor = clamp( vMat.y, 0.0, 1.0 );');

    if (sss > 0) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `
{
  vec3 sN = normalize( vNormal );
  vec3 sV = normalize( vViewPosition );
  float fres = pow( 1.0 - clamp( dot( sN, sV ), 0.0, 1.0 ), 4.5 );
  float wrap = clamp( dot( sN, uSunDirView ) * 0.5 + 0.5, 0.0, 1.0 );
  float back = pow( clamp( dot( sV, -uSunDirView ), 0.0, 1.0 ), 2.5 );
  vec3 sss = uSssColor * uSunColor * uSssAmt *
             ( fres * ( 0.15 + 0.85 * wrap * wrap ) + back * uTrans * fres );
  gl_FragColor.rgb += sss * diffuseColor.rgb;
}
#include <dithering_fragment>`);
    }
  };
  mat.customProgramCacheKey = () => `char-${sss > 0 ? 'sss' : 'plain'}`;
  return mat;
}

let _cache = null;
function cache() {
  if (_cache) return _cache;
  const n = new Noise(4242);

  const pore = normalFromHeight(128, (u, v) => (
    0.5 * n.simplex2(u * 96, v * 96)
    + 0.3 * n.simplex2(u * 210, v * 210)
    + 0.22 * n.simplex2(u * 420, v * 420)
  ), 0.85);
  pore.repeat.set(22, 34);

  const poreFine = pore.clone();
  poreFine.repeat.set(9, 13);
  poreFine.needsUpdate = true;

  const weave = normalFromHeight(128, (u, v) => (
    0.5 * Math.sin(u * Math.PI * 2 * 34) * Math.sin(v * Math.PI * 2 * 34)
    + 0.35 * n.simplex2(u * 140, v * 140)
    + 0.2 * n.simplex2(u * 300, v * 300)
  ), 1.1);
  weave.repeat.set(9, 14);

  const hairStripe = makeTexture(64, (u, v, c) => {
    const s = 0.74 + 0.26 * Math.abs(Math.sin(u * Math.PI * 7.0 + n.simplex2(u * 9, 0) * 3));
    const t = 0.88 + 0.12 * n.simplex2(u * 30, v * 6);
    c[0] = c[1] = c[2] = s * t;
  }, { colorSpace: THREE.SRGBColorSpace });

  _cache = { pore, poreFine, weave, hairStripe };
  return _cache;
}

/** Shared skin material for bodies (heads use `faceMaterial`). */
export function skinMaterial() {
  const c = cache();
  return patch(new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.62,
    metalness: 0,
    normalMap: c.pore,
    normalScale: new THREE.Vector2(0.36, 0.36),
    sheen: 0.12,
    sheenColor: srgb(0xffd8c0),
    sheenRoughness: 0.9,
    clearcoat: 0.05,
    clearcoatRoughness: 0.62,
  }), { sss: 0.085, sssColor: 0xff6a48, translucency: 0.35 });
}

/** Per-character face material — carries the painted face map. */
export function faceMaterial(map, sss = 0.09) {
  const c = cache();
  return patch(new THREE.MeshPhysicalMaterial({
    map,
    vertexColors: true,
    roughness: 0.56,
    metalness: 0,
    normalMap: c.poreFine,
    normalScale: new THREE.Vector2(0.30, 0.30),
    sheen: 0.14,
    sheenColor: srgb(0xffd0b4),
    sheenRoughness: 0.85,
    clearcoat: 0.06,
    clearcoatRoughness: 0.5,
  }), { sss, sssColor: 0xff4a26, translucency: 0.6 });
}

/** Shared garment material — colour and finish come from vertex attributes. */
export function garmentMaterial() {
  const c = cache();
  return patch(new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.8,
    metalness: 0,
    normalMap: c.weave,
    normalScale: new THREE.Vector2(0.5, 0.5),
    sheen: 0.35,
    sheenColor: srgb(0x9aa4b4),
    sheenRoughness: 0.7,
  }), { sss: 0 });
}

/** Shared hair material — anisotropic highlight along the strand direction. */
export function hairMaterial() {
  const c = cache();
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.54,
    metalness: 0.0,
    map: c.hairStripe,
    anisotropy: 0.6,
    anisotropyRotation: Math.PI * 0.5,
    specularIntensity: 0.4,
    clearcoat: 0.06,
    clearcoatRoughness: 0.40,
    sheen: 0.3,
    sheenColor: srgb(0x6b5a4a),
    sheenRoughness: 0.5,
    side: THREE.DoubleSide,
  });
  return patch(m, { sss: 0.14, sssColor: 0x8a6a4a, translucency: 0.45 });
}

/** Eyeball material: painted iris + sclera, glossy. */
export function eyeMaterial(map) {
  return patch(new THREE.MeshPhysicalMaterial({
    map,
    vertexColors: true,
    roughness: 0.22,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.07,
  }), { sss: 0 });
}

/** Thin glass for spectacle lenses. */
export function lensMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xdfe8f2,
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.17,
    transmission: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

export { cache as textureCache };

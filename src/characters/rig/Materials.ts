import * as THREE from 'three';
import { makeTexture, normalFromHeight, srgb } from '../../util/TextureGen.ts';
import { Noise } from '../../util/Noise.ts';
import { EYE } from './Face.ts';

/**
 * Character materials.
 *
 * Three ideas keep the draw-call count low without flattening the look:
 *
 * 1. every character vertex carries `color` and `aMat` (roughness, metalness,
 *    translucent thickness), so one shared material renders leather, denim,
 *    wool and rubber;
 * 2. skin gets a real two-term subsurface model — a *terminator* bleed that
 *    pushes blood-red into the band where N·L crosses zero, plus back-scatter
 *    through thin parts (ears, nose wings, fingers). Rim-only fresnel "SSS",
 *    which is what this used to do, reads as wax, not flesh;
 * 3. hair gets a Kajiya-Kay anisotropic pair of highlight bands aligned to the
 *    per-vertex strand tangent, which is the single cue that separates hair
 *    from a moulded plastic helmet.
 *
 * Everything is injected right after `<opaque_fragment>`, i.e. while the frame
 * is still linear HDR and *before* MaterialPatch's aerial perspective mixes the
 * surface toward the sky — so distance correctly washes these terms out too.
 */

/** View-space sun direction shared by every patched character material. */
export const SUN = {
  dir: { value: new THREE.Vector3(0, 1, 0) },
  color: { value: new THREE.Color(1, 0.95, 0.88) },
  /** View-space "key fill" — where the sky's brightest lobe sits. */
  sky: { value: new THREE.Vector3(0, 1, 0) },
};

const _v = new THREE.Vector3();

/** Push the current sun into the shared uniforms (call once per frame). */
export function updateSun(sunLight: THREE.DirectionalLight | null, camera: THREE.Camera | null) {
  if (!sunLight || !camera) return;
  _v.copy(sunLight.position);
  if (sunLight.target) _v.sub(sunLight.target.position);
  _v.normalize().transformDirection(camera.matrixWorldInverse);
  SUN.dir.value.copy(_v);
  SUN.color.value.copy(sunLight.color).multiplyScalar(Math.min(1.4, sunLight.intensity * 0.35));
  // the sky's dominant lobe is straight up; used for eye catchlights so a face
  // in shadow still has living eyes
  _v.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
  SUN.sky.value.copy(_v);
}

/** GLSL prologue shared by every patched character shader. */
const HEAD = /* glsl */`
varying vec3 vMat;
varying vec3 vTanV;
varying vec3 vObjN;
uniform vec3 uSunDirView, uSunColor, uSkyDirView, uSssColor;
uniform float uSssAmt, uTrans;
`;

/**
 * Wire per-vertex roughness / metalness / thickness and an optional shading
 * extension (subsurface, hair anisotropy, cornea glint) into a standard or
 * physical material.
 *
 * @param {Object} o
 * */
/** Kajiya-Kay anisotropic highlight pair, aligned to the strand tangent. */
interface HairSpec {
  /** specular strength of the primary band. */
  spec?: number;
  /** how far the secondary band is shifted along the strand. */
  shift?: number;
  /** primary / secondary band exponents. */
  exp1?: number;
  exp2?: number;
  /** how much of the hair's own hue the secondary band takes. */
  tint?: number;
}

/** The explicit cornea glint that stops an eyeball reading as a marble. */
interface CorneaSpec {
  gloss?: number;
  /** iris colour as a hex number; the shader generates the iris from it. */
  iris?: number;
}

interface PatchOpts {
  /** subsurface amount, 0 for none. */
  sss?: number;
  sssColor?: number;
  /** back-scatter strength through thin parts. */
  translucency?: number;
  hair?: HairSpec | null;
  cornea?: CorneaSpec | null;
}

function patch(mat: THREE.Material, o: PatchOpts = {}) {
  const { sss = 0, sssColor = 0xff5b3a, translucency = 0.5, hair = null, cornea = null } = o;
  mat.defines = mat.defines || {};
  mat.userData.sss = sss;
  const sssCol = { value: new THREE.Color().setHex(sssColor, THREE.SRGBColorSpace) };
  const sssAmt = { value: sss };
  const trans = { value: translucency };
  const kind = hair ? 'hair' : cornea ? `eye${cornea.iris}` : sss > 0 ? 'sss' : 'plain';

  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSunDirView = SUN.dir;
    sh.uniforms.uSunColor = SUN.color;
    sh.uniforms.uSkyDirView = SUN.sky;
    sh.uniforms.uSssColor = sssCol;
    sh.uniforms.uSssAmt = sssAmt;
    sh.uniforms.uTrans = trans;

    sh.vertexShader = sh.vertexShader
      .replace('#include <common>',
        '#include <common>\nattribute vec3 aMat;\nattribute vec3 aTan;\nvarying vec3 vMat;\nvarying vec3 vTanV;\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvMat = aMat;')
      // object-space normal, before skinning: on the eyeball this is exactly the
      // direction from the globe centre, which is the only stable way to place an
      // iris. UV varyings are hostage to which map slots a material happens to
      // have; a normal is always there.
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n\tvObjN = normalize( objectNormal );')
      // skin the strand tangent with the same matrix the normal uses, then take
      // it to view space — this has to happen after <skinnormal_vertex> so
      // `skinMatrix` is in scope
      .replace('#include <skinnormal_vertex>', /* glsl */`#include <skinnormal_vertex>
      vec3 tanRaw = dot( aTan, aTan ) > 1e-6 ? aTan : vec3( 0.0, 1.0, 0.0 );
      #ifdef USE_SKINNING
        tanRaw = ( skinMatrix * vec4( tanRaw, 0.0 ) ).xyz;
      #endif
      vTanV = normalize( normalMatrix * tanRaw );`);

    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${HEAD}`)
      .replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\n\troughnessFactor = clamp( vMat.x, 0.035, 1.0 );')
      .replace('#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\n\tmetalnessFactor = clamp( vMat.y, 0.0, 1.0 );');

    const blocks = [];

    if (sss > 0) {
      blocks.push(/* glsl */`
{
  vec3 sN = normalize( vNormal );
  vec3 sV = normalize( vViewPosition );
  vec3 sL = uSunDirView;
  float ndl = dot( sN, sL );
  float ndv = clamp( dot( sN, sV ), 0.0, 1.0 );
  float thick = clamp( vMat.z, 0.0, 1.0 );
  float fres = pow( 1.0 - ndv, 4.0 );
  // 1. terminator bleed — a narrow red band centred exactly where the surface
  //    turns away from the sun, falling off fast into full shadow
  float term = exp( -ndl * ndl * 11.0 ) * smoothstep( -0.60, 0.05, ndl );
  // 2. back-scatter — light entering the far side of a thin part and leaving
  //    toward the eye; ears and nose wings glow, a chest does not
  float back = pow( clamp( dot( sV, -sL ), 0.0, 1.0 ), 3.0 ) * ( 0.12 + 1.15 * thick );
  // 3. a whisper of forward wrap so lit skin never reads as flat paint
  float wrapT = clamp( ndl * 0.5 + 0.5, 0.0, 1.0 );
  vec3 sss = uSssColor * uSunColor * uSssAmt * (
      term * 1.35
    + back * uTrans
    // a broad fresnel lift over the whole face is waxy fill light, not
    // subsurface: keep it for thin parts (ears, nose wings) and little else
    + fres * 0.16 * ( 0.10 + 0.90 * thick ) * wrapT
  );
  gl_FragColor.rgb += sss * diffuseColor.rgb;
}`);
    }

    if (hair) {
      const { spec = 0.5, shift = 0.06, exp1 = 110.0, exp2 = 18.0, tint = 0.75 } = hair;
      blocks.push(/* glsl */`
{
  vec3 hN = normalize( vNormal );
  vec3 hV = normalize( vViewPosition );
  vec3 hL = uSunDirView;
  vec3 hT = normalize( vTanV );
  vec3 hH = normalize( hL + hV );
  // per-strand jitter so the band breaks into filaments instead of a chrome bar
  float jit = fract( sin( dot( vMapUv, vec2( 91.7, 47.3 ) ) ) * 4371.1 ) - 0.5;
  vec3 t1 = normalize( hT + hN * ( ${(-shift).toFixed(3)} + jit * 0.05 ) );
  vec3 t2 = normalize( hT + hN * ( ${(shift * 1.9).toFixed(3)} + jit * 0.07 ) );
  float d1 = dot( t1, hH ), d2 = dot( t2, hH );
  float s1 = pow( max( 1e-4, sqrt( max( 0.0, 1.0 - d1 * d1 ) ) ), ${exp1.toFixed(1)} );
  float s2 = pow( max( 1e-4, sqrt( max( 0.0, 1.0 - d2 * d2 ) ) ), ${exp2.toFixed(1)} );
  float vis = clamp( dot( hN, hL ) * 0.7 + 0.3, 0.0, 1.0 );
  // Break the band along the strand so it reads as filaments catching light
  // rather than a chrome stripe painted down a tube. This ran on vMapUv.x,
  // which is the coordinate *across* the ribbon: 34 cycles across a 3 mm strand
  // is far below a pixel at any range, so it aliased into the chrome speckle
  // that made every lock read as a faceted blade. It has to run along .y.
  float mask = 0.34 + 0.66 * abs( sin( vMapUv.y * 9.0 + jit * 7.0 ) );
  // The secondary band takes the hair's *hue*, not its value. This read
  // \`vColor.rgb * 3.2\`, which is a brightness multiplier dressed up as a tint:
  // near-black hair needed the 3.2 to show any colour at all, and blond hair —
  // already at 0.8 albedo — was therefore multiplied to 2.7 and clipped to
  // white on every lock facing the sun. That is what turned Prompto's and
  // Ignis's hair into straw, and no amount of geometry work could fix it,
  // because the strands were correct and simply over-exposed. Normalising by
  // luminance gives every hair colour the same specular energy.
  float luminance = dot( vColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
  vec3 hueC = vColor.rgb / max( 0.10, luminance );
  vec3 sheenC = mix( vec3( 1.0 ), hueC, ${tint.toFixed(2)} );
  // vMat.z is 1 on strands and 0 on the scalp shell: the shell must stay a
  // matte value floor or its broad highlight reads as a moulded plastic dome
  float strand = 0.30 + 0.70 * clamp( vMat.z, 0.0, 1.0 );
  vec3 kk = uSunColor * vis * mask * strand * ( s1 * 0.55 + s2 * 0.40 * sheenC ) * ${spec.toFixed(3)};
  // backlit hair glows at the silhouette — the cue that reads as fine strands
  float rim = pow( 1.0 - clamp( dot( hN, hV ), 0.0, 1.0 ), 2.6 )
            * pow( clamp( dot( hV, -hL ), 0.0, 1.0 ), 1.6 );
  // same normalisation as the band: a rim that scales with albedo blows out on
  // light hair and vanishes on dark, which is backwards — a backlit silhouette
  // is the *transmission* term and it is strongest on fine pale hair, but not
  // by a factor of forty.
  kk += uSunColor * rim * 0.30 * strand * hueC * ( 0.20 + 0.55 * luminance );
  // Sky sheen. Near-black hair under a directional key has nothing at all in
  // shadow, which is why the whole cast read as wearing black helmets: the
  // silhouette went to a single flat value the moment it turned away from the
  // sun. A broad, weak dome term restores the value range a real head of hair
  // has on its shadow side without lifting it toward navy.
  float dome = clamp( dot( hN, uSkyDirView ) * 0.5 + 0.5, 0.0, 1.0 );
  kk += uSunColor * pow( dome, 1.6 ) * 0.11 * strand * hueC * ( 0.14 + 0.42 * luminance );
  gl_FragColor.rgb += kk;
}`);
    }

    if (cornea) {
      const { gloss = 1.0, iris = 0x3f6f9c } = cornea;
      const c = new THREE.Color().setHex(iris, THREE.SRGBColorSpace);
      // The iris is generated in the shader from the eyeball's azimuthal UV
      // rather than sampled from a map. A polar-mapped eye texture is a trap:
      // the UV derivative is unbounded at the pole, which is precisely where
      // the iris lives, so the hardware picks a coarse mip and the eye renders
      // as a blank white bead. Procedural also stays crisp at any distance.
      blocks.push(/* glsl */`
{
  vec3 oN = normalize( vObjN );
  float ePhi = acos( clamp( oN.z, -1.0, 1.0 ) );      // angle from the gaze axis
  // Matched to the geometric limbus in Face.ts — when these two disagree the
  // limbal ring lands on flat sclera and the iris looks pasted on.
  float eT = ePhi / ${EYE.iris.toFixed(3)};           // 0..1 across the iris
  float eL = max( 1e-5, length( oN.xy ) );
  float eUp = oN.y / eL;                              // +1 straight up
  float eAng = atan( oN.y, oN.x );
  float lidShade = 1.0 - 0.40 * pow( clamp( eUp, 0.0, 1.0 ), 2.0 );
  vec3 eyeC;
  if ( eT < 0.42 ) {
    // never pure black: a real pupil scatters a little, and true black
    // crushes to a hole under bloom
    eyeC = vec3( 0.013 + 0.020 * pow( eT / 0.42, 3.0 ) );
  } else if ( eT < 1.0 ) {
    float q = ( eT - 0.42 ) / 0.58;
    float fib = 0.70 + 0.38 * abs( sin( eAng * 38.0 + sin( eAng * 7.0 ) * 2.2 ) );
    float radial = 0.18 + 0.82 * pow( q, 1.45 );
    float ruff = 1.0 + 0.28 * exp( -pow( ( q - 0.30 ) / 0.10, 2.0 ) );
    // light entering the cornea lights the iris wall opposite the sky
    float cres = 1.0 + 0.65 * clamp( -eUp, 0.0, 1.0 ) * pow( q, 0.7 );
    float k = radial * fib * ruff * cres;
    k *= 0.88 + 0.22 * sin( eAng * 21.0 + q * 9.0 );
    k *= mix( 1.0, 0.04, smoothstep( 0.78, 0.96, q ) );   // limbal ring
    eyeC = vec3( ${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)} ) * min( 1.15, k ) * lidShade;
    // the limbus is a graded blue-grey band, not a hard black line
    eyeC = mix( eyeC, vec3( 0.30, 0.30, 0.33 ) * lidShade, smoothstep( 0.955, 1.0, q ) );
  } else {
    // Sclera. It used to sit at 0.27 albedo, i.e. the same value as the socket
    // it lives in, so the only white on the eye was the specular dot and every
    // character read as squinting. A sclera has to be *light* — that value
    // break against the iris is the entire "this head is alive" cue at 30 px.
    // It must not be *paper*, though: at 0.74 with a 0.72 sky lift on top it
    // blew to pure white at grazing angles and the far eye of any three-quarter
    // frame rendered as a blank bead.
    float sh = ( 0.44 + 0.17 * min( 1.0, ( eT - 1.0 ) * 1.2 ) ) * mix( 1.0, lidShade, 0.62 );
    // the sclera is a curved, self-shadowed ball: it darkens toward the canthi
    // and toward the top where the lid and the brow shade it
    float corner = clamp( 1.0 - abs( eUp ) * 1.4, 0.0, 1.0 ) * clamp( ( eT - 1.05 ) * 1.6, 0.0, 1.0 );
    sh *= 1.0 - 0.30 * smoothstep( 1.05, 1.65, eT );
    eyeC = sh * vec3( 0.99, 0.925 - corner * 0.11, 0.885 - corner * 0.18 );
    // vessels: faint warm threads running in from the corners
    float vein = smoothstep( 1.18, 1.75, eT ) * ( 0.5 + 0.5 * sin( eAng * 5.0 ) );
    eyeC = mix( eyeC, eyeC * vec3( 1.03, 0.86, 0.84 ), vein * 0.55 );
  }
  // re-light: the ball was shaded with a flat white albedo, so scale the
  // result by the iris/sclera value we just computed
  gl_FragColor.rgb *= eyeC;

  vec3 eN = normalize( vNormal );
  vec3 eV = normalize( vViewPosition );
  // a tight sun glint plus a broad sky catchlight: an eye without a specular
  // dot reads as a painted bead no matter how good the iris is
  vec3 h1 = normalize( uSunDirView + eV );
  vec3 h2 = normalize( uSkyDirView * 0.85 + eV );
  float g1 = pow( clamp( dot( eN, h1 ), 0.0, 1.0 ), 1400.0 );
  float g2 = pow( clamp( dot( eN, h2 ), 0.0, 1.0 ), 190.0 );
  float wet = pow( 1.0 - clamp( dot( eN, eV ), 0.0, 1.0 ), 3.0 );
  // Ambient lift. An eye sits at the bottom of a socket under a brow and,
  // for Noctis, under a fringe that casts a real shadow — so physically it
  // is dark, and a dark eye is an eye the viewer cannot find. Every shipped
  // game cheats this: the globe gets a sky term shadowing does not touch.
  float skyE = clamp( dot( eN, uSkyDirView ) * 0.5 + 0.5, 0.0, 1.0 );
  // ...but it has to be *cut at grazing angles*. Off-axis the sclera turns edge
  // on, the lift stacked on an already-light albedo, and the far eye of every
  // three-quarter frame rendered as a featureless white bead. Fading it with
  // N.V keeps the near eye alive and lets the far one keep its shading.
  float face = clamp( dot( eN, eV ), 0.0, 1.0 );
  gl_FragColor.rgb += eyeC * uSunColor * 0.46 * pow( skyE, 1.2 ) * ( 0.30 + 0.70 * face );
  gl_FragColor.rgb += ( g1 * 4.0 + g2 * 1.5 + wet * 0.08 ) * uSunColor * ${gloss.toFixed(2)} * ( 0.25 + 0.75 * face );
}`);
    }

    if (blocks.length) {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>\n${blocks.join('\n')}`
      );
    }
  };
  mat.customProgramCacheKey = () => `char2-${kind}`;
  return mat;
}

let _cache: MaterialTextures | null = null;
/** The shared procedural maps every character material samples. */
interface MaterialTextures {
  pore: THREE.Texture;
  poreFine: THREE.Texture;
  weave: THREE.Texture;
  hairStripe: THREE.Texture;
}

function cache(): MaterialTextures {
  if (_cache) return _cache;
  const n = new Noise(4242);

  const pore = normalFromHeight(128, (u: number, v: number) => (
    0.5 * n.simplex2(u * 96, v * 96)
    + 0.3 * n.simplex2(u * 210, v * 210)
    + 0.22 * n.simplex2(u * 420, v * 420)
  ), 0.85);
  pore.repeat.set(15, 23);

  const poreFine = pore.clone();
  poreFine.repeat.set(9, 13);
  poreFine.needsUpdate = true;

  const weave = normalFromHeight(128, (u: number, v: number) => (
    0.5 * Math.sin(u * Math.PI * 2 * 34) * Math.sin(v * Math.PI * 2 * 34)
    + 0.35 * n.simplex2(u * 140, v * 140)
    + 0.2 * n.simplex2(u * 300, v * 300)
  ), 1.1);
  weave.repeat.set(9, 14);

  // strand value break-up along the hair ribbon: dark gaps between filaments
  const hairStripe = makeTexture(128, (u: number, v: number, c: number[]) => {
    // u runs across the ribbon (0 and 1 are the two silhouette edges, 0.5 the
    // crest), v along its length
    const across = Math.abs(u - 0.5) * 2;
    // Four filaments across the ribbon, not eleven: a lock is 2-3 mm wide, so
    // eleven bands across it are sub-pixel at every range the head is ever
    // seen at and alias into sparkle instead of resolving as strands.
    const fil = 0.66 + 0.34 * Math.abs(Math.sin(u * Math.PI * 4.0 + n.simplex2(u * 6, v * 2) * 2.2));
    const along = 0.80 + 0.20 * n.simplex2(u * 8, v * 26);
    // edges of a clump are always darker than its crest
    const edge = 0.70 + 0.30 * (1.0 - across * across);
    c[0] = c[1] = c[2] = fil * along * edge;
  }, { colorSpace: THREE.SRGBColorSpace });

  _cache = { pore, poreFine, weave, hairStripe };
  return _cache;
}

/** Shared skin material for bodies (heads use `faceMaterial`). */
/**
 * Subsurface tint, shared by the face and the body.
 *
 * They were 0xe02c12 and 0xd8321a — near-pure red at full saturation, and two
 * *different* near-pure reds, so the head and the neck reddened by different
 * amounts as they turned away from the sun. That is the second half of the jaw
 * seam (the first is the base value, which `SKIN_BASE` already unifies), and at
 * closeup the term is most of why the cast reads as sunburnt orange rather than
 * as skin. Real subsurface in skin is haemoglobin through dermis: a dull brick,
 * not a signal red.
 */
const SSS_RED = 0xb8503a;

export function skinMaterial() {
  const c = cache();
  return patch(new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.48,
    metalness: 0,
    normalMap: c.pore,
    // 0.42 on a 128px map tiled 22x34 aliased into a visible woven weave on the
    // neck, right beside the face's 0.34 at a third of the tiling — the two
    // together are most of what read as a seam along the jaw
    normalScale: new THREE.Vector2(0.30, 0.30),
    // a whisper of oily sheen. Clearcoat here is what made skin read as a
    // vacuum-formed plastic shell, so there is none.
    sheen: 0.18,
    sheenColor: srgb(0xffc0a0),
    sheenRoughness: 0.64,
    specularIntensity: 0.36,
    specularColor: srgb(0xfff0e4),
  }), { sss: 0.155, sssColor: SSS_RED, translucency: 0.95 });
}

/** Per-character face material — carries the painted face map. */
export function faceMaterial(map: THREE.Texture, sss = 0.16) {
  const c = cache();
  return patch(new THREE.MeshPhysicalMaterial({
    map,
    vertexColors: true,
    roughness: 0.46,
    metalness: 0,
    normalMap: c.poreFine,
    normalScale: new THREE.Vector2(0.34, 0.34),
    sheen: 0.17,
    sheenColor: srgb(0xffc0a0),
    sheenRoughness: 0.62,
    specularIntensity: 0.35,
    specularColor: srgb(0xfff2e8),
  }), { sss, sssColor: SSS_RED, translucency: 1.0 });
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
    normalScale: new THREE.Vector2(0.62, 0.62),
    // A strong blue-grey sheen over near-black cloth is exactly what turned the
    // whole cast into "generic slate NPCs": the sky's dominant lobe is blue, so
    // any broad sheen term lifts black to navy. Keep it weak and warm and let
    // per-vertex roughness carry the material difference instead.
    sheen: 0.16,
    sheenColor: srgb(0x8c8478),
    sheenRoughness: 0.58,
    specularIntensity: 0.34,
  }), { sss: 0 });
}

/** Shared hair material — Kajiya-Kay bands along the per-vertex strand tangent. */
export function hairMaterial() {
  const c = cache();
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.46,
    metalness: 0.0,
    map: c.hairStripe,
    specularIntensity: 0.22,
    sheen: 0.10,
    sheenColor: srgb(0x6b5c52),
    sheenRoughness: 0.45,
    side: THREE.DoubleSide,
  });
  return patch(m, {
    sss: 0,
    hair: { spec: 0.40, shift: 0.055, exp1: 90.0, exp2: 16.0, tint: 0.85 },
  });
}

/** Eyeball material: painted iris + sclera, with an explicit cornea glint. */
export function eyeMaterial(iris: number) {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.30,
    metalness: 0,
    // A cornea really is a mirror, but a mirror sphere under an image-based sky
    // reflects the whole dome and renders as a blank white bead — which is
    // exactly what an iris must never be. Keep the coat weak and dull and let
    // the explicit glints in the shader carry the wetness instead.
    clearcoat: 0.35,
    clearcoatRoughness: 0.12,
    envMapIntensity: 0.20,
  });
  // `defines` is not a constructor parameter on three's materials; the eye
  // shader needs UVs, so the define is set on the instance.
  m.defines = { ...(m.defines || {}), USE_UV: '' };
  return patch(m, { sss: 0, cornea: { gloss: 1.0, iris } });
}

/** Thin glass for spectacle lenses. */
export function lensMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xdfe8f2,
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.13,
    transmission: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/**
 * Soft contact shadow blob laid on the ground under a character. CSM shadows
 * alone lose the contact point in tall grass and the character reads as
 * hovering; this pins them down for the cost of one alpha-blended quad.
 */
export function contactShadowMaterial() {
  // MultiplyBlending ignores alpha, so the falloff has to live in the RGB:
  // white at the rim leaves the ground untouched, dark at the centre bites.
  const tex = makeTexture(64, (u: number, v: number, c: number[]) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    const k = Math.pow(Math.max(0, 1 - d), 1.8) * 0.66;
    c[0] = 1 - k;
    c[1] = 1 - k * 0.96;
    c[2] = 1 - k * 0.88;          // shadows go blue, never neutral grey
  }, { colorSpace: THREE.SRGBColorSpace, generateMipmaps: true });
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    blending: THREE.MultiplyBlending,
    premultipliedAlpha: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

export { cache as textureCache };

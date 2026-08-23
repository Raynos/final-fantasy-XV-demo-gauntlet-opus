import * as THREE from 'three';
import type { AtmosphereUniforms } from '../Sky.ts';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ATMO_COMMON } from '../../shaders/atmosphere.glsl.ts';
import { CLOUD_COMMON } from '../../shaders/clouds.glsl.ts';
import { buildCloudTextures } from './CloudTextures.ts';

const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/**
 * Fraction of the frame the raymarch runs at.
 */
const MARCH_SCALE = 0.45;

/**
 * Halton(2,3), eight samples — the same low-discrepancy set the TAA camera
 * jitter uses, so the march's sub-texel offsets and the resolve's sub-pixel
 * offsets cover their respective cells evenly over the same eight frames.
 */
const HALTON = (() => {
  const radical = (i: number, b: number) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
  const out = [];
  for (let i = 1; i <= 8; i++) out.push([radical(i, 2), radical(i, 3)]);
  return out;
})();

/** Screen-space raymarch of the cumulus layer at half resolution. */
const CLOUD_FRAG = /* glsl */`
precision highp float;
precision highp sampler3D;
${ATMO_COMMON}
${CLOUD_COMMON}

uniform mat4  uInvViewProj;
uniform vec3  uCamPos;
uniform vec3  uSunDir;
uniform vec3  uSunTint;
uniform float uSunIntensity;
uniform vec3  uMoonDir;
uniform vec3  uMoonTint;
uniform float uMoonLight;
uniform sampler2D uTransLut;
uniform sampler2D uSkyLut;
uniform float uCamAlt;
uniform float uMaxDist;
uniform float uCloudHaze;
uniform float uAmbientBoost;
uniform float uCloudSunGain;
uniform vec2  uPhaseClamp;
uniform float uSkyDim;
uniform float uFrame;
uniform vec2  uJitter;
uniform float uSilver;
uniform float uBaseShade;
uniform float uCloudMaxRad;
uniform float uCloudMS;
varying vec2 vUv;

void main() {
  // Sub-texel jitter, rotating on an 8-frame Halton sequence.
  //
  // The march runs at 45% of the frame and, without this, every frame shot the
  // ray through the exact centre of the same low-res texel. The buffer was
  // therefore bit-stable, so the TAA that resolves everything else in the
  // frame had nothing to average: the deck kept the texel grid of the buffer
  // it was marched into, and a 2x2 pixel staircase along every cloud edge is
  // what "blocky sky" actually was. Moving the ray inside its texel each frame
  // turns the accumulation history into an 8x supersample of the cloud layer
  // for no extra marching at all.
  vec2 ndc = (vUv + uJitter) * 2.0 - 1.0;
  vec4 pw = uInvViewProj * vec4(ndc, 1.0, 1.0);
  vec3 rd = normalize(pw.xyz / pw.w - uCamPos);

  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  if (rd.y < 0.002) return;

  vec3 P = uCamPos + vec3(0.0, ATM_PLANET_R, 0.0);
  // rain shafts hang below the deck, so the march has to start under it
  float marchBottom = uVirga > 0.001 ? min(uVirgaFloor, uCloudBottom) : uCloudBottom;
  float tB = atmRaySphere(P, rd, ATM_PLANET_R + marchBottom);
  float tT = atmRaySphere(P, rd, ATM_PLANET_R + uCloudTop);
  float t0 = max(min(tB, tT), 0.0);
  float t1 = max(tB, tT);
  if (t1 <= 0.0) return;
  t1 = min(t1, t0 + uMaxDist);
  if (t1 <= t0) return;

  float rCam = ATM_PLANET_R + max(uCamAlt, 1.0);
  vec3 sunRad = atmTransmittance(uTransLut, ATM_PLANET_R + 3000.0, uSunDir.y) * uSunTint * uSunIntensity;
  vec3 moonRad = uMoonTint * uMoonLight;

  // ambient: sky above the cloud plus a little bounce from the ground
  vec3 skyUp = atmSkyRadiance(uSkyLut, rCam, vec3(0.0, 1.0, 0.0), uSunDir) * uSunIntensity;
  vec3 skyHz = atmSkyRadiance(uSkyLut, rCam, normalize(vec3(rd.x, 0.02, rd.z)), uSunDir) * uSunIntensity;
  skyUp *= uSkyDim; skyHz *= uSkyDim;

  // Phase, expressed as a gain over isotropic (1/4pi) rather than as a raw
  // per-steradian value. Un-normalised, a dual-lobe HG swings ~350:1 between
  // looking at the sun and looking away from it, which is why the same cloud
  // deck was a blazing silver lining at dusk and near-black at midday. Real
  // cumulus is a near-conservative scatterer: hundreds of scattering events
  // flatten that ratio out, so clamp the gain and let uCloudSunGain carry the
  // energy the 3-octave approximation cannot reach on its own.
  const float ISO_INV = 12.566370614;                  // 4*PI
  float cosT = dot(rd, uSunDir);
  float phase = clamp(mix(atmHG(cosT, 0.80), atmHG(cosT, -0.30), 0.26) * ISO_INV,
                      uPhaseClamp.x, uPhaseClamp.y);
  float cosTM = dot(rd, uMoonDir);
  float phaseM = clamp(mix(atmHG(cosTM, 0.78), atmHG(cosTM, -0.30), 0.26) * ISO_INV,
                       uPhaseClamp.x, uPhaseClamp.y);

  // Cone stepping: the sample interval grows with distance, because a cloud
  // 30 km out covers a fraction of the pixels one 2 km out does. A single
  // step length across the whole slab is what produced the dither-noise
  // sandstorm — near the horizon it was several hundred metres through
  // hundred-metre features, and one sample then decided the whole segment.
  //
  // Empty space is skipped at 3x, and a hit rewinds one skip so the silhouette
  // is not chopped off at a coarse boundary. MISS_MAX has to stay *above* that
  // 3:1 ratio: with it equal, three empty fine samples land the march back
  // exactly on the sample that triggered the rewind, which rewinds again — the
  // ray then spends its whole step budget oscillating over one boundary and
  // never reaches the cloud behind it. That is a silent, total loss of the
  // deck, so the ratio is load bearing.
  const int MISS_MAX = 6;
  // Entry jitter, and it has to span a *coarse* step, not a fine one.
  //
  // The march's silhouette is not decided by the fine sampling. It is decided
  // by the empty-space skip: the probe steps at 3x fine with the erosion
  // octave off, and a cloud thinner than one coarse step that happens to lie
  // between two probes is missed outright. The phase of that probe grid along
  // the ray is set entirely by this offset, and t0 -- the range at which the
  // ray enters the layer -- varies smoothly down the screen, so the phase
  // drifts smoothly with it and whole rows of texels miss the same cloud
  // together. That is the horizontal comb-teeth and the free-floating
  // horizontal dashes in every dusk frame: not a filter, not a resolution, a
  // sampling grid beating against a smoothly varying entry distance.
  //
  // It was jittered over half a *fine* step, which is 1/6 of the grid it needed
  // to break up, so the eight-frame TAA history saw eight nearly identical
  // phases and averaged them into the same bands. Over a full coarse step the
  // eight frames are eight independent phases and the bands resolve into noise
  // the accumulation removes. Confirmed by ablation rather than inferred:
  // marching at full resolution instead of 0.45 halved the tooth height and
  // changed nothing else about the pattern, which is the signature of a step
  // artefact and not of an upsample.
  //
  // The previous comment here argued for the half-span on variance grounds --
  // that a full offset shows as a diagonal hatch. That trade was real, and it
  // was being paid to suppress a much smaller artefact than the one it caused.
  // Temporal decorrelation, which this did not actually have.
  //
  // atmDither is interleaved gradient noise: fract(52.98 * fract(dot(p, k)))
  // with k = (0.06711056, 0.00583715). Offsetting its *input* by uFrame * 3.11
  // on both axes adds 3.11 * (kx + ky) = 0.2269 per frame inside the dot, and
  // 52.98 * 0.2269 = 12.02 -- so each frame advanced the phase by 12.02, whose
  // fractional part is 0.02. Over the eight frames the TAA history spans, the
  // whole sequence covered a range of 0.16. The march was jittering against
  // essentially one fixed pattern, eight times, and TAA had nothing to
  // average. Every step artefact the jitter existed to dissolve was therefore
  // baked in as a static pattern instead.
  //
  // Adding a golden-ratio sequence to the *output* is the standard fix and it
  // is the right one here: IGN gives the spatial decorrelation between
  // neighbouring pixels, fract(n * 0.618034) gives eight well-spread phases in
  // time, and the two are independent. This is also why the previous entry
  // jitter had to be kept small to look acceptable -- with no temporal
  // averaging, a wide jitter is just static noise.
  float jitter = fract(atmDither(gl_FragCoord.xy) + uFrame * 0.6180339887);
  float t = t0;
  vec3 scat = vec3(0.0);
  float tr = 1.0;
  float meanT = 0.0, wsum = 0.0;
  int miss = MISS_MAX;
  float fine = clamp(t0 * 0.017, 30.0, 440.0);
  t += fine * 2.0 * jitter;         // 2.0 == the coarse/fine ratio below

  for (int i = 0; i < 192; i++) {
    if (tr < 0.008 || t > t1) break;
    fine = clamp(t * 0.017, 30.0, 440.0);
    // Skip ratio, and it is the number that decides the silhouette.
    //
    // The probe runs cloudDensity with the erosion octave off, so it can only
    // ever over-report -- it cannot miss a cloud it lands inside. What it can
    // do is step clean over one. The shape volume's finest features are 100 to
    // 260 m across (uCloudBaseTile 4200 through worley at 4/8/16 cells, and a
    // second octave at 2.63x on top), and at 3x a fine step capped at 300 m
    // the probe interval reached 900 m. Everything narrower than that was
    // present or absent depending on where the grid happened to fall, and
    // since the grid's phase is set by t0 -- which varies smoothly down the
    // screen -- whole rows dropped the same feature together. That was the
    // horizontal comb-teeth in every dusk frame.
    //
    // 2.0 halves the window. MISS_MAX has to stay strictly above the ratio for
    // the reason written at its declaration, and 6 > 2 comfortably.
    float coarse = fine * 2.0;
    vec3 sp = uCamPos + rd * t;
    float alt = length(P + rd * t) - ATM_PLANET_R;
    vec3 q = vec3(sp.x, alt, sp.z);

    // --- empty space skipping -------------------------------------------
    if (miss >= MISS_MAX) {
      gCloudLod = clamp(log2(1.0 + t * 0.000045), 0.0, 3.0);
      if (cloudDensity(q, 0.0) + cloudVirga(q) <= 0.0) { t += coarse; continue; }
      t = max(t0, t - coarse);            // back up and re-enter at full rate
      miss = 0;
      continue;
    }

    float step = fine;
    // Detail LOD: the 900 m erosion octave is finer than a pixel long before
    // the cloud stops being visible, and at half resolution it turns distant
    // banks into a blocky popcorn field. Fading it out lets far cloud resolve
    // as smooth mass — and below the cut the erosion fetch is skipped entirely.
    float detFade = clamp(1.45 - t * 0.000048, 0.0, 1.0);
    // Explicit weather-map LOD, in place of the undefined implicit derivative.
    // A weather texel is 105 m and a march pixel subtends about 0.002 rad, so
    // the two are the same size only at ~50 km; the ramp is set so the map is
    // read at full detail across everything the camera can actually resolve and
    // only softens beyond the far horizon, where the step length rather than
    // the pixel is what needs band limiting.
    gCloudLod = clamp(log2(1.0 + t * 0.000045), 0.0, 3.0);
    float d = cloudDensity(q, detFade);
    float vd = cloudVirga(q);

    // Two different thresholds, on purpose, and they used to be one.
    //
    // The skip probe treats anything above *zero* as cloud. The fine march
    // treated anything below 0.0004 as a miss, and six consecutive misses send
    // the ray back to skipping -- which then advances two coarse steps and can
    // land beyond the cloud entirely, at a point the probe also reads as
    // empty. The cloud is then gone for that ray and only that ray. Whether it
    // happens depends on the sampling phase, so it fires on scattered columns
    // and leaves the vertical drips and torn edges that the dusk frames show
    // hanging off every large cumulus. It is the same failure the MISS_MAX
    // comment above describes, arriving through a threshold rather than
    // through a ratio.
    //
    // So: the miss counter now asks the same question the probe asks, and the
    // 0.0004 threshold is kept only for the lighting, which is what it was
    // actually there to guard -- a sample that thin contributes nothing and
    // does not deserve a light march.
    if (d + vd > 0.0) miss = 0; else miss++;
    if (d + vd > 0.0004) {
      float hf = clamp((alt - uCloudBottom) / max(1.0, uCloudTop - uCloudBottom), 0.0, 1.0);

      // --- sun energy with a 3 octave multiple scattering approximation ---
      // deep inside the cloud the light march no longer changes the result
      float tau = tr > 0.06 ? cloudLightOpticalDepth(q, uSunDir, 1.0) : 8.0;
      float a = 1.0, b = 1.0, c = 1.0;
      float energy = 0.0;
      for (int o = 0; o < 3; o++) {
        // later octaves have been scattered more, so they relax to isotropic
        energy += a * exp(-tau * b) * mix(1.0, phase, c);
        a *= 0.52; b *= 0.55; c *= 0.62;
      }
      // Diffusion floor: the term the octave sum cannot reach.
      //
      // Every octave above is an exponential in tau, so the whole sum is
      // effectively zero once the light march reports the twelve or more
      // optical depths a real deck has — 0.3% of the incident sun at tau = 12.
      // But a thick cloud is a *diffuser*, not a blocker: two-stream similarity
      // gives a diffuse transmittance of 1/(1 + 0.75*tau*(1-g)), which for the
      // g = 0.85 of water droplets is 0.4 at tau = 12, a hundred times what the
      // sum returns. That gap is why the underside of any optically thick cloud
      // rendered black — a midday overcast base is *pale grey*, and it is pale
      // grey precisely because of the light that reaches it after dozens of
      // scattering events. Isotropic on purpose: light that has scattered that
      // many times has forgotten which way the sun is.
      energy += uCloudMS / (1.0 + tau * 0.34);
      energy *= uCloudSunGain;
      // powder: darkened cloud edges facing the light
      float powder = 1.0 - exp(-d * 42.0);
      vec3 sunL = sunRad * energy * mix(1.0, powder * 2.0, 0.42);
      // Silver lining: a thin, sunlit rim seen against the light scatters
      // forward hard, and the 3-octave sum cannot reach it because it is a
      // *single* scattering event through very little cloud. This is the term
      // that makes a backlit bank blaze along its edge.
      sunL += sunRad * uSilver * min(phase, 4.5) * exp(-tau * 3.0) * (1.0 - powder);

      vec3 moonL = vec3(0.0);
      if (uMoonLight > 0.0001 && tr > 0.12) {
        float tauM = cloudLightOpticalDepth(q, uMoonDir, 1.0);
        moonL = moonRad * exp(-tauM * 0.8) * uCloudSunGain * (0.28 + 0.34 * phaseM);
      }

      // Sky occlusion sculpts the underside. Without it an optically thick
      // deck — everything the camera can see of a storm — is one flat value.
      float occ = tr > 0.10 ? cloudSkyOcclusion(q) : 0.22;
      occ = mix(1.0, occ, uBaseShade);
      vec3 amb = mix(skyHz * 0.55, skyUp, hf) * uAmbientBoost
               * (0.22 + 0.78 * hf) * (0.18 + 0.82 * occ);

      // Roll the sun highlight off. A thin cloud edge between the camera and a
      // low sun genuinely is blinding, but an unbounded radiance here feeds
      // bloom and the god-ray pass until the entire frame prints white — which
      // is what happened to every low-sun shot once the deck actually had
      // clouds in it. A soft knee keeps the midtones exact and only bends the
      // top end.
      float pk = max(max(sunL.r, sunL.g), sunL.b);
      sunL *= uCloudMaxRad / (uCloudMaxRad + pk);

      vec3 S = (sunL + moonL + amb) * d;
      // Falling rain scatters flat and forward, but it hangs *under* the deck
      // and is therefore in its shadow: a shaft is a dark grey column, not a
      // luminous one. Lighting it at open-sky radiance (what it used to do)
      // laid a pale veil over the whole lower sky and buried the deck behind
      // it, because at shallow angles the shaft path is kilometres long.
      if (vd > 0.0) {
        S += mix(skyHz, skyUp, 0.35) * uAmbientBoost * (0.34 + 0.30 * phase) * vd;
      }

      float dd = d + vd;
      float sampleTr = exp(-dd * step);
      scat += tr * (S / max(dd, 1e-6)) * (1.0 - sampleTr);
      float w = (1.0 - sampleTr) * tr;
      meanT += t * w;
      wsum += w;
      tr *= sampleTr;
    }
    t += step;
  }

  // aerial perspective: distant banks wash into the horizon colour
  float dist = wsum > 1e-5 ? meanT / wsum : t0;
  vec3 haze = atmSkyRadiance(uSkyLut, rCam, rd, uSunDir) * uSunIntensity * uSkyDim;
  float f = 1.0 - exp(-dist * uCloudHaze);
  scat = mix(scat, haze * (1.0 - tr), f);

  gl_FragColor = vec4(max(scat, 0.0), clamp(tr, 0.0, 1.0));
}
`;

/** Top-down bake of the light transmittance reaching the ground. */
const SHADOW_FRAG = /* glsl */`
precision highp float;
precision highp sampler3D;
${ATMO_COMMON}
${CLOUD_COMMON}
uniform vec3  uSunDir;
uniform float uShadowTile;
uniform float uShadowStrength;
uniform float uShadowFieldScale;
varying vec2 vUv;
void main() {
  // The cloud field has kilometre scale features; magnify it so several shadow
  // patches fit inside the playable world instead of one giant blob. Everything
  // here happens in that magnified field space, including the slant of the sun
  // ray, so the projection stays self consistent.
  vec2 xz = (vUv - 0.5) * uShadowTile * uShadowFieldScale;
  vec3 d = uSunDir;
  d = normalize(vec3(d.x, max(abs(d.y), 0.16), d.z));
  // Keep the slant well under one cloud feature: a physically sized slant
  // smears the whole vertical march into a flat average and the patches vanish.
  vec2 slope = clamp(d.xz / d.y, vec2(-0.55), vec2(0.55));

  float dt = (uCloudTop - uCloudBottom) / 12.0;
  // Four laterally offset columns, averaged. The tile has no mipmaps on
  // purpose (grazing ground views collapse to the coarsest level and lose the
  // shadows entirely), so the bake itself has to be band limited or the patches
  // alias into a fixed checkerboard across the whole midground.
  float blur = uShadowTile * uShadowFieldScale * 0.0016;
  const vec2 O[4] = vec2[4](vec2(-0.6, -0.3), vec2(0.5, -0.7), vec2(0.7, 0.5), vec2(-0.4, 0.6));
  float T = 0.0;
  for (int k = 0; k < 4; k++) {
    vec2 o = xz + O[k] * blur;
    float tau = 0.0;
    for (int i = 0; i < 12; i++) {
      float alt = uCloudBottom + (float(i) + 0.5) * dt;
      vec2 p = o + slope * alt;
      tau += cloudDensity(vec3(p.x, alt, p.y), 0.0) * dt;
    }
    T += exp(-tau * uShadowStrength);
  }
  T *= 0.25;
  gl_FragColor = vec4(T, T, T, 1.0);
}
`;

/**
 * Volumetric cloud system: a half-res screen-space raymarch that the sky dome
 * composites, plus a tiling ground-shadow bake that every lit surface samples.
 */
export class Clouds {
  /** The original `render`, while `Dungeons` has the sky stubbed out. */
  __dungeonStub?: Clouds['render'] | null;
  renderer!: THREE.WebGLRenderer;
  textures!: Record<string, THREE.Data3DTexture | THREE.DataTexture>;
  _marchQuad!: FullScreenQuad;
  _shadowQuad!: FullScreenQuad;
  marchUniforms!: Record<string, THREE.IUniform>;
  rt!: THREE.WebGLRenderTarget;
  shadowRT!: THREE.WebGLRenderTarget;
  shadowUniforms!: Record<string, THREE.IUniform>;
  /** The atmosphere's block, so the march and the sky agree on the weather. */
  shared!: AtmosphereUniforms;
  /**
   * @param shared shared cloud uniform objects (see Sky.ts)
   */
  constructor(renderer: THREE.WebGLRenderer, shared: AtmosphereUniforms) {
    this.renderer = renderer;
    this.shared = shared;


    const tex = buildCloudTextures({ baseSize: 64, detailSize: 48, weatherSize: 512, seed: 1337 });
    shared.uCloudBase.value = tex.base;
    shared.uCloudDetail.value = tex.detail;
    shared.uCloudWeather.value = tex.weather;
    this.textures = tex;

    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, generateMipmaps: false,
      colorSpace: THREE.LinearSRGBColorSpace,
    });

    // 512, not 1024. The bake is four laterally offset columns of twelve
    // `cloudDensity` samples per texel — 48 volume evaluations — so it is by
    // some way the most expensive thing in the sky, and it lands on one frame
    // in four as a spike rather than as a cost. What it produces is a
    // kilometre-scale soft shadow field with no edge finer than a cloud, and a
    // quarter of the texels carry that exactly as well for a quarter of the price.
    this.shadowRT = new THREE.WebGLRenderTarget(512, 512, {
      type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
      // no mipmaps: the ground is seen at grazing angles, and mip selection
      // there collapses to the coarsest level and flattens the shadows away
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
      depthBuffer: false, generateMipmaps: false,
      colorSpace: THREE.LinearSRGBColorSpace,
    });


    const marchUniforms = Object.assign({}, shared, {
      uInvViewProj: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uMaxDist: { value: 46000 },
      uAmbientBoost: { value: 1.15 },
      // energy the 3-octave multiple-scattering sum has to make up for; tuned
      // so a thick, fully lit midday cumulus reads a little brighter than
      // sunlit ground, which is what puts the eye on the sky
      uCloudSunGain: { value: 0.42 },
      uPhaseClamp: { value: new THREE.Vector2(0.85, 5.2) },
      // single-scattering rim energy: the FFXV silver lining
      uSilver: { value: 0.10 },
      // how hard the sky-occlusion term sculpts the underside of the deck
      uBaseShade: { value: 0.65 },
      // soft ceiling on sunlit cloud radiance, in scene-linear units
      uCloudMaxRad: { value: 3.2 },
      // amplitude of the high-order (diffuse) scattering floor
      uCloudMS: { value: 0.62 },
      uFrame: { value: 0 },
      uJitter: { value: new THREE.Vector2() },
    });
    this.marchUniforms = marchUniforms;
    this._marchQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: CLOUD_FRAG,
      uniforms: marchUniforms, depthTest: false, depthWrite: false,
    }));

    const shadowUniforms = shared;
    this.shadowUniforms = shadowUniforms;
    this._shadowQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: SHADOW_FRAG,
      uniforms: shadowUniforms, depthTest: false, depthWrite: false,
    }));
  }

  get texture() { return this.rt.texture; }
  get shadowTexture() { return this.shadowRT.texture; }

  setSize(w: number, h: number) {
    const sw = Math.max(2, Math.floor(w * MARCH_SCALE));
    const sh = Math.max(2, Math.floor(h * MARCH_SCALE));
    if (sw !== this.rt.width || sh !== this.rt.height) this.rt.setSize(sw, sh);
    // The sky dome's upsample needs the march target's texel size. It used to
    // recompute it from `uResolution * 0.45` -- a second copy of MARCH_SCALE
    // living in a different file, which is exactly the kind of constant that
    // drifts silently the first time the march resolution is touched.
    this.shared.uCloudTexel.value.set(1 / sw, 1 / sh);
  }

  /** Raymarch the layer for the current camera. */
  render(camera: THREE.PerspectiveCamera, frame: number) {
    const u = this.marchUniforms;
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.uInvViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
    u.uFrame.value = frame % 64;
    const h = HALTON[frame % HALTON.length];
    u.uJitter.value.set((h[0] - 0.5) / this.rt.width, (h[1] - 0.5) / this.rt.height);
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    this._marchQuad.render(r);
    r.setRenderTarget(prev);
  }

  /** Re-bake the ground shadow tile (cheap; every few frames is plenty). */
  renderShadow() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.shadowRT);
    this._shadowQuad.render(r);
    r.setRenderTarget(prev);
  }

  dispose() {
    this.rt.dispose();
    this.shadowRT.dispose();
    this._marchQuad.dispose();
    this._shadowQuad.dispose();
    this.textures.base.dispose();
    this.textures.detail.dispose();
    this.textures.weather.dispose();
  }
}

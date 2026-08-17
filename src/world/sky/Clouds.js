import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ATMO_COMMON } from '../../shaders/atmosphere.glsl.js';
import { CLOUD_COMMON } from '../../shaders/clouds.glsl.js';
import { buildCloudTextures } from './CloudTextures.js';

const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

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
uniform float uSilver;
uniform float uBaseShade;
uniform float uCloudMaxRad;
varying vec2 vUv;

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
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
  // Partial jitter: a full [0,1) offset is unbiased but its variance shows as
  // a diagonal hatch once the half-res buffer is upsampled. Half the span
  // halves the noise, and what banding it trades in sits at half the step
  // frequency, which the composite's tap filter removes.
  float jitter = 0.25 + 0.5 * atmDither(gl_FragCoord.xy + uFrame * 3.11);
  float t = t0;
  vec3 scat = vec3(0.0);
  float tr = 1.0;
  float meanT = 0.0, wsum = 0.0;
  int miss = MISS_MAX;
  float fine = clamp(t0 * 0.020, 40.0, 260.0);
  t += fine * jitter;

  for (int i = 0; i < 160; i++) {
    if (tr < 0.008 || t > t1) break;
    fine = clamp(t * 0.020, 40.0, 260.0);
    float coarse = fine * 3.0;
    vec3 sp = uCamPos + rd * t;
    float alt = length(P + rd * t) - ATM_PLANET_R;
    vec3 q = vec3(sp.x, alt, sp.z);

    // --- empty space skipping -------------------------------------------
    if (miss >= MISS_MAX) {
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
    float d = cloudDensity(q, detFade);
    float vd = cloudVirga(q);

    if (d + vd > 0.0004) {
      miss = 0;
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
    } else {
      miss++;
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
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {Object} shared shared cloud uniform objects (see Sky.js)
   */
  constructor(renderer, shared) {
    this.renderer = renderer;
    this.shared = shared;

    const tex = buildCloudTextures({ baseSize: 64, detailSize: 48, weatherSize: 256, seed: 1337 });
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

    this.shadowRT = new THREE.WebGLRenderTarget(1024, 1024, {
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
      uFrame: { value: 0 },
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

  setSize(w, h) {
    const sw = Math.max(2, Math.floor(w * 0.45));
    const sh = Math.max(2, Math.floor(h * 0.45));
    if (sw !== this.rt.width || sh !== this.rt.height) this.rt.setSize(sw, sh);
  }

  /** Raymarch the layer for the current camera. */
  render(camera, frame) {
    const u = this.marchUniforms;
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.uInvViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
    u.uFrame.value = frame % 64;
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

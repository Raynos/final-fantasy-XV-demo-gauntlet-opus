import * as THREE from 'three';
import { FilterPass, fsMaterial } from '../../engine/postfx/Fx.js';
import { CHUNK_DEPTH, CHUNK_HASH } from '../../shaders/post/common.js';

/**
 * The weather volume: one screen-space ray march that supplies everything the
 * air between the camera and the world is doing.
 *
 *   - ground fog that *pools in valleys* — the slab has a world-space ceiling,
 *     so low ground drowns in it while ridges and mesas stand clear of it,
 *   - blowing dust sheets hugging the terrain, advected by the wind vector,
 *   - rain squalls: travelling curtains of drizzle that grey out whole
 *     stretches of the basin and give a storm its depth,
 *   - the lightning flash and its brief in-scattering punch,
 *   - a wet-lens layer: refracting droplets and run-off streaks on the glass.
 *
 * Density is evaluated against the terrain heightfield (the same texture the
 * terrain shader displaces from), so nothing ever floats above a ridge line.
 */

const VOLUME_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform sampler2D uHeightTex;
uniform sampler2D uFarHeightTex;
uniform vec4  uField;          // half, cell, N, blendOut
uniform vec4  uFarP;
uniform mat4  uInvViewProj;
uniform vec3  uCamPos;
uniform float uNear, uFar;
uniform float uTime;
uniform vec2  uWind;
uniform vec3  uSunDir;
uniform vec3  uFogColor;       // ambient (shadowed) fog colour, scene-linear
uniform vec3  uFogSun;         // additional in-scatter toward the sun
uniform vec3  uDustColor;
uniform vec4  uFogP;           // density, ceiling Y, slab softness, maxDist
uniform vec4  uDustP;          // amount, thickness, scale, -
uniform vec4  uRainP;          // haze density, squall amount, squall scale, -
uniform vec4  uScudP;          // density, centre Y, half thickness, XZ scale
uniform vec4  uLens;           // droplet amount, streak amount, flash, blur
uniform vec3  uFlashColor;
uniform vec2  uRes;
varying vec2 vUv;

${CHUNK_DEPTH}
${CHUNK_HASH}

vec2 tf_uv(vec2 p, vec4 P) { return ((p + P.x) / P.y + 0.5) / P.z; }
float tf_height(vec2 p) {
  return (max(abs(p.x), abs(p.y)) >= uField.w)
    ? texture2D(uFarHeightTex, tf_uv(p, uFarP)).r
    : texture2D(uHeightTex, tf_uv(p, uField)).r;
}

float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec2 uv = (i.xy + vec2(37.0, 17.0) * i.z) + f.xy;
  float a = hash12(uv + 0.5);
  float b = hash12(uv + vec2(1.0, 0.0) + 0.5);
  float c = hash12(uv + vec2(0.0, 1.0) + 0.5);
  float d = hash12(uv + vec2(1.0, 1.0) + 0.5);
  float n0 = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  vec2 uv2 = uv + vec2(37.0, 17.0);
  float a2 = hash12(uv2 + 0.5);
  float b2 = hash12(uv2 + vec2(1.0, 0.0) + 0.5);
  float c2 = hash12(uv2 + vec2(0.0, 1.0) + 0.5);
  float d2 = hash12(uv2 + vec2(1.0, 1.0) + 0.5);
  float n1 = mix(mix(a2, b2, f.x), mix(c2, d2, f.x), f.y);
  return mix(n0, n1, f.z);
}

float fbm3(vec3 p) {
  return 0.55 * vnoise(p) + 0.28 * vnoise(p * 2.03 + 11.0) + 0.17 * vnoise(p * 4.11 - 7.0);
}

void main() {
  vec3 src = texture2D(tDiffuse, vUv).rgb;
  float d = texture2D(tDepth, vUv).x;

  vec3 wpos = worldFromDepth(vUv, d, uInvViewProj);
  vec3 ray = wpos - uCamPos;
  float sceneDist = length(ray);
  vec3 dir = sceneDist > 1e-4 ? ray / sceneDist : vec3(0.0, 0.0, -1.0);
  // A sky ray needs enough leash for the storm base to build, but not so much
  // that the weather layers integrate into an opaque grey lid over the whole
  // sky — the cloud raymarch owns everything above the scud, and washing it out
  // here is what turned a storm into a flat gradient. The leash shortens as the
  // ray climbs, because a steep ray leaves the low weather almost immediately.
  float climb = clamp(dir.y, 0.0, 1.0);
  float sky = d >= 0.9999 ? 1.0 : 0.0;
  float skyVeil = sky * smoothstep(0.005, 0.09, climb);
  float reach = sky > 0.5 ? uFogP.w * mix(1.25, 0.42, smoothstep(0.02, 0.35, climb)) : uFogP.w;
  if (sky > 0.5) sceneDist = reach;
  float maxD = min(sceneDist, reach);

  float wxAmt = uFogP.x + uDustP.x + uRainP.x + uRainP.y + uScudP.x;
  vec3 col = src;

  if (wxAmt > 0.0005 && maxD > 0.6) {
    const int STEPS = 36;
    float jitter = ign(gl_FragCoord.xy) * 0.85;
    float t = 0.0;
    float T = 1.0;
    vec3 scat = vec3(0.0);

    // forward scattering: the fog glows where you look toward the light
    float cosT = dot(dir, uSunDir);
    float hg = (1.0 - 0.62 * 0.62) / pow(1.0 + 0.62 * 0.62 - 2.0 * 0.62 * cosT, 1.5) * 0.25;

    vec2 windOff = uWind * uTime;

    for (int i = 0; i < STEPS; i++) {
      // quadratic step distribution: dense sampling near the camera where the
      // fog silhouettes foreground rocks, coarse out at the horizon
      float f0 = (float(i) + jitter) / float(STEPS);
      float f1 = (float(i) + 1.0 + jitter) / float(STEPS);
      float t0 = maxD * f0 * sqrt(f0);
      float t1 = maxD * f1 * sqrt(f1);
      float dt = t1 - t0;
      if (dt <= 0.0) continue;
      vec3 p = uCamPos + dir * (t0 + dt * 0.5);

      float gh = tf_height(p.xz);
      float above = max(p.y - gh, 0.0);

      // --- valley fog: a slab with a world ceiling, so it drowns low ground --
      float slab = 1.0 - smoothstep(uFogP.y - uFogP.z, uFogP.y + uFogP.z * 0.35, p.y);
      float lowland = 1.0 - smoothstep(uFogP.y - 26.0, uFogP.y + 34.0, gh);
      float wisps = 0.42 + 0.86 * fbm3(vec3(p.xz * 0.0075 + windOff * 0.012, p.y * 0.012 + uTime * 0.013));
      float fog = uFogP.x * slab * mix(0.30, 1.0, lowland) * wisps
                * exp(-above * 0.016);

      // --- dust: a low sheet torn into streaks and dragged downwind ----------
      float dustH = exp(-above / max(uDustP.y, 1.0));
      vec2 dp = p.xz * uDustP.z + windOff * 0.10;
      float dustN = fbm3(vec3(dp.x * 0.35, dp.y, p.y * 0.006 + uTime * 0.02));
      float dust = uDustP.x * dustH * smoothstep(0.28, 0.86, dustN) * mix(0.35, 1.0, 1.0 - smoothstep(uFogP.y + 60.0, uFogP.y + 190.0, gh));

      // --- rain: flat haze plus travelling squall curtains -------------------
      float squall = fbm3(vec3(p.xz * uRainP.z + windOff * 0.05, uTime * 0.05));
      float rain = uRainP.x + uRainP.y * smoothstep(0.46, 0.70, squall);
      // Rain lives in the lowest kilometre. The old 625 m scale height left a
      // near-horizontal sky ray integrating kilometres of curtain and painted
      // the whole sky pale — which is what buried the storm's cloud deck.
      rain *= exp(-above * 0.0034);

      // --- scud: ragged low cloud torn off the storm base -------------------
      // Dark, fast, and *below* the cloud deck, so it fills the empty band of
      // sky between the ranges and the overcast instead of leaving a flat wash.
      // The gate is deliberately narrow: with a wide one the layer is
      // continuous along any near-horizontal ray and stops being torn cloud —
      // it becomes an even grey veil over the whole sky, which is exactly what
      // was flattening the storm frame.
      float scudBand = smoothstep(uScudP.y - uScudP.z, uScudP.y - uScudP.z * 0.35, p.y)
                     * (1.0 - smoothstep(uScudP.y + uScudP.z * 0.4, uScudP.y + uScudP.z * 1.5, p.y));
      float scudN = fbm3(vec3(p.xz * uScudP.w + windOff * 0.22, p.y * 0.0018 + uTime * 0.03));
      float scud = uScudP.x * scudBand * smoothstep(0.52, 0.70, scudN);

      // A ray that reaches the sky must not be *painted over* by the weather.
      // At storm strength the squall and scud layers integrate to an optical
      // depth of ~5 along any near-horizontal sky ray, which means every sky
      // pixel ends up as one flat in-scattered grey and the cloud deck behind
      // it is thrown away entirely — the single biggest reason a storm rendered
      // as a featureless gradient. Curtains belong over the land, where the
      // depth cue is worth having; over the sky they stay a thin veil.
      rain *= mix(1.0, 0.16, skyVeil);
      scud *= mix(1.0, 0.60, skyVeil);

      float dens = fog + dust + rain + scud;
      if (dens > 1e-5) {
        // falling water scatters far more light than the fog it hangs in, so a
        // squall curtain reads as a pale sheet against the dark basin
        vec3 wetCol = mix(uFogColor, uFogColor * 1.32 + 0.002, clamp(rain / max(dens, 1e-4), 0.0, 1.0));
        vec3 c = mix(wetCol, uDustColor, clamp(dust / max(dens, 1e-4), 0.0, 1.0));
        c = mix(c, uFogColor * 0.34, clamp(scud / max(dens, 1e-4), 0.0, 1.0));
        c += uFogSun * hg;
        float a = 1.0 - exp(-dens * dt);
        scat += c * a * T;
        T *= 1.0 - a;
      }
      if (T < 0.008) break;
    }
    // Lightning lights the *rain*, not the lens: the flash is a source inside
    // the volume, so the curtains and the fog blaze and the clear air does not.
    scat *= 1.0 + uLens.z * 0.42;
    scat += uFlashColor * uLens.z * 0.030 * (1.0 - T);
    col = src * T + scat;
  }

  // a whisper of the flash on everything else, so the frame lifts as one
  if (uLens.z > 0.0005) col += uFlashColor * uLens.z * 0.004;

  // --- wet lens -------------------------------------------------------------
  if (uLens.x > 0.001) {
    float aspect = uRes.x / max(uRes.y, 1.0);
    vec2 q = vec2(vUv.x * aspect, vUv.y);

    // Static droplet field: cells with one lens each, refracting the frame.
    //
    // The refraction offset is the whole trick and it has to be *small*. At
    // 0.055 of the frame a drop no longer showed a squashed image of what is
    // behind it, it showed a piece of somewhere else entirely — which over a
    // ridge line meant every drop within about 5% of the horizon sampled dark
    // terrain and painted a row of black dots across the sky. Real glass beads
    // displace a fraction of a degree; keep the offset near a drop's own size.
    vec2 g = q * 38.0;
    vec2 gi = floor(g), gf = fract(g) - 0.5;
    vec3 acc = vec3(0.0);
    float cover = 0.0;
    for (int oy = -1; oy <= 1; oy++) {
      for (int ox = -1; ox <= 1; ox++) {
        vec2 o = vec2(float(ox), float(oy));
        vec2 id = gi + o;
        vec2 rnd = hash22(id);
        // most cells are dry glass; a beaded lens is not a honeycomb
        float pick = hash12(id + 5.0);
        if (pick > 0.30) continue;
        // wide size spread: a few fat beads among many pinpricks reads as
        // water on glass, one uniform size reads as a texture
        float r = 0.045 + 0.26 * pick * pick * 11.0 * rnd.x;
        r = clamp(r, 0.04, 0.34);
        // drops crawl down the glass, slower ones lingering
        float fall = fract(rnd.y + uTime * (0.018 + 0.05 * rnd.x) * smoothstep(0.06, 0.20, r));
        vec2 cpos = o + vec2(rnd.x - 0.5, (1.0 - fall) - 0.5) * 0.9;
        vec2 dv = gf - cpos;
        float dd = length(dv);
        float m = smoothstep(r, r * 0.62, dd);
        if (m > 0.0) {
          // a bead is a tiny fisheye: it inverts and magnifies what is right
          // behind it, so the displacement scales with the drop, not the frame
          vec2 refr = dv * (r * 0.030 / max(r, 1e-3)) * (1.0 + 2.2 * dd / max(r, 1e-3));
          refr.x /= aspect;
          vec3 s = texture2D(tDiffuse, clamp(vUv - refr, vec2(0.002), vec2(0.998))).rgb;
          // rim brightening — the meniscus catches the sky
          float rim = smoothstep(r * 0.62, r, dd) * m;
          acc += (s * 1.10 + rim * 0.05) * m;
          cover += m;
        }
      }
    }
    if (cover > 0.0) {
      acc /= cover;
      float amt = clamp(cover, 0.0, 1.0) * uLens.x;
      // droplets thin out toward the centre of frame
      amt *= mix(1.0, 0.35, smoothstep(0.65, 0.0, length(vUv - 0.5) * 2.0));
      // Apply the refraction as a *displacement* of the frame, not a
      // replacement for it: tDiffuse is the pre-volume image, so blending it in
      // directly would punch un-fogged holes through the weather.
      col += (acc - src) * amt;
    }

    // vertical run-off streaks near the frame edges
    float sx = q.x * 40.0;
    float lane = floor(sx);
    float lr = hash12(vec2(lane, 3.0));
    float streak = smoothstep(0.42, 0.05, abs(fract(sx) - 0.5))
                 * smoothstep(0.55, 1.0, hash12(vec2(lane, 7.0)))
                 * (0.35 + 0.65 * fract(vUv.y * (1.4 + lr) + uTime * (0.05 + 0.12 * lr)));
    streak *= uLens.y * smoothstep(0.30, 0.95, length(vUv - 0.5) * 2.0);
    if (streak > 0.001) {
      vec3 sm = texture2D(tDiffuse, clamp(vUv + vec2(0.0, 0.005 * streak), vec2(0.001), vec2(0.999))).rgb;
      col += (sm - src) * clamp(streak * 0.5, 0.0, 0.5);
    }
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export class VolumePass extends FilterPass {
  /** @param {import('../../engine/PostFX.js').PostFX} fx */
  constructor(fx) {
    super(fx);
    this.material = fsMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uHeightTex: { value: null },
        uFarHeightTex: { value: null },
        uField: { value: new THREE.Vector4(1, 1, 1, 1) },
        uFarP: { value: new THREE.Vector4(1, 1, 1, 1) },
        uInvViewProj: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uNear: { value: 0.15 },
        uFar: { value: 6000 },
        uTime: { value: 0 },
        uWind: { value: new THREE.Vector2() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uFogColor: { value: new THREE.Vector3(0.05, 0.06, 0.08) },
        uFogSun: { value: new THREE.Vector3(0, 0, 0) },
        uDustColor: { value: new THREE.Vector3(0.09, 0.06, 0.04) },
        uFogP: { value: new THREE.Vector4(0, 30, 14, 2600) },
        uDustP: { value: new THREE.Vector4(0, 22, 0.004, 0) },
        uRainP: { value: new THREE.Vector4(0, 0, 0.0016, 0) },
        uScudP: { value: new THREE.Vector4(0, 420, 260, 0.0016) },
        uLens: { value: new THREE.Vector4(0, 0, 0, 0) },
        uFlashColor: { value: new THREE.Vector3(0.7, 0.8, 1.0) },
        uRes: { value: new THREE.Vector2(1600, 900) },
      },
      fragmentShader: VOLUME_FRAG,
    });
    this.enabled = true;
  }

  beforeRender() {
    const fx = this.fx;
    const u = this.material.uniforms;
    u.tDepth.value = fx.rtScene.depthTexture;
    u.uInvViewProj.value.copy(fx.invViewProj);
    u.uCamPos.value.setFromMatrixPosition(fx.camera.matrixWorld);
    u.uNear.value = fx.camera.near;
    u.uFar.value = fx.camera.far;
    u.uRes.value.set(fx.width, fx.height);
  }

  /** Nothing to do when every channel is off — skip the march entirely. */
  get idle() {
    const u = this.material.uniforms;
    return u.uFogP.value.x + u.uDustP.value.x + u.uRainP.value.x + u.uRainP.value.y
      + u.uScudP.value.x + u.uLens.value.x + u.uLens.value.z < 0.0008;
  }
}

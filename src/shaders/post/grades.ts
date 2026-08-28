import * as THREE from 'three';

/**
 * Colour-grade presets and the procedural 3D-LUT baker.
 *
 * The per-frame half of the grade (exposure, white balance, contrast pivot,
 * saturation, channel mixer, lift/gamma/gain, vignette) runs in the shader in
 * scene-linear. The *look* half — the part that is expensive and non-linear —
 * is baked once per preset into a 32x32x32 cube stored as a 1024x32 strip and
 * applied after tone mapping, exactly like a film print emulation.
 */

/**
 */

/**
 * The non-linear half of a grade, baked once into the 32^3 LUT by `bakeLut`.
 * Every field is required: `bakeLut` reads all of them with no default, and a
 * missing one would multiply a texel by `undefined` and print a NaN.
 */
export interface GradeLook {
  /** Lifted black floor, so the deepest shadow never lands on zero. */
  toe: number;
  /** Soft-shoulder blend toward a smoothstep roll-off, 0..1. */
  shoulder: number;
  /** Display-referred pivot the S-curve turns about. */
  pivot: number;
  contrast: number;
  /** Per-range rgb tints, weighted by luma. */
  shadowTint: number[];
  midTint: number[];
  highTint: number[];
  /**
   * 0..1: how far `highTint` is gated on the pixel already being warm.
   *
   * FFXV's split-tone is a statement about *light*, not about pixels: sunlit
   * surfaces go warm, shade goes teal. Applied flat, a warm highlight tint
   * also lands on the two brightest things in an outdoor frame that are not
   * lit surfaces at all — the sky and the cloud deck — and warms them, which
   * is the opposite of what the reference does. `duscae-plains-lake-01`
   * samples its cumulus at #b1ccde (R-B -45) over a sky at #5ea0c9, and the
   * FFXV-field corpus reads hi(R-B) -13.5 against our +18 for exactly this
   * reason.
   *
   * At 1.0 the tint's departure from neutral is scaled by how warm the pixel
   * already is, so it saturates warmth that is there rather than inventing it.
   * At 0 it applies flat, which is right for `night` and `storm`, whose
   * highTint is already neutral-to-cool and would be cancelled by the gate.
   */
  highGate: number;
  /** Overall saturation, and its shadow / highlight weighting. */
  sat: number;
  satShadow: number;
  satHigh: number;
  /** Row-major 3x3 channel mixer, applied in linear. */
  mixer: number[];
  /**
   * Flashed-film print fade: how far toward `fadeTint` the **shadows** go.
   *
   * Weighted by the shadow weight in `bakeLut`, never applied flat. Applied
   * flat it is a highlight cap — see the baker for the trace — and a grade
   * whose white cannot reach 255 reads veiled no matter what else is right.
   */
  fade: number;
  fadeTint: number[];
}

/** One colour-grade preset, as consumed by the LUT builder and the grade pass. */
export interface GradePreset {
  /** White balance [temperature, tint] in -1..1. */
  balance: number[];
  /** Contrast around scene-linear mid grey. */
  contrast: number;
  saturation: number;
  /** Scene-linear shadow lift (rgb). */
  lift: number[];
  /** Scene-linear highlight gain (rgb). */
  gain: number[];
  /** Lens falloff strength. */
  vignette: number;
  /** Lateral chromatic aberration. */
  chroma: number;
  /** Film grain amplitude. */
  grain: number;
  /** Auto-exposure key value (target luminance). */
  key: number;
  /**
   * Film bleach, as `[knee, end, amount]` in **scene-linear** luminance:
   * how far a highlight is pulled toward neutral before the tone map.
   *
   * Photographic highlights go white; ours drove to their brightest primary,
   * measured at golden hour as a +52.0 highlight R-B against a +7.6 reference
   * median. Ablation put three quarters of that in the HDR buffer rather than
   * the grade, so it cannot be fixed by a tint in `look` -- see
   * `bleachHighlights` in `GradePass.ts`.
   *
   * Below `knee` it is identity, so this never touches mids or shadows.
   */
  bleach: number[];
  /** Parameters baked into the LUT. */
  look: GradeLook;
}

export const GRADES: Record<string, GradePreset> = {
  // Flat, neutral daylight. Slightly cool shadows, sun-bleached highlights.
  day: {
    balance: [0.04, 0.0],
    // Daylight was printing into about half a console frame — nothing near
    // white, nothing near black — which reads as noon through a scrim. The
    // range comes back from a steeper log contrast, a much shorter toe and a
    // higher shoulder, not from saturation.
    contrast: 1.13, saturation: 1.02,
    lift: [0.0, 0.0, 0.003], gain: [1.0, 1.0, 1.0],
    // key is the auto-exposure target middle grey, and all four presets' were
    // raised 20% on 2026-08-28 alongside the exposure meter's luminance
    // weighting (a432996). The weighting stopped a black jacket outvoting a
    // sunlit hillside four to one, which took the corpus median exposure from
    // 1.361x the Sky's published scene exposure to 0.944x -- correct in
    // consistency and 30% down in level. Measured on the eight-shot day slice
    // against FFXV-field, the level had to come back: hi230% fell 8.84 -> 2.56
    // against a reference of 6.20 and clip% 1.12 -> 0.04 against 0.50, which is
    // the "nothing in this game reaches white" failure by another road.
    vignette: 0.30, chroma: 0.7, grain: 0.020, key: 0.270,
    // Noon's key light is already near-neutral, so a light bleach is enough to
    // stop the sun disc and the brightest cloud tops taking a primary.
    bleach: [0.55, 3.4, 0.55],
    look: {
      toe: 0.012, shoulder: 0.96, pivot: 0.40, contrast: 1.21,
      // Measured negative, 2026-08-23: pulling this from [0.88,0.97,1.17] to
      // [0.95,0.99,1.08] -- most of the way to neutral -- moved the daylight
      // shadow R-B only -9.7 -> -8.8 against a +5.8 reference. Like the
      // highlight cast that produced `bleach`, our shadow coolness is in the
      // scene and not in the grade: it is the ambient probe, which is what
      // sibling-ports 3.8 exists to evaluate. Reverted rather than kept, so the
      // grade does not carry a change that bought 0.9 points of a 15-point gap
      // and cost the atmosphere lane's intent.
      shadowTint: [0.88, 0.97, 1.17], midTint: [1.0, 1.0, 0.985], highTint: [1.04, 1.0, 0.94],
      highGate: 1.0,
      sat: 0.99, satShadow: 0.84, satHigh: 0.88,
      mixer: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
      fade: 0.006, fadeTint: [0.04, 0.06, 0.11],
    },
  },

  // The FFXV signature. Warm raking light, teal shadows, creamy highlights.
  // The FFXV signature is warm raking light against *cool* shadows. The grade
  // must not warm the whole frame — the atmosphere is already pouring amber
  // inscatter into every distant surface at golden hour, so a heavy warm
  // balance on top of that collapses the image to one hue. Keep the highlights
  // warm, push the shadows further toward teal, and let the separation do the
  // work instead of the white balance.
  golden: {
    // A warm white balance *on top of* warm light is a double warm: the frame
    // has nothing cool left to oppose the key with. The balance is therefore
    // barely warm at all; the heat comes from the sun itself and the grade's
    // only job is to protect the shadow chroma. Note satShadow > 1: the teal
    // in the shadows is the load-bearing colour and must not be washed out.
    balance: [0.04, 0.0],
    contrast: 1.14, saturation: 1.0,
    lift: [0.0, 0.004, 0.022], gain: [1.0, 1.0, 1.005],
    vignette: 0.38, chroma: 1.0, grain: 0.024, key: 0.258,
    // The strongest bleach of the four, and the reason this lever exists: a
    // low amber sun drives every lit highlight toward red, and the reference's
    // golden hour keeps its hot pixels within +7.6 R-B of neutral.
    bleach: [0.42, 2.6, 0.85],
    look: {
      toe: 0.030, shoulder: 0.78, pivot: 0.39, contrast: 1.19,
      shadowTint: [0.66, 0.89, 1.42], midTint: [1.01, 1.0, 0.99], highTint: [1.10, 1.01, 0.87],
      highGate: 1.0,
      sat: 1.00, satShadow: 0.90, satHigh: 0.82,
      mixer: [1.0, 0.01, -0.01, 0.0, 1.0, 0.0, -0.02, 0.01, 1.0],
      fade: 0.012, fadeTint: [0.05, 0.08, 0.15],
    },
  },

  // Deep blue night. Low key, strong desaturation, milky moon highlights.
  night: {
    // Dark but *readable*. The toe is the black floor: it lands the deepest
    // shadow on a navy around #0a0e18 instead of on zero, so silhouettes stay
    // separable and 8-bit banding has somewhere to dither into. satShadow is
    // high on purpose — a night with grey shadows is a broken night.
    balance: [-0.20, -0.04],
    contrast: 1.06, saturation: 0.94,
    lift: [0.0, 0.004, 0.016], gain: [0.93, 0.98, 1.10],
    vignette: 0.44, chroma: 1.3, grain: 0.024, key: 0.138,
    // Night's highlights are moonlight and practicals, and the reference night
    // corpus is the *most* saturated slice we hold (76.4% against our 54.2%).
    // Bleaching it would push the wrong way, so this is deliberately off.
    bleach: [0.80, 4.0, 0.0],
    look: {
      toe: 0.055, shoulder: 0.95, pivot: 0.33, contrast: 1.10,
      shadowTint: [0.62, 0.84, 1.46], midTint: [0.84, 0.94, 1.20], highTint: [0.97, 1.0, 1.08],
      highGate: 0.0,
      sat: 0.90, satShadow: 0.86, satHigh: 0.76,
      mixer: [1.0, 0.0, 0.03, 0.0, 1.0, 0.02, 0.02, 0.0, 1.0],
      fade: 0.018, fadeTint: [0.03, 0.05, 0.14],
    },
  },

  // Overcast / storm. Cold, flat, heavy, slightly green-grey.
  storm: {
    // Not flat. A storm is the *highest* contrast weather there is: a black
    // deck over a bright break on the horizon. The old preset had contrast
    // below 1 and printed a stop up, which is the recipe for an empty field.
    balance: [-0.05, 0.05],
    contrast: 1.12, saturation: 0.82,
    lift: [0.003, 0.005, 0.011], gain: [0.95, 0.99, 1.05],
    vignette: 0.42, chroma: 0.9, grain: 0.032, key: 0.240,
    // A storm's bright break is a white hole in a black lid. Light bleach, but
    // the storm frame's real problem is that it has no bright pixels at all.
    bleach: [0.60, 3.0, 0.45],
    look: {
      toe: 0.018, shoulder: 0.94, pivot: 0.38, contrast: 1.16,
      shadowTint: [0.86, 0.97, 1.12], midTint: [0.95, 0.99, 1.02], highTint: [1.0, 1.01, 1.01],
      highGate: 0.0,
      sat: 0.86, satShadow: 0.80, satHigh: 0.80,
      mixer: [1.0, 0.0, 0.01, 0.01, 1.0, 0.01, 0.0, 0.0, 1.0],
      fade: 0.014, fadeTint: [0.05, 0.07, 0.10],
    },
  },
};

const LUT_SIZE = 32;

/**
 * How hard `GradeLook.toe` expands the shadows, per unit of `toe`.
 *
 * `toe` used to be a lift in display units and is now an expansion strength;
 * this constant is what re-scales the presets' existing numbers into the new
 * meaning without re-tuning all four by hand. See `bakeLut`.
 */
const SHADOW_SLOPE = 4.0;

function srgbToLin(c: number) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function linToSrgb(c: number) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055; }
function sat01(v: number) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/**
 * Bake one preset's `look` into a 1024x32 RGBA strip texture.
 * Deterministic and cheap (32k texels of pure arithmetic).
 *
 */
/** smoothstep, clamped, for the LUT baker. */
function smooth01(x: number, a: number, b: number) {
  const t = sat01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function bakeLut(preset: GradePreset): THREE.DataTexture {
  const L = preset.look;
  const n = LUT_SIZE;
  const w = n * n, h = n;
  const data = new Uint8Array(w * h * 4);
  const lum = [0.2126, 0.7152, 0.0722];

  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        // input is display-referred sRGB
        let c = [r / (n - 1), g / (n - 1), b / (n - 1)];

        // work in linear-ish for the tonal moves, back to sRGB for the print
        let lin = [srgbToLin(c[0]), srgbToLin(c[1]), srgbToLin(c[2])];

        // channel mixer
        const m = L.mixer;
        lin = [
          lin[0] * m[0] + lin[1] * m[1] + lin[2] * m[2],
          lin[0] * m[3] + lin[1] * m[4] + lin[2] * m[5],
          lin[0] * m[6] + lin[1] * m[7] + lin[2] * m[8],
        ];

        // back to a perceptual space for contrast + tinting
        let d = [linToSrgb(lin[0]), linToSrgb(lin[1]), linToSrgb(lin[2])];

        // S-curve contrast around the pivot
        for (let i = 0; i < 3; i++) {
          const x = (d[i] - L.pivot) * L.contrast + L.pivot;
          d[i] = x;
        }

        // Toe and shoulder.
        //
        // The toe is a shadow *expansion*, not a lift pedestal. It was
        // `toe + (1 - toe) * x`, which raises the black floor by `toe` for
        // every pixel in the frame: at `night`'s 0.055 that is a floor near
        // 14/255 before dither, and the reference night corpus sits at a 0.1
        // percentile of 1.0 with 11.12 stops against our 8.49.
        //
        // That lift was invisible for as long as the grain was shadow-weighted,
        // because symmetric noise in the darkest band dithered pixels back down
        // and the measured black point read 5.1 rather than the 9.1 that was
        // really there. Mid-weighting the grain is what exposed it.
        //
        // Instead: identity above `knee`, and below it the range is expanded
        // toward zero with slope `1 + toe*SHADOW_SLOPE`, so the deepest shadow
        // reaches black while the band just above it is *spread* rather than
        // crushed. Separation in the shadows is what the pedestal was for, and
        // expansion buys more of it than a lift does. Banding has the explicit
        // 1.5-LSB temporal dither in `GradePass` to fall into -- that is what
        // the dither is for, and it does not cost a black point to provide.
        const knee = 0.06;
        for (let i = 0; i < 3; i++) {
          let x = sat01(d[i]);
          if (x < knee) x = knee - (knee - x) * (1 + L.toe * SHADOW_SLOPE);
          x = sat01(x);
          x = x * L.shoulder + (1.0 - L.shoulder) * (x * x * (3 - 2 * x)); // soft shoulder
          d[i] = x;
        }

        // range-based tinting: shadows / mids / highlights
        const y = d[0] * lum[0] + d[1] * lum[1] + d[2] * lum[2];
        const wS = Math.pow(1 - sat01(y), 2.0);
        const wH = Math.pow(sat01(y), 2.0);
        const wM = Math.max(0, 1 - wS - wH);
        // Gate the highlight tint on how warm the pixel already is. See
        // GradeLook.highGate: a flat warm tint lands on sky and cloud, which
        // are the brightest things in an outdoor frame and the two the
        // reference keeps coolest. Normalising R-B by luma makes the gate a
        // question about hue rather than about exposure, so a bright cloud and
        // a dim one are judged the same way.
        const yT = d[0] * lum[0] + d[1] * lum[1] + d[2] * lum[2];
        const chroma = (d[0] - d[2]) / Math.max(yT, 0.02);
        const gate = L.highGate * (1 - smooth01(chroma, 0.0, 0.14)) ;
        for (let i = 0; i < 3; i++) {
          const hi = L.highTint[i] + (1 - L.highTint[i]) * gate;
          const t = L.shadowTint[i] * wS + L.midTint[i] * wM + hi * wH;
          d[i] *= t;
        }

        // range-dependent saturation
        const y2 = d[0] * lum[0] + d[1] * lum[1] + d[2] * lum[2];
        const s = L.sat * (L.satShadow * wS + 1.0 * wM + L.satHigh * wH) / Math.max(1e-4, wS + wM + wH);
        for (let i = 0; i < 3; i++) d[i] = y2 + (d[i] - y2) * s;

        // Print fade — a hint of flashed film in the deep shadows, and *only*
        // there. Weighted by `wS`, the same shadow weight the tinting uses.
        //
        // This was a flat lerp until it was traced: at display-white a flat
        // fade lands the top texel at 252 for `golden` and `storm` and 245 for
        // `night`, so no pixel leaving the LUT could ever reach 254 and
        // `imagestats`' `clip%` was structurally pinned near zero. That is the
        // sibling repo's "nothing in this game clips" bug exactly — theirs was
        // a highlight tint capping blue at 244 — and it is what makes a frame
        // read veiled. Traced with the fade removed, every preset reaches 255.
        // The flash itself is not the bug and is kept; applying it to
        // highlights was.
        const wFade = L.fade * wS;
        for (let i = 0; i < 3; i++) d[i] = d[i] * (1 - wFade) + L.fadeTint[i] * wFade;

        const idx = ((g * w) + (b * n + r)) * 4;
        data[idx] = Math.round(sat01(d[0]) * 255);
        data[idx + 1] = Math.round(sat01(d[1]) * 255);
        data[idx + 2] = Math.round(sat01(d[2]) * 255);
        data[idx + 3] = 255;
      }
    }
  }

  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const _cache = new Map<string, THREE.DataTexture>();

/** Cached LUT for a preset name. */
export function lutFor(name: string): THREE.DataTexture {
  let tex = _cache.get(name);
  if (!tex) { tex = bakeLut(GRADES[name] || GRADES.day); _cache.set(name, tex); }
  return tex;
}

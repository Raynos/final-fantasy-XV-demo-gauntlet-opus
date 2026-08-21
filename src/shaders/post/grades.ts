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
  /** Parameters baked into the LUT. */
  look?: any;
  [extra: string]: any;
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
    vignette: 0.30, chroma: 0.7, grain: 0.020, key: 0.225,
    look: {
      toe: 0.012, shoulder: 0.96, pivot: 0.40, contrast: 1.21,
      shadowTint: [0.88, 0.97, 1.17], midTint: [1.0, 1.0, 0.985], highTint: [1.04, 1.0, 0.94],
      sat: 0.99, satShadow: 1.0, satHigh: 0.88,
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
    vignette: 0.38, chroma: 1.0, grain: 0.024, key: 0.215,
    look: {
      toe: 0.030, shoulder: 0.78, pivot: 0.39, contrast: 1.19,
      shadowTint: [0.66, 0.89, 1.42], midTint: [1.01, 1.0, 0.99], highTint: [1.10, 1.01, 0.87],
      sat: 1.02, satShadow: 1.08, satHigh: 0.82,
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
    vignette: 0.44, chroma: 1.3, grain: 0.024, key: 0.115,
    look: {
      toe: 0.055, shoulder: 0.95, pivot: 0.33, contrast: 1.10,
      shadowTint: [0.62, 0.84, 1.46], midTint: [0.84, 0.94, 1.20], highTint: [0.97, 1.0, 1.08],
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
    vignette: 0.42, chroma: 0.9, grain: 0.032, key: 0.200,
    look: {
      toe: 0.018, shoulder: 0.94, pivot: 0.38, contrast: 1.16,
      shadowTint: [0.86, 0.97, 1.12], midTint: [0.95, 0.99, 1.02], highTint: [1.0, 1.01, 1.01],
      sat: 0.86, satShadow: 0.80, satHigh: 0.80,
      mixer: [1.0, 0.0, 0.01, 0.01, 1.0, 0.01, 0.0, 0.0, 1.0],
      fade: 0.014, fadeTint: [0.05, 0.07, 0.10],
    },
  },
};

const LUT_SIZE = 32;

function srgbToLin(c: any) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function linToSrgb(c: any) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055; }
function sat01(v: any) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/**
 * Bake one preset's `look` into a 1024x32 RGBA strip texture.
 * Deterministic and cheap (32k texels of pure arithmetic).
 *
 */
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

        // toe + shoulder: never let pure black or pure white hit the rails
        for (let i = 0; i < 3; i++) {
          let x = sat01(d[i]);
          x = L.toe + (1.0 - L.toe) * x;                       // lifted toe
          x = x * L.shoulder + (1.0 - L.shoulder) * (x * x * (3 - 2 * x)); // soft shoulder
          d[i] = x;
        }

        // range-based tinting: shadows / mids / highlights
        const y = d[0] * lum[0] + d[1] * lum[1] + d[2] * lum[2];
        const wS = Math.pow(1 - sat01(y), 2.0);
        const wH = Math.pow(sat01(y), 2.0);
        const wM = Math.max(0, 1 - wS - wH);
        for (let i = 0; i < 3; i++) {
          const t = L.shadowTint[i] * wS + L.midTint[i] * wM + L.highTint[i] * wH;
          d[i] *= t;
        }

        // range-dependent saturation
        const y2 = d[0] * lum[0] + d[1] * lum[1] + d[2] * lum[2];
        const s = L.sat * (L.satShadow * wS + 1.0 * wM + L.satHigh * wH) / Math.max(1e-4, wS + wM + wH);
        for (let i = 0; i < 3; i++) d[i] = y2 + (d[i] - y2) * s;

        // print fade — a hint of flashed film in the deep shadows
        for (let i = 0; i < 3; i++) d[i] = d[i] * (1 - L.fade) + L.fadeTint[i] * L.fade;

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

const _cache = new Map();

/** Cached LUT for a preset name. */
export function lutFor(name: any) {
  if (!_cache.has(name)) _cache.set(name, bakeLut(GRADES[name] || GRADES.day));
  return _cache.get(name);
}

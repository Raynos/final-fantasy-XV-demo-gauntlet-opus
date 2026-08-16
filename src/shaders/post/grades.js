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
 * @typedef {Object} GradePreset
 * @property {number[]} balance      white balance [temperature, tint] in -1..1
 * @property {number} contrast       contrast around scene-linear mid grey
 * @property {number} saturation     global saturation
 * @property {number[]} lift         scene-linear shadow lift (rgb)
 * @property {number[]} gain         scene-linear highlight gain (rgb)
 * @property {number} vignette       lens falloff strength
 * @property {number} chroma         lateral chromatic aberration
 * @property {number} grain          film grain amplitude
 * @property {number} key            auto-exposure key value (target luminance)
 * @property {Object} look           parameters baked into the LUT
 */

/** @type {Object<string, GradePreset>} */
export const GRADES = {
  // Flat, neutral daylight. Slightly cool shadows, sun-bleached highlights.
  day: {
    balance: [0.04, 0.0],
    contrast: 1.06, saturation: 1.02,
    lift: [0.0, 0.0, 0.004], gain: [1.0, 1.0, 1.0],
    vignette: 0.30, chroma: 0.7, grain: 0.020, key: 0.235,
    look: {
      toe: 0.035, shoulder: 0.90, pivot: 0.42, contrast: 1.10,
      shadowTint: [0.94, 0.99, 1.10], midTint: [1.0, 1.0, 0.99], highTint: [1.03, 1.0, 0.955],
      sat: 0.98, satShadow: 0.86, satHigh: 0.90,
      mixer: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
      fade: 0.010, fadeTint: [0.05, 0.07, 0.11],
    },
  },

  // The FFXV signature. Warm raking light, teal shadows, creamy highlights.
  golden: {
    balance: [0.24, 0.04],
    contrast: 1.09, saturation: 1.07,
    lift: [0.0, 0.002, 0.012], gain: [1.05, 1.0, 0.945],
    vignette: 0.38, chroma: 1.0, grain: 0.024, key: 0.225,
    look: {
      toe: 0.045, shoulder: 0.88, pivot: 0.40, contrast: 1.13,
      shadowTint: [0.84, 0.96, 1.20], midTint: [1.05, 1.0, 0.945], highTint: [1.14, 1.03, 0.86],
      sat: 1.02, satShadow: 0.80, satHigh: 0.84,
      mixer: [1.0, 0.02, -0.01, 0.0, 1.0, 0.0, -0.01, 0.01, 1.0],
      fade: 0.016, fadeTint: [0.09, 0.07, 0.06],
    },
  },

  // Deep blue night. Low key, strong desaturation, milky moon highlights.
  night: {
    balance: [-0.22, -0.05],
    contrast: 1.02, saturation: 0.90,
    lift: [0.0, 0.003, 0.012], gain: [0.94, 0.98, 1.08],
    vignette: 0.46, chroma: 1.3, grain: 0.042, key: 0.135,
    look: {
      toe: 0.020, shoulder: 0.94, pivot: 0.34, contrast: 1.04,
      shadowTint: [0.74, 0.87, 1.24], midTint: [0.88, 0.95, 1.14], highTint: [0.98, 1.0, 1.06],
      sat: 0.82, satShadow: 0.55, satHigh: 0.78,
      mixer: [1.0, 0.0, 0.03, 0.0, 1.0, 0.02, 0.02, 0.0, 1.0],
      fade: 0.024, fadeTint: [0.04, 0.06, 0.13],
    },
  },

  // Overcast / storm. Cold, flat, heavy, slightly green-grey.
  storm: {
    balance: [-0.10, 0.04],
    contrast: 0.98, saturation: 0.88,
    lift: [0.004, 0.006, 0.010], gain: [0.97, 1.0, 1.03],
    vignette: 0.42, chroma: 0.9, grain: 0.030, key: 0.195,
    look: {
      toe: 0.030, shoulder: 0.92, pivot: 0.40, contrast: 1.02,
      shadowTint: [0.88, 0.96, 1.10], midTint: [0.95, 0.99, 1.02], highTint: [0.99, 1.01, 1.02],
      sat: 0.86, satShadow: 0.68, satHigh: 0.82,
      mixer: [1.0, 0.0, 0.01, 0.01, 1.0, 0.01, 0.0, 0.0, 1.0],
      fade: 0.022, fadeTint: [0.07, 0.09, 0.10],
    },
  },
};

const LUT_SIZE = 32;

function srgbToLin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function linToSrgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055; }
function sat01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/**
 * Bake one preset's `look` into a 1024x32 RGBA strip texture.
 * Deterministic and cheap (32k texels of pure arithmetic).
 *
 * @param {GradePreset} preset
 * @returns {THREE.DataTexture}
 */
export function bakeLut(preset) {
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
export function lutFor(name) {
  if (!_cache.has(name)) _cache.set(name, bakeLut(GRADES[name] || GRADES.day));
  return _cache.get(name);
}

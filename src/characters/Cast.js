import * as THREE from 'three';
import { Character } from './rig/Character.js';
import { smoothIn, clamp01 } from './rig/Geo.js';

/**
 * The four-man party, as data.
 *
 * Each entry is a body `profile` (drives the skeleton and every sweep radius)
 * plus a `look` (face shape, skin, hair style, outfit piece list). Silhouette
 * comes first: Gladio is 20cm taller and half again as wide as Noctis, Ignis is
 * tall and narrow, Prompto is the smallest and loosest.
 */

const srgb = (hex) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
const _c = new THREE.Color();

/** Gladiolus's eagle tattoo, drawn in torso-sweep space onto the skin mesh. */
function eagleInk(th, t) {
  let d = th - Math.PI;
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  const ad = Math.abs(d);
  if (ad > 1.5) return 0;
  let ink = 0;
  // spine column
  ink += Math.exp(-Math.pow(ad / 0.13, 2)) * smoothIn(0.50, 0.62, t) * (1 - smoothIn(0.86, 0.97, t));
  // wings arcing up and outward over the shoulder blades
  const wingY = 0.815 - 0.085 * Math.pow(ad, 1.5);
  const band = Math.exp(-Math.pow((t - wingY) / (0.085 - 0.03 * clamp01(ad)), 2));
  const feather = 0.45 + 0.55 * Math.pow(Math.abs(Math.sin(ad * 11.0 + 0.4)), 0.6);
  ink += band * feather * (1 - smoothIn(1.0, 1.45, ad));
  // lower plumage
  const tailY = 0.60 - 0.05 * ad;
  ink += Math.exp(-Math.pow((t - tailY) / 0.055, 2)) * (0.35 + 0.5 * Math.abs(Math.sin(ad * 16)))
    * (1 - smoothIn(0.35, 0.72, ad));
  return clamp01(ink * 1.15);
}

/** Noctis's skull tee print. */
function skullPrint(th, t) {
  let d = th;
  if (d > Math.PI) d -= Math.PI * 2;
  const ad = Math.abs(d);
  const cy = 0.70;
  const x = d / 0.30, y = (t - cy) / 0.115;
  const r = Math.hypot(x, y * 0.9);
  if (r > 1.25) return 0;
  let v = 1 - smoothIn(0.75, 1.05, r);              // cranium
  v *= 1 - 0.55 * smoothIn(0.55, 1.0, Math.abs(y + 0.75) + Math.max(0, Math.abs(x) - 0.55));
  // eye sockets and nasal void
  const e1 = Math.hypot((Math.abs(x) - 0.38) / 0.24, (y - 0.08) / 0.24);
  const e2 = Math.hypot(x / 0.13, (y + 0.42) / 0.22);
  v *= smoothIn(0.55, 1.0, e1);
  v *= smoothIn(0.5, 1.0, e2);
  return clamp01(v);
}

export const CAST = {
  // -------------------------------------------------------------- Noctis --
  noctis: {
    name: 'Noctis',
    profile: { height: 1.775, shoulder: 0.96, muscle: 0.30, hip: 0.97, neck: 0.96, headScale: 1.05 },
    look: {
      seed: 11,
      idle: {
        hips: [0, 0.03, -0.025], spine02: [0.01, 0.02, 0], spine03: [0, 0.04, 0.01],
        head: [0.03, -0.08, 0.02], neck: [0.02, -0.04, 0],
        upperArmL: [0.04, 0, 0.015], upperArmR: [0.02, 0, -0.01],
        lowerArmL: [-0.16, 0, 0], lowerArmR: [-0.10, 0, 0],
        thighR: [-0.04, 0, 0], shinR: [0.07, 0, 0], footR: [-0.04, 0, 0],
      },
      skin: srgb(0xdcae90),
      iris: 0x2f5f92,
      headWidth: 0.97,
      jaw: -0.25, cheek: 0.35, nose: -0.1, brow: 0.15,
      eyeOpen: 0.92,
      blush: 'rgba(190,92,80,0.26)',
      lip: 'rgba(160,88,86,0.5)',
      browShadow: 'rgba(40,34,38,0.5)',
      stubble: 0.045, stubbleColor: '#3a3040',
      brows: { color: 0x1b1a20, len: 0.0135, width: 0.0058 },
      hair: {
        color: 0x14151d, tipColor: 0x2b3040, rough: 0.30, shell: 0.020, volume: 1.25,
        hairline: 0.002, peak: 0.35,
        tufts: [
          // long asymmetric fringe sweeping across and over the right eye
          { n: 26, th: [-1.10, 0.60], phi: [0.78, 1.0], dir: [-0.30, -0.90, 0.42], out: 0.30, bend: 0.98, len: 0.055, width: 0.0125, thick: 0.4, spike: 0.8, sag: 0.10, dirJit: 0.08, steps: 6 },
          { n: 14, th: [-0.88, -0.02], phi: [0.84, 1.0], dir: [-0.46, -0.86, 0.32], out: 0.22, bend: 1.0, len: 0.070, width: 0.0135, thick: 0.4, spike: 0.75, sag: 0.14, dirJit: 0.07, steps: 6 },
          { n: 13, th: [0.18, 1.00], phi: [0.84, 1.0], dir: [0.28, -0.78, 0.54], out: 0.34, bend: 0.92, len: 0.050, width: 0.0120, thick: 0.4, spike: 0.85, sag: 0.09, dirJit: 0.09 },
          // crown spikes
          { n: 34, th: [-2.7, 2.7], phi: [0.20, 0.72], dir: [0, 0.10, -0.99], out: 0.62, bend: 0.72, len: 0.046, width: 0.0098, thick: 0.42, spike: 0.95, dirJit: 0.12 },
          // back layers, dynamic
          { n: 28, th: [2.00, 4.30], phi: [0.55, 1.0], dir: [0, -0.42, -0.90], out: 0.50, bend: 0.85, len: 0.064, width: 0.0110, thick: 0.42, spike: 0.9, dirJit: 0.10, spring: 0.35 },
          // side tufts over the ears
          { n: 10, th: [1.22, 2.10], phi: [0.86, 1.0], dir: [0.44, -0.80, -0.40], out: 0.34, bend: 0.9, len: 0.054, width: 0.0092, thick: 0.4, spike: 0.85, dirJit: 0.09 },
          { n: 10, th: [-2.10, -1.22], phi: [0.86, 1.0], dir: [-0.44, -0.80, -0.40], out: 0.34, bend: 0.9, len: 0.054, width: 0.0092, thick: 0.4, spike: 0.85, dirJit: 0.09 },
        ],
      },
      outfit: [
        { type: 'shirt', color: 0x3c3f49, rough: 0.82, u0: 0.30, u1: 0.95, pad: 0.010, neckCut: 0.34, print: skullPrint, printColor: 0xb9bcc4 },
        { type: 'pants', color: 0x181920, rough: 0.72, padHip: 0.016, padAnkle: 0.010, u1: 0.95, knee: 0.03, wrinkle: 0.016 },
        { type: 'jacket', color: 0x131419, rough: 0.66, u0: 0.44, u1: 0.965, pad: 0.024, gap: 0.58, flare: 0.05, thickness: 0.011, collarH: 0.075, collarR: 0.066, collarFlare: 1.20 },
        { type: 'skirt', color: 0x131419, rough: 0.66, top: 1.04, bottom: 0.775, rTop: 0.166, rBot: 0.176, gap: 0.60, backLong: 0.16, spring: 0.9, wave: 0.04, depth: 0.86 },
        { type: 'sleeve', color: 0x14151b, rough: 0.66, u0: 0.17, u1: 0.86, pad: 0.020, cuff: 0.05, cuffBand: true, cuffColor: 0x0e0f13 },
        { type: 'belt', color: 0x14151a, rough: 0.5, metal: 0.1, u: 0.365, pad: 0.020, buckleBox: true, buckleColor: 0x9aa0a8 },
        { type: 'boots', color: 0x14151b, rough: 0.55, shaft: 0.74, strap: true, height: 0.038 },
      ],
    },
  },

  // ----------------------------------------------------------- Gladiolus --
  gladio: {
    name: 'Gladiolus',
    profile: { height: 1.975, shoulder: 1.18, muscle: 0.95, hip: 1.02, neck: 1.12, armScale: 1.02, headScale: 0.99 },
    look: {
      seed: 23,
      idle: {
        clavicleL: [-0.05, 0, -0.05], clavicleR: [-0.05, 0, 0.05],
        upperArmL: [0.02, 0.04, 0.10], upperArmR: [0.02, -0.04, -0.10],
        lowerArmL: [-0.22, 0.05, 0], lowerArmR: [-0.22, -0.05, 0],
        spine02: [-0.03, 0, 0], spine03: [-0.05, 0.02, 0], neck: [0.04, -0.03, 0],
        head: [0.02, -0.05, 0], hips: [-0.02, -0.02, 0],
        thighL: [0.03, 0, 0.05], thighR: [0.03, 0, -0.05],
      },
      skin: srgb(0xc08d63),
      iris: 0x7a5326,
      headWidth: 1.06,
      jaw: 0.9, cheek: -0.15, nose: 0.35, brow: 0.7,
      eyeOpen: 0.86,
      blush: 'rgba(170,80,58,0.22)',
      lip: 'rgba(140,80,68,0.42)',
      browShadow: 'rgba(40,30,24,0.55)',
      stubble: 0.55, stubbleColor: '#3b2f24',
      scar: { from: [0.054, 0.036, 0.050], to: [0.028, -0.032, 0.080], color: 'rgba(168,116,100,0.9)', width: 6 },
      brows: { color: 0x27201a, len: 0.016, width: 0.0072, lift: -0.001 },
      tattoo: eagleInk,
      hair: {
        color: 0x1f1712, tipColor: 0x40301f, rough: 0.38, shell: 0.016, volume: 1.05,
        hairline: -0.004, peak: 0.55,
        tufts: [
          { n: 13, th: [-1.1, 1.1], phi: [0.80, 1.0], dir: [0, 0.12, -0.99], out: 0.25, bend: 0.95, len: 0.10, thick: 0.4, width: 0.0087, spike: 0.9, dirJit: 0.07 },
          { n: 16, th: [1.0, 2.4], phi: [0.55, 1.0], dir: [0.25, -0.05, -0.96], out: 0.30, bend: 0.9, len: 0.11, thick: 0.4, width: 0.0093, spike: 0.85, dirJit: 0.08 },
          { n: 16, th: [-2.4, -1.0], phi: [0.55, 1.0], dir: [-0.25, -0.05, -0.96], out: 0.30, bend: 0.9, len: 0.11, thick: 0.4, width: 0.0093, spike: 0.85, dirJit: 0.08 },
          // gathered tail
          { n: 19, th: [2.55, 3.75], phi: [0.55, 1.0], dir: [0, -0.55, -0.84], out: 0.20, bend: 1.0, len: 0.145, thick: 0.4, width: 0.0105, spike: 0.75, sag: 0.20, dirJit: 0.06, spring: 0.75, steps: 7 },
          { n: 8, th: [2.9, 3.4], phi: [0.85, 1.0], dir: [0, -0.85, -0.52], out: 0.15, bend: 1.0, len: 0.18, thick: 0.4, width: 0.0118, spike: 0.7, sag: 0.28, dirJit: 0.05, spring: 0.9, steps: 7 },
          // loose strands at the temples
          { n: 4, th: [1.15, 1.55], phi: [0.9, 1.0], dir: [0.55, -0.72, -0.42], out: 0.25, bend: 0.95, len: 0.075, width: 0.010, spike: 1.0, dirJit: 0.1 },
          { n: 4, th: [-1.55, -1.15], phi: [0.9, 1.0], dir: [-0.55, -0.72, -0.42], out: 0.25, bend: 0.95, len: 0.075, width: 0.010, spike: 1.0, dirJit: 0.1 },
        ],
      },
      outfit: [
        { type: 'pants', color: 0x3a3730, rough: 0.85, padHip: 0.020, padAnkle: 0.016, u1: 0.94, cargo: 0.06, wrinkle: 0.022, knee: 0.035 },
        { type: 'jacket', color: 0x15161a, rough: 0.55, u0: 0.36, u1: 0.955, pad: 0.026, gap: 0.60, flare: 0.05, thickness: 0.014, collar: false },
        { type: 'belt', color: 0x241d16, rough: 0.55, u: 0.35, pad: 0.026, buckleBox: true, buckleColor: 0xb0a082 },
        { type: 'pouch', color: 0x241d16, rough: 0.6, sides: ['R'], u: 0.24, size: [0.055, 0.10, 0.04] },
        { type: 'boots', color: 0x211c17, rough: 0.62, shaft: 0.70, strap: true, width: 0.052, height: 0.040 },
        { type: 'band', color: 0x2b2119, rough: 0.6, sides: ['L'], u: 0.90, pad: 0.012, ridge: 0.05 },
      ],
    },
  },

  // --------------------------------------------------------------- Ignis --
  ignis: {
    name: 'Ignis',
    profile: { height: 1.865, shoulder: 1.01, muscle: 0.45, hip: 0.93, neck: 1.02, legScale: 1.03, headScale: 1.02 },
    look: {
      seed: 37,
      idle: {
        spine01: [-0.03, 0, 0], spine02: [-0.03, 0, 0], spine03: [-0.02, -0.03, 0],
        neck: [0.03, 0.02, 0], head: [0.02, 0.05, -0.01],
        upperArmL: [0.10, 0.06, 0.02], upperArmR: [0.10, -0.06, -0.02],
        lowerArmL: [-0.42, 0.20, 0.05], lowerArmR: [-0.42, -0.20, -0.05],
        handL: [0.1, 0, 0.15], handR: [0.1, 0, -0.15],
      },
      skin: srgb(0xd6ab88),
      iris: 0x4d7d58,
      headWidth: 0.96,
      jaw: 0.25, cheek: 0.5, nose: 0.2, brow: 0.35,
      eyeOpen: 0.82,
      blush: 'rgba(178,86,66,0.22)',
      lip: 'rgba(152,88,80,0.45)',
      browShadow: 'rgba(60,44,32,0.45)',
      stubble: 0.16, stubbleColor: '#4a3a2a',
      brows: { color: 0x6a4c2e, len: 0.014, width: 0.006 },
      lenses: true,
      gloves: { color: srgb(0x1b1b21), rough: 0.62 },
      hair: {
        color: 0x8a6636, tipColor: 0xc19a5e, rough: 0.30, shell: 0.015, volume: 1.05,
        hairline: 0.004, peak: 0.25,
        tufts: [
          // swept straight back, tight to the skull
          { n: 22, th: [-1.32, 1.32], phi: [0.76, 1.0], dir: [0, 0.34, -0.94], out: 0.16, bend: 1.0, len: 0.058, width: 0.0085, thick: 0.4, spike: 0.7, dirJit: 0.05 },
          { n: 9, th: [-0.44, 0.44], phi: [0.93, 1.0], dir: [0.05, 0.66, -0.75], out: 0.28, bend: 0.85, len: 0.052, width: 0.0085, thick: 0.4, spike: 0.95, dirJit: 0.09 },
          { n: 18, th: [1.1, 2.6], phi: [0.45, 1.0], dir: [0.22, 0.08, -0.97], out: 0.20, bend: 0.95, len: 0.056, width: 0.0085, thick: 0.4, spike: 0.8, dirJit: 0.05 },
          { n: 18, th: [-2.6, -1.1], phi: [0.45, 1.0], dir: [-0.22, 0.08, -0.97], out: 0.20, bend: 0.95, len: 0.056, width: 0.0085, thick: 0.4, spike: 0.8, dirJit: 0.05 },
          { n: 14, th: [2.5, 3.8], phi: [0.62, 1.0], dir: [0, -0.40, -0.92], out: 0.28, bend: 0.95, len: 0.050, width: 0.0090, thick: 0.4, spike: 0.85, dirJit: 0.07, spring: 0.25 },
        ],
      },
      outfit: [
        { type: 'shirt', color: 0x22222a, rough: 0.7, u0: 0.32, u1: 0.99, pad: 0.010, neckCut: 0.22 },
        { type: 'pants', color: 0x22212a, rough: 0.72, padHip: 0.016, padAnkle: 0.012, u1: 0.95, wrinkle: 0.014 },
        { type: 'jacket', color: 0x4a4456, rough: 0.62, u0: 0.42, u1: 0.965, pad: 0.024, gap: 0.26, flare: 0.04, thickness: 0.012, collarH: 0.108, collarR: 0.064, collarFlare: 1.06, collarGap: 0.16 },
        { type: 'skirt', color: 0x453f50, rough: 0.62, top: 1.02, bottom: 0.70, rTop: 0.160, rBot: 0.178, gap: 0.46, backLong: 0.12, spring: 0.92, wave: 0.05, depth: 0.86 },
        { type: 'sleeve', color: 0x4a4456, rough: 0.62, u0: 0.17, u1: 0.90, pad: 0.019, cuff: 0.04, cuffBand: true, cuffColor: 0x272430 },
        { type: 'belt', color: 0x1c1a22, rough: 0.5, u: 0.375, pad: 0.020, buckleBox: true, buckleColor: 0x8e9298 },
        { type: 'boots', color: 0x1a1920, rough: 0.5, shaft: 0.78, height: 0.036 },
      ],
    },
  },

  // ------------------------------------------------------------- Prompto --
  prompto: {
    name: 'Prompto',
    profile: { height: 1.755, shoulder: 1.00, muscle: 0.40, hip: 0.90, neck: 0.98, headScale: 1.04 },
    look: {
      seed: 53,
      idle: {
        hips: [0, 0.05, 0.06], spine01: [0, -0.02, -0.045], spine03: [0.02, -0.06, -0.03],
        neck: [0, 0.05, 0.02], head: [-0.02, 0.10, 0.03],
        upperArmR: [0.12, 0, -0.09], lowerArmR: [-0.50, -0.10, 0],
        upperArmL: [0.02, 0, 0.05], lowerArmL: [-0.18, 0, 0],
        thighL: [0.05, 0, 0.05], shinL: [0.12, 0, 0], thighR: [-0.02, 0, -0.02],
      },
      skin: srgb(0xe4bb9c),
      iris: 0x4d8ec0,
      headWidth: 0.98,
      jaw: -0.35, cheek: 0.25, nose: -0.25, brow: -0.15,
      eyeOpen: 1.0,
      blush: 'rgba(208,104,84,0.34)',
      lip: 'rgba(172,98,92,0.5)',
      browShadow: 'rgba(120,86,44,0.35)',
      freckles: true, freckleColor: 'rgba(158,96,58,0.6)',
      brows: { color: 0xa07a40, len: 0.012, width: 0.0052 },
      hair: {
        color: 0xc3a05a, tipColor: 0xf0d79b, rough: 0.28, shell: 0.019, volume: 1.3,
        hairline: 0.006, peak: 0.2,
        tufts: [
          // upswept front spikes
          { n: 16, th: [-1.0, 1.0], phi: [0.82, 1.0], dir: [0, 0.86, 0.46], out: 0.30, bend: 0.85, len: 0.082, thick: 0.4, width: 0.0081, spike: 1.35, dirJit: 0.20, steps: 6 },
          { n: 13, th: [-0.7, 0.7], phi: [0.55, 0.82], dir: [0.05, 0.96, 0.20], out: 0.35, bend: 0.8, len: 0.070, width: 0.0085, thick: 0.4, spike: 1.1, dirJit: 0.20 },
          { n: 22, th: [-2.6, 2.6], phi: [0.25, 0.60], dir: [0, 0.80, -0.55], out: 0.45, bend: 0.75, len: 0.056, width: 0.0085, thick: 0.4, spike: 1.05, dirJit: 0.22 },
          { n: 16, th: [2.2, 4.1], phi: [0.70, 1.0], dir: [0, 0.10, -0.98], out: 0.40, bend: 0.85, len: 0.070, thick: 0.4, width: 0.0081, spike: 1.25, dirJit: 0.18, spring: 0.3 },
          { n: 4, th: [1.25, 1.85], phi: [0.9, 1.0], dir: [0.62, -0.35, -0.65], out: 0.30, bend: 0.9, len: 0.055, width: 0.010, spike: 1.2, dirJit: 0.12 },
          { n: 4, th: [-1.85, -1.25], phi: [0.9, 1.0], dir: [-0.62, -0.35, -0.65], out: 0.30, bend: 0.9, len: 0.055, width: 0.010, spike: 1.2, dirJit: 0.12 },
        ],
      },
      outfit: [
        { type: 'shirt', color: 0xdedad2, rough: 0.85, u0: 0.30, u1: 0.98, pad: 0.011, neckCut: 0.42, wrinkle: 0.016 },
        { type: 'pants', color: 0x1c1d24, rough: 0.75, padHip: 0.016, padAnkle: 0.011, u1: 0.95, wrinkle: 0.018, knee: 0.03 },
        { type: 'jacket', color: 0x17181d, rough: 0.7, u0: 0.46, u1: 0.945, pad: 0.022, gap: 0.66, flare: 0.03, thickness: 0.010, collarH: 0.050, collarR: 0.064, collarFlare: 1.10 },
        { type: 'belt', color: 0x22232a, rough: 0.55, u: 0.36, pad: 0.020, buckleBox: true, buckleColor: 0xa8adb4 },
        { type: 'band', color: 0x2b2d34, rough: 0.7, sides: ['L', 'R'], u: 0.90, pad: 0.010, ridge: 0.04 },
        { type: 'strap', color: 0x2a2b32, rough: 0.7, side: 'L', width: 0.018 },
        { type: 'camera', color: 0x1d1e24, rough: 0.42, metal: 0.2, at: [-0.085, 1.03, 0.125] },
        { type: 'boots', color: 0x24252c, rough: 0.7, shaft: 0.80, height: 0.034 },
      ],
    },
  },
};

/** Instantiate one of the cast. @param {string} key @returns {Character} */
export function makeCharacter(key) {
  const def = CAST[key];
  if (!def) throw new Error(`unknown character ${key}`);
  return new Character(def).build();
}

export { skullPrint, eagleInk };

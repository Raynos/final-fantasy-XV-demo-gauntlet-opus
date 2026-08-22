import * as THREE from 'three';
import type { CharacterDef, HairStyle, HairTuft } from '../rig/Look.ts';

/**
 * The people of Hammerhead.
 *
 * Each entry is a body `profile` and a `look` in exactly the format
 * `characters/rig/**` expects, so townsfolk are built by the same skeleton,
 * body, face, hair and outfit code as the party — but authored for a crowd:
 * a third of the hair strand count, simpler garment stacks, and no per-strand
 * beard work except where a beard *is* the character (Cid).
 *
 * Silhouette first, as with the leads. Cid is short, stooped and barrel-chested;
 * Takka is the widest man in the badlands; Cindy is small and stands with all
 * her weight on one hip; Dave is tall, lean and never takes the cap off.
 */

const srgb = (hex: number) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);

/** What a caller may vary about {@link hairSet}. Everything else is the recipe. */
interface HairSetOpts {
  color: number;
  /** colour at the strand tip; `undefined` leaves the shell colour alone. */
  tip?: number;
  /** crown strand length, canonical head metres. */
  len?: number;
  /** back-layer strand length. */
  back?: number;
  /** strands in the crown mat; the other two layers scale off it. */
  n?: number;
  /** sideways bias on the styled flow direction. */
  sweep?: number;
  /** spring weight on the back layer, so it swings. */
  spring?: number;
  rough?: number;
}

/** A compact hair set: crown mat, a sweep and a back layer. Three tufts, not ten. */
function hairSet({
  color, tip, len = 0.036, back = 0.05, n = 130, sweep = 0.0, spring = 0.25, rough = 0.38,
}: HairSetOpts): HairStyle {
  return {
    color, tipColor: tip, rough, shell: 0.0125, volume: 0.9,
    hairline: 0.004, peak: 0.3, wisps: 18, wispLen: 0.7,
    tufts: [
      { n, th: [-3.14, 3.14], phi: [0.0, 0.56], dir: [sweep, 0.04, -0.98], out: 0.64, bend: 0.92, len, width: 0.0019, thick: 0.36, spike: 0.7, dirJit: 0.15, lenVar: 0.3 },
      { n: Math.round(n * 0.45), th: [-1.2, 1.2], phi: [0.82, 1.0], dir: [sweep * 2, -0.24, -0.94], out: 0.70, bend: 0.98, len: len * 1.15, width: 0.0026, thick: 0.34, spike: 0.6, dirJit: 0.08, lenVar: 0.2 },
      { n: Math.round(n * 0.55), th: [2.1, 4.2], phi: [0.55, 1.0], dir: [0, -0.55, -0.83], out: 0.72, bend: 0.95, len: back, width: 0.0026, thick: 0.34, spike: 0.6, dirJit: 0.08, lenVar: 0.22, spring },
    ],
  };
}

/** A long ponytail dropping from the back of the crown. */
function ponytail(color: number, tip: number, len = 0.20): HairTuft {
  return {
    n: 84, th: [2.6, 3.7], phi: [0.55, 0.95], dir: [0, -0.94, -0.34], out: 0.58, bend: 1.0,
    len, width: 0.0030, thick: 0.34, spike: 0.5, sag: 0.16, dirJit: 0.05, lenVar: 0.16,
    spring: 0.9, steps: 8, color, tipColor: tip,
  };
}

/** A short beard rooted below the equator. */
function beard(color: number, tip: number, len = 0.016, n = 110): HairTuft[] {
  return [
    { n, th: [-1.45, 1.45], phi: [2.05, 2.75], absPhi: true, dir: [0, -0.9, 0.36], out: 0.86, bend: 0.94, len, width: 0.0011, thick: 0.45, spike: 0.85, dirJit: 0.22, lenVar: 0.34, color, tipColor: tip },
    { n: Math.round(n * 0.4), th: [-0.6, 0.6], phi: [1.86, 2.06], absPhi: true, dir: [0, -0.84, 0.52], out: 0.84, bend: 0.92, len: len * 0.8, width: 0.0011, thick: 0.45, spike: 0.9, dirJit: 0.2, lenVar: 0.3, color, tipColor: tip },
  ];
}

/**
 * One townsperson as authored: a `CharacterDef` plus the two things only a
 * townsperson has — the job title the interact prompt shows under their name,
 * and the portrait hue their dialogue card is tinted with.
 */
export interface NpcCastDef extends CharacterDef {
  /** shown as the hint on the `Talk` prompt. */
  role: string;
  /** portrait/dialogue-card hue in degrees. */
  hue: number;
}

export const NPC_CAST = {
  /* ------------------------------------------------------------- Cindy -- */
  cindy: {
    name: 'Cindy Aurum',
    role: 'Chief Mechanic',
    hue: 46,
    profile: { height: 1.695, shoulder: 0.83, muscle: 0.30, hip: 1.06, neck: 0.98, headScale: 1.04 },
    look: {
      seed: 71,
      // weight on the right hip, chin up, one hand habitually near a pocket
      idle: {
        hips: [0, 0.05, -0.12], spine01: [0, -0.02, 0.06], spine03: [-0.03, 0.05, 0.04],
        neck: [0.02, 0.03, -0.02], head: [-0.03, 0.06, -0.04],
        upperArmL: [0.06, 0, 0.10], lowerArmL: [-0.55, 0.1, 0],
        upperArmR: [0.02, 0, -0.05], lowerArmR: [-0.22, 0, 0],
        thighR: [-0.05, 0, -0.06], shinR: [0.10, 0, 0],
      },
      stance: -0.6,
      skin: srgb(0xcaa587),
      iris: 0x4e8f5e,
      headWidth: 0.95, jaw: -0.45, cheek: 0.55, nose: -0.3, brow: -0.1, eyeOpen: 1.04,
      blush: 'rgba(206,102,92,0.42)', lip: 'rgba(186,84,84,0.66)',
      browShadow: 'rgba(120,84,42,0.40)', lashColor: 0x2a1c14,
      freckles: true, freckleColor: 'rgba(168,104,62,0.42)',
      fringeShadow: 0.28,
      brows: { color: 0xa8813e, len: 0.0125, width: 0.0052 },
      hair: (() => {
        const h = hairSet({ color: 0xd8b45c, tip: 0xf2dd9c, len: 0.030, back: 0.06, n: 150, sweep: -0.10, spring: 0.4 });
        h.tufts.push(ponytail(0xd8b45c, 0xf2dd9c, 0.22));
        return h;
      })(),
      outfit: [
        // knotted crop top, denim shorts, work boots, a tool belt and wristbands
        { type: 'shirt', color: 0xe8e2d0, rough: 0.84, u0: 0.52, u1: 0.94, pad: 0.009, neckCut: 0.52, wrinkle: 0.018 },
        { type: 'pants', color: 0x4d6a86, rough: 0.82, u1: 0.40, padHip: 0.016, padAnkle: 0.016, wrinkle: 0.020, waistColor: 0x44607a },
        { type: 'jacket', color: 0xd8b23a, rough: 0.62, u0: 0.44, u1: 0.90, pad: 0.020, gap: 0.72, flare: 0.03, thickness: 0.010, collarH: 0.040, collarR: 0.060, collarFlare: 1.0 },
        { type: 'sleeve', color: 0xd8b23a, rough: 0.62, u0: 0.03, u1: 0.28, pad: 0.013, cuff: 0.03 },
        { type: 'belt', color: 0x3a2f22, rough: 0.5, u: 0.40, pad: 0.022, buckleBox: true, buckleColor: 0xc0a870 },
        { type: 'pouch', color: 0x3a2f22, rough: 0.55, sides: ['R'], u: 0.26, size: [0.05, 0.09, 0.035] },
        { type: 'band', color: 0x2c2a26, rough: 0.7, sides: ['L', 'R'], u: 0.88, pad: 0.010, ridge: 0.04 },
        { type: 'boots', color: 0x3a2e22, rough: 0.55, shaft: 0.62, strap: true, height: 0.040 },
      ],
    },
  },

  /* --------------------------------------------------------------- Cid -- */
  cid: {
    name: 'Cid Sophiar',
    role: 'Proprietor',
    hue: 200,
    profile: { height: 1.665, shoulder: 0.99, muscle: 0.66, hip: 1.06, neck: 1.08, headScale: 1.06 },
    look: {
      seed: 83,
      // eighty-odd years of leaning over an engine bay
      idle: {
        hips: [-0.04, 0, 0.02], spine01: [-0.06, 0, 0], spine02: [-0.07, 0, 0], spine03: [-0.09, 0.03, 0],
        neck: [0.14, -0.04, 0], head: [0.05, -0.06, 0],
        clavicleL: [-0.06, 0, -0.06], clavicleR: [-0.06, 0, 0.06],
        upperArmL: [0.04, 0.03, 0.12], lowerArmL: [-0.42, 0.05, 0],
        upperArmR: [0.04, -0.03, -0.12], lowerArmR: [-0.46, -0.05, 0],
        thighL: [0.04, 0, 0.04], thighR: [0.03, 0, -0.04],
      },
      skin: srgb(0xad8f73),
      iris: 0x5a6f7c,
      headWidth: 1.05, jaw: 0.9, cheek: -0.55, nose: 0.75, brow: 1.15, eyeOpen: 0.78,
      blush: 'rgba(168,92,66,0.30)', lip: 'rgba(140,88,78,0.44)',
      browShadow: 'rgba(50,44,40,0.58)', lashColor: 0x151312,
      stubble: 0.42, stubbleColor: '#8d8a84',
      fringeShadow: 0.42,
      brows: { color: 0x8e8a82, len: 0.017, width: 0.0078, lift: -0.001 },
      hair: (() => {
        const h = hairSet({ color: 0x8b8880, tip: 0xb9b6ad, len: 0.020, back: 0.028, n: 90, spring: 0.1, rough: 0.5 });
        h.tufts.push(...beard(0x8b8880, 0xc4c1b8, 0.020, 130));
        return h;
      })(),
      outfit: [
        { type: 'shirt', color: 0x9a9384, rough: 0.9, u0: 0.30, u1: 0.96, pad: 0.011, neckCut: 0.36, wrinkle: 0.024 },
        { type: 'pants', color: 0x3f4a56, rough: 0.86, padHip: 0.020, padAnkle: 0.016, u1: 0.94, wrinkle: 0.024, knee: 0.035 },
        // an oil-black gilet worn open over the shirt, and braces underneath
        { type: 'jacket', color: 0x2b2a26, rough: 0.66, u0: 0.32, u1: 0.94, pad: 0.026, gap: 0.62, flare: 0.05, waist: 0.06, thickness: 0.014, collarH: 0.046, collarR: 0.072, collarFlare: 1.1 },
        { type: 'strap', color: 0x33302a, rough: 0.8, side: 'L', width: 0.016, to: [-0.05, 1.16, -0.09] },
        { type: 'strap', color: 0x33302a, rough: 0.8, side: 'R', width: 0.016, to: [0.05, 1.16, -0.09] },
        { type: 'belt', color: 0x33302a, rough: 0.5, u: 0.36, pad: 0.024, buckleBox: true, buckleColor: 0xa0968a },
        { type: 'boots', color: 0x2a251d, rough: 0.6, shaft: 0.68, height: 0.040 },
      ],
    },
  },

  /* ------------------------------------------------------------- Takka -- */
  takka: {
    name: 'Takka',
    role: 'Cook · Tipster',
    hue: 22,
    profile: { height: 1.885, shoulder: 1.02, muscle: 0.86, hip: 1.10, neck: 1.10, headScale: 0.98 },
    look: {
      seed: 97,
      // hands on the counter, weight forward, the posture of a man mid-service
      idle: {
        spine02: [-0.05, 0, 0], spine03: [-0.06, 0, 0], neck: [0.09, 0, 0], head: [0.02, 0, 0],
        clavicleL: [-0.05, 0, -0.05], clavicleR: [-0.05, 0, 0.05],
        upperArmL: [0.02, 0.05, 0.14], lowerArmL: [-0.30, 0.08, 0],
        upperArmR: [0.02, -0.05, -0.14], lowerArmR: [-0.30, -0.08, 0],
        hips: [-0.02, 0, 0],
      },
      skin: srgb(0x73553f),
      iris: 0x4a3320,
      headWidth: 1.08, jaw: 1.15, cheek: -0.3, nose: 0.45, brow: 0.85, eyeOpen: 0.88,
      blush: 'rgba(132,64,44,0.24)', lip: 'rgba(120,66,58,0.5)',
      browShadow: 'rgba(28,20,14,0.62)', lashColor: 0x0a0806,
      stubble: 0.34, stubbleColor: '#241a12',
      fringeShadow: 0.5,
      brows: { color: 0x201810, len: 0.0165, width: 0.0078 },
      hair: (() => {
        const h = hairSet({ color: 0x171310, tip: 0x2e2620, len: 0.012, back: 0.014, n: 110, spring: 0.05, rough: 0.5 });
        h.tufts.push(...beard(0x171310, 0x33291f, 0.013, 90));
        return h;
      })(),
      outfit: [
        { type: 'shirt', color: 0xd6cfbe, rough: 0.88, u0: 0.30, u1: 0.98, pad: 0.012, neckCut: 0.30, wrinkle: 0.022 },
        { type: 'pants', color: 0x33363c, rough: 0.84, padHip: 0.022, padAnkle: 0.018, u1: 0.94, wrinkle: 0.022 },
        // the apron: a torso plate over the front only, plus a tied waist band
        { type: 'plate', color: 0x8f3f2c, rough: 0.86, u0: 0.22, u1: 0.86, pad: 0.012, theta: [2.05, 4.25] },
        { type: 'belt', color: 0x6a2f22, rough: 0.7, u: 0.34, pad: 0.026 },
        { type: 'band', color: 0xd6cfbe, rough: 0.86, sides: ['L', 'R'], u: 0.62, pad: 0.012, ridge: 0.02 },
        { type: 'boots', color: 0x2b2822, rough: 0.62, shaft: 0.58, height: 0.038 },
      ],
    },
  },

  /* -------------------------------------------------------------- Dave -- */
  dave: {
    name: 'Dave Auburnbrie',
    role: 'Hunter',
    hue: 96,
    profile: { height: 1.845, shoulder: 0.93, muscle: 0.48, hip: 0.94, neck: 1.0, headScale: 1.0 },
    look: {
      seed: 113,
      idle: {
        hips: [0, -0.03, 0.05], spine03: [-0.02, -0.04, -0.02],
        neck: [0.03, 0.02, 0], head: [0.02, 0.03, 0.02],
        upperArmL: [0.05, 0.02, 0.06], lowerArmL: [-0.30, 0, 0],
        upperArmR: [0.16, -0.04, -0.10], lowerArmR: [-0.85, -0.10, 0], handR: [0.1, 0, -0.2],
        thighL: [0.03, 0, 0.04],
      },
      stance: 0.7,
      skin: srgb(0xb18e6b),
      iris: 0x6b5a3a,
      headWidth: 0.98, jaw: 0.55, cheek: 0.15, nose: 0.35, brow: 0.6, eyeOpen: 0.88,
      blush: 'rgba(178,88,62,0.26)', lip: 'rgba(148,84,74,0.48)',
      browShadow: 'rgba(56,42,26,0.54)', lashColor: 0x161009,
      stubble: 0.48, stubbleColor: '#5a4630',
      fringeShadow: 0.4,
      brows: { color: 0x5c4728, len: 0.0155, width: 0.0068 },
      hair: hairSet({ color: 0x4a3823, tip: 0x6f5636, len: 0.020, back: 0.030, n: 100, spring: 0.15 }),
      outfit: [
        { type: 'shirt', color: 0x6d7460, rough: 0.9, u0: 0.30, u1: 0.97, pad: 0.011, neckCut: 0.34, wrinkle: 0.020 },
        { type: 'pants', color: 0x4a4536, rough: 0.86, padHip: 0.018, padAnkle: 0.014, u1: 0.94, cargo: 0.05, wrinkle: 0.020 },
        { type: 'jacket', color: 0x5b4a30, rough: 0.7, u0: 0.34, u1: 0.95, pad: 0.024, gap: 0.44, flare: 0.05, thickness: 0.014, collarH: 0.058, collarR: 0.072, collarFlare: 1.14 },
        { type: 'sleeve', color: 0x5b4a30, rough: 0.7, u0: 0.03, u1: 0.86, pad: 0.016, cuff: 0.04, cuffBand: true, cuffColor: 0x4a3d26 },
        { type: 'belt', color: 0x3a3122, rough: 0.5, u: 0.36, pad: 0.022, buckleBox: true, buckleColor: 0xa89a78 },
        { type: 'pouch', color: 0x3a3122, rough: 0.55, sides: ['L'], u: 0.24, size: [0.055, 0.10, 0.04] },
        { type: 'boots', color: 0x2f2820, rough: 0.5, shaft: 0.76, strap: true, height: 0.042 },
      ],
    },
  },

  /* ------------------------------------------------------ ambient folk -- */
  trucker: {
    name: 'Trucker',
    role: 'Haulier',
    hue: 20,
    profile: { height: 1.79, shoulder: 0.98, muscle: 0.74, hip: 1.10, neck: 1.06, headScale: 1.0 },
    look: {
      seed: 131,
      idle: {
        hips: [0, 0.02, -0.06], spine02: [-0.04, 0, 0], neck: [0.06, 0, 0],
        upperArmL: [0.03, 0, 0.09], lowerArmL: [-0.26, 0, 0],
        upperArmR: [0.03, 0, -0.09], lowerArmR: [-0.26, 0, 0],
      },
      skin: srgb(0xbb9876), iris: 0x5b6a55,
      headWidth: 1.04, jaw: 0.8, cheek: -0.35, nose: 0.5, brow: 0.7, eyeOpen: 0.84,
      blush: 'rgba(178,92,66,0.30)', lip: 'rgba(140,84,76,0.46)',
      browShadow: 'rgba(50,38,26,0.55)', lashColor: 0x14100b,
      stubble: 0.5, stubbleColor: '#4a3c2c',
      brows: { color: 0x4a3c26, len: 0.0155, width: 0.0072 },
      hair: hairSet({ color: 0x3d3128, tip: 0x59493a, len: 0.016, back: 0.020, n: 80, rough: 0.48 }),
      outfit: [
        { type: 'shirt', color: 0x8d4437, rough: 0.9, u0: 0.28, u1: 0.97, pad: 0.012, neckCut: 0.32, wrinkle: 0.026 },
        { type: 'sleeve', color: 0x8d4437, rough: 0.9, u0: 0.03, u1: 0.44, pad: 0.014, cuff: 0.03 },
        { type: 'pants', color: 0x3c4453, rough: 0.86, padHip: 0.022, padAnkle: 0.016, u1: 0.94, wrinkle: 0.024 },
        { type: 'belt', color: 0x2e2820, rough: 0.5, u: 0.34, pad: 0.024, buckleBox: true, buckleColor: 0xbaa274 },
        { type: 'boots', color: 0x2c2620, rough: 0.6, shaft: 0.6, height: 0.040 },
      ],
    },
  },

  mechanic: {
    name: 'Mechanic',
    role: 'Garage hand',
    hue: 210,
    profile: { height: 1.76, shoulder: 0.9, muscle: 0.5, hip: 0.98, neck: 1.0, headScale: 1.02 },
    look: {
      seed: 149,
      idle: {
        spine03: [-0.04, 0.03, 0], neck: [0.05, -0.02, 0],
        upperArmL: [0.05, 0.03, 0.08], lowerArmL: [-0.5, 0.1, 0],
        upperArmR: [0.05, -0.03, -0.08], lowerArmR: [-0.5, -0.1, 0],
      },
      skin: srgb(0xb28f71), iris: 0x40607d,
      headWidth: 0.99, jaw: 0.1, cheek: 0.25, nose: 0.0, brow: 0.3, eyeOpen: 0.94,
      blush: 'rgba(180,92,72,0.30)', lip: 'rgba(150,86,80,0.5)',
      browShadow: 'rgba(48,36,26,0.5)', lashColor: 0x161009,
      stubble: 0.2, stubbleColor: '#3f3226',
      brows: { color: 0x3c2f20, len: 0.014, width: 0.006 },
      hair: hairSet({ color: 0x241c15, tip: 0x3d3226, len: 0.022, back: 0.030, n: 100, spring: 0.2 }),
      outfit: [
        { type: 'shirt', color: 0x8a8f96, rough: 0.9, u0: 0.28, u1: 0.97, pad: 0.011, neckCut: 0.3 },
        { type: 'pants', color: 0x2f4358, rough: 0.86, padHip: 0.020, padAnkle: 0.015, u1: 0.94, wrinkle: 0.022 },
        { type: 'jacket', color: 0x2f4358, rough: 0.8, u0: 0.30, u1: 0.94, pad: 0.022, gap: 0.20, flare: 0.03, thickness: 0.011, collarH: 0.044, collarR: 0.064, collarFlare: 1.02 },
        { type: 'sleeve', color: 0x2f4358, rough: 0.8, u0: 0.03, u1: 0.9, pad: 0.014, cuff: 0.04 },
        { type: 'belt', color: 0x2a2620, rough: 0.5, u: 0.36, pad: 0.020 },
        { type: 'boots', color: 0x272220, rough: 0.6, shaft: 0.6, height: 0.038 },
      ],
    },
  },

  traveller: {
    name: 'Traveller',
    role: 'Passing through',
    hue: 260,
    profile: { height: 1.68, shoulder: 0.84, muscle: 0.3, hip: 1.02, neck: 0.96, headScale: 1.04 },
    look: {
      seed: 167,
      idle: {
        hips: [0, -0.04, 0.08], spine03: [-0.02, -0.05, -0.02],
        neck: [0.02, 0.04, 0], head: [-0.02, 0.05, 0.02],
        upperArmL: [0.04, 0, 0.08], lowerArmL: [-0.34, 0, 0],
        upperArmR: [0.04, 0, -0.08], lowerArmR: [-0.34, 0, 0],
      },
      stance: 0.5,
      skin: srgb(0xc1a383), iris: 0x6a4a7c,
      headWidth: 0.96, jaw: -0.3, cheek: 0.4, nose: -0.15, brow: 0.0, eyeOpen: 1.0,
      blush: 'rgba(198,100,88,0.36)', lip: 'rgba(176,92,88,0.6)',
      browShadow: 'rgba(70,50,34,0.44)', lashColor: 0x241810,
      brows: { color: 0x53402a, len: 0.013, width: 0.0055 },
      hair: (() => {
        const h = hairSet({ color: 0x6a4b2c, tip: 0x9c7748, len: 0.026, back: 0.09, n: 120, spring: 0.5 });
        return h;
      })(),
      outfit: [
        { type: 'shirt', color: 0xb9a98c, rough: 0.88, u0: 0.30, u1: 0.96, pad: 0.010, neckCut: 0.44, wrinkle: 0.018 },
        { type: 'pants', color: 0x4b4a52, rough: 0.8, padHip: 0.016, padAnkle: 0.012, u1: 0.93, wrinkle: 0.016 },
        { type: 'jacket', color: 0x5a4a5e, rough: 0.68, u0: 0.36, u1: 0.94, pad: 0.020, gap: 0.58, flare: 0.05, thickness: 0.011, collarH: 0.052, collarR: 0.062, collarFlare: 1.08 },
        { type: 'sleeve', color: 0x5a4a5e, rough: 0.68, u0: 0.03, u1: 0.88, pad: 0.014, cuff: 0.04 },
        { type: 'belt', color: 0x3a3038, rough: 0.5, u: 0.37, pad: 0.018, buckleBox: true, buckleColor: 0x9aa0a8 },
        { type: 'strap', color: 0x6a5a3c, rough: 0.88, side: 'R', width: 0.014, to: [0.05, 1.15, -0.10] },
        { type: 'boots', color: 0x2f2a2a, rough: 0.5, shaft: 0.7, height: 0.036 },
      ],
    },
  },

  kid: {
    name: 'Kid',
    role: 'Local',
    hue: 150,
    profile: { height: 1.29, shoulder: 0.80, muscle: 0.16, hip: 0.94, neck: 0.92, headScale: 1.30, armScale: 0.94, legScale: 0.94 },
    look: {
      seed: 181,
      idle: {
        hips: [0, 0.06, 0.04], spine01: [0, -0.03, -0.04], spine03: [0.02, -0.08, -0.03],
        neck: [-0.02, 0.06, 0.02], head: [-0.05, 0.10, 0.03],
        upperArmL: [0.03, 0, 0.10], lowerArmL: [-0.30, 0, 0],
        upperArmR: [0.06, 0, -0.12], lowerArmR: [-0.40, 0, 0],
      },
      skin: srgb(0xcbac8d), iris: 0x3f6f9c,
      headWidth: 1.02, jaw: -0.7, cheek: 0.9, nose: -0.55, brow: -0.5, eyeOpen: 1.10,
      blush: 'rgba(216,112,96,0.5)', lip: 'rgba(186,98,94,0.6)',
      browShadow: 'rgba(90,66,40,0.36)', lashColor: 0x2a1c14,
      freckles: true, freckleColor: 'rgba(170,104,62,0.5)',
      brows: { color: 0x6a4f2e, len: 0.011, width: 0.0048 },
      hair: hairSet({ color: 0x3a2a1a, tip: 0x6a4f2e, len: 0.026, back: 0.024, n: 90, spring: 0.3 }),
      outfit: [
        { type: 'shirt', color: 0xc9d2c0, rough: 0.9, u0: 0.28, u1: 0.97, pad: 0.010, neckCut: 0.4, wrinkle: 0.02 },
        { type: 'pants', color: 0x4d6a86, rough: 0.84, u1: 0.52, padHip: 0.014, padAnkle: 0.014, wrinkle: 0.020 },
        { type: 'boots', color: 0x33302c, rough: 0.6, shaft: 0.4, height: 0.030 },
      ],
    },
  },
} satisfies Record<string, NpcCastDef>;

export default NPC_CAST;

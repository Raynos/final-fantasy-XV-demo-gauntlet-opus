import * as THREE from 'three';
import { Rig, creatureMaterial } from './RigBuilder.ts';
import { organicNormal, organicRoughness } from './EnemyBase.ts';
import { QuadrupedEnemy } from './Quadruped.ts';
import { CBuilder, sweep, sculptBlob, horn } from '../rig/Sculpt.ts';
import { clamp01, smooth, lerp } from '../rig/CreatureAnim.ts';

/* A predator has to read as one shape from thirty metres and as an animal from
 * three. That is done with *value*, not with hue: a near-black dorsal saddle,
 * a warm dun flank, a cream throat and belly, and black points on the muzzle
 * and the lower legs. The old palette put every one of these within a few
 * percent of the same brown, which is why the model came back described as a
 * "legless tan mass" — there was no edge anywhere for the eye to catch. */
/* The flank is deliberately a good deal lighter than the saddle it sits under.
 * The previous values (FUR 0x6f5e40 over FUR_MID 0x4c3e28) averaged to about
 * 0x5f4f36 once the ticking was applied, which is only a stop and a half off
 * the saddle — under a bright sun the whole animal collapsed into one milk
 * chocolate silhouette with no dorsal read at all. Widened here: a real dun
 * flank, a near-black saddle, and a cream that is bright enough to survive
 * being in the animal's own shadow. */
const FUR = 0x8b7750;         // flank, the animal's base value
const FUR_DARK = 0x1e180f;    // saddle, mask and points
const FUR_MID = 0x6b5936;     // transition band down the flank
const BELLY = 0xc4b591;       // throat, chest and underside
const RUFF = 0x30261a;        // the collar of longer guard hair
const TUSK = 0xe6ddc4;
const CLAW = 0x2a251f;
const NOSE = 0x120f0d;
const EYE = 0xffa416;

/* Material response is the difference between "brown creature" and an animal:
 * dry matted fur eats light, the wet nose and eye are near-mirrors, keratin
 * sits between the two. One draw call, four surfaces. */
const M_FUR = [0.97, 0];
const M_FUR_WORN = [0.86, 0];
const M_BELLY = [0.93, 0];
const M_TUSK = [0.38, 0.04];
const M_CLAW = [0.31, 0.05];
const M_WET = [0.14, 0.0];

/**
 * Sabertusk — the Leide pack predator. A low, fast, deep-chested canid with a
 * heavy forequarter, a bristled dorsal ridge and a pair of outsized lower
 * tusks. Hunts in threes: one commits, the others circle.
 *
 * Built as continuous swept masses rather than stacked primitives — the
 * ribcage, shoulder and haunch are one torso sweep whose cross-section is
 * shaped per angle, and each leg is a single sweep bound smoothly across four
 * bones, so it bends at shoulder, elbow, wrist and toe at once.
 */
export const SABERTUSK = {
  key: 'sabertusk',
  questId: 'sabertusk',
  faction: 'beast',
  expClass: 'trash',
  stats: {
    name: 'Sabertusk', hp: 780, poise: 42, speed: 5.6, attackRange: 2.1,
    aggroRange: 26, radius: 0.55, height: 1.05, damage: 88, level: 14,
  },
  weakness: 'fire',
  resistPct: { fire: 165, ice: 80, lightning: 100, dark: 100, light: 100 },
  weakTo: ['dagger', 'polearm'],
  senses: { sight: 26, fov: 1.5, hearing: 18 },
  drops: [
    { id: 'sabertusk_fang', chance: 0.45, count: 1 },
    { id: 'venom_fang', chance: 0.12, count: 1 },
  ],
  timing: { telegraph: 0.42, strike: 0.16, attack: 0.42, recover: 0.6 },
  attacks: [
    { id: 'bite', range: 2.2, weight: 3, mult: 1.0, poise: 12, hitRadius: 1.8,
      telegraph: 0.34, strike: 0.14, attack: 0.4, recover: 0.55, cooldown: 1.1 },
    { id: 'pounce', range: 9, minRange: 3.4, weight: 2, mult: 1.5, poise: 22, hitRadius: 2.0,
      telegraph: 0.52, strike: 0.18, attack: 0.55, recover: 0.9, cooldown: 3.2, lunge: 13, tracking: 1.0 },
  ],
  buildPrototype,
  make(opts) { return new SabertuskEnemy(opts); },
};

/* Shoulder height 0.86; nose at z ≈ 1.28; rump at z ≈ -0.78. */
function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('hips', 'root', [0, 0.74, -0.44]);
  rig.bone('spine', 'hips', [0, 0.78, -0.06]);
  rig.bone('chest', 'spine', [0, 0.80, 0.34]);
  rig.bone('neck', 'chest', [0, 0.84, 0.60]);
  rig.bone('head', 'neck', [0, 0.83, 0.86]);
  rig.bone('jaw', 'head', [0, 0.74, 0.90]);
  rig.bone('tail1', 'hips', [0, 0.72, -0.66]);
  rig.bone('tail2', 'tail1', [0, 0.64, -0.94]);
  rig.bone('tail3', 'tail2', [0, 0.52, -1.20]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    // digitigrade: scapula → elbow → carpus → toes
    rig.bone(`fsh${n}`, 'chest', [0.19 * s, 0.74, 0.30]);
    rig.bone(`fel${n}`, `fsh${n}`, [0.22 * s, 0.46, 0.24]);
    rig.bone(`fwr${n}`, `fel${n}`, [0.235 * s, 0.19, 0.32]);
    rig.bone(`fpw${n}`, `fwr${n}`, [0.235 * s, 0.05, 0.36]);
    rig.bone(`bhp${n}`, 'hips', [0.20 * s, 0.75, -0.44]);
    rig.bone(`bkn${n}`, `bhp${n}`, [0.235 * s, 0.48, -0.62]);
    rig.bone(`bhk${n}`, `bkn${n}`, [0.245 * s, 0.20, -0.42]);
    rig.bone(`bpw${n}`, `bhk${n}`, [0.245 * s, 0.05, -0.38]);
  }

  const B = new CBuilder();
  const P = [];

  /* ---------------------------------------------------------- torso ---- */
  // theta 0 = +Z side of the ring; because the sweep runs along +Z the ring
  // frame puts theta = π/2 on the animal's left and 0 on its back.
  B.group(1);
  const backline = (th) => Math.cos(th);           // +1 on the spine, -1 on the belly
  sweep(B, {
    nodes: [
      { p: [0, 0.70, -0.80], rx: 0.145, rz: 0.155 },
      { p: [0, 0.755, -0.60], rx: 0.225, rz: 0.235 },   // haunch
      { p: [0, 0.775, -0.28], rx: 0.205, rz: 0.245 },   // loin, narrow and tucked
      { p: [0, 0.785, 0.02], rx: 0.215, rz: 0.265 },
      { p: [0, 0.795, 0.30], rx: 0.235, rz: 0.30 },     // ribcage, deep not wide
      { p: [0, 0.80, 0.50], rx: 0.215, rz: 0.265 },
      { p: [0, 0.815, 0.62], rx: 0.16, rz: 0.185 },
    ],
    steps: 26, seg: 18, ref: [0, 1, 0],
    capStart: 0.7, capEnd: 0.2,
    shape: (th, u) => {
      const b = backline(th);
      let m = 1;
      // flat withers and a keeled sternum: the vertical section is an egg, not
      // a circle, which is what makes a running predator read as deep-chested
      m += b > 0 ? -0.06 * b * b : 0.10 * b * b * smooth(1 - Math.abs(u - 0.55) * 2.2);
      // tucked flank behind the ribs
      m -= smooth((u - 0.15) / 0.3) * (1 - smooth((u - 0.42) / 0.25)) * 0.10 * clamp01(-b);
      // shoulder blade and haunch mass push out sideways
      const side = Math.abs(Math.sin(th));
      m += side * 0.11 * Math.exp(-Math.pow((u - 0.80) / 0.14, 2));
      m += side * 0.10 * Math.exp(-Math.pow((u - 0.14) / 0.16, 2));
      // rib banding — shallow, only on the lower flank where light rakes it
      m += Math.sin(u * 62) * 0.010 * side * clamp01(-b + 0.4) * smooth((u - 0.5) / 0.2);
      return m;
    },
    colorAt: (th, u) => {
      const b = backline(th);
      // Counter-shading, the way it actually falls on a canid: the saddle
      // starts at the top of the flank rather than only on the spine, the
      // throat and belly go to cream, and the two meet in a soft band. Ticking
      // rides on top of all three so no zone is a flat field — a flat field is
      // what makes a lit hide read as painted plastic.
      const tick = 0.42 + 0.30 * Math.sin(u * 17 + th * 3) + 0.14 * Math.sin(u * 41 - th * 7);
      // the saddle is deepest over the shoulders and rump, lighter over the loin
      const saddle = clamp01((b + 0.02) / 0.50) * (0.72 + 0.28 * Math.cos((u - 0.5) * 5.2));
      const pale = clamp01((-b - 0.28) / 0.5);
      const flank = blend(FUR, FUR_MID, tick);
      if (pale > 0) return blend(flank, BELLY, pale * pale * 0.92);
      return blend(flank, FUR_DARK, saddle * 0.95);
    },
    matAt: (th) => (backline(th) < -0.5 ? M_BELLY : M_FUR),
  });
  P.push({ geo: B.build(), bind: ['chain', ['hips', 'spine', 'chest']] });
  resetB(B);

  /* ------------------------------------------------------ neck + ruff -- */
  B.group(2);
  sweep(B, {
    nodes: [
      { p: [0, 0.81, 0.50], rx: 0.185, rz: 0.20 },
      { p: [0, 0.845, 0.64], rx: 0.165, rz: 0.185 },
      { p: [0, 0.845, 0.80], rx: 0.135, rz: 0.155 },
    ],
    steps: 12, seg: 14, ref: [0, 1, 0], capStart: false, capEnd: false,
    shape: (th, u) => {
      // the ruff: a collar of longer guard hair that widens the silhouette
      const ruff = Math.exp(-Math.pow((u - 0.18) / 0.30, 2)) * 0.30;
      const clump = 1 + Math.sin(th * 9) * 0.14 * ruff * 3;
      return (1 + ruff) * clump;
    },
    colorAt: (th, u) => {
      // the ruff is the darkest thing on the animal except the mask, so the
      // head reads as a separate shape from the shoulders at any distance
      const under = clamp01((-Math.cos(th) - 0.10) / 0.55);
      return blend(blend(RUFF, FUR, 0.30 + 0.34 * (Math.sin(th * 9 + u * 4) * 0.5 + 0.5)),
        BELLY, under * 0.85);
    },
    matAt: () => M_FUR,
  });
  P.push({ geo: B.build(), bind: ['chain', ['chest', 'neck', 'head']] });
  resetB(B);

  /* ------------------------------------------------------------ head --- */
  B.group(3);
  // a wolf skull: braincase, a hard brow shelf over deep-set eyes, prominent
  // zygomatic arches, then a long tapering muzzle
  sculptBlob(B, {
    center: [0, 0.835, 0.955], scale: [0.115, 0.115, 0.20], segU: 26, segV: 18,
    brushes: [
      { p: [0, 0.90, 0.88], r: [0.14, 0.10, 0.13], amt: 0.022, dir: [0, 1, 0] },      // occiput
      { p: [0, 0.885, 0.985], r: [0.13, 0.055, 0.09], amt: 0.030, dir: [0, 1, 0.25] }, // brow shelf
      { p: [0.075, 0.855, 1.035], r: [0.055, 0.05, 0.06], amt: -0.026, dir: 'normal', mirror: true }, // eye socket
      { p: [0.105, 0.825, 0.975], r: [0.055, 0.07, 0.08], amt: 0.022, dir: [1, -0.1, 0], mirror: true }, // zygomatic
      { p: [0.085, 0.775, 0.955], r: [0.07, 0.075, 0.10], amt: 0.026, dir: [1, -0.4, 0], mirror: true }, // masseter
      { p: [0, 0.815, 1.14], r: [0.11, 0.11, 0.16], amt: -0.052, dir: 'normal' },       // muzzle taper
      { p: [0, 0.795, 1.16], r: [0.09, 0.06, 0.14], amt: 0.020, dir: [0, -1, 0.3] },    // muzzle bridge down
      { p: [0, 0.86, 1.06], r: [0.045, 0.05, 0.11], amt: 0.012, dir: [0, 1, 0] },       // nasal bone
      { p: [0.05, 0.79, 1.10], r: [0.05, 0.05, 0.10], amt: 0.014, dir: [1, 0, 0], mirror: true }, // flews
    ],
    colorAt: (u, v, p) => {
      // A bandit mask: black from the brow through the eye and down the bridge
      // of the nose, cream on the cheek and under the jaw. This is the single
      // change that makes the head read as a head instead of a knuckle on the
      // end of the neck.
      const mask = clamp01(1 - Math.hypot((Math.abs(p.x) - 0.058) / 0.072, (p.y - 0.858) / 0.062));
      const bridge = clamp01(1 - Math.abs(p.x) / 0.05) * clamp01((p.z - 1.02) / 0.10) * clamp01((p.y - 0.80) / 0.06);
      const cheek = clamp01((0.845 - p.y) / 0.06) * clamp01(1 - Math.abs(Math.abs(p.x) - 0.09) / 0.07);
      const under = clamp01((0.805 - p.y) / 0.06);
      const base = blend(FUR, BELLY, Math.max(cheek * 0.65, under * 0.8));
      return blend(base, FUR_DARK, clamp01(Math.max(mask, bridge)) * 0.9);
    },
    matAt: (u, v, p) => (p.z > 1.19 ? M_WET : M_FUR),
  });
  // nose leather
  sculptBlob(B, {
    center: [0, 0.795, 1.225], scale: [0.052, 0.040, 0.036], segU: 12, segV: 8,
    brushes: [
      { p: [0, 0.775, 1.245], r: [0.06, 0.03, 0.04], amt: -0.010, dir: [0, 1, 0] },
      { p: [0.028, 0.80, 1.245], r: [0.02, 0.025, 0.03], amt: -0.011, dir: 'normal', mirror: true },
    ],
    colorAt: () => NOSE, matAt: () => M_WET,
  });
  for (const s of [-1, 1]) {
    // eye: a dark globe with a hot iris that catches the bloom
    // brighter than anything else on the head, and a near-mirror, so the eye
    // survives being three pixels across at combat range
    B.glow(EYE, 4.2);
    sculptBlob(B, {
      center: [0.080 * s, 0.851, 1.030], scale: [0.034, 0.030, 0.026], segU: 12, segV: 8,
      colorAt: () => 0x140d02, matAt: () => M_WET,
    });
    B.glow(null);
    // ear: a swept cone with a folded rim
    sweep(B, {
      nodes: [
        { p: [0.088 * s, 0.895, 0.855], rx: 0.055, rz: 0.030 },
        { p: [0.108 * s, 0.955, 0.835], rx: 0.045, rz: 0.024 },
        { p: [0.125 * s, 1.005, 0.815], rx: 0.020, rz: 0.012 },
      ],
      steps: 7, seg: 9, ref: [0, 0, 1], capStart: 0.4, capEnd: 0.5,
      colorAt: (th, u) => blend(FUR_DARK, 0x1a1512, u * 0.6),
      matAt: () => M_FUR,
    });
    // upper canine
    horn(B, {
      from: [0.052 * s, 0.792, 1.145], dir: [0.05 * s, -1, 0.05], len: 0.085,
      r0: 0.017, r1: 0.002, seg: 6, steps: 5, colorAt: () => TUSK, matAt: () => M_TUSK,
    });
  }

  /* the tusks — the read at 30 m. Long, curved, and lit brighter than
   * anything else on the animal so they carry the silhouette. */
  for (const s of [-1, 1]) {
    horn(B, {
      from: [0.072 * s, 0.755, 1.075], dir: [0.10 * s, 0.62, 0.78], len: 0.30,
      curve: [0.05 * s, 0.10, -0.16], r0: 0.036, r1: 0.004, taper: 0.75,
      seg: 8, steps: 8, flat: 0.82, colorAt: () => TUSK, matAt: () => M_TUSK,
    });
    horn(B, {
      from: [0.056 * s, 0.752, 0.985], dir: [0.08 * s, 0.9, 0.42], len: 0.13,
      curve: [0.01 * s, 0.02, -0.05], r0: 0.019, r1: 0.003,
      seg: 6, steps: 5, colorAt: () => TUSK, matAt: () => M_TUSK,
    });
  }
  P.push({ geo: B.build(), bind: ['bone', 'head'] });
  resetB(B);

  /* ------------------------------------------------------------- jaw --- */
  B.group(4);
  sweep(B, {
    nodes: [
      { p: [0, 0.745, 0.895], rx: 0.085, rz: 0.070 },
      { p: [0, 0.735, 1.02], rx: 0.062, rz: 0.055 },
      { p: [0, 0.735, 1.16], rx: 0.038, rz: 0.036 },
    ],
    steps: 9, seg: 11, ref: [0, 1, 0], capStart: 0.5, capEnd: 0.6,
    shape: (th) => 1 + Math.max(0, Math.cos(th)) * 0.18,   // fleshy chin
    colorAt: (th) => (Math.cos(th) < -0.2 ? BELLY : FUR_DARK),
    matAt: () => M_FUR,
  });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      horn(B, {
        from: [(0.030 + i * 0.008) * s, 0.755, 1.02 + i * 0.045], dir: [0, 1, 0.05],
        len: 0.030 - i * 0.005, r0: 0.009, r1: 0.001, seg: 5, steps: 3,
        colorAt: () => TUSK, matAt: () => M_TUSK,
      });
    }
  }
  P.push({ geo: B.build(), bind: ['bone', 'jaw'] });
  resetB(B);

  /* --------------------------------------------------------- dorsal ---- */
  // The bristle ridge. Emitted as flattened blades rather than cones so the
  // ridge reads as hair standing up, and split across three bones so it moves
  // with the spine when the animal hunches.
  for (const [bone, z0, z1, n] of [['hips', -0.72, -0.30, 4], ['spine', -0.26, 0.16, 5], ['chest', 0.20, 0.56, 4]]) {
    B.group(5);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const z = lerp(z0, z1, t);
      const g = clamp01((z + 0.75) / 1.35);
      const h = 0.075 + Math.sin(g * Math.PI) * 0.135;
      horn(B, {
        from: [0, 0.90 + Math.sin(g * Math.PI) * 0.055, z], dir: [0, 0.82, -0.57],
        len: h * 1.35, curve: [0, -0.03, -0.05], r0: 0.030, r1: 0.002, flat: 0.30,
        seg: 5, steps: 4, colorAt: () => FUR_DARK, matAt: () => M_FUR_WORN,
      });
    }
    P.push({ geo: B.build(), bind: ['bone', bone] });
    resetB(B);
  }

  /* ------------------------------------------------------------ legs --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    // front: one sweep, scapula through toes, bound across all four bones
    B.group(6);
    sweep(B, {
      // Radii deliberately *not* monotone. A limb that only ever narrows is a
      // cone, and a cone is what the whole animal read as; a real forelimb
      // swells at the triceps, pinches at the elbow, swells again over the
      // extensor mass and pinches at the carpus, and it is those four changes
      // of direction that make it read as a leg with bones in it.
      nodes: [
        { p: [0.185 * s, 0.86, 0.28], rx: 0.128, rz: 0.152 },   // scapula
        { p: [0.205 * s, 0.66, 0.28], rx: 0.122, rz: 0.142 },   // triceps
        { p: [0.220 * s, 0.46, 0.24], rx: 0.068, rz: 0.078 },   // elbow
        { p: [0.232 * s, 0.30, 0.28], rx: 0.058, rz: 0.064 },   // forearm
        { p: [0.235 * s, 0.19, 0.32], rx: 0.034, rz: 0.038 },   // carpus
        { p: [0.235 * s, 0.09, 0.345], rx: 0.038, rz: 0.044 },  // metacarpus
      ],
      steps: 20, seg: 11, ref: [0, 0, 1], capStart: 0.5, capEnd: false,
      shape: (th, u) => {
        // the front of the limb is taut over bone, the back carries muscle
        const back = -Math.cos(th);
        return 1 + Math.max(0, back) * 0.20 * Math.exp(-Math.pow((u - 0.22) / 0.20, 2))
          + Math.max(0, back) * 0.10 * Math.exp(-Math.pow((u - 0.62) / 0.14, 2));
      },
      // black points from the elbow down, pale on the inside of the limb where
      // it faces its opposite number — the pale strip is what separates the two
      // near legs from the two far ones when the animal is side-on
      colorAt: (th, u) => {
        const inner = clamp01(Math.sin(th) * s * -1) * clamp01((0.5 - u) / 0.4);
        const top = blend(FUR, BELLY, inner * 0.45);
        return blend(top, FUR_DARK, clamp01((u - 0.42) / 0.30) * 0.95);
      },
      matAt: () => M_FUR,
    });
    P.push({ geo: B.build(), bind: ['chain', [`fsh${n}`, `fel${n}`, `fwr${n}`, `fpw${n}`]] });
    resetB(B);

    B.group(7);
    paw(B, 0.235 * s, 0.05, 0.375, 1);
    P.push({ geo: B.build(), bind: ['bone', `fpw${n}`] });
    resetB(B);

    // back: the powerful one. Thigh, gaskin, then a long thin hock.
    B.group(6);
    sweep(B, {
      nodes: [
        { p: [0.195 * s, 0.86, -0.42], rx: 0.152, rz: 0.176 },  // rump
        { p: [0.215 * s, 0.66, -0.50], rx: 0.146, rz: 0.168 },  // thigh
        { p: [0.235 * s, 0.48, -0.60], rx: 0.074, rz: 0.086 },  // stifle
        { p: [0.242 * s, 0.32, -0.52], rx: 0.062, rz: 0.070 },  // gaskin, the drive muscle
        { p: [0.245 * s, 0.20, -0.42], rx: 0.030, rz: 0.034 },  // hock, bone and tendon only
        { p: [0.245 * s, 0.09, -0.385], rx: 0.036, rz: 0.042 }, // metatarsus
      ],
      steps: 20, seg: 11, ref: [0, 0, 1], capStart: 0.5, capEnd: false,
      shape: (th, u) => {
        const back = -Math.cos(th);
        return 1 + Math.max(0, back) * 0.26 * Math.exp(-Math.pow((u - 0.18) / 0.22, 2))
          + Math.max(0, -back) * 0.10 * Math.exp(-Math.pow((u - 0.52) / 0.16, 2));
      },
      colorAt: (th, u) => {
        const inner = clamp01(Math.sin(th) * s * -1) * clamp01((0.5 - u) / 0.4);
        const top = blend(FUR, BELLY, inner * 0.45);
        return blend(top, FUR_DARK, clamp01((u - 0.42) / 0.30) * 0.95);
      },
      matAt: () => M_FUR,
    });
    P.push({ geo: B.build(), bind: ['chain', [`bhp${n}`, `bkn${n}`, `bhk${n}`, `bpw${n}`]] });
    resetB(B);

    B.group(7);
    paw(B, 0.245 * s, 0.05, -0.355, -1);
    P.push({ geo: B.build(), bind: ['bone', `bpw${n}`] });
    resetB(B);
  }

  /* ------------------------------------------------------------ tail --- */
  B.group(8);
  sweep(B, {
    nodes: [
      { p: [0, 0.74, -0.60], rx: 0.075, rz: 0.075 },
      { p: [0, 0.70, -0.80], rx: 0.062, rz: 0.062 },
      { p: [0, 0.62, -1.00], rx: 0.052, rz: 0.052 },
      { p: [0, 0.52, -1.20], rx: 0.048, rz: 0.048 },
      { p: [0, 0.44, -1.34], rx: 0.026, rz: 0.026 },
    ],
    steps: 16, seg: 9, ref: [0, 1, 0], capStart: false, capEnd: 0.6,
    shape: (th, u) => 1 + Math.sin(th * 7) * 0.10 * smooth((u - 0.25) / 0.4)
      + smooth((u - 0.45) / 0.35) * (1 - smooth((u - 0.85) / 0.15)) * 0.55,
    // brush tail: dun at the root, black at the tip, so the tail reads against
    // the body when it is held out and against the ground when it is down
    colorAt: (th, u) => blend(FUR, FUR_DARK, clamp01((u - 0.25) / 0.45) * 0.95),
    matAt: () => M_FUR,
  });
  P.push({ geo: B.build(), bind: ['chain', ['tail1', 'tail2', 'tail3']] });
  resetB(B);

  for (const p of P) {
    if (p.bind[0] === 'chain') rig.attachChain(p.geo, p.bind[1], 0.95);
    else rig.attach(p.geo, p.bind[1]);
  }

  const mat = creatureMaterial({
    roughness: 0.95, metalness: 0.0,
    normalMap: organicNormal(), normalScale: 0.85, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 2.0, coat: { mottle: 0.13, tick: 0.16, shade: 0.18, dust: 0.30, dustTop: 0.30 } });
}

/** Toe pad group: three digits and their claws. */
function paw(B, x, y, z, dir) {
  const sgn = Math.sign(x) || 1;
  for (let i = -1; i <= 1; i++) {
    const ox = x + i * 0.033 * sgn;
    const oz = z + (1 - Math.abs(i) * 0.35) * 0.022 * dir;
    sweep(B, {
      nodes: [
        { p: [ox, y + 0.035, oz - dir * 0.03], rx: 0.026, rz: 0.030 },
        { p: [ox, y + 0.012, oz + dir * 0.024], rx: 0.024, rz: 0.030 },
        { p: [ox, y + 0.004, oz + dir * 0.055], rx: 0.017, rz: 0.020 },
      ],
      steps: 5, seg: 8, ref: [0, 1, 0], capStart: 0.6, capEnd: 0.5,
      colorAt: () => 0x1e1a16, matAt: () => [0.88, 0],
    });
    horn(B, {
      from: [ox, y + 0.006, oz + dir * 0.062], dir: [0, -0.12, dir], len: 0.042,
      curve: [0, -0.016, 0], r0: 0.010, r1: 0.001, seg: 5, steps: 4,
      colorAt: () => CLAW, matAt: () => M_CLAW,
    });
  }
}

function resetB(B) {
  B.pos.length = 0; B.uv.length = 0; B.col.length = 0;
  B.emi.length = 0; B.mp.length = 0; B.grp.length = 0; B.idx.length = 0;
  B.glow(null);
}

const _c1 = new THREE.Color(), _c2 = new THREE.Color();
/**
 * sRGB blend, returned as a working-space Colour.
 *
 * Either end may be a hex literal *or* an already-blended Colour, which is the
 * point: layering counter-shading over ticking over a mask is three blends
 * deep, and the previous version only accepted numbers. `Color.setHex` runs
 * `Math.floor` on its argument, so handing it a Colour produced `NaN` and the
 * surface came out black with no error anywhere — which is what the sabertusk's
 * head has been doing.
 *
 * @param {number|THREE.Color} a
 * @param {number|THREE.Color} b
 * @param {number} t
 */
function blend(a, b, t) {
  if (typeof b === 'number') _c2.setHex(b, THREE.SRGBColorSpace); else _c2.copy(b);
  if (typeof a === 'number') _c1.setHex(a, THREE.SRGBColorSpace); else if (a !== _c1) _c1.copy(a);
  return _c1.lerp(_c2, clamp01(t));
}

class SabertuskEnemy extends QuadrupedEnemy {
  constructor(opts) { super(SABERTUSK, opts); }

  /** A pounce coils harder and leaves the ground; a bite barely does either. */
  telegraphScale() { return this.attackId === 'pounce' ? 1.15 : 0.8; }
  leapScale() { return this.attackId === 'pounce' ? 1.0 : 0.4; }
}

SabertuskEnemy.ANIM = {
  legs: {
    fL: ['fshL', 'felL', 'fwrL', 'fpwL'], fR: ['fshR', 'felR', 'fwrR', 'fpwR'],
    bL: ['bhpL', 'bknL', 'bhkL', 'bpwL'], bR: ['bhpR', 'bknR', 'bhkR', 'bpwR'],
  },
  trunk: ['hips', 'spine', 'chest', 'neck', 'head'],
  tails: ['tail1', 'tail2', 'tail3'],
  jawBone: 'jaw',
  strideLen: 1.05, stride: 0.24, lift: 0.13, splay: 0.02,
  crouch: 0.13, crouchFront: 0.05, crouchBack: -0.11, crouchPitch: 0.16, headDown: 0.30,
  lunge: 0.26, lungeLift: 0.34, lungeLiftBack: 0.10, hop: 0.20,
  strikePitch: 0.20, headThrust: 0.30, jaw: 0.30, jawBite: 0.95,
  runNeck: 0.14, runHead: 0.12, flex: 1.0,
  bodyY: 0.79, bodyR: 0.27, deathRoll: 1.32,
  tailRun: -0.35, tailIdle: -0.12,
};

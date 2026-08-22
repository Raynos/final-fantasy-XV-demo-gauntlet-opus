import { Rig, creatureMaterial } from './RigBuilder.ts';
import { mixc, colc } from './Palette.ts';
import { organicNormal, organicRoughness } from './EnemyBase.ts';
import { QuadrupedEnemy } from './Quadruped.ts';
import { CBuilder, sweep, sculptBlob, horn } from '../rig/Sculpt.ts';
import { attackEnvelope, clamp01, smooth, lerp } from '../rig/CreatureAnim.ts';
import type * as THREE from 'three';

/* A black animal is the hardest thing to light. Pure black is a hole in the
 * frame, so the "black" here is a lifted blue-grey and every plane that could
 * catch a rim gets pushed further — the tan flashes, the pale muzzle and the
 * bone-white claws are what actually carry the read at distance. */
const FUR = 0x4b4658;
const FUR_DARK = 0x2b2834;
const FUR_LIGHT = 0x6f6880;
const TAN = 0xc99c4e;
const TAN_DARK = 0x8a6c31;
const MUZZLE = 0xb3a8b8;
const CLAW = 0xe2dcc8;
const WHISK = 0x5a626e;
const WHISK_LIT = 0x9fb0c2;
const NOSE = 0x2a2228;
const ARC = 0x9fdcff;

const M_FUR = [0.92, 0];
const M_FUR_SLEEK = [0.68, 0];   // the sleek coat over shoulder and haunch
const M_CLAW = [0.26, 0.06];
const M_WHISK = [0.30, 0.35];    // segmented, faintly metallic
const M_WET = [0.12, 0];

/** Nine samples the whisker chain sweeps through, magnitudes for the +X side. */
const WHISKER = [
  [0.085, 0.985, 1.12], [0.120, 1.060, 1.00], [0.165, 1.160, 0.85],
  [0.220, 1.290, 0.64], [0.280, 1.440, 0.38], [0.335, 1.580, 0.08],
  [0.390, 1.700, -0.26], [0.430, 1.780, -0.62], [0.465, 1.830, -1.00],
];

/**
 * Coeurl — the panther-daemon that has stalked every Final Fantasy since the
 * first.
 *
 * Low, long, and built entirely for one lunge. The body is a sleek black
 * predator with tan flashes down the flank and a pale muzzle; the *silhouette*
 * is the pair of enormous segmented whiskers that arc back off the face higher
 * than the animal is tall and end above its own hips. Those whiskers are the
 * weapon and the warning both: they hold the charge, they brighten while it
 * builds, and when they swing forward and level, the line they are pointing
 * down is about to be a lightning bolt.
 */
export const COEURL = {
  key: 'coeurl',
  questId: 'coeurl',
  faction: 'beast',
  expClass: 'elite',
  stats: {
    name: 'Coeurl', hp: 3800, poise: 80, speed: 7.2, attackRange: 2.6,
    aggroRange: 34, radius: 0.75, height: 1.4, damage: 240, level: 22,
  },
  weakness: 'ice',
  resist: 'lightning',
  resistPct: { lightning: 0, ice: 165, fire: 100, dark: 100, light: 100 },
  weakTo: ['dagger'],
  senses: { sight: 34, fov: 1.8, hearing: 26, nocturnal: false },
  drops: [
    { id: 'coeurl_whiskers', chance: 0.45, count: 1 },
  ],
  timing: { telegraph: 0.40, strike: 0.14, attack: 0.50, recover: 0.62 },
  attacks: [
    // closes the gap in one flat leap
    { id: 'pounce', range: 12, minRange: 3.5, weight: 2, mult: 1.4, poise: 34, hitRadius: 2.2,
      telegraph: 0.50, strike: 0.18, attack: 0.58, recover: 0.70, cooldown: 3.2,
      lunge: 14, tracking: 0.7 },
    // two swipes, faster than anything else in the bestiary
    { id: 'claw', range: 2.6, weight: 3, mult: 0.85, poise: 20, hitRadius: 2.0, arc: 1.5,
      telegraph: 0.28, strike: 0.12, attack: 0.44, recover: 0.50, cooldown: 1.1 },
    // Blaster: the whiskers come forward, blaze, and discharge down the line.
    // The longest telegraph it has, and deliberately the loudest one.
    { id: 'blaster', range: 18, minRange: 6, weight: 2, mult: 1.6, poise: 52, hitRadius: 1.8,
      telegraph: 1.10, strike: 0.24, attack: 0.82, recover: 1.10, cooldown: 6.5,
      ranged: true, element: 'lightning', tracking: 1.2, unblockable: true },
  ],
  buildPrototype,
  make(opts: any) { return new CoeurlEnemy(opts); },
};

/* Shoulder 0.98, whisker tips reach y ≈ 1.83 and z ≈ -1.0. */
function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('hips', 'root', [0, 0.84, -0.58]);
  rig.bone('spine', 'hips', [0, 0.89, -0.12]);
  rig.bone('chest', 'spine', [0, 0.93, 0.36]);
  rig.bone('neck', 'chest', [0, 0.94, 0.66]);
  rig.bone('head', 'neck', [0, 0.95, 0.92]);
  rig.bone('jaw', 'head', [0, 0.88, 0.98]);
  rig.bone('tail1', 'hips', [0, 0.84, -0.80]);
  rig.bone('tail2', 'tail1', [0, 0.80, -1.16]);
  rig.bone('tail3', 'tail2', [0, 0.74, -1.52]);
  rig.bone('tail4', 'tail3', [0, 0.66, -1.86]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`fsh${n}`, 'chest', [0.20 * s, 0.86, 0.32]);
    rig.bone(`fel${n}`, `fsh${n}`, [0.22 * s, 0.56, 0.28]);
    rig.bone(`fwr${n}`, `fel${n}`, [0.23 * s, 0.22, 0.34]);
    rig.bone(`fpw${n}`, `fwr${n}`, [0.23 * s, 0.06, 0.40]);
    rig.bone(`bhp${n}`, 'hips', [0.22 * s, 0.86, -0.56]);
    rig.bone(`bkn${n}`, `bhp${n}`, [0.245 * s, 0.56, -0.72]);
    rig.bone(`bhk${n}`, `bkn${n}`, [0.255 * s, 0.22, -0.50]);
    rig.bone(`bpw${n}`, `bhk${n}`, [0.255 * s, 0.06, -0.42]);
    // the whisker chain — three joints out along the arc
    rig.bone(`wk1${n}`, 'head', [WHISKER[2][0] * s, WHISKER[2][1], WHISKER[2][2]]);
    rig.bone(`wk2${n}`, `wk1${n}`, [WHISKER[4][0] * s, WHISKER[4][1], WHISKER[4][2]]);
    rig.bone(`wk3${n}`, `wk2${n}`, [WHISKER[6][0] * s, WHISKER[6][1], WHISKER[6][2]]);
  }

  const B = new CBuilder();
  /**
   * Built parts and how each attaches: to one bone, or skinned along a chain.
   * A tuple union rather than two fields, because the pair below reads it with
   * `bind[0] === 'chain'`.
   */
  const P: { geo: THREE.BufferGeometry, bind: ['chain', string[]] | ['bone', string] }[] = [];
  const emit = (bind: ['chain', string[]] | ['bone', string]) => { P.push({ geo: B.build(), bind }); reset(B); };

  /* ------------------------------------------------------------ torso -- */
  B.group(1);
  sweep(B, {
    nodes: [
      { p: [0, 0.80, -0.92], rx: 0.165, rz: 0.180 },
      { p: [0, 0.845, -0.68], rx: 0.265, rz: 0.275 },   // haunch — the engine
      { p: [0, 0.865, -0.32], rx: 0.225, rz: 0.255 },   // waist, drawn in
      { p: [0, 0.885, 0.04], rx: 0.240, rz: 0.290 },
      { p: [0, 0.905, 0.34], rx: 0.265, rz: 0.330 },    // ribcage
      { p: [0, 0.925, 0.54], rx: 0.235, rz: 0.280 },
      { p: [0, 0.935, 0.66], rx: 0.170, rz: 0.195 },
    ],
    // 34 rather than 26 steps along the body: the flank carries five tan bars
    // and a bar pattern needs about seven samples per cycle before the sweep
    // starts eating it. The extra 288 triangles are cheap next to a smear.
    steps: 34, seg: 18, ref: [0, 1, 0], capStart: 0.7, capEnd: 0.2,
    shape: (th, u) => {
      const b = Math.cos(th);
      const side = Math.abs(Math.sin(th));
      let m = 1;
      // a cat is a cylinder squashed vertically at the loin and deep at the ribs
      m += b > 0 ? -0.05 * b * b : 0.08 * b * b * smooth(1 - Math.abs(u - 0.55) * 2.0);
      m -= smooth((u - 0.16) / 0.26) * (1 - smooth((u - 0.44) / 0.22)) * 0.09 * clamp01(-b);
      // the shoulder blades ride *above* the spine line on a stalking cat
      m += side * 0.13 * Math.exp(-Math.pow((u - 0.80) / 0.12, 2));
      m += Math.max(0, b) * 0.10 * Math.exp(-Math.pow((u - 0.80) / 0.09, 2));
      m += side * 0.13 * Math.exp(-Math.pow((u - 0.16) / 0.14, 2));
      return m;
    },
    colorAt: (th, u) => {
      const b = Math.cos(th);
      const side = Math.abs(Math.sin(th));
      if (b < -0.45) return mix(FUR_LIGHT, MUZZLE, clamp01((-b - 0.45) / 0.55) * 0.55);
      const base = mix(FUR, FUR_DARK, clamp01(b) * 0.62);
      // Five broken tan bars down the flank, wavering as they climb the ribs.
      //
      // The first version was two 0.15-wide gaussians, which merged into one
      // amber blot across the entire ribcage: at six metres the animal looked
      // like it had a lens flare stuck to its side rather than markings. Bars
      // are also what a coeurl *is* — the read has to survive being a black
      // cat, and a broken vertical rhythm survives where a soft patch does not.
      const bar = Math.pow(clamp01(Math.sin(u * 31.4 + Math.cos(th * 2.0) * 0.55) * 0.5 + 0.5), 3.5);
      const t = bar * side * clamp01(-b + 0.72) * 0.66;
      return mix(base, mix(TAN, TAN_DARK, 0.55), t);
    },
    matAt: (th, u) => (Math.abs(Math.sin(th)) > 0.6 ? M_FUR_SLEEK : M_FUR),
  });
  P.push({ geo: B.build(), bind: ['chain', ['hips', 'spine', 'chest']] });
  reset(B);

  /* ------------------------------------------------------------- neck -- */
  B.group(2);
  sweep(B, {
    nodes: [
      { p: [0, 0.925, 0.56], rx: 0.205, rz: 0.215 },
      { p: [0, 0.935, 0.72], rx: 0.180, rz: 0.190 },
      { p: [0, 0.945, 0.86], rx: 0.150, rz: 0.165 },
    ],
    steps: 11, seg: 14, ref: [0, 1, 0], capStart: false, capEnd: false,
    shape: (th, u) => 1 + Math.max(0, -Math.cos(th)) * 0.12 * smooth(u),
    colorAt: (th, u) => (Math.cos(th) < -0.4 ? mix(FUR_LIGHT, MUZZLE, 0.35) : mix(FUR, FUR_DARK, clamp01(Math.cos(th)) * 0.5)),
    matAt: () => M_FUR_SLEEK,
  });
  P.push({ geo: B.build(), bind: ['chain', ['chest', 'neck', 'head']] });
  reset(B);

  /* ------------------------------------------------------------- head -- */
  B.group(3);
  // A cat skull: broad round braincase, huge cheek arches, and a short blunt
  // muzzle. Almost the opposite of the sabertusk's long wedge.
  sculptBlob(B, {
    center: [0, 0.955, 1.00], scale: [0.145, 0.130, 0.165], segU: 24, segV: 17,
    brushes: [
      { p: [0, 1.02, 0.93], r: [0.16, 0.10, 0.14], amt: 0.022, dir: [0, 1, -0.2] },      // crown
      { p: [0, 1.005, 1.04], r: [0.14, 0.05, 0.09], amt: 0.020, dir: [0, 1, 0.3] },      // brow
      { p: [0.085, 0.985, 1.075], r: [0.055, 0.05, 0.06], amt: -0.020, dir: 'normal', mirror: true },
      { p: [0.135, 0.945, 0.995], r: [0.06, 0.09, 0.11], amt: 0.036, dir: [1, -0.1, 0], mirror: true }, // cheek ruff
      { p: [0, 0.945, 1.16], r: [0.115, 0.115, 0.13], amt: -0.036, dir: 'normal' },      // short muzzle
      { p: [0, 0.925, 1.13], r: [0.095, 0.06, 0.09], amt: 0.024, dir: [0, -0.7, 1] },    // whisker pad
      { p: [0, 0.885, 1.02], r: [0.10, 0.05, 0.11], amt: -0.018, dir: [0, 1, 0] },       // jaw undercut
    ],
    colorAt: (u: any, v: any, p: any) => {
      const pad = clamp01((p.z - 1.09) / 0.09) * clamp01((0.985 - p.y) / 0.07);
      const crown = clamp01((p.y - 0.99) / 0.06);
      return mix(mix(FUR, FUR_DARK, crown * 0.6), MUZZLE, pad * 0.8);
    },
    matAt: (u: any, v: any, p: any) => (p.z > 1.19 && p.y < 0.95 ? M_WET : M_FUR),
  });
  // nose
  sculptBlob(B, {
    center: [0, 0.940, 1.175], scale: [0.038, 0.028, 0.026], segU: 10, segV: 7,
    brushes: [{ p: [0, 0.925, 1.19], r: [0.05, 0.025, 0.03], amt: -0.008, dir: [0, 1, 0] }],
    colorAt: () => col(NOSE), matAt: () => M_WET,
  });
  for (const s of [-1, 1]) {
    // eye — big, forward, and the brightest thing on the head bar the whiskers
    B.glow(ARC, 3.0);
    sculptBlob(B, {
      center: [0.086 * s, 0.982, 1.078], scale: [0.030, 0.026, 0.022], segU: 10, segV: 7,
      colorAt: () => col(0x081418), matAt: () => M_WET,
    });
    B.glow(null);
    // ear: tall, tufted, angled out
    sweep(B, {
      nodes: [
        { p: [0.105 * s, 1.030, 0.930], rx: 0.062, rz: 0.030 },
        { p: [0.130 * s, 1.100, 0.905], rx: 0.048, rz: 0.023 },
        { p: [0.152 * s, 1.165, 0.880], rx: 0.016, rz: 0.009 },
      ],
      steps: 7, seg: 9, ref: [0, 0, 1], capStart: 0.4, capEnd: 0.5,
      colorAt: (th, u) => mix(FUR_DARK, FUR_LIGHT, Math.max(0, Math.cos(th)) * 0.6),
      matAt: () => M_FUR,
    });
    // ear tuft
    horn(B, {
      from: [0.150 * s, 1.160, 0.885], dir: [0.35 * s, 0.90, -0.25], len: 0.075,
      r0: 0.012, r1: 0.001, flat: 0.4, seg: 5, steps: 3,
      colorAt: () => col(FUR_DARK), matAt: () => M_FUR,
    });
    // upper canine — bone-white, always showing
    horn(B, {
      from: [0.056 * s, 0.905, 1.115], dir: [0.06 * s, -1, 0.10], len: 0.085,
      curve: [0, 0, -0.012], r0: 0.016, r1: 0.002, seg: 6, steps: 4,
      colorAt: () => col(CLAW), matAt: () => M_CLAW,
    });
  }
  emit(['bone', 'head']);

  /* -------------------------------------------------------------- jaw -- */
  B.group(4);
  sweep(B, {
    nodes: [
      { p: [0, 0.885, 0.98], rx: 0.098, rz: 0.080 },
      { p: [0, 0.880, 1.07], rx: 0.078, rz: 0.062 },
      { p: [0, 0.885, 1.15], rx: 0.052, rz: 0.044 },
    ],
    steps: 8, seg: 11, ref: [0, 1, 0], capStart: 0.5, capEnd: 0.6,
    shape: (th) => 1 + Math.max(0, Math.cos(th)) * 0.16,
    colorAt: (th) => (Math.cos(th) < -0.2 ? col(MUZZLE) : col(FUR_DARK)),
    matAt: () => M_FUR,
  });
  for (const s of [-1, 1]) {
    horn(B, {
      from: [0.048 * s, 0.895, 1.06], dir: [0, 1, 0.10], len: 0.055,
      r0: 0.012, r1: 0.001, seg: 5, steps: 3, colorAt: () => col(CLAW), matAt: () => M_CLAW,
    });
  }
  emit(['bone', 'jaw']);

  /* --------------------------------------------------------- whiskers -- */
  // The silhouette. One continuous segmented sweep per side, bound across the
  // head and all three whisker joints so it lashes as a chain, with the outer
  // third emissive so the charge it is holding reads before anything else.
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    B.group(5);
    const nodes = WHISKER.map((w, i) => {
      const t = i / (WHISKER.length - 1);
      return { p: [w[0] * s, w[1], w[2]], rx: lerp(0.040, 0.011, Math.pow(t, 0.75)) };
    });
    sweep(B, {
      nodes, steps: 30, seg: 8, ref: [0, 1, 0], capStart: 0.5, capEnd: 0.6,
      // segmented like an insect antenna: hard swellings at regular intervals
      shape: (th, u) => 1 + Math.max(0, Math.sin(u * 46)) * 0.22,
      colorAt: (th, u) => mix(WHISK, WHISK_LIT, smooth((u - 0.35) / 0.6)),
      matAt: () => M_WHISK,
      glowAt: (th: any, u: any) => (u > 0.42 ? [ARC, (u - 0.42) * 2.6] : null),
    });
    // charge beads sitting on each joint
    for (const i of [2, 4, 6, 8]) {
      const t = i / (WHISKER.length - 1);
      B.glow(ARC, 0.7 + t * 2.4);
      sculptBlob(B, {
        center: [WHISKER[i][0] * s, WHISKER[i][1], WHISKER[i][2]],
        scale: [0.032, 0.032, 0.032], segU: 8, segV: 6,
        colorAt: () => col(0x0d2530), matAt: () => [0.25, 0.2],
      });
      B.glow(null);
    }
    P.push({ geo: B.build(), bind: ['chain', ['head', `wk1${n}`, `wk2${n}`, `wk3${n}`]] });
    reset(B);
  }

  /* ----------------------------------------------------- spine spurs --- */
  const spurs: [string, number, number, number][] = [['hips', -0.84, -0.36, 4], ['spine', -0.30, 0.16, 5], ['chest', 0.20, 0.52, 3]];
  for (const [bone, z0, z1, n] of spurs) {
    B.group(6);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const z = lerp(z0, z1, t);
      const g = clamp01((z + 0.88) / 1.44);
      horn(B, {
        from: [0, 0.955 + Math.sin(g * Math.PI) * 0.045, z], dir: [0, 0.80, -0.60],
        len: 0.040 + Math.sin(g * Math.PI) * 0.055, curve: [0, -0.012, -0.02],
        r0: 0.022, r1: 0.002, flat: 0.35, seg: 5, steps: 3,
        colorAt: () => col(CLAW), matAt: () => M_CLAW,
      });
    }
    P.push({ geo: B.build(), bind: ['bone', bone] });
    reset(B);
  }

  /* -------------------------------------------------------------- legs - */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    B.group(7);
    sweep(B, {
      nodes: [
        { p: [0.185 * s, 0.99, 0.30], rx: 0.115, rz: 0.135 },   // scapula
        { p: [0.205 * s, 0.74, 0.29], rx: 0.108, rz: 0.125 },   // triceps
        { p: [0.220 * s, 0.56, 0.28], rx: 0.078, rz: 0.088 },   // elbow
        { p: [0.228 * s, 0.38, 0.31], rx: 0.052, rz: 0.058 },   // forearm
        { p: [0.230 * s, 0.22, 0.34], rx: 0.044, rz: 0.048 },   // carpus
        { p: [0.230 * s, 0.10, 0.375], rx: 0.040, rz: 0.046 },  // metacarpus
      ],
      steps: 20, seg: 11, ref: [0, 0, 1], capStart: 0.5, capEnd: false,
      shape: (th, u) => {
        const back = -Math.cos(th);
        return 1 + Math.max(0, back) * 0.24 * Math.exp(-Math.pow((u - 0.20) / 0.20, 2))
          + Math.max(0, back) * 0.10 * Math.exp(-Math.pow((u - 0.60) / 0.13, 2));
      },
      colorAt: (th, u) => mix(FUR, FUR_DARK, clamp01((u - 0.4) / 0.55) * 0.8),
      matAt: () => M_FUR_SLEEK,
    });
    P.push({ geo: B.build(), bind: ['chain', [`fsh${n}`, `fel${n}`, `fwr${n}`, `fpw${n}`]] });
    reset(B);

    B.group(8);
    paw(B, 0.230 * s, 0.06, 0.40, 1);
    emit(['bone', `fpw${n}`]);

    B.group(7);
    sweep(B, {
      nodes: [
        { p: [0.205 * s, 1.00, -0.54], rx: 0.150, rz: 0.170 },  // rump
        { p: [0.225 * s, 0.76, -0.62], rx: 0.142, rz: 0.160 },  // thigh — huge
        { p: [0.245 * s, 0.56, -0.72], rx: 0.086, rz: 0.098 },  // stifle
        { p: [0.252 * s, 0.36, -0.62], rx: 0.056, rz: 0.062 },  // gaskin
        { p: [0.255 * s, 0.22, -0.50], rx: 0.042, rz: 0.046 },  // hock
        { p: [0.255 * s, 0.10, -0.44], rx: 0.037, rz: 0.042 },  // metatarsus
      ],
      steps: 20, seg: 11, ref: [0, 0, 1], capStart: 0.5, capEnd: false,
      shape: (th, u) => {
        const back = -Math.cos(th);
        return 1 + Math.max(0, back) * 0.30 * Math.exp(-Math.pow((u - 0.16) / 0.22, 2))
          + Math.max(0, -back) * 0.10 * Math.exp(-Math.pow((u - 0.50) / 0.15, 2));
      },
      colorAt: (th, u) => mix(FUR, FUR_DARK, clamp01((u - 0.4) / 0.55) * 0.8),
      matAt: () => M_FUR_SLEEK,
    });
    P.push({ geo: B.build(), bind: ['chain', [`bhp${n}`, `bkn${n}`, `bhk${n}`, `bpw${n}`]] });
    reset(B);

    B.group(8);
    paw(B, 0.255 * s, 0.06, -0.40, -1);
    emit(['bone', `bpw${n}`]);
  }

  /* -------------------------------------------------------------- tail - */
  B.group(9);
  sweep(B, {
    nodes: [
      { p: [0, 0.84, -0.74], rx: 0.078 },
      { p: [0, 0.82, -1.00], rx: 0.062 },
      { p: [0, 0.78, -1.34], rx: 0.050 },
      { p: [0, 0.71, -1.68], rx: 0.040 },
      { p: [0, 0.64, -1.94], rx: 0.028 },
    ],
    steps: 20, seg: 8, ref: [0, 1, 0], capStart: false, capEnd: 0.5,
    colorAt: (th, u) => mix(FUR, FUR_DARK, clamp01((u - 0.2) / 0.6)),
    matAt: () => M_FUR_SLEEK,
  });
  // the barb, plus two rearward hooks
  horn(B, {
    from: [0, 0.635, -1.95], dir: [0, -0.15, -1], len: 0.13,
    r0: 0.026, r1: 0.002, flat: 0.5, seg: 6, steps: 4,
    colorAt: () => col(CLAW), matAt: () => M_CLAW,
  });
  for (const s of [-1, 1]) {
    horn(B, {
      from: [0.014 * s, 0.640, -1.90], dir: [0.55 * s, -0.30, -0.78], len: 0.070,
      r0: 0.013, r1: 0.001, seg: 5, steps: 3,
      colorAt: () => col(CLAW), matAt: () => M_CLAW,
    });
  }
  P.push({ geo: B.build(), bind: ['chain', ['tail1', 'tail2', 'tail3', 'tail4']] });
  reset(B);

  for (const p of P) {
    if (p.bind[0] === 'chain') rig.attachChain(p.geo, p.bind[1], 0.95);
    else rig.attach(p.geo, p.bind[1]);
  }

  const mat = creatureMaterial({
    roughness: 0.86, metalness: 0.02,
    normalMap: organicNormal(), normalScale: 0.55, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 2.6, coat: { mottle: 0.11, tick: 0.18, light: 0x8f88a4, shade: 0.18, dust: 0.12, dustTop: 0.26 } });
}

/** Broad cat paw: four toes, retractable claws left out. */
function paw(B: CBuilder, x: number, y: number, z: number, dir: number) {
  const sgn = Math.sign(x) || 1;
  for (let i = -1; i <= 2; i++) {
    const ox = x + (i - 0.5) * 0.030 * sgn;
    const oz = z + (1 - Math.abs(i - 0.5) * 0.30) * 0.026 * dir;
    sweep(B, {
      nodes: [
        { p: [ox, y + 0.038, oz - dir * 0.032], rx: 0.026, rz: 0.032 },
        { p: [ox, y + 0.012, oz + dir * 0.026], rx: 0.024, rz: 0.032 },
        { p: [ox, y + 0.004, oz + dir * 0.060], rx: 0.016, rz: 0.020 },
      ],
      steps: 5, seg: 7, ref: [0, 1, 0], capStart: 0.6, capEnd: 0.5,
      colorAt: () => col(FUR_DARK), matAt: () => [0.90, 0],
    });
    horn(B, {
      from: [ox, y + 0.006, oz + dir * 0.066], dir: [0, -0.10, dir], len: 0.055,
      curve: [0, -0.028, 0], r0: 0.011, r1: 0.001, seg: 5, steps: 3,
      colorAt: () => col(CLAW), matAt: () => M_CLAW,
    });
  }
}

function reset(B: CBuilder) {
  B.pos.length = 0; B.uv.length = 0; B.col.length = 0;
  B.emi.length = 0; B.mp.length = 0; B.grp.length = 0; B.idx.length = 0;
  B.glow(null);
}

// Blending lives in `Palette.js`: the two-register local version this file
// used could not survive `mix(mix(...), ...)` — see the note there.
const mix = mixc;
const col = colc;

class CoeurlEnemy extends QuadrupedEnemy {
  /** Tuning block, assigned below the class body. Read through `this.A`. */
  static ANIM: any;
  override anim!: any;
  override attackId!: any;
  override moveSpeed!: any;
  override rig!: any;
  override speed!: any;
  override state!: any;
  override stateTime!: any;
  override visual!: any;
  constructor(opts: any) { super(COEURL, opts); }

  override telegraphScale() {
    if (this.attackId === 'pounce') return 1.25;
    if (this.attackId === 'blaster') return 0.55;
    return 0.7;
  }

  override leapScale() { return this.attackId === 'pounce' ? 1.0 : 0.25; }

  /**
   * Drive both whisker chains.
   * @param S pose writer
   * @param sweepFwd −1 laid flat back, 0 rest, +1 swung forward and level
   * @param flare how far they splay apart
   * @param wave amplitude of the travelling ripple
   * @param t phase seconds
   * @param charge 0..1, swells the outer segment as the bolt builds
   */
  whiskers(S: ((...args: any[]) => any), sweepFwd: number, flare: number, wave: number, t: number, charge: number = 0) {
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      for (let i = 0; i < 3; i++) {
        const lag = i * 0.5;
        const k = 0.5 + i * 0.28;          // the outer joints move furthest
        // The whiskers rest pointing up and *back* over the animal, so bringing
        // them forward down the firing line is a rotation about +X. The sign
        // used to be negative, which swung them further back and — compounded
        // over three segments — curled the tips into the ground, aiming the
        // loudest telegraph in the bestiary at the dirt in front of its feet.
        // `flare` opens the pair into a V. The whiskers trail backward, so a
        // positive yaw on the right-hand one swings it *inward* — the pair
        // crossed over the animal's own head instead of framing the firing
        // line. Negating it splays them apart, which is the shape that reads.
        S(`wk${i + 1}${n}`,
          sweepFwd * 0.62 * k,
          (-flare * 0.42 * k + Math.sin(t * 7 - lag) * wave * (0.4 + i * 0.35)) * s,
          0);
      }
      // the charge visibly swells the last segment before it fires
      const b = this.rig.byName.get(`wk3${n}`);
      if (b) b.scale.setScalar(1 + charge * 0.55);
    }
  }

  /**
   * Blaster gets its own wind-up: the animal plants, the head comes level, and
   * the whiskers swing *forward* into a V pointing down the firing line while
   * the charge builds visibly along them. Nothing else it does looks like this.
   */
  override poseTelegraph(S: any, t: any) {
    if (this.attackId !== 'blaster') {
      super.poseTelegraph(S, t);
      this.whiskers(S, -0.35, 0.2, 0.05, t);
      return;
    }
    const env = attackEnvelope('telegraph', this.stateTime, this._timingAll());
    const k = env.tension;
    this.stance(S, {
      drop: 0.10 * k,
      front: { reach: 0.10 * k, splay: 0.16 * k },
      back: { reach: -0.14 * k, splay: 0.10 * k },
    });
    this.spine(S, -0.24 * k + env.shake, 0, 0);
    S('neck', 0.18 * k, 0, 0);
    S('head', -0.16 * k, 0, 0);
    S('jaw', 0.30 * k);
    // charge ramps late so the last third of the window is the real warning
    const charge = Math.pow(k, 2.2);
    this.whiskers(S, k, 0.55 * k, 0.03 + charge * 0.10, t, charge);
    this.tail(t, 0.30 * k, 0.06, 3);
  }

  override poseAttack(S: any, t: any) {
    const env = attackEnvelope(this.state === 'recover' ? 'recover' : 'attack', this.stateTime, this._timingAll());
    const k = env.k;
    if (this.attackId === 'blaster') {
      const kp = clamp01(k);
      // discharge: the whiskers snap rigid and the recoil rocks the body back
      const fire = env.phase === 'strike' ? env.f : (env.phase === 'follow' ? 1 - env.f * 0.6 : 0);
      this.stance(S, {
        drop: 0.08 - 0.04 * kp,
        front: { reach: 0.10 - 0.16 * kp, splay: 0.16 },
        back: { reach: -0.14 + 0.10 * kp, splay: 0.10 },
      });
      this.spine(S, -0.24 + 0.38 * kp, 0, 0);
      S('neck', 0.18 - 0.10 * kp, 0, 0);
      S('head', -0.16 + 0.24 * kp, 0, 0);
      S('jaw', 0.60 * fire);
      this.whiskers(S, 1 + 0.25 * fire, 0.30, 0.02, t, 1 - fire * 0.9);
      this.tail(t, -0.30 * kp, 0.10, 5);
      this.visual.position.z -= 0.12 * fire;
      return;
    }
    if (this.attackId === 'claw') {
      // Two swipes, alternating paws. The body counter-rotates into each one,
      // which is what makes a fast attack land with weight instead of flapping.
      const T = this._timing('attack');
      const a = clamp01(this.stateTime / (T * 0.44));
      const b = clamp01((this.stateTime - T * 0.40) / (T * 0.46));
      const sw = (x: any) => Math.sin(clamp01(x) * Math.PI);
      const k1 = sw(a), k2 = sw(b);
      const rear = Math.max(k1, k2);
      this.stance(S, {
        drop: -0.06 * rear,
        front: { reach: 0.10 * rear, lift: 0.20 * k1 + 0.20 * k2 },
        back: { reach: -0.06 * rear, splay: 0.06 },
      });
      this.spine(S, -0.38 * rear, (k1 - k2) * 0.72, (k1 - k2) * 0.38);
      S('head', 0.24 * rear, (k1 - k2) * 0.22, 0);
      S('jaw', 0.55 * rear);
      // one paw leads each swipe
      this.anim.solveLeg('fL', 0.34 * k1, 0.34 * k1, S, { kneeSign: 1, footPitch: -0.5 });
      this.anim.solveLeg('fR', 0.34 * k2, 0.34 * k2, S, { kneeSign: 1, footPitch: -0.5 });
      this.whiskers(S, -0.5 * rear, 0.5 * rear, 0.14, t);
      this.tail(t, -0.35 * rear, 0.18, 6);
      return;
    }
    super.poseAttack(S, t);
    // whiskers stream back in the leap, then whip forward on the landing
    this.whiskers(S, -0.8 * clamp01(-k) - 0.2, 0.35, 0.10, t);
  }

  override poseLocomotion(S: any, t: any) {
    super.poseLocomotion(S, t);
    const norm = clamp01((this.moveSpeed || 0) / this.speed);
    this.whiskers(S, -0.25 - norm * 0.45, 0.15, 0.08 + norm * 0.10, t);
  }

  override poseIdle(S: any, t: any) {
    super.poseIdle(S, t);
    this.whiskers(S, 0, 0.10, 0.09, t);
  }

  override poseFlinch(S: any, t: any) {
    super.poseFlinch(S, t);
    this.whiskers(S, -0.2, 0.5, 0.30, t);
  }

  override poseStagger(S: any, t: any) {
    super.poseStagger(S, t);
    this.whiskers(S, -0.4, 0.7, 0.22, t);
  }

  override poseDeath(S: any, t: any) {
    super.poseDeath(S, t);
    // the charge gutters out and the whiskers go limp
    const slack = smooth(clamp01(this.stateTime / 0.45));
    this.whiskers(S, -0.9 * slack, 0.8 * slack, 0.20 * (1 - slack), t, 0);
    S('jaw', 0.5 * slack);
  }
}

CoeurlEnemy.ANIM = {
  legs: {
    fL: ['fshL', 'felL', 'fwrL', 'fpwL'], fR: ['fshR', 'felR', 'fwrR', 'fpwR'],
    bL: ['bhpL', 'bknL', 'bhkL', 'bpwL'], bR: ['bhpR', 'bknR', 'bhkR', 'bpwR'],
  },
  trunk: ['hips', 'spine', 'chest', 'neck', 'head'],
  tails: ['tail1', 'tail2', 'tail3', 'tail4'],
  jawBone: 'jaw',
  strideLen: 1.30, stride: 0.32, lift: 0.16, splay: 0.02,
  crouch: 0.16, crouchFront: 0.06, crouchBack: -0.14, crouchPitch: 0.15, headDown: 0.28,
  lunge: 0.30, lungeLift: 0.38, lungeLiftBack: 0.12, hop: 0.24,
  strikePitch: 0.22, headThrust: 0.28, jaw: 0.35, jawBite: 0.9,
  runNeck: 0.14, runHead: 0.12, flex: 1.25,
  bodyY: 0.90, bodyR: 0.32, deathRoll: 1.30, deathSlow: 1.15,
  tailRun: -0.28, tailIdle: -0.05, breath: 1.2,
};

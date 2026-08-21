import * as THREE from 'three';
import { Rig, creatureMaterial } from './RigBuilder.ts';
import { mixc, colc } from './Palette.ts';
import { organicNormal, organicRoughness } from './EnemyBase.ts';
import { QuadrupedEnemy } from './Quadruped.ts';
import { CBuilder, sweep, sculptBlob, horn } from '../rig/Sculpt.ts';
import { attackEnvelope, clamp01, smooth, lerp } from '../rig/CreatureAnim.ts';

/* Hairless, so the palette has to do the work fur would: a mottled hide that
 * lifts to a paler underside, with bone and claw reading much brighter.
 *
 * Re-valued off a capture. The first pass was a lilac-grey over a near-white
 * belly, and at six metres that is not a starved desert predator — it is a
 * black-and-pink plastic toy, because `BELLY` at 0xd3cac5 sits at 82 % value
 * and covered the whole of both hind limbs and the underside of the neck.
 * Leide is red-ochre badlands: everything that lives there is dusty and warm,
 * and the belly of a hairless animal is *sandy*, not bleached. The spread
 * between `SKIN` and `SKIN_DARK` is also widened, because the dorsal blotching
 * is the only large-scale pattern this species has. */
const SKIN = 0x7d705f;
const SKIN_MID = 0x5f5344;
const SKIN_DARK = 0x413729;
const BELLY = 0x968a70;
const CREST = 0x4a3a2c;
const BONE = 0xe4dcc6;
const BONE_DARK = 0xa89e86;
const CLAW = 0x2c2634;
const GUM = 0x7d5058;
const EYE = 0xffd23a;

/* Naked hide is not fur: it is faintly greasy, so it keeps a broad soft
 * highlight the sabertusk never gets. Bone and claw are polished harder. */
const M_HIDE = [0.74, 0];
const M_BELLY = [0.66, 0];
const M_SCUTE = [0.55, 0.04];
const M_BONE = [0.38, 0.05];
const M_CLAW = [0.28, 0.06];
const M_WET = [0.13, 0];

/**
 * Voretooth — the pack scavenger that infests the Leide flatlands.
 *
 * A lizard built on a dog's chassis: hairless, mottled lilac-grey, spindly
 * digitigrade legs under a shallow ribcage, a bony crest sweeping back off the
 * skull, and a whip tail carried out flat that ends in a barb. The head is the
 * whole read — an oversized jaw that splits sideways into a pair of mandible
 * blades the moment it commits, so the silhouette at 30 m literally *opens*
 * before the bite lands.
 *
 * Frail, fast, and permanently fidgeting; it dies harder than it fights.
 */
export const VORETOOTH = {
  key: 'voretooth',
  questId: 'voretooth',
  faction: 'beast',
  expClass: 'normal',
  stats: {
    name: 'Voretooth', hp: 640, poise: 30, speed: 6.8, attackRange: 2.0,
    aggroRange: 28, radius: 0.5, height: 1.3, damage: 84, level: 11,
  },
  weakness: 'fire',
  resistPct: { fire: 160, ice: 100, lightning: 110, dark: 100, light: 100 },
  weakTo: ['polearm', 'dagger'],
  senses: { sight: 28, fov: 1.7, hearing: 22, nocturnal: false },
  drops: [
    { id: 'voretooth_tail', chance: 0.45, count: 1 },
  ],
  timing: { telegraph: 0.28, strike: 0.12, attack: 0.36, recover: 0.45 },
  attacks: [
    // snap-and-away: barely any commitment, thrown out constantly
    {
      id: 'bite', range: 2.1, weight: 4, mult: 0.9, poise: 12, hitRadius: 1.6, arc: 1.1,
      telegraph: 0.24, strike: 0.10, attack: 0.32, recover: 0.38, cooldown: 0.9,
    },
    // a short flat leap, mandibles wide on the way in
    {
      id: 'lunge', range: 6.5, minRange: 2.0, weight: 3, mult: 1.2, poise: 20, hitRadius: 1.8, arc: 1.0,
      telegraph: 0.40, strike: 0.14, attack: 0.50, recover: 0.60, cooldown: 2.2,
      lunge: 11, tracking: 1.2,
    },
    // spins on the spot and lashes the whip tail through a wide arc
    {
      id: 'tailwhip', range: 2.8, weight: 2, mult: 1.0, poise: 18, hitRadius: 2.4, arc: 2.6,
      telegraph: 0.32, strike: 0.16, attack: 0.46, recover: 0.55, cooldown: 2.8,
    },
  ],
  buildPrototype,
  make(opts: any) { return new VoretoothEnemy(opts); },
};

/* Crest at y ≈ 1.30, shoulder 1.00, snout tip z ≈ 1.34, tail tip z ≈ -1.92. */
function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('hips', 'root', [0, 0.86, -0.52]);
  rig.bone('spine', 'hips', [0, 0.94, -0.10]);
  rig.bone('chest', 'spine', [0, 1.00, 0.36]);
  rig.bone('neck', 'chest', [0, 1.04, 0.64]);
  rig.bone('head', 'neck', [0, 1.07, 0.97]);
  rig.bone('jaw', 'head', [0, 0.99, 1.05]);
  rig.bone('mnL', 'head', [-0.075, 1.03, 1.09]);
  rig.bone('mnR', 'head', [0.075, 1.03, 1.09]);
  rig.bone('tail1', 'hips', [0, 0.86, -0.76]);
  rig.bone('tail2', 'tail1', [0, 0.84, -1.10]);
  rig.bone('tail3', 'tail2', [0, 0.80, -1.44]);
  rig.bone('tail4', 'tail3', [0, 0.76, -1.76]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    // digitigrade, and much longer in the shank than a sabertusk
    rig.bone(`fsh${n}`, 'chest', [0.17 * s, 0.88, 0.34]);
    rig.bone(`fel${n}`, `fsh${n}`, [0.19 * s, 0.54, 0.42]);
    rig.bone(`fwr${n}`, `fel${n}`, [0.20 * s, 0.24, 0.30]);
    rig.bone(`fpw${n}`, `fwr${n}`, [0.20 * s, 0.05, 0.38]);
    rig.bone(`bhp${n}`, 'hips', [0.18 * s, 0.86, -0.50]);
    rig.bone(`bkn${n}`, `bhp${n}`, [0.20 * s, 0.52, -0.66]);
    rig.bone(`bhk${n}`, `bkn${n}`, [0.21 * s, 0.24, -0.44]);
    rig.bone(`bpw${n}`, `bhk${n}`, [0.21 * s, 0.05, -0.32]);
  }

  const B = new CBuilder();
  const P = [];
  const emit = (bind: any) => { P.push({ geo: B.build(), bind }); reset(B); };

  /* ------------------------------------------------------------ torso -- */
  B.group(1);
  sweep(B, {
    nodes: [
      { p: [0, 0.84, -0.86], rx: 0.115, rz: 0.130 },
      { p: [0, 0.875, -0.66], rx: 0.185, rz: 0.205 },   // haunch
      { p: [0, 0.905, -0.32], rx: 0.150, rz: 0.190 },   // waist, wasp-thin
      { p: [0, 0.945, 0.02], rx: 0.165, rz: 0.225 },
      { p: [0, 0.975, 0.32], rx: 0.195, rz: 0.275 },    // ribcage: deep, narrow
      { p: [0, 0.995, 0.52], rx: 0.175, rz: 0.230 },
      { p: [0, 1.015, 0.64], rx: 0.125, rz: 0.155 },
    ],
    steps: 26, seg: 18, ref: [0, 1, 0], capStart: 0.7, capEnd: 0.2,
    shape: (th, u) => {
      const b = Math.cos(th);                       // +1 spine, -1 belly
      const side = Math.abs(Math.sin(th));
      let m = 1;
      // a keeled sternum and a hard flat back: the section is a teardrop
      m += b > 0 ? -0.08 * b * b : 0.12 * b * b * smooth(1 - Math.abs(u - 0.58) * 2.0);
      // the flank is sucked in behind the ribs — this animal is starving
      m -= smooth((u - 0.14) / 0.24) * (1 - smooth((u - 0.44) / 0.22)) * 0.19 * clamp01(-b + 0.3);
      // scapula and haunch
      m += side * 0.10 * Math.exp(-Math.pow((u - 0.80) / 0.13, 2));
      m += side * 0.09 * Math.exp(-Math.pow((u - 0.15) / 0.15, 2));
      // exposed ribs. Deliberately deeper than a furred animal's: on bare hide
      // the corrugation is the main thing telling you it is not a balloon.
      m += Math.sin((u - 0.5) * 96) * 0.020 * side * clamp01(-b + 0.55)
        * smooth((u - 0.46) / 0.12) * (1 - smooth((u - 0.80) / 0.14));
      return m;
    },
    colorAt: (th, u) => {
      const b = Math.cos(th);
      if (b < -0.30) return mix(BELLY, SKIN_MID, clamp01((b + 1) / 0.7) * 0.8);
      // A dark saddle reaching well down the flank, cut by cross bars.
      //
      // The previous version mottled *inside* one flat mid-tone and reached
      // for the crest colour only above `b > 0.5`, i.e. on the spine alone.
      // The result at six metres was a uniform wax model with no pattern at
      // all — and on a hairless animal the pattern is the only thing between
      // the silhouette and a balloon. Both frequencies here stay above six
      // samples per cycle on a 26-step sweep so the bars survive the mesh.
      const saddle = clamp01((b + 0.35) / 0.70);
      const bar = Math.pow(clamp01(Math.sin(u * 27 + b * 1.4) * 0.5 + 0.5), 2.6);
      return mix(mix(SKIN, SKIN_DARK, saddle * 0.85), CREST, bar * (1 - saddle * 0.35) * 0.78);
    },
    matAt: (th) => (Math.cos(th) < -0.45 ? M_BELLY : M_HIDE),
  });
  P.push({ geo: B.build(), bind: ['chain', ['hips', 'spine', 'chest']] });
  reset(B);

  /* ------------------------------------------------------------- neck -- */
  B.group(2);
  sweep(B, {
    nodes: [
      { p: [0, 1.00, 0.52], rx: 0.150, rz: 0.170 },
      { p: [0, 1.038, 0.71], rx: 0.118, rz: 0.138 },
      { p: [0, 1.062, 0.91], rx: 0.098, rz: 0.115 },
    ],
    steps: 11, seg: 13, ref: [0, 1, 0], capStart: false, capEnd: false,
    shape: (th, u) => {
      const b = Math.cos(th);
      // a chain of loose skin folds hangs under the throat
      return 1 + Math.max(0, -b) * 0.14 * (0.5 + 0.5 * Math.sin(u * 26))
        + Math.max(0, b) * 0.10;
    },
    colorAt: (th, u) => (Math.cos(th) < -0.25 ? mix(BELLY, SKIN_MID, 0.4) : mix(SKIN_DARK, SKIN, u * 0.7)),
    matAt: (th) => (Math.cos(th) < -0.35 ? M_BELLY : M_HIDE),
  });
  P.push({ geo: B.build(), bind: ['chain', ['chest', 'neck', 'head']] });
  reset(B);

  /* ------------------------------------------------------------- head -- */
  B.group(3);
  // A wedge, not a ball: a shallow braincase, huge temporal fossae for the jaw
  // muscle, and a long straight upper jaw with almost no forehead.
  sculptBlob(B, {
    center: [0, 1.055, 1.08], scale: [0.125, 0.112, 0.235], segU: 24, segV: 16,
    brushes: [
      { p: [0, 1.115, 0.96], r: [0.15, 0.10, 0.14], amt: 0.022, dir: [0, 1, -0.3] },      // occiput
      { p: [0, 1.112, 1.07], r: [0.14, 0.055, 0.11], amt: 0.028, dir: [0, 1, 0.15] },     // brow bar
      { p: [0.082, 1.092, 1.105], r: [0.055, 0.05, 0.06], amt: -0.026, dir: 'normal', mirror: true }, // eye pit
      { p: [0.115, 1.048, 1.045], r: [0.055, 0.075, 0.095], amt: 0.030, dir: [1, -0.15, 0], mirror: true }, // temporal
      { p: [0, 1.028, 1.27], r: [0.115, 0.115, 0.19], amt: -0.056, dir: 'normal' },          // snout taper
      { p: [0, 1.012, 1.31], r: [0.085, 0.060, 0.15], amt: 0.018, dir: [0, -1, 0.25] },   // flat top jaw
      { p: [0, 0.998, 1.16], r: [0.095, 0.055, 0.14], amt: -0.022, dir: [0, 1, 0] },        // undercut lip line
    ],
    colorAt: (u: any, v: any, p: any) => {
      const snout = clamp01((p.z - 1.14) / 0.20);
      const under = clamp01((1.022 - p.y) / 0.065);
      // A dark mask over the brow and down the bridge, so the head is not a
      // featureless pale cone at the end of a pale neck — the head is this
      // species' entire read and it was the least legible thing on it.
      const brow = clamp01((p.y - 1.075) / 0.045) * clamp01((1.20 - p.z) / 0.14);
      const base = mix(mix(SKIN, SKIN_DARK, snout * 0.85), BELLY, under * 0.45);
      return mix(base, CREST, brow * 0.72);
    },
    matAt: (u: any, v: any, p: any) => (p.z > 1.35 ? M_WET : M_HIDE),
  });

  // the crest: three bony blades sweeping back off the skull roof
  for (const [ox, len, spread] of [[0, 0.38, 0], [0.062, 0.31, 0.34], [-0.062, 0.31, -0.34]]) {
    horn(B, {
      from: [ox, 1.135, 1.045], dir: [spread, 0.56, -0.82], len,
      curve: [spread * 0.4, -0.09, -0.05], r0: 0.050, r1: 0.006, flat: 0.28,
      seg: 6, steps: 5,
      colorAt: (th: any, u: any) => mix(BONE_DARK, BONE, smooth(u)), matAt: () => M_BONE,
    });
  }
  // scutes marching down the skull between the crest roots
  for (let i = 0; i < 3; i++) {
    horn(B, {
      from: [0, 1.122 - i * 0.004, 1.11 + i * 0.058], dir: [0, 0.85, 0.53], len: 0.042 - i * 0.008,
      r0: 0.020 - i * 0.003, r1: 0.002, flat: 0.5, seg: 5, steps: 3,
      colorAt: () => col(CREST), matAt: () => M_SCUTE,
    });
  }

  for (const s of [-1, 1]) {
    // eye: flat, reptilian, set high on the wedge
    B.glow(EYE, 2.8);
    sculptBlob(B, {
      center: [0.090 * s, 1.089, 1.102], scale: [0.028, 0.023, 0.021], segU: 9, segV: 6,
      colorAt: () => col(0x140f02), matAt: () => M_WET,
    });
    B.glow(null);
    // brow scute over each eye — the scowl
    horn(B, {
      from: [0.089 * s, 1.115, 1.080], dir: [0.30 * s, 0.55, 0.78], len: 0.082,
      r0: 0.022, r1: 0.004, flat: 0.45, seg: 5, steps: 3,
      colorAt: () => col(BONE_DARK), matAt: () => M_BONE,
    });
    // upper fangs, oversized and visible with the mouth shut
    for (let i = 0; i < 4; i++) {
      horn(B, {
        from: [(0.058 - i * 0.004) * s, 1.008, 1.12 + i * 0.055], dir: [0.05 * s, -1, 0.06],
        len: 0.070 - i * 0.010, r0: 0.014 - i * 0.002, r1: 0.001, seg: 5, steps: 3,
        colorAt: () => col(BONE), matAt: () => M_BONE,
      });
    }
  }
  emit(['bone', 'head']);

  /* ---------------------------------------------------- lower jaw ------ */
  B.group(4);
  sweep(B, {
    nodes: [
      { p: [0, 0.993, 1.03], rx: 0.088, rz: 0.070 },
      { p: [0, 0.983, 1.16], rx: 0.062, rz: 0.052 },
      { p: [0, 0.983, 1.33], rx: 0.034, rz: 0.032 },
    ],
    steps: 9, seg: 11, ref: [0, 1, 0], capStart: 0.5, capEnd: 0.6,
    shape: (th) => 1 + Math.max(0, Math.cos(th)) * 0.20,
    colorAt: (th, u) => (Math.cos(th) < -0.2 ? mix(GUM, SKIN_DARK, 0.4) : mix(SKIN_DARK, SKIN, u * 0.4)),
    matAt: () => M_HIDE,
  });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      horn(B, {
        from: [(0.034 + i * 0.002) * s, 1.003, 1.08 + i * 0.058], dir: [0, 1, 0.05],
        len: 0.042 - i * 0.007, r0: 0.010, r1: 0.001, seg: 5, steps: 3,
        colorAt: () => col(BONE), matAt: () => M_BONE,
      });
    }
  }
  emit(['bone', 'jaw']);

  /* ------------------------------------------------- mandible blades --- */
  // The signature. Two hooked chitinous arms hinged beside the jaw that fold
  // flat against the muzzle at rest and swing wide the instant it bites.
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    B.group(5);
    sweep(B, {
      nodes: [
        { p: [0.082 * s, 1.030, 1.08], rx: 0.032, rz: 0.026 },
        { p: [0.098 * s, 1.014, 1.20], rx: 0.028, rz: 0.020 },
        { p: [0.105 * s, 1.006, 1.32], rx: 0.019, rz: 0.014 },
      ],
      steps: 8, seg: 8, ref: [0, 1, 0], capStart: 0.5, capEnd: false,
      shape: (th) => 1 + Math.abs(Math.sin(th)) * 0.55,     // a blade, not a rod
      colorAt: (th, u) => mix(BONE_DARK, BONE, smooth(u * 0.9)),
      matAt: () => M_BONE,
    });
    // the hook on the end
    horn(B, {
      from: [0.105 * s, 1.006, 1.32], dir: [-0.22 * s, 0.14, 0.96], len: 0.125,
      curve: [-0.05 * s, 0.03, -0.03], r0: 0.017, r1: 0.002, flat: 0.42, seg: 6, steps: 4,
      colorAt: () => col(BONE), matAt: () => M_BONE,
    });
    emit(['bone', `mn${n}`]);
  }

  /* ------------------------------------------------------- dorsal ------ */
  // A low sawtooth of scutes rather than the sabertusk's hair bristles.
  for (const [bone, z0, z1, n] of [['hips', -0.80, -0.34, 4], ['spine', -0.28, 0.18, 5], ['chest', 0.22, 0.56, 3]]) {
    B.group(6);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const z = lerp(z0, z1, t);
      const g = clamp01((z + 0.84) / 1.44);
      const h = 0.045 + Math.sin(g * Math.PI) * 0.085;
      horn(B, {
        from: [0, 1.02 + Math.sin(g * Math.PI) * 0.045, z], dir: [0, 0.72, -0.69],
        len: h, curve: [0, -0.015, -0.02], r0: 0.030, r1: 0.003, flat: 0.32,
        seg: 5, steps: 3,
        colorAt: (th: any, u: any) => mix(CREST, BONE_DARK, u * 0.55), matAt: () => M_SCUTE,
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
        { p: [0.165 * s, 0.99, 0.32], rx: 0.088, rz: 0.105 },   // scapula
        { p: [0.180 * s, 0.74, 0.36], rx: 0.078, rz: 0.092 },   // upper arm
        { p: [0.190 * s, 0.55, 0.41], rx: 0.052, rz: 0.060 },   // elbow
        { p: [0.196 * s, 0.38, 0.36], rx: 0.034, rz: 0.039 },   // forearm — spindly
        { p: [0.200 * s, 0.25, 0.30], rx: 0.028, rz: 0.032 },   // carpus
        { p: [0.200 * s, 0.10, 0.35], rx: 0.025, rz: 0.030 },   // metacarpus
      ],
      steps: 20, seg: 10, ref: [0, 0, 1], capStart: 0.5, capEnd: false,
      shape: (th, u) => {
        const back = -Math.cos(th);
        // one hard muscle knot at the top, then bare tendon all the way down
        return 1 + Math.max(0, back) * 0.26 * Math.exp(-Math.pow((u - 0.16) / 0.16, 2))
          + Math.max(0, back) * 0.10 * Math.exp(-Math.pow((u - 0.55) / 0.10, 2));
      },
      colorAt: (th, u) => mix(SKIN, SKIN_DARK, clamp01((u - 0.35) / 0.55) * 0.9),
      matAt: () => M_HIDE,
    });
    P.push({ geo: B.build(), bind: ['chain', [`fsh${n}`, `fel${n}`, `fwr${n}`, `fpw${n}`]] });
    reset(B);

    B.group(8);
    foot(B, 0.200 * s, 0.05, 0.38, 1);
    emit(['bone', `fpw${n}`]);

    B.group(7);
    sweep(B, {
      nodes: [
        { p: [0.170 * s, 0.98, -0.48], rx: 0.100, rz: 0.120 },  // rump
        { p: [0.185 * s, 0.72, -0.56], rx: 0.098, rz: 0.115 },  // thigh
        { p: [0.198 * s, 0.53, -0.66], rx: 0.058, rz: 0.066 },  // stifle
        { p: [0.205 * s, 0.38, -0.56], rx: 0.038, rz: 0.043 },  // gaskin
        { p: [0.210 * s, 0.25, -0.45], rx: 0.028, rz: 0.032 },  // hock
        { p: [0.210 * s, 0.10, -0.36], rx: 0.024, rz: 0.029 },  // metatarsus
      ],
      steps: 20, seg: 10, ref: [0, 0, 1], capStart: 0.5, capEnd: false,
      shape: (th, u) => {
        const back = -Math.cos(th);
        return 1 + Math.max(0, back) * 0.34 * Math.exp(-Math.pow((u - 0.14) / 0.18, 2))
          + Math.max(0, -back) * 0.09 * Math.exp(-Math.pow((u - 0.50) / 0.14, 2));
      },
      colorAt: (th, u) => mix(SKIN, SKIN_DARK, clamp01((u - 0.35) / 0.55) * 0.9),
      matAt: () => M_HIDE,
    });
    P.push({ geo: B.build(), bind: ['chain', [`bhp${n}`, `bkn${n}`, `bhk${n}`, `bpw${n}`]] });
    reset(B);

    B.group(8);
    foot(B, 0.210 * s, 0.05, -0.33, -1);
    emit(['bone', `bpw${n}`]);
  }

  /* -------------------------------------------------------------- tail - */
  B.group(9);
  sweep(B, {
    nodes: [
      { p: [0, 0.86, -0.70], rx: 0.070, rz: 0.078 },
      { p: [0, 0.855, -0.94], rx: 0.052, rz: 0.056 },
      { p: [0, 0.840, -1.26], rx: 0.038, rz: 0.040 },
      { p: [0, 0.815, -1.58], rx: 0.026, rz: 0.027 },
      { p: [0, 0.790, -1.82], rx: 0.019, rz: 0.020 },
    ],
    steps: 20, seg: 8, ref: [0, 1, 0], capStart: false, capEnd: false,
    // a dorsal fin ridge runs the whole length — the whip reads even in motion
    shape: (th, u) => 1 + Math.max(0, Math.cos(th)) * (0.35 + Math.sin(u * 40) * 0.10) * smooth(u / 0.2),
    colorAt: (th, u) => mix(SKIN_DARK, CREST, clamp01(Math.cos(th)) * 0.7 + u * 0.2),
    matAt: () => M_HIDE,
  });
  // the barb
  for (const [dx, dy, len] of [[0, 0.15, 0.16], [0.045, -0.05, 0.10], [-0.045, -0.05, 0.10]]) {
    horn(B, {
      from: [dx * 0.4, 0.790, -1.82], dir: [dx, dy, -1], len,
      r0: 0.020, r1: 0.002, flat: 0.45, seg: 5, steps: 3,
      colorAt: () => col(BONE), matAt: () => M_BONE,
    });
  }
  P.push({ geo: B.build(), bind: ['chain', ['tail1', 'tail2', 'tail3', 'tail4']] });
  reset(B);

  for (const p of P) {
    if (p.bind[0] === 'chain') rig.attachChain(p.geo, p.bind[1], 0.95);
    else rig.attach(p.geo, p.bind[1]);
  }

  const mat = creatureMaterial({
    roughness: 0.72, metalness: 0.0,
    normalMap: organicNormal(), normalScale: 0.95, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 2.4, coat: { mottle: 0.15, tick: 0.10, shade: 0.20, dust: 0.24, dustTop: 0.32 } });
}

/** Three long reptilian toes with hooked claws. */
function foot(B: any, x: any, y: any, z: any, dir: any) {
  const sgn = Math.sign(x) || 1;
  for (let i = -1; i <= 1; i++) {
    const ox = x + i * 0.030 * sgn;
    const oz = z + (1 - Math.abs(i) * 0.4) * 0.030 * dir;
    sweep(B, {
      nodes: [
        { p: [ox, y + 0.030, oz - dir * 0.035], rx: 0.021, rz: 0.026 },
        { p: [ox, y + 0.008, oz + dir * 0.030], rx: 0.019, rz: 0.026 },
        { p: [ox, y + 0.002, oz + dir * 0.072], rx: 0.013, rz: 0.016 },
      ],
      steps: 5, seg: 7, ref: [0, 1, 0], capStart: 0.6, capEnd: 0.5,
      colorAt: () => col(SKIN_DARK), matAt: () => [0.68, 0],
    });
    horn(B, {
      from: [ox, y + 0.004, oz + dir * 0.080], dir: [0, -0.10, dir], len: 0.052,
      curve: [0, -0.024, 0], r0: 0.009, r1: 0.001, seg: 5, steps: 3,
      colorAt: () => col(CLAW), matAt: () => M_CLAW,
    });
  }
}

function reset(B: any) {
  B.pos.length = 0; B.uv.length = 0; B.col.length = 0;
  B.emi.length = 0; B.mp.length = 0; B.grp.length = 0; B.idx.length = 0;
  B.glow(null);
}

// Blending lives in `Palette.js`: the two-register local version this file
// used could not survive `mix(mix(...), ...)` — see the note there.
const mix = mixc;
const col = colc;

class VoretoothEnemy extends QuadrupedEnemy {
  attackId!: any;
  id!: any;
  state!: any;
  stateTime!: any;
  visual!: any;
  constructor(opts: any) { super(VORETOOTH, opts); }

  /** A lunge coils; a bite is a twitch; the tail-whip winds the body sideways. */
  telegraphScale() {
    if (this.attackId === 'lunge') return 1.2;
    if (this.attackId === 'tailwhip') return 0.45;
    return 0.55;
  }

  leapScale() { return this.attackId === 'lunge' ? 1.0 : 0.3; }

  /**
   * The mandibles are the tell. They flare open through the wind-up and stay
   * open right through contact, so the head silhouette *doubles in width*
   * before the bite lands — readable at range, unlike a jaw angle.
   * @param k 0..1 open
   */
  maw(S: any, k: number, twitch = 0) {
    S('mnL', 0.10 * k, 0.95 * k + twitch, -0.55 * k);
    S('mnR', 0.10 * k, -0.95 * k - twitch, 0.55 * k);
  }

  poseTelegraph(S: any, t: any) {
    const env = attackEnvelope('telegraph', this.stateTime, this._timingAll());
    const k = env.tension;
    if (this.attackId === 'tailwhip') {
      // coils sideways: the whole body becomes a spring wound about the spine
      const side = this.id % 2 ? 1 : -1;
      this.stance(S, {
        drop: 0.08 * k,
        front: { reach: 0.04 * k, splay: 0.10 * k },
        back: { reach: -0.05 * k, splay: 0.12 * k },
      });
      this.spine(S, 0.14 * k + env.shake, -1.32 * k * side, 0.34 * k * side);
      S('head', -0.10 * k, -0.45 * k * side, 0);
      S('jaw', 0.35 * k);
      this.maw(S, 0.4 * k);
      this.tail(t, 0.30 * k, 0.06, 3, 0.9 * k * side);
      this.visual.rotation.y += 0.16 * k * side;
      return;
    }
    super.poseTelegraph(S, t);
    this.maw(S, k * (this.attackId === 'lunge' ? 1 : 0.7), Math.sin(t * 34) * 0.05 * k);
  }

  poseAttack(S: any, t: any) {
    const env = attackEnvelope(this.state === 'recover' ? 'recover' : 'attack', this.stateTime, this._timingAll());
    const k = env.k;
    if (this.attackId === 'tailwhip') {
      // unwind: the body snaps through the other way and the tail follows late
      const side = this.id % 2 ? 1 : -1;
      const kp = clamp01(k);
      this.stance(S, {
        drop: 0.04 * kp,
        front: { reach: 0.02, splay: 0.10 },
        back: { reach: -0.03, splay: 0.12 },
      });
      this.spine(S, 0.10, 1.49 * k * side, -0.34 * k * side);
      S('head', -0.06, 0.50 * k * side, 0);
      S('jaw', 0.25 * (1 - kp));
      this.maw(S, 0.3 * (1 - kp));
      // the lash lags a beat behind the hips, which is the whole point of a whip
      const lag = clamp01((this.stateTime - 0.05) / 0.14);
      this.tail(t, -0.15 * kp, 0.05, 3, -1.5 * k * side * lag);
      this.visual.rotation.y += -0.30 * k * side;
      return;
    }
    super.poseAttack(S, t);
    // the maw stays wide through contact and only closes on the follow-through
    const open = env.phase === 'follow' ? 1 - env.f : (env.phase === 'recover' ? 0.15 : 1);
    this.maw(S, open * clamp01(k + 0.5));
  }

  poseDeath(S: any, t: any) {
    super.poseDeath(S, t);
    // jaw and mandibles hang slack straight away — no muscle left to hold them
    const slack = smooth(clamp01(this.stateTime / 0.30));
    S('jaw', 0.55 * slack);
    this.maw(S, 0.55 * slack);
  }
}

VoretoothEnemy.ANIM = {
  legs: {
    fL: ['fshL', 'felL', 'fwrL', 'fpwL'], fR: ['fshR', 'felR', 'fwrR', 'fpwR'],
    bL: ['bhpL', 'bknL', 'bhkL', 'bpwL'], bR: ['bhpR', 'bknR', 'bhkR', 'bpwR'],
  },
  trunk: ['hips', 'spine', 'chest', 'neck', 'head'],
  tails: ['tail1', 'tail2', 'tail3', 'tail4'],
  jawBone: 'jaw',
  strideLen: 1.15, stride: 0.30, lift: 0.17, splay: 0.03,
  crouch: 0.12, crouchFront: 0.06, crouchBack: -0.13, crouchPitch: 0.13, headDown: 0.26,
  lunge: 0.30, lungeLift: 0.30, lungeLiftBack: 0.10, hop: 0.16,
  strikePitch: 0.24, headThrust: 0.34, jaw: 0.55, jawBite: 1.0,
  runNeck: 0.18, runHead: 0.14, flex: 1.35, headSway: 1.6,
  bodyY: 0.95, bodyR: 0.24, deathRoll: 1.38, deathSlow: 0.85,
  tailRun: -0.10, tailIdle: -0.02, breath: 2.4,
};

import * as THREE from 'three';
import { Rig, creatureMaterial } from './RigBuilder.ts';
import { organicNormal, organicRoughness } from './EnemyBase.ts';
import { QuadrupedEnemy } from './Quadruped.ts';
import { CBuilder, sweep, sculptBlob, horn } from '../rig/Sculpt.ts';
import { attackEnvelope, clamp01, smooth } from '../rig/CreatureAnim.ts';

const SHAG = 0x6b5335;
const SHAG_LIT = 0x87703f;
const SHAG_DARK = 0x3f2f1e;
const HIDE = 0x6f6558;
const HIDE_DARK = 0x453f38;
const BELLY = 0x9e9384;
const TUSK = 0xeadfc0;
const TUSK_DARK = 0x9d9170;
const PLATE = 0x585047;
const HOOF = 0x302a23;
const NOSE = 0x2b241d;
const EYE = 0xc4761e;

const M_SHAG = [1.0, 0];
const M_HIDE = [0.90, 0];
const M_PLATE = [0.66, 0.03];    // the face shield is hard keratin, not hide
const M_TUSK = [0.30, 0.05];
const M_HOOF = [0.42, 0.10];
const M_WET = [0.15, 0];

/**
 * Garula — the Duscae grazer that turns into a landslide when provoked.
 *
 * A tusked mammoth-boar the size of a van: one enormous barrel carried on four
 * pillar legs, a wide flat face plate with two upward-hooking tusks, tiny eyes
 * set far apart, and a mane of long coarse russet shag over the shoulders and
 * down the flanks. Everything it does is slow, committed and very heavy — it
 * never leaves the ground except to rear, and when it does the ground is the
 * thing that suffers.
 */
export const GARULA = {
  key: 'garula',
  questId: 'garula',
  faction: 'beast',
  expClass: 'normal',
  stats: {
    name: 'Garula', hp: 4200, poise: 140, speed: 3.6, attackRange: 4.2,
    aggroRange: 26, radius: 1.4, height: 2.6, damage: 210, level: 16,
  },
  weakness: 'lightning',
  resist: 'ice',
  resistPct: { lightning: 175, ice: 55, fire: 100, dark: 100, light: 100 },
  weakTo: ['greatsword'],
  resistsWeapon: ['dagger'],
  senses: { sight: 26, fov: 1.4, hearing: 20, nocturnal: false },
  drops: [
    { id: 'garula_tenderloin', chance: 0.5, count: 1 },
    { id: 'garula_fur', chance: 0.35, count: 1 },
  ],
  timing: { telegraph: 0.85, strike: 0.30, attack: 0.95, recover: 1.30 },
  attacks: [
    // hook the head up from under the guard — the bread-and-butter swipe
    { id: 'tusk', range: 4.2, weight: 3, mult: 1.0, poise: 32, hitRadius: 3.0, arc: 1.4,
      telegraph: 0.80, strike: 0.30, attack: 0.95, recover: 1.25, cooldown: 1.9 },
    // rolls itself into a runaway barrel; long wind-up, almost no steering
    { id: 'barrel', range: 18, minRange: 7, weight: 2, mult: 1.7, poise: 64, hitRadius: 2.6,
      telegraph: 1.10, strike: 0.34, attack: 1.20, recover: 1.60, cooldown: 5.0,
      lunge: 12, tracking: 0.45, unblockable: true },
    // both forelegs come down together — a ring of broken ground
    { id: 'quake', range: 5.0, weight: 2, mult: 1.3, poise: 52, hitRadius: 4.0, aoe: true,
      telegraph: 1.00, strike: 0.32, attack: 1.05, recover: 1.55, cooldown: 4.2 },
  ],
  buildPrototype,
  make(opts: any) { return new GarulaEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('hips', 'root', [0, 1.94, -1.32]);
  rig.bone('spine', 'hips', [0, 2.10, -0.54]);
  rig.bone('chest', 'spine', [0, 2.22, 0.36]);
  rig.bone('neck', 'chest', [0, 2.10, 1.02]);
  rig.bone('head', 'neck', [0, 1.88, 1.54]);
  rig.bone('jaw', 'head', [0, 1.64, 1.66]);
  rig.bone('tail1', 'hips', [0, 1.86, -1.64]);
  rig.bone('tail2', 'tail1', [0, 1.60, -1.82]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`fsh${n}`, 'chest', [0.56 * s, 2.12, 0.40]);
    rig.bone(`fel${n}`, `fsh${n}`, [0.62 * s, 1.44, 0.48]);
    rig.bone(`fkn${n}`, `fel${n}`, [0.65 * s, 0.70, 0.32]);
    rig.bone(`fhf${n}`, `fkn${n}`, [0.66 * s, 0.16, 0.38]);
    rig.bone(`bhp${n}`, 'hips', [0.54 * s, 1.98, -1.26]);
    rig.bone(`bkn${n}`, `bhp${n}`, [0.58 * s, 1.28, -1.50]);
    rig.bone(`bhk${n}`, `bkn${n}`, [0.60 * s, 0.66, -1.16]);
    rig.bone(`bhf${n}`, `bhk${n}`, [0.61 * s, 0.16, -1.18]);
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
  // One continuous barrel. Deepest and widest just behind the shoulder, then
  // a long slow taper to a small rump — a front-heavy animal that looks like
  // it would take a wall down without noticing.
  B.group(1);
  sweep(B, {
    nodes: [
      { p: [0, 1.84, -1.86], rx: 0.42, rz: 0.50 },
      { p: [0, 1.94, -1.42], rx: 0.68, rz: 0.74 },   // rump
      { p: [0, 2.02, -0.82], rx: 0.72, rz: 0.86 },   // loin
      { p: [0, 2.08, -0.16], rx: 0.80, rz: 0.98 },
      { p: [0, 2.12, 0.42], rx: 0.86, rz: 1.06 },    // barrel at its deepest
      { p: [0, 2.14, 0.86], rx: 0.72, rz: 0.88 },
      { p: [0, 2.10, 1.10], rx: 0.50, rz: 0.62 },
    ],
    // 26 segments round, not 20. Everything below clumps the mane around the
    // barrel, and a 20-segment ring cannot carry a 13-cycle clump: it aliases
    // into a handful of broad hard-edged bands with arbitrary phase, which is
    // what put the coarse ochre streaking across the shoulder. Every angular
    // frequency here is now under six cycles, i.e. four-plus samples each.
    steps: 28, seg: 26, ref: [0, 1, 0], capStart: 0.6, capEnd: 0.25,
    shape: (th, u) => {
      const b = Math.cos(th);                       // +1 spine, -1 belly
      const side = Math.abs(Math.sin(th));
      let m = 1;
      // the shoulder mane rides as a raised, clumped mass over the withers
      const mane = Math.max(0, b) * Math.exp(-Math.pow((u - 0.74) / 0.22, 2));
      m += mane * (0.26 + Math.sin(th * 5 + u * 11) * 0.06 + Math.sin(th * 3) * 0.03);
      // flattish spine, heavy sagging gut
      m += b > 0 ? -0.06 * b * b * (1 - smooth((u - 0.6) / 0.2)) : 0.11 * b * b;
      // shoulder and haunch bosses
      m += side * 0.09 * Math.exp(-Math.pow((u - 0.80) / 0.13, 2));
      m += side * 0.09 * Math.exp(-Math.pow((u - 0.20) / 0.16, 2));
      // shag hanging off the flank in coarse vertical clumps
      m += Math.max(0, -b + 0.5) * side * 0.045
        * Math.max(0, Math.sin(th * 6 + u * 5)) * smooth((u - 0.3) / 0.4);
      return m;
    },
    colorAt: (th, u) => {
      const b = Math.cos(th);
      const shaggy = clamp01((b + 0.15) / 0.9) * smooth((u - 0.30) / 0.40);
      if (b < -0.55) return mix(BELLY, HIDE_DARK, clamp01((b + 1) / 0.45) * 0.85);
      const base = mix(HIDE, HIDE_DARK, 0.35 + 0.2 * Math.sin(u * 19 + th * 4));
      return base.lerp(hex(mix2(SHAG, SHAG_LIT, Math.sin(th * 6 + u * 5) * 0.5 + 0.5)), shaggy);
    },
    matAt: (th, u) => (Math.cos(th) > -0.1 && u > 0.30 ? M_SHAG : M_HIDE),
  });
  P.push({ geo: B.build(), bind: ['chain', ['hips', 'spine', 'chest']] });
  reset(B);

  /* ---------------------------------------------------- mane over withers */
  // A crest along the topline, not locks pinned to the flank.
  //
  // The locks used to be seeded on a ring around the barrel and aimed
  // downward, which put every one of them across the *side* of the shoulder —
  // 7 cm cones painted brighter than the hide behind them, so the animal wore
  // two dozen hard ochre bars that read as claw marks. Sinking them into the
  // barrel only traded that for three stray chips poking through.
  //
  // A mane is legible for the same reason the sabertusk's ruff is: it breaks
  // the *silhouette* against the sky. So they now sit on the spine ridge at
  // the top of the barrel — centre y 2.12, half-height ~0.5, and the mane
  // term in `shape` swells that to ~0.63, so the ridge sits at 2.74 — and
  // sweep back and out. Dark at the root, lifted only at the tips, which is
  // how hair actually reads — never a bright bar over a dark base.
  //
  // The root height is *measured*, not guessed. `rz` in the torso sweep is the
  // vertical radius, so the barrel's topline is `p.y + rz` per node — and the
  // mane bulge in `shape` swells that by up to 26 % over the withers, which is
  // exactly the 3.45 m `creaturecheck` reports as this species' `top`. Two
  // rounds were lost seeding the crest at 2.56 and then 2.74 and finding it
  // buried both times; the table below is the sweep's own node list.
  const RIDGE = [[-1.86, 2.34], [-1.42, 2.68], [-0.82, 2.88], [-0.16, 3.06],
    [0.42, 3.18], [0.86, 3.02], [1.10, 2.72]];
  const ridgeY = (z: number) => {
    for (let k = 1; k < RIDGE.length; k++) {
      if (z <= RIDGE[k][0] || k === RIDGE.length - 1) {
        const [z0, y0] = RIDGE[k - 1], [z1, y1] = RIDGE[k];
        const f = clamp01((z - z0) / (z1 - z0));
        return y0 + (y1 - y0) * f;
      }
    }
    return RIDGE[0][1];
  };
  B.group(2);
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const t = Math.floor(i / 2) / 12;                 // 0..1 along the withers
    const zc = 0.98 - t * 1.62;
    const x = side * (0.07 + (i % 3) * 0.055);
    // and add the mane bulge back on, otherwise the locks over the withers —
    // where the crest most needs to read — are the only ones still buried
    const y = ridgeY(zc) - 0.10 + 0.34 * Math.exp(-Math.pow((zc - 0.33) / 0.62, 2));
    horn(B, {
      from: [x, y, zc], dir: [side * 0.44, 0.30, -0.84], len: 0.36 + (i % 4) * 0.10,
      curve: [side * 0.06, -0.30, -0.14], r0: 0.145, r1: 0.042, flat: 0.30, seg: 5, steps: 4,
      colorAt: (th: any, u: number) => mix(mix2(SHAG_DARK, SHAG, (i % 5) / 5),
        SHAG_LIT, clamp01((u - 0.45) / 0.55) * 0.34),
      matAt: () => M_SHAG,
    });
  }
  emit(['bone', 'chest']);

  /* ------------------------------------------------------------- neck -- */
  B.group(3);
  sweep(B, {
    nodes: [
      { p: [0, 2.16, 0.84], rx: 0.58, rz: 0.60 },
      { p: [0, 2.10, 1.16], rx: 0.46, rz: 0.48 },
      { p: [0, 1.98, 1.44], rx: 0.36, rz: 0.38 },
    ],
    steps: 12, seg: 16, ref: [0, 1, 0], capStart: false, capEnd: false,
    shape: (th, u) => {
      const b = Math.cos(th);
      // heavy crest of mane on top, loose dewlap swinging underneath
      return 1 + Math.max(0, b) * 0.22 * (1 - u * 0.4)
        + Math.max(0, -b) * 0.26 * smooth((u - 0.15) / 0.5)
        + Math.sin(th * 9) * 0.06 * Math.max(0, b);
    },
    colorAt: (th, u) => (Math.cos(th) > -0.1
      ? mix(SHAG_DARK, SHAG_LIT, 0.30 + 0.45 * (Math.sin(th * 9) * 0.5 + 0.5))
      : mix(HIDE, BELLY, smooth((u - 0.2) / 0.6) * 0.6)),
    matAt: (th) => (Math.cos(th) > -0.1 ? M_SHAG : M_HIDE),
  });
  P.push({ geo: B.build(), bind: ['chain', ['chest', 'neck', 'head']] });
  reset(B);

  /* ------------------------------------------------------------- head -- */
  B.group(4);
  // The face is Garula's signature: a broad flat shield of hard keratin, edged
  // by a raised rim, with the eyes pushed right out to the corners and the
  // snout hanging below it. Sculpted as one mass, then the rim added on top.
  sculptBlob(B, {
    center: [0, 1.86, 1.62], scale: [0.40, 0.34, 0.44], segU: 26, segV: 18,
    brushes: [
      { p: [0, 2.10, 1.44], r: [0.46, 0.22, 0.30], amt: 0.075, dir: [0, 1, -0.15] },       // crown boss
      { p: [0, 1.90, 2.02], r: [0.44, 0.36, 0.28], amt: -0.095, dir: [0, 0, 1] },          // flatten the face
      { p: [0, 1.94, 1.96], r: [0.30, 0.23, 0.14], amt: 0.040, dir: [0, 0, 1] },           // plate proud of the skull
      { p: [0.31, 1.94, 1.80], r: [0.14, 0.13, 0.16], amt: -0.045, dir: 'normal', mirror: true }, // eye pit
      { p: [0.36, 1.82, 1.66], r: [0.16, 0.20, 0.22], amt: 0.050, dir: [1, -0.2, 0], mirror: true }, // cheek slab
      { p: [0, 1.62, 2.00], r: [0.30, 0.26, 0.28], amt: 0.070, dir: [0, -0.5, 1] },        // snout
      { p: [0, 1.54, 2.10], r: [0.22, 0.16, 0.16], amt: 0.040, dir: [0, -0.6, 1] },        // nose pad
      { p: [0, 2.02, 1.72], r: [0.16, 0.14, 0.24], amt: 0.026, dir: [0, 1, 0] },           // nasal ridge
    ],
    colorAt: (u: any, v: any, p: any) => {
      const nose = clamp01((p.z - 2.06) / 0.12);
      const face = clamp01((p.z - 1.90) / 0.16) * clamp01((p.y - 1.70) / 0.14);
      const top = clamp01((p.y - 2.02) / 0.14);
      return mix(mix2(HIDE, PLATE, face * 0.85), NOSE, nose * 0.9)
        .lerp(hex(SHAG_DARK), top * 0.55);
    },
    matAt: (u: any, v: any, p: any) => {
      if (p.z > 2.08) return M_WET;
      const face = clamp01((p.z - 1.92) / 0.14) * clamp01((p.y - 1.70) / 0.14);
      return face > 0.5 ? M_PLATE : M_HIDE;
    },
  });
  // Raised rim running round the edge of the face shield. Swept along the rim
  // *path* rather than across it, so it is a bead of keratin standing proud of
  // the plate — the hard edge that gives the flat face something to catch the
  // key light on. It stops short at the bottom, where the jaw covers the gap.
  {
    const rimNodes = [];
    for (let i = 0; i <= 14; i++) {
      const a = -1.9 + (i / 14) * (Math.PI * 2 - 1.0);   // gap at the chin
      rimNodes.push({
        p: [Math.sin(a) * 0.255, 1.91 + Math.cos(a) * 0.195, 1.945 - Math.abs(Math.cos(a)) * 0.030],
        rx: 0.032 - Math.abs(Math.cos(a)) * 0.007,
      });
    }
    sweep(B, {
      nodes: rimNodes, steps: 26, seg: 7, ref: [0, 0, 1], capStart: 0.4, capEnd: 0.4,
      colorAt: () => col(PLATE), matAt: () => M_PLATE,
    });
  }
  for (const s of [-1, 1]) {
    B.glow(EYE, 1.6);
    sculptBlob(B, {
      center: [0.315 * s, 1.945, 1.845], scale: [0.055, 0.048, 0.042], segU: 10, segV: 7,
      colorAt: () => col(0x160b02), matAt: () => M_WET,
    });
    B.glow(null);
    // small mobile ear, half lost in the mane
    sweep(B, {
      nodes: [
        { p: [0.33 * s, 2.04, 1.44], rx: 0.075, rz: 0.034 },
        { p: [0.42 * s, 2.06, 1.36], rx: 0.052, rz: 0.024 },
        { p: [0.48 * s, 2.03, 1.28], rx: 0.018, rz: 0.009 },
      ],
      steps: 6, seg: 7, ref: [0, 1, 0], capStart: 0.4, capEnd: 0.5,
      colorAt: (th, u) => mix(SHAG_DARK, HIDE, u * 0.4), matAt: () => M_HIDE,
    });
    // brow tuft over the eye
    horn(B, {
      from: [0.30 * s, 2.03, 1.82], dir: [0.28 * s, 0.72, 0.62], len: 0.22,
      curve: [0, -0.06, -0.04], r0: 0.050, r1: 0.005, flat: 0.30, seg: 5, steps: 3,
      colorAt: () => col(SHAG_DARK), matAt: () => M_SHAG,
    });
  }
  emit(['bone', 'head']);

  /* -------------------------------------------------------------- jaw -- */
  B.group(5);
  sweep(B, {
    nodes: [
      { p: [0, 1.64, 1.62], rx: 0.28, rz: 0.24 },
      { p: [0, 1.60, 1.90], rx: 0.24, rz: 0.21 },
      { p: [0, 1.60, 2.10], rx: 0.17, rz: 0.15 },
    ],
    steps: 8, seg: 12, ref: [0, 1, 0], capStart: 0.5, capEnd: 0.5,
    shape: (th) => 1 + Math.max(0, -Math.cos(th)) * 0.34,
    colorAt: (th) => (Math.cos(th) < -0.2 ? col(BELLY) : col(HIDE_DARK)),
    matAt: () => M_HIDE,
  });
  // The tusks. Out of the lower lip, forward, then hooking hard up — the one
  // element of this animal that reads instantly at thirty metres.
  for (const s of [-1, 1]) {
    horn(B, {
      from: [0.30 * s, 1.58, 1.88], dir: [0.52 * s, 0.02, 0.85], len: 1.15,
      curve: [0.10 * s, 1.05, -0.30], r0: 0.115, r1: 0.012, taper: 0.70,
      seg: 8, steps: 9, flat: 0.90,
      colorAt: (th: any, u: number) => mix(TUSK_DARK, TUSK, smooth((u - 0.05) / 0.45)),
      matAt: () => M_TUSK,
    });
    // second, smaller tusk inboard of it
    horn(B, {
      from: [0.16 * s, 1.55, 1.94], dir: [0.26 * s, 0.14, 0.95], len: 0.50,
      curve: [0.06 * s, 0.34, -0.16], r0: 0.055, r1: 0.006, seg: 6, steps: 5,
      colorAt: () => col(TUSK), matAt: () => M_TUSK,
    });
  }
  // chin beard
  for (let i = 0; i < 7; i++) {
    horn(B, {
      from: [(i - 3) * 0.06, 1.50, 1.74 + (i % 2) * 0.07], dir: [0, -1, -0.22],
      len: 0.26 + (i % 3) * 0.07, r0: 0.045, r1: 0.005, flat: 0.36, seg: 5, steps: 3,
      colorAt: () => mix(SHAG_DARK, HIDE_DARK, (i % 3) / 3), matAt: () => M_SHAG,
    });
  }
  emit(['bone', 'jaw']);

  /* ------------------------------------------------------------- legs -- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    B.group(6);
    // front pillar: enormous at the shoulder, feathered with shag to the knee,
    // then a bare grey cannon bone
    sweep(B, {
      nodes: [
        { p: [0.54 * s, 2.24, 0.40], rx: 0.34, rz: 0.40 },
        { p: [0.59 * s, 1.78, 0.44], rx: 0.32, rz: 0.38 },   // shoulder muscle
        { p: [0.62 * s, 1.42, 0.48], rx: 0.235, rz: 0.27 },  // elbow
        { p: [0.64 * s, 1.06, 0.38], rx: 0.180, rz: 0.205 },
        { p: [0.65 * s, 0.70, 0.32], rx: 0.150, rz: 0.165 }, // carpus
        { p: [0.66 * s, 0.36, 0.36], rx: 0.125, rz: 0.138 }, // cannon
        { p: [0.66 * s, 0.19, 0.38], rx: 0.132, rz: 0.145 },
      ],
      steps: 22, seg: 12, ref: [0, 0, 1], capStart: 0.5, capEnd: false,
      shape: (th, u) => {
        const back = -Math.cos(th);
        return 1 + Math.max(0, back) * 0.24 * Math.exp(-Math.pow((u - 0.16) / 0.20, 2))
          + Math.max(0, back) * 0.10 * Math.exp(-Math.pow((u - 0.48) / 0.12, 2))
          // shaggy feathering down the outside of the upper leg
          + Math.max(0, Math.sin(th) * s) * 0.06
            * Math.max(0, Math.sin(th * 11)) * (1 - smooth((u - 0.35) / 0.25));
      },
      colorAt: (th, u) => {
        const feather = (1 - smooth((u - 0.30) / 0.28));
        return mix(HIDE, HIDE_DARK, clamp01((u - 0.4) / 0.55) * 0.9)
          .lerp(hex(SHAG_DARK), feather * 0.7);
      },
      matAt: (th, u) => (u < 0.35 ? M_SHAG : M_HIDE),
    });
    P.push({ geo: B.build(), bind: ['chain', [`fsh${n}`, `fel${n}`, `fkn${n}`, `fhf${n}`]] });
    reset(B);

    B.group(7);
    hoof(B, 0.66 * s, 0.16, 0.40);
    emit(['bone', `fhf${n}`]);

    B.group(6);
    sweep(B, {
      nodes: [
        { p: [0.52 * s, 2.06, -1.24], rx: 0.36, rz: 0.42 },
        { p: [0.56 * s, 1.62, -1.36], rx: 0.34, rz: 0.40 },  // thigh
        { p: [0.58 * s, 1.26, -1.50], rx: 0.235, rz: 0.265 }, // stifle
        { p: [0.59 * s, 0.96, -1.36], rx: 0.180, rz: 0.200 },
        { p: [0.60 * s, 0.66, -1.16], rx: 0.145, rz: 0.158 }, // hock
        { p: [0.61 * s, 0.36, -1.16], rx: 0.120, rz: 0.132 },
        { p: [0.61 * s, 0.19, -1.18], rx: 0.128, rz: 0.140 },
      ],
      steps: 22, seg: 12, ref: [0, 0, 1], capStart: 0.5, capEnd: false,
      shape: (th, u) => {
        const back = -Math.cos(th);
        return 1 + Math.max(0, back) * 0.30 * Math.exp(-Math.pow((u - 0.14) / 0.22, 2))
          + Math.max(0, Math.sin(th) * s) * 0.05
            * Math.max(0, Math.sin(th * 11)) * (1 - smooth((u - 0.30) / 0.25));
      },
      colorAt: (th, u) => {
        const feather = (1 - smooth((u - 0.26) / 0.26));
        return mix(HIDE, HIDE_DARK, clamp01((u - 0.4) / 0.55) * 0.9)
          .lerp(hex(SHAG_DARK), feather * 0.65);
      },
      matAt: (th, u) => (u < 0.32 ? M_SHAG : M_HIDE),
    });
    P.push({ geo: B.build(), bind: ['chain', [`bhp${n}`, `bkn${n}`, `bhk${n}`, `bhf${n}`]] });
    reset(B);

    B.group(7);
    hoof(B, 0.61 * s, 0.16, -1.16);
    emit(['bone', `bhf${n}`]);
  }

  /* ------------------------------------------------------------- tail -- */
  B.group(8);
  sweep(B, {
    nodes: [
      { p: [0, 1.90, -1.62], rx: 0.13 },
      { p: [0, 1.70, -1.80], rx: 0.095 },
      { p: [0, 1.46, -1.90], rx: 0.070 },
      { p: [0, 1.30, -1.94], rx: 0.034 },
    ],
    steps: 12, seg: 8, ref: [0, 1, 0], capStart: false, capEnd: 0.5,
    shape: (th, u) => 1 + smooth((u - 0.55) / 0.25) * (1 - smooth((u - 0.92) / 0.08)) * 1.6
      + Math.sin(th * 8) * 0.14 * smooth((u - 0.55) / 0.3),
    colorAt: (th, u) => mix(HIDE_DARK, SHAG_DARK, clamp01((u - 0.45) / 0.4)),
    matAt: () => M_SHAG,
  });
  P.push({ geo: B.build(), bind: ['chain', ['tail1', 'tail2']] });
  reset(B);

  for (const p of P) {
    if (p.bind[0] === 'chain') rig.attachChain(p.geo, p.bind[1], 0.95);
    else rig.attach(p.geo, p.bind[1]);
  }

  const mat = creatureMaterial({
    roughness: 0.93, metalness: 0.0,
    normalMap: organicNormal(), normalScale: 0.9, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 3.8, coat: { mottle: 0.16, tick: 0.20, light: 0xa89060, shade: 0.20, dust: 0.34, dustTop: 0.55 } });
}

/** A heavy three-toed foot: two front toes, a broad pad, a rear dewclaw. */
function hoof(B: CBuilder, x: number, y: number, z: number) {
  const s = Math.sign(x) || 1;
  for (const i of [-1, 1]) {
    sweep(B, {
      nodes: [
        { p: [x + i * 0.068 * s, y + 0.06, z - 0.03], rx: 0.072, rz: 0.086 },
        { p: [x + i * 0.072 * s, y - 0.05, z + 0.04], rx: 0.066, rz: 0.098 },
        { p: [x + i * 0.072 * s, y - 0.135, z + 0.11], rx: 0.045, rz: 0.062 },
      ],
      steps: 6, seg: 9, ref: [0, 1, 0], capStart: 0.4, capEnd: 0.4,
      colorAt: (th, u) => mix(HOOF, 0x4e463c, u * 0.45), matAt: () => M_HOOF,
    });
  }
  horn(B, {
    from: [x, y - 0.02, z - 0.16], dir: [0, -0.5, -0.87], len: 0.095,
    r0: 0.036, r1: 0.010, seg: 5, steps: 3, colorAt: () => col(HOOF), matAt: () => M_HOOF,
  });
}

function reset(B: CBuilder) {
  B.pos.length = 0; B.uv.length = 0; B.col.length = 0;
  B.emi.length = 0; B.mp.length = 0; B.grp.length = 0; B.idx.length = 0;
  B.glow(null);
}

const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color();
/** Blend two sRGB hexes into the shared working colour. */
function mix(a: number, b: number, t: any) {
  _c1.setHex(a, THREE.SRGBColorSpace);
  _c2.setHex(b, THREE.SRGBColorSpace);
  return _c1.lerp(_c2, clamp01(t));
}
/** Same blend, but returns a hex so it can be fed back into `mix`/`hex`. */
function mix2(a: number, b: number, t: number) {
  _c3.setHex(a, THREE.SRGBColorSpace);
  _c2.setHex(b, THREE.SRGBColorSpace);
  return _c3.lerp(_c2, clamp01(t)).getHex();
}
/** A second scratch colour, so a `.lerp` target does not clobber `mix`. */
function hex(h: number) { return _c2.setHex(h, THREE.SRGBColorSpace); }
function col(h: number) { return _c1.setHex(h, THREE.SRGBColorSpace); }

class GarulaEnemy extends QuadrupedEnemy {
  /** Tuning block, assigned below the class body. Read through `this.A`. */
  static ANIM: any;
  override anim!: any;
  override attackId!: any;
  override state!: any;
  override stateTime!: any;
  override visual!: any;
  constructor(opts: any) { super(GARULA, opts); }

  override telegraphScale() {
    // the barrel charge coils low and long; the quake rears instead
    if (this.attackId === 'barrel') return 1.30;
    if (this.attackId === 'quake') return -0.95;
    return 0.90;
  }

  override leapScale() { return this.attackId === 'quake' ? 1.0 : 0.18; }

  /**
   * `quake` is the only move that goes up, so it gets its own wind-up: the
   * forelegs leave the ground, the head goes back and the whole mass hangs
   * there for a beat before it comes down. The negative `telegraphScale`
   * already inverts the body drop; this adds the rear itself.
   */
  override poseTelegraph(S: any, t: any) {
    super.poseTelegraph(S, t);
    if (this.attackId !== 'quake') {
      if (this.attackId === 'barrel') {
        // scuffing the dirt with the near forefoot, building to the charge
        const k = attackEnvelope('telegraph', this.stateTime, this._timingAll()).tension;
        const paw = Math.sin(this.stateTime * 7.5) * k;
        this.anim.solveLeg('fR', 0.36 * Math.max(0, paw), 0.26 * Math.max(0, paw), S,
          { kneeSign: 1, footPitch: -0.28 });
        // head swings low and level, tusks forward
        S('head', -0.42 * k, 0, 0);
      }
      return;
    }
    const env = attackEnvelope('telegraph', this.stateTime, this._timingAll());
    const k = env.tension;
    const rear = smooth(k);
    // The forefeet leave the ground, but only as far as the leg can actually
    // reach — asking for more than `reachLen` makes the solver clamp, and a
    // clamped leg folds flat into the chest and vanishes from the silhouette.
    this.spine(S, -0.55 * rear + env.shake, 0, 0);
    this.stance(S, {
      front: { reach: -0.30 * rear, lift: 0.62 * rear, splay: 0.20 * rear },
      back: { reach: 0.16 * rear, lift: 0 },
    });
    this.aimHead(S, { pitch: -0.34 * rear, stabilise: 0.8 });
    S('jaw', 0.55 * k);
    this.tail(t, 0.30 * k, 0.14, 3);
    this.visual.rotation.x -= 0.30 * rear;
    this.visual.position.y += 0.14 * rear;
  }

  override poseAttack(S: any, t: any) {
    if (this.attackId !== 'quake') { super.poseAttack(S, t); return; }
    // and down: both forefeet together, the body driving through the ground
    const env = attackEnvelope(this.state === 'recover' ? 'recover' : 'attack',
      this.stateTime, this._timingAll());
    const k = env.k;
    const up = clamp01(-k);
    const down = clamp01(k);
    this.spine(S, -0.55 * up + 0.34 * down, 0, 0);
    this.stance(S, {
      drop: 0.24 * down * (1 - env.f * 0.4),
      front: { reach: -0.30 * up + 0.30 * down, lift: 0.62 * up, splay: 0.20 * up },
      back: { reach: 0.16 * up - 0.10 * down },
    });
    // it drives the slam with its shoulders; the skull stays out of the dirt
    this.aimHead(S, { pitch: -0.34 * up + 0.22 * down, stabilise: 0.8 });
    S('jaw', 0.75 * down);
    this.tail(t, -0.45 * down, 0.2, 4);
    this.visual.rotation.x += -0.30 * up + 0.06 * down;
    this.visual.position.y += 0.14 * up;
  }
}

GarulaEnemy.ANIM = {
  legs: {
    fL: ['fshL', 'felL', 'fknL', 'fhfL'], fR: ['fshR', 'felR', 'fknR', 'fhfR'],
    bL: ['bhpL', 'bknL', 'bhkL', 'bhfL'], bR: ['bhpR', 'bknR', 'bhkR', 'bhfR'],
  },
  trunk: ['hips', 'spine', 'chest', 'neck', 'head'],
  tails: ['tail1', 'tail2'],
  jawBone: 'jaw',
  heavy: true,
  strideLen: 2.9, stride: 0.58, lift: 0.24, splay: 0.02, bodyScale: 2.0,
  crouch: 0.26, crouchFront: 0.12, crouchBack: -0.20, crouchPitch: 0.13, headDown: 0.36,
  lunge: 0.36, lungeLift: 0.30, lungeLiftBack: 0, hop: 0.05,
  strikePitch: 0.15, headThrust: 0.46, jaw: 0.30, jawBite: 0.55,
  runNeck: 0.09, runHead: 0.15, flex: 0.35,
  bodyY: 2.14, bodyR: 0.94, deathRoll: 0.92, deathSlow: 2.0,
  tailRun: -0.20, tailIdle: 0.08,
  footPitchF: -0.05, footPitchB: 0.05,
};

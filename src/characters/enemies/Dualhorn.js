import * as THREE from 'three';
import { Rig, creatureMaterial } from './RigBuilder.js';
import { organicNormal, organicRoughness } from './EnemyBase.js';
import { QuadrupedEnemy } from './Quadruped.js';
import { CBuilder, sweep, sculptBlob, horn } from '../rig/Sculpt.js';
import { attackEnvelope, clamp01, smooth, lerp } from '../rig/CreatureAnim.js';

const HIDE = 0x6e5b41;
const HIDE_DARK = 0x3c3123;
const SHAG = 0x7a6540;
const SHAG_DARK = 0x40331d;
const BELLY = 0x9a8767;
const HORN = 0xd8cdaa;
const HORN_DARK = 0x9d8f6d;
const HOOF = 0x2b2620;
const NOSE = 0x25201b;
const EYE = 0xc46a1e;

const M_HIDE = [0.93, 0];
const M_SHAG = [1.0, 0];
const M_HORN = [0.34, 0.05];
const M_HOOF = [0.42, 0.10];
const M_WET = [0.16, 0];

/**
 * Dualhorn — the Leide bull.
 *
 * Two tonnes of forequarter: a shaggy withers hump that carries the head, a
 * ribcage far deeper than it is wide, short pillar legs on cloven hooves, and
 * a pair of forward-raked horns sweeping out of a heavy brow boss. Everything
 * about the silhouette says the danger comes from the front and arrives at
 * speed. It charges, it gores, and it stamps — and each of those three has a
 * wind-up shaped differently enough to tell apart from behind a rock.
 */
export const DUALHORN = {
  key: 'dualhorn',
  faction: 'beast',
  expClass: 'normal',
  stats: {
    name: 'Dualhorn', hp: 2600, poise: 90, speed: 4.4, attackRange: 3.4,
    aggroRange: 30, radius: 1.05, height: 2.3, damage: 190, level: 18,
  },
  weakness: 'fire',
  resist: 'ice',
  weakTo: ['greatsword'],
  senses: { sight: 30, fov: 1.7, hearing: 22 },
  drops: [
    { id: 'dualhorn_horn', chance: 0.5, count: 1 },
    { id: 'beast_hide', chance: 0.4, count: 1 },
  ],
  timing: { telegraph: 0.7, strike: 0.26, attack: 0.8, recover: 1.0 },
  attacks: [
    { id: 'gore', range: 3.6, weight: 3, mult: 1.0, poise: 26, hitRadius: 2.6, arc: 1.3,
      telegraph: 0.55, strike: 0.22, attack: 0.7, recover: 0.9, cooldown: 1.4 },
    { id: 'charge', range: 16, minRange: 6, weight: 2, mult: 1.6, poise: 55, hitRadius: 2.2,
      telegraph: 0.95, strike: 0.30, attack: 1.1, recover: 1.4, cooldown: 4.0,
      lunge: 16, tracking: 0.4, unblockable: true },
    { id: 'stomp', range: 3.2, weight: 2, mult: 1.3, poise: 40, hitRadius: 3.2, arc: Math.PI,
      telegraph: 0.85, strike: 0.30, attack: 0.9, recover: 1.2, cooldown: 3.2, aoe: true },
  ],
  buildPrototype,
  make(opts) { return new DualhornEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('hips', 'root', [0, 1.72, -1.12]);
  rig.bone('spine', 'hips', [0, 1.90, -0.48]);
  rig.bone('chest', 'spine', [0, 2.02, 0.30]);
  rig.bone('neck', 'chest', [0, 1.92, 0.90]);
  rig.bone('head', 'neck', [0, 1.74, 1.38]);
  rig.bone('jaw', 'head', [0, 1.56, 1.50]);
  rig.bone('tail1', 'hips', [0, 1.62, -1.42]);
  rig.bone('tail2', 'tail1', [0, 1.32, -1.62]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`fsh${n}`, 'chest', [0.44 * s, 1.92, 0.34]);
    rig.bone(`fel${n}`, `fsh${n}`, [0.49 * s, 1.30, 0.42]);
    rig.bone(`fkn${n}`, `fel${n}`, [0.52 * s, 0.62, 0.28]);
    rig.bone(`fhf${n}`, `fkn${n}`, [0.53 * s, 0.13, 0.34]);
    rig.bone(`bhp${n}`, 'hips', [0.42 * s, 1.76, -1.08]);
    rig.bone(`bkn${n}`, `bhp${n}`, [0.46 * s, 1.14, -1.30]);
    rig.bone(`bhk${n}`, `bkn${n}`, [0.48 * s, 0.58, -1.02]);
    rig.bone(`bhf${n}`, `bhk${n}`, [0.49 * s, 0.13, -1.04]);
  }

  const B = new CBuilder();
  const P = [];
  const emit = (bind) => { P.push({ geo: B.build(), bind }); reset(B); };

  /* ------------------------------------------------------------ torso -- */
  B.group(1);
  sweep(B, {
    nodes: [
      { p: [0, 1.62, -1.58], rx: 0.34, rz: 0.42 },
      { p: [0, 1.72, -1.20], rx: 0.56, rz: 0.60 },   // rump
      { p: [0, 1.78, -0.66], rx: 0.50, rz: 0.62 },   // loin
      { p: [0, 1.84, -0.10], rx: 0.53, rz: 0.70 },
      { p: [0, 1.90, 0.36], rx: 0.60, rz: 0.80 },    // barrel, deep not wide
      { p: [0, 1.92, 0.72], rx: 0.50, rz: 0.66 },
      { p: [0, 1.90, 0.92], rx: 0.36, rz: 0.46 },
    ],
    steps: 28, seg: 20, ref: [0, 1, 0], capStart: 0.6, capEnd: 0.25,
    shape: (th, u) => {
      const b = Math.cos(th);                       // +1 spine, -1 belly
      const side = Math.abs(Math.sin(th));
      let m = 1;
      // the withers hump: the animal's whole read from the side
      const hump = Math.max(0, b) * Math.exp(-Math.pow((u - 0.72) / 0.17, 2));
      // clumped guard hair, not a smooth dome: the ridges catch the rim light
      m += hump * (0.27 + Math.sin(th * 8 + u * 20) * 0.060 + Math.sin(th * 17) * 0.030);
      // flat top over the loin, heavy hanging belly
      m += b > 0 ? -0.07 * b * b * (1 - smooth((u - 0.55) / 0.2)) : 0.09 * b * b;
      // shoulder and haunch masses
      m += side * 0.10 * Math.exp(-Math.pow((u - 0.80) / 0.13, 2));
      m += side * 0.11 * Math.exp(-Math.pow((u - 0.18) / 0.15, 2));
      // ribs
      m += Math.sin(u * 78) * 0.012 * side * clamp01(-b + 0.35) * smooth((u - 0.5) / 0.2);
      return m;
    },
    colorAt: (th, u) => {
      const b = Math.cos(th);
      const shaggy = clamp01((b - 0.1) / 0.9) * smooth((u - 0.45) / 0.35);
      // Counter-shading, and it was the wrong way round: the old ramp put
      // near-black on the *lower flank* and the pale value only right under
      // the belly, so a three-metre bull read as one black mass with a pale
      // hump floating on it. Dark on top, mid on the flank, pale underneath.
      const hide = mix(HIDE, HIDE_DARK, 0.14 + 0.22 * Math.sin(u * 21 + th * 4));
      if (b < -0.25) return mix(hide, BELLY, clamp01((-b - 0.25) / 0.55) * 0.85);
      return mix(mix(hide, HIDE_DARK, clamp01((b - 0.45) / 0.5) * 0.55), SHAG, shaggy);
    },
    matAt: (th, u) => (Math.cos(th) > 0.25 && u > 0.55 ? M_SHAG : M_HIDE),
  });
  P.push({ geo: B.build(), bind: ['chain', ['hips', 'spine', 'chest']] });
  reset(B);

  /* ---------------------------------------------------- shag on the hump */
  // Long guard hair as flattened blades. Enough to break the hump silhouette
  // without paying for a fur shell.
  B.group(2);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const r = 0.34 + (i % 3) * 0.07;
    const x = Math.sin(a) * r * 0.85;
    const z = 0.30 + Math.cos(a) * r * 0.55;
    const y = 2.18 - Math.abs(Math.sin(a)) * 0.22;
    horn(B, {
      from: [x, y, z], dir: [x * 0.4, 0.55, -0.75], len: 0.26 + (i % 4) * 0.06,
      curve: [0, -0.16, -0.18], r0: 0.070, r1: 0.005, flat: 0.26, seg: 5, steps: 4,
      colorAt: () => mix(SHAG, SHAG_DARK, (i % 5) / 5), matAt: () => M_SHAG,
    });
  }
  emit(['bone', 'chest']);

  /* ------------------------------------------------------------- neck -- */
  B.group(3);
  sweep(B, {
    nodes: [
      { p: [0, 1.96, 0.72], rx: 0.42, rz: 0.44 },
      { p: [0, 1.92, 1.02], rx: 0.34, rz: 0.36 },
      { p: [0, 1.82, 1.28], rx: 0.27, rz: 0.30 },
    ],
    steps: 12, seg: 16, ref: [0, 1, 0], capStart: false, capEnd: false,
    shape: (th, u) => {
      const b = Math.cos(th);
      // crest along the top of the neck, dewlap hanging beneath
      return 1 + Math.max(0, b) * 0.16 * (1 - u * 0.5)
        + Math.max(0, -b) * 0.22 * smooth((u - 0.2) / 0.5)
        + Math.sin(th * 11) * 0.05 * Math.max(0, b);
    },
    colorAt: (th, u) => mix(SHAG_DARK, HIDE, 0.3 + 0.4 * (Math.sin(th * 11) * 0.5 + 0.5)),
    matAt: () => M_SHAG,
  });
  P.push({ geo: B.build(), bind: ['chain', ['chest', 'neck', 'head']] });
  reset(B);

  /* ------------------------------------------------------------- head -- */
  B.group(4);
  // Bovine skull: a heavy brow boss between the horns, wide zygomatics, a
  // broad squared-off muzzle, and eyes set well out to the sides.
  sculptBlob(B, {
    center: [0, 1.72, 1.46], scale: [0.24, 0.24, 0.36], segU: 26, segV: 18,
    brushes: [
      { p: [0, 1.92, 1.32], r: [0.34, 0.16, 0.24], amt: 0.075, dir: [0, 1, -0.2] },     // horn boss
      { p: [0, 1.82, 1.54], r: [0.26, 0.12, 0.18], amt: 0.045, dir: [0, 1, 0.3] },      // brow
      { p: [0.20, 1.74, 1.44], r: [0.11, 0.10, 0.12], amt: -0.035, dir: 'normal', mirror: true }, // eye pit
      { p: [0.24, 1.67, 1.38], r: [0.12, 0.16, 0.18], amt: 0.045, dir: [1, -0.2, 0], mirror: true }, // cheek
      { p: [0, 1.64, 1.74], r: [0.22, 0.22, 0.26], amt: -0.075, dir: 'normal' },        // muzzle taper
      { p: [0, 1.60, 1.82], r: [0.20, 0.14, 0.16], amt: 0.048, dir: [0, -0.4, 1] },     // squared nose pad
      { p: [0, 1.78, 1.64], r: [0.10, 0.10, 0.20], amt: 0.020, dir: [0, 1, 0] },        // nasal bone
    ],
    colorAt: (u, v, p) => {
      const nose = clamp01((p.z - 1.80) / 0.10);
      const under = clamp01((1.66 - p.y) / 0.12);
      return mix(mix(HIDE, HIDE_DARK, clamp01((p.z - 1.5) / 0.3) * 0.6), NOSE, nose * 0.9)
        .lerp(new THREE.Color().setHex(BELLY, THREE.SRGBColorSpace), under * 0.3);
    },
    matAt: (u, v, p) => (p.z > 1.82 ? M_WET : M_HIDE),
  });
  for (const s of [-1, 1]) {
    B.glow(EYE, 2.4);
    sculptBlob(B, {
      center: [0.205 * s, 1.745, 1.475], scale: [0.056, 0.048, 0.044], segU: 10, segV: 7,
      colorAt: () => col(0x140a02), matAt: () => M_WET,
    });
    B.glow(null);
    // ear tucked behind the horn boss
    sweep(B, {
      nodes: [
        { p: [0.24 * s, 1.86, 1.26], rx: 0.07, rz: 0.035 },
        { p: [0.34 * s, 1.88, 1.16], rx: 0.055, rz: 0.026 },
        { p: [0.42 * s, 1.86, 1.05], rx: 0.020, rz: 0.010 },
      ],
      steps: 7, seg: 8, ref: [0, 1, 0], capStart: 0.4, capEnd: 0.5,
      colorAt: () => col(HIDE_DARK), matAt: () => M_HIDE,
    });
    // the horns: out, forward, then up. Growth rings near the base.
    horn(B, {
      from: [0.20 * s, 1.96, 1.34], dir: [0.66 * s, 0.26, 0.70], len: 0.86,
      curve: [-0.22 * s, 0.54, 0.10], r0: 0.115, r1: 0.012, taper: 0.72,
      seg: 9, steps: 9, flat: 0.88,
      colorAt: (th, u) => mix(HORN_DARK, HORN, smooth((u - 0.1) / 0.5)),
      matAt: () => M_HORN,
    });
    // ridged sheath at the horn base
    sweep(B, {
      nodes: [
        { p: [0.21 * s, 1.965, 1.36], rx: 0.125 },
        { p: [0.29 * s, 2.005, 1.44], rx: 0.106 },
      ],
      steps: 6, seg: 9, ref: [0, 1, 0], capStart: false, capEnd: false,
      shape: (th, u) => 1 + Math.max(0, Math.sin(u * 26)) * 0.10,
      colorAt: () => col(HORN_DARK), matAt: () => M_HORN,
    });
    // lower tusk
    horn(B, {
      from: [0.13 * s, 1.62, 1.74], dir: [0.14 * s, 0.86, 0.49], len: 0.22,
      curve: [0, 0.04, -0.08], r0: 0.036, r1: 0.004, seg: 6, steps: 5,
      colorAt: () => col(HORN), matAt: () => M_HORN,
    });
  }
  emit(['bone', 'head']);

  /* -------------------------------------------------------------- jaw -- */
  B.group(5);
  sweep(B, {
    nodes: [
      { p: [0, 1.56, 1.46], rx: 0.19, rz: 0.16 },
      { p: [0, 1.54, 1.68], rx: 0.16, rz: 0.14 },
      { p: [0, 1.56, 1.84], rx: 0.12, rz: 0.11 },
    ],
    steps: 8, seg: 12, ref: [0, 1, 0], capStart: 0.5, capEnd: 0.5,
    shape: (th) => 1 + Math.max(0, -Math.cos(th)) * 0.30,
    colorAt: (th) => (Math.cos(th) < -0.2 ? col(BELLY) : col(HIDE_DARK)),
    matAt: () => M_HIDE,
  });
  // beard
  for (let i = 0; i < 6; i++) {
    horn(B, {
      from: [(i - 2.5) * 0.05, 1.48, 1.54 + (i % 2) * 0.06], dir: [0, -1, -0.25],
      len: 0.20 + (i % 3) * 0.05, r0: 0.035, r1: 0.004, flat: 0.4, seg: 5, steps: 3,
      colorAt: () => col(SHAG_DARK), matAt: () => M_SHAG,
    });
  }
  emit(['bone', 'jaw']);

  /* ------------------------------------------------------------- legs -- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    B.group(6);
    sweep(B, {
      // A bull's foreleg is not a taper, it is four alternating swells and
      // pinches, and the pinches have to be *hard* or the leg comes out as the
      // smooth boneless tube this one was. The cannon in particular is bone
      // and tendon with almost no flesh on it, so it is barely half the width
      // of the forearm above it and the fetlock swells again below.
      nodes: [
        { p: [0.42 * s, 2.02, 0.34], rx: 0.265, rz: 0.305 },
        { p: [0.46 * s, 1.62, 0.38], rx: 0.250, rz: 0.290 },  // shoulder muscle
        { p: [0.49 * s, 1.28, 0.42], rx: 0.150, rz: 0.170 },  // elbow, pinched
        { p: [0.51 * s, 0.94, 0.34], rx: 0.148, rz: 0.168 },  // forearm, extensor mass
        { p: [0.52 * s, 0.62, 0.28], rx: 0.084, rz: 0.094 },  // carpus, all bone
        { p: [0.53 * s, 0.34, 0.32], rx: 0.060, rz: 0.068 },  // cannon
        { p: [0.53 * s, 0.20, 0.34], rx: 0.094, rz: 0.102 },  // fetlock
        { p: [0.53 * s, 0.15, 0.35], rx: 0.082, rz: 0.090 },  // pastern
      ],
      steps: 22, seg: 12, ref: [0, 0, 1], capStart: 0.5, capEnd: false,
      shape: (th, u) => {
        const back = -Math.cos(th);
        return 1 + Math.max(0, back) * 0.22 * Math.exp(-Math.pow((u - 0.16) / 0.20, 2))
          + Math.max(0, back) * 0.10 * Math.exp(-Math.pow((u - 0.50) / 0.12, 2));
      },
      // black points below the knee and a pale inner face, so four legs read as
      // four legs instead of as one dark mass under the body
      colorAt: (th, u) => {
        const inner = clamp01(Math.sin(th) * s * -1) * clamp01((0.45 - u) / 0.4);
        return mix(mix(HIDE, BELLY, inner * 0.4), HIDE_DARK, clamp01((u - 0.52) / 0.28) * 0.95);
      },
      matAt: () => M_HIDE,
    });
    P.push({ geo: B.build(), bind: ['chain', [`fsh${n}`, `fel${n}`, `fkn${n}`, `fhf${n}`]] });
    reset(B);

    B.group(7);
    hoof(B, 0.53 * s, 0.13, 0.36);
    emit(['bone', `fhf${n}`]);

    B.group(6);
    sweep(B, {
      nodes: [
        { p: [0.40 * s, 1.86, -1.06], rx: 0.285, rz: 0.345 },
        { p: [0.44 * s, 1.46, -1.18], rx: 0.278, rz: 0.330 }, // thigh
        { p: [0.46 * s, 1.12, -1.30], rx: 0.165, rz: 0.188 }, // stifle
        { p: [0.47 * s, 0.84, -1.18], rx: 0.155, rz: 0.175 }, // gaskin, the drive muscle
        { p: [0.48 * s, 0.58, -1.02], rx: 0.078, rz: 0.088 }, // hock, bone and tendon
        { p: [0.49 * s, 0.32, -1.02], rx: 0.058, rz: 0.066 }, // cannon
        { p: [0.49 * s, 0.20, -1.04], rx: 0.092, rz: 0.100 }, // fetlock
        { p: [0.49 * s, 0.15, -1.05], rx: 0.080, rz: 0.088 }, // pastern
      ],
      steps: 22, seg: 12, ref: [0, 0, 1], capStart: 0.5, capEnd: false,
      shape: (th, u) => {
        const back = -Math.cos(th);
        return 1 + Math.max(0, back) * 0.28 * Math.exp(-Math.pow((u - 0.14) / 0.22, 2));
      },
      // black points below the knee and a pale inner face, so four legs read as
      // four legs instead of as one dark mass under the body
      colorAt: (th, u) => {
        const inner = clamp01(Math.sin(th) * s * -1) * clamp01((0.45 - u) / 0.4);
        return mix(mix(HIDE, BELLY, inner * 0.4), HIDE_DARK, clamp01((u - 0.52) / 0.28) * 0.95);
      },
      matAt: () => M_HIDE,
    });
    P.push({ geo: B.build(), bind: ['chain', [`bhp${n}`, `bkn${n}`, `bhk${n}`, `bhf${n}`]] });
    reset(B);

    B.group(7);
    hoof(B, 0.49 * s, 0.13, -1.02);
    emit(['bone', `bhf${n}`]);
  }

  /* ------------------------------------------------------------- tail -- */
  B.group(8);
  sweep(B, {
    nodes: [
      { p: [0, 1.66, -1.40], rx: 0.10 },
      { p: [0, 1.44, -1.56], rx: 0.075 },
      { p: [0, 1.16, -1.66], rx: 0.055 },
      { p: [0, 0.98, -1.70], rx: 0.028 },
    ],
    steps: 12, seg: 8, ref: [0, 1, 0], capStart: false, capEnd: 0.5,
    shape: (th, u) => 1 + smooth((u - 0.6) / 0.25) * (1 - smooth((u - 0.92) / 0.08)) * 1.5
      + Math.sin(th * 8) * 0.12 * smooth((u - 0.6) / 0.3),
    colorAt: (th, u) => mix(HIDE_DARK, SHAG_DARK, clamp01((u - 0.5) / 0.4)),
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
    normalMap: organicNormal(), normalScale: 0.85, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 3.4, coat: { mottle: 0.14, tick: 0.18, shade: 0.18, dust: 0.30, dustTop: 0.55 } });
}

/** A cloven hoof: two keratin toes with a dewclaw behind. */
function hoof(B, x, y, z) {
  const s = Math.sign(x) || 1;
  for (const i of [-1, 1]) {
    sweep(B, {
      nodes: [
        { p: [x + i * 0.055 * s, y + 0.05, z - 0.02], rx: 0.058, rz: 0.070 },
        { p: [x + i * 0.058 * s, y - 0.05, z + 0.03], rx: 0.052, rz: 0.078 },
        { p: [x + i * 0.058 * s, y - 0.115, z + 0.09], rx: 0.036, rz: 0.050 },
      ],
      steps: 6, seg: 9, ref: [0, 1, 0], capStart: 0.4, capEnd: 0.4,
      colorAt: (th, u) => mix(HOOF, 0x4a4238, u * 0.4), matAt: () => M_HOOF,
    });
  }
  horn(B, {
    from: [x, y - 0.02, z - 0.13], dir: [0, -0.55, -0.84], len: 0.075,
    r0: 0.028, r1: 0.008, seg: 5, steps: 3, colorAt: () => col(HOOF), matAt: () => M_HOOF,
  });
}

function reset(B) {
  B.pos.length = 0; B.uv.length = 0; B.col.length = 0;
  B.emi.length = 0; B.mp.length = 0; B.grp.length = 0; B.idx.length = 0;
  B.glow(null);
}

const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function mix(a, b, t) {
  _c1.setHex(a, THREE.SRGBColorSpace);
  _c2.setHex(b, THREE.SRGBColorSpace);
  return _c1.lerp(_c2, clamp01(t));
}
function col(hex) { return _c1.setHex(hex, THREE.SRGBColorSpace); }

class DualhornEnemy extends QuadrupedEnemy {
  constructor(opts) { super(DUALHORN, opts); }

  telegraphScale() {
    // a charge paws the ground and coils low; a stomp rears instead
    if (this.attackId === 'charge') return 1.25;
    if (this.attackId === 'stomp') return -0.85;
    return 0.9;
  }

  leapScale() { return this.attackId === 'stomp' ? 1.0 : 0.25; }

  /**
   * The stomp rears — the only move in this animal's set that goes *up*, so
   * it gets its own wind-up rather than a scaled crouch. Negative
   * `telegraphScale` already inverts the body drop; this adds the forelegs
   * leaving the ground and the head going back, which is the readable part.
   */
  poseTelegraph(S, t) {
    super.poseTelegraph(S, t);
    if (this.attackId !== 'stomp') {
      if (this.attackId === 'charge') {
        // pawing: the near foreleg rakes the dirt while the body stays coiled
        const k = attackEnvelope('telegraph', this.stateTime, this._timingAll()).tension;
        const paw = Math.sin(this.stateTime * 9) * k;
        this.anim.solveLeg('fR', 0.30 * Math.max(0, paw), 0.22 * Math.max(0, paw), S,
          { kneeSign: 1, footPitch: -0.3 });
      }
      return;
    }
    const env = attackEnvelope('telegraph', this.stateTime, this._timingAll());
    const k = env.tension;
    const rear = smooth(k) * 1.0;
    this.stance(S, {
      front: { reach: -0.26 * rear, lift: 0.58 * rear, splay: 0.18 * rear },
      back: { reach: 0.12 * rear, lift: 0 },
    });
    this.spine(S, -0.50 * rear + env.shake, 0, 0);
    S('head', 0.34 * rear, 0, 0);
    S('jaw', 0.5 * k);
    this.visual.rotation.x -= 0.42 * rear;
    this.visual.position.y += 0.10 * rear;
  }

  poseAttack(S, t) {
    if (this.attackId !== 'stomp') { super.poseAttack(S, t); return; }
    // the drop: both forefeet come down together and the ground takes it
    const env = attackEnvelope(this.state === 'recover' ? 'recover' : 'attack', this.stateTime, this._timingAll());
    const k = env.k;
    const up = clamp01(-k);
    const down = clamp01(k);
    this.stance(S, {
      drop: 0.18 * down * (1 - env.f * 0.4),
      front: { reach: -0.26 * up + 0.25 * down, lift: 0.58 * up, splay: 0.18 * up },
      back: { reach: 0.12 * up - 0.08 * down },
    });
    this.spine(S, -0.50 * up + 0.30 * down, 0, 0);
    S('head', 0.34 * up - 0.30 * down, 0, 0);
    S('jaw', 0.7 * down);
    this.tail(t, -0.4 * down, 0.2, 5);
    this.visual.rotation.x += -0.42 * up + 0.12 * down;
    this.visual.position.y += 0.10 * up;
  }
}

DualhornEnemy.ANIM = {
  legs: {
    fL: ['fshL', 'felL', 'fknL', 'fhfL'], fR: ['fshR', 'felR', 'fknR', 'fhfR'],
    bL: ['bhpL', 'bknL', 'bhkL', 'bhfL'], bR: ['bhpR', 'bknR', 'bhkR', 'bhfR'],
  },
  trunk: ['hips', 'spine', 'chest', 'neck', 'head'],
  tails: ['tail1', 'tail2'],
  jawBone: 'jaw',
  heavy: true,
  strideLen: 2.3, stride: 0.52, lift: 0.24, splay: 0.02, bodyScale: 1.7,
  crouch: 0.22, crouchFront: 0.10, crouchBack: -0.18, crouchPitch: 0.14, headDown: 0.34,
  lunge: 0.34, lungeLift: 0.30, lungeLiftBack: 0, hop: 0.06,
  strikePitch: 0.16, headThrust: 0.42, jaw: 0.28, jawBite: 0.6,
  runNeck: 0.10, runHead: 0.16, flex: 0.5,
  bodyY: 1.88, bodyR: 0.74, deathRoll: 1.05, deathSlow: 1.6,
  tailRun: -0.25, tailIdle: 0.05,
  footPitchF: -0.05, footPitchB: 0.05,
};

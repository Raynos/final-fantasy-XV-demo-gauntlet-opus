import * as THREE from 'three';
import { Rig, creatureMaterial } from './RigBuilder.ts';
import type { Bind, BoneWriter, Part } from './RigBuilder.ts';
import { metalNormal, metalRoughness, weatherPlate } from './EnemyBase.ts';
import type { SpeciesDef, SpawnOpts } from './EnemyBase.ts';
import { BipedEnemy } from './Biped.ts';
import type { AttackEnvelope, BipedAnim } from './Biped.ts';
import { CBuilder, sweep, plate, horn, sculptBlob } from '../rig/Sculpt.ts';
import { clamp01, smooth } from '../rig/CreatureAnim.ts';

/* Niflheim issue: a dark blue-grey enamel over gunmetal, with the daemon
 * furnace showing through every seam as a hard orange-red.
 *
 * **These values are albedo, and they were charcoal.** The first pass authored
 * the shell at 0x2f353d, which is 3.6% linear reflectance — darker than fresh
 * asphalt. Measured over the whole roster, the imperial and construct species
 * all sat at 0.015-0.04 mean linear albedo while the ground they stand on is
 * 0.20-0.30, so every one of them rendered as a flat black cut-out with a glow
 * where its eyes are, day or night. Painted steel in daylight is 0.10-0.18;
 * the shell now sits at ~0.10 and the lit plate at ~0.19, which is still a
 * *dark* machine but one whose form the light can find.
 */
const SHELL = 0x59626e;
const SHELL_LIT = 0x7b8794;
const SHELL_DARK = 0x353b43;
const SCUFF = 0x8a7f70;           // paint scoured back to warm bare steel
const RUBBER = 0x26292e;
const PISTON = 0xa7acb4;
const BRASS = 0x8a7548;
const MAGITEK = 0xff2f12;
const EMBER = 0x3a0d05;

/* Roughness here multiplies `metalRoughness()`, which runs 0.40-0.82, so the
 * old M_ENAMEL of 0.34 produced an effective 0.14-0.28 — a wet-looking piano
 * gloss on a field machine. Weathered enamel wants 0.25-0.5 effective. */
const M_ENAMEL = [0.62, 0.26];   // painted plate: broad highlight, low metal
const M_GUN = [0.60, 0.88];      // bare gunmetal
const M_RUBBER = [0.95, 0.04];   // seals and boot soles
const M_PISTON = [0.28, 0.95];   // chromed rod
const M_SCUFF = [0.74, 0.62];    // worn edges where paint has gone

/**
 * Imperial MT — a magitek trooper.
 *
 * Not a person in armour: a daemon-fuelled automaton grown into a shell. The
 * read is a gaunt, forward-hunched armature — narrow waist, long thin piston
 * limbs, a heavy back-mounted reactor that drags the shoulders forward, and a
 * beaked helm with a single hot slit where a face should be. Every armour
 * plate is a shaped shell over a visible mechanical core, so light finds a
 * cavity edge everywhere instead of sliding off a box.
 */
export const MT_SOLDIER = {
  key: 'mt',
  questId: 'magitek_trooper',
  faction: 'imperial',
  expClass: 'normal',
  stats: {
    name: 'Imperial MT', hp: 640, poise: 34, speed: 3.2, attackRange: 9.5,
    aggroRange: 34, radius: 0.42, height: 1.95, damage: 74, level: 16,
  },
  weakness: 'lightning',
  resist: 'fire',
  senses: { sight: 34, fov: 1.3, hearing: 14 },
  drops: [
    { id: 'magitek_core', chance: 0.30, count: 1 },
    { id: 'rusted_bit', chance: 0.55, count: 1 },
  ],
  timing: { telegraph: 0.5, strike: 0.1, attack: 0.42, recover: 0.75 },
  attacks: [
    { id: 'volley', range: 16, minRange: 3.5, weight: 4, mult: 0.7, poise: 4, hitRadius: 1.0,
      ranged: true, telegraph: 0.55, strike: 0.12, attack: 0.5, recover: 0.8, cooldown: 1.6 },
    { id: 'bayonet', range: 2.6, weight: 2, mult: 1.2, poise: 14, hitRadius: 1.6,
      telegraph: 0.4, strike: 0.14, attack: 0.42, recover: 0.7, cooldown: 1.2 },
  ],
  buildPrototype,
  make(opts: SpawnOpts) { return new MTSoldierEnemy(opts); },
} satisfies SpeciesDef;

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('pelvis', 'root', [0, 0.94, -0.02]);
  rig.bone('spine', 'pelvis', [0, 1.15, -0.03]);
  rig.bone('chest', 'spine', [0, 1.40, -0.02]);
  rig.bone('neck', 'chest', [0, 1.60, 0.0]);
  rig.bone('head', 'neck', [0, 1.71, 0.01]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`sh${n}`, 'chest', [0.225 * s, 1.535, -0.01]);
    rig.bone(`el${n}`, `sh${n}`, [0.285 * s, 1.20, 0.015]);
    rig.bone(`hd${n}`, `el${n}`, [0.295 * s, 0.90, 0.085]);
    rig.bone(`hp${n}`, 'pelvis', [0.125 * s, 0.90, -0.01]);
    rig.bone(`kn${n}`, `hp${n}`, [0.135 * s, 0.505, 0.035]);
    rig.bone(`ft${n}`, `kn${n}`, [0.138 * s, 0.095, -0.02]);
  }

  const B = new CBuilder();
  const P: Part[] = [];
  const emit = (bind: Bind, wear = 1) => { P.push({ geo: weather(B.build(), wear), bind }); reset(B); };

  /* ------------------------------------------------------------ torso -- */
  B.group(1);
  // The core: a narrow, tapered ribcage shell. The section is a rounded
  // rectangle at the sternum and an ellipse at the waist, so the chest reads
  // as armour plate and the waist as a flexible joint.
  sweep(B, {
    nodes: [
      { p: [0, 0.90, -0.02], rx: 0.145, rz: 0.115 },
      { p: [0, 1.06, -0.035], rx: 0.118, rz: 0.098 },   // waist pinch
      { p: [0, 1.24, -0.03], rx: 0.165, rz: 0.128 },
      { p: [0, 1.42, -0.015], rx: 0.205, rz: 0.150 },   // chest
      { p: [0, 1.54, 0.0], rx: 0.185, rz: 0.132 },
      { p: [0, 1.60, 0.0], rx: 0.115, rz: 0.098 },
    ],
    steps: 22, seg: 16, ref: [0, 1, 0], capStart: 0.5, capEnd: 0.35,
    shape: (th, u) => {
      const front = Math.cos(th);                 // +1 chest, -1 back
      let m = 1;
      // squared-off chest plate with a soft chamfer, rounded back
      m += Math.max(0, front) * 0.10 * smooth((u - 0.42) / 0.25);
      // sternum keel
      m += Math.exp(-Math.pow((th - 0) / 0.42, 2)) * 0.055 * smooth((u - 0.40) / 0.3);
      // a horizontal seam between the abdominal segments
      m -= Math.exp(-Math.pow((u - 0.30) / 0.035, 2)) * 0.035;
      m -= Math.exp(-Math.pow((u - 0.52) / 0.030, 2)) * 0.028;
      return m;
    },
    colorAt: (th, u) => {
      const front = Math.cos(th);
      if (u < 0.34 && Math.abs(front) < 0.55) return col(RUBBER);       // waist bellows
      return col(front > 0.2 ? SHELL_LIT : SHELL, front > 0.2 ? 1 : 0.92);
    },
    matAt: (th, u) => (u < 0.34 && Math.abs(Math.cos(th)) < 0.55 ? M_RUBBER : M_ENAMEL),
  });
  // the furnace: an exposed core burning through the chest cavity
  B.glow(MAGITEK, 2.6);
  sculptBlob(B, {
    center: [0, 1.30, 0.115], scale: [0.055, 0.075, 0.035], segU: 12, segV: 8,
    colorAt: () => col(EMBER), matAt: () => [0.5, 0.1],
  });
  B.glow(null);
  // abdominal vent louvres
  for (let i = 0; i < 3; i++) {
    B.glow(MAGITEK, 1.5 - i * 0.25);
    plate(B, {
      size: [0.11, 0.014, 0.03], center: [0, 1.14 + i * 0.045, 0.115], power: 4,
      segU: 8, segV: 5, colorAt: () => col(EMBER), matAt: () => [0.55, 0.1],
    });
    B.glow(null);
  }
  emit(['chain', ['pelvis', 'spine', 'chest']]);

  /* --------------------------------------------------------- backpack -- */
  B.group(2);
  plate(B, {
    size: [0.30, 0.34, 0.17], center: [0, 1.40, -0.175], power: 6, segU: 16, segV: 12,
    colorAt: (u, v, p) => col(p.y > 1.5 ? SHELL_LIT : SHELL_DARK),
    matAt: () => M_ENAMEL,
  });
  // reactor stacks: two vertical cylinders venting hot
  for (const s of [-1, 1]) {
    sweep(B, {
      nodes: [
        { p: [0.10 * s, 1.28, -0.235], rx: 0.045 },
        { p: [0.10 * s, 1.52, -0.235], rx: 0.042 },
        { p: [0.10 * s, 1.62, -0.225], rx: 0.030 },
      ],
      steps: 8, seg: 10, ref: [0, 1, 0], capStart: 0.4, capEnd: 0.2,
      colorAt: (th, u) => col(u > 0.82 ? BRASS : SHELL_DARK),
      matAt: (th, u) => (u > 0.82 ? M_SCUFF : M_GUN),
    });
    B.glow(MAGITEK, 2.2);
    sculptBlob(B, {
      center: [0.10 * s, 1.645, -0.222], scale: [0.026, 0.012, 0.026], segU: 9, segV: 5,
      colorAt: () => col(EMBER), matAt: () => [0.4, 0.1],
    });
    B.glow(null);
  }
  emit(['bone', 'chest']);

  /* -------------------------------------------------------------- hip -- */
  B.group(3);
  plate(B, {
    size: [0.28, 0.13, 0.20], center: [0, 0.925, -0.01], power: 5, segU: 14, segV: 9,
    colorAt: () => col(SHELL_DARK), matAt: () => M_ENAMEL,
  });
  // tassets — angular skirt plates that widen the hip and break the leg line
  for (const s of [-1, 1]) {
    for (const [zc, w, rot] of [[0.115, 0.13, 0.22], [-0.13, 0.14, -0.20]]) {
      plate(B, {
        size: [w, 0.20, 0.042], center: [0.115 * s, 0.845, zc], power: 7,
        rot: [rot, 0, -0.22 * s], segU: 8, segV: 7,
        colorAt: (u, v, p) => col(SHELL, p.y > 0.85 ? 1 : 0.8), matAt: () => M_ENAMEL,
      });
    }
  }
  emit(['bone', 'pelvis']);

  /* ------------------------------------------------------------- head -- */
  B.group(4);
  // A beaked helm: a smooth dome pulled forward into a muzzle, a hard brow
  // shelf, and a slit that is the only feature. Nothing about it is a face.
  sculptBlob(B, {
    center: [0, 1.755, 0.005], scale: [0.088, 0.105, 0.098], segU: 22, segV: 16,
    brushes: [
      { p: [0, 1.80, -0.05], r: [0.11, 0.09, 0.09], amt: 0.020, dir: [0, 0.4, -1] },   // occiput
      { p: [0, 1.79, 0.075], r: [0.11, 0.045, 0.07], amt: 0.026, dir: [0, 0.35, 1] },  // brow shelf
      { p: [0, 1.715, 0.10], r: [0.075, 0.075, 0.09], amt: 0.030, dir: [0, -0.25, 1] }, // beak
      { p: [0, 1.745, 0.078], r: [0.10, 0.020, 0.05], amt: -0.028, dir: 'normal' },     // slit recess
      { p: [0.072, 1.755, 0.02], r: [0.05, 0.09, 0.09], amt: -0.014, dir: 'normal', mirror: true },
      { p: [0, 1.665, 0.0], r: [0.09, 0.05, 0.10], amt: -0.020, dir: [0, 1, 0] },       // jaw undercut
    ],
    // Three values, not one: a light dome, the shell over the cheeks, and a
    // dark muzzle. A single colour over a smooth blob is exactly what made the
    // helm read as an egg with a light in it.
    colorAt: (u, v, p) => (p.z > 0.075 && p.y < 1.775
      ? col(SHELL_DARK)
      : col(p.y > 1.795 ? SHELL_LIT : SHELL, p.y > 1.795 ? 1 : 0.95)),
    matAt: (u, v, p) => (p.z > 0.075 && p.y < 1.775 ? M_GUN : M_ENAMEL),
  });
  // the visor slit
  B.glow(MAGITEK, 4.6);
  plate(B, {
    size: [0.135, 0.020, 0.030], center: [0, 1.7465, 0.093], power: 4, segU: 12, segV: 6,
    colorAt: () => col(EMBER), matAt: () => [0.35, 0.1],
  });
  B.glow(null);
  // crest fin and the two intake horns that give the helm its silhouette
  plate(B, {
    size: [0.022, 0.075, 0.19], center: [0, 1.845, -0.005], power: 8, segU: 6, segV: 8,
    colorAt: () => col(SHELL_DARK), matAt: () => M_SCUFF,
  });
  for (const s of [-1, 1]) {
    horn(B, {
      from: [0.075 * s, 1.775, -0.045], dir: [0.32 * s, 0.55, -0.77], len: 0.115,
      r0: 0.024, r1: 0.006, seg: 6, steps: 4, colorAt: () => col(SHELL_DARK), matAt: () => M_SCUFF,
    });
  }
  // throat bellows, so the head does not float on nothing
  sweep(B, {
    nodes: [{ p: [0, 1.60, -0.005], rx: 0.052 }, { p: [0, 1.665, 0.0], rx: 0.047 }],
    steps: 4, seg: 10, ref: [0, 1, 0], capStart: false, capEnd: false,
    shape: (th, u) => 1 + Math.sin(u * 12) * 0.10,
    colorAt: () => col(RUBBER), matAt: () => M_RUBBER,
  });
  emit(['bone', 'head'], 0.85);

  /* ------------------------------------------------------------- arms -- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    B.group(5);
    // pauldron: a wide clamshell that reads from any angle
    plate(B, {
      size: [0.155, 0.135, 0.20], center: [0.235 * s, 1.555, -0.005], power: 4,
      rot: [0, 0, -0.30 * s], segU: 12, segV: 9,
      colorAt: (u, v, p) => col(p.y > 1.57 ? SHELL_LIT : SHELL_DARK), matAt: () => M_ENAMEL,
    });
    emit(['bone', 'chest']);

    B.group(6);
    // upper arm: an exposed piston with a plate strapped over the outside
    sweep(B, {
      nodes: [
        { p: [0.228 * s, 1.52, -0.01], rx: 0.062, rz: 0.058 },
        { p: [0.262 * s, 1.34, 0.0], rx: 0.040, rz: 0.038 },
        { p: [0.285 * s, 1.21, 0.012], rx: 0.048, rz: 0.046 },
      ],
      steps: 10, seg: 10, ref: [0, 1, 0], capStart: 0.4, capEnd: 0.4,
      colorAt: (th, u) => col(u > 0.2 && u < 0.75 ? PISTON : SHELL_DARK),
      matAt: (th, u) => (u > 0.2 && u < 0.75 ? M_PISTON : M_GUN),
    });
    plate(B, {
      size: [0.055, 0.20, 0.115], center: [0.272 * s, 1.375, -0.005], power: 6,
      rot: [0.08, 0, -0.10 * s], segU: 7, segV: 8,
      colorAt: () => col(SHELL), matAt: () => M_ENAMEL,
    });
    emit(['chain', [`sh${n}`, `el${n}`, `hd${n}`]]);

    B.group(7);
    // forearm: tapered vambrace over a thin core, ending in a clamp hand
    sweep(B, {
      nodes: [
        { p: [0.288 * s, 1.19, 0.02], rx: 0.052, rz: 0.050 },
        { p: [0.293 * s, 1.04, 0.055], rx: 0.042, rz: 0.040 },
        { p: [0.295 * s, 0.925, 0.078], rx: 0.034, rz: 0.032 },
      ],
      steps: 9, seg: 9, ref: [0, 1, 0], capStart: 0.4, capEnd: 0.3,
      shape: (th) => 1 + Math.max(0, -Math.cos(th)) * 0.22,
      colorAt: (th, u) => col(u < 0.6 ? SHELL : SHELL_DARK), matAt: () => M_ENAMEL,
    });
    B.glow(MAGITEK, 1.4);
    plate(B, {
      size: [0.012, 0.075, 0.020], center: [(0.295 + 0.040) * s, 1.10, 0.045], power: 5, segU: 6, segV: 5,
      colorAt: () => col(EMBER), matAt: () => [0.5, 0.1],
    });
    B.glow(null);
    emit(['chain', [`el${n}`, `hd${n}`]]);

    B.group(8);
    // hand: three blunt digits and an opposed thumb
    plate(B, {
      size: [0.058, 0.085, 0.062], center: [0.295 * s, 0.878, 0.085], power: 5, segU: 8, segV: 7,
      colorAt: () => col(SHELL_DARK), matAt: () => M_GUN,
    });
    for (let i = -1; i <= 1; i++) {
      plate(B, {
        size: [0.017, 0.062, 0.024], center: [(0.295 + i * 0.019) * s, 0.822, 0.098],
        power: 6, rot: [0.30, 0, 0], segU: 5, segV: 5,
        colorAt: () => col(RUBBER), matAt: () => M_RUBBER,
      });
    }
    plate(B, {
      size: [0.020, 0.052, 0.022], center: [(0.295 - 0.030 * s) * s, 0.845, 0.055],
      power: 6, rot: [0.1, 0, 0.5 * s], segU: 5, segV: 5,
      colorAt: () => col(RUBBER), matAt: () => M_RUBBER,
    });
    emit(['bone', `hd${n}`]);
  }

  /* ---------------------------------------------------- magitek rifle -- */
  B.group(9);
  const gz = 0.085, gy = 0.878, gx = 0.295;
  // receiver
  plate(B, {
    size: [0.052, 0.088, 0.34], center: [gx, gy + 0.03, gz + 0.10], power: 6, segU: 10, segV: 8,
    colorAt: (u, v, p) => col(p.y > gy + 0.045 ? SHELL : SHELL_DARK), matAt: () => M_GUN,
  });
  // barrel shroud with cooling ribs
  sweep(B, {
    nodes: [
      { p: [gx, gy + 0.045, gz + 0.24], rx: 0.028 },
      { p: [gx, gy + 0.048, gz + 0.46], rx: 0.024 },
      { p: [gx, gy + 0.050, gz + 0.60], rx: 0.019 },
    ],
    steps: 14, seg: 9, ref: [0, 1, 0], capStart: false, capEnd: 0.3,
    shape: (th, u) => 1 + Math.max(0, Math.sin(u * 42)) * 0.20,
    colorAt: (th, u) => col(u > 0.55 ? SCUFF : SHELL, u > 0.55 ? 0.72 : 1), matAt: () => M_GUN,
  });
  // magitek rail: the glowing charge line down the top of the weapon
  B.glow(MAGITEK, 2.2);
  plate(B, {
    size: [0.014, 0.012, 0.30], center: [gx, gy + 0.078, gz + 0.18], power: 5, segU: 6, segV: 5,
    colorAt: () => col(EMBER), matAt: () => [0.45, 0.1],
  });
  B.glow(null);
  // underslung bayonet — the reason it can be dangerous up close
  horn(B, {
    from: [gx, gy + 0.015, gz + 0.50], dir: [0, 0.06, 1], len: 0.30,
    r0: 0.020, r1: 0.002, flat: 0.30, seg: 6, steps: 5,
    colorAt: () => col(PISTON), matAt: () => [0.22, 0.9],
  });
  // stock / grip
  plate(B, {
    size: [0.040, 0.115, 0.075], center: [gx, gy - 0.045, gz + 0.01], power: 6,
    rot: [-0.35, 0, 0], segU: 7, segV: 6, colorAt: () => col(RUBBER), matAt: () => M_RUBBER,
  });
  emit(['bone', 'hdR']);

  /* ------------------------------------------------------------- legs -- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    B.group(10);
    // thigh: armoured on the outside, piston on the inside
    sweep(B, {
      nodes: [
        { p: [0.128 * s, 0.905, -0.005], rx: 0.082, rz: 0.088 },
        { p: [0.132 * s, 0.72, 0.012], rx: 0.062, rz: 0.070 },
        { p: [0.135 * s, 0.545, 0.030], rx: 0.055, rz: 0.058 },
      ],
      steps: 11, seg: 11, ref: [0, 1, 0], capStart: 0.4, capEnd: false,
      shape: (th, u) => 1 + Math.max(0, Math.sin(th) * s) * 0.20 * (1 - u * 0.5),
      colorAt: (th, u) => col(Math.sin(th) * s > 0.25 ? SHELL : SHELL_DARK),
      matAt: (th) => (Math.sin(th) * s > 0.25 ? M_ENAMEL : M_GUN),
    });
    // knee cop
    plate(B, {
      size: [0.10, 0.095, 0.095], center: [0.136 * s, 0.505, 0.055], power: 5, segU: 9, segV: 7,
      colorAt: () => col(SHELL_LIT), matAt: () => M_SCUFF,
    });
    // shin: a narrow greave over a bare rod, the machine's thinnest point
    sweep(B, {
      nodes: [
        { p: [0.136 * s, 0.48, 0.030], rx: 0.050, rz: 0.052 },
        { p: [0.137 * s, 0.30, 0.005], rx: 0.036, rz: 0.040 },
        { p: [0.138 * s, 0.135, -0.012], rx: 0.042, rz: 0.045 },
      ],
      steps: 10, seg: 10, ref: [0, 1, 0], capStart: false, capEnd: 0.3,
      shape: (th, u) => 1 + Math.max(0, Math.cos(th)) * 0.28 * (1 - Math.abs(u - 0.35) * 1.4),
      colorAt: (th, u) => col(u > 0.25 && u < 0.7 && Math.cos(th) < 0 ? PISTON : SHELL),
      matAt: (th, u) => (u > 0.25 && u < 0.7 && Math.cos(th) < 0 ? M_PISTON : M_ENAMEL),
    });
    emit(['chain', [`hp${n}`, `kn${n}`, `ft${n}`]]);

    B.group(11);
    // foot: a splayed three-point pad, not a shoe
    plate(B, {
      size: [0.105, 0.075, 0.24], center: [0.138 * s, 0.055, 0.045], power: 5, segU: 10, segV: 7,
      colorAt: (u, v, p) => col(p.y < 0.04 ? RUBBER : SHELL_DARK),
      matAt: (u, v, p) => (p.y < 0.04 ? M_RUBBER : M_ENAMEL),
    });
    horn(B, {
      from: [0.138 * s, 0.05, -0.075], dir: [0, -0.1, -1], len: 0.075,
      r0: 0.030, r1: 0.008, seg: 5, steps: 3, colorAt: () => col(SHELL_DARK), matAt: () => M_GUN,
    });
    for (let i = -1; i <= 1; i++) {
      horn(B, {
        from: [(0.138 + i * 0.030) * s, 0.030, 0.145], dir: [i * 0.25, -0.12, 1], len: 0.055,
        r0: 0.017, r1: 0.004, seg: 5, steps: 3, colorAt: () => col(RUBBER), matAt: () => M_RUBBER,
      });
    }
    emit(['bone', `ft${n}`], 0.45);
  }

  for (const p of P) {
    if (p.bind[0] === 'chain') rig.attachChain(p.geo, p.bind[1], 0.9);
    else rig.attach(p.geo, p.bind[1]);
  }

  const mat = creatureMaterial({
    roughness: 0.42, metalness: 0.40,
    normalMap: metalNormal(), normalScale: 0.72, roughnessMap: metalRoughness(),
  });
  return rig.build(mat, { radius: 2.2 });
}

function reset(B: CBuilder) {
  B.pos.length = 0; B.uv.length = 0; B.col.length = 0;
  B.emi.length = 0; B.mp.length = 0; B.grp.length = 0; B.idx.length = 0;
  B.glow(null);
}

const _c = new THREE.Color();
function col(hex: number, k = 1) {
  _c.setHex(hex, THREE.SRGBColorSpace);
  if (k !== 1) _c.multiplyScalar(k);
  return _c;
}

/** Field wear; see `EnemyBase.weatherPlate`. */
function weather(geo: THREE.BufferGeometry, amount = 1) {
  return weatherPlate(geo, { scuff: SCUFF, amount });
}

class MTSoldierEnemy extends BipedEnemy {
  /** Tuning block, assigned below the class body. Read through `this.A`. */
  static override ANIM: BipedAnim;
  recoil!: number;
  constructor(opts: SpawnOpts) { super(MT_SOLDIER, opts); }

  /** Muzzle in world space — the beam origin for `volley`. */
  muzzle(out: THREE.Vector3) {
    const b = this.rig && this.rig.byName.get('hdR');
    if (!b) return out.copy(this.centre());
    return out.set(0, 0.10, 0.69).applyMatrix4(b.matrixWorld);
  }

  /**
   * The MT marches. It does not walk — the legs come up too high, the torso
   * never counter-rotates, and the whole thing lands flat-footed. That
   * stiffness is the point: it is the one enemy in the game that is obviously
   * not alive, and the gait has to say so before the model does.
   */
  override poseArms(S: BoneWriter, t: number, swing: number, norm: number) {
    // Port arms. The weapon hangs off the right hand pointing along the hand's
    // local +Z, so the muzzle angle is just the *sum* of the shoulder and
    // elbow pitches — bending the elbow the same way as the shoulder points
    // the gun at the sky, which is the one thing a soldier never does.
    const sway = swing * 0.22;
    this.arm(S, 'R', [-1.02 + sway, -0.26, -0.30], [0.40, 0, 0], [0, 0, 0]);
    this.arm(S, 'L', [-1.14 - sway, 0.56, 0.30], [0.30, 0, 0], [0, 0, 0]);
  }

  /**
   * Rifle up to the visor. Shoulder and elbow pitches cancel so the barrel
   * comes out level however far into the pose we are; `kick` rocks it back.
   */
  aim(S: BoneWriter, k: number, kick = 0) {
    const sh = -1.22 * k - 1.02 * (1 - k);
    const el = 1.18 * k + 0.40 * (1 - k);
    this.arm(S, 'R', [sh + kick * 0.14, -0.20 * k - 0.26 * (1 - k), -0.12 * k - 0.30 * (1 - k)],
      [el - kick * 0.20, 0, 0], [0, 0.08 * k, 0]);
    this.arm(S, 'L', [-1.16 * k - 1.14 * (1 - k) + kick * 0.10, 0.62, 0.32],
      [1.02 * k + 0.30 * (1 - k) - kick * 0.16, 0, 0], [0, 0, 0]);
  }

  override poseWindUp(S: BoneWriter, t: number, k: number, env: AttackEnvelope) {
    const bayonet = this.attackId === 'bayonet';
    if (bayonet) {
      // shoulder the weapon back and drop into a lunge stance
      this.stance(S, { drop: 0.075 * k, L: { reach: -0.16 * k }, R: { reach: 0.14 * k } });
      this.spine(S, -0.29 * k + env.shake, -1.01 * k, 0);
      this.arm(S, 'R', [-1.02 - 0.30 * k, -0.26 - 0.80 * k, -0.30], [0.40 + 0.55 * k, 0, 0], [0, 0, 0]);
      this.arm(S, 'L', [-1.14 - 0.20 * k, 0.56 + 0.28 * k, 0.30], [0.30 + 0.50 * k, 0, 0], [0, 0, 0]);
      return;
    }
    // volley: plant, square the shoulders, bring the rifle up to the visor.
    // The gun rising to eye line *is* the telegraph — it is the same read at
    // 30 m as at 3 m, which is what a ranged tell has to be.
    this.stance(S, { drop: 0.045 * k, L: { reach: -0.08 * k, splay: 0.10 * k }, R: { reach: 0.05 * k } });
    this.spine(S, -0.14 * k + env.shake * 0.5, -0.53 * k, 0);
    S('head', -0.10 * k, 0.14 * k, 0);
    this.aim(S, k);
  }

  override poseSwing(S: BoneWriter, t: number, k: number, env: AttackEnvelope) {
    const bayonet = this.attackId === 'bayonet';
    const kp = clamp01(k);
    if (bayonet) {
      // a straight-line thrust: the whole machine steps into it
      this.stance(S, { drop: 0.04 * kp, L: { reach: 0.30 * k }, R: { reach: -0.22 * k } });
      this.spine(S, 0.38 * k, 0.82 * k, 0);
      // the bayonet goes out level and stays level all the way through
      this.arm(S, 'R', [-1.02 - 0.34 * k, -0.26 + 0.44 * k, -0.30 + 0.14 * k], [0.40 + 0.42 * k, 0, 0], [0, 0, 0]);
      this.arm(S, 'L', [-1.14 - 0.22 * k, 0.56 - 0.30 * k, 0.30], [0.30 + 0.34 * k, 0, 0], [0, 0, 0]);
      this.visual.position.z += 0.10 * kp;
      return;
    }
    // volley: three-round recoil. Each shot kicks the shoulder and the torso
    // absorbs it — the body is what sells a gun going off, not the muzzle.
    const T = this._timing('attack');
    const shots = 3;
    let kick = 0;
    for (let i = 0; i < shots; i++) {
      const at = (i + 0.15) * (T / shots) * 0.85;
      const dt = this.stateTime - at;
      if (dt > 0) kick += Math.exp(-dt * 16) * Math.sin(Math.min(1, dt * 26) * Math.PI) * 1.0;
    }
    kick = Math.min(1.5, kick) * (this.state === 'recover' ? Math.max(0, 1 - this.stateTime * 2.2) : 1);
    this.stance(S, { drop: 0.045, L: { reach: -0.08, splay: 0.10 }, R: { reach: 0.05 } });
    this.spine(S, -0.14 - kick * 0.14, -0.53 + kick * 0.12, 0);
    S('head', -0.10, 0.14, 0);
    this.aim(S, 1, kick);
    this.visual.position.z -= kick * 0.022;
    this.recoil = kick;
  }

  /**
   * Magitek does not bleed out — it fails. The frame locks up mid-step, the
   * limbs go slack in a different order from a living body, and the whole
   * thing goes over rigid, like dropped furniture.
   */
  override poseDeath(S: BoneWriter, t: number) {
    const A = this.A;
    const T = this.stateTime;
    const seize = Math.exp(-T * 9) * Math.sin(T * 60) * 0.10;      // the last spasm
    const slack = smooth(clamp01((T - 0.10) / 0.22));
    const topple = smooth(clamp01((T - 0.22) / 0.50));
    const fwd = (this.deathPush ?? 1) >= 0 ? -1 : 1;
    const side = this.deathSide || 1;
    const sink = A.hipY - A.bodyR;
    this.stance(S, {
      L: { reach: 0.12 * slack - 0.14 * topple, lift: sink * slack * 0.9, splay: 0.24 * topple },
      R: { reach: -0.14 * slack + 0.10 * topple, lift: sink * slack * 0.9, splay: 0.20 * topple },
    });
    this.spine(S, (0.67 * slack + seize) * -fwd, 0.43 * topple * side, 0.34 * topple * side);
    S('head', 0.55 * slack * -fwd, 0.3 * topple * side, 0);
    this.arm(S, 'L', [1.35 * slack * -fwd, 0.45 * topple, 0.75 * topple], [-0.55 * slack, 0, 0], null);
    this.arm(S, 'R', [1.35 * slack * -fwd, -0.45 * topple, -0.75 * topple], [-0.55 * slack, 0, 0], null);
    const th = topple * 1.48 * fwd;
    const centre = A.hipY - sink * slack;
    this.visual.rotation.x += th;
    this.visual.rotation.z += topple * 0.22 * side;
    this.visual.position.y += centre - A.hipY * Math.cos(th);
    this.visual.position.z -= A.hipY * Math.sin(th) * 0.65;
  }
}

MTSoldierEnemy.ANIM = {
  legs: { L: ['hpL', 'knL', 'ftL'], R: ['hpR', 'knR', 'ftR'] },
  arms: { L: ['shL', 'elL', 'hdL'], R: ['shR', 'elR', 'hdR'] },
  trunk: ['pelvis', 'spine', 'chest', 'neck', 'head'],
  strideLen: 1.35, stride: 0.30, lift: 0.16, duty: 0.60,
  hipY: 0.94, bodyR: 0.30, hipSway: 0.030, bob: 0.030, lean: 0.10,
  armSwing: 0.42, torsoTwist: 0.06, elbow: 0.5, armOut: 0.12,
  marchStiff: 1, crouch: 0.06, step: 0.14, windTwist: 0.35,
  footPitch: 0.02, idleLean: 0.05, breath: 0.9,
};

export { MTSoldierEnemy };

import * as THREE from 'three';
import { Rig, poseBone, poseBoneMix, creatureMaterial } from './RigBuilder.js';
import { Enemy, metalNormal, metalRoughness } from './EnemyBase.js';
import { legPhase } from '../rig/CreatureAnim.js';
import {
  tube, blob, slab, spike, place, tint, glow, rectCross, loft, circleCross,
} from '../../combat/GeoKit.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

const PLATE = 0x33383f;
const PLATE_DARK = 0x191c21;
const JOINT = 0x14161a;
const TRIM = 0x555b63;
const MAGITEK = 0xff2f12;

/**
 * Magitek Armour (MA-X Cuirass class) — the imperial walker, and the only
 * thing on the field that is honestly a *machine*.
 *
 * Six metres of straight lines: a boxy armoured cockpit pod slung between two
 * enormous reverse-jointed bird legs, a slab shield plate hinged over the
 * cockpit face with one wide red visor slit, a clustered missile pod on the
 * left arm and a rotary cannon on the right, thruster nozzles across the back
 * and naked hydraulic pistons at every joint. It should dwarf everything
 * around it and read as riveted panels against the bestiary's fur and hide.
 *
 * Fights in three phases: intact, one arm blown off, then venting and
 * enraged — the last of which cracks the cockpit shield open and gives the
 * player the only window worth taking.
 */
export const MAGITEK_ARMOUR = {
  key: 'magitek_armour',
  questId: 'magitek_armour',
  faction: 'imperial',
  expClass: 'boss',
  boss: true,
  superArmour: true,
  stats: {
    name: 'Magitek Armour', hp: 32000, poise: 400, speed: 2.4, attackRange: 6.0,
    aggroRange: 60, radius: 2.0, height: 6.0, damage: 460, level: 30,
  },
  weakness: 'lightning',
  resist: 'fire',
  resistPct: { lightning: 180, fire: 70, ice: 100, dark: 100, light: 100 },
  weakTo: ['greatsword'],
  senses: { sight: 62, fov: 1.5, hearing: 34 },
  staggerDuration: 4.0,
  drops: [
    { id: 'magitek_core', chance: 1.0, count: 1 },
    { id: 'magitek_booster', chance: 0.75, count: 2 },
    { id: 'debased_coin', chance: 0.5, count: 1 },
  ],
  timing: { telegraph: 1.2, strike: 0.34, attack: 1.1, recover: 1.6 },
  attacks: [
    {
      id: 'stomp', phase: 0, range: 6.5, weight: 3, mult: 1.0, poise: 90, hitRadius: 4.5,
      aoe: true, telegraph: 1.1, strike: 0.36, attack: 1.05, recover: 1.4, cooldown: 2.8,
    },
    {
      id: 'sweep', phase: 0, range: 7.5, weight: 3, mult: 1.15, poise: 110, hitRadius: 5.0,
      arc: 1.8, telegraph: 1.0, strike: 0.32, attack: 1.0, recover: 1.5, cooldown: 3.2,
    },
    {
      id: 'missiles', phase: 0, range: 40, minRange: 10, weight: 2, mult: 0.85, poise: 70,
      hitRadius: 3.6, ranged: true, aoe: true, telegraph: 1.6, strike: 0.28, attack: 1.25,
      recover: 1.7, cooldown: 7.0, tracking: 1.0,
    },
    {
      id: 'cannon', phase: 1, range: 30, minRange: 6, weight: 3, mult: 0.55, poise: 40,
      hitRadius: 2.2, ranged: true, telegraph: 1.2, strike: 0.30, attack: 1.7,
      recover: 1.3, cooldown: 5.0, tracking: 1.6,
    },
    {
      id: 'overload', phase: 2, range: 9.0, weight: 2, mult: 2.2, poise: 170, hitRadius: 8,
      aoe: true, element: 'fire', telegraph: 2.2, strike: 0.42, attack: 1.5, recover: 2.4,
      cooldown: 13.0, unblockable: true,
    },
  ],
  buildPrototype,
  make(opts) { return new MagitekArmourEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('core', 'root', [0, 3.30, 0]);        // hip chassis, between the legs
  rig.bone('pod', 'core', [0, 4.25, 0]);         // cockpit
  rig.bone('visor', 'pod', [0, 4.98, 0.70]);     // hinge of the face shield
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    // reverse-jointed leg: knee forward, hock back, foot forward again
    rig.bone(`hp${n}`, 'core', [0.95 * s, 3.30, 0]);
    rig.bone(`kn${n}`, `hp${n}`, [1.05 * s, 2.25, 0.75]);
    rig.bone(`an${n}`, `kn${n}`, [1.05 * s, 1.05, -0.55]);
    rig.bone(`ft${n}`, `an${n}`, [1.05 * s, 0.32, 0.05]);
    rig.bone(`to${n}`, `ft${n}`, [1.05 * s, 0.14, 0.62]);
    // weapon arm: shoulder yoke, boom, weapon head
    rig.bone(`sh${n}`, 'pod', [1.45 * s, 4.55, 0]);
    rig.bone(`am${n}`, `sh${n}`, [2.00 * s, 4.15, 0.02]);
    rig.bone(`wp${n}`, `am${n}`, [2.30 * s, 3.78, 0.18]);
  }

  /* --- hip chassis: the block the whole machine hangs from --- */
  const chassis = place(slab(2.05, 0.95, 1.55, 0.10), { pos: [0, 3.28, 0] });
  rig.attach(tint(chassis, PLATE, 0.03), 'core');
  const chassisBelt = place(slab(2.20, 0.24, 1.65, 0.06), { pos: [0, 2.92, 0] });
  rig.attach(tint(chassisBelt, PLATE_DARK), 'core');
  const chassisSpine = place(slab(0.55, 0.80, 1.70, 0.06), { pos: [0, 3.40, -0.10] });
  rig.attach(tint(chassisSpine, PLATE_DARK, 0.03), 'core');
  for (let i = 0; i < 4; i++) {
    const panel = place(slab(1.85, 0.05, 0.08, 0.015), { pos: [0, 3.05 + i * 0.22, 0.79] });
    rig.attach(tint(panel, JOINT), 'core');
  }
  const sump = place(slab(1.20, 0.22, 0.90, 0.05), { pos: [0, 2.78, 0.05] });
  rig.attach(glow(tint(sump, 0x2a0a04), MAGITEK, 1.2), 'core');
  for (const s of [-1, 1]) {
    const flank = place(slab(0.14, 0.70, 1.20, 0.04), { pos: [1.06 * s, 3.30, -0.05] });
    rig.attach(tint(flank, PLATE_DARK, 0.03), 'core');
    for (let i = -1; i <= 1; i++) {
      const bolt = place(blob(0.055, 0.055, 0.055, 5, 4), { pos: [1.14 * s, 3.30, i * 0.42] });
      rig.attach(tint(bolt, TRIM), 'core');
    }
  }

  /* --- cockpit pod: boxy, panelled, no curves anywhere --- */
  const podBody = loft(rectCross(0.16, 12), [
    { y: 3.62, sx: 0.86, sz: 0.74 },
    { y: 4.02, sx: 1.06, sz: 0.90 },
    { y: 4.74, sx: 1.06, sz: 0.90 },
    { y: 5.22, sx: 0.82, sz: 0.72 },
  ]);
  rig.attach(tint(podBody, PLATE, 0.03), 'pod');
  const hatch = place(slab(1.00, 0.16, 1.00, 0.05), { pos: [0, 5.28, -0.06] });
  rig.attach(tint(hatch, PLATE_DARK, 0.03), 'pod');
  const brow = place(slab(1.90, 0.24, 0.62, 0.06), { pos: [0, 5.02, 0.62], rot: [0.30, 0, 0] });
  rig.attach(tint(brow, PLATE_DARK, 0.03), 'pod');
  for (const s of [-1, 1]) {
    const cheek = place(slab(0.22, 1.00, 0.80, 0.05), { pos: [1.02 * s, 4.34, 0.52], rot: [0, 0, -0.08 * s] });
    rig.attach(tint(cheek, PLATE, 0.03), 'pod');
    const cheekTrim = place(slab(0.10, 0.90, 0.14, 0.02), { pos: [1.13 * s, 4.34, 0.86] });
    rig.attach(tint(cheekTrim, TRIM), 'pod');
  }
  for (let i = 0; i < 3; i++) {
    const seam = place(slab(1.90, 0.06, 0.06, 0.015), { pos: [0, 4.12 + i * 0.30, -0.92] });
    rig.attach(tint(seam, JOINT), 'pod');
  }
  for (const s of [-1, 1]) {
    // radiator louvres down the pod flanks
    for (let i = 0; i < 4; i++) {
      const louvre = place(slab(0.10, 0.09, 0.52, 0.02), { pos: [1.10 * s, 4.02 + i * 0.20, -0.18], rot: [0.30, 0, 0] });
      rig.attach(glow(tint(louvre, 0x2a0a04), MAGITEK, 1.1), 'pod');
    }
    const aerial = place(loft(circleCross(5), [{ y: 0, sx: 0.035 }, { y: 0.60, sx: 0.018 }]),
      { pos: [0.72 * s, 5.20, -0.60], rot: [-0.22, 0, 0.30 * s] });
    rig.attach(tint(aerial, TRIM), 'pod');
  }
  // the reactor face, normally hidden behind the shield plate — the weak point
  const reactor = place(slab(0.90, 0.90, 0.10, 0.03), { pos: [0, 4.34, 0.90] });
  rig.attach(glow(tint(reactor, 0x420f05), MAGITEK, 2.4), 'pod');
  // sensor mast off the pod roof
  const mast = place(loft(circleCross(7), [{ y: 0, sx: 0.08 }, { y: 0.48, sx: 0.05 }]),
    { pos: [0.28, 5.34, -0.20] });
  rig.attach(tint(mast, TRIM), 'pod');
  const mastTip = place(blob(0.07, 0.07, 0.07, 7, 5), { pos: [0.28, 5.86, -0.20] });
  rig.attach(glow(tint(mastTip, 0x3a0d05), MAGITEK, 2.6), 'pod');

  // thruster nozzles: four flared cones across the back of the pod
  for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const y = 4.16 + i * 0.62;
      const noz = place(loft(circleCross(8), [
        { y: 0, sx: 0.20 }, { y: 0.26, sx: 0.24 }, { y: 0.42, sx: 0.30 },
      ]), { pos: [0.48 * s, y, -0.92], rot: [-Math.PI / 2, 0, 0] });
      rig.attach(tint(noz, PLATE_DARK, 0.03), 'pod');
      const flame = place(loft(circleCross(8), [{ y: 0, sx: 0.20 }, { y: 0.10, sx: 0.20 }]),
        { pos: [0.48 * s, y, -0.98], rot: [-Math.PI / 2, 0, 0] });
      rig.attach(glow(tint(flame, 0x3a0d05), MAGITEK, 2.8), 'pod');
    }
  }

  /* --- the face shield: one slab, one wide slit --- */
  const shield = place(slab(1.86, 1.35, 0.26, 0.08), { pos: [0, 4.34, 1.00], rot: [0.06, 0, 0] });
  rig.attach(tint(shield, PLATE, 0.03), 'visor');
  const shieldRim = place(slab(1.98, 0.34, 0.14, 0.05), { pos: [0, 4.46, 1.10] });
  rig.attach(tint(shieldRim, JOINT), 'visor');
  const slit = place(slab(1.62, 0.17, 0.10, 0.035), { pos: [0, 4.46, 1.16] });
  rig.attach(glow(tint(slit, 0x420f05), MAGITEK, 5.2), 'visor');
  for (const s of [-1, 1]) {
    const bolt = place(slab(0.16, 0.90, 0.10, 0.03), { pos: [0.80 * s, 4.20, 1.14] });
    rig.attach(tint(bolt, TRIM), 'visor');
  }
  const jaw = place(slab(1.50, 0.26, 0.34, 0.05), { pos: [0, 3.74, 0.98], rot: [-0.22, 0, 0] });
  rig.attach(tint(jaw, PLATE_DARK, 0.03), 'visor');
  for (let i = -2; i <= 2; i++) {
    const rivet = place(blob(0.06, 0.06, 0.06, 5, 4), { pos: [i * 0.38, 4.94, 1.06] });
    rig.attach(tint(rivet, TRIM), 'visor');
    const rivet2 = place(blob(0.06, 0.06, 0.06, 5, 4), { pos: [i * 0.38, 3.76, 1.10] });
    rig.attach(tint(rivet2, TRIM), 'visor');
  }

  /* --- legs: reverse-jointed, clawed, pistons on show --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const hipBlock = place(slab(0.72, 0.78, 0.82, 0.07), { pos: [1.00 * s, 3.28, 0] });
    rig.attach(tint(hipBlock, PLATE, 0.03), `hp${n}`);
    const hipHub = place(loft(circleCross(9), [{ y: 0, sx: 0.34 }, { y: 0.20, sx: 0.34 }]),
      { pos: [(1.34 * s), 3.28, 0], rot: [0, 0, Math.PI / 2] });
    rig.attach(tint(hipHub, JOINT), `hp${n}`);

    // femur: down and forward
    const femur = tube([P(0.98 * s, 3.24, 0), P(1.02 * s, 2.74, 0.38), P(1.05 * s, 2.28, 0.73)],
      [0.34, 0.30, 0.25], { radialSeg: 8 });
    rig.attachBlend(tint(femur, JOINT), `hp${n}`, `kn${n}`, 1.0);
    const femurP = place(slab(0.52, 1.20, 0.62, 0.07), { pos: [1.01 * s, 2.77, 0.37], rot: [-0.62, 0, 0] });
    rig.attach(tint(femurP, PLATE, 0.03), `hp${n}`);
    const femurPiston = tube([P(1.30 * s, 3.20, -0.10), P(1.24 * s, 2.55, 0.42)], [0.075, 0.055], { radialSeg: 6 });
    rig.attachBlend(tint(femurPiston, TRIM), `hp${n}`, `kn${n}`, 0.7);

    const kneeBlock = place(slab(0.58, 0.56, 0.58, 0.07), { pos: [1.05 * s, 2.25, 0.75] });
    rig.attach(tint(kneeBlock, PLATE_DARK, 0.03), `kn${n}`);
    const kneeCap = place(slab(0.30, 0.44, 0.20, 0.04), { pos: [1.05 * s, 2.22, 1.06] });
    rig.attach(tint(kneeCap, TRIM), `kn${n}`);

    // tibia: down and back — the reverse joint
    const tibia = tube([P(1.05 * s, 2.20, 0.70), P(1.05 * s, 1.62, 0.06), P(1.05 * s, 1.08, -0.52)],
      [0.26, 0.23, 0.19], { radialSeg: 8 });
    rig.attachBlend(tint(tibia, JOINT), `kn${n}`, `an${n}`, 1.0);
    const tibiaP = place(slab(0.44, 1.30, 0.50, 0.06), { pos: [1.05 * s, 1.64, 0.09], rot: [0.83, 0, 0] });
    rig.attach(tint(tibiaP, PLATE, 0.03), `kn${n}`);
    const tibiaPiston = tube([P(1.32 * s, 2.16, 0.62), P(1.30 * s, 1.32, -0.30)], [0.065, 0.05], { radialSeg: 6 });
    rig.attachBlend(tint(tibiaPiston, TRIM), `kn${n}`, `an${n}`, 0.7);

    const ankleBlock = place(slab(0.48, 0.46, 0.48, 0.06), { pos: [1.05 * s, 1.05, -0.55] });
    rig.attach(tint(ankleBlock, PLATE_DARK, 0.03), `an${n}`);
    const ankleHub = place(loft(circleCross(8), [{ y: 0, sx: 0.24 }, { y: 0.16, sx: 0.24 }]),
      { pos: [1.28 * s, 1.05, -0.55], rot: [0, 0, Math.PI / 2] });
    rig.attach(tint(ankleHub, TRIM), `an${n}`);
    const hockPlate = place(slab(0.40, 0.52, 0.16, 0.04), { pos: [1.05 * s, 1.10, -0.84] });
    rig.attach(tint(hockPlate, PLATE, 0.03), `an${n}`);

    // metatarsus: down and forward to the foot
    const meta = tube([P(1.05 * s, 1.00, -0.50), P(1.05 * s, 0.66, -0.22), P(1.05 * s, 0.36, 0.02)],
      [0.20, 0.18, 0.16], { radialSeg: 8 });
    rig.attachBlend(tint(meta, JOINT), `an${n}`, `ft${n}`, 1.0);
    const metaP = place(slab(0.36, 0.80, 0.40, 0.05), { pos: [1.05 * s, 0.68, -0.24], rot: [-0.69, 0, 0] });
    rig.attach(tint(metaP, PLATE, 0.03), `an${n}`);

    // foot: a broad clawed pad, the machine's whole contact with the world
    const foot = place(slab(0.66, 0.26, 0.90, 0.06), { pos: [1.05 * s, 0.24, 0.18] });
    rig.attach(tint(foot, PLATE_DARK, 0.03), `ft${n}`);
    const heel = place(spike(0.13, 0.44, 6), { pos: [1.05 * s, 0.20, -0.30], rot: [-1.35, 0, 0] });
    rig.attach(tint(heel, TRIM), `ft${n}`);
    const toePad = place(slab(0.62, 0.20, 0.44, 0.05), { pos: [1.05 * s, 0.16, 0.66] });
    rig.attach(tint(toePad, PLATE_DARK, 0.03), `to${n}`);
    for (let c = -1; c <= 1; c++) {
      const claw = place(spike(0.11, 0.46, 6), { pos: [(1.05 + c * 0.22) * s, 0.13, 0.86], rot: [1.42, 0, 0] });
      rig.attach(tint(claw, TRIM), `to${n}`);
    }
  }

  /* --- shoulder yokes and arm booms, shared by both weapon arms --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const yoke = place(slab(0.60, 0.72, 0.84, 0.07), { pos: [1.42 * s, 4.55, 0] });
    rig.attach(tint(yoke, PLATE, 0.03), `sh${n}`);
    const yokeHub = place(loft(circleCross(9), [{ y: 0, sx: 0.28 }, { y: 0.18, sx: 0.28 }]),
      { pos: [1.76 * s, 4.55, 0], rot: [0, 0, Math.PI / 2] });
    rig.attach(tint(yokeHub, JOINT), `sh${n}`);
    const yokeCap = place(slab(0.52, 0.22, 0.92, 0.05), { pos: [1.44 * s, 4.96, 0] });
    rig.attach(tint(yokeCap, PLATE_DARK, 0.03), `sh${n}`);
    const yokeTrim = place(slab(0.16, 0.60, 0.20, 0.03), { pos: [1.40 * s, 4.52, 0.46] });
    rig.attach(tint(yokeTrim, TRIM), `sh${n}`);
    const boom = tube([P(1.55 * s, 4.52, 0), P(1.80 * s, 4.34, 0.01), P(2.02 * s, 4.14, 0.02)],
      [0.22, 0.20, 0.18], { radialSeg: 8 });
    rig.attachBlend(tint(boom, JOINT), `sh${n}`, `am${n}`, 1.0);
    const boomP = place(slab(0.34, 0.46, 0.36, 0.05), { pos: [1.80 * s, 4.34, 0.01], rot: [0, 0, 0.68 * s] });
    rig.attach(tint(boomP, PLATE, 0.03), `sh${n}`);
    const stalk = tube([P(2.02 * s, 4.12, 0.02), P(2.20 * s, 3.94, 0.10), P(2.30 * s, 3.80, 0.17)],
      [0.18, 0.17, 0.16], { radialSeg: 8 });
    rig.attachBlend(tint(stalk, JOINT), `am${n}`, `wp${n}`, 1.0);
    const piston = tube([P(1.62 * s, 4.76, -0.14), P(2.06 * s, 4.28, -0.10)], [0.07, 0.055], { radialSeg: 6 });
    rig.attachBlend(tint(piston, TRIM), `sh${n}`, `am${n}`, 0.7);
  }

  /* --- left arm: the clustered missile pod --- */
  const podHousing = place(slab(0.86, 0.86, 1.20, 0.08), { pos: [-2.34, 3.72, 0.14] });
  rig.attach(tint(podHousing, PLATE, 0.03), 'wpL');
  const podFace = place(slab(0.80, 0.80, 0.14, 0.04), { pos: [-2.34, 3.72, 0.76] });
  rig.attach(tint(podFace, PLATE_DARK, 0.03), 'wpL');
  const podRib = place(slab(0.92, 0.14, 1.10, 0.04), { pos: [-2.34, 4.14, 0.12] });
  rig.attach(tint(podRib, TRIM), 'wpL');
  for (let gx = -1; gx <= 1; gx++) {
    for (let gy = -1; gy <= 1; gy++) {
      const t = place(loft(circleCross(7), [{ y: 0, sx: 0.105 }, { y: 0.14, sx: 0.105 }]),
        { pos: [-2.34 + gx * 0.25, 3.72 + gy * 0.25, 0.70], rot: [-Math.PI / 2, 0, 0] });
      rig.attach(glow(tint(t, 0x3a0d05), MAGITEK, 2.2), 'wpL');
    }
  }

  /* --- right arm: the rotary cannon --- */
  const breech = place(slab(0.80, 0.80, 1.00, 0.08), { pos: [2.34, 3.80, 0.10] });
  rig.attach(tint(breech, PLATE, 0.03), 'wpR');
  const drum = place(slab(0.52, 0.62, 0.72, 0.06), { pos: [2.34, 4.18, -0.16] });
  rig.attach(tint(drum, PLATE_DARK, 0.03), 'wpR');
  const spindle = place(loft(circleCross(9), [{ y: 0, sx: 0.13 }, { y: 1.30, sx: 0.11 }]),
    { pos: [2.34, 3.80, 0.58], rot: [-Math.PI / 2, 0, 0] });
  rig.attach(tint(spindle, JOINT), 'wpR');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bx = 2.34 + Math.cos(a) * 0.22, by = 3.80 + Math.sin(a) * 0.22;
    const barrel = place(loft(circleCross(6), [{ y: 0, sx: 0.075 }, { y: 1.24, sx: 0.070 }]),
      { pos: [bx, by, 0.58], rot: [-Math.PI / 2, 0, 0] });
    rig.attach(tint(barrel, TRIM), 'wpR');
  }
  const shroud = place(loft(circleCross(10), [{ y: 0, sx: 0.36 }, { y: 0.22, sx: 0.36 }]),
    { pos: [2.34, 3.80, 1.62], rot: [-Math.PI / 2, 0, 0] });
  rig.attach(tint(shroud, PLATE_DARK, 0.03), 'wpR');
  const shroudGlow = place(loft(circleCross(10), [{ y: 0, sx: 0.30 }, { y: 0.06, sx: 0.30 }]),
    { pos: [2.34, 3.80, 1.66], rot: [-Math.PI / 2, 0, 0] });
  rig.attach(glow(tint(shroudGlow, 0x3a0d05), MAGITEK, 2.0), 'wpR');

  const mat = creatureMaterial({
    roughness: 0.44, metalness: 0.52,
    normalMap: metalNormal(), normalScale: 0.24, roughnessMap: metalRoughness(),
  });
  return rig.build(mat, { radius: 8.0 });
}

class MagitekArmourEnemy extends Enemy {
  constructor(opts) { super(MAGITEK_ARMOUR, opts); }

  /** Reverse-jointed legs, solved with IK so six tonnes plants its feet. */
  setupAnim(anim) {
    super.setupAnim(anim);
    anim.leg('fL', ['hpL', 'knL', 'anL', 'ftL']);
    anim.leg('fR', ['hpR', 'knR', 'anR', 'ftR']);
  }

  /** World-space cannon muzzle — where the raking burst comes from. */
  muzzle(out = new THREE.Vector3()) {
    const b = this.rig && this.rig.byName.get('wpR');
    if (!b) return this.centre(out);
    b.updateWorldMatrix(true, false);
    return out.set(0.04, 0.02, 1.52).applyMatrix4(b.matrixWorld);
  }

  /** World-space missile pod mouth. */
  podMouth(out = new THREE.Vector3()) {
    const b = this.rig && this.rig.byName.get('wpL');
    if (!b) return this.centre(out);
    b.updateWorldMatrix(true, false);
    return out.set(-0.04, -0.06, 0.62).applyMatrix4(b.matrixWorld);
  }

  pose(state, t) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n, x, y, z) => poseBone(rig, n, x, y, z);
    const M = (n, x, y, z, k) => poseBoneMix(rig, n, x, y, z, k);
    this.visual.rotation.z = 0;
    this.visual.position.x = 0;

    // the machine at rest: legs loaded, arms hanging level
    const stand = (k = 1) => {
      for (const s of [-1, 1]) {
        const n = s < 0 ? 'L' : 'R';
        S(`hp${n}`, 0.10 * k, 0, 0);
        S(`kn${n}`, -0.16 * k, 0, 0);
        S(`an${n}`, 0.14 * k, 0, 0);
        S(`ft${n}`, -0.06 * k, 0, 0);
        S(`to${n}`, 0, 0, 0);
        S(`sh${n}`, 0, 0, 0);
        S(`am${n}`, 0, 0, 0);
        S(`wp${n}`, 0, 0, 0);
      }
      S('core', 0, 0, 0);
      S('pod', 0, 0, 0);
      S('visor', 0, 0, 0);
    };

    switch (state) {
      case 'approach':
      case 'walk': {
        // A slow, enormous two-beat stride, phased off ground speed rather
        // than the clock so the feet stay planted instead of paddling, and
        // with a duty factor over one half so at least one foot always is.
        const a = this.anim;
        const sp = this.moveSpeed || 0;
        const norm = Math.min(1, sp / this.speed);
        a.stride(this._dt || 0, sp, 3.9);
        const gait = { duty: 0.72 };
        const pL = legPhase(a.gaitPhase, gait);
        const pR = legPhase(a.gaitPhase - 0.5, gait);
        const stride = 1.05 * (0.5 + 0.5 * norm);
        const lift = 0.60 * (0.35 + 0.65 * norm);
        for (const [id, p] of [['fL', pL], ['fR', pR]]) {
          a.solveLeg(id, p.reach * stride, p.lift * lift, S, {
            kneeSign: 1, footPitch: 0.10 - p.lift * 0.45,
          });
        }
        const support = pL.load + pR.load;
        const sway = (pL.load - pR.load);
        // the chassis rides over the loaded leg and the pod rocks a beat behind
        this.visual.position.x = sway * 0.24;
        this.visual.position.y = (support / 1.4 - 1) * 0.16;
        S('core', (1 - support) * 0.05, sway * 0.06, sway * 0.09);
        S('pod', 0.04 + (1 - support) * 0.05, -sway * 0.10, sway * 0.05);
        S('visor', 0, Math.sin(a.gaitPhase * Math.PI) * 0.05, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          const q = s < 0 ? sway : -sway;
          S(`to${n}`, (s < 0 ? pL : pR).lift * 0.24, 0, 0);
          S(`sh${n}`, -q * 0.09, 0, 0);
          S(`am${n}`, q * 0.05, 0, 0);
          S(`wp${n}`, 0, 0, 0);
        }
        break;
      }
      case 'telegraph': {
        const id = this.attackId;
        if (id === 'sweep') {
          // the right arm cocks back across the body, pod counter-rotating
          const k = Math.min(1, this.stateTime / 0.85);
          const e = k * k * (3 - 2 * k);
          stand(1);
          S('shR', -0.20 * e, -1.35 * e, -0.30 * e);
          S('amR', 0, -0.55 * e, 0);
          S('wpR', 0, -0.30 * e, 0);
          S('shL', 0.10 * e, 0.45 * e, 0.20 * e);
          S('core', 0, -0.34 * e, 0);
          S('pod', -0.06 * e, -0.26 * e, 0);
          S('visor', 0, 0.40 * e, 0);
          S('hpL', 0.10 + 0.24 * e, 0, 0); S('knL', -0.16 - 0.26 * e, 0, 0);
          S('hpR', 0.10 - 0.16 * e, 0, 0); S('knR', -0.16 - 0.10 * e, 0, 0);
          this.visual.position.y = -0.14 * e;
        } else if (id === 'missiles') {
          // the pod hinges up and out, tubes brought to bear
          const k = Math.min(1, this.stateTime / 1.0);
          const e = k * k * (3 - 2 * k);
          const hum = Math.sin(t * 22) * 0.012 * e;
          stand(1);
          S('shL', -0.55 * e, 0.28 * e, 0.62 * e);
          S('amL', -0.40 * e, 0, 0.20 * e);
          S('wpL', -0.95 * e + hum, 0.18 * e, 0);
          S('pod', -0.10 * e, 0.14 * e, 0);
          S('visor', -0.08 * e, 0.12 * e, 0);
          S('core', -0.05 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, 0.10 - 0.14 * e, 0, 0);
            S(`kn${n}`, -0.16 - 0.20 * e, 0, 0);
            S(`an${n}`, 0.14 + 0.18 * e, 0, 0);
          }
          this.visual.position.y = -0.12 * e;
        } else if (id === 'cannon') {
          // barrels visibly spin up before a single round is fired
          const k = Math.min(1, this.stateTime / 0.5);
          const e = k * k * (3 - 2 * k);
          const spin = this.stateTime * this.stateTime * 9.0;
          stand(1);
          S('shR', -0.32 * e, 0.10 * e, -0.20 * e);
          S('amR', -0.18 * e, 0, 0);
          S('wpR', -0.10 * e, 0.06 * e, spin);
          S('pod', -0.04 * e, -0.10 * e, 0);
          S('visor', -0.04 * e, -0.08 * e, 0);
          S('hpR', 0.10 - 0.18 * e, 0, 0); S('knR', -0.16 - 0.16 * e, 0, 0);
          this.visual.position.y = -0.08 * e;
        } else if (id === 'overload') {
          // everything vents: the machine squats, splays, and cracks its
          // cockpit shield open. This is the window.
          const k = Math.min(1, this.stateTime / 1.6);
          const e = k * k * (3 - 2 * k);
          const shudder = Math.sin(t * 34) * 0.035 * e;
          stand(1);
          S('core', -0.16 * e + shudder * 0.4, 0, 0);
          S('pod', -0.30 * e + shudder, 0, 0);
          S('visor', -1.15 * e - shudder * 0.6, 0, 0);   // shield hinged wide open
          S('shL', -0.75 * e, 0.30 * e, 0.85 * e);
          S('amL', -0.35 * e, 0, 0.30 * e);
          S('shR', -0.75 * e, -0.30 * e, -0.85 * e);
          S('amR', -0.35 * e, 0, -0.30 * e);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, 0.10 + 0.42 * e, 0, 0.18 * e * s);
            S(`kn${n}`, -0.16 - 0.62 * e, 0, 0);
            S(`an${n}`, 0.14 + 0.52 * e, 0, 0);
            S(`ft${n}`, -0.06 - 0.22 * e, 0, 0);
          }
          this.visual.position.y = -0.62 * e;
        } else {
          // stomp: the leg is hauled up and held there
          const k = Math.min(1, this.stateTime / 0.9);
          const e = k * k * (3 - 2 * k);
          stand(1);
          S('hpR', 0.10 - 0.95 * e, 0, 0);
          S('knR', -0.16 - 1.15 * e, 0, 0);
          S('anR', 0.14 + 1.05 * e, 0, 0);
          S('ftR', -0.06 + 0.35 * e, 0, 0);
          S('hpL', 0.10 + 0.26 * e, 0, 0);
          S('knL', -0.16 - 0.34 * e, 0, 0);
          S('anL', 0.14 + 0.30 * e, 0, 0);
          S('core', 0.10 * e, 0, -0.10 * e);
          S('pod', -0.14 * e, 0, -0.06 * e);
          S('visor', 0.16 * e, 0, 0);
          S('shR', -0.24 * e, 0, -0.18 * e);
          S('shL', -0.24 * e, 0, 0.18 * e);
          this.visual.position.y = 0.16 * e;
        }
        break;
      }
      case 'attack': {
        const id = this.attackId;
        if (id === 'sweep') {
          const k = Math.min(1, this.stateTime / 0.42);
          const e = 1 - Math.pow(1 - k, 3.0);
          stand(1);
          S('shR', -0.20, -1.35 + 2.55 * e, -0.30 + 0.30 * e);
          S('amR', 0, -0.55 + 0.95 * e, 0);
          S('wpR', 0, -0.30 + 0.55 * e, 0);
          S('shL', 0.10, 0.45 - 0.70 * e, 0.20);
          S('core', 0, -0.34 + 0.68 * e, 0);
          S('pod', -0.06, -0.26 + 0.50 * e, 0);
          S('visor', 0, 0.40 - 0.72 * e, 0);
          S('hpL', 0.34 - 0.24 * e, 0, 0); S('knL', -0.42 + 0.20 * e, 0, 0);
          S('hpR', -0.06 + 0.16 * e, 0, 0); S('knR', -0.26 + 0.10 * e, 0, 0);
          this.visual.position.y = -0.14;
        } else if (id === 'missiles') {
          // salvo: the pod rocks back on each launch
          const kick = Math.exp(-((this.stateTime % 0.18) * 16)) * 0.22;
          stand(1);
          S('shL', -0.55, 0.28, 0.62);
          S('amL', -0.40, 0, 0.20);
          S('wpL', -0.95 - kick * 0.35, 0.18, 0);
          S('pod', -0.10 + kick * 0.18, 0.14, 0);
          S('visor', -0.08, 0.12, 0);
          S('core', -0.05 + kick * 0.10, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, -0.04, 0, 0); S(`kn${n}`, -0.36, 0, 0); S(`an${n}`, 0.32, 0, 0);
          }
          this.visual.position.y = -0.12;
        } else if (id === 'cannon') {
          // raking burst: barrels at full spin, the whole arm traversing
          const spin = 4.5 + this.stateTime * 34;
          const rake = Math.sin(this.stateTime * 3.4) * 0.55;
          const buzz = Math.sin(t * 46) * 0.02;
          stand(1);
          S('shR', -0.32 + buzz, 0.10 + rake, -0.20);
          S('amR', -0.18, rake * 0.4, 0);
          S('wpR', -0.10 + buzz, 0.06 + rake * 0.3, spin);
          S('pod', -0.04, -0.10 + rake * 0.5, 0);
          S('visor', -0.04, -0.08 + rake * 0.5, 0);
          S('core', 0, rake * 0.25, 0);
          S('hpR', -0.08, 0, 0); S('knR', -0.32, 0, 0); S('anR', 0.30, 0, 0);
          this.visual.position.y = -0.08;
        } else if (id === 'overload') {
          // the discharge — everything thrown open, then a hard slam shut
          const k = Math.min(1, this.stateTime / 0.5);
          const e = 1 - Math.pow(1 - k, 2.6);
          const shudder = Math.sin(t * 52) * 0.05 * (1 - e);
          stand(1);
          S('core', -0.16 + 0.24 * e + shudder, 0, 0);
          S('pod', -0.30 + 0.42 * e + shudder, 0, 0);
          S('visor', -1.15 + 0.85 * e, 0, 0);
          S('shL', -0.75 + 0.55 * e, 0.30, 0.85 - 0.60 * e);
          S('amL', -0.35 + 0.25 * e, 0, 0.30);
          S('shR', -0.75 + 0.55 * e, -0.30, -0.85 + 0.60 * e);
          S('amR', -0.35 + 0.25 * e, 0, -0.30);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, 0.52 - 0.30 * e, 0, 0.18 * s);
            S(`kn${n}`, -0.78 + 0.40 * e, 0, 0);
            S(`an${n}`, 0.66 - 0.34 * e, 0, 0);
            S(`ft${n}`, -0.28 + 0.14 * e, 0, 0);
          }
          this.visual.position.y = -0.62 + 0.34 * e;
        } else {
          // stomp: the foot comes down and the whole chassis drops with it
          const k = Math.min(1, this.stateTime / 0.30);
          const e = 1 - Math.pow(1 - k, 3.6);
          stand(1);
          S('hpR', -0.85 + 1.15 * e, 0, 0);
          S('knR', -1.31 + 1.05 * e, 0, 0);
          S('anR', 1.19 - 1.00 * e, 0, 0);
          S('ftR', 0.29 - 0.45 * e, 0, 0);
          S('hpL', 0.36 + 0.16 * e, 0, 0);
          S('knL', -0.50 - 0.14 * e, 0, 0);
          S('anL', 0.44 + 0.12 * e, 0, 0);
          S('core', 0.10 - 0.22 * e, 0, -0.10 + 0.10 * e);
          S('pod', -0.14 + 0.30 * e, 0, -0.06 + 0.06 * e);
          S('visor', 0.16 - 0.22 * e, 0, 0);
          S('shR', -0.24 + 0.34 * e, 0, -0.18);
          S('shL', -0.24 + 0.34 * e, 0, 0.18);
          this.visual.position.y = 0.16 - 0.62 * e;
        }
        break;
      }
      case 'flinch': {
        // super-armoured: it barely notices. A judder through the frame.
        const k = Math.exp(-this.stateTime * 11) * (1 - Math.min(1, this.stateTime / 0.3));
        stand(1);
        S('core', 0.07 * k, Math.sin(this.stateTime * 52) * 0.06 * k, 0);
        S('pod', 0.09 * k, 0, 0.05 * k);
        S('visor', -0.06 * k, 0, 0);
        break;
      }
      case 'stagger': {
        // the servos give: one knee folds, the pod sags, the shield hangs open
        const k = Math.min(1, this.stateTime / 0.45) * Math.max(0, 1 - this.stateTime / 3.8);
        stand(1);
        S('core', 0.30 * k, 0.16 * k, 0.14 * k);
        S('pod', 0.34 * k, 0, 0.10 * k);
        S('visor', -0.85 * k, 0.10 * k, 0);
        S('shL', 0.55 * k, 0.20 * k, 0.42 * k);
        S('amL', 0.35 * k, 0, 0);
        S('shR', 0.55 * k, -0.20 * k, -0.42 * k);
        S('amR', 0.35 * k, 0, 0);
        S('hpL', 0.10 + 0.72 * k, 0, 0); S('knL', -0.16 - 0.95 * k, 0, 0);
        S('anL', 0.14 + 0.85 * k, 0, 0); S('ftL', -0.06 - 0.30 * k, 0, 0);
        S('hpR', 0.10 + 0.44 * k, 0, 0); S('knR', -0.16 - 0.62 * k, 0, 0);
        S('anR', 0.14 + 0.56 * k, 0, 0); S('ftR', -0.06 - 0.22 * k, 0, 0);
        this.visual.position.y = -0.90 * k;
        break;
      }
      case 'death': {
        // the legs fold, then six metres of machine goes over forwards
        const k = Math.min(1, this.stateTime / 1.8);
        const e = 1 - Math.pow(1 - k, 2.2);
        const fold = Math.min(1, this.stateTime / 0.7);
        stand(1);
        this.visual.rotation.x = e * 1.15;
        this.visual.position.y = -1.30 * e;
        S('core', 0.35 * fold, 0, 0.12 * e);
        S('pod', 0.30 * fold, 0, 0.20 * e);
        S('visor', -1.05 * fold, 0, 0);
        S('shL', 0.85 * e, 0, 0.55 * e);
        S('amL', 0.55 * e, 0, 0);
        S('shR', 0.85 * e, 0, -0.55 * e);
        S('amR', 0.55 * e, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, 0.10 + 0.95 * fold, 0, 0);
          S(`kn${n}`, -0.16 - 1.25 * fold, 0, 0);
          S(`an${n}`, 0.14 + 1.10 * fold, 0, 0);
          S(`ft${n}`, -0.06 - 0.40 * fold, 0, 0);
        }
        break;
      }
      default: {
        // idle: hydraulics breathing, the visor sweeping for something to kill
        const b = Math.sin(t * 0.8) * 0.02;
        stand(1);
        S('core', b, 0, 0);
        S('pod', 0.02 + b * 0.6, Math.sin(t * 0.3) * 0.07, 0);
        S('visor', 0, Math.sin(t * 0.24) * 0.30, 0);
        S('shL', b * 0.5, 0, 0.03);
        S('shR', b * 0.5, 0, -0.03);
        this.visual.position.y = b * 0.4;
        break;
      }
    }

    /* --- battle damage, layered over whatever the machine is doing --- */
    if (state !== 'death') {
      if (this.phaseIndex >= 1) {
        // missile arm blown off its mount: dead weight, hanging down and out
        const swing = Math.sin(t * 1.4) * 0.05;
        M('shL', 1.05 + swing, 0.30, -0.95, 1);
        M('amL', 0.72, 0, -0.34, 1);
        M('wpL', 0.60 + swing * 0.6, 0.28, 0.45, 1);
      }
      if (this.phaseIndex >= 2) {
        // enraged and coming apart: canted over, one knee permanently lower
        const hitch = Math.sin(t * 2.3) * 0.02;
        this.visual.rotation.z = -0.11 + hitch;
        this.visual.position.y -= 0.24;
        M('hpR', 0.42, 0, 0, 0.65);
        M('knR', -0.62, 0, 0, 0.65);
        M('anR', 0.54, 0, 0, 0.65);
        M('core', 0.12 + hitch, 0.06, 0.10, 0.5);
        M('pod', 0.16, 0, 0.08, 0.45);
      }
    }
  }
}

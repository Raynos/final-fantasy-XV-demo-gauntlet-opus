import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.ts';
import { Enemy, organicNormal, organicRoughness } from './EnemyBase.ts';
import { tube, spike, slab, place, tint, glow, rectCross, loft } from '../../combat/GeoKit.ts';

const P = (x: any, y: any, z: any) => new THREE.Vector3(x, y, z);

const BASALT = 0x2b2723;      // the bulk of him: dark grey-brown slabbed rock
const BASALT_D = 0x151311;    // shadowed undersides, deep fissure walls
const GRANITE = 0x453d35;     // sun-struck plate faces
const GRANITE_L = 0x5b5147;   // the topmost scree layer, dustiest
const OBSIDIAN = 0x0d0c0b;    // horns, teeth, claw plates
const SCORCH = 0x3a1c10;      // albedo of anything that is glowing
const MAGMA = 0xff5a12;       // the furnace under the crust

/**
 * Titan, the Archaean — the mountain at the Disc of Cauthess that stood up.
 *
 * Modelled from the pelvis up only: the arena the player fights in sits at his
 * waist, so his legs never exist and his silhouette is a wall of fractured
 * basalt filling the sky with two house-sized hands coming down out of it.
 * Every surface is overhanging slabs of stone laid like scree rather than a
 * smooth skin, split by fissures with a furnace burning behind them; the
 * right pauldron is a mountain in its own right, because he has spent an age
 * holding the Meteor up on that shoulder.
 */
export const TITAN = {
  key: 'titan',
  questId: 'titan',
  faction: 'astral',
  expClass: 'boss',
  boss: true,
  superArmour: true,
  /**
   * Modelled from the pelvis up, so the bottom of the mesh is *meant* to be
   * tens of metres below the ground the player stands on. Opts him out of the
   * ground calibration in `EnemyBase`, which would otherwise measure the cut
   * edge of his hips as a sunk foot and hoist the whole mountain out of the
   * arena; `src/tools/creaturecheck.mjs` exempts him for the same reason.
   */
  buriedBase: true,
  stats: {
    name: 'Titan, the Archaean', hp: 180000, poise: 900, speed: 0.6, attackRange: 26,
    aggroRange: 200, radius: 9, height: 40, damage: 900, level: 45,
  },
  resistPct: { fire: 60, ice: 130, lightning: 120, dark: 100, light: 100 },
  weakTo: ['greatsword'],
  staggerDuration: 6.0,
  senses: { sight: 200, fov: 3.2, hearing: 200 },
  drops: [{ id: 'meteorshard', chance: 1, count: 1 }],
  timing: { telegraph: 1.8, strike: 0.35, attack: 1.2, recover: 2.6 },
  attacks: [
    // The bread and butter: one fist goes up out of frame and comes back down.
    // The 2.6 s recovery is the whole fight — the fist stays buried in the
    // arena floor and that is the only thing on Titan the player can reach.
    {
      id: 'slam_r', range: 30, weight: 3, mult: 1.4, poise: 130, hitRadius: 14, aoe: true,
      telegraph: 1.8, strike: 0.35, attack: 1.2, recover: 2.6, cooldown: 4.5, tracking: 0.5,
    },
    {
      id: 'slam_l', range: 30, weight: 3, mult: 1.4, poise: 130, hitRadius: 14, aoe: true,
      telegraph: 1.8, strike: 0.35, attack: 1.2, recover: 2.6, cooldown: 4.5, tracking: 0.5,
    },
    // Flat open palm dragged across the arena at head height. Nothing parries
    // a mountain — you get behind the other hand or you die.
    {
      id: 'sweep', phase: 1, range: 40, weight: 2, mult: 1.2, poise: 180, hitRadius: 20, arc: 2.4,
      telegraph: 2.2, strike: 0.45, attack: 1.35, recover: 2.0, cooldown: 9.0, tracking: 0.5,
      unblockable: true,
    },
    // Both fists, together, straight down.
    {
      id: 'double', phase: 2, range: 32, weight: 2, mult: 2.0, poise: 240, hitRadius: 18, aoe: true,
      telegraph: 2.6, strike: 0.40, attack: 1.4, recover: 3.2, cooldown: 14, tracking: 0.35,
    },
    // He rears back and bellows; the fissures blow open and the arena burns.
    {
      id: 'roar', phase: 2, range: 40, weight: 1, mult: 0.6, poise: 100, hitRadius: 40, aoe: true,
      telegraph: 1.6, strike: 0.50, attack: 1.6, recover: 2.2, cooldown: 18, element: 'fire',
    },
  ],
  buildPrototype,
  make(opts: any) { return new TitanEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('pelvis', 'root', [0, 0, 0]);
  rig.bone('spineA', 'pelvis', [0, 4.6, -0.4]);
  rig.bone('spineB', 'spineA', [0, 9.6, -0.6]);
  rig.bone('chest', 'spineB', [0, 14.6, -0.4]);
  rig.bone('neck', 'chest', [0, 19.6, -0.2]);
  rig.bone('head', 'neck', [0, 21.8, 0.3]);
  rig.bone('jaw', 'head', [0, 20.8, 1.2]);
  // Leaf bones carrying nothing but the molten cores. Swelling them pushes
  // more of the furnace out through the fissures, so the glow can breathe,
  // flare on the roar and gutter out on death — without a second material.
  rig.bone('coreC', 'chest', [0, 13.8, 2.4]);
  rig.bone('coreT', 'neck', [0, 20.4, 1.6]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`clav${n}`, 'chest', [3.2 * s, 17.8, -0.3]);
    rig.bone(`sh${n}`, `clav${n}`, [7.9 * s, 17.1, 0.0]);
    rig.bone(`el${n}`, `sh${n}`, [11.8 * s, 9.2, 1.2]);
    rig.bone(`wr${n}`, `el${n}`, [12.9 * s, 2.9, 7.0]);
    rig.bone(`hand${n}`, `wr${n}`, [13.2 * s, 2.0, 9.9]);
    rig.bone(`thumb${n}`, `hand${n}`, [10.4 * s, 1.7, 11.0]);
    rig.bone(`fing${n}`, `hand${n}`, [13.6 * s, 1.5, 12.6]);
  }

  /* ---- helpers: everything on him is a slab of rock or a burning crack ---- */
  const plate = (bone: any, w: any, h: any, d: any, pos: any, rot: any, col = BASALT) =>
    rig.attach(tint(place(slab(w, h, d, Math.min(w, h, d) * 0.24), { pos, rot }), col, 0.055), bone);
  // A fissure is a faceted wedge of light rammed into the gap between two
  //
  // **Bind it to the same bone as the plates it sits between.** Every fissure in
  // the arm and hand used to pass 'coreC', so the glow stayed with the torso
  // while the limb geometry moved with its own bones -- a dozen orange wedges
  // floating free above the dirt, clearly visible in `bestiary_titan`.
  // plates — a sixth of the cost of a bevelled slab, which matters when
  // there are fifty of them and the budget belongs to the hands.
  const fissure = (bone: any, w: any, h: any, d: any, pos: any, rot: any, str = 2.2) => {
    const g = loft(rectCross(0.4, 6), [
      { y: -h / 2, sx: w / 2, sz: d / 2 },
      { y: h / 2, sx: w / 2, sz: d / 2 },
    ]);
    return rig.attach(glow(tint(place(g, { pos, rot }), SCORCH), MAGMA, str), bone);
  };
  const shard = (bone: any, r: any, h: any, pos: any, rot: any, col = BASALT_D) =>
    rig.attach(tint(place(spike(r, h, 6), { pos, rot }), col, 0.05), bone);

  /* ------------------------------------------------------------ torso core
     Three lofts stacked up the spine so the mass actually creases when he
     breathes, instead of pivoting as one block. */
  const belly = loft(rectCross(0.34, 12), [
    { y: -3.0, sx: 5.3, sz: 3.8 },
    { y: 0.4, sx: 5.9, sz: 4.1 },
    { y: 3.4, sx: 5.4, sz: 3.7 },
    { y: 6.6, sx: 5.8, sz: 3.9 },
  ]);
  rig.attachBlend(tint(belly, BASALT, 0.05), 'pelvis', 'spineA', 1.5);

  const midriff = loft(rectCross(0.34, 12), [
    { y: 6.0, sx: 5.8, sz: 3.9 },
    { y: 9.0, sx: 6.6, sz: 4.3 },
    { y: 11.8, sx: 7.6, sz: 4.8 },
  ]);
  rig.attachBlend(tint(midriff, BASALT, 0.05), 'spineA', 'spineB', 1.5);

  const ribcage = loft(rectCross(0.32, 12), [
    { y: 11.2, sx: 7.5, sz: 4.7 },
    { y: 14.6, sx: 8.9, sz: 5.4 },
    { y: 17.0, sx: 9.0, sz: 5.2 },
    { y: 19.0, sx: 6.6, sz: 4.2 },
  ]);
  rig.attachBlend(tint(ribcage, BASALT, 0.05), 'spineB', 'chest', 1.4);

  /* ---- chest: three courses of overhanging plate, laid like a rockfall ---- */
  for (let r = 0; r < 3; r++) {
    for (let c = -1; c <= 1; c++) {
      const y = 13.0 + r * 2.35;
      const w = 4.8 - Math.abs(c) * 0.8 - r * 0.25;
      const col = r === 1 ? GRANITE : (c === 0 ? BASALT : GRANITE_L);
      plate('chest', w, 2.1 + r * 0.15, 1.7,
        [c * (3.0 - r * 0.1), y, 4.1 - Math.abs(c) * 1.3 - r * 0.2],
        [-0.17 - r * 0.05, c * 0.24, c * 0.11], col);
    }
    // the crack between courses, burning
    if (r < 2) {
      fissure('coreC', 8.4 - r * 0.6, 0.62, 0.5, [0, 14.28 + r * 2.35, 3.55 - r * 0.2], [-0.2, 0, 0], 2.6 + r * 0.5);
    }
  }
  // sternum: one huge wedge with the furnace showing down the middle of it
  plate('chest', 2.4, 6.6, 2.2, [0, 15.4, 4.6], [-0.1, 0, 0], GRANITE_L);
  fissure('coreC', 0.85, 7.4, 0.7, [0, 15.4, 5.1], [-0.1, 0, 0], 3.4);
  fissure('coreC', 3.4, 0.7, 0.6, [0, 17.9, 4.3], [-0.3, 0, 0], 3.0);

  /* ---- flank and belly plates ---- */
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const y = 1.4 + i * 3.0;
      const w = 2.4 + i * 0.35;
      plate('spineA', w, 2.6, 3.4 + i * 0.3, [(4.6 + i * 0.5) * s, y, 0.2], [0, 0, -0.22 * s],
        i % 2 ? GRANITE : BASALT);
    }
    for (let i = 0; i < 3; i++) {
      plate('spineB', 2.6, 2.4, 3.6, [(6.2 + i * 0.5) * s, 10.4 + i * 2.4, 0.1], [0, 0, -0.26 * s],
        i % 2 ? BASALT : GRANITE);
    }
    // belly fissures running up the flanks
    fissure('coreC', 0.55, 3.2, 0.55, [(5.2 + 0.4) * s, 4.4, 2.6], [0, -0.5 * s, 0.2 * s], 1.6);
    fissure('coreC', 0.55, 3.6, 0.55, [(5.9) * s, 10.4, 2.9], [0, -0.5 * s, 0.18 * s], 2.0);
  }
  for (let i = 0; i < 3; i++) {
    plate('pelvis', 5.6 - i * 0.5, 2.2, 2.0, [0, 0.9 + i * 2.2, 3.7 - i * 0.15], [-0.12, 0, 0],
      i % 2 ? BASALT : GRANITE);
    fissure('coreC', 4.4, 0.5, 0.45, [0, 2.05 + i * 2.2, 3.5], [-0.15, 0, 0], 1.5);
  }

  /* ---- back: a broken ridge of stone running up the spine ---- */
  for (let i = 0; i < 8; i++) {
    const f = i / 7;
    const bone = f < 0.32 ? 'pelvis' : f < 0.64 ? 'spineA' : f < 0.86 ? 'spineB' : 'chest';
    const y = 1.6 + f * 16.4;
    shard(bone, 1.0 + f * 0.7, 2.6 + f * 2.6, [0, y, -3.5 - f * 1.2], [-2.05 - f * 0.2, 0, 0]);
    plate(bone, 5.2 - f * 0.6, 2.2, 2.0, [0, y, -3.2 - f * 1.0], [0.2, 0, 0], BASALT_D);
  }

  /* ------------------------------------------------------------- shoulders
     Wildly asymmetric: the right side is a mountain range, the left is a
     shoulder. That lopsided read is the whole silhouette. */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const big = s > 0 ? 1.0 : 0.62;
    // the right side gets one more course than the left — that is the Meteor
    for (let i = 0; i < (s > 0 ? 5 : 4); i++) {
      const w = (9.6 - i * 1.7) * big;
      const d = (8.6 - i * 1.5) * big;
      plate(`sh${n}`, w, 2.5 - i * 0.3, d,
        [(8.4 + i * 0.75 * big) * s, 18.3 + i * (1.6 * big), -0.3 + i * 0.15],
        [0.05, 0, (-0.3 - i * 0.05) * s],
        i === 1 ? GRANITE : i === 3 ? GRANITE_L : BASALT);
    }
    for (let i = 0; i < 5; i++) {
      const a = -0.5 + i * 0.42;
      shard(`sh${n}`, 0.9 * big, (4.6 - Math.abs(i - 2) * 0.8) * big,
        [(9.4 + Math.cos(a) * 1.2) * s, 22.5 * (s > 0 ? 1 : 0.93) + Math.sin(a) * 1.4 - (s > 0 ? 0 : 2.4), -1.2 + i * 0.7],
        [-0.35 + i * 0.12, 0, (-0.55 - i * 0.06) * s]);
    }
    fissure('coreC', 5.4 * big, 0.6, 0.55, [(8.6) * s, 17.6, 2.4], [0, -0.35 * s, -0.3 * s], 2.4);
    // clavicle slabs bridging the neck to the pauldron
    plate(`clav${n}`, 4.6, 2.2, 3.4, [4.2 * s, 18.3, 1.4], [-0.1, -0.18 * s, -0.2 * s], GRANITE);
  }

  /* ---- crown of rock spurs behind and above the shoulders ---- */
  for (let i = 0; i < 9; i++) {
    const f = (i - 4) / 4;
    shard('chest', 0.85 - Math.abs(f) * 0.22, 5.4 - Math.abs(f) * 1.6,
      [f * 5.8, 18.2 + (1 - Math.abs(f)) * 1.4, -3.0 - Math.abs(f) * 0.5],
      [-0.62, 0, f * 0.55]);
    if (i % 2 === 0) {
      shard('chest', 0.5, 3.0 - Math.abs(f) * 0.9, [f * 4.4, 19.6, -2.0], [-0.35, 0, f * 0.7]);
    }
  }

  /* ------------------------------------------------------------------ head
     A brutal near-featureless block of stone: brow shelf like an overhang,
     two furnace slots for eyes, a jaw that hangs off it like a cliff. */
  const neck = loft(rectCross(0.32, 10), [
    { y: 18.2, sx: 3.7, sz: 3.5 },
    { y: 20.4, sx: 3.0, sz: 3.0 },
  ]);
  rig.attachBlend(tint(neck, BASALT_D, 0.05), 'chest', 'head', 1.0);
  fissure('coreT', 2.4, 2.6, 2.4, [0, 19.6, 0.9], [0, 0, 0], 2.0);

  const skull = loft(rectCross(0.3, 12), [
    { y: 20.4, sx: 2.9, sz: 2.9 },
    { y: 21.9, sx: 3.7, sz: 3.3 },
    { y: 23.5, sx: 3.9, sz: 3.1 },
    { y: 24.9, sx: 3.2, sz: 2.5 },
    { y: 25.7, sx: 1.9, sz: 1.6 },
  ]);
  rig.attach(tint(skull, BASALT, 0.05), 'head');

  plate('head', 8.4, 1.6, 3.8, [0, 23.5, 1.5], [0.24, 0, 0], GRANITE_L);   // brow shelf
  plate('head', 6.4, 1.3, 2.6, [0, 24.8, 0.6], [-0.2, 0, 0], GRANITE);
  plate('head', 3.2, 2.2, 2.2, [0, 22.3, 2.3], [0.08, 0, 0], BASALT_D);    // muzzle block
  for (const s of [-1, 1]) {
    plate('head', 2.5, 3.2, 2.7, [3.0 * s, 22.2, 0.9], [0, 0, -0.2 * s], GRANITE);
    // furnace slots, set back under the brow
    fissure('head', 2.2, 0.62, 0.55, [1.9 * s, 22.82, 2.62], [0.1, 0, -0.13 * s], 5.0);
    plate('head', 2.6, 1.1, 0.5, [1.9 * s, 22.8, 2.35], [0.1, 0, -0.13 * s], BASALT_D);
    // forward-curving horns of black rock
    const horn = tube([
      P(3.0 * s, 24.3, 0.1), P(4.5 * s, 25.5, 1.3), P(5.3 * s, 25.5, 3.3),
      P(5.1 * s, 24.5, 5.1), P(4.5 * s, 23.5, 6.2),
    ], [1.15, 0.95, 0.74, 0.48, 0.11], { radialSeg: 8 });
    rig.attach(tint(horn, OBSIDIAN, 0.05), 'head');
    shard('head', 0.55, 2.4, [2.6 * s, 21.4, 1.4], [0.5, 0, -1.15 * s], OBSIDIAN);
  }
  for (let i = 0; i < 4; i++) {
    shard('head', 0.5 - i * 0.07, 2.0 - i * 0.3, [0, 25.2 - i * 0.5, -0.6 - i * 0.7], [-1.2 - i * 0.2, 0, 0]);
  }

  /* ---- jaw: a slab of cliff hung off the skull ---- */
  plate('jaw', 5.8, 2.7, 4.3, [0, 20.1, 1.9], [0.1, 0, 0], BASALT);
  plate('jaw', 4.4, 1.6, 2.6, [0, 19.4, 2.6], [0.3, 0, 0], BASALT_D);
  for (const s of [-1, 1]) {
    plate('jaw', 1.9, 2.4, 3.6, [2.5 * s, 20.4, 1.2], [0, 0, -0.18 * s], GRANITE);
  }
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 1.1;
    shard('jaw', 0.34, 1.2 - Math.abs(i - 2) * 0.15, [x, 21.1, 2.6], [-0.15, 0, 0], OBSIDIAN);
  }
  fissure('coreT', 3.6, 1.0, 1.8, [0, 21.0, 1.6], [0, 0, 0], 3.6);

  /* ------------------------------------------------------------------ arms
     The whole fight lives here. Two columns of rock ending in a house. */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';

    const upper = tube([
      P(7.9 * s, 17.1, 0.0), P(9.8 * s, 13.4, 0.5), P(11.8 * s, 9.2, 1.2),
    ], [3.6, 3.2, 2.7], { radialSeg: 8 });
    rig.attachBlend(tint(upper, BASALT, 0.05), `sh${n}`, `el${n}`, 1.1);

    const fore = tube([
      P(11.8 * s, 9.2, 1.2), P(12.4 * s, 6.1, 4.0), P(12.9 * s, 2.9, 7.0),
    ], [3.0, 2.6, 2.2], { radialSeg: 8 });
    rig.attachBlend(tint(fore, BASALT, 0.05), `el${n}`, `wr${n}`, 1.1);

    // slabbed armour down the upper arm
    for (let i = 0; i < 3; i++) {
      const f = i / 2;
      plate(`sh${n}`, 4.2 - i * 0.3, 2.6, 4.2 - i * 0.3,
        [(8.4 + f * 3.0) * s, 15.6 - f * 5.2, 0.2 + f * 0.7], [0.08, 0, (-0.24 + f * 0.1) * s],
        i === 1 ? GRANITE : BASALT);
    }
    fissure(`sh${n}`, 0.5, 4.6, 0.5, [(10.6) * s, 13.4, 2.9], [0.42, 0, -0.2 * s], 1.8);

    // elbow: a boulder with spurs
    plate(`el${n}`, 4.6, 4.2, 4.4, [11.8 * s, 9.2, 0.9], [0, 0, -0.12 * s], GRANITE_L);
    for (let i = 0; i < 3; i++) {
      shard(`el${n}`, 0.7, 2.6 - i * 0.35, [(12.6 + i * 0.2) * s, 10.4 - i * 1.5, -1.4], [-1.5 - i * 0.15, 0, -0.5 * s]);
    }

    // slabbed armour down the forearm
    for (let i = 0; i < 4; i++) {
      const f = i / 3;
      plate(`el${n}`, 3.9 - i * 0.22, 2.3, 3.9 - i * 0.22,
        [(11.9 + f * 1.2) * s, 8.2 - f * 5.4, 1.4 + f * 4.6], [0.72, 0, -0.1 * s],
        i % 2 ? GRANITE : BASALT);
      if (i < 3) fissure(`el${n}`, 3.0, 0.5, 0.5, [(12.1 + f * 1.2) * s, 7.0 - f * 5.4, 1.9 + f * 4.6], [0.72, 0, 0], 1.7);
    }

    /* ---- the hand: a palm of layered slabs and five fingers of stacked
       blocks. Roughly the footprint of a house, and the only part of him
       the player will ever stand next to. ---- */
    plate(`wr${n}`, 6.6, 2.8, 3.2, [12.9 * s, 2.9, 7.0], [0.62, 0, 0], GRANITE_L);
    fissure(`wr${n}`, 5.0, 0.55, 0.5, [12.9 * s, 3.9, 7.4], [0.62, 0, 0], 2.2);

    plate(`hand${n}`, 7.4, 2.7, 4.6, [13.2 * s, 2.0, 9.6], [0.14, 0, 0], BASALT);
    plate(`hand${n}`, 6.6, 1.5, 3.6, [13.2 * s, 3.2, 9.4], [-0.1, 0, 0], GRANITE);
    plate(`hand${n}`, 5.6, 2.0, 2.6, [12.6 * s, 1.4, 8.0], [0.2, 0, -0.15 * s], GRANITE_L);
    plate(`hand${n}`, 2.6, 2.2, 3.6, [15.9 * s, 1.9, 9.8], [0, 0, -0.3 * s], GRANITE);
    fissure(`hand${n}`, 5.4, 0.5, 3.0, [13.2 * s, 0.75, 9.7], [0, 0, 0], 2.6);   // furnace in the palm
    // knuckle course, each one crowned with a broken spur
    for (let k = 0; k < 4; k++) {
      const o = -2.55 + k * 1.7;
      plate(`hand${n}`, 1.6, 1.7, 1.6, [(13.2 + o) * s, 2.7, 11.6], [0.1, 0, 0], GRANITE_L);
      shard(`hand${n}`, 0.42, 1.3 - Math.abs(k - 1.5) * 0.18, [(13.2 + o) * s, 3.3, 11.4], [-0.3, 0, o * 0.06]);
    }
    shard(`hand${n}`, 0.55, 1.8, [(13.2 - 3.6) * s, 3.0, 9.4], [-0.2, 0, -0.6 * s]);

    // four fingers, three stacked blocks each
    for (let f = 0; f < 4; f++) {
      const o = -2.55 + f * 1.7;
      const droop = Math.abs(f - 1.5) * 0.12;
      const wid = 1.72 - Math.abs(f - 1.5) * 0.16;
      plate(`fing${n}`, wid, 2.0, 2.4, [(13.2 + o) * s, 1.9 - droop, 12.9], [0.06, 0, 0], BASALT);
      plate(`fing${n}`, wid - 0.14, 1.8, 2.2, [(13.2 + o * 1.06) * s, 1.6 - droop * 1.6, 15.0], [0.12, 0, 0], GRANITE);
      plate(`fing${n}`, wid - 0.36, 1.4, 1.8, [(13.2 + o * 1.11) * s, 1.2 - droop * 2.2, 16.8], [0.2, 0, 0], BASALT_D);
      shard(`fing${n}`, 0.45, 1.5, [(13.2 + o * 1.13) * s, 0.9 - droop * 2.4, 17.6], [1.35, 0, 0], OBSIDIAN);
      fissure(`fing${n}`, wid * 0.8, 0.42, 0.42, [(13.2 + o * 1.03) * s, 2.0 - droop * 1.3, 14.0], [0.1, 0, 0], 2.0);
      fissure(`fing${n}`, wid * 0.7, 0.38, 0.38, [(13.2 + o * 1.09) * s, 1.7 - droop * 1.9, 16.0], [0.16, 0, 0], 2.0);
    }

    // thumb: two blocks laid across the heel of the hand
    plate(`thumb${n}`, 2.8, 2.4, 3.0, [10.3 * s, 1.7, 11.0], [0.1, 0.34 * s, 0], BASALT);
    plate(`thumb${n}`, 2.3, 2.0, 2.6, [9.5 * s, 1.4, 13.0], [0.18, 0.48 * s, 0], GRANITE);
    shard(`thumb${n}`, 0.5, 1.7, [9.0 * s, 1.1, 14.2], [1.2, 0.5 * s, 0], OBSIDIAN);
    fissure(`thumb${n}`, 1.9, 0.42, 0.42, [9.9 * s, 1.9, 12.0], [0.14, 0.4 * s, 0], 2.0);
  }

  const mat = creatureMaterial({
    roughness: 0.94, metalness: 0.02,
    normalMap: organicNormal(), normalScale: 0.85, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 46 });
}

class TitanEnemy extends Enemy {
  override attackId!: any;
  override rig!: any;
  override staggerTime!: any;
  override state!: any;
  override stateTime!: any;
  override visual!: any;
  constructor(opts: any) { super(TITAN, opts); }

  /**
   * World-space centre of one palm — the fight code uses it to place the
   * shockwave, the embedded-fist damage volume and the climbable marker.
   * @param side -1 left, +1 right
   */
  handPoint(side: number, out = new THREE.Vector3()) {
    const b = this.rig && this.rig.byName.get(side < 0 ? 'handL' : 'handR');
    if (!b) return this.centre(out);
    b.updateWorldMatrix(true, false);
    return out.set(0, 0, 3.0).applyMatrix4(b.matrixWorld);
  }

  override pose(state: any, t: any) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n: any, x: any, y: any, z: any) => poseBone(rig, n, x, y, z);
    /** Swell or gutter the molten cores behind the fissures. */
    const core = (k: any) => {
      const a = rig.byName.get('coreC'), b = rig.byName.get('coreT');
      if (a) a.scale.setScalar(k);
      if (b) b.scale.setScalar(k);
    };
    /** Close a hand into a fist (k=1) or lay it flat open (k=0). */
    const grip = (n: any, k: any) => {
      S(`hand${n}`, 0.12 * k, 0, 0);
      S(`fing${n}`, 1.35 * k, 0, 0);
      S(`thumb${n}`, 0.95 * k, -0.4 * k, 0);
    };
    /** The arm at rest: hanging, braced, fingers loosely curled. */
    const rest = (n: any, s: any, k = 1) => {
      S(`sh${n}`, 0.04 * k, 0, -0.05 * k * s);
      S(`el${n}`, -0.06 * k, 0, 0);
      S(`wr${n}`, 0.04 * k, 0, 0);
      grip(n, 0.22 * k);
    };
    const id = this.attackId;
    core(1);

    switch (state) {
      case 'approach': {
        // He does not walk. He leans, and the arms take his weight while the
        // encounter code shunts the whole mountain across the arena.
        const sw = Math.sin(t * 0.55), tremor = Math.sin(t * 3.1) * 0.012;
        S('spineA', 0.07 + tremor, sw * 0.03, 0);
        S('spineB', 0.10 + tremor, sw * 0.04, 0);
        S('chest', 0.06, sw * 0.05, 0);
        S('neck', 0.03, sw * 0.06, 0);
        S('head', 0.07, Math.sin(t * 0.31) * 0.16, 0);
        S('jaw', 0.06 + Math.sin(t * 0.55) * 0.04, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`clav${n}`, -0.05, 0, 0.04 * s);
          S(`sh${n}`, 0.30 + sw * 0.05 * s, 0, -0.22 * s);
          S(`el${n}`, -0.34, 0, 0.10 * s);
          S(`wr${n}`, 0.28, 0, 0);
          grip(n, 0.05);
        }
        core(1 + sw * 0.06);
        this.visual.position.y = Math.abs(Math.sin(t * 1.15)) * 0.16;
        break;
      }

      case 'telegraph': {
        const k = Math.min(1, this.stateTime / Math.max(0.4, this._timing('telegraph') * 0.92));
        const e = k * k * (3 - 2 * k);
        if (id === 'roar') {
          // head thrown back, jaw dropped, the whole crust splitting open
          S('spineA', -0.06 * e, 0, 0);
          S('spineB', -0.10 * e, 0, 0);
          S('chest', -0.14 * e, 0, 0);
          S('neck', -0.34 * e, 0, 0);
          S('head', -0.30 * e, 0, 0);
          S('jaw', 0.90 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`clav${n}`, -0.12 * e, 0, 0.12 * e * s);
            S(`sh${n}`, -0.45 * e, 0, -0.55 * e * s);
            S(`el${n}`, -0.55 * e, 0, 0.2 * e * s);
            grip(n, 0);
          }
          core(1 + 0.55 * e);
        } else if (id === 'double') {
          // both fists hauled up together
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`clav${n}`, -0.18 * e, 0, 0.10 * e * s);
            S(`sh${n}`, -2.45 * e, -0.28 * e * s, -0.30 * e * s);
            S(`el${n}`, -1.05 * e, 0, 0);
            S(`wr${n}`, -0.35 * e, 0, 0);
            grip(n, e);
          }
          S('spineA', -0.06 * e, 0, 0);
          S('spineB', -0.10 * e, 0, 0);
          S('chest', -0.16 * e, 0, 0);
          S('head', 0.16 * e, 0, 0);
          S('jaw', 0.22 * e, 0, 0);
          core(1 + 0.32 * e);
          this.visual.position.y = 0.5 * e;
        } else if (id === 'sweep') {
          // the arm cocks all the way across the body, palm flat
          const s = 1, n = 'R';
          S(`clav${n}`, -0.10 * e, 0.30 * e, 0);
          S(`sh${n}`, -0.95 * e, 1.20 * e, -0.60 * e * s);
          S(`el${n}`, -0.55 * e, 0.25 * e, 0);
          S(`wr${n}`, -0.30 * e, 0, -0.55 * e);
          grip(n, 0);
          rest('L', -1);
          S('shL', 0.25 * e, 0, -0.30 * e);
          S('spineB', 0, -0.20 * e, 0);
          S('chest', -0.05 * e, -0.36 * e, 0);
          S('head', 0.05 * e, 0.30 * e, 0);
          core(1 + 0.18 * e);
        } else {
          // slam: the fist climbs up and back until it is out of frame
          const s = id === 'slam_l' ? -1 : 1;
          const n = s < 0 ? 'L' : 'R';
          const o = s < 0 ? 'R' : 'L';
          S(`clav${n}`, -0.20 * e, -0.12 * e * s, 0.12 * e * s);
          S(`sh${n}`, -2.60 * e, -0.50 * e * s, -0.48 * e * s);
          S(`el${n}`, -1.15 * e, 0, 0);
          S(`wr${n}`, -0.38 * e, 0, 0);
          grip(n, e);
          rest(o, -s);
          S(`sh${o}`, 0.26 * e, 0, -0.22 * e * -s);
          S('spineA', -0.04 * e, 0.08 * e * s, 0);
          S('spineB', -0.07 * e, 0.16 * e * s, 0);
          S('chest', -0.12 * e, 0.30 * e * s, 0);
          S('neck', 0.06 * e, -0.14 * e * s, 0);
          S('head', 0.12 * e, -0.20 * e * s, 0);
          S('jaw', 0.20 * e, 0, 0);
          core(1 + 0.28 * e);
          this.visual.position.y = 0.35 * e;
        }
        break;
      }

      case 'attack': {
        // `recover` maps here too, and that is deliberate: the fist stays
        // buried in the arena for the whole recovery. That hold is the fight.
        const held = this.state === 'recover';
        const strike = Math.max(0.12, this._timing('strike'));
        const d = held ? 1 : Math.min(1, this.stateTime / strike);
        const e = 1 - Math.pow(1 - d, 2.6);
        // the ground ringing after the impact
        const ring = held ? Math.exp(-this.stateTime * 2.6) * Math.sin(this.stateTime * 19) * 0.035 : 0;

        if (id === 'roar') {
          const b = Math.sin(this.stateTime * 7.5) * Math.exp(-this.stateTime * 0.8) * 0.05;
          S('spineA', -0.06 + 0.10 * e, 0, 0);
          S('spineB', -0.10 + 0.18 * e, 0, 0);
          S('chest', -0.14 + 0.26 * e + b, 0, 0);
          S('neck', -0.34 + 0.42 * e, 0, 0);
          S('head', -0.30 + 0.34 * e, 0, 0);
          S('jaw', 0.90 + 0.25 * e + b * 2, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`clav${n}`, -0.12 + 0.06 * e, 0, (0.12 - 0.04 * e) * s);
            S(`sh${n}`, -0.45 + 0.20 * e, 0, (-0.55 - 0.25 * e) * s);
            S(`el${n}`, -0.55 + 0.25 * e, 0, 0.2 * s);
            grip(n, 0);
          }
          core(1.55 + 0.35 * e - Math.min(0.7, this.stateTime * 0.16));
          this.visual.position.y = -0.25 * e + ring;
          break;
        }

        if (id === 'sweep') {
          // flat palm dragged clean across the arena at head height
          const n = 'R';
          S(`clav${n}`, -0.10 + 0.16 * e, 0.30 - 0.70 * e, 0);
          S(`sh${n}`, -0.95 + 0.32 * e, 1.20 - 2.55 * e, -0.60 + 0.28 * e);
          S(`el${n}`, -0.55 + 0.62 * e, 0.25 - 0.55 * e, 0);
          S(`wr${n}`, -0.30 + 0.28 * e, 0, -0.55 + 0.35 * e);
          grip(n, 0);
          rest('L', -1);
          S('shL', 0.25 - 0.15 * e, 0, -0.30 + 0.2 * e);
          S('spineB', 0, -0.20 + 0.42 * e, 0);
          S('chest', -0.05 + 0.10 * e, -0.36 + 0.80 * e, 0);
          S('head', 0.05 + 0.10 * e, 0.30 - 0.50 * e, 0);
          S('jaw', 0.18 * e, 0, 0);
          core(1 + 0.2 * (1 - e));
          this.visual.position.y = ring * 0.5;
          break;
        }

        if (id === 'double') {
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`clav${n}`, -0.18 + 0.28 * e, 0, (0.10 - 0.06 * e) * s);
            S(`sh${n}`, -2.45 + 3.28 * e + ring, (-0.28 + 0.28 * e) * s, (-0.30 + 0.34 * e) * s);
            S(`el${n}`, -1.05 + 0.86 * e, 0, 0);
            S(`wr${n}`, -0.35 + 0.82 * e, 0, 0);
            grip(n, 1);
          }
          S('spineA', -0.06 + 0.20 * e, 0, 0);
          S('spineB', -0.10 + 0.30 * e, 0, 0);
          S('chest', -0.16 + 0.38 * e, 0, 0);
          S('neck', 0.20 * e, 0, 0);
          S('head', 0.16 + 0.22 * e, 0, 0);
          S('jaw', 0.22 + 0.2 * e, 0, 0);
          core(1.3 - 0.2 * e);
          this.visual.position.y = 0.5 - 1.6 * e + ring * 8;
          break;
        }

        // slam_r / slam_l — drive it down and leave it there
        const s = id === 'slam_l' ? -1 : 1;
        const n = s < 0 ? 'L' : 'R';
        const o = s < 0 ? 'R' : 'L';
        S(`clav${n}`, -0.20 + 0.30 * e, (-0.12 + 0.12 * e) * s, (0.12 - 0.08 * e) * s);
        S(`sh${n}`, -2.60 + 3.42 * e + ring, (-0.50 + 0.50 * e) * s, (-0.48 + 0.54 * e) * s);
        S(`el${n}`, -1.15 + 0.92 * e, 0, 0);
        S(`wr${n}`, -0.38 + 0.88 * e, 0, 0);
        grip(n, 1);
        rest(o, -s, 1);
        S(`sh${o}`, 0.26 - 0.10 * e, 0, 0.22 * e * s);
        S('spineA', -0.04 + 0.16 * e, (0.08 - 0.10 * e) * s, 0);
        S('spineB', -0.07 + 0.26 * e, (0.16 - 0.22 * e) * s, 0);
        S('chest', -0.12 + 0.34 * e, (0.30 - 0.40 * e) * s, 0);
        S('neck', 0.06 + 0.14 * e, -0.14 * s, 0);
        S('head', 0.12 + 0.26 * e, (-0.20 + 0.14 * e) * s, 0);
        S('jaw', 0.20 + 0.18 * e, 0, 0);
        core(1.28 - 0.22 * e);
        this.visual.position.y = 0.35 - 0.92 * e + ring * 9;
        break;
      }

      case 'flinch': {
        // A mountain does not flinch. One pauldron shrugs, and that is all.
        const k = Math.exp(-this.stateTime * 8) * (1 - Math.min(1, this.stateTime / 0.35));
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          rest(n, s);
          S(`clav${n}`, -0.06 * k, 0, 0.05 * k * s);
        }
        S('clavR', -0.10 * k, 0, 0.09 * k);
        S('shR', 0.04 + 0.10 * k, 0, -0.05 - 0.06 * k);
        S('chest', 0.02 * k, -0.04 * k, 0);
        S('head', -0.05 * k, 0.05 * k, 0);
        core(1 + 0.05 * k);
        this.visual.position.y = 0;
        this.visual.rotation.z = 0;
        break;
      }

      case 'stagger': {
        // He sags forward onto one embedded hand, the head hangs, and the
        // fissures gutter down to embers. This is the only window on him.
        const inK = Math.min(1, this.stateTime / 1.0);
        const outK = Math.min(1, Math.max(0, this.staggerTime) / 0.9);
        const k = inK * inK * (3 - 2 * inK) * outK;
        const heave = Math.sin(this.stateTime * 1.6) * 0.02 * k;
        S('spineA', 0.17 * k + heave, 0.05 * k, 0.04 * k);
        S('spineB', 0.24 * k + heave, 0.08 * k, 0.06 * k);
        S('chest', 0.28 * k, 0.12 * k, 0.08 * k);
        S('neck', 0.32 * k, 0.10 * k, 0);
        S('head', 0.38 * k, 0.14 * k, 0.05 * k);
        S('jaw', 0.42 * k, 0, 0);
        S('clavR', 0.16 * k, 0, -0.12 * k);
        S('shR', 0.04 + 0.92 * k, -0.22 * k, -0.05 + 0.40 * k);
        S('elR', -0.06 - 0.62 * k, 0, 0);
        S('wrR', 0.04 + 0.58 * k, 0, 0);
        grip('R', 0.15);
        S('clavL', 0.06 * k, 0, 0.10 * k);
        S('shL', 0.04 + 0.42 * k, 0.16 * k, 0.05 + 0.24 * k);
        S('elL', -0.06 - 0.30 * k, 0, 0);
        S('wrL', 0.04 + 0.20 * k, 0, 0);
        grip('L', 0.1);
        core(1 - 0.7 * k);
        this.visual.position.y = -1.7 * k;
        this.visual.rotation.z = -0.05 * k;
        break;
      }

      case 'death': {
        // Four and a half seconds of a mountain going over.
        const k = Math.min(1, this.stateTime / 4.6);
        const e = k * k * (3 - 2 * k);
        const quake = Math.exp(-this.stateTime * 1.1) * Math.sin(this.stateTime * 5.5) * 0.05 * (1 - e);
        this.visual.rotation.x = e * 0.98;
        this.visual.rotation.z = -0.16 * e;
        this.visual.position.y = -4.2 * e;
        S('spineA', 0.22 * e + quake, 0.06 * e, 0.05 * e);
        S('spineB', 0.30 * e + quake, 0.10 * e, 0.08 * e);
        S('chest', 0.34 * e, 0.14 * e, 0.10 * e);
        S('neck', 0.40 * e, 0.10 * e, 0);
        S('head', 0.52 * e, 0.18 * e, 0.08 * e);
        S('jaw', 0.55 * e, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`clav${n}`, 0.12 * e, 0, 0.14 * e * s);
          S(`sh${n}`, 0.04 + 0.78 * e, 0.20 * e * s, -0.05 * s + 0.52 * e * s);
          S(`el${n}`, -0.06 - 0.48 * e, 0, 0);
          S(`wr${n}`, 0.04 + 0.34 * e, 0, 0);
          grip(n, 0.22 - 0.2 * e);
        }
        core(Math.max(0.02, 1 - e * 1.06));
        break;
      }

      default: {
        // Seismic breathing: a fifteen-second cycle. The chest courses lift
        // off the furnace on the inhale, the glow swells with them, and the
        // head grinds round to keep the target in the eye slots.
        const br = Math.sin(t * 0.42);
        const grind = Math.sin(t * 0.17);
        S('spineA', 0.012 * br, 0, 0);
        S('spineB', 0.020 + 0.032 * br, 0, 0);
        S('chest', -0.05 - 0.055 * br, 0, 0);
        S('neck', 0.02 * br, grind * 0.10, 0);
        S('head', -0.02 + 0.015 * br, grind * 0.30, 0);
        S('jaw', 0.05 + 0.045 * br, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`clav${n}`, -0.02 * br, 0, 0.03 * br * s);
          S(`sh${n}`, 0.04 + 0.035 * br, 0, -0.05 * s);
          S(`el${n}`, -0.06 - 0.02 * br, 0, 0);
          S(`wr${n}`, 0.04 + 0.03 * br, 0, 0);
          grip(n, 0.22 + 0.05 * br);
        }
        core(1 + 0.10 * br);
        this.visual.position.y = br * 0.14;
        this.visual.rotation.z = 0;
        break;
      }
    }
  }
}

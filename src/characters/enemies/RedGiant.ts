import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.ts';
import { Enemy, metalNormal, metalRoughness } from './EnemyBase.ts';
import {
  tube, blob, slab, spike, place, tint, glow, rectCross, loft, circleCross, bladeCross,
} from '../../combat/GeoKit.ts';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

const CHAR = 0x322c28;
const CHAR_DARK = 0x1c1917;
const CHAR_LIGHT = 0x4b423a;
const EMBER = 0x40120a;
const MOLTEN = 0xff8a1e;
const MOLTEN_HOT = 0xffd28a;
const BLADE = 0x504740;

/**
 * Red Giant — the Iron Giant's furnace-hot cousin.
 * The same five-and-a-half metre wall of plate, except the iron has burned
 * black and split along every seam, and what is underneath is still liquid.
 * Bull horns, a burning slit for a face, one flame-scarred greatsword. It is
 * slow, it is enormous, and it tells you about every swing a second early.
 */
export const RED_GIANT = {
  key: 'redgiant',
  questId: 'redgiant',
  faction: 'daemon',
  expClass: 'boss',
  stats: {
    name: 'Red Giant', hp: 22000, poise: 320, speed: 2.0, attackRange: 5.4,
    aggroRange: 42, radius: 1.6, height: 5.5, damage: 520, level: 50,
  },
  weakness: 'ice',
  resist: 'fire',
  resistPct: { light: 175, dark: 0, fire: 0, ice: 190, lightning: 130 },
  weakTo: ['greatsword', 'polearm'],
  senses: { sight: 42, fov: 1.6, hearing: 26, nocturnal: true },
  staggerDuration: 3.2,
  superArmour: true,
  drops: [
    { id: 'rotten_splinterbone', chance: 0.6, count: 2 },
    { id: 'fire_crystal', chance: 0.4, count: 1 },
  ],
  timing: { telegraph: 1.3, strike: 0.34, attack: 1.1, recover: 1.8 },
  attacks: [
    // a colossal two-hand chop straight down the centre line
    {
      id: 'cleave', range: 6.0, weight: 3, mult: 1.0, poise: 90, hitRadius: 4.4, arc: 1.2,
      telegraph: 1.3, strike: 0.34, attack: 1.15, recover: 1.9, cooldown: 4.0,
    },
    // a horizontal sweep that clears the whole arc in front of it
    {
      id: 'sweep', range: 6.6, weight: 3, mult: 0.9, poise: 80, hitRadius: 6.0, arc: 2.0,
      telegraph: 1.15, strike: 0.30, attack: 1.0, recover: 1.7, cooldown: 4.6,
    },
    // it plants the sword and the ground opens
    {
      id: 'eruption', range: 9.0, weight: 2, mult: 1.6, poise: 120, hitRadius: 7, arc: Math.PI,
      aoe: true, element: 'fire', telegraph: 2.0, strike: 0.45, attack: 1.4,
      recover: 2.2, cooldown: 12, unblockable: true,
    },
  ],
  buildPrototype,
  make(opts) { return new RedGiantEnemy(opts); },
};

/** A thin inset strip of molten light, for the cracks between the plates. */
function seam(w, h, d, pos, rot, heat = 2.6) {
  return glow(tint(place(slab(w, h, d, Math.min(w, h, d) * 0.2), { pos, rot }), EMBER), MOLTEN, heat);
}

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('pelvis', 'root', [0, 2.60, 0]);
  rig.bone('spine', 'pelvis', [0, 3.26, -0.05]);
  rig.bone('chest', 'spine', [0, 3.92, -0.05]);
  rig.bone('neck', 'chest', [0, 4.53, 0]);
  rig.bone('head', 'neck', [0, 4.81, 0.02]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`sh${n}`, 'chest', [0.80 * s, 4.36, 0]);
    rig.bone(`el${n}`, `sh${n}`, [1.04 * s, 3.38, 0.05]);
    rig.bone(`hd${n}`, `el${n}`, [1.07 * s, 2.46, 0.20]);
    rig.bone(`hp${n}`, 'pelvis', [0.43 * s, 2.55, 0]);
    rig.bone(`kn${n}`, `hp${n}`, [0.47 * s, 1.38, 0.06]);
    rig.bone(`ft${n}`, `kn${n}`, [0.47 * s, 0.22, -0.02]);
  }

  /* --- torso: blackened plate, split down every join --- */
  const core = loft(rectCross(0.32, 16), [
    { y: 2.38, sx: 0.47, sz: 0.35 },
    { y: 3.00, sx: 0.51, sz: 0.37 },
    { y: 3.62, sx: 0.68, sz: 0.43 },
    { y: 4.18, sx: 0.74, sz: 0.45 },
    { y: 4.50, sx: 0.51, sz: 0.35 },
  ]);
  rig.attachBlend(tint(core, CHAR, 0.04), 'pelvis', 'chest', 1.5);

  const breast = place(slab(1.34, 0.92, 0.74, 0.12), { pos: [0, 4.02, 0.02] });
  rig.attach(tint(breast, CHAR_LIGHT, 0.05), 'chest');
  const abdo = place(slab(0.94, 0.64, 0.62, 0.08), { pos: [0, 3.24, 0] });
  rig.attach(tint(abdo, CHAR, 0.05), 'spine');
  const belt = place(slab(1.12, 0.31, 0.74, 0.06), { pos: [0, 2.67, 0] });
  rig.attach(tint(belt, CHAR_DARK), 'pelvis');
  for (const s of [-1, 1]) {
    const tass = place(slab(0.43, 0.92, 0.16, 0.04), { pos: [0.31 * s, 2.14, 0.29], rot: [0.18, 0, 0.06 * s] });
    rig.attach(tint(tass, CHAR, 0.05), 'pelvis');
  }
  const tassB = place(slab(0.92, 0.87, 0.16, 0.05), { pos: [0, 2.16, -0.33], rot: [-0.14, 0, 0] });
  rig.attach(tint(tassB, CHAR, 0.05), 'pelvis');

  /* --- the furnace: the plate has cracked open and it never closed --- */
  // a vertical split down the sternum, widening as it goes
  rig.attach(seam(0.085, 1.05, 0.06, [0, 4.02, 0.40], null, 3.6), 'chest');
  rig.attach(seam(0.16, 0.16, 0.07, [0, 4.42, 0.40], [0, 0, Math.PI * 0.25], 4.4), 'chest');
  // ribs of light branching off it
  for (let i = 0; i < 3; i++) {
    const y = 3.86 + i * 0.20;
    const w = 0.62 - i * 0.10;
    rig.attach(seam(w, 0.05, 0.05, [0, y, 0.40], [0, 0, 0.16], 2.2 + i * 0.5), 'chest');
    rig.attach(seam(w, 0.05, 0.05, [0, y, 0.40], [0, 0, -0.16], 2.2 + i * 0.5), 'chest');
  }
  // the gut seams, where the plate has sprung apart worst
  for (let i = 0; i < 4; i++) {
    rig.attach(seam(0.82 - i * 0.11, 0.06, 0.05, [0, 3.02 + i * 0.16, 0.33], null, 1.6 + i * 0.5), 'spine');
  }
  rig.attach(seam(0.05, 0.66, 0.05, [0, 3.24, 0.33], null, 2.4), 'spine');
  // and down the back
  rig.attach(seam(0.07, 1.30, 0.06, [0, 3.60, -0.40], null, 1.8), 'spine');
  rig.attach(seam(1.00, 0.05, 0.05, [0, 2.68, -0.38], null, 1.4), 'pelvis');

  /* --- head: bull-horned helm, faceless but for the burning slit --- */
  const neck = place(loft(circleCross(9), [{ y: 4.44, sx: 0.21 }, { y: 4.68, sx: 0.20 }]), {});
  rig.attachBlend(tint(neck, CHAR_DARK), 'chest', 'head', 1.0);
  rig.attach(seam(0.30, 0.05, 0.05, [0, 4.56, 0.20], null, 2.0), 'chest');

  const helm = place(slab(0.64, 0.64, 0.68, 0.12), { pos: [0, 4.90, 0.02] });
  rig.attach(tint(helm, CHAR_LIGHT, 0.04), 'head');
  const brow = place(slab(0.68, 0.17, 0.25, 0.04), { pos: [0, 4.86, 0.31], rot: [0.24, 0, 0] });
  rig.attach(tint(brow, CHAR_DARK), 'head');
  const jawPlate = place(slab(0.48, 0.25, 0.35, 0.05), { pos: [0, 4.61, 0.19] });
  rig.attach(tint(jawPlate, CHAR, 0.04), 'head');
  const slit = place(slab(0.46, 0.085, 0.06, 0.015), { pos: [0, 4.755, 0.345] });
  rig.attach(glow(tint(slit, EMBER), MOLTEN_HOT, 5.6), 'head');
  const crest = place(slab(0.10, 0.44, 0.62, 0.03), { pos: [0, 5.21, -0.02] });
  rig.attach(tint(crest, CHAR_DARK), 'head');
  rig.attach(seam(0.05, 0.36, 0.05, [0, 5.21, 0.28], null, 2.0), 'head');

  // bull horns: out, forward, then up
  for (const s of [-1, 1]) {
    const horn = tube([
      P(0.28 * s, 5.02, -0.04), P(0.60 * s, 5.02, 0.02),
      P(0.86 * s, 5.10, 0.22), P(0.94 * s, 5.42, 0.34), P(0.94 * s, 5.62, 0.30),
    ], [0.15, 0.13, 0.10, 0.065, 0.012], { radialSeg: 7 });
    rig.attach(tint(horn, CHAR_DARK, 0.04), 'head');
    const root = place(blob(0.16, 0.13, 0.16, 7, 5), { pos: [0.28 * s, 5.00, -0.02] });
    rig.attach(tint(root, CHAR_LIGHT, 0.04), 'head');
    const cheek = place(spike(0.075, 0.42, 5), { pos: [0.31 * s, 4.70, 0.12], rot: [0.2, 0, 1.35 * s] });
    rig.attach(tint(cheek, CHAR_DARK), 'head');
  }

  /* --- arms: plate over a molten interior --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const pauldron = place(slab(0.80, 0.68, 0.88, 0.10), { pos: [0.92 * s, 4.42, 0], rot: [0, 0, -0.22 * s] });
    rig.attach(tint(pauldron, CHAR_LIGHT, 0.05), `sh${n}`);
    for (let i = 0; i < 3; i++) {
      const sp = place(spike(0.08, 0.32, 5), { pos: [(1.08 + i * 0.02) * s, 4.60 - i * 0.25, -0.02], rot: [0, 0, 1.25 * s] });
      rig.attach(tint(sp, CHAR_DARK), `sh${n}`);
    }
    // the shoulder joint has burst its seal
    rig.attach(seam(0.06, 0.52, 0.06, [1.16 * s, 4.42, 0.14], [0, 0, -0.22 * s], 3.0), `sh${n}`);
    rig.attach(seam(0.52, 0.06, 0.06, [0.92 * s, 4.12, 0.16], null, 2.4), `sh${n}`);

    const upArm = tube([P(0.82 * s, 4.30, 0), P(0.96 * s, 3.82, 0.02), P(1.04 * s, 3.42, 0.05)],
      [0.31, 0.28, 0.23], { radialSeg: 9 });
    rig.attachBlend(tint(upArm, CHAR, 0.05), `sh${n}`, `el${n}`, 1.0);
    rig.attach(seam(0.05, 0.72, 0.05, [0.98 * s, 3.86, 0.28], [0, 0, 0.14 * s], 2.2), `sh${n}`);

    const elbow = place(slab(0.46, 0.38, 0.46, 0.07), { pos: [1.04 * s, 3.36, 0.05] });
    rig.attach(tint(elbow, CHAR_LIGHT, 0.04), `el${n}`);
    rig.attach(seam(0.44, 0.06, 0.06, [1.04 * s, 3.36, 0.28], null, 3.2), `el${n}`);

    const loArm = tube([P(1.04 * s, 3.32, 0.06), P(1.06 * s, 2.89, 0.13), P(1.07 * s, 2.50, 0.20)],
      [0.245, 0.24, 0.205], { radialSeg: 9 });
    rig.attachBlend(tint(loArm, CHAR, 0.05), `el${n}`, `hd${n}`, 1.0);
    const vamb = place(slab(0.52, 0.74, 0.52, 0.07), { pos: [1.06 * s, 2.91, 0.14] });
    rig.attach(tint(vamb, CHAR_LIGHT, 0.04), `el${n}`);
    rig.attach(seam(0.06, 0.58, 0.06, [1.33 * s, 2.91, 0.14], null, 2.6), `el${n}`);
    rig.attach(seam(0.06, 0.58, 0.06, [1.06 * s, 2.91, 0.41], null, 2.6), `el${n}`);

    const fist = place(slab(0.46, 0.48, 0.42, 0.09), { pos: [1.07 * s, 2.36, 0.24] });
    rig.attach(tint(fist, CHAR_DARK, 0.04), `hd${n}`);
    rig.attach(seam(0.38, 0.05, 0.05, [1.07 * s, 2.36, 0.46], null, 2.8), `hd${n}`);
  }

  /* --- legs --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const thigh = tube([P(0.43 * s, 2.55, 0), P(0.45 * s, 1.96, 0.04), P(0.47 * s, 1.43, 0.06)],
      [0.35, 0.32, 0.26], { radialSeg: 9 });
    rig.attachBlend(tint(thigh, CHAR, 0.05), `hp${n}`, `kn${n}`, 1.0);
    const thighP = place(slab(0.60, 0.94, 0.58, 0.08), { pos: [0.44 * s, 2.02, 0.03] });
    rig.attach(tint(thighP, CHAR_LIGHT, 0.04), `hp${n}`);
    rig.attach(seam(0.05, 0.80, 0.05, [0.44 * s, 2.02, 0.33], null, 2.0), `hp${n}`);
    rig.attach(seam(0.50, 0.06, 0.06, [0.44 * s, 2.52, 0.16], null, 2.4), `hp${n}`);

    const knee = place(slab(0.52, 0.42, 0.52, 0.08), { pos: [0.47 * s, 1.37, 0.10] });
    rig.attach(tint(knee, CHAR_DARK), `kn${n}`);
    rig.attach(seam(0.46, 0.06, 0.06, [0.47 * s, 1.37, 0.37], null, 3.2), `kn${n}`);

    const shin = tube([P(0.47 * s, 1.33, 0.05), P(0.47 * s, 0.82, 0.02), P(0.47 * s, 0.33, -0.01)],
      [0.26, 0.24, 0.21], { radialSeg: 9 });
    rig.attachBlend(tint(shin, CHAR, 0.05), `kn${n}`, `ft${n}`, 1.0);
    const shinP = place(slab(0.48, 0.82, 0.50, 0.07), { pos: [0.47 * s, 0.84, 0.06] });
    rig.attach(tint(shinP, CHAR_LIGHT, 0.04), `kn${n}`);
    rig.attach(seam(0.05, 0.66, 0.05, [0.47 * s, 0.84, 0.32], null, 1.8), `kn${n}`);

    const foot = place(slab(0.54, 0.29, 1.02, 0.07), { pos: [0.47 * s, 0.16, 0.18] });
    rig.attach(tint(foot, CHAR_DARK, 0.04), `ft${n}`);
    for (let i = -1; i <= 1; i++) {
      const claw = place(spike(0.075, 0.25, 5), { pos: [(0.47 + i * 0.16) * s, 0.10, 0.70], rot: [1.45, 0, 0] });
      rig.attach(tint(claw, CHAR_LIGHT), `ft${n}`);
    }
    rig.attach(seam(0.44, 0.05, 0.05, [0.47 * s, 0.05, 0.30], null, 1.6), `ft${n}`);
  }

  /* --- the greatsword: flame-scarred, and heavier than the giant is --- */
  const swordParts = [];
  const grip = place(loft(circleCross(8), [{ y: 0, sx: 0.08 }, { y: 0.95, sx: 0.075 }]),
    { pos: [1.07, 1.86, 0.28] });
  swordParts.push(tint(grip, CHAR_DARK));
  const cross = place(slab(1.05, 0.18, 0.26, 0.04), { pos: [1.07, 2.84, 0.28] });
  swordParts.push(tint(cross, CHAR_LIGHT, 0.04));
  for (const s of [-1, 1]) {
    const quill = place(spike(0.055, 0.24, 5), { pos: [1.07 + 0.52 * s, 2.84, 0.28], rot: [0, 0, -1.35 * s] });
    swordParts.push(tint(quill, CHAR_DARK));
  }
  const bl = place(loft(bladeCross(12), [
    { y: 0.00, sx: 0.36, sz: 0.08 },
    { y: 0.58, sx: 0.44, sz: 0.085 },
    { y: 2.80, sx: 0.39, sz: 0.075 },
    { y: 3.60, sx: 0.26, sz: 0.052 },
    { y: 4.00, sx: 0.05, sz: 0.02 },
  ]), { pos: [1.07, 2.92, 0.28] });
  swordParts.push(tint(bl, BLADE, 0.07));
  // the fuller still glows from whatever forged it
  const fuller = place(loft(rectCross(0.4, 8), [
    { y: 0.32, sx: 0.055, sz: 0.10 }, { y: 3.35, sx: 0.038, sz: 0.09 },
  ]), { pos: [1.07, 2.92, 0.28] });
  swordParts.push(glow(tint(fuller, EMBER), MOLTEN, 2.4));
  // scars burned across the flat of the blade
  for (let i = 0; i < 4; i++) {
    const scar = place(slab(0.52, 0.045, 0.19, 0.01),
      { pos: [1.07, 3.50 + i * 0.62, 0.28], rot: [0, 0, 0.42 - (i % 2) * 0.84] });
    swordParts.push(glow(tint(scar, EMBER), MOLTEN, 1.1 + i * 0.3));
  }
  const pommel = place(blob(0.13, 0.13, 0.13, 8, 6), { pos: [1.07, 1.79, 0.28] });
  swordParts.push(tint(pommel, CHAR_LIGHT));
  for (const g of swordParts) rig.attach(g, 'hdR');

  const mat = creatureMaterial({
    roughness: 0.66, metalness: 0.35,
    rim: { color: 0xb06a34, strength: 0.06 },
    normalMap: metalNormal(), normalScale: 0.26, roughnessMap: metalRoughness(),
  });
  return rig.build(mat, { radius: 7.0 });
}

class RedGiantEnemy extends Enemy {
  constructor(opts) { super(RED_GIANT, opts); }

  /** World-space sword tip, for sweep hit tests and the fire trail. */
  swordTip(out = new THREE.Vector3()) {
    const b = this.rig && this.rig.byName.get('hdR');
    if (!b) return this.centre(out);
    b.updateWorldMatrix(true, false);
    return out.set(0.0, 4.62, 0.0).applyMatrix4(b.matrixWorld);
  }

  pose(state, t) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n, x, y, z) => poseBone(rig, n, x, y, z);
    // sword resting point-down at the right side, left hand loose
    const carry = (k = 1) => {
      S('shR', 0.34 * k, 0, -0.30 * k);
      S('elR', -0.52 * k, 0, 0);
      S('hdR', -0.34 * k, 0, 0);
      S('shL', 0.14 * k, 0, -0.22 * k);
      S('elL', -0.44 * k, 0, 0);
    };

    switch (state) {
      case 'approach':
      case 'walk': {
        // slow, and the whole mass rolls side to side over each foot
        const ph = t * 2.5;
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          const o = s < 0 ? 0 : Math.PI;
          S(`hp${n}`, Math.sin(ph + o) * 0.44, 0, 0);
          S(`kn${n}`, 0.12 + Math.max(0, Math.sin(ph + o + 1.4)) * 0.72, 0, 0);
          S(`ft${n}`, -0.10 - Math.sin(ph + o) * 0.22, 0, 0);
        }
        carry(1);
        S('shL', 0.14 - Math.sin(ph) * 0.32, 0, -0.22);
        S('shR', 0.34 + Math.sin(ph) * 0.18, 0, -0.30);
        S('spine', 0.06, Math.sin(ph) * 0.08, 0);
        S('chest', 0.03, -Math.sin(ph) * 0.11, 0);
        S('head', 0.05, Math.sin(ph * 0.5) * 0.07, 0);
        this.visual.position.y = Math.abs(Math.sin(ph)) * 0.10;
        this.visual.rotation.z = Math.sin(ph) * 0.035;
        break;
      }
      case 'telegraph': {
        const id = this.attackId;
        if (id === 'sweep') {
          // wind the blade all the way behind the far shoulder
          const k = Math.min(1, this.stateTime / 1.05);
          const e = k * k * (3 - 2 * k);
          S('shR', 0.34 - 0.95 * e, -1.55 * e, -0.30 - 0.55 * e);
          S('elR', -0.52 - 0.70 * e, 0, 0);
          S('hdR', -0.34 + 0.30 * e, 0, 0);
          S('shL', 0.14 - 0.65 * e, -0.95 * e, -0.22 - 0.40 * e);
          S('elL', -0.44 - 0.90 * e, 0, 0);
          S('spine', 0.06 - 0.10 * e, -0.62 * e, 0);
          S('chest', 0.03 - 0.10 * e, -0.55 * e, 0);
          S('head', 0.05, -0.40 * e, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, (s < 0 ? -0.20 : 0.28) * e, 0, 0);
            S(`kn${n}`, 0.36 * e, 0, 0);
            S(`ft${n}`, -0.18 * e, 0, 0);
          }
          this.visual.position.y = -0.10 * e;
          this.visual.rotation.z = 0;
        } else if (id === 'eruption') {
          // two full seconds: it raises the sword in both hands over the ground
          const k = Math.min(1, this.stateTime / 1.85);
          const e = k * k * (3 - 2 * k);
          const shudder = Math.sin(t * 12) * 0.02 * e;
          S('shR', 0.34 - 2.30 * e + shudder, -0.20 * e, -0.30 + 0.30 * e);
          S('elR', -0.52 - 0.40 * e, 0, 0);
          S('hdR', -0.34 + 0.15 * e, 0, 0);
          S('shL', 0.14 - 2.05 * e, 0.55 * e, -0.22 + 0.20 * e);
          S('elL', -0.44 - 0.75 * e, 0, 0);
          S('spine', 0.06 - 0.32 * e, 0, 0);
          S('chest', 0.03 - 0.26 * e, 0, 0);
          S('head', 0.05 + 0.30 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, -0.28 * e, 0, 0.10 * s * e);
            S(`kn${n}`, 0.50 * e, 0, 0);
            S(`ft${n}`, -0.22 * e, 0, 0);
          }
          this.visual.position.y = 0.12 * e;
          this.visual.rotation.z = 0;
        } else {
          // cleave: the sword goes all the way overhead and hangs there
          const k = Math.min(1, this.stateTime / 1.15);
          const e = k * k * (3 - 2 * k);
          S('shR', 0.34 - 3.50 * e, -0.34 * e, -0.30 + 0.56 * e);
          S('elR', -0.52 - 0.78 * e, 0, 0);
          S('hdR', -0.34 + 0.26 * e, 0, 0);
          S('shL', 0.14 - 1.25 * e, 0.42 * e, -0.22);
          S('elL', -0.44 - 0.85 * e, 0, 0);
          S('spine', -0.24 * e, -0.28 * e, 0);
          S('chest', -0.20 * e, -0.20 * e, 0);
          S('head', 0.12 * e, 0.20 * e, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, (s < 0 ? 0.36 : -0.22) * e, 0, 0);
            S(`kn${n}`, 0.44 * e, 0, 0);
            S(`ft${n}`, -0.20 * e, 0, 0);
          }
          this.visual.position.y = 0;
          this.visual.rotation.z = 0;
        }
        break;
      }
      case 'attack': {
        const id = this.attackId;
        if (id === 'sweep') {
          const k = Math.min(1, this.stateTime / 0.38);
          const e = 1 - Math.pow(1 - k, 2.8);
          S('shR', -0.61 + 0.30 * e, -1.55 + 2.95 * e, -0.85 + 0.75 * e);
          S('elR', -1.22 + 0.60 * e, 0, 0);
          S('hdR', -0.04 - 0.20 * e, 0, 0);
          S('shL', -0.51 + 0.35 * e, -0.95 + 1.75 * e, -0.62 + 0.50 * e);
          S('elL', -1.34 + 0.70 * e, 0, 0);
          S('spine', -0.04, -0.62 + 1.35 * e, 0);
          S('chest', -0.07, -0.55 + 1.15 * e, 0);
          S('head', 0.05, -0.40 + 0.75 * e, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, (s < 0 ? -0.20 : 0.28) * (1 - e) - 0.16 * e, 0, 0);
            S(`kn${n}`, 0.36 + 0.24 * e, 0, 0);
            S(`ft${n}`, -0.18 - 0.10 * e, 0, 0);
          }
          this.visual.position.y = -0.10 - 0.14 * e;
        } else if (id === 'eruption') {
          // the sword is driven into the ground and held there
          const k = Math.min(1, this.stateTime / 0.5);
          const e = 1 - Math.pow(1 - k, 3.4);
          const shake = Math.sin(t * 34) * 0.02 * Math.max(0, 1 - this.stateTime / 1.2) * e;
          S('shR', -1.96 + 3.05 * e + shake, -0.20 + 0.20 * e, 0.0);
          S('elR', -0.92 + 0.62 * e, 0, 0);
          S('hdR', -0.19 - 0.28 * e, 0, 0);
          S('shL', -1.91 + 2.75 * e, 0.55 - 0.55 * e, -0.02);
          S('elL', -1.19 + 0.85 * e, 0, 0);
          S('spine', -0.26 + 0.86 * e, 0, 0);
          S('chest', -0.23 + 0.66 * e, 0, 0);
          S('head', 0.35 - 0.55 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, -0.28 - 0.42 * e, 0, 0.10 * s);
            S(`kn${n}`, 0.50 + 0.72 * e, 0, 0);
            S(`ft${n}`, -0.22 - 0.28 * e, 0, 0);
          }
          this.visual.position.y = 0.12 - 0.66 * e;
        } else {
          // cleave: everything comes down at once
          const k = Math.min(1, this.stateTime / 0.36);
          const e = 1 - Math.pow(1 - k, 3.2);
          S('shR', -3.16 + 3.95 * e, -0.34 + 0.34 * e, 0.26 - 0.16 * e);
          S('elR', -1.30 + 0.86 * e, 0, 0);
          S('hdR', -0.08 - 0.30 * e, 0, 0);
          S('shL', -1.11 + 0.95 * e, 0.42, -0.22);
          S('elL', -1.29 + 0.62 * e, 0, 0);
          S('spine', -0.24 + 0.66 * e, -0.28 + 0.36 * e, 0);
          S('chest', -0.20 + 0.52 * e, -0.20 + 0.26 * e, 0);
          S('head', 0.12 - 0.32 * e, 0.20 - 0.22 * e, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, (s < 0 ? 0.36 : -0.22) * (1 - e) - 0.32 * e, 0, 0);
            S(`kn${n}`, 0.44 + 0.38 * e, 0, 0);
            S(`ft${n}`, -0.20 - 0.16 * e, 0, 0);
          }
          this.visual.position.y = -0.40 * e;
        }
        this.visual.rotation.z = 0;
        break;
      }
      case 'flinch': {
        // superArmoured: almost nothing gets through, just a shift of weight
        const k = Math.exp(-this.stateTime * 9) * (1 - Math.min(1, this.stateTime / 0.3));
        carry(1);
        S('spine', 0.06 + 0.14 * k, 0.10 * k, 0);
        S('chest', 0.03 + 0.10 * k, 0, 0.07 * k);
        S('head', -0.18 * k, 0.13 * k, 0);
        this.visual.position.y = 0;
        this.visual.rotation.z = 0.03 * k;
        break;
      }
      case 'stagger': {
        // down on one knee, sword planted, seams wide open — the window
        const k = Math.min(1, this.stateTime / 0.4) * Math.max(0, 1 - this.stateTime / 3.2);
        S('spine', 0.52 * k, 0.18 * k, 0);
        S('chest', 0.36 * k, 0, 0.18 * k);
        S('head', -0.55 * k, 0.22 * k, 0);
        S('shR', 0.34 + 0.50 * k, 0, -0.30 + 0.60 * k);
        S('elR', -0.52 - 0.30 * k, 0, 0);
        S('hdR', -0.34 - 0.20 * k, 0, 0);
        S('shL', 0.14 + 0.55 * k, 0, -0.22 - 0.75 * k);
        S('elL', -0.44 - 0.30 * k, 0, 0);
        S('hpL', -1.15 * k, 0, 0); S('knL', 1.70 * k, 0, 0); S('ftL', -0.55 * k, 0, 0);
        S('hpR', -0.40 * k, 0, 0); S('knR', 0.85 * k, 0, 0); S('ftR', -0.45 * k, 0, 0);
        this.visual.position.y = -0.85 * k;
        this.visual.rotation.z = 0.06 * k;
        break;
      }
      case 'death': {
        // it goes over like a felled tower, slowly
        const k = Math.min(1, this.stateTime / 1.8);
        const e = 1 - Math.pow(1 - k, 2.2);
        this.visual.rotation.x = e * 1.35;
        this.visual.rotation.z = e * 0.18;
        this.visual.position.y = -1.6 * e;
        S('spine', -0.28 * e, 0, 0);
        S('chest', -0.20 * e, 0, 0);
        S('head', 0.55 * e, 0, 0);
        S('shR', 1.05 * e, 0, 0.85 * e);
        S('elR', -0.45 * e, 0, 0);
        S('shL', 1.05 * e, 0, -0.85 * e);
        S('elL', -0.40 * e, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, -0.95 * e, 0, 0); S(`kn${n}`, 1.45 * e, 0, 0); S(`ft${n}`, -0.35 * e, 0, 0);
        }
        break;
      }
      default: {
        // idle: a furnace ticking over — long, slow breaths
        const b = Math.sin(t * 0.7) * 0.032;
        carry(1);
        S('spine', 0.05 + b, 0, 0);
        S('chest', 0.02 + b * 0.5, 0, 0);
        S('head', 0.06, Math.sin(t * 0.28) * 0.14, 0);
        S('shR', 0.34 + b * 0.5, 0, -0.30);
        S('shL', 0.14 + b * 0.6, 0, -0.22);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, 0.04, 0, 0); S(`kn${n}`, 0.10, 0, 0); S(`ft${n}`, -0.08, 0, 0);
        }
        this.visual.position.y = 0.02 + b * 0.6;
        this.visual.rotation.z = 0;
        break;
      }
    }
  }
}

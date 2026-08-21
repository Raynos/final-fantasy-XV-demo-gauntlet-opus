import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.ts';
import { Enemy, metalNormal, metalRoughness, weatherPlate } from './EnemyBase.ts';
import {
  tube, blob, slab, spike, place, tint, glow, rectCross, loft, circleCross, bladeCross,
} from '../../combat/GeoKit.ts';

const P = (x: any, y: any, z: any) => new THREE.Vector3(x, y, z);

/* Albedo, and it was charcoal: PLATE at 0x33383f is 3.9% linear reflectance
 * and JOINT at 0x14161a is 0.9% — darker than any real surface outside a
 * light trap. Measured area-weighted mean over the whole roster, this species
 * sat at 0.035 while the Leide ground it fights on is 0.20-0.30, so it read
 * as a black cut-out with a red slit at every distance and every hour. The
 * ladder below keeps the same *relationships* and moves the whole thing up to
 * where weathered painted steel actually sits (0.10-0.18). */
const PLATE = 0x5d6772;
const PLATE_DARK = 0x363c44;
const JOINT = 0x2b2f35;
const TRIM = 0x8b939d;
const SCUFF = 0x8a7f70;      // paint scoured back to warm bare steel
const MAGITEK = 0xff2f12;

/**
 * Imperial Magitek Axeman — the heavy of the MT line.
 * The same skeletal trooper chassis, but slabbed over with enormous squared
 * pauldrons and a reinforced chest cowl until it stands a head taller than
 * the infantry it walks beside. Carries a two-handed magitek battle-axe
 * whose bit is split by a burning red energy edge. Slow, telegraphed, and
 * ruinous if it connects.
 */
export const IMPERIAL_AXEMAN = {
  key: 'axeman',
  questId: 'imperial_axeman',
  faction: 'imperial',
  expClass: 'normal',
  stats: {
    name: 'Magitek Axeman', hp: 2400, poise: 90, speed: 2.6, attackRange: 3.2,
    aggroRange: 30, radius: 0.55, height: 2.25, damage: 220, level: 24,
  },
  weakness: 'lightning',
  resist: 'fire',
  resistPct: { lightning: 170, fire: 55, ice: 100, dark: 100, light: 100 },
  weakTo: ['polearm'],
  senses: { sight: 32, fov: 1.5, hearing: 14 },
  drops: [
    { id: 'magitek_booster', chance: 0.4, count: 1 },
    { id: 'debased_silver', chance: 0.3, count: 1 },
  ],
  timing: { telegraph: 0.95, strike: 0.28, attack: 0.9, recover: 1.2 },
  attacks: [
    {
      id: 'cleave', range: 3.4, weight: 3, mult: 1.0, poise: 40, hitRadius: 2.8, arc: 1.1,
      telegraph: 1.05, strike: 0.30, attack: 0.88, recover: 1.15, cooldown: 1.9,
    },
    {
      id: 'spin', range: 3.6, weight: 2, mult: 0.9, poise: 48, hitRadius: 3.4, arc: Math.PI,
      aoe: true, telegraph: 0.85, strike: 0.30, attack: 1.10, recover: 1.35, cooldown: 3.4,
    },
    {
      id: 'charge_slam', range: 9.0, minRange: 4.0, weight: 2, mult: 1.45, poise: 62,
      hitRadius: 3.0, arc: 1.0, telegraph: 1.1, strike: 0.32, attack: 1.0, recover: 1.5,
      cooldown: 4.5, lunge: 7, tracking: 0.7, unblockable: true,
    },
  ],
  buildPrototype,
  make(opts: any) { return new AxemanEnemy(opts); },
};

/**
 * `tint` plus the shared field-wear pass, so a plate is not one flat number.
 * @param geo @param hex
 * @param [jitter] @param [amount] 0 leaves the part alone
 */
function wtint(geo: THREE.BufferGeometry, hex: number, jitter: number = 0, amount: number = 1) {
  return weatherPlate(tint(geo, hex, jitter), { scuff: SCUFF, amount });
}

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('pelvis', 'root', [0, 1.05, 0]);
  rig.bone('spine', 'pelvis', [0, 1.34, 0]);
  rig.bone('chest', 'spine', [0, 1.62, 0]);
  rig.bone('neck', 'chest', [0, 1.87, 0]);
  rig.bone('head', 'neck', [0, 2.01, 0.01]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`sh${n}`, 'chest', [0.30 * s, 1.77, 0]);
    rig.bone(`el${n}`, `sh${n}`, [0.38 * s, 1.37, 0.02]);
    rig.bone(`hd${n}`, `el${n}`, [0.38 * s, 1.04, 0.10]);
    rig.bone(`hp${n}`, 'pelvis', [0.16 * s, 1.03, 0]);
    rig.bone(`kn${n}`, `hp${n}`, [0.17 * s, 0.57, 0.03]);
    rig.bone(`ft${n}`, `kn${n}`, [0.17 * s, 0.09, -0.01]);
  }

  /* --- torso: the trooper chassis, thickened and cowled --- */
  const core = loft(rectCross(0.30, 14), [
    { y: 0.96, sx: 0.180, sz: 0.130 },
    { y: 1.26, sx: 0.195, sz: 0.140 },
    { y: 1.56, sx: 0.245, sz: 0.165 },
    { y: 1.80, sx: 0.215, sz: 0.145 },
  ]);
  rig.attachBlend(wtint(core, PLATE_DARK, 0.03), 'pelvis', 'chest', 1.4);

  // reinforced chest cowl: a deep squared breastplate with a raised collar
  const breast = place(slab(0.54, 0.40, 0.34, 0.05), { pos: [0, 1.60, 0.01] });
  rig.attach(wtint(breast, PLATE, 0.03), 'chest');
  const cowl = place(slab(0.62, 0.22, 0.40, 0.05), { pos: [0, 1.82, -0.01] });
  rig.attach(wtint(cowl, PLATE_DARK, 0.03), 'chest');
  for (const s of [-1, 1]) {
    const wing = place(slab(0.15, 0.28, 0.34, 0.03), { pos: [0.30 * s, 1.72, 0.01], rot: [0, 0, -0.30 * s] });
    rig.attach(wtint(wing, PLATE, 0.03), 'chest');
  }
  const gorget = place(slab(0.30, 0.10, 0.24, 0.03), { pos: [0, 1.92, 0.0] });
  rig.attach(wtint(gorget, JOINT), 'chest');
  const abdo = place(slab(0.38, 0.26, 0.26, 0.04), { pos: [0, 1.34, 0.0] });
  rig.attach(wtint(abdo, PLATE, 0.03), 'spine');
  const belt = place(slab(0.44, 0.13, 0.30, 0.03), { pos: [0, 1.10, 0] });
  rig.attach(wtint(belt, PLATE_DARK), 'pelvis');
  const skirtF = place(slab(0.34, 0.26, 0.06, 0.02), { pos: [0, 0.94, 0.16], rot: [0.16, 0, 0] });
  rig.attach(wtint(skirtF, PLATE), 'pelvis');
  const skirtB = place(slab(0.34, 0.26, 0.06, 0.02), { pos: [0, 0.94, -0.16], rot: [-0.16, 0, 0] });
  rig.attach(wtint(skirtB, PLATE), 'pelvis');

  // magitek furnace behind the plate
  const coreGlow = place(slab(0.14, 0.14, 0.07, 0.02), { pos: [0, 1.62, 0.185] });
  rig.attach(glow(wtint(coreGlow, 0x3a0d05), MAGITEK, 3.0), 'chest');
  for (let i = 0; i < 3; i++) {
    const vent = place(slab(0.24, 0.02, 0.03, 0.005), { pos: [0, 1.40 + i * 0.05, 0.145] });
    rig.attach(glow(wtint(vent, 0x2a0a04), MAGITEK, 1.6), 'spine');
  }
  // back power unit, twinned with the trooper's
  const pack = place(slab(0.34, 0.34, 0.18, 0.035), { pos: [0, 1.58, -0.21] });
  rig.attach(wtint(pack, PLATE_DARK, 0.03), 'chest');
  for (const s of [-1, 1]) {
    const st = place(loft(circleCross(8), [{ y: 0, sx: 0.042 }, { y: 0.34, sx: 0.034 }]),
      { pos: [0.105 * s, 1.64, -0.29], rot: [0.2, 0, 0] });
    rig.attach(wtint(st, TRIM), 'chest');
    const cap = place(blob(0.038, 0.024, 0.038, 7, 5), { pos: [0.105 * s, 1.98, -0.36] });
    rig.attach(glow(wtint(cap, 0x3a0d05), MAGITEK, 2.0), 'chest');
  }

  /* --- head: the same faceless helm, hunkered into the cowl --- */
  const neck = place(loft(circleCross(8), [{ y: 1.83, sx: 0.062 }, { y: 1.94, sx: 0.062 }]), {});
  rig.attachBlend(wtint(neck, JOINT), 'chest', 'head', 1.0);
  const helm = place(slab(0.23, 0.25, 0.26, 0.05), { pos: [0, 2.05, 0.0] });
  rig.attach(wtint(helm, PLATE, 0.03), 'head');
  const crest = place(slab(0.05, 0.21, 0.25, 0.02), { pos: [0, 2.19, -0.01] });
  rig.attach(wtint(crest, PLATE_DARK), 'head');
  const chin = place(slab(0.17, 0.10, 0.11, 0.02), { pos: [0, 1.945, 0.08] });
  rig.attach(wtint(chin, PLATE_DARK), 'head');
  const visor = place(slab(0.185, 0.035, 0.03, 0.008), { pos: [0, 2.065, 0.138] });
  rig.attach(glow(wtint(visor, 0x3d0e05), MAGITEK, 4.5), 'head');
  const visorRim = place(slab(0.215, 0.085, 0.04, 0.014), { pos: [0, 2.065, 0.122] });
  rig.attach(wtint(visorRim, JOINT), 'head');

  /* --- arms: slab pauldrons, the read that says "heavy" --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const pauldron = place(slab(0.30, 0.27, 0.36, 0.05), { pos: [0.335 * s, 1.80, 0], rot: [0, 0, -0.20 * s] });
    rig.attach(wtint(pauldron, PLATE, 0.03), `sh${n}`);
    const lame = place(slab(0.27, 0.11, 0.33, 0.03), { pos: [0.355 * s, 1.63, 0], rot: [0, 0, -0.30 * s] });
    rig.attach(wtint(lame, PLATE_DARK), `sh${n}`);
    const paulTrim = place(slab(0.06, 0.22, 0.34, 0.015), { pos: [0.465 * s, 1.79, 0], rot: [0, 0, -0.20 * s] });
    rig.attach(wtint(paulTrim, TRIM), `sh${n}`);
    const upArm = tube([P(0.30 * s, 1.74, 0), P(0.345 * s, 1.55, 0.01), P(0.38 * s, 1.38, 0.02)],
      [0.078, 0.070, 0.062], { radialSeg: 8 });
    rig.attachBlend(wtint(upArm, JOINT), `sh${n}`, `el${n}`, 1.0);
    const elbow = place(blob(0.068, 0.068, 0.068, 8, 6), { pos: [0.38 * s, 1.37, 0.02] });
    rig.attach(wtint(elbow, JOINT), `el${n}`);
    const loArm = tube([P(0.38 * s, 1.36, 0.02), P(0.38 * s, 1.20, 0.06), P(0.38 * s, 1.06, 0.10)],
      [0.062, 0.056, 0.05], { radialSeg: 8 });
    rig.attachBlend(wtint(loArm, JOINT), `el${n}`, `hd${n}`, 1.0);
    const bracer = place(slab(0.14, 0.22, 0.14, 0.025), { pos: [0.38 * s, 1.22, 0.06] });
    rig.attach(wtint(bracer, PLATE, 0.03), `el${n}`);
    const hand = place(slab(0.09, 0.12, 0.075, 0.02), { pos: [0.38 * s, 1.00, 0.13] });
    rig.attach(wtint(hand, PLATE_DARK), `hd${n}`);
  }

  /* --- legs: heavier than the trooper's, same joint language --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const thigh = tube([P(0.16 * s, 1.03, 0), P(0.165 * s, 0.80, 0.02), P(0.17 * s, 0.59, 0.03)],
      [0.095, 0.086, 0.072], { radialSeg: 8 });
    rig.attachBlend(wtint(thigh, JOINT), `hp${n}`, `kn${n}`, 1.0);
    const thighP = place(slab(0.19, 0.36, 0.20, 0.032), { pos: [0.165 * s, 0.81, 0.015] });
    rig.attach(wtint(thighP, PLATE, 0.03), `hp${n}`);
    const knee = place(slab(0.16, 0.13, 0.16, 0.035), { pos: [0.17 * s, 0.57, 0.05] });
    rig.attach(wtint(knee, TRIM), `kn${n}`);
    const shin = tube([P(0.17 * s, 0.56, 0.03), P(0.17 * s, 0.34, 0.015), P(0.17 * s, 0.13, 0.0)],
      [0.065, 0.058, 0.05], { radialSeg: 8 });
    rig.attachBlend(wtint(shin, JOINT), `kn${n}`, `ft${n}`, 1.0);
    const shinP = place(slab(0.17, 0.36, 0.18, 0.03), { pos: [0.17 * s, 0.35, 0.025] });
    rig.attach(wtint(shinP, PLATE, 0.03), `kn${n}`);
    const foot = place(slab(0.18, 0.11, 0.36, 0.03), { pos: [0.17 * s, 0.065, 0.07] });
    rig.attach(wtint(foot, PLATE_DARK), `ft${n}`);
    const toe = place(slab(0.16, 0.065, 0.10, 0.018), { pos: [0.17 * s, 0.05, 0.24] });
    rig.attach(wtint(toe, TRIM), `ft${n}`);
  }

  /* --- the magitek battle-axe, welded into the right fist --- */
  const axe = [];
  const HX = 0.38, HZ = 0.14;   // haft axis, through the right hand
  const haft = place(loft(circleCross(8), [
    { y: 0.00, sx: 0.046 }, { y: 1.30, sx: 0.042 }, { y: 2.05, sx: 0.038 },
  ]), { pos: [HX, 0.30, HZ] });
  axe.push(wtint(haft, PLATE_DARK));
  const wrap = place(slab(0.10, 0.34, 0.10, 0.014), { pos: [HX, 1.06, HZ] });
  axe.push(wtint(wrap, JOINT));

  // the head: a deep forward bit, a rear breaching spike, a squared eye block
  const eye = place(slab(0.13, 0.36, 0.20, 0.03), { pos: [HX, 2.02, HZ] });
  axe.push(wtint(eye, PLATE, 0.03));
  const bitSections = [
    { y: -0.30, sx: 0.10, sz: 0.046, dx: 0.10 },
    { y: -0.15, sx: 0.26, sz: 0.050, dx: 0.16 },
    { y: 0.00, sx: 0.34, sz: 0.052, dx: 0.20 },
    { y: 0.17, sx: 0.28, sz: 0.048, dx: 0.16 },
    { y: 0.31, sx: 0.11, sz: 0.040, dx: 0.08 },
  ];
  const bit = place(loft(bladeCross(10), bitSections), { pos: [HX, 2.02, HZ], rot: [0, -Math.PI / 2, 0] });
  axe.push(wtint(bit, TRIM, 0.04));
  // the energy edge: a hot line traced along the cutting arc
  const edge = place(loft(circleCross(6), [
    { y: -0.29, sx: 0.020, sz: 0.022, dx: 0.185 },
    { y: -0.15, sx: 0.024, sz: 0.026, dx: 0.400 },
    { y: 0.00, sx: 0.026, sz: 0.028, dx: 0.530 },
    { y: 0.17, sx: 0.024, sz: 0.026, dx: 0.425 },
    { y: 0.30, sx: 0.018, sz: 0.020, dx: 0.180 },
  ]), { pos: [HX, 2.02, HZ], rot: [0, -Math.PI / 2, 0] });
  axe.push(glow(wtint(edge, 0x3d0e05), MAGITEK, 3.6));
  const rearSpike = place(spike(0.055, 0.32, 6), { pos: [HX, 2.02, HZ - 0.09], rot: [-Math.PI / 2, 0, 0] });
  axe.push(wtint(rearSpike, PLATE_DARK));
  const crown = place(spike(0.045, 0.22, 6), { pos: [HX, 2.32, HZ] });
  axe.push(wtint(crown, TRIM));
  const cell = place(loft(circleCross(6), [{ y: 0, sx: 0.052 }, { y: 0.14, sx: 0.052 }]),
    { pos: [HX, 1.76, HZ] });
  axe.push(glow(wtint(cell, 0x2a0a04), MAGITEK, 2.2));
  for (const g of axe) rig.attach(g, 'hdR');

  const mat = creatureMaterial({
    // roughness multiplies metalRoughness() (0.40-0.82), so 0.48 landed at an
    // effective 0.19-0.39 — a showroom gloss on a machine that lives in a
    // dust bowl. normalScale 0.22 kept the rivets and panel seams off screen.
    roughness: 0.72, metalness: 0.34,
    normalMap: metalNormal(), normalScale: 0.70, roughnessMap: metalRoughness(),
  });
  return rig.build(mat, { radius: 2.8 });
}

class AxemanEnemy extends Enemy {
  override attackId!: any;
  override rig!: any;
  override stateTime!: any;
  override visual!: any;
  constructor(opts: any) { super(IMPERIAL_AXEMAN, opts); }

  /** World-space axe tip — the sweep origin for the cleave trail. */
  axeTip(out = new THREE.Vector3()) {
    const b = this.rig && this.rig.byName.get('hdR');
    if (!b) return this.centre(out);
    b.updateWorldMatrix(true, false);
    return out.set(0.0, 1.32, 0.53).applyMatrix4(b.matrixWorld);
  }

  override pose(state: any, t: any) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n: any, x: any, y: any, z: any) => poseBone(rig, n, x, y, z);
    this.visual.rotation.y = 0;

    // axe shouldered across the body, both hands on the haft
    const carry = (k = 1) => {
      S('shR', 0.28 * k, -0.10 * k, -0.42 * k);
      S('elR', -0.80 * k, 0, 0);
      S('hdR', -0.30 * k, 0, 0);
      S('shL', -0.45 * k, 0.90 * k, 0.35 * k);
      S('elL', -1.30 * k, 0, 0);
      S('hdL', 0, -0.35 * k, 0);
    };
    // both arms hauled over the right shoulder, axe head high behind the helm
    const wound = (e: any) => {
      S('shR', 0.28 - 3.20 * e, -0.10 - 0.35 * e, -0.42 + 0.60 * e);
      S('elR', -0.80 - 0.70 * e, 0, 0);
      S('hdR', -0.30 + 0.28 * e, 0, 0);
      S('shL', -0.45 - 1.10 * e, 0.90 - 0.30 * e, 0.35);
      S('elL', -1.30 - 0.55 * e, 0, 0);
      S('hdL', 0, -0.35, 0);
    };

    switch (state) {
      case 'approach':
      case 'walk': {
        // a long, heavy stride — noticeably slower than the trooper's
        const ph = t * 4.1;
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          const o = s < 0 ? 0 : Math.PI;
          S(`hp${n}`, Math.sin(ph + o) * 0.46, 0, 0);
          S(`kn${n}`, 0.14 + Math.max(0, Math.sin(ph + o + 1.45)) * 0.72, 0, 0);
          S(`ft${n}`, -0.12 - Math.sin(ph + o) * 0.20, 0, 0);
        }
        carry(1);
        S('shL', -0.45 - Math.sin(ph) * 0.16, 0.90, 0.35);
        S('spine', 0.07, Math.sin(ph) * 0.06, 0);
        S('chest', 0.05, -Math.sin(ph) * 0.09, 0);
        S('head', 0.04, Math.sin(ph * 0.5) * 0.10, 0);
        this.visual.position.y = Math.abs(Math.sin(ph)) * 0.055;
        break;
      }
      case 'telegraph': {
        const id = this.attackId;
        if (id === 'spin') {
          // coil to the right, axe swung out level at hip height
          const k = Math.min(1, this.stateTime / 0.7);
          const e = k * k * (3 - 2 * k);
          S('shR', 0.28 - 1.35 * e, -0.10 - 1.05 * e, -0.42 - 0.35 * e);
          S('elR', -0.80 + 0.55 * e, 0, 0);
          S('hdR', -0.30 - 1.35 * e, 0, 0);
          S('shL', -0.45 - 0.70 * e, 0.90 - 0.55 * e, 0.35);
          S('elL', -1.30 + 0.35 * e, 0, 0);
          S('spine', 0, -0.55 * e, 0);
          S('chest', -0.05 * e, -0.45 * e, 0);
          S('head', 0, 0.55 * e, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, -0.14 * e, 0, 0); S(`kn${n}`, 0.34 * e, 0, 0); S(`ft${n}`, -0.18 * e, 0, 0);
          }
          this.visual.position.y = -0.07 * e;
        } else if (id === 'charge_slam') {
          // axe cocked back over the shoulder, weight forward, ready to step in
          const k = Math.min(1, this.stateTime / 0.8);
          const e = k * k * (3 - 2 * k);
          wound(e * 0.82);
          S('spine', -0.10 * e, -0.32 * e, 0);
          S('chest', -0.06 * e, -0.24 * e, 0);
          S('head', 0.16 * e, 0.24 * e, 0);
          S('hpL', 0.42 * e, 0, 0); S('knL', 0.30 * e, 0, 0); S('ftL', -0.18 * e, 0, 0);
          S('hpR', -0.34 * e, 0, 0); S('knR', 0.55 * e, 0, 0); S('ftR', -0.22 * e, 0, 0);
          this.visual.position.y = -0.05 * e;
        } else {
          // cleave: the long one — axe hauled straight overhead and *held*
          const k = Math.min(1, this.stateTime / 0.85);
          const e = k * k * (3 - 2 * k);
          const hold = Math.sin(t * 26) * 0.018 * e;   // servos straining at the top
          wound(e);
          S('spine', -0.26 * e + hold, -0.24 * e, 0);
          S('chest', -0.20 * e, -0.18 * e, 0);
          S('head', 0.14 * e, 0.16 * e, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, (s < 0 ? 0.30 : -0.20) * e, 0, 0);
            S(`kn${n}`, 0.40 * e, 0, 0);
            S(`ft${n}`, -0.20 * e, 0, 0);
          }
        }
        break;
      }
      case 'attack': {
        const id = this.attackId;
        if (id === 'spin') {
          // one full rotation, axe held out level the whole way round
          const k = Math.min(1, this.stateTime / 0.75);
          const e = k * k * (3 - 2 * k);
          this.visual.rotation.y = e * Math.PI * 2;
          S('shR', -1.07, -1.55, -0.77);
          S('elR', -0.25, 0, 0);
          S('hdR', -1.65, 0, 0);
          S('shL', -1.15, 0.35, 0.35);
          S('elL', -0.95, 0, 0);
          S('spine', 0, -0.55 + 0.35 * e, 0);
          S('chest', -0.05, -0.45 + 0.30 * e, 0);
          S('head', 0, 0.55 - 0.75 * e, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, -0.16, 0, 0); S(`kn${n}`, 0.36, 0, 0); S(`ft${n}`, -0.20, 0, 0);
          }
          this.visual.position.y = -0.09;
        } else if (id === 'charge_slam') {
          // step through and drive the axe into the ground
          const k = Math.min(1, this.stateTime / 0.34);
          const e = 1 - Math.pow(1 - k, 3.4);
          S('shR', -2.34 + 3.05 * e, -0.39 + 0.30 * e, 0.07 - 0.10 * e);
          S('elR', -1.37 + 0.90 * e, 0, 0);
          S('hdR', -0.07 - 0.42 * e, 0, 0);
          S('shL', -1.35 + 1.00 * e, 0.65, 0.35);
          S('elL', -1.75 + 0.55 * e, 0, 0);
          S('spine', -0.10 + 0.66 * e, -0.32 + 0.40 * e, 0);
          S('chest', -0.06 + 0.52 * e, -0.24 + 0.30 * e, 0);
          S('head', 0.16 - 0.40 * e, 0.24 - 0.28 * e, 0);
          S('hpL', 0.42 - 0.92 * e, 0, 0); S('knL', 0.30 + 0.60 * e, 0, 0);
          S('hpR', -0.34 + 0.10 * e, 0, 0); S('knR', 0.55 + 0.45 * e, 0, 0);
          this.visual.position.y = -0.42 * e;
        } else {
          // the overhead cleave comes down
          const k = Math.min(1, this.stateTime / 0.32);
          const e = 1 - Math.pow(1 - k, 3.2);
          S('shR', -2.92 + 3.70 * e, -0.45 + 0.35 * e, 0.18 - 0.12 * e);
          S('elR', -1.50 + 0.95 * e, 0, 0);
          S('hdR', -0.02 - 0.40 * e, 0, 0);
          S('shL', -1.55 + 1.15 * e, 0.60, 0.35);
          S('elL', -1.85 + 0.60 * e, 0, 0);
          S('spine', -0.26 + 0.72 * e, -0.24 + 0.34 * e, 0);
          S('chest', -0.20 + 0.56 * e, -0.18 + 0.26 * e, 0);
          S('head', 0.14 - 0.34 * e, 0.16 - 0.20 * e, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, (s < 0 ? 0.30 : -0.20) * (1 - e) - 0.28 * e, 0, 0);
            S(`kn${n}`, 0.40 + 0.42 * e, 0, 0);
            S(`ft${n}`, -0.20 - 0.14 * e, 0, 0);
          }
          this.visual.position.y = -0.30 * e;
        }
        break;
      }
      case 'flinch': {
        const k = Math.exp(-this.stateTime * 8) * (1 - Math.min(1, this.stateTime / 0.35));
        carry(1);
        S('spine', 0.22 * k, Math.sin(this.stateTime * 38) * 0.18 * k, 0);
        S('chest', 0.16 * k, 0, 0.12 * k);
        S('head', -0.28 * k, 0.20 * k, 0);
        S('shR', 0.28 + 0.45 * k, -0.10, -0.42);
        break;
      }
      case 'stagger': {
        // knees buckle, axe head drops to the dirt — the opening
        const k = Math.min(1, this.stateTime / 0.22) * Math.max(0, 1 - this.stateTime / 2.4);
        S('spine', 0.48 * k, 0.26 * k, 0);
        S('chest', 0.34 * k, 0, 0.22 * k);
        S('head', -0.55 * k, 0.30 * k, 0);
        S('shR', 0.28 + 0.55 * k, -0.10, -0.42 + 0.75 * k);
        S('elR', -0.80 - 0.35 * k, 0, 0);
        S('hdR', -0.30 - 0.55 * k, 0, 0);
        S('shL', -0.45 + 0.85 * k, 0.90 - 0.70 * k, 0.35 - 0.80 * k);
        S('elL', -1.30 + 0.60 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, -0.58 * k, 0, 0); S(`kn${n}`, 1.05 * k, 0, 0); S(`ft${n}`, -0.42 * k, 0, 0);
        }
        this.visual.position.y = -0.28 * k;
        break;
      }
      case 'death': {
        const k = Math.min(1, this.stateTime / 0.8);
        const e = 1 - Math.pow(1 - k, 2.8);
        this.visual.rotation.x = e * 1.35;
        this.visual.position.y = -0.60 * e;
        S('spine', -0.22 * e, 0, 0);
        S('head', 0.45 * e, 0, 0);
        S('shR', 0.28 + 0.80 * e, 0, -0.42 + 0.90 * e);
        S('elR', -0.80 + 0.60 * e, 0, 0);
        S('shL', 0.85 * e, 0, -0.75 * e);
        S('elL', -1.30 + 0.90 * e, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, -0.75 * e, 0, 0); S(`kn${n}`, 1.25 * e, 0, 0);
        }
        break;
      }
      default: {
        const b = Math.sin(t * 1.1) * 0.025;
        carry(1);
        S('spine', 0.03 + b, 0, 0);
        S('chest', 0.02 + b * 0.5, 0, 0);
        S('head', 0.02, Math.sin(t * 0.38) * 0.20, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, 0.03, 0, 0); S(`kn${n}`, 0.08, 0, 0); S(`ft${n}`, -0.06, 0, 0);
        }
        this.visual.position.y = 0;
        break;
      }
    }
  }
}

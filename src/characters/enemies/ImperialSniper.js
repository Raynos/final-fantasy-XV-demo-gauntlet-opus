import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.js';
import { Enemy, metalNormal, metalRoughness } from './EnemyBase.js';
import {
  tube, blob, slab, place, tint, glow, rectCross, loft, circleCross,
} from '../../combat/GeoKit.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

const PLATE = 0x33383f;
const PLATE_DARK = 0x191c21;
const JOINT = 0x14161a;
const TRIM = 0x555b63;
const MAGITEK = 0xff2f12;

/**
 * Imperial Magitek Sniper — the MT line stripped back for reach.
 * Same black-and-gunmetal plate as the trooper, but narrower through the
 * chest and limbs, with a single-lens targeting optic bolted to the right of
 * the helm and a thin stabiliser fin folded off the power pack. Carries a
 * long-barrelled magitek rail rifle whose coils light up as it charges. The
 * wind-up is enormous on purpose: a sniper picking you out should be visible
 * from the other side of the field.
 */
export const IMPERIAL_SNIPER = {
  key: 'sniper',
  questId: 'imperial_sniper',
  faction: 'imperial',
  expClass: 'normal',
  stats: {
    name: 'Magitek Sniper', hp: 1200, poise: 40, speed: 3.4, attackRange: 34,
    aggroRange: 46, radius: 0.4, height: 1.95, damage: 260, level: 22,
  },
  weakness: 'lightning',
  resist: 'fire',
  resistPct: { lightning: 170, fire: 55, ice: 100, dark: 100, light: 100 },
  senses: { sight: 48, fov: 1.1, hearing: 10 },
  drops: [
    { id: 'magitek_booster', chance: 0.4, count: 1 },
  ],
  timing: { telegraph: 1.4, strike: 0.12, attack: 0.55, recover: 1.0 },
  attacks: [
    {
      id: 'snipe', range: 34, minRange: 8, weight: 4, mult: 1.8, poise: 34, hitRadius: 1.0,
      ranged: true, telegraph: 1.4, strike: 0.12, attack: 0.55, recover: 1.15,
      cooldown: 3.8, tracking: 1.1,
    },
    {
      id: 'buttstroke', range: 3, weight: 2, mult: 0.5, poise: 18, hitRadius: 1.9, arc: 1.2,
      telegraph: 0.26, strike: 0.12, attack: 0.40, recover: 0.55, cooldown: 1.1,
    },
  ],
  buildPrototype,
  make(opts) { return new SniperEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('pelvis', 'root', [0, 0.92, 0]);
  rig.bone('spine', 'pelvis', [0, 1.16, 0]);
  rig.bone('chest', 'spine', [0, 1.40, 0]);
  rig.bone('neck', 'chest', [0, 1.62, 0]);
  rig.bone('head', 'neck', [0, 1.74, 0.01]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`sh${n}`, 'chest', [0.215 * s, 1.53, 0]);
    rig.bone(`el${n}`, `sh${n}`, [0.28 * s, 1.19, 0.02]);
    rig.bone(`hd${n}`, `el${n}`, [0.28 * s, 0.90, 0.10]);
    rig.bone(`hp${n}`, 'pelvis', [0.125 * s, 0.90, 0]);
    rig.bone(`kn${n}`, `hp${n}`, [0.135 * s, 0.50, 0.03]);
    rig.bone(`ft${n}`, `kn${n}`, [0.135 * s, 0.08, -0.01]);
  }

  /* --- torso: the trooper chassis, narrowed --- */
  const core = loft(rectCross(0.3, 14), [
    { y: 0.86, sx: 0.125, sz: 0.095 },
    { y: 1.10, sx: 0.130, sz: 0.098 },
    { y: 1.36, sx: 0.155, sz: 0.110 },
    { y: 1.56, sx: 0.145, sz: 0.102 },
  ]);
  rig.attachBlend(tint(core, PLATE_DARK, 0.03), 'pelvis', 'chest', 1.4);

  const breast = place(slab(0.34, 0.30, 0.21, 0.03), { pos: [0, 1.40, 0.01] });
  rig.attach(tint(breast, PLATE, 0.03), 'chest');
  const gorget = place(slab(0.22, 0.08, 0.18, 0.022), { pos: [0, 1.58, 0.0] });
  rig.attach(tint(gorget, PLATE_DARK), 'chest');
  const abdo = place(slab(0.25, 0.20, 0.18, 0.028), { pos: [0, 1.16, 0.0] });
  rig.attach(tint(abdo, PLATE, 0.03), 'spine');
  const belt = place(slab(0.29, 0.09, 0.21, 0.02), { pos: [0, 0.96, 0] });
  rig.attach(tint(belt, PLATE_DARK), 'pelvis');
  const skirtF = place(slab(0.22, 0.19, 0.05, 0.015), { pos: [0, 0.84, 0.11], rot: [0.16, 0, 0] });
  rig.attach(tint(skirtF, PLATE), 'pelvis');

  // magitek core and vents — the same furnace the whole line runs on
  const coreGlow = place(slab(0.09, 0.09, 0.05, 0.018), { pos: [0, 1.42, 0.115] });
  rig.attach(glow(tint(coreGlow, 0x3a0d05), MAGITEK, 3.0), 'chest');
  for (let i = 0; i < 2; i++) {
    const vent = place(slab(0.17, 0.016, 0.03, 0.004), { pos: [0, 1.25 + i * 0.05, 0.10] });
    rig.attach(glow(tint(vent, 0x2a0a04), MAGITEK, 1.6), 'spine');
  }

  // back power unit with the stabiliser fin folded off the top of it
  const pack = place(slab(0.24, 0.28, 0.12, 0.028), { pos: [0, 1.38, -0.15] });
  rig.attach(tint(pack, PLATE_DARK, 0.03), 'chest');
  const fin = place(slab(0.055, 0.52, 0.30, 0.02), { pos: [0, 1.62, -0.29], rot: [-0.42, 0, 0] });
  rig.attach(tint(fin, PLATE, 0.03), 'chest');
  const finEdge = place(slab(0.02, 0.46, 0.035, 0.006), { pos: [0, 1.70, -0.43], rot: [-0.42, 0, 0] });
  rig.attach(glow(tint(finEdge, 0x2a0a04), MAGITEK, 1.4), 'chest');
  const spar = place(loft(circleCross(6), [{ y: 0, sx: 0.022 }, { y: 0.22, sx: 0.018 }]),
    { pos: [0, 1.42, -0.20], rot: [-1.1, 0, 0] });
  rig.attach(tint(spar, TRIM), 'chest');

  /* --- head: faceless helm, visor slit, and the asymmetric optic --- */
  const neck = place(loft(circleCross(8), [{ y: 1.58, sx: 0.048 }, { y: 1.68, sx: 0.048 }]), {});
  rig.attachBlend(tint(neck, JOINT), 'chest', 'head', 1.0);
  const helm = place(slab(0.185, 0.21, 0.22, 0.04), { pos: [0, 1.78, 0.0] });
  rig.attach(tint(helm, PLATE, 0.03), 'head');
  const crest = place(slab(0.04, 0.17, 0.21, 0.018), { pos: [0, 1.89, -0.01] });
  rig.attach(tint(crest, PLATE_DARK), 'head');
  const chin = place(slab(0.14, 0.085, 0.10, 0.02), { pos: [0, 1.685, 0.07] });
  rig.attach(tint(chin, PLATE_DARK), 'head');
  const visor = place(slab(0.15, 0.028, 0.03, 0.007), { pos: [0, 1.795, 0.118] });
  rig.attach(glow(tint(visor, 0x3d0e05), MAGITEK, 4.0), 'head');
  const visorRim = place(slab(0.175, 0.07, 0.035, 0.012), { pos: [0, 1.795, 0.104] });
  rig.attach(tint(visorRim, JOINT), 'head');

  // the tell: a single-lens targeting optic clamped to the right of the helm
  const optic = place(slab(0.085, 0.11, 0.20, 0.02), { pos: [0.125, 1.815, 0.03] });
  rig.attach(tint(optic, PLATE_DARK, 0.03), 'head');
  const lensHood = place(loft(circleCross(8), [
    { y: 0, sx: 0.052 }, { y: 0.07, sx: 0.046 }, { y: 0.12, sx: 0.040 },
  ]), { pos: [0.125, 1.815, 0.11], rot: [Math.PI / 2, 0, 0] });
  rig.attach(tint(lensHood, TRIM), 'head');
  const lens = place(blob(0.036, 0.036, 0.014, 9, 6), { pos: [0.125, 1.815, 0.235], rot: [Math.PI / 2, 0, 0] });
  rig.attach(glow(tint(lens, 0x420f05), MAGITEK, 5.0), 'head');
  const antenna = place(loft(circleCross(5), [{ y: 0, sx: 0.011 }, { y: 0.26, sx: 0.006 }]),
    { pos: [0.10, 1.87, -0.05], rot: [-0.25, 0, 0.24] });
  rig.attach(tint(antenna, TRIM), 'head');

  /* --- arms: thin, all cable and bracer --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const pauldron = place(slab(0.155, 0.145, 0.175, 0.03), { pos: [0.235 * s, 1.545, 0], rot: [0, 0, -0.24 * s] });
    rig.attach(tint(pauldron, PLATE, 0.03), `sh${n}`);
    const paulTrim = place(slab(0.045, 0.115, 0.165, 0.01), { pos: [0.30 * s, 1.53, 0], rot: [0, 0, -0.24 * s] });
    rig.attach(tint(paulTrim, TRIM), `sh${n}`);

    const upArm = tube([P(0.215 * s, 1.50, 0), P(0.25 * s, 1.34, 0.01), P(0.28 * s, 1.20, 0.02)],
      [0.050, 0.045, 0.041], { radialSeg: 8 });
    rig.attachBlend(tint(upArm, JOINT), `sh${n}`, `el${n}`, 1.0);

    const elbow = place(blob(0.046, 0.046, 0.046, 7, 5), { pos: [0.28 * s, 1.19, 0.02] });
    rig.attach(tint(elbow, JOINT), `el${n}`);
    const loArm = tube([P(0.28 * s, 1.18, 0.02), P(0.28 * s, 1.04, 0.06), P(0.28 * s, 0.92, 0.10)],
      [0.041, 0.038, 0.035], { radialSeg: 8 });
    rig.attachBlend(tint(loArm, JOINT), `el${n}`, `hd${n}`, 1.0);
    const bracer = place(slab(0.095, 0.17, 0.095, 0.018), { pos: [0.28 * s, 1.06, 0.06] });
    rig.attach(tint(bracer, PLATE, 0.03), `el${n}`);
    const hand = place(slab(0.065, 0.09, 0.055, 0.015), { pos: [0.28 * s, 0.875, 0.115] });
    rig.attach(tint(hand, PLATE_DARK), `hd${n}`);
  }

  /* --- legs --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const thigh = tube([P(0.125 * s, 0.90, 0), P(0.13 * s, 0.70, 0.02), P(0.135 * s, 0.52, 0.03)],
      [0.062, 0.056, 0.048], { radialSeg: 8 });
    rig.attachBlend(tint(thigh, JOINT), `hp${n}`, `kn${n}`, 1.0);
    const thighP = place(slab(0.13, 0.29, 0.135, 0.024), { pos: [0.13 * s, 0.71, 0.015] });
    rig.attach(tint(thighP, PLATE, 0.03), `hp${n}`);
    const knee = place(slab(0.11, 0.10, 0.11, 0.026), { pos: [0.135 * s, 0.50, 0.045] });
    rig.attach(tint(knee, TRIM), `kn${n}`);
    const shin = tube([P(0.135 * s, 0.49, 0.03), P(0.135 * s, 0.30, 0.015), P(0.135 * s, 0.12, 0.0)],
      [0.044, 0.039, 0.035], { radialSeg: 8 });
    rig.attachBlend(tint(shin, JOINT), `kn${n}`, `ft${n}`, 1.0);
    const shinP = place(slab(0.115, 0.29, 0.125, 0.022), { pos: [0.135 * s, 0.31, 0.02] });
    rig.attach(tint(shinP, PLATE, 0.03), `kn${n}`);
    const foot = place(slab(0.125, 0.08, 0.28, 0.022), { pos: [0.135 * s, 0.05, 0.06] });
    rig.attach(tint(foot, PLATE_DARK), `ft${n}`);
  }

  /* --- the magitek rail rifle, welded to the right hand --- */
  const gun = [];
  const GX = 0.28, GY = 0.905;
  gun.push(tint(place(slab(0.05, 0.095, 0.66, 0.012), { pos: [GX, GY, 0.36] }), PLATE_DARK));
  gun.push(tint(place(slab(0.04, 0.14, 0.16, 0.012), { pos: [GX, GY - 0.03, 0.06] }), PLATE));
  gun.push(tint(place(slab(0.032, 0.13, 0.055, 0.01), { pos: [GX, 0.83, 0.24], rot: [0.3, 0, 0] }), JOINT));
  // the barrel: absurdly long, the whole point of the silhouette
  gun.push(tint(place(loft(circleCross(8), [
    { y: 0, sx: 0.024 }, { y: 0.45, sx: 0.021 }, { y: 0.74, sx: 0.019 },
  ]), { pos: [GX, GY, 0.68], rot: [Math.PI / 2, 0, 0] }), TRIM));
  gun.push(tint(place(slab(0.055, 0.055, 0.11, 0.012), { pos: [GX, GY, 1.44] }), PLATE_DARK));
  // accelerator coils along the barrel, lit red
  for (let i = 0; i < 3; i++) {
    gun.push(glow(tint(place(loft(circleCross(7), [{ y: 0, sx: 0.038 }, { y: 0.045, sx: 0.038 }]),
      { pos: [GX, GY, 0.78 + i * 0.22], rot: [Math.PI / 2, 0, 0] }), 0x2a0a04), MAGITEK, 2.0));
  }
  // rail strips down the receiver
  gun.push(glow(tint(place(slab(0.018, 0.026, 0.30, 0.005), { pos: [GX + 0.026, GY + 0.05, 0.36] }), 0x3a0d05), MAGITEK, 2.2));
  gun.push(glow(tint(place(slab(0.018, 0.026, 0.30, 0.005), { pos: [GX - 0.026, GY + 0.05, 0.36] }), 0x3a0d05), MAGITEK, 2.2));
  for (const g of gun) rig.attach(g, 'hdR');

  const mat = creatureMaterial({
    roughness: 0.48, metalness: 0.42,
    normalMap: metalNormal(), normalScale: 0.22, roughnessMap: metalRoughness(),
  });
  return rig.build(mat, { radius: 2.4 });
}

class SniperEnemy extends Enemy {
  constructor(opts) { super(IMPERIAL_SNIPER, opts); }

  /** World-space muzzle position — the combat system spawns the tracer here. */
  muzzle(out = new THREE.Vector3()) {
    const b = this.rig && this.rig.byName.get('hdR');
    if (!b) return this.centre(out);
    b.updateWorldMatrix(true, false);
    return out.set(0.0, 0.03, 1.42).applyMatrix4(b.matrixWorld);
  }

  pose(state, t) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n, x, y, z) => poseBone(rig, n, x, y, z);
    // rifle carried muzzle-down across the body
    const ready = (k = 1) => {
      S('shR', -0.95 * k, -0.30 * k, -0.30 * k);
      S('elR', -1.05 * k, 0, 0);
      S('hdR', 0.35 * k, 0.20 * k, 0);
      S('shL', -0.90 * k, 0.55 * k, 0.55 * k);
      S('elL', -1.45 * k, 0, 0);
      S('hdL', 0, -0.5 * k, 0);
    };
    // rifle up, shouldered, cheek welded to the optic — held dead still
    const sighted = (k = 1) => {
      S('shR', -1.52 * k, -0.60 * k, -0.58 * k);
      S('elR', -1.38 * k, 0, 0);
      S('hdR', 0.26 * k, 0.36 * k, 0);
      S('shL', -1.40 * k, 0.80 * k, 0.78 * k);
      S('elL', -1.72 * k, 0, 0);
      S('hdL', 0, -0.55 * k, 0);
    };

    switch (state) {
      case 'approach':
      case 'run': {
        const ph = t * 7.6;
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          const o = s < 0 ? 0 : Math.PI;
          S(`hp${n}`, Math.sin(ph + o) * 0.58, 0, 0);
          S(`kn${n}`, 0.14 + Math.max(0, Math.sin(ph + o + 1.5)) * 0.88, 0, 0);
          S(`ft${n}`, -0.15 - Math.sin(ph + o) * 0.2, 0, 0);
        }
        ready(1);
        S('spine', 0.08, Math.sin(ph) * 0.06, 0);
        S('chest', 0.05, -Math.sin(ph) * 0.09, 0);
        S('head', 0, Math.sin(ph * 0.5) * 0.12, 0);
        this.visual.position.y = Math.abs(Math.sin(ph)) * 0.04;
        break;
      }
      case 'telegraph': {
        if (this.attackId === 'buttstroke') {
          // panicked: rifle snatched back to the hip, ready to swing the stock
          const k = Math.min(1, this.stateTime / 0.2);
          ready(1);
          S('shR', -0.95 - 0.75 * k, -0.30 - 0.35 * k, -0.30);
          S('elR', -1.05 - 0.55 * k, 0, 0);
          S('spine', -0.10 * k, -0.42 * k, 0);
          S('chest', -0.08 * k, -0.30 * k, 0);
          S('head', 0, 0.32 * k, 0);
          break;
        }
        // the long one: settle into the stance in a quarter second, then hold
        // it stone-still while the rail charges. Readable across the field.
        const k = Math.min(1, this.stateTime / 0.28);
        const e = k * k * (3 - 2 * k);
        const charge = Math.min(1, Math.max(0, (this.stateTime - 0.3) / 1.05));
        const hum = Math.sin(t * 30) * 0.006 * charge;   // the coils spinning up
        sighted(e);
        S('shR', -1.52 * e - hum, -0.60 * e, -0.58 * e);
        S('chest', -0.06 * e, -0.20 * e, 0);
        S('spine', -0.04 * e, -0.10 * e, 0);
        S('head', 0.04 * e, -0.14 * e, -0.12 * e);   // cheek down onto the optic
        // braced stance: front leg planted, back leg locked out behind
        S('hpL', -0.30 * e, 0, 0); S('knL', 0.42 * e, 0, 0); S('ftL', -0.16 * e, 0, 0);
        S('hpR', 0.22 * e, 0, 0); S('knR', 0.10 * e, 0, 0); S('ftR', -0.12 * e, 0, 0);
        this.visual.position.y = -0.09 * e;
        break;
      }
      case 'attack': {
        if (this.attackId === 'buttstroke') {
          // a short, ugly jab with the stock
          const k = Math.min(1, this.stateTime / 0.16);
          const e = 1 - Math.pow(1 - k, 3);
          S('shR', -1.70 + 1.35 * e, -0.65 + 0.55 * e, -0.30);
          S('elR', -1.60 + 1.10 * e, 0, 0);
          S('hdR', 0.35, 0.20 - 0.55 * e, 0);
          S('shL', -0.90, 0.55, 0.55);
          S('elL', -1.45, 0, 0);
          S('spine', -0.10 + 0.28 * e, -0.42 + 0.62 * e, 0);
          S('chest', -0.08 + 0.20 * e, -0.30 + 0.44 * e, 0);
          S('head', 0, 0.32 - 0.44 * e, 0);
          S('hpL', -0.24 * e, 0, 0); S('knL', 0.36 * e, 0, 0);
          break;
        }
        // one very heavy shot: hard recoil that takes a moment to settle
        const kick = Math.exp(-this.stateTime * 7.5) * 0.62;
        sighted(1);
        S('shR', -1.52 - kick * 0.55, -0.60, -0.58);
        S('elR', -1.38 + kick * 1.15, 0, 0);
        S('shL', -1.40 - kick * 0.30, 0.80, 0.78);
        S('elL', -1.72 + kick * 0.8, 0, 0);
        S('chest', -0.06 + kick * 0.45, -0.20, 0);
        S('spine', -0.04 + kick * 0.30, -0.10, 0);
        S('head', 0.04 - kick * 0.35, -0.14, -0.12);
        S('hpL', -0.30 + kick * 0.2, 0, 0); S('knL', 0.42 + kick * 0.3, 0, 0);
        S('hpR', 0.22, 0, 0); S('knR', 0.10 + kick * 0.2, 0, 0);
        this.visual.position.y = -0.09 - kick * 0.05;
        break;
      }
      case 'flinch': {
        const k = Math.exp(-this.stateTime * 8) * (1 - Math.min(1, this.stateTime / 0.35));
        ready(1);
        S('spine', 0.34 * k, Math.sin(this.stateTime * 42) * 0.28 * k, 0);
        S('chest', 0.22 * k, 0, 0.18 * k);
        S('head', -0.38 * k, 0.28 * k, 0);
        S('shR', -0.95 + 0.8 * k, -0.30, -0.30);
        break;
      }
      case 'stagger': {
        const k = Math.min(1, this.stateTime / 0.18) * Math.max(0, 1 - this.stateTime / 2.2);
        S('spine', 0.50 * k, 0.28 * k, 0);
        S('chest', 0.32 * k, 0, 0.26 * k);
        S('head', -0.55 * k, 0.32 * k, 0);
        S('shR', -0.45 * k, -0.2, 0.85 * k);
        S('elR', -0.55, 0, 0);
        S('shL', -0.35 * k, 0.2, -0.85 * k);
        S('elL', -0.55, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, -0.58 * k, 0, 0); S(`kn${n}`, 1.05 * k, 0, 0); S(`ft${n}`, -0.42 * k, 0, 0);
        }
        this.visual.position.y = -0.22 * k;
        break;
      }
      case 'death': {
        const k = Math.min(1, this.stateTime / 0.55);
        const e = 1 - Math.pow(1 - k, 3);
        this.visual.rotation.x = e * 1.45;
        this.visual.position.y = -0.42 * e;
        S('spine', -0.2 * e, 0, 0);
        S('head', 0.42 * e, 0, 0);
        S('shR', 0.95 * e, 0, 0.75 * e); S('shL', 0.95 * e, 0, -0.75 * e);
        S('elR', -0.35 * e, 0, 0); S('elL', -0.35 * e, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, -0.72 * e, 0, 0); S(`kn${n}`, 1.25 * e, 0, 0);
        }
        break;
      }
      default: {
        const b = Math.sin(t * 1.5) * 0.018;
        ready(1);
        S('spine', b, 0, 0);
        S('chest', b * 0.5, 0, 0);
        // sweeping the horizon for a target — a slow, mechanical scan
        S('head', 0, Math.sin(t * 0.34) * 0.55, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, 0.02, 0, 0); S(`kn${n}`, 0.06, 0, 0); S(`ft${n}`, -0.05, 0, 0);
        }
        this.visual.position.y = 0;
        break;
      }
    }
  }
}

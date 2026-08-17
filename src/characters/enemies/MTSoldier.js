import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.js';
import { Enemy, metalNormal, metalRoughness } from './EnemyBase.js';
import { tube, blob, slab, spike, place, tint, glow, rectCross, loft, circleCross } from '../../combat/GeoKit.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

const PLATE = 0x33383f;
const PLATE_DARK = 0x191c21;
const JOINT = 0x14161a;
const TRIM = 0x555b63;
const MAGITEK = 0xff2f12;

/**
 * Imperial Magitek Trooper (MT) — mass-produced Niflheim infantry.
 * Hard angular armour over exposed black piston joints, a faceless helm with
 * a single burning visor slit, and magitek vents that glow through the plate.
 * Drops out of a dropship, snaps to attention, then advances firing.
 */
export const MT_SOLDIER = {
  key: 'mt',
  questId: 'magitek_trooper',
  faction: 'imperial',
  expClass: 'normal',
  stats: {
    name: 'Magitek Trooper', hp: 640, poise: 34, speed: 3.2, attackRange: 9.5,
    aggroRange: 34, radius: 0.42, height: 1.95, damage: 74, level: 16,
  },
  weakness: 'lightning',
  resist: 'fire',
  resistPct: { lightning: 170, fire: 60, ice: 100, dark: 100, light: 100 },
  weakTo: ['polearm'],
  senses: { sight: 34, fov: 1.3, hearing: 12 },
  drops: [
    { id: 'chrome_bit', chance: 0.4, count: 1 },
    { id: 'magitek_booster', chance: 0.15, count: 1 },
    { id: 'debased_coin', chance: 0.3, count: 3 },
  ],
  timing: { telegraph: 0.5, strike: 0.1, attack: 0.42, recover: 0.75 },
  attacks: [
    { id: 'volley', range: 16, minRange: 3.5, weight: 4, mult: 0.7, poise: 4, hitRadius: 1.0,
      ranged: true, telegraph: 0.55, strike: 0.12, attack: 0.5, recover: 0.8, cooldown: 1.6 },
    { id: 'bayonet', range: 2.6, weight: 2, mult: 1.2, poise: 14, hitRadius: 1.6,
      telegraph: 0.4, strike: 0.14, attack: 0.42, recover: 0.7, cooldown: 1.2 },
  ],
  buildPrototype,
  make(opts) { return new MTEnemy(opts); },
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
    rig.bone(`sh${n}`, 'chest', [0.235 * s, 1.53, 0]);
    rig.bone(`el${n}`, `sh${n}`, [0.30 * s, 1.19, 0.02]);
    rig.bone(`hd${n}`, `el${n}`, [0.30 * s, 0.90, 0.10]);
    rig.bone(`hp${n}`, 'pelvis', [0.135 * s, 0.90, 0]);
    rig.bone(`kn${n}`, `hp${n}`, [0.145 * s, 0.50, 0.03]);
    rig.bone(`ft${n}`, `kn${n}`, [0.145 * s, 0.08, -0.01]);
  }

  /* --- torso: layered angular plate over a dark chassis --- */
  const core = loft(rectCross(0.3, 14), [
    { y: 0.86, sx: 0.145, sz: 0.105 },
    { y: 1.10, sx: 0.150, sz: 0.110 },
    { y: 1.36, sx: 0.185, sz: 0.125 },
    { y: 1.56, sx: 0.170, sz: 0.115 },
  ]);
  rig.attachBlend(tint(core, PLATE_DARK, 0.03), 'pelvis', 'chest', 1.4);

  const breast = place(slab(0.40, 0.30, 0.24, 0.035), { pos: [0, 1.40, 0.01] });
  rig.attach(tint(breast, PLATE, 0.03), 'chest');
  const gorget = place(slab(0.26, 0.09, 0.20, 0.025), { pos: [0, 1.58, 0.0] });
  rig.attach(tint(gorget, PLATE_DARK), 'chest');
  const abdo = place(slab(0.30, 0.20, 0.20, 0.03), { pos: [0, 1.16, 0.0] });
  rig.attach(tint(abdo, PLATE, 0.03), 'spine');
  const belt = place(slab(0.34, 0.10, 0.24, 0.02), { pos: [0, 0.96, 0] });
  rig.attach(tint(belt, PLATE_DARK), 'pelvis');
  const skirtF = place(slab(0.26, 0.20, 0.05, 0.015), { pos: [0, 0.84, 0.12], rot: [0.16, 0, 0] });
  rig.attach(tint(skirtF, PLATE), 'pelvis');
  const skirtB = place(slab(0.26, 0.20, 0.05, 0.015), { pos: [0, 0.84, -0.12], rot: [-0.16, 0, 0] });
  rig.attach(tint(skirtB, PLATE), 'pelvis');

  // magitek core: the red furnace behind the chest plate
  const coreGlow = place(slab(0.11, 0.11, 0.06, 0.02), { pos: [0, 1.42, 0.135] });
  rig.attach(glow(tint(coreGlow, 0x3a0d05), MAGITEK, 3.0), 'chest');
  for (let i = 0; i < 3; i++) {
    const vent = place(slab(0.20, 0.016, 0.03, 0.004), { pos: [0, 1.24 + i * 0.045, 0.115] });
    rig.attach(glow(tint(vent, 0x2a0a04), MAGITEK, 1.6), 'spine');
  }
  // back power unit
  const pack = place(slab(0.28, 0.30, 0.14, 0.03), { pos: [0, 1.38, -0.16] });
  rig.attach(tint(pack, PLATE_DARK, 0.03), 'chest');
  for (const s of [-1, 1]) {
    const t = place(loft(circleCross(8), [{ y: 0, sx: 0.035 }, { y: 0.30, sx: 0.028 }]),
      { pos: [0.085 * s, 1.44, -0.23], rot: [0.2, 0, 0] });
    rig.attach(tint(t, TRIM), 'chest');
    const cap = place(blob(0.032, 0.02, 0.032, 7, 5), { pos: [0.085 * s, 1.74, -0.29] });
    rig.attach(glow(tint(cap, 0x3a0d05), MAGITEK, 2.0), 'chest');
  }

  /* --- head: faceless helm, single visor slit --- */
  const neck = place(loft(circleCross(8), [{ y: 1.58, sx: 0.055 }, { y: 1.68, sx: 0.055 }]), {});
  rig.attachBlend(tint(neck, JOINT), 'chest', 'head', 1.0);
  const helm = place(slab(0.20, 0.22, 0.23, 0.045), { pos: [0, 1.78, 0.0] });
  rig.attach(tint(helm, PLATE, 0.03), 'head');
  const crest = place(slab(0.045, 0.18, 0.22, 0.02), { pos: [0, 1.90, -0.01] });
  rig.attach(tint(crest, PLATE_DARK), 'head');
  const chin = place(slab(0.15, 0.09, 0.10, 0.02), { pos: [0, 1.685, 0.07] });
  rig.attach(tint(chin, PLATE_DARK), 'head');
  const visor = place(slab(0.165, 0.032, 0.03, 0.008), { pos: [0, 1.795, 0.122] });
  rig.attach(glow(tint(visor, 0x3d0e05), MAGITEK, 4.5), 'head');
  const visorRim = place(slab(0.19, 0.075, 0.035, 0.012), { pos: [0, 1.795, 0.108] });
  rig.attach(tint(visorRim, JOINT), 'head');

  /* --- arms --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const pauldron = place(slab(0.19, 0.17, 0.21, 0.035), { pos: [0.255 * s, 1.545, 0], rot: [0, 0, -0.24 * s] });
    rig.attach(tint(pauldron, PLATE, 0.03), `sh${n}`);
    const paulTrim = place(slab(0.055, 0.14, 0.20, 0.012), { pos: [0.335 * s, 1.53, 0], rot: [0, 0, -0.24 * s] });
    rig.attach(tint(paulTrim, TRIM), `sh${n}`);

    const upArm = tube([P(0.235 * s, 1.50, 0), P(0.27 * s, 1.34, 0.01), P(0.30 * s, 1.20, 0.02)],
      [0.062, 0.056, 0.05], { radialSeg: 8 });
    rig.attachBlend(tint(upArm, JOINT), `sh${n}`, `el${n}`, 1.0);
    const upPlate = place(slab(0.13, 0.20, 0.13, 0.022), { pos: [0.265 * s, 1.35, 0.005] });
    rig.attach(tint(upPlate, PLATE, 0.03), `sh${n}`);

    const elbow = place(blob(0.055, 0.055, 0.055, 8, 6), { pos: [0.30 * s, 1.19, 0.02] });
    rig.attach(tint(elbow, JOINT), `el${n}`);
    const loArm = tube([P(0.30 * s, 1.18, 0.02), P(0.30 * s, 1.04, 0.06), P(0.30 * s, 0.92, 0.10)],
      [0.05, 0.046, 0.042], { radialSeg: 8 });
    rig.attachBlend(tint(loArm, JOINT), `el${n}`, `hd${n}`, 1.0);
    const bracer = place(slab(0.115, 0.18, 0.115, 0.02), { pos: [0.30 * s, 1.06, 0.06] });
    rig.attach(tint(bracer, PLATE, 0.03), `el${n}`);
    const hand = place(slab(0.075, 0.10, 0.06, 0.018), { pos: [0.30 * s, 0.875, 0.115] });
    rig.attach(tint(hand, PLATE_DARK), `hd${n}`);
  }

  /* --- legs --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const thigh = tube([P(0.135 * s, 0.90, 0), P(0.14 * s, 0.70, 0.02), P(0.145 * s, 0.52, 0.03)],
      [0.075, 0.068, 0.058], { radialSeg: 8 });
    rig.attachBlend(tint(thigh, JOINT), `hp${n}`, `kn${n}`, 1.0);
    const thighP = place(slab(0.155, 0.30, 0.16, 0.028), { pos: [0.14 * s, 0.71, 0.015] });
    rig.attach(tint(thighP, PLATE, 0.03), `hp${n}`);
    const knee = place(slab(0.13, 0.11, 0.13, 0.03), { pos: [0.145 * s, 0.50, 0.045] });
    rig.attach(tint(knee, TRIM), `kn${n}`);
    const shin = tube([P(0.145 * s, 0.49, 0.03), P(0.145 * s, 0.30, 0.015), P(0.145 * s, 0.12, 0.0)],
      [0.052, 0.046, 0.042], { radialSeg: 8 });
    rig.attachBlend(tint(shin, JOINT), `kn${n}`, `ft${n}`, 1.0);
    const shinP = place(slab(0.135, 0.30, 0.145, 0.025), { pos: [0.145 * s, 0.31, 0.02] });
    rig.attach(tint(shinP, PLATE, 0.03), `kn${n}`);
    const foot = place(slab(0.145, 0.09, 0.30, 0.025), { pos: [0.145 * s, 0.055, 0.06] });
    rig.attach(tint(foot, PLATE_DARK), `ft${n}`);
    const toe = place(slab(0.13, 0.055, 0.08, 0.015), { pos: [0.145 * s, 0.045, 0.20] });
    rig.attach(tint(toe, TRIM), `ft${n}`);
  }

  /* --- magitek rifle, welded to the right hand --- */
  const gunParts = [];
  gunParts.push(tint(place(slab(0.055, 0.09, 0.46, 0.012), { pos: [0.30, 0.90, 0.30] }), PLATE_DARK));
  gunParts.push(tint(place(loft(circleCross(8), [{ y: 0, sx: 0.020 }, { y: 0.30, sx: 0.017 }]),
    { pos: [0.30, 0.905, 0.48], rot: [Math.PI / 2, 0, 0] }), TRIM));
  gunParts.push(tint(place(slab(0.035, 0.13, 0.06, 0.01), { pos: [0.30, 0.82, 0.20], rot: [0.3, 0, 0] }), JOINT));
  gunParts.push(tint(place(slab(0.045, 0.10, 0.09, 0.012), { pos: [0.30, 0.965, 0.16] }), PLATE));
  gunParts.push(glow(tint(place(slab(0.02, 0.03, 0.14, 0.005), { pos: [0.328, 0.945, 0.30] }), 0x3a0d05), MAGITEK, 2.2));
  gunParts.push(glow(tint(place(slab(0.02, 0.03, 0.14, 0.005), { pos: [0.272, 0.945, 0.30] }), 0x3a0d05), MAGITEK, 2.2));
  for (const g of gunParts) rig.attach(g, 'hdR');

  const mat = creatureMaterial({
    roughness: 0.48, metalness: 0.42,
    normalMap: metalNormal(), normalScale: 0.22, roughnessMap: metalRoughness(),
  });
  return rig.build(mat, { radius: 2.2 });
}

class MTEnemy extends Enemy {
  constructor(opts) { super(MT_SOLDIER, opts); }

  /** World-space muzzle position — the combat system spawns tracers here. */
  muzzle(out = new THREE.Vector3()) {
    const b = this.rig && this.rig.byName.get('hdR');
    if (!b) return this.centre(out);
    b.updateWorldMatrix(true, false);
    return out.set(0.0, 0.02, 0.62).applyMatrix4(b.matrixWorld);
  }

  pose(state, t) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n, x, y, z) => poseBone(rig, n, x, y, z);
    // rifle carried at low ready by default
    const ready = (k = 1) => {
      S('shR', -1.15 * k, -0.30 * k, -0.30 * k);
      S('elR', -1.20 * k, 0, 0);
      S('hdR', 0.10 * k, 0.20 * k, 0);
      S('shL', -1.05 * k, 0.55 * k, 0.55 * k);
      S('elL', -1.55 * k, 0, 0);
      S('hdL', 0, -0.5 * k, 0);
    };

    switch (state) {
      case 'approach':
      case 'run': {
        const ph = t * 7.2;
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          const o = s < 0 ? 0 : Math.PI;
          S(`hp${n}`, Math.sin(ph + o) * 0.55, 0, 0);
          S(`kn${n}`, 0.15 + Math.max(0, Math.sin(ph + o + 1.5)) * 0.85, 0, 0);
          S(`ft${n}`, -0.15 - Math.sin(ph + o) * 0.2, 0, 0);
        }
        ready(1);
        S('spine', 0.06, Math.sin(ph) * 0.05, 0);
        S('chest', 0.04, -Math.sin(ph) * 0.08, 0);
        S('head', 0, Math.sin(ph * 0.5) * 0.1, 0);
        this.visual.position.y = Math.abs(Math.sin(ph)) * 0.035;
        break;
      }
      case 'telegraph': {
        // shoulder the rifle and sight down it
        const k = Math.min(1, this.stateTime / 0.30);
        S('shR', -1.5 - 0.05 * k, -0.55 * k, -0.55 * k);
        S('elR', -1.35, 0, 0);
        S('hdR', 0.25 * k, 0.35 * k, 0);
        S('shL', -1.35, 0.75 * k, 0.75 * k);
        S('elL', -1.7, 0, 0);
        S('chest', -0.04, -0.16 * k, 0);
        S('head', 0.05 * k, -0.10 * k, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, (s < 0 ? -0.18 : 0.10) * k, 0, 0);
          S(`kn${n}`, 0.28 * k, 0, 0);
          S(`ft${n}`, -0.12 * k, 0, 0);
        }
        break;
      }
      case 'attack': {
        // recoil kick on each shot
        const kick = Math.exp(-((this.stateTime % 0.14) * 26)) * 0.28;
        S('shR', -1.55 - kick, -0.55, -0.55);
        S('elR', -1.35 + kick * 1.4, 0, 0);
        S('hdR', 0.25, 0.35, 0);
        S('shL', -1.35 - kick * 0.5, 0.75, 0.75);
        S('elL', -1.7 + kick, 0, 0);
        S('chest', -0.04 + kick * 0.4, -0.16, 0);
        S('head', 0.05, -0.10, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, (s < 0 ? -0.18 : 0.10), 0, 0);
          S(`kn${n}`, 0.28, 0, 0);
        }
        break;
      }
      case 'flinch': {
        const k = Math.exp(-this.stateTime * 8) * (1 - Math.min(1, this.stateTime / 0.35));
        ready(1);
        S('spine', 0.30 * k, Math.sin(this.stateTime * 40) * 0.25 * k, 0);
        S('chest', 0.20 * k, 0, 0.15 * k);
        S('head', -0.35 * k, 0.25 * k, 0);
        S('shR', -1.15 + 0.7 * k, -0.30, -0.30);
        break;
      }
      case 'stagger': {
        const k = Math.min(1, this.stateTime / 0.18) * Math.max(0, 1 - this.stateTime / 2.2);
        S('spine', 0.45 * k, 0.25 * k, 0);
        S('chest', 0.30 * k, 0, 0.25 * k);
        S('head', -0.5 * k, 0.3 * k, 0);
        S('shR', -0.5 * k, -0.2, 0.8 * k);
        S('elR', -0.6, 0, 0);
        S('shL', -0.4 * k, 0.2, -0.8 * k);
        S('elL', -0.6, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, -0.55 * k, 0, 0); S(`kn${n}`, 1.0 * k, 0, 0); S(`ft${n}`, -0.4 * k, 0, 0);
        }
        this.visual.position.y = -0.20 * k;
        break;
      }
      case 'death': {
        const k = Math.min(1, this.stateTime / 0.6);
        const e = 1 - Math.pow(1 - k, 3);
        this.visual.rotation.x = e * 1.4;
        this.visual.position.y = -0.45 * e;
        S('spine', -0.2 * e, 0, 0);
        S('head', 0.4 * e, 0, 0);
        S('shR', 0.9 * e, 0, 0.7 * e); S('shL', 0.9 * e, 0, -0.7 * e);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, -0.7 * e, 0, 0); S(`kn${n}`, 1.2 * e, 0, 0);
        }
        break;
      }
      default: {
        const b = Math.sin(t * 1.3) * 0.02;
        ready(1);
        S('spine', b, 0, 0);
        S('chest', b * 0.5, 0, 0);
        S('head', 0, Math.sin(t * 0.42) * 0.22, 0);
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

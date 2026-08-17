import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.js';
import { Enemy, metalNormal, metalRoughness } from './EnemyBase.js';
import {
  tube, blob, slab, spike, place, tint, glow, rectCross, loft, circleCross, bladeCross,
} from '../../combat/GeoKit.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

const IRON = 0x2c2e33;
const IRON_DARK = 0x15161a;
const IRON_LIGHT = 0x44484f;
const RUNE = 0xff5a12;
const BLADE = 0x5a6068;

/**
 * Iron Giant — the armour-plated colossus that drops out of the daemon
 * portals at night. Five and a half metres of riveted iron with no face,
 * only a burning slit under the horned helm, dragging a greatsword longer
 * than a car. Everything about it is built to read at silhouette scale.
 */
export const IRON_GIANT = {
  key: 'irongiant',
  questId: 'iron_giant',
  faction: 'daemon',
  expClass: 'elite',
  superArmour: true,
  staggerDuration: 3.2,
  stats: {
    name: 'Iron Giant', hp: 14800, poise: 260, speed: 2.1, attackRange: 5.2,
    aggroRange: 40, radius: 1.5, height: 5.4, damage: 460, level: 46,
  },
  weakness: 'lightning',
  resistPct: { light: 175, dark: 0, lightning: 165, fire: 90, ice: 100 },
  weakTo: ['greatsword'],
  resistsWeapon: ['firearm'],
  senses: { sight: 40, fov: 1.8, hearing: 26, nocturnal: true },
  drops: [
    { id: 'rotten_splinterbone', chance: 0.7, count: 2 },
    { id: 'mythril_shaft', chance: 0.2, count: 1 },
  ],
  timing: { telegraph: 1.15, strike: 0.28, attack: 0.9, recover: 1.5 },
  attacks: [
    { id: 'cleave', range: 5.6, weight: 3, mult: 1.0, poise: 40, hitRadius: 4.0, arc: 1.1,
      telegraph: 1.15, strike: 0.28, attack: 0.9, recover: 1.5, cooldown: 2.2 },
    { id: 'sweep', range: 6.4, weight: 2, mult: 1.2, poise: 55, hitRadius: 5.2, arc: 2.0, aoe: true,
      telegraph: 1.35, strike: 0.32, attack: 1.0, recover: 1.8, cooldown: 5, unblockable: true },
  ],
  buildPrototype,
  make(opts) { return new IronGiantEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('pelvis', 'root', [0, 2.55, 0]);
  rig.bone('spine', 'pelvis', [0, 3.20, -0.05]);
  rig.bone('chest', 'spine', [0, 3.85, -0.05]);
  rig.bone('neck', 'chest', [0, 4.45, 0]);
  rig.bone('head', 'neck', [0, 4.72, 0.02]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`sh${n}`, 'chest', [0.78 * s, 4.28, 0]);
    rig.bone(`el${n}`, `sh${n}`, [1.02 * s, 3.32, 0.05]);
    rig.bone(`hd${n}`, `el${n}`, [1.05 * s, 2.42, 0.20]);
    rig.bone(`hp${n}`, 'pelvis', [0.42 * s, 2.50, 0]);
    rig.bone(`kn${n}`, `hp${n}`, [0.46 * s, 1.35, 0.06]);
    rig.bone(`ft${n}`, `kn${n}`, [0.46 * s, 0.22, -0.02]);
  }

  /* --- torso: a wedge of riveted plate --- */
  const core = loft(rectCross(0.32, 16), [
    { y: 2.35, sx: 0.46, sz: 0.34 },
    { y: 2.95, sx: 0.50, sz: 0.36 },
    { y: 3.55, sx: 0.66, sz: 0.42 },
    { y: 4.10, sx: 0.72, sz: 0.44 },
    { y: 4.42, sx: 0.50, sz: 0.34 },
  ]);
  rig.attachBlend(tint(core, IRON, 0.04), 'pelvis', 'chest', 1.5);

  const breast = place(slab(1.30, 0.90, 0.72, 0.12), { pos: [0, 3.95, 0.02] });
  rig.attach(tint(breast, IRON_LIGHT, 0.04), 'chest');
  const ridge = place(slab(0.18, 0.95, 0.80, 0.05), { pos: [0, 3.95, 0.06] });
  rig.attach(tint(ridge, IRON_DARK), 'chest');
  const abdo = place(slab(0.92, 0.62, 0.60, 0.08), { pos: [0, 3.18, 0] });
  rig.attach(tint(abdo, IRON, 0.04), 'spine');
  const belt = place(slab(1.10, 0.30, 0.72, 0.06), { pos: [0, 2.62, 0] });
  rig.attach(tint(belt, IRON_DARK), 'pelvis');
  for (const s of [-1, 1]) {
    const tass = place(slab(0.42, 0.90, 0.16, 0.04), { pos: [0.30 * s, 2.10, 0.28], rot: [0.18, 0, 0.06 * s] });
    rig.attach(tint(tass, IRON, 0.04), 'pelvis');
  }
  const tassB = place(slab(0.90, 0.85, 0.16, 0.05), { pos: [0, 2.12, -0.32], rot: [-0.14, 0, 0] });
  rig.attach(tint(tassB, IRON, 0.04), 'pelvis');

  // rune seams: molten light bleeding out between the plates
  for (let i = 0; i < 5; i++) {
    const seam = place(slab(0.86 - i * 0.10, 0.045, 0.05, 0.012), { pos: [0, 3.28 + i * 0.16, 0.32] });
    rig.attach(glow(tint(seam, 0x2a0e03), RUNE, 1.4 + i * 0.35), 'spine');
  }
  const heart = place(slab(0.28, 0.28, 0.10, 0.04), { pos: [0, 3.92, 0.40], rot: [0, 0, Math.PI * 0.25] });
  rig.attach(glow(tint(heart, 0x330f03), RUNE, 3.4), 'chest');

  /* --- head: horned helm, no face, one burning slit --- */
  const neck = place(loft(circleCross(9), [{ y: 4.36, sx: 0.20 }, { y: 4.60, sx: 0.19 }]), {});
  rig.attachBlend(tint(neck, IRON_DARK), 'chest', 'head', 1.0);
  const helm = place(slab(0.62, 0.62, 0.66, 0.12), { pos: [0, 4.80, 0.02] });
  rig.attach(tint(helm, IRON_LIGHT, 0.03), 'head');
  const brow = place(slab(0.66, 0.16, 0.24, 0.04), { pos: [0, 4.76, 0.30], rot: [0.24, 0, 0] });
  rig.attach(tint(brow, IRON_DARK), 'head');
  const jawPlate = place(slab(0.46, 0.24, 0.34, 0.05), { pos: [0, 4.52, 0.18] });
  rig.attach(tint(jawPlate, IRON, 0.03), 'head');
  const slit = place(slab(0.44, 0.075, 0.06, 0.015), { pos: [0, 4.665, 0.335] });
  rig.attach(glow(tint(slit, 0x3a1004), RUNE, 5.0), 'head');
  const crest = place(slab(0.09, 0.42, 0.60, 0.03), { pos: [0, 5.10, -0.02] });
  rig.attach(tint(crest, IRON_DARK), 'head');
  for (const s of [-1, 1]) {
    const horn = place(spike(0.13, 0.95, 6), { pos: [0.28 * s, 4.94, -0.06], rot: [-0.35, 0, 0.95 * s] });
    rig.attach(tint(horn, IRON_DARK), 'head');
    const horn2 = place(spike(0.07, 0.42, 5), { pos: [0.30 * s, 4.62, 0.10], rot: [0.2, 0, 1.35 * s] });
    rig.attach(tint(horn2, IRON_DARK), 'head');
  }

  /* --- arms: enormous, plate over cable --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const pauldron = place(slab(0.78, 0.66, 0.86, 0.10), { pos: [0.90 * s, 4.34, 0], rot: [0, 0, -0.22 * s] });
    rig.attach(tint(pauldron, IRON_LIGHT, 0.04), `sh${n}`);
    for (let i = 0; i < 3; i++) {
      const sp = place(spike(0.075, 0.30, 5), { pos: [(1.06 + i * 0.02) * s, 4.52 - i * 0.24, -0.02], rot: [0, 0, 1.25 * s] });
      rig.attach(tint(sp, IRON_DARK), `sh${n}`);
    }
    const upArm = tube([P(0.80 * s, 4.22, 0), P(0.94 * s, 3.76, 0.02), P(1.02 * s, 3.36, 0.05)],
      [0.30, 0.27, 0.22], { radialSeg: 9 });
    rig.attachBlend(tint(upArm, IRON, 0.04), `sh${n}`, `el${n}`, 1.0);
    const elbow = place(slab(0.44, 0.36, 0.44, 0.07), { pos: [1.02 * s, 3.30, 0.05] });
    rig.attach(tint(elbow, IRON_LIGHT, 0.03), `el${n}`);
    const loArm = tube([P(1.02 * s, 3.26, 0.06), P(1.04 * s, 2.84, 0.13), P(1.05 * s, 2.46, 0.20)],
      [0.24, 0.235, 0.20], { radialSeg: 9 });
    rig.attachBlend(tint(loArm, IRON, 0.04), `el${n}`, `hd${n}`, 1.0);
    const vamb = place(slab(0.50, 0.72, 0.50, 0.07), { pos: [1.04 * s, 2.86, 0.14] });
    rig.attach(tint(vamb, IRON_LIGHT, 0.03), `el${n}`);
    const seam = place(slab(0.06, 0.55, 0.10, 0.015), { pos: [(1.30 * s), 2.86, 0.14] });
    rig.attach(glow(tint(seam, 0x2a0e03), RUNE, 1.5), `el${n}`);
    const fist = place(slab(0.44, 0.46, 0.40, 0.09), { pos: [1.05 * s, 2.32, 0.24] });
    rig.attach(tint(fist, IRON_DARK, 0.03), `hd${n}`);
  }

  /* --- legs --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const thigh = tube([P(0.42 * s, 2.50, 0), P(0.44 * s, 1.92, 0.04), P(0.46 * s, 1.40, 0.06)],
      [0.34, 0.31, 0.25], { radialSeg: 9 });
    rig.attachBlend(tint(thigh, IRON, 0.04), `hp${n}`, `kn${n}`, 1.0);
    const thighP = place(slab(0.58, 0.92, 0.56, 0.08), { pos: [0.43 * s, 1.98, 0.03] });
    rig.attach(tint(thighP, IRON_LIGHT, 0.03), `hp${n}`);
    const knee = place(slab(0.50, 0.40, 0.50, 0.08), { pos: [0.46 * s, 1.34, 0.10] });
    rig.attach(tint(knee, IRON_DARK), `kn${n}`);
    const shin = tube([P(0.46 * s, 1.30, 0.05), P(0.46 * s, 0.80, 0.02), P(0.46 * s, 0.32, -0.01)],
      [0.25, 0.235, 0.20], { radialSeg: 9 });
    rig.attachBlend(tint(shin, IRON, 0.04), `kn${n}`, `ft${n}`, 1.0);
    const shinP = place(slab(0.46, 0.80, 0.48, 0.07), { pos: [0.46 * s, 0.82, 0.06] });
    rig.attach(tint(shinP, IRON_LIGHT, 0.03), `kn${n}`);
    const foot = place(slab(0.52, 0.28, 1.00, 0.07), { pos: [0.46 * s, 0.16, 0.18] });
    rig.attach(tint(foot, IRON_DARK, 0.03), `ft${n}`);
    for (let i = -1; i <= 1; i++) {
      const claw = place(spike(0.07, 0.24, 5), { pos: [(0.46 + i * 0.16) * s, 0.10, 0.68], rot: [1.45, 0, 0] });
      rig.attach(tint(claw, IRON_LIGHT), `ft${n}`);
    }
  }

  /* --- the greatsword, gripped in the right fist --- */
  const swordParts = [];
  const grip = place(loft(circleCross(8), [{ y: 0, sx: 0.075 }, { y: 0.9, sx: 0.07 }]),
    { pos: [1.05, 1.85, 0.28] });
  swordParts.push(tint(grip, IRON_DARK));
  const cross = place(slab(0.95, 0.16, 0.24, 0.04), { pos: [1.05, 2.78, 0.28] });
  swordParts.push(tint(cross, IRON_LIGHT));
  const bl = place(loft(bladeCross(12), [
    { y: 0.00, sx: 0.34, sz: 0.075 },
    { y: 0.55, sx: 0.40, sz: 0.080 },
    { y: 2.60, sx: 0.36, sz: 0.070 },
    { y: 3.35, sx: 0.24, sz: 0.050 },
    { y: 3.70, sx: 0.045, sz: 0.018 },
  ]), { pos: [1.05, 2.86, 0.28] });
  swordParts.push(tint(bl, BLADE, 0.05));
  const fuller = place(loft(rectCross(0.4, 8), [
    { y: 0.30, sx: 0.05, sz: 0.09 }, { y: 3.10, sx: 0.035, sz: 0.085 },
  ]), { pos: [1.05, 2.86, 0.28] });
  swordParts.push(glow(tint(fuller, 0x3a1405), RUNE, 1.8));
  const pommel = place(blob(0.11, 0.11, 0.11, 8, 6), { pos: [1.05, 1.78, 0.28] });
  swordParts.push(tint(pommel, IRON_LIGHT));
  for (const g of swordParts) rig.attach(g, 'hdR');

  const mat = creatureMaterial({
    roughness: 0.58, metalness: 0.4,
    normalMap: metalNormal(), normalScale: 0.22, roughnessMap: metalRoughness(),
  });
  return rig.build(mat, { radius: 6.5 });
}

class IronGiantEnemy extends Enemy {
  constructor(opts) { super(IRON_GIANT, opts); }

  /** World-space sword tip, for the overhead-cleave hit sweep and trail. */
  swordTip(out = new THREE.Vector3()) {
    const b = this.rig && this.rig.byName.get('hdR');
    if (!b) return this.centre(out);
    b.updateWorldMatrix(true, false);
    return out.set(0.0, 4.30, 0.0).applyMatrix4(b.matrixWorld);
  }

  pose(state, t) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n, x, y, z) => poseBone(rig, n, x, y, z);
    const carry = (k = 1) => {
      // sword resting point-down at the side
      S('shR', 0.35 * k, 0, -0.30 * k);
      S('elR', -0.55 * k, 0, 0);
      S('hdR', -0.35 * k, 0, 0);
      S('shL', 0.15 * k, 0, -0.22 * k);
      S('elL', -0.45 * k, 0, 0);
    };

    switch (state) {
      case 'approach':
      case 'walk': {
        const ph = t * 3.0;
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          const o = s < 0 ? 0 : Math.PI;
          S(`hp${n}`, Math.sin(ph + o) * 0.48, 0, 0);
          S(`kn${n}`, 0.12 + Math.max(0, Math.sin(ph + o + 1.4)) * 0.75, 0, 0);
          S(`ft${n}`, -0.1 - Math.sin(ph + o) * 0.22, 0, 0);
        }
        carry(1);
        S('shL', 0.15 - Math.sin(ph) * 0.35, 0, -0.22);
        S('spine', 0.05, Math.sin(ph) * 0.07, 0);
        S('chest', 0.03, -Math.sin(ph) * 0.10, 0);
        S('head', 0.05, Math.sin(ph * 0.5) * 0.08, 0);
        this.visual.position.y = Math.abs(Math.sin(ph)) * 0.09;
        break;
      }
      case 'telegraph': {
        // rear back, sword hauled overhead — a full second of warning
        const k = Math.min(1, this.stateTime / 0.9);
        const e = k * k * (3 - 2 * k);
        S('shR', 0.35 - 3.40 * e, -0.35 * e, -0.30 + 0.55 * e);
        S('elR', -0.55 - 0.75 * e, 0, 0);
        S('hdR', -0.35 + 0.25 * e, 0, 0);
        S('shL', 0.15 - 1.20 * e, 0.4 * e, -0.22);
        S('elL', -0.45 - 0.8 * e, 0, 0);
        S('spine', -0.22 * e, -0.28 * e, 0);
        S('chest', -0.18 * e, -0.20 * e, 0);
        S('head', 0.12 * e, 0.20 * e, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, (s < 0 ? 0.35 : -0.22) * e, 0, 0);
          S(`kn${n}`, 0.42 * e, 0, 0);
          S(`ft${n}`, -0.2 * e, 0, 0);
        }
        break;
      }
      case 'attack': {
        // the cleave
        const k = Math.min(1, this.stateTime / 0.30);
        const e = 1 - Math.pow(1 - k, 3.2);
        S('shR', -3.05 + 3.85 * e, -0.35 + 0.35 * e, 0.25 - 0.15 * e);
        S('elR', -1.30 + 0.85 * e, 0, 0);
        S('hdR', -0.10 - 0.30 * e, 0, 0);
        S('shL', -1.05 + 0.9 * e, 0.4, -0.22);
        S('elL', -1.25 + 0.6 * e, 0, 0);
        S('spine', -0.22 + 0.62 * e, -0.28 + 0.36 * e, 0);
        S('chest', -0.18 + 0.48 * e, -0.20 + 0.26 * e, 0);
        S('head', 0.12 - 0.30 * e, 0.20 - 0.22 * e, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, (s < 0 ? 0.35 : -0.22) * (1 - e) - 0.30 * e, 0, 0);
          S(`kn${n}`, 0.42 + 0.35 * e, 0, 0);
          S(`ft${n}`, -0.2 - 0.15 * e, 0, 0);
        }
        this.visual.position.y = -0.35 * e;
        break;
      }
      case 'flinch': {
        const k = Math.exp(-this.stateTime * 9) * (1 - Math.min(1, this.stateTime / 0.3));
        carry(1);
        S('spine', 0.16 * k, 0.12 * k, 0);
        S('chest', 0.12 * k, 0, 0.08 * k);
        S('head', -0.2 * k, 0.15 * k, 0);
        break;
      }
      case 'stagger': {
        const k = Math.min(1, this.stateTime / 0.3) * Math.max(0, 1 - this.stateTime / 2.4);
        S('spine', 0.42 * k, 0.2 * k, 0);
        S('chest', 0.30 * k, 0, 0.2 * k);
        S('head', -0.45 * k, 0.25 * k, 0);
        S('shR', 0.35 + 0.6 * k, 0, -0.30 + 0.7 * k);
        S('elR', -0.55 - 0.4 * k, 0, 0);
        S('shL', 0.15 + 0.5 * k, 0, -0.22 - 0.7 * k);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, -0.5 * k, 0, 0); S(`kn${n}`, 1.0 * k, 0, 0); S(`ft${n}`, -0.45 * k, 0, 0);
        }
        this.visual.position.y = -0.55 * k;
        break;
      }
      case 'death': {
        const k = Math.min(1, this.stateTime / 1.4);
        const e = 1 - Math.pow(1 - k, 2.4);
        this.visual.rotation.x = e * 1.35;
        this.visual.position.y = -1.5 * e;
        S('spine', -0.25 * e, 0, 0);
        S('head', 0.5 * e, 0, 0);
        S('shR', 1.0 * e, 0, 0.8 * e);
        S('shL', 1.0 * e, 0, -0.8 * e);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, -0.9 * e, 0, 0); S(`kn${n}`, 1.4 * e, 0, 0);
        }
        break;
      }
      default: {
        const b = Math.sin(t * 0.9) * 0.03;
        carry(1);
        S('spine', 0.04 + b, 0, 0);
        S('chest', 0.02 + b * 0.5, 0, 0);
        S('head', 0.06, Math.sin(t * 0.33) * 0.16, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, 0.04, 0, 0); S(`kn${n}`, 0.10, 0, 0); S(`ft${n}`, -0.08, 0, 0);
        }
        this.visual.position.y = 0;
        break;
      }
    }
  }
}

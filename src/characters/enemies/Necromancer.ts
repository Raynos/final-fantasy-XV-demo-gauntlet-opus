import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.ts';
import { Enemy, organicNormal, organicRoughness } from './EnemyBase.ts';
import {
  tube, blob, spike, slab, place, tint, glow, loft, circleCross,
} from '../../combat/GeoKit.ts';

const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const ROBE = 0x3d3342;
const ROBE_DARK = 0x241d28;
const ROBE_ASH = 0x574d57;
const STAIN = 0x5f5330;
const BONE = 0xb6ae97;
const BONE_DARK = 0x6b6350;
const VOID = 0x050307;
const WITCH = 0x74ff3a;

/** Number of torn shreds the hem dissolves into. */
const SHREDS = 12;

/** Fluted robe cross-section — a soft-lobed ring, not a cylinder. */
function robeCross(n: number, lobes: number, depth: number) {
  const c = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 1 + Math.sin(a * lobes) * depth;
    c.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return c;
}

/**
 * Necromancer — the daemon that never touches the ground.
 * Two and a half metres of ragged hooded robe with nothing inside the hood but
 * two burning green points, long skeletal fingers frozen in a casting frame,
 * and a scythe-staff of fused vertebrae. The hem does not end; it comes apart
 * into shreds that trail behind it as it drifts.
 */
export const NECROMANCER = {
  key: 'necromancer',
  questId: 'necromancer',
  faction: 'daemon',
  expClass: 'daemon',
  stats: {
    name: 'Necromancer', hp: 4200, poise: 70, speed: 3.0, attackRange: 22,
    aggroRange: 40, radius: 0.5, height: 2.4, damage: 340, level: 38,
  },
  weakness: 'light',
  resistPct: { light: 200, dark: 0, fire: 60, ice: 60, lightning: 60 },
  senses: { sight: 40, fov: 2.6, hearing: 16, nocturnal: true },
  /** Metres it floats above the terrain — it never touches the ground. */
  hover: 0.35,
  drops: [
    { id: 'dark_matter_shard', chance: 0.35, count: 1 },
  ],
  timing: { telegraph: 1.0, strike: 0.3, attack: 0.9, recover: 1.2 },
  attacks: [
    // a bolt of dark: both hands up, the hood blazing for a full second
    {
      id: 'bolt', range: 22, minRange: 4, weight: 4, mult: 1.0, poise: 24, hitRadius: 1.6,
      ranged: true, element: 'dark', telegraph: 1.0, strike: 0.28, attack: 0.85,
      recover: 1.1, cooldown: 2.6, tracking: 1.6,
    },
    // it rises and spreads its arms, and everything near it burns cold
    {
      id: 'nova', range: 9, weight: 2, mult: 1.5, poise: 60, hitRadius: 6, arc: Math.PI,
      aoe: true, element: 'dark', telegraph: 1.8, strike: 0.32, attack: 1.1,
      recover: 1.6, cooldown: 11, unblockable: true,
    },
    // a staff sweep for anything that gets inside the robe
    {
      id: 'reap', range: 3.0, weight: 3, mult: 0.85, poise: 34, hitRadius: 3.0, arc: 2.0,
      telegraph: 0.5, strike: 0.18, attack: 0.55, recover: 0.8, cooldown: 1.8,
    },
  ],
  buildPrototype,
  make(opts: any) { return new NecromancerEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('pelvis', 'root', [0, 1.22, 0]);
  rig.bone('spine', 'pelvis', [0, 1.58, -0.02]);
  rig.bone('chest', 'spine', [0, 1.92, -0.04]);
  rig.bone('neck', 'chest', [0, 2.10, 0]);
  rig.bone('head', 'neck', [0, 2.22, 0.02]);
  rig.bone('hood', 'head', [0, 2.34, 0.0]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`sh${n}`, 'chest', [0.30 * s, 2.00, -0.02]);
    rig.bone(`el${n}`, `sh${n}`, [0.48 * s, 1.74, 0.14]);
    rig.bone(`hd${n}`, `el${n}`, [0.38 * s, 1.72, 0.44]);
  }
  // one bone per hem shred, so the tatters can trail independently
  for (let i = 0; i < SHREDS; i++) {
    const a = (i / SHREDS) * Math.PI * 2;
    rig.bone(`hem${i}`, 'pelvis', [Math.sin(a) * 0.50, 0.98, Math.cos(a) * 0.46]);
  }

  /* --- the robe: a long flared loft, pinched at the waist --- */
  const robe = loft(robeCross(14, 7, 0.075), [
    { y: 0.94, sx: 0.60, sz: 0.55 },
    { y: 1.16, sx: 0.52, sz: 0.48 },
    { y: 1.44, sx: 0.38, sz: 0.35 },
    { y: 1.64, sx: 0.30, sz: 0.28 },
    { y: 1.86, sx: 0.29, sz: 0.27 },
    { y: 2.06, sx: 0.24, sz: 0.22 },
  ], { capStart: false });
  rig.attachBlend(tint(robe, ROBE, 0.06), 'pelvis', 'chest', 1.6);

  // an inner lining, a shade lighter, showing where the robe hangs open
  const lining = loft(circleCross(9), [
    { y: 1.02, sx: 0.44, sz: 0.40 },
    { y: 1.50, sx: 0.28, sz: 0.26 },
    { y: 1.92, sx: 0.20, sz: 0.19 },
  ], { capStart: false });
  rig.attachBlend(tint(lining, ROBE_DARK), 'pelvis', 'chest', 1.4);

  // a stained sash knotted at the waist
  const sash = place(loft(circleCross(10), [
    { y: 1.34, sx: 0.34, sz: 0.31 }, { y: 1.44, sx: 0.33, sz: 0.30 },
  ]), {});
  rig.attach(tint(sash, STAIN, 0.08), 'spine');
  const knot = place(blob(0.075, 0.06, 0.055, 7, 5), { pos: [0.14, 1.36, 0.28] });
  rig.attach(tint(knot, STAIN, 0.06), 'spine');
  const tail = tube([P(0.14, 1.32, 0.28), P(0.19, 1.05, 0.30), P(0.22, 0.82, 0.26)],
    [[0.05, 0.014], [0.045, 0.012], [0.010, 0.005]], { radialSeg: 5 });
  rig.attach(tint(tail, STAIN, 0.08), 'spine');

  /* --- the hem: cut into points, and coming apart into shreds --- */
  for (let i = 0; i < SHREDS; i++) {
    const a = (i / SHREDS) * Math.PI * 2;
    // deterministic variation so no two tatters are the same length
    const v = Math.sin(i * 2.399) * 0.5 + 0.5;
    const len = 0.44 + v * 0.42;
    const w = 0.055 + v * 0.030;
    const ox = Math.sin(a), oz = Math.cos(a);
    const shred = tube([
      P(ox * 0.52, 1.00, oz * 0.48),
      P(ox * 0.54, 1.00 - len * 0.40, oz * 0.50),
      P(ox * 0.50, 1.00 - len * 0.78, oz * 0.46),
      P(ox * 0.42, 1.00 - len, oz * 0.39),
    ], [[w, w * 0.4], [w * 0.85, w * 0.34], [w * 0.45, w * 0.2], [0.006, 0.004]], { radialSeg: 5 });
    rig.attach(tint(shred, i % 3 === 0 ? ROBE_ASH : ROBE, 0.07), `hem${i}`);
  }

  /* --- shoulders: a ragged mantle over the robe --- */
  const mantle = loft(robeCross(14, 7, 0.10), [
    { y: 2.10, sx: 0.24, sz: 0.22 },
    { y: 1.98, sx: 0.40, sz: 0.36 },
    { y: 1.80, sx: 0.44, sz: 0.40 },
    { y: 1.68, sx: 0.38, sz: 0.34 },
  ], { capStart: false, capEnd: false });
  rig.attach(tint(mantle, ROBE_ASH, 0.07), 'chest');
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const sp = place(spike(0.045, 0.16 + (i % 3) * 0.05, 4),
      { pos: [Math.sin(a) * 0.40, 1.62, Math.cos(a) * 0.36], rot: [Math.PI, 0, 0] });
    rig.attach(tint(sp, ROBE, 0.07), 'chest');
  }

  /* --- the hood: a deep cowl with nothing inside it --- */
  const cowl = loft(robeCross(12, 5, 0.06), [
    { y: 2.02, sx: 0.22, sz: 0.21 },
    { y: 2.18, sx: 0.26, sz: 0.25, dz: -0.02 },
    { y: 2.34, sx: 0.24, sz: 0.24, dz: -0.05 },
    { y: 2.46, sx: 0.15, sz: 0.16, dz: -0.10 },
    { y: 2.52, sx: 0.05, sz: 0.05, dz: -0.16 },
  ], { capStart: false });
  rig.attach(tint(cowl, ROBE, 0.06), 'head');
  // the rim of the cowl, pulled forward over the void
  const rim = place(loft(circleCross(11), [
    { y: 2.10, sx: 0.235, sz: 0.10 }, { y: 2.34, sx: 0.235, sz: 0.10 },
  ]), { pos: [0, 0, 0.14] });
  rig.attach(tint(rim, ROBE_ASH, 0.05), 'head');
  const dark = place(blob(0.175, 0.145, 0.10, 10, 7), { pos: [0, 2.22, 0.10] });
  rig.attach(tint(dark, VOID), 'head');
  // two burning points where a face should be
  for (const s of [-1, 1]) {
    const p = place(blob(0.036, 0.032, 0.026, 7, 5), { pos: [0.062 * s, 2.235, 0.165] });
    rig.attach(glow(tint(p, 0x061a03), WITCH, 4.2), 'head');
  }
  // a hooked peak of bone holding the cowl's crest
  const peak = place(spike(0.035, 0.24, 5), { pos: [0, 2.46, -0.14], rot: [1.05, 0, 0] });
  rig.attach(tint(peak, BONE_DARK), 'hood');

  /* --- arms: ragged sleeves ending in skeletal hands --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const upper = tube([P(0.30 * s, 2.00, -0.02), P(0.42 * s, 1.86, 0.06), P(0.48 * s, 1.74, 0.14)],
      [0.115, 0.105, 0.095], { radialSeg: 7 });
    rig.attachBlend(tint(upper, ROBE, 0.06), `sh${n}`, `el${n}`, 1.0);
    const fore = tube([P(0.48 * s, 1.74, 0.15), P(0.44 * s, 1.73, 0.30), P(0.38 * s, 1.72, 0.44)],
      [0.10, 0.095, 0.075], { radialSeg: 7 });
    rig.attachBlend(tint(fore, ROBE, 0.06), `el${n}`, `hd${n}`, 1.0);
    // the sleeve mouth, torn into three points
    const cuff = place(loft(robeCross(9, 4, 0.14), [
      { y: 1.70, sx: 0.115, sz: 0.115 }, { y: 1.74, sx: 0.09, sz: 0.09 },
    ]), { pos: [0.40 * s, 0, 0.38] });
    rig.attach(tint(cuff, ROBE_ASH, 0.06), `hd${n}`);

    // the hand: a flat palm and five long finger bones, held in a casting frame
    const wrist = tube([P(0.38 * s, 1.72, 0.44), P(0.36 * s, 1.74, 0.52)], [0.030, 0.034], { radialSeg: 5 });
    rig.attach(tint(wrist, BONE_DARK), `hd${n}`);
    const palm = place(slab(0.085, 0.10, 0.028, 0.008), { pos: [0.355 * s, 1.79, 0.53], rot: [-0.35, 0, 0.15 * s] });
    rig.attach(tint(palm, BONE, 0.05), `hd${n}`);
    for (let f = 0; f < 4; f++) {
      const dx = (f - 1.5) * 0.028;
      const spread = (f - 1.5) * 0.045;
      const fin = tube([
        P((0.355 + dx) * s, 1.84, 0.545),
        P((0.355 + dx + spread * 0.4) * s, 1.94, 0.555),
        P((0.355 + dx + spread) * s, 2.02, 0.545),
      ], [0.013, 0.011, 0.007], { radialSeg: 4 });
      rig.attach(tint(fin, BONE, 0.05), `hd${n}`);
    }
    const thumb = tube([
      P(0.40 * s, 1.79, 0.545), P(0.46 * s, 1.83, 0.555), P(0.50 * s, 1.88, 0.545),
    ], [0.013, 0.011, 0.007], { radialSeg: 4 });
    rig.attach(tint(thumb, BONE, 0.05), `hd${n}`);
  }

  /* --- the staff: fused vertebrae under a hooked bone scythe --- */
  const staff = [];
  const shaft = tube([
    P(0.50, 0.62, 0.50), P(0.50, 1.30, 0.50), P(0.50, 2.00, 0.50), P(0.50, 2.56, 0.50),
  ], [0.030, 0.034, 0.032, 0.028], { radialSeg: 6 });
  staff.push(tint(shaft, BONE_DARK, 0.05));
  for (let i = 0; i < 6; i++) {
    const vert = place(blob(0.048, 0.030, 0.048, 6, 4), { pos: [0.50, 0.80 + i * 0.30, 0.50] });
    staff.push(tint(vert, BONE, 0.06));
    const barb = place(spike(0.016, 0.075, 4),
      { pos: [0.50, 0.80 + i * 0.30, 0.44], rot: [1.6 + (i % 2) * 0.3, 0, 0] });
    staff.push(tint(barb, BONE_DARK));
  }
  // the scythe head: a long curve of bone sweeping forward off the top
  const blade = tube([
    P(0.50, 2.58, 0.50), P(0.50, 2.74, 0.62), P(0.50, 2.78, 0.86),
    P(0.50, 2.66, 1.06), P(0.50, 2.46, 1.16),
  ], [[0.045, 0.024], [0.070, 0.020], [0.075, 0.017], [0.055, 0.013], [0.008, 0.005]], { radialSeg: 6 });
  staff.push(tint(blade, BONE, 0.06));
  const socket = place(blob(0.062, 0.055, 0.062, 7, 5), { pos: [0.50, 2.58, 0.50] });
  staff.push(tint(socket, BONE_DARK, 0.05));
  const ember = place(blob(0.036, 0.036, 0.030, 6, 5), { pos: [0.50, 2.66, 0.72] });
  staff.push(glow(tint(ember, 0x061a03), WITCH, 2.6));
  for (const g of staff) rig.attach(g, 'hdR');

  const mat = creatureMaterial({
    roughness: 0.82, metalness: 0.0,
    rim: { color: 0x6f8f7a, strength: 0.06 },
    normalMap: organicNormal(), normalScale: 0.55, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 3.0 });
}

class NecromancerEnemy extends Enemy {
  override attackId!: any;
  override rig!: any;
  override stateTime!: any;
  override visual!: any;
  constructor(opts: any) { super(NECROMANCER, opts); }

  /** Height it floats at right now — never zero, it has no feet. */
  get hover() { return NECROMANCER.hover; }

  /**
   * Drift the hem tatters. `sweep` leans them all one way (drag as it moves),
   * `life` is how much they writhe on their own.
   */
  _trail(t: number, sweep: number, life: number) {
    const rig = this.rig;
    for (let i = 0; i < SHREDS; i++) {
      const ph = t * 1.35 + i * 0.83;
      poseBone(rig, `hem${i}`,
        sweep + Math.sin(ph) * life,
        Math.sin(ph * 0.7 + 1.1) * life * 0.6,
        Math.cos(ph * 0.9) * life);
    }
  }

  override pose(state: any, t: number) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n: string, x: number, y: number, z: number) => poseBone(rig, n, x, y, z);
    const H = NECROMANCER.hover;
    // both hands up in front of the hood, fingers framing whatever it is about to do
    const frame = (k = 1) => {
      for (const s of [-1, 1]) {
        const n = s < 0 ? 'L' : 'R';
        S(`sh${n}`, -0.35 * k, 0, 0.20 * s * k);
        S(`el${n}`, -0.45 * k, 0.30 * s * k, 0);
        S(`hd${n}`, -0.25 * k, 0, 0);
      }
    };

    switch (state) {
      case 'approach':
      case 'run': {
        // it does not walk; it glides, and the robe drags behind it
        const ph = t * 1.9;
        frame(0.85);
        this._trail(t, 0.42, 0.16);
        S('spine', 0.06 + Math.sin(ph) * 0.03, Math.sin(ph * 0.6) * 0.06, 0);
        S('chest', -0.10, 0, Math.sin(ph * 0.8) * 0.05);
        S('head', 0.06, Math.sin(ph * 0.5) * 0.16, 0);
        S('hood', -0.08, 0, 0);
        this.visual.position.y = H + 0.06 + Math.sin(ph) * 0.05;
        this.visual.rotation.z = Math.sin(ph * 0.7) * 0.04;
        break;
      }
      case 'telegraph': {
        const id = this.attackId;
        if (id === 'nova') {
          // it rises, arms thrown wide, the hood blazing
          const k = Math.min(1, this.stateTime / 1.7);
          const e = k * k * (3 - 2 * k);
          const shiver = Math.sin(t * 20) * 0.03 * e;
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`sh${n}`, -0.35 - 1.55 * e, 0, (0.20 + 1.05 * e) * s);
            S(`el${n}`, -0.45 + 0.35 * e, 0.30 * s * (1 - e), 0);
            S(`hd${n}`, -0.25 - 0.35 * e, 0, 0);
          }
          S('spine', 0.06 - 0.28 * e + shiver, 0, 0);
          S('chest', -0.10 - 0.24 * e, 0, 0);
          S('head', -0.34 * e, 0, 0);
          S('hood', -0.10 * e, 0, 0);
          this._trail(t, -0.28 - 0.35 * e, 0.10 + 0.30 * e);
          this.visual.position.y = H + 0.06 + 0.85 * e;
          this.visual.rotation.z = 0;
        } else if (id === 'reap') {
          // staff cocked back across the body
          const k = Math.min(1, this.stateTime / 0.44);
          const e = k * k * (3 - 2 * k);
          S('shR', -0.35 - 0.55 * e, -1.25 * e, 0.20 - 0.55 * e);
          S('elR', -0.45 - 0.65 * e, 0.30, 0);
          S('hdR', -0.25 - 0.30 * e, 0, 0);
          S('shL', -0.35 + 0.25 * e, 0.55 * e, -0.20);
          S('elL', -0.45, -0.30, 0);
          S('spine', 0.06, -0.42 * e, 0);
          S('chest', -0.10, -0.36 * e, 0);
          S('head', 0.06, -0.30 * e, 0);
          this._trail(t, 0.12, 0.14);
          this.visual.position.y = H + 0.04;
          this.visual.rotation.z = 0;
        } else {
          // bolt: both hands raised, the two points in the hood flare
          const k = Math.min(1, this.stateTime / 0.9);
          const e = k * k * (3 - 2 * k);
          const pulse = Math.sin(this.stateTime * 16) * 0.025 * e;
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`sh${n}`, -0.35 - 0.95 * e, 0, (0.20 + 0.30 * e) * s);
            S(`el${n}`, -0.45 - 0.60 * e, 0.30 * s, 0);
            S(`hd${n}`, -0.25 - 0.45 * e + pulse, 0, 0);
          }
          S('spine', 0.06 - 0.14 * e, 0, 0);
          S('chest', -0.10 - 0.12 * e, 0, 0);
          S('head', -0.18 * e, 0, 0);
          S('hood', -0.06 * e, 0, 0);
          this._trail(t, -0.10, 0.12 + 0.10 * e);
          this.visual.position.y = H + 0.06 + 0.28 * e;
          this.visual.rotation.z = 0;
        }
        break;
      }
      case 'attack': {
        const id = this.attackId;
        if (id === 'nova') {
          const k = Math.min(1, this.stateTime / 0.34);
          const e = 1 - Math.pow(1 - k, 3);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`sh${n}`, -1.90 + 1.15 * e, 0, (1.25 - 0.55 * e) * s);
            S(`el${n}`, -0.10 - 0.35 * e, 0, 0);
            S(`hd${n}`, -0.60 + 0.35 * e, 0, 0);
          }
          S('spine', -0.22 + 0.45 * e, 0, 0);
          S('chest', -0.34 + 0.40 * e, 0, 0);
          S('head', -0.34 + 0.45 * e, 0, 0);
          this._trail(t, -0.63 + 0.95 * e, 0.40);
          this.visual.position.y = H + 0.91 - 0.62 * e;
        } else if (id === 'reap') {
          const k = Math.min(1, this.stateTime / 0.2);
          const e = 1 - Math.pow(1 - k, 3);
          S('shR', -0.90 + 0.35 * e, -1.25 + 2.30 * e, -0.35 + 0.60 * e);
          S('elR', -1.10 + 0.75 * e, 0.30, 0);
          S('hdR', -0.55 + 0.40 * e, 0, 0);
          S('shL', -0.10, 0.55 - 0.85 * e, -0.20);
          S('elL', -0.45, -0.30, 0);
          S('spine', 0.06, -0.42 + 0.95 * e, 0);
          S('chest', -0.10, -0.36 + 0.80 * e, 0);
          S('head', 0.06, -0.30 + 0.62 * e, 0);
          this._trail(t, 0.12, 0.22);
          this.visual.position.y = H + 0.04;
        } else {
          // bolt: the hands snap forward and the dark leaves them
          const k = Math.min(1, this.stateTime / 0.24);
          const e = 1 - Math.pow(1 - k, 3.2);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`sh${n}`, -1.30 + 0.55 * e, 0, (0.50 - 0.42 * e) * s);
            S(`el${n}`, -1.05 + 0.95 * e, 0.30 * s * (1 - e * 0.7), 0);
            S(`hd${n}`, -0.70 + 0.45 * e, 0, 0);
          }
          S('spine', -0.08 + 0.20 * e, 0, 0);
          S('chest', -0.22 + 0.22 * e, 0, 0);
          S('head', -0.18 + 0.28 * e, 0, 0);
          this._trail(t, -0.10 + 0.45 * e, 0.18);
          this.visual.position.y = H + 0.34 - 0.16 * e;
        }
        this.visual.rotation.z = 0;
        break;
      }
      case 'flinch': {
        const k = Math.exp(-this.stateTime * 8) * (1 - Math.min(1, this.stateTime / 0.35));
        frame(0.9);
        S('spine', 0.06 + 0.26 * k, Math.sin(this.stateTime * 40) * 0.26 * k, 0);
        S('chest', -0.10 + 0.18 * k, 0, 0.16 * k);
        S('head', -0.30 * k, 0.24 * k, 0.20 * k);
        this._trail(t, 0.16, 0.30);
        this.visual.position.y = H + 0.06 - 0.10 * k;
        this.visual.rotation.z = 0.14 * k;
        break;
      }
      case 'stagger': {
        // the loft collapses — it sags almost to the ground, robe hanging limp
        const k = Math.min(1, this.stateTime / 0.3) * Math.max(0, 1 - this.stateTime / 2.4);
        S('spine', 0.06 + 0.50 * k, 0.26 * k, 0);
        S('chest', -0.10 + 0.42 * k, 0, 0.24 * k);
        S('head', -0.60 * k, 0.30 * k, 0);
        S('hood', 0.20 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, -0.35 + 0.75 * k, 0, (0.20 - 0.45 * k) * s);
          S(`el${n}`, -0.45 + 0.40 * k, 0.30 * s * (1 - k), 0);
          S(`hd${n}`, -0.25 + 0.30 * k, 0, 0);
        }
        this._trail(t, 0.05, 0.05);
        this.visual.position.y = H * (1 - 0.72 * k) + 0.02;
        this.visual.rotation.z = 0.22 * k;
        break;
      }
      case 'death': {
        // it does not fall over — it folds up and sinks, still off the ground
        const k = Math.min(1, this.stateTime / 1.1);
        const e = 1 - Math.pow(1 - k, 2.4);
        S('spine', 0.06 + 0.75 * e, 0, 0);
        S('chest', -0.10 + 0.60 * e, 0, 0);
        S('head', -0.75 * e, 0, 0);
        S('hood', 0.30 * e, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, -0.35 + 0.95 * e, 0, (0.20 - 0.60 * e) * s);
          S(`el${n}`, -0.45 + 0.30 * e, 0.30 * s * (1 - e), 0);
          S(`hd${n}`, -0.25 + 0.20 * e, 0, 0);
        }
        this._trail(t, 0.02, 0.03 * (1 - e));
        this.visual.rotation.x = e * 0.55;
        this.visual.rotation.z = e * 0.30;
        this.visual.position.y = Math.max(0.04, H - 0.30 * e);
        break;
      }
      default: {
        // idle: it hangs in the air and breathes with the whole robe
        const b = Math.sin(t * 0.85);
        frame(1);
        S('spine', 0.06 + b * 0.035, Math.sin(t * 0.31) * 0.10, 0);
        S('chest', -0.10 + b * 0.025, 0, 0);
        S('head', 0.04, Math.sin(t * 0.27) * 0.24, 0);
        S('hood', -0.04 + b * 0.02, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hd${n}`, -0.25 + Math.sin(t * 1.3 + (s < 0 ? 0 : 0.9)) * 0.10, 0, 0);
        }
        this._trail(t, 0.03, 0.12);
        this.visual.position.y = H + 0.10 + b * 0.09;
        this.visual.rotation.z = Math.sin(t * 0.45) * 0.03;
        break;
      }
    }
    if (this.visual.position.y <= 0) this.visual.position.y = 0.04;
  }
}

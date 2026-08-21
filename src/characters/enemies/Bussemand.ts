import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.ts';
import { Enemy, organicNormal, organicRoughness } from './EnemyBase.ts';
import { tube, blob, spike, slab, place, tint, glow } from '../../combat/GeoKit.ts';

const P = (x: any, y: any, z: any) => new THREE.Vector3(x, y, z);

const FLESH = 0x6d5068;
const FLESH_DARK = 0x3b2c40;
const BELLY = 0x6d5c3a;
const RAG = 0x453e33;
const NAIL = 0xb0a68b;
const TOOTH = 0xc4bda4;
const EYE = 0xff4a12;

/**
 * Bussemand — a goblin scaled up until it became a problem.
 * Two and a half metres of hunched, top-heavy daemon: a barrel chest over a
 * distended gut, arms so long the knuckles drag, a bald lumpy skull split by a
 * lipless grin, drooping pointed ears, and one lit eye. It does not dodge and
 * it does not stop; it simply arrives and flattens whatever is underneath.
 */
export const BUSSEMAND = {
  key: 'bussemand',
  questId: 'bussemand',
  faction: 'daemon',
  expClass: 'elite',
  stats: {
    name: 'Bussemand', hp: 5600, poise: 150, speed: 3.2, attackRange: 3.0,
    aggroRange: 30, radius: 0.85, height: 2.6, damage: 300, level: 30,
  },
  weakness: 'light',
  resistPct: { light: 190, dark: 0, fire: 110, ice: 100, lightning: 100 },
  weakTo: ['greatsword'],
  senses: { sight: 30, fov: 1.7, hearing: 20, nocturnal: true },
  drops: [
    { id: 'rotten_splinterbone', chance: 0.5, count: 1 },
  ],
  timing: { telegraph: 0.9, strike: 0.24, attack: 0.75, recover: 1.15 },
  attacks: [
    // both fists hauled overhead and driven into the ground
    {
      id: 'smash', range: 3.4, weight: 3, mult: 1.15, poise: 60, hitRadius: 3.2, arc: Math.PI,
      aoe: true, telegraph: 1.05, strike: 0.26, attack: 0.8, recover: 1.35, cooldown: 3.2,
    },
    // a long backhand that uses every centimetre of those arms
    {
      id: 'swipe', range: 4.2, weight: 3, mult: 0.9, poise: 40, hitRadius: 3.4, arc: 1.9,
      telegraph: 0.7, strike: 0.2, attack: 0.62, recover: 0.95, cooldown: 2.0,
    },
    // a lunging two-handed snatch
    {
      id: 'grab', range: 7.0, minRange: 2.4, weight: 2, mult: 1.4, poise: 75, hitRadius: 2.2, arc: 0.9,
      telegraph: 0.95, strike: 0.28, attack: 0.85, recover: 1.5, cooldown: 5.0,
      lunge: 8, tracking: 0.7, unblockable: true,
    },
  ],
  buildPrototype,
  make(opts: any) { return new BussemandEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('pelvis', 'root', [0, 1.06, 0]);
  rig.bone('spine', 'pelvis', [0, 1.44, -0.04]);
  rig.bone('chest', 'spine', [0, 1.86, -0.12]);
  rig.bone('neck', 'chest', [0, 2.10, -0.06]);
  rig.bone('head', 'neck', [0, 2.24, 0.02]);
  rig.bone('jaw', 'head', [0, 2.14, 0.14]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`sh${n}`, 'chest', [0.46 * s, 1.98, -0.08]);
    rig.bone(`el${n}`, `sh${n}`, [0.70 * s, 1.38, 0.04]);
    rig.bone(`hd${n}`, `el${n}`, [0.80 * s, 0.74, 0.20]);
    rig.bone(`hp${n}`, 'pelvis', [0.21 * s, 1.02, 0]);
    rig.bone(`kn${n}`, `hp${n}`, [0.26 * s, 0.58, 0.08]);
    rig.bone(`ft${n}`, `kn${n}`, [0.25 * s, 0.09, 0.01]);
  }

  /* --- torso: barrel chest sagging into an enormous gut --- */
  const torso = tube([
    P(0, 0.98, 0.06), P(0, 1.28, 0.08), P(0, 1.58, -0.02), P(0, 1.90, -0.12),
  ], [[0.42, 0.34], [0.48, 0.42], [0.46, 0.36], [0.42, 0.32]], { radialSeg: 10 });
  rig.attachBlend(tint(torso, FLESH, 0.05), 'pelvis', 'chest', 1.4);

  const gut = place(blob(0.46, 0.40, 0.44, 12, 9), { pos: [0, 1.20, 0.20] });
  rig.attach(tint(gut, BELLY, 0.06), 'pelvis');
  const navel = place(blob(0.09, 0.07, 0.06, 6, 5), { pos: [0, 1.14, 0.60] });
  rig.attach(tint(navel, FLESH_DARK), 'pelvis');

  const pecs = place(slab(0.86, 0.34, 0.52, 0.09), { pos: [0, 1.86, 0.06], rot: [0.22, 0, 0] });
  rig.attach(tint(pecs, FLESH, 0.05), 'chest');
  // the hunch: two slabs of trapezius stacked above the shoulder line
  for (const s of [-1, 1]) {
    const hump = place(blob(0.24, 0.22, 0.24, 9, 7), { pos: [0.28 * s, 2.06, -0.12] });
    rig.attach(tint(hump, FLESH, 0.06), 'chest');
  }

  // ridge of stunted horns down the spine
  for (let i = 0; i < 7; i++) {
    const k = i / 6;
    const q = place(spike(0.034, 0.09 + k * 0.07, 5),
      { pos: [0, 1.06 + k * 0.86, -0.30 - k * 0.02], rot: [-0.95, 0, 0] });
    rig.attach(tint(q, FLESH_DARK), k < 0.5 ? 'spine' : 'chest');
  }

  // a filthy hide wrap slung round the hips
  const wrapF = place(slab(0.78, 0.46, 0.10, 0.04), { pos: [0, 0.88, 0.28], rot: [0.16, 0, 0] });
  rig.attach(tint(wrapF, RAG, 0.07), 'pelvis');
  const wrapB = place(slab(0.72, 0.40, 0.10, 0.04), { pos: [0, 0.90, -0.30], rot: [-0.14, 0, 0] });
  rig.attach(tint(wrapB, RAG, 0.07), 'pelvis');

  /* --- head: bald, lumpy, mostly grin --- */
  const neck = tube([P(0, 1.96, -0.10), P(0, 2.16, 0.0)], [0.22, 0.19], { radialSeg: 8 });
  rig.attachBlend(tint(neck, FLESH_DARK, 0.04), 'chest', 'head', 1.0);

  const skull = place(blob(0.30, 0.29, 0.33, 12, 9), { pos: [0, 2.30, 0.02] });
  rig.attach(tint(skull, FLESH, 0.05), 'head');
  const lump1 = place(blob(0.11, 0.09, 0.10, 6, 5), { pos: [0.10, 2.50, -0.02] });
  rig.attach(tint(lump1, FLESH, 0.07), 'head');
  const lump2 = place(blob(0.08, 0.07, 0.08, 6, 5), { pos: [-0.13, 2.44, 0.08] });
  rig.attach(tint(lump2, FLESH, 0.07), 'head');
  const lump3 = place(blob(0.09, 0.08, 0.09, 6, 5), { pos: [0.02, 2.52, 0.14] });
  rig.attach(tint(lump3, FLESH, 0.07), 'head');

  const brow = place(slab(0.50, 0.11, 0.22, 0.03), { pos: [0, 2.34, 0.26], rot: [0.30, 0, 0] });
  rig.attach(tint(brow, FLESH_DARK), 'head');
  const snout = place(blob(0.13, 0.09, 0.12, 8, 6), { pos: [0, 2.24, 0.32] });
  rig.attach(tint(snout, FLESH_DARK), 'head');

  // the grin: a wide lipless slot of blunt teeth
  const mouth = place(slab(0.46, 0.11, 0.16, 0.02), { pos: [0, 2.11, 0.26] });
  rig.attach(tint(mouth, 0x0a0509), 'jaw');
  for (let i = -3; i <= 3; i++) {
    const up = place(blob(0.030, 0.055, 0.028, 5, 4), { pos: [i * 0.062, 2.145, 0.285] });
    rig.attach(tint(up, TOOTH), 'head');
  }
  for (let i = -3; i <= 2; i++) {
    const lo = place(blob(0.028, 0.048, 0.026, 5, 4), { pos: [i * 0.062 + 0.031, 2.085, 0.282] });
    rig.attach(tint(lo, TOOTH), 'jaw');
  }
  const jawMass = place(blob(0.24, 0.11, 0.20, 8, 6), { pos: [0, 2.06, 0.20] });
  rig.attach(tint(jawMass, FLESH_DARK, 0.04), 'jaw');

  // long pointed ears, drooping under their own weight
  for (const s of [-1, 1]) {
    const ear = tube([
      P(0.25 * s, 2.36, -0.02), P(0.44 * s, 2.30, -0.16),
      P(0.58 * s, 2.10, -0.30), P(0.66 * s, 1.88, -0.40),
    ], [[0.095, 0.028], [0.085, 0.022], [0.055, 0.015], [0.010, 0.005]], { radialSeg: 6 });
    rig.attach(tint(ear, 0x5c4058, 0.05), 'head');
  }

  // one eye lit, the other a dead seam
  const eye = place(blob(0.058, 0.046, 0.036, 7, 5), { pos: [-0.115, 2.315, 0.285] });
  rig.attach(glow(tint(eye, 0x1c0603), EYE, 3.4), 'head');
  const dead = place(slab(0.13, 0.035, 0.05, 0.012), { pos: [0.115, 2.310, 0.285], rot: [0, 0, -0.25] });
  rig.attach(tint(dead, 0x140c14), 'head');

  /* --- arms: absurd reach, three fat fingers each --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const delt = place(blob(0.22, 0.22, 0.22, 9, 7), { pos: [0.46 * s, 1.98, -0.08] });
    rig.attach(tint(delt, FLESH, 0.06), `sh${n}`);
    const up = tube([P(0.46 * s, 1.96, -0.07), P(0.60 * s, 1.68, -0.02), P(0.70 * s, 1.40, 0.03)],
      [0.185, 0.165, 0.135], { radialSeg: 8 });
    rig.attachBlend(tint(up, FLESH, 0.05), `sh${n}`, `el${n}`, 1.0);
    const elbow = place(blob(0.15, 0.15, 0.15, 7, 5), { pos: [0.70 * s, 1.38, 0.03] });
    rig.attach(tint(elbow, FLESH_DARK, 0.05), `el${n}`);
    const lo = tube([P(0.70 * s, 1.36, 0.04), P(0.76 * s, 1.06, 0.12), P(0.80 * s, 0.76, 0.20)],
      [0.135, 0.125, 0.115], { radialSeg: 8 });
    rig.attachBlend(tint(lo, FLESH, 0.05), `el${n}`, `hd${n}`, 1.0);

    const knuckle = place(blob(0.17, 0.13, 0.19, 8, 6), { pos: [0.80 * s, 0.68, 0.26] });
    rig.attach(tint(knuckle, FLESH_DARK, 0.05), `hd${n}`);
    for (let c = -1; c <= 1; c++) {
      const f = tube([
        P((0.80 + c * 0.11) * s, 0.66, 0.32), P((0.80 + c * 0.13) * s, 0.52, 0.40),
        P((0.80 + c * 0.14) * s, 0.40, 0.44),
      ], [0.055, 0.048, 0.040], { radialSeg: 5 });
      rig.attach(tint(f, FLESH_DARK, 0.05), `hd${n}`);
      const cl = place(spike(0.042, 0.20, 5),
        { pos: [(0.80 + c * 0.14) * s, 0.36, 0.46], rot: [1.7, 0, c * 0.18] });
      rig.attach(tint(cl, NAIL), `hd${n}`);
    }
  }

  /* --- legs: tiny, bowed, and asked to carry all of that --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const thigh = tube([P(0.21 * s, 1.02, 0), P(0.25 * s, 0.80, 0.05), P(0.26 * s, 0.58, 0.08)],
      [0.185, 0.165, 0.135], { radialSeg: 8 });
    rig.attachBlend(tint(thigh, FLESH, 0.05), `hp${n}`, `kn${n}`, 1.0);
    const shin = tube([P(0.26 * s, 0.56, 0.08), P(0.255 * s, 0.32, 0.04), P(0.25 * s, 0.11, 0.01)],
      [0.13, 0.115, 0.105], { radialSeg: 8 });
    rig.attachBlend(tint(shin, FLESH_DARK, 0.05), `kn${n}`, `ft${n}`, 1.0);
    const foot = place(blob(0.19, 0.10, 0.28, 8, 6), { pos: [0.25 * s, 0.08, 0.10] });
    rig.attach(tint(foot, FLESH_DARK, 0.04), `ft${n}`);
    for (let c = -1; c <= 1; c++) {
      const cl = place(spike(0.038, 0.12, 5),
        { pos: [(0.25 + c * 0.085) * s, 0.05, 0.32], rot: [1.45, 0, 0] });
      rig.attach(tint(cl, NAIL), `ft${n}`);
    }
  }

  const mat = creatureMaterial({
    roughness: 0.74, metalness: 0.0,
    rim: { color: 0x7d6f9c, strength: 0.055 },
    normalMap: organicNormal(), normalScale: 0.8, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 3.2 });
}

class BussemandEnemy extends Enemy {
  attackId!: any;
  rig!: any;
  stateTime!: any;
  visual!: any;
  constructor(opts: any) { super(BUSSEMAND, opts); }

  pose(state: any, t: any) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n: any, x: any, y: any, z: any) => poseBone(rig, n, x, y, z);
    // the hunch is permanent — it cannot stand up, only lean further over
    const hunch = (k = 1) => {
      S('spine', 0.26 * k, 0, 0);
      S('chest', 0.20 * k, 0, 0);
      S('neck', -0.34 * k, 0, 0);
    };
    // arms hanging so long the knuckles brush the dirt
    const drag = (k = 1) => {
      for (const s of [-1, 1]) {
        const n = s < 0 ? 'L' : 'R';
        S(`sh${n}`, -0.20 * k, 0, 0.22 * s * k);
        S(`el${n}`, -0.32 * k, 0, 0);
        S(`hd${n}`, 0.30 * k, 0, 0);
      }
    };

    switch (state) {
      case 'approach':
      case 'run': {
        // a heavy, rolling waddle — the gut leads, the arms swing behind
        const ph = t * 5.4;
        hunch();
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          const o = s < 0 ? 0 : Math.PI;
          S(`hp${n}`, Math.sin(ph + o) * 0.62 - 0.18, 0, 0.10 * s);
          S(`kn${n}`, 0.40 + Math.max(0, Math.sin(ph + o + 1.5)) * 0.80, 0, 0);
          S(`ft${n}`, -0.24 - Math.sin(ph + o) * 0.24, 0, 0);
          S(`sh${n}`, -0.20 - Math.sin(ph + o) * 0.55, 0, 0.26 * s);
          S(`el${n}`, -0.40 - Math.max(0, Math.sin(ph + o)) * 0.30, 0, 0);
          S(`hd${n}`, 0.34, 0, 0);
        }
        S('spine', 0.26, Math.sin(ph) * 0.10, 0);
        S('chest', 0.20, -Math.sin(ph) * 0.14, 0);
        S('head', 0.14 + Math.sin(ph * 2) * 0.07, Math.sin(ph * 0.6) * 0.14, 0);
        S('jaw', 0.30 + Math.max(0, Math.sin(ph * 2)) * 0.18, 0, 0);
        this.visual.position.y = Math.abs(Math.sin(ph)) * 0.10;
        break;
      }
      case 'telegraph': {
        const id = this.attackId;
        if (id === 'swipe') {
          // wind the whole torso round, arm cocked across the body
          const k = Math.min(1, this.stateTime / 0.62);
          const e = k * k * (3 - 2 * k);
          hunch();
          S('spine', 0.26 - 0.10 * e, -0.50 * e, 0);
          S('chest', 0.20 - 0.12 * e, -0.44 * e, 0);
          S('shR', -0.55 * e, -1.15 * e, 0.30);
          S('elR', -1.35 * e, 0, 0);
          S('hdR', 0.20, 0, 0);
          S('shL', -0.10, 0.55 * e, 0.28 - 0.35 * e);
          S('elL', -0.55 * e, 0, 0);
          S('head', 0.05, -0.42 * e, 0);
          S('jaw', 0.45 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, -0.22 * e, 0, 0.10 * s);
            S(`kn${n}`, 0.55 * e, 0, 0);
          }
        } else if (id === 'grab') {
          // coil back, both hands opening, jaw wide
          const k = Math.min(1, this.stateTime / 0.85);
          const e = k * k * (3 - 2 * k);
          hunch();
          S('spine', 0.26 - 0.34 * e, 0, 0);
          S('chest', 0.20 - 0.28 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`sh${n}`, -0.20 - 0.90 * e, 0, (0.22 + 0.45 * e) * s);
            S(`el${n}`, -0.32 - 1.05 * e, 0, 0);
            S(`hd${n}`, 0.30 - 0.75 * e, 0, 0);
            S(`hp${n}`, -0.40 * e, 0, 0.10 * s);
            S(`kn${n}`, 0.80 * e, 0, 0);
            S(`ft${n}`, -0.34 * e, 0, 0);
          }
          S('head', -0.30 * e, 0, 0);
          S('jaw', 0.85 * e, 0, 0);
          this.visual.position.y = -0.20 * e;
        } else {
          // smash: both fists hauled straight overhead, chest thrown open
          const k = Math.min(1, this.stateTime / 0.95);
          const e = k * k * (3 - 2 * k);
          const shudder = Math.sin(t * 26) * 0.03 * e;
          S('spine', 0.26 - 0.52 * e + shudder, 0, 0);
          S('chest', 0.20 - 0.46 * e, 0, 0);
          S('neck', -0.34 + 0.20 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`sh${n}`, -0.20 - 2.85 * e, 0, (0.22 + 0.30 * e) * s);
            S(`el${n}`, -0.32 - 0.95 * e, 0, 0);
            S(`hd${n}`, 0.30 - 0.55 * e, 0, 0);
            S(`hp${n}`, -0.18 - 0.16 * e, 0, 0.10 * s);
            S(`kn${n}`, 0.42 * e, 0, 0);
            S(`ft${n}`, -0.18 * e, 0, 0);
          }
          S('head', -0.42 * e, 0, 0);
          S('jaw', 0.90 * e, 0, 0);
          this.visual.position.y = 0.06 * e;
        }
        break;
      }
      case 'attack': {
        const id = this.attackId;
        if (id === 'swipe') {
          const k = Math.min(1, this.stateTime / 0.22);
          const e = 1 - Math.pow(1 - k, 3);
          hunch();
          S('spine', 0.16 + 0.16 * e, -0.50 + 1.30 * e, 0);
          S('chest', 0.08 + 0.16 * e, -0.44 + 1.10 * e, 0);
          S('shR', -0.55 + 0.45 * e, -1.15 + 2.20 * e, 0.30 + 0.55 * e);
          S('elR', -1.35 + 1.15 * e, 0, 0);
          S('hdR', 0.20 - 0.35 * e, 0, 0);
          S('shL', -0.10, 0.55 - 0.85 * e, -0.07);
          S('elL', -0.55 + 0.25 * e, 0, 0);
          S('head', 0.05, -0.42 + 0.80 * e, 0);
          S('jaw', 0.55, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, -0.22, 0, 0.10 * s);
            S(`kn${n}`, 0.55, 0, 0);
          }
        } else if (id === 'grab') {
          const k = Math.min(1, this.stateTime / 0.26);
          const e = 1 - Math.pow(1 - k, 2.6);
          S('spine', -0.08 + 0.44 * e, 0, 0);
          S('chest', -0.08 + 0.36 * e, 0, 0);
          S('neck', -0.34, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`sh${n}`, -1.10 - 0.35 * e, 0, (0.67 - 0.60 * e) * s);
            S(`el${n}`, -1.37 + 1.15 * e, 0, 0);
            S(`hd${n}`, -0.45 + 0.55 * e, 0, 0);
            S(`hp${n}`, -0.40 + 0.55 * e, 0, 0.10 * s);
            S(`kn${n}`, 0.80 - 0.55 * e, 0, 0);
            S(`ft${n}`, -0.34 + 0.24 * e, 0, 0);
          }
          S('head', -0.30 + 0.55 * e, 0, 0);
          S('jaw', 0.95, 0, 0);
          this.visual.position.y = -0.20 + 0.20 * e;
        } else {
          // smash: everything drops at once, fists into the dirt
          const k = Math.min(1, this.stateTime / 0.24);
          const e = 1 - Math.pow(1 - k, 3.4);
          S('spine', -0.26 + 0.92 * e, 0, 0);
          S('chest', -0.26 + 0.78 * e, 0, 0);
          S('neck', -0.14 - 0.30 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`sh${n}`, -3.05 + 3.55 * e, 0, (0.52 - 0.34 * e) * s);
            S(`el${n}`, -1.27 + 1.05 * e, 0, 0);
            S(`hd${n}`, -0.25 + 0.85 * e, 0, 0);
            S(`hp${n}`, -0.34 - 0.20 * e, 0, 0.10 * s);
            S(`kn${n}`, 0.42 + 0.60 * e, 0, 0);
            S(`ft${n}`, -0.18 - 0.20 * e, 0, 0);
          }
          S('head', 0.20 * e, 0, 0);
          S('jaw', 0.90, 0, 0);
          this.visual.position.y = 0.06 - 0.34 * e;
        }
        break;
      }
      case 'flinch': {
        const k = Math.exp(-this.stateTime * 8) * (1 - Math.min(1, this.stateTime / 0.35));
        hunch();
        drag();
        S('spine', 0.26 + 0.24 * k, Math.sin(this.stateTime * 38) * 0.24 * k, 0);
        S('chest', 0.20 + 0.14 * k, 0, 0.10 * k);
        S('head', -0.30 * k, 0.24 * k, 0.22 * k);
        S('jaw', 0.60 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, -0.20 + 0.45 * k, 0, (0.22 + 0.35 * k) * s);
          S(`kn${n}`, 0.30 + 0.30 * k, 0, 0);
        }
        break;
      }
      case 'stagger': {
        // knees buckle, the gut carries it forward, arms hang dead
        const k = Math.min(1, this.stateTime / 0.25) * Math.max(0, 1 - this.stateTime / 2.6);
        S('spine', 0.26 + 0.46 * k, 0.26 * k, 0);
        S('chest', 0.20 + 0.28 * k, 0, 0.16 * k);
        S('neck', -0.34 + 0.62 * k, 0, 0);
        S('head', -0.48 * k, 0.30 * k, 0);
        S('jaw', 0.95 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, -0.20 + 0.30 * k, 0, (0.22 + 0.55 * k) * s);
          S(`el${n}`, -0.32 + 0.20 * k, 0, 0);
          S(`hd${n}`, 0.30 - 0.30 * k, 0, 0);
          S(`hp${n}`, -0.70 * k, 0, 0.10 * s);
          S(`kn${n}`, 1.25 * k, 0, 0);
          S(`ft${n}`, -0.50 * k, 0, 0);
        }
        this.visual.position.y = -0.34 * k;
        break;
      }
      case 'death': {
        const k = Math.min(1, this.stateTime / 0.85);
        const e = 1 - Math.pow(1 - k, 2.6);
        this.visual.rotation.x = e * 1.30;
        this.visual.position.y = -0.62 * e;
        S('spine', 0.26 - 0.44 * e, 0, 0);
        S('chest', 0.20 - 0.30 * e, 0, 0);
        S('neck', -0.34 + 0.55 * e, 0, 0);
        S('head', -0.25 * e, 0.20 * e, 0);
        S('jaw', 0.70 * e, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, 1.05 * e, 0, (0.22 + 0.55 * e) * s);
          S(`el${n}`, -0.35, 0, 0);
          S(`hp${n}`, -1.00 * e, 0, 0.10 * s);
          S(`kn${n}`, 1.45 * e, 0, 0);
          S(`ft${n}`, -0.35 * e, 0, 0);
        }
        break;
      }
      default: {
        // idle: the belly rises and falls, the jaw works, arms sway
        const b = Math.sin(t * 1.5) * 0.05;
        hunch();
        drag();
        S('spine', 0.26 + b, Math.sin(t * 0.4) * 0.07, 0);
        S('chest', 0.20 + b * 0.6, 0, 0);
        S('head', 0.12 + b, Math.sin(t * 0.5) * 0.22, 0);
        S('jaw', 0.16 + Math.max(0, Math.sin(t * 1.1)) * 0.22, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, -0.20 + Math.sin(t * 0.9 + (s < 0 ? 0 : 0.8)) * 0.08, 0, 0.22 * s);
          S(`el${n}`, -0.32, 0, 0);
          S(`hd${n}`, 0.30, 0, 0);
          S(`hp${n}`, -0.16, 0, 0.10 * s);
          S(`kn${n}`, 0.34, 0, 0);
          S(`ft${n}`, -0.18, 0, 0);
        }
        this.visual.position.y = 0;
        break;
      }
    }
  }
}

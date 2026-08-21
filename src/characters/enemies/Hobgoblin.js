import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.js';
import { Enemy, organicNormal, organicRoughness } from './EnemyBase.js';
import {
  tube, blob, spike, slab, place, tint, glow, rectCross, loft,
} from '../../combat/GeoKit.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

const SKIN = 0x6a5060;
const SKIN_DARK = 0x3a2c3c;
const GUT = 0x6b5a37;
const RAG = 0x453c34;
const RUST = 0x76492c;
const IRON = 0x565049;
const WOOD = 0x574839;
const CLAW = 0xc0b9a2;
const EYE = 0xff3018;

/**
 * Hobgoblin — the goblin's elder brother, and the one that learned to arm
 * itself. Same squat, hunched proportions, half again the size, with a plate
 * of scavenged scrap lashed to one shoulder, a rusted iron pot-helm jammed
 * over the skull, a notched cleaver in one fist and a broken shield-plank in
 * the other. Never stands still — it darts, stops, and darts again.
 */
export const HOBGOBLIN = {
  key: 'hobgoblin',
  questId: 'hobgoblin',
  faction: 'daemon',
  expClass: 'daemon',
  stats: {
    name: 'Hobgoblin', hp: 1800, poise: 60, speed: 4.6, attackRange: 2.0,
    aggroRange: 26, radius: 0.5, height: 1.75, damage: 150, level: 20,
  },
  weakness: 'light',
  resistPct: { light: 190, dark: 0, fire: 120, ice: 100, lightning: 100 },
  senses: { sight: 26, fov: 1.8, hearing: 18, nocturnal: true },
  drops: [
    { id: 'rotten_splinterbone', chance: 0.45, count: 1 },
    { id: 'debased_coin', chance: 0.3, count: 1 },
  ],
  timing: { telegraph: 0.42, strike: 0.16, attack: 0.5, recover: 0.66 },
  attacks: [
    // two chops on the same breath — down, then back across
    {
      id: 'hack', range: 2.3, weight: 4, mult: 1.0, poise: 26, hitRadius: 2.0, arc: 1.5,
      telegraph: 0.4, strike: 0.15, attack: 0.62, recover: 0.58, cooldown: 1.3,
    },
    // shoulders into the shield-plank
    {
      id: 'bash', range: 1.9, weight: 2, mult: 0.7, poise: 46, hitRadius: 1.9, arc: 1.1,
      telegraph: 0.34, strike: 0.14, attack: 0.42, recover: 0.72, cooldown: 2.4,
    },
    // a hopping overhead chop that closes the gap
    {
      id: 'leap', range: 10, minRange: 4, weight: 3, mult: 1.35, poise: 40, hitRadius: 2.2, arc: 1.2,
      telegraph: 0.5, strike: 0.22, attack: 0.72, recover: 0.9, cooldown: 4.2,
      lunge: 9, tracking: 0.8,
    },
  ],
  buildPrototype,
  make(opts) { return new HobgoblinEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('pelvis', 'root', [0, 0.81, 0]);
  rig.bone('spine', 'pelvis', [0, 1.08, -0.05]);
  rig.bone('chest', 'spine', [0, 1.32, -0.09]);
  rig.bone('neck', 'chest', [0, 1.46, -0.03]);
  rig.bone('head', 'neck', [0, 1.58, 0.04]);
  rig.bone('jaw', 'head', [0, 1.47, 0.13]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`sh${n}`, 'chest', [0.26 * s, 1.39, -0.05]);
    rig.bone(`el${n}`, `sh${n}`, [0.45 * s, 1.08, 0.05]);
    rig.bone(`hd${n}`, `el${n}`, [0.53 * s, 0.76, 0.21]);
    rig.bone(`hp${n}`, 'pelvis', [0.155 * s, 0.78, 0]);
    rig.bone(`kn${n}`, `hp${n}`, [0.185 * s, 0.43, 0.12]);
    rig.bone(`ft${n}`, `kn${n}`, [0.185 * s, 0.07, 0.01]);
  }

  /* --- torso: the goblin build, thickened --- */
  const torso = tube([
    P(0, 0.74, 0.03), P(0, 0.97, 0.04), P(0, 1.19, -0.06), P(0, 1.38, -0.11),
  ], [[0.26, 0.20], [0.32, 0.27], [0.29, 0.23], [0.24, 0.19]], { radialSeg: 10 });
  rig.attachBlend(tint(torso, SKIN, 0.05), 'pelvis', 'chest', 1.3);

  const gut = place(blob(0.27, 0.22, 0.23, 10, 8), { pos: [0, 0.95, 0.10] });
  rig.attach(tint(gut, GUT, 0.06), 'pelvis');
  const pecs = place(slab(0.44, 0.20, 0.30, 0.05), { pos: [0, 1.30, 0.05], rot: [0.20, 0, 0] });
  rig.attach(tint(pecs, SKIN, 0.05), 'chest');

  // spine quills
  for (let i = 0; i < 6; i++) {
    const k = i / 5;
    const q = place(spike(0.026, 0.08 + k * 0.06, 5),
      { pos: [0, 0.92 + k * 0.46, -0.19 - k * 0.03], rot: [-1.0, 0, 0] });
    rig.attach(tint(q, SKIN_DARK), k < 0.5 ? 'spine' : 'chest');
  }

  // loincloth of stitched rags
  const rag = place(slab(0.46, 0.34, 0.07, 0.03), { pos: [0, 0.68, 0.04], rot: [0.12, 0, 0] });
  rig.attach(tint(rag, RAG, 0.07), 'pelvis');
  const belt = place(slab(0.50, 0.09, 0.34, 0.02), { pos: [0, 0.84, 0] });
  rig.attach(tint(belt, RUST, 0.05), 'pelvis');

  /* --- head: wedge skull under a rusted pot-helm --- */
  const neck = tube([P(0, 1.38, -0.08), P(0, 1.50, 0.0)], [0.115, 0.10], { radialSeg: 7 });
  rig.attachBlend(tint(neck, SKIN_DARK), 'chest', 'head', 1.0);

  const skull = place(blob(0.20, 0.19, 0.22, 12, 9), { pos: [0, 1.60, 0.03] });
  rig.attach(tint(skull, SKIN, 0.04), 'head');

  // the helm: a battered bowl with a nose-guard and a dented rim
  const helm = place(loft(rectCross(0.44, 12), [
    { y: 1.62, sx: 0.225, sz: 0.245 },
    { y: 1.72, sx: 0.215, sz: 0.230 },
    { y: 1.79, sx: 0.155, sz: 0.165 },
    { y: 1.83, sx: 0.055, sz: 0.060 },
  ]), { pos: [0, 0, 0.03] });
  rig.attach(tint(helm, RUST, 0.07), 'head');
  const rim = place(loft(rectCross(0.44, 12), [
    { y: 1.605, sx: 0.245, sz: 0.265 }, { y: 1.645, sx: 0.235, sz: 0.255 },
  ]), { pos: [0, 0, 0.03] });
  rig.attach(tint(rim, IRON, 0.05), 'head');
  const nasal = place(slab(0.055, 0.20, 0.05, 0.012), { pos: [0, 1.56, 0.235], rot: [0.12, 0, 0] });
  rig.attach(tint(nasal, IRON, 0.05), 'head');
  const spikeTop = place(spike(0.030, 0.13, 5), { pos: [0, 1.82, 0.03], rot: [-0.18, 0, 0] });
  rig.attach(tint(spikeTop, IRON), 'head');

  const brow = place(slab(0.32, 0.06, 0.13, 0.02), { pos: [0, 1.615, 0.185], rot: [0.28, 0, 0] });
  rig.attach(tint(brow, SKIN_DARK), 'head');
  const snout = place(blob(0.095, 0.070, 0.095, 8, 6), { pos: [0, 1.535, 0.215] });
  rig.attach(tint(snout, SKIN_DARK), 'head');

  // lantern jaw of crooked fangs
  const mouth = place(slab(0.25, 0.055, 0.08, 0.012), { pos: [0, 1.475, 0.19] });
  rig.attach(tint(mouth, 0x0a0508), 'jaw');
  for (let i = -3; i <= 3; i++) {
    const up = place(spike(0.015, 0.055, 4), { pos: [i * 0.034, 1.495, 0.20], rot: [Math.PI - 0.10, 0, 0] });
    rig.attach(tint(up, CLAW), 'head');
    const lo = place(spike(0.014, 0.048, 4), { pos: [i * 0.034 + 0.017, 1.455, 0.197], rot: [-0.10, 0, 0] });
    rig.attach(tint(lo, CLAW), 'jaw');
  }
  const jawG = place(blob(0.13, 0.055, 0.11, 8, 5), { pos: [0, 1.44, 0.15] });
  rig.attach(tint(jawG, SKIN_DARK), 'jaw');

  // ears poking out under the helm rim
  for (const s of [-1, 1]) {
    const e = tube([P(0.185 * s, 1.61, -0.03), P(0.39 * s, 1.72, -0.18), P(0.52 * s, 1.74, -0.38)],
      [[0.070, 0.020], [0.060, 0.015], [0.014, 0.006]], { radialSeg: 6 });
    rig.attach(tint(e, 0x513a4e, 0.05), 'head');
  }
  // eyes: two coals in the helm shadow
  for (const s of [-1, 1]) {
    const e = place(blob(0.036, 0.028, 0.024, 7, 5), { pos: [0.078 * s, 1.585, 0.198] });
    rig.attach(glow(tint(e, 0x1a0603), EYE, 3.0), 'head');
  }

  /* --- scrap-plate: one shoulder only, lashed on with cord --- */
  const scrap = place(slab(0.34, 0.30, 0.26, 0.035), { pos: [0.32, 1.44, -0.03], rot: [0, 0, -0.30] });
  rig.attach(tint(scrap, IRON, 0.06), 'shR');
  const scrapEdge = place(slab(0.36, 0.05, 0.28, 0.015), { pos: [0.345, 1.30, -0.03], rot: [0, 0, -0.30] });
  rig.attach(tint(scrapEdge, RUST, 0.06), 'shR');
  for (let i = 0; i < 3; i++) {
    const stud = place(blob(0.022, 0.022, 0.022, 5, 4), { pos: [0.42 - i * 0.02, 1.52 - i * 0.09, -0.03] });
    rig.attach(tint(stud, RUST), 'shR');
  }
  const cord = place(slab(0.06, 0.30, 0.28, 0.012), { pos: [0.18, 1.36, -0.02], rot: [0, 0, 0.35] });
  rig.attach(tint(cord, RAG), 'chest');

  /* --- arms --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const sho = place(blob(0.105, 0.105, 0.105, 8, 6), { pos: [0.26 * s, 1.39, -0.05] });
    rig.attach(tint(sho, SKIN_DARK, 0.05), `sh${n}`);
    const up = tube([P(0.26 * s, 1.38, -0.05), P(0.37 * s, 1.23, 0.0), P(0.45 * s, 1.09, 0.05)],
      [0.086, 0.074, 0.062], { radialSeg: 7 });
    rig.attachBlend(tint(up, SKIN, 0.05), `sh${n}`, `el${n}`, 1.0);
    const lo = tube([P(0.45 * s, 1.07, 0.05), P(0.50 * s, 0.92, 0.13), P(0.53 * s, 0.77, 0.21)],
      [0.062, 0.054, 0.048], { radialSeg: 7 });
    rig.attachBlend(tint(lo, SKIN, 0.05), `el${n}`, `hd${n}`, 1.0);
    const palm = place(blob(0.062, 0.042, 0.068, 7, 5), { pos: [0.535 * s, 0.735, 0.245] });
    rig.attach(tint(palm, SKIN_DARK), `hd${n}`);
    for (let c = -1; c <= 1; c++) {
      const cl = place(spike(0.013, 0.075, 4),
        { pos: [(0.535 + c * 0.036) * s, 0.715, 0.285], rot: [1.15, 0, c * 0.20] });
      rig.attach(tint(cl, CLAW), `hd${n}`);
    }
  }

  /* --- legs: short, bandy, digitigrade --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const up = tube([P(0.155 * s, 0.78, 0), P(0.172 * s, 0.60, 0.07), P(0.185 * s, 0.44, 0.12)],
      [0.115, 0.098, 0.078], { radialSeg: 7 });
    rig.attachBlend(tint(up, SKIN, 0.04), `hp${n}`, `kn${n}`, 1.0);
    const lo = tube([P(0.185 * s, 0.44, 0.12), P(0.185 * s, 0.25, 0.055), P(0.185 * s, 0.09, 0.01)],
      [0.076, 0.060, 0.052], { radialSeg: 7 });
    rig.attachBlend(tint(lo, SKIN_DARK, 0.04), `kn${n}`, `ft${n}`, 1.0);
    const foot = place(blob(0.075, 0.048, 0.115, 7, 5), { pos: [0.185 * s, 0.05, 0.075] });
    rig.attach(tint(foot, SKIN_DARK), `ft${n}`);
    for (let c = -1; c <= 1; c++) {
      const cl = place(spike(0.016, 0.065, 4), { pos: [(0.185 + c * 0.043) * s, 0.032, 0.17], rot: [1.35, 0, 0] });
      rig.attach(tint(cl, CLAW), `ft${n}`);
    }
  }

  /* --- the cleaver: a crude notched slab of iron on a bound haft --- */
  const cleaver = [];
  const haft = place(loft(rectCross(0.4, 8), [
    { y: 0.0, sx: 0.030, sz: 0.026 }, { y: 0.30, sx: 0.028, sz: 0.024 },
  ]), { pos: [0.545, 0.60, 0.26] });
  cleaver.push(tint(haft, WOOD, 0.05));
  const collar = place(slab(0.075, 0.05, 0.07, 0.012), { pos: [0.545, 0.905, 0.26] });
  cleaver.push(tint(collar, IRON));
  // notches are cut into the silhouette by stepping the section widths
  const blade = place(loft(rectCross(0.12, 10), [
    { y: 0.00, sx: 0.055, sz: 0.022 },
    { y: 0.10, sx: 0.115, sz: 0.024, dx: 0.030 },
    { y: 0.26, sx: 0.098, sz: 0.022, dx: 0.024 },
    { y: 0.34, sx: 0.132, sz: 0.023, dx: 0.042 },
    { y: 0.50, sx: 0.108, sz: 0.021, dx: 0.030 },
    { y: 0.60, sx: 0.140, sz: 0.021, dx: 0.048 },
    { y: 0.72, sx: 0.085, sz: 0.018, dx: 0.026 },
    { y: 0.78, sx: 0.022, sz: 0.010, dx: 0.004 },
  ]), { pos: [0.545, 0.93, 0.26] });
  cleaver.push(tint(blade, IRON, 0.07));
  const edge = place(loft(rectCross(0.1, 6), [
    { y: 0.10, sx: 0.020, sz: 0.008, dx: 0.140 },
    { y: 0.62, sx: 0.018, sz: 0.007, dx: 0.180 },
  ]), { pos: [0.545, 0.93, 0.26] });
  cleaver.push(tint(edge, 0x8b8578, 0.05));
  for (const g of cleaver) rig.attach(g, 'hdR');

  /* --- the shield-plank: nailed boards, one corner splintered off --- */
  const plank = [];
  for (let i = 0; i < 3; i++) {
    const board = place(slab(0.14, 0.62 - i * 0.09, 0.045, 0.012),
      { pos: [-0.60 - i * 0.005, 0.86 + i * 0.02, 0.30 + (i - 1) * 0.145], rot: [0, 0, 0.10] });
    plank.push(tint(board, WOOD, 0.08));
  }
  const band = place(slab(0.045, 0.05, 0.46, 0.010), { pos: [-0.605, 1.02, 0.30], rot: [0, 0, 0.10] });
  plank.push(tint(band, RUST, 0.05));
  const band2 = place(slab(0.045, 0.05, 0.46, 0.010), { pos: [-0.615, 0.72, 0.30], rot: [0, 0, 0.10] });
  plank.push(tint(band2, RUST, 0.05));
  // the broken corner: three splinters where a board sheared away
  for (let i = 0; i < 3; i++) {
    const sp = place(spike(0.025, 0.11 + i * 0.03, 4),
      { pos: [-0.60, 1.16 + i * 0.01, 0.44 - i * 0.06], rot: [0.2 - i * 0.14, 0, 0.10] });
    plank.push(tint(sp, WOOD, 0.08));
  }
  const grip = place(loft(rectCross(0.4, 6), [
    { y: 0.80, sx: 0.020, sz: 0.020 }, { y: 0.96, sx: 0.020, sz: 0.020 },
  ]), { pos: [-0.555, 0, 0.30] });
  plank.push(tint(grip, IRON));
  for (const g of plank) rig.attach(g, 'hdL');

  const mat = creatureMaterial({
    roughness: 0.72, metalness: 0.12,
    rim: { color: 0x7d6f9c, strength: 0.055 },
    normalMap: organicNormal(), normalScale: 0.7, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 2.2 });
}

class HobgoblinEnemy extends Enemy {
  constructor(opts) { super(HOBGOBLIN, opts); }

  pose(state, t) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n, x, y, z) => poseBone(rig, n, x, y, z);
    const hunch = (k = 1) => {
      S('spine', 0.26 * k, 0, 0);
      S('chest', 0.18 * k, 0, 0);
      S('neck', -0.30 * k, 0, 0);
    };
    // cleaver cocked back, plank up across the body
    const guard = (k = 1) => {
      S('shR', -0.55 * k, -0.35 * k, 0.30 * k);
      S('elR', -1.30 * k, 0, 0);
      S('hdR', -0.25 * k, 0, 0);
      S('shL', -0.85 * k, 0.55 * k, -0.30 * k);
      S('elL', -1.55 * k, 0, 0);
      S('hdL', 0.20 * k, 0, 0);
    };

    switch (state) {
      case 'approach':
      case 'run': {
        // nervous darting bursts: the stride phase itself surges and stalls
        const surge = Math.sin(t * 2.3);
        const ph = t * 12.0 + Math.sin(t * 2.3) * 2.4;
        const dart = Math.max(0, surge);
        hunch();
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          const o = s < 0 ? 0 : Math.PI;
          S(`hp${n}`, Math.sin(ph + o) * (0.55 + dart * 0.45) - 0.24, 0, 0);
          S(`kn${n}`, 0.55 + Math.max(0, Math.sin(ph + o + 1.6)) * 0.90, 0, 0);
          S(`ft${n}`, -0.30 - Math.sin(ph + o) * 0.25, 0, 0);
        }
        guard(1);
        S('shR', -0.55 - Math.sin(ph) * 0.28, -0.35, 0.30);
        S('shL', -0.85 + Math.sin(ph) * 0.22, 0.55, -0.30);
        S('spine', 0.26, Math.sin(ph) * 0.14, 0);
        // the head snaps around looking for openings
        S('head', 0.14 + Math.sin(ph * 2) * 0.07, Math.sin(t * 3.1) * 0.34, 0);
        S('jaw', 0.28 + Math.max(0, Math.sin(ph * 2)) * 0.14, 0, 0);
        this.visual.position.y = Math.abs(Math.sin(ph)) * 0.06 + dart * 0.03;
        break;
      }
      case 'telegraph': {
        const id = this.attackId;
        if (id === 'bash') {
          // load the plank shoulder, crouch behind it
          const k = Math.min(1, this.stateTime / 0.3);
          const e = k * k * (3 - 2 * k);
          hunch();
          S('spine', 0.26 + 0.10 * e, 0.42 * e, 0);
          S('chest', 0.18 + 0.08 * e, 0.36 * e, 0);
          S('shL', -0.85 - 0.55 * e, 0.55 + 0.30 * e, -0.30 - 0.20 * e);
          S('elL', -1.55 + 0.35 * e, 0, 0);
          S('shR', -0.55 + 0.25 * e, -0.35 - 0.50 * e, 0.30);
          S('elR', -1.30, 0, 0);
          S('head', 0.20 * e, 0.30 * e, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, -0.45 * e, 0, 0);
            S(`kn${n}`, 0.90 * e, 0, 0);
            S(`ft${n}`, -0.35 * e, 0, 0);
          }
          this.visual.position.y = -0.09 * e;
        } else if (id === 'leap') {
          // coil low, cleaver dragged back, then it goes up
          const k = Math.min(1, this.stateTime / 0.44);
          const e = k * k * (3 - 2 * k);
          hunch();
          S('spine', 0.26 + 0.22 * e, 0, 0);
          S('chest', 0.18 + 0.14 * e, 0, 0);
          S('shR', -0.55 - 1.95 * e, -0.35 + 0.20 * e, 0.30 + 0.25 * e);
          S('elR', -1.30 - 0.45 * e, 0, 0);
          S('hdR', -0.25 + 0.15 * e, 0, 0);
          S('shL', -0.85 - 0.30 * e, 0.55, -0.30);
          S('head', -0.26 * e, 0, 0);
          S('jaw', 0.55 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, -0.85 * e, 0, 0);
            S(`kn${n}`, 1.35 * e, 0, 0);
            S(`ft${n}`, -0.60 * e, 0, 0);
          }
          this.visual.position.y = -0.16 * e;
        } else {
          // hack: cleaver hauled up over the shoulder
          const k = Math.min(1, this.stateTime / 0.34);
          const e = k * k * (3 - 2 * k);
          hunch();
          S('spine', 0.26 - 0.10 * e, -0.34 * e, 0);
          S('chest', 0.18 - 0.12 * e, -0.30 * e, 0);
          S('shR', -0.55 - 2.20 * e, -0.35 - 0.30 * e, 0.30 + 0.35 * e);
          S('elR', -1.30 - 0.30 * e, 0, 0);
          S('hdR', -0.25 + 0.20 * e, 0, 0);
          S('shL', -0.85 + 0.30 * e, 0.55, -0.30);
          S('elL', -1.55 + 0.30 * e, 0, 0);
          S('head', -0.22 * e, -0.24 * e, 0);
          S('jaw', 0.60 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, -0.35 * e, 0, 0);
            S(`kn${n}`, 0.70 * e, 0, 0);
          }
        }
        break;
      }
      case 'attack': {
        const id = this.attackId;
        if (id === 'bash') {
          const k = Math.min(1, this.stateTime / 0.16);
          const e = 1 - Math.pow(1 - k, 3);
          hunch();
          S('spine', 0.36 - 0.30 * e, 0.42 - 0.85 * e, 0);
          S('chest', 0.26 - 0.24 * e, 0.36 - 0.72 * e, 0);
          S('shL', -1.40 + 0.95 * e, 0.85 - 0.85 * e, -0.50 + 0.40 * e);
          S('elL', -1.20 + 0.55 * e, 0, 0);
          S('hdL', 0.20, 0, 0);
          S('shR', -0.30, -0.85 + 0.45 * e, 0.30);
          S('elR', -1.30, 0, 0);
          S('head', 0.20 - 0.30 * e, 0.30 - 0.45 * e, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, -0.45 + 0.40 * e, 0, 0);
            S(`kn${n}`, 0.90 - 0.60 * e, 0, 0);
            S(`ft${n}`, -0.35 + 0.25 * e, 0, 0);
          }
          this.visual.position.y = -0.09 + 0.09 * e;
        } else if (id === 'leap') {
          // airborne, then the chop lands
          const k = Math.min(1, this.stateTime / 0.30);
          const e = 1 - Math.pow(1 - k, 2.6);
          const air = Math.sin(Math.min(1, this.stateTime / 0.34) * Math.PI);
          S('spine', 0.48 - 0.28 * e, 0, 0);
          S('chest', 0.32 - 0.20 * e, 0, 0);
          S('neck', -0.30, 0, 0);
          S('shR', -2.50 + 3.05 * e, -0.15, 0.55 - 0.35 * e);
          S('elR', -1.75 + 1.35 * e, 0, 0);
          S('hdR', -0.10 - 0.25 * e, 0, 0);
          S('shL', -1.15 + 0.55 * e, 0.55, -0.30 - 0.35 * e);
          S('elL', -1.55 + 0.40 * e, 0, 0);
          S('head', -0.26 + 0.50 * e, 0, 0);
          S('jaw', 0.85, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, -0.85 + 0.55 * e - air * 0.35, 0, 0);
            S(`kn${n}`, 1.35 - 0.75 * e + air * 0.55, 0, 0);
            S(`ft${n}`, -0.60 + 0.35 * e, 0, 0);
          }
          this.visual.position.y = -0.16 + air * 0.52;
        } else {
          // hack: chop down, then rip back across on the same beat
          const k = Math.min(1, this.stateTime / 0.40);
          const first = Math.min(1, this.stateTime / 0.15);
          const e1 = 1 - Math.pow(1 - first, 3);
          const second = THREE.MathUtils.clamp((this.stateTime - 0.20) / 0.16, 0, 1);
          const e2 = 1 - Math.pow(1 - second, 3);
          S('spine', 0.16 + 0.20 * e1 - 0.28 * e2, -0.34 + 0.72 * e1 - 1.10 * e2, 0);
          S('chest', 0.06 + 0.20 * e1 - 0.22 * e2, -0.30 + 0.60 * e1 - 0.92 * e2, 0);
          S('neck', -0.30, 0, 0);
          S('shR', -2.75 + 3.20 * e1 - 0.55 * e2, -0.65 + 0.55 * e1 + 1.55 * e2, 0.65 - 0.45 * e1 - 0.35 * e2);
          S('elR', -1.60 + 1.20 * e1 - 0.35 * e2, 0, 0);
          S('hdR', -0.05 - 0.30 * e1 + 0.45 * e2, 0, 0);
          S('shL', -0.55 - 0.30 * e2, 0.55 - 0.75 * e2, -0.30);
          S('elL', -1.25, 0, 0);
          S('head', -0.22 + 0.36 * e1, -0.24 + 0.50 * e1 - 0.60 * e2, 0);
          S('jaw', 0.75 - 0.30 * k, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, -0.35 + 0.20 * e1, 0, 0);
            S(`kn${n}`, 0.70 - 0.25 * e1 + 0.20 * e2, 0, 0);
          }
        }
        break;
      }
      case 'flinch': {
        const k = Math.exp(-this.stateTime * 9) * (1 - Math.min(1, this.stateTime / 0.35));
        hunch();
        guard(1);
        S('spine', 0.26 + 0.32 * k, Math.sin(this.stateTime * 46) * 0.30 * k, 0);
        S('neck', -0.30 + 0.36 * k, 0, 0);
        S('head', -0.42 * k, 0.28 * k, 0.28 * k);
        S('jaw', 0.70 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, -0.28 * k, 0, 0);
          S(`kn${n}`, 0.55 + 0.35 * k, 0, 0);
        }
        S('shL', -0.85 + 0.55 * k, 0.55, -0.30 - 0.35 * k);
        S('shR', -0.55 + 0.50 * k, -0.35, 0.30 + 0.35 * k);
        break;
      }
      case 'stagger': {
        // arms drop, guard gone, weight on the heels
        const k = Math.min(1, this.stateTime / 0.2) * Math.max(0, 1 - this.stateTime / 2.4);
        S('spine', 0.26 + 0.50 * k, 0.30 * k, 0);
        S('chest', 0.18 + 0.28 * k, 0, 0.14 * k);
        S('neck', -0.30 + 0.58 * k, 0, 0);
        S('head', -0.55 * k, 0.34 * k, 0);
        S('jaw', 0.90 * k, 0, 0);
        S('shR', -0.55 + 0.95 * k, -0.35 + 0.35 * k, 0.30 + 0.55 * k);
        S('elR', -1.30 + 0.85 * k, 0, 0);
        S('shL', -0.85 + 1.10 * k, 0.55 - 0.55 * k, -0.30 - 0.55 * k);
        S('elL', -1.55 + 1.05 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, -0.62 * k, 0, 0);
          S(`kn${n}`, 1.20 * k, 0, 0);
          S(`ft${n}`, -0.45 * k, 0, 0);
        }
        this.visual.position.y = -0.20 * k;
        break;
      }
      case 'death': {
        const k = Math.min(1, this.stateTime / 0.55);
        const e = 1 - Math.pow(1 - k, 3);
        this.visual.rotation.z = e * 1.30;
        this.visual.position.y = -0.36 * e;
        S('spine', 0.26 - 0.35 * e, 0, 0);
        S('neck', -0.30 + 0.45 * e, 0, 0);
        S('head', -0.30 * e, 0.25 * e, 0);
        S('shR', 1.10 * e, 0, 0.60 * e);
        S('elR', -0.45, 0, 0);
        S('shL', 1.00 * e, 0, -0.60 * e);
        S('elL', -0.40, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, -0.95 * e, 0, 0);
          S(`kn${n}`, 1.50 * e, 0, 0);
        }
        break;
      }
      default: {
        // idle: shifts weight foot to foot, head twitching, never settled
        const b = Math.sin(t * 2.4) * 0.05;
        const twitch = Math.sin(t * 5.3) * Math.max(0, Math.sin(t * 0.9));
        hunch();
        guard(1);
        S('spine', 0.26 + b, twitch * 0.10, 0);
        S('chest', 0.18 + b * 0.5, 0, 0);
        S('head', 0.10 + b, Math.sin(t * 0.8) * 0.28 + twitch * 0.16, 0);
        S('jaw', 0.16 + Math.max(0, Math.sin(t * 1.5)) * 0.20, 0, 0);
        S('shR', -0.55 + b * 0.6, -0.35, 0.30);
        S('shL', -0.85 + b * 0.6, 0.55, -0.30);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, -0.26 + twitch * 0.06 * s, 0, 0);
          S(`kn${n}`, 0.60, 0, 0);
          S(`ft${n}`, -0.32, 0, 0);
        }
        this.visual.position.y = 0;
        break;
      }
    }
  }
}

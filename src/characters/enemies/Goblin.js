import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.js';
import { Enemy, organicNormal, organicRoughness } from './EnemyBase.js';
import { tube, blob, spike, slab, place, tint, glow } from '../../combat/GeoKit.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

const SKIN = 0x3b2b3e;
const SKIN_DARK = 0x1e1522;
const RAG = 0x2a2420;
const CLAW = 0xc9c2ae;
const EYE = 0xff3018;

/**
 * Goblin — the daemon that crawls out of the dark once the sun is down.
 * Squat, top-heavy, oversized skull with a lantern-jaw grin, long swept ears,
 * spindly clawed arms. Trails miasma from the shoulders.
 */
export const GOBLIN = {
  key: 'goblin',
  stats: {
    name: 'Goblin', hp: 420, poise: 24, speed: 4.2, attackRange: 1.7,
    aggroRange: 22, radius: 0.42, height: 1.30, damage: 62, level: 11,
  },
  weakness: 'light',
  timing: { telegraph: 0.36, strike: 0.14, attack: 0.38, recover: 0.55 },
  buildPrototype,
  make(opts) { return new GoblinEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('pelvis', 'root', [0, 0.60, 0]);
  rig.bone('spine', 'pelvis', [0, 0.80, -0.04]);
  rig.bone('chest', 'spine', [0, 0.98, -0.07]);
  rig.bone('neck', 'chest', [0, 1.08, -0.02]);
  rig.bone('head', 'neck', [0, 1.17, 0.03]);
  rig.bone('jaw', 'head', [0, 1.09, 0.10]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`sh${n}`, 'chest', [0.19 * s, 1.03, -0.04]);
    rig.bone(`el${n}`, `sh${n}`, [0.33 * s, 0.80, 0.04]);
    rig.bone(`hd${n}`, `el${n}`, [0.39 * s, 0.56, 0.16]);
    rig.bone(`hp${n}`, 'pelvis', [0.115 * s, 0.58, 0]);
    rig.bone(`kn${n}`, `hp${n}`, [0.135 * s, 0.32, 0.09]);
    rig.bone(`ft${n}`, `kn${n}`, [0.135 * s, 0.05, 0.01]);
  }

  /* torso — potbellied and hunched */
  const torso = tube([
    P(0, 0.55, 0.02), P(0, 0.72, 0.03), P(0, 0.88, -0.05), P(0, 1.02, -0.08),
  ], [[0.19, 0.15], [0.235, 0.20], [0.21, 0.17], [0.175, 0.14]], { radialSeg: 10 });
  rig.attachBlend(tint(torso, SKIN, 0.05), 'pelvis', 'chest', 1.3);

  const gut = place(blob(0.20, 0.16, 0.17, 10, 8), { pos: [0, 0.70, 0.07] });
  rig.attach(tint(gut, 0x4c3a4a, 0.05), 'pelvis');

  // spine ridge of little horns
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const q = place(spike(0.020, 0.06 + t * 0.05, 4),
      { pos: [0, 0.68 + t * 0.34, -0.14 - t * 0.02], rot: [-1.0, 0, 0] });
    rig.attach(tint(q, SKIN_DARK), t < 0.5 ? 'spine' : 'chest');
  }

  // loincloth
  const rag = place(slab(0.34, 0.26, 0.05, 0.03), { pos: [0, 0.50, 0.02], rot: [0.1, 0, 0] });
  rig.attach(tint(rag, RAG, 0.06), 'pelvis');

  /* head — oversized, wedge-shaped skull */
  const neck = tube([P(0, 1.00, -0.05), P(0, 1.12, 0.0)], [0.085, 0.075], { radialSeg: 7 });
  rig.attachBlend(tint(neck, SKIN_DARK), 'chest', 'head', 1.0);

  const skull = place(blob(0.155, 0.145, 0.170, 12, 9), { pos: [0, 1.20, 0.02] });
  rig.attach(tint(skull, SKIN, 0.04), 'head');
  const brow = place(slab(0.24, 0.05, 0.10, 0.02), { pos: [0, 1.235, 0.13], rot: [0.28, 0, 0] });
  rig.attach(tint(brow, SKIN_DARK), 'head');
  const snout = place(blob(0.075, 0.055, 0.075, 8, 6), { pos: [0, 1.155, 0.17] });
  rig.attach(tint(snout, SKIN_DARK), 'head');

  // grin: a dark slot with a row of teeth
  const mouth = place(slab(0.19, 0.045, 0.06, 0.01), { pos: [0, 1.105, 0.145] });
  rig.attach(tint(mouth, 0x0a0508), 'jaw');
  for (let i = -3; i <= 3; i++) {
    const up = place(spike(0.012, 0.045, 4), { pos: [i * 0.026, 1.12, 0.155], rot: [Math.PI - 0.1, 0, 0] });
    rig.attach(tint(up, CLAW), 'head');
    const lo = place(spike(0.011, 0.038, 4), { pos: [i * 0.026 + 0.013, 1.085, 0.152], rot: [-0.1, 0, 0] });
    rig.attach(tint(lo, CLAW), 'jaw');
  }
  const jawG = place(blob(0.10, 0.045, 0.085, 8, 5), { pos: [0, 1.075, 0.115] });
  rig.attach(tint(jawG, SKIN_DARK), 'jaw');

  // ears: long, swept, membrane-thin
  for (const s of [-1, 1]) {
    const e = tube([P(0.14 * s, 1.24, -0.02), P(0.30 * s, 1.34, -0.14), P(0.40 * s, 1.36, -0.30)],
      [[0.055, 0.016], [0.048, 0.012], [0.012, 0.005]], { radialSeg: 6 });
    rig.attach(tint(e, 0x513a4e, 0.05), 'head');
  }
  // horns
  for (const s of [-1, 1]) {
    const h = place(spike(0.028, 0.14, 5), { pos: [0.085 * s, 1.31, 0.02], rot: [-0.35, 0, 0.45 * s] });
    rig.attach(tint(h, 0x17121a), 'head');
  }
  // eyes: two hot coals under the brow
  for (const s of [-1, 1]) {
    const e = place(blob(0.030, 0.024, 0.020, 7, 5), { pos: [0.062 * s, 1.203, 0.152] });
    rig.attach(glow(tint(e, 0x1a0603), EYE, 3.2), 'head');
  }

  /* arms — long, thin, ending in oversized claws */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const shoulder = place(blob(0.075, 0.075, 0.075, 8, 6), { pos: [0.19 * s, 1.03, -0.04] });
    rig.attach(tint(shoulder, SKIN_DARK, 0.05), `sh${n}`);
    const up = tube([P(0.19 * s, 1.02, -0.04), P(0.28 * s, 0.90, 0.0), P(0.33 * s, 0.80, 0.04)],
      [0.062, 0.052, 0.044], { radialSeg: 6 });
    rig.attachBlend(tint(up, SKIN, 0.05), `sh${n}`, `el${n}`, 1.0);
    const lo = tube([P(0.33 * s, 0.80, 0.04), P(0.36 * s, 0.68, 0.10), P(0.39 * s, 0.57, 0.16)],
      [0.044, 0.038, 0.034], { radialSeg: 6 });
    rig.attachBlend(tint(lo, SKIN, 0.05), `el${n}`, `hd${n}`, 1.0);
    const palm = place(blob(0.048, 0.030, 0.052, 7, 5), { pos: [0.395 * s, 0.545, 0.19] });
    rig.attach(tint(palm, SKIN_DARK), `hd${n}`);
    for (let c = -1; c <= 1; c++) {
      const cl = place(spike(0.011, 0.105, 4),
        { pos: [(0.395 + c * 0.030) * s, 0.525, 0.225], rot: [1.05, 0, c * 0.22] });
      rig.attach(tint(cl, CLAW), `hd${n}`);
    }
  }

  /* legs — short, bandy, digitigrade */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const up = tube([P(0.115 * s, 0.58, 0), P(0.128 * s, 0.44, 0.05), P(0.135 * s, 0.33, 0.09)],
      [0.085, 0.072, 0.058], { radialSeg: 7 });
    rig.attachBlend(tint(up, SKIN, 0.04), `hp${n}`, `kn${n}`, 1.0);
    const lo = tube([P(0.135 * s, 0.33, 0.09), P(0.135 * s, 0.18, 0.04), P(0.135 * s, 0.07, 0.01)],
      [0.056, 0.044, 0.038], { radialSeg: 7 });
    rig.attachBlend(tint(lo, SKIN_DARK, 0.04), `kn${n}`, `ft${n}`, 1.0);
    const foot = place(blob(0.055, 0.035, 0.085, 7, 5), { pos: [0.135 * s, 0.038, 0.055] });
    rig.attach(tint(foot, SKIN_DARK), `ft${n}`);
    for (let c = -1; c <= 1; c++) {
      const cl = place(spike(0.012, 0.05, 4), { pos: [(0.135 + c * 0.032) * s, 0.024, 0.125], rot: [1.35, 0, 0] });
      rig.attach(tint(cl, CLAW), `ft${n}`);
    }
  }

  const mat = creatureMaterial({
    roughness: 0.68, metalness: 0.0,
    normalMap: organicNormal(), normalScale: 0.7, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 1.6 });
}

class GoblinEnemy extends Enemy {
  constructor(opts) { super(GOBLIN, opts); }

  pose(state, t) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n, x, y, z) => poseBone(rig, n, x, y, z);
    // permanent hunch — the goblin is never upright
    const hunch = () => { S('spine', 0.30, 0, 0); S('chest', 0.20, 0, 0); S('neck', -0.30, 0, 0); };

    switch (state) {
      case 'approach':
      case 'run': {
        const ph = t * 12.5;
        hunch();
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          const o = s < 0 ? 0 : Math.PI;
          S(`hp${n}`, Math.sin(ph + o) * 0.8 - 0.25, 0, 0);
          S(`kn${n}`, 0.55 + Math.max(0, Math.sin(ph + o + 1.6)) * 0.85, 0, 0);
          S(`ft${n}`, -0.3 - Math.sin(ph + o) * 0.25, 0, 0);
          S(`sh${n}`, -Math.sin(ph + o) * 0.65 - 0.35, 0, 0.25 * s);
          S(`el${n}`, -0.95, 0, 0);
          S(`hd${n}`, 0.2, 0, 0);
        }
        S('head', 0.18 + Math.sin(ph * 2) * 0.06, Math.sin(ph * 0.7) * 0.12, 0);
        S('jaw', 0.32 + Math.sin(ph * 2) * 0.1, 0, 0);
        this.visual.position.y = Math.abs(Math.sin(ph)) * 0.055;
        break;
      }
      case 'telegraph': {
        const k = Math.min(1, this.stateTime / 0.28);
        hunch();
        S('spine', 0.30 - 0.18 * k, 0, 0);
        S('chest', 0.20 - 0.30 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, -2.3 * k, 0, 0.55 * s * k);
          S(`el${n}`, -1.5 * k, 0, 0);
          S(`hd${n}`, -0.5 * k, 0, 0);
          S(`hp${n}`, -0.45 * k, 0, 0);
          S(`kn${n}`, 0.85 * k, 0, 0);
        }
        S('head', -0.4 * k, 0, 0);
        S('jaw', 0.75 * k, 0, 0);
        this.visual.position.y = -0.10 * k;
        break;
      }
      case 'attack': {
        const k = Math.min(1, this.stateTime / 0.13);
        const e = 1 - Math.pow(1 - k, 3);
        S('spine', 0.30 + 0.25 * e, 0, 0);
        S('chest', 0.20 + 0.2 * e, 0, 0);
        S('neck', -0.30, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, -2.3 + 3.4 * e, 0, (0.55 - 0.75 * e) * s);
          S(`el${n}`, -1.5 + 1.2 * e, 0, 0);
          S(`hd${n}`, -0.5 + 0.9 * e, 0, 0);
        }
        S('head', 0.35 * e, 0, 0);
        S('jaw', 0.9, 0, 0);
        break;
      }
      case 'flinch': {
        const k = Math.exp(-this.stateTime * 8) * (1 - Math.min(1, this.stateTime / 0.35));
        hunch();
        S('spine', 0.30 + 0.35 * k, Math.sin(this.stateTime * 44) * 0.3 * k, 0);
        S('neck', -0.30 + 0.4 * k, 0, 0);
        S('head', -0.45 * k, 0.3 * k, 0.3 * k);
        S('jaw', 0.8 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, 0.6 * k, 0, 0.6 * s * k); S(`el${n}`, -1.4, 0, 0);
          S(`kn${n}`, 0.7 + 0.4 * k, 0, 0); S(`hp${n}`, -0.3 * k, 0, 0);
        }
        break;
      }
      case 'stagger': {
        const k = Math.min(1, this.stateTime / 0.18) * Math.max(0, 1 - this.stateTime / 2.2);
        S('spine', 0.30 + 0.5 * k, 0.3 * k, 0);
        S('chest', 0.20 + 0.3 * k, 0, 0);
        S('neck', -0.30 + 0.55 * k, 0, 0);
        S('head', -0.55 * k, 0.35 * k, 0);
        S('jaw', 0.9 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, 0.9 * k, 0, 0.9 * s * k); S(`el${n}`, -0.8, 0, 0);
          S(`hp${n}`, -0.6 * k, 0, 0); S(`kn${n}`, 1.2 * k, 0, 0);
        }
        this.visual.position.y = -0.18 * k;
        break;
      }
      case 'death': {
        const k = Math.min(1, this.stateTime / 0.5);
        const e = 1 - Math.pow(1 - k, 3);
        this.visual.rotation.x = e * 1.35;
        this.visual.position.y = -0.32 * e;
        S('spine', 0.30 - 0.4 * e, 0, 0);
        S('head', -0.3 * e, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, 1.2 * e, 0, 0.6 * s * e); S(`el${n}`, -0.5, 0, 0);
          S(`hp${n}`, -0.9 * e, 0, 0); S(`kn${n}`, 1.5 * e, 0, 0);
        }
        break;
      }
      default: {
        const b = Math.sin(t * 2.1) * 0.05;
        hunch();
        S('spine', 0.30 + b, 0, 0);
        S('head', 0.10 + b, Math.sin(t * 0.6) * 0.25, 0);
        S('jaw', 0.18 + Math.max(0, Math.sin(t * 1.3)) * 0.2, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, -0.45 + b, 0, 0.30 * s);
          S(`el${n}`, -1.15, 0, 0);
          S(`hd${n}`, 0.25, 0, 0);
          S(`hp${n}`, -0.28, 0, 0); S(`kn${n}`, 0.62, 0, 0); S(`ft${n}`, -0.32, 0, 0);
        }
        this.visual.position.y = 0;
        break;
      }
    }
  }
}

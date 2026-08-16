import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.js';
import { Enemy, organicNormal, organicRoughness } from './EnemyBase.js';
import { tube, blob, spike, place, tint, glow } from '../../combat/GeoKit.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

const FUR = 0x4b4034;
const FUR_DARK = 0x2b2620;
const BELLY = 0x8b7f6c;
const TUSK = 0xd9d2bd;
const CLAW = 0x1b1815;
const EYE = 0xffa416;

/**
 * Sabertusk — the Leide pack predator. Low, fast quadruped with a heavy
 * shoulder mass, a spined dorsal ridge and a pair of outsized lower tusks.
 * Hunts in threes: one commits, the others circle.
 */
export const SABERTUSK = {
  key: 'sabertusk',
  stats: {
    name: 'Sabertusk', hp: 780, poise: 42, speed: 5.6, attackRange: 2.1,
    aggroRange: 26, radius: 0.55, height: 1.05, damage: 88, level: 14,
  },
  weakness: 'fire',
  timing: { telegraph: 0.42, strike: 0.16, attack: 0.42, recover: 0.6 },
  buildPrototype,
  make(opts) { return new SabertuskEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('hips', 'root', [0, 0.72, -0.42]);
  rig.bone('spine', 'hips', [0, 0.78, -0.05]);
  rig.bone('chest', 'spine', [0, 0.80, 0.34]);
  rig.bone('neck', 'chest', [0, 0.83, 0.60]);
  rig.bone('head', 'neck', [0, 0.80, 0.86]);
  rig.bone('jaw', 'head', [0, 0.70, 0.92]);
  rig.bone('tail1', 'hips', [0, 0.70, -0.64]);
  rig.bone('tail2', 'tail1', [0, 0.64, -0.94]);
  rig.bone('tail3', 'tail2', [0, 0.54, -1.20]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`fsh${n}`, 'chest', [0.21 * s, 0.68, 0.32]);
    rig.bone(`fkn${n}`, `fsh${n}`, [0.24 * s, 0.36, 0.26]);
    rig.bone(`fpw${n}`, `fkn${n}`, [0.25 * s, 0.06, 0.36]);
    rig.bone(`bhp${n}`, 'hips', [0.23 * s, 0.70, -0.44]);
    rig.bone(`bkn${n}`, `bhp${n}`, [0.26 * s, 0.38, -0.58]);
    rig.bone(`bpw${n}`, `bkn${n}`, [0.26 * s, 0.06, -0.44]);
  }

  /* ---- torso ---- */
  const torso = tube([
    P(0, 0.70, -0.74), P(0, 0.75, -0.50), P(0, 0.79, -0.15),
    P(0, 0.80, 0.20), P(0, 0.82, 0.46), P(0, 0.82, 0.58),
  ], [0.15, 0.235, 0.245, 0.29, 0.245, 0.17], { radialSeg: 12, flat: 0.82 });
  rig.attach(tint(torso, FUR, 0.05), 'spine');

  const belly = tube([
    P(0, 0.60, -0.42), P(0, 0.60, 0.0), P(0, 0.62, 0.36),
  ], [0.14, 0.17, 0.15], { radialSeg: 8, flat: 0.6 });
  rig.attach(tint(belly, BELLY, 0.04), 'spine');

  // shoulder mass — the silhouette read that says "predator"
  for (const s of [-1, 1]) {
    const m = place(blob(0.15, 0.15, 0.21, 10, 8), { pos: [0.20 * s, 0.80, 0.28] });
    rig.attach(tint(m, FUR, 0.06), 'chest');
  }

  /* ---- dorsal ridge of quills ---- */
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const z = -0.62 + t * 1.18;
    const h = 0.10 + Math.sin(t * Math.PI) * 0.20;
    const y = 0.94 + Math.sin(t * Math.PI) * 0.04;
    const q = place(spike(0.030, h, 5), { pos: [0, y, z], rot: [-0.55 - t * 0.25, 0, 0] });
    rig.attach(tint(q, FUR_DARK), t < 0.35 ? 'hips' : t < 0.75 ? 'spine' : 'chest');
  }

  /* ---- neck & head ---- */
  const neck = tube([P(0, 0.82, 0.50), P(0, 0.83, 0.66), P(0, 0.81, 0.80)],
    [0.19, 0.175, 0.155], { radialSeg: 10, flat: 0.95 });
  rig.attachBlend(tint(neck, FUR, 0.05), 'chest', 'head', 1.0);

  const mane = tube([P(0, 0.86, 0.46), P(0, 0.88, 0.62)], [0.26, 0.21], { radialSeg: 10, flat: 0.8 });
  rig.attach(tint(mane, FUR_DARK, 0.08), 'chest');

  const skull = place(blob(0.135, 0.125, 0.165, 10, 8), { pos: [0, 0.81, 0.88] });
  rig.attach(tint(skull, FUR, 0.04), 'head');
  const snout = tube([P(0, 0.79, 0.95), P(0, 0.76, 1.10), P(0, 0.75, 1.20)],
    [0.10, 0.085, 0.065], { radialSeg: 8, flat: 0.85 });
  rig.attach(tint(snout, FUR_DARK, 0.05), 'head');
  const nose = place(blob(0.045, 0.035, 0.035, 6, 5), { pos: [0, 0.755, 1.235] });
  rig.attach(tint(nose, 0x14110f), 'head');

  // lower jaw
  const jaw = tube([P(0, 0.71, 0.94), P(0, 0.70, 1.12)], [0.075, 0.055], { radialSeg: 7, flat: 0.8 });
  rig.attach(tint(jaw, FUR_DARK), 'jaw');

  // the tusks: long, curved, unmissable
  for (const s of [-1, 1]) {
    const t1 = place(spike(0.036, 0.34, 6), { pos: [0.075 * s, 0.745, 1.10], rot: [2.55, 0, 0.16 * s] });
    rig.attach(tint(t1, TUSK), 'head');
    const t2 = place(spike(0.020, 0.15, 5), { pos: [0.055 * s, 0.735, 0.99], rot: [2.75, 0, 0.10 * s] });
    rig.attach(tint(t2, TUSK), 'head');
  }
  // upper fangs
  for (const s of [-1, 1]) {
    const f = place(spike(0.018, 0.10, 5), { pos: [0.055 * s, 0.735, 1.16], rot: [Math.PI - 0.15, 0, 0] });
    rig.attach(tint(f, TUSK), 'head');
  }

  // ears
  for (const s of [-1, 1]) {
    const e = place(spike(0.055, 0.15, 5), { pos: [0.095 * s, 0.90, 0.80], rot: [-0.5, 0, 0.55 * s] });
    rig.attach(tint(e, FUR_DARK), 'head');
  }
  // eyes — small, hot, catch the bloom
  for (const s of [-1, 1]) {
    const e = place(blob(0.030, 0.026, 0.020, 7, 5), { pos: [0.088 * s, 0.845, 1.005] });
    rig.attach(glow(tint(e, 0x120c02), EYE, 2.4), 'head');
  }

  /* ---- legs ---- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const fu = tube([P(0.21 * s, 0.72, 0.32), P(0.23 * s, 0.52, 0.29), P(0.24 * s, 0.37, 0.26)],
      [0.115, 0.095, 0.072], { radialSeg: 7 });
    rig.attachBlend(tint(fu, FUR, 0.04), `fsh${n}`, `fkn${n}`, 0.9);
    const fl = tube([P(0.24 * s, 0.37, 0.26), P(0.245 * s, 0.20, 0.31), P(0.25 * s, 0.08, 0.35)],
      [0.068, 0.050, 0.045], { radialSeg: 7 });
    rig.attachBlend(tint(fl, FUR_DARK, 0.04), `fkn${n}`, `fpw${n}`, 0.9);
    const fp = place(blob(0.062, 0.045, 0.085, 7, 5), { pos: [0.25 * s, 0.055, 0.40] });
    rig.attach(tint(fp, FUR_DARK), `fpw${n}`);
    for (let c = -1; c <= 1; c++) {
      const cl = place(spike(0.014, 0.055, 4), { pos: [(0.25 + c * 0.035) * s, 0.03, 0.465], rot: [1.25, 0, 0] });
      rig.attach(tint(cl, CLAW), `fpw${n}`);
    }

    const bu = tube([P(0.23 * s, 0.74, -0.42), P(0.25 * s, 0.55, -0.52), P(0.26 * s, 0.39, -0.57)],
      [0.135, 0.115, 0.078], { radialSeg: 7 });
    rig.attachBlend(tint(bu, FUR, 0.04), `bhp${n}`, `bkn${n}`, 0.9);
    const bl = tube([P(0.26 * s, 0.39, -0.57), P(0.26 * s, 0.22, -0.50), P(0.26 * s, 0.08, -0.45)],
      [0.072, 0.052, 0.045], { radialSeg: 7 });
    rig.attachBlend(tint(bl, FUR_DARK, 0.04), `bkn${n}`, `bpw${n}`, 0.9);
    const bp = place(blob(0.060, 0.045, 0.082, 7, 5), { pos: [0.26 * s, 0.055, -0.40] });
    rig.attach(tint(bp, FUR_DARK), `bpw${n}`);
    for (let c = -1; c <= 1; c++) {
      const cl = place(spike(0.013, 0.05, 4), { pos: [(0.26 + c * 0.033) * s, 0.03, -0.335], rot: [1.25, 0, 0] });
      rig.attach(tint(cl, CLAW), `bpw${n}`);
    }
  }

  /* ---- tail ---- */
  const t1 = tube([P(0, 0.72, -0.62), P(0, 0.68, -0.80)], [0.075, 0.058], { radialSeg: 6 });
  rig.attachBlend(tint(t1, FUR, 0.04), 'tail1', 'tail2', 1.0);
  const t2 = tube([P(0, 0.66, -0.88), P(0, 0.58, -1.14)], [0.052, 0.038], { radialSeg: 6 });
  rig.attachBlend(tint(t2, FUR, 0.04), 'tail2', 'tail3', 1.0);
  const tuft = place(blob(0.055, 0.055, 0.10, 7, 5), { pos: [0, 0.53, -1.26] });
  rig.attach(tint(tuft, FUR_DARK), 'tail3');

  const mat = creatureMaterial({
    roughness: 0.86, metalness: 0.0,
    normalMap: organicNormal(), normalScale: 0.6, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 2.0 });
}

class SabertuskEnemy extends Enemy {
  constructor(opts) { super(SABERTUSK, opts); }

  pose(state, t) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n, x, y, z) => poseBone(rig, n, x, y, z);
    const gait = (phase, amp, kneeAmp, front) => {
      for (const s of [-1, 1]) {
        const n = s < 0 ? 'L' : 'R';
        const off = (s < 0 ? 0 : Math.PI) + (front ? 0 : Math.PI * 0.55);
        const a = Math.sin(phase + off);
        const b = Math.sin(phase + off + 1.7);
        if (front) {
          S(`fsh${n}`, a * amp, 0, 0);
          S(`fkn${n}`, -0.35 + Math.max(0, b) * kneeAmp, 0, 0);
          S(`fpw${n}`, 0.25 - a * 0.3, 0, 0);
        } else {
          S(`bhp${n}`, -a * amp, 0, 0);
          S(`bkn${n}`, 0.5 - Math.max(0, b) * kneeAmp, 0, 0);
          S(`bpw${n}`, -0.3 + a * 0.3, 0, 0);
        }
      }
    };

    switch (state) {
      case 'run':
      case 'approach': {
        const ph = t * 11.5;
        gait(ph, 0.85, 0.9, true);
        gait(ph, 0.75, 0.85, false);
        S('spine', Math.sin(ph * 2) * 0.06, 0, 0);
        S('chest', -0.06 + Math.sin(ph * 2 + 1) * 0.05, 0, 0);
        S('neck', -0.10, 0, 0);
        S('head', 0.10 + Math.sin(ph) * 0.05, Math.sin(ph * 0.5) * 0.06, 0);
        S('tail1', -0.35, Math.sin(ph * 0.9) * 0.3, 0);
        S('tail2', -0.25, Math.sin(ph * 0.9 + 0.7) * 0.35, 0);
        S('tail3', -0.15, Math.sin(ph * 0.9 + 1.4) * 0.4, 0);
        this.visual.position.y = Math.abs(Math.sin(ph)) * 0.07;
        break;
      }
      case 'telegraph': {
        // hunker down, hackles up, weight back — the tell before the pounce
        const k = Math.min(1, this.stateTime / 0.3);
        const tremble = Math.sin(t * 40) * 0.02 * k;
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.35 * k, 0, 0); S(`fkn${n}`, -0.85 * k, 0, 0); S(`fpw${n}`, 0.5 * k, 0, 0);
          S(`bhp${n}`, -0.75 * k, 0, 0); S(`bkn${n}`, 1.15 * k, 0, 0); S(`bpw${n}`, -0.55 * k, 0, 0);
        }
        S('spine', 0.12 * k + tremble, 0, 0);
        S('chest', 0.10 * k, 0, 0);
        S('neck', 0.28 * k, 0, 0);
        S('head', -0.22 * k, 0, 0);
        S('jaw', 0.25 * k, 0, 0);
        S('tail1', 0.55 * k, 0, 0); S('tail2', 0.4 * k, 0, 0); S('tail3', 0.3 * k, 0, 0);
        this.visual.position.y = -0.16 * k;
        break;
      }
      case 'attack':
      case 'pounce': {
        // airborne lunge: front legs reaching, jaws wide, spine extended
        const k = state === 'pounce' ? 1 : Math.min(1, this.stateTime / 0.14);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, -1.15 * k, 0.10 * s, 0); S(`fkn${n}`, -0.30 * k, 0, 0); S(`fpw${n}`, -0.45 * k, 0, 0);
          S(`bhp${n}`, 0.95 * k, 0, 0); S(`bkn${n}`, -0.85 * k, 0, 0); S(`bpw${n}`, 0.5 * k, 0, 0);
        }
        S('spine', -0.22 * k, 0, 0);
        S('chest', -0.16 * k, 0, 0);
        S('neck', -0.30 * k, 0, 0);
        S('head', 0.34 * k, 0, 0);
        S('jaw', 0.85 * k, 0, 0);
        S('tail1', -0.6 * k, 0, 0); S('tail2', -0.35 * k, 0, 0); S('tail3', -0.2 * k, 0, 0);
        break;
      }
      case 'flinch': {
        const k = Math.exp(-this.stateTime * 7) * (1 - Math.min(1, this.stateTime / 0.35));
        const sh = Math.sin(this.stateTime * 46) * k;
        S('spine', 0.25 * k, sh * 0.4, 0);
        S('chest', 0.18 * k, sh * 0.3, 0);
        S('neck', 0.4 * k, sh * 0.5, 0);
        S('head', -0.5 * k, sh * 0.6, 0.3 * k);
        S('jaw', 0.5 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.3 * k, 0, 0); S(`fkn${n}`, -0.5 * k, 0, 0);
          S(`bhp${n}`, -0.35 * k, 0, 0); S(`bkn${n}`, 0.6 * k, 0, 0);
        }
        break;
      }
      case 'stagger': {
        const k = Math.min(1, this.stateTime / 0.2) * Math.max(0, 1 - this.stateTime / 2.2);
        S('spine', 0.32 * k, 0.28 * k, 0.2 * k);
        S('neck', 0.55 * k, 0.35 * k, 0);
        S('head', -0.6 * k, 0.3 * k, 0.4 * k);
        S('jaw', 0.6 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.55 * k, 0, 0); S(`fkn${n}`, -1.0 * k, 0, 0);
          S(`bhp${n}`, -0.7 * k, 0, 0); S(`bkn${n}`, 1.1 * k, 0, 0);
        }
        this.visual.position.y = -0.22 * k;
        break;
      }
      case 'death': {
        const k = Math.min(1, this.stateTime / 0.55);
        const e = 1 - Math.pow(1 - k, 3);
        this.visual.rotation.z = e * 1.45;
        this.visual.position.y = -0.42 * e;
        S('spine', 0.3 * e, 0, 0);
        S('neck', 0.5 * e, 0.3 * e, 0);
        S('head', -0.4 * e, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.6 * e, 0, 0); S(`fkn${n}`, -1.2 * e, 0, 0);
          S(`bhp${n}`, -0.8 * e, 0, 0); S(`bkn${n}`, 1.3 * e, 0, 0);
        }
        break;
      }
      default: {
        const b = Math.sin(t * 1.6) * 0.03;
        S('spine', b, 0, 0);
        S('chest', b * 0.6, 0, 0);
        S('neck', -0.05 + b, Math.sin(t * 0.5) * 0.12, 0);
        S('head', 0.05, Math.sin(t * 0.37) * 0.18, 0);
        S('tail1', -0.15, Math.sin(t * 1.1) * 0.25, 0);
        S('tail2', -0.1, Math.sin(t * 1.1 + 0.6) * 0.3, 0);
        S('tail3', -0.05, Math.sin(t * 1.1 + 1.2) * 0.35, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0, 0, 0); S(`fkn${n}`, -0.12, 0, 0); S(`fpw${n}`, 0.08, 0, 0);
          S(`bhp${n}`, -0.15, 0, 0); S(`bkn${n}`, 0.3, 0, 0); S(`bpw${n}`, -0.15, 0, 0);
        }
        this.visual.position.y = 0;
        break;
      }
    }
  }
}

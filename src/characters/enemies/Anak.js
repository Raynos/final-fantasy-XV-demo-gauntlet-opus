import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.js';
import { Enemy, organicNormal, organicRoughness } from './EnemyBase.js';
import { tube, blob, spike, place, tint, glow } from '../../combat/GeoKit.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

const DUN = 0xb59b70;
const DUN_DARK = 0x8a7350;
const CREAM = 0xe5d8b8;
const SOCK = 0x3a3026;
const HORN = 0x6f6047;
const HORN_DARK = 0x4c4131;
const HOOF = 0x1c1712;
const EYE = 0x140f0a;

/**
 * Anak — the stilt-legged grazer of the Leide highlands. Three metres tall
 * and almost none of it is body: a small dun barrel slung high on four
 * absurdly long spindly legs in dark socks, a long neck, and a narrow deer
 * skull carrying two backswept ribbed horns. It wants nothing to do with
 * anyone — it grazes, it startles, and if something actually corners it, it
 * kicks backwards and runs.
 */
export const ANAK = {
  key: 'anak',
  questId: 'anak',
  faction: 'beast',
  expClass: 'trash',
  stats: {
    name: 'Anak', hp: 900, poise: 40, speed: 5.2, attackRange: 2.6,
    aggroRange: 14, radius: 0.7, height: 3.0, damage: 60, level: 9,
  },
  // neutral to every element — nothing about it is built for a fight
  senses: { sight: 22, fov: 1.2, hearing: 20, nocturnal: false },
  /** Hints for the encounter code: it never opens hostilities, and it bolts. */
  passive: true,
  skittish: true,
  drops: [
    { id: 'anak_meat', chance: 0.6, count: 1 },
  ],
  timing: { telegraph: 0.5, strike: 0.18, attack: 0.6, recover: 0.8 },
  attacks: [
    // a panicked rear-leg lash at whatever is behind it
    {
      id: 'kick', range: 2.6, weight: 3, mult: 1.0, poise: 22, hitRadius: 2.4, arc: 1.4,
      telegraph: 0.5, strike: 0.18, attack: 0.6, recover: 0.8, cooldown: 2.4,
      backward: true,
    },
    // a shove with the horns, all shoulder, no malice
    {
      id: 'headbutt', range: 2.4, weight: 2, mult: 0.8, poise: 16, hitRadius: 1.8, arc: 1.0,
      telegraph: 0.45, strike: 0.16, attack: 0.5, recover: 0.7, cooldown: 2.0,
    },
  ],
  buildPrototype,
  make(opts) { return new AnakEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('hips', 'root', [0, 1.95, -0.42]);
  rig.bone('spine', 'hips', [0, 2.02, -0.08]);
  rig.bone('chest', 'spine', [0, 2.08, 0.26]);
  rig.bone('neck1', 'chest', [0, 2.26, 0.44]);
  rig.bone('neck2', 'neck1', [0, 2.56, 0.55]);
  rig.bone('head', 'neck2', [0, 2.80, 0.62]);
  rig.bone('jaw', 'head', [0, 2.72, 0.70]);
  rig.bone('tail1', 'hips', [0, 1.92, -0.58]);
  rig.bone('tail2', 'tail1', [0, 1.80, -0.72]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`fsh${n}`, 'chest', [0.22 * s, 2.02, 0.26]);
    rig.bone(`fkn${n}`, `fsh${n}`, [0.24 * s, 1.34, 0.34]);
    rig.bone(`fca${n}`, `fkn${n}`, [0.25 * s, 0.60, 0.22]);
    rig.bone(`fho${n}`, `fca${n}`, [0.25 * s, 0.07, 0.28]);
    rig.bone(`bhp${n}`, 'hips', [0.20 * s, 1.94, -0.40]);
    rig.bone(`bst${n}`, `bhp${n}`, [0.23 * s, 1.30, -0.54]);
    rig.bone(`bhk${n}`, `bst${n}`, [0.24 * s, 0.60, -0.32]);
    rig.bone(`bho${n}`, `bhk${n}`, [0.24 * s, 0.07, -0.26]);
  }

  /* ---- the small barrel of a body, hung high between the legs ---- */
  const torso = tube([
    P(0, 1.90, -0.58), P(0, 1.97, -0.28), P(0, 2.03, 0.02),
    P(0, 2.07, 0.28), P(0, 2.06, 0.46),
  ], [0.175, 0.255, 0.285, 0.255, 0.185], { radialSeg: 10, flat: 0.86 });
  rig.attachBlend(tint(torso, DUN, 0.05), 'hips', 'chest', 1.6);

  const belly = tube([P(0, 1.80, -0.30), P(0, 1.79, 0.02), P(0, 1.84, 0.30)],
    [0.16, 0.185, 0.155], { radialSeg: 8, flat: 0.8 });
  rig.attachBlend(tint(belly, CREAM, 0.04), 'hips', 'chest', 1.6);

  for (const s of [-1, 1]) {
    const hn = place(blob(0.115, 0.165, 0.185, 9, 7), { pos: [0.145 * s, 1.96, -0.38] });
    rig.attach(tint(hn, DUN, 0.05), 'hips');
    const sh = place(blob(0.105, 0.150, 0.150, 9, 7), { pos: [0.155 * s, 2.02, 0.26] });
    rig.attach(tint(sh, DUN, 0.05), 'chest');
    // cream flank flash, the field mark you spot it by at range
    const fl = place(blob(0.055, 0.11, 0.26, 8, 6), { pos: [0.235 * s, 1.90, -0.06] });
    rig.attach(tint(fl, CREAM, 0.04), 'spine');
  }
  // a low withers ridge so the topline is not a bare cylinder
  const withers = place(blob(0.13, 0.075, 0.22, 8, 6), { pos: [0, 2.16, 0.20] });
  rig.attach(tint(withers, DUN_DARK, 0.05), 'chest');

  /* ---- long neck ---- */
  const nk1 = tube([P(0, 2.10, 0.34), P(0, 2.30, 0.47), P(0, 2.46, 0.52)],
    [0.145, 0.120, 0.105], { radialSeg: 8, flat: 0.9 });
  rig.attachBlend(tint(nk1, DUN, 0.05), 'chest', 'neck2', 1.2);
  const nk2 = tube([P(0, 2.50, 0.53), P(0, 2.66, 0.58), P(0, 2.78, 0.61)],
    [0.100, 0.088, 0.078], { radialSeg: 8, flat: 0.9 });
  rig.attachBlend(tint(nk2, DUN, 0.05), 'neck2', 'head', 1.2);
  // cream throat stripe running the length of it
  const throat = tube([P(0, 2.14, 0.44), P(0, 2.40, 0.60), P(0, 2.64, 0.68)],
    [0.055, 0.046, 0.038], { radialSeg: 6, flat: 0.7 });
  rig.attachBlend(tint(throat, CREAM, 0.04), 'chest', 'head', 1.4);

  /* ---- narrow deer skull ---- */
  const skull = place(blob(0.085, 0.095, 0.145, 9, 7), { pos: [0, 2.82, 0.66] });
  rig.attach(tint(skull, DUN, 0.04), 'head');
  const muzzle = tube([P(0, 2.79, 0.74), P(0, 2.73, 0.90), P(0, 2.70, 1.00)],
    [0.070, 0.055, 0.046], { radialSeg: 7, flat: 0.85 });
  rig.attach(tint(muzzle, DUN, 0.04), 'head');
  const nose = place(blob(0.048, 0.036, 0.030, 7, 5), { pos: [0, 2.695, 1.025] });
  rig.attach(tint(nose, 0x2a221a), 'head');
  const chin = place(blob(0.045, 0.030, 0.070, 7, 5), { pos: [0, 2.665, 0.94] });
  rig.attach(tint(chin, CREAM, 0.04), 'jaw');
  const jaw = tube([P(0, 2.71, 0.74), P(0, 2.67, 0.92)], [0.052, 0.040], { radialSeg: 6, flat: 0.85 });
  rig.attach(tint(jaw, DUN_DARK, 0.04), 'jaw');

  // big dark eyes, set wide on the sides of the skull — pure prey animal
  for (const s of [-1, 1]) {
    const e = place(blob(0.042, 0.046, 0.036, 8, 6), { pos: [0.082 * s, 2.845, 0.72] });
    rig.attach(glow(tint(e, EYE), 0x2a2018, 0.35), 'head');
  }
  // tall mobile ears
  for (const s of [-1, 1]) {
    const ear = tube([P(0.075 * s, 2.90, 0.58), P(0.155 * s, 3.00, 0.48), P(0.195 * s, 3.06, 0.38)],
      [[0.045, 0.018], [0.052, 0.016], [0.020, 0.008]], { radialSeg: 6 });
    rig.attach(tint(ear, DUN_DARK, 0.05), 'head');
  }

  /* ---- backswept ribbed horns ---- */
  for (const s of [-1, 1]) {
    const h = tube([
      P(0.055 * s, 2.90, 0.62), P(0.080 * s, 3.02, 0.52), P(0.100 * s, 3.10, 0.36),
      P(0.108 * s, 3.14, 0.18), P(0.100 * s, 3.13, 0.03),
    ], [0.040, 0.034, 0.028, 0.021, 0.010], { radialSeg: 7 });
    rig.attach(tint(h, HORN, 0.04), 'head');
    // the ribbing: shallow rings stacked up the first two thirds
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const r = place(blob(0.040 - t * 0.012, 0.010, 0.040 - t * 0.012, 7, 4), {
        pos: [(0.060 + t * 0.045) * s, 2.94 + t * 0.16, 0.58 - t * 0.36],
        rot: [0.85 - t * 0.45, 0, 0],
      });
      rig.attach(tint(r, HORN_DARK), 'head');
    }
  }

  /* ---- the legs: nearly two metres of them, thin as broom handles ---- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const fu = tube([P(0.22 * s, 2.02, 0.26), P(0.23 * s, 1.68, 0.31), P(0.24 * s, 1.36, 0.34)],
      [0.085, 0.068, 0.052], { radialSeg: 7 });
    rig.attachBlend(tint(fu, DUN, 0.04), `fsh${n}`, `fkn${n}`, 0.9);
    const fm = tube([P(0.24 * s, 1.36, 0.34), P(0.245 * s, 0.98, 0.28), P(0.25 * s, 0.62, 0.22)],
      [0.048, 0.038, 0.032], { radialSeg: 7 });
    rig.attachBlend(tint(fm, DUN_DARK, 0.04), `fkn${n}`, `fca${n}`, 0.9);
    const fl = tube([P(0.25 * s, 0.62, 0.22), P(0.25 * s, 0.34, 0.25), P(0.25 * s, 0.10, 0.28)],
      [0.030, 0.026, 0.024], { radialSeg: 6 });
    rig.attachBlend(tint(fl, SOCK, 0.04), `fca${n}`, `fho${n}`, 0.9);
    const fh = place(blob(0.036, 0.055, 0.048, 7, 5), { pos: [0.25 * s, 0.045, 0.30] });
    rig.attach(tint(fh, HOOF), `fho${n}`);

    const bu = tube([P(0.20 * s, 1.94, -0.40), P(0.215 * s, 1.62, -0.48), P(0.23 * s, 1.32, -0.54)],
      [0.095, 0.075, 0.055], { radialSeg: 7 });
    rig.attachBlend(tint(bu, DUN, 0.04), `bhp${n}`, `bst${n}`, 0.9);
    const bm = tube([P(0.23 * s, 1.32, -0.54), P(0.235 * s, 0.96, -0.44), P(0.24 * s, 0.62, -0.32)],
      [0.050, 0.038, 0.031], { radialSeg: 7 });
    rig.attachBlend(tint(bm, DUN_DARK, 0.04), `bst${n}`, `bhk${n}`, 0.9);
    const bl = tube([P(0.24 * s, 0.62, -0.32), P(0.24 * s, 0.34, -0.29), P(0.24 * s, 0.10, -0.26)],
      [0.029, 0.025, 0.023], { radialSeg: 6 });
    rig.attachBlend(tint(bl, SOCK, 0.04), `bhk${n}`, `bho${n}`, 0.9);
    const bh = place(blob(0.035, 0.052, 0.046, 7, 5), { pos: [0.24 * s, 0.045, -0.24] });
    rig.attach(tint(bh, HOOF), `bho${n}`);
  }

  /* ---- little flag of a tail ---- */
  const t1 = tube([P(0, 1.92, -0.56), P(0, 1.82, -0.70)], [0.048, 0.034], { radialSeg: 6 });
  rig.attachBlend(tint(t1, DUN, 0.04), 'tail1', 'tail2', 1.0);
  const tuft = place(spike(0.055, 0.16, 6), { pos: [0, 1.79, -0.74], rot: [-2.5, 0, 0] });
  rig.attach(tint(tuft, CREAM, 0.06), 'tail2');

  const mat = creatureMaterial({
    roughness: 0.84, metalness: 0.0,
    normalMap: organicNormal(), normalScale: 0.55, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 3.4 });
}

class AnakEnemy extends Enemy {
  constructor(opts) { super(ANAK, opts); }

  pose(state, t) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n, x, y, z) => poseBone(rig, n, x, y, z);
    // neck as one curve: 0 = head up and alert, 1 = muzzle in the grass
    const neck = (down, yaw = 0, roll = 0) => {
      S('neck1', 0.55 * down - 0.10, yaw * 0.35, roll * 0.3);
      S('neck2', 0.60 * down, yaw * 0.45, roll * 0.35);
      S('head', 0.35 * down - 0.12, yaw * 0.55, roll * 0.4);
    };
    // long-legged loping trot; the legs swing from the shoulder like pendulums
    const gait = (phase, amp, kneeAmp, front) => {
      for (const s of [-1, 1]) {
        const n = s < 0 ? 'L' : 'R';
        const off = (s < 0 ? 0 : Math.PI) + (front ? 0 : Math.PI * 0.45);
        const a = Math.sin(phase + off);
        const b = Math.sin(phase + off + 1.8);
        if (front) {
          S(`fsh${n}`, a * amp, 0, 0);
          S(`fkn${n}`, -0.20 + Math.max(0, b) * kneeAmp, 0, 0);
          S(`fca${n}`, 0.30 - a * 0.35, 0, 0);
          S(`fho${n}`, -0.15 + a * 0.2, 0, 0);
        } else {
          S(`bhp${n}`, -a * amp, 0, 0);
          S(`bst${n}`, 0.45 - Math.max(0, b) * kneeAmp, 0, 0);
          S(`bhk${n}`, -0.40 + a * 0.4, 0, 0);
          S(`bho${n}`, 0.20 - a * 0.2, 0, 0);
        }
      }
    };

    switch (state) {
      case 'run':
      case 'approach': {
        const ph = t * 7.6;
        gait(ph, 0.72, 0.85, true);
        gait(ph, 0.66, 0.80, false);
        S('spine', Math.sin(ph * 2) * 0.05, 0, 0);
        S('chest', -0.04 + Math.sin(ph * 2 + 1) * 0.04, 0, 0);
        // the head stays high and level while the body lopes underneath it
        neck(0.05 + Math.sin(ph) * 0.05, Math.sin(ph * 0.4) * 0.12, 0);
        S('jaw', 0.06 + Math.max(0, Math.sin(ph * 2)) * 0.06, 0, 0);
        S('tail1', -0.45, Math.sin(ph * 0.9) * 0.25, 0);
        S('tail2', -0.30, Math.sin(ph * 0.9 + 0.6) * 0.3, 0);
        this.visual.position.y = Math.abs(Math.sin(ph)) * 0.11;
        this.visual.rotation.z = Math.sin(ph) * 0.04;
        break;
      }
      case 'telegraph': {
        const k = Math.min(1, this.stateTime / 0.28);
        const e = k * k * (3 - 2 * k);
        const flinchy = Math.sin(t * 26) * 0.025 * k;
        if (this.attackId === 'kick') {
          // shifts its whole weight onto the forelegs, tucks the head away and
          // cocks one hind leg — it is not looking at what it is about to hit
          S('spine', -0.12 * e, 0, 0);
          S('chest', -0.10 * e, 0, 0);
          neck(-0.18 * e + flinchy, -0.30 * e, 0);
          S('jaw', 0.10 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.20 * e, 0, 0); S(`fkn${n}`, -0.45 * e, 0, 0); S(`fca${n}`, 0.45 * e, 0, 0);
            S(`bhp${n}`, -0.85 * e, 0, 0); S(`bst${n}`, 1.35 * e, 0, 0); S(`bhk${n}`, -1.05 * e, 0, 0);
          }
          S('tail1', 0.85 * e, 0, 0); S('tail2', 0.6 * e, 0, 0);
          this.visual.position.y = -0.10 * e;
        } else {
          // headbutt: neck drawn back and the horns tipped forward
          S('spine', 0.06 * e, 0, 0);
          S('chest', 0.05 * e, 0, 0);
          neck(-0.30 * e + flinchy, 0, 0);
          S('head', -0.55 * e, 0, 0);
          S('jaw', 0.12 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.30 * e, 0, 0); S(`fkn${n}`, -0.55 * e, 0, 0); S(`fca${n}`, 0.4 * e, 0, 0);
            S(`bhp${n}`, -0.40 * e, 0, 0); S(`bst${n}`, 0.70 * e, 0, 0); S(`bhk${n}`, -0.55 * e, 0, 0);
          }
          this.visual.position.y = -0.08 * e;
        }
        this.visual.rotation.z = 0;
        break;
      }
      case 'attack': {
        if (this.attackId === 'kick') {
          // both hind legs snap straight out behind, body pitched forward
          const k = Math.min(1, this.stateTime / 0.12);
          const e = 1 - Math.pow(1 - k, 4);
          S('spine', -0.12 - 0.20 * e, 0, 0);
          S('chest', -0.10 - 0.14 * e, 0, 0);
          neck(-0.18 - 0.25 * e, -0.30, 0);
          S('jaw', 0.35 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.20 + 0.35 * e, 0, 0); S(`fkn${n}`, -0.45 - 0.2 * e, 0, 0); S(`fca${n}`, 0.45, 0, 0);
            S(`bhp${n}`, -0.85 + 1.85 * e, 0, 0);
            S(`bst${n}`, 1.35 - 1.60 * e, 0, 0);
            S(`bhk${n}`, -1.05 + 1.35 * e, 0, 0);
            S(`bho${n}`, 0.45 * e, 0, 0);
          }
          S('tail1', 0.85 - 1.5 * e, 0, 0); S('tail2', 0.6 - 1.1 * e, 0, 0);
          this.visual.position.y = -0.10 + 0.28 * e;
        } else {
          // headbutt: the neck uncoils and the horns come through
          const k = Math.min(1, this.stateTime / 0.13);
          const e = 1 - Math.pow(1 - k, 3);
          S('spine', 0.06 + 0.12 * e, 0, 0);
          S('chest', 0.05 + 0.10 * e, 0, 0);
          S('neck1', -0.10 - 0.30 + 0.75 * e, 0, 0);
          S('neck2', -0.30 + 0.85 * e, 0, 0);
          S('head', -0.12 - 0.55 + 1.05 * e, 0, 0);
          S('jaw', 0.12 + 0.2 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.30 - 0.5 * e, 0, 0); S(`fkn${n}`, -0.55 + 0.35 * e, 0, 0); S(`fca${n}`, 0.4 - 0.25 * e, 0, 0);
            S(`bhp${n}`, -0.40 + 0.2 * e, 0, 0); S(`bst${n}`, 0.70 - 0.3 * e, 0, 0); S(`bhk${n}`, -0.55 + 0.25 * e, 0, 0);
          }
          this.visual.position.y = -0.08 + 0.14 * e;
        }
        this.visual.rotation.z = 0;
        break;
      }
      case 'flinch': {
        // a full-body startle: everything jumps at once, then settles
        const k = Math.exp(-this.stateTime * 8) * (1 - Math.min(1, this.stateTime / 0.35));
        const sh = Math.sin(this.stateTime * 44) * k;
        S('spine', 0.20 * k, sh * 0.4, 0);
        S('chest', 0.14 * k, sh * 0.3, 0);
        neck(-0.55 * k, sh * 0.9, 0.4 * k);
        S('jaw', 0.45 * k, 0, 0);
        S('tail1', 1.0 * k, 0, 0); S('tail2', 0.7 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, -0.45 * k, 0, 0); S(`fkn${n}`, -0.30 * k, 0, 0); S(`fca${n}`, 0.5 * k, 0, 0);
          S(`bhp${n}`, -0.35 * k, 0, 0); S(`bst${n}`, 0.65 * k, 0, 0); S(`bhk${n}`, -0.5 * k, 0, 0);
        }
        this.visual.position.y = 0.14 * k;
        break;
      }
      case 'stagger': {
        // the long legs splay and the neck hangs — nothing holding it up
        const k = Math.min(1, this.stateTime / 0.22) * Math.max(0, 1 - this.stateTime / 2.3);
        S('spine', 0.28 * k, 0.24 * k, 0.18 * k);
        S('chest', 0.18 * k, 0.16 * k, 0);
        neck(0.75 * k, 0.30 * k, 0.5 * k);
        S('jaw', 0.5 * k, 0, 0);
        S('tail1', 0.3 * k, 0.3 * k, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.55 * k, 0, 0.30 * s * k); S(`fkn${n}`, -1.10 * k, 0, 0); S(`fca${n}`, 0.85 * k, 0, 0);
          S(`bhp${n}`, -0.70 * k, 0, 0.24 * s * k); S(`bst${n}`, 1.15 * k, 0, 0); S(`bhk${n}`, -0.85 * k, 0, 0);
        }
        this.visual.position.y = -0.55 * k;
        this.visual.rotation.z = 0.12 * k;
        break;
      }
      case 'death': {
        // the legs fold first, then the whole frame tips over sideways
        const k = Math.min(1, this.stateTime / 0.7);
        const e = 1 - Math.pow(1 - k, 3);
        this.visual.rotation.z = e * 1.5;
        this.visual.position.y = -0.85 * e;
        S('spine', 0.22 * e, 0, 0);
        neck(0.85 * e, 0.35 * e, 0);
        S('jaw', 0.4 * e, 0, 0);
        S('tail1', 0.35 * e, 0.3 * e, 0); S('tail2', 0.25 * e, 0.35 * e, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.75 * e, 0, 0); S(`fkn${n}`, -1.5 * e, 0, 0); S(`fca${n}`, 1.1 * e, 0, 0);
          S(`bhp${n}`, -0.85 * e, 0, 0); S(`bst${n}`, 1.55 * e, 0, 0); S(`bhk${n}`, -1.15 * e, 0, 0);
        }
        break;
      }
      default: {
        // grazing. Muzzle in the grass with a slow side-to-side crop, then
        // every few seconds the head comes up, sweeps a look around, and goes
        // back down. Ears and tail keep flicking throughout.
        const lift = Math.pow(Math.max(0, Math.sin(t * 0.28)), 5);
        const down = 1 - lift;
        const crop = Math.sin(t * 1.9) * down;
        const scan = Math.sin(t * 0.9) * lift;
        const breath = Math.sin(t * 1.5) * 0.025;
        S('spine', breath, crop * 0.05, 0);
        S('chest', breath * 0.6, crop * 0.06, 0);
        neck(down * 1.05 + breath, crop * 0.55 + scan * 1.1, crop * 0.35);
        // little chewing motion while the head is down
        S('jaw', 0.08 + Math.max(0, Math.sin(t * 6.2)) * 0.20 * down, 0, 0);
        S('tail1', -0.20, Math.sin(t * 1.7) * 0.35, 0);
        S('tail2', -0.12, Math.sin(t * 1.7 + 0.7) * 0.42, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          // weight shifts foot to foot; the forelegs splay a little to reach down
          const shift = Math.sin(t * 0.6 + (s < 0 ? 0 : Math.PI)) * 0.05;
          S(`fsh${n}`, 0.16 * down + shift, 0, 0.06 * s * down);
          S(`fkn${n}`, -0.20 - 0.14 * down, 0, 0);
          S(`fca${n}`, 0.18 + 0.10 * down, 0, 0);
          S(`fho${n}`, -0.10, 0, 0);
          S(`bhp${n}`, -0.14 - shift, 0, 0);
          S(`bst${n}`, 0.34, 0, 0);
          S(`bhk${n}`, -0.28, 0, 0);
          S(`bho${n}`, 0.14, 0, 0);
        }
        this.visual.position.y = breath * 0.4;
        this.visual.rotation.z = 0;
        break;
      }
    }
  }
}

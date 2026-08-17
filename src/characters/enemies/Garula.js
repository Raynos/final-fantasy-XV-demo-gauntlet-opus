import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.js';
import { Enemy, organicNormal, organicRoughness } from './EnemyBase.js';
import { tube, blob, spike, slab, place, tint, glow } from '../../combat/GeoKit.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

const SHAG = 0x6a4326;
const SHAG_DARK = 0x452a17;
const HIDE = 0x38352f;
const HIDE_DARK = 0x201e1a;
const TUSK = 0xcabf9f;
const HOOF = 0x1c1915;
const EYE = 0x8c5416;

/**
 * Garula — the Duscae grazer that turns into a landslide when provoked.
 * A tusked mammoth-boar the size of a van: one enormous barrel carried on
 * four pillar legs, a wide flat face with a broad snout and two upward-curving
 * tusks, and a mane of long coarse russet shag over the shoulders and down
 * the flanks. Everything it does is slow, committed and very heavy.
 */
export const GARULA = {
  key: 'garula',
  questId: 'garula',
  faction: 'beast',
  expClass: 'normal',
  stats: {
    name: 'Garula', hp: 4200, poise: 140, speed: 3.6, attackRange: 4.2,
    aggroRange: 26, radius: 1.4, height: 2.6, damage: 210, level: 16,
  },
  weakness: 'lightning',
  resist: 'ice',
  resistPct: { lightning: 175, ice: 55, fire: 100, dark: 100, light: 100 },
  weakTo: ['greatsword'],
  resistsWeapon: ['dagger'],
  senses: { sight: 26, fov: 1.4, hearing: 20, nocturnal: false },
  drops: [
    { id: 'garula_tenderloin', chance: 0.5, count: 1 },
    { id: 'garula_fur', chance: 0.35, count: 1 },
  ],
  timing: { telegraph: 0.85, strike: 0.30, attack: 0.95, recover: 1.30 },
  attacks: [
    // hook the head up from under the guard — the bread-and-butter swipe
    { id: 'tusk', range: 4.2, weight: 3, mult: 1.0, poise: 32, hitRadius: 3.0, arc: 1.4,
      telegraph: 0.80, strike: 0.30, attack: 0.95, recover: 1.25, cooldown: 1.9 },
    // rolls itself into a runaway barrel; long wind-up, almost no steering
    { id: 'barrel', range: 18, minRange: 7, weight: 2, mult: 1.7, poise: 64, hitRadius: 2.6,
      telegraph: 1.10, strike: 0.34, attack: 1.20, recover: 1.60, cooldown: 5.0,
      lunge: 12, tracking: 0.45, unblockable: true },
    // both forelegs come down together — a ring of broken ground
    { id: 'quake', range: 5.0, weight: 2, mult: 1.3, poise: 52, hitRadius: 4.0, aoe: true,
      telegraph: 1.00, strike: 0.32, attack: 1.05, recover: 1.55, cooldown: 4.2 },
  ],
  buildPrototype,
  make(opts) { return new GarulaEnemy(opts); },
};

/** One coarse hair lock, built hanging along -Y so `place` can aim it. */
function lock(len, w) {
  return tube([
    P(0, 0, 0), P(0, -len * 0.38, w * 0.4), P(0, -len * 0.74, w * 0.85), P(0, -len, w * 1.15),
  ], [[w, w * 0.34], [w * 0.92, w * 0.30], [w * 0.55, w * 0.20], [w * 0.10, w * 0.05]],
  { radialSeg: 5 });
}

/** One tusk: out of the lip, forward, then hooking up. */
function tuskGeo(len) {
  return tube([
    P(0, 0, 0), P(0, -0.05 * len, 0.30 * len), P(0, 0.06 * len, 0.58 * len),
    P(0, 0.34 * len, 0.72 * len), P(0, 0.62 * len, 0.66 * len),
  ], [0.090 * len, 0.076 * len, 0.058 * len, 0.038 * len, 0.012 * len], { radialSeg: 6 });
}

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('hips', 'root', [0, 1.55, -0.95]);
  rig.bone('spine', 'hips', [0, 1.62, -0.35]);
  rig.bone('chest', 'spine', [0, 1.66, 0.30]);
  rig.bone('neck', 'chest', [0, 1.60, 0.85]);
  rig.bone('head', 'neck', [0, 1.48, 1.28]);
  rig.bone('jaw', 'head', [0, 1.24, 1.44]);
  rig.bone('tail1', 'hips', [0, 1.52, -1.34]);
  rig.bone('tail2', 'tail1', [0, 1.38, -1.62]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`fsh${n}`, 'chest', [0.46 * s, 1.45, 0.44]);
    rig.bone(`fkn${n}`, `fsh${n}`, [0.51 * s, 0.86, 0.38]);
    rig.bone(`fpw${n}`, `fkn${n}`, [0.54 * s, 0.24, 0.42]);
    rig.bone(`bhp${n}`, 'hips', [0.50 * s, 1.48, -0.92]);
    rig.bone(`bkn${n}`, `bhp${n}`, [0.54 * s, 0.86, -1.02]);
    rig.bone(`bpw${n}`, `bkn${n}`, [0.56 * s, 0.24, -0.86]);
  }

  /* ---- the barrel: one enormous mass, nothing else competes with it ---- */
  const torso = tube([
    P(0, 1.58, -1.32), P(0, 1.64, -0.95), P(0, 1.68, -0.35),
    P(0, 1.70, 0.25), P(0, 1.66, 0.70), P(0, 1.58, 1.00),
  ], [0.46, 0.72, 0.82, 0.80, 0.68, 0.50], { radialSeg: 10, flat: 0.94 });
  rig.attachBlend(tint(torso, HIDE, 0.05), 'spine', 'chest', 1.8);

  const belly = tube([P(0, 1.16, -0.80), P(0, 1.10, -0.10), P(0, 1.14, 0.55)],
    [0.56, 0.62, 0.52], { radialSeg: 8, flat: 0.72 });
  rig.attach(tint(belly, HIDE_DARK, 0.04), 'spine');

  // withers hump — the shoulder mass the mane sits on
  const hump = place(blob(0.52, 0.44, 0.58, 10, 7), { pos: [0, 2.02, 0.28] });
  rig.attach(tint(hump, HIDE, 0.05), 'chest');
  const rump = place(blob(0.56, 0.52, 0.54, 10, 7), { pos: [0, 1.70, -1.06] });
  rig.attach(tint(rump, HIDE, 0.05), 'hips');

  /* ---- neck & the wide flat face ---- */
  const neck = tube([P(0, 1.70, 0.72), P(0, 1.64, 0.98), P(0, 1.56, 1.16)],
    [0.52, 0.48, 0.42], { radialSeg: 9, flat: 0.92 });
  rig.attachBlend(tint(neck, HIDE, 0.05), 'chest', 'head', 1.2);

  const skull = place(blob(0.36, 0.31, 0.34, 10, 7), { pos: [0, 1.50, 1.32] });
  rig.attach(tint(skull, HIDE, 0.04), 'head');
  // the face is a flat plate, not a muzzle — that is the Garula read
  const face = place(slab(0.66, 0.52, 0.16, 0.06), { pos: [0, 1.46, 1.52], rot: [0.14, 0, 0] });
  rig.attach(tint(face, HIDE, 0.04), 'head');
  const brow = place(slab(0.62, 0.11, 0.26, 0.03), { pos: [0, 1.66, 1.44], rot: [0.28, 0, 0] });
  rig.attach(tint(brow, HIDE_DARK), 'head');

  const snout = tube([P(0, 1.42, 1.56), P(0, 1.35, 1.80), P(0, 1.31, 1.98)],
    [[0.30, 0.22], [0.28, 0.20], [0.25, 0.17]], { radialSeg: 8 });
  rig.attach(tint(snout, HIDE_DARK, 0.04), 'head');
  const nose = place(blob(0.23, 0.14, 0.07, 8, 5), { pos: [0, 1.32, 2.03] });
  rig.attach(tint(nose, 0x141210), 'head');

  const jaw = tube([P(0, 1.24, 1.50), P(0, 1.21, 1.72), P(0, 1.21, 1.90)],
    [[0.25, 0.15], [0.22, 0.12], [0.18, 0.09]], { radialSeg: 7 });
  rig.attach(tint(jaw, HIDE_DARK, 0.04), 'jaw');

  // tusks — the only bright thing on the animal
  for (const s of [-1, 1]) {
    const t = place(tuskGeo(1.0), { pos: [0.27 * s, 1.26, 1.84], rot: [0, 0.24 * s, 0.10 * s] });
    rig.attach(tint(t, TUSK, 0.03), 'head');
    const t2 = place(tuskGeo(0.42), { pos: [0.19 * s, 1.22, 1.80], rot: [0, 0.34 * s, 0.16 * s] });
    rig.attach(tint(t2, TUSK, 0.03), 'jaw');
  }

  // small ears, mostly lost in the mane
  for (const s of [-1, 1]) {
    const e = place(blob(0.15, 0.09, 0.12, 6, 5), { pos: [0.35 * s, 1.63, 1.20], rot: [0, 0, 0.5 * s] });
    rig.attach(tint(e, HIDE_DARK, 0.04), 'head');
  }
  // eyes set far back on the flat face
  for (const s of [-1, 1]) {
    const e = place(blob(0.055, 0.045, 0.035, 6, 5), { pos: [0.30 * s, 1.57, 1.53] });
    rig.attach(glow(tint(e, 0x150c04), EYE, 1.5), 'head');
  }

  /* ---- pillar legs ---- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const fu = tube([P(0.45 * s, 1.50, 0.46), P(0.49 * s, 1.16, 0.42), P(0.51 * s, 0.88, 0.38)],
      [0.31, 0.28, 0.24], { radialSeg: 8 });
    rig.attachBlend(tint(fu, HIDE, 0.04), `fsh${n}`, `fkn${n}`, 0.9);
    const fl = tube([P(0.51 * s, 0.86, 0.38), P(0.53 * s, 0.55, 0.40), P(0.54 * s, 0.28, 0.42)],
      [0.22, 0.20, 0.19], { radialSeg: 8 });
    rig.attachBlend(tint(fl, HIDE_DARK, 0.04), `fkn${n}`, `fpw${n}`, 0.9);
    const ff = place(blob(0.25, 0.13, 0.26, 8, 5), { pos: [0.54 * s, 0.13, 0.46] });
    rig.attach(tint(ff, HIDE_DARK, 0.04), `fpw${n}`);
    for (let c = -1; c <= 1; c++) {
      const h = place(blob(0.075, 0.055, 0.075, 6, 4), { pos: [(0.54 + c * 0.13) * s, 0.06, 0.64] });
      rig.attach(tint(h, HOOF), `fpw${n}`);
    }

    const bu = tube([P(0.49 * s, 1.52, -0.90), P(0.52 * s, 1.18, -0.98), P(0.54 * s, 0.88, -1.02)],
      [0.33, 0.29, 0.24], { radialSeg: 8 });
    rig.attachBlend(tint(bu, HIDE, 0.04), `bhp${n}`, `bkn${n}`, 0.9);
    const bl = tube([P(0.54 * s, 0.86, -1.02), P(0.55 * s, 0.55, -0.94), P(0.56 * s, 0.28, -0.86)],
      [0.22, 0.20, 0.19], { radialSeg: 8 });
    rig.attachBlend(tint(bl, HIDE_DARK, 0.04), `bkn${n}`, `bpw${n}`, 0.9);
    const bf = place(blob(0.25, 0.13, 0.26, 8, 5), { pos: [0.56 * s, 0.13, -0.82] });
    rig.attach(tint(bf, HIDE_DARK, 0.04), `bpw${n}`);
    for (let c = -1; c <= 1; c++) {
      const h = place(blob(0.072, 0.052, 0.072, 6, 4), { pos: [(0.56 + c * 0.125) * s, 0.06, -0.65] });
      rig.attach(tint(h, HOOF), `bpw${n}`);
    }
  }

  /* ---- short tail ---- */
  const tl = tube([P(0, 1.56, -1.30), P(0, 1.44, -1.56)], [0.13, 0.09], { radialSeg: 6 });
  rig.attachBlend(tint(tl, HIDE, 0.04), 'tail1', 'tail2', 1.0);
  for (let i = 0; i < 3; i++) {
    const tf = place(lock(0.26, 0.045), { pos: [(i - 1) * 0.05, 1.40, -1.62], rot: [-0.5, 0, 0] });
    rig.attach(tint(tf, SHAG_DARK, 0.05), 'tail2');
  }

  /* ---- the mane: crest over the withers, curtains down both flanks ---- */
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const z = 0.86 - t * 1.05;
    const y = 2.14 + Math.sin(t * Math.PI) * 0.10;
    const len = 0.52 + Math.sin(t * Math.PI) * 0.34;
    const c = place(lock(len, 0.085), { pos: [0, y, z], rot: [-2.15 - t * 0.20, 0, 0] });
    rig.attach(tint(c, t < 0.35 ? SHAG : SHAG_DARK, 0.07), t < 0.5 ? 'chest' : 'spine');
  }
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const z = 0.72 - t * 1.35;
    for (const s of [-1, 1]) {
      for (let r = 0; r < 2; r++) {
        const a = 0.62 + r * 0.62;
        const x = Math.sin(a) * (0.78 - t * 0.05) * s;
        const y = 1.70 + Math.cos(a) * 0.82;
        const len = (0.62 + Math.sin((1 - t) * Math.PI * 0.6) * 0.34) * (1 - r * 0.22);
        const g = place(lock(len, 0.085), { pos: [x, y, z], rot: [-0.18, 0, (0.55 + r * 0.35) * s] });
        rig.attach(tint(g, r === 0 ? SHAG : SHAG_DARK, 0.07),
          z > 0.35 ? 'chest' : z > -0.5 ? 'spine' : 'hips');
      }
    }
  }
  // a fringe of shag hanging off the brow
  for (let i = -1; i <= 1; i++) {
    const f = place(lock(0.30, 0.07), { pos: [i * 0.20, 1.72, 1.34], rot: [-0.9, 0, 0] });
    rig.attach(tint(f, SHAG, 0.07), 'head');
  }
  // little bristle ridge along the snout
  for (let i = 0; i < 3; i++) {
    const b = place(spike(0.028, 0.10, 4), { pos: [0, 1.50 - i * 0.02, 1.66 + i * 0.11], rot: [-0.5, 0, 0] });
    rig.attach(tint(b, SHAG_DARK), 'head');
  }

  const mat = creatureMaterial({
    roughness: 0.90, metalness: 0.0,
    normalMap: organicNormal(), normalScale: 0.65, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 3.4 });
}

class GarulaEnemy extends Enemy {
  constructor(opts) { super(GARULA, opts); }

  pose(state, t) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n, x, y, z) => poseBone(rig, n, x, y, z);

    // Four-beat lateral walk: near hind, near fore, off hind, off fore.
    // A Garula never trots — it plods, and each footfall lands like a sack.
    const OFF = { fL: Math.PI * 0.5, fR: Math.PI * 1.5, bL: 0, bR: Math.PI };
    const walk = (ph, amp, kneeAmp, lift) => {
      for (const s of [-1, 1]) {
        const n = s < 0 ? 'L' : 'R';
        const fo = OFF[`f${n}`], bo = OFF[`b${n}`];
        const fa = Math.sin(ph + fo), fb = Math.max(0, Math.sin(ph + fo + 1.4));
        const ba = Math.sin(ph + bo), bb = Math.max(0, Math.sin(ph + bo + 1.4));
        S(`fsh${n}`, fa * amp, 0, 0);
        S(`fkn${n}`, -0.10 - fb * kneeAmp, 0, 0);
        S(`fpw${n}`, 0.10 + fa * lift, 0, 0);
        S(`bhp${n}`, -ba * amp, 0, 0);
        S(`bkn${n}`, 0.18 + bb * kneeAmp, 0, 0);
        S(`bpw${n}`, -0.12 - ba * lift, 0, 0);
      }
    };
    const rest = () => {
      for (const s of [-1, 1]) {
        const n = s < 0 ? 'L' : 'R';
        S(`fsh${n}`, 0, 0, 0); S(`fkn${n}`, -0.08, 0, 0); S(`fpw${n}`, 0.06, 0, 0);
        S(`bhp${n}`, -0.06, 0, 0); S(`bkn${n}`, 0.16, 0, 0); S(`bpw${n}`, -0.10, 0, 0);
      }
    };

    switch (state) {
      case 'run':
      case 'approach': {
        const ph = t * 5.4;
        walk(ph, 0.44, 0.55, 0.22);
        S('spine', Math.sin(ph * 2) * 0.035, Math.sin(ph) * 0.05, 0);
        S('chest', -0.03 + Math.sin(ph * 2 + 1.1) * 0.03, 0, Math.sin(ph) * 0.05);
        S('neck', 0.06 + Math.sin(ph * 2) * 0.05, 0, 0);
        S('head', -0.05 - Math.sin(ph * 2 + 0.6) * 0.07, Math.sin(ph) * 0.06, 0);
        S('tail1', -0.12, Math.sin(ph * 0.8) * 0.22, 0);
        S('tail2', -0.08, Math.sin(ph * 0.8 + 0.8) * 0.28, 0);
        this.visual.position.y = Math.abs(Math.sin(ph * 2)) * 0.045;
        this.visual.rotation.z = Math.sin(ph) * 0.035;
        break;
      }
      case 'telegraph': {
        const k = Math.min(1, this.stateTime / 0.5);
        const id = this.attackId;
        if (id === 'barrel') {
          // head down, shoulders loaded, one foreleg scraping the dirt
          rest();
          S('spine', 0.10 * k, 0, 0);
          S('chest', 0.16 * k, 0, 0);
          S('neck', 0.34 * k, 0, 0);
          S('head', -0.30 * k, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`bhp${n}`, -0.42 * k, 0, 0); S(`bkn${n}`, 0.70 * k, 0, 0);
          }
          const paw = Math.max(0, Math.sin(this.stateTime * 7)) * k;
          S('fshR', -0.55 * paw, 0, 0); S('fknR', -0.55 * paw, 0, 0);
          this.visual.position.y = -0.10 * k;
        } else if (id === 'quake') {
          // rises onto the hind legs, forelegs cocked high overhead
          const r = Math.min(1, this.stateTime / 0.7);
          rest();
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, -1.55 * r, 0.10 * s * r, 0);
            S(`fkn${n}`, -1.20 * r, 0, 0);
            S(`fpw${n}`, -0.45 * r, 0, 0);
            S(`bhp${n}`, 0.42 * r, 0, 0); S(`bkn${n}`, -0.30 * r, 0, 0);
          }
          S('spine', -0.42 * r, 0, 0);
          S('chest', -0.30 * r, 0, 0);
          S('neck', -0.28 * r, 0, 0);
          S('head', 0.42 * r, 0, 0);
          S('jaw', 0.35 * r, 0, 0);
          this.visual.rotation.x = -0.58 * r;
          this.visual.position.y = 0.34 * r;
        } else {
          // tusk: head cocked low and to one side, weight rocked back
          rest();
          S('spine', 0.08 * k, -0.10 * k, 0);
          S('chest', 0.12 * k, -0.14 * k, 0);
          S('neck', 0.40 * k, -0.22 * k, 0);
          S('head', -0.46 * k, -0.28 * k, -0.30 * k);
          S('jaw', 0.20 * k, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.20 * k, 0, 0); S(`fkn${n}`, -0.30 * k, 0, 0);
            S(`bhp${n}`, -0.38 * k, 0, 0); S(`bkn${n}`, 0.60 * k, 0, 0);
          }
          this.visual.position.y = -0.13 * k;
        }
        break;
      }
      case 'attack': {
        const id = this.attackId;
        if (id === 'barrel') {
          // flat out and low, legs churning under the barrel
          const ph = t * 13;
          const k = Math.min(1, this.stateTime / 0.18);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            const o = s < 0 ? 0 : Math.PI;
            S(`fsh${n}`, Math.sin(ph + o) * 1.0, 0, 0);
            S(`fkn${n}`, -0.55 - Math.max(0, Math.sin(ph + o + 1.5)) * 0.9, 0, 0);
            S(`bhp${n}`, -Math.sin(ph + o) * 0.95, 0, 0);
            S(`bkn${n}`, 0.55 + Math.max(0, Math.sin(ph + o + 1.5)) * 0.9, 0, 0);
          }
          S('spine', -0.10 * k, 0, 0);
          S('chest', 0.20 * k, 0, 0);
          S('neck', 0.42 * k, 0, 0);
          S('head', -0.40 * k, 0, 0);
          this.visual.position.y = -0.16 * k + Math.abs(Math.sin(ph)) * 0.05;
          this.visual.rotation.z = Math.sin(ph) * 0.10;
        } else if (id === 'quake') {
          // both forelegs come down; the whole animal lands on them
          const k = Math.min(1, this.stateTime / 0.30);
          const e = 1 - Math.pow(1 - k, 4);
          const shock = Math.exp(-Math.max(0, this.stateTime - 0.30) * 9)
            * Math.sin(this.stateTime * 52) * 0.05;
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, -1.55 + 1.85 * e, 0, 0);
            S(`fkn${n}`, -1.20 + 1.30 * e, 0, 0);
            S(`fpw${n}`, -0.45 + 0.55 * e, 0, 0);
            S(`bhp${n}`, 0.42 - 0.52 * e, 0, 0); S(`bkn${n}`, -0.30 + 0.52 * e, 0, 0);
          }
          S('spine', -0.42 + 0.60 * e + shock, 0, 0);
          S('chest', -0.30 + 0.46 * e, 0, 0);
          S('neck', -0.28 + 0.50 * e, 0, 0);
          S('head', 0.42 - 0.80 * e, 0, 0);
          S('jaw', 0.55 * (1 - e) + 0.15, 0, 0);
          this.visual.rotation.x = -0.58 * (1 - e) + shock;
          this.visual.position.y = 0.34 * (1 - e) - 0.06 * e;
        } else {
          // tusk: the head whips up and across, and the shoulders follow
          const k = Math.min(1, this.stateTime / 0.26);
          const e = 1 - Math.pow(1 - k, 3);
          S('spine', 0.08 - 0.20 * e, -0.10 + 0.24 * e, 0);
          S('chest', 0.12 - 0.28 * e, -0.14 + 0.34 * e, 0);
          S('neck', 0.40 - 0.86 * e, -0.22 + 0.50 * e, 0);
          S('head', -0.46 + 1.00 * e, -0.28 + 0.62 * e, -0.30 + 0.66 * e);
          S('jaw', 0.20 + 0.45 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.20 - 0.55 * e, 0, 0); S(`fkn${n}`, -0.30 + 0.20 * e, 0, 0);
            S(`bhp${n}`, -0.38 + 0.28 * e, 0, 0); S(`bkn${n}`, 0.60 - 0.42 * e, 0, 0);
          }
          this.visual.position.y = -0.13 + 0.20 * e;
        }
        break;
      }
      case 'flinch': {
        // barely notices — a shrug of that much muscle is a small thing
        const k = Math.exp(-this.stateTime * 8) * (1 - Math.min(1, this.stateTime / 0.35));
        const sh = Math.sin(this.stateTime * 34) * k;
        rest();
        S('spine', 0.10 * k, sh * 0.16, 0);
        S('chest', 0.08 * k, sh * 0.12, 0);
        S('neck', 0.20 * k, sh * 0.22, 0);
        S('head', -0.26 * k, sh * 0.26, 0.14 * k);
        S('jaw', 0.30 * k, 0, 0);
        this.visual.position.y = -0.05 * k;
        break;
      }
      case 'stagger': {
        // legs splay, the barrel sags between them, head hangs in the dirt
        const k = Math.min(1, this.stateTime / 0.3) * Math.max(0, 1 - this.stateTime / 2.6);
        const sway = Math.sin(this.stateTime * 3.2) * 0.16 * k;
        S('spine', 0.24 * k, sway, 0.12 * k);
        S('chest', 0.18 * k, sway * 0.7, 0);
        S('neck', 0.62 * k, sway * 1.2, 0);
        S('head', -0.55 * k, sway * 1.4, 0.20 * k);
        S('jaw', 0.60 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.42 * k, 0, 0.36 * s * k); S(`fkn${n}`, -0.72 * k, 0, 0);
          S(`bhp${n}`, -0.50 * k, 0, 0.32 * s * k); S(`bkn${n}`, 0.90 * k, 0, 0);
        }
        this.visual.position.y = -0.34 * k;
        break;
      }
      case 'death': {
        // the legs fold and the whole mass goes over sideways
        const k = Math.min(1, this.stateTime / 0.85);
        const e = 1 - Math.pow(1 - k, 3);
        this.visual.rotation.z = e * 1.42;
        this.visual.rotation.x = 0;
        this.visual.position.y = -0.62 * e;
        S('spine', 0.22 * e, 0, 0);
        S('chest', 0.14 * e, 0, 0);
        S('neck', 0.55 * e, 0.24 * e, 0);
        S('head', -0.48 * e, 0, 0);
        S('jaw', 0.42 * e, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.66 * e, 0, 0); S(`fkn${n}`, -1.05 * e, 0, 0);
          S(`bhp${n}`, -0.72 * e, 0, 0); S(`bkn${n}`, 1.15 * e, 0, 0);
        }
        break;
      }
      default: {
        // grazing idle: slow deep breathing, head dipping toward the ground
        const b = Math.sin(t * 1.1) * 0.035;
        rest();
        S('spine', b, 0, 0);
        S('chest', b * 0.6, 0, 0);
        S('neck', 0.18 + b + Math.sin(t * 0.34) * 0.10, Math.sin(t * 0.27) * 0.14, 0);
        S('head', -0.16 - b, Math.sin(t * 0.31) * 0.16, 0);
        S('jaw', 0.10 + Math.max(0, Math.sin(t * 2.3)) * 0.14, 0, 0);
        S('tail1', -0.06, Math.sin(t * 0.9) * 0.26, 0);
        S('tail2', -0.04, Math.sin(t * 0.9 + 0.7) * 0.32, 0);
        this.visual.position.y = 0;
        this.visual.rotation.x = 0;
        this.visual.rotation.z = 0;
        break;
      }
    }
  }
}

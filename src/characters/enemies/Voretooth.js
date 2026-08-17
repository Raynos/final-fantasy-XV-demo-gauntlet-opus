import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.js';
import { Enemy, organicNormal, organicRoughness } from './EnemyBase.js';
import { tube, blob, spike, slab, place, tint, glow } from '../../combat/GeoKit.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

const SKIN = 0x6b5f74;
const SKIN_DARK = 0x3a3142;
const BELLY = 0x8d8296;
const CREST = 0x4d4257;
const BONE = 0xcfc7b4;
const CLAW = 0x1a1620;
const EYE = 0xffd23a;

/**
 * Voretooth — the pack scavenger that infests the Leide flatlands. Hairless,
 * mottled purple-grey, a metre and a bit at the crest: spindly digitigrade
 * legs, a long whip tail held out flat for balance, and an oversized head
 * that splits into a four-way mandible maw the moment it commits. Faster and
 * far frailer than a Sabertusk, and it never stops fidgeting.
 */
export const VORETOOTH = {
  key: 'voretooth',
  questId: 'voretooth',
  faction: 'beast',
  expClass: 'normal',
  stats: {
    name: 'Voretooth', hp: 640, poise: 30, speed: 6.8, attackRange: 2.0,
    aggroRange: 28, radius: 0.5, height: 1.3, damage: 84, level: 11,
  },
  weakness: 'fire',
  resistPct: { fire: 160, ice: 100, lightning: 110, dark: 100, light: 100 },
  weakTo: ['polearm', 'dagger'],
  senses: { sight: 28, fov: 1.7, hearing: 22, nocturnal: false },
  drops: [
    { id: 'voretooth_tail', chance: 0.45, count: 1 },
  ],
  timing: { telegraph: 0.28, strike: 0.12, attack: 0.36, recover: 0.45 },
  attacks: [
    // snap-and-away: barely any commitment, thrown out constantly
    {
      id: 'bite', range: 2.1, weight: 4, mult: 0.9, poise: 12, hitRadius: 1.6, arc: 1.1,
      telegraph: 0.24, strike: 0.10, attack: 0.32, recover: 0.38, cooldown: 0.9,
    },
    // a short flat leap, mandibles wide on the way in
    {
      id: 'lunge', range: 6.5, minRange: 2.0, weight: 3, mult: 1.2, poise: 20, hitRadius: 1.8, arc: 1.0,
      telegraph: 0.40, strike: 0.14, attack: 0.50, recover: 0.60, cooldown: 2.2,
      lunge: 11, tracking: 1.2,
    },
    // spins on the spot and lashes the whip tail through a wide arc
    {
      id: 'tailwhip', range: 2.8, weight: 2, mult: 1.0, poise: 18, hitRadius: 2.4, arc: 2.6,
      telegraph: 0.32, strike: 0.16, attack: 0.46, recover: 0.55, cooldown: 2.8,
    },
  ],
  buildPrototype,
  make(opts) { return new VoretoothEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('hips', 'root', [0, 0.86, -0.52]);
  rig.bone('spine', 'hips', [0, 0.94, -0.10]);
  rig.bone('chest', 'spine', [0, 1.00, 0.36]);
  rig.bone('neck', 'chest', [0, 1.04, 0.64]);
  rig.bone('head', 'neck', [0, 1.06, 0.92]);
  rig.bone('jaw', 'head', [0, 0.98, 1.00]);
  rig.bone('mnL', 'head', [-0.07, 1.02, 1.04]);
  rig.bone('mnR', 'head', [0.07, 1.02, 1.04]);
  rig.bone('tail1', 'hips', [0, 0.86, -0.76]);
  rig.bone('tail2', 'tail1', [0, 0.84, -1.10]);
  rig.bone('tail3', 'tail2', [0, 0.80, -1.44]);
  rig.bone('tail4', 'tail3', [0, 0.76, -1.76]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`fsh${n}`, 'chest', [0.17 * s, 0.88, 0.34]);
    rig.bone(`fel${n}`, `fsh${n}`, [0.19 * s, 0.54, 0.42]);
    rig.bone(`fwr${n}`, `fel${n}`, [0.20 * s, 0.24, 0.30]);
    rig.bone(`fto${n}`, `fwr${n}`, [0.20 * s, 0.05, 0.40]);
    rig.bone(`bhp${n}`, 'hips', [0.18 * s, 0.86, -0.50]);
    rig.bone(`bkn${n}`, `bhp${n}`, [0.20 * s, 0.52, -0.66]);
    rig.bone(`bhk${n}`, `bkn${n}`, [0.21 * s, 0.24, -0.44]);
    rig.bone(`bto${n}`, `bhk${n}`, [0.21 * s, 0.05, -0.32]);
  }

  /* ---- lean torso: visible ribs, deep chest, starved waist ---- */
  const torso = tube([
    P(0, 0.88, -0.66), P(0, 0.92, -0.34), P(0, 0.94, -0.02),
    P(0, 0.99, 0.30), P(0, 1.02, 0.52), P(0, 1.03, 0.66),
  ], [0.115, 0.155, 0.135, 0.185, 0.155, 0.115], { radialSeg: 9, flat: 0.78 });
  rig.attachBlend(tint(torso, SKIN, 0.07), 'hips', 'chest', 1.6);

  const belly = tube([P(0, 0.80, -0.28), P(0, 0.82, 0.06), P(0, 0.86, 0.36)],
    [0.085, 0.075, 0.105], { radialSeg: 7, flat: 0.7 });
  rig.attachBlend(tint(belly, BELLY, 0.05), 'hips', 'chest', 1.6);

  // rib banding — the starved read, cheap in triangles
  for (let i = 0; i < 5; i++) {
    for (const s of [-1, 1]) {
      const r = place(slab(0.03, 0.13, 0.09, 0.01),
        { pos: [(0.13 - i * 0.008) * s, 0.96, 0.30 - i * 0.10], rot: [0, 0, 0.35 * s] });
      rig.attach(tint(r, SKIN_DARK, 0.04), i < 2 ? 'chest' : 'spine');
    }
  }
  for (const s of [-1, 1]) {
    const hn = place(blob(0.095, 0.125, 0.145, 8, 6), { pos: [0.115 * s, 0.88, -0.50] });
    rig.attach(tint(hn, SKIN, 0.05), 'hips');
    const sh = place(blob(0.085, 0.105, 0.115, 8, 6), { pos: [0.135 * s, 0.96, 0.32] });
    rig.attach(tint(sh, SKIN, 0.05), 'chest');
  }

  /* ---- neck & the oversized skull ---- */
  const neck = tube([P(0, 1.01, 0.58), P(0, 1.04, 0.74), P(0, 1.05, 0.88)],
    [0.095, 0.088, 0.082], { radialSeg: 8, flat: 0.9 });
  rig.attachBlend(tint(neck, SKIN, 0.05), 'chest', 'head', 1.1);

  const skull = place(blob(0.115, 0.115, 0.165, 10, 8), { pos: [0, 1.06, 0.98] });
  rig.attach(tint(skull, SKIN, 0.04), 'head');
  const braincase = place(blob(0.085, 0.075, 0.095, 8, 6), { pos: [0, 1.13, 0.90] });
  rig.attach(tint(braincase, SKIN_DARK, 0.05), 'head');
  // upper snout — the roof of the four-way maw
  const snout = tube([P(0, 1.08, 1.06), P(0, 1.09, 1.22), P(0, 1.08, 1.34)],
    [0.085, 0.062, 0.038], { radialSeg: 7, flat: 0.75 });
  rig.attach(tint(snout, SKIN, 0.05), 'head');
  for (let i = 0; i < 4; i++) {
    const f = place(spike(0.013, 0.055, 4), { pos: [0.030 * (i % 2 ? 1 : -1), 1.045, 1.14 + Math.floor(i / 2) * 0.10], rot: [Math.PI - 0.12, 0, 0] });
    rig.attach(tint(f, BONE), 'head');
  }

  // lower mandible
  const jaw = tube([P(0, 1.00, 1.04), P(0, 0.99, 1.20), P(0, 1.00, 1.32)],
    [0.062, 0.045, 0.028], { radialSeg: 7, flat: 0.8 });
  rig.attach(tint(jaw, SKIN_DARK, 0.05), 'jaw');
  for (let i = 0; i < 4; i++) {
    const f = place(spike(0.012, 0.05, 4), { pos: [0.026 * (i % 2 ? 1 : -1), 1.015, 1.12 + Math.floor(i / 2) * 0.10], rot: [-0.1, 0, 0] });
    rig.attach(tint(f, BONE), 'jaw');
  }

  // the lateral mandibles — the pair that makes the maw a four-way split
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const m = tube([P(0.075 * s, 1.03, 1.04), P(0.095 * s, 1.03, 1.20), P(0.075 * s, 1.04, 1.36)],
      [0.048, 0.036, 0.020], { radialSeg: 6, flat: 0.85 });
    rig.attach(tint(m, SKIN_DARK, 0.05), `mn${n}`);
    for (let i = 0; i < 3; i++) {
      const f = place(spike(0.011, 0.048, 4),
        { pos: [0.078 * s, 1.03, 1.10 + i * 0.09], rot: [0, 0, Math.PI * 0.5 * -s] });
      rig.attach(tint(f, BONE), `mn${n}`);
    }
  }

  /* ---- bony crest fanning back off the skull ---- */
  for (let i = -2; i <= 2; i++) {
    const t = Math.abs(i) / 2;
    const pl = place(slab(0.035, 0.20 - t * 0.07, 0.12, 0.012),
      { pos: [i * 0.055, 1.22 - t * 0.03, 0.80 - t * 0.02], rot: [-0.85, 0, i * 0.20] });
    rig.attach(tint(pl, CREST, 0.06), 'head');
  }
  const crestRoot = place(blob(0.14, 0.045, 0.075, 8, 5), { pos: [0, 1.155, 0.855], rot: [-0.5, 0, 0] });
  rig.attach(tint(crestRoot, CREST, 0.05), 'head');

  // eyes — set high and wide, always tracking something
  for (const s of [-1, 1]) {
    const e = place(blob(0.028, 0.024, 0.020, 7, 5), { pos: [0.088 * s, 1.10, 1.06] });
    rig.attach(glow(tint(e, 0x1a1402), EYE, 2.6), 'head');
  }

  /* ---- spindly digitigrade legs ---- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const fu = tube([P(0.17 * s, 0.88, 0.34), P(0.18 * s, 0.70, 0.39), P(0.19 * s, 0.55, 0.42)],
      [0.058, 0.046, 0.036], { radialSeg: 6 });
    rig.attachBlend(tint(fu, SKIN, 0.05), `fsh${n}`, `fel${n}`, 0.9);
    const fm = tube([P(0.19 * s, 0.55, 0.42), P(0.195 * s, 0.39, 0.36), P(0.20 * s, 0.25, 0.31)],
      [0.034, 0.026, 0.022], { radialSeg: 6 });
    rig.attachBlend(tint(fm, SKIN_DARK, 0.05), `fel${n}`, `fwr${n}`, 0.9);
    const fl = tube([P(0.20 * s, 0.25, 0.31), P(0.20 * s, 0.14, 0.36), P(0.20 * s, 0.06, 0.40)],
      [0.021, 0.019, 0.018], { radialSeg: 6 });
    rig.attachBlend(tint(fl, SKIN_DARK, 0.05), `fwr${n}`, `fto${n}`, 0.9);
    const fp = place(blob(0.030, 0.020, 0.048, 6, 5), { pos: [0.20 * s, 0.035, 0.44] });
    rig.attach(tint(fp, SKIN_DARK), `fto${n}`);
    for (let c = -1; c <= 1; c++) {
      const cl = place(spike(0.010, 0.055, 4), { pos: [(0.20 + c * 0.024) * s, 0.028, 0.475], rot: [1.3, 0, c * 0.2] });
      rig.attach(tint(cl, CLAW), `fto${n}`);
    }

    const bu = tube([P(0.18 * s, 0.87, -0.50), P(0.19 * s, 0.68, -0.58), P(0.20 * s, 0.53, -0.65)],
      [0.070, 0.055, 0.040], { radialSeg: 6 });
    rig.attachBlend(tint(bu, SKIN, 0.05), `bhp${n}`, `bkn${n}`, 0.9);
    const bm = tube([P(0.20 * s, 0.53, -0.65), P(0.205 * s, 0.38, -0.55), P(0.21 * s, 0.25, -0.45)],
      [0.036, 0.028, 0.023], { radialSeg: 6 });
    rig.attachBlend(tint(bm, SKIN_DARK, 0.05), `bkn${n}`, `bhk${n}`, 0.9);
    const bl = tube([P(0.21 * s, 0.25, -0.45), P(0.21 * s, 0.14, -0.38), P(0.21 * s, 0.06, -0.33)],
      [0.022, 0.020, 0.018], { radialSeg: 6 });
    rig.attachBlend(tint(bl, SKIN_DARK, 0.05), `bhk${n}`, `bto${n}`, 0.9);
    const bp = place(blob(0.028, 0.019, 0.046, 6, 5), { pos: [0.21 * s, 0.035, -0.29] });
    rig.attach(tint(bp, SKIN_DARK), `bto${n}`);
    for (let c = -1; c <= 1; c++) {
      const cl = place(spike(0.010, 0.05, 4), { pos: [(0.21 + c * 0.023) * s, 0.028, -0.255], rot: [1.3, 0, c * 0.2] });
      rig.attach(tint(cl, CLAW), `bto${n}`);
    }
  }

  /* ---- the whip tail: long, thin, held out level ---- */
  const t1 = tube([P(0, 0.87, -0.70), P(0, 0.86, -0.94)], [0.062, 0.048], { radialSeg: 6 });
  rig.attachBlend(tint(t1, SKIN, 0.05), 'tail1', 'tail2', 1.0);
  const t2 = tube([P(0, 0.85, -1.02), P(0, 0.82, -1.30)], [0.044, 0.032], { radialSeg: 6 });
  rig.attachBlend(tint(t2, SKIN, 0.05), 'tail2', 'tail3', 1.0);
  const t3 = tube([P(0, 0.80, -1.38), P(0, 0.77, -1.66)], [0.029, 0.019], { radialSeg: 6 });
  rig.attachBlend(tint(t3, SKIN_DARK, 0.05), 'tail3', 'tail4', 1.0);
  const t4 = tube([P(0, 0.76, -1.72), P(0, 0.74, -1.98)], [0.017, 0.006], { radialSeg: 5 });
  rig.attach(tint(t4, SKIN_DARK, 0.05), 'tail4');
  // a hooked barb on the tip, so the tailwhip reads as a threat
  const barb = place(spike(0.020, 0.09, 5), { pos: [0, 0.745, -2.00], rot: [-1.35, 0, 0] });
  rig.attach(tint(barb, BONE), 'tail4');

  const mat = creatureMaterial({
    roughness: 0.62, metalness: 0.0,
    normalMap: organicNormal(), normalScale: 0.85, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 2.4 });
}

class VoretoothEnemy extends Enemy {
  constructor(opts) { super(VORETOOTH, opts); }

  pose(state, t) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n, x, y, z) => poseBone(rig, n, x, y, z);
    // the maw: 0 shut, 1 fully split four ways
    const maw = (k) => {
      S('jaw', 0.85 * k, 0, 0);
      S('mnL', 0, 0.30 * k, -0.55 * k);
      S('mnR', 0, -0.30 * k, 0.55 * k);
    };
    const gait = (phase, amp, kneeAmp, front) => {
      for (const s of [-1, 1]) {
        const n = s < 0 ? 'L' : 'R';
        const off = (s < 0 ? 0 : Math.PI) + (front ? 0 : Math.PI * 0.6);
        const a = Math.sin(phase + off);
        const b = Math.sin(phase + off + 1.7);
        if (front) {
          S(`fsh${n}`, a * amp, 0, 0);
          S(`fel${n}`, -0.45 + Math.max(0, b) * kneeAmp, 0, 0);
          S(`fwr${n}`, 0.55 - a * 0.35, 0, 0);
          S(`fto${n}`, -0.25 + a * 0.25, 0, 0);
        } else {
          S(`bhp${n}`, -a * amp, 0, 0);
          S(`bkn${n}`, 0.70 - Math.max(0, b) * kneeAmp, 0, 0);
          S(`bhk${n}`, -0.60 + a * 0.4, 0, 0);
          S(`bto${n}`, 0.3 - a * 0.25, 0, 0);
        }
      }
    };
    const tail = (base, sway, freq) => {
      S('tail1', base, Math.sin(t * freq) * sway, 0);
      S('tail2', base * 0.7, Math.sin(t * freq + 0.7) * sway * 1.25, 0);
      S('tail3', base * 0.5, Math.sin(t * freq + 1.4) * sway * 1.5, 0);
      S('tail4', base * 0.3, Math.sin(t * freq + 2.1) * sway * 1.8, 0);
    };

    switch (state) {
      case 'run':
      case 'approach': {
        const ph = t * 14.5;
        gait(ph, 0.95, 1.0, true);
        gait(ph, 0.85, 0.95, false);
        S('spine', Math.sin(ph * 2) * 0.08, 0, 0);
        S('chest', -0.08 + Math.sin(ph * 2 + 1) * 0.06, 0, 0);
        S('neck', -0.14, Math.sin(ph * 0.5) * 0.08, 0);
        S('head', 0.14 + Math.sin(ph) * 0.07, Math.sin(ph * 0.37) * 0.10, 0);
        maw(0.12 + Math.max(0, Math.sin(ph)) * 0.12);
        tail(-0.30, 0.36, 9.0);
        this.visual.position.y = Math.abs(Math.sin(ph)) * 0.08;
        this.visual.rotation.z = Math.sin(ph) * 0.05;
        break;
      }
      case 'telegraph': {
        const k = Math.min(1, this.stateTime / 0.16);
        const jitter = Math.sin(t * 46) * 0.03 * k;
        if (this.attackId === 'lunge') {
          // coils: haunches folded right under it, maw already splitting
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.42 * k, 0, 0); S(`fel${n}`, -1.05 * k, 0, 0); S(`fwr${n}`, 0.85 * k, 0, 0);
            S(`bhp${n}`, -0.85 * k, 0, 0); S(`bkn${n}`, 1.35 * k, 0, 0); S(`bhk${n}`, -1.05 * k, 0, 0);
          }
          S('spine', 0.16 * k + jitter, 0, 0);
          S('chest', 0.12 * k, 0, 0);
          S('neck', 0.24 * k, 0, 0);
          S('head', -0.24 * k + jitter, 0, 0);
          maw(0.55 * k);
          tail(0.55 * k, 0.10, 20.0);
          this.visual.position.y = -0.14 * k;
        } else if (this.attackId === 'tailwhip') {
          // loads the whole tail to one side before the lash
          S('spine', 0.04, -0.30 * k, 0);
          S('chest', 0, -0.22 * k, 0);
          S('neck', 0, -0.35 * k, 0);
          S('head', 0.05, -0.45 * k, 0);
          maw(0.25 * k);
          S('tail1', -0.10, 0.85 * k, 0);
          S('tail2', -0.05, 0.95 * k, 0);
          S('tail3', 0, 1.0 * k, 0);
          S('tail4', 0, 0.9 * k, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.14 * k, 0, 0); S(`fel${n}`, -0.6, 0, 0); S(`fwr${n}`, 0.55, 0, 0);
            S(`bhp${n}`, -0.35 * k, 0, 0); S(`bkn${n}`, 0.85, 0, 0); S(`bhk${n}`, -0.7, 0, 0);
          }
          this.visual.position.y = -0.05 * k;
        } else {
          // bite: neck cocked back, head shivering with the wind-up
          S('spine', 0.06 * k + jitter, 0, 0);
          S('neck', 0.34 * k, 0, 0);
          S('head', -0.36 * k + jitter * 2, 0, 0);
          maw(0.75 * k);
          tail(-0.2, 0.25, 16.0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.22 * k, 0, 0); S(`fel${n}`, -0.8, 0, 0); S(`fwr${n}`, 0.7, 0, 0);
            S(`bhp${n}`, -0.45 * k, 0, 0); S(`bkn${n}`, 0.95, 0, 0); S(`bhk${n}`, -0.75, 0, 0);
          }
          this.visual.position.y = -0.06 * k;
        }
        this.visual.rotation.z = 0;
        break;
      }
      case 'attack': {
        if (this.attackId === 'lunge') {
          const k = Math.min(1, this.stateTime / 0.10);
          const e = 1 - Math.pow(1 - k, 3);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, -1.30 * e, 0.12 * s * e, 0); S(`fel${n}`, -0.25 * e, 0, 0); S(`fwr${n}`, -0.35 * e, 0, 0);
            S(`bhp${n}`, 1.05 * e, 0, 0); S(`bkn${n}`, -0.75 * e, 0, 0); S(`bhk${n}`, 0.55 * e, 0, 0);
          }
          S('spine', -0.26 * e, 0, 0);
          S('chest', -0.18 * e, 0, 0);
          S('neck', -0.32 * e, 0, 0);
          S('head', 0.30 * e, 0, 0);
          maw(1.0);
          tail(-0.70 * e, 0.08, 12.0);
          this.visual.position.y = 0.10 * e;
        } else if (this.attackId === 'tailwhip') {
          // the lash sweeps the whole tail through, body counter-rotating
          const k = Math.min(1, this.stateTime / 0.18);
          const e = 1 - Math.pow(1 - k, 3);
          S('spine', 0.04, 0.85 - 1.15 * e, 0);
          S('chest', 0, 0.22 - 0.5 * e, 0);
          S('neck', 0, -0.35 + 0.6 * e, 0);
          S('head', 0.05, -0.45 + 0.8 * e, 0);
          maw(0.35);
          S('tail1', -0.10, 0.85 - 1.85 * e, 0);
          S('tail2', -0.05, 0.95 - 2.1 * e, 0);
          S('tail3', 0, 1.0 - 2.25 * e, 0);
          S('tail4', 0, 0.9 - 2.1 * e, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.14, 0, 0); S(`fel${n}`, -0.6, 0, 0); S(`fwr${n}`, 0.55, 0, 0);
            S(`bhp${n}`, -0.30, 0, 0); S(`bkn${n}`, 0.8, 0, 0); S(`bhk${n}`, -0.65, 0, 0);
          }
          this.visual.position.y = -0.03;
        } else {
          // bite: the head fires forward and the maw slams shut on it
          const k = Math.min(1, this.stateTime / 0.09);
          const e = 1 - Math.pow(1 - k, 3);
          S('spine', 0.06 - 0.16 * e, 0, 0);
          S('chest', -0.10 * e, 0, 0);
          S('neck', 0.34 - 0.66 * e, 0, 0);
          S('head', -0.36 + 0.62 * e, 0, 0);
          maw(Math.max(0.05, 0.9 - e * 0.95));
          tail(-0.35, 0.15, 14.0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.22 - 0.55 * e, 0, 0); S(`fel${n}`, -0.8 + 0.3 * e, 0, 0); S(`fwr${n}`, 0.7 - 0.3 * e, 0, 0);
            S(`bhp${n}`, -0.45 + 0.25 * e, 0, 0); S(`bkn${n}`, 0.95 - 0.2 * e, 0, 0); S(`bhk${n}`, -0.75, 0, 0);
          }
          this.visual.position.y = -0.06 + 0.06 * e;
        }
        this.visual.rotation.z = 0;
        break;
      }
      case 'flinch': {
        const k = Math.exp(-this.stateTime * 9) * (1 - Math.min(1, this.stateTime / 0.35));
        const sh = Math.sin(this.stateTime * 52) * k;
        S('spine', 0.28 * k, sh * 0.5, 0);
        S('chest', 0.20 * k, sh * 0.4, 0);
        S('neck', 0.45 * k, sh * 0.6, 0);
        S('head', -0.55 * k, sh * 0.7, 0.35 * k);
        maw(0.8 * k);
        tail(0.5 * k, 0.6 * k, 24.0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.4 * k, 0, 0); S(`fel${n}`, -0.9, 0, 0); S(`fwr${n}`, 0.8, 0, 0);
          S(`bhp${n}`, -0.45 * k, 0, 0); S(`bkn${n}`, 1.0, 0, 0); S(`bhk${n}`, -0.8, 0, 0);
        }
        break;
      }
      case 'stagger': {
        const k = Math.min(1, this.stateTime / 0.18) * Math.max(0, 1 - this.stateTime / 2.2);
        S('spine', 0.40 * k, 0.32 * k, 0.2 * k);
        S('chest', 0.26 * k, 0.2 * k, 0);
        S('neck', 0.60 * k, 0.38 * k, 0);
        S('head', -0.30 * k, 0.32 * k, 0.42 * k);
        maw(0.55 * k);
        tail(0.35 * k, 0.2 * k, 4.0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.65 * k, 0, 0); S(`fel${n}`, -1.3 * k, 0, 0); S(`fwr${n}`, 1.0 * k, 0, 0);
          S(`bhp${n}`, -0.8 * k, 0, 0); S(`bkn${n}`, 1.4 * k, 0, 0); S(`bhk${n}`, -1.1 * k, 0, 0);
        }
        this.visual.position.y = -0.26 * k;
        this.visual.rotation.z = 0.08 * k;
        break;
      }
      case 'death': {
        const k = Math.min(1, this.stateTime / 0.45);
        const e = 1 - Math.pow(1 - k, 3);
        this.visual.rotation.z = e * 1.5;
        this.visual.position.y = -0.30 * e;
        S('spine', 0.35 * e, 0, 0);
        S('neck', 0.55 * e, 0.3 * e, 0);
        S('head', -0.4 * e, 0, 0);
        maw(0.45 * (1 - e * 0.4));
        S('tail1', 0.3 * e, 0.4 * e, 0);
        S('tail2', 0.25 * e, 0.5 * e, 0);
        S('tail3', 0.2 * e, 0.55 * e, 0);
        S('tail4', 0.15 * e, 0.6 * e, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.75 * e, 0, 0); S(`fel${n}`, -1.5 * e, 0, 0); S(`fwr${n}`, 1.1 * e, 0, 0);
          S(`bhp${n}`, -0.9 * e, 0, 0); S(`bkn${n}`, 1.6 * e, 0, 0); S(`bhk${n}`, -1.2 * e, 0, 0);
        }
        break;
      }
      default: {
        // twitchy idle. A slow breath under a constant fidget, plus sharp
        // head-snaps on a periodic burst — it never holds still for a second.
        const breath = Math.sin(t * 3.1) * 0.03;
        const fidget = Math.sin(t * 17.3) * 0.02 + Math.sin(t * 29.7) * 0.012;
        const snapA = Math.pow(Math.max(0, Math.sin(t * 1.31)), 14);
        const snapB = Math.pow(Math.max(0, Math.sin(t * 0.83 + 1.9)), 14);
        const look = snapA * 0.7 - snapB * 0.85;
        const sniff = Math.pow(Math.max(0, Math.sin(t * 2.7)), 8);
        S('spine', breath + fidget, look * 0.12, 0);
        S('chest', breath * 0.5, look * 0.16, 0);
        S('neck', -0.08 + breath + fidget * 1.5, look * 0.45, 0);
        S('head', 0.06 - snapA * 0.22 + fidget * 2.2, look * 0.75, look * 0.20);
        maw(0.10 + sniff * 0.35 + Math.abs(fidget) * 4);
        S('tail1', -0.18, Math.sin(t * 2.3) * 0.28 + Math.sin(t * 11.1) * 0.05, 0);
        S('tail2', -0.12, Math.sin(t * 2.3 + 0.6) * 0.36 + Math.sin(t * 11.1 + 1) * 0.07, 0);
        S('tail3', -0.08, Math.sin(t * 2.3 + 1.2) * 0.44 + Math.sin(t * 11.1 + 2) * 0.09, 0);
        S('tail4', -0.04, Math.sin(t * 2.3 + 1.8) * 0.52 + Math.sin(t * 11.1 + 3) * 0.11, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          // one forepaw lifts and paws the ground on the off-beat
          const paw = s < 0 ? Math.pow(Math.max(0, Math.sin(t * 0.97)), 10) : 0;
          S(`fsh${n}`, 0.10 - paw * 0.55, 0, 0);
          S(`fel${n}`, -0.55 - paw * 0.35, 0, 0);
          S(`fwr${n}`, 0.55 + paw * 0.7, 0, 0);
          S(`fto${n}`, -0.15, 0, 0);
          S(`bhp${n}`, -0.30 + fidget, 0, 0);
          S(`bkn${n}`, 0.80, 0, 0);
          S(`bhk${n}`, -0.65, 0, 0);
          S(`bto${n}`, 0.20, 0, 0);
        }
        this.visual.position.y = breath * 0.35;
        this.visual.rotation.z = fidget * 0.6;
        break;
      }
    }
  }
}

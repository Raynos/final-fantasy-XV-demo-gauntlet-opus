import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.js';
import { Enemy, organicNormal, organicRoughness } from './EnemyBase.js';
import { tube, blob, spike, slab, place, tint, glow } from '../../combat/GeoKit.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

const HIDE = 0x6b5a44;
const HIDE_DARK = 0x463a2c;
const SHAG = 0x574733;
const BELLY = 0x9c8f76;
const HORN = 0xe4dcc4;
const HORN_DARK = 0xb8ad91;
const HOOF = 0x14120f;
const EYE = 0xc46a1e;

/**
 * Dualhorn — the Leide plains bull-boar. Two and a third metres at the
 * shoulder of shaggy dust-brown muscle: an enormous humped forequarter
 * tapering back to small hindquarters, short pillar legs, a stubby tail, and
 * a low armoured skull carrying a pair of forward-swept ivory horns as long
 * as a man's arm. Placid until it isn't; then it puts its head down and runs
 * straight through whatever is in the way.
 */
export const DUALHORN = {
  key: 'dualhorn',
  questId: 'dualhorn',
  faction: 'beast',
  expClass: 'normal',
  stats: {
    name: 'Dualhorn', hp: 2600, poise: 90, speed: 4.4, attackRange: 3.4,
    aggroRange: 30, radius: 1.05, height: 2.3, damage: 190, level: 18,
  },
  weakness: 'fire',
  resist: 'ice',
  resistPct: { fire: 160, ice: 70, lightning: 100, dark: 100, light: 100 },
  weakTo: ['greatsword'],
  senses: { sight: 30, fov: 1.5, hearing: 18, nocturnal: false },
  drops: [
    { id: 'dualhorn_steak', chance: 0.5, count: 1 },
    { id: 'beast_bone', chance: 0.25, count: 1 },
  ],
  timing: { telegraph: 0.7, strike: 0.26, attack: 0.8, recover: 1.0 },
  attacks: [
    // short horn toss — a flick of that armoured skull, close in
    {
      id: 'gore', range: 3.6, weight: 3, mult: 1.0, poise: 26, hitRadius: 2.6, arc: 1.3,
      telegraph: 0.55, strike: 0.22, attack: 0.7, recover: 0.9, cooldown: 1.4,
    },
    // the signature: a long committed run-down that barely tracks
    {
      id: 'charge', range: 16, minRange: 6, weight: 2, mult: 1.6, poise: 55, hitRadius: 2.2,
      telegraph: 0.95, strike: 0.30, attack: 1.1, recover: 1.4, cooldown: 4.0,
      lunge: 16, tracking: 0.4, unblockable: true,
    },
    // both front hooves come down together — everything nearby eats it
    {
      id: 'stomp', range: 3.2, weight: 2, mult: 1.3, poise: 40, hitRadius: 3.2, arc: Math.PI,
      telegraph: 0.85, strike: 0.30, attack: 0.9, recover: 1.2, cooldown: 3.2, aoe: true,
    },
  ],
  buildPrototype,
  make(opts) { return new DualhornEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('hips', 'root', [0, 1.55, -1.25]);
  rig.bone('spine', 'hips', [0, 1.72, -0.50]);
  rig.bone('chest', 'spine', [0, 1.86, 0.30]);
  rig.bone('neck', 'chest', [0, 1.78, 0.92]);
  rig.bone('head', 'neck', [0, 1.48, 1.36]);
  rig.bone('jaw', 'head', [0, 1.30, 1.48]);
  rig.bone('tail1', 'hips', [0, 1.50, -1.55]);
  rig.bone('tail2', 'tail1', [0, 1.34, -1.76]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`fsh${n}`, 'chest', [0.46 * s, 1.42, 0.36]);
    rig.bone(`fkn${n}`, `fsh${n}`, [0.50 * s, 0.78, 0.42]);
    rig.bone(`fhf${n}`, `fkn${n}`, [0.52 * s, 0.16, 0.36]);
    rig.bone(`bhp${n}`, 'hips', [0.42 * s, 1.44, -1.20]);
    rig.bone(`bkn${n}`, `bhp${n}`, [0.46 * s, 0.76, -1.34]);
    rig.bone(`bhf${n}`, `bkn${n}`, [0.48 * s, 0.16, -1.16]);
  }

  /* ---- torso: small behind, colossal in front ---- */
  const torso = tube([
    P(0, 1.48, -1.62), P(0, 1.55, -1.20), P(0, 1.66, -0.55),
    P(0, 1.80, 0.10), P(0, 1.84, 0.58), P(0, 1.76, 0.94),
  ], [0.40, 0.56, 0.68, 0.84, 0.78, 0.56], { radialSeg: 10, flat: 0.92 });
  rig.attachBlend(tint(torso, HIDE, 0.06), 'hips', 'chest', 1.6);

  // the hump — the mass that makes the profile unmistakable at 20 m
  const hump = place(blob(0.60, 0.42, 0.72, 12, 9), { pos: [0, 1.94, 0.16] });
  rig.attach(tint(hump, SHAG, 0.07), 'chest');
  const humpFront = place(blob(0.50, 0.30, 0.34, 10, 7), { pos: [0, 1.90, 0.62] });
  rig.attach(tint(humpFront, SHAG, 0.06), 'chest');

  // dirty pale underbelly
  const belly = tube([
    P(0, 1.22, -1.05), P(0, 1.14, -0.30), P(0, 1.16, 0.35), P(0, 1.28, 0.78),
  ], [0.34, 0.46, 0.52, 0.40], { radialSeg: 8, flat: 0.75 });
  rig.attachBlend(tint(belly, BELLY, 0.05), 'hips', 'chest', 1.6);

  // haunches — small, but still slabs of muscle
  for (const s of [-1, 1]) {
    const h = place(blob(0.34, 0.38, 0.42, 9, 7), { pos: [0.34 * s, 1.48, -1.16] });
    rig.attach(tint(h, HIDE, 0.05), 'hips');
    const sh = place(blob(0.30, 0.36, 0.34, 9, 7), { pos: [0.42 * s, 1.52, 0.30] });
    rig.attach(tint(sh, HIDE, 0.05), 'chest');
  }

  /* ---- shaggy coat: clumps of matted hair hanging off the forequarter ---- */
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const z = 0.70 - t * 1.30;
    const y = 1.98 - t * 0.16;
    const bone = t < 0.35 ? 'chest' : t < 0.8 ? 'spine' : 'hips';
    const clump = place(spike(0.14 - t * 0.05, 0.34 - t * 0.12, 5),
      { pos: [0, y, z], rot: [Math.PI * 0.5 + 0.35, 0, 0] });
    rig.attach(tint(clump, SHAG, 0.09), bone);
    for (const s of [-1, 1]) {
      const side = place(spike(0.11 - t * 0.04, 0.30 - t * 0.10, 5),
        { pos: [(0.42 - t * 0.10) * s, y - 0.24, z], rot: [0.25, 0, Math.PI * 0.5 * s + 0.4 * s] });
      rig.attach(tint(side, SHAG, 0.09), bone);
    }
  }
  // beard hanging under the throat
  for (let i = 0; i < 3; i++) {
    const b = place(spike(0.10, 0.30 - i * 0.05, 5),
      { pos: [0, 1.42 - i * 0.03, 0.82 + i * 0.14], rot: [Math.PI - 0.25, 0, 0] });
    rig.attach(tint(b, SHAG, 0.08), 'neck');
  }

  /* ---- neck & armoured skull ---- */
  const neck = tube([P(0, 1.80, 0.84), P(0, 1.72, 1.06), P(0, 1.58, 1.26)],
    [0.44, 0.40, 0.34], { radialSeg: 9, flat: 0.95 });
  rig.attachBlend(tint(neck, HIDE, 0.05), 'chest', 'head', 1.2);

  const skull = place(blob(0.32, 0.24, 0.36, 10, 8), { pos: [0, 1.46, 1.44] });
  rig.attach(tint(skull, HIDE, 0.04), 'head');
  // the bony boss the horns grow out of — a slab of armour across the brow
  const boss = place(slab(0.62, 0.16, 0.34, 0.05), { pos: [0, 1.60, 1.46], rot: [0.22, 0, 0] });
  rig.attach(tint(boss, HORN_DARK, 0.04), 'head');
  const brow = place(slab(0.54, 0.09, 0.20, 0.03), { pos: [0, 1.52, 1.62], rot: [0.35, 0, 0] });
  rig.attach(tint(brow, HIDE_DARK), 'head');

  const muzzle = tube([P(0, 1.42, 1.58), P(0, 1.36, 1.82), P(0, 1.34, 1.98)],
    [0.26, 0.22, 0.19], { radialSeg: 8, flat: 0.9 });
  rig.attach(tint(muzzle, HIDE_DARK, 0.05), 'head');
  const nose = place(blob(0.17, 0.12, 0.09, 8, 6), { pos: [0, 1.34, 2.03] });
  rig.attach(tint(nose, 0x241d17), 'head');
  const jaw = tube([P(0, 1.24, 1.56), P(0, 1.22, 1.86)], [0.19, 0.15], { radialSeg: 7, flat: 0.9 });
  rig.attach(tint(jaw, HIDE_DARK, 0.04), 'jaw');
  // stubby tusks poking out of the lower jaw
  for (const s of [-1, 1]) {
    const t = place(spike(0.035, 0.16, 5), { pos: [0.12 * s, 1.28, 1.80], rot: [-0.35, 0, 0.18 * s] });
    rig.attach(tint(t, HORN), 'jaw');
  }

  /* ---- the horns: forward-swept, longer than they have any right to be ---- */
  for (const s of [-1, 1]) {
    const h = tube([
      P(0.26 * s, 1.60, 1.36), P(0.48 * s, 1.66, 1.42), P(0.66 * s, 1.60, 1.66),
      P(0.72 * s, 1.48, 1.98), P(0.66 * s, 1.42, 2.24), P(0.56 * s, 1.44, 2.42),
    ], [0.135, 0.115, 0.092, 0.068, 0.042, 0.014], { radialSeg: 8 });
    rig.attach(tint(h, HORN, 0.04), 'head');
    // growth rings near the base, so the horn does not read as a plain cone
    for (let i = 0; i < 3; i++) {
      const r = place(blob(0.13 - i * 0.012, 0.032, 0.13 - i * 0.012, 8, 5),
        { pos: [(0.34 + i * 0.13) * s, 1.645 - i * 0.02, 1.40 + i * 0.10], rot: [0, 0, 1.45 * s] });
      rig.attach(tint(r, HORN_DARK), 'head');
    }
  }

  // ears, tucked behind the horn bosses
  for (const s of [-1, 1]) {
    const e = place(blob(0.06, 0.10, 0.15, 7, 5), { pos: [0.30 * s, 1.52, 1.26], rot: [0.2, 0, 0.7 * s] });
    rig.attach(tint(e, HIDE_DARK, 0.05), 'head');
  }
  // small, sunken, unimpressed eyes
  for (const s of [-1, 1]) {
    const e = place(blob(0.045, 0.038, 0.030, 7, 5), { pos: [0.235 * s, 1.50, 1.62] });
    rig.attach(glow(tint(e, 0x150c02), EYE, 1.3), 'head');
  }

  /* ---- legs: short, thick, pillar-like, ending in split black hooves ---- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const fu = tube([P(0.46 * s, 1.44, 0.34), P(0.49 * s, 1.10, 0.38), P(0.50 * s, 0.80, 0.42)],
      [0.26, 0.22, 0.185], { radialSeg: 8 });
    rig.attachBlend(tint(fu, HIDE, 0.04), `fsh${n}`, `fkn${n}`, 0.9);
    const fl = tube([P(0.50 * s, 0.80, 0.42), P(0.51 * s, 0.48, 0.39), P(0.52 * s, 0.20, 0.36)],
      [0.175, 0.145, 0.130], { radialSeg: 8 });
    rig.attachBlend(tint(fl, HIDE_DARK, 0.04), `fkn${n}`, `fhf${n}`, 0.9);
    const fh = place(blob(0.16, 0.12, 0.20, 8, 6), { pos: [0.52 * s, 0.10, 0.40] });
    rig.attach(tint(fh, HOOF), `fhf${n}`);
    const fc = place(slab(0.05, 0.16, 0.30, 0.02), { pos: [0.52 * s, 0.08, 0.42] });
    rig.attach(tint(fc, 0x0a0908), `fhf${n}`);

    const bu = tube([P(0.42 * s, 1.44, -1.20), P(0.45 * s, 1.10, -1.28), P(0.46 * s, 0.78, -1.34)],
      [0.24, 0.20, 0.165], { radialSeg: 8 });
    rig.attachBlend(tint(bu, HIDE, 0.04), `bhp${n}`, `bkn${n}`, 0.9);
    const bl = tube([P(0.46 * s, 0.78, -1.34), P(0.47 * s, 0.46, -1.26), P(0.48 * s, 0.20, -1.18)],
      [0.155, 0.130, 0.118], { radialSeg: 8 });
    rig.attachBlend(tint(bl, HIDE_DARK, 0.04), `bkn${n}`, `bhf${n}`, 0.9);
    const bh = place(blob(0.145, 0.11, 0.185, 8, 6), { pos: [0.48 * s, 0.10, -1.14] });
    rig.attach(tint(bh, HOOF), `bhf${n}`);
    const bc = place(slab(0.05, 0.15, 0.28, 0.02), { pos: [0.48 * s, 0.08, -1.12] });
    rig.attach(tint(bc, 0x0a0908), `bhf${n}`);
  }

  /* ---- stubby tail ---- */
  const t1 = tube([P(0, 1.50, -1.52), P(0, 1.38, -1.72)], [0.11, 0.08], { radialSeg: 6 });
  rig.attachBlend(tint(t1, HIDE, 0.04), 'tail1', 'tail2', 1.0);
  const tuft = place(blob(0.10, 0.10, 0.13, 7, 5), { pos: [0, 1.28, -1.84] });
  rig.attach(tint(tuft, SHAG, 0.08), 'tail2');

  const mat = creatureMaterial({
    roughness: 0.90, metalness: 0.0,
    normalMap: organicNormal(), normalScale: 0.7, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 3.4 });
}

class DualhornEnemy extends Enemy {
  constructor(opts) { super(DUALHORN, opts); }

  pose(state, t) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n, x, y, z) => poseBone(rig, n, x, y, z);
    // heavy four-beat walk: front pair leads, back pair follows half a beat
    const gait = (phase, amp, kneeAmp, front) => {
      for (const s of [-1, 1]) {
        const n = s < 0 ? 'L' : 'R';
        const off = (s < 0 ? 0 : Math.PI) + (front ? 0 : Math.PI * 0.5);
        const a = Math.sin(phase + off);
        const b = Math.sin(phase + off + 1.6);
        if (front) {
          S(`fsh${n}`, a * amp, 0, 0);
          S(`fkn${n}`, -0.18 + Math.max(0, b) * kneeAmp, 0, 0);
          S(`fhf${n}`, 0.16 - a * 0.22, 0, 0);
        } else {
          S(`bhp${n}`, -a * amp, 0, 0);
          S(`bkn${n}`, 0.32 - Math.max(0, b) * kneeAmp, 0, 0);
          S(`bhf${n}`, -0.20 + a * 0.24, 0, 0);
        }
      }
    };

    switch (state) {
      case 'run':
      case 'approach': {
        const ph = t * 6.4;
        gait(ph, 0.52, 0.62, true);
        gait(ph, 0.46, 0.58, false);
        S('spine', Math.sin(ph * 2) * 0.04, Math.sin(ph) * 0.05, 0);
        S('chest', -0.05 + Math.sin(ph * 2 + 1) * 0.035, 0, 0);
        S('neck', 0.06 + Math.sin(ph) * 0.05, 0, 0);
        S('head', -0.04 + Math.sin(ph * 2) * 0.07, Math.sin(ph * 0.5) * 0.05, 0);
        S('tail1', 0.15, Math.sin(ph * 0.8) * 0.3, 0);
        S('tail2', 0.1, Math.sin(ph * 0.8 + 0.6) * 0.35, 0);
        this.visual.position.y = Math.abs(Math.sin(ph)) * 0.06;
        this.visual.rotation.z = Math.sin(ph) * 0.035;
        break;
      }
      case 'telegraph': {
        const k = Math.min(1, this.stateTime / 0.3);
        if (this.attackId === 'charge') {
          // THE tell: skull dropped to knee height, weight rocked back onto the
          // hindquarters, front hooves scraping the dirt, whole mass shivering.
          const scrape = Math.sin(t * 16);
          const shiver = Math.sin(t * 34) * 0.02 * k;
          S('spine', -0.10 * k + shiver, 0, 0);
          S('chest', -0.16 * k, 0, 0);
          S('neck', 0.62 * k, 0, 0);
          S('head', 0.34 * k + shiver * 2, 0, 0);
          S('jaw', 0.14 * k, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            const lead = s < 0 ? 1 : -1;
            S(`fsh${n}`, (0.30 + scrape * 0.34 * lead) * k, 0, 0);
            S(`fkn${n}`, (-0.55 - Math.max(0, scrape * lead) * 0.5) * k, 0, 0);
            S(`fhf${n}`, (0.45 + scrape * 0.3 * lead) * k, 0, 0);
            S(`bhp${n}`, -0.42 * k, 0, 0);
            S(`bkn${n}`, 0.66 * k, 0, 0);
            S(`bhf${n}`, -0.30 * k, 0, 0);
          }
          S('tail1', 0.5 * k, 0, 0); S('tail2', 0.4 * k, 0, 0);
          this.visual.position.y = -0.14 * k;
          this.visual.rotation.z = 0;
        } else if (this.attackId === 'stomp') {
          // rears: front legs come off the ground, chest climbing
          const e = k * k * (3 - 2 * k);
          S('spine', 0.34 * e, 0, 0);
          S('chest', 0.26 * e, 0, 0);
          S('neck', -0.30 * e, 0, 0);
          S('head', -0.24 * e, 0, 0);
          S('jaw', 0.35 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, -1.25 * e, 0, 0.12 * s * e);
            S(`fkn${n}`, -1.05 * e, 0, 0);
            S(`fhf${n}`, 0.5 * e, 0, 0);
            S(`bhp${n}`, 0.28 * e, 0, 0);
            S(`bkn${n}`, -0.35 * e, 0, 0);
            S(`bhf${n}`, 0.25 * e, 0, 0);
          }
          this.visual.position.y = 0.30 * e;
          this.visual.rotation.z = 0;
        } else {
          // gore: head cocked and loaded to one side, shoulder braced
          const e = k * k * (3 - 2 * k);
          S('spine', 0.05 * e, -0.14 * e, 0);
          S('chest', 0.04 * e, -0.18 * e, 0);
          S('neck', -0.22 * e, -0.30 * e, 0);
          S('head', -0.20 * e, -0.34 * e, -0.28 * e);
          S('jaw', 0.20 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.20 * e, 0, 0); S(`fkn${n}`, -0.35 * e, 0, 0);
            S(`bhp${n}`, -0.22 * e, 0, 0); S(`bkn${n}`, 0.34 * e, 0, 0);
          }
          this.visual.position.y = -0.06 * e;
          this.visual.rotation.z = 0;
        }
        break;
      }
      case 'attack': {
        if (this.attackId === 'charge') {
          // flat-out: horns levelled, legs hammering, body slung forward
          const k = Math.min(1, this.stateTime / 0.12);
          const ph = t * 13.0;
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            const off = s < 0 ? 0 : Math.PI;
            S(`fsh${n}`, Math.sin(ph + off) * 0.95 * k, 0, 0);
            S(`fkn${n}`, -0.5 - Math.max(0, Math.sin(ph + off + 1.5)) * 0.9 * k, 0, 0);
            S(`fhf${n}`, 0.3, 0, 0);
            S(`bhp${n}`, -Math.sin(ph + off + 1.1) * 0.9 * k, 0, 0);
            S(`bkn${n}`, 0.5 + Math.max(0, Math.sin(ph + off + 2.6)) * 0.8 * k, 0, 0);
            S(`bhf${n}`, -0.25, 0, 0);
          }
          S('spine', -0.14 * k + Math.sin(ph * 2) * 0.04, 0, 0);
          S('chest', -0.20 * k, 0, 0);
          S('neck', 0.30 * k, 0, 0);
          S('head', 0.12 * k, 0, 0);
          S('jaw', 0.30 * k, 0, 0);
          S('tail1', -0.4 * k, 0, 0); S('tail2', -0.3 * k, 0, 0);
          this.visual.position.y = Math.abs(Math.sin(ph)) * 0.09;
        } else if (this.attackId === 'stomp') {
          // both front hooves slam down together
          const k = Math.min(1, this.stateTime / 0.16);
          const e = 1 - Math.pow(1 - k, 4);
          S('spine', 0.34 - 0.52 * e, 0, 0);
          S('chest', 0.26 - 0.44 * e, 0, 0);
          S('neck', -0.30 + 0.55 * e, 0, 0);
          S('head', -0.24 + 0.42 * e, 0, 0);
          S('jaw', 0.35 * (1 - e * 0.5), 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, -1.25 + 1.75 * e, 0, 0.12 * s * (1 - e));
            S(`fkn${n}`, -1.05 + 0.95 * e, 0, 0);
            S(`fhf${n}`, 0.5 - 0.6 * e, 0, 0);
            S(`bhp${n}`, 0.28 - 0.45 * e, 0, 0);
            S(`bkn${n}`, -0.35 + 0.65 * e, 0, 0);
          }
          this.visual.position.y = 0.30 - 0.44 * e;
        } else {
          // gore: the skull whips across and up, horns leading
          const k = Math.min(1, this.stateTime / 0.14);
          const e = 1 - Math.pow(1 - k, 3);
          S('spine', 0.05 + 0.10 * e, -0.14 + 0.30 * e, 0);
          S('chest', 0.04 + 0.06 * e, -0.18 + 0.40 * e, 0);
          S('neck', -0.22 + 0.16 * e, -0.30 + 0.66 * e, 0);
          S('head', -0.20 - 0.30 * e, -0.34 + 0.72 * e, -0.28 + 0.56 * e);
          S('jaw', 0.20 + 0.35 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.20 - 0.34 * e, 0, 0); S(`fkn${n}`, -0.35 + 0.2 * e, 0, 0);
            S(`bhp${n}`, -0.22 + 0.12 * e, 0, 0); S(`bkn${n}`, 0.34 - 0.16 * e, 0, 0);
          }
          this.visual.position.y = -0.06 + 0.10 * e;
        }
        this.visual.rotation.z = 0;
        break;
      }
      case 'flinch': {
        const k = Math.exp(-this.stateTime * 6) * (1 - Math.min(1, this.stateTime / 0.35));
        const sh = Math.sin(this.stateTime * 38) * k;
        S('spine', 0.14 * k, sh * 0.22, 0);
        S('chest', 0.10 * k, sh * 0.18, 0);
        S('neck', 0.26 * k, sh * 0.3, 0);
        S('head', -0.30 * k, sh * 0.35, 0.22 * k);
        S('jaw', 0.35 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.22 * k, 0, 0); S(`fkn${n}`, -0.32 * k, 0, 0);
          S(`bhp${n}`, -0.26 * k, 0, 0); S(`bkn${n}`, 0.38 * k, 0, 0);
        }
        this.visual.position.y = -0.05 * k;
        break;
      }
      case 'stagger': {
        // knees buckle, the head hangs, the whole front end drops
        const k = Math.min(1, this.stateTime / 0.25) * Math.max(0, 1 - this.stateTime / 2.4);
        S('spine', 0.20 * k, 0.20 * k, 0.12 * k);
        S('chest', 0.16 * k, 0.14 * k, 0);
        S('neck', 0.70 * k, 0.24 * k, 0);
        S('head', 0.30 * k, 0.20 * k, 0.30 * k);
        S('jaw', 0.55 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.55 * k, 0, 0); S(`fkn${n}`, -1.05 * k, 0, 0); S(`fhf${n}`, 0.6 * k, 0, 0);
          S(`bhp${n}`, -0.45 * k, 0, 0); S(`bkn${n}`, 0.8 * k, 0, 0);
        }
        S('tail1', 0.4 * k, 0, 0);
        this.visual.position.y = -0.42 * k;
        this.visual.rotation.z = 0.10 * k;
        break;
      }
      case 'death': {
        const k = Math.min(1, this.stateTime / 0.8);
        const e = 1 - Math.pow(1 - k, 3);
        this.visual.rotation.z = e * 1.35;
        this.visual.position.y = -0.62 * e;
        S('spine', 0.18 * e, 0, 0);
        S('neck', 0.55 * e, 0.22 * e, 0);
        S('head', 0.20 * e, 0, 0);
        S('jaw', 0.45 * e, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.55 * e, 0, 0); S(`fkn${n}`, -1.2 * e, 0, 0);
          S(`bhp${n}`, -0.6 * e, 0, 0); S(`bkn${n}`, 1.0 * e, 0, 0);
        }
        S('tail1', 0.5 * e, 0, 0); S('tail2', 0.35 * e, 0, 0);
        break;
      }
      default: {
        // idle: slow bellows breathing, the head swinging low as it grazes
        const b = Math.sin(t * 1.1) * 0.035;
        S('spine', b, 0, 0);
        S('chest', b * 0.6, 0, 0);
        S('neck', 0.18 + b * 1.4, Math.sin(t * 0.31) * 0.16, 0);
        S('head', 0.10 - b, Math.sin(t * 0.23) * 0.20, 0);
        S('jaw', 0.10 + Math.max(0, Math.sin(t * 2.3)) * 0.14, 0, 0);
        S('tail1', 0.1, Math.sin(t * 0.9) * 0.28, 0);
        S('tail2', 0.05, Math.sin(t * 0.9 + 0.7) * 0.32, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0, 0, 0); S(`fkn${n}`, -0.08, 0, 0); S(`fhf${n}`, 0.06, 0, 0);
          S(`bhp${n}`, -0.10, 0, 0); S(`bkn${n}`, 0.18, 0, 0); S(`bhf${n}`, -0.10, 0, 0);
        }
        this.visual.position.y = 0;
        this.visual.rotation.z = 0;
        break;
      }
    }
  }
}

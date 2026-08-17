import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.js';
import { Enemy, organicNormal, organicRoughness } from './EnemyBase.js';
import { tube, blob, spike, place, tint, glow } from '../../combat/GeoKit.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

const FUR = 0x1b1920;
const FUR_DARK = 0x0b0a0e;
const TAN = 0x8a6733;
const TAN_DARK = 0x50401f;
const CLAW = 0xd6d0be;
const WHISK = 0x262b34;
const ARC = 0x9fdcff;

/**
 * Coeurl — the panther-daemon that has stalked every Final Fantasy since the
 * first. Low, long and black-and-tan, with a pair of enormous segmented
 * whiskers sweeping back off the muzzle almost as long as its body and lit
 * from within by the charge it is holding. Bony spurs down the spine, a
 * barbed tail. When the whiskers swing *forward*, get out of the line.
 */
export const COEURL = {
  key: 'coeurl',
  questId: 'coeurl',
  faction: 'beast',
  expClass: 'elite',
  stats: {
    name: 'Coeurl', hp: 3800, poise: 80, speed: 7.2, attackRange: 2.6,
    aggroRange: 34, radius: 0.75, height: 1.4, damage: 240, level: 22,
  },
  weakness: 'ice',
  resist: 'lightning',
  resistPct: { lightning: 0, ice: 165, fire: 100, dark: 100, light: 100 },
  weakTo: ['dagger'],
  senses: { sight: 34, fov: 1.8, hearing: 26, nocturnal: false },
  drops: [
    { id: 'coeurl_whiskers', chance: 0.45, count: 1 },
  ],
  timing: { telegraph: 0.40, strike: 0.14, attack: 0.50, recover: 0.62 },
  attacks: [
    // closes the gap in one flat leap
    { id: 'pounce', range: 12, minRange: 3.5, weight: 2, mult: 1.4, poise: 34, hitRadius: 2.2,
      telegraph: 0.50, strike: 0.18, attack: 0.58, recover: 0.70, cooldown: 3.2,
      lunge: 14, tracking: 0.7 },
    // two swipes, faster than anything else in the bestiary
    { id: 'claw', range: 2.6, weight: 3, mult: 0.85, poise: 20, hitRadius: 2.0, arc: 1.5,
      telegraph: 0.28, strike: 0.12, attack: 0.44, recover: 0.50, cooldown: 1.1 },
    // Blaster: the whiskers come forward, blaze, and discharge down the line.
    // The longest telegraph it has, and deliberately the loudest one.
    { id: 'blaster', range: 18, minRange: 6, weight: 2, mult: 1.6, poise: 52, hitRadius: 1.8,
      telegraph: 1.10, strike: 0.24, attack: 0.82, recover: 1.10, cooldown: 6.5,
      ranged: true, element: 'lightning', tracking: 1.2, unblockable: true },
  ],
  buildPrototype,
  make(opts) { return new CoeurlEnemy(opts); },
};

/** The nine samples the whisker chain is lofted through, left side. */
const WHISKER = [
  P(0.085, 0.985, 1.10), P(0.115, 1.055, 0.99), P(0.155, 1.150, 0.845),
  P(0.205, 1.270, 0.645), P(0.255, 1.410, 0.400), P(0.305, 1.540, 0.115),
  P(0.350, 1.650, -0.200), P(0.385, 1.720, -0.525), P(0.415, 1.765, -0.855),
];

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('hips', 'root', [0, 0.86, -0.55]);
  rig.bone('spine', 'hips', [0, 0.91, -0.10]);
  rig.bone('chest', 'spine', [0, 0.94, 0.38]);
  rig.bone('neck', 'chest', [0, 0.94, 0.68]);
  rig.bone('head', 'neck', [0, 0.95, 0.92]);
  rig.bone('jaw', 'head', [0, 0.88, 0.99]);
  rig.bone('tail1', 'hips', [0, 0.84, -0.78]);
  rig.bone('tail2', 'tail1', [0, 0.80, -1.14]);
  rig.bone('tail3', 'tail2', [0, 0.74, -1.50]);
  rig.bone('tail4', 'tail3', [0, 0.66, -1.84]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`fsh${n}`, 'chest', [0.20 * s, 0.82, 0.34]);
    rig.bone(`fkn${n}`, `fsh${n}`, [0.22 * s, 0.44, 0.30]);
    rig.bone(`fpw${n}`, `fkn${n}`, [0.23 * s, 0.07, 0.37]);
    rig.bone(`bhp${n}`, 'hips', [0.22 * s, 0.84, -0.55]);
    rig.bone(`bkn${n}`, `bhp${n}`, [0.24 * s, 0.46, -0.68]);
    rig.bone(`bpw${n}`, `bkn${n}`, [0.25 * s, 0.07, -0.50]);
    // three bones per whisker, so the whole length can lash and curl forward
    rig.bone(`wk1${n}`, 'head', [WHISKER[2].x * s, WHISKER[2].y, WHISKER[2].z]);
    rig.bone(`wk2${n}`, `wk1${n}`, [WHISKER[4].x * s, WHISKER[4].y, WHISKER[4].z]);
    rig.bone(`wk3${n}`, `wk2${n}`, [WHISKER[6].x * s, WHISKER[6].y, WHISKER[6].z]);
  }

  /* ---- long low torso ---- */
  const torso = tube([
    P(0, 0.85, -0.74), P(0, 0.89, -0.42), P(0, 0.91, -0.04),
    P(0, 0.94, 0.32), P(0, 0.93, 0.56), P(0, 0.92, 0.72),
  ], [0.145, 0.215, 0.205, 0.235, 0.205, 0.155], { radialSeg: 10, flat: 0.80 });
  rig.attachBlend(tint(torso, FUR, 0.05), 'spine', 'chest', 1.6);

  const belly = tube([P(0, 0.72, -0.46), P(0, 0.70, 0.04), P(0, 0.74, 0.44)],
    [0.13, 0.155, 0.135], { radialSeg: 8, flat: 0.62 });
  rig.attach(tint(belly, TAN_DARK, 0.05), 'spine');

  // tan flank flashes — the only warm colour on the body
  for (const s of [-1, 1]) {
    const f = tube([P(0.17 * s, 0.80, -0.30), P(0.20 * s, 0.80, 0.10), P(0.18 * s, 0.82, 0.42)],
      [[0.05, 0.10], [0.055, 0.115], [0.045, 0.09]], { radialSeg: 6 });
    rig.attach(tint(f, TAN, 0.06), 'spine');
  }

  // shoulder and haunch masses
  for (const s of [-1, 1]) {
    const sh = place(blob(0.115, 0.125, 0.185, 8, 6), { pos: [0.155 * s, 0.90, 0.30] });
    rig.attach(tint(sh, FUR, 0.05), 'chest');
    const hq = place(blob(0.135, 0.155, 0.185, 8, 6), { pos: [0.145 * s, 0.86, -0.50] });
    rig.attach(tint(hq, FUR, 0.05), 'hips');
  }

  /* ---- bony spurs down the spine ---- */
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const z = -0.66 + t * 1.20;
    const h = 0.055 + Math.sin(t * Math.PI) * 0.085;
    const sp = place(spike(0.022, h, 5),
      { pos: [0, 1.03 + Math.sin(t * Math.PI) * 0.03, z], rot: [-0.45 - t * 0.30, 0, 0] });
    rig.attach(tint(sp, CLAW, 0.05), t < 0.35 ? 'hips' : t < 0.78 ? 'spine' : 'chest');
  }

  /* ---- neck & wedge head ---- */
  const neck = tube([P(0, 0.93, 0.60), P(0, 0.94, 0.76), P(0, 0.95, 0.88)],
    [0.155, 0.145, 0.130], { radialSeg: 9, flat: 0.92 });
  rig.attachBlend(tint(neck, FUR, 0.05), 'chest', 'head', 1.0);

  const skull = place(blob(0.135, 0.120, 0.155, 10, 7), { pos: [0, 0.955, 0.98] });
  rig.attach(tint(skull, FUR, 0.04), 'head');
  const muzzle = tube([P(0, 0.925, 1.05), P(0, 0.905, 1.15), P(0, 0.900, 1.21)],
    [[0.085, 0.070], [0.072, 0.058], [0.055, 0.042]], { radialSeg: 8 });
  rig.attach(tint(muzzle, TAN_DARK, 0.05), 'head');
  const nose = place(blob(0.035, 0.026, 0.024, 6, 5), { pos: [0, 0.905, 1.235] });
  rig.attach(tint(nose, 0x0a0508), 'head');
  const jaw = tube([P(0, 0.875, 1.03), P(0, 0.870, 1.17)], [0.062, 0.045], { radialSeg: 7 });
  rig.attach(tint(jaw, FUR_DARK), 'jaw');
  for (const s of [-1, 1]) {
    const f = place(spike(0.014, 0.075, 4), { pos: [0.045 * s, 0.895, 1.17], rot: [Math.PI - 0.12, 0, 0] });
    rig.attach(tint(f, CLAW), 'head');
    const e = place(spike(0.045, 0.085, 5), { pos: [0.085 * s, 1.035, 0.93], rot: [-0.4, 0, 0.6 * s] });
    rig.attach(tint(e, FUR_DARK), 'head');
  }
  // eyes: two chips of the same charge that runs the whiskers
  for (const s of [-1, 1]) {
    const e = place(blob(0.030, 0.024, 0.019, 7, 5), { pos: [0.078 * s, 0.985, 1.075] });
    rig.attach(glow(tint(e, 0x04101a), ARC, 3.0), 'head');
  }

  /* ---- the whiskers: eight lit segments per side, the whole silhouette ---- */
  const WBONE = ['head', 'head', 'wk1', 'wk1', 'wk2', 'wk2', 'wk3', 'wk3'];
  const WNEXT = ['wk1', 'wk1', 'wk2', 'wk2', 'wk3', 'wk3', 'wk3', 'wk3'];
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    for (let i = 0; i < 8; i++) {
      const a = WHISKER[i], b = WHISKER[i + 1];
      const t = i / 7;
      const r = 0.046 * (1 - t * 0.62);
      // pull each segment in slightly at both ends so the joints read as joints
      const p0 = new THREE.Vector3().lerpVectors(a, b, 0.06);
      const p1 = new THREE.Vector3().lerpVectors(a, b, 0.5);
      const p2 = new THREE.Vector3().lerpVectors(a, b, 0.94);
      const seg = tube([
        P(p0.x * s, p0.y, p0.z), P(p1.x * s, p1.y, p1.z), P(p2.x * s, p2.y, p2.z),
      ], [r * 0.66, r * 1.15, r * 0.66], { radialSeg: 5 });
      tint(seg, WHISK, 0.05);
      if (i >= 6) glow(seg, ARC, i === 7 ? 2.6 : 1.1);
      const bn = WBONE[i] === 'head' ? 'head' : `${WBONE[i]}${n}`;
      const bx = WNEXT[i] === 'head' ? 'head' : `${WNEXT[i]}${n}`;
      if (bn === bx) rig.attach(seg, bn);
      else rig.attachBlend(seg, bn, bx, 1.2);
    }
    // charge beads sitting in the joints, brighter toward the tip
    for (let i = 1; i < 8; i++) {
      const a = WHISKER[i];
      const t = i / 7;
      const bead = place(blob(0.030 * (1 - t * 0.4), 0.026 * (1 - t * 0.4), 0.026 * (1 - t * 0.4), 6, 4),
        { pos: [a.x * s, a.y, a.z] });
      tint(bead, 0x0a1620);
      glow(bead, ARC, 0.5 + t * 2.6);
      const bn = i < 2 ? 'head' : i < 4 ? `wk1${n}` : i < 6 ? `wk2${n}` : `wk3${n}`;
      rig.attach(bead, bn);
    }
  }

  /* ---- legs: long, lean, built for one enormous leap ---- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const fu = tube([P(0.20 * s, 0.84, 0.34), P(0.215 * s, 0.62, 0.32), P(0.22 * s, 0.45, 0.30)],
      [0.098, 0.078, 0.058], { radialSeg: 7 });
    rig.attachBlend(tint(fu, FUR, 0.04), `fsh${n}`, `fkn${n}`, 0.9);
    const fl = tube([P(0.22 * s, 0.45, 0.30), P(0.225 * s, 0.24, 0.34), P(0.23 * s, 0.09, 0.37)],
      [0.052, 0.038, 0.034], { radialSeg: 7 });
    rig.attachBlend(tint(fl, FUR_DARK, 0.04), `fkn${n}`, `fpw${n}`, 0.9);
    const fp = place(blob(0.055, 0.040, 0.078, 7, 5), { pos: [0.23 * s, 0.055, 0.41] });
    rig.attach(tint(fp, FUR_DARK), `fpw${n}`);
    for (let c = -1; c <= 1; c++) {
      const cl = place(spike(0.012, 0.058, 4), { pos: [(0.23 + c * 0.032) * s, 0.03, 0.47], rot: [1.2, 0, 0] });
      rig.attach(tint(cl, CLAW), `fpw${n}`);
    }

    const bu = tube([P(0.22 * s, 0.86, -0.54), P(0.235 * s, 0.64, -0.64), P(0.24 * s, 0.47, -0.68)],
      [0.118, 0.095, 0.062], { radialSeg: 7 });
    rig.attachBlend(tint(bu, FUR, 0.04), `bhp${n}`, `bkn${n}`, 0.9);
    const bl = tube([P(0.24 * s, 0.47, -0.68), P(0.245 * s, 0.26, -0.58), P(0.25 * s, 0.09, -0.51)],
      [0.056, 0.040, 0.034], { radialSeg: 7 });
    rig.attachBlend(tint(bl, FUR_DARK, 0.04), `bkn${n}`, `bpw${n}`, 0.9);
    const bp = place(blob(0.053, 0.040, 0.076, 7, 5), { pos: [0.25 * s, 0.055, -0.46] });
    rig.attach(tint(bp, FUR_DARK), `bpw${n}`);
    for (let c = -1; c <= 1; c++) {
      const cl = place(spike(0.011, 0.052, 4), { pos: [(0.25 + c * 0.030) * s, 0.03, -0.40], rot: [1.2, 0, 0] });
      rig.attach(tint(cl, CLAW), `bpw${n}`);
    }
  }

  /* ---- long lashing tail with a barbed tip ---- */
  const t1 = tube([P(0, 0.84, -0.76), P(0, 0.82, -1.10)], [0.062, 0.050], { radialSeg: 6 });
  rig.attachBlend(tint(t1, FUR, 0.04), 'tail1', 'tail2', 1.0);
  const t2 = tube([P(0, 0.81, -1.12), P(0, 0.76, -1.46)], [0.048, 0.038], { radialSeg: 6 });
  rig.attachBlend(tint(t2, FUR, 0.04), 'tail2', 'tail3', 1.0);
  const t3 = tube([P(0, 0.75, -1.48), P(0, 0.68, -1.80)], [0.036, 0.026], { radialSeg: 6 });
  rig.attachBlend(tint(t3, FUR_DARK, 0.04), 'tail3', 'tail4', 1.0);
  const barb = place(spike(0.045, 0.20, 6), { pos: [0, 0.66, -1.84], rot: [1.35, 0, 0] });
  rig.attach(tint(barb, CLAW, 0.04), 'tail4');
  for (const s of [-1, 1]) {
    const hook = place(spike(0.020, 0.085, 4), { pos: [0.035 * s, 0.665, -1.92], rot: [1.9, 0, 0.5 * s] });
    rig.attach(tint(hook, CLAW), 'tail4');
  }

  const mat = creatureMaterial({
    roughness: 0.74, metalness: 0.02,
    normalMap: organicNormal(), normalScale: 0.6, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 2.6 });
}

class CoeurlEnemy extends Enemy {
  constructor(opts) { super(COEURL, opts); }

  pose(state, t) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n, x, y, z) => poseBone(rig, n, x, y, z);

    /**
     * Drive both whiskers. `curl` is the total forward rotation off the
     * swept-back rest pose (0 = laid back, ~2.5 = aimed straight ahead),
     * `flare` splays them apart, `wave` runs a travelling ripple down them.
     */
    const whiskers = (curl, flare, wave, freq = 1) => {
      for (const s of [-1, 1]) {
        const n = s < 0 ? 'L' : 'R';
        S(`wk1${n}`, curl * 0.40, (flare + Math.sin(t * freq) * wave) * s, 0);
        S(`wk2${n}`, curl * 0.34, (flare * 0.8 + Math.sin(t * freq - 0.7) * wave * 1.4) * s, 0);
        S(`wk3${n}`, curl * 0.26, (flare * 0.6 + Math.sin(t * freq - 1.4) * wave * 2.0) * s, 0);
      }
    };
    const tail = (base, amp, freq, phase) => {
      S('tail1', base, Math.sin(t * freq) * amp, 0);
      S('tail2', base * 0.7, Math.sin(t * freq + phase) * amp * 1.3, 0);
      S('tail3', base * 0.5, Math.sin(t * freq + phase * 2) * amp * 1.7, 0);
      S('tail4', base * 0.3, Math.sin(t * freq + phase * 3) * amp * 2.2, 0);
    };

    switch (state) {
      case 'run':
      case 'approach': {
        // a bounding prowl — long spine flex, whiskers streaming behind
        const ph = t * 12.5;
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          const o = s < 0 ? 0 : Math.PI;
          const a = Math.sin(ph + o), b = Math.max(0, Math.sin(ph + o + 1.6));
          S(`fsh${n}`, a * 0.95, 0, 0);
          S(`fkn${n}`, -0.35 - b * 0.95, 0, 0);
          S(`fpw${n}`, 0.28 - a * 0.32, 0, 0);
          S(`bhp${n}`, -Math.sin(ph + o + 0.9) * 0.90, 0, 0);
          S(`bkn${n}`, 0.52 + Math.max(0, Math.sin(ph + o + 2.5)) * 0.95, 0, 0);
          S(`bpw${n}`, -0.30 + Math.sin(ph + o + 0.9) * 0.32, 0, 0);
        }
        S('spine', Math.sin(ph * 2) * 0.09, 0, 0);
        S('chest', -0.07 + Math.sin(ph * 2 + 1.0) * 0.07, 0, 0);
        S('neck', -0.12, 0, 0);
        S('head', 0.10 + Math.sin(ph) * 0.05, 0, 0);
        whiskers(-0.20, 0.10, 0.10, 7.5);
        tail(-0.28, 0.30, 3.2, 0.7);
        this.visual.position.y = Math.abs(Math.sin(ph)) * 0.075;
        break;
      }
      case 'telegraph': {
        const id = this.attackId;
        if (id === 'blaster') {
          // THE tell: the whiskers rotate forward over the skull and lock
          // onto the target, blazing, while the body braces back on its hocks.
          const k = Math.min(1, this.stateTime / 0.55);
          const e = k * k * (3 - 2 * k);
          const buzz = Math.sin(this.stateTime * 46) * 0.05 * e;
          whiskers(2.45 * e, 0.40 * e + buzz, 0.05 * e, 34);
          S('spine', 0.14 * e, 0, 0);
          S('chest', 0.10 * e, 0, 0);
          S('neck', 0.34 * e, 0, 0);
          S('head', -0.34 * e + buzz * 0.4, 0, 0);
          S('jaw', 0.42 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.42 * e, 0, 0.16 * s * e); S(`fkn${n}`, -0.72 * e, 0, 0);
            S(`fpw${n}`, 0.40 * e, 0, 0);
            S(`bhp${n}`, -0.85 * e, 0, 0); S(`bkn${n}`, 1.25 * e, 0, 0);
            S(`bpw${n}`, -0.55 * e, 0, 0);
          }
          tail(0.75 * e, 0.10, 9, 0.5);
          this.visual.position.y = -0.16 * e;
        } else if (id === 'pounce') {
          // coil: haunches under, chest to the ground, whiskers laid flat back
          const k = Math.min(1, this.stateTime / 0.3);
          const tremble = Math.sin(t * 42) * 0.02 * k;
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.38 * k, 0, 0); S(`fkn${n}`, -0.90 * k, 0, 0); S(`fpw${n}`, 0.52 * k, 0, 0);
            S(`bhp${n}`, -0.95 * k, 0, 0); S(`bkn${n}`, 1.45 * k, 0, 0); S(`bpw${n}`, -0.62 * k, 0, 0);
          }
          S('spine', 0.14 * k + tremble, 0, 0);
          S('chest', 0.12 * k, 0, 0);
          S('neck', 0.26 * k, 0, 0);
          S('head', -0.24 * k, 0, 0);
          S('jaw', 0.30 * k, 0, 0);
          whiskers(-0.55 * k, -0.16 * k, 0.04, 5);
          tail(0.55 * k, 0.34, 6.5, 0.6);
          this.visual.position.y = -0.20 * k;
        } else {
          // claw: rocks back onto the haunches, near paw cocked across
          const k = Math.min(1, this.stateTime / 0.22);
          S('spine', -0.08 * k, 0.12 * k, 0);
          S('chest', -0.14 * k, 0.16 * k, 0);
          S('neck', -0.10 * k, 0.10 * k, 0);
          S('head', 0.14 * k, 0.14 * k, 0);
          S('jaw', 0.45 * k, 0, 0);
          S('fshR', -1.35 * k, -0.45 * k, 0);
          S('fknR', -0.70 * k, 0, 0);
          S('fpwR', -0.35 * k, 0, 0);
          S('fshL', 0.20 * k, 0, 0); S('fknL', -0.45 * k, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`bhp${n}`, -0.55 * k, 0, 0); S(`bkn${n}`, 0.85 * k, 0, 0);
          }
          whiskers(-0.30 * k, 0.22 * k, 0.08, 12);
          tail(0.30 * k, 0.40, 8, 0.6);
          this.visual.position.y = -0.08 * k;
        }
        break;
      }
      case 'attack': {
        const id = this.attackId;
        if (id === 'blaster') {
          // the discharge: whiskers snap dead straight, head thrusts through,
          // the whole body recoils backward off the shot
          const k = Math.min(1, this.stateTime / 0.16);
          const e = 1 - Math.pow(1 - k, 3);
          const kick = Math.exp(-this.stateTime * 6) * Math.sin(this.stateTime * 34) * 0.06;
          whiskers(2.45 + 0.35 * e, 0.40 - 0.34 * e + kick, 0.02, 40);
          S('spine', 0.14 - 0.30 * e, 0, 0);
          S('chest', 0.10 - 0.26 * e, 0, 0);
          S('neck', 0.34 - 0.60 * e, 0, 0);
          S('head', -0.34 + 0.52 * e + kick, 0, 0);
          S('jaw', 0.42 + 0.45 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.42 - 0.55 * e, 0, 0.16 * s); S(`fkn${n}`, -0.72 + 0.30 * e, 0, 0);
            S(`bhp${n}`, -0.85 + 0.30 * e, 0, 0); S(`bkn${n}`, 1.25 - 0.45 * e, 0, 0);
          }
          tail(0.75, 0.06, 12, 0.5);
          this.visual.position.y = -0.16 + 0.10 * e;
        } else if (id === 'pounce') {
          // airborne: spine extended, forelegs reaching, whiskers trailing
          const k = Math.min(1, this.stateTime / 0.14);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, -1.25 * k, 0.12 * s, 0); S(`fkn${n}`, -0.28 * k, 0, 0); S(`fpw${n}`, -0.50 * k, 0, 0);
            S(`bhp${n}`, 1.05 * k, 0, 0); S(`bkn${n}`, -0.95 * k, 0, 0); S(`bpw${n}`, 0.55 * k, 0, 0);
          }
          S('spine', -0.26 * k, 0, 0);
          S('chest', -0.18 * k, 0, 0);
          S('neck', -0.32 * k, 0, 0);
          S('head', 0.36 * k, 0, 0);
          S('jaw', 0.85 * k, 0, 0);
          whiskers(-0.85 * k, -0.05, 0.03, 9);
          tail(-0.70 * k, 0.12, 5, 0.6);
          this.visual.position.y = 0;
        } else {
          // claw: two swipes, right then left, off one wind-up
          const p = this.stateTime;
          const s1 = THREE.MathUtils.clamp(p / 0.13, 0, 1);
          const s2 = THREE.MathUtils.clamp((p - 0.20) / 0.15, 0, 1);
          const e1 = 1 - Math.pow(1 - s1, 3);
          const e2 = 1 - Math.pow(1 - s2, 3);
          S('spine', -0.08 + 0.16 * e1 - 0.14 * e2, 0.12 - 0.30 * e1 + 0.24 * e2, 0);
          S('chest', -0.14 + 0.22 * e1 - 0.20 * e2, 0.16 - 0.38 * e1 + 0.30 * e2, 0);
          S('neck', -0.10 + 0.14 * e1, 0.10 - 0.24 * e1 + 0.18 * e2, 0);
          S('head', 0.14 - 0.10 * e1, 0.14 - 0.30 * e1 + 0.24 * e2, 0);
          S('jaw', 0.45 + 0.30 * e1, 0, 0);
          S('fshR', -1.35 + 1.95 * e1, -0.45 + 0.95 * e1, 0);
          S('fknR', -0.70 + 0.75 * e1, 0, 0);
          S('fpwR', -0.35 + 0.60 * e1, 0, 0);
          S('fshL', 0.20 - 1.60 * e2, 0.55 * e2, 0);
          S('fknL', -0.45 - 0.30 * e2, 0, 0);
          S('fpwL', -0.30 * e2, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`bhp${n}`, -0.55 + 0.25 * e1, 0, 0); S(`bkn${n}`, 0.85 - 0.35 * e1, 0, 0);
          }
          whiskers(-0.30 + 0.55 * e1 - 0.40 * e2, 0.30, 0.10, 16);
          tail(0.30, 0.45, 10, 0.6);
          this.visual.position.y = -0.08 + 0.06 * e1;
        }
        break;
      }
      case 'flinch': {
        const k = Math.exp(-this.stateTime * 7) * (1 - Math.min(1, this.stateTime / 0.35));
        const sh = Math.sin(this.stateTime * 48) * k;
        S('spine', 0.26 * k, sh * 0.42, 0);
        S('chest', 0.18 * k, sh * 0.32, 0);
        S('neck', 0.40 * k, sh * 0.5, 0);
        S('head', -0.48 * k, sh * 0.6, 0.30 * k);
        S('jaw', 0.55 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.30 * k, 0, 0); S(`fkn${n}`, -0.55 * k, 0, 0);
          S(`bhp${n}`, -0.35 * k, 0, 0); S(`bkn${n}`, 0.65 * k, 0, 0);
        }
        whiskers(-0.7 * k, 0.35 * k, 0.25 * k, 26);
        tail(0.2 * k, 0.5 * k, 14, 0.6);
        break;
      }
      case 'stagger': {
        // the charge drops out of it: whiskers go limp and drag on the ground
        const k = Math.min(1, this.stateTime / 0.2) * Math.max(0, 1 - this.stateTime / 2.2);
        S('spine', 0.34 * k, 0.30 * k, 0.22 * k);
        S('chest', 0.22 * k, 0.20 * k, 0);
        S('neck', 0.58 * k, 0.36 * k, 0);
        S('head', -0.62 * k, 0.32 * k, 0.42 * k);
        S('jaw', 0.65 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.55 * k, 0, 0.20 * s * k); S(`fkn${n}`, -1.05 * k, 0, 0);
          S(`bhp${n}`, -0.75 * k, 0, 0); S(`bkn${n}`, 1.15 * k, 0, 0);
        }
        whiskers(-1.15 * k, 0.55 * k, 0.06, 2.2);
        tail(0.15 * k, 0.16 * k, 2.4, 0.6);
        this.visual.position.y = -0.24 * k;
        break;
      }
      case 'death': {
        const k = Math.min(1, this.stateTime / 0.55);
        const e = 1 - Math.pow(1 - k, 3);
        this.visual.rotation.z = e * 1.5;
        this.visual.position.y = -0.34 * e;
        S('spine', 0.28 * e, 0, 0);
        S('chest', 0.16 * e, 0, 0);
        S('neck', 0.50 * e, 0.30 * e, 0);
        S('head', -0.42 * e, 0, 0);
        S('jaw', 0.55 * e, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.62 * e, 0, 0); S(`fkn${n}`, -1.25 * e, 0, 0);
          S(`bhp${n}`, -0.82 * e, 0, 0); S(`bkn${n}`, 1.35 * e, 0, 0);
        }
        whiskers(-1.5 * e, 0.70 * e, 0.02, 1.5);
        tail(0.1 * e, 0.05, 1.2, 0.6);
        break;
      }
      default: {
        // idle: shoulders rolling, whiskers drifting like kelp in a current
        const b = Math.sin(t * 1.5) * 0.03;
        S('spine', b, 0, 0);
        S('chest', b * 0.6, 0, 0);
        S('neck', -0.06 + b, Math.sin(t * 0.45) * 0.14, 0);
        S('head', 0.06, Math.sin(t * 0.33) * 0.20, 0);
        S('jaw', Math.max(0, Math.sin(t * 0.7)) * 0.12, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0, 0, 0); S(`fkn${n}`, -0.14, 0, 0); S(`fpw${n}`, 0.10, 0, 0);
          S(`bhp${n}`, -0.18, 0, 0); S(`bkn${n}`, 0.34, 0, 0); S(`bpw${n}`, -0.18, 0, 0);
        }
        whiskers(0.10 + Math.sin(t * 0.8) * 0.10, 0.06, 0.13, 1.2);
        tail(-0.10, 0.32, 1.3, 0.65);
        this.visual.position.y = 0;
        this.visual.rotation.z = 0;
        break;
      }
    }
  }
}

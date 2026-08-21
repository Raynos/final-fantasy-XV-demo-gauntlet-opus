import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.ts';
import { Enemy, organicNormal, organicRoughness } from './EnemyBase.ts';
import { tube, blob, spike, slab, place, tint, glow, loft, bladeCross } from '../../combat/GeoKit.ts';

const P = (x: any, y: any, z: any) => new THREE.Vector3(x, y, z);

const HIDE = 0x2c2a36;
const HIDE_DARK = 0x161520;
const BONE = 0x968d7b;
const BONE_DARK = 0x5c5548;
const FLAME = 0x7ec8ff;
const FLAME_HOT = 0xd8eeff;
const MIASMA = 0x2e2550;
const HOOF = 0x1d1c26;

/**
 * Mesmenir — the spectral daemon horse that runs the Duscae roads after dark.
 * A gaunt black stallion stripped down to skeletal muscle, rib arcs showing
 * through the barrel, an eyeless skull for a head with a long cracked jaw,
 * and mane, tail and fetlocks burning as ragged streamers of cold blue-white
 * fire. Every one of those flames is geometry, bound to bone chains so it
 * whips with the gallop; the hooves drag miasma behind them.
 */
export const MESMENIR = {
  key: 'mesmenir',
  questId: 'mesmenir',
  faction: 'daemon',
  expClass: 'daemon',
  stats: {
    name: 'Mesmenir', hp: 5200, poise: 100, speed: 8.5, attackRange: 4.0,
    aggroRange: 40, radius: 0.7, height: 2.4, damage: 280, level: 26,
  },
  weakness: 'light',
  resist: 'dark',
  resistPct: { light: 190, fire: 60, ice: 120, dark: 0, lightning: 100 },
  weakTo: ['greatsword'],
  senses: { sight: 36, fov: 2.2, hearing: 22, nocturnal: true },
  drops: [
    { id: 'mesmenir_mane', chance: 0.5, count: 1 },
  ],
  timing: { telegraph: 0.85, strike: 0.28, attack: 0.90, recover: 1.15 },
  attacks: [
    // runs straight through whatever is in front of it and keeps going
    { id: 'trample', range: 24, minRange: 8, weight: 2, mult: 1.7, poise: 68, hitRadius: 2.4,
      telegraph: 0.90, strike: 0.30, attack: 1.00, recover: 1.20, cooldown: 5.5,
      lunge: 18, tracking: 0.4, unblockable: true },
    // rises on the hind legs and brings both forehooves down together
    { id: 'rear', range: 4.0, weight: 2, mult: 1.35, poise: 56, hitRadius: 3.0, aoe: true,
      telegraph: 0.85, strike: 0.30, attack: 0.92, recover: 1.15, cooldown: 4.0 },
    // the answer to standing behind it: a double kick off both hind legs
    { id: 'buck', range: 3.6, weight: 2, mult: 1.25, poise: 46, hitRadius: 2.6, arc: 1.2,
      telegraph: 0.55, strike: 0.20, attack: 0.62, recover: 0.85, cooldown: 3.0 },
  ],
  buildPrototype,
  make(opts: any) { return new MesmenirEnemy(opts); },
};

/**
 * One flame streamer: a flat swept tapered blade built hanging along -Y so
 * `place` can aim it. No particles anywhere on this creature.
 */
function flame(len: any, w: any, sweep: any, seg = 4) {
  const secs = [];
  for (let i = 0; i < seg; i++) {
    const t = i / (seg - 1);
    const taper = Math.sin((1 - t) * Math.PI * 0.55);
    secs.push({
      y: -t * len,
      sx: w * (0.06 + taper * 0.94),
      sz: w * 0.20 * (0.25 + taper * 0.75),
      dz: sweep * t * t * len,
      rot: t * 0.55,
    });
  }
  return loft(bladeCross(8), secs, { capStart: false, capEnd: false });
}

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('hips', 'root', [0, 1.72, -0.72]);
  rig.bone('spine', 'hips', [0, 1.80, -0.22]);
  rig.bone('chest', 'spine', [0, 1.84, 0.34]);
  rig.bone('neck1', 'chest', [0, 1.95, 0.66]);
  rig.bone('neck2', 'neck1', [0, 2.18, 0.92]);
  rig.bone('head', 'neck2', [0, 2.32, 1.14]);
  rig.bone('jaw', 'head', [0, 2.20, 1.22]);
  // the mane is its own chain trailing back over the withers
  rig.bone('mn1', 'neck1', [0, 2.14, 0.50]);
  rig.bone('mn2', 'mn1', [0, 2.26, 0.10]);
  rig.bone('mn3', 'mn2', [0, 2.32, -0.32]);
  rig.bone('tail1', 'hips', [0, 1.76, -0.96]);
  rig.bone('tail2', 'tail1', [0, 1.66, -1.34]);
  rig.bone('tail3', 'tail2', [0, 1.50, -1.72]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`fsh${n}`, 'chest', [0.26 * s, 1.70, 0.30]);
    rig.bone(`fkn${n}`, `fsh${n}`, [0.28 * s, 1.14, 0.26]);
    rig.bone(`ffl${n}`, `fkn${n}`, [0.29 * s, 0.52, 0.30]);
    rig.bone(`fho${n}`, `ffl${n}`, [0.29 * s, 0.13, 0.32]);
    rig.bone(`bhp${n}`, 'hips', [0.28 * s, 1.72, -0.70]);
    rig.bone(`bst${n}`, `bhp${n}`, [0.30 * s, 1.16, -0.86]);
    rig.bone(`bhk${n}`, `bst${n}`, [0.30 * s, 0.62, -0.58]);
    rig.bone(`bho${n}`, `bhk${n}`, [0.30 * s, 0.13, -0.64]);
  }

  /* ---- barrel: deep and narrow, and far too thin over the ribs ---- */
  const barrel = tube([
    P(0, 1.76, -0.98), P(0, 1.80, -0.62), P(0, 1.82, -0.14),
    P(0, 1.84, 0.28), P(0, 1.88, 0.58),
  ], [[0.24, 0.30], [0.30, 0.40], [0.29, 0.42], [0.30, 0.40], [0.24, 0.31]],
  { radialSeg: 9 });
  rig.attachBlend(tint(barrel, HIDE, 0.05), 'spine', 'chest', 1.7);

  const croup = place(blob(0.27, 0.28, 0.32, 9, 6), { pos: [0, 1.74, -0.74] });
  rig.attach(tint(croup, HIDE, 0.05), 'hips');
  const withers = place(blob(0.24, 0.26, 0.30, 9, 6), { pos: [0, 1.92, 0.36] });
  rig.attach(tint(withers, HIDE, 0.05), 'chest');
  // spine ridge — the vertebrae stand proud of the hide
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const v = place(slab(0.055, 0.09 + Math.sin(t * Math.PI) * 0.05, 0.10, 0.015),
      { pos: [0, 2.10 + Math.sin(t * Math.PI) * 0.04, 0.44 - t * 1.20] });
    rig.attach(tint(v, BONE_DARK, 0.05), t < 0.35 ? 'chest' : t < 0.75 ? 'spine' : 'hips');
  }

  /* ---- exposed rib arcs down both sides of the barrel ---- */
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const z = 0.30 - t * 0.72;
      const rib = tube([
        P(0.05 * s, 2.02, z), P(0.24 * s, 1.92, z + 0.02), P(0.32 * s, 1.72, z + 0.03),
        P(0.28 * s, 1.54, z + 0.02), P(0.14 * s, 1.46, z),
      ], [0.030, 0.042, 0.044, 0.036, 0.024], { radialSeg: 5 });
      rig.attach(tint(rib, BONE, 0.06), z > 0.0 ? 'chest' : 'spine');
    }
  }
  const sternum = tube([P(0, 1.52, 0.42), P(0, 1.48, 0.10), P(0, 1.52, -0.20)],
    [0.06, 0.07, 0.05], { radialSeg: 6 });
  rig.attach(tint(sternum, BONE_DARK, 0.05), 'spine');

  /* ---- neck: a gaunt crested arch ---- */
  const neck = tube([
    P(0, 1.90, 0.52), P(0, 2.02, 0.72), P(0, 2.18, 0.90), P(0, 2.28, 1.04),
  ], [[0.19, 0.24], [0.16, 0.24], [0.13, 0.21], [0.11, 0.17]], { radialSeg: 8 });
  rig.attachBlend(tint(neck, HIDE, 0.05), 'chest', 'head', 1.6);
  // cervical vertebrae showing along the underside
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const v = place(blob(0.045, 0.038, 0.05, 6, 4),
      { pos: [0, 1.86 + t * 0.30, 0.56 + t * 0.40] });
    rig.attach(tint(v, BONE_DARK, 0.05), t < 0.5 ? 'neck1' : 'neck2');
  }

  /* ---- eyeless skull with a long cracked jaw ---- */
  const cranium = place(blob(0.115, 0.135, 0.155, 9, 7), { pos: [0, 2.32, 1.14] });
  rig.attach(tint(cranium, BONE, 0.05), 'head');
  const face = tube([P(0, 2.30, 1.20), P(0, 2.22, 1.40), P(0, 2.13, 1.58), P(0, 2.09, 1.70)],
    [[0.098, 0.115], [0.082, 0.098], [0.070, 0.082], [0.062, 0.066]], { radialSeg: 8 });
  rig.attachBlend(tint(face, BONE, 0.05), 'head', 'jaw', 0.4);
  const nasal = place(slab(0.05, 0.30, 0.06, 0.012), { pos: [0, 2.22, 1.46], rot: [0.48, 0, 0] });
  rig.attach(tint(nasal, HIDE_DARK), 'head');
  const muzzleEnd = place(blob(0.062, 0.055, 0.045, 7, 5), { pos: [0, 2.08, 1.74] });
  rig.attach(tint(muzzleEnd, HIDE_DARK), 'head');
  // hollow sockets: no eyes, only a little cold light down in the bone
  for (const s of [-1, 1]) {
    const socket = place(blob(0.055, 0.052, 0.040, 7, 5), { pos: [0.088 * s, 2.345, 1.235] });
    rig.attach(glow(tint(socket, 0x04070c), FLAME, 0.55), 'head');
    const cheek = place(slab(0.035, 0.14, 0.13, 0.015), { pos: [0.105 * s, 2.27, 1.28], rot: [0.35, 0, 0] });
    rig.attach(tint(cheek, BONE_DARK, 0.05), 'head');
  }
  // lower jaw, hanging long and split by a crack that never closed
  for (const s of [-1, 1]) {
    const ramus = tube([P(0.055 * s, 2.20, 1.20), P(0.050 * s, 2.10, 1.44), P(0.042 * s, 2.03, 1.66)],
      [0.045, 0.038, 0.030], { radialSeg: 6 });
    rig.attach(tint(ramus, BONE, 0.05), 'jaw');
    for (let i = 0; i < 4; i++) {
      const tooth = place(spike(0.014, 0.055, 4),
        { pos: [0.050 * s, 2.16 - i * 0.035, 1.30 + i * 0.10], rot: [Math.PI - 0.35, 0, 0] });
      rig.attach(tint(tooth, BONE, 0.04), 'jaw');
    }
  }
  const crack = place(slab(0.028, 0.055, 0.34, 0.008), { pos: [0, 2.11, 1.44], rot: [0.32, 0, 0] });
  rig.attach(tint(crack, HIDE_DARK), 'jaw');
  for (const s of [-1, 1]) {
    const ear = place(spike(0.030, 0.16, 5), { pos: [0.075 * s, 2.42, 1.06], rot: [-0.35, 0, 0.30 * s] });
    rig.attach(tint(ear, BONE_DARK), 'head');
  }

  /* ---- legs: bone-thin, long cannon, heavy hoof ---- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const fsc = place(slab(0.10, 0.34, 0.26, 0.03), { pos: [0.24 * s, 1.72, 0.30], rot: [0.18, 0, 0] });
    rig.attach(tint(fsc, HIDE, 0.05), `fsh${n}`);
    const fu = tube([P(0.26 * s, 1.72, 0.30), P(0.27 * s, 1.42, 0.28), P(0.28 * s, 1.16, 0.26)],
      [0.105, 0.085, 0.058], { radialSeg: 7 });
    rig.attachBlend(tint(fu, HIDE, 0.05), `fsh${n}`, `fkn${n}`, 0.9);
    const fknob = place(blob(0.055, 0.055, 0.058, 6, 5), { pos: [0.28 * s, 1.13, 0.26] });
    rig.attach(tint(fknob, BONE_DARK, 0.05), `fkn${n}`);
    const fc = tube([P(0.28 * s, 1.12, 0.26), P(0.285 * s, 0.82, 0.28), P(0.29 * s, 0.55, 0.30)],
      [0.048, 0.040, 0.036], { radialSeg: 6 });
    rig.attachBlend(tint(fc, HIDE, 0.05), `fkn${n}`, `ffl${n}`, 0.9);
    const fp = tube([P(0.29 * s, 0.52, 0.30), P(0.29 * s, 0.30, 0.31), P(0.29 * s, 0.18, 0.32)],
      [0.042, 0.038, 0.040], { radialSeg: 6 });
    rig.attachBlend(tint(fp, HIDE_DARK, 0.05), `ffl${n}`, `fho${n}`, 0.9);
    const fh = tube([P(0.29 * s, 0.16, 0.32), P(0.29 * s, 0.02, 0.33)], [0.062, 0.078], { radialSeg: 7 });
    rig.attach(tint(fh, HOOF, 0.04), `fho${n}`);

    const bsc = place(slab(0.11, 0.40, 0.30, 0.03), { pos: [0.26 * s, 1.66, -0.74], rot: [-0.16, 0, 0] });
    rig.attach(tint(bsc, HIDE, 0.05), `bhp${n}`);
    const bu = tube([P(0.28 * s, 1.72, -0.70), P(0.29 * s, 1.44, -0.80), P(0.30 * s, 1.18, -0.86)],
      [0.125, 0.100, 0.062], { radialSeg: 7 });
    rig.attachBlend(tint(bu, HIDE, 0.05), `bhp${n}`, `bst${n}`, 0.9);
    const bg = tube([P(0.30 * s, 1.16, -0.86), P(0.30 * s, 0.88, -0.74), P(0.30 * s, 0.64, -0.60)],
      [0.068, 0.056, 0.048], { radialSeg: 6 });
    rig.attachBlend(tint(bg, HIDE, 0.05), `bst${n}`, `bhk${n}`, 0.9);
    const bknob = place(blob(0.052, 0.062, 0.055, 6, 5), { pos: [0.30 * s, 0.62, -0.60] });
    rig.attach(tint(bknob, BONE_DARK, 0.05), `bhk${n}`);
    const bp = tube([P(0.30 * s, 0.60, -0.60), P(0.30 * s, 0.34, -0.62), P(0.30 * s, 0.18, -0.63)],
      [0.042, 0.038, 0.040], { radialSeg: 6 });
    rig.attachBlend(tint(bp, HIDE_DARK, 0.05), `bhk${n}`, `bho${n}`, 0.9);
    const bh = tube([P(0.30 * s, 0.16, -0.63), P(0.30 * s, 0.02, -0.64)], [0.060, 0.076], { radialSeg: 7 });
    rig.attach(tint(bh, HOOF, 0.04), `bho${n}`);
  }

  /* ---- cold fire: mane, forelock, tail, fetlocks ---- */
  // mane — ten ragged streamers off the crest, bound down the mane chain
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const z = 0.86 - t * 1.28;
    const y = 2.24 + Math.sin(t * Math.PI) * 0.12;
    const len = 0.46 + Math.sin(t * Math.PI * 0.8) * 0.42;
    const x = (i % 2 ? 1 : -1) * 0.045;
    const g = place(flame(len, 0.105, 0.55), {
      pos: [x, y, z], rot: [1.55 + t * 0.30, 0.22 * (i % 2 ? 1 : -1), 0.10 * (i % 3 - 1)],
    });
    tint(g, 0x0a1a2a);
    glow(g, i % 3 === 0 ? FLAME_HOT : FLAME, 1.5 + Math.sin(t * Math.PI) * 1.3);
    rig.attach(g, t < 0.2 ? 'neck2' : t < 0.45 ? 'mn1' : t < 0.75 ? 'mn2' : 'mn3');
  }
  // forelock, falling forward over the skull
  for (let i = -1; i <= 1; i++) {
    const g = place(flame(0.34, 0.075, 0.35), {
      pos: [i * 0.055, 2.46, 1.10], rot: [-0.55 + i * 0.12, 0.2 * i, 0.15 * i],
    });
    tint(g, 0x0a1a2a);
    glow(g, FLAME_HOT, 2.4);
    rig.attach(g, 'head');
  }
  // tail — nine streamers, longest at the dock
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const seg = t < 0.34 ? 0 : t < 0.7 ? 1 : 2;
    const base = [P(0, 1.78, -1.00), P(0, 1.68, -1.36), P(0, 1.52, -1.72)][seg];
    const g = place(flame(0.62 + (1 - t) * 0.42, 0.11, 0.62), {
      pos: [base.x + (i % 3 - 1) * 0.055, base.y + 0.04, base.z],
      rot: [1.95 + t * 0.35, 0.26 * (i % 3 - 1), 0.12 * (i % 2 ? 1 : -1)],
    });
    tint(g, 0x0a1a2a);
    glow(g, i % 4 === 0 ? FLAME_HOT : FLAME, 1.4 + t * 1.2);
    rig.attach(g, ['tail1', 'tail2', 'tail3'][seg]);
  }
  // fetlock feathering — short flames trailing off each lower leg
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    for (let i = 0; i < 3; i++) {
      const g = place(flame(0.30 + i * 0.05, 0.065, 0.45), {
        pos: [0.29 * s, 0.50 - i * 0.06, 0.28 - i * 0.03], rot: [1.75, 0.2 * s, 0.25 * (i - 1) * s],
      });
      tint(g, 0x0a1a2a);
      glow(g, FLAME, 1.8);
      rig.attach(g, `ffl${n}`);
      const h = place(flame(0.32 + i * 0.05, 0.065, 0.45), {
        pos: [0.30 * s, 0.58 - i * 0.06, -0.62 - i * 0.03], rot: [1.75, 0.2 * s, 0.25 * (i - 1) * s],
      });
      tint(h, 0x0a1a2a);
      glow(h, FLAME, 1.8);
      rig.attach(h, `bhk${n}`);
    }
    // miasma dragging off the hooves — dark, barely lit
    const mf = place(flame(0.26, 0.09, 0.8), { pos: [0.29 * s, 0.10, 0.30], rot: [1.95, 0, 0] });
    tint(mf, MIASMA);
    glow(mf, 0x2a2050, 0.5);
    rig.attach(mf, `fho${n}`);
    const mb = place(flame(0.26, 0.09, 0.8), { pos: [0.30 * s, 0.10, -0.66], rot: [1.95, 0, 0] });
    tint(mb, MIASMA);
    glow(mb, 0x2a2050, 0.5);
    rig.attach(mb, `bho${n}`);
  }

  const mat = creatureMaterial({
    roughness: 0.78, metalness: 0.0,
    rim: { color: 0x7fa8d6, strength: 0.075 },
    normalMap: organicNormal(), normalScale: 0.55, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 3.0, coat: { mottle: 0.12, tick: 0.14, shade: 0.16, dust: 0.26, dustTop: 0.50 } });
}

/**
 * Footfall offsets for a transverse gallop on the left lead, as fractions of
 * a stride turned into radians: off hind, near hind, off fore, near fore,
 * then a moment of suspension. Four separate beats — never a paired trot.
 */
const GALLOP = { bR: 0, bL: 0.63, fR: 2.51, fL: 3.14 };

class MesmenirEnemy extends Enemy {
  override attackId!: any;
  override rig!: any;
  override stateTime!: any;
  override visual!: any;
  constructor(opts: any) { super(MESMENIR, opts); }

  override pose(state: any, t: any) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n: any, x: any, y: any, z: any) => poseBone(rig, n, x, y, z);

    /** Mane and tail fire: a travelling ripple down each chain. */
    const fire = (lift: any, amp: any, freq: any, drag: any) => {
      S('mn1', lift + Math.sin(t * freq) * amp, Math.sin(t * freq * 0.7) * amp * 0.8, 0);
      S('mn2', lift * 0.8 + Math.sin(t * freq - 0.8) * amp * 1.3, Math.sin(t * freq * 0.7 - 0.6) * amp, 0);
      S('mn3', lift * 0.6 + Math.sin(t * freq - 1.6) * amp * 1.7, Math.sin(t * freq * 0.7 - 1.2) * amp * 1.2, 0);
      S('tail1', drag + Math.sin(t * freq * 0.8) * amp, Math.sin(t * freq * 0.55) * amp * 0.7, 0);
      S('tail2', drag * 0.8 + Math.sin(t * freq * 0.8 - 0.7) * amp * 1.4, Math.sin(t * freq * 0.55 - 0.7) * amp, 0);
      S('tail3', drag * 0.6 + Math.sin(t * freq * 0.8 - 1.4) * amp * 1.9, Math.sin(t * freq * 0.55 - 1.4) * amp * 1.4, 0);
    };

    /** A real four-beat gallop: four distinct footfalls, then suspension. */
    const gallop = (ph: any, reach: any) => {
      for (const s of [-1, 1]) {
        const n = s < 0 ? 'L' : 'R';
        const fo = GALLOP[`f${n}`], bo = GALLOP[`b${n}`];
        const fa = Math.sin(ph + fo), ff = Math.max(0, Math.sin(ph + fo + 1.55));
        S(`fsh${n}`, fa * 0.92 * reach - 0.06, 0, 0);
        S(`fkn${n}`, -0.22 - ff * 1.45 * reach, 0, 0);
        S(`ffl${n}`, 0.26 + fa * 0.52 * reach, 0, 0);
        S(`fho${n}`, -0.14 - fa * 0.24 * reach, 0, 0);
        const ba = Math.sin(ph + bo), bf = Math.max(0, Math.sin(ph + bo + 1.55));
        S(`bhp${n}`, -ba * 0.86 * reach, 0, 0);
        S(`bst${n}`, 0.34 + bf * 1.18 * reach, 0, 0);
        S(`bhk${n}`, -0.30 - bf * 0.88 * reach, 0, 0);
        S(`bho${n}`, 0.18 + ba * 0.30 * reach, 0, 0);
      }
    };
    const stand = () => {
      for (const s of [-1, 1]) {
        const n = s < 0 ? 'L' : 'R';
        S(`fsh${n}`, -0.04, 0, 0); S(`fkn${n}`, -0.14, 0, 0);
        S(`ffl${n}`, 0.14, 0, 0); S(`fho${n}`, -0.10, 0, 0);
        S(`bhp${n}`, -0.10, 0, 0); S(`bst${n}`, 0.36, 0, 0);
        S(`bhk${n}`, -0.34, 0, 0); S(`bho${n}`, 0.14, 0, 0);
      }
    };

    switch (state) {
      case 'run':
      case 'approach': {
        const ph = t * 8.2;
        gallop(ph, 1);
        // one bounce and one pitch per stride — the rocking-horse read
        S('spine', Math.sin(ph) * 0.10, 0, 0);
        S('chest', -0.06 + Math.sin(ph + 0.7) * 0.08, 0, 0);
        S('neck1', 0.12 + Math.sin(ph + 1.2) * 0.10, 0, 0);
        S('neck2', -0.10 + Math.sin(ph + 1.6) * 0.08, 0, 0);
        S('head', 0.06 - Math.sin(ph + 1.9) * 0.12, 0, 0);
        S('jaw', 0.16 + Math.max(0, Math.sin(ph)) * 0.10, 0, 0);
        fire(-0.45, 0.16, 9.5, -0.50);
        this.visual.position.y = Math.max(0, Math.sin(ph + 2.2)) * 0.17;
        this.visual.rotation.x = Math.sin(ph + 0.6) * 0.11;
        this.visual.rotation.z = 0;
        break;
      }
      case 'telegraph': {
        const id = this.attackId;
        if (id === 'rear') {
          // up on the hind legs, forehooves cocked above the head
          const k = Math.min(1, this.stateTime / 0.6);
          const e = k * k * (3 - 2 * k);
          stand();
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, -1.70 * e, 0.12 * s * e, 0);
            S(`fkn${n}`, -1.35 * e, 0, 0);
            S(`ffl${n}`, -0.55 * e, 0, 0);
            S(`bhp${n}`, 0.55 * e, 0, 0); S(`bst${n}`, 0.36 - 0.22 * e, 0, 0);
            S(`bhk${n}`, -0.34 - 0.30 * e, 0, 0);
          }
          S('spine', -0.34 * e, 0, 0);
          S('chest', -0.26 * e, 0, 0);
          S('neck1', -0.22 * e, 0, 0);
          S('neck2', 0.30 * e, 0, 0);
          S('head', 0.30 * e, 0, 0);
          S('jaw', 0.70 * e, 0, 0);
          fire(0.55 * e, 0.22, 14, 0.30 * e);
          this.visual.rotation.x = -0.72 * e;
          this.visual.position.y = 0.30 * e;
        } else if (id === 'trample') {
          // gathers back over the hocks, head low and level down the line
          const k = Math.min(1, this.stateTime / 0.5);
          stand();
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`bhp${n}`, -0.62 * k, 0, 0); S(`bst${n}`, 0.36 + 0.55 * k, 0, 0);
            S(`bhk${n}`, -0.34 - 0.45 * k, 0, 0);
            S(`fsh${n}`, 0.22 * k, 0, 0); S(`fkn${n}`, -0.42 * k, 0, 0);
          }
          const paw = Math.max(0, Math.sin(this.stateTime * 8)) * k;
          S('fshR', 0.22 * k - 0.85 * paw, 0, 0);
          S('fknR', -0.42 * k - 0.55 * paw, 0, 0);
          S('spine', 0.14 * k, 0, 0);
          S('chest', 0.16 * k, 0, 0);
          S('neck1', 0.30 * k, 0, 0);
          S('neck2', -0.34 * k, 0, 0);
          S('head', -0.14 * k, 0, 0);
          S('jaw', 0.55 * k, 0, 0);
          fire(-0.30 * k, 0.24, 16, -0.22 * k);
          this.visual.position.y = -0.10 * k;
          this.visual.rotation.x = 0.08 * k;
        } else {
          // buck: head plunges, quarters gather under the barrel
          const k = Math.min(1, this.stateTime / 0.35);
          stand();
          S('spine', 0.22 * k, 0, 0);
          S('chest', 0.20 * k, 0, 0);
          S('neck1', 0.55 * k, 0, 0);
          S('neck2', 0.30 * k, 0, 0);
          S('head', -0.35 * k, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.30 * k, 0, 0); S(`fkn${n}`, -0.55 * k, 0, 0);
            S(`bhp${n}`, -0.85 * k, 0, 0); S(`bst${n}`, 0.36 + 0.95 * k, 0, 0);
            S(`bhk${n}`, -0.34 - 0.85 * k, 0, 0); S(`bho${n}`, 0.14 + 0.30 * k, 0, 0);
          }
          fire(0.20 * k, 0.20, 15, -0.60 * k);
          this.visual.rotation.x = 0.26 * k;
          this.visual.position.y = -0.06 * k;
        }
        break;
      }
      case 'attack': {
        const id = this.attackId;
        if (id === 'rear') {
          // both forehooves come down; the ground takes it
          const k = Math.min(1, this.stateTime / 0.28);
          const e = 1 - Math.pow(1 - k, 4);
          const shock = Math.exp(-Math.max(0, this.stateTime - 0.28) * 10)
            * Math.sin(this.stateTime * 50) * 0.05;
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, -1.70 + 2.00 * e, 0.12 * s * (1 - e), 0);
            S(`fkn${n}`, -1.35 + 1.30 * e, 0, 0);
            S(`ffl${n}`, -0.55 + 0.72 * e, 0, 0);
            S(`bhp${n}`, 0.55 - 0.68 * e, 0, 0); S(`bst${n}`, 0.14 + 0.30 * e, 0, 0);
            S(`bhk${n}`, -0.64 + 0.32 * e, 0, 0);
          }
          S('spine', -0.34 + 0.52 * e + shock, 0, 0);
          S('chest', -0.26 + 0.42 * e, 0, 0);
          S('neck1', -0.22 + 0.48 * e, 0, 0);
          S('neck2', 0.30 - 0.44 * e, 0, 0);
          S('head', 0.30 - 0.62 * e, 0, 0);
          S('jaw', 0.70 - 0.30 * e, 0, 0);
          fire(0.55 - 0.95 * e, 0.20, 12, 0.30 - 0.55 * e);
          this.visual.rotation.x = -0.72 * (1 - e) + shock;
          this.visual.position.y = 0.30 * (1 - e) - 0.05 * e;
        } else if (id === 'trample') {
          // flat-out run-through, neck stretched, everything trailing behind
          const ph = t * 11.5;
          const k = Math.min(1, this.stateTime / 0.2);
          gallop(ph, 1.25);
          S('spine', -0.10 * k + Math.sin(ph) * 0.08, 0, 0);
          S('chest', 0.10 * k, 0, 0);
          S('neck1', 0.42 * k, 0, 0);
          S('neck2', -0.46 * k, 0, 0);
          S('head', -0.12 * k, 0, 0);
          S('jaw', 0.75 * k, 0, 0);
          fire(-0.85 * k, 0.14, 18, -0.80 * k);
          this.visual.position.y = Math.max(0, Math.sin(ph + 2.2)) * 0.20 - 0.05;
          this.visual.rotation.x = 0.10 + Math.sin(ph + 0.6) * 0.09;
        } else {
          // buck: both hind legs snap straight back, body tips over the shoulders
          const k = Math.min(1, this.stateTime / 0.20);
          const e = 1 - Math.pow(1 - k, 3);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.30 - 0.22 * e, 0, 0); S(`fkn${n}`, -0.55 + 0.30 * e, 0, 0);
            S(`ffl${n}`, 0.14 + 0.20 * e, 0, 0);
            S(`bhp${n}`, -0.85 + 2.05 * e, 0, 0);
            S(`bst${n}`, 1.31 - 1.35 * e, 0, 0);
            S(`bhk${n}`, -1.19 + 1.10 * e, 0, 0);
            S(`bho${n}`, 0.44 - 0.55 * e, 0, 0);
          }
          S('spine', 0.22 - 0.42 * e, 0, 0);
          S('chest', 0.20 - 0.30 * e, 0, 0);
          S('neck1', 0.55 - 0.30 * e, 0, 0);
          S('neck2', 0.30 - 0.20 * e, 0, 0);
          S('head', -0.35 + 0.20 * e, 0, 0);
          fire(0.20 + 0.35 * e, 0.18, 16, -0.60 + 0.95 * e);
          this.visual.rotation.x = 0.26 + 0.42 * e;
          this.visual.position.y = -0.06 + 0.16 * e;
        }
        break;
      }
      case 'flinch': {
        const k = Math.exp(-this.stateTime * 8) * (1 - Math.min(1, this.stateTime / 0.35));
        const sh = Math.sin(this.stateTime * 44) * k;
        stand();
        S('spine', 0.18 * k, sh * 0.28, 0);
        S('chest', 0.12 * k, sh * 0.22, 0);
        S('neck1', 0.34 * k, sh * 0.40, 0);
        S('neck2', -0.26 * k, sh * 0.30, 0);
        S('head', -0.30 * k, sh * 0.36, 0.22 * k);
        S('jaw', 0.60 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.26 * k, 0, 0); S(`fkn${n}`, -0.45 * k, 0, 0);
          S(`bhp${n}`, -0.32 * k, 0, 0); S(`bst${n}`, 0.36 + 0.40 * k, 0, 0);
        }
        fire(0.30 * k, 0.34 * k, 26, 0.20 * k);
        this.visual.position.y = 0;
        this.visual.rotation.x = 0;
        break;
      }
      case 'stagger': {
        // legs splayed, head down, the fire guttering low
        const k = Math.min(1, this.stateTime / 0.25) * Math.max(0, 1 - this.stateTime / 2.4);
        const sway = Math.sin(this.stateTime * 3.6) * 0.20 * k;
        S('spine', 0.28 * k, sway, 0.16 * k);
        S('chest', 0.18 * k, sway * 0.7, 0);
        S('neck1', 0.72 * k, sway * 1.2, 0);
        S('neck2', 0.34 * k, sway * 0.8, 0);
        S('head', -0.60 * k, sway * 1.4, 0.26 * k);
        S('jaw', 0.85 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.50 * k, 0, 0.34 * s * k); S(`fkn${n}`, -0.85 * k, 0, 0);
          S(`ffl${n}`, 0.14 + 0.40 * k, 0, 0);
          S(`bhp${n}`, -0.55 * k, 0, 0); S(`bst${n}`, 0.36 + 0.85 * k, 0, 0);
          S(`bhk${n}`, -0.34 - 0.60 * k, 0, 0);
        }
        fire(-0.90 * k, 0.06, 2.0, -0.70 * k);
        this.visual.position.y = -0.32 * k;
        this.visual.rotation.x = 0;
        break;
      }
      case 'death': {
        // it comes apart at the knees and goes over; the fire dies last
        const k = Math.min(1, this.stateTime / 0.7);
        const e = 1 - Math.pow(1 - k, 3);
        this.visual.rotation.z = e * 1.5;
        this.visual.rotation.x = 0;
        this.visual.position.y = -0.55 * e;
        S('spine', 0.26 * e, 0, 0);
        S('chest', 0.16 * e, 0, 0);
        S('neck1', 0.70 * e, 0.26 * e, 0);
        S('neck2', 0.30 * e, 0, 0);
        S('head', -0.55 * e, 0, 0);
        S('jaw', 0.80 * e, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.75 * e, 0, 0); S(`fkn${n}`, -1.45 * e, 0, 0); S(`ffl${n}`, 0.65 * e, 0, 0);
          S(`bhp${n}`, -0.80 * e, 0, 0); S(`bst${n}`, 0.36 + 1.10 * e, 0, 0);
          S(`bhk${n}`, -0.34 - 0.90 * e, 0, 0);
        }
        fire(-1.15 * e, 0.03, 1.2, -0.95 * e);
        break;
      }
      default: {
        // standing idle: weight shifting, head tossing, fire licking upward
        const b = Math.sin(t * 1.3) * 0.035;
        stand();
        S('spine', b, 0, 0);
        S('chest', b * 0.6, 0, 0);
        S('neck1', 0.10 + b + Math.sin(t * 0.42) * 0.10, Math.sin(t * 0.31) * 0.12, 0);
        S('neck2', -0.08 - b, Math.sin(t * 0.31 - 0.5) * 0.10, 0);
        S('head', 0.05 + Math.sin(t * 0.55) * 0.10, Math.sin(t * 0.29) * 0.16, 0);
        S('jaw', 0.12 + Math.max(0, Math.sin(t * 0.9)) * 0.16, 0, 0);
        S('fshR', -0.04 + Math.max(0, Math.sin(t * 0.5 - 1.2)) * 0.30, 0, 0);
        S('fknR', -0.14 - Math.max(0, Math.sin(t * 0.5 - 1.2)) * 0.35, 0, 0);
        fire(0.22, 0.16, 3.4, 0.10);
        this.visual.position.y = 0;
        this.visual.rotation.x = 0;
        this.visual.rotation.z = 0;
        break;
      }
    }
  }
}

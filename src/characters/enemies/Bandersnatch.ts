import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.ts';
import { Enemy, organicNormal, organicRoughness } from './EnemyBase.ts';
import { tube, blob, spike, place, tint, glow } from '../../combat/GeoKit.ts';

const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const FUR = 0x584e42;
const FUR_DARK = 0x2f2b25;
const BELLY = 0x8a8071;
const RUFF = 0xc6bfae;
const RUFF_DARK = 0x8d8778;
const FANG = 0xe7dfc8;
const CLAW = 0x17140f;
const EYE = 0xff2812;

/**
 * Bandersnatch — the huge shaggy sabre-toothed hound-lion of the Cleigne
 * uplands. Deep chest, long powerful forelegs, a heavy ruff of matted
 * grey-white fur banked around the neck and shoulders, a blunt broad skull
 * carrying two downward sabre fangs, and a stubby whip of a tail. Rangier and
 * far bigger than a Sabertusk at 2.1 m at the shoulder, and the fastest thing
 * alive on the continent: it closes a forty-metre gap in a bounding gallop.
 */
export const BANDERSNATCH = {
  key: 'bandersnatch',
  questId: 'bandersnatch',
  faction: 'beast',
  expClass: 'elite',
  stats: {
    name: 'Bandersnatch', hp: 9800, poise: 180, speed: 9.0, attackRange: 3.8,
    aggroRange: 38, radius: 0.95, height: 2.1, damage: 380, level: 52,
  },
  weakness: 'ice',
  resist: 'fire',
  resistPct: { ice: 165, fire: 55, lightning: 100, dark: 100, light: 100 },
  weakTo: ['polearm'],
  senses: { sight: 38, fov: 1.7, hearing: 26, nocturnal: false },
  drops: [
    { id: 'bandersnatch_fur', chance: 0.55, count: 1 },
  ],
  timing: { telegraph: 0.5, strike: 0.18, attack: 0.55, recover: 0.75 },
  attacks: [
    { id: 'maul', range: 3.9, weight: 4, mult: 1.0, poise: 32, hitRadius: 2.9, arc: 1.4,
      telegraph: 0.42, strike: 0.16, attack: 0.52, recover: 0.62, cooldown: 1.1 },
    { id: 'pounce', range: 22, minRange: 8, weight: 3, mult: 1.5, poise: 58, hitRadius: 2.7,
      telegraph: 0.55, strike: 0.20, attack: 0.78, recover: 0.95, cooldown: 3.6,
      lunge: 20, tracking: 0.35, unblockable: true },
    { id: 'frenzy', range: 3.2, weight: 1, mult: 0.72, poise: 24, hitRadius: 3.0, aoe: true,
      telegraph: 0.6, strike: 0.24, attack: 1.15, recover: 1.25, cooldown: 9.0 },
  ],
  buildPrototype,
  make(opts: any) { return new BandersnatchEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('hips', 'root', [0, 1.72, -0.95]);
  rig.bone('spine', 'hips', [0, 1.82, -0.35]);
  rig.bone('chest', 'spine', [0, 1.94, 0.40]);
  rig.bone('neck', 'chest', [0, 2.02, 0.92]);
  rig.bone('head', 'neck', [0, 1.98, 1.38]);
  rig.bone('jaw', 'head', [0, 1.80, 1.46]);
  rig.bone('tail1', 'hips', [0, 1.70, -1.24]);
  rig.bone('tail2', 'tail1', [0, 1.60, -1.50]);
  rig.bone('tail3', 'tail2', [0, 1.48, -1.72]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`fsh${n}`, 'chest', [0.40 * s, 1.86, 0.44]);
    rig.bone(`fkn${n}`, `fsh${n}`, [0.44 * s, 1.02, 0.36]);
    rig.bone(`fpw${n}`, `fkn${n}`, [0.46 * s, 0.16, 0.50]);
    rig.bone(`bhp${n}`, 'hips', [0.42 * s, 1.68, -0.98]);
    rig.bone(`bkn${n}`, `bhp${n}`, [0.48 * s, 0.94, -1.26]);
    rig.bone(`bpw${n}`, `bkn${n}`, [0.46 * s, 0.16, -0.90]);
  }

  /* ---- torso: narrow at the loin, enormously deep at the chest ---- */
  const torso = tube([
    P(0, 1.66, -1.32), P(0, 1.74, -0.96), P(0, 1.80, -0.42),
    P(0, 1.88, 0.10), P(0, 1.94, 0.56), P(0, 2.00, 0.94),
  ], [
    [0.24, 0.28], [0.34, 0.40], [0.35, 0.45],
    [0.38, 0.52], [0.41, 0.58], [0.32, 0.44],
  ], { radialSeg: 12 });
  rig.attach(tint(torso, FUR, 0.05), 'spine');

  const belly = tube([
    P(0, 1.42, -0.70), P(0, 1.38, -0.10), P(0, 1.44, 0.46),
  ], [0.22, 0.26, 0.30], { radialSeg: 8, flat: 0.7 });
  rig.attach(tint(belly, BELLY, 0.05), 'spine');

  // haunches and shoulder blocks — the two masses that carry the gallop
  for (const s of [-1, 1]) {
    const haunch = place(blob(0.26, 0.30, 0.34, 9, 7), { pos: [0.28 * s, 1.72, -0.92] });
    rig.attach(tint(haunch, FUR, 0.06), 'hips');
    const shoulder = place(blob(0.24, 0.30, 0.30, 9, 7), { pos: [0.30 * s, 1.88, 0.40] });
    rig.attach(tint(shoulder, FUR, 0.06), 'chest');
  }

  /* ---- shaggy dorsal coat: matted clumps, not quills ---- */
  for (let i = 0; i < 12; i++) {
    const u = i / 11;
    const z = -1.20 + u * 2.00;
    const h = 0.14 + Math.sin(u * Math.PI) * 0.16;
    const y = 2.02 + Math.sin(u * Math.PI) * 0.10;
    const clump = tube([P(0, y, z), P(0, y + h * 0.6, z - h * 0.7)], [0.075, 0.028], { radialSeg: 5 });
    rig.attach(tint(clump, FUR_DARK, 0.07), u < 0.35 ? 'hips' : u < 0.72 ? 'spine' : 'chest');
  }

  /* ---- the ruff: a banked collar of grey-white fur ---- */
  const collar = tube([P(0, 1.98, 0.62), P(0, 2.02, 0.88)], [0.52, 0.44], { radialSeg: 12, flat: 0.95 });
  rig.attach(tint(collar, RUFF_DARK, 0.07), 'chest');
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const cx = Math.cos(a), cy = Math.sin(a);
    const r0 = 0.44, r1 = 0.74;
    const tuft = tube([
      P(cx * r0 * 0.9, 2.00 + cy * r0, 0.74),
      P(cx * (r0 + r1) * 0.5, 2.00 + cy * (r0 + r1) * 0.5, 0.60),
      P(cx * r1, 2.00 + cy * r1, 0.42),
    ], [0.11, 0.085, 0.035], { radialSeg: 5 });
    rig.attach(tint(tuft, i % 3 === 0 ? RUFF_DARK : RUFF, 0.09), 'chest');
  }

  /* ---- neck & the blunt broad skull ---- */
  const neck = tube([P(0, 1.98, 0.80), P(0, 2.02, 1.02), P(0, 1.99, 1.24)],
    [0.28, 0.26, 0.24], { radialSeg: 10, flat: 1.05 });
  rig.attachBlend(tint(neck, FUR, 0.05), 'chest', 'head', 1.0);

  const skull = place(blob(0.26, 0.23, 0.28, 11, 8), { pos: [0, 1.99, 1.40] });
  rig.attach(tint(skull, FUR, 0.04), 'head');
  const brow = place(blob(0.24, 0.09, 0.14, 9, 5), { pos: [0, 2.10, 1.52] });
  rig.attach(tint(brow, FUR_DARK, 0.05), 'head');
  const muzzle = tube([P(0, 1.94, 1.52), P(0, 1.90, 1.72), P(0, 1.88, 1.86)],
    [[0.20, 0.16], [0.17, 0.14], [0.13, 0.11]], { radialSeg: 8 });
  rig.attach(tint(muzzle, FUR_DARK, 0.05), 'head');
  const nose = place(blob(0.075, 0.055, 0.055, 7, 5), { pos: [0, 1.90, 1.91] });
  rig.attach(tint(nose, 0x100e0c), 'head');

  const jaw = tube([P(0, 1.78, 1.48), P(0, 1.76, 1.68), P(0, 1.76, 1.82)],
    [0.15, 0.12, 0.095], { radialSeg: 7, flat: 0.85 });
  rig.attach(tint(jaw, FUR_DARK, 0.04), 'jaw');

  // the sabre fangs: two long downward tusks from the upper jaw
  for (const s of [-1, 1]) {
    const f = place(spike(0.055, 0.46, 6), { pos: [0.115 * s, 1.86, 1.74], rot: [Math.PI - 0.22, 0, 0.10 * s] });
    rig.attach(tint(f, FANG), 'head');
    const f2 = place(spike(0.030, 0.17, 5), { pos: [0.085 * s, 1.85, 1.86], rot: [Math.PI - 0.10, 0, 0] });
    rig.attach(tint(f2, FANG), 'head');
  }
  // lower canines, for when the jaw drops
  for (const s of [-1, 1]) {
    const f = place(spike(0.028, 0.15, 5), { pos: [0.095 * s, 1.80, 1.72], rot: [-0.12, 0, 0] });
    rig.attach(tint(f, FANG), 'jaw');
  }

  // ears: small, flattened back against the ruff
  for (const s of [-1, 1]) {
    const e = tube([P(0.17 * s, 2.10, 1.32), P(0.26 * s, 2.16, 1.16)],
      [[0.085, 0.030], [0.030, 0.012]], { radialSeg: 5 });
    rig.attach(tint(e, FUR_DARK, 0.05), 'head');
  }
  // small, deep-set, red
  for (const s of [-1, 1]) {
    const e = place(blob(0.040, 0.034, 0.026, 7, 5), { pos: [0.145 * s, 2.02, 1.58] });
    rig.attach(glow(tint(e, 0x1a0402), EYE, 3.0), 'head');
  }

  /* ---- legs: long forelegs, deep-angled hind legs ---- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const fu = tube([P(0.40 * s, 1.88, 0.44), P(0.42 * s, 1.46, 0.42), P(0.44 * s, 1.04, 0.36)],
      [0.20, 0.165, 0.115], { radialSeg: 8 });
    rig.attachBlend(tint(fu, FUR, 0.05), `fsh${n}`, `fkn${n}`, 0.9);
    const fl = tube([P(0.44 * s, 1.04, 0.36), P(0.45 * s, 0.60, 0.44), P(0.46 * s, 0.20, 0.50)],
      [0.105, 0.082, 0.072], { radialSeg: 7 });
    rig.attachBlend(tint(fl, FUR_DARK, 0.05), `fkn${n}`, `fpw${n}`, 0.9);
    const fp = place(blob(0.115, 0.085, 0.16, 8, 6), { pos: [0.46 * s, 0.12, 0.58] });
    rig.attach(tint(fp, FUR_DARK, 0.04), `fpw${n}`);
    for (let c = -1; c <= 2; c++) {
      const cl = place(spike(0.024, 0.11, 4), { pos: [(0.46 + (c - 0.5) * 0.062) * s, 0.06, 0.70], rot: [1.3, 0, 0] });
      rig.attach(tint(cl, CLAW), `fpw${n}`);
    }

    const bu = tube([P(0.42 * s, 1.70, -0.98), P(0.46 * s, 1.32, -1.14), P(0.48 * s, 0.96, -1.26)],
      [0.24, 0.20, 0.125], { radialSeg: 8 });
    rig.attachBlend(tint(bu, FUR, 0.05), `bhp${n}`, `bkn${n}`, 0.9);
    const bl = tube([P(0.48 * s, 0.96, -1.26), P(0.47 * s, 0.56, -1.08), P(0.46 * s, 0.20, -0.90)],
      [0.115, 0.085, 0.072], { radialSeg: 7 });
    rig.attachBlend(tint(bl, FUR_DARK, 0.05), `bkn${n}`, `bpw${n}`, 0.9);
    const bp = place(blob(0.110, 0.082, 0.155, 8, 6), { pos: [0.46 * s, 0.12, -0.80] });
    rig.attach(tint(bp, FUR_DARK, 0.04), `bpw${n}`);
    for (let c = -1; c <= 2; c++) {
      const cl = place(spike(0.022, 0.10, 4), { pos: [(0.46 + (c - 0.5) * 0.058) * s, 0.06, -0.68], rot: [1.3, 0, 0] });
      rig.attach(tint(cl, CLAW), `bpw${n}`);
    }
  }

  /* ---- stubby whip tail ---- */
  const t1 = tube([P(0, 1.70, -1.22), P(0, 1.62, -1.46)], [0.105, 0.070], { radialSeg: 6 });
  rig.attachBlend(tint(t1, FUR, 0.05), 'tail1', 'tail2', 1.0);
  const t2 = tube([P(0, 1.60, -1.50), P(0, 1.48, -1.74)], [0.062, 0.028], { radialSeg: 6 });
  rig.attachBlend(tint(t2, FUR_DARK, 0.05), 'tail2', 'tail3', 1.0);

  const mat = creatureMaterial({
    roughness: 0.88, metalness: 0.0,
    normalMap: organicNormal(), normalScale: 0.65, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 3.4, coat: { mottle: 0.15, tick: 0.16, shade: 0.18, dust: 0.30, dustTop: 0.55 } });
}

class BandersnatchEnemy extends Enemy {
  override attackId!: any;
  override rig!: any;
  override stateTime!: any;
  override visual!: any;
  constructor(opts: any) { super(BANDERSNATCH, opts); }

  override pose(state: any, t: any) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n: string, x: number, y: number, z: number) => poseBone(rig, n, x, y, z);

    /**
     * A bounding gallop: both forelegs swing nearly together, both hind legs
     * nearly together, and the spine folds and snaps open between them. The
     * small left/right offset keeps it from looking mechanical.
     */
    const gallop = (ph: number) => {
      for (const s of [-1, 1]) {
        const n = s < 0 ? 'L' : 'R';
        const lead = s < 0 ? 0 : 0.42;
        const f = Math.sin(ph + lead);
        const fk = Math.sin(ph + lead + 1.5);
        S(`fsh${n}`, -f * 1.15 - 0.10, 0.05 * s, 0);
        S(`fkn${n}`, -0.35 - Math.max(0, -fk) * 1.25, 0, 0);
        S(`fpw${n}`, 0.30 + f * 0.45, 0, 0);
        const b = Math.sin(ph + lead + Math.PI * 0.78);
        const bk = Math.sin(ph + lead + Math.PI * 0.78 + 1.5);
        S(`bhp${n}`, b * 1.05 - 0.10, 0.04 * s, 0);
        S(`bkn${n}`, 0.55 + Math.max(0, bk) * 1.15, 0, 0);
        S(`bpw${n}`, -0.35 - b * 0.45, 0, 0);
      }
    };

    switch (state) {
      case 'run':
      case 'approach': {
        const ph = t * 10.5;
        gallop(ph);
        // the spine is the engine: fold at the gather, extend at full stretch
        const flex = Math.sin(ph + 0.5);
        S('hips', flex * 0.14, 0, 0);
        S('spine', -flex * 0.22, 0, 0);
        S('chest', -flex * 0.14, 0, 0);
        S('neck', -0.14 - flex * 0.10, 0, 0);
        S('head', 0.16 + flex * 0.12, Math.sin(ph * 0.5) * 0.05, 0);
        S('jaw', 0.20 + Math.max(0, flex) * 0.15, 0, 0);
        S('tail1', -0.45, Math.sin(ph * 0.8) * 0.25, 0);
        S('tail2', -0.30, Math.sin(ph * 0.8 + 0.8) * 0.35, 0);
        S('tail3', -0.20, Math.sin(ph * 0.8 + 1.6) * 0.45, 0);
        // the airborne beat — a real bound leaves the ground
        this.visual.position.y = Math.max(0, Math.sin(ph + 0.9)) * 0.34;
        this.visual.rotation.z = Math.sin(ph) * 0.05;
        break;
      }
      case 'telegraph': {
        const id = this.attackId;
        if (id === 'pounce') {
          // coil: everything loads onto the hind legs, head levelled at the kill
          const k = Math.min(1, this.stateTime / 0.32);
          const shiver = Math.sin(t * 44) * 0.025 * k;
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.55 * k, 0, 0); S(`fkn${n}`, -1.10 * k, 0, 0); S(`fpw${n}`, 0.65 * k, 0, 0);
            S(`bhp${n}`, -0.95 * k, 0, 0); S(`bkn${n}`, 1.45 * k, 0, 0); S(`bpw${n}`, -0.70 * k, 0, 0);
          }
          S('hips', -0.20 * k, 0, 0);
          S('spine', 0.22 * k + shiver, 0, 0);
          S('chest', 0.14 * k, 0, 0);
          S('neck', 0.26 * k, 0, 0);
          S('head', -0.28 * k, 0, 0);
          S('jaw', 0.22 * k, 0, 0);
          S('tail1', 0.55 * k, 0, 0); S('tail2', 0.45 * k, 0, 0); S('tail3', 0.35 * k, 0, 0);
          this.visual.position.y = -0.34 * k;
        } else if (id === 'frenzy') {
          // rears half up, both forepaws cocked, jaw wide — the flurry tell
          const k = Math.min(1, this.stateTime / 0.4);
          const e = k * k * (3 - 2 * k);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, -1.55 * e, 0.28 * s * e, 0);
            S(`fkn${n}`, -1.10 * e, 0, 0);
            S(`fpw${n}`, -0.35 * e, 0, 0);
            S(`bhp${n}`, -0.55 * e, 0, 0); S(`bkn${n}`, 0.90 * e, 0, 0); S(`bpw${n}`, -0.40 * e, 0, 0);
          }
          S('hips', 0.18 * e, 0, 0);
          S('spine', -0.42 * e, 0, 0);
          S('chest', -0.30 * e, 0, 0);
          S('neck', -0.24 * e, 0, 0);
          S('head', 0.34 * e, 0, 0);
          S('jaw', 0.85 * e, 0, 0);
          this.visual.position.y = 0.22 * e;
          this.visual.rotation.z = 0;
        } else {
          // maul: weight back onto the haunches, hackles up, head low
          const k = Math.min(1, this.stateTime / 0.26);
          const shiver = Math.sin(t * 38) * 0.02 * k;
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.30 * k, 0, 0); S(`fkn${n}`, -0.75 * k, 0, 0); S(`fpw${n}`, 0.45 * k, 0, 0);
            S(`bhp${n}`, -0.60 * k, 0, 0); S(`bkn${n}`, 1.00 * k, 0, 0); S(`bpw${n}`, -0.45 * k, 0, 0);
          }
          S('spine', 0.16 * k + shiver, 0, 0);
          S('chest', 0.12 * k, 0, 0);
          S('neck', 0.24 * k, 0, 0);
          S('head', -0.20 * k, 0, 0);
          S('jaw', 0.40 * k, 0, 0);
          S('tail1', 0.45 * k, 0, 0); S('tail2', 0.35 * k, 0, 0);
          this.visual.position.y = -0.18 * k;
        }
        break;
      }
      case 'attack': {
        const id = this.attackId;
        if (id === 'pounce') {
          // airborne: forelegs reaching, spine extended, jaws open
          const k = Math.min(1, this.stateTime / 0.16);
          const e = 1 - Math.pow(1 - k, 3);
          const fall = Math.max(0, this.stateTime - 0.34);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, -1.45 * e, 0.14 * s, 0); S(`fkn${n}`, -0.30 * e, 0, 0); S(`fpw${n}`, -0.55 * e, 0, 0);
            S(`bhp${n}`, 1.15 * e, 0, 0); S(`bkn${n}`, -0.95 * e, 0, 0); S(`bpw${n}`, 0.55 * e, 0, 0);
          }
          S('hips', 0.16 * e, 0, 0);
          S('spine', -0.30 * e, 0, 0);
          S('chest', -0.20 * e, 0, 0);
          S('neck', -0.32 * e, 0, 0);
          S('head', 0.38 * e, 0, 0);
          S('jaw', 0.95 * e, 0, 0);
          S('tail1', -0.7 * e, 0, 0); S('tail2', -0.45 * e, 0, 0); S('tail3', -0.25 * e, 0, 0);
          this.visual.position.y = Math.max(0, 0.55 * e - fall * 2.2);
        } else if (id === 'frenzy') {
          // three forepaw rakes off the reared pose, one every 0.28 s
          const beat = Math.min(2.999, this.stateTime / 0.28);
          const i = Math.floor(beat);
          const u = beat - i;
          const swing = 1 - Math.pow(1 - Math.min(1, u * 1.6), 3);
          const lead = i % 2 === 0 ? -1 : 1;
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            const hot = s === lead ? 1 : 0.35;
            S(`fsh${n}`, -1.55 + 2.20 * swing * hot, (0.28 - 0.55 * swing * hot) * s, 0);
            S(`fkn${n}`, -1.10 + 0.85 * swing * hot, 0, 0);
            S(`fpw${n}`, -0.35 + 0.70 * swing * hot, 0, 0);
            S(`bhp${n}`, -0.55, 0, 0); S(`bkn${n}`, 0.90, 0, 0); S(`bpw${n}`, -0.40, 0, 0);
          }
          S('hips', 0.18, 0, 0);
          S('spine', -0.42 + 0.20 * swing, 0.10 * lead, 0);
          S('chest', -0.30 + 0.16 * swing, 0.14 * lead, 0);
          S('neck', -0.24, -0.12 * lead, 0);
          S('head', 0.34 - 0.20 * swing, -0.16 * lead, 0);
          S('jaw', 0.85, 0, 0);
          this.visual.position.y = 0.22 - 0.06 * swing;
        } else {
          // maul: a double forepaw rake driven off the front shoulders
          const k = Math.min(1, this.stateTime / 0.15);
          const e = 1 - Math.pow(1 - k, 3);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.30 - 1.85 * e, 0.30 * s * e, 0);
            S(`fkn${n}`, -0.75 + 0.55 * e, 0, 0);
            S(`fpw${n}`, 0.45 - 0.95 * e, 0, 0);
            S(`bhp${n}`, -0.60 + 0.35 * e, 0, 0); S(`bkn${n}`, 1.00 - 0.45 * e, 0, 0);
            S(`bpw${n}`, -0.45 + 0.20 * e, 0, 0);
          }
          S('spine', 0.16 - 0.36 * e, 0, 0);
          S('chest', 0.12 - 0.30 * e, 0, 0);
          S('neck', 0.24 - 0.42 * e, 0, 0);
          S('head', -0.20 + 0.46 * e, 0, 0);
          S('jaw', 0.40 + 0.45 * e, 0, 0);
          this.visual.position.y = -0.18 + 0.30 * e;
        }
        break;
      }
      case 'flinch': {
        const k = Math.exp(-this.stateTime * 8) * (1 - Math.min(1, this.stateTime / 0.35));
        const sh = Math.sin(this.stateTime * 42) * k;
        S('spine', 0.22 * k, sh * 0.35, 0);
        S('chest', 0.16 * k, sh * 0.25, 0);
        S('neck', 0.34 * k, sh * 0.4, 0);
        S('head', -0.44 * k, sh * 0.5, 0.26 * k);
        S('jaw', 0.55 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.28 * k, 0, 0); S(`fkn${n}`, -0.45 * k, 0, 0);
          S(`bhp${n}`, -0.30 * k, 0, 0); S(`bkn${n}`, 0.52 * k, 0, 0);
        }
        break;
      }
      case 'stagger': {
        const k = Math.min(1, this.stateTime / 0.22) * Math.max(0, 1 - this.stateTime / 2.4);
        S('hips', 0.20 * k, 0, 0);
        S('spine', 0.30 * k, 0.26 * k, 0.18 * k);
        S('chest', 0.22 * k, 0.18 * k, 0);
        S('neck', 0.50 * k, 0.32 * k, 0);
        S('head', -0.58 * k, 0.30 * k, 0.38 * k);
        S('jaw', 0.65 * k, 0, 0);
        S('tail1', 0.30 * k, 0.4 * k, 0); S('tail2', 0.2 * k, 0.5 * k, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.62 * k, 0.12 * s * k, 0); S(`fkn${n}`, -1.15 * k, 0, 0); S(`fpw${n}`, 0.6 * k, 0, 0);
          S(`bhp${n}`, -0.80 * k, 0, 0); S(`bkn${n}`, 1.30 * k, 0, 0); S(`bpw${n}`, -0.6 * k, 0, 0);
        }
        this.visual.position.y = -0.50 * k;
        break;
      }
      case 'death': {
        const k = Math.min(1, this.stateTime / 0.7);
        const e = 1 - Math.pow(1 - k, 3);
        this.visual.rotation.z = e * 1.45;
        this.visual.position.y = -0.80 * e;
        S('spine', 0.32 * e, 0, 0);
        S('chest', 0.20 * e, 0, 0);
        S('neck', 0.55 * e, 0.32 * e, 0);
        S('head', -0.45 * e, 0, 0);
        S('jaw', 0.5 * e, 0, 0);
        S('tail1', 0.25 * e, 0.5 * e, 0); S('tail2', 0.2 * e, 0.6 * e, 0); S('tail3', 0.15 * e, 0.7 * e, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.70 * e, 0, 0); S(`fkn${n}`, -1.35 * e, 0, 0);
          S(`bhp${n}`, -0.90 * e, 0, 0); S(`bkn${n}`, 1.45 * e, 0, 0);
        }
        break;
      }
      default: {
        // idle: heavy slow breathing through the whole ribcage
        const b = Math.sin(t * 1.35) * 0.035;
        S('hips', b * 0.4, 0, 0);
        S('spine', b, 0, 0);
        S('chest', b * 0.7, 0, 0);
        S('neck', -0.06 + b, Math.sin(t * 0.42) * 0.14, 0);
        S('head', 0.06, Math.sin(t * 0.31) * 0.20, 0);
        S('jaw', 0.06 + Math.max(0, Math.sin(t * 0.8)) * 0.08, 0, 0);
        S('tail1', -0.12, Math.sin(t * 1.05) * 0.30, 0);
        S('tail2', -0.08, Math.sin(t * 1.05 + 0.7) * 0.40, 0);
        S('tail3', -0.05, Math.sin(t * 1.05 + 1.4) * 0.50, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0, 0, 0); S(`fkn${n}`, -0.10, 0, 0); S(`fpw${n}`, 0.08, 0, 0);
          S(`bhp${n}`, -0.16, 0, 0); S(`bkn${n}`, 0.32, 0, 0); S(`bpw${n}`, -0.16, 0, 0);
        }
        this.visual.position.y = 0;
        this.visual.rotation.z = 0;
        break;
      }
    }
  }
}

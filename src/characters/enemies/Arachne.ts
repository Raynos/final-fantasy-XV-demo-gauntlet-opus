import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.ts';
import { Enemy, organicNormal, organicRoughness } from './EnemyBase.ts';
import { tube, blob, spike, place, tint, glow } from '../../combat/GeoKit.ts';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

const SKIN = 0xbdb6a4;
const SKIN_DARK = 0x8b8474;
const CHITIN = 0x302c3a;
const CHITIN_HI = 0x4c4759;
const HAIR = 0x1c1c24;
const FANG = 0xd9d2be;
const SPIN = 0xc41a10;
const EYE = 0xff3a1c;

/** z of each leg socket along the body, front to back. */
const LEG_Z = [0.22, -0.10, -0.42, -0.74];
/** how far forward (+) or back (−) each leg reaches. */
const LEG_SWEEP = [0.95, 0.32, -0.38, -1.00];

/**
 * Arachne — the daemon that wears a woman like a mask. A naked, sickly
 * grey-white torso rises out of the front of an enormous wet-black spider
 * abdomen: the human half is far too long and far too thin, arched back over
 * eight jointed chitin legs, with a curtain of black hair hanging over a face
 * that is almost entirely a wide fanged grin. The spinnerets glow a dull red.
 * Nothing about the proportions is right, and that is the point.
 */
export const ARACHNE = {
  key: 'arachne',
  questId: 'arachne',
  faction: 'daemon',
  expClass: 'daemon',
  stats: {
    name: 'Arachne', hp: 6400, poise: 120, speed: 5.0, attackRange: 3.4,
    aggroRange: 32, radius: 1.2, height: 2.6, damage: 300, level: 34,
  },
  weakness: 'light',
  resist: 'dark',
  resistPct: { light: 190, fire: 150, ice: 80, dark: 0 },
  senses: { sight: 32, fov: 2.4, hearing: 18, nocturnal: true },
  drops: [
    { id: 'arachne_thread', chance: 0.5, count: 1 },
    { id: 'venom_fang', chance: 0.22, count: 1 },
  ],
  timing: { telegraph: 0.6, strike: 0.22, attack: 0.6, recover: 0.85 },
  attacks: [
    { id: 'rake', range: 3.6, weight: 4, mult: 1.0, poise: 26, hitRadius: 2.6, arc: 1.5,
      telegraph: 0.5, strike: 0.2, attack: 0.58, recover: 0.7, cooldown: 1.3 },
    { id: 'webshot', range: 20, minRange: 5, weight: 3, mult: 0.55, poise: 40, hitRadius: 1.6,
      telegraph: 0.75, strike: 0.26, attack: 0.7, recover: 1.0, cooldown: 4.5,
      ranged: true, tracking: 1.6 },
    { id: 'skewer', range: 3.8, weight: 2, mult: 1.45, poise: 55, hitRadius: 3.0, aoe: true,
      telegraph: 0.85, strike: 0.28, attack: 0.8, recover: 1.15, cooldown: 5.0,
      unblockable: true, tracking: 1.0 },
  ],
  buildPrototype,
  make(opts) { return new ArachneEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('body', 'root', [0, 1.02, -0.28]);
  rig.bone('abdo', 'body', [0, 1.14, -1.02]);
  rig.bone('abdo2', 'abdo', [0, 1.02, -1.66]);
  rig.bone('spine', 'body', [0, 1.42, -0.14]);
  rig.bone('chest', 'spine', [0, 1.92, -0.06]);
  rig.bone('neck', 'chest', [0, 2.26, 0.0]);
  rig.bone('head', 'neck', [0, 2.42, 0.02]);
  rig.bone('jaw', 'head', [0, 2.34, 0.10]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`sh${n}`, 'chest', [0.24 * s, 2.14, -0.04]);
    rig.bone(`el${n}`, `sh${n}`, [0.44 * s, 1.70, 0.08]);
    rig.bone(`hd${n}`, `el${n}`, [0.56 * s, 1.26, 0.22]);
  }
  // eight legs, eight bone chains — one loop, no copy-paste
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) {
      const n = legName(i, s);
      const z = LEG_Z[i], sw = LEG_SWEEP[i];
      rig.bone(`cx${n}`, 'body', [0.36 * s, 1.02, z]);
      rig.bone(`kn${n}`, `cx${n}`, [1.02 * s, 1.94 - i * 0.05, z + sw * 0.55]);
      rig.bone(`ft${n}`, `kn${n}`, [1.72 * s, 0.06, z + sw * 1.35]);
    }
  }

  /* ---- the spider half: cephalothorax and a swollen abdomen ---- */
  const cephalo = place(blob(0.50, 0.34, 0.58, 12, 9), { pos: [0, 1.02, -0.26] });
  rig.attach(tint(cephalo, CHITIN, 0.05), 'body');
  const carapace = place(blob(0.42, 0.20, 0.48, 10, 6), { pos: [0, 1.24, -0.30] });
  rig.attach(tint(carapace, CHITIN_HI, 0.06), 'body');

  const abdomen = tube([
    P(0, 1.10, -0.56), P(0, 1.18, -0.86), P(0, 1.16, -1.20),
    P(0, 1.06, -1.54), P(0, 0.96, -1.80),
  ], [0.36, 0.58, 0.62, 0.46, 0.18], { radialSeg: 12 });
  rig.attachBlend(tint(abdomen, CHITIN, 0.05), 'abdo', 'abdo2', 1.6);

  // segment banding across the top of the abdomen
  for (let i = 0; i < 4; i++) {
    const u = i / 3;
    const band = tube([P(-0.20 - u * 0.06, 1.30 - u * 0.16, -0.82 - u * 0.30),
      P(0, 1.38 - u * 0.16, -0.86 - u * 0.30),
      P(0.20 + u * 0.06, 1.30 - u * 0.16, -0.82 - u * 0.30)],
    [0.05, 0.075, 0.05], { radialSeg: 5 });
    rig.attach(tint(band, CHITIN_HI, 0.05), i < 2 ? 'abdo' : 'abdo2');
  }

  // spinnerets: a dull red furnace at the rear
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    const sp = place(spike(0.055, 0.16, 5), {
      pos: [Math.cos(a) * 0.10, 0.98 + Math.sin(a) * 0.10, -1.82], rot: [Math.PI * 0.5, 0, 0],
    });
    rig.attach(tint(sp, CHITIN_HI), 'abdo2');
  }
  const vent = place(blob(0.13, 0.13, 0.07, 8, 6), { pos: [0, 0.98, -1.86] });
  rig.attach(glow(tint(vent, 0x2a0503), SPIN, 2.6), 'abdo2');

  /* ---- the human half: too long, too thin, arched back ---- */
  const torso = tube([
    P(0, 1.22, -0.20), P(0, 1.52, -0.18), P(0, 1.80, -0.12),
    P(0, 2.04, -0.06), P(0, 2.24, 0.0),
  ], [
    [0.21, 0.17], [0.155, 0.135], [0.185, 0.150],
    [0.205, 0.160], [0.125, 0.105],
  ], { radialSeg: 10 });
  rig.attachBlend(tint(torso, SKIN, 0.05), 'spine', 'chest', 1.7);

  // the join: chitin creeping up over pale flesh at the waist
  const seam = tube([P(0, 1.14, -0.24), P(0, 1.30, -0.20)], [0.28, 0.21], { radialSeg: 10 });
  rig.attach(tint(seam, CHITIN_HI, 0.07), 'body');

  // ribs showing through — four hard shadows across the thin chest
  for (let i = 0; i < 4; i++) {
    const y = 1.68 + i * 0.115;
    const rib = tube([P(-0.17, y - 0.03, -0.09), P(0, y, -0.14), P(0.17, y - 0.03, -0.09)],
      [0.022, 0.030, 0.022], { radialSeg: 4 });
    rig.attach(tint(rib, SKIN_DARK, 0.04), 'chest');
  }
  const collar = tube([P(-0.20, 2.16, -0.02), P(0, 2.20, 0.02), P(0.20, 2.16, -0.02)],
    [0.030, 0.038, 0.030], { radialSeg: 5 });
  rig.attach(tint(collar, SKIN_DARK, 0.04), 'chest');

  /* ---- head: a grin with a face around it ---- */
  const neck = tube([P(0, 2.20, 0.0), P(0, 2.34, 0.01)], [0.075, 0.085], { radialSeg: 7 });
  rig.attachBlend(tint(neck, SKIN, 0.04), 'chest', 'head', 1.0);

  const skull = place(blob(0.135, 0.155, 0.140, 10, 8), { pos: [0, 2.44, 0.02] });
  rig.attach(tint(skull, SKIN, 0.04), 'head');

  // the mouth: a slot far too wide for the head, ringed with teeth
  const mouth = place(blob(0.128, 0.045, 0.055, 9, 5), { pos: [0, 2.36, 0.115] });
  rig.attach(tint(mouth, 0x090509), 'head');
  for (let i = -4; i <= 4; i++) {
    const up = place(spike(0.011, 0.045, 4), { pos: [i * 0.028, 2.375, 0.125], rot: [Math.PI - 0.08, 0, 0] });
    rig.attach(tint(up, FANG), 'head');
    const lo = place(spike(0.010, 0.040, 4), { pos: [i * 0.028 + 0.014, 2.335, 0.122], rot: [-0.08, 0, 0] });
    rig.attach(tint(lo, FANG), 'jaw');
  }
  const chin = place(blob(0.085, 0.045, 0.070, 8, 5), { pos: [0, 2.315, 0.085] });
  rig.attach(tint(chin, SKIN_DARK, 0.04), 'jaw');
  // two long venom fangs at the corners of the grin
  for (const s of [-1, 1]) {
    const f = place(spike(0.020, 0.13, 5), { pos: [0.105 * s, 2.36, 0.115], rot: [Math.PI - 0.16, 0, 0.14 * s] });
    rig.attach(tint(f, FANG), 'head');
  }
  // eyes buried under the hair
  for (const s of [-1, 1]) {
    const e = place(blob(0.024, 0.020, 0.016, 6, 5), { pos: [0.058 * s, 2.455, 0.118] });
    rig.attach(glow(tint(e, 0x1a0503), EYE, 2.4), 'head');
  }

  // curtain of black hair — hangs over the face and down past the shoulders
  for (let i = 0; i < 13; i++) {
    const a = -Math.PI * 0.15 + (i / 12) * Math.PI * 1.30;
    const cx = Math.cos(a) * 0.145, cz = Math.sin(a) * 0.145 - 0.02;
    const drop = 0.34 + (i % 3) * 0.10;
    const strand = tube([
      P(cx, 2.55, cz), P(cx * 1.25, 2.44, cz * 1.25), P(cx * 1.35, 2.55 - drop, cz * 1.15),
    ], [0.045, 0.048, 0.026], { radialSeg: 4 });
    rig.attach(tint(strand, HAIR, 0.03), 'head');
  }

  /* ---- arms: far too long, ending in hooked claws ---- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const cap = place(blob(0.065, 0.065, 0.065, 7, 5), { pos: [0.24 * s, 2.14, -0.04] });
    rig.attach(tint(cap, SKIN_DARK, 0.05), `sh${n}`);
    const up = tube([P(0.24 * s, 2.13, -0.04), P(0.35 * s, 1.92, 0.02), P(0.44 * s, 1.71, 0.08)],
      [0.058, 0.046, 0.038], { radialSeg: 6 });
    rig.attachBlend(tint(up, SKIN, 0.05), `sh${n}`, `el${n}`, 1.0);
    const lo = tube([P(0.44 * s, 1.71, 0.08), P(0.50 * s, 1.48, 0.15), P(0.56 * s, 1.27, 0.22)],
      [0.038, 0.032, 0.027], { radialSeg: 6 });
    rig.attachBlend(tint(lo, SKIN, 0.05), `el${n}`, `hd${n}`, 1.0);
    const palm = place(blob(0.042, 0.026, 0.048, 7, 5), { pos: [0.565 * s, 1.245, 0.25] });
    rig.attach(tint(palm, SKIN_DARK, 0.04), `hd${n}`);
    for (let c = -1; c <= 1; c++) {
      const cl = place(spike(0.010, 0.145, 4),
        { pos: [(0.565 + c * 0.030) * s, 1.225, 0.285], rot: [1.15, 0, c * 0.24] });
      rig.attach(tint(cl, FANG), `hd${n}`);
    }
  }

  /* ---- eight legs: coxa, long femur up to a high knee, tibia to a point ---- */
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) {
      const n = legName(i, s);
      const z = LEG_Z[i], sw = LEG_SWEEP[i];
      const kx = 1.02 * s, ky = 1.94 - i * 0.05, kz = z + sw * 0.55;
      const fx = 1.72 * s, fz = z + sw * 1.35;

      const coxa = place(blob(0.115, 0.105, 0.115, 7, 5), { pos: [0.40 * s, 1.02, z] });
      rig.attach(tint(coxa, CHITIN_HI, 0.05), `cx${n}`);
      const femur = tube([
        P(0.42 * s, 1.04, z),
        P((0.42 + kx) * 0.5, (1.04 + ky) * 0.5 + 0.06, (z + kz) * 0.5),
        P(kx, ky, kz),
      ], [0.090, 0.070, 0.055], { radialSeg: 6 });
      rig.attachBlend(tint(femur, CHITIN, 0.05), `cx${n}`, `kn${n}`, 1.0);
      const joint = place(blob(0.070, 0.070, 0.070, 6, 5), { pos: [kx, ky, kz] });
      rig.attach(tint(joint, CHITIN_HI, 0.05), `kn${n}`);
      const tibia = tube([
        P(kx, ky - 0.02, kz),
        P((kx + fx) * 0.5, (ky + 0.06) * 0.5, (kz + fz) * 0.5),
        P(fx, 0.10, fz),
      ], [0.055, 0.038, 0.018], { radialSeg: 6 });
      rig.attachBlend(tint(tibia, CHITIN, 0.05), `kn${n}`, `ft${n}`, 1.0);
      const tip = place(spike(0.020, 0.14, 4), { pos: [fx, 0.09, fz], rot: [Math.PI, 0, 0] });
      rig.attach(tint(tip, CHITIN_HI), `ft${n}`);
    }
  }

  const mat = creatureMaterial({
    roughness: 0.52, metalness: 0.08,
    rim: { color: 0x8c7ea8, strength: 0.075 },
    normalMap: organicNormal(), normalScale: 0.55, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 3.2 });
}

/** Bone-name suffix for leg `i` on side `s`. */
function legName(i, s) { return `${i}${s < 0 ? 'L' : 'R'}`; }

class ArachneEnemy extends Enemy {
  constructor(opts) { super(ARACHNE, opts); }

  pose(state, t) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n, x, y, z) => poseBone(rig, n, x, y, z);
    /** Run `fn(name, i, s, group)` over all eight legs. */
    const legs = (fn) => {
      for (let i = 0; i < 4; i++) {
        for (const s of [-1, 1]) fn(legName(i, s), i, s, (i + (s < 0 ? 0 : 1)) % 2);
      }
    };
    // the two alternating tetrapods: 0L 1R 2L 3R against 0R 1L 2R 3L
    const stance = (k = 1) => legs((n, i, s) => {
      S(`cx${n}`, 0, 0, 0);
      S(`kn${n}`, -0.10 * k, 0, 0);
      S(`ft${n}`, 0.12 * k, 0, 0);
    });

    switch (state) {
      case 'run':
      case 'approach': {
        const ph = t * 7.0;
        legs((n, i, s, grp) => {
          const a = Math.sin(ph + grp * Math.PI);
          const lift = Math.max(0, Math.sin(ph + grp * Math.PI + 0.5));
          S(`cx${n}`, 0, a * 0.34 * s, 0);
          S(`kn${n}`, -0.10 - lift * 0.55, a * 0.14, 0);
          S(`ft${n}`, 0.12 + lift * 0.65, 0, 0);
        });
        const sway = Math.sin(ph) * 0.05;
        S('body', 0.03, sway * 0.6, sway * 0.5);
        S('abdo', -0.05 + Math.sin(ph * 2) * 0.04, -sway, 0);
        S('abdo2', 0.04, -sway * 0.8, 0);
        // the human half rides the bounce, arms hanging and swinging
        S('spine', -0.16 + Math.sin(ph * 2) * 0.05, -sway * 0.8, 0);
        S('chest', -0.10, -sway * 0.6, 0);
        S('neck', 0.20, sway, 0);
        S('head', 0.06, sway * 1.4, 0);
        S('jaw', 0.30 + Math.sin(ph) * 0.10, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, 0.35 - Math.sin(ph + (s < 0 ? 0 : Math.PI)) * 0.45, 0, 0.22 * s);
          S(`el${n}`, -0.75, 0, 0);
          S(`hd${n}`, 0.18, 0, 0);
        }
        this.visual.position.y = Math.abs(Math.sin(ph)) * 0.06;
        break;
      }
      case 'telegraph': {
        const id = this.attackId;
        if (id === 'webshot') {
          // twists the abdomen up and forward, aiming the spinnerets over the head
          const k = Math.min(1, this.stateTime / 0.45);
          const e = k * k * (3 - 2 * k);
          stance(1);
          legs((n, i, s) => { S(`kn${n}`, -0.10 - 0.20 * e, 0, 0); S(`ft${n}`, 0.12 + 0.25 * e, 0, 0); });
          S('body', -0.30 * e, 0, 0);
          S('abdo', -0.95 * e, 0, 0);
          S('abdo2', -0.55 * e, 0, 0);
          S('spine', 0.22 * e, 0, 0);
          S('chest', 0.16 * e, 0, 0);
          S('neck', -0.14 * e, 0, 0);
          S('head', -0.10 * e, 0, 0);
          S('jaw', 0.7 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`sh${n}`, -0.95 * e, 0, 0.75 * s * e); S(`el${n}`, -1.35 * e, 0, 0); S(`hd${n}`, -0.3 * e, 0, 0);
          }
          this.visual.position.y = 0.10 * e;
        } else if (id === 'skewer') {
          // rears: the front four legs come off the ground, the two leading
          // legs cock straight up over the target
          const k = Math.min(1, this.stateTime / 0.55);
          const e = k * k * (3 - 2 * k);
          legs((n, i, s) => {
            if (i === 0) { S(`cx${n}`, -1.45 * e, 0.25 * s * e, 0); S(`kn${n}`, 1.30 * e, 0, 0); S(`ft${n}`, -0.55 * e, 0, 0); }
            else if (i === 1) { S(`cx${n}`, -0.75 * e, 0.15 * s * e, 0); S(`kn${n}`, 0.55 * e, 0, 0); S(`ft${n}`, -0.10 * e, 0, 0); }
            else { S(`cx${n}`, 0.30 * e, 0, 0); S(`kn${n}`, -0.55 * e, 0, 0); S(`ft${n}`, 0.55 * e, 0, 0); }
          });
          S('body', -0.55 * e, 0, 0);
          S('abdo', 0.35 * e, 0, 0);
          S('abdo2', 0.20 * e, 0, 0);
          S('spine', 0.30 * e, 0, 0);
          S('chest', 0.24 * e, 0, 0);
          S('neck', -0.20 * e, 0, 0);
          S('head', -0.16 * e, 0, 0);
          S('jaw', 0.85 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`sh${n}`, -2.05 * e, 0, 0.45 * s * e); S(`el${n}`, -0.9 * e, 0, 0);
          }
          this.visual.position.y = 0.42 * e;
        } else {
          // rake: both arms cocked back over the shoulders, grin wide
          const k = Math.min(1, this.stateTime / 0.32);
          const e = k * k * (3 - 2 * k);
          stance(1);
          legs((n, i, s) => { S(`kn${n}`, -0.10 - 0.18 * e, 0, 0); S(`ft${n}`, 0.12 + 0.22 * e, 0, 0); });
          S('body', 0.12 * e, 0, 0);
          S('spine', -0.28 * e, -0.10 * e, 0);
          S('chest', -0.20 * e, -0.14 * e, 0);
          S('neck', 0.18 * e, 0.12 * e, 0);
          S('head', -0.22 * e, 0.16 * e, 0);
          S('jaw', 0.80 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`sh${n}`, -2.35 * e, 0, 0.60 * s * e);
            S(`el${n}`, -1.55 * e, 0, 0);
            S(`hd${n}`, -0.45 * e, 0, 0);
          }
          this.visual.position.y = -0.12 * e;
        }
        break;
      }
      case 'attack': {
        const id = this.attackId;
        if (id === 'webshot') {
          // one hard abdominal contraction that spits the thread
          const k = Math.min(1, this.stateTime / 0.20);
          const e = 1 - Math.pow(1 - k, 3);
          stance(1);
          S('body', -0.30 + 0.32 * e, 0, 0);
          S('abdo', -0.95 + 0.75 * e, 0, 0);
          S('abdo2', -0.55 + 0.85 * e, 0, 0);
          S('spine', 0.22 - 0.34 * e, 0, 0);
          S('chest', 0.16 - 0.26 * e, 0, 0);
          S('neck', -0.14 + 0.24 * e, 0, 0);
          S('head', -0.10 + 0.30 * e, 0, 0);
          S('jaw', 0.9, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`sh${n}`, -0.95 + 0.55 * e, 0, (0.75 - 0.35 * e) * s);
            S(`el${n}`, -1.35 + 0.5 * e, 0, 0);
          }
          this.visual.position.y = 0.10 - 0.10 * e;
        } else if (id === 'skewer') {
          // the two front legs come down like pile drivers
          const k = Math.min(1, this.stateTime / 0.18);
          const e = 1 - Math.pow(1 - k, 4);
          legs((n, i, s) => {
            if (i === 0) { S(`cx${n}`, -1.45 + 2.55 * e, 0.25 * s * (1 - e), 0); S(`kn${n}`, 1.30 - 1.85 * e, 0, 0); S(`ft${n}`, -0.55 + 0.9 * e, 0, 0); }
            else if (i === 1) { S(`cx${n}`, -0.75 + 1.05 * e, 0, 0); S(`kn${n}`, 0.55 - 0.85 * e, 0, 0); S(`ft${n}`, -0.10 + 0.4 * e, 0, 0); }
            else { S(`cx${n}`, 0.30 - 0.30 * e, 0, 0); S(`kn${n}`, -0.55 + 0.45 * e, 0, 0); S(`ft${n}`, 0.55 - 0.43 * e, 0, 0); }
          });
          S('body', -0.55 + 0.85 * e, 0, 0);
          S('abdo', 0.35 - 0.55 * e, 0, 0);
          S('abdo2', 0.20 - 0.30 * e, 0, 0);
          S('spine', 0.30 - 0.55 * e, 0, 0);
          S('chest', 0.24 - 0.45 * e, 0, 0);
          S('neck', -0.20 + 0.45 * e, 0, 0);
          S('head', -0.16 + 0.50 * e, 0, 0);
          S('jaw', 0.9, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`sh${n}`, -2.05 + 1.85 * e, 0, 0.45 * s); S(`el${n}`, -0.9 + 0.4 * e, 0, 0);
          }
          this.visual.position.y = 0.42 - 0.60 * e;
        } else {
          // rake: both clawed arms come across in one scything sweep
          const k = Math.min(1, this.stateTime / 0.16);
          const e = 1 - Math.pow(1 - k, 3);
          stance(1);
          S('body', 0.12 - 0.10 * e, 0, 0);
          S('spine', -0.28 + 0.50 * e, -0.10 + 0.22 * e, 0);
          S('chest', -0.20 + 0.42 * e, -0.14 + 0.30 * e, 0);
          S('neck', 0.18 - 0.30 * e, 0.12 - 0.24 * e, 0);
          S('head', -0.22 + 0.40 * e, 0.16 - 0.32 * e, 0);
          S('jaw', 0.95, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`sh${n}`, -2.35 + 3.30 * e, 0, (0.60 - 1.05 * e) * s);
            S(`el${n}`, -1.55 + 1.25 * e, 0, 0);
            S(`hd${n}`, -0.45 + 0.90 * e, 0, 0);
          }
          this.visual.position.y = -0.12 + 0.12 * e;
        }
        break;
      }
      case 'flinch': {
        const k = Math.exp(-this.stateTime * 8) * (1 - Math.min(1, this.stateTime / 0.35));
        const sh = Math.sin(this.stateTime * 45) * k;
        stance(1);
        legs((n, i, s) => { S(`kn${n}`, -0.10 - 0.25 * k, sh * 0.1, 0); S(`ft${n}`, 0.12 + 0.3 * k, 0, 0); });
        S('spine', 0.30 * k, sh * 0.35, 0);
        S('chest', 0.22 * k, sh * 0.25, 0);
        S('neck', -0.35 * k, sh * 0.4, 0);
        S('head', 0.40 * k, sh * 0.5, 0.3 * k);
        S('jaw', 0.85 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, -0.6 * k, 0, 0.7 * s * k); S(`el${n}`, -1.3, 0, 0);
        }
        break;
      }
      case 'stagger': {
        const k = Math.min(1, this.stateTime / 0.22) * Math.max(0, 1 - this.stateTime / 2.4);
        // the legs buckle outward and the torso folds forward off the body
        legs((n, i, s) => {
          S(`cx${n}`, 0.40 * k, 0.35 * s * k, 0);
          S(`kn${n}`, -1.05 * k, 0, 0);
          S(`ft${n}`, 0.95 * k, 0, 0);
        });
        S('body', 0.28 * k, 0.18 * k, 0.20 * k);
        S('abdo', 0.22 * k, -0.25 * k, 0);
        S('abdo2', 0.15 * k, -0.30 * k, 0);
        S('spine', 0.55 * k, 0.30 * k, 0);
        S('chest', 0.40 * k, 0.20 * k, 0);
        S('neck', -0.45 * k, 0.25 * k, 0);
        S('head', 0.55 * k, 0.20 * k, 0.35 * k);
        S('jaw', 1.0 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, 0.85 * k, 0, 0.85 * s * k); S(`el${n}`, -0.55, 0, 0); S(`hd${n}`, 0.3 * k, 0, 0);
        }
        this.visual.position.y = -0.34 * k;
        break;
      }
      case 'death': {
        const k = Math.min(1, this.stateTime / 0.9);
        const e = 1 - Math.pow(1 - k, 3);
        // legs curl in over the body the way a dead spider's do
        legs((n, i, s) => {
          S(`cx${n}`, -0.55 * e, -0.45 * s * e, 0);
          S(`kn${n}`, 1.75 * e, 0, 0);
          S(`ft${n}`, -1.55 * e, 0, 0);
        });
        this.visual.rotation.z = e * 0.55;
        this.visual.position.y = -0.62 * e;
        S('body', 0.30 * e, 0, 0);
        S('abdo', 0.25 * e, 0, 0);
        S('spine', 0.70 * e, 0.2 * e, 0);
        S('chest', 0.45 * e, 0, 0);
        S('neck', -0.55 * e, 0, 0);
        S('head', 0.6 * e, 0.3 * e, 0);
        S('jaw', 0.9 * e, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, 1.05 * e, 0, 0.6 * s * e); S(`el${n}`, -0.4, 0, 0);
        }
        break;
      }
      default: {
        // idle: the legs tick and shift, the torso sways like something
        // balanced on top of a body it does not belong to
        const b = Math.sin(t * 1.5) * 0.04;
        legs((n, i, s, grp) => {
          const tick = Math.sin(t * 1.1 + i * 1.3 + grp * 2.0) * 0.06;
          S(`cx${n}`, 0, tick * s, 0);
          S(`kn${n}`, -0.10 + tick, 0, 0);
          S(`ft${n}`, 0.12 - tick, 0, 0);
        });
        S('body', 0.02 + b * 0.4, Math.sin(t * 0.4) * 0.05, 0);
        S('abdo', -0.04 + b, 0, 0);
        S('abdo2', 0.03 + b * 0.5, 0, 0);
        S('spine', -0.12 + b, Math.sin(t * 0.33) * 0.12, 0);
        S('chest', -0.08 + b * 0.6, Math.sin(t * 0.33 + 0.4) * 0.10, 0);
        S('neck', 0.16, Math.sin(t * 0.27) * 0.16, 0);
        S('head', 0.04 + b, Math.sin(t * 0.23) * 0.24, Math.sin(t * 0.19) * 0.14);
        S('jaw', 0.22 + Math.max(0, Math.sin(t * 0.9)) * 0.22, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, 0.30 + b, 0, 0.26 * s);
          S(`el${n}`, -0.85 + b * 0.5, 0, 0);
          S(`hd${n}`, 0.22, 0, 0);
        }
        this.visual.position.y = 0;
        this.visual.rotation.z = 0;
        break;
      }
    }
  }
}

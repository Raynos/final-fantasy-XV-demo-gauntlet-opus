import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.ts';
import { Enemy, metalNormal, metalRoughness } from './EnemyBase.ts';
import { tube, blob, slab, spike, place, tint, glow, rectCross, loft, circleCross } from '../../combat/GeoKit.ts';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

const LACQUER = 0x342830;
const LACQUER_RED = 0x6d1c22;
const LACQUER_HI = 0x4b3a44;
const CORD = 0x52403f;
const TRIM = 0x8c7742;
const HAORI = 0x64515a;
const STEEL = 0xb2bcc4;
const VOID = 0x000000;
const EMBER = 0xd8200a;

/**
 * Ronin — the swordsman daemon. A hollow suit of lacquered black-and-red
 * plate under a horned kabuto, a menpo mask closed over nothing at all, a
 * tattered haori hanging off the shoulders, and a long katana carried in a
 * formal iai stance. It floats an inch clear of the ground and it does not
 * fidget: it simply stands, blade hand on the hilt, and anything that swings
 * at it during that stillness is cut down in a single frame.
 */
export const RONIN = {
  key: 'ronin',
  questId: 'ronin',
  faction: 'daemon',
  expClass: 'daemon',
  stats: {
    name: 'Ronin', hp: 7200, poise: 200, speed: 4.0, attackRange: 3.4,
    aggroRange: 30, radius: 0.5, height: 2.0, damage: 420, level: 45,
  },
  weakness: 'light',
  resist: 'dark',
  resistPct: { light: 190, dark: 0, ice: 70 },
  weakTo: ['greatsword'],
  resistsWeapon: ['firearm'],
  // it shrugs off chip damage, so when its poise finally breaks it stays open
  staggerDuration: 3.0,
  senses: { sight: 30, fov: 2.0, hearing: 20, nocturnal: true },
  drops: [
    { id: 'rusted_bit', chance: 0.6, count: 1 },
    { id: 'dark_matter_shard', chance: 0.14, count: 1 },
  ],
  timing: { telegraph: 0.5, strike: 0.18, attack: 0.6, recover: 0.85 },
  attacks: [
    // the signature: a very long motionless stance, then one instant cut
    { id: 'iai', range: 4.8, weight: 3, mult: 2.2, poise: 95, hitRadius: 3.6, arc: 1.9,
      telegraph: 1.4, strike: 0.05, attack: 0.5, recover: 1.4, cooldown: 6.5,
      tracking: 0.2, unblockable: true },
    { id: 'slash', range: 3.4, weight: 4, mult: 0.85, poise: 30, hitRadius: 2.5, arc: 1.5,
      telegraph: 0.42, strike: 0.16, attack: 0.66, recover: 0.7, cooldown: 1.3 },
    { id: 'sweep', range: 3.2, weight: 2, mult: 1.1, poise: 45, hitRadius: 2.9, aoe: true,
      telegraph: 0.55, strike: 0.20, attack: 0.62, recover: 0.95, cooldown: 3.4 },
  ],
  buildPrototype,
  make(opts) { return new RoninEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('pelvis', 'root', [0, 0.98, 0]);
  rig.bone('spine', 'pelvis', [0, 1.21, -0.01]);
  rig.bone('chest', 'spine', [0, 1.45, -0.02]);
  rig.bone('neck', 'chest', [0, 1.65, 0]);
  rig.bone('head', 'neck', [0, 1.77, 0.01]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`sh${n}`, 'chest', [0.24 * s, 1.57, 0]);
    rig.bone(`el${n}`, `sh${n}`, [0.34 * s, 1.22, 0.04]);
    rig.bone(`hd${n}`, `el${n}`, [0.36 * s, 0.94, 0.14]);
    rig.bone(`hr${n}`, 'chest', [0.30 * s, 1.54, -0.06]);
    rig.bone(`hp${n}`, 'pelvis', [0.135 * s, 0.95, 0]);
    rig.bone(`kn${n}`, `hp${n}`, [0.145 * s, 0.54, 0.04]);
    rig.bone(`ft${n}`, `kn${n}`, [0.145 * s, 0.12, -0.01]);
  }

  /* ---- the do: a lacquered cuirass over nothing ---- */
  const cuirass = loft(rectCross(0.34, 14), [
    { y: 0.90, sx: 0.175, sz: 0.135 },
    { y: 1.14, sx: 0.180, sz: 0.140 },
    { y: 1.40, sx: 0.215, sz: 0.155 },
    { y: 1.58, sx: 0.190, sz: 0.135 },
  ]);
  rig.attachBlend(tint(cuirass, LACQUER, 0.04), 'pelvis', 'chest', 1.4);

  // lacing rows: the horizontal banding that says "samurai" at silhouette range
  for (let i = 0; i < 5; i++) {
    const y = 1.06 + i * 0.105;
    const band = place(slab(0.40 + (i > 2 ? 0.04 : 0), 0.038, 0.30, 0.012), { pos: [0, y, 0] });
    rig.attach(tint(band, i % 2 ? LACQUER_RED : LACQUER_HI, 0.04), i < 2 ? 'pelvis' : i < 4 ? 'spine' : 'chest');
  }
  const breast = place(slab(0.40, 0.22, 0.30, 0.035), { pos: [0, 1.46, 0] });
  rig.attach(tint(breast, LACQUER_RED, 0.04), 'chest');
  const gorget = place(slab(0.26, 0.08, 0.22, 0.02), { pos: [0, 1.62, 0] });
  rig.attach(tint(gorget, LACQUER_HI), 'chest');

  // kusazuri: the hanging skirt plates
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.72;
    const p = place(slab(0.17, 0.30, 0.035, 0.012), {
      pos: [Math.sin(a) * 0.24, 0.79, Math.cos(a) * 0.24], rot: [0.14, a, 0],
    });
    rig.attach(tint(p, i % 2 ? LACQUER : LACQUER_RED, 0.04), 'pelvis');
  }
  const obi = place(slab(0.42, 0.11, 0.32, 0.02), { pos: [0, 0.96, 0] });
  rig.attach(tint(obi, CORD, 0.05), 'pelvis');

  /* ---- the emptiness inside ---- */
  const hollowNeck = place(loft(circleCross(8), [{ y: 1.56, sx: 0.085 }, { y: 1.72, sx: 0.080 }]), {});
  rig.attachBlend(tint(hollowNeck, VOID), 'chest', 'head', 1.0);
  const hollowFace = place(blob(0.105, 0.115, 0.070, 8, 6), { pos: [0, 1.79, 0.045] });
  rig.attach(tint(hollowFace, VOID), 'head');

  /* ---- kabuto and menpo ---- */
  const bowl = place(blob(0.145, 0.135, 0.155, 11, 8), { pos: [0, 1.85, -0.01] });
  rig.attach(tint(bowl, LACQUER, 0.03), 'head');
  const rivet = place(slab(0.030, 0.20, 0.30, 0.01), { pos: [0, 1.93, -0.01] });
  rig.attach(tint(rivet, LACQUER_HI), 'head');
  // shikoro: the flared neck guard at the back of the helm
  for (let i = 0; i < 3; i++) {
    const g = place(slab(0.32 - i * 0.02, 0.055, 0.05, 0.012),
      { pos: [0, 1.79 - i * 0.055, -0.16 - i * 0.035], rot: [0.55 + i * 0.12, 0, 0] });
    rig.attach(tint(g, LACQUER_HI, 0.04), 'head');
  }
  // maedate: the great crescent of horns off the brow
  for (const s of [-1, 1]) {
    const horn = place(spike(0.028, 0.34, 6), { pos: [0.075 * s, 1.94, 0.03], rot: [-0.30, 0, 0.72 * s] });
    rig.attach(tint(horn, TRIM), 'head');
    const horn2 = place(spike(0.020, 0.13, 5), { pos: [0.135 * s, 1.88, -0.02], rot: [0.1, 0, 1.25 * s] });
    rig.attach(tint(horn2, TRIM), 'head');
  }
  const brow = place(slab(0.28, 0.045, 0.10, 0.012), { pos: [0, 1.845, 0.115], rot: [0.30, 0, 0] });
  rig.attach(tint(brow, LACQUER_HI), 'head');
  // menpo: the snarling half-mask over the lower face
  const menpo = place(blob(0.105, 0.095, 0.085, 9, 6), { pos: [0, 1.745, 0.055] });
  rig.attach(tint(menpo, LACQUER_RED, 0.03), 'head');
  const chin = place(slab(0.14, 0.06, 0.10, 0.02), { pos: [0, 1.685, 0.075], rot: [-0.35, 0, 0] });
  rig.attach(tint(chin, LACQUER, 0.03), 'head');
  for (let i = 0; i < 4; i++) {
    const t = place(spike(0.010, 0.032, 4), { pos: [(i - 1.5) * 0.032, 1.735, 0.115], rot: [Math.PI - 0.2, 0, 0] });
    rig.attach(tint(t, TRIM), 'head');
  }
  // two coals burning in the dark under the brow
  for (const s of [-1, 1]) {
    const e = place(blob(0.026, 0.016, 0.014, 6, 4), { pos: [0.052 * s, 1.812, 0.098] });
    rig.attach(glow(tint(e, 0x1a0301), EMBER, 3.2), 'head');
  }

  /* ---- arms: sode, kote, empty gauntlets ---- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const sode = place(slab(0.20, 0.24, 0.20, 0.03), { pos: [0.29 * s, 1.53, 0], rot: [0, 0, -0.30 * s] });
    rig.attach(tint(sode, LACQUER_RED, 0.04), `sh${n}`);
    const sode2 = place(slab(0.19, 0.10, 0.19, 0.02), { pos: [0.31 * s, 1.40, 0.01], rot: [0, 0, -0.34 * s] });
    rig.attach(tint(sode2, LACQUER, 0.04), `sh${n}`);
    const up = tube([P(0.24 * s, 1.55, 0), P(0.30 * s, 1.38, 0.02), P(0.34 * s, 1.23, 0.04)],
      [0.058, 0.050, 0.043], { radialSeg: 7 });
    rig.attachBlend(tint(up, LACQUER_HI, 0.04), `sh${n}`, `el${n}`, 1.0);
    const lo = tube([P(0.34 * s, 1.23, 0.04), P(0.35 * s, 1.08, 0.09), P(0.36 * s, 0.95, 0.14)],
      [0.045, 0.041, 0.036], { radialSeg: 7 });
    rig.attachBlend(tint(lo, LACQUER, 0.04), `el${n}`, `hd${n}`, 1.0);
    const kote = place(slab(0.10, 0.20, 0.09, 0.02), { pos: [0.375 * s, 1.10, 0.10], rot: [0.28, 0, 0] });
    rig.attach(tint(kote, LACQUER_HI, 0.04), `el${n}`);
    const fist = place(blob(0.048, 0.052, 0.048, 7, 5), { pos: [0.365 * s, 0.92, 0.16] });
    rig.attach(tint(fist, LACQUER, 0.03), `hd${n}`);
  }

  /* ---- legs: haidate and suneate over nothing, feet hanging clear ---- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const thigh = tube([P(0.135 * s, 0.95, 0), P(0.14 * s, 0.75, 0.03), P(0.145 * s, 0.56, 0.04)],
      [0.085, 0.078, 0.062], { radialSeg: 7 });
    rig.attachBlend(tint(thigh, LACQUER, 0.04), `hp${n}`, `kn${n}`, 1.0);
    const shin = tube([P(0.145 * s, 0.54, 0.04), P(0.145 * s, 0.34, 0.02), P(0.145 * s, 0.16, -0.01)],
      [0.060, 0.055, 0.046], { radialSeg: 7 });
    rig.attachBlend(tint(shin, LACQUER_HI, 0.04), `kn${n}`, `ft${n}`, 1.0);
    const suneate = place(slab(0.11, 0.32, 0.06, 0.015), { pos: [0.145 * s, 0.35, 0.06] });
    rig.attach(tint(suneate, LACQUER_RED, 0.04), `kn${n}`);
    const foot = place(slab(0.11, 0.07, 0.24, 0.02), { pos: [0.145 * s, 0.09, 0.05] });
    rig.attach(tint(foot, CORD, 0.04), `ft${n}`);
  }

  /* ---- the haori: strips of rotted cloth off both shoulders ---- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    for (let i = 0; i < 7; i++) {
      const u = i / 6;
      const x = (0.10 + u * 0.24) * s;
      const drop = 0.44 + ((i * 5) % 3) * 0.16;
      const strip = tube([
        P(x, 1.56, -0.10 - u * 0.04),
        P(x * 1.08, 1.56 - drop * 0.55, -0.16 - u * 0.05),
        P(x * 1.12, 1.56 - drop, -0.13 - u * 0.05),
      ], [[0.055, 0.014], [0.048, 0.012], [0.018, 0.006]], { radialSeg: 4 });
      rig.attach(tint(strip, HAORI, 0.07), `hr${n}`);
    }
    const collar = place(slab(0.16, 0.09, 0.12, 0.02), { pos: [0.18 * s, 1.60, -0.06], rot: [0.2, 0, 0.2 * s] });
    rig.attach(tint(collar, HAORI, 0.05), `hr${n}`);
  }

  /* ---- the saya, thrust through the obi at the left hip ---- */
  const saya = tube([P(-0.20, 0.93, -0.24), P(-0.13, 0.98, 0.16), P(-0.06, 1.06, 0.52)],
    [0.036, 0.034, 0.030], { radialSeg: 7 });
  rig.attach(tint(saya, LACQUER, 0.03), 'pelvis');
  const sayaTip = place(blob(0.032, 0.032, 0.045, 6, 5), { pos: [-0.225, 0.915, -0.28] });
  rig.attach(tint(sayaTip, TRIM), 'pelvis');

  /* ---- the katana, gripped in the right fist ---- */
  const swordParts = [];
  const tsuka = tube([P(0.40, 0.86, -0.16), P(0.40, 0.90, 0.10)], [0.028, 0.026], { radialSeg: 7 });
  swordParts.push(tint(tsuka, CORD, 0.06));
  // ito: the diamond binding down the grip
  for (let i = 0; i < 4; i++) {
    const z = -0.13 + i * 0.062;
    const wrap = tube([P(0.40, 0.876 + i * 0.0095, z - 0.008), P(0.40, 0.882 + i * 0.0095, z + 0.008)],
      [0.033, 0.033], { radialSeg: 5 });
    swordParts.push(tint(wrap, LACQUER_HI));
  }
  const tsuba = place(slab(0.13, 0.13, 0.016, 0.02), { pos: [0.40, 0.905, 0.13], rot: [1.5708, 0, 0] });
  swordParts.push(tint(tsuba, TRIM));
  const blade = tube([
    P(0.40, 0.915, 0.17), P(0.40, 0.955, 0.55), P(0.40, 1.035, 0.92),
    P(0.40, 1.155, 1.24), P(0.40, 1.255, 1.42),
  ], [[0.013, 0.052], [0.013, 0.054], [0.012, 0.050], [0.010, 0.040], [0.004, 0.014]], { radialSeg: 6 });
  swordParts.push(tint(blade, STEEL, 0.05));
  const hamon = tube([P(0.40, 0.885, 0.19), P(0.40, 1.005, 0.92), P(0.40, 1.222, 1.40)],
    [[0.014, 0.008], [0.013, 0.008], [0.005, 0.004]], { radialSeg: 4 });
  swordParts.push(glow(tint(hamon, 0x1c0402), EMBER, 0.9));
  const kashira = place(blob(0.032, 0.030, 0.032, 6, 5), { pos: [0.40, 0.855, -0.19] });
  swordParts.push(tint(kashira, TRIM));
  for (const g of swordParts) rig.attach(g, 'hdR');

  const mat = creatureMaterial({
    roughness: 0.44, metalness: 0.32,
    rim: { color: 0x9a6a72, strength: 0.055 },
    normalMap: metalNormal(), normalScale: 0.28, roughnessMap: metalRoughness(),
  });
  return rig.build(mat, { radius: 3.0 });
}

class RoninEnemy extends Enemy {
  constructor(opts) { super(RONIN, opts); }

  /** World-space blade tip, for the draw-cut sweep and trail. */
  bladeTip(out = new THREE.Vector3()) {
    const b = this.rig && this.rig.byName.get('hdR');
    if (!b) return this.centre(out);
    b.updateWorldMatrix(true, false);
    return out.set(0.04, 0.315, 1.28).applyMatrix4(b.matrixWorld);
  }

  pose(state, t) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n, x, y, z) => poseBone(rig, n, x, y, z);
    /** The resting iai stance: blade hand drawn back to the left hip. */
    const stance = (k = 1) => {
      S('shR', -0.30 * k, -0.55 * k, 0.85 * k);
      S('elR', -1.35 * k, -0.35 * k, 0);
      S('hdR', 0.10 * k, 0.35 * k, 0);
      S('shL', 0.20 * k, -0.30 * k, 0.55 * k);
      S('elL', -1.15 * k, 0, 0);
      S('hdL', 0, 0, 0);
      S('spine', 0.03 * k, -0.22 * k, 0);
      S('chest', 0.02 * k, -0.18 * k, 0);
      S('neck', 0, 0.20 * k, 0);
      S('head', 0, 0.18 * k, 0);
    };
    /** Feet hang: nothing carries weight, so the legs never straighten. */
    const hang = (k = 1, sway = 0) => {
      for (const s of [-1, 1]) {
        const n = s < 0 ? 'L' : 'R';
        S(`hp${n}`, (0.06 + sway * (s < 0 ? 1 : -1)) * k, 0, 0.04 * s * k);
        S(`kn${n}`, 0.22 * k, 0, 0);
        S(`ft${n}`, -0.30 * k, 0, 0);
        S(`hr${n}`, 0.10 * k, 0, 0);
      }
    };

    switch (state) {
      case 'run':
      case 'approach': {
        // it does not walk — it glides, and the haori and legs trail behind
        const ph = t * 3.4;
        const sway = Math.sin(ph) * 0.16;
        stance(1);
        hang(1, sway);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hr${n}`, 0.34 + Math.sin(ph + (s < 0 ? 0 : 0.6)) * 0.12, Math.sin(ph * 0.7) * 0.10, 0);
        }
        S('spine', 0.10, -0.22 + Math.sin(ph * 0.5) * 0.05, 0);
        S('chest', 0.06, -0.18, 0);
        S('head', -0.06, 0.18, Math.sin(ph * 0.5) * 0.03);
        this.visual.position.y = 0.03 + Math.sin(ph) * 0.035;
        this.visual.rotation.z = Math.sin(ph * 0.5) * 0.02;
        break;
      }
      case 'telegraph': {
        const id = this.attackId;
        if (id === 'iai') {
          // THE tell: it settles into the draw stance and then does not move.
          // No sines, no breathing, no drift — 1.4 s of absolute stillness.
          const k = Math.min(1, this.stateTime / 0.18);
          const e = k * k * (3 - 2 * k);
          S('shR', -0.30 - 0.35 * e, -0.55 - 0.55 * e, 0.85 + 0.30 * e);
          S('elR', -1.35 - 0.35 * e, -0.35 - 0.30 * e, 0);
          S('hdR', 0.10 + 0.12 * e, 0.35 + 0.25 * e, 0);
          S('shL', 0.20 - 0.55 * e, -0.30 - 0.35 * e, 0.55 + 0.15 * e);
          S('elL', -1.15 - 0.45 * e, 0, 0);
          S('hdL', 0.10 * e, 0.2 * e, 0);
          S('pelvis', 0, -0.30 * e, 0);
          S('spine', 0.03 + 0.05 * e, -0.22 - 0.28 * e, 0);
          S('chest', 0.02 + 0.03 * e, -0.18 - 0.22 * e, 0);
          S('neck', 0, 0.20 + 0.30 * e, 0);
          S('head', -0.04 * e, 0.18 + 0.32 * e, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, (s < 0 ? 0.12 : -0.02) * e, 0, 0.05 * s * e);
            S(`kn${n}`, 0.26 * e, 0, 0);
            S(`ft${n}`, -0.32 * e, 0, 0);
            S(`hr${n}`, 0.06 * e, 0, 0);
          }
          this.visual.position.y = 0.025;
          this.visual.rotation.z = 0;
        } else if (id === 'sweep') {
          // blade drops to the ankles, edge outward
          const k = Math.min(1, this.stateTime / 0.35);
          const e = k * k * (3 - 2 * k);
          hang(1);
          S('shR', -0.30 + 0.55 * e, -0.55 - 0.75 * e, 0.85 + 0.45 * e);
          S('elR', -1.35 + 0.85 * e, -0.35 - 0.40 * e, 0);
          S('hdR', 0.10 + 0.55 * e, 0.35 + 0.20 * e, 0);
          S('shL', 0.20 - 0.35 * e, -0.30, 0.55 + 0.30 * e);
          S('elL', -1.15 - 0.30 * e, 0, 0);
          S('spine', 0.03 + 0.22 * e, -0.22 - 0.45 * e, 0);
          S('chest', 0.02 + 0.16 * e, -0.18 - 0.32 * e, 0);
          S('neck', -0.10 * e, 0.20 + 0.40 * e, 0);
          S('head', 0.14 * e, 0.18 + 0.30 * e, 0);
          this.visual.position.y = 0.025 - 0.10 * e;
        } else {
          // slash: blade hauled up over the right shoulder, jodan-no-kamae
          const k = Math.min(1, this.stateTime / 0.28);
          const e = k * k * (3 - 2 * k);
          hang(1);
          S('shR', -0.30 - 2.35 * e, -0.55 + 0.35 * e, 0.85 - 0.55 * e);
          S('elR', -1.35 - 0.35 * e, -0.35 + 0.25 * e, 0);
          S('hdR', 0.10 - 0.35 * e, 0.35 - 0.25 * e, 0);
          S('shL', 0.20 - 1.65 * e, -0.30 + 0.30 * e, 0.55 - 0.35 * e);
          S('elL', -1.15 - 0.55 * e, 0, 0);
          S('spine', 0.03 - 0.14 * e, -0.22 - 0.30 * e, 0);
          S('chest', 0.02 - 0.10 * e, -0.18 - 0.24 * e, 0);
          S('neck', 0, 0.20 + 0.28 * e, 0);
          S('head', 0.06 * e, 0.18 + 0.26 * e, 0);
          this.visual.position.y = 0.025 + 0.06 * e;
        }
        break;
      }
      case 'attack': {
        const id = this.attackId;
        if (id === 'iai') {
          // one frame. The blade is drawn and the cut is already finished.
          const k = Math.min(1, this.stateTime / 0.05);
          const e = k * k;
          const follow = Math.min(1, Math.max(0, this.stateTime - 0.05) / 0.35);
          S('shR', -0.65 + 1.05 * e, -1.10 + 1.95 * e, 1.15 - 0.95 * e);
          S('elR', -1.70 + 1.30 * e, -0.65 + 0.85 * e, 0);
          S('hdR', 0.22 - 0.30 * e, 0.60 - 0.85 * e, 0);
          S('shL', -0.35 + 0.35 * e, -0.65 + 0.55 * e, 0.70 - 0.30 * e);
          S('elL', -1.60 + 0.55 * e, 0, 0);
          S('pelvis', 0, -0.30 + 0.75 * e, 0);
          S('spine', 0.08, -0.50 + 0.95 * e, 0);
          S('chest', 0.05, -0.40 + 0.78 * e, 0);
          S('neck', 0, 0.50 - 0.65 * e, 0);
          S('head', -0.04, 0.50 - 0.62 * e, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`hp${n}`, (s < 0 ? 0.12 : -0.02) + 0.10 * e, 0, 0.05 * s);
            S(`kn${n}`, 0.26 + 0.10 * e, 0, 0);
            S(`ft${n}`, -0.32, 0, 0);
            // the haori snaps out on the follow-through and settles
            S(`hr${n}`, 0.06 + 0.55 * e * (1 - follow), -0.35 * e * (1 - follow) * s, 0);
          }
          this.visual.position.y = 0.025;
          break;
        }
        if (id === 'sweep') {
          // a low, flat cut through the ankles
          const k = Math.min(1, this.stateTime / 0.19);
          const e = 1 - Math.pow(1 - k, 3);
          hang(1);
          S('shR', 0.25 + 0.30 * e, -1.30 + 2.30 * e, 1.30 - 0.55 * e);
          S('elR', -0.50 - 0.15 * e, -0.75 + 1.05 * e, 0);
          S('hdR', 0.65 - 0.20 * e, 0.55 - 0.70 * e, 0);
          S('shL', -0.15 + 0.20 * e, -0.30 + 0.35 * e, 0.85 - 0.35 * e);
          S('elL', -1.45 + 0.45 * e, 0, 0);
          S('spine', 0.25 - 0.06 * e, -0.67 + 1.05 * e, 0);
          S('chest', 0.18 - 0.04 * e, -0.50 + 0.85 * e, 0);
          S('neck', -0.10, 0.60 - 0.75 * e, 0);
          S('head', 0.14, 0.48 - 0.60 * e, 0);
          this.visual.position.y = -0.075 + 0.05 * e;
          break;
        }
        // slash: a two-hit combo — down-cut, then a rising return cut
        const beat = this.stateTime < 0.30 ? 0 : 1;
        const local = beat === 0 ? this.stateTime / 0.20 : (this.stateTime - 0.30) / 0.20;
        const k = Math.min(1, Math.max(0, local));
        const e = 1 - Math.pow(1 - k, 3);
        hang(1);
        if (beat === 0) {
          S('shR', -2.65 + 3.30 * e, -0.20 + 0.35 * e, 0.30 - 0.10 * e);
          S('elR', -1.70 + 1.35 * e, -0.10, 0);
          S('hdR', -0.25 + 0.15 * e, 0.10, 0);
          S('shL', -1.45 + 1.85 * e, 0, 0.20);
          S('elL', -1.70 + 0.85 * e, 0, 0);
          S('spine', -0.11 + 0.32 * e, -0.52 + 0.80 * e, 0);
          S('chest', -0.08 + 0.24 * e, -0.42 + 0.66 * e, 0);
          S('neck', 0, 0.48 - 0.55 * e, 0);
          S('head', 0.06, 0.44 - 0.52 * e, 0);
        } else {
          // the return: a rising cut back across the other diagonal
          S('shR', 0.65 - 1.75 * e, 0.15 - 0.85 * e, 0.20 + 0.55 * e);
          S('elR', -0.35 - 0.55 * e, -0.10 - 0.35 * e, 0);
          S('hdR', -0.10 + 0.30 * e, 0.10 + 0.20 * e, 0);
          S('shL', 0.40 - 0.60 * e, 0, 0.20 + 0.25 * e);
          S('elL', -0.85 - 0.35 * e, 0, 0);
          S('spine', 0.21 - 0.30 * e, 0.28 - 0.60 * e, 0);
          S('chest', 0.16 - 0.22 * e, 0.24 - 0.48 * e, 0);
          S('neck', 0, -0.07 + 0.30 * e, 0);
          S('head', 0.06, -0.08 + 0.28 * e, 0);
        }
        this.visual.position.y = 0.025;
        break;
      }
      case 'flinch': {
        // the armour rings but barely moves — this thing has super armour
        const k = Math.exp(-this.stateTime * 11) * (1 - Math.min(1, this.stateTime / 0.3));
        stance(1);
        hang(1);
        S('spine', 0.03 + 0.10 * k, -0.22 + Math.sin(this.stateTime * 50) * 0.10 * k, 0);
        S('chest', 0.02 + 0.07 * k, -0.18, 0.06 * k);
        S('head', -0.12 * k, 0.18 + 0.12 * k, 0);
        this.visual.position.y = 0.025;
        break;
      }
      case 'stagger': {
        // guard broken: the suit sags on its strings, blade arm dropped
        const k = Math.min(1, this.stateTime / 0.25) * Math.max(0, 1 - this.stateTime / 3.0);
        S('pelvis', 0.12 * k, 0.18 * k, 0);
        S('spine', 0.45 * k, 0.26 * k, 0.16 * k);
        S('chest', 0.32 * k, 0.18 * k, 0.12 * k);
        S('neck', -0.35 * k, 0.20 * k, 0);
        S('head', 0.55 * k, 0.24 * k, 0.28 * k);
        S('shR', 0.75 * k, -0.20 * k, 0.55 * k);
        S('elR', -0.35 * k, 0, 0);
        S('hdR', 0.25 * k, 0, 0);
        S('shL', 0.65 * k, 0, -0.60 * k);
        S('elL', -0.30 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, 0.30 * k, 0, 0.10 * s * k);
          S(`kn${n}`, 0.65 * k, 0, 0);
          S(`ft${n}`, -0.45 * k, 0, 0);
          S(`hr${n}`, 0.30 * k, 0, 0);
        }
        this.visual.position.y = 0.025 - 0.20 * k;
        break;
      }
      case 'death': {
        // the plate loses whatever was holding it up and folds into a heap
        const k = Math.min(1, this.stateTime / 0.75);
        const e = 1 - Math.pow(1 - k, 3);
        this.visual.rotation.x = e * 1.25;
        this.visual.position.y = 0.025 - 0.55 * e;
        S('pelvis', -0.25 * e, 0, 0);
        S('spine', 0.65 * e, 0.15 * e, 0);
        S('chest', 0.45 * e, 0, 0.20 * e);
        S('neck', -0.45 * e, 0, 0);
        S('head', 0.70 * e, 0.25 * e, 0.35 * e);
        S('shR', 1.10 * e, -0.30 * e, 0.75 * e);
        S('elR', -0.25 * e, 0, 0);
        S('shL', 1.00 * e, 0, -0.80 * e);
        S('elL', -0.20 * e, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hp${n}`, -0.85 * e, 0, 0.20 * s * e);
          S(`kn${n}`, 1.55 * e, 0, 0);
          S(`ft${n}`, -0.40 * e, 0, 0);
          S(`hr${n}`, 0.45 * e, 0, 0);
        }
        break;
      }
      default: {
        // idle: it hangs in the air and only the haori and the float move
        const b = Math.sin(t * 0.7) * 0.012;
        stance(1);
        hang(1);
        S('spine', 0.03 + b, -0.22, 0);
        S('chest', 0.02 + b * 0.5, -0.18, 0);
        S('neck', 0, 0.20 + Math.sin(t * 0.21) * 0.06, 0);
        S('head', 0, 0.18 + Math.sin(t * 0.17) * 0.10, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`hr${n}`, 0.10 + Math.sin(t * 0.9 + (s < 0 ? 0 : 1.1)) * 0.07, Math.sin(t * 0.6) * 0.05, 0);
        }
        this.visual.position.y = 0.025 + Math.sin(t * 0.9) * 0.022;
        this.visual.rotation.x = 0;
        this.visual.rotation.z = 0;
        break;
      }
    }
  }
}

import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.ts';
import { Enemy, organicNormal, organicRoughness } from './EnemyBase.ts';
import { tube, blob, spike, slab, place, tint, glow } from '../../combat/GeoKit.ts';

const P = (x: any, y: any, z: any) => new THREE.Vector3(x, y, z);

/* Daemon flesh, not a colour swatch. The goblin used to be one flat violet
 * from ear to claw, which is what made it read as a purple mannequin: no value
 * change means no form, and no form means the eye sees a silhouette and stops.
 * Four values now — a bruised violet back, a sallow grey-green belly, near
 * black at the extremities, and bone. */
const SKIN = 0x39303f;        // back and outer limbs
const SKIN_PALE = 0x726c5c;   // belly, throat, inner arm — sallow, not pink
const SKIN_DARK = 0x191220;   // hands, feet, joints, the shadow side
const BLOTCH = 0x241c27;      // mottling
const RAG = 0x2b2618;
const CLAW = 0xc9c2ae;
const EYE = 0xff3018;

/**
 * Goblin — the daemon that crawls out of the dark once the sun is down.
 * Squat, top-heavy, oversized skull with a lantern-jaw grin, long swept ears,
 * spindly clawed arms. Trails miasma from the shoulders.
 */
export const GOBLIN = {
  key: 'goblin',
  questId: 'goblin',
  faction: 'daemon',
  expClass: 'daemon',
  stats: {
    name: 'Goblin', hp: 420, poise: 24, speed: 4.2, attackRange: 1.7,
    aggroRange: 22, radius: 0.42, height: 1.30, damage: 62, level: 11,
  },
  weakness: 'light',
  resistPct: { light: 185, dark: 0, fire: 110, ice: 100, lightning: 100 },
  weakTo: ['dagger'],
  senses: { sight: 22, fov: 2.2, hearing: 16, nocturnal: true },
  drops: [
    { id: 'rotten_splinterbone', chance: 0.30, count: 1 },
    { id: 'debased_coin', chance: 0.35, count: 2 },
  ],
  timing: { telegraph: 0.36, strike: 0.14, attack: 0.38, recover: 0.55 },
  attacks: [
    { id: 'claw', range: 1.9, weight: 3, mult: 1.0, poise: 8, hitRadius: 1.5,
      telegraph: 0.32, strike: 0.13, attack: 0.36, recover: 0.5, cooldown: 0.9 },
    { id: 'leap', range: 7, minRange: 3, weight: 1, mult: 1.4, poise: 16, hitRadius: 1.7,
      telegraph: 0.5, strike: 0.16, attack: 0.5, recover: 0.8, cooldown: 4, lunge: 10 },
  ],
  buildPrototype,
  make(opts: any) { return new GoblinEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('pelvis', 'root', [0, 0.60, 0]);
  rig.bone('spine', 'pelvis', [0, 0.80, -0.04]);
  rig.bone('chest', 'spine', [0, 0.98, -0.07]);
  rig.bone('neck', 'chest', [0, 1.08, -0.02]);
  rig.bone('head', 'neck', [0, 1.17, 0.03]);
  rig.bone('jaw', 'head', [0, 1.09, 0.10]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`sh${n}`, 'chest', [0.19 * s, 1.03, -0.04]);
    rig.bone(`el${n}`, `sh${n}`, [0.33 * s, 0.80, 0.04]);
    rig.bone(`hd${n}`, `el${n}`, [0.39 * s, 0.56, 0.16]);
    rig.bone(`hp${n}`, 'pelvis', [0.115 * s, 0.58, 0]);
    rig.bone(`kn${n}`, `hp${n}`, [0.135 * s, 0.32, 0.09]);
    rig.bone(`ft${n}`, `kn${n}`, [0.135 * s, 0.05, 0.01]);
  }

  /* torso — potbellied and hunched */
  const torso = tube([
    P(0, 0.55, 0.02), P(0, 0.72, 0.03), P(0, 0.88, -0.05), P(0, 1.02, -0.08),
  ], [[0.19, 0.15], [0.235, 0.20], [0.21, 0.17], [0.175, 0.14]], { radialSeg: 10 });
  rig.attachBlend(paint(torso, (x, y, z) => goblinSkin(x, y, z)), 'pelvis', 'chest', 1.3);

  const gut = place(blob(0.20, 0.16, 0.17, 10, 8), { pos: [0, 0.70, 0.07] });
  // the belly is the one pale thing on the body, so it catches bounce light and
  // gives the hunched silhouette an inside
  rig.attach(paint(gut, (x, y, z) => goblinSkin(x, y, z - 0.03)), 'pelvis');

  // spine ridge of little horns
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const q = place(spike(0.020, 0.06 + t * 0.05, 4),
      { pos: [0, 0.68 + t * 0.34, -0.14 - t * 0.02], rot: [-1.0, 0, 0] });
    rig.attach(tint(q, SKIN_DARK), t < 0.5 ? 'spine' : 'chest');
  }

  // A wrap of looted rag, hanging in torn strips of unequal length. The point
  // is the silhouette: a bare hunched body is a single smooth outline and the
  // eye slides off it, whereas a fringe that breaks the waistline tells you
  // where the hips are and that the thing dresses itself in what it kills.
  const belt = place(slab(0.36, 0.10, 0.30, 0.04), { pos: [0, 0.545, 0.005], rot: [0.08, 0, 0] });
  rig.attach(tint(belt, RAG, 0.07), 'pelvis');
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const len = 0.11 + ((i * 7) % 5) * 0.035;
    const w = 0.055 + ((i * 3) % 4) * 0.012;
    const strip = place(slab(w, len, 0.035, 0.02), {
      pos: [Math.sin(a) * 0.145, 0.50 - len * 0.5, Math.cos(a) * 0.115 + 0.01],
      rot: [0.10 + ((i * 5) % 3) * 0.10, a, ((i * 11) % 5 - 2) * 0.09],
    });
    rig.attach(tint(strip, i % 3 ? RAG : 0x1d1910, 0.06), 'pelvis');
  }

  /* head — oversized, wedge-shaped skull */
  const neck = tube([P(0, 1.00, -0.05), P(0, 1.12, 0.0)], [0.085, 0.075], { radialSeg: 7 });
  rig.attachBlend(tint(neck, SKIN_DARK), 'chest', 'head', 1.0);

  const skull = place(blob(0.155, 0.145, 0.170, 12, 9), { pos: [0, 1.20, 0.02] });
  // dark over the cranium, sallow down the muzzle and under the cheekbones, so
  // the brow shelf and the jaw separate instead of being one purple egg
  rig.attach(paint(skull, (x, y, z) => mix(goblinSkin(x, y, z - 1.10),
    SKIN_DARK, Math.max(0, (y - 1.22) * 4.5))), 'head');
  const brow = place(slab(0.26, 0.055, 0.11, 0.02), { pos: [0, 1.238, 0.13], rot: [0.28, 0, 0] });
  rig.attach(tint(brow, SKIN_DARK), 'head');
  // cheekbones: the shelf that makes a skull read as a skull
  for (const s of [-1, 1]) {
    const zyg = place(blob(0.040, 0.030, 0.062, 7, 5), { pos: [0.118 * s, 1.185, 0.105], scale: [1, 1, 1] });
    rig.attach(tint(zyg, SKIN, 0.05), 'head');
  }
  const snout = place(blob(0.078, 0.058, 0.078, 8, 6), { pos: [0, 1.155, 0.17] });
  rig.attach(paint(snout, () => mix(SKIN_PALE, SKIN_DARK, 0.55)), 'head');

  // grin: a dark slot with a row of teeth
  const mouth = place(slab(0.19, 0.045, 0.06, 0.01), { pos: [0, 1.105, 0.145] });
  rig.attach(tint(mouth, 0x0a0508), 'jaw');
  for (let i = -3; i <= 3; i++) {
    const up = place(spike(0.012, 0.045, 4), { pos: [i * 0.026, 1.12, 0.155], rot: [Math.PI - 0.1, 0, 0] });
    rig.attach(tint(up, CLAW), 'head');
    const lo = place(spike(0.011, 0.038, 4), { pos: [i * 0.026 + 0.013, 1.085, 0.152], rot: [-0.1, 0, 0] });
    rig.attach(tint(lo, CLAW), 'jaw');
  }
  // A lantern jaw, undershot and half the width of the skull — the goblin's
  // one memorable feature, and it was previously smaller than its own ear.
  const jawG = place(blob(0.125, 0.058, 0.105, 10, 6), { pos: [0, 1.070, 0.118] });
  rig.attach(paint(jawG, (x, y, z) => mix(SKIN_PALE, SKIN_DARK, 0.42 + Math.max(0, (1.09 - y) * 6))), 'jaw');
  for (const s of [-1, 1]) {
    const tusk = place(spike(0.016, 0.062, 5), { pos: [0.072 * s, 1.098, 0.135], rot: [-0.18, 0, -0.12 * s] });
    rig.attach(tint(tusk, CLAW), 'jaw');
  }

  // ears: long, swept, membrane-thin
  for (const s of [-1, 1]) {
    const e = tube([P(0.14 * s, 1.24, -0.02), P(0.30 * s, 1.34, -0.14), P(0.40 * s, 1.36, -0.30)],
      [[0.055, 0.016], [0.048, 0.012], [0.012, 0.005]], { radialSeg: 6 });
    rig.attach(tint(e, 0x513a4e, 0.05), 'head');
  }
  // horns
  for (const s of [-1, 1]) {
    const h = place(spike(0.028, 0.14, 5), { pos: [0.085 * s, 1.31, 0.02], rot: [-0.35, 0, 0.45 * s] });
    rig.attach(tint(h, 0x17121a), 'head');
  }
  // eyes: two hot coals under the brow
  for (const s of [-1, 1]) {
    const e = place(blob(0.030, 0.024, 0.020, 7, 5), { pos: [0.062 * s, 1.203, 0.152] });
    rig.attach(glow(tint(e, 0x1a0603), EYE, 3.2), 'head');
  }

  /* arms — long, thin, ending in oversized claws */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const shoulder = place(blob(0.075, 0.075, 0.075, 8, 6), { pos: [0.19 * s, 1.03, -0.04] });
    rig.attach(tint(shoulder, SKIN_DARK, 0.05), `sh${n}`);
    // Radii pinch at the joints and swell over the muscle bellies. The old
    // arm was a smooth taper from shoulder to wrist — a tube, and a tube reads
    // as a mannequin's arm no matter what colour it is painted.
    const up = tube([P(0.19 * s, 1.02, -0.04), P(0.245 * s, 0.955, -0.02), P(0.28 * s, 0.90, 0.0), P(0.33 * s, 0.80, 0.04)],
      [0.058, 0.068, 0.050, 0.038], { radialSeg: 7 });
    rig.attachBlend(paint(up, (x, y, z) => goblinSkin(x, y, z, Math.max(0, (0.95 - y) * 0.5))), `sh${n}`, `el${n}`, 1.0);
    // elbow: a bare knob of bone standing proud of the limb
    const elbow = place(blob(0.046, 0.048, 0.044, 8, 6), { pos: [0.332 * s, 0.797, 0.030] });
    rig.attach(tint(elbow, SKIN_DARK, 0.05), `el${n}`);
    const lo = tube([P(0.33 * s, 0.80, 0.04), P(0.352 * s, 0.725, 0.075), P(0.36 * s, 0.68, 0.10), P(0.39 * s, 0.57, 0.16)],
      [0.038, 0.046, 0.040, 0.030], { radialSeg: 7 });
    rig.attachBlend(paint(lo, (x, y, z) => goblinSkin(x, y, z, Math.max(0, (0.80 - y) * 1.5))), `el${n}`, `hd${n}`, 1.0);
    const palm = place(blob(0.048, 0.030, 0.052, 7, 5), { pos: [0.395 * s, 0.545, 0.19] });
    rig.attach(tint(palm, SKIN_DARK), `hd${n}`);
    for (let c = -1; c <= 1; c++) {
      const cl = place(spike(0.011, 0.105, 4),
        { pos: [(0.395 + c * 0.030) * s, 0.525, 0.225], rot: [1.05, 0, c * 0.22] });
      rig.attach(tint(cl, CLAW), `hd${n}`);
    }
  }

  /* legs — short, bandy, digitigrade */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const up = tube([P(0.115 * s, 0.58, 0), P(0.124 * s, 0.50, 0.025), P(0.128 * s, 0.44, 0.05), P(0.135 * s, 0.33, 0.09)],
      [0.082, 0.092, 0.074, 0.048], { radialSeg: 8 });
    rig.attachBlend(paint(up, (x, y, z) => goblinSkin(x, y, z, Math.max(0, (0.46 - y) * 1.2))), `hp${n}`, `kn${n}`, 1.0);
    // knee cap, and a calf that is a shape rather than a taper
    const knee = place(blob(0.050, 0.050, 0.048, 8, 6), { pos: [0.135 * s, 0.328, 0.082] });
    rig.attach(tint(knee, SKIN_DARK, 0.05), `kn${n}`);
    const lo = tube([P(0.135 * s, 0.33, 0.09), P(0.137 * s, 0.255, 0.062), P(0.135 * s, 0.18, 0.04), P(0.135 * s, 0.07, 0.01)],
      [0.046, 0.056, 0.042, 0.030], { radialSeg: 8 });
    rig.attachBlend(paint(lo, (x, y, z) => mix(goblinSkin(x, y, z), SKIN_DARK, Math.max(0, (0.30 - y) * 2.2))), `kn${n}`, `ft${n}`, 1.0);
    const foot = place(blob(0.055, 0.035, 0.085, 7, 5), { pos: [0.135 * s, 0.038, 0.055] });
    rig.attach(tint(foot, SKIN_DARK), `ft${n}`);
    for (let c = -1; c <= 1; c++) {
      const cl = place(spike(0.012, 0.05, 4), { pos: [(0.135 + c * 0.032) * s, 0.024, 0.125], rot: [1.35, 0, 0] });
      rig.attach(tint(cl, CLAW), `ft${n}`);
    }
  }

  const mat = creatureMaterial({
    roughness: 0.68, metalness: 0.0,
    normalMap: organicNormal(), normalScale: 0.7, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 1.6 });
}

class GoblinEnemy extends Enemy {
  rig!: any;
  stateTime!: any;
  visual!: any;
  constructor(opts: any) { super(GOBLIN, opts); }

  pose(state: any, t: any) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n: any, x: any, y: any, z: any) => poseBone(rig, n, x, y, z);
    // permanent hunch — the goblin is never upright
    const hunch = () => { S('spine', 0.30, 0, 0); S('chest', 0.20, 0, 0); S('neck', -0.30, 0, 0); };

    switch (state) {
      case 'approach':
      case 'run': {
        const ph = t * 12.5;
        hunch();
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          const o = s < 0 ? 0 : Math.PI;
          S(`hp${n}`, Math.sin(ph + o) * 0.8 - 0.25, 0, 0);
          S(`kn${n}`, 0.55 + Math.max(0, Math.sin(ph + o + 1.6)) * 0.85, 0, 0);
          S(`ft${n}`, -0.3 - Math.sin(ph + o) * 0.25, 0, 0);
          S(`sh${n}`, -Math.sin(ph + o) * 0.65 - 0.35, 0, 0.25 * s);
          S(`el${n}`, -0.95, 0, 0);
          S(`hd${n}`, 0.2, 0, 0);
        }
        S('head', 0.18 + Math.sin(ph * 2) * 0.06, Math.sin(ph * 0.7) * 0.12, 0);
        S('jaw', 0.32 + Math.sin(ph * 2) * 0.1, 0, 0);
        this.visual.position.y = Math.abs(Math.sin(ph)) * 0.055;
        break;
      }
      case 'telegraph': {
        const k = Math.min(1, this.stateTime / 0.28);
        hunch();
        S('spine', 0.30 - 0.18 * k, 0, 0);
        S('chest', 0.20 - 0.30 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, -2.3 * k, 0, 0.55 * s * k);
          S(`el${n}`, -1.5 * k, 0, 0);
          S(`hd${n}`, -0.5 * k, 0, 0);
          S(`hp${n}`, -0.45 * k, 0, 0);
          S(`kn${n}`, 0.85 * k, 0, 0);
        }
        S('head', -0.4 * k, 0, 0);
        S('jaw', 0.75 * k, 0, 0);
        this.visual.position.y = -0.10 * k;
        break;
      }
      case 'attack': {
        const k = Math.min(1, this.stateTime / 0.13);
        const e = 1 - Math.pow(1 - k, 3);
        S('spine', 0.30 + 0.25 * e, 0, 0);
        S('chest', 0.20 + 0.2 * e, 0, 0);
        S('neck', -0.30, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, -2.3 + 3.4 * e, 0, (0.55 - 0.75 * e) * s);
          S(`el${n}`, -1.5 + 1.2 * e, 0, 0);
          S(`hd${n}`, -0.5 + 0.9 * e, 0, 0);
        }
        S('head', 0.35 * e, 0, 0);
        S('jaw', 0.9, 0, 0);
        break;
      }
      case 'flinch': {
        const k = Math.exp(-this.stateTime * 8) * (1 - Math.min(1, this.stateTime / 0.35));
        hunch();
        S('spine', 0.30 + 0.35 * k, Math.sin(this.stateTime * 44) * 0.3 * k, 0);
        S('neck', -0.30 + 0.4 * k, 0, 0);
        S('head', -0.45 * k, 0.3 * k, 0.3 * k);
        S('jaw', 0.8 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, 0.6 * k, 0, 0.6 * s * k); S(`el${n}`, -1.4, 0, 0);
          S(`kn${n}`, 0.7 + 0.4 * k, 0, 0); S(`hp${n}`, -0.3 * k, 0, 0);
        }
        break;
      }
      case 'stagger': {
        const k = Math.min(1, this.stateTime / 0.18) * Math.max(0, 1 - this.stateTime / 2.2);
        S('spine', 0.30 + 0.5 * k, 0.3 * k, 0);
        S('chest', 0.20 + 0.3 * k, 0, 0);
        S('neck', -0.30 + 0.55 * k, 0, 0);
        S('head', -0.55 * k, 0.35 * k, 0);
        S('jaw', 0.9 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, 0.9 * k, 0, 0.9 * s * k); S(`el${n}`, -0.8, 0, 0);
          S(`hp${n}`, -0.6 * k, 0, 0); S(`kn${n}`, 1.2 * k, 0, 0);
        }
        this.visual.position.y = -0.18 * k;
        break;
      }
      case 'death': {
        const k = Math.min(1, this.stateTime / 0.5);
        const e = 1 - Math.pow(1 - k, 3);
        this.visual.rotation.x = e * 1.35;
        this.visual.position.y = -0.32 * e;
        S('spine', 0.30 - 0.4 * e, 0, 0);
        S('head', -0.3 * e, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, 1.2 * e, 0, 0.6 * s * e); S(`el${n}`, -0.5, 0, 0);
          S(`hp${n}`, -0.9 * e, 0, 0); S(`kn${n}`, 1.5 * e, 0, 0);
        }
        break;
      }
      default: {
        const b = Math.sin(t * 2.1) * 0.05;
        hunch();
        S('spine', 0.30 + b, 0, 0);
        S('head', 0.10 + b, Math.sin(t * 0.6) * 0.25, 0);
        S('jaw', 0.18 + Math.max(0, Math.sin(t * 1.3)) * 0.2, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`sh${n}`, -0.45 + b, 0, 0.30 * s);
          S(`el${n}`, -1.15, 0, 0);
          S(`hd${n}`, 0.25, 0, 0);
          S(`hp${n}`, -0.28, 0, 0); S(`kn${n}`, 0.62, 0, 0); S(`ft${n}`, -0.32, 0, 0);
        }
        this.visual.position.y = 0;
        break;
      }
    }
  }
}


const _pc = new THREE.Color(), _pd = new THREE.Color();
/**
 * Per-vertex colour from bind-pose position.
 *
 * `GeoKit.tint` paints one flat colour with an optional hash jitter, which is
 * all the goblin ever had — and a body that answers the light with one value
 * everywhere reads as a mannequin however good its silhouette is. This paints
 * counter-shading and blotching as a function of where the vertex actually is
 * on the body, which is the same thing the swept species get from `colorAt`.
 *
 * @param fn
 *   returns `[colour, blotchAmount]` for a bind-pose position
 */
function paint(geo: THREE.BufferGeometry, fn: (x:number,y:number,z:number)=>[number|THREE.Color, number]) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const c = fn(x, y, z);
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** sRGB mix that accepts a hex or an already-mixed Colour at either end. */
function mix(a: any, b: any, t: any) {
  if (typeof b === 'number') _pd.setHex(b, THREE.SRGBColorSpace); else _pd.copy(b);
  if (typeof a === 'number') _pc.setHex(a, THREE.SRGBColorSpace); else if (a !== _pc) _pc.copy(a);
  return _pc.lerp(_pd, t < 0 ? 0 : t > 1 ? 1 : t);
}

/**
 * The goblin's skin at a bind-pose point: sallow underneath, bruised on top,
 * black at the extremities, blotched everywhere. `down` is how far under the
 * body the point faces, `ext` how far out along a limb it is.
 */
function goblinSkin(x: any, y: any, z: any, ext = 0) {
  // three incommensurate sines make a blotch field that never repeats visibly
  const n = Math.sin(x * 23.7 + y * 11.3) * 0.5 + Math.sin(y * 17.1 - z * 13.9) * 0.35
    + Math.sin(z * 29.3 + x * 7.7) * 0.25;
  const belly = Math.max(0, (z - 0.02) * 2.6) * Math.max(0, 1 - Math.abs(x) * 3.2);
  const c = mix(SKIN, SKIN_PALE, Math.min(0.85, belly * 0.9));
  const withBlotch = mix(c, BLOTCH, Math.max(0, n) * 0.45);
  return mix(withBlotch, SKIN_DARK, ext);
}

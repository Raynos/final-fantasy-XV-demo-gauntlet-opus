import * as THREE from 'three';
import { Rig, poseBone, creatureMaterial } from './RigBuilder.js';
import { metalNormal, metalRoughness } from './EnemyBase.js';
import { BipedEnemy } from './Biped.js';
import { attackEnvelope, hitCurve, clamp01, smooth, decelerate } from '../rig/CreatureAnim.js';
import {
  tube, blob, slab, spike, place, tint, glow, rectCross, loft, circleCross, bladeCross,
} from '../../combat/GeoKit.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

/* Oxidised wrought iron, not battleship grey. The old palette was blue-grey
 * with a cool highlight, which is a Battletech mech; an Iron Giant is a suit
 * of dead armour that has been standing in the dark for an age, so every value
 * is warm, and the light plate is *rust* rather than polish. */
const IRON = 0x3a3129;        // plate
const IRON_DARK = 0x14100d;   // shadowed plate, rivets, mail
const IRON_LIGHT = 0x574636;  // proud edges, oxidised
const RUST = 0x5e3a1e;        // bloom in the runnels and around fixings
const RUNE = 0xff5a12;
const BLADE = 0x7d7466;       // tarnished steel — still the brightest thing on it

/**
 * Iron Giant — the armour-plated colossus that drops out of the daemon
 * portals at night. Five and a half metres of riveted iron with no face,
 * only a burning slit under the horned helm, dragging a greatsword longer
 * than a car. Everything about it is built to read at silhouette scale.
 */
export const IRON_GIANT = {
  key: 'irongiant',
  questId: 'iron_giant',
  faction: 'daemon',
  expClass: 'elite',
  superArmour: true,
  staggerDuration: 3.2,
  stats: {
    name: 'Iron Giant', hp: 14800, poise: 260, speed: 2.1, attackRange: 5.2,
    aggroRange: 40, radius: 1.5, height: 5.4, damage: 460, level: 46,
  },
  weakness: 'lightning',
  resistPct: { light: 175, dark: 0, lightning: 165, fire: 90, ice: 100 },
  weakTo: ['greatsword'],
  resistsWeapon: ['firearm'],
  senses: { sight: 40, fov: 1.8, hearing: 26, nocturnal: true },
  drops: [
    { id: 'rotten_splinterbone', chance: 0.7, count: 2 },
    { id: 'mythril_shaft', chance: 0.2, count: 1 },
  ],
  timing: { telegraph: 1.15, strike: 0.28, attack: 0.9, recover: 1.5 },
  attacks: [
    { id: 'cleave', range: 5.6, weight: 3, mult: 1.0, poise: 40, hitRadius: 4.0, arc: 1.1,
      telegraph: 1.15, strike: 0.28, attack: 0.9, recover: 1.5, cooldown: 2.2 },
    { id: 'sweep', range: 6.4, weight: 2, mult: 1.2, poise: 55, hitRadius: 5.2, arc: 2.0, aoe: true,
      telegraph: 1.35, strike: 0.32, attack: 1.0, recover: 1.8, cooldown: 5, unblockable: true },
  ],
  buildPrototype,
  make(opts) { return new IronGiantEnemy(opts); },
};

function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('pelvis', 'root', [0, 2.55, 0]);
  rig.bone('spine', 'pelvis', [0, 3.20, -0.05]);
  rig.bone('chest', 'spine', [0, 3.85, -0.05]);
  rig.bone('neck', 'chest', [0, 4.45, 0]);
  rig.bone('head', 'neck', [0, 4.72, 0.02]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`sh${n}`, 'chest', [0.78 * s, 4.28, 0]);
    rig.bone(`el${n}`, `sh${n}`, [1.02 * s, 3.32, 0.05]);
    rig.bone(`hd${n}`, `el${n}`, [1.05 * s, 2.42, 0.20]);
    rig.bone(`hp${n}`, 'pelvis', [0.42 * s, 2.50, 0]);
    rig.bone(`kn${n}`, `hp${n}`, [0.46 * s, 1.35, 0.06]);
    rig.bone(`ft${n}`, `kn${n}`, [0.46 * s, 0.22, -0.02]);
  }

  /* --- torso: a wedge of riveted plate --- */
  const core = loft(rectCross(0.32, 16), [
    { y: 2.35, sx: 0.46, sz: 0.34 },
    { y: 2.95, sx: 0.50, sz: 0.36 },
    { y: 3.55, sx: 0.66, sz: 0.42 },
    { y: 4.10, sx: 0.72, sz: 0.44 },
    { y: 4.42, sx: 0.50, sz: 0.34 },
  ]);
  rig.attachBlend(aged(core, IRON, 0.9), 'pelvis', 'chest', 1.5);

  const breast = place(slab(1.30, 0.90, 0.72, 0.12), { pos: [0, 3.95, 0.02] });
  rig.attach(aged(breast, IRON_LIGHT, 1.0), 'chest');
  const ridge = place(slab(0.18, 0.95, 0.80, 0.05), { pos: [0, 3.95, 0.06] });
  rig.attach(tint(ridge, IRON_DARK), 'chest');
  const abdo = place(slab(0.92, 0.62, 0.60, 0.08), { pos: [0, 3.18, 0] });
  rig.attach(aged(abdo, IRON, 0.9), 'spine');
  const belt = place(slab(1.10, 0.30, 0.72, 0.06), { pos: [0, 2.62, 0] });
  rig.attach(tint(belt, IRON_DARK), 'pelvis');
  for (const s of [-1, 1]) {
    const tass = place(slab(0.42, 0.90, 0.16, 0.04), { pos: [0.30 * s, 2.10, 0.28], rot: [0.18, 0, 0.06 * s] });
    rig.attach(aged(tass, IRON, 1.0), 'pelvis');
  }
  const tassB = place(slab(0.90, 0.85, 0.16, 0.05), { pos: [0, 2.12, -0.32], rot: [-0.14, 0, 0] });
  rig.attach(aged(tassB, IRON, 1.0), 'pelvis');

  // rune seams: molten light bleeding out between the plates
  for (let i = 0; i < 5; i++) {
    const seam = place(slab(0.86 - i * 0.10, 0.045, 0.05, 0.012), { pos: [0, 3.28 + i * 0.16, 0.32] });
    rig.attach(glow(tint(seam, 0x2a0e03), RUNE, 1.4 + i * 0.35), 'spine');
  }
  const heart = place(slab(0.28, 0.28, 0.10, 0.04), { pos: [0, 3.92, 0.40], rot: [0, 0, Math.PI * 0.25] });
  rig.attach(glow(tint(heart, 0x330f03), RUNE, 3.4), 'chest');

  /* --- head: horned helm, no face, one burning slit --- */
  const neck = place(loft(circleCross(9), [{ y: 4.36, sx: 0.20 }, { y: 4.60, sx: 0.19 }]), {});
  rig.attachBlend(tint(neck, IRON_DARK), 'chest', 'head', 1.0);
  const helm = place(slab(0.62, 0.62, 0.66, 0.12), { pos: [0, 4.80, 0.02] });
  rig.attach(aged(helm, IRON_LIGHT, 0.85), 'head');
  const brow = place(slab(0.66, 0.16, 0.24, 0.04), { pos: [0, 4.76, 0.30], rot: [0.24, 0, 0] });
  rig.attach(tint(brow, IRON_DARK), 'head');
  const jawPlate = place(slab(0.46, 0.24, 0.34, 0.05), { pos: [0, 4.52, 0.18] });
  rig.attach(aged(jawPlate, IRON, 0.8), 'head');
  const slit = place(slab(0.44, 0.075, 0.06, 0.015), { pos: [0, 4.665, 0.335] });
  rig.attach(glow(tint(slit, 0x3a1004), RUNE, 5.0), 'head');
  const crest = place(slab(0.09, 0.42, 0.60, 0.03), { pos: [0, 5.10, -0.02] });
  rig.attach(tint(crest, IRON_DARK), 'head');
  for (const s of [-1, 1]) {
    const horn = place(spike(0.13, 0.95, 6), { pos: [0.28 * s, 4.94, -0.06], rot: [-0.35, 0, 0.95 * s] });
    rig.attach(tint(horn, IRON_DARK), 'head');
    const horn2 = place(spike(0.07, 0.42, 5), { pos: [0.30 * s, 4.62, 0.10], rot: [0.2, 0, 1.35 * s] });
    rig.attach(tint(horn2, IRON_DARK), 'head');
  }

  /* --- arms: enormous, plate over cable --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const pauldron = place(slab(0.78, 0.66, 0.86, 0.10), { pos: [0.90 * s, 4.34, 0], rot: [0, 0, -0.22 * s] });
    rig.attach(aged(pauldron, IRON_LIGHT, 1.0), `sh${n}`);
    for (let i = 0; i < 3; i++) {
      const sp = place(spike(0.075, 0.30, 5), { pos: [(1.06 + i * 0.02) * s, 4.52 - i * 0.24, -0.02], rot: [0, 0, 1.25 * s] });
      rig.attach(tint(sp, IRON_DARK), `sh${n}`);
    }
    const upArm = tube([P(0.80 * s, 4.22, 0), P(0.94 * s, 3.76, 0.02), P(1.02 * s, 3.36, 0.05)],
      [0.30, 0.27, 0.22], { radialSeg: 9 });
    rig.attachBlend(aged(upArm, IRON, 0.8), `sh${n}`, `el${n}`, 1.0);
    const elbow = place(slab(0.44, 0.36, 0.44, 0.07), { pos: [1.02 * s, 3.30, 0.05] });
    rig.attach(aged(elbow, IRON_LIGHT, 1.0), `el${n}`);
    const loArm = tube([P(1.02 * s, 3.26, 0.06), P(1.04 * s, 2.84, 0.13), P(1.05 * s, 2.46, 0.20)],
      [0.24, 0.235, 0.20], { radialSeg: 9 });
    rig.attachBlend(aged(loArm, IRON, 0.8), `el${n}`, `hd${n}`, 1.0);
    const vamb = place(slab(0.50, 0.72, 0.50, 0.07), { pos: [1.04 * s, 2.86, 0.14] });
    rig.attach(aged(vamb, IRON_LIGHT, 1.0), `el${n}`);
    const seam = place(slab(0.06, 0.55, 0.10, 0.015), { pos: [(1.30 * s), 2.86, 0.14] });
    rig.attach(glow(tint(seam, 0x2a0e03), RUNE, 1.5), `el${n}`);
    const fist = place(slab(0.44, 0.46, 0.40, 0.09), { pos: [1.05 * s, 2.32, 0.24] });
    rig.attach(tint(fist, IRON_DARK, 0.03), `hd${n}`);
  }

  /* --- legs --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const thigh = tube([P(0.42 * s, 2.50, 0), P(0.44 * s, 1.92, 0.04), P(0.46 * s, 1.40, 0.06)],
      [0.34, 0.31, 0.25], { radialSeg: 9 });
    rig.attachBlend(aged(thigh, IRON, 0.85), `hp${n}`, `kn${n}`, 1.0);
    const thighP = place(slab(0.58, 0.92, 0.56, 0.08), { pos: [0.43 * s, 1.98, 0.03] });
    rig.attach(aged(thighP, IRON_LIGHT, 1.0), `hp${n}`);
    const knee = place(slab(0.50, 0.40, 0.50, 0.08), { pos: [0.46 * s, 1.34, 0.10] });
    rig.attach(tint(knee, IRON_DARK), `kn${n}`);
    const shin = tube([P(0.46 * s, 1.30, 0.05), P(0.46 * s, 0.80, 0.02), P(0.46 * s, 0.32, -0.01)],
      [0.25, 0.235, 0.20], { radialSeg: 9 });
    rig.attachBlend(aged(shin, IRON, 0.85), `kn${n}`, `ft${n}`, 1.0);
    const shinP = place(slab(0.46, 0.80, 0.48, 0.07), { pos: [0.46 * s, 0.82, 0.06] });
    rig.attach(aged(shinP, IRON_LIGHT, 1.0), `kn${n}`);
    const foot = place(slab(0.52, 0.28, 1.00, 0.07), { pos: [0.46 * s, 0.16, 0.18] });
    rig.attach(aged(foot, IRON_DARK, 1.0), `ft${n}`);
    for (let i = -1; i <= 1; i++) {
      const claw = place(spike(0.07, 0.24, 5), { pos: [(0.46 + i * 0.16) * s, 0.10, 0.68], rot: [1.45, 0, 0] });
      rig.attach(tint(claw, IRON_LIGHT), `ft${n}`);
    }
  }

  /* --- the greatsword, gripped in the right fist --- */
  const swordParts = [];
  const grip = place(loft(circleCross(8), [{ y: 0, sx: 0.075 }, { y: 0.9, sx: 0.07 }]),
    { pos: [1.05, 1.85, 0.28] });
  swordParts.push(tint(grip, IRON_DARK));
  const cross = place(slab(0.95, 0.16, 0.24, 0.04), { pos: [1.05, 2.78, 0.28] });
  swordParts.push(aged(cross, IRON_LIGHT, 1.0));
  // Wider and thicker than a sword has any business being: at five and a half
  // metres of wielder the blade has to be a *slab* or it disappears into the
  // arm holding it, which is exactly what it was doing.
  const bl = place(loft(bladeCross(12), [
    { y: 0.00, sx: 0.46, sz: 0.105 },
    { y: 0.55, sx: 0.56, sz: 0.115 },
    { y: 2.60, sx: 0.50, sz: 0.100 },
    { y: 3.35, sx: 0.34, sz: 0.070 },
    { y: 3.85, sx: 0.055, sz: 0.022 },
  ]), { pos: [1.05, 2.86, 0.28] });
  swordParts.push(aged(bl, BLADE, 0.40));
  const fuller = place(loft(rectCross(0.4, 8), [
    { y: 0.30, sx: 0.05, sz: 0.09 }, { y: 3.10, sx: 0.035, sz: 0.085 },
  ]), { pos: [1.05, 2.86, 0.28] });
  swordParts.push(glow(tint(fuller, 0x3a1405), RUNE, 1.8));
  const pommel = place(blob(0.11, 0.11, 0.11, 8, 6), { pos: [1.05, 1.78, 0.28] });
  swordParts.push(tint(pommel, IRON_LIGHT));
  for (const g of swordParts) rig.attach(g, 'hdR');

  // Rougher and less metallic than polished armour: rust is a dielectric, and
  // a high metalness with a low roughness is what made five tonnes of iron read
  // as injection-moulded plastic. `normalScale` is up from 0.22 because the
  // plate map now carries rivets and panel seams worth seeing.
  const mat = creatureMaterial({
    roughness: 0.76, metalness: 0.22,
    normalMap: metalNormal(), normalScale: 0.65, roughnessMap: metalRoughness(),
  });
  return rig.build(mat, { radius: 6.5 });
}

/**
 * A daemon in a suit of dead iron. Nothing about the way it moves should read
 * as a person in armour: the limbs arrive slightly out of sequence, the head
 * lags the torso, and the whole frame carries an idle tremor that never quite
 * resolves. The cleave is telegraphed for well over a second — that is the
 * fight, and the animation has to hand the player the window honestly.
 */
class IronGiantEnemy extends BipedEnemy {
  constructor(opts) { super(IRON_GIANT, opts); }

  /** World-space sword tip — used by the arc VFX and the sweep hitbox. */
  swordTip(out = new THREE.Vector3()) {
    const b = this.rig && this.rig.byName.get('hdR');
    if (!b) return out.copy(this.centre());
    return out.set(0, 4.30, 0).applyMatrix4(b.matrixWorld);
  }

  /** Sword carried point-down at the side. */
  carry(S, k = 1) {
    S('shR', 0.35 * k, 0, -0.30 * k);
    S('elR', -0.55 * k, 0, 0);
    S('hdR', -0.35 * k, 0, 0);
    S('shL', 0.15 * k, 0, -0.22 * k);
    S('elL', -0.45 * k, 0, 0);
  }

  /**
   * The wrongness layer. A slow, irregular tremor with no period a viewer can
   * lock onto, plus a permanent asymmetry — one shoulder always lower than the
   * other. Cheap, and it does more for "this is a daemon" than any amount of
   * extra geometry.
   */
  miasma(S, t) {
    const j = Math.sin(t * 1.7) * Math.sin(t * 0.43 + 1.1) * Math.sin(t * 0.19);
    this.add(S, 'chest', j * 0.020, j * 0.030, -0.035 + j * 0.014);
    this.add(S, 'neck', -j * 0.030, j * 0.055, 0.02);
    this.add(S, 'head', j * 0.050, -j * 0.085, -0.03);
  }

  add(S, name, x, y, z) {
    const b = this.rig.byName.get(name);
    if (!b) return;
    _e.set(x, y, z, 'XYZ');
    _q.setFromEuler(_e);
    b.quaternion.multiply(_q);
  }

  poseLocomotion(S, t) {
    super.poseLocomotion(S, t);
    // the sword hand does not swing; it hauls
    const sw = Math.sin(this.anim.gaitPhase * Math.PI * 2);
    this.carry(S, 1);
    S('shL', 0.15 - sw * 0.30, 0, -0.22);
    S('shR', 0.35 + sw * 0.10, 0, -0.30);
    this.miasma(S, t);
  }

  poseArms() { /* the carry pose owns the arms */ }

  poseWindUp(S, t, k, env) {
    // Rear back and haul the blade overhead. Two-thirds of the wind-up is
    // spent getting there; the last third is a held, trembling threat.
    const e = smooth(k);
    S('shR', 0.35 - 3.40 * e, -0.35 * e, -0.30 + 0.55 * e);
    S('elR', -0.55 - 0.75 * e, 0, 0);
    S('hdR', -0.35 + 0.25 * e, 0, 0);
    S('shL', 0.15 - 1.20 * e, 0.4 * e, -0.22);
    S('elL', -0.45 - 0.8 * e, 0, 0);
    S('pelvis', 0.06 * e, -0.14 * e, 0);
    S('spine', -0.22 * e + env.shake, -0.28 * e, 0);
    S('chest', -0.18 * e + env.shake, -0.20 * e, 0);
    S('neck', 0.06 * e, 0.12 * e, 0);
    S('head', 0.12 * e, 0.20 * e, 0);
    this.stance(S, {
      drop: 0.28 * e,
      L: { reach: 0.34 * e },
      R: { reach: -0.24 * e },
    });
  }

  poseSwing(S, t, k, env) {
    // one continuous arc from the held wind-up through the ground
    const e = clamp01((k + 1) * 0.5);
    const f = env.phase === 'follow' ? env.f : 0;
    S('shR', -3.05 + 3.85 * e, -0.35 + 0.35 * e, 0.25 - 0.15 * e);
    S('elR', -1.30 + 0.85 * e, 0, 0);
    S('hdR', -0.10 - 0.30 * e, 0, 0);
    S('shL', -1.05 + 0.9 * e, 0.4, -0.22);
    S('elL', -1.25 + 0.6 * e, 0, 0);
    S('pelvis', 0.06 - 0.20 * e, -0.14 + 0.20 * e, 0);
    S('spine', -0.22 + 0.62 * e, -0.28 + 0.36 * e, 0);
    S('chest', -0.18 + 0.48 * e, -0.20 + 0.26 * e, 0);
    S('neck', 0.06 - 0.14 * e, 0.12 - 0.10 * e, 0);
    S('head', 0.12 - 0.30 * e, 0.20 - 0.22 * e, 0);
    // the whole mass drops onto the blow and springs back off the recoil
    this.stance(S, {
      drop: 0.28 + 0.34 * e - 0.16 * Math.sin(f * Math.PI),
      L: { reach: 0.34 - 0.56 * e },
      R: { reach: -0.24 + 0.46 * e },
    });
  }

  poseDeath(S, t) {
    // Iron does not crumple; it falls in one piece and the daemon leaves it.
    const A = this.A;
    const T = this.stateTime;
    const buckle = smooth(clamp01(T / 0.32));
    const topple = decelerate(clamp01((T - 0.26) / 0.85), 1.9);
    const fwd = (this.deathPush ?? 1) >= 0 ? -1 : 1;
    const side = this.deathSide || 1;
    const sink = A.hipY - A.bodyR;
    this.stance(S, {
      L: { reach: 0.22 * buckle - 0.20 * topple, lift: sink * buckle, splay: 0.20 * topple },
      R: { reach: -0.26 * buckle + 0.16 * topple, lift: sink * buckle, splay: 0.16 * topple },
    });
    S('pelvis', 0.20 * buckle * -fwd, 0, 0);
    S('spine', 0.26 * buckle * -fwd, 0.10 * topple * side, 0);
    S('chest', 0.18 * buckle * -fwd, 0.14 * topple * side, 0.10 * topple * side);
    S('head', 0.55 * buckle * -fwd, 0.20 * topple * side, 0);
    S('shR', 0.35 + 1.10 * topple, 0, -0.30 + 0.70 * topple);
    S('elR', -0.55 - 0.35 * topple, 0, 0);
    S('shL', 0.15 + 1.05 * topple, 0, -0.22 - 0.70 * topple);
    S('elL', -0.45 - 0.30 * topple, 0, 0);
    const th = topple * 1.42 * fwd;
    const centre = A.hipY - sink * buckle;
    this.visual.rotation.x += th;
    this.visual.rotation.z += topple * 0.14 * side;
    this.visual.position.y += centre - A.hipY * Math.cos(th);
    this.visual.position.z -= A.hipY * Math.sin(th) * 0.6;
  }

  poseIdle(S, t) {
    super.poseIdle(S, t);
    this.carry(S, 1);
    this.miasma(S, t);
  }

  poseFlinch(S, t) {
    super.poseFlinch(S, t);
    this.carry(S, 1);
  }

  poseStagger(S, t) {
    super.poseStagger(S, t);
    const total = this.type.staggerDuration || 3.2;
    const k = smooth(this.stateTime / 0.16) * clamp01(1 - (this.stateTime - total * 0.7) / (total * 0.3));
    // the sword arm hangs dead while it reels — the opening the fight is about
    S('shR', 0.35 + 0.70 * k, 0, -0.30 + 0.80 * k);
    S('elR', -0.55 - 0.45 * k, 0, 0);
    S('shL', 0.15 + 0.55 * k, 0, -0.22 - 0.75 * k);
    S('elL', -0.45 - 0.30 * k, 0, 0);
  }
}

IronGiantEnemy.ANIM = {
  legs: { L: ['hpL', 'knL', 'ftL'], R: ['hpR', 'knR', 'ftR'] },
  arms: { L: ['shL', 'elL', 'hdL'], R: ['shR', 'elR', 'hdR'] },
  trunk: ['pelvis', 'spine', 'chest', 'neck', 'head'],
  strideLen: 3.4, stride: 0.80, lift: 0.34, duty: 0.70,
  hipY: 2.55, bodyR: 0.95, hipSway: 0.075, bob: 0.070, lean: 0.06,
  armSwing: 0, torsoTwist: 0.05, marchStiff: 1,
  crouch: 0.28, step: 0.30, windTwist: 0.28,
  footPitch: 0.0, breath: 0.55, deathPitch: 1.42,
};

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();


const _ic = new THREE.Color(), _id = new THREE.Color();
/** sRGB mix accepting a hex or an already-mixed Colour at either end. */
function mix(a, b, t) {
  if (typeof b === 'number') _id.setHex(b, THREE.SRGBColorSpace); else _id.copy(b);
  if (typeof a === 'number') _ic.setHex(a, THREE.SRGBColorSpace); else if (a !== _ic) _ic.copy(a);
  return _ic.lerp(_id, t < 0 ? 0 : t > 1 ? 1 : t);
}

/**
 * Paint a plate with age.
 *
 * Rust does not fall evenly: it blooms where water sits and then *runs*, so
 * the tell is vertical streaking below every fixing and lip, over a body that
 * is darker in its recesses than on its proud edges. `tint` could only give
 * one flat colour plus hash jitter, and a five-metre wall of one flat colour
 * is why the giant read as a boxy grey mech rather than as armour.
 *
 * @param {THREE.BufferGeometry} geo
 * @param {number} base plate colour
 * @param {number} [amount] 0..1 how far gone this piece is
 */
function aged(geo, base, amount = 1) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // streaks: high frequency across the plate, low frequency down it
    const streak = Math.sin(x * 8.3 + z * 5.1) * 0.5 + Math.sin(x * 19.7 - z * 12.3) * 0.3;
    const run = Math.sin(y * 1.7 + x * 2.3) * 0.5 + 0.5;
    const bloom = Math.max(0, streak) * (0.35 + 0.65 * run) * amount;
    // the underside of everything sits in its own shadow
    const shade = Math.max(0, -Math.sin(y * 3.1 + z * 4.7)) * 0.25;
    const c = mix(base, RUST, bloom * 0.55);
    arr[i * 3] = c.r * (1 - shade); arr[i * 3 + 1] = c.g * (1 - shade); arr[i * 3 + 2] = c.b * (1 - shade);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

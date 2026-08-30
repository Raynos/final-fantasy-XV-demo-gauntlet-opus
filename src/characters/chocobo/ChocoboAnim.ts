import * as THREE from 'three';
import { poseBone } from '../enemies/RigBuilder.ts';

/**
 * The chocobo's procedural animator.
 *
 * A bird is not a small horse, and three things here are what stop it reading
 * as one:
 *
 * - **Two beats, not four.** A running chocobo is a biped: the two feet are
 *   half a stride apart (`0` and `PI`) and the body rises twice per stride, so
 *   the bounce is at double the leg frequency. Mesmenir's four-beat transverse
 *   gallop, retimed, is what this replaced — it looked like a horse costume.
 * - **The head does not bob.** Birds stabilise the head against the body: the
 *   barrel heaves 12 cm at a gallop and the skull stays within about 2 cm of
 *   level, because the neck absorbs it. That counter-rotation is the single
 *   most legible thing about a running bird, and leaving it out is what makes
 *   procedural birds look like bouncing toys.
 * - **Everything soft lags.** Crest, tail plume and the wings trail the body by
 *   a fixed phase offset rather than moving with it, so the animal has mass.
 *
 * Determinism: `speed` and `gait` are exponential damps, and per `LANDMINES`
 * an exponential damp that has not arrived draws a different number of
 * velocity proxies depending on how long the page has run. `converge()` snaps
 * both to their targets, and `ChocoboSystem` forwards `Game.settle()` to it.
 */

/** Gait phase offsets. A biped: one foot, then the other, then suspension. */
const BEAT = { L: 0, R: Math.PI };

/** Standing offsets, on top of which every cycle is added. */
const STAND = {
  thg: -0.06, shn: 0.10, tar: -0.10, foo: 0.06,
};

export interface ChocoboPose {
  /** Metres per second over the ground. */
  speed: number;
  /** Radians per second of heading change; drives the lean. */
  turnRate: number;
  /** 0..1 how hard the bird is being asked to go — opens the beak, flares wings. */
  effort: number;
  /** Is anyone on the saddle? A ridden bird carries its neck higher. */
  ridden: boolean;
  /** Surface normal under the feet, for the body roll on a camber. */
  normal?: THREE.Vector3 | null;
}

export interface PosableRig {
  byName: Map<string, THREE.Bone>;
  rest: Map<string, THREE.Quaternion>;
}

export class ChocoboAnim {
  _bob!: number;
  _gait!: number;
  _gaitWant!: number;
  _lean!: number;
  _leanWant!: number;
  /** Stride phase, radians; advanced by distance covered, not by time. */
  _ph!: number;
  _speed!: number;
  _speedWant!: number;
  _t!: number;
  rig!: PosableRig;
  /** The node the whole animal hangs off; the bounce and the body pitch go here. */
  visual!: THREE.Object3D;
  constructor(rig: PosableRig, visual: THREE.Object3D) {
    this.rig = rig;
    this.visual = visual;
    this._ph = 0;
    this._t = 0;
    this._speed = 0;
    this._speedWant = 0;
    this._gait = 0;
    this._gaitWant = 0;
    this._lean = 0;
    this._leanWant = 0;
    this._bob = 0;
  }

  /**
   * Settle the damps. See `Player.converge` — same bug, same fix: five loose
   * accessories still moving at frame 68 draw five velocity proxies, and a
   * draw count that depends on run history is a draw count a capture may not
   * have.
   */
  converge() {
    this._speed = this._speedWant;
    this._gait = this._gaitWant;
    this._lean = this._leanWant;
  }

  update(dt: number, p: ChocoboPose) {
    this._t += dt;
    this._speedWant = p.speed;
    this._speed = THREE.MathUtils.damp(this._speed, this._speedWant, 9, dt);
    // 0 standing, 1 walking, 2 running — the blend the cycle amplitude reads
    this._gaitWant = THREE.MathUtils.clamp(this._speed / 5.5, 0, 2);
    this._gait = THREE.MathUtils.damp(this._gait, this._gaitWant, 10, dt);
    this._leanWant = THREE.MathUtils.clamp(-p.turnRate * 0.14, -0.30, 0.30);
    this._lean = THREE.MathUtils.damp(this._lean, this._leanWant, 6, dt);

    /**
     * Stride length grows with speed, which is why the phase is advanced by
     * distance rather than by a fixed frequency: a bird accelerating from a
     * walk lengthens its stride before it raises its cadence, and driving the
     * cycle straight off a clock gives the mincing over-cadence that reads as
     * a sped-up walk animation.
     */
    const stride = THREE.MathUtils.clamp(1.05 + this._speed * 0.155, 1.05, 2.85);
    this._ph += (this._speed / stride) * Math.PI * 2 * dt;
    // idle sway keeps the phase moving so a standing bird is never a statue
    if (this._speed < 0.15) this._ph += dt * 0.55;
    if (this._ph > Math.PI * 2) this._ph -= Math.PI * 2;

    const rig = this.rig;
    const S = (n: string, x: number, y = 0, z = 0) => poseBone(rig, n, x, y, z);
    const g = this._gait;
    const run = THREE.MathUtils.clamp(g - 1, 0, 1);      // 0 walk .. 1 gallop
    const walk = THREE.MathUtils.clamp(g, 0, 1);
    const ph = this._ph;
    const t = this._t;

    /* ------------------------------------------------------------- legs --- */
    const reach = 0.35 + walk * 0.40 + run * 0.55;
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      const o = BEAT[n as 'L' | 'R'];
      const sw = Math.sin(ph + o);
      // the foot is off the ground on the back half of the swing; `fold` peaks
      // a quarter-cycle after the leg passes under the hip, which is where a
      // bird's hock actually snaps shut
      const fold = Math.max(0, Math.sin(ph + o + 1.50));
      S(`thg${n}`, STAND.thg + sw * 0.52 * reach - run * 0.10);
      S(`shn${n}`, STAND.shn + fold * 1.15 * reach + run * 0.12);
      S(`tar${n}`, STAND.tar - fold * 1.00 * reach - sw * 0.18 * reach);
      S(`foo${n}`, STAND.foo + sw * 0.34 * reach + fold * 0.22 * reach);
      S(`toe${n}`, -0.10 - fold * 0.30 * reach);
    }

    /* ------------------------------------------------- body: two bounces ---
     * A biped rises once per FOOTFALL, so twice per stride: `2 * ph`. Doing
     * this at `ph` gives the rocking-horse a quadruped has and a bird does not.
     */
    const bob = (0.020 + walk * 0.030 + run * 0.075) * (0.5 - Math.cos(ph * 2) * 0.5);
    this._bob = bob;
    this.visual.position.y = bob;
    // the barrel pitches nose-down as it drives forward, and rolls into a turn
    this.visual.rotation.x = -0.05 * run + Math.sin(ph * 2 + 0.8) * (0.018 + run * 0.045);
    this.visual.rotation.z = this._lean;

    S('hips', 0.04 * run + Math.sin(ph * 2 + 0.5) * 0.030 * (walk + run));
    S('spine', -0.03 * run + Math.sin(ph * 2 + 1.1) * 0.026 * (walk + run), this._lean * 0.20);
    S('chest', -0.06 * run + Math.sin(ph * 2 + 1.6) * 0.020 * (walk + run), this._lean * 0.15);

    /* ------------------------------------------- neck: head stabilisation ---
     * Cancel the body's vertical bounce and its pitch in the neck, so the skull
     * holds still while everything under it heaves. The gains are deliberately
     * a little under 1: a perfect cancellation reads as a head on a stick.
     */
    const cancelPitch = -this.visual.rotation.x * 0.80;
    const cancelBob = -Math.sin(ph * 2 + 0.8) * (0.05 + run * 0.10);
    const carry = p.ridden ? 0.10 : 0.0;            // a ridden bird carries higher
    S('neck1', -0.16 - run * 0.30 - carry + cancelBob * 0.6, this._lean * 0.35);
    S('neck2', 0.10 + run * 0.22 + carry * 0.5 + cancelBob * 0.5 + cancelPitch * 0.5, this._lean * 0.30);
    S('neck3', 0.06 + cancelPitch * 0.5 + Math.sin(t * 0.7) * 0.012, this._lean * 0.25);
    S('head', -0.02 + cancelPitch * 0.4 - run * 0.06 + Math.sin(t * 0.9 + 1.1) * 0.016,
      Math.sin(t * 0.43) * 0.10 * (1 - walk), this._lean * 0.15);

    // the beak opens when the bird is working, and the tongue-click idle
    const pant = p.effort > 0.5 ? (0.5 - Math.cos(t * 9) * 0.5) * 0.22 * p.effort : 0;
    S('jaw', 0.02 + pant + Math.max(0, Math.sin(t * 0.31)) * 0.05 * (1 - walk));

    /* ------------------------------------------------ crest, tail, wings ---
     * All three lag the body. The offsets are phase, not amplitude: a crest
     * that moves with the head is a hat, and a crest that moves a beat behind
     * it is feathers.
     */
    const whip = 0.06 + walk * 0.10 + run * 0.24;
    S('crest1', -0.10 - run * 0.22 + Math.sin(ph * 2 - 0.9) * whip * 0.7 + Math.sin(t * 1.7) * 0.03,
      Math.sin(t * 1.1) * 0.05);
    S('crest2', -0.08 + Math.sin(ph * 2 - 1.5) * whip + Math.sin(t * 2.1) * 0.04);

    S('tail1', 0.04 + run * 0.16 + Math.sin(ph * 2 - 1.0) * whip * 0.55, this._lean * -0.5);
    S('tail2', 0.02 + Math.sin(ph * 2 - 1.7) * whip * 0.85, this._lean * -0.4);
    S('tail3', Math.sin(ph * 2 - 2.4) * whip * 1.25 + Math.sin(t * 1.3) * 0.03, this._lean * -0.3);

    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      // wings clamp in at speed and flare on the turn and under effort
      const flare = run * 0.30 + p.effort * 0.22 + Math.max(0, this._lean * s * 2.2);
      S(`wsh${n}`, -0.06 + Math.sin(ph * 2 - 0.6) * whip * 0.30, 0, (0.10 + flare) * -s);
      S(`wel${n}`, 0.04 + Math.sin(ph * 2 - 1.2) * whip * 0.45, 0, (0.06 + flare * 0.7) * -s);
      S(`wtp${n}`, Math.sin(ph * 2 - 1.9) * whip * 0.60, 0, flare * 0.5 * -s);
    }
  }
}

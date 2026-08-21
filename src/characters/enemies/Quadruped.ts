import { Enemy } from './EnemyBase.ts';
import { poseBone } from './RigBuilder.ts';
import { attackEnvelope, hitCurve, clamp01, smooth, decelerate } from '../rig/CreatureAnim.ts';

/**
 * Shared four-legged animation.
 *
 * Every quadruped in the bestiary answers the same questions — where are the
 * feet, how deep is the crouch before it commits, how does the spine whip
 * through the strike, which way does it fall — so all of that lives here and
 * a species supplies only the numbers that make it *that* animal: a sabertusk
 * coils and springs, a garula plants and shoves, a coeurl rears back.
 *
 * A subclass provides `A` (the tuning block below) and, optionally, overrides
 * `poseAttack` / `poseTelegraph` for a signature move.
 *
 * ```
 * A = {
 *   legs:   { fL:[...], fR:[...], bL:[...], bR:[...] }  bone chains
 *   trunk:  ['hips','spine','chest','neck','head']
 *   tails:  ['tail1','tail2','tail3']
 *   stride, lift, strideLen        gait geometry, metres
 *   crouch, lunge, drop            attack displacement, metres
 *   heavy                          true = never leaves the ground
 *   headDown, jaw                  how far the head drops / the mouth opens
 *   deathDrop, deathRoll           collapse depth and roll angle
 * }
 * ```
 */
export class QuadrupedEnemy extends Enemy {
  /** @returns tuning block; subclasses must define it. */
  get A(): any { return this.constructor.ANIM; }

  setupAnim(anim) {
    const A = this.A;
    anim.setTrunk(A.trunk);
    for (const id of ['fL', 'fR', 'bL', 'bR']) if (A.legs[id]) anim.leg(id, A.legs[id]);
  }

  /**
   * @param state legacy pose vocabulary
   * @param t phase seconds
   */
  pose(state: string, t: number) {
    if (!this.rig) return;
    // The trunk compensation is only knowable once the trunk has been posed,
    // so it is per-frame state: cleared here, filled by `spine()`, consumed by
    // `stance()`. A pose that solves its legs before bending its spine simply
    // gets no compensation, which is the old behaviour rather than a wrong one.
    this._comp = null;
    this._chestPitch = 0;
    const S = (n, x, y, z) => poseBone(this.rig, n, x, y, z);
    switch (state) {
      case 'run':
      case 'approach': this.poseLocomotion(S, t); break;
      case 'telegraph': this.poseTelegraph(S, t); break;
      case 'attack': this.poseAttack(S, t); break;
      case 'flinch': this.poseFlinch(S, t); break;
      case 'stagger': this.poseStagger(S, t); break;
      case 'death': this.poseDeath(S, t); break;
      default: this.poseIdle(S, t); break;
    }
  }

  /* ------------------------------------------------------------ helpers */

  /**
   * Place all four feet relative to bind. `drop` lowers the body while the
   * feet stay planted — which is what crouching is. Shortening the legs alone
   * lifts the paws and the animal appears to hover.
   * @param S pose writer
   * @param o {drop, front:{reach,lift,splay}, back:{...}}
   */
  stance(S: ((...args: any[]) => any), o: any) {
    const a = this.anim, A = this.A;
    const drop = o.drop || 0;
    const f = o.front || {}, b = o.back || {};
    // whatever the trunk did this frame, cancelled out of the foot targets
    const c = this._comp || ZERO_COMP;
    for (const id of ['fL', 'fR']) {
      a.solveLeg(id, f.reach || 0, (f.lift || 0) + drop, S, {
        kneeSign: A.kneeF ?? 1, footPitch: A.footPitchF ?? -0.12,
        splay: (f.splay || 0) * (id === 'fL' ? -1 : 1),
        rootPitch: c.f.pitch, rootDY: c.f.dy, rootDZ: c.f.dz,
      });
    }
    for (const id of ['bL', 'bR']) {
      a.solveLeg(id, b.reach || 0, (b.lift || 0) + drop, S, {
        kneeSign: A.kneeB ?? -1, footPitch: A.footPitchB ?? 0.10,
        splay: (b.splay || 0) * (id === 'bL' ? -1 : 1),
        rootPitch: c.b.pitch, rootDY: c.b.dy, rootDZ: c.b.dz,
      });
    }
    if (drop) this.visual.position.y -= drop;
  }

  /**
   * Bend the spine chain, distributing the angle along its length.
   *
   * These are a *parent chain*, so the links compound: the chest's world pitch
   * is the sum of hips + spine + chest, not the chest's own weight. That sum
   * is recorded here as `_comp`, because the leg IK solves in each leg root's
   * bind frame and has no other way to know the shoulder it is hanging off has
   * just swung. Front legs parent to the chest and inherit the whole sum; back
   * legs parent to the hips and inherit only the first link.
   */
  spine(S, pitch, yaw = 0, roll = 0, w = SPINE_W) {
    const t = this.A.trunk;
    // The weights are *shares of one bend*, so they are normalised against the
    // run from hips to chest. Used raw they compound down the parent chain and
    // a "0.16 rad crouch" arrives at the chest as 0.44 — which is how the
    // telegraph ended up with the animal's muzzle in the dirt.
    const n = 1 / this._spineNorm(w);
    let acc = 0, front = 0, back = 0;
    for (let i = 0; i < t.length; i++) {
      const k = w[Math.min(w.length - 1, i)] * n;
      S(t[i], pitch * k, yaw * k, roll * k);
      // hips is link 0; the chest is the last link before neck/head
      if (i === 0) back = acc + pitch * k;
      if (i <= t.length - 3) front = acc + pitch * k;
      acc += pitch * k;
    }
    this._chestPitch = front;
    this._comp = {
      f: this._rootShift(this.A.frontRoot, front, w, pitch * n),
      b: { pitch: back, dy: 0, dz: 0 },
    };
  }

  /** Sum of the spine weights from hips to chest, cached per weight array. */
  _spineNorm(w) {
    if (this._normW === w) return this._normV;
    const t = this.A.trunk;
    let sum = 0;
    for (let i = 0; i <= t.length - 3; i++) sum += w[Math.min(w.length - 1, i)];
    this._normW = w;
    this._normV = sum > 1e-4 ? sum : 1;
    return this._normV;
  }

  /**
   * How far a leg root is carried by the trunk links above it.
   *
   * A rotation about a joint moves everything distal to it: for a small pitch
   * θ about a pivot at (py, pz), a point at (y, z) shifts by
   * (-θ·(z − pz), +θ·(y − py)). Summing that over the trunk links gives the
   * translation the leg solver has to cancel so the paw does not follow the
   * shoulder into the dirt.
   */
  _rootShift(rootName, pitch, w, total) {
    const t = this.A.trunk;
    const p = this._bindAt(rootName || t[Math.max(0, t.length - 3)]);
    if (!p) return { pitch, dy: 0, dz: 0 };
    let dy = 0, dz = 0;
    for (let i = 0; i <= t.length - 3; i++) {
      const piv = this._bindAt(t[i]);
      if (!piv) continue;
      const th = total * w[Math.min(w.length - 1, i)];
      dy += -th * (p.z - piv.z);
      dz += th * (p.y - piv.y);
    }
    return { pitch, dy, dz };
  }

  /**
   * Bind-pose world position of a bone, cached per species.
   *
   * Every enemy bone has identity rotation in bind pose, so a bone's bind
   * world position is just the sum of the local offsets up its parent chain —
   * and those offsets never change, however the creature is posed. That makes
   * this readable off a live, mid-animation skeleton.
   */
  _bindAt(name) {
    if (!this.rig) return null;
    let cache = this._bindPos;
    if (!cache) { cache = this._bindPos = new Map(); }
    let v = cache.get(name);
    if (v !== undefined) return v;
    let b = this.rig.byName.get(name);
    if (!b) { cache.set(name, null); return null; }
    let y = 0, z = 0;
    while (b && b.isBone) { y += b.position.y; z += b.position.z; b = b.parent; }
    v = { y, z };
    cache.set(name, v);
    return v;
  }

  /**
   * Point the skull, in spite of what the trunk just did.
   *
   * `spine()` writes the whole chain including neck and head, so a body that
   * pitches 25° to crouch drags its muzzle 25° into the dirt — the animal
   * reads as sniffing the ground rather than sighting a target. Subtracting
   * the accumulated chest pitch back out puts the head under the *pose's*
   * control instead of the spine's, which is how a predator actually holds it:
   * the body does the moving, the head stays locked on.
   *
   * @param S pose writer
   * @param o {pitch, yaw, roll, stabilise} — pitch is relative to
   *   level, positive = nose down; `stabilise` 0..1 how much trunk pitch to
   *   cancel (1 = perfectly level head, 0 = head rides the spine).
   */
  aimHead(S: ((...args: any[]) => any), o: any = {}) {
    const t = this.A.trunk;
    const stab = this._chestPitch * (o.stabilise ?? (this.A.headStabilise ?? 0.85));
    const pitch = o.pitch || 0, yaw = o.yaw || 0, roll = o.roll || 0;
    S(t[t.length - 2], -stab * 0.6 + pitch * 0.4, yaw * 0.45, roll * 0.4);
    S(t[t.length - 1], -stab * 0.4 + pitch * 0.6, yaw * 0.55, roll * 0.6);
  }

  /** Tail bones as a lagging travelling wave. */
  tail(t, base, amp, freq, curl = 0) {
    const names = this.A.tails;
    if (!names) return;
    for (let i = 0; i < names.length; i++) {
      const lag = i * 0.55;
      poseBone(this.rig, names[i],
        base * (1 - i * 0.2) + curl * (i + 1) / names.length,
        Math.sin(t * freq - lag) * amp * (0.55 + i * 0.3), 0);
    }
  }

  _timingAll() {
    return {
      telegraph: this._timing('telegraph'), strike: this._timing('strike'),
      attack: this._timing('attack'), recover: this._timing('recover'),
    };
  }

  /* -------------------------------------------------------------- poses */

  poseLocomotion(S, t) {
    const A = this.A, a = this.anim;
    const sp = this.moveSpeed || 0;
    const norm = clamp01(sp / this.speed);
    const gait = a.pickGait(norm, A.heavy);
    a.stride(this._dt || 0, sp, A.strideLen * gait.stride);
    const ph = a.gaitPhase * Math.PI * 2;
    // The spine flexes and extends with the stride once the animal is running.
    // Small numbers: the five trunk links compound, so the chest ends up at
    // ~2.75x whatever is asked for here.
    const flex = Math.max(0, norm - 0.35) * (A.flex ?? 1.0);
    // Spine first — the legs need to know where the shoulder ended up.
    this.spine(S,
      a.bodyPitch * 1.4 + Math.sin(ph * 2) * 0.06 * flex,
      Math.sin(ph) * 0.03 * (A.headSway ?? 1),
      0);
    const c = this._comp || ZERO_COMP;
    a.quadGait(gait, S, {
      stride: A.stride, lift: A.lift, splay: A.splay || 0.02,
      kneeF: A.kneeF ?? 1, kneeB: A.kneeB ?? -1,
      footPitch: A.footPitchF ?? -0.12, bodyScale: A.bodyScale || 1,
      frontScale: A.frontScale || 1, backScale: A.backScale || 1,
      compF: c.f, compB: c.b,
    });
    // A running predator holds its skull still — it is the sensor platform.
    // Counter the trunk's pitch at the neck so the head rides level instead of
    // pumping through half a metre every stride.
    const stab = this._chestPitch * (A.headStabilise ?? 0.85);
    S(A.trunk[A.trunk.length - 2] || 'neck', -0.05 - norm * (A.runNeck ?? 0.14) - stab * 0.6, 0, 0);
    S(A.trunk[A.trunk.length - 1] || 'head',
      0.05 + norm * (A.runHead ?? 0.12) - stab * 0.4 + Math.sin(ph * 2) * 0.02, Math.sin(ph) * 0.03, 0);
    if (A.jawBone) S(A.jawBone, clamp01(norm - 0.55) * (A.jaw ?? 0.34));
    this.tail(t, A.tailRun ?? -0.3, 0.2 + norm * 0.14, 4 + norm * 4);
  }

  poseTelegraph(S, t) {
    const A = this.A;
    const env = attackEnvelope('telegraph', this.stateTime, this._timingAll());
    const k = env.tension;
    const c = k * this.telegraphScale();
    // The gather: forequarters sink onto a nose-down pitch about the hips while
    // the haunches load and the feet stay planted. That front-low/rear-high
    // wedge is the whole telegraph — it has to read from the silhouette alone.
    this.spine(S, A.crouchPitch * c + env.shake, 0, 0);
    this.stance(S, {
      drop: A.crouch * c,
      front: { reach: A.crouchFront * c, splay: (A.crouchSplay ?? 0.09) * c },
      back: { reach: A.crouchBack * c, splay: (A.crouchSplay ?? 0.09) * 0.7 * c },
    });
    // eyes stay on the target all the way through the wind-up
    this.aimHead(S, { pitch: A.headDown * c * 0.35, stabilise: 1 });
    if (A.jawBone) S(A.jawBone, (A.jaw ?? 0.3) * k);
    this.tail(t, A.tailTel ?? 0.4 * k, 0.1, 3);
  }

  /** Species multiplier on how deep the wind-up goes for the chosen attack. */
  telegraphScale() { return 1; }

  /** Species multiplier on how far the strike leaves the ground. */
  leapScale() { return 1; }

  poseAttack(S, t) {
    const A = this.A;
    const env = attackEnvelope(this.state === 'recover' ? 'recover' : 'attack', this.stateTime, this._timingAll());
    const k = env.k;
    const kp = clamp01(k);
    const leap = this.leapScale();
    this.spine(S, -A.strikePitch * k, 0, 0);
    this.stance(S, {
      front: { reach: A.lunge * k, lift: A.lungeLift * leap * kp },
      back: { reach: -A.lunge * 0.85 * k, lift: (A.lungeLiftBack || 0) * leap * kp },
    });
    // the head leads the strike: it drives *through* the target, not with the body
    this.aimHead(S, { pitch: A.headThrust * k, stabilise: 0.7 });
    if (A.jawBone) {
      // the jaw snaps shut *through* the contact frame, not at it
      const bite = env.phase === 'strike' ? 1 - env.f : (env.phase === 'follow' ? 0 : 0.75);
      S(A.jawBone, (A.jawBite ?? 0.95) * bite * clamp01(k + 0.4));
    }
    this.tail(t, -0.5 * kp, 0.12, 4);
    this.visual.position.y += (A.hop || 0) * leap * Math.max(0, k);
    this.visual.rotation.x += -(A.pitchThrough ?? 0.10) * k;
  }

  poseFlinch(S, t) {
    const A = this.A;
    const k = hitCurve(this.stateTime, 0.35, 0);
    const p = Math.min(1.3, this.hitPower || 0.5);
    this.spine(S, 0.22 * k * p, 0, 0);
    this.stance(S, {
      drop: A.crouch * 0.35 * k * p,
      front: { reach: -0.03 * k * p },
      back: { reach: 0.02 * k * p },
    });
    // the head snaps away from the blow — recoil, not a nod
    this.aimHead(S, {
      pitch: -0.40 * k * p, roll: 0.20 * k * p * Math.sign(this.anim.hitYaw.x || 1),
      stabilise: 1,
    });
    if (A.jawBone) S(A.jawBone, 0.45 * k);
    this.tail(t, 0.25 * k, 0.2, 6);
  }

  poseStagger(S, t) {
    const A = this.A;
    const total = this.type.staggerDuration || 2.4;
    const k = smooth(this.stateTime / 0.18) * clamp01(1 - (this.stateTime - total * 0.72) / (total * 0.28));
    const wob = Math.sin(this.stateTime * (A.heavy ? 4.2 : 7.5)) * k;
    this.spine(S, 0.26 * k, wob * 0.20, wob * 0.20);
    this.stance(S, {
      drop: A.crouch * 1.15 * k,
      front: { reach: 0.10 * k, splay: 0.22 * k },
      back: { reach: -0.06 * k, splay: 0.18 * k },
    });
    this.aimHead(S, { pitch: -0.50 * k, yaw: wob * 0.26, roll: wob * 0.20, stabilise: 1 });
    if (A.jawBone) S(A.jawBone, 0.55 * k);
    this.tail(t, 0.20 * k, 0.28, 5);
    this.visual.rotation.z += wob * 0.08;
  }

  poseDeath(S, t) {
    const A = this.A;
    const T = this.stateTime;
    const sl = A.deathSlow || 1;
    // Three beats: the legs give way, the mass drops, the body topples onto
    // its flank — then a late twitch so the corpse is not simply switched off.
    const buckle = smooth(clamp01(T / (0.20 * sl)));
    const fall = decelerate(clamp01((T - 0.10 * sl) / (0.40 * sl)), 2.2);
    const roll = decelerate(clamp01((T - 0.20 * sl) / (0.52 * sl)), 2.4);
    const side = this.deathSide || 1;
    // A corpse settles on its flank and stops. Rolling past ~80° carries it
    // onto its spine with the legs folded over the belly, which reads as a
    // deflating ball rather than a dead animal.
    const th = Math.min(1.45, roll * A.deathRoll) * side;
    const sink = A.bodyY - A.bodyR;
    const tw = T > 0.9 * sl && T < 2.0 * sl
      ? Math.exp(-(T - 0.9 * sl) * 3.4) * Math.sin((T - 0.9 * sl) * 20) * 0.05 : 0;
    // the legs fold under rather than staying planted: lifting the feet by the
    // same distance the body drops keeps them on the ground while it collapses
    this.spine(S, 0.22 * fall + tw, 0.26 * roll * side, 0);
    // The legs splay *out* from under the body as it goes over rather than
    // folding in, so the corpse keeps its length instead of balling up.
    this.stance(S, {
      front: { reach: 0.16 * buckle + 0.20 * roll, lift: sink * fall, splay: 0.5 * roll },
      back: { reach: -0.14 * fall - 0.18 * roll, lift: sink * fall, splay: 0.45 * roll },
    });
    // the head goes limp and last, dragged by the roll
    this.aimHead(S, {
      pitch: -0.28 * buckle + 0.34 * roll, yaw: 0.30 * roll * side,
      roll: 0.30 * roll * side, stabilise: 0.35,
    });
    if (A.jawBone) S(A.jawBone, 0.42 * buckle * (1 - roll * 0.5));
    this.tail(t, 0.10 - 0.35 * fall, 0.28 * (1 - roll), 3);
    // `visual` pivots at ground level, so a roll about it swings the body
    // *through* the floor. Solve for where the body centre should end up and
    // translate by the difference instead of guessing an offset.
    const centre = A.bodyY - sink * fall;
    this.visual.rotation.z += th;
    this.visual.rotation.x += fall * 0.06;
    this.visual.position.y += centre - A.bodyY * Math.cos(th);
    this.visual.position.x += A.bodyY * Math.sin(th) * 0.5;
  }

  poseIdle(S, t) {
    const A = this.A;
    const br = Math.sin(t * (A.breath ?? 1.5)) * 0.03 + Math.sin(t * 0.61) * 0.012;
    this.spine(S, br, Math.sin(t * 0.31) * 0.06, Math.sin(t * 0.4) * 0.012);
    this.stance(S, {
      drop: A.crouch * 0.10 + br * 0.2 * (A.breathY ?? 1),
      front: { reach: 0.015 * Math.sin(t * 0.8) },
      back: { reach: -0.02, splay: 0.02 },
    });
    // an idling animal scans: the head turns on its own clock, not the body's
    this.aimHead(S, {
      pitch: 0.04 + (A.idleHead || 0), yaw: Math.sin(t * 0.23 + this.id) * 0.34,
      roll: Math.sin(t * 0.19) * 0.05, stabilise: 1,
    });
    if (A.jawBone) S(A.jawBone, 0.05 + Math.max(0, Math.sin(t * 0.4 - 1.2)) * 0.10);
    this.tail(t, A.tailIdle ?? -0.12, 0.2, 1.1);
  }
}

/** How much of a spine bend each link takes, root first. These compound. */
const SPINE_W = [0.9, 1.0, 0.85, 0.7, 0.6];

/** No trunk motion to cancel — used before `spine()` has run this frame. */
const ZERO_COMP = { f: { pitch: 0, dy: 0, dz: 0 }, b: { pitch: 0, dy: 0, dz: 0 } };

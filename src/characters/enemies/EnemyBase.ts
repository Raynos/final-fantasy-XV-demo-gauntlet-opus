import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { normalFromHeight, makeDataMap } from '../../util/TextureGen.ts';
import { Noise } from '../../util/Noise.ts';
import { CreatureAnim } from '../rig/CreatureAnim.ts';

/**
 * Shared enemy behaviour.
 *
 * An enemy runs a small perception → decision → action loop:
 *
 *   sleep ─(wake hour)─▶ patrol ─(see/hear)─▶ alert ─(confirm)─▶ combat
 *     ▲                    ▲                                      │
 *     └──────── return ◀───┴──────────────(lost target, leashed)◀─┘
 *
 * In combat the pack (see `game/encounters/Pack.js`) hands out roles so a
 * group flanks and takes turns instead of queueing: only a couple of members
 * hold the `engage` token at once, everyone else circles to a ring slot.
 *
 * Subclasses supply `buildPrototype()` (geometry + rig, built once per type
 * and instanced via skeleton cloning) and `pose(state, phase, ctx)`. `pose` is
 * always called with the *legacy* state vocabulary
 * (`idle|approach|run|telegraph|attack|flinch|stagger|death`) so the four
 * original species keep working; richer species can read `this.state` and
 * `this.attackId` directly for extra variants.
 */
export class Enemy {
  constructor(type, opts = {}) {
    this.type = type;
    this.id = opts.id ?? 0;
    this.root = new THREE.Group();
    this.velocity = new THREE.Vector3();
    this.heading = opts.heading ?? 0;

    const s = type.stats;
    this.baseMaxHp = s.hp;
    this.maxHp = opts.maxHp ?? s.hp;
    this.hp = this.maxHp;
    this.maxPoise = s.poise;
    this.poise = this.maxPoise;
    this.speed = s.speed;
    this.attackRange = s.attackRange;
    this.aggroRange = s.aggroRange;
    this.radius = s.radius;
    this.height = s.height;
    this.damage = s.damage;
    this.scale = opts.scale ?? 1;
    this.level = opts.level ?? s.level ?? 12;
    this.name = opts.name || s.name;

    /** 'beast' | 'daemon' | 'imperial' — drives spawn windows and light weakness. */
    this.faction = type.faction || 'beast';
    /** EXP bucket read by `Stats.expForKill`. */
    this.expClass = opts.expClass || type.expClass || 'normal';
    /** Stable id the quest log matches kill objectives against. */
    this.speciesId = type.questId || type.key;

    this.state = 'idle';
    this.stateTime = 0;
    this.phase = 0;              // animation phase, seconds
    this.target = null;
    this.dead = false;
    this.staggered = false;
    this.staggerTime = 0;
    this.flinchTime = 0;
    this.attackCooldown = opts.cooldown ?? 1.2;
    this.locked = false;         // player has lock-on
    this.frozenPose = null;      // scenario override
    this.corpseTime = 0;

    /* ---- perception / territory ------------------------------------- */
    const sense = type.senses || {};
    this.sight = sense.sight ?? s.aggroRange;
    this.fov = sense.fov ?? 1.9;               // half-angle, radians
    this.hearing = sense.hearing ?? 12;
    this.nocturnal = !!(sense.nocturnal ?? (type.faction === 'daemon'));
    /** Rises while the enemy is noticing something, falls when it is not. */
    this.awareness = 0;
    this.home = new THREE.Vector3();
    this.leash = opts.leash ?? 44;
    this.patrol = null;          // {points:[Vector3], index, wait, waitTimer}
    this.packRole = 'engage';
    this.slotAngle = 0;
    this.pack = null;
    this._senseTimer = (this.id % 7) * 0.037;
    this._roleTimer = 0;
    this._lostTimer = 0;
    this._strafeDir = (this.id % 2) ? 1 : -1;
    this._wanderTimer = 0;
    this._wanderAngle = 0;

    /* ---- attacks ----------------------------------------------------- */
    this.attacks = type.attacks || null;
    this.attack = null;          // the attack currently being performed
    this.attackId = null;
    this._swung = false;
    this._atkCooldown = 0;

    this.boss = !!type.boss;
    this.phaseIndex = 0;         // boss phase, driven by BossFight
    this.invulnerable = false;
    this.superArmour = !!type.superArmour;
  }

  get position() { return this.root.position; }

  /** Fraction of max HP remaining, 0..1. */
  get hpFraction() { return this.maxHp > 0 ? this.hp / this.maxHp : 0; }

  /** Instantiate the shared prototype for this enemy. */
  attachVisual(proto) {
    const group = cloneSkinned(proto.group);
    const byName = new Map(), rest = new Map();
    let mesh = null;
    group.traverse((o) => {
      if (o.isBone) { byName.set(o.name, o); rest.set(o.name, o.quaternion.clone()); }
      if (o.isSkinnedMesh) mesh = o;
    });
    if (mesh) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; }
    this.rig = { byName, rest };
    this.mesh = mesh;
    this.visual = group;
    group.scale.setScalar(this.scale);
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    this.root.add(group);
    /**
     * Shared animation state — gait phase, solved leg chains, impact springs.
     * `setupAnim()` is where a species declares its legs and spine; species
     * that do not override it simply get the additive impact layer.
     */
    this.anim = new CreatureAnim(this);
    this.setupAnim(this.anim);
    return group;
  }

  /** Species hook: register leg chains and the trunk for the impact layer. */
  setupAnim(anim) {
    const has = (n) => this.rig.byName.has(n);
    const trunk = ['hips', 'pelvis', 'spine', 'spineA', 'spineB', 'chest', 'core', 'pod', 'neck', 'head'];
    anim.setTrunk(trunk.filter(has));
  }

  /** Reset a pooled instance back to a spawnable state. */
  reset(opts = {}) {
    this.maxHp = opts.maxHp ?? this.baseMaxHp;
    this.hp = this.maxHp;
    this.poise = this.maxPoise;
    this.level = opts.level ?? this.type.stats.level ?? 12;
    this.damage = opts.damage ?? this.type.stats.damage;
    this.dead = false;
    this.staggered = false;
    this.corpseTime = 0;
    this.awareness = 0;
    this.target = null;
    this.pack = null;
    this.patrol = null;
    this.attack = null;
    this.attackId = null;
    this.invulnerable = false;
    this.frozenPose = null;
    this.phaseIndex = 0;
    this.setState('idle');
    this.stateTime = 0;
    this.hitPower = 0;
    this.restBones();
    if (this._kb) this._kb.set(0, 0, 0);
    if (this.anim) {
      for (const s of [this.anim.hitPitch, this.anim.hitRoll, this.anim.hitYaw, this.anim.pushZ, this.anim.pushX]) s.reset();
      this.anim.hitAmount = 0;
      this.anim.shake = 0;
      this.anim.airborne = false;
      this.anim.bodyY = this.anim.bodyRoll = this.anim.bodyPitch = 0;
    }
    if (this.visual) {
      this.visual.rotation.set(0, 0, 0);
      this.visual.position.set(0, 0, 0);
      this.visual.visible = true;
      this.visual.scale.setScalar(this.scale);
    }
    return this;
  }

  /**
   * Put every bone back in its bind rotation.
   *
   * `pose()` only writes the bones it cares about, so whatever the previous
   * pose left in the others carries over. That is usually wanted — a goblin's
   * attack deliberately keeps the crouch its telegraph put in the legs — but
   * it is wrong across a *discontinuity*: a pooled sabertusk respawning must
   * not begin life folded into the corpse the last one died in, a corpse must
   * not inherit the bent ankles of the stagger that preceded it, and a
   * screenshot pose must not depend on which pose the instance happened to
   * hold before it. Called at those four boundaries only, never per frame.
   */
  restBones() {
    if (!this.rig) return;
    for (const [name, bone] of this.rig.byName) {
      const r = this.rig.rest.get(name);
      if (r) bone.quaternion.copy(r);
    }
  }

  /** Centre of mass in world space — the point VFX and lock-on aim at. */
  centre(out = new THREE.Vector3()) {
    return out.set(this.root.position.x, this.root.position.y + this.height * 0.55 * this.scale, this.root.position.z);
  }

  /**
   * Lowest point the *skinned* body currently reaches, in metres relative to
   * the root — which sits on the terrain. Zero means the model is standing
   * exactly on the ground; negative is underground.
   *
   * Every vertex goes through `applyBoneTransform`: `Box3.setFromObject` on a
   * `SkinnedMesh` reads `geometry.boundingBox`, which is the *bind* pose, so
   * it cannot see a skeleton that has folded through the floor — the whole
   * question being asked here.
   *
   * Two passes, because a body is up to 50k vertices and this is asked a few
   * hundred times per species: a strided sweep to find roughly where the low
   * point is, then an exhaustive sweep of the vertices *around* it. Parts are
   * built one after another, so neighbouring indices are neighbouring
   * geometry and the refinement lands on the same foot the coarse pass found.
   * Strided sampling alone is not enough — it under-reports depth by up to
   * half a metre on a big machine, which is precisely the error it is being
   * used to correct.
   *
   * @returns {number} metres; negative is underground
   */
  poseFloor() {
    if (!this.visual) return 0;
    this.root.updateMatrixWorld(true);
    const ry = this.root.matrixWorld.elements[13];
    const v = _calV;
    let minY = Infinity, bestObj = null, bestIdx = 0, bestStep = 1;
    this.visual.traverse((o) => {
      const geo = o.geometry;
      if (!geo || !geo.attributes || !geo.attributes.position) return;
      const pos = geo.attributes.position;
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.update();
      const step = Math.max(1, Math.floor(pos.count / 900));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i);
        if (o.isSkinnedMesh) o.applyBoneTransform(i, v);
        v.applyMatrix4(o.matrixWorld);
        if (v.y < minY) { minY = v.y; bestObj = o; bestIdx = i; bestStep = step; }
      }
    });
    if (bestObj && bestStep > 1) {
      const pos = bestObj.geometry.attributes.position;
      const lo = Math.max(0, bestIdx - bestStep * 3);
      const hi = Math.min(pos.count, bestIdx + bestStep * 3);
      for (let i = lo; i < hi; i++) {
        v.fromBufferAttribute(pos, i);
        if (bestObj.isSkinnedMesh) bestObj.applyBoneTransform(i, v);
        v.applyMatrix4(bestObj.matrixWorld);
        if (v.y < minY) minY = v.y;
      }
    }
    if (!isFinite(minY)) return 0;
    return minY - ry;
  }

  /**
   * Measure, once per species, how far each named pose actually reaches below
   * the ground, and cache the lift that puts it back on it.
   *
   * The poses that settle a body — a corpse going over, a stagger crouching —
   * were authored as a *downward translation* with a hand-picked constant:
   * `visual.position.y = -0.80 * e`. That is not a settle, it is a burial. The
   * body rotates about `visual`, which sits on the terrain, so the roll
   * already swings the model down through the floor; subtracting a constant on
   * top of it put fifteen corpses between 0.5 m and 1.3 m underground and the
   * magitek walker 1.7 m under during a stagger. A corpse lingers six seconds
   * in live combat, so this is visible in play, not only in captures.
   *
   * Constants also cannot be right for long: the offset a pose needs scales
   * with the creature's size and with its silhouette, so every sculpt change
   * invalidates every number. Measuring the model instead means the correction
   * follows the model. The pose runs at a spread of `stateTime` values and the
   * shortfall is stored as a curve, because the amount needed changes
   * throughout the pose and a single worst-case number would hold a corpse in
   * the air for the first half of its fall.
   *
   * Cheap: a few hundred vertices × twelve samples × a handful of poses, once
   * per species, on the frame that species first spawns.
   *
   * @param {string[]} poses pose names to calibrate
   */
  calibrateGround(poses = GROUND_CAL_POSES) {
    if (this.type._groundCal || !this.rig || !this.visual) return;
    // A creature whose model deliberately continues below the ground has no
    // "foot" to measure — see `TITAN.buriedBase`.
    if (this.type.buriedBase) { this.type._groundCal = {}; return; }
    const cal = {};
    // Published before posing, so `groundLift()` reads zero for the pose it is
    // currently measuring and the measurement stays a measurement.
    this.type._groundCal = cal;

    const bones = [...this.rig.byName.values()];
    const saved = bones.map((b) => b.quaternion.clone());
    const savePos = this.visual.position.clone();
    const saveRot = this.visual.rotation.clone();
    const saveState = this.stateTime, savePhase = this.phase;
    const saveHit = this.hitPower;
    this.hitPower = 1;

    const saveAtk = this.attack, saveAtkId = this.attackId;
    for (const pose of poses) {
      // A telegraph and a strike are a different shape for every attack the
      // species owns, so each gets its own curve; `groundLift` prefers the
      // specific one and falls back to the generic.
      const variants = (POSE_PER_ATTACK.has(pose) && this.attacks)
        ? this.attacks.map((a) => [`${pose}:${a.id}`, a]) : [];
      for (const [key, atk] of [[pose, null], ...variants]) {
        this.attack = atk;
        this.attackId = atk ? atk.id : null;
        const curve = new Float64Array(GROUND_CAL_T.length);
        let any = false;
        for (let i = 0; i < GROUND_CAL_T.length; i++) {
          this.stateTime = GROUND_CAL_T[i];
          this.phase = GROUND_CAL_T[i];
          // Same entry conditions the live and frozen paths give the pose, so
          // the number measured here is the number that will be needed there.
          this.restBones();
          this._resetVisual();
          this.pose(pose, this.phase, null);
          const lift = Math.max(0, -this.poseFloor() - GROUND_SINK) / (this.scale || 1);
          curve[i] = lift;
          if (lift > 1e-4) any = true;
        }
        if (any) cal[key] = curve;
      }
    }
    this.attack = saveAtk;
    this.attackId = saveAtkId;

    for (let i = 0; i < bones.length; i++) bones[i].quaternion.copy(saved[i]);
    this.visual.position.copy(savePos);
    this.visual.rotation.copy(saveRot);
    this.stateTime = saveState;
    this.phase = savePhase;
    this.hitPower = saveHit;
    this.root.updateMatrixWorld(true);
  }

  /**
   * Metres to add to `visual.position.y` so the named pose stands on the
   * ground at the current `stateTime`. Zero until `calibrateGround()` has run,
   * and zero for any pose that never reached below it.
   *
   * @param {string} pose pose name, as passed to `pose()`
   */
  groundLift(pose) {
    const cal = this.type._groundCal;
    if (!cal) return 0;
    const curve = (this.attackId && cal[`${pose}:${this.attackId}`]) || cal[pose];
    if (!curve) return 0;
    const T = GROUND_CAL_T;
    const t = this.stateTime;
    const s = this.scale || 1;
    if (t <= T[0]) return curve[0] * s;
    for (let i = 1; i < T.length; i++) {
      if (t <= T[i]) {
        const f = (t - T[i - 1]) / (T[i] - T[i - 1]);
        return (curve[i - 1] + (curve[i] - curve[i - 1]) * f) * s;
      }
    }
    return curve[T.length - 1] * s;
  }

  /**
   * Percent-of-damage-taken for an element. 100 = neutral, >100 weak,
   * <100 resistant, 0 immune. Feeds `Stats.computeDamage` unchanged.
   * @param {string} element
   */
  resistance(element) {
    const t = this.type;
    if (t.resistPct && t.resistPct[element] != null) return t.resistPct[element];
    if (t.weakness === element) return 160;
    if (t.resist === element) return 50;
    if (element === 'light' && this.faction === 'daemon') return 175;
    return 100;
  }

  /** Weapon classes this creature is soft against (`computeDamage`). */
  get weakTo() { return this.type.weakTo || EMPTY; }
  /** Weapon classes that bounce off it. */
  get resistsWeapon() { return this.type.resistsWeapon || EMPTY; }
  /** Stagger multiplier the damage formula uses. */
  get staggerMult() { return this.staggered ? 2.0 : (this.state === 'telegraph' ? 1.25 : 1); }
  /** Physical mitigation, so `computeDamage` has something to bite on. */
  get defense() { return Math.round(8 + this.level * 3.1 + (this.type.defense || 0)); }
  get magicDefense() { return Math.round(6 + this.level * 2.6 + (this.type.magicDefense || 0)); }

  /**
   * Apply damage. Returns a result the combat system turns into events.
   * @param {number} amount
   * @param {THREE.Vector3} dir world-space direction of the blow
   * @param {object} o {poise, blindside, element, weaponClass, noFlinch}
   */
  hit(amount, dir, o = {}) {
    if (this.dead || this.invulnerable) return null;
    let dmg = amount;
    if (o.blindside) dmg *= 1.35;

    const el = o.element || 'physical';
    if (el !== 'physical') dmg *= this.resistance(el) / 100;
    if (o.weaponClass) {
      if (this.weakTo.includes(o.weaponClass)) dmg *= 1.4;
      else if (this.resistsWeapon.includes(o.weaponClass)) dmg *= 0.6;
    }
    if (this.staggered) dmg *= 1.7;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;

    let staggered = false;
    if (!this.superArmour || this.hp <= this.maxHp * 0.35) {
      this.poise -= (o.poise ?? 10);
      if (this.poise <= 0) {
        this.poise = this.maxPoise;
        staggered = true;
        this.staggered = true;
        this.staggerTime = this.type.staggerDuration || 2.4;
        this._endAttack();
        this.restBones();
        this.setState('stagger');
      } else if (this.state !== 'stagger' && !o.noFlinch && !this.superArmour
        && this.state !== 'attack' && this.state !== 'telegraph') {
        this.setState('flinch');
      }
    }
    this.flinchDir = dir ? dir.clone().normalize() : new THREE.Vector3(0, 0, 1);

    /* ---- physical reaction ------------------------------------------- */
    // Severity is a blend of how big the hit was relative to this creature's
    // own health pool and how much poise it broke — a chip of a Titan must not
    // rock it the way the same number rocks a sabertusk.
    const frac = dmg / Math.max(1, this.maxHp);
    let power = Math.min(1.6, frac * 9 + (o.poise ?? 10) / 55);
    if (staggered) power = Math.max(power, 1.15);
    if (this.superArmour) power *= 0.35;
    this.hitPower = power;
    if (this.anim) this.anim.impact(this.flinchDir, power, this.heading);
    // knockback: a slide the creature has to arrest, not a teleport
    const kb = Math.min(this.knockbackCap ?? 3.6, power * (staggered ? 3.2 : 1.5)) / (1 + this.radius * 0.9);
    if (kb > 0.05) {
      this._kb = this._kb || new THREE.Vector3();
      this._kb.copy(this.flinchDir).setY(0).normalize().multiplyScalar(kb);
    }
    this.lastHitAt = this.phase;

    // being hit is the loudest possible cue
    if (!this.target && o.source) this.target = o.source;
    this.awareness = 1;
    if (this.state === 'idle' || this.state === 'patrol' || this.state === 'sleep' || this.state === 'alert') {
      this.setState('chase');
    }

    if (this.hp <= 0) { this.hp = 0; this.die(o.killer || null); }
    return {
      enemy: this, damage: dmg, staggered, killed: this.dead,
      crit: !!o.blindside, element: o.element || null,
    };
  }

  die(killer = null) {
    this.dead = true;
    this.killer = killer;
    this.invulnerable = true;
    this.corpseTime = 0;
    this.attack = null;
    this.restBones();
    /**
     * Which way the corpse goes down. A death that always folds the same way
     * looks scripted; taking the side from the killing blow means the same
     * animation reads differently every time.
     */
    const d = this.flinchDir || new THREE.Vector3(0, 0, 1);
    const cs = Math.cos(-this.heading), sn = Math.sin(-this.heading);
    this.deathSide = (d.x * cs - d.z * sn) >= 0 ? 1 : -1;
    this.deathPush = d.x * sn + d.z * cs;   // +1 hit from the front, -1 from behind
    this.setState('death');
    if (this.pack) this.pack.onDeath(this);
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
  }

  /* ------------------------------------------------------------ senses */

  /**
   * Can this enemy perceive `t` right now? Sight is a cone, narrowed at
   * night for daylight animals and widened for daemons; hearing is a plain
   * radius scaled by how fast the target is moving.
   * @param {object} t something with `.position` and optional `.speed`
   * @param {object} ctx
   */
  perceives(t, ctx) {
    const p = t.position || t.root?.position;
    if (!p) return 0;
    const dx = p.x - this.root.position.x, dz = p.z - this.root.position.z;
    const d2 = dx * dx + dz * dz;
    const night = ctx && ctx.night ? ctx.night : 0;
    const sightRange = this.sight * (this.nocturnal ? 1 + night * 0.45 : 1 - night * 0.3);
    if (d2 < sightRange * sightRange) {
      const d = Math.sqrt(d2) || 1e-4;
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const dot = (dx / d) * fx + (dz / d) * fz;
      // very close range is felt, not seen
      if (d < this.radius * 3 + 2.5 || dot > Math.cos(this.fov)) {
        return THREE.MathUtils.clamp(1.6 - d / sightRange, 0.25, 1);
      }
    }
    const noise = t.speed != null ? THREE.MathUtils.clamp(t.speed / 5, 0.25, 1.4) : 0.8;
    const hear = this.hearing * noise;
    if (d2 < hear * hear) return 0.45;
    return 0;
  }

  /* ------------------------------------------------------------ combat */

  /** Pick the next attack whose range covers `dist`, weighted. */
  _chooseAttack(dist, rng) {
    const list = this.attacks;
    if (!list || !list.length) return null;
    let total = 0;
    for (const a of list) {
      if (a.phase != null && a.phase > this.phaseIndex) continue;
      if (dist > (a.range || this.attackRange) * this.scale) continue;
      if (a.minRange && dist < a.minRange * this.scale) continue;
      total += a.weight || 1;
    }
    if (total <= 0) return null;
    let r = (rng ? rng() : Math.random()) * total;
    for (const a of list) {
      if (a.phase != null && a.phase > this.phaseIndex) continue;
      if (dist > (a.range || this.attackRange) * this.scale) continue;
      if (a.minRange && dist < a.minRange * this.scale) continue;
      r -= (a.weight || 1);
      if (r <= 0) return a;
    }
    return null;
  }

  /** Longest range any currently usable attack reaches. */
  get reach() {
    if (!this.attacks) return this.attackRange * this.scale;
    let m = 0;
    for (const a of this.attacks) {
      if (a.phase != null && a.phase > this.phaseIndex) continue;
      m = Math.max(m, (a.range || this.attackRange));
    }
    return (m || this.attackRange) * this.scale;
  }

  /**
   * The distance this creature actually wants to fight at — the range of its
   * *shortest* attack, not its longest. Without this a melee enemy parks at
   * the edge of its leap range and swings at nothing.
   */
  get fightRange() {
    if (!this.attacks || !this.attacks.length) return this.attackRange * this.scale;
    let m = Infinity;
    for (const a of this.attacks) {
      if (a.phase != null && a.phase > this.phaseIndex) continue;
      if (a.lunge) continue;                     // a leap is an opener, not a station
      m = Math.min(m, a.range || this.attackRange);
    }
    if (!Number.isFinite(m)) m = this.reach / this.scale;
    return m * this.scale;
  }

  _beginAttack(a) {
    this.attack = a;
    this.attackId = a ? a.id : null;
    this._swung = false;
    this.setState('telegraph');
  }

  _endAttack() {
    this.attack = null;
    this.attackId = null;
    this._swung = false;
  }

  /** Timing for the current attack, falling back to the legacy table. */
  _timing(field) {
    const t = this.type.timing || DEFAULT_TIMING;
    if (this.attack && this.attack[field] != null) return this.attack[field];
    return t[field] != null ? t[field] : DEFAULT_TIMING[field];
  }

  /* -------------------------------------------------------------- tick */

  /**
   * @param {number} dt
   * @param {object} ctx {terrain, player, allies, others, night, onStrike, rng}
   */
  update(dt, ctx) {
    this.stateTime += dt;
    this.phase += dt;
    /** Frame delta, so `pose()` can advance stride phase and springs. */
    this._dt = dt;
    if (this.frozenPose) return;
    if (this._atkCooldown > 0) this._atkCooldown -= dt;
    this.moveSpeed = 0;

    if (this.dead) {
      this.corpseTime += dt;
      if (ctx && ctx.terrain) {
        this.root.position.y = ctx.terrain.heightAt(this.root.position.x, this.root.position.z);
      }
      this._slide(dt, ctx);
      this._resetVisual();
      this.pose('death', this.phase, ctx);
      this.visual.position.y += this.groundLift('death');
      this._postPose(dt);
      return;
    }

    if (this.staggered) {
      this.staggerTime -= dt;
      if (this.staggerTime <= 0) { this.staggered = false; this.setState('chase'); }
    }

    this._sense(dt, ctx);

    const target = this.target;
    const tp = target ? (target.position || target.root?.position) : null;
    const dist = tp ? Math.hypot(tp.x - this.root.position.x, tp.z - this.root.position.z) : Infinity;

    switch (this.state) {
      case 'sleep': break;
      case 'idle': this._tickIdle(dt, ctx); break;
      case 'patrol': this._tickPatrol(dt, ctx); break;
      case 'alert': this._tickAlert(dt, ctx, tp); break;
      case 'return': this._tickReturn(dt, ctx); break;
      case 'chase':
      case 'approach': this._tickChase(dt, ctx, target, tp, dist); break;
      case 'strafe': this._tickStrafe(dt, ctx, target, tp, dist); break;
      case 'telegraph': this._tickTelegraph(dt, ctx, tp, dist); break;
      case 'attack': this._tickAttack(dt, ctx, target, tp, dist); break;
      case 'recover':
        this._face(tp, dt, 2.0);
        if (this.stateTime > this._timing('recover')) {
          this._endAttack();
          this.setState(target ? 'strafe' : 'return');
        }
        break;
      case 'flinch':
        if (this.stateTime > 0.35) this.setState(target ? 'chase' : 'idle');
        break;
      case 'stagger':
        if (!this.staggered) this.setState(target ? 'chase' : 'idle');
        break;
      default: this.setState('idle'); break;
    }

    this._slide(dt, ctx);

    // terrain follow
    if (ctx && ctx.terrain) {
      const gy = ctx.terrain.heightAt(this.root.position.x, this.root.position.z);
      this.root.position.y = this.airborne ? Math.max(gy, this.root.position.y) : gy;
    }
    this.root.rotation.y = this.heading;
    const pose = POSE_MAP[this.state] || 'idle';
    this._resetVisual();
    this.pose(pose, this.phase, ctx);
    this.visual.position.y += this.groundLift(pose);
    this._postPose(dt);
  }

  /**
   * Clear the body transform so every `pose()` authors it from zero.
   *
   * This is unconditional on purpose. It used to be opt-in per species
   * (`autoResetVisual`), on the theory that the older assign-style species
   * carried state across frames and must not be reset under them — but they
   * assign `visual.position`/`rotation` outright in every branch, so a reset
   * to zero is invisible to them, while the newer base classes write
   * `visual.position.y -= drop` and are only correct *because* of it. An
   * opt-in reset means the two conventions coexist and the wrong one silently
   * integrates: hold a `-=` pose for N frames without a reset and the
   * creature sinks N × drop metres. Making it universal is what makes that
   * class of bug impossible rather than merely unlikely.
   */
  _resetVisual() {
    if (!this.visual) return;
    this.visual.position.set(0, 0, 0);
    this.visual.rotation.set(0, 0, 0);
    if (this.anim) { this.anim.bodyY = 0; this.anim.bodyRoll = 0; this.anim.bodyPitch = 0; }
  }

  /**
   * Knockback decay. Being hit shoves a creature and it has to dig in and stop
   * — that friction is a large part of why a hit reads as having landed.
   */
  _slide(dt, ctx) {
    const kb = this._kb;
    if (!kb || kb.lengthSq() < 1e-5) return;
    this.root.position.x += kb.x * dt;
    this.root.position.z += kb.z * dt;
    kb.multiplyScalar(Math.max(0, 1 - dt * (this.dead ? 5.5 : 9)));
    if (kb.lengthSq() < 1e-5) kb.set(0, 0, 0);
  }

  /**
   * Additive layer applied after the species pose: impact springs whipping
   * through the spine, the gait's vertical bounce, and the residual shove.
   */
  _postPose(dt) {
    const a = this.anim;
    if (!a || !this.rig) return;
    a.commit(dt, (name, x, y, z) => {
      const b = this.rig.byName.get(name);
      if (!b) return;
      _addEuler.set(x, y, z, 'XYZ');
      _addQ.setFromEuler(_addEuler);
      b.quaternion.multiply(_addQ);
    });
    const v = this.visual;
    if (!v) return;
    if (a.bodyY) v.position.y += a.bodyY;
    if (a.bodyRoll || a.bodyPitch) {
      v.rotation.z += a.bodyRoll;
      v.rotation.x += a.bodyPitch;
    }
    const p = a.pushLocal;
    if (p && (p.x || p.z)) { v.position.x += p.x; v.position.z += p.z; }
  }

  /** Notice things, lose interest in things. */
  _sense(dt, ctx) {
    this._senseTimer -= dt;
    if (this._senseTimer > 0) return;
    this._senseTimer = 0.22;
    const step = 0.22;

    if (this.state === 'sleep') {
      // daemons sleep by day, beasts by night — until something walks into them
      const wake = this.nocturnal ? (ctx.night > 0.05) : (ctx.night < 0.4);
      if (wake) this.setState('patrol');
      else if (ctx.player && this.root.position.distanceTo(ctx.player.position) < 6) this.setState('alert');
      return;
    }

    let best = null, bestScore = 0;
    const cands = ctx.threats || (ctx.player ? [ctx.player] : EMPTY);
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      if (!c || c.downed || c.ko) continue;
      // Noctis is the fight. Companions only pull aggro when they are much
      // closer, or when Gladio has deliberately taken it with Coverage.
      const score = this.perceives(c, ctx) * (c.threatWeight != null ? c.threatWeight : 1);
      if (score > bestScore) { bestScore = score; best = c; }
    }

    if (bestScore > 0) {
      this.awareness = Math.min(1, this.awareness + bestScore * step * 3.2);
      this.target = best;
      this._lostTimer = 0;
      if (this.awareness >= 0.55 && (this.state === 'idle' || this.state === 'patrol' || this.state === 'alert')) {
        this.setState('chase');
        if (this.pack) this.pack.alert(this, best);
      } else if (this.awareness > 0.12 && (this.state === 'idle' || this.state === 'patrol')) {
        this.setState('alert');
      }
    } else {
      this.awareness = Math.max(0, this.awareness - step * 0.45);
      if (this.inCombat) {
        this._lostTimer += step;
        if (this._lostTimer > 8) this._giveUp();
      } else if (this.state === 'alert' && this.awareness <= 0.02) {
        this.setState('patrol');
      }
    }

    // leashing: never chase forever
    if (this.inCombat && this.home.lengthSq() > 0) {
      const dh = Math.hypot(this.root.position.x - this.home.x, this.root.position.z - this.home.z);
      if (dh > this.leash) this._giveUp();
    }
  }

  /** True while this enemy is actively pursuing or attacking something. */
  get inCombat() {
    const s = this.state;
    return s === 'chase' || s === 'approach' || s === 'strafe'
      || s === 'telegraph' || s === 'attack' || s === 'recover';
  }

  /**
   * True while this enemy counts as part of a live fight. Wider than
   * `inCombat`: an enemy reeling from a hit has not stopped fighting, it is
   * just not in a position to act — the encounter must not declare victory
   * over something that is mid-stagger.
   */
  get fighting() {
    return this.inCombat || this.state === 'flinch' || this.state === 'stagger';
  }

  _giveUp() {
    this.target = null;
    this.awareness = 0;
    this._lostTimer = 0;
    this._endAttack();
    this.setState('return');
  }

  _tickIdle(dt, ctx) {
    if (this.patrol) { this.setState('patrol'); return; }
    this._wanderTimer -= dt;
    if (this._wanderTimer <= 0) {
      this._wanderTimer = 3 + (this.id % 5);
      this._wanderAngle = this.heading + ((this.id * 37 % 100) / 100 - 0.5) * 2.2;
    }
    this.heading += (this._wanderAngle - this.heading) * Math.min(1, dt * 0.8);
  }

  _tickPatrol(dt, ctx) {
    const p = this.patrol;
    if (!p || !p.points.length) { this.setState('idle'); return; }
    const wp = p.points[p.index % p.points.length];
    const dx = wp.x - this.root.position.x, dz = wp.z - this.root.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.2) {
      p.waitTimer -= dt;
      if (p.waitTimer <= 0) { p.index++; p.waitTimer = p.wait; }
      this._tickIdle(dt, ctx);
      return;
    }
    this._face(wp, dt, 2.4);
    this._move(dt, dx / d, dz / d, this.speed * 0.32, ctx);
  }

  _tickAlert(dt, ctx, tp) {
    // stand up, look toward whatever it was
    if (tp) this._face(tp, dt, 3.0);
    if (this.stateTime > 4.5 && this.awareness < 0.2) this.setState('patrol');
  }

  _tickReturn(dt, ctx) {
    if (this.home.lengthSq() === 0) { this.setState('idle'); return; }
    const dx = this.home.x - this.root.position.x, dz = this.home.z - this.root.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.5) { this.setState(this.patrol ? 'patrol' : 'idle'); return; }
    this._face(this.home, dt, 3.0);
    this._move(dt, dx / d, dz / d, this.speed * 0.55, ctx);
  }

  _tickChase(dt, ctx, target, tp, dist) {
    if (!target || !tp) { this.setState('return'); return; }
    this._role(dt);
    this._face(tp, dt, 5);

    const want = this.fightRange * 0.85;
    if (this.packRole === 'engage' && this._atkCooldown <= 0 && dist <= this.reach) {
      const a = this._chooseAttack(dist, ctx.rng);
      if (a) { this._beginAttack(a); return; }
    }
    if (this.packRole !== 'engage' && dist < want * 1.4) { this.setState('strafe'); return; }

    // Everyone closes along their own bearing, not down the same line: the
    // attackers come in on their slot, the flankers hold the ring on theirs.
    // That is the whole difference between a pack and a queue.
    const r = this.packRole === 'engage'
      ? want * 0.7
      : want * 1.6 + this.radius * this.scale;
    const gx = tp.x + Math.sin(this.slotAngle) * r;
    const gz = tp.z + Math.cos(this.slotAngle) * r;
    const dx = gx - this.root.position.x, dz = gz - this.root.position.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < 0.6) { this.setState('strafe'); return; }
    this._move(dt, dx / d, dz / d, this.speed, ctx);
  }

  /** Circle the target waiting for a turn. This is what stops the conga line. */
  _tickStrafe(dt, ctx, target, tp, dist) {
    if (!target || !tp) { this.setState('return'); return; }
    this._role(dt);
    this._face(tp, dt, 4.5);
    const want = this.fightRange * 0.85;
    if (this.packRole === 'engage' && this._atkCooldown <= 0) {
      if (dist <= this.reach) {
        const a = this._chooseAttack(dist, ctx.rng);
        if (a) { this._beginAttack(a); return; }
      }
      this.setState('chase');
      return;
    }
    if (dist > want * 2.6 + 4) { this.setState('chase'); return; }

    // Hold the assigned bearing on the ring, and let the whole ring rotate
    // slowly, so the pressure on the player keeps coming from a new angle.
    this.slotAngle += this._strafeDir * dt * 0.45;
    const ring = want * 1.5 + this.radius * this.scale;
    const gx = tp.x + Math.sin(this.slotAngle) * ring;
    const gz = tp.z + Math.cos(this.slotAngle) * ring;
    const dx = gx - this.root.position.x, dz = gz - this.root.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.35) this._move(dt, dx / d, dz / d, this.speed * 0.62, ctx);
    if (this.stateTime > 4.5) { this._strafeDir *= -1; this.stateTime = 0; }
  }

  _tickTelegraph(dt, ctx, tp, dist) {
    const a = this.attack;
    this._face(tp, dt, a && a.tracking != null ? a.tracking : 2.4);
    if (a && a.approachDuring && tp) {
      const dx = tp.x - this.root.position.x, dz = tp.z - this.root.position.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > this.reach * 0.6) this._move(dt, dx / d, dz / d, this.speed * 0.4, ctx);
    }
    if (this.stateTime > this._timing('telegraph')) this.setState('attack');
  }

  _tickAttack(dt, ctx, target, tp, dist) {
    const a = this.attack;
    // a lunge carries all the way through the active window, decaying, so a
    // leap actually arrives instead of stopping short of its own target
    if (a && a.lunge) {
      const T = this._timing('attack');
      const k = Math.max(0, 1 - this.stateTime / Math.max(0.05, T));
      if (k > 0) {
        const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
        this._move(dt, fx, fz, a.lunge * k, ctx, true);
      }
    }
    if (!this._swung && this.stateTime > this._timing('strike')) {
      this._swung = true;
      if (ctx && ctx.onStrike) ctx.onStrike(this, a);
      else if (ctx && ctx.onEnemyStrike) ctx.onEnemyStrike(this);
    }
    if (this.stateTime > this._timing('attack')) {
      this._atkCooldown = (a && a.cooldown != null ? a.cooldown : this.attackCooldown);
      this.setState('recover');
    }
  }

  /** Ask the pack whether we hold the engage token. */
  _role(dt) {
    this._roleTimer -= dt;
    if (this._roleTimer > 0) return;
    this._roleTimer = 0.55;
    if (this.pack) this.pack.assign(this);
    else this.packRole = 'engage';
  }

  _face(p, dt, k = 6) {
    if (!p) return;
    const want = Math.atan2(p.x - this.root.position.x, p.z - this.root.position.z);
    let d = want - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.heading += d * Math.min(1, k * dt);
  }

  /** Move along a unit direction with pack separation. */
  _move(dt, nx, nz, sp, ctx, skipSeparation = false) {
    this.root.position.x += nx * sp * dt;
    this.root.position.z += nz * sp * dt;
    this.velocity.set(nx * sp, 0, nz * sp);
    // the gait reads its stride from ground speed, so record what we actually
    // travelled rather than what the AI intended
    this.moveSpeed = sp;
    if (skipSeparation || !ctx || !ctx.others) return;
    const others = ctx.others;
    for (let i = 0; i < others.length; i++) {
      const o = others[i];
      if (o === this || o.dead) continue;
      const ox = this.root.position.x - o.root.position.x;
      const oz = this.root.position.z - o.root.position.z;
      const d2 = ox * ox + oz * oz;
      const minD = (this.radius * this.scale + o.radius * o.scale) * 1.05;
      if (d2 < minD * minD && d2 > 1e-4) {
        const d = Math.sqrt(d2), push = (minD - d) * 2.4 * dt;
        this.root.position.x += (ox / d) * push;
        this.root.position.z += (oz / d) * push;
      }
    }
  }

  /** Subclasses override. */
  pose() {}

  /** Force a specific pose/phase and stop the AI (screenshot scenarios). */
  freeze(state, phase, ctx) {
    this.frozenPose = { state, phase };
    this.state = state;
    this.phase = phase;
    this.root.rotation.y = this.heading;
    this.restBones();
    this.repose(0, ctx);
  }

  /**
   * Re-apply the held pose for one frame.
   *
   * A frozen enemy still has to be re-posed every frame — the pose reads
   * `stateTime`, the impact springs and (for a boss) `phaseIndex`, and a
   * capture settles for scores of frames before it shoots. That makes the
   * frozen path exactly as sensitive to a missing `_resetVisual()` as the live
   * one, and for a long time it did not have one: it called `pose()` straight
   * out of `Enemies.update`, so the Iron Giant's telegraph crouch subtracted
   * its 0.1 m drop once per settle frame and put the model 8.4 m underground
   * by capture time. Everything a held pose needs goes through here.
   */
  repose(dt = 0, ctx = null) {
    if (!this.frozenPose || !this.visual) return;
    this._resetVisual();
    this.pose(this.frozenPose.state, this.frozenPose.phase, ctx);
    this.visual.position.y += this.groundLift(this.frozenPose.state);
    this._postPose(dt);
  }

  unfreeze() { this.frozenPose = null; }
}

const EMPTY = [];
const DEFAULT_TIMING = { telegraph: 0.5, strike: 0.18, attack: 0.5, recover: 0.7 };
const _addEuler = new THREE.Euler();
const _calV = new THREE.Vector3();

/**
 * `stateTime` values the ground calibration samples, dense early where a
 * settle pose is actually moving and sparse late where it has converged.
 */
const GROUND_CAL_T = [0.04, 0.1, 0.18, 0.3, 0.45, 0.65, 0.9, 1.25, 1.7, 2.3, 3.0, 4.0];

/**
 * Poses the ground correction is measured for.
 *
 * All of them are driven by `stateTime`, which is what the correction is
 * indexed on. The gaits — `approach`, `run` — are deliberately absent: their
 * vertical motion is driven by `gaitPhase`, so a curve read off `stateTime`
 * would inject an arbitrary bob into the stride rather than remove a sink.
 * `pounce` is absent because being off the ground is the point of it.
 */
const GROUND_CAL_POSES = ['idle', 'telegraph', 'attack', 'flinch', 'stagger', 'death'];

/**
 * Poses whose shape depends on *which* attack is being performed, so the
 * correction has to be measured per attack rather than once.
 */
const POSE_PER_ATTACK = new Set(['telegraph', 'attack']);

/**
 * Ground penetration left uncorrected, metres. A foot pressing a few
 * centimetres into dirt is how contact reads as weight rather than as a model
 * balanced on a plane; correcting to exactly zero makes everything look like
 * it is hovering. Well inside the 0.25 m gate in `src/tools/creaturecheck.mjs`.
 */
const GROUND_SINK = 0.05;
const _addQ = new THREE.Quaternion();

/**
 * Map the richer AI vocabulary onto the pose vocabulary the original four
 * species were written against, so no existing `pose()` has to change.
 */
const POSE_MAP = {
  sleep: 'idle', idle: 'idle', patrol: 'approach', alert: 'idle',
  return: 'approach', chase: 'approach', approach: 'approach', strafe: 'approach',
  telegraph: 'telegraph', attack: 'attack', recover: 'attack',
  flinch: 'flinch', stagger: 'stagger', death: 'death',
};

/* ------------------------------------------------------------ textures */

let _organic = null, _metal = null, _organicRough = null, _metalRough = null;
const texNoise = new Noise(777);

/**
 * Make a noise field periodic over the unit square by cross-fading it with its
 * own shifted copies.
 *
 * The detail maps now tile several times per metre (see `RigBuilder.detailUV`),
 * and simplex/worley are not periodic, so the discontinuity at u=1 that used to
 * hide inside one tile per body part is now a hard line repeating every 14 cm
 * down every limb. Four samples per texel, once, at bake time.
 *
 * @param {(u:number, v:number) => number} f
 */
function tileable(f) {
  return (u, v) => {
    const a = f(u, v), b = f(u - 1, v), c = f(u, v - 1), d = f(u - 1, v - 1);
    const iu = 1 - u, iv = 1 - v;
    return a * iu * iv + b * u * iv + c * iu * v + d * u * v;
  };
}

/**
 * Hide and coat for the organic bestiary.
 *
 * Three layers, because a single noise octave is what makes a creature read as
 * a lump of clay: **guard hairs** as fine strokes lying along v and clumped
 * into locks by a slow warp across u; **pores and slack** under them; and
 * **loose folds** at body scale. `detailUV` fixes one tile at ~14 cm of animal,
 * so a strand here is about a millimetre wide on a real Bloodhorn instead of
 * the 3 cm curd the old one-tile-per-body-part mapping produced.
 */
export function organicNormal() {
  if (!_organic) {
    const fold = tileable((u, v) => texNoise.warped2(u * 3.5 + 11, v * 3.5 + 5, 1.3, 4));
    const pore = tileable((u, v) => 1 - texNoise.worley2(u * 22 + 3, v * 22 + 7).f1);
    const clump = tileable((u, v) => texNoise.fbm2(u * 5 + 21, v * 2.5 + 2, 3));
    const flow = tileable((u, v) => texNoise.fbm2(u * 9 + 31, v * 9 + 13, 2));
    _organic = normalFromHeight(256, (u, v) => {
      // strands: a rectified sine across u, drifted so they gather into locks
      const strand = Math.sin((u + clump(u, v) * 0.06) * Math.PI * 2 * 44);
      // ...and broken along their length so they read as hair, not corduroy
      const along = 0.45 + 0.55 * Math.max(0, Math.sin(v * Math.PI * 2 * 7 + flow(u, v) * 5));
      const hair = Math.pow(Math.max(0, strand), 2.2) * along * 0.55;
      return hair + pore(u, v) * 0.16 + fold(u, v) * 0.34;
    }, 1.5, { repeat: 1 });
    _organic.wrapS = _organic.wrapT = THREE.RepeatWrapping;
    _organic.anisotropy = 8;
  }
  return _organic;
}

/**
 * Gloss variation for hide. Skin is not uniformly matte: the crown of a fold
 * catches light, the crease under it is dry and dark, and worn patches over
 * bone go smoother. Without this every surface on a creature answers the light
 * identically, which is one of the loudest tells that a model was assembled
 * from primitives.
 */
export function organicRoughness() {
  if (!_organicRough) {
    const broad = tileable((u, v) => texNoise.fbm2(u * 4 + 17, v * 4 + 29, 4));
    const fine = tileable((u, v) => texNoise.fbm2(u * 19 + 5, v * 19 + 41, 2));
    _organicRough = makeDataMap(256, (u, v) => {
      const b = broad(u, v) * 0.5 + 0.5;
      const f = fine(u, v) * 0.5 + 0.5;
      // 0.5 is a waxy, healthy hide; 0.95 is dry dusty fur in a crease
      return 0.50 + 0.34 * b + 0.14 * f;
    }, { repeat: 1 });
    _organicRough.wrapS = _organicRough.wrapT = THREE.RepeatWrapping;
  }
  return _organicRough;
}

/**
 * Plate for the magitek and iron constructs.
 *
 * Rolled steel, not stucco: a fine unidirectional brush, hammer dishing at
 * hand scale, rivet heads on a grid, and shallow panel seams. At `detailUV`
 * density one tile is ~14 cm, so the rivets land roughly a hand apart, which
 * is what makes a six-metre walker read as fabricated rather than extruded.
 */
export function metalNormal() {
  if (!_metal) {
    const dish = tileable((u, v) => texNoise.fbm2(u * 6 + 2, v * 6 + 19, 3));
    const grime = tileable((u, v) => texNoise.fbm2(u * 24 + 37, v * 24 + 3, 2));
    _metal = normalFromHeight(256, (u, v) => {
      // brushed grain: high frequency along u only
      const brush = Math.sin(u * Math.PI * 2 * 96 + grime(u, v) * 3) * 0.05;
      // rivets: a domed head every quarter tile, on the seam lines
      const ru = (u * 4) % 1 - 0.5, rv = (v * 4) % 1 - 0.5;
      const rd = Math.hypot(ru, rv) / 0.10;
      const rivet = rd < 1 ? Math.sqrt(1 - rd * rd) * 0.34 : 0;
      // panel seams: a narrow crease every half tile in both directions
      const su = Math.min(Math.abs((u * 2) % 1 - 0.5), 0.5);
      const sv = Math.min(Math.abs((v * 2) % 1 - 0.5), 0.5);
      const seam = -Math.max(Math.pow(Math.max(0, 1 - su * 26), 3), Math.pow(Math.max(0, 1 - sv * 26), 3)) * 0.30;
      return dish(u, v) * 0.22 + brush + rivet + seam;
    }, 1.4, { repeat: 1 });
    _metal.wrapS = _metal.wrapT = THREE.RepeatWrapping;
    _metal.anisotropy = 8;
  }
  return _metal;
}

/**
 * Wear map for plate. Paint holds a low roughness; where it has been scoured
 * off, bare metal underneath comes up glossier still, and the oxidised patches
 * between them go flat. Three levels, not a single noisy average.
 */
export function metalRoughness() {
  if (!_metalRough) {
    const patch = tileable((u, v) => texNoise.warped2(u * 5 + 43, v * 5 + 7, 1.4, 3));
    const grain = tileable((u, v) => texNoise.fbm2(u * 15 + 61, v * 15 + 23, 3));
    _metalRough = makeDataMap(256, (u, v) => {
      const p = patch(u, v);
      const rust = Math.max(0, p) * 0.9;          // oxidised, flat
      const scour = Math.max(0, -p - 0.25) * 1.4; // rubbed back to metal
      return Math.min(1, 0.40 + 0.42 * rust - 0.24 * scour + 0.10 * (grain(u, v) * 0.5 + 0.5));
    }, { repeat: 1 });
    _metalRough.wrapS = _metalRough.wrapT = THREE.RepeatWrapping;
  }
  return _metalRough;
}

/**
 * Field wear over the vertex colours a part has already authored.
 *
 * A flat enamel value is what makes a machine read as a toy: every plate
 * answers the light with the same number, so nothing but the silhouette
 * separates one from the next. Real issue plate has paint scoured off its
 * upstanding faces and edges — going warm and bare — and dust and oil packed
 * into everything facing down.
 *
 * This *modulates* rather than replaces, unlike `IronGiant.aged()`: the
 * species that use it already paint their own panel values per part, and
 * re-deriving those from position would flatten the chest plate into the
 * backpack. Three terms — wear on upward faces, a plate-scale streak toward
 * `scuff`, and a grime multiplier under everything facing down.
 *
 * @param {THREE.BufferGeometry} geo must already carry a `color` attribute
 * @param {{scuff?:number, amount?:number, grime?:number}} [opts]
 * @returns {THREE.BufferGeometry} the same geometry, modified in place
 */
export function weatherPlate(geo, { scuff = 0x8a7f70, amount = 1, grime = 0.34 } = {}) {
  if (amount <= 0) return geo;
  const pos = geo.attributes.position, cl = geo.attributes.color, nr = geo.attributes.normal;
  if (!pos || !cl) return geo;
  _wc.setHex(scuff, THREE.SRGBColorSpace);
  for (let i = 0; i < cl.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const up = nr ? nr.getY(i) : 0;
    // a slow streak down the plate crossed by a fine one across it
    const streak = Math.sin(x * 11.3 + z * 7.7 + y * 1.9) * 0.55
      + Math.sin(x * 27.1 - z * 18.3) * 0.25;
    const wear = Math.min(1, (Math.max(0, up) * 0.55 + Math.max(0, streak) * 0.50)) * amount;
    const k = 1 - Math.max(0, -up) * grime * amount;
    const t = wear * 0.42;
    cl.setXYZ(i,
      (cl.getX(i) * (1 - t) + _wc.r * t) * k,
      (cl.getY(i) * (1 - t) + _wc.g * t) * k,
      (cl.getZ(i) * (1 - t) + _wc.b * t) * k);
  }
  return geo;
}

const _wc = new THREE.Color();

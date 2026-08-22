import * as THREE from 'three';
import { makeCharacter } from './Cast.ts';
import { dampAngle, angleDelta } from './Player.ts';
import { ROLES } from './ai/PartyAI.ts';
import { CharacterController } from '../world/collision/CharacterController.ts';
import { Rng } from '../util/Rng.ts';
import type { Character } from './rig/Character.ts';
import type { Enemy } from './enemies/EnemyBase.ts';
import type { Weapon } from '../combat/Weapons.ts';
import type { CompanionRole, PendingHit } from './ai/PartyAI.ts';
import type { Player, Vitals } from './Player.ts';
import type { CollisionWorld } from '../world/collision/CollisionWorld.ts';
import type { Ground } from '../world/Terrain.ts';
import type { Game } from '../game/Game.ts';

/** The three companions. Noctis is the `Player`, not a member of this list. */
export type CompanionKey = 'gladio' | 'ignis' | 'prompto';

/**
 * What a companion is doing this frame. `follow` is the field state; the rest
 * are combat states driven by `PartyAI.update`.
 */
export type CompanionState = 'follow' | 'engage' | 'attack' | 'recover' | 'tech' | 'down';

/**
 * One companion.
 *
 * Two systems write this record and neither owns all of it, which is why the
 * fields are grouped by owner below. `Party` builds it and steers it —
 * formation slot, separation, arrival damping, gait. `PartyAI` decides what it
 * is fighting and writes the slot to get it there. Everything `PartyAI` owns is
 * initialised here anyway, so a member is a complete `PartyMember` from the
 * moment it exists rather than from whenever `PartyAI.init` gets to it.
 *
 * Structurally a `Threat`: an enemy can perceive and attack one of these.
 */
export interface PartyMember {
  /* -------------------------------------------------- owned by `Party` */
  /** display name, from the cast entry — `Gladiolus`. */
  name: string;
  key: CompanionKey;
  character: Character;
  /** the scene-graph node; a companion has no `position` of its own. */
  root: THREE.Group;
  /**
   * Formation slot as [sideways, back] in Noctis' frame. `PartyAI` overwrites
   * this every combat frame to walk them somewhere; `baseSlot` is the peace
   * time value to restore.
   */
  slot: THREE.Vector2;
  speedMul: number;
  lag: number;
  velocity: THREE.Vector3;
  speed: number;
  heading: number;
  /** slow per-character drift so the formation breathes. */
  wander: number;
  wanderRate: number;
  glanceTimer: number;
  glancing: number;
  _target: THREE.Vector3;
  _steer: THREE.Vector3;
  /**
   * Vitals for this companion. **Owned by `RpgSystem`**, which mirrors the
   * matching `Stats` block (keyed on `key`) onto it every frame.
   */
  stats: Vitals;
  /** Own controller: their own feet, their own ground, their own walls. */
  body: CharacterController | null;
  /** damped gait speed, which is what drives the legs. */
  gait: number;
  avoidX: number;
  avoidZ: number;
  /** seconds since the last obstacle probe. */
  avoidAge: number;

  /* ------------------------------------------------ owned by `PartyAI` */
  role: CompanionRole;
  /** the peacetime formation slot, restored when the fight ends. */
  baseSlot: THREE.Vector2;
  baseSpeedMul: number;
  aiState: CompanionState;
  /** seconds left in the current `aiState`. */
  aiTimer: number;
  /** what this companion is working on. Cleared by `Party.snap`. */
  aiTarget: Enemy | null;
  /** cycles through `role.actions`. */
  swingIndex: number;
  downed: boolean;
  downTimer: number;
  /** Noctis, while he is on the floor and this companion is reviving him. */
  reviveTarget: THREE.Object3D | null;
  /** the blow this swing will land, and when. */
  _pending: PendingHit | null;
  /** one entry per carried weapon: Ignis has two kukris, the others one. */
  weaponList: Weapon[];
  /** the primary weapon — `weaponList[0]`. */
  weapon: Weapon | null;
  weaponKind: string;
  /** in hand rather than sheathed. */
  drawn: boolean;
  drawWant: boolean;
  /** 0..1 draw/sheathe dissolve. */
  drawT: number;

  /* -------------------- owned by the encounter layer (see `Threat`) --- */
  /** seconds left on Gladio's Coverage taunt. Set by `ai/Techniques`. */
  taunting: number;
  /** pull on enemy aggro. Set by `EncounterDirector._refreshThreats`. */
  threatWeight?: number;
}

/**
 * Formation specs, at module scope so `init()` and `snap()` read one table.
 * `slot` is [sideways, back] in Noctis's frame; `lag` and `speedMul` are why
 * Prompto (smallest lag, highest speedMul) oscillates longest and is the worst
 * subject for a follow shot that has not settled.
 */
const SPECS: { key: CompanionKey, slot: [number, number], speedMul: number, lag: number }[] = [
  { key: 'gladio', slot: [-1.95, -0.95], speedMul: 0.97, lag: 0.16 },
  { key: 'ignis', slot: [1.85, -1.45], speedMul: 1.0, lag: 0.22 },
  { key: 'prompto', slot: [0.85, -2.75], speedMul: 1.05, lag: 0.10 },
];

/** Seed for every stochastic field on a member. `snap()` rewinds to it. */
const PARTY_SEED = 9182;

/**
 * Gladiolus, Ignis and Prompto following Noctis.
 *
 * Each companion steers toward a slot defined in the player's frame — offset
 * sideways and back, with a slow per-character wander so the formation breathes
 * instead of locking into a conga line. Separation forces keep them off each
 * other and off Noctis, arrival damping stops them piling in when he halts, and
 * they glance at him (and at each other) on independent timers.
 *
 * Exposes `members`: [{ name, root, character, ... }].
 */
export class Party {
  _gaze!: THREE.Vector3;
  collision!: CollisionWorld | null;
  game!: Game;
  members!: PartyMember[];
  player!: Player | undefined;
  rnd!: Rng;
  /**
   * The ground under this walker. `Ground`, not `Terrain`: `Occupants` swaps
   * in a stub whose surface is a kilometre down while everyone is in the car,
   * so the foot IK has nothing to plant on at 100 km/h.
   */
  terrain!: Ground | undefined;
  async init(game: Game) {
    this.game = game;
    this.members = [];
    this.rnd = new Rng(PARTY_SEED);
    const terrain = game.get('Terrain');
    this.terrain = terrain;
    const player = game.get('Player');
    this.player = player;
    /** Shared with the player: same soup, same broadphase, same step rules. */
    this.collision = game.get('Collision') || (player && player.collision) || null;

    for (const spec of SPECS) {
      const character = makeCharacter(spec.key);
      const root = new THREE.Group();
      root.add(character.root);
      game.scene.add(root);

      const slot = new THREE.Vector2(spec.slot[0], spec.slot[1]);
      const m: PartyMember = {
        name: character.name,
        key: spec.key,
        character,
        root,
        slot,
        speedMul: spec.speedMul,
        lag: spec.lag,
        velocity: new THREE.Vector3(),
        speed: 0,
        heading: player ? player.heading : 0,
        wander: 0,
        wanderRate: 0,
        glanceTimer: 0,
        glancing: 0,
        _target: new THREE.Vector3(),
        _steer: new THREE.Vector3(),
        /**
         * Vitals for this companion. **Owned by `RpgSystem`**, which mirrors
         * the matching `Stats` block (keyed on `m.key`) onto it every frame.
         */
        stats: { hp: 0, maxHp: 0, mp: 0, maxMp: 0, level: 1, ko: false },
        /** Own controller: they have their own feet, their own ground, their own walls. */
        body: this.collision
          ? new CharacterController(this.collision, {
            radius: 0.38, height: 1.80, stepUp: 0.45, stepDown: 0.55,
          })
          : null,
        gait: 0,
        avoidX: 0,
        avoidZ: 0,
        avoidAge: 99,
        /**
         * Everything below is **owned by `PartyAI`**, which re-arms all of it
         * in its own `init` with exactly these values (and builds the weapons,
         * which need a `Weapon` each). They are seeded here so that a member is
         * never half a member: `Party.update`, `Party.snap`, `Director` and the
         * encounter layer all read `aiTarget`, `downed` and `taunting`, and
         * `PartyAI` is registered late enough that they would otherwise be
         * undefined for the first frames of the world.
         */
        role: ROLES[spec.key],
        baseSlot: slot.clone(),
        baseSpeedMul: spec.speedMul,
        aiState: 'follow',
        aiTimer: 0,
        aiTarget: null,
        swingIndex: 0,
        downed: false,
        downTimer: 0,
        reviveTarget: null,
        _pending: null,
        weaponList: [],
        weapon: null,
        weaponKind: '',
        drawn: false,
        drawWant: false,
        drawT: 1,
        taunting: 0,
      };
      // spread them out at spawn so the first frame is never a pile
      const p = player ? player.position : new THREE.Vector3();
      m.root.position.set(p.x + spec.slot[0], 0, p.z + spec.slot[1]);
      m.root.position.y = terrain ? terrain.heightAt(m.root.position.x, m.root.position.z) : 0;
      // Same helper `snap()` uses, drawing from the same stream in the same
      // order, so a snapped formation is bit-identical to a booted one.
      this._seed(m);
      m.root.rotation.y = m.heading;
      this.members.push(m);
    }
  }

  /** The three companions' vitals, in formation order. Mirrored by `RpgSystem`. */
  get stats() { return this.members.map((m) => m.stats); }

  /** @returns member by character name */
  get(name: string): PartyMember | undefined { return this.members.find((m) => m.name === name || m.key === name); }

  /**
   * Draw the stochastic fields for one member off `this.rnd`.
   *
   * Called from `init()` in member order and again, in the same order off a
   * rewound stream, from `snap()`. Keeping it in one place is what makes a
   * snapped formation identical to a booted one rather than merely similar.
   */
  _seed(m: PartyMember) {
    m.wander = this.rnd.range(0, Math.PI * 2);
    m.wanderRate = this.rnd.range(0.10, 0.22);
    m.glanceTimer = this.rnd.range(1.5, 6);
    m.glancing = 0;
  }

  /**
   * Where `m`'s formation slot currently sits in world space.
   *
   * The single definition of the slot, read by both `update()` (as the steering
   * target) and `snap()` (as the place to put them). If these two ever disagree
   * the formation drifts on the first frame after a snap.
   */
  _slotTarget(m: PartyMember, pp: THREE.Vector3, cos: number, sin: number, out: THREE.Vector3): THREE.Vector3 {
    const ox = m.slot.x + Math.sin(m.wander) * 0.42;
    const oz = m.slot.y + Math.cos(m.wander * 0.73) * 0.34;
    return out.set(pp.x + ox * cos + oz * sin, 0, pp.z - ox * sin + oz * cos);
  }

  /**
   * Place the formation on its slots and erase every trace of history.
   *
   * **Why this exists.** Formation state integrates: `wander` accumulates,
   * `speed`/`gait` damp toward a target, the glance timers count down off a
   * shared RNG stream, and each companion's `Animator` carries a clock. None of
   * it was ever reset between captures, so a `follow` shot's result depended on
   * which shots ran before it — the same shot in a batch once put the camera
   * *inside* another party member, and `prompto_closeup` read as out of focus
   * purely because he was still steering when the shutter opened. That is a
   * whole-frame TAA and motion-blur smear, not a depth-of-field bug, and it
   * undermined determinism for all 47 follow shots.
   *
   * Called from `Game.applyShot` before the settle loop.
   *
   * Do **not** try to fix this from the capture harness instead. Two attempts
   * were made and both reverted: a re-anchor convergence loop (the formation
   * keeps drifting between iterations, so the camera lands inside whoever is in
   * the way) and a long per-shot settle (240 extra frames x 47 shots, and it did
   * not fix the ordering). The state that carries is here, so the reset is here.
   */
  snap() {
    const player = this.player || (this.game && this.game.get('Player'));
    if (!player || !this.members) return;
    const pp = player.position;
    const ph = player.root.rotation.y;
    const cos = Math.cos(ph), sin = Math.sin(ph);
    const at = new THREE.Vector3();

    // Rewind the shared stream first, then re-draw in member order.
    this.rnd = new Rng(PARTY_SEED);
    for (const m of this.members) {
      this._seed(m);

      this._slotTarget(m, pp, cos, sin, at);
      m.root.position.x = at.x;
      m.root.position.z = at.z;
      m.root.position.y = this.terrain ? this.terrain.heightAt(at.x, at.z) : 0;

      // At rest `update()` turns them toward Noctis; land on that angle so the
      // damp has nothing left to do on the first frame.
      m.heading = Math.atan2(pp.x - m.root.position.x, pp.z - m.root.position.z);
      m.root.rotation.y = m.heading;

      m.velocity.set(0, 0, 0);
      m.speed = 0;
      m.gait = 0;
      m.avoidX = 0;
      m.avoidZ = 0;
      m.avoidAge = 99;
      m.aiTarget = null;
      m._target.copy(at);
      m._steer.set(0, 0, 0);

      // The controller integrates its own vertical velocity and step-up climb.
      if (m.body) {
        m.body.vy = 0;
        m.body.grounded = true;
        m.body.onProp = false;
        m.body.progress = 1;
        m.body.climb = m.body.stepUp;
        m.body.normal.set(0, 1, 0);
        // One zero-velocity step reconciles terrain height with the real
        // collision ground, which differs wherever they stand on a prop.
        m.body.move(m.root.position, 0, 0, 1 / 60);
      }

      m.character.setLookTarget(null);
      if (m.character.anim && m.character.anim.rest) m.character.anim.rest();
    }
  }

  update(dt: number, game: Game) {
    const player = this.player || game.get('Player');
    if (!player) return;
    const pp = player.position;
    const ph = player.root.rotation.y;
    const cos = Math.cos(ph), sin = Math.sin(ph);
    const combat = game.get('Combat');
    const inCombat = !!(combat && combat.inCombat);
    if (!this._gaze) this._gaze = new THREE.Vector3();

    for (let i = 0; i < this.members.length; i++) {
      const m = this.members[i];
      m.wander += dt * m.wanderRate;

      // formation slot in the player's frame, breathing with a slow wander
      this._slotTarget(m, pp, cos, sin, m._target);
      const tx = m._target.x, tz = m._target.z;

      const steer = m._steer.set(tx - m.root.position.x, 0, tz - m.root.position.z);
      let dist = steer.length();

      // separation from Noctis and from each other
      const push = new THREE.Vector3();
      const addPush = (ox2: number, oz2: number, minD: number, weight: number) => {
        const dx = m.root.position.x - ox2, dz = m.root.position.z - oz2;
        const d = Math.hypot(dx, dz);
        if (d < minD && d > 1e-4) push.add(new THREE.Vector3(dx / d, 0, dz / d).multiplyScalar((minD - d) * weight));
      };
      addPush(pp.x, pp.z, 1.30, 2.6);
      for (let j = 0; j < this.members.length; j++) {
        if (j === i) continue;
        const o = this.members[j];
        addPush(o.root.position.x, o.root.position.z, 1.25, 2.0);
      }

      // arrival: ease off inside the slot radius so they settle instead of jitter
      const arrive = THREE.MathUtils.smoothstep(dist, 0.35, 1.6);
      const playerSpeed = player.speed || 0;
      const wanted = Math.min(
        (playerSpeed + (dist > 2.4 ? 1.9 : 0.5)) * m.speedMul,
        player.runSpeed * 1.12
      ) * arrive;

      const dir = dist > 1e-4 ? steer.multiplyScalar(1 / dist) : new THREE.Vector3();
      dir.add(push);
      if (dir.lengthSq() > 1e-6) dir.normalize();

      // Steer round anything solid on the way to the slot. Re-probed a few
      // times a second and held in between — a per-frame probe both costs more
      // and makes them twitch at the corner of a building.
      if (m.body && dir.lengthSq() > 1e-6) {
        m.avoidAge += dt;
        if (m.avoidAge > 0.2) {
          m.avoidAge = 0;
          const [ax, az] = m.body.avoid(m.root.position, dir.x, dir.z, 1.9);
          m.avoidX = ax; m.avoidZ = az;
        }
        if (m.avoidX || m.avoidZ) {
          dir.x = THREE.MathUtils.damp(dir.x, m.avoidX, 12, dt);
          dir.z = THREE.MathUtils.damp(dir.z, m.avoidZ, 12, dt);
          if (dir.lengthSq() > 1e-6) dir.normalize();
        }
      }

      m.speed = THREE.MathUtils.damp(m.speed, wanted, 5.5, dt);
      m.velocity.copy(dir).multiplyScalar(m.speed);
      if (m.body) {
        m.body.move(m.root.position, m.velocity.x, m.velocity.z, dt);
        m.velocity.multiplyScalar(m.body.progress);
        m.gait = THREE.MathUtils.damp(m.gait, m.speed * m.body.progress, 10, dt);
      } else {
        m.root.position.addScaledVector(m.velocity, dt);
        // `: 0` matches the two other terrain reads in this file. This was the
        // one that dereferenced it unguarded — see `project/handoff/no-any.md`.
        m.root.position.y = this.terrain ? this.terrain.heightAt(m.root.position.x, m.root.position.z) : 0;
        m.gait = m.speed;
      }

      // face travel direction while moving, otherwise turn toward Noctis
      let want;
      if (m.speed > 0.35) want = Math.atan2(m.velocity.x, m.velocity.z);
      else want = Math.atan2(pp.x - m.root.position.x, pp.z - m.root.position.z);
      const prev = m.root.rotation.y;
      m.root.rotation.y = dampAngle(prev, want, m.speed > 0.35 ? 6.5 : 2.4, dt);
      const turnRate = angleDelta(prev, m.root.rotation.y) / Math.max(1e-4, dt);

      // In a fight they watch what they are fighting; in the field they glance
      // at Noctis on the timer, which is already phase-offset per member.
      if (inCombat && m.aiTarget && !m.aiTarget.dead && m.aiTarget.root) {
        const e = m.aiTarget;
        m.character.setLookTarget(e.centre ? e.centre(this._gaze) : this._gaze.copy(e.root.position));
      } else {
        m.glanceTimer -= dt;
        if (m.glanceTimer <= 0) {
          m.glanceTimer = 3.5 + this.rnd.range(0, 6);
          m.glancing = 1.2 + this.rnd.range(0, 1.4);
        }
        if (m.glancing > 0) {
          m.glancing -= dt;
          m.character.setLookTarget(
            this._gaze.set(pp.x, pp.y + player.character.rig.dims.headOrigin.y * 0.98, pp.z)
          );
        } else {
          m.character.setLookTarget(null);
        }
      }

      m.character.update(dt, {
        speed: m.gait,
        velocity: m.velocity,
        turnRate,
        terrain: this.terrain,
        wind: 0.3,
        combat: inCombat ? 1 : 0,
        // `PartyAI._equip` sockets every companion weapon into `attach.handR`
        weaponHand: 'R',
      });
    }
  }
}

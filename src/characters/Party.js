import * as THREE from 'three';
import { makeCharacter } from './Cast.js';
import { dampAngle, angleDelta } from './Player.js';
import { CharacterController } from '../world/collision/CharacterController.js';
import { Rng } from '../util/Rng.js';

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
  async init(game) {
    this.game = game;
    this.members = [];
    this.rnd = new Rng(9182);
    const terrain = game.get('Terrain');
    this.terrain = terrain;
    const player = game.get('Player');
    this.player = player;
    /** Shared with the player: same soup, same broadphase, same step rules. */
    this.collision = game.get('Collision') || (player && player.collision) || null;

    const specs = [
      { key: 'gladio', slot: [-1.95, -0.95], speedMul: 0.97, lag: 0.16 },
      { key: 'ignis', slot: [1.85, -1.45], speedMul: 1.0, lag: 0.22 },
      { key: 'prompto', slot: [0.85, -2.75], speedMul: 1.05, lag: 0.10 },
    ];

    for (const spec of specs) {
      const character = makeCharacter(spec.key);
      const root = new THREE.Group();
      root.add(character.root);
      game.scene.add(root);

      const m = {
        name: character.name,
        key: spec.key,
        character,
        root,
        slot: new THREE.Vector2(spec.slot[0], spec.slot[1]),
        speedMul: spec.speedMul,
        lag: spec.lag,
        velocity: new THREE.Vector3(),
        speed: 0,
        heading: player ? player.heading : 0,
        wander: this.rnd.range(0, Math.PI * 2),
        wanderRate: this.rnd.range(0.10, 0.22),
        glanceTimer: this.rnd.range(1.5, 6),
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
      };
      // spread them out at spawn so the first frame is never a pile
      const p = player ? player.position : new THREE.Vector3();
      m.root.position.set(p.x + spec.slot[0], 0, p.z + spec.slot[1]);
      m.root.position.y = terrain.heightAt(m.root.position.x, m.root.position.z);
      m.root.rotation.y = m.heading;
      this.members.push(m);
    }
  }

  /** The three companions' vitals, in formation order. Mirrored by `RpgSystem`. */
  get stats() { return this.members.map((m) => m.stats); }

  /** @returns {Object|undefined} member by character name */
  get(name) { return this.members.find((m) => m.name === name || m.key === name); }

  update(dt, game) {
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
      const ox = m.slot.x + Math.sin(m.wander) * 0.42;
      const oz = m.slot.y + Math.cos(m.wander * 0.73) * 0.34;
      const tx = pp.x + ox * cos + oz * sin;
      const tz = pp.z - ox * sin + oz * cos;
      m._target.set(tx, 0, tz);

      const steer = m._steer.set(tx - m.root.position.x, 0, tz - m.root.position.z);
      let dist = steer.length();

      // separation from Noctis and from each other
      const push = new THREE.Vector3();
      const addPush = (ox2, oz2, minD, weight) => {
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
        m.root.position.y = this.terrain.heightAt(m.root.position.x, m.root.position.z);
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

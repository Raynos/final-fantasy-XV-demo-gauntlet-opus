import * as THREE from 'three';
import { Rng } from '../../util/Rng.ts';
import { Weapon } from '../../combat/Weapons.ts';
import { TECH_TABLE, runTechnique } from './Techniques.ts';

/**
 * Gladiolus, Ignis and Prompto, actually fighting.
 *
 * The scene-graph `Party` owns their locomotion — formation slots, separation,
 * arrival damping, gait. This layer never fights it. Instead it **writes the
 * formation slot** each frame, so in combat the same steering code that walks
 * them down a road runs them at a sabertusk, with the correct gait, and the
 * AI only takes over the two things the slot cannot express: which way they
 * are facing while they swing, and when the swing lands.
 *
 * Roles are FFXV's:
 *
 * | who | weapon | station | behaviour |
 * |---|---|---|---|
 * | Gladiolus | greatsword | 2.6 m, front | slow heavy swings, takes the hits, taunts |
 * | Ignis | daggers | 2.2 m, flank | fast flurries, breaks off to buff and heal |
 * | Prompto | firearm | 13 m, rear | kites, never closes, keeps line of sight |
 *
 * Techniques fire from the shared tech bar in `rpg.party`. The player can
 * force one with `G` (Gladiolus), `H` (Ignis) or `J` (Prompto); left alone,
 * the AI spends bars on its own once the bar is full.
 */
export class PartyAI {
  async init(game) {
    this.game = game;
    this.party = game.get('Party');
    this.player = game.get('Player');
    this.enemies = game.get('Enemies');
    this.combat = game.get('Combat');
    this.rpg = game.get('Rpg');
    this.vfx = game.get('VFX');
    this.terrain = game.get('Terrain');
    this.rng = new Rng(4477);

    /** Set false to park the companions (screenshot scenarios). */
    this.enabled = true;
    this.linkCooldown = 0;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._techTimer = 6;
    /** Deferred technique beats: `{t, fn}`, drained in `update`. */
    this._sched = [];

    if (this.party && this.party.members) {
      for (const m of this.party.members) {
        const spec = ROLES[m.key] || ROLES.gladio;
        m.role = spec;
        m.baseSlot = m.slot.clone();
        m.baseSpeedMul = m.speedMul;
        m.aiState = 'follow';
        m.aiTimer = 0;
        m.aiTarget = null;
        m.swingIndex = 0;
        m.downed = false;
        m.downTimer = 0;
        m.reviveTarget = null;
        m._pending = null;
        this._equip(m, spec.weapon);
      }
    }

    // a link-strike offer whenever Noctis lands the end of a combo on
    // something an ally is already working on
    if (this.combat) {
      this._offHit = this.combat.on('hit', (d) => this._onPlayerHit(d));
    }
    return this;
  }

  /**
   * Arm a companion, and start them **sheathed**.
   *
   * FFXV's retinue do not walk the world holding drawn weapons: Gladiolus'
   * greatsword rides his back, Ignis' kukris sit at the belt, Prompto's pistol
   * is holstered on the thigh. They are only in hand once something is worth
   * hitting. Every peaceful field frame and every character portrait in the
   * corpus had a floating blade in it purely because this used to hard-wire
   * `setReveal(1)` into the hand socket and leave it there forever.
   *
   * Ignis gets two kukris, because one kukri and one empty fist is not the
   * silhouette.
   *
   * @param {object} m party member
   * @param {string} kind weapon class
   */
  _equip(m, kind) {
    if (!m.character || !m.character.attach) return;
    const carry = CARRY[m.key] || CARRY.gladio;
    m.weaponList = [];
    for (let i = 0; i < carry.stow.length; i++) {
      const w = new Weapon(kind);
      w.setReveal(1);
      m.weaponList.push(w);
    }
    m.weapon = m.weaponList[0];
    m.weaponKind = kind;
    m.drawn = false;
    m.drawWant = false;
    m.drawT = 1;
    this._reparent(m, false);
  }

  /**
   * Move a companion's weapons between their sheathed station and their hands.
   * @param {object} m @param {boolean} drawn
   */
  _reparent(m, drawn) {
    const carry = CARRY[m.key] || CARRY.gladio;
    const set = drawn ? carry.hold : carry.stow;
    const attach = m.character.attach;
    for (let i = 0; i < m.weaponList.length; i++) {
      const w = m.weaponList[i];
      const t = set[Math.min(i, set.length - 1)];
      const parent = attach[t.socket] || attach.handR || m.character.root;
      parent.add(w.root);
      w.root.position.fromArray(t.pos);
      w.root.rotation.fromArray(t.rot);
      w.root.scale.setScalar(t.scale || 1);
    }
    if (m.character.setGrip) {
      m.character.setGrip('R', drawn ? 1 : 0);
      m.character.setGrip('L', drawn && m.weaponList.length > 1 ? 1 : 0);
    }
  }

  /**
   * Draw or sheathe, using the same blue-crystal dissolve Noctis' armiger
   * uses so the station swap is a materialisation rather than a pop.
   * @param {object} m @param {boolean} want @param {number} dt
   */
  _carry(m, want, dt) {
    if (!m.weaponList) return;
    if (m.drawWant !== want) { m.drawWant = want; m.drawT = 0; }
    if (m.drawT >= 1) return;
    m.drawT = Math.min(1, m.drawT + dt * 3.6);
    if (m.drawT >= 0.5 && m.drawn !== want) {
      m.drawn = want;
      this._reparent(m, want);
    }
    const k = m.drawT;
    const rev = k < 0.5 ? 1 - k * 2 : (k - 0.5) * 2;
    for (const w of m.weaponList) w.setReveal(rev);
  }

  /**
   * Run `fn` in `delay` seconds of game time. Techniques are choreographed —
   * a wind-up, a hit, a follow-through — and this is how they keep time
   * without any of them owning a clock.
   * @param {number} delay @param {Function} fn
   */
  schedule(delay, fn) {
    this._sched.push({ t: delay, fn });
  }

  _drain(dt) {
    const s = this._sched;
    for (let i = s.length - 1; i >= 0; i--) {
      s[i].t -= dt;
      if (s[i].t <= 0) {
        const fn = s[i].fn;
        s.splice(i, 1);
        try { fn(); } catch (err) { console.warn('technique beat failed', err); }
      }
    }
  }

  /* --------------------------------------------------------- targeting */

  /** The enemy this companion should be working on. */
  _pickTarget(m) {
    if (!this.enemies) return null;
    const list = this.enemies.list;
    const from = m.root.position;
    const lock = this.combat && this.combat.lockTarget;
    let best = null, bestScore = Infinity;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      const d = e.root.position.distanceTo(from);
      if (d > m.role.leash) continue;
      // stay near the fight the player is in, and prefer what he is locked on
      let score = d;
      if (e === lock) score *= 0.45;
      if (e.target === this.player) score *= 0.75;
      if (e.boss) score *= 0.6;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  /* ---------------------------------------------------------- combat */

  /**
   * Land one companion attack.
   * @param {object} m party member
   * @param {object} e enemy
   * @param {object} [o] `{motion, poise, element, technique}`
   */
  strike(m, e, o = {}) {
    if (!e || e.dead) return null;
    const memberId = m.key;
    const stats = this.rpg ? this.rpg.party.stats[memberId] : null;
    let amount;
    if (stats && this.rpg) {
      const res = this.rpg.damage({
        attacker: stats, target: e, motion: o.motion ?? 1,
        weaponClass: null, isTechnique: !!o.technique,
        staggerMult: 1,
      });
      amount = res.damage;
    } else {
      amount = 120 * (o.motion ?? 1);
    }
    // Ignis' Analyse is worth something: a read target takes more from everyone
    if (e.analysed > 0) amount *= 1.15;
    const dir = this._tmp.subVectors(e.centre(), m.root.position).normalize();
    const res = e.hit(amount, dir, {
      poise: o.poise ?? m.role.poise,
      element: o.element || 'physical',
      weaponClass: o.weaponClass || m.role.weaponClass,
      source: m,
    });
    if (!res) return null;

    if (this.vfx) {
      const at = e.centre();
      this.vfx.impact({
        pos: at, dir, scale: o.scale ?? m.role.impact,
        color: o.color || m.role.colour, blood: true, terrain: null,
      });
    }
    this._emit('damage', {
      enemy: e, damage: res.damage, position: e.centre(),
      crit: false, element: o.element || null, killed: res.killed,
      staggered: res.staggered, source: memberId,
    });
    if (res.staggered) this._emit('stagger', { enemy: e });
    if (res.killed) this._emit('death', { enemy: e, by: memberId, byTechnique: !!o.technique });
    if (this.rpg) this.rpg.party.addAffinity(memberId, 1);
    return res;
  }

  _emit(name, detail) {
    if (this.combat && this.combat.emit) this.combat.emit(name, detail);
    else window.dispatchEvent(new CustomEvent(`combat:${name}`, { detail }));
  }

  /* ------------------------------------------------------ link strikes */

  /** Noctis hit something one of them is already fighting. */
  _onPlayerHit(d) {
    if (this.linkCooldown > 0 || !d || !d.enemy || d.enemy.dead) return;
    const allies = (this.party?.members || []).filter(
      (m) => !m.downed && m.aiTarget === d.enemy && m.root.position.distanceTo(d.enemy.root.position) < 12
    );
    if (!allies.length) return;
    if (this.rng.next() > 0.34) return;
    const ally = allies[this.rng.next() * allies.length | 0];
    this.linkStrike(ally, d.enemy);
  }

  /**
   * A joint attack: the ally warps in beside Noctis and they hit together.
   * @param {object} m @param {object} e
   */
  linkStrike(m, e) {
    if (!e || e.dead) return false;
    this.linkCooldown = 7;
    const c = e.centre();
    const from = c.clone().addScaledVector(
      this._tmp.set(Math.sin(m.root.rotation.y), 0, Math.cos(m.root.rotation.y)), -6
    );
    if (this.vfx) {
      this.vfx.warpStrike({
        from, to: c, t0: this.vfx.clock + 0.05, dash: 0.14,
        terrain: this.terrain, color: m.role.colour, scale: 0.85,
      });
      this.vfx.airRing({ pos: c, color: m.role.colour, from: 0.4, to: 4.2, life: 0.34, intensity: 3 });
    }
    // put the ally where the strike lands so it reads as a joint attack
    m.root.position.set(c.x - (c.x - m.root.position.x) * 0.12, m.root.position.y, c.z - (c.z - m.root.position.z) * 0.12);
    m.character?.play?.('attack_slash');
    this.strike(m, e, { motion: 2.4, poise: m.role.poise * 2, scale: 1.6 });
    if (this.combat) this.combat.hitstop = Math.max(this.combat.hitstop, 0.09);
    this._emit('link', { enemy: e, ally: m, member: m.key });
    if (this.rpg) { this.rpg.linkStrike(2); this.rpg.party.addAffinity(m.key, 12); }
    return true;
  }

  /* ------------------------------------------------------- techniques */

  /**
   * Fire a companion technique through the RPG tech bar.
   * @param {string} memberKey 'gladio' | 'ignis' | 'prompto'
   * @param {string} [techId] defaults to the best affordable one
   */
  useTechnique(memberKey, techId = null) {
    const m = this.party?.members.find((x) => x.key === memberKey);
    if (!m || m.downed) return { ok: false, reason: 'unavailable' };
    const rpg = this.rpg;
    const list = TECH_TABLE[memberKey] || [];
    let pick = techId ? list.find((t) => t.id === techId) : null;
    if (!pick) {
      const bars = rpg ? rpg.party.techBars : 3;
      const known = rpg ? rpg.party.techniquesFor(memberKey).map((t) => t.id) : list.map((t) => t.id);
      const usable = list.filter((t) => known.includes(t.id) && t.bars <= bars);
      if (!usable.length) return { ok: false, reason: 'not-enough-tech' };
      pick = usable[usable.length - 1];
    }
    if (rpg) {
      const spent = rpg.useTechnique(memberKey, pick.id);
      if (!spent.ok) return spent;
    }
    const target = m.aiTarget || this._pickTarget(m) || (this.combat && this.combat.lockTarget);
    m.aiState = 'tech';
    m.aiTimer = pick.duration;
    runTechnique(this, m, pick, target);
    window.dispatchEvent(new CustomEvent('encounter:tech', {
      detail: { member: memberKey, tech: pick.id, name: pick.name },
    }));
    return { ok: true, tech: pick };
  }

  /* -------------------------------------------------------------- tick */

  update(dt, game) {
    if (!this.enabled || !this.party || !this.party.members) return;
    if (this.linkCooldown > 0) this.linkCooldown -= dt;
    this._drain(dt);

    const dir = game.get('Encounters');
    const inCombat = dir ? dir.state === 'combat' : false;

    this._input(game);
    if (inCombat) {
      this._techTimer -= dt;
      if (this._techTimer <= 0) {
        this._techTimer = 7 + this.rng.next() * 6;
        this._autoTech();
      }
    } else {
      this._techTimer = Math.max(this._techTimer, 3);
    }

    for (const m of this.party.members) {
      // draw / sheathe runs even for a downed companion, so a wipe does not
      // leave three blades hanging in the air over the bodies
      this._carry(m, inCombat && !m.downed, dt);
      if (m.downed) { this._poseDown(m, dt); continue; }
      m.aiTimer -= dt;

      // getting Noctis back on his feet outranks everything
      if (m.reviveTarget) {
        this._station(m, m.reviveTarget.position, 1.4);
        m.speedMul = m.baseSpeedMul * 3.6;
        this._face(m, m.reviveTarget.position, dt, 6);
        if (m.root.position.distanceTo(m.reviveTarget.position) < 2.6) m.character?.play?.('cast');
        continue;
      }

      if (!inCombat) {
        if (m.aiState !== 'follow') {
          m.aiState = 'follow';
          m.slot.copy(m.baseSlot);
          m.speedMul = m.baseSpeedMul;
          m.aiTarget = null;
        }
        continue;
      }

      if (!m.aiTarget || m.aiTarget.dead) m.aiTarget = this._pickTarget(m);
      const e = m.aiTarget;
      if (!e) {
        m.slot.copy(m.baseSlot);
        m.speedMul = m.baseSpeedMul;
        continue;
      }

      m.speedMul = m.baseSpeedMul * 3.2;
      const ep = e.root.position;
      const d = m.root.position.distanceTo(ep);
      const want = m.role.range + e.radius * e.scale;

      switch (m.aiState) {
        case 'tech':
          this._face(m, ep, dt, 7);
          if (m.aiTimer <= 0) m.aiState = 'engage';
          break;
        case 'attack':
          this._face(m, ep, dt, 9);
          this._holdStation(m, e, want);
          if (m._pending && m.aiTimer <= m._pending.at) {
            const p = m._pending;
            m._pending = null;
            if (p.ranged) this._shoot(m, e, p);
            else if (d < want + 2.4) this.strike(m, e, p);
          }
          if (m.aiTimer <= 0) { m.aiState = 'recover'; m.aiTimer = m.role.recover; }
          break;
        case 'recover':
          this._face(m, ep, dt, 5);
          this._holdStation(m, e, want);
          if (m.aiTimer <= 0) m.aiState = 'engage';
          break;
        default: {
          // engage: close to the station, then swing once we are in reach
          m.aiState = 'engage';
          this._station(m, ep, want, m.role.ring ? this._ringAngle(m) : 0);
          const inReach = m.role.ranged
            ? (d <= want + 8 && d > 3)
            : d <= want + 1.8;
          if (inReach) {
            this._face(m, ep, dt, 7);
            this._beginSwing(m, e, d);
          }
          break;
        }
      }
    }
  }

  /**
   * Keyboard: G/J/K fire a technique for each companion.
   *
   * Ignis moved off H when H became the global controls card — a key that
   * opened a help overlay *and* spent a tech bar was the worst kind of clash,
   * because the overlay hid the thing it had just cost you.
   */
  _input(game) {
    const input = game.input;
    if (!input || input.enabled === false || !input.keyDown) return;
    if (input.keyDown('KeyG')) this.useTechnique('gladio');
    if (input.keyDown('KeyJ')) this.useTechnique('ignis');
    if (input.keyDown('KeyK')) this.useTechnique('prompto');
  }

  /** Spend a full bar on its own so the fight has technique beats in it. */
  _autoTech() {
    const rpg = this.rpg;
    const bars = rpg ? rpg.party.techBars : 3;
    if (bars < 1) return;
    const order = bars >= 3 ? ['gladio', 'ignis', 'prompto'] : ['gladio', 'prompto', 'ignis'];
    const hurt = this.rpg && this.rpg.roster.some((s) => s.hp / s.maxHp < 0.45);
    if (hurt && bars >= 2) { if (this.useTechnique('ignis', 'regroup').ok) return; }
    for (const k of order) {
      const m = this.party.members.find((x) => x.key === k);
      if (!m || m.downed || !m.aiTarget) continue;
      if (this.useTechnique(k).ok) return;
    }
  }

  _beginSwing(m, e, d) {
    if (m.aiTimer > 0) return;
    const r = m.role;
    m.aiState = 'attack';
    m.aiTimer = r.swing;
    m.swingIndex = (m.swingIndex + 1) % r.actions.length;
    const action = r.actions[m.swingIndex];
    m.character?.play?.(action);
    m._pending = {
      at: r.swing - r.hitAt, motion: r.motion, poise: r.poise,
      ranged: !!r.ranged, weaponClass: r.weaponClass,
    };
    if (r.ranged) m._pending.motion = r.motion * 0.6;
  }

  /** Prompto's shots: a visible tracer plus damage at range. */
  _shoot(m, e, p) {
    const from = this._tmp.copy(m.root.position);
    from.y += 1.35;
    const to = e.centre();
    if (this.vfx) {
      const b = this.vfx.acquireBeam();
      b.uniforms.uHead.value.set(0xfff0d0);
      b.uniforms.uTail.value.set(0xffb060);
      b.uniforms.uIntensity.value = 2.6;
      b.width = 0.035;
      b.setLine(from, to);
      this.vfx.track(this.vfx.clock, 0.08, (k) => { b.strength = k < 0 || k > 1 ? 0 : (1 - k); });
      this.vfx.flash({ pos: from.clone(), color: 0xffb060, intensity: 14, distance: 4, life: 0.06 });
    }
    this.strike(m, e, { ...p, scale: 0.7 });
  }

  /** Where a flanker sits on the ring around its target. */
  _ringAngle(m) {
    return m.key === 'ignis' ? 2.1 : m.key === 'prompto' ? -2.1 : 0;
  }

  /**
   * Write the formation slot so `Party.update` walks this companion to a
   * world point. The slot is expressed in Noctis' frame, so invert his
   * rotation to get there.
   * @param {object} m
   * @param {THREE.Vector3} at world point to stand near
   * @param {number} standoff metres to keep from it
   * @param {number} [angle] radians offset around the target
   */
  _station(m, at, standoff, angle = 0) {
    const p = this.player;
    if (!p) return;
    let gx = at.x, gz = at.z;
    if (standoff > 0) {
      const dx = m.root.position.x - at.x, dz = m.root.position.z - at.z;
      let a = Math.atan2(dx, dz);
      if (angle) a += angle * 0.4;
      gx = at.x + Math.sin(a) * standoff;
      gz = at.z + Math.cos(a) * standoff;
    }
    const ph = p.root.rotation.y;
    const cos = Math.cos(ph), sin = Math.sin(ph);
    const dx = gx - p.position.x, dz = gz - p.position.z;
    m.slot.set(dx * cos - dz * sin, dx * sin + dz * cos);
  }

  /** Keep the current standoff without chasing while mid-swing. */
  _holdStation(m, e, want) {
    this._station(m, e.root.position, want);
  }

  /** Override the facing `Party` picked, so they look at what they are hitting. */
  _face(m, at, dt, k = 6) {
    const want = Math.atan2(at.x - m.root.position.x, at.z - m.root.position.z);
    let d = want - m.root.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    m.root.rotation.y += d * Math.min(1, k * dt);
  }

  /** A downed companion lies where they fell. */
  _poseDown(m, dt) {
    m.slot.copy(m.baseSlot);
    m.speedMul = 0.0001;
    m.aiTarget = null;
    m.aiState = 'down';
  }
}

/** Per-companion combat profile. */
const ROLES = {
  gladio: {
    weapon: 'greatsword', weaponClass: 'greatsword', range: 2.8, leash: 40,
    swing: 1.15, hitAt: 0.55, recover: 0.55, motion: 1.7, poise: 34,
    impact: 1.5, colour: 0xffc070, ring: false, ranged: false,
    actions: ['attack_overhead', 'attack_slash'],
  },
  ignis: {
    weapon: 'daggers', weaponClass: 'dagger', range: 2.3, leash: 36,
    swing: 0.62, hitAt: 0.3, recover: 0.22, motion: 0.85, poise: 12,
    impact: 0.9, colour: 0xbfe8ff, ring: true, ranged: false,
    actions: ['attack_slash', 'attack_thrust', 'attack_slash'],
  },
  prompto: {
    weapon: 'firearm', weaponClass: 'firearm', range: 13, leash: 44,
    swing: 0.7, hitAt: 0.35, recover: 0.5, motion: 0.7, poise: 6,
    impact: 0.6, colour: 0xffd8a0, ring: true, ranged: true,
    actions: ['attack_thrust'],
  },
};

/**
 * Where each companion's weapons ride sheathed, and how they sit in the hand.
 *
 * Transforms are local to the named `Character.attach` socket. The hand
 * sockets are authored as a *fist frame* (see `Character._palmSocket`): the
 * blade leaves along the thumb side and the cutting edge follows the fingers,
 * so a plain melee grip needs no rotation here at all. The pistol does, since
 * its geometry runs grip-down/barrel-forward rather than blade-along-+Y — one
 * quarter turn about Y aims the bore where an index finger would point.
 *
 * The stow transforms are absolute metres, not multiples of the rig scale:
 * a greatsword is 2.05 m of steel whoever is carrying it.
 */
const CARRY = {
  gladio: {
    // hilt above the right shoulder, blade near-vertical down the back with
    // the tip out past the left heel — 2.05 m of steel on a 2.00 m man has to
    // go somewhere, and this is where FFXV puts it
    stow: [{ socket: 'back', pos: [-0.095, 0.008, -0.094], rot: [0.061, 0, 3.013] }],
    hold: [{ socket: 'handR', pos: [0, 0, 0], rot: [0, 0, 0] }],
  },
  ignis: {
    // a kukri on each side of the belt, hanging tip-down and raked back
    stow: [
      { socket: 'hip', pos: [-0.07, 0.02, 0.02], rot: [0.386, 0, 3.328] },
      { socket: 'hip', pos: [0.35, 0.05, 0.02], rot: [0.386, Math.PI, 3.328] },
    ],
    hold: [
      { socket: 'handR', pos: [0, 0, 0], rot: [0, 0, 0] },
      { socket: 'handL', pos: [0, 0, 0], rot: [0, 0, 0] },
    ],
  },
  prompto: {
    // holstered on the right thigh, muzzle down, butt to the rear
    stow: [{ socket: 'hip', pos: [-0.075, -0.145, 0.055], rot: [Math.PI * 0.5, 0, -0.20] }],
    hold: [{ socket: 'handR', pos: [0, 0, 0], rot: [0, Math.PI * 0.5, 0] }],
  },
};

export { ROLES, CARRY };

import * as THREE from 'three';
import { Rng } from '../util/Rng.js';
import { WEAPONS, Weapon, Armiger } from './Weapons.js';
import { Elemancy } from './Elemancy.js';

/**
 * Real-time action combat.
 *
 * Hold-to-attack auto-combos with per-weapon arcs and timing, dodge-roll,
 * hold-to-phase (MP-draining parry with a slow-motion counter window),
 * blindside bonuses, link-strikes, warp-strike / warp-to-point with a Stasis
 * recovery state, Armiger burst, and elemancy.
 *
 * Everything that other systems care about is surfaced as an event (see
 * `on()` / the mirrored `combat:*` window events) — damage numbers, hit
 * confirms, lock-on changes, warp start/impact, stagger, death and MP.
 */
export class CombatSystem {
  async init(game) {
    this.game = game;
    this.rng = new Rng(51221);
    this.inCombat = false;

    this.vfx = game.get('VFX');
    this.enemies = game.get('Enemies');
    this.player = game.get('Player');
    this.terrain = game.get('Terrain');
    this.elemancy = new Elemancy(this.vfx, game);

    /* ---- weapon rig: an anchor the player's "hand" drives ------------ */
    this.hand = new THREE.Group();
    this.hand.position.set(0.30, 1.12, 0.12);
    if (this.player && this.player.root) this.player.root.add(this.hand);
    else game.scene.add(this.hand);

    this._prevTip = new THREE.Vector3();
    this._tip = new THREE.Vector3();
    this._base = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._axis = new THREE.Vector3(0, 1, 0);
    this._q = new THREE.Quaternion();
    this._qt = new THREE.Quaternion();
    this._hits = [];

    this.weaponCache = new Map();
    this.weapon = null;
    this._prebuildWeapons(game);
    this.setWeapon('sword', { materialise: false });

    this.armiger = new Armiger({ count: 6 });
    // parented under the VFX root so it is excluded from the AO G-buffer
    (this.vfx ? this.vfx.root : game.scene).add(this.armiger.group);

    /* ---- state ------------------------------------------------------- */
    this.state = 'idle';        // idle | attack | dodge | phase | warp | stasis | hurt
    this.stateTime = 0;
    this.comboIndex = -1;
    this.comboStep = null;
    this.comboPhase = 'none';   // wind | active | rec
    this.comboTimer = 0;
    this.comboQueued = false;
    this.hitThisSwing = new Set();
    this.trail = null;
    this.lockTarget = null;
    this.hitstop = 0;
    this.slowmo = 0;
    this.phaseCharge = 0;
    this.counterWindow = 0;
    this.stasis = false;
    this.mpRegenDelay = 0;
    this.armigerTimer = 0;
    this.linkCooldown = 0;
    this.warp = null;
    this._listeners = new Map();

    if (this.enemies) this.enemies.onEnemyStrike = (e) => this._enemyStrike(e);
  }

  /* --------------------------------------------------------- events */

  /**
   * Subscribe to a combat event.
   * Events: `damage` {enemy,damage,position,crit,element,killed}
   *         `hit` {position,normal,weapon}
   *         `lockon` {enemy|null}
   *         `warp` {phase:'start'|'impact', from, to, enemy}
   *         `stagger` {enemy}  `death` {enemy}
   *         `mp` {mp,maxMp,stasis}  `combo` {index,weapon}
   *         `parry` {enemy,position}  `link` {enemy,ally}
   */
  on(name, fn) {
    if (!this._listeners.has(name)) this._listeners.set(name, new Set());
    this._listeners.get(name).add(fn);
    return () => this.off(name, fn);
  }

  off(name, fn) { this._listeners.get(name)?.delete(fn); }

  /** Emit locally and mirror onto `window` as `combat:<name>` for HUD/audio. */
  emit(name, detail) {
    const set = this._listeners.get(name);
    if (set) for (const fn of set) fn(detail);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`combat:${name}`, { detail }));
    }
  }

  /* -------------------------------------------------------- weapons */

  /**
   * Build every weapon class up front and leave all of them parented to the
   * hand, dematerialised.
   *
   * Building one lazily on first swap looked harmless — the geometry is a
   * couple of thousand triangles and takes 0.2 ms to generate — but the mesh
   * then reaches its first render with an uncompiled program, and the driver
   * compiles it synchronously in the middle of the frame. Worse, the material
   * is only picked up by the sky's atmosphere patch on its next scan, so it
   * compiles *twice*: once bare, once patched. Two half-second stalls the
   * instant the player pressed a number key.
   *
   * Constructing them here means they are in the scene graph before Game's
   * boot-time `renderer.compile()`, and patching them here means the program
   * that compile warms is the final, atmosphere-patched one. All five then
   * share a single program (the material's `customProgramCacheKey` is
   * constant), so a swap costs one visibility flip.
   *
   * @param {object} game
   */
  _prebuildWeapons(game) {
    const patch = game.get('Sky') && game.get('Sky').patch;
    for (const kind of Object.keys(WEAPONS)) {
      const w = new Weapon(kind);
      w.setReveal(0);
      this.hand.add(w.root);
      if (patch) patch.patch(w.material);
      this.weaponCache.set(kind, w);
    }
  }

  /** @param {'sword'|'greatsword'|'polearm'|'daggers'|'firearm'} kind */
  setWeapon(kind, { materialise = true } = {}) {
    if (this.weapon && this.weapon.kind === kind) return this.weapon;
    let w = this.weaponCache.get(kind);
    if (!w) {
      // A kind outside WEAPONS (Armiger fillers, modded gear): still cached,
      // but it pays a one-frame compile the first time it is drawn.
      w = new Weapon(kind);
      this.hand.add(w.root);
      const patch = this.game.get('Sky') && this.game.get('Sky').patch;
      if (patch) patch.patch(w.material);
      this.weaponCache.set(kind, w);
    }
    if (this.weapon) this.weapon.setReveal(0);
    this.weapon = w;
    if (materialise) this.materialise();
    else w.setReveal(1);
    this.comboIndex = -1;
    return w;
  }

  /** Blue-crystal draw: the blade assembles out of light from hilt to tip. */
  materialise(t0 = this.vfx ? this.vfx.clock : 0) {
    const w = this.weapon;
    if (!w) return;
    w.setReveal(0);
    if (!this.vfx) { w.setReveal(1); return; }
    this.vfx.track(t0, 0.34, (n) => {
      // A second swap during the draw must not resurrect the blade we put away
      if (this.weapon !== w) return;
      w.setReveal(n < 0 ? 0 : n > 1 ? 1 : n);
    });
    this.hand.updateWorldMatrix(true, false);
    const p = this._tmp.setFromMatrixPosition(this.hand.matrixWorld);
    this.vfx.crystalBurst({ pos: p, count: 16, speed: 3.2, t0, life: 0.5, size: 0.16, gravity: -3 });
    this.vfx.moteBurst({ pos: p, count: 22, speed: 2.2, color: 0x5fc0ff, life: 0.7, t0, size: 0.18, intensity: 4 });
    this.vfx.flash({ pos: p, color: 0x59b8ff, intensity: 18, distance: 6, life: 0.3, t0 });
    this.emit('materialise', { position: p });
  }

  /* ------------------------------------------------------ targeting */

  /** Set (or clear) the lock-on target and emit `lockon`. */
  lockOn(enemy) {
    if (this.lockTarget === enemy) return;
    this.lockTarget = enemy || null;
    if (this.enemies) for (const e of this.enemies.list) e.locked = (e === this.lockTarget);
    this.emit('lockon', { enemy: this.lockTarget });
  }

  /** Nearest valid enemy in front of the camera. */
  autoTarget(maxDist = 30) {
    if (!this.enemies || !this.player) return null;
    this.game.camera.getWorldDirection(this._fwd);
    this._fwd.y = 0; this._fwd.normalize();
    return this.enemies.pickTarget(this.player.position, this._fwd, maxDist, -0.2);
  }

  /* -------------------------------------------------------- combat */

  /** Begin (or continue) the auto-combo. */
  attack() {
    if (this.state === 'warp' || this.state === 'dodge') return;
    if (this.state === 'attack') { this.comboQueued = true; return; }
    this._startSwing(0);
  }

  _startSwing(index) {
    const def = this.weapon.def;
    const step = def.combo[index % def.combo.length];
    this.state = 'attack';
    this.stateTime = 0;
    this.comboIndex = index;
    this.comboStep = step;
    this.comboPhase = 'wind';
    this.comboTimer = 0;
    this.comboQueued = false;
    this.hitThisSwing.clear();
    this._axis.fromArray(step.axis).normalize();

    if (this.vfx && !def.ranged) {
      this.trail = this.vfx.trails.acquire();
      const t = def.trail;
      this.trail.setColors(t.head, t.tail, 0xffffff);
      this.trail.life = t.life;
      this.trail.uniforms.uLife.value = t.life;
    }
    this.emit('combo', { index, weapon: this.weapon.kind, step });
  }

  /** Evasive roll in the current movement direction. */
  dodge() {
    if (this.state === 'warp' || this.state === 'dodge') return;
    this.state = 'dodge';
    this.stateTime = 0;
    this._endSwing();
    this.emit('dodge', {});
    const p = this.player;
    if (p) {
      const in2 = this.game.input.move;
      this._tmp.set(in2.x, 0, in2.y);
      if (this._tmp.lengthSq() < 0.01) this._tmp.set(-Math.sin(p.heading), 0, -Math.cos(p.heading));
      this._tmp.normalize();
      this.dodgeDir = this._tmp.clone();
      if (this.vfx) {
        const gp = p.position.clone();
        this.vfx.dustPuff({ pos: gp, count: 16, radius: 0.35, speed: 3.0, life: 0.9, size: 0.45, grow: 3 });
      }
    }
  }

  /**
   * The signature move. Blink to a target, land the hit, spend MP.
   * @param {object} [enemy] defaults to the lock-on / auto target
   */
  warpStrike(enemy = this.lockTarget || this.autoTarget()) {
    const p = this.player;
    if (!p || this.stasis || this.state === 'warp') return false;
    if (p.stats.mp < 12) { this._enterStasis(); return false; }
    const target = enemy;
    const from = p.position.clone(); from.y += 1.1;
    const to = target
      ? target.centre().add(this._tmp.set(0, 0, 0))
      : from.clone().addScaledVector(this._fwd.set(Math.sin(p.heading), 0.25, Math.cos(p.heading)), 9);
    // stop just short so the player lands *at* the enemy, not inside it
    if (target) {
      const back = new THREE.Vector3().subVectors(from, to).setY(0).normalize();
      to.addScaledVector(back, target.radius * target.scale + 0.7);
    }
    p.stats.mp = Math.max(0, p.stats.mp - 12);
    this.emit('mp', { mp: p.stats.mp, maxMp: p.stats.maxMp, stasis: false });

    const t0 = this.vfx.clock;
    const impactT = this.vfx.warpStrike({ from, to, t0, dash: 0.16, terrain: this.terrain });
    this.emit('warp', { phase: 'start', from, to, enemy: target });

    this.state = 'warp';
    this.stateTime = 0;
    this.warp = { from, to, t0, impactT, enemy: target, struck: false, dash: 0.16 };
    if (this.weapon) this.weapon.setReveal(0.0);
    return true;
  }

  /** Repositioning warp to a point (no strike). */
  warpTo(point) {
    const p = this.player;
    if (!p || this.stasis) return false;
    if (p.stats.mp < 8) { this._enterStasis(); return false; }
    p.stats.mp = Math.max(0, p.stats.mp - 8);
    const from = p.position.clone(); from.y += 1.1;
    this.vfx.warpTo({ from, to: point, t0: this.vfx.clock, terrain: this.terrain });
    p.root.position.copy(point);
    this.emit('warp', { phase: 'point', from, to: point });
    this.emit('mp', { mp: p.stats.mp, maxMp: p.stats.maxMp, stasis: false });
    return true;
  }

  _enterStasis() {
    if (this.stasis) return;
    this.stasis = true;
    this.state = 'stasis';
    this.stateTime = 0;
    this.mpRegenDelay = 1.2;
    this.emit('mp', { mp: 0, maxMp: this.player.stats.maxMp, stasis: true });
    if (this.vfx && this.player) {
      const p = this.player.position.clone(); p.y += 1.1;
      this.vfx.moteBurst({ pos: p, count: 16, speed: 1.4, color: 0x4a6a8a, life: 1.2, size: 0.16, intensity: 1.6 });
    }
  }

  /** Fire the Armiger burst: phantom arms orbit, then rain in. */
  armigerBurst(duration = 6) {
    this.armigerTimer = duration;
    if (this.vfx && this.player) {
      const p = this.player.position.clone(); p.y += 1.0;
      this.vfx.crystalBurst({ pos: p, count: 34, speed: 7, life: 0.9, size: 0.30 });
      this.vfx.flash({ pos: p, color: 0x59b8ff, intensity: 70, distance: 16, life: 0.6, priority: 6 });
      if (this.terrain) this.vfx.ground.ring({ pos: this.player.position, terrain: this.terrain, radius: 4, color: 0x8ed4ff, life: 0.9 });
    }
    this.emit('armiger', { duration });
  }

  /** Cast a spell at a world point (or at the lock target). */
  cast(element, at) {
    const p = this.player;
    const pos = at || (this.lockTarget ? this.lockTarget.centre() : null);
    if (!pos || !p) return null;
    const from = p.position.clone(); from.y += 1.3;
    const res = this.elemancy.cast(element, { pos, t0: this.vfx.clock, power: 1, terrain: this.terrain, from });
    // area damage
    if (this.enemies) {
      for (const e of this.enemies.sphereQuery(pos, res.radius, this._hits)) {
        this._applyDamage(e, res.damage * (0.7 + this.rng.next() * 0.5), pos, { element, poise: 30 });
      }
    }
    this.emit('spell', { element, position: pos, reaction: res.reaction });
    return res;
  }

  /* --------------------------------------------------------- damage */

  _applyDamage(enemy, amount, at, opts = {}) {
    const dir = this._tmp.subVectors(enemy.centre(), at);
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    dir.normalize();
    // Enemies score weapon-class weakness off `weaponClass`. Stamp it here,
    // at the one choke point every physical hit passes through, rather than at
    // each call site — three sites drift, one cannot. Spells identify by
    // element instead and must not claim a class.
    if (opts.weaponClass === undefined && !opts.element && this.weapon) {
      const kind = this.weapon.kind;
      opts.weaponClass = kind === 'daggers' ? 'dagger' : kind;
    }
    const res = enemy.hit(amount, dir, opts);
    if (!res) return null;
    this.emit('damage', {
      enemy, damage: res.damage, position: enemy.centre(),
      crit: res.crit, element: res.element, killed: res.killed, staggered: res.staggered,
    });
    if (res.staggered) this.emit('stagger', { enemy });
    if (res.killed) {
      this.emit('death', { enemy });
      if (this.vfx) {
        const c = enemy.centre();
        this.vfx.moteBurst({ pos: c, count: 26, speed: 3.2, color: 0x8fc8ff, life: 1.4, size: 0.3, gravity: 1.2, intensity: 3 });
        this.vfx.smokePlume({ pos: c, count: 14, speed: 1.6, life: 2.4, color: 0x1a1620, size: 0.6, rise: 1.6 });
      }
      if (enemy === this.lockTarget) this.lockOn(this.autoTarget());
    }
    return res;
  }

  /** True when the player is behind the enemy's facing — blindside bonus. */
  _isBlindside(enemy) {
    if (!this.player) return false;
    const ef = this._tmp.set(Math.sin(enemy.heading), 0, Math.cos(enemy.heading));
    const toPlayer = this._fwd.subVectors(this.player.position, enemy.root.position).setY(0);
    if (toPlayer.lengthSq() < 1e-5) return false;
    return ef.dot(toPlayer.normalize()) < -0.35;
  }

  _enemyStrike(enemy) {
    if (!this.player) return;
    const d = enemy.root.position.distanceTo(this.player.position);
    if (d > enemy.attackRange + 1.2) return;
    if (this.state === 'phase' && this.phaseCharge > 0.05) {
      this._perfectParry(enemy);
      return;
    }
    if (this.state === 'dodge' && this.stateTime < 0.32) return;   // i-frames
    const dmg = Math.round(enemy.damage * (0.85 + this.rng.next() * 0.3));
    this.player.stats.hp = Math.max(0, this.player.stats.hp - dmg);
    const at = this.player.position.clone(); at.y += 1.1;
    if (this.vfx) {
      this.vfx.impact({
        pos: at, dir: this._tmp.subVectors(at, enemy.centre()).normalize(),
        scale: 1.1, color: 0xff5a3a, blood: true, terrain: this.terrain,
      });
    }
    this.hitstop = 0.06;
    this.emit('playerHit', { enemy, damage: dmg, hp: this.player.stats.hp, position: at });
  }

  _perfectParry(enemy) {
    const at = this.player.position.clone(); at.y += 1.2;
    if (this.vfx) {
      this.vfx.flare({ pos: at, color: 0xdff4ff, size: 4.0, life: 0.35, intensity: 10 });
      this.vfx.crystalBurst({ pos: at, count: 22, speed: 6.5, life: 0.7, size: 0.22 });
      this.vfx.sparkBurst({
        pos: at, dir: this._tmp.subVectors(at, enemy.centre()).normalize(),
        count: 40, speed: 13, color: 0xcfeaff, size: 0.11, intensity: 8,
      });
      this.vfx.flash({ pos: at, color: 0x8fd8ff, intensity: 90, distance: 16, life: 0.45, priority: 7 });
      if (this.terrain) this.vfx.ground.ring({ pos: this.player.position, terrain: this.terrain, radius: 3.2, color: 0xbfe8ff, life: 0.6 });
    }
    this.slowmo = 0.55;
    this.counterWindow = 0.9;
    this.emit('parry', { enemy, position: at });
  }

  /** Counter-attack: a free, heavy, guaranteed-blindside riposte. */
  counter(enemy = this.lockTarget || this.autoTarget()) {
    if (this.counterWindow <= 0 || !enemy) return false;
    this.counterWindow = 0;
    const amount = this.weapon.def.damage * 2.4;
    this._applyDamage(enemy, amount, this.player.position, { poise: 60, blindside: true });
    if (this.vfx) {
      const c = enemy.centre();
      this.vfx.impact({ pos: c, dir: this._tmp.subVectors(c, this.player.position).normalize(), scale: 1.8, color: 0xbfe8ff, terrain: this.terrain, blood: true });
    }
    this.hitstop = 0.11;
    return true;
  }

  /** A party member joins the attack for bonus damage. */
  _tryLinkStrike(enemy) {
    if (this.linkCooldown > 0 || !enemy) return;
    if (this.rng.next() > 0.22) return;
    this.linkCooldown = 8;
    const party = this.game.get('Party');
    const ally = party && party.members ? party.members[Math.floor(this.rng.next() * party.members.length)] : null;
    const c = enemy.centre();
    const dir = this._tmp.set(Math.cos(this.rng.next() * 6.28), 0.2, Math.sin(this.rng.next() * 6.28)).normalize();
    const from = c.clone().addScaledVector(dir, 5.5);
    if (this.vfx) {
      this.vfx.warpStrike({ from, to: c, t0: this.vfx.clock + 0.06, dash: 0.14, terrain: this.terrain, color: 0xffcf6a, scale: 0.8 });
    }
    this._applyDamage(enemy, this.weapon.def.damage * 1.8, from, { poise: 45 });
    this.emit('link', { enemy, ally });
  }

  /* ----------------------------------------------------------- tick */

  update(dt, game) {
    const raw = game.time.rawDt;
    const input = game.input;
    const p = this.player;

    /* time dilation ------------------------------------------------- */
    if (this.hitstop > 0) {
      this.hitstop -= raw;
      game.time.scale = 0.06;
    } else if (this.slowmo > 0) {
      this.slowmo -= raw;
      game.time.scale = 0.28;
    } else if (game.time.scale !== 1) {
      game.time.scale = THREE.MathUtils.damp(game.time.scale, 1, 12, raw);
      if (game.time.scale > 0.985) game.time.scale = 1;
    }
    if (this.counterWindow > 0) this.counterWindow -= raw;
    if (this.linkCooldown > 0) this.linkCooldown -= dt;

    if (!p) return;
    this.inCombat = !!(this.enemies && this.enemies.alive().some(
      (e) => e.root.position.distanceTo(p.position) < 34
    ));

    // scenario shots author the pose directly; keep the sim from unwinding it
    if (this.scenarioLock) {
      if (this.armiger.active > 0.001) {
        this.armiger.setClock(this.vfx.clock);
        this.armiger.layout(this._armigerCentre || p.position, this.vfx.clock, this._armigerOpts);
      }
      return;
    }

    /* input --------------------------------------------------------- */
    if (input.enabled !== false && !this.scenarioLock) this._readInput(input, dt);

    /* MP ------------------------------------------------------------ */
    if (this.state === 'phase') {
      p.stats.mp = Math.max(0, p.stats.mp - 22 * dt);
      this.phaseCharge = Math.min(1, this.phaseCharge + dt * 3);
      if (p.stats.mp <= 0) this._enterStasis();
    } else {
      this.phaseCharge = Math.max(0, this.phaseCharge - dt * 4);
      if (this.mpRegenDelay > 0) this.mpRegenDelay -= dt;
      else if (p.stats.mp < p.stats.maxMp) {
        p.stats.mp = Math.min(p.stats.maxMp, p.stats.mp + (this.stasis ? 26 : 13) * dt);
        if (this.stasis && p.stats.mp >= p.stats.maxMp * 0.999) {
          this.stasis = false;
          this.state = 'idle';
          this.emit('mp', { mp: p.stats.mp, maxMp: p.stats.maxMp, stasis: false });
        }
      }
    }

    /* state machine ------------------------------------------------- */
    this.stateTime += dt;
    switch (this.state) {
      case 'attack': this._tickSwing(dt); break;
      case 'dodge': this._tickDodge(dt); break;
      case 'warp': this._tickWarp(dt); break;
      case 'phase': this._tickPhase(dt); break;
      case 'stasis': if (!this.stasis) this.state = 'idle'; break;
      default: this._restPose(dt); break;
    }

    /* armiger ------------------------------------------------------- */
    if (this.armigerTimer > 0) {
      this.armigerTimer -= dt;
      this.armiger.active = THREE.MathUtils.damp(this.armiger.active, 1, 6, dt);
    } else if (this.armiger.active > 0.001) {
      this.armiger.active = THREE.MathUtils.damp(this.armiger.active, 0, 6, dt);
    }
    if (this.armiger.active > 0.001) {
      this.armiger.setClock(this.vfx.clock);
      this.armiger.layout(p.position, this.vfx.clock);
    } else {
      this.armiger.group.visible = false;
    }

    this.elemancy.update();
  }

  _readInput(input, dt) {
    const m = input.mouse;
    // Gamepad face buttons mirror the keyboard verbs one for one, so the
    // controls card can print both columns without either being a promise the
    // game does not keep. `gpDown` is a real rising edge tracked by Input.
    const pad = input.gpDown ? input : null;
    const gpHeld = (i) => !!(pad && input.gpButton(i));
    const gpEdge = (i) => !!(pad && input.gpDown(i));

    // Circle taps to dodge and holds to phase, exactly as FFXV does it. A/Cross
    // stays free for the interact verb, which owns it everywhere else.
    if (m.left || gpHeld(2)) this.attack();
    if (input.keyDown('Space') || gpEdge(1)) this.dodge();
    if (gpEdge(3)) { if (this.counterWindow > 0) this.counter(); else this.warpStrike(); }
    if (gpEdge(4)) this.armigerBurst();
    if (gpEdge(5)) this.lockOn(this.lockTarget ? null : this.autoTarget());
    if (gpEdge(12)) this.setWeapon('sword');
    if (gpEdge(15)) this.setWeapon('greatsword');
    if (gpEdge(13)) this.setWeapon('polearm');
    if (gpEdge(14)) this.setWeapon('daggers');
    if ((m.right || gpHeld(1)) && !this.stasis) {
      if (this.state !== 'phase' && this.state !== 'warp') { this.state = 'phase'; this.stateTime = 0; }
    } else if (this.state === 'phase') { this.state = 'idle'; }
    if (input.keyDown('KeyQ')) {
      if (this.counterWindow > 0) this.counter();
      else this.warpStrike();
    }
    // R, not E: E is the world's interact verb and nothing else, or standing
    // near a shop counter mid-fight point-warps you instead of opening it.
    if (input.keyDown('KeyR')) {
      const t = this.autoTarget(40);
      if (t) this.warpTo(t.root.position.clone().add(new THREE.Vector3(0, 0, 3)));
    }
    // Y, not Tab: Tab is the pause menu, globally.
    if (input.keyDown('KeyY')) this.lockOn(this.lockTarget ? null : this.autoTarget());
    if (input.keyDown('KeyX')) this.armigerBurst();
    if (input.keyDown('Digit1')) this.setWeapon('sword');
    if (input.keyDown('Digit2')) this.setWeapon('greatsword');
    if (input.keyDown('Digit3')) this.setWeapon('polearm');
    if (input.keyDown('Digit4')) this.setWeapon('daggers');
    if (input.keyDown('Digit5')) this.setWeapon('firearm');
    // Magic sits on 6/7/8, next to the armaments on 1-5, so the whole "what am
    // I attacking with" row is one contiguous strip. It also frees C for photo
    // mode, which used to fire a Thundara every time you took a picture.
    if (input.keyDown('Digit6')) this.cast('fire');
    if (input.keyDown('Digit7')) this.cast('ice');
    if (input.keyDown('Digit8')) this.cast('lightning');
  }

  /* -------------------------------------------------------- swings */

  _tickSwing(dt) {
    const step = this.comboStep;
    this.comboTimer += dt;
    let n = 0;
    if (this.comboPhase === 'wind') {
      n = this.comboTimer / step.wind;
      if (n >= 1) { this.comboPhase = 'active'; this.comboTimer = 0; n = 0; }
    }
    if (this.comboPhase === 'active') {
      n = this.comboTimer / step.active;
      if (n >= 1) { this.comboPhase = 'rec'; this.comboTimer = 0; n = 0; }
    }
    if (this.comboPhase === 'rec') {
      n = this.comboTimer / step.rec;
      if (n >= 1) {
        const def = this.weapon.def;
        if (this.comboQueued && this.comboIndex + 1 < def.combo.length) this._startSwing(this.comboIndex + 1);
        else { this._endSwing(); this.state = 'idle'; }
        return;
      }
    }

    // swing pose: ease into the arc during wind, snap through it while active
    let ang;
    const [a0, a1] = step.arc;
    if (this.comboPhase === 'wind') ang = THREE.MathUtils.lerp(a0 * 0.6, a0, ease(n));
    else if (this.comboPhase === 'active') ang = THREE.MathUtils.lerp(a0, a1, snap(n));
    else ang = THREE.MathUtils.lerp(a1, a1 * 0.7, ease(n));

    this._poseHand(ang, step, this.comboPhase, n);

    if (this.comboPhase === 'active') {
      if (step.shoot) this._fireShot(n);
      else this._sweepHits();
      if (this.trail) {
        this.hand.updateWorldMatrix(true, true);
        this.trail.push(this.weapon.base(), this.weapon.tip());
      }
    } else if (this.trail && this.comboPhase === 'rec') {
      this.trail.release();
    }
  }

  /** Place the weapon anchor for a given swing angle. */
  _poseHand(ang, step, phase, n) {
    const h = this.hand;
    this._q.setFromAxisAngle(this._axis, ang);
    this._qt.setFromEuler(EULER.set(step.tilt || 0, 0, -0.35));
    h.quaternion.copy(this._q).multiply(this._qt);
    const reach = step.thrust ? (phase === 'active' ? 0.55 * Math.sin(n * Math.PI) : 0) : 0;
    h.position.set(0.30, 1.12, 0.12 + reach);
  }

  _restPose(dt) {
    const h = this.hand;
    IDLE_Q.setFromEuler(EULER.set(-0.22, 0.3, -1.9));
    h.quaternion.slerp(IDLE_Q, Math.min(1, dt * 9));
    h.position.lerp(REST_POS, Math.min(1, dt * 9));
  }

  _endSwing() {
    if (this.trail) { this.trail.release(); this.trail = null; }
    this.comboPhase = 'none';
    this.comboStep = null;
  }

  _sweepHits() {
    if (!this.enemies || !this.weapon) return;
    this.hand.updateWorldMatrix(true, true);
    this._tip.copy(this.weapon.tip());
    this._base.copy(this.weapon.base());
    const list = this.enemies.sweepQuery(this._base, this._tip, this.weapon.def.hitbox, this._hits);
    for (const e of list) {
      if (this.hitThisSwing.has(e)) continue;
      this.hitThisSwing.add(e);
      const blindside = this._isBlindside(e);
      const dmg = this.weapon.def.damage * (this.comboStep.dmg || 1) * (0.9 + this.rng.next() * 0.2);
      this._applyDamage(e, dmg, this._base, { blindside, poise: this.weapon.def.poise });
      const at = this._closestOn(e, this._tip);
      if (this.vfx) {
        this.vfx.impact({
          pos: at, dir: this._tmp.subVectors(this._tip, this._base).normalize(),
          scale: blindside ? 1.5 : 1.0,
          color: blindside ? 0xbfe8ff : 0xffcf8a,
          blood: true, terrain: null,
        });
      }
      this.hitstop = blindside ? 0.085 : 0.055;
      this.emit('hit', { enemy: e, position: at, weapon: this.weapon.kind, blindside });
      if (this.comboIndex === this.weapon.def.combo.length - 1) this._tryLinkStrike(e);
    }
  }

  _closestOn(enemy, p) {
    const c = enemy.centre();
    return c.lerp(p, 0.55);
  }

  _fireShot(n) {
    if (this._shotFired) return;
    this._shotFired = true;
    const target = this.lockTarget || this.autoTarget(30);
    this.hand.updateWorldMatrix(true, true);
    const muzzle = this.weapon.tip();
    this.emit('shot', { position: muzzle });
    const to = target ? target.centre() : muzzle.clone().addScaledVector(
      this._tmp.set(Math.sin(this.player.heading), 0, Math.cos(this.player.heading)), 26
    );
    if (this.vfx) {
      const b = this.vfx.acquireBeam();
      b.uniforms.uHead.value.set(0xfff0d0);
      b.uniforms.uTail.value.set(0xffb060);
      b.uniforms.uTaper.value = 0.0;
      b.uniforms.uFalloff.value = 0.0;
      b.uniforms.uIntensity.value = 3.0;
      b.width = 0.045;
      b.setLine(muzzle, to);
      this.vfx.track(this.vfx.clock, 0.09, (k) => { b.strength = k < 0 || k > 1 ? 0 : (1 - k); });
      this.vfx.sparkBurst({
        pos: muzzle, dir: this._tmp.subVectors(to, muzzle).normalize(), count: 12,
        speed: 10, spread: 0.45, color: 0xffc070, size: 0.07, life: 0.2, intensity: 7,
      });
      this.vfx.flash({ pos: muzzle, color: 0xffb060, intensity: 22, distance: 5, life: 0.08 });
    }
    if (target) {
      this._applyDamage(target, this.weapon.def.damage * (this.comboStep.dmg || 1), muzzle, { poise: 6 });
      if (this.vfx) this.vfx.impact({ pos: target.centre(), dir: this._tmp.subVectors(target.centre(), muzzle).normalize(), scale: 0.7, color: 0xffcf8a, blood: true });
    }
    setTimeout(() => { this._shotFired = false; }, 0);
  }

  /* --------------------------------------------------------- dodge */

  _tickDodge(dt) {
    const p = this.player;
    const T = 0.46;
    const n = Math.min(1, this.stateTime / T);
    const speed = 11 * Math.pow(1 - n, 1.6);
    p.root.position.addScaledVector(this.dodgeDir, speed * dt);
    if (this.terrain) p.root.position.y = this.terrain.heightAt(p.root.position.x, p.root.position.z);
    if (n >= 1) this.state = 'idle';
  }

  /* ---------------------------------------------------------- warp */

  _tickWarp(dt) {
    const w = this.warp;
    const p = this.player;
    if (!w) { this.state = 'idle'; return; }
    const t = this.vfx.clock - w.t0;
    const k = THREE.MathUtils.clamp(t / w.dash, 0, 1);
    // ease-in so the blink reads as an accelerating streak
    const e = k * k;
    this._tmp.lerpVectors(w.from, w.to, e);
    p.root.position.set(this._tmp.x, this._tmp.y - 1.1, this._tmp.z);
    p.velocity.set(0, 0, 0);
    if (this.weapon) this.weapon.setReveal(Math.max(0, (k - 0.55) / 0.45));

    if (!w.struck && t >= w.dash) {
      w.struck = true;
      if (w.enemy) {
        const dmg = this.weapon.def.damage * 2.9;
        this._applyDamage(w.enemy, dmg, w.from, { blindside: this._isBlindside(w.enemy), poise: 80 });
      }
      this.hitstop = 0.12;
      this.emit('warp', { phase: 'impact', from: w.from, to: w.to, enemy: w.enemy });
    }
    if (t > w.dash + 0.28) {
      this.state = 'idle';
      this.warp = null;
      if (this.weapon) this.weapon.setReveal(1);
      if (this.terrain) p.root.position.y = this.terrain.heightAt(p.root.position.x, p.root.position.z);
    }
  }

  /* --------------------------------------------------------- phase */

  _tickPhase(dt) {
    // a faint crystal shimmer around the player while phasing
    if (this.vfx && this.player && this.rng.next() < dt * 40) {
      const a = this.rng.next() * Math.PI * 2;
      const pos = this.player.position.clone();
      pos.x += Math.cos(a) * 0.45; pos.z += Math.sin(a) * 0.45;
      pos.y += this.rng.range(0.2, 1.7);
      this.vfx.motes.emit({
        pos, vel: { x: 0, y: 0.6, z: 0 }, color: new THREE.Color(0x5fb6ff),
        t0: this.vfx.clock, life: 0.5, size0: 0.16, size1: 0.02,
        drag: 1, gravity: 0.4, intensity: 3.5, fade: 1.4,
      });
    }
    this._restPose(dt);
  }
}

const EULER = new THREE.Euler();
const IDLE_Q = new THREE.Quaternion();
const REST_POS = new THREE.Vector3(0.30, 1.05, 0.02);

function ease(n) { const t = THREE.MathUtils.clamp(n, 0, 1); return t * t * (3 - 2 * t); }
/** Fast attack, slow settle — makes a swing feel like it has weight. */
function snap(n) { const t = THREE.MathUtils.clamp(n, 0, 1); return 1 - Math.pow(1 - t, 3.4); }

export { WEAPONS };

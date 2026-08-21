import * as THREE from 'three';

/**
 * Danger, Down, revive and game over.
 *
 * FFXV never simply kills you. Your HP bar empties, the maximum shrinks, and
 * you drop into **Danger** — crawling, red-vignetted, on a bleed-out timer,
 * while whichever of the three is nearest breaks off and comes to get you. A
 * Phoenix Down is the emergency exit. Only if the whole retinue is down does
 * the fight actually end, and then it ends with a retry.
 *
 * Events:
 *   `player:danger`   {hp, maxHp}         low, not yet down
 *   `player:downed`   {bleedOut}          the clock starts
 *   `player:reviving` {member, progress}  an ally is on you
 *   `player:revived`  {by, hp}
 *   `ally:downed` / `ally:revived`  {member}
 *   `encounter:gameover` {reason}
 *   `encounter:retry`
 */
export class Downed {
  async init(game) {
    this.game = game;
    this.player = game.get('Player');
    this.party = game.get('Party');
    this.combat = game.get('Combat');
    this.rpg = game.get('Rpg');
    this.enemies = game.get('Enemies');
    this.vfx = game.get('VFX');

    /** 'ok' | 'danger' | 'downed' | 'gameover' */
    this.state = 'ok';
    /** Seconds left before the party wipes. */
    this.bleedOut = 0;
    this.bleedOutMax = 30;
    /** Seconds of contact an ally needs to get you up. */
    this.reviveTime = 6;
    this.reviveProgress = 0;
    this.reviver = null;
    this.dangerAt = 0.3;

    /** Where to put the party back on a retry. */
    this.checkpoint = this.player ? this.player.position.clone() : new THREE.Vector3();
    this._checkTimer = 0;
    this._downPos = new THREE.Vector3();
    this._allyPotion = new Map();
    if (this.player) this.player.downed = false;
    return this;
  }

  /** Noctis' authoritative stat block. */
  get noctis() {
    if (this.rpg) return this.rpg.noctis;
    return this.player ? this.player.stats : null;
  }

  /** Companion stat block by party-member key. */
  memberStats(key) {
    if (!this.rpg) return null;
    return this.rpg.party.stats[key];
  }

  /* ------------------------------------------------------------- verbs */

  /** Drop Noctis. */
  goDown() {
    if (this.state === 'downed' || this.state === 'gameover') return;
    this.state = 'downed';
    this.bleedOut = this.bleedOutMax;
    this.reviveProgress = 0;
    this.reviver = null;
    this._downPos.copy(this.player.root.position);
    this.player.downed = true;
    // the grey bar: max HP is chipped away every time you go down
    const n = this.noctis;
    if (n && n.hpDrain != null) n.hpDrain = Math.min(n.get('hp') * 0.5, n.hpDrain + n.get('hp') * 0.12);
    if (this.combat) {
      this.combat.state = 'idle';
      this.combat.lockOn(null);
    }
    this.player.play?.('hit');
    if (this.vfx) {
      const p = this.player.position.clone(); p.y += 0.6;
      this.vfx.moteBurst({ pos: p, count: 20, speed: 1.6, color: 0xff4030, life: 1.4, size: 0.2, intensity: 3 });
    }
    window.dispatchEvent(new CustomEvent('player:downed', { detail: { bleedOut: this.bleedOut } }));
  }

  /**
   * Get Noctis back on his feet.
   * @param by member key, `'phoenix'`, or `'debug'`
   * @param fraction of max HP restored
   */
  revive(by: string = 'ally', fraction: number = 0.3) {
    if (this.state !== 'downed') return false;
    this.state = 'ok';
    this.player.downed = false;
    this.bleedOut = 0;
    this.reviveProgress = 0;
    this.reviver = null;
    const n = this.noctis;
    if (n) {
      if (n.heal) n.heal(n.maxHp * fraction);
      else { n.hp = Math.round(n.maxHp * fraction); }
      if (n.ko != null) n.ko = false;
    }
    if (this.player.stats && n) this.player.stats.hp = Math.round(n.hp);
    if (this.vfx) {
      const p = this.player.position.clone(); p.y += 1.0;
      this.vfx.flare({ pos: p, color: 0xffe0a0, size: 2.2, life: 0.5, intensity: 6 });
      this.vfx.moteBurst({ pos: p, count: 26, speed: 2.4, color: 0xffd090, life: 1.2, size: 0.22, intensity: 5 });
    }
    window.dispatchEvent(new CustomEvent('player:revived', { detail: { by, hp: n ? Math.round(n.hp) : 0 } }));
    return true;
  }

  /** The whole retinue is down. */
  gameOver(reason = 'party-wipe') {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    this.player.downed = true;
    if (this.enemies) this.enemies.frozen = true;
    if (this.game.input) this.game.input.enabled = false;
    if (this.game.time) this.game.time.scale = 0.15;
    window.dispatchEvent(new CustomEvent('encounter:gameover', { detail: { reason } }));
  }

  /**
   * Put the party back at the last checkpoint with full HP and a clear field.
   * This is the "Retry" on the game-over card.
   */
  retry() {
    if (this.state !== 'gameover') return false;
    const dir = this.game.get('Encounters');
    if (dir && dir.boss) dir.endBoss(false);
    if (this.enemies) { this.enemies.frozen = false; this.enemies.clear(); }
    if (dir) {
      dir.active.clear();
      dir.packs.length = 0;
      dir.state = 'field';
      dir._roamTimer = 40;
    }
    if (this.rpg) {
      this.rpg.party.restoreAll();
      this.rpg.inCombat = false;
    }
    if (this.player) {
      this.player.root.position.copy(this.checkpoint);
      const terrain = this.game.get('Terrain');
      if (terrain) this.player.root.position.y = terrain.heightAt(this.checkpoint.x, this.checkpoint.z);
      this.player.velocity.set(0, 0, 0);
      this.player.downed = false;
      if (this.player.stats && this.rpg) {
        this.player.stats.hp = this.rpg.noctis.maxHp;
        this.player.stats.mp = this.rpg.noctis.maxMp;
      }
    }
    if (this.party) for (const m of this.party.members) { m.downed = false; m.downTimer = 0; }
    if (this.game.input) this.game.input.enabled = true;
    if (this.game.time) this.game.time.scale = 1;
    this.state = 'ok';
    this.bleedOut = 0;
    this.game.state = 'field';
    window.dispatchEvent(new CustomEvent('encounter:retry', { detail: {} }));
    return true;
  }

  /* -------------------------------------------------------------- tick */

  update(dt, game) {
    const p = this.player;
    if (!p) return;
    const n = this.noctis;
    if (!n) return;

    if (this.state === 'gameover') {
      this._holdPlayer();
      if (game.input && (game.input.keyDown?.('Enter') || game.input.keyDown?.('KeyP'))) this.retry();
      return;
    }

    // keep the Player handle and the RPG stat block agreed, whoever wrote last
    if (p.stats && this.rpg) {
      if (p.stats.hp < n.hp) n.hp = p.stats.hp;
      p.stats.hp = Math.round(n.hp);
      p.stats.maxHp = n.maxHp;
    }

    /* -- Noctis ------------------------------------------------------- */
    if (this.state === 'downed') {
      this._tickDowned(dt);
    } else {
      const frac = n.maxHp > 0 ? n.hp / n.maxHp : 1;
      if (n.hp <= 0) {
        this.goDown();
      } else if (frac <= this.dangerAt) {
        if (this.state !== 'danger') {
          this.state = 'danger';
          window.dispatchEvent(new CustomEvent('player:danger', { detail: { hp: Math.round(n.hp), maxHp: n.maxHp } }));
        }
      } else if (this.state === 'danger') {
        this.state = 'ok';
        window.dispatchEvent(new CustomEvent('player:danger', { detail: { hp: Math.round(n.hp), maxHp: n.maxHp, clear: true } }));
      }
    }

    /* -- companions --------------------------------------------------- */
    this._tickAllies(dt);

    /* -- checkpoint --------------------------------------------------- */
    this._checkTimer -= dt;
    if (this._checkTimer <= 0) {
      this._checkTimer = 2;
      const dir = this.game.get('Encounters');
      const safe = (!dir || dir.state === 'field') && this.state === 'ok';
      if (safe) this.checkpoint.copy(p.root.position);
    }
  }

  _holdPlayer() {
    const p = this.player;
    if (!p) return;
    p.root.position.copy(this._downPos);
    p.velocity.set(0, 0, 0);
    p.speed = 0;
  }

  _tickDowned(dt) {
    this._holdPlayer();
    this.bleedOut -= dt;

    // find whoever is coming for us
    const allies = this._liveAllies();
    if (!allies.length) {
      this.gameOver('party-wipe');
      return;
    }
    if (!this.reviver || this.reviver.downed) {
      this.reviver = this._nearest(allies, this._downPos);
      this.reviveProgress = 0;
    }
    const r = this.reviver;
    if (r) {
      r.reviveTarget = this.player;
      const d = r.root.position.distanceTo(this._downPos);
      if (d < 2.6) {
        const speed = 1 + (this.rpg?.party?.bondBonus?.('reviveSpeed') || 0);
        this.reviveProgress += dt * speed;
        window.dispatchEvent(new CustomEvent('player:reviving', {
          detail: { member: r.key, progress: Math.min(1, this.reviveProgress / this.reviveTime) },
        }));
        if (this.reviveProgress >= this.reviveTime) {
          r.reviveTarget = null;
          this.revive(r.key, 0.3);
          return;
        }
      } else {
        this.reviveProgress = Math.max(0, this.reviveProgress - dt * 0.5);
      }
    }

    // last resort: an ally burns a Phoenix Down
    if (this.bleedOut < 7 && this.rpg && this.rpg.inventory.count('phoenix_down') > 0) {
      this.rpg.inventory.remove?.('phoenix_down', 1);
      if (r) r.reviveTarget = null;
      this.revive('phoenix', 0.5);
      window.dispatchEvent(new CustomEvent('encounter:item-used', { detail: { id: 'phoenix_down', on: 'noctis' } }));
      return;
    }

    if (this.bleedOut <= 0) this.gameOver('bleed-out');
  }

  _tickAllies(dt) {
    if (!this.party || !this.rpg) return;
    for (const m of this.party.members) {
      const s = this.memberStats(m.key);
      if (!s) continue;
      if (!m.downed && s.hp <= 0) {
        m.downed = true;
        m.downTimer = 22;
        m.reviveTarget = null;
        s.ko = true;
        m.character?.play?.('hit');
        window.dispatchEvent(new CustomEvent('ally:downed', { detail: { member: m.key } }));
      } else if (m.downed) {
        m.downTimer -= dt;
        // Noctis picks them up by standing over them, or they come round alone
        const close = this.player && this.player.root.position.distanceTo(m.root.position) < 3 && this.state === 'ok';
        if (close) m.downTimer -= dt * 3;
        if (m.downTimer <= 0) {
          m.downed = false;
          s.ko = false;
          s.heal(s.maxHp * 0.35);
          window.dispatchEvent(new CustomEvent('ally:revived', { detail: { member: m.key } }));
        }
      } else {
        // allies drink their own potions when they get low, once in a while
        const cd = this._allyPotion.get(m.key) || 0;
        if (cd > 0) this._allyPotion.set(m.key, cd - dt);
        else if (s.hp / s.maxHp < 0.28 && this.rpg.inventory.count('potion') > 0) {
          this.rpg.inventory.remove?.('potion', 1);
          s.heal(s.maxHp * 0.35);
          this._allyPotion.set(m.key, 22);
          window.dispatchEvent(new CustomEvent('encounter:item-used', { detail: { id: 'potion', on: m.key } }));
        }
      }
    }
  }

  _liveAllies() {
    if (!this.party) return [];
    return this.party.members.filter((m) => !m.downed);
  }

  _nearest(list, p) {
    let best = null, bd = Infinity;
    for (const m of list) {
      const d = m.root.position.distanceTo(p);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
}

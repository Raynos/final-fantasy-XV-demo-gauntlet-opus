import * as THREE from 'three';
import { Rng } from '../../util/Rng.ts';
import { Pack } from './Pack.ts';
import { TERRITORIES, ROAMERS, SET_PIECES, HUNT_TARGETS, windowOpen } from './SpawnTables.ts';
import { BossFight } from './BossFight.ts';
import { Dropship } from './Dropship.ts';

/**
 * The live encounter loop.
 *
 * Territories stream in as the player approaches and stream out behind him;
 * packs patrol, sleep and wake with the clock; a pack that notices the party
 * pulls the world into a **combat state** with a start, a fight and a
 * resolution. Victory pays out through the RPG layer's banking model — EXP,
 * AP, gil and rolled drops — and the world goes back to being a field.
 *
 * Everything it wants other systems to know about is a `window` event:
 *
 *   `encounter:start`   {name, level, boss, enemies}
 *   `encounter:end`     {victory, name}
 *   `encounter:victory` {exp, ap, gil, drops, kills}
 *   `encounter:kill`    {name, exp, drops}
 *   `encounter:boss-phase` {boss, phase, name}
 *   `encounter:warn`    {text}  — the "something is coming" beat
 */
export class EncounterDirector {
  active!: Map<any, any>;
  _clearTimer!: number;
  _hits!: any[];
  _offDamage!: any;
  _offDeath!: any;
  _roamTimer!: number;
  _streamTimer!: number;
  _tmp!: THREE.Vector3;
  _tmp2!: THREE.Vector3;
  boss!: BossFight | null;
  budget!: number;
  combat!: any;
  cooldowns!: Map<any, any>;
  dropship!: Dropship;
  enabled!: boolean;
  encounter!: any;
  enemies!: any;
  game!: any;
  hunts!: any;
  night!: number;
  packs!: any[];
  party!: any;
  player!: any;
  rng!: Rng;
  rpg!: any;
  sky!: any;
  state!: string;
  stats!: any;
  suppressRoamers!: boolean;
  terrain!: any;
  threats!: any[];
  vfx!: any;
  async init(game: any) {
    this.game = game;
    this.rng = new Rng(20259);
    this.enemies = game.get('Enemies');
    this.combat = game.get('Combat');
    this.player = game.get('Player');
    this.party = game.get('Party');
    this.terrain = game.get('Terrain');
    this.vfx = game.get('VFX');
    this.rpg = game.get('Rpg');
    this.sky = game.get('Sky');

    /** 'field' | 'combat' — the state the HUD and the music hang off. */
    this.state = 'field';
    /** Set false to leave the world empty (the screenshot scenarios do this). */
    this.enabled = true;
    /** Set true to stop rolling new roaming encounters. */
    this.suppressRoamers = false;
    /** Hard cap on simultaneously simulated creatures — one draw call each. */
    this.budget = 28;

    this.active = new Map();          // territory id -> {def, pack, enemies[]}
    this.cooldowns = new Map();       // territory id -> seconds until respawn
    this.packs = [];
    this.boss = null;                 // active BossFight
    this.dropship = new Dropship();
    this.dropship.init(game);

    this.threats = [];
    this.night = 0;
    this.stats = { kills: 0, exp: 0, gil: 0, drops: [] };
    this.encounter = null;            // {name, level, packs:[], boss, startedAt}

    this._streamTimer = 0;
    this._roamTimer = 26;
    this._clearTimer = 0;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._hits = [];

    this.enemies.onStrike = (e: any, atk: any) => this.resolveStrike(e, atk);
    this.enemies.threats = this.threats;

    this._offDeath = this.combat ? this.combat.on('death', (d: any) => this.onDeath(d.enemy, 'player')) : null;
    this._offDamage = this.combat ? this.combat.on('damage', (d: any) => this.onPlayerDamage(d)) : null;
    return this;
  }

  /* ------------------------------------------------------------ helpers */

  /** Ground the point `x,z` and return a scratch vector. */
  ground(x: number, z: number, out = this._tmp) {
    out.set(x, this.terrain ? this.terrain.heightAt(x, z) : 0, z);
    return out;
  }

  /** Daemon pressure right now, with a safe fallback when the RPG is absent. */
  pressure() {
    if (this.rpg && this.rpg.daemonPressure) return this.rpg.daemonPressure();
    const h = this.sky && this.sky.timeOfDay != null ? this.sky.timeOfDay : 12;
    const night = h >= 19 || h < 5;
    return { spawn: night, density: night ? 0.7 : 0, depth: night ? 0.7 : 0, levelBonus: night ? 10 : 0, level: 20, attack: 1, defense: 1, hp: 1 };
  }

  /** Rebuild the list of things enemies may perceive and attack. */
  _refreshThreats() {
    const t = this.threats;
    t.length = 0;
    if (this.player && !this.player.downed) {
      this.player.threatWeight = 1;
      t.push(this.player);
    }
    if (this.party && this.party.members) {
      for (const m of this.party.members) {
        if (m.downed) continue;
        // Gladio's Coverage is the only thing that legitimately takes the
        // fight off Noctis; otherwise companions are secondary targets.
        m.threatWeight = m.taunting > 0 ? 2.4 : 0.45;
        t.push(m);
      }
    }
  }

  /* ------------------------------------------------------------ spawning */

  /**
   * Bring a territory to life.
   * @param def a `TERRITORIES` entry
   */
  activate(def: any) {
    if (this.active.has(def.id)) return this.active.get(def.id);
    const pack = new Pack({ id: def.id, maxEngaged: def.maxEngaged, encounter: this });
    const scaling = this.rpg ? this.rpg.enemyScaling(def.faction === 'daemon') : NEUTRAL;
    const level = Math.max(1, Math.round(def.level + (def.faction === 'daemon' ? scaling.levelBonus : scaling.levelBonus * 0.4)));
    const list = [];
    const patrol = def.patrolRadius > 0 ? this._patrolRoute(def) : null;

    for (const s of def.spawn) {
      const n = this._count(s.count);
      for (let i = 0; i < n; i++) {
        const a = this.rng.next() * Math.PI * 2;
        const r = Math.sqrt(this.rng.next()) * def.radius * 0.7;
        const p = this.ground(def.at[0] + Math.cos(a) * r, def.at[1] + Math.sin(a) * r, this._tmp2);
        const type = this.enemies.def(s.key);
        const e = this.enemies.spawn(s.key, {
          pos: p, heading: this.rng.next() * Math.PI * 2,
          level: s.level || level,
          hp: type ? Math.round(type.stats.hp * (def.faction === 'daemon' ? scaling.hp : 1)) : undefined,
          damage: type ? Math.round(type.stats.damage * scaling.attack) : undefined,
          pack, leash: def.radius + 34,
          patrol: patrol ? this._offsetRoute(patrol, i) : null,
          asleep: this._shouldSleep(def),
          owner: def.id,
        });
        e.home.copy(this.ground(def.at[0], def.at[1], this._tmp2));
        e.territory = def.id;
        list.push(e);
      }
    }
    const rec = { def, pack, enemies: list };
    this.active.set(def.id, rec);
    this.packs.push(pack);
    return rec;
  }

  /** A closed patrol loop around the territory anchor. */
  _patrolRoute(def: any) {
    const pts = [];
    const n = 3 + (this.rng.next() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rng.next() * 0.6;
      const r = def.patrolRadius * (0.6 + this.rng.next() * 0.4);
      pts.push(this.ground(def.at[0] + Math.cos(a) * r, def.at[1] + Math.sin(a) * r).clone());
    }
    return pts;
  }

  /** Give each member a rotated copy of the route so they string out. */
  _offsetRoute(route: THREE.Vector3[], i: number) {
    if (i === 0) return route;
    const out = route.slice();
    for (let k = 0; k < i % route.length; k++) { const head = out.shift(); if (head) out.push(head); }
    return out;
  }

  _shouldSleep(def: any) {
    const p = this.pressure();
    if (def.faction === 'daemon') return !p.spawn;
    return p.spawn && def.when === 'day';
  }

  _count(c: number) {
    if (!Array.isArray(c)) return c | 0;
    return c[0] + Math.floor(this.rng.next() * (c[1] - c[0] + 1));
  }

  /** Retire a territory and pool its enemies. */
  deactivate(id: any) {
    const rec = this.active.get(id);
    if (!rec) return;
    // only retire what this territory still owns — a pooled instance may have
    // already been recycled into somebody else's pack
    for (const e of rec.enemies) {
      if (e.spawnedBy === id && this.enemies.list.includes(e)) this.enemies.despawn(e);
    }
    const i = this.packs.indexOf(rec.pack);
    if (i >= 0) this.packs.splice(i, 1);
    this.active.delete(id);
    this.cooldowns.set(id, rec.def.respawn * 0.25);
  }

  /* ------------------------------------------------------------ roamers */

  /** Roll a wandering encounter near the player. */
  rollRoamer() {
    if (!this.player || this.state === 'combat' || this.boss) return null;
    const p = this.pressure();
    const pool = ROAMERS.filter((r) => windowOpen(r.when, p) && (!r.nightDepth || p.depth >= r.nightDepth));
    if (!pool.length) return null;
    let total = 0;
    for (const r of pool) total += r.weight;
    let x = this.rng.next() * total;
    let pick = pool[0];
    for (const r of pool) { x -= r.weight; if (x <= 0) { pick = r; break; } }
    return this.spawnRoamer(pick);
  }

  /**
   * Spawn a roaming encounter around the player.
   * @param def a `ROAMERS` entry
   */
  spawnRoamer(def: any) {
    const pp = this.player.position;
    let total = 0;
    for (const s of def.spawn) total += Array.isArray(s.count) ? s.count[1] : s.count;
    // two or three attackers at a time; the rest circle. Any more than that
    // and the player is being mobbed, not fought.
    const pack = new Pack({
      id: `${def.id}-${this.rng.next() | 0}`, encounter: this,
      maxEngaged: total >= 5 ? 3 : 2,
    });
    const scaling = this.rpg ? this.rpg.enemyScaling(def.faction === 'daemon') : NEUTRAL;
    const level = Math.max(1, Math.round(def.level + scaling.levelBonus * (def.faction === 'daemon' ? 1 : 0.4)));
    const bearing = this.rng.next() * Math.PI * 2;
    const dist = def.dropship ? 26 : 30 + this.rng.next() * 12;
    const cx = pp.x + Math.sin(bearing) * dist;
    const cz = pp.z + Math.cos(bearing) * dist;
    const list = [];
    for (const s of def.spawn) {
      const n = this._count(s.count);
      for (let i = 0; i < n; i++) {
        const a = (i / Math.max(1, n)) * Math.PI * 2;
        const p = this.ground(cx + Math.cos(a) * 4.5, cz + Math.sin(a) * 4.5, this._tmp2);
        const type = this.enemies.def(s.key);
        const e = this.enemies.spawn(s.key, {
          pos: p, level: s.level || level, pack, leash: 90,
          heading: Math.atan2(pp.x - p.x, pp.z - p.z),
          hp: type ? Math.round(type.stats.hp * (def.faction === 'daemon' ? scaling.hp : 1)) : undefined,
          damage: type ? Math.round(type.stats.damage * scaling.attack) : undefined,
          owner: def.id,
        });
        e.roamer = true;
        list.push(e);
      }
    }
    this.packs.push(pack);
    if (def.dropship) this.dropship.arrive(this.ground(cx, cz).clone(), list);
    else {
      // they have already seen you — that is what makes an ambush an ambush
      for (const e of list) { e.target = this.player; e.awareness = 1; e.setState('chase'); }
      pack.alerted = true;
    }
    this._warn(def.faction === 'daemon' ? 'Daemons.' : def.faction === 'imperial' ? 'Imperials incoming.' : 'Something has our scent.');
    return { def, pack, enemies: list };
  }

  /* ------------------------------------------------------------ set pieces */

  /**
   * Start a named set-piece boss fight.
   * @param id one of `SET_PIECES`
   * @param [opts] `{ at:[x,z] }`
   */
  startSetPiece(id: string, opts: any = {}) {
    const def = SET_PIECES[id as keyof typeof SET_PIECES];
    if (!def) throw new Error(`unknown set piece ${id}`);
    if (this.boss) this.endBoss(false);
    const at = opts.at || def.at;
    const fight = new BossFight(def, this);
    this.boss = fight;
    fight.begin(this.ground(at[0], at[1]).clone());
    return fight;
  }

  /** Tear down the active boss fight. */
  endBoss(victory: boolean) {
    const b = this.boss;
    if (!b) return;
    this.boss = null;
    b.end(victory);
  }

  /* ------------------------------------------------------------ hunts */

  /**
   * Spawn a hunt's mark at its objective waypoint. Called when a hunt is
   * accepted, so accepting a job actually puts something in the world.
   */
  spawnHunt(questId: string) {
    const t = HUNT_TARGETS[questId as keyof typeof HUNT_TARGETS];
    if (!t) return null;
    const quest = this.rpg?.quests?.def(questId);
    const obj = quest?.objectives?.find((o: any) => o.type === 'kill') || quest?.objectives?.[0];
    const wp = obj?.waypoint || [0, 0, 0];
    const pack = new Pack({ id: `hunt-${questId}`, encounter: this, maxEngaged: 3 });
    const n = Math.min(t.count, t.maxAlive || t.count);
    const list = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = t.count > 2 ? 10 : 4;
      const p = this.ground(wp[0] + Math.cos(a) * r, wp[2] + Math.sin(a) * r, this._tmp2);
      const e = this.enemies.spawn(t.key, {
        pos: p, level: t.level, pack, leash: 70, scale: t.scale,
        name: t.name, expClass: t.boss ? 'boss' : undefined,
        owner: `hunt:${questId}`,
      });
      e.hunt = questId;
      if (t.boss) { e.boss = true; e.maxHp = Math.round(e.maxHp * 3.2); e.hp = e.maxHp; }
      list.push(e);
    }
    this.packs.push(pack);
    this.hunts = this.hunts || new Map();
    this.hunts.set(questId, { def: t, pack, spawned: n, remaining: t.count - n, waypoint: wp });
    window.dispatchEvent(new CustomEvent('encounter:hunt-spawned', {
      detail: { quest: questId, target: t.key, count: t.count, waypoint: wp },
    }));
    return list;
  }

  /** Top a hunt up if it wants more marks than fit on the field at once. */
  _topUpHunt(questId: any) {
    const h = this.hunts && this.hunts.get(questId);
    if (!h || h.remaining <= 0) return;
    const alive = h.pack.alive;
    const want = Math.min(h.remaining, (h.def.maxAlive || h.def.count) - alive);
    for (let i = 0; i < want; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const p = this.ground(h.waypoint[0] + Math.cos(a) * 14, h.waypoint[2] + Math.sin(a) * 14, this._tmp2);
      const e = this.enemies.spawn(h.def.key, {
        pos: p, level: h.def.level, pack: h.pack, leash: 70, owner: `hunt:${questId}`,
      });
      e.hunt = questId;
      h.remaining--;
    }
  }

  /* ------------------------------------------------------------ strikes */

  /**
   * An enemy's attack reached its active frame. Work out who it caught.
   * @param e the attacker
   * @param atk the attack definition (may be null for legacy species)
   */
  resolveStrike(e: any, atk: any) {
    const a = atk || { hitRadius: 1.8, mult: 1, arc: Math.PI / 2 };
    const reach = (a.hitRadius || 1.8) * e.scale;
    const arc = a.arc != null ? a.arc : Math.PI / 2;
    const fx = Math.sin(e.heading), fz = Math.cos(e.heading);
    const origin = e.root.position;

    if (a.ranged) this._tracer(e, a);

    for (const t of this.threats) {
      const tp = t.position || t.root?.position;
      if (!tp) continue;
      const dx = tp.x - origin.x, dz = tp.z - origin.z;
      const d = Math.hypot(dx, dz);
      // a lunge closes ground as it swings, so it connects over its whole run
      const range = a.ranged
        ? (a.range || 20)
        : reach + (a.lunge ? a.lunge * 0.45 + 1.2 : 0.9);
      if (d > range) continue;
      if (!a.aoe && d > 1e-3) {
        const dot = (dx / d) * fx + (dz / d) * fz;
        if (dot < Math.cos(arc)) continue;
      }
      if (a.ranged && this.rng.next() > 0.72) continue;    // ranged fire misses often
      this.damageThreat(t, e, a);
    }
    if (a.aoe && this.vfx) {
      const c = e.centre();
      this.vfx.dustPuff({
        pos: this.ground(origin.x, origin.z).clone(), count: 18, radius: reach * 0.6,
        speed: 4.2, life: 1.4, size: 0.7, grow: 3.0, up: 0.8, intensity: 0.5,
      });
      if (a.element === 'fire') this.vfx.flash({ pos: c, color: 0xff7a30, intensity: 40, distance: reach * 2, life: 0.4 });
    }
  }

  /** A visible line for ranged shots so the player can read where it came from. */
  _tracer(e: any, a: any) {
    if (!this.vfx) return;
    const from = e.centre();
    from.y += e.height * 0.15 * e.scale;
    const t = this.threats[0];
    const tp = t ? (t.position || t.root?.position) : null;
    if (!tp) return;
    this._tmp.set(tp.x, tp.y + 1.1, tp.z);
    const b = this.vfx.acquireBeam();
    const hot = a.element === 'dark' ? 0xb070ff : a.element === 'lightning' ? 0xbfe0ff : 0xffd0a0;
    b.uniforms.uHead.value.set(hot);
    b.uniforms.uTail.value.set(a.element === 'dark' ? 0x5a20a0 : 0xff7040);
    b.uniforms.uIntensity.value = 3.0;
    b.width = 0.05;
    b.setLine(from, this._tmp);
    this.vfx.track(this.vfx.clock, 0.11, (k: number) => { b.strength = k < 0 || k > 1 ? 0 : (1 - k); });
    this.vfx.flash({ pos: from, color: hot, intensity: 16, distance: 5, life: 0.08 });
  }

  /**
   * Apply one enemy hit to the player or to a companion.
   * @param t a threat (the Player, or a Party member)
   * @param e the attacker
   * @param a the attack
   */
  damageThreat(t: any, e: any, a: any) {
    const isPlayer = t === this.player;
    if (isPlayer && this._playerAvoids(e, a)) return;

    const raw = e.damage * (a.mult || 1);
    let dmg = Math.round(raw);
    const rpg = this.rpg;
    if (rpg) {
      const memberId = isPlayer ? 'noctis' : MEMBER_BY_KEY[t.key as keyof typeof MEMBER_BY_KEY] || 'gladio';
      const target = rpg.party.stats[memberId];
      const res = rpg.damage({
        attacker: { attack: e.damage * 0.9, level: e.level, critRate: 0.06, critDamage: 1.5 },
        target, motion: a.mult || 1, element: a.element || 'physical',
        targetIsDaemon: false,
      });
      dmg = Math.max(1, Math.round(res.damage * 0.55));
      target.applyDamage(dmg);
      if (isPlayer && this.player.stats) this.player.stats.hp = Math.round(target.hp);
    } else if (isPlayer && this.player.stats) {
      this.player.stats.hp = Math.max(0, this.player.stats.hp - dmg);
    }

    const at = (t.position || t.root.position).clone();
    at.y += 1.1;
    if (this.vfx) {
      this.vfx.impact({
        pos: at, dir: this._tmp.subVectors(at, e.centre()).normalize(),
        scale: isPlayer ? 1.1 : 0.9, color: 0xff5a3a, blood: true, terrain: null,
      });
    }
    if (isPlayer) {
      if (this.combat) this.combat.hitstop = Math.max(this.combat.hitstop, 0.05);
      this._emitCombat('playerHit', { enemy: e, damage: dmg, hp: this.player.stats?.hp ?? 0, position: at });
    } else {
      t.character?.hitReact?.(0.8);
      window.dispatchEvent(new CustomEvent('encounter:allyHit', { detail: { member: t.key, damage: dmg, position: at } }));
    }
  }

  /** Dodge i-frames, warp invulnerability and the phase parry. */
  _playerAvoids(e: any, a: any) {
    const c = this.combat;
    if (!c) return false;
    if (c.state === 'warp') return true;
    if (c.state === 'dodge' && c.stateTime < 0.32) return true;
    if (c.state === 'phase' && c.phaseCharge > 0.05 && !a.unblockable) {
      if (c._perfectParry) c._perfectParry(e);
      else this._emitCombat('parry', { enemy: e, position: e.centre() });
      return true;
    }
    return false;
  }

  _emitCombat(name: string, detail: any) {
    if (this.combat && this.combat.emit) this.combat.emit(name, detail);
    else window.dispatchEvent(new CustomEvent(`combat:${name}`, { detail }));
  }

  /* ------------------------------------------------------------ pack hooks */

  /**
   * A pack has just noticed the party. This is the "you have been seen" beat.
   * @param pack @param target
   */
  onAlerted(pack: any, target: any) {
    if (this.state === 'combat') return;
    const first = pack.members.find((m: any) => !m.dead);
    window.dispatchEvent(new CustomEvent('encounter:spotted', {
      detail: { pack: pack.id, name: first ? first.name : '', count: pack.alive },
    }));
  }

  /**
   * A pack member died. If that was the last of them, the fight is over as
   * far as this pack is concerned.
   */
  onMemberDied(pack: any, e: any) {
    if (pack.alive > 0) return;
    pack.alerted = false;
    window.dispatchEvent(new CustomEvent('encounter:pack-cleared', {
      detail: { pack: pack.id },
    }));
  }

  /* ------------------------------------------------------------ death & loot */

  /**
   * Something died. Bank the EXP, roll the drops, tick the quest log.
   * @param by 'player' | 'ally'
   */
  onDeath(e: any, by: string = 'player') {
    if (!e || e._looted) return;
    e._looted = true;
    this.stats.kills++;

    let exp = 0, drops = [];
    const rpg = this.rpg;
    if (rpg) {
      const byWarpStrike = !!(this.combat && this.combat.state === 'warp');
      const res = rpg.enemyKilled(
        { id: e.speciesId, level: e.level, expClass: e.expClass, drops: [] },
        { byWarpStrike, byTechnique: by === 'tech' }
      );
      exp = res.exp;
      // roll our own drops so they stay on the encounter's seeded RNG
      const rate = 1 + (rpg.ascension?.value?.('dropRate') || 0);
      for (const d of e.type.drops || []) {
        if (this.rng.next() < Math.min(1, (d.chance ?? 0.3) * rate)) {
          const got = rpg.giveItem(d.id, d.count || 1, 'drop');
          if (got > 0) drops.push(d.id);
        }
      }
      const gil = Math.round(8 + e.level * (e.expClass === 'boss' ? 60 : e.expClass === 'elite' ? 14 : 4));
      rpg.inventory.addGil(gil, 'drop');
      this.stats.gil += gil;
    }
    this.stats.exp += exp;
    for (const d of drops) this.stats.drops.push(d);

    if (e.hunt) this._topUpHunt(e.hunt);
    if (this.boss && this.boss.owns(e)) this.boss.onBossDeath(e);

    if (this.vfx) {
      const c = e.centre();
      this.vfx.moteBurst({
        pos: c, count: e.boss ? 60 : 22, speed: e.boss ? 6 : 3.2,
        color: e.faction === 'daemon' ? 0x9a6cff : 0x8fc8ff,
        life: 1.6, size: 0.3, gravity: 1.0, intensity: 3,
      });
      if (e.faction === 'daemon') {
        this.vfx.smokePlume({ pos: c, count: 18, speed: 1.8, life: 2.6, color: 0x120e18, size: 0.8, rise: 2.0 });
      }
    }
    window.dispatchEvent(new CustomEvent('encounter:kill', {
      detail: { name: e.name, level: e.level, exp, drops, boss: !!e.boss },
    }));
  }

  /** Warp-strike / technique / spell kills that come through the damage event. */
  onPlayerDamage(d: any) {
    if (d && d.killed && d.enemy) this.onDeath(d.enemy, 'player');
  }

  /* ------------------------------------------------------------ state */

  /** True while anything hostile is actively fighting the party. */
  _anyEngaged() {
    const list = this.enemies.list;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.dead && e.fighting && e.target) return true;
    }
    return false;
  }

  _enterCombat() {
    if (this.state === 'combat') return;
    this.state = 'combat';
    this.game.state = 'combat';
    const live = [];
    let level = 1;
    for (const e of this.enemies.list) {
      if (e.dead || !e.inCombat) continue;
      live.push(e.name);
      level = Math.max(level, e.level);
    }
    this.encounter = {
      name: this.boss ? this.boss.def.name : (live[0] || 'Encounter'),
      level, boss: !!this.boss, startedAt: this.game.time.now,
    };
    this.stats = { kills: 0, exp: 0, gil: 0, drops: [] };
    window.dispatchEvent(new CustomEvent('encounter:start', {
      detail: { ...this.encounter, enemies: live },
    }));
  }

  _exitCombat(victory: boolean) {
    if (this.state !== 'combat') return;
    this.state = 'field';
    this.game.state = 'field';
    const name = this.encounter ? this.encounter.name : '';
    if (victory) {
      window.dispatchEvent(new CustomEvent('encounter:victory', {
        detail: { ...this.stats, name },
      }));
    }
    window.dispatchEvent(new CustomEvent('encounter:end', { detail: { victory, name } }));
    this.encounter = null;
  }

  _warn(text: string) {
    window.dispatchEvent(new CustomEvent('encounter:warn', { detail: { text } }));
  }

  /* ------------------------------------------------------------ tick */

  update(dt: number, game: any) {
    if (!this.enabled || this.enemies.frozen) return;
    const p = this.player;
    if (!p) return;

    const pressure = this.pressure();
    this.night = pressure.depth;
    this.enemies.night = this.night;
    this._refreshThreats();

    /* streaming ------------------------------------------------------- */
    this._streamTimer -= dt;
    if (this._streamTimer <= 0) {
      this._streamTimer = 0.5;
      this._stream(pressure, p.position);
    }
    for (const [id, t] of this.cooldowns) {
      const v = t - dt;
      if (v <= 0) this.cooldowns.delete(id); else this.cooldowns.set(id, v);
    }

    /* day/night sleep toggles ----------------------------------------- */
    for (const rec of this.active.values()) {
      if (rec.def.faction !== 'daemon') continue;
      if (!pressure.spawn) {
        for (const e of rec.enemies) if (!e.dead && !e.inCombat && e.state !== 'sleep') e.setState('sleep');
      }
    }

    /* roamers --------------------------------------------------------- */
    if (!this.suppressRoamers) {
      this._roamTimer -= dt;
      if (this._roamTimer <= 0) {
        this._roamTimer = (pressure.spawn ? 42 : 78) + this.rng.next() * 40;
        if (this.state === 'field' && this.enemies.countNear(p.position, 60) === 0) this.rollRoamer();
      }
    }

    /* boss ------------------------------------------------------------ */
    if (this.boss) this.boss.update(dt);
    this.dropship.update(dt);

    /* combat state ---------------------------------------------------- */
    const engaged = this._anyEngaged();
    if (engaged) {
      this._clearTimer = 0;
      this._enterCombat();
    } else if (this.state === 'combat') {
      this._clearTimer += dt;
      if (this._clearTimer > 4) {
        this._clearTimer = 0;
        this._exitCombat(true);
      }
    }
    if (this.rpg) this.rpg.inCombat = this.state === 'combat';
    this._publishMode();
  }

  /**
   * Tell the HUD what kind of moment this is.
   *
   * `HUD._resolveMode()` reads `Director.scenario || Director.mode ||
   * Director.state`, and `Director.play()` stamps the literal string `'live'`
   * into `scenario`. `'live'` is not a mode the HUD knows, so it was never
   * equal to `'combat'` — which is what gates the entire combat layer. In a
   * real fight the enemy nameplates, the lock-on reticle, the Armiger gauge
   * and the technique rack were all sitting at zero opacity behind
   * `display:none`.
   *
   * The live loop is the thing that actually knows whether a fight is on, so
   * it publishes that under `mode` and clears the placeholder scenario. This
   * is safe for the capture harness: `Director.setScenario` early-outs only on
   * an *equal* name, and it is always the one to call `setLive(false)`.
   */
  _publishMode() {
    const d = this.game.get('Director');
    if (!d) return;
    if (d.scenario === 'live') d.scenario = null;
    if (d.scenario == null) d.mode = this.state;
  }

  /** Activate what is near, retire what is not. */
  _stream(pressure: any, pp: any) {
    // timed marks (Ignis' Analyse, Gladio's Coverage) tick on the slow clock
    for (const e of this.enemies.list) if (e.analysed > 0) e.analysed -= 0.5;
    if (this.party) for (const m of this.party.members) if (m.taunting > 0) m.taunting -= 0.5;

    for (const def of TERRITORIES) {
      const dx = def.at[0] - pp.x, dz = def.at[1] - pp.z;
      const d = Math.hypot(dx, dz);
      const open = windowOpen(def.when, pressure) && (!def.nightDepth || pressure.depth >= def.nightDepth);
      const has = this.active.has(def.id);
      if (!has) {
        // budget: ~28 live creatures is a full, dangerous world and about 28
        // draw calls, which is what the frame can actually afford
        if (d < 130 && open && !this.cooldowns.has(def.id) && this.enemies.list.length < this.budget) {
          this.activate(def);
        }
      } else {
        const rec = this.active.get(def.id);
        const fighting = rec.pack.alerted && rec.pack.alive > 0;
        if ((d > 180 && !fighting) || (!open && !fighting)) this.deactivate(def.id);
        else if (rec.pack.alive === 0) {
          this.deactivate(def.id);
          this.cooldowns.set(def.id, def.respawn);
        }
      }
    }
  }
}

const NEUTRAL = { levelBonus: 0, attack: 1, defense: 1, hp: 1, depth: 0, isNight: false };
const MEMBER_BY_KEY = { gladio: 'gladio', ignis: 'ignis', prompto: 'prompto' };

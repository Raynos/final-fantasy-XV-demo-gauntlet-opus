import * as THREE from 'three';
import { Rng } from '../../util/Rng.ts';
import { Pack } from './Pack.ts';
import { TERRITORIES, ROAMERS, SET_PIECES, HUNT_TARGETS, windowOpen } from './SpawnTables.ts';
import { wildTerritoriesNear, WILD_CELL } from './WildTerritories.ts';
import { BossFight } from './BossFight.ts';
import { Dropship } from './Dropship.ts';
import type { Game } from '../Game.ts';
import type { HuntTarget, Pressure, Roamer, Territory } from './SpawnTables.ts';
import { threatPos } from '../../characters/enemies/EnemyBase.ts';
import type { Enemy, EnemyAttack, Threat } from '../../characters/enemies/EnemyBase.ts';
import type { Enemies } from '../../characters/Enemies.ts';
import type { Player } from '../../characters/Player.ts';
import type { Party, PartyMember, CompanionKey } from '../../characters/Party.ts';
import type { CombatSystem } from '../../combat/CombatSystem.ts';
import type { CombatEvents, CombatEventName } from '../../combat/CombatEvents.ts';
import type { VFX } from '../../combat/VFX.ts';
import type { Terrain } from '../../world/Terrain.ts';
import type { Ecology } from '../../world/veg/Ecology.ts';
import type { Sky } from '../../world/Sky.ts';
import type { Encounter as DungeonEncounter } from '../../world/dungeons/kit/Layout.ts';
import type { SetPiece } from './SpawnTables.ts';
import type { RpgSystem } from '../rpg/RpgSystem.ts';

/**
 * A threat this director steers: Noctis, or one of the three following him.
 * Narrower than `Threat` on purpose -- the damage path needs the companion
 * key, which the enemy AI's view of a threat has no business knowing.
 */
export type EncounterThreat = Player | PartyMember;

/**
 * What the strike resolver reads off an attack.
 *
 * Species that predate the attack table strike with `null`, and the resolver
 * substitutes a default swing for them -- so every field but the two the
 * default supplies is optional here, and every branch below has to say what it
 * does without one.
 */
export type StrikeSpec = Partial<EnemyAttack> & { hitRadius: number, mult: number };

/** A territory that is currently streamed in. */
export interface ActiveTerritory {
  def: Territory;
  pack: Pack;
  enemies: Enemy[];
}

/** A hunt with marks on the field. */
export interface HuntRecord {
  def: HuntTarget;
  pack: Pack;
  /** How many are out right now. */
  spawned: number;
  /** How many the quest still wants after those. */
  remaining: number;
  /** `[x, y, z]` of the objective the marks were placed on. */
  waypoint: number[];
}

/** The fight in progress, as the HUD and the music read it. */
export interface EncounterInfo {
  name: string;
  level: number;
  boss: boolean;
  /** `game.time.now` when it started. */
  startedAt: number;
}

/** What the fight has paid out so far. */
export interface EncounterStats {
  kills: number;
  exp: number;
  gil: number;
  /** Item ids rolled off the corpses. */
  drops: string[];
}

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
  /** Territory id -> what is streamed in for it. */
  active!: Map<string, ActiveTerritory>;
  _clearTimer!: number;
  _offDamage!: (() => void) | null;
  _offDeath!: (() => void) | null;
  _roamTimer!: number;
  _streamTimer!: number;
  _tmp!: THREE.Vector3;
  _tmp2!: THREE.Vector3;
  boss!: BossFight | null;
  budget!: number;
  combat!: CombatSystem | undefined;
  /** Territory id -> seconds until it may respawn. */
  cooldowns!: Map<string, number>;
  dropship!: Dropship;
  enabled!: boolean;
  encounter!: EncounterInfo | null;
  enemies!: Enemies;
  game!: Game;
  /** Quest id -> the marks it put on the field. Built lazily. */
  hunts!: Map<string, HuntRecord> | undefined;
  night!: number;
  packs!: Pack[];
  party!: Party | undefined;
  player!: Player | undefined;
  rng!: Rng;
  rpg!: RpgSystem | undefined;
  sky!: Sky | undefined;
  state!: 'field' | 'combat';
  stats!: EncounterStats;
  suppressRoamers!: boolean;
  /**
   * The party is inside a dungeon.
   *
   * An interior's world origin is kilometres from the entrance, so the open
   * world's territories and wild dens must not stream against it -- and the
   * hand-placed dungeon fights must not be streamed out from under the player.
   * @see spawnAt
   */
  interior!: boolean;
  terrain!: Terrain | undefined;
  threats!: EncounterThreat[];
  /** Terrain sampler for the wild dens' site test. See {@link WildTerritories}. */
  _eco!: Ecology | null;
  /** Reused buffer for the wild dens of this tick — `_stream` never allocates. */
  _wild!: Territory[];
  vfx!: VFX | undefined;
  async init(game: Game) {
    this.game = game;
    this.rng = new Rng(20259);
    // `Enemies` is in `Game.init`'s boot order and this director is registered
    // by `Director` after the whole world is up, so it is always present --
    // every other system here is guarded because a capture scenario can run
    // without it.
    this.enemies = game.get('Enemies')!;
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
    this.interior = false;
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

    // `Props` owns the sampler every scatter layer in the world already agrees
    // with; the wild dens ask it the same questions rather than inventing a
    // second answer to "is this ground standable".
    const props = game.get('Props');
    this._eco = (props && props.ecology) || null;
    this._wild = [];

    this._streamTimer = 0;
    this._roamTimer = 26;
    this._clearTimer = 0;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();

    this.enemies.onStrike = (e, atk) => this.resolveStrike(e, atk);
    this.enemies.threats = this.threats;

    this._offDeath = this.combat ? this.combat.on('death', (d) => this.onDeath(d.enemy, 'player')) : null;
    this._offDamage = this.combat ? this.combat.on('damage', (d) => this.onPlayerDamage(d)) : null;
    return this;
  }

  /* ------------------------------------------------------------ helpers */

  /** Ground the point `x,z` and return a scratch vector. */
  ground(x: number, z: number, out = this._tmp) {
    out.set(x, this.terrain ? this.terrain.heightAt(x, z) : 0, z);
    return out;
  }

  /** Daemon pressure right now, with a safe fallback when the RPG is absent. */
  pressure(): Pressure {
    if (this.rpg && this.rpg.daemonPressure) return this.rpg.daemonPressure();
    // `Sky.hours`, not `timeOfDay`: this read `sky.timeOfDay`, which has never
    // existed, so the no-RPG fallback resolved to noon and this branch could
    // never report a night.
    const h = this.sky && this.sky.hours != null ? this.sky.hours : 12;
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
  activate(def: Territory): ActiveTerritory {
    const already = this.active.get(def.id);
    if (already) return already;
    const pack = new Pack({ id: def.id, maxEngaged: def.maxEngaged, encounter: this });
    const scaling = this.rpg ? this.rpg.enemyScaling(def.faction === 'daemon') : NEUTRAL;
    const level = Math.max(1, Math.round(def.level + (def.faction === 'daemon' ? scaling.levelBonus : scaling.levelBonus * 0.4)));
    const list: Enemy[] = [];
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
          // `Territory.passive` had been authored, documented and never read:
          // `graze_anak` says "a grazing herd: it is scenery until something
          // provokes it" and its anaks charged on sight like everything else.
          passive: !!def.passive,
          owner: def.id,
        });
        e.home.copy(this.ground(def.at[0], def.at[1], this._tmp2));
        e.territory = def.id;
        list.push(e);
      }
    }
    const rec: ActiveTerritory = { def, pack, enemies: list };
    this.active.set(def.id, rec);
    this.packs.push(pack);
    return rec;
  }

  /** A closed patrol loop around the territory anchor. */
  _patrolRoute(def: Territory) {
    const pts: THREE.Vector3[] = [];
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

  _shouldSleep(def: Territory | Roamer) {
    const p = this.pressure();
    if (def.faction === 'daemon') return !p.spawn;
    return p.spawn && def.when === 'day';
  }

  _count(c: number | [number, number]) {
    if (!Array.isArray(c)) return c | 0;
    return c[0] + Math.floor(this.rng.next() * (c[1] - c[0] + 1));
  }

  /** Retire a territory and pool its enemies. */
  deactivate(id: string) {
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
  spawnRoamer(def: Roamer) {
    const pp = this.player!.position;
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
    const list: Enemy[] = [];
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
        list.push(e);
      }
    }
    this.packs.push(pack);
    if (def.dropship) this.dropship.arrive(this.ground(cx, cz).clone(), list);
    else {
      // they have already seen you — that is what makes an ambush an ambush
      for (const e of list) { e.target = this.player ?? null; e.awareness = 1; e.setState('chase'); }
      pack.alerted = true;
    }
    this._warn(def.faction === 'daemon' ? 'Daemons.' : def.faction === 'imperial' ? 'Imperials incoming.' : 'Something has our scent.');
    return { def, pack, enemies: list };
  }

  /* -------------------------------------------------------------- interiors */

  /**
   * Arm one dungeon encounter marker, in world space, inside a dungeon.
   *
   * `Layout.encounter()` markers had been declarative for the life of the
   * feature -- six authored fights across the three dungeons, three of them
   * bosses -- read only by `DungeonMap` to draw an enemy pip. This is the thin
   * wrapper that makes them real, and it is deliberately NOT `activate()`:
   *
   * - the record never goes into `this.active`, so `_streamOne` cannot see it
   *   and cannot distance-deactivate it. That matters because an interior sits
   *   at its own world origin, which is kilometres from the entrance the party
   *   walked in through, so the ordinary 230 m retire would fire instantly.
   * - it is leashed to its own room rather than to a territory radius.
   * - a boss routes through the existing `BossFight` on a `SetPiece` LITERAL.
   *   There is no `SET_PIECES` row for a dungeon boss: those are a hand-placed
   *   world table, and a dungeon's fight is placed by the dungeon.
   *
   * Call it only after `Dungeons._patchTerrain()` -- `ground()` reads
   * `Terrain.heightAt`, which is what that patch redirects to the interior
   * floor.
   *
   * @param spec the marker, from `Layout.encounters`
   * @param pos  world position of the marker, already on the interior floor
   * @returns what was spawned, keyed by `owner` for {@link clearOwned}
   */
  spawnAt(spec: DungeonEncounter, pos: THREE.Vector3, opts: { interior?: boolean, level?: number } = {}) {
    const row = DUNGEON_KINDS[spec.kind];
    if (!row) return null;
    const owner = `dungeon:${spec.id}`;
    const level = opts.level ?? row.level;

    if (spec.boss) {
      // A literal, not a table row. `arena` is the room, not the 60 m default,
      // and `dropship` is false because there is no sky to drop from.
      const def: SetPiece = {
        id: owner, name: spec.name || row.name, kind: row.kind,
        at: [pos.x, pos.z], radius: spec.r, level, boss: row.key,
        dropship: false, arena: spec.r,
        music: row.kind === 'imperial' ? 'boss-imperial' : 'boss-field',
      };
      // One boss at a time: `startSetPiece` has the same guard, and two armed
      // fights clobber `this.boss`.
      if (this.boss) this.endBoss(false);
      const fight = new BossFight(def, this);
      this.boss = fight;
      // 16 m of stand-off is right on a hillside and wrong in a 12 m room.
      fight.begin(pos.clone(), Math.min(16, spec.r * 0.75));
      return { owner, pack: fight.pack, enemies: [fight.boss, ...fight.adds].filter(Boolean) as Enemy[], fight };
    }

    const n = Math.max(1, spec.count ?? 3);
    const pack = new Pack({ id: owner, maxEngaged: Math.min(3, n), encounter: this });
    const list: Enemy[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rng.next() * 0.7;
      const r = Math.sqrt(this.rng.next()) * spec.r * 0.6;
      const p = this.ground(pos.x + Math.cos(a) * r, pos.z + Math.sin(a) * r, this._tmp2);
      const e = this.enemies.spawn(row.key, {
        pos: p, heading: this.rng.next() * Math.PI * 2, level,
        pack, leash: spec.r + 10, owner, name: spec.name,
      });
      e.home.copy(this.ground(pos.x, pos.z, this._tmp2));
      list.push(e);
    }
    this.packs.push(pack);
    return { owner, pack, enemies: list, fight: null as BossFight | null };
  }

  /**
   * Despawn everything {@link spawnAt} put in the world under `owner`.
   *
   * Mirrors `deactivate()`'s ownership test -- a pooled instance may already
   * have been recycled into somebody else's pack, and despawning it twice
   * would steal it.
   */
  clearOwned(owner: string, pack: Pack | null = null) {
    for (const e of this.enemies.list.slice()) {
      if (e.spawnedBy === owner) this.enemies.despawn(e);
    }
    if (this.boss && this.boss.def.id === owner) this.endBoss(false);
    if (pack) { const i = this.packs.indexOf(pack); if (i >= 0) this.packs.splice(i, 1); }
  }

  /* ------------------------------------------------------------ set pieces */

  /**
   * Start a named set-piece boss fight.
   * @param id one of `SET_PIECES`
   * @param [opts] `{ at:[x,z] }`
   */
  startSetPiece(id: string, opts: { at?: number[] } = {}) {
    const def = SET_PIECES[id];
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
    const t = HUNT_TARGETS[questId];
    if (!t) return null;
    const quest = this.rpg?.quests?.def(questId);
    const obj = quest?.objectives?.find((o: { type?: string }) => o.type === 'kill') || quest?.objectives?.[0];
    const wp = obj?.waypoint || [0, 0, 0];
    const pack = new Pack({ id: `hunt-${questId}`, encounter: this, maxEngaged: 3 });
    const n = Math.min(t.count, t.maxAlive || t.count);
    const list: Enemy[] = [];
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
  _topUpHunt(questId: string) {
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
  resolveStrike(e: Enemy, atk: StrikeSpec | null) {
    const a: StrikeSpec = atk || { hitRadius: 1.8, mult: 1, arc: Math.PI / 2 };

    // **An active boss fight gets first refusal.** This one line is what
    // `BossFight.resolveStrike`, `slamAt` and `_handPos` were waiting for: they
    // have been in the tree, typed and compiling, and had never executed once.
    // The sweep below starts at the enemy's *root* and reaches `hitRadius`
    // along its heading, which is the right model for a sabertusk and the wrong
    // one for a creature whose fist arrives forty metres from its navel --
    // Titan's slam landed on his own feet. `BossFight` returns true only when
    // it actually handled the blow (its own boss, an astral fight, a hand it
    // can find), so everything else still falls through to the generic path.
    if (this.boss && this.boss.resolveStrike(e, a)) return;
    const reach = (a.hitRadius || 1.8) * e.scale;
    const arc = a.arc != null ? a.arc : Math.PI / 2;
    const fx = Math.sin(e.heading), fz = Math.cos(e.heading);
    const origin = e.root.position;


    for (const t of this.threats) {
      const tp = threatPos(t);
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
      if (a.ranged) {
        const p = this._hitChance(e, a, t, d);
        if (this.rng.next() > p) { this._missNear(e, tp, d); continue; }
        this._tracer(e, a, tp);
      }
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

  /**
   * How likely this shot is to land, as a ladder the player can climb.
   *
   * It replaces `rng.next() > 0.72` — a flat 28% miss the player could neither
   * see nor influence, which makes a firefight a damage race decided by stats.
   * Every term here is something the player is *doing*, and every one of them
   * is already computed elsewhere in this repo; none of it is new state.
   *
   * The ordering matters more than the constants. Moving beats standing,
   * moving across the shooter's line beats moving along it (a target closing
   * head-on is barely harder to hit than a stationary one, which is why
   * charging a shooter should be a decision and not a dodge), distance costs
   * accuracy, and standing in grass costs the shooter more the further away it
   * is — that last one is `Enemy.concealment`, reused rather than re-derived so
   * the thing that hides you from being *seen* is the thing that spoils a shot
   * at you.
   *
   * `_settled` is the aim: a shooter that has been holding the same lane for a
   * second is dangerous, one that just re-acquired is not. That is what makes
   * breaking line and re-entering somewhere else a real move rather than a
   * cosmetic one.
   */
  _hitChance(e: Enemy, a: StrikeSpec, t: EncounterThreat, d: number): number {
    const HIT_BASE = 0.86;
    let p = HIT_BASE;

    // Aim settle: 0.55x on the first shot after re-acquiring, full by ~1.2 s.
    const settle = THREE.MathUtils.clamp((e._settled ?? 1) / 1.2, 0, 1);
    p *= 0.55 + 0.45 * settle;

    // Speed, and the direction of it. `lateral` is the component across the
    // shooter's line; a pure closer barely gains.
    const tp = threatPos(t);
    const v = (t as { velocity?: THREE.Vector3 }).velocity;
    const speed = v ? Math.hypot(v.x, v.z) : 0;
    let lateral = 0;
    if (tp && v && d > 1e-3 && speed > 1e-3) {
      const lx = (tp.x - e.root.position.x) / d, lz = (tp.z - e.root.position.z) / d;
      // |cross| of the unit line-of-fire with the unit velocity
      lateral = Math.abs(lx * (v.z / speed) - lz * (v.x / speed));
    }
    const mv = THREE.MathUtils.clamp(speed / 5.0, 0, 1);
    p *= 1 - mv * (0.16 + 0.34 * lateral);

    // Range, against the attack's own reach rather than an absolute.
    p *= 1 - 0.30 * THREE.MathUtils.clamp(d / (a.range || 20), 0, 1);

    // Concealment, from the same sampler perception uses — `_concealFactor` is
    // the enemy's own, so grass that hides you from being *seen* is the same
    // grass that spoils a shot at you, with one law and one set of constants.
    if (tp) p *= e._concealFactor(t, tp, d, this.enemies ? this.enemies._ctx : null);

    return THREE.MathUtils.clamp(p, 0.08, 0.95);
  }

  /**
   * A shot that went past. It has to be *visible*, or a miss and a shooter
   * that is not firing look identical from behind cover.
   *
   * The tracer terminates at the scattered point rather than at the target,
   * which is the whole difference: before this, a miss still drew a line
   * ending exactly on the player and then quietly did nothing, so the only
   * feedback for 28% of incoming fire was the damage that did not arrive.
   */
  _missNear(e: Enemy, tp: THREE.Vector3, d: number) {
    if (!this.vfx) return;
    // Scatter grows with range: a near miss at 5 m is 0.4 m wide, at 30 m it
    // is two metres and reads as a spray rather than as a shot at somebody else.
    const spread = 0.35 + 0.055 * d;
    const ang = this.rng.next() * Math.PI * 2;
    const r = spread * (0.55 + 0.45 * this.rng.next());
    const mx = tp.x + Math.sin(ang) * r;
    const mz = tp.z + Math.cos(ang) * r;
    const my = tp.y + 1.1 + (this.rng.next() - 0.5) * spread;
    this._tracer(e, { hitRadius: 0, mult: 0, arc: 0, ranged: true } as StrikeSpec,
      this._tmp2.set(mx, my, mz));
    // Where it struck, if it struck the ground near enough to raise dust.
    const g = this.ground(mx, mz).clone();
    if (my - g.y < 1.6) {
      this.vfx.dustPuff({
        pos: g, count: 5, radius: 0.22, speed: 2.4, life: 0.5,
        size: 0.22, grow: 2.2, up: 1.1, intensity: 0.35,
      });
    }
  }

  /** A visible line for ranged shots so the player can read where it came from. */
  _tracer(e: Enemy, a: StrikeSpec, to: THREE.Vector3 | null) {
    if (!this.vfx) return;
    const from = e.centre();
    from.y += e.height * 0.15 * e.scale;
    const tp = to || threatPos(this.threats[0]);
    if (!tp) return;
    this._tmp.set(tp.x, to ? tp.y : tp.y + 1.1, tp.z);
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
  damageThreat(t: EncounterThreat, e: Enemy, a: StrikeSpec) {
    // A companion carries a `key`; Noctis does not. That is the only thing
    // that separates the two arms of `EncounterThreat`.
    const member: PartyMember | null = 'key' in t ? t : null;
    const isPlayer = !member;
    if (isPlayer && this._playerAvoids(e, a)) return;

    const raw = e.damage * (a.mult || 1);
    let dmg = Math.round(raw);
    const rpg = this.rpg;
    const vitals = this.player?.stats;
    if (rpg) {
      const memberId = member ? MEMBER_BY_KEY[member.key] || 'gladio' : 'noctis';
      const target = rpg.party.stats[memberId];
      const res = rpg.damage({
        attacker: { attack: e.damage * 0.9, level: e.level, critRate: 0.06, critDamage: 1.5 },
        target, motion: a.mult || 1, element: a.element || 'physical',
        targetIsDaemon: false,
      });
      dmg = Math.max(1, Math.round(res.damage * 0.55));
      target.applyDamage(dmg);
      if (isPlayer && vitals) vitals.hp = Math.round(target.hp);
    } else if (isPlayer && vitals) {
      vitals.hp = Math.max(0, vitals.hp - dmg);
    }

    const at = (threatPos(t) ?? this._tmp2).clone();
    at.y += 1.1;
    if (this.vfx) {
      this.vfx.impact({
        pos: at, dir: this._tmp.subVectors(at, e.centre()).normalize(),
        scale: isPlayer ? 1.1 : 0.9, color: 0xff5a3a, blood: true, terrain: null,
      });
    }
    if (isPlayer) {
      if (this.combat) this.combat.hitstop = Math.max(this.combat.hitstop, 0.05);
      this._emitCombat('playerHit', { enemy: e, damage: dmg, hp: vitals?.hp ?? 0, position: at });
    } else {
      // `Character.hitReact` has never existed -- nothing in the tree declares
      // or defines it, so the companion hit reaction that used to be called
      // here behind `?.` was a no-op from the day it was written.
      window.dispatchEvent(new CustomEvent('encounter:allyHit', { detail: { member: member.key, damage: dmg, position: at } }));
    }
  }

  /** Dodge i-frames, warp invulnerability and the phase parry. */
  _playerAvoids(e: Enemy, a: StrikeSpec) {
    const c = this.combat;
    if (!c) return false;
    if (c.state === 'warp') return true;
    if (c.state === 'dodge' && c.stateTime < 0.32) return true;
    if (c.state === 'phase' && c.phaseCharge > 0.05 && !a.unblockable) {
      // `_perfectParry(enemy, player)` takes two arguments and dereferences the
      // second on its first line. This called it with one, so every phase-parry
      // that came through the encounter loop -- which owns `Enemies.onStrike`,
      // and is therefore the live strike path -- threw a TypeError out of the
      // frame. Passing the player is the only reading that is not a crash.
      if (c._perfectParry && this.player) c._perfectParry(e, this.player);
      else this._emitCombat('parry', { enemy: e, position: e.centre() });
      return true;
    }
    return false;
  }

  _emitCombat<K extends CombatEventName>(name: K, detail: CombatEvents[K]) {
    if (this.combat && this.combat.emit) this.combat.emit(name, detail);
    else window.dispatchEvent(new CustomEvent(`combat:${name}`, { detail }));
  }

  /* ------------------------------------------------------------ pack hooks */

  /**
   * A pack has just noticed the party. This is the "you have been seen" beat.
   * @param pack @param target
   */
  onAlerted(pack: Pack, target: Threat) {
    if (this.state === 'combat') return;
    const first = pack.members.find((m) => !m.dead);
    window.dispatchEvent(new CustomEvent('encounter:spotted', {
      detail: { pack: pack.id, name: first ? first.name : '', count: pack.alive },
    }));
  }

  /**
   * A pack member died. If that was the last of them, the fight is over as
   * far as this pack is concerned.
   */
  onMemberDied(pack: Pack, e: Enemy) {
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
  onDeath(e: Enemy, by: string = 'player') {
    if (!e || e._looted) return;
    e._looted = true;
    this.stats.kills++;

    let exp = 0;
    const drops: string[] = [];
    const rpg = this.rpg;
    if (rpg) {
      const byWarpStrike = !!(this.combat && this.combat.state === 'warp');
      const res = rpg.enemyKilled(
        { id: e.speciesId, level: e.level, expClass: e.expClass, drops: [] },
        // `hunt` is what lets a mark credit its own hunt when the board's word
        // for it and the bestiary's key disagree. @see QuestLog.creditMark
        { byWarpStrike, byTechnique: by === 'tech', hunt: e.hunt }
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
  onPlayerDamage(d: CombatEvents['damage']) {
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
    const live: string[] = [];
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

  update(dt: number, game: Game) {
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

  /**
   * Activate what is near, retire what is not.
   *
   * Walks the authored table **and** the wild dens under the player's feet.
   * The two are the same type and take the same path on purpose: an authored
   * territory is a *named* place with a hunt pointing at it, a wild one is the
   * country in between, and nothing downstream of here needs to know which is
   * which. See {@link WildTerritories} for why the country needed filling —
   * `walkabout.mts` walked 6.8 km out of Hammerhead in eight directions and
   * met no living thing at all.
   *
   * Generated at 400 m, against the 130 m activation radius, so a den is
   * decided well before it can be seen and the same cell is offered on every
   * tick it is in range: the ids are position-derived, so `active` and
   * `cooldowns` key on them exactly as they do for the authored eighteen.
   */
  _stream(pressure: Pressure, pp: THREE.Vector3) {
    // timed marks (Ignis' Analyse, Gladio's Coverage) tick on the slow clock
    for (const e of this.enemies.list) if (e.analysed > 0) e.analysed -= 0.5;
    if (this.party) for (const m of this.party.members) if (m.taunting > 0) m.taunting -= 0.5;

    // Inside a dungeon the only encounters are the authored ones. The wild
    // generator would otherwise roll dens against the interior's own world
    // origin -- a kilometre of empty heightfield nobody can reach.
    if (this.interior) { this._wild = []; return; }

    this._wild = wildTerritoriesNear(pp.x, pp.z, 400, pressure, this._eco,
      this.game.seed ?? 1337, (this.rpg && this.rpg.noctis && this.rpg.noctis.level) || 0);

    // Authored first, so a named place wins the creature budget over the
    // anonymous country around it when both are in range.
    for (const def of TERRITORIES) this._streamOne(def, pressure, pp);
    for (const def of this._wild) this._streamOne(def, pressure, pp);

    // A cleared wild den is remembered by id, and the ids are unbounded across
    // an 8 km map, so the map would grow for as long as the session lasted.
    // Anything more than a kilometre behind the player is past its own respawn
    // several times over by the time they could return to it.
    if (this.cooldowns.size > 400) {
      for (const [id] of this.cooldowns) {
        if (!id.startsWith('wild_')) continue;
        const bits = id.split('_');
        const cx = Number(bits[1]), cz = Number(bits[2]);
        if (Math.hypot(cx * WILD_CELL - pp.x, cz * WILD_CELL - pp.z) > 1000) this.cooldowns.delete(id);
      }
    }
  }

  /** One territory's activate/retire decision. Shared by both tables. */
  _streamOne(def: Territory, pressure: Pressure, pp: THREE.Vector3) {
    const dx = def.at[0] - pp.x, dz = def.at[1] - pp.z;
    const d = Math.hypot(dx, dz);
    const open = windowOpen(def.when, pressure) && (!def.nightDepth || pressure.depth >= def.nightDepth);
    const has = this.active.has(def.id);
    if (!has) {
      // budget: ~28 live creatures is a full, dangerous world and about 28
      // draw calls, which is what the frame can actually afford
      //
      // 170 m, not the 130 m this was written at. A grazing herd you can only
      // see once you are inside a hundred and thirty metres of it is a herd
      // that pops into an empty plain; at 170 it is already on the skyline
      // when you crest the rise, which is most of what "the world has animals
      // in it" actually looks like. The budget, not the radius, is what bounds
      // the cost — a den outside it simply does not activate.
      if (d < 170 && open && !this.cooldowns.has(def.id) && this.enemies.list.length < this.budget) {
        this.activate(def);
      }
      return;
    }
    const rec = this.active.get(def.id)!;
    const fighting = rec.pack.alerted && rec.pack.alive > 0;
    if ((d > 230 && !fighting) || (!open && !fighting)) this.deactivate(def.id);
    else if (rec.pack.alive === 0) {
      this.deactivate(def.id);
      this.cooldowns.set(def.id, def.respawn);
    }
  }
}

const NEUTRAL = { levelBonus: 0, attack: 1, defense: 1, hp: 1, depth: 0, isNight: false };
const MEMBER_BY_KEY: Record<CompanionKey, string> = { gladio: 'gladio', ignis: 'ignis', prompto: 'prompto' };

/**
 * What a dungeon `EncounterKind` marker actually spawns.
 *
 * The authored kinds are the dungeon author's vocabulary, not bestiary keys,
 * and two of them name creatures this game does not have: there is no
 * `mindflayer` and no `magitek_commander` in `TYPES`. Rather than invent two
 * species to satisfy two markers, they map onto the nearest thing that exists
 * and is the right shape of fight -- a Magitek Armour is exactly the imperial
 * heavy a "commander" marker wants, and a Necromancer is the caster the
 * Fociaugh marker was reaching for.
 */
const DUNGEON_KINDS: Record<string, { key: string, level: number, kind: SetPiece['kind'], name: string }> = {
  'mt-squad':       { key: 'mt',             level: 13, kind: 'imperial', name: 'MT Squad' },
  'mt-commander':   { key: 'magitek_armour', level: 20, kind: 'imperial', name: 'Magitek Commander' },
  'goblin-pack':    { key: 'goblin',         level: 17, kind: 'field',    name: 'Goblin Pack' },
  'iron-giant':     { key: 'irongiant',      level: 34, kind: 'imperial', name: 'Iron Giant' },
  'sabertusk-pack': { key: 'sabertusk',      level: 11, kind: 'field',    name: 'Sabertusk Pack' },
  'mindflayer':     { key: 'necromancer',    level: 27, kind: 'field',    name: 'Mindflayer' },
};

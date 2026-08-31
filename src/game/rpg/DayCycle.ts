/**
 * The day/night loop as a *gameplay* system.
 *
 * FFXV's clock is a rule, not a backdrop: daemons rise after dark and get
 * worse the deeper into the night you go, you can only camp at a haven, and
 * sleeping is what turns banked EXP into levels and expires your meal buffs.
 *
 * This module owns the clock, the haven registry, camping/resting and daemon
 * pressure. It deliberately does *not* touch the sky shader — if a `Sky`
 * system is present it can either follow it (`syncFromSky`) or drive it
 * (`driveSky`), so two systems never fight over the same number.
 */

import { LODGINGS, nightScaling } from './Stats.ts';
import type { ExpRedemption, Lodging } from './Stats.ts';
import { worldMap } from '../../world/map/WorldMap.ts';
import type { Emitter } from './Emitter.ts';
import type { Game } from '../Game.ts';

/** Named phases of the day, with the hour ranges that define them. */
export const PHASES = [
  { id: 'night',    name: 'Night',       from: 0,    to: 4.5,  daemons: true },
  { id: 'dawn',     name: 'Dawn',        from: 4.5,  to: 6.5,  daemons: false },
  { id: 'morning',  name: 'Morning',     from: 6.5,  to: 11,   daemons: false },
  { id: 'midday',   name: 'Midday',      from: 11,   to: 15,   daemons: false },
  { id: 'afternoon',name: 'Afternoon',   from: 15,   to: 17.5, daemons: false },
  { id: 'dusk',     name: 'Dusk',        from: 17.5, to: 19.5, daemons: false },
  { id: 'evening',  name: 'Evening',     from: 19.5, to: 21,   daemons: true },
  { id: 'deepnight',name: 'Deep Night',  from: 21,   to: 24,   daemons: true },
];

/**
 * How far the clock has to have moved before it is worth telling the sky.
 *
 * 0.004 h is 14 in-game seconds — 0.6 s of wall clock at the rate below — and
 * moves the sun by 0.055 degrees, which is nothing. What it buys is that
 * `Sky._applyTimeOfDay` (a sky-view LUT bake, a CSM refit and a handful of
 * allocations) runs at ~1.6 Hz instead of 60 Hz.
 */
const PUSH_EPS = 0.004;

/** Hour at which daemons start and stop spawning. */
export const DAEMON_START = 19;
export const DAEMON_END = 5;

/**
 * Havens — the rune-marked campsites you can actually sleep at.
 *
 * **Derived from `WorldMap`, never re-typed.** This table used to be ten
 * hand-written coordinates in the pre-8 km world: `haven_longwythe` at
 * `[128, 0, 84]` while the map put Cotisse Haven at `(962, -712)` and
 * Hammerhead at `(576, 10)`. Nothing noticed, because nothing ever camped —
 * `canCamp()` measured against these numbers and returned `no-haven` wherever
 * you stood, and `GameData.readMarkers()` drew the pins hundreds of metres off
 * the geometry. `project/HANDOFF.md` §5 says it plainly: coordinates go stale,
 * derive them live from `WorldMap`/`Terrain` rather than hard-coding and hoping.
 *
 * The lowest-level haven starts discovered so the compass and the world map
 * have somewhere to point on a fresh save; the rest are found by walking near
 * them, which is what `discoverHaven` is for.
 */
/** A rune-marked campsite. */
export interface Haven {
  id: string;
  name: string;
  /** World coordinates, `[x, y, z]`. */
  pos: number[];
  region: string;
  /**
   * Suggested party level, from the POI. Havens are ordered by it so the
   * starting one is the gentlest rather than whichever was typed first.
   */
  level: number;
  /** Whether it starts on the map. Live state lives in `DayCycle.havenState`. */
  discovered: boolean;
}

/** A haven with the live discovery state merged in. */
export interface HavenState extends Haven {}

/** The nearest haven, and how far away it is. */
export interface NearHaven extends HavenState {
  /** Metres from the point that was asked about. */
  distance: number;
}

/** The serialised clock. */
export interface DayCycleSave {
  day?: number;
  hour?: number;
  absoluteHour?: number;
  /** Haven id -> whether it has been found. */
  havens?: Record<string, boolean>;
}

export const HAVENS: Haven[] = worldMap.poisOfType('haven')
  .map((p) => ({
    id: p.id,
    name: p.name,
    pos: [p.x, 0, p.z],
    region: worldMap.zoneById.get(p.zone)?.region || 'leide',
    level: p.lv ?? 1,
    discovered: false,
  }))
  .sort((a, b) => a.level - b.level);
if (HAVENS[0]) HAVENS[0].discovered = true;

/** How close you must be to a haven to camp there. */
export const HAVEN_RADIUS = 14;

/* ------------------------------------------------------------------------ */

/**
 * The world clock and everything that hangs off it. Emits
 * `time-of-day-changed`, `hour-changed`, `day-changed`, `daemons-rising`,
 * `daemons-receding`, `haven-discovered` and `rested`.
 */
/** A night that happened. */
export interface RestSummary {
  ok: true;
  /** The lodging, with the haven EXP bonus already folded into `bonus`. */
  lodging: Lodging;
  hoursSlept: number;
  day: number;
  /** Clock string the party woke at. */
  wokeAt: string;
  /** Null when there was no EXP bank to redeem. */
  exp: ExpRedemption | null;
  /** Names of the meal buffs that timed out overnight. */
  expiredBuffs: string[];
}

/** Why a night did not happen. */
export interface RestRefused {
  ok: false;
  reason: string;
  /** `'not-at-haven'` only: the nearest one, and how far away it is. */
  haven?: NearHaven | null;
  /** `'not-enough-gil'` only. */
  cost?: number;
}

/** Whether the party may camp where it is standing. */
export type CampCheck =
  | { ok: true; haven: NearHaven }
  | { ok: false; reason: 'no-haven' | 'not-at-haven'; haven?: NearHaven };

/** @see DayCycle.rest */
export type RestResult = RestSummary | RestRefused;

export class DayCycle {
  _phase!: string;
  _daemonsUp!: boolean;
  _lastHourInt!: number;
  absoluteHour!: number;
  day!: number;
  driveSky!: boolean;
  emitter!: Emitter | null;
  /** Haven id -> whether it is on the map yet. */
  havenState!: Record<string, { discovered: boolean }>;
  hour!: number;
  minutesPerSecond!: number;
  running!: boolean;
  syncFromSky!: boolean;
  /** The sky hour we last observed, so a scripted set is distinguishable. */
  _skyWritten!: number | null;
  /** True when this instance came out of a save file — see `update`. */
  _restored!: boolean;
  constructor(emitter: import('./Emitter.ts').Emitter | null = null) {
    this.emitter = emitter;
    /** Current hour, 0..24. */
    this.hour = 9.0;
    /** Days elapsed since leaving Insomnia. */
    this.day = 1;
    /**
     * In-game minutes per real second — **0.4, one full day per real hour.**
     *
     * The old value was 20, which is a whole day every 72 seconds, and it was
     * never once observed because nothing called this branch: `syncFromSky`
     * was true and `driveSky` false, so the clock followed a sky that never
     * moved and the rate was dead code. Picking a real one:
     *
     * - `BRIEF.md` makes golden hour the signature look and night the second
     *   one. A rate has to put both inside one sitting, or the player who
     *   plays once never sees half the art direction.
     * - A blind playtester played for **thirty minutes** and wrote *"the sun
     *   never moved"*. Thirty minutes is therefore the unit to design against,
     *   not a full day: half a day per session is the target.
     * - 0.4 min/s is 24 game-hours per real hour, so a 30-minute session
     *   crosses **twelve** game hours. From the 12:00 the world boots at that
     *   is midday -> afternoon -> five real minutes of golden hour -> dusk ->
     *   the starfield night the same playtest called its favourite frame.
     * - It is also FFXV's own ratio (a day there is about an hour of wall
     *   clock), and it is slow enough that the sun does not visibly crawl:
     *   at this rate it moves 0.09 degrees of azimuth per real second.
     *
     * Faster and dusk is a strobe you cannot photograph; slower and the
     * complaint that produced this comment is still true.
     */
    this.minutesPerSecond = 0.4;
    /** Set false during cutscenes and menus. */
    this.running = true;
    /** Adopt an hour some other system pushed into the Sky (see `update`). */
    this.syncFromSky = true;
    /**
     * Push our hour into the Sky system.
     *
     * **True, and that is the fix for the frozen clock.** These two flags used
     * to be `sync=true, drive=false`, which reads as "the Sky owns the hour" —
     * except `Sky.hours` only ever changes inside `setTimeOfDay`, so nothing
     * owned it and neither system errored. Two systems politely deferring to
     * each other over one number is a clock that never moves. See `update`
     * for how a scripted `setTimeOfDay` still wins.
     */
    this.driveSky = true;

    /** @type {Record<string, {discovered:boolean}>} */
    this.havenState = {};
    for (const h of HAVENS) this.havenState[h.id] = { discovered: !!h.discovered };

    this._phase = this.phase.id;
    this._lastHourInt = Math.floor(this.hour);
    this._daemonsUp = this.isNight;
    this._skyWritten = null;
    this._restored = false;
    /** Absolute hour count — buff timers use this so they survive midnight. */
    this.absoluteHour = (this.day - 1) * 24 + this.hour;
  }

  /* -- Clock ------------------------------------------------------------- */

  /** The phase object for the current hour. */
  get phase() {
    const h = this.hour;
    return PHASES.find((p) => h >= p.from && h < p.to) || PHASES[0];
  }

  /** True between 19:00 and 05:00. */
  get isNight() { return this.hour >= DAEMON_START || this.hour < DAEMON_END; }

  /** 0..1 how deep into the night we are — drives daemon strength. */
  get nightDepth() { return nightScaling(this.hour).depth; }

  /** Enemy scaling to apply right now. */
  scaling(isDaemon = false) { return nightScaling(this.hour, isDaemon); }

  /** A "07:35" style string for the HUD. */
  get clockString() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /**
   * Advance the clock.
   * @param dt real seconds
   * @param [game] optional Game handle for Sky sync
   */
  update(dt: number, game: Game | null = null) {
    const sky = game?.get ? game.get('Sky') : null;
    const skyHour = this.syncFromSky && typeof sky?.hours === 'number' ? sky.hours : null;

    // 1. Did somebody else move the sky since our last write? `applyShot`, a
    //    chapter start, a cutscene, `Dungeons._restoreWorldLighting`, the
    //    `?debug` time slider and `Warmup` all call `Sky.setTimeOfDay`, which
    //    is the documented cross-system API (`BRIEF.md`) and must keep winning.
    //    Comparing against what *we* last saw the sky holding — rather than
    //    against our own hour — is what tells a scripted set apart from our own
    //    push, so the two never fight.
    if (skyHour != null && (this._skyWritten == null || Math.abs(skyHour - this._skyWritten) > 1e-9)) {
      if (this._skyWritten == null && this._restored) {
        // A save owns its hour: a session loaded at 21:40 must not be dragged
        // back to whatever the sky booted at. Push, do not adopt.
      } else {
        // Follow by *delta* so a midnight wrap still advances the day and
        // absolute-hour buff timers never run backwards.
        let delta = skyHour - this.hour;
        if (delta < -12) delta += 24;
        if (delta > 0) this.advance(delta);
        // A scripted jump backwards (the shot harness, a cutscene) is not a
        // rewind of the calendar — snap to it so the clock never contradicts
        // the light the player is standing in.
        else if (delta < -0.001) this.setHour(skyHour);
      }
    }

    // 2. Our own hour advances.
    if (this.flowing(game)) this.advance((dt * this.minutesPerSecond) / 60);

    // 3. Push it back into the sky, but only past a threshold — see PUSH_EPS.
    if (this.driveSky && sky?.setTimeOfDay && this.drivesSky(game)
        && Math.abs(sky.hours - this.hour) > PUSH_EPS) {
      // `force = false`: the second argument exists for exactly this caller.
      // A forced apply rebuilds the PMREM environment probe unconditionally,
      // which is right for a scripted jump and ruinous 1.6 times a second.
      // Sky's own 0.08-hour threshold then rebakes the ambient every ~12 s.
      sky.setTimeOfDay(this.hour, false);
    }
    this._skyWritten = typeof sky?.hours === 'number' ? sky.hours : null;
  }

  /**
   * Is the clock allowed to advance right now?
   *
   * **A posed shot pins it.** `Shots.ts` authors a `time` per shot and
   * `Game.applyShot` pushes it into the sky; a clock that kept running would
   * make all 166 corpus frames depend on how many settle steps they were
   * given, which is the one thing `resetClock` exists to prevent. `currentShot`
   * is the flag for "a capture owns this frame", and `Director.play()` — the
   * documented posed -> live edge — clears it, so ordinary play and every
   * probe that goes live are unaffected.
   *
   * **The title screen pins it too.** `TitleScreen.show` sets 18.55 and the
   * comment above it says *"Golden hour, always. The title screen is the one
   * frame every player sees"*. A player who reads the menu for four minutes
   * should not arrive at dusk.
   */
  flowing(game: Game | null): boolean {
    if (!this.running) return false;
    if (game?.currentShot) return false;
    const title = game?.get ? (game.get('Story') as { title?: { shown?: boolean } } | null)?.title : null;
    if (title?.shown) return false;
    return true;
  }

  /**
   * Is the clock allowed to *drive the sky* right now?
   *
   * Underground it is not. `Dungeons._saveWorldLighting` parks the world's
   * `scene.environmentIntensity` and `probe.light.intensity` and installs the
   * dungeon's own, and `Sky._updateEnv` overwrites both from the sky — so a
   * clock ticking the sky past its 0.08-hour env threshold while the player is
   * inside would silently relight the dungeon from the sky outside it. Time
   * still *passes* inside (the party is not in stasis); only the light waits,
   * and it catches up in one step on the way out, which is exactly the jump
   * `_restoreWorldLighting`'s own `setTimeOfDay` is already built to absorb.
   */
  drivesSky(game: Game | null): boolean {
    if (game?.currentShot) return false;
    const dungeons = game?.get ? (game.get('Dungeons') as { isInside?: boolean } | null) : null;
    return !dungeons?.isInside;
  }

  /**
   * Push the clock forward by a number of in-game hours, emitting every
   * transition it crosses.
   */
  advance(hours: number) {
    if (hours <= 0) return;
    this.setHour(this.hour + hours);
  }

  /**
   * Set the clock. Handles day rollover and fires phase/daemon events.
   * @param hour may exceed 24 — days roll over
   */
  setHour(hour: number) {
    const prevPhase = this._phase;
    const prevHourInt = this._lastHourInt;
    const prevDay = this.day;

    let h = hour;
    while (h >= 24) { h -= 24; this.day++; }
    while (h < 0) { h += 24; this.day = Math.max(1, this.day - 1); }
    this.hour = h;
    this.absoluteHour = (this.day - 1) * 24 + this.hour;

    if (this.day !== prevDay) this.emitter?.emit('day-changed', { day: this.day });

    const hourInt = Math.floor(this.hour);
    if (hourInt !== prevHourInt) {
      this._lastHourInt = hourInt;
      this.emitter?.emit('hour-changed', { hour: this.hour, day: this.day, clock: this.clockString });
    }

    const phase = this.phase;
    if (phase.id !== prevPhase) {
      this._phase = phase.id;
      this.emitter?.emit('time-of-day-changed', {
        phase: phase.id, name: phase.name, hour: this.hour, day: this.day,
        isNight: this.isNight, nightDepth: this.nightDepth, clock: this.clockString,
      });
    }

    const daemonsUp = this.isNight;
    if (daemonsUp !== this._daemonsUp) {
      this._daemonsUp = daemonsUp;
      this.emitter?.emit(daemonsUp ? 'daemons-rising' : 'daemons-receding', {
        hour: this.hour, depth: this.nightDepth,
      });
    }
  }

  /* -- Daemons ----------------------------------------------------------- */

  /**
   * How hard the night is pushing right now — the Enemies system can read this
   * directly to decide spawn counts and levels.
   */
  daemonPressure(partyLevel = 1): {spawn:boolean, density:number, levelBonus:number, depth:number, level?: number, attack?: number, defense?: number, hp?: number } {
    const s = nightScaling(this.hour, true);
    return {
      spawn: this.isNight,
      density: s.depth,                                   // 0..1
      levelBonus: s.levelBonus,
      level: Math.max(1, Math.round(partyLevel + s.levelBonus * 0.6)),
      depth: s.depth,
      attack: s.attack, defense: s.defense, hp: s.hp,
    };
  }

  /** True when it is dangerous to be outside a haven. */
  get isDangerousOutside() { return this.nightDepth > 0.35; }

  /* -- Havens ------------------------------------------------------------ */

  /** Havens with their discovery state merged in. */
  havens(): HavenState[] { return HAVENS.map((h) => ({ ...h, discovered: this.havenState[h.id].discovered })); }

  /** Mark a haven as found. */
  discoverHaven(id: string) {
    const st = this.havenState[id];
    if (!st || st.discovered) return false;
    st.discovered = true;
    const h = HAVENS.find((x) => x.id === id);
    this.emitter?.emit('haven-discovered', { haven: h });
    return true;
  }

  /**
   * Nearest haven to a point.
   * @param [discoveredOnly=false]
   */
  nearestHaven(pos: {x:number, z:number}, discoveredOnly: boolean = false): NearHaven | null {
    let best: HavenState | null = null, bestD = Infinity;
    for (const h of this.havens()) {
      if (discoveredOnly && !h.discovered) continue;
      const d = Math.hypot(pos.x - h.pos[0], pos.z - h.pos[2]);
      if (d < bestD) { bestD = d; best = h; }
    }
    return best ? { ...best, distance: bestD } : null;
  }

  /**
   * Is the party standing at a haven? Also auto-discovers it, since walking
   * onto a haven is how you find one.
   */
  canCamp(pos: {x:number, z:number}): CampCheck {
    const near = this.nearestHaven(pos);
    if (!near) return { ok: false, reason: 'no-haven' };
    if (near.distance > HAVEN_RADIUS) return { ok: false, reason: 'not-at-haven', haven: near };
    if (!near.discovered) this.discoverHaven(near.id);
    return { ok: true, haven: near };
  }

  /* -- Resting ----------------------------------------------------------- */

  /**
   * Sleep. Advances to the next morning, redeems the EXP bank at the lodging's
   * multiplier, restores the party and expires any buff whose timer runs out
   * during the night.
   *
   * @param {object} ctx
   * @returns the rest summary the results screen renders
   */
  rest(ctx: { expBank: import('./Stats.ts').ExpBank, party: import('./PartyState.ts').PartyState, inventory?: import('./Inventory.ts').Inventory, lodging?: string, wakeHour?: number, havenExpBonus?: number, force?: boolean, pos?: {x:number,z:number} }): RestResult {
    const lodgingId = ctx.lodging || 'haven';
    const lodging = LODGINGS[lodgingId as keyof typeof LODGINGS];
    if (!lodging) return { ok: false, reason: 'unknown-lodging' };

    if (lodgingId === 'haven' && !ctx.force) {
      if (!ctx.pos) return { ok: false, reason: 'no-position' };
      const camp = this.canCamp(ctx.pos);
      if (!camp.ok) return { ok: false, reason: camp.reason, haven: camp.haven };
    }
    if (lodging.gil > 0 && ctx.inventory) {
      if (!ctx.inventory.spendGil(lodging.gil)) return { ok: false, reason: 'not-enough-gil', cost: lodging.gil };
    }

    // Roll the clock to the following morning.
    const wake = ctx.wakeHour ?? 6.5;
    const hoursSlept = ((wake - this.hour) + 24) % 24 || 24;
    this.advance(hoursSlept);

    // EXP conversion, with the haven bonus folded in.
    const bonusLodging = { ...lodging, bonus: lodging.bonus + (lodgingId === 'haven' ? (ctx.havenExpBonus || 0) : 0) };
    const result = ctx.expBank ? ctx.expBank.redeem(ctx.party ? ctx.party.roster : [], bonusLodging) : null;

    // Restore, then expire anything whose meal timer ran out overnight.
    let expired: Array<{ name: string }> = [];
    if (ctx.party) {
      ctx.party.restoreAll();
      expired = ctx.party.expireBuffs(this.absoluteHour);
    }

    const summary: RestSummary = {
      ok: true,
      lodging: bonusLodging,
      hoursSlept: +hoursSlept.toFixed(2),
      day: this.day,
      wokeAt: this.clockString,
      exp: result,
      expiredBuffs: expired.map((b) => b.name),
    };
    this.emitter?.emit('rested', summary);
    return summary;
  }

  /** Skip time without sleeping (waiting out the night at a haven). */
  wait(hours: number, ctx: { party?: import('./PartyState.ts').PartyState } = {}) {
    this.advance(hours);
    if (ctx.party) ctx.party.expireBuffs(this.absoluteHour);
    return { ok: true, hour: this.hour, clock: this.clockString, day: this.day };
  }

  toJSON(): DayCycleSave {
    return {
      hour: this.hour, day: this.day, absoluteHour: this.absoluteHour,
      havens: Object.fromEntries(Object.keys(this.havenState).map((k) => [k, this.havenState[k].discovered])),
    };
  }

  static fromJSON(data: DayCycleSave | null | undefined, emitter: Emitter | null = null) {
    const d = new DayCycle(emitter);
    if (!data) return d;
    d.day = data.day || 1;
    d.hour = data.hour ?? 9;
    d.absoluteHour = data.absoluteHour ?? (d.day - 1) * 24 + d.hour;
    for (const id of Object.keys(d.havenState)) {
      if (data.havens?.[id] != null) d.havenState[id].discovered = !!data.havens[id];
    }
    d._phase = d.phase.id;
    d._lastHourInt = Math.floor(d.hour);
    d._daemonsUp = d.isNight;
    d._restored = true;
    return d;
  }
}

export default DayCycle;

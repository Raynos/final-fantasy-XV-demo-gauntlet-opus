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

/** Hour at which daemons start and stop spawning. */
export const DAEMON_START = 19;
export const DAEMON_END = 5;

/**
 * Havens — the rune-marked campsites you can actually sleep at. Positions are
 * world coordinates so the map and the "camp" prompt agree.
 */
export const HAVENS = [
  { id: 'haven_prairie',    name: 'Prairie Outpost Haven',   pos: [-92, 0, 60],    region: 'leide',   discovered: true },
  { id: 'haven_longwythe',  name: 'Longwythe Peak Haven',    pos: [128, 0, 84],    region: 'leide',   discovered: true },
  { id: 'haven_keycatrich', name: 'Keycatrich Ruins Haven',  pos: [-154, 0, -132], region: 'leide',   discovered: false },
  { id: 'haven_galdin',     name: 'Galdin Quay Overlook',    pos: [198, 0, 244],   region: 'leide',   discovered: false },
  { id: 'haven_nebulawood', name: 'Nebulawood Haven',        pos: [-126, 0, 104],  region: 'duscae',  discovered: false },
  { id: 'haven_wiz',        name: 'Wiz Chocobo Post Haven',  pos: [-66, 0, 126],   region: 'duscae',  discovered: false },
  { id: 'haven_cauthess',   name: 'Disc Overlook Haven',     pos: [-300, 0, 168],  region: 'duscae',  discovered: false },
  { id: 'haven_vesperpool', name: 'Vesperpool Haven',        pos: [-36, 0, 312],   region: 'cleigne', discovered: false },
  { id: 'haven_meldacio',   name: 'Meldacio Ridge Haven',    pos: [-246, 0, 396],  region: 'cleigne', discovered: false },
  { id: 'haven_ravatogh',   name: 'Rock of Ravatogh Haven',  pos: [372, 0, -248],  region: 'cleigne', discovered: false },
];

/** How close you must be to a haven to camp there. */
export const HAVEN_RADIUS = 14;

/* ------------------------------------------------------------------------ */

/**
 * The world clock and everything that hangs off it. Emits
 * `time-of-day-changed`, `hour-changed`, `day-changed`, `daemons-rising`,
 * `daemons-receding`, `haven-discovered` and `rested`.
 */
export class DayCycle {
  _phase!: string;
  _daemonsUp!: boolean;
  _lastHourInt!: number;
  absoluteHour!: number;
  day!: number;
  driveSky!: boolean;
  emitter!: Emitter | null;
  havenState!: any;
  hour!: number;
  minutesPerSecond!: number;
  running!: boolean;
  syncFromSky!: boolean;
  constructor(emitter: import('./Emitter.ts').Emitter | null = null) {
    this.emitter = emitter;
    /** Current hour, 0..24. */
    this.hour = 9.0;
    /** Days elapsed since leaving Insomnia. */
    this.day = 1;
    /** In-game minutes per real second. 60 => one in-game hour per real minute. */
    this.minutesPerSecond = 20;
    /** Set false during cutscenes and menus. */
    this.running = true;
    /** Follow an external Sky system rather than owning the clock. */
    this.syncFromSky = true;
    /** Push our hour into the Sky system (only if nothing else drives it). */
    this.driveSky = false;

    /** @type {Record<string, {discovered:boolean}>} */
    this.havenState = {};
    for (const h of HAVENS) this.havenState[h.id] = { discovered: !!h.discovered };

    this._phase = this.phase.id;
    this._lastHourInt = Math.floor(this.hour);
    this._daemonsUp = this.isNight;
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
    // Prefer an authoritative Sky if it has one and we're set to follow.
    const sky = this.syncFromSky && game?.get ? game.get('Sky') : null;
    const skyHour = typeof sky?.hours === 'number' ? sky.hours : null;
    if (skyHour != null) {
      // Follow the sky by *delta* so midnight wrap still advances the day and
      // absolute-hour buff timers never run backwards.
      let delta = skyHour - this.hour;
      if (delta < -12) delta += 24;
      if (delta > 0) this.advance(delta);
      // A scripted jump backwards (the shot harness, a cutscene) is not a
      // rewind of the calendar — snap to it so the clock never contradicts the
      // light the player is standing in.
      else if (delta < -0.001) this.setHour(skyHour);
    } else if (this.running) {
      this.advance((dt * this.minutesPerSecond) / 60);
    }
    if (this.driveSky && game?.get) {
      const s = game.get('Sky');
      if (s?.setTimeOfDay) s.setTimeOfDay(this.hour);
    }
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
  havens() { return HAVENS.map((h) => ({ ...h, discovered: this.havenState[h.id].discovered })); }

  /** Mark a haven as found. */
  discoverHaven(id: any) {
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
  nearestHaven(pos: {x:number, z:number}, discoveredOnly: boolean = false) {
    let best: any = null, bestD = Infinity;
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
  canCamp(pos: {x:number, z:number}): {ok:boolean, reason?:string, haven?:any} {
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
  rest(ctx: { expBank: import('./Stats.ts').ExpBank, party: import('./PartyState.ts').PartyState, inventory?: import('./Inventory.ts').Inventory, lodging?: string, wakeHour?: number, havenExpBonus?: number, force?: boolean, pos?: {x:number,z:number} }): any {
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
    let expired = [];
    if (ctx.party) {
      ctx.party.restoreAll();
      expired = ctx.party.expireBuffs(this.absoluteHour);
    }

    const summary = {
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
  wait(hours: number, ctx: any = {}) {
    this.advance(hours);
    if (ctx.party) ctx.party.expireBuffs(this.absoluteHour);
    return { ok: true, hour: this.hour, clock: this.clockString, day: this.day };
  }

  toJSON() {
    return {
      hour: this.hour, day: this.day, absoluteHour: this.absoluteHour,
      havens: Object.fromEntries(Object.keys(this.havenState).map((k) => [k, this.havenState[k].discovered])),
    };
  }

  static fromJSON(data: any, emitter: Emitter | null = null) {
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
    return d;
  }
}

export default DayCycle;

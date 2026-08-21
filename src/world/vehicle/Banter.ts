import { Rng } from '../../util/Rng.ts';
import { BANTER } from './BanterLines.ts';

/**
 * In-car banter: the part of the road trip that is actually the road trip.
 *
 * Two halves. `observe()` watches the world — speed, surface, time of day,
 * weather, fuel, landmarks, combat — and raises a *category*; `trigger()`
 * turns a category into a line, subject to the rules that stop a chatty
 * system becoming an annoying one:
 *
 * - one utterance at a time, with a floor on the gap between them that scales
 *   with how long the last line took to read,
 * - a per-category cooldown, so the same beat cannot fire twice in a minute,
 * - a recency ring per category, so a line never repeats until most of its
 *   siblings have been heard,
 * - priorities, so "we are out of fuel" can interrupt "nice rock",
 * - and replies scheduled as follow-ups, which is what turns four monologues
 *   into a conversation.
 *
 * Output goes out as the `ffxv-banter` window event the subtitle layer already
 * listens for. Nothing here touches the UI directly.
 */

/** Seconds a category must wait before it may fire again. */
const COOLDOWN = {
  depart: 240, straight: 46, fast: 34, slide: 22, offroad: 40, typeD: 120,
  landmark: 34, outpost: 90, weather_rain: 120, weather_storm: 120,
  weather_fog: 120, weather_clear: 150, dusk: 200, night: 52, dawn: 240,
  photo: 70, recipe: 95, scenery: 62, fuel_low: 80, fuel_empty: 45,
  refuel: 30, arrive: 60, after_combat: 30, autodrive: 40, takeover: 40,
  radio: 45, lull: 58,
};

/** Higher wins when two categories want the floor at the same moment. */
const PRIORITY = {
  fuel_empty: 9, arrive: 8, depart: 8, after_combat: 7, takeover: 7,
  autodrive: 7, fuel_low: 6, slide: 6, dusk: 6, typeD: 6, refuel: 6,
  weather_storm: 5, weather_rain: 4, weather_fog: 4, night: 4, dawn: 5,
  landmark: 4, outpost: 4, offroad: 3, fast: 3, radio: 3, photo: 2,
  recipe: 2, scenery: 2, weather_clear: 2, straight: 1, lull: 0,
};

/** Reading time for a line, seconds. */
function readTime(text: any) {
  return Math.max(2.4, Math.min(7.5, 1.5 + text.length * 0.046));
}

export class Banter {
  _busyUntil!: number;
  _catAt!: any;
  _curPriority!: any;
  _lastWho!: any;
  _queue!: any[];
  _recent!: any;
  _state!: any;
  enabled!: boolean;
  gap!: number;
  log!: any[];
  muted!: boolean;
  rng!: Rng;
  t!: number;
  constructor(seed: number = 31337) {
    this.rng = new Rng(seed);
    this.enabled = true;
    /** Seconds of silence required after a line finishes. */
    this.gap = 3.6;
    this.t = 0;
    this._busyUntil = 0;
    this._catAt = {};
    this._recent = {};
    this._queue = [];             // [{ at, who, line }]
    this._lastWho = null;
    /** Everything said this session, newest first — handy for debugging. */
    this.log = [];
    /** Set by the owner so lines can be muted during combat or menus. */
    this.muted = false;
    this._state = {
      phase: null, weather: null, moving: false, fastAt: -1e9,
      straightFor: 0, offroadFor: 0, lastLandmark: null, lull: 0, combat: false,
    };
  }

  /** Wipe cooldowns and the queue — used when a shot restages the world. */
  reset() {
    this._busyUntil = 0;
    this._catAt = {};
    this._queue.length = 0;
    this._state.straightFor = 0;
    this._state.offroadFor = 0;
    this._state.lull = 0;
  }

  /**
   * Say a line from `category`, if the rules allow it.
   * @param category key in BANTER
   * @returns true if something was said
   */
  trigger(category: string, opts: {force?:boolean} = {}): boolean {
    if (!this.enabled || this.muted) return false;
    const pool = BANTER[category];
    if (!pool || !pool.length) return false;

    const force = !!opts.force;
    if (!force) {
      if (this.t < this._busyUntil) {
        // only a clearly more important beat may cut in
        const cur = this._curPriority || 0;
        if ((PRIORITY[category as keyof typeof PRIORITY] || 0) <= cur + 2) return false;
      }
      const last = this._catAt[category];
      if (last != null && this.t - last < (COOLDOWN[category as keyof typeof COOLDOWN] || 60)) return false;
    }

    const idx = this._pick(category, pool.length);
    const entry = pool[idx];
    this._catAt[category] = this.t;
    this._curPriority = PRIORITY[category as keyof typeof PRIORITY] || 0;

    this._queue.length = 0;                  // a new beat cancels a stale reply
    let at = 0;
    this._emit(entry.who, entry.line);
    at += readTime(entry.line);
    if (entry.reply) {
      const d = entry.reply.delay ?? Math.min(at, 3.0);
      this._queue.push({ at: this.t + d, who: entry.reply.who, line: entry.reply.line });
      at = Math.max(at, d + readTime(entry.reply.line));
    }
    if (entry.reply2) {
      const d = entry.reply2.delay ?? at;
      this._queue.push({ at: this.t + d, who: entry.reply2.who, line: entry.reply2.line });
      at = Math.max(at, d + readTime(entry.reply2.line));
    }
    this._busyUntil = this.t + at + this.gap;
    return true;
  }

  /** Uniform pick that avoids anything in the recency ring. */
  _pick(category: any, n: any) {
    let ring = this._recent[category];
    if (!ring) { ring = []; this._recent[category] = ring; }
    const keep = Math.min(n - 1, Math.max(1, Math.floor(n * 0.6)));
    let idx = 0;
    for (let tries = 0; tries < 12; tries++) {
      idx = Math.floor(this.rng.next() * n) % n;
      if (!ring.includes(idx)) break;
    }
    ring.push(idx);
    while (ring.length > keep) ring.shift();
    return idx;
  }

  _emit(who: any, line: any) {
    this._lastWho = who;
    this.log.unshift({ t: +this.t.toFixed(2), who, line });
    if (this.log.length > 40) this.log.pop();
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('ffxv-banter', { detail: { who, line } }));
    }
  }

  /**
   * Advance timers and flush any scheduled replies.
   */
  update(dt: number) {
    this.t += dt;
    for (let i = this._queue.length - 1; i >= 0; i--) {
      if (this._queue[i].at <= this.t) {
        const q = this._queue[i];
        this._queue.splice(i, 1);
        if (!this.muted) this._emit(q.who, q.line);
      }
    }
  }

  /**
   * Watch the world and raise the categories it implies. Called once a frame
   * by the Regalia system; it only ever *proposes* — `trigger` decides.
   *
   * @param {object} ctx
   * */
  observe(dt: number, ctx: { speed: number, driving: boolean, auto: boolean, roadDist: number, offRoadMode: boolean, slide: number, hour: number, weather: string, fuel: number, landmark: {name:string, dist:number, kind?: any } | null }) {
    if (!this.enabled || this.muted) return;
    const st = this._state;

    if (!ctx.driving) { st.lull = 0; return; }

    // --- one-shot state edges ---------------------------------------------
    const phase = ctx.hour >= 5 && ctx.hour < 7 ? 'dawn'
      : ctx.hour >= 17.2 && ctx.hour < 19.4 ? 'dusk'
        : ctx.hour >= 19.4 || ctx.hour < 5 ? 'night' : 'day';
    if (phase !== st.phase) {
      st.phase = phase;
      if (phase === 'dusk') this.trigger('dusk');
      else if (phase === 'night') this.trigger('night');
      else if (phase === 'dawn') this.trigger('dawn');
    } else if (phase === 'night' && this.rng.next() < dt * 0.03) {
      this.trigger('night');
    }

    if (ctx.weather !== st.weather) {
      const was = st.weather;
      st.weather = ctx.weather;
      if (was != null) {
        if (ctx.weather === 'storm') this.trigger('weather_storm');
        else if (ctx.weather === 'rain') this.trigger('weather_rain');
        else if (ctx.weather === 'fog') this.trigger('weather_fog');
        else if (ctx.weather === 'clear') this.trigger('weather_clear');
      }
    }

    // --- driving feel -------------------------------------------------------
    if (ctx.speed > 38) this.trigger('fast');
    if (ctx.slide > 0.5) this.trigger('slide');

    const off = ctx.roadDist > 9;
    st.offroadFor = off ? st.offroadFor + dt : 0;
    if (st.offroadFor > 2.4) {
      this.trigger(ctx.offRoadMode ? 'typeD' : 'offroad');
      st.offroadFor = 0;
    }

    // --- long straight ------------------------------------------------------
    st.straightFor = ctx.speed > 12 && !off ? st.straightFor + dt : 0;
    if (st.straightFor > 22) { this.trigger('straight'); st.straightFor = 0; }

    // --- fuel ---------------------------------------------------------------
    if (ctx.fuel <= 0.001) this.trigger('fuel_empty');
    else if (ctx.fuel < 0.18) this.trigger('fuel_low');

    // --- landmarks ----------------------------------------------------------
    if (ctx.landmark && ctx.landmark.dist < 190 && ctx.landmark.name !== st.lastLandmark) {
      st.lastLandmark = ctx.landmark.name;
      this.trigger(ctx.landmark.kind === 'outpost' ? 'outpost' : 'landmark');
    } else if (ctx.landmark && ctx.landmark.dist > 320) {
      st.lastLandmark = null;
    }

    // --- the quiet stretches ------------------------------------------------
    // Prompto's camera, Ignis' recipes and Gladio's scenery are what fills a
    // road with nothing on it. Rolled against time, not distance, so a slow
    // cruise is not silent.
    st.lull += dt;
    if (this.t > this._busyUntil + 6 && st.lull > 14) {
      st.lull = 0;
      const r = this.rng.next();
      if (r < 0.26) this.trigger('photo');
      else if (r < 0.50) this.trigger('recipe');
      else if (r < 0.74) this.trigger('scenery');
      else this.trigger('lull');
    }
  }
}

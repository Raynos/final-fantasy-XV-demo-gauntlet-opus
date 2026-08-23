import { PLACES, REGION_CARDS } from './Chapters.ts';
import { worldMap } from '../../world/map/WorldMap.ts';
import type { Game } from '../Game.ts';
import type { AreaCard, Place } from './Chapters.ts';
import type { EcoSite } from '../../world/props/EcoSites.ts';
import type { StorySystem } from './StorySystem.ts';

/** A {@link Place} once the world has told us where its site ended up. */
export interface LivePlace extends Place {
  x: number;
  z: number;
}

/** What a fired trigger is handed. Which fields are set depends on `kind`. */
export interface TriggerPayload {
  /** Place id, region id or quest id, depending on the kind. */
  id?: string | null;
  /** The previous value of the same thing, for a crossing. */
  from?: string | null;
  /** `place` only. */
  place?: LivePlace | null;
  /** `region` only. */
  card?: AreaCard;
  /** `hour` only. */
  hour?: number;
  /** `quest` only. */
  quest?: string;
  phase?: string;
  objective?: string;
}

/** A trigger **as authored**: `once` and `fired` are the runtime's business. */
export interface TriggerSpec {
  kind: 'place' | 'region' | 'hour' | 'quest' | 'combat';
  /** Fire at most once. Default true. */
  once?: boolean;
  /** Group label, so `clear(tag)` can retire a chapter's triggers together. */
  tag?: string;
  /** Extra gate, evaluated with the game. */
  require?(game: Game): boolean;
  run?(story: StorySystem, payload: TriggerPayload): void;
  /** Match on the payload's `id`. */
  id?: string;
  /** `quest` only. */
  quest?: string;
  phase?: string;
  objective?: string;
  /** `hour` only: the boundary, and which way it must be crossed. */
  hour?: number;
  rising?: boolean;
}

/** A trigger **as registered**: the runtime's guard is now on it. */
export interface Trigger extends TriggerSpec {
  once: boolean;
  fired: boolean;
}

/** How a matched trigger is run. `StorySystem._fire` is the only implementation. */
export type FireTrigger = (trigger: Trigger, payload: TriggerPayload) => void;

/**
 * World triggers: the layer that notices something has happened and tells the
 * story about it.
 *
 * Five kinds, all evaluated from data so a scene never has to poll:
 *
 * | kind | fires when |
 * |---|---|
 * | `place`  | the player enters a named location's radius |
 * | `region` | the player crosses into a different region |
 * | `hour`   | the world clock crosses an hour boundary in a given direction |
 * | `quest`  | a quest reaches a status, or an objective completes |
 * | `combat` | a fight starts, ends, or is lost |
 *
 * Every trigger carries `once` (default true) and an optional `require`
 * predicate, so gating on chapter or story flags needs no extra machinery.
 */
export class Triggers {
  /** The place table, resolved once against the live site list. */
  _places!: LivePlace[] | null;
  /** Id of the place the player is standing in. */
  place!: string | null;
  region!: string | null;
  /** Hour last seen, for the crossing test. */
  _hour!: number | null;
  _t!: number;
  game!: Game;
  list!: Trigger[];
  constructor(game: Game) {
    this.game = game;
    this.list = [];
    this.place = null;             // id of the place the player is standing in
    this.region = null;
    this._hour = null;
    this._places = null;
    this._t = 0;
  }

  /**
   * @param def `{ kind, ...args, once?, require?, run(ctx) }`
   * @returns the trigger, so callers can disable it later
   */
  add(def: TriggerSpec): Trigger {
    const t: Trigger = { once: true, fired: false, ...def };
    this.list.push(t);
    return t;
  }

  /** Remove every trigger added with a given tag. */
  clear(tag: string | null) {
    if (!tag) { this.list.length = 0; return; }
    this.list = this.list.filter((t) => t.tag !== tag);
  }

  /** Resolve the named-place table against the world's actual site list. */
  places(): LivePlace[] {
    if (this._places) return this._places;
    const props = this.game.get('Props');
    const eco = props && props.ecology;
    this._places = PLACES.map((p) => {
      const site: EcoSite | undefined = eco && eco.sites.find((s: EcoSite) => s.type === p.site);
      return site ? { ...p, x: site.x, z: site.z } : null;
    }).filter((p): p is LivePlace => p != null);
    return this._places;
  }

  /** The place containing a world position, or null. */
  placeAt(pos: { x: number, z: number }): LivePlace | null {
    for (const p of this.places()) {
      if (Math.hypot(pos.x - p.x, pos.z - p.z) <= p.radius) return p;
    }
    return null;
  }

  /**
   * The region a world position belongs to, asked of the map rather than
   * guessed from three thresholds.
   *
   * The thresholds were written for the 3 km world: `z < -640` meant Cleigne.
   * The world is 8 km now, so standing on Cotisse Haven at (962, -712) -- a
   * haven `WorldMap` puts in the Longwythe zone of Leide, 700 m from the car --
   * announced **"CLEIGNE / The Vesperpool Road"** across the screen while the
   * minimap in the corner said LONGWYTHE / LEIDE. Two bits of HUD contradicting
   * each other, in the same frame, about where the player is standing.
   *
   * `worldMap.regionAt` resolves through the same zone ellipses the minimap,
   * the world map screen and the terrain biome blend all read, so the card and
   * the compass cannot disagree again.
   */
  regionAt(pos: { x: number, z: number }) {
    return worldMap.regionAt(pos.x, pos.z)?.id ?? 'leide';
  }

  /**
   * The card a region change shows. Named from the live map -- the region for
   * the headline, the *zone* for the sub-line -- so it says "Leide / Longwythe"
   * where the minimap says LONGWYTHE, falling back to the authored table for a
   * region the map does not know.
   */
  regionCard(id: string, pos: { x: number, z: number }): AreaCard | undefined {
    const region = worldMap.regionAt(pos.x, pos.z);
    const zone = worldMap.zoneAt(pos.x, pos.z);
    if (!region) return REGION_CARDS[id];
    return { name: region.name, sub: zone ? zone.name : region.sub, meta: 'Kingdom of Lucis' };
  }

  /**
   * Poll the world and fire whatever matched.
   */
  update(dt: number, fire: FireTrigger) {
    // 4 Hz is plenty for proximity and far cheaper than every frame; story
    // triggers are not a physics query.
    this._t += dt;
    if (this._t < 0.25) return;
    const dtn = this._t;
    this._t = 0;

    const game = this.game;
    const player = game.get('Player');
    const rpg = game.get('Rpg');
    if (!player) return;
    const pos = player.position;

    // ---- place ------------------------------------------------------------
    const p = this.placeAt(pos);
    const pid = p ? p.id : null;
    if (pid !== this.place) {
      const from = this.place;
      this.place = pid;
      this._match('place', { id: pid, from, place: p }, fire);
    }

    // ---- region -----------------------------------------------------------
    const r = this.regionAt(pos);
    if (r !== this.region) {
      const from = this.region;
      this.region = r;
      this._match('region', { id: r, from, card: this.regionCard(r, pos) }, fire);
    }

    // ---- hour -------------------------------------------------------------
    if (rpg && rpg.day) {
      const h = rpg.day.hour;
      if (this._hour != null && Math.abs(h - this._hour) < 12) {
        for (const t of this.list) {
          if (t.kind !== 'hour' || (t.once && t.fired)) continue;
          if (t.hour == null) continue;
          const crossed = t.rising !== false
            ? (this._hour < t.hour && h >= t.hour)
            : (this._hour > t.hour && h <= t.hour);
          if (crossed && this._allow(t)) { t.fired = true; fire(t, { hour: h }); }
        }
      }
      this._hour = h;
    }
    void dtn;
  }

  /** Push an external event (quest / combat) through the same matcher. */
  notify(kind: TriggerSpec['kind'], payload: TriggerPayload, fire: FireTrigger) { this._match(kind, payload, fire); }

  _match(kind: TriggerSpec['kind'], payload: TriggerPayload, fire: FireTrigger) {
    for (const t of this.list) {
      if (t.kind !== kind || (t.once && t.fired)) continue;
      if (t.id != null && t.id !== payload.id) continue;
      if (t.phase != null && t.phase !== payload.phase) continue;
      if (t.quest != null && t.quest !== payload.quest) continue;
      if (t.objective != null && t.objective !== payload.objective) continue;
      if (!this._allow(t)) continue;
      t.fired = true;
      fire(t, payload);
    }
  }

  _allow(t: Trigger) {
    if (!t.require) return true;
    try { return !!t.require(this.game); } catch { return false; }
  }
}

export default Triggers;

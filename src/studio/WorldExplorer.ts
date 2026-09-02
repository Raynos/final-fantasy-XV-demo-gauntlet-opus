import { worldMap, POI_TYPES, type Poi, type PoiTypeName } from '../world/map/WorldMap.ts';
import { SIGNATURE } from './Signature.ts';
import type { Freecam } from '../dev/Freecam.ts';
import type { Game } from '../game/Game.ts';

/**
 * World Explorer: the real world of the game, flown rather than played.
 *
 * You are not the player here — no character is spawned, controlled or
 * followed, and `CameraRig` is not running, so nothing fights the freecam for
 * the transform. You pick a place, the camera goes there, and you fly.
 *
 * ## The list is curated at the top and complete underneath
 *
 * 139 places sorted alphabetically is a phone book. So the list has three
 * bands: a hand-ordered **Signature** band of the dozen most worth seeing, then
 * **by type** across all 139, then **everything** — zones and landforms.
 *
 * The Signature band is authored, not scored. A "visual interest" heuristic
 * over POI metadata would be a guess dressed as a measurement, and a hand list
 * of twelve is honest, takes ten minutes and is trivially re-ordered when the
 * world changes. @see Signature.ts
 *
 * ## Arriving is a sequence, not a jump
 *
 * The world streams around the camera. Teleporting three kilometres lands you
 * in front of geometry that has not been built, so the first impression of
 * every destination would be a grey field. `arrive()` moves the camera and then
 * reports whether the streamer has caught up, which a shell shows as a hold
 * rather than pretending the frame is finished.
 */

/** One destination, whatever kind of thing it is. */
export interface Place {
  id: string;
  name: string;
  /** Band label a shell groups by. */
  group: string;
  x: number;
  z: number;
  /**
   * How far to stand off, in metres.
   *
   * A zone or a landform is a feature hundreds of metres across and a rest stop
   * is a building, so one number cannot serve both. `DevSuite._warp` learned
   * this the hard way: its comment records that dropping the camera on
   * `cauthess`'s centre puts you inside a mountain-sized meteor.
   */
  back: number;
  /** What you would come here for, where the POI table says. */
  does?: string;
}

export class WorldExplorer {
  game: Game;
  cam: Freecam;
  /** The place last arrived at, for a shell to show as current. */
  at: Place | null;

  constructor(game: Game, cam: Freecam) {
    this.game = game;
    this.cam = cam;
    this.at = null;
  }

  /* --------------------------------------------------------------- listing */

  /**
   * Every destination, in three bands.
   *
   * Built fresh each call rather than cached, for the same reason the Model
   * Explorer counts its registries live: the phone build contains less world,
   * and a list that promises places this build does not have is worse than a
   * shorter one.
   */
  places(): Place[] {
    const out: Place[] = [];
    const byId = new Map<string, Poi>();
    for (const p of worldMap.pois) byId.set(p.id, p);

    // ---- signature, in authored order
    for (const s of SIGNATURE) {
      const p = byId.get(s.id);
      if (!p) continue;                       // absent on this build; say nothing
      out.push({ id: p.id, name: p.name, group: 'Signature', x: p.x, z: p.z, back: s.back, does: s.why });
    }

    // ---- by type, largest families first so the long tail sinks
    const seen = new Set(SIGNATURE.map((s) => s.id));
    const buckets = new Map<PoiTypeName, Poi[]>();
    for (const p of worldMap.pois) {
      const t = p.type as PoiTypeName;
      if (!buckets.has(t)) buckets.set(t, []);
      buckets.get(t)!.push(p);
    }
    const order = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [type, list] of order) {
      const label = POI_TYPES[type]?.label || type;
      for (const p of list) {
        out.push({
          id: p.id,
          name: p.name,
          group: `${label} (${list.length})`,
          x: p.x,
          z: p.z,
          // A settlement wants more room than a haven; both want much less
          // than a zone. 90 m is `_warp`'s POI default and it reads well.
          back: type === 'town' || type === 'imperial' ? 150 : 90,
          does: p.does,
          // The signature entry already covered it, but it belongs in its type
          // band too -- somebody looking under "Landmarks" should find
          // Longwythe Peak there.
        });
      }
    }

    // ---- everything: zones and landforms
    for (const z of worldMap.zones) {
      out.push({ id: z.id, name: z.name || z.id, group: `Zones (${worldMap.zones.length})`, x: z.cx, z: z.cz, back: 900 });
    }
    void seen;
    return out;
  }

  /* -------------------------------------------------------------- arriving */

  /**
   * Put the camera at a place and start flying.
   *
   * Stands **off and above** rather than landing on the point, which is
   * `DevSuite._warp`'s lesson written down: a zone centre is frequently inside
   * whatever landmark defines it.
   */
  arrive(place: Place) {
    const terr = this.game.get('Terrain');
    const h = terr && terr.heightAt ? terr.heightAt(place.x, place.z) : 0;
    this.cam.setEnabled(true, this.game.camera);
    // `jump` rather than a position write: TAA history and the DOF focus
    // integrator both smear across a teleport otherwise, exactly as
    // `CameraRig._cut()` handles for an authored shot change.
    this.cam.jump([place.x, h + place.back * 0.45, place.z + place.back], this.game.post);
    this.cam.lookAt(place.x, h + 10, place.z);
    this.at = place;
  }

  /**
   * Has the world caught up with the camera?
   *
   * `Props` counts how many POI subtrees it has packed against how many it has
   * built, which is a real "is it done" signal rather than a fixed timer — and
   * a fixed timer is the thing that makes a teleport either feel slow or arrive
   * on a grey field, depending on the machine.
   */
  settled(): boolean {
    const props = this.game.get('Props');
    if (!props || !props.poiKits) return true;
    const built = props.poiKits.built ? props.poiKits.built.length : 0;
    return props._poiPacked >= built;
  }

  /** Where the camera is, for a note that has to say *where*. */
  where(): string {
    const p = this.cam.pos;
    return `${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}`;
  }

  /**
   * Metres per second at neutral throttle.
   *
   * A decade rather than a slider: 2 m/s to look at a fence, 400 to cross
   * Leide, and nothing in between is worth a drag gesture on a phone.
   */
  setSpeed(v: number) { this.cam.speed = v; }
  speed(): number { return this.cam.speed; }
}

/** The speed decade, in metres per second. @see WorldExplorer.setSpeed */
export const SPEEDS = [2, 8, 24, 80, 400];

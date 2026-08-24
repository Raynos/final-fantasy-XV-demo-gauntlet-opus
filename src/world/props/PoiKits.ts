import * as THREE from 'three';
import { Rng } from '../../util/Rng.ts';
import { PartBuilder, type Vec3 } from './PartBuilder.ts';
import { worldMap, WORLD, type Poi } from '../map/WorldMap.ts';
import { dressAt, type Dress } from './ZoneDress.ts';
import {
  bag, mergeBag, box, cyl, xform, wallRun, windowUnit, doorUnit, plinth, parapet,
  cornerPier, stringCourse, plantUnit, roofTank, stairHead, bakeTone, toneVariant,
  container, membraneSag, tarpEnvelope, sandbagStack, STOREY, CILL, type Opening,
} from './BuildKit.ts';
import { seatY } from './Seat.ts';
import { gradePad, WearField, desireLine } from './Wear.ts';
import {
  woodMaterial, rustMaterial, glowMaterial, canvasClothMaterial,
  signTexture, imperialTexture, runeTexture,
} from './PropMaterials.ts';
import type { Ecology } from '../veg/Ecology.ts';
import type { Game } from '../../game/Game.ts';

/**
 * Built form for the hundred and twenty-four points of interest of Lucis.
 *
 * Before this file the map had 124 named places and almost no geometry at any
 * of them: arriving at the Tomb of the Wise or Wiz Chocobo Post put you on the
 * same bare hillside you had just walked across, with a marker on the compass
 * and nothing to look at. A place has to be *built* before it can be a place.
 *
 * The trade taken here is a strong **per-type kit** rather than 124 unique
 * builds: every royal tomb is the same columned mausoleum, every imperial base
 * the same walled magitek compound — but seeded off its own id, so the column
 * count, the wall breaches, the container layout and the wear differ, and
 * tinted by {@link dressAt} so a Leide tomb is ochre limestone and a Cleigne
 * one is cold grey. That is how the real game does it too.
 *
 * Everything is **streamed and lazy**: a POI is built the first time the
 * camera comes within `BUILD_R`, at one POI per frame, and its group is hidden
 * beyond `DRAW_R`. Building all 124 up front cost 1.4 s of merge work and
 * several hundred permanently resident draw calls for structures a thousand
 * metres behind the player.
 */

const BUILD_R = 1500;
/**
 * How far each kit is worth drawing.
 *
 * A parking bay at a kilometre is four pixels of grey and eight draw calls; a
 * royal tomb or a chimney stack at the same range is the thing that tells you
 * a place exists. So the draw radius is per type, not global — that one change
 * is worth about seventy draw calls in a wide zone shot.
 */
const DRAW_BY_TYPE = {
  town: 2400, imperial: 1700, tomb: 1300, landmark: 1500, outpost: 900,
  reststop: 900, chocobo: 800, menace: 700, dungeon: 750, haven: 800,
  fishing: 650, parking: 600,
};
const DRAW_R = 900;
/**
 * The range at which each kind's **base** is read against the ground.
 *
 * Not the same number as `DRAW_BY_TYPE` and that is the whole point.
 * `handoff/modeling.md` paid for this one already: *"a cull distance for `Seat`
 * is the range at which the object's BASE is read against the ground, not the
 * range at which the object is visible... seating a haven at 1200 m to protect
 * a silhouette nobody can resolve sinks it at the range a player camps on it."*
 * `_base` was still being handed the draw distance, so a landmark on a summit
 * was seated on the clipmap's lower envelope at **1500 m** -- and a coarse ring
 * chord cuts tens of metres under a sharp peak. `floatcheck` read
 * `longwythe_peak` as 38.82 m into the ground with a 4.6 m stele on it.
 *
 * A tomb is a landmark at a kilometre and a room at ten metres; it is seated
 * for the ten.
 */
const SEAT_BY_TYPE: Record<string, number> = {
  town: 600, imperial: 500, tomb: 400, landmark: 400, outpost: 300,
  reststop: 300, chocobo: 350, menace: 350, dungeon: 350, haven: 300,
  fishing: 250, parking: 250,
};
const SEAT_R = 300;
/**
 * The range a kit with **no earthwork under it** is seated at.
 *
 * `SEAT_BY_TYPE` is the right answer for a compound that stands on a graded
 * pad: the pad's batter reaches down to whatever the ground turns out to be, so
 * the deck can afford to be read against a coarse-ring envelope and be a little
 * proud or a little sunk. A waymark stele has no pad. Its base course is the
 * only thing that meets the earth, at one point, and it is read at the range a
 * person walks up to it — so it is seated against the **finest ring alone**.
 *
 * 120 m is not a taste: `clipSpacingForDistance` returns `cell0` for anything
 * under `2 * n * cell0` = 144 m, so any value below that reads exactly the
 * 1.5 m lattice the player is standing on and no coarser ring at all.
 *
 * **The trade this makes, stated because it is real and cannot be avoided
 * here.** Seating on the fine ring means that at 400 m — where the ground under
 * a peak is drawn by the 6 m ring — the stele stays where it is while the
 * summit sags beneath it. At `longwythe_peak` that sag is measured at **17.5 m**
 * (`heightAt` 444.24, 1.5 m ring 440.49, 6 m ring 423.02). Seating on the
 * coarse envelope instead is what put a 4.6 m stele 18.81 m *inside* the hill
 * you can walk to. Total invisibility up close is worse than a sliver of sky at
 * a quarter kilometre, so this takes the near read — and the sag itself is a
 * terrain-LOD defect on the region's signature summit, requested of the terrain
 * lane in `project/handoff/seating.md` rather than papered over here.
 */
const BARE_SEAT_R = 120;
/**
 * Does this site build its own earthwork, or does it meet the ground bare?
 *
 * `KitResult.noApron` records the same fact and **is returned too late to use**
 * — `_base` has to run before the kit does, because `_apron` grades against the
 * deck it produces. So the two no-apron kits are named here, and the flag stays
 * where it is as the kit's own assertion of the same thing.
 *
 * `_fishing` is deliberately NOT in this list: its deck is set from the sea, not
 * from the ground (`max(1.4, seaLevel + 1.5 - base)`), and its piles run 3.4 m
 * below that, so it seats itself and a tighter base would only move the jetty.
 */
function seatsBare(p: Poi): boolean {
  return p.type === 'landmark' && !/lighthouse/.test(p.id);
}
/** Types the rest of the codebase already builds; we must not double up. */
const SKIP_IDS = new Set(['hammerhead']);

const _v = new THREE.Vector3();

function mat4(pos: Vec3, rot: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
    new THREE.Vector3(scale[0], scale[1], scale[2])
  );
}

/**
 * Flat-coloured PBR material — no map, so it cannot stretch.
 *
 * `vertexColors` is on for all of them and it is what makes flat acceptable.
 * These materials are deliberately mapless above a couple of metres (see
 * {@link poiMaterials}), which used to mean thirty-five buildings drawn from
 * four literal colours. `BuildKit.bakeTone` multiplies in a per-vertex tone --
 * grime at the splash zone, bleach at the parapet, a per-object value and
 * warmth jitter, and a pale lift on every chamfer facet -- so the same four
 * colours carry as much variation as a texture would, and cost one byte-free
 * attribute rather than a sampler. `PartBuilder` synthesises white for any
 * piece that does not bake one, so nothing here can draw black.
 */
function plain(hex: number, rough = 0.85, metal = 0) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, vertexColors: true });
}

/*
 * `roughBox` used to live here: a `BoxGeometry` with 3% Gaussian vertex noise,
 * which was the seven remaining kits' idea of "cut stone". It is gone because
 * nothing calls it any more -- every one of those kits now builds through
 * `BuildKit`, whose chamfered box carries the arris the noise was standing in
 * for. Jitter on a box's vertices moves its corners; it does not give it any.
 */

/**
 * The three things every kit builder is handed, named.
 *
 * `B` accumulates the geometry, `site` is the place being built and `ctx` is
 * everything about *where* it is being built that the kit did not work out for
 * itself. Splitting `ctx` out of the site is what lets {@link PoiKits._make} do
 * the seeded, terrain-reading work once for all twelve kits.
 */
export interface KitCtx {
  /** Seeded off the POI id, so a kit varies between places but never between runs. */
  rng: Rng;
  /** The zone dressing recipe here — stone size, tint, litter. */
  dress: Dress;
  /** Facing, radians: down the nearest road if there is one, else seeded. */
  yaw: number;
  /** Deck height the group is placed at; kits that reach the sea need it. */
  base: number;
}

/**
 * What a kit reports back about what it built. Everything is optional because
 * most kits want the defaults; {@link PoiKits._make} is where they resolve.
 */
export interface KitResult {
  /** `false` to never cast shadows. Default `true`. */
  cast?: boolean;
  /** Footprint radius in metres. Default 20. */
  r?: number;
  /**
   * The kit laid its own ground and wants no apron.
   *
   * **Nothing reads this.** Each kit calls {@link PoiKits._apron} for itself,
   * so the flag only records which two kits (`_fishing`, and `_landmark` off
   * the lighthouse branch) deliberately skip it. Left in place because it is
   * true; do not add a consumer without checking those two still want it.
   */
  noApron?: boolean;
}

/** A kit builder. Invoked with `this` bound to the {@link PoiKits} instance. */
export type KitFn = (this: PoiKits, B: PartBuilder, site: PoiSite, ctx: KitCtx) => KitResult;

/**
 * A POI the streamer knows about but has not built yet.
 *
 * `group` is the flag: `null` means "still queued", and it is set exactly once
 * — to an empty group for a site another system already owns.
 */
export interface PoiSite {
  poi: Poi;
  fn: KitFn;
  /**
   * The POI's ground-plane position. Write-only today: `update` measures
   * distance off `poi.x`/`poi.z` directly rather than through this.
   */
  pos: THREE.Vector3;
  group: THREE.Group | null;
}

/**
 * The same site once {@link PoiKits._make} has run it: its group is in the
 * scene and the per-type draw and shadow budgets are resolved.
 *
 * This is the map's own `PoiSpec`/`Poi` split applied to the streamer's queue.
 * `update` reads `draw` and `canCast` for every built site every frame and must
 * never have to guard them, so they are required here and absent above rather
 * than optional on one type that means both things.
 */
export interface BuiltSite extends PoiSite {
  group: THREE.Group;
  canCast: boolean;
  /** Footprint radius the kit reported. Write-only today — nothing reads it. */
  radius: number;
  /** Beyond this range the group is hidden outright. */
  draw: number;
  /** Whether the group is currently casting; unset until the first test. */
  casting?: boolean;
}

/**
 * The shared material set, built once by {@link PoiKits.build}.
 *
 * A function rather than an object literal inside the class so that
 * {@link PoiMats} is the set itself, and a kit that wants a new colour cannot
 * drift from a hand-maintained parallel interface.
 */
export function poiMaterials() {
  return {
    // Anything bigger than a couple of metres gets a *plain* material.
    // PropMaterials' concrete and enamel maps are authored for a 1 m part
    // and every primitive here carries 0..1 box UVs, so on a fourteen metre
    // wall the paint-chip noise stretches into metre-wide grey blotches —
    // which is what made the first pass of Lestallum look like granite
    // chippings. Flat colour at that scale reads far better.
    stone: plain(0x968a76, 0.93),
    dark: plain(0x6b6357, 0.94),
    concrete: plain(0x8d8779, 0.9),
    ground: plain(0x796450, 0.96),
    gravel: plain(0x796f5f, 0.95),
    roof: plain(0x4b5058, 0.72, 0.3),
    wall: plain(0xa2957e, 0.82),
    wall2: plain(0x7b7160, 0.84),
    // Four more renders, and the point of them is that they are not four more
    // greys. The kit's whole wall palette was `a2957e / 7b7160 / 8d8779 /
    // 968a76` -- one hue, one value, four names -- so a settlement read as one
    // flat colour no matter how many buildings it had. These are a Lucian
    // hill-town palette: limewashed ochre, sun-bleached sand, an oxide render
    // and a cool grey-green, far enough apart in hue that two neighbours are
    // visibly different buildings rather than the same building twice.
    render1: plain(0xb08a5c, 0.86),
    render2: plain(0xc3b393, 0.84),
    render3: plain(0x9a6f5e, 0.87),
    render4: plain(0x7d8478, 0.85),
    /** Painted joinery: architraves, copings, window frames. */
    joinery: plain(0xb6a98f, 0.74),
    wood: woodMaterial(0x7d674c),
    plank: woodMaterial(0x5d4c39),
    rust: Object.assign(rustMaterial(0x8f5c39, 0.5), { side: THREE.DoubleSide }),
    steel: plain(0x8f959b, 0.48, 0.7),
    cream: plain(0xc8bfa6, 0.7),
    red: plain(0x8f3a2c, 0.68, 0.1),
    magitek: plain(0x3a4048, 0.62, 0.45),
    cloth: canvasClothMaterial(0x3d4148),
    // Glass, and it is deliberately not black. A pane lit only by the sky, with
    // a 0.06 roughness and nothing behind it, renders as a hole -- which is how
    // the first pass drew every unlit window on a shaded elevation. Dusty glass
    // with a real base value reads as a window at every sun angle, and the
    // reveal's own shadow is still the darkest thing in the opening.
    glass: new THREE.MeshStandardMaterial({ color: 0x4b5560, roughness: 0.3, metalness: 0.3 }),
    lamp: glowMaterial(0xffe6b4, 0.5, 0x141310),
    rune: glowMaterial(0x8fd8ff, 1.4, 0x0b1620),
    arcane: glowMaterial(0xa878ff, 1.2, 0x140b20),
    hot: glowMaterial(0xff5a20, 1.4, 0x1a0703),
    void: new THREE.MeshBasicMaterial({ color: 0x05070a }),
    // The card behind a pane. Not `void`: an unlit 0x05070a quad reads as a
    // hole punched through the world rather than as a room, and a window that
    // is a hole is the same defect as a window that is a decal. A dark warm
    // grey that takes ambient sits a stop or two under the wall and lets the
    // reveal's own shadow still be the darkest thing in the opening.
    interior: plain(0x211f1c, 0.97),
    runeface: new THREE.MeshStandardMaterial({
      map: runeTexture(), transparent: true, roughness: 0.7, metalness: 0,
      emissive: 0x2a5f8a, emissiveIntensity: 0.6, side: THREE.DoubleSide,
    }),
    banner: new THREE.MeshStandardMaterial({
      map: imperialTexture(), roughness: 0.8, metalness: 0, side: THREE.DoubleSide,
    }),
    sign: new THREE.MeshStandardMaterial({
      map: signTexture(0), roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide,
    }),
  };
}

/** Every material a POI kit can ask for. */
export type PoiMats = ReturnType<typeof poiMaterials>;

export class PoiKits {
  built!: BuiltSite[];
  _exclusions!: { x: number; z: number; r: number; sameOnly: string | null }[] | null;
  /**
   * Where the pad being built right now is, in world metres.
   *
   * The kits build in a *local* frame and never see their own world position,
   * but {@link gradePad} has to read the terrain, which only exists in world
   * coordinates. Rather than thread four more arguments through twelve kit
   * signatures — every one of which would then be free to disagree with
   * `_make` about which position it meant — `_make` publishes the answer once,
   * immediately before it calls the kit.
   */
  _padCtx!: { x: number; z: number; base: number; cull: number };
  /** Cut and fill the last pad measured, cubic metres. Read by `--debug`. */
  _padStats!: { fill: number; cut: number; toe: number } | null;
  eco!: Ecology;
  mats!: PoiMats;
  quality!: number;
  root!: THREE.Group;
  scene!: THREE.Scene;
  sites!: PoiSite[];
  constructor(eco: import('../veg/Ecology.ts').Ecology, scene: THREE.Scene, { quality = 1 }: {quality?:number} = {}) {
    this.eco = eco;
    this.scene = scene;
    this.quality = quality;
    this.root = new THREE.Group();
    this.root.name = 'poi_kits';
    this.scene.add(this.root);
    this.sites = [];
    this.built = [];
    this._exclusions = null;
    this._padCtx = { x: 0, z: 0, base: 0, cull: DRAW_R };
    this._padStats = null;
  }

  build() {
    const M = this.mats = poiMaterials();
    for (const [k, m] of Object.entries(M)) if (!m.name) m.name = `poi_${k}`;

    const kits: Record<string, KitFn> = {
      haven: this._haven, parking: this._parking, reststop: this._restStop,
      outpost: this._outpost, town: this._town, tomb: this._tomb,
      imperial: this._imperial, chocobo: this._chocobo, fishing: this._fishing,
      landmark: this._landmark, menace: this._menace, dungeon: this._dungeon,
    };
    for (const p of worldMap.pois) {
      if (SKIP_IDS.has(p.id)) continue;
      const fn = kits[p.type];
      if (!fn) continue;
      this.sites.push({ poi: p, fn, pos: new THREE.Vector3(p.x, 0, p.z), group: null });
    }
    // nearest-to-spawn first so the opening view is already furnished
    this.sites.sort((a, b) => Math.hypot(a.poi.x, a.poi.z) - Math.hypot(b.poi.x, b.poi.z));
  }

  // ------------------------------------------------------------- placement

  /**
   * Deck height for a structure with a footprint of radius `r`.
   *
   * The naive answer — the lowest ground under the footprint — buries a forty
   * metre compound twenty metres deep the moment it lands on a hillside, which
   * is exactly how six of these kits went missing the first time round. So the
   * deck sits at the ring *average*, is never allowed more than `drop` metres
   * below the point the map actually names, and the skirt in {@link _apron}
   * covers whatever gap is left on the downhill side.
   */
  _base(x: number, z: number, r: number, drop = 2.2, cull = DRAW_R) {
    // `seatY`, the LOWER envelope, and this is not a free choice. The first
    // version of this rewrite used `coverY` on the reasoning that a pad *is*
    // the ground -- true of the apron, false of the compound standing on it.
    // `coverY` is the highest any ring will draw the point, and for a tomb with
    // a 1300 m cull that ring is very coarse indeed, so the deck came out
    // metres above the surface the player is standing on: `floatcheck` found
    // **13 POI compounds entirely in the air**, `tomb_rogue` by 8.64 m. The
    // apron's own visibility is `gradePad`'s problem and it solves it with
    // geometry that reaches down to the ground, not by lifting the deck.
    const h0 = seatY(this.eco, x, z, r, cull);
    // A grid over the footprint, not a ring: a hummock in the middle of a
    // compound is invisible to a ring of probes and is exactly what punches
    // through the deck. Hammerhead's `_padHeight` already learned this and
    // takes the 98.5th percentile of an 11x11 grid for the same reason -- "the
    // basin's own relief punches humps of scrub straight up through the
    // forecourt". The POI kits took a ring average and a `Math.min`, so
    // `poi_costlemark_menace` came back with a green mound standing in the
    // middle of its own sealed court (`tmp/shots/kits-r10/`).
    const hs: number[] = [];
    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        const d = Math.hypot(i, j) / 3;
        if (d > 1.02) continue;
        hs.push(seatY(this.eco, x + (i / 3) * r, z + (j / 3) * r, r, cull));
      }
    }
    hs.sort((a, b) => a - b);
    // The 88th percentile rather than the maximum: one boulder inside the
    // footprint must not lift the whole settlement onto a plinth, and the
    // batter carries whatever is left over.
    const hi = hs[Math.min(hs.length - 1, Math.floor((hs.length - 1) * 0.88))];
    // Still bounded against the point the map actually names, in both
    // directions -- a deck three metres over the named spot is a plateau.
    return Math.max(Math.min(hi, h0 + 3.2), h0 - drop);
  }

  /**
   * The engineered platform a place stands on.
   *
   * This was a faceted drum — a cylinder with a batter and 7% radius jitter —
   * and it was the "cake stand" the last two handoffs named and neither fixed.
   * A drum has a **bottom edge**: a hard horizontal line all the way round
   * where the extrusion stops, floating over the hill on its downhill side and
   * buried on its uphill side, in one value, at one radius. Read
   * `tmp/shots/kits-r0b/poi_alstor_haven.png` for what that is — a cream disc
   * standing a metre and a half proud of the grass on a vertical skirt.
   *
   * {@link gradePad} replaces it with a real cut-and-fill earthwork: level
   * deck, 1:3 fill batter, 1:1.5 cut batter, a 1:9 ramp down the road bearing,
   * spoil berms riding the crest isoline, a wobbled outline, and an outer ring
   * pushed under the *drawn* terrain so the fill emerges from the ground
   * instead of ending on a line. It measures its own cut and fill, so the
   * spoil that appears is the spoil the cut produced.
   *
   * Wear rides in on the same geometry: desire lines walked between the
   * approach and the centre, encoded as a **distance ramp** rather than a mask
   * — see {@link WearField.sampleInto} for why that distinction is the whole
   * item, and why the aprons carry it in vertex colour rather than a texture.
   *
   * @param depth kept for call-site compatibility; the batter measures its own
   *              depth against the ground and this is no longer read.
   */
  _apron(B: PartBuilder, r: number, depth: number, seed: number, mat?: THREE.Material, o: {
    yaw?: number | null; wear?: number[][];
  } = {}) {
    const M = this.mats;
    const rng = new Rng(seed);
    const ctx = this._padCtx;
    const pad = gradePad({
      eco: this.eco,
      x: ctx.x, z: ctx.z, base: ctx.base, r, seed, cull: ctx.cull,
      // `_yaw` is a `atan2(dx, dz)` heading; the pad works in the standard
      // `atan2(z, x)` bearing its polar grid is built on. One conversion here
      // rather than a second convention in `Wear.ts`.
      rampYaw: o.yaw == null ? null : Math.PI / 2 - o.yaw,
    });
    this._padStats = { fill: Math.round(pad.fill), cut: Math.round(pad.cut), toe: +pad.toe.toFixed(1) };

    // Desire lines. People walk between the things a place has, so wear runs
    // from the pad edge on the approach side into the centre, plus whatever the
    // kit named; the disc at the middle is the standing-about patch.
    // Sized to the deck, not to the toe: people wear the *platform*, and a
    // field that covered the batter as well would put footpaths up a 1:3
    // embankment nobody walks on.
    const field = new WearField(0, 0, r * 1.06);
    const entry = o.yaw == null ? rng.range(0, 6.28) : Math.PI / 2 - o.yaw;
    field.addLine({
      pts: desireLine(Math.cos(entry) * r, Math.sin(entry) * r, 0, 0, rng, 0.06),
      half: 0.8,
    });
    field.addDisc(0, 0, Math.max(1.6, r * 0.15), 0.85);
    for (const w of o.wear || []) {
      field.addLine({ pts: desireLine(0, 0, w[0], w[1], rng, 0.09), half: w[2] ?? 0.7 });
    }
    field.sampleInto(pad.geo, 0.3);

    B.add(mat || M.ground, pad.geo, null);

    // The spoil the cut produced, as real stone standing on the berm the pad
    // measured — not a decorative ring at a fixed radius, which is what the
    // drum had and why it read as a garnish rather than as earthworks.
    for (const sp of pad.spoil) {
      const sc = sp[2] * rng.range(0.7, 1.25);
      B.add(M.dark, new THREE.DodecahedronGeometry(sc, 0),
        mat4([sp[0] + rng.gauss(0, 0.5), -sc * rng.range(0.2, 0.5), sp[1] + rng.gauss(0, 0.5)],
          [rng.gauss(0, 0.5), rng.next() * 6, rng.gauss(0, 0.5)],
          [1, rng.range(0.5, 0.85), 1]));
    }
    void depth;
  }

  /** Which way the structure faces: down the nearest road, else seeded. */
  _yaw(p: Poi, rng: Rng) {
    const road = this.eco.terrain && this.eco.terrain.map && this.eco.terrain.map.roadGraph;
    if (road) {
      let bestD = 90, bestA: number | null = null;
      for (const e of road.edges) {
        for (let i = 0; i < e.pts.length; i += 4) {
          const q = e.pts[i];
          const d = Math.hypot(q.x - p.x, q.z - p.z);
          if (d < bestD) { bestD = d; bestA = Math.atan2(p.x - q.x, p.z - q.z); }
        }
      }
      if (bestA !== null) return bestA;
    }
    return rng.next() * Math.PI * 2;
  }

  // ----------------------------------------------------------------- kits

  /**
   * A haven: the rune-marked camp rock, and the place a player spends more
   * hours looking at than any other POI in the game.
   *
   * It was a cream cylinder with 5% radius jitter standing 1.5 m proud of the
   * grass, a ring of white boulders round its foot, and a three-sided prism for
   * a tent (`tmp/shots/kits-r0b/poi_alstor_haven.png`). Three fixes, in the
   * order they matter:
   *
   * - **The shelf is a rock, so it is broken.** A cylinder has one radius and
   *   one top; this has a wobbled plan, a battered flank, a chamfered nosing
   *   where the rune plate meets it, and a scatter of blocks that are *part of*
   *   the shelf rather than a garnish round it.
   * - **The tent is solved, not authored** ({@link membraneSag}): a ridge line
   *   and four guy points, Jacobi-relaxed twice and rescaled so the sag is the
   *   number asked for. That is what puts a cusp at every peg and a swag
   *   between them, which no product of cosines can do.
   * - **Camp furniture**, because a camp is people: a tarp over the stores
   *   ({@link tarpEnvelope}, whose `max` gives it real ridge lines), a folding
   *   chair each, a cook pot on the fire and a bedroll.
   */
  _haven(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, dress } = ctx;
    const r = 9.6;
    const lift = 1.55;
    // The apron is *dirt*, the shelf is *rock*. Both were `M.stone` and the
    // whole camp came back one sand colour with the shelf invisible inside its
    // own earthwork (`tmp/shots/kits-r8/poi_alstor_haven.png`).
    this._apron(B, r + 3, 9.5, s.poi.id.length * 7 + 1, undefined, {
      yaw: ctx.yaw,
      // The three things anyone at a haven walks between: the fire, the tent
      // and the lamp post. Wear follows people, not a pattern.
      wear: [[-r * 0.42, r * 0.3, 0.6], [r * 0.7, -r * 0.35, 0.5]],
    });

    // The shelf. Two courses of wobbled plate with a batter between them, so
    // the edge is a *nosing over a shadow* rather than one extruded rim.
    const shelf = (rad: number, h: number, y: number, wob: number) => {
      const g = new THREE.CylinderGeometry(rad, rad * 1.06, h, 17, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const a = Math.atan2(p.getZ(i), p.getX(i));
        const k = 1 + Math.sin(a * 3.0 + 1.1) * wob + Math.sin(a * 7.0 - 0.4) * wob * 0.45;
        p.setX(i, p.getX(i) * k);
        p.setZ(i, p.getZ(i) * k);
      }
      g.computeVertexNormals();
      // Darker than the ground it stands on, not paler: a haven is a slab of
      // weathered basalt with light in the glyphs, and a shelf lighter than its
      // own apron reads as a sandpit.
      bakeTone(g, { y0: y - h, y1: y + h, grime: 0.52, bleach: 0.78, jitter: 1, streak: 0.14 });
      B.add(M.stone, g, mat4([0, y, 0]));
    };
    shelf(r * 1.03, 1.15, lift - 0.7, 0.055);
    shelf(r * 0.94, 0.5, lift - 0.02, 0.035);
    const deck = lift + 0.24;

    // glyph ring, flat on the deck
    const ring = new THREE.RingGeometry(r * 0.42, r * 0.84, 44);
    ring.rotateX(-Math.PI / 2);
    B.add(M.runeface, ring, mat4([0, deck + 0.02, 0]));
    const inner = new THREE.RingGeometry(r * 0.17, r * 0.28, 30);
    inner.rotateX(-Math.PI / 2);
    B.add(M.rune, inner, mat4([0, deck + 0.03, 0]));

    // Fire: a ring of set stones, an ash bed, embers and a pot on a tripod.
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + rng.gauss(0, 0.12);
      B.add(M.dark, new THREE.DodecahedronGeometry(0.24 * rng.range(0.7, 1.35), 0),
        mat4([Math.cos(a) * 1.2, deck + 0.08, Math.sin(a) * 1.2], [rng.next(), rng.next(), 0]));
    }
    B.add(M.dark, new THREE.CircleGeometry(1.05, 16).rotateX(-Math.PI / 2), mat4([0, deck + 0.02, 0]));
    B.add(M.hot, new THREE.CircleGeometry(0.82, 14).rotateX(-Math.PI / 2), mat4([0, deck + 0.05, 0]));
    for (let i = 0; i < 5; i++) {
      const a = rng.next() * 6.28;
      B.add(M.plank, new THREE.CylinderGeometry(0.055, 0.075, 1.35, 5).rotateZ(1.15),
        mat4([Math.cos(a) * 0.38, deck + 0.26, Math.sin(a) * 0.38], [0, a, 0]));
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      B.add(M.steel, new THREE.CylinderGeometry(0.02, 0.02, 1.5, 4),
        mat4([Math.cos(a) * 0.42, deck + 0.72, Math.sin(a) * 0.42],
          [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]));
    }
    B.add(M.dark, new THREE.CylinderGeometry(0.24, 0.18, 0.3, 10), mat4([0, deck + 1.05, 0]));

    // The tent: solved, not authored. Pinned along the ridge and at four guy
    // points, so it cusps at the pegs and swags between them.
    {
      const tx = -r * 0.44, tz = r * 0.30, tw = 2.4, td = 3.2, th = 1.75;
      const yaw = rng.range(0, Math.PI * 2);
      const skin = membraneSag({
        w: tw, d: td, sag: 0.14, nx: 12, nz: 14,
        // The ridge is the centre line; the four corners are pegged down.
        pin: (u, v) => Math.abs(u - 0.5) < 0.045 || ((u < 0.06 || u > 0.94) && (v < 0.09 || v > 0.91)),
      });
      // Lift the ridge and drop the eaves: the relaxation gives the *shape*,
      // the A-frame gives the section it hangs on.
      const pp = skin.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        const u = pp.getX(i) / tw + 0.5;
        pp.setY(i, pp.getY(i) + th * (1 - Math.abs(u - 0.5) * 2) * 0.94);
      }
      skin.computeVertexNormals();
      B.add(M.cloth, skin, mat4([tx, deck + 0.1, tz], [0, yaw, 0]));
      for (const sz of [-1, 1]) {
        B.add(M.plank, new THREE.CylinderGeometry(0.035, 0.045, th + 0.3, 5),
          mat4([tx - Math.sin(yaw) * sz * td * 0.48, deck + (th + 0.3) / 2, tz - Math.cos(yaw) * sz * td * 0.48]));
      }
      // Guy lines: four thin diagonals to pegs, which is most of what says tent.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const ox = sx * tw * 0.52, oz = sz * td * 0.52;
        const wx = tx + ox * Math.cos(yaw) + oz * Math.sin(yaw);
        const wz = tz - ox * Math.sin(yaw) + oz * Math.cos(yaw);
        B.add(M.steel, new THREE.CylinderGeometry(0.012, 0.012, 0.9, 4),
          mat4([(wx + tx * 0.15) * 0.92, deck + 0.5, (wz + tz * 0.15) * 0.92], [sz * 0.5, -yaw, sx * 0.45]));
      }
    }

    // A tarp over the camp stores. The `max` envelope is what makes this read
    // as three crates under a sheet rather than as a mound.
    {
      const lumps = [
        { x: -0.55, z: -0.2, w: 0.85, d: 0.62, h: 0.55 },
        { x: 0.35, z: 0.18, w: 0.7, d: 0.7, h: 0.42 },
        { x: 0.45, z: -0.45, w: 0.5, d: 0.5, h: 0.66 },
      ];
      const tarp = tarpEnvelope({ w: 2.6, d: 2.2, lumps, drape: 0.05, skirt: 0.22 });
      B.add(M.cloth, tarp, mat4([r * 0.36, deck + 0.02, r * 0.42], [0, rng.range(0, 3), 0]));
    }

    // Two camp chairs and a bedroll: the camp is people, not a magic circle.
    for (let i = 0; i < 2; i++) {
      const a = 2.1 + i * 0.9;
      const cx = Math.cos(a) * 2.4, cz = Math.sin(a) * 2.4;
      B.add(M.cloth, box(0.5, 0.05, 0.46, { sharp: true }), mat4([cx, deck + 0.42, cz], [0, -a, 0]));
      B.add(M.cloth, box(0.5, 0.44, 0.05, { sharp: true }), mat4([cx, deck + 0.64, cz], [0.18, -a, 0]));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        B.add(M.steel, new THREE.CylinderGeometry(0.014, 0.014, 0.42, 4),
          mat4([cx + sx * 0.2 * Math.cos(a), deck + 0.21, cz + sz * 0.2], [sz * 0.14, -a, sx * 0.14]));
      }
    }
    B.add(M.cloth, new THREE.CylinderGeometry(0.22, 0.22, 1.7, 8).rotateZ(Math.PI / 2),
      mat4([-r * 0.2, deck + 0.22, r * 0.5], [0, rng.range(0, 3), 0]));

    // Seating boulders, cut from the shelf, and the lantern pole.
    for (let i = 0; i < 6; i++) {
      const a = rng.next() * 6.28, d = r * rng.range(0.55, 0.9);
      const sc = rng.range(0.55, 1.3) * dress.rockS;
      B.add(M.stone, new THREE.DodecahedronGeometry(sc, 0),
        mat4([Math.cos(a) * d, deck + sc * 0.28, Math.sin(a) * d],
          [rng.gauss(0, 0.3), rng.next() * 6, rng.gauss(0, 0.3)]));
    }
    B.add(M.steel, new THREE.CylinderGeometry(0.05, 0.06, 2.6, 6), mat4([r * 0.7, deck + 1.3, -r * 0.35]));
    B.add(M.steel, box(0.2, 0.06, 0.2), mat4([r * 0.7, deck + 2.63, -r * 0.35]));
    B.add(M.lamp, box(0.24, 0.32, 0.24, { sharp: true }), mat4([r * 0.7, deck + 2.44, -r * 0.35]));
    // A boulder pile against one flank so the shelf grows out of the hill.
    for (let i = 0; i < 8; i++) {
      const a = rng.range(2.0, 4.2), d = r * rng.range(1.0, 1.4);
      const sc = rng.range(0.9, 2.6) * dress.rockS;
      B.add(M.stone, new THREE.DodecahedronGeometry(sc, 0),
        mat4([Math.cos(a) * d, -0.2 + sc * 0.2, Math.sin(a) * d],
          [rng.gauss(0, 0.4), rng.next() * 6, rng.gauss(0, 0.4)]));
    }
    return { cast: true, r: r + 4 };
  }

  /** A gravel pull-in: apron, wheel stops, a barrier on the drop side, signs. */
  _parking(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const w = 22, d = 13;
    const world = mat4([0, 0, 0], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 13.5, 6.0, 91, M.gravel, { yaw, wear: [[w * 0.42, d * 0.34, 0.7]] });
    // bay markings as thin raised strips: paint on a procedural world is a
    // texture we would have to author, geometry is free and reads the same
    for (let i = -2; i <= 2; i++) {
      put(M.cream, new THREE.BoxGeometry(0.16, 0.04, d * 0.62), [i * 3.4, 0.27, -d * 0.12]);
    }
    for (let i = -3; i <= 3; i++) {
      put(M.gravel, new THREE.BoxGeometry(1.5, 0.22, 0.3), [i * 3.0, 0.36, d * 0.34]);
    }
    // post-and-rope barrier along the outer edge
    for (let i = -4; i <= 4; i++) {
      put(M.plank, new THREE.CylinderGeometry(0.08, 0.09, 1.0, 6), [i * 2.6, 0.72, -d * 0.5]);
      if (i < 4) put(M.plank, new THREE.BoxGeometry(2.6, 0.09, 0.06), [i * 2.6 + 1.3, 1.05, -d * 0.5]);
    }
    // signpost, bin, and a battered vending machine at half of them
    put(M.steel, new THREE.CylinderGeometry(0.06, 0.07, 2.5, 6), [w * 0.42, 1.25, d * 0.34]);
    put(M.sign, new THREE.PlaneGeometry(1.5, 0.72), [w * 0.42, 2.35, d * 0.34], [0, 0, 0]);
    put(M.rust, new THREE.CylinderGeometry(0.32, 0.28, 0.9, 10), [w * 0.33, 0.6, d * 0.2]);
    if (rng.next() < 0.55) {
      put(M.red, new THREE.BoxGeometry(0.9, 1.9, 0.7), [-w * 0.42, 1.1, d * 0.28]);
      put(M.lamp, new THREE.BoxGeometry(0.72, 1.2, 0.05), [-w * 0.42, 1.35, d * 0.64]);
    }
    return { cast: true, r: 15 };
  }

  /** Fuel canopy, shop and a pylon sign — the lit thing on a night road. */
  _restStop(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 19, 8.0, 55, M.gravel, {
      yaw,
      // Forecourt wear follows the pump islands and the shop door, which is
      // the FFXV read our clean geometry has never had.
      wear: [[-3.2, 0, 1.5], [3.2, 0, 1.5], [-3, -12, 0.9]],
    });
    // canopy
    for (const sx of [-6.5, 6.5]) {
      for (const sz of [-4.5, 4.5]) {
        put(M.steel, new THREE.BoxGeometry(0.4, 5.2, 0.4), [sx, 2.7, sz]);
      }
    }
    put(M.cream, new THREE.BoxGeometry(17, 0.7, 12), [0, 5.5, 0]);
    put(M.red, new THREE.BoxGeometry(17.4, 0.5, 12.4), [0, 5.05, 0]);
    put(M.lamp, new THREE.BoxGeometry(15, 0.08, 10), [0, 5.1, 0]);
    // pumps
    for (const sx of [-3.2, 3.2]) {
      put(M.cream, new THREE.BoxGeometry(1.1, 1.7, 0.8), [sx, 0.95, 0]);
      put(M.steel, new THREE.BoxGeometry(1.3, 0.16, 1.0), [sx, 1.85, 0]);
      put(M.glass, new THREE.BoxGeometry(0.7, 0.5, 0.05), [sx, 1.35, 0.42]);
    }
    // shop: a real hut with a door you can see into, not a box with two decals
    this._hut(B, world, { w: 11, d: 7, x: -3, z: -12, rng, base: 0.15 });
    // pylon sign
    put(M.steel, new THREE.BoxGeometry(0.5, 8.5, 0.5), [13.5, 4.4, 6]);
    put(M.sign, new THREE.PlaneGeometry(4.2, 2.4), [13.5, 9.4, 6.3]);
    put(M.cream, new THREE.BoxGeometry(4.4, 2.6, 0.4), [13.5, 9.4, 6]);
    // picnic tables and drums
    for (let i = 0; i < 3; i++) {
      const px = rng.range(-12, 12), pz = rng.range(4, 9);
      put(M.plank, new THREE.BoxGeometry(2.0, 0.12, 0.9), [px, 0.85, pz], [0, rng.next() * 3, 0]);
      put(M.rust, new THREE.CylinderGeometry(0.32, 0.32, 0.9, 10), [px + 2.4, 0.6, pz]);
    }
    return { cast: true, r: 22 };
  }

  /** A wayside outpost: prefab huts, a pump, containers and a comms mast. */
  _outpost(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 14, 8.0, 71, M.gravel, { yaw, wear: [[7, 4, 0.9], [-9, 6, 0.8]] });
    const huts = 2 + Math.floor(rng.next() * 2);
    for (let i = 0; i < huts; i++) {
      const px = -8 + i * 8.5 + rng.gauss(0, 0.6), pz = -6 + rng.gauss(0, 1.4);
      const w = rng.range(5, 8), d = rng.range(4, 6);
      this._hut(B, world, { w, d, x: px, z: pz, rng, base: 0.3 });
    }
    // fuel pump and a canopy over it
    put(M.cream, new THREE.BoxGeometry(1.1, 1.7, 0.8), [7, 1.15, 4]);
    put(M.steel, new THREE.BoxGeometry(0.3, 3.6, 0.3), [5.6, 2.1, 4]);
    put(M.steel, new THREE.BoxGeometry(0.3, 3.6, 0.3), [8.4, 2.1, 4]);
    put(M.roof, new THREE.BoxGeometry(4.2, 0.28, 3.2), [7, 3.9, 4]);
    // containers
    this._containers(B, world, { n: 3, x: -9, z: 6, rng, stack: true });
    // comms mast: four legs and cross-bracing, tapering
    const H = 16;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI * 0.5 + 0.78;
      put(M.steel, new THREE.CylinderGeometry(0.09, 0.11, H, 5),
        [11 + Math.cos(a) * 0.8, H * 0.5 + 0.3, -8 + Math.sin(a) * 0.8],
        [Math.sin(a) * 0.035, 0, -Math.cos(a) * 0.035]);
    }
    for (let i = 0; i < 6; i++) {
      put(M.steel, new THREE.TorusGeometry(1.05 - i * 0.06, 0.045, 4, 4).rotateX(Math.PI / 2),
        [11, 1.6 + i * 2.5, -8]);
    }
    put(M.lamp, new THREE.SphereGeometry(0.22, 7, 6), [11, H + 0.6, -8]);
    // oil drums
    for (let i = 0; i < 5; i++) {
      put(M.rust, new THREE.CylinderGeometry(0.32, 0.32, 0.92, 10),
        [rng.range(-11, 11), 0.76, rng.range(7, 9.5)], [0, rng.next() * 3, 0]);
    }
    return { cast: true, r: 20 };
  }

  /**
   * One building. The thing the POI kits did not have.
   *
   * Before this, a settlement block was a `BoxGeometry` with 3% vertex noise, a
   * parapet made of two more boxes, one 2.4 m cube on the roof for plant, and
   * emissive quads sitting 70 mm proud of the wall for windows. Captured
   * `poi_fishing` and read it: they were flat dark slabs with a lighter top,
   * and they were the worst thing in the frame by a wide margin in a shot where
   * the terrain, the sky and the trees are not.
   *
   * What is different here is entirely geometric, because the defect was:
   *
   * - **Every wall is a run of real thickness with the openings punched
   *   through it** ({@link wallRun}), so a window is a hole with a 280 mm
   *   reveal, a cill that throws a shadow, and a lintel — not a bright quad
   *   floating on the wall plane.
   * - **The block stands on a plinth** and is finished with a parapet whose
   *   coping has a drip lip, so it neither runs straight into the ground nor
   *   ends at a single hard edge against the sky.
   * - **The four silhouette corners are piers**, 340 mm square and struck with
   *   a 75 mm chamfer, which is the only size of arris that survives the
   *   projection at the range a town is seen from.
   * - **Roof furniture is cased plant, a stair head and a tank**, not a cube.
   * - **Tone is baked per vertex** ({@link bakeTone}), so the four flat wall
   *   colours become thirty-odd buildings that differ in value, warmth, how
   *   dirty their splash zone is and how bleached their parapets are.
   *
   * Built in a local frame with the ground at y=0 and `faceZ` naming which of
   * the two long elevations is the street, then merged per role and placed once.
   * Merging in local space is what keeps a whole block to one geometry per
   * material instead of one per box.
   */
  _block(this: PoiKits, B: PartBuilder, world: THREE.Matrix4, o: {
    w: number; d: number; storeys: number; x: number; z: number; ry?: number;
    shell: THREE.Material; rng: Rng; faceZ?: 1 | -1; lit?: number; base?: number;
  }) {
    const M = this.mats;
    const { w, d, storeys, x, z, ry = 0, shell, rng, faceZ = 1, lit = 0.3, base = 0.5 } = o;
    const b = bag();
    const wallT = 0.3;
    const H = storeys * STOREY;
    // The plinth stands ON the pad, not inside it. Built from y=0 with the pad
    // top at `base`, all three of its courses were buried and the walls met the
    // ground on a line again -- the exact defect the course exists to fix.
    const plinthH = 0.5;
    const y0 = base + plinthH;
    const tv = toneVariant(rng);

    plinth(b.shell, { w, d, h: plinthH, proud: 0.15, y: base });

    // Elevations. Each storey is its own run so the openings land on the floor
    // they belong to, and the two long faces carry the window rhythm while the
    // ends get half as many -- which is how a terrace block is actually
    // fenestrated, and it halves the cost of the faces nobody stands in front of.
    const bays = (len: number, spacing: number) => Math.max(1, Math.round(len / spacing) - 1);
    const faces: { len: number; ry: number; ox: number; oz: number; n: number; street: boolean }[] = [
      { len: w, ry: 0, ox: 0, oz: 1, n: bays(w, 3.0), street: faceZ > 0 },
      { len: w, ry: Math.PI, ox: 0, oz: -1, n: bays(w, 3.0), street: faceZ < 0 },
      { len: d, ry: Math.PI / 2, ox: 1, oz: 0, n: bays(d, 4.4), street: false },
      { len: d, ry: -Math.PI / 2, ox: -1, oz: 0, n: bays(d, 4.4), street: false },
    ];
    const half = { x: w / 2 - wallT / 2, z: d / 2 - wallT / 2 };
    for (const f of faces) {
      const runLen = f.ox ? d - wallT * 2 : w;
      for (let st = 0; st < storeys; st++) {
        const local = bag();
        const openings: Opening[] = [];
        const ground = st === 0;
        // Run-local: `wallRun` and the window units are built with the storey's
        // own floor at y=0 and the whole run is translated into place below.
        // Adding `st * STOREY` here as well put the top storey's windows above
        // the parapet and left the wall solid, because the opening no longer
        // fell inside the run `wallRun` was punching.
        const wy = ground ? CILL + 0.28 : CILL;
        const wh = ground ? 1.75 : 1.5;
        for (let i = 0; i < f.n; i++) {
          const bx = -runLen / 2 + (runLen * (i + 1)) / (f.n + 1);
          // A shopfront door in the middle bay of the street elevation, ground
          // floor only: the one opening a person walks through, so it is the one
          // that gets the hood, the threshold and the step.
          if (ground && f.street && f.n >= 3 && i === (f.n - 1) >> 1) {
            openings.push(doorUnit(local, { x: bx, wallT, w: 1.35, h: 2.25 }));
            continue;
          }
          openings.push(windowUnit(local, {
            x: bx, y: wy, w: ground ? 1.35 : 1.15, h: wh, wallT,
            lit: rng.next() < lit, plain: !ground,
          }));
        }
        for (const g of wallRun(runLen, STOREY, wallT, openings)) local.shell.push(g);
        const px = f.ox * half.x, pz = f.oz * half.z;
        for (const k of Object.keys(local)) {
          for (const g of local[k]) b[k].push(xform(g, { ry: f.ry, x: px, y: y0 + st * STOREY, z: pz }));
        }
      }
    }

    // String course at every floor line above the first: the single cheapest way
    // to stop a multi-storey facade reading as one flat rectangle.
    // In the shell material, not a contrasting one: a projecting course reads by
    // the shadow it throws, and painting it a different colour turns the one
    // horizontal that should be architecture into a racing stripe.
    for (let st = 1; st < storeys; st++) stringCourse(b.shell, { w, d, y: y0 + st * STOREY - 0.1 });
    cornerPier(b.shell, { w: w + 0.7, d: d + 0.7, y0: y0 + 0.12, y1: y0 + H, sec: 0.42, proud: 0.05, arris: 0.09 });

    // Roof: a deck INSIDE the parapet, then furniture that is not a cube. The
    // deck has to clear the parapet's inner face and sit above the wall head,
    // or it shows on the elevation as a dark band between the wall and the
    // coping -- which is what the first pass drew.
    const par = 0.19;
    b.roof.push(box(w - par * 2 - 0.06, 0.2, d - par * 2 - 0.06, { y: y0 + H + 0.1 }));
    parapet(b.shell, b.trim, { w, d, y: y0 + H, t: par, h: 0.62 });
    const ry0 = y0 + H + 0.2;
    const spot = () => [rng.range(-1, 1) * (w / 2 - 2.0), rng.range(-1, 1) * (d / 2 - 1.8)];
    {
      const [ax, az] = spot();
      plantUnit(b, { x: ax, y: ry0, z: az, w: rng.range(1.6, 2.4), h: rng.range(1.0, 1.5), d: rng.range(1.3, 1.9), ry: rng.range(0, 3.1) });
    }
    if (rng.next() < 0.55) { const [ax, az] = spot(); stairHead(b, { x: ax, y: ry0, z: az, ry: rng.range(0, 3.1) }); }
    if (rng.next() < 0.45) { const [ax, az] = spot(); roofTank(b, { x: ax, y: ry0, z: az, r: rng.range(0.8, 1.2), h: rng.range(1.2, 1.7) }); }
    // Aerials: two thin verticals off the parapet. Free silhouette.
    for (let i = 0; i < 2; i++) {
      const [ax, az] = spot();
      b.metal.push(cyl(0.035, rng.range(1.6, 3.2), 4, { x: ax, y: ry0 + rng.range(0.8, 1.6), z: az }));
    }

    // Scuppers and downpipes. Two per building: they are where the vertical
    // staining on a real facade comes from, and a 110 mm pipe standing 70 mm off
    // the wall is a hard vertical line and its own shadow all the way down --
    // the cheapest thing that stops an elevation being a plane.
    for (const sx of [-w * 0.34, w * 0.36]) {
      const zf = faceZ * (d / 2 + 0.09);
      b.metal.push(cyl(0.055, H + 0.4, 6, { x: sx, y: base + (H + 0.4) / 2, z: zf }));
      b.metal.push(xform(cyl(0.05, 0.42, 6), { rx: Math.PI / 2, x: sx, y: y0 + H + 0.32, z: zf + faceZ * 0.2 }));
      for (let k = 0; k < storeys; k++) b.metal.push(box(0.18, 0.05, 0.05, { x: sx, y: y0 + 0.9 + k * STOREY, z: zf - faceZ * 0.03 }));
    }

    // Ground-floor awning on the street elevation: canvas on two struts, tilted.
    if (rng.next() < 0.6) {
      const aw = w * 0.62, zf = faceZ * (d / 2 + 0.95);
      b.cloth.push(box(aw, 0.09, 2.0, { y: y0 + 2.95, z: zf, rx: faceZ * -0.19 }));
      b.cloth.push(box(aw, 0.34, 0.06, { y: y0 + 2.72, z: zf + faceZ * 0.95 }));
      for (const sx of [-1, 1]) {
        b.metal.push(cyl(0.035, 2.6, 5, { x: sx * aw * 0.46, y: y0 + 1.5, z: zf + faceZ * 0.85 }));
      }
    }

    const merged = mergeBag(b);
    const mats: Record<string, THREE.Material> = {
      shell, shell2: M.concrete, trim: M.joinery, metal: M.steel, glass: M.glass,
      glow: M.lamp, dark: M.interior, roof: M.roof, wood: M.plank, cloth: M.red,
    };
    const place = world.clone().multiply(mat4([x, 0, z], [0, ry, 0]));
    for (const [role, g] of Object.entries(merged)) {
      // Tone is baked on the finished, merged piece and measured against the
      // building's own extent -- the plan's meta-lesson, applied: enforce on the
      // shipped mesh, not on the recipe. Emissive and glass roles opt out; a
      // grime gradient on a lit window is nonsense.
      if (role !== 'glow' && role !== 'glass' && role !== 'dark') {
        bakeTone(g, { y0: base, y1: y0 + H, grime: tv.grime, jitter: tv.jitter, tint: tv.tint, streak: tv.streak });
      }
      B.add(mats[role] ?? shell, g, place);
    }
  }

  /**
   * A short row of shipping containers, optionally stacked.
   *
   * These were three 6.1 x 2.6 x 2.5 boxes wearing `rustMaterial` -- a map
   * authored for a one-metre part, stretched over six metres, which renders as
   * lava. `poiMaterials` documents that exact failure for walls; nothing had
   * applied it to props. {@link container} builds the corrugations instead, and
   * they are the whole read.
   */
  _containers(this: PoiKits, B: PartBuilder, world: THREE.Matrix4, o: {
    n: number; x: number; z: number; rng: Rng; stack?: boolean; y?: number;
  }) {
    const M = this.mats;
    const { n, x, z, rng, stack = false, y = 0 } = o;
    const paint = [M.red, M.render3, M.render4, M.wall2, M.steel];
    for (let i = 0; i < n; i++) {
      const b = bag();
      container(b, {});
      const merged = mergeBag(b);
      const tv = toneVariant(rng, { valueAmp: 0.2, warmAmp: 0.05 });
      const shell = paint[Math.floor(rng.next() * paint.length)];
      const place = world.clone().multiply(mat4(
        [x + rng.gauss(0, 1.2), y + (stack && i === n - 1 ? 2.62 : 0), z + i * 0.45],
        [0, rng.gauss(0, 0.09), 0]));
      for (const [role, g] of Object.entries(merged)) {
        bakeTone(g, { y0: 0, y1: 2.59, grime: tv.grime * 0.92, jitter: tv.jitter, tint: tv.tint, streak: tv.streak * 1.6 });
        B.add(role === 'metal' ? M.steel : role === 'trim' ? shell : shell, g, place);
      }
    }
  }

  /**
   * A single-storey hut: the outpost's, the reststop's, the workshop's.
   *
   * The same three defects {@link PoiKits._block} fixes, at a scale where they
   * are *worse* rather than better, because an outpost hut is something a
   * player stands two metres from. It gets a monopitch roof rather than a flat
   * one -- a slab lid on a box is the tell that survives every other fix -- with
   * a real eaves overhang, a fascia and a rafter row under it, so the roof
   * throws a hard shadow line across the elevation instead of ending on the wall.
   */
  _hut(this: PoiKits, B: PartBuilder, world: THREE.Matrix4, o: {
    w: number; d: number; x: number; z: number; ry?: number; rng: Rng; base?: number;
  }) {
    const M = this.mats;
    const { w, d, x, z, ry = 0, rng, base = 0 } = o;
    const b = bag();
    const wallT = 0.22;
    const h = 2.85, rise = 0.55;               // monopitch, falling toward -Z
    const plinthH = 0.28;
    const y0 = base + plinthH;
    const tv = toneVariant(rng, { valueAmp: 0.2, warmAmp: 0.07 });
    plinth(b.shell, { w, d, h: plinthH, proud: 0.11, y: base });

    // Front elevation: a door, and a window beside it.
    const front = bag();
    const openings: Opening[] = [
      doorUnit(front, { x: w * 0.28, wallT, w: 0.95, h: 2.05 }),
      windowUnit(front, { x: -w * 0.2, y: 1.0, w: Math.min(1.5, w * 0.32), h: 1.1, wallT, lit: rng.next() < 0.3 }),
    ];
    for (const g of wallRun(w, h + rise, wallT, openings)) front.shell.push(g);
    for (const k of Object.keys(front)) for (const g of front[k]) b[k].push(xform(g, { y: y0, z: d / 2 - wallT / 2 }));
    for (const g of wallRun(w, h, wallT, [])) b.shell.push(xform(g, { y: y0, z: -d / 2 + wallT / 2 }));
    // The two ends step up under the pitch: three short runs of rising height
    // rather than a trapezoid, which keeps every piece a chamfered box.
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const zc = -d / 2 + (d * (k + 0.5)) / 3;
        const hk = h + rise * ((k + 0.5) / 3);
        b.shell.push(xform(box(d / 3, hk, wallT, { y: hk / 2 }), { ry: Math.PI / 2, x: sx * (w / 2 - wallT / 2), y: y0, z: zc }));
      }
    }
    // Roof: deck, fascia, and a rafter row showing under the eaves.
    const pitch = Math.atan2(rise, d);
    const rl = Math.hypot(d + 0.8, rise);
    b.roof.push(xform(box(w + 0.9, 0.16, rl), { rx: -pitch, x: 0, y: y0 + h + rise / 2 + 0.08, z: 0 }));
    b.trim.push(box(w + 1.0, 0.16, 0.1, { x: 0, y: y0 + h + rise - 0.02, z: d / 2 + 0.42 }));
    const nr = Math.max(3, Math.round(w / 0.9));
    for (let i = 0; i < nr; i++) {
      const rx2 = -w / 2 + (w * (i + 0.5)) / nr;
      b.wood.push(box(0.07, 0.14, 0.5, { x: rx2, y: y0 + h + rise - 0.12, z: d / 2 + 0.2 }));
    }
    b.metal.push(box(0.5, 0.2, 0.12, { x: w * 0.28, y: y0 + 2.5, z: d / 2 + 0.16 }));

    const merged = mergeBag(b);
    const mats: Record<string, THREE.Material> = {
      shell: M.cream, shell2: M.concrete, trim: M.joinery, metal: M.steel, glass: M.glass,
      glow: M.lamp, dark: M.interior, roof: M.roof, wood: M.plank, cloth: M.red,
    };
    const place = world.clone().multiply(mat4([x, 0, z], [0, ry, 0]));
    for (const [role, g] of Object.entries(merged)) {
      if (role !== 'glow' && role !== 'glass' && role !== 'dark') {
        bakeTone(g, { y0: base, y1: y0 + h + rise, grime: tv.grime, jitter: tv.jitter, tint: tv.tint, streak: tv.streak });
      }
      B.add(mats[role] ?? M.cream, g, place);
    }
  }

  /**
   * A settlement, built as a *skyline* rather than as architecture.
   *
   * Lestallum and Galdin Quay are seen from a kilometre away far more often
   * than they are walked through, so what matters is the massing: a tight
   * block plan on a levelled terrace, flat roofs at four or five distinct
   * heights, parapets to break the silhouette, and one vertical — a chimney
   * or a water tower — tall enough to name the place on the horizon.
   */
  _town(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 52, 18, 33, M.gravel, { yaw, wear: [[0, 0, 6.0], [22, -18, 1.0]] });
    // a street grid rather than a scatter: blocks share walls and align
    const walls = [M.wall, M.wall2, M.stone, M.render1, M.render2, M.render3, M.render4];
    for (let gx = -2; gx <= 2; gx++) {
      for (let gz = -2; gz <= 2; gz++) {
        if (gx === 0 && gz === 0) continue;                 // the square
        const jx = gx * 17 + rng.gauss(0, 1.4), jz = gz * 15 + rng.gauss(0, 1.4);
        if (Math.hypot(jx, jz) > 46) continue;
        const blocks = 1 + (rng.next() < 0.5 ? 1 : 0);
        for (let b = 0; b < blocks; b++) {
          const w = rng.range(9, 14), dp = rng.range(8, 12);
          // Storeys, not a continuous height: a building is a stack of floors
          // and every horizontal on it lands on a multiple of STOREY. The
          // continuous `range(4.5, 9)` this replaces is why the old blocks had
          // window rows that did not agree with their own parapets.
          const storeys = 1 + Math.floor(rng.next() * 2) + (Math.hypot(jx, jz) < 22 ? Math.floor(rng.next() * 2) : 0);
          const px = jx + (b ? rng.range(-5, 5) : 0), pz = jz + (b ? rng.range(-5, 5) : 0);
          this._block(B, world, {
            w, d: dp, storeys, x: px, z: pz, ry: rng.range(-0.06, 0.06),
            shell: walls[Math.floor(rng.next() * walls.length)],
            rng, faceZ: pz > 0 ? -1 : 1, lit: 0.35,
          });
        }
      }
    }
    // the square: a paved plaza, market stalls and strung lights
    put(M.concrete, new THREE.CylinderGeometry(11, 11, 0.35, 22), [0, 0.5, 0]);
    // Market stalls. These were a single 3.0 x 0.12 x 2.4 box of dark canvas on
    // two poles, which at eye level in the square reads as a flat black slab
    // hanging in the air -- and the square is the one place in a settlement the
    // player actually stands still. A stall is a *gable*: two sloped panels
    // meeting at a ridge, with a valance hanging off the eaves, four legs, a
    // counter you could put something on, and crates under it.
    const stallCloth = [M.red, M.render3, M.render1, M.wall2];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = bag();
      const cw = 3.2, cd = 2.4, top = 2.55, eave = 2.15;
      const slope = Math.atan2(top - eave, cd / 2);
      const panel = Math.hypot(cd / 2, top - eave);
      for (const sz of [-1, 1]) {
        b.cloth.push(box(cw, 0.07, panel, { y: (top + eave) / 2, z: sz * cd / 4, rx: sz * slope }));
        // Valance: the scalloped strip that hangs off the eaves and is most of
        // what makes a market stall read as one from twenty metres.
        b.cloth.push(box(cw + 0.1, 0.34, 0.05, { y: eave - 0.15, z: sz * (cd / 2 + 0.02) }));
      }
      b.wood.push(box(0.09, 0.09, cd + 0.2, { y: top }));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        b.wood.push(cyl(0.05, eave, 5, { x: sx * (cw / 2 - 0.12), y: eave / 2, z: sz * (cd / 2 - 0.12) }));
      }
      b.wood.push(box(cw - 0.2, 0.09, 0.75, { y: 0.94, z: -cd * 0.18 }));
      b.wood.push(box(cw - 0.3, 0.85, 0.06, { y: 0.47, z: -cd * 0.18 - 0.35 }));
      for (let k = 0; k < 3; k++) {
        b.wood.push(box(0.5, 0.42, 0.4, { x: -cw / 2 + 0.45 + k * 0.85, y: 0.21, z: cd * 0.2 }));
      }
      const merged = mergeBag(b);
      const cloth = stallCloth[i % stallCloth.length];
      const tv = toneVariant(rng, { valueAmp: 0.16, warmAmp: 0.05 });
      const place = world.clone().multiply(mat4([Math.cos(a) * 7.5, 0.5, Math.sin(a) * 7.5], [0, -a, 0]));
      for (const [role, g] of Object.entries(merged)) {
        bakeTone(g, { y0: 0, y1: top, grime: tv.grime + 0.1, jitter: tv.jitter, tint: tv.tint, streak: 0 });
        B.add(role === 'cloth' ? cloth : M.plank, g, place);
      }
      put(M.lamp, new THREE.SphereGeometry(0.16, 6, 5), [Math.cos(a) * 10.5, 4.4, Math.sin(a) * 10.5]);
    }
    // the vertical: a chimney stack and a water tower
    put(M.wall2, new THREE.CylinderGeometry(2.2, 3.0, 34, 14), [22, 17.5, -18]);
    put(M.roof, new THREE.CylinderGeometry(2.6, 2.6, 1.2, 14), [22, 34.6, -18]);
    put(M.hot, new THREE.SphereGeometry(0.34, 7, 6), [22, 35.4, -18]);
    put(M.steel, new THREE.CylinderGeometry(3.2, 3.6, 4.4, 12), [-20, 16.4, 14]);
    put(M.roof, new THREE.ConeGeometry(3.7, 1.9, 12), [-20, 19.5, 14]);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI * 0.5 + 0.78;
      put(M.steel, new THREE.CylinderGeometry(0.14, 0.18, 14.4, 5),
        [-20 + Math.cos(a) * 2.5, 7.4, 14 + Math.sin(a) * 2.5],
        [Math.sin(a) * 0.11, 0, -Math.cos(a) * 0.11]);
    }
    return { cast: false, r: 58 };
  }

  /**
   * A royal tomb — the kit that most has to read from a kilometre away.
   *
   * It was twelve smooth cylinders under two slabs and a triangular prism, all
   * in one flat cream with no tonal variation anywhere on it, and it read as a
   * white shed with poles (`tmp/shots/kits-r0b/poi_tomb_just.png`). A temple at
   * a kilometre is decided by three things and it had none of them: a
   * **stepped stylobate** that reads as a horizontal band of light-dark-light,
   * an **entablature deep enough to throw its own shadow across the columns**,
   * and a **value gradient** from a dirty base to a bleached cornice.
   *
   * So it is rebuilt on {@link BuildKit}: chamfered members throughout, a real
   * three-course crepidoma, columns with a base, entasis and a two-part
   * capital, an architrave / frieze / cornice with a drip lip, a pediment with
   * raking cornices and a tympanum set back inside them, a cella with a doorway
   * that has a reveal, and {@link bakeTone} over the finished merge.
   *
   * The cost is entirely in the roles, not in the count: one merged geometry
   * per material for the whole building.
   */
  _tomb(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    // 1.4x: a royal tomb has to hold its own against a 200 m mesa behind it
    const world = mat4([0, 0, 0], [0, yaw, 0], [1.4, 1.4, 1.4]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 13, 11, 17, undefined, { yaw, wear: [[0, 6.5, 1.1]] });

    const b = bag();
    const tv = toneVariant(rng, { valueAmp: 0.14, warmAmp: 0.05 });
    const W = 15.2, D = 12.2;

    // Crepidoma: a buried levelling course plus three steps. Each step is a
    // chamfered box 250 mm proud of the one above, so the stylobate reads at
    // range as a stack of bright top faces separated by dark risers -- the
    // horizontal that says "temple" before any column is resolved.
    const stepH = 0.52;
    b.shell.push(box(W + 1.5, 0.9, D + 1.5, { y: -0.42, arris: 0.05 }));
    for (let i = 0; i < 3; i++) {
      const w = W - i * 1.5, d = D - i * 1.5;
      b.shell.push(box(w, stepH, d, { y: stepH * (i + 0.5), arris: 0.055 }));
    }
    const deck = stepH * 3;

    // Peristyle. Six columns a side, plus the two returns, so the corner is a
    // corner rather than a gap -- a colonnade with open ends reads as a fence.
    const cols = 6;
    const colR = 0.44, colH = 5.3;
    const spanX = 10.4, spanZ = 3.9;
    const shaft = (px: number, pz: number, broken: boolean) => {
      const h = broken ? rng.range(1.7, 4.0) : colH;
      // Plinth and torus base.
      b.shell.push(box(colR * 2.5, 0.2, colR * 2.5, { x: px, y: deck + 0.1, z: pz, arris: 0.045 }));
      b.shell.push(xform(new THREE.CylinderGeometry(colR * 1.12, colR * 1.22, 0.22, 12), { x: px, y: deck + 0.31, z: pz }));
      // Entasis: three drums of falling radius rather than one cylinder. A
      // straight-sided column reads as a pipe; the swell is what makes it stone.
      const dr = [1.0, 0.94, 0.86];
      for (let k = 0; k < 3; k++) {
        const y0 = deck + 0.42 + (h - 0.42) * (k / 3);
        const y1 = deck + 0.42 + (h - 0.42) * ((k + 1) / 3);
        b.shell.push(xform(new THREE.CylinderGeometry(colR * dr[Math.min(2, k + 1)], colR * dr[k], y1 - y0, 12), {
          x: px, y: (y0 + y1) / 2, z: pz,
        }));
      }
      if (broken) {
        // A snapped column ends in a jagged stump, not a flat disc.
        b.shell.push(xform(new THREE.DodecahedronGeometry(colR * 0.95, 0), {
          x: px + rng.gauss(0, 0.05), y: deck + h + 0.05, z: pz + rng.gauss(0, 0.05),
        }));
        return;
      }
      // Capital: echinus then abacus, each proud of the one below.
      b.shell.push(xform(new THREE.CylinderGeometry(colR * 1.32, colR * 0.86, 0.3, 12), { x: px, y: deck + h + 0.15, z: pz }));
      b.shell.push(box(colR * 2.9, 0.26, colR * 2.9, { x: px, y: deck + h + 0.43, z: pz, arris: 0.05 }));
    };
    const colTop = deck + colH + 0.56;
    for (let i = 0; i < cols; i++) {
      const px = (i / (cols - 1) - 0.5) * spanX;
      for (const sz of [-1, 1]) shaft(px, sz * spanZ, rng.next() < 0.16);
    }
    for (const sx of [-1, 1]) shaft(sx * spanX * 0.5, 0, rng.next() < 0.1);

    // Entablature. Architrave, then a frieze set BACK, then a cornice thrown
    // forward over both with a drip lip under its nose. Bright line over dark
    // line over wall -- the same three-part read `BuildKit.parapet` documents,
    // and the reason a temple has a shadow under its eaves at any sun angle.
    const eW = spanX + colR * 3.4, eD = spanZ * 2 + colR * 3.4;
    b.shell.push(box(eW + 0.5, 0.62, eD + 0.5, { y: colTop + 0.31, arris: 0.06 }));
    b.shell.push(box(eW + 0.2, 0.5, eD + 0.2, { y: colTop + 0.87, arris: 0.05 }));
    b.trim.push(box(eW + 1.3, 0.3, eD + 1.3, { y: colTop + 1.27, arris: 0.05 }));
    b.trim.push(box(eW + 1.12, 0.09, eD + 1.12, { y: colTop + 1.08, arris: 0.02 }));
    // Triglyph rhythm on the frieze: one per column and one between. Free
    // silhouette at close range and a dashed shadow line at long range.
    for (let i = 0; i < cols * 2 - 1; i++) {
      const px = (i / (cols * 2 - 2) - 0.5) * eW;
      for (const sz of [-1, 1]) {
        b.shell.push(box(0.28, 0.46, 0.1, { x: px, y: colTop + 0.87, z: sz * (eD / 2 + 0.13), sharp: true }));
      }
    }

    // Pediment and roof. The ridge runs along Z so the gable faces the way the
    // door does: what a temple is *for*, visually, is one triangle over a row
    // of columns, and the first pass of this put the ridge the other way and
    // then crossed two pyramids over it -- read
    // `tmp/shots/kits-r3/poi_tomb_just.png` for the spike that produced.
    //
    // The tympanum is six stepped courses rather than a solid triangle, because
    // everything in this kit is a chamfered box and the raking cornice stands
    // proud of it on both faces, so the steps are never on the silhouette.
    const gable = 2.6;
    const eaves = colTop + 1.42;
    const NT = 6;
    for (const sz of [-1, 1]) {
      for (let i = 0; i < NT; i++) {
        const t = i / NT;
        const w = (eW + 1.0) * (1 - t);
        b.shell.push(box(w, gable / NT, 0.34, {
          y: eaves + gable * (t + 0.5 / NT), z: sz * (eD / 2 + 0.5), arris: 0.03,
        }));
      }
      // Raking cornices: the bright line that draws the triangle.
      for (const sx of [-1, 1]) {
        const len = Math.hypot(eW / 2 + 0.5, gable);
        const ang = Math.atan2(gable, eW / 2 + 0.5);
        b.trim.push(xform(box(len, 0.28, 0.62), {
          rz: -sx * ang, x: sx * (eW / 4 + 0.25), y: eaves + gable / 2, z: sz * (eD / 2 + 0.72),
        }));
      }
    }
    // Two roof planes off the ridge, and a ridge capping course over them.
    {
      const slope = Math.hypot(eW / 2 + 0.7, gable);
      const ang = Math.atan2(gable, eW / 2 + 0.7);
      for (const sx of [-1, 1]) {
        b.roof.push(xform(box(slope, 0.3, eD + 1.5), {
          rz: -sx * ang, x: sx * (eW / 4 + 0.35), y: eaves + gable / 2 + 0.05,
        }));
      }
      b.trim.push(box(0.62, 0.24, eD + 1.7, { y: eaves + gable + 0.12, arris: 0.05 }));
    }
    // Acroteria: the three verticals that break the roofline against the sky.
    for (const sz of [-1, 1]) {
      b.trim.push(box(0.52, 0.8, 0.52, { y: eaves + gable + 0.5, z: sz * (eD / 2 + 0.7), arris: 0.06 }));
      for (const sx of [-1, 1]) {
        b.trim.push(box(0.46, 0.62, 0.46, { x: sx * (eW / 2 + 0.4), y: eaves + 0.4, z: sz * (eD / 2 + 0.7), arris: 0.06 }));
      }
    }

    // Cella: a real walled room inside the peristyle, with a doorway that has a
    // reveal, a threshold and a hood. `wallRun` punches the opening, so the
    // dark inside the tomb is a hole and not a painted rectangle.
    const cW = spanX * 0.74, cD = spanZ * 1.3, cH = colH + 0.2, cT = 0.42;
    {
      const local = bag();
      const openings: Opening[] = [doorUnit(local, { x: 0, wallT: cT, w: 1.5, h: 2.6 })];
      for (const g of wallRun(cW, cH, cT, openings)) local.shell.push(g);
      for (const k of Object.keys(local)) for (const g of local[k]) b[k].push(xform(g, { y: deck, z: cD / 2 - cT / 2 }));
    }
    for (const g of wallRun(cW, cH, cT, [])) b.shell.push(xform(g, { y: deck, z: -cD / 2 + cT / 2 }));
    for (const sx of [-1, 1]) {
      for (const g of wallRun(cD - cT * 2, cH, cT, [])) {
        b.shell.push(xform(g, { ry: Math.PI / 2, x: sx * (cW / 2 - cT / 2), y: deck, z: 0 }));
      }
    }
    b.shell.push(box(cW + 0.7, 0.34, cD + 0.7, { y: deck + cH + 0.17, arris: 0.05 }));
    b.dark.push(box(1.5, 2.6, 0.12, { y: deck + 1.3, z: cD / 2 - cT - 0.1, sharp: true }));

    const merged = mergeBag(b);
    const roleMat: Record<string, THREE.Material> = {
      shell: M.stone, trim: M.concrete, metal: M.steel, glass: M.glass,
      glow: M.rune, dark: M.interior, roof: M.stone, wood: M.plank, cloth: M.cloth,
      shell2: M.stone,
    };
    for (const [role, g] of Object.entries(merged)) {
      if (role !== 'glow' && role !== 'dark') {
        // A temple's value gradient is the opposite way round from a shed's:
        // the stylobate is where the dirt and the moss are, the cornice is
        // where thirty centuries of sun have been. Wider than the default.
        bakeTone(g, {
          y0: -0.5, y1: colTop + 1.4 + gable, grime: 0.68, bleach: 1.12,
          jitter: tv.jitter, tint: tv.tint, streak: 0.16,
        });
      }
      put(roleMat[role] ?? M.stone, g, [0, 0, 0]);
    }

    // Sarcophagus, the arm, and the braziers that light it.
    put(M.dark, box(3.0, 1.1, 1.4, { arris: 0.06 }), [0, deck + 0.55, cD / 2 + 2.6]);
    put(M.stone, box(3.3, 0.16, 1.7, { arris: 0.04 }), [0, deck + 1.16, cD / 2 + 2.6]);
    put(M.rune, new THREE.BoxGeometry(0.12, 2.6, 0.5), [0, deck + 3.1, cD / 2 + 2.6], [0, 0, 0.22]);
    put(M.rune, new THREE.BoxGeometry(0.5, 0.12, 0.12), [0, deck + 2.5, cD / 2 + 2.6], [0, 0, 0.22]);
    for (const sx of [-5.2, 5.2]) {
      put(M.dark, new THREE.CylinderGeometry(0.5, 0.34, 1.2, 8), [sx, deck + 0.6, cD / 2 + 2.8]);
      put(M.hot, new THREE.SphereGeometry(0.42, 8, 6), [sx, deck + 1.35, cD / 2 + 2.8]);
    }
    // Fallen blocks: dressed masonry, so they read as *this* building's stone
    // rather than as boulders that happen to be nearby.
    for (let i = 0; i < 9; i++) {
      const a = rng.next() * 6.28, d = rng.range(8.5, 13);
      const bw = rng.range(0.7, 1.9);
      const g = box(bw, rng.range(0.45, 1.0), bw * rng.range(0.6, 1.1), { arris: 0.06 });
      bakeTone(g, { y0: -0.5, y1: 1.0, grime: 0.62, bleach: 0.9, jitter: tv.jitter });
      put(M.stone, g, [Math.cos(a) * d, 0.35, Math.sin(a) * d],
        [rng.gauss(0, 0.22), rng.next() * 3, rng.gauss(0, 0.22)]);
    }
    // A drum off a fallen column, lying where it rolled.
    for (let i = 0; i < 3; i++) {
      const a = rng.range(0, 6.28), d = rng.range(7, 11);
      put(M.stone, new THREE.CylinderGeometry(colR * 0.95, colR, rng.range(0.8, 1.5), 12),
        [Math.cos(a) * d, 0.6, Math.sin(a) * d], [Math.PI / 2, rng.next() * 3, rng.gauss(0, 0.3)]);
    }
    return { cast: true, r: 21 };
  }

  /**
   * A magitek base: perimeter, gate, towers, hangar, landing pad.
   *
   * The largest thing the kit builds and it was twenty-six flat slabs in a
   * ring, four boxes on stilts and a half-cylinder — one value, no thickness,
   * no coping and nothing standing on anything
   * (`tmp/shots/kits-r0b/poi_aracheole.png`). A compound is read from its
   * **perimeter**, and a perimeter is read from four things a slab has none of:
   * a plinth it stands on, piers that break the run, a coping that catches the
   * sun as a bright line, and a drip lip that puts a dark line under it.
   *
   * Everything below goes through {@link BuildKit}, so every arris is
   * chamfered, every opening has a reveal, the crates are the corrugated
   * {@link container} rather than boxes wearing a one-metre map, and
   * {@link bakeTone} runs on the finished merge — which is what stops thirty
   * pieces of `magitek` being literally one colour.
   */
  _imperial(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 34, 13, 47, M.gravel, { yaw, wear: [[0, 0, 5.0], [-14, 14, 1.8], [22, 16, 1.0]] });

    const b = bag();
    const tv = toneVariant(rng, { valueAmp: 0.16, warmAmp: 0.04 });
    const RX = 30, RZ = 24;                        // perimeter semi-axes
    const N = 26;
    const gate = Math.floor(rng.range(3, 9));
    const WT = 0.85;                               // wall thickness
    const WH = 6.2;                                // wall height

    // Perimeter. Each bay is a real `wallRun` of thickness with an embrasure
    // punched near the top, standing on a plinth, capped by a coping with a
    // drip lip and buttressed by a pier at every joint. The breaches are what
    // makes an *abandoned* base read: a gap with a jagged stub either side.
    for (let i = 0; i < N; i++) {
      if (i === gate || i === gate + 1) continue;
      const t = (i / N) * Math.PI * 2, t2 = ((i + 1) / N) * Math.PI * 2;
      const ax = Math.cos(t) * RX, az = Math.sin(t) * RZ;
      const bx = Math.cos(t2) * RX, bz = Math.sin(t2) * RZ;
      const px = (ax + bx) / 2, pz = (az + bz) / 2;
      const len = Math.hypot(bx - ax, bz - az);
      const ang = Math.atan2(bz - az, bx - ax);
      const breach = rng.next() < 0.14;
      const h = breach ? rng.range(1.4, 3.0) : WH;
      const local = bag();
      const openings: Opening[] = breach ? [] : [{ x: 0, w: len * 0.34, y0: h - 1.35, h: 0.75 }];
      for (const g of wallRun(len + 0.35, h, WT, openings)) local.shell2.push(g);
      plinth(local.shell2, { w: len + 0.5, d: WT, h: 0.55, proud: 0.16, y: -0.2 });
      if (!breach) {
        // Coping and drip lip: bright line over dark line over wall.
        local.trim.push(box(len + 0.55, 0.16, WT + 0.34, { y: h + 0.08 }));
        local.trim.push(box(len + 0.45, 0.06, 0.06, { y: h - 0.02, z: WT / 2 + 0.15 }));
        local.trim.push(box(len + 0.45, 0.06, 0.06, { y: h - 0.02, z: -WT / 2 - 0.15 }));
        // Merlons: the notched rhythm that says fortification at any range.
        const nm = Math.max(2, Math.round(len / 2.6));
        for (let k = 0; k < nm; k++) {
          local.trim.push(box(len / nm * 0.55, 0.62, WT * 0.7, {
            x: -len / 2 + (len * (k + 0.5)) / nm, y: h + 0.47,
          }));
        }
      } else {
        // Rubble in the gap, so a breach is a collapse and not a missing part.
        for (let k = 0; k < 5; k++) {
          local.shell2.push(xform(new THREE.DodecahedronGeometry(rng.range(0.4, 1.1), 0), {
            x: rng.range(-len / 2, len / 2), y: rng.range(0.1, 0.7), z: rng.gauss(0, 1.4),
          }));
        }
      }
      // A buttress pier at the joint, standing proud on both faces.
      local.shell2.push(box(1.05, h + 0.3, WT + 0.5, { x: len / 2, y: (h + 0.3) / 2, arris: 0.085 }));
      for (const k of Object.keys(local)) {
        for (const g of local[k]) b[k].push(xform(g, { ry: -ang, x: px, y: 0.35, z: pz }));
      }
    }

    // Gate: two pylons with a plinth and a cap, a gantry across the head with
    // its own shadow, and a lifted barrier arm with hazard banding.
    {
      const ga = (gate + 1) / N * Math.PI * 2;
      const gx = Math.cos(ga) * RX, gz = Math.sin(ga) * RZ;
      const gang = Math.atan2(Math.cos(ga) * RZ, -Math.sin(ga) * RX);
      const local = bag();
      for (const sx of [-1, 1]) {
        plinth(local.shell, { w: 2.6, d: 2.6, h: 0.6, proud: 0.18, cx: sx * 3.2 });
        local.shell.push(box(2.2, 7.4, 2.2, { x: sx * 3.2, y: 0.6 + 3.7, arris: 0.1 }));
        local.trim.push(box(2.75, 0.22, 2.75, { x: sx * 3.2, y: 8.11 }));
        local.trim.push(box(2.55, 0.07, 0.07, { x: sx * 3.2, y: 7.94, z: 1.31 }));
        local.glow.push(box(1.4, 0.24, 0.06, { x: sx * 3.2, y: 5.6, z: 1.14, sharp: true }));
      }
      local.shell.push(box(9.2, 1.05, 1.5, { y: 8.7, arris: 0.09 }));
      local.trim.push(box(9.4, 0.1, 0.1, { y: 8.14, z: 0.8 }));
      // The arm, lifted: a raised barrier is a stronger silhouette than a
      // lowered one and it reads as "abandoned, gates open" from a distance.
      local.metal.push(xform(box(0.18, 5.4, 0.18), { rz: 0.42, x: 2.2, y: 3.6 }));
      for (let k = 0; k < 5; k++) {
        local.trim.push(xform(box(0.2, 0.5, 0.2), { rz: 0.42, x: 2.2 - Math.sin(0.42) * (k - 2) * 1.0, y: 3.6 + Math.cos(0.42) * (k - 2) * 1.0 }));
      }
      for (const k of Object.keys(local)) {
        for (const g of local[k]) b[k].push(xform(g, { ry: -gang, x: gx, y: 0.35, z: gz }));
      }
    }

    // Watchtowers: X-braced legs, a cabin with a real window band, a railed
    // catwalk round it, a ladder, and an overhanging roof. A box on four sticks
    // is the single most placeholder thing a compound can have.
    for (const [tx, tz] of [[-26, -20], [26, 20], [26, -20]]) {
      const local = bag();
      const H = 11.5, LR = 1.7;
      const legs: number[][] = [];
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI * 0.5 + 0.78;
        legs.push([Math.cos(a) * LR, Math.sin(a) * LR]);
        local.metal.push(xform(cyl(0.16, H, 6), {
          x: Math.cos(a) * LR * 0.55, y: H / 2, z: Math.sin(a) * LR * 0.55,
          rx: Math.sin(a) * 0.08, rz: -Math.cos(a) * 0.08,
        }));
      }
      for (let lvl = 1; lvl <= 3; lvl++) {
        const ly = (H * lvl) / 3.4;
        for (let i = 0; i < 4; i++) {
          const a0 = legs[i], a1 = legs[(i + 1) % 4];
          const mx = (a0[0] + a1[0]) / 2, mz = (a0[1] + a1[1]) / 2;
          const len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) * 0.95;
          const ang = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]);
          local.metal.push(xform(box(len, 0.11, 0.11), { ry: -ang, x: mx * 0.7, y: ly, z: mz * 0.7 }));
          // one diagonal per face per level: the X that makes a mast a truss
          local.metal.push(xform(box(Math.hypot(len, H / 3.4), 0.08, 0.08), {
            rz: 0.9 * (lvl % 2 ? 1 : -1), ry: -ang, x: mx * 0.7, y: ly - H / 6.8, z: mz * 0.7,
          }));
        }
      }
      const cy = H + 1.3;
      local.shell.push(box(4.4, 2.5, 4.4, { y: cy, arris: 0.08 }));
      local.dark.push(box(4.5, 0.85, 4.5, { y: cy + 0.5, sharp: true }));
      for (const sz of [-1, 1]) {
        local.trim.push(box(4.6, 0.12, 0.12, { y: cy + 0.94, z: sz * 2.26 }));
        local.trim.push(box(4.6, 0.12, 0.12, { y: cy + 0.05, z: sz * 2.26 }));
        local.trim.push(xform(box(4.6, 0.12, 0.12), { ry: Math.PI / 2, x: sz * 2.26, y: cy + 0.94 }));
      }
      local.glow.push(box(3.4, 0.4, 0.06, { y: cy + 0.2, z: 2.3, sharp: true }));
      // Catwalk and handrail.
      local.metal.push(box(6.0, 0.12, 6.0, { y: cy - 1.31 }));
      for (const sz of [-1, 1]) {
        local.metal.push(box(6.0, 0.06, 0.06, { y: cy - 0.28, z: sz * 2.95 }));
        local.metal.push(xform(box(6.0, 0.06, 0.06), { ry: Math.PI / 2, x: sz * 2.95, y: cy - 0.28 }));
        for (let k = -2; k <= 2; k++) {
          local.metal.push(cyl(0.035, 1.05, 4, { x: k * 1.4, y: cy - 0.78, z: sz * 2.95 }));
        }
      }
      // Roof, proud all round with a shadow gap under its nose, and a beacon.
      local.roof.push(box(5.4, 0.28, 5.4, { y: cy + 1.39 }));
      local.trim.push(box(5.0, 0.08, 5.0, { y: cy + 1.2 }));
      local.metal.push(cyl(0.07, 1.6, 5, { y: cy + 2.3 }));
      local.glow.push(xform(new THREE.SphereGeometry(0.2, 7, 6), { y: cy + 3.1 }));
      // Ladder up one leg.
      for (let k = 0; k < Math.round(H / 0.42); k++) {
        local.metal.push(box(0.66, 0.05, 0.05, { x: LR * 0.55, y: 0.3 + k * 0.42, z: -LR * 0.55 }));
      }
      for (const k of Object.keys(local)) for (const g of local[k]) b[k].push(xform(g, { x: tx, y: 0.35, z: tz }));
    }

    // Hangar: a plinth, ribbed barrel vault, a door with real jambs and a head
    // beam, roof plant and a gantry rail. The ribs are the whole read — a bare
    // half-cylinder is a croissant.
    {
      const local = bag();
      const HW = 18, HH = 4.6, HD = 13;
      plinth(local.shell, { w: HW, d: HD, h: 0.7, proud: 0.2 });
      for (const g of wallRun(HW, HH, 0.6, [])) local.shell.push(xform(g, { y: 0.7, z: HD / 2 - 0.3 }));
      for (const g of wallRun(HW, HH, 0.6, [])) local.shell.push(xform(g, { y: 0.7, z: -HD / 2 + 0.3 }));
      for (const sx of [-1, 1]) {
        for (const g of wallRun(HD - 1.2, HH, 0.6, [])) {
          local.shell.push(xform(g, { ry: Math.PI / 2, x: sx * (HW / 2 - 0.3), y: 0.7 }));
        }
      }
      // A *segmental* vault, not a semicircle. A half cylinder of the building's
      // own width stands as tall again as the building — the first pass did
      // exactly that and produced a nine-metre black dome that owned the whole
      // compound (`tmp/shots/kits-r6/poi_aracheole.png`). Squashed to 0.58 it
      // is a hangar roof.
      const vault = new THREE.CylinderGeometry(HW / 2 + 0.4, HW / 2 + 0.4, HD + 0.8, 18, 1, false, 0, Math.PI)
        .rotateZ(Math.PI / 2);
      vault.scale(1, 0.58, 1);
      local.roof.push(xform(vault, { ry: Math.PI / 2, y: HH + 0.7 }));
      // Ribs at 2.2 m, standing 180 mm proud of the vault.
      for (let k = 0; k <= 6; k++) {
        const rz2 = -HD / 2 + (HD * k) / 6;
        const rib = new THREE.TorusGeometry(HW / 2 + 0.5, 0.17, 5, 20, Math.PI);
        rib.scale(1, 0.58, 1);
        local.metal.push(xform(rib, { y: HH + 0.7, z: rz2 }));
      }
      // The door: a hole with jambs, a head beam and a dark interior behind it.
      const dW = 8.4, dH = 4.1;
      local.dark.push(box(dW, dH, 0.3, { y: 0.7 + dH / 2, z: HD / 2 + 0.05, sharp: true }));
      for (const sx of [-1, 1]) {
        local.trim.push(box(0.5, dH + 0.7, 0.9, { x: sx * (dW / 2 + 0.25), y: 0.7 + (dH + 0.7) / 2, z: HD / 2 + 0.2 }));
      }
      local.trim.push(box(dW + 1.4, 0.65, 1.1, { y: 0.7 + dH + 0.32, z: HD / 2 + 0.25 }));
      local.glow.push(box(dW + 1.0, 0.14, 0.06, { y: 0.7 + dH + 0.02, z: HD / 2 + 0.72, sharp: true }));
      plantUnit(local, { x: -5.4, y: HH + 0.7 + (HW / 2) * 0.58 - 1.1, z: 0, w: 2.2, h: 1.3, d: 1.7 });
      for (const k of Object.keys(local)) for (const g of local[k]) b[k].push(xform(g, { x: -14, y: 0.35, z: 14 }));
    }

    // Sandbag emplacements: two revetments inside the wire and one horseshoe
    // beside the gate. Courses settle under the load above them, the bond
    // alternates, and one bag in fourteen is out of line -- a perfectly laid
    // revetment is a *rendering* of a revetment.
    for (const em of [[-8, -19, 0.2], [19, 7, 1.9], [4, 20, 3.6]]) {
      sandbagStack(b.cloth, {
        len: rng.range(3.2, 5.4), courses: 5, rng,
        x: em[0], z: em[1], ry: em[2], y: 0.35,
        // A firing position dips in the middle: that is where you shoot from.
        profile: (t) => (Math.abs(t - 0.5) < 0.16 ? 0.55 : 1),
      });
    }

    const merged = mergeBag(b);
    const roleMat: Record<string, THREE.Material> = {
      // Two masses, not one: pale concrete carries the wall and the cabins,
      // dark magitek plate carries every coping, merlon, jamb and roof. One
      // material for a whole compound is what made the first pass a black ring.
      shell: M.magitek, shell2: M.concrete, trim: M.magitek, metal: M.steel,
      glass: M.glass, glow: M.hot, dark: M.interior, roof: M.magitek,
      wood: M.plank, cloth: M.cream,
    };
    for (const [role, g] of Object.entries(merged)) {
      if (role !== 'glow' && role !== 'dark' && role !== 'glass') {
        bakeTone(g, { y0: 0, y1: 14, grime: 0.7, bleach: 1.06, jitter: tv.jitter, tint: tv.tint, streak: 0.24 });
      }
      put(roleMat[role] ?? M.magitek, g, [0, 0, 0]);
    }

    // Landing pad: a platform on a chamfered edge kerb, not a disc painted on
    // the gravel, with the approach chevrons and the edge lights that make a
    // helipad legible from the air.
    put(M.magitek, new THREE.CylinderGeometry(11, 11.3, 0.55, 24), [0, 0.6, 0]);
    put(M.concrete, new THREE.CylinderGeometry(11.5, 11.8, 0.34, 24), [0, 0.3, 0]);
    put(M.red, new THREE.TorusGeometry(8.4, 0.28, 5, 26).rotateX(Math.PI / 2), [0, 0.88, 0]);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      put(M.hot, new THREE.BoxGeometry(0.3, 0.16, 0.3), [Math.cos(a) * 10.6, 0.94, Math.sin(a) * 10.6]);
    }
    for (let i = 0; i < 4; i++) {
      put(M.red, new THREE.BoxGeometry(3.2, 0.06, 0.55), [0, 0.9, -4.4 + i * 1.1]);
    }

    // Banners, floodlights, and containers where somebody left them.
    for (let i = 0; i < 5; i++) {
      const a = rng.next() * 6.28;
      put(M.banner, new THREE.PlaneGeometry(2.2, 5.4),
        [Math.cos(a) * 28, 4.0, Math.sin(a) * 22], [0, -a + Math.PI / 2, 0]);
    }
    for (const [fx, fz] of [[18, -14], [-20, -16], [20, 16]]) {
      put(M.steel, new THREE.CylinderGeometry(0.12, 0.16, 9, 6), [fx, 4.8, fz]);
      put(M.steel, new THREE.BoxGeometry(0.5, 0.5, 0.5), [fx, 9.0, fz]);
      put(M.lamp, new THREE.BoxGeometry(1.1, 0.7, 0.4), [fx, 9.3, fz], [0.5, 0, 0]);
    }
    this._containers(B, world, { n: 3, x: 16, z: -4, rng, stack: true });
    for (let i = 0; i < 6; i++) {
      put(M.rust, new THREE.CylinderGeometry(0.34, 0.34, 1.0, 10),
        [rng.range(-24, 24), 0.95, rng.range(-18, 18)], [0, rng.next() * 3, 0]);
    }
    return { cast: false, r: 40 };
  }

  /**
   * A chocobo post: paddock, barn, feed silo, trough, signboard.
   *
   * The barn was a 13 x 5.2 x 9 box with a half cylinder on it and a black
   * rectangle for a door. A barn is read from its **gable end and its door**,
   * and from the fact that it is built out of boards: so it gets a plinth, a
   * board-and-batten elevation, a real gable with barge boards, a sliding door
   * on a rail with its own head beam, and a hay door in the loft.
   */
  _chocobo(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 22, 9, 63, M.gravel, { yaw, wear: [[-9, -11, 1.4], [6, 4, 0.9], [13, 12, 0.6]] });
    // paddock: post and two rails, all the way round
    const N = 34, R = 20;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, a2 = ((i + 1) / N) * Math.PI * 2;
      put(M.plank, new THREE.CylinderGeometry(0.09, 0.11, 1.5, 6), [Math.cos(a) * R, 0.9, Math.sin(a) * R]);
      const mx = (Math.cos(a) + Math.cos(a2)) * 0.5 * R, mz = (Math.sin(a) + Math.sin(a2)) * 0.5 * R;
      const len = Math.hypot(Math.cos(a2) - Math.cos(a), Math.sin(a2) - Math.sin(a)) * R;
      for (const h of [0.8, 1.3]) {
        put(M.plank, new THREE.BoxGeometry(len + 0.1, 0.1, 0.06), [mx, h, mz], [0, -(a + a2) * 0.5 + Math.PI / 2, 0]);
      }
    }

    // Barn.
    {
      const b = bag();
      const tv = toneVariant(rng, { valueAmp: 0.14, warmAmp: 0.06 });
      const W = 13, D = 9, H = 4.6, rise = 3.1, T = 0.26;
      plinth(b.shell, { w: W, d: D, h: 0.42, proud: 0.16 });
      const y0 = 0.42;
      // Board-and-batten: the wall, then a batten every 600 mm standing 40 mm
      // proud. That rhythm is what makes timber read as timber at any range.
      const front = bag();
      const openings: Opening[] = [
        { x: 0, w: 4.4, y0: 0, h: 4.0 },
        { x: 0, w: 1.9, y0: H + 0.5, h: 1.5 },
      ];
      for (const g of wallRun(W, H, T, [openings[0]])) front.shell.push(g);
      for (const k of Object.keys(front)) for (const g of front[k]) b[k].push(xform(g, { y: y0, z: D / 2 - T / 2 }));
      for (const g of wallRun(W, H, T, [])) b.shell.push(xform(g, { y: y0, z: -D / 2 + T / 2 }));
      for (const sx of [-1, 1]) {
        for (const g of wallRun(D - T * 2, H, T, [])) {
          b.shell.push(xform(g, { ry: Math.PI / 2, x: sx * (W / 2 - T / 2), y: y0 }));
        }
      }
      const nb = Math.round(W / 0.62);
      for (let i = 0; i <= nb; i++) {
        const bx = -W / 2 + (W * i) / nb;
        if (Math.abs(bx) < 2.4) continue;
        for (const sz of [-1, 1]) b.wood.push(box(0.09, H, 0.045, { x: bx, y: y0 + H / 2, z: sz * (D / 2 + 0.02) }));
      }
      // Gable ends, stepped so every piece stays a chamfered box, and the two
      // roof planes over them with barge boards on the rake.
      for (const sz of [-1, 1]) {
        const NG = 5;
        for (let i = 0; i < NG; i++) {
          const t = i / NG;
          b.shell.push(box(W * (1 - t), rise / NG, T, { y: y0 + H + rise * (t + 0.5 / NG), z: sz * (D / 2 - T / 2) }));
        }
        for (const sx of [-1, 1]) {
          const len = Math.hypot(W / 2, rise), ang = Math.atan2(rise, W / 2);
          b.trim.push(xform(box(len, 0.22, 0.14), {
            rz: -sx * ang, x: sx * W / 4, y: y0 + H + rise / 2, z: sz * (D / 2 + 0.12),
          }));
        }
      }
      {
        const slope = Math.hypot(W / 2 + 0.5, rise), ang = Math.atan2(rise, W / 2 + 0.5);
        for (const sx of [-1, 1]) {
          b.roof.push(xform(box(slope, 0.22, D + 1.0), { rz: -sx * ang, x: sx * (W / 4 + 0.25), y: y0 + H + rise / 2 + 0.05 }));
        }
        b.trim.push(box(0.5, 0.2, D + 1.2, { y: y0 + H + rise + 0.1, arris: 0.04 }));
      }
      // The sliding door: a leaf hung on a rail outside the opening, with a
      // head beam over it. A hole with a leaf beside it beats a black rectangle.
      b.dark.push(box(4.4, 4.0, 0.1, { y: y0 + 2.0, z: D / 2 - T - 0.06, sharp: true }));
      b.trim.push(box(5.4, 0.26, 0.3, { y: y0 + 4.3, z: D / 2 + 0.16 }));
      b.metal.push(box(5.6, 0.09, 0.09, { y: y0 + 4.14, z: D / 2 + 0.28 }));
      b.wood.push(box(2.5, 3.9, 0.12, { x: -2.9, y: y0 + 1.98, z: D / 2 + 0.28 }));
      for (let i = 0; i < 5; i++) b.wood.push(box(0.1, 3.9, 0.05, { x: -4.0 + i * 0.55, y: y0 + 1.98, z: D / 2 + 0.35 }));
      // Loft door and its hoist beam.
      b.dark.push(box(1.9, 1.5, 0.1, { y: y0 + H + 1.25, z: D / 2 - 0.1, sharp: true }));
      b.wood.push(box(0.22, 0.22, 1.5, { y: y0 + H + 2.3, z: D / 2 + 0.6 }));

      const merged = mergeBag(b);
      const roleMat: Record<string, THREE.Material> = {
        shell: M.red, shell2: M.concrete, trim: M.cream, metal: M.steel, glass: M.glass,
        glow: M.lamp, dark: M.interior, roof: M.roof, wood: M.plank, cloth: M.cloth,
      };
      for (const [role, g] of Object.entries(merged)) {
        if (role !== 'glow' && role !== 'dark') {
          bakeTone(g, { y0: 0, y1: y0 + H + rise, grime: 0.7, bleach: 1.08, jitter: tv.jitter, tint: tv.tint, streak: 0.22 });
        }
        put(roleMat[role] ?? M.red, g, [-9, 0, -11]);
      }
      put(M.lamp, new THREE.BoxGeometry(0.6, 0.24, 0.14), [-6, 5.0, -6.4]);
    }

    // feed silo
    put(M.steel, new THREE.CylinderGeometry(1.9, 1.9, 7.5, 14), [4, 4.1, -13]);
    put(M.steel, new THREE.ConeGeometry(2.0, 1.6, 14), [4, 8.6, -13]);
    put(M.steel, new THREE.ConeGeometry(1.9, 2.2, 14).rotateZ(Math.PI), [4, 0.9, -13]);
    for (let i = 0; i < 5; i++) {
      put(M.steel, new THREE.TorusGeometry(1.95, 0.05, 4, 14).rotateX(Math.PI / 2), [4, 1.4 + i * 1.5, -13]);
    }
    // trough, hay under a tarp, signboard
    put(M.plank, box(4.4, 0.6, 1.1, { arris: 0.04 }), [6, 0.65, 4]);
    for (const sx of [-1, 1]) put(M.plank, box(0.14, 0.5, 0.9, { arris: 0.03 }), [6 + sx * 2.1, 0.25, 4]);
    for (let i = 0; i < 6; i++) {
      put(M.wood, new THREE.CylinderGeometry(0.8, 0.8, 1.5, 10).rotateZ(Math.PI / 2),
        [rng.range(-14, 12), 0.9 + (i > 3 ? 1.6 : 0), rng.range(-4, 8)], [0, rng.next() * 3, 0]);
    }
    {
      // A tarp over the stacked bales: the `max` envelope gives it the ridge
      // between the two rows that a smooth mound cannot have.
      const tarp = tarpEnvelope({
        w: 5.0, d: 3.4, skirt: 0.35, drape: 0.09,
        lumps: [
          { x: -1.2, z: 0, w: 1.7, d: 2.6, h: 1.7 },
          { x: 0.6, z: 0.2, w: 1.7, d: 2.6, h: 1.7 },
          { x: 1.9, z: -0.1, w: 1.5, d: 2.2, h: 0.95 },
        ],
      });
      put(M.cloth, tarp, [11, 0.05, -4], [0, rng.range(0, 3), 0]);
    }
    put(M.plank, new THREE.CylinderGeometry(0.13, 0.15, 4.4, 6), [13, 2.4, 12]);
    put(M.sign, new THREE.PlaneGeometry(3.4, 1.8), [13, 4.6, 12.1]);
    put(M.cream, box(3.6, 2.0, 0.16, { arris: 0.04 }), [13, 4.6, 12]);
    return { cast: true, r: 26 };
  }

  /** A fishing spot: a timber jetty on piles, a tackle shack and a boat. */
  _fishing(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    // the deck has to clear the water, whatever the ground is doing
    const deck = Math.max(1.4, WORLD.seaLevel + 1.5 - ctx.base);
    const L = 22;
    for (let i = 0; i < 10; i++) {
      const pz = -2 + (i / 9) * L;
      for (const sx of [-1.5, 1.5]) {
        put(M.plank, new THREE.CylinderGeometry(0.16, 0.18, deck + 3.4, 7), [sx, deck - 1.4, pz]);
      }
    }
    put(M.plank, new THREE.BoxGeometry(3.6, 0.16, L + 3), [0, deck, L * 0.5 - 1]);
    for (let i = 0; i < 12; i++) {
      const pz = -1.5 + (i / 11) * L;
      for (const sx of [-1.75, 1.75]) {
        put(M.plank, new THREE.CylinderGeometry(0.07, 0.08, 1.0, 5), [sx, deck + 0.5, pz]);
      }
      if (i < 11) {
        for (const sx of [-1.75, 1.75]) {
          put(M.plank, new THREE.BoxGeometry(0.06, 0.07, L / 11), [sx, deck + 0.95, pz + L / 22]);
        }
      }
    }
    // tackle shack on the bank
    put(M.plank, new THREE.BoxGeometry(4.4, 2.8, 3.6), [3.6, deck + 1.2, -3.5]);
    put(M.roof, new THREE.BoxGeometry(5.0, 0.3, 4.2), [3.6, deck + 2.7, -3.5], [0, 0, 0.09]);
    put(M.void, new THREE.BoxGeometry(1.0, 2.0, 0.14), [2.6, deck + 0.8, -1.72]);
    put(M.lamp, new THREE.BoxGeometry(0.4, 0.2, 0.12), [4.4, deck + 2.4, -1.75]);
    // rod stands, a bench, a crate
    for (let i = 0; i < 4; i++) {
      const pz = 4 + i * 4.2;
      put(M.plank, new THREE.CylinderGeometry(0.04, 0.04, 3.2, 5), [1.4, deck + 1.4, pz], [0.4, 0, 0]);
    }
    put(M.plank, new THREE.BoxGeometry(2.2, 0.12, 0.5), [-1.2, deck + 0.5, 6]);
    put(M.plank, new THREE.BoxGeometry(0.9, 0.7, 0.7), [-1.0, deck + 0.4, 12], [0, rng.next(), 0]);
    // a moored rowboat
    put(M.plank, new THREE.SphereGeometry(1.5, 10, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
      [-3.4, deck - 0.85, 13], [0, 0.3, 0], [0.62, 0.5, 1.7]);
    put(M.plank, new THREE.BoxGeometry(1.5, 0.1, 0.4), [-3.4, deck - 0.7, 13], [0, 0.3, 0]);
    return { cast: true, r: 16, noApron: true };
  }

  /**
   * A viewpoint: waymark stele, cairn, a bench. Lighthouses get a tower.
   *
   * The smallest kit and the most numerous — twenty-three of them — so the bar
   * is *legibility at range* rather than detail. A stele on a base with a
   * chamfered nosing throws two horizontals; a bench with real legs throws a
   * shadow you can sit in; a cairn is a cone of stones and not a stack of
   * spheres. All three now come through {@link BuildKit} and carry a baked tone.
   */
  _landmark(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    if (/lighthouse/.test(s.poi.id)) {
      this._apron(B, 8, 9, 21, undefined, { yaw, wear: [[4.5, 3.0, 0.8]] });
      const b = bag();
      // The tower stands on a splayed plinth and is banded at every storey:
      // a bare tapered cylinder has no scale at all against an empty sky.
      plinth(b.shell, { w: 7.4, d: 7.4, h: 0.7, proud: 0.24 });
      b.shell.push(xform(new THREE.CylinderGeometry(2.0, 3.2, 20, 18), { y: 10.7 }));
      for (let i = 0; i < 5; i++) {
        const t = i / 5, rr = 3.2 + (2.0 - 3.2) * t;
        b.trim.push(xform(new THREE.CylinderGeometry(rr * 1.05, rr * 1.07, 0.22, 18), { y: 0.7 + 20 * t + 2.0 }));
      }
      b.trim.push(xform(new THREE.CylinderGeometry(2.55, 2.35, 0.34, 18), { y: 20.9 }));
      // Gallery rail round the lamp room.
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        b.metal.push(cyl(0.035, 1.0, 4, { x: Math.cos(a) * 2.35, y: 21.6, z: Math.sin(a) * 2.35 }));
      }
      b.metal.push(xform(new THREE.TorusGeometry(2.35, 0.05, 4, 18).rotateX(Math.PI / 2), { y: 22.05 }));
      const merged = mergeBag(b);
      const tvL = toneVariant(rng, { valueAmp: 0.1, warmAmp: 0.04 });
      for (const [role, g] of Object.entries(merged)) {
        bakeTone(g, { y0: 0, y1: 22, grime: 0.72, bleach: 1.1, jitter: tvL.jitter, tint: tvL.tint, streak: 0.2 });
        put(role === 'metal' ? M.steel : role === 'trim' ? M.red : M.cream, g, [0, 0, 0]);
      }
      put(M.glass, new THREE.CylinderGeometry(1.8, 1.8, 2.4, 14), [0, 22.3, 0]);
      put(M.lamp, new THREE.SphereGeometry(1.1, 10, 8), [0, 22.3, 0]);
      put(M.rust, new THREE.ConeGeometry(2.3, 2.0, 16), [0, 24.5, 0]);
      // Keeper's cottage, with a real door and window.
      this._hut(B, world, { w: 6.5, d: 5.0, x: 4.5, z: 3.0, ry: 0.3, rng, base: 0.1 });
      return { cast: true, r: 12 };
    }
    /**
     * Local ground, relative to the deck this kit is built on.
     *
     * The stele is seated (see {@link BARE_SEAT_R}) and everything else in this
     * kit used to be pinned to that one plane — a cairn at 2.6 m, a bench at
     * 2.6 m and five boulders out to 8 m, all standing on a flat disc over
     * sloping ground. On a 1-in-6 hillside the far bench leg is then half a
     * metre in the air, which is a defect the compound gate cannot see: it goes
     * green as soon as the *stele* reaches the earth. So each piece asks for
     * the ground under itself.
     *
     * `yaw` matters: `put` composes through the kit's world rotation, so a
     * local (x, z) has to be turned into world before the terrain is asked.
     */
    const gy = (lx: number, lz: number, size = 0.8) => {
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      return seatY(this.eco, s.poi.x + lx * cy + lz * sy, s.poi.z - lx * sy + lz * cy,
        size, BARE_SEAT_R) - ctx.base;
    };
    // Waymark stele on a two-course base, its face carved.
    const b = bag();
    const tv = toneVariant(rng, { valueAmp: 0.14, warmAmp: 0.06 });
    // Bedded 1.16 m, not resting on the deck. This kit takes no apron, so its
    // base course is the only thing in the compound that meets the earth, and
    // it has to still meet it when the ground under it is drawn by a coarser
    // ring than the one it was seated against — the sag is 17.5 m at
    // `longwythe_peak` and no bedding depth covers that, but a bedded footing
    // is what a waymark that has stood for a century looks like anyway, and it
    // buys back the first metre of it for free. The upper course line is
    // unchanged, so the silhouette is the same one `kits-r11` was read at.
    b.shell.push(box(2.4, 1.35, 1.8, { y: -0.48, arris: 0.05 }));
    b.shell.push(box(2.0, 0.26, 1.5, { y: 0.44, arris: 0.05 }));
    b.shell.push(xform(box(1.15, 3.3, 0.55, { arris: 0.055 }), { rz: rng.gauss(0, 0.03), y: 2.2 }));
    b.trim.push(box(1.35, 0.2, 0.75, { y: 3.92, arris: 0.04 }));
    const merged = mergeBag(b);
    for (const [role, g] of Object.entries(merged)) {
      bakeTone(g, { y0: 0, y1: 4, grime: 0.66, bleach: 1.08, jitter: tv.jitter, tint: tv.tint, streak: 0.2 });
      // One material, deliberately. A contrasting cap on the stele would be a
      // second material and therefore a second draw call, on **twenty-three**
      // landmarks -- and the cap's read comes from its shadow and its baked
      // tone, neither of which needs a different colour. Cost here is draws.
      put(M.stone, g, [0, 0, 0]);
      void role;
    }
    put(M.runeface, new THREE.PlaneGeometry(0.85, 1.7), [0, 2.4, 0.30]);
    // Cairn: a cone of set stones, wider at the foot than a stack of spheres.
    // Its foot sits on the ground under the cairn, 2.6 m off the stele, not on
    // the stele's plane -- 250 mm of it buried so the bottom course beds in.
    const cy0 = gy(2.6, -1.4, 1.4) - 0.25;
    let h = 0;
    for (let i = 0; i < 11; i++) {
      const r = 0.5 * (1 - i / 13);
      const ring = i < 3 ? 3 : i < 7 ? 2 : 1;
      for (let k = 0; k < ring; k++) {
        const a = (k / ring) * 6.28 + i * 1.1;
        put(M.dark, new THREE.DodecahedronGeometry(r * rng.range(0.8, 1.15), 0),
          [2.6 + Math.cos(a) * r * (ring > 1 ? 0.85 : 0), cy0 + h + r * 0.7, -1.4 + Math.sin(a) * r * (ring > 1 ? 0.85 : 0)],
          [rng.gauss(0, 0.3), rng.next() * 3, rng.gauss(0, 0.3)]);
      }
      h += r * 0.95;
    }
    // Bench facing the view: a slatted seat on two real legs, not a floating
    // slab — and each leg on the ground under *that* leg, so the bench racks
    // with the slope the way a bench left on a hillside does.
    const bx = -2.6, bz = 1.2, bry = rng.gauss(0, 0.2);
    const legX = (sx: number) => bx + sx * 0.95 * Math.cos(bry);
    const legZ = (sx: number) => bz - sx * 0.95 * Math.sin(bry);
    const legY = [-1, 1].map((sx) => gy(legX(sx), legZ(sx), 0.5));
    const seatTop = Math.max(legY[0], legY[1]) + 0.62;
    for (let i = 0; i < 3; i++) {
      put(M.plank, box(2.4, 0.07, 0.16, { arris: 0.015 }), [bx, seatTop, bz - 0.18 + i * 0.18], [0, bry, 0]);
    }
    [-1, 1].forEach((sx, k) => {
      // The leg is stretched to reach its own ground rather than translated:
      // moving it would leave the seat resting on one leg and hanging over the
      // other, which is the same floating-corner bug one level down.
      const hgt = seatTop - 0.04 - legY[k];
      put(M.dark, box(0.28, hgt, 0.5, { arris: 0.04 }), [legX(sx), legY[k] + hgt * 0.5, legZ(sx)], [0, bry, 0]);
    });
    for (let i = 0; i < 5; i++) {
      const a = rng.next() * 6.28, d = rng.range(3.5, 8);
      const sr = rng.range(0.4, 1.1);
      const bxx = Math.cos(a) * d, bzz = Math.sin(a) * d;
      // Field boulders, on the ground they lie on and a third of the way into
      // it. Pinned to the deck they were the mesh that decided the compound's
      // float number at `keycatrich_ruins` -- eight metres from the stele and
      // reading for the whole waymark.
      put(M.stone, new THREE.DodecahedronGeometry(sr, 0),
        [bxx, gy(bxx, bzz, sr * 2) + sr * 0.62, bzz], [rng.gauss(0, 0.4), rng.next() * 3, rng.gauss(0, 0.4)]);
    }
    return { cast: true, r: 9, noApron: true };
  }

  /**
   * A menace lair: a sealed sigil in a ring of leaning stones.
   *
   * It was a pale disc with nine `roughBox` slabs standing on it and a magenta
   * ring lying flat — a coaster with matchsticks
   * (`tmp/shots/kits-r0b/poi_costlemark_menace.png`). What a sealed thing needs
   * is **enclosure**: the sigil sits *down* in a dished court behind a kerb,
   * the stones are trilithons rather than posts, and the whole ring is dark
   * against the ground rather than paler than it.
   */
  _menace(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0], [1.3, 1.3, 1.3]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 12, 9, 83, undefined, { yaw, wear: [[0, 3.2, 1.2]] });

    const b = bag();
    const tv = toneVariant(rng, { valueAmp: 0.12, warmAmp: 0.03 });
    // The court: a kerb ring standing proud, the floor dished inside it. A flat
    // disc lying on the ground has no inside; a kerb makes one.
    const R = 9.6;
    const NK = 22;
    for (let i = 0; i < NK; i++) {
      const a = (i / NK) * Math.PI * 2, a2 = ((i + 1) / NK) * Math.PI * 2;
      const mx = (Math.cos(a) + Math.cos(a2)) * 0.5 * R, mz = (Math.sin(a) + Math.sin(a2)) * 0.5 * R;
      const len = Math.hypot(Math.cos(a2) - Math.cos(a), Math.sin(a2) - Math.sin(a)) * R;
      b.shell.push(xform(box(len + 0.12, 0.72, 1.1, { arris: 0.06 }), {
        ry: -(a + a2) * 0.5 + Math.PI / 2, x: mx, y: 0.2, z: mz,
      }));
    }
    b.shell.push(xform(new THREE.CylinderGeometry(R - 0.5, R - 0.9, 0.55, 24), { y: -0.16 }));

    // Trilithons: pairs of leaners with a lintel across, so the ring has a
    // silhouette with holes in it rather than a fence of sticks.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const h = rng.range(3.6, 5.4);
      const gap = 1.5;
      for (const sk of [-1, 1]) {
        const px = Math.cos(a) * (R - 1.1) - Math.sin(a) * sk * gap;
        const pz = Math.sin(a) * (R - 1.1) + Math.cos(a) * sk * gap;
        b.shell.push(xform(box(1.15, h, 0.85, { arris: 0.08 }), {
          rz: Math.cos(a) * 0.07, rx: -Math.sin(a) * 0.07, ry: -a, x: px, y: 0.4 + h / 2, z: pz,
        }));
      }
      if (rng.next() < 0.7) {
        b.shell.push(xform(box(gap * 2 + 1.3, 0.75, 0.95, { arris: 0.07 }), {
          ry: -a + Math.PI / 2, x: Math.cos(a) * (R - 1.1), y: 0.4 + h + 0.38, z: Math.sin(a) * (R - 1.1),
        }));
      }
    }
    // Four solitary leaners between them, some snapped.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 1.0;
      const h = rng.range(2.0, 4.6);
      b.shell.push(xform(box(1.0, h, 0.75, { arris: 0.08 }), {
        rz: rng.gauss(0, 0.16), ry: -a, x: Math.cos(a) * (R - 1.4), y: 0.4 + h / 2, z: Math.sin(a) * (R - 1.4),
      }));
    }

    const merged = mergeBag(b);
    for (const [role, g] of Object.entries(merged)) {
      // Dark and getting darker toward the seal: this is a place with something
      // under it, and value is how that reads before any glow does.
      bakeTone(g, { y0: -0.4, y1: 6.0, grime: 0.5, bleach: 0.86, jitter: tv.jitter, tint: tv.tint, streak: 0.2 });
      put(role === 'trim' ? M.stone : M.dark, g, [0, 0, 0]);
    }

    // The seal, sunk in the dish, and the stair that goes down past it.
    put(M.arcane, new THREE.RingGeometry(2.0, 3.4, 32).rotateX(-Math.PI / 2), [0, 0.16, 0]);
    put(M.arcane, new THREE.RingGeometry(0.5, 0.9, 20).rotateX(-Math.PI / 2), [0, 0.17, 0]);
    put(M.void, new THREE.CircleGeometry(1.9, 24).rotateX(-Math.PI / 2), [0, 0.1, 0]);
    for (let i = 0; i < 6; i++) {
      put(M.dark, box(3.4 - i * 0.12, 0.28, 0.7, { arris: 0.04 }), [0, 0.02 - i * 0.3, 2.3 + i * 0.72]);
    }
    for (const sx of [-1, 1]) {
      put(M.dark, box(0.4, 2.2, 4.6, { arris: 0.06 }), [sx * 2.0, -0.85, 4.0]);
    }
    return { cast: true, r: 13 };
  }

  /**
   * A dungeon mouth: a corbelled portal cut into a rubble mound.
   *
   * The jambs and lintel were three `roughBox` slabs against a squashed sphere.
   * A portal is read from its **depth** — the reveal, the relieving arch over
   * the lintel and the shadow inside — and from the *approach*, because a hole
   * in a hill that nobody has worn a path to is scenery, not an entrance.
   */
  _dungeon(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0], [1.35, 1.35, 1.35]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 11, 9, 29, undefined, { yaw, wear: [[0, 2.5, 1.4]] });
    // the mound the portal is cut into
    put(M.dark, new THREE.SphereGeometry(9, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
      [0, -0.6, -4], [0, 0, 0], [1, 0.62, 1]);

    const b = bag();
    const tv = toneVariant(rng, { valueAmp: 0.12, warmAmp: 0.05 });
    // Jambs: three courses each, stepping *forward* as they rise, so the head
    // corbels out over the opening and throws a shadow onto the reveal.
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        b.shell.push(box(1.35 + k * 0.1, 1.9, 1.7 + k * 0.22, {
          x: sx * (2.4 - k * 0.04), y: 0.95 + k * 1.9, z: 0.5 + k * 0.11, arris: 0.07,
        }));
      }
    }
    b.shell.push(box(6.9, 1.2, 2.35, { y: 6.3, z: 0.72, arris: 0.08 }));      // lintel
    b.shell.push(box(7.7, 0.72, 2.9, { y: 7.25, z: 0.78, arris: 0.07 }));     // relieving course
    b.trim.push(box(8.1, 0.18, 3.2, { y: 7.68, z: 0.8, arris: 0.04 }));        // capping
    b.trim.push(box(7.9, 0.07, 0.07, { y: 7.5, z: 2.3 }));                     // drip lip
    // Reveal: a lining set back inside the jambs, which is what gives the mouth
    // its depth. Without it the doorway is a dark rectangle painted on rock.
    for (const sx of [-1, 1]) b.trim.push(box(0.22, 5.1, 1.5, { x: sx * 1.78, y: 2.55, z: -0.2, arris: 0.03 }));
    b.trim.push(box(3.8, 0.22, 1.5, { y: 5.1, z: -0.2, arris: 0.03 }));
    // Threshold and two worn steps up to it.
    for (let k = 0; k < 2; k++) b.shell.push(box(5.4 - k * 0.6, 0.3, 1.3, { y: 0.15 + k * 0.3, z: 2.3 + k * 1.2, arris: 0.05 }));

    const merged = mergeBag(b);
    for (const [role, g] of Object.entries(merged)) {
      bakeTone(g, { y0: 0, y1: 8, grime: 0.62, bleach: 1.02, jitter: tv.jitter, tint: tv.tint, streak: 0.22 });
      put(role === 'trim' ? M.concrete : M.stone, g, [0, 0, 0]);
    }
    put(M.void, new THREE.BoxGeometry(3.6, 5.0, 0.3), [0, 2.5, -0.5]);
    put(M.runeface, new THREE.PlaneGeometry(2.6, 0.9), [0, 6.3, 1.92]);
    // braziers and spill
    for (const sx of [-3.9, 3.9]) {
      put(M.dark, new THREE.CylinderGeometry(0.42, 0.3, 1.0, 8), [sx, 0.5, 2.4]);
      put(M.hot, new THREE.SphereGeometry(0.36, 8, 6), [sx, 1.15, 2.4]);
    }
    for (let i = 0; i < 14; i++) {
      const a = rng.range(-1.7, 1.7), d = rng.range(3, 9);
      put(M.stone, new THREE.DodecahedronGeometry(rng.range(0.25, 0.95), 0),
        [Math.sin(a) * d, 0.2, Math.cos(a) * d + 1], [rng.gauss(0, 0.5), rng.next() * 3, rng.gauss(0, 0.5)]);
    }
    return { cast: true, r: 11 };
  }

  // ---------------------------------------------------------------- stream

  /**
   * Places another system already builds, and how close a POI may come.
   *
   * The radius is **per kind, and it was not**. One flat 130 m ban round every
   * dungeon entrance and the town suppressed **ten of the 123 POIs**, including
   * three of the ten royal tombs and three of the eight menace lairs — because
   * in FFXV a royal tomb sits *at* its dungeon, which is the whole point of it.
   * Measured in the page rather than reasoned about: `tomb_wise` is 68 m from
   * the Keycatrich entrance, `tomb_conqueror` 68 m from Balouve, and each of
   * them returned an empty group. `src/game/Shots.ts` has a `poi_tomb` shot
   * aimed at `tomb_wise`; it has been photographing bare hillside.
   *
   * The ban exists so `_dungeon` does not build a second portal on top of the
   * one `Dungeons` already placed, and so nothing lands inside Hammerhead's
   * graded pad. Neither of those is a reason to delete the tomb next door. So
   * a *dungeon-type* POI still keeps its distance from a real entrance, the
   * town still clears everything, and everything else only has to not overlap.
   */
  _exclude(game: Game): { x: number; z: number; r: number; sameOnly: string | null }[] {
    if (this._exclusions) return this._exclusions;
    const out: { x: number; z: number; r: number; sameOnly: string | null }[] = [];
    const d = game.get('Dungeons');
    if (d) for (const e of d.entrances) out.push({ x: e.pos.x, z: e.pos.z, r: 130, sameOnly: 'dungeon' });
    // `origin` is declared but only assigned when the town builds, so this
    // guard is about *when* we are asked, not about whether the field exists.
    const t = game.get('Town');
    if (t && t.origin) out.push({ x: t.origin.x, z: t.origin.z, r: 130, sameOnly: null });
    this._exclusions = out;
    return out;
  }

  _make(site: PoiSite, game: Game) {
    const p = site.poi;
    for (const e of this._exclude(game)) {
      // A dungeon entrance only bans another dungeon mouth; the 40 m floor is
      // "do not build inside the thing that is already there".
      const r = e.sameOnly && e.sameOnly !== p.type ? 40 : e.r;
      if (Math.hypot(e.x - p.x, e.z - p.z) < r) { site.group = new THREE.Group(); return; }
    }
    const rng = new Rng(hashId(p.id));
    const dress = dressAt(p.x, p.z);
    const yaw = this._yaw(p, rng);
    const B = new PartBuilder();
    const probe = p.type === 'town' ? 40 : p.type === 'imperial' ? 26 : 10;
    const cull = SEAT_BY_TYPE[p.type] || SEAT_R;
    // A kit with an apron is seated at its footprint's 88th percentile and the
    // earthwork covers the difference. A kit with none has to meet the ground
    // where it stands: see {@link BARE_SEAT_R}. `_base`'s grid is what put
    // `keycatrich_ruins` 2.92 m over its own grade -- the deck landed on the
    // upper clamp, `h0 + 3.2`, because the hill rises inside ten metres, and a
    // stele with no pad simply stood on the top of that column of air.
    const base = seatsBare(p)
      ? seatY(this.eco, p.x, p.z, 2.4, BARE_SEAT_R)
      : this._base(p.x, p.z, probe, 2.2, cull);
    // Published before the kit runs, so `_apron` can grade against the real
    // ground without every kit having to carry the coordinates itself.
    this._padCtx = { x: p.x, z: p.z, base, cull };
    this._padStats = null;
    const res = site.fn.call(this, B, site, { rng, dress, yaw, base }) || {};
    const g = new THREE.Group();
    g.name = `poi_${p.type}_${p.id}`;
    g.position.set(p.x, base, p.z);
    B.build(g, { cast: false, receive: true, name: p.type });
    this.root.add(g);
    site.group = g;
    this.built.push({
      ...site,
      group: g,
      canCast: res.cast !== false,
      radius: res.r || 20,
      draw: DRAW_BY_TYPE[p.type as keyof typeof DRAW_BY_TYPE] || DRAW_R,
    });
  }

  /**
   * @param dt @param t @param night
   * @param camPos @param game
   */
  update(dt: number, t: number, night: number, camPos: THREE.Vector3, game: Game) {
    // build at most one POI per frame, nearest first
    let best: PoiSite | null = null, bestD = BUILD_R * BUILD_R;
    for (const s of this.sites) {
      if (s.group) continue;
      const dx = s.poi.x - camPos.x, dz = s.poi.z - camPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = s; }
    }
    if (best) this._make(best, game);

    for (const s of this.built) {
      const dx = s.poi.x - camPos.x, dz = s.poi.z - camPos.z;
      const d2 = dx * dx + dz * dz;
      const vis = d2 < s.draw * s.draw;
      if (s.group.visible !== vis) s.group.visible = vis;
      const cast = s.canCast && d2 < 90 * 90;
      if (s.casting !== cast) {
        s.casting = cast;
        for (const m of s.group.children) m.castShadow = cast;
      }
    }
    const M = this.mats;
    if (M) {
      M.lamp.emissiveIntensity = 0.3 + night * 1.15;
      M.hot.emissiveIntensity = 1.1 + night * 1.9 + Math.sin(t * 5.3) * 0.12;
      M.rune.emissiveIntensity = 0.9 + night * 1.8 + Math.sin(t * 1.4) * 0.1;
      M.arcane.emissiveIntensity = 0.8 + night * 1.6 + Math.sin(t * 0.9 + 1) * 0.15;
      M.runeface.emissiveIntensity = 0.4 + night * 1.5;
    }
    void _v;
  }
}

/** Stable 32-bit hash of a POI id, so every kit varies but never drifts. */
function hashId(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

import * as THREE from 'three';
import { Noise } from '../../util/Noise.ts';
import { srgb } from '../../util/TextureGen.ts';
import type { VegBiome } from './Biomes.ts';
import type { EcoSite, SiteType } from '../props/EcoSites.ts';
import type { Terrain } from '../Terrain.ts';
import { vegAt, zoneMoist, pickFrom } from './Biomes.ts';
import { WORLD, worldMap } from '../map/WorldMap.ts';
import type { Game } from '../../game/Game.ts';
import type { ErosionSample } from '../terrain/Field.ts';
import { beachMask } from '../terrain/Field.ts';
import { maternScatter } from './Cluster.ts';
import { PAD_R } from '../props/PoiKits.ts';
import type { WaterMask } from '../water/WaterMask.ts';
import type { ClusterPoint } from './Cluster.ts';

// `hash3` moved down to `Cluster.ts` — this file is the layer above it — and is
// re-exported here so `Trees`, `Bushes`, `Rocks`, `Debris` and the probes that
// import it from `Ecology` are unaffected.
export { hash3 } from './Cluster.ts';

/**
 * Shared world-sampling layer used by both Vegetation and Props.
 *
 * Everything placed in the world asks this object three questions:
 *   "how high / how steep is the ground here?"  -> height/normal/slope01
 *   "how wet and how hot is it?"                -> moisture/aridity
 *   "am I allowed to grow here?"                -> grassDensity/scrubDensity/treeDensity
 *
 * It also owns the road centreline and the deterministic list of landmark
 * sites, so vegetation can carve clearings around structures that Props has
 * not built yet (Props initialises after Vegetation).
 *
 * **The climate comes from the cartography, not from noise.** Every "is it wet
 * here" question is answered by `WorldMap`'s blended `moist` biome parameter
 * (via `veg/Biomes.ts`), with fbm only as local variation on top. It used to be
 * pure fbm, which is why an 8 km world with nineteen authored zones grew one
 * biome — dry Leide scrub — from the Vesperpool to Malmalam Thicket.
 */

const _v = new THREE.Vector3();

// Authored palette (sRGB in, linear out) — Leide ochre through Duscae green.
const C_SOIL_DRY = srgb(0x9a7448);
const C_SOIL_RED = srgb(0x7e4b30);
const C_SOIL_WET = srgb(0x4c4a30);
const _tmpA = new THREE.Color();
const _tmpB = new THREE.Color();

/**
 * How far a pad's clearing skirt reaches, as a multiple of the pad's own
 * radius, for the POI types that have no `FRAC` catchment entry.
 *
 * 2.2 is chosen so a 13 m tomb pad stops mattering by 29 m -- far enough that
 * the plateau's edge is not a visible ring of grass, near enough that a
 * waymark does not sterilise a hillside. Types that DO have a `FRAC` keep
 * their authored catchment; this only ever raises a radius, never lowers one.
 */
const PAD_SKIRT = 2.2;

/** One cleared disc around a settlement, and how far its clearing reaches. */
interface Clearing {
  x: number;
  z: number;
  /** Clearing radius, metres — where the skirt reaches zero. */
  r: number;
  /** The built pad's own radius. Inside this the clearing is exactly 1. */
  inner: number;
}

/** The clearings bucketed into a coarse grid, for a cheap point query. */
interface ClearingGrid {
  /** Cell size, metres. */
  cell: number;
  /** `i * 65536 + j` -> the clearings overlapping that cell. */
  grid: Map<number, Clearing[]>;
}

/** Extra per-caller bias on a clustered scatter — zone dressing, budgets. */
export interface ScatterBias {
  /** Multiplied into the PARENT's suitability. Never evaluated at a child. */
  bias?: (x: number, z: number) => number;
  /** Cap on emitted instances; truncation is hash-shuffled, not scan-order. */
  maxCount?: number;
}

/**
 * Radius-aware separation, as {@link Cluster.maternScatter} takes it.
 *
 * Every scatter here now passes a default pair; a caller overriding them is
 * overriding a measured number, so re-run `src/tools/scatterstat.mts`.
 */
export interface ScatterSep {
  /** Metres this instance claims. Two are separated at `(r1 + r2) * slack`. */
  radius?: (x: number, z: number, u: number, k: string) => number;
  /** Separation slack. **0 skips the pass entirely** — that is not a default. */
  slack?: number;
}

export class Ecology {
  nPatch!: Noise;
  _clearings!: ClearingGrid;
  _terrainRoad!: boolean;
  game!: Game;
  nGrove!: Noise;
  nMoist!: Noise;
  nTint!: Noise;
  seed!: number;
  /** The authored landmark sites: haven, campsite, the Regalia's layby. */
  sites!: EcoSite[];
  terrain!: Terrain;
  worldRadius!: number;
  /** Reused erosion sample. `erosionAt` writes into it and returns it. */
  _ero!: ErosionSample;
  /** `Water.mask`, resolved on first use; `undefined` until then. See {@link _mask}. */
  _wmask?: WaterMask | null;
  /**
   * @param game the Game instance (needs .get('Terrain'))
   * @param seed master seed
   */
  constructor(game: Game, seed: number = 1337) {
    this.game = game;
    // `Ecology` is built by `Vegetation.init` and `Props.init`, both of which
    // run after `Terrain` in `Game.init`'s one boot order.
    this.terrain = game.get('Terrain')!;
    this.seed = seed;

    this.nMoist = new Noise(seed ^ 0x51ab3);
    this.nPatch = new Noise(seed ^ 0x9e377);
    this.nGrove = new Noise(seed ^ 0x2f1d5);
    this.nTint = new Noise(seed ^ 0x77c19);
    this._ero = { accum: 0, deposit: 0, scree: 0, wet: 0, rock: 0, flowX: 0, flowZ: 0 };

    const tsize = (this.terrain && this.terrain.size) || 1400;
    this.worldRadius = Math.min(4200, tsize * 0.5 - 40);

    // Does the terrain own a road? If so defer to it.
    this._terrainRoad = !!(this.terrain && typeof this.terrain.roadCenterX === 'function');

    this.sites = this._layoutSites();
    this._clearings = this._layoutClearings();
  }

  /**
   * Places the world map says people have cleared.
   *
   * `sites` only knows about the handful of landmarks Vegetation authored near
   * the origin. Once the forest streams across all 8 km it will happily close
   * over Lestallum, Wiz's paddocks and every turning circle, so the 124 POIs
   * get a say too. Two radii per POI: a **plateau** at the built pad's own
   * `PoiKits.PAD_R`, where the clearing is exactly 1, and a **skirt** running
   * out to a *fraction* of the discovery radius — a town really is cleared for
   * 130 m, while a landmark ("Longwythe Peak", r = 520) is cleared only for the
   * 8 m of waymark deck it actually built.
   *
   * That second half is why `FRAC` is not the whole story and a missing key is
   * not a "no clearing" instruction. `tomb` and `landmark` have none — 33 of
   * the 124 POIs — and before the pad term they were the only two types with no
   * clearing of any kind, which is not what the table meant to say about a
   * built stone deck.
   */
  _layoutClearings() {
    const FRAC = {
      town: 0.62, outpost: 0.5, reststop: 0.5, parking: 0.95, imperial: 0.5,
      chocobo: 0.62, dungeon: 0.3, haven: 0.9, fishing: 0.45, menace: 0.3,
    };
    const cell = 256;
    const grid = new Map();
    for (const p of worldMap.pois) {
      // `PAD_R` is the built pad's own radius, published by `props/PoiKits.ts`
      // rather than copied here, because a copy drifts the first time a kit is
      // retuned. It is the *plateau*; `FRAC * p.r` is the catchment the
      // plateau's skirt runs out over. A POI with no `FRAC` entry -- a tomb, a
      // waymark landmark -- still gets its pad, which is the whole point:
      // before this, 33 of the 124 POIs had no clearing of any kind.
      const pad = PAD_R[p.type] ?? 0;
      const f = FRAC[p.type as keyof typeof FRAC] ?? 0;
      const r = Math.max(p.r * f, pad * PAD_SKIRT);
      if (r <= 0) continue;
      // The plateau can never eat its own skirt: a kit whose pad is most of its
      // catchment (parking is 0.95 of a small `r`) keeps a ramp rather than
      // becoming a cliff edge in the density field.
      const inner = Math.min(pad, r * 0.85);
      const i0 = Math.floor((p.x - r) / cell), i1 = Math.floor((p.x + r) / cell);
      const j0 = Math.floor((p.z - r) / cell), j1 = Math.floor((p.z + r) / cell);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const k = i * 65536 + j;
          let a = grid.get(k);
          if (!a) { a = []; grid.set(k, a); }
          a.push({ x: p.x, z: p.z, r, inner });
        }
      }
    }
    return { cell, grid };
  }

  /**
   * 1 where a settlement or camp has cleared the ground, 0 in open country.
   *
   * **A plateau and a skirt, not a cone, and the cone was a measured bug.**
   * This used to return `1 - d / r` with `r` the settlement's *catchment*
   * radius, so the value only reached 1 at the exact centre and at the built
   * pad's own edge it was still most of the way to open country. Grass is the
   * one population with no hard reject -- only a density multiply and a
   * `d < 0.02` cut -- so it survived that. The landmarks lane measured it over
   * 4 000 uniform samples per pad: **every other population is rejected on 100%
   * of the pad and grass passes its gate on 97-99% of it**, standing up to
   * 0.57 m proud of the kit's own top surface.
   *
   * So: exactly 1 inside `PoiKits.PAD_R`, then linear to 0 at the catchment
   * edge. The skirt is what keeps a plaza from ending in a ring of full-height
   * grass one texel outside the pad.
   */
  poiClear(x: number, z: number) {
    const { cell, grid } = this._clearings;
    const a = grid.get(Math.floor(x / cell) * 65536 + Math.floor(z / cell));
    if (!a) return 0;
    let b = 0;
    for (let i = 0; i < a.length; i++) {
      const s = a[i];
      const d = Math.hypot(x - s.x, z - s.z);
      if (d >= s.r) continue;
      b = Math.max(b, d <= s.inner ? 1 : 1 - (d - s.inner) / (s.r - s.inner));
      if (b >= 1) return 1;
    }
    return b;
  }

  /**
   * How much of this point has been cleared by people, 0..1 — the union of the
   * authored landmark sites and the world map's POI pads.
   *
   * **Every density must multiply by `1 - cleared`, and for most of this file's
   * life two of the three did not.** `treeDensity` took `siteBlock` *and*
   * `poiClear`; `grassDensity` and `scrubDensity` took only `siteBlock`, which
   * knows about the handful of landmarks near the origin and nothing about the
   * 124 POIs. Measured before the fix, at the pad centres: Galdin Quay's plaza
   * `grassDensity` 0.746, Schier Heights parking `scrubDensity` 0.587, and
   * `poiClear` exactly 1.00 at both. Hammerhead only read 0.003 because it has
   * an authored `site` sitting on top of it, which is why the symptom looked
   * like a Hammerhead-specific mystery rather than what it was: grass and scrub
   * growing through every town plaza and every outpost pad in the world, while
   * the trees correctly stopped at the edge.
   *
   * This is the *disc* half of the exclusion. The per-building half —
   * `PoiKits._exclusions` — is published and has **no consumer anywhere in the
   * tree**; it cannot be one from here, because `Props` initialises after
   * `Vegetation` and this object is built by both.
   */
  cleared(x: number, z: number) {
    return Math.max(this.siteBlock(x, z), this.poiClear(x, z));
  }

  // ---------------------------------------------------------------- terrain

  /**
   * The erosion pass's own outputs at this point (plan §2.4).
   *
   * Every channel is a **percentile**, so `wet > 0.9` means *wetter than 90% of
   * the world*, at any resolution and under any erosion tuning. Measured over
   * 40 000 land samples: `wet` and `accum` are near-uniform (mean 0.505 /
   * 0.500, no zeros), `scree` is 83.2% zero with p95 = 0.40 — it is a sparse
   * mask, not a field, and terms built on it must expect that.
   *
   * **Do not substitute `sampleMaterial().flow` for `accum`**: that channel is
   * blurred and log-normalised for the shader and reads above 0.2 on 46% of the
   * world where the raw field is exactly zero on 31.5%.
   *
   * The returned object is shared scratch — read it, do not keep it.
   */
  erosion(x: number, z: number): ErosionSample {
    return this.terrain.erosionAt(x, z, this._ero);
  }

  /** Ground height — the analytic surface, at full detail. */
  height(x: number, z: number) { return this.terrain.heightAt(x, z); }

  /**
   * Ground height for something that is only ever SEEN from far away (§2.6).
   *
   * A clipmap lattice cannot carry relief finer than its own spacing, so the
   * surface actually drawn at 1 km is a low-passed version of the one
   * {@link height} returns, and anything planted on the analytic height floats
   * above it by whatever the low-pass removed. OGL's note is the right one: *a
   * floating tree at the skyline is much louder than a slightly buried one*, so
   * the sink is one-sided — `seatHeightAt` takes the minimum over every ring
   * that could draw the point and never raises anything.
   *
   * Measured here in bare Node against the baked field, 4 000 samples on ground
   * with `treeDensity > 0.05`, planted height minus the height the coarse mesh
   * actually draws:
   *
   * | ring | viewCell | > 0.5 m | > 2 m | p99 | max |
   * |---|---|---|---|---|---|
   * | tree geometry (250 m) | 3 m | 1.6% | 0.0% | 0.61 m | 1.28 m |
   * | tree impostor (330 m) | 6 m | 12.8% | 0.1% | 1.25 m | 2.46 m |
   * | far canopy card (1250 m) | 24 m | **27.1%** | **10.6%** | 8.48 m | 19.51 m |
   *
   * So the geometry ring is fine, the impostor ring is marginal, and **one far
   * stand card in ten hangs more than two metres clear of the hillside it is
   * meant to be growing out of.** The mean float is *negative* (-0.43 m): half
   * of them are already buried, which is why this never showed up as a
   * systematic offset anyone could have spotted in a frame average — it is
   * entirely a positive tail, and the tail is at the skyline.
   *
   * @param size the body's own height, metres — a tall body reads through
   *   coarser rings once the camera backs off past its own footprint
   * @param dist the distance at which this instance is still drawn (its cull or
   *   LOD range), NOT its distance from the camera now: the tile is built once
   *   and the seat has to be right for the whole band it is visible over
   */
  farSeat(x: number, z: number, size: number, dist: number) {
    return this.terrain.seatHeightAt(x, z, size, this.terrain.clipSpacingForDistance(dist));
  }

  /** Ground normal, computed locally so we never depend on Terrain's out-param. */
  normal(x: number, z: number, out = _v) {
    const e = 0.7, t = this.terrain;
    const hL = t.heightAt(x - e, z), hR = t.heightAt(x + e, z);
    const hD = t.heightAt(x, z - e), hU = t.heightAt(x, z + e);
    return out.set(hL - hR, 2 * e, hD - hU).normalize();
  }

  /** 0 = dead flat, 1 = vertical cliff. */
  slope01(x: number, z: number) {
    const n = this.normal(x, z, _v);
    return 1 - Math.max(0, Math.min(1, n.y));
  }

  // ---------------------------------------------------------------- climate

  /**
   * 0 = bone dry Leide badlands, 1 = humid Duscae basin.
   *
   * The cartography is the authority: `zoneMoist` is the blend of every zone's
   * authored `moist` parameter at this point, and the fbm terms are local
   * variation *within* a zone, never enough to turn the Nebulawood into
   * badland. The old version was fbm alone plus an absolute-height penalty,
   * which made every highland arid and every zone identical.
   */
  moisture(x: number, z: number) {
    const zm = zoneMoist(x, z);
    let m = 0.10 + 0.92 * zm;
    m += (this.nMoist.fbm2(x * 0.0013, z * 0.0013, 4)) * 0.16;
    m += this.nMoist.fbm2(x * 0.006 + 40, z * 0.006 - 17, 2) * 0.07;
    // ground at or below the water plane is saturated whatever the zone says
    const h = this.height(x, z);
    m += THREE.MathUtils.clamp((WORLD.seaLevel + 6 - h) * 0.014, 0, 0.22);
    return THREE.MathUtils.clamp(m, 0, 1);
  }

  /** The vegetation recipe for this point. @returns */
  veg(x: number, z: number): VegBiome { return vegAt(x, z); }

  /**
   * The water surface over this point — **not** `WORLD.seaLevel`.
   *
   * This was `WORLD.seaLevel` for the whole life of the file, and it is the
   * fourth time that one assumption has produced a bug: `Fishing._survey`
   * called four tarns dry with water six metres from the pin, `rasterChart`
   * painted no blue under any of them, `PoiKits._fishing` built a jetty on dry
   * rock — and here, every population grew straight up through the rivers and
   * the tarns, because a reach at +180 m is not within two hundred metres of
   * the sea plane and so `waterDepth` came back at −190.
   *
   * `Water.mask` is the single answer, derived from the sheet that is actually
   * drawn (`water/WaterMask.ts`). Floored at the sea plane, so ground no body
   * and no river covers behaves exactly as it did — which is the property that
   * keeps the Vesperpool a drowned forest. Its floor is 20 m *below* the sea
   * plane, so it is already sea, already covered by the floor, and this change
   * cannot move a single tree in it: the level here only ever goes UP.
   */
  waterLevel(x: number, z: number) {
    const m = this._mask();
    if (!m) return WORLD.seaLevel;
    const lv = m.levelAt(x, z);
    return lv > WORLD.seaLevel ? lv : WORLD.seaLevel;
  }

  /**
   * `Water.mask`, or null when there is no `Water` — the scatter probes build
   * an `Ecology` over a bare `Terrain`, and the samplers must still answer.
   *
   * Resolved lazily and once. `Vegetation` and `Props` both initialise after
   * `Water`, so the first call is always after the mask exists; asking in the
   * constructor would cache the null.
   */
  _mask(): WaterMask | null {
    if (this._wmask !== undefined) return this._wmask;
    const w = this.game && typeof this.game.get === 'function'
      ? (this.game.get('Water') as { mask?: WaterMask } | null) : null;
    const m = w && w.mask;
    this._wmask = m && typeof m.levelAt === 'function' ? m : null;
    return this._wmask;
  }

  /**
   * Metres of water over this point, negative on dry land. Reeds want the
   * 0..1.2 m band, lily pads want > 0.4 m of standing water.
   */
  waterDepth(x: number, z: number) { return this.waterLevel(x, z) - this.height(x, z); }

  /**
   * How far onto a **strandline** this point is: 1 at the waterline, 0 by
   * `band` metres of elevation above it — and zero anywhere that is not an
   * authored beach.
   *
   * Every population here grew to the water's edge and stopped, because the
   * only water test any of them had was `waterDepth > 0.15` (`0.3` for a tree)
   * — a predicate about being *submerged*. On a coast that shelved twenty
   * metres in twenty that was invisible. Now that `Field._beachShelf` has given
   * Galdin Quay a real foreshore — 4 m of rise over 78 m of sand, measured by
   * `probes/beachrun.mts` — it is not invisible at all: the tree line came out
   * standing IN the swash, because the ground a tree wants is a few centimetres
   * above the sea for the whole width of the beach.
   *
   * A strand is not a place plants are drowned. It is a place they are salted,
   * scoured and buried, and the real signature is a **zonation**: bare wet
   * sand, then dune tussock, then scrub, then trees well back from the water.
   * So this is an elevation ramp per population, not one reject for all three.
   *
   * **Gated on `Field.beachMask`, and that is the load-bearing part.** Height
   * above the sea plane cannot tell a foreshore from the margin of the
   * Vesperpool, which is authored as a *drowned forest* and whose floor is
   * 20 m below the water plane — a world-wide rule in these units would strip
   * the trees out of it to fix Galdin. The site list is the only thing that
   * knows which coast is sand, and it is one array in `Field.ts`.
   *
   * @param band metres of elevation above the sea plane this population needs
   */
  strand(x: number, z: number, band: number) {
    const b = beachMask(x, z);
    if (b <= 0.001) return 0;
    return b * (1 - THREE.MathUtils.clamp(
      (this.height(x, z) - WORLD.seaLevel) / band, 0, 1));
  }

  /** Local patchiness — the thing that stops scatter looking uniform. */
  patch(x: number, z: number, scale = 0.02, oct = 3) {
    return this.nPatch.fbm2(x * scale, z * scale, oct) * 0.5 + 0.5;
  }

  /**
   * How strongly this point sits in a drainage line, 0..1.
   *
   * Discrete laplacian of the heightfield: where the ground is concave the
   * water that falls on the surrounding slopes runs through here, so this is
   * where the only genuinely green grass in Leide grows. It is what turns a
   * flat noise-driven meadow into a landscape with gulleys you can read.
   */
  drainage(x: number, z: number) {
    const t = this.terrain, e = 4.0;
    const h = t.heightAt(x, z);
    const avg = (t.heightAt(x - e, z) + t.heightAt(x + e, z)
      + t.heightAt(x, z - e) + t.heightAt(x, z + e)) * 0.25;
    return THREE.MathUtils.clamp((avg - h) / 1.15, 0, 1);
  }

  /**
   * How *convex* the ground is at ridge scale, 0..1 — the opposite question to
   * {@link drainage}, asked with a much wider stencil.
   *
   * Exposed crests have thin soil and take the wind, so a real forest thins out
   * over them and closes again in the hollows. That is worth having for its own
   * sake — a canopy that stops at the skyline is what makes a wooded basin read
   * as a basin — and it also keeps the viewpoints clear, because a viewpoint is
   * by definition a convex piece of ground.
   */
  exposure(x: number, z: number) {
    const t = this.terrain, e = 12.0;
    const h = t.heightAt(x, z);
    const avg = (t.heightAt(x - e, z) + t.heightAt(x + e, z)
      + t.heightAt(x, z - e) + t.heightAt(x, z + e)) * 0.25;
    return THREE.MathUtils.clamp((h - avg) / 2.6, 0, 1);
  }

  /**
   * Moisture plus the drainage bonus — the field grass actually responds to.
   * Kept separate from {@link moisture} so the climate-scale sampler stays
   * cheap for the callers (tree/scrub scatter) that evaluate it 100k times.
   */
  wetness(x: number, z: number) {
    const m = this.moisture(x, z);
    return THREE.MathUtils.clamp(m + this.drainage(x, z) * 0.34, 0, 1);
  }

  // ------------------------------------------------------------------- road

  /** X of the road centreline at a given Z. */
  roadCenterX(z: number) {
    if (this._terrainRoad) return this.terrain.roadCenterX(z);
    return 26 * Math.sin(z * 0.0042) + 20 * Math.sin(z * 0.0013 + 1.1) - 10;
  }

  /** Perpendicular distance (metres) from the road centreline. */
  roadDist(x: number, z: number) {
    const cx = this.roadCenterX(z);
    const dz = (this.roadCenterX(z + 2) - this.roadCenterX(z - 2)) * 0.25;
    return Math.abs(x - cx) / Math.sqrt(1 + dz * dz);
  }

  /** Unit tangent of the road at Z (XZ plane). */
  roadTangent(z: number, out = new THREE.Vector2()) {
    const dz = (this.roadCenterX(z + 2) - this.roadCenterX(z - 2)) * 0.25;
    return out.set(dz, 1).normalize();
  }

  /** World point on the road shoulder. `side` is -1 / +1, `off` metres out. */
  roadPoint(z: number, side = 1, off = 6, out = new THREE.Vector3()) {
    const t = this.roadTangent(z, new THREE.Vector2());
    const nx = t.y * side, nz = -t.x * side;
    const x = this.roadCenterX(z) + nx * off;
    const zz = z + nz * off;
    return out.set(x, this.height(x, zz), zz);
  }

  /**
   * Walk the highway centreline at a fixed spacing in *arc length*, which is
   * the only sane way to place kerbside furniture: the route runs nearly
   * east-west near the spawn, so stepping in Z alone would drop one post every
   * six metres in one place and one every sixty in another.
   *
   */
  roadSamples({ step = 8, radius = 950, from = -1e9, to = 1e9 }: {step?:number, radius?:number, from?:number, to?:number} = {}): Array<{x:number,z:number,y:number,roadY:number,tx:number,tz:number,s:number}> {
    const out = [];
    const road = this.terrain && this.terrain.road;
    if (road && road.points && road.points.length > 1) {
      let nextS = -1e9;
      for (const p of road.points) {
        if (p.s < nextS || p.s < from || p.s > to) continue;
        nextS = p.s + step;
        if (Math.hypot(p.x, p.z) > radius) continue;
        out.push({ x: p.x, z: p.z, y: this.height(p.x, p.z), roadY: p.y, tx: p.tx, tz: p.tz, s: p.s });
      }
      return out;
    }
    // fallback: march the approximate curve in Z and accept the uneven spacing
    for (let z = -radius; z <= radius; z += step) {
      const x = this.roadCenterX(z);
      if (Math.hypot(x, z) > radius) continue;
      const t = this.roadTangent(z, new THREE.Vector2());
      out.push({ x, z, y: this.height(x, z), roadY: this.height(x, z), tx: t.x, tz: t.y, s: out.length * step });
    }
    return out;
  }

  // -------------------------------------------------------------- landmarks

  _layoutSites() {
    const s: EcoSite[] = [];
    const put = (type: SiteType, x: number, z: number, r: number, extra: Partial<EcoSite> = {}) => {
      s.push({ type, x, z, r, y: this.height(x, z), ...extra });
    };

    // Haven: FFXV's rune-marked camp rock, on a raised flat.
    const hv = this._findFlat(-62, -46, 40, 9);
    put('haven', hv.x, hv.z, 11);

    // Ruined pylons — silhouettes on the horizon in the vista shots.
    put('obelisk', -104, -138, 13, { tall: 22 });
    put('obelisk', 168, -206, 12, { tall: 17 });
    put('obelisk', -238, 96, 12, { tall: 26 });

    // Abandoned outpost by the road.
    const shackZ = 96;
    const sp = this.roadPoint(shackZ, 1, 15, new THREE.Vector3());
    put('shack', sp.x, sp.z, 12);

    // Broken-down truck on the far shoulder.
    const tz = -74;
    const tp = this.roadPoint(tz, -1, 7.4, new THREE.Vector3());
    put('truck', tp.x, tp.z, 5.5, { yaw: Math.atan2(this.roadTangent(tz).x, this.roadTangent(tz).y) + 0.28 });

    // The Regalia, parked on the road just off the player's spawn.
    const rz = 14;
    const rp = new THREE.Vector3();
    rp.set(this.roadCenterX(rz) + 1.6, 0, rz);
    rp.y = this.height(rp.x, rp.z);
    put('regalia', rp.x, rp.z, 5, { yaw: Math.atan2(this.roadTangent(rz).x, this.roadTangent(rz).y) });

    // Road signs.
    for (const [sz, side] of [[46, 1], [-132, -1], [18, -1], [128, 1]]) {
      const p = this.roadPoint(sz, side, 6.2, new THREE.Vector3());
      put('sign', p.x, p.z, 3.4, { roadZ: sz, side });
    }

    // ---- inhabited world: outposts, wrecks, ruins and grazing ground ----

    const roadYaw = (z: number) => {
      const t = this.roadTangent(z, new THREE.Vector2());
      return Math.atan2(t.x, t.y);
    };
    // `beside` always writes `roadZ` and `side`, which is what makes a site
    // it places a `RoadsideSite` — the shape the sign and blockade builders need.
    const beside = (type: SiteType, z: number, side: number, off: number, r: number, extra: Partial<EcoSite> = {}) => {
      const p = this.roadPoint(z, side, off, new THREE.Vector3());
      put(type, p.x, p.z, r, { roadZ: z, side, yaw: roadYaw(z), ...extra });
    };

    // A Coernix-style fuel stop with a lit canopy, the one piece of commerce
    // on this stretch of Route 1.
    beside('reststop', 44, 1, 34, 26);
    // Imperial roadblock straddling the carriageway.
    beside('blockade', 72, 0, 0, 24);
    // Bus shelter and a gravel lay-by.
    beside('layby', -60, -1, 15, 13);
    // Two more dead vehicles on the shoulder.
    beside('wreck', 40, -1, 8.5, 6, { kind: 0 });
    beside('wreck', -104, 1, 9.5, 6, { kind: 1 });

    // A crashed magitek dropship, ploughed into the basin floor.
    put('crashsite', -60, -230, 30, { yaw: 0.9 });
    // Comms mast and containers at the foot of Blackrock Mesa — the scale cue
    // that lets the eye read the mesa as a kilometre of rock.
    const mo = this._findFlat(-150, -350, 26, 10);
    put('outpost', mo.x, mo.z, 24);
    // Water tower on the East Buttes bench.
    const wt = this._findFlat(268, -258, 20, 10);
    put('watertower', wt.x, wt.z, 14);
    // Solheim column ruins under the Spire Ridge.
    put('ruins', -500, 330, 34);
    // Windmill pumps and stock pens: one by the abandoned outpost, one out on
    // the flats north of the spawn where the road shots need a midground.
    put('windpump', -252, 78, 16);
    put('windpump', 30, -91, 14);

    // Grazing ground: the herd wanders inside `range` of these anchors. The
    // site radius stays tiny on purpose — animals graze the grass, they do not
    // clear it.
    put('graze', -80, -245, 2, { count: 12, seed: 41, range: 40 });
    put('graze', -330, 168, 2, { count: 7, seed: 42, range: 38 });
    put('graze', 120, 60, 2, { count: 9, seed: 43, range: 34 });
    put('graze', -30, -70, 2, { count: 8, seed: 44, range: 26 });

    return s;
  }

  /** Search a small ring for the flattest spot near (x,z) — keeps camps level. */
  _findFlat(x: number, z: number, radius: number, tries: number) {
    let best = { x, z, s: this.slope01(x, z) };
    for (let i = 0; i < tries; i++) {
      const a = (i / tries) * Math.PI * 2;
      const px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
      const sl = this.slope01(px, pz);
      if (sl < best.s) best = { x: px, z: pz, s: sl };
    }
    return best;
  }

  /** 1 where a landmark has cleared the ground, 0 in open country. */
  siteBlock(x: number, z: number) {
    let b = 0;
    for (let i = 0; i < this.sites.length; i++) {
      const s = this.sites[i];
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < s.r) b = Math.max(b, 1 - d / s.r);
    }
    return b;
  }

  // --------------------------------------------------------------- densities

  /**
   * Grass wants flats, valleys and moisture. It stops dead on the carriageway
   * and thins out on the verge so the road reads as travelled.
   */
  grassDensity(x: number, z: number) {
    const slope = this.slope01(x, z);
    if (slope > 0.66) return 0;
    if (this.waterDepth(x, z) > 0.15) return 0;      // nothing grows under a lake
    const m = this.wetness(x, z);
    const b = vegAt(x, z);
    // Leide is scrubland: the baseline is scattered tufts over open dirt, and
    // only the wet ground closes into anything like a sward.
    let d = (0.26 + 0.74 * THREE.MathUtils.smoothstep(m, 0.12, 0.62)) * b.grassD;
    d *= 1 - THREE.MathUtils.smoothstep(slope, 0.3, 0.66);
    // clumping: large soft patches plus fine breakup
    const p = this.patch(x, z, 0.013, 3);
    const fine = this.patch(x + 900, z - 500, 0.075, 2);
    d *= 0.32 + 0.68 * THREE.MathUtils.smoothstep(p * 0.72 + fine * 0.28, 0.26, 0.72);
    // road corridor
    const rd = this.roadDist(x, z);
    d *= THREE.MathUtils.smoothstep(rd, 2.4, 10.5);
    // The strand: a sward does not close on wet sand. Thinned to a fifth at
    // the waterline and back to full three metres up — dune tussock, not lawn.
    d *= 1 - 0.80 * this.strand(x, z, 3.0);
    // `cleared`, not `siteBlock` — see the note on {@link cleared}. This was
    // `siteBlock` alone and grass grew across every town plaza in the world.
    d *= 1 - this.cleared(x, z);
    return THREE.MathUtils.clamp(d, 0, 1);
  }

  /** Scrub is the opposite: it loves the dry slopes grass abandons. */
  scrubDensity(x: number, z: number) {
    const slope = this.slope01(x, z);
    if (slope > 0.78) return 0;
    if (this.waterDepth(x, z) > 0.15) return 0;
    const m = this.moisture(x, z);
    const b = vegAt(x, z);
    // Dry country grows thorn on the slopes grass abandons; wet country grows
    // an undergrowth layer instead, and `scrubD` is what decides which.
    let d = (0.35 + 0.65 * (1 - THREE.MathUtils.smoothstep(m, 0.22, 0.72))) * b.scrubD;
    d = Math.min(d, 1.6);
    // Flat ground used to be cut to 0.35 of the slope value, which is most of
    // why Leide's establishing shots read as bare hardpan: `zone_longwythe`
    // looks across a plain, so every scrub density along the view ray was
    // multiplied by a third before the patch mask got to it. Probed on the
    // camera's own rays it came back 0.12-0.23 -- one bush per 140 square
    // metres, a bush every twelve paces -- against a reference plate
    // (`duscae-wilderness-04.jpg`) whose flat ground is continuous low cover.
    // The slope preference is real and is kept; the floor is not a third.
    d *= 0.60 + 0.40 * THREE.MathUtils.smoothstep(slope, 0.05, 0.4);
    d *= 1 - THREE.MathUtils.smoothstep(slope, 0.55, 0.78);
    const p = this.patch(x - 300, z + 220, 0.017, 3);
    d *= THREE.MathUtils.smoothstep(p, 0.3, 0.72);
    d *= THREE.MathUtils.smoothstep(this.roadDist(x, z), 3.4, 13);
    // Thorn gets a little further down the beach than grass does, and no
    // further: see {@link strand}.
    d *= 1 - 0.90 * this.strand(x, z, 2.2);
    // As {@link grassDensity}: this was `siteBlock` alone, and scrub grew
    // through the outpost pads.
    d *= 1 - this.cleared(x, z);
    return THREE.MathUtils.clamp(d, 0, 1);
  }

  /**
   * Trees cluster into groves on low, sheltered, wetter ground — except where
   * the zone says the canopy closes.
   *
   * `canopy` lifts the floor of the grove noise toward 1, which is the whole
   * difference between a scattered stand and a wood: at canopy 0 the noise
   * carves islands of trees out of open country (Leide, the Malacchi prairie),
   * at canopy 1 the cover is continuous and only slope, road and clearings
   * punch holes in it (the Nebulawood, Malmalam Thicket).
   */
  treeDensity(x: number, z: number) {
    const slope = this.slope01(x, z);
    if (slope > 0.5) return 0;
    if (this.waterDepth(x, z) > 0.3) return 0;
    // Nothing woody on a foreshore. `waterDepth` alone let the tree line stand
    // in the swash the moment Galdin got a real beach — see {@link strand}.
    if (this.strand(x, z, 4.5) > 0.5) return 0;
    const b = vegAt(x, z);
    const m = this.moisture(x, z);
    const grove = this.nGrove.fbm2(x * 0.0055, z * 0.0055, 3) * 0.5 + 0.5;
    const c = b.canopy;
    let d = THREE.MathUtils.smoothstep(grove, 0.46 - c * 0.5, 0.82 - c * 0.46);
    if (c > 0) {
      // Even a closed wood has glades, and without them a canopy-1.0 zone is
      // a solid block you can neither see into nor stand in. A second, much
      // lower-frequency field opens clearings a couple of hundred metres
      // across, which is what gives the Nebulawood somewhere to put a haven.
      const glade = this.nPatch.fbm2(x * 0.0021 + 77, z * 0.0021 - 55, 2) * 0.5 + 0.5;
      d += (1 - d) * c * 0.88 * THREE.MathUtils.smoothstep(glade, 0.22, 0.6);
    }
    d *= 0.18 + 0.82 * THREE.MathUtils.smoothstep(m, 0.16, 0.66);
    d *= b.treeD;
    d *= 1 - THREE.MathUtils.smoothstep(slope, 0.28, 0.5);
    d *= 1 - this.exposure(x, z) * 0.62;
    // "Low, sheltered, wetter ground" is what the docstring above has always
    // claimed, and until this lane the only thing behind it was fbm plus a 12 m
    // convexity stencil — the function guessed at hydrology it could have asked
    // for. `erosion().wet` is the erosion pass's own answer, a percentile among
    // land cells (measured mean 0.505 over 40 000 samples), so this term is
    // deliberately **mean-neutral**: it moves the canopy off the dry
    // interfluves and into the drainage without changing how many trees the
    // world grows, which is what keeps the draw-call budget out of the
    // argument. `exposure` stays; a 12 m crest and a 16 m channel are different
    // scales and they disagree usefully.
    d *= 0.55 + 0.90 * this.erosion(x, z).wet;
    d *= THREE.MathUtils.smoothstep(this.roadDist(x, z), 6, 18);
    d *= 1 - this.siteBlock(x, z);
    d *= 1 - this.poiClear(x, z);
    return THREE.MathUtils.clamp(d, 0, 1);
  }

  /**
   * Which tree species belongs here.
   *
   * The pick is driven by a low-frequency noise rather than a per-instance
   * random, so a species holds for a couple of hundred metres and the forest
   * reads as *stands* — a bank of thicket, then a rise of tall broadleaf —
   * instead of a uniform salad of every species the zone allows.
   *
   * **Two octaves, not one.** The grove band alone has a ~450 m wavelength and
   * `Trees.geoRange` is 88 m, so wherever the band sat, *every* tree the near
   * ring drew was one species — a pure monoculture with no possible exception,
   * because the field is smooth and the ring is smaller than one lobe of it.
   * Measured at the chocobo post (`alstor`, where `dead` carries a 10% weight
   * and sits at the top of the cumulative table): 76% of the 88 m disc resolved
   * to `dead`, and the geometry ring came back **116 dead trees, 0 swamp, 0
   * duscae** against a table that asks for 58% swamp. The frame was a wetland
   * full of bare grey sticks (`tmp/shots/veg-a1/poi_chocobo.jpg`).
   *
   * The second octave is ~40 m — a few trees across, so a stand still reads as
   * a stand and is still *dominated* by its band's species, but a lone dead
   * grovewood stands in the green rather than the whole grove being dead. It is
   * deliberately not a per-tree hash: that gives an even salad of every species
   * at every scale, which is the look the grove noise was added to kill.
   *
   * Amplitudes: the sum of two noises is more bell-shaped than one, which
   * squeezes the ends of the cumulative table (i.e. under-draws the first and
   * last species). The total is raised from 0.62 to 0.72 to put the measured
   * world-wide share back within a couple of points of the authored weights.
   */
  treeSpecies(x: number, z: number) {
    const b = vegAt(x, z);
    const grove = this.nGrove.simplex2(x * 0.0022 + 11, z * 0.0022 - 7);
    const local = this.nGrove.simplex2(x * 0.026 - 41, z * 0.026 + 63);
    const r = THREE.MathUtils.clamp(
      (grove * 0.74 + local * 0.30) * 0.72 + 0.5, 0, 0.9999);
    return pickFrom(b.treeTable, r) || 'broadleaf';
  }

  // ------------------------------------------------------------------ colour

  /**
   * Approximate ground albedo so vegetation roots can be tinted to match and
   * don't look pasted on. Prefers a real Terrain sampler if one exists.
   */
  groundColor(x: number, z: number, out = new THREE.Color()): THREE.Color {
    const t = this.terrain;
    // `Terrain.groundColorAt` exists now; the `Terrain.colorAt` arm that sat
    // under it named a method that has never existed on any Terrain, and it
    // is what left this fallback ramp tinting every plant in the world.
    if (t) return t.groundColorAt(x, z, out);
    const m = this.moisture(x, z);
    const slope = this.slope01(x, z);
    _tmpA.copy(C_SOIL_RED).lerp(C_SOIL_DRY, THREE.MathUtils.smoothstep(m, 0.1, 0.5));
    _tmpA.lerp(C_SOIL_WET, THREE.MathUtils.smoothstep(m, 0.5, 0.9));
    // rock shows through on steep faces
    _tmpB.setRGB(0.30, 0.25, 0.22);
    return out.copy(_tmpA).lerp(_tmpB, THREE.MathUtils.smoothstep(slope, 0.35, 0.7));
  }

  /**
   * Base grass colour for this spot, before per-clump variation.
   *
   * The thresholds are deliberately late: most of Leide has to land on the
   * straw end of the ramp, and green is reserved for the drainage lines that
   * {@link wetness} picks out.
   */
  grassColor(x: number, z: number, out = new THREE.Color()) {
    const b = vegAt(x, z);
    const m = this.wetness(x, z) + b.wetBias;
    return this._grassRamp(b, x, z, THREE.MathUtils.smoothstep(m, 0.22, 0.86), out);
  }

  /**
   * The *dry* end of this spot's ramp — where a bleached or last-season tuft
   * goes, in the zone's own authored straw rather than a synthesised one.
   *
   * `GrassField` lerps each clump between {@link grassColor} and this by how
   * dry the clump is. Doing it that way instead of applying a red gain and a
   * blue cut is the whole difference between "this tuft is further along its
   * own palette" and "this tuft is orange": a per-channel gain can leave the
   * palette entirely, and did — it put Leide's grass at 1.76x red over green,
   * which is highlighter yellow, from a ramp whose own dry end is 1.33x.
   */
  grassDryColor(x: number, z: number, out = new THREE.Color()) {
    return this._grassRamp(vegAt(x, z), x, z, 0, out);
  }

  /**
   * A point on a biome's grass ramp, with the shared large-scale value noise.
   * Leide keeps its authored straw/olive ramp; a forest zone brings its own
   * pair of ends, so the Nebulawood's dry end is already darker and greener
   * than Leide's lush end.
   * @private
   */
  _grassRamp(b: VegBiome, x: number, z: number, t: number, out: THREE.Color) {
    const v = this.nTint.fbm2(x * 0.02, z * 0.02, 2) * 0.5 + 0.5;
    out.copy(b.dryC).lerp(b.lushC, t);
    const k = 0.86 + v * 0.3;
    return out.setRGB(out.r * k, out.g * (k * 0.98 + 0.02), out.b * k);
  }

  /** Height multiplier for the grass field: ankle tuft .. waist-high reed. */
  grassScale(x: number, z: number) { return vegAt(x, z).grassH; }

  /** Fraction of tufts that are last season's, bleached whatever the ground does. */
  grassDead(x: number, z: number) { return vegAt(x, z).grassDead; }

  // ------------------------------------------------------------ distribution

  /**
   * Matérn cluster scatter, the shared sampler (plan §2.3).
   *
   * Replaces `scatterClustered`, which was a jittered grid with a Gaussian
   * sprinkle bolted on and, more to the point, **had zero callers for the whole
   * life of the project** — every scatter in the world was `Trees._makeTile`'s
   * or `Bushes._makeTile`'s own 8 m / 4 m stratified lattice. It, its
   * `ScatterPoint` and its `ScatterOpts` are deleted rather than kept: a dead
   * sampler in the file the live ones import from is how the next agent spends
   * an afternoon tuning something nothing draws.
   *
   * Measured with `src/tools/scatterstat.mts` — Clark–Evans R against a
   * calibrated Poisson / lattice / cluster triple. The numbers are in
   * `project/handoff/scatter.md`; do not change a parameter here without
   * re-running it, because the difference between a grove and a lawn with a
   * density mask over it is about 0.4 in R and about nothing in a screenshot.
   *
   * @param suit  suitability, evaluated at the PARENT and nowhere else
   * @param reject hard exclusion, evaluated per child — water, cliff, road, pad
   */
  _scatter(
    salt: number, x0: number, z0: number, w: number, h: number,
    parentMin: number, spread: number, mean: number,
    suit: (x: number, z: number) => number,
    reject: (x: number, z: number) => boolean,
    kind: ((x: number, z: number, u: number) => string) | undefined,
    o: ScatterBias & { radius?: (x: number, z: number, u: number, k: string) => number, slack?: number },
  ): ClusterPoint[] {
    const bias = o.bias;
    return maternScatter({
      seed: this.seed ^ salt, x0, z0, w, h, parentMin, spread, mean,
      suitability: bias
        ? (x, z) => suit(x, z) * bias(x, z)
        : suit,
      reject, kind, radius: o.radius, slack: o.slack, maxCount: o.maxCount,
    });
  }

  /**
   * Parent suitability for a wood: is this a site a grove would start on?
   *
   * `treeDensity` already composes climate, biome, slope, exposure and the
   * hydrology, and it is the right field — but it is asked **only at the
   * parent**. Thinning the children by it would re-impose its own
   * almost-uniform statistics on the cluster and shred the grove straight back
   * to Poisson, which is the single mistake §2.3 exists to warn about.
   */
  groveSuit(x: number, z: number) { return this.treeDensity(x, z); }

  /** Parent suitability for a knot of scrub. Same rule: parents only. */
  scrubSuit(x: number, z: number) { return this.scrubDensity(x, z); }

  /**
   * Parent suitability for a boulder cluster, from the erosion pass (§2.4).
   *
   * Stones come to rest where water put them or where a face shed them, so this
   * reads `accum` (the drainage lines that carry and strand bedload) and
   * `scree` (the sparse mask under a shedding face — 83% of the world is
   * exactly zero on it, so it is an *additive* term here, never a multiplier).
   * Keying rock on the same two channels the material and the plants read is
   * the whole of the plan's "the world reads composed": otherwise the stones
   * and the trees each invent their own answer to where the water went.
   */
  rockSuit(x: number, z: number) {
    const e = this.erosion(x, z);
    const accum = e.accum, scree = e.scree, rock = e.rock;
    const slope = this.slope01(x, z);
    // A bar of cobbles in a wash, plus talus under anything shedding, plus the
    // bedrock the control channel already says is exposed.
    let d = 0.16 + 0.62 * THREE.MathUtils.smoothstep(accum, 0.55, 0.95)
      + 1.15 * scree + 0.45 * rock;
    d *= 1 - THREE.MathUtils.smoothstep(slope, 0.62, 0.86);
    return THREE.MathUtils.clamp(d, 0, 1);
  }

  /**
   * Hard exclusion for anything rooted in the ground.
   *
   * Distinct from suitability *on purpose*: these are not preferences to be
   * traded off against a good site, and a tree standing in a lake because its
   * parent was on the shore is not grove coherence. Kept cheap — it runs per
   * child, where suitability runs per parent.
   */
  rootBlocked(x: number, z: number) {
    if (Math.hypot(x, z) > this.worldRadius) return true;
    if (this.waterDepth(x, z) > 0.3) return true;
    if (this.slope01(x, z) > 0.5) return true;
    if (this.roadDist(x, z) < 6) return true;
    return this.cleared(x, z) > 0.06;
  }

  /**
   * Trees, in groves. `parentMin` 26 m is the pitch between possible stands and
   * `spread` 10 m their radius, so a stand is roughly 30 m across with empty
   * ground between — a hard edge, which is what a jittered grid cannot produce
   * at any density.
   *
   * **`mean` is tuned for count parity with the lattice it replaces, and that
   * is deliberate.** Measured over the five graded zones the emitted counts
   * come out 0.92-1.35x the shipped `Trees._makeTile` (`scatterstat.mts`).
   * Clustering must change *where* the matrices go, not how many there are:
   * per-instance work is free, instance count is triangles, and a sampler that
   * quietly halved the forest would read as an improvement in every perf number
   * while being a different world. Re-run `scatterstat` after touching these.
   *
   * **A grove is one species.** `treeSpecies` is sampled at the parent and
   * carried by every child, which is the plan's 72% grove-coherence figure and
   * the reason a bank of thicket reads as a bank of thicket.
   */
  groveScatter(x0: number, z0: number, w: number, h: number, o: ScatterBias & ScatterSep = {}) {
    return this._scatter(
      0x67a1, x0, z0, w, h, 26, 10, 30,
      (x, z) => this.groveSuit(x, z),
      (x, z) => this.rootBlocked(x, z),
      (x, z) => this.treeSpecies(x, z),
      // **Two stems may not stand in the same place**, which until now they
      // could: `slack` defaults to 0 and `groveScatter` never passed one, so
      // the separation pass `Cluster.ts` carries for the boulders has never run
      // on a plant. Measured over four zones (`src/tools/probes/copies.mts`),
      // **9.1-13.3% of trees and 9.2-30.0% of bushes had a neighbour inside
      // 1.5 m** — two trunks in one hole. Round 13's ab-09 reads *"four copies
      // of one tree ... two interpenetrating"*, and that is the second half of
      // it, the half no amount of per-instance variation can touch.
      //
      // The radius is a *claim on ground*, not a measured crown: the tree's own
      // size is drawn in `Trees.ts` from a hash this sampler cannot see, so all
      // this can honestly key on is the biome's own scale band and the child's
      // own draw. Stated rather than dressed up — a sampler that pretended to
      // know the crown would be a third seating model.
      { slack: 1.0, radius: (x, z, u) => vegAt(x, z).treeS[0] * (0.8 + 0.5 * u), ...o });
  }

  /**
   * Scrub, in knots. Tighter and more numerous than trees: a few bushes growing
   * off each other's litter, in a thicket of knots. Counts come out 0.85-1.08x
   * the shipped lattice on dry ground.
   *
   * **It does not place reeds or lily pads.** `Bushes._makeTile` treats the
   * water line as a separate band with its own depth test, and this sampler
   * rejects standing water outright: in Alstor Slough, where most of the scrub
   * budget is reeds, it emits 0.14x the lattice's count and that is correct
   * rather than a regression. Whoever wires this in keeps the water-line branch.
   */
  scrubScatter(x0: number, z0: number, w: number, h: number, o: ScatterBias & ScatterSep = {}) {
    return this._scatter(
      0x5c3b, x0, z0, w, h, 12, 4, 24,
      (x, z) => this.scrubSuit(x, z),
      (x, z) => this.rootBlocked(x, z),
      // A knot of scrub is one species for the same reason a grove is: these
      // are plants growing off each other's litter, not a lucky dip. Measured
      // on the shipped lattice, whose species is a per-instance `rng.next()`,
      // a bush's nearest neighbour is the same species 32-43% of the time —
      // the even salad the grove noise was added to kill, still running in the
      // undergrowth.
      (x, z, u) => pickFrom(vegAt(x, z).scrubTable, u) || 'shrub',
      // The same rule at the scale of a bush. A knot of scrub is meant to
      // crowd, so the berth is small — but two shrubs at 30 cm are one shrub
      // with a shading artefact, and in `three_valleys` 30.0% of the
      // undergrowth was inside 1.5 m of its neighbour.
      { slack: 1.0, radius: (x, z, u) => 0.40 + 0.50 * u, ...o });
  }

  /**
   * Boulders, in clusters, with **radius-aware separation**: two stones are
   * pushed apart by `(r1 + r2) * slack`, so a 12 m erratic clears a berth a
   * pebble does not. A single global spacing cannot say that, and a boulder
   * field built on one either interpenetrates its big stones or scatters its
   * small ones.
   *
   * `fromParent` on each point is distance from the cluster centre in units of
   * `spread`: the rocks lane wants the big blocks at `fromParent < 0.7` and
   * scree/talus out past 1.2, which is OGL's own edge rule.
   *
   * @param radius what an instance claims, metres — the caller's own size draw
   */
  rockScatter(
    x0: number, z0: number, w: number, h: number,
    o: ScatterBias & { radius?: (x: number, z: number, u: number, k: string) => number, slack?: number } = {},
  ) {
    return this._scatter(
      0x40c8, x0, z0, w, h, 40, 13, 10,
      (x, z) => this.rockSuit(x, z),
      (x, z) => Math.hypot(x, z) > this.worldRadius
        || this.waterDepth(x, z) > 0.1
        || this.roadDist(x, z) < 4.6
        || this.cleared(x, z) > 0.06,
      undefined,
      { slack: 1.0, radius: () => 1.6, ...o });
  }
}

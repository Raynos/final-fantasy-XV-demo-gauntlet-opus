import * as THREE from 'three';
import { Noise } from '../../util/Noise.ts';
import { Rng } from '../../util/Rng.ts';
import { srgb } from '../../util/TextureGen.ts';
import { vegAt, zoneMoist, pickFrom } from './Biomes.ts';
import { WORLD, worldMap } from '../map/WorldMap.ts';

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
 * (via `veg/Biomes.js`), with fbm only as local variation on top. It used to be
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

/** Cheap integer hash so tile content is position-derived, not sequence-derived. */
export function hash3(x: any, y: any, s: any) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export class Ecology {
  nPatch!: Noise;
  _clearings!: any;
  _terrainRoad!: boolean;
  game!: any;
  nGrove!: Noise;
  nMoist!: Noise;
  nTint!: Noise;
  seed!: number;
  sites!: any;
  terrain!: any;
  worldRadius!: number;
  /**
   * @param game the Game instance (needs .get('Terrain'))
   * @param seed master seed
   */
  constructor(game: any, seed: number = 1337) {
    this.game = game;
    this.terrain = game.get('Terrain');
    this.seed = seed;

    this.nMoist = new Noise(seed ^ 0x51ab3);
    this.nPatch = new Noise(seed ^ 0x9e377);
    this.nGrove = new Noise(seed ^ 0x2f1d5);
    this.nTint = new Noise(seed ^ 0x77c19);

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
   * get a say too. Radii are a *fraction* of the discovery radius, per type: a
   * town really is cleared for 130 m, a landmark ("Longwythe Peak", r = 520)
   * is not cleared at all.
   */
  _layoutClearings() {
    const FRAC = {
      town: 0.62, outpost: 0.5, reststop: 0.5, parking: 0.95, imperial: 0.5,
      chocobo: 0.62, dungeon: 0.3, haven: 0.9, fishing: 0.45, menace: 0.3,
    };
    const cell = 256;
    const grid = new Map();
    for (const p of worldMap.pois) {
      const f = FRAC[p.type as keyof typeof FRAC];
      if (!f) continue;
      const r = p.r * f;
      const i0 = Math.floor((p.x - r) / cell), i1 = Math.floor((p.x + r) / cell);
      const j0 = Math.floor((p.z - r) / cell), j1 = Math.floor((p.z + r) / cell);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const k = i * 65536 + j;
          let a = grid.get(k);
          if (!a) { a = []; grid.set(k, a); }
          a.push({ x: p.x, z: p.z, r });
        }
      }
    }
    return { cell, grid };
  }

  /** 1 where a settlement or camp has cleared the ground, 0 in open country. */
  poiClear(x: any, z: any) {
    const { cell, grid } = this._clearings;
    const a = grid.get(Math.floor(x / cell) * 65536 + Math.floor(z / cell));
    if (!a) return 0;
    let b = 0;
    for (let i = 0; i < a.length; i++) {
      const s = a[i];
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < s.r) b = Math.max(b, 1 - d / s.r);
    }
    return b;
  }

  // ---------------------------------------------------------------- terrain

  /** Ground height. */
  height(x: any, z: any) { return this.terrain.heightAt(x, z); }

  /** Ground normal, computed locally so we never depend on Terrain's out-param. */
  normal(x: any, z: any, out = _v) {
    const e = 0.7, t = this.terrain;
    const hL = t.heightAt(x - e, z), hR = t.heightAt(x + e, z);
    const hD = t.heightAt(x, z - e), hU = t.heightAt(x, z + e);
    return out.set(hL - hR, 2 * e, hD - hU).normalize();
  }

  /** 0 = dead flat, 1 = vertical cliff. */
  slope01(x: any, z: any) {
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
  moisture(x: any, z: any) {
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
  veg(x: any, z: any): any { return vegAt(x, z); }

  /**
   * Metres of water over this point, negative on dry land. Reeds want the
   * 0..1.2 m band, lily pads want > 0.4 m of standing water.
   */
  waterDepth(x: any, z: any) { return WORLD.seaLevel - this.height(x, z); }

  /** Local patchiness — the thing that stops scatter looking uniform. */
  patch(x: any, z: any, scale = 0.02, oct = 3) {
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
  drainage(x: any, z: any) {
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
  exposure(x: any, z: any) {
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
  wetness(x: any, z: any) {
    const m = this.moisture(x, z);
    return THREE.MathUtils.clamp(m + this.drainage(x, z) * 0.34, 0, 1);
  }

  // ------------------------------------------------------------------- road

  /** X of the road centreline at a given Z. */
  roadCenterX(z: any) {
    if (this._terrainRoad) return this.terrain.roadCenterX(z);
    return 26 * Math.sin(z * 0.0042) + 20 * Math.sin(z * 0.0013 + 1.1) - 10;
  }

  /** Perpendicular distance (metres) from the road centreline. */
  roadDist(x: any, z: any) {
    const cx = this.roadCenterX(z);
    const dz = (this.roadCenterX(z + 2) - this.roadCenterX(z - 2)) * 0.25;
    return Math.abs(x - cx) / Math.sqrt(1 + dz * dz);
  }

  /** Unit tangent of the road at Z (XZ plane). */
  roadTangent(z: any, out = new THREE.Vector2()) {
    const dz = (this.roadCenterX(z + 2) - this.roadCenterX(z - 2)) * 0.25;
    return out.set(dz, 1).normalize();
  }

  /** World point on the road shoulder. `side` is -1 / +1, `off` metres out. */
  roadPoint(z: any, side = 1, off = 6, out = new THREE.Vector3()) {
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
    const s: any[] = [];
    const put = (type: any, x: any, z: any, r: any, extra = {}) => {
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

    const roadYaw = (z: any) => {
      const t = this.roadTangent(z, new THREE.Vector2());
      return Math.atan2(t.x, t.y);
    };
    const beside = (type: string, z: number, side: number, off: number, r: number, extra = {}) => {
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
  siteBlock(x: any, z: any) {
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
    d *= 1 - this.siteBlock(x, z);
    return THREE.MathUtils.clamp(d, 0, 1);
  }

  /** Scrub is the opposite: it loves the dry slopes grass abandons. */
  scrubDensity(x: any, z: any) {
    const slope = this.slope01(x, z);
    if (slope > 0.78) return 0;
    if (this.waterDepth(x, z) > 0.15) return 0;
    const m = this.moisture(x, z);
    const b = vegAt(x, z);
    // Dry country grows thorn on the slopes grass abandons; wet country grows
    // an undergrowth layer instead, and `scrubD` is what decides which.
    let d = (0.35 + 0.65 * (1 - THREE.MathUtils.smoothstep(m, 0.22, 0.72))) * b.scrubD;
    d = Math.min(d, 1.6);
    d *= 0.35 + 0.65 * THREE.MathUtils.smoothstep(slope, 0.05, 0.4);
    d *= 1 - THREE.MathUtils.smoothstep(slope, 0.55, 0.78);
    const p = this.patch(x - 300, z + 220, 0.017, 3);
    d *= THREE.MathUtils.smoothstep(p, 0.3, 0.72);
    d *= THREE.MathUtils.smoothstep(this.roadDist(x, z), 3.4, 13);
    d *= 1 - this.siteBlock(x, z);
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
  treeDensity(x: any, z: any) {
    const slope = this.slope01(x, z);
    if (slope > 0.5) return 0;
    if (this.waterDepth(x, z) > 0.3) return 0;
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
  treeSpecies(x: any, z: any) {
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
    if (t && typeof t.groundColorAt === 'function') return t.groundColorAt(x, z, out);
    if (t && typeof t.colorAt === 'function') return t.colorAt(x, z, out);
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
  _grassRamp(b: any, x: any, z: any, t: number, out: THREE.Color) {
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
   * Clustered scatter over a disc: cluster seeds are jittered on a coarse grid,
   * members fall around them with a gaussian, and every candidate is
   * rejection-sampled against `density`. Returns [{x,z,y,w}] where w is the
   * local density (useful for size/health variation).
   */
  scatterClustered(seed: any, {
    radius, inner = 0, cellSize = 46, perCell = 6, spread = 13,
    density, jitterLone = 0.22, maxCount = 100000, center = { x: 0, z: 0 },
  }: any) {
    const out = [];
    const half = Math.ceil(radius / cellSize);
    const cx0 = Math.round(center.x / cellSize), cz0 = Math.round(center.z / cellSize);
    for (let gz = -half; gz <= half; gz++) {
      for (let gx = -half; gx <= half; gx++) {
        const cx = cx0 + gx, cz = cz0 + gz;
        const rng = new Rng(hash3(cx, cz, seed));
        const seedX = (cx + rng.next()) * cellSize;
        const seedZ = (cz + rng.next()) * cellSize;
        const localBias = density(seedX, seedZ);
        // lone stragglers keep the field from looking like polka dots
        const n = Math.round(perCell * (localBias * (1 - jitterLone) + jitterLone) * rng.range(0.4, 1.6));
        for (let i = 0; i < n; i++) {
          const a = rng.next() * Math.PI * 2;
          const r = Math.abs(rng.gauss(0, 1)) * spread;
          const x = seedX + Math.cos(a) * r;
          const z = seedZ + Math.sin(a) * r;
          const dc = Math.hypot(x - center.x, z - center.z);
          if (dc > radius || dc < inner) continue;
          const d = density(x, z);
          if (d <= 0.004 || rng.next() > d) continue;
          out.push({ x, z, y: this.height(x, z), w: d, rng: rng.next() });
          if (out.length >= maxCount) return out;
        }
      }
    }
    return out;
  }
}

import * as THREE from 'three';
import { Noise } from '../../util/Noise.js';
import { Rng } from '../../util/Rng.js';
import { srgb } from '../../util/TextureGen.js';

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
 */

const _v = new THREE.Vector3();

// Authored palette (sRGB in, linear out) — Leide ochre through Duscae green.
const C_SOIL_DRY = srgb(0x9a7448);
const C_SOIL_RED = srgb(0x7e4b30);
const C_SOIL_WET = srgb(0x4c4a30);
// Leide is straw and olive, not lawn. The "dry" end is a sun-bleached wheat
// that has been dead since spring; the lush end only ever shows up in the
// drainage lines, so it is allowed to be a real green.
const C_GRASS_DRY = srgb(0xa89358);
const C_GRASS_MID = srgb(0x8a8450);
const C_GRASS_LUSH = srgb(0x596b31);

const _tmpA = new THREE.Color();
const _tmpB = new THREE.Color();

/** Cheap integer hash so tile content is position-derived, not sequence-derived. */
export function hash3(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export class Ecology {
  /**
   * @param {object} game the Game instance (needs .get('Terrain'))
   * @param {number} seed master seed
   */
  constructor(game, seed = 1337) {
    this.game = game;
    this.terrain = game.get('Terrain');
    this.seed = seed;

    this.nMoist = new Noise(seed ^ 0x51ab3);
    this.nPatch = new Noise(seed ^ 0x9e377);
    this.nGrove = new Noise(seed ^ 0x2f1d5);
    this.nTint = new Noise(seed ^ 0x77c19);

    const tsize = (this.terrain && this.terrain.size) || 1400;
    this.worldRadius = Math.min(620, tsize * 0.5 - 40);

    // Does the terrain own a road? If so defer to it.
    this._terrainRoad = !!(this.terrain && typeof this.terrain.roadCenterX === 'function');

    this.sites = this._layoutSites();
  }

  // ---------------------------------------------------------------- terrain

  /** Ground height. */
  height(x, z) { return this.terrain.heightAt(x, z); }

  /** Ground normal, computed locally so we never depend on Terrain's out-param. */
  normal(x, z, out = _v) {
    const e = 0.7, t = this.terrain;
    const hL = t.heightAt(x - e, z), hR = t.heightAt(x + e, z);
    const hD = t.heightAt(x, z - e), hU = t.heightAt(x, z + e);
    return out.set(hL - hR, 2 * e, hD - hU).normalize();
  }

  /** 0 = dead flat, 1 = vertical cliff. */
  slope01(x, z) {
    const n = this.normal(x, z, _v);
    return 1 - Math.max(0, Math.min(1, n.y));
  }

  // ---------------------------------------------------------------- climate

  /** 0 = bone dry Leide badlands, 1 = humid Duscae basin. */
  moisture(x, z) {
    let m = this.nMoist.fbm2(x * 0.0013, z * 0.0013, 4) * 0.5 + 0.5;
    // valleys collect water; ridges bake dry
    const h = this.height(x, z);
    m += THREE.MathUtils.clamp((6 - h) * 0.018, -0.28, 0.3);
    m += this.nMoist.fbm2(x * 0.006 + 40, z * 0.006 - 17, 2) * 0.09;
    return THREE.MathUtils.clamp(m, 0, 1);
  }

  /** Local patchiness — the thing that stops scatter looking uniform. */
  patch(x, z, scale = 0.02, oct = 3) {
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
  drainage(x, z) {
    const t = this.terrain, e = 4.0;
    const h = t.heightAt(x, z);
    const avg = (t.heightAt(x - e, z) + t.heightAt(x + e, z)
      + t.heightAt(x, z - e) + t.heightAt(x, z + e)) * 0.25;
    return THREE.MathUtils.clamp((avg - h) / 1.15, 0, 1);
  }

  /**
   * Moisture plus the drainage bonus — the field grass actually responds to.
   * Kept separate from {@link moisture} so the climate-scale sampler stays
   * cheap for the callers (tree/scrub scatter) that evaluate it 100k times.
   */
  wetness(x, z) {
    const m = this.moisture(x, z);
    return THREE.MathUtils.clamp(m + this.drainage(x, z) * 0.34, 0, 1);
  }

  // ------------------------------------------------------------------- road

  /** X of the road centreline at a given Z. */
  roadCenterX(z) {
    if (this._terrainRoad) return this.terrain.roadCenterX(z);
    return 26 * Math.sin(z * 0.0042) + 20 * Math.sin(z * 0.0013 + 1.1) - 10;
  }

  /** Perpendicular distance (metres) from the road centreline. */
  roadDist(x, z) {
    const cx = this.roadCenterX(z);
    const dz = (this.roadCenterX(z + 2) - this.roadCenterX(z - 2)) * 0.25;
    return Math.abs(x - cx) / Math.sqrt(1 + dz * dz);
  }

  /** Unit tangent of the road at Z (XZ plane). */
  roadTangent(z, out = new THREE.Vector2()) {
    const dz = (this.roadCenterX(z + 2) - this.roadCenterX(z - 2)) * 0.25;
    return out.set(dz, 1).normalize();
  }

  /** World point on the road shoulder. `side` is -1 / +1, `off` metres out. */
  roadPoint(z, side = 1, off = 6, out = new THREE.Vector3()) {
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
   * @param {{step?:number, radius?:number, from?:number, to?:number}} opts
   * @returns {Array<{x:number,z:number,y:number,roadY:number,tx:number,tz:number,s:number}>}
   */
  roadSamples({ step = 8, radius = 950, from = -1e9, to = 1e9 } = {}) {
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
    const s = [];
    const put = (type, x, z, r, extra = {}) => {
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

    const roadYaw = (z) => {
      const t = this.roadTangent(z, new THREE.Vector2());
      return Math.atan2(t.x, t.y);
    };
    const beside = (type, z, side, off, r, extra = {}) => {
      const p = this.roadPoint(z, side, off, new THREE.Vector3());
      put(type, p.x, p.z, r, { roadZ: z, side, yaw: roadYaw(z), ...extra });
    };

    // A Coernix-style fuel stop with a lit canopy, the one piece of commerce
    // on this stretch of Route 1.
    beside('reststop', 25, 1, 34, 26);
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
  _findFlat(x, z, radius, tries) {
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
  siteBlock(x, z) {
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
  grassDensity(x, z) {
    const slope = this.slope01(x, z);
    if (slope > 0.66) return 0;
    const m = this.wetness(x, z);
    // Leide is scrubland: the baseline is scattered tufts over open dirt, and
    // only the wet ground closes into anything like a sward.
    let d = 0.26 + 0.74 * THREE.MathUtils.smoothstep(m, 0.2, 0.7);
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
  scrubDensity(x, z) {
    const slope = this.slope01(x, z);
    if (slope > 0.78) return 0;
    const m = this.moisture(x, z);
    let d = 0.35 + 0.65 * (1 - THREE.MathUtils.smoothstep(m, 0.3, 0.8));
    d *= 0.35 + 0.65 * THREE.MathUtils.smoothstep(slope, 0.05, 0.4);
    d *= 1 - THREE.MathUtils.smoothstep(slope, 0.55, 0.78);
    const p = this.patch(x - 300, z + 220, 0.017, 3);
    d *= THREE.MathUtils.smoothstep(p, 0.3, 0.72);
    d *= THREE.MathUtils.smoothstep(this.roadDist(x, z), 3.4, 13);
    d *= 1 - this.siteBlock(x, z);
    return THREE.MathUtils.clamp(d, 0, 1);
  }

  /** Trees cluster into groves on low, sheltered, wetter ground. */
  treeDensity(x, z) {
    const slope = this.slope01(x, z);
    if (slope > 0.5) return 0;
    const m = this.moisture(x, z);
    const grove = this.nGrove.fbm2(x * 0.0055, z * 0.0055, 3) * 0.5 + 0.5;
    let d = THREE.MathUtils.smoothstep(grove, 0.46, 0.82);
    d *= 0.18 + 0.82 * THREE.MathUtils.smoothstep(m, 0.22, 0.72);
    d *= 1 - THREE.MathUtils.smoothstep(slope, 0.28, 0.5);
    d *= THREE.MathUtils.smoothstep(this.roadDist(x, z), 6, 18);
    d *= 1 - this.siteBlock(x, z);
    return THREE.MathUtils.clamp(d, 0, 1);
  }

  /** Which tree species belongs here. */
  treeSpecies(x, z) {
    const m = this.moisture(x, z);
    const v = this.nGrove.simplex2(x * 0.004 + 11, z * 0.004 - 7);
    if (m < 0.34) return 'dead';
    if (m < 0.52) return v > 0.1 ? 'savanna' : 'dead';
    if (m > 0.74) return v > -0.15 ? 'conifer' : 'broadleaf';
    return v > 0 ? 'broadleaf' : 'savanna';
  }

  // ------------------------------------------------------------------ colour

  /**
   * Approximate ground albedo so vegetation roots can be tinted to match and
   * don't look pasted on. Prefers a real Terrain sampler if one exists.
   * @returns {THREE.Color}
   */
  groundColor(x, z, out = new THREE.Color()) {
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
  grassColor(x, z, out = new THREE.Color()) {
    const m = this.wetness(x, z);
    const v = this.nTint.fbm2(x * 0.02, z * 0.02, 2) * 0.5 + 0.5;
    out.copy(C_GRASS_DRY).lerp(C_GRASS_MID, THREE.MathUtils.smoothstep(m, 0.34, 0.7));
    out.lerp(C_GRASS_LUSH, THREE.MathUtils.smoothstep(m, 0.7, 0.97));
    const k = 0.86 + v * 0.3;
    out.setRGB(out.r * k, out.g * (k * 0.98 + 0.02), out.b * k);
    return out;
  }

  // ------------------------------------------------------------ distribution

  /**
   * Clustered scatter over a disc: cluster seeds are jittered on a coarse grid,
   * members fall around them with a gaussian, and every candidate is
   * rejection-sampled against `density`. Returns [{x,z,y,w}] where w is the
   * local density (useful for size/health variation).
   */
  scatterClustered(seed, {
    radius, inner = 0, cellSize = 46, perCell = 6, spread = 13,
    density, jitterLone = 0.22, maxCount = 100000, center = { x: 0, z: 0 },
  }) {
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

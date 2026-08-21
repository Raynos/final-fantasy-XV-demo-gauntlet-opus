import { worldMap } from '../map/WorldMap.ts';
import { srgb } from '../../util/TextureGen.ts';

/**
 * Per-zone vegetation recipes — what actually grows in each of the nineteen
 * zones of Lucis.
 *
 * This is the vegetation twin of `props/ZoneDress.js`, and it exists for the
 * same reason that file does: a single global scatter table makes every zone
 * the same shot with a different skybox. Before this module the whole 8 km
 * world grew one biome — dry Leide scrub — because `Ecology.moisture()` is a
 * global fbm that has never heard of the cartography. The Nebulawood, Malmalam
 * Thicket, the Vesperpool and the whole of Duscae are *defined* as closed wet
 * forest and wetland in `docs/WORLDMAP.md`, and they were bare dirt.
 *
 * Field reference
 *   grassD     density multiplier for the grass field
 *   grassH     height multiplier — Leide is the 0.15-0.35 m ankle tuft the
 *              critics liked, marsh is waist-high reed grass, forest floor is
 *              sparser and longer
 *   grassDead  fraction of bleached last-season tussocks (Leide's signature
 *              pale speckle; a wet forest floor has none)
 *   dry/lush   the two ends of this zone's grass colour ramp, sRGB
 *   wetBias    where on that ramp the zone sits before local drainage
 *   treeD      forest density multiplier (1 == the old global scatter)
 *   canopy     0..1 how continuous the cover is. It lifts the floor of the
 *              grove noise, so a canopy-1.0 zone has trees *everywhere* rather
 *              than in islands, which is the whole difference between a wood
 *              and a scattered stand
 *   trees      species mix, weights
 *   treeS      [min, max] scale multiplier on the species' own height
 *   treeTint   [r,g,b] canopy tint multiplier
 *   scrubD     ground-layer bush density
 *   scrub      bush-kind mix, weights
 *   reedD      reed density at the water line
 *   lilyD      lily-pad density on the water surface
 *   mossy      0..1 moss on trunks and forest floor
 *
 * A zone omitted from this table falls back to `_default`, the generic Lucian
 * highland used on the frontier beyond every zone's reach.
 */

/** Species mixes reused by several zones. */
const MIX_LEIDE = { dead: 0.55, savanna: 0.45 };
const MIX_DUSCAE = { duscae: 0.62, broadleaf: 0.30, swamp: 0.08 };
const MIX_WETLAND = { swamp: 0.58, duscae: 0.18, broadleaf: 0.14, dead: 0.10 };
const MIX_HIGHLAND = { conifer: 0.5, broadleaf: 0.3, savanna: 0.2 };

const SCRUB_LEIDE = { sage: 0.46, thorn: 0.38, shrub: 0.16 };
const SCRUB_FOREST = { fern: 0.42, bracken: 0.34, shrub: 0.22, thorn: 0.02 };
const SCRUB_MARSH = { reed: 0.54, fern: 0.20, bracken: 0.16, shrub: 0.10 };
const SCRUB_ASH = { thorn: 0.72, sage: 0.28 };

const BASE = {
  grassD: 1, grassH: 1, grassDead: 0.20,
  dry: 0x91855a, lush: 0x566733, wetBias: 0.0,
  treeD: 1, canopy: 0, trees: MIX_LEIDE, treeS: [0.8, 1.25], treeTint: [1, 1, 1],
  scrubD: 1, scrub: SCRUB_LEIDE,
  reedD: 0, lilyD: 0, mossy: 0,
};

const mk = (o) => ({ ...BASE, ...o });

/** @type {Object<string, object>} */
export const VEG_BIOME = {
  // ----------------------------------------------------------------- LEIDE
  // What is already here and works: 0.15-0.35 m olive/straw tufts over open
  // dirt, dry thorn scrub, the odd dead tree. Do not "improve" this.
  longwythe: mk({
    grassD: 1.0, grassH: 1.0, grassDead: 0.22,
    dry: 0x91855a, lush: 0x566733, wetBias: -0.04,
    treeD: 0.24, canopy: 0, trees: { dead: 0.7, savanna: 0.3 }, treeS: [0.75, 1.15],
    treeTint: [1.02, 0.94, 0.66],
    scrubD: 0.85, scrub: SCRUB_LEIDE,
  }),
  three_valleys: mk({
    grassD: 0.78, grassH: 0.92, grassDead: 0.28,
    dry: 0x8f8257, lush: 0x62663a, wetBias: -0.08,
    treeD: 0.20, trees: { dead: 0.8, savanna: 0.2 }, treeS: [0.7, 1.0],
    treeTint: [1.0, 0.9, 0.62],
    scrubD: 1.1, scrub: { sage: 0.38, thorn: 0.52, shrub: 0.10 },
  }),
  crown_verge: mk({
    grassD: 0.6, grassH: 0.85, grassDead: 0.34,
    dry: 0x897d55, lush: 0x5f6339, wetBias: -0.10,
    treeD: 0.12, trees: { dead: 0.9, savanna: 0.1 }, treeS: [0.7, 1.0],
    treeTint: [0.94, 0.9, 0.74],
    scrubD: 0.8, scrub: { thorn: 0.7, sage: 0.3 },
  }),
  kelbass: mk({
    grassD: 1.15, grassH: 1.05, grassDead: 0.20,
    dry: 0x92875c, lush: 0x5d6a3a, wetBias: 0.04,
    treeD: 0.34, trees: { savanna: 0.68, dead: 0.32 }, treeS: [0.85, 1.3],
    treeTint: [1.0, 0.95, 0.62],
    scrubD: 0.85, scrub: { sage: 0.56, thorn: 0.26, shrub: 0.18 },
  }),
  galdin: mk({
    grassD: 0.8, grassH: 1.15, grassDead: 0.16,
    dry: 0x8d8a60, lush: 0x647644, wetBias: 0.16,
    treeD: 0.5, canopy: 0.1, trees: { savanna: 0.5, broadleaf: 0.4, swamp: 0.1 },
    treeS: [0.8, 1.2], treeTint: [0.94, 0.98, 0.70],
    scrubD: 0.7, scrub: { sage: 0.3, shrub: 0.44, reed: 0.26 },
    reedD: 0.7,
  }),
  keycatrich: mk({
    grassD: 0.62, grassH: 0.88, grassDead: 0.34,
    dry: 0x897c52, lush: 0x5e6239, wetBias: -0.10,
    treeD: 0.16, trees: { dead: 0.86, savanna: 0.14 }, treeS: [0.7, 1.0],
    treeTint: [0.96, 0.9, 0.7],
    scrubD: 0.9, scrub: { thorn: 0.62, sage: 0.38 },
  }),
  balouve: mk({
    grassD: 0.6, grassH: 0.85, grassDead: 0.32,
    dry: 0x877b52, lush: 0x5d6138, wetBias: -0.10,
    treeD: 0.2, trees: { dead: 0.88, savanna: 0.12 }, treeS: [0.7, 1.0],
    treeTint: [0.95, 0.9, 0.7],
    scrubD: 0.95, scrub: { thorn: 0.66, sage: 0.34 },
  }),

  // ---------------------------------------------------------------- DUSCAE
  // The green basin. This is the signature FFXV look after Leide and it was
  // entirely missing: humid closed forest, standing water, ferns and moss.
  alstor: mk({
    grassD: 1.25, grassH: 1.75, grassDead: 0.03,
    dry: 0x7e8a46, lush: 0x40602c, wetBias: 0.62,
    treeD: 1.0, canopy: 0.24, trees: MIX_WETLAND, treeS: [0.85, 1.35],
    treeTint: [0.74, 0.86, 0.62],
    scrubD: 1.3, scrub: SCRUB_MARSH,
    reedD: 1.5, lilyD: 1.0, mossy: 0.7,
  }),
  weaverwilds: mk({
    grassD: 1.35, grassH: 1.2, grassDead: 0.08,
    dry: 0x8d9450, lush: 0x4c6c30, wetBias: 0.34,
    // Wiz country: open chocobo prairie broken by *lone* broadleaf stands, so
    // the density is real but the canopy never closes.
    treeD: 0.68, canopy: 0.05, trees: { broadleaf: 0.56, duscae: 0.3, savanna: 0.14 },
    treeS: [0.9, 1.45], treeTint: [0.74, 0.84, 0.60],
    scrubD: 0.8, scrub: { shrub: 0.5, fern: 0.24, bracken: 0.16, sage: 0.10 },
  }),
  nebulawood: mk({
    grassD: 1.3, grassH: 1.5, grassDead: 0.02,
    dry: 0x6d8043, lush: 0x3d5f31, wetBias: 0.56,
    // "The canopy closes and the light goes green." canopy 1 means continuous
    // cover, not islands.
    treeD: 1.15, canopy: 0.7, trees: MIX_DUSCAE, treeS: [0.95, 1.4],
    treeTint: [0.76, 0.88, 0.66],
    scrubD: 1.5, scrub: SCRUB_FOREST,
    mossy: 1.0,
  }),
  cauthess: mk({
    grassD: 0.42, grassH: 0.85, grassDead: 0.42,
    // ejecta field: scorched stone and almost nothing that grows
    dry: 0x7a7050, lush: 0x57603e, wetBias: -0.06,
    treeD: 0.14, trees: { dead: 0.94, savanna: 0.06 }, treeS: [0.6, 0.95],
    treeTint: [0.78, 0.72, 0.62],
    scrubD: 0.55, scrub: SCRUB_ASH,
  }),
  taelpar: mk({
    grassD: 0.95, grassH: 1.1, grassDead: 0.14,
    dry: 0x92955a, lush: 0x506434, wetBias: 0.20,
    treeD: 0.85, canopy: 0.22, trees: { conifer: 0.4, broadleaf: 0.34, duscae: 0.2, dead: 0.06 },
    treeS: [0.85, 1.3], treeTint: [0.70, 0.82, 0.64],
    scrubD: 1.0, scrub: { shrub: 0.4, fern: 0.3, bracken: 0.18, thorn: 0.12 },
    mossy: 0.5,
  }),
  fallgrove: mk({
    grassD: 1.4, grassH: 1.15, grassDead: 0.10,
    dry: 0x93995a, lush: 0x4e6a32, wetBias: 0.30,
    // grazed downland *ringed by dead grovewood*
    treeD: 0.7, canopy: 0.12, trees: { broadleaf: 0.4, duscae: 0.28, dead: 0.24, swamp: 0.08 },
    treeS: [0.85, 1.35], treeTint: [0.76, 0.86, 0.60],
    scrubD: 0.9, scrub: { shrub: 0.44, fern: 0.24, bracken: 0.2, sage: 0.12 },
    mossy: 0.4,
  }),

  // --------------------------------------------------------------- CLEIGNE
  lestallum_shelf: mk({
    grassD: 0.75, grassH: 1.0, grassDead: 0.16,
    dry: 0x8e9159, lush: 0x556a3c, wetBias: 0.06,
    treeD: 0.5, canopy: 0.08, trees: { conifer: 0.5, broadleaf: 0.36, dead: 0.14 },
    treeS: [0.8, 1.2], treeTint: [0.74, 0.86, 0.70],
    scrubD: 0.9, scrub: { shrub: 0.42, thorn: 0.3, fern: 0.18, sage: 0.10 },
  }),
  malmalam: mk({
    grassD: 1.05, grassH: 1.35, grassDead: 0.0,
    // "so dense the road stops and the map goes blank" — dark, tangled, wet
    dry: 0x647448, lush: 0x35522a, wetBias: 0.70,
    treeD: 1.5, canopy: 0.8, trees: { thicket: 0.66, duscae: 0.24, broadleaf: 0.10 },
    treeS: [0.9, 1.4], treeTint: [0.54, 0.66, 0.52],
    scrubD: 2.0, scrub: { fern: 0.4, bracken: 0.42, shrub: 0.18 },
    mossy: 1.0,
  }),
  vesperpool: mk({
    grassD: 1.0, grassH: 1.8, grassDead: 0.05,
    dry: 0x7b8848, lush: 0x3d5c30, wetBias: 0.66,
    // a drowned forest — the props layer owns the standing dead trunks out in
    // the water, so this is the living fringe on the banks behind them
    treeD: 0.9, canopy: 0.2, trees: MIX_WETLAND, treeS: [0.85, 1.3],
    treeTint: [0.72, 0.84, 0.62],
    scrubD: 1.2, scrub: SCRUB_MARSH,
    reedD: 1.6, lilyD: 1.2, mossy: 0.8,
  }),
  ravatogh: mk({
    grassD: 0.12, grassH: 0.7, grassDead: 0.62,
    // ash slopes: burnt stubble, nothing green
    dry: 0x635b4e, lush: 0x545640, wetBias: -0.22,
    treeD: 0.10, trees: { dead: 1.0 }, treeS: [0.5, 0.85],
    treeTint: [0.52, 0.48, 0.46],
    scrubD: 0.3, scrub: SCRUB_ASH,
  }),
  meldacio: mk({
    grassD: 0.85, grassH: 1.05, grassDead: 0.18,
    dry: 0x8b9058, lush: 0x4f6738, wetBias: 0.04,
    treeD: 0.8, canopy: 0.18, trees: MIX_HIGHLAND, treeS: [0.85, 1.25],
    treeTint: [0.70, 0.84, 0.70],
    scrubD: 1.0, scrub: { shrub: 0.4, thorn: 0.28, fern: 0.2, sage: 0.12 },
    mossy: 0.35,
  }),
  cape_caem: mk({
    grassD: 1.5, grassH: 1.2, grassDead: 0.06,
    dry: 0x93a05c, lush: 0x4e7034, wetBias: 0.42,
    treeD: 0.9, canopy: 0.2, trees: { broadleaf: 0.5, duscae: 0.26, conifer: 0.18, swamp: 0.06 },
    treeS: [0.8, 1.25], treeTint: [0.74, 0.86, 0.62],
    scrubD: 0.9, scrub: { shrub: 0.48, fern: 0.26, bracken: 0.16, reed: 0.10 },
    reedD: 0.4, mossy: 0.4,
  }),

  // the frontier: generic Lucian highland
  _default: mk({
    grassD: 0.7, grassH: 1.0, grassDead: 0.22,
    dry: 0x8b8358, lush: 0x586537, wetBias: -0.02,
    treeD: 0.4, canopy: 0.05, trees: { savanna: 0.42, conifer: 0.3, dead: 0.28 },
    treeS: [0.75, 1.2], treeTint: [0.9, 0.92, 0.7],
    scrubD: 0.8, scrub: { sage: 0.4, thorn: 0.34, shrub: 0.26 },
  }),
};

/**
 * Flatten a `{key: weight}` table into a cumulative array so a per-instance
 * pick is one walk over a small array instead of an object enumeration.
 * @param {Object<string,number>} table
 * @returns {Array<[string, number]>}
 */
function cumulative(table) {
  let total = 0;
  for (const k in table) total += table[k];
  const out = [];
  let acc = 0;
  for (const k in table) { acc += table[k] / total; out.push([k, acc]); }
  if (out.length) out[out.length - 1][1] = 1.0001;
  return out;
}

// Pre-resolve the colour ramps to linear once, and the species mixes to
// cumulative tables. Both are read on the scatter hot path.
for (const id in VEG_BIOME) {
  const b = VEG_BIOME[id];
  b.id = id;
  b.dryC = srgb(b.dry);
  b.lushC = srgb(b.lush);
  b.treeTable = cumulative(b.trees);
  b.scrubTable = cumulative(b.scrub);
}

/**
 * Pick a key from a cumulative table with a 0..1 random.
 * @param {Array<[string, number]>} table
 * @param {number} r
 * @returns {string|null}
 */
export function pickFrom(table, r) {
  for (let i = 0; i < table.length; i++) if (r < table[i][1]) return table[i][0];
  return table.length ? table[table.length - 1][0] : null;
}

// ------------------------------------------------------------------ lookup

const CELL = 64;
const _cache = new Map();
const _moist = new Map();

/**
 * The vegetation recipe at a world position, memoised on a 64 m grid.
 *
 * `zoneAt` is nineteen exponentials and the scatter asks this tens of thousands
 * of times per stream-in, so it is cached exactly the way `ZoneDress.dressAt`
 * caches its own lookup. The grid is coarse relative to a cluster cell, so two
 * neighbouring recipes interleave across a border over a couple of hundred
 * metres rather than switching on a line.
 *
 * @param {number} x @param {number} z
 * @returns {object} a {@link VEG_BIOME} record (never null)
 */
export function vegAt(x, z) {
  const k = (Math.floor(x / CELL) & 0xffff) * 65536 + (Math.floor(z / CELL) & 0xffff);
  let b = _cache.get(k);
  if (b !== undefined) return b;
  const zn = worldMap.zoneAt(x, z);
  b = (zn && VEG_BIOME[zn.id]) || VEG_BIOME._default;
  if (_cache.size > 30000) _cache.clear();
  _cache.set(k, b);
  return b;
}

/**
 * Blended zone humidity, 0..1, straight off the cartography — the same value
 * `ZoneDress.zoneMoist` reads, cached separately because vegetation samples it
 * on a finer grid than the prop layer does.
 *
 * This is the number that was missing. `Ecology.moisture()` is a global fbm; as
 * far as it is concerned the Nebulawood is as dry as Leide, which is precisely
 * why the whole world grew one biome.
 *
 * @param {number} x @param {number} z
 * @returns {number} 0..1
 */
export function zoneMoist(x, z) {
  const k = (Math.floor(x / CELL) & 0xffff) * 65536 + (Math.floor(z / CELL) & 0xffff);
  let m = _moist.get(k);
  if (m !== undefined) return m;
  m = worldMap.biomeVec(x, z)[7];       // BIOME_KEYS index of 'moist'
  if (_moist.size > 30000) _moist.clear();
  _moist.set(k, m);
  return m;
}

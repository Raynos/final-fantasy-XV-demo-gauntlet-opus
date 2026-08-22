import { worldMap } from '../map/WorldMap.ts';

/**
 * Per-zone dressing recipes.
 *
 * Everything the prop layer scatters asks this module two questions:
 *   "what kind of stone is this country made of?"  -> rock/frag/tint
 *   "what does the ground here have lying on it?"  -> litter
 *
 * The point is that the nineteen zones of Lucis must not share one global
 * scatter table. Leide is rust-ochre bedded sandstone with bones in the dry
 * washes; the Nebulawood is mossy granite under fallen timber and leaf drift;
 * Ravatogh is black scoria and nothing alive; the Vesperpool is drowned
 * trunks. If the scatter table is global then every zone shot is the same
 * shot with a different skybox, which is exactly what the world looked like
 * before this file existed.
 *
 * Field reference
 *   rockD    scatter density multiplier for boulders and outcrops
 *   rockS    size multiplier
 *   tint     [r,g,b] multiplier applied to the instance colour
 *   bright   overall lightness multiplier
 *   kinds    weights for the *anchor* rock of a cluster
 *   frag     weights for the spalled fragments around the anchor
 *   litter   per-kind density for the small-debris layer, 0..~1.5
 *   life     {birds, herd, shore} wildlife density — raptors on thermals,
 *            grazing stock, and waders working the water's edge
 */

/**
 * The closed sets this module names.
 *
 * Every one of these is a key of a weight table that some other prop module
 * indexes with a literal, so they are unions declared once rather than `string`
 * asserted at each call site: `Debris` walks {@link LITTER_KINDS} and reads
 * `dress.litter[key]`, `Rocks` feeds `kinds`/`frag` to `pickWeighted`.
 */
export type RockKind = 'granite' | 'bedded' | 'slab' | 'spire' | 'worn' | 'cobble';
export type FragKind = 'pebble' | 'cobble' | 'talus';
/**
 * Every kind of stone the prop layer builds a mesh for. `Rocks` picks an
 * anchor out of {@link RockMix} and its spall out of {@link FragMix}, and both
 * index the same table of shapes -- so the table's key set is the union, not
 * either half.
 */
export type StoneKind = RockKind | FragKind;
export type LitterKind =
  | 'branch' | 'log' | 'stump' | 'leaves' | 'bones' | 'planks'
  | 'rubble' | 'driftwood' | 'deadtrunk' | 'cairn' | 'barrel' | 'reeds';

/** A `{key: weight}` table. A missing key means weight zero, not "unset". */
export type RockMix = Partial<Record<RockKind, number>>;
export type FragMix = Record<FragKind, number>;
export type LitterMix = Partial<Record<LitterKind, number>>;

/** Wildlife density: raptors on thermals, grazing stock, waders on the shore. */
export interface LifeMix { birds: number; herd: number; shore: number }

/**
 * A resolved dressing recipe — what {@link dressAt} hands out. Every field is
 * present, which is the point: the scatter reads `dress.rockS` tens of
 * thousands of times a stream-in and must never guard.
 */
export interface Dress {
  /** Scatter density multiplier for boulders and outcrops. */
  rockD: number;
  /** Size multiplier. */
  rockS: number;
  /** `[r,g,b]` multiplier applied to the instance colour. */
  tint: [number, number, number];
  /** Overall lightness multiplier. */
  bright: number;
  kinds: RockMix;
  frag: FragMix;
  litter: LitterMix;
  life: LifeMix;
}

/**
 * What a zone *author* writes in {@link ZONE_DRESS}: anything left out falls
 * back to {@link BASE}, and `life` merges field-by-field where `litter` and
 * `kinds` replace wholesale — a zone that names its litter means *only* that
 * litter. {@link mk} is the one place that resolution happens.
 */
export type DressSpec = Partial<Omit<Dress, 'life'>> & { life?: Partial<LifeMix> };

/** Fragment mixes reused by several zones. */
const FRAG_ANGULAR: FragMix = { pebble: 0.34, cobble: 0.24, talus: 0.42 };
const FRAG_ROUND: FragMix = { pebble: 0.44, cobble: 0.38, talus: 0.18 };
const FRAG_SCREE: FragMix = { pebble: 0.24, cobble: 0.16, talus: 0.60 };

const BASE: Dress = {
  rockD: 1, rockS: 1, tint: [1.07, 1.0, 0.9], bright: 1,
  kinds: { granite: 0.15, bedded: 0.16, slab: 0.12, spire: 0.06, worn: 0.14, cobble: 0.37 },
  frag: FRAG_ANGULAR,
  litter: { branch: 0.15, bones: 0.1 },
  life: { birds: 1, herd: 0, shore: 0.25 },
};

const mk = (o: DressSpec): Dress => ({ ...BASE, ...o, litter: { ...o.litter }, life: { ...BASE.life, ...o.life } });

/**
 * The frontier recipe: generic upland, and the answer for any position that
 * falls outside all nineteen zones. Named rather than reached for through
 * `ZONE_DRESS._default` so {@link dressAt}'s return really is a `Dress` and
 * not "a `Dress` if that key happens to be there".
 */
export const DEFAULT_DRESS: Dress = mk({
  rockD: 0.9, rockS: 1.0, tint: [1.02, 0.98, 0.9], bright: 0.9,
  litter: { branch: 0.3, bones: 0.2, log: 0.15 },
  life: { birds: 0.9, herd: 0.15, shore: 0.3 },
});

export const ZONE_DRESS: Record<string, Dress> = {
  // ---------------------------------------------------------------- LEIDE
  // Rust-ochre badlands. Bedded sandstone that breaks into tabular slabs,
  // dry-wash bones, brittle dead brush, nothing green.
  longwythe: mk({
    rockD: 1.0, rockS: 1.05, tint: [1.20, 0.95, 0.74], bright: 1.02,
    kinds: { bedded: 0.26, slab: 0.20, granite: 0.10, spire: 0.06, worn: 0.10, cobble: 0.28 },
    frag: FRAG_ANGULAR,
    litter: { bones: 0.55, branch: 0.30, planks: 0.10, cairn: 0.06 },
    life: { birds: 1.2, herd: 0.8, shore: 0.2 },
  }),
  three_valleys: mk({
    rockD: 1.35, rockS: 1.0, tint: [1.22, 0.94, 0.70], bright: 0.98,
    kinds: { bedded: 0.24, slab: 0.16, spire: 0.16, granite: 0.12, worn: 0.06, cobble: 0.26 },
    frag: FRAG_SCREE,
    litter: { bones: 0.85, branch: 0.22, cairn: 0.12 },
    life: { birds: 1.1, herd: 0.3, shore: 0.1 },
  }),
  crown_verge: mk({
    rockD: 1.2, rockS: 1.2, tint: [1.05, 0.98, 0.94], bright: 0.94,
    kinds: { bedded: 0.20, slab: 0.24, granite: 0.18, spire: 0.08, worn: 0.06, cobble: 0.24 },
    frag: FRAG_ANGULAR,
    // the shattered approach to Insomnia: broken carriageway, rebar, burnt kit
    litter: { rubble: 1.1, planks: 0.35, barrel: 0.3, bones: 0.12 },
    life: { birds: 0.7, herd: 0, shore: 0 },
  }),
  kelbass: mk({
    rockD: 0.5, rockS: 0.9, tint: [1.16, 1.0, 0.80], bright: 1.05,
    kinds: { worn: 0.30, cobble: 0.36, bedded: 0.14, slab: 0.12, granite: 0.08 },
    frag: FRAG_ROUND,
    litter: { bones: 0.4, branch: 0.3, planks: 0.14 },
    life: { birds: 1.0, herd: 1.2, shore: 0.4 },
  }),
  galdin: mk({
    rockD: 0.6, rockS: 0.85, tint: [1.10, 1.06, 0.98], bright: 1.16,
    kinds: { worn: 0.44, cobble: 0.34, slab: 0.10, bedded: 0.08, granite: 0.04 },
    frag: FRAG_ROUND,
    litter: { driftwood: 0.9, planks: 0.3, branch: 0.1, reeds: 0.35 },
    life: { birds: 1.6, herd: 0, shore: 1.5 },
  }),
  keycatrich: mk({
    rockD: 1.05, rockS: 1.0, tint: [1.12, 1.0, 0.86], bright: 0.92,
    kinds: { bedded: 0.26, slab: 0.22, granite: 0.12, spire: 0.06, worn: 0.08, cobble: 0.26 },
    frag: FRAG_ANGULAR,
    // a spa town swallowed by dust
    litter: { rubble: 0.95, planks: 0.5, bones: 0.2, barrel: 0.18 },
    life: { birds: 0.8, herd: 0, shore: 0 },
  }),
  balouve: mk({
    rockD: 1.45, rockS: 1.05, tint: [1.00, 0.94, 0.86], bright: 0.9,
    kinds: { slab: 0.26, bedded: 0.22, granite: 0.16, spire: 0.10, cobble: 0.26 },
    frag: FRAG_SCREE,
    // mine spoil: broken timber, drums, sorted stone
    litter: { planks: 0.7, barrel: 0.45, rubble: 0.5, cairn: 0.1 },
    life: { birds: 0.7, herd: 0, shore: 0 },
  }),

  // --------------------------------------------------------------- DUSCAE
  // Humid, green, and full of things that have fallen over.
  alstor: mk({
    rockD: 0.45, rockS: 0.9, tint: [0.88, 0.98, 0.84], bright: 0.9,
    kinds: { worn: 0.5, cobble: 0.3, slab: 0.12, bedded: 0.08 },
    frag: FRAG_ROUND,
    litter: { log: 0.8, driftwood: 0.7, deadtrunk: 1.0, branch: 0.5, leaves: 0.3, stump: 0.3, reeds: 1.3 },
    life: { birds: 1.5, herd: 0.7, shore: 1.4 },
  }),
  weaverwilds: mk({
    rockD: 0.45, rockS: 0.9, tint: [1.0, 1.0, 0.88], bright: 1.0,
    kinds: { worn: 0.36, cobble: 0.34, bedded: 0.14, slab: 0.10, granite: 0.06 },
    frag: FRAG_ROUND,
    litter: { branch: 0.5, log: 0.3, stump: 0.25, leaves: 0.25, bones: 0.12 },
    life: { birds: 1.3, herd: 1.4, shore: 0.5 },
  }),
  nebulawood: mk({
    rockD: 0.95, rockS: 1.1, tint: [0.84, 0.96, 0.82], bright: 0.84,
    kinds: { granite: 0.26, worn: 0.26, slab: 0.16, bedded: 0.12, cobble: 0.20 },
    frag: FRAG_ROUND,
    // the floor of a closed canopy is timber and leaf drift, not gravel
    litter: { log: 1.35, branch: 1.1, stump: 0.75, leaves: 1.1, deadtrunk: 0.35 },
    life: { birds: 0.8, herd: 0.06, shore: 0.3 },
  }),
  cauthess: mk({
    rockD: 1.5, rockS: 1.3, tint: [0.94, 0.84, 0.82], bright: 0.8,
    kinds: { granite: 0.28, slab: 0.24, spire: 0.16, bedded: 0.12, cobble: 0.20 },
    frag: FRAG_SCREE,
    // ejecta field: scorched stone and nothing that grows
    litter: { rubble: 0.5, bones: 0.2, branch: 0.1, cairn: 0.05 },
    life: { birds: 0.5, herd: 0, shore: 0 },
  }),
  taelpar: mk({
    rockD: 1.3, rockS: 1.15, tint: [1.08, 0.96, 0.84], bright: 0.9,
    kinds: { slab: 0.26, bedded: 0.24, spire: 0.14, granite: 0.14, cobble: 0.22 },
    frag: FRAG_SCREE,
    litter: { branch: 0.35, log: 0.3, cairn: 0.14, bones: 0.15 },
    life: { birds: 1.4, herd: 0.05, shore: 0.1 },
  }),
  fallgrove: mk({
    rockD: 0.6, rockS: 0.95, tint: [1.0, 0.99, 0.86], bright: 0.96,
    kinds: { worn: 0.34, cobble: 0.3, bedded: 0.16, slab: 0.12, granite: 0.08 },
    frag: FRAG_ROUND,
    // ringed by dead grovewood
    litter: { deadtrunk: 0.8, log: 0.7, stump: 0.6, branch: 0.6, leaves: 0.4 },
    life: { birds: 1.1, herd: 1.0, shore: 0.5 },
  }),

  // -------------------------------------------------------------- CLEIGNE
  lestallum_shelf: mk({
    rockD: 1.1, rockS: 1.15, tint: [0.86, 0.88, 0.94], bright: 0.82,
    // a basalt terrace: columnar, dark, squared off
    kinds: { spire: 0.26, slab: 0.24, granite: 0.20, bedded: 0.12, cobble: 0.18 },
    frag: FRAG_ANGULAR,
    litter: { rubble: 0.55, barrel: 0.3, planks: 0.3 },
    life: { birds: 0.9, herd: 0, shore: 0.1 },
  }),
  malmalam: mk({
    rockD: 0.8, rockS: 1.0, tint: [0.80, 0.94, 0.78], bright: 0.8,
    kinds: { granite: 0.24, worn: 0.3, slab: 0.14, bedded: 0.12, cobble: 0.20 },
    frag: FRAG_ROUND,
    litter: { log: 1.4, branch: 1.2, stump: 0.9, leaves: 1.2, deadtrunk: 0.3, reeds: 0.4 },
    life: { birds: 0.6, herd: 0, shore: 0.5 },
  }),
  vesperpool: mk({
    rockD: 0.5, rockS: 0.9, tint: [0.86, 0.92, 0.88], bright: 0.84,
    kinds: { worn: 0.44, cobble: 0.34, slab: 0.12, bedded: 0.10 },
    frag: FRAG_ROUND,
    // a drowned forest: standing dead trunks are the whole silhouette
    litter: { deadtrunk: 2.1, driftwood: 0.9, log: 0.6, branch: 0.4, stump: 0.5, reeds: 1.1 },
    life: { birds: 1.5, herd: 0.35, shore: 1.6 },
  }),
  ravatogh: mk({
    rockD: 1.7, rockS: 1.15, tint: [0.70, 0.66, 0.66], bright: 0.82,
    // scoria and lava bomb: all fracture, no rounding
    kinds: { spire: 0.20, granite: 0.22, slab: 0.20, bedded: 0.12, cobble: 0.26 },
    frag: FRAG_SCREE,
    litter: { rubble: 0.35, cairn: 0.08 },
    life: { birds: 0.4, herd: 0, shore: 0 },
  }),
  meldacio: mk({
    rockD: 1.3, rockS: 1.12, tint: [0.94, 0.94, 0.92], bright: 0.88,
    kinds: { slab: 0.22, granite: 0.22, bedded: 0.20, spire: 0.12, cobble: 0.24 },
    frag: FRAG_SCREE,
    // hunter country: waymark cairns and firewood at every layby
    litter: { cairn: 0.4, branch: 0.6, log: 0.4, bones: 0.3, planks: 0.2 },
    life: { birds: 1.2, herd: 0.25, shore: 0.3 },
  }),
  cape_caem: mk({
    rockD: 0.7, rockS: 0.9, tint: [0.94, 1.0, 0.9], bright: 1.0,
    kinds: { worn: 0.4, cobble: 0.3, slab: 0.14, bedded: 0.1, granite: 0.06 },
    frag: FRAG_ROUND,
    litter: { driftwood: 0.8, planks: 0.45, branch: 0.35, log: 0.25, leaves: 0.2, reeds: 0.5 },
    life: { birds: 1.7, herd: 0.4, shore: 1.3 },
  }),

  // the frontier: generic upland
  _default: DEFAULT_DRESS,
};

/** Every litter kind any zone can ask for. */
export const LITTER_KINDS: readonly LitterKind[] = [
  'branch', 'log', 'stump', 'leaves', 'bones', 'planks',
  'rubble', 'driftwood', 'deadtrunk', 'cairn', 'barrel', 'reeds',
];

// ------------------------------------------------------------------ lookup

const _cache = new Map<number, Dress>();
const CELL = 96;

/**
 * The dressing recipe at a world position, cached on a 96 m grid.
 *
 * `zoneAt` is nineteen exponentials; the scatter asks this question tens of
 * thousands of times during a stream-in, so the answer is memoised per cell.
 * The grid is coarse enough that a zone border reads as a soft transition
 * between two recipes rather than a line — the two zones' scatter fields
 * interleave over a couple of hundred metres because the cluster cells
 * straddle the boundary.
 *
 * @param x @param z
 * @returns a {@link ZONE_DRESS} record (never null)
 */
export function dressAt(x: number, z: number): Dress {
  const k = (Math.floor(x / CELL) & 0xffff) * 65536 + (Math.floor(z / CELL) & 0xffff);
  const hit = _cache.get(k);
  if (hit !== undefined) return hit;
  const zn = worldMap.zoneAt(x, z);
  const d = (zn ? ZONE_DRESS[zn.id] : undefined) ?? DEFAULT_DRESS;
  if (_cache.size > 20000) _cache.clear();
  _cache.set(k, d);
  return d;
}

/**
 * Blended zone humidity, 0..1, straight off the cartography.
 *
 * `Ecology.moisture` is a global fbm that knows nothing about the zone tables,
 * so as far as it is concerned the Nebulawood is as dry as Leide. Anything in
 * the prop layer that wants to know "is this a wet place" has to ask the map,
 * not the noise. Cached on the same grid as {@link dressAt}.
 */
const _moistCache = new Map<number, number>();
export function zoneMoist(x: number, z: number) {
  const k = (Math.floor(x / CELL) & 0xffff) * 65536 + (Math.floor(z / CELL) & 0xffff);
  let m = _moistCache.get(k);
  if (m !== undefined) return m;
  m = worldMap.biomeVec(x, z)[7];      // BIOME_KEYS index of 'moist'
  if (_moistCache.size > 20000) _moistCache.clear();
  _moistCache.set(k, m);
  return m;
}

/** The zone id at a world position, or `'_default'` on the frontier. */
export function zoneIdAt(x: number, z: number) {
  const zn = worldMap.zoneAt(x, z);
  return zn ? zn.id : '_default';
}

/**
 * Pick a key from a `{key: weight}` table with a 0..1 random.
 */
export function pickWeighted(table: Record<string, number>, r: number): string {
  let total = 0;
  for (const k in table) total += table[k];
  let t = r * total;
  let last = 'cobble';
  for (const k in table) {
    last = k;
    t -= table[k];
    if (t <= 0) return k;
  }
  return last;
}

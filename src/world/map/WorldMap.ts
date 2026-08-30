import { ROUTES, NODES, ROAD_CLASS, RoadGraph } from './RoadGraph.ts';

/**
 * THE WORLD OF LUCIS — the authoritative map.
 *
 * This module is the single source of truth for *where everything is*. The
 * heightfield, the vegetation, the props, the quests, the minimap, the world
 * map screen and the driving system all read the same tables, so a coordinate
 * only ever exists in one place.
 *
 * Conventions
 *   - Right-handed world, metres. **North is -Z**, east is +X.
 *   - The playable field is a square 8192 m on a side, x,z in [-4096, +4096].
 *   - Sea level is -6.5 m (matching `Water.level`); anything carved below that
 *     fills with water automatically.
 *   - Hammerhead sits at the origin. It is the western gate of Leide, exactly
 *     as it is in the game, and it is where the player starts.
 *
 * The full cartographic design — borders, character, pacing, traversal times,
 * per-zone terrain requirements — lives in `docs/WORLDMAP.md`.
 */

export const WORLD = {
  /** Half-extent of the detailed field, metres. */
  half: 4096,
  /** Full span, metres. */
  size: 8192,
  /** World Y of the sea / lake surface. Must match `Water.level`. */
  seaLevel: -6.5,
  /** Heading of world -Z, in degrees. */
  north: 0,
};

// ---------------------------------------------------------------- regions

/**
 * The three great regions of Lucis the player can reach on foot and by car.
 * A region is a *narrative* grouping; the terrain is driven by zones.
 */
/**
 * One of the three great regions. A region is a *narrative* grouping; the
 * terrain is driven by zones.
 */
export interface Region {
  id: string;
  name: string;
  /** The region's subtitle on the map screen. */
  sub: string;
  /** `[min, max]` level band the region is tuned for. */
  levels: number[];
  /** Map tint, CSS hex. */
  tint: string;
  blurb: string;
}

export const REGIONS: Region[] = [
  {
    id: 'leide',
    name: 'Leide',
    sub: 'The Ochre Marches',
    levels: [1, 15],
    tint: '#c99a63',
    blurb: 'Sun-cracked badlands east of the Duscaen line. Mesas, dry washes, '
      + 'rust-red rock and the long road home to a city that is no longer there.',
  },
  {
    id: 'duscae',
    name: 'Duscae',
    sub: 'The Green Basin',
    levels: [15, 35],
    tint: '#6e8f52',
    blurb: 'Humid lowland forest, standing water and a sky that never quite '
      + 'clears. The Disc of Cauthess burns on the northern horizon.',
  },
  {
    id: 'cleigne',
    name: 'Cleigne',
    sub: 'The Highland Reach',
    levels: [35, 60],
    tint: '#7d8ea0',
    blurb: 'Cold uplands, a volcano, a drowned forest and the one city on the '
      + 'continent still lit at night.',
  },
];

// ------------------------------------------------------------------ zones

/**
 * Zones are elliptical influence fields, not polygons. Every point in the
 * world gets a normalised weight per zone; the terrain blends biome parameters
 * by that weight (so borders are geology, not lines) while `zoneAt()` returns
 * the strongest one (so the UI can name where you are).
 *
 * Biome parameters — all consumed by `terrain/Field.ts`:
 *   base      baseline ground elevation, metres
 *   relief    amplitude of the rolling mid-scale fbm, metres
 *   ridge     amplitude of the ridged badland/mountain belt, metres
 *   ridgeIn   metres from the zone centre at which the ridge belt switches on
 *   terrace   0..1 how hard the land benches into mesa steps
 *   rough     0..1 high-frequency surface roughness
 *   warp      domain-warp distance, metres — kills the procedural grid feel
 *   moist     0..1 dryness->humidity; drives material splat and vegetation
 *   rocky     0..1 bare-rock bias
 *   style     0..1 broad table/cuesta (0) .. spiky fang (1)
 */
/**
 * The ten biome parameters, all consumed by `terrain/Field.ts`. `BIOME_KEYS`
 * below is the same list as a value, and fixes the packing order.
 */
export interface Biome {
  /** Baseline ground elevation, metres. */
  base: number;
  /** Amplitude of the rolling mid-scale fbm, metres. */
  relief: number;
  /** Amplitude of the ridged badland/mountain belt, metres. */
  ridge: number;
  /** Metres from the zone centre at which the ridge belt switches on. */
  ridgeIn: number;
  /** 0..1 how hard the land benches into mesa steps. */
  terrace: number;
  /** 0..1 high-frequency surface roughness. */
  rough: number;
  /** Domain-warp distance, metres — kills the procedural grid feel. */
  warp: number;
  /** 0..1 dryness -> humidity; drives material splat and vegetation. */
  moist: number;
  /** 0..1 bare-rock bias. */
  rocky: number;
  /** 0..1 broad table/cuesta (0) .. spiky fang (1). */
  style: number;
}

/**
 * One elliptical zone of influence. Not a polygon: every point gets a
 * normalised weight per zone and the terrain blends by it.
 */
export interface Zone {
  id: string;
  name: string;
  /** `Region.id` this zone belongs to. */
  region: string;
  /** `[min, max]` level band. */
  levels: number[];
  /** Centre of the ellipse, world metres. */
  cx: number;
  cz: number;
  /** Semi-axes, world metres. */
  rx: number;
  rz: number;
  /** Rotation of the ellipse, radians. */
  rot: number;
  /** Weight multiplier where zones overlap; the strongest one names the place. */
  priority: number;
  character: string;
  biome: Biome;
}

export const ZONES: Zone[] = [
  // ---- LEIDE ----------------------------------------------------------
  {
    id: 'longwythe', name: 'Longwythe', region: 'leide', levels: [1, 8],
    cx: 380, cz: -260, rx: 1250, rz: 1050, rot: 0.16, priority: 1.25,
    character: 'Open scrub pan under a single black peak. The tutorial country.',
    biome: { base: 14, relief: 20, ridge: 195, ridgeIn: 620, terrace: 0.62, rough: 0.85, warp: 250, moist: 0.20, rocky: 0.44, style: 0.34 },
  },
  {
    id: 'three_valleys', name: 'The Three Valleys', region: 'leide', levels: [4, 12],
    cx: 1360, cz: 1160, rx: 1150, rz: 1000, rot: -0.3, priority: 1.0,
    character: 'Three parallel dry valleys between hogback fins. Sabertusk country.',
    biome: { base: 20, relief: 34, ridge: 240, ridgeIn: 300, terrace: 0.5, rough: 1.0, warp: 300, moist: 0.24, rocky: 0.56, style: 0.62 },
  },
  {
    id: 'crown_verge', name: 'Ostium Gorge', region: 'leide', levels: [10, 20],
    cx: 3180, cz: 120, rx: 1150, rz: 1400, rot: 0.1, priority: 1.0,
    character: 'The shattered approach to Insomnia. Broken flyovers, imperial armour, the Wall.',
    biome: { base: 26, relief: 30, ridge: 290, ridgeIn: 260, terrace: 0.72, rough: 0.9, warp: 240, moist: 0.18, rocky: 0.62, style: 0.30 },
  },
  {
    id: 'kelbass', name: 'Vannath Coast', region: 'leide', levels: [6, 14],
    cx: 2060, cz: 1280, rx: 900, rz: 1100, rot: 0.0, priority: 0.95,
    character: 'The dry prairie the Galdin road crosses. Grazing dualhorn, wind, nothing else.',
    biome: { base: 16, relief: 22, ridge: 120, ridgeIn: 520, terrace: 0.35, rough: 0.7, warp: 280, moist: 0.34, rocky: 0.26, style: 0.4 },
  },
  {
    id: 'galdin', name: 'Galdin Coast', region: 'leide', levels: [8, 16],
    cx: 2540, cz: 2760, rx: 1420, rz: 1200, rot: 0.05, priority: 1.5,
    character: 'The southern shore. Turquoise shallows, a pier hotel, Angelgard offshore.',
    biome: { base: 10, relief: 16, ridge: 40, ridgeIn: 900, terrace: 0.2, rough: 0.5, warp: 220, moist: 0.62, rocky: 0.2, style: 0.3 },
  },
  {
    id: 'keycatrich', name: 'Keycatrich', region: 'leide', levels: [8, 16],
    cx: 200, cz: -1600, rx: 900, rz: 900, rot: 0.0, priority: 1.05,
    character: 'A bombed-out spa town swallowed by dust, and the trench beneath it.',
    biome: { base: 40, relief: 30, ridge: 255, ridgeIn: 340, terrace: 0.66, rough: 0.95, warp: 240, moist: 0.22, rocky: 0.58, style: 0.44 },
  },
  {
    id: 'balouve', name: 'The Callaegh Steps', region: 'leide', levels: [12, 22],
    cx: 2760, cz: 1100, rx: 900, rz: 900, rot: 0.2, priority: 0.95,
    character: 'Spoil heaps and shaft heads above the deepest mine in Lucis.',
    biome: { base: 34, relief: 40, ridge: 275, ridgeIn: 220, terrace: 0.6, rough: 1.05, warp: 260, moist: 0.22, rocky: 0.66, style: 0.55 },
  },

  // ---- DUSCAE ---------------------------------------------------------
  {
    id: 'alstor', name: 'Alstor Slough', region: 'duscae', levels: [15, 24],
    cx: -1180, cz: 620, rx: 1000, rz: 900, rot: -0.1, priority: 1.45,
    character: 'Standing water under a green haze. Boardwalks, reeds, catoblepas wading.',
    biome: { base: 9, relief: 12, ridge: 60, ridgeIn: 800, terrace: 0.18, rough: 0.55, warp: 220, moist: 0.96, rocky: 0.10, style: 0.25 },
  },
  {
    id: 'weaverwilds', name: 'The Malacchi Hills', region: 'duscae', levels: [16, 26],
    cx: -1900, cz: 220, rx: 900, rz: 850, rot: 0.15, priority: 1.0,
    character: 'Open chocobo prairie broken by lone broadleaf stands. Wiz country.',
    biome: { base: 22, relief: 26, ridge: 130, ridgeIn: 560, terrace: 0.3, rough: 0.7, warp: 280, moist: 0.72, rocky: 0.2, style: 0.35 },
  },
  {
    id: 'nebulawood', name: 'The Nebulawood', region: 'duscae', levels: [22, 32],
    cx: -1560, cz: -1180, rx: 950, rz: 900, rot: -0.25, priority: 1.1,
    character: 'Close, dark, wet forest. The canopy closes and the light goes green.',
    biome: { base: 30, relief: 30, ridge: 175, ridgeIn: 480, terrace: 0.25, rough: 0.9, warp: 300, moist: 0.88, rocky: 0.22, style: 0.42 },
  },
  {
    id: 'cauthess', name: 'Mencemoor', region: 'duscae', levels: [28, 40],
    cx: -1020, cz: -2160, rx: 1250, rz: 1150, rot: 0.0, priority: 1.6,
    character: 'A meteor the size of a mountain range, still glowing where it struck.',
    biome: { base: 66, relief: 44, ridge: 330, ridgeIn: 300, terrace: 0.5, rough: 1.15, warp: 260, moist: 0.36, rocky: 0.78, style: 0.6 },
  },
  {
    id: 'taelpar', name: 'Taelpar Crag', region: 'duscae', levels: [24, 34],
    cx: -2320, cz: -700, rx: 1000, rz: 950, rot: 0.35, priority: 1.35,
    character: 'A gorge you cannot see the bottom of, and one bridge across it.',
    biome: { base: 74, relief: 40, ridge: 300, ridgeIn: 340, terrace: 0.68, rough: 1.0, warp: 250, moist: 0.5, rocky: 0.7, style: 0.5 },
  },
  {
    id: 'fallgrove', name: 'The Fallgrove', region: 'duscae', levels: [20, 30],
    cx: -800, cz: 1560, rx: 950, rz: 900, rot: 0.1, priority: 0.95,
    character: 'Grazed downland south of the slough, ringed by dead grovewood.',
    biome: { base: 24, relief: 28, ridge: 150, ridgeIn: 520, terrace: 0.34, rough: 0.8, warp: 280, moist: 0.66, rocky: 0.26, style: 0.4 },
  },

  // ---- CLEIGNE --------------------------------------------------------
  {
    id: 'lestallum_shelf', name: 'The Lestallum Shelf', region: 'cleigne', levels: [30, 42],
    cx: -3060, cz: -680, rx: 950, rz: 900, rot: -0.1, priority: 1.3,
    character: 'A flat basalt terrace 120 m above the plain, with a city bolted to it.',
    biome: { base: 100, relief: 24, ridge: 250, ridgeIn: 480, terrace: 0.85, rough: 0.8, warp: 220, moist: 0.5, rocky: 0.6, style: 0.28 },
  },
  {
    id: 'malmalam', name: 'Malmalam Thicket', region: 'cleigne', levels: [42, 54],
    cx: -3180, cz: 1560, rx: 930, rz: 930, rot: 0.2, priority: 1.05,
    character: 'A thicket so dense the road stops and the map goes blank.',
    biome: { base: 44, relief: 32, ridge: 200, ridgeIn: 400, terrace: 0.24, rough: 1.0, warp: 300, moist: 0.92, rocky: 0.3, style: 0.5 },
  },
  {
    id: 'vesperpool', name: 'The Vesperpool', region: 'cleigne', levels: [38, 50],
    cx: -3020, cz: -2360, rx: 1100, rz: 1000, rot: -0.2, priority: 1.45,
    character: 'A drowned forest. Dead trunks stand in black water; the fishing is famous.',
    biome: { base: 12, relief: 18, ridge: 120, ridgeIn: 780, terrace: 0.2, rough: 0.6, warp: 240, moist: 0.98, rocky: 0.18, style: 0.3 },
  },
  {
    id: 'ravatogh', name: 'The Rock of Ravatogh', region: 'cleigne', levels: [48, 60],
    cx: -3400, cz: -2960, rx: 880, rz: 880, rot: 0.0, priority: 1.55,
    character: 'An active volcano. Ash slopes, lava tubes, and the highest point in Lucis.',
    biome: { base: 120, relief: 60, ridge: 420, ridgeIn: 180, terrace: 0.3, rough: 1.25, warp: 200, moist: 0.14, rocky: 0.94, style: 0.82 },
  },
  {
    id: 'meldacio', name: 'Pallareth Pass', region: 'cleigne', levels: [40, 52],
    cx: -1780, cz: -3060, rx: 1050, rz: 900, rot: 0.25, priority: 1.15,
    character: 'The pass between the Cauthess range and the Vesperpool basin. Hunters run it.',
    biome: { base: 96, relief: 48, ridge: 380, ridgeIn: 260, terrace: 0.55, rough: 1.05, warp: 250, moist: 0.46, rocky: 0.72, style: 0.58 },
  },
  {
    id: 'cape_caem', name: 'Cape Caem', region: 'cleigne', levels: [30, 40],
    cx: -2500, cz: 2200, rx: 900, rz: 900, rot: 0.0, priority: 1.3,
    character: 'A green headland with a lighthouse, a vegetable patch and a hidden harbour.',
    biome: { base: 22, relief: 26, ridge: 150, ridgeIn: 460, terrace: 0.4, rough: 0.75, warp: 260, moist: 0.8, rocky: 0.34, style: 0.36 },
  },
];

/** Fallback biome used outside every zone's reach (the far frontier). */
export const DEFAULT_BIOME = {
  base: 30, relief: 30, ridge: 260, ridgeIn: 0, terrace: 0.5,
  rough: 0.9, warp: 280, moist: 0.3, rocky: 0.6, style: 0.5,
};

// ------------------------------------------------------------------- POIs

/**
 * Point-of-interest types. `drive` means a car must be able to reach it, which
 * the drivability test enforces against the road graph.
 */
/** Every POI type there is. `PoiSpec.type` is one of these. */
export type PoiTypeName =
  | 'town' | 'outpost' | 'reststop' | 'parking' | 'haven' | 'dungeon'
  | 'menace' | 'tomb' | 'imperial' | 'chocobo' | 'fishing' | 'landmark';

/** How one POI type draws, and whether a car has to be able to reach it. */
export interface PoiType {
  label: string;
  /** A car must be able to reach it; `roadcheck.mts` enforces this. */
  drive: boolean;
  /** `MapGlyphs` key. */
  icon: string;
  /** CSS hex. */
  colour: string;
}

export const POI_TYPES: Record<PoiTypeName, PoiType> = {
  town: { label: 'Settlement', drive: true, icon: 'town', colour: '#e8cf98' },
  outpost: { label: 'Outpost', drive: true, icon: 'outpost', colour: '#e8cf98' },
  reststop: { label: 'Rest Stop', drive: true, icon: 'reststop', colour: '#d9c48c' },
  parking: { label: 'Parking Spot', drive: true, icon: 'parking', colour: '#9fc0e4' },
  haven: { label: 'Haven', drive: false, icon: 'haven', colour: '#b6d6f8' },
  dungeon: { label: 'Dungeon', drive: false, icon: 'dungeon', colour: '#a68fd0' },
  menace: { label: 'Menace Lair', drive: false, icon: 'menace', colour: '#8f6fc0' },
  tomb: { label: 'Royal Tomb', drive: false, icon: 'tomb', colour: '#cfe6ff' },
  imperial: { label: 'Imperial Base', drive: false, icon: 'imperial', colour: '#e0644a' },
  chocobo: { label: 'Chocobo Post', drive: true, icon: 'chocobo', colour: '#e8d98a' },
  fishing: { label: 'Fishing Spot', drive: false, icon: 'fishing', colour: '#7fd0d6' },
  landmark: { label: 'Landmark', drive: false, icon: 'landmark', colour: '#c8d8ec' },
};

/**
 * Every named place in Lucis.
 *
 * `x, z`    world metres
 * `r`       discovery radius, metres — walk inside it and the POI is revealed
 * `does`    what the player actually does here
 * `travel`  true if it is a fast-travel destination
 */

/**
 * One named place. `x`/`z` are optional in the *table* -- a POI written with
 * `at: 'n_longwythe'` inherits its position from that road node at load, so a
 * settlement can never drift off the road that serves it -- and are filled in
 * before anything reads them.
 */
export interface PoiSpec {
  id: string;
  name: string;
  type: PoiTypeName;
  /** `Zone.id` this place sits in. */
  zone: string;
  /** Discovery radius, metres. */
  r: number;
  /** Absent when `at` names the road node to inherit the position from. */
  x?: number;
  z?: number;
  /** Road node to inherit `x`/`z` from. */
  at?: string;
  // REMOVED 2026-08-30. `gate` was carried by 124 of these rows -- 82 `null`,
  // 5 `'ch4'`, 7 `'ch7'`, 8 `'menace'`, one `'ch13'`, and a scatter of level
  // and dungeon keys -- and read by NOTHING. Every lock it described was
  // authored and never wired, which made it a loaded gun: the first system to
  // discover the field would have silently locked a third of the map behind
  // chapters this build does not reach. The design intent is recoverable from
  // git (the rows are intact in the parent of the commit that removed them);
  // it is not recoverable from a shipped build that has started enforcing it.
  // If chapter gating is ever wanted, it gets built with a consumer FIRST.
  /** A fast-travel destination. */
  travel?: boolean;
  /** Suggested party level for the encounters around it. */
  lv?: number;
  /** What the player actually does here. Design copy; the map screen shows it. */
  does?: string;
}

/**
 * A POI once the map has resolved it: every one has a position, whether it was
 * authored with `x`/`z` or inherited from its road node. This is what
 * `worldMap.pois` hands out, and it is why nothing downstream has to guard.
 */
export interface Poi extends PoiSpec {
  x: number;
  z: number;
}

export const POIS: PoiSpec[] = [
  // ============================== LEIDE ==============================
  // Authored `x`/`z` rather than `at: 'n_hammerhead'` on purpose. `Hammerhead.ts`
  // builds the town on `Ecology`'s `reststop` site -- `beside('reststop', 44, 1, 34, 26)`,
  // which resolves to (576, 10), 34 m off the Route 1 shoulder. The road node
  // `n_hammerhead` sits at (60, 18), 516 m west, so the pin, the minimap, the
  // compass and every quest waypoint that named Hammerhead pointed half a
  // kilometre from the diner they meant. The town is built geometry with props,
  // roads, NPC anchors and the caravan seated against it; the pin was one record.
  // Moving the pin is the one-line half of that pair. Keep this in step with
  // `Ecology._layoutSites` if the reststop site ever moves.
  { id: 'hammerhead', name: 'Hammerhead', type: 'town', zone: 'longwythe', x: 576, z: 10, r: 210, travel: true, lv: 1,
    does: 'Garage, diner, fuel, weapon shop, hunt board. Cid, Cindy, Takka, Dave.' },
  { id: 'hammerhead_layby', name: 'Hammerhead Parking', type: 'parking', zone: 'longwythe', x: 246, z: 52, r: 46, travel: true, lv: 1,
    does: 'Park the Regalia. The road trip begins and ends on this apron.' },
  // The rune-marked camp rock 37 m from where the Regalia breaks down.
  // `Ecology._layoutSites` has built it since the vegetation pass was written
  // -- correct geometry, FFXV's own glowing sigil -- and it was pure scenery:
  // no POI, so no haven, so no prompt. The first campable-looking thing the
  // player ever walks past taught them that campable-looking things are not.
  //
  // `x`/`z` are the site's RESOLVED position, not the (-62,-46) seed
  // `_findFlat` is asked from: it walks to the nearest flat, which lands at
  // (-31.4, -20.3), and `HAVEN_RADIUS` is 14 m, so the seed coordinates would
  // have put the pin 39 m off its own rock. Keep this in step with
  // `Ecology._layoutSites` if that search ever moves.
  //
  // `lv: 1` is deliberate and it has one side effect worth stating: `HAVENS`
  // is level-sorted and `HAVENS[0].discovered = true`, so this takes the
  // pre-discovered flag off Cotisse Haven (lv 5). That is the right answer --
  // the haven you have already found should be the one at your feet on the
  // first morning, not one 1.2 km up the highway.
  { id: 'spawn_haven', name: 'Redlyn Haven', type: 'haven', zone: 'longwythe', x: -31, z: -20, r: 55, travel: true, lv: 1,
    does: 'The rune rock south of the breakdown. First camp: rest, cook, level up, learn the system.' },
  { id: 'longwythe_rest', name: 'Longwythe Rest Area', type: 'reststop', zone: 'longwythe', at: 'n_longwythe', r: 140, travel: true, lv: 2,
    does: 'Caravan (rest and save), diner, fuel pump, item shop.' },
  { id: 'longwythe_layby', name: 'Fossil Wood Layby', type: 'parking', zone: 'longwythe', x: 1312, z: 76, r: 46, travel: true, lv: 2,
    does: 'Gravel pull-in under the peak. Photo spot at dusk.' },
  { id: 'longwythe_peak', name: 'Longwythe Peak', type: 'landmark', zone: 'longwythe', x: 900, z: -1180, r: 520, lv: 8,
    does: 'The black horn visible from everywhere in Leide. Deadeye dens on its shoulder.' },
  { id: 'longwythe_trailhead', name: 'Longwythe Peak Trailhead', type: 'parking', zone: 'longwythe', at: 'n_longwythe_peak', r: 48, travel: true, lv: 6,
    does: 'Turning circle where the track gives up on the scree.' },
  { id: 'longwythe_haven', name: 'Cotisse Haven', type: 'haven', zone: 'longwythe', x: 962, z: -712, r: 55, travel: true, lv: 5,
    does: 'Camp on the shelf below the peak. The first haven the player ever sees.' },
  { id: 'galdin_junction', name: 'Saulhend Pass', type: 'parking', zone: 'longwythe', at: 'j_galdin', r: 52, lv: 4,
    does: 'Where Route 1 forks south for the coast. Signposts, a bus shelter, a vending machine.' },
  { id: 'saulhend_overlook', name: 'The Saulhend Overlook', type: 'landmark', zone: 'kelbass', x: 2200, z: 400, r: 300, lv: 15,
    does: 'The shoulder above the Galdin fork. Half of eastern Leide, and the sea beyond it.' },

  // ---- The Old South Road (route20) -----------------------------------
  // Due south of the spine was a 59-degree arc of the compass containing
  // nothing: no road, no POI, no encounter, no reason. A player who turned
  // left out of Hammerhead drove until the world ran out. These five rows and
  // the road that strings them are the whole of that quarter's content, so
  // they are pitched as a *journey* rather than as a scatter: a landmark you
  // can see from the junction, a haven at the halfway mark, a set-piece flat,
  // a bed at the end and the turning circle beyond it.
  { id: 'threshold_stones', name: 'The Threshold Stones', type: 'landmark', zone: 'longwythe', x: 120, z: 900, r: 300, lv: 8,
    does: 'Leaning Solheim milestones on the old pilgrim road. Nine of them, and none of them upright.' },
  { id: 'southwatch_haven', name: 'Southwatch Haven', type: 'haven', zone: 'longwythe', x: -260, z: 1400, r: 55, travel: true, lv: 10,
    does: 'Camp on the last rise before the flats. The stones are still visible behind you.' },
  { id: 'saltgrass_flats', name: 'The Saltgrass Flats', type: 'landmark', zone: 'longwythe', x: 300, z: 1900, r: 300, lv: 12,
    does: 'A dry lake pan with a wreck field on it. Something large hunts the graze here.' },
  { id: 'pilgrims_rest', name: "Pilgrim's Rest", type: 'reststop', zone: 'longwythe', at: 'n_pilgrims_rest', r: 140, travel: true, lv: 12,
    does: 'The only bed and the only save south of Hammerhead. Caravan, pump, a very old vending machine.' },
  { id: 'old_kingsroad_end', name: 'Old Kingsroad End', type: 'parking', zone: 'longwythe', at: 'n_kingsroad_end', r: 46, travel: true, lv: 12,
    does: 'Turning circle where the south road gives up. The pilgrim road carries on as ruts.' },

  // ---- The Longwythe ascent (route21) and what is beyond it ------------
  { id: 'peak_overlook', name: 'The Northwatch Overlook', type: 'landmark', zone: 'longwythe', x: 1250, z: -1600, r: 300, lv: 10,
    does: 'A shelf on the peak\'s east apron. Half of Leide below you, and the bone country ahead.' },
  { id: 'crag_haven', name: 'Ravenscrag Haven', type: 'haven', zone: 'longwythe', x: 1500, z: -2100, r: 55, travel: true, lv: 18,
    does: 'The last camp before the graveyard. You walk in; there is no road.' },
  { id: 'adamantoise_graveyard', name: 'The Adamantoise Graveyard', type: 'landmark', zone: 'longwythe', x: 2600, z: -2800, r: 340, lv: 30,
    does: 'Where the great turtles go. Ribcage arches you can walk under, and one shell you could park in.' },
  { id: 'three_valleys', name: 'The Three Valleys', type: 'landmark', zone: 'three_valleys', x: 1320, z: 1000, r: 460, lv: 6,
    does: 'Three parallel dry washes between hogbacks. The first real ambush ground.' },
  // The south-east had the Three Valleys and Galdin and nothing between them.
  { id: 'washes_lookout', name: 'The Washes Lookout', type: 'landmark', zone: 'three_valleys', x: 700, z: 650, r: 260, lv: 6,
    does: 'A low bluff over the head of the first wash. You can see the whole ambush from here.' },
  { id: 'three_valleys_haven', name: 'Merrioth Haven', type: 'haven', zone: 'three_valleys', x: 1050, z: 1140, r: 55, travel: true, lv: 9,
    does: 'Camp on a rock shelf between the second and third valley.' },
  { id: 'daurell_parking', name: 'Schier Heights Parking', type: 'parking', zone: 'three_valleys', at: 'n_daurell', r: 48, travel: true, lv: 35,
    does: 'Gravel turning circle at the head of the third valley.' },
  { id: 'daurell_caverns', name: 'Daurell Caverns', type: 'dungeon', zone: 'three_valleys', x: 1420, z: 1960, r: 160, lv: 40,
    does: 'Flooded limestone system under the valley floor.' },
  { id: 'tomb_just', name: 'Tomb of the Just', type: 'tomb', zone: 'taelpar', x: -2020, z: -230, r: 62, lv: 34,
    does: 'Royal Arm: the Shield of the Just.' },
  { id: 'daurell_menace', name: 'Menace Beneath Daurell', type: 'menace', zone: 'three_valleys', x: 1472, z: 1916, r: 70, lv: 72,
    does: 'Post-game endless descent.' },
  { id: 'kelbass_haven', name: 'Vennaugh Haven', type: 'haven', zone: 'kelbass', x: 1980, z: 1500, r: 55, travel: true, lv: 11,
    does: 'Camp on the grass shelf overlooking the Galdin road.' },
  { id: 'galdin_quay', name: 'Galdin Quay', type: 'town', zone: 'galdin', at: 'n_galdin_quay', r: 240, travel: true, lv: 8,
    does: 'Mother of Pearl restaurant, the ferry berth, a tackle shop and the pier.' },
  { id: 'galdin_carpark', name: 'Galdin Quay Parking', type: 'parking', zone: 'galdin', x: 2262, z: 2296, r: 52, travel: true, lv: 8,
    does: 'The last tarmac before the boardwalk.' },
  { id: 'galdin_pier', name: 'Galdin Shoals', type: 'fishing', zone: 'galdin', x: 2420, z: 2520, r: 62, lv: 8,
    does: 'Deep-water fishing: sea bass, allural sea bass, murk grouper.' },
  { id: 'angelgard', name: 'Angelgard', type: 'landmark', zone: 'galdin', x: 3010, z: 3120, r: 340, lv: 8,
    does: 'The prison island offshore. Visible from the pier at dusk; not landable.' },
  { id: 'insomnia_wall', name: 'The Wall — Insomnia', type: 'landmark', zone: 'crown_verge', at: 'n_insomnia', r: 560, lv: 15,
    does: 'The dead Crown City behind a collapsed magitek barrier.' },
  { id: 'insomnia_checkpoint', name: 'Crown City Checkpoint', type: 'parking', zone: 'crown_verge', x: 3478, z: 498, r: 52, travel: true, lv: 15,
    does: 'The last layby on Route 1. Burnt-out roadblock, the Wall filling the windscreen.' },
  { id: 'formouth', name: 'Formouth Garrison', type: 'imperial', zone: 'crown_verge', at: 'n_formouth', r: 200, lv: 18,
    does: 'Magitek garrison covering the Crown City approach. Clear it to open the Verge.' },
  { id: 'formouth_gate', name: 'Formouth Garrison Gate', type: 'parking', zone: 'crown_verge', x: 3226, z: -110, r: 46, lv: 18,
    does: 'Hard standing outside the wire.' },
  { id: 'crestholm', name: 'Crestholm Channels', type: 'dungeon', zone: 'crown_verge', x: 3104, z: 1284, r: 160, lv: 60,
    does: "Insomnia's storm drains. Sluice-gate puzzle; Aramusha at the bottom." },
  { id: 'crestholm_inlet', name: 'Ostium Gorge', type: 'parking', zone: 'crown_verge', at: 'n_crestholm', r: 48, travel: true, lv: 55,
    does: 'Service bay at the drain mouth.' },
  { id: 'crestholm_menace', name: 'Menace Beneath Crestholm', type: 'menace', zone: 'crown_verge', x: 3148, z: 1336, r: 70, lv: 92,
    does: 'Post-game endless descent.' },
  { id: 'balouve_mines', name: 'Balouve Mines', type: 'dungeon', zone: 'balouve', x: 2784, z: 1146, r: 160, lv: 50,
    does: 'Nine levels of abandoned shaft. Aramusha guards the tomb.' },
  { id: 'balouve_head', name: 'The Callaegh Steps', type: 'parking', zone: 'balouve', at: 'n_balouve', r: 48, travel: true, lv: 45,
    does: 'The ore road ends on a concrete apron between two winding towers.' },
  { id: 'tomb_conqueror', name: 'Tomb of the Clever', type: 'tomb', zone: 'balouve', x: 2832, z: 1194, r: 60, lv: 50,
    does: 'Royal Arm: the Bow of the Clever.' },
  { id: 'balouve_menace', name: 'Menace Beneath Balouve', type: 'menace', zone: 'balouve', x: 2740, z: 1218, r: 70, lv: 78,
    does: 'Post-game endless descent.' },
  { id: 'balouve_haven', name: 'Emmelle Haven', type: 'haven', zone: 'balouve', x: 2596, z: 924, r: 55, travel: true, lv: 20,
    does: 'Camp on the spoil bench above the mine head.' },
  { id: 'keycatrich_ruins', name: 'Keycatrich Ruins', type: 'landmark', zone: 'keycatrich', x: 180, z: -1330, r: 280, lv: 9,
    does: 'A spa town shelled flat on the night of the fall.' },
  { id: 'keycatrich_parking', name: 'Keycatrich Ruins Parking', type: 'parking', zone: 'keycatrich', at: 'n_keycatrich', r: 48, travel: true, lv: 9,
    does: 'End of the dirt track: turning circle, two bays, a dead streetlight.' },
  { id: 'keycatrich_trench', name: 'Keycatrich Trench', type: 'dungeon', zone: 'keycatrich', x: 110, z: -1460, r: 150, lv: 12,
    does: 'The first dungeon. Collapsed bunkers, magitek axemen, the Tomb of the Wise.' },
  { id: 'tomb_wise', name: 'Tomb of the Wise', type: 'tomb', zone: 'keycatrich', x: 66, z: -1514, r: 60, lv: 12,
    does: 'Royal Arm: the Sword of the Wise.' },
  { id: 'keycatrich_menace', name: 'Menace Beneath Keycatrich', type: 'menace', zone: 'keycatrich', x: 152, z: -1516, r: 70, lv: 55,
    does: 'Post-game endless descent.' },
  { id: 'keycatrich_haven', name: 'Entethina Haven', type: 'haven', zone: 'keycatrich', x: 430, z: -1270, r: 55, travel: true, lv: 10,
    does: 'Camp on the rim above the ruined town.' },

  // ---- The Mencemoor: the north sector past the ruined town --------------
  // Route 9 used to stop at Keycatrich and everything north of it was empty
  // ground you had no reason to walk into. The obelisks are the reason, the
  // parking is the turning circle Route 9's new terminal needs, and the
  // garrison is what the empire put on the only road onto the moor.
  { id: 'mencemoor_parking', name: 'Mencemoor Head', type: 'parking', zone: 'keycatrich', at: 'n_northwatch', r: 46, travel: true, lv: 20,
    does: 'Turning circle at the top of the Keycatrich track, on the moor edge.' },
  { id: 'mencemoor_obelisks', name: 'The Mencemoor Obelisks', type: 'landmark', zone: 'keycatrich', x: 300, z: -2400, r: 300, lv: 20,
    does: 'Twelve black stones in a ring on open moor. Nobody agrees who cut them.' },
  { id: 'moor_haven', name: 'Mencemoor Haven', type: 'haven', zone: 'keycatrich', x: 520, z: -2700, r: 55, travel: true, lv: 22,
    does: 'Camp in the lee of a peat bank. The obelisks are on the skyline.' },
  { id: 'northwatch_ruin', name: 'Northwatch Garrison', type: 'imperial', zone: 'keycatrich', x: 150, z: -3100, r: 170, lv: 26,
    does: 'A blockhouse and two towers covering the north end of the moor.' },

  // ============================== DUSCAE =============================
  { id: 'prairie_outpost', name: 'Prairie Outpost', type: 'outpost', zone: 'fallgrove', at: 'n_prairie', r: 160, travel: true, lv: 10,
    does: 'General store, hunt board, a chocobo hitching rail and a very slow barman.' },
  { id: 'coernix_alstor', name: 'Coernix Station - Alstor', type: 'outpost', zone: 'alstor', at: 'j_alstor', r: 155, travel: true, lv: 14,
    does: 'Fuel, item shop, outfitter. The last dry ground before the slough.' },
  { id: 'alstor_slough', name: 'Alstor Slough', type: 'landmark', zone: 'alstor', x: -1320, z: 820, r: 640, lv: 16,
    does: 'The wetland itself: boardwalks, reed beds, wading catoblepas.' },
  { id: 'alstor_dock', name: 'Neeglyss Pond', type: 'fishing', zone: 'alstor', x: -900, z: 780, r: 62, lv: 16,
    does: 'Freshwater fishing: slough trout, Alstor bass, dapper chocobo-tail carp.' },
  { id: 'alstor_haven', name: 'Pullmoor Haven', type: 'haven', zone: 'alstor', x: -820, z: 300, r: 55, travel: true, lv: 18,
    does: 'Camp on the dry rise above the water line.' },
  { id: 'norduscaen', name: 'Norduscaen Blockade', type: 'imperial', zone: 'alstor', at: 'n_norduscaen', r: 180, lv: 22,
    does: 'Imperial checkpoint straddling Route 1. Break it or Cleigne stays shut.' },
  { id: 'weaverwilds', name: 'The Malacchi Hills', type: 'landmark', zone: 'weaverwilds', x: -1880, z: 200, r: 440, lv: 17,
    does: 'Open prairie. Wild chocobos graze here at dawn.' },
  { id: 'wiz_chocobo', name: 'Wiz Chocobo Post', type: 'chocobo', zone: 'weaverwilds', at: 'n_wiz', r: 200, travel: true, lv: 18,
    does: 'Rent chocobos, race them, take the Deadeye hunt, buy toppings.' },
  { id: 'wiz_paddocks', name: 'Wiz Paddocks', type: 'chocobo', zone: 'weaverwilds', x: -1960, z: 572, r: 95, lv: 18,
    does: 'The training rings and the race circuit.' },
  { id: 'weaverwilds_haven', name: 'Killiam Haven', type: 'haven', zone: 'weaverwilds', x: -2210, z: 700, r: 55, travel: true, lv: 20,
    does: 'Camp beside the racing circuit. Wiz keeps the runes swept.' },
  { id: 'aracheole', name: 'Aracheole Stronghold', type: 'imperial', zone: 'weaverwilds', at: 'n_aracheole', r: 200, lv: 26,
    does: 'Walled magitek fortress: two gates, a courtyard, a generator to blow.' },
  { id: 'fallgrove_haven', name: 'Oathe Haven', type: 'haven', zone: 'fallgrove', x: -980, z: 1150, r: 55, travel: true, lv: 24,
    does: 'Camp on the downs above the Costlemark approach.' },
  { id: 'costlemark_parking', name: 'The Fallgrove Parking', type: 'parking', zone: 'fallgrove', at: 'n_costlemark', r: 48, travel: true, lv: 50,
    does: 'The pull-in the tower is reached from, on foot, after dark.' },
  { id: 'costlemark', name: 'Costlemark Tower', type: 'dungeon', zone: 'fallgrove', x: -880, z: 1880, r: 170, lv: 55,
    does: 'A Solheim ruin that only opens at night. Cube maze, Jabberwock at the base.' },
  { id: 'tomb_tall', name: 'Tomb of the Tall', type: 'tomb', zone: 'fallgrove', x: -924, z: 1934, r: 60, lv: 55,
    does: 'Royal Arm: the Greatsword of the Tall.' },
  { id: 'costlemark_menace', name: 'Menace Beneath Costlemark', type: 'menace', zone: 'fallgrove', x: -838, z: 1936, r: 70, lv: 99,
    does: 'Post-game endless descent. The hardest of the eight.' },
  { id: 'perpetouss', name: 'Perpetouss Keep', type: 'imperial', zone: 'fallgrove', at: 'n_perpetouss', r: 190, lv: 30,
    does: 'Dropship depot. Every air patrol in Duscae scrambles from here.' },
  { id: 'perpetouss_gate', name: 'Roadside Scrapyard', type: 'parking', zone: 'fallgrove', x: -1672, z: 1352, r: 46, lv: 30,
    does: 'Hard standing outside the wire.' },
  { id: 'coernix_cauthess', name: 'Coernix Station - Cauthess', type: 'outpost', zone: 'nebulawood', at: 'n_coernix_cauthess', r: 155, travel: true, lv: 24,
    does: 'Fuel, shop, and the last coffee before the Disc.' },
  { id: 'cauthess_rest', name: 'Cauthess Rest Area', type: 'reststop', zone: 'nebulawood', x: -1390, z: -1044, r: 115, lv: 24,
    does: 'Caravan, vending machines, and a view of the meteor that ruins your appetite.' },
  { id: 'nebulawood', name: 'The Nebulawood', type: 'landmark', zone: 'nebulawood', x: -1620, z: -1240, r: 500, lv: 26,
    does: 'Closed-canopy forest. Daemons after dark; the sun never reaches the floor.' },
  { id: 'nebula_parking', name: 'The Nebulawood Parking', type: 'parking', zone: 'nebulawood', at: 'n_nebulawood', r: 48, travel: true, lv: 26,
    does: 'Where the logging track dies against the tree line.' },
  { id: 'nebulawood_haven', name: 'Turncouth Haven', type: 'haven', zone: 'nebulawood', x: -1562, z: -1118, r: 55, travel: true, lv: 26,
    does: 'Camp on a mossy boulder in a clearing.' },
  { id: 'fociaugh', name: 'Fociaugh Hollow', type: 'dungeon', zone: 'nebulawood', x: -1720, z: -1420, r: 160, lv: 28,
    does: 'A sinkhole cave. Mindflayer at the bottom, and the Tomb of the Rogue.' },
  { id: 'tomb_rogue', name: 'Tomb of the Rogue', type: 'tomb', zone: 'meldacio', x: -2514, z: -3292, r: 60, lv: 44,
    does: 'Royal Arm: the Star of the Rogue.' },
  { id: 'fociaugh_menace', name: 'Menace Beneath Fociaugh', type: 'menace', zone: 'nebulawood', x: -1678, z: -1476, r: 70, lv: 65,
    does: 'Post-game endless descent.' },
  { id: 'disc_overlook', name: 'Cauthess, the Disc', type: 'parking', zone: 'cauthess', at: 'n_disc', r: 56, travel: true, lv: 30,
    does: 'Guard rail, coin telescope, and the best photograph in Duscae.' },
  { id: 'cauthess_haven', name: 'Lingagh Haven', type: 'haven', zone: 'cauthess', x: -1080, z: -1330, r: 55, travel: true, lv: 30,
    does: 'Camp on the outer rim. Meteor light on the tents all night.' },
  { id: 'disc_cauthess', name: 'The Disc of Cauthess', type: 'landmark', zone: 'cauthess', x: -1020, z: -2160, r: 900, lv: 32,
    does: 'The meteor crater. Titan is under it; the crust is walkable, barely.' },
  { id: 'taelpar_rest', name: 'Taelpar Rest Area', type: 'reststop', zone: 'taelpar', at: 'n_taelpar', r: 150, travel: true, lv: 28,
    does: 'Caravan, diner, fuel. The last services before the bridge.' },
  { id: 'taelpar_bridge', name: 'Taelpar Bridge', type: 'landmark', zone: 'taelpar', at: 'n_taelpar_bridge', r: 150, lv: 28,
    does: 'The single span that carries Route 1 into Cleigne.' },
  { id: 'taelpar_crag', name: 'Taelpar Crag', type: 'landmark', zone: 'taelpar', x: -2330, z: -1000, r: 560, lv: 30,
    does: 'A 230 m gorge. Lean over the rail and you cannot see the bottom.' },
  { id: 'taelpar_haven', name: 'Sothmocke Haven', type: 'haven', zone: 'taelpar', x: -2210, z: -300, r: 55, travel: true, lv: 28,
    does: 'Camp on the crag lip. The updraught keeps the fire loud all night.' },
  { id: 'callateins', name: "Callatein's Plunge", type: 'landmark', zone: 'taelpar', x: -2360, z: -40, r: 240, lv: 26,
    does: 'A waterfall off the Lestallum shelf into the crag. Good photograph, bad footing.' },
  { id: 'greyshire', name: 'Greyshire Glacial Grotto', type: 'dungeon', zone: 'taelpar', x: -2560, z: -1260, r: 160, lv: 30,
    does: 'Ice cave in the crag wall. The Tomb of the Fierce is at the end of it.' },
  // 100 m north of where this was authored, and every metre of it is measured.
  // The pad's toe hung **22.0 m** in the air at (-2604, -1314) —
  // `probes/padhang.mts`, third worst of the 91 aprons — because the footprint
  // straddled the lip of the Taelpar crag, and `gradePad`'s `FILL_MAX` will not
  // cantilever a fill out over one, correctly.
  //
  // The first move went to -1274 on the toe numbers alone: hang +0.24, toe mean
  // -0.23, footprint relief 72 -> 24 m. **The frame said no.** Read from the
  // north-east it was a fifteen-metre curtain of pale striated fill plastered
  // flat across a dark rock cliff, with a hard vertical corner silhouetted
  // against the valley — which is `landmarks-r3`'s 46 m of smooth fill down a
  // red cliff arriving a second time, in a different costume. Nothing hung in
  // the air and nothing read as ground.
  //
  // So `tmp/probes/poiseat.mts` gained the number that says it: `deep`, how far
  // the earthwork falls below its own deck, which is the only place the
  // `cliff`-branch retaining wall shows up at all.
  //
  // And then -1214, which `deep` liked best at 2.6 m, was looked at and had the
  // OPPOSITE fault: the mausoleum sat in a notch with grass across its roofline.
  // An apron is a mesh laid over the terrain, not an excavation — `_base`'s own
  // docstring records `poi_costlemark_menace` growing a green mound in the
  // middle of its own sealed court — so a hummock inside the footprint comes
  // straight up through the building. That is a third number, `proud`: the
  // highest drawn ground within the BUILDING's ten metres, above the deck.
  // (Not within the pad's: on any hillside the pad's uphill rim is above its own
  // deck by construction, and that is a cut face rather than a defect.)
  //
  // Three seats, all measured on the same lattice in the same run:
  //
  //     z = -1274   hang +0.27   deep  7.1   proud 1.7   relief 24
  //     z = -1254   hang -0.15   deep  6.2   proud 0.9   relief 31
  //     z = -1214   hang +0.20   deep  2.6   proud 5.4   relief 35
  //
  // -1254 is the only one that is good at all three. `greyshire`, the grotto
  // this tomb is the far end of, is 44 m away and unmoved.
  { id: 'tomb_fierce', name: 'Tomb of the Wanderer', type: 'tomb', zone: 'taelpar', x: -2604, z: -1254, r: 60, lv: 30,
    does: 'Royal Arm: the Swords of the Wanderer.' },
  { id: 'greyshire_menace', name: 'Menace Beneath Greyshire', type: 'menace', zone: 'taelpar', x: -2518, z: -1312, r: 70, lv: 65,
    does: 'Post-game endless descent.' },

  // ============================== CLEIGNE ============================
  { id: 'lestallum', name: 'Lestallum', type: 'town', zone: 'lestallum_shelf', at: 'n_lestallum', r: 300, travel: true, lv: 32,
    does: 'The one city still lit at night. Market, hotel, Surgates, EXINERIS, Iris.' },
  { id: 'lestallum_lookout', name: 'Lestallum Parking', type: 'parking', zone: 'lestallum_shelf', x: -2880, z: -760, r: 52, travel: true, lv: 32,
    does: 'The Regalia parks here — no cars inside the city walls.' },
  { id: 'exineris', name: 'EXINERIS Power Plant', type: 'landmark', zone: 'lestallum_shelf', x: -3120, z: -540, r: 240, lv: 32,
    does: "The meteor-fed plant that lights the continent. Iris's tour; later, a dungeon." },
  { id: 'old_lestallum', name: 'Old Lestallum', type: 'outpost', zone: 'lestallum_shelf', at: 'n_old_lestallum', r: 175, travel: true, lv: 36,
    does: 'A shabby company town. Shop, hunt board, a motel with no vacancies.' },
  { id: 'cotisse_haven', name: 'Alkyrie Haven', type: 'haven', zone: 'lestallum_shelf', at: 'j_cotisse', r: 58, travel: true, lv: 38,
    does: 'Camp on the high road between the shelf and the pool.' },
  { id: 'vesperpool', name: 'The Vesperpool', type: 'landmark', zone: 'vesperpool', x: -3020, z: -2360, r: 700, lv: 40,
    does: 'A drowned forest under a permanently grey sky. Naga territory.' },
  { id: 'vesperpool_parking', name: 'The Vesperpool Parking', type: 'parking', zone: 'vesperpool', at: 'n_vesper_dock', r: 52, travel: true, lv: 40,
    does: 'A raised bank out into the water, with a stage at the end of it.' },
  { id: 'vesperpool_dock', name: 'The Vesperpool — East Bank', type: 'fishing', zone: 'vesperpool', x: -2752, z: -2342, r: 62, lv: 40,
    does: 'The best fishing in Lucis: vesper gar, pink jade gar, the Devil of the Cygillan.' },
  { id: 'vesperpool_haven', name: 'Capitis Haven', type: 'haven', zone: 'vesperpool', x: -2536, z: -2122, r: 55, travel: true, lv: 40,
    does: 'Camp on the causeway head where the ground is still dry.' },
  { id: 'steyliff', name: 'Steyliff Grove', type: 'dungeon', zone: 'vesperpool', x: -3380, z: -2760, r: 170, lv: 45,
    does: 'A Solheim ruin that rises out of the pool at low water. Quetzalcoatl on the roof.' },
  { id: 'steyliff_menace', name: 'Menace Beneath Steyliff', type: 'menace', zone: 'vesperpool', x: -3336, z: -2814, r: 70, lv: 86,
    does: 'Post-game endless descent.' },
  // Authored `x`/`z` rather than `at: 'n_fort_vaullerey'`, and 20 m south of
  // that node. Sitting exactly on the road node put the fort's 52 m deck across
  // the lip of the pass it covers, and the apron's toe hung **24.8 m** in the
  // air — the worst of the 91 shipped aprons (`probes/padhang.mts`). A fort is
  // 80 m of earthwork and a road node is a point; the two cannot be the same
  // place on a brink. `tmp/probes/poiseat.mts` rebuilt the kit on a 20 m
  // lattice: this seat reads a toe of **-0.22 m** with a mean of -4.20, it is
  // the nearest one that lands, and it moves the gate 20 m further from the
  // `vaullerey_switchback` hairpin (51 m -> 67 m) rather than nearer. The road
  // still ends where it ended; it now stops short of the wall instead of in it.
  { id: 'fort_vaullerey', name: 'Fort Vaullerey', type: 'imperial', zone: 'meldacio', x: -2560, z: -2720, r: 200, lv: 46,
    does: 'Cliff-top magitek fort covering the pass. Anti-air guns and a landing pad.' },
  { id: 'vaullerey_switchback', name: 'Fort Vaullerey Parking', type: 'parking', zone: 'meldacio', x: -2596, z: -2664, r: 46, lv: 46,
    does: 'A hairpin wide enough to turn a car on, and no wider.' },
  { id: 'meldacio_hq', name: 'Meldacio Hunter HQ', type: 'outpost', zone: 'meldacio', at: 'n_meldacio', r: 200, travel: true, lv: 42,
    does: "Ezma's hunter headquarters: all-region hunt board, shop, the key to the Menace." },
  { id: 'meldacio_haven', name: 'Pectriche Haven', type: 'haven', zone: 'meldacio', x: -1880, z: -2830, r: 55, travel: true, lv: 42,
    does: 'Camp behind the HQ, under the pass wall.' },
  { id: 'meldacio_layby', name: 'Alpine Stable', type: 'parking', zone: 'meldacio', at: 'j_meldacio_e', r: 48, travel: true, lv: 42,
    does: 'The east end of the pass road. A cattle grid and a broken barrier.' },
  { id: 'myrlwood_parking', name: 'Risorath Basin Parking', type: 'parking', zone: 'meldacio', at: 'n_myrlwood', r: 48, travel: true, lv: 42,
    does: 'Turning circle in the fungal wood. Spores in the headlights.' },
  { id: 'myrlwood', name: 'Myrlwood', type: 'dungeon', zone: 'meldacio', x: -2470, z: -3240, r: 150, lv: 42,
    does: 'A cave floored with luminous fungus. Bennu, and a lot of mandrakes.' },
  { id: 'verinas_mart', name: 'Verinas Mart - Ravatogh', type: 'outpost', zone: 'ravatogh', at: 'n_verinas', r: 160, travel: true, lv: 48,
    does: 'A shack, a fuel pump and the only cold drink for ten kilometres.' },
  { id: 'ravatogh_trailhead', name: 'Ravatoghan Trail', type: 'parking', zone: 'ravatogh', at: 'n_ravatogh', r: 52, travel: true, lv: 48,
    does: 'End of the ash road. The climb starts here.' },
  { id: 'ravatogh_haven', name: 'Monoth Haven', type: 'haven', zone: 'ravatogh', x: -3320, z: -2930, r: 55, travel: true, lv: 50,
    does: 'Camp in the ash field. Nothing grows; the fire is the only colour for a kilometre.' },
  { id: 'rock_ravatogh', name: 'The Rock of Ravatogh', type: 'landmark', zone: 'ravatogh', x: -3420, z: -3160, r: 640, lv: 52,
    does: 'The volcano. A climbing dungeon up the outside to the crater rim.' },
  { id: 'tomb_clever', name: 'Tomb of the Fierce', type: 'tomb', zone: 'ravatogh', x: -3470, z: -3216, r: 60, lv: 52,
    does: 'Royal Arm: the Mace of the Fierce.' },
  { id: 'pitioss', name: 'Pitioss Ruins', type: 'dungeon', zone: 'ravatogh', x: -3560, z: -3340, r: 190, lv: 99,
    does: 'An inverted Solheim ruin inside the volcano. No combat; pure platforming.' },
  { id: 'cape_caem', name: 'Cape Caem', type: 'outpost', zone: 'cape_caem', at: 'n_cape_caem', r: 200, travel: true, lv: 34,
    does: 'Safe house, vegetable garden, the hidden harbour and the royal boat.' },
  { id: 'caem_harbour_park', name: 'Leirity Seaside', type: 'parking', zone: 'cape_caem', x: -2372, z: 1594, r: 48, lv: 34,
    does: 'A turning circle above the harbour steps.' },
  { id: 'caem_lighthouse', name: 'Caem Lighthouse', type: 'landmark', zone: 'cape_caem', x: -2500, z: 1840, r: 150, lv: 34,
    does: 'The headland light. Prompto photographs it at every sunset without fail.' },
  { id: 'caem_haven', name: 'Spelcray Haven', type: 'haven', zone: 'cape_caem', x: -2280, z: 1500, r: 55, travel: true, lv: 34,
    does: 'Camp on the clifftop above the harbour steps.' },
  { id: 'caem_shore', name: 'Caem Shore', type: 'fishing', zone: 'cape_caem', x: -2564, z: 1966, r: 62, lv: 34,
    does: 'Rock fishing off the headland: barramundi, sea bream.' },
  { id: 'malmalam_parking', name: 'Malmalam Thicket Parking', type: 'parking', zone: 'malmalam', at: 'n_malmalam', r: 50, travel: true, lv: 50,
    does: 'A gravel turning circle against a wall of trees, and no way further.' },
  { id: 'malmalam_thicket', name: 'Malmalam Thicket', type: 'dungeon', zone: 'malmalam', x: -3300, z: 1550, r: 180, lv: 50,
    does: 'A hedge maze of a forest. Bandersnatch at the heart of it.' },
  { id: 'tomb_mystic', name: 'Tomb of the Pious', type: 'tomb', zone: 'malmalam', x: -3344, z: 1604, r: 60, lv: 50,
    does: 'Royal Arm: the Scepter of the Pious.' },
  { id: 'malmalam_haven', name: 'Kellebram Haven', type: 'haven', zone: 'malmalam', x: -3020, z: 1330, r: 55, travel: true, lv: 48,
    does: 'Camp at the thicket edge. The noises start after midnight.' },

  // ===================== named minor sites =====================
  { id: 'tomb_conqueror2', name: 'Tomb of the Conqueror', type: 'tomb', zone: 'keycatrich', x: 152, z: -1568, r: 60, lv: 14,
    does: 'Royal Arm: the Axe of the Conqueror. Arachne guards the vault.' },
  // 45 m south-west of where this was authored, and the 45 m is measured. The
  // toe hung **19.5 m** at (-1064, -2214) — `probes/padhang.mts` — on the
  // steepest ground any POI in the world stands on: 131 m of relief across the
  // footprint, and no seat within 100 m gets that under 105. So this is not a
  // flat spot, it is the nearest place on the Disc's flank where the earthwork
  // actually LANDS: `tmp/probes/poiseat.mts` reads the toe at -1.35 m with a
  // mean of -4.79, a pad cut into the slope rather than one hanging off it.
  { id: 'tomb_mystic2', name: 'Tomb of the Mystic', type: 'tomb', zone: 'cauthess', x: -1104, z: -2234, r: 62, lv: 32,
    does: 'Royal Arm: the Blade of the Mystic, inside the Disc itself.' },
  { id: 'burbost', name: 'Burbost Souvenir Emporium', type: 'outpost', zone: 'taelpar', x: -2430, z: -560, r: 120, travel: true, lv: 30,
    does: 'Fuel, a caravan and a rack of postcards. Staging point for the Grotto.' },
  { id: 'saxham', name: 'Saxham Outpost', type: 'landmark', zone: 'weaverwilds', x: -1620, z: 640, r: 200, lv: 22,
    does: 'A ghost town. Nobody will say what happened here; the hunt board still works.' },
  { id: 'fossil_wood', name: 'Fossil Wood', type: 'landmark', zone: 'longwythe', x: 1420, z: -420, r: 240, lv: 5,
    does: 'A stand of petrified trunks beside the highway. Adamantoise sign in the dust.' },
  { id: 'the_weaverwilds', name: 'The Weaverwilds', type: 'landmark', zone: 'keycatrich', x: -20, z: -700, r: 300, lv: 7,
    does: 'The scrub flats north of Hammerhead where the wild chocobos used to run.' },
  { id: 'thommels_glade', name: 'Thommels Glade', type: 'landmark', zone: 'taelpar', x: -2060, z: -180, r: 200, lv: 34,
    does: 'A green cleft on the crag lip, and the trail up to the Tomb of the Just.' },
  { id: 'loch_thriocess', name: 'Loch Thriocess', type: 'landmark', zone: 'taelpar', x: -2560, z: -60, r: 220, lv: 30,
    does: "The tarn that feeds Callatein's Plunge." },
  { id: 'crestholm_reservoir', name: 'Crestholm Reservoir', type: 'fishing', zone: 'crown_verge', x: 3136, z: 1170, r: 62, lv: 55,
    does: 'The sole fishing hole in the whole Leiden mainland.' },
  { id: 'swainsmere', name: 'Swainsmere', type: 'fishing', zone: 'nebulawood', x: -1290, z: -700, r: 62, lv: 24,
    does: 'A quiet mere off the Cauthess spur. Duscaen trout.' },
  { id: 'malacchi_pond', name: 'Malacchi Pond', type: 'fishing', zone: 'weaverwilds', x: -1810, z: 720, r: 62, lv: 20,
    does: 'A pond in the hills behind the chocobo post.' },
  { id: 'archaeans_mirror', name: "The Archaean's Mirror", type: 'fishing', zone: 'nebulawood', x: -1520, z: -1000, r: 62, lv: 26,
    does: 'A still pool that reflects the meteor. Fisherman’s Friend stall on the bank.' },
  { id: 'maidenwater', name: 'The Maidenwater', type: 'fishing', zone: 'malmalam', x: -3040, z: 1460, r: 62, lv: 46,
    does: 'Black water at the thicket edge.' },
  { id: 'rachsia_bridge', name: 'Rachsia Bridge', type: 'fishing', zone: 'lestallum_shelf', x: -3232, z: -1330, r: 62, lv: 36,
    does: 'The span over the River Wennath, and the best pike in Cleigne.' },
  { id: 'river_wennath', name: 'The River Wennath', type: 'landmark', zone: 'lestallum_shelf', x: -3300, z: -1500, r: 300, lv: 36,
    does: 'The river that cuts the Cleigne shelf in two.' },
  { id: 'ostium_gorge', name: 'Ostium Gorge', type: 'landmark', zone: 'crown_verge', x: 3300, z: 430, r: 300, lv: 14,
    does: 'A car graveyard in a defile. Everyone who tried to leave the city is still here.' },
  { id: 'tollhends', name: 'Tollhends Stronghold', type: 'imperial', zone: 'lestallum_shelf', x: -3140, z: -1600, r: 170, lv: 40,
    does: 'A small imperial post covering the Wennath crossing.' },
];

// ------------------------------------------------------------------ landforms

/**
 * The landforms the heightfield **must** produce for the design to work. This
 * is the bridge from cartography to geology: `terrain/Field.ts` stamps this
 * list, so moving a mesa here moves the mesa in the world.
 *
 * kind: mesa | butte | fin | spire | peak | crater | canyon | basin | terrace | volcano
 * Basins and canyons are automatically held back from the road network, so a
 * lake never swallows a highway and a gorge always leaves a bridge abutment.
 */
/**
 * One landform, discriminated on `kind` -- because the fields each kind uses
 * genuinely differ, and reading `f.x0` off a mesa is the kind of mistake this
 * table's consumer (`terrain/Field.ts`) can actually make: it branches on
 * `kind` and then reaches for whichever geometry that branch needs.
 *
 * Everything past the shared three plus the per-kind geometry is tuning, and
 * stays open -- `benches`, `cliff`, `apron`, `dip`, `rot`, `core`, and the
 * `why`-adjacent design notes.
 */
interface LandformBase {
  id: string;
  /** Why this landform exists, in design terms. Read by nothing; the point is the reader. */
  why: string;
}

/** A landform placed as a disc: centre, radius, height. */
export interface DiscLandform extends LandformBase {
  kind: 'mesa' | 'butte' | 'basin' | 'peak' | 'volcano';
  x: number;
  z: number;
  r: number;
  /** Height above the surrounding ground; negative sinks a basin. */
  h: number;
  /* ---- mesa / butte tuning, all read by `Field._mesa` ---------------- */
  /** How many steps the wall benches down in. 1 when absent. */
  benches?: number;
  /** Fraction of the radius the near-vertical cliff occupies. */
  cliff?: number;
  /** How far the scree apron lays the foot back, as a fraction of `r`. */
  apron?: number;
  /** Structural dip of the cap, 0..1. */
  tilt?: number;
  /** Which way the cap dips, radians. */
  dipDir?: number;
  /** Volcano only: crater radius as a fraction of `r`. */
  crater?: number;
}

/** A ring and a hole rather than a height: the Disc of Cauthess. */
export interface CraterLandform extends LandformBase {
  kind: 'crater';
  x: number;
  z: number;
  r: number;
  /** Rim height. */
  rim: number;
  /** Floor depth below the surrounding ground. */
  depth: number;
  /** Radius of the meteor mass sitting in the middle, metres. */
  core?: number;
}

/** A hogback: a line with a half-width. */
export interface FinLandform extends LandformBase {
  kind: 'fin';
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  halfW: number;
  h: number;
  /** Length of the dip slope as a multiple of `halfW`. 3.2 when absent. */
  dip?: number;
  /** Put the scarp on the other flank. */
  flip?: boolean;
}

/** A gorge: a polyline with a half-width and a depth. */
export interface CanyonLandform extends LandformBase {
  kind: 'canyon';
  pts: number[][];
  halfW: number;
  depth: number;
}

/** An elliptical bench, rotated. */
export interface TerraceLandform extends LandformBase {
  kind: 'terrace';
  x: number;
  z: number;
  rx: number;
  rz: number;
  rot: number;
  h: number;
}

/** A field of needles scattered over a span. */
export interface SpireLandform extends LandformBase {
  kind: 'spire';
  x: number;
  z: number;
  spanX: number;
  spanZ: number;
  count: number;
}

export type Landform =
  | DiscLandform | CraterLandform | FinLandform | CanyonLandform | TerraceLandform | SpireLandform;

export const LANDFORMS: Landform[] = [
  // --- Leide: the badland stage set around Hammerhead ---------------------
  { id: 'hammerheadPan', kind: 'basin', x: 60, z: 40, r: 460, h: 9, why: 'Hammerhead needs level ground for the garage apron and the highway.' },
  { id: 'blackrockMesa', kind: 'mesa', x: -430, z: -560, r: 250, h: 132, benches: 2, cliff: 0.11, apron: 1.05, tilt: 0.05, dipDir: -1.15, why: 'Hero table north-west of Hammerhead; the vista_noon sight line.' },
  { id: 'blackrockOutlier', kind: 'butte', x: -180, z: -760, r: 90, h: 66, benches: 0, cliff: 0.09, apron: 0.7, why: 'Sheer remnant in front of the hero table, for depth separation.' },
  { id: 'northMesa', kind: 'mesa', x: -980, z: -1240, r: 320, h: 200, benches: 3, cliff: 0.1, apron: 1.15, tilt: 0.03, dipDir: 1.9, why: 'The tall stepped plateau closing the north-west horizon.' },
  { id: 'eastButtes', kind: 'butte', x: 560, z: -420, r: 122, h: 86, benches: 0, cliff: 0.085, apron: 0.85, why: 'Monument-Valley remnants east of the highway.' },
  { id: 'eastButtes2', kind: 'butte', x: 716, z: -300, r: 72, h: 58, benches: 0, cliff: 0.075, apron: 0.9, why: 'Butte-cluster companion.' },
  { id: 'eastButtes3', kind: 'butte', x: 432, z: -572, r: 88, h: 68, benches: 1, cliff: 0.1, apron: 0.8, why: 'Butte-cluster companion.' },
  { id: 'westScarp', kind: 'mesa', x: -640, z: 430, r: 196, h: 110, benches: 1, cliff: 0.1, apron: 0.75, tilt: 0.11, dipDir: 1.5, why: 'Cuesta escarpment; the vista_dusk sight line.' },
  { id: 'westScarpFin', kind: 'fin', x0: -520, z0: 520, x1: -1060, z1: 840, halfW: 72, h: 80, dip: 3.6, why: 'Carries the scarp line away from the table.' },
  { id: 'spireRidge', kind: 'spire', x: -900, z: 560, spanX: 480, spanZ: 240, count: 9, why: 'Fang country south-west; deliberately the minority landform.' },
  { id: 'spireRidge2', kind: 'spire', x: 640, z: 620, spanX: 380, spanZ: -180, count: 6, why: 'Second fang group to break the south-east skyline.' },
  { id: 'leideFin1', kind: 'fin', x0: 220, z0: -980, x1: 780, z1: -790, halfW: 54, h: 96, dip: 2.6, why: 'Hogback the Keycatrich track threads past.' },
  { id: 'leideFin2', kind: 'fin', x0: -80, z0: 900, x1: 540, z1: 1140, halfW: 48, h: 62, dip: 3.4, flip: true, why: 'South ridge behind the Three Valleys.' },
  { id: 'leideMesaN', kind: 'mesa', x: -60, z: -900, r: 150, h: 96, benches: 2, cliff: 0.1, apron: 1.0, dipDir: 1.6, why: 'Northern backdrop for the party and hero framings.' },

  // --- Leide: named hero features ----------------------------------------
  { id: 'longwythePeak', kind: 'peak', x: 900, z: -1180, r: 560, h: 430, why: 'Longwythe Peak: the black horn seen from everywhere in Leide.' },
  { id: 'threeValleysA', kind: 'fin', x0: 900, z0: 620, x1: 1540, z1: 1180, halfW: 74, h: 122, dip: 2.8, why: 'First divide of the Three Valleys.' },
  { id: 'threeValleysB', kind: 'fin', x0: 1220, z0: 560, x1: 1860, z1: 1100, halfW: 68, h: 108, dip: 2.6, why: 'Second divide of the Three Valleys.' },
  { id: 'threeValleysC', kind: 'fin', x0: 1540, z0: 520, x1: 2140, z1: 1020, halfW: 62, h: 94, dip: 2.6, why: 'Third divide of the Three Valleys.' },
  { id: 'crownScarp', kind: 'mesa', x: 3320, z: -900, r: 470, h: 320, benches: 3, cliff: 0.12, apron: 1.1, why: 'The wall of rock the Crown City sits behind.' },
  { id: 'crownScarp2', kind: 'fin', x0: 2960, z0: -1180, x1: 3500, z1: -700, halfW: 130, h: 240, dip: 2.4, why: 'Continues the Crown Verge skyline east.' },
  { id: 'balouveSpoil', kind: 'mesa', x: 2940, z: 1300, r: 230, h: 136, benches: 2, cliff: 0.13, apron: 0.95, why: 'Mine spoil bench above the Balouve shaft heads.' },
  { id: 'keycatrichRim', kind: 'mesa', x: 300, z: -1740, r: 290, h: 156, benches: 2, cliff: 0.11, apron: 1.0, dipDir: 1.6, why: 'The rim the ruined town shelters under.' },
  { id: 'galdinShelf', kind: 'basin', x: 2960, z: 3140, r: 1350, h: -46, why: 'The sea off Galdin Quay; fills to the water plane automatically.' },
  { id: 'angelgard', kind: 'butte', x: 2960, z: 3080, r: 155, h: 92, benches: 0, cliff: 0.09, apron: 0.35, why: 'Angelgard: a sheer island straight out of the water.' },
  { id: 'kelbassRoll', kind: 'basin', x: 2060, z: 1280, r: 640, h: 22, why: 'The Galdin road needs a long fast prairie to cross.' },

  // --- Duscae -------------------------------------------------------------
  { id: 'alstorBasin', kind: 'basin', x: -1320, z: 820, r: 640, h: -16, why: 'Alstor Slough must hold standing water: floor below the water plane.' },
  { id: 'alstorRise', kind: 'mesa', x: -760, z: 180, r: 170, h: 56, benches: 1, cliff: 0.14, apron: 0.9, why: 'The dry rise the Alstor haven and the loop road sit on.' },
  { id: 'weaverRise', kind: 'basin', x: -1900, z: 220, r: 720, h: 26, why: 'Chocobo prairie: broad, level, fast to ride across.' },
  { id: 'fallgroveDowns', kind: 'basin', x: -820, z: 1620, r: 660, h: 28, why: 'Rolling downland approach to Costlemark.' },
  { id: 'nebulaFloor', kind: 'basin', x: -1620, z: -1240, r: 640, h: 30, why: 'The forest floor must be flat enough for a closed canopy.' },
  { id: 'discCrater', kind: 'crater', x: -1020, z: -2160, r: 1080, rim: 210, depth: 120, core: 300, why: 'The Disc of Cauthess: raised rim, sunken crust, meteor mass at the centre.' },
  { id: 'taelparCanyon', kind: 'canyon', pts: [[-2560, -1900], [-2420, -1360], [-2320, -880], [-2286, -486], [-2344, -20], [-2470, 520]], halfW: 150, depth: 235, why: 'Taelpar Crag: the gorge Route 1 bridges. Runs north-south across the highway.' },
  { id: 'taelparNeck', kind: 'terrace', x: -2286, z: -486, rx: 150, rz: 70, rot: 1.5, h: 96, why: 'The narrow neck the bridge abutments stand on.' },
  { id: 'taelparWall', kind: 'fin', x0: -2660, z0: -1620, x1: -2820, z1: -300, halfW: 130, h: 170, dip: 2.4, why: 'The west wall of the crag, rising toward the Lestallum shelf.' },

  // --- Cleigne -------------------------------------------------------------
  { id: 'lestallumTerrace', kind: 'terrace', x: -3060, z: -680, rx: 640, rz: 540, rot: -0.1, h: 122, why: 'Lestallum stands on a level basalt shelf with cliffs on its east side.' },
  { id: 'oldLestallumShelf', kind: 'terrace', x: -3200, z: -1220, rx: 340, rz: 300, rot: 0.2, h: 128, why: 'Old Lestallum needs its own bench off the main shelf.' },
  { id: 'cotisseBench', kind: 'terrace', x: -3090, z: -1790, rx: 340, rz: 320, rot: 0.1, h: 92, why: 'The Cleigne north road steps down off the shelf in two benches; without the middle one the descent to the pool is a cliff no car could take.' },
  { id: 'vesperRim', kind: 'terrace', x: -2660, z: -2080, rx: 300, rz: 260, rot: 0.0, h: 44, why: 'The causeway head above the Vesperpool: the last dry bench.' },
  { id: 'vesperBasin', kind: 'basin', x: -3020, z: -2360, r: 640, h: -20, why: 'The Vesperpool: a drowned forest, floor well below the water plane.' },
  { id: 'vesperRidge', kind: 'fin', x0: -3420, z0: -1960, x1: -3480, z1: -2680, halfW: 120, h: 190, dip: 2.6, why: 'Separates the pool basin from the ash field.' },
  { id: 'ravatoghCone', kind: 'volcano', x: -3420, z: -3160, r: 680, h: 720, crater: 0.26, why: 'The Rock of Ravatogh: the highest point in Lucis, with a crater.' },
  { id: 'meldacioPass', kind: 'canyon', pts: [[-1200, -2740], [-1620, -2900], [-2100, -3020], [-2560, -3140]], halfW: 230, depth: 80, why: 'The pass floor the Cleigne north road runs along.' },
  { id: 'meldacioWallN', kind: 'fin', x0: -1180, z0: -3340, x1: -2700, z1: -3480, halfW: 200, h: 320, dip: 2.2, why: 'North wall of the Meldacio pass.' },
  { id: 'meldacioWallS', kind: 'fin', x0: -1280, z0: -2440, x1: -2660, z1: -2700, halfW: 180, h: 250, dip: 2.4, flip: true, why: 'South wall of the Meldacio pass.' },
  { id: 'caemHeadland', kind: 'mesa', x: -2500, z: 1980, r: 300, h: 100, benches: 1, cliff: 0.16, apron: 0.5, why: 'Cape Caem is a headland: flat top, cliffs into the sea.' },
  { id: 'caemSea', kind: 'basin', x: -2680, z: 2740, r: 1050, h: -44, why: 'The southern sea off Cape Caem.' },
  { id: 'malmalamHollow', kind: 'basin', x: -3260, z: 1540, r: 560, h: 42, why: 'The thicket sits in a shallow bowl so its canopy closes over.' },
  { id: 'cleigneWallW', kind: 'fin', x0: -3700, z0: -1360, x1: -3540, z1: 380, halfW: 200, h: 300, dip: 2.2, why: 'The western rampart of Lucis, closing the map.' },
];

// -------------------------------------------------------------------- class

/** Fixed field order for the packed biome vector the terrain reads. */
export const BIOME_KEYS: ReadonlyArray<keyof Biome> = [
  'base', 'relief', 'ridge', 'ridgeIn', 'terrace', 'rough', 'warp', 'moist', 'rocky', 'style',
];
const NB = BIOME_KEYS.length;

/**
 * Query surface over the map tables. One instance is enough — `worldMap` below
 * is the shared singleton every system reads.
 */
/**
 * Normalised zone influence at a point, keyed by `Zone.id`. `_default` carries
 * whatever weight no zone claimed — the frontier.
 */
export type ZoneWeights = Record<string, number>;

export class WorldMap {
  /** Ids of every POI revealed so far. */
  discovered!: Set<string>;
  _bBuf!: Float64Array;
  /** POIs bucketed by `"i,j"` grid cell, for `nearestPOI`. */
  _buckets!: Map<string, Poi[]>;
  _cell!: number;
  _defB!: Float64Array;
  _nz!: number;
  _wBuf!: Float64Array;
  _zb!: Float64Array;
  _zc!: Float64Array;
  byId!: Map<string, Poi>;
  landforms!: Landform[];
  poiTypes!: Record<PoiTypeName, PoiType>;
  pois!: Poi[];
  regionById!: Map<string, Region>;
  regions!: Region[];
  roadGraph!: RoadGraph;
  world!: typeof WORLD;
  zoneById!: Map<string, Zone>;
  zones!: Zone[];
  constructor() {
    this.world = WORLD;
    this.regions = REGIONS;
    this.zones = ZONES;
    // every `at:` anchor was resolved above, so these are `Poi`, not `PoiSpec`
    this.pois = POIS as Poi[];
    this.landforms = LANDFORMS;
    this.poiTypes = POI_TYPES;

    this.roadGraph = new RoadGraph(NODES, ROUTES, ROAD_CLASS);

    // A POI written as `at: 'n_longwythe'` inherits the road node's position,
    // so a settlement can never drift off the road that serves it. Hammerhead is
    // the exception and says why at its own record: its town is built from an
    // Ecology site, not from a node.
    for (const p of POIS) {
      if (p.at) {
        const nd = this.roadGraph.nodes.get(p.at);
        if (!nd) throw new Error(`WorldMap: POI ${p.id} anchored to unknown node ${p.at}`);
        p.x = nd.x; p.z = nd.z;
      }
    }

    this.byId = new Map();
    for (const p of this.pois) this.byId.set(p.id, p);
    this.zoneById = new Map();
    for (const z of ZONES) this.zoneById.set(z.id, z);
    this.regionById = new Map();
    for (const r of REGIONS) this.regionById.set(r.id, r);

    /** Ids the player has found. Hammerhead and its layby start revealed. */
    this.discovered = new Set(['hammerhead', 'hammerhead_layby']);

    // Packed zone tables. The heightfield evaluates the blend a quarter of a
    // million times during a build, so the hot path is typed arrays with no
    // allocation, no property lookups and no trigonometry.
    const nz = ZONES.length;
    this._nz = nz;
    this._zc = new Float64Array(nz * 7);      // cx, cz, cos, sin, 1/rx, 1/rz, priority
    this._zb = new Float64Array(nz * NB);
    for (let i = 0; i < nz; i++) {
      const zn = ZONES[i];
      const o = i * 7;
      this._zc[o] = zn.cx; this._zc[o + 1] = zn.cz;
      this._zc[o + 2] = Math.cos(zn.rot); this._zc[o + 3] = Math.sin(zn.rot);
      this._zc[o + 4] = 1 / zn.rx; this._zc[o + 5] = 1 / zn.rz;
      this._zc[o + 6] = zn.priority;
      for (let k = 0; k < NB; k++) this._zb[i * NB + k] = zn.biome[BIOME_KEYS[k] as keyof typeof zn.biome];
    }
    this._defB = new Float64Array(NB);
    for (let k = 0; k < NB; k++) this._defB[k] = DEFAULT_BIOME[BIOME_KEYS[k] as keyof typeof DEFAULT_BIOME];
    this._wBuf = new Float64Array(nz);
    this._bBuf = new Float64Array(NB);

    // Coarse POI bucket grid for O(1)-ish nearest queries.
    this._cell = 512;
    this._buckets = new Map();
    for (const p of POIS as Poi[]) {
      const k = this._key(p.x, p.z);
      let a = this._buckets.get(k);
      if (!a) { a = []; this._buckets.set(k, a); }
      a.push(p);
    }
  }

  _key(x: number, z: number) {
    return `${Math.floor(x / this._cell)},${Math.floor(z / this._cell)}`;
  }

  // ------------------------------------------------------------------ zones

  /**
   * Normalised zone weights at a world position, written into `out` as
   * `{ [zoneId]: weight }`. Weights sum to 1 across zones plus `_default`.
   * @returns {object}
   */
  /**
   * Fill `this._wBuf` with normalised zone weights and return the leftover
   * "frontier" weight. The hot inner loop; no allocation.
   * @returns weight of the generic highland fallback
   */
  _weigh(x: number, z: number): number {
    const zc = this._zc, w = this._wBuf, nz = this._nz;
    let sum = 0;
    for (let i = 0; i < nz; i++) {
      const o = i * 7;
      const dx = x - zc[o], dz = z - zc[o + 1];
      const ca = zc[o + 2], sa = zc[o + 3];
      const u = (dx * ca + dz * sa) * zc[o + 4];
      const v = (-dx * sa + dz * ca) * zc[o + 5];
      const d2 = u * u + v * v;
      // Compact support with a soft shoulder: a zone stops mattering at ~1.9r.
      const q = d2 > 3.6 ? 0 : zc[o + 6] * Math.exp(-d2 * 1.55);
      w[i] = q;
      sum += q;
    }
    const rest = Math.max(0, 0.22 - sum * 0.22);
    sum += rest;
    if (sum <= 1e-9) { for (let i = 0; i < nz; i++) w[i] = 0; return 1; }
    const inv = 1 / sum;
    for (let i = 0; i < nz; i++) w[i] *= inv;
    return rest * inv;
  }

  zoneWeights(x: number, z: number, out: ZoneWeights = {}): ZoneWeights {
    for (const k in out) delete out[k as keyof typeof out];
    const rest = this._weigh(x, z);
    const w = this._wBuf;
    for (let i = 0; i < this._nz; i++) if (w[i] > 0) out[ZONES[i].id as keyof typeof out] = w[i];
    if (rest > 0) out._default = rest;
    return out;
  }

  /**
   * Blended biome parameters as a packed `Float64Array` in {@link BIOME_KEYS}
   * order. Reuses one buffer — copy it if you need to keep it.
   */
  biomeVec(x: number, z: number): Float64Array {
    const rest = this._weigh(x, z);
    const w = this._wBuf, zb = this._zb, out = this._bBuf, def = this._defB;
    for (let k = 0; k < NB; k++) out[k] = def[k] * rest;
    for (let i = 0; i < this._nz; i++) {
      const q = w[i];
      if (q <= 0) continue;
      const o = i * NB;
      for (let k = 0; k < NB; k++) out[k] += zb[o + k] * q;
    }
    return out;
  }

  /**
   * The zone whose influence is strongest here.
   * @returns the zone record, or null on the frontier
   */
  zoneAt(x: number, z: number): Zone | null {
    let best: Zone | null = null, bestW = 0.0001;
    for (let i = 0; i < ZONES.length; i++) {
      const zn = ZONES[i];
      const dx = x - zn.cx, dz = z - zn.cz;
      const ca = Math.cos(zn.rot), sa = Math.sin(zn.rot);
      const u = (dx * ca + dz * sa) / zn.rx;
      const v = (-dx * sa + dz * ca) / zn.rz;
      const d2 = u * u + v * v;
      if (d2 > 3.6) continue;
      const w = zn.priority * Math.exp(-d2 * 1.55);
      if (w > bestW) { bestW = w; best = zn; }
    }
    return best;
  }

  /** The region record covering this point (via its dominant zone). */
  regionAt(x: number, z: number) {
    const zn = this.zoneAt(x, z);
    return zn ? this.regionById.get(zn.region) : null;
  }

  /**
   * Biome parameters blended across every zone touching this point. The
   * heightfield calls this once per macro cell.
   * @param [out] reused object
   * @returns same shape as `ZONES[i].biome`
   */
  biomeAt(x: number, z: number, out: Partial<Biome> = {}): Biome {
    const v = this.biomeVec(x, z);
    for (let k = 0; k < NB; k++) out[BIOME_KEYS[k]] = v[k];
    // every key is written above, so the partial is complete by construction
    return out as Biome;
  }

  // ------------------------------------------------------------------- POIs

  poiById(id: string): Poi | undefined { return this.byId.get(id); }

  /** Every POI of a given type. */
  poisOfType(type: PoiTypeName): Poi[] { return this.pois.filter((p) => p.type === type); }

  /** Every POI inside a zone. */
  poisInZone(zoneId: string): Poi[] { return this.pois.filter((p) => p.zone === zoneId); }

  /**
   * Nearest POI to a world position.
   * @param x @param z
   */
  nearestPOI(x: number, z: number, opt: {types?:string[], maxDist?:number, discoveredOnly?:boolean} = {}): {poi: Poi, dist: number} | null {
    const { types = null, maxDist = Infinity, discoveredOnly = false } = opt;
    let best: Poi | null = null, bestD = maxDist;
    const ci = Math.floor(x / this._cell), cj = Math.floor(z / this._cell);
    const ring = Math.min(9, Math.ceil(maxDist === Infinity ? 9 : maxDist / this._cell) + 1);
    for (let r = 0; r <= ring; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (r > 0 && Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const arr = this._buckets.get(`${ci + di},${cj + dj}`);
          if (!arr) continue;
          for (const p of arr) {
            if (types && types.indexOf(p.type) < 0) continue;
            if (discoveredOnly && !this.discovered.has(p.id)) continue;
            const d = Math.hypot(p.x - x, p.z - z);
            if (d < bestD) { bestD = d; best = p; }
          }
        }
      }
      if (best && bestD < this._cell * r) break;
    }
    return best ? { poi: best, dist: bestD } : null;
  }

  /**
   * Reveal a POI. Returns true the first time only, so callers can fire the
   * discovery title card exactly once.
   */
  discover(id: string): boolean {
    if (!this.byId.has(id) || this.discovered.has(id)) return false;
    this.discovered.add(id);
    return true;
  }

  isDiscovered(id: string): boolean { return this.discovered.has(id); }

  /**
   * Reveal everything whose discovery radius contains this point. Call it once
   * per second or so from whatever tracks the player.
   * @returns POIs newly discovered this call
   */
  discoverAround(x: number, z: number): Poi[] {
    const found: Poi[] = [];
    for (const p of this.pois) {
      if (this.discovered.has(p.id)) continue;
      if (Math.hypot(p.x - x, p.z - z) <= p.r) {
        this.discovered.add(p.id);
        found.push(p);
      }
    }
    return found;
  }

  // ---------------------------------------------------------------- travel

  /**
   * Estimated travel time between two world points.
   * @returns road distance for
   *   `drive`/`chocobo`, straight line for the rest.
   */
  travel(ax: number, az: number, bx: number, bz: number, mode: 'walk' | 'sprint' | 'chocobo' | 'drive' = 'drive'): {dist:number, seconds:number, mode:string} {
    const SPEED = { walk: 2.4, sprint: 5.6, chocobo: 11.0, drive: 26.0 };
    const v = SPEED[mode] || SPEED.walk;
    let dist;
    if (mode === 'drive') {
      const route = this.roadGraph.route(ax, az, bx, bz);
      dist = route ? route.length : Math.hypot(bx - ax, bz - az) * 1.6;
    } else {
      dist = Math.hypot(bx - ax, bz - az) * (mode === 'chocobo' ? 1.15 : 1.25);
    }
    return { dist, seconds: dist / v, mode };
  }
}

/** The shared world map. Import this, don't construct your own. */
export const worldMap = new WorldMap();
export default worldMap;

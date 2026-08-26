import { worldMap, WORLD } from '../../world/map/WorldMap.ts';
import type { Territory, Pressure, SpawnLine, Faction } from './SpawnTables.ts';
import type { Ecology } from '../../world/veg/Ecology.ts';

/**
 * The dens nobody authored.
 *
 * `TERRITORIES` holds **eighteen** hand-placed packs. The world is 8192 m on a
 * side — 67 km² — and a territory is activated only inside 130 m, so the ground
 * that has an encounter on it is eighteen discs of ~30 m: **0.08% of the map.**
 * Measured with `src/tools/probes/walkabout.mts`, which walks the real player
 * with real input and counts what it meets: a sprint out of Hammerhead in any
 * of eight directions crosses kilometres of country and meets nothing at all.
 *
 * That is the whole of the human's report that the world "feels barren and
 * empty", and no amount of scatter density fixes it: a landscape with nothing
 * living in it reads as a diorama however well dressed it is. The authored
 * eighteen are still right — they are the *named* places, the ones a hunt sends
 * you to and the map marks — but they were carrying a job they were never
 * shaped for.
 *
 * So the rest of the world gets dens the same way it gets boulders: **a pure
 * function of position.** A 220 m cell either holds a pack or does not, decided
 * by a hash of its own integer coordinates, and if it does, the zone under it
 * chooses the species, the level band and whether the thing grazes or hunts.
 * Nothing is stored, so a den the player cleared and drove away from is the
 * same den when they come back — the existing `cooldowns` map is what makes it
 * stay cleared for a while, exactly as it does for an authored one.
 *
 * The output is a plain `Territory[]`, so `EncounterDirector._stream` treats
 * these identically to the authored table and every downstream system —
 * `Pack`, aggro, the combat state machine, the victory payout — is untouched.
 */

/** Cell pitch for the wild grid, metres. */
export const WILD_CELL = 160;
const CELL = WILD_CELL;

/**
 * Chance a cell holds a den at all, before the terrain gets a say.
 *
 * **This is a swept-corridor number, not a per-area one, and the first attempt
 * got that wrong.** A territory activates inside 130 m, so a player walking a
 * straight line sweeps a 260 m corridor: 400 m of travel is 10.4 ha of ground
 * that could hold an encounter. At the first try's `CELL` 220 / `OCCUPANCY`
 * 0.30 the world held one den per 17 ha, so a 400 m sprint swept 0.6 of one —
 * and `walkabout.mts` duly reported *the same* 29-32% hostile-nearby rate with
 * the wild dens in as without them, every one of which was an authored pack
 * back at Hammerhead. The density was right for a map and wrong for a walk.
 *
 * At `CELL` 160 / 0.55 the generator offered one den per 4.1 ha — but the site
 * test rejects ~40% of them (water, cliff, road corridor, cleared ground), and
 * measured on the walk that came out as one activation per 400 m, which is
 * still a lonely world. **0.85 is the realised number, not the offered one**:
 * 5.2 ha per surviving den, ~2 per 400 m sprint. Half of those graze
 * ({@link PASSIVE_SHARE}), so it is a *fight* every ~400 m and something
 * *alive* every ~200 m — the rhythm of the road out of Hammerhead in the game
 * this is measured against.
 */
const OCCUPANCY = 0.85;

/**
 * How many of those are grazing herds rather than predators.
 *
 * A world where every den is a fight is not full, it is hostile — the player
 * cannot cross it, and every encounter stops being an event because they are
 * all the same event. FFXV's open country is mostly *animals*: dualhorn and
 * anak stand around eating and only turn on you if you start it. That is what
 * `passive` already means here, and it is the majority case on purpose.
 */
const PASSIVE_SHARE = 0.52;

/** Deterministic hash of a cell and a salt -> [0,1). */
function cellHash(cx: number, cz: number, salt: number) {
  let h = (cx * 374761393 + cz * 668265263 + salt * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2654435761);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** One entry in a regional roster: the species, and how many come together. */
interface RosterLine {
  key: string;
  count: [number, number];
  /** Selection weight within its roster. */
  weight: number;
  /** Grazing herd rather than a predator. */
  passive?: boolean;
  /** Second species that runs with the first. */
  with?: SpawnLine;
}

/**
 * Who lives where.
 *
 * Keyed by region and by whether the sun is up, because that is the axis the
 * bestiary is actually authored along: daylight Lucis is animals, and the
 * daemons come out of the ground at dusk. Imperial patrols are handled
 * separately — they belong to the *road*, not to the country.
 *
 * Levels come from the zone the cell falls in, so this table never states one;
 * a coeurl in Leide is a level 22 coeurl and the same coeurl in Cleigne is a
 * level 45 coeurl, which is how the danger gradient survives being procedural.
 */
const ROSTERS: Record<string, Record<'day' | 'night', RosterLine[]>> = {
  leide: {
    day: [
      { key: 'sabertusk', count: [3, 5], weight: 30 },
      { key: 'voretooth', count: [3, 4], weight: 14 },
      { key: 'dualhorn', count: [2, 3], weight: 16, passive: true },
      { key: 'anak', count: [3, 5], weight: 22, passive: true },
      { key: 'garula', count: [2, 3], weight: 10, passive: true },
      { key: 'coeurl', count: [1, 1], weight: 4 },
    ],
    night: [
      { key: 'goblin', count: [4, 6], weight: 34 },
      { key: 'hobgoblin', count: [1, 2], weight: 14 },
      { key: 'bussemand', count: [1, 1], weight: 8 },
      { key: 'mesmenir', count: [1, 2], weight: 10 },
      { key: 'anak', count: [3, 4], weight: 12, passive: true },
      { key: 'sabertusk', count: [3, 4], weight: 14 },
    ],
  },
  duscae: {
    day: [
      { key: 'voretooth', count: [3, 5], weight: 26 },
      { key: 'garula', count: [2, 4], weight: 20, passive: true },
      { key: 'anak', count: [3, 5], weight: 16, passive: true },
      { key: 'sabertusk', count: [3, 5], weight: 14 },
      { key: 'coeurl', count: [1, 2], weight: 14 },
      { key: 'dualhorn', count: [2, 3], weight: 10, passive: true },
    ],
    night: [
      { key: 'goblin', count: [4, 7], weight: 24 },
      { key: 'hobgoblin', count: [2, 3], weight: 20 },
      { key: 'arachne', count: [1, 1], weight: 10 },
      { key: 'necromancer', count: [1, 1], weight: 8 },
      { key: 'bussemand', count: [1, 2], weight: 12 },
      { key: 'mesmenir', count: [1, 3], weight: 14 },
      { key: 'garula', count: [2, 3], weight: 12, passive: true },
    ],
  },
  cleigne: {
    day: [
      { key: 'coeurl', count: [1, 2], weight: 24 },
      { key: 'bandersnatch', count: [1, 1], weight: 14 },
      { key: 'garula', count: [2, 4], weight: 18, passive: true },
      { key: 'voretooth', count: [4, 5], weight: 16 },
      { key: 'dualhorn', count: [2, 3], weight: 14, passive: true },
      { key: 'anak', count: [3, 5], weight: 14, passive: true },
    ],
    night: [
      { key: 'hobgoblin', count: [2, 4], weight: 20 },
      { key: 'ronin', count: [1, 2], weight: 12 },
      { key: 'necromancer', count: [1, 2], weight: 14 },
      { key: 'arachne', count: [1, 2], weight: 14 },
      { key: 'irongiant', count: [1, 1], weight: 8 },
      { key: 'redgiant', count: [1, 1], weight: 5 },
      { key: 'mesmenir', count: [2, 3], weight: 14 },
      { key: 'bandersnatch', count: [1, 1], weight: 13 },
    ],
  },
};

/** The imperial patrol that belongs to a road corridor rather than a region. */
const IMPERIAL: SpawnLine[] = [
  { key: 'mt', count: [3, 4] },
  { key: 'axeman', count: [1, 1] },
  { key: 'sniper', count: [0, 1] },
];

/** Weighted pick from a roster. */
function pick(roster: RosterLine[], u: number): RosterLine {
  let total = 0;
  for (const r of roster) total += r.weight;
  let t = u * total;
  for (const r of roster) { t -= r.weight; if (t <= 0) return r; }
  return roster[roster.length - 1];
}

/** `[min,max]` inclusive, from a unit sample. */
function span(range: [number, number], u: number) {
  return range[0] + Math.floor(u * (range[1] - range[0] + 1e-6 + 1));
}

/**
 * Is this a place a pack could actually be standing?
 *
 * The same exclusions the vegetation scatter uses, for the same reason: a
 * sabertusk pack in a lake, on a cliff face, in the middle of the carriageway
 * or inside Hammerhead's forecourt is worse than no pack at all. `Ecology`
 * already owns every one of these questions, so this asks it rather than
 * inventing a second answer.
 */
function siteOk(eco: Ecology | null, x: number, z: number) {
  if (Math.max(Math.abs(x), Math.abs(z)) > WORLD.half - 140) return false;
  if (!eco) return true;
  if (eco.waterDepth(x, z) > 0.2) return false;
  if (eco.slope01(x, z) > 0.42) return false;
  // Off the carriageway, but deliberately still within sight of it: the road
  // is where a player travels, and dens they can never see are dens that may
  // as well not exist.
  if (eco.roadDist(x, z) < 22) return false;
  if (eco.cleared(x, z) > 0.05) return false;
  return true;
}

/**
 * Every wild den whose cell centre is within `radius` of `(px, pz)`.
 *
 * Cheap enough to call on the director's half-second streaming tick: at
 * `radius` 400 that is 25 cells, each of which costs a hash, a zone lookup and
 * — only for the ~30% that pass the hash — four `Ecology` samples.
 *
 * @param px player x
 * @param pz player z
 * @param radius how far out to generate, metres
 * @param pressure the day/night state, so a cell's roster matches the clock
 * @param eco terrain sampler for the site rejections; null skips them
 * @param seed world seed, so two saves are not the same world
 */
export function wildTerritoriesNear(
  px: number, pz: number, radius: number,
  pressure: Pressure, eco: Ecology | null, seed = 1337,
): Territory[] {
  const out: Territory[] = [];
  // `spawn` is the canonical "daemons are out" flag — the same one
  // `windowOpen` reads, so a wild den and an authored one agree about dusk.
  const night = !!pressure.spawn;
  const c0x = Math.floor((px - radius) / CELL), c1x = Math.floor((px + radius) / CELL);
  const c0z = Math.floor((pz - radius) / CELL), c1z = Math.floor((pz + radius) / CELL);
  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      if (cellHash(cx, cz, seed ^ 0x5f3a) > OCCUPANCY) continue;

      // jittered inside the cell, so the grid never reads as a grid
      const jx = cellHash(cx, cz, seed ^ 0x11b7);
      const jz = cellHash(cx, cz, seed ^ 0x27d1);
      const x = (cx + 0.18 + jx * 0.64) * CELL;
      const z = (cz + 0.18 + jz * 0.64) * CELL;
      if (Math.hypot(x - px, z - pz) > radius) continue;
      if (!siteOk(eco, x, z)) continue;

      const zone = worldMap.zoneAt(x, z);
      const region = (zone && zone.region) || 'leide';
      const levels = (zone && zone.levels) || [1, 8];

      // An imperial patrol is a road event, not a countryside one.
      const roadside = eco ? eco.roadDist(x, z) < 90 : false;
      const wantImperial = roadside && cellHash(cx, cz, seed ^ 0x3ac9) < 0.22;

      const u = cellHash(cx, cz, seed ^ 0x6b15);
      const roster = ROSTERS[region] ? ROSTERS[region][night ? 'night' : 'day'] : ROSTERS.leide.day;
      const line = pick(roster, u);

      const lu = cellHash(cx, cz, seed ^ 0x7e83);
      const level = Math.max(1, Math.round(levels[0] + lu * (levels[1] - levels[0])));
      const nu = cellHash(cx, cz, seed ^ 0x9c47);
      const pu = cellHash(cx, cz, seed ^ 0xa1d5);

      let spawn: SpawnLine[];
      let passive: boolean;
      let faction: Faction;
      let name: string;
      if (wantImperial) {
        spawn = IMPERIAL;
        passive = false;
        faction = 'imperial';
        name = 'Imperial patrol';
      } else {
        spawn = [{ key: line.key, count: [span(line.count, nu), span(line.count, nu)] }];
        // A herd is a herd only if its species is one, and only sometimes: the
        // same anak that grazes on one hillside is a startled anak on the next.
        passive = !!line.passive && pu < PASSIVE_SHARE + 0.3;
        faction = night && !line.passive ? 'daemon' : 'beast';
        name = zone ? zone.name : 'The wilds';
      }

      out.push({
        id: `wild_${cx}_${cz}`,
        name,
        at: [x, z],
        radius: passive ? 38 : 28,
        when: 'any',            // the roster already chose for the clock
        level,
        danger: passive ? 0 : Math.min(4, Math.round(level / 12)),
        spawn,
        patrolRadius: passive ? 30 : 20,
        respawn: 210 + Math.floor(cellHash(cx, cz, seed ^ 0xb2e6) * 180),
        maxEngaged: passive ? 2 : 3,
        faction,
        passive,
      });
    }
  }
  return out;
}

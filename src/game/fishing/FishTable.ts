/**
 * What lives in each fishing hole, and how hard it fights.
 *
 * The species were not invented here: every one of them is already named in the
 * `does:` line of its own `WorldMap` POI, which has said "Deep-water fishing:
 * sea bass, allural sea bass, murk grouper" since the map was authored and has
 * never had anything behind it. This table is that sentence made real, and the
 * ids are added to `Inventory`'s ingredient list so a catch is something Ignis
 * can cook rather than a number in a log.
 *
 * The three numbers that matter to the minigame:
 *
 * - **`power`** — how hard it pulls on a run, in tension per second. Anything
 *   above ~1.1 cannot be reeled through a run at all; you have to wait it out.
 * - **`stamina`** — seconds of fighting it has in it, before the modifiers in
 *   `Fishing._fight`. This is the length of the fight, not its difficulty.
 * - **`weight`** — draw weight in the catch roll, *not* the fish's mass. The
 *   mass is rolled per catch from `kg`, because "a 4.2 kg sea bass" is the
 *   sentence a fishing game exists to produce.
 */

/** One species, as authored. */
export interface FishSpec {
  /** Inventory item id — every one of these is a real `ingredient`. */
  id: string;
  name: string;
  /** Draw weight in the catch roll. Higher is commoner. */
  weight: number;
  /** Tension per second while it is running. */
  power: number;
  /** Seconds of fight in it. */
  stamina: number;
  /** Mass range in kg, `[min, max]`. Rolled per catch. */
  kg: [number, number];
  /** Metres of line the cast puts between you and it. */
  reach: [number, number];
  /** Banked EXP for landing one. */
  exp: number;
}

const F = (
  id: string, name: string, weight: number, power: number, stamina: number,
  kg: [number, number], reach: [number, number], exp: number,
): FishSpec => ({ id, name, weight, power, stamina, kg, reach, exp });

/**
 * Every species, keyed by its item id.
 *
 * `alstor_trout` was already an ingredient with two recipes on it and no source
 * in the world other than a quest reward — it is the reason the trout is the
 * first fish the table pays out.
 */
export const FISH: Record<string, FishSpec> = Object.fromEntries([
  // Alstor Slough — freshwater, the beginner water.
  F('alstor_trout',    'Slough Trout',                 34, 0.62, 7,  [0.7, 2.4],  [14, 20], 320),
  F('alstor_bass',     'Alstor Bass',                  26, 0.82, 10, [1.4, 5.1],  [16, 24], 640),
  F('chocobo_carp',    'Dapper Chocobo-Tail Carp',     8,  1.06, 15, [3.2, 9.8],  [20, 28], 1900),
  // Galdin Quay — open sea, bigger and heavier.
  F('sea_bass',        'Sea Bass',                     30, 0.74, 9,  [1.1, 4.6],  [18, 26], 420),
  F('allural_sea_bass','Allural Sea Bass',             14, 0.98, 13, [2.8, 8.2],  [20, 30], 1250),
  F('murk_grouper',    'Murk Grouper',                 18, 1.14, 16, [4.0, 12.5], [18, 26], 1600),
  // Cape Caem — rock fishing off the headland.
  F('barramundi',      'Barramundi',                   24, 0.88, 11, [1.9, 6.4],  [16, 24], 780),
  F('sea_bream',       'Sea Bream',                    28, 0.70, 8,  [0.9, 3.1],  [14, 22], 360),
  // The Vesperpool — the best fishing in Lucis, and it fights like it.
  F('vesper_gar',      'Vesper Gar',                   20, 1.22, 18, [5.5, 15.0], [22, 32], 2400),
  F('pink_jade_gar',   'Pink Jade Gar',                9,  1.34, 21, [7.0, 19.0], [24, 34], 4200),
  F('cygillan_devil',  'Devil of the Cygillan',        2,  1.62, 30, [24.0, 61.0],[28, 38], 14000),
].map((f) => [f.id, f]));

/**
 * What can be pulled out of each fishing POI, as `[fishId, ...]`.
 *
 * Keyed by `WorldMap` POI id and **checked against it at install time** —
 * `Fishing._spots` throws on an id that is not a `type: 'fishing'` POI, because
 * the failure mode this whole lane exists to fix is a table that quietly names
 * a place the world does not have.
 */
export const HOLES: Record<string, string[]> = {
  galdin_pier:         ['sea_bass', 'allural_sea_bass', 'murk_grouper'],
  alstor_dock:         ['alstor_trout', 'alstor_bass', 'chocobo_carp'],
  vesperpool_dock:     ['vesper_gar', 'pink_jade_gar', 'cygillan_devil'],
  caem_shore:          ['barramundi', 'sea_bream'],
  crestholm_reservoir: ['alstor_trout', 'alstor_bass'],
  swainsmere:          ['alstor_trout', 'sea_bream'],
  malacchi_pond:       ['alstor_trout', 'alstor_bass', 'chocobo_carp'],
  archaeans_mirror:    ['alstor_bass', 'chocobo_carp'],
  maidenwater:         ['barramundi', 'vesper_gar'],
  rachsia_bridge:      ['alstor_bass', 'barramundi'],
};

/**
 * Roll a species out of a hole.
 * @param ids the hole's species list
 * @param rnd 0..1
 */
export function rollFish(ids: string[], rnd: number): FishSpec {
  const specs = ids.map((id) => FISH[id]).filter((f): f is FishSpec => !!f);
  if (!specs.length) return FISH.alstor_trout;
  const total = specs.reduce((a, f) => a + f.weight, 0);
  let t = rnd * total;
  for (const f of specs) { t -= f.weight; if (t <= 0) return f; }
  return specs[specs.length - 1];
}

/** The item ids this table can ever pay out — used by the ingredient audit. */
export const FISH_IDS = Object.keys(FISH);

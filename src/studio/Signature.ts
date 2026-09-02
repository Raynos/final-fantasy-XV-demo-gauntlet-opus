/**
 * The dozen places worth seeing first.
 *
 * The World Explorer's list is curated at the top and complete underneath: 139
 * POIs sorted alphabetically is a phone book, and the ask was explicit — "the
 * most impressive / exciting things to see first, and then further down the
 * list here's more stuff".
 *
 * **Authored, not scored.** A "visual interest" heuristic over POI metadata —
 * discovery radius, type weight, distance from the road — would be a guess
 * dressed as a measurement, and this repository has an expensive history with
 * those. A hand list of twelve is honest about being a judgement, takes ten
 * minutes, and is trivially re-ordered when the world changes.
 *
 * **This is the first draft, picked from the map, and it is meant to be
 * replaced by looking.** Each entry says why it is here so that a later pass
 * flying them can disagree with a specific claim rather than with a vibe. The
 * order is the order they appear.
 *
 * `back` is the stand-off distance in metres, and it is per-entry because the
 * subjects are not the same size: a rest stop is a building, Cauthess is a
 * meteor the size of a mountain, and `DevSuite._warp`'s one-size default puts
 * the camera *inside* the second kind.
 */

export interface SignaturePlace {
  /** A POI id from `worldMap.pois`. Absent on this build means simply absent. */
  id: string;
  /** Metres to stand off. @see the module header */
  back: number;
  /** Why it earned a place near the top. Shown as the row's subtitle. */
  why: string;
}

export const SIGNATURE: SignaturePlace[] = [
  { id: 'longwythe_peak', back: 420, why: 'The silhouette that closes Leide — the postcard of the region' },
  { id: 'hammerhead', back: 170, why: 'The first town, and the densest set dressing in the game' },
  { id: 'insomnia_wall', back: 520, why: 'The Wall, seen from outside it. Scale you cannot fake' },
  { id: 'galdin_quay', back: 200, why: 'Water, a pier and a horizon — the one coastal composition' },
  { id: 'angelgard', back: 480, why: 'An island read against open sea; nothing else frames like it' },
  { id: 'costlemark', back: 150, why: 'Dungeon mouth in the open, at the far end of Duscae' },
  { id: 'adamantoise_graveyard', back: 300, why: 'Bones at landscape scale, and the strangest thing in Leide' },
  { id: 'threshold_stones', back: 160, why: 'Standing stones — the clearest foreground/background separation' },
  { id: 'saulhend_overlook', back: 240, why: 'Built to be looked out from. The vista the terrain was tuned on' },
  { id: 'lestallum', back: 260, why: 'The second town, and the only one with real verticality' },
  { id: 'three_valleys', back: 380, why: 'Where Leide turns into Duscae — the biome seam, visible' },
  { id: 'wiz_chocobo', back: 120, why: 'Chocobos, a paddock and a sign. The friendliest frame we have' },
];

import { OPENING } from './Opening.ts';
import { HAMMERHEAD } from './Hammerhead.ts';
import { LONGWYTHE } from './Longwythe.ts';
import { BLOCKADE } from './Blockade.ts';
import { THE_FALL } from './TheFall.ts';
import { ASTRAL } from './Astral.ts';

/** Every authored cutscene, keyed by id. */
export const SCENES = Object.fromEntries(
  [OPENING, HAMMERHEAD, LONGWYTHE, BLOCKADE, THE_FALL, ASTRAL].map((s) => [s.id, s]),
);

export { OPENING, HAMMERHEAD, LONGWYTHE, BLOCKADE, THE_FALL, ASTRAL };
export default SCENES;

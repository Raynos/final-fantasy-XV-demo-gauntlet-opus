import { OPENING } from './Opening.js';
import { HAMMERHEAD } from './Hammerhead.js';
import { LONGWYTHE } from './Longwythe.js';
import { BLOCKADE } from './Blockade.js';
import { THE_FALL } from './TheFall.js';
import { ASTRAL } from './Astral.js';

/** Every authored cutscene, keyed by id. */
export const SCENES = Object.fromEntries(
  [OPENING, HAMMERHEAD, LONGWYTHE, BLOCKADE, THE_FALL, ASTRAL].map((s) => [s.id, s]),
);

export { OPENING, HAMMERHEAD, LONGWYTHE, BLOCKADE, THE_FALL, ASTRAL };
export default SCENES;

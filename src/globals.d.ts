/**
 * Globals the game hangs on `window` on purpose.
 *
 * The harness reaches for every one of these from `page.evaluate()`: it is how
 * a capture waits for `GAME.ready`, how `bootprof.mjs` reads a boot breakdown
 * out of a page it did not build, and how `?debug` turns the dev suite on. They
 * are a contract with `src/tools/**`, not incidental state, so they are declared
 * rather than cast away at each use.
 */
import type { BootProfile } from './engine/BootProfile.ts';

declare global {
  interface Window {
    /** The running game. Set by `src/main.ts` once `init()` resolves. */
    GAME?: any;
    /** Boot timing record, filled in as boot proceeds. `installBootProfile()`. */
    BOOT_PROFILE?: BootProfile;
    /** `?debug` -- the in-page dev suite. */
    DEV?: any;
  }
}

export {};

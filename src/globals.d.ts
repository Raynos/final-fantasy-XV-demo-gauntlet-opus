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
import type { CombatEvents } from './combat/CombatEvents.ts';

declare global {
  interface Window {
    /** The running game. Set by `src/main.ts` once `init()` resolves. */
    GAME?: any;
    /** Boot timing record, filled in as boot proceeds. `installBootProfile()`. */
    BOOT_PROFILE?: BootProfile;
    /** `?debug` -- the in-page dev suite. */
    DEV?: any;
    /** Safari still ships the prefixed constructor. */
    webkitAudioContext?: typeof AudioContext;
  }
}

/**
 * `CombatSystem.emit` mirrors every combat event onto `window` as
 * `combat:<name>`, which is how the HUD, the audio system and the kill log
 * hear about it without holding a reference to combat. Mapping the names here
 * is what makes `e.detail` typed on that side too.
 */
declare global {
  interface WindowEventMap {
    'combat:damage': CustomEvent<CombatEvents['damage']>;
    'combat:hit': CustomEvent<CombatEvents['hit']>;
    'combat:lockon': CustomEvent<CombatEvents['lockon']>;
    'combat:warp': CustomEvent<CombatEvents['warp']>;
    'combat:stagger': CustomEvent<CombatEvents['stagger']>;
    'combat:death': CustomEvent<CombatEvents['death']>;
    'combat:mp': CustomEvent<CombatEvents['mp']>;
    'combat:combo': CustomEvent<CombatEvents['combo']>;
    'combat:parry': CustomEvent<CombatEvents['parry']>;
    'combat:link': CustomEvent<CombatEvents['link']>;
    'combat:playerHit': CustomEvent<CombatEvents['playerHit']>;
    /** UI-side events, dispatched by the game rather than by combat. */
    'ffxv-damage': CustomEvent<any>;
    'ffxv-callout': CustomEvent<{ word?: string, sub?: string }>;
    'ffxv-say': CustomEvent<{ who?: string, line?: string, dur?: number }>;
    'ffxv-banter': CustomEvent<{ who?: string, line?: string }>;
    'ffxv-area': CustomEvent<{ name?: string, sub?: string, meta?: any }>;
    'ffxv-hit': CustomEvent<{ amount?: number }>;
    'ffxv-cutscene': CustomEvent<{ phase: 'start' | 'end', id: string, skipped?: boolean }>;
  }
}

export {};

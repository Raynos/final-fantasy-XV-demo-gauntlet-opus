/**
 * Globals the game hangs on `window` on purpose.
 *
 * The harness reaches for every one of these from `page.evaluate()`: it is how
 * a capture waits for `GAME.ready`, how `bootprof.mts` reads a boot breakdown
 * out of a page it did not build, and how `?debug` turns the dev suite on. They
 * are a contract with `src/tools/**`, not incidental state, so they are declared
 * rather than cast away at each use.
 */
import type { BootProfile } from './engine/BootProfile.ts';
import type { CombatEvents } from './combat/CombatEvents.ts';
import type { DamageEvent } from './ui/CombatHUD.ts';
import type { Game } from './game/Game.ts';
import type { DevSuite } from './dev/DevSuite.ts';

declare global {
  interface Window {
    /**
     * The running game.
     *
     * Non-optional: `src/main.ts` assigns it at module scope, before `init()`
     * is even called, so any page that ran the entry script has it. Every
     * harness `page.evaluate` reaches for it after
     * `waitForFunction('window.GAME && window.GAME.ready === true')`.
     */
    GAME: Game;
    /** Boot timing record, filled in as boot proceeds. `installBootProfile()`. */
    BOOT_PROFILE?: BootProfile;
    /** `?debug` -- the in-page dev suite. Absent without the flag. */
    DEV?: DevSuite;
    /** Safari still ships the prefixed constructor. */
    webkitAudioContext?: typeof AudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
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
    'combat:armigerHit': CustomEvent<CombatEvents['armigerHit']>;
    'combat:armiger': CustomEvent<CombatEvents['armiger']>;
    'combat:spell': CustomEvent<CombatEvents['spell']>;
    /**
     * Encounter-layer events. `PartyAI` fires `encounter:tech` when a
     * companion uses a technique; `EncounterDirector` fires `encounter:kill`
     * when one dies. `CombatBridge` and `combatloop.mts` both listen.
     */
    'encounter:tech': CustomEvent<{ member: string, tech: string, name: string }>;
    'encounter:kill': CustomEvent<{ name: string, level: number, exp: number, drops: string[], boss: boolean }>;
    /**
     * UI-side events, dispatched by the game rather than by combat.
     *
     * `ffxv-damage` is the HUD's public floating-number bus, listed in
     * `HUD.ts`'s class doc as part of its input API. **Nothing in the tree
     * dispatches it** — the live damage numbers come off `combat:damage` — so
     * it is typed from its one consumer, `CombatHUD.damage`.
     */
    'ffxv-damage': CustomEvent<DamageEvent>;
    'ffxv-callout': CustomEvent<{ word?: string, sub?: string }>;
    'ffxv-say': CustomEvent<{ who?: string, line?: string, dur?: number }>;
    'ffxv-banter': CustomEvent<{ who?: string, line?: string, dur?: number }>;
    'ffxv-area': CustomEvent<{ name?: string, sub?: string, meta?: string }>;
    'ffxv-hit': CustomEvent<{ amount?: number }>;
    'ffxv-cutscene': CustomEvent<{ phase: 'start' | 'end', id: string, skipped?: boolean }>;
  }
}

export {};

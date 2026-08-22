import type * as THREE from 'three';
import type { Enemy } from '../characters/enemies/EnemyBase.ts';
import type { ComboStep } from './Weapons.ts';
import type { CraftedSpell, ElementKind, WeaponItem } from './CombatSystem.ts';
import type { SpellReaction } from './Elemancy.ts';

/**
 * Every combat event and the payload that comes with it.
 *
 * Three systems subscribe to these by convention alone -- the HUD (damage
 * numbers, gauges, call-outs), the audio system (impacts, warp whoosh, the
 * armiger sting) and the RPG bridge (exp, kill credit). Until this map existed
 * the only statement of the contract was a doc comment on `CombatSystem.on`,
 * and a payload field renamed on the emitting side went unnoticed until a
 * number stopped appearing on screen.
 *
 * `emit` mirrors each of these onto `window` as `combat:<name>`; the
 * `WindowEventMap` augmentation in `src/globals.d.ts` types that side.
 */
export interface CombatEvents {
  /** A hit resolved against an enemy, after the damage formula. */
  damage: {
    enemy: Enemy;
    damage: number;
    position: THREE.Vector3;
    crit?: boolean;
    element?: string | null;
    killed?: boolean;
    staggered?: boolean;
    weakness?: boolean;
    elementKind?: string | null;
    /** False for damage posted directly by a cinematic rather than rolled. */
    rolled?: boolean;
    /**
     * The companion key (`gladio` / `ignis` / `prompto`) when `PartyAI` dealt
     * the blow, absent when Noctis did. `CombatBridge._onDamage` reads it:
     * only Noctis' own damage charges the armiger.
     */
    source?: string;
  };
  /** A weapon connected: where, and with what. */
  hit: { enemy?: Enemy, position: THREE.Vector3, weapon: string, blindside?: boolean };
  /** Lock-on acquired or dropped. */
  lockon: { enemy: Enemy | null };
  /** Warp-strike phases, including the point-warp to a perch. */
  warp: {
    phase: 'start' | 'impact' | 'point',
    from: THREE.Vector3,
    to: THREE.Vector3,
    enemy?: Enemy | null,
    /** Seconds of accelerated MP recovery the perch bought. `point` only. */
    perch?: number,
  };
  stagger: { enemy: Enemy };
  death: {
    enemy: Enemy;
    /**
     * Who landed the kill — a companion key, when `PartyAI` did.
     * **Nothing reads it.** `EncounterDirector` subscribes to this event and
     * calls `onDeath(d.enemy, 'player')` with the credit hard-coded, so the
     * `'tech'` branch of `onDeath` — and the `tech-finish` AP it awards — is
     * unreachable from here. See `project/handoff/no-any.md`.
     */
    by?: string;
    /** Set by `PartyAI` when a technique landed the kill. **Nothing reads it.** */
    byTechnique?: boolean;
  };
  /** MP changed. `stasis` is the post-warp lockout. */
  mp: { mp: number, maxMp: number, stasis: boolean };
  combo: { index: number, weapon: string, step?: ComboStep };
  parry: { enemy: Enemy, position: THREE.Vector3 };
  link: {
    enemy: Enemy;
    /**
     * The party member who joined in — a `Party.members` record, or null when
     * the party is empty. Nothing has ever read it, so it is `unknown` rather
     * than a shape this file would be guessing at.
     */
    ally: unknown;
    /** the ally's companion key. **Nothing reads it** — the two listeners
     * (`HudBridge`, `CombatBridge`) take no payload at all. */
    member?: string;
  };
  /** The player took damage. */
  playerHit: { enemy: Enemy, damage: number, hp: number, position: THREE.Vector3 };
  /** Weapon swapped into a slot. */
  weapon: { slot: number, kind: string, item?: WeaponItem | null };
  /** A weapon materialised out of the armiger. */
  materialise: { position: THREE.Vector3 };
  heavy: { weapon: string };
  dodge: Record<string, never>;
  armiger: { duration: number };
  armigerDenied: { gauge: number, mp: number };
  /**
   * One phantom arm of the Armiger came down on something.
   *
   * **This event had no emitter until now.** `AudioSystem` has always
   * subscribed to it through a raw `window.addEventListener`, because the map
   * did not know the name, so `Sfx.armigerHit` had only ever been heard in the
   * offline audio render. `CombatSystem._tickArmigerStrikes` emits it now, on
   * the same 0.28 s beat as the strike itself.
   */
  armigerHit: { position: THREE.Vector3 };
  /** A spell detonated. */
  spell: { element: ElementKind, position: THREE.Vector3, reaction?: SpellReaction | null, radius: number };
  castSpell: {
    slot: number,
    spell: CraftedSpell,
    /** Casts left on the flask. Absent when the flask is spent. */
    remaining?: number,
    position: THREE.Vector3,
    damage: number,
  };
  /**
   * Elemental energy drawn out of a deposit — `RpgSystem.drawNearby`'s answer,
   * whose two arms have no discriminant, so this is `unknown` rather than a
   * union restated here. **Nothing subscribes.**
   */
  draw: unknown;
  shot: { position: THREE.Vector3 };
  /**
   * **Dead entry.** Nothing emits `rested` on this bus and nothing subscribes
   * to it: `HudBridge`'s `rested` handler is on the *RPG* emitter, which is
   * where `DayCycle` sends it. Kept as `unknown` rather than deleted so that
   * removing it is a separate, deliberate change.
   */
  rested: unknown;
}

/** Any name `CombatSystem.on()` and `.emit()` accept. */
export type CombatEventName = keyof CombatEvents;

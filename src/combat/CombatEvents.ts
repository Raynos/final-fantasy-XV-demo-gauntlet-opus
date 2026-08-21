import type * as THREE from 'three';

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
    enemy: any;
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
  };
  /** A weapon connected: where, and with what. */
  hit: { enemy?: any, position: THREE.Vector3, weapon: string, blindside?: boolean };
  /** Lock-on acquired or dropped. */
  lockon: { enemy: any | null };
  /** Warp-strike phases, including the point-warp to a perch. */
  warp: { phase: 'start' | 'impact' | 'point', from: any, to: any, enemy?: any, perch?: any };
  stagger: { enemy: any };
  death: { enemy: any };
  /** MP changed. `stasis` is the post-warp lockout. */
  mp: { mp: number, maxMp: number, stasis: boolean };
  combo: { index: number, weapon: string, step?: any };
  parry: { enemy: any, position: THREE.Vector3 };
  link: { enemy: any, ally: any };
  /** The player took damage. */
  playerHit: { enemy: any, damage: number, hp: number, position: THREE.Vector3 };
  /** Weapon swapped into a slot. */
  weapon: { slot: any, kind: string, item?: any };
  /** A weapon materialised out of the armiger. */
  materialise: { position: THREE.Vector3 };
  heavy: { weapon: string };
  dodge: Record<string, never>;
  armiger: { duration: number };
  armigerDenied: { gauge: number, mp: number };
  /** A spell detonated. */
  spell: { element: string, position: THREE.Vector3, reaction?: any, radius: number };
  castSpell: { slot: any, spell: any, remaining: number, position: THREE.Vector3, damage: number };
  draw: any;
  shot: { position: THREE.Vector3 };
  rested: any;
}

/** Any name `CombatSystem.on()` and `.emit()` accept. */
export type CombatEventName = keyof CombatEvents;

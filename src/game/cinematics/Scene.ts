import type * as THREE from 'three';
import type { Game } from '../Game.ts';
import type { Stage } from './Stage.ts';
import type { Letterbox } from './Letterbox.ts';
import type { Cinematics } from './Cinematics.ts';
import type { Frame } from './CameraMove.ts';
import type { EASE } from './Easing.ts';
import type { Terrain } from '../../world/Terrain.ts';
import type { Props } from '../../world/Props.ts';
import type { Sky } from '../../world/Sky.ts';
import type { VFX } from '../../combat/VFX.ts';
import type { AudioSystem } from '../../audio/AudioSystem.ts';
import type { RpgSystem } from '../rpg/RpgSystem.ts';
import type { MusicStateName } from '../../audio/Themes.ts';

/**
 * The contract between the cutscene runtime and the authored scenes.
 *
 * `story/scenes/*.ts` are plain data with four hooks, and `SceneKit.ts` is a
 * dozen helpers all of which take the same first argument. That argument used
 * to be `ctx: any` in about thirty places, which is why nothing ever noticed
 * that the staging context and the scene definition were never written down.
 * They are written down here, once.
 */

/* ------------------------------------------------------------------------ */
/* Vocabulary                                                                */
/* ------------------------------------------------------------------------ */

/** The four staged characters. `Stage._bind` binds exactly these. */
export type ActorId = 'noctis' | 'gladio' | 'ignis' | 'prompto';

/** A held cinematic pose, keyed in `Poses.ts`. */
export type { PoseName } from './Poses.ts';

/** A curve name in `Easing.ts`. */
export type EaseName = keyof typeof EASE;

/**
 * Anything a scene can be staged against: a straight {@link Frame} or the
 * road-following `RoadPath`. Both speak the same "metres forward / metres left
 * / metres up" vocabulary, which is the whole point of having two of them.
 */
export interface StageFrame {
  origin: THREE.Vector3;
  fwd: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  /** Yaw that faces an actor's +Z axis along the scene axis. */
  readonly yaw: number;
  /**
   * `RoadPath` only: the yaw of the road `f` metres along it. A straight
   * `Frame` has one yaw everywhere, so it does not declare this and callers
   * fall back to {@link yaw}.
   */
  yawAt?(f: number): number;
  /** Built surface the frame is pinned to; null/absent means "ask the terrain". */
  floor?: number | null;
  /** A world point `[x, y, z]` from scene-local metres. */
  at(f: number, r: number, u?: number): number[];
  /** {@link at}, snapped to the floor or the terrain, plus `u` metres. */
  ground(terrain: Terrain | null | undefined, f: number, r: number, u?: number): number[];
  /** `Vector3` form of {@link at}. */
  vec(f: number, r: number, u?: number): THREE.Vector3;
}

/* ------------------------------------------------------------------------ */
/* Camera set-ups                                                            */
/* ------------------------------------------------------------------------ */

/** One keyframe of a camera move. Positions are `[x, y, z]` world metres. */
export interface ShotKey {
  /** Seconds into the shot; omitted keys are spread evenly across it. */
  t?: number;
  pos: number[];
  target: number[];
  fov?: number;
  /** Dutch roll, radians. */
  roll?: number;
  ease?: EaseName;
}

/**
 * What the camera does between two cuts, as authored. `new Shot(def)` turns
 * one of these into the sampler that runs it.
 */
export interface ShotDef {
  /** Scene time this set-up starts and ends. */
  t0: number;
  t1: number;
  keys: ShotKey[];
  fov?: number;
  handheld?: number;
  breathe?: number;
  /** `'auto'` = focus the look-at; a number is metres; a name is an actor's eyes. */
  focus?: number | 'auto' | ActorId;
  fStop?: number;
  /** Live aim: one actor, several (their centroid), or `'crew'` for everyone. */
  aim?: ActorId | ActorId[] | 'crew' | null;
  /** Metres above the staged foot position the live aim resolves to. */
  aimU?: number;
  seed?: number;
  ease?: EaseName;
  spline?: boolean;
  label?: string;
}

/* ------------------------------------------------------------------------ */
/* Cues                                                                      */
/* ------------------------------------------------------------------------ */

/**
 * One timed event on a scene's timeline. Every field is optional and any of
 * them may be combined on a single cue; `Cinematics._cue` runs them in order.
 */
export interface Cue<D extends SceneData = SceneData> {
  /** Scene time, seconds. */
  t: number;
  /**
   * Dropped by a skip. Purely presentational cues (subtitles) are; cues that
   * change the world are not, which is what makes a skip land in the same
   * state as watching.
   */
  presentational?: boolean;
  /** Arbitrary side-effect. `skipping` is true when the play-head is being run out. */
  fn?(ctx: SceneCtx<D>, skipping: boolean): void;
  /** `[speaker, line]`; a null speaker is narration. */
  say?: [string | null, string];
  /** Seconds the subtitle holds. */
  dur?: number;
  clearLine?: boolean;
  /** Letterbox bar height, 0..1. */
  bars?: number;
  fade?: { to?: number, dur?: number, colour?: 'black' | 'white' };
  area?: { name: string, sub?: string, meta?: string };
  chapter?: { n: number, name: string, sub?: string, kind?: 'open' | 'complete' };
  objective?: { title: string, sub: string };
  slowmo?: { scale?: number, dur?: number };
  /** Camera trauma, 0..1. */
  shake?: number;
  sfx?: string;
  sfxAt?: THREE.Vector3 | null;
  sfxOpts?: Record<string, number>;
  /** Music state handed to `AudioSystem.setState`. */
  music?: MusicStateName;
}

/** A cue the timeline has taken ownership of. `fired` is its idempotence guard. */
export type LiveCue<D extends SceneData = SceneData> = Cue<D> & { fired: boolean };

/* ------------------------------------------------------------------------ */
/* Context                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * The Regalia as a cutscene borrowed it, so `releaseCar` can put it back.
 *
 * The two arms are not decoration: `simVisible` is only ever read to restore
 * `sim.visible`, so it exists exactly when `sim` does.
 */
export type CarHold = {
  car: THREE.Object3D;
  pos: THREE.Vector3;
  rot: THREE.Euler;
  visible: boolean;
} & (
  { sim: THREE.Object3D, simVisible: boolean } | { sim: null, simVisible: null }
);

/**
 * A scene's scratchpad: one object per playthrough, created by
 * `Cinematics.play` and handed to every hook of that scene.
 *
 * The base declares only what the *kit* writes. A scene that keeps more state
 * extends this with its own interface and takes a `SceneCtx<ItsOwnData>`, so
 * one scene cannot read a field another one happened to invent.
 */
export interface SceneData {
  /** Written by `takeCar`, consumed by `releaseCar`. Not a scene's to set. */
  _car?: CarHold | null;
  /** The staging frame, resolved once in `stage()` and read by everything else. */
  F?: StageFrame;
}

/**
 * Everything a scene is handed. The systems are looked up once, at `play()`
 * time, and are `undefined` when that system is not registered -- which is the
 * honest shape, because a capture harness can drive a scene on a partial world.
 */
export interface SceneCtx<D extends SceneData = SceneData> {
  game: Game;
  stage: Stage;
  cine: Cinematics;
  terrain: Terrain | undefined;
  props: Props | undefined;
  rpg: RpgSystem | undefined;
  sky: Sky | undefined;
  audio: AudioSystem | undefined;
  vfx: VFX | undefined;
  box: Letterbox;
  /** The frame constructor, so a scene need not import it. */
  Frame: typeof Frame;
  /** @see SceneData */
  data: D;
}

/* ------------------------------------------------------------------------ */
/* Scene definition                                                          */
/* ------------------------------------------------------------------------ */

/**
 * An authored cutscene. `story/scenes/*.ts` each export one of these.
 *
 * `buildShots` exists rather than a plain `shots` list because camera
 * keyframes are written in scene-local metres against a frame that only
 * `stage()` can resolve from the live world -- so the set-ups have to be built
 * after staging, every time the scene is played.
 */
export interface SceneDef<D extends SceneData = SceneData> {
  id: string;
  chapter?: number;
  /** Letterbox bar height at the top of the scene, 0..1. */
  letterbox?: number;
  openFromBlack?: boolean;
  /** Seconds the closing fade takes. */
  closeFadeOut?: number;
  /** Seconds; derived from the last shot and cue when absent. */
  duration?: number;
  /** Put the actors back where they started on `stop()`. */
  restorePositions?: boolean;
  skippable?: boolean;
  stage?(ctx: SceneCtx<D>): void;
  buildShots?(ctx: SceneCtx<D>): ShotDef[];
  /** Static set-ups, for a scene that needs no staged frame. */
  shots?: ShotDef[];
  cues?: Cue<D>[];
  tick?(t: number, dt: number, ctx: SceneCtx<D>): void;
  onStart?(ctx: SceneCtx<D>): void;
  onEnd?(ctx: SceneCtx<D>, skipped: boolean): void;
}

/** What `Cinematics.play()` resolves with. */
export interface SceneResult {
  skipped: boolean;
  id: string | null;
}

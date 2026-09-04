import type { EaseName } from '../../game/cinematics/Scene.ts';

/**
 * Shared shapes for the trailer tools.
 *
 * Data only -- no functions, no classes. That is load-bearing: a `ClipSpec`
 * crosses into the page through `page.evaluate`, which structured-clones its
 * argument, so anything that is not plain data arrives as `undefined` and the
 * failure looks like a camera that did not move.
 */

/** A camera keyframe, in the shape `cinematics/CameraMove.ts` reads. */
export interface MoveKey {
  /** Seconds into the clip. */
  t: number;
  /** World position. Omitted on a key means "the staged camera position". */
  pos?: [number, number, number];
  /** Look-at point. Omitted means "the staged look-at". */
  target?: [number, number, number];
  fov?: number;
  roll?: number;
  ease?: EaseName;
}

/**
 * A camera move expressed as deltas off the staged framing.
 *
 * Deltas rather than absolute coordinates because most clips start from a
 * named corpus shot -- and half of those are `follow:` shots whose position is
 * derived from the player at stage time and is not knowable when the spec is
 * written. A delta survives that; an absolute coordinate does not.
 */
export interface Move {
  /** Camera offset at t=0, metres, world axes. */
  from?: [number, number, number];
  /** Camera offset at t=dur. */
  to?: [number, number, number];
  /** Look-at offset at t=0. */
  lookFrom?: [number, number, number];
  /** Look-at offset at t=dur. */
  lookTo?: [number, number, number];
  /** FOV at t=0 and t=dur; omitted keeps the shot's own. */
  fov?: [number, number];
  /** 0 = locked-off tripod, 1 = shoulder-mounted. */
  handheld?: number;
  /** Sub-hertz boom drift. Even a static shot in a real film has it. */
  breathe?: number;
  ease?: EaseName;
  /** Dutch roll, radians, at t=dur. */
  roll?: number;
}

/** One recorded take. */
export interface ClipSpec {
  /** Unique; becomes the filename. */
  id: string;
  /** Body seconds. */
  dur: number;
  /** A named shot from `Shots.ts`, or an inline shot object for `__probe`. */
  shot?: string | Record<string, unknown>;
  /** Override the shot's time-of-day, hours. Act II is re-timed to dusk. */
  time?: number;
  /** Show the field/combat HUD. Default false -- a trailer has no HUD. */
  hud?: boolean;
  /** Let the encounter loop run, so enemies actually fight. */
  live?: boolean;
  move?: Move;
  /** Piecewise `game.time.scale` ramp, for slow-mo beats. */
  timeScale?: Array<{ t: number, s: number }>;
  /** Seconds to settle before rolling. Streaming-heavy shots want more. */
  settle?: number;
  /** Free-text note, carried into the manifest. */
  doc?: string;
}

export interface TrailerSpec {
  version: 1;
  clips: ClipSpec[];
}

/** What one attempt at a take measured. */
export interface TakeReport {
  id: string;
  attempt: number;
  ok: boolean;
  why?: string;
  mime?: string;
  bytes?: number;
  frames?: number;
  fps?: number;
  /** Deltas over 24 ms -- a genuinely dropped vsync at 60 Hz. */
  hitch?: number;
  /** Deltas over 20 ms -- the soft signal that a take is on the edge. */
  long?: number;
  p99?: number;
  file?: string;
}

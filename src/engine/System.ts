import type { Game } from '../game/Game.ts';

/**
 * The lifecycle every registered system implements. All four are optional --
 * a system that only builds content at boot implements `init` alone.
 *
 * `update` runs the simulation; `lateUpdate` runs after every transform for
 * the frame is final, which is where the camera, the HUD and culling belong.
 * `resetClock` is called before a deterministic capture: anything phased off
 * wall time rewinds so the same shot renders the same frame whether it is
 * taken alone or sixth in a batch.
 */
export interface System {
  /**
   * The return value is ignored -- `unknown` rather than `void` because
   * several systems end `init` with `return this` for fluency.
   */
  init?(game: Game): unknown;
  update?(dt: number, game: Game): unknown;
  lateUpdate?(dt: number, game: Game): unknown;
  resetClock?(): void;
}

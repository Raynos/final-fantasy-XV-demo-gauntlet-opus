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
  /**
   * Finish any progressive streaming at the camera's current position.
   *
   * Called once from `Game.settle`, after the first frame has moved the camera
   * to the shot. A system that streams against a per-frame time budget is
   * order- and machine-dependent until it is told to converge.
   */
  converge?(): void;
  /**
   * Build now whatever this system would otherwise build lazily.
   *
   * `converge()` finishes streaming at the *current camera*; this is the
   * once-per-page sibling for construction that has nothing to do with where
   * the camera is and everything to do with what has happened before.
   *
   * **Why it exists.** `Enemies.prototype()` builds a species' geometry on
   * first spawn and caches it forever, which is right for a player — a
   * 20-species bestiary should not cost 20 prototypes at boot — and ruinous for
   * a measurement, because whether a prototype exists is then a function of run
   * history. `drawcheck` disagrees with itself on 25 of 142 shots, and nine of
   * those differ by *exactly* +15 calls with `setpiece_deadeye` at -60, which is
   * 4x15: a shared constant across unrelated shots is a thing being present or
   * absent, not noise.
   *
   * Called by the daemon's `/shots` path once per page, never from a player's
   * boot -- the player wants the lazy path and the harness wants determinism,
   * and there is no reason those must be the same choice.
   */
  warmup?(): void;
  /**
   * Return to the state a fresh boot leaves this system in.
   *
   * Called from `Game.reset()`, which is what lets the capture daemon reuse a
   * booted page instead of reloading it -- 1.97 s against 11.1 s, measured. The
   * bar is higher than it looks: whatever this leaves behind will silently
   * appear in some other agent's capture, so a system that carries state across
   * shots (formation, weather, quest flags, a toast) either implements this or
   * is a source of frames that are plausible and wrong.
   *
   * `resetClock` is called BEFORE this, so anything stamping `time.now` stamps
   * zero.
   */
  reset?(): void;
}

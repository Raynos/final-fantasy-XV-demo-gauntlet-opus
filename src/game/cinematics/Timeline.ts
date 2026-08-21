import { Shot } from './CameraMove.ts';

/**
 * A cutscene timeline: an ordered list of camera set-ups plus a list of cues
 * that fire once as the play-head crosses them.
 *
 * The play-head only ever moves forward, and every cue is idempotent-by-guard
 * (`fired`), so *skipping* is just "run the play-head to the end without
 * rendering": the world lands in exactly the state it would have reached if the
 * player had watched the whole thing. That property is worth more than any
 * amount of skip-specific teardown code, because it cannot drift out of sync
 * with the scene as the scene is edited.
 *
 * Cue shapes (all optional, all may be combined on one cue):
 *
 * ```js
 * { t: 4.0, say: ['Prompto', 'So this is the royal send-off.'], dur: 3.2 }
 * { t: 9.5, fn: (ctx) => ctx.game.get('Sky').setTimeOfDay(18.4) }
 * { t: 0.0, fade: { from: 1, to: 0, dur: 1.6 } }
 * { t: 52,  area: { name: 'Leide', sub: 'Chapter I', meta: 'Departure' } }
 * { t: 30,  slowmo: { scale: 0.4, dur: 1.2 } }
 * ```
 */
export class Timeline {
  /**
   * @param def scene definition (see `story/scenes/*`)
   * @param ctx staging context handed to every cue
   */
  constructor(def: any, ctx: any) {
    this.def = def;
    this.ctx = ctx;
    this.t = 0;
    this.duration = def.duration ?? 0;
    this.shots = (def.shots || []).map((s, i) => new Shot({ seed: 7717 + i * 977, ...s }));
    this.cues = (def.cues || []).slice().sort((a, b) => a.t - b.t)
      .map((c) => ({ ...c, fired: false }));
    if (!this.duration) {
      const lastShot = this.shots.length ? this.shots[this.shots.length - 1].t1 : 0;
      const lastCue = this.cues.length ? this.cues[this.cues.length - 1].t : 0;
      this.duration = Math.max(lastShot, lastCue + 3);
    }
    this.shotIndex = -1;
    this.done = false;
  }

  /** The shot covering the play-head, or the last one once it runs off the end. */
  currentShot() {
    for (let i = 0; i < this.shots.length; i++) if (this.shots[i].covers(this.t)) return i;
    return this.shots.length ? this.shots.length - 1 : -1;
  }

  /**
   * Advance the play-head and fire every cue it crossed.
   * @param dt seconds
   * @param run cue executor
   * @returns true if the camera cut this frame
   */
  step(dt: number, run: (cue:any) => void): boolean {
    this.t += dt;
    for (const c of this.cues) {
      if (c.fired || c.t > this.t) continue;
      c.fired = true;
      run(c);
    }
    const idx = this.currentShot();
    const cut = idx !== this.shotIndex;
    this.shotIndex = idx;
    if (this.t >= this.duration) this.done = true;
    return cut;
  }

  /**
   * Run every remaining cue immediately and park the play-head at the end.
   * Cues marked `skippable: false` are the ones that *change the world* — they
   * still run; cues that are purely presentational (`presentational: true`) are
   * dropped so a skip does not spray six subtitles at once.
   */
  fastForward(run: (cue:any) => void) {
    this.t = this.duration;
    for (const c of this.cues) {
      if (c.fired) continue;
      c.fired = true;
      if (c.presentational) continue;
      run(c);
    }
    this.done = true;
  }

  /** Normalised progress, 0..1. */
  get progress() { return this.duration > 0 ? Math.min(1, this.t / this.duration) : 1; }
}

export default Timeline;

import type { Game, SystemKey, SystemRegistry } from '../game/Game.ts';
import type { System } from './System.ts';
import type { WarmupReport } from './PostFX.ts';
/**
 * Boot-time profiler.
 *
 * Every agent on this project pays the page load on every capture, so the load
 * is a first-class performance metric and needs to be measured the same way a
 * frame is. This wraps `Game.add` — which the orchestrator calls immediately
 * before `await sys.init(game)` — so each system's `init()` is timed without
 * `Game.ts` (shared, owned by another workstream) having to change.
 *
 * Results land on `window.BOOT_PROFILE` as
 * `{ marks: [{name, ms}], total, nav }` and are printed by `src/tools/bootprof.mts`.
 */

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Time a named sub-phase of a system's `init()` and fold it into the profile.
 * A no-op cost when nothing is listening, so it is safe to leave in shipping
 * code on the boot path.
 *
 * @param name label, conventionally `System.phase`
 * @param fn work to time; its return value is passed through
 */
export function bootPhase<T>(name: string, fn: () => T): T {
  const t0 = now();
  const r = fn();
  const p = typeof window !== 'undefined' && window.BOOT_PROFILE;
  const done = () => { if (p) p.marks.push({ name: `  ${name}`, ms: +(now() - t0).toFixed(1) }); };
  // A phase that returns a promise is timed to when it settles, not to when it
  // was started -- which is the whole point on an async `init()`.
  if (r instanceof Promise) return r.then((v) => { done(); return v; }) as T;
  done();
  return r;
}

/**
 * Record a duration that was accumulated rather than measured around one call.
 *
 * {@link bootPhase} wraps a single block, which is the right shape for "how
 * long did this step take". It is the wrong shape for a cost spread over a
 * loop — twenty-one tree variants each doing geometry *and* an impostor bake
 * would arrive as twenty-one marks in two interleaved groups, and the question
 * being asked is which of the two groups the time is in.
 *
 * @param name label, conventionally `System.phase`
 * @param ms accumulated milliseconds
 */
export function bootMark(name: string, ms: number) {
  const p = typeof window !== 'undefined' && window.BOOT_PROFILE;
  if (p) p.marks.push({ name: `  ${name}`, ms: +ms.toFixed(1) });
}

/**
 * Install the profiler on a game instance before `init()` is called.
 * @returns the profile record, filled in as boot proceeds
 */
export interface BootProfile {
  /** `performance.timeOrigin` -- the navigation start the marks are relative to. */
  nav: number;
  /** When this module was evaluated, in page time. */
  moduleEval: number;
  /** One entry per timed phase, in the order they finished. */
  marks: { name: string, ms: number }[];
  /** Total `init()` duration, filled in when init resolves. */
  total: number;
  /** Page time at which the game reported ready. */
  ready?: number;
  /** `Warmup`'s report, when the warm-up ran. */
  warmup?: WarmupReport;
}

export function installBootProfile(game: Game): BootProfile {
  const profile: BootProfile = {
    nav: typeof performance !== 'undefined' && performance.timeOrigin ? performance.timeOrigin : 0,
    moduleEval: now(),
    marks: [],
    total: 0,
  };
  if (typeof window !== 'undefined') window.BOOT_PROFILE = profile;

  const add = game.add.bind(game);
  /** Page time the last system's `init()` finished, for the tail mark. */
  let last: number | null = null;
  game.add = <K extends SystemKey>(system: SystemRegistry[K] & System, name?: K): SystemRegistry[K] => {
    const key: string = name || 'anon';
    const sys = add(system, name);
    if (sys && sys.init) {
      const orig = sys.init.bind(sys);
      sys.init = async (g: Game) => {
        const t0 = now();
        try {
          return await orig(g);
        } finally {
          profile.marks.push({ name: key, ms: +(now() - t0).toFixed(1) });
          last = now();
        }
      };
    }
    return sys;
  };

  const init = game.init.bind(game);
  game.init = async () => {
    const t0 = now();
    profile.marks.push({ name: '(page → init)', ms: +(t0 - 0).toFixed(1) });
    const r = await init();
    const end = now();
    if (last != null) profile.marks.push({ name: 'postfx+compile+warmup', ms: +(end - last).toFixed(1) });
    profile.total = +(end - t0).toFixed(1);
    profile.ready = +end.toFixed(1);
    const warm = game.post && game.post.warmupReport;
    if (warm) profile.warmup = warm;
    return r;
  };

  return profile;
}

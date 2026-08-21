/**
 * Boot-time profiler.
 *
 * Every agent on this project pays the page load on every capture, so the load
 * is a first-class performance metric and needs to be measured the same way a
 * frame is. This wraps `Game.add` — which the orchestrator calls immediately
 * before `await sys.init(game)` — so each system's `init()` is timed without
 * `Game.js` (shared, owned by another workstream) having to change.
 *
 * Results land on `window.BOOT_PROFILE` as
 * `{ marks: [{name, ms}], total, nav }` and are printed by `src/tools/bootprof.mjs`.
 */

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Time a named sub-phase of a system's `init()` and fold it into the profile.
 * A no-op cost when nothing is listening, so it is safe to leave in shipping
 * code on the boot path.
 *
 * @param {string} name label, conventionally `System.phase`
 * @param {Function} fn work to time; its return value is passed through
 */
export function bootPhase(name, fn) {
  const t0 = now();
  const r = fn();
  const p = typeof window !== 'undefined' && window.BOOT_PROFILE;
  const done = () => { if (p) p.marks.push({ name: `  ${name}`, ms: +(now() - t0).toFixed(1) }); };
  if (r && typeof r.then === 'function') return r.then((v) => { done(); return v; });
  done();
  return r;
}

/**
 * Install the profiler on a game instance before `init()` is called.
 * @param {object} game
 * @returns {object} the profile record, filled in as boot proceeds
 */
export function installBootProfile(game) {
  const profile = {
    nav: typeof performance !== 'undefined' && performance.timeOrigin ? performance.timeOrigin : 0,
    moduleEval: now(),
    marks: [],
    total: 0,
  };
  if (typeof window !== 'undefined') window.BOOT_PROFILE = profile;

  const add = game.add.bind(game);
  let last = null;
  game.add = (system, name) => {
    const key = name || 'anon';
    const sys = add(system, name);
    if (sys && sys.init) {
      const orig = sys.init.bind(sys);
      sys.init = async (g) => {
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

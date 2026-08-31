/*
 * What does the mount cost in draw calls?
 *
 *   node src/tools/daemon.mts --wait exclusive-free --for 300
 *   node src/tools/probe.mts src/tools/probes/chocobodraws.mts --dirty
 *
 * This lane is the plan's largest named perf risk, so the number has to be an
 * ablation on ONE page and ONE frame rather than two runs compared: A/B/A with
 * the bird's roots toggled, converged first, so nothing is measuring how long
 * the page has run. Draw calls, not milliseconds -- `LANDMINES`' measurement
 * trap is about timing loops, and a call count taken from `renderer.info`
 * after a real `frame()` is not subject to it.
 *
 * **THE FIRST RUN FAILED ITS OWN CONTROL, and that failure is why this probe
 * is shaped the way it is.** The two `away` arms -- the same scene with the
 * same birds hidden, four frames apart -- read **589 and 489**, a drift of 100
 * calls, while `present` read 397 twice. A "cost" of MINUS 142 draw calls is
 * not a result; it is a scene still changing underneath the ablation.
 *
 * Three things were wrong and all three are fixed here:
 *
 * 1. **Four frames after a toggle is a transient.** `LANDMINES` says exactly
 *    this about post passes. Every arm now settles `SETTLE = 30` frames.
 * 2. **The page had not converged before the ablation started.** The old run
 *    mounted and measured 36 frames later, while streaming, LOD and vegetation
 *    were all still resolving along the route the summon had just walked. The
 *    bird now stands still for `WARM = 240` frames -- four seconds of no input
 *    -- before anything is read.
 * 3. **There was no noise floor.** A delta is only meaningful against the
 *    spread of a measurement that changed nothing, so the probe now runs a
 *    **null ablation** first: `NULL_N` reads, `SETTLE` frames apart, toggling
 *    nothing. Its spread is the floor every later difference is judged on, and
 *    it is reported whether or not the verdict needs it.
 *
 * The A/B pairs are then repeated `REPS` times and the spread of each arm is
 * printed rather than a mean of two, so a drifting scene is visible as a
 * drifting arm instead of being folded into an average.
 */
const g = window.GAME;
const out = [];
const cb = g.get('Chocobo');
if (!cb) return 'no Chocobo system';

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus')?.setScreen?.(null);
g.get('HUD')?.setVisible?.(false);
if (g.uiRoot) g.uiRoot.style.display = 'none';
step(30);

const calls = () => { step(1); return g.renderer.info.render.calls; };
const roots = () => {
  const r = cb.bird ? [cb.bird.root] : [];
  for (const f of cb._flock) r.push(f.root);
  return r;
};
const show = (v) => { for (const r of roots()) r.visible = v; };

cb.summon();
for (let i = 0; i < 400 && cb.state === 'arriving'; i++) step();
cb.mount();

/*
 * Converge, and then stand still. `settle()` is `shoot.mts`'s own convergence
 * and it is not enough on its own here: the summon walked the camera 22 m and
 * left a streaming queue behind it, and the old probe read four frames later.
 */
g.settle ? g.settle() : cb.converge();
const WARM = 240, SETTLE = 30, NULL_N = 6, REPS = 4;
step(WARM);

const spread = (xs) => Math.max(...xs) - Math.min(...xs);
const fmt = (xs) => `${xs.join('/')} (mean ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)}, spread ${spread(xs)})`;

// The noise floor: change nothing, measure anyway.
const nul = [];
for (let i = 0; i < NULL_N; i++) { step(SETTLE); nul.push(calls()); }
const floor = spread(nul);

const away = [], present = [];
for (let i = 0; i < REPS; i++) {
  show(false); step(SETTLE); away.push(calls());
  show(true); step(SETTLE); present.push(calls());
}
show(true);

const delta = present.reduce((a, b) => a + b, 0) / REPS - away.reduce((a, b) => a + b, 0) / REPS;
const drift = Math.max(spread(away), spread(present));
out.push(`state ${cb.state}, birds in scene ${roots().length}, warmed ${WARM} frames, ${SETTLE} frames per arm`);
out.push(`null ablation (nothing toggled): ${fmt(nul)}`);
out.push(`away    ${fmt(away)}`);
out.push(`present ${fmt(present)}`);
out.push(`delta ${delta.toFixed(1)} draw calls for ${roots().length} birds; control drift ${drift}, noise floor ${floor}`);
// A difference smaller than twice the worst of (arm spread, null spread) is
// not a difference. The floor is in the test because an arm can be tight by
// luck on four samples while the scene is drifting under all of them.
const bar = Math.max(drift, floor) * 2;
out.push(delta > bar
  ? `MOUNT + FLOCK COST ${delta.toFixed(1)} DRAW CALLS (${(delta / Math.max(1, roots().length)).toFixed(1)} per bird), against a bar of ${bar}`
  : `NO USABLE NUMBER: delta ${delta.toFixed(1)} does not clear ${bar} (drift ${drift}, floor ${floor}). Do not quote this.`);
out.push(`frame with the bird present: ${Math.max(...present)} draw calls (BRIEF budget 800/shot; the four party rigs cost ~34 draws each)`);
return out.join('\n');

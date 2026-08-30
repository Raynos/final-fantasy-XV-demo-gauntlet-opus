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
 * **FIRST RUN FAILED ITS OWN CONTROL, and the failure is the useful part.**
 * The two `away` arms -- the same scene with the same birds hidden, four
 * frames apart -- read **589 and 489**, a drift of 100 calls, while `present`
 * read 397 twice. A "cost" of MINUS 142 draw calls is not a result, it is a
 * scene that is still changing underneath the ablation: streaming, LOD and
 * vegetation are all resolving on the frames this is sampling, and four frames
 * after a toggle is a transient, which is exactly what `LANDMINES`' "toggling
 * one post pass and settling four frames is not an ablation" says.
 *
 * Do not quote a draw cost for the mount from this probe until it settles its
 * own control. What it needs, in order: many more settle frames between the
 * toggle and the read (30+, not 4), several A/B/A repeats with the spread
 * reported rather than a mean of two, and a null ablation -- toggle nothing,
 * measure anyway -- as the noise floor. Only then is a difference meaningful.
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
step(30);
g.settle ? g.settle() : cb.converge();
step(6);

// A / B / A, so a drift between the two arms is visible rather than folded in.
show(false); step(4); const a1 = calls();
show(true); step(4); const b1 = calls();
show(false); step(4); const a2 = calls();
show(true); step(4); const b2 = calls();

const away = (a1 + a2) / 2, present = (b1 + b2) / 2;
out.push(`state ${cb.state}, birds in scene ${roots().length}`);
out.push(`draw calls  away ${a1}/${a2} (mean ${away})   present ${b1}/${b2} (mean ${present})`);
out.push(`A/B/A drift: away ${Math.abs(a2 - a1)}, present ${Math.abs(b2 - b1)}`);
const drift = Math.max(Math.abs(a2 - a1), Math.abs(b2 - b1));
const delta = present - away;
out.push(`delta ${delta} draw calls for ${roots().length} birds`);
// A difference smaller than the control's own drift is not a difference.
out.push(Math.abs(delta) > drift * 2
  ? `MOUNT + FLOCK COSTS ${delta} DRAW CALLS`
  : `NO USABLE NUMBER: control drift ${drift} swamps the delta ${delta}. Do not quote this.`);
out.push(`per bird: ${((present - away) / Math.max(1, roots().length)).toFixed(2)}`);
out.push(`(budget is 800/shot; the four party rigs cost ~34 draws each)`);
return out.join('\n');

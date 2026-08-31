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
 * Three things were wrong, all three are fixed, **and fixing them found the
 * real confound**, which no amount of settling would ever have removed:
 *
 * 1. **Four frames after a toggle is a transient.** `LANDMINES` says exactly
 *    this about post passes. Every arm settles `SETTLE` frames.
 * 2. **The page had not converged before the ablation started.** The bird now
 *    stands still for `WARM = 240` frames before anything is read.
 * 3. **There was no noise floor**, so the probe runs a **null ablation**:
 *    reads `SETTLE` frames apart with nothing toggled.
 *
 * ## What the null ablation found: the shadow cascade schedule
 *
 * With 240 frames of warm-up, 30-frame arms and nothing toggled at all, six
 * reads came back **498 / 393 / 605 / 395 / 500 / 392** — a spread of 213 on a
 * measurement of nothing. Perfectly alternating. And in the A/B loop the two
 * arms were *individually* tight: `away` 589/488/589/490, `present`
 * 395/393/396/396, spread **3**.
 *
 * That is not drift. **The shadow cascades refresh on a rotating schedule** —
 * `probes/npcdraws.mts` says so in its own header — and one read is
 * `SETTLE + 1` = 31 frames, so an A/B pair is 62. Every `away` read therefore
 * landed on the refresh phase and every `present` read on the quiet one, in
 * every repeat, for ever. A tighter arm makes it *worse*: the confound is
 * exactly reproducible, so more repeats buy nothing.
 *
 * The delta this produced was **-144 draw calls for four birds**, which is the
 * same sign and nearly the same magnitude as the first run's -142. Two runs
 * agreeing is what a systematic error looks like.
 *
 * **So a read is not a frame.** It is the mean of `WINDOW = 120` consecutive
 * frames, which is two full 62-frame schedules, so every phase is in every
 * read exactly twice and the arms cannot alias against it. The per-frame
 * census printed first is the evidence for that number: it reports the period
 * the spikes actually come at, so if the schedule is ever retuned the probe
 * says so instead of quietly aliasing again.
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

/**
 * One read: the mean over `WINDOW` consecutive frames.
 *
 * A single frame's `render.calls` is a sample of a periodic signal — see the
 * header — and every fixed settle count aliases against it. Two full schedule
 * periods per read is what makes an arm phase-independent.
 */
const WINDOW = 120;
const calls = (n = WINDOW) => {
  let s = 0;
  for (let i = 0; i < n; i++) { g.frame(1 / 60); s += g.renderer.info.render.calls; }
  return s / n;
};
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
const WARM = 240, SETTLE = 30, NULL_N = 4, REPS = 3;
step(WARM);

const spread = (xs) => Math.max(...xs) - Math.min(...xs);
const fmt = (xs) => `${xs.map((v) => v.toFixed(1)).join('/')} (mean ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)}, spread ${spread(xs).toFixed(1)})`;

/*
 * The census, and it is the evidence for `WINDOW`. Sample every frame for two
 * hundred and report where the spikes fall, so the schedule's period is a
 * measured number in the output rather than an assumption in a comment.
 */
{
  const seq = [];
  for (let i = 0; i < 200; i++) { g.frame(1 / 60); seq.push(g.renderer.info.render.calls); }
  const lo = Math.min(...seq), hi = Math.max(...seq);
  const bar = lo + (hi - lo) * 0.4;
  const at = [];
  for (let i = 1; i < seq.length; i++) if (seq[i] > bar && seq[i - 1] <= bar) at.push(i);
  const gaps = [];
  for (let i = 1; i < at.length; i++) gaps.push(at[i] - at[i - 1]);
  out.push(`per-frame census over 200 frames: ${lo}..${hi} calls, ${at.length} spike onsets, gaps ${gaps.join(',') || 'none'}`);
  out.push(`WINDOW ${WINDOW} frames per read covers ${gaps.length ? (WINDOW / (gaps.reduce((a, b) => a + b, 0) / gaps.length)).toFixed(1) : '?'} schedule periods`);
}

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
out.push(`state ${cb.state}, birds in scene ${roots().length}, warmed ${WARM} frames, ${SETTLE}+${WINDOW} frames per arm`);
out.push(`null ablation (nothing toggled): ${fmt(nul)}`);
out.push(`away    ${fmt(away)}`);
out.push(`present ${fmt(present)}`);
out.push(`delta ${delta.toFixed(1)} draw calls for ${roots().length} birds; control drift ${drift.toFixed(1)}, noise floor ${floor.toFixed(1)}`);
// A difference smaller than twice the worst of (arm spread, null spread) is
// not a difference. The floor is in the test because an arm can be tight by
// luck -- or, as the header records, tight *because* it is phase-locked to the
// thing that is moving.
const bar2 = Math.max(drift, floor) * 2;
out.push(delta > bar2
  ? `MOUNT + FLOCK COST ${delta.toFixed(1)} DRAW CALLS (${(delta / Math.max(1, roots().length)).toFixed(1)} per bird), against a bar of ${bar2.toFixed(1)}`
  : `NO USABLE NUMBER: delta ${delta.toFixed(1)} does not clear ${bar2.toFixed(1)} (drift ${drift.toFixed(1)}, floor ${floor.toFixed(1)}). Do not quote this.`);
out.push(`frame with the bird present: ${Math.max(...present).toFixed(1)} draw calls mean over ${WINDOW} frames (BRIEF budget 800/shot; the four party rigs cost ~34 draws each)`);
return out.join('\n');

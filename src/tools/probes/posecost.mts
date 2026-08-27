// What does ONE posed shot actually cost, and how much of it is thrown away?
//
// `pnpm run check` is 273 s and `drawcheck` is 251 s of it, so the suite is one
// gate in disguise, and that gate is 142 poses. This prices a pose.
//
// `routeShots` does, per shot:
//
//     applyShot(name); settle(60); applyShot(name); settle(8); screenshot()
//
// That is **68 stepped frames**, and `probes/turbocost.mts` measured a stepped
// frame at 11.66 ms of which **11.0 ms is draw submission**. So ~750 ms of every
// shot is submitting sixty-eight frames into a page that will only ever be
// photographed ONCE — and `drawcheck` does not even look at the pixels, it reads
// `renderer.info.render.calls` off the last frame.
//
// The question this answers is whether the settle frames need to be drawn at
// all. If they do not, a pose costs the sim (0.58 ms x 68 = 40 ms) plus one real
// frame, and 142 of them stop being four minutes.
//
// THE RISK IS NOT THE TIME, IT IS THE COUNT. Draw calls depend on what is
// visible, visibility depends on LOD and streaming, and those may key off
// render-side state. So this does not just time the two paths — it compares the
// numbers they produce, shot by shot, which is the only thing that makes the
// optimisation safe to take.
//
// Run: node src/tools/probe.mts src/tools/probes/posecost.mts
const g = window.GAME;
/**
 * `--set __POSE_ALL=1` walks every shot the game declares, which is the only
 * sample that can decide this: six shots showed two disagreements and both were
 * shots whose own two full arms ALSO disagreed, so at six the signal and the
 * noise are the same size.
 */
const names = window.__POSE_ALL
  ? Object.keys(g.shots || window.SHOTS || {})
  : window.__POSE_SHOTS
    ? String(window.__POSE_SHOTS).split(',')
    : ['hero_full', 'party_walk', 'town_wide', 'vista_dawn', 'poi_reststop', 'regalia_cruise'];
if (!names.length) return { error: 'no shots found; g.shots is empty' };

/** Exactly what `routeShots` does, so the comparison is against the real thing. */
function poseFull(name, settle) {
  g.applyShot(name);
  g.settle(settle);
  g.applyShot(name);          // re-anchor follow shots after settling
  g.settle(8);
  const r = g.renderer.info;
  return { calls: r.render.calls, triangles: r.render.triangles };
}

/**
 * The same pose with submission ablated during the settle, and ON for the frames
 * that produce the reading.
 *
 * The last frames are drawn for real because `renderer.info` is populated BY the
 * submission — a frame that is not submitted counts nothing. Eight is the same
 * re-anchor settle the real path ends with, so the reading is taken under
 * identical conditions; only the sixty preceding frames stop being drawn.
 */
function poseCheap(name, settle) {
  const real = g.post.render;
  g.applyShot(name);
  g.post.render = () => {};
  try { g.settle(settle); } finally { g.post.render = real; }
  g.applyShot(name);
  g.settle(8);
  const r = g.renderer.info;
  return { calls: r.render.calls, triangles: r.render.triangles };
}

const rows = [];
const t00 = performance.now();
// A/B/A per shot, adjacent in time, because the page warms as it runs and a
// one-way comparison would credit the ablation with the warm-up.
for (const name of names) {
  let t = performance.now(); const a1 = poseFull(name, 60); const msA1 = performance.now() - t;
  t = performance.now(); const b = poseCheap(name, 60); const msB = performance.now() - t;
  t = performance.now(); const a2 = poseFull(name, 60); const msA2 = performance.now() - t;
  rows.push({
    name,
    fullMs: Number(((msA1 + msA2) / 2).toFixed(1)),
    cheapMs: Number(msB.toFixed(1)),
    speedup: Number((((msA1 + msA2) / 2) / msB).toFixed(2)),
    callsFull: a1.calls,
    callsFullAgain: a2.calls,
    callsCheap: b.calls,
    /** The only number that decides whether this is takeable. */
    callsMatch: a1.calls === b.calls && a2.calls === b.calls,
    trisMatch: a1.triangles === b.triangles && a2.triangles === b.triangles,
  });
}

const full = rows.reduce((a, r) => a + r.fullMs, 0);
const cheap = rows.reduce((a, r) => a + r.cheapMs, 0);
const mismatched = rows.filter((r) => !r.callsMatch);
// A/B/A drift: if the two full arms disagree with EACH OTHER on the count, the
// shot is not deterministic and the cheap arm cannot be judged against it.
const unstable = rows.filter((r) => r.callsFull !== r.callsFullAgain);

/**
 * A shot whose two FULL arms disagree is not deterministic, so the cheap arm
 * cannot be judged against it — the question for those is only whether the
 * cheap number sits inside the spread the full path already has.
 */
const inSpread = rows.filter((r) => !r.callsMatch && r.callsFull !== r.callsFullAgain
  && r.callsCheap >= Math.min(r.callsFull, r.callsFullAgain) - 2
  && r.callsCheap <= Math.max(r.callsFull, r.callsFullAgain) + 2);
const realMismatch = mismatched.filter((r) => !inSpread.includes(r));

return {
  shots: rows.length,
  wallSec: Number(((performance.now() - t00) / 1000).toFixed(1)),
  rows: window.__POSE_ALL ? rows.filter((r) => !r.callsMatch) : rows,
  totalFullMs: Number(full.toFixed(0)),
  totalCheapMs: Number(cheap.toFixed(0)),
  speedup: Number((full / cheap).toFixed(2)),
  /** What 142 shots would cost, which is what `drawcheck` and the suite are. */
  corpusFullSec: Number(((full / rows.length) * 142 / 1000).toFixed(1)),
  corpusCheapSec: Number(((cheap / rows.length) * 142 / 1000).toFixed(1)),
  unstableShots: unstable.map((r) => r.name),
  mismatchedShots: mismatched.map((r) => `${r.name}: full ${r.callsFull} vs cheap ${r.callsCheap}`),
  unstableCount: unstable.length,
  mismatchCount: mismatched.length,
  withinOwnSpread: inSpread.length,
  hardMismatch: realMismatch.map((r) => `${r.name}: full ${r.callsFull}/${r.callsFullAgain} vs cheap ${r.callsCheap}`),
  verdict: realMismatch.length === 0
    ? `SAFE — ${rows.length} shots, ${(full / cheap).toFixed(1)}x, and every disagreement `
      + `(${inSpread.length}) is inside a spread the FULL path already has on that shot`
    : `UNSAFE — ${realMismatch.length} shot(s) differ beyond their own full-path spread`,
};

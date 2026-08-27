// Why does the same pose draw a different number of calls twice in a row?
//
// `drawcheck` gates BRIEF rule 3's draw-call budget with `TOLERANCE = 8`, and it
// **disagrees with itself on 26 of 142 shots by up to 60 calls** on identical
// code and an identical tree (batched-vs-batched null arm, 2026-08-27). A gate
// whose tolerance is an eighth of its own noise cannot detect the regression it
// exists for, and cannot certify that any optimisation is neutral either — which
// is why a 5.7x speedup got reverted on evidence this instrument cannot resolve.
//
// So: before optimising anything else, find out what moves.
//
// `drawcheck.mts`'s own header already documents the suspect. A held pose does
// NOT draw a constant number of calls -- `poi_reststop` goes
//
//     707  855  707  1005  707  855  707  1005
//
// as three shadow cascades refresh on a rotating schedule: near every frame,
// middle every second, far every fourth. The header claims "the capture lands on
// a fixed phase of that cycle, so the figure is deterministic and comparable run
// to run". **That claim is what this probe tests.** If the phase is a function of
// the ABSOLUTE frame counter rather than of frames-since-applyShot, then it
// depends on how many frames the page drew before this shot -- which depends on
// batch size, chunk boundaries, how many shots preceded it, and whether anything
// re-posed. All of which changed tonight.
//
// Three questions, three arms:
//   1. REPEAT   pose the same shot N times back to back. Spread here is noise
//               that has nothing to do with ordering.
//   2. PHASE    pose it N times, stepping ONE extra frame before each pose, so
//               the absolute frame counter lands on every cascade phase. If the
//               counts cycle with period 2 or 4, the cascade schedule is the
//               cause and it is fixable.
//   3. RESET    pose it N times with `resetClock()` first. If that collapses the
//               spread, the fix is one call in `routeShots`.
//
// Run: node src/tools/probe.mts src/tools/probes/drawnoise.mts
//      node src/tools/probe.mts src/tools/probes/drawnoise.mts --set __DN_SHOTS=town_wide,bestiary_mt
const g = window.GAME;
const names = String(window.__DN_SHOTS
  || 'town_wide,town_forecourt,bestiary_mt,landmark_meteor,poi_reststop,menu_gear').split(',');
const N = Number(window.__DN_REPS || 8);

/** Exactly the pose `routeShots` performs, so the numbers are the gate's numbers. */
function pose(n) {
  g.applyShot(n);
  g.settle(60);
  g.applyShot(n);
  g.settle(8);
  return g.renderer.info.render.calls;
}

const spread = (xs) => {
  const u = [...new Set(xs)].sort((a, b) => a - b);
  return { values: u, min: u[0], max: u[u.length - 1], range: u[u.length - 1] - u[0], distinct: u.length };
};

const out = [];
for (const n of names) {
  // 1. REPEAT — back to back, nothing between them.
  const repeat = [];
  for (let i = 0; i < N; i++) repeat.push(pose(n));

  // 2. PHASE — one extra stepped frame before each pose, walking the counter
  //    through every cascade phase. If the schedule is absolute-frame-based the
  //    counts will cycle with a short period.
  const phase = [];
  for (let i = 0; i < N; i++) { for (let k = 0; k < i; k++) g.frame(1 / 60); phase.push(pose(n)); }

  // 3. RESET — zero the clock (and with it anything keyed off `time.frame`)
  //    before each pose. This is the candidate one-line fix.
  const reset = [];
  for (let i = 0; i < N; i++) { g.resetClock(); reset.push(pose(n)); }

  const r = spread(repeat), p = spread(phase), z = spread(reset);
  out.push({
    shot: n,
    repeat: r, phase: p, reset: z,
    /** The reading that matters: does zeroing the clock collapse the spread? */
    resetFixes: z.range < r.range && z.range <= 2,
    phasePeriod: (() => {
      // If the phase arm cycles, report the period that explains it.
      for (const period of [2, 3, 4, 6]) {
        const groups = new Map();
        phase.forEach((v, i) => {
          const k = i % period;
          if (!groups.has(k)) groups.set(k, new Set());
          groups.get(k).add(v);
        });
        if ([...groups.values()].every((s) => s.size === 1)) return period;
      }
      return null;
    })(),
  });
}

const worst = out.reduce((a, b) => (b.repeat.range > a.repeat.range ? b : a), out[0]);
return {
  shots: out.length,
  repsPerArm: N,
  rows: out,
  worstRepeatRange: worst.repeat.range,
  worstShot: worst.shot,
  anyResetFixes: out.filter((r) => r.resetFixes).map((r) => r.shot),
  phasePeriods: out.map((r) => `${r.shot}:${r.phasePeriod ?? '-'}`).join(' '),
  verdict: worst.repeat.range === 0
    ? 'a repeated pose is EXACTLY reproducible — the noise comes from ordering, not the pose'
    : `a repeated pose varies by up to ${worst.repeat.range} calls with nothing between poses `
      + `(${worst.shot}) — the pose itself is not deterministic, against a gate tolerance of 8`,
};

// At what GPU duty cycle does the throttle engage, and does it depend on how
// heavy the frame is?
//
// `perfseries.mts` settled the shape: a static shot holds 3.3-4.6 ms for 200
// consecutive frames if each one is followed by a 10 ms sleep, and ramps to
// ~24 ms at around frame 50 and stays there if it is not. Queue depth is ruled
// out (depth 1 and depth 32 both degrade), the clock is ruled out (a sleep-only
// control is flat at 12 ms), and the game state is ruled out (every renderer
// counter is unchanged across the step). What is left is a sustained-load
// governor, and the only two numbers that matter for the harness are where its
// knee is and whether a lighter frame escapes it.
//
// Part 1 sweeps the sleep after each frame. Part 2 repeats the flat-out case on
// a nearly empty scene: if a 0.5 ms frame degrades by the same factor as a 4 ms
// one, the governor is about elapsed busy time and nothing about our content.
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'party_walk';

const rest = (ms) => new Promise((r) => setTimeout(r, ms));
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

g.resetClock(); g.applyShot(shot); g.settle(40); g.applyShot(shot); g.settle(8);

// 240 frames at each sleep, reporting the first 24 (pre-onset) against the last
// 96 (post-onset, if there is one). A governor shows as the two diverging.
const run = async (sleepMs, frames) => {
  await rest(3000);
  const s = [];
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now();
    g.frame(1 / 60);
    gl.finish();
    s.push(performance.now() - t0);
    if (sleepMs > 0) await rest(sleepMs);
  }
  const early = med(s.slice(0, 24));
  const late = med(s.slice(-96));
  return {
    earlyMs: +early.toFixed(2),
    lateMs: +late.toFixed(2),
    ratio: +(late / early).toFixed(2),
    dutyPct: +((early / (early + sleepMs)) * 100).toFixed(0),
  };
};

const sweep = {};
for (const s of [0, 1, 2, 4, 6, 8, 12, 16]) sweep['sleep' + s] = await run(s, 240);

// --- part 2: the same flat-out run on a near-empty scene ----------------
const hidden = [];
g.scene.traverse((o) => {
  if (o !== g.scene && o.parent === g.scene && o.visible) { o.visible = false; hidden.push(o); }
});
const emptyFlat = await run(0, 240);
const emptyPaced = await run(12, 120);
hidden.forEach((o) => { o.visible = true; });

return {
  shot,
  sweep,
  emptyScene: { flatOut: emptyFlat, paced12ms: emptyPaced, hiddenRoots: hidden.length },
};

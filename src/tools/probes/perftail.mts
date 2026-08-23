// Where do the giant frames come from now that the measurement loop yields?
//
// With the ruler fixed, `party_walk` medians 5.6 ms but its p95 is 68 ms and
// its max 336 ms, and the noise floor grows from 3.4 to 27.6 ms across a
// six-shot run. None of that was visible before, for a structural reason: a
// loop that never returns to the event loop never lets a promise continuation
// run, so streaming, decoding and every other async job in the game was frozen
// for the whole of every measurement. Yielding unfroze them.
//
// The question is whether those frames are a settling transient -- streaming
// catching up on work it was owed -- or a periodic cost the game really pays.
// The first is fixed by warming longer; the second is a finding.
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'party_walk';
const yieldTask = () => new Promise((r) => setTimeout(r, 0));

g.resetClock(); g.applyShot(shot); g.settle(40); g.applyShot(shot); g.settle(8);
await new Promise((r) => setTimeout(r, 400));

// Answer, on the second run of this probe: the big frames come every ~3.3
// frames at 5.4 ms each, which is one every 16.7 ms, which is the browser
// compositing the canvas at 60 Hz. A loop running at 180 fps collides with a
// compositor running at 60 and gets charged for it. So the fix is to run at
// the cadence the game runs at, and this compares the two directly.
const run = async (budgetMs) => {
  const ms = [];
  for (let i = 0; i < 240; i++) {
    gl.finish();
    const t0 = performance.now();
    g.frame(1 / 60);
    gl.finish();
    const dt = performance.now() - t0;
    ms.push(+dt.toFixed(1));
    const spare = budgetMs - (performance.now() - t0);
    if (spare > 0) await new Promise((r) => setTimeout(r, spare)); else await yieldTask();
  }
  return ms;
};
const ms = await run(16.7);
const free = await run(0);

const big = [];
for (let i = 0; i < ms.length; i++) if (ms[i] > 16.7) big.push(i + ':' + ms[i]);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return +s[s.length >> 1].toFixed(2); };
const q = (n) => med(ms.slice(n * 60, n * 60 + 60));

const summarise = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return {
    medianMs: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99), maxMs: s[s.length - 1],
    countOver16ms: xs.filter((x) => x > 16.7).length,
  };
};
return {
  shot,
  paced60Hz: summarise(ms),
  freeRunning: summarise(free),
  pacedMedianByQuarter: [q(0), q(1), q(2), q(3)],
  pacedOverOneFrame: big.slice(0, 24),
};

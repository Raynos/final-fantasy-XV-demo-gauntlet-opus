// How many frames may run back to back between yields before the throttle
// engages? This is the one number the ruler rewrite needs.
//
// Established by `perfknee.mts`: 240 frames with no yield at all ramp from
// 5.2 to 26.2 ms; 240 frames with a 1 ms `setTimeout` after each hold 5.2 ms
// flat. `timeBlock()` in `ruler.mts` renders `warm + n` = 20 frames inside one
// synchronous task, so the question is whether 20 is already over the line.
//
// Each group size gets 320 frames, a 1 ms yield between groups and nothing
// inside one. The yield is outside the timed region, so it costs the reported
// number nothing. Early vs late tells us whether that group size holds.
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'party_walk';

const rest = (ms) => new Promise((r) => setTimeout(r, ms));
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

g.resetClock(); g.applyShot(shot); g.settle(40); g.applyShot(shot); g.settle(8);

const groups = {};
for (const n of [1, 2, 4, 8, 16, 20, 32, 64]) {
  await rest(3000);
  const blocks = [];
  for (let b = 0; b < 320 / n; b++) {
    gl.finish();
    const t0 = performance.now();
    for (let k = 0; k < n; k++) g.frame(1 / 60);
    gl.finish();
    blocks.push((performance.now() - t0) / n);
    await rest(1);
  }
  const q = Math.max(2, blocks.length >> 2);
  groups['n' + n] = {
    earlyMs: +med(blocks.slice(0, q)).toFixed(2),
    lateMs: +med(blocks.slice(-q)).toFixed(2),
    blocks: blocks.length,
  };
}
return { shot, groups };

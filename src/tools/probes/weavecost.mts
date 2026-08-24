/**
 * What the contact-shadow screen-space step cap costs, paired on one boot.
 *
 *   node src/tools/probe.mts src/tools/probes/weavecost.mts
 *
 * `perf.mts` cannot answer this: its own `parseArgs` throws on any unknown
 * `--` flag, and it runs before `harnessArgs` sees the line, so `--build` and
 * `--dirty` are both rejected and it can only ever measure `HEAD`. An A/B would
 * mean committing the pre-fix shader to the shared trunk.
 *
 * So this times the pass itself instead, ABBA, with the shipped-before
 * behaviour available as a runtime knob (`stepPx = 1e9` is exactly the uncapped
 * march). Same boot, same pose, same frame, one uniform apart.
 *
 * Timing follows `perfpasses.mts`: `gl.finish()` either side of the pass's own
 * `render`, and **one frame per task with the rest of the 16.7 ms yielded** —
 * a loop that keeps the GPU busy past one refresh is throttled about five times
 * on this machine and that is what invalidated every perf number this project
 * ever took. See `LANDMINES.md`.
 */
const g = window.GAME;
const gl = g.renderer.getContext();
const p = g.post;
const c = p.contact;

g.resetClock();
g.applyShot('hero_portrait');
g.settle(40);
if (p.dof) p.dof.enabled = false;
await new Promise((r) => setTimeout(r, 400));

const orig = c.render;
let bucket = null;
const samples = { capped: [], uncapped: [] };
c.render = function (...a) {
  if (!this.enabled || !bucket) return orig.apply(this, a);
  gl.finish();
  const t0 = performance.now();
  const r = orig.apply(this, a);
  gl.finish();
  samples[bucket].push(performance.now() - t0);
  return r;
};

const block = async (which, stepPx, n) => {
  c.stepPx = stepPx;
  bucket = null;
  for (let i = 0; i < 8; i++) { g.frame(1 / 60); await new Promise((r) => setTimeout(r, 4)); }  // settle the knob
  bucket = which;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    g.frame(1 / 60);
    const spare = 16.7 - (performance.now() - t0);
    await new Promise((r) => setTimeout(r, spare > 0 ? spare : 0));
  }
  bucket = null;
};

// ABBA, so a monotone drift in the machine cannot be read as an effect.
await block('capped', 6.0, 60);
await block('uncapped', 1e9, 60);
await block('uncapped', 1e9, 60);
await block('capped', 6.0, 60);

c.render = orig;
c.stepPx = 6.0;

const q = (xs, f) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; };
const stat = (xs) => ({ n: xs.length, medianMs: +q(xs, 0.5).toFixed(3), p90Ms: +q(xs, 0.9).toFixed(3) });
return {
  shot: 'hero_portrait',
  capped: stat(samples.capped),
  uncapped: stat(samples.uncapped),
  deltaMs: +(q(samples.capped, 0.5) - q(samples.uncapped, 0.5)).toFixed(3),
};

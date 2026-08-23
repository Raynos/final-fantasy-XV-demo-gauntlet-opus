// Which post pass produces the periodic stall?
//
// `perfablate.mts` put it in the composer chain and nowhere else: disabling
// every intermediate pass takes the share of frames over 16.7 ms from 21% to
// 0% while the calm median moves 4.4 -> 4.3 ms, so the chain is not costing
// throughput, it is costing spikes. Per-pass timing cannot find it, because
// the stall lands on whichever pass happens to be running
// (`perfpasses.mts`). So: turn them off one at a time and watch the spike
// share, which is the only statistic that has responded to anything.
//
// A single pass owning it shows as one row dropping to ~0%. If no single pass
// does but the group does, the cause is the chain's aggregate -- render-target
// footprint or bandwidth -- and that is a different fix.
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'party_walk';

g.resetClock(); g.applyShot(shot); g.settle(40); g.applyShot(shot); g.settle(8);

const measure = async (n) => {
  await new Promise((r) => setTimeout(r, 400));
  const ms = [];
  for (let i = 0; i < (n || 150); i++) {
    gl.finish();
    const t0 = performance.now();
    g.frame(1 / 60);
    gl.finish();
    ms.push(performance.now() - t0);
    const spare = 16.7 - (performance.now() - t0);
    await new Promise((r) => setTimeout(r, spare > 0 ? spare : 0));
  }
  const calm = ms.filter((x) => x <= 16.7).sort((a, b) => a - b);
  const sp = ms.filter((x) => x > 16.7);
  return {
    calmMs: +(calm[calm.length >> 1] || 0).toFixed(2),
    spikePct: Math.round((sp.length / ms.length) * 100),
    worstMs: +Math.max.apply(null, ms).toFixed(1),
  };
};

const passes = g.post.composer.passes;
const named = passes.map((p, i) => i + '.' + (p.constructor && p.constructor.name || 'Pass'));
const rows = [];
rows.push({ off: 'nothing (baseline)', ...await measure() });

for (let i = 1; i < passes.length - 1; i++) {
  const p = passes[i];
  if (!p.enabled) continue;
  p.enabled = false;
  rows.push({ off: named[i], ...await measure() });
  p.enabled = true;
}

rows.push({ off: 'nothing (control)', ...await measure() });
return { shot, enabledPasses: named.filter((_, i) => passes[i].enabled), rows };

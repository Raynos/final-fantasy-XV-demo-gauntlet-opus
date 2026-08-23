// Ablation against the periodic stall, because six probes have now narrowed it
// by elimination and elimination has run out.
//
// The stall is 20-90 ms, hits 3 frames in every 10, is pure CPU-side time
// inside `post.render`, creates no GL resources, survives rendering offscreen,
// attaches to no single composer pass, and coincides with the draw count
// dropping from ~650 to ~420 on a camera that is not moving. Frame-count
// periodicity plus a changing draw count on a static camera is what a
// round-robin shadow-cascade update looks like, so shadows go first, but the
// point of the list is to be wrong cheaply.
//
// Reported per condition: the median calm frame, and the share of frames over
// 16.7 ms. A lever that only moves the median is a throughput win; one that
// moves the spike share is the stall.
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'party_walk';

g.resetClock(); g.applyShot(shot); g.settle(40); g.applyShot(shot); g.settle(8);

const measure = async () => {
  await new Promise((r) => setTimeout(r, 500));
  const ms = [], draws = [];
  for (let i = 0; i < 150; i++) {
    gl.finish();
    const t0 = performance.now();
    g.frame(1 / 60);
    gl.finish();
    ms.push(performance.now() - t0);
    draws.push(g.renderer.info.render.calls);
    const spare = 16.7 - (performance.now() - t0);
    await new Promise((r) => setTimeout(r, spare > 0 ? spare : 0));
  }
  const calm = ms.filter((x) => x <= 16.7).sort((a, b) => a - b);
  const spikes = ms.filter((x) => x > 16.7);
  return {
    calmMs: +(calm[calm.length >> 1] || 0).toFixed(2),
    spikePct: Math.round((spikes.length / ms.length) * 100),
    spikeMedianMs: spikes.length ? +spikes.sort((a, b) => a - b)[spikes.length >> 1].toFixed(1) : 0,
    drawsMin: Math.min.apply(null, draws),
    drawsMax: Math.max.apply(null, draws),
  };
};

const out = [];
out.push({ condition: 'baseline', ...await measure() });

const sky = g.get('Sky');
const csm = sky && sky.csm;
out.push({ condition: 'shadowMap.enabled = false', ...await (async () => {
  g.renderer.shadowMap.enabled = false;
  const r = await measure();
  g.renderer.shadowMap.enabled = true;
  return r;
})() });

if (csm) {
  out.push({ condition: 'csm.update() suppressed', ...await (async () => {
    const orig = csm.update;
    csm.update = () => {};
    const r = await measure();
    csm.update = orig;
    return r;
  })() });
}

const water = g.get('Water');
if (water) {
  out.push({ condition: 'Water disabled', ...await (async () => {
    const was = water.enabled; water.enabled = false;
    const r = await measure();
    water.enabled = was;
    return r;
  })() });
}

out.push({ condition: 'all post passes off but the last', ...await (async () => {
  const ps = g.post.composer.passes;
  const was = ps.map((p) => p.enabled);
  ps.forEach((p, i) => { if (i > 0 && i < ps.length - 1) p.enabled = false; });
  const r = await measure();
  ps.forEach((p, i) => { p.enabled = was[i]; });
  return r;
})() });

out.push({ condition: 'scene emptied (roots hidden)', ...await (async () => {
  const hid = g.scene.children.filter((c) => c.visible);
  hid.forEach((c) => { c.visible = false; });
  const r = await measure();
  hid.forEach((c) => { c.visible = true; });
  return r;
})() });

out.push({ condition: 'baseline again (control)', ...await measure() });
return { shot, out };

/**
 * Does the frame get slower the longer you render the same static shot?
 *
 * `perf.mts` reported its noise floor GROWING inside a single run (3.15 ->
 * 6.62 ms) and `attrib.mts` measured a 12.7 ms base whose own re-baselines
 * later in the same page implied >30 ms. Both are the same symptom seen from
 * different ends. This prints the frame time block by block next to every
 * counter that could plausibly be accumulating, so the carrier names itself
 * instead of being inferred.
 */
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = new URLSearchParams(location.search).get('probeshot') || 'party_walk';

g.resetClock();
g.applyShot(shot);
g.settle(40);
g.applyShot(shot);
g.settle(8);

const rows = [];
const count = () => { let n = 0; g.scene.traverse(() => { n++; }); return n; };

for (let b = 0; b < 24; b++) {
  gl.finish();
  const t0 = performance.now();
  for (let i = 0; i < 16; i++) g.frame(1 / 60);
  gl.finish();
  const ms = (performance.now() - t0) / 16;
  const info = g.renderer.info;
  rows.push([
    String(b).padStart(3),
    ms.toFixed(2).padStart(7),
    (1000 / ms).toFixed(0).padStart(5),
    String(info.render.calls).padStart(6),
    (info.render.triangles / 1e6).toFixed(2).padStart(7),
    String(info.memory.geometries).padStart(6),
    String(info.memory.textures).padStart(6),
    String(info.programs?.length ?? 0).padStart(5),
    String(count()).padStart(7),
  ].join(' '));
}

return ['\nshot=' + shot,
  ' blk      ms   fps  draws  Mtris  geoms  texs  prog  nodes',
  ...rows].join('\n');

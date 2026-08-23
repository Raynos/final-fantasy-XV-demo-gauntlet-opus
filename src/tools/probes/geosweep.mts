// How far can the tree geometry ring go before it costs anything?
//
// `geoRange` 88 -> 170 and `geoBudget` 130 -> 520 measured at +0.0 ms and +3
// draws, so the ring is not yet anywhere near a constraint. This sweeps it,
// with the shipped configuration re-measured between every step so a machine
// that drifts cannot be read as a cost.
//
// The shot is the `shot` constant below; `probe.mts` has no flag for it.
//
//   node src/tools/probe.mts src/tools/probes/geosweep.mts
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'zone_nebulawood';
const trees = g.get('Vegetation').trees;

g.resetClock(); g.applyShot(shot); g.settle(60); g.applyShot(shot); g.settle(8);

// The InstancedMesh capacities cap the sweep, so grow them first: a variant
// that is full falls back to its own impostor and the step measures nothing.
for (const v of trees.variants) {
  const cap = 1200;
  if (v.max >= cap) continue;
  const grow = (mesh, attr) => {
    if (!mesh) return null;
    mesh.instanceMatrix = new (mesh.instanceMatrix.constructor)(new Float32Array(cap * 16), 16);
    mesh.instanceMatrix.setUsage(35048);
    return attr ? new (attr.constructor)(new Float32Array(cap * 3), 3) : null;
  };
  grow(v.wood, null);
  const t = grow(v.leaves, v.leafTint);
  if (t && v.leaves) { v.leafTint = t; v.leaves.geometry.setAttribute('instanceColor', t); }
  v.max = cap;
}

const measure = async () => {
  await new Promise((r) => setTimeout(r, 300));
  const ms = [], draws = [], tris = [];
  for (let i = 0; i < 80; i++) {
    gl.finish();
    const t0 = performance.now();
    g.frame(1 / 60);
    gl.finish();
    ms.push(performance.now() - t0);
    draws.push(g.renderer.info.render.calls);
    tris.push(g.renderer.info.render.triangles);
    const spare = 16.7 - (performance.now() - t0);
    await new Promise((r) => setTimeout(r, spare > 0 ? spare : 0));
  }
  const calm = ms.filter((x) => x <= 16.7).sort((a, b) => a - b);
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  return {
    ms: calm.length ? +calm[calm.length >> 1].toFixed(2) : NaN,
    draws: med(draws), tris: +(med(tris) / 1e6).toFixed(2),
  };
};

const HEAD = [170, 520];
const steps = [HEAD, [210, 800], HEAD, [250, 1200], HEAD, [300, 1800], HEAD];
const lines = [shot];
for (const [range, budget] of steps) {
  trees.geoRange = range;
  trees.geoBudget = budget;
  trees.converge(g.camera.position);
  g.applyShot(shot); g.settle(8);
  const r = await measure();
  lines.push('  geoRange ' + String(range).padStart(3) + '  budget ' + String(budget).padStart(4) +
    '   geo ' + String(trees.geoCount).padStart(4) + '  imp ' + String(trees.impCount).padStart(4) +
    '   ' + String(r.ms).padStart(6) + ' ms  ' + r.draws + ' draws  ' + r.tris + ' M tris');
}
return lines.join('\n');

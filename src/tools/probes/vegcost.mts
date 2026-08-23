// What the wider tree geometry ring actually costs, and which half of the
// pipeline it is spent in.
//
// Raising `Trees.geoRange` 88 -> 170 and `geoBudget` 130 -> 520 took three
// graded shots from ~5 ms to ~15 ms while two others did not move at all. The
// frame is draw-call bound and the ring adds no draws, so the cost is either
// alpha-tested leaf fill in the scene pass or the same triangles going through
// three shadow cascades. This separates them by ablation.
//
//   node src/tools/probe.mts src/tools/probes/vegcost.mts
const g = window.GAME;
const gl = g.renderer.getContext();
const shots = (window.__SHOTS || 'zone_malmalam,zone_fallgrove').split(',');

const trees = g.get('Vegetation').trees;
const geoMeshes = [];
for (const v of trees.variants) { geoMeshes.push(v.wood); if (v.leaves) geoMeshes.push(v.leaves); }
const leafMeshes = trees.variants.filter((v) => v.leaves).map((v) => v.leaves);
const impMeshes = [...trees.impostors.values()].map((r) => r.mesh);

const measure = async () => {
  await new Promise((r) => setTimeout(r, 400));
  const ms = [], draws = [], tris = [];
  for (let i = 0; i < 90; i++) {
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
  const med = (a) => (a.length ? a[a.length >> 1] : NaN);
  return {
    calm: +med(calm).toFixed(2),
    over: +(ms.filter((x) => x > 16.7).length / ms.length).toFixed(2),
    draws: med(draws.slice().sort((a, b) => a - b)),
    tris: med(tris.slice().sort((a, b) => a - b)),
  };
};

const lines = [];
for (const shot of shots) {
  g.resetClock(); g.applyShot(shot.trim()); g.settle(60); g.applyShot(shot.trim()); g.settle(8);
  const conds = [
    ['base', () => {}],
    ['geo casts no shadow', () => { for (const m of geoMeshes) m.castShadow = false; }],
    ['+ leaves hidden', () => { for (const m of leafMeshes) m.visible = false; }],
    ['+ all geo hidden', () => { for (const m of geoMeshes) m.visible = false; }],
    ['+ impostors hidden', () => { for (const m of impMeshes) m.visible = false; }],
    ['shadowMap off', () => { g.renderer.shadowMap.enabled = false; }],
  ];
  lines.push('');
  lines.push('=== ' + shot);
  for (const [name, apply] of conds) {
    apply();
    const r = await measure();
    lines.push('  ' + name.padEnd(22) + String(r.calm).padStart(6) + ' ms   over16 ' +
      r.over + '   draws ' + r.draws + '   tris ' + (r.tris / 1e6).toFixed(2) + ' M');
  }
  // restore
  for (const m of geoMeshes) { m.castShadow = true; m.visible = true; }
  for (const m of leafMeshes) m.visible = true;
  for (const m of impMeshes) m.visible = true;
  g.renderer.shadowMap.enabled = true;
}
return lines.join('\n');

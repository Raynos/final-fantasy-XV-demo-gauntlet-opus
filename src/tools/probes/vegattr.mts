// Attribute the budget lane's spending, one lever at a time, from one page.
//
// `gameplay.mts` came back with every segment +8 to +13 ms -- including
// `menu-open`, which draws a UI screen -- on a machine running three other
// worktrees. A uniform shift on segments that share nothing is a contention
// signature, but the shadow work really could cost a held frame: `maxFar`
// 190 -> 320 with `geoRange` 88 -> 170 puts several hundred more tree
// geometries inside three full-resolution cascades.
//
// So: ABAB over the levers, in one page, on one shot, with the old
// configuration measured between every new one. A machine that is drifting
// moves both sides together; a lever that costs something does not.
//
//   node src/tools/probe.mts src/tools/probes/vegattr.mts
//
// The shot is the `shot` constant below; `probe.mts` has no flag for it.
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'zone_nebulawood';
const sky = g.get('Sky');
const trees = g.get('Vegetation').trees;
const R = 2048;

g.resetClock(); g.applyShot(shot); g.settle(60); g.applyShot(shot); g.settle(8);

const setShadow = (res, far) => {
  sky.cascadeRes = res.slice();
  sky.csm.lights.forEach((l, i) => {
    if (l.shadow.mapSize.x !== res[i]) {
      l.shadow.mapSize.setScalar(res[i]);
      if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
    }
    l.shadow.needsUpdate = true;
  });
  sky.csm.maxFar = far;
  sky.csm.updateFrustums();
};
const setTrees = (range, budget) => {
  trees.geoRange = range;
  trees.geoBudget = budget;
  trees.converge(g.camera.position);
};

const measure = async () => {
  await new Promise((r) => setTimeout(r, 300));
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
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  return {
    ms: calm.length ? +calm[calm.length >> 1].toFixed(2) : NaN,
    over: +(ms.filter((x) => x > 16.7).length / ms.length).toFixed(2),
    draws: med(draws), tris: +(med(tris) / 1e6).toFixed(2),
  };
};

const OLD = ['old', [R, R / 2, R / 2], 190, 88, 130];
const cfgs = [
  OLD,
  ['trees only', [R, R / 2, R / 2], 190, 170, 520],
  OLD,
  ['shadow only', [R, R, R], 320, 88, 130],
  OLD,
  ['both (HEAD)', [R, R, R], 320, 170, 520],
  OLD,
];

const lines = [shot];
for (const [name, res, far, range, budget] of cfgs) {
  setShadow(res, far);
  setTrees(range, budget);
  g.applyShot(shot); g.settle(8);
  const r = await measure();
  lines.push('  ' + name.padEnd(12) + String(r.ms).padStart(6) + ' ms  over16 ' + r.over +
    '  ' + r.draws + ' draws  ' + r.tris + ' M tris');
}
return lines.join('\n');

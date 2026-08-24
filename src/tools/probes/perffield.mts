// perf-r2: how much did one *sample* of the world get more expensive?
//
// Every scatter layer -- grass, scrub, trees, boulders, debris -- decides each
// candidate by asking `Ecology` about the ground under it, and `Ecology` asks
// `Field`. A night that added drainage incision, talus aprons and tarn basins
// to `Field.ts` (+801 lines) would raise the cost of EVERY streamed tile at
// once, which is the shape of the regression: veg, rocks and debris all roughly
// doubled together. This is a per-call microbenchmark, so it can be run against
// an old sha with `--build <ref>` and compared honestly.
const g = window.GAME;
const veg = g.get('Vegetation');
const eco = (veg && veg.ecology) || (g.get("Props") && g.get("Props").ecology);
if (!eco) return { error: 'no Ecology handle' };
const terrain = g.get('Terrain');

const N = 20000;
const xs = new Float64Array(N), zs = new Float64Array(N);
let s = 12345;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
for (let i = 0; i < N; i++) { xs[i] = (rnd() - 0.5) * 3000; zs[i] = (rnd() - 0.5) * 3000; }

const bench = (name, fn) => {
  for (let i = 0; i < 2000; i++) fn(xs[i], zs[i]);          // warm
  const reps = 3, times = [];
  for (let r = 0; r < reps; r++) {
    const t0 = performance.now();
    let acc = 0;
    for (let i = 0; i < N; i++) { const v = fn(xs[i], zs[i]); acc += typeof v === 'number' ? v : 1; }
    times.push(performance.now() - t0);
    if (acc === 1e99) console.log('never');
  }
  times.sort((a, b) => a - b);
  return { name, usPerCall: +(times[1] / N * 1000).toFixed(3) };
};

const rows = [];
const has = (o, k) => o && typeof o[k] === 'function';
if (terrain && has(terrain, 'heightAt')) rows.push(bench('Terrain.heightAt', (x, z) => terrain.heightAt(x, z)));
if (has(eco, 'erosion')) rows.push(bench('eco.erosion', (x, z) => { const e = eco.erosion(x, z); return e.accum; }));
if (has(eco, 'slope01')) rows.push(bench('eco.slope01', (x, z) => eco.slope01(x, z)));
if (has(eco, 'normal')) rows.push(bench('eco.normal', (x, z) => eco.normal(x, z).y));
if (has(eco, 'moisture')) rows.push(bench('eco.moisture', (x, z) => eco.moisture(x, z)));
if (has(eco, 'drainage')) rows.push(bench('eco.drainage', (x, z) => eco.drainage(x, z)));
if (has(eco, 'grassDensity')) rows.push(bench('eco.grassDensity', (x, z) => eco.grassDensity(x, z)));
if (has(eco, 'scrubDensity')) rows.push(bench('eco.scrubDensity', (x, z) => eco.scrubDensity(x, z)));
if (has(eco, 'treeDensity')) rows.push(bench('eco.treeDensity', (x, z) => eco.treeDensity(x, z)));
if (has(eco, 'rockSuit')) rows.push(bench('eco.rockSuit', (x, z) => eco.rockSuit(x, z)));
if (has(eco, 'cleared')) rows.push(bench('eco.cleared', (x, z) => eco.cleared(x, z) ? 1 : 0));
if (has(eco, 'rootBlocked')) rows.push(bench('eco.rootBlocked', (x, z) => eco.rootBlocked(x, z) ? 1 : 0));
if (has(eco, 'siteBlock')) rows.push(bench('eco.siteBlock', (x, z) => eco.siteBlock(x, z)));
if (has(eco, 'poiClear')) rows.push(bench('eco.poiClear', (x, z) => eco.poiClear(x, z)));

// And the whole-tile calls the streamers actually make.
const tile = {};
if (has(eco, 'grassScatter') || has(eco, 'groveScatter')) {
  const timeIt = (name, fn) => {
    fn(); const t0 = performance.now(); let n = 0;
    for (let i = 0; i < 24; i++) { const r = fn(i); n += (r && r.length) || 0; }
    tile[name] = { msPerTile: +((performance.now() - t0) / 24).toFixed(3), items: Math.round(n / 24) };
  };
  if (has(eco, 'groveScatter')) timeIt('groveScatter(64m)', (i = 0) => eco.groveScatter(i * 64, 0, 64, 64, {}));
  if (has(eco, 'scrubScatter')) timeIt('scrubScatter(64m)', (i = 0) => eco.scrubScatter(i * 64, 0, 64, 64, {}));
  if (has(eco, 'rockScatter')) timeIt('rockScatter(64m)', (i = 0) => eco.rockScatter(i * 64, 0, 64, 64, {}));
}
return { rows: rows.sort((a, b) => b.usPerCall - a.usPerCall), tile };

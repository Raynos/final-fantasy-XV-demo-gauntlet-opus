/**
 * Drivability audit for the road network of Lucis.
 *
 *   node src/tools/roadcheck.mjs
 *
 * Builds the real heightfield, then asserts the design contract:
 *   1. every POI marked drivable is within its class `reach` of a road,
 *   2. no road sample exceeds its class grade limit,
 *   3. no corner is tighter than its class minimum radius,
 *   4. every dead end has a turning circle (a `parking` POI on the node),
 *   5. no road surface sits below the water plane,
 *   6. no settlement, haven or camp sits below the water plane.
 *
 * Exits non-zero on any hard failure.
 */
import { Field } from '../src/world/terrain/Field.js';
import { worldMap, WORLD, POI_TYPES } from '../src/world/map/WorldMap.js';

const pad = (s, n) => String(s).padEnd(n);
let fails = 0, warns = 0;
const fail = (m) => { console.log(`  FAIL  ${m}`); fails++; };
const warn = (m) => { console.log(`  warn  ${m}`); warns++; };

console.log('building the field...');
const t0 = Date.now();
const field = new Field(1337);
field.build();
console.log(`built in ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(field.stats));

const g = worldMap.roadGraph;

// ---------------------------------------------------------------- 1. reach
console.log('\n1. drivable POIs reachable by road');
let unreachable = 0;
for (const p of worldMap.pois) {
  const t = POI_TYPES[p.type];
  if (!t || !t.drive) continue;
  const n = g.nearest(p.x, p.z, 900);
  const limit = p.type === 'town' ? 320 : p.type === 'outpost' ? 220 : 90;
  if (!n || n.dist > limit) {
    fail(`${pad(p.name, 32)} ${n ? n.dist.toFixed(0) : '>900'} m from the nearest road (limit ${limit})`);
    unreachable++;
  }
}
console.log(`  ${worldMap.pois.filter((p) => POI_TYPES[p.type].drive).length} drivable POIs, ${unreachable} unreachable`);

// ---------------------------------------------------------------- 2. grades
console.log('\n2. grades');
let worstGrade = { g: 0 };
const gradeFails = [];
for (const e of g.edges) {
  const lim = e.clsDef.maxGrade;
  let over = 0, worst = 0;
  for (let i = 1; i < e.pts.length; i++) {
    const ds = Math.max(0.001, e.pts[i].s - e.pts[i - 1].s);
    const gr = Math.abs(e.pts[i].y - e.pts[i - 1].y) / ds;
    if (gr > worst) worst = gr;
    if (gr > lim * 1.02) over++;
  }
  if (worst > worstGrade.g) worstGrade = { g: worst, e: e.id, lim };
  if (over > 0) gradeFails.push(`${pad(e.id, 40)} ${over} samples over ${(lim * 100).toFixed(0)}% (worst ${(worst * 100).toFixed(1)}%)`);
}
if (gradeFails.length) gradeFails.slice(0, 10).forEach(fail);
console.log(`  worst grade ${(worstGrade.g * 100).toFixed(1)}% on ${worstGrade.e} (limit ${(worstGrade.lim * 100).toFixed(0)}%)`);

// -------------------------------------------------------------- 3. corners
console.log('\n3. corner radii');
let tightest = { r: Infinity };
const cornerFails = [];
for (const e of g.edges) {
  const rr = g.radii(e);
  const lim = e.clsDef.minRadius;
  let bad = 0, minR = Infinity;
  for (let i = 2; i < rr.length - 2; i++) {
    // filter single-sample noise: only flag a corner sustained over 3 samples
    const r = Math.max(rr[i - 1], Math.min(rr[i], rr[i + 1]));
    if (r < minR) minR = r;
    if (r < lim) bad++;
  }
  if (minR < tightest.r) tightest = { r: minR, e: e.id, lim };
  if (bad > 0) cornerFails.push(`${pad(e.id, 40)} ${bad} samples under R${lim} (tightest ${minR.toFixed(0)} m)`);
}
if (cornerFails.length) cornerFails.slice(0, 10).forEach(fail);
console.log(`  tightest sustained corner ${tightest.r === Infinity ? 'none' : tightest.r.toFixed(0) + ' m'} on ${tightest.e} (limit ${tightest.lim})`);

// ------------------------------------------------------------ 4. dead ends
console.log('\n4. turning circles at dead ends');
for (const id of g.deadEnds()) {
  const nd = g.nodes.get(id);
  const near = worldMap.pois.filter(
    (p) => (p.type === 'parking' || p.type === 'town' || p.type === 'outpost')
      && Math.hypot(p.x - nd.x, p.z - nd.z) < 90);
  if (!near.length) fail(`dead end ${id} has no turning circle`);
}
console.log(`  ${g.deadEnds().length} dead ends checked`);

// ----------------------------------------------------------- 5. road level
console.log('\n5. road surface above water');
let drowned = 0, minY = Infinity, minAt = '';
for (const e of g.edges) {
  for (const p of e.pts) {
    const y = field.heightAt(p.x, p.z);
    if (y < minY) { minY = y; minAt = e.id; }
    if (y < WORLD.seaLevel + 0.5) drowned++;
  }
}
if (drowned) fail(`${drowned} road samples at or below the water plane (lowest ${minY.toFixed(1)} m on ${minAt})`);
console.log(`  lowest road surface ${minY.toFixed(1)} m (water at ${WORLD.seaLevel})`);

// ------------------------------------------------------- 6. dry settlements
console.log('\n6. settlements and havens above water');
let wet = 0;
for (const p of worldMap.pois) {
  if (['fishing', 'landmark', 'menace'].includes(p.type)) continue;
  const y = field.heightAt(p.x, p.z);
  if (y < WORLD.seaLevel + 1) { fail(`${pad(p.name, 32)} is under water (${y.toFixed(1)} m)`); wet++; }
}
console.log(`  ${wet} sites under water`);

// ------------------------------------------------------------------ report
console.log('\n--- summary ---');
const cls = {};
for (const e of g.edges) cls[e.cls] = (cls[e.cls] || 0) + e.length;
for (const k of Object.keys(cls)) console.log(`  ${pad(k, 10)} ${(cls[k] / 1000).toFixed(2)} km`);
console.log(`  total      ${(g.totalLength / 1000).toFixed(2)} km over ${g.edges.length} edges / ${g.nodes.size} nodes`);
console.log(`\n${fails} failures, ${warns} warnings`);
process.exit(fails ? 1 : 0);

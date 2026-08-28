// Does anything still grow on a built POI pad?
//
// `handoff/landmarks.md` measured the leak and named its cause: `poiClear` was
// a linear cone whose zero is at the settlement's *catchment* radius, so at the
// pad itself the clearing value is nowhere near 1 -- and grass is the one
// population with no hard reject, only a density multiply and a `d < 0.02`
// cut. Over 4 000 uniform samples per pad, every other population was rejected
// on 100% of the pad and grass passed its gate on 97-99% of it.
//
// This is that measurement, so the fix has a before and an after rather than an
// argument. For every POI type it samples uniformly inside `PoiKits.PAD_R` and
// reports the fraction of samples each population would still place at, plus
// the mean `cleared` value -- which is the number that actually moved.
//
//   node src/tools/probe.mts src/tools/probes/padclear.mts
const g = window.GAME;
const wm = (await import('/world/map/WorldMap.ts')).worldMap;
const { PAD_R } = await import('/world/props/PoiKits.ts');
const eco = g.get('Vegetation').ecology;

const N = 4000;
// Deterministic low-discrepancy disc sampling: the R2 sequence, so two runs of
// this probe on two builds compare the same points and not two random clouds.
const G = 1.32471795724474602596;
const A1 = 1 / G, A2 = 1 / (G * G);

const byType = new Map();
for (const p of wm.pois) {
  const pad = PAD_R[p.type];
  if (!pad) continue;
  let row = byType.get(p.type);
  if (!row) { row = { n: 0, pois: 0, cleared: 0, grass: 0, scrub: 0, tree: 0, pad }; byType.set(p.type, row); }
  row.pois++;
  for (let i = 1; i <= N; i++) {
    const u = (0.5 + A1 * i) % 1, v = (0.5 + A2 * i) % 1;
    const rr = pad * Math.sqrt(u), th = v * Math.PI * 2;
    const x = p.x + rr * Math.cos(th), z = p.z + rr * Math.sin(th);
    row.n++;
    row.cleared += eco.cleared(x, z);
    // The three gates as each population actually applies them. Grass has no
    // hard reject -- a density multiply and a floor -- which is exactly why it
    // was the only one that leaked.
    if (eco.grassDensity(x, z) > 0.02) row.grass++;
    if (eco.scrubDensity(x, z) > 0.02) row.scrub++;
    if (eco.treeDensity(x, z) > 0.02) row.tree++;
  }
}

const lines = ['type        pad_r  POIs   mean cleared   grass%   scrub%   tree%'];
let tn = 0, tg = 0, ts = 0, tt = 0, tc = 0;
for (const [k, r] of [...byType].sort((a, b) => b[1].pad - a[1].pad)) {
  tn += r.n; tg += r.grass; ts += r.scrub; tt += r.tree; tc += r.cleared;
  lines.push(`${k.padEnd(11)} ${String(r.pad).padStart(5)}  ${String(r.pois).padStart(4)}   ` +
    `${(r.cleared / r.n).toFixed(3).padStart(11)}   ` +
    `${(100 * r.grass / r.n).toFixed(1).padStart(6)}   ${(100 * r.scrub / r.n).toFixed(1).padStart(6)}   ` +
    `${(100 * r.tree / r.n).toFixed(1).padStart(5)}`);
}
lines.push('-'.repeat(66));
lines.push(`ALL                ${String([...byType.values()].reduce((a, r) => a + r.pois, 0)).padStart(4)}   ` +
  `${(tc / tn).toFixed(3).padStart(11)}   ${(100 * tg / tn).toFixed(1).padStart(6)}   ` +
  `${(100 * ts / tn).toFixed(1).padStart(6)}   ${(100 * tt / tn).toFixed(1).padStart(5)}`);

// Open country, for scale: the same three gates far from any pad.
let og = 0, os = 0, ot = 0, on = 0;
for (let i = 1; i <= 4000; i++) {
  const u = (0.5 + A1 * i) % 1, v = (0.5 + A2 * i) % 1;
  const x = (u - 0.5) * 7000, z = (v - 0.5) * 7000;
  if (eco.cleared(x, z) > 0.001) continue;
  on++;
  if (eco.grassDensity(x, z) > 0.02) og++;
  if (eco.scrubDensity(x, z) > 0.02) os++;
  if (eco.treeDensity(x, z) > 0.02) ot++;
}
lines.push(`open country (n=${on})            0.000   ${(100 * og / on).toFixed(1).padStart(6)}   ` +
  `${(100 * os / on).toFixed(1).padStart(6)}   ${(100 * ot / on).toFixed(1).padStart(5)}`);

return lines.join('\n');

// perf-r2: what does building one POI kit cost, and where?
//
// `PoiKits.update` builds "at most one POI per frame, nearest first" with no
// time budget at all, and one of those lands at 41-54 ms inside `Props.update`
// on `streaming-traverse` — a straight breach of BRIEF.md rule 3's 33 ms.
// A budget cannot fix an atomic 50 ms unit of work, so the question is what
// inside `_make` is expensive: this times every site, split by kit type, with
// `gradePad`, `WearField.sampleInto` and `PartBuilder.build` timed separately.
const g = window.GAME;
const props = g.get('Props');
const poi = props && props.poiKits;
if (!poi) return { error: 'no PoiKits' };

const sub = {};
const restore = [];
let cur = null;
const wrap = (obj, key, label) => {
  if (!obj || typeof obj[key] !== 'function') return;
  const orig = obj[key];
  restore.push(() => { obj[key] = orig; });
  obj[key] = function (...a) {
    const t0 = performance.now();
    const r = orig.apply(this, a);
    if (cur) cur[label] = (cur[label] || 0) + (performance.now() - t0);
    return r;
  };
};
wrap(poi, '_apron', '_apron');
wrap(poi, '_base', '_base');
wrap(poi, '_yaw', '_yaw');
wrap(poi, '_exclude', '_exclude');
const wear = await import('/world/props/Wear.ts');
const pb = await import('/world/props/PartBuilder.ts');
wrap(wear.WearField.prototype, 'sampleInto', 'WearField.sampleInto');
wrap(pb.PartBuilder.prototype, 'build', 'PartBuilder.build');

// Build every site that is not built yet, timing each.
const rows = [];
const todo = poi.sites.filter((s) => !s.group);
for (const s of todo) {
  cur = {};
  const t0 = performance.now();
  poi._make(s, g);
  const ms = performance.now() - t0;
  rows.push({ id: s.poi.id, type: s.poi.type, ms: +ms.toFixed(1), sub: cur });
  cur = null;
  await new Promise((r) => setTimeout(r, 0));
}
restore.forEach((f) => f());

const q = (xs, p) => { const v = [...xs].sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(v.length * p))]; };
const byType = {};
for (const r of rows) {
  const t = byType[r.type] || (byType[r.type] = { n: 0, ms: [], sub: {} });
  t.n++; t.ms.push(r.ms);
  for (const k of Object.keys(r.sub)) t.sub[k] = +((t.sub[k] || 0) + r.sub[k]).toFixed(1);
}
for (const t of Object.values(byType)) { t.medianMs = +q(t.ms, 0.5).toFixed(1); t.maxMs = +Math.max(...t.ms).toFixed(1); delete t.ms; }
void sub;
return {
  built: rows.length,
  over33: rows.filter((r) => r.ms > 33).length,
  over16: rows.filter((r) => r.ms > 16.7).length,
  medianMs: +q(rows.map((r) => r.ms), 0.5).toFixed(1),
  worst: rows.sort((a, b) => b.ms - a.ms).slice(0, 12),
  byType,
};

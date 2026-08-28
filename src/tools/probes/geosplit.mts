// geometry-bake: inside `Props.poiPrebuild` and `Props.mega`, what is geometry
// generation and what is terrain probing?
//
// A geometry cache can only buy back the part that ends up as vertex bytes.
// `_base`, `_apron`'s grading and `WearField.sampleInto` all read the terrain
// and are what the kit is *placed* by — cacheable only as numbers, not as
// arrays. This times both halves by re-making every prebuilt POI site on a
// throwaway page.
//
//   node src/tools/probe.mts src/tools/probes/geosplit.mts --dirty
const g = window.GAME;
const props = g.get('Props');
const poi = props.poiKits;
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
    const d = performance.now() - t0;
    if (cur) cur[label] = +((cur[label] || 0) + d).toFixed(2);
    sub[label] = +((sub[label] || 0) + d).toFixed(1);
    return r;
  };
};
const pb = await import('/world/props/PartBuilder.ts');
const wear = await import('/world/props/Wear.ts');
wrap(poi, '_base', '_base');
wrap(poi, '_apron', '_apron');
wrap(wear.WearField.prototype, 'sampleInto', 'wear.sampleInto');
wrap(pb.PartBuilder.prototype, 'build', 'PartBuilder.build');

// Re-make each site that boot prebuilt, into a copy so the live world is left
// alone-ish (this page is thrown away either way).
const done = poi.sites.filter((s) => s.group && s.group.children.length);
const rows = [];
const scrap = [];
for (const s of done) {
  const copy = Object.assign(Object.create(Object.getPrototypeOf(s)), s, { group: null });
  cur = {};
  const t0 = performance.now();
  poi._make(copy, g);
  const ms = performance.now() - t0;
  let verts = 0;
  if (copy.group) copy.group.traverse((o) => { if (o.geometry && o.geometry.attributes.position) verts += o.geometry.attributes.position.count; });
  rows.push({ id: s.poi.id, type: s.poi.type, ms: +ms.toFixed(1), verts, sub: cur });
  scrap.push(copy.group);
  cur = null;
}
for (const gr of scrap) if (gr && gr.parent) gr.parent.remove(gr);
restore.forEach((f) => f());

const byType = {};
let total = 0, verts = 0;
for (const r of rows) {
  total += r.ms; verts += r.verts;
  const t = byType[r.type] || (byType[r.type] = { n: 0, ms: 0, verts: 0, sub: {} });
  t.n++; t.ms = +(t.ms + r.ms).toFixed(1); t.verts += r.verts;
  for (const k of Object.keys(r.sub)) t.sub[k] = +((t.sub[k] || 0) + r.sub[k]).toFixed(1);
}
rows.sort((a, b) => b.ms - a.ms);
return {
  sites: rows.length,
  totalMs: +total.toFixed(1),
  verts,
  sub,
  byType,
  slowest: rows.slice(0, 8),
};

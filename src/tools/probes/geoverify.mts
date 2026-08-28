// geometry-bake: does the cache serve EXACTLY what the generator would make?
//
// The correctness argument for a geometry cache cannot be a rendered frame.
// A frame is a lossy, noisy projection of the vertices — two boots of one build
// differ by 1.493/255 before anything changes — and worse, the failure this
// cache can have is SILENT and WELL-FORMED: a stale POI compound is correctly
// wound, contract-clean and standing on a heightfield that has moved. An image
// diff would have to be lucky to see it.
//
// So this compares the arrays, in one page, at one instant: what the cache
// served at boot against what the generator produces when asked again now.
// Byte for byte, every attribute, every index. That is the same standard phase
// 3 held the relief chart to ("Node-baked vs browser-generated: mean 0.000,
// max 0"), and it is stronger than any rendered frame allows.
//
// It is also immune to the thing that made the first attempt at this useless:
// both sides come from the same tree at the same moment, so a co-agent saving a
// file mid-run cannot get between them.
//
//   node src/tools/probe.mts src/tools/probes/geoverify.mts --dirty
const g = window.GAME;
const props = g.get('Props');
const water = g.get('Water');
const terrain = g.get('Terrain');
const pb = await import('/world/props/PartBuilder.ts');
const shore = await import('/world/water/Shore.ts');

/** Byte-compare two BufferGeometries. Returns null when identical. */
const diffGeo = (a, b) => {
  if (!a || !b) return 'one side missing';
  const ka = Object.keys(a.attributes).sort().join(',');
  const kb = Object.keys(b.attributes).sort().join(',');
  if (ka !== kb) return `attributes ${ka} vs ${kb}`;
  for (const k of Object.keys(a.attributes)) {
    const x = a.attributes[k], y = b.attributes[k];
    if (x.itemSize !== y.itemSize) return `${k}.itemSize ${x.itemSize} vs ${y.itemSize}`;
    if (x.array.constructor !== y.array.constructor) return `${k} type ${x.array.constructor.name} vs ${y.array.constructor.name}`;
    if (x.array.length !== y.array.length) return `${k} length ${x.array.length} vs ${y.array.length}`;
    const u = new Uint8Array(x.array.buffer, x.array.byteOffset, x.array.byteLength);
    const v = new Uint8Array(y.array.buffer, y.array.byteOffset, y.array.byteLength);
    for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return `${k} byte ${i}: ${u[i]} vs ${v[i]}`;
  }
  const ia = a.index, ib = b.index;
  if (!!ia !== !!ib) return 'index presence differs';
  if (ia) {
    if (ia.array.constructor !== ib.array.constructor) return `index type ${ia.array.constructor.name} vs ${ib.array.constructor.name}`;
    if (ia.array.length !== ib.array.length) return `index length ${ia.array.length} vs ${ib.array.length}`;
    const u = new Uint8Array(ia.array.buffer, ia.array.byteOffset, ia.array.byteLength);
    const v = new Uint8Array(ib.array.buffer, ib.array.byteOffset, ib.array.byteLength);
    for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return `index byte ${i}: ${u[i]} vs ${v[i]}`;
  }
  return null;
};

/** Every mesh under `root`, keyed by its name. */
const byName = (root) => {
  const m = new Map();
  if (root) root.traverse((o) => { if (o.geometry && o.name) m.set(o.name, o.geometry); });
  return m;
};

const rows = [];
const record = (key, part, verdict, verts) => rows.push({ key, part, verts, ok: verdict === null, why: verdict });

// ---------------------------------------------------------------- shore ----
if (water && water.shore) {
  const specs = water.bodies.map((b) => ({ cx: b.cx, cz: b.cz, w: b.w, d: b.d, level: b.level, name: b.name }));
  const built = shore.buildShoreRibbon(terrain, specs);
  record('water/shore', 'ribbon', diffGeo(water.shore.geometry, built.geometry),
    water.shore.geometry.attributes.position.count);
}

// ----------------------------------------------------------------- mega ----
if (props && props.mega) {
  const live = byName(props.mega.root);
  for (const [fn, name] of [
    ['_dreadnoughtParts', 'dreadnought'], ['_escortParts', 'dropships'],
    ['_capitalParts', 'capital'], ['_meteorParts', 'meteor'], ['_viaductParts', 'viaduct'],
  ]) {
    const B = new pb.PartBuilder();
    props.mega[fn](B);
    for (const { mat, geo } of B.merge()) {
      const key = `${name}_${mat.name}`;
      record(`mega/${name}`, mat.name, diffGeo(live.get(key), geo), geo.attributes.position.count);
    }
  }
}

// ------------------------------------------------------------------ poi ----
// `Props.init` has already called `releaseGeoBake()`, so re-making a site here
// runs the generator for real -- which is the point.
if (props && props.poiKits) {
  const poi = props.poiKits;
  const scrap = [];
  for (const s of poi.sites) {
    if (!s.group || !s.group.children.length) continue;
    const live = byName(s.group);
    const copy = Object.assign(Object.create(Object.getPrototypeOf(s)), s, { group: null });
    poi._make(copy, g);
    scrap.push(copy.group);
    const made = byName(copy.group);
    for (const [key, geo] of made) {
      record(`poi/${s.poi.id}`, key, diffGeo(live.get(key), geo), geo.attributes.position.count);
    }
    // A part the cache served that the generator did not make is just as wrong.
    for (const key of live.keys()) if (!made.has(key)) record(`poi/${s.poi.id}`, key, 'cache has a part the generator does not', 0);
  }
  for (const gr of scrap) if (gr && gr.parent) gr.parent.remove(gr);
}

const bad = rows.filter((r) => !r.ok);
const verts = rows.reduce((a, r) => a + r.verts, 0);
return {
  cacheWasLive: (window.BOOT_PROFILE.marks.find((m) => /poiPrebuild/.test(m.name)) || {}).ms,
  parts: rows.length,
  verts,
  identical: rows.length - bad.length,
  mismatched: bad.length,
  bad: bad.slice(0, 20),
  VERDICT: rows.length === 0 ? 'NOTHING COMPARED — the cache served nothing'
    : bad.length === 0 ? `IDENTICAL — ${rows.length} parts, ${verts} vertices, byte for byte`
      : `MISMATCH — ${bad.length} of ${rows.length}`,
};

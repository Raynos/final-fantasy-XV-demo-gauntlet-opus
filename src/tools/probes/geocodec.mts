// geometry-bake: price the codec before writing it.
//
// The whole question for WS-12a is whether inflating a geometry artifact costs
// less than generating the geometry did. This encodes the live geometry of the
// three bake candidates into one container in the page, gzips it with
// CompressionStream, then decompresses and rebuilds BufferGeometries from it —
// so the inflate cost is measured on the real bytes, in the real browser, with
// no code shipped.
//
//   node src/tools/probe.mts src/tools/probes/geocodec.mts --dirty
const g = window.GAME;
const props = g.get('Props');
const water = g.get('Water');

const collect = (root, tag) => {
  const list = [];
  if (!root) return list;
  const seen = new Set();
  root.traverse((o) => {
    const geo = o.geometry;
    if (!geo || seen.has(geo)) return;
    seen.add(geo);
    list.push({ tag, name: o.name || '?', geo });
  });
  return list;
};
const items = [
  ...collect(props && props.poiKits && props.poiKits.root, 'poi'),
  ...collect(props && props.mega && props.mega.root, 'mega'),
  ...collect(water && water.shore, 'shore'),
];

// ---- encode ----------------------------------------------------------------
const t0 = performance.now();
const entries = [];
const bodies = [];
let off = 0;
for (const { tag, name, geo } of items) {
  const attrs = [];
  for (const [k, a] of Object.entries(geo.attributes)) {
    const arr = a.array;
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    attrs.push({ k, t: arr.constructor.name, i: a.itemSize, n: !!a.normalized, off, len: bytes.byteLength });
    bodies.push(bytes); off += bytes.byteLength;
    // pad to 4 so every view is aligned on rebuild
    const pad = (4 - (off % 4)) % 4;
    if (pad) { bodies.push(new Uint8Array(pad)); off += pad; }
  }
  let idx = null;
  if (geo.index) {
    const arr = geo.index.array;
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    idx = { t: arr.constructor.name, off, len: bytes.byteLength };
    bodies.push(bytes); off += bytes.byteLength;
    const pad = (4 - (off % 4)) % 4;
    if (pad) { bodies.push(new Uint8Array(pad)); off += pad; }
  }
  entries.push({ tag, name, attrs, idx, groups: geo.groups });
}
let header = new TextEncoder().encode(JSON.stringify({ entries }));
if ((8 + header.length) % 4) { const q = new Uint8Array(header.length + (4 - ((8 + header.length) % 4))); q.set(header); q.fill(32, header.length); header = q; }
const raw = new Uint8Array(8 + header.length + off);
new DataView(raw.buffer).setUint32(0, header.length, true);
raw.set(header, 8);
let p = 8 + header.length;
for (const b of bodies) { raw.set(b, p); p += b.length; }
const tEncode = performance.now() - t0;

// ---- gzip ------------------------------------------------------------------
const t1 = performance.now();
const gz = new Uint8Array(await new Response(
  new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const tGzip = performance.now() - t1;

// ---- inflate ---------------------------------------------------------------
const runs = [];
for (let r = 0; r < 3; r++) {
  const t2 = performance.now();
  const back = new Uint8Array(await new Response(
    new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const tInflate = performance.now() - t2;

  const t3 = performance.now();
  const hlen = new DataView(back.buffer, back.byteOffset).getUint32(0, true);
  const hdr = JSON.parse(new TextDecoder().decode(back.subarray(8, 8 + hlen)));
  const base = 8 + hlen;
  const CTOR = { Float32Array, Uint32Array, Uint16Array, Uint8Array, Int16Array, Int8Array };
  const BufferGeometry = items[0].geo.constructor;
  const BufferAttribute = items[0].geo.attributes.position.constructor;
  const out = [];
  for (const e of hdr.entries) {
    const geo = new BufferGeometry();
    for (const a of e.attrs) {
      const C = CTOR[a.t];
      // copy, not view: three uploads and keeps the array, and a 160 MB
      // container held alive by 144 views is not a cache, it is a leak.
      const src = new C(back.buffer, back.byteOffset + base + a.off, a.len / C.BYTES_PER_ELEMENT);
      const arr = new C(src);
      const at = new BufferAttribute(arr, a.i, a.n);
      geo.setAttribute(a.k, at);
    }
    if (e.idx) {
      const C = CTOR[e.idx.t];
      const src = new C(back.buffer, back.byteOffset + base + e.idx.off, e.idx.len / C.BYTES_PER_ELEMENT);
      geo.setIndex(new BufferAttribute(new C(src), 1));
    }
    if (e.groups && e.groups.length) for (const gr of e.groups) geo.addGroup(gr.start, gr.count, gr.materialIndex);
    out.push(geo);
  }
  const tRebuild = performance.now() - t3;
  runs.push({ inflateMs: +tInflate.toFixed(1), rebuildMs: +tRebuild.toFixed(1), n: out.length });
  for (const geo of out) geo.dispose();
}

const byTag = {};
for (const { tag, geo } of items) {
  const t = byTag[tag] || (byTag[tag] = { geos: 0, verts: 0, bytes: 0 });
  t.geos++;
  if (geo.attributes.position) t.verts += geo.attributes.position.count;
  for (const a of Object.values(geo.attributes)) t.bytes += a.array.byteLength;
  if (geo.index) t.bytes += geo.index.array.byteLength;
}
return {
  items: items.length,
  byTag,
  rawMB: +(raw.length / 1e6).toFixed(2),
  gzMB: +(gz.length / 1e6).toFixed(2),
  encodeMs: +tEncode.toFixed(1),
  gzipMs: +tGzip.toFixed(1),
  runs,
  bootMarks: (window.BOOT_PROFILE ? window.BOOT_PROFILE.marks : [])
    .filter((m) => /poiPrebuild|mega|rocks|shore|trees.build|bushes.build|texbake|landmarks/.test(m.name)),
};

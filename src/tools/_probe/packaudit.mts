/*
 * lane13: what is left on the table by `engine/AttrPack.ts`, attribute by
 * attribute, with the reason each byte was NOT packed.
 *
 *   node src/tools/probe.mts src/tools/_probe/packaudit.mts
 */
const g = window.GAME;
const out = [];
const MB = (b) => `${(b / 1e6).toFixed(1)} MB`;

const seen = new Set();
const uses = new Map();
g.scene.traverse((o) => {
  const geo = o.geometry;
  if (!geo || !geo.isBufferGeometry) return;
  uses.set(geo, (uses.get(geo) || 0) + 1);
});

/** name -> { bytes, packable, why: {reason: bytes} } */
const rows = new Map();
const row = (k) => {
  let r = rows.get(k);
  if (!r) { r = { bytes: 0, packable: 0, why: {}, verts: 0 }; rows.set(k, r); }
  return r;
};

const range = (a) => {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < a.length; i++) { const v = a[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
};

let sharedBytes = 0, smallBytes = 0, totalFloat = 0;
for (const [geo, n] of uses) {
  if (seen.has(geo)) continue;
  seen.add(geo);
  const pos = geo.attributes.position;
  const vc = pos ? pos.count : 0;
  for (const [name, a] of Object.entries(geo.attributes)) {
    if (!(a.array instanceof Float32Array)) continue;
    const b = a.array.byteLength;
    totalFloat += b;
    const r = row(`${name}:${a.itemSize}`);
    r.bytes += b; r.verts += a.count;
    if (n > 1) { r.why.shared = (r.why.shared || 0) + b; sharedBytes += b; continue; }
    if (vc < 8000) { r.why.small = (r.why.small || 0) + b; smallBytes += b; continue; }
    const [lo, hi] = range(a.array);
    if (lo >= 0 && hi <= 1) { r.why.u8 = (r.why.u8 || 0) + b; r.packable += b * 0.75; }
    else if (lo >= -1 && hi <= 1) { r.why.i8 = (r.why.i8 || 0) + b; r.packable += b * 0.75; }
    else if (lo >= -32768 && hi <= 32767) { r.why.i16 = (r.why.i16 || 0) + b; r.packable += b * 0.5; }
    else { r.why.wide = (r.why.wide || 0) + b; }
  }
}

out.push(`=== Float32 attributes across ${seen.size} geometries: ${MB(totalFloat)}`);
out.push(`    blocked by "shared geometry" rule : ${MB(sharedBytes)}`);
out.push(`    blocked by MIN_VERTS=8000 rule    : ${MB(smallBytes)}`);
out.push('');
out.push('  attribute        bytes    would-save   breakdown (bytes by verdict)');
const sorted = [...rows].sort((a, b) => b[1].bytes - a[1].bytes);
for (const [k, r] of sorted) {
  const why = Object.entries(r.why).map(([w, b]) => `${w} ${MB(b)}`).join('  ');
  out.push(`  ${k.padEnd(14)} ${MB(r.bytes).padStart(9)}  ${MB(r.packable).padStart(9)}   ${why}`);
}

/* --- what the bake containers still hold ------------------------------ */
out.push('');
try {
  out.push(`geoBakeReady (container still resident): ${String(g.__geoBakeReady ? g.__geoBakeReady() : 'n/a')}`);
} catch (e) { out.push(`bake residency: ${e.message}`); }

return out.join('\n');

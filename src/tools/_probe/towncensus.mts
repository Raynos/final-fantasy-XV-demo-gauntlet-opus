/*
 * lane13 task 40: what the towns are actually made of, and how much of it no
 * camera can reach.
 *
 *   node src/tools/probe.mts src/tools/_probe/towncensus.mts
 *
 * Two classes of unreachable are counted separately because they have
 * different fixes:
 *   - **buried**: every vertex of the triangle is below the site's ground
 *     plane. Nothing above ground can see it and nothing below ground exists.
 *   - **downward**: the triangle's world normal points down past -0.5. A
 *     player is never under a building's floor slab or a canopy's underside
 *     that sits below eye height, so most of this is the bottom face of a
 *     solid the kit lofted as a closed box.
 */
const g = window.GAME;
const props = g.get('Props');
const kits = props && props.poiKits;
const out = [];
const MB = (b) => `${(b / 1e6).toFixed(1)} MB`;
if (!kits) return 'no PoiKits';

/** Apply a 4x4 column-major matrix to (x,y,z), returning the world tuple. */
const xf = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

const census = (site) => {
  const rows = [];
  let verts = 0, bytes = 0, tris = 0, buried = 0, down = 0, under = 0, geos = 0;
  const base = site.group.position.y;
  const seen = new Set();
  site.group.traverse((o) => {
    if (!o.isMesh || !o.geometry || seen.has(o.geometry)) return;
    seen.add(o.geometry);
    const geo = o.geometry;
    geos++;
    const pos = geo.attributes.position;
    let b = 0;
    for (const a of Object.values(geo.attributes)) b += a.array.byteLength;
    if (geo.index) b += geo.index.array.byteLength;
    verts += pos.count; bytes += b;
    const idx = geo.index;
    const nt = idx ? idx.count / 3 : pos.count / 3;
    tris += nt;
    let lb = 0, ld = 0, lu = 0;
    o.updateWorldMatrix(true, false);
    for (let t = 0; t < nt; t++) {
      const a = idx ? idx.getX(t * 3) : t * 3;
      const c = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const d = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      const m = o.matrixWorld.elements;
      const p0 = xf(m, pos.getX(a), pos.getY(a), pos.getZ(a));
      const p1 = xf(m, pos.getX(c), pos.getY(c), pos.getZ(c));
      const p2 = xf(m, pos.getX(d), pos.getY(d), pos.getZ(d));
      if (p0[1] < base && p1[1] < base && p2[1] < base) lb++;
      const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
      const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz) || 1;
      if (ny / len < -0.5) {
        ld++;
        // The defensible subset: a downward face whose HIGHEST vertex is below
        // head height cannot be got under. A canopy soffit, a balcony
        // underside and an arcade ceiling all fail this test and are kept.
        if (Math.max(p0[1], p1[1], p2[1]) < base + 2.0) lu++;
      }
    }
    buried += lb; down += ld; under += lu;
    const at = Object.entries(geo.attributes).map(([k, a]) => `${k}:${a.array.constructor.name.replace('Array', '')}`).join(',');
    rows.push(`      ${String(Math.round(nt)).padStart(8)} tris ${String(pos.count).padStart(8)} verts ${MB(b).padStart(9)}  ${o.name || o.material.name || '(unnamed)'}  buried ${lb} down ${ld} sealed ${lu}  [${at}]`);
  });
  rows.sort();
  return { verts, bytes, tris, buried, down, under, geos, rows };
};

let tv = 0, tb = 0, tt = 0, tbu = 0, td = 0, tu = 0;
for (const s of kits.built) {
  const c = census(s);
  tv += c.verts; tb += c.bytes; tt += c.tris; tbu += c.buried; td += c.down; tu += c.under;
  if (c.verts < 40000) continue;
  out.push(`=== ${s.poi.id} (${s.poi.type})  ${c.geos} geos  ${c.verts} verts  ${MB(c.bytes)}  ${Math.round(c.tris)} tris`);
  out.push(`    unreachable: buried ${c.buried} (${(100 * c.buried / c.tris).toFixed(1)}%)  downward ${c.down} (${(100 * c.down / c.tris).toFixed(1)}%)  sealed-under ${c.under} (${(100 * c.under / c.tris).toFixed(1)}%)`);
  for (const r of c.rows) out.push(r);
}
out.push('');
out.push(`ALL ${kits.built.length} built sites: ${tv} verts, ${MB(tb)}, ${Math.round(tt)} tris`);
out.push(`  buried ${tbu} (${(100 * tbu / tt).toFixed(1)}%)   downward ${td} (${(100 * td / tt).toFixed(1)}%)`);
return out.join('\n');

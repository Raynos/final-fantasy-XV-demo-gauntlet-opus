/*
 * Does a fishing camp stand on the ground and the water it is built over?
 *
 *   node src/tools/probe.mts src/tools/probes/fishdeck.mts
 *
 * **This measures the geometry that was built, not the arithmetic that built
 * it.** The first cut of this probe re-derived `_fishing`'s own
 * `deck = max(1.4, water.level + 1.5 - base)` and reported a `bankAir` off it,
 * which was right until `b648b69` split the bank out of the deck — after which
 * the probe went on printing 4.6-5.3 m of shack float that no longer existed.
 * An instrument that models the code cannot notice the code changing.
 *
 * So: every vertex of the kit is dropped into a 2 m cell, the lowest one in
 * each cell is taken, and that is compared against the surface that cell
 * actually has. `Water` has no single global level (`_waterNear` is the fourth
 * bug that assumption caused), so the surface is asked for locally and the cell
 * is classified by it:
 *
 *   - **dry cell** — drawn ground above the local water. Something standing
 *     here has to reach the ground. `bankAir` is the worst gap, and it is the
 *     shack, the sill, the ramp and the shore piles.
 *   - **wet cell** — drawn ground below it. Something standing here has to
 *     reach at least the *water*: a pile may run down through it, and a moored
 *     boat may float on it, but neither may hang in the air over it.
 *     `waterAir` is the worst gap.
 *
 * A jetty deck 1.5 m proud of its water is correct and reads as 0 here,
 * because the piles under it are what the cell is measured by.
 *
 * `shore` is the nearest point whose ground is within a metre of the local
 * water surface, and its bearing against the yaw the jetty was actually built
 * on. A jetty is built down `_yaw`, which is the nearest ROAD's bearing: where
 * those two disagree the pier runs inland whatever the arithmetic says.
 */
const g = window.GAME;
const props = g.get('Props');
const terrain = g.get('Terrain');
const cell0 = terrain.clipmap ? terrain.clipmap.cell0 : 1.5;
const pk = props.poiKits;
const CELL = 2.0;

for (const s of pk.sites) {
  if (s.group) continue;
  try { pk._make(s, g); } catch (e) { void e; }
}

const V = Object.getPrototypeOf(g.camera.position).constructor;
const v = new V();
const rows = [];
for (const b of pk.built) {
  if (b.poi.type !== 'fishing') continue;
  const p = b.poi;
  const base = b.group.position.y;
  const w = pk._waterNear(p.x, p.z);
  const level = w ? w.level : -1e9;

  // The lowest vertex the kit puts over each 2 m cell of ground.
  b.group.updateMatrixWorld(true);
  const low = new Map();
  b.group.traverse((o) => {
    if (!o.isMesh || !o.geometry || /_shadow$/.test(String(o.name || ''))) return;
    const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld);
      const k = `${Math.round(v.x / CELL)},${Math.round(v.z / CELL)}`;
      const cur = low.get(k);
      if (!cur || v.y < cur.y) low.set(k, { y: v.y, x: v.x, z: v.z });
    }
  });

  let bankAir = -1e9, bankAt = null, wetAir = -1e9, wetAt = null, nDry = 0, nWet = 0;
  for (const c of low.values()) {
    const gy = terrain.drawnHeightAt(c.x, c.z, cell0);
    if (gy >= level) {
      nDry++;
      if (c.y - gy > bankAir) { bankAir = c.y - gy; bankAt = c; }
    } else {
      nWet++;
      if (c.y - level > wetAir) { wetAir = c.y - level; wetAt = c; }
    }
  }

  // Where the water's edge actually is, and whether the jetty points at it.
  let shoreD = null, shoreA = null;
  if (w) {
    for (let r = 2; r <= 200 && shoreD === null; r += 2) {
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * Math.PI * 2;
        const px = p.x + Math.cos(a) * r, pz = p.z + Math.sin(a) * r;
        const h = terrain.drawnHeightAt(px, pz, cell0);
        if (h < level + 0.5 && h > level - 2.5) { shoreD = r; shoreA = a; break; }
      }
    }
  }
  // `_fishing` lays the jetty down local +z, and the group is yawed by `_yaw`.
  const yaw = pk._yaw(p, { next: () => 0 });
  const jetty = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  // local +z maps to world (sin(yaw), cos(yaw)) -> bearing atan2(z, x)
  const jettyA = Math.atan2(Math.cos(yaw), Math.sin(yaw));
  let dA = shoreA === null ? null : shoreA - jettyA;
  if (dA !== null) { while (dA > Math.PI) dA -= Math.PI * 2; while (dA < -Math.PI) dA += Math.PI * 2; }
  void jetty;

  // The worst cell, in the kit's own local frame, so the number names a piece:
  // the shack sits at (3.6, -3.5), the jetty runs +z to 22, the boat is at
  // (-3.4, 13) and the ramp at (0, -2 - run).
  const local = (c) => {
    if (!c) return '-';
    const dx = c.x - p.x, dz = c.z - p.z;
    const cs = Math.cos(-yaw), sn = Math.sin(-yaw);
    return `${Math.round(dx * cs + dz * sn)},${Math.round(-dx * sn + dz * cs)}`;
  };
  const pad = (s, n) => (String(s) + '                    ').slice(0, n);
  rows.push(`${pad(p.id, 20)} base=${pad(base.toFixed(1), 7)} water=${pad(w ? w.level.toFixed(1) : 'none', 7)} `
    + `dist=${pad(w ? w.dist : '-', 4)} bankAir=${pad(nDry ? bankAir.toFixed(2) : '-', 7)}@${pad(local(bankAt), 9)} `
    + `waterAir=${pad(nWet ? wetAir.toFixed(2) : '-', 7)}@${pad(local(wetAt), 9)} `
    + `cells=${pad(nDry + '/' + nWet, 8)} shore=${pad(shoreD === null ? 'none' : shoreD + 'm', 6)} `
    + `offBearing=${dA === null ? '-' : Math.round(dA * 180 / Math.PI) + 'deg'}`);
}
return rows;

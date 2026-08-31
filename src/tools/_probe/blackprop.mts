/*
 * "Untextured pure-black torus and box primitives lying on the ground" — the
 * judge's #2 tell, corroborated by a second lane and a blind playtester.
 *
 *   node src/tools/probe.mts src/tools/_probe/blackprop.mts
 *
 * A proximity walk cannot find it: the props near the party are MERGED, so
 * every child reports its parent group's origin and the whole set comes back at
 * distance 0.0. So this works in the CAMERA's frame instead. For every mesh
 * whose material is dark enough to read black, it walks the merged geometry's
 * own triangles, transforms each centroid to world space, projects it through
 * the live camera, and clusters the ones that land on screen. A merged prop
 * therefore reports its OWN position and size rather than its chunk's origin.
 *
 * `import('three')` does not resolve in a page-evaluated probe (bare specifier,
 * no module graph), so the two classes needed are taken off live instances:
 * `camera.position.constructor` is `Vector3`. `Vector3.project(camera)` is all
 * the projection maths this needs — no Raycaster.
 *
 * `window.__SHOTS` overrides the shot list (comma separated).
 */
const g = window.GAME;
const { SHOTS } = await import('/game/Shots.ts');
const V3 = g.camera.position.constructor;

const names = String(window.__SHOTS || 'party_formation,hud_field,party_walk,party_dawn,poi_reststop,roadside_wreck,south_road_dawn,regalia_road,broken_truck,combat_hud')
  .split(',').map((s) => s.trim()).filter(Boolean);
const LUM_MAX = Number(window.__LUM ?? 0.05);

const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const pathOf = (o) => {
  const parts = [];
  for (let n = o; n; n = n.parent) parts.unshift(n.name || n.type);
  return parts.slice(1).join('/');
};
const matsOf = (o) => (Array.isArray(o.material) ? o.material : [o.material]).filter(Boolean);

const out = [];
for (const name of names) {
  if (!SHOTS[name]) { out.push({ shot: name, error: 'no such shot' }); continue; }
  g.applyShot(name);
  g.settle(40);
  g.applyShot(name);
  g.settle(10);
  const cam = g.camera;
  cam.updateMatrixWorld(true);
  const eye = cam.position.clone();

  /** cluster key -> row */
  const clusters = new Map();
  const a = new V3(), b = new V3(), c = new V3(), ctr = new V3(), pr = new V3();

  g.scene.traverseVisible((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
    const mats = matsOf(o);
    if (!mats.some((m) => m.color && lum(m.color) < LUM_MAX && !m.map)) return;
    const geo = o.geometry;
    const pos = geo.attributes.position;
    const idx = geo.index;
    const nTri = idx ? idx.count / 3 : pos.count / 3;
    if (nTri > 400000) return;
    // material index per triangle, from the merge groups
    const groups = (geo.groups && geo.groups.length) ? geo.groups : null;
    const matAt = (t) => {
      if (!groups) return mats[0];
      for (const gr of groups) if (t * 3 >= gr.start && t * 3 < gr.start + gr.count) return o.material[gr.materialIndex];
      return mats[0];
    };
    const mw = o.matrixWorld;
    const inst = o.isInstancedMesh ? o.count : 1;
    for (let ii = 0; ii < inst; ii++) {
      for (let t = 0; t < nTri; t++) {
        const m = matAt(t);
        if (!m || !m.color || lum(m.color) >= LUM_MAX || m.map) continue;
        const i0 = idx ? idx.getX(t * 3) : t * 3;
        const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(mw);
        b.fromBufferAttribute(pos, i1).applyMatrix4(mw);
        c.fromBufferAttribute(pos, i2).applyMatrix4(mw);
        ctr.set((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3);
        const dist = ctr.distanceTo(eye);
        if (dist > 45) continue;
        pr.copy(ctr).project(cam);
        if (pr.z < -1 || pr.z > 1 || Math.abs(pr.x) > 1 || Math.abs(pr.y) > 1) continue;
        /**
         * Cluster on a 3 m plan grid and NOT on height.
         *
         * The first version keyed on `round(x/2), round(y/2), round(z/2)` and
         * duly reported ONE 0.66 m tyre as two clusters 0.17 m apart, because
         * its centroids straddled y = 5.0. That cost a commit chasing a pair of
         * interpenetrating props that did not exist. Over-merging is the safe
         * direction for "what is that object": two real props in one 3 m cell
         * come back as one row with a bounding box big enough to say so,
         * whereas splitting one prop invents a second.
         */
        const key = `${m.name || m.uuid.slice(0, 6)}@${Math.round(ctr.x / 3)},${Math.round(ctr.z / 3)}`;
        let row = clusters.get(key);
        if (!row) clusters.set(key, row = {
          mat: m.name || '(unnamed)', matType: m.type,
          hex: '#' + m.color.getHexString(), lum: +lum(m.color).toFixed(4),
          rough: m.roughness, metal: m.metalness, vcol: !!m.vertexColors,
          path: pathOf(o), geo: geo.type, cast: o.castShadow, recv: o.receiveShadow,
          tris: 0, near: 1e9,
          min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9],
          sx: [1e9, -1e9], sy: [1e9, -1e9],
        });
        row.tris++;
        if (dist < row.near) row.near = +dist.toFixed(2);
        for (const p of [a, b, c]) {
          row.min[0] = Math.min(row.min[0], p.x); row.max[0] = Math.max(row.max[0], p.x);
          row.min[1] = Math.min(row.min[1], p.y); row.max[1] = Math.max(row.max[1], p.y);
          row.min[2] = Math.min(row.min[2], p.z); row.max[2] = Math.max(row.max[2], p.z);
        }
        row.sx[0] = Math.min(row.sx[0], pr.x); row.sx[1] = Math.max(row.sx[1], pr.x);
        row.sy[0] = Math.min(row.sy[0], pr.y); row.sy[1] = Math.max(row.sy[1], pr.y);
      }
    }
  });

  const rows = [...clusters.values()].map((r) => ({
    mat: r.mat, matType: r.matType, hex: r.hex, lum: r.lum,
    rough: r.rough, metal: r.metal, vcol: r.vcol,
    path: r.path, geo: r.geo, cast: r.cast, recv: r.recv,
    tris: r.tris, near: r.near,
    at: r.min.map((v, i) => +((v + r.max[i]) / 2).toFixed(2)),
    size: r.max.map((v, i) => +(v - r.min[i]).toFixed(2)),
    // fraction of the viewport the cluster's screen bbox covers
    screen: +(((r.sx[1] - r.sx[0]) / 2) * ((r.sy[1] - r.sy[0]) / 2)).toFixed(4),
    ndc: [r.sx[0], r.sy[0], r.sx[1], r.sy[1]].map((v) => +v.toFixed(3)),
  })).sort((x, y) => y.screen - x.screen);

  out.push(`${name}  cam ${cam.position.x.toFixed(0)},${cam.position.y.toFixed(0)},${cam.position.z.toFixed(0)}  ${rows.length} dark clusters`);
  for (const r of rows.slice(0, 10)) {
    out.push(`   ${(r.screen * 100).toFixed(2)}% scr  d=${r.near}m  ndc[${r.ndc.join(' ')}]  ${r.size.join('x')}  ${r.hex} l=${r.lum} r=${r.rough} m=${r.metal}  cast=${r.cast}  ${r.mat}  ${r.path}  @${r.at.join(',')}`);
  }
}
return out.join("\n");

// Where the frame's draw calls actually go, per vegetation ring.
//
// The perf lane established that this game is CPU-submission bound at ~8.7 us
// per draw call and that triangles are close to free. Every LOD range in
// `src/world/veg` is a trade of draw calls against visible quality, so before
// any range moves, this prints the exact currency: how many *visible, in
// frustum* draws and instances each ring contributes to a graded shot, and
// what the whole frame costs beside it.
//
// Run: node src/tools/probe.mts src/tools/probes/vegcensus.mts
//      SHOTS=zone_fallgrove,zone_longwythe node ...
const g = window.GAME;
const list = (window.__SHOTS || 'zone_fallgrove,zone_longwythe,zone_nebulawood,vista_dawn').split(',');

function census(shot) {
  g.applyShot(shot);
  g.settle(70);
  g.applyShot(shot);
  g.settle(6);
  const cam = g.camera;
  cam.updateMatrixWorld(true);
  // Six frustum planes, extracted by hand from the view-projection matrix.
  // `THREE` is not on `window`, and every constructor a probe can reach comes
  // off a live instance -- there is no Frustum instance anywhere in the scene.
  const M = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse);
  const m = M.elements;
  const el = (r, c) => m[c * 4 + r];
  const planes = [];
  for (const [r, sgn] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
    let a = el(3, 0) + sgn * el(r, 0), b = el(3, 1) + sgn * el(r, 1);
    let c = el(3, 2) + sgn * el(r, 2), d = el(3, 3) + sgn * el(r, 3);
    const L = Math.hypot(a, b, c) || 1;
    planes.push([a / L, b / L, c / L, d / L]);
  }
  const inFrustum = (cx, cy, cz, rad) => {
    for (const p of planes) if (p[0] * cx + p[1] * cy + p[2] * cz + p[3] < -rad) return false;
    return true;
  };
  const rows = {};
  g.scene.updateMatrixWorld(true);
  g.scene.traverseVisible((o) => {
    if (!o.isMesh) return;
    // name the owning group: walk up until a named ancestor under the scene
    let p = o, tag = o.name || '?';
    while (p.parent && p.parent !== g.scene) {
      p = p.parent;
      if (p.name) tag = p.name;
    }
    let sub = tag;
    if (o.parent && o.parent.name && o.parent.name !== tag) sub = tag + '/' + o.parent.name;
    else if (o.name && o.name !== tag) sub = tag + '/' + o.name;
    // frustum test on the same bound three.js would use
    let vis = true;
    if (o.frustumCulled) {
      if (o.geometry && !o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const src = o.boundingSphere || o.geometry.boundingSphere;
      if (src) {
        const c = src.center;
        let cx = c.x, cy = c.y, cz = c.z, rad = src.radius;
        if (!o.boundingSphere) {
          const e = o.matrixWorld.elements;
          const x = cx, y = cy, z = cz;
          cx = e[0] * x + e[4] * y + e[8] * z + e[12];
          cy = e[1] * x + e[5] * y + e[9] * z + e[13];
          cz = e[2] * x + e[6] * y + e[10] * z + e[14];
          const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
          rad *= Math.max(sx, sy, sz);
        }
        vis = inFrustum(cx, cy, cz, rad);
      }
    }
    if (!vis) return;
    const n = o.isInstancedMesh ? o.count : 1;
    if (n === 0) return;
    const idx = o.geometry.index;
    const tri = (idx ? idx.count : (o.geometry.attributes.position ? o.geometry.attributes.position.count : 0)) / 3;
    const r = rows[sub] || (rows[sub] = { draws: 0, inst: 0, tris: 0 });
    r.draws += 1;
    r.inst += n;
    r.tris += tri * n;
  });
  const total = { draws: 0, inst: 0, tris: 0 };
  for (const k in rows) { total.draws += rows[k].draws; total.inst += rows[k].inst; total.tris += rows[k].tris; }
  const vegSys = g.get('Vegetation');
  const extra = {};
  if (vegSys) {
    if (vegSys.trees) extra.trees = { geo: vegSys.trees.geoCount, imp: vegSys.trees.impCount, can: vegSys.trees.canCount };
    if (vegSys.bushes) extra.bushes = { n: vegSys.bushes.count, imp: vegSys.bushes.impCount };
    if (vegSys.grass) extra.grass = vegSys.grass.rings.map((r) => ({
      name: r.lod.name, pool: r.pool.size,
      vis: [...r.pool.values()].filter((e) => e.mesh && e.mesh.visible).length,
    }));
  }
  const sorted = Object.entries(rows).sort((a, b) => b[1].draws - a[1].draws);
  const veg = sorted.filter(([k]) => /^(trees|bushes|grass)/.test(k));
  return { shot, total, rows: sorted.slice(0, 6), veg, extra };
}

const lines = [];
for (const s of list) {
  const c = census(s.trim());
  lines.push('');
  lines.push('=== ' + c.shot + '  total ' + c.total.draws + ' draws, ' +
    (c.total.tris / 1e6).toFixed(2) + ' M tris');
  lines.push('  trees geo/imp/can ' + JSON.stringify(c.extra.trees) +
    '  bushes ' + JSON.stringify(c.extra.bushes));
  lines.push('  grass rings ' + c.extra.grass.map((r) => r.name + ' ' + r.vis + '/' + r.pool).join('  '));
  for (const [k, v] of c.veg) {
    lines.push('  VEG ' + String(v.draws).padStart(4) + ' draws ' +
      String(v.inst).padStart(7) + ' inst ' + (v.tris / 1e3).toFixed(0).padStart(7) + ' ktri  ' + k);
  }
  for (const [k, v] of c.rows) {
    lines.push('    ' + String(v.draws).padStart(4) + ' draws ' +
      String(v.inst).padStart(7) + ' inst ' + (v.tris / 1e3).toFixed(0).padStart(7) + ' ktri  ' + k);
  }
}
return lines.join('\n');

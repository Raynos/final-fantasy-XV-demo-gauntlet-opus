/*
 * "What is THAT?" — name whatever is drawn at a screen point, by ancestor path,
 * material and world position.
 *
 *   node src/tools/probe.mts src/tools/_probe/pickat.mts \
 *     --set __SHOT=party_dawn --set __AT=0.35,-0.59
 *
 * `__AT` is NDC (x right, y up, both -1..1) — read it off a capture as
 * `(2*px/w - 1, 1 - 2*py/h)`. Several points may be given, separated by ';'.
 *
 * Why not a Raycaster: `import('three')` does not resolve in a page-evaluated
 * probe (bare specifier, no module graph), and nothing in the game constructs a
 * Raycaster to borrow. `Vector3` off `camera.position.constructor` plus
 * `Vector3.project` is enough — project the three vertices of every triangle and
 * test the point against them in NDC, keeping the nearest. That also survives
 * merged props, which is the whole reason a proximity walk fails here.
 */
const g = window.GAME;
const { SHOTS } = await import('/game/Shots.ts');
const V3 = g.camera.position.constructor;

const shot = String(window.__SHOT || 'party_dawn');
const pts = String(window.__AT || '0,0').split(';').map((s) => s.split(',').map(Number));
if (!SHOTS[shot]) return `no such shot: ${shot}`;
g.applyShot(shot);
g.settle(40);
g.applyShot(shot);
g.settle(10);
const cam = g.camera;
cam.updateMatrixWorld(true);

const pathOf = (o) => {
  const parts = [];
  for (let n = o; n; n = n.parent) parts.unshift(n.name || n.type);
  return parts.slice(1).join('/');
};

const best = pts.map(() => null);
const a = new V3(), b = new V3(), c = new V3();
const wa = new V3(), wb = new V3(), wc = new V3();

g.scene.traverseVisible((o) => {
  if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
  if (o.isInstancedMesh) return;           // handled below by bounding sphere only
  const geo = o.geometry;
  const pos = geo.attributes.position;
  const idx = geo.index;
  const nTri = (idx ? idx.count : pos.count) / 3;
  if (nTri > 300000) return;
  const mw = o.matrixWorld;
  const groups = (geo.groups && geo.groups.length) ? geo.groups : null;
  for (let t = 0; t < nTri; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    wa.fromBufferAttribute(pos, i0).applyMatrix4(mw);
    wb.fromBufferAttribute(pos, i1).applyMatrix4(mw);
    wc.fromBufferAttribute(pos, i2).applyMatrix4(mw);
    a.copy(wa).project(cam); b.copy(wb).project(cam); c.copy(wc).project(cam);
    if (a.z < -1 && b.z < -1 && c.z < -1) continue;
    const minx = Math.min(a.x, b.x, c.x), maxx = Math.max(a.x, b.x, c.x);
    const miny = Math.min(a.y, b.y, c.y), maxy = Math.max(a.y, b.y, c.y);
    for (let k = 0; k < pts.length; k++) {
      const [px, py] = pts[k];
      if (px < minx || px > maxx || py < miny || py > maxy) continue;
      // barycentric in NDC
      const d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) / d;
      const v = ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) / d;
      const w = 1 - u - v;
      if (u < 0 || v < 0 || w < 0) continue;
      const z = u * a.z + v * b.z + w * c.z;
      if (best[k] && best[k].z <= z) continue;
      let m = o.material;
      if (Array.isArray(m)) {
        m = m[0];
        if (groups) for (const gr of groups) {
          if (t * 3 >= gr.start && t * 3 < gr.start + gr.count) { m = o.material[gr.materialIndex]; break; }
        }
      }
      const wp = [
        u * wa.x + v * wb.x + w * wc.x,
        u * wa.y + v * wb.y + w * wc.y,
        u * wa.z + v * wb.z + w * wc.z,
      ];
      best[k] = {
        z, path: pathOf(o), geo: geo.type, tris: nTri,
        mat: (m && m.name) || '(unnamed)', matType: m && m.type,
        hex: m && m.color ? '#' + m.color.getHexString() : null,
        map: !!(m && m.map), vcol: !!(m && m.vertexColors),
        rough: m && m.roughness, metal: m && m.metalness,
        cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder,
        at: wp.map((n) => +n.toFixed(2)),
        dist: +Math.hypot(wp[0] - cam.position.x, wp[1] - cam.position.y, wp[2] - cam.position.z).toFixed(2),
      };
    }
  }
});

const out = [`shot ${shot}  cam ${cam.position.toArray().map((n) => n.toFixed(1)).join(',')}`];
for (const [k, p] of pts.entries()) {
  const r = best[k];
  out.push(r
    ? `  ndc ${p.join(',')} -> ${r.path}\n      mat ${r.mat} (${r.matType}) ${r.hex} map=${r.map} vcol=${r.vcol} rough=${r.rough} metal=${r.metal}\n      cast=${r.cast} recv=${r.recv} order=${r.order}  world ${r.at.join(',')}  d=${r.dist}m`
    : `  ndc ${p.join(',')} -> nothing hit`);
}
return out.join('\n');

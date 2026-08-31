/* Do the city bodies stand ON the plaza deck, or in it?
 *
 * `plaza_down.jpg` (lane 18) shows every Lestallum townsperson cut off at the
 * shin. This asks the geometry rather than the tables: for each body near a
 * city square, where is its root, what does `Npcs._groundAt` say, and what is
 * the highest solid surface actually under its feet?
 */
const g = window.GAME;
const out = [];
const terr = g.get('Terrain');
const player = g.get('Player');
const props = g.get('Props');
const npcs = g.get('Npcs');
const wm = (await import('/world/map/WorldMap.ts')).worldMap;
const kits = props && props.poiKits;
const col = g.get('Collision');
const V3 = g.camera.position.constructor;

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
g.get('Director').play();
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus').setScreen(null); step(10);
if (!kits || !npcs) return 'no PoiKits / Npcs';

const _p = new V3();

/**
 * The surface a person at (x, z) is actually standing on.
 *
 * **A vertex search is not good enough here** and cost the first run of this
 * probe: the plaza disc's top face is a 40-way fan, so its only vertices are
 * the centre and the rim, and a body standing three metres from the middle
 * reads "no surface within 0.7 m" while visibly standing on it. This walks the
 * triangles and asks which one contains (x, z), which is the same question the
 * eye asks of the frame.
 */
const surfaceUnder = (x, z, yTop) => {
  let best = -1e9, who = '';
  const a = new V3(), b = new V3(), c = new V3();
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    if (!o.visible || !o.isMesh || !o.geometry || o.isSkinnedMesh || o.isInstancedMesh) return;
    const n = `${o.name} ${(o.parent && o.parent.name) || ''}`;
    if (/water|grass|veg|sky|cloud|shadow|decal|npc|player|party|rain|fx|noctis|ignis|gladio|prompto|regalia|umbra/i.test(n)) return;
    const pa = o.geometry.getAttribute('position');
    if (!pa) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const bs = o.geometry.boundingSphere;
    if (bs) {
      _p.copy(bs.center).applyMatrix4(o.matrixWorld);
      if (Math.hypot(_p.x - x, _p.z - z) > bs.radius * Math.max(o.scale.x, o.scale.z) + 2) return;
    }
    const idx = o.geometry.getIndex();
    const tri = idx ? idx.count / 3 : pa.count / 3;
    for (let t = 0; t < tri; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.set(pa.getX(i0), pa.getY(i0), pa.getZ(i0)).applyMatrix4(o.matrixWorld);
      b.set(pa.getX(i1), pa.getY(i1), pa.getZ(i1)).applyMatrix4(o.matrixWorld);
      c.set(pa.getX(i2), pa.getY(i2), pa.getZ(i2)).applyMatrix4(o.matrixWorld);
      const lo = Math.min(a.y, b.y, c.y), hi = Math.max(a.y, b.y, c.y);
      if (lo > yTop + 0.25 || hi < yTop - 3) continue;
      if (x < Math.min(a.x, b.x, c.x) || x > Math.max(a.x, b.x, c.x)) continue;
      if (z < Math.min(a.z, b.z, c.z) || z > Math.max(a.z, b.z, c.z)) continue;
      // barycentric in the xz plane
      const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(d) < 1e-9) continue;
      const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
      const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
      const w = 1 - u - v;
      if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
      const y = u * a.y + v * b.y + w * c.y;
      if (y > yTop + 0.25) continue;
      if (y > best) { best = y; who = n.trim(); }
    }
  });
  return { y: best, who };
};

for (const id of ['lestallum', 'galdin_quay']) {
  const poi = wm.poiById(id);
  out.push('');
  out.push(`== ${poi.name} ==`);
  const px = poi.x, pz = poi.z, py = terr.heightAt(px, pz);
  player.root.position.set(px, py, pz);
  g.camera.position.set(px, py + 4, pz + 8);
  g.camera.lookAt(px, py + 1, pz);
  for (let i = 0; i < 200; i++) { player.root.position.set(px, py, pz); step(1); }

  const plaza = kits.anchorAt(id, 'plaza');
  if (!plaza) { out.push('  plaza anchor NULL (site not built)'); continue; }
  const pad = npcs._pads.find((q) => Math.abs(q.x - plaza.x) < 0.01 && Math.abs(q.z - plaza.z) < 0.01);
  out.push(`  plaza anchor y ${plaza.y.toFixed(3)}   terrain ${terr.heightAt(plaza.x, plaza.z).toFixed(3)}   pad ${pad ? `y ${pad.y.toFixed(3)} r ${pad.r}` : 'NOT REGISTERED'}`);
  const c = surfaceUnder(plaza.x, plaza.z, plaza.y + 1.5);
  out.push(`  deck under plaza centre: ${c.y.toFixed(3)}  (${c.who})   anchor is ${(plaza.y - c.y).toFixed(3)} above it`);

  // Party off the square so the companions are not sampled as architecture.
  player.root.position.set(px + 300, terr.heightAt(px + 300, pz), pz);
  step(4);

  const near = npcs.list.filter((n) => Math.hypot(n.pos.x - plaza.x, n.pos.z - plaza.z) < 30);
  out.push(`  ${near.length} bodies within 30 m of the square`);
  for (const n of near.sort((a, b) => a.id.localeCompare(b.id))) {
    // Five samples over the footprint, not one: a plinth edge that runs
    // between a person's boots is the case that reads worst in a frame and the
    // one a single centre sample misses. `+0.9` is the ceiling, so a bench top
    // or an awning above somebody's head is not reported as their ground.
    let d = { y: -1e9, who: '' };
    for (const [ox, oz] of [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
      const q = surfaceUnder(n.pos.x + ox, n.pos.z + oz, n.pos.y + 0.9);
      if (q.y > d.y) d = q;
    }
    const gy = npcs._groundAt(n.pos.x, n.pos.z);
    const bones = n.body.rig && n.body.rig.byName;
    let foot = null;
    if (bones && bones.footL) { bones.footL.updateMatrixWorld(true); foot = bones.footL.matrixWorld.elements[13]; }
    // What `CollisionWorld` -- the thing `_clearSpot` asks, and the thing the
    // player stands on -- believes is under the same boots. If the mesh says a
    // bench top and this says pavement, the props are not in the collision
    // world and no placement-time query can find them.
    const cg = col && col.ready && col.groundDisc
      ? col.groundDisc(n.pos.x, n.pos.z, n.pos.y, 0.34, 1.1, 2.0) : null;
    const dr = Math.hypot(n.pos.x - plaza.x, n.pos.z - plaza.z);
    const zone = dr <= 11 ? 'disc ' : dr <= 11.9 ? 'FLARE' : 'off  ';
    out.push(`  ${n.id.padEnd(16)} r ${dr.toFixed(2).padStart(5)} ${zone} pos.y ${n.pos.y.toFixed(3)}  groundY ${n.groundY.toFixed(3)}  _groundAt ${gy.toFixed(3)}  root ${n.body.root.position.y.toFixed(3)}  footL ${foot === null ? '  --  ' : foot.toFixed(3)}  deck ${d.y > -1e8 ? d.y.toFixed(3) : ' none '}  sink ${d.y > -1e8 ? (d.y - n.pos.y).toFixed(3) : '--'}  col ${cg ? `${cg.y.toFixed(3)} onProp ${cg.onProp ? 'Y' : 'n'}` : 'not ready'}  (${d.who})`);
  }
}

return out.join('\n');

/*
 * Near-field close-ups of a river and a tarn, from the water's own eye height.
 *
 * The defect this frames is invisible at the judged range — every corpus
 * shoreline is 250 m+ from camera — so the poses are derived from the sheet in
 * the page rather than authored: the camera stands ON the channel, 2.5 m above
 * whichever is higher of the water and the bed, and looks downstream. A
 * world-coordinate pose written down once photographs dry ground the next time
 * the heightfield or the trace moves, which is how `tmp/t3-river/look.mts` got
 * its own derivation.
 *
 * The tarn poses come off `Water.bodies`: stand on the measured waterline (walk
 * out from the centre until the ground rises through the level, per azimuth,
 * because the bowl is warped and is not a circle) and look back across.
 */
const g = window.GAME;
g.applyShot('zone_vannath');
const sky = g.get('Sky'); if (sky) sky.setTimeOfDay(9.4);
const rig = g.get('CameraRig'), w = g.get('Water'), t = g.get('Terrain');
const eco = g.get('Vegetation').ecology;
const menus = g.get('Menus'); if (menus) menus.setScreen(null);
const hud = g.get('HUD'); if (hud) hud.setVisible(false);
const { WORLD } = await import('/world/map/WorldMap.ts');
const out = { shots: [], mask: w.mask ? w.mask.stats : null, census: [] };

/*
 * The census, and why it is here rather than in `vegwater.mts`.
 *
 * That probe measures the *sampler* — the density field, everywhere. This one
 * counts the matrices the game actually streamed in around the camera it just
 * posed, which is the number a frame can disagree with. `Vegetation` streams
 * per tile, so the count only means anything at a pose, and every pose here is
 * standing in the water.
 *
 * The mask is built in the probe rather than read off `Water`, so the same
 * probe runs on the build that has the defect: at `c19f5df` the class exists
 * and nothing is using it.
 */
const { WaterMask } = await import('/world/water/WaterMask.ts');
const probeMask = new WaterMask(w.bodies, w.riverWater ? w.riverWater.geometry : null);
// A Matrix4 without importing three: the page's bundle is not on a bare specifier.
const M = g.camera.matrixWorld.clone();
function census(name) {
  const seen = new Map();
  /** Sunk instances by depth band: 0.15-0.3, 0.3-0.6, 0.6-1.2, >1.2 m. */
  const depths = [0, 0, 0, 0];
  g.scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.count || !o.visible) return;
    let sunk = 0, total = 0;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, M);
      const x = M.elements[12], y = M.elements[13], z = M.elements[14];
      total++;
      const lv = probeMask.levelAt(x, z);
      if (lv === -Infinity) continue;
      const d = lv - y;
      if (d <= 0.15) continue;
      sunk++;
      // How deep is what is left? A tuft in a handspan of water at the margin
      // is a different defect from a tuft in two metres of it.
      depths[d < 0.3 ? 0 : d < 0.6 ? 1 : d < 1.2 ? 2 : 3]++;
    }
    if (!total) return;
    const key = o.name || o.material.name || o.geometry.name || 'unnamed';
    const e = seen.get(key) || { total: 0, sunk: 0 };
    e.total += total; e.sunk += sunk;
    seen.set(key, e);
  });
  const rows = [...seen.entries()].filter(([, e]) => e.sunk > 0 || e.total > 200)
    .map(([k, e]) => ({ mesh: k, total: e.total, sunk: e.sunk }));
  out.census.push({ at: name, rows, depths });
}

// ------------------------------------------------------------------- rivers
/*
 * Framed on DEPTH, not on width. The widest station is a shallow pan whose
 * sheet is drawn nearly transparent — nothing stands in it and nothing would
 * show if it did — while the defect lives wherever there is enough water to
 * stand in. So rank the stations by the drawn depth at the centre lane, and
 * stand on the bank rather than in the channel: from inside it the near bank
 * fills the frame, which is what `tmp/t3-river/look.mts` kept photographing.
 */
const pos = w.riverWater.geometry.getAttribute('position');
const L = 11, n = pos.count / L;
const rows = [];
for (let i = 0; i < n; i++) {
  const a = i * L, b = i * L + L - 1;
  const c = i * L + 5;
  const cx = pos.getX(c), cz = pos.getZ(c);
  rows.push({
    i, cx, cz, cy: pos.getY(c),
    wd: Math.hypot(pos.getX(b) - pos.getX(a), pos.getZ(b) - pos.getZ(a)),
    depth: pos.getY(c) - t.heightAt(cx, cz),
  });
}
const byDepth = [...rows].sort((p, q) => q.depth - p.depth);

async function river(name, idx, fov) {
  /*
   * Standing IN the channel, 2.2 m over the water — wading eye height — and
   * looking thirty stations downstream, so the reach runs away up the frame
   * with both banks in it. Two poses were tried and are worth not repeating:
   * on the bank at `max(ground, water) + 3` puts the eye on the canyon rim
   * 200 m up wherever the channel is incised, and framing the WIDEST station
   * finds a shallow pan whose sheet is drawn almost transparent.
   */
  const r = rows[idx];
  const dn = rows[Math.min(n - 1, idx + 30)];
  rig.setShot({
    pos: [r.cx, r.cy + 2.2, r.cz],
    target: [dn.cx, dn.cy, dn.cz],
    fov,
  });
  g.settle(26);
  out.shots.push({
    name, x: +r.cx.toFixed(1), z: +r.cz.toFixed(1), y: +r.cy.toFixed(1),
    width: +r.wd.toFixed(1), depth: +r.depth.toFixed(2),
  });
  census(name);
  await window.__shot(name);
}
await river('riv-deep', byDepth[0].i, 55);
await river('riv-deep2', byDepth[Math.floor(n * 0.06)].i, 55);

/*
 * One more, from the bank of a reach that has something growing on it.
 *
 * The two above find the deepest water in the world, and the deepest water in
 * this world is at the bottom of a bare rock gorge — a correct frame of a place
 * where the defect could never have shown. This one takes the deepest station
 * whose own bank carries grass, stands six metres out from the waterline at
 * 2.5 m over the surface, and looks across and downstream: water, waterline and
 * sward in one frame, which is the only way to see whether the edge reads.
 */
async function bank(name, idx, fov) {
  const r = rows[idx];
  const ax = pos.getX(idx * L), az = pos.getZ(idx * L);
  const bx = pos.getX(idx * L + L - 1), bz = pos.getZ(idx * L + L - 1);
  const l = Math.hypot(bx - ax, bz - az) || 1;
  const nx = (bx - ax) / l, nz = (bz - az) / l;
  const ex = bx + nx * 6, ez = bz + nz * 6;
  const dn = rows[Math.min(n - 1, idx + 26)];
  rig.setShot({ pos: [ex, r.cy + 2.5, ez], target: [dn.cx, dn.cy, dn.cz], fov });
  g.settle(26);
  out.shots.push({ name, x: +ex.toFixed(1), z: +ez.toFixed(1), depth: +r.depth.toFixed(2) });
  census(name);
  await window.__shot(name);
}
const green = byDepth.find((r) => eco.grassDensity(
  r.cx + (r.wd + 10) * 0.5, r.cz) > 0.25 || eco.grassDensity(r.cx, r.cz + (r.wd + 10) * 0.5) > 0.25);
if (green) await bank('riv-green', green.i, 52);

// -------------------------------------------------------------------- tarns
async function tarn(name, b) {
  // Walk out along +x until the ground comes up through the level; that is this
  // body's waterline on this azimuth, whatever shape the bowl is.
  let r = 4;
  const step = 2;
  while (r < Math.max(b.w, b.d) && t.heightAt(b.cx + r, b.cz) < b.level) r += step;
  const ex = b.cx + r + 6, ez = b.cz;
  const eye = Math.max(t.heightAt(ex, ez), b.level) + 2.2;
  rig.setShot({ pos: [ex, eye, ez], target: [b.cx, b.level, b.cz], fov: 55 });
  g.settle(26);
  out.shots.push({ name, x: +ex.toFixed(1), z: +ez.toFixed(1), eye: +eye.toFixed(2), level: +b.level.toFixed(1) });
  census(name);
  await window.__shot(name);
}
const tarns = w.bodies.filter((b) => b.level > WORLD.seaLevel + 4);
for (const b of tarns.slice(0, 2)) await tarn(`tarn-${b.name}`, b);

return out;

/**
 * **Can the Disc of Cauthess's wound be SEEN, from the stands that judge it?**
 *
 *   node src/tools/probe.mts src/tools/probes/discglow.mts --dirty \
 *     --shot tmp/l20/dg.png --set __DG_GAIN=1
 *   node src/tools/discdiff.mts tmp/l20            # lit-pixel counts
 *
 * The lane that owns the Meteor has three closed negatives behind it and all
 * three failed for the same reason wearing three costumes: the glow was
 * *there* and nothing could *see* it. `probes/meteorglow.mts` proved the
 * brightness half — forty times nothing is still nothing — and left the
 * geometry half as arithmetic in a handoff. This probe measures the geometry
 * half directly, per stand, three ways, so a claim can be cross-checked:
 *
 * 1. **Containment.** Every emissive element is tested against a height grid
 *    built from the merged stone mesh's own vertices: an element between the
 *    rock's floor and ceiling in its own 12 m column is inside the rock and no
 *    gain will ever light it. This is what entombed all 22 slabs.
 * 2. **Occlusion.** The eye→element ray is marched against that same rock grid
 *    AND against `Terrain.heightAt`. The terrain half is not a formality: from
 *    `landmark_meteor` a foreground ridge eats everything below the crown, so
 *    "not inside the rock" and "visible" are very different questions.
 * 3. **Lit pixels.** Each stand is photographed twice off one boot — emissive
 *    zeroed, then emissive as authored — so an offline diff counts exactly the
 *    pixels the wound contributes through the real post chain, bloom included.
 *    Same page, same TAA history, one uniform apart. This is the arbiter the
 *    done-when quotes; the two geometric tests only explain its verdict.
 *
 * No `Raycaster`: a probe is a function body in a page with no bare-specifier
 * map, so `import('three')` throws, and marching a grid needs no constructor
 * the scene has not already handed us.
 *
 * `__DG_GAIN` multiplies the authored emissive in the "on" arm. **Leave it at
 * 1 for the verdict.** The ×40 arm stays only as the standing control: still
 * invisible at ×40 means geometry, and radiance is not the answer.
 *
 * Stands: the two judged shots plus two the corpus does not own yet — the
 * highway spur at `n_disc` (824 m, on the rim; the "visible from the highway
 * at night" case the human's direction names) and the Lestallum lookout at
 * 2.3 km. Both are injected through `SHOTS.__probe`, the trick `framecam.mts`
 * uses, so this file needs no permission from `Shots.ts`.
 */
const g = window.GAME;
const GAIN = Number(window.__DG_GAIN ?? 1);
const ONLY = String(window.__DG_ONLY || '');

const mega = g.get('Megastructures') || (g.get('Props') && g.get('Props').mega);
const mats = mega && mega.mats;
if (!mats) return { error: 'no Megastructures.mats' };
const terr = g.get('Terrain');
const V3 = g.camera.position.constructor;

const SPUR = [-1220, -1360], LEST = [-2880, -760], CENTRE = [-1020, -2160];
const look = (from, y, tgt, fov, time) => ({
  pos: [from[0], terr.heightAt(from[0], from[1]) + y, from[1]],
  target: tgt, fov, time, weather: 'clear',
});
const STANDS = {
  landmark_meteor: 'landmark_meteor',
  zone_mencemoor: 'zone_mencemoor',
  spur_night: look(SPUR, 2.4, [CENTRE[0], 300, CENTRE[1]], 50, 21.4),
  spur_dusk: look(SPUR, 2.4, [CENTRE[0], 300, CENTRE[1]], 50, 17.6),
  lest_night: look(LEST, 12, [CENTRE[0], 340, CENTRE[1]], 30, 21.4),
};

g.resetClock();
g.scene.updateMatrixWorld(true);
const meshes = {};
g.scene.traverse((o) => { if (o.isMesh && o.name.startsWith('meteor_mega_')) meshes[o.name] = o; });
const stone = meshes.meteor_mega_stone;
if (!stone) return { error: 'no meteor_mega_stone', saw: Object.keys(meshes) };

// --- the rock, as a min/max height grid ------------------------------------
// 12 m cells over the merged stone's world-space vertices. A column's [min,max]
// brackets the rock there; it cannot see through an arch, and the Meteor has
// none by construction (the prow's overhang was cut out two rounds ago).
const CELL = 12, HALF = 1400, N = Math.ceil((HALF * 2) / CELL);
const lo = new Float32Array(N * N).fill(1e9), hi = new Float32Array(N * N).fill(-1e9);
const cellOf = (x, z) => {
  const i = Math.floor((x - (CENTRE[0] - HALF)) / CELL), j = Math.floor((z - (CENTRE[1] - HALF)) / CELL);
  return (i < 0 || j < 0 || i >= N || j >= N) ? -1 : j * N + i;
};
{
  const p = stone.geometry.attributes.position, m = stone.matrixWorld, v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m);
    const c = cellOf(v.x, v.z);
    if (c < 0) continue;
    if (v.y < lo[c]) lo[c] = v.y;
    if (v.y > hi[c]) hi[c] = v.y;
  }
}
const inRock = (x, y, z) => {
  const c = cellOf(x, z);
  return c >= 0 && hi[c] > -1e8 && y > lo[c] + 3 && y < hi[c] - 3;
};

// --- the emissive elements, in world space ---------------------------------
// `meteorGlow` is a batch of boxes, so 24 contiguous vertices are one slab and
// a centroid per group is exact. `meteorSkin` carries the veins as a per-vertex
// `aEmissive` attribute ON the mass surface, so its elements are the lit
// vertices, sampled — the question there is a rate, not a roll call.
const elems = [];
const gm = meshes.meteor_mega_meteorGlow;
if (gm) {
  const p = gm.geometry.attributes.position, v = new V3();
  for (let s = 0; s + 24 <= p.count; s += 24) {
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < 24; i++) { cx += p.getX(s + i); cy += p.getY(s + i); cz += p.getZ(s + i); }
    v.set(cx / 24, cy / 24, cz / 24).applyMatrix4(gm.matrixWorld);
    elems.push({ kind: 'slab', x: v.x, y: v.y, z: v.z });
  }
}
const sk = meshes.meteor_mega_meteorSkin;
let veinVerts = 0, veinLit = 0, veinSampled = 0;
if (sk && sk.geometry.attributes.aEmissive) {
  const p = sk.geometry.attributes.position, e = sk.geometry.attributes.aEmissive;
  const nrm = sk.geometry.attributes.normal, v = new V3();
  veinVerts = p.count;
  const step = Math.max(1, Math.floor(p.count / 6000));
  for (let i = 0; i < p.count; i += step) {
    veinSampled++;
    const w = Math.max(e.getX(i), e.getY(i), e.getZ(i));
    if (w < 0.05) continue;
    veinLit++;
    // Nudge out along the normal: a vein vertex sits ON the surface, and the
    // containment test would otherwise be a coin flip on its own triangle.
    v.set(p.getX(i) + nrm.getX(i) * 6, p.getY(i) + nrm.getY(i) * 6, p.getZ(i) + nrm.getZ(i) * 6)
      .applyMatrix4(sk.matrixWorld);
    elems.push({ kind: 'vein', x: v.x, y: v.y, z: v.z, w });
  }
}
for (const e of elems) e.inside = inRock(e.x, e.y, e.z);

/**
 * **How proud of the drawn ground is each part of this landmark, really?**
 *
 * `_meteorParts` seats everything on a local helper called `ground()`, and the
 * group it lives in is deliberately sunk 90 m so the masses' feet bury. Whether
 * those two facts compose or cancel is not something to reason about in a
 * comment — an apron shard 30 m tall and a rim block 155 m tall are either
 * standing on the crater or they are inside it, and one of those two worlds has
 * a rim in it. Every capture this project has ever taken of the Disc has had no
 * rim in it, so this measures rather than assumes: sample each meteor mesh's
 * vertices, subtract `Terrain.heightAt` under each one, and report the spread.
 *
 * Positive is proud of the ground. A mesh whose 95th percentile is negative is
 * a mesh nobody has ever seen.
 */
const proud = {};
for (const [name, o] of Object.entries(meshes)) {
  const p = o.geometry.attributes.position, m = o.matrixWorld, v = new V3();
  const step = Math.max(1, Math.floor(p.count / 3000));
  const d = [];
  for (let i = 0; i < p.count; i += step) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m);
    d.push(v.y - terr.heightAt(v.x, v.z));
  }
  d.sort((a, b) => a - b);
  const q = (f) => Math.round(d[Math.min(d.length - 1, Math.floor(f * d.length))]);
  proud[name] = { n: d.length, min: q(0), p05: q(0.05), median: q(0.5), p95: q(0.95), max: q(0.999) };
}

// --- per stand -------------------------------------------------------------
const report = {};
for (const [name, spec] of Object.entries(STANDS)) {
  if (ONLY && !ONLY.split(',').includes(name)) continue;
  if (typeof spec === 'string') g.applyShot(spec);
  else {
    const { SHOTS } = await import('/game/Shots.ts');
    SHOTS.__probe = spec;
    g.applyShot('__probe');
  }
  g.settle(60);
  const cam = g.camera;
  const eye = cam.position.clone();
  const proj = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse);
  const v = new V3();
  const counts = { visible: 0, occRock: 0, occTerrain: 0, offscreen: 0, contained: 0 };
  const byKind = { slab: 0, vein: 0 };
  for (const e of elems) {
    if (e.inside) { counts.contained++; continue; }
    v.set(e.x, e.y, e.z).applyMatrix4(proj);
    if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1 || v.z > 1) { counts.offscreen++; continue; }
    const dx = e.x - eye.x, dy = e.y - eye.y, dz = e.z - eye.z;
    const dist = Math.hypot(dx, dy, dz);
    // 8 m steps, stopping 10 m short so the element's own rock is not the
    // occluder. Terrain first: it is the cheap test and, from the judged
    // stands, the one that fires.
    let hit = null;
    for (let t = 40; t < dist - 10; t += 8) {
      const f = t / dist, px = eye.x + dx * f, py = eye.y + dy * f, pz = eye.z + dz * f;
      if (terr.heightAt(px, pz) > py) { hit = 'occTerrain'; break; }
      if (inRock(px, py, pz)) { hit = 'occRock'; break; }
    }
    if (hit) counts[hit]++; else { counts.visible++; byKind[e.kind]++; }
  }

  const night = g.get('Props') && g.get('Props')._night ? g.get('Props')._night(g) : null;
  const range = Math.hypot(eye.x - CENTRE[0], eye.z - CENTRE[1]);
  const h = g.renderer.domElement.height || 900;

  // The photographs. Both arms come off this one page, so TAA history, cloud
  // phase and sun are identical and the diff is the wound and nothing else.
  const keep = [];
  for (const k of ['meteorGlow', 'meteorSkin']) {
    if (!mats[k]) continue;
    const u = mats[k].userData && mats[k].userData.uGlow ? mats[k].userData.uGlow.value : null;
    keep.push([k, mats[k].emissive.clone(), u]);
  }
  for (const [k] of keep) {
    mats[k].emissive.setRGB(0, 0, 0);
    if (mats[k].userData && mats[k].userData.uGlow) mats[k].userData.uGlow.value = 0;
  }
  g.settle(8);
  await window.__shot(`${name}-off`);
  for (const [k, c, u] of keep) {
    mats[k].emissive.copy(c).multiplyScalar(GAIN);
    if (u !== null) mats[k].userData.uGlow.value = u * GAIN;
  }
  g.settle(8);
  await window.__shot(`${name}-on`);
  for (const [k, c, u] of keep) {
    mats[k].emissive.copy(c);
    if (u !== null) mats[k].userData.uGlow.value = u;
  }

  report[name] = {
    eye: [Math.round(eye.x), Math.round(eye.y), Math.round(eye.z)],
    range: Math.round(range), night: night === null ? null : +night.toFixed(3),
    mPerPx: +(2 * Math.tan((cam.fov * Math.PI / 180) / 2) * range / h).toFixed(3),
    ...counts, visibleSlabs: byKind.slab, visibleVeins: byKind.vein,
  };
}

return {
  gain: GAIN, meshes: Object.keys(meshes), proudOfGround: proud,
  slabs: elems.filter((e) => e.kind === 'slab').length,
  veinVerts, veinSampled, veinLit,
  containedTotal: elems.filter((e) => e.inside).length,
  stands: report,
};

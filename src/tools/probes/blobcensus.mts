/**
 * **How much of the POI layer is a big smooth mapless surface?**
 *
 *   node src/tools/probe.mts src/tools/probes/blobcensus.mts --dirty
 *
 * `c2e2295` fixed one instance of this class — every boulder in the 124 kits
 * was a bare platonic solid on a mapless `plain()` material — and named its own
 * blind spot in the commit message: four sites it deliberately left alone. The
 * coordinator then saw *"smooth dark ellipsoids beside the tomb"* in a judged
 * frame, which says there is a second population and nobody knows how big it
 * is. A census is how you find out, and it is the difference between fixing the
 * one you happened to photograph and fixing the class.
 *
 * The predicate, and why each clause is in it:
 *
 * - **`maxDim >= MIN_M` (default 5 m).** The `plain()` argument in
 *   `poiMaterials` is an argument about a *wall*: a 1 m-authored paint-chip map
 *   stretched over fourteen metres is metre-wide grey blotches. That argument
 *   is sound and this census does not dispute it — it asks the complementary
 *   question, which is how much LARGE surface is being asked to carry a frame
 *   on flat colour alone.
 * - **no map of any kind.** `map`, `normalMap` and `roughnessMap` all absent —
 *   a surface with only a normal map still breaks up under raking light.
 * - **smooth-shaded and low-density.** A merged `bag()` of arris-chamfered
 *   boxes is 10 000 vertices of masonry and reads fine flat; a 14x8
 *   `SphereGeometry` is 239 vertices over 12 metres and reads as rubber. So the
 *   census also reports **vertices per square metre of bounding-box face**,
 *   which is what separates the two without a hand-maintained list.
 *
 * Reported per material and then per node, worst first by area, because the
 * fix is per material for some rows and per call site for others.
 */
const g = window.GAME;
const MIN_M = Number(window.__BC_MIN || 5);
const LIMIT = Number(window.__BC_LIMIT || 22);

g.resetClock();
g.applyShot(String(window.__BC_SHOT || 'poi_tomb')); g.settle(40);

const scene = g.scene;
scene.updateMatrixWorld(true);

const MAPS = ['map', 'normalMap', 'roughnessMap', 'bumpMap', 'displacementMap'];

const byMat = new Map();
const rows = [];
let meshes = 0, mapped = 0;

const V3 = Object.getPrototypeOf(g.camera.position).constructor;
const a = new V3(), b = new V3();

for (const root of scene.children) {
  if (!/poi_kits|megastructures|props|landmark/i.test(root.name || '')) continue;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    meshes++;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    // A shadow proxy writes no colour and a beacon card is pure emission:
    // neither is asking the eye to read a surface, so neither is a blob.
    if (!m || m.colorWrite === false) return;
    if (m.emissive && m.emissive.getHex() !== 0 && (!m.color || m.color.getHex() === 0xffffff) && m.map === null && m.transparent) return;
    const has = MAPS.some((k) => m[k]);
    if (has) { mapped++; return; }
    const geo = o.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    // World-space size: the local box scaled by the world matrix's own scale.
    const e = o.matrixWorld.elements;
    const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
    a.copy(geo.boundingBox.min); b.copy(geo.boundingBox.max);
    const dx = (b.x - a.x) * sx, dy = (b.y - a.y) * sy, dz = (b.z - a.z) * sz;
    const maxDim = Math.max(dx, dy, dz);
    if (maxDim < MIN_M) return;
    // Bounding-box surface area is the honest denominator for "how much surface
    // is this asking me to believe": a slab and a ball of the same longest axis
    // are not the same amount of frame.
    const area = 2 * (dx * dy + dy * dz + dz * dx);
    const verts = geo.attributes.position.count;
    const key = m ? (m.name || m.type) : 'null';
    const rec = byMat.get(key) || { mat: key, n: 0, area: 0, verts: 0, worstM: 0 };
    rec.n++; rec.area += area; rec.verts += verts;
    if (maxDim > rec.worstM) rec.worstM = maxDim;
    byMat.set(key, rec);
    rows.push({
      node: o.name || null, parent: o.parent ? (o.parent.name || o.parent.type) : null,
      mat: key, geo: geo.type,
      size: [+dx.toFixed(1), +dy.toFixed(1), +dz.toFixed(1)],
      area: Math.round(area), verts, vpm2: +(verts / area).toFixed(2),
      flat: !!(m && m.flatShading), lit: m.type === 'MeshStandardMaterial' || m.type === 'MeshPhysicalMaterial',
      emis: m.emissive ? '#' + m.emissive.getHexString() : null, transparent: !!m.transparent,
    });
  });
}

rows.sort((x, y) => y.area - x.area);
const mats = [...byMat.values()].sort((x, y) => y.area - x.area)
  .map((r) => ({ ...r, area: Math.round(r.area), vpm2: +(r.verts / r.area).toFixed(2), worstM: +r.worstM.toFixed(1) }));

return {
  minM: MIN_M, meshesScanned: meshes, mapped,
  bigMapless: rows.length,
  totalArea: Math.round(rows.reduce((s, r) => s + r.area, 0)),
  byMaterial: mats,
  worst: rows.slice(0, LIMIT),
};

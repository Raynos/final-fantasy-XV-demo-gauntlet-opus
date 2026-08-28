/**
 * Which way is the head shell wound, and which way do its normals point?
 *
 *   node src/tools/probe.mts src/tools/probes/facewind.mts --dirty
 *
 * Also prints the **signed volume** of every mesh on the character,
 * `sum dot(a, b x c) / 6`. For a closed mesh that is positive when the winding
 * is outward and negative when it is inward, with no convexity assumption and
 * no centroid — which is the cheapest corpus-wide sweep for the defect this
 * probe found on the head shell (`buildHead`'s grid, fixed in d866db7).
 *
 * Decided from the index buffer, not from a centroid: a centroid on this mesh
 * is useless because `thetaWarp` / `phiWarp` put 2.1x the columns on the front
 * and 1.55x the rows on the face band, so the mean vertex sits ~30 mm in front
 * of the head's actual centre. This takes triangles whose own centroid is on
 * the *front* of the face (max z of the mesh, minus 15 mm) and prints the
 * geometric normal `(b-a) x (c-a)` — which is exactly what
 * `computeSmoothNormals` accumulates and exactly what THREE culls on.
 */
const g = window.GAME;
const ch = g.get('Player').character;
const meshes = [];
ch.root.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) meshes.push(o); });
const L = [];
for (const fm of meshes) {
  const pos = fm.geometry.attributes.position, nr = fm.geometry.attributes.normal;
  const idx = fm.geometry.index;
  if (!idx || !nr) { L.push(`${fm.name}: non-indexed or no normal`); continue; }
  let zmax = -9e9;
  for (let i = 0; i < pos.count; i++) zmax = Math.max(zmax, pos.getZ(i));
  let front = 0, frontOut = 0, nAttrOut = 0;
  const ex = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    const zc = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    if (zc < zmax - 0.015) continue;
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
    const ux = pos.getX(b) - ax, uy = pos.getY(b) - ay, uz = pos.getZ(b) - az;
    const vx = pos.getX(c) - ax, vy = pos.getY(c) - ay, vz = pos.getZ(c) - az;
    const gz = ux * vy - uy * vx;      // z of u x v
    front++;
    if (gz > 0) frontOut++;
    if (nr.getZ(a) > 0) nAttrOut++;
    if (ex.length < 4) ex.push(`    tri ${t / 3}  geoN.z ${gz.toExponential(2)}  nAttr(a) `
      + `(${nr.getX(a).toFixed(2)},${nr.getY(a).toFixed(2)},${nr.getZ(a).toFixed(2)})`);
  }
  if (!front) continue;
  L.push(`${String(fm.name).padEnd(18)} front tris ${String(front).padStart(6)}  `
    + `geometric normal +z on ${(100 * frontOut / front).toFixed(1)}%  `
    + `normal attribute +z on ${(100 * nAttrOut / front).toFixed(1)}%`);
  if (fm.material === ch.faceMat || (Array.isArray(fm.material) && fm.material.includes(ch.faceMat))) L.push(...ex);
}
L.push('');
L.push('signed volume (positive = outward-wound, for a closed mesh):');
for (const m of meshes) {
  const p2 = m.geometry.attributes.position, ix = m.geometry.index;
  if (!p2) continue;
  let vol = 0;
  const n3 = ix ? ix.count : p2.count;
  for (let t = 0; t + 2 < n3; t += 3) {
    const a = ix ? ix.getX(t) : t, b = ix ? ix.getX(t + 1) : t + 1, c = ix ? ix.getX(t + 2) : t + 2;
    const ax = p2.getX(a), ay = p2.getY(a), az = p2.getZ(a);
    const bx = p2.getX(b), by = p2.getY(b), bz = p2.getZ(b);
    const cx2 = p2.getX(c), cy2 = p2.getY(c), cz = p2.getZ(c);
    vol += ax * (by * cz - bz * cy2) + ay * (bz * cx2 - bx * cz) + az * (bx * cy2 - by * cx2);
  }
  L.push(`  ${String(m.name || '-').padEnd(18)} tris ${String(Math.round(n3 / 3)).padStart(7)}  vol ${(vol / 6).toExponential(3)}`);
}

const fm2 = meshes.find((m) => m.material === ch.faceMat);
const mt = fm2 && fm2.material;
if (mt) L.push(`faceMat side=${mt.side} (0 Front, 1 Back, 2 Double)  flatShading=${mt.flatShading}`);
return L.join('\n');

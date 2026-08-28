/**
 * Do the head shell's vertex normals point out of the head?
 *
 *   node src/tools/probe.mts src/tools/probes/facenrm.mts --dirty
 *
 * `facesect.mts` printed nx = +0.44 at x = -30 mm and -0.44 at +30 on the brow
 * row, which is the normal field of the *inside* of a gutter, not the outside
 * of a dome. This checks it the unambiguous way: dot(normal, position - head
 * centre), per axis and overall, on the skull grid only.
 */
const g = window.GAME;
const ch = g.get('Player').character;
const meshes = [];
ch.root.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) meshes.push(o); });
const fm = meshes.find((m) => m.material === ch.faceMat)
  || meshes.find((m) => Array.isArray(m.material) && m.material.includes(ch.faceMat));
const pos = fm.geometry.attributes.position, nr = fm.geometry.attributes.normal;
// head centre: the mean of every vertex, good enough for a sign test
let cx = 0, cy = 0, cz = 0;
for (let i = 0; i < pos.count; i++) { cx += pos.getX(i); cy += pos.getY(i); cz += pos.getZ(i); }
cx /= pos.count; cy /= pos.count; cz /= pos.count;
let neg = 0, tot = 0, negX = 0, totX = 0, negY = 0, totY = 0, negZ = 0, totZ = 0;
const samples = [];
for (let i = 0; i < pos.count; i++) {
  const rx = pos.getX(i) - cx, ry = pos.getY(i) - cy, rz = pos.getZ(i) - cz;
  const nx = nr.getX(i), ny = nr.getY(i), nz = nr.getZ(i);
  const d = rx * nx + ry * ny + rz * nz;
  tot++; if (d < 0) neg++;
  if (Math.abs(rx) > 0.02) { totX++; if (rx * nx < 0) negX++; }
  if (Math.abs(ry) > 0.02) { totY++; if (ry * ny < 0) negY++; }
  if (Math.abs(rz) > 0.02) { totZ++; if (rz * nz < 0) negZ++; }
  if (samples.length < 14 && Math.abs(ry) < 0.004 && Math.abs(rz) > 0.02) {
    samples.push(`  p (${(rx * 1000).toFixed(0).padStart(5)},${(ry * 1000).toFixed(0).padStart(5)},${(rz * 1000).toFixed(0).padStart(5)})`
      + `  n (${nx.toFixed(2).padStart(6)},${ny.toFixed(2).padStart(6)},${nz.toFixed(2).padStart(6)})  dot ${d.toFixed(4)}`);
  }
}
const L = [];
L.push(`face mesh ${fm.name}  verts ${pos.count}`);
L.push(`dot(n, p-centre) < 0 on ${neg}/${tot} vertices  (${(100 * neg / tot).toFixed(1)}%)`);
L.push(`sign disagreement per axis:  x ${negX}/${totX} (${(100 * negX / totX).toFixed(1)}%)`
  + `   y ${negY}/${totY} (${(100 * negY / totY).toFixed(1)}%)`
  + `   z ${negZ}/${totZ} (${(100 * negZ / totZ).toFixed(1)}%)`);
L.push('samples on the equator:');
L.push(...samples);
return L.join('\n');

/**
 * Orientation-absolute unit test for the shared geometry builders in
 * `src/characters/rig/Geo.ts`.
 *
 *   node src/tools/probe.mts src/tools/probes/geowind.mts --dirty
 *
 * `facewind.mts` measures the *assembled* character, which is the right final
 * check but a terrible bisector: a body is one mesh made of nine sweeps, four
 * blobs and a shell, and one inverted primitive inside it is invisible in the
 * sum. This builds each primitive on its own, closed, around the origin, and
 * reports the signed volume `sum dot(a, b x c)/6` plus the fraction of
 * triangles whose geometric normal points away from the origin. Both are
 * orientation-ABSOLUTE (LANDMINES.md, "A consistently-but-inversely wound
 * shell is invisible to every bench in this repo") — `assertConsistentWinding`
 * is not, by construction, and passes a uniformly inverted shell.
 *
 * Every primitive here is star-shaped about the origin, so `outward%` should
 * be 100.0 and the volume positive. A negative volume is an inward-wound
 * builder, and every caller of it inherits the defect.
 */
const Geo = await import('/characters/rig/Geo.ts');
const L = [];

function measure(name, build) {
  const B = new Geo.MeshBuilder();
  let extra = '';
  try { build(B); } catch (e) { L.push(`${name.padEnd(22)} THREW ${e && e.message}`); return; }
  const p = B.pos, idx = B.idx;
  let v = 0, tris = 0, out = 0;
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ax = p[a], ay = p[a + 1], az = p[a + 2];
    const bx = p[b], by = p[b + 1], bz = p[b + 2];
    const cx = p[c], cy = p[c + 1], cz = p[c + 2];
    v += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    // geometric normal (b-a) x (c-a) against the outward ray from the origin
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx - ax, wy = cy - ay, wz = cz - az;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const gx = (ax + bx + cx) / 3, gy = (ay + by + cy) / 3, gz = (az + bz + cz) / 3;
    tris++;
    if (nx * gx + ny * gy + nz * gz > 0) out++;
  }
  v /= 6;
  L.push(`${name.padEnd(22)} tris ${String(tris).padStart(6)}  vol ${(v).toExponential(3).padStart(11)}  `
    + `outward ${(100 * out / Math.max(1, tris)).toFixed(1)}%  ${v > 0 ? 'OK' : 'INWARD'}${extra}`);
}

// a straight tube up +y through the origin, capped at both ends => closed
const tubeNodes = [
  { p: [0, -0.4, 0], rx: 0.12, w: [[0, 1]] },
  { p: [0, 0, 0], rx: 0.13, w: [[0, 1]] },
  { p: [0, 0.4, 0], rx: 0.12, w: [[0, 1]] },
];
measure('sweepTube (body)', (B) => Geo.sweepTube(B, { nodes: tubeNodes, steps: 8, seg: 12 }));
measure('sweepTube capStart', (B) => Geo.sweepTube(B, { nodes: tubeNodes, steps: 8, seg: 12, capStart: true }));
measure('sweepTube capEnd', (B) => Geo.sweepTube(B, { nodes: tubeNodes, steps: 8, seg: 12, capEnd: true }));
measure('sweepTube capped', (B) => Geo.sweepTube(B, { nodes: tubeNodes, steps: 8, seg: 12, capStart: true, capEnd: true }));
measure('blob', (B) => Geo.blob(B, { center: [0, 0, 0], scale: [0.2, 0.3, 0.25], segU: 12, segV: 8 }));
measure('roundedBox', (B) => Geo.roundedBox(B, { size: [0.2, 0.3, 0.25], center: [0, 0, 0], seg: 3 }));
measure('ribbon', (B) => Geo.ribbon(B, {
  points: [[0, -0.3, 0], [0, 0, 0], [0, 0.3, 0]], steps: 6, sides: 6, width: 0.06, thick: 0.05,
  taper: () => 1, up: [0, 0, 1],
}));
// sweepShell is an OPEN panel, so signed volume is not meaningful; what is
// meaningful is that its outer surface agrees with a plain sweepTube of the
// same nodes. Sweep a partial arc and compare the outer ring quads only.
{
  const B = new Geo.MeshBuilder();
  const r = Geo.sweepShell(B, { nodes: tubeNodes, steps: 8, seg: 12, theta0: 0, theta1: Math.PI, thickness: 0.02 });
  const p = B.pos, idx = B.idx;
  let tris = 0, out = 0;
  // the outer sweep is emitted first; count only its triangles
  const outerTris = 8 * 12 * 2;
  for (let t = 0; t < outerTris * 3 && t + 2 < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ax = p[a], ay = p[a + 1], az = p[a + 2];
    const ux = p[b] - ax, uy = p[b + 1] - ay, uz = p[b + 2] - az;
    const wx = p[c] - ax, wy = p[c + 1] - ay, wz = p[c + 2] - az;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    // radial direction in the xz plane (the tube runs up +y)
    const gx = (ax + p[b] + p[c]) / 3, gz = (az + p[b + 2] + p[c + 2]) / 3;
    tris++;
    if (nx * gx + nz * gz > 0) out++;
    void r; void ny;
  }
  L.push(`${'sweepShell outer'.padEnd(22)} tris ${String(tris).padStart(6)}  ${' '.repeat(17)}`
    + `outward ${(100 * out / Math.max(1, tris)).toFixed(1)}%  ${out === tris ? 'OK' : 'INWARD'}`);
}

// ---- the hair scalp shell -----------------------------------------------
// The shell is a cap, so signed volume says nothing; but every shell vertex
// carries `aGroom` = the *sculpted skull normal* under it, which is an
// absolute outward reference. The shell is the first thing `buildHair` emits
// (96 x 20 quads), so its triangles are the head of the index buffer.
{
  const g = window.GAME;
  const hair = g.get('Player').character.hair;
  const geo = hair.geometry;
  const pos = geo.attributes.position, gr = geo.attributes.aGroom, idx = geo.index;
  if (!gr) { L.push('hair shell           no aGroom attribute'); } else {
    const shellTris = 96 * 20 * 2;
    let out = 0, n = 0;
    for (let t = 0; t < shellTris * 3 && t + 2 < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
      const ux = pos.getX(b) - ax, uy = pos.getY(b) - ay, uz = pos.getZ(b) - az;
      const wx = pos.getX(c) - ax, wy = pos.getY(c) - ay, wz = pos.getZ(c) - az;
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const d = nx * gr.getX(a) + ny * gr.getY(a) + nz * gr.getZ(a);
      n++; if (d > 0) out++;
    }
    L.push(`${'hair shell'.padEnd(22)} tris ${String(n).padStart(6)}  ${' '.repeat(17)}`
      + `outward ${(100 * out / Math.max(1, n)).toFixed(1)}%  ${out * 2 > n ? 'OK' : 'INWARD'}`);
  }
}
return L.join('\n');

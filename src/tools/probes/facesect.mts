/**
 * Is there a nose on the front of this head, as a *section* rather than as a
 * single extremum?
 *
 *   node src/tools/probe.mts src/tools/probes/facesect.mts --dirty
 *
 * `facecheck` gates `noseLeadMm` at 26-27 mm and the rendered frontal face has
 * no nose in it. `noseLead` is one extremum against one datum; it cannot tell a
 * nose from the front of an egg. This prints the actual surface:
 *
 * - horizontal sections z(x) at each face landmark height, in millimetres of
 *   canonical head space, so a nose is visible as a ridge standing off the
 *   cheek either side of it and its absence is visible as an arc;
 * - the median-plane profile z(y), so brow / nasion / tip / subnasale / lip /
 *   chin can be read as a curve.
 *
 * Canonical space is recovered from the mesh itself: `uvOf`'s v is exactly
 * `(y - FACE.yMin) / (yMax - yMin)`, so v gives canonical y, and the build is a
 * uniform scale + translate, so a single scale factor recovers x and z.
 */
const g = window.GAME;
const ch = g.get('Player').character;
const meshes = [];
ch.root.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) meshes.push(o); });
const faceMesh = meshes.find((m) => m.material === ch.faceMat)
  || meshes.find((m) => Array.isArray(m.material) && m.material.includes(ch.faceMat));
if (!faceMesh) return 'no face mesh';
const pos = faceMesh.geometry.attributes.position;
const uv = faceMesh.geometry.attributes.uv;
const Y_MIN = -0.122, Y_MAX = 0.116;   // FACE.yMin / yMax, canonical

// scale: character-space y span of the shell / canonical y span implied by v
let yLo = 9, yHi = -9, vLo = 9, vHi = -9;
for (let i = 0; i < pos.count; i++) {
  const v = uv.getY(i), y = pos.getY(i);
  if (v < vLo) { vLo = v; } if (v > vHi) { vHi = v; }
  if (y < yLo) yLo = y; if (y > yHi) yHi = y;
}
// use two well-separated v levels to solve scale robustly
const at = (vTarget) => {
  let s = 0, n = 0;
  for (let i = 0; i < pos.count; i++) if (Math.abs(uv.getY(i) - vTarget) < 0.004) { s += pos.getY(i); n++; }
  return n ? s / n : NaN;
};
const yA = at(0.25), yB = at(0.75);
const canA = Y_MIN + 0.25 * (Y_MAX - Y_MIN), canB = Y_MIN + 0.75 * (Y_MAX - Y_MIN);
const scale = (yB - yA) / (canB - canA);
const yOff = yA - canA * scale;     // character y = canonical y * scale + yOff

// centre of the head in x,z: the mean of the widest ring
let zSum = 0, zN = 0;
for (let i = 0; i < pos.count; i++) if (Math.abs(uv.getY(i) - 0.5) < 0.01) { zSum += pos.getZ(i); zN++; }
const zC = zSum / zN;   // NOT the canonical origin; sections are printed relative to this

const L = [];
L.push(`scale ${scale.toFixed(4)}  (1 canonical unit = ${(scale * 1000).toFixed(1)} mm-of-character per m)`);
L.push(`verts ${pos.count}   v range ${vLo.toFixed(3)}..${vHi.toFixed(3)}`);

const MM = (m) => (m / scale) * 1000;   // character metres -> canonical mm

const LEVELS = [
  ['brow',      -0.0140],
  ['eye',       -0.0060],
  ['nasion',    -0.0180],
  ['noseMid',   -0.0270],
  ['noseTip',   -0.0330],
  ['subnasale', -0.0420],
  ['mouth',     -0.0640],
  ['chin',      -0.1000],
];

const XS = [0, 4, 8, 12, 16, 20, 26, 32, 40];
L.push('');
L.push('horizontal sections — z (mm, relative to the mid-height ring centre) at |x| mm from the midline');
L.push(`  ${'level'.padEnd(10)} ${'y'.padStart(6)}  ` + XS.map((x) => String(x).padStart(6)).join(''));
for (const [name, cy] of LEVELS) {
  const v = (cy - Y_MIN) / (Y_MAX - Y_MIN);
  // collect vertices in a thin band, both sides folded onto |x|
  const band = [];
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(uv.getY(i) - v) > 0.010) continue;
    band.push([Math.abs(MM(pos.getX(i))), MM(pos.getZ(i) - zC)]);
  }
  band.sort((a, b) => a[0] - b[0]);
  if (band.length < 8) { L.push(`  ${name.padEnd(10)} ${(cy * 1000).toFixed(0).padStart(6)}  (only ${band.length} verts)`); continue; }
  const row = XS.map((x) => {
    // front surface only: the max z among vertices within 2.5 mm of this |x|
    let best = -1e9, n = 0;
    for (const [bx, bz] of band) if (Math.abs(bx - x) < 2.5) { if (bz > best) best = bz; n++; }
    return n ? best.toFixed(1).padStart(6) : '     -';
  });
  L.push(`  ${name.padEnd(10)} ${(cy * 1000).toFixed(0).padStart(6)}  ` + row.join(''));
}

L.push('');
L.push('median profile — front-most z (mm) on the midline, |x| < 3 mm, by canonical y');
const prof = [];
for (let cy = 0.020; cy >= -0.118; cy -= 0.006) {
  const v = (cy - Y_MIN) / (Y_MAX - Y_MIN);
  let best = -1e9, n = 0;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(uv.getY(i) - v) > 0.008) continue;
    if (Math.abs(MM(pos.getX(i))) > 3) continue;
    const z = MM(pos.getZ(i) - zC); if (z > best) best = z; n++;
  }
  if (n) prof.push([cy, best]);
}
const pMax = Math.max(...prof.map((p) => p[1]));
for (const [cy, z] of prof) {
  const bar = '#'.repeat(Math.max(0, Math.round((z - (pMax - 40)) / 1.2)));
  L.push(`  y ${(cy * 1000).toFixed(0).padStart(5)}  z ${z.toFixed(1).padStart(6)}  ${bar}`);
}


// ---- normals across the midline -------------------------------------------
// A razor-straight value step down the midline of every front view is either a
// normal discontinuity or a shadow terminator. This is the half that needs no
// frame: the mesh's own normal attribute, across the midline, at three heights.
const nrmA = faceMesh.geometry.attributes.normal;
L.push('');
L.push('vertex normals across the midline — nx (and nz), front surface only');
for (const [name, cy] of [['eye', -0.006], ['noseTip', -0.033], ['mouth', -0.064], ['brow', -0.014]]) {
  const v = (cy - Y_MIN) / (Y_MAX - Y_MIN);
  const rows = [];
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(uv.getY(i) - v) > 0.004) continue;
    // FRONT surface only — and it must be selected by *position*, not by the
    // normal's own sign, which is how pass 5 first read this table off the back
    // of the skull and briefly believed the normals were inverted.
    if (MM(pos.getZ(i) - zC) < 20) continue;
    const x = MM(pos.getX(i));
    if (Math.abs(x) > 34) continue;
    rows.push([x, nrmA.getX(i), nrmA.getY(i), nrmA.getZ(i)]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  L.push(`  ${name}:`);
  L.push('    x  ' + rows.map((r) => r[0].toFixed(0).padStart(6)).join(''));
  L.push('    nx ' + rows.map((r) => r[1].toFixed(2).padStart(6)).join(''));
  L.push('    nz ' + rows.map((r) => r[3].toFixed(2).padStart(6)).join(''));
}
return L.join('\n');

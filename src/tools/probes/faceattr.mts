/**
 * Read the head mesh's own uv attribute, rather than inferring it from a frame.
 *
 *   node src/tools/probe.mts src/tools/probes/faceattr.mts --dirty
 *
 * `facebar.mts` stamped a 40 mm black meridian at u = 0.5 over the shipped face
 * map and a full-width latitude at the mouth's v. The latitude renders across
 * the face; the meridian renders **only under the chin**. That is impossible if
 * the shell's u is `0.5 + atan2(x, z) / 2pi` on a symmetric grid, so this reads
 * the attribute buffer and says what it actually is.
 *
 * Prints, for the head mesh: the uv bounding box, and — for the vertices in a
 * band around each face anchor's v — how many there are, the u range they span,
 * and the position range, so a collapsed or offset u is visible as a number.
 */
const g = window.GAME;
const pl = g.get('Player');
const ch = pl && pl.character;
const lines = [];

const meshes = [];
ch.root.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) meshes.push(o); });
for (const m of meshes) {
  const mt = Array.isArray(m.material) ? m.material : [m.material];
  lines.push(`mesh ${String(m.name || '-').padEnd(16)} v=${String(m.geometry.attributes.position.count).padStart(6)} `
    + `visible=${m.visible} frustumCulled=${m.frustumCulled} renderOrder=${m.renderOrder} layers=${m.layers.mask} `
    + `cast=${m.castShadow} recv=${m.receiveShadow} isFace=${m.material === ch.faceMat} `
    + `mats=[${mt.map((x) => `${x && x.type}:${x && x.name}:side${x && x.side}:vis${x && x.visible}:depthW${x && x.depthWrite}`).join(' | ')}]`);
}

const faceMesh = meshes.find((m) => m.material === ch.faceMat)
  || meshes.find((m) => Array.isArray(m.material) && m.material.includes(ch.faceMat));
if (!faceMesh) { return lines.join('\n') + '\nno mesh uses faceMat'; }
lines.push(`face mesh: ${faceMesh.name || '(unnamed)'}  verts ${faceMesh.geometry.attributes.position.count}`
  + `  groups ${faceMesh.geometry.groups.length}  materialIsArray ${Array.isArray(faceMesh.material)}`);

const pos = faceMesh.geometry.attributes.position;
const uv = faceMesh.geometry.attributes.uv;
const Y_MIN = -0.122, Y_MAX = 0.116;
const ANCH = { eye: -0.006, noseTip: -0.033, mouth: -0.064, chin: -0.108 };

let u0 = 9, u1 = -9, v0 = 9, v1 = -9;
for (let i = 0; i < uv.count; i++) {
  u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i));
  v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i));
}
lines.push(`uv bbox: u ${u0.toFixed(4)}..${u1.toFixed(4)}   v ${v0.toFixed(4)}..${v1.toFixed(4)}`);

for (const [name, y] of Object.entries(ANCH)) {
  const v = (y - Y_MIN) / (Y_MAX - Y_MIN);
  const band = [];
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(uv.getY(i) - v) > 0.012) continue;
    band.push(i);
  }
  if (!band.length) { lines.push(`${name.padEnd(8)} v=${v.toFixed(4)}  NO VERTICES in the band`); continue; }
  // the ones near the front midline in u
  const near = band.filter((i) => Math.abs(uv.getX(i) - 0.5) < 0.04);
  const us = band.map((i) => uv.getX(i)).sort((a, b) => a - b);
  const xs = near.map((i) => pos.getX(i));
  const zs = near.map((i) => pos.getZ(i));
  const ys = near.map((i) => pos.getY(i));
  const rng = (a) => (a.length ? `${Math.min(...a).toFixed(4)}..${Math.max(...a).toFixed(4)}` : '-');
  lines.push(`${name.padEnd(8)} v=${v.toFixed(4)}  band n=${String(band.length).padStart(4)}  `
    + `u ${us[0].toFixed(4)}..${us[us.length - 1].toFixed(4)}   |u-0.5|<0.04: n=${near.length}  `
    + `x ${rng(xs)}  y ${rng(ys)}  z ${rng(zs)}`);
}

// The front-most vertex is the nose tip by construction; its u decides whether
// the seam is at the back where the parameterisation says it is.
let best = -1, bz = -9;
for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > bz) { bz = pos.getZ(i); best = i; }
lines.push(`front-most vertex #${best}: pos ${[pos.getX(best), pos.getY(best), pos.getZ(best)].map((x) => x.toFixed(4)).join(', ')}`
  + `  uv ${uv.getX(best).toFixed(4)}, ${uv.getY(best).toFixed(4)}`);
let back = -1, kz = 9;
for (let i = 0; i < pos.count; i++) if (pos.getZ(i) < kz) { kz = pos.getZ(i); back = i; }
lines.push(`back-most  vertex #${back}: pos ${[pos.getX(back), pos.getY(back), pos.getZ(back)].map((x) => x.toFixed(4)).join(', ')}`
  + `  uv ${uv.getX(back).toFixed(4)}, ${uv.getY(back).toFixed(4)}`);
// mean position of everything the map calls u ~ 0.5, and of u ~ 0 / 1
const meanOf = (pred) => {
  let n = 0, sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < uv.count; i++) if (pred(uv.getX(i))) { n++; sx += pos.getX(i); sy += pos.getY(i); sz += pos.getZ(i); }
  return n ? `n=${n} mean ${(sx / n).toFixed(4)}, ${(sy / n).toFixed(4)}, ${(sz / n).toFixed(4)}` : 'n=0';
};
lines.push(`u in [0.46,0.54]: ${meanOf((u) => u > 0.46 && u < 0.54)}`);
lines.push(`u < 0.04 or > 0.96: ${meanOf((u) => u < 0.04 || u > 0.96)}`);
lines.push(`material side=${ch.faceMat.side} transparent=${ch.faceMat.transparent} `
  + `map.wrapS=${ch.faceMat.map.wrapS} wrapT=${ch.faceMat.map.wrapT}`);

// the head bone's own bind transform, so canonical -> bind is checkable
lines.push('');
const bn = ch.rig.byName.head;
lines.push(`head bone bind pos ${bn.position.toArray().map((x) => x.toFixed(4)).join(', ')}`);
lines.push(`faceMat map: ${ch.faceMat.map && ch.faceMat.map.constructor.name} `
  + `flipY=${ch.faceMat.map.flipY} offset=${ch.faceMat.map.offset.toArray()} repeat=${ch.faceMat.map.repeat.toArray()} `
  + `rotation=${ch.faceMat.map.rotation} center=${ch.faceMat.map.center.toArray()}`);
lines.push(`faceMat.map.channel=${ch.faceMat.map.channel}  geometry has uv1=${!!faceMesh.geometry.attributes.uv1}`);
return lines.join('\n');

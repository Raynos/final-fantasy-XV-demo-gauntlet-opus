/**
 * **What is that thing, at those pixels?**
 *
 *   node src/tools/probe.mts src/tools/probes/pixelowner.mts --dirty \
 *     --set __PO_SHOT=poi_tomb --set __PO_RECT=540,360,400,150
 *
 * Looking at a frame says *that* something is wrong and is famously bad at
 * saying *what*. `--hide` narrows to a top-level scene child; `whoowns.mts`
 * narrows to a world position you already know. Neither answers the question an
 * agent actually has after reading a capture, which is **"the smooth dark blob
 * at (820, 420) — which call site built it?"**
 *
 * So: pose the shot, walk every mesh in the scene, project its world bounding
 * box to screen pixels through the shot's own camera, and report the ones whose
 * footprint overlaps the rect — nearest first, with the owning system, the
 * material (and crucially **whether it carries a map at all**, which is what
 * separates a graded prop from an untextured one), the vertex count and the
 * geometry's own type.
 *
 * A projected bounding box, not a raycast: a raycast names one triangle, and
 * what you want is the *object*, including the ones behind the one in front.
 *
 * `__PO_RECT` is `x,y,w,h` in the capture's own pixels (1600x900 by default;
 * `__PO_W` / `__PO_H` override). Note the Read tool downscales a capture to a
 * 1568 px long edge before you see it, so multiply the coordinates you read off
 * an image by about 1.02 before pasting them here.
 */
const g = window.GAME;
const SHOT = String(window.__PO_SHOT || 'poi_tomb');
const RECT = String(window.__PO_RECT || '0,0,1600,900').split(',').map(Number);
const W = Number(window.__PO_W || 1600), H = Number(window.__PO_H || 900);
const LIMIT = Number(window.__PO_LIMIT || 14);

g.resetClock();
g.applyShot(SHOT); g.settle(60);
g.applyShot(SHOT); g.settle(8);

const scene = g.scene;
const cam = g.camera;
cam.updateMatrixWorld(true);
scene.updateMatrixWorld(true);

/** Every system's roots, so an anonymous group traces back to an owner. */
const roots = [];
for (const s of g.systems || []) {
  const name = s.constructor ? s.constructor.name : '?';
  for (const k of ['root', 'group', 'scene', 'container', 'rocks', 'props']) {
    if (s[k] && s[k].isObject3D) roots.push({ name: `${name}.${k}`, node: s[k] });
  }
}
const ownerOf = (o) => {
  for (let p = o; p; p = p.parent) {
    for (const r of roots) if (r.node === p) return r.name;
    if (p.parent === scene) return `scene/${p.name || p.type}`;
  }
  return null;
};

const V3 = Object.getPrototypeOf(cam.position).constructor;
const v = new V3();
const [rx, ry, rw, rh] = RECT;

const MAPS = ['map', 'normalMap', 'roughnessMap', 'aoMap', 'bumpMap', 'emissiveMap'];

const hits = [];
scene.traverse((o) => {
  if (!o.isMesh || !o.visible) return;
  for (let p = o; p; p = p.parent) if (!p.visible) return;
  const geo = o.geometry;
  if (!geo || !geo.attributes || !geo.attributes.position) return;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  // Project all eight corners of the local bounding box.
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, minZ = 1e9, near = 1e9, behind = 0;
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
    v.applyMatrix4(o.matrixWorld);
    const d = v.distanceTo(cam.position);
    if (d < near) near = d;
    v.project(cam);
    if (v.z > 1) behind++;
    const px = (v.x * 0.5 + 0.5) * W, py = (0.5 - v.y * 0.5) * H;
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (py < minY) minY = py; if (py > maxY) maxY = py;
    if (v.z < minZ) minZ = v.z;
  }
  if (behind === 8) return;
  if (maxX < rx || minX > rx + rw || maxY < ry || minY > ry + rh) return;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  const maps = m ? MAPS.filter((k) => m[k]) : [];
  hits.push({
    px: [Math.round(minX), Math.round(minY), Math.round(maxX - minX), Math.round(maxY - minY)],
    dist: +near.toFixed(1),
    owner: ownerOf(o),
    node: o.name || null,
    parent: o.parent ? (o.parent.name || o.parent.type) : null,
    geo: geo.type,
    verts: geo.attributes.position.count,
    mat: m ? `${m.type}${m.name ? ':' + m.name : ''}` : null,
    maps: maps.length ? maps.join('+') : 'NONE',
    vcol: !!(m && m.vertexColors) && !!geo.attributes.color,
    flat: !!(m && m.flatShading),
    color: m && m.color ? '#' + m.color.getHexString() : null,
    rough: m && m.roughness !== undefined ? +m.roughness.toFixed(2) : null,
    world: [+o.matrixWorld.elements[12].toFixed(1), +o.matrixWorld.elements[13].toFixed(1), +o.matrixWorld.elements[14].toFixed(1)],
  });
});

hits.sort((a, b) => a.dist - b.dist);
return { shot: SHOT, rect: RECT, meshes: hits.length, hits: hits.slice(0, LIMIT) };

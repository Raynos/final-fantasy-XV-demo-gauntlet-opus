/*
 * Is the black roadside tyre BLACK because its albedo is 0x25262a, or because
 * it is receiving no light? The judge said "receiving no light", which would be
 * a different bug and a different fix, so measure it before treating it.
 *
 *   node src/tools/probe.mts src/tools/_probe/tyrelight.mts --dirty
 *
 * Method: park the party_dawn camera, find the `road_dark` mesh's screen rect
 * by projecting its own triangles, then read the FRAMEBUFFER inside that rect
 * with the material's albedo set to three known values. The ratio
 * rendered/albedo is the light the surface actually receives; a surface with
 * working lighting climbs with albedo, a surface with none does not.
 */
const g = window.GAME;
const { SHOTS } = await import('/game/Shots.ts');
const V3 = g.camera.position.constructor;

const shot = String(window.__SHOT || 'party_dawn');
g.applyShot(shot);
g.settle(40);
g.applyShot(shot);
g.settle(10);
const cam = g.camera;
cam.updateMatrixWorld(true);

// --- find the mesh and its on-screen footprint ------------------------------
let mesh = null, mat = null;
g.scene.traverseVisible((o) => {
  if (mesh || !o.isMesh || !o.name || o.name.indexOf('roadflat_road_dark') < 0) return;
  mesh = o; mat = Array.isArray(o.material) ? o.material[0] : o.material;
});
if (!mesh) return 'no roadflat_road_dark mesh in view';

const pr = new V3();
const pos = mesh.geometry.attributes.position;
const idx = mesh.geometry.index;
const n = idx ? idx.count : pos.count;
let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, seen = 0;
const cw = g.renderer.domElement.width, chh = g.renderer.domElement.height;
for (let i = 0; i < n; i++) {
  const vi = idx ? idx.getX(i) : i;
  pr.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
  if (pr.distanceTo(cam.position) > 12) continue;
  pr.project(cam);
  if (Math.abs(pr.x) > 1 || Math.abs(pr.y) > 1) continue;
  seen++;
  const sx = (pr.x * 0.5 + 0.5) * cw, sy = (-pr.y * 0.5 + 0.5) * chh;
  x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
  y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
}
if (!seen) return 'roadflat_road_dark has no vertex within 12 m on screen';
const rect = [Math.floor(x0), Math.floor(y0), Math.ceil(x1 - x0), Math.ceil(y1 - y0)];

// --- read the framebuffer inside that rect ----------------------------------
const c2 = document.createElement('canvas');
c2.width = rect[2]; c2.height = rect[3];
const ctx = c2.getContext('2d', { willReadFrequently: true });
const grab = () => {
  ctx.clearRect(0, 0, c2.width, c2.height);
  ctx.drawImage(g.renderer.domElement, rect[0], rect[1], rect[2], rect[3], 0, 0, c2.width, c2.height);
  return ctx.getImageData(0, 0, c2.width, c2.height).data;
};
const setMat = (hex, rough, metal) => {
  mat.color.setHex(hex); mat.roughness = rough; mat.metalness = metal; mat.needsUpdate = true;
  g.settle(4);
};
/**
 * The rect is a bounding box and most of it is ground, party and HUD. So the
 * MASK is derived by ablation rather than by luminance: the pixels that move
 * when the material's albedo goes from black to white ARE the prop, and nothing
 * else in the frame can move with it.
 */
setMat(0x000000, 0.78, 0.25); const black = grab();
setMat(0xffffff, 0.78, 0.25); const white = grab();
const mask = [];
for (let i = 0; i < black.length; i += 4) {
  const d = Math.abs(white[i] - black[i]) + Math.abs(white[i + 1] - black[i + 1]) + Math.abs(white[i + 2] - black[i + 2]);
  if (d > 24) mask.push(i);
}
const sample = () => {
  const d = grab();
  const m = [0, 0, 0];
  for (const i of mask) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; }
  return m.map((v) => +(v / Math.max(1, mask.length)).toFixed(1));
};

const out = [`shot ${shot}  rect ${rect.join(',')}  verts ${seen}  masked px ${mask.length} of ${black.length / 4}`];
const orig = mat.color.getHex();
for (const [label, hex, rough, metal] of [
  ['as-shipped 0x25262a', 0x25262a, 0.78, 0.25],
  ['albedo x2  0x4a4c54', 0x4a4c54, 0.78, 0.25],
  ['albedo x4  0x949aa8', 0x949aa8, 0.78, 0.25],
  ['pure white 0xffffff', 0xffffff, 0.78, 0.25],
  ['white, matte non-metal', 0xffffff, 0.95, 0.0],
]) {
  setMat(hex, rough, metal);
  const s = sample();
  const srgbAlbedo = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  out.push(`  ${label.padEnd(24)} albedo ${srgbAlbedo.join(',')}  ->  rendered ${s.join(',')}`);
}
mat.color.setHex(orig);
mat.roughness = 0.78; mat.metalness = 0.25; mat.needsUpdate = true;
g.settle(4);
return out.join('\n');

/**
 * What is drawing the quilted honeycomb on the rock faces?
 *
 * Ablation, per BRIEF.md: a frame says *that* something is wrong and is bad at
 * saying what. `--hide` can only remove the whole mesh, which cannot separate
 * the three candidates — the material's normal map, the material's albedo tile,
 * and this lane's `aRock` vertex-colour bake. So this poses one shot and
 * captures it four times in one boot with one contribution switched off each
 * time. Read the four frames side by side.
 *
 *   node src/tools/probe.mts src/tools/probes/rockquilt.mts --shot tmp/quilt/q.jpg
 */
const g = window.GAME;
await g.applyShot('poi_haven');
g.settle(40);
await window.__shot('0-base');

const rocks = g.get('Props').rocks;
const mat = rocks.groups[0].near.material;
const info = {
  material: mat.name || mat.type,
  hasMap: !!mat.map, hasNormalMap: !!mat.normalMap, hasRoughnessMap: !!mat.roughnessMap,
  vertexColors: mat.vertexColors,
  normalScale: mat.normalScale ? [mat.normalScale.x, mat.normalScale.y] : null,
  mapRepeat: mat.map ? [mat.map.repeat.x, mat.map.repeat.y] : null,
  shared: rocks.groups.every((gr) => gr.near.material === mat),
};

const nsx = mat.normalScale ? mat.normalScale.x : 0;
const nsy = mat.normalScale ? mat.normalScale.y : 0;
if (mat.normalScale) mat.normalScale.set(0, 0);
mat.needsUpdate = true;
g.settle(2);
await window.__shot('1-no-normalmap');
if (mat.normalScale) mat.normalScale.set(nsx, nsy);

mat.vertexColors = false;
mat.needsUpdate = true;
g.settle(2);
await window.__shot('2-no-vertexcolor');
mat.vertexColors = true;

const map = mat.map;
mat.map = null;
mat.needsUpdate = true;
g.settle(2);
await window.__shot('3-no-albedomap');
mat.map = map;
mat.needsUpdate = true;

return info;

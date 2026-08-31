// What does the skyline cost once it has actually landed?
//
// It is deferred past the first frame now, so a probe that measures at
// GAME.ready measures a scene with no skyline in it and learns nothing.
const g = window.GAME;
const t0 = performance.now();
while (performance.now() - t0 < 4000 && !(g.get('Props')?.mega?.root?.children?.length)) {
  g.frame(1 / 60);
  await new Promise((r) => setTimeout(r, 8));
}
const mega = g.get('Props').mega;
let meshes = 0, tris = 0;
const mats = new Set();
mega.root.traverse((o) => {
  const geo = o.geometry;
  if (!geo?.attributes?.position) return;
  meshes++;
  mats.add(o.material?.uuid);
  const idx = geo.index ? geo.index.count : geo.attributes.position.count;
  tris += (idx / 3) * (o.isInstancedMesh ? o.count : 1);
});
for (let i = 0; i < 30; i++) g.frame(1 / 60);
return {
  megaMeshes: meshes,
  megaMaterials: mats.size,
  megaMtris: +(tris / 1e6).toFixed(3),
  sceneDraws: g.rnd.renderer.info.render.calls,
  sceneTris: g.rnd.renderer.info.render.triangles,
};

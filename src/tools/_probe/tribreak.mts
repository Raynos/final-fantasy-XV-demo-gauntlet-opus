// Where do 6.4 million triangles come from on the phone path?
//
// A handset does maybe 1-2 M at 30 fps. Knowing the number is useless; knowing
// which group owns it is the whole job.
const g = window.GAME;
for (let i = 0; i < 20; i++) g.frame(1 / 60);

const tally = new Map();
const add = (k, tris, draws) => {
  const e = tally.get(k) || { tris: 0, draws: 0 };
  e.tris += tris; e.draws += draws; tally.set(k, e);
};
const cam = g.camera;
const frustum = new (Object.getPrototypeOf(cam.projectionMatrix).constructor.name === 'Matrix4'
  ? window.THREE_FRUSTUM || Object : Object)();

for (const top of g.scene.children) {
  const name = top.name || top.type;
  let tris = 0, draws = 0;
  top.traverseVisible((o) => {
    const geo = o.geometry;
    if (!geo || !geo.attributes || !geo.attributes.position) return;
    if (!o.visible) return;
    const idx = geo.index ? geo.index.count : geo.attributes.position.count;
    const n = o.isInstancedMesh ? o.count : 1;
    tris += (idx / 3) * n;
    draws += 1;
  });
  if (tris > 0) add(name, tris, draws);
}
void frustum;
const rows = [...tally.entries()]
  .map(([k, v]) => ({ group: k, mtris: +(v.tris / 1e6).toFixed(2), objects: v.draws }))
  .sort((a, b) => b.mtris - a.mtris)
  .slice(0, 14);
return {
  sceneTotalMtris: +(rows.reduce((s, r) => s + r.mtris, 0)).toFixed(2),
  renderedMtris: +(g.rnd.renderer.info.render.triangles / 1e6).toFixed(2),
  renderedDraws: g.rnd.renderer.info.render.calls,
  rows,
};

// Why does `--hide` render ~320 draws less than its control, whatever you hide?
//
//   node src/tools/probe.mts src/tools/_probe/hidephase.mts --dirty
//
// It is not the hide. It is the extra frame the hide pass steps.
// `Sky._updateCascades` refreshes the three shadow cascades on a stride of
// [1,2,4] at `ultra`, keyed on `game.time.frame`, and the cloud shadow map on
// `frame & 3`. `applyShot` calls `resetClock()`, so the daemon's pose ends at
// frame **8** — a multiple of 4, the phase on which all three cascades and the
// cloud shadow are due, i.e. the most expensive frame of the cycle. The hide
// pass then steps ONE more frame, photographing frame 9, where only the near
// cascade refreshes. Control = peak phase, ablation = trough.
const g = window.GAME;
const r = g.renderer;
const sky = g.get('Sky');
const SHOT = 'town_forecourt';

const snap = (tag) => ({
  tag,
  frame: g.time.frame,
  calls: r.info.render.calls,
  Mtris: +(r.info.render.triangles / 1e6).toFixed(4),
});

const hide = (needle) => {
  const want = needle.toLowerCase();
  const hidden = [];
  g.scene.traverse((o) => {
    const nm = (o.name || '').toLowerCase();
    if (nm && nm.includes(want)) { hidden.push({ o, was: o.visible }); o.visible = false; }
  });
  return hidden;
};

/** What is actually under a matched name: descendants, meshes, triangles. */
const subtree = (needle) => {
  const want = needle.toLowerCase();
  let roots = 0, meshes = 0, tris = 0, casters = 0;
  g.scene.traverse((o) => {
    const nm = (o.name || '').toLowerCase();
    if (!nm || !nm.includes(want)) return;
    roots++;
    o.traverse((c) => {
      const geo = c.geometry;
      if (!geo || !c.visible) return;
      const n = geo.index ? geo.index.count / 3 : (geo.attributes.position ? geo.attributes.position.count / 3 : 0);
      const inst = c.isInstancedMesh ? c.count : 1;
      meshes++; tris += n * inst; if (c.castShadow) casters++;
    });
  });
  return { needle, roots, meshes, triangles: tris, casters };
};

const out = {
  stride: sky && sky.cascadeStride,
  shadowMapAutoUpdate: r.shadowMap.autoUpdate,
  subjects: [subtree('poi_landmark_fossil_wood'), subtree('poi_kits')],
  cycle: [],
  arms: [],
};

// 1. the cycle: the control frame, then eight consecutive frames of the pose.
g.resetClock(); g.applyShot(SHOT); g.settle(60); g.applyShot(SHOT); g.settle(8);
out.cycle.push(snap('control — what a plain capture photographs'));
for (let i = 0; i < 8; i++) { g.frame(1 / 60); out.cycle.push(snap(`held +${i + 1}`)); }

// 2. today's arm and the fixed arm, for three ablations.
for (const needle of ['', 'poi_landmark_fossil_wood', 'poi_kits', 'grass']) {
  // TODAY: settle(8), hide, +1 frame  -> photographs frame 9
  g.resetClock(); g.applyShot(SHOT); g.settle(60); g.applyShot(SHOT); g.settle(8);
  let h = needle ? hide(needle) : [];
  if (needle) g.frame(1 / 60);
  out.arms.push({ ...snap(`TODAY  hide=${needle || '(none)'}`), matched: h.length });
  for (const x of h) x.o.visible = x.was;

  // FIXED: settle(7), hide, +1 frame  -> photographs frame 8, the control phase
  g.resetClock(); g.applyShot(SHOT); g.settle(60); g.applyShot(SHOT); g.settle(7);
  h = needle ? hide(needle) : [];
  g.frame(1 / 60);
  out.arms.push({ ...snap(`FIXED  hide=${needle || '(none)'}`), matched: h.length });
  for (const x of h) x.o.visible = x.was;
}
return out;

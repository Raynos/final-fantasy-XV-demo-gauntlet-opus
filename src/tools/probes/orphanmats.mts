// How many materials exist in a system's own tables but are NOT in the scene
// graph at boot -- and are therefore invisible to `renderer.compile()`?
//
// `probes/perfstall.mts` pins the last two >33 ms gameplay frames on exactly
// this: `road_rust` (`RoadFurniture.mats.rust`) links a program for the first
// time on frame 34 of `sprint+turn`, in one 41-91 ms draw call, when a road
// chunk streams in. `Warmup`'s own header lists "materials constructed lazily
// on first use" as a gap it does not cover, and this measures the size of it.
const g = window.GAME;
// NO applyShot and NO settle: this is the state `Warmup` itself runs in, which
// is the only state in which the question means anything. Posing first streams
// content in and hides the very orphans being counted.
if (window.__OM_POSE) { g.applyShot(String(window.__OM_POSE)); g.settle(30); }

const inScene = new Set();
g.scene.traverse((o) => {
  const m = o.material;
  if (!m) return;
  for (const x of (Array.isArray(m) ? m : [m])) inScene.add(x.uuid);
});

const found = [];
const seen = new Set();
const visit = (v, path, depth) => {
  if (!v || depth > 2 || typeof v !== 'object') return;
  if (v.isMaterial) {
    if (seen.has(v.uuid)) return;
    seen.add(v.uuid);
    found.push({ path, name: v.name || '', type: v.type, inScene: inScene.has(v.uuid) });
    return;
  }
  if (v.isObject3D || v.isBufferGeometry || v.isTexture || v.isVector3 || v.isMatrix4) return;
  if (Array.isArray(v)) { v.forEach((x, i) => visit(x, path + '[' + i + ']', depth + 1)); return; }
  if (v.constructor !== Object && depth > 0) return;   // only plain tables below the system
  for (const k of Object.keys(v)) {
    if (k.startsWith('__')) continue;
    let x; try { x = v[k]; } catch { continue; }
    visit(x, path + '.' + k, depth + 1);
  }
};
for (const s of g.systems) {
  const sn = (s.constructor && s.constructor.name) || 'system';
  for (const k of Object.keys(s)) {
    let x; try { x = s[k]; } catch { continue; }
    visit(x, sn + '.' + k, 0);
  }
}

const orphans = found.filter((f) => !f.inScene);
const bySystem = {};
for (const o of orphans) {
  const sys = o.path.split('.')[0];
  (bySystem[sys] || (bySystem[sys] = [])).push(o.path + (o.name ? ' (' + o.name + ')' : '') + ' ' + o.type);
}
return {
  totalReachable: found.length,
  inSceneAlready: found.length - orphans.length,
  orphans: orphans.length,
  programsNow: g.renderer.info.programs.length,
  bySystem: Object.fromEntries(Object.entries(bySystem).sort((a, b) => b[1].length - a[1].length)),
};

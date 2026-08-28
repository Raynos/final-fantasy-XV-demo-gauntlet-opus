// The last >33 ms gameplay frame: is it the shadow cascades, and how many
// casters land in them?
//
// `perfupload.mts` KILLED the buffer-upload half of the WS-6 hypothesis at
// HEAD: frames 15 and 34 of the `sprint+turn` replay cost 125.8 and 121.8 ms
// with `fresh 0, freshKb 0` -- not one geometry rendering for the first time --
// while the frame that DOES upload 497 KB of fresh Menace-POI geometry costs
// 6.4 ms. `perfsprint.mts` had already killed the compile half: zero new
// programs on either stall frame, 86-90 ms of ~90 ms inside `post.render`.
//
// That leaves the other candidate WS-6 named and never separated: shadow work
// for hundreds of casters entering the frustum as Hammerhead does. So this
// times `renderer.shadowMap.render` itself, splits every `renderBufferDirect`
// into shadow / colour, and records which cascades were due -- per frame, over
// the same replay the gate's `sprint+turn` segment runs.
//
// Run: node src/tools/probe.mts src/tools/probes/perfstall.mts
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const inp = g.input;
const rig = g.get('CameraRig');
const sky = g.get('Sky');
const hold = (...c) => { inp.keys.clear(); for (const k of c) inp.keys.add(k); };
const look = (x, y) => inp.look.set(x, y);
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();

const renderer = g.renderer;
const restore = [];

// --- the shadow pass, timed and counted -------------------------------------
let inShadow = false;
let shadowMs = 0, shadowDraws = 0, colourDraws = 0, shadowTris = 0;
const sm = renderer.shadowMap;
const smOrig = sm.render.bind(sm);
restore.push(() => { sm.render = smOrig; });
sm.render = function (...a) {
  const t0 = performance.now();
  inShadow = true;
  try { return smOrig(...a); } finally { inShadow = false; shadowMs += performance.now() - t0; }
};

// Per-draw wall time. ANGLE on Metal submits synchronously -- `perfhitch.mts`
// measured `gl.finish()` after a whole frame at 0.0 ms -- so a draw's own call
// already contains its GPU cost, and a multi-millisecond single draw is a
// pipeline being built, not a triangle being rasterised.
let slow = [];
// A Metal PSO is keyed by (program, vertex layout, attachment formats), NOT by
// the WebGL program alone -- which is why `renderer.info.programs` can be flat
// across a frame that builds a hundred pipelines. This is the nearest key a
// probe can form from inside WebGL.
const psoSeen = new Set();
let newPso = 0;
const rbdOrig = renderer.renderBufferDirect.bind(renderer);
restore.push(() => { renderer.renderBufferDirect = rbdOrig; });
renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
  if (inShadow) {
    shadowDraws++;
    const idx = geometry && geometry.index;
    const pos = geometry && geometry.attributes && geometry.attributes.position;
    const n = idx ? idx.count : (pos ? pos.count : 0);
    shadowTris += (n / 3) * (object && object.isInstancedMesh ? object.count : 1);
  } else colourDraws++;
  const t0 = performance.now();
  const r = rbdOrig(camera, scene, geometry, material, object, group);
  const ms = performance.now() - t0;
  const rt = renderer.getRenderTarget();
  const attach = rt ? ((rt.textures ? rt.textures.length : 1) + ':' + (rt.texture && rt.texture.type)
    + ':' + rt.width + 'x' + rt.height + (rt.depthBuffer ? 'd' : '')) : 'canvas';
  const prog = material && material.program;
  const key = (prog ? prog.id : material && material.uuid) + '|'
    + Object.keys(geometry ? geometry.attributes : {}).sort().join(',') + '|'
    + (inShadow ? 'S' : 'C') + '|' + attach;
  const fresh = !psoSeen.has(key);
  if (fresh) { psoSeen.add(key); newPso++; }
  if (ms > 0.8) {
    const chain = [];
    for (let o = object; o && chain.length < 6; o = o.parent) chain.push(o.name || o.type);
    slow.push({ ms: +ms.toFixed(1), fresh, name: (object && object.name) || (object && object.type),
      chain: chain.join('<'), mat: (material && (material.name || material.type)),
      matType: material && material.type, matUuid: material && material.uuid.slice(0, 8),
      attrs: Object.keys(geometry ? geometry.attributes : {}).sort().join(','),
      defines: material && material.defines ? Object.keys(material.defines).join(',').slice(0, 90) : '',
      uniforms: material && material.uniforms ? Object.keys(material.uniforms).join(',').slice(0, 240) : '',
      verts: geometry && geometry.attributes.position ? geometry.attributes.position.count : 0,
      at: object ? [object.position.x, object.position.y, object.position.z].map((v) => +v.toFixed(1)).join(',') : '',
      vs: material && material.vertexShader ? material.vertexShader.replace(/\s+/g, ' ').slice(0, 180) : '',
      attach, pass: inShadow ? 'shadow' : 'colour' });
  }
  return r;
};

// --- which cascades were due, and what the refit itself cost ----------------
let dueMask = '', cascadeMs = 0;
if (sky && typeof sky._updateCascades === 'function') {
  const uc = sky._updateCascades;
  restore.push(() => { sky._updateCascades = uc; });
  sky._updateCascades = function (frame) {
    const lights = this.csm.lights;
    const stride = this.cascadeStride;
    const cam = this.game.camera;
    const prev = this._camAnchor;
    const cut = !prev || prev.distanceToSquared(cam.position) > 100 || frame < 2;
    dueMask = lights.map((l, i) => (cut || l.shadow.needsUpdate || (frame % stride[i]) === 0) ? '1' : '.').join('');
    const t0 = performance.now();
    const r = uc.apply(this, arguments);
    cascadeMs += performance.now() - t0;
    return r;
  };
}

// exactly `gameplay.mts`'s first three segments, as `perfsprint.mts` replays them
const warm = (setup, each, n) => { setup(); for (let i = 0; i < 6; i++) { each && each(i); g.frame(dt); } for (let i = 0; i < n; i++) { each && each(i); g.frame(dt); } };
warm(() => hold(), null, 60);
warm(() => hold('KeyW'), null, 120);
warm(() => hold('KeyW', 'ShiftLeft'), null, 150);

hold('KeyW', 'ShiftLeft');
const each = (i) => look(Math.sin(i * 0.06) * 22, Math.sin(i * 0.021) * 5);
for (let i = 0; i < 6; i++) { each(i); g.frame(dt); }
gl.finish();
await new Promise((r) => setTimeout(r, 400));

const rows = [];
// `perfsprint.mts` compares programs by `name|cacheKey.length` STRINGS, so a
// program whose key-string is already in the list reads as "no new program".
// Count them instead.
let prevProg = renderer.info.programs.length;
// The whole key, not the count: what a linked program differs from its
// nearest already-linked twin BY is the whole diagnosis.
let prevKeys = renderer.info.programs.map((p) => p.cacheKey);
for (let i = 0; i < 150; i++) {
  each(i);
  gl.finish();
  shadowMs = 0; shadowDraws = 0; colourDraws = 0; shadowTris = 0; cascadeMs = 0; dueMask = ''; slow = []; newPso = 0;
  const t0 = performance.now();
  g.frame(dt);
  gl.finish();
  const ms = performance.now() - t0;
  slow.sort((a, b) => b.ms - a.ms);
  const nProg = renderer.info.programs.length;
  const nowKeys = renderer.info.programs.map((p) => p.cacheKey);
  const addedKeys = nowKeys.filter((k) => !prevKeys.includes(k));
  // Nearest twin by longest common prefix, which is where three's key puts the
  // material's own identity.
  const twin = (k) => {
    let best = null, bestN = -1;
    for (const o of prevKeys) {
      let n = 0; while (n < k.length && n < o.length && k[n] === o[n]) n++;
      if (n > bestN) { bestN = n; best = o; }
    }
    return { common: bestN, mine: k.slice(Math.max(0, bestN - 40), bestN + 160), twin: best ? best.slice(Math.max(0, bestN - 40), bestN + 160) : null };
  };
  rows.push({ i, ms: +ms.toFixed(1), dProg: nProg - prevProg,
    addedKeys: addedKeys.map(twin), shadowMs: +shadowMs.toFixed(1), cascadeMs: +cascadeMs.toFixed(1),
    shadowDraws, colourDraws, shadowMtris: +(shadowTris / 1e6).toFixed(2), due: dueMask,
    newPso, slowMs: +slow.reduce((s2, x) => s2 + x.ms, 0).toFixed(1), slowN: slow.length,
    slow: slow.slice(0, 10) });
  prevProg = nProg; prevKeys = nowKeys;
  await new Promise((r) => requestAnimationFrame(r));
}
restore.forEach((f) => f());

// Report the spikes and, for contrast, the median frame on each cascade phase.
const sorted = rows.slice().sort((a, b) => b.ms - a.ms);
const byPhase = {};
for (const r of rows) (byPhase[r.due] || (byPhase[r.due] = [])).push(r);
const med = (a, k) => { const s = a.map((r) => r[k]).sort((x, y) => x - y); return +s[s.length >> 1].toFixed(1); };
return {
  spikes: sorted.slice(0, 6),
  phases: Object.entries(byPhase).map(([due, a]) => ({
    due, n: a.length, medMs: med(a, 'ms'), medShadowMs: med(a, 'shadowMs'),
    medShadowDraws: med(a, 'shadowDraws'), medColourDraws: med(a, 'colourDraws'),
    medShadowMtris: med(a, 'shadowMtris'), medNewPso: med(a, 'newPso'), medSlowMs: med(a, 'slowMs'),
  })),
};

// perf-r3: `streaming-traverse` gets DEARER every time you run it in one page.
//
// Interleaved against a stand-still control on the same page
// (`perfpace3.mts`), the traverse arm goes 11.4 -> 16.2 -> 17.3 ms while the
// control stays at 8.0 / 6.9 / 7.6 / 7.6 and `renderer.info` reports the same
// 513 draws and 7.6 M triangles every time. So it is not thermal, not the box,
// and not more content on screen -- something the traverse leaves behind makes
// the next traverse cost more.
//
// This runs the same arm four times with every system timed, and counts what
// is resident, so the growing thing can be named.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const inp = g.input;
const player = g.get('Player');
const rig = g.get('CameraRig');
const hold = (...c) => { inp.keys.clear(); for (const k of c) inp.keys.add(k); };

let cur = null;
const names = g.systems.map((s, i) => (s.constructor && s.constructor.name) || ('system' + i));
g.systems.forEach((s, i) => {
  for (const hook of ['update', 'lateUpdate']) {
    if (typeof s[hook] !== 'function') continue;
    const orig = s[hook]; const key = names[i] + '.' + hook;
    s[hook] = function (...a) {
      const t0 = performance.now(); const r = orig.apply(this, a);
      if (cur) cur[key] = (cur[key] || 0) + (performance.now() - t0); return r;
    };
  }
});
for (const hook of ['update', 'render']) {
  const orig = g.post[hook];
  g.post[hook] = function (...a) {
    const t0 = performance.now(); const r = orig.apply(this, a);
    if (cur) cur['post.' + hook] = (cur['post.' + hook] || 0) + (performance.now() - t0); return r;
  };
}

// What is resident: every scene object, every TileStream's live-cell count,
// and the total item count those cells hold.
const census = () => {
  let objs = 0, meshes = 0, visible = 0;
  g.scene.traverse((o) => { objs++; if (o.isMesh || o.isInstancedMesh) { meshes++; if (o.visible) visible++; } });
  const streams = {};
  const seen = new Set();
  const walk = (obj, path, depth) => {
    if (!obj || depth > 3 || seen.has(obj)) return;
    seen.add(obj);
    for (const k of Object.keys(obj)) {
      let v;
      try { v = obj[k]; } catch (e) { continue; }
      if (!v || typeof v !== 'object') continue;
      if (v.live instanceof Map && typeof v.cell === 'number') {
        let items = 0;
        for (const arr of v.live.values()) items += (arr && arr.length) || 0;
        streams[path + '.' + k] = v.live.size + '/' + items;
      } else if (v.constructor && v.constructor.name && !Array.isArray(v) && !v.isObject3D && !v.isMaterial && !v.isBufferGeometry) {
        walk(v, path + '.' + k, depth + 1);
      }
    }
  };
  for (let i = 0; i < g.systems.length; i++) walk(g.systems[i], names[i], 0);
  return { objs, meshes, visible, streams };
};

const each = (i) => {
  if (i % 12 === 0 && player) {
    const a = i * 0.7;
    player.root.position.x = Math.cos(a) * (120 + i * 3);
    player.root.position.z = Math.sin(a) * (120 + i * 3);
  }
};

g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
const home = player ? player.position.clone() : null;

const run = async (n) => {
  g.get('Director') && g.get('Director').setScenario && g.get('Director').setScenario('field');
  hold('KeyW', 'ShiftLeft');
  if (home && player) player.root.position.copy(home);
  for (let i = 0; i < 6; i++) { each(i); g.frame(dt); }
  gl.finish();
  await new Promise((r) => setTimeout(r, 300));
  const s = [], acc = {};
  for (let i = 0; i < n; i++) {
    each(i);
    gl.finish();
    cur = {};
    const t0 = performance.now();
    g.frame(dt);
    gl.finish();
    s.push(performance.now() - t0);
    for (const k in cur) acc[k] = (acc[k] || 0) + cur[k];
    cur = null;
    await new Promise((r) => requestAnimationFrame(r));
  }
  const so = [...s].sort((a, b) => a - b);
  const c = census();
  return {
    median: +so[n >> 1].toFixed(2),
    p95: +so[Math.floor(n * 0.95)].toFixed(2),
    max: +so[n - 1].toFixed(2),
    over16pct: +(100 * s.filter((x) => x > 16.7).length / n).toFixed(0),
    draws: g.renderer.info.render.calls,
    objs: c.objs, meshes: c.meshes, visible: c.visible,
    perFrameMs: Object.entries(acc).map(([k, v]) => [k, +(v / n).toFixed(2)])
      .filter(([, v]) => v >= 0.15).sort((a, b) => b[1] - a[1]).slice(0, 10),
    streams: c.streams,
  };
};

const rows = [];
for (let k = 0; k < 4; k++) rows.push(await run(180));
if (home && player) player.root.position.copy(home);
hold();
return rows;

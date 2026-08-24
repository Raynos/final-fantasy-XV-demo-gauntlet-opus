// perf-r2: what the three vegetation budgets are worth on `streaming-traverse`,
// measured by toggling them at runtime in one page, interleaved, so a busy
// trunk cannot answer. Same shape as `perfbudget.mts` for the prop streams.
// Arms: shipped (grass 2 / trees 2 / bushes 1 ms) against a proposed half.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const inp = g.input;
const player = g.get('Player');
const veg = g.get('Vegetation');
const props = g.get('Props');
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();

const layers = [veg.grass, veg.trees, veg.bushes].filter(Boolean);
const shipped = layers.map((l) => l.budgetMs);
const ARMS = { shipped, half: shipped.map((v) => v / 2) };

const pass = async (arm) => {
  layers.forEach((l, i) => { l.budgetMs = ARMS[arm][i]; });
  if (player) { player.root.position.x = 120; player.root.position.z = 0; }
  inp.keys.clear(); inp.keys.add('KeyW'); inp.keys.add('ShiftLeft');
  g.get('Director') && g.get('Director').setScenario('field');
  for (let i = 0; i < 20; i++) g.frame(dt);
  if (veg.converge) veg.converge();
  if (props && props.converge) props.converge();
  gl.finish();
  await new Promise((r) => setTimeout(r, 350));
  const s = [];
  let tris = 0;
  for (let i = 0; i < 180; i++) {
    if (i % 12 === 0 && player) {
      const a = i * 0.7;
      player.root.position.x = Math.cos(a) * (120 + i * 3);
      player.root.position.z = Math.sin(a) * (120 + i * 3);
    }
    gl.finish();
    const t0 = performance.now();
    g.frame(dt);
    gl.finish();
    s.push(performance.now() - t0);
    tris += g.renderer.info.render.triangles;
    await new Promise((r) => setTimeout(r, 0));
  }
  const so = [...s].sort((a, b) => a - b);
  return { arm, medianMs: +so[90].toFixed(2), fps: +(1000 / so[90]).toFixed(1),
           p95: +so[171].toFixed(2), over16: s.filter((x) => x > 16.7).length,
           over33: s.filter((x) => x > 33).length,
           // resident triangles: the thing a smaller budget could quietly cost
           meanTrisM: +(tris / 180 / 1e6).toFixed(2) };
};
const out = [];
for (const a of ['shipped', 'half', 'half', 'shipped', 'shipped', 'half']) out.push(await pass(a));
layers.forEach((l, i) => { l.budgetMs = shipped[i]; });
const med = (xs) => { const v = xs.slice().sort((a, b) => a - b); return +v[v.length >> 1].toFixed(2); };
const by = (a, k) => med(out.filter((r) => r.arm === a).map((r) => r[k]));
return {
  shipped, passes: out,
  medianMs: { shipped: by('shipped', 'medianMs'), half: by('half', 'medianMs') },
  fps: { shipped: +(1000 / by('shipped', 'medianMs')).toFixed(1), half: +(1000 / by('half', 'medianMs')).toFixed(1) },
  meanTrisM: { shipped: by('shipped', 'meanTrisM'), half: by('half', 'meanTrisM') },
};

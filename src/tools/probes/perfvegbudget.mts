// The vegetation streaming budget is a knob, and it was set against a frame
// time that was never real.
//
// `perfstream.mts` attributes `streaming-traverse` -- the one segment under
// target -- as `Vegetation.update` 7.8 ms, `Props.update` 3.0 ms and
// `post.render` 4.3 ms, on a 16.6 ms steady frame. The 7.8 is not emergent:
// `GrassField.budgetMs` is 4, `Trees.budgetMs` is 4 and `Bushes.budgetMs` is 2,
// so the streamers are *told* they may spend 10 ms of wall clock per frame and
// they spend most of it. Those constants were chosen when a frame was believed
// to cost 23 ms, where 10 ms of streaming is a large but arguable share. The
// frame costs 4.3 ms.
//
// This sweeps the three budgets together and reports both halves of the
// trade: what the traverse frame costs, and how much vegetation is actually
// resident by the end of it. A budget cut that halves the frame and also
// halves the grass on screen is not a win, and residency is the only thing
// that says which happened.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;

g.get('Director') && g.get('Director').setScenario && g.get('Director').setScenario('field');
const player = g.get('Player');
const veg = g.get('Vegetation');
const streamers = [veg.grass, veg.bushes, veg.trees];
const original = streamers.map((s) => s.budgetMs);

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

const traverse = async (scale) => {
  streamers.forEach((s, i) => { s.budgetMs = original[i] * scale; });
  // Start every condition from the same place and the same resident set.
  if (player) { player.root.position.x = 120; player.root.position.z = 0; }
  for (let i = 0; i < 8; i++) g.frame(dt);
  if (veg.converge) veg.converge();
  await new Promise((r) => setTimeout(r, 400));

  const frames = [], vegMs = [];
  const orig = veg.update;
  veg.update = function (...a) {
    const t0 = performance.now();
    const r = orig.apply(this, a);
    vegMs.push(performance.now() - t0);
    return r;
  };
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
    frames.push(performance.now() - t0);
    await new Promise((r) => setTimeout(r, 0));
  }
  veg.update = orig;

  // Residency: what is actually on screen at the end of the traverse. Draw
  // calls and triangles from the vegetation groups only, so a budget cut that
  // simply drew less grass cannot hide inside a faster frame.
  let vegTris = 0, vegDraws = 0;
  for (const root of [veg.grass.group, veg.bushes.group, veg.trees.group]) {
    root.traverse((o) => {
      if (!o.visible || !o.geometry) return;
      const idx = o.geometry.index;
      const pos = o.geometry.attributes && o.geometry.attributes.position;
      const count = idx ? idx.count : (pos ? pos.count : 0);
      vegDraws += 1;
      vegTris += (count / 3) * (o.count != null ? o.count : 1);
    });
  }
  return {
    budgetMs: streamers.map((s) => +s.budgetMs.toFixed(1)).join('/'),
    frameMs: +q(frames, 0.5).toFixed(2),
    fps: Math.round(1000 / q(frames, 0.5)),
    over16: Math.round(frames.filter((x) => x > 16.7).length / frames.length * 100) + '%',
    vegUpdateMs: +q(vegMs, 0.5).toFixed(2),
    residentVegDraws: vegDraws,
    residentVegMtris: +(vegTris / 1e6).toFixed(2),
  };
};

const out = [];
for (const scale of [1, 0.5, 0.25]) out.push(await traverse(scale));
streamers.forEach((s, i) => { s.budgetMs = original[i]; });
out.push(await traverse(1));
return { note: 'last row repeats scale 1 as a control', out };

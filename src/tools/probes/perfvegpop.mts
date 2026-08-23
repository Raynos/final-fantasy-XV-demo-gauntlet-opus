// Does halving the vegetation streaming budget show as pop-in?
//
// `perfvegbudget.mts` says halving it (4/2/4 -> 2/1/2 ms) takes the traverse
// frame from 14.4 to 12.3 ms and the over-budget share from 19% to 6%, with
// resident vegetation triangles unchanged or better. Residency at one instant
// is a weak measure of a streaming defect, and the normal capture path cannot
// see this at all: `Vegetation.converge()` ignores `budgetMs` entirely and
// `Game.settle` calls it, so every posed shot in the corpus is fully filled
// whatever the budget is. The only way pop-in shows is to photograph the
// middle of a traverse without converging.
//
// Same seed, same path, same frame index, one capture per budget.
const g = window.GAME;
const dt = 1 / 60;
g.get('Director') && g.get('Director').setScenario && g.get('Director').setScenario('field');
const player = g.get('Player');
const veg = g.get('Vegetation');
const streamers = [veg.grass, veg.bushes, veg.trees];
const original = streamers.map((s) => s.budgetMs);

const run = async (scale, label) => {
  streamers.forEach((s, i) => { s.budgetMs = original[i] * scale; });
  // Reset to the same start and let it fill ONCE, so both conditions begin
  // from an identical resident set; after that the budget is on its own.
  if (player) { player.root.position.x = 120; player.root.position.z = 0; }
  for (let i = 0; i < 8; i++) g.frame(dt);
  if (veg.converge) veg.converge();
  for (let i = 0; i < 90; i++) {
    if (i % 12 === 0 && player) {
      const a = i * 0.7;
      player.root.position.x = Math.cos(a) * (120 + i * 3);
      player.root.position.z = Math.sin(a) * (120 + i * 3);
    }
    g.frame(dt);
    await new Promise((r) => setTimeout(r, 0));
  }
  await window.__shot(label);
  let tris = 0;
  for (const root of [veg.grass.group, veg.bushes.group, veg.trees.group]) {
    root.traverse((o) => {
      if (!o.visible || !o.geometry) return;
      const idx = o.geometry.index, pos = o.geometry.attributes && o.geometry.attributes.position;
      tris += ((idx ? idx.count : (pos ? pos.count : 0)) / 3) * (o.count != null ? o.count : 1);
    });
  }
  return { label, budgetMs: streamers.map((s) => s.budgetMs).join('/'), residentMtris: +(tris / 1e6).toFixed(2) };
};

const full = await run(1, 'budget-full');
const half = await run(0.5, 'budget-half');
streamers.forEach((s, i) => { s.budgetMs = original[i]; });
return { full, half };

// perf-r2: `menu-open` hitches -- is it the menu DOM at all?
//
// The 26 px backdrop blur is already ruled out (perfmenu.mts: 20 hitches with
// it, 21 without). This asks the next question down: with the menu logic
// running exactly as it does but its DOM subtree hidden, and with no menu at
// all, does the spike survive? Interleaved A-B-C-C-B-A so drift cannot answer.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const menus = g.get('Menus');
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
g.input.keys.clear();

const origUpdate = menus.update;
let mode = 'on';
menus.update = function (...a) {
  const r = origUpdate.apply(this, a);
  if (mode === 'hidden' && this.root) this.root.style.display = 'none';
  return r;
};
const script = (i) => {
  if (i === 5) menus.setScreen('main');
  if (i === 30) menus.setScreen('ascension');
  if (i === 55) menus.setScreen('inventory');
  if (i === 80) menus.setScreen(null);
};
const pass = async (m) => {
  mode = m;
  menus.setScreen(null);
  for (let i = 0; i < 20; i++) g.frame(dt);
  gl.finish();
  await new Promise((r) => setTimeout(r, 300));
  const s = [];
  for (let i = 0; i < 90; i++) {
    if (m !== 'nomenu') script(i);
    gl.finish();
    const t0 = performance.now();
    g.frame(dt);
    gl.finish();
    s.push(performance.now() - t0);
    await new Promise((r) => setTimeout(r, 0));
  }
  const so = [...s].sort((a, b) => a - b);
  return { mode: m, medianMs: +so[45].toFixed(2), p95: +so[85].toFixed(2), maxMs: +so[89].toFixed(2),
           over16: s.filter((x) => x > 16.7).length, over33: s.filter((x) => x > 33).length };
};
const out = [];
for (const m of ['on', 'hidden', 'nomenu', 'nomenu', 'hidden', 'on']) out.push(await pass(m));
menus.update = origUpdate;
menus.setScreen(null);
if (menus.root) menus.root.style.display = '';
const agg = {};
for (const r of out) { (agg[r.mode] || (agg[r.mode] = { over33: 0, over16: 0, max: 0 })); agg[r.mode].over33 += r.over33; agg[r.mode].over16 += r.over16; agg[r.mode].max = Math.max(agg[r.mode].max, r.maxMs); }
return { passes: out, totals: agg };

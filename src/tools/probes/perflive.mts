// perf-r3: what the SHIPPED loop actually delivers, menu closed vs open.
//
// Every perf number in this repo is taken by a harness loop that calls
// `GAME.frame(dt)` by hand and yields with `setTimeout(0)`. `Game.start()` is
// what a player runs: one `frame()` per `requestAnimationFrame`. This measures
// the real thing -- the interval between successive presented frames -- so the
// menu stall can be judged as a cost the player pays or an artefact of the
// ruler's pacing.
//
// `dropped` is the honest headline: intervals over 33 ms, i.e. `BRIEF.md`'s
// hard rule measured the way a player experiences it.
const g = window.GAME;
const menus = g.get('Menus');
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
g.input.keys.clear();

const q = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { median: +at(0.5).toFixed(2), p95: +at(0.95).toFixed(2), p99: +at(0.99).toFixed(2), max: +s[s.length - 1].toFixed(2) };
};

const sample = async (label, setup, n) => {
  setup();
  g.start();
  // let the loop settle before recording
  await new Promise((r) => setTimeout(r, 700));
  const iv = [];
  await new Promise((resolve) => {
    let last = performance.now(), i = 0;
    const tick = () => {
      const t = performance.now();
      iv.push(t - last); last = t;
      if (++i >= n) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  g.stop();
  return { label, frames: n, ...q(iv), over16: iv.filter((x) => x > 16.9).length, dropped33: iv.filter((x) => x > 33).length, fps: +(1000 / q(iv).median).toFixed(1) };
};

const rows = [];
for (const pass of [0, 1]) {
  rows.push(await sample(`closed #${pass}`, () => { menus.setScreen(null); g.input.keys.clear(); }, 240));
  rows.push(await sample(`menu   #${pass}`, () => { menus.setScreen('main'); }, 240));
  rows.push(await sample(`walk   #${pass}`, () => { menus.setScreen(null); g.input.keys.clear(); g.input.keys.add('KeyW'); }, 240));
}
menus.setScreen(null); g.input.keys.clear(); g.stop();
return rows;

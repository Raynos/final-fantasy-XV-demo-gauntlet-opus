// perf-r2: what `TileStream.budgetMs` is worth, measured so a busy machine
// cannot answer.
//
// The obvious A/B — run `gameplay.mts` before and after the commit — is not
// available honestly here: other lanes are live on this trunk, so HEAD's
// content moves between the two halves and the machine's load moves with it.
// The budget is a *runtime* field, so both arms can be measured in ONE page,
// on ONE build, interleaved A-B-B-A, with the only difference being the number
// in `stream.budgetMs`. `budgetMs = 0` is exactly the pre-commit behaviour.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const inp = g.input;
const player = g.get('Player');
const props = g.get('Props');
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();

const streams = [];
if (props && props.rocks) {
  if (props.rocks.stream) streams.push(props.rocks.stream);
  if (props.rocks.outcrops) streams.push(props.rocks.outcrops);
}
if (props && props.debris && props.debris.stream) streams.push(props.debris.stream);
const shipped = streams.map((s) => s.budgetMs);
if (!shipped.some((v) => v > 0)) return { error: 'no budgetMs on this build', shipped };

const pass = async (on) => {
  streams.forEach((s, i) => { s.budgetMs = on ? shipped[i] : 0; });
  // Put the world back where the traverse starts, and let it settle there so
  // neither arm inherits the other's backlog.
  if (player) { player.root.position.x = 120; player.root.position.z = 0; }
  inp.keys.clear(); inp.keys.add('KeyW'); inp.keys.add('ShiftLeft');
  g.get('Director') && g.get('Director').setScenario('field');
  for (let i = 0; i < 20; i++) g.frame(dt);
  if (props && props.converge) props.converge();
  gl.finish();
  await new Promise((r) => setTimeout(r, 350));
  const s = [];
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
    await new Promise((r) => setTimeout(r, 0));
  }
  const so = [...s].sort((a, b) => a - b);
  return { on, medianMs: +so[90].toFixed(2), p95: +so[171].toFixed(2), maxMs: +so[179].toFixed(2),
           fps: +(1000 / so[90]).toFixed(1), over16: s.filter((x) => x > 16.7).length, over33: s.filter((x) => x > 33).length };
};
const out = [];
for (const on of [false, true, true, false, false, true]) out.push(await pass(on));
streams.forEach((s, i) => { s.budgetMs = shipped[i]; });
const med = (xs) => { const v = xs.slice().sort((a, b) => a - b); return +v[v.length >> 1].toFixed(2); };
return {
  shippedBudgetMs: shipped,
  passes: out,
  medianOfMedians: { off: med(out.filter((r) => !r.on).map((r) => r.medianMs)), on: med(out.filter((r) => r.on).map((r) => r.medianMs)) },
  fps: { off: +(1000 / med(out.filter((r) => !r.on).map((r) => r.medianMs))).toFixed(1), on: +(1000 / med(out.filter((r) => r.on).map((r) => r.medianMs))).toFixed(1) },
};

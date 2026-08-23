// Is the outer-cascade resolution visible, and what does it cost?
//
// `Sky` halved cascades 2 and 3 as part of a group of three savings taken
// against a frame time that was five times too slow. The other two saved draw
// calls; this one saves only shadow-map fill, and the frame is draw-bound. So
// the question is purely whether the pixels move.
//
// Shoots the same frame at [res, res/2, res/2] and at [res, res, res] from one
// page, so nothing but the map size differs, and prints the frame time of each.
//
//   node src/tools/probe.mts src/tools/probes/shadowres.mts --shot tmp/shots/shres/x.png
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'zone_fallgrove';
const sky = g.get('Sky');

g.resetClock(); g.applyShot(shot); g.settle(60); g.applyShot(shot); g.settle(8);

const setRes = (r) => {
  sky.cascadeRes = r.slice();
  sky.csm.lights.forEach((l, i) => {
    if (l.shadow.mapSize.x === r[i]) return;
    l.shadow.mapSize.setScalar(r[i]);
    if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
    l.shadow.needsUpdate = true;
  });
};

const measure = async () => {
  await new Promise((res) => setTimeout(res, 300));
  const ms = [];
  for (let i = 0; i < 80; i++) {
    gl.finish();
    const t0 = performance.now();
    g.frame(1 / 60);
    gl.finish();
    ms.push(performance.now() - t0);
    const spare = 16.7 - (performance.now() - t0);
    await new Promise((res) => setTimeout(res, spare > 0 ? spare : 0));
  }
  const calm = ms.filter((x) => x <= 16.7).sort((a, b) => a - b);
  return +calm[calm.length >> 1].toFixed(2);
};

const base = sky.cascadeRes[0];
const lines = [];
// ABAB, so a drifting machine cannot be mistaken for a difference.
for (const pass of [0, 1]) {
  for (const [name, r] of [['half', [base, base / 2, base / 2]], ['full', [base, base, base]]]) {
    setRes(r);
    g.applyShot(shot); g.settle(6);
    const t = await measure();
    lines.push('  pass ' + pass + '  ' + name + ' ' + JSON.stringify(sky.cascadeRes) + '  ' + t + ' ms');
    if (pass === 0) window.__shot(name);
  }
}
return shot + '\n' + lines.join('\n');

// Does the cast shadow stopping at 190 m show, and what does moving it cost?
//
// `CSM.maxFar` is 190 with the note "260 m put the far cascade's texels on
// ground that aerial perspective has already washed out". That was decided
// against a 23 ms frame that did not exist, and against a far cascade running
// at half resolution -- at full resolution 320 m has *better* texel density
// than 190 m had before.
//
// ABAB over four configurations from one page, with a capture of each.
//
//   node src/tools/probe.mts src/tools/probes/shadowfar.mts --shot tmp/shots/shfar/x.png
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'zone_fallgrove';
const sky = g.get('Sky');

g.resetClock(); g.applyShot(shot); g.settle(60); g.applyShot(shot); g.settle(8);

const base = 2048;
const setCfg = (res, far) => {
  sky.cascadeRes = res.slice();
  sky.csm.lights.forEach((l, i) => {
    if (l.shadow.mapSize.x !== res[i]) {
      l.shadow.mapSize.setScalar(res[i]);
      if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
    }
    l.shadow.needsUpdate = true;
  });
  sky.csm.maxFar = far;
  sky.csm.updateFrustums();
};

const measure = async () => {
  await new Promise((res) => setTimeout(res, 300));
  const ms = [], draws = [];
  for (let i = 0; i < 80; i++) {
    gl.finish();
    const t0 = performance.now();
    g.frame(1 / 60);
    gl.finish();
    ms.push(performance.now() - t0);
    draws.push(g.renderer.info.render.calls);
    const spare = 16.7 - (performance.now() - t0);
    await new Promise((res) => setTimeout(res, spare > 0 ? spare : 0));
  }
  const calm = ms.filter((x) => x <= 16.7).sort((a, b) => a - b);
  draws.sort((a, b) => a - b);
  return { ms: +calm[calm.length >> 1].toFixed(2), draws: draws[draws.length >> 1] };
};

const cfgs = [
  ['half190', [base, base / 2, base / 2], 190],
  ['full190', [base, base, base], 190],
  ['full320', [base, base, base], 320],
  ['half320', [base, base / 2, base / 2], 320],
];
const lines = [];
for (const pass of [0, 1]) {
  for (const [name, res, far] of cfgs) {
    setCfg(res, far);
    g.applyShot(shot); g.settle(6);
    const r = await measure();
    lines.push('  pass ' + pass + '  ' + name.padEnd(9) + r.ms + ' ms   ' + r.draws + ' draws');
    if (pass === 0) window.__shot(name);
  }
}
return shot + '\n' + lines.join('\n');

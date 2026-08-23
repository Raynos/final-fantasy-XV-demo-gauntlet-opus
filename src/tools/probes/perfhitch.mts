// What is the periodic 20-90 ms stall, and is it CPU or GPU?
//
// With the ruler yielding, a held `party_walk` medians 5.4 ms but spends 23% of
// its frames over 16.7 ms, in bursts of about three spikes every ten frames --
// roughly six times a second. Nothing like it appears in the old numbers,
// because the old loop never returned to the event loop and therefore never
// let a single promise continuation, timer or decode callback run. Whatever
// this is, it has been invisible for the life of the project and it is a far
// worse defect than a slow mean.
//
// Three clocks per frame, so the spike has to declare where it lives:
//   gap  -- from the end of the previous frame to the start of this one,
//           which is where anything the game does off the render path runs
//   cpu  -- `g.frame()` returning
//   gpu  -- the `gl.finish()` after it
// plus the renderer's own counters, so a spike that is a texture upload or a
// shader compile is separable from one that is just more drawing.
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'party_walk';
const yieldTask = () => new Promise((r) => setTimeout(r, 0));

g.resetClock(); g.applyShot(shot); g.settle(40); g.applyShot(shot); g.settle(8);
await new Promise((r) => setTimeout(r, 400));

const rows = [];
let prevEnd = performance.now();
const info = g.renderer.info;
let prevProg = info.programs ? info.programs.length : 0;
let prevTex = info.memory.textures;
let prevGeo = info.memory.geometries;

for (let i = 0; i < 200; i++) {
  gl.finish();
  const t0 = performance.now();
  g.frame(1 / 60);
  const t1 = performance.now();
  gl.finish();
  const t2 = performance.now();
  const prog = info.programs ? info.programs.length : 0;
  rows.push({
    i,
    gap: +(t0 - prevEnd).toFixed(1),
    cpu: +(t1 - t0).toFixed(1),
    gpu: +(t2 - t1).toFixed(1),
    dProg: prog - prevProg,
    dTex: info.memory.textures - prevTex,
    dGeo: info.memory.geometries - prevGeo,
    draws: info.render.calls,
  });
  prevProg = prog; prevTex = info.memory.textures; prevGeo = info.memory.geometries;
  prevEnd = t2;
  const spare = 16.7 - (t2 - t0);
  if (spare > 0) await new Promise((r) => setTimeout(r, spare)); else await yieldTask();
}

const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return +s[s.length >> 1].toFixed(2); };
const spikes = rows.filter((r) => r.cpu + r.gpu > 16.7);
const fmt = (r) => `${r.i}: gap ${r.gap} cpu ${r.cpu} gpu ${r.gpu}` +
  (r.dProg ? ` prog+${r.dProg}` : '') + (r.dTex ? ` tex+${r.dTex}` : '') +
  (r.dGeo ? ` geo+${r.dGeo}` : '') + ` draws ${r.draws}`;

return {
  shot,
  medians: { gap: med(rows.map((r) => r.gap)), cpu: med(rows.map((r) => r.cpu)), gpu: med(rows.map((r) => r.gpu)) },
  spikeCount: spikes.length,
  spikeMedians: spikes.length
    ? { gap: med(spikes.map((r) => r.gap)), cpu: med(spikes.map((r) => r.cpu)), gpu: med(spikes.map((r) => r.gpu)) }
    : null,
  totals: {
    programsAdded: rows.reduce((a, r) => a + r.dProg, 0),
    texturesAdded: rows.reduce((a, r) => a + r.dTex, 0),
    geometriesAdded: rows.reduce((a, r) => a + r.dGeo, 0),
  },
  firstSpikes: spikes.slice(0, 20).map(fmt),
  biggestGaps: rows.slice().sort((a, b) => b.gap - a.gap).slice(0, 8).map(fmt),
};

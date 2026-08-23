// Is the periodic 20-90 ms stall garbage collection?
//
// What is already ruled out for it: any game system (`perfsystems.mts` --
// every one is 0.1-0.4 ms and flat across spikes), any composer pass
// (`perfpasses.mts` -- the extra time lands on whichever pass is executing,
// which no pass can cause), canvas presentation (`perfpresent.mts` -- 41 spikes
// in 200 frames rendering offscreen against 45 rendering to the screen), and
// any resource creation (`perfhitch.mts` -- zero programs, textures or
// geometries created across 200 frames).
//
// What is left is the one thing that only becomes possible once the loop
// yields, which is exactly when the stalls appeared: V8 running a collection
// in the idle slot. This correlates the heap against the frame time. A sawtooth
// whose drops line up with the spikes names it; a heap that grows smoothly
// through a spike clears GC and the search continues.
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'party_walk';
const mem = () => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : -1);

g.resetClock(); g.applyShot(shot); g.settle(40); g.applyShot(shot); g.settle(8);
await new Promise((r) => setTimeout(r, 500));

const rows = [];
let prevHeap = mem();
for (let i = 0; i < 220; i++) {
  gl.finish();
  const t0 = performance.now();
  g.frame(1 / 60);
  gl.finish();
  const ms = performance.now() - t0;
  const h = mem();
  rows.push({ i, ms: +ms.toFixed(1), heap: +h.toFixed(1), dHeap: +(h - prevHeap).toFixed(2) });
  prevHeap = h;
  const spare = 16.7 - (performance.now() - t0);
  await new Promise((r) => setTimeout(r, spare > 0 ? spare : 0));
}

const spikes = rows.filter((r) => r.ms > 16.7);
const calm = rows.filter((r) => r.ms <= 16.7);
const avg = (xs) => +(xs.reduce((a, b) => a + b, 0) / (xs.length || 1)).toFixed(3);
// A collection shows as a NEGATIVE heap delta. Count how many spikes coincide
// with one, against the base rate among calm frames.
const dropOn = (xs) => xs.filter((r) => r.dHeap < -0.5).length + '/' + xs.length;

return {
  shot,
  heapMB: { start: rows[0].heap, end: rows[rows.length - 1].heap, min: Math.min(...rows.map((r) => r.heap)), max: Math.max(...rows.map((r) => r.heap)) },
  allocPerCalmFrameMB: avg(calm.map((r) => r.dHeap)),
  spikes: spikes.length + '/' + rows.length,
  heapDropsOnSpikeFrames: dropOn(spikes),
  heapDropsOnCalmFrames: dropOn(calm),
  sample: rows.slice(40, 80).map((r) => `${r.i}: ${r.ms}ms heap ${r.heap} (${r.dHeap >= 0 ? '+' : ''}${r.dHeap})`),
};

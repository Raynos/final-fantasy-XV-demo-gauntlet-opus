// Is the periodic 20-60 ms stall ours, or is it the browser presenting the
// canvas?
//
// `perfpasses.mts` timed every composer pass with a `gl.finish()` on both
// sides. In calm frames the whole chain is ScenePass 3.3 ms + VelocityPass
// 0.4 ms and literally everything else at 0.0. On spike frames the extra 20-60
// ms does not attach to a pass -- it lands on whichever one happened to be
// executing (ScenePass 64.9, VelocityPass 53.3, GTAOPass 35.1, BloomPass 24.0
// as their worst single calls). A cost that moves between passes at random is
// not produced by any of them.
//
// The remaining candidate is presentation: the compositor takes the canvas at
// 60 Hz and our loop collides with it. This tests that directly by pointing the
// last pass at a render target instead of the screen, so the canvas is never
// written and there is nothing to composite. Same scene, same passes, same
// pacing; only the destination changes.
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'party_walk';

g.resetClock(); g.applyShot(shot); g.settle(40); g.applyShot(shot); g.settle(8);

const passes = g.post.composer.passes;
const last = passes.filter((p) => p.enabled).pop();
const wasToScreen = last.renderToScreen;

const run = async (label) => {
  await new Promise((r) => setTimeout(r, 500));
  const ms = [];
  for (let i = 0; i < 200; i++) {
    gl.finish();
    const t0 = performance.now();
    g.frame(1 / 60);
    gl.finish();
    ms.push(performance.now() - t0);
    const spare = 16.7 - (performance.now() - t0);
    await new Promise((r) => setTimeout(r, spare > 0 ? spare : 0));
  }
  const s = [...ms].sort((a, b) => a - b);
  const at = (p) => +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2);
  return {
    label,
    medianMs: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99), maxMs: +s[s.length - 1].toFixed(2),
    over16: ms.filter((x) => x > 16.7).length + '/' + ms.length,
  };
};

const toScreen = await run('renderToScreen (normal)');
last.renderToScreen = false;
const offscreen = await run('offscreen, canvas never written');
last.renderToScreen = wasToScreen;
const backToScreen = await run('renderToScreen again (control)');

return { shot, lastPass: last.constructor && last.constructor.name, toScreen, offscreen, backToScreen };

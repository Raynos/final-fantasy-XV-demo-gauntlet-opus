// Does `_applyTier` do what the tier says, and does the ctor now use it?
//
// The bug was never in the arithmetic — `setQuality` had it right all along.
// It was that the constructor did not run it: it hard-coded shadows on and a
// `ultra ? 2 : 1.5` cap, so a page that BOOTED at `low` got neither of the
// tier's two largest wins. The ctor now calls `_applyTier`, so proving the
// function proves the boot path.
//
// Note the harness forces `?q=ultra`, and `URLSearchParams.get` takes the
// first value, so a low boot cannot be reached from here at all — which is
// itself why this tests the function rather than the URL.
const g = window.GAME;
const r = g.rnd;
const gl = r.renderer;
const read = () => ({ dpr: gl.getPixelRatio(), shadows: gl.shadowMap.enabled });

const booted = read();
const seen = {};
for (const t of ['low', 'medium', 'high', 'ultra']) { r._applyTier(t); seen[t] = read(); }
r._applyTier(r.quality);   // put it back

return {
  booted,
  bootedTier: r.quality,
  perTier: seen,
  restored: read(),
  devicePixelRatio: window.devicePixelRatio,
  // At devicePixelRatio 1 every cap collapses to 1 through the min(), so the
  // dpr column cannot separate tiers in headless. Shadows can.
  shadowsFollowTier: seen.low.shadows === false && seen.high.shadows === true,
};

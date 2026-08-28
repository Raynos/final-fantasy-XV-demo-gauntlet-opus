/**
 * The same portrait at four exposures, so the clip can be *seen* rather than
 * inferred.
 *
 *   node src/tools/probe.mts src/tools/probes/faceexp.mts --shot tmp/shots/x/e.png --dirty
 *
 * `faceclip.mts` measures that the party's own black clothing drags the
 * centre-weighted meter and pushes the adapted exposure to 1.33x the scene
 * exposure the Sky published, which is what puts the lit half of a face over
 * 1.0 entering the tonemapper. This is the picture of that: the shot as it
 * ships, then the same frame with the adaptation band closed onto `base` and
 * below it. Nothing else changes — same pose, same hour, same sculpt.
 */
const g = window.GAME;
const shot = String(window.__FE_SHOT || 'hero_portrait');
const fx = g.post;
const ex = fx.exposure;
const hi0 = ex.rangeHi, lo0 = ex.rangeLo;

// `applyShot` -> Sky.update re-publishes the band every frame through
// `setSceneExposure`, so an assignment to `rangeHi` is overwritten before the
// next capture. Wrap the publisher instead.
const orig = ex.setSceneExposure.bind(ex);
let cap = null;
ex.setSceneExposure = (base, band) => {
  orig(base, band);
  if (cap != null) { ex.rangeLo = cap; ex.rangeHi = cap; }
};

const steps = [
  ['ship', null],
  ['base', 1.00],
  ['m20', 0.80],
  ['m35', 0.65],
];
const out = [];
for (const [name, c] of steps) {
  cap = c;
  if (cap == null) { ex.rangeHi = hi0; ex.rangeLo = lo0; }
  else { ex.rangeHi = cap; ex.rangeLo = cap; }
  g.applyShot(shot);
  ex.reset();
  g.settle(30);
  g.frame(1 / 60);
  await window.__shot(`${shot}-${name}`);
  out.push(`${name}: rangeLo/Hi=${ex.rangeLo}/${ex.rangeHi} base=${ex.base.toFixed(3)}`);
}
cap = null;
ex.setSceneExposure = orig;
ex.rangeHi = hi0; ex.rangeLo = lo0;
ex.reset();
return out.join('\n');

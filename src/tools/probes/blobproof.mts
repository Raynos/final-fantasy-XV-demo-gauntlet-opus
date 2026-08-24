/**
 * Before/after for the contact-shadow acceptance window, frame-wide, **three
 * ways** — because there are two fixes in this pass now and the second must not
 * cost the first.
 *
 *   node src/tools/probe.mts src/tools/probes/blobproof.mts \
 *     --shot tmp/shots/<round>/p.png --dirty
 *
 * Every stage runs on one boot, one build and one pose, the way
 * `weaveproof.mts` did, because the shipped behaviour of each fix is exactly a
 * parameter value: `stepPx = 1e9` is the pass before the crosshatch fix, and
 * `thicknessTrack = 0` is the pass after it and before this one.
 *
 *   `_uncapped`  stepPx 1e9, track 0   the march before either fix — the weave
 *   `_capped`    stepPx 6,   track 0   after the crosshatch fix — the blob
 *   `_tracked`   stepPx 6,   track 1   shipped now
 *   `_off`       the pass disabled     the control head-r2 diagnosed against
 *
 * `_uncapped` against `_tracked` is the whole pass's before/after; `_capped`
 * against `_tracked` is this change alone; `_tracked` against `_off` is the bar
 * head-r2 set — the ablation must stop making a difference over the face.
 *
 * Post is frame-wide, so this does not stop at the portrait: the previous lane's
 * two large wins were `town_forecourt`'s sunlit canopy beams and
 * `zone_fallgrove`'s near-field grass, and both have to still be there.
 */
const g = window.GAME;
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

const p = g.post;
const c = p.contact;
const shipped = { stepPx: c.stepPx, track: c.thicknessTrack, on: c.enabled };
const out = { shipped, stages: [] };

const stage = async (shot, name, stepPx, track, on) => {
  g.applyShot(shot);
  // A capture must depend on the step count and nothing else; without this the
  // later stages of a long probe photograph a different pose from the earlier
  // ones, and against a frozen reference frame that reads as a difference the
  // variable did not make.
  g.resetClock();
  c.stepPx = stepPx; c.thicknessTrack = track; c.enabled = on;
  if (p.dof) p.dof.enabled = false;
  p.resetHistory();
  for (let i = 0; i < 40; i++) g.frame(1 / 60);
  await window.__shot(`${shot}_${name}`);
  out.stages.push({ shot, name, stepPx: c.stepPx, track: c.thicknessTrack, contact: c.enabled });
};

for (const shot of ['hero_portrait', 'hero_full', 'vista_noon', 'town_forecourt', 'zone_fallgrove']) {
  await stage(shot, 'uncapped', 1e9, 0, true);
  await stage(shot, 'capped', 6.0, 0, true);
  await stage(shot, 'tracked', 6.0, 1, true);
  await stage(shot, 'off', 6.0, 1, false);
}

c.stepPx = shipped.stepPx; c.thicknessTrack = shipped.track; c.enabled = shipped.on;
g.settle(8);
return out;

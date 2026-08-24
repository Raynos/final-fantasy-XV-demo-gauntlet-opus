/**
 * Before/after for the contact-shadow screen-space step cap, frame-wide.
 *
 *   node src/tools/probe.mts src/tools/probes/weaveproof.mts \
 *     --shot tmp/shots/<round>/p.png --dirty
 *
 * The fix lives in the shader, but the shipped behaviour is exactly
 * post.contact.stepPx = infinity, so both halves of the A/B run on **one boot,
 * one build and one pose** — no stash, no second capture, nothing else moving.
 * That matters here because three other lanes have edits in the live tree.
 *
 * Post changes are frame-wide, so this does not stop at the face: a landscape,
 * a town and a forest shot go through the same A/B, because GTAO's history in
 * this repo is exactly the trade of a character artefact for a terrain one.
 */
const g = window.GAME;
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

const p = g.post;
const out = { stepPx: p.contact.stepPx, stages: [] };

const stage = async (shot, name, stepPx) => {
  g.applyShot(shot);
  p.contact.stepPx = stepPx;
  if (p.dof) p.dof.enabled = false;
  p.resetHistory();
  for (let i = 0; i < 40; i++) g.frame(1 / 60);
  await window.__shot(name);
  out.stages.push({ name, shot, stepPx: p.contact.stepPx, contact: p.contact.enabled });
};

for (const shot of ['hero_portrait', 'hero_full', 'vista_noon', 'town_forecourt', 'zone_fallgrove']) {
  await stage(shot, `${shot}_before`, 1e9);   // the shipped, uncapped march
  await stage(shot, `${shot}_after`, 6.0);    // the cap
}

p.contact.stepPx = out.stepPx;
g.settle(8);
return out;

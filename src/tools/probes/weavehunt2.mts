/**
 * Round two of the crosshatch hunt: it is not the material, so it is the frame.
 *
 *   node src/tools/probe.mts src/tools/probes/weavehunt2.mts \
 *     --shot tmp/shots/<round>/p.png
 *
 * `weavehunt.mts` turned off every map, every vertex colour, sheen, specular and
 * received shadows on skin, and the hard ~2 px crosshatch came through a flat
 * white face unchanged. So it is screen-space. Skin is simply the only large,
 * smooth, mid-bright surface in a portrait, which is why it looks like a skin
 * defect.
 *
 * One post pass off at a time. GTAO and contact shadows are the usual authors of
 * a *regular* hatch (an interleaved sampling pattern that never got denoised);
 * grain is the usual author of an irregular one.
 *
 * **This probe's answer was wrong and `src/tools/probes/weavebisect.mts`
 * replaced it.** It reads GTAO as the author. GTAO is innocent — with the
 * protocol below fixed, turning GTAO off makes the weave *worse*. Three things
 * move under `settle(4)` and none of them is the pass being tested: the subject
 * animates, TAA keeps converging (so a stage taken later is quieter for free),
 * and four frames after a toggle is a transient in which the neighbourhood
 * clamp is rejecting most of the history. It also toggles passes on a page that
 * `applyShot` will later re-quality-tier, which silently re-enables `gtao`.
 * The carrier was `ContactShadowPass`. Kept for the history and because the
 * `all_off` stage is still the cleanest picture of the skin underneath.
 */
const g = window.GAME;
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

g.applyShot('hero_portrait');
g.settle(30);

const p = g.post;
const out = { has: Object.keys(p).filter((k) => p[k] && typeof p[k] === 'object' && 'enabled' in p[k]), stages: [] };

if (p.dof) p.dof.enabled = false;   // defocus is not what we are looking at

const passes = ['gtao', 'contact', 'ssr', 'taa', 'bloom', 'motionBlur', 'cas', 'smaa', 'velocity'];
const was = {};
for (const k of passes) if (p[k]) was[k] = p[k].enabled;
const grain = p.grade && p.grade.uniforms && p.grade.uniforms.uGrain
  ? p.grade.uniforms.uGrain.value : null;

const restore = () => {
  for (const k of passes) if (p[k]) p[k].enabled = was[k];
  if (grain !== null) p.grade.uniforms.uGrain.value = grain;
};

const stage = async (name, fn) => {
  restore();
  fn();
  g.settle(4);
  await window.__shot(name);
  out.stages.push(name);
};

await stage('0_base', () => {});
for (const k of passes) {
  if (!p[k] || !was[k]) continue;
  await stage(`off_${k}`, () => { p[k].enabled = false; });
}
if (grain) await stage('off_grain', () => { p.grade.uniforms.uGrain.value = 0; });
await stage('all_off', () => {
  for (const k of passes) if (p[k]) p[k].enabled = false;
  if (grain !== null) p.grade.uniforms.uGrain.value = 0;
});

restore();
g.settle(2);
out.grain = grain;
return out;

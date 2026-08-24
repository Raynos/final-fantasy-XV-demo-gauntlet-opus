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

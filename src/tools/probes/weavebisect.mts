/**
 * The crosshatch, bisected under a protocol whose own control is checked.
 *
 *   node src/tools/probe.mts src/tools/probes/weavebisect.mts \
 *     --shot tmp/shots/<round>/b.png --dirty
 *
 * `weavehunt2.mts` bisected the post chain by toggling one pass and settling
 * four frames, on one continuously-running page, with no history reset. Three
 * things move underneath that and none of them is the pass being tested:
 *
 *   - the subject **animates** under `settle`, so every later stage is a
 *     different pose;
 *   - TAA keeps **converging**, so a stage taken later is quieter for free —
 *     re-running the shipped configuration last came back reading like a fix;
 *   - four frames after a toggle is a **transient**: the history still holds
 *     the previous configuration's image and the neighbourhood clamp is
 *     rejecting most of it.
 *
 * So every stage here re-poses the shot, applies its one variable, resets the
 * temporal history and runs the same 40 frames. And it applies the variable
 * **after** `applyShot`, because a shot re-applies the quality tier and that
 * sets `gtao.enabled` — the first cut of this probe ablated GTAO before posing
 * and photographed a frame with GTAO switched back on. Each stage reports the
 * pass flags actually in force at the moment of capture, so a null ablation
 * cannot read as innocence.
 */
const g = window.GAME;
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

const p = g.post;
const taaFs = p.taa.material.fragmentShader;
const gtaoFs = p.gtao.gtaoMaterial.fragmentShader;
const out = { stages: [] };

const stage = async (name, apply) => {
  p.gtao.enabled = true; p.cas.enabled = true; p.taa.enabled = true;
  p.contact.enabled = true; p.jitter = true;
  p.taa.clampScale = 1.25; p.taa.feedbackMin = 0.86; p.taa.feedbackMax = 0.97;
  p.cas.sharpness = 0.42;
  if (p.taa.material.fragmentShader !== taaFs) {
    p.taa.material.fragmentShader = taaFs; p.taa.material.needsUpdate = true;
  }
  if (p.gtao.gtaoMaterial.fragmentShader !== gtaoFs) {
    p.gtao.gtaoMaterial.fragmentShader = gtaoFs; p.gtao.gtaoMaterial.needsUpdate = true;
  }
  g.applyShot('hero_portrait');
  apply();
  if (p.dof) p.dof.enabled = false;
  p.resetHistory();
  for (let i = 0; i < 40; i++) g.frame(1 / 60);
  await window.__shot(name);
  out.stages.push({
    name,
    gtao: p.gtao.enabled, cas: p.cas.enabled, taa: p.taa.enabled,
    contact: p.contact.enabled, jitter: p.jitter,
    clamp: p.taa.clampScale, fb: [p.taa.feedbackMin, p.taa.feedbackMax],
    sharp: p.cas.sharpness,
    taaPatched: p.taa.material.fragmentShader !== taaFs,
  });
};

const patchTaa = (from, to) => {
  const fs = taaFs.replace(from, to);
  if (fs === taaFs) throw new Error(`TAA patch matched nothing: ${from}`);
  p.taa.material.fragmentShader = fs;
  p.taa.material.needsUpdate = true;
};

await stage('a_base', () => {});
await stage('b_null', () => {});
await stage('c_nogtao', () => { p.gtao.enabled = false; });
await stage('d_nocas', () => { p.cas.enabled = false; });
await stage('e_notaa', () => { p.taa.enabled = false; });
await stage('f_nocontact', () => { p.contact.enabled = false; });
await stage('g_nojitter', () => { p.jitter = false; });
// TAA ignores the velocity buffer entirely and reprojects the camera for every
// pixel. If the weave dies here, the skinned motion vectors are the carrier.
await stage('h_taa_camera_only', () => patchTaa('if (vel.a > 0.5) {', 'if (false) {'));
// TAA keeps its own history unclipped. If the weave dies here, the
// neighbourhood clamp is what is refusing to accumulate.
await stage('i_taa_noclamp', () => { p.taa.clampScale = 40.0; });
await stage('j_taa_fb_flat', () => { p.taa.feedbackMin = 0.97; });
await stage('k_nosharp', () => { p.cas.sharpness = 0.0; });
await stage('z_restored', () => {});

g.settle(8);
return out;

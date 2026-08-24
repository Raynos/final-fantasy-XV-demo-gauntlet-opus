/**
 * The **second** contact-shadow defect: the lobed, stair-stepped blob that the
 * `stepPx = 6` crosshatch fix left over the mid-face at portrait range.
 *
 *   node src/tools/probe.mts src/tools/probes/blobhunt.mts \
 *     --shot tmp/shots/<round>/b.png --dirty
 *
 * `weavecontact.mts` established that the pass was marching a **world** length
 * with no screen-space budget, and capping the step at 6 px cleared the
 * one-pixel checkerboard. What it left is the opposite failure: the cap
 * shortened the march tenfold at portrait range and left `thickness` — the
 * acceptance window, authored at 0.9x the *world* march — sitting at ten times
 * the capped one, so the test stopped rejecting anything and the occlusion term
 * went hard 0 -> 1 across a jagged boundary. `head-r2` measured that blob at
 * 3.634/255 over the face rectangle with `--ablate nocontact` as the control.
 *
 * The fix landed as `post.contact.thicknessTrack`, default 1. **`thicknessTrack
 * = 0` is the pre-fix behaviour**, which is what lets every row below run on one
 * boot and one build.
 *
 * Same protocol as `weavebisect.mts` and for the same reasons: every stage
 * re-poses the shot, applies its one variable **after** `applyShot` (a shot
 * re-applies the quality tier), resets the temporal history, runs the same 40
 * frames, and reports the state actually in force. `b_null` repeats `a_base`
 * and is the floor every row has to beat. The hair is hidden — `head-r2` showed
 * the blob survives that ablation — but **before** the settle frames, not after
 * the way `--hide` does it; see the comment on the hide, which cost a round.
 *
 * `wv_*` stages replace the composite with the pass's own occlusion weight in
 * greyscale, which is the only view that shows the *shape* of the term rather
 * than the shape of the skin under it.
 */
const g = window.GAME;
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

const p = g.post;
const c = p.contact;
const baseFs = c.material.fragmentShader;
const baseSteps = c.material.defines.CS_STEPS;
const out = { stages: [], shipped: { length: c.length, bias: c.bias, thickness: c.thickness, stepPx: c.stepPx, steps: baseSteps } };

const patch = (from, to) => {
  const fs = c.material.fragmentShader.replace(from, to);
  if (fs === c.material.fragmentShader) throw new Error(`contact patch matched nothing: ${from}`);
  c.material.fragmentShader = fs;
  c.material.needsUpdate = true;
};
/** Replace the composite with the pass's own weight, so the term is visible. */
const debugW = () => patch(
  'gl_FragColor = vec4(mix(src, shaded, clamp(w, 0.0, 1.0)), 1.0);',
  'gl_FragColor = vec4(vec3(clamp(w, 0.0, 1.0)), 1.0);',
);
/** The screen-space cap, restated as a total reach in pixels + a step count,
 *  so "more samples" can be tested without also meaning "a longer march". */
const reach = (px, steps) => {
  patch(
    'len = min(len, pxWorld * uStepPx * float(CS_STEPS));',
    `len = min(len, pxWorld * ${px.toFixed(1)});`,
  );
  c.material.defines.CS_STEPS = steps;
};

const stage = async (name, apply) => {
  c.enabled = true;
  c.length = 0.50; c.bias = 0.030; c.intensity = 0.85; c.thickness = 0.45; c.stepPx = 6.0;
  c.thicknessTrack = 1.0;
  if (c.material.fragmentShader !== baseFs) { c.material.fragmentShader = baseFs; c.material.needsUpdate = true; }
  if (c.material.defines.CS_STEPS !== baseSteps) { c.material.defines.CS_STEPS = baseSteps; c.material.needsUpdate = true; }
  g.applyShot('hero_portrait');
  // ...and zero the clock. `weavebisect.mts` does not, and it does not need to:
  // its statistic is the RMS of a high-pass residual, which barely moves when
  // the subject drifts a few millimetres. This probe's statistic is a *pixel
  // diff against a frozen `c_off` frame*, which is exactly as sensitive to pose
  // as it is to the pass. Without this the null control read 4.71 / 3.67 / 7.35
  // on three identical configurations, drifting monotonically up the run as the
  // 0.67 s each stage costs accumulated. `resetClock` is in the page contract
  // for this: a capture then depends only on the step count.
  g.resetClock();
  apply();
  if (p.dof) p.dof.enabled = false;
  // Hide the hair BEFORE the settle frames, not after. `--hide` hides after
  // settling so the sim is identical on both sides -- correct there, wrong
  // here: TAA feedback is ~0.9, so one frame after the hair disappears the
  // image is still mostly the hairy history, and the size of that transient
  // varies with what the previous stage left behind. It cost a round: the
  // null control read 4.38 against a_base's 5.29 and z_restored's 8.32 on
  // three identical configurations. Visibility is constant across every stage
  // here, so hiding first costs nothing and the history converges on it.
  const hidden = [];
  g.scene.traverse((o) => {
    if ((o.name || '').toLowerCase().includes('hair')) { hidden.push([o, o.visible]); o.visible = false; }
  });
  p.resetHistory();
  for (let i = 0; i < 40; i++) g.frame(1 / 60);
  await window.__shot(name);
  for (const [o, was] of hidden) o.visible = was;
  out.stages.push({
    name, on: c.enabled, bias: c.bias, thickness: c.thickness, stepPx: c.stepPx,
    track: c.thicknessTrack,
    steps: c.material.defines.CS_STEPS, patched: c.material.fragmentShader !== baseFs,
    hidden: hidden.length,
  });
};

await stage('a_base', () => {});
await stage('b_null', () => {});
await stage('c_off', () => { c.enabled = false; });
await stage('c_off2', () => { c.enabled = false; });

// --- the defect: the acceptance window fixed in metres ---------------------
await stage('p_track0', () => { c.thicknessTrack = 0; });

// --- ...which is 0.45 m of window on a head 0.20 m deep, and 10x the 0.045 m
// the cap left the march. Walk it down by hand, in the pre-fix regime. ------
await stage('t_010', () => { c.thicknessTrack = 0; c.thickness = 0.10; });
await stage('t_006', () => { c.thicknessTrack = 0; c.thickness = 0.06; });
await stage('t_003', () => { c.thicknessTrack = 0; c.thickness = 0.03; });

// --- does the bias want the same treatment? (no: it is what rejects the
// ray's hit against the surface it started on) -----------------------------
await stage('k_biastrack', () => patch(
  'float bias = uParams.z * (1.0 + dist * 0.10);',
  'float bias = uParams.z * (1.0 + dist * 0.10) * mix(1.0, lenScale, 0.75);',
));

// --- is it undersampling after all? Hold the reach at the shipped 72 px and
// treble the samples. It is not: the blob is identical. --------------------
await stage('m_r72_s12_t0', () => { c.thicknessTrack = 0; reach(72, 12); });
await stage('n_r72_s36_t0', () => { c.thicknessTrack = 0; reach(72, 36); });
// --- and the reach itself does matter: treble it with the window kept
// proportional and the blob comes back, because 13 cm of march at 0.6 m
// reaches the rest of the face. -------------------------------------------
await stage('o_r216_s36', () => reach(216, 36));

// --- the term itself, before and after ------------------------------------
await stage('wv_track0', () => { c.thicknessTrack = 0; debugW(); });
await stage('wv_base', () => debugW());

await stage('z_restored', () => {});

g.settle(8);
return out;

/**
 * The crosshatch is the **contact-shadow ray march**. This asks which part.
 *
 *   node src/tools/probe.mts src/tools/probes/weavecontact.mts \
 *     --shot tmp/shots/<round>/c.png --dirty
 *
 * `weavebisect.mts` put the carrier here: with the contact pass off and
 * everything else shipped, the face residual falls 11.08 -> 4.87 /255 rms and
 * its one-pixel alternation goes 0.317 -> -0.018. GTAO off makes it *worse*.
 *
 * The suspected mechanism, from reading the pass beside the frame:
 *
 *   len      = 0.50 m * (1 + dist*0.045)      -- a **world** length
 *   stepLen  = len / 12
 *   jitter   = ign(gl_FragCoord.xy + mod(uFrame,8)*47.13)   -- per pixel
 *   pos      = P + N*bias + L*(bias + stepLen*jitter)
 *
 * At `hero_portrait` the subject is ~0.6 m from the camera, where one step of
 * 0.042 m is over a hundred pixels of screen. The per-pixel start jitter is
 * meant to be sub-step; at that range it randomises the march start over a
 * hundred-pixel line, so neighbouring pixels sample completely different
 * geometry and the binary hit/no-hit lands as a one-pixel checkerboard. CAS
 * then sharpens it. Skin is not special — it is simply the nearest large
 * surface in the frame, and the same pass over distant terrain steps a fraction
 * of a pixel.
 *
 * Same controlled protocol as `weavebisect.mts`: re-pose, apply one variable
 * *after* `applyShot`, reset the history, 40 frames, and report the state that
 * was actually in force. `b_null` is the floor.
 */
const g = window.GAME;
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

const p = g.post;
const c = p.contact;
const baseFs = c.material.fragmentShader;
const baseSteps = c.material.defines.CS_STEPS;
const out = { stages: [], shipped: { length: c.length, bias: c.bias, intensity: c.intensity, steps: baseSteps } };

const patch = (from, to) => {
  const fs = c.material.fragmentShader.replace(from, to);
  if (fs === c.material.fragmentShader) throw new Error(`contact patch matched nothing: ${from}`);
  c.material.fragmentShader = fs;
  c.material.needsUpdate = true;
};

const stage = async (name, apply) => {
  c.enabled = true;
  c.length = 0.50; c.bias = 0.030; c.intensity = 0.85; c.thickness = 0.45;
  if (c.material.fragmentShader !== baseFs) { c.material.fragmentShader = baseFs; c.material.needsUpdate = true; }
  if (c.material.defines.CS_STEPS !== baseSteps) { c.material.defines.CS_STEPS = baseSteps; c.material.needsUpdate = true; }
  g.applyShot('hero_portrait');
  apply();
  if (p.dof) p.dof.enabled = false;
  p.resetHistory();
  for (let i = 0; i < 40; i++) g.frame(1 / 60);
  await window.__shot(name);
  out.stages.push({
    name, on: c.enabled, length: c.length, intensity: c.intensity,
    steps: c.material.defines.CS_STEPS, patched: c.material.fragmentShader !== baseFs,
  });
};

await stage('a_base', () => {});
await stage('b_null', () => {});
await stage('c_off', () => { c.enabled = false; });

// --- is it the march *length*? --------------------------------------------
await stage('d_len_020', () => { c.length = 0.20; });
await stage('e_len_008', () => { c.length = 0.08; });

// --- is it the per-pixel start jitter? -------------------------------------
// A fixed half-step start: same march, same length, no per-pixel randomness.
// If the weave becomes banding rather than a checkerboard, the jitter is the
// carrier and the march is undersampled.
await stage('f_nojitter', () => patch('float jitter = ign(', 'float jitter = 0.5 + 0.0 * ign('));

// --- is it undersampling? --------------------------------------------------
await stage('g_steps_48', () => { c.material.defines.CS_STEPS = 48; c.material.needsUpdate = true; });

// --- is it the depth-derivative normal, not the march? ---------------------
await stage('h_facing_1', () => patch('float facing = smoothstep(0.06, 0.30, ndl);', 'float facing = 1.0;'));

// --- just less of it -------------------------------------------------------
await stage('i_int_040', () => { c.intensity = 0.40; });

// --- the candidate fix: cap the step in *screen* space ---------------------
// One texel of world size at this pixel's own depth, so the march can never
// step further across the screen than it can resolve.
await stage('j_sscap_2px', () => patch(
  'float stepLen = len / float(CS_STEPS);',
  'float pxW = length(worldFromDepth(vUv + vec2(uTexel.x, 0.0), d, uInvViewProj) - P);\n'
  + '          len = min(len, pxW * 2.0 * float(CS_STEPS));\n'
  + '          float stepLen = len / float(CS_STEPS);'
));
await stage('k_sscap_6px', () => patch(
  'float stepLen = len / float(CS_STEPS);',
  'float pxW = length(worldFromDepth(vUv + vec2(uTexel.x, 0.0), d, uInvViewProj) - P);\n'
  + '          len = min(len, pxW * 6.0 * float(CS_STEPS));\n'
  + '          float stepLen = len / float(CS_STEPS);'
));
await stage('z_restored', () => {});

g.settle(8);
return out;

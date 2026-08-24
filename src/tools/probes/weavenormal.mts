/**
 * Round four: the crosshatch is GTAO's, but it is not GTAO's *noise*.
 *
 *   node src/tools/probe.mts src/tools/probes/weavenormal.mts \
 *     --shot tmp/shots/<round>/n.png --dirty
 *
 * `weaveframe.mts` re-randomised the 5x5 magic-square rotation texture on every
 * frame — the textbook "let TAA average it away" fix, and the one
 * `ContactShadowPass.ts:118` already applies to itself — and the weave was still
 * there. So the carrier is not the sampling rotation.
 *
 * The remaining candidate is in three's own `computeNormalFromDepth`, which this
 * pipeline is on because `setGBuffer(depthTexture)` leaves NORMAL_VECTOR_TYPE at
 * 0:
 *
 *     float dl = abs((2.0 * l1 - l2) - c0);      // curvature to the left
 *     float dr = abs((2.0 * r1 - r2) - c0);      // curvature to the right
 *     vec3 dpdx = (dl < dr) ? <backward difference> : <forward difference>;
 *
 * It is a **per-pixel binary branch**. On a large smooth surface dl and dr are
 * both near zero and differ only by depth-buffer quantisation, so the branch
 * flips from pixel to pixel — and the two branches return normals a whole texel
 * of slope apart. A binary normal gives a binary AO, and a binary AO at
 * one-pixel period is a crosshatch.
 *
 * **Every stage re-poses the shot and settles the same number of frames.** The
 * first cut of this probe did not, and its own restore-the-original control came
 * back reading like the fix: the subject animates under `settle`, and TAA keeps
 * converging, so a stage taken later is quieter for reasons that have nothing to
 * do with what it changed. `null_b` is a second, identical run of `base` and is
 * the floor any stage has to beat.
 */
const g = window.GAME;
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

const p = g.post;
const gm = p.gtao.gtaoMaterial;
const original = gm.fragmentShader;
const tex = gm.uniforms.tNoise.value;
const noise = tex.image.data;
const magicSquare = noise.slice();

const out = { stages: [], found: {}, noise: { w: tex.image.width, h: tex.image.height } };

let seed = 1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
let rerollEveryFrame = false;
const reroll = () => {
  for (let i = 0; i < noise.length / 4; i++) {
    const a = rnd() * Math.PI * 2;
    noise[i * 4] = (Math.cos(a) * 0.5 + 0.5) * 255;
    noise[i * 4 + 1] = (Math.sin(a) * 0.5 + 0.5) * 255;
    noise[i * 4 + 2] = 127;
    noise[i * 4 + 3] = rnd() * 255;
  }
  tex.needsUpdate = true;
};

/** Identical for every stage: shipped state, then the one variable, then the
 *  same pose and the same 40 frames of accumulation. */
const stage = async (name, apply) => {
  gm.fragmentShader = original;
  gm.needsUpdate = true;
  noise.set(magicSquare);
  tex.needsUpdate = true;
  rerollEveryFrame = false;
  p.gtao.enabled = true;
  seed = 1;
  // **After** `applyShot`, never before: a shot re-applies the quality tier,
  // which sets `gtao.enabled`. The first cut of this probe ablated GTAO first
  // and photographed a frame with GTAO switched back on — a null ablation that
  // read as "GTAO is innocent". The asserts below are why that is now visible.
  g.applyShot('hero_portrait');
  apply();
  if (p.dof) p.dof.enabled = false;
  p.resetHistory();
  for (let i = 0; i < 40; i++) { if (rerollEveryFrame) reroll(); g.frame(1 / 60); }
  await window.__shot(name);
  out.stages.push({
    name,
    gtao: p.gtao.enabled, cas: p.cas.enabled, taa: p.taa.enabled,
    shaderPatched: gm.fragmentShader !== original,
    noiseRolled: rerollEveryFrame,
  });
};

const BRANCH_X = '(dl < dr) ?';
const BRANCH_Y = '(db < dt) ?';
const DPDX = 'vec3 dpdx = (dl < dr) ? ce - getViewPosition((uv - vec2(1.0 / size.x, 0.0)), l1).xyz : -ce + getViewPosition((uv + vec2(1.0 / size.x, 0.0)), r1).xyz;';
const DPDY = 'vec3 dpdy = (db < dt) ? ce - getViewPosition((uv - vec2(0.0, 1.0 / size.y)), b1).xyz : -ce + getViewPosition((uv + vec2(0.0, 1.0 / size.y)), t1).xyz;';
const CX = 'vec3 dpdx = 0.5 * (getViewPosition((uv + vec2(1.0 / size.x, 0.0)), r1).xyz - getViewPosition((uv - vec2(1.0 / size.x, 0.0)), l1).xyz);';
const CY = 'vec3 dpdy = 0.5 * (getViewPosition((uv + vec2(0.0, 1.0 / size.y)), t1).xyz - getViewPosition((uv - vec2(0.0, 1.0 / size.y)), b1).xyz);';
out.found = {
  branchX: original.includes(BRANCH_X), branchY: original.includes(BRANCH_Y),
  dpdx: original.includes(DPDX), dpdy: original.includes(DPDY),
};
const setFs = (fs) => { gm.fragmentShader = fs; gm.needsUpdate = true; };

await stage('base', () => {});
await stage('null_b', () => {});                                   // the floor
await stage('nogtao', () => { p.gtao.enabled = false; });          // the known answer
p.gtao.enabled = true;
await stage('fwd', () => setFs(original.replace(BRANCH_X, '(false) ?').replace(BRANCH_Y, '(false) ?')));
await stage('central', () => setFs(original.replace(DPDX, CX).replace(DPDY, CY)));
await stage('rot', () => { rerollEveryFrame = true; });
await stage('central_rot', () => {
  setFs(original.replace(DPDX, CX).replace(DPDY, CY));
  rerollEveryFrame = true;
});
await stage('restored', () => {});

gm.fragmentShader = original;
gm.needsUpdate = true;
noise.set(magicSquare);
tex.needsUpdate = true;
g.settle(8);
return out;

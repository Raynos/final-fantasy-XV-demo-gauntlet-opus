/**
 * Round three of the crosshatch hunt: *why* does TAA not average it away?
 *
 *   node src/tools/probe.mts src/tools/probes/weaveframe.mts \
 *     --shot tmp/shots/<round>/f.png
 *
 * `weavehunt2.mts` named the chain (GTAO dither -> TAA -> CAS) and left two
 * incompatible explanations standing:
 *
 *   A. TAA's history reprojection is wrong on **skinned** meshes, so the
 *      accumulation never happens there. Fix = previous-frame skinning matrices.
 *   B. GTAO's rotation noise is a **screen-locked 5x5 magic square** with no
 *      temporal variation at all (three's `generateMagicSquareNoise`). A pattern
 *      that is byte-identical every frame survives *any* accumulation, however
 *      correct the motion vectors are. Fix = rotate the noise per frame, which
 *      is exactly what `ContactShadowPass.ts:118` already does and says.
 *
 * They make opposite predictions and this asks the frame which one is true:
 *
 *   `still_a` / `still_b`  two consecutive frames, nothing changed.
 *      Under B the crosshatch is bit-identical between them. Under A it is not
 *      (a mis-reprojected history still churns).
 *   `rot16`  sixteen frames with the GTAO noise texture re-randomised each
 *      frame and *nothing else touched*. Under B the weave is gone. Under A it
 *      is unchanged, because the motion vectors are still wrong.
 *
 * The noise texture is mutated in place (25 rotation vectors, 100 bytes) rather
 * than patched in the shader, so this stage is a pure test of the hypothesis
 * with no recompile and no other variable moved.
 */
const g = window.GAME;
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

g.applyShot('hero_portrait');
g.settle(30);
const p = g.post;
if (p.dof) p.dof.enabled = false;
g.settle(8);

const out = { stages: [] };
const shot = async (n) => { await window.__shot(n); out.stages.push(n); };

await shot('still_a');
g.frame(1 / 60);
await shot('still_b');
g.frame(1 / 60);
await shot('still_c');

// --- the noise texture, and a temporal re-randomisation of it --------------
const tex = p.gtao.gtaoMaterial.uniforms.tNoise.value;
const data = tex.image.data;
out.noise = { w: tex.image.width, h: tex.image.height, bytes: data.length };
const original = data.slice();

let seed = 1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const reroll = () => {
  for (let i = 0; i < data.length / 4; i++) {
    const a = rnd() * Math.PI * 2;
    data[i * 4] = (Math.cos(a) * 0.5 + 0.5) * 255;
    data[i * 4 + 1] = (Math.sin(a) * 0.5 + 0.5) * 255;
    data[i * 4 + 2] = 127;
    data[i * 4 + 3] = rnd() * 255;
  }
  tex.needsUpdate = true;
};

// a single re-roll, held: still screen-locked, just a different lock.
reroll();
g.settle(8);
await shot('rot_frozen');

// re-rolled every frame: the pattern decorrelates and TAA can average it.
for (let i = 0; i < 16; i++) { reroll(); g.frame(1 / 60); }
await shot('rot16');

// and again with CAS off, to see the accumulated floor without the amplifier
const casWas = p.cas.enabled;
p.cas.enabled = false;
for (let i = 0; i < 8; i++) { reroll(); g.frame(1 / 60); }
await shot('rot16_nocas');
p.cas.enabled = casWas;

// restore and settle back to the shipped pattern
data.set(original);
tex.needsUpdate = true;
g.settle(16);
await shot('restored');

return out;

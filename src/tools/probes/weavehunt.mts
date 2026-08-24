/**
 * What is the crosshatch on the skin? — ablation before re-tinting.
 *
 *   node src/tools/probe.mts src/tools/probes/weavehunt.mts \
 *     --shot tmp/shots/<round>/w.png --dirty
 *
 * Every closeup in this repo shows a hard, regular ~2 px crosshatch over skin
 * and only over skin. The obvious suspect was the pore normal map, whose octaves
 * were all past Nyquist; fixing that moved `hero_portrait` by 0.385/255, i.e.
 * essentially nothing. So the obvious suspect is wrong, and this asks the frame
 * instead of asking me.
 *
 * One boot, one framing, one thing off at a time. `--hide` cannot express any of
 * these because they are material state, not objects.
 */
const g = window.GAME;
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

g.applyShot('hero_portrait');
g.settle(30);
if (g.post && g.post.dof) g.post.dof.enabled = false;

const party = g.get('Party');
const player = g.get('Player');
const chars = [player, ...(party ? party.members : [])].map((m) => m && m.character).filter(Boolean);

const mats = [];
for (const ch of chars) {
  for (const mesh of [ch.head, ch.body]) {
    if (mesh && mesh.material && !mats.includes(mesh.material)) mats.push(mesh.material);
  }
}
const meshes = [];
for (const ch of chars) for (const k of ['head', 'body']) if (ch[k]) meshes.push(ch[k]);

const saved = mats.map((m) => ({
  m,
  normalMap: m.normalMap,
  normalScale: m.normalScale ? m.normalScale.clone() : null,
  map: m.map,
  sheen: m.sheen,
  specularIntensity: m.specularIntensity,
  vertexColors: m.vertexColors,
  sss: m.userData.sss,
}));
const savedShadow = meshes.map((o) => ({ o, r: o.receiveShadow, c: o.castShadow }));

const restore = () => {
  for (const s of saved) {
    s.m.normalMap = s.normalMap;
    if (s.normalScale) s.m.normalScale.copy(s.normalScale);
    s.m.map = s.map;
    s.m.sheen = s.sheen;
    s.m.specularIntensity = s.specularIntensity;
    s.m.vertexColors = s.vertexColors;
    s.m.userData.sss = s.sss;
    s.m.needsUpdate = true;
  }
  for (const s of savedShadow) { s.o.receiveShadow = s.r; s.o.castShadow = s.c; }
};

const stage = async (name, fn) => {
  restore();
  fn();
  g.settle(2);
  await window.__shot(name);
};

const out = { mats: mats.length, meshes: meshes.length, stages: [] };
const push = (n) => out.stages.push(n);

await stage('0_base', () => {});
push('0_base');

await stage('1_no_normalmap', () => {
  for (const s of saved) { s.m.normalMap = null; s.m.needsUpdate = true; }
});
push('1_no_normalmap: pore/poreFine off entirely');

await stage('2_no_receive_shadow', () => {
  for (const s of savedShadow) s.o.receiveShadow = false;
});
push('2_no_receive_shadow: shadow-map acne would vanish');

await stage('3_no_sheen_spec', () => {
  for (const s of saved) { s.m.sheen = 0; s.m.specularIntensity = 0; s.m.needsUpdate = true; }
});
push('3_no_sheen_spec');

await stage('4_no_facemap', () => {
  for (const s of saved) { s.m.map = null; s.m.needsUpdate = true; }
});
push('4_no_facemap: is the crosshatch painted into the map?');

await stage('5_flat_white', () => {
  for (const s of saved) {
    s.m.map = null; s.m.normalMap = null; s.m.vertexColors = false;
    s.m.sheen = 0; s.m.specularIntensity = 0; s.m.needsUpdate = true;
  }
  for (const s of savedShadow) s.o.receiveShadow = false;
});
push('5_flat_white: everything off at once — if it survives this it is not the material');

restore();
g.settle(2);
return out;

// perf-r2: is the 108 ms `sprint+turn` frame a shader compile?
//
// The hitch lands on `post.render` with nothing else in the frame, at the SAME
// frame index every run (35/36 here, 39/40 in the certified baseline), which is
// the signature of first-visibility work rather than load. three.js keeps every
// linked program in `renderer.info.programs` with its material name and cache
// key, so diffing that list per frame names the material that paid.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const inp = g.input;
const hold = (...codes) => { inp.keys.clear(); for (const c of codes) inp.keys.add(c); };
const look = (x, y) => inp.look.set(x, y);
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();

const SEG = 'menu-open'; // SEGNAME
const menus = g.get('Menus');
const each = SEG === 'menu-open'
  ? (i) => { if (i === 5) menus.setScreen('main'); if (i === 30) menus.setScreen('ascension'); if (i === 55) menus.setScreen('inventory'); if (i === 80) menus.setScreen(null); }
  : (i) => look(Math.sin(i * 0.06) * 22, Math.sin(i * 0.021) * 5);
const frames = SEG === 'menu-open' ? 90 : 150;
if (SEG === 'menu-open') hold(); else hold('KeyW', 'ShiftLeft');

const progs = () => g.renderer.info.programs.map((p) => p.name + '|' + (p.cacheKey || '').length);
for (let i = 0; i < 6; i++) { each(i); g.frame(dt); }
gl.finish();
await new Promise((r) => setTimeout(r, 400));

let prev = progs();
const mem0 = () => { const m = g.renderer.info.memory; return { geo: m.geometries, tex: m.textures }; };
let pm = mem0();
const events = [], series = [];
for (let i = 0; i < frames; i++) {
  each(i);
  gl.finish();
  const t0 = performance.now();
  g.frame(dt);
  gl.finish();
  const ms = performance.now() - t0;
  const now = progs(), m = mem0();
  const added = now.filter((p) => !prev.includes(p));
  series.push(+ms.toFixed(1));
  if (ms > 20 || added.length || m.geo !== pm.geo || m.tex !== pm.tex) {
    events.push({ frame: i, ms: +ms.toFixed(1), newPrograms: added, progTotal: now.length,
      dGeo: m.geo - pm.geo, dTex: m.tex - pm.tex });
  }
  prev = now; pm = m;
  await new Promise((r) => setTimeout(r, 0));
}
return { segment: SEG, series, events };

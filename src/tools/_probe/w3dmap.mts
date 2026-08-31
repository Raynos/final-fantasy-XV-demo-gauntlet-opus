/*
 * Lane W3-D: photograph the map's refusal the way the playtest met it.
 *
 *   node src/tools/probe.mts src/tools/_probe/w3dmap.mts --shot tmp/w3d/refuse.jpg
 *
 * Opens the chart, steps the selection onto an UNSURVEYED haven -- the exact
 * pin the playtest had selected -- and presses Enter. The frame is the answer
 * to that press. `--set __W3D_CASE=drive` presses I instead; `--set
 * __W3D_CASE=ok` selects a pin fast travel accepts, so the live legend can be
 * compared against the dimmed one.
 */
const g = window.GAME;
const out = [];
const menus = g.get('Menus');
const step = (n) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const CASE = String(window.__W3D_CASE || 'survey');

g.applyShot('hud_field');
g.get('Director').play();
g.get('Story')?.applyShot?.(null);
g.settle(60);
g.input.pointerLocked = false;

menus.setScreen('world');
step(90);                                   // let the reveal finish
const s = menus.screens.world;

// Pick the pin this case wants, by name in the visible list.
const want = (p) => {
  if (CASE === 'ok') return s._verbs(p).travel;
  if (CASE === 'drive') return !s._verbs(p).drive && s._surveyed(p);
  return !s._surveyed(p) && p.type === 'haven';
};
let found = -1;
for (let i = 0; i < s.list.length; i++) if (want(s.list[i])) { found = i; break; }
if (found < 0) for (let i = 0; i < s.list.length; i++) if (!s._surveyed(s.list[i])) { found = i; break; }
s.sel = found;
step(40);
const p = s.list[s.sel];
out.push(`case ${CASE}: selected "${p.name}" (${p.type}) surveyed=${s._surveyed(p)} verbs=${JSON.stringify(s._verbs(p))}`);

if (CASE === 'drive') s.driveThere();
else if (CASE !== 'ok') s.accept();
step(24);                                   // the banner rises in 0.18 s

out.push(`banner: opacity=${s.refuseBar.style.opacity} head="${s.refuseHead.textContent}" fix="${s.refuseFix.textContent}"`);
out.push(`card footer: "${s.cardFt.textContent}" class=${s.cardFt.className}`);
const foot = [...document.querySelectorAll('#menus .menu-foot .prompt')]
  .map((n) => `${n.textContent}${n.classList.contains('off') ? '(dim)' : ''}`);
out.push(`legend: ${foot.join('  |  ')}`);
out.push(`screen still open: ${menus.name}`);
return out.join('\n');

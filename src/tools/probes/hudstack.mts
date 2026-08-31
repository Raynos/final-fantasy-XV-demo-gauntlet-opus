// **Does anything draw on top of what you are trying to read?**
//
// A blind 30-minute playtest hit this six times for six and called it out as
// its number-four complaint: "the tutorial card parks itself on top of whatever
// I just opened" — over the COMBAT and DRIVING column headers on Controls, over
// the selected item's name and the KEY ITEMS tab on Items, over the quest title
// and its first line on Quests, over Gladiolus's name and the whole of Ignis's
// header and portrait on Gear, over the Map and over the camp meal menu. Two
// other lanes reported the same *class* independently the same night: a live
// `Claim` prompt completely hidden behind that card, and nameplates, toasts and
// damage numbers overprinting each other at 5-8 enemies.
//
// **Nothing could have caught it.** `HUD.update` writes
// `hints.muted = !!game.currentShot` on every frame and `Hints._poll` returns
// early on `currentShot` as well, so the hint card is switched OFF in every
// capture this project has ever taken. The instrument that would have found the
// defect had the subject disabled. This probe reaches past the mute and
// `_present`s a card directly, which is what a player gets in their first
// minute.
//
// Two measurements:
//
//  1. **Reading band.** Every registered screen is opened with a hint card up,
//     and the probe reports how much of the card's box lands between the title
//     rule and the footer legend — the band `menufill.mts` defines as the area
//     a screen is allowed to put content in. The rule being tested is the one
//     `src/ui/Layers.ts` states: a full-screen screen owns the reading band and
//     nothing above it may draw inside.
//  2. **Centre-column collisions.** The hint card, the call-out banner, the
//     area/title card, the victory card and the level-up are all hand-placed
//     constants in the same centre column. Every visible pair is intersected.
//
// Run: node src/tools/probe.mts src/tools/probes/hudstack.mts --dirty
const g = window.GAME;
const out = [];
const fails = [];
const hud = g.get('HUD');
const menus = g.get('Menus');
if (!hud || !menus) return 'NO HUD';
const step = (n) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };

const HINT = {
  id: 'boot', title: 'Where you are',
  text: 'Hammerhead — reach the garage. It is tracked on the compass, top right. '
    + 'H shows every control; Tab opens the menu; M opens the map.',
  keys: ['H', 'Tab', 'M'], ico: 'quests',
};
const force = () => {
  const h = hud.hints;
  h.reset();
  h.muted = false;
  h._present({ ...HINT });
  h.a = 1;
};

// The band, in real screen pixels. `menufill` states it at the 1600x900
// authoring size; `Menus` writes `zoom` on `.menu-wrap`, so the band a reader
// actually sees is those numbers times the zoom, measured off the element
// rather than recomputed from `innerWidth`.
const zoom = parseFloat(getComputedStyle(menus.wrap).zoom) || 1;
const BAND = { top: 150 * zoom, bottom: 812 * zoom };
out.push(`reading band ${BAND.top.toFixed(0)}..${BAND.bottom.toFixed(0)} px `
  + `(150..812 at 1600x900, zoom ${zoom.toFixed(3)}) on a ${window.innerWidth}x${window.innerHeight} page`);
out.push('');
out.push('  screen        card top  card bot   ink in band');

const names = Object.keys(menus.screens || {});
let worst = 0, worstName = '';
for (const name of names) {
  menus.setScreen(null); step(6);
  menus.setScreen(name);
  force();
  step(70);
  const card = hud.hints.card;
  const cs = getComputedStyle(card);
  const vis = parseFloat(cs.opacity) > 0.02
    && card.offsetParent !== null
    && getComputedStyle(hud.hints.root).display !== 'none';
  const r = card.getBoundingClientRect();
  const overlap = vis
    ? Math.max(0, Math.min(r.bottom, BAND.bottom) - Math.max(r.top, BAND.top))
    : 0;
  if (overlap > worst) { worst = overlap; worstName = name; }
  out.push(`  ${name.padEnd(12)} ${vis ? r.top.toFixed(0).padStart(8) : '     off'}`
    + ` ${vis ? r.bottom.toFixed(0).padStart(9) : '        -'}`
    + ` ${overlap.toFixed(0).padStart(13)} px`
    + (overlap > 1 ? '   <-- COVERS THE SCREEN' : ''));
}
menus.setScreen(null); step(20);
out.push('');
if (worst > 1) fails.push(`the hint card draws ${worst.toFixed(0)} px into the reading band (worst: ${worstName})`);
else out.push('no screen has anything drawn into its reading band');

// ------------------------------------------------- 2. centre-column pairs
//
// Forced up together on purpose. These do all co-occur in play — a title card
// fires on arrival, a fight starts, a level lands — and the playtest saw two of
// them as "giant overlapping watermarks across the combat HUD".
out.push('');
force();
hud.areaTitle('Hammerhead', 'Cid Sophiar, Mechanic', 'Leide');
hud.callOut('Coeurl!', 'A hunt has found you');
hud.levelUp(28);
step(40);
const WATCH = [
  ['hint', hud.hints.card],
  ['callout', document.querySelector('#hud .callout')],
  ['areacard', document.querySelector('#screenfx .areacard')],
  ['victory', document.querySelector('#screenfx .victory')],
  ['levelup', document.querySelector('#screenfx .levelup')],
  ['prompt', document.querySelector('#interact .ix-body')],
];
const live = [];
for (const [k, node] of WATCH) {
  if (!node) continue;
  const r = node.getBoundingClientRect();
  const a = parseFloat(getComputedStyle(node).opacity);
  if (r.width < 2 || r.height < 2 || !(a > 0.02)) continue;
  live.push([k, r, a]);
}
out.push(`centre column — ${live.length} element(s) visible together: `
  + live.map(([k, r, a]) => `${k}(a=${a.toFixed(2)} y ${r.top.toFixed(0)}..${r.bottom.toFixed(0)})`).join(' '));
let clashes = 0;
for (let i = 0; i < live.length; i++) {
  for (let j = i + 1; j < live.length; j++) {
    const [ka, ra] = live[i], [kb, rb] = live[j];
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
    const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (w > 0 && h > 0) {
      clashes++;
      out.push(`  CLASH ${ka} x ${kb}: ${w.toFixed(0)}x${h.toFixed(0)} px`);
    }
  }
}
if (clashes) fails.push(`${clashes} centre-column pair(s) overlap`);
else out.push('  no pair overlaps');

const verdict = fails.length ? `FAIL -- ${fails.join('; ')}` : 'PASS -- nothing draws over anything';
return { report: out.join('\n') + '\n\n' + verdict, fail: fails.length > 0 };

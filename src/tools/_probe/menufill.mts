// "Two-column screens sit ~35% empty" -- which screens?
//
// Plan item 32 carries that claim with no screen named against it, and the
// obvious suspect is wrong: the controls card is a FOUR-column grid. So rather
// than argue from a capture, measure every registered menu screen: open it,
// let it animate in, and ask how far down the reading band its lowest painted
// element reaches.
//
// The band is the area between the title rule and the footer legend, which is
// where a screen is allowed to put content. "Empty" is the fraction of that
// band below everything the screen drew. A number, per screen, so the claim
// either names something or dies.
//
// Run: node src/tools/probe.mts src/tools/_probe/menufill.mts --dirty
const g = window.GAME;
const out = [];
const menus = g.get('Menus');
if (!menus) return 'NO MENUS';

g.applyShot('menu_main');
g.get('Director')?.play?.();
const step = (n) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
step(40);

const BAND_TOP = 150, BAND_BOTTOM = 812;          // title rule -> footer legend, at 900 tall
const band = BAND_BOTTOM - BAND_TOP;

const names = Object.keys(menus.screens || {});
out.push(`band ${BAND_TOP}..${BAND_BOTTOM} px of a ${window.innerHeight}px page`);
out.push('');
out.push('  screen           cols  lowest  empty below  widest gap');

const rows = [];
for (const name of names) {
  menus.setScreen(name);
  step(70);
  const node = menus.screens[name] && menus.screens[name].node;
  if (!node) { out.push(`  ${name.padEnd(16)} -- no node`); continue; }
  let lowest = BAND_TOP;
  // every element that actually painted something a reader can see
  const spans = [];
  for (const e of node.querySelectorAll('*')) {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.02) continue;
    // INK ONLY. The first version of this counted any painted box and reported
    // 0-6% empty for every screen in the game, because the armiger screen's
    // column divider and every `.plate` background run the full height of the
    // band whether or not there is anything inside them. A rule is not
    // content; what makes a screen feel empty is where the last WORD is. So:
    // elements with a direct text child, plus glyph elements.
    const tag = e.tagName.toLowerCase();
    const glyph = tag === 'svg' || tag === 'img' || tag === 'canvas';
    let hasOwnText = false;
    for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) hasOwnText = true;
    if (!glyph && !hasOwnText) continue;
    if (r.top > BAND_BOTTOM || r.bottom < BAND_TOP) continue;
    lowest = Math.max(lowest, Math.min(r.bottom, BAND_BOTTOM));
    spans.push([Math.max(r.top, BAND_TOP), Math.min(r.bottom, BAND_BOTTOM)]);
  }
  // how many distinct columns: cluster leaf x-centres
  const xs = [];
  for (const e of node.children) {
    const r = e.getBoundingClientRect();
    if (r.width > 40 && r.height > 40) xs.push(Math.round(r.left + r.width / 2));
  }
  xs.sort((a, b) => a - b);
  let cols = 0, last = -1e9;
  for (const x of xs) { if (x - last > 90) cols++; last = x; }

  // the widest horizontal band with nothing in it, anywhere inside the region
  spans.sort((a, b) => a[0] - b[0]);
  let gap = 0, cursor = BAND_TOP;
  for (const [t, b] of spans) { if (t > cursor) gap = Math.max(gap, t - cursor); cursor = Math.max(cursor, b); }
  gap = Math.max(gap, BAND_BOTTOM - cursor);

  const empty = (BAND_BOTTOM - lowest) / band;
  rows.push({ name, cols, lowest, empty, gap });
}
rows.sort((a, b) => b.empty - a.empty);
for (const r of rows) {
  out.push(`  ${r.name.padEnd(16)} ${String(r.cols).padStart(3)}   ${r.lowest.toFixed(0).padStart(5)}   `
    + `${(r.empty * 100).toFixed(0).padStart(9)}%   ${r.gap.toFixed(0).padStart(6)} px`);
}
return out.join('\n');

/*
 * Play the chart with the keyboard, the way the playtest did.
 *
 * The report: "I cycled 120 map points with the arrow keys. Every single one
 * except Hammerhead, Hammerhead Parking and Redlyn Haven was UNSURVEYED SITE ·
 * UNKNOWN. I never worked out how to move the selection into the filter list.
 * And the footer says `Enter — TRAVEL`, but pressing Enter on an unsurveyed
 * site does nothing at all: no sound, no message, no refusal."
 *
 * Three claims, driven rather than read:
 *
 *  1. an unsurveyed pin now names its TYPE and says how close you have to get;
 *  2. Enter on it refuses, in words, in the footer;
 *  3. up/down really does move the filter rail, and the footer says which axis
 *     does what.
 *
 * `Menus._nav` reads `input.pressed`, the per-frame EDGE set that `endFrame`
 * clears, so a press has to be re-armed on the frame it should be seen on --
 * adding to `input.keys` tests the probe, not the game.
 *
 * Run: node src/tools/probe.mts src/tools/probes/mapfeel.mts --dirty \
 *        --shot tmp/shots/l12d-mapfeel/m.jpg
 */
const g = window.GAME;
const out = [];
const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const press = (code) => { g.input.pressed.add(code); g.frame(1 / 60); step(6); };

g.applyShot('menu_world');
g.settle(50);
const menus = g.get('Menus');
const scr = menus.screens?.world;
if (!scr) return 'no world screen';

out.push(`list ${scr.list.length} of ${scr.map.pois.length} pois; `
  + `known ${scr.map.discovered.size}`);
out.push(`footer row: ${JSON.stringify(menus._foot)}`);

// 1. walk right until an unsurveyed pin is selected
let unsurveyed = null;
for (let i = 0; i < 40 && !unsurveyed; i++) {
  press('ArrowRight');
  const p = scr.list[scr.sel];
  if (p && !scr.map.discovered.has(p.id)) unsurveyed = p;
}
if (!unsurveyed) return out.join('\n') + '\nno unsurveyed pin reachable with ArrowRight';
step(30);
out.push('');
out.push(`selected: ${unsurveyed.id} (${unsurveyed.type}, r=${unsurveyed.r})`);
out.push(`  name  "${scr.cardName.textContent}"`);
out.push(`  type  "${scr.cardType.textContent}"`);
out.push(`  does  "${scr.cardDoes.textContent}"`);
out.push(`  foot  "${scr.cardFt.textContent}"`);
if (window.__shot) await window.__shot('charted');

// 2. Enter on it
press('Enter');
step(4);
out.push('');
out.push(`after Enter, screen=${menus.name}`);
out.push(`  foot  "${scr.cardFt.textContent}"  class="${scr.cardFt.className}"`);
if (window.__shot) await window.__shot('refused');

// 3. up/down moves the filter rail
const f0 = scr.filter;
press('ArrowDown');
step(20);
out.push('');
out.push(`filter ${f0} -> ${scr.filter} on ArrowDown, list now ${scr.list.length}`);
if (window.__shot) await window.__shot('filter');

return out.join('\n');

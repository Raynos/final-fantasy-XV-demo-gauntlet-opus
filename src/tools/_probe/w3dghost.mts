/*
 * Lane W3-D: photograph the two overlay ghosts from playtest item 7.
 *
 *   --set __W3D_G=hint   GETTING BACK OUT, with a menu open (it could never
 *                        appear before: raised exactly when the reading band
 *                        was claimed against it)
 *   --set __W3D_G=card   the area card carrying "1,200 EXP REDEEMED", over the
 *                        brightest ground this world has
 */
const g = window.GAME;
const out = [];
const hud = g.get('HUD');
const menus = g.get('Menus');
const step = (n) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const CASE = String(window.__W3D_G || 'hint');

g.applyShot('hud_field');
g.get('Director').play();
g.get('Story')?.applyShot?.(null);
hud.setVisible(true);
g.settle(60);

if (CASE === 'hint') {
  // Burn the boot hint the way a player does, so the menu hint is the current
  // one rather than queued behind nine seconds of "Where you are".
  hud.hints.dismiss(); step(40);
  menus.setScreen('world');
  step(150);
  const card = document.querySelector('#hints .hint');
  out.push(`hint id=${hud.hints.cur?.id} suspended=${hud.hints.suspended} a=${hud.hints.a.toFixed(3)} cardOpacity=${card?.style.opacity}`);
  out.push(`title="${document.querySelector('#hints .hn-t')?.textContent}"`);
} else {
  hud.areaTitle('Day 3', '1,200 EXP redeemed', 'Longwythe Rest Area  ·  x1.2');
  step(50);
  const sub = document.querySelector('.areacard .ac-sub');
  out.push(`areacard sub="${sub?.textContent}" opacity=${sub?.style.opacity} cardOpacity=${document.querySelector('.areacard')?.style.opacity}`);
}
return out.join('\n');

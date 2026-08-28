// How dark should the scrim gradient be now that the blur actually renders?
//
//   node src/tools/probe.mts src/tools/_probe/scrimtone.mts --dirty --shot tmp/shots/scrimtone.png
//
// The gradient was tuned while `backdrop-filter` was inert, so it was doing all
// of the dimming on its own. With `brightness(.54) saturate(.58)` live on top of
// it the shipped values leave nothing of the world at all.
const g = window.GAME;
g.resetClock();
g.applyShot('menu_main');
g.settle(20);
g.get('Menus').setScreen('elemancy');
g.settle(80);
const scrim = g.get('Menus').scrim;
const arms = [
  ['a-shipped-74-93', '.74', '.93'],
  ['b-52-72', '.52', '.72'],
  ['c-38-60', '.38', '.60'],
  ['d-26-48', '.26', '.48'],
  ['e-none', '0', '0'],
];
for (const [name, i, o] of arms) {
  scrim.style.background = `radial-gradient(ellipse 90% 80% at 32% 46%, rgba(4,7,13,${i}), rgba(2,4,8,${o}))`;
  g.frame(1 / 60);
  await window.__shot(name);
}
scrim.style.background = '';
return { done: true };

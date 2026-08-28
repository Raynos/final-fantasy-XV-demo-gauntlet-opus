// Which promotion makes `.menu-scrim`'s backdrop-filter composite in place?
//
//   node src/tools/probe.mts src/tools/_probe/scrimfix2.mts --dirty --shot tmp/shots/scrimfix2.png
//
// PNG byte size is the metric: a blurred frame is low-entropy and small, a sharp
// one is large. Blur only, gradient removed, so the difference is the filter.
const g = window.GAME;
g.resetClock();
g.applyShot('menu_main');
g.settle(20);
g.get('Menus').setScreen('elemancy');
g.settle(80);
const menus = g.get('Menus');
const scrim = menus.scrim;
const home = scrim.parentElement;

const bare = () => {
  scrim.style.setProperty('background-image', 'none');
  scrim.style.setProperty('background-color', 'transparent');
  scrim.style.backdropFilter = 'blur(26px) saturate(.58) brightness(.54)';
};
const reset = () => {
  scrim.style.position = ''; scrim.style.willChange = ''; scrim.style.transform = '';
  menus.root.style.position = ''; menus.root.style.willChange = '';
  if (scrim.parentElement !== home) home.prepend(scrim);
};

const arm = async (name, f) => { reset(); bare(); f(); g.frame(1 / 60); await window.__shot(name); };

await arm('1-as-shipped-absolute', () => {});
await arm('2-scrim-position-fixed', () => { scrim.style.position = 'fixed'; });
await arm('3-scrim-will-change', () => { scrim.style.willChange = 'backdrop-filter'; });
await arm('4-scrim-translateZ', () => { scrim.style.transform = 'translateZ(0)'; });
await arm('5-menuroot-fixed', () => { menus.root.style.position = 'fixed'; });
await arm('6-scrim-in-uiRoot', () => { g.uiRoot.prepend(scrim); });
reset();
scrim.style.background = '';
return { done: true };
// NOTE THE `await`s above. `window.__shot` is an exposed async binding: called
// without `await`, the body runs on and every shot is taken after it returns,
// so all the arms photograph the SAME frame. That artifact produced two wrong
// conclusions here before it was noticed -- "the scrim does not paint at all"
// and "mix-blend-mode on the grain is the cause" -- both of which were the
// restored state being photographed five times.

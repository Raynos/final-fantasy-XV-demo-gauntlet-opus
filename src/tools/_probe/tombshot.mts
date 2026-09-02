/* Stand at the Tomb of the Rogue's sarcophagus with the Claim prompt up. */
const g = window.GAME;
const ix = g.get('Interaction'), player = g.get('Player'), terrain = g.get('Terrain');
const rpg = g.get('Rpg'), menus = g.get('Menus'), hud = g.get('HUD');
const kits = g.get('Props').poiKits;
const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };

g.input.pointerLocked = true;
g.get('Director').play();
g.get('Story') && g.get('Story').applyShot && g.get('Story').applyShot(null);
g.get('Cinematics') && g.get('Cinematics').stop && g.get('Cinematics').stop({ skipped: true });
menus.setScreen(null); step(24);
hud.setMenuOpen(false); step(4);

const pin = { x: -2514, z: -3292 };
const py = terrain.heightAt(pin.x + 12, pin.z);
for (let i = 0; i < 60; i++) { player.root.position.set(pin.x + 12, py, pin.z); step(1); }

const a = kits.anchorAt('tomb_rogue', 'sarcophagus');
const node = rpg.tombs.byPoi('tomb_rogue');
// 3.2 m back from the coffin along the line from the pin, looking at it.
const bx = a.x + (a.x - pin.x) / 7.19 * 3.2, bz = a.z + (a.z - pin.z) / 7.19 * 3.2;
// On the stylobate, not on the dirt beside it: the coffin's own local y is
// `deck + 1.16` under a 1.4 scale, so the deck top is 1.624 m under the anchor.
const by = a.y - 1.624;
const h = Math.atan2(a.x - bx, a.z - bz);
hud.hints.muted = true; hud.hints.cur = null; hud.hints.a = 0; hud.hints.queue.length = 0;
const enc = g.get('Encounters'); if (enc) { enc.packs.length = 0; enc.active.clear(); enc._roamTimer = 1e9; }
const en = g.get('Enemies'); if (en) en.clear();
for (let i = 0; i < 260; i++) {
  hud.hints.muted = true;
  if (en) en.clear();
  player.root.position.set(bx, by, bz);
  player.heading = h; player.root.rotation.y = h;
  step(1);
}
return {
  anchored: node.anchored,
  enabled: node.handle.item.enabled(),
  sarc: [a.x.toFixed(1), a.y.toFixed(1), a.z.toFixed(1)],
  stand: [bx.toFixed(1), by.toFixed(1), bz.toFixed(1)],
  distToCoffin: Math.hypot(a.x - bx, a.z - bz).toFixed(2),
  current: ix.current ? `${ix.current.verb} ${ix.current.label} (${ix.current.id})` : 'NONE',
  appear: ix.appear.toFixed(2),
};

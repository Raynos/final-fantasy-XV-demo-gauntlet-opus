/* Scratch: does chocobo-stable-wiz's pos move during its own walk-up? */
const g = window.GAME;
const wm = (await import('/world/map/WorldMap.ts')).worldMap;
const ix = g.get('Interaction'), player = g.get('Player'), terrain = g.get('Terrain');
const kits = g.get('Props') && g.get('Props').poiKits;
const cb = g.get('Chocobo');
const out = [];
const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
g.input.pointerLocked = true;
g.get('Director').play();
g.get('Menus').setScreen(null); step(24);
g.get('HUD').setMenuOpen(false); step(4);

out.push(`hub _tick=${cb.hub._tick} anchored=[${[...cb.hub._anchored].join(',')}]`);
for (const id of ['chocobo-stable-wiz', 'chocobo-races-wiz', 'chocobo-stable-alpine']) {
  const it = ix.items.get(id);
  if (!it) { out.push(`${id}: MISSING`); continue; }
  const poi = wm.poiById(id.endsWith('alpine') ? 'meldacio_layby' : 'wiz_chocobo');
  const x0 = it.pos.x, z0 = it.pos.z;
  const ax = it.pos.x + 1.55, az = it.pos.z + 1.55;
  const ay = terrain.heightAt(ax, az);
  player.root.position.set(ax, ay, az);
  player.heading = Math.atan2(it.pos.x - ax, it.pos.z - az);
  player.root.rotation.y = player.heading;
  g.camera.position.set(ax + 4, ay + 3, az + 4);
  g.camera.lookAt(it.pos.x, ay + 1.2, it.pos.z);
  ix.current = null;
  for (let i = 0; i < 8; i++) { player.root.position.set(ax, ay, az); step(1); }
  const moved = Math.hypot(it.pos.x - x0, it.pos.z - z0);
  const dEnd = Math.hypot(it.pos.x - ax, it.pos.z - az);
  const got = ix.current ? String(ix.current.id) : null;
  const anch = kits.anchorAt(poi.id, id.startsWith('chocobo-races') ? 'board' : 'stable');
  out.push(`${id}: r=${it.radius} enabled=${it.enabled()} pin_r=${Math.hypot(x0 - poi.x, z0 - poi.z).toFixed(1)}`
    + ` moved=${moved.toFixed(2)} dEnd=${dEnd.toFixed(2)} got=${got || 'nothing'}`
    + ` anchor=${anch ? 'yes r=' + Math.hypot(anch.x - poi.x, anch.z - poi.z).toFixed(1) : 'null'}`
    + ` tick=${cb.hub._tick}`);
}
return { report: out.join('\n') };

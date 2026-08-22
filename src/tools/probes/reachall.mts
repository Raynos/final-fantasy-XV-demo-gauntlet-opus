/* Stand in front of every interactable in turn. Does the prompt name it? */
const g = window.GAME;
const out = [];
const ix = g.get('Interaction');
const player = g.get('Player');
const terr = g.get('Terrain');
const menus = g.get('Menus');

let _hold = null;
const hold = () => {
  if (!_hold) return;
  player.root.position.set(_hold.x, _hold.y, _hold.z);
  player.heading = _hold.h; player.root.rotation.y = _hold.h;
  if (player.velocity) player.velocity.set(0, 0, 0);
};
const step = (n = 1) => { for (let i = 0; i < n; i++) { hold(); g.frame(1 / 60); hold(); } };

g.input.pointerLocked = true;
g.get('Director').play();
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null); step(20);
g.get('HUD').setMenuOpen(false); step(4);

const items = [...ix.items.values()];
out.push(`${items.length} interactables registered`);
out.push('');
out.push('stand 1.2 m in front of each, facing it:');
let wrong = 0;
for (const it of items) {
  // approach from 1.2 m along +x, looking at the anchor
  const ax = it.pos.x + 1.2, az = it.pos.z;
  _hold = { x: ax, y: terr.heightAt(ax, az), z: az, h: Math.atan2(it.pos.x - ax, it.pos.z - az) };
  ix.current = null;
  step(10);
  const cur = ix.current;
  const ok = cur && cur.id === it.id;
  if (!ok) wrong++;
  const alt = cur ? `${cur.id} (p${cur.priority}, ${Math.hypot(cur.pos.x - ax, cur.pos.z - az).toFixed(1)} m)` : 'nothing';
  out.push(`  ${ok ? 'ok  ' : 'MISS'} ${it.id.padEnd(18)} p${it.priority} "${it.verb} ${it.label}"${ok ? '' : `  -> got ${alt}`}`);
}
out.push(`${wrong}/${items.length} interactables cannot be selected by standing in front of them`);

out.push('');
out.push('how close together is the Hammerhead cluster?');
const hh = items.filter((i) => i.id.startsWith('hh_') || i.id.startsWith('npc_'));
for (const a of hh) {
  const near = hh.filter((b) => b !== a)
    .map((b) => [b.id, Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)])
    .sort((x, y) => x[1] - y[1]).slice(0, 2);
  out.push(`  ${a.id.padEnd(18)} p${a.priority} r${a.radius}  nearest: ${near.map(([id, d]) => `${id} ${d.toFixed(1)} m`).join(', ')}`);
}

out.push('');
out.push('a sloppier approach: 2.2 m away at 45 degrees off the anchor');
let wrong2 = 0;
for (const it of hh) {
  const ax = it.pos.x + 1.55, az = it.pos.z + 1.55;
  _hold = { x: ax, y: terr.heightAt(ax, az), z: az, h: Math.atan2(it.pos.x - ax, it.pos.z - az) };
  ix.current = null;
  step(10);
  const cur = ix.current;
  const ok = cur && cur.id === it.id;
  if (!ok) wrong2++;
  out.push(`  ${ok ? 'ok  ' : 'MISS'} ${it.id.padEnd(18)} -> ${cur ? cur.id : 'nothing'}`);
}
out.push(`${wrong2}/${hh.length} missed on the diagonal approach`);

return out.join('\n');

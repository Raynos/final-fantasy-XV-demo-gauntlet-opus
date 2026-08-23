/* Does any interaction prompt offer a subject that is not there? */
const g = window.GAME;
const out = [];
const ix = g.get('Interaction');
const player = g.get('Player');
const npcs = g.get('Npcs');
const menus = g.get('Menus');

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };

g.input.pointerLocked = true;
g.get('Director').play();
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null); step(20);
g.get('HUD').setMenuOpen(false); step(4);

const p = player.position;
out.push(`player spawn (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
out.push('');

// Every registered interactable, and how far its record sits from the thing it
// claims to be. For an NPC that is `npc.pos`; anything else is judged against
// whether its anchor is at the world origin, which no real fixture is.
out.push('every interactable: where its prompt anchor sits, and where its subject is');
let phantom = 0;
for (const it of [...ix.items.values()].sort((a, b) => a.id.localeCompare(b.id))) {
  const d0 = Math.hypot(it.pos.x, it.pos.z);
  let note = '';
  if (it.id.startsWith('npc_')) {
    const key = it.id.slice(4);
    const npc = (npcs?.list || []).find((n) => n.id === key);
    if (!npc) note = 'NO SUCH PERSON';
    else {
      const off = Math.hypot(it.pos.x - npc.pos.x, it.pos.z - npc.pos.z);
      if (off > 2.0) note = `${off.toFixed(0)} m FROM THE PERSON`;
    }
  }
  if (d0 < 1.0) note = `${note ? `${note}; ` : ''}ANCHORED AT THE WORLD ORIGIN`;
  if (note) { phantom++; out.push(`  ${it.id.padEnd(20)} (${it.pos.x.toFixed(0)},${it.pos.z.toFixed(0)}) r${it.radius}  ${note}`); }
}
out.push(`  ${phantom} anchors do not sit on their subject`);
out.push('');

// The frame the judge saw: standing at the breakdown, is anything offered?
out.push('standing where the game starts, with nobody within a kilometre:');
const near = [...ix.items.values()]
  .map((i) => [i.id, Math.hypot(i.pos.x - p.x, i.pos.z - p.z), i.radius])
  .filter(([, d, r]) => d < r + 6)
  .sort((a, b) => a[1] - b[1]);
out.push(near.length
  ? near.map(([id, d, r]) => `  ${id} ${d.toFixed(1)} m (radius ${r})`).join('\n')
  : '  nothing in reach — correct');
step(20);
out.push(`  prompt reads: ${ix.current ? `[E] ${ix.current.verb} ${ix.current.label}` : 'nothing'}`);

// And a sweep: walk a ring around the spawn and see whether anything is ever
// offered with no visible subject.
out.push('');
out.push('sweeping 24 stances around the spawn at 4 m:');
let offered = 0;
for (let i = 0; i < 24; i++) {
  const a = (i / 24) * Math.PI * 2;
  player.root.position.set(p.x + Math.cos(a) * 4, player.root.position.y, p.z + Math.sin(a) * 4);
  player.heading = a + Math.PI;
  player.root.rotation.y = player.heading;
  ix.current = null;
  step(6);
  if (ix.current) { offered++; out.push(`  at ${(a * 57.3).toFixed(0)} deg: [E] ${ix.current.verb} ${ix.current.label} (${ix.current.id})`); }
}
out.push(`  ${offered}/24 stances offered a prompt at the breakdown`);

return out.join('\n');

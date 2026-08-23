/* Is the town's published hunt-board anchor where the hunt board actually is? */
const g = window.GAME;
const out = [];
const ix = g.get('Interaction');
const town = g.get('Town');

const a = town.anchors;
out.push(`town.origin (${town.origin.x.toFixed(1)}, ${town.origin.z.toFixed(1)})`);
out.push('');
out.push('published anchors:');
for (const k of Object.keys(a)) {
  const v = a[k];
  if (!v || typeof v.x !== 'number') { out.push(`  ${k.padEnd(14)} (not a point)`); continue; }
  out.push(`  ${k.padEnd(14)} (${v.x.toFixed(1)}, ${v.z.toFixed(1)})`);
}
out.push('');
out.push('registered interactables, and the nearest published anchor to each:');
for (const it of [...ix.items.values()].sort((x, y) => x.id.localeCompare(y.id))) {
  let best = null, bd = 1e9;
  for (const k of Object.keys(a)) {
    const v = a[k];
    if (!v || typeof v.x !== 'number') continue;
    const d = Math.hypot(v.x - it.pos.x, v.z - it.pos.z);
    if (d < bd) { bd = d; best = k; }
  }
  out.push(`  ${it.id.padEnd(20)} (${it.pos.x.toFixed(1)},${it.pos.z.toFixed(1)}) r${it.radius}  nearest anchor ${best} ${bd.toFixed(1)} m${bd > it.radius ? '  OUT OF REACH OF IT' : ''}`);
}
return out.join('\n');

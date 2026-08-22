/* Where exactly is Cotisse Haven, and what is built on it? */
const g = window.GAME;
const rpg = g.get('Rpg');
const terr = g.get('Terrain');
const out = [];
for (const h of rpg.day.havens().slice(0, 3)) {
  out.push(`${h.id} "${h.name}" lv${h.level} at (${h.pos[0]},${h.pos[2]}) ground h=${terr.heightAt(h.pos[0], h.pos[2]).toFixed(1)}`);
}
const c = rpg.day.havens().find((h) => h.id === 'longwythe_haven');
out.push(`cotisse: ${c ? `(${c.pos[0]},${c.pos[2]}) h=${terr.heightAt(c.pos[0], c.pos[2]).toFixed(1)}` : 'not found'}`);
// what scene objects sit within 40 m of it
const near = [];
g.scene.traverse((o) => {
  if (!o.name || !o.visible) return;
  const p = new (o.position.constructor)();
  o.getWorldPosition(p);
  const d = Math.hypot(p.x - c.pos[0], p.z - c.pos[2]);
  if (d < 40 && o.name) near.push(`${o.name}@${d.toFixed(0)}m y=${p.y.toFixed(1)}`);
});
out.push(`objects within 40 m (${near.length}): ${near.slice(0, 25).join(', ')}`);
return out.join('\n');

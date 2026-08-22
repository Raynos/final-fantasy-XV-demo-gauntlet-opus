/* What does the hunt board actually offer, and why will it not take one? */
const g = window.GAME;
const out = [];
const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const menus = g.get('Menus'), rpg = g.get('Rpg');
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Director').play();
menus.setScreen(null); step(20);
menus.setScreen('hunts'); step(20);
const s = menus.screens.hunts;
out.push(`tabs=${JSON.stringify(s._tabs || s.ledgers())} tab=${s.tab} i=${s.i} points=${s.hunterPoints} rank=${JSON.stringify(s.rank().cur)}`);
const rows = s._rows || [];
out.push(`rows=${rows.length}`);
for (const r of rows.slice(0, 12)) {
  out.push(`  ${r.h.id} rank=${r.h.rank} lv=${r.h.level} status=${r.status} locked=${r.locked} why="${r.why}"`);
}
out.push(`active before: ${rpg.quests.byStatus('active').map((q) => q.id).join(',')}`);
// walk every tab, press Enter on every row, and collect the screen's own reply
for (let t = 0; t < (s._tabs || s.ledgers()).length; t++) {
  s.tab = t; s.i = 0; step(4);
  const rs = s._rows || [];
  for (let i = 0; i < rs.length; i++) {
    s.i = i; step(2);
    s._msg = null;
    s.accept();
    step(2);
    if (s._msg) out.push(`  tab${t}[${i}] ${rs[i].h.id}: ${s._msg.ok ? 'OK' : 'NO'} "${s._msg.text}"`);
  }
}
out.push(`active after: ${rpg.quests.byStatus('active').map((q) => q.id).join(',')}`);
menus.setScreen(null);
return out.join('\n');

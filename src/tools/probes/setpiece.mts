/* Do the staged fights actually put a boss in the world when their quest is up to it? */
const g = window.GAME;
const out = [];
const rpg = g.get('Rpg');
const dir = g.get('Director');
// `Director` is the play director; the boss lives on the *encounter* director.
const enc = g.get('Encounters');
const player = g.get('Player');
const terr = g.get('Terrain');
const enemies = g.get('Enemies');
const menus = g.get('Menus');
const party = g.get('Party');
const S = await import('/game/encounters/SpawnTables.ts');
const Q = await import('/game/rpg/Quests.ts');

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const goTo = (x, z) => {
  const y = terr.heightAt(x, z);
  player.root.position.set(x, y, z);
  g.camera.position.set(x, y + 3, z + 8);
  g.camera.lookAt(x, y + 1.2, z);
  party.snap?.();
  step(4);
  player.root.position.set(x, y, z);
  step(8);
};

g.input.pointerLocked = true;
g.get('Story')?._resume?.();
dir.play();
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null); step(20);
g.get('HUD').setMenuOpen(false); step(4);

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; out.push(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  ${extra}` : ''}`); };

out.push('the four staged fights:');
for (const k of Object.keys(S.SET_PIECES)) {
  const s = S.SET_PIECES[k];
  out.push(`  ${k.padEnd(16)} ${s.kind.padEnd(9)} boss "${s.boss}" lv${s.level} at (${Math.round(s.at[0])},${Math.round(s.at[1])})`);
}
out.push('');
const staged = Object.values(Q.QUESTS).filter((q) => q.setPiece);
out.push(`quests that stage one: ${staged.map((q) => `${q.id} -> ${q.setPiece}`).join(', ')}`);
check('every set piece has a quest that reaches it',
  Object.keys(S.SET_PIECES).every((k) => staged.some((q) => q.setPiece === k)),
  `unreached: ${Object.keys(S.SET_PIECES).filter((k) => !staged.some((q) => q.setPiece === k)).join(', ') || 'none'}`);
out.push('');


for (const q of staged) {
  out.push('');
  out.push(`-- ${q.id} (${q.setPiece}) --`);
  // unlock and accept it the way the story would
  for (const r of q.requires || []) {
    if (rpg.quests.status(r) !== 'complete') { rpg.quests.states[r].status = 'active'; rpg.quests.complete(r); }
  }
  rpg.quests.refresh();
  if (rpg.quests.status(q.id) === 'available') rpg.quests.accept(q.id);
  check('the quest can be started', rpg.quests.status(q.id) === 'active', rpg.quests.status(q.id));
  if (rpg.quests.status(q.id) !== 'active') continue;

  const kill = q.objectives.find((o) => o.type === 'kill');
  const before = enemies.list.filter((e) => !e.dead).length;

  // satisfy everything before the kill, which is what arms it
  const st = rpg.quests.state(q.id);
  for (let i = 0; i < q.objectives.length; i++) {
    const o = q.objectives[i];
    if (o.type === 'kill') break;
    if (st.objectives[i].done) continue;
    if (o.type === 'reach') { goTo(o.waypoint[0], o.waypoint[2]); rpg.quests.notify('reach', { target: o.target }); }
    else if (o.type === 'talk') rpg.quests.notify('talk', { target: o.target });
    step(4);
  }
  goTo(kill.waypoint[0], kill.waypoint[2]);
  step(40);

  const boss = enemies.list.find((e) => !e.dead && e.boss);
  const named = enemies.list.filter((e) => !e.dead).length;
  out.push(`  live enemies ${before} -> ${named}; enc.boss=${enc.boss ? enc.boss.def.id : 'null'}`);
  check('a boss is standing in the world', !!boss,
    boss ? '' : `nothing with .boss among ${named} live enemies`);
  if (boss) {
    const d = Math.hypot(boss.root.position.x - kill.waypoint[0], boss.root.position.z - kill.waypoint[2]);
    check('and it is at the quest marker', d < 90, `${d.toFixed(0)} m from the waypoint`);
    // `id` is the instance number. `speciesId` is what the quest log matches
    // kill objectives against — `questId` if the species declares one, else the
    // bestiary key — which is the only identity that matters here.
    check('and it is the species the quest wants', boss.speciesId === kill.target,
      `got "${boss.speciesId}", the objective wants "${kill.target}"`);
    out.push(`  ${boss.name ?? boss.id}: ${Math.round(boss.hp)} hp, level ${boss.level}`);
  }
  // tidy up before the next one
  enc.endBoss?.(false);
  for (const e of enemies.list.slice()) if (!e.dead) enemies.despawn(e);
  step(4);
}

out.push('');
out.push(`${fails} failures`);
return out.join('\n');

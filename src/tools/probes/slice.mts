/* The 30-minute slice, driven with real keys, from the breakdown to a level-up. */
const g = window.GAME;
const out = [];
const rpg = g.get('Rpg');
const ix = g.get('Interaction');
const menus = g.get('Menus');
const player = g.get('Player');
const hud = g.get('HUD');
const terr = g.get('Terrain');

let _hold = null;
const hold = () => {
  if (!_hold) return;
  player.root.position.set(_hold.x, _hold.y, _hold.z);
  player.heading = _hold.h; player.root.rotation.y = _hold.h;
  if (player.velocity) player.velocity.set(0, 0, 0);
};
const step = (n = 1) => { for (let i = 0; i < n; i++) { hold(); g.frame(1 / 60); hold(); } };
const tap = (code, frames = 1) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  step(frames);
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  step(2);
};
const standAt = (x, z, lookAt) => {
  const y = terr.heightAt(x, z);
  const h = lookAt ? Math.atan2(lookAt[0] - x, lookAt[1] - z) : 0;
  _hold = { x, y, z, h };
  step(16);
};
const prompt = () => (ix.current ? `[E] ${ix.current.verb} ${ix.current.label}` : 'none');
const q = (id) => {
  const v = rpg.quests.view(id);
  return v ? `${v.status} ${v.objectives.map((o) => `${o.progress}/${o.count}${o.done ? '*' : ''}`).join(' ')}` : '?';
};

g.input.pointerLocked = true;
g.get('Director').play();
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null); step(24);
hud.setMenuOpen(false); step(4);

out.push('=== 0. what the player is told at the breakdown ===');
const st = rpg.hudState();
out.push(`spawn (${Math.round(player.position.x)},${Math.round(player.position.z)})  day ${st.day} ${st.clock}  level ${st.level}  gil ${st.gil}`);
out.push(`tracked: ${st.tracked ? `"${st.tracked.name}" — ${st.tracked.objectives.find((o) => !o.done)?.desc}` : 'NOTHING TRACKED'}`);
for (const w of st.waypoints) {
  out.push(`  marker "${w.objective}" ${Math.round(Math.hypot(player.position.x - w.pos[0], player.position.z - w.pos[2]))} m away${w.tracked ? ' (tracked)' : ''}`);
}

out.push('');
out.push('=== 1. an imperial patrol on the way, for the scrap Cid wants ===');
const S = await import('/game/encounters/SpawnTables.ts');
const mtDen = S.TERRITORIES.find((t) => t.id === 'crashsite_mt');
out.push(`nearest MT den "${mtDen.name}" at (${mtDen.at[0]},${mtDen.at[1]}), ${Math.round(Math.hypot(mtDen.at[0], mtDen.at[1]))} m from the car`);
const bits0 = rpg.inventory.count('rusted_bit');
out.push(`rusted bits held ${bits0}; quest says ${q('side_engine_blade')}`);
// kill two troopers through the real credit path
for (let i = 0; i < 6; i++) rpg.enemyKilled({ id: 'mt', level: 20, expClass: 'normal', drops: [{ id: 'rusted_bit', chance: 1, count: 1 }] }, {});
out.push(`after six troopers: bits ${rpg.inventory.count('rusted_bit')}, quest ${q('side_engine_blade')}`);

out.push('');
out.push('=== 2. Hammerhead: Cid, then Takka ===');
const cid = [...ix.items.values()].find((i) => i.id === 'npc_cid');
standAt(cid.pos.x + 1.4, cid.pos.z + 1.4, [cid.pos.x, cid.pos.z]);
out.push(`standing at Cid: ${prompt()}`);
tap('KeyE', 3);
out.push(`dialogue open: ${ix.talking}`);
// walk the hand-over: advance to the choice list, pick "Hand over the Rusted Bits"
const d = ix.dialogue;
for (let i = 0; i < 12 && ix.talking; i++) {
  d._typed = d._full.length;
  if (d.chNodes && d.chNodes.length) {
    const k = d.chNodes.findIndex((c) => /hand over/i.test(c.def.label || ''));
    if (k >= 0) { d._sel = k; d._advance(); break; }
    d._sel = 0;
  }
  d._advance(); step(2);
}
step(6);
out.push(`after handing the scrap over: side_engine_blade ${q('side_engine_blade')}`);
for (let i = 0; i < 40 && ix.talking; i++) { d._typed = d._full.length; d._advance(); step(2); }
if (ix.talking) { d.end(); step(2); }

const takka = [...ix.items.values()].find((i) => i.id === 'npc_takka');
standAt(takka.pos.x + 1.4, takka.pos.z + 1.4, [takka.pos.x, takka.pos.z]);
out.push(`standing at Takka: ${prompt()}`);
const ch0 = rpg.chapter;
tap('KeyE', 3);
step(4);
out.push(`main_ch1_pauper ${q('main_ch1_pauper')}  chapter ${ch0} -> ${rpg.chapter}`);
out.push(`newly available: ${rpg.quests.available.map((v) => v.id).join(', ') || 'none'}`);
for (let i = 0; i < 40 && ix.talking; i++) { d._typed = d._full.length; d._advance(); step(2); }
if (ix.talking) { d.end(); step(2); }

out.push('');
out.push('=== 3. spend the reward at the counter ===');
const shop = [...ix.items.values()].find((i) => i.verb === 'Shop');
standAt(shop.pos.x + 1.2, shop.pos.z + 1.2, [shop.pos.x, shop.pos.z]);
out.push(`standing at the shop: ${prompt()}`);
tap('KeyE', 4); step(8);
out.push(`screen: ${menus.name}`);
const gil0 = rpg.inventory.gil, noodles0 = rpg.inventory.count('cup_noodles');
const buy = rpg.inventory.buy ? rpg.inventory.buy('cup_noodles', 2, 'hammerhead') : null;
out.push(`buy 2 Cup Noodles: ${JSON.stringify(buy)} gil ${gil0}->${rpg.inventory.gil}, held ${noodles0}->${rpg.inventory.count('cup_noodles')}`);
menus.setScreen(null); step(6);

out.push('');
out.push('=== 4. take a bounty off the board ===');
const board = [...ix.items.values()].find((i) => /hunt/i.test(i.id));
standAt(board.pos.x + 1.2, board.pos.z + 1.2, [board.pos.x, board.pos.z]);
out.push(`standing at the board: ${prompt()}`);
tap('KeyE', 4); step(8);
out.push(`screen: ${menus.name}; takeable hunts: ${rpg.quests.available.filter((v) => v.type === 'hunt').map((v) => v.id).join(', ') || 'none'}`);
menus.setScreen(null); step(6);

out.push('');
out.push('=== 5. kill the sabertusk pack the board sent you after ===');
out.push(`hunt_sabertusks ${q('hunt_sabertusks')}`);
const gilA = rpg.inventory.gil, rank0 = rpg.quests.hunterPoints;
for (let i = 0; i < 12; i++) rpg.enemyKilled({ id: 'sabertusk', level: 8, drops: [] }, { hunt: 'hunt_sabertusks' });
out.push(`after 12 marks: ${q('hunt_sabertusks')}  gil ${gilA}->${rpg.inventory.gil}  hunter points ${rank0}->${rpg.quests.hunterPoints}`);
out.push(`banked EXP: ${Math.round(rpg.expBank.banked)}`);

out.push('');
out.push('=== 6. camp, cook, sleep ===');
const haven = rpg.day.havens().find((h) => h.id === 'longwythe_haven');
standAt(haven.pos[0] + 2.5, haven.pos[2], [haven.pos[0], haven.pos[2]]);
out.push(`standing on ${haven.name}: ${prompt()}`);
const lv0 = rpg.noctis.level, day0 = rpg.day.day, bank0 = Math.round(rpg.expBank.banked);
tap('KeyE', 3);
out.push(`camp dialogue open: ${ix.talking}`);
// arrive -> menu -> cook -> first recipe
for (let i = 0; i < 20 && ix.talking; i++) {
  d._typed = d._full.length;
  if (d.chNodes && d.chNodes.length) {
    const k = d.chNodes.findIndex((c) => /cook/i.test(c.def.label || ''));
    if (k >= 0) { d._sel = k; d._advance(); step(2); continue; }
    d._sel = 0; d._advance(); step(2); continue;
  }
  d._advance(); step(2);
}
step(10);
out.push(`after cooking and sleeping: day ${day0}->${rpg.day.day}, level ${lv0}->${rpg.noctis.level}, banked ${bank0}->${Math.round(rpg.expBank.banked)}`);
out.push(`meal running: ${rpg.party.activeBuffs.filter((b) => b.kind === 'meal').map((b) => `${b.name} (${(b.recipe?.effects || []).join(', ')})`).join('; ') || 'none'}`);
out.push(`clock ${rpg.day.clockString}, phase ${rpg.day.phase.name}`);

out.push('');
out.push('=== 7. where does the chain go next? ===');
for (const v of rpg.quests.active) {
  const nxt = v.objectives.find((o) => !o.done);
  out.push(`  ACTIVE ${v.id.padEnd(22)} next: ${nxt ? nxt.desc : '(all done)'}`);
}
out.push(`available: ${rpg.quests.available.map((v) => v.id).join(', ') || 'none'}`);

return out.join('\n');

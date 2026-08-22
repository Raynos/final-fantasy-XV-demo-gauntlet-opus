/* Walk onto a haven, press E, cook, sleep, level up. */
const g = window.GAME;
const out = [];
const rpg = g.get('Rpg'), ix = g.get('Interaction'), menus = g.get('Menus');
const player = g.get('Player'), hud = g.get('HUD');
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
g.input.pointerLocked = true;
g.get('Director').play();
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null); step(24);
hud.setMenuOpen(false); step(4);

const camps = [...ix.items.keys()].filter((k) => String(k).startsWith('haven_'));
out.push(`${ix.items.size} interactables, ${camps.length} camps: ${camps.slice(0, 3).join(',')}...`);

const h = rpg.day.havens()[0];
_hold = { x: h.pos[0] + 2.5, y: g.get('Terrain').heightAt(h.pos[0] + 2.5, h.pos[2]), z: h.pos[2], h: Math.atan2(-1, 0) };
step(16);
const cur = ix.current;
out.push(`standing on ${h.id} (${Math.round(h.pos[0])},${Math.round(h.pos[2])}): prompt = ${cur ? `"[E] ${cur.verb} ${cur.label}"` : 'none'}`);
if (!cur) return out.join('\n');

rpg.gainExp(90000);
const lv0 = rpg.noctis.level, day0 = rpg.day.day, bank0 = rpg.expBank.banked;
const tom0 = rpg.inventory.count('lucian_tomato');

tap('KeyE'); step(10);
out.push(`E -> dialogue ${ix.talking}, node ${ix.dialogue.nodeId}`);
// walk to the choice list
for (let i = 0; i < 8 && !(ix.dialogue._visibleChoices && ix.dialogue._visibleChoices().length && ix.dialogue._lineDone); i++) { tap('KeyE'); step(8); }
let ch = ix.dialogue._visibleChoices();
out.push(`menu: ${ch.map((c) => c.label).join(' | ')}`);
// pick "Ask Ignis to cook"
ix.dialogue._sel = 0; step(2); tap('KeyE'); step(10);
for (let i = 0; i < 6 && !(ix.dialogue._visibleChoices().length && ix.dialogue._lineDone); i++) { tap('KeyE'); step(8); }
ch = ix.dialogue._visibleChoices();
out.push(`cook menu (${ix.dialogue.nodeId}): ${ch.map((c) => c.label).join(' | ')}`);
ix.dialogue._sel = 0; step(2); tap('KeyE'); step(20);
out.push(`after cooking + sleeping: node=${ix.dialogue.nodeId}`);
out.push(`day ${day0}->${rpg.day.day}  level ${lv0}->${rpg.noctis.level}  banked ${Math.round(bank0)}->${Math.round(rpg.expBank.banked)}`);
out.push(`tomatoes ${tom0}->${rpg.inventory.count('lucian_tomato')}  buffs=${rpg.party.activeBuffs.map((b) => b.name).join(',') || 'none'}`);
out.push(`slept line: ${ix.dialogue._lines ? JSON.stringify(ix.dialogue._lines) : '-'}`);
if (ix.dialogue.active) ix.dialogue.end();
return out.join('\n');

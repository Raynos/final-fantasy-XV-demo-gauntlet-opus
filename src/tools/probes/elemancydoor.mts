/*
 * Can a player reach spell crafting from inside the game?
 *
 * `RpgSystem.craftSpell` was called from exactly one place in the whole
 * repository -- `src/tools/combatloop.mts` -- so `side_elemancy_lesson` passed
 * the quest audit (both `draw` and `craft` have notifiers) while being
 * uncompletable in play. This drives the whole loop with **real key events**:
 * walk to a deposit, press the draw key, open the pause menu, arrow down to
 * Elemancy, dial the flask, press Enter, and check a spell came out with casts
 * in it and a quick-cast slot to sit in.
 */
const g = window.GAME;
const out = [];
let fails = 0;
const ok = (c, m) => { out.push(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

const rpg = g.get('Rpg');
const menus = g.get('Menus');
const player = g.get('Player');
const terrain = g.get('Terrain');
const em = rpg.elemancy;

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const key = (code) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  step(2);
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  step(2);
};

g.input.pointerLocked = true;
g.get('Director').play();
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null);
step(20);

// -- 1. the screen exists and the pause menu offers it --------------------
ok(!!menus.screens.elemancy, 'the menu stack has an Elemancy screen');
menus.setScreen('main');
step(30);
const labels = [...menus.screens.main.node.querySelectorAll('.mrow .mr-t')]
  .map((n) => n.textContent).filter(Boolean);
ok(labels.some((t) => /elemancy/i.test(t)), `the pause menu lists it  (${labels.join(', ') || 'no rows read'})`);
menus.setScreen(null);
step(10);

// -- 2. draw energy the way a player does ---------------------------------
const E = await import('/game/rpg/Elemancy.ts');
const dep = E.DEPOSITS.find((d) => d.id === 'dep_hammerhead') || E.DEPOSITS[0];
const dx = dep.pos[0] + 3, dz = dep.pos[2];
for (let i = 0; i < 24; i++) {
  player.root.position.set(dx, terrain.heightAt(dx, dz), dz);
  player.velocity?.set(0, 0, 0);
  g.frame(1 / 60);
}
const before = em.totalEnergy;
for (let i = 0; i < 14; i++) {
  player.root.position.set(dx, terrain.heightAt(dx, dz), dz);
  key('KeyT');
}
ok(em.totalEnergy > before,
  `T at the ${dep.name} draws ${dep.element} (${before} -> ${em.totalEnergy} units)`);

// -- 3. open the screen and craft, all on real keys -----------------------
menus.setScreen('elemancy');
step(40);
ok(menus.name === 'elemancy', `the screen opens (menus.name=${menus.name})`);
const scr = menus.screens.elemancy;

// Dial the element that actually has energy in it.
const which = ['fire', 'ice', 'lightning'].findIndex((e) => em.energy[e] > 0);
ok(which >= 0, `energy is in the flask to spend  (${JSON.stringify(em.energy)})`);
for (let i = 0; i < which; i++) key('ArrowDown');
for (let i = 0; i < 6; i++) key('ArrowRight');
const dialled = scr.mix[['fire', 'ice', 'lightning'][which]];
ok(dialled > 0, `arrow keys dial the flask to ${dialled} units`);

// A crafting screen is judged by eye as much as by assertion; `probe.mts
// --shot` writes this frame when a path is given and is a no-op otherwise.
// The boot hint card ("Where you are") draws in its own layer *above* the
// menus by design, so it sits over the flask in a capture taken this early.
// Real play has fifteen seconds of walking before anyone opens a menu.
document.getElementById('hints')?.remove();
await window.__shot?.('flask');

const spellsBefore = em.spells.length;
const energyBefore = em.totalEnergy;
key('Enter');
step(20);
ok(em.spells.length === spellsBefore + 1,
  `Enter crafts a spell (${spellsBefore} -> ${em.spells.length})`);
const spell = em.spells[em.spells.length - 1];
if (spell) {
  ok(spell.casts > 0, `it has ${spell.casts} casts in it and is called "${spell.name}"`);
  ok(em.equipped.includes(spell.uid), `and it went straight into a quick-cast slot (${em.equipped.indexOf(spell.uid)})`);
}
ok(em.totalEnergy < energyBefore, `crafting spent real energy (${energyBefore} -> ${em.totalEnergy})`);
await window.__shot?.('crafted');

// -- 4. the quest log heard about it --------------------------------------
const q = rpg.quests;
const lesson = q.quests?.side_elemancy_lesson || null;
out.push(`  quest side_elemancy_lesson: ${lesson ? JSON.stringify(lesson.objectives?.map?.((o) => `${o.id}:${o.done}`)) : 'not started'}`);

menus.setScreen(null);
step(10);
out.push('');
out.push(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
return out.join('\n');

/* Can the main story get from chapter 1 to the end of chapter 5? */
const g = window.GAME;
const out = [];
const rpg = g.get('Rpg');
const story = g.get('Story');
const dir = g.get('Director');
const player = g.get('Player');
const terr = g.get('Terrain');
const enemies = g.get('Enemies');
const menus = g.get('Menus');
const party = g.get('Party');
const Q = await import('/game/rpg/Quests.ts');
const C = await import('/game/story/Chapters.ts');
const S = await import('/game/encounters/SpawnTables.ts');

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const tap = (code, frames = 3) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  step(frames);
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  step(2);
};
const goTo = (x, z) => {
  const y = terr.heightAt(x, z);
  player.root.position.set(x, y, z);
  g.camera.position.set(x, y + 3, z + 6);
  g.camera.lookAt(x, y + 1.2, z);
  party.snap?.();
  step(4);
  player.root.position.set(x, y, z);
  step(6);
};
const q = (id) => {
  const v = rpg.quests.view(id);
  return v ? `${v.status} [${v.objectives.map((o) => `${o.progress}/${o.count}${o.done ? '*' : ''}`).join(' ')}]` : '?';
};

g.input.pointerLocked = true;
// The story only starts from the title screen, so a probe that goes straight
// to `Director.play()` leaves `story.chapter` null and `_advanceChapterLine`
// with nothing to advance. Resume the way "Continue" does.
story._resume();
dir.play();
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null); step(20);
g.get('HUD').setMenuOpen(false); step(4);

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; out.push(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  ${extra}` : ''}`); };

out.push('the main line, as the chapter table declares it:');
for (const ch of C.CHAPTERS) out.push(`  ch${ch.n} ${ch.name.padEnd(18)} ${ch.quests.join(', ')}`);
out.push('');
out.push('boot state:');
for (const ch of C.CHAPTERS) for (const id of ch.quests) out.push(`  ${id.padEnd(22)} ${q(id)}`);
out.push('');

/** finish one quest by satisfying its objectives through the real notify path */
const drive = (id) => {
  const def = rpg.quests.def(id);
  const st = rpg.quests.state(id);
  for (let i = 0; i < def.objectives.length; i++) {
    if (st.objectives[i].done) continue;
    const o = def.objectives[i];
    if (o.type === 'reach') {
      const wp = o.waypoint;
      goTo(wp[0], wp[2]);
      rpg.quests.notify('reach', { target: o.target });
    } else if (o.type === 'talk') {
      rpg.quests.notify('talk', { target: o.target });
    } else if (o.type === 'fetch') {
      // DELETED 2026-08-30, and deliberately not replaced. This arm used to
      // hand the quest the very item it was asking for -- `rpg.inventory.add(
      // o.target, ...)` -- which is how `main_ch3_openworld`'s fetch of
      // `sword_wise` passed this probe for months while the game granted that
      // item from nowhere and chapters 4-5 were unreachable in a real playthrough.
      // A `fetch` on the MAIN line has to be satisfiable by the world, so if one
      // appears again it must fail loudly here rather than self-grant.
      check(`${id}/${o.id} fetch is grantable by the world`, false,
        `nothing in the probe grants '${o.target}'; the main line must not fetch what no shop, chest, drop or forage yields`);
    } else if (o.type === 'buy') {
      // The real shop path: the wallet is the mid-game seed's, the stock is
      // Takka's, and `Inventory.buy` is what raises the notify.
      const want = o.target === 'weapon' ? 'iron_sword' : o.target;
      const res = rpg.inventory.buy(want, 1);
      check(`${id}/${o.id} can buy ${want}`, !!res.ok, res.ok ? '' : `buy failed: ${res.reason}`);
    } else if (o.type === 'kill') {
      // through the real kill path, not `forceObjective`
      for (let k = 0; k < o.count; k++) {
        const set = def.setPiece ? S.SET_PIECES[def.setPiece] : null;
        rpg.enemyKilled({ id: set ? set.boss : o.target, level: 20, expClass: 'normal', drops: [] }, {});
      }
    } else if (o.type === 'rest') {
      rpg.quests.notify('rest', { target: 'any' });
    } else if (o.type === 'photo') {
      rpg.quests.notify('photo', { target: o.target });
    } else if (o.type === 'quest') {
      // Drive the sub-quest through the SAME real paths rather than calling
      // `complete()` on it -- `main_ch1_pauper` now depends on `hunt_sabertusks`,
      // which is seeded accepted-and-incomplete, so its kills are the act.
      const other = rpg.quests.states[o.target];
      if (other && other.status !== 'complete') {
        if (other.status !== 'active') rpg.quests.accept(o.target);
        if (rpg.quests.status(o.target) === 'active') drive(o.target);
        check(`${id}/${o.id} sub-quest ${o.target} completes`, rpg.quests.status(o.target) === 'complete', q(o.target));
      }
      rpg.quests.settle(id);
    } else if (o.type === 'draw' || o.type === 'craft') {
      rpg.quests.notify(o.type, { target: o.target });
    }
    step(2);
  }
};

out.push('walking the main line, satisfying each objective through the real notify path:');
for (const ch of C.CHAPTERS) {
  for (const id of ch.quests) {
    if (rpg.quests.status(id) === 'complete') continue;
    if (rpg.quests.status(id) === 'available') rpg.quests.accept(id);
    if (rpg.quests.status(id) !== 'active') {
      check(`${id} can be started`, false, `status ${rpg.quests.status(id)}`);
      continue;
    }
    drive(id);
    step(90);                       // let the chapter queue fire
    check(`${id} completes`, rpg.quests.status(id) === 'complete', q(id));
  }
  step(420);   // the chapter card holds for 4.6 s before the next one opens
  out.push(`  -- chapter ${ch.n} done; story is on chapter ${story.chapterN} --`);
}
check('every main quest completes', C.CHAPTERS.every((c) => c.quests.every((id) => rpg.quests.status(id) === 'complete')));
check('the story reaches the last chapter', story.chapterN >= C.CHAPTERS[C.CHAPTERS.length - 1].n,
  `story is on chapter ${story.chapterN}`);

out.push('');
out.push('final state:');
for (const ch of C.CHAPTERS) for (const id of ch.quests) out.push(`  ${id.padEnd(22)} ${q(id)}`);
out.push(`  story chapter ${story.chapterN}, rpg.chapter ${rpg.chapter}`);

out.push('');
out.push(`${fails} failures`);
return out.join('\n');

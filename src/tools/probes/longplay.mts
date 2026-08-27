// One continuous session: can a person play this for half an hour?
//
// Phase 4's definition of done opens with "a person can play for 30 minutes
// without hitting a dead end or a stub", and notes that **no document in this
// repo records anyone playing this game for thirty minutes** — every judgement
// made here is on a still frame or a scripted probe.
//
// A probe cannot say whether half an hour is *worth* playing. It can say
// whether half an hour is *possible*: whether every verb the game offers still
// answers after twenty minutes of real frames on one page, whether the quest
// chain advances, whether the world keeps producing things to do, and whether
// anything stalls, errors or silently refuses. That is the dead-end half of
// the box, and it is the half nothing here has ever checked.
//
// Deliberately ONE page and ONE continuous run. `integration.mts` checks the
// same verbs in isolation; the failures this is looking for are the ones that
// only appear after state has accumulated — a quest that cannot advance
// because an earlier step consumed something, a prompt that stops appearing,
// a director that wedges in `combat` and never comes back.
//
// Run: node src/tools/probe.mts src/tools/probes/longplay.mts --dirty
const g = window.GAME;
const out = [];
const fails = [];
const rpg = g.get('Rpg');
const enc = g.get('EncounterDirector') || g.get('Encounters');
const combat = g.get('Combat');
const player = g.get('Player');
const enemies = g.get('Enemies');
const inp = g.input;
const rig = g.get('CameraRig');
const ix = g.get('Interaction');
const props = g.get('Props');

g.applyShot('hud_field');
g.get('Director')?.play?.();
rig?.clearShot?.();
g.resetClock();

/** Minutes of game time this session represents, at 60 Hz. */
const MINUTES = Number(window.__PLAY_MINUTES || 20);
const step = (n) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const ok = (name, cond, detail) => {
  out.push(`  ${cond ? 'ok  ' : 'FAIL'}  ${name.padEnd(38)} ${detail || ''}`);
  if (!cond) fails.push(name);
  return cond;
};

// Page errors are the loudest kind of dead end and nothing else here watches
// for them across a long run.
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message || e)));
const events = {};
for (const ev of ['encounter:start', 'encounter:victory', 'encounter:kill', 'forage:taken',
  'quest:advance', 'quest:complete', 'rpg:levelup']) {
  window.addEventListener(ev, () => { events[ev] = (events[ev] || 0) + 1; });
}

const t0 = { exp: rpg ? rpg.noctis.exp ?? 0 : 0, gil: rpg ? rpg.inventory.gil : 0 };
const questsAtStart = rpg ? rpg.quests.active().length : 0;

/* ------------------------------------------------------------------ walk */
// Sprint a long, turning route so streaming, encounters and foraging all get
// exercised the way a session exercises them, rather than in a straight line.
out.push(`--- ${MINUTES} minutes of continuous play ---`);
const FRAMES = MINUTES * 60 * 60;
let travelled = 0, forages = 0, fightsSeen = 0, promptsSeen = 0;
let inCombatFrames = 0, maxCombatRun = 0, combatRun = 0;
const last = player.position.clone();
const seenPrompts = new Set();
let yaw = 0.7;
for (let f = 0; f < FRAMES; f++) {
  // A slow continuous turn, so the route is a wide arc rather than a line and
  // the camera keeps meeting new country.
  if (f % 900 === 0) { yaw += 0.9; if (rig) { rig.yaw = yaw; rig.yawTarget = yaw; } }
  inp.keys.clear();
  inp.keys.add('KeyW');
  if ((f % 1800) < 1200) inp.keys.add('ShiftLeft');
  g.frame(1 / 60);

  travelled += Math.hypot(player.position.x - last.x, player.position.z - last.z);
  last.copy(player.position);

  const cur = ix && ix.current;
  if (cur) { promptsSeen++; seenPrompts.add(cur.verb + ' ' + (cur.label || '')); }
  // Take anything within reach: this is what a player does, and it is the only
  // way the forage layer's `taken` set ever gets exercised at scale.
  if (cur && cur.id === 'forage') { cur.handler(g, cur); forages++; }

  const fighting = enc && enc.state === 'combat';
  if (fighting) { inCombatFrames++; combatRun++; maxCombatRun = Math.max(maxCombatRun, combatRun); } else combatRun = 0;

  // Fight what attacks: an unfought pack leashes and the session never learns
  // whether combat resolves.
  if (fighting && f % 12 === 0) {
    const live = enemies.list.filter((e) => !e.dead && e.inCombat);
    if (live.length) {
      combat._applyDamage(live[0], player.position, { motion: 18, poise: 120 });
      if (live[0].dead) fightsSeen++;
    }
  }
  // Never let the party actually die — a game-over restarts the session and
  // this probe is about continuity, not about the death screen (`combatloop`
  // covers that).
  if (f % 300 === 0 && rpg && rpg.noctis.hp < rpg.noctis.maxHp * 0.4) {
    rpg.noctis.hp = rpg.noctis.maxHp;
  }
}
inp.keys.clear();
step(30);

out.push('');
out.push('--- what happened ---');
out.push(`  travelled ${(travelled / 1000).toFixed(2)} km`);
out.push(`  encounters started ${events['encounter:start'] || 0}, `
  + `victories ${events['encounter:victory'] || 0}, kills ${events['encounter:kill'] || 0}`);
out.push(`  forage taken ${forages}, distinct prompts ${seenPrompts.size}`);
out.push(`  in combat ${((inCombatFrames / FRAMES) * 100).toFixed(1)}% of frames, `
  + `longest unbroken fight ${(maxCombatRun / 60).toFixed(0)} s`);
out.push(`  prompts met: ${[...seenPrompts].slice(0, 10).join(' | ') || 'NONE'}`);

/* ------------------------------------------------- the dead-end checks */
out.push('');
out.push('--- is anything wedged? ---');
ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' / '));
ok('the world kept producing fights', (events['encounter:start'] || 0) >= 3,
  `${events['encounter:start'] || 0} encounters in ${MINUTES} min`);
ok('fights end', enc.state === 'field', `director state "${enc.state}"`);
ok('no fight ran away with the session', maxCombatRun < 60 * 240,
  `longest ${(maxCombatRun / 60).toFixed(0)} s`);
ok('the world kept producing things to pick up', forages >= 3, `${forages} taken`);
ok('rewards accumulated', rpg && ((rpg.noctis.exp ?? 0) > t0.exp || rpg.inventory.gil !== t0.gil),
  `exp +${rpg ? (rpg.noctis.exp ?? 0) - t0.exp : 0}, gil ${rpg ? rpg.inventory.gil - t0.gil : 0}`);
ok('the player is still on the ground', Math.abs(player.position.y) < 4000
  && isFinite(player.position.x), `${player.position.x.toFixed(0)},${player.position.z.toFixed(0)}`);
ok('the party is still with him', (() => {
  const party = g.get('Party');
  if (!party) return false;
  return party.members.every((m) => m.root.position.distanceTo(player.position) < 140);
})(), (() => {
  const party = g.get('Party');
  return party ? party.members.map((m) => m.root.position.distanceTo(player.position).toFixed(0) + 'm').join(' ') : '-';
})());
ok('the quest log still has work in it', rpg && rpg.quests.active().length > 0,
  `${rpg ? rpg.quests.active().length : 0} active (started with ${questsAtStart})`);
ok('menus still open', (() => {
  const menus = g.get('Menus');
  if (!menus) return false;
  try { menus.setScreen('inventory'); step(6); const on = !!menus.screen; menus.setScreen(null); step(4); return on; }
  catch (e) { return false; }
})());
ok('the map still opens', (() => {
  const menus = g.get('Menus');
  try { menus.setScreen('map'); step(6); const on = !!menus.screen; menus.setScreen(null); step(4); return on; }
  catch (e) { return false; }
})());
ok('camping still works', (() => {
  if (!rpg) return false;
  const r = rpg.camp({ force: true });
  return !!(r && r.ok !== false);
})());
ok('the shop still sells', (() => {
  if (!rpg) return false;
  const r = rpg.inventory.buy('potion', 1);
  return !!(r && r.ok !== false);
})());

out.push('');
out.push(fails.length
  ? `*** ${fails.length} DEAD END(S): ${fails.join(', ')} ***`
  : `PASS — ${MINUTES} minutes of continuous play, nothing wedged.`);
return out.join('\n');

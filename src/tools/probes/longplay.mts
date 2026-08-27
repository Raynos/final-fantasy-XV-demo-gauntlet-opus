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
// TWO HARNESS HAZARDS BOUND HOW LONG THIS CAN RUN. Neither is the game, and
// both look exactly like a crash from in here:
//
//  - **`perf.mts` / `gameplay.mts` will kill this run.** `withExclusive` posts
//    `/exclusive`, and the daemon answers it with `pool.closeAll()` — which
//    closes every browser context, *including the one this probe holds a lease
//    on*. `takeExclusive` drains `busyWorkers`, and a lease is not a worker
//    job, so it is not waited for. Measured: a 4-minute run against `HEAD` died
//    at 93 s with `page.evaluate: Target page, context or browser has been
//    closed` the moment a co-agent's `perf` run took the quiet lane. Check
//    `daemon.mts --health` for `"exclusive"` before starting a long one.
//  - **The lease TTL is 15 minutes.** `routeLease` defaults `ttlMs = 15 * 60_000`
//    and `harness.lease()` never overrides it, so at 15 minutes of WALL clock
//    the daemon closes the page out from under whatever is running. That is a
//    ceiling on wall time, not on game time — hence the per-minute heartbeat
//    and the rate line below, which say how much wall clock a game minute
//    costs on this machine.
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

/**
 * Minutes of game time this session represents, at 60 Hz.
 *
 * **30, because 30 is the box.** Phase 4's definition of done says "a person
 * can play for 30 minutes"; a probe that defaults to 4 answers a question
 * nobody asked. It defaulted to 4 only while long runs could not survive vite
 * HMR navigating the page (`server.hmr = false` fixed that), and there is no
 * reason left to ask a shorter question by default.
 */
const MINUTES = Number(window.__PLAY_MINUTES || 30);
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

// EXP is BANKED until you rest — `rpg.noctis.exp` is the applied figure and
// reading it reports +0 off a session that earned hundreds. Same trap as
// `loopclose.mts`.
const t0 = { exp: rpg ? rpg.expBank.banked : 0, gil: rpg ? rpg.inventory.gil : 0 };
// `QuestLog.byStatus('active')` — there is no `active()`.
const activeQuests = () => (rpg ? rpg.quests.byStatus('active').length : 0);
const questsAtStart = activeQuests();

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
const heap = [];
// Wall clock, not game clock. A run that dies is the normal failure here, and
// without a heartbeat all it leaves is a Playwright error with no idea whether
// it got two minutes in or twenty-eight. `probe.mts` pipes page console
// straight to stdout, so each of these lands live.
const wall0 = performance.now();
const wallMin = () => (performance.now() - wall0) / 60000;
const forage = props && props.foraging;
let detours = 0, minSpot = Infinity, chasing = false, forageOffered = 0;
for (let f = 0; f < FRAMES; f++) {
  // A slow continuous turn, so the route is a wide arc rather than a line and
  // the camera keeps meeting new country.
  if (f % 900 === 0 && !chasing) { yaw += 0.9; if (rig) { rig.yaw = yaw; rig.yawTarget = yaw; } }
  // **Walk toward the glint.** A player who sees a forage spot at forty metres
  // goes and gets it; a probe on a fixed arc passes within 3.2 m of one about
  // never, and the first run of this reported "0 taken" over 1.46 km against a
  // layer that was working perfectly. Measuring a straight line and calling it
  // a session is the mistake.
  if (forage && f % 10 === 0) {
    const s0 = forage.live[0];
    chasing = false;
    if (s0) {
      const d = Math.hypot(s0.x - player.position.x, s0.z - player.position.z);
      minSpot = Math.min(minSpot, d);
      if (d < 140 && rig) {
        chasing = true;
        // **Negated.** `CameraRig.yaw` is the orbit angle of the camera
        // AROUND the player, so the direction the player walks under W is
        // `-(sin yaw, cos yaw)`, not `+`. Measured: `rig.yaw = 0` walks to
        // -Z. Getting this backwards made the probe sprint directly away
        // from every glint for four minutes and report the forage layer
        // broken — the closest a spot ever got was 65.7 m, which was simply
        // where it started.
        rig.yawTarget = Math.atan2(-(s0.x - player.position.x), -(s0.z - player.position.z));
        rig.yaw = rig.yawTarget;
        yaw = rig.yaw;
        detours++;
      }
    }
  }
  if (f % 3600 === 0) {
    if (performance.memory) heap.push(Math.round(performance.memory.usedJSHeapSize / 1e6));
    if (f) console.log(`[longplay] game minute ${f / 3600}/${MINUTES} — `
      + `${wallMin().toFixed(1)} min wall, ${(travelled / 1000).toFixed(2)} km, `
      + `${events['encounter:start'] || 0} encounters, ${forages} forage`);
  }
  inp.keys.clear();
  inp.keys.add('KeyW');
  if ((f % 1800) < 1200) inp.keys.add('ShiftLeft');
  g.frame(1 / 60);

  travelled += Math.hypot(player.position.x - last.x, player.position.z - last.z);
  last.copy(player.position);

  const cur = ix && ix.current;
  if (cur) { promptsSeen++; seenPrompts.add(cur.verb + ' ' + (cur.label || '')); }
  if (cur && cur.id === 'forage') forageOffered++;
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
const wallMinutes = wallMin();
out.push(`  ${MINUTES} game minutes cost ${wallMinutes.toFixed(1)} min of wall clock `
  + `(${(FRAMES / (wallMinutes * 60)).toFixed(0)} sim frames/s, `
  + `${(wallMinutes / MINUTES).toFixed(2)} wall min per game min)`);
out.push(`  travelled ${(travelled / 1000).toFixed(2)} km`);
out.push(`  encounters started ${events['encounter:start'] || 0}, `
  + `victories ${events['encounter:victory'] || 0}, kills ${events['encounter:kill'] || 0}`);
out.push(`  forage taken ${forages} (${detours} detours toward a glint), distinct prompts ${seenPrompts.size}`);
out.push(`  JS heap per minute, MB: ${heap.join(' ')}`);
out.push(`  closest a forage spot ever got: ${minSpot === Infinity ? '-' : minSpot.toFixed(1) + ' m'}; `
  + `prompt offered on ${forageOffered} frames`);
out.push(`  in combat ${((inCombatFrames / FRAMES) * 100).toFixed(1)}% of frames, `
  + `longest unbroken fight ${(maxCombatRun / 60).toFixed(0)} s`);
out.push(`  prompts met: ${[...seenPrompts].slice(0, 10).join(' | ') || 'NONE'}`);

/* ------------------------------------------------- the dead-end checks */
out.push('');
out.push('--- is anything wedged? ---');
ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' / '));
// Rate, not count: a threshold of "3 encounters" passes a twenty-minute
// session that had one fight in the first minute and nothing after.
const fightsPerMin = (events['encounter:start'] || 0) / MINUTES;
ok('the world keeps producing fights', fightsPerMin >= 0.35,
  `${(events['encounter:start'] || 0)} in ${MINUTES} min = ${fightsPerMin.toFixed(2)}/min`);
ok('fights end', enc.state === 'field', `director state "${enc.state}"`);
ok('no fight ran away with the session', maxCombatRun < 60 * 240,
  `longest ${(maxCombatRun / 60).toFixed(0)} s`);
ok('the world keeps producing things to pick up', forages / MINUTES >= 0.4,
  `${forages} taken = ${(forages / MINUTES).toFixed(2)}/min`);
ok('rewards accumulated', rpg && (rpg.expBank.banked > t0.exp || rpg.inventory.gil !== t0.gil),
  `exp banked +${rpg ? rpg.expBank.banked - t0.exp : 0}, gil ${rpg ? rpg.inventory.gil - t0.gil : 0}`);
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
ok('the quest log still has work in it', activeQuests() > 0,
  `${activeQuests()} active (started with ${questsAtStart})`);
ok('menus still open', (() => {
  const menus = g.get('Menus');
  if (!menus) return false;
  try { menus.setScreen('inventory'); step(6); const on = menus.name === 'inventory'; menus.setScreen(null); step(4); return on; }
  catch (e) { return false; }
})());
ok('the map still opens', (() => {
  const menus = g.get('Menus');
  try { menus.setScreen('map'); step(6); const on = menus.name === 'map'; menus.setScreen(null); step(4); return on; }
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

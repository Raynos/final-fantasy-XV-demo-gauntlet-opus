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
// **THERE IS NO `--night` FLAG, AND THE CLOCK DOES NOT RUN.** Both halves of
// that cost this gate its meaning once already, so they are written down here
// rather than left to be rediscovered:
//
//  - `probe.mts` parses `--shot`, `--ttl`, `--turbo`, `--set` and `--cpu` and
//    forwards NOTHING else to the page. A run invoked as `longplay --night`
//    drops `--night` on the floor without a word and reports a confident
//    `PASS -- 30 minutes of continuous play` about a session at NOON. The knob
//    is `--set __PLAY_NIGHT=1`, which is the idiom every other knob here uses.
//  - Nothing advances the clock during a session. `Sky.hours` only ever moves
//    inside `Sky.setTimeOfDay`, `DayCycle.syncFromSky` is true and `driveSky`
//    is false, so `rpg.day` mirrors the sky and the sky sits where the last
//    `applyShot` put it. Thirty game minutes is thirty minutes of ONE hour.
//
// So the summary below always names the hour and the `nightDepth` it played
// at. A gate that cannot say what it tested is how a green run about the wrong
// half of the day went unnoticed for hours.
//
// Run:  node src/tools/probe.mts src/tools/probes/longplay.mts --dirty
//       node src/tools/probe.mts src/tools/probes/longplay.mts --dirty \
//         --set __PLAY_NIGHT=1 --turbo 10 --ttl 40
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
const reg = g.get('Regalia');

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

/* ------------------------------------------------------------- nightfall */
/**
 * **The night on the road.** `--set __PLAY_NIGHT=1`, or `=23.2` for an hour.
 *
 * `RegaliaSystem._nightRoadDanger` rolls the daemon roamers onto the road ahead
 * of a driving player, and it is gated four ways: `nightDanger() > 0.5`,
 * `isDriving`, `body.speed >= 8`, and no capture in progress. A walking session
 * at noon satisfies none of them, so the default longplay -- every longplay
 * that has ever run -- cannot reach a single line of that function. Night mode
 * fixes both halves: it pins the clock past 21:30 and it puts Noctis in the car
 * for most of the session.
 *
 * `nightScaling` makes `depth = (hour - 19) / 5` after 19:00, so the feature's
 * 0.5 floor is hour 21.5 and the default 23.2 sits at 0.84 -- deep enough that
 * `ronin_duel` (a 0.6 floor of its own) is in the pool too.
 */
const NIGHT_ARG = window.__PLAY_NIGHT;
const NIGHT = NIGHT_ARG != null && NIGHT_ARG !== 0 && NIGHT_ARG !== ''
  && NIGHT_ARG !== '0' && NIGHT_ARG !== 'false';
const HOUR = NIGHT ? (Number(NIGHT_ARG) > 1.5 ? Number(NIGHT_ARG) : 23.2) : null;
const sky = g.get('Sky');
if (NIGHT && sky && sky.setTimeOfDay) sky.setTimeOfDay(HOUR);
// One frame so `DayCycle.update` pulls `rpg.day.hour` onto the sky's hour --
// it follows the sky by delta and is otherwise still at whatever the shot left.
// Guarded, because `TIMINGS.md` records this probe's day run as identical to
// the metre across viewports and builds, and two frames before the loop would
// quietly move that baseline.
if (NIGHT) step(2);
const day = rpg ? rpg.day : null;
const depthNow = () => (reg ? reg.nightDanger() : (day ? day.nightDepth : 0));
const clockNow = () => (day ? day.clockString : (sky ? sky.hours.toFixed(2) : '??'));

// What `_nightRoadDanger` did, counted from outside it. The instrument is two
// instance-level wrappers -- no file this lane does not own is touched, and
// nothing here changes what the game decides, only what we can see it decide.
let nightCalls = 0, nightRolls = 0, nightSpawns = 0, nightWarns = 0, nightBanter = 0;
let inNight = false, frameNo = 0;
const rollLog = [];
const nightIds = {};
const NIGHT_DRIVE = NIGHT && !!reg && !!enc;
if (NIGHT_DRIVE && typeof reg._nightRoadDanger === 'function') {
  const nrd = reg._nightRoadDanger.bind(reg);
  reg._nightRoadDanger = function (dt2, gm) {
    nightCalls++;
    const armed = reg._nightRoll;
    // The gate conditions have to be sampled BEFORE the call: `countNear` is
    // read before the spawn and would come back non-zero afterwards precisely
    // when the roll landed. Only sampled on the frame the timer actually
    // expires, because `countNear` on all 1800 frames of a game minute is not
    // free.
    const willRoll = armed <= dt2 && !gm.currentShot && reg.isDriving && reg.body.speed >= 8;
    const pre = willRoll ? {
      depth: reg.nightDanger(), kmh: reg.body.kmh,
      suppress: !!enc.suppressRoamers, boss: !!enc.boss,
      near: enc.enemies ? enc.enemies.countNear(reg.body.pos, 90) : -1,
    } : null;
    const before = nightSpawns;
    inNight = true;
    let r;
    try { r = nrd(dt2, gm); } finally { inNight = false; }
    // `_nightRoll` counts down while the gate is open and is re-armed to
    // 55..110 the instant it fires, so an INCREASE is exactly "it rolled".
    if (reg._nightRoll > armed && pre) {
      nightRolls++;
      rollLog.push({ ...pre, min: frameNo / 3600, spawned: nightSpawns > before });
    }
    return r;
  };
  // `EncounterDirector.spawnRoamer` is shared with the director's own roamer
  // roll, so attribution is by `inNight` rather than by counting spawns.
  const spawn0 = enc.spawnRoamer.bind(enc);
  enc.spawnRoamer = (def) => {
    if (inNight) {
      nightSpawns++;
      const id = (def && def.id) || '?';
      nightIds[id] = (nightIds[id] || 0) + 1;
    }
    return spawn0(def);
  };
  // `_warn` dispatches synchronously, so the listener still sees `inNight`.
  window.addEventListener('encounter:warn', () => { if (inNight) nightWarns++; });
  const story = g.get('Story');
  if (story && story.talk && story.talk.react) {
    const react0 = story.talk.react.bind(story.talk);
    story.talk.react = (k) => { if (inNight) nightBanter++; return react0(k); };
  }
}

/**
 * Legs: DRIVE_MIN game-minutes with Ignis at the wheel, FOOT_MIN on foot.
 *
 * `_nightRoadDanger` decrements its timer only on frames where the gate is
 * already open, so driving time is the only currency it spends. Three minutes
 * in the car against two on foot spends about 18 of 30 minutes above 8 m/s,
 * which is a dozen rolls at its 55..110 s re-arm -- enough that "it never
 * fired" is a finding rather than a sample size.
 */
const DRIVE_MIN = Number(window.__PLAY_DRIVE_LEG || 3);
const FOOT_MIN = Number(window.__PLAY_FOOT_LEG || 2);
let mode = 'foot';
let legEndF = NIGHT_DRIVE ? 0 : Infinity;
let driveM = 0, driveFrames = 0, footFrames = 0;
let refuels = 0, roadWraps = 0, pulledOver = 0, seenNightSpawns = 0;
const roadPt = { x: 0, y: 0, z: 0, tx: 0, tz: 1 };
const retarget = () => {
  const L = reg.path ? reg.path.length : 0;
  if (!L) return;
  // The highway is a line and `RoadPath.at` clamps at both ends, so a leg
  // longer than the road would simply stop the car. Eighteen game minutes at
  // Ignis' 24 m/s cruise is 25 km and there is not that much road, so at the
  // far end the car is put back on the near end facing up-road -- the same
  // `body.reset` the shot staging uses.
  if (L - reg.body.roadS < 500) {
    reg.path.at(80, roadPt);
    reg.body.reset(roadPt.x, roadPt.z, Math.atan2(roadPt.tx, roadPt.tz));
    roadWraps++;
  }
  reg.autoDrive.setTargetS(L - 80, 'the far end of the highway');
};
const startDrive = (f) => {
  mode = 'drive';
  legEndF = f + DRIVE_MIN * 3600;
  // `enter()` has no distance check -- it seats the party wherever the car is,
  // so this teleports Noctis back to the Regalia rather than making him walk
  // several kilometres to it. That is the one staging convenience in here;
  // everything after it is the car actually being driven down the road.
  if (!reg.isDriving) reg.enter(true); else reg.setAutoDrive(true);
  retarget();
};
/** @returns true while the session is on foot (the day session's behaviour). */
const nightLeg = (f) => {
  if (f >= legEndF) {
    if (mode === 'drive') { if (reg.isDriving) reg.exit(); mode = 'foot'; legEndF = f + FOOT_MIN * 3600; }
    else startDrive(f);
  }
  if (mode === 'drive') {
    // A full tank is 14 km of `RANGE` and a night leg is longer than that; a
    // player stops at a pump, and this is that stop, elided.
    if (reg.fuel < 0.2) { reg.refuel(); refuels++; }
    if (reg.autoDrive.arrived || reg.autoDrive.remaining(reg.body.roadS) < 150) retarget();
  }
  return mode === 'foot';
};

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
out.push(`--- ${MINUTES} minutes of continuous play, clock pinned at ${clockNow()} `
  + `(nightDepth ${(day ? day.nightDepth : 0).toFixed(2)}, nightDanger() ${depthNow().toFixed(2)})`
  + `${NIGHT ? ' — NIGHT MODE, on the road' : ''} ---`);
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
// **A player who cannot reach the berry gives up and walks somewhere else.**
// Without this the probe does not measure a session at all. Measured, before
// it existed: at game minute 2.8 the route reached (-405, 53, -254), a slope
// too steep to climb, and the probe held W into it for the remaining 27
// minutes — `grounded` true, position pinned to the metre, the nearest
// un-taken spot frozen 52.9 m away and never approached again. It reported
// 3.38 km travelled against 478 m of net displacement, because grinding
// against a hill accumulates distance, and it reported "the world stops
// producing things to pick up" about a world that was producing 23 live spots
// the whole time. Twenty-seven of the thirty minutes were the character
// standing still, so every other check was reading an idle page.
const abandoned = new Set();
let targetKey = null, targetBestD = Infinity, targetSinceF = 0;
let givenUp = 0, unstuckTurns = 0;
const wasAt = player.position.clone();
for (let f = 0; f < FRAMES; f++) {
  frameNo = f;
  // On a night run the session alternates between the car and Noctis' own two
  // feet; everything below that steers, chases a glint or notices being stuck
  // is on-foot behaviour and would be nonsense at 86 km/h.
  const onFoot = NIGHT_DRIVE ? nightLeg(f) : true;
  // A slow continuous turn, so the route is a wide arc rather than a line and
  // the camera keeps meeting new country.
  if (onFoot && f % 900 === 0 && !chasing) { yaw += 0.9; if (rig) { rig.yaw = yaw; rig.yawTarget = yaw; } }
  // The general case of the same thing: walked into something and stopped.
  // Combat is excluded because standing still while fighting is correct.
  if (onFoot && f % 600 === 0 && f) {
    const moved = Math.hypot(player.position.x - wasAt.x, player.position.z - wasAt.z);
    if (moved < 8 && !(enc && enc.state === 'combat')) {
      if (targetKey != null) { abandoned.add(targetKey); givenUp++; targetKey = null; }
      yaw += 2.2; unstuckTurns++;
      if (rig) { rig.yaw = yaw; rig.yawTarget = yaw; }
      chasing = false;
    }
    wasAt.copy(player.position);
  }
  // **Walk toward the glint.** A player who sees a forage spot at forty metres
  // goes and gets it; a probe on a fixed arc passes within 3.2 m of one about
  // never, and the first run of this reported "0 taken" over 1.46 km against a
  // layer that was working perfectly. Measuring a straight line and calling it
  // a session is the mistake.
  if (onFoot && forage && f % 10 === 0) {
    // `live` is rebuilt every frame, sorted nearest-first and already excludes
    // `taken` — so the only reason to skip an entry is that this session has
    // tried and failed to walk to it.
    const s0 = forage.live.find((s) => !abandoned.has(s.key));
    chasing = false;
    if (s0) {
      const d = Math.hypot(s0.x - player.position.x, s0.z - player.position.z);
      minSpot = Math.min(minSpot, d);
      // Give up on a spot that is not getting closer. 900 frames is 15 s of
      // walking at it, which is generous for a 140 m leash at ~7 m/s.
      if (s0.key !== targetKey) { targetKey = s0.key; targetBestD = d; targetSinceF = f; }
      else if (d < targetBestD - 1) { targetBestD = d; targetSinceF = f; }
      else if (f - targetSinceF > 900) {
        abandoned.add(s0.key); givenUp++; targetKey = null;
        yaw += 2.2; if (rig) { rig.yaw = yaw; rig.yawTarget = yaw; }
      }
      if (d < 140 && rig && s0.key === targetKey) {
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
      + `${events['encounter:start'] || 0} encounters, ${forages} forage`
      + (NIGHT ? ` — ${clockNow()} ${mode}, night rolls ${nightRolls}, spawns ${nightSpawns}` : ''));
  }
  inp.keys.clear();
  if (onFoot) {
    inp.keys.add('KeyW');
    if ((f % 1800) < 1200) inp.keys.add('ShiftLeft');
  }
  g.frame(1 / 60);

  const stepM = Math.hypot(player.position.x - last.x, player.position.z - last.z);
  travelled += stepM;
  if (mode === 'drive') { driveM += stepM; driveFrames++; } else if (mode === 'foot') footFrames++;
  last.copy(player.position);

  // **Pull over for the ambush.** The car is doing 24 m/s and `spawnRoamer`
  // puts the pack 30-42 m out with a 90 m leash, so a session that keeps its
  // foot down drives straight out of every encounter this feature creates and
  // learns nothing about whether they are fights. A player stops.
  if (NIGHT_DRIVE && mode === 'drive' && nightSpawns > seenNightSpawns) {
    seenNightSpawns = nightSpawns;
    if (reg.isDriving) reg.exit();
    mode = 'fight';
    legEndF = f + 45 * 60;
    pulledOver++;
  }

  const cur = ix && ix.current;
  if (cur) { promptsSeen++; seenPrompts.add(cur.verb + ' ' + (cur.label || '')); }
  if (cur && cur.id === 'forage') forageOffered++;
  // Take anything within reach: this is what a player does, and it is the only
  // way the forage layer's `taken` set ever gets exercised at scale.
  if (onFoot && cur && cur.id === 'forage') { cur.handler(g, cur); forages++; }

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
out.push(`  gave up on ${givenUp} unreachable spot(s), turned away from being stuck ${unstuckTurns} time(s)`);
out.push(`  JS heap per minute, MB: ${heap.join(' ')}`);
out.push(`  closest a forage spot ever got: ${minSpot === Infinity ? '-' : minSpot.toFixed(1) + ' m'}; `
  + `prompt offered on ${forageOffered} frames`);
out.push(`  in combat ${((inCombatFrames / FRAMES) * 100).toFixed(1)}% of frames, `
  + `longest unbroken fight ${(maxCombatRun / 60).toFixed(0)} s`);
out.push(`  prompts met: ${[...seenPrompts].slice(0, 10).join(' | ') || 'NONE'}`);

/* ------------------------------------------ what the night actually did */
// Named in full even on a day run, because the whole reason this section
// exists is that a PASS which never mentions the time of day is a PASS about
// an unknown half of the game.
out.push('');
out.push(`--- time of day: ${clockNow()}, nightDepth ${(day ? day.nightDepth : 0).toFixed(2)}, `
  + `nightDanger() ${depthNow().toFixed(2)} ---`);
if (!NIGHT) {
  out.push('  day session: RegaliaSystem._nightRoadDanger cannot fire below 0.5 depth '
    + 'and was not exercised. Re-run with --set __PLAY_NIGHT=1.');
} else {
  out.push(`  drove ${(driveM / 1000).toFixed(2)} km over ${(driveFrames / 3600).toFixed(1)} game min `
    + `in the car, ${(footFrames / 3600).toFixed(1)} min on foot, `
    + `${refuels} refuel(s), ${roadWraps} road wrap(s)`);
  out.push(`  _nightRoadDanger: reached on ${nightCalls} frames, rolled ${nightRolls}x, `
    + `spawned ${nightSpawns}, HUD warned ${nightWarns}x, banter fired ${nightBanter}x, `
    + `pulled over for ${pulledOver}`);
  out.push(`  what it put on the road: `
    + `${Object.keys(nightIds).map((k) => `${k} x${nightIds[k]}`).join(', ') || 'nothing'}`);
  for (const r of rollLog.slice(0, 16)) {
    out.push(`    roll @ ${r.min.toFixed(1)} min: depth ${r.depth.toFixed(2)}, `
      + `${r.kmh.toFixed(0)} km/h, suppressRoamers=${r.suppress}, boss=${r.boss}, `
      + `enemiesWithin90m=${r.near} -> ${r.spawned ? 'SPAWNED' : 'no spawn'}`);
  }
  if (rollLog.length > 16) out.push(`    ... and ${rollLog.length - 16} more rolls`);
}

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
// Per minute ON FOOT, not per minute of session: nobody picks berries through
// the window of a car at 86 km/h, and a night run spends most of itself there.
// Dividing by the wrong denominator would fail this for a reason that is not a
// dead end, which is exactly the class of wrong answer this file exists to avoid.
const footMin = footFrames > 0 ? footFrames / 3600 : MINUTES;
ok('the world keeps producing things to pick up', forages / footMin >= 0.4,
  `${forages} taken = ${(forages / footMin).toFixed(2)}/min over ${footMin.toFixed(1)} min on foot`);
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

/* --------------------------------- did the night on the road happen? */
if (NIGHT) {
  out.push('');
  out.push('--- the night on the road (RegaliaSystem._nightRoadDanger) ---');
  ok('the clock is actually at night', (day ? day.nightDepth : 0) > 0.5,
    `${clockNow()}, depth ${(day ? day.nightDepth : 0).toFixed(2)}`);
  ok('nightDanger() clears the 0.5 floor', depthNow() > 0.5, `${depthNow().toFixed(2)}`);
  ok('the car was actually driven', driveM > 2000,
    `${(driveM / 1000).toFixed(2)} km over ${(driveFrames / 3600).toFixed(1)} game min`);
  ok('the danger roll was reached at all', nightCalls > 0, `${nightCalls} frames`);
  ok('the roll fired', nightRolls > 0, `${nightRolls} rolls`);
  ok('something came out of the dark', nightSpawns > 0,
    `${nightSpawns} spawns from ${nightRolls} rolls`);
  ok('the HUD warned about it', nightSpawns > 0 && nightWarns >= nightSpawns,
    `${nightWarns} warnings for ${nightSpawns} spawns`);
  ok('somebody said something about it', nightBanter > 0, `${nightBanter} banter lines`);
}

out.push('');
out.push(fails.length
  ? `*** ${fails.length} DEAD END(S) in ${MINUTES} min at ${clockNow()}`
    + `${NIGHT ? ' (night, on the road)' : ' (day, on foot)'}: ${fails.join(', ')} ***`
  : `PASS — ${MINUTES} minutes of continuous play at ${clockNow()}`
    + `${NIGHT ? `, ${(driveM / 1000).toFixed(1)} km of it driving after dark, `
      + `${nightSpawns} roadside ambush(es)` : ' (DAY, on foot — the night was not tested)'}`
    + `, nothing wedged.`);
return out.join('\n');

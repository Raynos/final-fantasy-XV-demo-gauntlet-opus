// Does a fight READ AND PLAY as a fight?
//
// `combatloop.mts` proves the mechanics are reachable: 31 verbs fire, the
// numbers are the numbers. That is a different question from the one phase 4's
// WS-2 asks — "encounters are currently a photo booth" — which is about
// *shape*: an approach, a threat you can read, a rhythm of pressure and
// opening, companions who do something legible, and an ending that lands.
//
// So this probe does not spawn a fixture and pin it. It walks the real player
// into real wild dens with real input, plays each fight with a policy a person
// would recognise (close, swing, dodge the telegraph, warp-strike the stagger,
// spend a tech bar), and reports a **beat sheet** per fight plus the four
// numbers that decide whether a fight has shape at all:
//
//   1. seconds between "the pack notices you" and "the fight starts" — the
//      approach beat. Zero means the world has no approach.
//   2. how long the fight lasts. FFXV's field encounters run 30-90 s.
//   3. how much of Noctis' HP it costs. A fight you cannot lose is a cutscene.
//   4. what the enemies spent the fight *doing* — chasing is not fighting.
//
// **Five fights per run, and the run ends in a median**, because one fight is
// an anecdote and three of them are three anecdotes. Wild dens are drawn from
// a weighted roster with a `count` range, so consecutive rounds legitimately
// differ by 3x on every number here — a single round can neither pass nor fail
// a duration target. The `AGGREGATE` block at the bottom is the lane's
// instrument: median duration, median HP paid, and a VERDICT against the two
// numbers phase 4 actually asks for (18-30 s, >=15% of Noctis' max HP).
//
// Only rounds that were a *fight* count toward the median: a round that found
// no den, or that ended with nothing dead, is listed and excluded. Reporting a
// median over rounds that never started is how an instrument flatters a build.
//
//   node src/tools/probe.mts src/tools/probes/fightshape.mts --dirty \
//        --set rounds=5 --shot tmp/shots/fight/f.jpg
//
// Two traps, both already paid for elsewhere and both fatal here:
//  - a posed page boots with the encounter loop OFF (`Director.setLive(false)`
//    under `?shoot`), so nothing ever spawns until `Director.play()`;
//  - `CameraRig.yaw` is the camera's ORBIT angle around the player, so the
//    direction W walks is `-(sin yaw, cos yaw)`. Getting that backwards walks
//    away from every den in the world and reports an empty map.
const g = window.GAME;
const dt = 1 / 60;
const inp = g.input;
const player = g.get('Player');
const rig = g.get('CameraRig');
const enemies = g.get('Enemies');
const enc = g.get('Encounters');
const combat = g.get('Combat');
const party = g.get('Party');
const hud = g.get('HUD');

/* ---- live world, no title card ------------------------------------- */
g.applyShot('hud_field');
g.get('Director')?.play?.();
rig?.clearShot?.();
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus')?.setScreen?.(null);
hud?.setVisible?.(true);
hud?.setMenuOpen?.(false);
g.resetClock();
inp.pointerLocked = true;

const log = [];
const events = [];
/** Event payloads carry live `Enemy`/`Character` graphs; JSON cannot hold them. */
const brief = (d) => {
  if (d == null || typeof d !== 'object') return String(d);
  const bits = [];
  for (const [k, v] of Object.entries(d)) {
    if (v == null) continue;
    if (typeof v === 'object') { if (v.name) bits.push(`${k}=${v.name}`); continue; }
    bits.push(`${k}=${typeof v === 'number' ? Math.round(v * 100) / 100 : v}`);
  }
  return bits.join(' ');
};
for (const name of ['encounter:spotted', 'encounter:start', 'encounter:kill', 'encounter:victory', 'encounter:end']) {
  window.addEventListener(name, (ev) => events.push({ t: g.time.now, name, detail: ev.detail }));
}
for (const name of ['stagger', 'parry', 'link', 'playerHit', 'warp']) {
  combat.on(name, (d) => events.push({ t: g.time.now, name, detail: d }));
}
/** Where the enemies' HP actually went — the number, and what it hit. */
const hits = [];
combat.on('damage', (d) => hits.push({
  t: g.time.now, dmg: d.damage, killed: !!d.killed,
  max: d.enemy ? d.enemy.maxHp : 0, st: d.enemy ? d.enemy.state : '?',
  stag: d.enemy ? !!d.enemy.staggered : false,
  // `PartyAI.strike` mirrors onto the same event with a `source` of the
  // companion's key; Noctis' own blows carry none.
  by: d.source || (combat.state === 'warp' ? 'warp' : 'noctis'),
}));

const keyDown = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
const keyUp = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
const step = (n) => { for (let i = 0; i < n; i++) g.frame(dt); };
/**
 * Give the page's event loop a turn. A probe that drives tens of thousands of
 * frames inside one `page.evaluate` never yields, and Chromium eventually
 * tears the execution context down under it — which surfaces as
 * "Execution context was destroyed", not as anything about the game.
 */
const breathe = () => new Promise((r) => setTimeout(r, 0));
const tap = (code) => { keyDown(code); step(2); keyUp(code); step(1); };
const mouse = (down, button = 0) => window.dispatchEvent(new MouseEvent(down ? 'mousedown' : 'mouseup', { button, bubbles: true }));

const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** How far the drawn weapon reaches from the player, metres. */
const WEAPON_REACH = combat.weapon?.def?.reach ?? 2.0;
/** Every live thing that will actually fight us. */
const hostiles = () => (enemies.list || []).filter((e) => !e.dead && !e.passive);
const nearest = () => {
  let best = null, bd = 1e9;
  for (const e of hostiles()) { const d = d2(e.position, player.position); if (d < bd) { bd = d; best = e; } }
  return best ? { e: best, d: bd } : null;
};
/** Shortest-arc difference between two angles, radians. */
const angDiff = (a, b) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
/**
 * Signed angle between where the camera looks and `p`, radians.
 *
 * Measured from the **lens**, which is what the name always claimed and what
 * "is it on screen" actually means. It used to be measured from the player,
 * and with the lens five metres behind him an enemy two metres in front can
 * be 0.85 rad off the *player's* bearing while sitting a quarter of that off
 * screen centre — so the re-aim below fired constantly at things that were
 * already in frame. Same correction the rig's own framing block needed.
 */
const bearingOff = (p) => {
  const c = rig.cam.position;
  return angDiff(Math.atan2(-(p.x - c.x), -(p.z - c.z)), rig.yaw);
};
/**
 * Point the camera so that W walks at `p`. `yaw` is the ORBIT angle.
 *
 * `snap` writes `yaw` as well, which is a *cut* — fine for setting up a leg,
 * wrong during a fight. Writing only `yawTarget` is what a mouse does, and it
 * lets `CameraRig`'s own damping and combat framing show in the frames instead
 * of being overwritten every step. Without this every mid-fight capture came
 * back as a smear.
 */
/** A brisk but human flick, radians per second. */
const PLAYER_SLEW = 5.0;
const faceToward = (p, snap = false) => {
  const yaw = Math.atan2(-(p.x - player.position.x), -(p.z - player.position.z));
  if (snap) { rig.yawTarget = yaw; rig.yaw = yaw; return; }
  // Rate-limited, because writing `yawTarget` outright is NOT "what a mouse
  // does": no hand and no stick moves an aim 67 degrees in one 16 ms frame,
  // and the rig then burns that error down at `rotDamp` as a 900 deg/s lens
  // sweep the game never asked for. `probes/armwhip.mts` measured it, and it
  // is why every `stagger` and `kill` frame this probe took came back as a
  // full-frame smear even after the rig's own whip was fixed.
  rig.yawTarget += Math.max(-PLAYER_SLEW * dt, Math.min(PLAYER_SLEW * dt, angDiff(yaw, rig.yawTarget)));
};

/** Sprint on the given heading until something hostile is inside 100 m. */
const findDen = async (headings, secs) => {
  for (const yaw of headings) {
    rig.yaw = yaw; rig.yawTarget = yaw;
    inp.keys.clear(); inp.keys.add('KeyW'); inp.keys.add('ShiftLeft');
    for (let f = 0; f < 60 * secs; f++) {
      g.frame(dt);
      if (f % 300 === 0) await breathe();
      if (f % 15) continue;
      const n = nearest();
      if (n && n.d < 100) { inp.keys.clear(); return n; }
    }
  }
  inp.keys.clear();
  return null;
};

// Print each round as it finishes rather than only at the end. A run this long
// can lose its page (Chromium tears the context down under a multi-minute
// evaluate), and a report that only exists in the return value dies with it.
const rounds = [];
const emit = (s) => { rounds.push(s); console.log(s); };
const HEADINGS = [
  [0.9, 2.4, 4.1], [5.4, 3.2], [1.7, 0.3], [4.7, 2.0],
  [2.9, 5.9], [0.4, 3.7], [4.4, 1.2], [3.9, 6.0],
];
/** Rounds to play. Five is the floor for a median worth quoting. */
const ROUNDS = Math.max(1, Math.min(HEADINGS.length, Number(window.rounds) || 5));
/** One row per round, for the aggregate. */
const metrics = [];

for (let round = 0; round < ROUNDS; round++) {
  const shots = round === 0;
  const found = await findDen(HEADINGS[round] || [round], 28);
  if (!found) { emit(`round ${round + 1}: no den found`); metrics.push({ round: round + 1, found: false }); continue; }

  /* ---- the approach ------------------------------------------------- */
  // Walk, do not sprint: this is the beat where a player reads the pack and
  // decides. Sample what the enemies are doing on the way in.
  const approach = [];
  faceToward(found.e.position, true);
  inp.keys.add('KeyW');
  const shotAt = [70, 45, 28];
  let noticedAt = null, noticedDist = 0, spottedT = null;
  const tSee = g.time.now;
  for (let f = 0; f < 60 * 40; f++) {
    g.frame(dt);
    if (f % 300 === 0) await breathe();
    { const n0 = nearest(); if (n0) faceToward(n0.e.position); }
    if (f % 6) continue;
    const n = nearest();
    if (!n) break;
    const live = hostiles();
    const aware = live.filter((e) => e.awareness > 0.1).length;
    const fighting = live.filter((e) => e.fighting).length;
    if (noticedAt == null && aware > 0) { noticedAt = g.time.now; noticedDist = n.d; }
    if (spottedT == null && fighting > 0) spottedT = g.time.now;
    if (f % 30 === 0 || aware > 0) {
      approach.push(`  ${(f / 60).toFixed(1)}s d=${n.d.toFixed(0)}m  ${n.e.state} aware=${n.e.awareness.toFixed(2)}  awake=${aware}/${live.length} fighting=${fighting}  ${enc.state}`);
    }
    if (shots && shotAt.length && n.d < shotAt[0]) { await window.__shot(`approach-${shotAt[0]}m`); shotAt.shift(); }
    if (enc.state === 'combat') break;
  }
  inp.keys.clear();
  step(6);
  if (shots) await window.__shot('engage');

  /* ---- the fight ---------------------------------------------------- */
  const beats = [];
  const seen = {};
  const prevState = new Map();
  let staggerShot = false, killShot = false, midShot = false, attacking = false, reaiming = false;
  let playerHpMin = player.stats.hp, dodges = 0, warps = 0, techs = 0;
  let enemyAttacks = 0, enemyTelegraphs = 0, framesInMelee = 0, distSum = 0, distN = 0, frames = 0;
  const startNow = g.time.now;
  const startKills = enc.stats.kills;
  const startHits = hits.length;
  const startHostiles = hostiles().length;
  const startHp = player.stats.hp;
  // Task 36 wants a CAST count, and `warps` below counts *key taps* — the
  // policy taps Q on a stagger whether or not the warp is affordable or the
  // state machine accepts it. `combat`'s own `warp` event is the cast.
  const startEvents = events.length;
  const startMp = combat.mp;

  // The fight is the enemies *in this fight*, not every hostile in the world.
  // Scoping it to whatever is within 45 m is what stops the loop marching off
  // after the next den and reporting a two-minute "fight" that was a walk.
  const inFight = () => hostiles().filter((e) => d2(e.position, player.position) < 45);
  let overFor = 0;
  for (let f = 0; f < 60 * 120; f++) {
    const live = inFight();
    if (!live.length) break;
    if (enc.state !== 'combat') { overFor += dt; if (overFor > 2) break; } else overFor = 0;
    const n = nearest();
    // Re-aim only when the target has drifted well off screen, and then turn
    // until it is back near centre — hysteresis, the way a player does it. A
    // player does not hold the stick on the enemy every frame, and slamming
    // the yaw every frame hides whatever the game's own framing is doing.
    if (n) {
      const off = Math.abs(bearingOff(n.e.position));
      if (off > 0.55) reaiming = true; else if (off < 0.20) reaiming = false;
      if (reaiming) faceToward(n.e.position);
    }

    // The policy a person plays: stay on the target, swing, get out of the way
    // of a telegraph, punish a stagger with a warp-strike, spend a tech bar.
    const t = n && n.e;
    // **Where the blade actually lands**, not where the animal's navel is.
    // This was `t.radius + 3.4`, which for a sabertusk is 4.4 m — and the
    // Engine Blade is 2.05 m long, so the policy walked to a metre and a half
    // outside its own reach and then swung at air for the whole fight. That
    // is the entire "Noctis does 14% of the damage in his own fight": in the
    // run before this line changed his melee share was **0%** in one round
    // and 7-10% in the others, while the retinue — which closes properly —
    // did all of it. See `probes/dpsshare.mts` for what the formula says the
    // share should be at full uptime: 64% to Noctis.
    const bite = t ? (t.radius || 0.8) * (t.scale || 1) + WEAPON_REACH : 2;
    const inDanger = live.some((e) => e.state === 'telegraph' && d2(e.position, player.position) < (e.reach || 4) + 2.5);
    if (t && n.d > bite * 0.72) inp.keys.add('KeyW'); else inp.keys.delete('KeyW');

    if (inDanger && f % 30 === 0) { tap('Space'); dodges++; if (attacking) { mouse(false); attacking = false; } }
    else if (t && t.staggered && f % 45 === 0) { tap('KeyQ'); warps++; }
    else if (f % 300 === 120) { tap('KeyG'); techs++; }
    else if (f % 300 === 240) { tap('KeyJ'); techs++; }
    else if (!attacking && n && n.d < bite + 1.2) { mouse(true); attacking = true; }
    else if (attacking && n && n.d > bite + 3.0) { mouse(false); attacking = false; }

    g.frame(dt);
    frames++;
    playerHpMin = Math.min(playerHpMin, player.stats.hp);
    for (const e of live) {
      if (prevState.get(e) === e.state) continue;
      if (e.state === 'telegraph') enemyTelegraphs++;
      if (e.state === 'attack') enemyAttacks++;
      prevState.set(e, e.state);
    }
    if (n) { distSum += n.d; distN++; if (n.d < 4.5) framesInMelee++; }
    if (f % 300 === 0) await breathe();

    if (f % 6 === 0) {
      for (const e of live) seen[e.state] = (seen[e.state] || 0) + 1;
      if (f % 120 === 0) {
        const names = live.slice(0, 4).map((e) => `${(e.name || '?').slice(0, 9)}:${e.state}${e.staggered ? '!' : ''}(${Math.round(100 * e.hp / e.maxHp)}%)`);
        beats.push(`  ${(g.time.now - startNow).toFixed(0).padStart(3)}s noct=${Math.round(100 * player.stats.hp / player.stats.maxHp)}% mp=${Math.round(combat.mp)}  ${names.join(' ')}`);
      }
    }
    if (shots) {
      if (!staggerShot && live.some((e) => e.staggered)) { staggerShot = true; await window.__shot('stagger'); }
      if (!killShot && enc.stats.kills > startKills) { killShot = true; await window.__shot('kill'); }
      if (!midShot && f === 60 * 10) { midShot = true; await window.__shot('midfight'); }
    }
  }
  if (attacking) mouse(false);
  inp.keys.clear();
  const fightSecs = g.time.now - startNow;

  /* ---- the ending --------------------------------------------------- */
  for (let f = 0; f < 60 * 8; f++) {
    g.frame(dt);
    if (f % 300 === 0) await breathe();
    if (shots && f === 40) await window.__shot('victory');
  }
  if (shots) await window.__shot('after');

  /* ---- the round's report ------------------------------------------- */
  const total = Object.values(seen).reduce((a, b) => a + b, 0) || 1;
  const occ = Object.entries(seen).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${(100 * v / total).toFixed(0)}%`).join('  ');
  const bySrc = new Map();
  const nBySrc = new Map();
  for (const h of hits.slice(startHits)) {
    bySrc.set(h.by, (bySrc.get(h.by) || 0) + h.dmg);
    nBySrc.set(h.by, (nBySrc.get(h.by) || 0) + 1);
  }
  const dmgTotal = [...bySrc.values()].reduce((a, b) => a + b, 0) || 1;
  const dmgLine = [...bySrc].sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${(100 * v / dmgTotal).toFixed(0)}%`).join('  ');
  // Share alone cannot tell "swings and misses" from "hits for very little".
  // Blows landed per second can, and is what named the standoff bug above.
  const hitLine = [...nBySrc].sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v} (${(v / Math.max(0.1, fightSecs)).toFixed(2)}/s)`).join('  ');

  // What the fight actually cost and what actually fired, for the aggregate.
  const hpPaid = 100 * (startHp - playerHpMin) / player.stats.maxHp;
  const kills = enc.stats.kills - startKills;
  const roundEvents = events.slice(startEvents);
  const warpCasts = roundEvents.filter((e) => e.name === 'warp').length;
  const denHp = hits.slice(startHits).reduce((a, h) => a + h.dmg, 0);
  const noctisShare = 100 * (bySrc.get('noctis') || 0) / dmgTotal;
  metrics.push({
    round: round + 1, found: true, name: found.e.name, n: startHostiles,
    level: found.e.level, hpEach: found.e.maxHp,
    secs: fightSecs, hpPaid, kills, warpCasts, warpTaps: warps,
    mpSpent: startMp - combat.mp, dodges, techs, denHp, noctisShare,
    enemyAtkRate: enemyAttacks / Math.max(1, fightSecs),
  });

  emit([
    `=== round ${round + 1}: ${found.e.name} x${startHostiles} (lv ${found.e.level}, ${found.e.maxHp} hp each), player (${player.position.x | 0}, ${player.position.z | 0})`,
    'APPROACH', ...approach.slice(-12),
    `  noticed at ${noticedDist.toFixed(0)} m; notice -> engaged = ${spottedT != null && noticedAt != null ? (spottedT - noticedAt).toFixed(2) + ' s' : 'never'}`,
    'FIGHT', ...beats,
    `  duration ${fightSecs.toFixed(1)}s   kills ${enc.stats.kills - startKills}/${startHostiles}`,
    `  noctis paid ${hpPaid.toFixed(1)}% of max HP   dodges ${dodges} techs ${techs}`,
    `  warp: ${warpCasts} casts from ${warps} Q taps (${(warpCasts / Math.max(0.1, fightSecs)).toFixed(2)} casts/s), mp ${(startMp - combat.mp).toFixed(0)} spent`,
    `  enemy attacks opened ${enemyAttacks} (telegraphs ${enemyTelegraphs}) = ${(enemyAttacks / Math.max(1, fightSecs)).toFixed(2)}/s over ${startHostiles} of them`,
    `  mean range ${(distSum / Math.max(1, distN)).toFixed(1)} m, inside melee ${(100 * framesInMelee / Math.max(1, frames)).toFixed(0)}% of it`,
    `  enemy time: ${occ}`,
    `  damage by: ${dmgLine}`,
    `  blows landed: ${hitLine}`,
    ...hits.slice(startHits).filter((h) => h.killed || h.dmg > 400).map((h) =>
      `    ${(h.t - startNow).toFixed(1)}s ${String(h.by).padEnd(9)} ${String(Math.round(h.dmg)).padStart(6)} of ${h.max}hp  ${h.st}${h.stag ? ' STAGGERED' : ''}${h.killed ? '  KILL' : ''}`),
  ].join('\n'));
}

/* ---- the aggregate: what the run as a whole says -------------------- */
// One fight is an anecdote and its spread is 3x, so every claim this lane
// makes is a median over the fights that actually happened.
const median = (xs) => {
  if (!xs.length) return NaN;
  const a = [...xs].sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const fights = metrics.filter((m) => m.found && m.kills > 0);
const one = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '--');
const agg = [];
agg.push('', `=== AGGREGATE over ${fights.length} fights (${metrics.length} rounds played, ${metrics.filter((m) => !m.found).length} found no den, ${metrics.filter((m) => m.found && !m.kills).length} killed nothing)`);
if (!fights.length) {
  agg.push('  no fight completed -- nothing to aggregate');
} else {
  const col = (k, d = 1) => fights.map((m) => one(m[k], d)).join(' ');
  const medSecs = median(fights.map((m) => m.secs));
  const medHp = median(fights.map((m) => m.hpPaid));
  agg.push(`  duration      ${col('secs')}  ->  MEDIAN ${one(medSecs)} s        [target 18-30]`);
  agg.push(`  hp paid %     ${col('hpPaid')}  ->  MEDIAN ${one(medHp)} %        [target >=15]`);
  agg.push(`  pack size     ${fights.map((m) => m.n).join(' ')}  ->  median ${one(median(fights.map((m) => m.n)), 0)}`);
  agg.push(`  den hp dealt  ${fights.map((m) => Math.round(m.denHp)).join(' ')}  ->  median ${one(median(fights.map((m) => m.denHp)), 0)}`);
  agg.push(`  party dps     ${fights.map((m) => one(m.denHp / Math.max(0.1, m.secs), 0)).join(' ')}  ->  median ${one(median(fights.map((m) => m.denHp / Math.max(0.1, m.secs))), 0)} hp/s`);
  agg.push(`  noctis dmg %  ${col('noctisShare', 0)}  ->  median ${one(median(fights.map((m) => m.noctisShare)), 0)} %`);
  agg.push(`  warp casts    ${fights.map((m) => m.warpCasts).join(' ')}  (Q taps ${fights.map((m) => m.warpTaps).join(' ')})  ->  median ${one(median(fights.map((m) => m.warpCasts)), 0)} casts`);
  agg.push(`  enemy atk/s   ${col('enemyAtkRate', 2)}  ->  median ${one(median(fights.map((m) => m.enemyAtkRate)), 2)}`);
  const okSecs = medSecs >= 18 && medSecs <= 30;
  const okHp = medHp >= 15;
  agg.push(`  VERDICT: duration ${okSecs ? 'PASS' : `FAIL (${one(medSecs)} s, want 18-30)`}; danger ${okHp ? 'PASS' : `FAIL (${one(medHp)}%, want >=15%)`}`);
}
for (const line of agg) console.log(line);

log.push(...rounds);
log.push(...agg);
log.push('', 'EVENTS');
for (const e of events) {
  log.push(`  ${e.t.toFixed(1).padStart(7)}s ${e.name.padEnd(19)} ${brief(e.detail).slice(0, 120)}`);
}
return log.join('\n');

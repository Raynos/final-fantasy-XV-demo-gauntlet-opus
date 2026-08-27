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
// Three fights per run, because one fight is an anecdote.
//
//   node src/tools/probe.mts src/tools/probes/fightshape.mts --dirty \
//        --shot tmp/shots/fight/f.jpg
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
/** Every live thing that will actually fight us. */
const hostiles = () => (enemies.list || []).filter((e) => !e.dead && !e.passive);
const nearest = () => {
  let best = null, bd = 1e9;
  for (const e of hostiles()) { const d = d2(e.position, player.position); if (d < bd) { bd = d; best = e; } }
  return best ? { e: best, d: bd } : null;
};
/** Signed angle between where the camera looks and `p`, radians. */
const bearingOff = (p) => {
  const want = Math.atan2(-(p.x - player.position.x), -(p.z - player.position.z));
  let d = want - rig.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
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
const faceToward = (p, snap = false) => {
  const yaw = Math.atan2(-(p.x - player.position.x), -(p.z - player.position.z));
  rig.yawTarget = yaw;
  if (snap) rig.yaw = yaw;
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
const HEADINGS = [[0.9, 2.4, 4.1], [5.4, 3.2], [1.7, 0.3], [4.7, 2.0]];

for (let round = 0; round < 3; round++) {
  const shots = round === 0;
  const found = await findDen(HEADINGS[round] || [round], 28);
  if (!found) { emit(`round ${round + 1}: no den found`); continue; }

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
    if (f % 6) continue;
    const n = nearest();
    if (!n) break;
    faceToward(n.e.position);
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
  let staggerShot = false, killShot = false, midShot = false, attacking = false;
  let playerHpMin = player.stats.hp, dodges = 0, warps = 0, techs = 0;
  let enemyAttacks = 0, enemyTelegraphs = 0, framesInMelee = 0, distSum = 0, distN = 0, frames = 0;
  const startNow = g.time.now;
  const startKills = enc.stats.kills;
  const startHits = hits.length;
  const startHostiles = hostiles().length;
  const startHp = player.stats.hp;

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
    // Re-aim only when the target has drifted well off screen. A player does
    // not hold the stick on the enemy every frame, and slamming the yaw every
    // frame hides whatever the game's own combat framing is doing.
    if (n && Math.abs(bearingOff(n.e.position)) > 0.85) faceToward(n.e.position);

    // The policy a person plays: stay on the target, swing, get out of the way
    // of a telegraph, punish a stagger with a warp-strike, spend a tech bar.
    const t = n && n.e;
    const reach = t ? (t.radius || 1) : 1;
    const inDanger = live.some((e) => e.state === 'telegraph' && d2(e.position, player.position) < (e.reach || 4) + 2.5);
    if (t && n.d > reach + 3.4) inp.keys.add('KeyW'); else inp.keys.delete('KeyW');

    if (inDanger && f % 30 === 0) { tap('Space'); dodges++; if (attacking) { mouse(false); attacking = false; } }
    else if (t && t.staggered && f % 45 === 0) { tap('KeyQ'); warps++; }
    else if (f % 300 === 120) { tap('KeyG'); techs++; }
    else if (f % 300 === 240) { tap('KeyJ'); techs++; }
    else if (!attacking && n && n.d < reach + 3.6) { mouse(true); attacking = true; }
    else if (attacking && n && n.d > reach + 5.5) { mouse(false); attacking = false; }

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
  for (const h of hits.slice(startHits)) bySrc.set(h.by, (bySrc.get(h.by) || 0) + h.dmg);
  const dmgTotal = [...bySrc.values()].reduce((a, b) => a + b, 0) || 1;
  const dmgLine = [...bySrc].sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${(100 * v / dmgTotal).toFixed(0)}%`).join('  ');

  emit([
    `=== round ${round + 1}: ${found.e.name} x${startHostiles} (lv ${found.e.level}, ${found.e.maxHp} hp each), player (${player.position.x | 0}, ${player.position.z | 0})`,
    'APPROACH', ...approach.slice(-12),
    `  noticed at ${noticedDist.toFixed(0)} m; notice -> engaged = ${spottedT != null && noticedAt != null ? (spottedT - noticedAt).toFixed(2) + ' s' : 'never'}`,
    'FIGHT', ...beats,
    `  duration ${fightSecs.toFixed(1)}s   kills ${enc.stats.kills - startKills}/${startHostiles}`,
    `  noctis paid ${(100 * (startHp - playerHpMin) / player.stats.maxHp).toFixed(1)}% of max HP   dodges ${dodges} warps ${warps} techs ${techs}`,
    `  enemy attacks opened ${enemyAttacks} (telegraphs ${enemyTelegraphs}) = ${(enemyAttacks / Math.max(1, fightSecs)).toFixed(2)}/s over ${startHostiles} of them`,
    `  mean range ${(distSum / Math.max(1, distN)).toFixed(1)} m, inside melee ${(100 * framesInMelee / Math.max(1, frames)).toFixed(0)}% of it`,
    `  enemy time: ${occ}`,
    `  damage by: ${dmgLine}`,
    ...hits.slice(startHits).filter((h) => h.killed || h.dmg > 400).map((h) =>
      `    ${(h.t - startNow).toFixed(1)}s ${String(h.by).padEnd(9)} ${String(Math.round(h.dmg)).padStart(6)} of ${h.max}hp  ${h.st}${h.stag ? ' STAGGERED' : ''}${h.killed ? '  KILL' : ''}`),
  ].join('\n'));
}

log.push(...rounds);
log.push('', 'EVENTS');
for (const e of events) {
  log.push(`  ${e.t.toFixed(1).padStart(7)}s ${e.name.padEnd(19)} ${brief(e.detail).slice(0, 120)}`);
}
return log.join('\n');

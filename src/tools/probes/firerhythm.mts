/*
 * Does the ranged fire model have gaps a player can play against?
 *
 * Sibling-ports Wave 4, cover + fire rhythm. Asked as three separate questions,
 * because "existence is not integration" is this repo's most expensive lesson
 * and a fire model is exactly the kind of thing that can be fully written and
 * never reached:
 *
 *  1. WIRED — do shooters actually run out of magazine and go head down?
 *  2. CHANGES AN ANSWER — does the hit chance move with what the player is
 *     doing, or is it the flat coin flip it replaced?
 *  3. VISIBLE — do misses land somewhere the player can see, rather than
 *     silently not happening?
 *
 * The one it exists to catch is (2). A ladder whose terms all cancel is a
 * 28% miss with more arithmetic in front of it.
 */
const g = window.GAME;
const out = [];
const enc = g.get('Encounters');
const enemies = g.get('Enemies');
const player = g.get('Player');
const terr = g.get('Terrain');
const party = g.get('Party');
if (!enc || !enemies || !player) return 'need Encounters, Enemies and Player';

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) fails++;
  out.push(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `   ${extra}` : ''}`);
};

// The encounter director publishes `enemies.threats` from its own territory
// loop, and a hand-spawned squad is not in a territory -- so without this the
// shooters have nothing to perceive, go idle within a second, and the probe
// measures a fire model that was never asked to fire. That is the failure this
// probe is for, arriving one level up from where it was expected.
// `EncounterDirector._refreshThreats()` fills the array that `enemies.threats`
// ALIASES -- assigning a fresh array here instead breaks that aliasing, so the
// shooters perceive a player the director's `resolveStrike` then cannot find,
// and every shot resolves against an empty threat list. Silently: no tracer, no
// damage, no error. Refresh the shared array, never replace it.
enc._refreshThreats();

// Put the player somewhere flat and drop a squad of MTs at rifle range.
const px = player.root.position.x, pz = player.root.position.z;
const shooters = [];
for (let i = 0; i < 3; i++) {
  const a = (i / 3) * Math.PI * 2;
  const x = px + Math.sin(a) * 13, z = pz + Math.cos(a) * 13;
  const e = enemies.spawn('mt', { at: [x, terr ? terr.heightAt(x, z) : 0, z], level: 12 });
  if (e) { e.target = player; e.awareness = 1; e.setState('chase'); shooters.push(e); }
}
if (!shooters.length) return 'could not spawn mt';

// ---- 1. wired: magazines empty and reloads happen -------------------------
// Count what is actually swung, by attack. This is the line that found the
// real defect: before `fightRange` learned about guns, a 15 s fight was 18
// bayonets to 2 volleys -- the MTs walked to their bayonet's 2.6 m and the
// rifle was decoration, so the entire fire model was running on a tenth of the
// attacks. Every check below can pass on a model nobody uses; this cannot.
let spends = 0, dries = 0; const byAttack = {};
for (const e of shooters) {
  const orig = e._spendRound.bind(e);
  e._spendRound = (a) => {
    spends++;
    const k = `${a && a.id}${a && a.ranged ? ' (ranged)' : ''}`;
    byAttack[k] = (byAttack[k] || 0) + 1;
    const r = orig(a); if (r) dries++; return r;
  };
}
let reloadFrames = 0, sawReload = false, longest = 0, run = 0;
// 30 s, not 15: with magazine 4 and a ~3.4 s shot cycle the FIRST reload lands
// around 14 s, so a 15 s window can miss it and report a working model as dead.
for (let f = 0; f < 1800; f++) {
  step(1);
  if ((f % 30) === 0) enc._refreshThreats();
  // Not named `any`: `anycheck.mts` matches the word, and a zero-ceiling gate
  // is right to flag it rather than try to tell an identifier from a type.
  const headDown = shooters.some((e) => e.reloading);
  if (headDown) { reloadFrames++; sawReload = true; run++; longest = Math.max(longest, run); }
  else run = 0;
}
out.push(`  ${spends} attack(s) swung, ${dries} emptied a magazine: ${JSON.stringify(byAttack)}`);
check('shooters run dry and go head down', sawReload,
  `${reloadFrames} reloading-frames in 1800, longest run ${(longest / 60).toFixed(2)} s`);
// A reload the same length as a burst rest is not a gap. the mt volley cooldown
// is 1.6 s, so anything at or under that means the magazine never emptied and
// what was measured was an ordinary cooldown wearing the flag.
check('the reload is longer than a burst rest', longest / 60 > 1.7,
  `longest ${(longest / 60).toFixed(2)} s vs cooldown 1.60 s`);

// ---- 2. changes an answer: the hit chance is a ladder ---------------------
// Ask the director directly, holding everything constant but one term.
const e0 = shooters[0];
const atk = (e0.type.attacks || []).find((a) => a.ranged);
const dist = () => {
  const p = player.root.position, q = e0.root.position;
  return Math.hypot(p.x - q.x, p.z - q.z);
};
const probeAt = (speed, lateral, settled) => {
  const d = dist();
  const p = player.root.position, q = e0.root.position;
  const lx = (p.x - q.x) / d, lz = (p.z - q.z) / d;
  // lateral = across the line of fire; otherwise straight down it
  const vx = lateral ? -lz * speed : lx * speed;
  const vz = lateral ? lx * speed : lz * speed;
  const saved = player.velocity.clone();
  const savedSettle = e0._settled;
  player.velocity.set(vx, 0, vz);
  e0._settled = settled;
  const r = enc._hitChance(e0, atk, player, d);
  player.velocity.copy(saved);
  e0._settled = savedSettle;
  return r;
};

const still = probeAt(0, false, 2);
const closing = probeAt(5, false, 2);
const strafing = probeAt(5, true, 2);
const fresh = probeAt(0, false, 0);

out.push(`  hit chance   still ${still.toFixed(3)}   closing ${closing.toFixed(3)}`
  + `   strafing ${strafing.toFixed(3)}   just-acquired ${fresh.toFixed(3)}`);
check('moving beats standing', closing < still - 0.02,
  `${closing.toFixed(3)} vs ${still.toFixed(3)}`);
check('crossing the line beats closing down it', strafing < closing - 0.02,
  `${strafing.toFixed(3)} vs ${closing.toFixed(3)}`);
check('a shooter that just re-acquired is worse', fresh < still - 0.05,
  `${fresh.toFixed(3)} vs ${still.toFixed(3)}`);

// ---- 3. visible: a miss puts something in the world -----------------------
// `_missNear` is the only path that can draw a tracer ending anywhere but on a
// threat. Count what it emits rather than trusting that it was called.
const vfx = g.get('Vfx') || enc.vfx;
let beams = 0;
if (vfx && vfx.acquireBeam) {
  const orig = vfx.acquireBeam.bind(vfx);
  vfx.acquireBeam = (...a) => { beams++; return orig(...a); };
}
const before = player.stats ? player.stats.hp : 0;
for (let f = 0; f < 600; f++) { if ((f % 30) === 0) enc._refreshThreats(); step(1); }
const after = player.stats ? player.stats.hp : 0;
check('shots are drawn whether or not they land', beams > 0, `${beams} tracer(s) in 600 frames`);
out.push(`  player hp ${before} -> ${after} over 600 frames of incoming fire`);

for (const e of shooters) enemies.despawn(e);
if (party && party.snap) party.snap();

out.unshift(fails ? `FAIL — ${fails} check(s)` : 'PASS — the fire model is wired, graded and visible');
return out.join('\n');

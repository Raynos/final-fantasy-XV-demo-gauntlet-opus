/*
 * Play the fishing minigame, with real key events, from the prompt to the bag.
 *
 * Everything here goes through `window.dispatchEvent(KeyboardEvent)` and
 * `g.frame(1/60)`: no method on `Fishing` is called directly except `seed`, so
 * a pass means a player standing on that bank with a keyboard gets the same
 * result. What it proves, in order:
 *
 *   1. the "Fish" prompt is reachable by walking up to the bank
 *   2. E opens a cast and the power meter runs
 *   3. a bite arrives, and striking early costs you the wait
 *   4. a fish can be **landed** -- by playing it properly
 *   5. a fish can be **lost** -- by reeling straight through a run
 *   6. the catch is in the bag as a cookable ingredient
 *
 * 4 and 5 are the two that matter. A minigame that cannot be lost is a
 * cutscene with a progress bar, and one that cannot be won is a wall.
 */
const g = window.GAME;
const rpg = g.get('Rpg');
const ix = g.get('Interaction');
const player = g.get('Player');
const menus = g.get('Menus');
const dir = g.get('Director');
const out = [];
let fails = 0;
const ok = (c, m) => { out.push(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

const F = rpg.fishing;
F.install(g);

// -- get the world into normal play, then stand on the bank ---------------
g.input.pointerLocked = true;
dir.play();
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null);
g.get('HUD')?.setMenuOpen?.(false);

const spot = F.spots.get('alstor_dock') || [...F.spots.values()][0];
const hold = () => {
  if (F.busy) return;                       // once fishing, Fishing owns the pose
  player.root.position.copy(spot.stand);
  player.heading = Math.atan2(spot.out.x, spot.out.y);
  player.root.rotation.y = player.heading;
  player.velocity?.set(0, 0, 0);
};
const step = (n = 1) => { for (let i = 0; i < n; i++) { hold(); g.frame(1 / 60); } };
const down = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
const up = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
const tap = (code) => { down(code); step(1); up(code); step(1); };

hold(); step(20);

// -- 1. the prompt --------------------------------------------------------
ok(ix.current && ix.current.id === `fish_${spot.id}`,
  `standing on the bank at ${spot.name} offers "${ix.current ? `${ix.current.verb} / ${ix.current.label}` : 'nothing'}"`);

// -- 2. the cast ----------------------------------------------------------
down('KeyE');
step(4);
ok(F.busy && F.phase === 'cast', `E opens a cast (phase=${F.phase})`);
const p0 = F.power;
step(24);
ok(F.power > p0 + 0.15, `the power meter runs while E is held (${p0.toFixed(2)} -> ${F.power.toFixed(2)})`);
const castPower = F.power;
up('KeyE');
step(3);
ok(F.phase === 'flight' && F.line0 > 7,
  `release casts ${F.line0.toFixed(1)} m of line at ${(castPower * 100).toFixed(0)}% power (phase=${F.phase})`);
step(45);
ok(F.phase === 'wait', `the float settles and the wait starts (phase=${F.phase})`);

// -- 3. striking early ----------------------------------------------------
const before = F._biteAt;
tap('KeyE');
ok(F._biteAt > before && F.phase === 'wait',
  `striking at nothing pushes the bite back (${before.toFixed(1)} s -> ${F._biteAt.toFixed(1)} s)`);

// -- run to the bite ------------------------------------------------------
let guard = 0;
while (F.phase === 'wait' && guard++ < 1200) step(1);
ok(F.phase === 'bite', `a fish takes it after ${(F._biteAt).toFixed(1)} s (${F.fish ? F.fish.name : '-'})`);
const hooked = F.fish;

// -- 4. play it properly --------------------------------------------------
tap('KeyE');
ok(F.phase === 'fight', `E inside the window hooks it (phase=${F.phase})`);

const bagBefore = rpg.inventory.count(hooked.id);
let reeling = false, leaning = null;
const setReel = (want) => { if (want === reeling) return; reeling = want; (want ? down : up)('KeyE'); };
const setLean = (want) => {
  if (want === leaning) return;
  if (leaning) up(leaning);
  leaning = want;
  if (want) down(want);
};
const trace = [];
guard = 0;
let peakTension = 0, sawRun = false, sawRest = false;
while (F.phase === 'fight' && guard++ < 5400) {
  peakTension = Math.max(peakTension, F.tension);
  if (F.run !== 0) sawRun = true; else sawRest = true;
  // The strategy a player converges on: lean against the run, reel only when
  // the line has room, and let go the moment the gauge enters the snap band.
  setLean(F.run === 1 ? 'KeyA' : F.run === -1 ? 'KeyD' : null);
  setReel(F.tension < 0.66);
  if (guard % 60 === 0) {
    trace.push(`${(guard / 60).toFixed(0)}s line=${F.line.toFixed(1)} ten=${F.tension.toFixed(2)} stam=${F.stamina.toFixed(2)} run=${F.run}`);
  }
  step(1);
}
setReel(false); setLean(null);
const fightSecs = guard / 60;
ok(F.phase === 'landed',
  `played properly, the ${hooked.name} is landed in ${fightSecs.toFixed(1)} s (phase=${F.phase})`);
ok(sawRun && sawRest, `it both ran and rested during the fight (runs=${sawRun}, rests=${sawRest})`);
ok(peakTension > 0.45, `the line was genuinely loaded (peak tension ${peakTension.toFixed(2)})`);
out.push(`      ${trace.join(' | ')}`);

// -- 6. the catch is in the bag ------------------------------------------
const kg = F.kg;
step(200);                                  // let the result card time out
ok(!F.busy && g.input.enabled === true, 'control comes back after the card');
ok(rpg.inventory.count(hooked.id) === bagBefore + 1,
  `a ${kg.toFixed(1)} kg ${hooked.name} is in the bag (${bagBefore} -> ${rpg.inventory.count(hooked.id)})`);
const def = rpg.tables.items[hooked.id];
ok(def && def.category === 'ingredient', `and it is a cookable ingredient (category=${def && def.category})`);

// -- 5. now lose one -----------------------------------------------------
step(30);
down('KeyE'); step(20); up('KeyE'); step(3);
guard = 0;
while (F.phase !== 'bite' && F.busy && guard++ < 2400) step(1);
ok(F.phase === 'bite', 'second cast, second bite');
tap('KeyE');
const doomed = F.fish;
// The naive player: hold the reel down and never let go.
down('KeyE');
guard = 0;
while (F.phase === 'fight' && guard++ < 5400) step(1);
up('KeyE'); step(2);
ok(F.phase === 'lost',
  `reeling straight through the runs loses the ${doomed ? doomed.name : 'fish'} in ${(guard / 60).toFixed(1)} s -- "${F.note}"`);

step(200);
ok(!F.busy, 'and control comes back from a loss too');

out.push('');
out.push(`${fails === 0 ? 'ALL PASS' : `${fails} FAILED`}`);
return out.join('\n');

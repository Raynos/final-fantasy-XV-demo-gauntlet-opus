// WS-6: is the Regalia a car, or a prop?
//
// Phase 4's audit table has carried "WS-6 the Regalia — partial; `AutoDrive`
// exists; **nothing verified this round**" since it was written. `Shots.ts` has
// five posed regalia frames and every one of them is a parked car photographed
// from outside: a posed page never presses F, never turns a wheel and never
// asks whether the thing moves.
//
// So this drives it. Get in, drive it manually, hand it to Ignis, and check the
// four things that make a car a car rather than a set piece: it accelerates, it
// steers THE WAY THE KEY SAYS, it stays on the road when the AI has it, and you
// can get out again where you stopped.
//
// The capitals are the point. This gate used to assert `Math.abs(h1 - h0) > 0.3`
// -- "the heading changed" -- and passed green through the entire life of a
// Regalia that steered backwards, which a human found by driving it once. See
// section 2b.
//
// Run: node src/tools/probe.mts src/tools/probes/regaliadrive.mts --dirty \
//        --shot tmp/shots/regalia/r.jpg
const g = window.GAME;
const out = [];
const fails = [];
const ok = (name, cond, detail) => {
  out.push(`  ${cond ? 'ok  ' : 'FAIL'}  ${name.padEnd(40)} ${detail || ''}`);
  if (!cond) fails.push(name);
  return cond;
};

g.applyShot('regalia_road');
g.get('Director')?.play?.();
g.get('CameraRig')?.clearShot?.();
g.resetClock();

const reg = g.get('Regalia');
const player = g.get('Player');
const inp = g.input;
if (!reg) return 'NO REGALIA SYSTEM';
const step = (n) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };

/* ---- 1. get in ------------------------------------------------------- */
out.push('--- 1. get in ---');
// Stand the player on the car before pressing F: `enter` is allowed from a
// reach, and a probe that teleports into the seat proves nothing about whether
// a player could have got there.
// `VehicleBody.pos`, not `.position` — the latter is undefined and reading
// it is how the first run of this died on `.clone()`.
const carPos = (reg.body && reg.body.pos) || (reg.root && reg.root.position);
ok('the car exists and is somewhere', !!carPos,
  carPos ? `${carPos.x.toFixed(0)},${carPos.z.toFixed(0)}` : '-');
if (carPos) {
  player.position.set(carPos.x + 2.4, player.position.y, carPos.z);
  step(10);
}
// **`keyDown()` reads `Input.pressed`, the per-frame EDGE set, not `keys`.**
// `keys` is the held set that drives movement; a probe that adds to it is
// testing itself, not the game. `pressed` is cleared by `endFrame`, so the
// press has to be re-armed on each frame it should be seen on.
inp.keys.clear();
ok('the prompt offers the car', (() => {
  step(6);
  return !!(reg.prompt && reg.prompt.label === 'Drive');
})(), reg.prompt ? `"${reg.prompt.label}" at ${reg.distanceToPlayer().toFixed(1)} m`
  : `no prompt at ${reg.distanceToPlayer().toFixed(1)} m`);
inp.pressed.add('KeyF');
g.frame(1 / 60);
step(20);
ok('pressing F puts him in the driver seat', !!reg.isDriving, `driving=${reg.isDriving}`);
if (!reg.isDriving) { reg.enter(false); step(20); }
ok('the car is drivable at all', !!reg.isDriving);
if (window.__shot) await window.__shot('seated');

/* ---- 2. drive it ----------------------------------------------------- */
out.push('');
out.push('--- 2. drive it ---');
const p0 = reg.body.pos.clone();
let topKmh = 0;
inp.keys.clear();
inp.keys.add('KeyW');
for (let f = 0; f < 60 * 14; f++) {
  g.frame(1 / 60);
  topKmh = Math.max(topKmh, reg.body.kmh || 0);
}
const straight = reg.body.pos.distanceTo(p0);
ok('the throttle moves it', straight > 60, `${straight.toFixed(0)} m in 14 s, top ${topKmh.toFixed(0)} km/h`);
ok('it reaches a road speed', topKmh > 45, `${topKmh.toFixed(0)} km/h`);
if (window.__shot) await window.__shot('driving');

/* ---- 2b. steering, WITH A SIGN --------------------------------------- */
//
// This block used to be four lines that took `Math.abs(h1 - h0)` and asserted
// the car turned *at all*. The Regalia shipped steering the wrong way round,
// a human found it in about a minute, and nineteen gates, a hundred and forty
// two shots and both perf gates could not see it — because the only question
// any of them asked was "does the heading change", and a mirrored car changes
// its heading beautifully. The sign was thrown away on purpose, by an
// `Math.abs` nobody read twice.
//
// Two things have to be true of the replacement, and the second is the one
// the mirrored bug would have defeated.
//
// 1. It is **two-sided.** A gate that only drives left cannot tell a mirrored
//    car from a correct one under a global sign flip of `steer`; driving both
//    keys and demanding opposite signs can.
// 2. It measures the **path**, not the car. `body.heading` is the quantity
//    the bug lived in, and the whole lesson of that day (LANDMINES, "a
//    consistently-but-inversely wound shell") is that a self-consistent frame
//    fools every check expressed inside it. So the instrument here is where
//    the car actually WENT: the direction of travel, sampled from world
//    positions, and the side of its old course it ends up on. Both are
//    unambiguous in world space no matter what any internal frame believes.
//
// Convention, fixed once so the assertions below can be read: with +Y up and
// a right-handed frame, a positive rotation about +Y carries a forward vector
// toward its own left. `signedTurn(a, b) = atan2(a.z*b.x - a.x*b.z, a·b)` is
// that rotation, so **left is positive**. `KeyA` sets `st += 1` and
// `RegaliaSystem` documents "a positive steer raises `heading`, which turns
// left", so `KeyA` must come out positive here and `KeyD` negative.
const dirOf = (a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: dx / l, z: dz / l };
};
const signedTurn = (a, b) => Math.atan2(a.z * b.x - a.x * b.z, a.x * b.x + a.z * b.z);

/**
 * Drive straight, then hold `key`, and report what the world saw.
 *
 * The turn is **accumulated frame group by frame group**, not measured
 * endpoint to endpoint. `atan2` lands in `(-pi, pi]`, and the first version of
 * this ran four seconds of full lock at 159 km/h — comfortably more than one
 * full circle — so a +245 degree left turn came back as -115 and the gate
 * failed a car that was steering correctly. An accumulated sum cannot wrap,
 * and it also stops the assertion depending on how long the window happens to
 * be. The car is also allowed to bleed some speed off first: full lock at a
 * hundred and sixty is a drift, and a drift is not a steering test.
 */
const lockTest = (key) => {
  // Put it back on the carriageway first, at rest, pointing up the road.
  // The first version of this ran straight on from the fourteen-second
  // full-throttle test, which leaves the car 381 m away in whatever ditch it
  // reached; both locks then rotated the chassis 75 and -37 degrees while the
  // path moved 0.1 m sideways, because the car was spinning in place against
  // scenery. Heading rotating while the path does not is precisely the
  // failure this section exists to notice, so the gate has to be handed a car
  // that can actually drive off.
  inp.keys.clear();
  const hit = reg.path.nearest(reg.body.pos.x, reg.body.pos.z, reg.path.makeHit());
  reg.body.reset(hit.x - hit.tz * 2.1, hit.z + hit.tx * 2.1, Math.atan2(hit.tx, hit.tz));
  reg.body.converge && reg.body.converge();
  step(10);
  // up to a speed a road car corners at, not the 159 km/h the top-speed test
  // leaves behind -- full lock at that is a drift, and a drift is not a
  // steering test
  inp.keys.add('KeyW');
  for (let f = 0; f < 60 * 8 && reg.body.kmh < 55; f++) g.frame(1 / 60);

  const sample = () => reg.body.pos.clone();
  let prev = sample();
  for (let f = 0; f < 6; f++) g.frame(1 / 60);
  let dPrev = dirOf(prev, (prev = sample()));
  const d0 = dPrev;
  const p0 = prev.clone();
  const hStart = reg.body.heading ?? 0;
  let hPrev = hStart;

  inp.keys.add(key);
  let turn = 0, dh = 0, lateralAt1s = null;
  for (let g6 = 0; g6 < 25; g6++) {              // 25 groups of 6 frames = 2.5 s
    for (let f = 0; f < 6; f++) g.frame(1 / 60);
    const now = sample();
    const d = dirOf(prev, now);
    turn += signedTurn(dPrev, d);
    let step = (reg.body.heading ?? 0) - hPrev;
    if (step > Math.PI) step -= Math.PI * 2;
    if (step < -Math.PI) step += Math.PI * 2;
    dh += step;
    hPrev = reg.body.heading ?? 0;
    dPrev = d; prev = now;
    // one second in, while the turn is still well short of a quarter circle,
    // ask the other question: which side of its old course is it on now
    if (g6 === 9) {
      const off = { x: now.x - p0.x, z: now.z - p0.z };
      lateralAt1s = d0.z * off.x - d0.x * off.z;
    }
  }
  inp.keys.delete(key);
  return { turn, dh, lateral: lateralAt1s, kmh: reg.body.kmh, ran: prev.distanceTo(p0) };
};

out.push('');
out.push('--- 2b. which way does it steer ---');
const left = lockTest('KeyA');
const right = lockTest('KeyD');
inp.keys.clear();
step(30);

const deg = (r) => `${(r * 57.3).toFixed(0)} deg`;
// A car that rotates without going anywhere is stuck against scenery, and its
// turn direction means nothing; check it drove before believing either sign.
ok('it is moving while it steers', left.ran > 20 && right.ran > 20,
  `A covered ${left.ran.toFixed(0)} m at ${left.kmh.toFixed(0)} km/h, D ${right.ran.toFixed(0)} m at ${right.kmh.toFixed(0)} km/h`);
ok('it steers at all', Math.abs(left.turn) > 0.5 && Math.abs(right.turn) > 0.5,
  `A ${deg(left.turn)}, D ${deg(right.turn)} over 2.5 s of lock`);
// THE assertion. Not "it turned" -- which way.
ok('A turns the car LEFT', left.turn > 0.4 && left.lateral > 1,
  `course rotated ${deg(left.turn)} (positive = left), ${left.lateral.toFixed(1)} m to the left of its old course after 1 s`);
ok('D turns the car RIGHT', right.turn < -0.4 && right.lateral < -1,
  `course rotated ${deg(right.turn)} (negative = right), ${right.lateral.toFixed(1)} m to the left of its old course after 1 s`);
ok('and the two are opposite, not merely large', left.turn * right.turn < 0,
  `A ${deg(left.turn)} vs D ${deg(right.turn)}`);
// The path is the authority above; this checks the car's own frame agrees
// with it, which is the check that would have caught a mirrored RENDER while
// the physics stayed right (or the reverse).
ok('the chassis heading agrees with the path it drove', left.dh > 0 && right.dh < 0,
  `heading delta A ${deg(left.dh)}, D ${deg(right.dh)}`);

/* ---- 3. hand it to Ignis --------------------------------------------- */
out.push('');
out.push('--- 3. auto-drive ---');
// **Give it a destination.** `setAutoDrive(true)` alone hands Ignis the wheel
// with nowhere to go; `driveTo`/`nextDestination` is what puts a target on the
// highway. The first run of this handed over after 380 m of manual off-road
// driving and then blamed Ignis for being off the carriageway — the car was
// nowhere near a road and had not been told where to go.
const dest = reg.nextDestination();
step(30);
ok('auto-drive engages', !!reg.auto, `auto=${reg.auto}, heading for ${dest && dest.name}`);
const roadDist = () => {
  const props = g.get('Props');
  const eco = props && props.ecology;
  return eco ? eco.roadDist(reg.body.pos.x, reg.body.pos.z) : -1;
};
const a0 = reg.body.pos.clone();
let offRoadFrames = 0, worstOff = 0, autoTop = 0, rejoinAt = -1;
const startOff = roadDist();
inp.keys.clear();
for (let f = 0; f < 60 * 60; f++) {
  g.frame(1 / 60);
  autoTop = Math.max(autoTop, reg.body.kmh || 0);
  const d = roadDist();
  if (rejoinAt < 0 && d <= 7) rejoinAt = f;
  // Only count time off the road AFTER it has had a chance to rejoin: the
  // handover happens wherever the player left the car, and getting back to
  // the highway is Ignis' job, not a failure of it.
  if (rejoinAt >= 0 && d > 7) { offRoadFrames++; worstOff = Math.max(worstOff, d); }
}
const held = Math.max(1, 60 * 60 - Math.max(0, rejoinAt));
const autoDist = reg.body.pos.distanceTo(a0);
ok('Ignis actually drives', autoDist > 150, `${autoDist.toFixed(0)} m in 60 s, top ${autoTop.toFixed(0)} km/h`);
ok('he finds the road', rejoinAt >= 0,
  `handed over ${startOff.toFixed(0)} m off it; rejoined after ${rejoinAt >= 0 ? (rejoinAt / 60).toFixed(0) + ' s' : 'NEVER'}`);
ok('and then stays on it', rejoinAt >= 0 && offRoadFrames / held < 0.15,
  `off the carriageway ${((offRoadFrames / held) * 100).toFixed(0)}% of the time after rejoining, worst ${worstOff.toFixed(0)} m`);
if (window.__shot) await window.__shot('auto');

/* ---- 4. get out ------------------------------------------------------ */
out.push('');
out.push('--- 4. get out ---');
reg.setAutoDrive(false);
step(20);
inp.keys.clear();
inp.keys.add('KeyW');
for (let f = 0; f < 60 * 3; f++) g.frame(1 / 60);
inp.keys.clear();
for (let f = 0; f < 60 * 6; f++) g.frame(1 / 60);      // roll to a stop
reg.exit();
step(30);
ok('he gets out', !reg.isDriving, `driving=${reg.isDriving}`);
const gap = player.position.distanceTo(reg.body.pos);
ok('and is standing next to the car', gap < 12 && gap > 0.5, `${gap.toFixed(1)} m away`);
const terrain = g.get('Terrain');
const groundY = terrain ? terrain.heightAt(player.position.x, player.position.z) : player.position.y;
ok('on the ground, not inside it or above it', Math.abs(player.position.y - groundY) < 3.5,
  `player y ${player.position.y.toFixed(2)}, ground ${groundY.toFixed(2)}`);
if (window.__shot) await window.__shot('out');

/* ---- 5. a destination picked off the world map ------------------------ */
// `AutoDrive.setTargetPos` had no caller in the tree. The only way to choose
// where Ignis went was `nextDestination()`, which cycles the next name up the
// road -- so the chart could draw 124 places and send you to none of them.
// This drives the whole path: open the map, put the cursor on a pin, press the
// key a player presses, and see whether the car goes there.
out.push('');
out.push('--- 5. "Ignis, drive there" from the world map ---');
const menus = g.get('Menus');
const M = await import('/world/map/WorldMap.ts');
const map = M.worldMap;
// A far, road-served pin the boot save has already charted. Not fast-travel
// versus drive: the point is that a chart pin becomes a destination.
const target = map.poiById('longwythe_rest') || map.poiById('hammerhead');
map.discover(target.id);
reg.exit();
step(10);
menus.setScreen('world');
step(10);
const screen = menus.screens.world;
const idx = screen.list.indexOf(target);
ok('the pin is on the chart and selectable', idx >= 0, `${target.name} at index ${idx}/${screen.list.length}`);
screen.sel = idx;
step(2);
ok('the card offers the drive', /IGNIS, DRIVE THERE/.test(screen.cardFt.textContent || ''),
  `footer reads "${screen.cardFt.textContent}"`);
const before = reg.body.pos.clone();
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', bubbles: true }));
step(20);
ok('the map closes on the pick', menus.name !== 'world', `screen is ${menus.name}`);
ok('Ignis takes the wheel', !!reg.auto && !!reg.isDriving, `auto=${reg.auto} driving=${reg.isDriving}`);
ok('and the destination is the pin, not the next name up the road',
  reg.autoDrive.destination === target.name, `destination "${reg.autoDrive.destination}"`);
const d0 = Math.hypot(before.x - target.x, before.z - target.z);
const gap0 = reg.autoDrive.remaining(reg.body.roadS);
inp.keys.clear();
for (let f = 0; f < 60 * 90; f++) g.frame(1 / 60);
const d1 = Math.hypot(reg.body.pos.x - target.x, reg.body.pos.z - target.z);
const gap1 = reg.autoDrive.remaining(reg.body.roadS);
ok('the car actually closes on it', d1 < d0 - 100,
  `${(d0 / 1000).toFixed(2)} km -> ${(d1 / 1000).toFixed(2)} km straight-line in 90 s; ` +
  `${gap0.toFixed(0)} m -> ${gap1.toFixed(0)} m along the road`);
if (window.__shot) await window.__shot('mapdrive');

out.push('');
out.push(fails.length ? `*** ${fails.length} FAILED: ${fails.join(', ')} ***`
  : 'PASS — the Regalia is a car: it starts, drives, steers, drives itself, goes where the map says, and lets you out.');
return out.join('\n');

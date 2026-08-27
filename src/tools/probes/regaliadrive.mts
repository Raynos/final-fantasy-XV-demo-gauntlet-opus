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
// steers, it stays on the road when the AI has it, and you can get out again
// where you stopped.
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

// steering: hold a turn and see the heading actually come round
const h0 = reg.body.heading ?? 0;
inp.keys.clear();
inp.keys.add('KeyW');
inp.keys.add('KeyA');
for (let f = 0; f < 60 * 5; f++) g.frame(1 / 60);
const h1 = reg.body.heading ?? 0;
let dh = Math.abs(h1 - h0) % (Math.PI * 2);
if (dh > Math.PI) dh = Math.PI * 2 - dh;
ok('it steers', dh > 0.3, `${(dh * 57.3).toFixed(0)} degrees in 5 s of left lock`);
inp.keys.clear();
step(30);

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

out.push('');
out.push(fails.length ? `*** ${fails.length} FAILED: ${fails.join(', ')} ***`
  : 'PASS — the Regalia is a car: it starts, drives, steers, drives itself and lets you out.');
return out.join('\n');

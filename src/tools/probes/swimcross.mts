/*
 * Does the player actually swim, and is the floor-walk gone?
 *
 *   node src/tools/probe.mts src/tools/probes/swimcross.mts --dirty
 *
 * Lane 23's task 72 done-when is "swim across Alstor Slough without
 * floor-walking", and that is a claim about a *trajectory*, which no posed
 * screenshot can make. So this drives the real loop -- synthetic keys into
 * `Input.keys` and `Game.frame`, exactly as `gameplay.mts` does it -- from a
 * dry bank, out into the deep, and back to a bank, and reports the track.
 *
 * The floor-walk is the defect this feature exists to remove, and it has a
 * precise signature: the feet within 15 cm of the bed while there is more than
 * 1.4 m of water over it. Every such sample is counted. One is a failure.
 *
 * The bearings are derived from `Water.bodies` and the live heightfield rather
 * than written down, for the reason `nanunder.mts` gives at length: the bake is
 * shared and it moves.
 */
const g = window.GAME;
const water = g.get('Water');
const terr = g.get('Terrain');
const player = g.get('Player');
const swim = g.get('Swim');
const inp = g.input;
const M = await import('/game/Shots.ts');

if (!swim) return { error: 'no Swim system registered' };

const SEED = [-1355, 745];
const body = water.bodies.find(
  (b) => Math.abs(SEED[0] - b.cx) < b.w * 0.5 && Math.abs(SEED[1] - b.cz) < b.d * 0.5);
if (!body) return { error: `no water body at ${SEED}` };
const level = body.level;

/*
 * Find a bank near the seed, and the bearing that leads from it into deep
 * water. Walk out along +X until the ground breaks the surface, which is the
 * waterline by construction, then step onto dry land.
 */
let bank = null, bearing = null;
for (let a = 0; a < 16 && !bank; a++) {
  const th = a * Math.PI / 8, ux = Math.cos(th), uz = Math.sin(th);
  for (let r = 8; r < 900; r += 4) {
    const x = SEED[0] + ux * r, z = SEED[1] + uz * r;
    if (terr.heightAt(x, z) > level + 0.9) {
      // 2 m further out again, so the start is unambiguously dry.
      bank = [SEED[0] + ux * (r + 2), SEED[1] + uz * (r + 2)];
      bearing = [-ux, -uz];
      break;
    }
  }
}
if (!bank) return { error: 'no bank found within 900 m of the seed' };

// A follow camera, so the camera-relative wish vector the Player builds points
// where the character faces. Without it W walks toward wherever the last shot
// left the lens.
M.SHOTS[M.PROBE_SHOT] = {
  name: '__probe', doc: 'swimcross', time: 11.0, weather: 'clear', hud: true,
  follow: 'player', offset: [0, 3.1, -6.2], lookOffset: [0, 1.4, 0], fov: 55,
};
g.resetClock();
g.applyShot(M.PROBE_SHOT);
g.settle(20);

const pos = player.root.position;
pos.set(bank[0], terr.heightAt(bank[0], bank[1]), bank[1]);
player.heading = Math.atan2(bearing[0], bearing[1]);
player.root.rotation.y = player.heading;
player.body.vy = 0;
g.settle(20);

const DT = 1 / 60;
const rec = {
  body: body.name, level: +level.toFixed(2),
  bank: [+bank[0].toFixed(1), +bank[1].toFixed(1)],
  entered: false, entryDepth: 0, exited: false, exitDepth: 0,
  floorWalk: 0, samples: 0, maxDepth: 0, swumMetres: 0,
  headUnder: 0, minHeadClear: 99, nan: 0, outFrames: 0, backFrames: 0,
  track: [],
};

const bedAt = (x, z) => player.collision.groundAt(x, z, pos.y, 0.45, 3.0).y;

let prevX = pos.x, prevZ = pos.z;
function step(keys, phase) {
  inp.keys.clear();
  for (const k of keys) inp.keys.add(k);
  g.frame(DT);
  rec.samples++;
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
    rec.nan++;
    return false;
  }
  const bed = bedAt(pos.x, pos.z);
  const depth = level - bed;
  if (swim.swimming) {
    const d = Math.hypot(pos.x - prevX, pos.z - prevZ);
    rec.swumMetres += d;
    if (!rec.entered) { rec.entered = true; rec.entryDepth = +depth.toFixed(2); }
    if (depth > rec.maxDepth) rec.maxDepth = +depth.toFixed(2);
    // THE defect. Feet within 15 cm of the bed under more than 1.4 m of water.
    if (depth > 1.4 && pos.y - bed < 0.15) rec.floorWalk++;
    // ...and the other half of "swimming": the head has to be out of the water
    // while on the surface. `Swim.submerged` is the eye line.
    const headClear = (pos.y + player.body.height) - level;
    if (!swim.submerged && headClear < rec.minHeadClear) {
      rec.minHeadClear = +headClear.toFixed(2);
    }
    if (swim.submerged) rec.headUnder++;
  } else if (rec.entered && !rec.exited && depth < 1.0) {
    rec.exited = true;
    rec.exitDepth = +depth.toFixed(2);
  }
  if (rec.samples % 120 === 0) {
    rec.track.push([+pos.x.toFixed(1), +pos.y.toFixed(2), +pos.z.toFixed(1),
      +depth.toFixed(2), swim.swimming ? 1 : 0, phase]);
  }
  prevX = pos.x; prevZ = pos.z;
  return true;
}

// Out: 30 s of holding forward at a sprint. 3.4 m/s of stroke is ~100 m.
for (let i = 0; i < 1800; i++) { rec.outFrames++; if (!step(['KeyW', 'ShiftLeft'], 'out')) break; }
// Back: reverse. The Player turns to face the wish direction, so this is a
// U-turn and a swim home rather than a backstroke.
for (let i = 0; i < 2600 && !rec.exited; i++) { rec.backFrames++; if (!step(['KeyS', 'ShiftLeft'], 'back')) break; }

rec.swumMetres = Math.round(rec.swumMetres);
rec.finalDepth = +(level - bedAt(pos.x, pos.z)).toFixed(2);
rec.finalPos = [+pos.x.toFixed(1), +pos.y.toFixed(2), +pos.z.toFixed(1)];
rec.stillSwimming = !!swim.swimming;
rec.breath = +swim.breath.toFixed(3);
console.log(`[swimcross] entered=${rec.entered}@${rec.entryDepth}m swum=${rec.swumMetres}m `
  + `maxDepth=${rec.maxDepth}m floorWalk=${rec.floorWalk}/${rec.samples} `
  + `exited=${rec.exited}@${rec.exitDepth}m minHeadClear=${rec.minHeadClear}m nan=${rec.nan}`);
return rec;

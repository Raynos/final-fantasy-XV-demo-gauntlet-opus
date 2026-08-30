/*
 * Does a dive go under, does the breath run out, and does running out force
 * the swimmer back to the surface?
 *
 *   node src/tools/probe.mts src/tools/probes/divebreath.mts
 *
 * Lane 23's task 73 done-when. Like `swimcross.mts` this is a claim about a
 * trajectory over a minute of play, so it drives the real loop with synthetic
 * keys into `Input.keys` and `Game.frame`, and reports the whole descent and
 * ascent rather than a single frame.
 *
 * The three things it has to prove, and each is a separate way this can be
 * quietly broken:
 *
 *  - the eye actually goes UNDER the water line -- a dive that only lowers the
 *    feet leaves the camera in the air and nothing underwater is ever drawn;
 *  - the breath drains only while submerged, and reaches zero;
 *  - at zero the ascent is not negotiable: the dive key is held down for the
 *    whole run, and the swimmer must surface anyway.
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

// Straight into the deep: no bank walk, the entry is swimcross's job.
let bx = SEED[0], bz = SEED[1], bd = level - terr.heightAt(SEED[0], SEED[1]);
for (let ring = 1; ring <= 6; ring++) {
  for (let a = 0; a < 12; a++) {
    const th = a * Math.PI / 6, rr = ring * 18;
    const x = SEED[0] + Math.cos(th) * rr, z = SEED[1] + Math.sin(th) * rr;
    if (Math.abs(x - body.cx) > body.w * 0.5 || Math.abs(z - body.cz) > body.d * 0.5) continue;
    const d = level - terr.heightAt(x, z);
    if (d > bd) { bd = d; bx = x; bz = z; }
  }
}

M.SHOTS[M.PROBE_SHOT] = {
  name: '__probe', doc: 'divebreath', time: 11.0, weather: 'clear', hud: true,
  follow: 'player', offset: [0, 2.4, -5.0], lookOffset: [0, 0.9, 0], fov: 58,
};
g.resetClock();
g.applyShot(M.PROBE_SHOT);
g.settle(20);

const pos = player.root.position;
// Drop him in floating, so the state machine's entry is not what is under test.
pos.set(bx, level - 1.30, bz);
player.body.vy = 0;
g.settle(30);

const DT = 1 / 60;
const rec = {
  bed: +(level - bd).toFixed(2), level: +level.toFixed(2), depth: +bd.toFixed(2),
  swamOnEntry: !!swim.swimming,
  maxEyeDepth: 0, maxDive: 0, framesSubmerged: 0, minBreath: 1,
  breathHitZero: false, forcedAscentSeen: false, forcedAscentFrames: 0,
  surfacedAgain: false, framesToSurface: 0, camUnderFrames: 0, nan: 0,
  samples: 0, phases: [],
};

let zeroAt = -1;
function step(keys, tag) {
  inp.keys.clear();
  for (const k of keys) inp.keys.add(k);
  g.frame(DT);
  rec.samples++;
  if (!Number.isFinite(pos.y)) { rec.nan++; return false; }
  if (swim.eyeDepth > rec.maxEyeDepth) rec.maxEyeDepth = +swim.eyeDepth.toFixed(2);
  const dive = level - 1.30 - pos.y;
  if (dive > rec.maxDive) rec.maxDive = +dive.toFixed(2);
  if (swim.submerged) rec.framesSubmerged++;
  if (g.camera.position.y < level) rec.camUnderFrames++;
  if (swim.breath < rec.minBreath) rec.minBreath = +swim.breath.toFixed(3);
  if (swim.breath <= 0) { rec.breathHitZero = true; if (zeroAt < 0) zeroAt = rec.samples; }
  if (swim.forcedAscent) { rec.forcedAscentSeen = true; rec.forcedAscentFrames++; }
  if (zeroAt > 0 && !rec.surfacedAgain && !swim.submerged) {
    rec.surfacedAgain = true;
    rec.framesToSurface = rec.samples - zeroAt;
  }
  if (rec.samples % 180 === 0) {
    rec.phases.push([tag, rec.samples, +pos.y.toFixed(2),
      +swim.eyeDepth.toFixed(2), +swim.breath.toFixed(2),
      swim.forcedAscent ? 1 : 0, +g.camera.position.y.toFixed(2)]);
  }
  return true;
}

// Hold the dive key AND forward for 45 s. Breath is 26 s, so the last 19 s are
// the forced ascent fighting a key that is still held down.
for (let i = 0; i < 2700; i++) if (!step(['ControlLeft', 'KeyW'], 'dive')) break;
// Then let go, and give buoyancy 8 s to finish the job.
for (let i = 0; i < 480; i++) if (!step([], 'release')) break;

rec.endEyeDepth = +swim.eyeDepth.toFixed(2);
rec.endBreath = +swim.breath.toFixed(3);
rec.stillSwimming = !!swim.swimming;
console.log(`[divebreath] maxEyeDepth=${rec.maxEyeDepth}m camUnder=${rec.camUnderFrames}f `
  + `minBreath=${rec.minBreath} zero=${rec.breathHitZero} forced=${rec.forcedAscentFrames}f `
  + `surfaced=${rec.surfacedAgain}@${rec.framesToSurface}f nan=${rec.nan}`);
return rec;

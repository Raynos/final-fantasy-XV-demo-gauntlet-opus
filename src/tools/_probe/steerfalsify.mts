// Does the new signed-steering gate actually catch the bug it was written for?
//
// `regaliadrive`'s section 2b replaced `Math.abs(h1 - h0) > 0.3` -- which
// passed green through the entire life of a Regalia that steered backwards --
// with an accumulated, signed, path-based turn. A gate is only worth the lines
// it costs if it FAILS on the defect, so this reproduces the defect and checks
// that it does: `_playerControls` is wrapped to negate `c.steer`, which is
// exactly the mirrored car (commit 7043084's two lines, inverted), and the same
// measurement is run in both arms.
//
// Run: node src/tools/probe.mts src/tools/_probe/steerfalsify.mts --dirty
const g = window.GAME;
const out = [];

g.applyShot('regalia_road');
g.get('Director')?.play?.();
g.get('CameraRig')?.clearShot?.();
g.resetClock();

const reg = g.get('Regalia');
const inp = g.input;
if (!reg) return 'NO REGALIA SYSTEM';
const step = (n) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
reg.enter(false);
step(20);

const dirOf = (a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: dx / l, z: dz / l };
};
const signedTurn = (a, b) => Math.atan2(a.z * b.x - a.x * b.z, a.x * b.x + a.z * b.z);

const lockTest = (key) => {
  inp.keys.clear();
  const hit = reg.path.nearest(reg.body.pos.x, reg.body.pos.z, reg.path.makeHit());
  reg.body.reset(hit.x - hit.tz * 2.1, hit.z + hit.tx * 2.1, Math.atan2(hit.tx, hit.tz));
  reg.body.converge && reg.body.converge();
  step(10);
  inp.keys.add('KeyW');
  for (let f = 0; f < 60 * 8 && reg.body.kmh < 55; f++) g.frame(1 / 60);
  let prev = reg.body.pos.clone();
  for (let f = 0; f < 6; f++) g.frame(1 / 60);
  let dPrev = dirOf(prev, (prev = reg.body.pos.clone()));
  const d0 = dPrev, p0 = prev.clone();
  inp.keys.add(key);
  let turn = 0, lateral = null;
  for (let k = 0; k < 25; k++) {
    for (let f = 0; f < 6; f++) g.frame(1 / 60);
    const now = reg.body.pos.clone();
    const d = dirOf(prev, now);
    turn += signedTurn(dPrev, d);
    dPrev = d; prev = now;
    if (k === 9) { const o = { x: now.x - p0.x, z: now.z - p0.z }; lateral = d0.z * o.x - d0.x * o.z; }
  }
  inp.keys.delete(key);
  inp.keys.clear();
  return { turn, lateral };
};

// The gate's own predicate, lifted verbatim so the two cannot drift apart.
const verdict = (l, r) => (l.turn > 0.4 && l.lateral > 1) && (r.turn < -0.4 && r.lateral < -1);
const deg = (r) => `${(r * 57.3).toFixed(0)} deg`;

const arm = (name) => {
  const l = lockTest('KeyA');
  const r = lockTest('KeyD');
  const pass = verdict(l, r);
  out.push(`  ${name.padEnd(22)} A ${deg(l.turn).padStart(8)} / ${l.lateral.toFixed(1).padStart(6)} m   `
    + `D ${deg(r.turn).padStart(8)} / ${r.lateral.toFixed(1).padStart(6)} m   -> gate ${pass ? 'PASSES' : 'FAILS'}`);
  return pass;
};

out.push('--- the gate against the car it is meant to police ---');
const shipped = arm('as shipped');

const orig = reg._playerControls.bind(reg);
reg._playerControls = (game) => { const c = orig(game); c.steer = -c.steer; return c; };
const mirrored = arm('steer negated');
reg._playerControls = orig;

out.push('');
out.push(shipped && !mirrored
  ? 'PASS -- the gate is green on the real car and red on the mirrored one, which is'
    + '\n       the discrimination the old `Math.abs` version did not have.'
  : `*** USELESS GATE: shipped=${shipped ? 'pass' : 'FAIL'}, mirrored=${mirrored ? 'PASS (blind!)' : 'fail'} ***`);
return out.join('\n');

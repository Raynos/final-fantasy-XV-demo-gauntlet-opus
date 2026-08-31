/*
 * The two moving solids the camera used to end up inside: a creature, and the car.
 *
 * Second blind playtest, complaint #1, cases two and three, verbatim:
 *
 *   "Mid-fight, the camera ended up **inside a Voretooth** — the creature
 *    filled the screen, Noctis not visible at all, HUD still up."
 *   "Getting out of the Regalia put the camera **inside the car's nose** —
 *    half the frame a black slab with a disembodied arm at the edge."
 *
 * `CameraOccluders.dynamic` is the knob for both, and it does two different
 * things to them on purpose (see that file): the car is appended to the boulder
 * set and swept by the arm, a creature is only ever asked whether it contains
 * the lens, and the one that does is hidden for the frame.
 *
 * **Both tests here are independent of the rig's own arithmetic.** The lens is
 * graded against a box in the car's heading frame and against a capsule around
 * each live enemy, computed here, not by calling back into the proxies the fix
 * builds. An instrument that re-derives the code's own geometry cannot notice
 * that geometry being wrong, and it also cannot measure the OFF side at all,
 * because with the knob off there are no proxies to ask.
 *
 *   node src/tools/probe.mts src/tools/probes/camsolid.mts --ttl 25 \
 *        --jpeg --shot tmp/shots/w3b/sol.jpg
 */
const g = window.GAME;
const player = g.get('Player');
const rig = g.get('CameraRig');
const car = g.get('Regalia');
const enemies = g.get('Enemies');
const hud = g.get('HUD');
const dt = 1 / 60;
const inp = g.input;
if (!rig) return 'no CameraRig';

g.applyShot('hud_field');
g.get('Director')?.play?.();
rig.clearShot?.();
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus')?.setScreen?.(null);
hud?.setVisible?.(true);
hud?.setMenuOpen?.(false);
g.resetClock();
inp.pointerLocked = true;
const step = (n) => { for (let i = 0; i < n; i++) g.frame(dt); };
const breathe = () => new Promise((r) => setTimeout(r, 0));
step(120);

const out = [];
const emit = (s) => { out.push(s); console.log(s); };
const occ = rig.occluders;

/* ------------------------------------------------- independent containment */

/**
 * Is the lens inside the Regalia's body box?
 *
 * A box, not the rig's inscribed ellipsoid, and measured from the authored
 * dimensions in `world/props/Regalia.ts` — 6.4 m long, 2.3 m wide, body between
 * the wheel tops and the roof. This is deliberately FATTER than the proxy the
 * fix uses, so the fix cannot pass by being graded against itself.
 */
function inCar() {
  if (!car || !car.enabled || !car.root) return false;
  const p = rig.cam.position, r = car.root.position;
  const c = Math.cos(-car.root.rotation.y), s = Math.sin(-car.root.rotation.y);
  const dx = p.x - r.x, dy = p.y - (r.y + 0.95), dz = p.z - r.z;
  const lx = c * dx - s * dz, lz = s * dx + c * dz;
  return Math.abs(lx) < 1.15 && Math.abs(lz) < 3.2 && Math.abs(dy) < 0.75;
}

/** The live enemy whose body contains the lens, or null. Same shape, a capsule. */
function inBeast() {
  const list = enemies && enemies.alive ? enemies.alive() : [];
  const p = rig.cam.position;
  for (const e of list) {
    if (!e || !e.root) continue;
    const sc = e.scale || 1, r = (e.radius || 0.5) * sc, h = (e.height || 1.6) * sc;
    const q = e.root.position;
    const dy = p.y - (q.y + h * 0.55);
    if (Math.abs(dy) > h * 0.55) continue;
    const c = Math.cos(-e.root.rotation.y), s = Math.sin(-e.root.rotation.y);
    const dx = p.x - q.x, dz = p.z - q.z;
    const lx = c * dx - s * dz, lz = s * dx + c * dz;
    if ((lx * lx) / (r * r) + (lz * lz) / (r * 1.9 * r * 1.9) < 1) return e;
  }
  return null;
}
/** Is anything at all being hidden by the fix right now? */
const hiding = () => !!rig._hidBody;

/* ------------------------------------------------------------- the Regalia */

const carRes = { on: null, off: null };
if (!car || !car.enabled) {
  emit('Regalia: not enabled on this build (no road) — case skipped');
} else {
  const SECS = Number(window.__CS_CARSECS) || 5;
  let shotAt = -1;
  for (const dyn of [false, true]) {
    const key = dyn ? 'on' : 'off';
    occ.dynamic = dyn;
    // Ride, then step out: the frame in the complaint is the one right after
    // `exit()` puts Noctis beside the door with the camera still where the
    // drive camera left it.
    if (!car.isDriving) car.enter(true);
    step(180);
    car.exit();
    rig._first = true;
    const r = { f: 0, inside: 0, hid: 0, minD: 9e9 };
    for (let f = 0; f < SECS * 60; f++) {
      g.frame(dt);
      if (f % 120 === 0) await breathe();
      r.f++;
      if (inCar()) { r.inside++; if (shotAt < 0 && !dyn) shotAt = f; }
      if (hiding()) r.hid++;
      const d = rig.cam.position.distanceTo(car.root.position);
      if (d < r.minD) r.minD = d;
    }
    carRes[key] = r;
    emit(`Regalia exit, dynamic ${dyn ? 'ON ' : 'OFF'}: lens inside the car body`
      + ` ${(100 * r.inside / r.f).toFixed(1)}% of ${r.f} frames, closest approach ${r.minD.toFixed(2)} m`);

    if (window.__shot && shotAt >= 0) {
      if (!car.isDriving) car.enter(true);
      step(180);
      car.exit();
      rig._first = true;
      step(shotAt + 1);
      emit(`  shot car-${key} at frame ${shotAt}: lens inside the car ${inCar()},`
        + ` ${rig.cam.position.distanceTo(car.root.position).toFixed(2)} m from its centre, arm ${rig.distance.toFixed(2)} m`);
      await window.__shot(`car-${key}`);
    }
    if (car.isDriving) car.exit();
    step(60);
  }
}

/* ---------------------------------------------------------------- the pack */

const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const hostiles = () => (enemies && enemies.alive ? enemies.alive() : []).filter((e) => !e.dead);
const nearest = () => {
  let best = null, bd = 1e9;
  for (const e of hostiles()) { const d = d2(e.root.position, player.position); if (d < bd) { bd = d; best = e; } }
  return best ? { e: best, d: bd } : null;
};
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

const ROUNDS = Math.max(1, Number(window.__CS_ROUNDS) || 3);
const HEADINGS = [[0.9, 2.4, 4.1], [5.4, 3.2], [1.7, 0.3], [4.7, 2.0]];
const beast = { f: 0, inside: 0, hid: 0, minD: 9e9 };
let shotDone = false;
for (let round = 0; round < ROUNDS; round++) {
  const found = await findDen(HEADINGS[round] || [round], 24);
  if (!found) { emit(`fight ${round + 1}: no den found`); continue; }
  const yaw = Math.atan2(-(found.e.root.position.x - player.position.x),
    -(found.e.root.position.z - player.position.z));
  rig.yaw = yaw; rig.yawTarget = yaw;
  inp.keys.add('KeyW');
  for (let f = 0; f < 60 * 25; f++) {
    g.frame(dt);
    if (f % 300 === 0) await breathe();
    const n = nearest();
    if (n && n.d < 5) break;
  }
  inp.keys.delete('ShiftLeft');
  const r = { f: 0, inside: 0, hid: 0, minD: 9e9 };
  for (let f = 0; f < 60 * 22; f++) {
    g.frame(dt);
    if (f % 120 === 0) await breathe();
    inp.mouse.left = (f % 24) < 8;
    const n = nearest();
    if (n) {
      const y = Math.atan2(-(n.e.root.position.x - player.position.x),
        -(n.e.root.position.z - player.position.z));
      rig.yawTarget = y;
      if (n.d < r.minD) r.minD = n.d;
    }
    r.f++;
    const b = inBeast();
    if (b) r.inside++;
    if (hiding()) r.hid++;
    if (b && !shotDone && window.__shot) {
      // Photograph the SAME instant both ways: the hide is a per-frame
      // decision, so flipping the knob and re-rendering is the honest pair.
      shotDone = true;
      for (const dyn of [false, true]) {
        occ.dynamic = dyn;
        if (!dyn && rig._hidBody) { rig._hidBody.root.visible = true; rig._hidBody = null; }
        g.frame(dt);
        emit(`  shot beast-${dyn ? 'on' : 'off'}: lens inside ${b.speciesId || b.name || 'a creature'},`
          + ` ${rig.cam.position.distanceTo(b.root.position).toFixed(2)} m from its root, hiding ${hiding()}`);
        await window.__shot(`beast-${dyn ? 'on' : 'off'}`);
      }
      occ.dynamic = true;
    }
  }
  inp.mouse.left = false;
  emit(`fight ${round + 1}: ${r.f} combat frames, lens inside a creature ${(100 * r.inside / r.f).toFixed(2)}%`
    + `, a creature hidden on ${(100 * r.hid / r.f).toFixed(2)}%, closest enemy ${r.minD.toFixed(2)} m`);
  beast.f += r.f; beast.inside += r.inside; beast.hid += r.hid;
  beast.minD = Math.min(beast.minD, r.minD);
}

occ.dynamic = true;
emit('');
if (carRes.off) {
  emit(`=== Regalia:   lens inside the car body  dynamic OFF ${(100 * carRes.off.inside / carRes.off.f).toFixed(1)}%`
    + `  ON ${(100 * carRes.on.inside / carRes.on.f).toFixed(1)}%`
    + `   (closest approach ${carRes.off.minD.toFixed(2)} m -> ${carRes.on.minD.toFixed(2)} m)`);
}
if (beast.f) {
  emit(`=== creatures: ${beast.f} combat frames, lens inside one on ${(100 * beast.inside / beast.f).toFixed(2)}%`
    + `, the fix hid one on ${(100 * beast.hid / beast.f).toFixed(2)}%, closest enemy ${beast.minD.toFixed(2)} m`);
}
return out.join('\n');

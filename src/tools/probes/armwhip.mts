/*
 * How fast does the combat camera move, and why?
 *
 * `fightshape`'s `stagger` and `kill` frames are full-frame smears with a
 * boulder in the near corner — the single ugliest thing a fight here does. The
 * frames say *something moved*; they cannot say what. This probe drives the
 * same fight and records the camera's own kinematics per frame, next to the
 * three quantities that can produce them:
 *
 *   - `rig.distance`, the arm length. `_armDistance` sweeps the terrain and
 *     `lateUpdate` applies the result with `if (clear < distance) distance =
 *     clear` — an UNDAMPED cut. One frame of contact teleports the arm.
 *   - `rig.restDistance`, which combat framing rewrites every frame as
 *     `targetDistance + flat * 0.22`, so it moves with the target.
 *   - the yaw/pitch the framing block is lerping toward.
 *
 * Reported as percentiles plus the worst frames with their cause, and split
 * approach (control, no lock-on) versus fight.
 *
 *   node src/tools/probe.mts src/tools/probes/armwhip.mts
 */
const g = window.GAME;
const dt = 1 / 60;
const inp = g.input;
const player = g.get('Player');
const rig = g.get('CameraRig');
const enemies = g.get('Enemies');
const enc = g.get('Encounters');
const hud = g.get('HUD');

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

const keyDown = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
const keyUp = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
const step = (n) => { for (let i = 0; i < n; i++) g.frame(dt); };
const breathe = () => new Promise((r) => setTimeout(r, 0));
const tap = (code) => { keyDown(code); step(2); keyUp(code); step(1); };
const mouse = (down, button = 0) => window.dispatchEvent(new MouseEvent(down ? 'mousedown' : 'mouseup', { button, bubbles: true }));
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const hostiles = () => (enemies.list || []).filter((e) => !e.dead && !e.passive);
const nearest = () => {
  let best = null, bd = 1e9;
  for (const e of hostiles()) { const d = d2(e.position, player.position); if (d < bd) { bd = d; best = e; } }
  return best ? { e: best, d: bd } : null;
};
/**
 * How far off the **lens axis** `p` sits, radians, signed.
 *
 * Measured from the camera and not from the player, which is the same
 * correction the rig's own framing block needed: with the lens six metres
 * behind the player, an enemy two metres in front of him can be 0.85 rad off
 * the PLAYER's bearing while sitting a quarter of that off screen centre. The
 * old form made this probe re-aim at things that were already in frame.
 */
const bearingOff = (p) => {
  const c = rig.cam.position;
  return angDiff(Math.atan2(-(p.x - c.x), -(p.z - c.z)), rig.yaw);
};
/**
 * Turn toward `p` at a rate a hand can produce.
 *
 * Writing `yawTarget` outright is not "what a mouse does": no hand and no
 * stick moves an aim 67 degrees in one 16 ms frame, and the rig then burns
 * that error down at `rotDamp`, which is a 900 deg/s lens sweep the game
 * never asked for. `PLAYER_SLEW` is a brisk flick, 286 deg/s.
 */
const PLAYER_SLEW = 5.0;
const faceToward = (p, snap = false) => {
  const yaw = Math.atan2(-(p.x - player.position.x), -(p.z - player.position.z));
  if (snap) { rig.yawTarget = yaw; rig.yaw = yaw; probeYawWrite = 0; return; }
  const d = angDiff(yaw, rig.yawTarget);
  const step = Math.max(-PLAYER_SLEW * dt, Math.min(PLAYER_SLEW * dt, d));
  probeYawWrite += Math.abs(step);
  rig.yawTarget += step;
};

/* ---- the recorder --------------------------------------------------- */
const prev = { x: 0, y: 0, z: 0 };
const prevQ = { x: 0, y: 0, z: 0, w: 1 };
let prevDist = rig.distance;
let first = true;
/** One sample per frame: linear speed, angular speed, arm state. */
const mkTrack = () => ({
  lin: [], ang: [], dist: [], drops: [], clamped: 0, n: 0, worst: [],
  orbit: [], radial: [], trans: [], framingYaw: [], probeYaw: [], yawRate: [],
});
const prevFocus = { x: 0, y: 0, z: 0 };
let prevYaw = rig.yaw;
/** yawTarget as the probe last left it, before `g.frame` runs the rig. */
let ytBeforeFrame = rig.yawTarget;
/** How much the probe's own re-aim moved yawTarget this frame. */
let probeYawWrite = 0;
const armVec = { x: 0, y: 0, z: 0 };
const sample = (track, tag) => {
  const p = rig.cam.position, q = rig.cam.quaternion;
  const fo = rig._focusSmooth;
  if (first) { first = false; }
  else {
    const lin = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) / dt;
    // angle between the two orientations, degrees per second
    let dot = Math.abs(q.x * prevQ.x + q.y * prevQ.y + q.z * prevQ.z + q.w * prevQ.w);
    dot = Math.min(1, dot);
    const ang = (2 * Math.acos(dot) * 180 / Math.PI) / dt;
    const dd = rig.distance - prevDist;
    track.lin.push(lin); track.ang.push(ang); track.dist.push(rig.distance); track.n++;
    if (dd < -0.05) track.drops.push(-dd / dt);
    if (rig.distance <= rig.minDistance + 1e-3) track.clamped++;
    // Decompose the lens motion: how much of it is the focus point moving
    // under the camera, how much is the arm changing length, and how much is
    // the camera swinging AROUND the focus.
    const trans = Math.hypot(fo.x - prevFocus.x, fo.y - prevFocus.y, fo.z - prevFocus.z) / dt;
    const ax = p.x - fo.x, ay = p.y - fo.y, az = p.z - fo.z;
    const la = Math.hypot(ax, ay, az), lb = Math.hypot(armVec.x, armVec.y, armVec.z);
    const radial = (la - lb) / dt;
    let cosA = (ax * armVec.x + ay * armVec.y + az * armVec.z) / Math.max(1e-6, la * lb);
    cosA = Math.max(-1, Math.min(1, cosA));
    const orbit = (Math.acos(cosA) * la) / dt;
    // yawTarget attribution: the probe writes it between frames, the rig's
    // combat-framing block writes it inside `lateUpdate`. `input.look` is zero.
    const framingYaw = Math.abs(angDiff(rig.yawTarget, ytBeforeFrame)) / dt * 180 / Math.PI;
    const yawRate = Math.abs(angDiff(rig.yaw, prevYaw)) / dt * 180 / Math.PI;
    track.trans.push(trans); track.radial.push(Math.abs(radial)); track.orbit.push(orbit);
    track.framingYaw.push(framingYaw); track.probeYaw.push(probeYawWrite * 180 / Math.PI / dt);
    track.yawRate.push(yawRate);
    if (lin > 8 || ang > 200) {
      track.worst.push(`${tag} lin=${lin.toFixed(1)} = orbit ${orbit.toFixed(1)} + radial ${Math.abs(radial).toFixed(1)} + focus ${trans.toFixed(1)} m/s | yaw ${yawRate.toFixed(0)}deg/s (framing ${framingYaw.toFixed(0)}, probe ${(probeYawWrite * 180 / Math.PI / dt).toFixed(0)}) | arm ${rig.distance.toFixed(2)} rest ${rig.restDistance.toFixed(2)}`);
    }
  }
  prev.x = p.x; prev.y = p.y; prev.z = p.z;
  prevQ.x = q.x; prevQ.y = q.y; prevQ.z = q.z; prevQ.w = q.w;
  prevDist = rig.distance;
  prevFocus.x = fo.x; prevFocus.y = fo.y; prevFocus.z = fo.z;
  armVec.x = p.x - fo.x; armVec.y = p.y - fo.y; armVec.z = p.z - fo.z;
  prevYaw = rig.yaw;
  ytBeforeFrame = rig.yawTarget;
  probeYawWrite = 0;
};
/** Shortest-arc difference between two angles. */
function angDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
const pct = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const report = (name, t) => [
  `${name}: ${t.n} frames`,
  `  lens speed   p50 ${pct(t.lin, 0.5).toFixed(2)}  p95 ${pct(t.lin, 0.95).toFixed(2)}  p99 ${pct(t.lin, 0.99).toFixed(2)}  max ${Math.max(0, ...t.lin).toFixed(2)} m/s`,
  `  lens turn    p50 ${pct(t.ang, 0.5).toFixed(0)}  p95 ${pct(t.ang, 0.95).toFixed(0)}  p99 ${pct(t.ang, 0.99).toFixed(0)}  max ${Math.max(0, ...t.ang).toFixed(0)} deg/s`,
  `  arm length   p05 ${pct(t.dist, 0.05).toFixed(2)}  p50 ${pct(t.dist, 0.5).toFixed(2)}  p95 ${pct(t.dist, 0.95).toFixed(2)} m`,
  `  arm collapses (>0.05 m in one frame): ${t.drops.length} (${(100 * t.drops.length / Math.max(1, t.n)).toFixed(1)}% of frames), worst ${Math.max(0, ...t.drops).toFixed(1)} m/s`,
  `  frames at the minDistance clamp: ${t.clamped} (${(100 * t.clamped / Math.max(1, t.n)).toFixed(1)}%)`,
  `  frames over 8 m/s or 200 deg/s: ${t.worst.length}`,
  `  lens motion split (p95): orbit ${pct(t.orbit, 0.95).toFixed(2)}  arm ${pct(t.radial, 0.95).toFixed(2)}  focus ${pct(t.trans, 0.95).toFixed(2)} m/s`,
  `  yaw rate     p50 ${pct(t.yawRate, 0.5).toFixed(0)}  p95 ${pct(t.yawRate, 0.95).toFixed(0)}  max ${Math.max(0, ...t.yawRate).toFixed(0)} deg/s`,
  `  yawTarget written by the FRAMING block: p95 ${pct(t.framingYaw, 0.95).toFixed(0)}  max ${Math.max(0, ...t.framingYaw).toFixed(0)} deg/s`,
  `  yawTarget written by the PROBE (a player's flick): p95 ${pct(t.probeYaw, 0.95).toFixed(0)}  max ${Math.max(0, ...t.probeYaw).toFixed(0)} deg/s`,
].join('\n');

/* ---- find a den ------------------------------------------------------ */
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

const out = [];
const approach = mkTrack();
const fight = mkTrack();
const HEADINGS = [[0.9, 2.4, 4.1], [5.4, 3.2], [1.7, 0.3]];

for (let round = 0; round < (window.__ROUNDS || 2); round++) {
  const found = await findDen(HEADINGS[round] || [round], 28);
  if (!found) { out.push(`round ${round + 1}: no den`); continue; }
  first = true;

  faceToward(found.e.position, true);
  inp.keys.add('KeyW');
  for (let f = 0; f < 60 * 40; f++) {
    g.frame(dt);
    sample(approach, `approach r${round + 1}`);
    if (f % 300 === 0) await breathe();
    { const n = nearest(); if (n) faceToward(n.e.position); }
    if (enc.state === 'combat') break;
  }
  inp.keys.clear();

  let attacking = false, overFor = 0, reaiming = false;
  const inFight = () => hostiles().filter((e) => d2(e.position, player.position) < 45);
  for (let f = 0; f < 60 * 120; f++) {
    const live = inFight();
    if (!live.length) break;
    if (enc.state !== 'combat') { overFor += dt; if (overFor > 2) break; } else overFor = 0;
    const n = nearest();
    // Hysteresis, the way a player does it: start turning when the target is
    // well off the lens axis, and keep turning until it is back near centre.
    if (n) {
      const off = Math.abs(bearingOff(n.e.position));
      if (off > 0.55) reaiming = true;
      else if (off < 0.20) reaiming = false;
      if (reaiming) faceToward(n.e.position);
    }
    const t = n && n.e;
    const reach = t ? (t.radius || 1) : 1;
    const inDanger = live.some((e) => e.state === 'telegraph' && d2(e.position, player.position) < (e.reach || 4) + 2.5);
    if (t && n.d > reach + 3.4) inp.keys.add('KeyW'); else inp.keys.delete('KeyW');
    if (inDanger && f % 30 === 0) { tap('Space'); if (attacking) { mouse(false); attacking = false; } }
    else if (t && t.staggered && f % 45 === 0) tap('KeyQ');
    else if (f % 300 === 120) tap('KeyG');
    else if (!attacking && n && n.d < reach + 3.6) { mouse(true); attacking = true; }
    else if (attacking && n && n.d > reach + 5.5) { mouse(false); attacking = false; }
    g.frame(dt);
    sample(fight, `fight r${round + 1}`);
    if (f % 300 === 0) await breathe();
  }
  if (attacking) mouse(false);
  inp.keys.clear();
  step(60);
}

out.push(report('APPROACH (control: no lock-on)', approach));
out.push(report('FIGHT', fight));
out.push('', 'WORST FIGHT FRAMES');
out.push(...fight.worst.slice(0, 24).map((s) => `  ${s}`));
return out.join('\n');

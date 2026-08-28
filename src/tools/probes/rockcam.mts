/*
 * How often does a rock stand between the lens and the player?
 *
 * `CameraRig._armDistance` sweeps the heightfield and nothing else — the prop
 * raycast it used to carry read `Props.cameraColliders`, which has never
 * existed, so the list was always empty and the ray never ran. Every capture
 * set of a real fight has a boulder filling the near corner, and WS-11 reads
 * that as the cost of it.
 *
 * **The answer this probe gave is 0.00%, before and after a prop sweep was
 * built** — see the note at the foot of this file. It is kept because it is
 * the only instrument that can ask the question, and because the next lane to
 * look at a boulder in a frame should start from its number rather than from
 * the frame.
 *
 * A den fight cannot measure it: `probes/armwhip.mts` reports 0% in the two
 * Longwythe dens it walks into, because those dens have four stones over
 * 0.45 m inside 34 m between them. So this walks a fixed route across rocky
 * country with the camera turning continuously — which is what puts stones on
 * every side of the arm — and samples, every frame, whether a stone intersects
 * the segment from the lens to the player.
 *
 * The stone spheres are recomputed here from `Rocks`' own instance records
 * (`placedScale` against the kind's `ext` half-extents, median axis) rather
 * than read off `Props.cameraBlockers`, so the same number can be taken on a
 * build that predates that list.
 *
 *   node src/tools/probe.mts src/tools/probes/rockcam.mts
 */
const g = window.GAME;
const dt = 1 / 60;
const inp = g.input;
const player = g.get('Player');
const rig = g.get('CameraRig');
const props = g.get('Props');
const rocks = props && props.rocks;
const R = await import('/world/props/Rocks.ts');
if (!rocks) return 'no Rocks';

g.applyShot('hud_field');
g.get('Director')?.play?.();
rig?.clearShot?.();
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus')?.setScreen?.(null);
g.get('HUD')?.setMenuOpen?.(false);
g.resetClock();
inp.pointerLocked = true;

const breathe = () => new Promise((r) => setTimeout(r, 0));
const EXT1 = [1, 1, 1];
/** Stone spheres near a point: `[x, y, z, r]` per stone. */
const spheres = [];
let spheresAt = null;
const rebuild = (c) => {
  spheres.length = 0;
  for (const st of [rocks.stream, rocks.outcrops]) {
    if (!st || !st.live) continue;
    for (const arr of st.live.values()) {
      for (const it of arr) {
        const dx = it.x - c.x, dz = it.z - c.z;
        if (dx * dx + dz * dz > 34 * 34) continue;
        const ex = rocks.ext.get(it.k) || EXT1;
        const ps = R.placedScale(ex, it.s, it.sx, it.sy, it.sz, it.bury);
        const hx = it.s * ps.jx * ex[0], hy = it.s * ps.jy * ex[1], hz = it.s * ps.jz * ex[2];
        if (Math.min(hx, hz) < 0.45) continue;
        spheres.push(it.x - it.nx * ps.sink, it.y - it.ny * ps.sink, it.z - it.nz * ps.sink,
          hx, hy, hz, Math.cos(it.yaw), Math.sin(it.yaw));
      }
    }
  }
};
/** 0 = clear, 1 = a stone crosses the lens-to-player segment, 2 = lens inside one. */
const occlusionAt = (c) => {
  const f = rig._focusSmooth;
  if (!spheresAt || (spheresAt.x - c.x) ** 2 + (spheresAt.y - c.y) ** 2 + (spheresAt.z - c.z) ** 2 > 36) {
    spheresAt = { x: c.x, y: c.y, z: c.z };
    rebuild(c);
  }
  const dx = f.x - c.x, dy = f.y - c.y, dz = f.z - c.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return 0;
  const ux0 = dx / len, uy0 = dy / len, uz0 = dz / len;
  let worst = 0;
  for (let i = 0; i < spheres.length; i += 8) {
    const cs = spheres[i + 6], sn = spheres[i + 7];
    const px = c.x - spheres[i], py = c.y - spheres[i + 1], pz = c.z - spheres[i + 2];
    const ax = 1 / spheres[i + 3], ay = 1 / spheres[i + 4], az = 1 / spheres[i + 5];
    const ex = (px * cs - pz * sn) * ax, ey = py * ay, ez = (px * sn + pz * cs) * az;
    const ux = (ux0 * cs - uz0 * sn) * ax, uy = uy0 * ay, uz = (ux0 * sn + uz0 * cs) * az;
    const aa = ux * ux + uy * uy + uz * uz;
    const b = ex * ux + ey * uy + ez * uz;
    const cc = ex * ex + ey * ey + ez * ez - 1;
    if (cc < 0) return 2;
    const disc = b * b - aa * cc;
    if (disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / aa;
    if (t > 0 && t < len) worst = 1;
  }
  return worst;
};

/** The lens where the arm WANTS it, before the position damping and the
 *  ground floor. If this is clear and the live lens is not, the residue is
 *  lag rather than a sweep that failed to fire. */
const desired = { x: 0, y: 0, z: 0 };
const occlusion = () => occlusionAt(rig.cam.position);
const occlusionDesired = () => {
  desired.x = rig._focusSmooth.x + rig._dir.x * rig.distance;
  desired.y = rig._focusSmooth.y + rig._dir.y * rig.distance;
  desired.z = rig._focusSmooth.z + rig._dir.z * rig.distance;
  return occlusionAt(desired);
};

let frames = 0, blocked = 0, inside = 0, nearStones = 0, stoneFrames = 0, blockedWant = 0;
/** What the rig itself is being handed, against what this probe recomputes. */
let publishedSum = 0, sweepFired = 0, blockedWithSweep = 0;
const dists = [];
let prev = rig.cam.position.clone();
let fast = 0;
// A slow continuous turn is what puts stones on every side of the arm; a
// straight sprint with a fixed yaw only ever meets them head-on.
const LEGS = [0.4, 1.6, 2.9, 4.2, 5.5, 0.9, 3.6];
for (let leg = 0; leg < LEGS.length; leg++) {
  rig.yaw = LEGS[leg]; rig.yawTarget = LEGS[leg];
  inp.keys.clear(); inp.keys.add('KeyW'); inp.keys.add('ShiftLeft');
  for (let f = 0; f < 60 * 22; f++) {
    rig.yawTarget += (leg % 2 ? 0.30 : -0.30) * dt;
    g.frame(dt);
    if (f % 300 === 0) await breathe();
    frames++;
    const o = occlusion();
    if (o === 2) inside++; else if (o === 1) blocked++;
    const want = occlusionDesired();
    if (want) blockedWant++;
    publishedSum += (props && props.cameraBlockerCount) || 0;
    const fired = rig.distance < rig.restDistance - 0.01;
    if (fired) sweepFired++;
    if (want && fired) blockedWithSweep++;
    if (spheres.length) { stoneFrames++; nearStones += spheres.length / 8; }
    dists.push(rig.distance);
    const c = rig.cam.position;
    if (Math.hypot(c.x - prev.x, c.y - prev.y, c.z - prev.z) / dt > 12) fast++;
    prev.copy(c);
  }
}
inp.keys.clear();

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
return [
  `${frames} frames over 7 legs of sprinting with the camera turning at 0.3 rad/s`,
  `  stones within 34 m: ${(nearStones / Math.max(1, stoneFrames)).toFixed(1)} on an average frame`,
  `  a stone between the lens and the player: ${blocked} (${(100 * blocked / frames).toFixed(2)}%)`,
  `  ...at the arm's DESIRED lens, before the position damping and the ground`,
  `     floor move it: ${blockedWant} (${(100 * blockedWant / frames).toFixed(2)}%)`,
  `  the LENS INSIDE a stone:                 ${inside} (${(100 * inside / frames).toFixed(2)}%)`,
  `  arm length  p05 ${pct(dists, 0.05).toFixed(2)}  p50 ${pct(dists, 0.5).toFixed(2)}  p95 ${pct(dists, 0.95).toFixed(2)} m`,
  `  frames with the lens over 12 m/s: ${fast} (${(100 * fast / frames).toFixed(2)}%)`,
  `  blockers the rig was handed: ${(publishedSum / Math.max(1, frames)).toFixed(1)} on an average frame`,
  `  frames where the arm was shortened at all: ${sweepFired} (${(100 * sweepFired / frames).toFixed(2)}%)`,
  `  ...of the ${blockedWant} still occluded at the desired lens, ${blockedWithSweep} had a shortened arm`,
].join('\n');

/*
 * ---- what it measured, 2026-08-28 -------------------------------------
 *
 * 9 240 frames, seven legs of sprinting across Longwythe with the camera
 * turning at 0.3 rad/s, 3.5 stones over 0.45 m within 34 m on an average
 * frame:
 *
 *   a stone between the lens and the player   0 (0.00%)   before AND after
 *   the lens inside a stone                   0 (0.00%)   before AND after
 *
 * A **sphere**-based version of the same test says 1.24%, and that number is
 * wrong in the way that matters: a median-axis radius makes a ten-metre tor a
 * ten-metre ball, so a player standing three metres from one reads as inside
 * it. That over-fat sphere is also what broke the first prop sweep — it
 * cleared 2 of the 107 frames it flagged, because in the other 105 the focus
 * was "inside" a stone it was in fact standing beside, and a swept arm has no
 * solution there.
 *
 * With the honest ellipsoid the prop sweep took the flagged frames to zero —
 * from zero. It cost 3.55% of frames a shortened arm against 2.14% from the
 * heightfield alone, and it was **reverted as a measured negative**.
 *
 * The boulder in `tmp/shots/cb1/f-engage.jpg` is the reason to be careful with
 * that verdict and the reason it stands: that stone is **beside** the lens,
 * not between the lens and the player. No arm length removes it, because
 * shortening the arm moves the camera *toward* the player and not away from
 * the rock. Fixing that frame is a lateral dodge or a soft fade, not a spring
 * arm — and it is a composition accident that a shipped third-person camera
 * has too. Anyone re-opening it should measure the thing they actually mean:
 * the screen area a prop within a few metres of the lens covers.
 */

/*
 * What is actually IN the frame the combat camera gives you?
 *
 * The 30-minute blind playtest's number-one complaint was not a bug report, it
 * was a picture: "fights happen inside a hill and I can't see any of them --
 * two frames in a row were 100% ground texture." `probes/camsweep.mts` already
 * asks the adjacent question (is the *lens* underground?) and answers 0.00%,
 * because the ground floor in `CameraRig.lateUpdate` lifts it out. That floor
 * lifts it to **0.74 m** above its own ground, which is the height the player
 * measured, and a lens 0.74 m up a hillside is not underground -- it is
 * standing in the mud looking at the mud.
 *
 * So this measures the frame instead of the lens. For a grid of focus points
 * across the walkable world and a turn of yaw at combat pitch, it puts the lens
 * where the rig's own solver puts it, fires a ray grid through the frame, and
 * reports:
 *
 *   mud3   fraction of the frame that is ground within 3 m of the lens
 *   mud8   ...within 8 m
 *   blind  the focus point (the player's chest) is BEHIND the ground: you
 *          cannot see your own character
 *   clear  metres of air under the lens
 *
 * The headline is `blind` and `mud3 > 0.5`. A camera you can play behind has
 * neither.
 *
 * It calls `rig._solveLens` when the rig publishes one and falls back to the
 * pre-fix arithmetic otherwise, so the same probe measures both sides of the
 * change without being edited.
 *
 *   node src/tools/probe.mts src/tools/probes/camview.mts --dirty
 *   node src/tools/probe.mts src/tools/probes/camview.mts --set __CV_STEP=175
 */
const g = window.GAME;
const rig = g.get('CameraRig');
const terr = g.get('Terrain');
if (!rig || !terr) return `missing ${!rig ? 'CameraRig' : 'Terrain'}`;

const V = rig.cam.position.constructor;
/**
 * Half-width of the swept square, metres, **centred on the player**.
 *
 * Not the whole 8 km map: boulders live in `Rocks`' streamed window, radius
 * 560 m about the camera, so a pose sampled at 1400 m is measured against a
 * world with no rock in it. A sweep wider than the stream silently grades the
 * heightfield alone -- which is exactly the mistake this probe exists to avoid
 * repeating.
 */
const EXT = Number(window.__CV_EXT) || 420;
const STEP = Number(window.__CV_STEP) || 60;
const YAWS = Number(window.__CV_YAWS) || 8;
/** Combat rest pitch is FRAME_PITCH = 0.30 rad; bracket it. */
const PITCHES = String(window.__CV_PITCH || '0.14,0.30').split(',').map(Number);
/** Arm length the combat framing asks for: restDistance * fit, fit ~0.94. */
const WANTED = Number(window.__CV_DIST) || 5.3;
/** Ray grid over the frame. 16:9, vertical fov = rig.baseFov. */
const NX = Number(window.__CV_NX) || 12;
const NY = Number(window.__CV_NY) || 7;
const FAR = Number(window.__CV_FAR) || 30;

const focus = new V(), dir = new V(), lens = new V();
const fwd = new V(), right = new V(), up = new V(), ray = new V();
const WORLD_UP = new V(0, 1, 0);

/**
 * The boulder window, which is half the answer: `Rocks` streams tors and
 * outcrops that read as brown hillside and that the pre-fix arm walked straight
 * into. `_solveLens` refreshes it per pose; these read whatever it left.
 */
const occ = rig.occluders || null;
const raySolid = (ox, oy, oz, dx, dy, dz) =>
  (occ && occ.count ? occ.sweep(ox, oy, oz, dx, dy, dz, FAR, 0) : FAR);

/** Distance along a ray to the terrain, or `FAR` when it never hits. */
function rayGround(ox, oy, oz, dx, dy, dz) {
  let t = 0.2;
  while (t < FAR) {
    if (oy + dy * t <= terr.heightAt(ox + dx * t, oz + dz * t)) return t;
    t *= 1.25;
    t += 0.1;
  }
  return FAR;
}

/** Is the segment lens->focus clear of the ground? */
function sees(lx, ly, lz, fx, fy, fz) {
  const n = 14;
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const x = lx + (fx - lx) * u, y = ly + (fy - ly) * u, z = lz + (fz - lz) * u;
    if (y < terr.heightAt(x, z)) return false;
  }
  return true;
}

/**
 * Place the lens exactly as the rig would. `_solveLens` is the post-fix entry
 * point; the `else` branch is the arithmetic that shipped before it, kept so a
 * baseline run and a fixed run are the same measurement.
 */
const legacyFloor = rig.groundClearance ?? (rig.probeRadius + 0.42);
function solve(fx, fy, fz, yaw, pitch, out, push) {
  focus.set(fx, fy, fz);
  if (typeof rig._solveLens === 'function') {
    const was = rig.occluderPush;
    rig.occluderPush = push;
    rig._solveLens(g, focus, yaw, pitch, WANTED, out);
    rig.occluderPush = was;
    return;
  }
  const cp = Math.cos(pitch);
  dir.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).normalize();
  const d = rig._armDistance(g, focus, dir, WANTED);
  out.copy(focus).addScaledVector(dir, d);
  const fl = terr.heightAt(out.x, out.z) + legacyFloor;
  if (out.y < fl) out.y = fl;
}

/**
 * Everything one placed lens is graded on. Called twice per pose -- push-out on
 * and push-out off -- so the before and the after are the SAME poses in the
 * same world, which is the only comparison this lane can make honestly: a
 * live-fight A/B cannot hold the route fixed, because the arm feeds
 * `Props.update(camPos)` and therefore the streaming and therefore where the
 * player's feet land.
 */
function grade(lensP, fx, fy, fz) {
  fwd.set(fx - lensP.x, fy - lensP.y, fz - lensP.z);
  const dl = fwd.length() || 1;
  fwd.multiplyScalar(1 / dl);
  right.copy(fwd).cross(WORLD_UP).normalize();
  up.copy(right).cross(fwd).normalize();
  let n3 = 0, n8 = 0;
  for (let iy = 0; iy < NY; iy++) {
    const sy = (2 * (iy + 0.5) / NY - 1) * th;
    for (let ix = 0; ix < NX; ix++) {
      const sx = (2 * (ix + 0.5) / NX - 1) * th * ASPECT;
      ray.copy(fwd).addScaledVector(right, sx).addScaledVector(up, sy).normalize();
      const t = Math.min(rayGround(lensP.x, lensP.y, lensP.z, ray.x, ray.y, ray.z),
        raySolid(lensP.x, lensP.y, lensP.z, ray.x, ray.y, ray.z));
      if (t < 3) n3++;
      if (t < 8) n8++;
    }
  }
  const cells = NX * NY;
  return {
    mud3: n3 / cells,
    mud8: n8 / cells,
    clear: lensP.y - terr.heightAt(lensP.x, lensP.z),
    inRock: !!(occ && occ.count && occ.inside(lensP.x, lensP.y, lensP.z, rig.probeRadius)),
    see: sees(lensP.x, lensP.y, lensP.z, fx, fy, fz)
      && raySolid(lensP.x, lensP.y, lensP.z, fwd.x, fwd.y, fwd.z) >= dl - 0.1,
  };
}
/** One column of the report. */
const col = () => ({ poses: 0, blind: 0, inRock: 0, mud3: 0, mud8: 0, clear: 0,
  half: 0, nine: 0, worstClear: 1e9 });
const tally = (c, m) => {
  c.poses++; c.mud3 += m.mud3; c.mud8 += m.mud8; c.clear += m.clear;
  if (!m.see) c.blind++;
  if (m.inRock) c.inRock++;
  if (m.mud3 > 0.5) c.half++;
  if (m.mud3 > 0.9) c.nine++;
  if (m.clear < c.worstClear) c.worstClear = m.clear;
};
const ON = col(), OFF = col();
const lensOff = new V();

const th = Math.tan((rig.baseFov * Math.PI / 180) / 2);
const ASPECT = 16 / 9;

let poses = 0, blind = 0, mud3sum = 0, mud8sum = 0, clearSum = 0;
let half = 0, nine = 0, worstClear = 1e9;
/** The same tallies restricted to sloped ground, where it actually fails. */
let sPoses = 0, sBlind = 0, sMud3 = 0, sHalf = 0, sNine = 0;
const hist = new Array(10).fill(0);
/** The worst poses, so the fix has something to be pointed at. */
const worst = [];

const P = (g.get('Player') || { position: { x: 0, z: 0 } }).position;
const OX = Math.round(P.x), OZ = Math.round(P.z);
for (let ox = -EXT; ox <= EXT; ox += STEP) {
  for (let oz = -EXT; oz <= EXT; oz += STEP) {
    const gx = OX + ox, gz = OZ + oz;
    const h0 = terr.heightAt(gx, gz);
    if (h0 < 1) continue;                       // water / below the shoreline
    // local slope, from a 4 m cross
    const sl = Math.hypot(
      terr.heightAt(gx + 2, gz) - terr.heightAt(gx - 2, gz),
      terr.heightAt(gx, gz + 2) - terr.heightAt(gx, gz - 2)) / 4;
    const steep = sl > 0.27;                    // ~15 degrees
    for (let a = 0; a < YAWS; a++) {
      const yaw = (a / YAWS) * Math.PI * 2;
      for (const pitch of PITCHES) {
        const fy = h0 + 1.62;
        solve(gx, fy, gz, yaw, pitch, lens, true);
        const on = grade(lens, gx, fy, gz);
        solve(gx, fy, gz, yaw, pitch, lensOff, false);
        const off = grade(lensOff, gx, fy, gz);
        tally(ON, on); tally(OFF, off);
        poses++;
        hist[Math.min(9, Math.floor(on.mud3 * 10))]++;
        if (steep) {
          sPoses++; sMud3 += on.mud3;
          if (!on.see) sBlind++;
          if (on.mud3 > 0.5) sHalf++;
          if (on.mud3 > 0.9) sNine++;
        }
        const mud3 = on.mud3, see = on.see, clear = on.clear;
        if (mud3 > 0.5 || !see || off.inRock) {
          worst.push({ x: gx, z: gz, yaw: +yaw.toFixed(2), pitch, mud3: +mud3.toFixed(2),
            was: +off.mud3.toFixed(2), rock: off.inRock, stillRock: on.inRock,
            clear: +clear.toFixed(2), see, slope: +(Math.atan(sl) * 180 / Math.PI).toFixed(0) });
        }
      }
    }
  }
}

const pc = (n, d) => `${(100 * n / Math.max(1, d)).toFixed(2)}%`;
worst.sort((p, q) => (q.was - p.was) || (q.mud3 - p.mud3));
const out = [];
out.push(`solver: ${typeof rig._solveLens === 'function' ? '_solveLens (fixed)' : '_armDistance + floor (legacy)'}`);
out.push(`poses ${poses}  (${sPoses} on ground steeper than 15 deg)  rays ${NX}x${NY}  arm ${WANTED} m  far ${FAR} m`);
out.push(`centred on the player at (${OX}, ${OZ}), half-width ${EXT} m, step ${STEP} m`);
if (occ) out.push(`boulder proxies in the last window: ${occ.count} of ${occ.scanned} instances scanned, ${occ.lastMs.toFixed(3)} ms, ${occ.rebuilds} rebuilds`);
out.push('');
out.push('                                      push-out ON     push-out OFF');
const row = (label, on, off) => out.push(`  ${label.padEnd(36)}${String(on).padStart(9)}    ${String(off).padStart(12)}`);
row('lens INSIDE a boulder', pc(ON.inRock, ON.poses), pc(OFF.inRock, OFF.poses));
row('BLIND (Noctis behind ground or rock)', pc(ON.blind, ON.poses), pc(OFF.blind, OFF.poses));
row('frame >50% solid within 3 m', pc(ON.half, ON.poses), pc(OFF.half, OFF.poses));
row('frame >90% solid within 3 m', pc(ON.nine, ON.poses), pc(OFF.nine, OFF.poses));
row('mean mud3', (ON.mud3 / ON.poses).toFixed(4), (OFF.mud3 / OFF.poses).toFixed(4));
row('mean mud8', (ON.mud8 / ON.poses).toFixed(4), (OFF.mud8 / OFF.poses).toFixed(4));
row('mean clearance, m', (ON.clear / ON.poses).toFixed(2), (OFF.clear / OFF.poses).toFixed(2));
row('min clearance, m', ON.worstClear.toFixed(2), OFF.worstClear.toFixed(2));
out.push('');
out.push(`  on steep ground (>15 deg), push-out ON: blind ${pc(sBlind, sPoses)}, >50% mud ${pc(sHalf, sPoses)}, >90% ${pc(sNine, sPoses)}, mean mud3 ${(sMud3 / Math.max(1, sPoses)).toFixed(4)}`);
out.push(`  mud3 histogram, push-out ON (0.0 .. 1.0 in tenths): ${hist.join(' ')}`);
out.push('');
out.push('  worst poses (was = mud3 without push-out):');
for (const w of worst.slice(0, 10)) {
  out.push(`    (${w.x}, ${w.z}) yaw ${w.yaw} pitch ${w.pitch} slope ${w.slope}deg -> mud3 ${w.mud3} (was ${w.was})`
    + `${w.rock ? ' rock->' + (w.stillRock ? 'STILL IN ROCK' : 'out') : ''} clear ${w.clear}${w.see ? '' : ' BLIND'}`);
}
return out.join('\n');

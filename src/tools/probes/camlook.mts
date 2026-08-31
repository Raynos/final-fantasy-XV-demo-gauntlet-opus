/*
 * The same frame, with the boulder push-out off and then on.
 *
 * `probes/camview.mts` has the numbers -- 3552 paired poses, lens inside a
 * boulder 1.24% -> 0.00% -- and numbers are not the bar. `BRIEF.md`'s bar is
 * that somebody looks at the picture. So this stands Noctis at spots the sweep
 * named as its worst, forces the combat framing (a fight is when this matters
 * and the rest camera is a different shot), and takes each one twice: once with
 * `rig.occluderPush = false`, which is exactly the camera that shipped before
 * tonight, and once with it on.
 *
 * The pair is what makes it evidence. A single "after" frame of a rock in the
 * corner proves nothing about whether the rock used to fill the screen.
 *
 *   node src/tools/probe.mts src/tools/probes/camlook.mts --dirty --ttl 20 \
 *        --shot tmp/shots/lane12a/look.jpg
 *   node src/tools/probe.mts src/tools/probes/camlook.mts --dirty \
 *        --set __CL_SPOTS=180,360,2.36
 */
const g = window.GAME;
const rig = g.get('CameraRig');
const player = g.get('Player');
const terr = g.get('Terrain');
const hud = g.get('HUD');
const dt = 1 / 60;
const occ = rig.occluders;

g.applyShot('hud_field');
g.get('Director')?.play?.();
rig.clearShot?.();
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus')?.setScreen?.(null);
hud?.setVisible?.(true);
g.resetClock();
g.input.pointerLocked = true;
const step = (n) => { for (let i = 0; i < n; i++) g.frame(dt); };
const out0 = [];
// The streamed window follows the camera, so give it a moment at the spawn.
step(120);

/**
 * `x, z, yaw` triples. The defaults are the two the sweep called worst: the
 * outcrop at (180, 360) that Noctis stands *inside* on a 31-degree slope, and
 * a boulder cluster the arm walks into from the north.
 */
let SPOTS = window.__CL_SPOTS
  ? String(window.__CL_SPOTS).trim().split(/\s+/).map((t) => t.split(',').map(Number))
  : null;

/**
 * Find the spots worth photographing rather than being told them.
 *
 * A hand-picked pair proves whatever the hand picked. This sweeps the streamed
 * world with `rig._solveLens` both ways -- the same call `camview.mts` grades
 * with -- and keeps the poses where the pre-fix arm puts the lens inside a
 * boulder and the fixed arm does not, ranked by how far apart the two lenses
 * end up, because that is how much of the frame is going to change.
 */
if (!SPOTS) {
  const terrH = (x, z) => terr.heightAt(x, z);
  const a = new (rig.cam.position.constructor)();
  const b = new (rig.cam.position.constructor)();
  const f = new (rig.cam.position.constructor)();
  const found = [];
  const P0 = player.position;
  for (let dx = -320; dx <= 320; dx += 20) {
    for (let dz = -320; dz <= 320; dz += 20) {
      const x = Math.round(P0.x + dx), z = Math.round(P0.z + dz);
      const h = terrH(x, z);
      if (h < 1) continue;
      for (let k = 0; k < 8; k++) {
        const yaw = (k / 8) * Math.PI * 2;
        f.set(x, h + 1.62, z);
        rig.occluderPush = false;
        rig._solveLens(g, f, yaw, 0.30, 5.3, a);
        const inOff = occ.count && occ.inside(a.x, a.y, a.z, rig.probeRadius);
        if (!inOff) continue;
        rig.occluderPush = true;
        rig._solveLens(g, f, yaw, 0.30, 5.3, b);
        if (occ.inside(b.x, b.y, b.z, rig.probeRadius)) continue;
        // Noctis himself in the rock is the case no arm can fix; not this shot.
        if (occ.inside(f.x, f.y, f.z, 0.3)) continue;
        found.push([x, z, +yaw.toFixed(2), a.distanceTo(b)]);
      }
    }
  }
  rig.occluderPush = true;
  found.sort((p, q) => q[3] - p[3]);
  SPOTS = found.slice(0, 3).map((r) => [r[0], r[1], r[2]]);
  out0.push(`auto-picked ${SPOTS.length} of ${found.length} poses where the pre-fix arm ends inside a`
    + ' boulder and the fixed arm does not; ranked by how far the two lenses differ');
  for (const r of found.slice(0, 3)) out0.push(`  (${r[0]}, ${r[1]}) yaw ${r[2]} -> lenses ${r[3].toFixed(2)} m apart`);
  if (!SPOTS.length) return out0.concat('no such pose in the streamed window -- nothing to photograph').join('\n');
}

const out = out0;
for (let i = 0; i < SPOTS.length; i++) {
  const [px, pz, yaw] = SPOTS[i];
  player.root.position.set(px, terr.heightAt(px, pz), pz);
  player.velocity?.set?.(0, 0, 0);
  g.get('Party')?.snap?.();
  rig.yaw = yaw; rig.yawTarget = yaw;
  // Combat pitch, because a fight is when this matters. `FRAME_PITCH` is 0.30.
  rig.pitch = 0.30; rig.pitchTarget = 0.30;
  rig._first = true;
  // Streaming, collision and vegetation all need frames after a teleport; a
  // frame taken on the first one is a frame of the loading screen.
  step(120);

  for (const push of [false, true]) {
    rig.occluderPush = push;
    rig._first = true;
    step(30);
    rig.yaw = yaw; rig.yawTarget = yaw;
    rig.pitch = 0.30; rig.pitchTarget = 0.30;
    step(30);
    const c = rig.cam.position;
    const inRock = !!(occ.count && occ.inside(c.x, c.y, c.z, rig.probeRadius));
    const heroIn = !!(occ.count && occ.inside(
      player.position.x, player.position.y + 1.3, player.position.z, 0.3));
    out.push(`spot ${i + 1} (${px}, ${pz}) yaw ${yaw}  push-out ${push ? 'ON ' : 'OFF'}`
      + `  arm ${rig.distance.toFixed(2)} m  lens (${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)})`
      + `  clear ${(c.y - terr.heightAt(c.x, c.z)).toFixed(2)} m`
      + `  lensInRock ${inRock}  noctisInRock ${heroIn}  proxies ${occ.count}`);
    if (window.__shot) await window.__shot(`s${i + 1}-${push ? 'on' : 'off'}`);
  }
}
rig.occluderPush = true;
return out.join('\n');

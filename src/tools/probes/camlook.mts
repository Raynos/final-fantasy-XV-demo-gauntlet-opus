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

/**
 * `x, z, yaw` triples. The defaults are the two the sweep called worst: the
 * outcrop at (180, 360) that Noctis stands *inside* on a 31-degree slope, and
 * a boulder cluster the arm walks into from the north.
 */
const SPOTS = String(window.__CL_SPOTS || '180,360,2.36 180,360,0.79 -192,-53,1.30')
  .trim().split(/\s+/).map((t) => t.split(',').map(Number));

const out = [];
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

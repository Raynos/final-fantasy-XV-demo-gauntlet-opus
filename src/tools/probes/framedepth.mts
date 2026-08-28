// What is in the bottom of this frame, and how far away is it?
//
// The sky lane closed `zone_mencemoor`'s haze as on-spec and said the real
// defect is that **the frame has no foreground**: its bottom of frame is 434 m
// out from a camera 286 m up, so every pixel in the shot is sky or terrain at
// 400 m-plus and there is nothing for the eye to land on near. That is a
// `Shots.ts` question and `Shots.ts` is shared — so this prints the numbers a
// re-framing would be argued from, rather than editing it.
//
// For each named shot: the distance from the camera to the ground along the
// ray through the bottom centre of frame, the same through the frame centre,
// the camera's height above its own ground, and then a march down the view
// axis reporting where the ground actually is. A shot with a foreground has a
// bottom-of-frame distance of tens of metres, not hundreds.
//
//   node src/tools/probe.mts src/tools/probes/framedepth.mts
//   node src/tools/probe.mts src/tools/probes/framedepth.mts --set __FD_SHOTS=zone_longwythe
const g = window.GAME;
const terr = g.get('Terrain');
const shots = (window.__FD_SHOTS
  || 'zone_mencemoor,zone_longwythe,zone_galdin,zone_vannath').split(',');

/** March a ray until it is under the ground; returns metres, or -1. */
function hit(ox, oy, oz, dx, dy, dz, far = 4000) {
  let t = 1;
  while (t < far) {
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    if (y <= terr.heightAt(x, z)) {
      // bisect for a metre-accurate answer
      let lo = t - 8, hi = t;
      for (let k = 0; k < 24; k++) {
        const m = (lo + hi) / 2;
        const yy = oy + dy * m;
        if (yy <= terr.heightAt(ox + dx * m, oz + dz * m)) hi = m; else lo = m;
      }
      return hi;
    }
    t += Math.max(2, t * 0.02);
  }
  return -1;
}

const out = ['shot                 camY  aboveGround   centre-hit   bottom-hit   b/c ratio'];
const marches = [];
for (const raw of shots) {
  const shot = raw.trim();
  g.applyShot(shot); g.settle(60); g.applyShot(shot); g.settle(4);
  const cam = g.camera;
  cam.updateMatrixWorld(true);
  const p = cam.position;
  const gy = terr.heightAt(p.x, p.z);
  // forward and the bottom-of-frame direction, from the camera's own basis
  const m = cam.matrixWorld.elements;
  const rt = [m[0], m[1], m[2]], up = [m[4], m[5], m[6]], fw = [-m[8], -m[9], -m[10]];
  const th = Math.tan((cam.fov * Math.PI / 180) / 2);
  const bd = [fw[0] - up[0] * th, fw[1] - up[1] * th, fw[2] - up[2] * th];
  const bl = Math.hypot(bd[0], bd[1], bd[2]);
  const c = hit(p.x, p.y, p.z, fw[0], fw[1], fw[2]);
  const b = hit(p.x, p.y, p.z, bd[0] / bl, bd[1] / bl, bd[2] / bl);
  out.push(`${shot.padEnd(20)} ${p.y.toFixed(1).padStart(6)}  ${(p.y - gy).toFixed(1).padStart(10)}  `
    + `${c.toFixed(0).padStart(11)}  ${b.toFixed(0).padStart(11)}  ${(b / Math.max(1, c)).toFixed(2).padStart(9)}`);
  // Ground profile down the view axis: how far back the camera would have to
  // come, or how far down, before something is near it.
  const row = [];
  for (let d = 0; d <= 600; d += 40) {
    row.push(terr.heightAt(p.x + fw[0] * d, p.z + fw[2] * d).toFixed(0));
  }
  marches.push(`  ${shot}: ground along the view axis, 0..600 m step 40 (cam y ${p.y.toFixed(0)}): ${row.join(' ')}`);
  const back = [];
  for (let d = 0; d <= 240; d += 40) {
    back.push(terr.heightAt(p.x - fw[0] * d, p.z - fw[2] * d).toFixed(0));
  }
  marches.push(`  ${shot}: ground BEHIND the camera, 0..240 m step 40: ${back.join(' ')}`);
}
out.push('');
out.push(...marches);
return out.join('\n');

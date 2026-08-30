/*
 * Lane 7 task 25, as a `framecam --probe`: derive the framings for the water
 * no shot covers, and shoot them in the same boot.
 *
 * Why this shape rather than `probe.mts` + `window.__shot`: a probe that poses
 * the rig with `rig.setShot` and then screenshots returns a **black frame** on
 * this daemon -- four of them, verified 2026-08-31. `framecam` injects the spec
 * into `SHOTS`, calls `applyShot` twice around a settle and screenshots after
 * that, which is the corpus capture path, and it comes back with a picture. So
 * this file measures and hands back `specs`; framecam does the looking.
 *
 * Nothing here is a written-down world coordinate. `camAt`/`aimAt` are plan
 * positions resolved against the live heightfield by framecam itself, so a
 * camera can never end up buried in a hill that grew under it.
 */
const g = window.GAME;
const w = g.get('Water'), t = g.get('Terrain');
const out = { bodies: [], joins: 0, specs: [] };

for (const b of w.bodies) {
  out.bodies.push({
    name: b.name, cx: Math.round(b.cx), cz: Math.round(b.cz),
    w: Math.round(b.w), d: Math.round(b.d),
    level: +b.level.toFixed(2), foam: +(b.foamBand ?? 1.35).toFixed(2),
    waveScale: +b.mat.uniforms.uWaveScale.value.toFixed(3),
  });
}

/** Walk out from a body's centre until the ground rises through its level. */
function waterline(b, ux, uz) {
  let r = 4;
  const lim = Math.max(b.w, b.d) * 0.9;
  while (r < lim && t.heightAt(b.cx + ux * r, b.cz + uz * r) < b.level) r += 2;
  return r;
}

// Every standing body, from its own bank at wading height, across the water.
const byArea = [...w.bodies].sort((a, b) => b.w * b.d - a.w * a.d);
byArea.slice(0, 4).forEach((b, i) => {
  const r = waterline(b, 1, 0);
  out.specs.push({
    name: `l7-body${i}-${b.name}`,
    doc: `${b.name}: waterline, margin and open sheet from its own bank`,
    time: 10.5, weather: 'clear',
    camAt: [b.cx + r + 9, b.cz], eye: 2.4,
    aimAt: [b.cx, b.cz], aimUp: 0.0, fov: 55,
  });
});

/*
 * The rivers, framed at their confluences -- the one thing in the river system
 * that no corpus shot can show, and the reason `Water.riverJoins` is published
 * at all. Ranked by discharge below the junction, so these are the widest
 * sheets in the world rather than a headwater trickle.
 */
const joins = [...(w.riverJoins || [])].sort((a, b) => b.qBelow - a.qBelow);
out.joins = joins.length;
joins.slice(0, 3).forEach((j, i) => {
  // Stand back by a multiple of the channel width, so a 3 m brook and a 20 m
  // trunk are both framed at the same apparent size.
  const back = Math.max(16, j.widthBelow * 3.2);
  out.specs.push({
    name: `l7-join${i}`,
    doc: `Confluence: ${j.widthAbove.toFixed(1)} + ${j.widthTrib.toFixed(1)} -> ${j.widthBelow.toFixed(1)} m at ${j.angleDeg.toFixed(0)} deg`,
    time: 11.2, weather: 'clear',
    camAt: [j.x + back, j.z + back * 0.35], eye: 3.2,
    aimAt: [j.x, j.z], aimUp: 0.2, fov: 50,
  });
});

return out;

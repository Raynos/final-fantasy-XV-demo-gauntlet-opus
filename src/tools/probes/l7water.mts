/*
 * Lane 7 task 25: FRAME the water no judged shot covers, before touching it.
 *
 * `Shots.ts` has zone_galdin and zone_vesperpool and nothing else with water in
 * it, and both are 250 m+ standoffs. So the tarn mottle, the river sheet and
 * the shoreline the wave field is supposed to interact with have never been in
 * a frame at all. This probe derives every pose LIVE -- from `Water.bodies`,
 * from `riverWater.geometry`, and from a waterline walk -- because a written-
 * down world coordinate photographs dry ground the next time the heightfield
 * moves, which has already happened twice to `poi_haven`.
 *
 * It also prints what the bodies ARE: the derived `waveScale` per body is the
 * new knob and there is no other way to see which body got which number.
 */
const g = window.GAME;
g.applyShot('zone_galdin');
const rig = g.get('CameraRig'), w = g.get('Water'), t = g.get('Terrain');
const sky = g.get('Sky');
const menus = g.get('Menus'); if (menus) menus.setScreen(null);
const hud = g.get('HUD'); if (hud) hud.setVisible(false);
const out = { bodies: [], shots: [], river: null };

for (const b of w.bodies) {
  out.bodies.push({
    name: b.name, cx: Math.round(b.cx), cz: Math.round(b.cz),
    w: Math.round(b.w), d: Math.round(b.d),
    level: +b.level.toFixed(2), foamBand: +(b.foamBand ?? 1.35).toFixed(2),
    waveScale: +b.mat.uniforms.uWaveScale.value.toFixed(3),
  });
}
out.river = w.riverStats
  ? { stations: w.riverStats.stations ?? null, reaches: w.riverStats.reaches ?? null }
  : null;

/** Walk out from a centre along an azimuth until the ground rises through the level. */
function waterline(b, ux, uz) {
  let r = 4;
  const lim = Math.max(b.w, b.d);
  while (r < lim && t.heightAt(b.cx + ux * r, b.cz + uz * r) < b.level) r += 2;
  return r;
}

async function look(name, pos, target, fov) {
  rig.setShot({ pos, target, fov });
  g.settle(30);
  out.shots.push({
    name,
    pos: pos.map((v) => +v.toFixed(1)),
    target: target.map((v) => +v.toFixed(1)),
    fov,
  });
  await window.__shot(name);
}

/*
 * 1-2. Every standing body, from its own bank at wading eye height, looking
 * across the long axis. This is the frame that shows the sheet: waterline,
 * shallow margin and open surface in one image, which a 250 m standoff cannot.
 */
const byArea = [...w.bodies].sort((a, b) => b.w * b.d - a.w * a.d);
for (const b of byArea.slice(0, 4)) {
  const r = waterline(b, 1, 0);
  const ex = b.cx + r + 8, ez = b.cz;
  const eye = Math.max(t.heightAt(ex, ez), b.level) + 2.4;
  await look(`body-${b.name}`, [ex, eye, ez], [b.cx, b.level, b.cz], 55);
}

/*
 * 3. The Maidenwater. WorldMap puts it at (-3040, 1460) with r 62; it is found
 * here as whichever body's centre is nearest that, rather than by name, because
 * `_findTarns` names bodies after the fishing pin it fitted them to and the pin
 * id is not the map's label.
 */
const maiden = w.bodies.reduce((best, b) => {
  const dd = (b.cx + 3040) ** 2 + (b.cz - 1460) ** 2;
  return best === null || dd < best.dd ? { b, dd } : best;
}, null);
if (maiden && maiden.dd < 400 * 400) {
  const b = maiden.b;
  out.shots.push({ note: 'maidenwater', name: b.name, away: Math.round(Math.sqrt(maiden.dd)) });
  const r = waterline(b, 0, 1);
  const ex = b.cx, ez = b.cz + r + 10;
  const eye = Math.max(t.heightAt(ex, ez), b.level) + 3.0;
  await look('maidenwater', [ex, eye, ez], [b.cx, b.level, b.cz], 52);
} else {
  out.shots.push({ note: 'maidenwater NOT FOUND as a Water body', nearest: maiden ? Math.round(Math.sqrt(maiden.dd)) : null });
}

/*
 * 4-5. Two river reaches, from in the channel at wading height looking
 * downstream, per `probes/vegwaterlook.mts`'s finding that a bank pose puts the
 * eye on a canyon rim wherever the channel is incised.
 */
if (w.riverWater) {
  const geo = w.riverWater.geometry;
  const pos = geo.attributes.position;
  const L = geo.userData && geo.userData.lateral ? geo.userData.lateral : 0;
  if (L > 1) {
    const n = Math.floor(pos.count / L);
    const mid = Math.floor(L / 2);
    const st = (i) => ({
      x: pos.getX(i * L + mid), y: pos.getY(i * L + mid), z: pos.getZ(i * L + mid),
    });
    for (const frac of [0.30, 0.68]) {
      const i = Math.floor(n * frac);
      const a = st(i), b = st(Math.min(n - 1, i + 30));
      await look(`river-${Math.round(frac * 100)}`, [a.x, a.y + 2.2, a.z], [b.x, b.y, b.z], 55);
    }
  } else {
    out.shots.push({ note: 'river geometry has no userData.lateral; stations not walkable', L });
  }
} else {
  out.shots.push({ note: 'no riverWater mesh' });
}

/*
 * 6. Galdin's own shoreline, at eye height ON the beach looking out to sea.
 * The judged frame stands 60 m up and 300 m back; this is the range at which a
 * shoreline is a shoreline, and it is where the refracted wave train and the
 * foam margin either read or do not.
 */
const sea = byArea[0];
if (sea) {
  if (sky) sky.setTimeOfDay(17.8);
  const r = waterline(sea, 1, 1) * Math.SQRT1_2;
  const ex = sea.cx + r + 26, ez = sea.cz + r + 26;
  const eye = Math.max(t.heightAt(ex, ez), sea.level) + 1.7;
  await look('surf', [ex, eye, ez], [sea.cx, sea.level, sea.cz], 46);
}

return out;

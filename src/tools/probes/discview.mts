/**
 * **Where can the Disc of Cauthess actually be seen from?**
 *
 *   node src/tools/probe.mts src/tools/probes/discview.mts
 *
 * Two stands this lane assumed were good turned out to be worthless, and both
 * failures were invisible until something was photographed from them:
 *
 * - The **highway spur** at `n_disc` (-1220,-1360) is 824 m from the impact
 *   centre, which puts it *on* the 790-1060 m rim ring — the frame from there
 *   is the inside of a rim block.
 * - The **Lestallum lookout** at (-2880,-760) has a boulder and the shelf
 *   itself between it and the Disc; the frame from there is a foreground
 *   outcrop and the dreadnought, and no Meteor at all.
 *
 * A shot corpus should not be posed by guessing at map coordinates, so this
 * sweeps candidate stands and reports, for each, **how much of the mass
 * cluster's vertical extent clears the terrain** between there and here. The
 * measurement is a terrain march: step the ray from the eye to the top of the
 * masses and to their waist, ask `Terrain.heightAt` whether the ground is above
 * it, and turn the highest occluding sample into an elevation angle. A stand
 * that can see the crown but not the waist is a stand that gets a rock on a
 * horizon; a stand that sees down to the rim is a stand that gets a crater.
 *
 * Reports the azimuth ring (24 bearings x 5 ranges), the Cauthess highway's own
 * nodes, and the Lestallum shelf, sorted by how much they see. Cheap: no
 * rendering, no lease pressure, just the heightfield.
 */
const g = window.GAME;
const terr = g.get('Terrain');
const CENTRE = [-1020, -2160];

g.scene.updateMatrixWorld(true);
let stone = null;
g.scene.traverse((o) => { if (o.isMesh && o.name === 'meteor_mega_meteorSkin') stone = o; });
if (!stone) g.scene.traverse((o) => { if (o.isMesh && o.name === 'meteor_mega_stone') stone = o; });
if (!stone) return { error: 'no meteor mass mesh' };
stone.geometry.computeBoundingBox();
const bb = stone.geometry.boundingBox.clone().applyMatrix4(stone.matrixWorld);
const crownY = bb.max.y, footY = bb.min.y;
const waistY = footY + (crownY - footY) * 0.35;
const rimY = terr.heightAt(CENTRE[0] + 900, CENTRE[1]);

/**
 * The elevation angle, from `eye`, at which the terrain stops getting in the
 * way. Everything on the Disc above this angle is visible; everything below is
 * behind a ridge.
 */
const skyline = (ex, ey, ez) => {
  const dx = CENTRE[0] - ex, dz = CENTRE[1] - ez;
  const d = Math.hypot(dx, dz);
  let worst = -9;
  // Stop 420 m short: inside that the "terrain" is the crater's own rim and
  // the masses' own footprint, which is the subject, not an occluder.
  for (let t = 30; t < d - 420; t += 12) {
    const f = t / d;
    const h = terr.heightAt(ex + dx * f, ez + dz * f);
    const ang = (h - ey) / t;
    if (ang > worst) worst = ang;
  }
  return { d, worst };
};
const sees = (ex, ez, eyeH) => {
  const ey = terr.heightAt(ex, ez) + eyeH;
  const { d, worst } = skyline(ex, ey, ez);
  const ang = (y) => (y - ey) / d;
  const top = ang(crownY), waist = ang(waistY), rim = ang(rimY);
  const span = Math.max(1e-6, top - ang(footY));
  return {
    at: [Math.round(ex), Math.round(ez)], eyeY: Math.round(ey), range: Math.round(d),
    // fraction of the cluster's height that clears the skyline
    frac: +Math.max(0, Math.min(1, (top - worst) / span)).toFixed(2),
    crown: top > worst, waist: waist > worst, rimVisible: rim > worst,
    // the fov that puts the cluster across ~55% of a 900 px frame
    fovForFrame: +(2 * Math.atan((crownY - footY) / (2 * d) / 0.55) * 180 / Math.PI).toFixed(0),
  };
};

const ring = [];
for (let a = 0; a < 24; a++) {
  const th = (a / 24) * Math.PI * 2;
  for (const r of [1100, 1500, 2000, 2400, 3000]) {
    const x = CENTRE[0] + Math.cos(th) * r, z = CENTRE[1] + Math.sin(th) * r;
    const s = sees(x, z, 2.4);
    s.bearing = +(th * 180 / Math.PI).toFixed(0);
    ring.push(s);
  }
}
ring.sort((a, b) => b.frac - a.frac || a.range - b.range);

// Named stands worth knowing about by name rather than by coordinate.
const NAMED = {
  n_disc: [-1220, -1360], n_coernix: [-1300, -1280], j_cauthess: [-1660, -620],
  lestallum_lookout: [-2880, -760], lestallum_shelf: [-3060, -680],
  landmark_meteor_stand: [-1020, -3560], mencemoor_stand: [400, -1200],
};
const named = {};
for (const [k, p] of Object.entries(NAMED)) named[k] = { low: sees(p[0], p[1], 2.4), high: sees(p[0], p[1], 40) };

return {
  crownY: Math.round(crownY), waistY: Math.round(waistY), footY: Math.round(footY),
  rimY: Math.round(rimY), massMesh: stone.name,
  named,
  best: ring.slice(0, 14),
  worstOfRing: ring.slice(-4),
};

// Are the four heroes separable by width profile alone? (plan §9.2 / §8, and
// the coordinator's "Gladiolus does not read as Gladiolus" at corpus scale.)
//
//   node src/tools/probe.mts src/tools/probes/bodyprofile.mts
//
// `_probe/builds.mts` already measures build ratios — chest over waist, biceps
// over waist — by bucketing bind-space vertices on their dominant skin bone.
// This asks the different question the silhouette bench asks: with no bone
// labels and no ratios, just the outline, **can you tell them apart?**
//
// Height-normalised half-width in 24 bands, over the body and outfit meshes
// together, from the front (|x|) and from the side (|z|), and then every pair's
// separation as the mean absolute difference across bands divided by the mean
// width. A judge looking at four figures at 15 m has the outline and nothing
// else, so this is the statistic that matches what they see.
const g = window.GAME;
g.settle(20);

const NB = 24;
const r = (x, n = 4) => (isFinite(x) ? +x.toFixed(n) : null);

const party = g.get('Party');
const player = g.get('Player');
const who = [['noctis', player], ['gladio', party && party.get && party.get('gladio')],
  ['ignis', party && party.get && party.get('ignis')], ['prompto', party && party.get && party.get('prompto')]];

const out = { chars: {}, pairs: {} };
const prof = {};

for (const [key, m] of who) {
  const ch = m && m.character;
  if (!ch) continue;
  // Bind space, and both shells: an outfit is part of a silhouette.
  const meshes = [ch.body, ch.outfit].filter(Boolean);
  let yMin = Infinity, yMax = -Infinity;
  const pts = [];
  for (const me of meshes) {
    const p = me.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
      pts.push(p.getX(i), y, p.getZ(i));
    }
  }
  const H = yMax - yMin;
  const wx = new Array(NB).fill(0), wz = new Array(NB).fill(0);
  for (let i = 0; i < pts.length; i += 3) {
    let b = Math.floor(((pts[i + 1] - yMin) / H) * NB);
    if (b < 0) b = 0; if (b >= NB) b = NB - 1;
    if (Math.abs(pts[i]) > wx[b]) wx[b] = Math.abs(pts[i]);
    if (Math.abs(pts[i + 2]) > wz[b]) wz[b] = Math.abs(pts[i + 2]);
  }
  prof[key] = { x: wx.map((v) => v / H), z: wz.map((v) => v / H) };
  out.chars[key] = {
    height: r(H, 3),
    frontProfile: prof[key].x.map((v) => r(v, 3)),
    /** the single number a judge is reacting to: how wide is the widest part. */
    maxHalfWidth: r(Math.max(...prof[key].x), 3),
    // No named landmarks here on purpose. A horizontal band through a standing
    // figure catches whatever limb is at that height — the first version of
    // this printed "shoulder", "waist" and "hip" rows and reported the waist as
    // wider than the shoulders on all four, because the arms hang at the sides
    // and the band caught an upper arm. `_probe/builds.mts` buckets by dominant
    // skin bone first and is the tool for landmark ratios. This one is the
    // outline and only the outline, which is all a judge at 15 m has.
  };
}

const keys = Object.keys(prof);
for (let i = 0; i < keys.length; i++) {
  for (let j = i + 1; j < keys.length; j++) {
    const a = prof[keys[i]].x, b = prof[keys[j]].x;
    let d = 0, mean = 0;
    for (let k = 0; k < NB; k++) { d += Math.abs(a[k] - b[k]); mean += (a[k] + b[k]) / 2; }
    out.pairs[`${keys[i]}|${keys[j]}`] = r(100 * d / mean, 1);
  }
}

return out;

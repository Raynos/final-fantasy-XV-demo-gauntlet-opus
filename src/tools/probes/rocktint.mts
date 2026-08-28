/*
 * What is the mean of the rock generator's vertex-colour bake?
 *
 *   node src/tools/probe.mts src/tools/probes/rocktint.mts
 *
 * `Megastructures.megaMaterials` keeps `instanceTint` OFF for `stone` on the
 * grounds that "the rock generator bakes a cavity/dust vertex colour whose mean
 * is about 0.55, which ... halves the value of one that is not — measured: it
 * rendered the meteor near-black." That note predates the bake's own rewrite
 * (the one whose comment says dust is a *lightening* and lives above 1), so the
 * number wants re-reading before anything is built on it.
 *
 * Rebakes the shipped kinds plus a Meteor-sized mass through `setBakeStats` and
 * prints mean/min/max per geometry and over the set. If the mean is near 1 the
 * material can read the attribute for free; if it is not, that is exactly the
 * factor a normalisation has to divide out.
 */
const rocks = await import('/world/props/Rocks.ts');
const stats = [];
rocks.setBakeStats(stats);

const kinds = Array.from(rocks.KINDS || []).slice(0, 8);
for (const k of kinds) {
  try { rocks.rockGeometry(101 + stats.length, { ...(k.geo || {}), size: k.size ? k.size[1] : 3 }); } catch (e) { void e; }
}
// A Meteor mass, at the settings `Megastructures.meteorMass` ships.
const before = stats.length;
rocks.rockGeometry(7001, {
  detail: 24, warp: 0.11, stretch: [1.25, 0.9, 1.1], joints: false, planes: 16,
  upright: 0.05, relief: 0.030, reliefFreq: 1.8, reliefSteps: 2,
  bite: 0.74, bedding: 0, chips: 18, round: 0.02, crease: 26, weather: 0.06,
  size: 585 * 1.95, gully: 0.20, gullyFreq: 3.0, uvScale: 1 / 12,
});
rocks.setBakeStats(null);

const fmt = (s) => `seed=${s.seed} mean=${s.mean.toFixed(4)} min=${s.min.toFixed(3)} `
  + `max=${s.max.toFixed(3)} aoP50=${s.ao[1].toFixed(3)} aoP90=${s.ao[2].toFixed(3)}`;
const all = stats.map(fmt);
const meanOfMeans = stats.reduce((a, s) => a + s.mean, 0) / Math.max(1, stats.length);
return {
  n: stats.length,
  meanOfMeans: +meanOfMeans.toFixed(4),
  meteor: stats.slice(before).map(fmt),
  kinds: all.slice(0, before),
};

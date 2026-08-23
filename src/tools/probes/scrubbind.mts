// What is actually limiting the undergrowth?
//
// The reference plate `duscae-wilderness-04.jpg` is a continuous leafy shrub
// layer; our forest zones draw 137-266 bushes in frame. Four different things
// could be the cap and they want opposite fixes: the placement grid (`GRID`,
// a 4 m nominal spacing), the ecology's density function, the per-frame
// instance budget, or a per-kind `max` on the InstancedMesh.
//
// Prints all four for each shot, so the next change is chosen rather than
// guessed.
//
//   node src/tools/probe.mts src/tools/probes/scrubbind.mts
const g = window.GAME;
const shots = (window.__SHOTS || 'zone_fallgrove,zone_nebulawood,zone_longwythe,zone_malmalam').split(',');
const veg = g.get('Vegetation');
const b = veg.bushes;
const eco = veg.ecology;

const lines = [];
for (const raw of shots) {
  const shot = raw.trim();
  g.applyShot(shot); g.settle(70); g.applyShot(shot); g.settle(6);
  const cam = g.camera.position;
  lines.push('');
  lines.push('=== ' + shot);
  lines.push('  budget ' + b.count + '/' + b.budget + '   impBudget ' + b.impCount + '/' + b.impBudget +
    '   range ' + b.range + '  impRange ' + b.impRange);
  // per-kind fill against its InstancedMesh capacity
  const hot = [];
  for (const [name, k] of b.kinds) {
    for (const v of k.variants || []) if (v._w > 0) hot.push(name + ' geo ' + v._w + '/' + v.max);
    for (const c of k.cards || []) if (c._w > 0) hot.push(name + ' card ' + c._w + '/' + c.max);
  }
  lines.push('  kinds at work: ' + (hot.join(', ') || 'none'));
  // the ecology's own answer, sampled on a ring at several radii around the camera
  for (const r of [30, 80, 150, 250]) {
    let sd = 0, gd = 0, td = 0, n = 0;
    for (let a = 0; a < 12; a++) {
      const x = cam.x + Math.cos(a / 12 * 6.283) * r, z = cam.z + Math.sin(a / 12 * 6.283) * r;
      sd += eco.scrubDensity(x, z); gd += eco.grassDensity(x, z); td += eco.treeDensity(x, z); n++;
    }
    lines.push('    r=' + String(r).padStart(3) + ' m  scrubD ' + (sd / n).toFixed(3) +
      '  grassD ' + (gd / n).toFixed(3) + '  treeD ' + (td / n).toFixed(3));
  }
}
return lines.join('\n');

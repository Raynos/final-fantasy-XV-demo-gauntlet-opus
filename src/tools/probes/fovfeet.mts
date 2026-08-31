/* Same camera, same body, two lenses.
 *
 * From the `plaza_down` camera at fov 12 the boots are complete and on the
 * flags (`tmp/shots/l19-diag2`); at fov 55 from the *same point* the legs are
 * cut at the shin (`tmp/shots/l19-feet3`). Nothing about placement can depend
 * on a projection matrix, so this takes the two frames back to back in one
 * page to find out whether the lens really is the variable -- and then walks
 * the fov between them.
 */
const g = window.GAME;
const out = [];
const { SHOTS } = await import('/game/Shots.ts');
const npcs = g.get('Npcs');
const props = g.get('Props');
const kits = props && props.poiKits;

const CAM = [-2956.8, 123.615, -696.8];
const frame = async (name, target, fov, settle = 60) => {
  SHOTS.__probe = { name: '__probe', pos: CAM, target, fov, time: 10.5 };
  g.applyShot('__probe');
  g.settle(settle);
  await window.__shot(name);
};

// Boot the site in with a wide frame first, and give the exposure integrator
// enough steps that the first shot is not a white rectangle.
await frame('warm', [-2961.5, 121.215, -701.5], 55, 200);

const plaza = kits && kits.anchorAt('lestallum', 'plaza');
out.push(`plaza anchor y ${plaza ? plaza.y.toFixed(3) : 'NULL'}`);
const subj = npcs.list
  .map((n) => ({ n, d: Math.hypot(n.pos.x - CAM[0], n.pos.z - CAM[2]) }))
  .filter((r) => r.d > 3 && r.d < 8)
  .sort((a, b) => a.d - b.d)[0];
if (!subj) return 'no subject';
out.push(`subject ${subj.n.id} at ${subj.d.toFixed(1)} m, lod ${subj.n.body._lod}, pos.y ${subj.n.pos.y.toFixed(3)}`);

const feet = [subj.n.pos.x, subj.n.pos.y + 0.35, subj.n.pos.z];
for (const fov of [12, 24, 38, 55]) {
  await frame(`fov${fov}`, feet, fov, 60);
  out.push(`fov ${fov} shot, lod ${subj.n.body._lod}`);
}
return out.join('\n');

/*
 * How far above its own bounding box does a rock's UNDERSIDE actually sit?
 *
 *   node src/tools/probe.mts src/tools/probes/hullseat.mts
 *
 * `stackPlan`, `torPlan` and `_genOutcrop` all compose a course's overlap
 * through `hullExtents`, which is a **bounding box**: `ext[1]` is the block's
 * greatest half-height *anywhere*. The contact between two courses is not
 * anywhere — it is at the middle of the face, where a warped icosahedron's
 * surface is above its own bbox minimum, because the lowest vertex is out at a
 * corner. So a joint authored on `ext[1]` opens by exactly that difference, on
 * both blocks, and what it draws is a boulder hanging over another one:
 * `tmp/shots/lr2-impp/rock.png`, a three-course tor in `poi_imperial` with
 * daylight all the way across the top joint.
 *
 * `probes/stackjoint.mts` reports 0 open joints of 1615 and is not wrong — it
 * composes the shipped plan through the shipped `placedScale`, which is the
 * same `ext`. It is measuring the recipe's arithmetic against itself. This is
 * the repo's own recurring meta-lesson (`Seat.supportPoints`: "enforce
 * guarantees on the finished, placed mesh, not on the recipe") applied to the
 * one instrument written to catch this class of bug.
 *
 * Prints, per kind: the bbox half-height, the surface height under the axis at
 * three contact radii, and the shortfall as a fraction of the half-height.
 */
const rocks = await import('/world/props/Rocks.ts');

const rows = [];
let worstFrac = 0;
for (const k of rocks.KINDS) {
  const g = rocks.rockGeometry(k.seed, k.opts);
  const ext = rocks.hullExtents(g);
  const p = g.attributes.position;
  // The lowest surface point inside a disc of radius `f * ext[0]` about the
  // axis: where two stacked blocks actually touch.
  const lowIn = (f) => {
    const r2 = (f * ext[0]) * (f * ext[0]);
    let lo = 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (x * x + z * z > r2) continue;
      if (y < lo) lo = y;
    }
    return lo;
  };
  const c15 = lowIn(0.15), c30 = lowIn(0.30), c50 = lowIn(0.50);
  // The gap a joint authored on `ext[1]` leaves, per block, as a fraction of
  // the half-height. Two blocks meet, so a real joint pays it twice.
  const frac = (ext[1] - -c30) / ext[1];
  if (frac > worstFrac) worstFrac = frac;
  rows.push(`${(k.key + '            ').slice(0, 12)} extY=${ext[1].toFixed(3)} `
    + `low@15%=${c15.toFixed(3)} low@30%=${c30.toFixed(3)} low@50%=${c50.toFixed(3)} `
    + `shortfall=${(ext[1] + c30).toFixed(3)} frac=${frac.toFixed(3)}`);
  g.dispose();
}
return {
  note: 'shortfall = extY - |surface under the axis|, in units of the unit mesh. '
    + 'A two-block joint pays it twice, times each block\'s own placed scale.',
  worstFrac: +worstFrac.toFixed(3),
  rows,
};

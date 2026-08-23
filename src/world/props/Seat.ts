import type { Ecology } from '../veg/Ecology.ts';

/**
 * Where a prop's base has to go so it sits on the ground the player *sees*.
 *
 * `Ecology.height` is `Terrain.heightAt`, the analytic field. That is the right
 * answer for collision — the party walks on it — and the wrong answer for
 * placement, because the clipmap does not draw the analytic field. It draws a
 * lattice, and the coarser the ring the further that lattice's chords are from
 * the field between its vertices. Measured by `src/tools/seatcheck.mts` against
 * the real meshes rasterised through the real vertex chunks:
 *
 * |    D | median |  p95 |   p99 | worst float | over 0.25 m |
 * |-----:|-------:|-----:|------:|------------:|------------:|
 * |  150 |  0.304 | 1.63 |  3.27 |        9.20 |         57% |
 * |  300 |  0.668 | 5.70 | 11.59 |       27.00 |         77% |
 * |  600 |  1.485 |14.06 | 28.18 |       64.19 |         87% |
 *
 * So a prop seated on `heightAt` and visible at 150 m is over a quarter of a
 * metre out across **fifty-seven per cent of the world**, and by 600 m it is
 * nearly nine in ten. `Terrain.seatHeightAt` publishes the lower envelope of
 * every clipmap ring that could draw the point, verified to 0.000 m residual
 * from 60 m to 3.4 km, and this is the one-line adapter the handoff asked for.
 *
 * **Pass the kind's cull distance, never the live camera's spacing.** A prop
 * 6 km from spawn is under the coarsest ring in the stack at build time and
 * that has nothing to do with how it will be seen; what matters is the ring it
 * will be drawn by at the range it is still drawn at. That confusion is the
 * sibling's floating-rock bug, recorded in the plan (section 2.1) as an
 * object-size rule where a level-selection rule was needed.
 *
 * For anything that must stay *visible* lying flat on the ground — aprons,
 * decals, graded pads — use the opposite bound, `Terrain.drawnEnvelope`. The
 * sibling built an apron on the lower bound and got 12,450 pixels inside the
 * frustum with none of them passing the depth test.
 *
 * @param size      the prop's footprint, metres; widens the envelope probe
 * @param cullDist  how far away this kind is still drawn
 */
export function seatY(eco: Ecology, x: number, z: number, size = 0, cullDist = 150): number {
  const t = eco.terrain;
  // Guard rather than assume: `Ecology` is constructed before `Terrain` in one
  // boot order, and a prop system that throws during scatter loses the whole
  // tile with no symptom but a missing rock.
  if (!t || typeof t.seatHeightAt !== 'function') return eco.height(x, z);
  return t.seatHeightAt(x, z, size, t.clipSpacingForDistance(cullDist));
}

/**
 * The upper bound: the highest any ring will draw this point.
 *
 * Use it for the flat things whose whole job is to be seen against the ground —
 * road decals, gravel aprons, scree plates. Seating those on the lower envelope
 * puts them under the drawn surface at exactly the ranges they matter.
 */
export function coverY(eco: Ecology, x: number, z: number, size = 0, cullDist = 150): number {
  const t = eco.terrain;
  if (!t || typeof t.drawnEnvelope !== 'function') return eco.height(x, z);
  return t.drawnEnvelope(x, z, size, t.clipSpacingForDistance(cullDist));
}

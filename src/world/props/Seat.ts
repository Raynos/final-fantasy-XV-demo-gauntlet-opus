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

/* -------------------------------------------------------------------------- */
/*  proudOf — the check on the FINISHED, PLACED mesh                           */
/* -------------------------------------------------------------------------- */

/**
 * The variant's support points: where it would touch a flat floor.
 *
 * `seatY` above is the recipe. This is the other half of plan section 13, and
 * it exists because the plan's one recurring meta-lesson is **enforce
 * guarantees on the finished, placed mesh, not on the recipe** — aspect floors,
 * seating, burial and winding were all defeated downstream in the siblings
 * until they were re-checked on what actually ships.
 *
 * A single bottom-centre point is not enough: a prop is seated by one `seatY`
 * call at its centre, and what floats is a *corner*. So the footprint is cut
 * into a `grid x grid` lattice in XZ and the lowest vertex in each occupied
 * cell is kept. Those are the points that would carry the object's weight, and
 * pushing them through the instance matrix is the only way to learn where the
 * placed object actually meets the ground.
 *
 * Computed once per variant geometry, not once per instance — this is the
 * expensive half and instances share it.
 *
 * @param pos the geometry's `position` attribute as a flat array
 * @param grid footprint cells per axis; 4 gives up to 16 support points
 * @returns flat `[x,y,z, ...]` in the geometry's own space, plus its height
 */
export function supportPoints(pos: ArrayLike<number>, grid = 4): { pts: number[], height: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i] < minX) minX = pos[i];
    if (pos[i] > maxX) maxX = pos[i];
    if (pos[i + 1] < minY) minY = pos[i + 1];
    if (pos[i + 1] > maxY) maxY = pos[i + 1];
    if (pos[i + 2] < minZ) minZ = pos[i + 2];
    if (pos[i + 2] > maxZ) maxZ = pos[i + 2];
  }
  const spanX = Math.max(maxX - minX, 1e-6), spanZ = Math.max(maxZ - minZ, 1e-6);
  const best = new Array<number>(grid * grid).fill(Infinity);
  const bi = new Array<number>(grid * grid).fill(-1);
  for (let i = 0; i < pos.length; i += 3) {
    const cx = Math.min(grid - 1, Math.floor(((pos[i] - minX) / spanX) * grid));
    const cz = Math.min(grid - 1, Math.floor(((pos[i + 2] - minZ) / spanZ) * grid));
    const c = cz * grid + cx;
    if (pos[i + 1] < best[c]) { best[c] = pos[i + 1]; bi[c] = i; }
  }
  const pts: number[] = [];
  for (const i of bi) if (i >= 0) pts.push(pos[i], pos[i + 1], pos[i + 2]);
  return { pts, height: maxY - minY };
}

/** What the ground under a footprint is, fitted rather than sampled once. */
export interface SeatPlane {
  /** Plane height at the query point, metres. */
  y: number;
  /** Unit normal of the fitted plane. */
  nx: number; ny: number; nz: number;
  /**
   * RMS of the probes about the fitted plane, metres.
   *
   * This is the number a normal test cannot give you. **A knife edge passes a
   * normal test**: a ridge running under a footprint has a perfectly vertical
   * average normal and a plane fit through it is flat, while the real ground
   * rises to a line down the middle. The residual is what says so, and a prop
   * whose residual is a large fraction of its own size is not seatable at that
   * position at all — it wants moving, not lowering.
   */
  residual: number;
}

/**
 * Least-squares plane through **six** probes of the DRAWN ground.
 *
 * Six, not four: three points define a plane exactly and so can never have a
 * residual, four on a square are degenerate against a saddle (the two diagonals
 * cancel), and six on a ring plus the centre is the smallest arrangement whose
 * residual actually reports curvature. The ring is at 0.72 of the footprint
 * radius because that is the radius at which a disc's area is half in and half
 * out — probes on the rim over-weight the edge, probes at the centre see
 * nothing.
 *
 * Probes the *drawn* surface, not `heightAt`. Fitting the analytic field would
 * describe a surface the renderer does not draw, which is the whole defect
 * `Terrain.drawnHeightAt` exists to fix.
 */
export function seatPlane(eco: Ecology, x: number, z: number, size = 1, cullDist = 150): SeatPlane {
  const t = eco.terrain;
  const cell = t && typeof t.clipSpacingForDistance === 'function'
    ? t.clipSpacingForDistance(cullDist) : 1.5;
  const ground = (px: number, pz: number): number => (
    t && typeof t.drawnHeightAt === 'function' ? t.drawnHeightAt(px, pz, cell) : eco.height(px, pz)
  );
  const r = Math.max(size, 0.25) * 0.72;
  const sx: number[] = [0], sz: number[] = [0];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    sx.push(Math.cos(a) * r); sz.push(Math.sin(a) * r);
  }
  // Plane y = a*u + b*v + c, solved by normal equations over the six probes.
  let Suu = 0, Svv = 0, Suv = 0, Su = 0, Sv = 0, Sy = 0, Suy = 0, Svy = 0;
  const ys: number[] = [];
  for (let i = 0; i < sx.length; i++) {
    const u = sx[i], v = sz[i], y = ground(x + u, z + v);
    ys.push(y);
    Suu += u * u; Svv += v * v; Suv += u * v;
    Su += u; Sv += v; Sy += y; Suy += u * y; Svy += v * y;
  }
  const n = sx.length;
  // 3x3 symmetric solve by Cramer; the ring is never degenerate, but guard
  // anyway — a zero determinant here would return NaN and NaN placement is the
  // failure mode that renders nothing and reports nothing.
  const m = [[Suu, Suv, Su], [Suv, Svv, Sv], [Su, Sv, n]];
  const rhs = [Suy, Svy, Sy];
  const det = (q: number[][]): number => (
    q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1])
    - q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0])
    + q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0])
  );
  const D = det(m);
  let a = 0, b = 0, c = ys[0];
  if (Math.abs(D) > 1e-12) {
    const sub = (col: number): number[][] => m.map((row, i) => row.map((val, j) => (j === col ? rhs[i] : val)));
    a = det(sub(0)) / D; b = det(sub(1)) / D; c = det(sub(2)) / D;
  }
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const d = ys[i] - (a * sx[i] + b * sz[i] + c);
    s2 += d * d;
  }
  const inv = 1 / Math.sqrt(a * a + b * b + 1);
  return { y: c, nx: -a * inv, ny: inv, nz: -b * inv, residual: Math.sqrt(s2 / n) };
}

/** What `proudOf` found about one placed instance. */
export interface Proud {
  /**
   * Metres of AIR under the object: the smallest gap between any support point
   * and the ground drawn beneath it. Zero unless every support point is above
   * the ground, which is exactly the floating-prop bug.
   */
  float: number;
  /**
   * Metres the object's lowest point is below the ground **at its own seat
   * position** — not below the ground under that point.
   *
   * The difference is the whole measurement. Measured per support point, a
   * boulder resting correctly on a hillside is "buried" by its own width times
   * the slope, and the first run of `floatcheck.mts` called 1,085 of 1,314
   * correctly-placed rocks buried for exactly that reason. Burial is a
   * placement error — the seat was too low — and a placement error is a
   * property of the seat point, so that is where it is measured.
   */
  sink: number;
  /** The instance's own world height, which is what `sink` is judged against. */
  height: number;
  /** World XZ of the support point that decided the verdict. */
  x: number; z: number;
  /** False if it floats at all, or is sunk past {@link MAX_SINK} of its height. */
  ok: boolean;
  /** Empty when `ok`; otherwise `'float'` or `'buried'`. */
  why: string;
}

/**
 * How deep a placed body may sink into the drawn ground before it is a defect.
 *
 * The two failure modes are not symmetric and this number says by how much. A
 * rock sunk a third of its height reads as a rock that has been there a while;
 * a rock floating by a *centimetre* reads as a bug, because the eye finds the
 * sliver of sky under it instantly. So float is gated at essentially zero and
 * sink is allowed to 0.55 of the body's own height — past that the object is
 * more than half swallowed and something is wrong with the placement, not with
 * the tolerance.
 */
export const MAX_SINK = 0.55;

/**
 * Does this PLACED instance stand on the ground the player will see?
 *
 * Takes the variant's support points and pushes them through the **final
 * instance matrix** — the one the `InstancedMesh` will actually draw with,
 * after every rotation, scale, nudge and parent transform the pipeline applied
 * — then measures each against `Terrain.drawnHeightAt`. Checking the recipe
 * (`did we call seatY?`) cannot catch a later `+ s * 0.25`, a parent group
 * translated at boot, or a non-uniform scale that lifts a rotated corner. Every
 * one of those has shipped here.
 *
 * **Which ring it measures against, and why.** The finest ring, `cell`
 * defaulting to the clipmap's finest: that is the ground drawn under the object
 * when the player is standing next to it, which is where a gap of sky under a
 * rock is visible. A prop seated correctly by `seatY` cannot float against it,
 * because `seatY` takes the LOWER envelope of every ring — so a positive
 * `float` here is a placement that did not go through the seat contract, or
 * went through it and was moved afterwards.
 *
 * **Blind to**: anything the mesh does that its lowest-vertex-per-cell support
 * set does not sample — a thin spike hanging below a wide body is seen, an
 * overhang whose lowest point is inside the footprint of a taller part is not.
 * Blind to burial by *other props* (a rock inside a building), to whether the
 * object is upright at all (that is `seatPlane().residual` and the normal), and
 * to anything the object does after boot: this is a placement check, not a
 * physics one.
 *
 * @param eco       the `Ecology`, for its terrain handle
 * @param support   from {@link supportPoints}, in the geometry's own space
 * @param m         the final instance matrix, as a flat 16-element array
 * @param cell      ring spacing to judge against; the finest ring by default
 * @param floatTol  metres of gap treated as zero. Float precision only —
 *                  `seatcheck.mts` measures the drawn-height model's own
 *                  residual at **0.000 m p99**, so there is no measurement
 *                  noise here to absorb and this is not a fudge factor.
 */
export function proudOf(
  eco: Ecology,
  support: { pts: number[], height: number },
  m: ArrayLike<number>,
  cell?: number,
  floatTol = 0.002,
): Proud {
  const t = eco.terrain;
  const c = cell ?? (t && t.clipmap ? t.clipmap.cell0 : 1.5);
  const ground = (px: number, pz: number): number => (
    t && typeof t.drawnHeightAt === 'function' ? t.drawnHeightAt(px, pz, c) : eco.height(px, pz)
  );
  // The instance's world height: the matrix's Y column length times the local
  // extent. A non-uniform scale is normal here (`Rocks` stretches every one)
  // and using the local height would judge a squashed boulder by the height it
  // never had.
  const scaleY = Math.hypot(m[4], m[5], m[6]);
  const height = support.height * (scaleY || 1);
  let minGap = Infinity, bx = 0, bz = 0, bottomY = Infinity;
  for (let i = 0; i < support.pts.length; i += 3) {
    const lx = support.pts[i], ly = support.pts[i + 1], lz = support.pts[i + 2];
    const wx = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
    const wy = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
    const wz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
    const gap = wy - ground(wx, wz);
    if (wy < bottomY) bottomY = wy;
    if (gap < minGap) { minGap = gap; bx = wx; bz = wz; }
  }
  if (!Number.isFinite(minGap)) {
    return { float: 0, sink: 0, height, x: 0, z: 0, ok: false, why: 'no-support-points' };
  }
  // Float is per support point: a corner clear of the ground under IT is a
  // visible sliver of sky, and on a slope the downhill corner is the one that
  // shows. Sink is against the seat point, for the reason on the field above.
  const float = Math.max(0, minGap);
  const sink = Math.max(0, ground(m[12], m[14]) - bottomY);
  const buried = height > 1e-6 && sink > MAX_SINK * height;
  return {
    float, sink, height, x: bx, z: bz,
    ok: float <= floatTol && !buried,
    why: float > floatTol ? 'float' : (buried ? 'buried' : ''),
  };
}

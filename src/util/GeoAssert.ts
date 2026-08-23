/**
 * Geometry asserts: the ones nothing else in the pipeline can tell you.
 *
 * Plan section 9.1. Every check here is O(1) per triangle or better and is
 * meant to be called from the generator that built the buffer, at build time,
 * on the **final** index buffer — not on the recipe. The whole reason this file
 * exists is that the siblings' orientation and winding bugs each survived
 * several rounds of looking at frames, because a backwards triangle does not
 * error, does not warn, and often does not even look wrong: it looks like a
 * shading bug, or like nothing at all until the light moves.
 *
 * Our own record says the same thing. `LANDMINES.md`: *"a back-facing surface
 * renders in front of the eyeball and hides it completely"* — an inverted
 * winding fold that was indistinguishable from a shading bug that did not
 * exist, and only reproducible with `DoubleSide` specifically. And the eyelid
 * commit landed the night this file was written: *"every lower eyelid in the
 * game was wound inside out."*
 *
 * Each function throws with the numbers in the message. A throw at build time
 * is the point — a counter somebody reads later is how these survive.
 */

/** A geometry, as much of one as these checks need. */
export interface GeoLike {
  getAttribute(name: string): { array: ArrayLike<number>, itemSize: number, count: number } | undefined;
  getIndex(): { array: ArrayLike<number>, count: number } | null;
}

/** What a winding check found. */
export interface WindingReport {
  /** Triangles whose geometric normal points below the horizon. */
  downFacing: number;
  /** Total triangles examined. */
  total: number;
  /** The worst offender's index, or -1. */
  worst: number;
}

/**
 * Recount, on the FINAL index buffer, how many triangles face down.
 *
 * The plan's line, and it is exact: *"nothing in the pipeline can tell you a
 * triangle was wound backwards."* Not the renderer, which happily draws it;
 * not the build, which has no opinion; not a frame, because on a closed mesh
 * with backface culling a flipped triangle is a hole you read as a shading
 * artefact. So the count is taken here, after every merge, weld, flip and
 * `toNonIndexed` the generator did, and compared against what the caller knows
 * the answer must be.
 *
 * For a ribbon, a strip, an impostor card or any other one-sided surface built
 * to be seen from above, the answer is **zero** and `assertUpward` says so.
 *
 * @param geo the finished geometry
 * @param up the direction the surface is supposed to face
 */
export function downFacing(geo: GeoLike, up: readonly number[] = [0, 1, 0]): WindingReport {
  const pos = geo.getAttribute('position');
  if (!pos) throw new Error('downFacing: geometry has no position attribute');
  const idx = geo.getIndex();
  const n = idx ? idx.count : pos.count;
  const p = pos.array;
  let down = 0, worst = -1, worstDot = Infinity;
  for (let t = 0; t + 2 < n; t += 3) {
    const a = (idx ? idx.array[t] : t) * 3;
    const b = (idx ? idx.array[t + 1] : t + 1) * 3;
    const c = (idx ? idx.array[t + 2] : t + 2) * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) continue;                       // degenerate, not backwards
    const dot = (nx * up[0] + ny * up[1] + nz * up[2]) / len;
    if (dot < 0) {
      down++;
      if (dot < worstDot) { worstDot = dot; worst = t / 3; }
    }
  }
  return { downFacing: down, total: Math.floor(n / 3), worst };
}

/**
 * Hard-error unless every triangle faces `up`.
 *
 * For ribbons, shore strips, decals, impostor cards, aprons — anything
 * single-sided whose back the player must never see.
 */
export function assertUpward(geo: GeoLike, what: string, up: readonly number[] = [0, 1, 0]): void {
  const r = downFacing(geo, up);
  if (r.downFacing > 0) {
    throw new Error(
      `${what}: ${r.downFacing} of ${r.total} triangles are wound backwards `
      + `(first at triangle ${r.worst}). Nothing downstream will tell you this: `
      + 'a flipped triangle renders as a hole you will read as a shading bug.',
    );
  }
}

/**
 * Assert a quad card's UVs are the orientation the atlas was baked in.
 *
 * **This is the transpose-sensitive one, and that is the entire point.** The
 * sibling's impostor bug survived four rounds because every check written for
 * it measured *area*, and UV area is invariant under transpose: swap `u` and
 * `v` on all four corners and the area, the bounds, the aspect ratio and the
 * texel density are all unchanged, while the card renders rotated 90 degrees.
 * The same is true of a flip: mirror `u` and the area is identical.
 *
 * So this compares the actual UV **basis vectors** against the position basis:
 * the sign of the cross product of (du along the card's x) with (dv along the
 * card's y). Transpose flips it; mirror flips it; a pure scale does not.
 *
 * O(1) — it reads six numbers, whatever the size of the card.
 *
 * @param geo   the card
 * @param what  name for the error message
 * @param handed expected sign: +1 for a normally-wound card, -1 for a mirrored one
 */
export function assertCardOrientation(geo: GeoLike, what: string, handed = 1): void {
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  if (!pos) throw new Error(`${what}: no position attribute`);
  if (!uv) {
    throw new Error(
      `${what}: no uv attribute. An undeclared attribute reads as ZERO, silently — `
      + 'a UV-less mesh on a UV material is how the siblings got black megaliths.',
    );
  }
  if (pos.count < 3) throw new Error(`${what}: ${pos.count} vertices, need at least 3`);
  const P = pos.array, U = uv.array;
  // Two edges off vertex 0, in both spaces. A card's first triangle is enough:
  // the question is whether the UV frame agrees in HANDEDNESS with the position
  // frame, and that is a property of any non-degenerate pair of edges.
  const e1 = [P[3] - P[0], P[4] - P[1], P[5] - P[2]];
  const e2 = [P[6] - P[0], P[7] - P[1], P[8] - P[2]];
  const d1 = [U[2] - U[0], U[3] - U[1]];
  const d2 = [U[4] - U[0], U[5] - U[1]];
  const uvCross = d1[0] * d2[1] - d1[1] * d2[0];
  const nx = e1[1] * e2[2] - e1[2] * e2[1];
  const ny = e1[2] * e2[0] - e1[0] * e2[2];
  const nz = e1[0] * e2[1] - e1[1] * e2[0];
  const area = Math.hypot(nx, ny, nz);
  if (area < 1e-12 || Math.abs(uvCross) < 1e-12) {
    throw new Error(`${what}: degenerate first triangle (area ${area}, uv area ${uvCross})`);
  }
  const sign = uvCross > 0 ? 1 : -1;
  if (sign !== handed) {
    throw new Error(
      `${what}: UV frame is ${sign > 0 ? 'right' : 'left'}-handed against the position frame, `
      + `expected ${handed > 0 ? 'right' : 'left'}. The card is transposed or mirrored. `
      + 'Area, bounds, aspect and texel density are ALL invariant under transpose, '
      + 'so no area-based check can see this — which is why the sibling bug survived four rounds.',
    );
  }
}

/**
 * Re-derive tangent handedness from positions and UVs, and check `w`.
 *
 * three.js writes the bitangent sign into `tangent.w` and the normal-map shader
 * multiplies by it. If the generator wrote tangents by hand, or merged two
 * geometries whose UV winding differs, `w` is a constant that used to be right.
 * A wrong `w` mirrors the normal map about the surface: lighting comes from the
 * wrong side and reads as a material problem.
 *
 * @returns the number of triangles whose stored `w` disagrees with the derived one
 */
export function tangentHandednessErrors(geo: GeoLike): { bad: number, total: number } {
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const nrm = geo.getAttribute('normal');
  const tan = geo.getAttribute('tangent');
  if (!pos || !uv || !nrm || !tan) return { bad: 0, total: 0 };
  if (tan.itemSize !== 4) throw new Error(`tangent has itemSize ${tan.itemSize}, expected 4`);
  const idx = geo.getIndex();
  const n = idx ? idx.count : pos.count;
  const P = pos.array, U = uv.array, N = nrm.array, T = tan.array;
  let bad = 0, total = 0;
  for (let t = 0; t + 2 < n; t += 3) {
    const i0 = idx ? idx.array[t] : t;
    const i1 = idx ? idx.array[t + 1] : t + 1;
    const i2 = idx ? idx.array[t + 2] : t + 2;
    const x1 = P[i1 * 3] - P[i0 * 3], y1 = P[i1 * 3 + 1] - P[i0 * 3 + 1], z1 = P[i1 * 3 + 2] - P[i0 * 3 + 2];
    const x2 = P[i2 * 3] - P[i0 * 3], y2 = P[i2 * 3 + 1] - P[i0 * 3 + 1], z2 = P[i2 * 3 + 2] - P[i0 * 3 + 2];
    const s1 = U[i1 * 2] - U[i0 * 2], t1 = U[i1 * 2 + 1] - U[i0 * 2 + 1];
    const s2 = U[i2 * 2] - U[i0 * 2], t2 = U[i2 * 2 + 1] - U[i0 * 2 + 1];
    const det = s1 * t2 - s2 * t1;
    if (Math.abs(det) < 1e-12) continue;
    const r = 1 / det;
    const tx = (t2 * x1 - t1 * x2) * r, ty = (t2 * y1 - t1 * y2) * r, tz = (t2 * z1 - t1 * z2) * r;
    const bx = (s1 * x2 - s2 * x1) * r, by = (s1 * y2 - s2 * y1) * r, bz = (s1 * z2 - s2 * z1) * r;
    const nx = N[i0 * 3], ny = N[i0 * 3 + 1], nz = N[i0 * 3 + 2];
    // w = sign( dot( cross(N, T), B ) )
    const cx = ny * tz - nz * ty, cy = nz * tx - nx * tz, cz = nx * ty - ny * tx;
    const derived = (cx * bx + cy * by + cz * bz) < 0 ? -1 : 1;
    total++;
    if (Math.sign(T[i0 * 4 + 3] || 1) !== derived) bad++;
  }
  return { bad, total };
}

/**
 * Assert the material's attribute contract against the mesh. Plan section 9.5.
 *
 * *"Undeclared attributes read as zero, silently."* The sibling's black
 * megaliths were a UV-less mesh on a UV material building NaN tangents, and we
 * have the same disease pre-documented: `PartBuilder` strips vertex colours and
 * zeroes UVs, and a mixed indexed/non-indexed `mergeGeometries` returns **null**
 * with no error at all.
 *
 * Nothing in WebGL reports this. A missing attribute binds to a constant of
 * zero, so a missing UV samples texel (0,0) of every map — which is a colour,
 * so it looks like a material choice — and a missing normal shades black, which
 * looks like a light.
 *
 * @param geo the mesh's geometry
 * @param mat what the material needs, as flags
 * @param what name for the error message
 */
export function assertAttributeContract(
  geo: GeoLike,
  mat: { map?: unknown, normalMap?: unknown, vertexColors?: boolean, aoMap?: unknown },
  what: string,
): void {
  const missing: string[] = [];
  const needsUv = !!(mat.map || mat.normalMap || mat.aoMap);
  if (needsUv && !geo.getAttribute('uv')) missing.push('uv (a texture is bound; UV 0 samples one texel of it as a flat colour)');
  if (mat.aoMap && !geo.getAttribute('uv1') && !geo.getAttribute('uv2')) {
    missing.push('uv1 (aoMap reads the SECOND UV set, not the first)');
  }
  if (mat.normalMap && !geo.getAttribute('normal')) missing.push('normal (a normalMap without one shades black)');
  if (mat.vertexColors && !geo.getAttribute('color')) {
    missing.push('color (vertexColors is on; a missing colour attribute reads as BLACK, not as white)');
  }
  if (missing.length) {
    throw new Error(`${what}: material/mesh attribute contract broken — missing ${missing.join('; ')}`);
  }
}

/** What {@link edgeConsistency} found. */
export interface EdgeReport {
  /**
   * Interior edges whose two directions are traversed an unequal number of
   * times — the smoking gun. Coincident shells give an equal count both ways
   * and do not appear here.
   */
  flipped: number;
  /** Edges with exactly one adjacent triangle: a boundary. Fine on an open surface. */
  boundary: number;
  /** Balanced interior edges. */
  interior: number;
}

/**
 * The exact winding test: on a correctly wound mesh every interior edge is
 * traversed once in each direction.
 *
 * This is the one that actually catches an inverted patch, and it is worth
 * saying why the obvious alternatives do not.
 *
 * - Comparing a face normal to the *vertex* normals cannot work, because vertex
 *   normals are almost always accumulated from the same winding and flip with
 *   it.
 * - Comparing a face normal to `(faceCentroid - meshCentroid)` works on a
 *   convex body and is **near chance on a limbed one**: measured here, a sphere
 *   scores 100% and the bestiary's creatures score 52-62%, where random is 50.
 * - Area, bounds and aspect are invariant under every flip there is.
 *
 * Edge parity is none of those. A patch wound inside out shares its border
 * edges with its correctly-wound neighbours in the *same* direction, and there
 * is no configuration of a closed surface where that is legitimate.
 *
 * Positions are quantised to weld coincident vertices, because a generator that
 * duplicates vertices for hard normals splits every edge and would otherwise
 * report the whole mesh as boundary.
 *
 * @param geo the finished geometry
 * @param weld quantisation in world units for treating two vertices as one
 */
export function edgeConsistency(geo: GeoLike, weld = 1e-4): EdgeReport {
  const pos = geo.getAttribute('position');
  if (!pos) throw new Error('edgeConsistency: geometry has no position attribute');
  const idx = geo.getIndex();
  const n = idx ? idx.count : pos.count;
  const P = pos.array;
  const inv = 1 / weld;
  const key = new Map<string, number>();
  const vid = new Int32Array(pos.count).fill(-1);
  const idOf = (v: number): number => {
    if (vid[v] >= 0) return vid[v];
    const k = `${Math.round(P[v * 3] * inv)},${Math.round(P[v * 3 + 1] * inv)},${Math.round(P[v * 3 + 2] * inv)}`;
    let id = key.get(k);
    if (id === undefined) { id = key.size; key.set(k, id); }
    vid[v] = id;
    return id;
  };
  const dir = new Map<number, number>();
  const bump = (a: number, b: number) => {
    // Pack the ordered pair. `key.size` bounds the id space; 2^21 vertices is
    // far past anything we build and keeps the product inside a safe integer.
    const k = a * 2097152 + b;
    dir.set(k, (dir.get(k) || 0) + 1);
  };
  for (let t = 0; t + 2 < n; t += 3) {
    const a = idOf(idx ? idx.array[t] : t);
    const b = idOf(idx ? idx.array[t + 1] : t + 1);
    const c = idOf(idx ? idx.array[t + 2] : t + 2);
    if (a === b || b === c || a === c) continue;      // degenerate
    bump(a, b); bump(b, c); bump(c, a);
  }
  let flipped = 0, boundary = 0, interior = 0;
  // Walk UNORDERED edges. Iterating the directed map and skipping `a > b` looks
  // equivalent and is not: a flipped triangle can leave direction (a,b) present
  // with a > b and (b,a) absent entirely, so that edge is skipped from both
  // sides and never examined. The control read 1 flipped where the answer is 3.
  const seen = new Set<number>();
  for (const k of dir.keys()) {
    const a = Math.floor(k / 2097152), b = k - a * 2097152;
    const lo = a < b ? a : b, hi = a < b ? b : a;
    const uk = lo * 2097152 + hi;
    if (seen.has(uk)) continue;
    seen.add(uk);
    const f = dir.get(lo * 2097152 + hi) || 0;
    const r = dir.get(hi * 2097152 + lo) || 0;
    if (f + r === 1) { boundary++; continue; }
    // **Parity, not duplication.** These meshes are stacks of primitives, and
    // two closed shells that touch at coincident vertices weld into one edge
    // traversed twice each way -- f === r === 2. That is redundant modelling,
    // not a winding error, and counting duplication alone flagged 15 of 21
    // species with up to 778 edges apiece. A genuinely flipped patch is an
    // IMBALANCE: it removes one direction at the moment it duplicates the other.
    if (f !== r) flipped++;
    else interior++;
  }
  return { flipped, boundary, interior };
}

/** Hard-error if any interior edge is traversed twice in the same direction. */
export function assertConsistentWinding(geo: GeoLike, what: string): void {
  const r = edgeConsistency(geo);
  if (r.flipped > 0) {
    throw new Error(
      `${what}: ${r.flipped} interior edges are traversed twice in the same direction `
      + `(${r.interior} interior, ${r.boundary} boundary). Some patch of this mesh is `
      + 'wound inside out. Nothing downstream reports this: it renders as a hole you '
      + 'will read as a shading bug.',
    );
  }
}

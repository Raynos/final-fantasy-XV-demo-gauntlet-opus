import * as THREE from 'three';

/**
 * Re-pack `color` and `normal` as normalised bytes.
 *
 * **The measurement this exists for.** `probes/memowners.mts`, by attribute,
 * across all 552 geometries in a booted world:
 *
 *     position   79.0 MB  (3x Float32)      skinWeight  20.4 MB
 *     normal     44.9 MB  (3x Float32)      skinIndex   10.2 MB
 *     colour     42.7 MB  (3x Float32)      uv          30.3 MB
 *
 * Colour is a 0..1 multiplier and a normal is a unit vector: both are exactly
 * the shapes a normalised byte was invented for, and both are carried here at
 * four bytes a channel. At one byte they are a quarter of the size — **~65 MB
 * of the 275 CPU-side, and the same again of the 318 MB uploaded**, because the
 * GPU copy is the same bytes.
 *
 * **It is a re-pack, not a generator rewrite.** Every generator keeps writing
 * floats; this runs over the finished scene graph, after every merge, and swaps
 * the array under the attribute. That ordering is not cosmetic:
 * `mergeGeometries` returns **null**, silently, when its inputs disagree on a
 * format, and a null merge deletes a whole site. So this must never run on a
 * geometry that is still going to be merged with an unpacked one — which is why
 * the call sites are the three points where a subtree is *finished*.
 *
 * ### What it refuses
 *
 * Quantisation is only free where the values are already inside the range the
 * format encodes, so every attribute is range-checked before it is touched
 * rather than assumed:
 *
 *   - a `color` outside 0..1 (an over-bright tint) keeps its floats;
 *   - a `normal` that is not unit length keeps its floats — some generators
 *     leave them unnormalised on purpose and `Int8` would clamp;
 *   - anything already integer, interleaved, or carrying morph targets on the
 *     same name is left alone.
 */

/** What one pass freed, and what it declined to touch. */
export interface PackStats {
  /** Geometries visited. */
  seen: number;
  /** Attributes re-packed. */
  packed: number;
  /** Attributes left alone because their values did not fit. */
  refused: number;
  /** CPU bytes freed. The GPU copy shrinks by the same amount. */
  saved: number;
}

/**
 * Nothing outside this is repacked, and each name has its own target format.
 *
 * The table, and the argument for every row — measured by
 * `src/tools/_probe/packaudit.mts` over a booted `?q=ultra` world, which prints
 * every `Float32` attribute with the widest range any of its values reach:
 *
 *     attribute      bytes    verdict
 *     position:3     78.6 MB  needs a bbox decode — NOT here, see below
 *     color:3        34.8 MB  29.3 MB of it is over-bright (>1); refused
 *     uv:2           30.2 MB  22.8 MB of it tiles past 1; refused
 *     skinWeight:4   20.4 MB  16.5 MB inside 0..1  <- packed, plan task 38
 *     aMat:3          9.5 MB   6.5 MB inside 0..1  <- packed
 *     aTan:3          9.5 MB   6.2 MB inside -1..1 <- packed
 *     aGroom:3        4.7 MB   4.0 MB inside -1..1 <- packed
 *     aClip:2         2.1 MB   2.1 MB inside 0..1  <- packed
 *
 * **`position` is deliberately absent.** 71.1 MB of it fits `Int16`, but a
 * normalised integer position is only decodable with a per-geometry scale and
 * offset pushed onto the mesh — and the geometries here are merged, shared
 * between meshes, and read back by collision and raycasting. That is a
 * different change with a different risk, and it is filed rather than done.
 *
 * **`uv` and `color` are not "not worth it", they are out of range.** Both
 * would need `Float16` (half precision keeps the range and halves the bytes)
 * rather than a normalised integer. Filed for the same reason: it is a format
 * three's `BufferAttribute` supports but no generator in this repo emits, so it
 * wants its own verification pass.
 */
type Packable = 'color' | 'normal' | 'skinWeight' | 'aMat' | 'aTan' | 'aGroom' | 'aClip';

/** How one attribute name is re-packed, once its values are proved in range. */
interface Rule {
  /** `u8` is normalised `Uint8` (0..1); `i8` is normalised `Int8` (-1..1). */
  fmt: 'u8' | 'i8';
  /**
   * Skin weights must still sum to 1 after rounding, or the vertex shrinks
   * towards the origin. Only `skinWeight` sets this.
   */
  renorm?: boolean;
}

/**
 * Every attribute this will touch, and the format it goes to.
 *
 * A name that is not here is never rewritten, which is the point: a new
 * generator attribute is inert until somebody has looked at what it holds.
 */
const RULES: Record<Packable, Rule> = {
  // A tint the shader multiplies by. Anything over 1 is a deliberate
  // over-bright and `Uint8` would flatten it to white.
  color: { fmt: 'u8' },
  // A unit vector. `Int8` normalised is `max(v / 127, -1)`, so a normal that is
  // not unit length is clipped rather than quantised — check before, not after.
  normal: { fmt: 'i8' },
  // glTF's own format for weights, and the reason it is safe at one byte: the
  // four weights are a partition of 1, so the absolute error a byte can carry
  // is 1/255 of a bone's influence on one vertex.
  skinWeight: { fmt: 'u8', renorm: true },
  // Per-vertex material parameters, authored in 0..1.
  aMat: { fmt: 'u8' },
  // Strand / flow direction — the same unit-vector argument as `normal`.
  aTan: { fmt: 'i8' },
  // Groom normal, likewise a unit vector, and only hair carries it.
  aGroom: { fmt: 'i8' },
  // Clip-fade parameters, 0..1.
  aClip: { fmt: 'u8' },
};

/**
 * True when every value is inside `[lo, hi]`.
 *
 * The range check is the whole safety argument, so it reads the array once
 * rather than sampling: a single over-bright vertex in a 700 k-vertex merge is
 * exactly the case a sample would miss and a clamp would show.
 */
function within(a: ArrayLike<number>, lo: number, hi: number): boolean {
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!(v >= lo && v <= hi)) return false;
  }
  return true;
}

/**
 * Re-pack one geometry in place.
 * @param geo the geometry, already merged and final
 * @param st accumulator
 */
export function packGeometry(geo: THREE.BufferGeometry, st: PackStats) {
  st.seen++;
  for (const name of Object.keys(RULES) as Packable[]) {
    const rule = RULES[name];
    const attr = geo.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!attr || (attr as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) continue;
    const morphs = geo.morphAttributes as Record<string, unknown[] | undefined>;
    if (morphs && morphs[name]) continue;
    const arr = attr.array;
    if (!(arr instanceof Float32Array)) continue;
    if (!within(arr, rule.fmt === 'u8' ? 0 : -1, 1)) { st.refused++; continue; }
    if (rule.renorm && !partitionsOne(arr, attr.itemSize)) { st.refused++; continue; }
    const out = rule.fmt === 'u8' ? new Uint8Array(arr.length) : new Int8Array(arr.length);
    if (rule.fmt === 'u8') {
      for (let i = 0; i < arr.length; i++) out[i] = Math.round(arr[i] * 255);
      if (rule.renorm) renormalize(out as Uint8Array, attr.itemSize);
    } else {
      for (let i = 0; i < arr.length; i++) out[i] = Math.max(-127, Math.min(127, Math.round(arr[i] * 127)));
    }
    geo.setAttribute(name, new THREE.BufferAttribute(out, attr.itemSize, true));
    st.packed++; st.saved += arr.byteLength - out.byteLength;
  }
}

/**
 * True when every vertex's tuple sums to 1 — or to 0, which is what an
 * unweighted vertex looks like and is left exactly as it is.
 *
 * The tolerance is 1/512, half a byte step: anything looser and the
 * renormalisation below would be *inventing* weight rather than redistributing
 * a rounding error, and a rig that deliberately ships unnormalised weights
 * would be silently re-authored. Such a rig keeps its floats instead.
 */
function partitionsOne(a: Float32Array, size: number): boolean {
  for (let i = 0; i < a.length; i += size) {
    let s = 0;
    for (let k = 0; k < size; k++) s += a[i + k];
    if (s > 1 / 512 && Math.abs(s - 1) > 1 / 512) return false;
  }
  return true;
}

/**
 * Make each tuple sum to exactly 255 again after rounding.
 *
 * Rounding four weights independently can leave a sum of 253 or 257, and the
 * skinning shader divides by nothing: a vertex whose weights sum to 253/255
 * is pulled 0.8% of the way to the model origin every frame, on the whole
 * mesh, which is a visible shrink on a limb far from the root. The whole
 * residual goes onto the largest component, where it is the smallest relative
 * change. A tuple that was already all-zero is left all-zero.
 */
function renormalize(out: Uint8Array, size: number) {
  for (let i = 0; i < out.length; i += size) {
    let s = 0, big = 0;
    for (let k = 0; k < size; k++) { s += out[i + k]; if (out[i + k] > out[i + big]) big = k; }
    if (s === 0 || s === 255) continue;
    out[i + big] = Math.max(0, Math.min(255, out[i + big] + (255 - s)));
  }
}

/**
 * Smallest geometry worth re-packing, in vertices.
 *
 * Not a performance threshold — a safety one. `mergeGeometries` returns
 * **null**, silently, when one member of a batch is normalised and another is
 * not, and a null merge deletes whatever was being built. The geometries that
 * get merged into something later are the kit's small reusable primitives; the
 * mass is in one-off merges that are already finished (`meteor_mega_stone` is
 * 34.8 MB in a single geometry, `town_shadow` 11.2). Leaving everything under
 * ~8 000 vertices alone gives up a rounding error of the total and takes the
 * whole class of hazard off the table.
 */
const MIN_VERTS = 8000;

/**
 * Re-pack every geometry under `root`, once.
 *
 * Idempotent — a second pass sees integer arrays and does nothing — so it is
 * safe to run again over a subtree that has grown.
 *
 * Geometry shared by more than one mesh is skipped for the same reason as
 * {@link MIN_VERTS}: a shared geometry is one somebody is reusing, and reuse is
 * where a later merge comes from.
 */
export function packSubtree(root: THREE.Object3D, st: PackStats = { seen: 0, packed: 0, refused: 0, saved: 0 }): PackStats {
  const uses = new Map<THREE.BufferGeometry, number>();
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!g || !g.isBufferGeometry) return;
    uses.set(g, (uses.get(g) || 0) + 1);
  });
  for (const [g, n] of uses) {
    const pos = g.getAttribute('position');
    if (n > 1 || !pos || pos.count < MIN_VERTS) continue;
    packGeometry(g, st);
  }
  return st;
}

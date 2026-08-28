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

/** Nothing outside this is repacked, and each name has its own target format. */
type Packable = 'color' | 'normal';

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
  for (const name of ['color', 'normal'] as Packable[]) {
    const attr = geo.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!attr || (attr as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) continue;
    if (geo.morphAttributes && geo.morphAttributes[name]) continue;
    const arr = attr.array;
    if (!(arr instanceof Float32Array)) continue;
    if (name === 'color') {
      // A tint the shader multiplies by. Anything over 1 is a deliberate
      // over-bright and `Uint8` would flatten it to white.
      if (!within(arr, 0, 1)) { st.refused++; continue; }
      const out = new Uint8Array(arr.length);
      for (let i = 0; i < arr.length; i++) out[i] = Math.round(arr[i] * 255);
      geo.setAttribute(name, new THREE.BufferAttribute(out, attr.itemSize, true));
      st.packed++; st.saved += arr.byteLength - out.byteLength;
    } else {
      // `Int8` normalised is `max(v / 127, -1)`, so a normal that is not unit
      // length is clipped rather than quantised. Check before, not after.
      if (!within(arr, -1, 1)) { st.refused++; continue; }
      const out = new Int8Array(arr.length);
      for (let i = 0; i < arr.length; i++) out[i] = Math.max(-127, Math.min(127, Math.round(arr[i] * 127)));
      geo.setAttribute(name, new THREE.BufferAttribute(out, attr.itemSize, true));
      st.packed++; st.saved += arr.byteLength - out.byteLength;
    }
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

import { N, FAR_N } from './Field.js';
import { Road } from './Road.js';
import { decodeQ16D, decodePlanes8, packContainer, unpackContainer, encodeQ16D, encodePlanes8 } from './FieldCodec.js';

/**
 * Load / store side of the baked heightfield.
 *
 * `encodeField` runs in the build step (`tools/bake.mjs`); `loadBakedField`
 * runs in the browser and is a pure optimisation — every failure path returns
 * `false` and the caller regenerates with the same generator that produced the
 * artifact in the first place.
 */

/** Where the build step drops the artifact, relative to the site root. */
export const BAKE_PATH = 'baked/terrain.bin.gz';

/**
 * Serialise the expensive half of a built `Field`.
 * @param {Field} field a field that has already had `build()` called
 * @param {object} meta extra header fields (seed, source hash)
 * @returns {Uint8Array} the uncompressed container
 */
export function encodeField(field, meta = {}) {
  const h = encodeQ16D(field.h, N, N);
  const far = encodeQ16D(field.far, FAR_N, FAR_N);
  const roadY = new Float32Array(field.roadSpline.points.map((p) => p.y));
  return packContainer({ ...meta, N, FAR_N }, [
    { name: 'h', kind: 'q16d', w: N, h: N, min: h.min, scale: h.scale, bytes: h.bytes },
    { name: 'far', kind: 'q16d', w: FAR_N, h: FAR_N, min: far.min, scale: far.scale, bytes: far.bytes },
    { name: 'ctrl', kind: 'planes8', w: N, h: N, ch: 4, bytes: encodePlanes8(field.ctrl, N, N, 4) },
    { name: 'farCtrl', kind: 'planes8', w: FAR_N, h: FAR_N, ch: 4, bytes: encodePlanes8(field.farCtrl, FAR_N, FAR_N, 4) },
    { name: 'roadY', kind: 'f32', bytes: new Uint8Array(roadY.buffer) },
  ]);
}

/**
 * Populate `field` from a container, replacing what `build()` would have done.
 * @param {Field} field a freshly constructed, unbuilt field
 * @param {Uint8Array} buf the uncompressed container
 */
export function applyBakedField(field, buf) {
  const c = unpackContainer(buf);
  const h = c.section('h'), far = c.section('far');
  const ctrl = c.section('ctrl'), farCtrl = c.section('farCtrl');
  const roadY = c.section('roadY');
  if (!h || !far || !ctrl || !farCtrl || !roadY) throw new Error('bake missing a section');

  field.h = decodeQ16D(h.bytes, h.w, h.h, h.min, h.scale);
  field.far = decodeQ16D(far.bytes, far.w, far.h, far.min, far.scale);
  field.ctrl = decodePlanes8(ctrl.bytes, ctrl.w, ctrl.h, ctrl.ch);
  field.farCtrl = decodePlanes8(farCtrl.bytes, farCtrl.w, farCtrl.h, farCtrl.ch);
  field.deriveNormals();

  // The spline geometry is a few hundred microseconds of Catmull-Rom; only the
  // fitted centreline elevation depends on the pre-carve terrain, so that is
  // the one part worth storing.
  const road = new Road();
  road._sampleSpline();
  const ys = new Float32Array(roadY.bytes.slice().buffer);
  for (let i = 0; i < road.points.length && i < ys.length; i++) road.points[i].y = ys[i];
  road._buildAccel();
  field.roadSpline = road;
  field.road = road;
  field.stats = { ...(field.stats || {}), baked: true };
}

/**
 * Fetch and apply the baked field if the build step produced one.
 *
 * The request is same-origin at a path our own Vite plugin serves — this is a
 * local cache read, not a network dependency, and the caller regenerates from
 * the generator when it misses.
 *
 * @param {Field} field
 * @returns {Promise<boolean>} true if the field is now populated
 */
export async function loadBakedField(field) {
  if (typeof fetch !== 'function' || typeof DecompressionStream !== 'function') return false;
  // `?nobake=1` forces the generator path, so the two can be A/B'd in one
  // session and a suspected bake bug can always be ruled out from the URL.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nobake')) return false;
  const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
  try {
    const res = await fetch(base + BAKE_PATH);
    if (!res.ok) return false;
    // Static servers that recognise `.gz` (vite dev and preview both do) send
    // `Content-Encoding: gzip` and the browser has already inflated the body by
    // the time we see it — inflating again would abort the stream. Only decode
    // in JS when the transfer was opaque.
    const encoded = (res.headers.get('content-encoding') || '').includes('gzip');
    const body = encoded ? res.body : res.body.pipeThrough(new DecompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(body).arrayBuffer());
    applyBakedField(field, buf);
    return true;
  } catch (e) {
    // A missing or stale artifact must never be fatal: the generator is still
    // the source of truth and is only slower, never different.
    if (typeof console !== 'undefined') console.info('[terrain] no baked field, generating:', e && e.message);
    return false;
  }
}

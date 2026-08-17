import { N, FAR_N } from './Field.js';
import { RoadNetwork } from './Road.js';
import {
  decodeF32Planes, decodePlanes8, encodeF32Planes, encodePlanes8, packContainer, unpackContainer,
} from './FieldCodec.js';

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
  const roadY = field.network.captureElevations();
  return packContainer({ ...meta, N, FAR_N }, [
    { name: 'h', kind: 'f32planes', n: N * N, bytes: encodeF32Planes(field.h) },
    { name: 'far', kind: 'f32planes', n: FAR_N * FAR_N, bytes: encodeF32Planes(field.far) },
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

  field.h = decodeF32Planes(h.bytes, h.n);
  field.far = decodeF32Planes(far.bytes, far.n);
  field.ctrl = decodePlanes8(ctrl.bytes, ctrl.w, ctrl.h, ctrl.ch);
  field.farCtrl = decodePlanes8(farCtrl.bytes, farCtrl.w, farCtrl.h, farCtrl.ch);
  field.deriveNormals();

  // The road graph rebuilds itself from `WorldMap` for free; only the solved
  // centreline elevations depend on the pre-carve terrain, so they are the one
  // part of `carve()` worth storing.
  const net = new RoadNetwork(field.map.roadGraph);
  net.restoreElevations(new Float32Array(roadY.bytes.slice().buffer));
  field.network = net;
  field.roadSpline = net.spine;
  field.road = net.spine;
  field.stats = { ...(field.stats || {}), baked: true, buildMs: 0 };
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

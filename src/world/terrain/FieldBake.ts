import { N, FAR_N } from './Field.ts';
import { RoadNetwork } from './Road.ts';
import { LAYER_COUNT } from './Layers.ts';
import {
  decodeF32Planes, decodePlanes8, encodeF32Planes, encodePlanes8, packContainer, unpackContainer,
} from './FieldCodec.ts';

/**
 * Load / store side of the baked heightfield.
 *
 * `encodeField` runs in the build step (`src/tools/bake.mjs`); `loadBakedField`
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
export function encodeField(field, meta = {}, layers = null) {
  const roadY = field.network.captureElevations();
  const sections = [
    { name: 'h', kind: 'f32planes', n: N * N, bytes: encodeF32Planes(field.h) },
    { name: 'far', kind: 'f32planes', n: FAR_N * FAR_N, bytes: encodeF32Planes(field.far) },
    { name: 'ctrl', kind: 'planes8', w: N, h: N, ch: 4, bytes: encodePlanes8(field.ctrl, N, N, 4) },
    { name: 'farCtrl', kind: 'planes8', w: FAR_N, h: FAR_N, ch: 4, bytes: encodePlanes8(field.farCtrl, FAR_N, FAR_N, 4) },
    { name: 'roadY', kind: 'f32', bytes: new Uint8Array(roadY.buffer) },
  ];
  if (layers) {
    const { size, detailSize, albedo, surf, detail } = layers;
    // Six PBR layers plus two detail maps, all synthesised per texel — about a
    // second of boot that is identical on every load.
    sections.push(
      { name: 'layerAlbedo', kind: 'planes8', w: size, h: size * LAYER_COUNT, ch: 4, bytes: encodePlanes8(albedo, size, size * LAYER_COUNT, 4) },
      { name: 'layerSurf', kind: 'planes8', w: size, h: size * LAYER_COUNT, ch: 4, bytes: encodePlanes8(surf, size, size * LAYER_COUNT, 4) },
      { name: 'layerDetail', kind: 'planes8', w: detailSize, h: detailSize * 2, ch: 4, bytes: encodePlanes8(detail, detailSize, detailSize * 2, 4) },
    );
    sections.push({ name: 'layerMeta', kind: 'json', bytes: new TextEncoder().encode(JSON.stringify({ size, detailSize })) });
  }
  return packContainer({ ...meta, N, FAR_N }, sections);
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
 * Decode the layer texels out of a container.
 * @returns {object|null} `buildLayerData`-shaped texels, or null if absent
 */
export function bakedLayers(buf) {
  const c = unpackContainer(buf);
  const meta = c.section('layerMeta');
  const a = c.section('layerAlbedo'), s = c.section('layerSurf'), d = c.section('layerDetail');
  if (!meta || !a || !s || !d) return null;
  const { size, detailSize } = JSON.parse(new TextDecoder().decode(meta.bytes));
  return {
    size,
    detailSize,
    albedo: decodePlanes8(a.bytes, a.w, a.h, a.ch),
    surf: decodePlanes8(s.bytes, s.w, s.h, s.ch),
    detail: decodePlanes8(d.bytes, d.w, d.h, d.ch),
  };
}

/**
 * Fetch the baked world artifact if the build step produced one.
 *
 * The request is same-origin at a path our own Vite plugin serves — this is a
 * local cache read, not a network dependency, and every caller regenerates from
 * the generator when it misses.
 *
 * @returns {Promise<{applyTo:(f:object)=>void, layers:()=>object|null}|null>}
 */
export async function loadBaked() {
  if (typeof fetch !== 'function' || typeof DecompressionStream !== 'function') return null;
  // `?nobake=1` forces the generator path, so the two can be A/B'd in one
  // session and a suspected bake bug can always be ruled out from the URL.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nobake')) return null;
  const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
  try {
    const res = await fetch(base + BAKE_PATH);
    if (!res.ok) return null;
    // Static servers that recognise `.gz` (vite dev and preview both do) send
    // `Content-Encoding: gzip` and the browser has already inflated the body by
    // the time we see it — inflating again would abort the stream. Only decode
    // in JS when the transfer was opaque.
    const encoded = (res.headers.get('content-encoding') || '').includes('gzip');
    const body = encoded ? res.body : res.body.pipeThrough(new DecompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(body).arrayBuffer());
    unpackContainer(buf);            // validates magic and format version
    return { applyTo: (f) => applyBakedField(f, buf), layers: () => bakedLayers(buf) };
  } catch (e) {
    // A missing or stale artifact must never be fatal: the generator is still
    // the source of truth and is only slower, never different.
    if (typeof console !== 'undefined') console.info('[terrain] no baked world, generating:', e && e.message);
    return null;
  }
}

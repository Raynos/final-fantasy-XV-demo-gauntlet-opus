import { N, FAR_N, HYD_N } from './Field.ts';
import { demoActive } from '../../engine/Device.ts';
import type { Field } from './Field.ts';
import { RoadNetwork } from './Road.ts';
import { LAYER_COUNT } from './Layers.ts';
import type { LayerData } from './Layers.ts';
import type { BakeMeta } from './FieldCodec.ts';
import type { BakeSection } from './FieldCodec.ts';
import {
  decodeF32Planes, decodePlanes8, sectionField, encodePlanes8, packContainer, unpackContainer,
  encodeQ16D, decodeQ16D,
} from './FieldCodec.ts';

/**
 * Load / store side of the baked heightfield.
 *
 * `encodeField` runs in the build step (`src/tools/bake.mts`); `loadBakedField`
 * runs in the browser and is a pure optimisation — every failure path returns
 * `false` and the caller regenerates with the same generator that produced the
 * artifact in the first place.
 */

/** Where the build step drops the artifact, relative to the site root. */
export const BAKE_PATH = 'baked/terrain.bin.gz';
/**
 * The six PBR layer textures, in a container of their own.
 *
 * 8.29 MB gz of 25.51, and **a `?q=low` page decodes every byte of it and
 * throws the result away.** `Terrain.init` picks a 256 layer size at low and
 * the bake is authored at 512, so `buildLayerTextures` takes the mismatch,
 * discards the baked texels and synthesises 256 ones instead — which is
 * exactly what it does when there are no baked layers at all. So a low page
 * paying for this file gets nothing whatsoever for the money.
 *
 * The split is at the file rather than at a section offset for the same reason
 * the texture tiers are: the container is one gzip member with its index at the
 * front, so there is no way to read part of it without inflating all of it, and
 * `Content-Encoding: gzip` defeats HTTP Range on most hosts anyway.
 */
export const LAYER_BAKE_PATH = 'baked/terrainl.bin.gz';

/**
 * The phone's heightfield container: same sections, **half-resolution splat**.
 *
 * `ctrl` is 8.34 MB of the 17.2, and it is the one big section that is not
 * geometry — it is per-texel layer weights, and nothing is seated against it.
 * Halving it is 8.34 -> 2.17 MB (3.8x) and moves no vertex, so `heightcheck`
 * and `driftcheck` cannot see it.
 *
 * Measured alternatives, both rejected:
 *  - **Image-encoding the whole container is WORSE than gzip.** Lossless WebP
 *    over every section came to 23.7 MB against gzip's 17.2, because a
 *    delta-coded height's low byte is noise and an image codec has nothing to
 *    find in it. (Lossy q90 reaches 9.2 MB and moves the ground, which is the
 *    one thing that must not move.)
 *  - **Coarser height quantisation is a poor lever**: 9.85 mm -> 4 cm buys
 *    5.59 -> 4.48 MB, 1.25x, for real precision against a 5 cm drift budget.
 *
 * `h` and `far` are therefore shipped whole, and the phone's terrain is ~10 MB
 * rather than 17.2. Getting `h` down as well means a 1024 field, which means
 * re-baking every POI compound against it — a second geometry bake, and the
 * next thing on the list rather than a thing to sneak in here.
 */
export const FIELD_BAKE_PATH_M = 'baked/m/terrain.bin.gz';

/**
 * Serialise the expensive half of a built `Field`.
 * @param field a field that has already had `build()` called
 * @param meta extra header fields (seed, source hash)
 * @returns the uncompressed container
 */
export function encodeField(field: Field, meta: BakeMeta = {}, layers: LayerData | null = null): Uint8Array {
  const roadY = field.network.captureElevations();
  /**
   * The two float grids are the two most expensive sections in the container —
   * `h` is 11.98 MB gzipped and `far` 2.94, of a 33.2 MB artifact that a first
   * visit waits for before its first frame — and they are the two that gzip can
   * do least with. A noisy heightfield's f32 mantissa is close to random bits,
   * and most of those bits describe distances no player can stand on: the field
   * spans -48.1 m to 597.2 m, so sixteen bits over its own range is a step of
   * 9.85 mm and a worst-case error of **4.9 mm**. Delta-coding along rows then
   * turns a smooth surface into small numbers, which is what gzip is good at.
   *
   * Measured on the live artifact: `h` 11.98 -> 5.59 MB, `far` 2.94 -> 1.64,
   * so 7.7 MB comes off every first visit for half a centimetre of height.
   *
   * `encodeQ16D`/`decodeQ16D` and the `min`/`scale` header fields have been in
   * `FieldCodec` since the container was written and nothing had ever called
   * them; this is the first caller. `applyBakedField` still reads `f32planes`,
   * so a container written before this is decoded rather than rejected.
   */
  const hq = encodeQ16D(field.h, N, N);
  const farq = encodeQ16D(field.far, FAR_N, FAR_N);
  const sections = [
    { name: 'h', kind: 'q16d', n: N * N, w: N, h: N, min: hq.min, scale: hq.scale, bytes: hq.bytes },
    { name: 'far', kind: 'q16d', n: FAR_N * FAR_N, w: FAR_N, h: FAR_N, min: farq.min, scale: farq.scale, bytes: farq.bytes },
    { name: 'ctrl', kind: 'planes8', w: N, h: N, ch: 4, bytes: encodePlanes8(field.ctrl, N, N, 4) },
    { name: 'farCtrl', kind: 'planes8', w: FAR_N, h: FAR_N, ch: 4, bytes: encodePlanes8(field.farCtrl, FAR_N, FAR_N, 4) },
    // The erosion pass's own outputs, for placement rather than for the splat.
    // A megabyte raw, and the alternative is re-running 620 000 droplets in the
    // browser purely to find out where the water went.
    { name: 'hydro', kind: 'planes8', w: HYD_N, h: HYD_N, ch: 4, bytes: encodePlanes8(field.hydro, HYD_N, HYD_N, 4) },
    { name: 'roadY', kind: 'f32', bytes: new Uint8Array(roadY.buffer) },
  ];
  return packContainer({ ...meta, N, FAR_N }, sections);
}

/**
 * The same field container with the splat sections halved, for the phone.
 *
 * `ctrl` alone is 8.34 MB gz of a 17.2 MB file and it is the one large section
 * that is not geometry — nothing is seated against a layer weight — so halving
 * it is 3.8x that `heightcheck` and `driftcheck` cannot see. `h` and `far` are
 * shipped whole for exactly that reason: they ARE the ground.
 */
export function encodeFieldMobile(field: Field, meta: BakeMeta = {}): Uint8Array {
  const roadY = field.network.captureElevations();
  const hq = encodeQ16D(field.h, N, N);
  const farq = encodeQ16D(field.far, FAR_N, FAR_N);
  const ctrl = halvePlanes(encodePlanes8(field.ctrl, N, N, 4), N, N, 4);
  const farCtrl = halvePlanes(encodePlanes8(field.farCtrl, FAR_N, FAR_N, 4), FAR_N, FAR_N, 4);
  return packContainer({ ...meta, N, FAR_N }, [
    { name: 'h', kind: 'q16d', n: N * N, w: N, h: N, min: hq.min, scale: hq.scale, bytes: hq.bytes },
    { name: 'far', kind: 'q16d', n: FAR_N * FAR_N, w: FAR_N, h: FAR_N, min: farq.min, scale: farq.scale, bytes: farq.bytes },
    { name: 'ctrl', kind: 'planes8', w: ctrl.w, h: ctrl.h, ch: 4, bytes: ctrl.bytes },
    { name: 'farCtrl', kind: 'planes8', w: farCtrl.w, h: farCtrl.h, ch: 4, bytes: farCtrl.bytes },
    // Hydro is 0.78 MB and is read for placement, not drawn — left whole.
    { name: 'hydro', kind: 'planes8', w: HYD_N, h: HYD_N, ch: 4, bytes: encodePlanes8(field.hydro, HYD_N, HYD_N, 4) },
    { name: 'roadY', kind: 'f32', bytes: new Uint8Array(roadY.buffer) },
  ]);
}

/**
 * Pack the layer texels into their own container. Build step only.
 *
 * One bake, two files, the same source hash and the same stamp — the split is
 * about *who fetches it*, not about what it is. See {@link LAYER_BAKE_PATH}.
 */
/**
 * Halve a `planes8` plane block, point-sampled. Build step only.
 *
 * Point rather than averaged because these are layer *weights*: averaging two
 * neighbouring splats invents a blend the generator never produced, and the
 * material reads it as a third surface that does not exist.
 */
export function halvePlanes(src: Uint8Array, w: number, h: number, ch: number): { bytes: Uint8Array, w: number, h: number } {
  const hw = w >> 1, hh = h >> 1;
  const out = new Uint8Array(hw * hh * ch);
  for (let c = 0; c < ch; c++) {
    const sp = c * w * h, dp = c * hw * hh;
    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < hw; x++) out[dp + y * hw + x] = src[sp + (y * 2) * w + x * 2];
    }
  }
  return { bytes: out, w: hw, h: hh };
}

export function encodeLayers(layers: LayerData, meta: BakeMeta = {}): Uint8Array {
  const { size, detailSize, albedo, surf, detail } = layers;
  // Six PBR layers plus two detail maps, all synthesised per texel — about a
  // second of boot that is identical on every load.
  return packContainer(meta, [
    { name: 'layerAlbedo', kind: 'planes8', w: size, h: size * LAYER_COUNT, ch: 4, bytes: encodePlanes8(albedo, size, size * LAYER_COUNT, 4) },
    { name: 'layerSurf', kind: 'planes8', w: size, h: size * LAYER_COUNT, ch: 4, bytes: encodePlanes8(surf, size, size * LAYER_COUNT, 4) },
    { name: 'layerDetail', kind: 'planes8', w: detailSize, h: detailSize * 2, ch: 4, bytes: encodePlanes8(detail, detailSize, detailSize * 2, 4) },
    { name: 'layerMeta', kind: 'json', bytes: new TextEncoder().encode(JSON.stringify({ size, detailSize })) },
  ]);
}

/**
 * A quantisation parameter the section kind guarantees.
 *
 * `sectionField` covers the geometry fields; these two are the `q16d` pair, and
 * decoding an `undefined` step would silently produce a flat NaN heightfield
 * rather than an error anybody could read.
 */
function q16Field(s: BakeSection, key: 'min' | 'scale'): number {
  const v: number | undefined = s[key];
  if (typeof v !== 'number') throw new Error(`bake: section '${s.name}' has no ${key}`);
  return v;
}

/**
 * A float grid, in whichever of the two encodings the container used.
 *
 * `q16d` is what {@link encodeField} writes now; `f32planes` is what every
 * container written before it holds. Reading both is four lines and means a
 * cache from either side of the change decodes instead of being thrown away —
 * the artifact is 33 MB and re-baking it is forty seconds of somebody's commit.
 */
function floatGrid(s: BakeSection): Float32Array {
  if (s.kind === 'q16d') {
    return decodeQ16D(s.bytes, sectionField(s, 'w'), sectionField(s, 'h'),
      q16Field(s, 'min'), q16Field(s, 'scale'));
  }
  return decodeF32Planes(s.bytes, sectionField(s, 'n'));
}

/**
 * Populate `field` from a container, replacing what `build()` would have done.
 * @param field a freshly constructed, unbuilt field
 * @param buf the uncompressed container
 */
export function applyBakedField(field: Field, buf: Uint8Array) {
  const c = unpackContainer(buf);
  const h = c.section('h'), far = c.section('far');
  const ctrl = c.section('ctrl'), farCtrl = c.section('farCtrl');
  const roadY = c.section('roadY'), hydro = c.section('hydro');
  if (!h || !far || !ctrl || !farCtrl || !roadY || !hydro) throw new Error('bake missing a section');

  field.h = floatGrid(h);
  field.far = floatGrid(far);
  field.ctrl = fitPlanes(ctrl, N);
  field.farCtrl = decodePlanes8(farCtrl.bytes, sectionField(farCtrl, 'w'), sectionField(farCtrl, 'h'), sectionField(farCtrl, 'ch'));
  field.hydro = decodePlanes8(hydro.bytes, sectionField(hydro, 'w'), sectionField(hydro, 'h'), sectionField(hydro, 'ch'));
  field.deriveNormals();

  // The road graph rebuilds itself from `WorldMap` for free; only the solved
  // centreline elevations depend on the pre-carve terrain, so they are the one
  // part of `carve()` worth storing.
  const net = new RoadNetwork(field.map.roadGraph);
  net.restoreElevations(new Float32Array(roadY.bytes.slice().buffer));
  field.network = net;
  field.roadSpline = net.spine;
  // `field.road` used to be set here too. `Field` declared it, this was the
  // only writer, and nothing in the tree ever read it -- `Terrain.road` comes
  // from `field.roadSpline`. Removed with the declaration.
  field.stats = { ...(field.stats || {}), baked: true, buildMs: 0 };
}

/**
 * Decode a `planes8` section, expanding it if it was baked at a lower
 * resolution than the field it has to fill.
 *
 * The phone's container ships `ctrl` at N/2 and every consumer — the shader's
 * `DataTexture` and `Field.ctrlAt`'s CPU sampling — indexes it at N. Rather
 * than teach both a second resolution, the expand happens once here, at load,
 * and nothing downstream can tell. Nearest-neighbour on purpose: these are
 * layer *weights*, and interpolating them invents blends the generator never
 * produced.
 */
function fitPlanes(sec: BakeSection, n: number): Uint8Array {
  const w = sectionField(sec, 'w'), h = sectionField(sec, 'h'), ch = sectionField(sec, 'ch');
  const src = decodePlanes8(sec.bytes, w, h, ch);
  if (w === n && h === n) return src;
  const out = new Uint8Array(n * n * 4);
  const sx = w / n, sy = h / n;
  for (let y = 0; y < n; y++) {
    const v = Math.min(h - 1, (y * sy) | 0) * w;
    for (let x = 0; x < n; x++) {
      const s = (v + Math.min(w - 1, (x * sx) | 0)) * 4, d = (y * n + x) * 4;
      out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = src[s + 3];
    }
  }
  return out;
}

/**
 * Decode the layer texels out of a container.
 * @returns `buildLayerData`-shaped texels, or null if absent
 */
export function bakedLayers(buf: Uint8Array): LayerData | null {
  const c = unpackContainer(buf);
  const meta = c.section('layerMeta');
  const a = c.section('layerAlbedo'), s = c.section('layerSurf'), d = c.section('layerDetail');
  if (!meta || !a || !s || !d) return null;
  const { size, detailSize } = JSON.parse(new TextDecoder().decode(meta.bytes));
  return {
    size,
    detailSize,
    albedo: decodePlanes8(a.bytes, sectionField(a, 'w'), sectionField(a, 'h'), sectionField(a, 'ch')),
    surf: decodePlanes8(s.bytes, sectionField(s, 'w'), sectionField(s, 'h'), sectionField(s, 'ch')),
    detail: decodePlanes8(d.bytes, sectionField(d, 'w'), sectionField(d, 'h'), sectionField(d, 'ch')),
  };
}

/**
 * Fetch the baked world artifact if the build step produced one.
 *
 * The request is same-origin at a path our own Vite plugin serves — this is a
 * local cache read, not a network dependency, and every caller regenerates from
 * the generator when it misses.
 *
 */
/** Fetch and inflate one container, or null. Shared by the two halves. */
async function fetchContainer(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const encoded = (res.headers.get('content-encoding') || '').includes('gzip');
    const body = encoded ? res.body : res.body!.pipeThrough(new DecompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(body).arrayBuffer());
    unpackContainer(buf);
    return buf;
  } catch { return null; }
}

export async function loadBaked(wantLayers = true): Promise<{applyTo: (f: Field) => void, layers: () => LayerData | null} | null> {
  if (typeof fetch !== 'function' || typeof DecompressionStream !== 'function') return null;
  // `?nobake=1` forces the generator path, so the two can be A/B'd in one
  // session and a suspected bake bug can always be ruled out from the URL.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nobake')) return null;
  const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
  try {
    // One build, two data sets: the phone asks for the half-splat container and
    // a 404 falls through to the generator, same as any other cache miss.
    const res = await fetch(base + (demoActive() ? FIELD_BAKE_PATH_M : BAKE_PATH));
    if (!res.ok) return null;
    // Static servers that recognise `.gz` (vite dev and preview both do) send
    // `Content-Encoding: gzip` and the browser has already inflated the body by
    // the time we see it — inflating again would abort the stream. Only decode
    // in JS when the transfer was opaque.
    const encoded = (res.headers.get('content-encoding') || '').includes('gzip');
    const body = encoded ? res.body : res.body!.pipeThrough(new DecompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(body).arrayBuffer());
    unpackContainer(buf);            // validates magic and format version
    // The layer container is fetched only when the caller can use it. Its
    // absence is the same as any other cache miss — `buildLayerTextures`
    // synthesises instead — which is precisely what a `?q=low` page already
    // did with these bytes after paying for them.
    const layerBuf = wantLayers ? await fetchContainer(base + LAYER_BAKE_PATH) : null;
    return { applyTo: (f) => applyBakedField(f, buf), layers: () => (layerBuf ? bakedLayers(layerBuf) : null) };
  } catch (e: unknown) {
    // A missing or stale artifact must never be fatal: the generator is still
    // the source of truth and is only slower, never different.
    if (typeof console !== 'undefined') console.info('[terrain] no baked world, generating:', e instanceof Error ? e.message : e);
    return null;
  }
}

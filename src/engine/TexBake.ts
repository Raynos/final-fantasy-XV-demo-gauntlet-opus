import * as THREE from 'three';
import { makeTexture, makeDataMap, normalFromHeight } from '../util/TextureGen.ts';
import type { TexelFn, ScalarFn, HeightFn, TextureOpts } from '../util/TextureGen.ts';
import { encodePlanes8, decodePlanes8 } from '../world/terrain/FieldCodec.ts';

/**
 * Baked procedural textures.
 *
 * `src/public/baked/terrain.bin.gz` already caches the terrain field, and the
 * measured reason a warm page load was only 0.7 s faster than a cold one is
 * that *nothing else* was cached: every one of the 195 `DataTexture`s the world
 * holds was re-synthesised, texel by texel, on every load. `townMaterials()`
 * alone measured **1,393 ms** for 30 materials and 27 MB of texels, and it
 * produces the same bytes every time.
 *
 * So the same trick is applied one level up. A generator wrapped in
 * {@link bakedTexture} is keyed; `src/tools/texbake.mts` runs the same
 * generators under Node at build time and writes the bytes to
 * `src/public/baked/tex.bin.gz`; the browser inflates that once and hands the
 * bytes straight to a `DataTexture`.
 *
 * Three properties this shares with the terrain bake, deliberately:
 *
 *   - **Every failure path regenerates.** A missing, stale or corrupt artifact
 *     costs the boot time it used to cost and nothing else. `?nobake=1` forces
 *     the generator path so a suspected bake bug can be ruled out from the URL.
 *   - **Freshness is a content hash of the generator sources**, so editing
 *     `TownMaterials.ts` re-bakes instead of quietly serving stale texels.
 *   - **It is a cache of our own generators, not an asset.** `BRIEF.md`'s "no
 *     binary assets" rule is about *inputs*; this has no input that is not in
 *     the repo as code.
 *
 * Keys are namespaced `system/material/map` — `town/hh_tarmac/normal`. A key
 * collision would serve one material's texels to another, so they are checked
 * at bake time and a duplicate is a hard error there.
 */

/** Container magic. Bump the version whenever the layout below changes. */
const MAGIC = 'EOSTEX01';
export const TEX_BAKE_VERSION = 1;
/** Where the build step drops the artifact, relative to the site root. */
export const TEX_BAKE_PATH = 'baked/tex.bin.gz';

/** One texture's bytes in the container. */
export interface TexEntry {
  k: string;
  w: number;
  h: number;
  /** Byte offset into the body. */
  off: number;
}

interface TexHeader {
  version: number;
  hash: string;
  entries: TexEntry[];
}

/**
 * The inflated container and where each key's planes live in it.
 *
 * Decoding is deferred to the lookup and the entry is dropped from the index
 * once served, so the only texels resident at any moment are the ones a live
 * `DataTexture` owns plus the ones nothing has asked for yet. That second set
 * is not waste: the dungeon interiors are built on first `enter()`, long after
 * boot, and they are the reason this is not simply freed when `init()` ends.
 */
let store: { buf: Uint8Array, index: Map<string, TexEntry> } | null = null;
/** Filled instead of `store` when the bake tool is driving. */
let recorder: Map<string, { w: number, h: number, data: Uint8Array }> | null = null;
let loading: Promise<boolean> | null = null;

/**
 * Collect every generated texture instead of reading the cache.
 * Called by `src/tools/texbake.mts` before it imports any material module.
 */
export function beginRecording() {
  recorder = new Map();
  store = null;
}

/** @returns what {@link beginRecording} has collected so far */
export function recorded() {
  return recorder;
}

/**
 * Pack recorded textures into the container. Build step only.
 * @param hash content hash of the generator sources, for freshness
 */
export function encodeTexBake(hash: string): Uint8Array {
  if (!recorder) throw new Error('[texbake] nothing recorded');
  const entries: TexEntry[] = [];
  let off = 0;
  const bodies: Uint8Array[] = [];
  for (const [k, { w, h, data }] of recorder) {
    // Split RGBA into four byte planes before compressing. Interleaved noise
    // defeats gzip's window; per-channel planes of the same noise do not.
    const planes = encodePlanes8(data, w, h, 4);
    entries.push({ k, w, h, off });
    bodies.push(planes);
    off += planes.length;
  }
  const header = JSON.stringify({ version: TEX_BAKE_VERSION, hash, entries } satisfies TexHeader);
  const hb = new TextEncoder().encode(header);
  const out = new Uint8Array(8 + 4 + hb.length + off);
  for (let i = 0; i < 8; i++) out[i] = MAGIC.charCodeAt(i);
  new DataView(out.buffer).setUint32(8, hb.length, true);
  out.set(hb, 12);
  let p = 12 + hb.length;
  for (const b of bodies) { out.set(b, p); p += b.length; }
  return out;
}

/** Parse a container into {@link store}. @returns false if it is not one */
function decodeTexBake(buf: Uint8Array, hash: string | null): boolean {
  if (buf.length < 12) return false;
  for (let i = 0; i < 8; i++) if (buf[i] !== MAGIC.charCodeAt(i)) return false;
  const hlen = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(8, true);
  const header: TexHeader = JSON.parse(new TextDecoder().decode(buf.subarray(12, 12 + hlen)));
  if (header.version !== TEX_BAKE_VERSION) return false;
  if (hash && header.hash !== hash) return false;
  const body = 12 + hlen;
  const index = new Map<string, TexEntry>();
  for (const e of header.entries) index.set(e.k, { ...e, off: body + e.off });
  store = { buf, index };
  return true;
}

/**
 * Fetch and inflate the artifact. Idempotent, and safe to call from several
 * systems' `init()` — the first call does the work and the rest await it.
 *
 * Kicked off at module evaluation (below) so the transfer overlaps whatever
 * the systems ahead of the first consumer are doing.
 *
 * @returns true when the cache is live
 */
export function loadTexBake(): Promise<boolean> {
  if (loading) return loading;
  loading = (async () => {
    if (recorder) return false;
    if (typeof fetch !== 'function' || typeof DecompressionStream !== 'function') return false;
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nobake')) return false;
    const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
    try {
      const res = await fetch(base + TEX_BAKE_PATH);
      if (!res.ok) return false;
      // vite dev and preview both recognise `.gz` and send `Content-Encoding:
      // gzip`, in which case the body is already inflated; inflating again
      // aborts the stream. Only decode in JS when the transfer was opaque.
      const encoded = (res.headers.get('content-encoding') || '').includes('gzip');
      const body = encoded ? res.body : res.body!.pipeThrough(new DecompressionStream('gzip'));
      const buf = new Uint8Array(await new Response(body).arrayBuffer());
      return decodeTexBake(buf, null);
    } catch {
      return false;
    }
  })();
  return loading;
}

/** True once a usable cache is resident. */
export function texBakeReady(): boolean { return store !== null; }

/** Apply the settings `makeTexture` would have applied, to a cache hit. */
function dress(tex: THREE.DataTexture, {
  colorSpace = THREE.SRGBColorSpace, repeat = 1, anisotropy = 16, generateMipmaps = true,
}: TextureOpts) {
  tex.colorSpace = colorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = generateMipmaps;
  tex.minFilter = generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The cache lookup shared by all three wrappers.
 * @param key namespaced cache key, `system/material/map`
 * @param size edge length in texels
 * @param gen builds the texture the slow way
 */
function cached(key: string, size: number, opts: TextureOpts, gen: () => THREE.DataTexture): THREE.Texture {
  const hit = store && store.index.get(key);
  if (hit && hit.w === size && hit.h === size) {
    store!.index.delete(key);
    const n = size * size * 4;
    const data = decodePlanes8(store!.buf.subarray(hit.off, hit.off + n), size, size, 4);
    return dress(new THREE.DataTexture(data, size, size, THREE.RGBAFormat), opts);
  }
  const tex = gen();
  if (recorder) {
    if (recorder.has(key)) throw new Error(`[texbake] duplicate key ${key}`);
    const img = tex.image as { data: Uint8Array, width: number, height: number };
    recorder.set(key, { w: img.width, h: img.height, data: img.data });
  }
  return tex;
}

/** {@link makeTexture}, served from the bake when one is resident. */
export function bakedTexture(key: string, size: number, fn: TexelFn, opts: TextureOpts = {}): THREE.Texture {
  return cached(key, size, opts, () => makeTexture(size, fn, opts));
}

/** {@link makeDataMap}, served from the bake when one is resident. */
export function bakedDataMap(key: string, size: number, fn: ScalarFn, opts: TextureOpts = {}): THREE.Texture {
  return cached(key, size, { colorSpace: THREE.NoColorSpace, ...opts }, () => makeDataMap(size, fn, opts));
}

/** {@link normalFromHeight}, served from the bake when one is resident. */
export function bakedNormal(key: string, size: number, height: HeightFn, strength = 2.0, opts: TextureOpts = {}): THREE.Texture {
  return cached(key, size, { colorSpace: THREE.NoColorSpace, ...opts }, () => normalFromHeight(size, height, strength, opts));
}

// Start the transfer as early as the module graph allows: the first consumer
// is `Props.init()`, seven systems into the boot order, so on a warm disk the
// inflate is finished before anything asks.
if (typeof window !== 'undefined') void loadTexBake();

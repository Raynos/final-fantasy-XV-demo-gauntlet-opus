import * as THREE from 'three';
import { makeTexture, makeDataMap, normalFromHeight, dropTexelsAfterUpload } from '../util/TextureGen.ts';
import type { TexelFn, ScalarFn, HeightFn, TextureOpts } from '../util/TextureGen.ts';
import { encodePlanes8, decodePlanes8 } from '../world/terrain/FieldCodec.ts';
import { demoActive } from './Device.ts';

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
/**
 * Where the build step drops the artifacts, relative to the site root.
 *
 * Two, not one, and the split is not cosmetic. `tex.bin.gz` holds the textures
 * `src/tools/texbake.mts` can compute under Node — pure per-texel functions,
 * baked in seven seconds with no browser. `texc.bin.gz` holds the ones that are
 * *drawn*: the painted faces, whose generator uses a real 2D canvas, whose mip
 * chain is hand-built by `contrastMips`, and which therefore only exist inside
 * a browser. That one is baked by `--canvas`, which boots the page.
 *
 * They are separate files with separate source hashes because they have
 * separate costs: the Node bake can run from the vite plugin on every server
 * start, and the browser bake cannot — it needs the server that is starting.
 */
export const TEX_BAKE_PATH = 'baked/tex.bin.gz';
export const TEX_CANVAS_PATH = 'baked/texc.bin.gz';
/**
 * The canvas bake's phone tier: `face/npc/*`, 13.76 MB of painted townsfolk.
 *
 * The same rule as {@link TEX_PHONE_PATH} and for the same reason — a desktop
 * builds all nine of Hammerhead's people during `Npcs.init`, a phone builds
 * them when the deferred town does. `face/hero/*` (6.76 MB, the party) stays
 * in the boot tier under every condition: they are in the first pixel.
 */
export const TEX_CANVAS_PHONE_PATH = 'baked/texcp.bin.gz';
/**
 * The third file, and the only one the first frame does not wait for.
 *
 * `dgn/*` is 36 entries, 17.3 MB inflated and **6.8 MB on the wire** — a fifth
 * of `tex.bin.gz` — and not one of its texels is read until the player first
 * walks into a cave. `Dungeons.init()` nevertheless awaits `loadTexBake()` at
 * boot, so before this split those 6.8 MB were in front of every first frame for
 * a room nobody had entered.
 *
 * Same container format, same source hash, written by the same `texbake` run:
 * it is one bake split across two files, not a second bake. The split is at the
 * file, not at an HTTP Range, because a container is a single gzip member with
 * its index at the front — there is no way to read the index without inflating
 * all of it, and `Content-Encoding: gzip` defeats Range on most hosts anyway.
 */
export const TEX_DEFERRED_PATH = 'baked/texd.bin.gz';
/** Keys that live in {@link TEX_DEFERRED_PATH} rather than in the boot tier. */
export const isDeferredKey = (k: string): boolean => k.startsWith('dgn/');

/**
 * The third tier: **deferred on a phone, boot on a desktop.**
 *
 * `dgn/*` above is deferred for everybody, because nothing reads it until the
 * player walks into a cave. These keys are different — a desktop genuinely
 * wants them in the first frame:
 *
 * | prefix | gz | who reads it at boot |
 * |---|---|---|
 * | `map/*`  | 6.27 MB | `Minimap.init` -> `getChart(terrain)`, the 2048 chart |
 * | `town/*` | 5.76 MB | `Hammerhead.init`, 576 m from spawn |
 *
 * So the tier is not a statement about *what* the bytes are, it is a statement
 * about *when* a given page needs them, and the two pages disagree. Putting
 * them in `texd` instead would have moved 6.8 MB of dungeon back in front of
 * the desktop's first frame, which is the opposite of what that split is for.
 *
 * `loadTexBake` pulls this at boot unless the demo is active; the post-first-
 * frame kick pulls it when the demo *is* active. Net effect: the default
 * page's first-frame byte count is unchanged to the byte, one extra request.
 */
export const TEX_PHONE_PATH = 'baked/texp.bin.gz';
/** Keys that live in {@link TEX_PHONE_PATH}. */
export const isPhoneDeferredKey = (k: string): boolean =>
  k.startsWith('map/') || k.startsWith('town/') || k.startsWith('face/npc/');

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
 * once served. **That alone frees nothing** — every entry holds `buf`, the
 * whole inflated container — which is why {@link compactTexBake} exists and is
 * called once the boot-path consumers have run. After it, the only texels
 * resident are the ones a live `DataTexture` owns plus the ones nothing has
 * asked for yet. That second set is not waste: the dungeon interiors are built
 * on first `enter()`, long after boot, and they are the reason this is
 * compacted rather than simply freed when `init()` ends.
 */
let store: { index: Map<string, TexEntry & { buf: Uint8Array }> } | null = null;
/** Filled instead of `store` when the bake tool is driving. */
let recorder: Map<string, { w: number, h: number, data: Uint8Array }> | null = null;
/**
 * When set, only textures produced by {@link bakedCanvasMips} are recorded.
 *
 * The browser bake boots the whole game, so without this it would re-record
 * every material texture `src/tools/texbake.mts` had already baked under Node
 * and ship a second copy of them — 27 MB of duplicate transfer on every page
 * load, for nothing.
 */
let recordDrawnOnly = false;
let loading: Promise<boolean> | null = null;
let deferredLoading: Promise<boolean> | null = null;

/**
 * Collect every generated texture instead of reading the cache.
 * Called by `src/tools/texbake.mts` before it imports any material module.
 */
export function beginRecording({ drawnOnly = false } = {}) {
  recorder = new Map();
  recordDrawnOnly = drawnOnly;
  store = null;
}

/** @returns what {@link beginRecording} has collected so far */
export function recorded() {
  return recorder;
}

/**
 * Pack recorded textures into the container. Build step only.
 * @param hash content hash of the generator sources, for freshness
 * @param keep which keys go in this file — one recording, two containers
 */
export function encodeTexBake(hash: string, keep: (key: string) => boolean = () => true): Uint8Array {
  if (!recorder) throw new Error('[texbake] nothing recorded');
  const entries: TexEntry[] = [];
  let off = 0;
  const bodies: Uint8Array[] = [];
  for (const [k, { w, h, data }] of recorder) {
    if (!keep(k)) continue;
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
  if (!store) store = { index: new Map() };
  for (const e of header.entries) store.index.set(e.k, { ...e, off: body + e.off, buf });
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
  // Both boot artifacts, in parallel, and a missing one is not an error: the
  // canvas half is baked by a separate opt-in command and is routinely absent
  // on a fresh clone. `texd` is NOT here — see {@link loadDeferredTexBake}.
  const boot = [TEX_BAKE_PATH, TEX_CANVAS_PATH];
  // The phone tier is a boot artifact on every page but the demo, where the
  // three consumers that read it have a lazy path and the bytes go after the
  // first frame instead.
  if (!demoActive()) boot.push(TEX_PHONE_PATH, TEX_CANVAS_PHONE_PATH);
  loading = fetchContainers(boot);
  return loading;
}

/**
 * Fetch the tier the first frame does not wait for.
 *
 * Kicked off past the first presented frame (below), so its bytes are not
 * charged to the first visit. Every key in it is a clean cache miss until it
 * lands, and a miss is not a failure — it is the generator, which is what
 * produced these bytes in the first place and is only slower. So the worst case
 * for a player who walks into a cave inside the first second of the session is
 * the boot this had before the cache existed, for that room only.
 *
 * @returns true when the deferred tier is resident
 */
export function loadDeferredTexBake(): Promise<boolean> {
  if (deferredLoading) return deferredLoading;
  deferredLoading = fetchContainers(demoActive()
    ? [TEX_DEFERRED_PATH, TEX_PHONE_PATH, TEX_CANVAS_PHONE_PATH]
    : [TEX_DEFERRED_PATH]);
  return deferredLoading;
}

/** Fetch, inflate and index a set of containers. @returns true if any decoded */
async function fetchContainers(paths: string[]): Promise<boolean> {
  if (recorder) return false;
  if (typeof fetch !== 'function' || typeof DecompressionStream !== 'function') return false;
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nobake')) return false;
  const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
  const got = await Promise.all(paths.map(async (path) => {
    try {
      const res = await fetch(base + path);
      if (!res.ok) return false;
      // vite dev and preview both recognise `.gz` and send `Content-Encoding:
      // gzip`, in which case the body is already inflated; inflating again
      // aborts the stream. Only decode in JS when the transfer was opaque.
      const encoded = (res.headers.get('content-encoding') || '').includes('gzip');
      const body = encoded ? res.body : res.body!.pipeThrough(new DecompressionStream('gzip'));
      return decodeTexBake(new Uint8Array(await new Response(body).arrayBuffer()), null);
    } catch {
      return false;
    }
  }));
  return got.some(Boolean);
}

/** True once a usable cache is resident. */
export function texBakeReady(): boolean { return store !== null; }

/**
 * Copy the unserved entries out of the shared containers and drop the containers.
 *
 * **Dropping an entry from the index does not free a byte, and that is the
 * whole defect.** Every entry carries `buf` — the *entire* inflated container —
 * so `take`'s `index.delete` only stops a second lookup; the 67.3 MB of
 * `tex.bin.gz` and the 67.1 MB of `texc.bin.gz` stay reachable through whatever
 * entry is still in the index. `GeoBake` gets away with the same shape because
 * its index does empty on the boot path (`GeoBake.ts:345` nulls the store when
 * it does, and `releaseGeoBake()` catches the leftovers); this index **never**
 * empties, because the 17.3 MB of `dgn/*` keys belong to interiors that are
 * built on first `Dungeons.enter()`, long after boot. So the resident set after
 * boot is not "the entries nothing has asked for yet" as the docstring above
 * says it is — it is *both containers, whole*, for the life of the session.
 *
 * The fix is a compaction, not a release: give each surviving entry its own
 * buffer and let the two big ones become garbage. **There is no such thing as
 * calling this too early.** No key is dropped, no lookup can miss afterwards,
 * and the interiors still read from the cache; calling it before a consumer has
 * run only means copying a few more bytes than necessary. That is deliberately
 * the opposite trade from `releaseGeoBake()`, where one system too early is a
 * silent cache miss.
 *
 * @returns bytes still held after the copy — the unserved entries, no container
 */
export function compactTexBake(): number {
  if (!store) return 0;
  let held = 0;
  for (const [k, e] of store.index) {
    const len = e.w * e.h * 4;
    // `slice`, not `subarray`: a view would keep the container alive, which is
    // the entire bug being fixed here.
    store.index.set(k, { k: e.k, w: e.w, h: e.h, off: 0, buf: e.buf.slice(e.off, e.off + len) });
    held += len;
  }
  if (!store.index.size) store = null;
  return held;
}

/** Apply the settings `makeTexture` would have applied, to a cache hit. */
function dress(tex: THREE.DataTexture, {
  colorSpace = THREE.SRGBColorSpace, repeat = 1, anisotropy = 16, generateMipmaps = true,
  keepTexels = false,
}: TextureOpts) {
  tex.colorSpace = colorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = generateMipmaps;
  tex.minFilter = generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  // Same trade as the generator path: the texels the container just handed over
  // are dead the instant the GPU has them. See `dropTexelsAfterUpload`.
  return keepTexels ? tex : dropTexelsAfterUpload(tex);
}

/**
 * The cache lookup shared by all three wrappers.
 * @param key namespaced cache key, `system/material/map`
 * @param size edge length in texels
 * @param gen builds the texture the slow way
 */
function cached(key: string, size: number, opts: TextureOpts, gen: () => THREE.DataTexture): THREE.Texture {
  const hit = take(key, size, size);
  if (hit) return dress(new THREE.DataTexture(hit, size, size, THREE.RGBAFormat), opts);
  const tex = gen();
  if (recorder) {
    const img = tex.image as { data: Uint8Array, width: number, height: number };
    record(key, img.width, img.height, img.data);
  }
  return tex;
}

/**
 * Pull one entry's texels out of the cache, dropping it from the index.
 *
 * Dropping keeps the *index* honest; {@link compactTexBake} is what makes it
 * free memory, because until the containers are compacted every entry holds one
 * whole container alive. After boot the only texels held are the ones a live
 * texture owns plus the ones nothing has asked for yet, and that second set is
 * the dungeon interiors, which are built on first `enter()`.
 *
 * @returns the RGBA bytes, or null on a miss or a size disagreement
 */
function take(key: string, w: number, h: number): Uint8Array | null {
  const hit = store && store.index.get(key);
  if (!hit || hit.w !== w || hit.h !== h) return null;
  store!.index.delete(key);
  return decodePlanes8(hit.buf.subarray(hit.off, hit.off + w * h * 4), w, h, 4);
}

/**
 * Add one entry to the recording, refusing a key that is already taken.
 * @param drawn true when the source is {@link bakedCanvasMips}
 */
function record(key: string, w: number, h: number, data: Uint8Array, drawn = false) {
  if (!recorder) return;
  if (recordDrawnOnly && !drawn) return;
  if (recorder.has(key)) throw new Error(`[texbake] duplicate key ${key}`);
  recorder.set(key, { w, h, data });
}

/**
 * A canvas-drawn texture with a hand-built mip chain, served from the bake.
 *
 * The painted faces are the reason this exists. Each one is a 1024^2 canvas
 * whose pixels come from a million four-octave noise samples, and eleven
 * townspeople plus four heroes is 3.1 s of boot — the largest single item left
 * on the profile once the material bake landed.
 *
 * It hands back **canvases**, not a texture, and the caller uploads them
 * exactly as it always did. Reconstructing a `DataTexture` from the same bytes
 * would have been less code and a different upload path — different `flipY`,
 * different alpha handling (`project/LANDMINES.md`: canvas upload loses alpha
 * in this renderer) — and the whole value of a cache like this is that it
 * cannot change what the frame looks like.
 *
 * @param key namespaced cache key; levels are stored as `key/0`, `key/1`, ...
 * @param build draws the thing, returning the mip chain, level 0 first
 */
export function bakedCanvasMips(key: string, build: () => HTMLCanvasElement[]): HTMLCanvasElement[] {
  if (store && store.index.has(`${key}/0`)) {
    const mips: HTMLCanvasElement[] = [];
    for (let level = 0; ; level++) {
      const e = store.index.get(`${key}/${level}`);
      if (!e) break;
      const bytes = take(`${key}/${level}`, e.w, e.h);
      if (!bytes) break;
      const cv = document.createElement('canvas');
      cv.width = e.w; cv.height = e.h;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      const img = ctx.createImageData(e.w, e.h);
      img.data.set(bytes);
      ctx.putImageData(img, 0, 0);
      mips.push(cv);
    }
    // A chain that stops short is a corrupt cache, not a cheaper texture: fall
    // through and draw it rather than upload a partial pyramid.
    if (mips.length && mips[mips.length - 1].width === 1) return mips;
  }
  const mips = build();
  if (recorder) {
    for (let level = 0; level < mips.length; level++) {
      const cv = mips[level];
      const d = cv.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, cv.width, cv.height).data;
      record(`${key}/${level}`, cv.width, cv.height, new Uint8Array(d.buffer, d.byteOffset, d.byteLength), true);
    }
  }
  return mips;
}

/**
 * Raw RGBA bytes, served from the bake when one is resident.
 *
 * The three wrappers below all end in a square `DataTexture` that
 * `TextureGen` built one texel at a time. Not everything generated on the boot
 * path has that shape: the cloud field is two **3D** volumes and a 512^2
 * weather map, produced by one function that fills whole `Uint8Array`s rather
 * than answering per-texel calls. It is pure, deterministic and Node-safe —
 * exactly what `tex.bin.gz` is for — and none of the existing wrappers can
 * carry it.
 *
 * A volume is stored as a `size x size*size` image. The container is indexed
 * on `w`/`h` and never looks at the bytes, so a flattened volume needs no
 * format change and no version bump; the caller hands back the same linear
 * array it would have computed.
 *
 * **The key must carry every parameter that changes the bytes**, because a
 * dimension mismatch is the only thing `take` can detect on its own. Sizes and
 * seed go in the key, so changing one is a clean miss rather than a stale hit;
 * changing the *code* is covered by `TEX_SOURCES`.
 *
 * @param key namespaced cache key
 * @param w width the bytes are indexed at
 * @param h height the bytes are indexed at
 * @param build fills and returns `w * h * 4` bytes the slow way
 */
export function bakedBytes(key: string, w: number, h: number, build: () => Uint8Array): Uint8Array {
  const hit = take(key, w, h);
  if (hit) return hit;
  const data = build();
  if (recorder) record(key, w, h, data);
  return data;
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

/**
 * Hand a browser-side recording back to `src/tools/texbake.mts --canvas`.
 *
 * The alternative was returning the bytes through `page.evaluate`, which means
 * base64 across the CDP channel: the face chain alone is 84 MB raw, and
 * turning that into a 112 MB JSON string to move it one process sideways is
 * not a trade worth making. A POST to a socket the bake tool is already
 * holding open moves the compressed bytes and nothing else.
 *
 * @param url where the tool is listening
 * @param hash content hash of the generator sources, stamped into the header
 */
export async function postRecording(url: string, hash: string, tier?: string): Promise<number> {
  // One recording, up to three containers, exactly as the Node bake does it.
  // The predicate is named rather than passed as a function because this is
  // called across the `page.evaluate` boundary, where a closure cannot go.
  const keep = tier === 'phone' ? isPhoneDeferredKey
    : tier === 'boot' ? (k: string) => !isPhoneDeferredKey(k)
      : () => true;
  const raw = encodeTexBake(hash, keep);
  const gz = new Response(new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream('gzip')));
  const body = await gz.arrayBuffer();
  // No `content-type`: naming one would put `application/octet-stream` outside
  // the CORS-safelisted set and turn this into a preflighted request for no
  // benefit. The receiver knows what it asked for.
  await fetch(url, { method: 'POST', body });
  return body.byteLength;
}

// Start the transfer as early as the module graph allows: the first consumer
// is `Props.init()`, seven systems into the boot order, so on a warm disk the
// inflate is finished before anything asks.
if (typeof window !== 'undefined') {
  // `?texbake=canvas` is the browser bake: record instead of reading, so the
  // generators run for real and every drawn texture is captured on the way past.
  if (new URLSearchParams(location.search).get('texbake') === 'canvas') {
    beginRecording({ drawnOnly: true });
    (window as unknown as { TEX_BAKE_POST: typeof postRecording }).TEX_BAKE_POST = postRecording;
  } else {
    void loadTexBake();
    // The deferred tier, started after the first frame has been presented and
    // not one millisecond earlier. `game-ready` fires at the end of
    // `Game.init()`, in the same task as the warm render before it — so the
    // frame that shows the game is the next animation frame, and the transfer
    // has to start after THAT to be off the first visit's bill. One rAF plus one
    // task is the smallest delay that is definitely on the far side of it, and
    // it is a few hundred milliseconds before anything could ask for a dungeon
    // texel: `Dungeons.enter()` is player-driven and the fetch is local.
    addEventListener('game-ready', () => {
      requestAnimationFrame(() => setTimeout(() => { void loadDeferredTexBake(); }, 0));
    }, { once: true });
  }
}

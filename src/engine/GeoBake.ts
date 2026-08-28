import * as THREE from 'three';

/**
 * Baked procedural geometry.
 *
 * The third cache of our own generators, after `src/tools/bake.mts` (the
 * terrain field) and `src/engine/TexBake.ts` (every keyed `DataTexture`).
 * Geometry was the one generated thing with no cache at all, and on the boot
 * profile it is the largest remaining block that is neither shader work nor
 * streaming:
 *
 * | ms | phase | what it makes |
 * |---|---|---|
 * | 481 | `Props.poiPrebuild` | 3.70 M vertices over eight POI compounds |
 * | 624 | `Props.mega` | 0.79 M vertices of megastructure |
 * | 561 | `Water.shore` | 0.13 M vertices of marching-squares ribbon |
 *
 * (`bootprof` on a contended dirty tree; a quiet tree reads 392 / 330 / 225.)
 *
 * **The measurement that says this is worth doing**, taken before a line of it
 * was written (`src/tools/probes/geocodec.mts`): those three subtrees are
 * **164.9 MB** of typed array, **45.6 MB** gzipped, and inflating that back and
 * rebuilding 145 `BufferGeometry` objects from it costs **200 ms + 25 ms** in
 * the page. So a quarter of a second of decode stands in for one to one and a
 * half seconds of generation. The codec is deliberately *not* clever — no
 * quantisation, no byte transposition — because the arrays are handed back
 * bit-identical and the whole value of a cache like this is that it cannot
 * change what the frame looks like.
 *
 * The three properties it shares with its two siblings, deliberately:
 *
 *   - **Every failure path regenerates.** A missing, stale or corrupt artifact
 *     costs the boot time it used to cost and nothing else, and `?nobake=1`
 *     takes it out of the loop from the URL.
 *   - **Freshness is a content hash of the generator sources** (`GEO_SOURCES`
 *     in `src/tools/texbake.mts`), and the runtime cannot check it — so the
 *     vite plugin *deletes* a stale artifact rather than serving it.
 *   - **It is a cache of our own generators, not an asset.** `BRIEF.md`'s "no
 *     binary assets" rule is about *inputs*; nothing here has an input that is
 *     not in the repo as code.
 *
 * **Why it is a browser bake and not a Node one.** `texbake.mts` runs its
 * texture generators under Node because a texel function needs nothing but
 * arithmetic. A POI compound is seated by `PoiKits._base`, which reads
 * `Terrain.drawnHeightAt` — the *rasterised clipmap*, which `seatcheck.mts`
 * proves is the renderer's own arithmetic. A Node bake would seat every
 * compound at a subtly different height and ship geometry graded against
 * ground that is not the ground the player stands on: the stale-cache failure
 * with no symptom, by construction. So this bakes the way the painted faces
 * do — boot the real page, record what the real generators make.
 *
 * **What is baked is what boot builds, and that is a memory decision.** The
 * container is 165 MB inflated. Every entry is consumed during `init()` and the
 * index empties, which drops the buffer; caching the 116 POI sites that stream
 * in later would keep all 165 MB resident for the whole session, against a
 * process that is already 1.9 GB.
 */

/** Container magic. Bump {@link GEO_BAKE_VERSION} whenever the layout changes. */
const MAGIC = 'EOSGEO01';
export const GEO_BAKE_VERSION = 1;
/** Where the bake step drops the artifact, relative to the site root. */
export const GEO_BAKE_PATH = 'baked/geo.bin.gz';

/** One attribute's bytes in the container. */
interface GeoAttr {
  /** attribute name — `position`, `uv`, `aShore`, ... */
  n: string;
  /** typed-array constructor name */
  t: string;
  /** itemSize */
  i: number;
  /** normalized */
  z: boolean;
  /** byte offset into the body */
  off: number;
  /** byte length */
  len: number;
}

/** One merged mesh's geometry: what `PartBuilder.build` emits per material. */
interface GeoPartEntry {
  /** `material.name` — the only stable identity a material has across runs */
  mat: string;
  attrs: GeoAttr[];
  idx: { t: string, off: number, len: number } | null;
  groups: Array<{ start: number, count: number, materialIndex?: number }>;
  /** bounding sphere, `[x, y, z, radius]`, so a hit need not walk the positions */
  bs: number[] | null;
}

interface GeoEntry {
  k: string;
  parts: GeoPartEntry[];
  /** whatever the generator wants back besides geometry; JSON, and small */
  meta: unknown;
}

interface GeoHeader {
  version: number;
  hash: string;
  entries: GeoEntry[];
}

/** A restored (or freshly built) part: one material's merged geometry. */
export interface GeoPart { mat: string; geo: THREE.BufferGeometry }
/** What {@link bakedGeo} hands back. */
export interface GeoResult<M> { parts: GeoPart[]; meta: M; hit: boolean }

const CTORS: Record<string, new (n: ArrayBufferLike | number, o?: number, l?: number) => ArrayBufferView & { length: number }> = {
  Float32Array, Float64Array, Uint32Array, Int32Array,
  Uint16Array, Int16Array, Uint8Array, Int8Array, Uint8ClampedArray,
} as never;

/**
 * Key prefix for the render quality tier, because geometry can depend on it.
 *
 * `PoiKits._base` seats a compound against `Terrain.drawnHeightAt(x, z,
 * clipmap.cell0)` — the *rasterised* clipmap — and the apron is then graded
 * against that number. Nothing guarantees the clipmap is configured the same
 * way at `q=low` as at `q=ultra`, and the bake runs at ultra, so a `q=low`
 * page reading ultra's vertices would be the stale-cache failure with no
 * symptom, in a gate (`combatloop`, `integration`) that nobody photographs.
 *
 * Prefixing the key makes that a clean miss instead. Derived exactly as
 * `Renderer` derives its own tier, so the two cannot disagree.
 */
const VARIANT = typeof location !== 'undefined'
  ? (new URLSearchParams(location.search).get('q') || 'high') : 'high';
/**
 * The tier `texbake.mts --geo` bakes, which is the tier the 188 cold boots of a
 * suite cycle use.
 *
 * A page on any other tier would otherwise fetch 35 MB, inflate it to 165 MB
 * and then miss on every key — paying the whole cost of the cache for none of
 * its benefit. `combatloop` and `integration` boot at `q=low` and run for
 * minutes, so that transient is not free. Skipping the fetch outright is the
 * only version of this that costs nothing: the container is one gzip member, so
 * there is no way to read its index without inflating all of it.
 */
const BAKED_VARIANT = 'ultra';

let store: { index: Map<string, GeoEntry>, body: Uint8Array, base: number } | null = null;
let recorder: Map<string, { parts: Array<{ mat: string, geo: THREE.BufferGeometry }>, meta: unknown }> | null = null;
let loading: Promise<boolean> | null = null;

/**
 * Collect every baked geometry instead of reading the cache.
 * Called by the page when it is booted with `?geobake=1`.
 */
export function beginGeoRecording() {
  recorder = new Map();
  store = null;
}

/** @returns what {@link beginGeoRecording} has collected so far */
export function geoRecorded() { return recorder; }

/** True once a usable cache is resident. */
export function geoBakeReady(): boolean { return store !== null; }

/**
 * Drop the container.
 *
 * Called at the end of `Props.init()`, which is the last consumer on the boot
 * path. Entries that were never asked for — a kit whose site was excluded by a
 * neighbour, a quality tier that did not match — would otherwise hold the whole
 * 165 MB inflated body alive for the session.
 */
export function releaseGeoBake() { store = null; }

/**
 * Pack the recording into the container. Bake step only.
 * @param hash content hash of the generator sources, for freshness
 */
export function encodeGeoBake(hash: string): Uint8Array {
  if (!recorder) throw new Error('[geobake] nothing recorded');
  const entries: GeoEntry[] = [];
  const bodies: Uint8Array[] = [];
  let off = 0;
  /** Append one typed array, 4-byte aligned so every view is constructible. */
  const put = (a: ArrayBufferView): { off: number, len: number } => {
    const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const at = off;
    bodies.push(bytes);
    off += bytes.byteLength;
    const pad = (4 - (off % 4)) % 4;
    if (pad) { bodies.push(new Uint8Array(pad)); off += pad; }
    return { off: at, len: bytes.byteLength };
  };
  for (const [k, rec] of recorder) {
    const parts: GeoPartEntry[] = [];
    for (const { mat, geo } of rec.parts) {
      const attrs: GeoAttr[] = [];
      for (const [n, a] of Object.entries(geo.attributes)) {
        const at = a as THREE.BufferAttribute;
        const arr = at.array as ArrayBufferView;
        attrs.push({ n, t: arr.constructor.name, i: at.itemSize, z: !!at.normalized, ...put(arr) });
      }
      const idxAttr = geo.index;
      const idx = idxAttr
        ? { t: (idxAttr.array as ArrayBufferView).constructor.name, ...put(idxAttr.array as ArrayBufferView) }
        : null;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const b = geo.boundingSphere;
      parts.push({
        mat, attrs, idx,
        groups: geo.groups.map((g) => ({ start: g.start, count: g.count, materialIndex: g.materialIndex })),
        bs: b ? [b.center.x, b.center.y, b.center.z, b.radius] : null,
      });
    }
    entries.push({ k, parts, meta: rec.meta === undefined ? null : rec.meta });
  }
  let header = new TextEncoder().encode(JSON.stringify({ version: GEO_BAKE_VERSION, hash, entries } satisfies GeoHeader));
  // The body starts at 12 + headerLength, and every attribute offset inside it
  // is 4-aligned — so the header has to be too, or a `Float32Array` view of the
  // first attribute throws `start offset should be a multiple of 4`.
  const slack = (4 - ((12 + header.length) % 4)) % 4;
  if (slack) { const q = new Uint8Array(header.length + slack); q.set(header); q.fill(32, header.length); header = q; }
  const out = new Uint8Array(12 + header.length + off);
  for (let i = 0; i < 8; i++) out[i] = MAGIC.charCodeAt(i);
  new DataView(out.buffer).setUint32(8, header.length, true);
  out.set(header, 12);
  let p = 12 + header.length;
  for (const b of bodies) { out.set(b, p); p += b.length; }
  return out;
}

/** Parse a container into {@link store}. @returns false if it is not one */
function decodeGeoBake(buf: Uint8Array): boolean {
  if (buf.length < 12) return false;
  for (let i = 0; i < 8; i++) if (buf[i] !== MAGIC.charCodeAt(i)) return false;
  const hlen = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(8, true);
  const header: GeoHeader = JSON.parse(new TextDecoder().decode(buf.subarray(12, 12 + hlen)));
  if (header.version !== GEO_BAKE_VERSION) return false;
  const index = new Map<string, GeoEntry>();
  for (const e of header.entries) index.set(e.k, e);
  store = { index, body: buf, base: 12 + hlen };
  return true;
}

/**
 * Fetch and inflate the artifact. Idempotent and safe to call from several
 * systems' `init()` — the first call does the work and the rest await it.
 *
 * Kicked off at module evaluation (below) so the transfer overlaps the systems
 * ahead of the first consumer. The first consumer is `Water.init()`, which is
 * **third** in the boot order rather than eighth like `TexBake`'s — so the head
 * start is Sky plus Terrain plus Water's own textures, and this is awaited
 * immediately before the shoreline rather than at the top of the system.
 *
 * @returns true when the cache is live
 */
export function loadGeoBake(): Promise<boolean> {
  if (loading) return loading;
  loading = (async () => {
    if (recorder) return false;
    if (typeof fetch !== 'function' || typeof DecompressionStream !== 'function') return false;
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nobake')) return false;
    // Nothing in the artifact can match, so do not pay for it. See BAKED_VARIANT.
    if (VARIANT !== BAKED_VARIANT) return false;
    const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
    try {
      const res = await fetch(base + GEO_BAKE_PATH);
      if (!res.ok) return false;
      // vite dev and preview both recognise `.gz` and send `Content-Encoding:
      // gzip`, in which case the body is already inflated; inflating again
      // aborts the stream. Only decode in JS when the transfer was opaque.
      const encoded = (res.headers.get('content-encoding') || '').includes('gzip');
      const body = encoded ? res.body : res.body!.pipeThrough(new DecompressionStream('gzip'));
      return decodeGeoBake(new Uint8Array(await new Response(body).arrayBuffer()));
    } catch {
      return false;
    }
  })();
  return loading;
}

/** Rebuild one part's `BufferGeometry` from the container. */
function inflatePart(p: GeoPartEntry, body: Uint8Array, base: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  /**
   * A **copy**, not a view.
   *
   * A view would be free and would keep the whole 165 MB body alive behind 145
   * live geometries for the session — the opposite of what this cache is for.
   * Measured at 25 ms for all of it.
   */
  const grab = (t: string, off: number, len: number) => {
    const C = CTORS[t];
    if (!C) throw new Error(`[geobake] unknown array type ${t}`);
    const view = new C(body.buffer, body.byteOffset + base + off, len / (C as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT);
    return new (C as unknown as new (v: unknown) => ArrayBufferView & { length: number })(view);
  };
  for (const a of p.attrs) {
    geo.setAttribute(a.n, new THREE.BufferAttribute(grab(a.t, a.off, a.len) as never, a.i, a.z));
  }
  if (p.idx) geo.setIndex(new THREE.BufferAttribute(grab(p.idx.t, p.idx.off, p.idx.len) as never, 1));
  for (const g of p.groups) geo.addGroup(g.start, g.count, g.materialIndex);
  if (p.bs) {
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(p.bs[0], p.bs[1], p.bs[2]), p.bs[3]);
  } else {
    geo.computeBoundingSphere();
  }
  return geo;
}

/**
 * A set of merged geometries, served from the bake when one is resident.
 *
 * On a hit `build` never runs, which is the whole saving: the cost is in the
 * generator, not in the merge (`PartBuilder.build` is 23 ms of the 417 ms the
 * eight prebuilt POI compounds take).
 *
 * **The key must carry every parameter that changes the vertices**, because a
 * container lookup can detect nothing on its own — there is no `w`/`h` here to
 * disagree with, the way there is in `TexBake`. Quality tier goes in the key
 * for exactly this reason: the bake boots at `q=ultra` and a `q=low` page must
 * take a clean miss, not somebody else's vertices.
 *
 * @param key namespaced cache key, `system/thing`
 * @param resolve turns a recorded `material.name` back into the material; a
 *   name it cannot answer makes the entry unrecordable, so a hit can never
 *   fail to resolve one
 * @param build makes the parts the slow way
 */
export function bakedGeo<M>(
  key: string,
  resolve: (name: string) => THREE.Material | undefined,
  build: () => { parts: GeoPart[], meta?: M },
): GeoResult<M> {
  key = `${VARIANT}/${key}`;
  const hit = store && store.index.get(key);
  if (hit && store) {
    const parts: GeoPart[] = [];
    let ok = true;
    for (const p of hit.parts) {
      if (!resolve(p.mat)) { ok = false; break; }
      parts.push({ mat: p.mat, geo: inflatePart(p, store.body, store.base) });
    }
    if (ok) {
      store.index.delete(key);
      // The body is only alive while something still points at it: once the
      // last entry is taken it is 165 MB of nothing.
      if (!store.index.size) store = null;
      return { parts, meta: hit.meta as M, hit: true };
    }
    for (const p of parts) p.geo.dispose();
  }
  const made = build();
  if (recorder) {
    // Only record what a hit could serve. A material with no name has only its
    // uuid, which is regenerated on every load, so an entry that contains one
    // would resolve to nothing and fall back for ever — better to not have it.
    const named = made.parts.every((p) => p.mat && resolve(p.mat));
    if (named && !recorder.has(key)) recorder.set(key, { parts: made.parts, meta: made.meta });
    else if (!named) console.warn(`[geobake] ${key}: a part has an unresolvable material name; not recorded`);
  }
  return { parts: made.parts, meta: made.meta as M, hit: false };
}

/**
 * Hand a browser-side recording back to `src/tools/texbake.mts --geo`.
 *
 * The same POST-to-a-socket trick `TexBake.postRecording` uses, and for the
 * same reason: this container is 165 MB raw, and base64 across the CDP channel
 * would make it a 220 MB JSON string to move it one process sideways.
 *
 * @param url where the bake tool is listening
 * @param hash content hash of the generator sources, stamped into the header
 */
export async function postGeoRecording(url: string, hash: string): Promise<number> {
  // The key list, published for the bake tool: an artifact whose entries are
  // empty is written exactly as happily as a full one, and "0 keys" in the
  // stamp is the only thing that says so.
  (window as unknown as { __GEO_KEYS: string[] }).__GEO_KEYS = [...(recorder ? recorder.keys() : [])];
  const raw = encodeGeoBake(hash);
  const gz = new Response(new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream('gzip')));
  const body = await gz.arrayBuffer();
  await fetch(url, { method: 'POST', body });
  return body.byteLength;
}

// Start the transfer as early as the module graph allows.
if (typeof window !== 'undefined') {
  if (new URLSearchParams(location.search).has('geobake')) {
    beginGeoRecording();
    (window as unknown as { GEO_BAKE_POST: typeof postGeoRecording }).GEO_BAKE_POST = postGeoRecording;
  } else {
    void loadGeoBake();
  }
}

/**
 * Container format for a baked `Field`.
 *
 * The heightfield generator (`Field.build()`) is deterministic: same seed, same
 * grids, every time. Running it in the browser on every page load costs 7-15 s
 * of pure CPU that produces a byte-identical result each time, so the build step
 * runs it once and this module writes the answer down. The generator stays the
 * source of truth — `tools/bake.mjs` calls it, nothing is hand-authored, and the
 * runtime falls back to generating in place whenever the artifact is missing.
 *
 * Only the grids that are *expensive* are stored. Normals are derived from the
 * height grid in ~50 ms, so baking them would trade 16 MB of payload for nothing.
 * What is stored:
 *
 *   h        2048^2 float heights   -> 16-bit quantised, row-delta   ~5.5 MB gz
 *   far      1024^2 float heights   -> same                          ~1.7 MB gz
 *   ctrl     2048^2 RGBA8 splat     -> de-interleaved planes         ~7.6 MB gz
 *   farCtrl  1024^2 RGBA8 splat     -> same                          ~1.3 MB gz
 *   road     centreline elevations  -> raw floats                     ~5 kB
 *
 * The whole container is gzipped; the browser inflates it with the platform
 * `DecompressionStream`, so there is no decoder dependency.
 *
 * Layout:  magic(8) | u32 headerLen | utf8 JSON header | section payloads
 */

export const MAGIC = 'EOSFLD01';
/** Bump when the encoding or the generator's output contract changes. */
export const BAKE_VERSION = 1;

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Quantise a float grid to 16 bits and delta-code along rows. */
export function encodeQ16D(src, w, h) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < src.length; i++) { const v = src[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const scale = (hi - lo) / 65535 || 1;
  const out = new Uint16Array(w * h);
  for (let j = 0; j < h; j++) {
    let prev = 0;
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const q = Math.round((src[k] - lo) / scale);
      out[k] = (q - prev) & 0xffff;
      prev = q;
    }
  }
  return { bytes: new Uint8Array(out.buffer), min: lo, scale };
}

/** @returns {Float32Array} */
export function decodeQ16D(bytes, w, h, min, scale) {
  // A section can land on an odd byte offset inside the container, which a
  // Uint16Array view cannot address; copy only in that case.
  const src = bytes.byteOffset % 2 === 0 ? bytes : new Uint8Array(bytes);
  const q = new Uint16Array(src.buffer, src.byteOffset, w * h);
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    let prev = 0;
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      prev = (prev + q[k]) & 0xffff;
      out[k] = min + prev * scale;
    }
  }
  return out;
}

/**
 * Split an interleaved RGBA8 grid into per-channel planes. Channels of a splat
 * control map are uncorrelated with each other but strongly correlated with
 * their own neighbours, and gzip only sees a window of the recent past — so
 * de-interleaving is worth ~2x here for free.
 */
export function encodePlanes8(src, w, h, ch) {
  const n = w * h;
  const out = new Uint8Array(n * ch);
  for (let c = 0; c < ch; c++) {
    const base = c * n;
    for (let i = 0; i < n; i++) out[base + i] = src[i * ch + c];
  }
  return out;
}

/** @returns {Uint8Array} interleaved RGBA8 */
export function decodePlanes8(bytes, w, h, ch) {
  const n = w * h;
  const out = new Uint8Array(n * ch);
  for (let c = 0; c < ch; c++) {
    const base = c * n;
    for (let i = 0; i < n; i++) out[i * ch + c] = bytes[base + i];
  }
  return out;
}

/**
 * Pack sections into the container.
 * @param {object} meta arbitrary JSON metadata (seed, grid sizes, hash)
 * @param {Array<{name:string, kind:string, bytes:Uint8Array, [k:string]:any}>} sections
 * @returns {Uint8Array}
 */
export function packContainer(meta, sections) {
  let offset = 0;
  const index = sections.map((s) => {
    const { bytes, ...rest } = s;
    const e = { ...rest, offset, length: bytes.length };
    offset += bytes.length;
    return e;
  });
  const header = enc.encode(JSON.stringify({ ...meta, version: BAKE_VERSION, sections: index }));
  const out = new Uint8Array(8 + 4 + header.length + offset);
  out.set(enc.encode(MAGIC), 0);
  new DataView(out.buffer).setUint32(8, header.length, true);
  out.set(header, 12);
  let p = 12 + header.length;
  for (const s of sections) { out.set(s.bytes, p); p += s.bytes.length; }
  return out;
}

/**
 * @param {Uint8Array} buf
 * @returns {{meta:object, section:(name:string)=>Uint8Array|null}}
 */
export function unpackContainer(buf) {
  if (dec.decode(buf.subarray(0, 8)) !== MAGIC) throw new Error('bad bake magic');
  const hlen = new DataView(buf.buffer, buf.byteOffset).getUint32(8, true);
  const meta = JSON.parse(dec.decode(buf.subarray(12, 12 + hlen)));
  if (meta.version !== BAKE_VERSION) throw new Error(`bake version ${meta.version} != ${BAKE_VERSION}`);
  const base = 12 + hlen;
  return {
    meta,
    section(name) {
      const s = meta.sections.find((x) => x.name === name);
      if (!s) return null;
      return { ...s, bytes: buf.subarray(base + s.offset, base + s.offset + s.length) };
    },
  };
}

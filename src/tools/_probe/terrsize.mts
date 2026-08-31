// Two ways to make terrain.bin.gz smaller, measured before either is built.
//
// A) IMAGES. `ctrl` is 2048x2048 RGBA splat weights -- literally a picture.
//    `h` is a 16-bit heightfield, which becomes a picture if the high and low
//    bytes go in two channels. Lossless WebP, so no geometry moves at all.
// B) HALF RESOLUTION. 4x less data by construction, but every baked compound
//    was seated against the 2048 field, so it risks driftcheck.
//
// A is free of that risk. The question is only whether it is enough.
const url = '/baked/terrain.bin.gz';
const res = await fetch(url);
const encd = (res.headers.get('content-encoding') || '').includes('gzip');
const body = encd ? res.body : res.body.pipeThrough(new DecompressionStream('gzip'));
const buf = new Uint8Array(await new Response(body).arrayBuffer());
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const hlen = dv.getUint32(8, true);
const hdr = JSON.parse(new TextDecoder().decode(buf.subarray(12, 12 + hlen)));
const base = 12 + hlen;

const cv = document.createElement('canvas');
const ctx = cv.getContext('2d', { willReadFrequently: true });
const blobLen = (mime, q) => new Promise((r) => cv.toBlob((b) => r(b ? b.size : -1), mime, q));

const rows = [];
for (const s of hdr.sections) {
  const bytes = buf.subarray(base + s.offset, base + s.offset + s.length);
  let px = null, w = 0, h = 0;
  if (s.kind === 'planes8' && s.w && s.h) {
    // planes -> interleaved
    w = s.w; h = s.h * (s.ch === 4 ? 1 : 1);
    const n = s.w * s.h;
    px = new Uint8ClampedArray(n * 4);
    for (let c = 0; c < s.ch; c++) for (let i = 0; i < n; i++) px[i * 4 + c] = bytes[c * n + i];
    if (s.ch < 4) for (let i = 0; i < n; i++) px[i * 4 + 3] = 255;
  } else if (s.kind === 'q16d' && s.w && s.h) {
    // 16-bit delta-coded heights -> R = high byte, G = low byte, lossless.
    w = s.w; h = s.h;
    const n = s.w * s.h;
    px = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      px[i * 4] = bytes[i * 2 + 1];
      px[i * 4 + 1] = bytes[i * 2];
      px[i * 4 + 2] = 0;
      px[i * 4 + 3] = 255;
    }
  }
  if (!px) { rows.push({ name: s.name, kind: s.kind, rawKB: Math.round(s.length / 1024), note: 'not an image' }); continue; }
  cv.width = w; cv.height = h;
  ctx.putImageData(new ImageData(px, w, h), 0, 0);
  const [ll, l90] = await Promise.all([blobLen('image/webp', 1.0), blobLen('image/webp', 0.9)]);
  rows.push({
    name: s.name, kind: s.kind, wh: `${w}x${h}`,
    rawKB: Math.round(s.length / 1024),
    losslessKB: Math.round(ll / 1024),
    q90KB: Math.round(l90 / 1024),
  });
}
const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
return {
  gzippedFileMB: 17.2,
  rawTotalMB: +(sum('rawKB') / 1024).toFixed(2),
  webpLosslessMB: +(sum('losslessKB') / 1024).toFixed(2),
  webpQ90MB: +(sum('q90KB') / 1024).toFixed(2),
  rows,
};

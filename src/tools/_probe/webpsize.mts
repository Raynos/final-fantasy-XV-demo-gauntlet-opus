// What would these textures cost as images instead of raw RGBA planes?
//
// The whole 10x load question turns on this one number. The containers ship
// 9.9 Mpx of RGBA8, gzipped -- and gzip is close to the worst possible codec
// for texture data, because it has no idea the bytes are a picture. A browser
// has had a good one built in for twenty years.
//
// Encoded in the page rather than in Node so it is the SAME encoder the phone
// would decode with, and so the answer includes the alpha handling.
const g = window.GAME;
const store = window.__TEXSTORE;
if (!store) return { error: 'no store' };

const cv = document.createElement('canvas');
const ctx = cv.getContext('2d');
const blobSize = (type, q) => new Promise((res) => cv.toBlob((b) => res(b ? b.size : -1), type, q));

const rows = [];
let rawTotal = 0, webp80 = 0, webpLossless = 0, jpeg82 = 0;
let n = 0;
for (const [k, e] of store.index) {
  if (n++ % 4 !== 0) continue;                 // every fourth, for time
  const len = e.w * e.h * 4;
  const px = new Uint8ClampedArray(e.buf.buffer, e.buf.byteOffset + e.off, len);
  cv.width = e.w; cv.height = e.h;
  ctx.putImageData(new ImageData(px.slice(), e.w, e.h), 0, 0);
  const [w80, wll, j82] = await Promise.all([
    blobSize('image/webp', 0.8), blobSize('image/webp', 1.0), blobSize('image/jpeg', 0.82),
  ]);
  rawTotal += len; webp80 += w80; webpLossless += wll; jpeg82 += j82;
  if (rows.length < 8) rows.push({ k, wh: `${e.w}x${e.h}`, rawKB: Math.round(len / 1024), webp80KB: Math.round(w80 / 1024), jpegKB: Math.round(j82 / 1024) });
}
void g;
return {
  sampled: rows.length ? undefined : 0,
  sampledEntries: n,
  rawMB: +(rawTotal / 1e6).toFixed(2),
  webpQ80MB: +(webp80 / 1e6).toFixed(2),
  webpLosslessMB: +(webpLossless / 1e6).toFixed(2),
  jpegQ82MB: +(jpeg82 / 1e6).toFixed(2),
  ratioVsRaw_webp80: +(rawTotal / webp80).toFixed(1),
  examples: rows,
};

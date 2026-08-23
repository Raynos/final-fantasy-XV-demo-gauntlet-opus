#!/usr/bin/env node
/**
 * Glue the same crop rect out of several captures into one side-by-side strip.
 *
 *   node src/tools/lineup.mts out.png 620,60,380,800,2 a.png b.png c.png d.png
 *
 * Exists for one recurring question this project cannot answer any other way:
 * *do these four characters read as four different people?* A contact sheet
 * pages them apart and a party shot puts them at four different depths, so in
 * both the only honest comparison — same framing, same scale, adjacent pixels —
 * is the one you cannot make. This makes it: identical rect, identical zoom,
 * one image, a 6 px rule between panels so a silhouette edge is never confused
 * with a panel edge.
 *
 * Nearest-neighbour zoom, same as `crop.mts`, so what you see is the texels.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { decodePng } from './imgdiff.mts';

const T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}
const chunk = (type: string, body: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
};

async function writePng(outp: string, w: number, h: number, rgba: Uint8Array) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  let q = 0;
  for (let y = 0; y < h; y++) {
    raw[q++] = 0;
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), q);
    q += w * 4;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  await writeFile(outp, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

const [, , outp, rect, ...files] = process.argv;
if (!outp || !rect || !files.length) {
  console.error('usage: lineup.mts out.png x,y,w,h[,zoom] in1.png in2.png ...');
  process.exit(2);
}
const [x0, y0, cw, ch, zz] = rect.split(',').map(Number);
const z = zz || 1;
const GAP = 6;
const pw = cw * z, ph = ch * z;
const ow = pw * files.length + GAP * (files.length - 1), oh = ph;
const out = new Uint8Array(ow * oh * 4).fill(255);

for (let i = 0; i < files.length; i++) {
  const src = decodePng(await readFile(files[i]));
  const nch = src.data.length / (src.w * src.h);
  const ox = i * (pw + GAP);
  for (let y = 0; y < ph; y++) {
    const sy = Math.min(src.h - 1, Math.max(0, y0 + Math.floor(y / z)));
    for (let x = 0; x < pw; x++) {
      const sx = Math.min(src.w - 1, Math.max(0, x0 + Math.floor(x / z)));
      const s = (sy * src.w + sx) * nch;
      const d = (y * ow + ox + x) * 4;
      out[d] = src.data[s]; out[d + 1] = src.data[s + 1]; out[d + 2] = src.data[s + 2]; out[d + 3] = 255;
    }
  }
}
await writePng(outp, ow, oh, out);
console.log(`${outp} ${ow}x${oh}  (${files.length} panels of ${pw}x${ph})`);

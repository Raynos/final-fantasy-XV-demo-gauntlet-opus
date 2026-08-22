#!/usr/bin/env node
/**
 * Crop (and optionally magnify) a region out of a capture.
 *
 *   node src/tools/crop.mts in.png out.png x y w h [zoom]
 *
 * Exists because looking at a 1600x900 frame at page scale hides exactly the
 * class of defect that matters most here — pixel-scale aliasing in the sky and
 * on the horizon. Nearest-neighbour zoom so what you see is the actual texels.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { decodePng } from './imgdiff.mts';

const [, , inp, outp, xs, ys, ws, hs, zs] = process.argv;
const x0 = Number(xs), y0 = Number(ys), cw = Number(ws), ch = Number(hs);
const z = Number(zs || 1);

const src = decodePng(await readFile(inp));
const ch4 = src.data.length / (src.w * src.h);
const ow = cw * z, oh = ch * z;
const out = Buffer.alloc(oh * (ow * 4 + 1));
let q = 0;
for (let y = 0; y < oh; y++) {
  out[q++] = 0;
  const sy = Math.min(src.h - 1, y0 + Math.floor(y / z));
  for (let x = 0; x < ow; x++) {
    const sx = Math.min(src.w - 1, x0 + Math.floor(x / z));
    const s = (sy * src.w + sx) * ch4;
    out[q++] = src.data[s];
    out[q++] = src.data[s + 1];
    out[q++] = src.data[s + 2];
    out[q++] = ch4 === 4 ? src.data[s + 3] : 255;
  }
}

const chunk = (type: string, body: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
};
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
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(ow, 0); ihdr.writeUInt32BE(oh, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
await writeFile(outp, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(out)), chunk('IEND', Buffer.alloc(0)),
]));
console.log(`${outp} ${ow}x${oh}`);

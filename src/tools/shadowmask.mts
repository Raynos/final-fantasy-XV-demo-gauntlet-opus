#!/usr/bin/env node
/* What IS the darkest quartile?
 *
 * `imagestats`' sh(R-B) is the mean R-B over the pixels below the 25th luma
 * percentile, and the whole of WS-2a rests on the claim that outdoors those
 * pixels are mostly *ground*. That is an assertion until somebody looks at the
 * mask. This paints the mask: in-quartile pixels keep their colour, everything
 * else goes flat magenta, so one Read answers "ground, foliage or sky".
 *
 * It also prints the mask's own mean colour and its split by image row band,
 * which is the cheap version of the same answer.
 *
 *   node src/tools/shadowmask.mts tmp/shots/X/zone_fallgrove.png --out tmp/shots/mask
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { decodePng } from './imgdiff.mts';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? args[outIdx + 1] : 'tmp/shots/mask';
await mkdir(outDir, { recursive: true });

function crc32(buf: Buffer) {
  let c: number, t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}
function encodePng(w: number, h: number, rgba: Uint8Array) {
  const out = Buffer.alloc(h * (w * 4 + 1));
  let q = 0;
  for (let y = 0; y < h; y++) { out[q++] = 0; for (let x = 0; x < w * 4; x++) out[q++] = rgba[y * w * 4 + x]; }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(out)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const f of files) {
  const img = decodePng(await readFile(f));
  const { w, h } = img;
  const ch = img.data.length / (w * h);
  // Same crop as imagestats: x 5-95%, y 5-90%.
  const x0 = Math.round(w * 0.05), x1 = Math.round(w * 0.95);
  const y0 = Math.round(h * 0.05), y1 = Math.round(h * 0.90);
  const lum: number[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * w + x) * ch;
    lum.push(0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]);
  }
  const sorted = [...lum].sort((a, b) => a - b);
  const cut = sorted[Math.floor(sorted.length * 0.25)];

  const rgba = new Uint8Array(w * h * 4);
  const BANDS = 6;
  const bandN = new Array(BANDS).fill(0), bandRB = new Array(BANDS).fill(0);
  let n = 0, R = 0, G = 0, B = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch, o = (y * w + x) * 4;
    const inCrop = x >= x0 && x < x1 && y >= y0 && y < y1;
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (inCrop && Y <= cut) {
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
      n++; R += r; G += g; B += b;
      const bd = Math.min(BANDS - 1, Math.floor(((y - y0) / (y1 - y0)) * BANDS));
      bandN[bd]++; bandRB[bd] += r - b;
    } else {
      rgba[o] = 255; rgba[o + 1] = 0; rgba[o + 2] = 255; rgba[o + 3] = 255;
    }
  }
  const name = path.basename(f).replace(/\.png$/, '');
  await writeFile(path.join(outDir, `${name}-sh.png`), encodePng(w, h, rgba));
  console.log(`${name}  cut=${cut.toFixed(1)}  n=${n}  mean rgb (${(R / n).toFixed(1)}, ${(G / n).toFixed(1)}, ${(B / n).toFixed(1)})  R-B ${((R - B) / n).toFixed(1)}`);
  console.log('  by row band (top->bottom):  ' +
    bandN.map((c, i) => `${(100 * c / n).toFixed(0)}%@${(bandRB[i] / Math.max(1, c)).toFixed(0)}`).join('  '));
}

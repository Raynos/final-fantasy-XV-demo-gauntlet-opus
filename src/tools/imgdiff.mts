#!/usr/bin/env node
/**
 * Pixel diff between two shot directories (or two PNGs).
 *
 *   node src/tools/imgdiff.mts tmp/shots/before tmp/shots/after
 *   node src/tools/imgdiff.mts a.png b.png
 *
 * Prints mean and max per-channel delta and the fraction of pixels that differ
 * by more than a threshold, so "visually unchanged" can be a measurement rather
 * than an assertion. Exits non-zero if any pair exceeds `--max` (default 2/255
 * mean, which is below this project's own run-to-run capture noise of ~0.4).
 *
 * Decodes PNG itself: Playwright writes 8-bit RGBA non-interlaced, which is a
 * zlib stream plus one filter byte per row.
 */
import { readFile, readdir } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** @returns RGBA8 */
export function decodePng(buf: any): {w:number, h:number, data:Uint8Array, ch?: any } {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let p = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const body = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4);
      bitDepth = body[8]; colorType = body[9]; interlace = body[12];
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported png (depth ${bitDepth}, interlace ${interlace})`);
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!ch) throw new Error(`unsupported png colour type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = new Uint8Array(w * h * ch);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[q++];
    const row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[q + x];
      const a = x >= ch ? out[row + x - ch] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = x >= ch && y > 0 ? out[prev + x - ch] : 0;
      let r;
      switch (filter) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: {
          const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break;
        }
        default: throw new Error(`bad png filter ${filter}`);
      }
      out[row + x] = r & 255;
    }
    q += stride;
  }
  return { w, h, ch, data: out };
}

/** @returns per-channel deltas in 0..255 */
export function compare(a: any, b: any): {mean:number, max:number, over:number, size?: boolean } {
  if (a.w !== b.w || a.h !== b.h || a.ch !== b.ch) return { mean: NaN, max: 255, over: 1, size: false };
  let sum = 0, max = 0, over = 0;
  const n = a.data.length;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a.data[i] - b.data[i]);
    sum += d; if (d > max) max = d; if (d > 8) over++;
  }
  return { mean: sum / n, max, over: over / n, size: true };
}

async function main() {
  const [aPath, bPath, ...rest] = process.argv.slice(2);
  if (!aPath || !bPath) { console.error('usage: imgdiff.mts <a> <b> [--max 2]'); process.exit(2); }
  let limit = 2;
  for (let i = 0; i < rest.length; i++) if (rest[i] === '--max') limit = Number(rest[++i]);

  const dir = statSync(aPath).isDirectory();
  const names = dir
    ? (await readdir(aPath)).filter((f) => f.endsWith('.png')).sort()
    : [null];

  let worst = 0, bad = 0;
  for (const name of names) {
    const fa = name ? path.join(aPath, name) : aPath;
    const fb = name ? path.join(bPath, name) : bPath;
    let r;
    try { r = compare(decodePng(await readFile(fa)), decodePng(await readFile(fb))); }
    catch (e: any) { console.log(`${(name || '').padEnd(20)} ERROR ${e.message}`); bad++; continue; }
    worst = Math.max(worst, r.mean);
    const flag = r.mean > limit ? '  <<' : '';
    if (r.mean > limit) bad++;
    console.log(
      `${(name || path.basename(aPath)).padEnd(20)} mean ${r.mean.toFixed(3).padStart(7)}  ` +
      `max ${String(r.max).padStart(3)}  >8/255 ${(r.over * 100).toFixed(3).padStart(7)}%${flag}`
    );
  }
  console.log(`\nworst mean delta ${worst.toFixed(3)}/255 over ${names.length} image(s)`);
  if (bad) { console.error(`${bad} image(s) over the ${limit}/255 mean threshold`); process.exit(1); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();

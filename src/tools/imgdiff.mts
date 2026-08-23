#!/usr/bin/env node
/**
 * Pixel diff between two shot directories (or two PNGs).
 *
 *   node src/tools/imgdiff.mts tmp/shots/before tmp/shots/after
 *   node src/tools/imgdiff.mts a.png b.png
 *   node src/tools/imgdiff.mts before after --heat tmp/heat --gain 8
 *
 * `--heat` writes a grey map of WHERE the two differ, amplified by `--gain`.
 * A mean of 1.8/255 with a max of 149 is either a whole frame nudged or one
 * band of pixels rewritten, and the numbers cannot tell those apart -- which is
 * exactly the question an ablation is asking.
 *
 * Prints mean and max per-channel delta and the fraction of pixels that differ
 * by more than a threshold, so "visually unchanged" can be a measurement rather
 * than an assertion. Exits non-zero if any pair exceeds `--max` (default 2/255
 * mean, which is below this project's own run-to-run capture noise of ~0.4).
 *
 * Decodes PNG itself: Playwright writes 8-bit RGBA non-interlaced, which is a
 * zlib stream plus one filter byte per row.
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { inflateSync, deflateSync } from 'node:zlib';
import { statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** One decoded image: raw samples plus the geometry needed to compare two. */
export interface DecodedPng {
  w: number;
  h: number;
  /** Row-major samples, `ch` per pixel. */
  data: Uint8Array;
  /** Channels per pixel: 4 RGBA, 3 RGB, 1 grey. */
  ch: number;
}

/** @returns RGBA8 */
export function decodePng(buf: Buffer): DecodedPng {
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
export function compare(a: DecodedPng, b: DecodedPng): {mean:number, max:number, over:number, size?: boolean } {
  if (a.w !== b.w || a.h !== b.h || a.ch !== b.ch) return { mean: NaN, max: 255, over: 1, size: false };
  let sum = 0, max = 0, over = 0;
  const n = a.data.length;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a.data[i] - b.data[i]);
    sum += d; if (d > max) max = d; if (d > 8) over++;
  }
  return { mean: sum / n, max, over: over / n, size: true };
}

/**
 * A grey heatmap of WHERE two frames differ, amplified so a real but local
 * effect is visible at page scale.
 *
 * A mean of 1.8/255 and a max of 149 describe two completely different
 * pictures — a whole frame nudged, or one band of pixels rewritten — and the
 * numbers alone cannot tell them apart. This is what makes an ablation
 * localise: hide a mesh, diff the raw renders, and the bright region is where
 * that mesh was. Without it the honest answer to "did the pass do anything
 * where I care" is "somewhere, by some amount".
 */
function heatmap(a: DecodedPng, b: DecodedPng, gain: number) {
  const { w, h } = a;
  const out = Buffer.alloc(h * (w * 4 + 1));
  const chA = a.data.length / (w * h);
  const chB = b.data.length / (w * h);
  let q = 0;
  for (let y = 0; y < h; y++) {
    out[q++] = 0;
    for (let x = 0; x < w; x++) {
      const ia = (y * w + x) * chA;
      const ib = (y * w + x) * chB;
      const d = Math.max(
        Math.abs(a.data[ia] - b.data[ib]),
        Math.abs(a.data[ia + 1] - b.data[ib + 1]),
        Math.abs(a.data[ia + 2] - b.data[ib + 2]),
      );
      const v = Math.min(255, Math.round(d * gain));
      out[q++] = v; out[q++] = v; out[q++] = v; out[q++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(out)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** PNG chunk CRC-32, table built on first use. */
let CRC_TABLE: Int32Array | null = null;
function crc32(buf: Buffer) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/**
 * Say which build each side came from, and refuse a comparison of a build with
 * itself.
 *
 * Under content-addressed builds, `imgdiff a1b2c3 d4e5f6 hero_full` is a
 * first-class statement about the code. The inverse is the trap: two captures
 * of the *same* sha are byte-identical by construction -- the second was very
 * likely a cache hit, and copying one file twice proves nothing at all. That
 * reads as "my change had no effect", which is the single most expensive wrong
 * conclusion this harness can produce, and it is the same shape as the
 * wrong-port bug `portowner.mts` was written after.
 *
 * A missing manifest is not an error: plenty of directories here were not
 * written by `shoot.mts`. Say nothing rather than guess.
 */
function provenance(aDir: string, bDir: string) {
  const read = (d: string): { build?: string, dirty?: boolean } | null => {
    try { return JSON.parse(readFileSync(path.join(d, 'manifest.json'), 'utf8')) as { build?: string }; }
    catch { return null; }
  };
  const a = read(aDir), b = read(bDir);
  if (!a?.build || !b?.build) return;
  console.log(`A: ${a.build}${a.dirty ? ' (LIVE TREE)' : ''}    B: ${b.build}${b.dirty ? ' (LIVE TREE)' : ''}`);
  if (a.dirty || b.dirty) {
    console.log('  note: a dirty-build frame is of somebody\'s live working tree and is not evidence.');
  }
  if (a.build === b.build && !a.dirty) {
    console.error(`\nREFUSED: both sides are ${a.build}. A build is byte-identical to itself by\n`
      + 'construction — the second capture was almost certainly served from the frame\n'
      + 'cache — so this diff says nothing about the code. Capture the other side at a\n'
      + 'different --build, or pass --dirty to compare your working tree against it.');
    process.exit(2);
  }
}

async function main() {
  const [aPath, bPath, ...rest] = process.argv.slice(2);
  if (!aPath || !bPath) {
    console.error('usage: imgdiff.mts <a> <b> [--max 2] [--heat <dir-or-file>] [--gain 8]');
    process.exit(2);
  }
  let limit = 2;
  let heat: string | null = null;
  let gain = 8;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--max') limit = Number(rest[++i]);
    else if (rest[i] === '--heat') heat = rest[++i];
    else if (rest[i] === '--gain') gain = Number(rest[++i]);
  }

  const dir = statSync(aPath).isDirectory();
  provenance(dir ? aPath : path.dirname(aPath), dir ? bPath : path.dirname(bPath));
  const names = dir
    ? (await readdir(aPath)).filter((f) => f.endsWith('.png')).sort()
    : [null];

  let worst = 0, bad = 0;
  for (const name of names) {
    const fa = name ? path.join(aPath, name) : aPath;
    const fb = name ? path.join(bPath, name) : bPath;
    let r;
    try {
      const pa = decodePng(await readFile(fa));
      const pb = decodePng(await readFile(fb));
      r = compare(pa, pb);
      if (heat && r.size) {
        const dest = name ? path.join(heat, name) : heat;
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, heatmap(pa, pb, gain));
      }
    }
    catch (e: unknown) { console.log(`${(name || '').padEnd(20)} ERROR ${e instanceof Error ? e.message : String(e)}`); bad++; continue; }
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

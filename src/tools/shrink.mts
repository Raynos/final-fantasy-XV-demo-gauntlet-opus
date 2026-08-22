#!/usr/bin/env node
/**
 * Recompress the shot archive to JPEG, keeping every frame.
 *
 *   node src/tools/shrink.mts                     # dry run: what would change
 *   node src/tools/shrink.mts --apply
 *   node src/tools/shrink.mts --keep r4,r5        # leave these dirs lossless
 *   node src/tools/shrink.mts --keep-latest 3     # ...and the N most recent (default 3)
 *   node src/tools/shrink.mts --quality 82 --apply
 *   node src/tools/shrink.mts tmp/shots/full --apply  # one directory
 *
 * `tmp/shots/` reached 1.7 GB of lossless captures that exist to be looked at. A
 * 1600x900 PNG is ~2.5 MB and the same frame as JPEG is ~250 KB, indexes and
 * opens the same, and looks the same at review size -- the archive is worth
 * keeping, the bytes are not.
 *
 * Two things stay lossless. `src/tools/imgdiff.mts` decodes PNG only and measures a
 * 1.5-1.9/255 noise floor, so the directories you are still diffing against must
 * keep their PNGs: the N most recent are held back automatically and `--keep`
 * names any others. And `_sheet*.png` files are not captures at all -- they are
 * derivatives `src/tools/sheet.mts` rebuilds in seconds, so they are deleted rather
 * than converted.
 *
 * Directories written in the last 10 minutes are skipped: a capture may be in
 * flight. `--force` overrides.
 *
 * Conversion uses `sips`, which ships with macOS. Without it, chromium (already
 * a dependency) does the same work through a canvas, more slowly.
 */
import { readdir, stat, readFile, writeFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const argv = process.argv.slice(2);
const flag = (n: any) => argv.includes(n);
const val = (n: any, d: any) => (argv.indexOf(n) === -1 ? d : argv[argv.indexOf(n) + 1]);
const positional = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));

const root = path.resolve(ROOT, positional[0] || 'shots');
const quality = Number(val('--quality', 82));
const keepNames = new Set(String(val('--keep', '')).split(',').filter(Boolean));
const keepLatest = Number(val('--keep-latest', 3));
const apply = flag('--apply');
const force = flag('--force');
const useChromium = flag('--chromium');

const MB = (b: any) => (b / 1e6).toFixed(1);
const isSheet = (f: any) => /^_sheet/.test(f);

/** sips is a system binary, not a dependency; fall back when it is not there. */
async function pickEncoder(): Promise<{ (src: any, out: any): Promise<void>, close?: () => Promise<void> }> {
  if (!useChromium) {
    try {
      await exec('sips', ['--version']);
      return async (src: any, out: any) => {
        await exec('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), src, '--out', out]);
      };
    } catch { /* fall through */ }
  }
  const { chromium } = await import('playwright');
  const { CHROMIUM_ARGS } = await import('./chromium.mts');
  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  const page = await browser.newPage();
  const encode: { (src: any, out: any): Promise<void>, close?: () => Promise<void> } = async (src: any, out: any) => {
    const data = `data:image/png;base64,${(await readFile(src)).toString('base64')}`;
    const b64 = await page.evaluate(async ([uri, q]: [string, number]) => {
      const img = await createImageBitmap(await (await fetch(uri)).blob());
      const canvas = new OffscreenCanvas(img.width, img.height);
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: q / 100 });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (const byte of buf) s += String.fromCharCode(byte);
      return btoa(s);
    }, [data, quality] as [string, number]);
    await writeFile(out, Buffer.from(b64, 'base64'));
  };
  encode.close = () => browser.close();
  return encode;
}

async function dirs() {
  const entries = await readdir(root, { withFileTypes: true });
  const found = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(root, e.name);
    found.push({ name: e.name, full, mtime: (await stat(full)).mtimeMs });
  }
  // A directory of loose PNGs is a shot directory too.
  if (entries.some((e) => e.isFile() && e.name.endsWith('.png'))) {
    found.push({ name: path.basename(root), full: root, mtime: (await stat(root)).mtimeMs });
  }
  found.sort((a, b) => b.mtime - a.mtime);
  found.slice(0, keepLatest).forEach((d) => keepNames.add(d.name));
  return found;
}

async function main() {
  const targets = await dirs();
  if (!targets.length) { console.error(`no shot directories under ${root}`); process.exit(1); }

  const plan = [];
  for (const d of targets) {
    const fresh = Date.now() - d.mtime < 10 * 60_000 && !force;
    const files = (await readdir(d.full)).filter((f) => f.endsWith('.png'));
    let convert = [];
    let sheets = [];
    let bytes = 0;
    let sheetBytes = 0;
    for (const f of files) {
      const size = (await stat(path.join(d.full, f))).size;
      if (isSheet(f)) { sheets.push(f); sheetBytes += size; } else { convert.push(f); bytes += size; }
    }
    const held = keepNames.has(d.name) || fresh;
    if (held) convert = [];             // lossless directories keep every capture as PNG
    if (!files.length) continue;
    plan.push({ ...d, convert, sheets, kept: held ? files.length - sheets.length : 0,
      bytes: held ? 0 : bytes, sheetBytes, held, fresh });
  }

  const totalPng = plan.reduce((n, p) => n + p.bytes, 0);
  const totalSheet = plan.reduce((n, p) => n + p.sheetBytes, 0);
  const nConv = plan.reduce((n, p) => n + p.convert.length, 0);
  const nSheet = plan.reduce((n, p) => n + p.sheets.length, 0);

  console.log(`${path.relative(ROOT, root)}: ${nConv} capture(s) to convert (${MB(totalPng)} MB), `
    + `${nSheet} rebuildable sheet(s) to delete (${MB(totalSheet)} MB)`);
  for (const p of plan) {
    const what = p.held
      ? `${String(p.kept).padStart(4)} png held lossless (${p.fresh ? 'written in the last 10 min' : 'baseline'})`
      : `${String(p.convert.length).padStart(4)} png  ${MB(p.bytes).padStart(7)} MB`;
    console.log(`  ${p.name.padEnd(16)} ${what}`
      + `${p.sheets.length ? `  + ${p.sheets.length} sheet(s) ${MB(p.sheetBytes)} MB` : ''}`);
  }
  if (!apply) {
    console.log('\ndry run. --apply to convert, --keep <dirs> to hold more of them lossless.');
    return;
  }

  const encode = await pickEncoder();
  let before = 0;
  let after = 0;
  let failed = 0;
  for (const p of plan) {
    for (const f of p.sheets) await unlink(path.join(p.full, f));
    for (const f of p.convert) {
      const src = path.join(p.full, f);
      const out = src.replace(/\.png$/, '.jpg');
      const size = (await stat(src)).size;
      try {
        await encode(src, out);
        const got = (await stat(out)).size;
        // Only drop the original once a plausible replacement is on disk.
        if (got < 1024) throw new Error(`suspicious ${got} byte output`);
        await unlink(src);
        before += size;
        after += got;
      } catch (e: any) {
        failed++;
        console.error(`  ! ${path.relative(root, src)}: ${e.message.split('\n')[0]}`);
      }
    }
    process.stdout.write(`  ${p.name} done\r`);
  }
  await encode.close?.();
  console.log(`\n${MB(before)} MB -> ${MB(after)} MB in captures`
    + `${totalSheet ? `, ${MB(totalSheet)} MB of sheets removed` : ''}`
    + `  (${MB(before - after + totalSheet)} MB reclaimed${failed ? `, ${failed} failed` : ''})`);
}

await main();

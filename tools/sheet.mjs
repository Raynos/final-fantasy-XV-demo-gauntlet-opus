#!/usr/bin/env node
/**
 * Contact sheet: tile a directory of shot PNGs into one image so a critic can
 * assess the whole game in a single look.
 *
 *   node tools/sheet.mjs shots/round1                 -> shots/round1/_sheet.png
 *   node tools/sheet.mjs shots/round1 --cols 3 --w 2400
 *
 * Uses the already-installed chromium (no extra image deps).
 */
import { chromium } from 'playwright';
import { CHROMIUM_ARGS } from './chromium.mjs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const dir = path.resolve(args[0] || 'shots');
const cols = Number(args[args.indexOf('--cols') + 1]) || 3;
const width = Number(args[args.indexOf('--w') + 1]) || 2400;

const files = (await readdir(dir)).filter((f) => f.endsWith('.png') && !f.startsWith('_')).sort();
if (!files.length) { console.error(`no PNGs in ${dir}`); process.exit(1); }

// Reference the PNGs by relative path from an HTML file written into the shot
// directory, rather than inlining them as data URIs. At 139 shots the base64
// payload is hundreds of megabytes and simply kills the page.
const cells = files.map((f) => ({ name: path.basename(f, '.png'), src: f }));

const html = `<!doctype html><meta charset=utf8><style>
  body{margin:0;background:#0a0b0e;font:11px/1.4 ui-monospace,Menlo,monospace;color:#8d97a8}
  .grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;padding:10px}
  figure{margin:0}
  img{width:100%;display:block;border:1px solid #1b2029}
  figcaption{padding:4px 2px;letter-spacing:.12em;text-transform:uppercase}
</style><div class=grid>${
  cells.map((c) => `<figure><img src="${c.src}" loading="eager"><figcaption>${c.name}</figcaption></figure>`).join('')
}</div>`;

const htmlPath = path.join(dir, '_sheet.html');
await writeFile(htmlPath, html);

const browser = await chromium.launch({ args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width, height: 800 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'load', timeout: 180000 });
// every <img> decoded before we screenshot, or the sheet has holes in it
await page.evaluate(() => Promise.all(
  [...document.images].map((i) => (i.complete ? null : i.decode().catch(() => {})))
));
const out = path.join(dir, '_sheet.png');
await writeFile(out, await page.locator('.grid').screenshot());
await browser.close();
console.log(`${cells.length} shots -> ${out}`);

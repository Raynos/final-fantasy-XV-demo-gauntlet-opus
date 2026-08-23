#!/usr/bin/env node
/**
 * Contact sheet: tile a directory of shot images into pages a critic can read.
 *
 *   node src/tools/sheet.mts tmp/shots/round1                 -> tmp/shots/round1/_sheet-1.jpg ...
 *   node src/tools/sheet.mts tmp/shots/round1 --cols 3 --rows 4 --w 1536
 *   node src/tools/sheet.mts tmp/shots/round1 --png           -> lossless pages instead
 *
 * Paginated on purpose. The old single-image sheet grew with the corpus --
 * `tmp/shots/full/_sheet.png` reached 45 MB and roughly 30 000 px tall, and an agent
 * reading it got the whole thing squeezed into a 1568 px long edge, i.e. a
 * thumbnail strip in which nothing is legible. A page of 12 shots at 1536 px
 * wide lands just under that limit, so every page is read at full fidelity.
 *
 * `_sheet.html` still holds every shot in one scrollable document for a human.
 *
 * Renders through the shared capture daemon (no extra image deps). A contact
 * sheet needs a browser but not a game, so it takes a BLANK lease: no build
 * server, no boot, but a real slot against the machine-wide browser budget.
 * Six tools use a browser as an image renderer, and six uncounted chromiums is
 * six uncounted chromiums.
 */
import { withBlankPage } from './harness.mts';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const dir = path.resolve(args[0] || 'shots');
const num = (flag: string, dflt: number) => {
  const i = args.indexOf(flag);
  return i === -1 ? dflt : Number(args[i + 1]) || dflt;
};
const cols = num('--cols', 3);
const rows = num('--rows', 4);
const width = num('--w', 1536);
const png = args.includes('--png');

const files = (await readdir(dir))
  .filter((f) => /\.(png|jpg|jpeg)$/i.test(f) && !f.startsWith('_'))
  .sort();
if (!files.length) { console.error(`no images in ${dir}`); process.exit(1); }

// Reference the images by relative path from an HTML file written into the shot
// directory, rather than inlining them as data URIs. At 139 shots the base64
// payload is hundreds of megabytes and simply kills the page.
const cells = files.map((f) => ({ name: f.replace(/\.(png|jpg|jpeg)$/i, ''), src: f }));
const perPage = cols * rows;
const pages = [];
for (let i = 0; i < cells.length; i += perPage) pages.push(cells.slice(i, i + perPage));

const figure = (c: { src: string, name: string }) =>
  `<figure><img src="${c.src}" loading="eager"><figcaption>${c.name}</figcaption></figure>`;

const html = `<!doctype html><meta charset=utf8><style>
  body{margin:0;background:#0a0b0e;font:11px/1.4 ui-monospace,Menlo,monospace;color:#8d97a8}
  .page{display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;padding:10px}
  figure{margin:0}
  img{width:100%;display:block;border:1px solid #1b2029}
  figcaption{padding:4px 2px;letter-spacing:.12em;text-transform:uppercase}
</style>${
  pages.map((p) => `<div class=page>${p.map(figure).join('')}</div>`).join('')
}`;

const htmlPath = path.join(dir, '_sheet.html');
await writeFile(htmlPath, html);

const written: string[] = [];
let tallest = 0;
await withBlankPage({ w: width, h: 800, agent: 'sheet', lane: 'sweep' }, async (page) => {
  await page.goto(`file://${htmlPath}`, { waitUntil: 'load', timeout: 180000 });
  // every <img> decoded before we screenshot, or the sheet has holes in it
  await page.evaluate(() => Promise.all(
    [...document.images].map((i) => (i.complete ? null : i.decode().catch(() => {})))
  ));
  for (let i = 0; i < pages.length; i++) {
    const el = page.locator('.page').nth(i);
    const out = path.join(dir, `_sheet-${i + 1}.${png ? 'png' : 'jpg'}`);
    await writeFile(out, await el.screenshot(png ? { type: 'png' } : { type: 'jpeg', quality: 86 }));
    tallest = Math.max(tallest, Math.round((await el.boundingBox())?.height ?? 0));
    written.push(out);
  }
});

console.log(`${cells.length} shots -> ${written.length} page(s) in ${path.relative(process.cwd(), dir)}`);
for (const w of written) console.log(`  ${path.basename(w)}`);
// A leftover single-image sheet from before pagination is stale the moment these
// pages are written, and it is the one an agent is most likely to reach for.
const stale = (await readdir(dir)).filter((f) => /^_sheet(-[a-z_0-9]+)?\.png$/.test(f));
if (stale.length) {
  console.log(`  stale from the old single-image sheet, safe to delete: ${stale.join(', ')}`);
}
// Anything over 1568 px on its long edge is downscaled before a model sees it.
if (Math.max(tallest, width) > 1568) {
  console.log(`  note: pages are up to ${Math.max(tallest, width)} px; lower --rows or --w to stay under 1568`);
}

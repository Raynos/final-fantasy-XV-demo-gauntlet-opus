#!/usr/bin/env node
/**
 * Corpus driver: capture every shot in `src/game/Shots.js` and lay the result
 * out as one contact sheet per category, so a reviewer can look at "every
 * zone", "every dungeon room" or "every enemy" as a single image.
 *
 *   node tools/corpus.mjs                       # capture all, then sheet all
 *   node tools/corpus.mjs --only zones,ui       # just those categories
 *   node tools/corpus.mjs --sheet               # re-sheet what is on disk
 *   node tools/corpus.mjs --list                # print the category index
 *   node tools/corpus.mjs --out shots/corpus --cols 4 --w 3200
 *
 * Categories come from the `// --- name ---` comment headers in Shots.js, so
 * adding a shot under a header files it automatically.
 *
 * Why this exists rather than a plain `tools/shoot.mjs` run: the capture
 * daemon answers one HTTP request per run, and undici gives up on response
 * *headers* after 300 s. A 128-shot corpus takes longer than that, so a single
 * call fails even though every frame rendered. This chunks the run (default 20
 * shots) and keeps the daemon warm between chunks, which also means a failure
 * costs one chunk instead of the whole corpus.
 */
import http from 'node:http';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDaemon, APP_PORT, DAEMON_PORT } from './daemon.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const o = {
    out: 'shots/corpus', cols: 4, w: 3200, chunk: 0, sheetOnly: false, list: false,
    only: null, settle: 60, warm: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sheet') o.sheetOnly = true;
    else if (a === '--warm') o.warm = true;
    else if (a === '--list') o.list = true;
    else if (a === '--only') o.only = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--cols') o.cols = Number(argv[++i]);
    else if (a === '--w') o.w = Number(argv[++i]);
    else if (a === '--chunk') o.chunk = Number(argv[++i]);
    else if (a === '--settle') o.settle = Number(argv[++i]);
    else throw new Error(`unknown flag ${a}`);
  }
  return o;
}

/**
 * Read Shots.js and bucket every shot name under the `// --- header ---`
 * comment that precedes it.
 * @returns {{order:string[], groups:Map<string,string[]>, docs:Map<string,string>}}
 */
async function index() {
  const src = await readFile(path.join(ROOT, 'src/game/Shots.js'), 'utf8');
  const body = src.slice(src.indexOf('export const SHOTS'));
  const groups = new Map();
  const docs = new Map();
  const order = [];
  let cat = 'misc';
  let pendingDoc = null;
  for (const line of body.split('\n')) {
    const head = line.match(/^\s*\/\/\s*---\s*(.+?)\s*-{2,}\s*$/);
    if (head) {
      cat = head[1].toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      if (!groups.has(cat)) { groups.set(cat, []); order.push(cat); }
      continue;
    }
    const m = line.match(/^\s{2}([a-zA-Z0-9_]+):\s*\{/);
    if (m) {
      if (!groups.has(cat)) { groups.set(cat, []); order.push(cat); }
      groups.get(cat).push(m[1]);
      pendingDoc = m[1];                       // `doc:` sits inside the object
      continue;
    }
    const doc = line.match(/^\s*doc:\s*['"](.*)['"],?\s*$/);
    if (doc && pendingDoc) { docs.set(pendingDoc, doc[1]); pendingDoc = null; }
  }
  return { order, groups, docs };
}

/**
 * POST to the capture daemon over raw `node:http`.
 *
 * Deliberately not `fetch`: undici aborts a request whose *headers* have not
 * arrived within 300 s, and the daemon serialises work, so a corpus run behind
 * another agent's job blows that budget while rendering perfectly well. This
 * has no header deadline, only a generous socket-idle one.
 */
const callDaemon = (route, body) => new Promise((resolve, reject) => {
  const payload = Buffer.from(JSON.stringify(body));
  const req = http.request({
    host: '127.0.0.1', port: DAEMON_PORT, path: route, method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': payload.length },
  }, (res) => {
    let raw = '';
    res.setEncoding('utf8');
    res.on('data', (d) => { raw += d; });
    res.on('end', () => {
      let j;
      try { j = JSON.parse(raw); } catch { return reject(new Error(`daemon: ${raw.slice(0, 200)}`)); }
      return res.statusCode === 200 ? resolve(j) : reject(new Error(j.error || `daemon ${res.statusCode}`));
    });
  });
  req.setTimeout(45 * 60_000, () => req.destroy(new Error('daemon socket idle')));
  req.on('error', reject);
  req.end(payload);
});

/** Tile a list of PNGs into one sheet, captioned with each shot's `doc`. */
async function sheet(dir, names, docs, { cols, w, title, out }) {
  const { chromium } = await import('playwright');
  const cells = [];
  for (const n of names) {
    try {
      const data = await readFile(path.join(dir, `${n}.png`));
      cells.push({ n, data: `data:image/png;base64,${data.toString('base64')}`, doc: docs.get(n) || '' });
    } catch { /* not captured */ }
  }
  if (!cells.length) return 0;
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const html = `<!doctype html><meta charset=utf8><style>
    body{margin:0;background:#0a0b0e;font:12px/1.45 ui-monospace,Menlo,monospace;color:#8d97a8}
    h1{font:600 20px/1 ui-monospace,Menlo,monospace;color:#e6ecf5;letter-spacing:.18em;
       text-transform:uppercase;margin:0;padding:16px 12px 4px}
    .grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px;padding:10px 12px 18px}
    figure{margin:0}
    img{width:100%;display:block;border:1px solid #1b2029}
    figcaption{padding:5px 2px 0}
    .n{color:#d8b26a;letter-spacing:.12em;text-transform:uppercase}
    .d{color:#7a8598}
  </style><div class=page><h1>${esc(title)} — ${cells.length}</h1><div class=grid>${
    cells.map((c) => `<figure><img src="${c.data}"><figcaption><div class=n>${esc(c.n)}</div>`
      + `<div class=d>${esc(c.doc)}</div></figcaption></figure>`).join('')
  }</div></div>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  await page.setContent(html);
  await page.waitForLoadState('networkidle');
  await writeFile(out, await page.locator('.page').screenshot());
  await browser.close();
  return cells.length;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const { order, groups, docs } = await index();
  const cats = o.only ? order.filter((c) => o.only.includes(c)) : order;

  if (o.list) {
    for (const c of order) console.log(`${c.padEnd(22)} ${groups.get(c).length.toString().padStart(3)}  ${groups.get(c).join(' ')}`);
    console.log(`\n${order.length} categories, ${[...groups.values()].reduce((a, b) => a + b.length, 0)} shots`);
    return;
  }

  const outDir = path.isAbsolute(o.out) ? o.out : path.join(ROOT, o.out);
  await mkdir(outDir, { recursive: true });
  const names = cats.flatMap((c) => groups.get(c));

  if (!o.sheetOnly) {
    const t0 = Date.now();
    if (await ensureDaemon()) console.log(`[corpus] started capture daemon (app on ${APP_PORT})`);
    const errors = [];
    const step = o.chunk > 0 ? o.chunk : names.length;
    for (let i = 0; i < names.length; i += step) {
      const batch = names.slice(i, i + step);
      // Cold for the first batch unless --warm. A page that has already served
      // another invocation comes back with a stale sky: the same shot renders
      // a lit cloud deck on a fresh page and a black zenith on a reused one,
      // so a corpus that is going to be compared against itself must boot.
      const r = await callDaemon('/shots', {
        shots: batch, out: outDir, settle: o.settle, w: 1600, h: 900, cold: i === 0 && !o.warm,
      });
      for (const s of r.results) {
        console.log(`  ${s.name.padEnd(26)} ${String(s.triangles).padStart(9)} tris ${String(s.calls).padStart(5)} calls ${String(s.ms).padStart(6)}ms`);
      }
      errors.push(...r.errors);
      console.log(`[corpus] ${i + batch.length}/${names.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    const uniq = [...new Set(errors)];
    if (uniq.length) {
      console.error(`\n${uniq.length} page error(s):`);
      for (const e of uniq.slice(0, 20)) console.error('  ' + e.split('\n')[0]);
    }
    console.log(`\n[corpus] ${names.length} shots in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    if (uniq.length) process.exitCode = 1;
  }

  let total = 0;
  for (const c of cats) {
    const n = await sheet(outDir, groups.get(c), docs, {
      cols: o.cols, w: o.w, title: c.replace(/_/g, ' '), out: path.join(outDir, `_sheet-${c}.png`),
    });
    if (n) console.log(`  _sheet-${c}.png  ${n}`);
    total += n;
  }
  // One "everything" sheet, in slices: a single page holding 128 full-res PNGs
  // as data URIs is several hundred MB of DOM and takes the render tab down.
  const all = (await readdir(outDir)).filter((f) => f.endsWith('.png') && !f.startsWith('_'))
    .map((f) => path.basename(f, '.png')).sort();
  const SLICE = 20;
  for (let i = 0, page = 1; i < all.length; i += SLICE, page++) {
    const out = all.length <= SLICE ? '_sheet.png' : `_sheet-all-${page}.png`;
    await sheet(outDir, all.slice(i, i + SLICE), docs, {
      cols: o.cols, w: o.w, title: `corpus ${i + 1}-${Math.min(i + SLICE, all.length)}`,
      out: path.join(outDir, out),
    });
    console.log(`  ${out}`);
  }
  console.log(`\n${total} shots across ${cats.length} sheets -> ${path.relative(ROOT, outDir)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

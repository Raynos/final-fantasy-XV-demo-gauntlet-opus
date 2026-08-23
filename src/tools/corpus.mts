#!/usr/bin/env node
/**
 * Corpus driver: capture every shot in `src/game/Shots.ts` and lay the result
 * out as one contact sheet per category, so a reviewer can look at "every
 * zone", "every dungeon room" or "every enemy" as a single image.
 *
 *   node src/tools/corpus.mts                       # capture all, then sheet all
 *   node src/tools/corpus.mts --only zones,ui       # just those categories
 *   node src/tools/corpus.mts --sheet               # re-sheet what is on disk
 *   node src/tools/corpus.mts --list                # print the category index
 *   node src/tools/corpus.mts --out tmp/shots/corpus --cols 3 --w 1536
 *
 * Sheets are JPEG and sized so a page lands under the 1568 px long edge a model
 * sees. A 3200 px sheet of 20 shots was 45 MB and arrived as an illegible strip.
 *
 * Two authoring aids, because a shot is only worth taking if its subject is
 * actually in frame and both of these were hand-arithmetic before:
 *
 *   node src/tools/corpus.mts --frame '[{"cam":[x,y,z],"sub":[x,y,z],"fov":42,"u":0.3,"v":0.1}]'
 *     `target` is the point the frame centres on, so a landmark only lands on
 *     a third if you aim *beside* it. Give a camera, the subject and where it
 *     should sit on screen (u right, v up, both -1..1) and this prints the
 *     `pos`/`target`/`fov` triple to paste into Shots.ts.
 *
 *   node src/tools/corpus.mts --scout '[{"name":"x","sx":900,"sz":-1180,"dist":[600,1400]}]'
 *     Builds the real heightfield (`src/world/terrain/Field.ts`, ~8 s) and
 *     sweeps a ring of camera positions around a subject, scoring each on
 *     elevation above it, an unobstructed sight line, and how much relief lies
 *     beyond it. Prints the best stand. Use it before inventing coordinates:
 *     several shots in this corpus' history framed empty ground because they
 *     were authored against a world that had since moved.
 *
 * Categories come from the `// --- name ---` comment headers in Shots.ts, so
 * adding a shot under a header files it automatically.
 *
 * Why this exists rather than a plain `src/tools/shoot.mts` run:
 *   - the capture daemon answers one HTTP request per run and undici gives up
 *     on response *headers* after 300 s, so a ~140-shot corpus fails at the
 *     client even though every frame rendered; this talks to the daemon over
 *     raw `node:http`, which has no header deadline,
 *   - the run is **cold by default**. A page that has already served another
 *     invocation comes back with degraded sky state — the same shot renders a
 *     lit cloud deck on a fresh page and a black zenith on a reused one — and a
 *     corpus is meaningless if half of it was shot under different conditions.
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, ensureDaemon, harnessArgs, announceBuild, withBlankPage, runTool } from './harness.mts';
import type { ShotsResponse } from './harness.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs(argv: string[]) {
  const o: {
    out: string, cols: number, w: number, chunk: number, sheetOnly: boolean, list: boolean,
    only: string[] | null, settle: number, warm: boolean, frame: FrameJob[] | null, scout: ScoutJob[] | null,
  } = {
    out: 'tmp/shots/corpus', cols: 3, w: 1536, chunk: 0, sheetOnly: false, list: false,
    only: null, settle: 60, warm: false, frame: null, scout: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sheet') o.sheetOnly = true;
    else if (a === '--frame') o.frame = JSON.parse(argv[++i]);
    else if (a === '--scout') o.scout = JSON.parse(argv[++i]);
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
 * Read Shots.ts and bucket every shot name under the `// --- header ---`
 * comment that precedes it.
 */
async function index(): Promise<{order: string[], groups: Map<string, string[]>, docs: Map<string, string>}> {
  const src = await readFile(path.join(ROOT, 'src/game/Shots.ts'), 'utf8');
  // `SHOT_TABLE` is the literal; `SHOTS` below it is the typed re-export.
  const body = src.slice(src.indexOf('const SHOT_TABLE'));
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


/** How one contact sheet is laid out. */
interface SheetOpts {
  cols: number;
  /** Page width, px. */
  w: number;
  title: string;
  /** Output path for the rendered jpeg. */
  out: string;
}

/** Tile a list of PNGs into one sheet, captioned with each shot's `doc`. */
async function sheet(dir: string, names: string[], docs: Map<string, string>, { cols, w, title, out }: SheetOpts) {
  const cells = [];
  for (const n of names) {
    try {
      const data = await readFile(path.join(dir, `${n}.png`));
      cells.push({ n, data: `data:image/png;base64,${data.toString('base64')}`, doc: docs.get(n) || '' });
    } catch { /* not captured */ }
  }
  if (!cells.length) return 0;
  const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ENT[c] ?? c);
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
  // A blank lease: this needs a browser to lay out HTML, not a game. It still
  // counts against the machine-wide budget, which is the whole reason it is not
  // simply launching its own.
  await withBlankPage({ w, h: 900, agent: 'corpus', lane: 'sweep' }, async (page) => {
    await page.setContent(html);
    await page.waitForLoadState('networkidle');
    await writeFile(out, await page.locator('.page').screenshot(
      out.endsWith('.png') ? { type: 'png' } : { type: 'jpeg', quality: 86 }
    ));
  });
  return cells.length;
}

/** One framing to solve, as `--frame` accepts it on the command line. */
interface FrameJob {
  name?: string;
  /** Camera position, `[x, y, z]`. */
  cam: number[];
  /** What to frame, `[x, y, z]`. */
  sub: number[];
  /** Vertical fov, degrees. */
  fov?: number;
  /** Where in frame the subject should land, -1..1. */
  u?: number;
  v?: number;
}

/** One camera stand to sweep for, as `--scout` accepts it. */
interface ScoutJob {
  name?: string;
  /** Subject position in world metres. */
  sx: number;
  sz: number;
  /** Eye height above the subject's ground, metres. */
  eye?: number;
  /** Camera distances to try, `[min, max]`. */
  dist?: [number, number];
  /** Bearings to sweep, degrees, `[from, to]`. */
  bear?: [number, number];
}

/**
 * Solve the `target` that puts `sub` at screen position (u, v) for a camera at
 * `cam` with vertical fov `fov`. u is right, v is up, both in -1..1.
 */
function frame(jobs: FrameJob[], aspect = 1600 / 900) {
  for (const j of jobs) {
    const [cx, cy, cz] = j.cam;
    const [sx, sy, sz] = j.sub;
    const fov = j.fov ?? 42, u = j.u ?? 0, v = j.v ?? 0;
    const d = [sx - cx, sy - cy, sz - cz];
    const len = Math.hypot(...d);
    const f = d.map((n) => n / len);
    const rl = Math.hypot(f[2], f[0]);
    const r = [f[2] / rl, 0, -f[0] / rl];
    const up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const tanV = Math.tan((fov / 2) * Math.PI / 180);
    const du = -u * tanV * aspect * len, dv = -v * tanV * len;
    const t = [sx + r[0] * du + up[0] * dv, sy + up[1] * dv, sz + r[2] * du + up[2] * dv];
    console.log(`${(j.name || '').padEnd(20)} pos: [${j.cam.map((n) => +n.toFixed(1)).join(', ')}], `
      + `target: [${t.map((n) => +n.toFixed(0)).join(', ')}], fov: ${fov},   // ${len.toFixed(0)} m out`);
  }
}

/**
 * Sweep a ring of camera stands around a subject and print the best one.
 * Score = sight-line clearance + how far the camera stands above the subject
 * + how much relief sits behind it, which is what makes a vista read.
 */
async function scout(jobs: ScoutJob[]) {
  const { Field } = await import('../world/terrain/Field.ts');
  const t0 = Date.now();
  const field = new Field(1337);
  field.build();
  console.error(`[scout] field built in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const h = (x: number, z: number) => field.heightAt(x, z);
  for (const j of jobs) {
    const sy = h(j.sx, j.sz);
    const eye = j.eye ?? 2.4;
    const [b0, b1] = j.bear ?? [0, 356];
    const [d0, d1] = j.dist ?? [500, 900];
    let best = null;
    for (let b = b0; b <= b1; b += 4) {
      const a = (b * Math.PI) / 180;
      for (let d = d0; d <= d1; d += 40) {
        const cx = j.sx + Math.sin(a) * d, cz = j.sz + Math.cos(a) * d;
        if (Math.abs(cx) > 4000 || Math.abs(cz) > 4000) continue;
        const cy = h(cx, cz) + eye;
        let clear = 1e9;
        for (let t = 0.06; t < 0.98; t += 0.03) {
          const px = cx + (j.sx - cx) * t, pz = cz + (j.sz - cz) * t;
          clear = Math.min(clear, cy + (sy - cy) * t - h(px, pz));
        }
        let back = 0;
        for (let e = 200; e <= 1400; e += 100) {
          back = Math.max(back, h(j.sx - Math.sin(a) * e, j.sz - Math.cos(a) * e) - sy);
        }
        const score = Math.min(clear, 40) * 2 + Math.min(cy - sy, 160) * 1.4 + Math.min(back, 300) * 0.5;
        if (!best || score > best.score) best = { score, cx, cy, cz, d, clear, back, rise: cy - sy };
      }
    }
    console.log(`${(j.name || '').padEnd(20)} pos: [${best!.cx.toFixed(0)}, ${best!.cy.toFixed(1)}, ${best!.cz.toFixed(0)}]`
      + `  sub: [${j.sx}, ${sy.toFixed(1)}, ${j.sz}]  ${best!.d} m out, `
      + `${best!.rise.toFixed(0)} m above, clearance ${best!.clear.toFixed(1)} m, backdrop ${best!.back.toFixed(0)} m`);
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const ha = harnessArgs(process.argv.slice(2), { lane: 'sweep', agent: 'corpus' });
  if (o.frame) return frame(o.frame);
  if (o.scout) return scout(o.scout);
  const { order, groups, docs } = await index();
  const cats = o.only ? order.filter((c) => o.only!.includes(c)) : order;

  if (o.list) {
    for (const c of order) console.log(`${c.padEnd(22)} ${groups.get(c)!.length.toString().padStart(3)}  ${groups.get(c)!.join(' ')}`);
    console.log(`\n${order.length} categories, ${[...groups.values()].reduce((a, b) => a + b.length, 0)} shots`);
    return;
  }

  const outDir = path.isAbsolute(o.out) ? o.out : path.join(ROOT, o.out);
  await mkdir(outDir, { recursive: true });
  const names = cats.flatMap((c) => groups.get(c));

  if (!o.sheetOnly) {
    const t0 = Date.now();
    if (await ensureDaemon()) console.log('[corpus] started the capture daemon');
    announceBuild(ha);
    const errors = [];
    const step = o.chunk > 0 ? o.chunk : names.length;
    for (let i = 0; i < names.length; i += step) {
      const batch = names.slice(i, i + step);
      // Cold for the first batch unless --warm. A page that has already served
      // another invocation comes back with a stale sky: the same shot renders
      // a lit cloud deck on a fresh page and a black zenith on a reused one,
      // so a corpus that is going to be compared against itself must boot.
      const r = await call<ShotsResponse>('/shots', {
        shots: batch, out: outDir, settle: o.settle, w: 1600, h: 900, cold: i === 0 && !o.warm,
        // A corpus is the definition of the sweep lane: it must never starve a
        // co-agent's single `fix` shot, and it is long enough that fair-share
        // across agents is what keeps everyone else's captures answerable.
        build: ha.build, lane: 'sweep', agent: ha.agent,
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
    const n = await sheet(outDir, groups.get(c) ?? [], docs, {
      cols: o.cols, w: o.w, title: c.replace(/_/g, ' '), out: path.join(outDir, `_sheet-${c}.jpg`),
    });
    if (n) console.log(`  _sheet-${c}.jpg  ${n}`);
    total += n;
  }
  // One "everything" sheet, in slices: a single page holding 128 full-res PNGs
  // as data URIs is several hundred MB of DOM and takes the render tab down.
  const all = (await readdir(outDir)).filter((f) => f.endsWith('.png') && !f.startsWith('_'))
    .map((f) => path.basename(f, '.png')).sort();
  const SLICE = 12;
  for (let i = 0, page = 1; i < all.length; i += SLICE, page++) {
    const out = all.length <= SLICE ? '_sheet.jpg' : `_sheet-all-${page}.jpg`;
    await sheet(outDir, all.slice(i, i + SLICE), docs, {
      cols: o.cols, w: o.w, title: `corpus ${i + 1}-${Math.min(i + SLICE, all.length)}`,
      out: path.join(outDir, out),
    });
    console.log(`  ${out}`);
  }
  console.log(`\n${total} shots across ${cats.length} sheets -> ${path.relative(ROOT, outDir)}`);
}

await runTool(main);

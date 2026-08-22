#!/usr/bin/env node
/**
 * Procedural texture bake.
 *
 *   node src/tools/texbake.mts             # the Node bake, if stale
 *   node src/tools/texbake.mts --force     # always re-bake
 *   node src/tools/texbake.mts --check     # exit 0 if fresh, 1 if stale
 *   node src/tools/texbake.mts --canvas    # the browser bake (painted faces)
 *
 * The sibling of `src/tools/bake.mts`. That one caches the terrain field; this
 * one caches every keyed `DataTexture` the world dressing synthesises — see
 * `src/engine/TexBake.ts` for why, and for the container format.
 *
 * It works by importing the *game's own* material modules under Node and
 * calling their factories with `TexBake` in recording mode, so the bytes come
 * from the shipping generator rather than a second implementation of it. The
 * only thing Node lacks is a canvas, and the sign faces want one — so a stub
 * stands in. Those textures are drawn, not computed, they cost single-digit
 * milliseconds, and they are not keyed, so nothing records them and the browser
 * keeps drawing them for real.
 */
import { readFile, writeFile, mkdir, stat, rm } from 'node:fs/promises';
import http from 'node:http';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BAKE_DIR = path.join(ROOT, 'src', 'public', 'baked');
const OUT = path.join(BAKE_DIR, 'tex.bin.gz');
const STAMP = path.join(BAKE_DIR, 'tex.json');
const CANVAS_OUT = path.join(BAKE_DIR, 'texc.bin.gz');
const CANVAS_STAMP = path.join(BAKE_DIR, 'texc.json');

/**
 * Everything whose contents can change the baked texels. A file that feeds a
 * keyed generator and is missing from this list is a stale-cache bug, so the
 * list errs wide: `Rng`/`Noise` are here because every height function calls
 * them.
 */
export const TEX_SOURCES = [
  'src/engine/TexBake.ts',
  'src/util/TextureGen.ts',
  'src/util/Noise.ts',
  'src/util/Rng.ts',
  'src/world/town/TownMaterials.ts',
  'src/world/props/PropMaterials.ts',
  'src/world/dungeons/kit/InteriorMaterials.ts',
];

/**
 * Everything whose contents can change the *painted* texels.
 *
 * Wider than it looks necessary, on purpose. The face map is authored in
 * canonical head metres and projected through the head's own UV, so the
 * **sculpt** moves these pixels as surely as the paint does — a change to
 * `Sculpt.ts` or `Anatomy.ts` that nobody thought of as a texture change would
 * otherwise leave every face in the world one version behind, silently. See
 * `project/LANDMINES.md`, "a stale texel bake is the one cache failure with no
 * symptom".
 */
const CANVAS_SOURCES = [
  'src/engine/TexBake.ts',
  'src/characters/rig/Face.ts',
  'src/characters/rig/Look.ts',
  'src/characters/rig/Sculpt.ts',
  'src/characters/rig/Anatomy.ts',
  'src/characters/rig/Skeleton.ts',
  'src/characters/npc/NpcCast.ts',
  'src/characters/npc/NpcRig.ts',
  'src/characters/rig/Character.ts',
  'src/characters/Cast.ts',
  'src/util/Noise.ts',
  'src/util/Rng.ts',
];

/** @returns content hash of a source list */
async function hashOf(sources: string[]): Promise<string> {
  const hash = createHash('sha256');
  for (const rel of sources) {
    const p = path.join(ROOT, rel);
    if (!existsSync(p)) continue;
    hash.update(rel);
    hash.update(await readFile(p));
  }
  return hash.digest('hex').slice(0, 16);
}

/** @returns content hash of the generator sources */
export async function texSourceHash(): Promise<string> { return hashOf(TEX_SOURCES); }

/** @returns true when the browser-baked artifact matches its sources */
export async function canvasIsFresh(): Promise<boolean> {
  if (!existsSync(CANVAS_OUT) || !existsSync(CANVAS_STAMP)) return false;
  try {
    const stamp = JSON.parse(await readFile(CANVAS_STAMP, 'utf8'));
    return stamp.hash === (await hashOf(CANVAS_SOURCES)) && (await stat(CANVAS_OUT)).size > 1024;
  } catch { return false; }
}

/**
 * Delete a stale browser-baked artifact.
 *
 * The runtime cannot tell a stale cache from a fresh one — it has no way to
 * hash the sources — so the only safe thing to do with one is remove it. The
 * page then regenerates, which is correct and merely slower, instead of
 * rendering fifteen faces that no longer match their sculpt.
 *
 * @returns true if something was deleted
 */
export async function pruneStaleCanvasBake(): Promise<boolean> {
  if (!existsSync(CANVAS_OUT) || await canvasIsFresh()) return false;
  await rm(CANVAS_OUT, { force: true });
  await rm(CANVAS_STAMP, { force: true });
  return true;
}

/** @returns true when the artifact already matches the sources */
export async function texIsFresh(): Promise<boolean> {
  if (!existsSync(OUT) || !existsSync(STAMP)) return false;
  try {
    const stamp = JSON.parse(await readFile(STAMP, 'utf8'));
    return stamp.hash === (await texSourceHash()) && (await stat(OUT)).size > 1024;
  } catch { return false; }
}

/**
 * A canvas that answers every 2D call and draws nothing.
 *
 * Only the sign faces reach for one, and they are `canvasTexture` calls that
 * `TexBake` does not key — so the stub's output is discarded and never reaches
 * the artifact. It exists so that importing the module does not throw.
 */
function installCanvasStub() {
  if (typeof globalThis.document !== 'undefined') return;
  const makeCtx = (canvas: unknown) => new Proxy({} as Record<string, unknown>, {
    get(t, k: string) {
      if (k === 'canvas') return canvas;
      if (k === 'measureText') return () => ({ width: 8 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'createPattern') return () => null;
      if (k === 'getImageData') return (_x: number, _y: number, w: number, h: number) =>
        ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
      if (k === 'createImageData') return (w: number, h: number) =>
        ({ data: new Uint8ClampedArray(Math.max(1, w * (h ?? w) * 4)), width: w, height: h ?? w });
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k: string, v) { t[k] = v; return true; },
  });
  const createElement = (tag: string) => {
    const el: Record<string, unknown> = { tagName: String(tag).toUpperCase(), width: 1, height: 1, style: {} };
    el.getContext = () => makeCtx(el);
    el.toDataURL = () => 'data:,';
    el.addEventListener = () => {};
    return el;
  };
  // Deliberately narrow: enough for `canvasTexture`, and nothing that would let
  // a module think it is running in a browser.
  (globalThis as unknown as { document: unknown }).document = { createElement };
}

/**
 * Run every keyed generator once.
 *
 * Each entry is a module and the factories to call. A factory that throws is
 * reported and skipped rather than failing the bake: a partial cache is still
 * a win, and the browser regenerates whatever is missing.
 */
async function generateAll(log: (...a: unknown[]) => void) {
  const load = (rel: string) => import(pathToFileURL(path.join(ROOT, rel)).href);
  const jobs: Array<[string, () => Promise<void>]> = [
    // Each entry calls the *same* material-table factory the system's `build()`
    // calls, so the set of keys baked is the set of keys asked for by
    // construction rather than by a list that can drift.
    ['town', async () => { (await load('src/world/town/TownMaterials.ts')).townMaterials(); }],
    ['landmarks', async () => { (await load('src/world/props/Landmarks.ts')).landmarkMaterials(); }],
    ['mega', async () => { (await load('src/world/props/Megastructures.ts')).megaMaterials(); }],
    ['outposts', async () => { (await load('src/world/props/Outposts.ts')).outpostMaterials(); }],
    ['roadFurniture', async () => { (await load('src/world/props/RoadFurniture.ts')).roadMaterials(); }],
    ['poiKits', async () => { (await load('src/world/props/PoiKits.ts')).poiMaterials(); }],
    ['debris', async () => { (await load('src/world/props/Debris.ts')).debrisMaterials(); }],
    ['rocks', async () => {
      // Rocks has no table: it asks `PropMaterials` directly, at the two tints
      // `Rocks.build()` uses.
      const m = await load('src/world/props/PropMaterials.ts');
      m.rockMaterial(); m.rockMaterial(0x6a5849, 0.93);
    }],
    ['dungeons', async () => {
      const m = await load('src/world/dungeons/kit/InteriorMaterials.ts');
      for (const k of Object.keys(m)) {
        // Every zero-argument material factory in the kit. The entrances and
        // the interiors both draw from it, and the defaults are what they ask
        // for, so calling each once with no arguments records the whole set.
        if (!/^(trench|magitek|mine|ore|pit|rail|wet|cave|drip|corroded|pool)/.test(k)) continue;
        try { m[k](); } catch { /* a factory that needs arguments is not ours to guess */ }
      }
    }],
  ];
  for (const [name, run] of jobs) {
    const t = Date.now();
    try { await run(); log(`${name}: ${Date.now() - t} ms`); }
    catch (e) { log(`${name}: FAILED — ${(e as Error).stack}`); }
  }
}

/**
 * Run the generators and write `src/public/baked/tex.bin.gz`.
 * @returns true if it did work
 */
export async function texBake(opts: {force?: boolean, quiet?: boolean} = {}): Promise<boolean> {
  if (!opts.force && await texIsFresh()) return false;
  const log = opts.quiet ? () => {} : (...a: unknown[]) => console.log('[texbake]', ...a);
  const t0 = Date.now();

  installCanvasStub();
  const tb = await import(pathToFileURL(path.join(ROOT, 'src/engine/TexBake.ts')).href);
  tb.beginRecording();
  await generateAll(log);

  const rec = tb.recorded() as Map<string, { w: number, h: number, data: Uint8Array }>;
  if (!rec.size) { log('nothing recorded — leaving the cache alone'); return false; }
  let texels = 0;
  for (const { w, h } of rec.values()) texels += w * h;

  const hash = await texSourceHash();
  const raw = tb.encodeTexBake(hash) as Uint8Array;
  const gz = gzipSync(Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength), { level: 6 });

  await mkdir(BAKE_DIR, { recursive: true });
  await writeFile(OUT, gz);
  await writeFile(STAMP, JSON.stringify({
    hash, textures: rec.size, texels, bytes: gz.length, raw: raw.length, at: new Date().toISOString(),
  }, null, 2));
  log(`${rec.size} textures, ${(texels / 1e6).toFixed(1)} Mtexel — ${(gz.length / 1e6).toFixed(1)} MB gz `
    + `(${(raw.length / 1e6).toFixed(1)} MB raw) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return true;
}

/** True when something is already listening. */
const portOpen = (p: number) => new Promise<boolean>((res) => {
  const sk = net.connect(p, '127.0.0.1');
  sk.on('connect', () => { sk.destroy(); res(true); });
  sk.on('error', () => res(false));
  setTimeout(() => { sk.destroy(); res(false); }, 800);
});

/**
 * The browser bake: the painted faces.
 *
 * `generateAll` above cannot reach these. They are drawn on a real 2D canvas
 * and their mip chain is hand-built by `contrastMips`, so the only place they
 * exist is inside a browser -- which is also why this cannot run from the vite
 * plugin the way the Node bake does: it needs the server that is starting.
 *
 * The page boots with `?texbake=canvas`, which puts `TexBake` into recording
 * mode instead of reading, so the generators run for real and every drawn
 * texture is captured on the way past. It then POSTs the compressed container
 * to a socket held open here. Returning the bytes through `page.evaluate`
 * would have meant base64 across CDP -- 84 MB of face chain becoming a 112 MB
 * JSON string to move it one process sideways.
 *
 * @returns true if it did work
 */
export async function texBakeCanvas(opts: {force?: boolean, quiet?: boolean, port?: number} = {}): Promise<boolean> {
  if (!opts.force && await canvasIsFresh()) return false;
  const log = opts.quiet ? () => {} : (...a: unknown[]) => console.log('[texbake:canvas]', ...a);
  const t0 = Date.now();
  const hash = await hashOf(CANVAS_SOURCES);

  const vitePort = opts.port || Number(process.env.PORT || 5173);
  let server: ReturnType<typeof spawn> | null = null;
  if (!(await portOpen(vitePort))) {
    server = spawn('npx', ['vite', '--port', String(vitePort), '--strictPort'],
      { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    const deadline = Date.now() + 60000;
    for (;;) {
      await new Promise((r) => setTimeout(r, 250));
      if (await portOpen(vitePort)) break;
      if (Date.now() > deadline) { server.kill(); throw new Error('vite failed to start'); }
    }
  }

  // A socket the page can POST to. Port 0 so it never collides with a
  // worktree PORT or its capture daemon on PORT+1.
  let resolveBody: (b: Buffer) => void = () => {};
  const bodyPromise = new Promise<Buffer>((r) => { resolveBody = r; });
  const sink = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': '*',
      }).end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      res.writeHead(204, { 'access-control-allow-origin': '*' }).end();
      resolveBody(Buffer.concat(chunks));
    });
  });
  await new Promise<void>((r) => sink.listen(0, '127.0.0.1', () => r()));
  const sinkPort = (sink.address() as net.AddressInfo).port;

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--force-color-profile=srgb',
      '--hide-scrollbars', '--mute-audio'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => log('PAGEERROR:', String(e).split('\n')[0]));
    log('booting the page with recording on...');
    await page.goto(`http://127.0.0.1:${vitePort}/?q=ultra&shoot=1&texbake=canvas`,
      { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 300000 });
    const posted = await page.evaluate(([url, h]: [string, string]) =>
      (window as unknown as { TEX_BAKE_POST: (u: string, h: string) => Promise<number> })
        .TEX_BAKE_POST(url, h),
    [`http://127.0.0.1:${sinkPort}/texc`, hash] as [string, string]);
    const gz = await bodyPromise;
    await mkdir(BAKE_DIR, { recursive: true });
    await writeFile(CANVAS_OUT, gz);
    await writeFile(CANVAS_STAMP, JSON.stringify({ hash, bytes: gz.length, at: new Date().toISOString() }, null, 2));
    log(`${(gz.length / 1e6).toFixed(1)} MB gz (posted ${(posted / 1e6).toFixed(1)} MB) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return true;
  } finally {
    await browser.close();
    sink.close();
    if (server) server.kill();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2);
  if (argv.includes('--check')) {
    process.exit((await texIsFresh()) && (await canvasIsFresh()) ? 0 : 1);
  } else if (argv.includes('--canvas')) {
    if (!(await texBakeCanvas({ force: argv.includes('--force') }))) console.log('[texbake:canvas] already fresh');
  } else if (!(await texBake({ force: argv.includes('--force') }))) {
    console.log('[texbake] already fresh');
  }
}

#!/usr/bin/env node
/**
 * Procedural texture bake.
 *
 *   node src/tools/texbake.mts             # the Node bake, if stale
 *   node src/tools/texbake.mts --force     # always re-bake
 *   node src/tools/texbake.mts --check     # exit 0 if fresh, 1 if stale
 *   node src/tools/texbake.mts --canvas    # the browser bake (painted faces)
 *   node src/tools/texbake.mts --geo       # the browser bake (geometry)
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
import net from 'node:net';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import path from 'node:path';
import { lease, buildServer } from './harness.mts';
import { resolveBuild } from './identity.mts';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BAKE_DIR = path.join(ROOT, 'src', 'public', 'baked');
const OUT = path.join(BAKE_DIR, 'tex.bin.gz');
const STAMP = path.join(BAKE_DIR, 'tex.json');
const CANVAS_OUT = path.join(BAKE_DIR, 'texc.bin.gz');
const CANVAS_STAMP = path.join(BAKE_DIR, 'texc.json');
const GEO_OUT = path.join(BAKE_DIR, 'geo.bin.gz');
const GEO_STAMP = path.join(BAKE_DIR, 'geo.json');

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
  'src/world/sky/CloudTextures.ts',
  // The chart is rasterised from the *terrain* — so everything that moves the
  // heightfield moves the sheet. This list mirrors `bake.mts`'s own; a chart
  // baked against a previous terrain is the stale-cache failure with no
  // symptom, and the two artifacts are rebuilt together anyway.
  'src/world/map/Chart.ts',
  // The chart's water mask is decided per body by `findTarns`, which is shared
  // with `Water.ts` precisely so the sheet and the world cannot disagree about
  // where the water is. That makes it a chart generator, so it belongs here:
  // a change to the tarn arithmetic that did not invalidate the chart bake
  // would put the two back out of step with every gate green.
  'src/world/water/Tarns.ts',
  'src/world/map/WorldMap.ts',
  'src/world/terrain/Field.ts',
  'src/world/terrain/Road.ts',
  'src/world/terrain/Layers.ts',
  'src/world/map/RoadGraph.ts',
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

/**
 * Everything whose contents can change the baked **geometry**.
 *
 * The widest of the three lists, and it has to be: a POI compound is a
 * function of its kit code, of the building blocks that code lofts, of the
 * `Ecology` sampler that places it, of the terrain field it is seated and
 * graded against, and of the map that says where it is. `src/engine/GeoBake.ts`
 * is here because the container format and the quality-tier key prefix live in
 * it; `PropMaterials.ts` is here because a part is stored against its
 * `material.name`.
 *
 * `project/LANDMINES.md`: "a keyed generator whose file is not on that list is
 * the whole bug". There is no runtime check that can catch a stale entry —
 * geometry restored from the cache is well-formed geometry of the wrong world —
 * so this errs wide and the vite plugin deletes rather than serves.
 */
const GEO_SOURCES = [
  'src/engine/GeoBake.ts',
  // the three consumers
  'src/world/props/PoiKits.ts',
  'src/world/props/Megastructures.ts',
  'src/world/Water.ts',
  // what they build with
  'src/world/props/PartBuilder.ts',
  'src/world/props/BuildKit.ts',
  'src/world/props/Wear.ts',
  'src/world/props/Seat.ts',
  'src/world/props/Rocks.ts',
  'src/world/props/ZoneDress.ts',
  'src/world/props/PropMaterials.ts',
  'src/world/water/Shore.ts',
  // The shore ribbon is a pure function of the terrain bake and `Water.bodies`,
  // and half of `Water.bodies` is now decided in `Tarns.ts`. Move a tarn's
  // level without invalidating this and the ribbon comes back from the cache
  // tracing a waterline the water is no longer at.
  'src/world/water/Tarns.ts',
  'src/world/water/contour.ts',
  'src/world/water/geo.ts',
  // where they are placed, and on what
  'src/world/veg/Ecology.ts',
  'src/world/Terrain.ts',
  'src/world/terrain/Clipmap.ts',
  'src/world/terrain/Field.ts',
  'src/world/terrain/FieldCodec.ts',
  'src/world/terrain/Road.ts',
  'src/world/terrain/Layers.ts',
  'src/world/map/WorldMap.ts',
  'src/world/map/RoadGraph.ts',
  'src/util/Noise.ts',
  'src/util/Rng.ts',
];

/** @returns content hash of a source list */
async function hashOf(sources: string[]): Promise<string> {
  const hash = createHash('sha256');
  for (const rel of sources) {
    const p = path.join(ROOT, rel);
    // A path that does not exist contributes nothing, so a typo in one of these
    // lists is a source that is never watched -- the exact shape of the
    // stale-cache bug the lists exist to prevent. Say so rather than skip.
    if (!existsSync(p)) { console.warn(`[texbake] source not found, NOT hashed: ${rel}`); continue; }
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

/** @returns true when the geometry artifact matches its sources */
export async function geoIsFresh(): Promise<boolean> {
  if (!existsSync(GEO_OUT) || !existsSync(GEO_STAMP)) return false;
  try {
    const stamp = JSON.parse(await readFile(GEO_STAMP, 'utf8'));
    return stamp.hash === (await hashOf(GEO_SOURCES)) && (await stat(GEO_OUT)).size > 1024;
  } catch { return false; }
}

/**
 * Delete a stale geometry artifact.
 *
 * Same argument as {@link pruneStaleCanvasBake}: the runtime cannot hash the
 * sources, so it cannot tell a stale cache from a fresh one, and geometry from
 * a previous world is *well-formed* geometry — every gate stays green while the
 * viaduct stands in the air. Removing it costs the boot time it used to cost
 * and nothing else.
 *
 * @returns true if something was deleted
 */
export async function pruneStaleGeoBake(): Promise<boolean> {
  if (!existsSync(GEO_OUT) || await geoIsFresh()) return false;
  await rm(GEO_OUT, { force: true });
  await rm(GEO_STAMP, { force: true });
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
    ['clouds', async () => {
      // The one entry that is not a material table. `Clouds`' constructor is
      // the only caller and its arguments are the cache key, so they are
      // repeated here verbatim — a mismatch is a clean miss (the container is
      // indexed on width and height), never a stale sky.
      (await load('src/world/sky/CloudTextures.ts')).buildCloudTextures({
        baseSize: 64, detailSize: 48, weatherSize: 512, seed: 1337,
      });
    }],
    ['chart', async () => {
      // The relief chart, 2048^2, and the one job that needs *data* rather
      // than only code: it rasterises the terrain's own elevation grid.
      //
      // It reads `terrain.bin.gz` rather than rebuilding the field — the field
      // is a 420k-droplet erosion run and this is a texture bake. The vite
      // plugin runs `bake()` before `texBake()`, so the artifact is there; if
      // it is not, skip, and the browser rasterises for real exactly as it did
      // before. Only `h` and `ctrl` are decoded: the chart reads nothing else,
      // so the road network and the normals are not rebuilt here.
      const gz = path.join(BAKE_DIR, 'terrain.bin.gz');
      if (!existsSync(gz)) { log('chart: no terrain bake yet — skipping'); return; }
      const buf = gunzipSync(await readFile(gz));
      const codec = await load('src/world/terrain/FieldCodec.ts');
      const c = codec.unpackContainer(new Uint8Array(buf));
      const hs = c.section('h'), cs = c.section('ctrl');
      if (!hs || !cs) { log('chart: terrain bake has no h/ctrl — skipping'); return; }
      const h = codec.decodeF32Planes(hs.bytes, codec.sectionField(hs, 'n'));
      const ctrl = codec.decodePlanes8(cs.bytes, codec.sectionField(cs, 'w'), codec.sectionField(cs, 'h'), codec.sectionField(cs, 'ch'));
      const N = Math.round(Math.sqrt(h.length));
      // `bakeChart` wants a `Terrain`; it reads `field.h`, `field.ctrl` and
      // `field.N` and nothing else, so that is what it is given.
      (await load('src/world/map/Chart.ts')).bakeChart({ field: { h, ctrl, N } });
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

  // THE LIVE TREE, always. This records `src/public/baked/` for the checkout it
  // is run from, so a capture of some committed sha would bake the wrong
  // sources into the working tree's cache. `resolveBuild(undefined)` is the
  // dirty root by definition.
  const { port: vitePort } = await buildServer({ build: resolveBuild(undefined) });

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

  // A blank lease and its own navigation: `?texbake=canvas` is only honoured on
  // a fresh load, so a page the daemon has already booted is the wrong page.
  const leased = await lease({ blank: true, w: 1600, h: 900, agent: 'texbake', lane: 'sweep' });
  try {
    const { page } = leased;
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
    await leased.release();
    sink.close();
  }
}

/**
 * The browser bake: generated geometry.
 *
 * A sibling of {@link texBakeCanvas} and, like it, a *browser* bake rather than
 * a Node one — but for a different reason. The painted faces need a browser
 * because they are drawn on a real 2D canvas. The geometry needs one because
 * `PoiKits._base` seats every compound against `Terrain.drawnHeightAt`, which
 * reads the **rasterised clipmap** — the renderer's own arithmetic, as
 * `seatcheck.mts` proves. A Node bake would seat 124 compounds at subtly
 * different heights and ship aprons graded against ground that is not the
 * ground the player stands on: correct-looking geometry of the wrong world.
 *
 * So the page is booted with `?geobake=1`, which puts `GeoBake` into recording
 * mode instead of reading, and every generator runs for real. What gets
 * recorded is exactly what a boot builds — the eight prebuilt POI compounds,
 * the five megastructures and the shore ribbon — because nothing else runs
 * before `GAME.ready`.
 *
 * @returns true if it did work
 */
export async function geoBakeBrowser(opts: {force?: boolean, quiet?: boolean} = {}): Promise<boolean> {
  if (!opts.force && await geoIsFresh()) return false;
  const log = opts.quiet ? () => {} : (...a: unknown[]) => console.log('[texbake:geo]', ...a);
  const t0 = Date.now();
  const hash = await hashOf(GEO_SOURCES);

  // THE LIVE TREE, always — the same argument as `texBakeCanvas`: this writes
  // `src/public/baked/` for the checkout it is run from, and every materialised
  // tree symlinks that directory, so baking some committed sha's geometry into
  // the working tree's cache would re-shape everybody's world.
  const { port: vitePort } = await buildServer({ build: resolveBuild(undefined) });

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

  // `q=ultra` deliberately: `GeoBake` prefixes every key with the quality tier,
  // so this bakes the tier the 188 cold boots of a suite cycle actually use and
  // a `q=low` gate takes a clean miss rather than somebody else's vertices.
  const leased = await lease({ blank: true, w: 1600, h: 900, agent: 'texbake', lane: 'sweep' });
  try {
    const { page } = leased;
    page.on('pageerror', (e) => log('PAGEERROR:', String(e).split('\n')[0]));
    page.on('console', (m) => { if (m.type() === 'error') log('CONSOLE:', m.text().split('\n')[0]); });
    log('booting the page with geometry recording on...');
    await page.goto(`http://127.0.0.1:${vitePort}/?q=ultra&shoot=1&geobake=1`,
      { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 300000 });
    const info = await page.evaluate(([url, h]: [string, string]) => {
      const w = window as unknown as {
        GEO_BAKE_POST: (u: string, h: string) => Promise<number>,
        __GEO_KEYS?: string[],
      };
      return w.GEO_BAKE_POST(url, h).then((bytes) => ({ bytes, keys: w.__GEO_KEYS || [] }));
    }, [`http://127.0.0.1:${sinkPort}/geo`, hash] as [string, string]);
    const gz = await bodyPromise;
    await mkdir(BAKE_DIR, { recursive: true });
    await writeFile(GEO_OUT, gz);
    await writeFile(GEO_STAMP, JSON.stringify({
      hash, bytes: gz.length, keys: info.keys, at: new Date().toISOString(),
    }, null, 2));
    log(`${info.keys.length} keys, ${(gz.length / 1e6).toFixed(1)} MB gz `
      + `(posted ${(info.bytes / 1e6).toFixed(1)} MB) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    if (!info.keys.length) log('WARNING: nothing was recorded — the artifact is empty');
    return true;
  } finally {
    await leased.release();
    sink.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2);
  if (argv.includes('--check')) {
    process.exit((await texIsFresh()) && (await canvasIsFresh()) && (await geoIsFresh()) ? 0 : 1);
  } else if (argv.includes('--geo')) {
    if (!(await geoBakeBrowser({ force: argv.includes('--force') }))) console.log('[texbake:geo] already fresh');
  } else if (argv.includes('--canvas')) {
    if (!(await texBakeCanvas({ force: argv.includes('--force') }))) console.log('[texbake:canvas] already fresh');
  } else if (!(await texBake({ force: argv.includes('--force') }))) {
    console.log('[texbake] already fresh');
  }
}

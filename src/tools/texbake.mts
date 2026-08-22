#!/usr/bin/env node
/**
 * Procedural texture bake.
 *
 *   node src/tools/texbake.mts            # bake if stale
 *   node src/tools/texbake.mts --force    # always re-bake
 *   node src/tools/texbake.mts --check    # exit 0 if fresh, 1 if stale
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
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BAKE_DIR = path.join(ROOT, 'src', 'public', 'baked');
const OUT = path.join(BAKE_DIR, 'tex.bin.gz');
const STAMP = path.join(BAKE_DIR, 'tex.json');

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

/** @returns content hash of the generator sources */
export async function texSourceHash(): Promise<string> {
  const hash = createHash('sha256');
  for (const rel of TEX_SOURCES) {
    const p = path.join(ROOT, rel);
    if (!existsSync(p)) continue;
    hash.update(rel);
    hash.update(await readFile(p));
  }
  return hash.digest('hex').slice(0, 16);
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

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2);
  if (argv.includes('--check')) {
    process.exit((await texIsFresh()) ? 0 : 1);
  } else if (!(await texBake({ force: argv.includes('--force') }))) {
    console.log('[texbake] already fresh');
  }
}

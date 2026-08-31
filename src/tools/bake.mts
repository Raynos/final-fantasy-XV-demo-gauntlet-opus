#!/usr/bin/env node
/**
 * Build-step asset bake.
 *
 *   node src/tools/bake.mts            # bake if stale
 *   node src/tools/bake.mts --force    # always re-bake
 *   node src/tools/bake.mts --check    # exit 0 if fresh, 1 if stale (no work)
 *
 * The project generates every texel and every vertex in code and keeps no
 * authored art. That rule is about *inputs*, not about recomputing the same
 * deterministic output on every page load — so this runs our own generators
 * once, at build time, into `src/public/baked/` (git-ignored — it is a cache).
 * The browser inflates it instead of spending 7-15 s per load regenerating a
 * byte-identical answer, and falls back to generating in place if it is absent.
 *
 * Freshness is a content hash of the generator sources plus the format version:
 * touch `Field.ts` and the next server start re-bakes.
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TERRAIN_SOURCES, hashSources } from './bakesources.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/**
 * `src/public/` so Vite serves it in dev and copies it into `dist/` on build with
 * no extra middleware. Git-ignored: it is a cache of our own generators, not a
 * checked-in asset.
 */
export const BAKE_DIR = path.join(ROOT, 'src', 'public', 'baked');
const OUT = path.join(BAKE_DIR, 'terrain.bin.gz');
/** The PBR layer texels, fetched only above `?q=low`. Same hash, same stamp. */
const LAYER_OUT = path.join(BAKE_DIR, 'terrainl.bin.gz');
/** The phone's field: same sections, splat halved. See `FIELD_BAKE_PATH_M`. */
const MOBILE_OUT = path.join(BAKE_DIR, 'm', 'terrain.bin.gz');
const STAMP = path.join(BAKE_DIR, 'terrain.json');

/**
 * Everything whose contents can change the baked bytes.
 *
 * The list itself lives in `bakesources.mts` — a leaf module with no imports
 * but node builtins — so that a gate, or `announceBuild`, can ask what this
 * artifact is a function of without dragging playwright and the daemon client
 * in behind it. A duplicated source list is the stale-cache bug in its purest
 * form.
 */
export { TERRAIN_SOURCES as SOURCES } from './bakesources.mts';

/** @returns content hash of the generator sources */
export async function sourceHash(): Promise<string> { return hashSources(TERRAIN_SOURCES); }

/** @returns true when the artifact already matches the sources */
export async function isFresh(): Promise<boolean> {
  // Both halves: a tree with one and not the other is a half-applied bake, and
  // the symptom -- every page above q=low synthesising six PBR layers it has
  // already paid to have baked -- is a second of boot nobody would attribute.
  if (!existsSync(OUT) || !existsSync(LAYER_OUT) || !existsSync(MOBILE_OUT) || !existsSync(STAMP)) return false;
  try {
    const stamp = JSON.parse(await readFile(STAMP, 'utf8'));
    return stamp.hash === (await sourceHash()) && (await stat(OUT)).size > 1024;
  } catch { return false; }
}

/**
 * Run the generators and write `src/public/baked/terrain.bin.gz`.
 * @returns true if it did work
 */
export async function bake(opts: {force?:boolean, quiet?:boolean} = {}): Promise<boolean> {
  if (!opts.force && await isFresh()) return false;
  const log = opts.quiet ? () => {} : (...a: unknown[]) => console.log('[bake]', ...a);
  const t0 = Date.now();

  const { Field } = await import(pathToFileURL(path.join(ROOT, 'src/world/terrain/Field.ts')).href);
  const { encodeField, encodeLayers, encodeFieldMobile } = await import(pathToFileURL(path.join(ROOT, 'src/world/terrain/FieldBake.ts')).href);
  const { buildLayerData } = await import(pathToFileURL(path.join(ROOT, 'src/world/terrain/Layers.ts')).href);

  log('building terrain field (2048^2 heightfield + 420k-droplet erosion)...');
  const field = new Field(1337);
  field.build();
  log(`field built in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  log('synthesising the six PBR layer textures...');
  const layers = buildLayerData(512);

  const hash = await sourceHash();
  // ONE bake, TWO containers, one hash, one stamp. The six PBR layers are
  // 8.29 MB of the 25.51 and a `?q=low` page decodes and discards every one of
  // them, so they go in a file that only a page which can use them fetches.
  const raw = encodeField(field, { seed: 1337, hash }, null);
  const gz = gzipSync(Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength), { level: 9 });
  const rawM = encodeFieldMobile(field, { seed: 1337, hash });
  const gzM = gzipSync(Buffer.from(rawM.buffer, rawM.byteOffset, rawM.byteLength), { level: 9 });
  const rawL = encodeLayers(layers, { seed: 1337, hash });
  const gzL = gzipSync(Buffer.from(rawL.buffer, rawL.byteOffset, rawL.byteLength), { level: 9 });

  await mkdir(BAKE_DIR, { recursive: true });
  await writeFile(OUT, gz);
  await writeFile(LAYER_OUT, gzL);
  await mkdir(path.dirname(MOBILE_OUT), { recursive: true });
  await writeFile(MOBILE_OUT, gzM);
  await writeFile(STAMP, JSON.stringify({
    hash, bytes: gz.length, raw: raw.length,
    layers: { bytes: gzL.length, raw: rawL.length },
    at: new Date().toISOString(),
  }, null, 2));
  log(`wrote ${path.relative(ROOT, OUT)} — ${(gz.length / 1e6).toFixed(1)} MB gz `
    + `(${(raw.length / 1e6).toFixed(1)} MB raw) in ${((Date.now() - t0) / 1000).toFixed(1)} s total`);
  log(`  + ${path.relative(ROOT, LAYER_OUT)} — ${(gzL.length / 1e6).toFixed(1)} MB gz, `
    + `fetched only above ?q=low`);
  log(`  + ${path.relative(ROOT, MOBILE_OUT)} — ${(gzM.length / 1e6).toFixed(1)} MB gz, `
    + `half-splat, fetched only on ?demo=1`);
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2);
  if (argv.includes('--check')) {
    process.exit((await isFresh()) ? 0 : 1);
  } else if (!(await bake({ force: argv.includes('--force') }))) {
    console.log('[bake] already fresh');
  }
}

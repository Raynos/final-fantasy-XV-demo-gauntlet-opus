#!/usr/bin/env node
/**
 * Build-step asset bake.
 *
 *   node src/tools/bake.mjs            # bake if stale
 *   node src/tools/bake.mjs --force    # always re-bake
 *   node src/tools/bake.mjs --check    # exit 0 if fresh, 1 if stale (no work)
 *
 * The project generates every texel and every vertex in code and keeps no
 * authored art. That rule is about *inputs*, not about recomputing the same
 * deterministic output on every page load — so this runs our own generators
 * once, at build time, into `src/public/baked/` (git-ignored — it is a cache).
 * The browser inflates it instead of spending 7-15 s per load regenerating a
 * byte-identical answer, and falls back to generating in place if it is absent.
 *
 * Freshness is a content hash of the generator sources plus the format version:
 * touch `Field.js` and the next server start re-bakes.
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/**
 * `src/public/` so Vite serves it in dev and copies it into `dist/` on build with
 * no extra middleware. Git-ignored: it is a cache of our own generators, not a
 * checked-in asset.
 */
export const BAKE_DIR = path.join(ROOT, 'src', 'public', 'baked');
const OUT = path.join(BAKE_DIR, 'terrain.bin.gz');
const STAMP = path.join(BAKE_DIR, 'terrain.json');

/** Everything whose contents can change the baked bytes. */
const SOURCES = [
  'src/world/terrain/Field.js',
  'src/world/terrain/Road.js',
  'src/world/terrain/FieldCodec.js',
  'src/world/terrain/FieldBake.js',
  'src/world/terrain/Layers.js',
  'src/world/map/WorldMap.js',
  'src/world/map/RoadGraph.js',
  'src/util/Noise.js',
  'src/util/Rng.js',
];

/** @returns {Promise<string>} content hash of the generator sources */
export async function sourceHash() {
  const hash = createHash('sha256');
  for (const rel of SOURCES) {
    hash.update(rel);
    hash.update(await readFile(path.join(ROOT, rel)));
  }
  return hash.digest('hex').slice(0, 16);
}

/** @returns {Promise<boolean>} true when the artifact already matches the sources */
export async function isFresh() {
  if (!existsSync(OUT) || !existsSync(STAMP)) return false;
  try {
    const stamp = JSON.parse(await readFile(STAMP, 'utf8'));
    return stamp.hash === (await sourceHash()) && (await stat(OUT)).size > 1024;
  } catch { return false; }
}

/**
 * Run the generators and write `src/public/baked/terrain.bin.gz`.
 * @param {{force?:boolean, quiet?:boolean}} [opts]
 * @returns {Promise<boolean>} true if it did work
 */
export async function bake(opts = {}) {
  if (!opts.force && await isFresh()) return false;
  const log = opts.quiet ? () => {} : (...a) => console.log('[bake]', ...a);
  const t0 = Date.now();

  const { Field } = await import(pathToFileURL(path.join(ROOT, 'src/world/terrain/Field.js')).href);
  const { encodeField } = await import(pathToFileURL(path.join(ROOT, 'src/world/terrain/FieldBake.js')).href);
  const { buildLayerData } = await import(pathToFileURL(path.join(ROOT, 'src/world/terrain/Layers.js')).href);

  log('building terrain field (2048^2 heightfield + 420k-droplet erosion)...');
  const field = new Field(1337);
  field.build();
  log(`field built in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  log('synthesising the six PBR layer textures...');
  const layers = buildLayerData(512);

  const hash = await sourceHash();
  const raw = encodeField(field, { seed: 1337, hash }, layers);
  const gz = gzipSync(Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength), { level: 9 });

  await mkdir(BAKE_DIR, { recursive: true });
  await writeFile(OUT, gz);
  await writeFile(STAMP, JSON.stringify({ hash, bytes: gz.length, raw: raw.length, at: new Date().toISOString() }, null, 2));
  log(`wrote ${path.relative(ROOT, OUT)} — ${(gz.length / 1e6).toFixed(1)} MB gz `
    + `(${(raw.length / 1e6).toFixed(1)} MB raw) in ${((Date.now() - t0) / 1000).toFixed(1)} s total`);
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

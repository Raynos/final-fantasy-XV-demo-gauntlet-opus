/**
 * What each baked artifact is a function of, and how to hash it.
 *
 * **Why this is its own file.** The four source lists used to live inside the
 * two tools that *write* the bakes (`bake.mts`, `texbake.mts`), which import
 * `harness.mts`, which imports `daemon.mts`. Anything that wanted to ask a
 * question about the cache — a gate, `announceBuild` — therefore had to drag
 * playwright and the daemon client in behind it, or duplicate the lists. A
 * duplicated source list is the stale-cache bug in its purest form: the copy
 * that is not updated is the one that decides nothing re-bakes.
 *
 * So the lists live here, in a module whose only imports are node builtins, and
 * the writers import them. Nothing imports this that this imports.
 *
 * `project/LANDMINES.md` §"Baked caches" is the required reading. The two facts
 * that shape everything below:
 *
 *  - **A missing artifact is harmless and a STALE one is invisible.** Every
 *    path falls back to the generator, so absence costs only time; a stale
 *    artifact resolves its keys, boots, passes every gate, and serves the world
 *    a previous version of your generator produced.
 *  - **`src/public/baked/` is a symlink into the main checkout from every
 *    materialised tree.** That is right — a 33 MB heightfield should not be
 *    re-baked per branch — and it is also why `--build <old sha>` runs *today's*
 *    bake against yesterday's code. See {@link bakeBelongsTo}.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Where every artifact and stamp below lives. */
export const BAKE_DIR = path.join(ROOT, 'src', 'public', 'baked');

/** Everything whose contents can change the baked heightfield and chart bytes. */
export const TERRAIN_SOURCES = [
  'src/world/terrain/Field.ts',
  'src/world/terrain/Road.ts',
  'src/world/terrain/FieldCodec.ts',
  'src/world/terrain/FieldBake.ts',
  'src/world/terrain/Layers.ts',
  'src/world/map/WorldMap.ts',
  'src/world/map/RoadGraph.ts',
  'src/util/Noise.ts',
  'src/util/Rng.ts',
];

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
  // heightfield moves the sheet. This list mirrors `TERRAIN_SOURCES` above; a
  // chart baked against a previous terrain is the stale-cache failure with no
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
export const CANVAS_SOURCES = [
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
 * The widest of the four lists, and it has to be: a POI compound is a
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
export const GEO_SOURCES = [
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
  // Every plant, boulder and forage point now asks `Water.mask` where the water
  // surface is, and the mask is the river sheet's own triangles — so the file
  // that emits them decides where a bush may stand, and a POI compound graded
  // against `Ecology` moves with it.
  'src/world/water/River.ts',
  'src/world/water/WaterMask.ts',
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

/** One baked artifact: what it is, what it costs, and how to put it back. */
export interface BakeArtifact {
  /** Basename of the `.bin.gz` under {@link BAKE_DIR}. */
  file: string;
  /** Basename of its `.json` stamp. */
  stamp: string;
  sources: string[];
  /** One line: what is in it. */
  what: string;
  /**
   * Whether the vite plugin can REGENERATE it, or can only delete it.
   *
   * `terrain` and `tex` are pure Node, so the plugin rebuilds them at server
   * start and at build; they should therefore never be missing, and missing is
   * as red as stale. `texc` and `geo` need a *browser*, which the plugin does
   * not have, so all it can do with a stale one is prune it — and it does, on
   * the first build after any merge that touches a source. Those two go missing
   * routinely and by design.
   */
  regenerable: boolean;
  /** What a human runs to put it back. */
  remedy: string;
  /** Measured cold-boot cost of not having it, seconds. `project/LANDMINES.md`. */
  bootCostSec: number;
}

/**
 * The four caches of our own generators under `src/public/baked/`.
 *
 * Ordered as the boot needs them. `bootCostSec` are the numbers recorded in
 * `project/LANDMINES.md` §"Baked caches"; they are what makes this gate worth
 * its 20 ms.
 */
export const ARTIFACTS: BakeArtifact[] = [
  {
    file: 'terrain.bin.gz', stamp: 'terrain.json', sources: TERRAIN_SOURCES,
    what: 'the heightfield and the chart sheet',
    regenerable: true, remedy: 'pnpm run build  (the vite plugin bakes it)', bootCostSec: 7,
  },
  {
    file: 'tex.bin.gz', stamp: 'tex.json', sources: TEX_SOURCES,
    what: '143 procedural DataTextures (src/engine/TexBake.ts)',
    regenerable: true, remedy: 'node src/tools/texbake.mts --force', bootCostSec: 4,
  },
  {
    file: 'texc.bin.gz', stamp: 'texc.json', sources: CANVAS_SOURCES,
    what: 'the drawn-canvas mip chains behind every painted face',
    regenerable: false, remedy: 'node src/tools/texbake.mts --canvas --force', bootCostSec: 2.5,
  },
  {
    file: 'geo.bin.gz', stamp: 'geo.json', sources: GEO_SOURCES,
    what: 'the POI, megastructure and shore geometry (src/engine/GeoBake.ts)',
    regenerable: false, remedy: 'node src/tools/texbake.mts --geo', bootCostSec: 1.2,
  },
];

/**
 * The hash a stamp records, over a source list read from the working tree.
 *
 * **Byte-for-byte the arithmetic `bake.mts` and `texbake.mts` have always
 * used**, because they now call this one. If it ever diverges, every artifact
 * reads stale forever and nothing says why.
 *
 * A path that does not exist contributes nothing, so a typo in one of the lists
 * above is a source that is never watched — the exact shape of the stale-cache
 * bug the lists exist to prevent. Say so rather than skip silently.
 */
export function hashSources(sources: string[], warn = true): string {
  const hash = createHash('sha256');
  for (const rel of sources) {
    const p = path.join(ROOT, rel);
    if (!existsSync(p)) {
      if (warn) console.warn(`[bake] source not found, NOT hashed: ${rel}`);
      continue;
    }
    hash.update(rel);
    hash.update(readFileSync(p));
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * The same hash, over the same list, as those files stood in a git tree.
 *
 * One `git cat-file --batch` for the whole list rather than one process per
 * file: thirty `git show`s cost more than the question is worth, and this is
 * called from `announceBuild`, i.e. from every tool, every run.
 *
 * @param treeish a commit, tag or tree sha
 * @returns the digest, or `null` if git could not answer
 */
export function hashSourcesAt(sources: string[], treeish: string): string | null {
  let out: Buffer;
  try {
    out = execFileSync('git', ['cat-file', '--batch'], {
      cwd: ROOT,
      input: sources.map((rel) => `${treeish}:${rel}\n`).join(''),
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch { return null; }

  const hash = createHash('sha256');
  let at = 0;
  for (const rel of sources) {
    // `<sha> <type> <size>\n<contents>\n`, or `<spec> missing\n`.
    const nl = out.indexOf(0x0a, at);
    if (nl < 0) return null;
    const header = out.toString('utf8', at, nl);
    at = nl + 1;
    if (header.endsWith(' missing')) continue;   // mirrors hashSources' skip
    const size = Number(header.split(' ')[2]);
    if (!Number.isFinite(size)) return null;
    hash.update(rel);
    hash.update(out.subarray(at, at + size));
    at += size + 1;                              // the trailing newline git adds
  }
  return hash.digest('hex').slice(0, 16);
}

/** What a stamp file says, if it is there and parseable. */
export function readStamp(a: BakeArtifact): { hash?: string, bytes?: number, at?: string } | null {
  const p = path.join(BAKE_DIR, a.stamp);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/** `MISSING` — not on disk. `STALE` — on disk, but not what its sources say. */
export type BakeState = 'FRESH' | 'STALE' | 'MISSING' | 'TRUNCATED';

export interface BakeStatus {
  artifact: BakeArtifact;
  state: BakeState;
  bytes: number;
  /** What the stamp claims. */
  stampHash: string | null;
  /** What the sources on disk actually hash to. */
  treeHash: string;
  /** A writer was replacing this artifact while it was being read. */
  inFlight?: boolean;
}

/**
 * Read the state of one artifact against the working tree.
 *
 * **`statSync`, never `readFileSync`.** The first draft of this read the whole
 * artifact to get its length and picked up 15 MiB of a 33 MB heightfield that a
 * co-agent's `vite build` was in the middle of writing — a 15 MB read, on a
 * gate whose budget is 100 ms, that also produced a wrong answer.
 *
 * That mid-write is not hypothetical and it is not rare: on a shared trunk any
 * lane's `pre-commit` runs `vite build`, which runs the bake plugin, which
 * rewrites `src/public/baked/` under everyone. Between reading a stamp and
 * stat'ing its artifact the pair can be replaced, and the reader sees a new
 * artifact against an old stamp — STALE, transiently, for a cache that is fine.
 * So the stamp is read on both sides of the stat and the whole thing is
 * retried while it moves. `inFlight` says the retries never settled, and the
 * caller reports rather than fails on it: a bake happening right now is the one
 * state that is nobody's bug.
 */
export function statusOf(a: BakeArtifact): BakeStatus {
  const treeHash = hashSources(a.sources, false);
  const out = path.join(BAKE_DIR, a.file);
  for (let attempt = 0; ; attempt++) {
    const before = readStamp(a);
    if (!existsSync(out) || !before) {
      return { artifact: a, state: 'MISSING', bytes: 0, stampHash: before?.hash ?? null, treeHash };
    }
    const bytes = statSync(out).size;
    const after = readStamp(a);
    if (!after || after.hash !== before.hash || after.at !== before.at) {
      if (attempt < 4) continue;
      return { artifact: a, state: 'MISSING', bytes, stampHash: null, treeHash, inFlight: true };
    }
    // Every writer guards on `size > 1024`; anything smaller is a half-written
    // file, which resolves its keys and then serves garbage.
    const state: BakeState = bytes <= 1024 ? 'TRUNCATED'
      : after.hash === treeHash ? 'FRESH' : 'STALE';
    // A stamp whose bytes do not match the file on disk is the same race caught
    // from the other side: the artifact is being replaced under its own stamp.
    const inFlight = typeof after.bytes === 'number' && after.bytes !== bytes;
    return { artifact: a, state, bytes, stampHash: after.hash ?? null, treeHash, inFlight };
  }
}

/**
 * **Does the shared bake cache belong to this tree?**
 *
 * `src/public/baked/` is symlinked into every materialised build tree, so a
 * tool run with `--build <old sha>` renders yesterday's code against *today's*
 * heightfield, texels, painted faces and POI geometry. Nothing said so, and the
 * symptom is the worst one an instrument can have: `--build <old>` and
 * `--build HEAD` came back **bit-identical in every digit**, which reads as
 * "nothing changed" and means "you measured the same thing twice". An A/B
 * against an old sha was filed in `project/TASKS.md` as defeated by exactly
 * this.
 *
 * The check is exact rather than heuristic: re-hash each artifact's source list
 * *as it stood in that tree* and compare against the hash the artifact's own
 * stamp recorded. Equal means the bake really is that tree's. Unequal names the
 * artifact and the reader knows which half of the frame is not the sha they
 * asked for.
 *
 * @param treeish the commit or tree the tool was pointed at
 * @returns the artifacts whose bake does NOT belong to `treeish`, with why
 */
export function bakeBelongsTo(treeish: string): Array<{ artifact: BakeArtifact, why: string }> {
  const bad: Array<{ artifact: BakeArtifact, why: string }> = [];
  for (const a of ARTIFACTS) {
    const stamp = readStamp(a);
    if (!stamp || !existsSync(path.join(BAKE_DIR, a.file))) continue;  // absent is honest
    const there = hashSourcesAt(a.sources, treeish);
    if (there === null) continue;                                       // git could not say
    if (there !== stamp.hash) {
      bad.push({ artifact: a, why: `stamp ${stamp.hash} vs ${there} at that tree` });
    }
  }
  return bad;
}

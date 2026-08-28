#!/usr/bin/env node
/**
 * Headless capture harness.
 *
 *   node src/tools/shoot.mts                       # every shot in Shots.ts
 *   node src/tools/shoot.mts vista_dusk hero_full  # named shots only
 *   node src/tools/shoot.mts --out tmp/shots/round3    # output directory
 *   node src/tools/shoot.mts --w 1920 --h 1080     # resolution (default 1600x900)
 *   node src/tools/shoot.mts --settle 90           # sim frames before capture
 *   node src/tools/shoot.mts --prod                # build + serve the real bundle
 *   node src/tools/shoot.mts --cold                # force a fresh boot, no page reuse
 *   node src/tools/shoot.mts --build HEAD~3        # capture a committed tree, by ref
 *   node src/tools/shoot.mts --dirty               # capture the live working tree
 *   node src/tools/shoot.mts --jpeg               # write .jpg instead of .png (review captures)
 *   node src/tools/shoot.mts --jpeg 70            # ...at a chosen quality (default 82)
 *   node src/tools/shoot.mts --ablate nobloom,nogtao   # turn post stages off
 *   node src/tools/shoot.mts --hide grass,rock          # hide scene objects by name
 *   node src/tools/shoot.mts --raw                      # capture the pre-post render
 *
 * ABLATION IS THE DIAGNOSIS, NOT THE FRAME. For any visual defect, ablate
 * before re-tinting: hide the mesh you suspect, or turn off the pass you
 * suspect, and diff. In the sibling repos this overturned eight confident
 * diagnoses arrived at by looking at the frame -- the shadow that was grass
 * casting nothing, the chevron hatch that was GTAO and not the heightfield.
 *
 * `--raw` matters more than it looks. Hide one mesh with the post chain on and
 * auto-exposure, bloom and the grade all move, so tens of thousands of pixels
 * change that have nothing to do with the mesh -- measured at ~40k in the
 * sibling. `--raw` captures the scene render before any of that, so the
 * difference between two captures is where the object was and nothing else.
 * ALWAYS pass it on both sides of an ablation diff.
 *
 * By default this hands the work to `src/tools/daemon.mts`, which keeps one vite
 * server, one Chromium and one booted page alive between invocations — so the
 * second run of the day costs its frames and nothing else. The daemon is
 * autostarted and shuts itself down when idle. `--cold` forces a fresh page
 * when a capture has to be provably independent of everything before it.
 *
 * Either way it waits for `GAME.ready`, drives the game with fixed timesteps,
 * and writes PNGs. Exits non-zero on any page error so agents can't mistake a
 * blank canvas for success.
 *
 * PNG is the default because `src/tools/imgdiff.mts` compares pixels and its 1.5-1.9/255
 * noise floor is measured on lossless frames. `--jpeg` is for the shoot -> look -> fix
 * loop: an agent reading a 1600x900 capture gets it downscaled to a 1568 px long edge
 * anyway, so the extra ~2.3 MB a PNG costs buys nothing it can see.
 */
import { call, ensureDaemon, harnessArgs, announceBuild, pageOpts, isHarnessFlag, runTool } from './harness.mts';
import type { ShotResult, ShotsResponse } from './harness.mts';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Everything the command line can set. */
interface ShootOpts {
  w: number;
  h: number;
  /** Fixed sim steps before the frame is grabbed. */
  settle: number;
  out: string;
  /** Shot names; empty means every shot in `Shots.ts`. */
  shots: string[];
  keep: boolean;
  /** Build and serve the real bundle rather than the dev server. */
  prod: boolean;
  timeout: number;
  nobake: boolean;
  /** Force a cold page even when the daemon has a warm one. */
  cold: boolean;
  /** JPEG quality, or 0 for PNG. */
  jpeg: number;
  /** `?post=` tokens: `nobloom`, `nogtao`, `nocontact`, `plain`, ... */
  ablate: string;
  /** Scene object names (case-insensitive substrings) to hide. */
  hide: string[];
  /** Capture the raw scene render rather than the composited frame. */
  raw: boolean;
}

function parseArgs(argv: string[]) {
  const opts: ShootOpts = {
    w: 1600, h: 900, settle: 60, out: 'shots', shots: [], keep: false, prod: false,
    timeout: 120000, nobake: false, cold: false, jpeg: 0,
    ablate: '', hide: [], raw: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--nobake') opts.nobake = true;
    else if (a === '--cold') opts.cold = true;
    // `--jpeg` alone means quality 82; a bare number after it overrides. Anything
    // else is the next flag or a shot name, so it is left for the loop to handle.
    else if (a === '--jpeg') {
      const q = Number(argv[i + 1]);
      opts.jpeg = Number.isFinite(q) && argv[i + 1] !== undefined && argv[i + 1] !== '' ? (i++, q) : 82;
    }
    else if (a === '--w') opts.w = Number(argv[++i]);
    else if (a === '--h') opts.h = Number(argv[++i]);
    else if (a === '--settle') opts.settle = Number(argv[++i]);
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--ablate') opts.ablate = argv[++i];
    else if (a === '--hide') opts.hide = argv[++i].split(',').map((v) => v.trim()).filter(Boolean);
    else if (a === '--raw') opts.raw = true;
    else if (a === '--keep') opts.keep = true;
    else if (a === '--prod') opts.prod = true;
    // The shared --build/--dirty/--lane/... flags are parsed by harnessArgs;
    // skip them here rather than rejecting them as unknown.
    else if (isHarnessFlag(a) === 'value') i++;
    else if (isHarnessFlag(a) === 'switch') { /* handled by harnessArgs */ }
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else opts.shots.push(a);
  }
  return opts;
}

async function listShots() {
  const src = await readFile(path.join(ROOT, 'src/game/Shots.ts'), 'utf8');
  return [...src.matchAll(/^\s{2}([a-zA-Z0-9_]+):\s*\{/gm)].map((m) => m[1]);
}

/**
 * One JSON line per shot, so a manifest can be grepped or tailed instead of read
 * whole. Pretty-printing 139 results at indent 2 ran to 1500+ lines.
 */
function manifest(m: ShotsResponse | { results: ShotResult[], errors: string[] }) {
  const { results, ...rest } = m;
  const head = JSON.stringify(rest);
  return `{"results":[\n${results.map((r) => '  ' + JSON.stringify(r)).join(',\n')}\n],`
    + `${head === '{}' ? '' : head.slice(1, -1) + ','}"count":${results.length}}\n`;
}

/** Report one shot the way this tool has always reported it. */
function line(r: ShotResult) {
  console.log(
    // `cached` is printed, never hidden. The counts on a hit come from the
    // sidecar rather than from a renderer that just ran, and a reader
    // comparing two runs has to know which of them actually drew anything.
    `${r.cached ? '·' : '✓'} ${r.name.padEnd(16)} ${String(r.triangles).padStart(9)} tris  ` +
    `${String(r.calls).padStart(4)} calls  ${String(r.ms).padStart(5)}ms  -> ${r.file}`
    + (r.cached ? '   (cached)' : '')
  );
}

/** Render through the shared daemon, which owns the server, browser and page. */
async function viaDaemon(opts: ShootOpts, shots: string[], outDir: string): Promise<ShotsResponse> {
  const ha = harnessArgs(process.argv.slice(2), { w: opts.w, h: opts.h });
  announceBuild(ha);
  const started = await ensureDaemon();
  if (started) console.log('[shoot] started capture daemon');
  const out = await call<ShotsResponse>('/shots', {
    ...pageOpts(ha),
    shots, out: outDir, settle: opts.settle, w: opts.w, h: opts.h,
    nobake: opts.nobake, cold: opts.cold, jpeg: opts.jpeg,
    post: opts.ablate, hide: opts.hide, raw: opts.raw,
  });
  for (const r of out.results) line(r);
  const hits = out.results.filter((r) => r.cached).length;
  console.log(`[shoot] daemon: ${out.boots} boot(s), ${out.reuses} page reuse(s), `
    + `${hits}/${out.results.length} from cache, last boot ${out.bootMs} ms`);
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = path.isAbsolute(opts.out) ? opts.out : path.join(ROOT, opts.out);
  await mkdir(outDir, { recursive: true });
  const shots = opts.shots.length ? opts.shots : await listShots();

  const out = await viaDaemon(opts, shots, outDir);
  // Record what the page was asked for, not only which build drew it. Two
  // captures of the same commit are *not* the same frames when one of them
  // passed `--nobake` or ablated a post pass, and `imgdiff` refuses a
  // same-build comparison on the assumption that they are — which made the
  // one comparison the bake work actually needs impossible to run without
  // dirtying the tree. See `imgdiff.mts`'s `provenance`.
  const variant = [
    opts.nobake ? 'nobake' : '',
    opts.ablate ? `post=${opts.ablate}` : '',
    opts.hide.length ? `hide=${opts.hide.join('+')}` : '',
  ].filter(Boolean).join(',');
  await writeFile(path.join(outDir, 'manifest.json'),
    manifest({ ...out, variant } as typeof out & { variant: string }));
  if (out.errors.length) {
    console.error(`\n${out.errors.length} page error(s):`);
    // First line, then the lines that carry the diagnosis. A shader link
    // failure arrives as one console.error whose first line is the useless
    // half -- `THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false` --
    // and whose later lines name the material and the offending GLSL line.
    // Printing only `split('\n')[0]` threw the answer away and cost a bisect
    // plus an in-page relink probe to get back. Bounded: the tail of such a
    // message is a numbered source dump, so keep only the lines that say
    // something and cap them.
    for (const e of [...new Set<string>(out.errors)].slice(0, 20)) {
      const lines = e.split('\n');
      console.error('  ' + lines[0]);
      const detail = lines.slice(1)
        .map((l) => l.trim())
        .filter((l) => l && (/^(ERROR|WARNING):/.test(l) || /^(Material Name|Material Type|Program Info Log):/.test(l)));
      for (const d of detail.slice(0, 8)) console.error('    ' + d);
      if (detail.length > 8) console.error(`    ... ${detail.length - 8} more`);
    }
    process.exit(1);
  }
  console.log(`\n${out.results.length} shots -> ${path.relative(ROOT, outDir)}`);

}

await runTool(main);

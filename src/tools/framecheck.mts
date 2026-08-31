#!/usr/bin/env node
/**
 * Is every shot in the corpus a picture?
 *
 *   node src/tools/framecheck.mts
 *   node src/tools/framecheck.mts --json tmp/frame.json
 *   node src/tools/framecheck.mts --worst 20        # print more rows
 *
 * ## Why this exists
 *
 * On 2026-08-31 eleven shots in this corpus rendered as **pure white
 * rectangles** — `lest_market_day` came back as a 9 375-byte JPEG of nothing —
 * and thirty more carried a white veil over most of the frame. Two of the
 * eleven were judged PAIRING rows, blind-compared against shipped FFXV plates
 * by a critic that flagged them unprompted.
 *
 * **Every gate in this repo passed.** `nanscan` read 0 of 166. `drawcheck`
 * PASSed — the geometry was drawing, 7 853 662 triangles of it. `perf`
 * certified 166/166 shots. `check` was 20/20. A blown frame is not a page
 * error, does not move a draw count, and against a baseline that is blown the
 * same way is not even a pixel diff. The same hole let a GLSL link failure
 * blank *every* capture for forty minutes earlier the same night
 * (`LANDMINES.md`), and let a `GradePass` that failed to compile turn the whole
 * repo black for a window before that. Three occurrences, one missing gate.
 *
 * ## What it measures, and why it is two numbers and not one
 *
 * Per shot, in one boot, from `probes/framescan.mts`:
 *
 * | column      | buffer | what it catches |
 * |-------------|--------|-----------------|
 * | `white%`    | the default framebuffer, 8-bit | the frame a reader would see, blown |
 * | `black%`    | same | a dead pass, a failed link, a camera inside geometry |
 * | `sceneMean` | `rtScene`, linear HDR | the *radiance* that produced it |
 * | `nan`       | same | subsumes `probes/nanscan.mts` — same read, one counter |
 *
 * The display number says a frame is broken. `sceneMean` says whether the scene
 * or the post chain broke it, which is the difference between an afternoon and
 * ten minutes: in the whiteout, `lest_market_day` read **1 185** against
 * **0.353** on the healthy `galdin_beach`, and that one ratio named the bake as
 * the cause before anything was edited.
 *
 * ## The thresholds, and why they are where they are
 *
 * Measured on the repaired corpus, all 166 shots at `b5d5795a8e7c`. The worst
 * healthy frames are the deliberately extreme ones, and every threshold sits
 * clear of them:
 *
 *  - **`white% >= 90`** — a frame nine tenths clipped. The eleven blown shots
 *    read 90.99 to 100.00 by `imagestats`; the worst healthy frame is
 *    `vista_dawn` at **18.8%**. Margin 4.8x.
 *  - **`black% >= 98`** — the failed-link signature, which is 99.9-100%. Not
 *    100, because a NaN hole or a letterbox leaves a few pixels. This is the
 *    tightest of the three: `dun_balouve_drift` is a genuinely near-black mine
 *    interior at **78.5%**, margin 1.25x. That frame is itself too crushed to
 *    be good and is filed as residue; if it is opened up the threshold has
 *    more room, and if a darker shot is ever authored this is the number that
 *    has to move — deliberately, with the frame read by eye first.
 *  - **`sceneMean >= 40`** — the linear radiance the scene handed the post
 *    chain. Healthy spans 0.009 (`dun_balouve_drift`) to **0.759**
 *    (`regalia_cockpit`); the defect read **1 185**. Margin 53x. Gated on the
 *    *mean* and never the max, because `sceneMax` legitimately reaches 5 556
 *    on a specular highlight in `regalia_cockpit` — a frame may hold a sun,
 *    it may not *average* one.
 *
 * Whole-corpus run at that sha: **PASS, worst white 18.8%, highest scene mean
 * 0.76, 0 NaN pixels in 166 shots.** A second run on a busy tree read 19.1% and
 * 0.75 — 0.3 of a point apart, which is the reproducibility to quote before
 * anyone reads a movement off this gate. **358.6 s** wall, one browser worker,
 * with three other jobs running; that is the `cost` in `check.mts`.
 *
 * These are floors on absurdity, not on taste. A gate that fires on an ugly
 * frame would be turned off within the week; this one fires on a frame that is
 * not a frame, and that is the whole of its job.
 *
 * **Blind to:** everything between "a rectangle of one colour" and "beautiful".
 * It cannot tell a good frame from a bad one and must never be read as if it
 * could. That is what the judged rounds are for. It exists so that the judged
 * rounds are never again spent on a white rectangle.
 */
import { probe } from './harness.mts';
import { harnessArgs, announceBuild, pageOpts, runTool } from './harness.mts';
import { writeFile } from 'node:fs/promises';

/** A frame nine tenths clipped to white is not a frame. */
const WHITE_PCT = 90;
/** A dead pass or a failed shader link. Not 100: a NaN hole leaves pixels. */
const BLACK_PCT = 98;
/** Linear scene radiance, averaged. Healthy is 0.3-3; the defect read 1 185. */
const SCENE_MEAN = 40;

interface Row {
  name: string; nan: number;
  sceneMean: number; sceneMax: number;
  white: number; black: number;
}
interface Scan { shots: number; rows: Row[]; w: number; h: number }

function verdict(r: Row): string | null {
  if (r.white >= WHITE_PCT) return `${r.white.toFixed(1)}% of the frame is clipped white`;
  if (r.black >= BLACK_PCT) return `${r.black.toFixed(1)}% of the frame is crushed black`;
  if (r.sceneMean >= SCENE_MEAN) return `scene radiance averages ${r.sceneMean.toFixed(0)}`;
  if (r.nan > 0) return `${r.nan} NaN pixels in the scene target`;
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  const ix = argv.indexOf('--json');
  const jsonOut = ix >= 0 ? argv[ix + 1] : null;
  const wIx = argv.indexOf('--worst');
  const worst = wIx >= 0 ? Number(argv[wIx + 1]) : 8;

  const ha = harnessArgs(argv);
  announceBuild(ha);
  const scan = await probe<Scan>('src/tools/probes/framescan.mts', pageOpts(ha));

  const fails = scan.rows.map((r) => [r, verdict(r)] as const).filter(([, v]) => v);
  const byWhite = [...scan.rows].sort((a, b) => b.white - a.white);

  console.log(`framecheck: ${scan.shots} shots at ${scan.w}x${scan.h}`);
  console.log('shot                          white%  black%  sceneMean  sceneMax   nan');
  for (const r of byWhite.slice(0, Math.max(worst, fails.length))) {
    console.log(`${r.name.padEnd(28)} ${r.white.toFixed(1).padStart(6)}  ${r.black.toFixed(1).padStart(6)}  `
      + `${r.sceneMean.toFixed(2).padStart(9)}  ${r.sceneMax.toFixed(0).padStart(8)}  ${String(r.nan).padStart(4)}`);
  }

  if (jsonOut) await writeFile(jsonOut, JSON.stringify(scan, null, 1));

  if (!fails.length) {
    console.log(`\nPASS — every one of ${scan.shots} shots is a picture `
      + `(worst white ${byWhite[0].white.toFixed(1)}%, `
      + `highest scene mean ${Math.max(...scan.rows.map((r) => r.sceneMean)).toFixed(2)}).`);
    return;
  }
  console.error(`\nFAIL — ${fails.length} of ${scan.shots} shots are not pictures:`);
  for (const [r, v] of fails) console.error(`  ${r.name.padEnd(28)} ${v}`);
  console.error('\nAblate before you re-tint: `--ablate plain` bisects the post chain in 30 s,'
    + ' and `sceneMean` above says whether the scene or the chain is at fault.');
  process.exit(1);
}

await runTool(main);

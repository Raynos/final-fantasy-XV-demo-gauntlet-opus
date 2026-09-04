#!/usr/bin/env node
/**
 * Render the model roster's list thumbnails once, at build time.
 *
 *   node src/tools/thumbbake.mts [--force] [--quiet]
 *
 * ## Why this exists
 *
 * `Thumbs` captures a tile by copying the frame the studio has *already* drawn
 * for the model you opened. That is the right runtime design and it has one
 * consequence a phone makes obvious: the list is blank the first time you see
 * it, and fills in behind you as you walk it. Reported from a device as
 * "preview images only show after loading the model" — with a screenshot of 23
 * enemies, one of which had a picture. The tiles are worth most in the moment
 * they did not exist, choosing which of the 23 to open.
 *
 * The 56 renders have to happen somewhere. They do not have to happen on the
 * reviewer's phone: doing them in the page would be 56 rig constructions and
 * skinned-mesh uploads before the first tile appeared, which is exactly the
 * design `Thumbs`'s header rejects. So they happen here, once, in the daemon's
 * browser, and ship as `baked/thumbs.json`.
 *
 * ## Why it drives the real studio rather than rendering its own
 *
 * A thumbnail is only useful if it looks like what you get when you open the
 * asset — same framing, same three-quarter yaw for a creature, same exposure
 * pin, same backdrop. Every one of those lives in `ModelStage`, and a second
 * renderer here would be a second copy of all of it, drifting. So this opens
 * the studio, selects each asset the way a click does, and asks the shell for
 * the same capture the shell would have taken. `Thumbs.capture` stays the only
 * code that makes a tile.
 *
 * ## Freshness
 *
 * Keyed on the resolved build, recorded in the file. A committed tree re-bakes
 * when the sha moves, which is what `deploy.mts` does; a dirty tree keeps what
 * it has unless you pass `--force`, because a 90 s walk on every save would
 * make `build:full` unusable and a stale tile is cosmetic.
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { lease, runTool } from './harness.mts';
import { resolveBuild } from './identity.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'src', 'public', 'baked', 'thumbs.json');

/**
 * Square, and larger than the tile it becomes.
 *
 * `.st-thumb` is `object-fit: cover` at 34x34 in a row and 100%x76 in the tile
 * grid, so a wide source is cropped to its middle and a creature loses its
 * head. A square lease is the one aspect neither crop wastes. 512 down to 128
 * is a 4x box filter, which is what makes the small version legible.
 */
const VIEW = 512;

export async function thumbBake(opts: { force?: boolean, quiet?: boolean } = {}): Promise<boolean> {
  const log = opts.quiet ? () => {} : (...a: unknown[]) => console.log('[thumbbake]', ...a);
  const build = String(resolveBuild(undefined));

  if (!opts.force && existsSync(OUT)) {
    try {
      const prev = JSON.parse(await readFile(OUT, 'utf8')) as { _build?: string };
      if (prev._build && prev._build === build) { log(`fresh for ${build}, skipped`); return false; }
    } catch { /* unreadable is the same as absent */ }
  }

  const t0 = Date.now();
  const leased = await lease({ w: VIEW, h: VIEW, agent: 'thumbbake', lane: 'sweep', ttlMs: 15 * 60_000 });
  try {
    const { page } = leased;
    page.on('pageerror', (e) => log('PAGEERROR:', String(e).split('\n')[0]));

    const out = await page.evaluate(async () => {
      const g = window.GAME as unknown as { get: (n: string) => unknown };
      // The studio refuses to open over the title screen, and a leased page
      // may have one. @see _probe/studiodoor.mts, which learned this first.
      const story = g.get('Story') as { hideTitle?: () => void } | null;
      story?.hideTitle?.();

      const mod = await import('/studio/StudioShell.ts');
      const shell = await mod.openStudio(window.GAME);

      // **The one thing a leased page does differently, and it is visible in
      // every tile.** `openStudio` boots the `none` profile -- a renderer, a
      // camera, an empty scene -- so on the real path there is no world to
      // hide and `showWorld(false)` correctly returns early on `worldBooted`.
      // A harness lease is the opposite: the daemon hands over a page with the
      // game fully booted and the world already in the scene. `worldBooted`
      // still reads false, `showWorld(false)` still returns early, and the
      // first run of this tool baked 56 models standing in front of Leide --
      // terrain, horizon, and in three of them the Regalia and a crowd of
      // NPCs from a camp.
      //
      // The flag means "the world is in the scene", and here it is, so say so
      // before entering the section that parks it.
      shell.worldBooted = true;
      await shell.setSection('model');

      const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      const frames = async (n: number) => { for (let i = 0; i < n; i++) await raf(); };

      // **Let the lens converge before the first tile, not during it.**
      // `pinExposure` does not freeze the exposure, it clamps the integrator's
      // target band to a fixed value and lets it converge there from wherever
      // it was -- deliberately, and the header on it explains why freezing was
      // worse. Wherever it was, in a leased page, is a sunlit Leide afternoon,
      // so the first tiles came out visibly darker than the rest as the lens
      // walked down to the studio's pin. One settle here costs a second and
      // makes all 56 comparable, which is the entire point of a turntable.
      await frames(90);

      const m = shell.model;
      // `families_()`, not `families`: the latter is the live array of Family
      // objects and the former the flat view with ids and counts. (The name is
      // ugly and it is the shell's contract; `_probe/studiodoor.mts` calls
      // `families()` and has been throwing there unnoticed.)
      const fams = m.families_();
      const tiles: Record<string, string> = {};
      const misses: string[] = [];

      for (let f = 0; f < fams.length; f++) {
        m.openFamily(f);
        // `keys()` after `openFamily`, not from the family view's count: the
        // family is the thing that knows its own roster.
        const keys = m.keys();
        for (let i = 0; i < keys.length; i++) {
          const id = `${fams[f].id}/${keys[i]}`;
          m.select(i);
          if (m.error) { misses.push(`${id}: ${m.error}`); continue; }
          // Three frames for `ModelStage.show`'s deferred framing to land,
          // then `wantThumb` waits two more of its own, then four for the
          // capture itself to happen inside the studio's loop.
          await frames(8);
          shell.wantThumb(id);
          await frames(8);
          const src = shell.thumbs.get(id);
          if (src) tiles[id] = src; else misses.push(`${id}: no frame`);
        }
      }
      return { tiles, misses, families: fams.length };
    });

    const n = Object.keys(out.tiles).length;
    for (const miss of out.misses) log('MISS', miss);
    if (!n) throw new Error('no tiles captured — refusing to write an empty bake');

    await mkdir(path.dirname(OUT), { recursive: true });
    await writeFile(OUT, JSON.stringify({ _build: build, ...out.tiles }));
    const kb = Math.round(Buffer.byteLength(JSON.stringify(out.tiles)) / 1024);
    log(`${n} tiles across ${out.families} families, ${kb} kB, ${Math.round((Date.now() - t0) / 1000)} s`
      + (out.misses.length ? ` (${out.misses.length} missed)` : ''));
    return true;
  } finally {
    await leased.release();
  }
}

if (process.argv[1] && process.argv[1].endsWith('thumbbake.mts')) {
  await runTool(async () => {
    await thumbBake({ force: process.argv.includes('--force'), quiet: process.argv.includes('--quiet') });
  });
}

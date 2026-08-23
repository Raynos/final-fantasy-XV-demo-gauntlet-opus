import path from 'node:path';
import { homedir } from 'node:os';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import type { BrowserContext } from 'playwright';

/**
 * One Chromium flag set for every tool in this repo.
 *
 * `--disable-frame-rate-limit` and `--disable-gpu-vsync` are DELIBERATELY
 * ABSENT, against intuition. Measured on a comparable project:
 *
 *   idle cost of one posed page   1.74 cores  ->  0.58   (3x)
 *   boot to ready                 1983 ms     ->  1663   (17% faster)
 *   avg pose + screenshot         2281 ms     ->  1889   (17% faster)
 *   frames                        byte-identical across three shots
 *
 * Uncapped rendering draws hundreds of frames nobody screenshots, and that work
 * competes with the capture path. Our benchmarks do not need it either: they
 * step the simulation manually and bracket each frame with `gl.finish()`, so
 * they measure GPU completion rather than presentation. Do not add it back.
 *
 * `--use-angle=metal` is explicit rather than `default` so the backend cannot
 * drift between machines and quietly change the numbers.
 *
 * Kept for capture correctness, not speed:
 *   --force-color-profile=srgb   identical pixels regardless of display profile
 *   --hide-scrollbars            no scrollbar in the frame
 *   --mute-audio                 the audio system is real
 */
export const CHROMIUM_ARGS = [
  '--use-gl=angle',
  '--use-angle=metal',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--force-color-profile=srgb',
  '--hide-scrollbars',
  '--mute-audio',
];

/**
 * The ONE Chromium profile for this game, shared by every worktree on the box.
 *
 * Machine-wide rather than per-checkout on purpose. The cache is keyed by what
 * the GPU compiled, and every worktree compiles the same ~110 programs from the
 * same engine — so a profile per worktree means N copies of one answer, N cold
 * boots to rebuild it after every `git worktree add`, and N times the disk.
 *
 * Sharing is safe here only because these are HEADLESS launches: headless
 * Chromium does not take the `SingletonLock` a normal profile does. Verified by
 * launching two persistent contexts against one directory at the same time —
 * both got a live browser, neither errored. Two writers can still make the disk
 * cache incoherent; Chromium detects that and rebuilds, which costs exactly the
 * compiles we were paying before, so the worst case is today's behaviour.
 *
 * `HARNESS_PROFILE_DIR` overrides it, which is what a test with no business
 * touching the real cache should use.
 */
export const profileDir = (): string => process.env.HARNESS_PROFILE_DIR
  || path.join(homedir(), 'Library', 'Caches', 'ffxv-gauntlet-harness', 'chromium-profile');

/**
 * A ceiling on the profile, so one shared cache cannot grow without bound.
 *
 * Note what this flag is NOT: a hard limit. It is a budget Chromium works down
 * to by evicting later, so a single session happily wrote 97 MB under a 24 MB
 * budget while it was busy. Measured steady state is ~128 MB — 97 MB of HTTP
 * cache, 18 MB of V8 bytecode, 11 MB of compiled GPU programs — so 1 GB is
 * headroom against a pathological run, not a target anything approaches.
 */
const DISK_CACHE_BYTES = 1024 * 1024 * 1024;

/**
 * Launch Chromium against a profile that SURVIVES the run, so the GPU program
 * cache survives with it.
 *
 * `chromium.launch()` hands every run a throwaway profile, and Chromium keeps
 * its compiled-program cache inside the profile — so this game's ~110 shader
 * compiles (docs/plans/2026-08-21-opus-harness-daemon.md) were paid in full on
 * every single boot, forever, and the cache never had a chance to do its job.
 *
 * It has to be `launchPersistentContext`, not an extra `--user-data-dir` in
 * `CHROMIUM_ARGS`: playwright appends its own `--user-data-dir=<temp>` AFTER
 * the caller's args (`defaultArgs()` in playwright-core), and Chromium honours
 * the LAST occurrence of a switch — so the flag form looks right, runs clean,
 * and does nothing at all.
 *
 * A persistent profile is a cache, not state we own, so nothing here may become
 * a way to fail: a lock held by another process, or a profile a Chromium
 * upgrade left unreadable, falls back to a throwaway one and only costs the
 * compiles we were paying anyway.
 */
export async function launchPersistent(
  viewport: { width: number, height: number },
  /**
   * Open a CDP endpoint on this port.
   *
   * The daemon needs it so a *play* tool can be handed a whole page without
   * owning the browser: `gameplay`, `combatloop`, `integration` and friends
   * drive real input over a running loop and need the `Page`, not a frame. They
   * `chromium.connectOverCDP()` to this, and the daemon keeps the budget, the
   * deadline and the teardown. Zero (the default) leaves the port closed, which
   * is what every capture path wants.
   */
  cdpPort = 0,
  /**
   * Extra flags, and whether the shared profile may be used at all.
   *
   * `bootprof` needs both: `--enable-precise-memory-info` (without it
   * `performance.memory` is rounded to a 100 kB bucket, which is coarse enough
   * to hide the thing being measured) and a **throwaway** profile, because a
   * warm shader cache is exactly what a boot profile must not silently inherit.
   * It is one of the two tools that legitimately owns a browser — you cannot
   * measure a browser you do not own — and it takes the daemon's exclusive
   * lease first so it is still the only one running.
   */
  { extraArgs = [], persistent = true }: { extraArgs?: string[], persistent?: boolean } = {},
): Promise<{ ctx: BrowserContext, persistent: boolean }> {
  const dir = profileDir();
  const debugArgs = [...(cdpPort ? [`--remote-debugging-port=${cdpPort}`] : []), ...extraArgs];
  // An escape hatch that is also the only honest way to measure this: the two
  // paths have to be A/B-able in one tree, or "the cache helps" is a guess.
  if (!persistent || process.env.HARNESS_PERSISTENT_PROFILE === '0') {
    const browser = await chromium.launch({ args: [...CHROMIUM_ARGS, ...debugArgs] });
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    ctx.on('close', () => { void browser.close().catch(() => {}); });
    return { ctx, persistent: false };
  }
  try {
    await mkdir(dir, { recursive: true });
    const ctx = await chromium.launchPersistentContext(dir, {
      args: [...CHROMIUM_ARGS, ...debugArgs, `--disk-cache-size=${DISK_CACHE_BYTES}`],
      viewport, deviceScaleFactor: 1,
    });
    return { ctx, persistent: true };
  } catch (e) {
    console.warn(`[chromium] persistent profile unavailable (${e instanceof Error ? e.message : String(e)});`
      + ' falling back to a throwaway one — boots will re-compile every shader');
    const browser = await chromium.launch({ args: [...CHROMIUM_ARGS, ...debugArgs] });
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    // A persistent context owns its browser, so closing it is enough. A plain
    // context does NOT: `ctx.close()` leaves the chromium running, and the
    // daemon only ever closes the context. That is precisely how the orphan
    // browsers `cleanup.mts` hunts get made, so tie the two together here.
    ctx.on('close', () => { void browser.close().catch(() => {}); });
    return { ctx, persistent: false };
  }
}

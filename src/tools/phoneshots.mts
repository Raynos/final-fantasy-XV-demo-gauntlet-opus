#!/usr/bin/env node
/**
 * Photograph the three screens a phone player passes through, on a phone.
 *
 *   node src/tools/phoneshots.mts --out tmp/shots/phone
 *   node src/tools/phoneshots.mts --out tmp/shots/phone --dirty
 *
 * The front door, the title screen and the first frame of play — each in
 * portrait and in landscape, under a real Playwright device descriptor.
 *
 * ## Why this is not `shoot.mts`, `ui-shoot.mts` or `studioshots.mts`
 *
 * `shoot` and `ui-shoot` both drive `?shoot=1`, and `?shoot=1` routes past the
 * front door, past the title screen and past the whole touch layer on purpose —
 * BRIEF rule 2 makes two capture runs byte-identical, which nothing with an
 * attract camera and a boot animation can be. `studioshots` walks the door into
 * the *studio*. Nothing photographed the two menus a player actually meets, and
 * so nobody saw that the door's menu had lost its centring, that the title
 * screen rendered at `zoom: 0.55` on a handset, or that the only way to pick a
 * row was a d-pad drawn over the attract camera.
 *
 * A phone is not a narrow desktop: `hover: none`, a coarse pointer and
 * `hasTouch` are what `Device.ts` reads and what pick the phone layouts, so the
 * descriptor is the whole point. Both orientations, because both are reachable
 * — the door and the studio are portrait-legal, and the game is not.
 *
 * The frames are for looking at. It asserts nothing; `touchcheck` and
 * `devicecheck` own the assertions.
 */
import { chromium, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildServer, harnessArgs, announceBuild } from './harness.mts';

const argv = process.argv.slice(2);
const outIx = argv.indexOf('--out');
const OUT = outIx >= 0 ? argv[outIx + 1] : 'tmp/shots/phone';
const ha = harnessArgs(argv, { q: 'low', play: true });
announceBuild(ha);
await mkdir(OUT, { recursive: true });

/**
 * Portrait and landscape, plus a desktop control.
 *
 * The desktop row is not decoration: every phone rule in this pass is a
 * `hover: none` / `html.has-touch` branch off a shared stylesheet, and the way
 * that goes wrong is by leaking into the build 99% of the corpus is shot on.
 */
/**
 * `deviceScaleFactor: 1`, overriding the descriptor's 3.
 *
 * Everything this tool looks at is a CSS-pixel layout question, and the
 * viewport in CSS px is what the descriptor is here for. Keeping the real 3x
 * meant asking a software rasteriser to fill 1179x1977 of deferred-ish forward
 * pass per frame, and `page.screenshot` timed out at 30 s on the first frame
 * with a WebGL context in it. The layout under test is identical either way.
 */
const PROFILES: Array<{ tag: string, ctx: Record<string, unknown> }> = [
  { tag: 'port', ctx: { ...devices['iPhone 15 Pro'], deviceScaleFactor: 1 } },
  { tag: 'land', ctx: { ...devices['iPhone 15 Pro landscape'], deviceScaleFactor: 1 } },
  { tag: 'desk', ctx: { viewport: { width: 1600, height: 900 } } },
];

const { port } = await buildServer({ build: ha.build, prod: true });
const browser = await chromium.launch();

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

try {
  for (const prof of PROFILES) {
    const ctx = await browser.newContext(prof.ctx);
    const page = await ctx.newPage();
    // 120 s, not Playwright's 30. Same reason `harness.lease` sets it: this
    // shares a Metal GPU with whatever else is running, and a `screenshot` of a
    // live WebGL page that is merely slow surfaced here as a hard timeout on
    // the first frame with a context in it.
    page.setDefaultTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
    const shot = async (name: string) => {
      const file = path.join(OUT, `${prof.tag}-${name}.jpg`);
      try {
        await writeFile(file, await page.screenshot({ type: 'jpeg', quality: 82 }));
        console.log(`[shot] ${file}`);
      } catch (e) {
        // `page.screenshot` waits on `document.fonts.ready`, and a page whose
        // font set never resolves hangs there rather than failing. One profile
        // missing a frame is worth strictly less than the other five, so this
        // says so and carries on.
        console.log(`[shot] SKIPPED ${file} — ${(e as Error).message.split('\n')[0]}`);
      }
    };

    // ---- the front door, before anything boots
    await page.goto(`http://127.0.0.1:${port}/?nobake=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('#door.in', { timeout: 30000 });
    await settle(2400);                       // the lockup animation lands at ~2.1 s
    await shot('1-door');

    // ---- PLAY, then the title screen over the attract camera
    await page.click('#door .fd-row:nth-child(1)');
    // The boot is the long pole: thirty systems, terrain, a shader compile.
    await page.waitForFunction(
      () => !!window.GAME?.get('Story')?.title?.shown,
      undefined,
      { timeout: 180000 },
    );
    // Wait on the title's OWN clock, not the wall's.
    //
    // `TitleScreen.update` accumulates `t` from the frame delta, and `Game`
    // clamps that delta -- so on a page rendering the world through a software
    // rasteriser at one or two frames a second, four seconds of wall clock buys
    // a couple of tenths of lockup animation. The first pass settled 4.2 s and
    // photographed a screen 0.2 s into its fade-in: an almost-invisible crest
    // and no menu at all, which reads exactly like a broken layout and is not
    // one. 4.5 is past every stagger in the file (the footer starts at 3.4).
    await page.waitForFunction(
      () => (window.GAME?.get('Story')?.title?.t ?? 0) > 4.5,
      undefined,
      { timeout: 300000 },
    );
    await shot('2-title');
    console.log(`      ${prof.tag}: touch layer `
      + `${await page.evaluate(() => (window.TOUCH ? (window.TOUCH.root.hidden ? 'hidden' : 'SHOWING') : 'absent'))}`
      + ' over the title');

    // ---- New Game, tapped on the row the way a thumb does it
    await page.click('#title .ti-row:nth-child(1)', { force: true });
    await page.waitForFunction(
      () => !window.GAME?.get('Story')?.title?.shown,
      undefined,
      { timeout: 60000 },
    );
    await settle(6000);
    await shot('3-play');

    if (errors.length) console.log(`      ${prof.tag}: PAGE ERRORS ${errors.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}

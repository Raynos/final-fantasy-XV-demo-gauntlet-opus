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
const PROFILES: Array<{ tag: string, ctx: Record<string, unknown> }> = [
  { tag: 'port', ctx: { ...devices['iPhone 15 Pro'] } },
  { tag: 'land', ctx: { ...devices['iPhone 15 Pro landscape'] } },
  { tag: 'desk', ctx: { viewport: { width: 1600, height: 900 } } },
];

const { port } = await buildServer({ build: ha.build, prod: true });
const browser = await chromium.launch();

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

try {
  for (const prof of PROFILES) {
    const ctx = await browser.newContext(prof.ctx);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
    const shot = async (name: string) => {
      const file = path.join(OUT, `${prof.tag}-${name}.jpg`);
      await writeFile(file, await page.screenshot({ type: 'jpeg', quality: 82 }));
      console.log(`[shot] ${file}`);
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
    // 3.4 s is when the title's own footer finishes fading in, so this is the
    // screen at rest rather than mid-lockup.
    await settle(4200);
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

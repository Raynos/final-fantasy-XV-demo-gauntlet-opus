#!/usr/bin/env node
/**
 * Photograph the Game Studio as a person sees it, on a desktop and on a phone.
 *
 *   node src/tools/studioshots.mts --out tmp/shots/studio
 *   node src/tools/studioshots.mts --out tmp/shots/studio --dirty
 *
 * Neither `shoot.mts` nor `probe.mts` can do this: both drive a `?shoot=1`
 * page, and `?shoot=1` routes straight into the game so the front door and the
 * studio never appear. `studiocheck` opens a real `?studio=1` page but exists
 * to assert counts, not to be looked at. This is the look-loop's tool: it
 * walks the front door, the studio menu, a staged model and a world arrival,
 * on Desktop Chrome and on an iPhone descriptor, and writes a frame at each.
 *
 * It uses `buildServer` + Playwright device descriptors the way `devicecheck`
 * does, because a phone is not a narrow desktop: `hover: none`, a coarse
 * pointer and `hasTouch` are what pick the mobile shell.
 */
import { chromium, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildServer, harnessArgs, announceBuild } from './harness.mts';

const argv = process.argv.slice(2);
const outIx = argv.indexOf('--out');
const OUT = outIx >= 0 ? argv[outIx + 1] : 'tmp/shots/studio';
const ha = harnessArgs(argv, { q: 'low', play: true });
announceBuild(ha);
await mkdir(OUT, { recursive: true });

const PROFILES: Array<{ tag: string, ctx: Record<string, unknown> }> = [
  { tag: 'desk', ctx: { viewport: { width: 1600, height: 900 } } },
  { tag: 'phone', ctx: { ...devices['iPhone 15 Pro'] } },
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
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${port}/?nobake=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('#door.in', { timeout: 30000 });
    const doorMs = Date.now() - t0;
    await settle(1800);                       // let the lockup animation land
    await shot('1-door');
    console.log(`      ${prof.tag}: front door interactive in ${doorMs} ms, `
      + `${await page.evaluate(() => window.GAME.systems.length)} systems booted`);

    // ---- into the studio, by clicking the row a person clicks
    await page.click('#door .fd-row:nth-child(2)');
    await page.waitForSelector('#studio', { timeout: 60000 });
    await settle(1200);
    await shot('2-menu');

    // ---- a model
    await page.evaluate(async () => { await window.__STUDIO!.setSection('model'); });
    await settle(400);
    await page.evaluate(() => {
      const m = window.__STUDIO!.model;
      const fams = m.families_();
      m.openFamily(fams.findIndex((f) => f.id === 'enemies'));
      m.select(Math.max(0, m.keys().indexOf('bloodhorn')));
      window.__STUDIO!.onSection?.('model');
    });
    await settle(1400);
    await shot('3-model');

    // ---- the world
    await page.evaluate(async () => { await window.__STUDIO!.setSection('world'); });
    await page.evaluate(() => {
      const w = window.__STUDIO!.world;
      const sig = w.places().filter((p) => p.group === 'Signature');
      if (sig[1]) w.arrive(sig[1]);
      window.__STUDIO!.onSection?.('world');
    });
    await settle(3500);
    await shot('4-world');

    if (errors.length) console.log(`      ${prof.tag}: PAGE ERRORS ${errors.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}

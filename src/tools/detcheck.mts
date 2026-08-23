#!/usr/bin/env node
/** Diagnostic: isolate whether nondeterminism comes from boot or from stepping. */
import type { Page } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { harnessArgs, announceBuild, lease, buildServer } from './harness.mts';

const SHOT = process.argv[2] || 'vista_dawn';
const ha = harnessArgs(process.argv.slice(2), { w: 800, h: 450 });
announceBuild(ha);

// A BLANK lease plus a build port, not a booted page: this tool's whole subject
// is what a boot does, so a page the daemon already booted would answer the
// question before it was asked.
const { port } = await buildServer({ build: ha.build });
const URL = `http://127.0.0.1:${port}/?q=ultra&shoot=1`;
const leased = await lease({ blank: true, w: 800, h: 450, agent: ha.agent });

async function grab(page: Page, n = 60) {
  await page.evaluate(([s, f]: [string, number]) => {
    const g = window.GAME;
    g.resetClock();
    g.applyShot(s); g.settle(f); g.applyShot(s); g.settle(8);
  }, [SHOT, n] as [string, number]);
  return page.screenshot({ type: 'png' });
}

/**
 * Re-navigate rather than open a second page.
 *
 * A fresh `goto` tears down the whole JS realm, the WebGL context and every
 * module instance, which is the thing being compared against a reused page. It
 * keeps the browser's shader cache warm, exactly as a second page would, so the
 * comparison is unchanged — and it means this tool holds one slot rather than
 * one browser.
 */
async function session(page: Page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 120000 });
  await page.evaluate(() => { window.GAME.stop(); document.getElementById('boot')?.remove(); });
  return page;
}

const p1 = await session(leased.page);
const a = await grab(p1);
const b = await grab(p1);           // same page, second capture
const p2 = await session(leased.page);
const c = await grab(p2);           // fresh boot

const eq = (x: Buffer, y: Buffer) => Buffer.compare(x, y) === 0;
console.log(`same page, repeated : ${eq(a, b) ? 'IDENTICAL' : 'DIFFERS'}`);
console.log(`fresh page          : ${eq(a, c) ? 'IDENTICAL' : 'DIFFERS'}`);
await writeFile('/tmp/det_a.png', a);
await writeFile('/tmp/det_c.png', c);
await leased.release();

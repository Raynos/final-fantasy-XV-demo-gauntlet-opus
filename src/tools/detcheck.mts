#!/usr/bin/env node
/** Diagnostic: isolate whether nondeterminism comes from boot or from stepping. */
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const PORT = process.env.PORT || 5299;
const URL = `http://127.0.0.1:${PORT}/?q=ultra&shoot=1`;
const SHOT = process.argv[2] || 'vista_dawn';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader', '--force-color-profile=srgb', '--hide-scrollbars'],
});

async function grab(page: any, n = 60) {
  await page.evaluate(([s, f]: any) => {
    const g = window.GAME;
    g.resetClock();
    g.applyShot(s); g.settle(f); g.applyShot(s); g.settle(8);
  }, [SHOT, n]);
  return page.screenshot({ type: 'png' });
}

async function session() {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 120000 });
  await page.evaluate(() => { window.GAME.stop(); document.getElementById('boot')?.remove(); });
  return page;
}

const p1 = await session();
const a = await grab(p1);
const b = await grab(p1);           // same page, second capture
const p2 = await session();
const c = await grab(p2);           // fresh page

const eq = (x: any, y: any) => Buffer.compare(x, y) === 0;
console.log(`same page, repeated : ${eq(a, b) ? 'IDENTICAL' : 'DIFFERS'}`);
console.log(`fresh page          : ${eq(a, c) ? 'IDENTICAL' : 'DIFFERS'}`);
await writeFile('/tmp/det_a.png', a);
await writeFile('/tmp/det_c.png', c);
await browser.close();

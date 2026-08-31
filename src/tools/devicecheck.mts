#!/usr/bin/env node
/**
 * Does the phone build actually turn itself on, on a phone?
 *
 *   node src/tools/devicecheck.mts
 *
 * Every claim about detection in this project has so far been an *assertion*:
 * "an iPhone passes all three legs". That is a thing you can reason yourself
 * into believing and be wrong about, and the failure is invisible in the worst
 * way — a person opens the link, silently gets the 78 MB desktop build with no
 * touch controls, and reports that the game is broken.
 *
 * So this drives the real page under Playwright's own device descriptors,
 * which carry the real `userAgent`, viewport, device scale factor and
 * `hasTouch`/`isMobile` flags, and reads the answer out of the running module
 * rather than recomputing it here — a check that reimplements the predicate
 * would pass while the predicate was broken.
 *
 * The three legs, for reference: a touchscreen exists, the *primary* pointer
 * is coarse, and nothing can hover.
 */
import { chromium, devices } from 'playwright';
import { buildServer, runTool } from './harness.mts';
import { resolveBuild } from './identity.mts';

/** What each profile must decide. `demo` implies the small download and `q=low`. */
interface Row { device: string; demo: boolean; touch: boolean; why: string }

const WANT: Row[] = [
  // Phones — every one of these must get the demo AND the controls.
  { device: 'iPhone 15 Pro', demo: true, touch: true, why: 'the case this was built for' },
  { device: 'iPhone 15 Pro Max', demo: true, touch: true, why: '430 px short edge — over the old 500 px test' },
  { device: 'iPhone SE', demo: true, touch: true, why: 'the smallest thing anybody still uses' },
  { device: 'Pixel 7', demo: true, touch: true, why: 'Android, Chrome' },
  { device: 'Galaxy S9+', demo: true, touch: true, why: 'Android, older and wider' },
  // Landscape counts too: the old size test read `screen`, not the viewport,
  // but a regression could easily reintroduce an orientation-dependent leg.
  { device: 'iPhone 15 Pro landscape', demo: true, touch: true, why: 'orientation must not change the answer' },
  { device: 'Pixel 7 landscape', demo: true, touch: true, why: 'same, on Android' },
  // Tablets. They pass now, deliberately: a tablet on cellular pulling 78 MB
  // has the same bad afternoon a phone does, and has no keyboard either.
  { device: 'iPad Mini', demo: true, touch: true, why: 'no keyboard, cellular, same trade' },
  { device: 'iPad Pro 11', demo: true, touch: true, why: 'same' },
  // And the one that must NOT flip: a desktop is a desktop.
  { device: 'Desktop Chrome', demo: false, touch: false, why: 'the full game, unchanged' },
];

async function main() {
  const { port } = await buildServer({ build: resolveBuild(undefined), prod: true });
  const browser = await chromium.launch();
  const results: Array<Row & { gotDemo: boolean, gotTouch: boolean, legs: unknown, pass: boolean }> = [];
  try {
    for (const want of WANT) {
      const d = devices[want.device];
      if (!d) { console.log(`SKIP  ${want.device} — no such Playwright descriptor`); continue; }
      const ctx = await browser.newContext(d);
      const page = await ctx.newPage();
      // `?nobake=1` so this never waits on 44 MB: detection is decided at
      // module evaluation, long before a container matters.
      await page.goto(`http://127.0.0.1:${port}/?nobake=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      const got = await page.evaluate(async () => {
        const m = await import('/engine/Device.ts');
        return {
          demo: m.demoActive(),
          touch: m.touchActive(),
          legs: {
            maxTouchPoints: navigator.maxTouchPoints || 0,
            coarse: matchMedia('(pointer: coarse)').matches,
            noHover: matchMedia('(hover: none)').matches,
          },
        };
      }) as { demo: boolean, touch: boolean, legs: unknown };
      await ctx.close();
      const pass = got.demo === want.demo && got.touch === want.touch;
      results.push({ ...want, gotDemo: got.demo, gotTouch: got.touch, legs: got.legs, pass });
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${want.device.padEnd(26)}`
        + ` demo=${String(got.demo).padEnd(5)} touch=${String(got.touch).padEnd(5)}`
        + `  ${pass ? want.why : `WANTED demo=${want.demo} touch=${want.touch} — ${JSON.stringify(got.legs)}`}`);
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} device profiles decided correctly`);
  if (failed.length) {
    console.log('\nA phone that fails this gets the 78 MB desktop build and no way to move,'
      + '\nand reports the game as broken. That is why this is a gate and not a probe.');
  }
  process.exit(failed.length ? 1 : 0);
}

await runTool(main);

#!/usr/bin/env node
/**
 * The FIRST visit: an empty HTTP cache, and a main thread that is not answering.
 *
 *   node src/tools/coldload.mts --prod          # what a person who has never been here pays
 *   node src/tools/coldload.mts                 # the same against the dev server
 *   node src/tools/coldload.mts --prod --n 2    # add a warm-HTTP-cache reload for the A/B
 *
 * **Two of the three blank rows in `docs/BOOT_PERF.md` are the same page load
 * looked at from two sides**, so they are measured by one tool.
 *
 *  1. **First visit, empty HTTP cache.** `bootprof` measures `Game.init()` on a
 *     WARM cache and includes no navigation, no transfer, no parse and no bundle
 *     compile. A real first visit downloads the whole bake — tens of megabytes
 *     of it — before `Game.init()` has done anything at all. This tool launches
 *     a browser with a fresh profile, clears the HTTP cache explicitly anyway,
 *     and counts every byte on the wire.
 *  2. **Is the screen responsive while that happens?** `BOOT_PERF.md` writes the
 *     mechanism down from the code and marks it unverified: `Game.init()` awaits
 *     a chain of `bootPhase(...)` calls on the main thread, `await` yields
 *     BETWEEN phases and not INSIDE one, so a phase that builds geometry for
 *     400 ms blocks paint and input for 400 ms. That is a claim about the main
 *     thread and it is directly measurable.
 *
 * ## How the unresponsiveness is measured
 *
 * An init script — installed before a single line of the app runs — starts a
 * `requestAnimationFrame` chain and a `longtask` `PerformanceObserver`, and a
 * `MutationObserver` on `#boot-label`.
 *
 * The rAF chain is the honest instrument, because **it is the loading screen**:
 * `#boot .bar i` animates `right` with a CSS transition, and `right` is not a
 * compositor property, so it is repainted on the main thread by exactly the
 * frames this chain is counting. A gap of 400 ms between two rAF callbacks is
 * 400 ms in which the bar could not have moved, no paint could land and no
 * click could be dispatched. `longtask` gives the same number from the
 * scheduler's side, and the label observer names the boot phase each gap fell
 * in — so the answer is not "the page blocks" but "the page blocks for N ms,
 * here, during this phase".
 */
import { pathToFileURL } from 'node:url';
import { launchPersistent } from './chromium.mts';
import { harnessArgs, announceBuild, buildServer, withExclusive, EXIT_BUSY } from './harness.mts';
import { printContention, contention } from './ruler.mts';
import { powerWarning } from './power.mts';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const num = (n: string, d: number) => { const i = argv.indexOf(n); return i < 0 ? d : Number(argv[i + 1]); };

/**
 * The same flag set `bootprof` uses, and for the same reason: a boot number
 * from a box with no GPU is still a boot number.
 */
const ARGS_COLD = ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--force-color-profile=srgb',
  '--hide-scrollbars', '--mute-audio'];

/**
 * Installed before the app, so it sees the whole load and not the tail of it.
 *
 * Kept deliberately tiny: three observers and an array push. Anything heavier
 * would be measuring itself.
 */
const WATCH = `(() => {
  const w = window;
  w.__cold = { raf: [], long: [], labels: [], t0: performance.now() };
  const tick = () => { w.__cold.raf.push(performance.now()); w.__cold.rafId = requestAnimationFrame(tick); };
  w.__cold.rafId = requestAnimationFrame(tick);
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__cold.long.push({ s: +e.startTime.toFixed(1), d: +e.duration.toFixed(1) });
    }).observe({ entryTypes: ['longtask'] });
  } catch (e) { w.__cold.noLongtask = String(e); }
  // The label is the only thing on screen that tells a person the page is
  // alive, so when it last changed is exactly the question.
  const watchLabel = () => {
    const el = document.getElementById('boot-label');
    if (!el) return requestAnimationFrame(watchLabel);
    w.__cold.labels.push({ t: +performance.now().toFixed(1), text: el.textContent });
    new MutationObserver(() => w.__cold.labels.push({ t: +performance.now().toFixed(1), text: el.textContent }))
      .observe(el, { childList: true, characterData: true, subtree: true });
  };
  watchLabel();
})()`;

const READ = `(() => {
  const w = window.__cold;
  cancelAnimationFrame(w.rafId);
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const res = performance.getEntriesByType('resource');
  let transfer = 0, decoded = 0;
  const big = [];
  for (const r of res) {
    transfer += r.transferSize || 0;
    decoded += r.decodedBodySize || 0;
    if ((r.transferSize || 0) > 500000) {
      big.push({ n: r.name.replace(/^https?:\\/\\/[^/]+/, ''), t: r.transferSize, d: r.decodedBodySize,
        start: +r.startTime.toFixed(0), end: +r.responseEnd.toFixed(0) });
    }
  }
  big.sort((a, b) => b.t - a.t);
  return {
    raf: w.raf, long: w.long, labels: w.labels, noLongtask: w.noLongtask || null,
    requests: res.length, transfer, decoded, big,
    nav: {
      responseEnd: +(nav.responseEnd || 0).toFixed(0),
      domContentLoaded: +(nav.domContentLoadedEventEnd || 0).toFixed(0),
      load: +(nav.loadEventEnd || 0).toFixed(0),
    },
    profile: window.BOOT_PROFILE || null,
  };
})()`;

interface ColdRead {
  raf: number[];
  long: { s: number, d: number }[];
  labels: { t: number, text: string }[];
  noLongtask: string | null;
  requests: number;
  transfer: number;
  decoded: number;
  big: { n: string, t: number, d: number, start: number, end: number }[];
  nav: { responseEnd: number, domContentLoaded: number, load: number };
  profile: { total: number, marks: { name: string, ms: number }[] } | null;
}

const MB = (b: number) => `${(b / 1e6).toFixed(1)} MB`;

/** Which boot phase was on screen at time `t`. */
const labelAt = (labels: { t: number, text: string }[], t: number): string => {
  let cur = '(before the label existed)';
  for (const l of labels) { if (l.t <= t) cur = l.text; else break; }
  return cur;
};

function report(name: string, r: ColdRead, wallMs: number, readyMs: number) {
  console.log(`\n=== ${name}`);
  console.log(`  navigation -> GAME.ready   ${(wallMs / 1000).toFixed(2)} s`
    + (r.profile ? `   (Game.init() ${(r.profile.total / 1000).toFixed(2)} s of it)` : ''));
  console.log(`  HTML response ended at     ${(r.nav.responseEnd / 1000).toFixed(2)} s`
    + `   DOMContentLoaded ${(r.nav.domContentLoaded / 1000).toFixed(2)} s`);
  console.log(`  over the wire              ${MB(r.transfer)} in ${r.requests} requests`
    + `   (${MB(r.decoded)} decoded)`);
  for (const b of r.big) {
    console.log(`      ${MB(b.t).padStart(9)} on the wire, ${MB(b.d).padStart(9)} decoded`
      + `  ${((b.end - b.start) / 1000).toFixed(2)} s  ${b.n}`);
  }

  // --- responsiveness -------------------------------------------------------
  const gaps: { at: number, ms: number }[] = [];
  for (let i = 1; i < r.raf.length; i++) gaps.push({ at: r.raf[i - 1], ms: r.raf[i] - r.raf[i - 1] });
  const upTo = gaps.filter((g) => g.at <= readyMs);
  const blocked = upTo.filter((g) => g.ms > 50);
  const totalBlocked = blocked.reduce((s, g) => s + g.ms, 0);
  const worst = upTo.slice().sort((a, b) => b.ms - a.ms);
  console.log(`\n  --- was the screen responsive? (rAF gaps up to GAME.ready)`);
  console.log(`  frames the browser got     ${upTo.length} in ${(readyMs / 1000).toFixed(2)} s`
    + ` = ${(upTo.length / (readyMs / 1000)).toFixed(1)} fps`
    + `   (a responsive page would be ~${Math.round(readyMs / 16.7)})`);
  console.log(`  gaps over 50 ms            ${blocked.length}, totalling ${(totalBlocked / 1000).toFixed(2)} s`
    + ` = ${((totalBlocked / readyMs) * 100).toFixed(0)}% of the load with NO paint and NO input`);
  console.log(`  longest single block       ${(worst[0]?.ms ?? 0).toFixed(0)} ms`);
  if (r.noLongtask) console.log(`  (longtask observer unavailable: ${r.noLongtask.slice(0, 60)})`);
  else {
    const lt = r.long.filter((e) => e.s <= readyMs);
    console.log(`  longtask entries           ${lt.length}, worst ${Math.max(0, ...lt.map((e) => e.d)).toFixed(0)} ms,`
      + ` total ${(lt.reduce((s, e) => s + e.d, 0) / 1000).toFixed(2)} s`);
  }
  console.log(`\n  the ten longest blocks, and what the loading screen said during each`);
  console.log(`  ${'at'.padStart(8)}  ${'blocked'.padStart(9)}   label on screen`);
  for (const g of worst.slice(0, 10)) {
    console.log(`  ${(g.at / 1000).toFixed(2).padStart(8)}s ${`${g.ms.toFixed(0)} ms`.padStart(9)}   ${labelAt(r.labels, g.at)}`);
  }
  if (r.profile) {
    console.log(`\n  Game.init() phases over 100 ms, for comparison`);
    for (const m of r.profile.marks.slice().sort((a, b) => b.ms - a.ms)) {
      if (m.ms < 100) continue;
      console.log(`  ${' '.repeat(9)}${`${m.ms.toFixed(0)} ms`.padStart(9)}   ${m.name}`);
    }
  }
}

async function main() {
  const N = num('--n', 1);
  const PLAY = !flag('--shoot');
  printContention();
  const pw = powerWarning();
  if (pw) console.log(pw);

  const ha = harnessArgs(argv);
  announceBuild(ha);
  const { port: PORT, kind } = await buildServer({ build: ha.build, prod: ha.prod });
  console.log(`[coldload] serving a ${kind} build`
    + (ha.prod ? ' (prod: one bundle, minified)' : ' (dev: unbundled ES modules, hundreds of requests)'));
  if (!ha.prod) {
    console.log('[coldload] NOTE: a dev server is not what anybody deploys. --prod is the honest first visit.');
  }

  // A browser of its own, from the one module allowed to launch one, under the
  // quiet lane — the same bargain `bootprof` makes, and for the same reason:
  // the navigation IS the measurement, so a page the daemon already booted
  // answers the question before it is asked.
  const { ctx } = await launchPersistent({ width: 1600, height: 900 }, 0,
    { extraArgs: ARGS_COLD, persistent: false });
  try {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1600, height: 900 });
    page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).split('\n')[0]));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await page.addInitScript(WATCH);

    for (let i = 0; i < N; i++) {
      // A fresh profile already has an empty cache; clearing it explicitly is
      // what makes run 2..N a *warm* comparison rather than an accident.
      if (i === 0) await cdp.send('Network.clearBrowserCache');
      const t0 = Date.now();
      await page.goto(`http://127.0.0.1:${PORT}/?q=high${PLAY ? '' : '&shoot=1'}${ha.extra ? `&${ha.extra}` : ''}`,
        { waitUntil: 'commit', timeout: 600000 });
      await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 600000 });
      const wall = Date.now() - t0;
      const readyMs = await page.evaluate('performance.now() - window.__cold.t0') as number;
      const r = await page.evaluate(READ) as ColdRead;
      report(i === 0 ? 'FIRST VISIT — empty HTTP cache' : `reload ${i} — warm HTTP cache`, r, wall, readyMs);
    }
  } finally {
    await ctx.close();
    const after = contention();
    if (after.busy) {
      console.log(`\n!! CONTENDED by the end — load ${after.load1.toFixed(2)}`
        + `${after.trees.length ? `, live worktrees: ${after.trees.join(', ')}` : ''}. Not a baseline.`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await withExclusive('coldload', main).catch((e) => {
    if ((e as { busy?: true }).busy) { console.error(`[harness] ${(e as Error).message}`); process.exit(EXIT_BUSY); }
    console.error(e); process.exit(1);
  });
}

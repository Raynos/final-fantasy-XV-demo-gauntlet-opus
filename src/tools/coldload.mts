#!/usr/bin/env node
/**
 * The FIRST visit: an empty HTTP cache, and a main thread that is not answering.
 *
 *   node src/tools/coldload.mts --prod          # what a person who has never been here pays
 *   node src/tools/coldload.mts                 # the same against the dev server
 *   node src/tools/coldload.mts --prod --n 2    # add a warm-HTTP-cache reload for the A/B
 *   node src/tools/coldload.mts --prod --gate   # the `bootblock` gate, as `check --perf` runs it
 *   node src/tools/coldload.mts --prod --q ultra        # the capture harness's load: adds geo.bin.gz
 *   node src/tools/coldload.mts --origin https://host/  # the deployed site, over the real wire
 *
 * ## What it counts, and where it stops counting
 *
 * The headline is **bytes to the first frame**, not bytes to `load`. `GAME.ready`
 * is set inside `Game.init()` in the same task as the warm render before it, so
 * nothing has been presented at that instant; the marker here is the first
 * `requestAnimationFrame` callback that observes it, which is the first moment a
 * person could see the game. Every resource whose `responseEnd` is at or before
 * that is charged to the first frame and everything else is reported separately.
 * Without that cut the budget cannot tell a tier that the first frame waited for
 * from one that landed eight seconds later, and tiering the bake would measure as
 * no improvement at all.
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
const str = (n: string, d: string) => { const i = argv.indexOf(n); return i < 0 ? d : String(argv[i + 1]); };

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
  w.__cold = { raf: [], long: [], labels: [], firstFrame: null, t0: performance.now() };
  const tick = () => {
    const t = performance.now();
    w.__cold.raf.push(t);
    // THE FIRST FRAME. \`GAME.ready\` is set inside \`Game.init()\`, in the same
    // task as the warm \`post.render()\` that precedes it, so at that instant
    // nothing has been *presented*: the compositor has not run and #boot still
    // covers the screen. The first rAF callback that observes \`ready\` is the
    // first frame the browser can actually put game content on the glass, and
    // it is the only marker here that a person could see.
    if (w.__cold.firstFrame == null && w.GAME && w.GAME.ready === true) w.__cold.firstFrame = t;
    w.__cold.rafId = requestAnimationFrame(tick);
  };
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

/**
 * Let whatever the page deferred actually land, before READ looks.
 *
 * `waitForFunction` returns the instant `GAME.ready` flips, and a tier deferred
 * past the first frame has by construction not started yet at that moment. So
 * reading immediately makes a deferred artifact **indistinguishable from one
 * that is never fetched at all** — the report would say "0 MB deferred" whether
 * the tiering worked or the file was missing, which is the one distinction this
 * tool exists to make. Waiting costs nothing that matters: `transferFF` is cut
 * at the first frame, so nothing that lands in here can be charged to it.
 */
const SETTLE = `(async () => {
  const n = () => performance.getEntriesByType('resource').length;
  const t0 = performance.now();
  let last = n(), quiet = performance.now();
  while (performance.now() - t0 < 8000) {
    await new Promise((r) => setTimeout(r, 100));
    const c = n();
    if (c !== last) { last = c; quiet = performance.now(); }
    else if (performance.now() - quiet > 750) break;
  }
  return n();
})()`;

const READ = `(() => {
  const w = window.__cold;
  cancelAnimationFrame(w.rafId);
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const res = performance.getEntriesByType('resource');
  // No frame yet means the page never presented one; charge everything to it
  // rather than silently reporting a 0 MB first load.
  const ff = w.firstFrame == null ? performance.now() : w.firstFrame;
  let transfer = 0, decoded = 0, transferFF = 0, decodedFF = 0, requestsFF = 0;
  const big = [], baked = [];
  for (const r of res) {
    const n = r.name.replace(/^https?:\\/\\/[^/]+/, '');
    const row = { n, t: r.transferSize || 0, d: r.decodedBodySize || 0,
      start: +r.startTime.toFixed(0), end: +r.responseEnd.toFixed(0) };
    transfer += row.t;
    decoded += row.d;
    // \`responseEnd\`, not \`startTime\`: a byte that had not landed when the
    // frame was drawn was not paid for by that frame. This is the whole point
    // of the marker — without the cut a deferred tier that lands at t+8 s is
    // still counted, and tiering measures as exactly zero improvement.
    if (row.end <= ff) { transferFF += row.t; decodedFF += row.d; requestsFF++; }
    if (row.t > 500000) big.push(row);
    if (/\\/baked\\//.test(n)) baked.push(row);
  }
  big.sort((a, b) => b.t - a.t);
  baked.sort((a, b) => a.n.localeCompare(b.n));
  return {
    raf: w.raf, long: w.long, labels: w.labels, noLongtask: w.noLongtask || null,
    firstFrame: w.firstFrame == null ? null : +ff.toFixed(0),
    requests: res.length, transfer, decoded, big, baked,
    transferFF, decodedFF, requestsFF,
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
  /** ms from navigation to the first animation frame that observed `GAME.ready`. */
  firstFrame: number | null;
  requests: number;
  transfer: number;
  decoded: number;
  /** The three numbers the budget is actually about: bytes that landed BEFORE the first frame. */
  transferFF: number;
  decodedFF: number;
  requestsFF: number;
  big: { n: string, t: number, d: number, start: number, end: number }[];
  /** Every `baked/` request, so a run can say which artifacts were on disk. */
  baked: { n: string, t: number, d: number, start: number, end: number }[];
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
  console.log(`  ** TO FIRST FRAME **       ${MB(r.transferFF)} in ${r.requestsFF} requests`
    + `   (first frame at ${r.firstFrame == null ? 'never — no rAF observed ready' : `${(r.firstFrame / 1000).toFixed(2)} s`})`);
  const after = r.transfer - r.transferFF;
  console.log(`  deferred past first frame  ${MB(after)} in ${r.requests - r.requestsFF} requests`
    + (after > 500000 ? '   <-- off the first frame\'s bill' : '   (nothing is deferred)'));
  for (const b of r.big) {
    console.log(`      ${MB(b.t).padStart(9)} on the wire, ${MB(b.d).padStart(9)} decoded`
      + `  ${((b.end - b.start) / 1000).toFixed(2)} s  ${b.n}`
      + `  ${r.firstFrame != null && b.end > r.firstFrame ? '[after first frame]' : ''}`);
  }

  // Which of the baked artifacts were actually on disk for THIS run.
  //
  // A missing artifact is silent by design — every path falls back to its
  // generator — so a first-load number taken with two of six artifacts absent
  // reads as a *good* number. `geo.bin.gz` and `texc.bin.gz` go missing on any
  // co-agent's `vite build` (see project/LANDMINES.md, "Baked caches"), which is
  // exactly how 85.5 MB got written down as the truth. This row is the receipt.
  console.log(`\n  --- baked artifacts this run actually fetched`);
  if (!r.baked.length) console.log('      NONE — every generator ran in place (?nobake=1, or baked/ is empty)');
  for (const b of r.baked) {
    console.log(`      ${MB(b.t).padStart(9)}  ${b.n}`
      + (b.t < 10000 ? '   <-- MISSING or 404: the generator ran instead' : ''));
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

/**
 * The gate, and what it is actually guarding.
 *
 * Three budgets, and only one of them is a timing number.
 *
 * `BLOCKS_MIN` is the structural one and the reason this gate exists. Before
 * `Game.init()` yielded a real task, the entire 8 s boot arrived as **two**
 * long tasks; it is now fourteen. Any change that puts a microtask-only
 * `await` back — or moves the phase loop somewhere that does not yield — takes
 * that count straight back to one or two, and nothing else in the suite would
 * notice. It is a count, so contention cannot move it.
 *
 * `BLOCK_MS_MAX` is deliberately loose. The worst block measured is 1325 ms
 * (`Vegetation`), and this is not trying to ratchet that down a hundred
 * milliseconds at a time — it is trying to catch a phase that has grown into a
 * multi-second freeze. A tight budget here would be a timing assertion on a
 * shared laptop, which is how gates get disabled.
 *
 * `TRANSFER_MAX` guards the first visit, and it is measured **to the first
 * frame** rather than over the whole page. That is not a refinement, it is what
 * makes the budget mean anything: the point of tiering the bake is to move bytes
 * off the critical path, and a sum with no time cut-off counts a tier that lands
 * eight seconds late exactly as heavily as one the first frame waited for — so
 * tiering would measure as zero improvement, and deferring would look like a
 * regression the moment it added a request. The failure this catches is somebody
 * putting an artifact in front of the first frame, which localhost makes
 * completely invisible: 85 MB arrives here in a quarter of a second and on a
 * 50 Mbit connection in fourteen.
 *
 * The budget is a ratchet, not a target. Lower it when a tier lands; never raise
 * it to make a run pass. It has come 120 -> 90 -> 78 MB: 90 was this instrument's
 * first honest reading, and 78 is 72.2 MB of measured first-frame load (bundle
 * 1.02 + terrain 25.51 + tex 25.11 + texc 20.51) plus eight percent, after `h`
 * and `far` moved to `q16d` and `dgn/*` moved behind the first frame.
 *
 * A run taken while `texc.bin.gz` or `geo.bin.gz` is missing reads about 20 MB
 * or 27 MB light and still passes; that is what the artifact table in the report
 * above is for, and why it flags anything under 10 kB.
 */
const BLOCKS_MIN = 8;
const BLOCK_MS_MAX = 3500;
const TRANSFER_MAX = 78e6;

function gate(r: ColdRead, readyMs: number): boolean {
  const gaps: number[] = [];
  for (let i = 1; i < r.raf.length; i++) if (r.raf[i - 1] <= readyMs) gaps.push(r.raf[i] - r.raf[i - 1]);
  const blocked = gaps.filter((g) => g > 50);
  const worst = Math.max(0, ...gaps);
  const checks: [string, boolean, string][] = [
    ['boot is split into tasks the browser can paint between',
      blocked.length >= BLOCKS_MIN, `${blocked.length} blocks over 50 ms, need >= ${BLOCKS_MIN}`],
    ['no single main-thread block is a multi-second freeze',
      worst <= BLOCK_MS_MAX, `worst ${worst.toFixed(0)} ms, budget ${BLOCK_MS_MAX} ms`],
    ['a first visit stays inside its transfer budget TO THE FIRST FRAME',
      r.transferFF <= TRANSFER_MAX,
      `${MB(r.transferFF)} before the first frame (${MB(r.transfer)} in total), budget ${MB(TRANSFER_MAX)}`],
    // A budget on bytes that were never counted is not a budget. If the marker
    // did not fire, `transferFF` fell back to "everything", and saying so is the
    // difference between a gate and a decoration.
    ['the first-frame marker fired, so the budget above counted something',
      r.firstFrame != null, r.firstFrame == null ? 'no rAF observed GAME.ready' : `${r.firstFrame} ms`],
  ];
  let ok = true;
  for (const [what, pass, detail] of checks) {
    console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${what} — ${detail}`);
    if (!pass) ok = false;
  }
  console.log(`\nbootblock: ${ok ? 'PASS' : 'FAIL'} — ${blocked.length} blocks, worst ${worst.toFixed(0)} ms,`
    + ` ${MB(r.transferFF)} to first frame (${MB(r.transfer)} total)`);
  return ok;
}

async function main() {
  const N = num('--n', 1);
  const GATE = flag('--gate');
  const PLAY = !flag('--shoot');
  printContention();
  const pw = powerWarning();
  if (pw) console.log(pw);

  const ha = harnessArgs(argv);
  // `--origin https://host/path/` measures the deployed site instead of a local
  // build: no vite, no daemon build tree, the real wire. Everything else about
  // the run — fresh profile, cleared cache, the same observers — is identical,
  // which is the point: the two numbers are comparable.
  const ORIGIN = (() => { const i = argv.indexOf('--origin'); return i < 0 ? null : argv[i + 1]; })();
  const Q = str('--q', 'high');
  let PORT = 0;
  if (ORIGIN) {
    console.log(`[coldload] measuring the DEPLOYED origin ${ORIGIN} — no local build is served`);
  } else {
    announceBuild(ha);
    const built = await buildServer({ build: ha.build, prod: ha.prod });
    PORT = built.port;
    console.log(`[coldload] serving a ${built.kind} build`
      + (ha.prod ? ' (prod: one bundle, minified)' : ' (dev: unbundled ES modules, hundreds of requests)'));
    if (!ha.prod) {
      console.log('[coldload] NOTE: a dev server is not what anybody deploys. --prod is the honest first visit.');
    }
  }
  // The single most expensive footgun in this tool's history, printed every run.
  if (Q !== 'ultra') {
    console.log(`[coldload] NOTE: q=${Q}. GeoBake only fetches geo.bin.gz at q=ultra`
      + ' (BAKED_VARIANT, GeoBake.ts) — so this run does NOT include ~30 MB of geometry,'
      + ' and it is the honest number for a visitor, who gets q=high by default.'
      + ' `--q ultra` is what the capture harness loads. Quote which one you measured.');
  }

  // A browser of its own, from the one module allowed to launch one, under the
  // quiet lane — the same bargain `bootprof` makes, and for the same reason:
  // the navigation IS the measurement, so a page the daemon already booted
  // answers the question before it is asked.
  const { ctx } = await launchPersistent({ width: 1600, height: 900 }, 0,
    { extraArgs: ARGS_COLD, persistent: false });
  let failed = false;
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
      // An `--origin` may carry its own query, and silently discarding it is a
      // footgun that costs a whole run to notice: `--origin '.../?demo=1'`
      // measured the DESKTOP build and looked like a bug in the game. The
      // origin's params go on first so this tool's own still win a conflict.
      const originUrl = ORIGIN ? new URL(ORIGIN) : null;
      const base = originUrl ? `${originUrl.origin}${originUrl.pathname.replace(/\/+$/, '')}/` : `http://127.0.0.1:${PORT}/`;
      const carried = originUrl && originUrl.search ? `${originUrl.search.slice(1)}&` : '';
      await page.goto(`${base}?${carried}q=${Q}${PLAY ? '' : '&shoot=1'}${ha.extra ? `&${ha.extra}` : ''}`,
        { waitUntil: 'commit', timeout: 600000 });
      await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 600000 });
      const wall = Date.now() - t0;
      const readyMs = await page.evaluate('performance.now() - window.__cold.t0') as number;
      await page.evaluate(SETTLE);
      const r = await page.evaluate(READ) as ColdRead;
      report(i === 0 ? 'FIRST VISIT — empty HTTP cache' : `reload ${i} — warm HTTP cache`, r, wall, readyMs);
      if (GATE && i === 0) failed = !gate(r, readyMs);
    }
  } finally {
    await ctx.close();
    const after = contention();
    if (after.busy) {
      console.log(`\n!! CONTENDED by the end — load ${after.load1.toFixed(2)}`
        + `${after.trees.length ? `, live worktrees: ${after.trees.join(', ')}` : ''}. Not a baseline.`);
    }
  }
  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await withExclusive('coldload', main).catch((e) => {
    if ((e as { busy?: true }).busy) { console.error(`[harness] ${(e as Error).message}`); process.exit(EXIT_BUSY); }
    console.error(e); process.exit(1);
  });
}

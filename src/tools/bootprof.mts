#!/usr/bin/env node
/**
 * Boot / page-load profiler.
 *
 *   node src/tools/bootprof.mts            # one cold + one warm load, per-system breakdown
 *   node src/tools/bootprof.mts --n 3      # 3 loads, report each
 *   node src/tools/bootprof.mts --mem      # attribute the resident memory instead
 *   node src/tools/bootprof.mts --mem --play    # only the two pages a person opens
 *   node src/tools/bootprof.mts --mem --prod    # the same, against a minified build
 *   node src/tools/bootprof.mts --warm-ab  # A/B the shader warm-up, sync vs compileAsync
 *   node src/tools/bootprof.mts --play     # boot as a PLAYER, not as the harness
 *
 * **`--play` is the number `project/TODO.md` is about.** Everything else here
 * loads `?shoot=1`, which is the harness's own path: the dev suite refuses to
 * load, the encounter director is switched off, and some boot work is done and
 * then thrown away by that switch. That is the right default — it is what
 * every capture in this repo pays — but it is not what "starting a new page
 * takes forever" refers to, and quoting a shoot-mode number as *the* boot time
 * overstates how fast the game a person opens actually is. Report both.
 *
 * Prints the wall clock from navigation to `GAME.ready` and the per-system
 * `init()` breakdown collected by `src/engine/BootProfile.ts`.
 */
import { contention, printContention } from './ruler.mts';
import { execFileSync } from 'node:child_process';
import { launchPersistent } from './chromium.mts';
import { harnessArgs, announceBuild, buildServer, withExclusive, EXIT_BUSY } from './harness.mts';

/**
 * Everything the page can see about its own footprint.
 *
 * Runs in the page, so it can only report the *renderer* process's JS heap and
 * what three.js knows it has uploaded. The GPU-process and browser-process
 * halves of the total are added from the OS side by {@link reportMemory}, and
 * that separation is the whole point: the 1.4 GB in `project/TODO.md` is
 * process RSS across several processes, not a JS heap.
 */
const MEM_PROBE = `(() => {
  const g = window.GAME;
  const texSeen = new Set(), geoSeen = new Set();
  let cpuTexels = 0, cpuTexCount = 0, gpuTexels = 0, gpuTexCount = 0;
  let attrBytes = 0, idxBytes = 0, geoCount = 0;
  const addTex = (t) => {
    if (!t || texSeen.has(t)) return; texSeen.add(t);
    const img = t.image; if (!img || !img.width) return;
    // Mip chains add a third again; a texture without them does not.
    const mip = t.generateMipmaps === false ? 1 : 4 / 3;
    gpuTexels += img.width * img.height * 4 * mip; gpuTexCount++;
    if (img.data && img.data.byteLength) { cpuTexels += img.data.byteLength; cpuTexCount++; }
  };
  const addMat = (m) => {
    if (!m) return;
    for (const k in m) { const v = m[k]; if (v && v.isTexture) addTex(v); }
    if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) addTex(v); }
  };
  g.scene.traverse((o) => {
    if (o.geometry && !geoSeen.has(o.geometry)) {
      geoSeen.add(o.geometry); geoCount++;
      for (const nm in o.geometry.attributes) {
        const a = o.geometry.attributes[nm];
        if (a && a.array) attrBytes += a.array.byteLength;
      }
      if (o.geometry.index && o.geometry.index.array) idxBytes += o.geometry.index.array.byteLength;
    }
    const m = o.material;
    if (Array.isArray(m)) m.forEach(addMat); else addMat(m);
  });
  addTex(g.scene.environment); addTex(g.scene.background);

  // Render targets and shadow maps are GPU bytes that no scene-graph walk can
  // reach: they hang off PostFX, the renderer's shadow map and the material
  // generators, never off a mesh. They were the whole of the old
  // "unattributed" row's texture half, so they get counted rather than guessed.
  // Breadth-first from the handles that own them, bounded, visited-set guarded.
  let rtBytes = 0, rtCount = 0, shadowBytes = 0, shadowCount = 0;
  const rtSeen = new Set();
  const sizeOfRt = (rt) => {
    const t = rt.texture; const w = rt.width || (t && t.image && t.image.width) || 0;
    const h = rt.height || (t && t.image && t.image.height) || 0;
    if (!w || !h) return 0;
    // Bytes per texel from the three type enum: HalfFloat 1016, Float 1015.
    const ty = t ? t.type : 1009;
    const bpc = ty === 1015 ? 4 : ty === 1016 ? 2 : 1;
    const chan = 4;
    const n = (rt.textures && rt.textures.length) || 1;
    const depth = rt.depth || 1;
    return w * h * chan * bpc * n * depth * (rt.depthBuffer ? 1.25 : 1);
  };
  const walkRt = (root) => {
    const seen = new Set(); const q = [[root, 0]];
    while (q.length) {
      const [o, d] = q.shift();
      if (!o || typeof o !== 'object' || seen.has(o) || d > 4) continue;
      seen.add(o);
      if (seen.size > 6000) break;
      if (o.isRenderTarget || (o.isWebGLRenderTarget)) {
        if (!rtSeen.has(o)) { rtSeen.add(o); rtBytes += sizeOfRt(o); rtCount++; }
        continue;
      }
      if (Array.isArray(o)) { for (const v of o) q.push([v, d + 1]); continue; }
      if (o.isTexture || o.isMaterial || o.isBufferGeometry) continue;
      for (const k in o) {
        if (k === 'parent' || k === 'children' || k === 'scene' || k === 'renderer') continue;
        try { const v = o[k]; if (v && typeof v === 'object') q.push([v, d + 1]); } catch {}
      }
    }
  };
  try { walkRt(g.post); } catch {}
  try { walkRt(g.rnd); } catch {}
  try { walkRt(g.renderer.shadowMap); } catch {}
  g.scene.traverse((o) => {
    const sm = o.shadow && o.shadow.map;
    if (sm && !rtSeen.has(sm)) { rtSeen.add(sm); shadowBytes += sizeOfRt(sm); shadowCount++; }
  });

  const mem = performance.memory || null;
  return {
    heapUsed: mem ? mem.usedJSHeapSize : 0,
    heapTotal: mem ? mem.totalJSHeapSize : 0,
    precise: !!(mem && mem.usedJSHeapSize % 1024 !== 0),
    cpuTexels, cpuTexCount, gpuTexels, gpuTexCount,
    attrBytes, idxBytes, geoCount, rtBytes, rtCount, shadowBytes, shadowCount,
    info: JSON.parse(JSON.stringify(g.renderer.info.memory)),
    programs: g.renderer.info.programs ? g.renderer.info.programs.length : 0,
    dpr: g.renderer.getPixelRatio(),
    gl: (() => {
      try {
        const c = g.renderer.getContext();
        const d = c.getExtension('WEBGL_debug_renderer_info');
        return d ? String(c.getParameter(d.UNMASKED_RENDERER_WEBGL)) : 'unknown renderer';
      } catch { return 'unknown renderer'; }
    })(),
  };
})()`;

/** Resident set of the browser's whole process tree, in bytes. */
function treeRss(pid: number): { total: number, rows: string[] } {
  try {
    const ps = execFileSync('ps', ['-Ao', 'pid=,ppid=,rss=,args='], { encoding: 'utf8' });
    const byPid = new Map<number, { ppid: number, rss: number, comm: string }>();
    for (const line of ps.split('\n')) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
      if (!m) continue;
      // Chromium's four helpers are the same binary; only `--type=` tells them
      // apart, and which one holds the memory is the whole question.
      const args = m[4];
      const type = /--type=([a-z-]+)/.exec(args);
      const exe = (args.split(' ')[0] || '').split('/').pop() || '?';
      byPid.set(Number(m[1]), {
        ppid: Number(m[2]), rss: Number(m[3]) * 1024,
        comm: type ? `${exe} --type=${type[1]}` : exe,
      });
    }
    const want = new Set<number>([pid]);
    // Chromium's helpers are grandchildren, so walk to a fixpoint rather than
    // one generation down.
    for (let pass = 0; pass < 6; pass++) {
      for (const [p, v] of byPid) if (want.has(v.ppid)) want.add(p);
    }
    let total = 0; const rows: string[] = [];
    for (const p of want) {
      const v = byPid.get(p);
      if (!v) continue;
      total += v.rss;
      if (v.rss > 40e6) rows.push(`    ${(v.rss / 1e6).toFixed(0).padStart(5)} MB  ${v.comm}`);
    }
    return { total, rows };
  } catch { return { total: 0, rows: [] }; }
}

/**
 * A software-rasteriser-capable flag set, deliberately not `CHROMIUM_ARGS`.
 *
 * Boot profiling has to run where the capture path runs AND where it does not,
 * so `--enable-unsafe-swiftshader` stays: a boot number from a box with no GPU
 * is still a boot number, and losing it would mean this tool cannot run at all
 * on half the machines it is useful on.
 */
const ARGS_BOOTPROF = ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--force-color-profile=srgb',
      '--hide-scrollbars', '--mute-audio'];

const MB = (b: number) => `${(b / 1e6).toFixed(1)} MB`;

/**
 * Repeat the contention warning next to the result.
 *
 * The VERDICT at the top scrolls away behind a per-system table, and the line
 * people quote is the one at the bottom. A warning that is not adjacent to the
 * number it qualifies does not qualify it.
 */
function tail(busyBefore: boolean) {
  // Check again at the end, and judge on the worse of the two — the same rule
  // `ruler.mts` applies to its own noise floor, and for the same reason. A boot
  // profile takes the better part of a minute, and a co-agent that was idle when
  // it started can be mid-capture by the time it finishes. Tonight the verdict
  // printed "quiet — safe to measure" while naming three live worktrees, and the
  // number that came back was 17.05 s against a real 6.88 s. A single sample of
  // "is the machine busy" is not a measurement of a window.
  const after = contention();
  if (!busyBefore && !after.busy) return;
  console.log(`\n!! CONTENDED ${busyBefore && after.busy ? 'throughout' : busyBefore ? 'at the start' : 'by the end'}`
    + ` — the numbers above include somebody else's load. Not a baseline.`);
  if (after.trees.length) console.log(`   live worktrees: ${after.trees.join(', ')}`);
}

async function main() {
  const argv = process.argv.slice(2);
  let n = 2, nobake = false, mem = false, warmAb = false, play = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--n') n = Number(argv[++i]);
    else if (argv[i] === '--nobake') nobake = true;
    else if (argv[i] === '--mem') mem = true;
    else if (argv[i] === '--warm-ab') warmAb = true;
    else if (argv[i] === '--play') play = true;
  }

  // A boot number is as contention-sensitive as a frame time, and this tool had
  // no guard at all while `perf.mts` grew a whole ruler. Measured tonight: 6.88 s
  // cold on a quiet tree, 17.05 s with three agents capturing. Anyone reading the
  // second number without this block would have concluded boot had regressed by
  // ten seconds. Printed before anything is measured, never after.
  const busy = printContention().busy;
  if (busy) {
    console.log('         boot times below are NOT a baseline. Re-run on a quiet tree.\n');
  } else {
    console.log('');
  }

  // The build server comes from the daemon, so nobody picks a port and nobody
  // can attach to a co-agent's tree by accident.
  const ha = harnessArgs(process.argv.slice(2));
  announceBuild(ha);
  const { port: PORT, kind } = await buildServer({ build: ha.build, prod: ha.prod });
  if (mem) {
    // `--play`/`--shoot` narrow the matrix to one arm; bare `--mem` runs all
    // four, which is a four-browser-launch report and takes a few minutes.
    const only = play ? MEM_VARIANTS.filter((v) => !v.query.includes('shoot')) : MEM_VARIANTS;
    console.log(`\n[bootprof --mem] serving a ${kind} build`
      + (ha.prod ? ' (prod: minified, class names mangled)' : ' (dev: unbundled ES modules)'));
    try { await reportMemory(PORT, nobake, only); } finally { tail(busy); }
    return;
  }
  // Its OWN browser, on purpose, and the daemon's exclusive lease is what makes
  // that legitimate: the boot is the measurement, so a page the daemon already
  // booted answers the question before it is asked, and a shared shader cache
  // is precisely the confound. `main()` holds the quiet lane for the duration,
  // so this is still the only browser on the machine.
  const { ctx } = await launchPersistent({ width: 1600, height: 900 }, 0,
    { extraArgs: ARGS_BOOTPROF, persistent: false });
  const browser = ctx;
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1600, height: 900 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text().slice(0, 200)); });

  try {
    for (let run = 0; run < n * (warmAb ? 2 : 1); run++) {
      // The A/B alternates so a machine that gets busier partway through
      // penalises both arms equally rather than whichever went second.
      const async = warmAb && run % 2 === 1;
      const t0 = Date.now();
      await page.goto(`http://127.0.0.1:${PORT}/?q=ultra${play ? '' : '&shoot=1'}${nobake ? '&nobake=1' : ''}${ha.extra ? `&${ha.extra}` : ''}`
        + `${async ? '&warm=async' : ''}`,
      { waitUntil: 'domcontentloaded', timeout: 300000 });
      await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 300000 });
      // Under `?warm=async` the sweep outlives `ready`, so the wall clock to
      // `ready` is not the number that matters and the sweep has to be waited
      // for explicitly or its own report is still zero.
      await page.evaluate(() => window.GAME.post && window.GAME.post.warmupDone);
      const wall = Date.now() - t0;
      const prof = await page.evaluate(() => window.BOOT_PROFILE);
      if (warmAb) console.log(`\n--- warm-up ${async ? 'compileAsync' : 'sync'} ---`);
      const label = warmAb ? `run ${run}` : run === 0 ? 'cold' : `warm ${run}`;
      console.log(`\n=== load ${label}: ${(wall / 1000).toFixed(2)} s wall, ${(prof!.total / 1000).toFixed(2)} s in Game.init()`);
      const marks = prof!.marks.slice().sort((a, b) => b.ms - a.ms);
      for (const m of marks) {
        if (m.ms < 5) continue;
        console.log(`  ${String(m.ms.toFixed(0)).padStart(7)} ms  ${m.name}`);
      }
      if (prof!.warmup) {
        console.log(`  -- warmup ${prof!.warmup.ms.toFixed(0)} ms, +${prof!.warmup.programs} programs`);
        for (const s of prof!.warmup.steps) console.log(`     ${String((s.ms || 0).toFixed(0)).padStart(6)} ms  ${s.name} (${s.programs ?? '-'} progs)`);
      }
    }
  } finally {
    await browser.close();
    tail(busy);
  }
}

/**
 * Split the process footprint into JS heap, GPU-side bytes and the browser's
 * own overhead, for the plain page and for `?debug=1`.
 *
 * The TODO this answers reads "it uses 1.4 GB of RAM in ?debug and maybe in
 * prod mode too". Both halves of that need separating before anything is
 * optimised, because a JS heap and a resident set are not the same quantity.
 *
 * **The first version of this report could not answer its own question.** It
 * booted `?q=ultra&shoot=1` and `?q=ultra&shoot=1&debug=1`, and `main.ts:37`
 * gates the dev suite on `qs.has('debug') && !qs.has('shoot')` — so *both* arms
 * were the same page with the suite not loaded, and the resulting "`?debug=1`
 * costs 4 MB" (`project/archive/handoff/boot-memory.md`) is a measurement of
 * boot-to-boot noise between two identical configurations. `MEM_VARIANTS` now
 * carries the play-mode pair, which is the only pair where the flag does
 * anything at all.
 */
async function reportMemory(PORT: number, nobake: boolean, variants: MemVariant[]) {
  // Playwright does not type `browser.process()`, so the browser is found the
  // same way its helpers are: as this process's own descendant.
  const base = treeRss(process.pid).total;
  console.log(`\nnode alone: ${MB(base)}`);
  console.log('Each variant gets its own browser launch. Navigating one page twice does not\n'
    + 'free the first world, and comparing prod against ?debug in one tab is how you\n'
    + 'conclude the dev suite costs 400 MB when it costs 20.');

  const summary: string[] = [];
  for (const v of variants) {
    const { ctx } = await launchPersistent({ width: 1600, height: 900 }, 0, {
      // `performance.memory` is rounded to a 100 kB bucket without this, which
      // is coarse enough to hide the thing being measured.
      extraArgs: [...ARGS_BOOTPROF, '--enable-precise-memory-info', '--js-flags=--expose-gc'],
      persistent: false,
    });
    const browser = ctx;
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1600, height: 900 });
    // The floor this variant's world is measured against: a launched browser
    // with one blank tab in it and no game. Everything above this line is
    // Chromium's, not ours, and it is most of the number in `project/TODO.md`.
    const idle = treeRss(process.pid).total;
    // A second CDP oracle, because `performance.memory` is frozen on some
    // headless builds (see `_probe/gcwatch.mts`) and reads a constant. When the
    // two disagree the in-page one is the liar.
    const cdp = await page.context().newCDPSession(page);
    await page.goto(`http://127.0.0.1:${PORT}/${v.query}${nobake ? (v.query.includes('?') ? '&nobake=1' : '?nobake=1') : ''}`,
      { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 300000 });
    // Four seconds of settle, so streaming and the first shadow refresh are
    // paid for and the number is not a half-built world.
    await page.waitForTimeout(4000);
    const m = await page.evaluate(MEM_PROBE) as {
      heapUsed: number, heapTotal: number, cpuTexels: number, cpuTexCount: number,
      gpuTexels: number, gpuTexCount: number, attrBytes: number, idxBytes: number,
      geoCount: number, rtBytes: number, rtCount: number, shadowBytes: number,
      shadowCount: number, info: { geometries: number, textures: number }, programs: number,
      gl: string,
    };
    const rss = treeRss(process.pid);
    const cdpHeap = await cdp.send('Runtime.getHeapUsage').catch(() => null) as
      { usedSize: number, totalSize: number } | null;
    // Force a full GC and re-read both: it separates *live* heap from garbage
    // the boot allocated and nobody has collected yet. A large drop here is a
    // free win nobody has to write code for; no drop closes the question.
    await cdp.send('HeapProfiler.enable').catch(() => {});
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    await page.waitForTimeout(1500);
    const gcHeap = await cdp.send('Runtime.getHeapUsage').catch(() => null) as
      { usedSize: number, totalSize: number } | null;
    const gcRss = treeRss(process.pid);

    const gpuTex = m.gpuTexels + m.rtBytes + m.shadowBytes;
    const gpu = gpuTex + m.attrBytes + m.idxBytes;
    console.log(`\n=== ${v.name}   [${m.gl}]`);
    console.log(`  browser at rest       ${MB(idle - base)}   <- Chromium's floor, before a single line of ours`);
    console.log(`  with the game loaded  ${MB(rss.total - base)}   (+${MB(rss.total - idle)} for the world)`);
    for (const r of rss.rows) console.log(r);
    console.log(`  JS heap used          ${MB(m.heapUsed)}  of ${MB(m.heapTotal)} allocated`
      + (cdpHeap ? `   [CDP says ${MB(cdpHeap.usedSize)} of ${MB(cdpHeap.totalSize)}]` : ''));
    console.log(`    CPU texel arrays    ${MB(m.cpuTexels)}  over ${m.cpuTexCount} DataTextures  (dead after upload)`);
    console.log(`    geometry attributes ${MB(m.attrBytes)} + ${MB(m.idxBytes)} index, ${m.geoCount} geometries  (NOT disposable)`);
    console.log(`    everything else     ${MB(m.heapUsed - m.cpuTexels - m.attrBytes - m.idxBytes)}`);
    if (gcHeap) {
      console.log(`  after a forced GC     heap ${MB(gcHeap.usedSize)}  (${MB((cdpHeap?.usedSize ?? 0) - gcHeap.usedSize)} was garbage)`);
      console.log(`                        RSS  ${MB(gcRss.total - base)}  (${MB(rss.total - gcRss.total)} returned to the OS)`);
    }
    console.log(`  GPU-side estimate     ${MB(gpu)}`);
    console.log(`    scene textures      ${MB(m.gpuTexels)}  over ${m.gpuTexCount} textures`);
    console.log(`    render targets      ${MB(m.rtBytes)}  over ${m.rtCount} targets  (PostFX chain, generators)`);
    console.log(`    shadow maps         ${MB(m.shadowBytes)}  over ${m.shadowCount} maps`);
    console.log(`    vertex + index      ${MB(m.attrBytes + m.idxBytes)}   (uploaded copy of the arrays above)`);
    console.log(`  three.js says         ${JSON.stringify(m.info)}, ${m.programs} programs`);
    console.log(`  unattributed          ${MB(rss.total - idle - m.heapUsed - gpu)}`
      + '   (process overhead, shader binaries, and under a software\n'
      + '                        rasteriser a host-memory copy of every GPU resource)');
    // `rss.total` counts node too. The browser is what the human sees.
    summary.push(`  ${v.name.padEnd(22)} ${MB(rss.total - base).padStart(10)} browser · ${MB(idle - base).padStart(9)} of it the floor · `
      + `${MB(rss.total - idle).padStart(9)} the world · ${MB(gpu).padStart(9)} GPU-side`);
    await browser.close();
  }
  console.log('\n=== the whole number, per variant (RSS of the browser process tree, node excluded)');
  for (const s of summary) console.log(s);
}

/** One page the memory report boots, in its own browser. */
interface MemVariant { name: string, query: string }

/**
 * The four pages worth measuring, and why they are four.
 *
 * `?shoot=1` is the harness's page and every memory number this repo has ever
 * recorded is one — but `project/TODO.md` is about the page a *person* opens,
 * which free-runs, arms the encounter director and loads the dev suite. Boot
 * time already learned this lesson (`--play`); the memory report had not.
 */
const MEM_VARIANTS: MemVariant[] = [
  { name: 'shoot (harness)', query: '?q=ultra&shoot=1' },
  { name: 'shoot + ?debug=1', query: '?q=ultra&shoot=1&debug=1' },
  { name: 'play (a person)', query: '?q=ultra' },
  { name: 'play + ?debug=1', query: '?q=ultra&debug=1' },
];

/**
 * The quiet lane, for the same reason `perf.mts` takes it: this measures boot,
 * and a boot measured beside three other browsers is a measurement of the other
 * three. Under one daemon owning one machine that is enforceable rather than
 * hoped for -- which is exactly what RESCUE §B6 could not do.
 */
/**
 * A machine somebody else is legitimately using is not a broken build.
 *
 * `/exclusive` now queues behind a live page lease rather than closing it -- so
 * a refusal here means a probe is mid-run, not that anything is wrong. Exit
 * `EXIT_BUSY` (4) so `check.mts` renders it BUSY rather than FAIL and an agent
 * reading the code can tell "retry in a minute" from "debug the renderer".
 */
await withExclusive('bootprof', main).catch((e) => {
  if ((e as { busy?: true }).busy) {
    console.error(`[harness] ${(e as Error).message}`);
    process.exit(EXIT_BUSY);
  }
  console.error(e);
  process.exit(1);
});

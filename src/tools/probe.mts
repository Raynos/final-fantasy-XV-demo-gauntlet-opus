#!/usr/bin/env node
/**
 * Ad-hoc in-page probe: `node src/tools/probe.mts src/tools/probes/foo.mts` runs
 * the file's body in the page.
 *
 *   node src/tools/probe.mts probes/foo.mts --shot tmp/shots/foo.jpg
 *   node src/tools/probe.mts probes/longplay.mts --ttl 40 --turbo    # 1 frame in 10
 *   node src/tools/probe.mts probes/longplay.mts --set __PLAY_MINUTES=6
 *
 * `--shot` grabs the canvas **after the probe body returns and without applying
 * a shot**, which is the one thing `framecam.mts` cannot do: it runs its shots
 * after the probe, and `applyShot` runs a Director scenario that tears down
 * whatever the probe set up. Anything a probe can drive -- a live set piece, a
 * minigame mid-fight, a menu three keystrokes deep -- can now be photographed
 * where it stands. A probe that wants several frames can call
 * `window.__shot(name)` at each moment instead; every one is written next to
 * `--shot`'s path with the name appended.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { harnessArgs, announceBuild, lease, pageOpts } from './harness.mts';
import { mkdir } from 'node:fs/promises';


const argv = process.argv.slice(2);
const shotIx = argv.indexOf('--shot');
const shotPath = shotIx >= 0 ? argv[shotIx + 1] : null;
/**
 * `--ttl <minutes>` — how long the daemon holds this probe's page.
 *
 * The lease TTL defaults to **15 minutes** in `routeLease`, and until a probe
 * ran longer than that nothing here had ever needed to say otherwise. Then
 * `longplay.mts` asked for a thirty-minute session and got its page closed at
 * minute 28, twice, with `Target page, context or browser has been closed` —
 * which is indistinguishable at the call site from the game crashing, and was
 * read as exactly that before somebody timed it.
 *
 * A long probe is a new kind of client for this daemon. The TTL exists so a
 * crashed tool cannot hold a browser forever, so this raises it rather than
 * removing it, and only for the run that asks.
 */
const ttlIx = argv.indexOf('--ttl');
const ttlMin = ttlIx >= 0 ? Number(argv[ttlIx + 1]) : 0;
/**
 * `--turbo <N>` -- step the simulation but submit only one frame in N.
 *
 * **Measured, not assumed** (`src/tools/probes/turbocost.mts`, an A/B/A on one
 * page): draw submission is **11.0 ms of an 11.66 ms frame -- 95% of it** --
 * against an A/B/A drift of 0.16 ms. The simulation itself costs 0.58 ms. So a
 * thirty-game-minute `longplay` spends about twenty of its twenty-one
 * wall-minutes drawing frames into a `?shoot=1` page that never presents them
 * and that nobody screenshots.
 *
 * That is also the answer to the discrepancy Phase D opened with: `gameplay`
 * priced the sim at 4.3-7.8 ms/frame and predicted 0.26-0.47 wall-min per
 * game-min against an observed floor of 0.7. The missing half was never the sim.
 *
 * ONE IN N, NOT NONE, AND **N MATTERS**. Rendering occasionally keeps everything
 * that depends on the render side alive -- TAA history, the exposure integrator,
 * streaming and LOD decisions taken against a real frustum -- so a turbo run
 * stays a run of the same game rather than of a headless subset of it.
 *
 * VALIDATED BY DETERMINISM, which this game uniquely can be. `TIMINGS.md`
 * records `longplay` minute 6 as `2.14 km, 4 encounters, 19 forage` at every
 * viewport and in both dev and prod. Six-game-minute runs, same page contract:
 *
 *     plain      0.75 wall-min/game-min    2.14 km, 4 enc, 19 forage, 13 kills
 *     --turbo 2  0.37                      2.14 km, 4 enc, 19 forage, 13 kills
 *     --turbo 10 0.10                      2.14 km, 4 enc, 19 forage, 13 kills
 *     --turbo 60 0.06                      2.13 km, 3 enc, 18 forage, 10 kills
 *
 * So **10 is the default, because 10 is the largest ratio measured identical**,
 * and it is already 7.5x: a thirty-game-minute session costs about three wall
 * minutes instead of twenty-two. Sixty is a soak-and-shape setting whose
 * telemetry must not be quoted. The suspected mechanism for the drift is
 * `Terrain.drawnHeightAt` reading the *rasterised clipmap* (`seatcheck.mts`
 * proves it is the renderer's own arithmetic), which an unsubmitted frame does
 * not refresh -- so the route moves, and the route is what encounters and forage
 * key off. **Re-validate against a plain run before quoting any new N.**
 */
const turboIx = argv.indexOf('--turbo');
const turboN = turboIx >= 0 ? Math.max(1, Number(argv[turboIx + 1]) || 10) : 0;
/**
 * `--set KEY=VALUE` -- put a value on `window` before the probe body runs.
 *
 * Probes here read their knobs off `window` (`__PLAY_MINUTES`, `__TURBO_FRAMES`)
 * and nothing could ever set one, so every knob was edited into the file and
 * edited back out again. Numbers arrive as numbers; everything else as a string.
 */
const sets: [string, string][] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== '--set') continue;
  const kv = argv[++i] ?? '';
  const eq = kv.indexOf('=');
  if (eq < 0) throw new Error(`--set wants KEY=VALUE, got ${JSON.stringify(kv)}`);
  sets.push([kv.slice(0, eq), kv.slice(eq + 1)]);
}
const VALUE_FLAGS = new Set(['--shot', '--ttl', '--turbo', '--set', '--cpu']);
const cpuIdx = argv.indexOf('--cpu');
/** Cores this probe will keep busy; `check` subtracts it from its CPU pool. */
const cpuCost = cpuIdx >= 0 ? Math.max(0, Number(argv[cpuIdx + 1]) || 0) : 1;
const probeFile = argv.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(argv[i - 1]));
if (!probeFile) {
  throw new Error('usage: probe.mts <probe.mts> [--shot out.jpg] [--ttl <minutes>] '
    + '[--turbo <N>] [--set KEY=VALUE] [--cpu <cores>]');
}
const src = await readFile(probeFile, 'utf8');
const ha = harnessArgs(process.argv.slice(2), {});
announceBuild(ha);
/**
 * A probe declares one core, because it genuinely uses one.
 *
 * A probe body runs inside a single `page.evaluate`, and the work it does there
 * is CPU: `probes/turbocost.mts` measures a stepped frame at 11.66 ms of which
 * 11.0 ms is draw submission and 0.58 ms is the simulation, all of it on one
 * thread. The browser-slot count never saw that -- a lease looks the same to the
 * pool whether the page is idle or stepping 1800 frames a game-minute -- so
 * `check` sized its CPU pool off `os.cpus()` alone and put four terrain-building
 * gates next to a live probe on the same box.
 *
 * `--cpu` overrides it for a probe that is genuinely idle (waiting on a
 * download, say) or genuinely parallel.
 */
const leased = await lease({
  ...pageOpts(ha),
  ...(ttlMin > 0 ? { ttlMs: Math.round(ttlMin * 60_000) } : {}),
  cpu: cpuCost,
});
const page = leased.page;
page.on('console', (m) => console.log(`[page:${m.type()}]`, m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
try {

  // `await window.__shot('name')` from inside the probe grabs the canvas *at
  // that moment*. The binding is async, so the page's JS thread is idle while
  // Node takes the frame -- which is what lets a probe photograph four stages
  // of a minigame in one boot instead of four.
  let shotN = 0;
  await page.exposeFunction('__shot', async (name?: string) => {
    if (!shotPath) return false;
    const ext = path.extname(shotPath) || '.jpg';
    const base = shotPath.slice(0, shotPath.length - ext.length);
    const file = `${base}-${name || ++shotN}${ext}`;
    await mkdir(path.dirname(file), { recursive: true });
    // The **page**, not the canvas: half of what a probe is worth
    // photographing is DOM (the prompt, a menu, the fishing gauges), and a
    // canvas-only grab drops every one of them silently.
    await page.screenshot({ path: file, type: ext === '.png' ? 'png' : 'jpeg',
      ...(ext === '.png' ? {} : { quality: 84 }) });
    console.log(`[shot] ${file}`);
    return true;
  });

  for (const [k, v] of sets) {
    await page.evaluate(([key, rawValue]: [string, string]) => {
      const w = window as unknown as Record<string, unknown>;
      w[key] = rawValue !== '' && Number.isFinite(Number(rawValue)) ? Number(rawValue) : rawValue;
    }, [k, v] as [string, string]);
    console.log(`[probe] window.${k} = ${v}`);
  }
  if (turboN > 1) {
    // Patched HERE rather than in each probe, so every long-running probe gets
    // it from one flag and no probe file has to know it exists.
    await page.evaluate((n: number) => {
      const g = (window as unknown as { GAME: { post: { render: () => void } } }).GAME;
      const real = g.post.render.bind(g.post);
      let i = 0;
      g.post.render = () => { if ((i++ % n) === 0) real(); };
      (window as unknown as Record<string, unknown>).__TURBO = n;
    }, turboN);
    console.log(`[probe] turbo: submitting 1 frame in ${turboN}. Draw submission is ~95% of a`);
    console.log('[probe] stepped frame (probes/turbocost.mts), so this is most of the wall clock.');
    if (turboN > 10) {
      console.log(`[probe] WARNING: ${turboN} is past the largest ratio measured IDENTICAL to a plain`);
      console.log('[probe] run (10). At 60 the telemetry moves — 2.13 km / 3 encounters against');
      console.log('[probe] 2.14 / 4. Treat this run as soak and shape, and do not quote its numbers.');
    }
  }

  const out = await page.evaluate(`(async () => { ${src} })()`);
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2));

  if (shotPath) {
    const ext = path.extname(shotPath) || '.jpg';
    const dir = path.dirname(shotPath);
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: shotPath, type: ext === '.png' ? 'png' : 'jpeg',
      ...(ext === '.png' ? {} : { quality: 84 }) });
    console.log(`[shot] ${shotPath}`);
  }
} finally { await leased.release(); }

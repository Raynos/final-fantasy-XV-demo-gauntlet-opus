#!/usr/bin/env node
/**
 * Is the periodic menu-open stall a garbage collection?
 *
 * `performance.memory` is frozen in this headless build (see
 * `src/tools/probes/perfgc.mts`, which is why that probe could not answer),
 * so the heap has to be read from OUTSIDE the page. CDP `Runtime.getHeapUsage`
 * is not frozen. That means driving the frame loop one frame per round trip
 * from Node, which is fine: the frame is timed inside the page, and the round
 * trip sits in the same place the `setTimeout(0)` yield sat.
 *
 *   node src/tools/_probe/gcwatch.mts            # menu open, 140 frames
 *   node src/tools/_probe/gcwatch.mts --closed   # control: no menu
 *   node src/tools/_probe/gcwatch.mts --delay 50 # is the period frames or wall time?
 *
 * The `--delay` arm is the discriminator that does not need a heap at all. A
 * spike every ten FRAMES that stays every ten frames when each frame is 50 ms
 * further apart is driven by work the game does; one that becomes every second
 * frame is driven by a clock (a timer, the compositor, an idle task).
 */
import { harnessArgs, announceBuild, lease, pageOpts, withExclusive } from '../harness.mts';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const num = (n: string, d: number) => { const i = argv.indexOf(n); return i < 0 ? d : Number(argv[i + 1]); };
const FRAMES = num('--frames', 140);
const DELAY = num('--delay', 0);
const CLOSED = flag('--closed');

async function main() {
  const ha = harnessArgs(argv, { q: 'ultra' });
  announceBuild(ha);
  const leased = await lease(pageOpts(ha));
  const page = leased.page;
  page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable', { timeDomain: 'threadTicks' });
  const metrics = async () => {
    const m = await cdp.send('Performance.getMetrics') as { metrics: { name: string, value: number }[] };
    const o: Record<string, number> = {};
    for (const e of m.metrics) o[e.name] = e.value;
    return o;
  };
  try {
    await page.evaluate(([open]) => {
      const g = window.GAME as any;
      g.applyShot('hud_field');
      g.get('CameraRig')?.clearShot?.();
      g.resetClock();
      g.input.keys.clear();
      const dt = 1 / 60;
      for (let i = 0; i < 30; i++) g.frame(dt);
      if (open) { g.get('Menus').setScreen('main'); for (let i = 0; i < 40; i++) g.frame(dt); }
      g.renderer.getContext().finish();
    }, [!CLOSED]);
    await new Promise((r) => setTimeout(r, 400));

    const rows: { i: number, ms: number, heap: number, d: number, m: Record<string, number> }[] = [];
    let prev = -1;
    let pm = await metrics();
    for (let i = 0; i < FRAMES; i++) {
      const ms = await page.evaluate(() => {
        const g = window.GAME as any;
        const gl = g.renderer.getContext();
        gl.finish();
        const t0 = performance.now();
        g.frame(1 / 60);
        gl.finish();
        return performance.now() - t0;
      });
      const hu = await cdp.send('Runtime.getHeapUsage') as { usedSize: number, totalSize: number };
      const heap = hu.usedSize / 1048576;
      const nm = await metrics();
      const dm: Record<string, number> = {};
      for (const k of Object.keys(nm)) dm[k] = +((nm[k] - (pm[k] ?? 0)) * (/Duration|Time/.test(k) ? 1000 : 1)).toFixed(2);
      pm = nm;
      rows.push({ i, ms: +ms.toFixed(1), heap: +heap.toFixed(2), d: prev < 0 ? 0 : +(heap - prev).toFixed(2), m: dm });
      prev = heap;
      if (DELAY) await new Promise((r) => setTimeout(r, DELAY));
    }

    const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    const spikes = rows.filter((r) => r.ms > Math.max(16.7, med * 2.5));
    const calm = rows.filter((r) => !spikes.includes(r));
    const avg = (xs: number[]) => +(xs.reduce((a, b) => a + b, 0) / (xs.length || 1)).toFixed(3);
    const drops = (xs: typeof rows) => `${xs.filter((r) => r.d < -0.5).length}/${xs.length}`;
    const gaps: number[] = [];
    for (let k = 1; k < spikes.length; k++) gaps.push(spikes[k].i - spikes[k - 1].i);

    console.log(`\nmenu ${CLOSED ? 'CLOSED (control)' : 'OPEN'}   delay ${DELAY} ms   frames ${FRAMES}`);
    console.log(`median ${med.toFixed(2)} ms   spikes ${spikes.length}   over33 ${rows.filter((r) => r.ms > 33).length}`);
    console.log(`spike frames: ${spikes.map((r) => r.i).join(' ')}`);
    console.log(`gaps between spikes: ${gaps.join(' ')}`);
    console.log(`heap ${rows[0].heap} -> ${rows[rows.length - 1].heap} MB   min ${Math.min(...rows.map((r) => r.heap))}  max ${Math.max(...rows.map((r) => r.heap))}`);
    console.log(`alloc per calm frame ${avg(calm.map((r) => r.d))} MB   heap DROPS on spikes ${drops(spikes)}   on calm ${drops(calm)}`);
    const KEYS = ['ThreadTime', 'ProcessTime', 'TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount', 'Nodes', 'JSEventListeners'];
    console.log('\nframe  ms      heapMB   dHeap  ' + KEYS.map((k) => k.slice(0, 9).padStart(10)).join(''));
    for (const r of rows.slice(0, 62)) {
      console.log(`${String(r.i).padStart(5)} ${r.ms.toFixed(1).padStart(7)} ${r.heap.toFixed(2).padStart(9)} ${((r.d >= 0 ? '+' : '') + r.d.toFixed(2)).padStart(7)}  `
        + KEYS.map((k) => (r.m[k] ?? 0).toFixed(1).padStart(10)).join(''));
    }
  } finally {
    await leased.release();
  }
}

await withExclusive('gcwatch', main).catch((e) => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/**
 * What is the phone actually drawing, and who is drawing it?
 *
 *   node src/tools/phonecost.mts
 *   node src/tools/phonecost.mts --dirty
 *   node src/tools/phonecost.mts --at hammerhead,spawn
 *
 * ## Why this exists
 *
 * The device report was **14.6 fps against a 30 fps cap, 68 ms frames, 293 draw
 * calls, 2.77M triangles** at `?q=low` on an iPhone. Every one of those numbers
 * was read off the on-screen stats HUD, and not one of them says *what* the
 * triangles are. Nothing in the harness could answer that either:
 *
 *   - `drawcheck` counts the corpus, which is shot at desktop settings through
 *     `?shoot=1` — a different tier, a different vegetation radius, a different
 *     world. Its budget is a desktop budget.
 *   - `perf` and `gameplay` gate frame time on the same desktop path.
 *   - `bootprof` measures the boot, not the frame.
 *
 * So the phone's frame has never been decomposed, and "make the phone faster"
 * has had nowhere to start. 2.77M triangles is the headline: at 30 fps that is
 * 83M triangles a second on a part that is also filling a 1179x2556 panel, and
 * no amount of tuning helps until you know which system is spending it.
 *
 * ## How the attribution works, and why it is not a scene-graph walk
 *
 * Walking the graph and summing `geometry.index.count` counts triangles that
 * are **in the scene**, which is not what a frame draws: it ignores frustum
 * culling, LOD selection, instancing and the fact that a mesh can be in the
 * scene and never submitted. The first version of this did exactly that and
 * over-reported vegetation by a factor of four.
 *
 * Instead it **ablates**. Render the full frame and read `renderer.info.render`
 * — which `Game.frame` already resets every frame, so it is exactly one frame's
 * submission. Then, for each top-level scene object in turn, hide it, render
 * again, and read the difference. That is the honest cost of that subtree *in
 * this frame from this camera*, culling and all, and it sums to the total by
 * construction rather than by hope.
 *
 * ## Why a real device descriptor
 *
 * `Device.ts` resolves the demo path from three media queries at module
 * evaluation, and the demo path picks the render tier, the vegetation range and
 * density multipliers, and the frame cap. A desktop page with `?demo=1` gets
 * most of that but not the viewport or the device pixel ratio, and the fill
 * cost is a function of both. The descriptor is the only way the numbers mean
 * anything.
 *
 * **What it cannot tell you.** This is a headless software rasteriser on a
 * laptop: wall-clock frame time here is not the handset's. Triangles, draw
 * calls and their attribution are *submission* counts and they transfer
 * exactly; milliseconds do not, and are not printed for that reason.
 */
import { chromium, devices } from 'playwright';
import { buildServer, harnessArgs, announceBuild } from './harness.mts';

const argv = process.argv.slice(2);
const atIx = argv.indexOf('--at');
/** Where to stand. POI ids, or `spawn` for wherever the game starts you. */
const WHERE = (atIx >= 0 ? argv[atIx + 1] : 'spawn,hammerhead').split(',');

const ha = harnessArgs(argv, { q: 'low', play: true });
announceBuild(ha);

const { port } = await buildServer({ build: ha.build, prod: true });
const browser = await chromium.launch();

interface Slice { name: string; calls: number; tris: number }

try {
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro landscape'] });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));

  // No `?demo=1`: the descriptor decides it, which is the thing being measured.
  await page.goto(`http://127.0.0.1:${port}/?continue=1`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(() => window.GAME?.ready === true, undefined, { timeout: 300_000 });
  await page.waitForTimeout(3000);

  const boot = await page.evaluate(async () => {
    const m = await import('/engine/Device.ts');
    return {
      demo: m.demoActive(),
      touch: m.touchActive(),
      tier: m.resolveQualityTier(),
      fps: window.GAME.maxFps,
      veg: m.demoVegRange(),
      dens: m.demoDensity(),
      rs: m.renderScale(),
      dpr: window.devicePixelRatio,
      vp: [window.innerWidth, window.innerHeight],
      systems: window.GAME.systems.length,
    };
  });
  console.log(`\n  build      demo=${boot.demo} touch=${boot.touch} tier=${boot.tier} cap=${boot.fps} fps`);
  console.log(`  viewport   ${boot.vp[0]}x${boot.vp[1]} @ ${boot.dpr}x  ·  renderScale ${boot.rs}`);
  console.log(`  world      veg range ${boot.veg}  density ${boot.dens}  ·  ${boot.systems} systems`);
  if (errors.length) console.log(`  ERRORS     ${errors.slice(0, 2).join(' | ')}`);

  for (const where of WHERE) {
    const at = await page.evaluate(async (id) => {
      if (id !== 'spawn') {
        const wm = await import('/world/map/WorldMap.ts');
        const poi = wm.worldMap.poiById(id);
        if (!poi) return null;
        const p = window.GAME.get('Player');
        const terr = window.GAME.get('Terrain');
        if (p && terr) {
          p.root.position.set(poi.x, terr.heightAt(poi.x, poi.z) + 1, poi.z);
          p.position?.set?.(poi.x, terr.heightAt(poi.x, poi.z) + 1, poi.z);
        }
      }
      // Let the streamers catch up with wherever we just stood.
      await new Promise((r) => setTimeout(r, 4000));
      return id;
    }, where);
    if (!at) { console.log(`\n  ${where}: no such POI, skipped`); continue; }

    /*
     * The ablation. One render for the whole frame, then one per top-level
     * object with that object hidden. `renderer.info` is reset by the render
     * itself, so each read is exactly one frame's submission.
     */
    const cost = await page.evaluate(() => {
      const g = window.GAME;
      const r = g.renderer;
      const draw = () => {
        // **`reset()` first.** `renderer.info` accumulates until something
        // zeroes it, and the only thing that does is `Game.frame`, immediately
        // before post runs. A manual `post.render()` therefore reads the sum of
        // every render since the last real frame — which is why the first
        // version of this reported every ablation as zero: the counts only ever
        // went up, so `full - without` was negative and filtered out. Every
        // slice was silently dropped and the tool printed "everything else".
        r.info.reset();
        // `post.render` is what the game calls; going through it counts the
        // post chain's own draws the way a real frame does.
        g.post.render();
        return { calls: r.info.render.calls, tris: r.info.render.triangles };
      };
      const full = draw();
      const slices: Array<{ name: string, calls: number, tris: number }> = [];
      for (const top of [...g.scene.children]) {
        if (!top.visible) continue;
        top.visible = false;
        const without = draw();
        top.visible = true;
        const calls = full.calls - without.calls;
        const tris = full.tris - without.tris;
        if (calls > 0 || tris > 0) {
          slices.push({ name: top.name || top.type, calls, tris });
        }
      }
      return { full, slices };
    });

    console.log(`\n  ── ${where} ──  ${cost.full.calls} calls, ${(cost.full.tris / 1e6).toFixed(2)}M tris`);
    const rows: Slice[] = cost.slices.sort((a, b) => b.tris - a.tris);
    let namedCalls = 0, namedTris = 0;
    for (const s of rows.slice(0, 12)) {
      namedCalls += s.calls; namedTris += s.tris;
      const pc = cost.full.tris ? (s.tris / cost.full.tris) * 100 : 0;
      console.log(`     ${String(s.calls).padStart(5)} calls  ${(s.tris / 1e6).toFixed(2).padStart(6)}M`
        + `  ${pc.toFixed(1).padStart(5)}%   ${s.name}`);
    }
    const restC = cost.full.calls - namedCalls;
    const restT = cost.full.tris - namedTris;
    if (rows.length > 12 || restC !== 0) {
      console.log(`     ${String(restC).padStart(5)} calls  ${(restT / 1e6).toFixed(2).padStart(6)}M`
        + `         everything else (${Math.max(0, rows.length - 12)} objects)`);
    }
  }

  if (errors.length) console.log(`\n  PAGE ERRORS: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
} finally {
  await browser.close();
}

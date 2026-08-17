#!/usr/bin/env node
/**
 * Cost attribution: measure a shot, then re-measure with one subsystem
 * disabled at a time. The delta is what that subsystem costs.
 *
 *   node tools/attrib.mjs vista_dusk
 */
import { chromium } from 'playwright';
import net from 'node:net';

const PORT = Number(process.env.PORT || 5299);
const SHOT = process.argv[2] || 'vista_dusk';
const N = Number(process.argv[3] || 40);

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});
if (!(await portOpen(PORT))) { console.error(`no server on ${PORT}`); process.exit(1); }

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader',
    '--disable-gpu-vsync', '--disable-frame-rate-limit', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`http://127.0.0.1:${PORT}/?q=ultra&shoot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 180000 });
await page.evaluate(() => { window.GAME.stop(); document.getElementById('boot')?.remove(); });

const out = await page.evaluate(async ([shot, n]) => {
  const g = window.GAME;
  const gl = g.renderer.getContext();
  const p = g.post;

  const measure = () => {
    g.settle(6);
    gl.finish();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) g.frame(1 / 60);
    gl.finish();
    return (performance.now() - t0) / n;
  };

  g.resetClock(); g.applyShot(shot); g.settle(40); g.applyShot(shot); g.settle(8);
  const base = measure();

  const results = [];
  /**
   * A/B/A: re-baseline immediately before each toggle. Measuring `base` once
   * up front makes every delta look enormous, because that first sample also
   * carries one-time costs (shader compiles, clipmap rebuild, probe bake).
   */
  const test = (label, off, on) => {
    const before = measure();
    off();
    const t = measure();
    on();
    const after = measure();
    results.push({ label, ms: (before + after) / 2 - t });
  };

  // --- post passes -----------------------------------------------------
  for (const key of ['gtao', 'ssr', 'taa', 'dof', 'motionBlur', 'bloom', 'grade', 'cas', 'contact']) {
    const pass = p[key];
    if (!pass || pass.enabled === undefined) continue;
    test(`post.${key}`, () => { pass.enabled = false; }, () => { pass.enabled = true; });
  }

  // --- world systems ---------------------------------------------------
  const water = g.get('Water');
  if (water && water.enabled) {
    test('water reflection', () => { water.enabled = false; }, () => { water.enabled = true; });
  }
  const sky = g.get('Sky');
  if (sky && sky.clouds) {
    const m = sky.clouds.mesh || sky.clouds;
    const prev = sky.u?.uCloudMode?.value;
    if (prev !== undefined) {
      test('cloud raymarch', () => { sky.u.uCloudMode.value = 0; }, () => { sky.u.uCloudMode.value = prev; });
    }
  }
  if (sky && sky.csm) {
    test('shadow cascades', () => { g.renderer.shadowMap.enabled = false; },
      () => { g.renderer.shadowMap.enabled = true; });
  }
  const wx = g.get('Weather');
  if (wx && wx.volume) {
    test('weather volume', () => { wx.volume.enabled = false; }, () => { wx.volume.enabled = true; });
  }

  // --- scene content ---------------------------------------------------
  const hide = (sys, prop) => {
    const s = g.get(sys); const root = s && (s[prop] || s.root || s.group);
    if (!root || root.visible === undefined) return null;
    return root;
  };
  for (const [label, sys, prop] of [
    ['vegetation grass', 'Vegetation', 'grass'], ['terrain', 'Terrain', 'clipmap'],
    ['props', 'Props', 'root'], ['characters', 'Party', 'root'],
  ]) {
    const s = g.get(sys);
    if (!s) continue;
    let roots = [];
    if (sys === 'Vegetation') roots = [s.grass?.group, s.bushes?.group, s.trees?.group].filter(Boolean);
    else if (sys === 'Terrain') roots = [s.clipmap?.group].filter(Boolean);
    else if (sys === 'Props') roots = g.scene.children.filter((c) => /rock|landmark|prop|regalia|road|outpost|mega|wild|debris/i.test(c.name || ''));
    else if (sys === 'Party') roots = [g.get('Player')?.root, ...(s.members || []).map((m) => m.root)].filter(Boolean);
    if (!roots.length) continue;
    test(label, () => roots.forEach((r) => { r.visible = false; }),
      () => roots.forEach((r) => { r.visible = true; }));
  }

  results.sort((a, b) => b.ms - a.ms);
  return { base, results, draws: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
}, [SHOT, N]);

console.log(`\n${SHOT}: ${out.base.toFixed(2)} ms/frame = ${(1000 / out.base).toFixed(1)} fps`);
console.log(`${out.draws} draws, ${(out.tris / 1e6).toFixed(2)}M tris\n`);
console.log('subsystem                 cost ms    % of frame');
console.log('-'.repeat(50));
for (const r of out.results) {
  if (Math.abs(r.ms) < 0.05) continue;
  console.log(`${r.label.padEnd(24)} ${r.ms.toFixed(2).padStart(8)} ${((r.ms / out.base) * 100).toFixed(1).padStart(10)}%`);
}
await browser.close();

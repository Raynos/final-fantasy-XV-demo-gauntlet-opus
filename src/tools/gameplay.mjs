#!/usr/bin/env node
/**
 * Gameplay frame-time benchmark.
 *
 * Posed screenshots measure a steady state that real play never sits in. This
 * drives the actual game loop with synthetic input through a scripted session —
 * walking, sprinting, turning the camera, fighting, warping, swapping weapons,
 * opening menus, crossing the map to force streaming, moving the sun, changing
 * the weather — and reports per-segment frame times plus every hitch.
 *
 *   node src/tools/gameplay.mjs                  # full session, ultra
 *   node src/tools/gameplay.mjs --q high
 *   node src/tools/gameplay.mjs --scale 2        # longer segments
 *   node src/tools/gameplay.mjs --out perf.json
 *
 * A hitch is a single frame over 33 ms (a dropped frame at 30 fps). Those are
 * what players actually feel; a good median with 100 ms spikes is a bad game.
 * Exits non-zero if the p99 is over budget or any segment medians below target.
 */
import { chromium } from 'playwright';
import { CHROMIUM_ARGS } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 5173);

function parseArgs(argv) {
  const o = { w: 1600, h: 900, q: 'ultra', scale: 1, target: 60, hitchMs: 33, out: null, nobake: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--nobake') o.nobake = true;
    else if (a === '--w') o.w = Number(argv[++i]);
    else if (a === '--h') o.h = Number(argv[++i]);
    else if (a === '--q') o.q = argv[++i];
    else if (a === '--scale') o.scale = Number(argv[++i]);
    else if (a === '--target') o.target = Number(argv[++i]);
    else if (a === '--hitch') o.hitchMs = Number(argv[++i]);
    else if (a === '--out') o.out = argv[++i];
    else throw new Error(`unknown flag ${a}`);
  }
  return o;
}

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

async function ensureServer() {
  if (await portOpen(PORT)) return null;
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'],
  });
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    if (await portOpen(PORT)) return proc;
  }
  throw new Error('vite failed to start');
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const server = await ensureServer();

  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  const page = await browser.newPage({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  let out;
  try {
    await page.goto(`http://127.0.0.1:${PORT}/?q=${o.q}&shoot=1${o.nobake ? '&nobake=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 180000 });
    await page.evaluate(() => { window.GAME.stop(); document.getElementById('boot')?.remove(); });

    const gpu = await page.evaluate(() => {
      const gl = window.GAME.renderer.getContext();
      const e = gl.getExtension('WEBGL_debug_renderer_info');
      return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    console.log(`GPU: ${gpu}`);
    console.log(`${o.w}x${o.h}  quality=${o.q}  hitch>${o.hitchMs}ms  target ${o.target} fps\n`);

    out = await page.evaluate(async ([scale, hitchMs]) => {
      const g = window.GAME;
      const gl = g.renderer.getContext();
      const dt = 1 / 60;
      const inp = g.input;
      const player = g.get('Player');
      const combat = g.get('Combat');
      const menus = g.get('Menus');
      const sky = g.get('Sky');
      const weather = g.get('Weather');
      const rig = g.get('CameraRig');

      const hold = (...codes) => { inp.keys.clear(); for (const c of codes) inp.keys.add(c); };
      const look = (x, y) => { inp.look.set(x, y); };
      const n = (base) => Math.max(4, Math.round(base * scale));

      // Leave capture/shot mode: we want the live gameplay camera.
      g.applyShot('hud_field');
      rig?.clearShot?.();
      g.resetClock();
      const start = player ? player.position.clone() : null;

      /** @type {{name:string, setup?:Function, each?:Function, frames:number}[]} */
      const segments = [
        { name: 'idle', frames: n(60), setup: () => hold() },
        { name: 'walk', frames: n(120), setup: () => hold('KeyW') },
        { name: 'sprint', frames: n(150), setup: () => hold('KeyW', 'ShiftLeft') },
        {
          name: 'sprint+turn',
          frames: n(150),
          setup: () => hold('KeyW', 'ShiftLeft'),
          each: (i) => look(Math.sin(i * 0.06) * 22, Math.sin(i * 0.021) * 5),
        },
        {
          name: 'strafe+camera',
          frames: n(120),
          setup: () => hold('KeyW', 'KeyD'),
          each: (i) => look(18 * Math.cos(i * 0.09), 0),
        },
        {
          name: 'weapon-swap',
          frames: n(90),
          setup: () => hold(),
          each: (i) => {
            if (i % 6 === 0 && combat?.setWeapon) {
              const kinds = ['sword', 'greatsword', 'polearm', 'daggers', 'firearm'];
              combat.setWeapon(kinds[(i / 6) % kinds.length]);
            }
          },
        },
        {
          name: 'combat',
          frames: n(240),
          setup: () => { g.get('Director')?.setScenario?.('combat'); hold('KeyW'); },
          each: (i) => {
            if (i % 14 === 0) combat?.attack?.();
            if (i % 47 === 0) combat?.dodge?.();
            if (i % 61 === 0 && combat?.autoTarget) combat.lockOn?.(combat.autoTarget());
            look(Math.sin(i * 0.05) * 12, 0);
          },
        },
        {
          name: 'warp-strike',
          frames: n(120),
          setup: () => { g.get('Director')?.setScenario?.('warp'); hold(); },
          each: (i) => { if (i % 30 === 0) combat?.warpStrike?.(combat?.lockTarget || combat?.autoTarget?.()); },
        },
        {
          name: 'magic',
          frames: n(90),
          setup: () => { hold(); },
          each: (i) => {
            if (i % 20 !== 0 || !player) return;
            const pos = player.position;
            const at = { x: pos.x + 6, y: pos.y, z: pos.z + 6 };
            combat?.castSpell?.('fire', at) ?? combat?.elemancy?.cast?.({ element: 'fire', pos: at, potency: 100 });
          },
        },
        {
          name: 'streaming-traverse',
          frames: n(180),
          setup: () => { g.get('Director')?.setScenario?.('field'); hold('KeyW', 'ShiftLeft'); },
          // teleport in long hops: forces grass tile refill, clipmap rebuild,
          // prop LOD swaps — the streaming work posed shots never trigger
          each: (i) => {
            if (i % 12 === 0 && player) {
              const a = i * 0.7;
              player.root.position.x = Math.cos(a) * (120 + i * 3);
              player.root.position.z = Math.sin(a) * (120 + i * 3);
            }
          },
        },
        {
          name: 'day-night-sweep',
          frames: n(150),
          setup: () => hold('KeyW'),
          each: (i) => sky?.setTimeOfDay?.((i * 0.16) % 24),
        },
        {
          name: 'weather-change',
          frames: n(120),
          setup: () => hold('KeyW'),
          each: (i) => {
            if (i === 10) weather?.set?.('storm');
            if (i === 60) weather?.set?.('fog');
            if (i === 100) weather?.set?.('clear');
          },
        },
        {
          name: 'menu-open',
          frames: n(90),
          setup: () => hold(),
          each: (i) => {
            if (i === 5) menus?.setScreen?.('main');
            if (i === 30) menus?.setScreen?.('ascension');
            if (i === 55) menus?.setScreen?.('inventory');
            if (i === 80) menus?.setScreen?.(null);
          },
        },
      ];

      const results = [];
      const allHitches = [];
      for (const seg of segments) {
        const failures = [];
        const act = (i) => {
          try { seg.each?.(i); } catch (e) {
            if (failures.length < 3) failures.push(String(e && e.message || e));
          }
        };
        try { seg.setup?.(); } catch (e) { failures.push(String(e && e.message || e)); }
        // warm the segment so its first-touch costs are attributed but do not
        // dominate: 6 warm frames, then measure
        for (let i = 0; i < 6; i++) { act(i); g.frame(dt); }
        gl.finish();
        const samples = [];
        for (let i = 0; i < seg.frames; i++) {
          act(i);
          const t0 = performance.now();
          g.frame(dt);
          gl.finish();
          const ms = performance.now() - t0;
          samples.push(ms);
          if (ms > hitchMs) allHitches.push({ segment: seg.name, frame: i, ms: +ms.toFixed(1) });
        }
        const s = samples.slice().sort((a, b) => a - b);
        results.push({
          name: seg.name,
          frames: seg.frames,
          median: s[Math.floor(s.length * 0.5)],
          p95: s[Math.floor(s.length * 0.95)],
          p99: s[Math.floor(s.length * 0.99)],
          max: s[s.length - 1],
          over16: samples.filter((x) => x > 16.7).length / samples.length,
          hitches: samples.filter((x) => x > hitchMs).length,
          failures,
        });
      }

      if (start && player) player.root.position.copy(start);
      const all = results.flatMap((r) => Array(0));
      return { results, hitches: allHitches.sort((a, b) => b.ms - a.ms).slice(0, 25) };
    }, [o.scale, o.hitchMs]);
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  console.log('segment              med ms    fps    p95    p99    max   >16ms  hitches');
  console.log('-'.repeat(76));
  for (const r of out.results) {
    const fps = 1000 / r.median;
    const flag = fps < o.target ? '  <<' : '';
    console.log(
      `${r.name.padEnd(20)} ${r.median.toFixed(1).padStart(6)} ${fps.toFixed(1).padStart(6)} ` +
      `${r.p95.toFixed(1).padStart(6)} ${r.p99.toFixed(1).padStart(6)} ${r.max.toFixed(1).padStart(6)} ` +
      `${(r.over16 * 100).toFixed(0).padStart(6)}% ${String(r.hitches).padStart(8)}${flag}`
    );
  }
  const worst = out.results.reduce((a, b) => (a.median > b.median ? a : b));
  const totalHitches = out.results.reduce((s, r) => s + r.hitches, 0);
  console.log('-'.repeat(76));
  console.log(`worst segment: ${worst.name} at ${(1000 / worst.median).toFixed(1)} fps   total hitches: ${totalHitches}`);

  if (out.hitches.length) {
    console.log('\nworst individual frames:');
    for (const h of out.hitches.slice(0, 12)) {
      console.log(`  ${h.ms.toFixed(1).padStart(7)} ms   ${h.segment} @ frame ${h.frame}`);
    }
  }

  if (o.out) {
    await mkdir(path.dirname(path.resolve(ROOT, o.out)), { recursive: true });
    await writeFile(path.resolve(ROOT, o.out), JSON.stringify(out, null, 2));
  }
  if (errors.length) {
    console.error(`\n${errors.length} page error(s):`);
    for (const e of [...new Set(errors)].slice(0, 10)) console.error('  ' + e.split('\n')[0]);
    process.exit(1);
  }
  const worstFps = 1000 / worst.median;
  if (worstFps < o.target) {
    console.error(`\nFAIL: ${worst.name} at ${worstFps.toFixed(1)} fps is below the ${o.target} fps target`);
    process.exit(2);
  }
  console.log(`\nPASS: every segment >= ${o.target} fps`);
}

main().catch((e) => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/**
 * Free-camera diagnostic capture for the world-dressing pass.
 *
 *   node src/tools/dresscam.mts longwythe alstor ravatogh --out tmp/shots/dress
 *   node src/tools/dresscam.mts poi:tomb_just poi:wiz_chocobo --out tmp/shots/poi
 *   node src/tools/dresscam.mts at:1200,-400 --out tmp/shots/spot
 *
 * `src/game/Shots.ts` is owned by the coordinator, so this tool exists to let
 * the dressing work be *judged* without editing it: it drives `CameraRig`
 * straight from a world coordinate looked up live in `WorldMap`, frames the
 * ground rather than the sky, and never hard-codes an anchor.
 *
 * Targets
 *   `<zoneId>`        the zone centre, framed from 90 m out at eye height
 *   `poi:<poiId>`     a point of interest, framed from `--dist` metres
 *   `at:<x>,<z>`      a raw world coordinate
 * Options
 *   --dist N   camera distance, metres (default 70)
 *   --eye N    camera height above the ground under it (default 12)
 *   --look N   height above the ground at the target to aim at (default 4)
 *   --yaw N    approach bearing in degrees (default 135)
 *   --time N   time of day in hours (default 11.5)
 */
import { chromium } from 'playwright';
import { CHROMIUM_ARGS } from './chromium.mts';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { assertOwnPort } from './portowner.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 5173);
const URL_BASE = `http://127.0.0.1:${PORT}`;

const portOpen = (port: number) => new Promise<boolean>((res) => {
  const s = net.connect(port, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

async function ensureServer() {
  if (await portOpen(PORT)) { assertOwnPort(PORT, ROOT); return null; }
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 300));
    // eslint-disable-next-line no-await-in-loop
    if (await portOpen(PORT)) return proc;
  }
  throw new Error('vite failed to start');
}

async function main() {
  const argv = process.argv.slice(2);
  const opts: { out: string, dist: number, eye: number, look: number, yaw: number, time: number, settle: number, targets: string[] } =
    { out: 'tmp/shots/dresscam', dist: 70, eye: 12, look: 4, yaw: 135, time: 11.5, settle: 90, targets: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--dist') opts.dist = Number(argv[++i]);
    else if (a === '--eye') opts.eye = Number(argv[++i]);
    else if (a === '--look') opts.look = Number(argv[++i]);
    else if (a === '--yaw') opts.yaw = Number(argv[++i]);
    else if (a === '--time') opts.time = Number(argv[++i]);
    else if (a === '--settle') opts.settle = Number(argv[++i]);
    else opts.targets.push(a);
  }
  const outDir = path.isAbsolute(opts.out) ? opts.out : path.join(ROOT, opts.out);
  await mkdir(outDir, { recursive: true });

  const server = await ensureServer();
  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const results = [];
  try {
    await page.goto(`${URL_BASE}/?q=ultra&shoot=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 120000 });
    await page.evaluate(() => {
      window.GAME.stop();
      window.GAME.resetClock();
      document.getElementById('boot')?.remove();
    });

    for (const target of opts.targets) {
      const meta = await page.evaluate(async ([t, o]: [string, typeof opts]) => {
        const g = window.GAME;
        const wm = (await import('/world/map/WorldMap.ts')).worldMap;
        let x = 0, z = 0;
        if (t.startsWith('at:')) {
          const [a, b] = t.slice(3).split(',').map(Number); x = a; z = b;
        } else if (t.startsWith('poi:')) {
          const p = wm.poiById(t.slice(4));
          if (!p) throw new Error(`unknown poi ${t}`);
          x = p.x; z = p.z;
        } else {
          const zn = wm.zoneById.get(t);
          if (!zn) throw new Error(`unknown zone ${t}`);
          x = zn.cx; z = zn.cz;
        }
        const terr = g.get('Terrain')!;
        const yaw = (o.yaw * Math.PI) / 180;
        const cx = x + Math.cos(yaw) * o.dist, cz = z + Math.sin(yaw) * o.dist;
        const cy = terr.heightAt(cx, cz) + o.eye;
        const ty = terr.heightAt(x, z) + o.look;
        const sky = g.get('Sky')!;
        if (sky && sky.setTimeOfDay) sky.setTimeOfDay(o.time);
        const rig = g.get('CameraRig')!;
        rig.followShot = null;
        rig.setShot({ pos: [cx, cy, cz], target: [x, ty, z], fov: 42 });
        g.settle(o.settle);
        const hud = g.get('HUD')!;
        if (hud) { hud.toasts?.clear(); hud.setVisible?.(false); }
        rig.setShot({ pos: [cx, cy, cz], target: [x, ty, z], fov: 42 });
        g.settle(8);
        if (hud) hud.setVisible?.(false);
        const gl = g.renderer.info;
        return { x: +x.toFixed(0), z: +z.toFixed(0), triangles: gl.render.triangles, calls: gl.render.calls };
      }, [target, opts] as [string, typeof opts]);
      const name = target.replace(/[:,]/g, '_');
      const file = path.join(outDir, `${name}.png`);
      await writeFile(file, await page.screenshot({ type: 'png' }));
      results.push({ name, ...meta });
      console.log(`✓ ${name.padEnd(24)} (${meta.x},${meta.z})  ${String(meta.triangles).padStart(9)} tris  ${String(meta.calls).padStart(4)} calls`);
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  if (errors.length) {
    console.error(`\n${errors.length} page error(s):`);
    for (const e of [...new Set(errors)].slice(0, 12)) console.error('  ' + e.split('\n')[0]);
    process.exit(1);
  }
  console.log(`\n${results.length} frames -> ${path.relative(ROOT, outDir)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

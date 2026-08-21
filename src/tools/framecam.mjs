#!/usr/bin/env node
/**
 * Candidate-framing probe for the shot-corpus repair pass.
 *
 *   node src/tools/framecam.mjs candidates.json --out tmp/shots/probe
 *   node src/tools/framecam.mjs candidates.json --out tmp/shots/probe --probe probe.mjs
 *
 * `src/tools/shoot.mjs` can only capture shots that already exist in
 * `src/game/Shots.ts`, and every edit to that file invalidates the capture
 * daemon's warm page — so iterating a framing costs a full boot per attempt.
 * This tool boots the game **once** and then applies an arbitrary list of shot
 * *objects* (exactly the shape `Game.applyShot` consumes) by injecting them
 * into the live `SHOTS` map, so twenty candidate framings cost twenty frames.
 *
 * It also answers the other half of the problem — *where is the subject?* —
 * with `--probe FILE`, a module whose default export is a function evaluated in
 * the page after boot. Use it to read live positions out of `WorldMap`,
 * `Terrain`, `Party` or `Director` instead of trusting the coordinates written
 * in a comment three world-reshapes ago.
 *
 * The candidate file is JSON: an array of shot objects each carrying a `name`.
 * Anything `applyShot` understands works — `pos`/`target`/`fov`, `follow` +
 * `offset`/`lookOffset`, `time`, `weather`, `scenario`, `dungeon`, `story`,
 * `hud`, `menu`.
 */
import { chromium } from 'playwright';
import { CHROMIUM_ARGS } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 5173);

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
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    if (await portOpen(PORT)) return proc;
  }
  throw new Error('vite failed to start');
}

async function main() {
  const argv = process.argv.slice(2);
  const opts = { out: 'tmp/shots/probe', settle: 60, file: null, probe: null, w: 1600, h: 900 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--settle') opts.settle = Number(argv[++i]);
    else if (a === '--probe') opts.probe = argv[++i];
    else if (a === '--w') opts.w = Number(argv[++i]);
    else if (a === '--h') opts.h = Number(argv[++i]);
    else opts.file = a;
  }

  const specs = opts.file
    ? JSON.parse(await readFile(path.resolve(opts.file), 'utf8'))
    : [];
  const outDir = path.isAbsolute(opts.out) ? opts.out : path.join(ROOT, opts.out);
  await mkdir(outDir, { recursive: true });

  const server = await ensureServer();
  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  const page = await browser.newPage({
    viewport: { width: opts.w, height: opts.h }, deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/?q=ultra&shoot=1`, {
      waitUntil: 'domcontentloaded', timeout: 300000,
    });
    await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 300000 });
    await page.evaluate(() => {
      window.GAME.stop();
      window.GAME.resetClock();
      document.getElementById('boot')?.remove();
    });

    if (opts.probe) {
      const src = await readFile(path.resolve(opts.probe), 'utf8');
      const value = await page.evaluate(
        new Function(`return (async () => { ${src} })()`)
      );
      console.log(JSON.stringify(value, null, 1));
      // A probe that has measured the world may hand back the framings it
      // derived; shooting them in the same boot closes the derive→look loop.
      if (value && Array.isArray(value.specs)) specs.push(...value.specs);
    }

    const resolved = [];
    for (const spec of specs) {
      const meta = await page.evaluate(async ([s, settle]) => {
        const g = window.GAME;
        const { SHOTS } = await import('/game/Shots.ts');
        // Terrain-relative recipe: `camAt`/`aimAt` are plan coordinates and
        // `eye`/`aimUp` are heights *above the ground there*, resolved against
        // the live heightfield. Written this way a camera can never end up
        // buried in a hill that grew under it, which is how half of the corpus
        // came to render black or to aim at a dirt face.
        if (s.camAt) {
          const terr = g.get('Terrain');
          const cy = terr.heightAt(s.camAt[0], s.camAt[1]) + (s.eye ?? 12);
          const ay = terr.heightAt(s.aimAt[0], s.aimAt[1]) + (s.aimUp ?? 4);
          s.pos = [s.camAt[0], +cy.toFixed(1), s.camAt[1]];
          s.target = [s.aimAt[0], +ay.toFixed(1), s.aimAt[1]];
        }
        SHOTS.__probe = s;
        g.applyShot('__probe');
        g.settle(settle);
        g.applyShot('__probe');
        g.settle(8);
        const gl = g.renderer.info;
        return { triangles: gl.render.triangles, calls: gl.render.calls, pos: s.pos, target: s.target };
      }, [spec, opts.settle]);
      const file = path.join(outDir, `${spec.name}.png`);
      await writeFile(file, await page.screenshot({ type: 'png' }));
      resolved.push({ name: spec.name, pos: meta.pos, target: meta.target, fov: spec.fov });
      console.log(`✓ ${spec.name.padEnd(30)} pos ${JSON.stringify(meta.pos)} target ${JSON.stringify(meta.target)} fov ${spec.fov}`);
    }
    if (resolved.length) await writeFile(path.join(outDir, '_resolved.json'), JSON.stringify(resolved, null, 1));
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  if (errors.length) {
    console.error(`\n${errors.length} page error(s):`);
    for (const e of [...new Set(errors)].slice(0, 12)) console.error('  ' + e.split('\n')[0]);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

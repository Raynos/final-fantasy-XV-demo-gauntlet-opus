#!/usr/bin/env node
/**
 * Ad-hoc framing harness for the world-map workstream.
 *
 *   node src/tools/mapshoot.mts src/tools/mapshots.json --out tmp/shots/map-r1
 *
 * `src/tools/shoot.mts` can only render shots that already exist in `Shots.ts`,
 * which is owned by another agent. This drives the camera rig directly from a
 * JSON list so new framings can be composed against the new world and handed
 * over as coordinates once they work.
 *
 * Each entry: { name, pos:[x,y,z], target:[x,y,z], fov, time, weather }
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { harnessArgs, announceBuild, lease, pageOpts } from './harness.mts';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');



async function main() {
  const ha = harnessArgs(process.argv.slice(2));
  announceBuild(ha);
  const argv = process.argv.slice(2);
  let out = 'tmp/shots/map', file = 'src/tools/mapshots.json', settle = 60;
  const only: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--settle') settle = Number(argv[++i]);
    else if (argv[i] === '--only') only.push(argv[++i]);
    else file = argv[i];
  }
  let shots = JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
  if (only.length) shots = shots.filter((s: { name: string }) => only.includes(s.name));
  const outDir = path.join(ROOT, out);
  await mkdir(outDir, { recursive: true });

  const leased = await lease(pageOpts(ha));
  const page = leased.page;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (process.env.VERBOSE) console.log(`[page:${m.type()}]`, m.text());
  });

  try {

    // Mount the world-map UI, which is not wired into Game.ts yet: this
    // harness is how it gets looked at before the registration lines are
    // handed over.
    await page.evaluate(async () => {
      const g = window.GAME;
      const { Minimap } = await import('/ui/Minimap.ts');
      const mm = new Minimap();
      await mm.init(g);
      g.add(mm, 'Minimap');
      window.__mm = mm;

      const { WorldMapScreen } = await import('/ui/screens/WorldMapScreen.ts');
      const host = document.createElement('div');
      host.className = 'screen s-world';
      host.style.cssText = 'position:absolute;inset:0;display:none;z-index:4;'
        + 'font-family:var(--ui-font);color:var(--ink)';
      g.uiRoot.appendChild(host);
      const fakeMenus = { setScreen() {} };
      const ws = new WorldMapScreen(fakeMenus);
      ws.build(host, g);
      window.__ws = { screen: ws, host };
    });

    for (const s of shots) {
      const t0 = Date.now();
      const meta = await page.evaluate(([sh, st]) => {
        const g = window.GAME;
        const mm = window.__mm, ws = window.__ws;
        if (mm) mm.setVisible(!!sh.minimap);
        if (ws) {
          ws.host.style.display = sh.worldmap ? '' : 'none';
          if (sh.worldmap) {
            ws.screen.enter(g);
            if (sh.wmFilter) for (let i = 0; i < sh.wmFilter; i++) ws.screen.nav(0, 1);
            if (sh.wmZoom != null) ws.screen.zoomI = sh.wmZoom;
            if (sh.revealAll && mm) mm.fog.revealAll();
            if (sh.discoverAll) { const map = g.get('Terrain')!.map; for (const p of map.pois) map.discover(p.id); }
            if (sh.wmSel != null) { ws.screen._rebuildList(); ws.screen.sel = sh.wmSel;
              const t = ws.screen.list[sh.wmSel]; if (t) { ws.screen.camT.x = t.x; ws.screen.camT.z = t.z;
                ws.screen.cam.x = t.x; ws.screen.cam.z = t.z; } }
            for (let i = 0; i < 40; i++) ws.screen.update(1 / 60, g, 1);
          }
        }
        const sky = g.get('Sky')!;
        if (sh.time != null && sky) sky.setTimeOfDay(sh.time);
        const weather = g.get('Weather')!;
        if (sh.weather && weather) weather.set(sh.weather);
        const hud = g.get('HUD')!;
        if (hud) hud.setVisible(!!sh.hud);
        const menus = g.get('Menus')!;
        if (menus) menus.setScreen(sh.menu || null);
        const rig = g.get('CameraRig')!;
        rig.setShot({ pos: sh.pos, target: sh.target, fov: sh.fov || 45 });
        g.settle(st);
        rig.setShot({ pos: sh.pos, target: sh.target, fov: sh.fov || 45 });
        g.settle(8);
        const t = g.get('Terrain')!;
        return {
          tris: g.renderer.info.render.triangles,
          calls: g.renderer.info.render.calls,
          groundAtCam: t ? +t.heightAt(sh.pos[0], sh.pos[2]).toFixed(1) : null,
          groundAtTgt: t ? +t.heightAt(sh.target[0], sh.target[2]).toFixed(1) : null,
        };
      }, [s, settle]);
      const buf = await page.screenshot({ type: 'png' });
      await writeFile(path.join(outDir, `${s.name}.png`), buf);
      console.log(`✓ ${s.name.padEnd(20)} ${String(meta.tris).padStart(9)} tris ${String(meta.calls).padStart(4)} calls`
        + `  ground cam ${String(meta.groundAtCam).padStart(7)} / tgt ${String(meta.groundAtTgt).padStart(7)}`
        + `  ${Date.now() - t0}ms`);
    }
  } finally {
    await leased.release();
  }
  if (errors.length) {
    console.error(`\n${errors.length} page error(s):`);
    for (const e of [...new Set(errors)].slice(0, 15)) console.error('  ' + e.split('\n')[0]);
    process.exit(1);
  }
  console.log(`\n${shots.length} shots -> ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

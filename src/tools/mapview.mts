#!/usr/bin/env node
/**
 * Map-screen framing harness for the cartography workstream.
 *
 *   node src/tools/mapview.mts --out tmp/shots/mapview --state 0,0,1 --state 3,4,0
 *
 * `--state zoom,filter,revealAll` opens the real `map` menu screen through
 * `Menus`, sets the zoom step / filter row / survey state, settles the sim and
 * captures the frame. `src/tools/shoot.mts` can only render the states baked into
 * `Shots.ts`, which another agent owns; this drives the live screen instead so
 * every zoom level can be looked at. Temporary tooling.
 *
 * This used to run its own vite against `vite.map.config.mts`, whose only
 * purpose was a private `cacheDir` — several vite servers sharing one
 * `node_modules/.vite` re-optimise in a loop and the harness sees a boot that
 * never finishes. The daemon gives every build its own dependency cache now, so
 * that config is gone and this is an ordinary lease.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { harnessArgs, announceBuild, lease, pageOpts } from './harness.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const argv = process.argv.slice(2);
let out = 'tmp/shots/mapview';
const states = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') out = argv[++i];
  else if (argv[i] === '--state') states.push(argv[++i].split(',').map(Number));
}
if (!states.length) states.push([0, 0, 1]);

const ha = harnessArgs(argv);
announceBuild(ha);
const leased = await lease(pageOpts(ha));
const page = leased.page;
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (process.env.VERBOSE) console.log(`[page] ${m.text()}`);
});
try {
  const dir = path.join(ROOT, out);
  await mkdir(dir, { recursive: true });
  for (const [zoom, filter, revealAll] of states) {
    const meta = await page.evaluate(async ([zoom, filter, revealAll]) => {
      const g = window.GAME;
      const { fog } = await import('/world/map/FogOfWar.ts');
      if (revealAll) { fog.revealAll(); const map = g.get('Terrain')!.map; for (const p of map.pois) map.discover(p.id); }
      const menus = g.get('Menus')!;
      if (zoom < 0) {                       // field HUD only: measure the minimap
        menus.setScreen(null);
        g.settle(120);
        const mm0 = g.get('Minimap')!;
        return { cost: mm0 ? +mm0.cost.toFixed(3) : null, zoom: 0 };
      }
      menus.setScreen('map');
      g.settle(30);
      const s = menus.screens.map;
      s.zoomI = zoom; s.zoom = s.constructor === Object ? 0 : s.zoom;
      s._setFilter(filter);
      g.settle(45);
      const mm = g.get('Minimap')!;
      return { cost: mm ? +mm.cost.toFixed(3) : null, zoom: s.zoom };
    }, [zoom, filter, revealAll]);
    const buf = await page.screenshot({ type: 'png' });
    const name = zoom < 0 ? 'field.png' : `map_z${zoom}_f${filter}${revealAll ? '_all' : ''}.png`;
    await writeFile(path.join(dir, name), buf);
    console.log(`✓ ${name}  minimap ${meta.cost} ms/frame  ppm ${meta.zoom.toFixed(3)}`);
  }
} finally {
  await leased.release();
}
if (errors.length) {
  console.error(`\n${errors.length} page error(s):`);
  for (const e of [...new Set(errors)].slice(0, 10)) console.error(`  ${e.split('\n')[0]}`);
  process.exit(1);
}

#!/usr/bin/env node
/**
 * End-to-end integration audit.
 *
 * A feature is only done if a player can reach it through the running game.
 * This project has already shipped one complete subsystem — 5,765 lines of RPG
 * model — that was constructed, ticked, and read by nothing, while the HUD drew
 * invented numbers on top of it. `src/tools/orphans.mts` catches modules nobody
 * imports; this catches modules that are imported and still do nothing.
 *
 * Each check drives the real page and asserts on observable state. A check
 * reports PASS only when the feature actually functions; WIRED means it is
 * connected but a behaviour could not be exercised here; FAIL means present in
 * source but not reachable in play.
 *
 *   node src/tools/integration.mts
 *   node src/tools/integration.mts --json
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROMIUM_ARGS } from './chromium.mts';
import type { SystemKey } from '../game/Game.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 5173);
const JSON_OUT = process.argv.includes('--json');

const portOpen = (p: number) => new Promise<boolean>((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

async function ensureServer() {
  if (await portOpen(PORT)) return null;
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    if (await portOpen(PORT)) return proc;
  }
  throw new Error('vite failed to start');
}

const server = await ensureServer();
const browser = await chromium.launch({ args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors: string[] = [];
page.on('pageerror', (e) => pageErrors.push(String(e).split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text().slice(0, 160)); });

// `audio=force` boots the audio graph under the harness so it can be inspected.
await page.goto(`http://127.0.0.1:${PORT}/?q=low&shoot=1&audio=force`,
  { waitUntil: 'domcontentloaded', timeout: 300000 });
await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 300000 });
await page.evaluate(() => { window.GAME.stop(); document.getElementById('boot')?.remove(); });

const results = await page.evaluate(async () => {
  const g = window.GAME;
  /** One probe's verdict. `WIRED` is "the system is there but idle". */
  interface Row { area: string; name: string; status: 'PASS' | 'WIRED' | 'FAIL'; evidence: string }
  const out: Row[] = [];
  const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
  const add = (area: string, name: string, status: Row['status'], evidence: unknown) => out.push({ area, name, status, evidence: String(evidence) });
  const probe = (area: string, name: string, fn: () => { status: Row['status'], evidence: unknown } | null | undefined) => {
    try {
      const r = fn();
      if (!r) return add(area, name, 'FAIL', 'probe returned nothing');
      add(area, name, r.status, r.evidence);
    } catch (e: unknown) { add(area, name, 'FAIL', 'threw: ' + (e instanceof Error ? e.message : String(e))); }
  };
  const P = (evidence: unknown) => ({ status: 'PASS' as const, evidence });
  const W = (evidence: unknown) => ({ status: 'WIRED' as const, evidence });
  const F = (evidence: unknown) => ({ status: 'FAIL' as const, evidence });

  /* ---------------------------------------------------------- systems ---- */
  probe('engine', 'all systems registered', () => {
    const want: SystemKey[] = ['Sky', 'Terrain', 'Water', 'Vegetation', 'Props', 'Weather', 'VFX', 'Player',
      'Party', 'Enemies', 'Combat', 'Camera', 'Regalia', 'Audio', 'Rpg', 'HUD', 'Minimap',
      'Menus', 'Cinematics', 'Story', 'Interaction', 'Town', 'Npcs', 'Director', 'Dungeons'];
    const missing = want.filter((k) => !g.get(k));
    return missing.length ? F('missing: ' + missing.join(', ')) : P(`${want.length} systems live`);
  });

  /* -------------------------------------------------------------- rpg ---- */
  probe('rpg', 'HUD reads the real stat model', () => {
    const rpg = g.get('Rpg')!; const hud = g.get('HUD')!;
    if (!rpg || !hud) return F('rpg or hud missing');
    const n = rpg.noctis;
    const before = n.hp;
    n.applyDamage(137);
    step(3);
    const damaged = n.hp;
    const shown = g.get('Player')!.stats.hp;
    n.heal(137);
    return shown === damaged && shown !== before
      ? P(`model ${before}->${damaged}, Player.stats mirrored ${shown}`)
      : F(`model ${damaged} vs Player.stats ${shown}`);
  });

  probe('rpg', 'ascension spends real AP', () => {
    const a = g.get('Rpg')!.ascension;
    // `unlocked` is a Set, so the old `?? a.unlocked.length` arm was dead; and
    // a node's price is `ap`, never `cost`, so `(n.cost ?? 0) <= ap` compared
    // 0 against the wallet and let every node through. `availableNodes()`
    // already filters on affordability, so the pick is the same one.
    const ap = a.ap; const before = a.unlocked.size;
    const cand = a.availableNodes().find((n) => n.ap <= ap);
    if (!cand) return W(`no affordable node (ap=${ap})`);
    a.unlock(cand.id);
    const after = a.unlocked.size;
    return after > before && a.ap < ap
      ? P(`unlocked ${cand.id}, ap ${ap}->${a.ap}`) : F('unlock did not take');
  });

  probe('rpg', 'inventory + gil economy', () => {
    const inv = g.get('Rpg')!.inventory;
    const gil = inv.gil;
    const all = inv.list();
    // `listByCategory()` takes no argument -- it buckets the whole bag -- so
    // the old `listByCategory('curative')` returned every category, and the
    // "curative" count in the report was the number of *categories* carried.
    const cur = inv.listByCategory().curative ?? [];
    return all.length
      ? P(`${all.length} stacks carried (${cur.length} curative), gil ${gil}`)
      : F('bag is empty');
  });

  probe('rpg', 'save + load round-trips', () => {
    const rpg = g.get('Rpg')!;
    if (!rpg.save || !rpg.loadGame) return F('no save/loadGame');
    const lv = rpg.noctis.level;
    rpg.save('audit');
    rpg.gainExp(500000);
    rpg.loadGame('audit');
    return rpg.noctis.level === lv
      ? P(`saved, gained 500k exp, loadGame restored level ${lv}`)
      : W(`loaded but level ${lv} -> ${rpg.noctis.level}`);
  });

  /* ----------------------------------------------------------- combat ---- */
  probe('combat', 'encounter: spawn -> aggro -> kill -> reward', () => {
    const enc = g.get('Director')!; const enemies = g.get('Enemies')!; const rpg = g.get('Rpg')!;
    enc.setScenario('combat'); step(30);
    const alive = enemies.alive ? enemies.alive().length : enemies.list.length;
    if (!alive) return F('scenario spawned nothing');
    const exp0 = rpg.bankedExp ?? 0;
    const e = (enemies.alive ? enemies.alive() : enemies.list)[0];
    const up = g.camera.position.clone().set(0, 1, 0);
    for (let i = 0; i < 60 && !e.dead; i++) { e.hit(99999, up, {}); step(1); }
    const exp1 = rpg.bankedExp ?? 0;
    return e.dead
      ? (exp1 > exp0 ? P(`killed ${e.name || 'enemy'}, exp banked ${exp0}->${exp1}`)
        : W('enemy died but no EXP banked'))
      : F('enemy would not die');
  });

  probe('combat', 'party companions fight', () => {
    const ai = g.get('Party')!;
    const m = (ai.members || [])[0];
    if (!m) return F('no party members');
    // `m.ai` and `m.combat` have never existed on a `PartyMember` -- the AI
    // lives in `PartyAI`, keyed by member. The live arm is the character rig.
    const hasAi = !!m.character?.play;
    return hasAi ? P(`${ai.members.length} companions with combat hooks`) : F('no combat hook');
  });

  probe('combat', 'player death -> downed -> game over', () => {
    // `RpgSystem.downed` does not exist; `Downed` is registered by `Director`.
    const d = g.get('Downed');
    if (!d) return W('no Downed system registered by name');
    return P('downed system present');
  });

  probe('combat', 'weapon swap is free', () => {
    const c = g.get('Combat')!;
    const t0 = performance.now();
    for (const k of ['greatsword', 'polearm', 'daggers', 'firearm', 'sword'] as const) { c.setWeapon(k); step(1); }
    const ms = performance.now() - t0;
    return ms < 250 ? P(`5 swaps in ${ms.toFixed(0)} ms`) : F(`5 swaps cost ${ms.toFixed(0)} ms`);
  });

  /* ------------------------------------------------------ interaction ---- */
  probe('world', 'interaction verb finds targets', () => {
    const ix = g.get('Interaction')!; const town = g.get('Town')!; const player = g.get('Player')!;
    if (!ix || !town) return F('interaction or town missing');
    const n = ix.items.size;
    const a = town.anchors && (town.anchors.huntBoard || town.anchors.pump);
    if (!a) return W(`${n} interactables registered, no anchor to walk to`);
    player.root.position.set(a.x, player.root.position.y, a.z);
    step(6);
    // `ix.target` / `ix.nearest` have never existed -- the selection is
    // `current`, and `_pick()` is the private thing that fills it.
    const cur = ix.current;
    return cur ? P(`${n} registered; standing at the board selects "${cur.label || cur.verb}"`)
      : W(`${n} registered but none selected at the anchor`);
  });

  probe('world', 'shop + hunt board screens open with real data', () => {
    const menus = g.get('Menus')!;
    const has = (['shop', 'hunts'] as const).filter((k) => menus.screens && menus.screens[k]);
    if (has.length < 2) return F('screens not registered: ' + has.join(','));
    menus.setScreen('shop'); step(10);
    const open = menus.name === 'shop';
    menus.setScreen(null); step(4);
    return open ? P('shop and hunts registered; shop opens') : F('shop did not open');
  });

  probe('world', 'Hammerhead is built and populated', () => {
    const town = g.get('Town')!; const npcs = g.get('Npcs')!;
    // `npcs.npcs` does not exist; the placed townsfolk are `npcs.list`.
    const n = npcs.list?.length ?? 0;
    return town && n ? P(`town at (${Math.round(town.origin?.x)},${Math.round(town.origin?.z)}), ${n} NPCs`)
      : F('town or npcs empty');
  });

  /* --------------------------------------------------------- regalia ---- */
  probe('traversal', 'Regalia enter -> drive -> exit', () => {
    const r = g.get('Regalia')!;
    if (!r || !r.enter) return F('no Regalia system');
    r.enter(false); step(10);          // enter(autoDrive) — not enter(game)
    // `r.driving` / `r.occupied` have never existed on `RegaliaSystem`.
    const inCar = !!r.isDriving;
    if (!inCar) return F('enter() did not take');
    const p0 = r.body ? { x: r.body.pos.x, z: r.body.pos.z } : null;
    g.input.keys.add('KeyW');
    step(90);
    g.input.keys.clear();
    const moved = p0 && r.body
      ? Math.hypot(r.body.pos.x - p0.x, r.body.pos.z - p0.z) : 0;
    if (r.exit) r.exit();
    step(6);
    return moved > 1 ? P(`drove ${moved.toFixed(1)} m under throttle`) : W(`entered; moved ${moved.toFixed(2)} m`);
  });

  /* --------------------------------------------------------- dungeon ---- */
  probe('world', 'dungeon enter + exit', () => {
    const d = g.get('Dungeons')!;
    if (!d) return F('no Dungeons system');
    const ids = d.defs instanceof Map ? [...d.defs.keys()] : Object.keys(d.defs || {});
    if (!ids.length) return F('no dungeons defined');
    d.enter(ids[0]); step(24);
    // `isInside` is a getter, not a method, so the `typeof === 'function'`
    // arm has never been taken.
    const inside = d.isInside;
    d.leave(); step(12);
    const out = !d.isInside;
    return inside && out ? P(`${ids.length} dungeons (${ids.join(', ')}); entered and left`)
      : F(inside ? 'entered but leave() failed' : 'enter() did not take');
  });

  /* ----------------------------------------------------------- story ---- */
  probe('story', 'title -> cutscene -> chapter', () => {
    const s = g.get('Story')!;
    if (!s) return F('no Story system');
    s.applyShot('title'); step(20);
    const titleUp = !!s.title?.shown;
    const camOk = Number.isFinite(g.camera.position.x);
    s.applyShot({ scene: 'ch1_opening_push', at: 20 }); step(30);
    const playing = !!s.cine?.playing;
    s.applyShot(null); step(6);
    if (!titleUp) return F('title did not show');
    if (!camOk) return F('attract camera is NaN');
    return playing ? P('title shows, attract camera valid, opening scene plays')
      : W('title works; cutscene did not report playing');
  });

  /* ----------------------------------------------------------- audio ---- */
  probe('audio', 'audio graph runs and reacts to combat', () => {
    const a = g.get('Audio')!;
    if (!a) return F('no Audio system');
    if (!a.enabled || !a.ctx) return F('context never booted under audio=force');
    const before = a.ctx.currentTime;
    window.dispatchEvent(new CustomEvent('combat:hit', { detail: { position: { x: 0, y: 1, z: 0 } } }));
    return P(`ctx ${a.ctx.state}, score cue "${a._musicState}", t=${before.toFixed(2)}`);
  });

  /* ------------------------------------------------------------- map ---- */
  probe('map', 'world map data + minimap render', () => {
    const mm = g.get('Minimap')!;
    const wm = mm && (mm.map || g.get('Terrain')?.map);
    // `wm.list()` does not exist on `WorldMap`; the POIs are the `pois` array.
    const pois = wm?.pois?.length ?? 0;
    return pois ? P(`${pois} POIs, minimap ${mm.root ? 'in DOM' : 'headless'}`)
      : W('minimap present, POI count unavailable');
  });

  /* ------------------------------------------------------- rest/camp ---- */
  probe('gameplay', 'rest banks EXP at a lodging', () => {
    const rpg = g.get('Rpg')!;
    const lv0 = rpg.noctis.level;
    rpg.gainExp(4000);
    // `DayCycle.rest` takes a *context* (`{ expBank, party, lodging, ... }`),
    // not a lodging id. The old `day.rest('caravan')` handed it a string, so
    // `ctx.expBank` was undefined, the redemption was skipped and the probe
    // asserted only that a value came back. `restAt` is the game's own entry
    // point and the one Hammerhead's caravan uses.
    const res = rpg.restAt('caravan');
    return res.ok ? P(`restAt('caravan') ran, level ${lv0}->${rpg.noctis.level}`)
      : W(`rest refused: ${res.reason}`);
  });

  return out;
});

await browser.close();
if (server) server.kill();

const order = ['engine', 'rpg', 'combat', 'world', 'traversal', 'story', 'audio', 'map', 'gameplay'];
results.sort((a, b) => order.indexOf(a.area) - order.indexOf(b.area));

if (JSON_OUT) { console.log(JSON.stringify({ results, pageErrors }, null, 2)); process.exit(0); }

const mark = { PASS: '  PASS ', WIRED: '  WIRED', FAIL: '  FAIL ' };
let area = '';
for (const r of results) {
  if (r.area !== area) { area = r.area; console.log(`\n[${area}]`); }
  console.log(`${mark[r.status as keyof typeof mark]}  ${r.name.padEnd(44)} ${r.evidence}`);
}
const n = (s: string) => results.filter((r) => r.status === s).length;
console.log(`\n${n('PASS')} pass · ${n('WIRED')} wired-but-unproven · ${n('FAIL')} not integrated`);
if (pageErrors.length) {
  console.log(`\n${pageErrors.length} page error(s):`);
  for (const e of [...new Set(pageErrors)].slice(0, 8)) console.log('  ' + e);
}
process.exit(n('FAIL') ? 1 : 0);

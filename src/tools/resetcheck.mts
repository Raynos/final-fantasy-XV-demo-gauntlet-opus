#!/usr/bin/env node
/**
 * What survives `GAME.reset()`? — the gate that makes page reuse possible.
 *
 *   node src/tools/resetcheck.mts                 # every workload, report leaks
 *   node src/tools/resetcheck.mts --set combat    # one workload
 *   node src/tools/resetcheck.mts --json out.json
 *   node src/tools/resetcheck.mts --keys          # the digest's field list, no run
 *
 * ## Why
 *
 * Every play gate takes a lease and `routeLease` hardcodes `cold: true`, so a
 * fresh page is booted for each one: **188 boots across 190 lease jobs at 7.46 s
 * each**, roughly 1400 s of machine time per suite cycle, and the largest single
 * remaining cost in the harness. The coldness is not the exclusivity — those are
 * two different arguments to `pool.lease(key, w, h, cold)` — and it is not
 * arbitrary either. It is there because reusing a driven page has burned this
 * repo twice: `integration` reports 27 pass on a fresh page and 24 on a used one
 * (LANDMINES.md), and `creaturecheck` once reported a false 0.034 m animation
 * drift in 1.5 s, far too fast to have booted.
 *
 * The game already has the mechanism — `Game.reset()` stops the loop, leaves any
 * dungeon, zeroes the clock, snaps the party, returns the menus to `main` and
 * calls `reset()` on every system that has one. The problem is that **4 of 26
 * systems implement `reset()`**, and the daemon's own drift check currently
 * reports `RESET IS DRIFTING, mean 7.0/255` against a 1.5/255 floor. So the
 * daemon is right to refuse, and "just reuse the page" is not a decision anyone
 * can take until that is false.
 *
 * ## Why a digest rather than a picture
 *
 * `checkResetDrift` compares one rendered shot against a boot-to-boot floor.
 * That is a good smoke alarm and a terrible map: a quest flag, an inventory
 * count, HP, the enemy roster, the renderer quality tier and the built POI
 * corpus are all invisible to it, and any of them can change what a *later*
 * gate asserts without moving a single pixel of `zone_cape_caem`. This walks
 * the state directly and names the field.
 *
 * ## The null arm is the point
 *
 * Boot, digest, reset immediately, digest again. Those two must be identical.
 * If they are not, the digest is measuring its own noise and every leak it
 * reports downstream is unreadable — which is exactly the failure mode that
 * wasted an evening on `drawcheck`, whose tolerance is an eighth of its own
 * run-to-run spread. **A workload arm is only read when the null arm is clean.**
 */
import { writeFile } from 'node:fs/promises';
import { harnessArgs, announceBuild, withPage, pageOpts } from './harness.mts';

const VOID = 3;

/**
 * The digest, as source, because it has to run in the page and be *identical*
 * between arms — two spellings of "the same digest" is how a null arm lies.
 *
 * Every field is read defensively: a system that does not exist, or an API that
 * moved, must produce `undefined` rather than throw, or one missing getter
 * takes down the whole map and reports "no leaks".
 */
const DIGEST = `(() => {
  const g = window.GAME;
  const d = {};
  const put = (k, fn) => { try { const v = fn(); if (v !== undefined) d[k] = v; } catch (e) { d[k] = 'ERR'; } };
  const r3 = (v) => (v == null ? undefined : [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)].join(','));

  // --- the one the audit already named: player position, which Game.reset()
  //     does not restore and Party.snap() then propagates outward.
  put('player.pos', () => r3(g.get('Player')?.position ?? g.get('Player')?.object?.position));
  put('player.rotY', () => +(g.get('Player')?.object?.rotation?.y ?? g.get('Player')?.rotation?.y).toFixed(3));
  put('player.vel', () => r3(g.get('Player')?.velocity));

  put('camera.pos', () => r3(g.camera?.position));
  put('camera.fov', () => +g.camera?.fov?.toFixed(3));
  put('camera.quat', () => {
    const q = g.camera?.quaternion; if (!q) return undefined;
    return [q.x, q.y, q.z, q.w].map((n) => +n.toFixed(4)).join(',');
  });

  put('time.now', () => +g.time?.now?.toFixed(4));
  put('time.frame', () => g.time?.frame);
  put('shot', () => String(g.currentShot));

  // --- party: every member's seat, since one member left behind is a whole
  //     class of follow-shot corruption.
  put('party.n', () => g.get('Party')?.members?.length);
  put('party.pos', () => (g.get('Party')?.members ?? [])
    .map((m) => r3(m.object?.position ?? m.position)).join(' | '));

  // --- progression: invisible to any pixel comparison, and exactly what
  //     integration/combatloop assert on.
  const rpg = g.get('Rpg');
  put('rpg.level', () => rpg?.party?.get?.('noctis')?.level ?? rpg?.level);
  put('rpg.gil', () => rpg?.gil);
  put('rpg.ap', () => rpg?.ap);
  put('rpg.hp', () => (rpg?.party?.all?.() ?? []).map((c) => c.hp).join(','));
  put('rpg.inv', () => rpg?.inventory?.all?.().length ?? rpg?.inventory?.items?.length);
  put('rpg.equipped', () => JSON.stringify(rpg?.inventory?.equipped?.('noctis') ?? null));
  put('rpg.quests', () => JSON.stringify(rpg?.quests?.active?.() ?? rpg?.quests ?? null).slice(0, 400));

  put('enemies.n', () => g.get('Enemies')?.all?.().length ?? g.get('Enemies')?.list?.length);
  put('enemies.alive', () => (g.get('Enemies')?.all?.() ?? []).filter((e) => e.hp > 0).length);
  put('combat.inFight', () => !!(g.get('Combat')?.inCombat ?? g.get('Combat')?.active));

  put('menus.screen', () => g.get('Menus')?.screen ?? g.get('Menus')?.current);
  put('menus.open', () => !!g.get('Menus')?.open);
  put('hud.demo', () => JSON.stringify(g.get('HUD')?.demo ?? null).slice(0, 200));

  // --- settings that uxcheck moves and does not restore.
  put('input.invertY', () => g.input?.invertY);
  put('input.sens', () => g.input?.sensitivity);
  put('rnd.quality', () => g.rnd?.quality);

  put('dungeons.inside', () => !!g.get('Dungeons')?.isInside);
  put('story.shot', () => String(g.get('Story')?.current ?? null));
  put('weather.tod', () => +g.get('Sky')?.timeOfDay?.toFixed(4));
  // The ACCUMULATOR, not the derived value. windStrength is recomputed from
  // _gust on every update, so it reads stale straight after a reset and clears
  // itself on the next frame -- a false positive that cost me a wrong
  // diagnosis. _gust is the state that would really carry a phase into a reuse.
  // (No backticks in here: this whole block is inside a template literal.)
  put('weather._gust', () => +g.get('Weather')?._gust?.toFixed(5));
  put('weather.windDir', () => +g.get('Weather')?.windDir?.toFixed(5));
  put('director.state', () => String(g.get('Director')?.state ?? null));

  // --- resources. A geometry or texture that survives a reset is both a wrong
  //     draw count and a share of the 1.4 GB in project/TODO.md.
  put('gpu.geometries', () => g.renderer?.info?.memory?.geometries);
  put('gpu.textures', () => g.renderer?.info?.memory?.textures);
  put('gpu.programs', () => g.renderer?.info?.programs?.length);
  put('scene.children', () => g.scene?.children?.length);
  put('scene.objects', () => { let n = 0; g.scene?.traverse(() => n++); return n; });

  // --- the prototype rewrite reachcheck installs and never unwraps.
  put('instrumented', () => !!(window.__REACH || window.__reachInstrumented));

  return d;
})()`;

/**
 * One contaminating workload per gate that is known to burn a page, named after
 * the gate, so a leak reads as an instruction about which tool to fix.
 *
 * Each is written to be *representative rather than exhaustive* — the point is
 * to reproduce the class of mutation, not to re-run the gate.
 */
const WORKLOADS: Record<string, string> = {
  /** The control: change nothing at all. See the header — this must come back clean. */
  null: `(() => {})()`,

  /** `combatloop`, `floatcheck --at`: move the player, which Party.snap() propagates. */
  combat: `(() => {
    const g = window.GAME;
    const p = g.get('Player');
    const o = p?.object ?? p;
    if (o?.position) { o.position.x += 250; o.position.z -= 175; }
    g.get('Party')?.snap?.();
    g.settle(20);
  })()`,

  /** `uxcheck`: open menus and move two engine settings it never restores. */
  ux: `(() => {
    const g = window.GAME;
    const m = g.get('Menus');
    m?.setScreen?.('system');
    if (g.input) g.input.invertY = !g.input.invertY;
    if (g.rnd) g.rnd.quality = (g.rnd.quality === 'high' ? 'low' : 'high');
    g.settle(10);
  })()`,

  /** `drawcheck`, `corpus`, `shoot`: pose a few shots, the commonest workload of all. */
  shots: `(() => {
    const g = window.GAME;
    for (const n of ['town_wide', 'poi_reststop', 'hero_closeup']) {
      g.applyShot(n); g.settle(20);
    }
  })()`,

  /** `creaturecheck`: drive the bestiary directly. */
  creatures: `(() => {
    const g = window.GAME;
    const e = g.get('Enemies');
    for (let i = 0; i < 30; i++) e?.update?.(1 / 60, g);
    g.settle(10);
  })()`,

  /** Dungeon enter/leave, the one path `reset()` special-cases. */
  dungeon: `(() => {
    const g = window.GAME;
    const d = g.get('Dungeons');
    const name = d?.names?.[0] ?? d?.list?.[0]?.name;
    if (name && d?.enter) { d.enter(name, { instant: true }); g.settle(20); }
  })()`,
};

function parse(argv: string[]) {
  const o = { set: null as string | null, json: null as string | null, keys: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--set') o.set = argv[++i];
    else if (argv[i] === '--json') o.json = argv[++i];
    else if (argv[i] === '--keys') o.keys = true;
  }
  return o;
}

const opts = parse(process.argv.slice(2));
const ha = harnessArgs(process.argv.slice(2), { lane: 'sweep' });
announceBuild(ha);

type Digest = Record<string, string | number | boolean>;
interface Leak { key: string; boot: string; after: string }

const diff = (a: Digest, b: Digest): Leak[] => {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys
    .filter((k) => String(a[k]) !== String(b[k]))
    .map((k) => ({ key: k, boot: String(a[k]), after: String(b[k]) }));
};

const names = opts.set ? [opts.set] : Object.keys(WORKLOADS);
for (const n of names) {
  if (!WORKLOADS[n]) {
    console.log(`unknown workload "${n}" — have: ${Object.keys(WORKLOADS).join(', ')}`);
    process.exit(VOID);
  }
}

const results: Record<string, Leak[]> = {};

await withPage(pageOpts(ha), async (page) => {
  page.on('pageerror', (e) => console.error('PAGEERR', String(e).split('\n')[0]));

  const boot = await page.evaluate(DIGEST) as Digest;
  if (opts.keys) {
    console.log(Object.keys(boot).sort().join('\n'));
    return;
  }
  console.log(`digest: ${Object.keys(boot).length} fields\n`);

  for (const name of names) {
    // Back to a known state before each workload, so arm N does not inherit
    // arm N-1 — the very mistake this tool exists to find.
    await page.evaluate(`window.GAME.reset()`);
    const before = await page.evaluate(DIGEST) as Digest;
    await page.evaluate(WORKLOADS[name]);
    await page.evaluate(`window.GAME.reset()`);
    const after = await page.evaluate(DIGEST) as Digest;
    results[name] = diff(before, after);
  }
});

if (opts.keys) process.exit(0);

const nul = results['null'];
console.log('  workload      leaked fields');
for (const [name, leaks] of Object.entries(results)) {
  const tag = name === 'null' ? '(control)' : '';
  console.log(`  ${name.padEnd(13)} ${String(leaks.length).padStart(2)}  ${tag}`);
}
console.log();

for (const [name, leaks] of Object.entries(results)) {
  if (!leaks.length) continue;
  console.log(`${name}:`);
  for (const l of leaks.slice(0, 20)) {
    console.log(`    ${l.key.padEnd(18)} ${l.boot.slice(0, 34).padEnd(36)} -> ${l.after.slice(0, 34)}`);
  }
  console.log();
}

if (opts.json) await writeFile(opts.json, `${JSON.stringify(results, null, 1)}\n`);

/**
 * The null arm decides whether anything else here is readable.
 *
 * A dirty control does not mean "reset is very broken" — it means the digest
 * moved on its own, so every workload's leak set is that noise plus an unknown
 * signal, and no field in it can be trusted. VOID, not FAIL: the ruler refused
 * to certify, which is not a verdict about reset at all.
 */
if (nul && nul.length) {
  console.log(`VOID: the control arm leaked ${nul.length} field(s) with NO workload run.`);
  console.log('      The digest is measuring itself. Fix that before reading any row above.');
  process.exit(VOID);
}

const total = Object.entries(results).filter(([k]) => k !== 'null')
  .reduce((n, [, v]) => n + v.length, 0);
if (total === 0) {
  console.log('resetcheck: PASS — every workload came back to the booted state.');
  console.log('  Page reuse is safe for these paths: routeLease may drop `cold: true`.');
  process.exit(0);
}
console.log(`resetcheck: ${total} field(s) survive a reset, across `
  + `${Object.entries(results).filter(([k, v]) => k !== 'null' && v.length).length} workload(s).`);
console.log('  Each is a reason a reused page would lie to the next gate.');
process.exit(1);

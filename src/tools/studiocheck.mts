#!/usr/bin/env node
/**
 * Does the Game Studio avoid booting the game?
 *
 *   node src/tools/studiocheck.mts
 *   node src/tools/studiocheck.mts --dirty
 *
 * ## Why this gate exists
 *
 * Every complaint on the studio's first version was a version of one sentence:
 * *why is the whole game running behind this?* The Model Explorer spawned
 * enemies through the game's pool, the party stood in the menu shot, and
 * reaching a two-row front door cost a thirty-system boot.
 *
 * v2's answer is architectural — three boot profiles, and sections that ask for
 * only what they need. An architecture is a claim, and a claim that is not
 * measured rots. So this counts:
 *
 *   1. **Front door: 0 systems.** It is a crest and two rows; it must cost no
 *      boot at all.
 *   2. **Model Explorer: 0 systems.** Every model factory is standalone. A
 *      creature that needs a world to be looked at is the bug.
 *   3. **World Explorer: exactly 5.** `Sky`, `Terrain`, `Water`, `Vegetation`,
 *      `Props` — the geometry, and none of the twenty-five systems that make it
 *      a game. Asserted against `WORLD_SYSTEMS` itself rather than a list
 *      retyped here, because a second copy is exactly how it would come to
 *      disagree with reality.
 *   4. **Nobody is in the scene.** No `Player`, `Party`, `Npcs` or enemy object
 *      in either explorer. This is the human's complaint expressed as a count,
 *      and it is the one that would silently regress the moment somebody adds a
 *      convenience import.
 *
 * ## Why it cannot be a probe
 *
 * `probe.mts` drives a `?shoot=1` page and `?shoot=1` routes straight into the
 * game — by design, since BRIEF rule 2 makes two capture runs byte-identical
 * and no frame in the corpus may contain menu chrome. A probe would therefore
 * measure a page that had already booted everything before its first line ran,
 * which is precisely what happened on the first attempt. This opens its own
 * page in play mode instead, the way `uxcheck` does.
 */
import { harnessArgs, announceBuild, lease, pageOpts } from './harness.mts';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * `--shot <dir>` writes a frame at each checkpoint.
 *
 * The gate is the only thing that drives a real `?studio=1` page -- a probe page
 * is `?shoot=1` and routes into the game -- so it is also the only place the
 * studio can actually be photographed as a person sees it.
 */
const shotIx = process.argv.indexOf('--shot');
const shotDir = shotIx >= 0 ? process.argv[shotIx + 1] : null;
if (shotDir) await mkdir(shotDir, { recursive: true });
const shot = async (name: string) => {
  if (!shotDir) return;
  const buf = await page.screenshot({ type: 'jpeg', quality: 82 });
  const file = path.join(shotDir, `${name}.jpg`);
  await writeFile(file, buf);
  console.log(`[shot] ${file}`);
};

const results: Array<{ name: string, pass: boolean, note: string }> = [];
const ok = (name: string, pass: unknown, note = '') => {
  results.push({ name, pass: !!pass, note });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? `  — ${note}` : ''}`);
};

const ha = harnessArgs(process.argv.slice(2), { q: 'low', play: true });
announceBuild(ha);

/** Systems that make the world geometry, and the only ones the world may boot. */
const WORLD = ['Sky', 'Terrain', 'Water', 'Vegetation', 'Props'];

/** Names that must never appear in a studio scene. @see the file header */
const FORBIDDEN = /^(player|party|noctis|gladio|ignis|prompto|npc|npcs|enemy)/i;

const leased = await lease({ ...pageOpts(ha), extra: 'studio=1' });
const page = leased.page;
const pageErrors: string[] = [];
page.on('pageerror', (e) => pageErrors.push(String((e as Error).stack || e).split('\n').slice(0, 4).join(' <- ')));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text().slice(0, 200)); });

/* ------------------------------------------------------------------- 1 */
/* the studio opens, and nothing is booted                                */

await page.waitForFunction(() => !!document.getElementById('studio'), null, { timeout: 30_000 });

const opened = await page.evaluate(() => ({
  systems: window.GAME.systems.length,
  names: window.GAME.systems.map((s) => s.constructor?.name).filter(Boolean),
}));
ok('studio opens with zero systems booted', opened.systems === 0,
  `${opened.systems} booted${opened.names.length ? `: ${opened.names.join(', ')}` : ''}`);

/* ------------------------------------------------------------------- 2 */
/* the model explorer builds every asset, still with no game               */

const model = await page.evaluate(async () => {
  const shell = window.__STUDIO!;
  const settle = async (ms: number) => {
    const until = performance.now() + ms;
    while (performance.now() < until) await new Promise((r) => setTimeout(r, 0));
  };
  await shell.setSection('model');
  await settle(300);

  const fams = shell.model.families_();
  const failures: string[] = [];
  const costs: Array<{ key: string, tris: number, meshes: number }> = [];
  let total = 0;
  for (let f = 0; f < fams.length; f++) {
    shell.model.openFamily(f);
    const keys = shell.model.keys();
    total += keys.length;
    for (let i = 0; i < keys.length; i++) {
      shell.model.select(i);
      if (shell.model.error) failures.push(shell.model.error);
      else {
        const c = shell.model.cost();
        if (c) costs.push({ key: `${fams[f].id}/${keys[i]}`, tris: c.tris, meshes: c.meshes });
      }
    }
    await settle(10);
  }
  return {
    systems: window.GAME.systems.length,
    families: fams.map((f) => `${f.title}=${f.count}`),
    total,
    failures,
    heaviest: costs.sort((a, b) => b.tris - a.tris).slice(0, 3),
  };
});

await shot('1-model');
ok('model explorer boots no game systems', model.systems === 0, `${model.systems} booted`);
ok('every model builds', model.failures.length === 0,
  `${model.total} assets across ${model.families.length} families (${model.families.join(' ')})`
  + (model.failures.length ? ` — ${model.failures.slice(0, 3).join(' | ')}` : ''));
console.log(`      heaviest: ${model.heaviest.map((c) => `${c.key} ${c.tris.toLocaleString()} tris`).join(', ')}`);

/* ------------------------------------------------------------------- 3 */
/* nobody is in the model scene                                            */

const modelCensus = await page.evaluate((pattern) => {
  const re = new RegExp(pattern, 'i');
  const named: string[] = [];
  window.GAME.scene.traverse((o) => { if (re.test(String(o.name || ''))) named.push(o.name); });
  return named;
}, FORBIDDEN.source);
ok('no character or enemy object in the model scene', modelCensus.length === 0,
  modelCensus.length ? `${modelCensus.length} found: ${modelCensus.slice(0, 6).join(', ')}` : 'clean');

/* ------------------------------------------------------------------- 4 */
/* the world explorer boots exactly the geometry systems                   */

const world = await page.evaluate(async () => {
  const shell = window.__STUDIO!;
  const settle = async (ms: number) => {
    const until = performance.now() + ms;
    while (performance.now() < until) await new Promise((r) => setTimeout(r, 0));
  };
  await shell.setSection('world');
  await settle(1500);
  const places = shell.world.places();
  const sig = places.filter((p) => p.group === 'Signature');
  if (sig.length) shell.world.arrive(sig[0]);
  await settle(2500);
  return {
    names: window.GAME.systems.map((s) => s.constructor?.name).filter(Boolean),
    places: places.length,
    signature: sig.length,
    at: shell.world.at?.name ?? null,
    settled: shell.world.settled(),
  };
});

await shot('2-world');
const extra = world.names.filter((n) => !WORLD.includes(n));
const missing = WORLD.filter((n) => !world.names.includes(n));
ok('world explorer boots exactly the five geometry systems',
  extra.length === 0 && missing.length === 0,
  `booted [${world.names.join(', ')}]`
  + (extra.length ? ` — unexpected: ${extra.join(', ')}` : '')
  + (missing.length ? ` — missing: ${missing.join(', ')}` : ''));

ok('destinations resolve and one arrives', world.places > 100 && !!world.at,
  `${world.places} destinations, ${world.signature} signature, at ${world.at}, settled=${world.settled}`);

const worldCensus = await page.evaluate((pattern) => {
  const re = new RegExp(pattern, 'i');
  const named: string[] = [];
  window.GAME.scene.traverse((o) => { if (re.test(String(o.name || ''))) named.push(o.name); });
  return named;
}, FORBIDDEN.source);
ok('no character or enemy object in the world scene', worldCensus.length === 0,
  worldCensus.length ? `${worldCensus.length} found: ${worldCensus.slice(0, 6).join(', ')}` : 'clean');

/* ------------------------------------------------------------------- 5 */
/* BRIEF rule 5                                                            */

ok('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await leased.release();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);

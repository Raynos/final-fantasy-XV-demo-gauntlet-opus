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
 *   3. **World Explorer: exactly the world profile, and nothing else.** `Sky`,
 *      `Terrain`, `Water`, `Vegetation`, `Props`, `Town`, `Cities`, `Dungeons`
 *      — the geometry, and none of the twenty-two systems that make it a game.
 *      Asserted against `WORLD_SYSTEMS` itself, read out of the running page,
 *      rather than a list retyped here: a second copy is exactly how it would
 *      come to disagree with reality, and the list just grew from five to
 *      eight.
 *   4. **Nobody is in the scene.** No `Player`, `Party`, `Npcs` or enemy object
 *      in either explorer. This is the human's complaint expressed as a count,
 *      and it is the one that would silently regress the moment somebody adds a
 *      convenience import.
 *
 * ## And the v3 lanes, each with the assertion its plan names
 *
 *   5. **The mobile menu draws.** Under a real iPhone descriptor, before any
 *      section is opened, `#studio .st-item` must be >= 5. The bug it guards
 *      shipped as a black screen with a header over it, and no gate could see
 *      it because no gate had ever opened the studio on a phone.
 *   6. **The front door is centred**, on both descriptors, to within 4 px.
 *   7. **An enemy faces the reviewer** — `enemy.heading` equals
 *      `stage.subjectYaw()` after a selection.
 *   8. **The world is eight systems and still empty**, and Hammerhead's arrival
 *      frame actually contains the town, counted by mesh-name census rather
 *      than looked at.
 *   9. **World -> Models leaves no world visible.** `showWorld(false)` used to
 *      guess at root property names none of the eight systems have.
 *  10. **The model out-reads its own backdrop** by more than 1.3x, sampled off
 *      the real frame.
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
import { chromium, devices } from 'playwright';
import { harnessArgs, announceBuild, lease, pageOpts, buildServer } from './harness.mts';
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
  const want = shell.worldSystems();
  // Hammerhead defers its build to `update` on the phone path and builds on
  // approach, so arrive there before counting it.
  const hh = places.find((p) => /hammerhead/i.test(p.id));
  if (hh) { shell.world.arrive(hh); await settle(3000); }
  let townMeshes = 0;
  const town = window.GAME.get('Town' as never) as unknown as { root?: { traverse(f: (o: unknown) => void): void } } | null;
  if (town?.root) town.root.traverse((o) => { townMeshes += (o as { isMesh?: boolean }).isMesh ? 1 : 0; });
  return {
    names: window.GAME.systems.map((s) => s.constructor?.name).filter(Boolean),
    count: window.GAME.systems.length,
    want: [...want],
    missing: want.filter((n) => !window.GAME.get(n as never)),
    places: places.length,
    signature: sig.length,
    at: shell.world.at?.name ?? null,
    settled: shell.world.settled(),
    townMeshes,
  };
});

await shot('2-world');
// Against `WORLD_SYSTEMS` itself, read out of the running page, never a list
// retyped here: a second copy is exactly how a gate comes to pass while the
// thing it guards is broken, and the list just grew from five to eight.
ok(`world explorer boots exactly the ${world.want.length} geometry systems`,
  world.missing.length === 0 && world.count === world.want.length,
  `booted ${world.count} of [${world.want.join(', ')}]`
  + (world.missing.length ? ` — missing: ${world.missing.join(', ')}` : ''));

// The content half of the same claim. Hammerhead is a SYSTEM, not props, and
// while it was outside the profile the World Explorer showed one red-roofed
// shed where the game has a garage complex. Counted, not looked at.
ok('the town at Hammerhead is actually built', world.townMeshes > 20,
  `${world.townMeshes} meshes under the Hammerhead root`);

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
/* World -> Models leaves nothing of the world visible                     */

/*
 * The path nothing tested, and the reason `showWorld` was rewritten. It used to
 * toggle whichever of `group | root | mesh | dome | sky` each system happened
 * to have — and not one of the eight has a single root, so most of the world
 * stayed standing behind the turntable.
 */
const leftOver = await page.evaluate(async () => {
  const shell = window.__STUDIO!;
  await shell.setSection('model');
  await new Promise((r) => setTimeout(r, 400));
  const names: string[] = [];
  const stage = shell.model.stage.group;
  for (const top of window.GAME.scene.children) {
    if (top === stage || !top.visible) continue;
    top.traverse((o) => {
      if (/^(terrain|veg|water|clipmap|hammerhead|prop)/i.test(String(o.name || ''))) names.push(o.name);
    });
  }
  return names.slice(0, 6);
});
ok('world -> models leaves no world visible', leftOver.length === 0,
  leftOver.length ? `still visible: ${leftOver.join(', ')}` : 'clean');

/* ------------------------------------------------------------------- 6 */
/* the enemy faces the reviewer, and out-reads its own backdrop            */

const facing = await page.evaluate(async () => {
  const shell = window.__STUDIO!;
  const m = shell.model;
  const fams = m.families_();
  m.openFamily(fams.findIndex((f) => f.id === 'enemies'));
  const i = Math.max(0, m.keys().indexOf('bloodhorn'));
  m.select(i);
  await new Promise((r) => setTimeout(r, 300));
  const made = (m as unknown as { _made: { kind: string, enemy?: { heading: number } } | null })._made;
  return {
    key: m.current(),
    heading: made && made.kind === 'enemy' && made.enemy ? made.enemy.heading : null,
    want: m.stage.subjectYaw(),
  };
});
ok('a staged enemy faces the reviewer',
  facing.heading != null && Math.abs(facing.heading - facing.want) < 0.01,
  `${facing.key}: heading ${facing.heading?.toFixed(3)} vs subjectYaw ${facing.want.toFixed(3)}`);

await shot('3-enemy');

/*
 * Finding 7, as a number rather than an opinion.
 *
 * The subject's own pixels against the backdrop's. Sampled from the real frame
 * through a 2D canvas: a column down the middle of frame is the subject, and
 * the outer eighths are backdrop on any framing this stage produces. A ratio
 * under 1.3 is the "muddy, no rim" the audit photographed.
 */
const contrast = await page.evaluate(() => {
  const cv = window.GAME.renderer.domElement;
  const c = document.createElement('canvas');
  c.width = 160; c.height = 90;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(cv, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let sub = 0, subN = 0, bg = 0, bgN = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const mid = x > c.width * 0.36 && x < c.width * 0.64 && y > c.height * 0.2 && y < c.height * 0.9;
      if (mid) { sub += l; subN++; } else if (x < c.width * 0.12 || x > c.width * 0.88) { bg += l; bgN++; }
    }
  }
  return { subject: subN ? sub / subN : 0, backdrop: bgN ? bg / bgN : 0 };
});
const ratio = contrast.backdrop > 0 ? contrast.subject / contrast.backdrop : 0;
ok('the model out-reads its backdrop', ratio > 1.3,
  `subject ${contrast.subject.toFixed(1)} vs backdrop ${contrast.backdrop.toFixed(1)} = ${ratio.toFixed(2)}x`);

/* ------------------------------------------------------------------- 7 */
/* BRIEF rule 5                                                            */

ok('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await leased.release();

/* ------------------------------------------------------------------- 8 */
/* the phone, under a real device descriptor                               */

/*
 * ## Why this half does not use the daemon's page
 *
 * The lease hands back one warm page in one browser context, and what decides
 * every phone layout in this project is the *context*: `hasTouch`,
 * `deviceScaleFactor`, and the `hover: none` / `pointer: coarse` media queries
 * `Device.ts` reads at module evaluation. None of that can be changed on a page
 * that has already booted, and emulating it through CDP would leave the shared
 * page in an emulated state for whatever tool leased it next.
 *
 * So this opens its own browser on its own build server, the way `devicecheck`
 * does, and pays a few seconds for the only thing that can answer the question.
 * It is the whole reason the mobile studio shipped as a black screen with a
 * header over it: nothing had ever opened the studio on a phone.
 */
const { port } = await buildServer({ build: ha.build, prod: true });
const browser = await chromium.launch();
try {
  for (const [tag, ctxOpts] of [
    ['phone', { ...devices['iPhone 15 Pro'], deviceScaleFactor: 1 }],
    ['desk', { viewport: { width: 1600, height: 900 } }],
  ] as Array<[string, Record<string, unknown>]>) {
    const ctx = await browser.newContext(ctxOpts);
    const pg = await ctx.newPage();
    pg.setDefaultTimeout(120_000);
    const errs: string[] = [];
    pg.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));

    // ---- the front door is centred, on both descriptors
    await pg.goto(`http://127.0.0.1:${port}/?nobake=1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await pg.waitForSelector('#door.in', { timeout: 30_000 });
    // Past the 1.2 s + 0.9 s slide-in, because the bug being guarded is a
    // keyframe's END state clobbering the rule that centres the menu.
    await pg.waitForTimeout(2600);
    const centred = await pg.evaluate(() => {
      const m = document.querySelector('#door .fd-menu');
      if (!m) return null;
      const r = m.getBoundingClientRect();
      return { off: Math.abs((r.left + r.right) / 2 - window.innerWidth / 2), w: r.width };
    });
    ok(`front door menu is centred (${tag})`, centred != null && centred.off <= 4,
      centred ? `centre off by ${centred.off.toFixed(1)} px, menu ${centred.w.toFixed(0)} px wide` : 'no menu found');

    // ---- the studio menu draws before any section is opened
    await pg.click('#door .fd-row:nth-child(2)');
    await pg.waitForSelector('#studio', { timeout: 60_000 });
    await pg.waitForFunction(() => !!window.__STUDIO, undefined, { timeout: 60_000 });
    await pg.waitForTimeout(600);
    const menu = await pg.evaluate(() => ({
      items: document.querySelectorAll('#studio .st-item').length,
      section: window.__STUDIO!.section,
      // Every target a thumb has to hit, and the floor it has to clear.
      short: [...document.querySelectorAll('#studio .st-item, #studio .st-fbtn, #studio .st-back')]
        .map((n) => ({ c: n.className, h: n.getBoundingClientRect().height }))
        .filter((r) => r.h > 0 && r.h < 44),
    }));
    ok(`studio menu draws before any section (${tag})`, menu.items >= 5 && menu.section === null,
      `${menu.items} items, section=${String(menu.section)}`);
    if (tag === 'phone') {
      ok('every phone target clears 44 px', menu.short.length === 0,
        menu.short.length ? menu.short.map((r) => `${r.c} ${r.h.toFixed(0)}px`).join(', ') : 'clean');
    }

    if (errs.length) ok(`no page errors (${tag})`, false, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);

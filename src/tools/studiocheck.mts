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
 *  10. **The model's LIT SIDE out-reads its backdrop** by more than 1.3x —
 *      the subject's p95 against the ramp, segmented per row off the real
 *      frame. The mean was tried first and is not a measure of this: a
 *      near-black creature is correctly lit and still averages 0.98x.
 *  11. **The drill-down works from the DOM**, tapped rather than called: in,
 *      to a viewport with a sheet and gestures, and back out one level per tap.
 *      Driven through real elements on purpose — the bug it guards shipped
 *      because a `<div>` with a click listener does nothing on iOS Safari, and
 *      a test that reached past the DOM would have passed on it.
 *  12. **The landscape gate fires on flight, not on a list.**
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
 * ## Separating the subject from the backdrop without a second render
 *
 * The first version compared a centre box against the outer eighths and
 * returned **0.76x** on a frame that plainly reads correctly. It was measuring
 * the wrong thing twice: the centre box is mostly backdrop (a model does not
 * fill it), and the backdrop is a vertical gradient, so the outer eighths
 * sampled over the full height average in a sky the centre band never sees.
 *
 * The backdrop is a smooth vertical ramp with no horizontal variation — one
 * `mix()` on `vP.y` and nothing else. So per ROW, the outer tenths give that
 * row's backdrop value exactly, and any centre pixel more than a few levels off
 * its own row's backdrop is a subject pixel. A real segmentation off a single
 * frame, with no second render and no threshold anybody had to guess.
 *
 * ## And why it is the 95th percentile, not the mean
 *
 * The mean was tried and it is **not a measure of this**. `bloodhorn` is a
 * near-black animal: correctly framed, correctly rim-lit along the horns, and
 * its mean luminance is 0.98x the backdrop's because most of its pixels are
 * genuinely dark. A frame was captured and looked at (`tmp/shots/sc2/3-enemy.jpg`)
 * and it reads exactly as it should — the instrument was wrong, not the render.
 *
 * The audit's finding 7 was "no rim, reads muddy". What that means, measurably,
 * is that the subject has **no highlight** — the key never wins over the ambient
 * a mid-grey backdrop feeds back through auto-exposure. So the question is
 * whether the lit side of the subject clears the ground it stands on, and the
 * p95 asks exactly that on a black bull and a blue chocobo alike.
 */
const contrast = await page.evaluate(() => {
  const cv = window.GAME.renderer.domElement;
  const c = document.createElement('canvas');
  c.width = 200; c.height = 120;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(cv, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const lum = (x: number, y: number) => {
    const i = (y * c.width + x) * 4;
    return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  };
  const edge = Math.max(2, Math.round(c.width * 0.10));
  const subject: number[] = [];
  let bg = 0, bgN = 0;
  for (let y = 0; y < c.height; y++) {
    let rowSum = 0, rowN = 0;
    for (let x = 0; x < edge; x++) { rowSum += lum(x, y); rowN++; }
    for (let x = c.width - edge; x < c.width; x++) { rowSum += lum(x, y); rowN++; }
    const rowBg = rowSum / rowN;
    bg += rowBg; bgN++;
    for (let x = edge; x < c.width - edge; x++) {
      const l = lum(x, y);
      // 6/255. Below that it is the ramp's own dithering, not a model.
      if (Math.abs(l - rowBg) > 6) subject.push(l);
    }
  }
  subject.sort((a, b) => a - b);
  const at = (q: number) => (subject.length ? subject[Math.min(subject.length - 1, Math.floor(subject.length * q))] : 0);
  return {
    subject: at(0.95),
    median: at(0.5),
    backdrop: bgN ? bg / bgN : 0,
    coverage: subject.length / (c.width * c.height),
  };
});
const ratio = contrast.backdrop > 0 ? contrast.subject / contrast.backdrop : 0;
ok('the model out-reads its backdrop', ratio > 1.3 && contrast.coverage > 0.01,
  `subject p95 ${contrast.subject.toFixed(1)} (median ${contrast.median.toFixed(1)})`
  + ` vs backdrop ${contrast.backdrop.toFixed(1)} = ${ratio.toFixed(2)}x`
  + ` over ${(contrast.coverage * 100).toFixed(1)}% of frame`);

/* ------------------------------------------------------------------- 7 */
/* a 16:9 framing survives a viewport that is not 16:9                     */

/*
 * The Shot Gallery's letterbox, asserted as ARITHMETIC rather than as pixels.
 *
 * `letterbox()` is a pure function of (fov, w, h), and the property that
 * matters is that the HORIZONTAL field it produces equals the one the shot was
 * authored with -- that is exactly what a portrait phone was silently throwing
 * away. It is exact, so the gate can be exact; measuring the bars in a
 * screenshot would only assert the easy half.
 */
const fit = await page.evaluate(async () => {
  const mod = await import('/studio/ShotGallery.ts');
  const hFov = (fovDeg: number, aspect: number) =>
    (2 * Math.atan(Math.tan((fovDeg * Math.PI) / 180 / 2) * aspect) * 180) / Math.PI;
  const cases = [
    { label: 'portrait phone', w: 393, h: 852 },
    { label: 'square', w: 600, h: 600 },
    { label: 'landscape phone', w: 852, h: 393 },
    { label: 'the corpus itself', w: 1600, h: 900 },
  ];
  return cases.map((c) => {
    const r = mod.letterbox(42, c.w, c.h);
    return {
      label: c.label,
      authoredH: hFov(42, 16 / 9),
      gotH: hFov(r.fov, c.w / c.h),
      bar: r.bar,
      fov: r.fov,
      wide: c.w / c.h >= 16 / 9,
    };
  });
});

// Narrower than 16:9 is the case the letterbox governs, and there the authored
// horizontal field must come back EXACTLY. Wider is deliberately not in this
// assertion: those keep the authored vertical angle and so see MORE than the
// corpus frame, which is the untouched behaviour the next `ok` pins.
const narrow = fit.filter((c) => !c.wide);
const drift = Math.max(...narrow.map((c) => Math.abs(c.gotH - c.authoredH)));
ok('a narrow viewport keeps the shot\'s authored horizontal field',
  narrow.length > 0 && drift < 0.01,
  narrow.map((c) => `${c.label} ${c.fov.toFixed(1)}deg v, bar ${c.bar.toFixed(0)}`).join(' - ')
  + ` - worst drift ${drift.toFixed(4)}deg`);

// The no-op half, which is what protects every existing capture and every gate
// that reads one: 16:9 or wider must come back untouched, bars included.
const wides = fit.filter((c) => c.wide);
ok('16:9 and wider are left exactly as authored',
  wides.length > 0 && wides.every((c) => c.bar === 0 && Math.abs(c.fov - 42) < 1e-9),
  wides.map((c) => `${c.label} fov ${c.fov} bar ${c.bar}`).join(' - '));

/* ------------------------------------------------------------------- 8 */
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

    if (tag === 'phone') {
      /*
       * ## The drill-down, driven the way a thumb drives it
       *
       * Every step below is a real tap on a real element, not a call into
       * `window.__STUDIO`. That distinction is the whole point: the bug this
       * guards shipped because the header's back affordance was a `<div>` with
       * a click listener, and **iOS Safari does not reliably fire `click` on
       * one** — a test that reached past the DOM would have passed on the
       * broken build, which is the only kind of test worth not writing.
       */
      await pg.click('#studio .st-item:nth-child(1)');            // Model Explorer
      await pg.waitForSelector('#studio .st-item', { timeout: 20_000 });
      await pg.click('#studio .st-item:nth-child(1)');            // the first family
      await pg.waitForSelector('#studio .st-row', { timeout: 20_000 });
      await pg.click('#studio .st-row');                          // the first asset
      await pg.waitForTimeout(500);
      const drilled = await pg.evaluate(() => ({
        sheet: !!document.querySelector('#studio .st-sheet:not([hidden])'),
        grab: !!document.querySelector('#studio .st-grab:not([hidden])'),
        section: window.__STUDIO!.section,
        staged: window.__STUDIO!.model.current(),
      }));
      ok('drilling to a model reaches a viewport with a sheet',
        drilled.sheet && drilled.grab && drilled.section === 'model' && !!drilled.staged,
        `staged ${String(drilled.staged)}, sheet=${drilled.sheet}, gestures=${drilled.grab}`);

      /*
       * A gesture catcher that exists is not the same as one a finger reaches.
       *
       * `#studio` is `pointer-events: none` with children opting back in, the
       * scrim and the busy overlay both span the whole shell, and the sheet
       * and the footer are pinned over the bottom of it. Any of them landing on
       * top means the drag that should orbit the turntable is eaten by
       * something invisible — reported as "can't spin the camera", which is
       * exactly what it looks like from the outside.
       *
       * So this asks the DOM the question a finger asks: at the middle of the
       * viewport, what is on top?
       */
      const hit = await pg.evaluate(() => {
        const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        return { cls: el?.className || String(el?.tagName), grab: !!el?.classList?.contains('st-grab') };
      });
      ok('a drag in the middle of the viewport reaches the gesture catcher',
        hit.grab, `topmost element is .${String(hit.cls).split(' ').join('.')}`);

      // And it actually turns the turntable. Driven as a real drag rather than
      // by calling `orbit`, for the same reason the taps above are real taps.
      const yawBefore = await pg.evaluate(() => window.__STUDIO!.model.stage.yaw);
      const cx = 0, cy = 0;
      void cx; void cy;
      await pg.mouse.move(200, 300);
      await pg.mouse.down();
      await pg.mouse.move(320, 300, { steps: 8 });
      await pg.mouse.up();
      await pg.waitForTimeout(300);
      const yawAfter = await pg.evaluate(() => window.__STUDIO!.model.stage.yaw);
      ok('dragging the viewport turns the turntable',
        Math.abs(yawAfter - yawBefore) > 0.05,
        `yaw ${yawBefore.toFixed(3)} -> ${yawAfter.toFixed(3)}`);

      // ...and back out, one level per tap, through the header's own control.
      const levels: string[] = [];
      for (let i = 0; i < 3; i++) {
        await pg.click('#studio .st-back');
        await pg.waitForTimeout(250);
        levels.push(await pg.evaluate(() => document.querySelector('#studio .st-title')?.textContent || ''));
      }
      ok('back walks one level per tap, out to the menu',
        levels[2] === 'Game Studio',
        `titles after each back: ${levels.join(' -> ')}`);

      /*
       * The landscape gate fires on FLIGHT, not on a list.
       *
       * Portrait is fully supported for every list in the studio — rotating to
       * scroll a menu is a tax — and it is flying that is a landscape activity,
       * because the camera is framed 16:9 and a portrait frustum crops the
       * horizon out of the shot. The descriptor here is portrait, so the World
       * Explorer's list must NOT be gated and arriving somewhere must be.
       */
      await pg.click('#studio .st-item:nth-child(2)');            // World Explorer
      await pg.waitForSelector('#studio .st-row', { timeout: 120_000 });
      const listGated = await pg.evaluate(
        () => (document.querySelector('#studio .st-blank')?.textContent || '').includes('sideways'));
      await pg.click('#studio .st-row');
      await pg.waitForTimeout(600);
      const flyGated = await pg.evaluate(
        () => (document.querySelector('#studio .st-blank')?.textContent || '').includes('sideways'));
      ok('the landscape gate fires on flight, not on a list',
        !listGated && flyGated,
        `list gated=${listGated}, flight gated=${flyGated}`);
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

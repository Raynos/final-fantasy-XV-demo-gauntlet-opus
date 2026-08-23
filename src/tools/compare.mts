#!/usr/bin/env node
/**
 * Blind A/B against shipped FFXV, with a sealed answer key.
 *
 *   node src/tools/compare.mts --shots tmp/shots/gc-field --out tmp/ab
 *   node src/tools/compare.mts --game tmp/shots/x/vista_noon.png \
 *        --ref docs/reference/plates/duscae-plains-lake-01.jpg --out tmp/ab/one.jpg
 *   node src/tools/compare.mts --reveal tmp/ab --answers 1=A,2=B,3=A
 *
 * **The point is that the judge cannot know which side is ours.** `BRIEF.md`
 * says a harsh critic will look at our screenshots next to real FFXV frames and
 * say which looks better; the last such pass scored 4.5/10 and predates
 * essentially everything now in the game. A critic who knows which panel is the
 * WebGL one is not scoring the frame, and neither is a critic who can tell from
 * a letterbox bar or an aspect ratio. So: sides randomised per pair, both
 * panels cropped to identical geometry, labelled only A and B, and the answer
 * key written to a sidecar the judge is never shown.
 *
 * Ported by translation from `final-fantasy-XV-demo-opus/tools/compare.mts`,
 * with three changes this repo needs:
 *
 * 1. **`--shots <dir>` pairs a whole capture directory in one call**, choosing
 *    each frame's reference from a scene-matched table (`PAIRING`) rather than
 *    making the caller name plates. A one-pair-per-invocation tool gets run
 *    once; a round of nine gets run.
 * 2. **The key is written before the composite exists**, and `--reveal` takes a
 *    directory plus a comma list, so scoring a round is one command.
 * 3. Composites are JPEG by default. They exist to be read by an agent, and per
 *    `CLAUDE.md` a 2560-wide PNG buys that agent nothing over a JPEG except
 *    context it then carries for the rest of its life.
 *
 * The shuffle is a full splitmix32 finalizer, not a cheap mix. The source
 * repo's first version had output bit 0 collapse to the *seed's* bit 0 — every
 * odd seed put the game on the left, across the whole 32-bit range — and a
 * round-1 judge noticed all three composites had the game on the same side.
 * `--selftest` asserts the parity correlation is gone.
 */
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROMIUM_ARGS } from './chromium.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const PLATES = path.join(ROOT, 'docs/reference/plates');

/** What the judge is never shown. Written beside the composite. */
interface AnswerKey {
  /** Set in `--control`: the PAIRING row both plates came from. */
  control?: string;
  n: number;
  composite: string;
  A: 'game' | 'reference' | 'plate-A' | 'plate-B';
  B: 'game' | 'reference' | 'plate-A' | 'plate-B';
  gameFile: string;
  refFile: string;
  seed: number;
}

/**
 * Which reference plate each of our shots is judged against.
 *
 * **Scene-matching is not politeness, it is the whole validity of the test.**
 * A judge shown our night vista beside a sunlit Duscae plain is answering "which
 * of these two scenes is prettier", which our frame loses without telling us
 * anything. Matched on time of day, subject and framing, the question becomes
 * "which of these two renders of the same kind of scene is a shipped console
 * game", which is the one `BRIEF.md` asks.
 *
 * A shot not named here falls back to `FALLBACK`; add a row rather than relying
 * on that.
 */
const PAIRING: Record<string, string[]> = {
  vista_noon: ['duscae-plains-noon-05.jpg', 'duscae-plains-lake-01.jpg'],
  vista_dawn: ['golden-hour-godrays-01.jpg', 'duscae-plains-chocobo-02.jpg'],
  vista_dusk: ['golden-hour-godrays-01.jpg', 'golden-hour-water-02.jpg'],
  vista_night: ['night-campfire-haven-01.jpg', 'night-insomnia-party-02.jpg'],
  vista_fog: ['rain-fog-prompto-03.jpg', 'duscae-thunderstorm-03.jpg'],
  vista_overcast: ['duscae-thunderstorm-03.jpg', 'duscae-wilderness-04.jpg'],
  storm: ['rain-storm-leviathan-01.jpg', 'duscae-thunderstorm-03.jpg'],
  zone_longwythe: ['duscae-wilderness-04.jpg', 'duscae-plains-noon-05.jpg'],
  zone_three_valleys: ['duscae-plains-lake-01.jpg', 'beast-party-plains-03.jpg'],
  zone_alstor: ['duscae-plains-lake-01.jpg', 'water-lake-01.jpg'],
  zone_vesperpool: ['water-lake-01.jpg', 'duscae-plains-lake-01.jpg'],
  zone_lestallum: ['town-daytime-altissia-01.jpg', 'party-roadtrip-galdin-01.jpg'],
  zone_galdin: ['party-roadtrip-galdin-01.jpg', 'water-lake-01.jpg'],
  zone_nebulawood: ['duscae-wilderness-04.jpg', 'beast-party-plains-03.jpg'],
  // Added by the vegetation lane, *before* round 5 was run rather than after
  // seeing a number. The shadows lane recorded that round 4 under-sampled its
  // own change because these two shots -- the ones where a vegetation or
  // shadow change shows most -- had no rows here at all, so six in-table shots
  // were chosen instead and four of them were bare Leide, overcast or coastal.
  // `zone_fallgrove` is a wooded slope under a high sun; `zone_vannath` is
  // scattered trees on an open plain with a mountain horizon.
  zone_fallgrove: ['duscae-wilderness-04.jpg', 'behemoth-deadeye-duscae-02.jpg'],
  zone_vannath: ['duscae-plains-lake-01.jpg', 'beast-party-plains-03.jpg'],
  hero_full: ['character-noctis-mastershot-04.jpg', 'party-three-field-02.jpg'],
  hero_closeup: ['character-noctis-face-01.jpg', 'character-ignis-face-01.jpg'],
  hero_face: ['character-noctis-face-01.jpg', 'character-gladiolus-face-01.jpg'],
  gladio_closeup: ['character-gladiolus-face-01.jpg', 'character-gladiolus-sunlit-02.jpg'],
  ignis_closeup: ['character-ignis-face-01.jpg', 'character-noctis-face-01.jpg'],
  prompto_closeup: ['character-prompto-daylight-01.jpg', 'character-noctis-face-01.jpg'],
  party_formation: ['party-four-casual-01.jpg', 'party-three-field-02.jpg'],
  party_walk: ['party-three-field-02.jpg', 'beast-party-plains-03.jpg'],
  party_dawn: ['duscae-plains-chocobo-02.jpg', 'golden-hour-godrays-01.jpg'],
  hud_field: ['combat-warpstrike-hud-02.jpg', 'hud-combat-full-01.jpg'],
  hud_night: ['hud-combat-full-01.jpg', 'combat-technique-hud-03.jpg'],
  poi_haven: ['night-campfire-haven-01.jpg', 'camp-cooking-01.jpg'],
};
const FALLBACK = ['duscae-plains-lake-01.jpg', 'duscae-wilderness-04.jpg'];

/**
 * splitmix32 finalizer. Deterministic in the seed, and every output bit depends
 * on every input bit — see the header for why that sentence is load-bearing.
 */
export function flip(seed: number): boolean {
  let s = (seed >>> 0) || 0x9e3779b9;
  s = (s + 0x9e3779b9) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x21f0aaad) >>> 0;
  s = Math.imul(s ^ (s >>> 15), 0x735a2d97) >>> 0;
  s = (s ^ (s >>> 15)) >>> 0;
  return (s & 1) === 1;
}

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

async function dataUri(file: string): Promise<string> {
  const buf = await readFile(file);
  return `data:${MIME[path.extname(file).toLowerCase()] ?? 'image/png'};base64,${buf.toString('base64')}`;
}

/**
 * The composite page.
 *
 * `object-fit: cover` crops rather than letterboxes: black bars on one panel
 * are an instant tell for which image is which and break the blind. Our
 * captures are 16:9 and so is most of the corpus, so the crop is small.
 *
 * The label strip is deliberately below both panels and identical either side.
 * A caption over the image, or a border, gives the eye something to compare
 * that is not the render.
 */
function html(leftUri: string, rightUri: string, panelW: number, panelH: number): string {
  const gap = 10, labelH = 54, totalW = panelW * 2 + gap, totalH = panelH + labelH;
  return `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${totalW}px;height:${totalH}px;background:#000;font-family:system-ui,sans-serif;overflow:hidden}
  .row{display:flex;gap:${gap}px;width:${totalW}px;height:${panelH}px}
  .panel{width:${panelW}px;height:${panelH}px;overflow:hidden;background:#000}
  .panel img{width:100%;height:100%;object-fit:cover;display:block}
  .labels{display:flex;gap:${gap}px;width:${totalW}px;height:${labelH}px}
  .lab{width:${panelW}px;height:${labelH}px;display:flex;align-items:center;justify-content:center;
       color:#fff;font-size:26px;font-weight:700;letter-spacing:.32em;background:#0b0b0d}
</style>
<div class="row">
  <div class="panel"><img src="${leftUri}"></div>
  <div class="panel"><img src="${rightUri}"></div>
</div>
<div class="labels"><div class="lab">A</div><div class="lab">B</div></div>`;
}

/** One pair to composite. */
interface Pair {
  n: number;
  game: string;
  ref: string;
  /** Set only in `--control`: both panels are plates, and this names the row. */
  control?: string;
}

async function build(argv: string[], arg: (n: string, d?: string) => string | undefined): Promise<void> {
  const out = path.resolve(arg('out', 'tmp/ab')!);
  const panelW = Number(arg('panelw', '1280'));
  const panelH = Number(arg('panelh', '720'));
  const ext = argv.includes('--png') ? 'png' : 'jpeg';
  const seed0 = Number(arg('seed', String(Date.now() % 1000000)));

  const pairs: Pair[] = [];
  const shotsDir = arg('shots');
  if (argv.includes('--control')) {
    /**
     * The calibration this tool has never had.
     *
     * `--selftest` checks the *shuffle* — seed parity and left/right balance.
     * It has never checked the **judge**. Every round so far has come back
     * "6 identified, 0 fooled", across five rounds in which four separate lanes
     * each fixed the defect the previous round named and the colour signature
     * converged onto the reference (R-B +20.0 -> +0.3). A verdict that never
     * moves while the thing it measures demonstrably improves is either a real
     * categorical gap or a saturated instrument, and nothing here can currently
     * tell those apart.
     *
     * `--control` pairs two *reference plates of the same scene family* against
     * each other and asks the identical question. Neither panel is our render.
     * A judge that is measuring anything should sit near chance and hesitate; a
     * judge that reports 6-of-6 HIGH here is answering some other question, and
     * every ranking taken from it is noise.
     *
     * This matters in this repo specifically. Five instruments were found to be
     * measuring themselves in one session — the perf ruler worst of all, at
     * correlation 0.107 with the truth and an inverted ranking. The rule that
     * came out of it is the one being applied here: before trusting a number,
     * make the instrument report on a case whose answer you already know.
     */
    let i = 0;
    for (const [shot, plates] of Object.entries(PAIRING)) {
      if (plates.length < 2 || plates[0] === plates[1]) continue;
      i += 1;
      pairs.push({
        n: i,
        game: path.join(PLATES, plates[0]),
        ref: path.join(PLATES, plates[1]),
        control: shot,
      });
    }
    if (!pairs.length) { console.error('no PAIRING row has two distinct plates'); process.exit(1); }
    console.log(`CONTROL: ${pairs.length} pairs, both panels are shipped-FFXV reference plates.`);
    console.log('Neither side is our render. Expect ~50% identification and visible hesitation.');
    console.log('A 6-of-6 HIGH result here means the judge is not measuring what we think.\n');
  } else if (shotsDir) {
    const dir = path.resolve(shotsDir);
    const names = (await readdir(dir)).filter((f) => /\.(png|jpe?g)$/i.test(f) && !f.startsWith('_')).sort();
    if (!names.length) { console.error(`no captures in ${dir}`); process.exit(1); }
    for (const [i, f] of names.entries()) {
      const shot = f.replace(/\.[^.]+$/, '');
      const options = PAIRING[shot] ?? FALLBACK;
      // Pick which of the shot's plates by the seed too, so two rounds of the
      // same shot list are not judged against an identical reference every time.
      pairs.push({ n: i + 1, game: path.join(dir, f), ref: path.join(PLATES, options[(seed0 + i) % options.length]) });
    }
  } else {
    const g = arg('game'), r = arg('ref');
    if (!g || !r) {
      console.error('usage: compare.mts --shots <dir> [--out <dir>] [--seed n]');
      console.error('       compare.mts --game <img> --ref <img> --out <dir>');
      process.exit(1);
    }
    pairs.push({ n: 1, game: path.resolve(g), ref: path.resolve(r) });
  }

  await mkdir(out, { recursive: true });
  const keys: AnswerKey[] = [];
  const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  try {
    const page = await browser.newPage({
      viewport: { width: panelW * 2 + 10, height: panelH + 54 },
      deviceScaleFactor: 1,
    });
    for (const p of pairs) {
      const seed = (seed0 + p.n * 0x9e37) >>> 0;
      const gameLeft = flip(seed);
      const file = path.join(out, `ab-${String(p.n).padStart(2, '0')}.${ext === 'jpeg' ? 'jpg' : 'png'}`);
      await page.setContent(html(
        await dataUri(gameLeft ? p.game : p.ref),
        await dataUri(gameLeft ? p.ref : p.game),
        panelW, panelH,
      ), { waitUntil: 'load' });
      await page.evaluate(() => Promise.all(
        Array.from(document.images).map((i) => (i.complete ? null : i.decode().catch(() => null))),
      ));
      await page.screenshot({ path: file, type: ext, ...(ext === 'jpeg' ? { quality: 88 } : {}) });
      keys.push({
        n: p.n, composite: path.basename(file),
        // In a control pair neither panel is our render, so the labels record
        // which *plate* sat where rather than pretending one of them is us.
        A: p.control ? 'plate-A' : (gameLeft ? 'game' : 'reference'),
        B: p.control ? 'plate-B' : (gameLeft ? 'reference' : 'game'),
        gameFile: p.game, refFile: p.ref, seed,
        ...(p.control ? { control: p.control } : {}),
      });
      console.log(`  ${path.basename(file)}   ${path.basename(p.game)}`);
    }
  } finally {
    await browser.close();
  }

  await writeFile(path.join(out, 'ANSWER-KEY.json'), JSON.stringify(keys, null, 2));
  // Deliberately does NOT print which side is which: stdout may be read by the
  // same agent that is about to judge.
  console.log(`\n${keys.length} composite(s) -> ${path.relative(ROOT, out)}`);
  console.log(`key: ${path.relative(ROOT, path.join(out, 'ANSWER-KEY.json'))}   DO NOT SHOW THE JUDGE`);
  console.log(`\nHand the judge only the ab-*.jpg files, and this question:`);
  console.log(`  "One of these two panels is a shipped PS4 game and the other is a WebGL`);
  console.log(`   demo. Which is which, how confident are you, and what gave it away?"`);
  console.log(`\nThen: node src/tools/compare.mts --reveal ${path.relative(ROOT, out)} --answers 1=A,2=B,...`);
}

/**
 * Score a round.
 *
 * The headline is not the score, it is the **hesitation rate**: the fraction of
 * pairs the judge got wrong or called a coin-flip. A judge who identifies our
 * frame every time has told us nothing except that we lost; a judge who starts
 * hesitating is the first evidence of the gap closing, and it moves before the
 * win rate does.
 */
async function reveal(arg: (n: string, d?: string) => string | undefined): Promise<void> {
  const dir = path.resolve(arg('reveal')!);
  const keyFile = dir.endsWith('.json') ? dir : path.join(dir, 'ANSWER-KEY.json');
  const keys: AnswerKey[] = JSON.parse(await readFile(keyFile, 'utf8'));
  const raw = arg('answers', '')!;
  if (!raw) { console.log(JSON.stringify(keys, null, 2)); return; }

  // "3=A" means: on pair 3 the judge said panel A is the real game. "3=?" means
  // they could not tell, which is a result, not a missing answer.
  const said = new Map<number, string>();
  for (const tok of raw.split(',')) {
    const [n, v] = tok.split('=');
    said.set(Number(n.trim()), String(v ?? '').trim().toUpperCase());
  }

  let identified = 0, fooled = 0, unsure = 0;
  console.log('pair  our shot                        judge said   was          verdict');
  console.log('-'.repeat(78));
  for (const k of keys) {
    const a = said.get(k.n);
    if (!a) continue;
    const shot = path.basename(k.gameFile).replace(/\.[^.]+$/, '');
    if (a === '?') {
      unsure++;
      console.log(`${String(k.n).padStart(4)}  ${shot.padEnd(32)}${'could not tell'.padEnd(13)}${''.padEnd(13)}HESITATED`);
      continue;
    }
    const picked = a === 'A' ? k.A : k.B;
    // The judge is asked which panel is the SHIPPED GAME. Picking the reference
    // means they identified us; picking ours means we passed for shipped.
    const ok = picked === 'reference';
    if (ok) identified++; else fooled++;
    console.log(`${String(k.n).padStart(4)}  ${shot.padEnd(32)}${a.padEnd(13)}${picked.padEnd(13)}${ok ? 'identified us' : 'FOOLED THE JUDGE'}`);
  }
  const n = identified + fooled + unsure;
  console.log('-'.repeat(78));
  console.log(`n=${n}   identified ${identified}   fooled ${fooled}   hesitated ${unsure}`);
  console.log(`hesitation rate ${(100 * (fooled + unsure) / Math.max(n, 1)).toFixed(0)}%  <- track this across rounds; it moves before the win rate does`);
  console.log(`\npaired frames:`);
  for (const k of keys) if (said.has(k.n)) console.log(`  ${k.n}: ${path.basename(k.gameFile)}  vs  ${path.basename(k.refFile)}`);
}

/**
 * Assert the shuffle is not guessable from the seed, which is the one property
 * that makes any of this blind. Cheap enough to run inline; it is a gate.
 */
function selftest(): void {
  let sameParity = 0;
  const N = 100000;
  for (let s = 0; s < N; s++) if (flip(s) === ((s & 1) === 1)) sameParity++;
  const rate = sameParity / N;
  const ok = Math.abs(rate - 0.5) < 0.01;
  let left = 0;
  for (let s = 0; s < N; s++) if (flip((s * 0x9e37) >>> 0)) left++;
  const balance = left / N;
  const ok2 = Math.abs(balance - 0.5) < 0.01;
  console.log(`seed-parity correlation ${(rate * 100).toFixed(2)}% (want 50.00) -> ${ok ? 'PASS' : 'FAIL'}`);
  console.log(`left/right balance      ${(balance * 100).toFixed(2)}% (want 50.00) -> ${ok2 ? 'PASS' : 'FAIL'}`);
  process.exit(ok && ok2 ? 0 : 1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (n: string, d?: string): string | undefined => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
  };
  if (argv.includes('--selftest')) return selftest();
  if (argv.includes('--reveal')) return reveal(arg);
  return build(argv, arg);
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });

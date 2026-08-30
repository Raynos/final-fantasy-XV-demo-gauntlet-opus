#!/usr/bin/env node
/**
 * Band-limited detail energy in a region of an image.
 *
 *   node src/tools/reliefstat.mts "tmp/shots/x/*.png"
 *   node src/tools/reliefstat.mts a.png --roi 0.1,0.6,0.8,0.35
 *   node src/tools/reliefstat.mts a.png            # the FFXV ground plates are ALWAYS the reference
 *
 * **Why this exists.** `imagestats.mts` measures twelve *global* statistics —
 * colour, exposure, saturation, clipping. Every one of them can be exactly on
 * the reference while the frame still reads as a flat brown carpet, and in this
 * project that is precisely what happened: the atmosphere lane landed the whole
 * colour signature on `FFXV-field` (R-B +0.6, sat +3.2, stops +0.22) in the same
 * week the blind judge ranked terrain material as the game's number one defect,
 * saying "smooth vertex-coloured brown lumps at every distance — no detail
 * normal, no roughness variation, no strata, no erosion".
 *
 * A colour statistic cannot see that, because it is a statement about *where*
 * contrast sits in the frame, not about how much of it there is. This tool
 * measures that directly: a Laplacian pyramid over the luminance of a region,
 * reporting RMS contrast per octave as a percentage of the region's mean luma.
 *
 *   d1  d2  d4  d8  d16  d32  d64
 *
 * `d8` is "how much contrast lives at features about 8 px across". A uniform
 * procedural mottle has energy at `d1`-`d2` and almost none above `d8`. Real
 * terrain — rock with strata, scree, drainage, patches of cover — has energy in
 * every band, and the middle bands are where the eye reads *material* rather
 * than noise. `tot` is the RMS across all bands.
 *
 * Two things this deliberately does NOT do:
 *
 *  - It is not scale-invariant across resolutions. A 1600x900 capture and a
 *    1920x1080 plate put the same world feature in different pixel bands. Both
 *    are within 20% here so the bands still line up, but do not compare a
 *    thumbnail against a full frame.
 *  - It is blind to *what* the contrast is. Aliasing, dither and JPEG mosquito
 *    noise all read as `d1` energy. Read `d1` as a warning, `d4`-`d16` as the
 *    signal. Our captures are PNG and the plates are JPEG, so the reference's
 *    `d1` is if anything understated -- never claim a win on `d1` alone.
 *
 * The default ROI is the bottom-middle of the frame — the ground band, which is
 * what this tool was built to grade — and the reference subsets below crop the
 * same fraction out of the plates so the two are comparable.
 */
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { withBlankPage } from './harness.mts';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

/** Feature size in pixels for each pyramid band. */
const BANDS = [1, 2, 4, 8, 16, 32, 64];

export interface Relief {
  /** RMS contrast per octave, percent of region mean luma. */
  d: number[];
  /** RMS across every band. */
  tot: number;
  /** Region mean luma, 0-255. */
  meanL: number;
}

interface Row extends Relief { file: string }

/** Fractional ROI: x, y, w, h in 0..1 of the image. */
type Roi = [number, number, number, number];

/** Bottom-centre of the frame: the ground, which is what this grades. */
const GROUND_ROI: Roi = [0.14, 0.60, 0.72, 0.36];

/**
 * Reference plates whose lower band is ground rather than water, road or a
 * character's back. Deliberately a subset of `imagestats`' `FFXV-field`: three
 * of those ten put a lake, a car or Noctis across the whole bottom of frame,
 * and a flat sheet of water would drag the target down for the wrong reason.
 */
const GROUND_PLATES = [
  'beast-party-plains-03', 'behemoth-deadeye-duscae-02', 'camp-cooking-01',
  'duscae-plains-noon-05', 'duscae-wilderness-04', 'party-three-field-02',
];

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/**
 * Runs inside the page: decode, crop, and take a Laplacian pyramid of luma.
 *
 * The downsample is a 2x2 box, so band `k` is the difference between a surface
 * filtered at 2^k px and one filtered at 2^(k+1) px — energy at features about
 * 2^k across. The upsample is nearest rather than bilinear on purpose: bilinear
 * would leak a fraction of each band into the one below it, and the whole point
 * is to be able to say "there is nothing at 16 px".
 */
async function pageRelief(args: { uri: string, roi: Roi }): Promise<Relief> {
  const img = new Image();
  img.src = args.uri;
  await img.decode();
  const [rx, ry, rw, rh] = args.roi;
  const W = Math.max(1, Math.round(img.naturalWidth * rw));
  const H = Math.max(1, Math.round(img.naturalHeight * rh));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, Math.round(img.naturalWidth * rx), Math.round(img.naturalHeight * ry), W, H, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;

  let lvl = new Float32Array(W * H);
  let lw = W, lh = H;
  let mean = 0;
  for (let i = 0, p = 0; i < lvl.length; i++, p += 4) {
    const y = 0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2];
    lvl[i] = y; mean += y;
  }
  mean /= lvl.length;

  const bands = 7;
  const d: number[] = [];
  for (let k = 0; k < bands; k++) {
    const dw = Math.max(1, lw >> 1), dh = Math.max(1, lh >> 1);
    const down = new Float32Array(dw * dh);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const x0 = Math.min(lw - 1, x * 2), x1 = Math.min(lw - 1, x * 2 + 1);
        const y0 = Math.min(lh - 1, y * 2), y1 = Math.min(lh - 1, y * 2 + 1);
        down[y * dw + x] = 0.25 * (lvl[y0 * lw + x0] + lvl[y0 * lw + x1] + lvl[y1 * lw + x0] + lvl[y1 * lw + x1]);
      }
    }
    let s2 = 0;
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        const e = lvl[y * lw + x] - down[Math.min(dh - 1, y >> 1) * dw + Math.min(dw - 1, x >> 1)];
        s2 += e * e;
      }
    }
    d.push(Math.sqrt(s2 / (lw * lh)));
    lvl = down; lw = dw; lh = dh;
  }

  const norm = Math.max(mean, 1);
  let t2 = 0;
  for (const v of d) t2 += v * v;
  return { d: d.map((v) => 100 * v / norm), tot: 100 * Math.sqrt(t2) / norm, meanL: mean };
}

async function measure(files: string[], roi: Roi): Promise<Row[]> {
  const rows: Row[] = [];
  await withBlankPage({ agent: 'reliefstat', lane: 'sweep' }, async (page) => {
    for (const f of files) {
      const buf = await readFile(f);
      const mime = MIME[path.extname(f).toLowerCase()] ?? 'image/png';
      const uri = `data:${mime};base64,${buf.toString('base64')}`;
      const r = await page.evaluate(pageRelief, { uri, roi });
      rows.push({ file: path.basename(f), ...r });
    }
  });
  return rows;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
};

function medianRow(rows: Row[]): Relief {
  return {
    d: BANDS.map((_, i) => median(rows.map((r) => r.d[i]))),
    tot: median(rows.map((r) => r.tot)),
    meanL: median(rows.map((r) => r.meanL)),
  };
}

function fmt(label: string, s: Relief, w: number): string {
  let line = label.slice(0, w).padEnd(w);
  for (const v of s.d) line += v.toFixed(2).padStart(8);
  line += s.tot.toFixed(2).padStart(9) + s.meanL.toFixed(1).padStart(8);
  return line;
}

/** Expand one shell glob of the form `dir/pattern`. */
function expand(pattern: string): string[] {
  if (!pattern.includes('*')) return [pattern];
  const dir = path.dirname(pattern);
  const rx = new RegExp('^' + path.basename(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return readdirSync(dir).filter((f) => rx.test(f)).sort().map((f) => path.join(dir, f));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (n: string): string | undefined => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const roiArg = arg('--roi');
  const roi: Roi = roiArg ? (roiArg.split(',').map(Number) as Roi) : GROUND_ROI;
  // Skip the value after ANY flag, not just after `--roi`. The narrow version
  // of this line meant the invocation on line 7 of this file's own header --
  // `reliefstat.mts a.png --against FFXV-field-ground` -- handed
  // `FFXV-field-ground` to the file list and died in `open()`, twenty-two
  // minutes deep in the daemon queue, twice.
  const files = argv.filter((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1]!.startsWith('--')))
    .flatMap(expand);

  /**
   * **Reject a flag this tool does not implement, rather than ignore it.**
   *
   * `--against` was never read. The reference is `GROUND_PLATES` and it is
   * computed unconditionally, so the flag was *accepted and ignored* -- the
   * worst of the three options, and strictly worse than the crash that used to
   * precede it. A crash tells you. Fixing only the crash left a documented
   * invocation that runs, prints a comparison, and compares against something
   * other than what its own command line says.
   *
   * Two places in this repo still carry `reliefstat … --against
   * FFXV-field-ground` -- `docs/plans/2026-08-30-fable-to-nine.md:1246` and
   * `project/handoff/lane5-terrain-light.md:137` -- and both are *proposed next
   * steps* rather than recorded results, so nothing measured in this repo rests
   * on the flag. That was checked by grep before this landed, and it is the
   * only reason removing it is safe rather than invalidating.
   *
   * Not implemented, because implementing it would mean a labelled corpus store
   * like `imagestats`' and there is exactly one reference set worth having here:
   * the six plates whose lower band is ground rather than lake, road or a
   * character's back. That set is printed on its own row, named, in every run.
   */
  const AGAINST = argv.indexOf('--against');
  if (AGAINST >= 0) {
    console.error(`reliefstat has no --against: the reference is ALWAYS the ${GROUND_PLATES.length} FFXV ground`);
    console.error('plates, computed unconditionally and printed as the `FFXV-ground` row. The flag');
    console.error('used to be accepted and silently ignored, so a run that named a reference set');
    console.error('compared against a different one. Drop it. (`imagestats.mts` DOES have');
    console.error('--against, over labelled corpora it saves; that is the tool you want if you');
    console.error('need to compare against something else.)');
    process.exit(2);
  }
  const unknown = argv.filter((a) => a.startsWith('--') && a !== '--roi');
  if (unknown.length) {
    console.error(`unknown flag(s): ${unknown.join(' ')}`);
    console.error('usage: node src/tools/reliefstat.mts "tmp/shots/x/*.png" [--roi x,y,w,h]');
    process.exit(2);
  }

  if (!files.length) {
    console.error('usage: node src/tools/reliefstat.mts "tmp/shots/x/*.png" [--roi x,y,w,h]');
    process.exit(2);
  }

  const rows = await measure(files, roi);
  const w = 28;
  let head = 'file'.padEnd(w);
  for (const b of BANDS) head += `d${b}`.padStart(8);
  head += 'tot'.padStart(9) + 'meanL'.padStart(8);
  console.log(`ROI ${roi.join(',')} of each image, contrast as % of region mean luma`);
  console.log(head);
  console.log('-'.repeat(head.length));
  for (const r of rows) console.log(fmt(r.file, r, w));
  if (rows.length > 1) {
    console.log('-'.repeat(head.length));
    console.log(fmt(`MEDIAN (n=${rows.length})`, medianRow(rows), w));
  }

  const plates = GROUND_PLATES.map((n) => path.join(ROOT, 'docs/reference/plates', `${n}.jpg`));
  const ref = medianRow(await measure(plates, roi));
  console.log(fmt(`FFXV-ground (n=${plates.length})`, ref, w));
  const me = rows.length > 1 ? medianRow(rows) : rows[0];
  const delta: Relief = {
    d: ref.d.map((v, i) => me.d[i] - v),
    tot: me.tot - ref.tot,
    meanL: me.meanL - ref.meanL,
  };
  console.log(fmt('DELTA', delta, w));
  console.log('');
  for (let i = 2; i <= 5; i++) {
    const r = me.d[i] / Math.max(ref.d[i], 1e-6);
    const verdict = r < 0.7 ? 'OFF ' : r > 1.6 ? 'HOT ' : 'ok  ';
    console.log(`${verdict} d${BANDS[i]}  ${me.d[i].toFixed(2)} vs ${ref.d[i].toFixed(2)} — ${(100 * r).toFixed(0)}% of the reference's contrast at ${BANDS[i]} px features`);
  }
}

main();

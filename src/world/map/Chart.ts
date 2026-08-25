import { worldMap, WORLD } from './WorldMap.ts';
import type { Biome, ZoneWeights } from './WorldMap.ts';
import type { Terrain } from '../Terrain.ts';
import { bakedBytes } from '../../engine/TexBake.ts';

/**
 * THE CHART OF LUCIS — a baked relief map of the whole continent.
 *
 * The terrain already exists on the CPU as a 2048² elevation grid at 4 m per
 * cell (`Terrain.field.h`), aligned exactly to the playable square. That grid
 * *is* the digital elevation model, so the chart is baked straight out of it:
 * one pass, no resampling, no per-frame heightfield queries at all. Both the
 * minimap and the world-map screen blit the same image, which is why the two
 * always agree about where a ridge is.
 *
 * What the bake does, in the order a cartographer would:
 *
 *   1. **Relief shading** — a two-light hillshade (raking key from the
 *      north-west, the convention since Swiss topographic sheets, plus a weak
 *      south-east fill so shadowed faces never go to mud) over a 16 m gradient
 *      baseline, which drops erosion runnels and keeps the landforms.
 *   2. **Local relief** — ridges lifted and hollows sunk against a 96 m
 *      blurred surface. This is the trick that makes a printed relief map look
 *      three-dimensional rather than merely striped.
 *   3. **Elevation and biome tint** — sand strand, badland ochre, Duscae
 *      green, cool grey rock, pale highland, volcanic ash. Regional colour
 *      comes from the same zone table the terrain shader reads, so the chart
 *      is ochre exactly where Leide is ochre.
 *   4. **Water** — anything under the water plane, ramped from turquoise
 *      shoal to deep navy, with a pale hairline coast.
 *   5. **Drainage** — the terrain's own flow accumulation channel drawn as
 *      watercourses, which is what gives the sheet its fine branching detail.
 *   6. **Contours** — 40 m minor and 200 m index lines, anti-aliased by the
 *      local gradient so they stay one hairline wide on a cliff and a wide
 *      soft band on a plain.
 *   7. **Paper** — a deterministic grain and a soft frontier falloff so the
 *      sheet fades out at the edge of the world rather than being guillotined.
 *
 * Everything here is deterministic: same terrain in, byte-identical chart out.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ss = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Chart palette. Muted on purpose — pale UI type has to survive on top. */
const P = {
  strand: [128, 120, 100],   // beach / dry lake margin
  dry: [122, 100, 70],       // Leide badland ochre
  wet: [74, 84, 62],         // Duscae green
  mid: [100, 98, 88],        // generic upland soil
  rock: [96, 102, 110],      // cool bare rock
  high: [142, 154, 168],     // pale highland / crown of a peak
  ash: [70, 66, 62],         // Ravatogh ash field
  shoal: [44, 96, 106],      // turquoise shallows
  sea: [16, 40, 58],
  deep: [7, 20, 32],
  duscae: [70, 88, 56],      // the green basin
  cleigne: [86, 98, 100],    // the cool highland reach
  river: [54, 92, 112],
  coast: [186, 216, 236],
};

/** Cool the shadows, warm the lights — the whole reason it reads as painted. */
const SHADOW = [26, 38, 56];
const LIGHT = [252, 240, 214];

/** How big to bake the chart. Omit and it matches the heightfield grid. */
export interface ChartOpts {
  /** Side of the square image, px. */
  size?: number;
}

/**
 * A baked chart. `canvas` is the image; the rest is the projection and the
 * source data other map layers reuse.
 */
export class Chart {
  height!: Float32Array;
  water!: Uint8Array;
  canvas!: HTMLCanvasElement;
  ms!: number;
  ppm!: number;
  size!: number;
  constructor(canvas: HTMLCanvasElement, ppm: number, size: number, height: Float32Array, water: Uint8Array, ms: number) {
    this.canvas = canvas;
    /** Canvas pixels per world metre. */
    this.ppm = ppm;
    /** Side of the square image, px. */
    this.size = size;
    /** Elevation grid the chart was baked from (row-major, z-major). */
    this.height = height;
    /** 1 where the cell is under the water plane. */
    this.water = water;
    /** Milliseconds the bake took. */
    this.ms = ms;
  }

  /** World x -> chart px. */
  toPx(x: number) { return (x + WORLD.half) * this.ppm; }
  /** World z -> chart px. */
  toPz(z: number) { return (z + WORLD.half) * this.ppm; }

  /** Elevation at a world position, straight off the baked grid. */
  heightAt(x: number, z: number) {
    const i = Math.round(this.toPx(x)), j = Math.round(this.toPz(z));
    if (i < 0 || j < 0 || i >= this.size || j >= this.size) return 0;
    return this.height[j * this.size + i];
  }

  /** True if this world position is under the water plane. */
  isWater(x: number, z: number) {
    const i = Math.round(this.toPx(x)), j = Math.round(this.toPz(z));
    if (i < 0 || j < 0 || i >= this.size || j >= this.size) return false;
    return !!this.water[j * this.size + i];
  }
}

let _chart: Chart | null = null;
let _chartFor: Terrain | null | undefined = null;

/**
 * The shared chart. Built on first call and reused for the lifetime of the
 * terrain — three separate map surfaces ask for it and only one gets baked.
 * @param terrain the live `Terrain` system
 */
export function getChart(terrain: Terrain | null | undefined, opt?: ChartOpts): Chart {
  if (_chart && _chartFor === terrain) return _chart;
  _chart = bakeChart(terrain, opt);
  _chartFor = terrain;
  return _chart;
}

/**
 * Rasterise the world into one relief chart.
 * @param terrain the live `Terrain` system
 */
export function bakeChart(terrain: Terrain | null | undefined, opt: ChartOpts = {}): Chart {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  const field = terrain && terrain.field && terrain.field.h ? terrain.field : null;
  const size = opt.size || (field ? field.N : 1024);
  const mPerPx = WORLD.size / size;
  const ppm = 1 / mPerPx;

  // ---- elevation ---------------------------------------------------------
  let H;
  if (field && field.N === size) {
    H = field.h;                                   // the terrain's own DEM
  } else {
    H = new Float32Array(size * size);
    for (let j = 0; j < size; j++) {
      const z = -WORLD.half + (j + 0.5) * mPerPx;
      for (let i = 0; i < size; i++) {
        H[j * size + i] = terrain ? terrain.heightAt(-WORLD.half + (i + 0.5) * mPerPx, z) : 0;
      }
    }
  }
  const ctrl = field && field.ctrl && field.N === size ? field.ctrl : null;

  // ---- the raster, from the bake when one is resident --------------------
  //
  // Every pixel of the sheet is a pure function of the elevation grid, the
  // control planes and the zone table — the same shape as a generated texture,
  // and 458 ms of a 6.7 s cold boot. `TexBake` serves both planes.
  //
  // The water mask is one byte a pixel, so it is stored through a half-width
  // entry: `(size/2)^2` RGBA texels is exactly `size^2` bytes. The container
  // indexes on width and height and never looks at the bytes, so this needs no
  // format change — only an even `size`, which a heightfield grid always is.
  //
  // `raster` is memoised across the two lookups so a miss on either plane
  // rasterises once rather than twice.
  let raster: { d: Uint8ClampedArray, water: Uint8Array } | null = null;
  const run = () => (raster ||= rasterChart(H, ctrl, size, mPerPx, ppm));
  const cacheable = size % 2 === 0;
  const rgba = cacheable
    ? bakedBytes(`map/chart/rgba@${size}`, size, size,
      () => new Uint8Array(run().d.buffer))
    : new Uint8Array(run().d.buffer);
  const water = cacheable
    ? bakedBytes(`map/chart/water@${size}`, size >> 1, size >> 1, () => run().water)
    : run().water;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d')!;
  const img = c.createImageData(size, size);
  img.data.set(rgba);
  c.putImageData(img, 0, 0);
  const ms = now() - t0;
  return new Chart(canvas, ppm, size, H, water, ms);
}

/**
 * Rasterise the sheet: every pixel of the chart, and the water mask.
 *
 * Split out of {@link bakeChart} because it is the whole cost — 458 ms of
 * cold boot at 2048^2 — and because it touches no DOM. That makes it
 * cacheable through `TexBake` exactly like a generated texture, and lets
 * `src/tools/texbake.mts` run it under Node against the terrain artifact.
 *
 * @param H the elevation grid, `size^2`, row-major
 * @param ctrl the terrain's control planes, or null when the grid is resampled
 * @param size side of the square image, px
 * @param mPerPx metres per pixel
 * @param ppm pixels per metre
 */
function rasterChart(H: Float32Array, ctrl: Uint8Array | null, size: number, mPerPx: number, ppm: number) {
  const SEA = WORLD.seaLevel;

  // ---- local relief: elevation against a 96 m blurred surface -------------
  // Built on a 16 m coarse grid, which is all the smoothness this needs and a
  // sixteenth of the work.
  const CN = size >> 2;
  const coarse = new Float32Array(CN * CN);
  for (let j = 0; j < CN; j++) {
    for (let i = 0; i < CN; i++) {
      let s = 0;
      for (let b = 0; b < 4; b++) {
        const row = ((j * 4 + b) * size) + i * 4;
        s += H[row] + H[row + 1] + H[row + 2] + H[row + 3];
      }
      coarse[j * CN + i] = s * 0.0625;
    }
  }
  const blurred = boxBlur2D(coarse, CN, 6);

  // ---- macro relief shading ----------------------------------------------
  // A hillshade of the 96 m smoothed surface. Mixed under the fine shading it
  // is what turns a mountain into a lit mass instead of a field of scratches:
  // the fine pass alone reads as steel wool at continental scale, because the
  // ridged noise the terrain is built from is only tens of metres wide.
  const macro = new Float32Array(CN * CN);
  const macroSlope = new Float32Array(CN * CN);
  const CM = mPerPx * 4;                                  // 16 m per coarse cell
  for (let j = 0; j < CN; j++) {
    const jm = (j > 0 ? j - 1 : 0) * CN, jp = (j < CN - 1 ? j + 1 : CN - 1) * CN;
    for (let i = 0; i < CN; i++) {
      const im = i > 0 ? i - 1 : 0, ip = i < CN - 1 ? i + 1 : CN - 1;
      const gx = (blurred[j * CN + ip] - blurred[j * CN + im]) / (2 * CM);
      const gz = (blurred[jp + i] - blurred[jm + i]) / (2 * CM);
      const len = 1 / Math.sqrt(1 + gx * gx + gz * gz);
      const nx = -gx * len, ny = len, nz = -gz * len;
      const key = Math.max(0, nx * -0.55 + ny * 0.62 + nz * -0.56);
      const fill = Math.max(0, nx * 0.48 + ny * 0.50 + nz * 0.72);
      macro[j * CN + i] = clamp01(0.15 + 0.62 * key + 0.13 * fill);
      macroSlope[j * CN + i] = Math.hypot(gx, gz);
    }
  }

  // ---- region fields on a 64 m lattice, interpolated per pixel -----------
  // Moisture drives dry-to-green; the two region weights carry the identity of
  // Duscae and Cleigne, so the sheet is ochre over Leide, green over the basin
  // and cool grey over the highland reach — the same three-region read the
  // game itself has, taken from the same zone table.
  const MN = (size >> 4) + 1;
  const moistG = new Float32Array(MN * MN);
  const greenG = new Float32Array(MN * MN);
  const coolG = new Float32Array(MN * MN);
  const bio: Partial<Biome> = {};
  const wts: ZoneWeights = {};
  for (let j = 0; j < MN; j++) {
    const z = -WORLD.half + j * 16 * mPerPx;
    for (let i = 0; i < MN; i++) {
      const x = -WORLD.half + i * 16 * mPerPx;
      moistG[j * MN + i] = worldMap.biomeAt(x, z, bio).moist;
      worldMap.zoneWeights(x, z, wts);
      let gr = 0, co = 0;
      for (const id in wts) {
        const zn = worldMap.zoneById.get(id);
        if (!zn) continue;
        if (zn.region === 'duscae') gr += wts[id as keyof typeof wts];
        else if (zn.region === 'cleigne') co += wts[id as keyof typeof wts];
      }
      greenG[j * MN + i] = gr;
      coolG[j * MN + i] = co;
    }
  }

  // The raster writes into a **`Uint8ClampedArray`**, and that is not
  // cosmetic: `d[o] = r + grain` relies on clamping and round-half-to-even
  // at every one of 4.2 million texels. A plain `Uint8Array` wraps and
  // truncates instead, which would change the sheet wherever a channel
  // rounds a tie or the grain pushes past an end. The bake stores the same
  // bytes through a `Uint8Array` view of the same buffer — a reinterpret,
  // not a conversion.
  const d = new Uint8ClampedArray(size * size * 4);
  const water = new Uint8Array(size * size);

  // Light directions. North is -Z, so the classic north-west raking key is
  // (-x, -z); the fill comes from the south-east at a shallower angle.
  const KX = -0.55, KY = 0.62, KZ = -0.56;
  const FX = 0.48, FY = 0.50, FZ = 0.72;
  const G = 4 * mPerPx;                     // 16 m gradient baseline (4 px apart)

  for (let j = 0; j < size; j++) {
    const jm2 = (j > 1 ? j - 2 : 0) * size, jp2 = (j < size - 2 ? j + 2 : size - 1) * size;
    const jm1 = (j > 0 ? j - 1 : 0) * size, jp1 = (j < size - 1 ? j + 1 : size - 1) * size;
    const row = j * size;
    const mv = j / 16, mj = Math.min(MN - 2, mv | 0), mtz = mv - mj;
    for (let i = 0; i < size; i++) {
      const im2 = i > 1 ? i - 2 : 0, ip2 = i < size - 2 ? i + 2 : size - 1;
      const im1 = i > 0 ? i - 1 : 0, ip1 = i < size - 1 ? i + 1 : size - 1;
      const h = H[row + i];

      // gradient over a 16 m baseline: landforms, not erosion runnels
      const gx = (H[row + ip2] - H[row + im2]) / G;
      const gz = (H[jp2 + i] - H[jm2 + i]) / G;
      const len = 1 / Math.sqrt(1 + gx * gx + gz * gz);
      const nx = -gx * len, ny = len, nz = -gz * len;
      const slope = Math.hypot(gx, gz);

      let key = nx * KX + ny * KY + nz * KZ;
      if (key < 0) key = 0;
      let fill = nx * FX + ny * FY + nz * FZ;
      if (fill < 0) fill = 0;

      // local relief: ridge crests pick up light, hollows fall away
      const rel = h - sampleBilinear(blurred, CN, (i + 0.5) * 0.25, (j + 0.5) * 0.25);
      const relT = clamp01(rel / 46) - clamp01(-rel / 46);

      // Level ground has to land near the middle of the range, or every plain
      // burns out white and only the shadowed faces carry any colour at all.
      const fine = 0.15 + 0.62 * key + 0.13 * fill;
      const cx = (i + 0.5) * 0.25 - 0.5, cz = (j + 0.5) * 0.25 - 0.5;
      const mac = sampleBilinear(macro, CN, cx, cz);
      let shade = 0.62 * mac + 0.38 * fine + 0.10 * relT;
      // cliffs read as a hard edge rather than a smooth ramp
      shade -= 0.12 * ss(0.8, 2.2, slope) * (1 - key);
      shade = clamp01(shade);

      // ---- colour ------------------------------------------------------
      let r, g, b;
      if (h < SEA) {
        water[row + i] = 1;
        const dep = clamp01((SEA - h) / 26);
        const dep2 = clamp01((SEA - h) / 90);
        r = mix(P.shoal[0], P.sea[0], dep); g = mix(P.shoal[1], P.sea[1], dep); b = mix(P.shoal[2], P.sea[2], dep);
        r = mix(r, P.deep[0], dep2); g = mix(g, P.deep[1], dep2); b = mix(b, P.deep[2], dep2);
        // a whisper of the drowned floor's relief keeps basins from going flat
        const k = 0.86 + 0.26 * key;
        r *= k; g *= k; b *= k;
      } else {
        const mi = Math.min(MN - 2, (i / 16) | 0), mtx = i / 16 - mi;
        const m0 = moistG[mj * MN + mi], m1 = moistG[mj * MN + mi + 1];
        const m2 = moistG[(mj + 1) * MN + mi], m3 = moistG[(mj + 1) * MN + mi + 1];
        const moist = mix(mix(m0, m1, mtx), mix(m2, m3, mtx), mtz);
        const rocky = ctrl ? ctrl[(row + i) * 4 + 3] / 255 : ss(0.3, 1.1, slope);

        const wetT = ss(0.30, 0.78, moist);
        let lr = mix(P.dry[0], P.wet[0], wetT);
        let lg = mix(P.dry[1], P.wet[1], wetT);
        let lb = mix(P.dry[2], P.wet[2], wetT);

        // regional identity on top of the moisture ramp
        const g0 = greenG[mj * MN + mi], g1 = greenG[mj * MN + mi + 1];
        const g2 = greenG[(mj + 1) * MN + mi], g3 = greenG[(mj + 1) * MN + mi + 1];
        const green = ss(0.22, 0.74, mix(mix(g0, g1, mtx), mix(g2, g3, mtx), mtz)) * 0.50;
        const c0 = coolG[mj * MN + mi], c1 = coolG[mj * MN + mi + 1];
        const c2 = coolG[(mj + 1) * MN + mi], c3 = coolG[(mj + 1) * MN + mi + 1];
        const cool = ss(0.22, 0.74, mix(mix(c0, c1, mtx), mix(c2, c3, mtx), mtz)) * 0.54;
        lr = mix(lr, P.duscae[0], green); lg = mix(lg, P.duscae[1], green); lb = mix(lb, P.duscae[2], green);
        lr = mix(lr, P.cleigne[0], cool); lg = mix(lg, P.cleigne[1], cool); lb = mix(lb, P.cleigne[2], cool);

        // strand: the first few metres above the water line go sandy
        const st = 1 - ss(1.5, 22, h - SEA);
        lr = mix(lr, P.strand[0], st); lg = mix(lg, P.strand[1], st); lb = mix(lb, P.strand[2], st);

        const up = ss(90, 260, h);
        r = mix(lr, P.mid[0], up); g = mix(lg, P.mid[1], up); b = mix(lb, P.mid[2], up);

        // Bare rock follows the *macro* slope, not the fine one. Leide is a
        // field of metre-scale fins; greying every one of them turns the sheet
        // into steel wool, while greying the massifs is what a relief map does.
        const mslope = sampleBilinear(macroSlope, CN, cx, cz);
        const bare = clamp01(rocky * 0.42 + ss(0.30, 1.00, mslope) * 0.85);
        r = mix(r, P.rock[0], bare); g = mix(g, P.rock[1], bare); b = mix(b, P.rock[2], bare);

        const crown = ss(400, 640, h);
        r = mix(r, P.high[0], crown); g = mix(g, P.high[1], crown); b = mix(b, P.high[2], crown);

        const ashT = ss(0.72, 1.0, rocky) * (1 - ss(0.10, 0.34, moist)) * ss(200, 400, h);
        r = mix(r, P.ash[0], ashT * 0.75); g = mix(g, P.ash[1], ashT * 0.75); b = mix(b, P.ash[2], ashT * 0.75);

        // Ground texture. Two octaves of lattice noise at 20 m and 70 m, a few
        // per cent either way: without it a plain bakes out as a dead flat
        // colour field and the chart stops looking like paper.
        const tex = 1 + (0.58 * lnoise(i, j, 4) + 0.42 * lnoise(i + 37, j + 11, 15) - 0.5) * 0.24;
        r *= tex; g *= tex; b *= tex;

        // drainage: the terrain's own flow accumulation, drawn as watercourses
        if (ctrl) {
          const flow = ctrl[(row + i) * 4] / 255;
          const riv = ss(0.66, 0.95, flow) * (1 - ss(0.6, 1.5, slope));
          r = mix(r, P.river[0], riv * 0.45); g = mix(g, P.river[1], riv * 0.45); b = mix(b, P.river[2], riv * 0.45);
        }
      }

      // ---- light -------------------------------------------------------
      const lit = clamp01((shade - 0.62) * 2.2);
      const dark = clamp01((0.5 - shade) * 2.0);
      const k = 0.28 + 1.06 * shade;
      r *= k; g *= k; b *= k;
      r = mix(r, SHADOW[0], dark * 0.42); g = mix(g, SHADOW[1], dark * 0.42); b = mix(b, SHADOW[2], dark * 0.42);
      r = mix(r, LIGHT[0], lit * 0.10); g = mix(g, LIGHT[1], lit * 0.10); b = mix(b, LIGHT[2], lit * 0.10);

      // ---- contours ----------------------------------------------------
      if (h > SEA) {
        // a lightly averaged elevation, so a 40 m line is a line and not lace
        const hs = 0.44 * h + 0.14 * (H[row + im1] + H[row + ip1] + H[jm1 + i] + H[jp1 + i]);
        const gpx = Math.max(1e-3, Math.hypot(
          (H[row + ip1] - H[row + im1]) * 0.5, (H[jp1 + i] - H[jm1 + i]) * 0.5));
        const band = 40, index = 200;
        let cf = hs / band;
        let dist = Math.abs(cf - Math.round(cf)) * band / gpx;      // px to the line
        const minor = clamp01(1 - dist / 0.9) * 0.07;
        cf = hs / index;
        dist = Math.abs(cf - Math.round(cf)) * index / gpx;
        const major = clamp01(1 - dist / 1.15) * 0.15;
        const line = (minor + major) * (1 - ss(1.6, 3.4, slope));
        if (line > 0.001) {
          r = mix(r, 226, line * 0.55); g = mix(g, 236, line * 0.55); b = mix(b, 246, line * 0.55);
          r = mix(r, 12, line * 0.45); g = mix(g, 18, line * 0.45); b = mix(b, 26, line * 0.45);
        }
      }

      // ---- paper -------------------------------------------------------
      const grain = (hash2(i, j) - 0.5) * 5;
      const o = (row + i) * 4;
      d[o] = r + grain;
      d[o + 1] = g + grain;
      d[o + 2] = b + grain;
      d[o + 3] = 255;
    }
  }

  // ---- coastline: a pale hairline wherever land meets water --------------
  for (let j = 1; j < size - 1; j++) {
    const row = j * size;
    for (let i = 1; i < size - 1; i++) {
      const w = water[row + i];
      if (w) continue;
      if (water[row + i - 1] || water[row + i + 1] || water[row - size + i] || water[row + size + i]) {
        const o = (row + i) * 4;
        d[o] = mix(d[o], P.coast[0], 0.55);
        d[o + 1] = mix(d[o + 1], P.coast[1], 0.55);
        d[o + 2] = mix(d[o + 2], P.coast[2], 0.55);
      }
    }
  }

  // ---- frontier falloff --------------------------------------------------
  const FADE = 300 * ppm;
  for (let j = 0; j < size; j++) {
    const ej = Math.min(j, size - 1 - j) / FADE;
    const row = j * size;
    for (let i = 0; i < size; i++) {
      const e = Math.min(ej, Math.min(i, size - 1 - i) / FADE);
      if (e >= 1) continue;
      const t = clamp01(e);
      d[(row + i) * 4 + 3] = 255 * t * t * (3 - 2 * t);
    }
  }

  return { d, water };
}

// ------------------------------------------------------------------ helpers

/** Separable box blur with running sums. @returns */
function boxBlur2D(src: Float32Array, n: number, r: number): Float32Array {
  const tmp = new Float32Array(n * n);
  const out = new Float32Array(n * n);
  const inv = 1 / (r * 2 + 1);
  for (let j = 0; j < n; j++) {
    const row = j * n;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[row + clampI(i, n)];
    for (let i = 0; i < n; i++) {
      tmp[row + i] = sum * inv;
      sum += src[row + clampI(i + r + 1, n)] - src[row + clampI(i - r, n)];
    }
  }
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = -r; j <= r; j++) sum += tmp[clampI(j, n) * n + i];
    for (let j = 0; j < n; j++) {
      out[j * n + i] = sum * inv;
      sum += tmp[clampI(j + r + 1, n) * n + i] - tmp[clampI(j - r, n) * n + i];
    }
  }
  return out;
}

const clampI = (v: number, n: number) => (v < 0 ? 0 : v > n - 1 ? n - 1 : v);

function sampleBilinear(a: ArrayLike<number>, n: number, x: number, y: number) {
  let i = x | 0, j = y | 0;
  if (i < 0) i = 0; else if (i > n - 2) i = n - 2;
  if (j < 0) j = 0; else if (j > n - 2) j = n - 2;
  const tx = x - i, ty = y - j;
  const o = j * n + i;
  return (a[o] + (a[o + 1] - a[o]) * tx) * (1 - ty)
    + (a[o + n] + (a[o + n + 1] - a[o + n]) * tx) * ty;
}

/** Deterministic 0..1 hash of two integers — the paper grain. */
function hash2(i: number, j: number) {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** Smooth value noise on a `p`-pixel lattice. 0..1. */
function lnoise(i: number, j: number, p: number) {
  const fx = i / p, fy = j / p;
  const i0 = Math.floor(fx), j0 = Math.floor(fy);
  const tx = fx - i0, ty = fy - j0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(i0, j0), b = hash2(i0 + 1, j0);
  const c = hash2(i0, j0 + 1), d = hash2(i0 + 1, j0 + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

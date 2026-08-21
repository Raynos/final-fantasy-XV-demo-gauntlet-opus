import { worldMap, WORLD } from '../map/WorldMap.ts';

/**
 * The regional *surface* palette — what the ground is actually made of in each
 * of the nineteen zones of Lucis.
 *
 * This is the terrain twin of `veg/Biomes.js`. It exists for the same reason:
 * the splat in `TerrainMaterial.js` derived every colour it drew from slope,
 * altitude, flow, sediment and noise, and every one of those is a *global*
 * field that has never heard of the cartography. The consequence was that the
 * whole 8 km world was one red-ochre Leide badland — the Nebulawood, the
 * Vesperpool, the Lestallum Shelf and the Rock of Ravatogh included.
 *
 * `WorldMap` already carries `moist` and `rocky` per zone, but those only ever
 * reached the heightfield and the vegetation. Colour needs authored art
 * direction rather than a derived number: a humid basin is green *and* the rock
 * in it is grey, a coast is bleached, a volcano is black. So the palette is a
 * table, indexed by zone id and blended by the map's own Gaussian zone weights
 * — which means every regional boundary is smooth by construction and there is
 * no seam anywhere to hide.
 *
 * Field reference
 *   ground  [r,g,b] multiplier on the soft layers (sand / dirt / gravel /
 *           grass / road). 1.0 is "leave the authored tile alone".
 *   rock    [r,g,b] multiplier on the rock layer and the strata tint.
 *
 * Both are *corrections*, not colours, and the tiles they correct are authored
 * red-ochre — the rock tile averages roughly (0.41, 0.33, 0.28). A tint that
 * merely nudges blue up by a few percent therefore does nothing visible: to
 * reach neutral pale limestone the blue channel has to be lifted by about 60 %.
 * That is why the Cleigne entries look so lopsided, and why a first pass that
 * authored them as plausible-looking near-1.0 triples left every Cleigne cliff
 * still reading as Leide rust.
 *   green   0..1 how vegetated the *ground* is. Boosts the grass layer, lifts
 *           its altitude gate, suppresses sand pans, and pushes the macro tint
 *           off the ochre axis.
 *   damp    0..1 standing humidity independent of weather. Darkens and cools
 *           the albedo and drops roughness.
 *
 * The table is not read per-pixel. `buildBiomeLut()` bakes it into two extra
 * layers of the existing detail texture array so the shader reads the whole
 * palette in two fetches from a sampler it already binds — the terrain
 * fragment shader sits on the 16-texture-unit limit once the atmosphere patch
 * and the shadow cascades are injected into it, and an eighth standalone
 * sampler tips it over.
 */

export const SURFACE: Object<string, {ground:number[], rock:number[], green:number, damp:number}> = {
  // ------------------------------------------------------------------ LEIDE
  // Red-ochre badlands, rust rock, dry scrub. This is the one region that was
  // already right, so its entries sit close to 1.0 and only carry the warm
  // iron cast the hand-tuned shader constant used to apply everywhere.
  longwythe: { ground: [1.06, 0.98, 0.86], rock: [1.07, 0.99, 0.87], green: 0.12, damp: 0.00 },
  three_valleys: { ground: [1.09, 0.96, 0.81], rock: [1.11, 0.97, 0.83], green: 0.08, damp: 0.00 },
  crown_verge: { ground: [1.03, 0.97, 0.90], rock: [1.05, 0.98, 0.90], green: 0.05, damp: 0.00 },
  keycatrich: { ground: [1.06, 0.97, 0.84], rock: [1.08, 0.97, 0.85], green: 0.07, damp: 0.00 },
  balouve: { ground: [1.05, 0.96, 0.85], rock: [1.07, 0.96, 0.85], green: 0.07, damp: 0.00 },
  // The two coasts: salt-bleached, paler and much less saturated than inland.
  kelbass: { ground: [1.06, 1.02, 0.93], rock: [1.11, 1.20, 1.16], green: 0.26, damp: 0.06 },
  galdin: { ground: [1.10, 1.06, 0.97], rock: [1.13, 1.26, 1.27], green: 0.32, damp: 0.14 },

  // ----------------------------------------------------------------- DUSCAE
  // The green basin. Open grazed prairie in the west, closed wet forest and
  // standing water in the east, and one scorched ejecta field at Mencemoor.
  weaverwilds: { ground: [0.76, 0.94, 0.54], rock: [1.03, 1.20, 1.32], green: 0.86, damp: 0.18 },
  fallgrove: { ground: [0.78, 0.95, 0.55], rock: [1.03, 1.21, 1.33], green: 0.82, damp: 0.24 },
  alstor: { ground: [0.64, 0.80, 0.54], rock: [0.91, 1.10, 1.23], green: 0.66, damp: 0.82 },
  nebulawood: { ground: [0.62, 0.79, 0.50], rock: [0.90, 1.09, 1.22], green: 0.62, damp: 0.62 },
  taelpar: { ground: [0.85, 0.94, 0.70], rock: [1.01, 1.20, 1.36], green: 0.52, damp: 0.22 },
  // Mencemoor: the Disc's ejecta field. Scorched, dusty, almost nothing grows.
  cauthess: { ground: [0.78, 0.76, 0.69], rock: [0.74, 0.86, 0.93], green: 0.26, damp: 0.05 },

  // ---------------------------------------------------------------- CLEIGNE
  // Cold uplands: pale cool limestone, not rust. This is the single biggest
  // change in the table — every Cleigne cliff used to be Leide-coloured.
  lestallum_shelf: { ground: [0.84, 0.96, 0.78], rock: [1.15, 1.40, 1.66], green: 0.56, damp: 0.10 },
  meldacio: { ground: [0.82, 0.94, 0.78], rock: [1.08, 1.35, 1.58], green: 0.50, damp: 0.13 },
  malmalam: { ground: [0.60, 0.76, 0.50], rock: [0.84, 1.08, 1.30], green: 0.68, damp: 0.74 },
  vesperpool: { ground: [0.64, 0.80, 0.54], rock: [1.03, 1.32, 1.62], green: 0.70, damp: 0.90 },
  cape_caem: { ground: [0.74, 0.90, 0.56], rock: [1.06, 1.35, 1.62], green: 0.84, damp: 0.44 },
  // The Rock of Ravatogh is a live volcano: basalt, ash and clinker.
  //
  // Pre-compensated. Ravatogh is the one entry the blend cannot deliver as
  // authored: it is an 880 m zone ringed by five much greener, much paler
  // neighbours, so even after `BLEND_POW` it holds only ~78 % of the weight at
  // its own summit and the remaining 22 % of pale Cleigne limestone is enough
  // to drag basalt up to a mid blue-grey — measured, the authored 0.44 blue
  // arrived as 0.58 and the cone read as just another hazy peak. Every other
  // zone lands within 0.05 of its table value, so the fix belongs here rather
  // than in a sharper global blend that would narrow all eighteen other
  // transitions to cure one. These numbers are chosen so the *blended* result
  // is the basalt above: ground ~[0.44,0.42,0.41], rock ~[0.32,0.38,0.44].
  ravatogh: { ground: [0.41, 0.36, 0.40], rock: [0.20, 0.24, 0.26], green: 0.00, damp: 0.00 },

  // The frontier beyond every zone's reach: neutral Lucian highland.
  _default: { ground: [0.92, 0.97, 0.84], rock: [1.06, 1.23, 1.37], green: 0.34, damp: 0.06 },
};

const DEF = SURFACE._default;
const _w = {};

/**
 * Contrast on the zone blend.
 *
 * `zoneWeights` is tuned for the *heightfield*, where a wide, soft overlap is
 * exactly right — a range should grow out of its neighbour, not start at a
 * line. But it is soft enough that even at its own centre a zone holds only
 * about 60 % of the weight, and a palette averaged like that comes out as one
 * mud: measured at the middle of the Rock of Ravatogh, an authored 0.45 basalt
 * arrived as 0.59, and its authored zero humidity arrived as 0.27.
 *
 * Raising each weight to a power and renormalising sharpens the plateau
 * without introducing a discontinuity anywhere: the result is still a smooth
 * function of position, it simply spends more of its range being one region
 * and less being the average of five.
 */
const BLEND_POW = 2.4;

/**
 * The blended surface palette at a world position.
 *
 * Blended by `WorldMap.zoneWeights()` — the same Gaussian falloff the
 * heightfield uses — so the palette varies continuously and no boundary can
 * ever draw as a line. `out` is reused; copy it if you need to keep it.
 *
 * @param x @param z
 * @param [out] reused result `{ground:[r,g,b], rock:[r,g,b], green, damp}`
 */
export function surfaceAt(x: number, z: number, out?: any): any {
  const o = out || { ground: [0, 0, 0], rock: [0, 0, 0], green: 0, damp: 0 };
  const g = o.ground, r = o.rock;
  g[0] = g[1] = g[2] = 0; r[0] = r[1] = r[2] = 0;
  o.green = 0; o.damp = 0;
  const w = worldMap.zoneWeights(x, z, _w);
  let sum = 0;
  for (const id in w) { w[id] = Math.pow(w[id], BLEND_POW); sum += w[id]; }
  const inv = 1 / Math.max(sum, 1e-9);
  for (const id in w) {
    const q = w[id] * inv;
    if (q <= 0) continue;
    const s = SURFACE[id] || DEF;
    g[0] += s.ground[0] * q; g[1] += s.ground[1] * q; g[2] += s.ground[2] * q;
    r[0] += s.rock[0] * q; r[1] += s.rock[1] * q; r[2] += s.rock[2] * q;
    o.green += s.green * q;
    o.damp += s.damp * q;
  }
  return o;
}

/** Tint multipliers run 0..2, encoded into a byte at ~0.008 steps. */
const TINT_SCALE = 255 / 2;

/**
 * Bake the palette into two RGBA layers covering the whole world, ready to be
 * concatenated onto the detail texture array.
 *
 *   layer 2 : rgb = ground tint / 2      a = green
 *   layer 3 : rgb = rock tint / 2        a = damp
 *
 * The palette is evaluated on a coarse grid and bilinearly upsampled rather
 * than evaluated per output texel: `zoneWeights` is nineteen exponentials, and
 * the finest feature in the table is a zone whose radius is over a kilometre,
 * so a 128 grid over 8192 m (64 m per sample) is already several times finer
 * than anything the table can express. That keeps the whole bake in single-
 * digit milliseconds at boot instead of a quarter of a second.
 *
 * Not part of `src/tools/bake.mjs`: it is cheap, and it depends on `WorldMap`
 * rather than on the layer recipes, so baking it would only add a second
 * staleness dependency for no measurable gain.
 *
 * @param size texel resolution, matching the detail array
 * @param [coarse] palette evaluation grid
 * @returns two RGBA layers, back to back
 */
export function buildBiomeLut(size: number, coarse: number = 128): Uint8Array {
  const half = WORLD.half;
  const span = WORLD.size;

  // 1 — evaluate the palette on the coarse grid, sample centres on the world
  const cg = new Float32Array(coarse * coarse * 4);
  const cr = new Float32Array(coarse * coarse * 4);
  const s = { ground: [0, 0, 0], rock: [0, 0, 0], green: 0, damp: 0 };
  for (let j = 0; j < coarse; j++) {
    const z = -half + ((j + 0.5) / coarse) * span;
    for (let i = 0; i < coarse; i++) {
      const x = -half + ((i + 0.5) / coarse) * span;
      surfaceAt(x, z, s);
      const k = (j * coarse + i) * 4;
      cg[k] = s.ground[0]; cg[k + 1] = s.ground[1]; cg[k + 2] = s.ground[2]; cg[k + 3] = s.green;
      cr[k] = s.rock[0]; cr[k + 1] = s.rock[1]; cr[k + 2] = s.rock[2]; cr[k + 3] = s.damp;
    }
  }

  // 2 — bilinear upsample into the two output layers
  const px = size * size;
  const out = new Uint8Array(px * 4 * 2);
  const last = coarse - 1;
  for (let y = 0; y < size; y++) {
    // map output texel centres onto coarse sample centres
    const fy = ((y + 0.5) / size) * coarse - 0.5;
    const y0 = Math.max(0, Math.min(last, Math.floor(fy)));
    const y1 = Math.min(last, y0 + 1);
    const ty = Math.max(0, Math.min(1, fy - y0));
    for (let x = 0; x < size; x++) {
      const fx = ((x + 0.5) / size) * coarse - 0.5;
      const x0 = Math.max(0, Math.min(last, Math.floor(fx)));
      const x1 = Math.min(last, x0 + 1);
      const tx = Math.max(0, Math.min(1, fx - x0));
      const a = (y0 * coarse + x0) * 4, b = (y0 * coarse + x1) * 4;
      const c = (y1 * coarse + x0) * 4, d = (y1 * coarse + x1) * 4;
      const o0 = (y * size + x) * 4;
      const o1 = px * 4 + o0;
      for (let k = 0; k < 4; k++) {
        const gv = bilerp(cg[a + k], cg[b + k], cg[c + k], cg[d + k], tx, ty);
        const rv = bilerp(cr[a + k], cr[b + k], cr[c + k], cr[d + k], tx, ty);
        // rgb are 0..2 tint multipliers; a is already 0..1
        out[o0 + k] = byte(k < 3 ? gv * TINT_SCALE : gv * 255);
        out[o1 + k] = byte(k < 3 ? rv * TINT_SCALE : rv * 255);
      }
    }
  }
  return out;
}

function bilerp(a, b, c, d, tx, ty) {
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

function byte(v) { return v < 0 ? 0 : v > 255 ? 255 : (v + 0.5) | 0; }

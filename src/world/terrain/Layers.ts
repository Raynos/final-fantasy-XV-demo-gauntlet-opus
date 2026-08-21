import * as THREE from 'three';
import { buildBiomeLut } from './Biome.ts';

/**
 * Procedurally synthesised, seamlessly tileable PBR material layers packed into
 * two texture arrays:
 *
 *   albedoArray : rgb = albedo (sRGB)          a = layer height (height-blend)
 *   surfArray   : rg  = tangent normal xy      b = roughness      a = AO
 *
 * Layer order is fixed and shared with the shader and with
 * `Terrain.sampleMaterial()`.
 */
export const LAYER_NAMES = ['sand', 'dirt', 'gravel', 'rock', 'grass', 'road'];
export const LAYER_COUNT = 6;
/** Detail array depth: 2 tiled detail maps + the 2 world-space palette layers. */
export const DETAIL_LAYERS = 4;

/** Average albedo per layer (linear-ish sRGB bytes /255) used for the far LOD. */
export const LAYER_AVG = [
  [0.66, 0.42, 0.26],   // sand   – red ochre
  [0.50, 0.40, 0.29],   // dirt   – dry cracked earth
  [0.46, 0.41, 0.36],   // gravel – grey-brown scree
  [0.44, 0.35, 0.29],   // rock   – rust / ash strata
  [0.45, 0.41, 0.26],   // grass  – bleached khaki scrub
  [0.51, 0.475, 0.415],  // road   – pale compacted dirt
];
export const LAYER_ROUGH = [0.95, 0.92, 0.88, 0.82, 0.94, 0.86];
/**
 * World-space tiles per metre.
 *
 * These are ~1.6x tighter than they used to be. The old values were chosen
 * while every layer was drawn twice — once at `LAYER_SCALE`, once at a third of
 * it — so the coarse tap's features had to stay believable at 3x the size. That
 * coarse tap is gone (it was the source of the 27 m mega-plates the critics
 * read as "cracks two metres wide"), and with the stochastic tile sampler
 * breaking the lattice instead, the base tile can be as small as the material
 * really is: dirt now repeats every 5.3 m rather than 9.3 m, which puts the mud
 * plates at ~0.9 m instead of ~1.5 m.
 */
export const LAYER_SCALE = [0.26, 0.19, 0.34, 0.082, 0.42, 0.28];

// --------------------------------------------------------------- tiling noise
// Every helper takes uv in [0,1) plus an explicit integer lattice count per
// axis. Keeping the multiplier and the wrap period identical per axis is what
// makes these exactly seamless — a mismatch there shows up in-game as a visible
// grid line every tile.

function hash2(x: any, y: any, seed: any) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Quintic-smoothed value noise on a px * py wrapped lattice. */
function vnoise(u: any, v: any, px: any, py: any, seed: any) {
  const x = u * px, y = v * py;
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const su = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const sv = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
  const y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return (a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv;
}

function fbm(u: any, v: any, px: any, py: any, seed: any, oct = 4, gain = 0.5) {
  let s = 0, a = 1, norm = 0, f = 1;
  for (let o = 0; o < oct; o++) {
    s += a * vnoise(u, v, px * f, py * f, seed + o * 71);
    norm += a; a *= gain; f *= 2;
  }
  return s / norm;
}

/** Wrapped Worley. `f1`/`f2` are in cell units; `id` is a per-cell random. */
function worley(u: any, v: any, px: any, py: any, seed: any) {
  const x = u * px, y = v * py;
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy;
      const wx = ((cx % px) + px) % px, wy = ((cy % py) + py) % py;
      const jx = cx + hash2(wx, wy, seed);
      const jy = cy + hash2(wx, wy, seed + 999);
      const d = Math.hypot(jx - x, jy - y);
      if (d < f1) { f2 = f1; f1 = d; id = hash2(wx, wy, seed + 31); }
      else if (d < f2) { f2 = d; }
    }
  }
  return { f1, f2, id };
}

const clamp01 = (v: any) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: any, b: any, t: any) => a + (b - a) * t;
function sstep(a: any, b: any, x: any) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }

// ------------------------------------------------------------- layer recipes

/**
 * Each recipe returns { height, color:[r,g,b], rough, ao } for a uv in [0,1).
 * `P` is the lattice period in cells for the base octave.
 */
const RECIPES = [
  // 0 — red-ochre wind-blown sand: ripples, drift lines, scattered coarse grit
  (u: any, v: any) => {
    const warpA = fbm(u, v, 6, 6, 11, 3) - 0.5;
    const drift = fbm(u, v, 3, 5, 41, 4);
    const ripple = 0.5 + 0.5 * Math.sin((v * 11 + warpA * 9.0) * Math.PI * 2);
    const grain = fbm(u, v, 96, 96, 23, 3);
    const grit = worley(u, v, 26, 26, 67);
    const stone = clamp01(1 - grit.f1 * 3.1) * sstep(0.55, 0.85, grit.id);
    const height = clamp01(ripple * 0.20 + drift * 0.48 + grain * 0.16 + stone * 0.5);
    const t = clamp01(height * 0.55 + drift * 0.55);
    const bleach = mix(0.92, 1.14, drift);
    let r = mix(0.635, 0.880, t) * mix(0.92, 1.05, grain) * bleach;
    let g = mix(0.512, 0.700, t) * mix(0.93, 1.04, grain) * bleach;
    let b = mix(0.382, 0.520, t) * mix(0.93, 1.04, grain) * bleach;
    if (stone > 0.4) { const k = (stone - 0.4) * 0.8; r = mix(r, 0.47, k); g = mix(g, 0.43, k); b = mix(b, 0.39, k); }
    return { height, color: [r, g, b], rough: 0.95 - 0.10 * stone, ao: mix(0.78, 1.0, height) };
  },
  // 1 — dry cracked dirt: polygonal plates split by shallow curled cracks
  (u: any, v: any) => {
    const wx = (fbm(u, v, 10, 10, 71, 3) - 0.5) * 0.11;
    const wy = (fbm(u, v, 10, 10, 83, 3) - 0.5) * 0.11;
    const w = worley(u + wx, v + wy, 6, 6, 5);
    const crack = sstep(0.0, 0.055, w.f2 - w.f1);
    const w2 = worley(u + wx, v + wy, 16, 16, 17);
    const crack2 = sstep(0.0, 0.075, w2.f2 - w2.f1);
    const plate = w.id;
    const grain = fbm(u, v, 72, 72, 29, 3);
    const micro = fbm(u, v, 20, 20, 37, 4);
    const pebbles = worley(u, v, 34, 34, 39);
    const peb = clamp01(1 - pebbles.f1 * 3.0) * sstep(0.62, 0.9, pebbles.id);
    const height = clamp01(crack * 0.55 * (0.75 + 0.25 * crack2) + micro * 0.3 + grain * 0.08 + peb * 0.45);
    const dark = mix(0.68, 1.0, crack) * mix(0.88, 1.0, crack2);
    const t = clamp01(plate * 0.45 + micro * 0.55);
    let r = mix(0.395, 0.625, t) * dark * mix(0.90, 1.08, grain);
    let g = mix(0.320, 0.495, t) * dark * mix(0.90, 1.06, grain);
    let b = mix(0.240, 0.375, t) * dark * mix(0.90, 1.06, grain);
    if (peb > 0.35) { const k = (peb - 0.35) * 0.85; r = mix(r, 0.455, k); g = mix(g, 0.415, k); b = mix(b, 0.365, k); }
    return {
      height, color: [r, g, b],
      rough: mix(0.98, 0.84, crack), ao: mix(0.64, 1.0, crack) * mix(0.88, 1.0, crack2),
    };
  },
  // 2 — gravel / scree: packed pebbles of strongly varied colour
  (u: any, v: any) => {
    const wx = (fbm(u, v, 24, 24, 91, 2) - 0.5) * 0.02;
    const w = worley(u + wx, v - wx, 12, 12, 13);
    const dome = clamp01(1 - w.f1 * 1.9);
    const fines = fbm(u, v, 48, 48, 57, 3);
    const height = clamp01(Math.pow(dome, 0.65) * 0.84 + fines * 0.2);
    const tint = w.id;
    const grain = fbm(u, v, 84, 84, 63, 2);
    const shade = mix(0.80, 1.14, tint) * mix(0.94, 1.06, grain);
    const warm = hash2(Math.floor(u * 12), Math.floor(v * 12), 77);
    const r = mix(0.375, 0.485, warm) * shade;
    const g = mix(0.375, 0.418, warm) * shade;
    const b = mix(0.398, 0.318, warm) * shade;
    return { height, color: [r, g, b], rough: mix(0.94, 0.68, tint), ao: mix(0.40, 1.0, Math.pow(dome, 0.55)) };
  },
  // 3 — sedimentary rock: irregular beds + vertical jointing (triplanar; v = world Y)
  (u: any, v: any) => {
    // The warp is what stops the beds being ruled lines. It used to be +/-0.05
    // of a tile — about 0.6 m — which on a 12 m tile is nothing, so every bed
    // ran dead level right across a hillside and the whole face read as printed
    // wood grain. Two octaves now, and six times the throw, so a bed wanders by
    // most of its own thickness across a face the way a real one does.
    const warp = (fbm(u, v, 4, 2, 101, 4) - 0.5) * 0.30
      + (fbm(u, v, 9, 5, 103, 3) - 0.5) * 0.12;
    const band = v + warp;
    const b1 = Math.sin(band * Math.PI * 2 * 6.0);
    const b2 = Math.sin(band * Math.PI * 2 * 2.0 + 1.1);
    const b3 = Math.sin(band * Math.PI * 2 * 15.0 + 2.4);
    // Weighted toward the *fine* laminations rather than the 6 m package. The
    // 6 m one is the band you can pick out from 300 m away, and one visible
    // pitch repeated up a face is the whole corduroy problem.
    const bed = clamp01(0.5 + 0.34 * b1 + 0.15 * b2 + 0.14 * b3);
    // The *texture* only hints at bedding — the strong, irregular banding is
    // driven in the shader from world Y, so this must stay subtle or the two
    // stack up into corduroy. The step is deliberately soft: a hard one drew a
    // ruled edge at the top and bottom of every bed.
    const bedStep = sstep(0.22, 0.78, bed);
    // vertical joints — tall thin cells, still tileable because the lattice is
    // 12 x 4 and both axes wrap on their own count
    const frac = worley(u + warp, v, 12, 4, 19);
    const fracture = sstep(0.0, 0.055, frac.f2 - frac.f1);
    const grit = fbm(u, v, 40, 40, 47, 4);
    const chip = fbm(u, v, 12, 6, 53, 3);
    // The bedding relief in the *tile* is kept very low. It repeats on a fixed
    // 3-15 m period wherever the layer is drawn, so any strength here shows up
    // as identical corduroy on every rock face in the frame. The strong, varied
    // banding comes from the shader's analytic beds instead; this tile only
    // supplies grain, jointing and chip.
    const height = clamp01(bedStep * 0.075 + fracture * 0.28 + grit * 0.27 + chip * 0.38);
    const blotch = fbm(u, v, 5, 3, 59, 3);
    const stain = fbm(u, v, 3, 9, 67, 4);
    // Iron / ash balance per bed. **This was the wood grain.** It used to be
    // `0.5 + 0.5 * b2` — a pure sinusoid of world Y at two cycles per 12 m tile
    // — driving a 20 % swing on red against a 14 % swing the other way on blue.
    // A triplanar tile whose v axis *is* world Y then painted that as perfectly
    // level warm-tan / blue-grey stripes on every slope in the world, and since
    // it lives in the tile rather than in the shader it survived the regional
    // `bedRegion` suppression that was supposed to keep bedding out of green
    // country. Two agents in a row diagnosed it as the shader's strata and
    // proved themselves wrong: zeroing every strata term leaves it untouched.
    // Now the bed only *biases* the balance and a 2D blotch field carries most
    // of it, so the hue changes along a face as well as up it.
    const hueSel = clamp01(0.5 + 0.28 * b2 + 0.9 * (blotch - 0.5));
    const r = mix(0.392, 0.424, bedStep) * mix(0.95, 1.06, hueSel) * mix(0.88, 1.12, grit) * mix(0.84, 1.16, blotch) * mix(0.90, 1.10, stain);
    const g = mix(0.320, 0.348, bedStep) * mix(0.98, 1.01, hueSel) * mix(0.90, 1.09, grit) * mix(0.88, 1.12, blotch) * mix(0.92, 1.08, stain);
    const b = mix(0.274, 0.296, bedStep) * mix(1.03, 0.95, hueSel) * mix(0.90, 1.09, grit) * mix(0.90, 1.08, blotch) * mix(0.94, 1.06, stain);
    const dark = mix(0.70, 1.0, fracture);
    return {
      height, color: [r * dark, g * dark, b * dark],
      // The AO band followed the beds too, and an AO stripe survives every
      // regional tint the palette applies — it is a shadow, not a colour.
      rough: mix(0.84, 0.77, bedStep), ao: mix(0.52, 1.0, fracture) * mix(0.96, 1.0, bedStep),
    };
  },
  // 4 — bleached dry grass / scrub mat with bare dirt showing through
  (u: any, v: any) => {
    const clump = fbm(u, v, 7, 7, 131, 4);
    const blade = fbm(u, v, 80, 24, 137, 2);
    const blade2 = fbm(u, v, 24, 80, 139, 2);
    const cover = clamp01((clump - 0.44) * 3.4);
    const strand = clamp01(blade * 0.6 + blade2 * 0.6 - 0.25);
    const height = clamp01(cover * (0.42 + 0.58 * strand) * 0.85 + fbm(u, v, 32, 32, 149, 3) * 0.2);
    const dirtR = 0.415, dirtG = 0.340, dirtB = 0.258;
    const t = clamp01(strand * 0.8 + clump * 0.5);
    const gr = mix(0.455, 0.665, t), gg = mix(0.410, 0.590, t), gb = mix(0.250, 0.340, t);
    const c = cover * clamp01(0.35 + strand);
    return {
      height,
      color: [mix(dirtR, gr, c), mix(dirtG, gg, c), mix(dirtB, gb, c)],
      rough: mix(0.95, 0.88, c), ao: mix(0.74, 1.0, height),
    };
  },
  // 5 — compacted dirt road: wheel tracks, embedded stones, fine dust
  (u: any, v: any) => {
    const groove = fbm(u, v, 18, 5, 151, 4);
    const stones = worley(u, v, 20, 20, 23);
    const pebble = clamp01(1 - stones.f1 * 2.4);
    const dust = fbm(u, v, 52, 52, 157, 4);
    const streak = fbm(u, v, 26, 3, 163, 4);
    const height = clamp01(0.30 + pebble * 0.20 + dust * 0.30 + streak * 0.22);
    // pale dust-blown track: it has to read against red-brown ground from 300 m
    const packed = mix(0.84, 1.10, streak) * mix(0.93, 1.06, dust);
    let r = mix(0.500, 0.640, groove) * packed;
    let g = mix(0.465, 0.592, groove) * packed;
    let b = mix(0.408, 0.502, groove) * packed;
    if (pebble > 0.5) { const k = (pebble - 0.5) * 0.8; r = mix(r, 0.44, k); g = mix(g, 0.41, k); b = mix(b, 0.375, k); }
    return {
      height, color: [r, g, b],
      rough: mix(0.90, 0.74, streak), ao: mix(0.70, 1.0, height),
    };
  },
];

// -------------------------------------------------------------------- build

/**
 * Synthesise every layer's texels. Split out from the texture construction so
 * the build step can bake the bytes once (`src/tools/bake.mjs`) instead of every
 * page load spending a second evaluating 1.6 M per-texel recipes.
 *
 * @param size texel resolution per layer
 */
export function buildLayerData(size: number = 512): {size:number, detailSize:number, albedo:Uint8Array, surf:Uint8Array, detail:Uint8Array} {
  const px = size * size;
  const albedo = new Uint8Array(px * 4 * LAYER_COUNT);
  const surf = new Uint8Array(px * 4 * LAYER_COUNT);
  const hbuf = new Float32Array(px);

  for (let L = 0; L < LAYER_COUNT; L++) {
    const recipe = RECIPES[L];
    const aOff = L * px * 4, sOff = L * px * 4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const r = recipe(x / size, y / size);
        hbuf[i] = r.height;
        albedo[aOff + i * 4] = clampByte(r.color[0] * 255);
        albedo[aOff + i * 4 + 1] = clampByte(r.color[1] * 255);
        albedo[aOff + i * 4 + 2] = clampByte(r.color[2] * 255);
        albedo[aOff + i * 4 + 3] = clampByte(r.height * 255);
        surf[sOff + i * 4 + 2] = clampByte(r.rough * 255);
        surf[sOff + i * 4 + 3] = clampByte(r.ao * 255);
      }
    }
    // Sobel normals from the layer height, wrapped so the tile stays seamless
    const strength = [3.2, 3.6, 4.4, 3.4, 2.6, 3.0][L];
    const at = (x: any, y: any) => hbuf[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) -
          (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
        const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) -
          (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
        const nx = -dx * strength, ny = -dy * strength, nz = 1;
        const inv = 1 / Math.hypot(nx, ny, nz);
        surf[sOff + i * 4] = clampByte((nx * inv * 0.5 + 0.5) * 255);
        surf[sOff + i * 4 + 1] = clampByte((ny * inv * 0.5 + 0.5) * 255);
      }
    }
  }

  const detailSize = Math.min(512, size);
  return { size, detailSize, albedo, surf, detail: buildDetailData(detailSize) };
}

/**
 * Wrap layer texels in the array textures the terrain shader samples.
 * @param size texel resolution per layer
 * @param [data] pre-baked texels from `buildLayerData`; synthesised when absent
 * @param [lut] the two biome palette layers from `Biome.buildBiomeLut`
 */
export function buildLayerTextures(size: number = 512, data: any = null, lut: Uint8Array | null = null): {albedoArray: THREE.DataArrayTexture, surfArray: THREE.DataArrayTexture, detailArray: THREE.DataArrayTexture} {
  const d = data && data.size === size ? data : buildLayerData(size);
  const { albedo, surf, detail, detailSize } = d;

  const albedoArray = new THREE.DataArrayTexture(albedo, size, size, LAYER_COUNT);
  albedoArray.format = THREE.RGBAFormat;
  albedoArray.colorSpace = THREE.SRGBColorSpace;
  albedoArray.wrapS = albedoArray.wrapT = THREE.RepeatWrapping;
  albedoArray.minFilter = THREE.LinearMipmapLinearFilter;
  albedoArray.magFilter = THREE.LinearFilter;
  albedoArray.generateMipmaps = true;
  albedoArray.anisotropy = 16;
  albedoArray.needsUpdate = true;

  const surfArray = new THREE.DataArrayTexture(surf, size, size, LAYER_COUNT);
  surfArray.format = THREE.RGBAFormat;
  surfArray.colorSpace = THREE.NoColorSpace;
  surfArray.wrapS = surfArray.wrapT = THREE.RepeatWrapping;
  surfArray.minFilter = THREE.LinearMipmapLinearFilter;
  surfArray.magFilter = THREE.LinearFilter;
  surfArray.generateMipmaps = true;
  surfArray.anisotropy = 16;
  surfArray.needsUpdate = true;

  return { albedoArray, surfArray, detailArray: buildDetailArray(detailSize, detail, lut) };
}

/**
 * The close-range detail maps and the regional palette, packed as one array.
 *
 *   layer 0 — pebble / grit scale, tiled sub-metre (parallax + micro normal)
 *   layer 1 — near-field surface at 2-4 m (gravel, cracking, scour)
 *   layer 2 — biome LUT: rgb = ground tint / 2, a = groundcover  (world-space)
 *   layer 3 — biome LUT: rgb = rock tint / 2,   a = damp         (world-space)
 *
 * They share a sampler on purpose: the terrain fragment shader already sits on
 * the 16-texture-unit limit once the atmosphere patch and the shadow cascades
 * are injected into it, and a seventh standalone sampler tips it over. The two
 * palette layers (`terrain/Biome.js`) are appended here for exactly that
 * reason — they are read once per pixel and would otherwise have cost an
 * eighth binding of their own.
 *
 * Layers 0-1 are tiled in world space and *must* stay `RepeatWrapping`; layers
 * 2-3 span the whole world exactly once, so the shader clamps their uv itself.
 */
/** @returns the two detail layers packed back to back */
function buildDetailData(size: any): Uint8Array {
  const px = size * size;
  const data = new Uint8Array(px * 4 * 2);
  data.set(buildDetail(size), 0);
  data.set(buildNearDetail(size), px * 4);
  return data;
}

function buildDetailArray(size: any, data = buildDetailData(size), lut: any = null) {
  const palette = lut || buildBiomeLut(size);
  const px = size * size;
  const all = new Uint8Array(px * 4 * DETAIL_LAYERS);
  all.set(data, 0);
  all.set(palette, px * 4 * 2);
  const tex = new THREE.DataArrayTexture(all, size, size, DETAIL_LAYERS);
  tex.format = THREE.RGBAFormat;
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Near-field surface map, tiled at 2–4 m rather than the layer textures' 3–12 m.
 *
 * This is the band the layer splat cannot reach: at two metres from the camera
 * a 9 m dirt tile is magnified into a flat wash, which is exactly the "smooth
 * brown mound" tell. It carries four things the eye reads as *ground* —
 * scattered pebbles and gravel, polygonal shrinkage cracking, shallow scour
 * channels and a fine grit floor — packed as rgb = tangent normal, a = a
 * signed-ish detail height used to modulate albedo.
 */
function buildNearDetail(size: any) {
  const px = size * size;
  const h = new Float32Array(px);
  const alb = new Float32Array(px);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;

      // domain warp: nothing here is allowed to look lattice-aligned
      const wx = (fbm(u, v, 5, 5, 311, 3) - 0.5) * 0.09;
      const wy = (fbm(u, v, 5, 5, 313, 3) - 0.5) * 0.09;

      // 1 — polygonal shrinkage cracking, two generations
      const c1 = worley(u + wx, v + wy, 5, 5, 317);
      const crack1 = 1 - sstep(0.0, 0.045, c1.f2 - c1.f1);
      const c2 = worley(u + wx * 1.7, v + wy * 1.7, 11, 11, 331);
      const crack2 = (1 - sstep(0.0, 0.055, c2.f2 - c2.f1)) * (0.35 + 0.65 * c1.id);
      const crack = clamp01(crack1 * 0.75 + crack2 * 0.45);

      // 2 — pebble / gravel scatter at two sizes, clustered into drifts
      const drift = fbm(u, v, 4, 4, 337, 3);
      const bigP = worley(u, v, 9, 9, 341);
      const big = clamp01(1 - bigP.f1 * 2.7) * sstep(0.52, 0.88, bigP.id) * sstep(0.38, 0.72, drift);
      const smP = worley(u + wx * 0.5, v, 21, 21, 347);
      const small = clamp01(1 - smP.f1 * 3.0) * sstep(0.44, 0.86, smP.id);
      const peb = clamp01(big * 1.0 + small * 0.55);

      // 3 — shallow scour channels: where water last ran across the pan
      const scour = sstep(0.30, 0.02, Math.abs(fbm(u, v, 3, 7, 353, 4) - 0.5)) * 0.5;

      // 4 — grit floor
      const grit = fbm(u, v, 42, 42, 359, 3);

      const height = clamp01(
        0.42 + peb * 0.55 - crack * 0.46 - scour * 0.26 + (grit - 0.5) * 0.24
      );
      h[y * size + x] = height;

      // albedo modulation: pebbles read pale and slightly cool, cracks read
      // dark and warm, and the grit adds high-frequency salt so the surface
      // never resolves into one flat colour under the sun
      alb[y * size + x] = clamp01(
        0.50 + peb * 0.42 - crack * 0.40 - scour * 0.16 + (grit - 0.5) * 0.34
      );
    }
  }

  const data = new Uint8Array(px * 4);
  const at = (x: any, y: any) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      const nx = -dx * 3.1, ny = -dy * 3.1, nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      data[i * 4] = clampByte((nx * inv * 0.5 + 0.5) * 255);
      data[i * 4 + 1] = clampByte((ny * inv * 0.5 + 0.5) * 255);
      data[i * 4 + 2] = clampByte((nz * inv * 0.5 + 0.5) * 255);
      data[i * 4 + 3] = clampByte(alb[i] * 255);
    }
  }

  return data;
}

/**
 * Close-range detail map: pebbles, hairline cracks and dirt tufts.
 * rgb = tangent normal, a = height (drives the parallax offset).
 * @returns RGBA texels, ready to pack into the detail array.
 */
function buildDetail(size: any): Uint8Array {
  const px = size * size;
  const h = new Float32Array(px);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const peb = worley(u, v, 13, 13, 211);
      const dome = clamp01(1 - peb.f1 * 2.6) * (0.35 + 0.65 * peb.id);
      const grit = worley(u, v, 44, 44, 223);
      const fine = clamp01(1 - grit.f1 * 3.4) * 0.35;
      const cr = worley(u, v, 7, 7, 227);
      const crack = 1 - sstep(0.0, 0.05, cr.f2 - cr.f1);
      const tuft = fbm(u, v, 22, 22, 233, 3);
      h[y * size + x] = clamp01(dome * 0.75 + fine + tuft * 0.3 - crack * 0.55);
    }
  }
  const data = new Uint8Array(px * 4);
  const at = (x: any, y: any) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      const nx = -dx * 4.0, ny = -dy * 4.0, nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      data[i * 4] = clampByte((nx * inv * 0.5 + 0.5) * 255);
      data[i * 4 + 1] = clampByte((ny * inv * 0.5 + 0.5) * 255);
      data[i * 4 + 2] = clampByte((nz * inv * 0.5 + 0.5) * 255);
      data[i * 4 + 3] = clampByte(h[i] * 255);
    }
  }
  return data;
}

function clampByte(v: any) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

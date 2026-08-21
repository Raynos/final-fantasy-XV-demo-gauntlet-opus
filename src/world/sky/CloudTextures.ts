import * as THREE from 'three';

/**
 * Procedural, tileable noise volumes for the volumetric cloud raymarcher.
 * Nubis-style channel packing:
 *
 *   base   64^3 RGBA  R = perlin-worley (cloud shape), GBA = worley at 3 octaves
 *   detail 48^3 RGB   worley at 3 octaves (erodes the cloud edges)
 *   weather 256^2 RGB R = coverage, G = cloud type, B = large scale variation
 *
 * All noises wrap exactly, so the cloud field can tile across the world
 * without a visible seam. Generation is deterministic for a given seed.
 */

/** Deterministic 32-bit hash -> [0,1). */
function hash3i(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Feature-point grid for tileable 3D worley noise. */
function makePointGrid(cells, seed) {
  const pts = new Float32Array(cells * cells * cells * 3);
  let i = 0;
  for (let z = 0; z < cells; z++) {
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        pts[i++] = x + hash3i(x, y, z, seed);
        pts[i++] = y + hash3i(x, y, z, seed + 91);
        pts[i++] = z + hash3i(x, y, z, seed + 173);
      }
    }
  }
  return pts;
}

/** Inverted worley (1 - f1) in [0,1]; p in cell units, wraps at `cells`. */
function worley3(pts, cells, px, py, pz) {
  const xi = Math.floor(px), yi = Math.floor(py), zi = Math.floor(pz);
  let best = 1e9;
  for (let dz = -1; dz <= 1; dz++) {
    const cz = ((zi + dz) % cells + cells) % cells;
    const wz = zi + dz - cz;
    for (let dy = -1; dy <= 1; dy++) {
      const cy = ((yi + dy) % cells + cells) % cells;
      const wy = yi + dy - cy;
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ((xi + dx) % cells + cells) % cells;
        const wx = xi + dx - cx;
        const o = (cz * cells * cells + cy * cells + cx) * 3;
        const ax = pts[o] + wx - px;
        const ay = pts[o + 1] + wy - py;
        const az = pts[o + 2] + wz - pz;
        const d = ax * ax + ay * ay + az * az;
        if (d < best) best = d;
      }
    }
  }
  return 1 - Math.min(1, Math.sqrt(best));
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

/** Tileable 3D value noise with integer period. */
function value3(px, py, pz, period, seed) {
  const xi = Math.floor(px), yi = Math.floor(py), zi = Math.floor(pz);
  const fx = fade(px - xi), fy = fade(py - yi), fz = fade(pz - zi);
  const x0 = ((xi % period) + period) % period, x1 = (x0 + 1) % period;
  const y0 = ((yi % period) + period) % period, y1 = (y0 + 1) % period;
  const z0 = ((zi % period) + period) % period, z1 = (z0 + 1) % period;
  const c = (x, y, z) => hash3i(x, y, z, seed);
  const n00 = c(x0, y0, z0) + fx * (c(x1, y0, z0) - c(x0, y0, z0));
  const n10 = c(x0, y1, z0) + fx * (c(x1, y1, z0) - c(x0, y1, z0));
  const n01 = c(x0, y0, z1) + fx * (c(x1, y0, z1) - c(x0, y0, z1));
  const n11 = c(x0, y1, z1) + fx * (c(x1, y1, z1) - c(x0, y1, z1));
  const n0 = n00 + fy * (n10 - n00);
  const n1 = n01 + fy * (n11 - n01);
  return n0 + fz * (n1 - n0);
}

function valueFbm3(x, y, z, period, octaves, seed) {
  let a = 0.5, sum = 0, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += a * value3(x * f, y * f, z * f, period * f, seed + o * 37);
    norm += a; a *= 0.5; f *= 2;
  }
  return sum / norm;
}

/** Tileable 2D value fbm, period in cells. */
function value2(px, py, period, seed) {
  const xi = Math.floor(px), yi = Math.floor(py);
  const fx = fade(px - xi), fy = fade(py - yi);
  const x0 = ((xi % period) + period) % period, x1 = (x0 + 1) % period;
  const y0 = ((yi % period) + period) % period, y1 = (y0 + 1) % period;
  const c = (x, y) => hash3i(x, y, 0, seed);
  const n0 = c(x0, y0) + fx * (c(x1, y0) - c(x0, y0));
  const n1 = c(x0, y1) + fx * (c(x1, y1) - c(x0, y1));
  return n0 + fy * (n1 - n0);
}

function valueFbm2(x, y, period, octaves, seed) {
  let a = 0.5, sum = 0, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += a * value2(x * f, y * f, period * f, seed + o * 71);
    norm += a; a *= 0.5; f *= 2;
  }
  return sum / norm;
}

const remap = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Stretch a channel onto [0,1] between two percentiles.
 *
 * An fbm is a weighted sum of independent samples, so it is near-Gaussian and
 * only ever occupies a thin band around 0.5 — the raw perlin-worley here spans
 * 0.34..0.92 with three quarters of it inside 0.57..0.79. A coverage threshold
 * applied to a field that flat goes from "empty sky" to "solid lid" over a few
 * hundredths, which is exactly why every heavy weather preset saturated into a
 * featureless deck. Stretching the histogram is what gives coverage a usable
 * range and gives the cloud field its silhouette back.
 *
 * @param v values, modified in place
 * @param lo low percentile (0..1)
 * @param hi high percentile (0..1)
 */
function stretch(v: Float32Array, lo: number, hi: number) {
  const s = Float32Array.from(v).sort();
  const a = s[Math.floor(lo * (s.length - 1))];
  const b = s[Math.floor(hi * (s.length - 1))];
  const k = 1 / Math.max(1e-5, b - a);
  for (let i = 0; i < v.length; i++) v[i] = clamp01((v[i] - a) * k);
  return v;
}

/**
 * Build the cloud noise set.
 */
export function buildCloudTextures({ baseSize = 64, detailSize = 48, weatherSize = 256, seed = 1337 }: {baseSize?:number, detailSize?:number, weatherSize?:number, seed?:number} = {}): {base:THREE.Data3DTexture, detail:THREE.Data3DTexture, weather:THREE.DataTexture} {
  // ---- base volume -------------------------------------------------------
  const g4 = makePointGrid(4, seed + 1);
  const g8 = makePointGrid(8, seed + 2);
  const g16 = makePointGrid(16, seed + 3);
  const g24 = makePointGrid(24, seed + 4);

  const nBase = baseSize * baseSize * baseSize;
  const chR = new Float32Array(nBase);
  const ch8 = new Float32Array(nBase);
  const ch16 = new Float32Array(nBase);
  const ch24 = new Float32Array(nBase);
  let i = 0;
  for (let z = 0; z < baseSize; z++) {
    const fz = z / baseSize;
    for (let y = 0; y < baseSize; y++) {
      const fy = y / baseSize;
      for (let x = 0; x < baseSize; x++) {
        const fx = x / baseSize;
        // worley octaves (inverted so high = dense)
        const w4 = worley3(g4, 4, fx * 4, fy * 4, fz * 4);
        const w8 = worley3(g8, 8, fx * 8, fy * 8, fz * 8);
        const w16 = worley3(g16, 16, fx * 16, fy * 16, fz * 16);
        const w24 = worley3(g24, 24, fx * 24, fy * 24, fz * 24);
        const wf = w4 * 0.625 + w8 * 0.25 + w16 * 0.125;
        // perlin-worley: dilate the perlin fbm by the worley fbm
        const p = valueFbm3(fx * 4, fy * 4, fz * 4, 4, 4, seed + 11);
        chR[i] = clamp01(remap(p, wf - 1, 1, 0, 1));
        ch8[i] = w8; ch16[i] = w16; ch24[i] = w24;
        i++;
      }
    }
  }
  // widen the histograms so coverage has somewhere to threshold
  stretch(chR, 0.015, 0.985);
  stretch(ch8, 0.02, 0.98);
  stretch(ch16, 0.02, 0.98);
  stretch(ch24, 0.02, 0.98);

  const baseData = new Uint8Array(nBase * 4);
  for (let k = 0; k < nBase; k++) {
    baseData[k * 4] = (chR[k] * 255) | 0;
    baseData[k * 4 + 1] = (ch8[k] * 255) | 0;
    baseData[k * 4 + 2] = (ch16[k] * 255) | 0;
    baseData[k * 4 + 3] = (ch24[k] * 255) | 0;
  }
  const base = new THREE.Data3DTexture(baseData, baseSize, baseSize, baseSize);
  base.format = THREE.RGBAFormat;
  base.type = THREE.UnsignedByteType;
  base.minFilter = base.magFilter = THREE.LinearFilter;
  base.wrapS = base.wrapT = base.wrapR = THREE.RepeatWrapping;
  base.colorSpace = THREE.NoColorSpace;
  base.needsUpdate = true;

  // ---- detail volume -----------------------------------------------------
  const d8 = makePointGrid(8, seed + 21);
  const d16 = makePointGrid(16, seed + 22);
  const d32 = makePointGrid(24, seed + 23);
  const detailData = new Uint8Array(detailSize * detailSize * detailSize * 4);
  i = 0;
  for (let z = 0; z < detailSize; z++) {
    const fz = z / detailSize;
    for (let y = 0; y < detailSize; y++) {
      const fy = y / detailSize;
      for (let x = 0; x < detailSize; x++) {
        const fx = x / detailSize;
        detailData[i++] = (clamp01(worley3(d8, 8, fx * 8, fy * 8, fz * 8)) * 255) | 0;
        detailData[i++] = (clamp01(worley3(d16, 16, fx * 16, fy * 16, fz * 16)) * 255) | 0;
        detailData[i++] = (clamp01(worley3(d32, 24, fx * 24, fy * 24, fz * 24)) * 255) | 0;
        detailData[i++] = 255;
      }
    }
  }
  const detail = new THREE.Data3DTexture(detailData, detailSize, detailSize, detailSize);
  detail.format = THREE.RGBAFormat;
  detail.type = THREE.UnsignedByteType;
  detail.minFilter = detail.magFilter = THREE.LinearFilter;
  detail.wrapS = detail.wrapT = detail.wrapR = THREE.RepeatWrapping;
  detail.colorSpace = THREE.NoColorSpace;
  detail.needsUpdate = true;

  // ---- weather map -------------------------------------------------------
  const nW = weatherSize * weatherSize;
  const wCov = new Float32Array(nW);
  const wType = new Float32Array(nW);
  const wVar = new Float32Array(nW);
  const wData = new Uint8Array(nW * 4);
  i = 0;
  for (let y = 0; y < weatherSize; y++) {
    const fy = y / weatherSize;
    for (let x = 0; x < weatherSize; x++) {
      const fx = x / weatherSize;
      // large scale cloud banks with domain warp so they are not blobby
      const wx = valueFbm2(fx * 3 + 4.1, fy * 3 + 1.7, 3, 3, seed + 31);
      const wy = valueFbm2(fx * 3 + 9.3, fy * 3 + 7.2, 3, 3, seed + 32);
      const cov = valueFbm2(fx * 4 + wx * 0.9, fy * 4 + wy * 0.9, 4, 5, seed + 33);
      // ridged streaks give the banks a wind-blown direction
      const streak = 1 - Math.abs(valueFbm2(fx * 6 + wy, fy * 2.0, 6, 3, seed + 34) * 2 - 1);
      wCov[i] = cov * (0.72 + 0.42 * streak);
      wType[i] = valueFbm2(fx * 2, fy * 2, 2, 3, seed + 35);
      wVar[i] = valueFbm2(fx * 8, fy * 8, 8, 3, seed + 36);
      i++;
    }
  }
  stretch(wCov, 0.01, 0.99);
  stretch(wType, 0.03, 0.97);
  stretch(wVar, 0.03, 0.97);
  for (let k = 0; k < nW; k++) {
    wData[k * 4] = (wCov[k] * 255) | 0;
    wData[k * 4 + 1] = (wType[k] * 255) | 0;
    wData[k * 4 + 2] = (wVar[k] * 255) | 0;
    wData[k * 4 + 3] = 255;
  }
  const weather = new THREE.DataTexture(wData, weatherSize, weatherSize, THREE.RGBAFormat);
  weather.wrapS = weather.wrapT = THREE.RepeatWrapping;
  weather.minFilter = THREE.LinearMipmapLinearFilter;
  weather.magFilter = THREE.LinearFilter;
  weather.generateMipmaps = true;
  weather.colorSpace = THREE.NoColorSpace;
  weather.needsUpdate = true;

  return { base, detail, weather };
}

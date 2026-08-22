import * as THREE from 'three';

/**
 * Procedural PBR texture synthesis. The project ships no binary assets — every
 * albedo / normal / roughness / AO map is generated here at boot.
 *
 * Typical use:
 *   const { map, normalMap, roughnessMap, aoMap } = pbrFromHeight(512, (u,v) => {...});
 */

/** Shared options for every generator here. */
export interface TextureOpts {
  /** `THREE.NoColorSpace` for data maps -- roughness, normals, AO. */
  colorSpace?: THREE.ColorSpace;
  repeat?: number;
  anisotropy?: number;
  generateMipmaps?: boolean;
}

/** Build an RGBA DataTexture from a per-texel callback returning [r,g,b] in 0..1. */
export function makeTexture(size: number, fn: any, {
  colorSpace = THREE.SRGBColorSpace,
  repeat = 1,
  anisotropy = 16,
  generateMipmaps = true,
}: TextureOpts = {}) {
  const data = new Uint8Array(size * size * 4);
  const c = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      fn(x / size, y / size, c, x, y);
      const i = (y * size + x) * 4;
      data[i] = clamp255(c[0] * 255);
      data[i + 1] = clamp255(c[1] * 255);
      data[i + 2] = clamp255(c[2] * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = colorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = generateMipmaps;
  tex.minFilter = generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Single-channel (packed into RGB) map — for roughness / metalness / AO. */
export function makeDataMap(size: number, fn: any, opts = {}) {
  return makeTexture(size, (u: any, v: any, c: any, x: any, y: any) => {
    const g = fn(u, v, x, y);
    c[0] = c[1] = c[2] = g;
  }, { colorSpace: THREE.NoColorSpace, ...opts });
}

/**
 * Derive a tangent-space normal map from a height callback using Sobel.
 * `strength` scales the slope; 1 is subtle, 4 is pronounced.
 */
export function normalFromHeight(size: number, heightFn: any, strength = 2.0, opts = {}) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) h[y * size + x] = heightFn(x / size, y / size, x, y);
  }
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  return makeTexture(size, (u: any, v: any, c: any, x: number, y: number) => {
    const dx =
      (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) -
      (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy =
      (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) -
      (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    const nx = -dx * strength, ny = -dy * strength, nz = 1;
    const inv = 1 / Math.hypot(nx, ny, nz);
    c[0] = nx * inv * 0.5 + 0.5;
    c[1] = ny * inv * 0.5 + 0.5;
    c[2] = nz * inv * 0.5 + 0.5;
  }, { colorSpace: THREE.NoColorSpace, ...opts });
}

/** Cheap ambient-occlusion approximation from a height field (cavity map). */
export function aoFromHeight(size: number, heightFn: any, radius = 4, opts = {}) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) h[y * size + x] = heightFn(x / size, y / size, x, y);
  }
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  return makeDataMap(size, (u: any, v: any, x: number, y: number) => {
    const c = at(x, y);
    let occ = 0, n = 0;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      for (let r = 1; r <= radius; r++) {
        const sx = Math.round(x + Math.cos(ang) * r), sy = Math.round(y + Math.sin(ang) * r);
        occ += Math.max(0, at(sx, sy) - c) / r;
        n++;
      }
    }
    return Math.pow(Math.max(0, 1 - (occ / n) * 6), 1.4);
  }, opts);
}

/** Canvas-based generation for anything easier to draw than to compute. */
export function canvasTexture(size: number, draw: any, { colorSpace = THREE.SRGBColorSpace, repeat = 1 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = colorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

/** Radial soft-particle sprite (additive VFX, bloom kernels, light shafts). */
export function radialSprite(size = 128, { power = 2.4, inner = 0.0, tint = [1, 1, 1] } = {}) {
  const data = new Uint8Array(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - half + 0.5, y - half + 0.5) / half;
      let a = Math.max(0, 1 - d);
      a = Math.pow(a, power);
      if (inner > 0) a = Math.max(a, d < inner ? 1 : 0);
      const i = (y * size + x) * 4;
      data[i] = clamp255(tint[0] * 255);
      data[i + 1] = clamp255(tint[1] * 255);
      data[i + 2] = clamp255(tint[2] * 255);
      data[i + 3] = clamp255(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

/** Blue-noise-ish tileable dither texture, useful for TAA jitter and alpha-test. */
export function blueNoise(size = 64, seed = 7) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return makeDataMap(size, () => rnd(), { generateMipmaps: false });
}

function clamp255(v: number) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

/** sRGB hex -> linear THREE.Color, so authored palettes stay perceptual. */
export function srgb(hex: number) { return new THREE.Color().setHex(hex, THREE.SRGBColorSpace); }

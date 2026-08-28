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
  /**
   * Keep the CPU texels alive after the upload. Default false.
   *
   * Set it on the one texture in a hundred whose bytes are read back or
   * re-uploaded — see {@link dropTexelsAfterUpload}, which is what the default
   * does and why it is the default.
   */
  keepTexels?: boolean;
}

/**
 * Free a `DataTexture`'s texels the moment the GPU has them.
 *
 * **A generated map is uploaded once and then read only by the sampler**, but
 * the `Uint8Array` that fed it stays reachable from `texture.image.data` for
 * the life of the session. Measured (`bootprof --mem --play --prod`): **103.0
 * MB over 221 `DataTexture`s**, a whole second copy of the 198.9 MB the GPU
 * already holds. Three's `onUpdate` fires at the end of `uploadTexture`
 * (`WebGLTextures.js:1399`), which is the first instant the copy is provably
 * redundant.
 *
 * **The context-loss story, because this is where it is decided.** Three
 * restores a lost context on its own: `onContextLost` calls `preventDefault`,
 * `onContextRestore` calls `initGLContext()`, and every texture then re-uploads
 * from `texture.image` on next use. With the texels gone that re-upload writes
 * an empty image and the world comes back with black material maps and no
 * error. So the recovery moves up a level: `Renderer` watches for
 * `webglcontextrestored` and reloads the page, which regenerates everything
 * from the same generators. A lost context costs a reload instead of a seamless
 * restore, and that is the trade this function makes — stated, not implied.
 *
 * The second failure it guards is quieter: a later `needsUpdate = true` would
 * upload the same empty image. Nothing in the tree does that to a generated map
 * today, so rather than trust the grep, the property is replaced with one that
 * says so on the console. `keepTexels` is the opt-out for a caller that means
 * it.
 */
export function dropTexelsAfterUpload<T extends THREE.Texture>(tex: T): T {
  tex.onUpdate = (t: THREE.Texture) => {
    t.onUpdate = null;
    const img = t.image as { data?: ArrayBufferView | null } | null | undefined;
    if (!img || !img.data) return;
    img.data = null;
    // `needsUpdate` is a prototype setter that bumps `version`. Shadowing it on
    // the instance turns "the map went black and nobody knows why" into a line
    // in the console naming the texture.
    Object.defineProperty(t, 'needsUpdate', {
      configurable: true,
      get: () => false,
      set: (v: boolean) => {
        if (!v) return;
        console.error(`[TextureGen] needsUpdate on ${t.name || 'a generated texture'} after its texels were freed`
          + ' — pass keepTexels to the generator, or it uploads an empty image');
      },
    });
  };
  return tex;
}

/**
 * Per-texel callback. Writes the colour into `c` as three 0..1 channels rather
 * than returning one, so a 512x512 bake allocates no arrays.
 */
export type TexelFn = (u: number, v: number, c: number[], x: number, y: number) => void;

/** Per-texel callback for a single-channel map: returns one 0..1 value. */
export type ScalarFn = (u: number, v: number, x: number, y: number) => number;

/** Per-texel height sample, in whatever units the caller's slope maths expects. */
export type HeightFn = (u: number, v: number, x: number, y: number) => number;

/** Immediate-mode draw into a `size` x `size` canvas. */
export type CanvasDrawFn = (ctx: CanvasRenderingContext2D, size: number) => void;

/** Build an RGBA DataTexture from a per-texel callback returning [r,g,b] in 0..1. */
export function makeTexture(size: number, fn: TexelFn, {
  colorSpace = THREE.SRGBColorSpace,
  repeat = 1,
  anisotropy = 16,
  generateMipmaps = true,
  keepTexels = false,
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
  return keepTexels ? tex : dropTexelsAfterUpload(tex);
}

/** Single-channel (packed into RGB) map — for roughness / metalness / AO. */
export function makeDataMap(size: number, fn: ScalarFn, opts: TextureOpts = {}) {
  return makeTexture(size, (u, v, c, x, y) => {
    const g = fn(u, v, x, y);
    c[0] = c[1] = c[2] = g;
  }, { colorSpace: THREE.NoColorSpace, ...opts });
}

/**
 * Derive a tangent-space normal map from a height callback using Sobel.
 * `strength` scales the slope; 1 is subtle, 4 is pronounced.
 */
export function normalFromHeight(size: number, heightFn: HeightFn, strength = 2.0, opts: TextureOpts = {}) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) h[y * size + x] = heightFn(x / size, y / size, x, y);
  }
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  return makeTexture(size, (u, v, c, x, y) => {
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
export function aoFromHeight(size: number, heightFn: HeightFn, radius = 4, opts: TextureOpts = {}) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) h[y * size + x] = heightFn(x / size, y / size, x, y);
  }
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  return makeDataMap(size, (u, v, x, y) => {
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
export function canvasTexture(size: number, draw: CanvasDrawFn, { colorSpace = THREE.SRGBColorSpace, repeat = 1 } = {}) {
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
  return dropTexelsAfterUpload(tex);
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

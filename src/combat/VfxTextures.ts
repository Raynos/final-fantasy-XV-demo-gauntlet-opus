import * as THREE from 'three';
import { Noise } from '../util/Noise.ts';

/**
 * Procedural RGBA sprite atlas for combat VFX. Everything here is generated
 * once at boot and cached — the project ships no binary assets.
 *
 * All textures are authored with premultiply-friendly RGB (white/tinted core)
 * and a meaningful alpha channel so the same sprite works for additive and
 * alpha-blended particle systems.
 */

const cache = new Map();
const vfxNoise = new Noise(4242);

/** Build an RGBA DataTexture from a per-texel callback writing into `out[4]`. */
function rgba(size, fn, { colorSpace = THREE.SRGBColorSpace, mips = true } = {}) {
  const data = new Uint8Array(size * size * 4);
  const out = [0, 0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[0] = out[1] = out[2] = out[3] = 0;
      fn((x + 0.5) / size, (y + 0.5) / size, out, x, y);
      const i = (y * size + x) * 4;
      data[i] = c255(out[0]); data[i + 1] = c255(out[1]);
      data[i + 2] = c255(out[2]); data[i + 3] = c255(out[3]);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = colorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = mips;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function c255(v) { return v < 0 ? 0 : v > 1 ? 255 : (v * 255) | 0; }
function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

/** Cached accessor. */
function tex(name, make) {
  let t = cache.get(name);
  if (!t) { t = make(); cache.set(name, t); }
  return t;
}

/** Soft round glow — embers, motes, magic light, bloom kernels. */
export function glowSprite() {
  return tex('glow', () => rgba(128, (u, v, o) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    const core = Math.pow(Math.max(0, 1 - d), 3.2);
    const halo = Math.pow(Math.max(0, 1 - d), 1.15) * 0.45;
    const a = Math.min(1, core + halo);
    const white = smoothstep(0.55, 1.0, core);
    o[0] = 0.55 + 0.45 * white; o[1] = 0.55 + 0.45 * white; o[2] = 0.55 + 0.45 * white;
    o[3] = a;
  }));
}

/** Hot-cored streak used for velocity-stretched sparks. */
export function sparkSprite() {
  return tex('spark', () => rgba(64, (u, v, o) => {
    const x = (u - 0.5) * 2;         // across
    const y = (v - 0.5) * 2;         // along
    const across = Math.pow(Math.max(0, 1 - Math.abs(x)), 2.6);
    const along = Math.pow(Math.max(0, 1 - Math.abs(y)), 1.1);
    // hot leading head
    const head = Math.pow(Math.max(0, 1 - Math.hypot(x * 1.6, (y - 0.55) * 1.2)), 3.0);
    const a = Math.min(1, across * along + head * 0.9);
    const white = Math.min(1, across * along * 1.3 + head);
    o[0] = 0.5 + 0.5 * white; o[1] = 0.45 + 0.55 * white * white; o[2] = 0.35 + 0.65 * Math.pow(white, 3);
    o[3] = a;
  }));
}

/** Billowing smoke / dust puff with fbm-broken edges. */
export function smokeSprite() {
  return tex('smoke', () => rgba(128, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.hypot(dx, dy) * 2;
    const ang = Math.atan2(dy, dx);
    // radial fbm to break the silhouette
    const warp = vfxNoise.fbm2(Math.cos(ang) * 2.4 + 11, Math.sin(ang) * 2.4 + 7, 4) * 0.30;
    const edge = 1.0 + warp;
    let a = smoothstep(edge, edge * 0.16, d);
    // internal density variation
    const n = vfxNoise.fbm2(u * 5.5 + 3, v * 5.5 + 9, 5) * 0.5 + 0.5;
    a *= 0.55 + 0.65 * n;
    a = Math.min(1, a);
    const lum = 0.62 + 0.38 * n;
    o[0] = lum; o[1] = lum; o[2] = lum;
    o[3] = a;
  }));
}

/** Fine grain dust — softer, dimmer, no hard core. */
export function dustSprite() {
  return tex('dust', () => rgba(64, (u, v, o) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    const n = vfxNoise.fbm2(u * 7 + 21, v * 7 + 4, 4) * 0.5 + 0.5;
    let a = smoothstep(1.0, 0.05, d) * (0.4 + 0.6 * n);
    o[0] = o[1] = o[2] = 0.8 + 0.2 * n;
    o[3] = a * 0.85;
  }));
}

/** Faceted crystal shard silhouette — the warp-strike signature. */
export function shardSprite() {
  return tex('shard', () => rgba(64, (u, v, o) => {
    const x = (u - 0.5) * 2, y = (v - 0.5) * 2;
    // elongated diamond
    const d = Math.abs(x) / 0.42 + Math.abs(y) / 1.0;
    let a = smoothstep(1.05, 0.0, d);
    // internal facet line
    const facet = Math.pow(Math.max(0, 1 - Math.abs(x) * 7), 2.0) * smoothstep(1.0, 0.4, Math.abs(y));
    const hot = Math.min(1, Math.pow(a, 2.6) + facet);
    o[0] = 0.35 + 0.65 * hot; o[1] = 0.72 + 0.28 * hot; o[2] = 1.0;
    o[3] = Math.min(1, a * 0.92 + facet * 0.5);
  }));
}

/** Anisotropic lens/impact star — 4 long spikes + 4 short. */
export function flareSprite() {
  return tex('flare', () => rgba(256, (u, v, o) => {
    const x = (u - 0.5) * 2, y = (v - 0.5) * 2;
    const d = Math.hypot(x, y);
    const core = Math.pow(Math.max(0, 1 - d), 7.0);
    const horiz = Math.pow(Math.max(0, 1 - Math.abs(y) * 46), 2.4) * Math.pow(Math.max(0, 1 - Math.abs(x)), 2.4);
    const vert = Math.pow(Math.max(0, 1 - Math.abs(x) * 60), 2.4) * Math.pow(Math.max(0, 1 - Math.abs(y)), 2.6) * 0.7;
    const dx = (x + y) * 0.7071, dy = (x - y) * 0.7071;
    const diagA = Math.pow(Math.max(0, 1 - Math.abs(dy) * 90), 2.4) * Math.pow(Math.max(0, 1 - Math.abs(dx)), 3.0) * 0.35;
    const diagB = Math.pow(Math.max(0, 1 - Math.abs(dx) * 90), 2.4) * Math.pow(Math.max(0, 1 - Math.abs(dy)), 3.0) * 0.35;
    const halo = Math.pow(Math.max(0, 1 - d), 3.0) * 0.22;
    const a = Math.min(1, core + horiz + vert + diagA + diagB + halo);
    const white = Math.min(1, core * 2 + (horiz + vert) * 1.2);
    o[0] = 0.6 + 0.4 * white; o[1] = 0.7 + 0.3 * white; o[2] = 0.85 + 0.15 * white;
    o[3] = a;
  }));
}

/** Expanding shockwave ring gradient (radius along V). */
export function ringSprite() {
  return tex('ring', () => rgba(256, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.hypot(dx, dy) * 2;
    const ang = Math.atan2(dy, dx);
    // a thin annulus with a hard leading edge and a short inner wake,
    // eroded around the circumference so it never looks like a stencil
    const erode = 1 + vfxNoise.fbm2(Math.cos(ang) * 2.6 + 4, Math.sin(ang) * 2.6 + 9, 4) * 0.07;
    // a thin, hard-edged annulus with a short inner wake…
    let band = smoothstep(1.0 * erode, 0.975 * erode, d) * smoothstep(0.90 * erode, 0.965 * erode, d);
    let wake = smoothstep(0.965 * erode, 0.80 * erode, d) * 0.10;
    // …broken into feathered radial spokes, which is what makes it read as a
    // pressure wave rather than a smoke ring
    const spokeN = vfxNoise.fbm2(Math.cos(ang) * 5.0 + 21, Math.sin(ang) * 5.0 + 3, 3);
    const spokes = Math.pow(Math.abs(Math.sin(ang * 13 + spokeN * 3.0)), 0.55);
    band *= 0.30 + 0.85 * spokes;
    wake *= 0.15 + 1.5 * Math.pow(spokes, 2.2);
    const a = Math.min(1, band + wake);
    const hot = Math.pow(smoothstep(0.955, 0.995, d), 2.0);
    o[0] = 0.35 + 0.65 * hot; o[1] = 0.68 + 0.32 * hot; o[2] = 1.0;
    o[3] = a;
  }));
}

/** Tileable turbulence used to modulate trails, streaks and flame ribbons. */
export function turbulence() {
  return tex('turb', () => {
    const size = 128;
    return rgba(size, (u, v, o) => {
      // tileable fbm via 4D-ish trick: sample on a torus
      let sum = 0, amp = 1, norm = 0, f = 1;
      for (let i = 0; i < 5; i++) {
        const a1 = u * Math.PI * 2, a2 = v * Math.PI * 2;
        const n = vfxNoise.simplex3(
          Math.cos(a1) * f * 0.9 + 5, Math.sin(a1) * f * 0.9 + 2, (Math.cos(a2) + Math.sin(a2)) * f * 0.9
        );
        sum += n * amp; norm += amp; amp *= 0.5; f *= 2.03;
      }
      const g = sum / norm * 0.5 + 0.5;
      o[0] = o[1] = o[2] = g; o[3] = g;
    }, { colorSpace: THREE.NoColorSpace });
  });
}

/** Ground scorch decal — charred centre, ashy rim, irregular edge. */
export function scorchDecal() {
  return tex('scorch', () => rgba(256, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.hypot(dx, dy) * 2;
    const ang = Math.atan2(dy, dx);
    const warp = vfxNoise.fbm2(Math.cos(ang) * 3.1 + 31, Math.sin(ang) * 3.1 + 17, 4) * 0.26;
    const edge = 0.80 + warp;
    let a = smoothstep(edge, edge * 0.25, d);
    const n = vfxNoise.fbm2(u * 9 + 2, v * 9 + 13, 5) * 0.5 + 0.5;
    a *= 0.55 + 0.65 * n;
    // charred black core, warm ember rim
    const rim = smoothstep(0.35, 0.85, d) * (1 - smoothstep(0.85, 1.05, d));
    const soot = 0.025 + 0.055 * n;
    o[0] = soot + rim * 0.16; o[1] = soot * 0.9 + rim * 0.05; o[2] = soot * 0.9 + rim * 0.015;
    o[3] = Math.min(1, a);
  }));
}

/** Radial ground cracks — used for heavy impacts and Iron Giant footfalls. */
export function crackDecal() {
  return tex('crack', () => {
    const size = 256;
    const w = new Float32Array(size * size);
    // trace radial fractures out from the centre
    const rnd = new Noise(9001);
    const branches = 11;
    for (let b = 0; b < branches; b++) {
      const base = (b / branches) * Math.PI * 2 + rnd.simplex2(b * 3.1, 0.5) * 0.4;
      let x = size / 2, y = size / 2, a = base;
      const len = size * (0.30 + 0.18 * (rnd.simplex2(b, 7) * 0.5 + 0.5));
      const steps = Math.floor(len);
      for (let s = 0; s < steps; s++) {
        a += rnd.simplex2(s * 0.06, b * 5.0) * 0.22;
        x += Math.cos(a); y += Math.sin(a);
        const t = s / steps;
        const wid = Math.max(0.6, 2.6 * (1 - t));
        stamp(w, size, x, y, wid, 1 - t * 0.75);
        // sub-branch
        if (s === Math.floor(steps * 0.45)) {
          let bx = x, by = y, ba = a + (b % 2 ? 0.7 : -0.7);
          for (let k = 0; k < steps * 0.4; k++) {
            ba += rnd.simplex2(k * 0.08, b * 2.3) * 0.25;
            bx += Math.cos(ba); by += Math.sin(ba);
            stamp(w, size, bx, by, Math.max(0.5, 1.6 * (1 - k / (steps * 0.4))), 0.7 * (1 - k / (steps * 0.4)));
          }
        }
      }
    }
    return rgba(size, (u, v, o, x, y) => {
      const d = Math.hypot(u - 0.5, v - 0.5) * 2;
      const c = Math.min(1, w[y * size + x]) * smoothstep(1.05, 0.25, d);
      o[0] = 0.05; o[1] = 0.045; o[2] = 0.05;
      o[3] = c;
    });
  });
}

function stamp(buf, size, x, y, r, amt) {
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(size - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(size - 1, Math.ceil(y + r));
  for (let j = y0; j <= y1; j++) {
    for (let i = x0; i <= x1; i++) {
      const d = Math.hypot(i + 0.5 - x, j + 0.5 - y) / r;
      if (d < 1) buf[j * size + i] = Math.max(buf[j * size + i], (1 - d * d) * amt);
    }
  }
}

/** Frosted ice patch decal. */
export function frostDecal() {
  return tex('frost', () => rgba(256, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.hypot(dx, dy) * 2;
    const ang = Math.atan2(dy, dx);
    const spokes = Math.pow(Math.abs(Math.sin(ang * 6 + vfxNoise.fbm2(u * 4, v * 4, 3) * 2.0)), 3.0);
    const warp = vfxNoise.fbm2(Math.cos(ang) * 2.6 + 5, Math.sin(ang) * 2.6 + 3, 4) * 0.24;
    let a = smoothstep(0.95 + warp, 0.1, d) * (0.35 + 0.65 * spokes);
    const n = vfxNoise.fbm2(u * 12 + 8, v * 12 + 1, 4) * 0.5 + 0.5;
    a *= 0.5 + 0.7 * n;
    o[0] = 0.66; o[1] = 0.86; o[2] = 1.0;
    o[3] = Math.min(1, a);
  }));
}

/** Soft elliptical blob used for contact shadows / blood pools. */
export function blobDecal() {
  return tex('blob', () => rgba(64, (u, v, o) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    o[0] = o[1] = o[2] = 0.0;
    o[3] = Math.pow(Math.max(0, 1 - d), 2.0);
  }));
}

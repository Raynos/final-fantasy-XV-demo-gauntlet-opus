import * as THREE from 'three';
import { Rng } from '../../util/Rng.js';
import { canvasTexture, makeTexture, normalFromHeight } from '../../util/TextureGen.js';
import { Noise } from '../../util/Noise.js';

/**
 * Alpha-cut vegetation cards. Everything is drawn to a canvas so we get real
 * per-texel alpha (the DataTexture helpers in TextureGen force alpha=255).
 * All drawing is seeded, so two runs produce identical bytes.
 */

const cache = new Map();
function memo(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

/**
 * Hand-rolled mip chain for alpha-tested foliage.
 *
 * Two things GPU-generated mips get wrong for cut-out cards: they average
 * colour across transparent texels (dark fringes) and they let alpha coverage
 * collapse, so a distant tree either dissolves or — worse, on some sRGB paths —
 * floods to fully opaque and renders as a solid rectangle. We box-filter with
 * alpha-weighted colour and then rescale alpha at every level so the fraction
 * of texels passing the alpha test stays constant.
 */
function buildAlphaMips(data, size, alphaRef = 0.42) {
  const coverageOf = (buf, scale) => {
    let n = 0;
    for (let i = 3; i < buf.length; i += 4) if ((buf[i] / 255) * scale >= alphaRef) n++;
    return n / (buf.length / 4);
  };
  const target = coverageOf(data, 1);
  const mips = [{ data, width: size, height: size }];
  let src = data, w = size, h = size;

  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
    const dst = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const sx = Math.min(w - 1, x * 2 + dx), sy = Math.min(h - 1, y * 2 + dy);
            const i = (sy * w + sx) * 4;
            const av = src[i + 3] / 255;
            r += src[i] * av; g += src[i + 1] * av; b += src[i + 2] * av;
            a += av; n++;
          }
        }
        const o = (y * nw + x) * 4;
        dst[o] = a > 0 ? Math.min(255, r / a) : 0;
        dst[o + 1] = a > 0 ? Math.min(255, g / a) : 0;
        dst[o + 2] = a > 0 ? Math.min(255, b / a) : 0;
        dst[o + 3] = Math.round((a / n) * 255);
      }
    }
    // binary-search an alpha scale that restores the original coverage
    let lo = 0.25, hi = 8;
    for (let it = 0; it < 12; it++) {
      const mid = (lo + hi) * 0.5;
      if (coverageOf(dst, mid) < target) lo = mid; else hi = mid;
    }
    const s = (lo + hi) * 0.5;
    if (Math.abs(s - 1) > 0.01) {
      for (let i = 3; i < dst.length; i += 4) dst[i] = Math.min(255, Math.round(dst[i] * s));
    }
    mips.push({ data: dst, width: nw, height: nh });
    src = dst; w = nw; h = nh;
  }
  return mips;
}

/** Apply the hand-built mip chain to an RGBA DataTexture. */
function withAlphaMips(tex, data, size, alphaRef) {
  tex.mipmaps = buildAlphaMips(data, size, alphaRef);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Draw to a 2D canvas, then hand the raw RGBA bytes to a DataTexture.
 *
 * Uploading an HTMLCanvasElement directly loses the alpha channel in this
 * renderer path, which silently turns every alpha-tested card into an opaque
 * rectangle. Reading the pixels back with getImageData (already
 * un-premultiplied) and uploading them as data sidesteps that entirely.
 */
export function alphaTex(size, draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, size, size);
  draw(ctx, size);
  const src = ctx.getImageData(0, 0, size, size).data;
  // DataTexture ignores flipY, so flip rows here to keep the usual
  // "v=0 is the bottom of the canvas" convention every card geometry assumes.
  const data = new Uint8Array(size * size * 4);
  const row = size * 4;
  for (let y = 0; y < size; y++) {
    data.set(src.subarray((size - 1 - y) * row, (size - y) * row), y * row);
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.flipY = false;
  return withAlphaMips(tex, data, size, 0.4);
}

/** One tapered, curved blade stroke. */
function blade(ctx, x0, y0, len, wid, lean, colA, colB) {
  const steps = 8;
  const left = [], right = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = wid * (1 - Math.pow(t, 1.5));
    const bx = x0 + lean * t * t * len;
    const by = y0 - t * len;
    left.push([bx - w, by]);
    right.push([bx + w, by]);
  }
  const g = ctx.createLinearGradient(x0, y0, x0, y0 - len);
  g.addColorStop(0, colA);
  g.addColorStop(1, colB);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill();
}

/** Dense clump of grass blades on a transparent card. */
export function grassClumpTex(variant = 0, count = 46) {
  return memo(`clump${variant}${count}`, () => alphaTex(256, (ctx, s) => {
    const rng = new Rng(4242 + variant * 977);
    for (let i = 0; i < count; i++) {
      const x = s * 0.5 + rng.gauss(0, s * 0.19);
      const len = s * rng.range(0.42, 0.94);
      const w = s * rng.range(0.008, 0.021);
      const lean = rng.gauss(0, 0.55);
      // luminance-only: the instance colour supplies the hue so clumps can be
      // matched to the ground they grow out of.
      const dark = 96 + rng.range(0, 30);
      const lite = 176 + rng.range(0, 48);
      blade(ctx, x, s * 0.995, len, w, lean,
        `rgba(${dark * 0.88 | 0},${dark | 0},${dark * 0.78 | 0},1)`,
        `rgba(${lite * 0.95 | 0},${lite | 0},${lite * 0.84 | 0},1)`);
    }
  }));
}

/** Leafy canopy card — a mass of small leaves, used on tree branch tips. */
export function leafClusterTex(kind = 'broad') {
  return memo(`leaf${kind}`, () => alphaTex(256, (ctx, s) => {
    const rng = new Rng(kind === 'broad' ? 8811 : kind === 'conifer' ? 5150 : 3320);
    const n = kind === 'conifer' ? 190 : 120;
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = Math.pow(rng.next(), 0.62) * s * 0.47;
      const x = s * 0.5 + Math.cos(a) * r;
      const y = s * 0.5 + Math.sin(a) * r * 0.86;
      const shade = 0.45 + 0.55 * (1 - r / (s * 0.5));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rng.range(-Math.PI, Math.PI));
      if (kind === 'conifer') {
        const L = s * rng.range(0.05, 0.13);
        const g = 60 + shade * 70;
        ctx.strokeStyle = `rgba(${g * 0.5 | 0},${g | 0},${g * 0.52 | 0},1)`;
        ctx.lineWidth = s * 0.008;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -L); ctx.stroke();
        for (let k = 1; k < 6; k++) {
          const yy = -L * (k / 6);
          const ll = L * 0.34 * (1 - k / 7);
          ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(-ll, yy + ll * 0.6); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(ll, yy + ll * 0.6); ctx.stroke();
        }
      } else {
        const rx = s * rng.range(0.028, 0.062);
        const ry = rx * rng.range(1.5, 2.5);
        // sun-bleached, slightly desaturated foliage — never candy green
        const g = kind === 'dry' ? 116 + shade * 54 : 60 + shade * 74;
        const col = kind === 'dry'
          ? `rgba(${g * 1.1 | 0},${g | 0},${g * 0.6 | 0},1)`
          : `rgba(${g * 0.78 | 0},${g | 0},${g * 0.52 | 0},1)`;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(0, -ry);
        ctx.quadraticCurveTo(rx, 0, 0, ry);
        ctx.quadraticCurveTo(-rx, 0, 0, -ry);
        ctx.fill();
      }
      ctx.restore();
    }
  }));
}

/** Arching fern frond. */
export function fernTex() {
  return memo('fern', () => alphaTex(256, (ctx, s) => {
    const rng = new Rng(717);
    ctx.lineCap = 'round';
    for (let f = 0; f < 5; f++) {
      const bx = s * (0.2 + f * 0.15);
      const lean = (f - 2) * 0.16;
      const len = s * rng.range(0.72, 0.96);
      ctx.strokeStyle = 'rgba(64,88,44,1)';
      ctx.lineWidth = s * 0.007;
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const x = bx + lean * t * t * s * 0.5;
        const y = s - t * len;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      for (let i = 2; i <= 15; i++) {
        const t = i / 16;
        const x = bx + lean * t * t * s * 0.5;
        const y = s - t * len;
        const ll = s * 0.075 * Math.sin(t * Math.PI * 0.95);
        const g = 92 + rng.range(0, 46);
        ctx.strokeStyle = `rgba(${g * 0.52 | 0},${g | 0},${g * 0.44 | 0},1)`;
        ctx.lineWidth = s * 0.0125;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ll, y - ll * 0.42); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ll, y - ll * 0.42); ctx.stroke();
      }
    }
  }));
}

/**
 * Bake a distance impostor by rendering the real tree geometry flat into an
 * offscreen target. Hand-drawn billboards never match the geometry LOD; a bake
 * does, so the swap at the LOD boundary is invisible.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {{wood:THREE.BufferGeometry, leaves:THREE.BufferGeometry|null,
 *          woodMap:THREE.Texture, woodColor:number, leafMap:THREE.Texture,
 *          height:number, radius:number}} src
 * @param {number} size texture resolution
 * @returns {THREE.DataTexture}
 */
export function bakeTreeImpostor(renderer, src, size = 256) {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    samples: 4, depthBuffer: true, stencilBuffer: false,
  });
  rt.texture.colorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const woodMat = new THREE.MeshBasicMaterial({
    map: src.woodMap, color: src.woodColor,
  });
  scene.add(new THREE.Mesh(src.wood, woodMat));
  let leafMat = null;
  if (src.leaves) {
    leafMat = new THREE.MeshBasicMaterial({
      map: src.leafMap, color: 0xffffff, vertexColors: true,
      alphaTest: 0.45, side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(src.leaves, leafMat));
  }

  const halfW = src.radius * 1.06;
  const top = src.height * 1.02;
  const cam = new THREE.OrthographicCamera(-halfW, halfW, top, 0, -600, 600);
  cam.position.set(0, 0, 300);
  cam.lookAt(0, 0, 0);

  const prevTarget = renderer.getRenderTarget();
  const prevClear = new THREE.Color();
  renderer.getClearColor(prevClear);
  const prevAlpha = renderer.getClearAlpha();

  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, false);
  renderer.render(scene, cam);

  const buf = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);

  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);

  // MSAA resolve leaves edge texels premultiplied against a black clear;
  // undo that so the alpha-tested card doesn't get a dark fringe.
  for (let i = 0; i < buf.length; i += 4) {
    const a = buf[i + 3];
    if (a > 0 && a < 255) {
      const k = 255 / a;
      buf[i] = Math.min(255, buf[i] * k);
      buf[i + 1] = Math.min(255, buf[i + 1] * k);
      buf[i + 2] = Math.min(255, buf[i + 2] * k);
    }
  }

  const tex = new THREE.DataTexture(buf, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  withAlphaMips(tex, buf, size, 0.4);

  rt.dispose();
  woodMat.dispose();
  if (leafMat) leafMat.dispose();
  return tex;
}

/** Bark albedo + normal, shared by every woody thing. */
export function barkMaps(tint = 0x6b5642) {
  return memo(`bark${tint}`, () => {
    const n = new Noise(2024);
    const base = new THREE.Color().setHex(tint, THREE.SRGBColorSpace);
    const h = (u, v) => {
      const rings = Math.sin(v * 90 + n.fbm2(u * 5, v * 30, 3) * 6) * 0.5 + 0.5;
      const streak = n.fbm2(u * 7, v * 44, 4) * 0.5 + 0.5;
      return rings * 0.35 + streak * 0.65;
    };
    const map = makeTexture(256, (u, v, c) => {
      const k = 0.55 + h(u, v) * 0.75;
      const moss = Math.max(0, n.fbm2(u * 4 + 30, v * 4, 3)) * 0.35;
      c[0] = base.r * k * (1 - moss * 0.6);
      c[1] = base.g * k * (1 - moss * 0.1);
      c[2] = base.b * k * (1 - moss * 0.7);
    }, { repeat: 1 });
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    const normalMap = normalFromHeight(256, h, 2.6);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    return { map, normalMap };
  });
}

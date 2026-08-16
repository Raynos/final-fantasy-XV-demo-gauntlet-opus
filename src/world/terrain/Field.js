import * as THREE from 'three';
import { Noise } from '../../util/Noise.js';
import { Rng } from '../../util/Rng.js';
import { Road } from './Road.js';

/**
 * The CPU heightfield: a composite of ridged multifractal ranges, domain-warped
 * fbm, terraced mesas, hand-placed hero landmarks and a droplet hydraulic
 * erosion pass. Everything the GPU draws is a bilinear sample of these grids,
 * so `heightAt()` matches the rendered surface exactly.
 *
 *   near grid : 2048^2 over +/-1536 m   (1.5 m cells)
 *   far grid  : 1024^2 over +/-6144 m   (12 m cells) — the horizon ranges
 */

export const N = 2048;
export const HALF = 1536;
export const CELL = (HALF * 2) / N;          // 1.5 m
export const FAR_N = 1024;
export const FAR_HALF = 6144;
export const FAR_CELL = (FAR_HALF * 2) / FAR_N;   // 12 m
/** Beyond this Chebyshev radius the far grid takes over completely. */
export const BLEND_OUT = 1400;
const BLEND_IN = 1120;

const COARSE = 512;                           // macro pass resolution (6 m)
const COARSE_CELL = (HALF * 2) / COARSE;

/** Hero landmarks — fixed world anchors so shots and props can frame them. */
export const LANDMARKS = {
  blackrockMesa: { x: -215, z: -395, r: 132, h: 108, kind: 'mesa' },
  northMesa: { x: -640, z: -900, r: 215, h: 168, kind: 'mesa' },
  eastButtes: { x: 305, z: -300, r: 66, h: 60, kind: 'buttes' },
  westScarp: { x: -350, z: 300, r: 118, h: 86, kind: 'mesa' },
  spireRidge: { x: -545, z: 350, r: 150, h: 72, kind: 'spires' },
  canyon: { x: 60, z: 430, r: 760, h: -62, kind: 'canyon' },
  basin: { x: 0, z: 0, r: 130, h: 0, kind: 'basin' },
};

export class Field {
  constructor(seed = 1337) {
    this.N = N; this.HALF = HALF; this.CELL = CELL;
    this.n = new Noise(seed);
    this.n2 = new Noise(seed ^ 0x5f3a);
    this.n3 = new Noise(seed ^ 0x9e17);
    this.road = null;
    this.stats = {};
  }

  /** Build every grid. Synchronous; ~3-6 s. */
  build() {
    const t0 = performance.now();
    this.h = new Float32Array(N * N);
    this.far = new Float32Array(FAR_N * FAR_N);
    this.flow = new Float32Array(N * N);
    this.sed = new Float32Array(N * N);
    this.roadMask = new Float32Array(N * N);
    this.roadLat = new Float32Array(N * N);

    this._buildFar();
    this._buildMacro();
    this._applyLandmarks();
    this._addDetail();
    this._stitchFar();
    this._erode();
    this._talus();
    this._outcrops();
    this._stitchFar();

    this.roadSpline = new Road();
    // Road.carve() writes into field.h / field.road
    this.roadSpline.carve({
      N, HALF, CELL, h: this.h, road: this.roadMask, roadLat: this.roadLat,
      rawHeightAt: (x, z) => this.rawHeightAt(x, z),
    });

    this._derive();
    this.stats.buildMs = Math.round(performance.now() - t0);
  }

  // ---------------------------------------------------------------- far field

  /** Distant ranges: ridged multifractal that only switches on past ~1.2 km. */
  farHeight(x, z) {
    const n = this.n, n2 = this.n2;
    const wx = x * 0.00042, wz = z * 0.00042;
    const q1 = n2.fbm2(wx * 0.62 + 11.3, wz * 0.62 - 4.1, 3);
    const q2 = n2.fbm2(wx * 0.62 - 7.7, wz * 0.62 + 9.4, 3);
    const rg = n.ridged2(wx + 0.85 * q1, wz + 0.85 * q2, 5, 2.03, 0.44);

    const r = Math.hypot(x, z) / 1000;
    // the northern (-Z) wall is the tallest: it backs the hero and vista shots
    const dir = 0.62 + 0.38 * (-z / Math.max(1, Math.hypot(x, z)));
    // massif grouping: ranges cluster instead of every peak standing alone
    const massif = 0.35 + 0.75 * Math.max(0, n2.fbm2(x * 0.00034 - 8.2, z * 0.00034 + 3.5, 3));
    const mask = smoothstep(1.05, 2.45, r)
      * (0.5 + 0.5 * n.fbm2(x * 0.00019 + 31, z * 0.00019 - 17, 3) + 0.001) * dir * massif;
    const plain = 9 + 30 * n.fbm2(x * 0.00052 + 3.3, z * 0.00052 + 8.1, 4);

    let h = plain + Math.pow(Math.max(0, rg - 0.10), 1.45) * 780 * Math.max(0, mask);
    // shoulders: broad fbm bulk under the ridges so they read as massifs
    h += smoothstep(1.2, 2.6, r) * 130 * Math.max(0, n.fbm2(wx * 0.8 + 2.4, wz * 0.8 - 6.1, 4)) * dir;
    // a second, hazier range further out to layer the horizon
    h += smoothstep(2.3, 4.0, r) * 330 * Math.pow(n.ridged2(wx * 0.52 + 5.5, wz * 0.52 - 2.2, 4, 2.0, 0.46), 1.4);
    return h;
  }

  _buildFar() {
    const f = this.far;
    for (let j = 0; j < FAR_N; j++) {
      const z = -FAR_HALF + j * FAR_CELL;
      for (let i = 0; i < FAR_N; i++) {
        f[j * FAR_N + i] = this.farHeight(-FAR_HALF + i * FAR_CELL, z);
      }
    }
    // smoothing passes so the 12 m grid reads as rock, not as noise
    const tmp = new Float32Array(f.length);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < FAR_N; j++) {
        for (let i = 0; i < FAR_N; i++) {
          const a = this._farAt(i - 1, j), b = this._farAt(i + 1, j);
          const c = this._farAt(i, j - 1), d = this._farAt(i, j + 1);
          tmp[j * FAR_N + i] = f[j * FAR_N + i] * 0.5 + (a + b + c + d) * 0.125;
        }
      }
      f.set(tmp);
    }
  }

  _farAt(i, j) {
    const ii = i < 0 ? 0 : i > FAR_N - 1 ? FAR_N - 1 : i;
    const jj = j < 0 ? 0 : j > FAR_N - 1 ? FAR_N - 1 : j;
    return this.far[jj * FAR_N + ii];
  }

  // --------------------------------------------------------------- near field

  /** Macro landscape evaluated on the 6 m grid, then bicubically upsampled. */
  macroHeight(x, z) {
    const n = this.n, n2 = this.n2;

    // large domain warp — kills the "obviously procedural" grid feel
    const q1 = n2.fbm2(x * 0.00085 + 3.1, z * 0.00085 + 7.7, 3);
    const q2 = n2.fbm2(x * 0.00085 - 5.3, z * 0.00085 + 1.9, 3);
    const wx = x + 280 * q1, wz = z + 280 * q2;

    // regional undulation + mid-scale rolling ground
    let h = 12 + 30 * n.fbm2(wx * 0.00058, wz * 0.00058, 4);
    h += 14 * n.fbm2(wx * 0.0021 + 12.4, wz * 0.0021 - 5.6, 4);
    h += 7.5 * n2.fbm2(wx * 0.0058 - 2.2, wz * 0.0058 + 6.3, 4);

    // low benched ridges through the basin — mid-ground structure at 60-250 m
    const bench = n.ridged2(wx * 0.0042 + 3.7, wz * 0.0042 - 9.1, 4, 2.05, 0.55);
    h += Math.pow(Math.max(0, bench - 0.30) / 0.70, 1.6) * 34;

    // ridged badland belt: kept clear of the spawn basin so the player has room
    const r = Math.hypot(x, z);
    const belt = smoothstep(165, 820, r);
    const rg = n.ridged2(wx * 0.00135 + 21.5, wz * 0.00135 + 4.2, 5, 2.11, 0.5);
    h += Math.pow(Math.max(0, rg - 0.16) / 0.84, 1.85) * 215 * belt;

    // a shallow bowl centred on the spawn so the camera looks *across* the land
    h -= 7 * Math.exp(-(r * r) / (2 * 320 * 320));
    return h;
  }

  _buildMacro() {
    const c = new Float32Array(COARSE * COARSE);
    for (let j = 0; j < COARSE; j++) {
      const z = -HALF + j * COARSE_CELL;
      for (let i = 0; i < COARSE; i++) {
        c[j * COARSE + i] = this.macroHeight(-HALF + i * COARSE_CELL, z);
      }
    }
    this._coarse = c;

    const at = (i, j) => {
      const ii = i < 0 ? 0 : i > COARSE - 1 ? COARSE - 1 : i;
      const jj = j < 0 ? 0 : j > COARSE - 1 ? COARSE - 1 : j;
      return c[jj * COARSE + ii];
    };
    const cr = (p0, p1, p2, p3, t) => {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };

    const h = this.h;
    const scale = CELL / COARSE_CELL;   // 0.25
    const col = new Float32Array(4);
    for (let j = 0; j < N; j++) {
      const fz = j * scale, jz = Math.floor(fz), tz = fz - jz;
      for (let i = 0; i < N; i++) {
        const fx = i * scale, ix = Math.floor(fx), tx = fx - ix;
        for (let k = 0; k < 4; k++) {
          col[k] = cr(at(ix - 1, jz - 1 + k), at(ix, jz - 1 + k), at(ix + 1, jz - 1 + k), at(ix + 2, jz - 1 + k), tx);
        }
        h[j * N + i] = cr(col[0], col[1], col[2], col[3], tz);
      }
    }

    // terracing + valley flattening at full resolution: crisp mesa risers and
    // genuinely flat basin floors, which is what sells "badlands".
    const n2 = this.n2;
    for (let j = 0; j < N; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        const x = -HALF + i * CELL;
        let v = h[idx];

        if (v > 26) {
          const step = 19 + 9 * n2.simplex2(x * 0.0011 + 4.4, z * 0.0011 - 2.1);
          const t = v / step, fl = Math.floor(t), fr = t - fl;
          const k = smoothstep(0.46, 0.9, fr);
          const terraced = (fl + k) * step;
          const amount = 0.28 + 0.45 * (0.5 + 0.5 * n2.fbm2(x * 0.0016 + 9, z * 0.0016 + 3, 3));
          v += (terraced - v) * amount * smoothstep(26, 52, v);
        }
        // compress low ground toward a flat pan
        const floor0 = 9.5 + 5 * n2.fbm2(x * 0.0009 - 12, z * 0.0009 + 6, 3);
        if (v < floor0) v = floor0 - (floor0 - v) * 0.42;

        // The spawn basin is authored, not emergent: the shot cameras sit at
        // 18-26 m and must look *across* the land, so pull the inner 400 m
        // toward a shallow pan while keeping its shape.
        const r = Math.hypot(x, z);
        const k = 1 - smoothstep(110, 400, r);
        if (k > 0.001) {
          const target = 6.2 + 3.4 * n2.fbm2(x * 0.0038 + 21, z * 0.0038 - 13, 3)
            + 2.2 * n2.fbm2(x * 0.011 - 4, z * 0.011 + 9, 3);
          v = v * (1 - k) + (target + (v - target) * 0.15) * k;
        }

        h[idx] = v;
      }
    }
  }

  /** High-frequency relief, stronger on slopes than on pans. */
  _addDetail() {
    const h = this.h, n2 = this.n2, n3 = this.n3;
    const grad = new Float32Array(N * N);
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const idx = j * N + i;
        const gx = (h[idx + 1] - h[idx - 1]) / (2 * CELL);
        const gz = (h[idx + N] - h[idx - N]) / (2 * CELL);
        grad[idx] = Math.min(1, Math.hypot(gx, gz));
      }
    }
    this.slope0 = grad;

    for (let j = 0; j < N; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        const x = -HALF + i * CELL;
        const s = grad[idx];
        const rough = 0.45 + 1.25 * s;
        // eroded dry-wash texture: ridged noise reads as gullies, not as bumps
        const gully = n2.ridged2(x * 0.0072 + 2.2, z * 0.0072 - 4.4, 3, 2.1, 0.55);
        let d = -3.1 * Math.pow(Math.max(0, gully - 0.34) / 0.66, 1.5) * (0.4 + 0.9 * s);
        d += 2.6 * n2.fbm2(x * 0.0135, z * 0.0135, 3) * (0.6 + 0.95 * s);
        d += 1.25 * n3.fbm2(x * 0.052 + 4.1, z * 0.052 - 2.7, 3) * rough;
        d += 0.42 * n3.simplex2(x * 0.145 + 9.3, z * 0.145 + 1.4) * rough;
        // rubble / small outcrops where it is already rocky
        if (s > 0.34) {
          const w = n3.worley2(x * 0.055, z * 0.055);
          d += Math.max(0, 0.58 - w.f1) * 4.6 * (s - 0.34);
        }
        h[idx] += d;
      }
    }
  }

  // -------------------------------------------------------------- landmarks

  _applyLandmarks() {
    const L = LANDMARKS;
    // hero mesa: sits on the vista_dawn and hero_full sight lines at ~450 m
    this._mesa(L.blackrockMesa.x, L.blackrockMesa.z, L.blackrockMesa.r, L.blackrockMesa.h, 0.30);
    this._mesa(-118, -560, 54, 58, 0.45);            // outlier stack in front of it
    this._mesa(L.northMesa.x, L.northMesa.z, L.northMesa.r, L.northMesa.h, 0.28);
    this._mesa(-1080, -520, 150, 122, 0.34);
    this._mesa(-760, -180, 96, 62, 0.42);

    // butte cluster to the north-east — the vista_noon sight line
    this._mesa(305, -300, 60, 58, 0.48);
    this._mesa(392, -212, 34, 41, 0.55);
    this._mesa(232, -392, 42, 47, 0.52);
    this._mesa(560, -470, 80, 76, 0.44);
    this._mesa(880, -700, 130, 104, 0.38);

    // western escarpment — the vista_dusk sight line
    this._mesa(L.westScarp.x, L.westScarp.z, L.westScarp.r, L.westScarp.h, 0.32);
    this._mesa(-520, 210, 70, 55, 0.46);
    this._mesa(-900, 480, 160, 118, 0.34);

    // spire ridges — fangs that catch a low sun
    const rng = new Rng(9931);
    this._spireRidge(L.spireRidge.x, L.spireRidge.z, 320, 170, 9, rng);
    this._spireRidge(430, 330, 260, -120, 6, rng);
    this._spireRidge(-40, -880, 380, 90, 7, rng);

    this._canyon();
  }

  _spireRidge(cx, cz, spanX, spanZ, count, rng) {
    for (let k = 0; k < count; k++) {
      const t = k / (count - 1) - 0.5;
      const sx = cx + t * spanX + rng.range(-26, 26);
      const sz = cz + t * spanZ + rng.range(-30, 30);
      this._spire(sx, sz, rng.range(10, 24), rng.range(24, 76));
    }
    for (let k = 0; k < 4; k++) {
      const a = rng.range(0, 6.283), d = rng.range(90, 240);
      this._spire(cx + Math.cos(a) * d, cz + Math.sin(a) * d, rng.range(7, 15), rng.range(12, 32));
    }
  }

  /**
   * Rock outcrops scattered across the basin. Added after erosion so they stay
   * crisp — these are what give the open ground scale and something for the eye
   * to land on.
   */
  _outcrops() {
    const rng = new Rng(4242);
    for (let k = 0; k < 2400; k++) {
      const a = rng.range(0, 6.283);
      const d = Math.pow(rng.next(), 0.55) * 1250;
      const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
      if (Math.max(Math.abs(cx), Math.abs(cz)) > 1300) continue;
      const i = Math.round((cx + HALF) / CELL), j = Math.round((cz + HALF) / CELL);
      if (i < 4 || j < 4 || i > N - 5 || j > N - 5) continue;
      const s = this.slope0 ? this.slope0[j * N + i] : 0.2;
      // more outcrops on already-rocky ground, but keep some out on the pans
      if (rng.next() > 0.24 + s * 1.5) continue;
      const big = rng.next() < 0.12;
      const r = (big ? rng.range(16, 40) : rng.range(3.5, 16)) * (0.75 + s);
      const hh = (big ? rng.range(4, 13) : rng.range(0.9, 4.4)) * (0.6 + s * 2.0);
      this._outcrop(cx, cz, r, hh, rng);
    }
  }

  _outcrop(cx, cz, radius, height, rng) {
    const h = this.h, n = this.n3;
    const R = radius * 2.2;
    const box = this._box(cx, cz, R);
    const ph = rng.range(0, 6.283);
    const ecc = rng.range(0.6, 1.0);
    const ca = Math.cos(ph), sa = Math.sin(ph);
    for (let j = box.j0; j <= box.j1; j++) {
      const z = -HALF + j * CELL;
      for (let i = box.i0; i <= box.i1; i++) {
        const x = -HALF + i * CELL;
        let dx = x - cx, dz = z - cz;
        const rx = dx * ca + dz * sa, rz = (-dx * sa + dz * ca) / ecc;
        const ang = Math.atan2(rz, rx);
        const warp = 1 + 0.34 * n.fbm2(Math.cos(ang) * 2.4 + cx * 0.05, Math.sin(ang) * 2.4 + cz * 0.05, 3);
        const d = Math.hypot(rx, rz) / warp;
        if (d > R) continue;
        const t = Math.max(0, Math.min(1, 1 - d / radius));
        h[j * N + i] += height * Math.pow(t, 0.34);
      }
    }
  }

  /** Flat-topped mesa with a steep noise-warped wall and a talus skirt. */
  _mesa(cx, cz, radius, height, wallFrac) {
    const h = this.h, n = this.n2;
    const R = radius * 2.6;
    const box = this._box(cx, cz, R);
    const wall = radius * wallFrac;
    for (let j = box.j0; j <= box.j1; j++) {
      const z = -HALF + j * CELL;
      for (let i = box.i0; i <= box.i1; i++) {
        const x = -HALF + i * CELL;
        const dx = x - cx, dz = z - cz;
        let d = Math.hypot(dx, dz);
        if (d > R) continue;
        const ang = Math.atan2(dz, dx);
        // warp the rim so the plan view is not a circle
        const warp = 1 + 0.26 * n.fbm2(Math.cos(ang) * 1.7 + cx * 0.01, Math.sin(ang) * 1.7 + cz * 0.01, 3)
          + 0.14 * n.fbm2(x * 0.006 + 3, z * 0.006 - 1, 3);
        const rr = radius * warp;
        const t = Math.max(0, Math.min(1, 1 - (d - rr + wall) / wall));
        let v = height * Math.pow(t, 0.42);
        // terraced strata on the wall
        if (t > 0.02 && t < 0.995) {
          const bands = 5.5 + 3 * n.simplex2(cx * 0.01, cz * 0.01);
          v += height * 0.045 * Math.sin(t * bands * Math.PI * 2) * (1 - t);
        }
        // talus skirt of eroded debris
        const skirt = Math.max(0, 1 - (d - rr) / (radius * 1.35));
        v += height * 0.20 * Math.pow(Math.max(0, Math.min(1, skirt)), 2.1) * (d > rr ? 1 : 0);
        h[j * N + i] += v;
      }
    }
  }

  _spire(cx, cz, radius, height) {
    const h = this.h, n = this.n3;
    const R = radius * 3.2;
    const box = this._box(cx, cz, R);
    for (let j = box.j0; j <= box.j1; j++) {
      const z = -HALF + j * CELL;
      for (let i = box.i0; i <= box.i1; i++) {
        const x = -HALF + i * CELL;
        const dx = x - cx, dz = z - cz;
        const ang = Math.atan2(dz, dx);
        const warp = 1 + 0.3 * n.fbm2(Math.cos(ang) * 2.3 + cx * 0.02, Math.sin(ang) * 2.3 + cz * 0.02, 3);
        const d = Math.hypot(dx, dz) / warp;
        if (d > R) continue;
        const t = Math.max(0, 1 - d / radius);
        let v = height * Math.pow(t, 1.7);
        v += height * 0.26 * Math.pow(Math.max(0, 1 - d / (radius * 2.6)), 2.2);
        h[j * N + i] += v;
      }
    }
  }

  /**
   * A branching wash / canyon cut across the southern basin. The cut is applied
   * from a min-distance field so overlapping spine segments can't stack.
   */
  _canyon() {
    const h = this.h, n = this.n2;
    const spines = [
      { pts: [], depth: 62, halfW: 44, from: -900, to: 980, base: 430, amp: 165, ph: 0.6, seed: 7.7 },
      { pts: [], depth: 34, halfW: 22, from: -220, to: 700, base: 690, amp: 120, ph: 2.4, seed: 3.1 },
    ];
    const dist = new Float32Array(N * N).fill(1e9);
    const R = 150;

    for (const sp of spines) {
      for (let k = 0; k <= 140; k++) {
        const t = k / 140;
        const x = sp.from + t * (sp.to - sp.from);
        const z = sp.base + sp.amp * Math.sin(t * 3.1 + sp.ph) + 90 * n.fbm2(x * 0.0018, sp.seed, 3);
        sp.pts.push([x, z]);
      }
    }

    // pass 1 — signed distance stamp
    for (const sp of spines) {
      const scale = sp.halfW / spines[0].halfW;
      for (let s = 0; s < sp.pts.length - 1; s++) {
        const a = sp.pts[s], b = sp.pts[s + 1];
        const box = this._box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, R + Math.hypot(b[0] - a[0], b[1] - a[1]));
        const ex = b[0] - a[0], ez = b[1] - a[1];
        const len2 = ex * ex + ez * ez || 1;
        for (let j = box.j0; j <= box.j1; j++) {
          const z = -HALF + j * CELL;
          for (let i = box.i0; i <= box.i1; i++) {
            const x = -HALF + i * CELL;
            let t = ((x - a[0]) * ex + (z - a[1]) * ez) / len2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const d = Math.hypot(a[0] + ex * t - x, a[1] + ez * t - z) / scale;
            const idx = j * N + i;
            if (d < dist[idx]) dist[idx] = d;
          }
        }
      }
    }

    // pass 2 — carve once, with terraced walls and a flat gravel floor
    const depth = spines[0].depth, halfW = spines[0].halfW;
    for (let j = 0; j < N; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        let d = dist[idx];
        if (d > R) continue;
        const x = -HALF + i * CELL;
        d += 24 * n.fbm2(x * 0.0042 + 1.7, z * 0.0042 - 3.3, 3) + 7 * n.simplex2(x * 0.017, z * 0.017);
        const u = Math.max(0, Math.min(1, d / halfW));
        const wall = u < 1 ? 1 - Math.pow(u, 2.4) : 0;
        const stepped = Math.round(wall * 5) / 5 * 0.5 + wall * 0.5;
        const rim = 7 * Math.max(0, 1 - Math.abs(d - halfW * 1.3) / 52);
        h[idx] += -depth * stepped + rim;
      }
    }
  }

  _box(cx, cz, R) {
    return {
      i0: Math.max(0, Math.floor((cx - R + HALF) / CELL)),
      i1: Math.min(N - 1, Math.ceil((cx + R + HALF) / CELL)),
      j0: Math.max(0, Math.floor((cz - R + HALF) / CELL)),
      j1: Math.min(N - 1, Math.ceil((cz + R + HALF) / CELL)),
    };
  }

  // --------------------------------------------------------------- stitching

  /** Blend the near grid into the far grid so the domain edge is invisible. */
  _stitchFar() {
    const h = this.h;
    for (let j = 0; j < N; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < N; i++) {
        const x = -HALF + i * CELL;
        const q = Math.max(Math.abs(x), Math.abs(z));
        if (q < BLEND_IN) continue;
        const w = smoothstep(BLEND_IN, BLEND_OUT, q);
        const f = this.sampleFar(x, z);
        const idx = j * N + i;
        h[idx] = h[idx] + (f - h[idx]) * w;
      }
    }
  }

  // ----------------------------------------------------------------- erosion

  /** Droplet hydraulic erosion: carves drainage networks and deposits fans. */
  _erode() {
    const h = this.h, flow = this.flow, sed = this.sed;
    const rng = new Rng(778899);
    const DROPS = 420000, STEPS = 44;
    const inertia = 0.055, capacityF = 5.2, minSlope = 0.012;
    const erodeSpeed = 0.34, depositSpeed = 0.28, evaporate = 0.017, gravity = 5.0;

    // erosion brush (radius 2, weight falls off)
    const br = 2;
    const bo = [], bw = [];
    let bsum = 0;
    for (let dy = -br; dy <= br; dy++) {
      for (let dx = -br; dx <= br; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > br) continue;
        const w = 1 - d / (br + 0.5);
        bo.push(dy * N + dx); bw.push(w); bsum += w;
      }
    }
    for (let k = 0; k < bw.length; k++) bw[k] /= bsum;

    const lo = 8, hi = N - 9;
    for (let d = 0; d < DROPS; d++) {
      let px = rng.range(lo, hi), pz = rng.range(lo, hi);
      let dx = 0, dz = 0, speed = 1, water = 1, carried = 0;

      for (let s = 0; s < STEPS; s++) {
        const ix = px | 0, iz = pz | 0;
        if (ix < br + 1 || iz < br + 1 || ix >= N - br - 2 || iz >= N - br - 2) break;
        const fx = px - ix, fz = pz - iz;
        const idx = iz * N + ix;
        const h00 = h[idx], h10 = h[idx + 1], h01 = h[idx + N], h11 = h[idx + N + 1];
        const gx = (h10 - h00) * (1 - fz) + (h11 - h01) * fz;
        const gz = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
        const hOld = (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;

        dx = dx * inertia - gx * (1 - inertia);
        dz = dz * inertia - gz * (1 - inertia);
        const dl = Math.hypot(dx, dz);
        if (dl < 1e-6) break;
        dx /= dl; dz /= dl;
        px += dx; pz += dz;

        const nx = px | 0, nz = pz | 0;
        if (nx < br + 1 || nz < br + 1 || nx >= N - br - 2 || nz >= N - br - 2) break;
        const nfx = px - nx, nfz = pz - nz;
        const nidx = nz * N + nx;
        const n00 = h[nidx], n10 = h[nidx + 1], n01 = h[nidx + N], n11 = h[nidx + N + 1];
        const hNew = (n00 * (1 - nfx) + n10 * nfx) * (1 - nfz) + (n01 * (1 - nfx) + n11 * nfx) * nfz;
        const dh = hNew - hOld;

        flow[idx] += water;
        const cap = Math.max(-dh, minSlope) * speed * water * capacityF;

        if (carried > cap || dh > 0) {
          const amount = dh > 0 ? Math.min(dh, carried) : (carried - cap) * depositSpeed;
          carried -= amount;
          h[idx] += amount * (1 - fx) * (1 - fz);
          h[idx + 1] += amount * fx * (1 - fz);
          h[idx + N] += amount * (1 - fx) * fz;
          h[idx + N + 1] += amount * fx * fz;
          sed[idx] += amount;
        } else {
          const amount = Math.min((cap - carried) * erodeSpeed, -dh);
          for (let k = 0; k < bo.length; k++) {
            const t = idx + bo[k];
            const take = amount * bw[k];
            h[t] -= take;
          }
          carried += amount;
        }

        speed = Math.sqrt(Math.max(0, speed * speed - dh * gravity));
        water *= (1 - evaporate);
        if (water < 0.02) break;
      }
    }

    // knock the single-cell spikes off the eroded field
    const tmp = new Float32Array(h.length);
    tmp.set(h);
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const idx = j * N + i;
        const avg = (tmp[idx - 1] + tmp[idx + 1] + tmp[idx - N] + tmp[idx + N]) * 0.25;
        h[idx] = tmp[idx] * 0.72 + avg * 0.28;
      }
    }
  }

  /** Thermal / talus relaxation: scree cones under cliffs, no impossible spikes. */
  _talus() {
    const h = this.h;
    const maxDelta = 1.35;      // metres of drop tolerated per 1.5 m cell
    for (let pass = 0; pass < 4; pass++) {
      for (let j = 1; j < N - 1; j++) {
        for (let i = 1; i < N - 1; i++) {
          const idx = j * N + i;
          const c = h[idx];
          let move = 0;
          for (let k = 0; k < 4; k++) {
            const t = k === 0 ? idx - 1 : k === 1 ? idx + 1 : k === 2 ? idx - N : idx + N;
            const d = c - h[t];
            if (d > maxDelta) {
              const amt = (d - maxDelta) * 0.22;
              h[t] += amt; move += amt;
            }
          }
          h[idx] = c - move;
        }
      }
    }
  }

  // ------------------------------------------------------------------ derive

  /** Normals, slope, curvature and material control channels. */
  _derive() {
    const h = this.h;
    this.nrm = new Uint16Array(N * N * 2);        // half-float RG
    this.ctrl = new Uint8Array(N * N * 4);        // flow / sediment / road / rocky
    const toHalf = THREE.DataUtils.toHalfFloat;
    const n2 = this.n2, n3 = this.n3;

    // normalise flow with a log curve — raw droplet counts are wildly peaked
    let flowMax = 0;
    const flow = this.flow, sed = this.sed;
    for (let k = 0; k < flow.length; k++) if (flow[k] > flowMax) flowMax = flow[k];
    const flowScale = 1 / Math.log(1 + flowMax * 0.35 + 1e-6);
    let sedMax = 1e-6;
    for (let k = 0; k < sed.length; k++) if (sed[k] > sedMax) sedMax = sed[k];

    const at = (i, j) => {
      const ii = i < 0 ? 0 : i > N - 1 ? N - 1 : i;
      const jj = j < 0 ? 0 : j > N - 1 ? N - 1 : j;
      return h[jj * N + ii];
    };

    // blur the flow map a little so channels read as valleys, not scratches
    const fb = new Float32Array(flow.length);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        const a = flow[idx];
        const l = flow[j * N + Math.max(0, i - 1)], r = flow[j * N + Math.min(N - 1, i + 1)];
        const u = flow[Math.max(0, j - 1) * N + i], d = flow[Math.min(N - 1, j + 1) * N + i];
        fb[idx] = a * 0.44 + (l + r + u + d) * 0.14;
      }
    }

    for (let j = 0; j < N; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        const x = -HALF + i * CELL;
        const hl = at(i - 1, j), hr = at(i + 1, j);
        const hd = at(i, j - 1), hu = at(i, j + 1);
        const c = h[idx];
        let nx = (hl - hr) / (2 * CELL);
        let nz = (hd - hu) / (2 * CELL);
        const inv = 1 / Math.sqrt(nx * nx + nz * nz + 1);
        nx *= inv; nz *= inv;
        this.nrm[idx * 2] = toHalf(nx);
        this.nrm[idx * 2 + 1] = toHalf(nz);

        const slope = Math.min(1, Math.hypot((hl - hr) / (2 * CELL), (hd - hu) / (2 * CELL)));
        const curv = (hl + hr + hd + hu) * 0.25 - c;      // + = concave

        const fl = Math.min(1, Math.log(1 + fb[idx] * 0.35) * flowScale);
        const sd = Math.min(1, Math.pow(sed[idx] / sedMax, 0.32));

        // exposed rock: convex + steep + a stratum-following noise
        let rocky = smoothstep(0.35, 0.95, slope) * 0.85;
        rocky += Math.max(0, -curv) * 1.4;
        rocky += 0.28 * Math.max(0, n2.fbm2(x * 0.0032 + 17, z * 0.0032 - 8, 3));
        rocky += 0.35 * smoothstep(64, 150, c);
        rocky = Math.max(0, Math.min(1, rocky - 0.12 * fl));

        const o = idx * 4;
        const rm = this.roadMask[idx];
        // On the road the flow channel is repurposed to carry the signed lateral
        // position, which is what lets the shader draw wheel ruts.
        this.ctrl[o] = rm > 0.02
          ? (Math.max(0, Math.min(1, this.roadLat[idx])) * 255) | 0
          : (Math.max(0, Math.min(1, fl)) * 255) | 0;
        this.ctrl[o + 1] = (Math.max(0, Math.min(1, sd * (1 - slope * 0.8))) * 255) | 0;
        this.ctrl[o + 2] = (Math.max(0, Math.min(1, this.roadMask[idx])) * 255) | 0;
        this.ctrl[o + 3] = (rocky * 255) | 0;
      }
    }

    // far-field normals + a coarse control map
    this.farNrm = new Uint16Array(FAR_N * FAR_N * 2);
    this.farCtrl = new Uint8Array(FAR_N * FAR_N * 4);
    for (let j = 0; j < FAR_N; j++) {
      const z = -FAR_HALF + j * FAR_CELL;
      for (let i = 0; i < FAR_N; i++) {
        const idx = j * FAR_N + i;
        const x = -FAR_HALF + i * FAR_CELL;
        const hl = this._farAt(i - 1, j), hr = this._farAt(i + 1, j);
        const hd = this._farAt(i, j - 1), hu = this._farAt(i, j + 1);
        let nx = (hl - hr) / (2 * FAR_CELL);
        let nz = (hd - hu) / (2 * FAR_CELL);
        const inv = 1 / Math.sqrt(nx * nx + nz * nz + 1);
        nx *= inv; nz *= inv;
        this.farNrm[idx * 2] = toHalf(nx);
        this.farNrm[idx * 2 + 1] = toHalf(nz);
        const slope = Math.min(1, Math.hypot((hl - hr) / (2 * FAR_CELL), (hd - hu) / (2 * FAR_CELL)));
        const rocky = Math.max(0, Math.min(1,
          smoothstep(0.30, 0.85, slope) + 0.4 * smoothstep(90, 260, this.far[idx]) +
          0.22 * n3.fbm2(x * 0.0009, z * 0.0009, 3)));
        const o = idx * 4;
        this.farCtrl[o] = 0;
        this.farCtrl[o + 1] = ((1 - rocky) * 190) | 0;
        this.farCtrl[o + 2] = 0;
        this.farCtrl[o + 3] = (rocky * 255) | 0;
      }
    }

    // free the scratch buffers, keep the ones the runtime API needs
    this.flow = null; this.sed = null; this._coarse = null;
    this.roadLat = null; this.roadMask = null; this.slope0 = null;
  }

  // -------------------------------------------------------------- public API

  /** Bilinear sample of the near grid (no far-field switch). */
  rawHeightAt(x, z) {
    const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    let i0 = Math.floor(fx), j0 = Math.floor(fz);
    const tx = fx - i0, tz = fz - j0;
    if (i0 < 0) i0 = 0; else if (i0 > N - 2) i0 = N - 2;
    if (j0 < 0) j0 = 0; else if (j0 > N - 2) j0 = N - 2;
    const h = this.h, b = j0 * N + i0;
    const a0 = h[b], a1 = h[b + 1], a2 = h[b + N], a3 = h[b + N + 1];
    return (a0 + (a1 - a0) * tx) * (1 - tz) + (a2 + (a3 - a2) * tx) * tz;
  }

  sampleFar(x, z) {
    const fx = (x + FAR_HALF) / FAR_CELL, fz = (z + FAR_HALF) / FAR_CELL;
    let i0 = Math.floor(fx), j0 = Math.floor(fz);
    const tx = fx - i0, tz = fz - j0;
    if (i0 < 0) i0 = 0; else if (i0 > FAR_N - 2) i0 = FAR_N - 2;
    if (j0 < 0) j0 = 0; else if (j0 > FAR_N - 2) j0 = FAR_N - 2;
    const f = this.far, b = j0 * FAR_N + i0;
    const a0 = f[b], a1 = f[b + 1], a2 = f[b + FAR_N], a3 = f[b + FAR_N + 1];
    return (a0 + (a1 - a0) * tx) * (1 - tz) + (a2 + (a3 - a2) * tx) * tz;
  }

  /** Exactly what the GPU draws. */
  heightAt(x, z) {
    const q = Math.abs(x) > Math.abs(z) ? Math.abs(x) : Math.abs(z);
    return q >= BLEND_OUT ? this.sampleFar(x, z) : this.rawHeightAt(x, z);
  }

  /** Bilinear control sample: { flow, sediment, road, rocky }. */
  ctrlAt(x, z, out = {}) {
    const q = Math.abs(x) > Math.abs(z) ? Math.abs(x) : Math.abs(z);
    const arr = q >= BLEND_OUT ? this.farCtrl : this.ctrl;
    const n = q >= BLEND_OUT ? FAR_N : N;
    const half = q >= BLEND_OUT ? FAR_HALF : HALF;
    const cell = q >= BLEND_OUT ? FAR_CELL : CELL;
    let i = Math.round((x + half) / cell), j = Math.round((z + half) / cell);
    i = i < 0 ? 0 : i > n - 1 ? n - 1 : i;
    j = j < 0 ? 0 : j > n - 1 ? n - 1 : j;
    const o = (j * n + i) * 4;
    out.flow = arr[o] / 255;
    out.sediment = arr[o + 1] / 255;
    out.road = arr[o + 2] / 255;
    out.rocky = arr[o + 3] / 255;
    return out;
  }
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The exact JS twin of `tf_snoise` in TerrainMaterial.js (Ashima simplex).
 * `Terrain.sampleMaterial()` has to agree with the pixels the shader draws, so
 * the CPU cannot use a differently-seeded noise here.
 * @returns {number} roughly -1..1
 */
export function gnoise2(xin, yin) {
  const C0 = 0.211324865405187, C1 = 0.366025403784439;
  const C2 = -0.577350269189626, C3 = 0.024390243902439;
  const s = (xin + yin) * C1;
  let ix = Math.floor(xin + s), iy = Math.floor(yin + s);
  const t0 = (ix + iy) * C0;
  const x0 = xin - ix + t0, y0 = yin - iy + t0;
  const i1x = x0 > y0 ? 1 : 0, i1y = x0 > y0 ? 0 : 1;
  const x1 = x0 + C0 - i1x, y1 = y0 + C0 - i1y;
  const x2 = x0 + C2, y2 = y0 + C2;
  ix = mod289(ix); iy = mod289(iy);

  const p0 = perm(perm(iy) + ix);
  const p1 = perm(perm(iy + i1y) + ix + i1x);
  const p2 = perm(perm(iy + 1) + ix + 1);

  let g = 0;
  g += grad(p0, x0, y0, C3);
  g += grad(p1, x1, y1, C3);
  g += grad(p2, x2, y2, C3);
  return 130 * g;
}

function mod289(x) { return x - Math.floor(x / 289) * 289; }
function perm(x) { return mod289(((x * 34) + 1) * x); }
function grad(p, x, y, C3) {
  let m = Math.max(0.5 - (x * x + y * y), 0);
  m *= m; m *= m;
  const v = 2 * fract(p * C3) - 1;
  const h = Math.abs(v) - 0.5;
  const a0 = v - Math.floor(v + 0.5);
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  return m * (a0 * x + h * y);
}
function fract(v) { return v - Math.floor(v); }

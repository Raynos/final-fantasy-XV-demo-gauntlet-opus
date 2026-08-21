import * as THREE from 'three';

/**
 * Reusable pieces of Hammerhead: fence runs, floodlight masts, tyre stacks,
 * drums, a generic car shell, outdoor furniture.
 *
 * Everything here writes into a `PartBuilder`, so the whole town collapses into
 * one merged mesh per material. Each helper takes a `place(mat, geo, pos, rot,
 * scale)` closure that has the town's world transform already baked in, which
 * keeps the call sites readable — the layout code below reads as metres in a
 * plan view, not as matrix algebra.
 */

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

/** Compose a local transform. */
export function mat4(pos, rot = [0, 0, 0], scale = [1, 1, 1]) {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]), _q,
    new THREE.Vector3(scale[0], scale[1], scale[2])
  );
}

/* -- shared primitives, built once and re-transformed ---------------------- */

const G = {};
/** Memoised primitive geometry. */
export function geo(key, make) { if (!G[key]) G[key] = make(); return G[key]; }

export const box = (w, h, d) => geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
export const cyl = (rt, rb, h, s = 10) => geo(`c${rt}_${rb}_${h}_${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
export const plane = (w, h) => geo(`p${w}_${h}`, () => new THREE.PlaneGeometry(w, h));
export const torus = (r, t, a = 8, b = 14) => geo(`t${r}_${t}_${a}_${b}`, () => new THREE.TorusGeometry(r, t, a, b));

/** A cylinder lying on its side along X, i.e. a wheel/tyre. */
export const wheel = (r, w, s = 14) => geo(`w${r}_${w}_${s}`, () => {
  const g = new THREE.CylinderGeometry(r, r, w, s);
  g.rotateZ(Math.PI / 2);
  return g;
});

/* -- structures ------------------------------------------------------------ */

/**
 * A run of chain-link fence: posts, top rail, mesh panel.
 * @param {Function} put place(mat, geo, pos, rot, scale)
 * @param {object} M material set
 * @param {number[]} a start [x, z]
 * @param {number[]} b end [x, z]
 * @param {object} [opts] `{ y, height, span }`
 */
export function fenceRun(put, M, a, b, { y = 0, height = 2.15, span = 3.0 } = {}) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const n = Math.max(1, Math.round(len / span));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    put(M.galv, cyl(0.045, 0.055, height, 6), [a[0] + dx * t, y + height * 0.5, a[1] + dz * t]);
  }
  const mx = a[0] + dx * 0.5, mz = a[1] + dz * 0.5;
  // top rail and a bottom tension wire
  put(M.galv, box(0.05, 0.05, len), [mx, y + height - 0.06, mz], [0, yaw, 0]);
  put(M.galv, box(0.03, 0.03, len), [mx, y + 0.12, mz], [0, yaw, 0]);
  // mesh: uv repeat scaled so the diamonds stay square whatever the run length
  const g = new THREE.PlaneGeometry(len, height - 0.14);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len * 0.55, uv.getY(i) * (height - 0.14) * 0.55);
  uv.needsUpdate = true;
  put(M.mesh, g, [mx, y + height * 0.5 - 0.02, mz], [0, yaw + Math.PI / 2, 0]);
}

/**
 * A floodlight mast. Returns the world-local head position so the caller can
 * hang a real light off it.
 */
export function floodMast(put, M, [x, z], { y = 0, height = 8.4, heads = 2, yaw = 0 } = {}) {
  put(M.galv, cyl(0.11, 0.16, height, 8), [x, y + height * 0.5, z]);
  put(M.galv, box(0.16, 0.16, 1.9), [x, y + height - 0.1, z], [0, yaw, 0]);
  for (let i = 0; i < heads; i++) {
    const o = (i - (heads - 1) / 2) * 0.78;
    const ox = Math.sin(yaw) * o, oz = Math.cos(yaw) * o;
    put(M.dark, box(0.62, 0.5, 0.42), [x + ox, y + height - 0.34, z + oz], [0.42, yaw, 0]);
    put(M.lamp, box(0.52, 0.06, 0.34), [x + ox, y + height - 0.50, z + oz + 0.18], [0.42, yaw, 0]);
  }
  // guy stub and a cable dropping down the pole
  put(M.dark, cyl(0.018, 0.018, height * 0.9, 5), [x + 0.17, y + height * 0.45, z], [0, 0, 0.008]);
  return [x, y + height - 0.42, z];
}

/** A stack of tyres. */
export function tyreStack(put, M, [x, z], { y = 0, n = 5, r = 0.42, rng }) {
  for (let i = 0; i < n; i++) {
    const a = rng ? rng.next() * 3.1 : i * 0.7;
    const j = rng ? rng.gauss(0, 0.045) : 0;
    put(M.rubber, torus(r, 0.155, 6, 16), [x + j, y + 0.17 + i * 0.31, z + j], [Math.PI / 2, 0, a]);
    put(M.galv, cyl(r * 0.52, r * 0.52, 0.20, 12), [x + j, y + 0.17 + i * 0.31, z + j]);
  }
}

/** A 200-litre oil drum, upright or on its side. */
export function drum(put, M, [x, z], { y = 0, tipped = false, yaw = 0, mat } = {}) {
  const m = mat || M.scrap;
  if (!tipped) {
    put(m, cyl(0.30, 0.30, 0.92, 14), [x, y + 0.46, z]);
    put(m, torus(0.30, 0.028, 5, 14), [x, y + 0.30, z], [Math.PI / 2, 0, 0]);
    put(m, torus(0.30, 0.028, 5, 14), [x, y + 0.62, z], [Math.PI / 2, 0, 0]);
    put(m, cyl(0.31, 0.31, 0.04, 14), [x, y + 0.93, z]);
  } else {
    put(m, cyl(0.30, 0.30, 0.92, 14), [x, y + 0.30, z], [Math.PI / 2, yaw, 0]);
    put(m, torus(0.30, 0.028, 5, 14), [x + Math.cos(yaw) * 0.16, y + 0.30, z + Math.sin(yaw) * 0.16], [0, yaw, 0]);
  }
}

/**
 * A generic 1950s-Americana saloon shell — the cars that fill an FFXV car park.
 * Deliberately simple: they are silhouettes at 20 m and set dressing at 5 m.
 */
export function carShell(put, M, [x, z], {
  y = 0, yaw = 0, body, len = 4.6, wid = 1.86, ride = 0.42, wreck = false,
} = {}) {
  const b = body || M.panelRed;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (ax, az) => [x + ax * c + az * s, 0, z - ax * s + az * c];
  const P = (mat, g, ax, ay, az, rot = [0, 0, 0], sc) => {
    const p = at(ax, az);
    put(mat, g, [p[0], y + ay, p[2]], [rot[0], yaw + rot[1], rot[2]], sc);
  };
  const drop = wreck ? -0.18 : 0;
  // lower body, cabin, glasshouse
  P(b, box(wid, 0.66, len), 0, ride + 0.33 + drop, 0);
  P(b, box(wid * 0.94, 0.56, len * 0.44), 0, ride + 0.92 + drop, -0.18, [0, 0, 0]);
  P(M.glassDark, box(wid * 0.90, 0.40, len * 0.42), 0, ride + 0.99 + drop, -0.18);
  P(b, box(wid * 0.99, 0.16, len * 0.42), 0, ride + 1.20 + drop, -0.18);
  // beltline and rocker: two thin creases are the whole difference between a
  // car and a box with wheels at this level of detail
  P(M.chrome, box(wid * 1.005, 0.045, len * 0.42), 0, ride + 0.755 + drop, -0.18);
  P(M.dark, box(wid * 1.01, 0.14, len * 0.86), 0, ride + 0.075 + drop, 0);
  // bonnet and boot creases
  P(b, box(wid * 0.92, 0.12, len * 0.30), 0, ride + 0.68 + drop, len * 0.29);
  P(b, box(wid * 0.92, 0.12, len * 0.24), 0, ride + 0.68 + drop, -len * 0.36);
  // bumpers and lights
  P(M.chrome, box(wid * 1.02, 0.16, 0.14), 0, ride + 0.30 + drop, len * 0.5);
  P(M.chrome, box(wid * 1.02, 0.16, 0.14), 0, ride + 0.30 + drop, -len * 0.5);
  for (const sx of [-1, 1]) {
    P(M.chrome, cyl(0.11, 0.11, 0.08, 10), sx * wid * 0.34, ride + 0.52 + drop, len * 0.49, [Math.PI / 2, 0, 0]);
    P(M.dark, box(0.22, 0.10, 0.06), sx * wid * 0.34, ride + 0.50 + drop, -len * 0.5);
    // wheels; a wreck sits on bricks with two of them gone
    for (const az of [len * 0.31, -len * 0.30]) {
      const gone = wreck && sx > 0 && az > 0;
      if (gone) { P(M.slab, box(0.42, 0.34, 0.42), sx * wid * 0.5, 0.17, az); continue; }
      P(M.rubber, wheel(0.36, 0.24, 14), sx * wid * 0.52, ride, az, [0, Math.PI / 2, 0]);
      P(M.chrome, wheel(0.19, 0.26, 10), sx * wid * 0.52, ride, az, [0, Math.PI / 2, 0]);
    }
  }
  if (wreck) {
    // bonnet up, one door hanging
    P(M.scrap, box(wid * 0.9, 0.08, len * 0.30), 0, ride + 1.02, len * 0.24, [-0.85, 0, 0]);
    P(M.scrap, box(0.09, 0.82, len * 0.24), -wid * 0.52, ride + 0.72, -0.1, [0, -0.55, 0]);
  }
}

/** Outdoor diner seating: a table with a parasol and two benches. */
export function patioSet(put, M, [x, z], { y = 0, yaw = 0, parasol = true } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (ax, az) => [x + ax * c + az * s, z - ax * s + az * c];
  const P = (mat, g, ax, ay, az, rot = [0, 0, 0]) => {
    const p = at(ax, az);
    put(mat, g, [p[0], y + ay, p[1]], [rot[0], yaw + rot[1], rot[2]]);
  };
  // pedestal table
  P(M.galv, cyl(0.055, 0.055, 0.74, 8), 0, 0.37, 0);
  P(M.galv, cyl(0.34, 0.38, 0.05, 12), 0, 0.03, 0);
  P(M.panelCream, cyl(0.66, 0.66, 0.05, 20), 0, 0.755, 0);
  P(M.galv, torus(0.66, 0.020, 5, 22), 0, 0.728, 0, [Math.PI / 2, 0, 0]);
  // two benches: seat slats, a back and four proper legs each
  for (const sx of [-1, 1]) {
    for (const o of [-0.10, 0.10]) P(M.panelCream, box(1.45, 0.045, 0.135), 0, 0.455, sx * (0.98 + o));
    P(M.panelCream, box(1.45, 0.26, 0.045), 0, 0.70, sx * 1.19);
    for (const ax of [-0.62, 0.62]) {
      P(M.galv, box(0.055, 0.46, 0.055), ax, 0.23, sx * 0.88);
      P(M.galv, box(0.055, 0.46, 0.055), ax, 0.23, sx * 1.10);
      P(M.galv, box(0.045, 0.045, 0.30), ax, 0.44, sx * 0.99);
      P(M.galv, box(0.05, 0.36, 0.05), ax, 0.58, sx * 1.17, [0.10, 0, 0]);
    }
  }
  if (parasol) {
    P(M.galv, cyl(0.036, 0.036, 2.25, 8), 0, 1.13, 0);
    P(M.canvas, new THREE.ConeGeometry(1.18, 0.42, 8), 0, 2.16, 0);
    P(M.canvas, new THREE.CylinderGeometry(1.18, 1.22, 0.13, 8, 1, true), 0, 1.89, 0);
    // ribs under the canopy, which is what stops it reading as a paper hat
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      P(M.galv, box(0.03, 0.03, 1.16), Math.sin(a) * 0.58, 1.93, Math.cos(a) * 0.58, [0, a - yaw, 0.14]);
    }
  }
}

/** A pallet with a few crates on it. */
export function palletStack(put, M, [x, z], { y = 0, yaw = 0, n = 2, rng } = {}) {
  put(M.wood, box(1.2, 0.14, 0.9), [x, y + 0.07, z], [0, yaw, 0]);
  for (let i = 0; i < n; i++) {
    const j = rng ? rng.gauss(0, 0.06) : 0;
    put(M.wood, box(0.86, 0.56, 0.7), [x + j, y + 0.42 + i * 0.58, z + j], [0, yaw + (rng ? rng.gauss(0, 0.12) : 0), 0]);
  }
}

import * as THREE from 'three';
import type { Vec3 } from '../props/PartBuilder.ts';
import type { TownMats } from './TownMaterials.ts';
import type { Rng } from '../../util/Rng.ts';
import { box as bkBox } from '../props/BuildKit.ts';

/**
 * How every helper here emits geometry.
 *
 * The caller closes over the town's world transform, so a helper writes plain
 * metres in the local plan frame and never touches a matrix. `rot` and `scale`
 * are optional because most placements want neither.
 */
export type PlaceFn = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, scale?: Vec3) => void;

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
export function mat4(pos: Vec3, rot: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]) {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]), _q,
    new THREE.Vector3(scale[0], scale[1], scale[2])
  );
}

/* -- shared primitives, built once and re-transformed ---------------------- */

const G: Record<string, THREE.BufferGeometry> = {};
/** Memoised primitive geometry. */
export function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  if (!G[key]) G[key] = make();
  return G[key];
}

/**
 * Tag a primitive with the parameterisation `texelPlace` should rebuild it
 * under. It rides in `userData` rather than in the key because the geometry is
 * memoised and handed to `put` by value — the placement site never knows which
 * constructor made it.
 */
function kind(g: THREE.BufferGeometry, k: UvKind) { g.userData.uvKind = k; return g; }

/**
 * A box with a chamfered arris, from `BuildKit`.
 *
 * Every edge in Hammerhead was a mathematically sharp 90°, and nothing outdoors
 * is: twenty years of dust, knocks and repainting round every arris off, and a
 * rounded arris catches a bright sliver of sun along its length. That sliver is
 * most of the difference between "box primitive" and "built thing" at the range
 * a player stands at, and it is the single reason this call goes through
 * `BuildKit` rather than `THREE.BoxGeometry`.
 *
 * `BuildKit.box` gates itself on the member's **section**, not its overall
 * size, so a 45 mm fascia batten and a 30 mm rafter come back sharp — their
 * arris would be sub-pixel at every range they are ever seen from, and paying
 * four times the triangles to alias it is the worst of both.
 */
export const box = (w: number, h: number, d: number) => geo(`b${w}_${h}_${d}`, () => kind(bkBox(w, h, d), 'box'));

/**
 * A sharp box carrying plain 0..1 UVs per face — the only geometry `uvScale`
 * can act on.
 *
 * `BuildKit.box` writes **object-space** UVs, so multiplying them by a repeat
 * count is meaningless: the first pass of this retrofit did exactly that and
 * mipped the garage's corrugation and the forecourt's slab joints away to flat
 * colour in one step. Every corrugated sheet in the town is authored by hand
 * (see `TEXEL`), so every corrugated sheet builds from this.
 */
export const sbox = (w: number, h: number, d: number) => geo(`s${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
export const cyl = (rt: number, rb: number, h: number, s = 10) => geo(`c${rt}_${rb}_${h}_${s}`, () => kind(new THREE.CylinderGeometry(rt, rb, h, s), 'radial'));
export const plane = (w: number, h: number) => geo(`p${w}_${h}`, () => new THREE.PlaneGeometry(w, h));
export const torus = (r: number, t: number, a = 8, b = 14) => geo(`t${r}_${t}_${a}_${b}`, () => kind(new THREE.TorusGeometry(r, t, a, b), 'radial'));

/** A cylinder lying on its side along X, i.e. a wheel/tyre. */
export const wheel = (r: number, w: number, s = 14) => geo(`w${r}_${w}_${s}`, () => {
  const g = new THREE.CylinderGeometry(r, r, w, s);
  g.rotateZ(Math.PI / 2);
  return kind(g, 'radial');
});

/* -- structures ------------------------------------------------------------ */

/**
 * A run of chain-link fence: posts, top rail, mesh panel.
 * @param put place(mat, geo, pos, rot, scale)
 * @param M material set
 * @param a start [x, z]
 * @param b end [x, z]
 * @param [opts] `{ y, height, span }`
 */
export function fenceRun(put: PlaceFn, M: TownMats, a: number[], b: number[], { y = 0, height = 2.15, span = 3.0 }: { y?: number, height?: number, span?: number } = {}) {
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
export function floodMast(put: PlaceFn, M: TownMats, [x, z]: number[], { y = 0, height = 8.4, heads = 2, yaw = 0 } = {}): Vec3 {
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
export function tyreStack(put: PlaceFn, M: TownMats, [x, z]: number[], { y = 0, n = 5, r = 0.42, rng }: { y?: number, n?: number, r?: number, rng?: Rng }) {
  for (let i = 0; i < n; i++) {
    const a = rng ? rng.next() * 3.1 : i * 0.7;
    const j = rng ? rng.gauss(0, 0.045) : 0;
    put(M.rubber, torus(r, 0.155, 6, 16), [x + j, y + 0.17 + i * 0.31, z + j], [Math.PI / 2, 0, a]);
    put(M.galv, cyl(r * 0.52, r * 0.52, 0.20, 12), [x + j, y + 0.17 + i * 0.31, z + j]);
  }
}

/** A 200-litre oil drum, upright or on its side. */
export function drum(put: PlaceFn, M: TownMats, [x, z]: number[], { y = 0, tipped = false, yaw = 0, mat }: {
  y?: number, tipped?: boolean, yaw?: number, mat?: THREE.Material,
} = {}) {
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
export function carShell(put: PlaceFn, M: TownMats, [x, z]: number[], {
  y = 0, yaw = 0, body, len = 4.6, wid = 1.86, ride = 0.42, wreck = false,
}: {
  y?: number, yaw?: number, body?: THREE.Material, len?: number, wid?: number, ride?: number, wreck?: boolean,
} = {}) {
  const b = body || M.panelRed;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (ax: number, az: number) => [x + ax * c + az * s, 0, z - ax * s + az * c];
  const P = (mat: THREE.Material, g: THREE.BufferGeometry, ax: number, ay: number, az: number, rot: Vec3 = [0, 0, 0], sc?: Vec3) => {
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
export function patioSet(put: PlaceFn, M: TownMats, [x, z]: number[], { y = 0, yaw = 0, parasol = true } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (ax: number, az: number) => [x + ax * c + az * s, z - ax * s + az * c];
  const P = (mat: THREE.Material, g: THREE.BufferGeometry, ax: number, ay: number, az: number, rot: Vec3 = [0, 0, 0]) => {
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
export function palletStack(put: PlaceFn, M: TownMats, [x, z]: number[], { y = 0, yaw = 0, n = 2, rng }: {
  y?: number, yaw?: number, n?: number, rng?: Rng,
} = {}) {
  put(M.wood, box(1.2, 0.14, 0.9), [x, y + 0.07, z], [0, yaw, 0]);
  for (let i = 0; i < n; i++) {
    const j = rng ? rng.gauss(0, 0.06) : 0;
    put(M.wood, box(0.86, 0.56, 0.7), [x + j, y + 0.42 + i * 0.58, z + j], [0, yaw + (rng ? rng.gauss(0, 0.12) : 0), 0]);
  }
}

/* -- texel density --------------------------------------------------------- */

/**
 * How many metres of world one tile of each material's texture covers.
 *
 * This table is the fix for the worst material read in Hammerhead. Every town
 * material is a 256- or 512-pixel tile authored for a *specific* physical size:
 * `panelMaterial`'s chipping noise is `fbm2(u * 19)`, so one chip is about a
 * twentieth of a tile — a few centimetres if the tile is 2 m, and **a metre
 * wide once the tile is stretched over a 16 m canopy soffit**. Box geometry
 * carries 0..1 UVs per face, so that stretch is what every unannotated `put`
 * has been doing: the fuel canopy's soffit read as blue-green water caustics,
 * the diner's fascia as marbled wood, and the same texture squeezed onto a
 * 30 cm chair leg read as gravel.
 *
 * Keyed on the material's `name`, which `TownMaterials.pbr` sets from its cache
 * key, so a new tint of an existing material inherits the right density free.
 *
 * The exclusions are deliberate. `town_corr` has a **non-tiling V**: its grime
 * is `(1 - v)`, a run-down gradient that must span a whole sheet exactly once,
 * so corrugated is authored by hand at every call site. `sign_*` and
 * `town_chainlink` carry authored UVs for the same reason — a sign tiled twice
 * says the name twice.
 */
const TEXEL: Array<[RegExp, number]> = [
  [/^town_asphalt/, 9.0],
  [/^town_slab/, 7.0],
  [/^town_gravel/, 7.0],
  [/^town_galv/, 0.75],
  [/^town_scrap/, 1.3],
  [/^town_rubber/, 0.85],
  [/^town_panel/, 2.2],
  // `PropMaterials.woodMaterial` never names itself, so `Hammerhead._build`
  // stamps it `hh_wood` on the way past. Match the suffix, not the prefix.
  [/wood$/, 1.5],
];

/** Metres per texture tile for a material, or 0 to leave its UVs alone. */
function texelSize(mat: THREE.Material): number {
  const n = mat.name || '';
  for (const [re, m] of TEXEL) if (re.test(n)) return m;
  return 0;
}

/**
 * How a geometry's UVs should be rebuilt by {@link texelPlace}.
 *
 * `box` gets a true per-face planar projection off the vertex normal — the only
 * construction that holds density on all six faces of a slab that is 16 m one
 * way and 0.55 m the other. Everything else keeps its authored
 * parameterisation and is only *scaled*, because a cylinder's wrap and a
 * torus's sweep already run the right way round and a planar projection would
 * seam them.
 */
export type UvKind = 'box' | 'radial' | 'planar';

const _uvCache = new WeakMap<THREE.BufferGeometry, Map<number, THREE.BufferGeometry>>();
/** Geometry whose UVs a call site authored itself; never touched. */
const _authored = new WeakSet<THREE.BufferGeometry>();

/** Mark a geometry as carrying hand-authored UVs, exempt from texelization. */
export function authored(g: THREE.BufferGeometry): THREE.BufferGeometry {
  _authored.add(g);
  return g;
}

/**
 * Rebuild `g`'s UVs so one texture tile covers `mpt` metres, whatever the
 * piece's size. Cached per (geometry, density) pair — the primitives are
 * memoised and shared across hundreds of placements, so this runs a few dozen
 * times for the whole town rather than once per `put`.
 */
function texelize(g: THREE.BufferGeometry, mpt: number): THREE.BufferGeometry {
  let byM = _uvCache.get(g);
  if (!byM) { byM = new Map(); _uvCache.set(g, byM); }
  const hit = byM.get(mpt);
  if (hit) return hit;

  const out = g.clone();
  const kind: UvKind = typeof g.userData.uvKind === 'string' ? g.userData.uvKind as UvKind : 'planar';
  const pos = out.attributes.position;
  const uv = out.attributes.uv;
  if (kind === 'box' && out.attributes.normal && uv) {
    // Per-face planar projection. The dominant axis of the face normal picks
    // which two object-space coordinates become U and V, so the top of a slab
    // is projected in XZ and its sides in XY / ZY — each at the same texels per
    // metre, and each independent of how the piece is later rotated, because
    // this runs in the primitive's own frame.
    const nrm = out.attributes.normal;
    const s = 1 / mpt;
    for (let i = 0; i < pos.count; i++) {
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i)), nz = Math.abs(nrm.getZ(i));
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (ny >= nx && ny >= nz) uv.setXY(i, x * s, z * s);
      else if (nx >= nz) uv.setXY(i, z * s, y * s);
      else uv.setXY(i, x * s, y * s);
    }
  } else if (uv) {
    out.computeBoundingBox();
    const b = out.boundingBox;
    if (b) {
      const dx = b.max.x - b.min.x, dy = b.max.y - b.min.y, dz = b.max.z - b.min.z;
      // A cylinder's U runs the whole way round, so its span is the
      // circumference, not the diameter: scaling by the bounding box alone
      // leaves the barrel texture pi times too coarse.
      const wide = Math.max(dx, dz);
      const su = (kind === 'radial' ? Math.PI * wide : wide) / mpt;
      const sv = Math.max(dy, 0.02) / mpt;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  if (uv) uv.needsUpdate = true;
  byM.set(mpt, out);
  return out;
}

/**
 * Wrap a {@link PlaceFn} so every piece it places is re-UV'd to the constant
 * world texel density its material wants.
 *
 * A wrapper rather than a change inside `PartBuilder` because only the town's
 * material set carries a density table; the prop kits use `BuildKit`, which
 * solves the same problem the other way round — flat, mapless materials above a
 * couple of metres plus a baked per-vertex tone channel.
 */
export function texelPlace(put: PlaceFn): PlaceFn {
  return (mat, g, pos, rot, scale) => {
    const mpt = _authored.has(g) ? 0 : texelSize(mat);
    put(mat, mpt ? texelize(g, mpt) : g, pos, rot, scale);
  };
}

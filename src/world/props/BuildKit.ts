import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rng } from '../../util/Rng.ts';

/**
 * Architecture primitives: the pieces every built thing in the world is made of.
 *
 * The problem this file exists to fix, measured rather than asserted: captured
 * `poi_fishing` and read it, and the buildings were the worst thing in the frame
 * by a wide margin — flat dark slabs with a lighter top, cuboid boxes for
 * air-conditioning units, and small pale rectangles for windows. Nothing else in
 * that frame reads as placeholder; the terrain, the sky and the trees do not.
 *
 * Three things are wrong with a `BoxGeometry` used as a building and they are
 * all geometric, so no amount of re-tinting can answer any of them:
 *
 * 1. **A true 90° arris is the loudest "this is CG" cue there is.** It produces
 *    a mathematically perfect one-pixel transition from lit to shaded at every
 *    distance. A real corner — poured, struck, and knocked about for thirty
 *    years — is 30–45 mm of chamfer, and that chamfer catches a bright sliver
 *    of sun along the whole length of the edge. {@link box} knocks one off
 *    automatically, gated on the member's section so a 45 mm strap does not
 *    dissolve into its own bevel.
 * 2. **A window drawn as a bright quad on the wall plane has no depth.** A wall
 *    is a solid with thickness, so an opening in it is a *hole* with jambs, a
 *    head, a cill and a shadow. {@link wallRun} splits a wall into
 *    pier/sill/lintel boxes around its sorted openings, so every reveal is real
 *    geometry and gets a real shadow, with no CSG anywhere.
 * 3. **A wall that runs straight into the ground destroys the contact.** In
 *    reality nothing is ever flush: there is a projecting plinth course, it
 *    throws a 40–80 mm shadow onto the dirt, and the dirt banks up against it.
 *    {@link plinth} is three courses — a buried footing, the projecting course,
 *    and a splayed weathering above it.
 *
 * Ported from `metal-gear-solid-5-opus-demo/src/world/outpost/{geo,buildings}.js`
 * per `docs/plans/2026-08-21-fable-procedural-modeling.md` §5.1–5.2, which is
 * where the numbers below were argued out over four rounds of critique. The
 * human-scale constants matter as much as the detail: get a storey height wrong
 * by 20% and the settlement reads as a toy whatever the shading does.
 *
 * ## The tone channel
 *
 * Everything here can bake a vertex colour, and that is not decoration. The POI
 * kits deliberately use *flat, mapless* materials above a couple of metres —
 * `PropMaterials`' concrete and enamel maps are authored for a 1 m part, so on a
 * fourteen-metre wall carrying 0..1 box UVs the paint-chip noise stretches into
 * metre-wide grey blotches. That decision is right and is not reversed here.
 * What it costs is that thirty-five buildings drawn from four flat colours are
 * *literally* four colours. {@link bakeTone} puts the variation back where it
 * costs nothing to sample: per-object value and hue jitter, a grime-to-bleach
 * vertical gradient, and a pale lift on the chamfer facets, all in
 * `attributes.color`, all surviving the merge.
 */

/** Storey height, floor to floor. Everything vertical is a multiple of this. */
export const STOREY = 3.2;
/** Door leaf height. */
export const DOOR_H = 2.1;
/** Door leaf width. */
export const DOOR_W = 1.1;
/** Window cill height above the floor it belongs to. */
export const CILL = 1.05;

/**
 * Geometry grouped by *role* rather than by material.
 *
 * A role is what a piece is — `shell`, `trim`, `glass` — and the caller maps
 * roles onto whatever material palette it owns. That is what lets one kit serve
 * `PoiKits`, `TownKit` and the dungeon exteriors without any of them agreeing
 * about material names.
 */
export type Bag = Record<string, THREE.BufferGeometry[]>;

export const ROLES = [
  'shell', 'shell2', 'trim', 'metal', 'glass', 'glow', 'dark', 'roof', 'wood', 'cloth',
] as const;

export function bag(): Bag {
  const b: Bag = {};
  for (const r of ROLES) b[r] = [];
  return b;
}

/**
 * Normalise a piece so a merge can never fail on an attribute mismatch.
 *
 * `mergeGeometries` returns **null** when the inputs disagree about which
 * attributes they carry or about whether they are indexed, and it does so
 * without throwing or logging — a whole building disappears and nothing says
 * why. Three things have to agree: the index, the UVs (a chamfered box has
 * them, a bare plane does not) and `aArris` (only chamfered boxes have it).
 */
function normalize(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.aArris) g.setAttribute('aArris', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  if (!g.index) {
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return g;
}

/** Merge every role in a bag down to one geometry each; empty roles drop out. */
export function mergeBag(b: Bag): Record<string, THREE.BufferGeometry> {
  const out: Record<string, THREE.BufferGeometry> = {};
  for (const k of Object.keys(b)) {
    const list = b[k].filter(Boolean).map(normalize);
    if (!list.length) continue;
    const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (g) out[k] = g;
  }
  return out;
}

/** Placement options shared by every primitive below. */
export interface Xf {
  x?: number; y?: number; z?: number;
  rx?: number; ry?: number; rz?: number;
}

export function xform<T extends THREE.BufferGeometry>(g: T, o: Xf = {}): T {
  const { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = o;
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  if (x || y || z) g.translate(x, y, z);
  return g;
}

/**
 * Chamfered box: 6 face quads + 12 edge quads + 8 corner tris = 44 triangles.
 *
 * Flat-shaded, and the chamfer facets are marked in `userData.arris` (1 per
 * vertex on a chamfer, 0 on a flat face) so {@link bakeTone} can treat them as
 * exposed aggregate — paler and smoother than the face behind them. That mark
 * cannot be recovered in a shader: a 45° normal on a box edge and a 45° normal
 * on a cylinder are indistinguishable, so it is recorded at authoring time.
 */
function chamferBox(w: number, h: number, d: number, c: number): THREE.BufferGeometry {
  const H = [w / 2, h / 2, d / 2];
  const I = [H[0] - c, H[1] - c, H[2] - c];
  const verts: number[] = [];
  const arris: number[] = [];
  let mark = 0;
  const tri = (p: number[], q: number[], r: number[], nx: number, ny: number, nz: number) => {
    // Auto-orient: the caller supplies the intended outward normal and the
    // winding flips if the cross product disagrees. Cheaper and far less
    // error-prone than getting twenty-six facets' vertex orders right by hand.
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
    const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const a = cx * nx + cy * ny + cz * nz < 0 ? [p, r, q] : [p, q, r];
    for (const t of a) { verts.push(t[0], t[1], t[2]); arris.push(mark); }
  };
  const quad = (p: number[], q: number[], r: number[], s: number[], n: number[]) => {
    tri(p, q, r, n[0], n[1], n[2]);
    tri(p, r, s, n[0], n[1], n[2]);
  };

  for (let a = 0; a < 3; a++) {
    for (const s of [-1, 1]) {
      const b = (a + 1) % 3, e = (a + 2) % 3;
      const n = [0, 0, 0]; n[a] = s;
      const corner = (sb: number, se: number) => {
        const p = [0, 0, 0];
        p[a] = s * H[a]; p[b] = sb * I[b]; p[e] = se * I[e];
        return p;
      };
      quad(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), n);
    }
  }
  mark = 1;
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, e = (a + 2) % 3;
    for (const sa of [-1, 1]) {
      for (const sb of [-1, 1]) {
        const n = [0, 0, 0];
        n[a] = sa * Math.SQRT1_2; n[b] = sb * Math.SQRT1_2;
        const pt = (outerA: boolean, se: number) => {
          const p = [0, 0, 0];
          p[a] = sa * (outerA ? H[a] : I[a]);
          p[b] = sb * (outerA ? I[b] : H[b]);
          p[e] = se * I[e];
          return p;
        };
        quad(pt(true, -1), pt(true, 1), pt(false, 1), pt(false, -1), n);
      }
    }
  }
  const k = 1 / Math.sqrt(3);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    tri(
      [sx * H[0], sy * I[1], sz * I[2]],
      [sx * I[0], sy * H[1], sz * I[2]],
      [sx * I[0], sy * I[1], sz * H[2]],
      sx * k, sy * k, sz * k,
    );
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  // A real attribute, not `userData`: the mark has to survive `mergeGeometries`,
  // and the sibling's audit records exactly this attribute existing only on the
  // unmerged pieces for four rounds, which silently pinned every merged surface
  // to one flat tone. `mergeBag` synthesises zeros for pieces that lack it.
  g.setAttribute('aArris', new THREE.Float32BufferAttribute(arris, 1));
  g.computeVertexNormals();
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i); uv[i * 2 + 1] = pos.getY(i); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export interface BoxOpts extends Xf {
  /** Force a sharp box — for members whose arris is sub-pixel at any range. */
  sharp?: boolean;
  /** Explicit chamfer, in metres. Overrides the automatic size gate. */
  arris?: number;
}

/**
 * A box, centred on `(x,y,z)`, automatically chamfered.
 *
 * The gate is on the member's **section**, not its overall size: a 45 mm pallet
 * board is a metre long but 45 mm thick, so its arris is sub-pixel at every
 * distance it is ever seen from. 75 mm of section and 450 mm of length is
 * roughly "a member you could sit on", which is the set of edges that actually
 * carry a building's silhouette; below that the box stays sharp and costs 12
 * triangles instead of 44.
 *
 * The cap scales with length as well as section, because a 32 mm arris on a
 * building corner 26 m away projects to about 1.3 px — which is to say, not
 * there at all. Headline silhouette corners want more than any automatic rule
 * can give them: see {@link cornerPier}.
 */
export function box(w: number, h: number, d: number, o: BoxOpts = {}): THREE.BufferGeometry {
  const aw = Math.abs(w), ah = Math.abs(h), ad = Math.abs(d);
  const m = Math.min(aw, ah, ad), big = Math.max(aw, ah, ad);
  if (o.sharp || (!o.arris && (m < 0.075 || big < 0.45))) {
    return xform(new THREE.BoxGeometry(aw, ah, ad), o);
  }
  if (o.arris) return xform(chamferBox(aw, ah, ad, Math.min(o.arris, m * 0.42)), o);
  const cap = big >= 1.2 ? 0.046 : 0.032;
  return xform(chamferBox(aw, ah, ad, Math.min(cap, Math.max(0.009, m * 0.14))), o);
}

/** Box whose *base* sits at `y` — how walls, piers and posts are dimensioned. */
export function post(w: number, h: number, d: number, x: number, y: number, z: number, o: BoxOpts = {}) {
  return box(w, h, d, { ...o, x, y: y + h / 2, z });
}

export function cyl(r: number, h: number, seg = 10, o: Xf = {}) {
  return xform(new THREE.CylinderGeometry(r, r, h, seg, 1, false), o);
}

/** An opening punched through a {@link wallRun}: `x` along the run, `y0` its cill. */
export interface Opening { x: number; w: number; y0: number; h: number }

/**
 * A wall running along +X, thickness along Z, base at y=0, centred on the origin.
 *
 * Openings are punched by splitting the run into piers, sills and lintels, so
 * every reveal is real geometry with a real shadow and no CSG is involved. This
 * is the single highest-value line in the file: it is what makes a doorway a
 * hole rather than a dark rectangle painted on a slab.
 */
export function wallRun(len: number, h: number, t: number, openings: Opening[] = []): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const sorted = [...openings].sort((a, b) => a.x - b.x);
  let cursor = -len / 2;
  for (const o of sorted) {
    const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2;
    if (x0 > cursor + 0.001) parts.push(box(x0 - cursor, h, t, { x: (cursor + x0) / 2, y: h / 2 }));
    if (o.y0 > 0.001) parts.push(box(o.w, o.y0, t, { x: o.x, y: o.y0 / 2 }));
    const top = o.y0 + o.h;
    if (top < h - 0.001) parts.push(box(o.w, h - top, t, { x: o.x, y: (h + top) / 2 }));
    cursor = x1;
  }
  if (cursor < len / 2 - 0.001) parts.push(box(len / 2 - cursor, h, t, { x: (cursor + len / 2) / 2, y: h / 2 }));
  return parts;
}

/**
 * Chamfered corner piers on the four silhouette corners of a block.
 *
 * `box()`'s automatic 46 mm arris is not enough on a building and the reason is
 * arithmetic rather than taste: at 20 m and this field of view, 46 mm projects
 * to under two pixels, which is one antialiasing pixel and no rim. A pier
 * 340 mm square standing 40 mm proud of both faces, itself struck with a 75 mm
 * chamfer, gives a facet 106 mm wide — several pixels at the range these are
 * actually seen from, and because it is cut out of the pier there is nothing
 * standing in front of it. (A fillet stuck *into* the corner does not work:
 * added geometry cannot remove a corner, and the wall's own 90° arris hides it.)
 */
export function cornerPier(out: THREE.BufferGeometry[], o: {
  w: number; d: number; cx?: number; cz?: number; y0?: number; y1: number;
  sec?: number; proud?: number; arris?: number;
}) {
  const { w, d, cx = 0, cz = 0, y0 = 0, y1, sec = 0.34, proud = 0.04, arris = 0.075 } = o;
  const h = y1 - y0;
  if (h <= 0.25) return;
  const k = sec / 2 - proud;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    out.push(box(sec, h, sec, {
      arris, x: cx + sx * (w / 2 - k), y: (y0 + y1) / 2, z: cz + sz * (d / 2 - k),
    }));
  }
}

/**
 * The projecting base a building actually stands on.
 *
 * Where a wall meets the ground is the one place on a building the eye always
 * checks for a shadow. Three courses: a mostly-buried footing that reads as a
 * hard dark line at grade, the projecting course itself, and a splayed
 * weathering above it so water runs off rather than sitting on top of the plinth.
 */
export function plinth(out: THREE.BufferGeometry[], o: {
  w: number; d: number; h?: number; proud?: number; y?: number; cx?: number; cz?: number;
}) {
  const { w, d, h = 0.55, proud = 0.14, y = 0, cx = 0, cz = 0 } = o;
  out.push(box(w + proud * 2, h, d + proud * 2, { x: cx, y: y + h / 2, z: cz }));
  out.push(box(w + proud * 2 + 0.06, 0.075, d + proud * 2 + 0.06, { x: cx, y: y + h + 0.03, z: cz }));
  out.push(box(w + proud * 0.9, 0.11, d + proud * 0.9, { x: cx, y: y + h + 0.12, z: cz }));
  out.push(box(w + proud * 2 + 0.14, 0.26, d + proud * 2 + 0.14, { x: cx, y: y - 0.10, z: cz }));
}

/**
 * Parapet, coping and drip lip round a flat roof.
 *
 * A parapet is read from three things and it needs all three: an upstand tall
 * enough to hide the roof deck, a coping whose **top face** catches the sun as a
 * bright line, and a **drip lip** under the coping nose that puts a dark line
 * immediately below it. Bright line over dark line over wall is the signature;
 * any one of them alone is nothing, and a flat-roofed box that ends at a single
 * hard edge against the sky is the most reliable "untextured box" tell there is.
 *
 * `shell` takes the upstand, `trim` the coping and lip, so the two read as
 * different materials the way a rendered upstand and a cast coping do.
 */
export function parapet(shell: THREE.BufferGeometry[], trim: THREE.BufferGeometry[], o: {
  w: number; d: number; y: number; t?: number; h?: number; cx?: number; cz?: number;
}) {
  const { w, d, y, t = 0.17, h = 0.55, cx = 0, cz = 0 } = o;
  const runs = [
    { len: w, ry: 0, x: cx, z: cz + d / 2 - t / 2, cap: w + t * 2, ox: 0, oz: 1 },
    { len: w, ry: 0, x: cx, z: cz - d / 2 + t / 2, cap: w + t * 2, ox: 0, oz: -1 },
    { len: d - t * 2, ry: Math.PI / 2, x: cx + w / 2 - t / 2, z: cz, cap: d - t * 2, ox: 1, oz: 0 },
    { len: d - t * 2, ry: Math.PI / 2, x: cx - w / 2 + t / 2, z: cz, cap: d - t * 2, ox: -1, oz: 0 },
  ];
  const lip = t / 2 + 0.145;
  for (const s of runs) {
    for (const g of wallRun(s.len, h, t, [])) shell.push(xform(g, { ry: s.ry, x: s.x, y, z: s.z }));
    trim.push(xform(box(s.cap + 0.10, 0.11, t + 0.24), { ry: s.ry, x: s.x, y: y + h + 0.055, z: s.z }));
    trim.push(xform(box(s.cap + 0.06, 0.055, 0.055), {
      ry: s.ry, x: s.x + s.ox * lip, y: y + h - 0.005, z: s.z + s.oz * lip,
    }));
  }
}

/**
 * A glazed opening with a real reveal, and the {@link Opening} the wall run
 * needs in order to leave a hole for it.
 *
 * The reveal is 280 mm deep, and that number is load-bearing. At 170 mm neither
 * the reveal nor the cill throws a shadow you can measure at thirty metres and
 * the openings simply vanish into the wall. 280 mm at this width puts the whole
 * opening in shadow from about 35° of azimuth off-normal — most of the day — so
 * the window reads as a *hole* rather than as a darker patch of wall.
 *
 * The dark card 200 mm behind the pane is what gives it parallax; without
 * something occupying the reveal, glass reads as a decal.
 */
export function windowUnit(b: Bag, o: {
  x: number; y: number; z?: number; w: number; h: number;
  faceZ?: 1 | -1; wallT: number; lit?: boolean; barred?: boolean; plain?: boolean;
}): Opening {
  const { x, y, z = 0, w, h, faceZ = 1, wallT, lit = false, barred = false, plain = false } = o;
  const inset = Math.min(0.28, wallT * 0.8);
  const face = z + faceZ * (wallT / 2);
  const zp = z + faceZ * (wallT / 2 - inset);
  const rl = 0.045;
  // Painted reveal lining. This is the bright edge the eye uses to decide the
  // wall has thickness, and it only works if it is a *different* material from
  // the wall: a reveal in the same grey is just more grey.
  for (const sx of [-1, 1]) {
    b.trim.push(box(rl, h + 0.02, inset - 0.02, { x: x + sx * (w / 2 - rl / 2), y: y + h / 2, z: zp + faceZ * (inset / 2) }));
  }
  b.trim.push(box(w - 0.02, rl, inset - 0.02, { x, y: y + h - rl / 2, z: zp + faceZ * (inset / 2) }));
  b.trim.push(box(w - 0.02, rl, inset - 0.02, { x, y: y + rl / 2, z: zp + faceZ * (inset / 2) }));
  // Frame: two stiles, head and cill rails, one mullion and one transom.
  const fr = 0.06;
  for (const sx of [-1, 1]) {
    b.trim.push(box(fr, h - 0.02, 0.075, { x: x + sx * (w / 2 - fr / 2 - 0.02), y: y + h / 2, z: zp + faceZ * 0.03 }));
  }
  for (const sy of [0.02, h - 0.02]) {
    b.trim.push(box(w - 0.04, fr, 0.075, { x, y: y + sy, z: zp + faceZ * 0.03 }));
  }
  // Mullion and transom. Dropped on `plain` openings: above the ground storey a
  // 45 mm glazing bar is well under a pixel at any range these are actually
  // seen from, and the openings on a five-storey block are most of the file's
  // triangle budget. The reveal, cill and lintel -- the three things that carry
  // an opening's *shadow* -- stay on every window at every storey.
  if (!plain) {
    b.trim.push(box(0.045, h - 0.1, 0.06, { x, y: y + h / 2, z: zp + faceZ * 0.03 }));
    b.trim.push(box(w - 0.12, 0.045, 0.06, { x, y: y + h * 0.62, z: zp + faceZ * 0.03 }));
  }
  // The room behind the glass.
  b.dark.push(box(w - 0.06, h - 0.06, 0.04, { x, y: y + h / 2, z: zp - faceZ * 0.20, sharp: true }));
  (lit ? b.glow : b.glass).push(box(w - 0.10, h - 0.10, 0.02, { x, y: y + h / 2, z: zp, sharp: true }));
  // Cast cill, 170 mm proud: throws water clear of the wall, seeds the dirt
  // streak below it, and puts a hard horizontal shadow under every opening on
  // the elevation at any sun above 30°.
  b.shell.push(box(w + 0.34, 0.085, wallT + 0.34, { x, y: y - 0.043, z: z + faceZ * 0.06, rx: faceZ * 0.05 }));
  b.shell.push(box(w + 0.30, 0.045, 0.05, { x, y: y - 0.105, z: face + faceZ * 0.145 }));
  // Lintel, proud of the wall, with its own soffit shadow.
  b.shell.push(box(w + 0.30, 0.135, wallT + 0.20, { x, y: y + h + 0.068, z: z + faceZ * 0.03 }));
  // Architrave: a 55 mm painted band round the opening. The trim colour is what
  // makes a window read as joinery rather than as a hole in a slab, and it is
  // the cheapest per-building identity there is.
  if (!plain) {
    // Jambs only, and they stop at the head. The first pass ran the architrave
    // up past the opening and added a head band on top of it, which put two
    // 55 mm slabs inside the lintel's own 500 mm depth at the same height: the
    // window heads rendered as a cross-hatched moire of z-fighting. The lintel
    // IS the head trim on a building detailed like this.
    for (const sx of [-1, 1]) {
      b.trim.push(box(0.09, h - 0.02, 0.055, { x: x + sx * (w / 2 + 0.045), y: y + h / 2 - 0.01, z: face + faceZ * 0.026 }));
    }
  }
  if (barred) {
    const zb = z + faceZ * (wallT / 2 - 0.06);
    const n = Math.max(2, Math.round(w / 0.26));
    for (let i = 1; i < n; i++) b.metal.push(cyl(0.015, h - 0.05, 5, { x: x - w / 2 + (w * i) / n, y: y + h / 2, z: zb }));
  }
  return { x, w, y0: y, h };
}

/** A doorway with a threshold slab, a hood, and a step down to the dirt. */
export function doorUnit(b: Bag, o: {
  x: number; z?: number; faceZ?: 1 | -1; wallT: number; w?: number; h?: number;
}): Opening {
  const { x, z = 0, faceZ = 1, wallT, w = DOOR_W, h = DOOR_H } = o;
  const zp = z + faceZ * (wallT / 2 - 0.11);
  b.dark.push(box(w - 0.02, h - 0.02, 0.03, { x, y: h / 2, z: zp - faceZ * 0.22, sharp: true }));
  b.trim.push(box(w - 0.06, h - 0.05, 0.055, { x, y: h / 2, z: zp }));
  for (const sy of [0.36, h - 0.36]) {
    b.metal.push(box(w - 0.16, 0.055, 0.022, { x, y: sy, z: zp + faceZ * 0.04 }));
    b.metal.push(box(0.10, 0.11, 0.06, { x: x - w / 2 + 0.07, y: sy, z: zp + faceZ * 0.03 }));
  }
  const zf = z + faceZ * (wallT / 2 + 0.02);
  b.shell.push(box(w + 0.26, 0.11, 0.07, { x, y: h + 0.055, z: zf }));
  for (const sx of [-1, 1]) b.shell.push(box(0.11, h + 0.11, 0.07, { x: x + sx * (w / 2 + 0.075), y: (h + 0.11) / 2, z: zf }));
  for (const sx of [-1, 1]) {
    b.trim.push(box(0.10, h + 0.24, 0.05, { x: x + sx * (w / 2 + 0.145), y: (h + 0.24) / 2, z: zf + faceZ * 0.055 }));
  }
  b.trim.push(box(w + 0.39, 0.10, 0.05, { x, y: h + 0.19, z: zf + faceZ * 0.055 }));
  // The hood: the entrance is the first place the eye goes, so it gets a hard
  // cast shadow of its own.
  b.shell.push(box(w + 0.86, 0.115, 0.42, { x, y: h + 0.36, z: z + faceZ * (wallT / 2 + 0.16) }));
  b.shell.push(box(w + 0.75, 0.15, 0.9, { x, y: 0.075, z: z + faceZ * (wallT / 2 + 0.45) }));
  b.shell.push(box(w + 1.05, 0.11, 0.34, { x, y: 0.02, z: z + faceZ * (wallT / 2 + 0.96) }));
  return { x, w, y0: 0, h };
}

/**
 * A horizontal string course round a block — the band that stops a multi-storey
 * facade reading as one flat rectangle. 260 mm deep, 310 mm proud, so it throws
 * a shadow the width of itself at any sun above about 40°.
 */
export function stringCourse(out: THREE.BufferGeometry[], o: {
  w: number; d: number; y: number; h?: number; proud?: number; cx?: number; cz?: number;
}) {
  const { w, d, y, h = 0.26, proud = 0.31, cx = 0, cz = 0 } = o;
  out.push(box(w + proud, h, d + proud, { x: cx, y, z: cz }));
}

/**
 * Roof furniture that is not a cube.
 *
 * The single most damning detail in the `poi_fishing` capture was a 2.4 × 1.8 ×
 * 2.2 box sitting on each roof, meant to read as plant. Real roof plant is a
 * *cased* unit: a plinth it stands on so it is not flush with the deck, a
 * louvred body, a lid proud of the case with a shadow gap under it, and a duct
 * or a flue leaving it. Five boxes instead of one, and it stops being a crate.
 */
export function plantUnit(b: Bag, o: { x: number; y: number; z: number; w?: number; h?: number; d?: number; ry?: number }) {
  const { x, y, z, w = 2.1, h = 1.25, d = 1.6, ry = 0 } = o;
  const at = (g: THREE.BufferGeometry) => xform(g, { ry, x, y, z });
  // Bearer rails, so the unit stands off the deck and casts under itself.
  for (const sz of [-1, 1]) b.metal.push(at(box(w * 0.9, 0.14, 0.18, { y: 0.07, z: sz * d * 0.34 })));
  b.roof.push(at(box(w, h, d, { y: 0.14 + h / 2 })));
  // Louvre blades on the two long faces: eight strips, each proud of the case.
  const n = 7;
  for (let i = 0; i < n; i++) {
    const ly = 0.14 + h * (0.18 + 0.66 * (i / (n - 1)));
    for (const sz of [-1, 1]) {
      b.metal.push(at(box(w * 0.82, h * 0.055, 0.055, { y: ly, z: sz * (d / 2 + 0.025), rx: sz * 0.35 })));
    }
  }
  // Lid, proud on all sides, with a shadow gap under its nose.
  b.metal.push(at(box(w + 0.16, 0.07, d + 0.16, { y: 0.14 + h + 0.035 })));
  b.metal.push(at(box(w + 0.02, 0.05, d + 0.02, { y: 0.14 + h - 0.03 })));
  // Flue and its cowl.
  b.metal.push(at(cyl(0.13, 0.9, 8, { x: w * 0.3, y: 0.14 + h + 0.5, z: -d * 0.2 })));
  b.metal.push(at(cyl(0.21, 0.11, 8, { x: w * 0.3, y: 0.14 + h + 0.98, z: -d * 0.2 })));
}

/** A roof water tank on a braced steel stand — the vertical a skyline needs. */
export function roofTank(b: Bag, o: { x: number; y: number; z: number; r?: number; h?: number }) {
  const { x, y, z, r = 1.1, h = 1.5 } = o;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI * 0.5 + 0.78;
    b.metal.push(cyl(0.055, 1.5, 5, { x: x + Math.cos(a) * r * 0.7, y: y + 0.75, z: z + Math.sin(a) * r * 0.7 }));
  }
  b.metal.push(xform(new THREE.CylinderGeometry(r, r, h, 12, 1), { x, y: y + 1.5 + h / 2, z }));
  b.metal.push(xform(new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.09, 12, 1), { x, y: y + 1.5 + h, z }));
  b.metal.push(cyl(0.06, 1.4, 6, { x: x + r * 0.5, y: y + 0.7, z }));
}

/**
 * The stair penthouse: the box that gets you onto a flat roof. Every roof that
 * a person reaches has one, and it is a much better silhouette break than
 * another anonymous cube because it has a door in it.
 */
export function stairHead(b: Bag, o: { x: number; y: number; z: number; w?: number; d?: number; ry?: number }) {
  const { x, y, z, w = 2.3, d = 2.0, ry = 0 } = o;
  const h = 2.5;
  const local = bag();
  for (const g of wallRun(w, h, 0.2, [{ x: 0, w: 0.95, y0: 0, h: 2.05 }])) local.shell.push(xform(g, { z: d / 2 - 0.1 }));
  for (const g of wallRun(w, h, 0.2, [])) local.shell.push(xform(g, { z: -d / 2 + 0.1 }));
  for (const sx of [-1, 1]) {
    for (const g of wallRun(d - 0.4, h, 0.2, [])) local.shell.push(xform(g, { ry: Math.PI / 2, x: sx * (w / 2 - 0.1) }));
  }
  local.dark.push(box(0.95, 2.05, 0.06, { y: 1.02, z: d / 2 - 0.22, sharp: true }));
  local.trim.push(box(w + 0.26, 0.12, d + 0.26, { y: h + 0.06 }));
  local.trim.push(box(w + 0.16, 0.05, 0.05, { y: h - 0.02, z: d / 2 + 0.15 }));
  for (const k of Object.keys(local)) for (const g of local[k]) b[k].push(xform(g, { ry, x, y, z }));
}

/**
 * Bake the per-vertex tone that makes flat, mapless materials stop being flat.
 *
 * Three signals multiply into `attributes.color`:
 *
 * - **A vertical gradient** from `grime` at the object's base to `bleach` at its
 *   top. Every building in a dusty place is darker where the rain splashes off
 *   the ground and paler where thirty years of sun has bleached it, and this is
 *   the single cheapest thing that makes a wall stop being one value.
 * - **A per-object jitter**, so thirty-five buildings drawn from four flat
 *   colours are not literally four colours. The whole object shares it: a shed
 *   clad in six boxes is one shed, painted once.
 * - **The arris lift** on the facets {@link box} marked. A real thirty-year-old
 *   concrete arris is chipped — the cement skin is gone, the aggregate is
 *   showing, it is paler and rougher than the face behind it. The chamfer's
 *   specular sliver alone is one or two pixels; the pale line is what carries it.
 *
 * Call this on a *finished, placed* piece, not on the recipe: the gradient is
 * measured against the y-range passed in, which is the object's own extent.
 */
export function bakeTone(g: THREE.BufferGeometry, o: {
  y0: number; y1: number; grime?: number; bleach?: number; arrisLift?: number;
  jitter?: number; tint?: [number, number, number]; streak?: number;
} = { y0: 0, y1: 1 }): THREE.BufferGeometry {
  const { y0, y1, grime = 0.74, bleach = 1.07, arrisLift = 1.2, jitter = 1, tint = [1, 1, 1], streak = 0 } = o;
  const pos = g.attributes.position;
  const arrisAttr = g.attributes.aArris;
  const span = Math.max(1e-3, y1 - y0);
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / span));
    // Grime is not linear: it is concentrated in the first metre and a half of
    // splash zone, then flattens out. sqrt(t) puts the value change where the
    // dirt actually is instead of spreading it over the whole elevation.
    let v = grime + (bleach - grime) * Math.sqrt(t);
    if (arrisAttr && arrisAttr.getX(i) > 0.5) v *= arrisLift;
    if (streak) {
      // Vertical staining below cills and scuppers: a cheap wide-band signal
      // keyed on x/z so it runs down the wall rather than round it.
      const s = Math.sin(pos.getX(i) * 2.7 + pos.getZ(i) * 1.9) * 0.5 + 0.5;
      v *= 1 - streak * s * (1 - t) * (1 - t);
    }
    v *= jitter;
    col[i * 3] = v * tint[0];
    col[i * 3 + 1] = v * tint[1];
    col[i * 3 + 2] = v * tint[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // The mark has done its job; carrying it into the scene would cost 4 bytes a
  // vertex on every merged surface for nothing anyone reads.
  if (arrisAttr) g.deleteAttribute('aArris');
  return g;
}

/**
 * Per-object tone parameters drawn from one seeded generator.
 *
 * Decorrelated draws: value, warmth and grime each come off their own call, so
 * the jitter that darkens a building does not also decide it is the warm one.
 */
export function toneVariant(rng: Rng, { valueAmp = 0.26, warmAmp = 0.085 } = {}) {
  const v = 1 + rng.gauss(0, valueAmp * 0.5);
  const warm = rng.gauss(0, warmAmp);
  return {
    jitter: Math.min(1.30, Math.max(0.74, v)),
    tint: [1 + warm, 1, 1 - warm * 0.85] as [number, number, number],
    grime: 0.72 + rng.next() * 0.16,
    streak: 0.10 + rng.next() * 0.20,
  };
}

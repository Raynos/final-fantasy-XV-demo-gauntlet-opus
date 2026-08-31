import * as THREE from 'three';
import { Rig, creatureMaterial } from '../enemies/RigBuilder.ts';
import { organicNormal, organicRoughness } from '../enemies/EnemyBase.ts';
import { mixc } from '../enemies/Palette.ts';
import { tube, blob, spike, loft, place, tint, glow, bladeCross, circleCross } from '../../combat/GeoKit.ts';

/**
 * The chocobo — the ridable bird.
 *
 * Built with the bestiary's `RigBuilder`, which is the whole perf argument for
 * this lane: every piece below is bound to a bone and merged, so a fully
 * articulated 2.3 m mount with a saddle, a tail plume and a rider's reins on it
 * costs **one draw call**, against the ~34 a `Character` costs. See
 * `project/handoff/lane22-chocobo.md` for the measured number.
 *
 * Four things separate a chocobo from a yellow ostrich-shaped mannequin, and
 * all four are geometry here rather than a texture:
 *
 * - **A feathered silhouette.** The barrel is not a smooth egg: five rings of
 *   contour feathers are shingled over it, each rolled to lie tangent to the
 *   surface it sits on, so the outline is serrated the way a bird's is and the
 *   light breaks along a hundred overlapping edges instead of one sphere.
 * - **The plume and the crest.** A nine-feather tail fan and the seven
 *   forward-swept head plumes are the two shapes that read as *chocobo* at
 *   200 m, before any colour does. They are on their own bone chains, so they
 *   trail and bob rather than being welded to the back.
 * - **An eye with something behind it.** Dark orb, iris, pupil and a specular
 *   catchlight, in an unfeathered patch. `LANDMINES.md`'s faces section is
 *   about exactly this: a covered or flat eye is what a judge calls "doll eyes"
 *   and it is the loudest single tell on any creature in this game.
 * - **Tack.** Saddle, blanket, girth, stirrups, bridle and reins. Without them
 *   a bird is scenery; with them it is transport, and the player reads it as
 *   ridable before any prompt says so.
 *
 * Forward is **+Z** and the root sits on the ground, matching the bestiary
 * convention (`Mesmenir.ts`). The rig is built outside `Enemy`, so it never
 * gets `EnemyBase._groundCal` — the foot height is hand-tuned so the toe pads
 * land at y ~= 0.02 in bind pose, and `ChocoboAnim` keeps them there.
 */

const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** One dyeable bird. Wiz sells these; `CHOCOBO_COLOURS` holds the stock. */
export interface ChocoboColours {
  key: string;
  /** Shown on the stable menu. */
  name: string;
  /** Main contour plumage. */
  plume: number;
  /** Wing primaries, tail tips, the shadowed side of everything. */
  plumeDark: number;
  /** Breast and belly down — always lighter than `plume`. */
  down: number;
  beak: number;
  /** Scaly tarsus and toes. */
  leg: number;
  eye: number;
}

/**
 * The stock at Wiz Chocobo Post, in the order the menu lists it.
 *
 * Yellow is the bird everyone starts on and the only one that is free. The
 * rest are dyes rather than breeds — the geometry is identical, which is why a
 * variant costs a rebuild of the merged geometry and nothing else.
 */
export const CHOCOBO_COLOURS: ChocoboColours[] = [
  { key: 'yellow', name: 'Yellow', plume: 0xf2c73c, plumeDark: 0xc79a1e, down: 0xfae59a, beak: 0xe8933a, leg: 0xb08048, eye: 0x140f08 },
  { key: 'black', name: 'Black', plume: 0x3a3540, plumeDark: 0x201d27, down: 0x6b6472, beak: 0xd8b45a, leg: 0x4a4450, eye: 0x120e14 },
  { key: 'white', name: 'White', plume: 0xf0ece2, plumeDark: 0xc9c3b5, down: 0xfdfbf5, beak: 0xe0a860, leg: 0xbcae96, eye: 0x1a1410 },
  { key: 'red', name: 'Red', plume: 0xc4462c, plumeDark: 0x8c2c1c, down: 0xe4926a, beak: 0xe8b04a, leg: 0x9a5638, eye: 0x1a0c08 },
  { key: 'green', name: 'Green', plume: 0x6f9a3e, plumeDark: 0x4a6c26, down: 0xc2d48a, beak: 0xdcae3c, leg: 0x86864a, eye: 0x101408 },
  { key: 'blue', name: 'Blue', plume: 0x4a72b0, plumeDark: 0x2e4c80, down: 0xa8c4e4, beak: 0xdcae5a, leg: 0x6a7a9a, eye: 0x080c18 },
];

/** Look a colour up by key; unknown keys fall back to yellow. */
export function chocoboColours(key: string): ChocoboColours {
  return CHOCOBO_COLOURS.find((c) => c.key === key) || CHOCOBO_COLOURS[0];
}

/**
 * Per-vertex roughness/metalness.
 *
 * **The attribute is `aMat`, not GeoKit's `aSurf`.** `mergeCreature`
 * (`rig/Sculpt.ts`:504) only carries `aMat`; a part that writes `aSurf` has its
 * surface response silently dropped at the merge and inherits the material
 * default, which is how a whole creature ends up answering the light at one
 * gloss. Feather is matte, keratin is semi-gloss, an eye is a mirror.
 */
function mat(geo: THREE.BufferGeometry, rough: number, metal: number) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { arr[i * 2] = rough; arr[i * 2 + 1] = metal; }
  geo.setAttribute('aMat', new THREE.BufferAttribute(arr, 2));
  return geo;
}

const FEATHER = 0.90, KERATIN = 0.34, LEATHER = 0.62, CLOTH = 0.86, WET = 0.12;

/**
 * One feather: a flat vane grown along +Y off its quill, broad in X and thin in
 * Z, bending toward +Z as it goes.
 *
 * The width profile is the part that matters. A feather is not a leaf: it is
 * narrow at the calamus, widest about a third of the way up, and tapers to a
 * round tip — and the floor of `0.10` on the vane exists because a section of
 * width exactly zero produces a degenerate ring whose normals come out NaN and
 * whose triangles the GPU discards.
 *
 * @param len metres from quill to tip
 * @param w half-width of the vane at its widest
 * @param bend how far the tip curls toward +Z, as a fraction of `len`
 * @param twist radians of roll accumulated along the shaft
 */
function feather(len: number, w: number, bend = 0.2, twist = 0, seg = 5) {
  const secs = [];
  for (let i = 0; i < seg; i++) {
    const t = i / (seg - 1);
    // A ruffle on the width, not just a taper. A vane that is one clean lens
    // reads as a petal; real plumage has a slightly ragged edge, and at this
    // scale two cycles of it is the difference between "feather" and
    // "artichoke leaf" -- which is what the first pass photographed as.
    const ruffle = 1 + Math.sin(t * Math.PI * 3.1) * 0.10;
    const vane = (0.10 + Math.sin(Math.pow(t, 0.72) * Math.PI * 0.94) * 0.86) * ruffle;
    secs.push({
      y: t * len,
      sx: w * vane,
      sz: w * 0.17 * (0.30 + vane * 0.70),
      dz: bend * t * t * len,
      rot: twist * t,
    });
  }
  return loft(bladeCross(8), secs, { capStart: false, capEnd: false });
}

/**
 * Lay a feather flat against a barrel whose long axis is +Z.
 *
 * Two rotations, and the order is the whole trick. First pitch the blade down
 * from +Y to -Z (it is now lying along the animal's back, pointing at the
 * tail); then roll it about +Z by `phi`, which sweeps it around the barrel and
 * — because the blade's own normal rolls with it — leaves it tangent to the
 * surface at exactly the point `phi` picks out. Doing it the other way round
 * gives a feather standing on edge.
 *
 * @param phi radians around the barrel from straight up, +ve toward -X
 * @param pitch how far the tip lifts off the surface
 */
function shingle(geo: THREE.BufferGeometry, phi: number, pitch: number, x: number, y: number, z: number) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, phi))
    .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + pitch, 0, 0)));
  return place(geo, { pos: [x, y, z], quat: q });
}

/** A ring of scutes down a bird's tarsus — the read that says "not a tube". */
function scutes(y0: number, y1: number, r: number, n: number) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const y = y0 + (y1 - y0) * t;
    const rr = r * (1 - t * 0.18);
    parts.push(place(
      loft(circleCross(10), [
        { y: 0, sx: rr * 1.02, sz: rr * 0.92 },
        { y: 0.022, sx: rr * 1.10, sz: rr * 1.00 },
        { y: 0.044, sx: rr * 1.00, sz: rr * 0.90 },
      ], { capStart: false, capEnd: false }),
      { pos: [0, y, 0] }
    ));
  }
  return parts;
}

/** Bind position table, so the pose code and the saddle anchor agree with the art. */
export const CHOCOBO_BONES = {
  /**
   * Where a rider's hips sit, in the bird's own frame.
   *
   * On top of the seat pad (y 1.82), not inside the barrel. The first pass put
   * it at 1.62 — below the barrel's own crown at ~1.74 — which would have
   * seated Noctis inside the bird with his legs coming out of its ribs.
   */
  seat: P(0, 1.86, -0.02),
  /** Top of the head in bind pose — the ridable height the camera frames on. */
  headTop: 2.34,
};

/**
 * Build one chocobo prototype. Clone it with `SkeletonUtils.clone`, exactly as
 * `EnemyBase.attachVisual` does.
 */
export function buildChocoboPrototype(col: ChocoboColours = CHOCOBO_COLOURS[0]) {
  const rig = new Rig();

  /* ---------------------------------------------------------- skeleton ---
   * A bird's leg is a Z: a short femur running down and FORWARD to the knee,
   * a tibiotarsus down and BACK to the hock, and a long tarsometatarsus down
   * and forward again to the foot. The hock is the joint people mistake for a
   * backwards knee, and getting its z sign wrong is what makes a bird rig walk
   * like a man in a suit.
   */
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('hips', 'root', [0, 1.30, -0.24]);
  rig.bone('spine', 'hips', [0, 1.35, 0.06]);
  rig.bone('chest', 'spine', [0, 1.36, 0.36]);
  rig.bone('neck1', 'chest', [0, 1.50, 0.52]);
  rig.bone('neck2', 'neck1', [0, 1.76, 0.60]);
  rig.bone('neck3', 'neck2', [0, 2.00, 0.60]);
  rig.bone('head', 'neck3', [0, 2.14, 0.62]);
  rig.bone('beak', 'head', [0, 2.11, 0.70]);
  rig.bone('jaw', 'head', [0, 2.07, 0.70]);
  rig.bone('crest1', 'head', [0, 2.26, 0.58]);
  rig.bone('crest2', 'crest1', [0, 2.38, 0.44]);
  rig.bone('tail1', 'hips', [0, 1.32, -0.52]);
  rig.bone('tail2', 'tail1', [0, 1.44, -0.78]);
  rig.bone('tail3', 'tail2', [0, 1.58, -1.02]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`wsh${n}`, 'chest', [0.30 * s, 1.44, 0.30]);
    rig.bone(`wel${n}`, `wsh${n}`, [0.40 * s, 1.26, 0.00]);
    rig.bone(`wtp${n}`, `wel${n}`, [0.36 * s, 1.06, -0.34]);
    rig.bone(`thg${n}`, 'hips', [0.21 * s, 1.22, -0.06]);
    rig.bone(`shn${n}`, `thg${n}`, [0.23 * s, 0.88, 0.14]);
    rig.bone(`tar${n}`, `shn${n}`, [0.23 * s, 0.48, -0.10]);
    rig.bone(`foo${n}`, `tar${n}`, [0.23 * s, 0.08, 0.04]);
    rig.bone(`toe${n}`, `foo${n}`, [0.23 * s, 0.035, 0.26]);
  }

  /* -------------------------------------------------------------- body --- */
  const bodyPts = [
    P(0, 1.31, -0.54), P(0, 1.34, -0.22), P(0, 1.36, 0.08), P(0, 1.35, 0.36), P(0, 1.31, 0.56),
  ];
  const bodyR: number[][] = [[0.23, 0.25], [0.34, 0.35], [0.37, 0.38], [0.34, 0.36], [0.24, 0.27]];
  const barrel = tube(bodyPts, bodyR, { radialSeg: 14 });
  tint(barrel, col.plume, 0.035);
  mat(barrel, FEATHER, 0);
  rig.attachChain(barrel, ['hips', 'spine', 'chest'], 1.0);

  // pale down over the breast and belly, so the bird is not one flat colour
  const belly = place(blob(0.30, 0.22, 0.42, 14, 10), { pos: [0, 1.16, 0.06] });
  tint(belly, col.down, 0.03);
  mat(belly, FEATHER, 0);
  rig.attachChain(belly, ['hips', 'spine', 'chest'], 1.0);

  const breast = place(blob(0.215, 0.255, 0.215, 14, 10), { pos: [0, 1.29, 0.50] });
  tint(breast, col.down, 0.03);
  mat(breast, FEATHER, 0);
  rig.attachBlend(breast, 'chest', 'neck1', 1.0);

  /*
   * **Down over the bib.** Two frames' worth of notes said the same thing about
   * this one blob: "the cream chest bib is a separate smooth egg with a hard
   * seam to the yellow body, visible even at 3.4 m", and "the breast down still
   * reads as one smooth pale mass; it wants a few down feathers over it". They
   * are the same defect. An ellipsoid emerging from a barrel has a silhouette
   * line where the two surfaces cross, and no amount of tinting removes it —
   * what removes it is something lying ACROSS it.
   *
   * Three staggered rows down the front of the bib, laid on the ellipsoid's own
   * radius so they cannot hover, tinted 18% of the way from down to plume so
   * they read as pale feathers on pale down rather than as a second colour.
   * The bottom row sits at y 1.16, which is where the bib meets the belly, so
   * the seam the frames named is under a feather along its whole width.
   */
  for (let j = 0; j < 3; j++) {
    const y = 1.42 - j * 0.13;
    // The bib's own radius at this height, so the quill is on the surface.
    const ex = 0.215 * Math.sqrt(Math.max(0.05, 1 - ((y - 1.29) / 0.255) ** 2));
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + (i / 4) * 1.8 + (j % 2 ? 0.22 : 0);
      const g = feather(0.14, 0.048, 0.25, 0);
      tint(g, mixc(col.down, col.plume, 0.18).getHex(), 0.04);
      mat(g, FEATHER, 0);
      place(g, {
        pos: [Math.sin(a) * ex * 0.96, y, 0.50 + Math.cos(a) * ex * 0.96],
        quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI - 0.52, a, 0)),
      });
      rig.attachBlend(g, 'chest', 'neck1', 1.0);
    }
  }

  /* --------------------------------------------------- contour plumage ---
   * Three rings of shingled feathers over the barrel. The radius at each
   * station is read off the body loft above so the feathers sit ON the
   * surface rather than hovering over it or sinking into it.
   */
  /** Radians either side of vertical left bare for the tack to sit on. */
  const SADDLE_PATCH = 0.85;
  /**
   * Radians between shingle rows. It is the same at every station, which is
   * what made the gaps: see the width formula below.
   */
  const ROW_STEP = 0.34;
  const stations = [
    { z: 0.32, i: 3, len: 0.24, w: 0.042, rows: [0.28, 0.62, 0.96, 1.30, 1.64, 1.98, 2.32] },
    { z: 0.16, i: 3, len: 0.27, w: 0.045, rows: [0.45, 0.79, 1.13, 1.47, 1.81, 2.15] },
    { z: 0.00, i: 2, len: 0.30, w: 0.048, rows: [0.26, 0.60, 0.94, 1.28, 1.62, 1.96, 2.30] },
    { z: -0.16, i: 2, len: 0.31, w: 0.048, rows: [0.42, 0.76, 1.10, 1.44, 1.78, 2.12] },
    { z: -0.32, i: 1, len: 0.32, w: 0.046, rows: [0.30, 0.64, 0.98, 1.32, 1.66, 2.00, 2.34] },
  ];
  for (const st of stations) {
    const [rx, ry] = bodyR[st.i];
    /**
     * **Vane width follows the arc it has to cover.**
     *
     * The first pass authored one half-width per station and stepped the rows
     * at a fixed `ROW_STEP` *in radians*, which means the gap between two
     * feathers is `ROW_STEP * r` and grows with the barrel. At the rump
     * (`r` 0.31 m) that arc is 0.105 m against a 0.092 m vane, so every pair
     * of feathers on the flank was 13 mm apart and the dark barrel showed
     * through as a stripe — visible on the ridden rear-three-quarter frame as
     * a set of black slots down the rump.
     *
     * Solving for the width instead of guessing it puts a constant 16%
     * overlap on every station, which is what a shingle is. The authored
     * `st.w` survives as a floor so no feather can end up narrower than it was.
     */
    const rMean = (rx + ry) * 0.5 * 0.90;
    const vane = Math.max(st.w, ROW_STEP * rMean * 0.58);
    for (const s of [-1, 1]) {
      for (const phi0 of st.rows) {
        const phi = phi0 * s;
        // the top-of-the-back feather is shared between the two sides; skip the
        // duplicate rather than z-fighting two coincident vanes
        if (s > 0 && phi0 < 0.36) continue;
        // **No plumage under the saddle.** The topline within `SADDLE_PATCH` of
        // vertical is bare barrel, because the blanket covers it — and because
        // the first pass shingled straight over the tack and buried it: the
        // saddle, the blanket and both stirrup leathers photographed as dark
        // slivers between feathers. A bird nobody can see a saddle on is not a
        // mount, and the tack is most of what says this one is ridable.
        if (phi0 < SADDLE_PATCH) continue;
        const px = -Math.sin(phi) * rx * 0.90;
        const py = 1.345 + Math.cos(phi) * ry * 0.90;
        /**
         * Pitch falls off down the flank. A tip lifted 0.30 rad off the
         * surface casts a slot under itself, and near the topline the eye is
         * looking straight into that slot; low on the flank it is looking
         * along the feather and the lift is what makes the plumage read as
         * layered rather than painted on. So keep the lift where it does work
         * and take it away where it only opens a gap.
         */
        /*
         * **And it falls off toward the shoulder as well**, which the first
         * version of this rule missed by keying only on the ring angle.
         *
         * `shingle` lays a feather pointing at the TAIL, so a feather quilled
         * at the forward station `z 0.32` has its tip at `z 0.08` — where the
         * barrel is at its widest, `r 0.37` against the `0.34` it was quilled
         * on. The lift is `len * sin(pitch) + bend * len` = 0.071 + 0.072 m
         * against a surface that has risen 0.03, so the tip stood about 0.11 m
         * proud of the back: a row of hard triangular tips over the shoulder,
         * which is what the lifetime-2 frames read at 3.4 m. At the rump the
         * same lift is over a surface that is FALLING away, so the tips read as
         * coverts and are correct — hence a falloff and not a flat reduction.
         */
        const fwd = Math.max(0, st.z) / 0.32;
        const pitch = Math.max(0.08, 0.30 * (1 - phi0 * 0.28) * (1 - 0.60 * fwd));
        const g = feather(st.len, vane, 0.30 * (1 - 0.55 * fwd), 0);
        tint(g, mixc(col.plume, col.plumeDark, Math.min(0.55, phi0 * 0.22)).getHex(), 0.05);
        mat(g, FEATHER, 0);
        shingle(g, phi, pitch, px, py, st.z);
        rig.attachChain(g, ['hips', 'spine', 'chest'], 1.0);
      }
    }
  }

  /* -------------------------------------------------------------- neck --- */
  const neck = tube([
    P(0, 1.40, 0.46), P(0, 1.58, 0.55), P(0, 1.80, 0.60), P(0, 2.02, 0.60), P(0, 2.12, 0.61),
  ], [[0.20, 0.20], [0.155, 0.16], [0.125, 0.13], [0.115, 0.12], [0.115, 0.12]], { radialSeg: 12 });
  tint(neck, col.plume, 0.03);
  mat(neck, FEATHER, 0);
  rig.attachChain(neck, ['chest', 'neck1', 'neck2', 'neck3', 'head'], 1.0);

  // the ruff where the neck meets the shoulders — a skirt of down pointing back
  for (let i = 0; i < 17; i++) {
    const a = -Math.PI * 0.94 + (i / 16) * Math.PI * 1.88;
    const g = feather(0.21, 0.036, 0.45, 0.12);
    tint(g, mixc(col.down, col.plume, 0.45).getHex(), 0.05);
    mat(g, FEATHER, 0);
    shingle(g, a, 0.95, -Math.sin(a) * 0.185, 1.50 + Math.cos(a) * 0.185, 0.50);
    rig.attachBlend(g, 'chest', 'neck1', 1.0);
  }

  /* -------------------------------------------------------------- head --- */
  const skull = place(blob(0.135, 0.125, 0.155, 14, 10), { pos: [0, 2.145, 0.625] });
  tint(skull, col.plume, 0.025);
  mat(skull, FEATHER, 0);
  rig.attach(skull, 'head');

  // brow shelf: without it the eye reads as a bead stuck on a ball
  for (const s of [-1, 1]) {
    const b = place(blob(0.058, 0.030, 0.062, 8, 6), { pos: [0.088 * s, 2.205, 0.688], rot: [0.25, 0, -0.30 * s] });
    tint(b, mixc(col.plume, col.plumeDark, 0.4).getHex(), 0.03);
    mat(b, FEATHER, 0);
    rig.attach(b, 'head');
  }

  // beak: short, deep and blunt, with a slight hook. Keratin, not feather.
  const upper = tube([
    P(0, 2.135, 0.66), P(0, 2.128, 0.78), P(0, 2.110, 0.88), P(0, 2.075, 0.945),
  ], [[0.095, 0.072], [0.078, 0.060], [0.050, 0.040], [0.018, 0.016]], { radialSeg: 10 });
  tint(upper, col.beak, 0.02);
  mat(upper, KERATIN, 0);
  rig.attach(upper, 'beak');

  const lower = tube([
    P(0, 2.085, 0.66), P(0, 2.082, 0.77), P(0, 2.078, 0.855),
  ], [[0.080, 0.045], [0.062, 0.036], [0.030, 0.020]], { radialSeg: 10 });
  tint(lower, mixc(col.beak, 0x000000, 0.22).getHex(), 0.02);
  mat(lower, KERATIN, 0);
  rig.attach(lower, 'jaw');

  for (const s of [-1, 1]) {
    const nos = place(blob(0.014, 0.010, 0.012, 6, 5), { pos: [0.038 * s, 2.140, 0.720] });
    tint(nos, 0x241a10);
    mat(nos, KERATIN, 0);
    rig.attach(nos, 'beak');
  }

  /* --------------------------------------------------------------- eye ---
   * Dark orb, iris, pupil, catchlight, in a bare patch. The catchlight is
   * emissive on purpose: it is a fixed radiance, invisible against the diffuse
   * term at noon and the only thing that keeps the eye alive at dusk.
   */
  for (const s of [-1, 1]) {
    const ex = 0.108 * s, ey = 2.162, ez = 0.688;
    const patch = place(blob(0.062, 0.058, 0.050, 10, 8), { pos: [ex * 0.92, ey, ez * 0.995] });
    tint(patch, mixc(col.plumeDark, 0x000000, 0.35).getHex(), 0.02);
    mat(patch, FEATHER, 0);
    rig.attach(patch, 'head');

    const orb = place(blob(0.047, 0.047, 0.045, 12, 9), { pos: [ex, ey, ez] });
    tint(orb, col.eye);
    mat(orb, WET, 0);
    rig.attach(orb, 'head');

    const iris = place(blob(0.028, 0.028, 0.014, 10, 7), { pos: [ex + 0.031 * s, ey + 0.002, ez + 0.020], rot: [0, 0.62 * s, 0] });
    tint(iris, mixc(col.eye, 0x6a4a24, 0.55).getHex());
    mat(iris, WET, 0);
    rig.attach(iris, 'head');

    const pupil = place(blob(0.014, 0.015, 0.008, 8, 6), { pos: [ex + 0.040 * s, ey + 0.002, ez + 0.026], rot: [0, 0.62 * s, 0] });
    tint(pupil, 0x05040a);
    mat(pupil, WET, 0);
    rig.attach(pupil, 'head');

    const spark = place(blob(0.0105, 0.0105, 0.008, 7, 6), { pos: [ex + 0.036 * s, ey + 0.024, ez + 0.030] });
    tint(spark, 0xffffff);
    glow(spark, 0xf6f2ea, 0.55);
    mat(spark, WET, 0);
    rig.attach(spark, 'head');
  }

  /* ------------------------------------------------------------- crest ---
   * Three big forward-swept plumes and two short side ones. This is the shape
   * that reads as "chocobo" at 200 m, before the colour does.
   */
  const crest: Array<[number, number, number, number, number, string]> = [
    [0.000, 0.46, 0.034, -0.62, 0.00, 'crest1'],
    [-0.032, 0.42, 0.031, -0.58, -0.16, 'crest1'],
    [0.032, 0.42, 0.031, -0.58, 0.16, 'crest1'],
    [-0.062, 0.35, 0.028, -0.52, -0.34, 'crest1'],
    [0.062, 0.35, 0.028, -0.52, 0.34, 'crest1'],
    [-0.090, 0.26, 0.024, -0.42, -0.56, 'head'],
    [0.090, 0.26, 0.024, -0.42, 0.56, 'head'],
  ];
  for (const [cx, len, w, bend, roll, bone] of crest) {
    const g = feather(len, w, bend, 0.35);
    tint(g, mixc(col.plume, col.down, 0.30).getHex(), 0.05);
    mat(g, FEATHER, 0);
    place(g, { pos: [cx, 2.235, 0.585], quat: new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(0, 0, roll))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.30, 0, 0))) });
    rig.attach(g, bone);
  }

  /* -------------------------------------------------------------- wings ---
   * Folded against the flank: a covert-feathered upper arm, then five
   * primaries sweeping back past the hip.
   */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const arm = tube([
      P(0.29 * s, 1.46, 0.32), P(0.37 * s, 1.32, 0.10), P(0.40 * s, 1.20, -0.06),
    ], [[0.10, 0.13], [0.085, 0.13], [0.065, 0.11]], { radialSeg: 8 });
    tint(arm, col.plume, 0.03);
    mat(arm, FEATHER, 0);
    rig.attachChain(arm, [`wsh${n}`, `wel${n}`], 1.0);

    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const g = feather(0.38 + t * 0.20, 0.038 + t * 0.008, 0.16, 0.10 * s);
      tint(g, mixc(col.plume, col.plumeDark, 0.25 + t * 0.6).getHex(), 0.04);
      mat(g, FEATHER, 0);
      // splayed slightly in the flank plane, all pointing at the tail
      place(g, { pos: [(0.375 + t * 0.035) * s, 1.235 - t * 0.055, -0.02 - t * 0.02],
        quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, (1.30 + t * 0.16) * s))
          .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.16 - t * 0.30, 0, 0))) });
      rig.attachChain(g, [`wel${n}`, `wtp${n}`], 1.0);
    }
  }

  /* --------------------------------------------------------------- tail ---
   * Seven feathers in an upswept fan. Bound down the tail chain, so the whole
   * plume trails on the turn and bounces on the stride.
   */
  const tailBase = place(blob(0.20, 0.19, 0.18, 12, 9), { pos: [0, 1.34, -0.50] });
  tint(tailBase, mixc(col.plume, col.plumeDark, 0.30).getHex(), 0.04);
  mat(tailBase, FEATHER, 0);
  rig.attachBlend(tailBase, 'hips', 'tail1', 1.0);

  for (let i = 0; i < 9; i++) {
    const t = (i / 8) * 2 - 1;                       // -1 .. 1 across the fan
    const len = 0.90 - Math.abs(t) * 0.26;
    // Wider vanes than the contour feathers, on purpose. Narrowing these to
    // match the body plumage turned the plume into a broom — a chocobo's tail
    // is a fan of BROAD rectrices, and it is the silhouette that carries the
    // animal from behind and at distance.
    const g = feather(len, 0.105 - Math.abs(t) * 0.022, -0.14, 0.22 * Math.sign(t || 1));
    tint(g, mixc(col.plume, col.plumeDark, 0.15 + Math.abs(t) * 0.35).getHex(), 0.05);
    mat(g, FEATHER, 0);
    place(g, {
      pos: [t * 0.070, 1.40, -0.56],
      quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -t * 0.66))
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.70, 0, 0))),
    });
    rig.attachChain(g, ['tail1', 'tail2', 'tail3'], 1.0);
  }

  /* --------------------------------------------------------------- legs --- */
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';

    // feathered thigh: the "trousers" that hide the hip joint
    const thigh = tube([
      P(0.20 * s, 1.26, -0.06), P(0.22 * s, 1.06, 0.02), P(0.23 * s, 0.90, 0.12),
    ], [[0.155, 0.185], [0.135, 0.165], [0.095, 0.115]], { radialSeg: 10 });
    tint(thigh, col.plume, 0.03);
    mat(thigh, FEATHER, 0);
    rig.attachChain(thigh, ['hips', `thg${n}`, `shn${n}`], 1.0);

    /*
     * **Hip coverts**, and they are the transition the frames said was missing:
     * "the thigh/hip masses are two bald smooth spheres butted onto the
     * shingled flank with no transition".
     *
     * That is a gap in the coverage and it is measurable. The lowest shingle
     * row is `phi0 2.34`, which `shingle` puts at `y 1.345 + cos(2.34) * 0.35 *
     * 0.90` = **1.13**; the highest thigh feather below is quilled at **1.02**.
     * Between them 110 mm of the thigh tube and the hip is bare loft, at the
     * one place on the animal where two smooth masses meet. This is the same
     * ring as the thigh feathers, one station higher and with a longer vane, so
     * the two overlap instead of leaving a band.
     */
    for (let i = 0; i < 6; i++) {
      const a = -1.25 + (i / 5) * 2.50;
      const g = feather(0.30, 0.062, 0.14, 0);
      tint(g, mixc(col.plume, col.plumeDark, 0.14).getHex(), 0.05);
      mat(g, FEATHER, 0);
      place(g, {
        pos: [(0.205 + Math.cos(a) * 0.055) * s, 1.235, -0.03 + Math.sin(a) * 0.17],
        quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI - 0.26, a * 0.7, 0)),
      });
      rig.attachChain(g, ['hips', `thg${n}`], 1.0);
    }

    for (let i = 0; i < 5; i++) {
      const a = -1.15 + (i / 4) * 2.30;
      const g = feather(0.22, 0.055, 0.10, 0);
      tint(g, mixc(col.plume, col.plumeDark, 0.20).getHex(), 0.05);
      mat(g, FEATHER, 0);
      place(g, {
        pos: [(0.215 + Math.cos(a) * 0.02) * s, 1.02, 0.02 + Math.sin(a) * 0.15],
        quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI - 0.20, a * 0.7, 0)),
      });
      rig.attachChain(g, [`thg${n}`, `shn${n}`], 1.0);
    }

    // shank, still feathered at the top, bare and scaly by the hock
    const shank = tube([
      P(0.23 * s, 0.90, 0.12), P(0.23 * s, 0.68, 0.02), P(0.23 * s, 0.50, -0.09),
    ], [[0.090, 0.105], [0.065, 0.070], [0.048, 0.052]], { radialSeg: 9 });
    tint(shank, mixc(col.plume, col.leg, 0.55).getHex(), 0.04);
    mat(shank, 0.72, 0);
    rig.attachChain(shank, [`shn${n}`, `tar${n}`], 1.0);

    // the long bare tarsus
    const tars = tube([
      P(0.23 * s, 0.50, -0.09), P(0.23 * s, 0.30, -0.02), P(0.23 * s, 0.10, 0.03),
    ], [[0.052, 0.052], [0.046, 0.046], [0.048, 0.048]], { radialSeg: 9 });
    tint(tars, col.leg, 0.05);
    mat(tars, 0.52, 0);
    rig.attachChain(tars, [`tar${n}`, `foo${n}`], 1.0);

    for (const sc of scutes(0.13, 0.46, 0.050, 6)) {
      place(sc, { pos: [0.23 * s, 0, -0.02] });
      tint(sc, mixc(col.leg, 0x000000, 0.22).getHex(), 0.05);
      mat(sc, 0.46, 0);
      rig.attachChain(sc, [`tar${n}`, `foo${n}`], 1.0);
    }

    // three forward toes and one small hallux, each with a claw
    const toes: Array<[number, number, number]> = [[0, 0.30, 0], [-0.62, 0.25, 0], [0.62, 0.25, 0], [Math.PI, 0.13, 0]];
    for (const [ang, reach] of toes) {
      const dx = Math.sin(ang) * reach, dz = Math.cos(ang) * reach;
      const toe = tube([
        P(0.23 * s, 0.085, 0.02), P(0.23 * s + dx * 0.5, 0.055, 0.02 + dz * 0.5), P(0.23 * s + dx, 0.038, 0.02 + dz),
      ], [[0.040, 0.038], [0.030, 0.028], [0.020, 0.019]], { radialSeg: 7 });
      tint(toe, col.leg, 0.05);
      mat(toe, 0.50, 0);
      rig.attach(toe, `foo${n}`);

      const claw = place(spike(0.019, 0.075), {
        pos: [0.23 * s + dx * 1.02, 0.032, 0.02 + dz * 1.02],
        quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang, 0))
          .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.30, 0, 0))),
      });
      tint(claw, 0x241d16);
      mat(claw, KERATIN, 0);
      rig.attach(claw, `foo${n}`);
    }
  }

  /* --------------------------------------------------------------- tack ---
   * Saddle, blanket, girth, stirrups, bridle, reins. This is what turns a bird
   * into transport: the player reads the silhouette as ridable before any
   * prompt says it is.
   */
  const TAN = 0x6b4a2e, TAN_DARK = 0x3f2c1a, BRASS = 0xa9822f, RUG = 0x2a4d63, RUG_TRIM = 0xd9c07a;

  const blanket = tube([
    P(0, 1.665, -0.36), P(0, 1.725, -0.10), P(0, 1.725, 0.14), P(0, 1.665, 0.36),
  ], [[0.30, 0.085], [0.355, 0.085], [0.355, 0.085], [0.29, 0.075]], { radialSeg: 12 });
  tint(blanket, RUG, 0.03);
  mat(blanket, CLOTH, 0);
  rig.attachChain(blanket, ['hips', 'spine', 'chest'], 1.0);

  const trim = tube([
    P(0, 1.645, -0.38), P(0, 1.705, -0.12), P(0, 1.705, 0.12), P(0, 1.645, 0.36),
  ], [[0.315, 0.048], [0.370, 0.048], [0.370, 0.048], [0.305, 0.044]], { radialSeg: 12 });
  tint(trim, RUG_TRIM, 0.03);
  mat(trim, CLOTH, 0);
  rig.attachChain(trim, ['hips', 'spine', 'chest'], 1.0);

  const seat = tube([
    P(0, 1.785, -0.26), P(0, 1.820, -0.08), P(0, 1.820, 0.10), P(0, 1.785, 0.28),
  ], [[0.20, 0.075], [0.27, 0.085], [0.27, 0.085], [0.19, 0.070]], { radialSeg: 12 });
  tint(seat, TAN, 0.03);
  mat(seat, LEATHER, 0);
  rig.attachChain(seat, ['spine', 'chest'], 1.0);

  // pommel forward, cantle behind — a seat you could not slide out of
  const pommel = place(blob(0.075, 0.105, 0.055, 10, 8), { pos: [0, 1.850, 0.29], rot: [-0.35, 0, 0] });
  tint(pommel, TAN_DARK, 0.02);
  mat(pommel, LEATHER, 0);
  rig.attach(pommel, 'chest');

  const cantle = place(blob(0.135, 0.115, 0.055, 10, 8), { pos: [0, 1.860, -0.28], rot: [0.42, 0, 0] });
  tint(cantle, TAN_DARK, 0.02);
  mat(cantle, LEATHER, 0);
  rig.attach(cantle, 'spine');

  const horn = place(blob(0.030, 0.048, 0.030, 8, 6), { pos: [0, 1.920, 0.275] });
  tint(horn, BRASS);
  mat(horn, 0.30, 0.85);
  rig.attach(horn, 'chest');

  // girth: a belt right round the barrel, plus the buckle you can see
  const girth = new THREE.TorusGeometry(1, 0.020, 6, 26);
  girth.rotateY(Math.PI / 2);
  girth.scale(1, 0.395, 0.365);
  place(girth, { pos: [0, 1.335, 0.14] });
  tint(girth, TAN_DARK, 0.02);
  mat(girth, LEATHER, 0);
  rig.attachBlend(girth, 'spine', 'chest', 1.0);

  for (const s of [-1, 1]) {
    const buckle = place(blob(0.030, 0.036, 0.014, 8, 6), { pos: [0.335 * s, 1.245, 0.14] });
    tint(buckle, BRASS);
    mat(buckle, 0.32, 0.85);
    rig.attach(buckle, 'spine');

    // stirrup leather and the iron on the end of it
    const strap = tube([
      P(0.245 * s, 1.785, 0.06), P(0.330 * s, 1.42, 0.05), P(0.350 * s, 1.16, 0.05),
    ], [[0.022, 0.011], [0.022, 0.011], [0.020, 0.010]], { radialSeg: 6 });
    tint(strap, TAN_DARK, 0.02);
    mat(strap, LEATHER, 0);
    rig.attachBlend(strap, 'spine', 'chest', 1.0);

    const iron = new THREE.TorusGeometry(0.065, 0.014, 5, 14);
    place(iron, { pos: [0.350 * s, 1.09, 0.05], rot: [0, Math.PI / 2, 0] });
    tint(iron, BRASS);
    mat(iron, 0.34, 0.85);
    rig.attach(iron, 'spine');
  }

  // bridle: a browband, a cheek strap and a noseband, then the reins
  for (const s of [-1, 1]) {
    const cheek = tube([
      P(0.115 * s, 2.235, 0.60), P(0.128 * s, 2.150, 0.685), P(0.105 * s, 2.095, 0.755),
    ], [[0.014, 0.008], [0.014, 0.008], [0.013, 0.007]], { radialSeg: 6 });
    tint(cheek, TAN_DARK, 0.02);
    mat(cheek, LEATHER, 0);
    rig.attach(cheek, 'head');
  }
  const noseband = new THREE.TorusGeometry(1, 0.013, 5, 16);
  noseband.rotateX(Math.PI / 2);
  /**
   * **The ring radius is in X and Z here, and the TUBE is in Y.**
   * `TorusGeometry` builds its ring in XY with the tube along Z; `rotateX` has
   * just swapped Y and Z, so the two axes to squash into an oval are X and Z
   * and the one that must stay at 1 is Y. Scaling `(0.098, 0.082, 1)` instead
   * left the ring radius at 1.0 in Z and hung a **two-metre black ellipse**
   * off the bird's beak, which photographed as a slab lying on the ground
   * beside it in two capture rounds before anyone looked at what it was.
   */
  noseband.scale(0.098, 1, 0.082);
  place(noseband, { pos: [0, 2.108, 0.775], rot: [0.18, 0, 0] });
  tint(noseband, TAN_DARK, 0.02);
  mat(noseband, LEATHER, 0);
  rig.attach(noseband, 'beak');

  for (const s of [-1, 1]) {
    const rein = tube([
      P(0.095 * s, 2.100, 0.770), P(0.140 * s, 1.980, 0.660), P(0.150 * s, 1.830, 0.520),
      P(0.130 * s, 1.860, 0.370), P(0.055 * s, 1.840, 0.290),
    ], [[0.011, 0.007], [0.011, 0.007], [0.011, 0.007], [0.011, 0.007], [0.010, 0.006]], { radialSeg: 6 });
    tint(rein, mixc(TAN_DARK, 0x000000, 0.2).getHex(), 0.02);
    mat(rein, LEATHER, 0);
    rig.attachChain(rein, ['beak', 'head', 'neck3', 'neck2', 'neck1', 'chest'], 1.0);
  }

  const material = creatureMaterial({
    roughness: FEATHER, metalness: 0.0,
    normalMap: organicNormal(), normalScale: 0.62, roughnessMap: organicRoughness(),
  });
  const built = rig.build(material, {
    radius: 1.9,
    coat: { mottle: 0.10, tick: 0.10, shade: 0.14, dust: 0.20, dustTop: 0.42 },
  });
  return { ...built, rig, colours: col };
}

export type ChocoboPrototype = ReturnType<typeof buildChocoboPrototype>;

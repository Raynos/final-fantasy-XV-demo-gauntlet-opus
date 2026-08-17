import * as THREE from 'three';
import { PartBuilder, loft, loftBand, ring } from './PartBuilder.js';

/**
 * The Regalia — a procedurally lofted black luxury coupe.
 *
 * The hull and the greenhouse are two superelliptic lofts; chrome trim, the
 * roof shell and the pillars are extracted as bands off those same lofts so
 * every highlight follows the real body surface instead of floating over it.
 *
 * Three things separate a car from a die-cast toy of a car, and all three are
 * built here explicitly:
 *
 * - **Wheel wells.** The hull loft is carved with a circular arch profile at
 *   each axle: the lower flank lifts into a semicircle and tucks 140 mm inboard,
 *   so the fender lip genuinely overhangs a recessed tyre with a dark liner
 *   behind it, instead of a wheel being parked against a flat slab.
 * - **An interior.** Seats, a dashboard, a wheel and a console sit under glass
 *   that is actually transparent, so the greenhouse reads as a cabin with air
 *   in it rather than a painted-black canopy.
 * - **Shut lines.** Bonnet, doors and boot are cut as narrow ribbons lifted off
 *   the body surface, which is what tells the eye the panels are separate parts.
 *
 * Forward is +X. Built at 5.6 m and scaled to 6.4 m long, 2.3 m wide, on
 * 0.95 m wheels — the Regalia is a land yacht and has to hold the width of the
 * highway it is parked on.
 */

const N = 28;                      // ring resolution
const SEC = 40;                    // hull sections
const LEN = 2.8;                   // half length (pre-scale)
const SCALE = 1.14;                // final size against a 1.8 m character
const WIDE = 1.06;                 // fatten the body over the base loft

// wheel arch geometry, in hull-local units
const AXLE_F = 1.74, AXLE_R = -1.80;
const ARCH_HALF = 0.63;            // half-length of the arch opening in x
const ARCH_TOP = 0.96;             // y the arch crown lifts to
const ARCH_TUCK = 0.14;            // how far the well tucks inboard

/** Piecewise-linear profile lookup with smooth interpolation. */
function curve(u, keys) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const [u0, v0] = keys[i - 1], [u1, v1] = keys[i];
      const t = (u - u0) / Math.max(1e-6, u1 - u0);
      const s = t * t * (3 - 2 * t);
      return v0 + (v1 - v0) * s;
    }
  }
  return keys[keys.length - 1][1];
}

const HW = [[0, 0.56], [0.05, 0.84], [0.15, 1.00], [0.3, 0.965], [0.5, 0.95], [0.66, 0.99], [0.82, 0.96], [0.93, 0.82], [1, 0.52]];
const YB = [[0, 0.50], [0.08, 0.38], [0.16, 0.34], [0.84, 0.34], [0.93, 0.39], [1, 0.52]];
const YT = [[0, 0.90], [0.06, 0.97], [0.18, 0.955], [0.45, 0.95], [0.62, 0.965], [0.74, 0.97], [0.88, 0.94], [0.96, 0.90], [1, 0.82]];

const GH0 = 0.175, GH1 = 0.652;    // greenhouse span in u
const GHW = [[0, 0.50], [0.16, 0.80], [0.35, 0.855], [0.62, 0.855], [0.82, 0.79], [1, 0.52]];
const GRF = [[0, 1.00], [0.12, 1.36], [0.24, 1.50], [0.56, 1.51], [0.76, 1.41], [0.9, 1.27], [1, 1.12]];

const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

/**
 * Circular arch cutout profile at a given hull x — 0 outside the opening,
 * 1 directly over the axle.
 */
function archK(x) {
  let k = 0;
  for (const ax of [AXLE_F, AXLE_R]) {
    const d = (x - ax) / ARCH_HALF;
    if (Math.abs(d) < 1) k = Math.max(k, Math.sqrt(1 - d * d));
  }
  return k;
}

/**
 * Carve a wheel well into one hull cross-section.
 *
 * The lift is what makes the arch: outer points below the crown are pushed up
 * onto a circle, so in profile the opening is a semicircle instead of a
 * rectangle. The tuck then pulls everything under the tyre axis inboard, which
 * is what puts the tyre *inside* the body rather than beside it.
 */
function carveArch(pts, x, yLow) {
  const k = archK(x);
  if (k <= 0) return pts;
  const liftTo = yLow + (ARCH_TOP - yLow) * k;
  return pts.map(([y, z]) => {
    const az = Math.abs(z);
    const outer = smooth(0.34, 0.62, az);
    if (outer <= 0) return [y, z];
    const y2 = y < liftTo ? y + (liftTo - y) * outer : y;
    // only the part below the tyre axis tucks in; above it the fender
    // stays proud so it can overhang
    const low = 1 - smooth(0.62, 0.98, y);
    const z2 = z * (1 - ARCH_TUCK * k * outer * (0.35 + 0.65 * low));
    return [y2, z2];
  });
}

function hullSections() {
  const s = [];
  for (let i = 0; i < SEC; i++) {
    const u = i / (SEC - 1);
    const x = -LEN + u * LEN * 2;
    const yLow = curve(u, YB);
    const pts = ring(N, curve(u, HW) * WIDE, yLow, curve(u, YT), 3.7);
    s.push({ x, u, pts: carveArch(pts, x, yLow) });
  }
  return s;
}

function greenhouseSections() {
  const s = [];
  const M = 20;
  for (let i = 0; i < M; i++) {
    const t = i / (M - 1);
    const u = GH0 + t * (GH1 - GH0);
    const x = -LEN + u * LEN * 2;
    s.push({ x, t, pts: ring(N, curve(t, GHW) * WIDE, 0.88, curve(t, GRF), 3.4) });
  }
  return s;
}

/**
 * A narrow ribbon lying on the hull surface — a panel shut line.
 * @param {number} u position along the body, 0 = tail, 1 = nose
 * @param {number} j0 first ring column
 * @param {number} j1 last ring column
 * @param {number} w gap width in metres
 */
function shutline(u, j0, j1, w = 0.016) {
  const secs = [];
  const du = w / (2 * LEN * 2);
  for (const uu of [u - du, u + du]) {
    const yLow = curve(uu, YB);
    const pts = ring(N, curve(uu, HW) * WIDE, yLow, curve(uu, YT), 3.7);
    secs.push({ x: -LEN + uu * LEN * 2, pts: carveArch(pts, -LEN + uu * LEN * 2, yLow) });
  }
  return loftBand(secs, j0, j1, 0.0045);
}

/** Soft radial contact shadow so the car is planted, not hovering. */
function contactShadowTexture() {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  // body pool: a long soft ellipse
  const g = ctx.createRadialGradient(s * 0.5, s * 0.5, 0, s * 0.5, s * 0.5, s * 0.5);
  g.addColorStop(0.0, 'rgba(0,0,0,0.68)');
  g.addColorStop(0.42, 'rgba(0,0,0,0.42)');
  g.addColorStop(0.75, 'rgba(0,0,0,0.10)');
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(s * 0.5, s * 0.5); ctx.scale(1, 0.44); ctx.translate(-s * 0.5, -s * 0.5);
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  ctx.restore();
  // four hard little pools right under the contact patches
  for (const cx of [0.208, 0.792]) {
    for (const cy of [0.30, 0.70]) {
      const w = ctx.createRadialGradient(s * cx, s * cy, 0, s * cx, s * cy, s * 0.085);
      w.addColorStop(0, 'rgba(0,0,0,0.95)');
      w.addColorStop(0.45, 'rgba(0,0,0,0.6)');
      w.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = w;
      ctx.fillRect(s * (cx - 0.1), s * (cy - 0.1), s * 0.2, s * 0.2);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/**
 * @param {object} opts
 * @param {THREE.Texture|null} [opts.envMap]
 * @returns {{group:THREE.Group, lights:THREE.Object3D[],
 *            lamp:THREE.Material, tail:THREE.Material}}
 */
export function buildRegalia({ envMap = null } = {}) {
  const group = new THREE.Group();
  group.name = 'regalia';
  const car = new THREE.Group();
  car.name = 'regalia_body';
  car.scale.setScalar(SCALE);
  group.add(car);

  const paint = new THREE.MeshPhysicalMaterial({
    color: 0x0a0b0e, metalness: 0.0, roughness: 0.3,
    clearcoat: 0.85, clearcoatRoughness: 0.07, envMapIntensity: 0.3,
  });
  paint.name = 'paint';
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xb4b9c0, metalness: 1.0, roughness: 0.14, envMapIntensity: 0.9,
  });
  chrome.name = 'chrome';
  // Real glass: you see the cabin through it, and the sky on it.
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x7f97ab, metalness: 0.0, roughness: 0.035,
    transparent: true, opacity: 0.52, depthWrite: false,
    clearcoat: 1.0, clearcoatRoughness: 0.02, envMapIntensity: 2.2,
    side: THREE.FrontSide,
  });
  glass.name = 'glass';
  const rubber = new THREE.MeshStandardMaterial({ color: 0x121316, roughness: 0.92, metalness: 0.0 });
  rubber.name = 'rubber';
  const lamp = new THREE.MeshStandardMaterial({
    color: 0xf6f0e2, emissive: 0xfff0d0, emissiveIntensity: 0.35,
    roughness: 0.12, metalness: 0.1,
  });
  lamp.name = 'lamp';
  const tail = new THREE.MeshStandardMaterial({
    color: 0x5c0d0e, emissive: 0xd41c12, emissiveIntensity: 0.35, roughness: 0.24, metalness: 0.2,
  });
  tail.name = 'tail';
  const trim = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.68, metalness: 0.2 });
  trim.name = 'trim';
  // near-black matte for shut lines and window rubbers
  const seam = new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 0.95, metalness: 0 });
  seam.name = 'seam';
  const hide = new THREE.MeshStandardMaterial({ color: 0x4a3b30, roughness: 0.68, metalness: 0.02 });
  hide.name = 'hide';

  if (envMap) for (const m of [paint, chrome, glass, lamp, trim, hide]) m.envMap = envMap;

  const B = new PartBuilder();
  const hull = hullSections();
  const gh = greenhouseSections();

  // --- hull + greenhouse ------------------------------------------------
  B.add(paint, loft(hull, { caps: true }));
  B.add(glass, loft(gh, { caps: false }));

  // roof shell over the greenhouse (columns around the top of the ring)
  B.add(paint, loftBand(gh, N * 0.5 - 7, N * 0.5 + 7, 0.012));
  // solid rear quarter panel; the rest of the greenhouse stays glass
  B.add(paint, loftBand(gh.slice(0, 3), 2, N - 2, 0.013));
  // chrome window surround, one column wide, following the beltline
  B.add(chrome, loftBand(gh, -1, 0, 0.015));
  // black rubber weatherstrip just under the chrome, so the glass has a seat
  B.add(seam, loftBand(gh, 0, 1, 0.006));
  // A-pillars and the header rail over the windscreen: without them the cabin
  // reads as an open bathtub with furniture in it rather than a closed coupe
  B.add(paint, loftBand(gh.slice(gh.length - 3), 2, N - 2, 0.013));
  B.add(chrome, loftBand(gh.slice(gh.length - 4, gh.length - 2), 5, N - 5, 0.016));
  B.add(chrome, loftBand(gh.slice(1, 3), 5, N - 5, 0.016));
  // B-pillar between the door glass and the rear quarter light
  const bp = Math.round(gh.length * 0.44);
  B.add(paint, loftBand(gh.slice(bp, bp + 2), 3, N - 3, 0.013));

  // Chrome spear and rocker sill, taken as bands off the hull loft itself.
  // A straight box along a body that tapers 15 cm from mid-door to tail ends
  // up floating in mid-air at both ends — the trim has to be a slice of the
  // real surface, lifted a couple of millimetres, or it reads as a sticker.
  const flank = hull.slice(3, 37);
  const sill = hull.slice(6, 34);
  for (const [jA, jB] of [[8, 9], [19, 20]]) {
    B.add(chrome, loftBand(flank, jA, jB, 0.017));
    B.add(seam, loftBand(flank, jA + 1, jB + 1, 0.007));
  }
  for (const [jA, jB] of [[2, 4], [24, 26]]) {
    B.add(chrome, loftBand(sill, jA, jB, 0.013));
  }

  // --- panel gaps ---------------------------------------------------------
  // bonnet trailing edge and boot line across the top, door cuts down the flanks
  B.add(seam, shutline(0.172, 9, 19, 0.02));
  B.add(seam, shutline(0.80, 9, 19, 0.02));
  for (const [u, w] of [[0.395, 0.017], [0.66, 0.017]]) {
    B.add(seam, shutline(u, 2, 12, w));
    B.add(seam, shutline(u, 16, 26, w));
  }
  // bonnet centre and boot centre creases
  B.add(seam, shutline(0.06, 12, 16, 0.02));

  // --- wheels ------------------------------------------------------------
  const tyreProfile = [];
  const tp = [[0.252, -0.145], [0.34, -0.145], [0.395, -0.122], [0.418, -0.052], [0.418, 0.052], [0.395, 0.122], [0.34, 0.145], [0.252, 0.145]];
  for (const [r, y] of tp) tyreProfile.push(new THREE.Vector2(r, y));
  const tyreGeo = new THREE.LatheGeometry(tyreProfile, 26);
  tyreGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 22);
  rimGeo.rotateX(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.014, 0.235, 0.045);
  const hubGeo = new THREE.SphereGeometry(0.078, 12, 8);
  const WY = 0.418;                                    // wheel centre height

  const axles = [[AXLE_F, 1], [AXLE_F, -1], [AXLE_R, 1], [AXLE_R, -1]];
  for (const [ax, side] of axles) {
    const z = 0.79 * side;
    // wheel well: an open half-cylinder liner plus a back wall, so the recess
    // is a real dark cavity and never shows daylight through the body
    const well = new THREE.CylinderGeometry(0.53, 0.53, 0.34, 18, 1, true, 0, Math.PI);
    well.rotateZ(Math.PI);
    B.place(trim, well, [ax, WY, z - 0.015 * side], [Math.PI / 2, 0, 0]);
    const back = new THREE.CircleGeometry(0.53, 18, 0, Math.PI);
    B.place(trim, back, [ax, WY, z - 0.185 * side], [0, side > 0 ? 0 : Math.PI, 0]);

    B.place(rubber, tyreGeo, [ax, WY, z]);
    B.place(trim, new THREE.CylinderGeometry(0.255, 0.255, 0.13, 22), [ax, WY, z + 0.03 * side], [Math.PI / 2, 0, 0]);
    B.place(chrome, rimGeo, [ax, WY, z + 0.05 * side]);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      B.place(chrome, spokeGeo, [ax, WY, z + 0.085 * side], [0, 0, a], [1, 1, 1]);
    }
    B.place(chrome, hubGeo, [ax, WY, z + 0.10 * side], [0, 0, 0], [0.7, 0.7, 0.45]);
  }

  // --- cabin interior -----------------------------------------------------
  // Visible through the glass, so it needs mass and silhouette, not detail.
  // Everything here lives inside the greenhouse span (x -1.82 .. +0.64) — put
  // the dashboard forward of the windscreen and the car reads as a roadster
  // with furniture sitting on the bonnet.
  // floor pan and rear bulkhead
  B.place(trim, new THREE.BoxGeometry(2.5, 0.05, 1.55), [-0.6, 0.58, 0]);
  B.place(trim, new THREE.BoxGeometry(0.1, 0.5, 1.55), [-1.9, 0.82, 0]);
  // dashboard: a wrapped shelf with a cowl over the binnacle
  B.place(trim, new THREE.BoxGeometry(0.4, 0.30, 1.58), [0.28, 0.88, 0], [0, 0, 0.16]);
  B.place(hide, new THREE.BoxGeometry(0.44, 0.06, 1.56), [0.26, 1.03, 0], [0, 0, 0.13]);
  B.place(trim, new THREE.BoxGeometry(0.26, 0.13, 0.48), [0.12, 1.01, 0.34], [0, 0, 0.28]);
  // centre console between the front seats
  B.place(hide, new THREE.BoxGeometry(1.2, 0.24, 0.28), [-0.45, 0.72, 0]);
  B.place(chrome, new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), [-0.14, 0.9, 0]);
  B.place(chrome, new THREE.SphereGeometry(0.036, 8, 6), [-0.14, 1.0, 0]);
  // steering wheel on a raked column
  B.place(trim, new THREE.CylinderGeometry(0.035, 0.045, 0.42, 8), [0.20, 0.93, 0.34], [0, 0, Math.PI / 2 - 0.42]);
  const wheelGeo = new THREE.TorusGeometry(0.17, 0.022, 8, 22);
  B.place(trim, wheelGeo, [-0.02, 1.02, 0.34], [0, Math.PI / 2 - 0.42, 0]);
  B.place(chrome, new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), [-0.02, 1.02, 0.34], [0, 0, Math.PI / 2 - 0.42]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    B.place(chrome, new THREE.BoxGeometry(0.013, 0.17, 0.03), [-0.02, 1.02, 0.34],
      [0, Math.PI / 2 - 0.42, a]);
  }
  // seats: squab, back, headrest — two front buckets and a rear bench
  const seat = (sx, sz, backH) => {
    B.place(hide, new THREE.BoxGeometry(0.56, 0.13, 0.52), [sx, 0.69, sz]);
    B.place(hide, new THREE.BoxGeometry(0.16, backH, 0.5), [sx - 0.28, 0.69 + backH * 0.46, sz], [0, 0, 0.2]);
    B.place(hide, new THREE.BoxGeometry(0.14, 0.2, 0.36), [sx - 0.42, 0.73 + backH, sz], [0, 0, 0.18]);
    // bolsters, so the seat is not a shoebox in silhouette
    for (const s of [-1, 1]) {
      B.place(hide, new THREE.BoxGeometry(0.5, 0.09, 0.08), [sx + 0.02, 0.745, sz + 0.23 * s]);
    }
  };
  seat(-0.4, 0.42, 0.5);
  seat(-0.4, -0.42, 0.5);
  B.place(hide, new THREE.BoxGeometry(0.5, 0.13, 1.42), [-1.24, 0.69, 0]);
  B.place(hide, new THREE.BoxGeometry(0.16, 0.5, 1.42), [-1.5, 0.93, 0], [0, 0, 0.16]);
  for (const s of [-1, 1]) {
    B.place(hide, new THREE.BoxGeometry(0.14, 0.17, 0.34), [-1.46, 1.18, 0.4 * s], [0, 0, 0.14]);
  }
  // rear parcel shelf under the backlight
  B.place(hide, new THREE.BoxGeometry(0.5, 0.04, 1.45), [-1.76, 0.99, 0], [0, 0, -0.06]);
  // door cards, so the cabin has sides
  for (const s of [-1, 1]) {
    B.place(hide, new THREE.BoxGeometry(2.3, 0.34, 0.05), [-0.6, 0.80, 0.86 * s]);
  }

  // --- front end ---------------------------------------------------------
  // bumper with real section: a chrome blade plus overriders
  const bumperGeo = new THREE.CylinderGeometry(0.062, 0.062, 1.72, 16);
  bumperGeo.rotateX(Math.PI / 2);
  B.place(chrome, bumperGeo, [2.66, 0.53, 0]);
  B.place(chrome, new THREE.BoxGeometry(0.09, 0.1, 1.72), [2.635, 0.575, 0]);
  B.place(chrome, bumperGeo, [-2.66, 0.545, 0]);
  B.place(chrome, new THREE.BoxGeometry(0.09, 0.1, 1.72), [-2.635, 0.59, 0]);
  for (const s of [-1, 1]) {
    B.place(chrome, new THREE.BoxGeometry(0.12, 0.26, 0.1), [2.63, 0.605, 0.44 * s]);
    B.place(chrome, new THREE.BoxGeometry(0.12, 0.24, 0.1), [-2.61, 0.625, 0.44 * s]);
  }
  // valance under the bumper, so there is no daylight beneath the nose
  B.place(trim, new THREE.BoxGeometry(0.12, 0.2, 1.6), [2.60, 0.425, 0]);
  B.place(trim, new THREE.BoxGeometry(0.12, 0.2, 1.6), [-2.60, 0.445, 0]);

  // grille: recessed dark box, chrome frame, vertical slats standing in it
  B.place(seam, new THREE.BoxGeometry(0.16, 0.34, 1.26), [2.55, 0.755, 0]);
  for (let i = -7; i <= 7; i++) {
    B.place(chrome, new THREE.BoxGeometry(0.07, 0.30, 0.026), [2.645, 0.755, i * 0.082]);
  }
  B.place(chrome, new THREE.BoxGeometry(0.1, 0.06, 1.3), [2.655, 0.92, 0]);
  B.place(chrome, new THREE.BoxGeometry(0.1, 0.06, 1.3), [2.655, 0.59, 0]);
  for (const s of [-1, 1]) {
    B.place(chrome, new THREE.BoxGeometry(0.1, 0.34, 0.05), [2.655, 0.755, 0.63 * s]);
  }

  // headlights: stacked twin round lamps sunk into chrome buckets
  const lights = [];
  for (const s of [-1, 1]) {
    for (const [dz, r] of [[0.50, 0.14], [0.775, 0.118]]) {
      // the bucket: an open cone running back into the wing, chrome inside
      const bucket = new THREE.CylinderGeometry(r + 0.012, r * 0.45, 0.21, 18, 1, true);
      bucket.rotateZ(Math.PI / 2);
      B.place(chrome, bucket, [2.50, 0.80, dz * s]);
      B.place(seam, new THREE.CircleGeometry(r * 0.45, 16), [2.393, 0.80, dz * s], [0, Math.PI / 2, 0]);
      const bez = new THREE.TorusGeometry(r + 0.024, 0.03, 8, 22);
      bez.rotateY(Math.PI / 2);
      B.place(chrome, bez, [2.617, 0.80, dz * s]);
      const lens = new THREE.SphereGeometry(r, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
      lens.rotateZ(-Math.PI / 2);
      B.place(lamp, lens, [2.585, 0.80, dz * s], [0, 0, 0], [0.5, 1, 1]);
    }
    const sl = new THREE.SpotLight(0xfff0d2, 6.5, 34, 0.44, 0.55, 1.4);
    sl.position.set(2.6 * SCALE, 0.80 * SCALE, 0.62 * SCALE * s);
    sl.target.position.set(11, -0.2, 1.8 * s);
    sl.castShadow = false;
    group.add(sl); group.add(sl.target);
    lights.push(sl);
  }

  // bonnet vents + ornament
  for (const s of [-1, 1]) {
    B.place(seam, new THREE.BoxGeometry(0.54, 0.03, 0.075), [1.85, 0.99, 0.36 * s]);
    B.place(chrome, new THREE.BoxGeometry(0.54, 0.022, 0.05), [1.85, 1.005, 0.36 * s]);
  }
  B.place(chrome, new THREE.ConeGeometry(0.045, 0.16, 8), [2.44, 1.02, 0], [0, 0, -Math.PI / 2 + 0.35]);

  // --- rear end ----------------------------------------------------------
  for (const s of [-1, 1]) {
    // recessed tail-light housing: a dark box cut into the tail with the lens
    // sitting 5 cm inside a chrome surround
    B.place(seam, new THREE.BoxGeometry(0.1, 0.16, 0.42), [-2.68, 0.855, 0.6 * s]);
    B.place(tail, new THREE.BoxGeometry(0.035, 0.115, 0.35), [-2.70, 0.855, 0.6 * s]);
    B.place(chrome, new THREE.BoxGeometry(0.05, 0.185, 0.46), [-2.725, 0.855, 0.6 * s]);
    B.place(seam, new THREE.BoxGeometry(0.055, 0.13, 0.38), [-2.735, 0.855, 0.6 * s]);
    B.place(tail, new THREE.BoxGeometry(0.02, 0.10, 0.33), [-2.745, 0.855, 0.6 * s]);
    const ex = new THREE.CylinderGeometry(0.05, 0.055, 0.18, 14);
    ex.rotateZ(Math.PI / 2);
    B.place(chrome, ex, [-2.77, 0.42, 0.44 * s]);
    B.place(seam, new THREE.CircleGeometry(0.042, 12), [-2.845, 0.42, 0.44 * s], [0, -Math.PI / 2, 0]);
  }
  B.place(seam, new THREE.BoxGeometry(0.06, 0.03, 0.5), [-2.72, 0.67, 0]);

  // --- side details ------------------------------------------------------
  for (const s of [-1, 1]) {
    // door handle: a chrome pull standing off a recessed dish
    B.place(seam, new THREE.BoxGeometry(0.3, 0.075, 0.02), [0.35, 0.855, 0.998 * s]);
    B.place(chrome, new THREE.BoxGeometry(0.25, 0.05, 0.055), [0.35, 0.855, 1.01 * s]);
    // mirror on a proper stalk
    B.place(chrome, new THREE.CylinderGeometry(0.022, 0.022, 0.19, 8), [1.26, 0.985, 0.96 * s], [Math.PI / 2 - 0.5, 0, 0]);
    B.place(paint, new THREE.SphereGeometry(0.085, 10, 8), [1.29, 1.065, 1.06 * s], [0, 0, 0], [1.1, 0.75, 0.6]);
    B.place(chrome, new THREE.CircleGeometry(0.06, 12), [1.29, 1.065, 1.10 * s], [0, 0, 0]);
  }

  B.build(car, { cast: true, receive: true, name: 'regalia' });

  // --- contact shadow -----------------------------------------------------
  const sh = new THREE.Mesh(
    new THREE.PlaneGeometry(7.6, 3.5),
    new THREE.MeshBasicMaterial({
      map: contactShadowTexture(), transparent: true, opacity: 0.85,
      depthWrite: false, color: 0x0d0c0f, toneMapped: false,
      blending: THREE.NormalBlending,
    })
  );
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.03;
  sh.renderOrder = -1;
  sh.name = 'regalia_contact';
  group.add(sh);

  return { group, lights, lamp, tail };
}

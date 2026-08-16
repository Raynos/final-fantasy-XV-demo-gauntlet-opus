import * as THREE from 'three';
import { PartBuilder, loft, loftBand, ring } from './PartBuilder.js';

/**
 * The Regalia — a procedurally lofted black luxury coupe.
 *
 * The hull and the greenhouse are two superelliptic lofts; chrome trim, the
 * roof shell and the pillars are extracted as bands off those same lofts so
 * every highlight follows the real body surface instead of floating over it.
 * Forward is +X, the car is 5.6 m long and sits on 0.80 m wheels.
 */

const N = 28;                      // ring resolution
const SEC = 34;                    // hull sections
const LEN = 2.8;                   // half length

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
const YB = [[0, 0.56], [0.08, 0.44], [0.16, 0.40], [0.84, 0.40], [0.93, 0.45], [1, 0.58]];
const YT = [[0, 0.90], [0.06, 0.97], [0.18, 0.955], [0.45, 0.95], [0.62, 0.965], [0.74, 0.97], [0.88, 0.94], [0.96, 0.90], [1, 0.82]];

const GH0 = 0.175, GH1 = 0.615;    // greenhouse span in u
const GHW = [[0, 0.50], [0.16, 0.80], [0.35, 0.855], [0.62, 0.855], [0.82, 0.79], [1, 0.52]];
const GRF = [[0, 1.02], [0.14, 1.42], [0.26, 1.565], [0.58, 1.57], [0.78, 1.40], [1, 1.04]];

function hullSections() {
  const s = [];
  for (let i = 0; i < SEC; i++) {
    const u = i / (SEC - 1);
    const x = -LEN + u * LEN * 2;
    s.push({ x, u, pts: ring(N, curve(u, HW), curve(u, YB), curve(u, YT), 3.7) });
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
    s.push({ x, t, pts: ring(N, curve(t, GHW), 0.88, curve(t, GRF), 3.4) });
  }
  return s;
}

/**
 * @param {object} opts
 * @returns {{group:THREE.Group, lights:THREE.Object3D[],
 *            lamp:THREE.Material, tail:THREE.Material}}
 */
export function buildRegalia({ envMap = null } = {}) {
  const group = new THREE.Group();
  group.name = 'regalia';

  const paint = new THREE.MeshPhysicalMaterial({
    color: 0x0a0b0e, metalness: 0.0, roughness: 0.3,
    clearcoat: 1.0, clearcoatRoughness: 0.06, envMapIntensity: 0.5,
  });
  paint.name = 'paint';
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xa8adb5, metalness: 1.0, roughness: 0.2, envMapIntensity: 0.75,
  });
  chrome.name = 'chrome';
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x161d25, metalness: 0.0, roughness: 0.09,
    clearcoat: 1.0, clearcoatRoughness: 0.03, envMapIntensity: 0.9,
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
  const trim = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.65, metalness: 0.2 });
  trim.name = 'trim';

  if (envMap) for (const m of [paint, chrome, glass, lamp, trim]) m.envMap = envMap;

  const B = new PartBuilder();
  const hull = hullSections();
  const gh = greenhouseSections();

  // --- hull + greenhouse ------------------------------------------------
  B.add(paint, loft(hull, { caps: true }));
  B.add(glass, loft(gh, { caps: false }));

  // roof shell over the greenhouse (columns around the top of the ring)
  B.add(paint, loftBand(gh, N * 0.5 - 5, N * 0.5 + 5, 0.012));
  // solid rear quarter panel; the rest of the greenhouse stays glass
  B.add(paint, loftBand(gh.slice(0, 3), 2, N - 2, 0.013));
  // chrome window surround, one column wide, following the beltline
  B.add(chrome, loftBand(gh, -1, 0, 0.015));
  // chrome spear: a slim strip along the flank, not a slab
  for (const sz of [-1, 1]) {
    B.place(chrome, new THREE.BoxGeometry(4.5, 0.035, 0.028), [-0.1, 0.78, 0.955 * sz]);
    B.place(chrome, new THREE.BoxGeometry(4.5, 0.018, 0.02), [-0.1, 0.71, 0.958 * sz]);
  }

  // --- wheels ------------------------------------------------------------
  const tyreProfile = [];
  const tp = [[0.255, -0.135], [0.34, -0.135], [0.395, -0.115], [0.418, -0.05], [0.418, 0.05], [0.395, 0.115], [0.34, 0.135], [0.255, 0.135]];
  for (const [r, y] of tp) tyreProfile.push(new THREE.Vector2(r, y));
  const tyreGeo = new THREE.LatheGeometry(tyreProfile, 24);
  tyreGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.09, 20);
  rimGeo.rotateX(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.013, 0.235, 0.04);
  const hubGeo = new THREE.SphereGeometry(0.075, 12, 8);

  const axles = [[1.72, 1], [1.72, -1], [-1.78, 1], [-1.78, -1]];
  for (const [ax, side] of axles) {
    const z = 0.815 * side;
    B.place(rubber, tyreGeo, [ax, 0.415, z]);
    B.place(trim, new THREE.CylinderGeometry(0.258, 0.258, 0.12, 20), [ax, 0.415, z + 0.03 * side], [Math.PI / 2, 0, 0]);
    B.place(chrome, rimGeo, [ax, 0.415, z + 0.045 * side]);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      B.place(chrome, spokeGeo, [ax, 0.415, z + 0.08 * side], [0, 0, a], [1, 1, 1]);
    }
    B.place(chrome, hubGeo, [ax, 0.415, z + 0.09 * side], [0, 0, 0], [0.7, 0.7, 0.45]);
    // arch eyebrow
    const arch = new THREE.TorusGeometry(0.50, 0.036, 8, 22, Math.PI * 1.05);
    B.place(paint, arch, [ax, 0.415, z + 0.055 * side], [0, 0, -0.02]);
    // dark wheel-well liner so we never see daylight through the body
    const well = new THREE.CylinderGeometry(0.5, 0.5, 0.34, 16, 1, true, 0, Math.PI);
    well.rotateZ(Math.PI);
    B.place(trim, well, [ax, 0.415, z - 0.02 * side], [Math.PI / 2, 0, 0]);
  }

  // --- front end ---------------------------------------------------------
  const bumperGeo = new THREE.CylinderGeometry(0.055, 0.055, 1.66, 14);
  bumperGeo.rotateX(Math.PI / 2);
  B.place(chrome, bumperGeo, [2.66, 0.585, 0]);
  B.place(chrome, bumperGeo, [-2.66, 0.60, 0]);
  for (const s of [-1, 1]) {
    B.place(chrome, new THREE.BoxGeometry(0.1, 0.24, 0.09), [2.62, 0.66, 0.44 * s]);
    B.place(chrome, new THREE.BoxGeometry(0.1, 0.22, 0.09), [-2.6, 0.68, 0.44 * s]);
  }

  // grille: chrome frame + vertical slats
  B.place(trim, new THREE.BoxGeometry(0.12, 0.30, 1.34), [2.62, 0.80, 0]);
  for (let i = -8; i <= 8; i++) {
    B.place(chrome, new THREE.BoxGeometry(0.06, 0.28, 0.025), [2.665, 0.80, i * 0.078]);
  }
  B.place(chrome, new THREE.BoxGeometry(0.09, 0.055, 1.42), [2.655, 0.955, 0]);
  B.place(chrome, new THREE.BoxGeometry(0.09, 0.055, 1.42), [2.655, 0.645, 0]);

  // headlights: stacked twin round lamps in chrome bezels
  const lights = [];
  for (const s of [-1, 1]) {
    for (const [dz, r] of [[0.50, 0.135], [0.755, 0.115]]) {
      const bez = new THREE.TorusGeometry(r + 0.022, 0.028, 8, 20);
      bez.rotateY(Math.PI / 2);
      B.place(chrome, bez, [2.635, 0.845, dz * s]);
      const lens = new THREE.SphereGeometry(r, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
      lens.rotateZ(-Math.PI / 2);
      B.place(lamp, lens, [2.60, 0.845, dz * s], [0, 0, 0], [0.55, 1, 1]);
    }
    const sl = new THREE.SpotLight(0xfff0d2, 6.5, 34, 0.44, 0.55, 1.4);
    sl.position.set(2.6, 0.85, 0.62 * s);
    sl.target.position.set(11, -0.2, 1.8 * s);
    sl.castShadow = false;
    group.add(sl); group.add(sl.target);
    lights.push(sl);
  }

  // bonnet vents + ornament
  for (const s of [-1, 1]) {
    B.place(chrome, new THREE.BoxGeometry(0.5, 0.02, 0.05), [1.85, 1.035, 0.36 * s]);
  }
  B.place(chrome, new THREE.ConeGeometry(0.045, 0.16, 8), [2.44, 1.06, 0], [0, 0, -Math.PI / 2 + 0.35]);

  // --- rear end ----------------------------------------------------------
  for (const s of [-1, 1]) {
    B.place(tail, new THREE.BoxGeometry(0.06, 0.11, 0.34), [-2.735, 0.9, 0.6 * s]);
    B.place(chrome, new THREE.BoxGeometry(0.045, 0.15, 0.4), [-2.715, 0.9, 0.6 * s]);
    const ex = new THREE.CylinderGeometry(0.042, 0.046, 0.16, 12);
    ex.rotateZ(Math.PI / 2);
    B.place(chrome, ex, [-2.76, 0.46, 0.44 * s]);
  }
  B.place(chrome, new THREE.BoxGeometry(0.05, 0.035, 0.8), [-2.715, 1.0, 0]);

  // --- side details ------------------------------------------------------
  for (const s of [-1, 1]) {
    // door handle
    B.place(chrome, new THREE.BoxGeometry(0.24, 0.045, 0.05), [0.35, 0.90, 0.945 * s]);
    // mirror
    B.place(chrome, new THREE.CylinderGeometry(0.02, 0.02, 0.17, 8), [1.28, 1.02, 0.94 * s], [Math.PI / 2 - 0.5, 0, 0]);
    B.place(paint, new THREE.SphereGeometry(0.075, 10, 8), [1.30, 1.09, 1.02 * s], [0, 0, 0], [1.1, 0.75, 0.6]);
    // rocker sill
    B.place(chrome, new THREE.BoxGeometry(2.9, 0.05, 0.06), [0, 0.415, 0.90 * s]);
  }

  B.build(group, { cast: true, receive: true, name: 'regalia' });
  return { group, lights, lamp, tail };
}

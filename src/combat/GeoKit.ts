import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Small procedural geometry kit shared by weapons and creatures.
 *
 * Everything here returns plain BufferGeometry in a canonical orientation
 * (+Y is "along"), carrying `position`, `normal`, `uv` plus optional
 * `color` and `aEmissive` vertex attributes so a whole creature or weapon can
 * be merged into a *single* draw call and still have per-part albedo and
 * glowing details.
 */

/**
 * Loft a closed 2D cross-section along a list of sections.
 * @param cross unit cross-section, CCW, roughly radius 1
 * @param opts {capStart, capEnd, uScale}
 */
export function loft(cross: Array<[number,number]>, sections: Array<{y:number,sx:number,sz:number,dx?:number,dz?:number,rot?:number}>, { capStart = true, capEnd = true }: any = {}) {
  const n = cross.length, m = sections.length;
  const pos = [], uv = [], idx = [];
  for (let s = 0; s < m; s++) {
    const sec = sections[s];
    const rot = sec.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      let x = cross[i][0] * sec.sx, z = cross[i][1] * (sec.sz !== undefined ? sec.sz : sec.sx);
      if (rot) { const nx = x * cs - z * sn; z = x * sn + z * cs; x = nx; }
      pos.push(x + (sec.dx || 0), sec.y, z + (sec.dz || 0));
      uv.push(i / n, s / (m - 1));
    }
  }
  for (let s = 0; s < m - 1; s++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = s * n + i, b = s * n + j, c = (s + 1) * n + i, d = (s + 1) * n + j;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (capStart) {
    const sec = sections[0];
    const centre = pos.length / 3;
    pos.push(sec.dx || 0, sec.y, sec.dz || 0); uv.push(0.5, 0);
    for (let i = 0; i < n; i++) idx.push(centre, (i + 1) % n, i);
  }
  if (capEnd) {
    const sec = sections[m - 1];
    const base = (m - 1) * n;
    const centre = pos.length / 3;
    pos.push(sec.dx || 0, sec.y, sec.dz || 0); uv.push(0.5, 1);
    for (let i = 0; i < n; i++) idx.push(centre, base + i, base + (i + 1) % n);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Circle cross-section with `n` points. */
export function circleCross(n = 10) {
  const c = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    c.push([Math.cos(a), Math.sin(a)]);
  }
  return c;
}

/** Lens / blade cross-section: sharp on ±X, thick in the middle. */
export function bladeCross(n = 10) {
  const c = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a), z = Math.sin(a);
    // thickness collapses toward the ±X extremes, giving a real cutting edge
    c.push([x, z * (1 - Math.pow(Math.abs(x), 0.55) * 0.96)]);
  }
  return c;
}

/** Rounded rectangle cross-section — armour plates, greatsword blades. */
export function rectCross(round = 0.22, n = 16) {
  const c = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const p = 2 / Math.max(0.06, round * 2);
    const k = Math.pow(Math.pow(Math.abs(ca), p) + Math.pow(Math.abs(sa), p), -1 / p);
    c.push([ca * k, sa * k]);
  }
  return c;
}

/** Generalised tube through a polyline with per-point radii. */
export function tube(points, radii, { radialSeg = 8, capStart = true, capEnd = true, flat = 1 } = {}) {
  const n = radialSeg, m = points.length;
  const pos = [], uv = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  const tan = new THREE.Vector3(), nrm = new THREE.Vector3(), bin = new THREE.Vector3();
  let prevN = null;
  for (let s = 0; s < m; s++) {
    const p0 = points[Math.max(0, s - 1)], p1 = points[Math.min(m - 1, s + 1)];
    tan.subVectors(p1, p0);
    if (tan.lengthSq() < 1e-9) tan.set(0, 1, 0);
    tan.normalize();
    const ref = prevN || (Math.abs(tan.y) > 0.94 ? new THREE.Vector3(1, 0, 0) : up);
    bin.crossVectors(tan, ref);
    if (bin.lengthSq() < 1e-9) bin.set(1, 0, 0);
    bin.normalize();
    nrm.crossVectors(bin, tan).normalize();
    prevN = nrm.clone();
    const r = radii[s];
    const rx = Array.isArray(r) ? r[0] : r;
    const rz = Array.isArray(r) ? r[1] : r * flat;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const cx = Math.cos(a) * rx, cz = Math.sin(a) * rz;
      pos.push(
        points[s].x + bin.x * cx + nrm.x * cz,
        points[s].y + bin.y * cx + nrm.y * cz,
        points[s].z + bin.z * cx + nrm.z * cz
      );
      uv.push(i / n, s / (m - 1));
    }
  }
  for (let s = 0; s < m - 1; s++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = s * n + i, b = s * n + j, c = (s + 1) * n + i, d = (s + 1) * n + j;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (capStart) {
    const centre = pos.length / 3;
    pos.push(points[0].x, points[0].y, points[0].z); uv.push(0.5, 0);
    for (let i = 0; i < n; i++) idx.push(centre, (i + 1) % n, i);
  }
  if (capEnd) {
    const base = (m - 1) * n, last = points[m - 1];
    const centre = pos.length / 3;
    pos.push(last.x, last.y, last.z); uv.push(0.5, 1);
    for (let i = 0; i < n; i++) idx.push(centre, base + i, base + (i + 1) % n);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Convenience: a straight tube between two points. */
export function limb(a, b, r0, r1, seg = 6, radialSeg = 8) {
  const pts = [], radii = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    pts.push(new THREE.Vector3().lerpVectors(a, b, t));
    radii.push(THREE.MathUtils.lerp(r0, r1, t));
  }
  return tube(pts, radii, { radialSeg });
}

/** Bevelled slab — armour plates, blade guards, magitek panels. */
export function slab(w, h, d, bevel = 0.02) {
  const b = Math.min(bevel, Math.min(w, h, d) * 0.45);
  const shape = new THREE.Shape();
  const hw = w / 2 - b, hh = h / 2 - b;
  shape.moveTo(-hw, -h / 2);
  shape.lineTo(hw, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -hh);
  shape.lineTo(w / 2, hh);
  shape.quadraticCurveTo(w / 2, h / 2, hw, h / 2);
  shape.lineTo(-hw, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, hh);
  shape.lineTo(-w / 2, -hh);
  shape.quadraticCurveTo(-w / 2, -h / 2, -hw, -h / 2);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, d - b * 2), bevelEnabled: true,
    bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 2,
  });
  g.translate(0, 0, -(d - b * 2) / 2);
  g.computeVertexNormals();
  return g;
}

/** Cone / spike along +Y. */
export function spike(r, h, seg = 8) {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  g.translate(0, h / 2, 0);
  return g;
}

/** Ellipsoid. */
export function blob(rx, ry, rz, wSeg = 12, hSeg = 8) {
  const g = new THREE.SphereGeometry(1, wSeg, hSeg);
  g.scale(rx, ry, rz);
  return g;
}

/** Apply a TRS to a geometry in place. */
export function place(geo, { pos, rot, quat, scale } = {}) {
  const m = new THREE.Matrix4();
  const q = quat || new THREE.Quaternion();
  if (!quat && rot) q.setFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0, 'XYZ'));
  const s = scale === undefined ? new THREE.Vector3(1, 1, 1)
    : (typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3().fromArray(scale));
  m.compose(pos ? new THREE.Vector3().fromArray(pos) : new THREE.Vector3(), q, s);
  geo.applyMatrix4(m);
  return geo;
}

/** Stamp a flat vertex colour (albedo tint) onto a geometry. */
export function tint(geo, hex, jitter = 0) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const p = geo.attributes.position;
  for (let i = 0; i < n; i++) {
    let j = 0;
    if (jitter) {
      const h = Math.sin(p.getX(i) * 91.7 + p.getY(i) * 47.3 + p.getZ(i) * 23.1) * 43758.5453;
      j = (h - Math.floor(h) - 0.5) * jitter;
    }
    arr[i * 3] = Math.max(0, c.r + j);
    arr[i * 3 + 1] = Math.max(0, c.g + j);
    arr[i * 3 + 2] = Math.max(0, c.b + j);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Stamp per-vertex emissive (glowing eyes, magitek seams, crystal fuller). */
export function glow(geo, hex, strength = 1) {
  const c = new THREE.Color(hex).multiplyScalar(strength);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('aEmissive', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * Stamp per-vertex surface response: `(roughness, metalness)`.
 *
 * One merged weapon or creature is a single draw call sharing one material,
 * which means one metalness for the steel, the leather wrap, the wooden haft
 * and the polymer grip alike — and a *dielectric* rendered at metalness 1 is a
 * dark mirror, not leather. A shader that reads this attribute (see
 * `makeWeaponMaterial`) gets real material variety out of the same program.
 *
 * @param rough roughness to use where `metal` is 0
 * @param metal 0 dielectric .. 1 metal
 */
export function surf(geo: THREE.BufferGeometry, rough: number, metal: number) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { arr[i * 2] = rough; arr[i * 2 + 1] = metal; }
  geo.setAttribute('aSurf', new THREE.BufferAttribute(arr, 2));
  return geo;
}

/** Merge, filling in any missing color / aEmissive / aSurf attributes. */
export function merge(geos) {
  const list = geos.filter(Boolean);
  // only carry aSurf when somebody in the batch actually asked for it, so
  // every creature in the game does not grow an attribute its shader ignores
  const wantSurf = list.some((g) => g.attributes.aSurf);
  for (const g of list) {
    if (!g.attributes.color) tint(g, 0xffffff);
    if (!g.attributes.aEmissive) glow(g, 0x000000);
    if (wantSurf && !g.attributes.aSurf) surf(g, 0.5, 1);
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    if (!g.index) {
      const n = g.attributes.position.count;
      g.setIndex(Array.from({ length: n }, (_, i) => i));
    }
    // drop attributes that would block the merge
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color', 'aEmissive', 'aSurf', 'skinIndex', 'skinWeight'].includes(k)) {
        g.deleteAttribute(k);
      }
    }
    if (!g.attributes.normal) g.computeVertexNormals();
  }
  const m = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  return m;
}

/**
 * Patch a MeshStandardMaterial so it reads a per-vertex `aEmissive`
 * attribute. Lets one material serve an entire creature — glowing eyes,
 * magitek seams and dull armour in a single draw call.
 */
export function enableVertexEmissive(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aEmissive;\nvarying vec3 vEmissive;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmissive = aEmissive;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEmissive;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmissive;');
  };
  material.customProgramCacheKey = () => 'vertexEmissive';
  return material;
}

/**
 * Cross-section of a blade that has actually been ground on a wheel.
 *
 * `bladeCross` is a lens and `rectCross` is a rounded bar; neither has a
 * cutting edge, and a polished lens under a sky env-map is a mirror — every
 * point on the face returns nearly the same slice of sky, so the blade renders
 * as one flat coloured plane. A real section has four distinct plane families
 * meeting at hard lines: a narrow secondary bevel at the edge, a long primary
 * grind, the ridge, and the fuller floor. Four different angles return four
 * different pieces of the environment, and the ridge and fuller shoulders draw
 * the hard specular lines that read as steel.
 *
 * Authored in unit space: x = ±1 at the width extremes, z = ±1 at full
 * thickness. `loft` scales x by `sx` (half-width) and z by `sz`
 * (half-thickness), so a 58 mm × 12 mm blade is `sx 0.029, sz 0.006`.
 *
 * @param {object} [o]
 * @returns closed unit cross-section
 */
export function edgedCross({
  edge = 0.06, bevel = 0.10, bevelRise = 0.40, ridge = 0.34,
  fuller = 0, fullerAt = 0, fullerW = 0.20, spine = 0,
}: { edge?: number, bevel?: number, bevelRise?: number, ridge?: number, fuller?: number, fullerAt?: number, fullerW?: number, spine?: number } = {}): Array<[number,number]> {
  const top = [[1, edge], [1 - bevel, bevelRise], [ridge, 1]];
  if (fuller > 0.001) {
    const a = fullerAt + fullerW, b = fullerAt - fullerW;
    if (a < ridge - 0.02) {
      top.push([a, 0.96], [fullerAt, 1 - fuller], [b, 0.96]);
    }
  }
  if (spine > 0.001) {
    // single-edged: the far side is a squared spine, not a second edge
    top.push([-0.86, Math.max(spine, 0.9)], [-1, spine]);
  } else {
    top.push([-ridge, 1], [-(1 - bevel), bevelRise], [-1, edge]);
  }
  const c = top.slice();
  const from = spine > 0.001 ? top.length - 1 : top.length - 2;
  for (let i = from; i >= 1; i--) c.push([top[i][0], -top[i][1]]);
  return c;
}

/**
 * Rectangle with real chamfered corners — receivers, engine blocks, langets,
 * anything machined. `rectCross`'s superellipse rounds every corner off and
 * cannot hold a hard 45° cut, which is the whole read of a milled part.
 * @param [c] chamfer size as a fraction of the half-extent
 */
export function chamferCross(c: number = 0.22): Array<[number,number]> {
  const k = 1 - Math.min(0.48, c);
  return [[1, -k], [1, k], [k, 1], [-k, 1], [-1, k], [-1, -k], [-k, -1], [k, -1]];
}

/**
 * Lobed cross-section for a leather- or cord-wrapped grip. Loft it with a
 * per-section `rot` that advances up the grip and the lobes screw into a
 * helical ridge — a real wrap for the price of one loft, and the ridges catch
 * the rim light that tells you a hand belongs there.
 * @param [n] points around
 * @param [lobes] ridges around the circumference
 * @param [depth] groove depth as a fraction of the radius
 */
export function wrapCross(n: number = 14, lobes: number = 4, depth: number = 0.13): Array<[number,number]> {
  const c = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 - depth * (0.5 - 0.5 * Math.cos(a * lobes));
    c.push([Math.cos(a) * k, Math.sin(a) * k]);
  }
  return c;
}

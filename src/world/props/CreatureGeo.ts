import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * A tiny sculpting kit for *instanced* animals.
 *
 * The enemy bestiary builds its creatures out of `characters/rig/Sculpt.js`,
 * which is a real rig: skinned, thousands of triangles, one draw call each.
 * Ambient wildlife cannot pay for that — a Leide herd is eighty animals in one
 * instanced call, and the whole herd has to fit in the triangle budget of a
 * single hero character.
 *
 * So this is the cheap half of the same idea. Everything is a swept tube: a
 * Catmull-Rom spine, an elliptical section that can be reshaped per-angle, and
 * domed caps. That single primitive builds a barrel ribcage, a tapering neck,
 * a jointed leg and a hooking tusk, and because the section is continuous the
 * silhouette is a curve rather than a stack of spheres — which is the entire
 * difference between an animal and a bread roll at a hundred metres.
 *
 * Two extra per-vertex channels ride along:
 *   `color`  flat-ish albedo, so one material shades coat, belly and horn
 *   `arig`   vec2(region, weight) — the poor man's skin binding read by the
 *            vertex shader in {@link HerdAnim} to swing a leg or drop a head
 *            without ever touching the CPU.
 */

const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = new THREE.Vector3();
const _r = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * Sweep an elliptical section along a spine.
 *
 * @param {object} o
 */
export function tube({
  nodes, steps = 14, seg = 10, ref = [0, 1, 0], shape = null,
  colorAt, region = 0, blendAt = null, capStart = 0, capEnd = 0,
}: { nodes: Array<{p:number[], r:number, rz?:number}>, steps?: number, seg?: number, ref?: number[], shape?: (th:number,u:number)=>number, colorAt: (th:number,u:number,p:THREE.Vector3)=>THREE.Color, region?: number, blendAt?: (p:THREE.Vector3,u:number)=>number, capStart?: number, capEnd?: number }): THREE.BufferGeometry {
  // Catmull-Rom needs three points to have a shape; a two-node segment gets a
  // midpoint so short parts (an eye, a lock of hair) do not degenerate.
  if (nodes.length < 3) {
    const a = nodes[0], b = nodes[nodes.length - 1];
    nodes = [a, {
      p: [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2, (a.p[2] + b.p[2]) / 2],
      r: (a.r + b.r) / 2,
      rz: ((a.rz === undefined ? a.r : a.rz) + (b.rz === undefined ? b.r : b.rz)) / 2,
    }, b];
  }
  const pts = nodes.map((k) => new THREE.Vector3(k.p[0], k.p[1], k.p[2]));
  const spine = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const rad = new THREE.CatmullRomCurve3(
    nodes.map((k) => new THREE.Vector3(k.r, k.rz === undefined ? k.r : k.rz, 0)),
    false, 'centripetal', 0.5);
  const up = new THREE.Vector3(ref[0], ref[1], ref[2]).normalize();

  const pos = [], col = [], rig = [], idx = [];
  const secs: Array<{c:THREE.Vector3,n:THREE.Vector3,b:THREE.Vector3,rx:number,ry:number,u:number}> = [];

  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const c = spine.getPoint(u);
    spine.getTangent(u, _t).normalize();
    _n.copy(up).addScaledVector(_t, -up.dot(_t));
    if (_n.lengthSq() < 1e-8) _n.set(_t.z, _t.x, _t.y).addScaledVector(_t, -_t.dot(_n));
    _n.normalize();
    _b.crossVectors(_t, _n).normalize();
    rad.getPoint(u, _r);
    secs.push({ c, n: _n.clone(), b: _b.clone(), t: _t.clone(), rx: _r.x, ry: _r.y, u });
  }

  const emitRing = (c, n, b, rx, ry, u, scale) => {
    const base = pos.length / 3;
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const m = (shape ? shape(th, u) : 1) * scale;
      const ca = Math.cos(th), sa = Math.sin(th);
      _p.copy(c).addScaledVector(n, ca * ry * m).addScaledVector(b, sa * rx * m);
      pos.push(_p.x, _p.y, _p.z);
      const cc = colorAt(th, u, _p);
      col.push(cc.r, cc.g, cc.b);
      rig.push(region, blendAt ? blendAt(_p, u) : 1);
    }
    return base;
  };

  const rows = [];
  // leading dome
  if (capStart > 0) {
    const s = secs[0], K = 2;
    for (let k = K; k >= 1; k--) {
      const a = (k / (K + 1)) * Math.PI * 0.5;
      const c = s.c.clone().addScaledVector(s.t, -Math.sin(a) * capStart * s.rx);
      rows.push(emitRing(c, s.n, s.b, s.rx, s.ry, s.u, Math.cos(a)));
    }
  }
  for (const s of secs) rows.push(emitRing(s.c, s.n, s.b, s.rx, s.ry, s.u, 1));
  if (capEnd > 0) {
    const s = secs[secs.length - 1], K = 2;
    for (let k = 1; k <= K; k++) {
      const a = (k / (K + 1)) * Math.PI * 0.5;
      const c = s.c.clone().addScaledVector(s.t, Math.sin(a) * capEnd * s.rx);
      rows.push(emitRing(c, s.n, s.b, s.rx, s.ry, s.u, Math.cos(a)));
    }
  }

  // Winding matters: the section's binormal is `tangent x normal`, which makes
  // the naive (ring i, ring i+1, next angle) order face *inward*. A closed
  // inward-wound mesh is not invisible — you see the inside of its far wall,
  // with the right silhouette and completely wrong shading — which is a much
  // more expensive bug to find than a missing model.
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b2 = rows[i + 1];
    for (let j = 0; j < seg; j++) {
      idx.push(a + j, a + j + 1, b2 + j, a + j + 1, b2 + j + 1, b2 + j);
    }
  }

  // apexes
  const apex = (s, dir, cap) => {
    const c = s.c.clone().addScaledVector(s.t, dir * cap * s.rx);
    const base = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    const cc = colorAt(0, s.u, c);
    col.push(cc.r, cc.g, cc.b);
    rig.push(region, blendAt ? blendAt(c, s.u) : 1);
    return base;
  };
  if (capStart > 0) {
    const a = apex(secs[0], -1, capStart), row = rows[0];
    for (let j = 0; j < seg; j++) idx.push(a, row + j, row + j + 1);
  }
  if (capEnd > 0) {
    const s = secs[secs.length - 1];
    const a = apex(s, 1, capEnd), row = rows[rows.length - 1];
    for (let j = 0; j < seg; j++) idx.push(a, row + j + 1, row + j);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('arig', new THREE.Float32BufferAttribute(rig, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Merge sculpted parts into one instanceable buffer.
 */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere();
  for (const p of parts) p.dispose();
  return g;
}

/** Scratch colour for `colorAt` callbacks — never retained. */
export function col(hex) { return _c.setHex(hex, THREE.SRGBColorSpace); }

/**
 * Blend two sRGB hexes and return the scratch colour.
 * @param a @param b @param k
 */
export function mix(a: number, b: number, k: number) {
  const t = THREE.MathUtils.clamp(k, 0, 1);
  const ar = ((a >> 16) & 255) / 255, ag = ((a >> 8) & 255) / 255, ab = (a & 255) / 255;
  const br = ((b >> 16) & 255) / 255, bg = ((b >> 8) & 255) / 255, bb = (b & 255) / 255;
  const s = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return _c.setRGB(
    s(ar + (br - ar) * t), s(ag + (bg - ag) * t), s(ab + (bb - ab) * t),
    THREE.LinearSRGBColorSpace);
}

/**
 * Wrap a material so its vertices are posed by a GLSL rig function.
 *
 * `rigGlsl` must declare `void creatureRig(out mat3 R, out vec3 P, out mat3 RB,
 * out vec3 PB, out vec3 OFF)`, which returns a limb rotation about pivot `P`,
 * a whole-body rotation about pivot `PB`, and a translation. Every vertex is
 * posed as `PB + RB * ((P + R*(p - P)) - PB) + OFF`, which is enough for a
 * head on a neck, a leg on a hip and a body that leans, at the cost of two
 * mat3s in the vertex shader and nothing at all on the CPU.
 *
 * The rig is evaluated twice — once for the normal, once for the position —
 * rather than shared between the chunks, because three's depth shader hides
 * `<beginnormal_vertex>` inside `#ifdef USE_DISPLACEMENTMAP`. Declaring the
 * transform there and using it in `<begin_vertex>` links on the lit material
 * and silently fails to link on the shadow one.
 *
 * @param timeRef shared `uTime` uniform
 * @param [opts] `tint` scales `vColor` by the
 *   per-instance `aanim.w`; `key` must be unique per rig so three does not
 *   share a compiled program between two different creatures.
 */
export function rigMaterial(mat: THREE.Material, timeRef: {value:number}, rigGlsl: string, { tint = false, key = 'rig' }: {tint?:boolean, key?:string} = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeRef;
    let v = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${rigGlsl}`)
      .replace('#include <beginnormal_vertex>', `
  vec3 objectNormal = vec3(normal);
  {
    mat3 nR, nRB; vec3 nP, nPB, nOFF;
    creatureRig(nR, nP, nRB, nPB, nOFF);
    objectNormal = nRB * (nR * objectNormal);
  }`)
      .replace('#include <begin_vertex>', `
  mat3 rigR, rigRB; vec3 rigP, rigPB, rigOFF;
  creatureRig(rigR, rigP, rigRB, rigPB, rigOFF);
  vec3 rigQ = rigP + rigR * (position - rigP);
  vec3 transformed = rigPB + rigRB * (rigQ - rigPB) + rigOFF;`);
    if (tint) {
      v = v.replace('#include <color_vertex>',
        '#include <color_vertex>\n  vColor.rgb *= mix(0.74, 1.20, aanim.w);');
    }
    shader.vertexShader = v;
  };
  mat.customProgramCacheKey = () => `${key}${tint ? '_lit' : ''}`;
  return mat;
}

/** Shared GLSL preamble for every {@link rigMaterial}: attributes and rotations. */
export const RIG_PREAMBLE = /* glsl */`
attribute vec2 arig;
attribute vec4 aanim;
uniform float uTime;
mat3 hrX(float a){ float c = cos(a), s = sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 hrY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 hrZ(float a){ float c = cos(a), s = sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }
`;

/** Smoothstep, matching the GLSL one so CPU and shader agree. */
export function smooth(e0, e1, x) {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

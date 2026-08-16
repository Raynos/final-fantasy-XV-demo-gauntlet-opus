import * as THREE from 'three';
import { merge, enableVertexEmissive } from '../../combat/GeoKit.js';

/**
 * Rigid-bind skinning helper.
 *
 * Creatures are authored as a pile of independent geometry pieces in bind
 * pose. Each piece is bound to one bone (or blended across two, so joints
 * bend instead of shearing), then everything is merged into a single
 * SkinnedMesh — so a fully articulated enemy costs exactly **one draw call**
 * while still animating limb by limb.
 */
export class Rig {
  constructor() {
    this.bones = [];
    this.byName = new Map();
    this.parts = [];
    this._world = new Map();
  }

  /**
   * Declare a bone at a world-space position in bind pose.
   * @param {string} name
   * @param {string|null} parent
   * @param {number[]} worldPos
   */
  bone(name, parent, worldPos) {
    const b = new THREE.Bone();
    b.name = name;
    const wp = new THREE.Vector3().fromArray(worldPos);
    if (parent) {
      const p = this.byName.get(parent);
      if (!p) throw new Error(`unknown parent bone ${parent}`);
      b.position.copy(wp).sub(this._world.get(parent));
      p.add(b);
    } else {
      b.position.copy(wp);
    }
    this._world.set(name, wp);
    this.byName.set(name, b);
    this.bones.push(b);
    return b;
  }

  /** World-space bind position of a bone. */
  at(name) { return this._world.get(name); }

  /** Bind an entire geometry rigidly to one bone. */
  attach(geo, boneName) {
    const i = this.bones.indexOf(this.byName.get(boneName));
    if (i < 0) throw new Error(`unknown bone ${boneName}`);
    const n = geo.attributes.position.count;
    const idx = new Uint16Array(n * 4);
    const w = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) { idx[v * 4] = i; w[v * 4] = 1; }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
    this.parts.push(geo);
    return geo;
  }

  /**
   * Bind a geometry across two bones, blending by projection onto the axis
   * from `a`'s bind position to `b`'s — the cheap way to get a joint that
   * creases rather than collapsing.
   * @param {number} soft 0..1 width of the blend band around the joint
   */
  attachBlend(geo, aName, bName, soft = 1.0) {
    const ia = this.bones.indexOf(this.byName.get(aName));
    const ib = this.bones.indexOf(this.byName.get(bName));
    const pa = this._world.get(aName), pb = this._world.get(bName);
    const axis = new THREE.Vector3().subVectors(pb, pa);
    const len = Math.max(1e-4, axis.length());
    axis.multiplyScalar(1 / len);
    const pos = geo.attributes.position;
    const n = pos.count;
    const idx = new Uint16Array(n * 4);
    const w = new Float32Array(n * 4);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).sub(pa);
      const t = THREE.MathUtils.clamp(v.dot(axis) / len, 0, 1);
      // smoothstep across a band centred on the joint midpoint
      const s = THREE.MathUtils.clamp((t - (0.5 - soft * 0.5)) / Math.max(1e-3, soft), 0, 1);
      const k = s * s * (3 - 2 * s);
      idx[i * 4] = ia; idx[i * 4 + 1] = ib;
      w[i * 4] = 1 - k; w[i * 4 + 1] = k;
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
    this.parts.push(geo);
    return geo;
  }

  /**
   * Merge everything and produce the SkinnedMesh.
   * @param {THREE.Material} material
   * @returns {{group:THREE.Group, mesh:THREE.SkinnedMesh, bones:Map<string,THREE.Bone>}}
   */
  build(material, { castShadow = true, radius = 4 } = {}) {
    const geo = merge(this.parts);
    const group = new THREE.Group();
    const rootBone = this.bones[0];
    group.add(rootBone);
    const mesh = new THREE.SkinnedMesh(geo, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    group.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(this.bones);
    mesh.bind(skeleton);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, radius * 0.4, 0), radius);
    geo.boundingBox = new THREE.Box3(
      new THREE.Vector3(-radius, -radius * 0.2, -radius),
      new THREE.Vector3(radius, radius, radius)
    );
    this.mesh = mesh;
    this.group = group;
    // cache the bind-pose local rotations so pose code can work in offsets
    this.rest = new Map();
    for (const b of this.bones) this.rest.set(b.name, b.quaternion.clone());
    return { group, mesh, bones: this.byName };
  }
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

/** Set a bone's local rotation as an offset from its bind pose. */
export function poseBone(rig, name, x, y, z, order = 'XYZ') {
  const b = rig.byName.get(name);
  if (!b) return;
  _e.set(x, y, z, order);
  _q.setFromEuler(_e);
  b.quaternion.copy(rig.rest.get(name)).multiply(_q);
}

/** Blend a bone toward a target rotation (used for flinch/death overrides). */
export function poseBoneMix(rig, name, x, y, z, k, order = 'XYZ') {
  const b = rig.byName.get(name);
  if (!b) return;
  _e.set(x, y, z, order);
  _q.setFromEuler(_e).premultiply(rig.rest.get(name));
  b.quaternion.slerp(_q, k);
}

/**
 * Shared creature material: vertex-colour albedo, per-vertex emissive for
 * glowing details, and a procedural detail normal so silhouettes are not the
 * only thing carrying the read.
 */
export function creatureMaterial({
  roughness = 0.72, metalness = 0.05, normalMap = null, normalScale = 0.7,
  roughnessMap = null, envMapIntensity = 1.0,
} = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness, metalness,
    normalMap, roughnessMap, envMapIntensity,
  });
  if (normalMap) m.normalScale = new THREE.Vector2(normalScale, normalScale);
  return enableVertexEmissive(m);
}

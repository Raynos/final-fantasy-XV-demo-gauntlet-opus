import * as THREE from 'three';
import { mergeCreature } from '../rig/Sculpt.ts';

/**
 * How one authored piece attaches to the skeleton: rigidly to a single bone,
 * or blended smoothly along a chain of them. A tuple rather than an object
 * because the species files write hundreds of these inline, one per sculpt.
 */
export type Bind = ['bone', string] | ['chain', string[]];

/** One authored piece of a creature, waiting to be bound and merged. */
export interface Part {
  geo: THREE.BufferGeometry;
  bind: Bind;
}

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
  bones!: THREE.Bone[];
  /** Bind-pose world position of every bone, by name. */
  _world!: Map<string, THREE.Vector3>;
  byName!: Map<string, THREE.Bone>;
  group!: THREE.Group;
  mesh!: THREE.SkinnedMesh;
  /** The unmerged pieces, in the order they were attached. */
  parts!: THREE.BufferGeometry[];
  /** Bind-pose local rotations, so pose code can work in offsets. */
  rest!: Map<string, THREE.Quaternion>;
  constructor() {
    this.bones = [];
    this.byName = new Map();
    this.parts = [];
    this._world = new Map();
  }

  /**
   * Declare a bone at a world-space position in bind pose.
   */
  bone(name: string, parent: string | null, worldPos: number[]): THREE.Bone {
    const b = new THREE.Bone();
    b.name = name;
    const wp = new THREE.Vector3().fromArray(worldPos);
    if (parent) {
      const p = this.byName.get(parent);
      const pw = this._world.get(parent);
      if (!p || !pw) throw new Error(`unknown parent bone ${parent}`);
      b.position.copy(wp).sub(pw);
      p.add(b);
    } else {
      b.position.copy(wp);
    }
    this._world.set(name, wp);
    this.byName.set(name, b);
    this.bones.push(b);
    return b;
  }

  /** Index of a bone in the skeleton's flat array, or -1. */
  _index(name: string): number {
    const b = this.byName.get(name);
    return b ? this.bones.indexOf(b) : -1;
  }

  /** World-space bind position of a bone. */
  at(name: string) { return this._world.get(name); }

  /** Bind an entire geometry rigidly to one bone. */
  attach(geo: THREE.BufferGeometry, boneName: string) {
    const bone = this.byName.get(boneName);
    const i = bone ? this.bones.indexOf(bone) : -1;
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
   * @param soft 0..1 width of the blend band around the joint
   */
  attachBlend(geo: THREE.BufferGeometry, aName: string, bName: string, soft: number = 1.0) {
    const ia = this._index(aName), ib = this._index(bName);
    const pa = this._world.get(aName), pb = this._world.get(bName);
    if (!pa || !pb) throw new Error(`unknown bone ${aName}/${bName}`);
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
   * Bind a geometry smoothly along a whole chain of bones.
   *
   * `attachBlend` only creases one joint; a real limb is shoulder → elbow →
   * wrist → paw, and binding each segment to a single bone is exactly what
   * makes a leg read as a stack of cylinders. Here every vertex is projected
   * onto the polyline through the chain's bind positions and blended between
   * the two bones it falls between, so one continuous swept limb bends at
   * every joint at once.
   * @param names bone chain, root first
   * @param soft 0..1 blend width around each joint
   */
  attachChain(geo: THREE.BufferGeometry, names: string[], soft: number = 1.0) {
    const idxs = names.map((n) => this._index(n));
    if (idxs.some((i) => i < 0)) throw new Error(`unknown bone in chain ${names.join(',')}`);
    const pts = names.map((n) => {
      const p = this._world.get(n);
      if (!p) throw new Error(`unknown bone in chain ${names.join(',')}`);
      return p;
    });
    const pos = geo.attributes.position;
    const n = pos.count;
    const idx = new Uint16Array(n * 4);
    const w = new Float32Array(n * 4);
    const v = new THREE.Vector3(), seg = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i);
      // parametric position along the chain: segment index + fraction
      let best = 0, bestD = Infinity;
      for (let s = 0; s < pts.length - 1; s++) {
        seg.subVectors(pts[s + 1], pts[s]);
        const len2 = Math.max(1e-8, seg.lengthSq());
        let t = (v.x - pts[s].x) * seg.x + (v.y - pts[s].y) * seg.y + (v.z - pts[s].z) * seg.z;
        t = THREE.MathUtils.clamp(t / len2, 0, 1);
        const dx = v.x - (pts[s].x + seg.x * t);
        const dy = v.y - (pts[s].y + seg.y * t);
        const dz = v.z - (pts[s].z + seg.z * t);
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) { bestD = d; best = s + t; }
      }
      const s0 = Math.min(names.length - 2, Math.floor(best));
      const f = THREE.MathUtils.clamp((best - s0 - (0.5 - soft * 0.5)) / Math.max(1e-3, soft), 0, 1);
      const k = f * f * (3 - 2 * f);
      idx[i * 4] = idxs[s0]; idx[i * 4 + 1] = idxs[s0 + 1];
      w[i * 4] = 1 - k; w[i * 4 + 1] = k;
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
    this.parts.push(geo);
    return geo;
  }

  /**
   * Merge everything and produce the SkinnedMesh.
   */
  build(material: THREE.Material, { castShadow = true, radius = 4, uvTiles = DETAIL_TILES, coat = null }: {
    castShadow?: boolean,
    /** Bounding-sphere radius for culling; the bind pose is smaller than the posed mesh. */
    radius?: number,
    /** detail-map tiles per metre; `false` leaves the authored UVs alone. */
    uvTiles?: number | false,
    /** Hide weathering, applied per part before the merge. See `weatherCoat`. */
    coat?: CoatOpts | null,
  } = {}): {group:THREE.Group, mesh:THREE.SkinnedMesh, bones:Map<string,THREE.Bone>} {
    if (coat) for (const g of this.parts) weatherCoat(g, coat);
    if (uvTiles) for (const g of this.parts) detailUV(g, uvTiles);
    const geo = mergeCreature(this.parts, (material.userData && material.userData.defMat) || [0.8, 0]);
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

/**
 * Detail-map tiles per metre of surface. One tile of the shared hide/plate
 * normal covers 10 cm of creature at this density.
 *
 * Raised from 7 after an A/B on the sabertusk at 2.5 m and 8 m. At 7 the
 * pebbling on a haunch read as reptile scale rather than short fur, and the
 * coat had gone from the frame entirely by 8 m; at 10 the strands in
 * `organicNormal()` land at about the width they should and the dorsal saddle
 * still carries texture at distance. No shimmer at either range — the maps are
 * mipped with `anisotropy: 8` and TAA is on — but this is the knob to check
 * first if aliasing ever shows up on a moving creature.
 */
export const DETAIL_TILES = 10;

/**
 * Rescale a part's UVs so its detail map tiles at a fixed density *in metres*,
 * rather than once across the whole part.
 *
 * This is the single largest thing wrong with the bestiary's surfaces. Every
 * primitive `Sculpt` emits — every sweep, every lofted blob, every slab —
 * lays UV 0..1 across the entire part, and no species passes a scale. So one
 * tile of hide covered a whole Bloodhorn flank while the same tile covered a
 * 0.4 m hoof: the torso read as cottage cheese and the legs came out
 * dead-smooth, in the same animal, from the same map. Texel density has to be
 * a property of the surface, not of how the modeller happened to split it up.
 *
 * The metres-per-UV-unit is read off the geometry itself, per axis, the same
 * way a tangent basis is derived — accumulate `dP/du` and `dP/dv` over the
 * triangles, area-weighted — so it is correct for a swept limb whose u runs
 * around the girth and v along the length, without anyone declaring which is
 * which. The result is rounded to a whole number of tiles because u usually
 * closes a loop around a limb, and a fractional count puts a visible seam down
 * the side of every leg.
 *
 */
export function detailUV(geo: THREE.BufferGeometry, tilesPerMetre: number) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  if (!pos || !uv) return geo;
  const index = geo.index ? geo.index.array : null;
  const tri = index ? index.length / 3 : pos.count / 3;
  const p0 = _v0, p1 = _v1, p2 = _v2;
  let mU = 0, mV = 0, wsum = 0;
  for (let t = 0; t < tri; t++) {
    const a = index ? index[t * 3] : t * 3;
    const b = index ? index[t * 3 + 1] : t * 3 + 1;
    const c = index ? index[t * 3 + 2] : t * 3 + 2;
    p0.fromBufferAttribute(pos, a);
    p1.fromBufferAttribute(pos, b).sub(p0);
    p2.fromBufferAttribute(pos, c).sub(p0);
    const u1 = uv.getX(b) - uv.getX(a), v1 = uv.getY(b) - uv.getY(a);
    const u2 = uv.getX(c) - uv.getX(a), v2 = uv.getY(c) - uv.getY(a);
    const det = u1 * v2 - u2 * v1;
    if (!det || !isFinite(det)) continue;
    const r = 1 / det;
    // dP/du and dP/dv for this triangle, in metres per UV unit
    const tx = (p1.x * v2 - p2.x * v1) * r, ty = (p1.y * v2 - p2.y * v1) * r, tz = (p1.z * v2 - p2.z * v1) * r;
    const bx = (p2.x * u1 - p1.x * u2) * r, by = (p2.y * u1 - p1.y * u2) * r, bz = (p2.z * u1 - p1.z * u2) * r;
    const w = Math.abs(det);
    mU += Math.hypot(tx, ty, tz) * w;
    mV += Math.hypot(bx, by, bz) * w;
    wsum += w;
  }
  if (!wsum) return geo;
  const su = Math.max(1, Math.round((mU / wsum) * tilesPerMetre));
  const sv = Math.max(1, Math.round((mV / wsum) * tilesPerMetre));
  const arr = uv.array;
  for (let i = 0; i < arr.length; i += 2) { arr[i] *= su; arr[i + 1] *= sv; }
  uv.needsUpdate = true;
  return geo;
}

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

/**
 * What the pose helpers need: the bones, and the bind rotations their offsets
 * are measured from. Both the builder-side `Rig` and the per-instance
 * `EnemyRig` a clone carries satisfy it, which is the point — a pose function
 * is written once and runs against either.
 */
export interface PosableRig {
  byName: Map<string, THREE.Bone>;
  rest: Map<string, THREE.Quaternion>;
}

/**
 * Writes one bone's rotation as an offset from bind. `y` and `z` are optional
 * because `poseBone` defaults them to zero — a pose that only opens a jaw
 * writes `S('jaw', k)`. Assignable to `CreatureAnim`'s `PoseWriter`, which is
 * what the leg solver takes.
 */
export type BoneWriter = (name: string, x: number, y?: number, z?: number) => void;

/**
 * Set a bone's local rotation as an offset from its bind pose.
 *
 * `y` and `z` default to zero, and that default is load-bearing rather than a
 * convenience. Seventeen call sites across the five quadrupeds open the jaw
 * with a single angle — `S('jaw', 0.5 * k)` — and until these defaults existed
 * that arrived here as `undefined`. `Euler.set` stores it, `Quaternion
 * .setFromEuler` runs `cos(undefined / 2)`, and the whole quaternion comes out
 * `NaN`; a bone with a `NaN` matrix skins its vertices to `NaN` and the GPU
 * discards every triangle bound to it. **Every quadruped's lower jaw was
 * therefore invisible in every pose** — silently, because nothing else on the
 * animal is bound to that bone. See `project/handoff/no-any.md`.
 */
export function poseBone(rig: PosableRig, name: string, x: number, y = 0, z = 0, order: THREE.EulerOrder = 'XYZ') {
  const b = rig.byName.get(name), rest = rig.rest.get(name);
  if (!b || !rest) return;
  _e.set(x, y, z, order);
  _q.setFromEuler(_e);
  b.quaternion.copy(rest).multiply(_q);
}

/** Blend a bone toward a target rotation (used for flinch/death overrides). */
export function poseBoneMix(rig: PosableRig, name: string, x: number, y: number, z: number, k: number, order: THREE.EulerOrder = 'XYZ') {
  const b = rig.byName.get(name), rest = rig.rest.get(name);
  if (!b || !rest) return;
  _e.set(x, y, z, order);
  _q.setFromEuler(_e).premultiply(rest);
  b.quaternion.slerp(_q, k);
}

/**
 * Shared creature material: vertex-colour albedo, per-vertex emissive for
 * glowing details, **per-vertex roughness and metalness**, and a procedural
 * detail normal so silhouettes are not the only thing carrying the read.
 *
 * The per-vertex material channel is the important one. A creature is one
 * draw call, so without it every surface on the body answers the light
 * identically — wet nose, dry hide, keratin horn and painted steel all at the
 * same gloss, which is the single loudest tell that something was assembled
 * from primitives. `roughness`/`metalness` here are only the *defaults* filled
 * in for parts that did not author an `aMat` attribute themselves.
 */
export function creatureMaterial({
  roughness = 0.72, metalness = 0.05, normalMap = null, normalScale = 0.7,
  roughnessMap = null, envMapIntensity = 1.0, rim = null,
}: {
  roughness?: number,
  metalness?: number,
  normalMap?: THREE.Texture | null,
  normalScale?: number,
  roughnessMap?: THREE.Texture | null,
  envMapIntensity?: number,
  /** Fresnel rim light, for the daemons that need to read against a night sky. */
  rim?: { color: number, strength: number } | null,
} = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 1, metalness: 1,
    normalMap, roughnessMap, envMapIntensity,
  });
  if (normalMap) m.normalScale = new THREE.Vector2(normalScale, normalScale);
  m.userData.defMat = [roughness, metalness];
  if (rim) m.userData.rim = rim;
  return enableVertexMaterial(m);
}

/**
 * Patch a MeshStandardMaterial to read `aEmissive` (vec3) and `aMat`
 * (vec2 roughness/metalness) vertex attributes. The base material carries
 * roughness = metalness = 1 so the attribute multiplies cleanly through any
 * roughness map that is also bound.
 *
 * `material.userData.rim` additionally adds a view-dependent emissive rim.
 * That exists for the daemons, and it is a *readability* tool, not a stylistic
 * one: it is a fixed radiance, so under the sun it is far below the diffuse
 * term and invisible, while at 23:00 it is the only thing separating a
 * near-black silhouette from the ground behind it. `{ color, power, strength }`.
 */
export function enableVertexMaterial(material: THREE.Material) {
  const rim = (material.userData && material.userData.rim) || null;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        '#include <common>\nattribute vec3 aEmissive;\nattribute vec2 aMat;\nvarying vec3 vEmissive;\nvarying vec2 vMatP;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvEmissive = aEmissive;\nvMatP = aMat;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        '#include <common>\nvarying vec3 vEmissive;\nvarying vec2 vMatP;')
      .replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = clamp( roughnessFactor * vMatP.x, 0.035, 1.0 );')
      .replace('#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor = clamp( metalnessFactor * vMatP.y, 0.0, 1.0 );')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmissive;');
    if (!rim) return;
    // `<emissivemap_fragment>` runs after `<normal_fragment_maps>`, so `normal`
    // is the final shading normal here; `vViewPosition` is the fragment-to-eye
    // vector meshphysical declares unconditionally.
    shader.uniforms.uRimCol = { value: new THREE.Color().setHex(rim.color ?? 0x6d7ea6, THREE.SRGBColorSpace) };
    shader.uniforms.uRimPow = { value: rim.power ?? 2.6 };
    shader.uniforms.uRimStr = { value: rim.strength ?? 0.06 };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        '#include <common>\nuniform vec3 uRimCol;\nuniform float uRimPow;\nuniform float uRimStr;')
      .replace('totalEmissiveRadiance += vEmissive;',
        'totalEmissiveRadiance += vEmissive;\n{ float rf = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );'
        + '\n  totalEmissiveRadiance += uRimCol * ( pow( rf, uRimPow ) * uRimStr ); }');
  };
  // Two variants, two keys. Sharing one key hands the rim program to every
  // creature in the roster, or the plain one to every daemon, depending on
  // which compiled first.
  material.customProgramCacheKey = () => (rim ? 'creatureVertexMatRim' : 'creatureVertexMat');
  return material;
}

const _ca = new THREE.Color();
const _cb = new THREE.Color();
const _du = new THREE.Color();

/**
 * Write `v` into `out` whether it arrives as a hex literal or a `THREE.Color`.
 * @param out @param v
 */
function asColor(out: THREE.Color, v: number | THREE.Color) {
  if (v && (v as THREE.Color).isColor) return out.copy(v as THREE.Color);
  return out.setHex(v as number, THREE.SRGBColorSpace);
}

/**
 * Coat variation over the vertex colours a part has already authored.
 *
 * The organic half of the bestiary paints one flat value per body region —
 * flank, saddle, belly — and nothing at all inside a region, so from ten
 * metres every beast is two or three poster-paint patches. Real hide is never
 * one number: it is mottled at body scale, the guard hairs over the topline
 * are bleached at the tips, the underside sits in its own bounce shadow, and
 * anything that walks in Leide carries dust up its legs.
 *
 * The counterpart to `EnemyBase.weatherPlate` for hide, and like that one it
 * *modulates* rather than replaces, so the value structure a species author
 * built survives. Applied over `Rig.parts` from `Rig.build({ coat })`, which
 * is the one place every species already funnels through and where the
 * geometry is still in bind-pose world space — so `dustTop` can be given in
 * metres off the ground and mean it.
 *
 * @param geo must carry a `color` attribute
 * @param {object} [o]
 * 
 */
/** Hide weathering knobs. All of them modulate what the species author built. */
export interface CoatOpts {
  /** Body-scale blotching. */
  mottle?: number;
  /** Bleached guard-hair tips over the topline. */
  tick?: number;
  /** Tip colour; null keeps the part's own, lightened. */
  light?: number | null;
  /** Underside bounce shadow. */
  shade?: number;
  dark?: number;
  /** Dust carried up the legs. */
  dust?: number;
  /** How far up the dust reaches, metres off the ground. */
  dustTop?: number;
  dustColor?: number;
}

export function weatherCoat(geo: THREE.BufferGeometry, {
  mottle = 0.12, tick = 0.14, light = null, shade = 0.16, dark = 0x120e09,
  dust = 0, dustTop = 0.55, dustColor = 0x8d7c5e,
}: CoatOpts = {}) {
  const pos = geo.attributes.position, cl = geo.attributes.color, nr = geo.attributes.normal;
  if (!pos || !cl) return geo;
  // `Color.setHex` runs `Math.floor` on its argument, so handing it a
  // `THREE.Color` yields NaN and the surface renders black with no error
  // anywhere. That bug hid in the sabertusk's head for its entire existence.
  // Every colour-ish option here therefore goes through `asColor`.
  if (light != null) asColor(_ca, light);
  asColor(_cb, dark);
  asColor(_du, dustColor);
  for (let i = 0; i < cl.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const up = nr ? nr.getY(i) : 0;
    let r = cl.getX(i), g = cl.getY(i), b = cl.getZ(i);

    // body-scale mottle: three incommensurate frequencies so it does not
    // resolve into stripes the way a single sine does
    const m = Math.sin(x * 3.1 + y * 1.7) * 0.5
      + Math.sin(z * 2.3 - y * 2.9) * 0.32
      + Math.sin(x * 7.7 + z * 6.1) * 0.18;
    const k = 1 + m * mottle;
    r *= k; g *= k; b *= k;

    // Sun-bleached guard hairs along the topline.
    //
    // This reads as a *gradient down the back*, never as stripes. A vertex
    // colour cannot carry a pattern finer than the vertex spacing, and the
    // first version of this banded at a 12 cm wavelength: on the garula's
    // shoulder — where the sculpt's quads are a good 20 cm across — it aliased
    // into half-metre diagonal ochre smears that looked like claw marks. Keep
    // every frequency here above ~0.5 m and let `organicNormal` carry the
    // actual hair, which is what a normal map is for.
    if (tick > 0) {
      const u = Math.max(0, up);
      const brk = 0.72 + 0.28 * Math.sin(x * 9.3 + z * 7.1 + y * 4.7);
      const t = u * u * brk * tick;
      if (light != null) { r += (_ca.r - r) * t; g += (_ca.g - g) * t; b += (_ca.b - b) * t; }
      else { const lift = 1 + t * 1.2; r *= lift; g *= lift; b *= lift; }
    }

    // the underside sits in its own bounce shadow
    if (shade > 0) {
      const t = Math.max(0, -up) * shade;
      r += (_cb.r - r) * t; g += (_cb.g - g) * t; b += (_cb.b - b) * t;
    }

    // dust carried up the legs and belly, ragged at its upper edge
    if (dust > 0 && y < dustTop * 1.6) {
      const edge = 1 - Math.min(1, Math.max(0, y / Math.max(1e-3, dustTop)));
      const ragged = 0.75 + 0.25 * Math.sin(x * 17 + z * 13);
      const t = edge * edge * ragged * dust;
      r += (_du.r - r) * t; g += (_du.g - g) * t; b += (_du.b - b) * t;
    }
    cl.setXYZ(i, r, g, b);
  }
  return geo;
}

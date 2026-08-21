import * as THREE from 'three';
import { buildSkeleton } from '../rig/Skeleton.ts';
import { buildBody } from '../rig/Body.ts';
import { buildHead, buildEyes } from '../rig/Face.ts';
import { buildHair } from '../rig/Hair.ts';
import { buildOutfit } from '../rig/Outfit.ts';
import { Animator } from '../rig/Anim.ts';
import {
  skinMaterial, faceMaterial, garmentMaterial, hairMaterial, eyeMaterial, contactShadowMaterial,
} from '../rig/Materials.ts';
import { Rng } from '../../util/Rng.ts';

/**
 * Townsfolk, built from the party's own character rig but pooled.
 *
 * `Character` (used by the four leads) builds fresh geometry and a fresh 1024²
 * face texture per instance, which is the right call for a hero and the wrong
 * one for a crowd. An **archetype** here builds that work exactly once and then
 * hands out instances: each instance gets its own `Skeleton` and its own
 * `Animator`, but shares the body, head, hair, outfit and eye geometry, and
 * shares the face and eye materials. Three ambient civilians therefore cost one
 * face texture between them, not three.
 *
 * The named cast (Cindy, Cid, Takka, Dave) each get a private archetype, so
 * they are as individual as any party member — they just do not pay for the
 * hero's hair density.
 *
 * Per instance: five skinned draws plus a contact shadow, LODed down to three
 * at distance and culled entirely past ~110 m.
 */

let SHARED = null;
function shared() {
  if (!SHARED) {
    SHARED = {
      skin: skinMaterial(),
      garment: garmentMaterial(),
      hair: hairMaterial(),
      shadow: contactShadowMaterial(),
      shadowGeo: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    };
    SHARED.skin.side = THREE.FrontSide;
    SHARED.garment.side = THREE.DoubleSide;
    for (const m of [SHARED.skin, SHARED.garment, SHARED.hair]) m.shadowSide = THREE.BackSide;
    SHARED.skin.name = 'npc_skin';
    SHARED.garment.name = 'npc_garment';
    SHARED.hair.name = 'npc_hair';
  }
  return SHARED;
}

const ARCH = new Map();

/**
 * Build (or fetch) the shared geometry and materials for one look.
 * @param {string} key
 * @param {object} def `{ profile, look }`
 */
export function archetype(key, def) {
  if (ARCH.has(key)) return ARCH.get(key);
  const S = shared();
  const rig = buildSkeleton(def.profile);
  const look = def.look;
  const head = buildHead(rig, look);
  const a = {
    key,
    def,
    profile: def.profile,
    look,
    dims: rig.dims,
    geo: {
      body: buildBody(rig, look),
      head: head.geometry,
      hair: buildHair(rig, look),
      outfit: buildOutfit(rig, look),
      eyes: buildEyes(rig, look).geometry,
    },
    mat: {
      skin: S.skin,
      garment: S.garment,
      hair: S.hair,
      face: (() => { const m = faceMaterial(head.map); m.side = THREE.DoubleSide; m.shadowSide = THREE.BackSide; m.name = `npc_face_${key}`; return m; })(),
      eye: (() => { const m = eyeMaterial(look.iris ?? 0x3f6f9c); m.name = `npc_eye_${key}`; return m; })(),
    },
  };
  ARCH.set(key, a);
  return a;
}

/**
 * One townsperson. Duck-types the surface `Animator` expects of a `Character`
 * (`root`, `rig`, `look`, `eyes`, `seedRnd`) without dragging in the hero's
 * per-instance build cost.
 */
export class NpcBody {
  /**
   * @param {object} arch result of {@link archetype}
   * @param {number} seed per-instance seed — drives blink timing, stance and
   *   idle phase so two copies of the same archetype never move in lockstep
   */
  constructor(arch, seed = 1) {
    const S = shared();
    this.arch = arch;
    this.name = arch.key;
    this.look = arch.look;
    this.seedRnd = new Rng(seed);
    this.root = new THREE.Group();
    this.root.name = `npc_${arch.key}`;
    this.meshes = [];

    const rig = buildSkeleton(arch.profile);
    this.rig = rig;
    this.root.add(rig.root);

    this.body = this._skinned(arch.geo.body, arch.mat.skin, 'body');
    this.head = this._skinned(arch.geo.head, arch.mat.face, 'head');
    this.hair = this._skinned(arch.geo.hair, arch.mat.hair, 'hair');
    this.outfit = this._skinned(arch.geo.outfit, arch.mat.garment, 'outfit');

    const pivot = new THREE.Object3D();
    pivot.position.set(0, rig.dims.eyeY, rig.dims.eyeZ).sub(rig.P.head);
    rig.byName.head.add(pivot);
    this.eyeMesh = new THREE.Mesh(arch.geo.eyes, arch.mat.eye);
    this.eyeMesh.castShadow = false;
    this.eyeMesh.frustumCulled = false;
    pivot.add(this.eyeMesh);
    this.eyes = pivot;

    const blob = new THREE.Mesh(S.shadowGeo, S.shadow);
    blob.scale.setScalar(0.98 * rig.dims.s);
    blob.position.set(0, 0.035 * rig.dims.s, -0.01 * rig.dims.s);
    blob.renderOrder = -2;
    blob.frustumCulled = false;
    this.root.add(blob);
    this.groundShadow = blob;

    this.anim = new Animator(this);
    this.height = rig.dims.height;
  }

  _skinned(geo, mat, name) {
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.name = `npc_${this.arch.key}_${name}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.root.add(mesh);
    mesh.bind(this.rig.skeleton, new THREE.Matrix4());
    this.meshes.push(mesh);
    return mesh;
  }

  /** @param {THREE.Vector3|null} v */
  setLookTarget(v) { this.anim.setLookTarget(v); }

  /** @param {number} dt @param {object} state see Animator.update */
  update(dt, state) { this.anim.update(dt, state); }

  /**
   * Two-step LOD.
   * @param {number} level 0 = full, 1 = no eyes / no contact shadow / no
   *   sun-shadow casting, 2 = hidden
   */
  setLod(level) {
    if (this._lod === level) return;
    this._lod = level;
    const vis = level < 2;
    for (const m of this.meshes) { m.visible = vis; m.castShadow = level === 0; }
    this.eyeMesh.visible = level === 0;
    this.groundShadow.visible = level === 0;
  }
}

/** Drop the archetype cache (only used by hot reload). */
export function resetArchetypes() { ARCH.clear(); }

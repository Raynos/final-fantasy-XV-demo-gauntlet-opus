import * as THREE from 'three';
import { buildSkeleton } from '../rig/Skeleton.ts';
import { buildBody } from '../rig/Body.ts';
import { buildHead, buildEyes } from '../rig/Face.ts';
import { buildHair } from '../rig/Hair.ts';
import { buildOutfit } from '../rig/Outfit.ts';
import { Animator } from '../rig/Anim.ts';
import { bootPhase } from '../../engine/BootProfile.ts';
import {
  skinMaterial, faceMaterial, garmentMaterial, hairMaterial, eyeMaterial, contactShadowMaterial,
} from '../rig/Materials.ts';
import { Rng } from '../../util/Rng.ts';
import type { AnimState, AnimTarget } from '../rig/Anim.ts';
import type { CharacterDef, Look } from '../rig/Look.ts';
import type { Rig, RigDims } from '../rig/Skeleton.ts';

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

/**
 * Materials and geometry every townsperson shares one copy of. The party's
 * `Character` keeps its own private copy of this — the two crowds are lit the
 * same way but are separate material instances, so an NPC-only tweak (the
 * front-side skin below) cannot reach the heroes.
 */
interface SharedNpcAssets {
  skin: THREE.Material;
  garment: THREE.Material;
  hair: THREE.Material;
  shadow: THREE.Material;
  shadowGeo: THREE.BufferGeometry;
}

let SHARED: SharedNpcAssets | null = null;
function shared(): SharedNpcAssets {
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

/**
 * One look, built once and handed out.
 *
 * Geometry and the face/eye materials are per *archetype*; the skin, garment,
 * hair and shadow materials come from `shared()` and are per *scene*. An
 * instance (`NpcBody`) adds only its own skeleton and animator on top.
 */
export interface NpcArchetype {
  key: string;
  def: CharacterDef;
  profile: CharacterDef['profile'];
  look: Look;
  dims: RigDims;
  geo: {
    body: THREE.BufferGeometry;
    head: THREE.BufferGeometry;
    hair: THREE.BufferGeometry;
    outfit: THREE.BufferGeometry;
    eyes: THREE.BufferGeometry;
    /** half the interpupillary distance — where each globe's own pivot goes. */
    eyeCx: number;
  };
  mat: {
    skin: THREE.Material;
    garment: THREE.Material;
    hair: THREE.Material;
    /** private to this archetype: it owns the baked face texture. */
    face: THREE.Material;
    eye: THREE.Material;
  };
}

const ARCH = new Map<string, NpcArchetype>();

/**
 * Build (or fetch) the shared geometry and materials for one look.
 * @param def `{ profile, look }`
 */
export function archetype(key: string, def: CharacterDef): NpcArchetype {
  const cached = ARCH.get(key);
  if (cached) return cached;
  const S = shared();
  const rig = buildSkeleton(def.profile);
  const look = def.look;
  // Every cast member is one archetype and one painted 1024^2 face; the boot
  // profile needs the split, because the two halves have very different fixes.
  const head = bootPhase('Npcs.head', () => buildHead(rig, look, `face/npc/${key}`));
  const a: NpcArchetype = {
    key,
    def,
    profile: def.profile,
    look,
    dims: rig.dims,
    geo: bootPhase('Npcs.geo', () => {
      const eyes = buildEyes(rig, look);
      return {
        body: buildBody(rig, look),
        head: head.geometry,
        hair: buildHair(rig, look),
        outfit: buildOutfit(rig, look),
        eyes: eyes.geometry,
        eyeCx: eyes.cx,
      };
    }),
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
export class NpcBody implements AnimTarget {
  _lod!: number;
  anim!: Animator;
  arch!: NpcArchetype;
  body!: THREE.SkinnedMesh;
  eyeMeshes!: THREE.Mesh[];
  /** the gaze carrier at the midpoint; the globes ride their own pivots. */
  eyes!: THREE.Object3D;
  eyeGlobes!: THREE.Object3D[];
  groundShadow!: THREE.Mesh;
  hair!: THREE.SkinnedMesh;
  head!: THREE.SkinnedMesh;
  /** standing height in metres, from the rig — the prompt anchor rides on it. */
  height!: number;
  look!: Look;
  meshes!: THREE.SkinnedMesh[];
  /** the archetype key, which is what `Animator` resolves a posture from. */
  name!: string;
  outfit!: THREE.SkinnedMesh;
  rig!: Rig;
  root!: THREE.Group;
  seedRnd!: Rng;
  /**
   * @param arch result of {@link archetype}
   * @param seed per-instance seed — drives blink timing, stance and
   *   idle phase so two copies of the same archetype never move in lockstep
   */
  constructor(arch: NpcArchetype, seed: number = 1) {
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

    // One pivot per globe at its own centre; `eyes` is the gaze carrier at the
    // midpoint and holds no geometry. See `buildEyes` for why.
    const pivot = new THREE.Object3D();
    pivot.position.set(0, rig.dims.eyeY, rig.dims.eyeZ).sub(rig.P.head);
    rig.byName.head.add(pivot);
    this.eyes = pivot;
    this.eyeMeshes = [];
    this.eyeGlobes = [];
    for (const sg of [1, -1]) {
      const gp = new THREE.Object3D();
      gp.position.copy(pivot.position);
      gp.position.x += sg * arch.geo.eyeCx;
      rig.byName.head.add(gp);
      const em = new THREE.Mesh(arch.geo.eyes, arch.mat.eye);
      em.castShadow = false;
      em.frustumCulled = false;
      gp.add(em);
      this.eyeMeshes.push(em);
      this.eyeGlobes.push(gp);
    }

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

  _skinned(geo: THREE.BufferGeometry, mat: THREE.Material, name: string): THREE.SkinnedMesh {
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

  setLookTarget(v: THREE.Vector3 | null) { this.anim.setLookTarget(v); }

  /** @param dt @param state see Animator.update */
  update(dt: number, state: AnimState) { this.anim.update(dt, state); }

  /**
   * Two-step LOD.
   * @param level 0 = full, 1 = no eyes / no contact shadow / no
   *   sun-shadow casting, 2 = hidden
   */
  setLod(level: number) {
    if (this._lod === level) return;
    this._lod = level;
    const vis = level < 2;
    for (const m of this.meshes) { m.visible = vis; m.castShadow = level === 0; }
    for (const em of this.eyeMeshes) em.visible = level === 0;
    this.groundShadow.visible = level === 0;
  }
}

/** Drop the archetype cache (only used by hot reload). */
export function resetArchetypes() { ARCH.clear(); }

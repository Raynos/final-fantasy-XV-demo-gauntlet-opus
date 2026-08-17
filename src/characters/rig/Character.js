import * as THREE from 'three';
import { buildSkeleton } from './Skeleton.js';
import { buildBody } from './Body.js';
import { buildHead, buildEyes } from './Face.js';
import { buildHair } from './Hair.js';
import { buildOutfit } from './Outfit.js';
import { Animator } from './Anim.js';
import { skinMaterial, faceMaterial, garmentMaterial, hairMaterial, eyeMaterial, lensMaterial, contactShadowMaterial } from './Materials.js';
import { Rng } from '../../util/Rng.js';

/**
 * A fully realised character: skeleton, skinned body, sculpted head, hair,
 * layered clothing and a procedural animator.
 *
 * Public surface used by other systems (combat especially):
 *   char.root                 Object3D placed in the world
 *   char.attach.handR/.handL/.back/.hip   weapon sockets
 *   char.play(action, opts)   'attack_slash' | 'attack_thrust' | 'attack_overhead'
 *                             | 'guard' | 'cast' | 'warp' | 'hit'
 *   char.hit(dir, power)      staggered hit reaction
 *   char.setLookTarget(v3)    head / eye tracking, null to release
 *   char.update(dt, state)    state: { speed, velocity, turnRate, terrain, wind }
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
    // double-sided cloth rendered front-face into the shadow map self-shadows
    // into stripes; casting from back faces removes the acne
    for (const m of [SHARED.skin, SHARED.garment, SHARED.hair]) m.shadowSide = THREE.BackSide;
  }
  return SHARED;
}

export class Character {
  /**
   * @param {Object} def character definition from Cast.js
   */
  constructor(def) {
    this.name = def.name;
    this.def = def;
    this.look = def.look;
    this.seedRnd = new Rng(def.look.seed || 3);
    this.root = new THREE.Group();
    this.root.name = def.name;
    this.meshes = [];
  }

  /** Build all geometry and bind it to a fresh skeleton. */
  build() {
    const S = shared();
    const rig = buildSkeleton(this.def.profile);
    this.rig = rig;
    this.root.add(rig.root);

    const look = this.look;
    const bodyGeo = buildBody(rig, look);
    const head = buildHead(rig, look);
    const hairGeo = buildHair(rig, look);
    const outfitGeo = buildOutfit(rig, look);
    const eyes = buildEyes(rig, look);

    this.faceMat = faceMaterial(head.map);
    this.faceMat.side = THREE.DoubleSide;
    this.faceMat.shadowSide = THREE.BackSide;
    this.eyeMat = eyeMaterial(look.iris ?? 0x3f6f9c);

    this.body = this._skinned(bodyGeo, S.skin, 'body');
    this.head = this._skinned(head.geometry, this.faceMat, 'head');
    this.hair = this._skinned(hairGeo, S.hair, 'hair');
    this.outfit = this._skinned(outfitGeo, S.garment, 'outfit');

    // eyes ride a gaze pivot under the head bone
    const pivot = new THREE.Object3D();
    pivot.position.set(0, rig.dims.eyeY, rig.dims.eyeZ).sub(rig.P.head);
    rig.byName.head.add(pivot);
    const eyeMesh = new THREE.Mesh(eyes.geometry, this.eyeMat);
    eyeMesh.castShadow = false;
    eyeMesh.frustumCulled = false;
    pivot.add(eyeMesh);
    this.eyes = pivot;
    this.meshes.push(eyeMesh);

    if (look.lenses) {
      const lens = new THREE.Mesh(this._lensGeo(rig), lensMaterial());
      lens.frustumCulled = false;
      rig.byName.head.add(lens);
      lens.position.copy(rig.P.head).multiplyScalar(-1);
      this.meshes.push(lens);
    }

    // weapon sockets
    const socket = (name, boneName, pos, rot) => {
      const o = new THREE.Object3D();
      o.name = name;
      o.position.fromArray(pos);
      if (rot) o.rotation.fromArray(rot);
      rig.byName[boneName].add(o);
      return o;
    };
    const s = rig.dims.s;
    this.attach = {
      handR: socket('handR', 'handR', [0, -0.03 * s, 0.03 * s], [0.2, 0, 0]),
      handL: socket('handL', 'handL', [0, -0.03 * s, 0.03 * s], [0.2, 0, 0]),
      back: socket('back', 'spine03', [0, 0.06 * s, -0.14 * s], [0, 0, 0.3]),
      hip: socket('hip', 'hips', [-0.14 * s, 0.02 * s, -0.02 * s], [0, 0, -0.2]),
      head: socket('headTop', 'head', [0, 0.16 * s, 0], null),
    };

    // Contact shadow. The cascaded sun shadow alone loses the point where a
    // boot meets the ground once there is grass in between, and a character
    // whose contact you cannot find reads as hovering — the single cheapest
    // tell that a model was pasted into a scene rather than standing in it.
    const blob = new THREE.Mesh(S.shadowGeo, S.shadow);
    blob.scale.setScalar(0.98 * s);
    blob.position.set(0, 0.035 * s, -0.01 * s);
    blob.renderOrder = -2;
    blob.frustumCulled = false;
    blob.matrixAutoUpdate = true;
    this.root.add(blob);
    this.groundShadow = blob;

    this.anim = new Animator(this);
    this.height = rig.dims.height;
    return this;
  }

  _skinned(geo, mat, name) {
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.name = `${this.name}_${name}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.root.add(mesh);
    mesh.bind(this.rig.skeleton, new THREE.Matrix4());
    this.meshes.push(mesh);
    return mesh;
  }

  _lensGeo(rig) {
    const s = rig.dims.headScale;
    const org = rig.dims.headOrigin;
    const shapes = [];
    const geos = [];
    for (const sg of [1, -1]) {
      const g = new THREE.SphereGeometry(0.0275 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.34);
      g.scale(1, 0.5, 0.28);
      g.rotateX(Math.PI * 0.5);
      g.translate(org.x + sg * 0.0335 * s, org.y - 0.006 * s, org.z + 0.0772 * s);
      geos.push(g);
    }
    const merged = new THREE.BufferGeometry();
    const pos = [];
    const idx = [];
    let off = 0;
    for (const g of geos) {
      pos.push(...g.attributes.position.array);
      for (const i of g.index.array) idx.push(i + off);
      off += g.attributes.position.count;
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    merged.setIndex(idx);
    merged.computeVertexNormals();
    return merged;
  }

  /** @param {string} name see ACTIONS */
  play(name, opts) { this.anim.play(name, opts); }

  /** Hit reaction: recoil pose plus an impulse into the cloth springs. */
  hit(dirWorld, power = 1) {
    this.anim.play('hit', { speed: 1 / Math.max(0.4, Math.min(1.6, power)) });
    this.anim.coat.x.kick(-3 * power);
    this.anim.tail.x.kick(-2.5 * power);
  }

  setLookTarget(v) { this.anim.setLookTarget(v); }

  /** @param {number} dt @param {Object} state */
  update(dt, state) { this.anim.update(dt, state); }

  setVisible(v) { for (const m of this.meshes) m.visible = v; }

  dispose() {
    for (const m of this.meshes) m.geometry.dispose();
    this.faceMat.dispose();
    this.eyeMat.dispose();
  }
}

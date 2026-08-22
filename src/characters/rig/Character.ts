import * as THREE from 'three';
import { buildSkeleton } from './Skeleton.ts';
import { buildBody } from './Body.ts';
import { buildHead, buildEyes } from './Face.ts';
import { buildHair } from './Hair.ts';
import { buildOutfit } from './Outfit.ts';
import { Animator } from './Anim.ts';
import { skinMaterial, faceMaterial, garmentMaterial, hairMaterial, eyeMaterial, lensMaterial, contactShadowMaterial } from './Materials.ts';
import { Rng } from '../../util/Rng.ts';

/** Scratch for the per-frame grip layer — allocating there would churn the GC. */
const _ge = new THREE.Euler(0, 0, 0, 'YXZ');
const _gq = new THREE.Quaternion();

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

let SHARED: any = null;
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
  anim!: Animator;
  attach!: any;
  body!: any;
  def!: any;
  eyeMat!: THREE.Material;
  eyes!: THREE.Object3D;
  faceMat!: THREE.Material;
  grip!: any;
  groundShadow!: any;
  hair!: any;
  head!: any;
  height!: any;
  look!: any;
  meshes!: any[];
  name!: any;
  outfit!: any;
  rig!: any;
  root!: THREE.Group;
  seedRnd!: Rng;
  /**
   * @param def character definition from Cast.js
   */
  constructor(def: any) {
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
    const socket = (name: string, boneName: string, pos: number[], rot?: number[] | null) => {
      const o = new THREE.Object3D();
      o.name = name;
      o.position.fromArray(pos);
      if (rot) o.rotation.fromArray(rot as [number, number, number]);
      rig.byName[boneName].add(o);
      return o;
    };
    const s = rig.dims.s;
    this.attach = {
      handR: this._palmSocket(rig, 'R'),
      handL: this._palmSocket(rig, 'L'),
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
    /** How closed each fist is, 0 open .. 1 gripping. See `setGrip`. */
    this.grip = { L: 0, R: 0 };
    return this;
  }

  /**
   * A weapon socket at the **centre of the closed fist**, not at the wrist.
   *
   * The old socket sat on the wrist bone with a token offset, so a hilt
   * authored with its origin at the crossguard put the fist on the guard and
   * hung the whole grip and pommel in mid air below an open hand. Weapons are
   * now authored grip-at-origin (see `Weapons.js`) and this puts that origin
   * where a hand can actually close around it: down the metacarpals to the
   * middle of the palm, then in past the palm surface by about a grip radius.
   *
   * The frame is the one a fist imposes. The blade runs out of the *thumb*
   * side (+Y local → ±X world, mirrored per hand), the cutting edge follows
   * the fingers (+X local → down the metacarpals), and the flats lie in the
   * plane of the palm. Anything that wants a different carry angle — a
   * shouldered greatsword, a low ready — composes its own rotation on top;
   * that is what `PartyAI`'s hold transforms do.
   *
   */
  _palmSocket(rig: any, side: 'L' | 'R'): THREE.Object3D {
    const s = rig.dims.s;
    const wr = rig.P[`hand${side}`], kn = rig.P[`fingers${side}`];
    // the hand bone's bind rotation is identity, so its local frame is
    // world-aligned and a world offset is also the local offset
    const dir = new THREE.Vector3().subVectors(kn, wr).normalize();
    const front = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), dir)
      .normalize().multiplyScalar(-1);
    const o = new THREE.Object3D();
    o.name = `hand${side}`;
    o.position.copy(dir).multiplyScalar(0.044 * s).addScaledVector(front, -0.020 * s);

    const ex = side === 'R' ? 1 : -1;
    const xA = dir.clone();
    const yA = new THREE.Vector3(ex, 0, 0);
    yA.addScaledVector(xA, -yA.dot(xA)).normalize();
    const zA = new THREE.Vector3().crossVectors(xA, yA);
    o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, zA));
    rig.byName[`hand${side}`].add(o);
    return o;
  }

  /**
   * Close a fist around whatever is in that socket.
   *
   * The rig has always had real finger, fingertip and thumb bones; nothing
   * ever drove them, so every character held every weapon with a flat open
   * paddle. Positive X on these bones curls toward the palm (the hand builder
   * curls the fingers toward `-front`, which is −Z at bind), so this is a
   * single additive layer written after the animator has posed the skeleton.
   *
   * @param amount 0 open .. 1 closed around a grip
   */
  setGrip(side: 'L' | 'R', amount: number) {
    if (this.grip) this.grip[side] = THREE.MathUtils.clamp(amount, 0, 1);
  }

  /**
   * Write the grip curl. Safe to run every frame: `Animator.apply` either
   * `setFromEuler`s or identities *every* bone each tick, so this composes
   * with the pose rather than accumulating onto it.
   */
  _applyGrip() {
    const B = this.rig.byName;
    for (const side of ['L', 'R']) {
      const g = this.grip[side];
      if (g <= 0.001) continue;
      const sg = side === 'L' ? 1 : -1;
      const f = B[`fingers${side}`];
      if (f) f.quaternion.multiply(_gq.setFromEuler(_ge.set(1.24 * g, 0, 0, 'YXZ')));
      const t = B[`fingerTip${side}`];
      if (t) t.quaternion.multiply(_gq.setFromEuler(_ge.set(1.42 * g, 0, 0, 'YXZ')));
      const th = B[`thumb${side}`];
      // the thumb folds across the grip rather than curling into the palm
      if (th) th.quaternion.multiply(_gq.setFromEuler(_ge.set(0.62 * g, sg * 0.52 * g, 0, 'YXZ')));
    }
  }

  _skinned(geo: any, mat: any, name: string) {
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

  _lensGeo(rig: any) {
    const s = rig.dims.headScale;
    const org = rig.dims.headOrigin;
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
      for (const i of g.index!.array) idx.push(i + off);
      off += g.attributes.position.count;
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    merged.setIndex(idx);
    merged.computeVertexNormals();
    return merged;
  }

  /** @param name see ACTIONS */
  play(name: string, opts: any) { this.anim.play(name, opts); }

  /** Hit reaction: recoil pose plus an impulse into the cloth springs. */
  hit(dirWorld: any, power = 1) {
    this.anim.play('hit', { speed: 1 / Math.max(0.4, Math.min(1.6, power)) });
    this.anim.coat.x.kick(-3 * power);
    this.anim.tail.x.kick(-2.5 * power);
  }

  setLookTarget(v: any) { this.anim.setLookTarget(v); }

  /** @param dt @param state */
  update(dt: number, state: any) {
    this.anim.update(dt, state);
    if (this.grip && (this.grip.L > 0.001 || this.grip.R > 0.001)) this._applyGrip();
  }

  setVisible(v: any) { for (const m of this.meshes) m.visible = v; }

  dispose() {
    for (const m of this.meshes) m.geometry.dispose();
    this.faceMat.dispose();
    this.eyeMat.dispose();
  }
}

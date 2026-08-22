import * as THREE from 'three';
import type { Game } from '../game/Game.ts';
import { isDirectionalLight, isLight, isObject3D } from '../util/three-guards.ts';

/**
 * How far off the sun's azimuth the turntable parks. Straight down the sun
 * line flattens the model; 0.6 rad keeps the key light on the near cheek and
 * throws a readable form shadow on the far side — the standard three-quarter
 * key. Sitting *opposite* the sun, which a fixed angle does half the time,
 * renders every subject as a black silhouette.
 */
const KEY_OFFSET = 0.6;

/**
 * Isolation stage for judging one asset at a time.
 *
 * You cannot review a model while it stands in a field: the grass hides its
 * feet, the terrain tints it, and whatever the sun happens to be doing decides
 * whether it reads at all. The stage hides the world and leaves the asset alone
 * against the sky, then orbits it.
 *
 * **It adds no lights.** That is not laziness — `engine/LightBudget.ts` pins the
 * light counts because changing them changes every material's program key, and
 * one such toggle was measured recompiling 43 programs in a 9.5 s freeze. So the
 * stage reuses the scene's existing rig and instead controls the *sun* through
 * `Sky.setTimeOfDay`, which is free.
 *
 * Hiding works by walking `scene.children` and clearing `visible` on everything
 * that is not a light and not the sky, rather than by naming systems. Systems
 * get added and renamed; "is it a light" does not.
 */
export class Stage {
  _hidden!: any[];
  _current!: THREE.Object3D | null;
  _keep!: Set<any>;
  _needFrame!: boolean;
  _timeWas!: number | null;
  _uiWas!: any[] | null;
  active!: boolean;
  dist!: number;
  faceOffset!: number;
  group!: THREE.Group;
  pitch!: number;
  pivot!: THREE.Vector3;
  rate!: number;
  spin!: boolean;
  yaw!: number;
  constructor() {
    this.active = false;
    this.spin = true;
    this.rate = 0.35;        // radians/sec
    this.yaw = Math.PI;
    this.pitch = 0.18;
    this.dist = 6;
    this.pivot = new THREE.Vector3();
    this.group = new THREE.Group();
    this.group.name = 'devStage';
    this._hidden = [];
    this._keep = new Set();
    this._timeWas = null;
    this._current = null;
    this._needFrame = false;
    this._uiWas = null;
    this.faceOffset = 0.7;
  }

  enter(game: Game) {
    if (this.active) return;
    this.active = true;
    game.scene.add(this.group);

    const keep = this._keep;
    keep.clear();
    keep.add(this.group);
    const sky = game.get('Sky');
    // Sky exposes its root under one of several names depending on vintage;
    // keeping whichever exists is cheaper than caring which.
    const bag = sky as unknown as Record<string, unknown> | null;
    for (const k of ['root', 'group', 'dome', 'mesh', 'sky']) {
      const o = bag?.[k];
      if (isObject3D(o)) keep.add(o);
    }

    this._hidden = [];
    this._hide(game);

    // The title screen and HUD are DOM, not scene graph, so no amount of
    // `visible = false` touches them. A fresh boot sits on the title, which
    // otherwise draws "NEW GAME" straight across the asset you are reviewing.
    const story = game.get('Story');
    if (story && story.hideTitle) story.hideTitle();
    // Hide the whole UI layer rather than the HUD alone: hints, toasts, the
    // minimap and the interact prompt all live in their own roots and each
    // would otherwise print over the model.
    this._uiWas = [];
    for (const id of ['ui', 'title', 'hints']) {
      const el = document.getElementById(id);
      if (!el) continue;
      this._uiWas.push([el, el.style.display]);
      el.style.display = 'none';
    }

    // A high sun with the subject side-lit is the standard turntable setup: it
    // shows form without the long raking shadows that flatter a bad silhouette.
    if (sky && sky.setTimeOfDay) {
      this._timeWas = sky.hours;
      sky.setTimeOfDay(10.5);
    }
  }

  exit(game: Game) {
    if (!this.active) return;
    this.active = false;
    this.clear();
    game.scene.remove(this.group);
    for (const c of this._hidden) c.visible = true;
    this._hidden = [];
    this._keep.clear();
    for (const [el, display] of this._uiWas || []) el.style.display = display;
    this._uiWas = null;
    const sky = game.get('Sky');
    if (sky && this._timeWas != null) sky.setTimeOfDay(this._timeWas);
    this._timeWas = null;
  }

  /**
   * Hide every scene child that is not a light, the sky, or the stage itself.
   *
   * Re-run every frame rather than snapshotted once: the world streams. Rocks,
   * debris and wildlife are added to the scene by `TileStream` as the camera
   * moves, so anything spawned after a one-shot pass would pop back into an
   * otherwise empty stage — which is exactly what happened the first time.
   */
  _hide(game: Game) {
    for (const child of game.scene.children) {
      if (isLight(child) || this._keep.has(child)) continue;
      if (!child.visible) continue;
      child.visible = false;
      if (!this._hidden.includes(child)) this._hidden.push(child);
    }
  }

  /** Remove whatever is on the stage without tearing the stage down. */
  clear() {
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    this._current = null;
  }

  /**
   * Put an object on the stage and frame it.
   * @param at world position to stage at
   */
  show(obj: THREE.Object3D, at: THREE.Vector3) {
    this.clear();
    this._current = obj;
    if (obj.parent !== this.group) this.group.add(obj);
    this.pivot.copy(at);
    // Reparenting invalidates every descendant's world matrix, and
    // `Box3.setFromObject` reads world matrices. Without this the box is
    // computed from the *previous* frame's transforms, which put the camera
    // hundreds of metres from the subject and framed empty sky.
    obj.updateMatrixWorld(true);

    // Frame from the object's real bounds rather than a guessed distance: the
    // roster spans a 0.9 m goblin to a Titan, and one fixed dolly cannot serve
    // both. `setFromObject` reads the bind-pose box for a skinned mesh, which
    // is close enough to frame with and much cheaper than a skinned bounds pass.
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    // Height dominates for a humanoid and length for a quadruped, so frame on
    // the largest axis -- but ignore a degenerate box, which a skinned mesh
    // with an unbuilt bounding volume will happily report.
    const radius = Math.max(size.x, size.y, size.z) * 0.5;
    if (!Number.isFinite(radius) || radius <= 0.01) {
      this.pivot.copy(at);
      this.dist = 4;
      this._needFrame = true;
      return { size, radius: 1, centre: at };
    }
    this.pivot.copy(centre);
    this.dist = Math.max(1.6, radius * 3.1);
    // Frame once on the next update even when the turntable is parked,
    // otherwise selecting an asset with `stage.spin` off leaves the camera
    // wherever it happened to be and the asset is simply off screen.
    this._needFrame = true;
    // Dead-on is the least informative angle there is, so every subject is
    // turned to a three-quarter. A long-bodied creature needs much more of a
    // turn than a biped: head-on, a quadruped is a face and no body at all.
    const quadruped = size.z > size.y * 1.3 || size.x > size.y * 1.3;
    this.faceOffset = quadruped ? 1.25 : 0.7;
    return { size, radius, centre };
  }

  /**
   * Park the camera on the lit side of the subject.
   *
   * Read from the real sun rather than assumed, because `sky.time` is a live
   * cvar — move the sun and the next asset should still be lit, not silhouetted.
   */
  keyToSun(game: Game) {
    let sun: THREE.DirectionalLight | null = null;
    const bag = game.get('Sky') as unknown as Record<string, unknown> | undefined;
    for (const k of ['sun', 'light', 'dirLight', 'sunLight']) {
      const o = bag?.[k];
      if (isDirectionalLight(o)) { sun = o; break; }
    }
    if (!sun) {
      game.scene.traverse((o: THREE.Object3D) => { if (!sun && isDirectionalLight(o)) sun = o; });
    }
    if (!sun) return;
    // A directional light's position points *towards* where the light comes
    // from, so its azimuth is the sun's azimuth.
    const p = sun.getWorldPosition(new THREE.Vector3());
    this.yaw = Math.atan2(p.x, p.z) + KEY_OFFSET;
  }

  /**
   * Heading that makes a subject face the camera.
   *
   * Measured, not derived: the rigs in this project author their forward down
   * +Z, so facing the camera is simply the camera azimuth. The textbook -Z
   * convention would need a half-turn here and puts every subject's back to
   * the reviewer. `faceOffset` then swings it off dead-on.
   */
  subjectYaw() { return this.yaw + this.faceOffset; }

  /** Stats worth showing beside a staged asset. */
  stats() {
    let tris = 0, meshes = 0, mats = new Set(), bones = 0;
    if (this._current) {
      this._current.traverse((o: any) => {
        if (o.isSkinnedMesh && o.skeleton) bones = Math.max(bones, o.skeleton.bones.length);
        if (o.isMesh && o.geometry) {
          meshes++;
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => mats.add(m.uuid));
          const g = o.geometry;
          tris += g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
        }
      });
    }
    return { tris: Math.round(tris), meshes, materials: mats.size, bones };
  }

  /**
   * Drive the review camera around the pivot. Called before the freecam writes
   * the camera, so manual flight still wins when the turntable is off.
   * @param dt @param cam
   */
  update(dt: number, cam: import('./Freecam.ts').Freecam, game: Game) {
    if (!this.active) return;
    if (game) this._hide(game);
    if (!this.spin && !this._needFrame) return;
    this._needFrame = false;
    if (this.spin) this.yaw += this.rate * dt;
    const cp = Math.cos(this.pitch);
    cam.pos.set(
      this.pivot.x + Math.sin(this.yaw) * this.dist * cp,
      this.pivot.y + Math.sin(this.pitch) * this.dist,
      this.pivot.z + Math.cos(this.yaw) * this.dist * cp,
    );
    cam.lookAt(this.pivot.x, this.pivot.y, this.pivot.z);
  }
}

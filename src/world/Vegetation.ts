import * as THREE from 'three';
import { Ecology } from './veg/Ecology.ts';
import { GrassField } from './veg/GrassField.ts';
import { Bushes } from './veg/Bushes.ts';
import { Trees } from './veg/Trees.ts';
import { VegUniforms, VEG_ACTOR_MAX, installAlphaCardGuard } from './veg/VegMaterial.ts';

/**
 * Everything that grows. Owns the shared Ecology sampler (Props borrows it),
 * a camera-following instanced grass field, the scrub layer and the forest.
 *
 * All wind/trample state lives in one shared uniform block so a single update
 * here drives every patched vegetation shader in the scene.
 */
export class Vegetation {
  _actors!: any[];
  _camPos!: THREE.Vector3;
  _gust!: number;
  _pool!: any[];
  actorRange!: number;
  bushes!: Bushes;
  ecology!: Ecology;
  game!: any;
  grass!: GrassField;
  trees!: Trees;
  async init(game: any) {
    this.game = game;
    const quality = game.rnd && game.rnd.quality === 'low' ? 0.45
      : game.rnd && game.rnd.quality === 'medium' ? 0.7 : 1.0;

    this.ecology = new Ecology(game, game.seed ?? 1337);
    installAlphaCardGuard(game.scene);

    this.grass = new GrassField(this.ecology, game.scene, { quality });
    this.grass.build();

    this.bushes = new Bushes(this.ecology, game.scene, { quality });
    this.bushes.build();

    this.trees = new Trees(this.ecology, game.scene, { quality });
    this.trees.build(game.renderer);

    // prime around the origin so the first rendered frame is already dressed
    const c = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < 60; i++) this.grass.update(c);
    this.bushes.update(c);
    this.trees.update(c);

    this._camPos = new THREE.Vector3();
    this._gust = 0;
    this._actors = [];
    this._pool = [];
    this.actorRange = 45;        // metres from camera; past that no blade reads
  }

  /** Wind strength, 0.4 = still air, 2.5 = storm. Weather can drive this. */
  setWind(strength: number, dirRadians: number) {
    VegUniforms.uWindStrength.value = strength;
    if (dirRadians != null) VegUniforms.uWindDir.value.set(Math.cos(dirRadians), Math.sin(dirRadians));
  }

  /**
   * Collect everyone standing in the grass this frame.
   *
   * Only the player used to part the field, so the other three party members
   * and every enemy waded through it with alpha planes slicing their shins —
   * and a silhouette you cannot see the legs of never reads as a person
   * standing in a place. The list is distance-sorted and capped so a crowded
   * fight still costs a fixed-size uniform block.
   *
   * @param centre camera position — who matters is who is on screen
   */
  _gatherActors(game: any, centre: THREE.Vector3) {
    const out = this._actors;
    const pool = this._pool;
    out.length = 0;
    const add = (obj: any, radius: number) => {
      const p = obj && (obj.position || (obj.root && obj.root.position));
      if (!p) return;
      const d2 = (p.x - centre.x) ** 2 + (p.z - centre.z) ** 2;
      if (d2 > this.actorRange * this.actorRange) return;
      const slot = pool[out.length] || (pool[out.length] = { x: 0, y: 0, z: 0, r: 0, d2: 0 });
      slot.x = p.x; slot.y = p.y; slot.z = p.z; slot.r = radius; slot.d2 = d2;
      out.push(slot);
    };

    const player = game.get('Player');
    if (player) add(player, 1.35);

    const party = game.get('Party');
    if (party && Array.isArray(party.members)) {
      for (const m of party.members) add(m, 1.25);
    }

    const enemies = game.get('Enemies');
    if (enemies && Array.isArray(enemies.list)) {
      for (const e of enemies.list) {
        if (e && e.dead) continue;
        add(e, 0.95 + (e && e.scale ? e.scale : 1) * 0.45);
      }
    }

    out.sort((a, b) => a.d2 - b.d2);
    const n = Math.min(out.length, VEG_ACTOR_MAX);
    const slots = VegUniforms.uActors.value;
    for (let i = 0; i < n; i++) {
      const a = out[i];
      slots[i].set(a.x, a.y, a.z, a.r);
    }
    VegUniforms.uActorCount.value = n;
  }

  update(dt: number, game: any) {
    VegUniforms.uTime.value = game.time.now;

    const player = game.get('Player');
    if (player && player.position) VegUniforms.uPlayer.value.copy(player.position);

    // slow breathing gust envelope on top of the shader's travelling wave
    this._gust += dt * 0.17;
    const w = game.get('Weather');
    const base = w && w.windStrength != null ? w.windStrength : 1.0;
    VegUniforms.uWindStrength.value = base * (0.82 + 0.35 * Math.sin(this._gust * 2.1) * Math.sin(this._gust * 0.63));

    // camera transform is one frame stale here (CameraRig runs later in the
    // system list); the streaming radius has plenty of margin for that.
    this._camPos.setFromMatrixPosition(game.camera.matrixWorld);
    this._gatherActors(game, this._camPos);
    this.grass.update(this._camPos);
    this.bushes.update(this._camPos);
    this.trees.update(this._camPos);
  }
}

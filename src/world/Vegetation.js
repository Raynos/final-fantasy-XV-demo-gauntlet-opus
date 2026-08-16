import * as THREE from 'three';
import { Ecology } from './veg/Ecology.js';
import { GrassField } from './veg/GrassField.js';
import { Bushes } from './veg/Bushes.js';
import { Trees } from './veg/Trees.js';
import { VegUniforms, installAlphaCardGuard } from './veg/VegMaterial.js';

/**
 * Everything that grows. Owns the shared Ecology sampler (Props borrows it),
 * a camera-following instanced grass field, the scrub layer and the forest.
 *
 * All wind/trample state lives in one shared uniform block so a single update
 * here drives every patched vegetation shader in the scene.
 */
export class Vegetation {
  async init(game) {
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
  }

  /** Wind strength, 0.4 = still air, 2.5 = storm. Weather can drive this. */
  setWind(strength, dirRadians) {
    VegUniforms.uWindStrength.value = strength;
    if (dirRadians != null) VegUniforms.uWindDir.value.set(Math.cos(dirRadians), Math.sin(dirRadians));
  }

  update(dt, game) {
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
    this.grass.update(this._camPos);
    this.bushes.update(this._camPos);
    this.trees.update(this._camPos);
  }
}

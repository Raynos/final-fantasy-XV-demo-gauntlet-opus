import * as THREE from 'three';
import { Ecology } from './veg/Ecology.js';
import { Rocks } from './props/Rocks.js';
import { Landmarks } from './props/Landmarks.js';
import { Debris } from './props/Debris.js';
import { buildRegalia } from './props/Regalia.js';
import { Megastructures } from './props/Megastructures.js';
import { RoadFurniture } from './props/RoadFurniture.js';
import { Outposts } from './props/Outposts.js';
import { Wildlife } from './props/Wildlife.js';

/**
 * World dressing: geology, landmarks, scatter debris and the Regalia.
 *
 * Shares the Vegetation system's Ecology sampler so rocks, structures and
 * plants all agree about where the road, the cliffs and the campsite are.
 */
export class Props {
  async init(game) {
    this.game = game;
    const quality = game.rnd && game.rnd.quality === 'low' ? 0.5
      : game.rnd && game.rnd.quality === 'medium' ? 0.75 : 1.0;

    const veg = game.get('Vegetation');
    this.ecology = (veg && veg.ecology) || new Ecology(game, game.seed ?? 1337);

    this.rocks = new Rocks(this.ecology, game.scene, { quality });
    this.rocks.build();

    this.landmarks = new Landmarks(this.ecology, game.scene);
    this.landmarks.build();

    this.mega = new Megastructures(this.ecology, game.scene);
    this.mega.build();

    this.outposts = new Outposts(this.ecology, game.scene);
    this.outposts.build();

    this.roadKit = new RoadFurniture(this.ecology, game.scene);
    this.roadKit.build();

    this.wildlife = new Wildlife(this.ecology, game.scene, { quality });
    this.wildlife.build();

    this.debris = new Debris(this.ecology, game.scene, { quality });
    this.debris.build();

    this._buildRegalia(game);
    this._camPos = new THREE.Vector3();
  }

  /**
   * A tiny PMREM sky so chrome and black lacquer have something to reflect
   * even before the Sky system publishes a real environment.
   */
  _fallbackEnv(game) {
    if (game.scene.environment) return null;
    const W = 64, H = 32;
    const data = new Float32Array(W * H * 4);
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1);
      // v=0 is up in equirect layout
      const up = 1 - v;
      const sky = [0.22 + up * 0.28, 0.35 + up * 0.34, 0.62 + up * 0.36];
      const ground = [0.19, 0.16, 0.13];
      const k = THREE.MathUtils.smoothstep(up, 0.44, 0.56);
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        data[i] = ground[0] + (sky[0] - ground[0]) * k;
        data[i + 1] = ground[1] + (sky[1] - ground[1]) * k;
        data[i + 2] = ground[2] + (sky[2] - ground[2]) * k;
        data[i + 3] = 1;
      }
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.needsUpdate = true;
    const pmrem = new THREE.PMREMGenerator(game.renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
    return env;
  }

  _buildRegalia(game) {
    const eco = this.ecology;
    const site = eco.sites.find((s) => s.type === 'regalia');
    if (!site) return;
    const env = this._fallbackEnv(game);
    const { group, lights, lamp, tail } = buildRegalia({ envMap: env });
    this.regaliaLights = lights;
    this.regaliaLamp = lamp;
    this.regaliaTail = tail;

    const yaw = site.yaw || 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const yF = eco.height(site.x + fx * 1.75, site.z + fz * 1.75);
    const yR = eco.height(site.x - fx * 1.75, site.z - fz * 1.75);
    const yL = eco.height(site.x + fz * 0.82, site.z - fx * 0.82);
    const yRt = eco.height(site.x - fz * 0.82, site.z + fx * 0.82);

    const outer = new THREE.Group();
    outer.position.set(site.x, (yF + yR + yL + yRt) * 0.25 + 0.015, site.z);
    outer.rotation.y = yaw;
    const inner = new THREE.Group();
    inner.rotation.z = Math.atan2(yF - yR, 3.5);
    inner.rotation.x = Math.atan2(yRt - yL, 1.64);
    inner.add(group);
    outer.add(inner);
    outer.name = 'regalia_root';
    game.scene.add(outer);
    this.regalia = outer;
  }

  /** 0 in full daylight, 1 once the sun is well below the horizon. */
  _night(game) {
    const sky = game.get('Sky');
    if (!sky || !sky.sun || !sky.sun.position) return 0;
    const p = sky.sun.position;
    const elev = p.y / (p.length() || 1);
    return THREE.MathUtils.clamp(1 - (elev + 0.06) * 6.5, 0, 1);
  }

  update(dt, game) {
    const t = game.time.now;
    const night = this._night(game);
    if (this.landmarks) this.landmarks.update(dt, t, night);
    if (this.mega) this.mega.update(dt, t, night);

    // headlights come up as the sun goes down
    if (this.regaliaLights) {
      for (const l of this.regaliaLights) l.intensity = 0.4 + night * 9.5;
      if (this.regaliaLamp) this.regaliaLamp.emissiveIntensity = 0.3 + night * 3.2;
      if (this.regaliaTail) this.regaliaTail.emissiveIntensity = 0.25 + night * 1.3;
    }

    this._camPos.setFromMatrixPosition(game.camera.matrixWorld);
    this.rocks.update(this._camPos);
    this.debris.update(this._camPos);
    if (this.outposts) this.outposts.update(dt, t, night, this._camPos);
    if (this.roadKit) this.roadKit.update(this._camPos);
    if (this.wildlife) this.wildlife.update(dt, t, night, this._camPos);
  }
}

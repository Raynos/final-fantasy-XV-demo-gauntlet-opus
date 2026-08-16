import * as THREE from 'three';

/** Placeholder sky + sun. Replaced by the atmosphere agent. */
export class Sky {
  async init(game) {
    this.game = game;
    const scene = game.scene;
    scene.background = new THREE.Color(0x8fb4dd);
    scene.fog = new THREE.FogExp2(0x9db8d8, 0.0035);

    this.sun = new THREE.DirectionalLight(0xfff2dc, 3.2);
    this.sun.position.set(-120, 90, 60);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = -80; c.right = 80; c.top = 80; c.bottom = -80; c.near = 1; c.far = 400;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.ambient = new THREE.HemisphereLight(0xbcd6ff, 0x54503f, 0.9);
    scene.add(this.ambient);
  }
  update() {}
}

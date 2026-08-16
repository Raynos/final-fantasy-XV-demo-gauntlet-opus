import * as THREE from 'three';

/**
 * Placeholder player: a capsule with locomotion + terrain following.
 * Contract for other systems:
 *   .root (Object3D)   world transform
 *   .position          shorthand for root.position
 *   .velocity          Vector3
 *   .heading           radians, facing yaw
 *   .stats             { hp, maxHp, mp, maxMp }
 */
export class Player {
  async init(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.velocity = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.grounded = true;
    this.stats = { hp: 3200, maxHp: 3200, mp: 100, maxMp: 100, level: 27 };

    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 1.05, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.6 })
    );
    mesh.position.y = 0.88;
    mesh.castShadow = true;
    this.root.add(mesh);
    this.mesh = mesh;

    const terrain = game.get('Terrain');
    this.root.position.set(0, terrain.heightAt(0, 0), 0);
    game.scene.add(this.root);
  }

  get position() { return this.root.position; }

  update(dt, game) {
    const input = game.input;
    const cam = game.camera;
    const mv = input.move;
    const run = input.key('ShiftLeft') || input.gpButton(10);

    // camera-relative movement
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const wish = new THREE.Vector3()
      .addScaledVector(right, mv.x)
      .addScaledVector(fwd, mv.y);
    const mag = wish.length();
    if (mag > 0.001) {
      wish.normalize();
      this.heading = Math.atan2(wish.x, wish.z);
      const target = (run ? 7.4 : 3.6) * Math.min(1, mag);
      this.speed = THREE.MathUtils.damp(this.speed, target, 8, dt);
    } else {
      this.speed = THREE.MathUtils.damp(this.speed, 0, 12, dt);
    }

    this.velocity.set(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(this.speed);
    this.root.position.addScaledVector(this.velocity, dt);

    const terrain = game.get('Terrain');
    this.root.position.y = terrain.heightAt(this.root.position.x, this.root.position.z);
    this.root.rotation.y = THREE.MathUtils.damp(this.root.rotation.y, this.heading, 12, dt);
  }
}

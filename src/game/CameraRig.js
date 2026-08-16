import * as THREE from 'three';

/**
 * Third-person spring-arm camera with collision, framing offsets and a
 * cinematic-shot override used by the screenshot harness.
 *
 * Harness contract:
 *   rig.setShot({ pos:[x,y,z], target:[x,y,z], fov })  -> freeze camera
 *   rig.clearShot()
 */
export class CameraRig {
  async init(game) {
    this.game = game;
    this.cam = game.camera;
    this.yaw = Math.PI * 0.15;
    this.pitch = 0.22;
    this.distance = 5.6;
    this.targetDistance = 5.6;
    this.height = 1.55;
    this.shoulder = 0.55;
    this.shot = null;
    this._focus = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._smooth = new THREE.Vector3();
    this._first = true;
    this.sensitivity = 0.0026;
  }

  setShot(shot) { this.shot = shot; }
  clearShot() { this.shot = null; }

  lateUpdate(dt, game) {
    if (this.shot) {
      const s = this.shot;
      // follow-shots track the player so the framing stays correct after settling
      if (this.followShot) {
        const p = game.get('Player').position;
        const f = this.followShot;
        s.pos = [p.x + f.offset[0], p.y + f.offset[1], p.z + f.offset[2]];
        s.target = [
          p.x + (f.lookOffset?.[0] ?? 0),
          p.y + (f.lookOffset?.[1] ?? 1.2),
          p.z + (f.lookOffset?.[2] ?? 0),
        ];
      }
      this.cam.position.fromArray(s.pos);
      this.cam.lookAt(new THREE.Vector3().fromArray(s.target));
      if (s.fov && s.fov !== this.cam.fov) { this.cam.fov = s.fov; this.cam.updateProjectionMatrix(); }
      if (s.roll) this.cam.rotateZ(s.roll);
      return;
    }

    const input = game.input;
    const player = game.get('Player');
    if (!player) return;

    this.yaw -= input.look.x * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.look.y * this.sensitivity, -0.55, 1.15);
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + input.mouse.wheel * 0.5, 2.2, 12);
    this.distance = THREE.MathUtils.damp(this.distance, this.targetDistance, 6, dt);

    this._focus.copy(player.position);
    this._focus.y += this.height;

    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    this._desired.copy(this._focus).addScaledVector(dir, this.distance);

    // keep the camera above the ground
    const terrain = game.get('Terrain');
    if (terrain) {
      const h = terrain.heightAt(this._desired.x, this._desired.z) + 0.9;
      if (this._desired.y < h) this._desired.y = h;
    }

    if (this._first) { this._smooth.copy(this._desired); this._first = false; }
    else {
      const k = 12;
      this._smooth.x = THREE.MathUtils.damp(this._smooth.x, this._desired.x, k, dt);
      this._smooth.y = THREE.MathUtils.damp(this._smooth.y, this._desired.y, k * 0.7, dt);
      this._smooth.z = THREE.MathUtils.damp(this._smooth.z, this._desired.z, k, dt);
    }

    this.cam.position.copy(this._smooth);
    this.cam.lookAt(this._focus);
  }
}

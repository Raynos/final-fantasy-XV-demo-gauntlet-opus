import * as THREE from 'three';

/**
 * Placeholder terrain: a single displaced plane with a height query API.
 * Contract used by every other system — keep these signatures when replacing:
 *   heightAt(x, z) -> number
 *   normalAt(x, z) -> THREE.Vector3
 */
export class Terrain {
  constructor() { this.size = 1400; }

  async init(game) {
    this.game = game;
    const seg = 256;
    const geo = new THREE.PlaneGeometry(this.size, this.size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ color: 0x6b7355, roughness: 0.95, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    game.scene.add(this.mesh);
  }

  heightAt(x, z) {
    const s = 0.0035;
    let h = 0, amp = 14, f = s;
    for (let o = 0; o < 4; o++) {
      h += amp * Math.sin(x * f + o * 1.7) * Math.cos(z * f * 1.13 + o * 2.3);
      amp *= 0.5; f *= 2.03;
    }
    return h;
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 0.5;
    const hL = this.heightAt(x - e, z), hR = this.heightAt(x + e, z);
    const hD = this.heightAt(x, z - e), hU = this.heightAt(x, z + e);
    return out.set(hL - hR, 2 * e, hD - hU).normalize();
  }

  update() {}
}

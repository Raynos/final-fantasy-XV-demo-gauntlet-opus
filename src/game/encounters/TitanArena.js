import * as THREE from 'three';
import { loft, rectCross, place, tint, glow, merge, enableVertexEmissive } from '../../combat/GeoKit.js';
import { Rng } from '../../util/Rng.js';

/**
 * The Disc of Cauthess — the arena you fight Titan in.
 *
 * A ring of shattered basalt spires standing in a broken crater floor, with
 * magma light bleeding up through the fractures. Built as a **single merged
 * mesh** (one draw call), thrown up when the fight starts and disposed when
 * it ends. It also owns the arena boundary: Titan's fight is a closed space,
 * and being unable to run away is most of what makes it feel like an Astral.
 */
export class TitanArena {
  /**
   * @param {object} game
   * @param {THREE.Vector3} centre
   * @param {number} radius
   */
  constructor(game, centre, radius = 60) {
    this.game = game;
    this.centre = centre.clone();
    this.radius = radius;
    this.terrain = game.get('Terrain');
    this.vfx = game.get('VFX');
    this.rng = new Rng(90210);
    this.root = new THREE.Group();
    this.root.name = 'TitanArena';
    this.shake = 0;
    this.risen = 0;
    this._tmp = new THREE.Vector3();
  }

  /** Raise the ring. */
  build() {
    const parts = [];
    const n = 34;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rng.range(-0.05, 0.05);
      const r = this.radius * this.rng.range(0.97, 1.14);
      const x = this.centre.x + Math.cos(a) * r;
      const z = this.centre.z + Math.sin(a) * r;
      const y = this.terrain ? this.terrain.heightAt(x, z) : 0;
      const h = this.rng.range(9, 22);
      const w = this.rng.range(2.6, 6.4);
      const lean = this.rng.range(-0.22, 0.22);
      const spire = loft(rectCross(0.4, 7), [
        { y: -2, sx: w * 1.25, sz: w * 1.05 },
        { y: h * 0.28, sx: w, sz: w * 0.9, dx: lean * h * 0.2 },
        { y: h * 0.68, sx: w * 0.62, sz: w * 0.58, dx: lean * h * 0.5 },
        { y: h, sx: w * 0.16, sz: w * 0.14, dx: lean * h * 0.8 },
      ]);
      parts.push(tint(place(spire, { pos: [x, y, z], rot: [0, a, 0] }), ROCK, 0.07));

      // a molten seam at the base of every third spire
      if (i % 3 === 0) {
        const seam = loft(rectCross(0.5, 6), [
          { y: 0, sx: w * 1.02, sz: w * 0.86 },
          { y: 1.1, sx: w * 0.9, sz: w * 0.76 },
        ]);
        parts.push(glow(tint(place(seam, { pos: [x, y - 0.6, z], rot: [0, a, 0] }), 0x2a0d04), MAGMA, 2.2));
      }
    }

    // broken slabs scattered across the floor so the ground reads as shattered
    for (let i = 0; i < 26; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = Math.sqrt(this.rng.next()) * this.radius * 0.85;
      const x = this.centre.x + Math.cos(a) * r;
      const z = this.centre.z + Math.sin(a) * r;
      const y = this.terrain ? this.terrain.heightAt(x, z) : 0;
      const w = this.rng.range(2.0, 5.5);
      const slabG = loft(rectCross(0.3, 6), [
        { y: 0, sx: w, sz: w * 0.7 },
        { y: this.rng.range(0.5, 1.8), sx: w * 0.85, sz: w * 0.6 },
      ]);
      parts.push(tint(place(slabG, {
        pos: [x, y - 0.2, z],
        rot: [this.rng.range(-0.2, 0.2), this.rng.next() * 3.14, this.rng.range(-0.2, 0.2)],
      }), ROCK_DARK, 0.06));
    }

    const geo = merge(parts);
    const mat = enableVertexEmissive(new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0.0,
    }));
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.game.scene.add(this.root);
    return this;
  }

  /** Shake the world and throw dust off the ring. @param {number} power */
  quake(power = 1) {
    this.shake = Math.max(this.shake, power);
    if (!this.vfx) return;
    for (let i = 0; i < 10; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = this.radius * this.rng.range(0.7, 1.05);
      const x = this.centre.x + Math.cos(a) * r;
      const z = this.centre.z + Math.sin(a) * r;
      const y = this.terrain ? this.terrain.heightAt(x, z) : 0;
      this.vfx.dustPuff({
        pos: new THREE.Vector3(x, y + 4, z), count: 10, radius: 3, speed: 5 * power,
        life: 3.4, size: 2.0, grow: 3.0, up: 1.2, intensity: 0.4,
      });
    }
  }

  /** Each new phase splits the floor a little further open. */
  riseSpires(phase) {
    this.risen = phase;
    this.quake(1.2);
    if (!this.vfx) return;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = this.radius * 0.5;
      const x = this.centre.x + Math.cos(a) * r;
      const z = this.centre.z + Math.sin(a) * r;
      const y = this.terrain ? this.terrain.heightAt(x, z) : 0;
      const p = new THREE.Vector3(x, y, z);
      this.vfx.flare({ pos: p, color: 0xff7a2a, size: 4, life: 1.2, intensity: 5 });
      if (this.terrain) this.vfx.scorch(p, 6, this.terrain);
    }
  }

  /**
   * Keep the party inside the ring, and bleed the quake off. Called from the
   * fight's tick, so no other system has to know the arena exists.
   */
  update(dt) {
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 0.9);
    const player = this.game.get('Player');
    if (player) this._contain(player.root.position);
    const party = this.game.get('Party');
    if (party && party.members) for (const m of party.members) this._contain(m.root.position);
  }

  _contain(p) {
    const dx = p.x - this.centre.x, dz = p.z - this.centre.z;
    const d = Math.hypot(dx, dz);
    const lim = this.radius - 4;
    if (d <= lim || d < 1e-4) return;
    p.x = this.centre.x + (dx / d) * lim;
    p.z = this.centre.z + (dz / d) * lim;
    if (this.terrain) p.y = this.terrain.heightAt(p.x, p.z);
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
    this.root.removeFromParent();
  }
}

const ROCK = 0x4a4038;
const ROCK_DARK = 0x2e2823;
const MAGMA = 0xff5a12;

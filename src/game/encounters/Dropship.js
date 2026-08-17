import * as THREE from 'three';
import {
  loft, rectCross, tube, slab, spike, blob, place, tint, glow, merge, enableVertexEmissive,
} from '../../combat/GeoKit.js';
import { metalNormal, metalRoughness } from '../../characters/enemies/EnemyBase.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

const HULL = 0x2a2d33;
const HULL_DARK = 0x14161a;
const HULL_LIGHT = 0x484d55;
const RED = 0xff2a18;

/**
 * The imperial dropship.
 *
 * FFXV's signature random encounter is a black wedge sliding out of the sky,
 * hanging over the road on four howling thrusters, and dumping a squad of
 * troopers onto the tarmac before climbing away. It is one merged mesh (one
 * draw call), built once and reused for every arrival.
 */
export class Dropship {
  /** @param {object} game */
  init(game) {
    this.game = game;
    this.terrain = game.get('Terrain');
    this.vfx = game.get('VFX');
    this.root = new THREE.Group();
    this.root.name = 'Dropship';
    this.root.visible = false;
    this.mesh = buildHull();
    this.root.add(this.mesh);
    game.scene.add(this.root);

    this.state = 'idle';       // idle | approach | hover | drop | depart
    this.t = 0;
    this.at = new THREE.Vector3();
    this.from = new THREE.Vector3();
    this.payload = [];
    this._tmp = new THREE.Vector3();
    return this;
  }

  /** True while an arrival is playing. */
  get busy() { return this.state !== 'idle'; }

  /**
   * Fly in, hover over `at`, and deliver `payload` (already-spawned enemies).
   * @param {THREE.Vector3} at ground point
   * @param {object[]} payload enemies to drop
   */
  arrive(at, payload) {
    this.at.copy(at);
    this.payload = payload || [];
    for (const e of this.payload) {
      e.airborne = true;
      e.setState('idle');
      e.root.position.set(at.x + (e.id % 5 - 2) * 1.6, at.y + HOVER, at.z + ((e.id * 3) % 5 - 2) * 1.4);
      if (e.visual) e.visual.visible = false;
    }
    // come in low out of the north, banked
    this.from.set(at.x - 150, at.y + HOVER + 40, at.z - 190);
    this.root.position.copy(this.from);
    this.root.visible = true;
    this.state = 'approach';
    this.t = 0;
    window.dispatchEvent(new CustomEvent('encounter:dropship', { detail: { phase: 'approach', at: at.toArray() } }));
    return this;
  }

  update(dt) {
    if (this.state === 'idle') return;
    this.t += dt;
    const target = this._tmp.set(this.at.x, this.at.y + HOVER, this.at.z);

    switch (this.state) {
      case 'approach': {
        const k = Math.min(1, this.t / 4.2);
        const e = 1 - Math.pow(1 - k, 3);
        this.root.position.lerpVectors(this.from, target, e);
        this.root.position.y += Math.sin(k * Math.PI) * 6;
        this.root.rotation.y = Math.atan2(target.x - this.from.x, target.z - this.from.z);
        this.root.rotation.z = -0.34 * (1 - e);
        this._thrusters(dt, 1);
        if (k >= 1) { this.state = 'hover'; this.t = 0; }
        break;
      }
      case 'hover': {
        this.root.position.copy(target);
        this.root.position.y += Math.sin(this.t * 2.2) * 0.18;
        this.root.rotation.z = Math.sin(this.t * 1.4) * 0.03;
        this._thrusters(dt, 0.7);
        if (this.t > 1.0) { this.state = 'drop'; this.t = 0; this._dropped = 0; }
        break;
      }
      case 'drop': {
        this.root.position.copy(target);
        this.root.position.y += Math.sin(this.t * 2.2) * 0.18;
        this._thrusters(dt, 0.7);
        // stagger the troopers out of the bay
        const want = Math.min(this.payload.length, Math.floor(this.t / 0.22) + 1);
        for (let i = this._dropped; i < want; i++) {
          const e = this.payload[i];
          if (e.visual) e.visual.visible = true;
          e._fall = 0;
          if (this.vfx) {
            this.vfx.sparkBurst({
              pos: e.root.position.clone(), dir: new THREE.Vector3(0, -1, 0), count: 10,
              speed: 6, spread: 0.5, color: 0xff4020, size: 0.06, life: 0.3, intensity: 6,
            });
          }
        }
        this._dropped = want;
        let landed = 0;
        for (const e of this.payload) {
          if (!e.airborne) { landed++; continue; }
          if (e._fall == null) continue;
          e._fall += dt;
          const gy = this.terrain ? this.terrain.heightAt(e.root.position.x, e.root.position.z) : 0;
          e.root.position.y = Math.max(gy, e.root.position.y - (2 + e._fall * 26) * dt);
          if (e.root.position.y <= gy + 1e-3) {
            e.airborne = false;
            e.root.position.y = gy;
            e.target = this.game.get('Player');
            e.awareness = 1;
            e.setState('chase');
            if (this.vfx) {
              this.vfx.dustPuff({
                pos: e.root.position.clone(), count: 14, radius: 0.6, speed: 3.4,
                life: 1.1, size: 0.55, grow: 2.8, up: 0.6, intensity: 0.5,
              });
            }
          }
        }
        if (landed >= this.payload.length && this.t > 1.4) {
          this.state = 'depart';
          this.t = 0;
          this.exit = this.root.position.clone().add(new THREE.Vector3(120, 90, 160));
          window.dispatchEvent(new CustomEvent('encounter:dropship', { detail: { phase: 'dropped' } }));
        }
        break;
      }
      case 'depart': {
        const k = Math.min(1, this.t / 5.0);
        this.root.position.lerpVectors(target, this.exit, k * k);
        this.root.rotation.z = 0.3 * k;
        this._thrusters(dt, 1.2);
        if (k >= 1) {
          this.state = 'idle';
          this.root.visible = false;
          this.payload = [];
          window.dispatchEvent(new CustomEvent('encounter:dropship', { detail: { phase: 'gone' } }));
        }
        break;
      }
      default: break;
    }
  }

  /** Thruster wash — a downdraught of dust and hot exhaust. */
  _thrusters(dt, power) {
    const vfx = this.vfx;
    if (!vfx) return;
    this._acc = (this._acc || 0) + dt * power * 22;
    while (this._acc > 1) {
      this._acc -= 1;
      const s = (this._acc * 977) % 4 | 0;
      const off = NOZZLES[s];
      const p = this._tmp.set(off[0], off[1], off[2]).applyQuaternion(this.root.quaternion).add(this.root.position);
      vfx.motes.emit({
        pos: { x: p.x, y: p.y, z: p.z },
        vel: { x: 0, y: -9, z: 0 },
        color: EXHAUST, t0: vfx.clock, life: 0.34,
        size0: 0.34, size1: 0.06, drag: 1.6, gravity: -3, intensity: 5, fade: 1.2,
      });
    }
  }
}

const HOVER = 17;
const EXHAUST = new THREE.Color(0xff6a30);
const NOZZLES = [[-3.4, -1.2, 2.2], [3.4, -1.2, 2.2], [-3.0, -1.2, -3.4], [3.0, -1.2, -3.4]];

/** Build the hull once: a black wedge with four thruster pods. */
function buildHull() {
  const parts = [];

  // main fuselage — a long flattened wedge
  parts.push(tint(loft(rectCross(0.3, 14), [
    { y: -1.0, sx: 2.2, sz: 5.4 },
    { y: -0.2, sx: 3.1, sz: 7.6 },
    { y: 0.5, sx: 2.9, sz: 7.0 },
    { y: 1.1, sx: 1.7, sz: 4.4 },
  ]), HULL, 0.05));

  // prow: a sharp forward blade
  parts.push(tint(place(loft(rectCross(0.24, 12), [
    { y: 0, sx: 2.6, sz: 1.2 },
    { y: 2.6, sx: 1.5, sz: 0.7 },
    { y: 4.2, sx: 0.5, sz: 0.3 },
  ]), { pos: [0, -0.2, 7.2], rot: [Math.PI / 2, 0, 0] }), HULL_DARK, 0.04));

  // cockpit blister with a red visor band
  parts.push(tint(place(blob(1.05, 0.6, 1.5, 12, 8), { pos: [0, 0.35, 5.2] }), HULL_LIGHT, 0.05));
  parts.push(glow(tint(place(slab(1.7, 0.22, 0.12, 0.04), { pos: [0, 0.45, 6.35] }), 0x2a0806), RED, 2.6));

  // wing pylons and the four thruster pods
  for (const s of [-1, 1]) {
    parts.push(tint(place(slab(3.4, 0.5, 2.0, 0.08), { pos: [3.0 * s, -0.15, 0.6], rot: [0, 0, 0.12 * s] }), HULL, 0.05));
    for (const z of [2.2, -3.4]) {
      const pod = tube([P(0, 0.7, 0), P(0, -0.2, 0), P(0, -1.1, 0)], [0.85, 0.95, 0.72], { radialSeg: 10 });
      parts.push(tint(place(pod, { pos: [3.2 * s, -0.6, z] }), HULL_DARK, 0.05));
      const ring = tube([P(0, -1.05, 0), P(0, -1.22, 0)], [0.62, 0.5], { radialSeg: 10 });
      parts.push(glow(tint(place(ring, { pos: [3.2 * s, -0.6, z] }), 0x201008), 0xff5a20, 3.2));
    }
  }

  // tail fins
  for (const s of [-1, 1]) {
    parts.push(tint(place(slab(0.16, 2.4, 2.2, 0.06), { pos: [2.0 * s, 0.9, -4.4], rot: [0.3, 0, 0.35 * s] }), HULL, 0.04));
  }
  // belly bay doors, cracked open
  parts.push(tint(place(slab(3.0, 0.12, 4.6, 0.04), { pos: [0, -1.14, 0.2] }), HULL_DARK, 0.03));
  // running lights
  for (const s of [-1, 1]) {
    parts.push(glow(tint(place(spike(0.12, 0.24, 6), { pos: [4.3 * s, -0.1, 0.6], rot: [0, 0, Math.PI / 2 * s] }), 0x1a0604), RED, 3.0));
  }

  const geo = merge(parts);
  const mat = enableVertexEmissive(new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.62, metalness: 0.75,
    normalMap: metalNormal(), roughnessMap: metalRoughness(),
  }));
  mat.normalScale = new THREE.Vector2(0.6, 0.6);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

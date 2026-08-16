import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { normalFromHeight, makeDataMap } from '../../util/TextureGen.js';
import { Noise } from '../../util/Noise.js';

/**
 * Shared enemy behaviour: aggro, approach, telegraph, attack, flinch, death,
 * plus the hit/poise model the combat system drives.
 *
 * Subclasses supply `buildPrototype()` (geometry + rig, built once per type
 * and instanced via skeleton cloning) and `pose(state, phase, ctx)`.
 */
export class Enemy {
  constructor(type, opts = {}) {
    this.type = type;
    this.id = opts.id ?? 0;
    this.root = new THREE.Group();
    this.velocity = new THREE.Vector3();
    this.heading = opts.heading ?? 0;

    const s = type.stats;
    this.maxHp = opts.maxHp ?? s.hp;
    this.hp = this.maxHp;
    this.maxPoise = s.poise;
    this.poise = this.maxPoise;
    this.speed = s.speed;
    this.attackRange = s.attackRange;
    this.aggroRange = s.aggroRange;
    this.radius = s.radius;
    this.height = s.height;
    this.damage = s.damage;
    this.scale = opts.scale ?? 1;
    this.level = opts.level ?? s.level ?? 12;
    this.name = s.name;

    this.state = 'idle';
    this.stateTime = 0;
    this.phase = 0;              // animation phase, seconds
    this.target = null;
    this.dead = false;
    this.staggered = false;
    this.flinchTime = 0;
    this.attackCooldown = opts.cooldown ?? 1.2;
    this.locked = false;         // player has lock-on
    this.frozenPose = null;      // scenario override
  }

  get position() { return this.root.position; }

  /** Instantiate the shared prototype for this enemy. */
  attachVisual(proto) {
    const group = cloneSkinned(proto.group);
    const byName = new Map(), rest = new Map();
    let mesh = null;
    group.traverse((o) => {
      if (o.isBone) { byName.set(o.name, o); rest.set(o.name, o.quaternion.clone()); }
      if (o.isSkinnedMesh) mesh = o;
    });
    if (mesh) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; }
    this.rig = { byName, rest };
    this.mesh = mesh;
    this.visual = group;
    group.scale.setScalar(this.scale);
    this.root.add(group);
    return group;
  }

  /** Centre of mass in world space — the point VFX and lock-on aim at. */
  centre(out = new THREE.Vector3()) {
    return out.set(this.root.position.x, this.root.position.y + this.height * 0.55 * this.scale, this.root.position.z);
  }

  /**
   * Apply damage. Returns a result the combat system turns into events.
   * @param {number} amount
   * @param {THREE.Vector3} dir world-space direction of the blow
   * @param {object} o {poise, blindside, element}
   */
  hit(amount, dir, o = {}) {
    if (this.dead) return null;
    let dmg = amount;
    if (o.blindside) dmg *= 1.5;
    const weak = this.type.weakness;
    if (weak && o.element === weak) dmg *= 1.6;
    const resist = this.type.resist;
    if (resist && o.element === resist) dmg *= 0.5;
    dmg = Math.round(dmg);
    this.hp -= dmg;

    this.poise -= (o.poise ?? 10);
    let staggered = false;
    if (this.poise <= 0) {
      this.poise = this.maxPoise;
      staggered = true;
      this.setState('stagger');
    } else if (this.state !== 'stagger') {
      this.setState('flinch');
    }
    this.flinchDir = dir ? dir.clone().normalize() : new THREE.Vector3(0, 0, 1);

    if (this.hp <= 0) { this.hp = 0; this.die(); }
    return {
      enemy: this, damage: dmg, staggered, killed: this.dead,
      crit: !!o.blindside, element: o.element || null,
    };
  }

  die() {
    this.dead = true;
    this.setState('death');
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
  }

  /**
   * Simple but readable combat AI: notice, close the distance, telegraph,
   * commit, recover. Telegraphs are deliberately long so hits are dodgeable.
   */
  update(dt, ctx) {
    this.stateTime += dt;
    this.phase += dt;
    if (this.frozenPose) return;

    const target = this.target;
    const dist = target ? this.root.position.distanceTo(target.position) : Infinity;

    switch (this.state) {
      case 'idle':
        if (target && dist < this.aggroRange) this.setState('approach');
        break;
      case 'approach': {
        if (!target) { this.setState('idle'); break; }
        this._face(target.position, dt, 5);
        if (dist > this.attackRange * 0.9) this._advance(dt, target, ctx);
        else if (this.stateTime > this.attackCooldown * 0.35) this.setState('telegraph');
        break;
      }
      case 'telegraph':
        this._face(target ? target.position : null, dt, 2.4);
        if (this.stateTime > this.type.timing.telegraph) this.setState('attack');
        break;
      case 'attack':
        if (!this._swung && this.stateTime > this.type.timing.strike) {
          this._swung = true;
          if (ctx && ctx.onEnemyStrike) ctx.onEnemyStrike(this);
        }
        if (this.stateTime > this.type.timing.attack) { this._swung = false; this.setState('recover'); }
        break;
      case 'recover':
        if (this.stateTime > this.type.timing.recover) this.setState(target ? 'approach' : 'idle');
        break;
      case 'flinch':
        if (this.stateTime > 0.35) this.setState('approach');
        break;
      case 'stagger':
        if (this.stateTime > 2.2) this.setState('approach');
        break;
      case 'death':
        break;
      default: break;
    }

    // terrain follow
    if (ctx && ctx.terrain) {
      this.root.position.y = ctx.terrain.heightAt(this.root.position.x, this.root.position.z);
    }
    this.root.rotation.y = this.heading;
    this.pose(this.state, this.phase, ctx);
  }

  _face(p, dt, k = 6) {
    if (!p) return;
    const want = Math.atan2(p.x - this.root.position.x, p.z - this.root.position.z);
    let d = want - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.heading += d * Math.min(1, k * dt);
  }

  _advance(dt, target, ctx) {
    const sp = this.speed * (this.state === 'approach' ? 1 : 0.4);
    const dx = target.position.x - this.root.position.x;
    const dz = target.position.z - this.root.position.z;
    const l = Math.hypot(dx, dz) || 1;
    this.root.position.x += (dx / l) * sp * dt;
    this.root.position.z += (dz / l) * sp * dt;
    this.velocity.set((dx / l) * sp, 0, (dz / l) * sp);
    // separation from other enemies so a pack doesn't stack up
    if (ctx && ctx.others) {
      for (const o of ctx.others) {
        if (o === this || o.dead) continue;
        const ox = this.root.position.x - o.root.position.x;
        const oz = this.root.position.z - o.root.position.z;
        const d2 = ox * ox + oz * oz;
        const minD = (this.radius + o.radius) * 1.05;
        if (d2 < minD * minD && d2 > 1e-4) {
          const d = Math.sqrt(d2), push = (minD - d) * 2.4 * dt;
          this.root.position.x += (ox / d) * push;
          this.root.position.z += (oz / d) * push;
        }
      }
    }
  }

  /** Subclasses override. */
  pose() {}

  /** Force a specific pose/phase and stop the AI (screenshot scenarios). */
  freeze(state, phase, ctx) {
    this.frozenPose = { state, phase };
    this.state = state;
    this.phase = phase;
    this.root.rotation.y = this.heading;
    this.pose(state, phase, ctx);
  }

  unfreeze() { this.frozenPose = null; }
}

/* ------------------------------------------------------------ textures */

let _organic = null, _metal = null, _organicRough = null, _metalRough = null;
const texNoise = new Noise(777);

/** Hide / scale detail normal map shared by the organic enemies. */
export function organicNormal() {
  if (!_organic) {
    _organic = normalFromHeight(256, (u, v) => {
      const w = texNoise.warped2(u * 9, v * 9, 1.1, 4);
      const cell = texNoise.worley2(u * 16, v * 16).f1;
      return w * 0.5 + (1 - cell) * 0.35;
    }, 1.6, { repeat: 3 });
    _organic.wrapS = _organic.wrapT = THREE.RepeatWrapping;
  }
  return _organic;
}

export function organicRoughness() {
  if (!_organicRough) {
    _organicRough = makeDataMap(128, (u, v) => 0.55 + 0.4 * (texNoise.fbm2(u * 11, v * 11, 4) * 0.5 + 0.5), { repeat: 3 });
    _organicRough.wrapS = _organicRough.wrapT = THREE.RepeatWrapping;
  }
  return _organicRough;
}

/** Brushed / panelled metal detail for magitek and iron constructs. */
export function metalNormal() {
  if (!_metal) {
    _metal = normalFromHeight(256, (u, v) => {
      // fine hammered/brushed surface with only a hint of panel seams
      const grain = texNoise.fbm2(u * 26, v * 26, 4) * 0.35;
      const brush = texNoise.fbm2(u * 90, v * 9, 3) * 0.12;
      const seamU = 1 - Math.pow(Math.max(0, 1 - Math.abs((u * 3) % 1 - 0.5) * 26), 3) * 0.5;
      return (grain + brush) * seamU;
    }, 0.9, { repeat: 2 });
    _metal.wrapS = _metal.wrapT = THREE.RepeatWrapping;
  }
  return _metal;
}

export function metalRoughness() {
  if (!_metalRough) {
    _metalRough = makeDataMap(128, (u, v) => {
      const n = texNoise.fbm2(u * 14, v * 14, 4) * 0.5 + 0.5;
      const wear = Math.max(0, texNoise.warped2(u * 5, v * 5, 1.4, 3));
      return 0.34 + 0.38 * n + 0.24 * wear;
    }, { repeat: 2 });
    _metalRough.wrapS = _metalRough.wrapT = THREE.RepeatWrapping;
  }
  return _metalRough;
}

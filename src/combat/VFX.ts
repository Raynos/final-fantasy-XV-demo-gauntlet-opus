import * as THREE from 'three';
import { Rng } from '../util/Rng.ts';
import { ParticleSystem } from './ParticleSystem.ts';
import { CrystalShards } from './CrystalShards.ts';
import { TrailPool } from './Trails.ts';
import { PolyBeam, lightningPath } from './Beams.ts';
import { GroundFX } from './GroundFX.ts';
import {
  glowSprite, sparkSprite, smokeSprite, dustSprite, shardSprite, flareSprite,
  ringSprite, scorchDecal, crackDecal, frostDecal,
} from './VfxTextures.ts';
import type { Game } from '../game/Game.ts';
import type { Terrain } from '../world/Terrain.ts';

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();
const V3 = new THREE.Vector3();
const C = new THREE.Color();

/**
 * Combat VFX orchestrator.
 *
 * Owns every particle system, ribbon, beam, ground effect and dynamic light
 * used by combat, plus a shared *effect clock*. Because every effect is
 * authored against an explicit spawn time on that clock, the whole VFX layer
 * can be frozen at an arbitrary instant (`pin`) — which is how the screenshot
 * scenarios show a mid-explosion frame that is identical on every run.
 *
 * Soft particles: a half-resolution depth prepass of the scene (driven from
 * `Director.lateUpdate`, after the camera has settled) feeds every particle
 * shader, so smoke and dust fade out where they meet geometry instead of
 * slicing through it.
 */
/**
 * A callback driven by normalised time on the effect clock: `n` runs 0 -> 1
 * across the effect's life and goes outside that range once it is over, which
 * is how a track tells itself to shut down.
 */
export type TrackFn = (n: number, elapsed: number) => void;

/** One scheduled effect callback. See `VFX.track`. */
interface Track {
  /** Spawn time on the effect clock. */
  t0: number;
  life: number;
  fn: TrackFn;
}

/** One of the eight resident PointLights and what currently owns it. */
interface LightSlot {
  light: THREE.PointLight;
  /** Effect-clock time the slot frees at. Written nowhere; see the handoff. */
  until: number;
  /** A bigger hit steals a smaller one's light. */
  priority: number;
}

/** The three ground decal maps, generated once at boot. */
interface DecalTextures {
  scorch: THREE.DataTexture;
  crack: THREE.DataTexture;
  frost: THREE.DataTexture;
}

/** Where an effect goes off and when, on the effect clock. */
interface EffectAt {
  pos: THREE.Vector3;
  /** Spawn time on the effect clock; `this.clock` when absent. */
  t0?: number;
}

/** Directional spark burst — the bread-and-butter melee impact. */
export interface SparkBurstOpts extends EffectAt {
  dir?: THREE.Vector3;
  count?: number;
  speed?: number;
  /** Half-angle of the emission cone, radians. */
  spread?: number;
  color?: THREE.ColorRepresentation;
  life?: number;
  size?: number;
  gravity?: number;
  intensity?: number;
  stretch?: number;
}

/** Soft glowing motes — magic, crystal light, elemental drift. */
export interface MoteBurstOpts extends EffectAt {
  count?: number;
  speed?: number;
  spread?: number;
  color?: THREE.ColorRepresentation;
  life?: number;
  size?: number;
  gravity?: number;
  dir?: THREE.Vector3;
  intensity?: number;
  turbulence?: number;
  drag?: number;
  /** Gaussian spread of the *spawn point*, metres. */
  jitter?: number;
}

/** Ground dust kicked up by footfalls, landings and shockwaves. */
export interface DustPuffOpts extends EffectAt {
  count?: number;
  radius?: number;
  speed?: number;
  life?: number;
  color?: THREE.ColorRepresentation;
  size?: number;
  /** Multiplier from birth size to death size. */
  grow?: number;
  up?: number;
  intensity?: number;
}

/** Billowing smoke — fire spells, magitek wreckage, daemon miasma. */
export interface SmokePlumeOpts extends EffectAt {
  count?: number;
  speed?: number;
  life?: number;
  color?: THREE.ColorRepresentation;
  size?: number;
  grow?: number;
  rise?: number;
  intensity?: number;
  radius?: number;
  turbulence?: number;
}

/** Fine red mist on a flesh hit. */
export interface BloodMistOpts extends EffectAt {
  dir: THREE.Vector3;
  count?: number;
  speed?: number;
  life?: number;
}

/** Camera-facing anisotropic star. */
export interface FlareOpts extends EffectAt {
  color?: THREE.ColorRepresentation;
  size?: number;
  life?: number;
  intensity?: number;
}

/** Camera-facing expanding pressure ring. */
export interface AirRingOpts extends EffectAt {
  color?: THREE.ColorRepresentation;
  /** Start and end radius, metres. */
  from?: number;
  to?: number;
  life?: number;
  intensity?: number;
  spin?: number;
}

/** A pooled dynamic light. `priority` decides who gets one when all 8 are out. */
export interface FlashOpts extends EffectAt {
  color?: THREE.ColorRepresentation;
  intensity?: number;
  distance?: number;
  life?: number;
  priority?: number;
}

/** The full melee impact: sparks, flare, dust, air ring and a real light. */
export interface ImpactOpts extends EffectAt {
  dir?: THREE.Vector3;
  scale?: number;
  color?: THREE.ColorRepresentation;
  blood?: boolean;
  /** Lay a ground ring too. Needs `terrain`. */
  ring?: boolean;
  terrain?: Terrain | null;
  /** Overrides `color` for the sparks alone. */
  sparkColor?: THREE.ColorRepresentation;
}

/** Expanding ground shockwave + air ring + dust wall. */
export interface ShockwaveOpts extends EffectAt {
  terrain?: Terrain | null;
  radius?: number;
  color?: THREE.ColorRepresentation;
  dust?: boolean;
  intensity?: number;
}

/** Blue crystal shard burst — dematerialisation / rematerialisation. */
export interface CrystalBurstOpts extends EffectAt {
  count?: number;
  speed?: number;
  life?: number;
  size?: number;
  color?: THREE.ColorRepresentation;
  gravity?: number;
  spread?: number;
  dir?: THREE.Vector3;
  stretch?: number;
  drag?: number;
}

/** Short repositioning warp (no strike). */
export interface WarpToOpts {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t0?: number;
  terrain?: Terrain | null;
}

/** Jagged branching arc between two points, with a flash light. */
export interface LightningArcOpts {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t0?: number;
  life?: number;
  color?: THREE.ColorRepresentation;
  width?: number;
  /** How many forks come off the main bolt. */
  branches?: number;
}

export class VFX {
  _tracks!: Track[];
  airRings!: ParticleSystem;
  flares!: ParticleSystem;
  _beamNext!: number;
  _depthSize!: THREE.Vector2;
  _postPatched!: boolean;
  beams!: PolyBeam[];
  clock!: number;
  depthRT!: THREE.WebGLRenderTarget | null;
  dust!: ParticleSystem;
  exposure!: number;
  game!: Game;
  ground!: GroundFX;
  lights!: LightSlot[];
  motes!: ParticleSystem;
  pinned!: number | null;
  rng!: Rng;
  root!: THREE.Group;
  shardSprites!: ParticleSystem;
  shards!: CrystalShards;
  smoke!: ParticleSystem;
  softEnabled!: boolean;
  sparks!: ParticleSystem;
  systems!: ParticleSystem[];
  tex!: DecalTextures;
  trails!: TrailPool;
  usingGtaoDepth!: boolean;
  async init(game: Game) {
    this.game = game;
    this.rng = new Rng(20114);
    this.clock = 0;
    this.pinned = null;
    this._tracks = [];

    this.root = new THREE.Group();
    this.root.name = 'VFX';
    this.root.matrixAutoUpdate = false;
    game.scene.add(this.root);

    // ---- particle systems (one draw call each) -------------------------
    this.sparks = new ParticleSystem({
      name: 'vfx.sparks', capacity: 3600, map: sparkSprite(),
      blending: THREE.AdditiveBlending, softness: 0.35, renderOrder: 26,
    });
    this.motes = new ParticleSystem({
      name: 'vfx.motes', capacity: 3200, map: glowSprite(),
      blending: THREE.AdditiveBlending, softness: 0.6, renderOrder: 25,
    });
    this.flares = new ParticleSystem({
      name: 'vfx.flares', capacity: 256, map: flareSprite(),
      blending: THREE.AdditiveBlending, softness: 0.9, renderOrder: 28,
    });
    this.shardSprites = new ParticleSystem({
      name: 'vfx.shardSprites', capacity: 1400, map: shardSprite(),
      blending: THREE.AdditiveBlending, softness: 0.5, renderOrder: 24,
    });
    this.smoke = new ParticleSystem({
      name: 'vfx.smoke', capacity: 1400, map: smokeSprite(),
      blending: THREE.NormalBlending, fog: true, softness: 1.6, renderOrder: 12,
    });
    this.dust = new ParticleSystem({
      name: 'vfx.dust', capacity: 1600, map: dustSprite(),
      blending: THREE.NormalBlending, fog: true, softness: 1.2, renderOrder: 11,
    });
    this.airRings = new ParticleSystem({
      name: 'vfx.airRings', capacity: 96, map: ringSprite(),
      blending: THREE.AdditiveBlending, softness: 1.4, renderOrder: 27,
    });
    this.systems = [this.smoke, this.dust, this.shardSprites, this.motes,
      this.sparks, this.airRings, this.flares];
    for (const s of this.systems) this.root.add(s.mesh);
    // one global knob for the additive budget: daylight scenes clip fast, and
    // the bloom pass amplifies whatever is left over
    this.exposure = 1;

    // ---- 3D crystal shard swarm ---------------------------------------
    this.shards = new CrystalShards({ capacity: 420 });
    this.root.add(this.shards.mesh);

    // ---- ribbons & beams ----------------------------------------------
    this.trails = new TrailPool(this.root, 8, { segments: 30 });
    this.beams = [];
    for (let i = 0; i < 6; i++) {
      const b = new PolyBeam({ segments: 48 });
      this.root.add(b.mesh);
      this.beams.push(b);
    }
    this._beamNext = 0;

    // ---- terrain-conforming ground effects ----------------------------
    this.ground = new GroundFX(this.root, { rings: 6, decals: 12 });
    this.tex = {
      scorch: scorchDecal(), crack: crackDecal(), frost: frostDecal(),
    };

    // ---- dynamic light budget: exactly 8, always resident so the shader
    //      program never has to be recompiled mid-fight ------------------
    this.lights = [];
    for (let i = 0; i < 8; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 14, 2);
      l.castShadow = false;
      l.visible = false;
      this.root.add(l);
      this.lights.push({ light: l, until: -1, priority: 0 });
    }

    this.setExposure(0.40);
    this._initDepth(game);
  }

  /** Scale every additive/alpha particle system at once (0..1+). */
  setExposure(v: number) {
    this.exposure = v;
    for (const s of this.systems) {
      s.uniforms.uGlobal.value = s.useFog ? Math.min(1, v * 1.7) : v;
    }
    if (this.beams) for (const b of this.beams) b.uniforms.uGlobal.value = v;
    if (this.trails) for (const t of this.trails.items) t.uniforms.uGlobal.value = Math.min(1, v * 1.6);
  }

  /* ------------------------------------------------------------ clock */

  /** Freeze the effect clock at `t` (screenshot scenarios). */
  pin(t: number) { this.pinned = t; this.clock = t; this._sync(); }
  /** Resume real-time playback. */
  unpin() { this.pinned = null; }

  _sync() {
    for (const s of this.systems) s.setClock(this.clock);
    this.shards.setClock(this.clock);
    for (const b of this.beams) b.setClock(this.clock);
  }

  /**
   * Schedule a callback driven by normalised time on the effect clock.
   * Survives freezing, which is what lets a pinned frame show a beam at 70%
   * of its fade and a light at 40% of its falloff simultaneously.
   */
  track(t0: number, life: number, fn: TrackFn) { this._tracks.push({ t0, life, fn }); }

  /* ------------------------------------------------------- primitives */

  /**
   * Directional spark burst — the bread-and-butter melee impact.
   * @param o {pos, dir, count, speed, spread, color, life, t0, size}
   */
  sparkBurst({
    pos, dir = V2.set(0, 1, 0), count = 26, speed = 9, spread = 0.85,
    color = 0xffd48a, life = 0.42, t0 = this.clock, size = 0.10, gravity = -14,
    intensity = 4.0, stretch = 0.05,
  }: SparkBurstOpts) {
    const rng = this.rng;
    C.set(color);
    const d = V.copy(dir).normalize();
    for (let i = 0; i < count; i++) {
      const v = randomCone(rng, d, spread, V3).multiplyScalar(speed * (0.35 + rng.next() * rng.next() * 1.4));
      this.sparks.emit({
        pos, vel: v, color: C, t0: t0 + rng.next() * 0.03,
        life: life * (0.45 + rng.next() * 0.85), size0: size * (0.6 + rng.next()),
        size1: size * 0.15, drag: 1.6, gravity, stretch, intensity, fade: 1.1,
      });
    }
  }

  /** Soft glowing motes — magic, crystal light, fireflies, elemental drift. */
  moteBurst({
    pos, count = 20, speed = 1.6, spread = Math.PI, color = 0x66ccff,
    life = 1.1, t0 = this.clock, size = 0.22, gravity = 0.8, dir = V2.set(0, 1, 0),
    intensity = 3.2, turbulence = 0.35, drag = 1.4, jitter = 0,
  }: MoteBurstOpts) {
    const rng = this.rng;
    C.set(color);
    const d = V.copy(dir).normalize();
    for (let i = 0; i < count; i++) {
      const v = randomCone(rng, d, spread, V3).multiplyScalar(speed * (0.3 + rng.next()));
      const p = jitter
        ? V2.set(pos.x + rng.gauss(0, jitter), pos.y + rng.gauss(0, jitter), pos.z + rng.gauss(0, jitter))
        : pos;
      this.motes.emit({
        pos: p, vel: v, color: C, t0: t0 + rng.next() * 0.05,
        life: life * (0.55 + rng.next() * 0.9), size0: size * (0.5 + rng.next()),
        size1: size * 0.05, drag, gravity, turbulence,
        spin: rng.next() * 6.28, spinRate: rng.gauss(0, 2),
        intensity, fade: 1.6,
      });
    }
  }

  /** Ground dust kicked up by footfalls, landings and shockwaves. */
  dustPuff({
    pos, count = 22, radius = 0.5, speed = 2.4, life = 1.5, t0 = this.clock,
    color = 0xbfae95, size = 0.9, grow = 3.2, up = 0.5, intensity = 0.85,
  }: DustPuffOpts) {
    const rng = this.rng;
    C.set(color);
    for (let i = 0; i < count; i++) {
      const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * radius;
      V.set(pos.x + Math.cos(a) * r, pos.y + rng.next() * 0.25, pos.z + Math.sin(a) * r);
      V3.set(Math.cos(a) * speed * (0.4 + rng.next()), up * (0.3 + rng.next()), Math.sin(a) * speed * (0.4 + rng.next()));
      this.dust.emit({
        pos: V, vel: V3, color: C, t0: t0 + rng.next() * 0.08,
        life: life * (0.6 + rng.next() * 0.8), size0: size * (0.5 + rng.next() * 0.6),
        size1: size * grow, drag: 2.4, gravity: -0.35, turbulence: 0.22,
        spin: rng.next() * 6.28, spinRate: rng.gauss(0, 0.8), intensity, fade: 2.2,
      });
    }
  }

  /** Billowing smoke — fire spells, magitek wreckage, daemon miasma. */
  smokePlume({
    pos, count = 16, speed = 1.4, life = 3.0, t0 = this.clock,
    color = 0x2a2a30, size = 0.7, grow = 3.4, rise = 1.6, intensity = 0.6,
    radius = 0.4, turbulence = 0.45,
  }: SmokePlumeOpts) {
    const rng = this.rng;
    C.set(color);
    for (let i = 0; i < count; i++) {
      const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * radius;
      V.set(pos.x + Math.cos(a) * r, pos.y + rng.next() * 0.3, pos.z + Math.sin(a) * r);
      V3.set(Math.cos(a) * speed * rng.next(), rise * (0.5 + rng.next()), Math.sin(a) * speed * rng.next());
      this.smoke.emit({
        pos: V, vel: V3, color: C, t0: t0 + rng.next() * 0.35,
        life: life * (0.6 + rng.next() * 0.8), size0: size * (0.6 + rng.next() * 0.7),
        size1: size * grow, drag: 1.0, gravity: 0.25, turbulence,
        spin: rng.next() * 6.28, spinRate: rng.gauss(0, 0.5), intensity, fade: 1.9,
      });
    }
  }

  /** Fine red mist on a flesh hit. */
  bloodMist({ pos, dir, count = 14, t0 = this.clock, speed = 3.2, life = 0.8 }: BloodMistOpts) {
    const rng = this.rng;
    C.set(0x5a0d10);
    const d = V.copy(dir).normalize();
    for (let i = 0; i < count; i++) {
      const v = randomCone(rng, d, 0.9, V3).multiplyScalar(speed * (0.3 + rng.next()));
      this.smoke.emit({
        pos, vel: v, color: C, t0: t0 + rng.next() * 0.04,
        life: life * (0.5 + rng.next()), size0: 0.10 + rng.next() * 0.12,
        size1: 0.55, drag: 3.2, gravity: -4.5, turbulence: 0.2,
        spin: rng.next() * 6.28, spinRate: rng.gauss(0, 3), intensity: 0.9, fade: 1.5,
      });
    }
  }

  /** Camera-facing anisotropic star — put one at every heavy impact. */
  flare({ pos, color = 0xbfe8ff, size = 1.4, life = 0.30, t0 = this.clock, intensity = 3 }: FlareOpts) {
    C.set(color);
    this.flares.emit({
      pos, vel: V.set(0, 0, 0), color: C, t0, life,
      size0: size * 0.25, size1: size, drag: 0, gravity: 0,
      spin: 0, spinRate: 0.6, intensity, fade: 2.6,
    });
  }

  /**
   * Camera-facing expanding pressure ring. This is the shape that sells an
   * impact as an *event in the air* rather than a bright dot — it reads at a
   * glance even when the core is blown out.
   */
  airRing({ pos, color = 0xbfe8ff, from = 0.4, to = 6, life = 0.45, t0 = this.clock, intensity = 2.2, spin = 0 }: AirRingOpts) {
    C.set(color);
    this.airRings.emit({
      pos, vel: V.set(0, 0, 0), color: C, t0, life,
      size0: from, size1: to, drag: 0, gravity: 0,
      spin, spinRate: 0, intensity, fade: 2.0,
    });
  }

  /* ----------------------------------------------------------- lights */

  /**
   * Fire a pooled dynamic PointLight. Hard budget of 8; the lowest-priority
   * light is stolen when the pool is full so a big hit always lights the world.
   */
  flash({ pos, color = 0xffd08a, intensity = 40, distance = 12, life = 0.25, t0 = this.clock, priority = 1 }: FlashOpts) {
    let slot = this.lights.find((s) => !s.light.visible);
    if (!slot) {
      slot = this.lights.reduce((a, b) => (b.priority < a.priority ? b : a));
      if (slot.priority > priority) return null;
    }
    const l = slot.light;
    l.color.set(color);
    l.distance = distance;
    l.position.copy(pos);
    l.visible = true;
    l.intensity = 0;
    slot.priority = priority;
    this.track(t0, life, (n: number) => {
      if (n < 0 || n > 1) { l.visible = false; l.intensity = 0; slot.priority = 0; return; }
      l.visible = true;
      // sharp attack, exponential decay — reads as a real muzzle/impact flash
      const env = Math.min(1, n / 0.06) * Math.pow(1 - n, 2.2);
      l.intensity = intensity * env;
    });
    return l;
  }

  /* ----------------------------------------------- composite effects */

  /**
   * Full melee impact: sparks along the hit normal, a hot flare, dust,
   * a distortion-ish ring and a real light contribution.
   * @param o {pos, dir, scale, color, t0, blood, ground, terrain}
   */
  impact({
    pos, dir = V2.set(0, 1, 0), scale = 1, color = 0xffcf8a, t0 = this.clock,
    blood = false, ring = true, terrain = null, sparkColor,
  }: ImpactOpts) {
    const d = dir.clone().normalize();
    this.sparkBurst({
      pos, dir: d, count: Math.round(30 * scale), speed: 8 * scale,
      color: sparkColor || color, size: 0.10 * scale, t0, intensity: 6.0,
    });
    this.sparkBurst({
      pos, dir: d, count: Math.round(10 * scale), speed: 15 * scale, spread: 0.30,
      color: 0xffffff, size: 0.06 * scale, t0, life: 0.24, intensity: 5.5, stretch: 0.09,
    });
    this.flare({ pos, color, size: 0.95 * scale, life: 0.22 + 0.06 * scale, t0, intensity: 2.6 });
    this.moteBurst({
      pos, count: Math.round(8 * scale), speed: 2.4 * scale, color, life: 0.75,
      t0, size: 0.28 * scale, gravity: 1.4, intensity: 2.4,
    });
    this.dustPuff({
      pos, count: Math.round(10 * scale), radius: 0.35 * scale, speed: 2.6 * scale,
      life: 0.9, t0, size: 0.4 * scale, grow: 3.0, intensity: 0.7,
    });
    if (blood) this.bloodMist({ pos, dir: d, count: Math.round(12 * scale), t0 });
    this.airRing({
      pos, color, from: 0.15 * scale, to: 2.6 * scale, life: 0.26, t0,
      intensity: 1.8, spin: this.rng.next() * 3,
    });
    this.flash({
      pos, color, intensity: 12 * scale * scale, distance: 7 * scale,
      life: 0.20, t0, priority: 1 + scale,
    });
    if (ring && terrain) {
      this.ground.ring({
        pos, terrain, radius: 1.6 * scale, color, life: 0.5,
        intensity: 2.4, opacity: 0.7, age: this.clock - t0,
      });
    }
  }

  /** Expanding ground shockwave + air ring + dust wall. */
  shockwave({ pos, terrain, radius = 5, color = 0x9fd8ff, t0 = this.clock, dust = true, intensity = 3.4 }: ShockwaveOpts) {
    if (terrain) {
      const age = this.clock - t0;
      this.ground.ring({ pos, terrain, radius, color, life: 0.85, intensity, opacity: 1, age });
      this.ground.ring({ pos, terrain, radius: radius * 0.55, color: 0xdff2ff, life: 0.42, intensity: 1.8, opacity: 0.6, thickness: 0.05, age });
    }
    if (dust) {
      this.dustPuff({
        pos, count: 46, radius: radius * 0.28, speed: radius * 2.0, life: 1.9,
        t0, size: 0.9, grow: 3.6, up: 0.7, intensity: 0.9,
      });
    }
  }

  /* ------------------------------------------------------ warp strike */

  /** Blue crystal shard burst — dematerialisation / rematerialisation. */
  crystalBurst({
    pos, count = 34, speed = 6.5, t0 = this.clock, life = 0.7, size = 0.20,
    color = 0x39a7ff, gravity = -6, spread = Math.PI, dir = V2.set(0, 1, 0),
    stretch = 0, drag = 2.2,
  }: CrystalBurstOpts) {
    const rng = this.rng;
    C.set(color);
    const d = V.copy(dir).normalize();
    for (let i = 0; i < count; i++) {
      const v = randomCone(rng, d, spread, V3).multiplyScalar(speed * (0.3 + rng.next() * 1.1));
      this.shards.emit({
        pos, vel: v, axis: { x: rng.gauss(), y: rng.gauss(), z: rng.gauss() },
        color: C, t0: t0 + rng.next() * 0.05, life: life * (0.5 + rng.next() * 0.9),
        size: size * (0.45 + rng.next() * 1.1), spin: rng.gauss(0, 7),
        drag, gravity, stretch, phase: rng.next() * 6.28,
      });
    }
    // sprite shards behind the solid ones adds volume without more geometry
    this.moteBurst({
      pos, count: Math.round(count * 0.6), speed: speed * 0.8, color: 0x8fd8ff,
      life: life * 1.2, t0, size: 0.24, gravity: gravity * 0.4, intensity: 4.0,
      spread, dir: d,
    });
  }

  /** Grab a beam from the pool. */
  acquireBeam() {
    const b = this.beams[this._beamNext];
    this._beamNext = (this._beamNext + 1) % this.beams.length;
    return b;
  }

  /**
   * The signature move. Authors the complete warp-strike timeline against the
   * effect clock: charge, dematerialisation, the dash streak with its shard
   * wake and chromatic dispersion, then the impact shockwave and debris.
   *
   * @param {object} o
   * @returns the time of impact
   */
  warpStrike({ from, to, t0 = this.clock, dash = 0.17, terrain = null, color = 0x3aa9ff, scale = 1 }: { from: THREE.Vector3, to: THREE.Vector3, t0?: number, dash?: number, terrain?: Terrain | null, color?: number, scale?: number }): number {
    const rng = this.rng;
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    dir.normalize();
    const impactT = t0 + dash;
    const origin = from.clone();
    const target = to.clone();

    /* --- charge: motes rushing into the launch point ------------------ */
    for (let i = 0; i < 26; i++) {
      const a = rng.next() * Math.PI * 2, r = 1.4 + rng.next() * 1.6;
      const el = rng.range(-0.4, 1.2);
      V.set(origin.x + Math.cos(a) * r, origin.y + el, origin.z + Math.sin(a) * r);
      V3.subVectors(origin, V).multiplyScalar(2.6);
      this.motes.emit({
        pos: V, vel: V3, color: C.set(0x62c8ff), t0: t0 - 0.34 + rng.next() * 0.16,
        life: 0.36, size0: 0.05, size1: 0.20, drag: -0.6, gravity: 0,
        intensity: 4.5, fade: 0.5,
      });
    }

    /* --- dematerialisation at the launch point ------------------------ */
    this.crystalBurst({
      pos: origin, count: 30, speed: 5.2, t0, life: 0.65, size: 0.135 * scale,
      color, gravity: -7, drag: 2.6,
    });
    this.flare({ pos: origin, color: 0x8fd8ff, size: 1.5 * scale, life: 0.30, t0, intensity: 2.4 });
    this.flash({ pos: origin, color: 0x53b6ff, intensity: 16, distance: 10, life: 0.34, t0, priority: 2 });
    if (terrain) {
      this.ground.ring({ pos: origin, terrain, radius: 1.9 * scale, color: 0x2f8fe0, life: 0.7, intensity: 0.7, opacity: 0.5, age: this.clock - t0 });
      this.ground.pool({ pos: origin, terrain, size: 3.6 * scale, color: 0x2f8fe0, life: 0.9, intensity: 0.9, opacity: 0.6, age: this.clock - t0 });
    }
    // vertical light column collapsing into the launch point
    const column = this.acquireBeam();
    column.uniforms.uHead.value.set(0xdff2ff);
    column.uniforms.uTail.value.set(0x1c5fbf);
    column.uniforms.uTaper.value = 0.4;
    column.uniforms.uFalloff.value = 0.25;
    column.uniforms.uWobble.value = 0.05;
    column.uniforms.uIntensity.value = 0.9;
    column.width = 0.22 * scale;
    column.setLine(
      V.copy(origin).setY(origin.y - 0.2),
      V2.copy(origin).setY(origin.y + 2.6 * scale)
    );
    this.track(t0 - 0.22, 0.5, (n: number) => {
      column.strength = n < 0 || n > 1 ? 0 : Math.min(1, n / 0.2) * Math.pow(1 - n, 1.6) * 1.4;
      column.uniforms.uWidth.value = 0.22 * scale * (1 - n * 0.75);
    });

    /* --- the dash streak ---------------------------------------------- */
    const streak = this.acquireBeam();
    streak.uniforms.uHead.value.set(0x63b8ff);
    streak.uniforms.uTail.value.set(0x0d3080);
    streak.uniforms.uCore.value.set(0xbfe4ff);
    streak.uniforms.uTaper.value = 0.95;
    streak.uniforms.uHeadBulge.value = 0.95;
    streak.uniforms.uFalloff.value = 0.42;
    streak.uniforms.uIntensity.value = 1.35;
    streak.uniforms.uWobble.value = 0.10 * scale;
    streak.uniforms.uChroma.value = 0.055;
    streak.uniforms.uScroll.value = 2.4;
    streak.width = 1.25 * scale;
    streak.setLine(origin, target);
    this.track(t0, dash + 0.44, (n: number) => {
      if (n < 0 || n > 1) { streak.strength = 0; return; }
      const grow = Math.min(1, n / (dash / (dash + 0.44)));   // reaches full length at impact
      const fade = n <= grow ? 1 : Math.pow(1 - (n - 0.28) / 0.72, 1.8);
      streak.strength = Math.max(0, Math.min(1.35, fade * 1.35));
      streak.uniforms.uWidth.value = 1.25 * scale * (0.55 + 0.75 * (1 - n));
      // the streak "retracts" toward the impact as it dissipates
      V.lerpVectors(origin, target, Math.max(0, (n - 0.45) * 0.55));
      streak.setLine(V, target);
    });

    // wider soft halo around the streak (two-layer beams read as volume)
    const halo = this.acquireBeam();
    halo.uniforms.uHead.value.set(0x53a8ff);
    halo.uniforms.uTail.value.set(0x0d2a6e);
    halo.uniforms.uCore.value.set(0x0a1a44);
    halo.uniforms.uTaper.value = 0.55;
    halo.uniforms.uFalloff.value = 0.6;
    halo.uniforms.uIntensity.value = 0.30;
    halo.uniforms.uWobble.value = 0.22 * scale;
    halo.uniforms.uScroll.value = 1.1;
    halo.width = 1.05 * scale;
    halo.setLine(origin, target);
    this.track(t0, dash + 0.5, (n: number) => {
      halo.strength = n < 0 || n > 1 ? 0 : Math.min(1, n / 0.15) * Math.pow(1 - n, 1.5) * 0.6;
      halo.uniforms.uWidth.value = 1.05 * scale * (0.5 + 1.1 * n);
    });

    /* --- shard wake + speed lines along the dash ---------------------- */
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const rx = new THREE.Vector3().crossVectors(dir, up).normalize();
    const ry = new THREE.Vector3().crossVectors(dir, rx).normalize();
    for (let i = 0; i < 58; i++) {
      const f = rng.next();
      const spread = 0.14 + f * 0.45 * scale;
      V.copy(origin).addScaledVector(dir, dist * f)
        .addScaledVector(rx, rng.gauss(0, spread))
        .addScaledVector(ry, rng.gauss(0, spread));
      // shed sideways and lag behind the dash
      V3.copy(dir).multiplyScalar(-1.6 - rng.next() * 3.5)
        .addScaledVector(rx, rng.gauss(0, 2.4))
        .addScaledVector(ry, rng.gauss(0, 2.4));
      this.shards.emit({
        pos: V, vel: V3, axis: { x: rng.gauss(), y: rng.gauss(), z: rng.gauss() },
        color: C.set(color), t0: t0 + dash * f * 0.9, life: 0.42 + rng.next() * 0.55,
        size: (0.07 + rng.next() * 0.15) * scale, spin: rng.gauss(0, 9),
        drag: 1.6, gravity: -5.5, stretch: rng.next() < 0.45 ? 1.8 : 0, phase: rng.next() * 6.28,
      });
    }
    // stretched speed-line sparks riding the dash direction
    for (let i = 0; i < 70; i++) {
      const f = rng.next();
      V.copy(origin).addScaledVector(dir, dist * f)
        .addScaledVector(rx, rng.gauss(0, 0.32 * scale))
        .addScaledVector(ry, rng.gauss(0, 0.32 * scale));
      V3.copy(dir).multiplyScalar(14 + rng.next() * 26);
      this.sparks.emit({
        pos: V, vel: V3, color: C.set(0xbfe6ff), t0: t0 + dash * f,
        life: 0.16 + rng.next() * 0.2, size0: 0.055 * scale, size1: 0.01,
        drag: 5.5, gravity: 0, stretch: 0.16, intensity: 4.2, fade: 1.0,
      });
    }
    // soft blue haze marking the corridor the warp tore through
    for (let i = 0; i < 26; i++) {
      const f = rng.next();
      V.copy(origin).addScaledVector(dir, dist * f)
        .addScaledVector(rx, rng.gauss(0, 0.55 * scale))
        .addScaledVector(ry, rng.gauss(0, 0.55 * scale));
      V3.copy(rx).multiplyScalar(rng.gauss(0, 0.8)).addScaledVector(ry, rng.gauss(0, 0.8));
      this.motes.emit({
        pos: V, vel: V3, color: C.set(0x1d5aa8), t0: t0 + dash * f,
        life: 0.5 + rng.next() * 0.7, size0: 0.35 * scale, size1: 1.1 * scale,
        drag: 1.4, gravity: 0.4, turbulence: 0.3, intensity: 0.5, fade: 2.4,
      });
    }

    /* --- impact -------------------------------------------------------- */
    const back = dir.clone().multiplyScalar(-1);
    this.sparkBurst({
      pos: target, dir: back, count: 76, speed: 15, spread: 1.25, color: 0x9fdcff,
      size: 0.11 * scale, t0: impactT, life: 0.5, intensity: 5.0, stretch: 0.07,
    });
    this.sparkBurst({
      pos: target, dir: back, count: 30, speed: 26, spread: 0.5, color: 0xe8f6ff,
      size: 0.075 * scale, t0: impactT, life: 0.3, intensity: 6.5, stretch: 0.12,
    });
    // Two shells rather than one big one: a fast, small, velocity-stretched
    // spray that reads as the dash arriving, and a slower shower behind it.
    // The single 58 x 0.21 m burst this replaces put third-of-a-metre shards
    // a couple of metres from the lens for a full second — the "flat blue
    // confetti at close range" of WS-11, and no shard shape survives being
    // that big in frame.
    this.crystalBurst({
      pos: target, count: 34, speed: 13.0, t0: impactT, life: 0.42,
      size: 0.12 * scale, color, gravity: -9, drag: 2.4,
      spread: 1.35, dir: back, stretch: 2.4,
    });
    this.crystalBurst({
      pos: target, count: 30, speed: 8.0, t0: impactT + 0.03, life: 0.72,
      size: 0.135 * scale, color, gravity: -11, drag: 1.5,
      spread: 1.6, dir: back,
    });
    this.flare({ pos: target, color: 0xd8f0ff, size: 3.2 * scale, life: 0.30, t0: impactT, intensity: 1.35 });
    this.flare({ pos: target, color: 0xffffff, size: 0.85 * scale, life: 0.22, t0: impactT, intensity: 2.4 });
    this.flare({ pos: target, color: 0x2b7fd8, size: 2.2 * scale, life: 0.55, t0: impactT, intensity: 0.35 });
    this.airRing({ pos: target, color: 0x7fc8ff, from: 1.4 * scale, to: 8.0 * scale, life: 0.5, t0: impactT, intensity: 0.55 });
    this.airRing({ pos: target, color: 0x63bcff, from: 0.4 * scale, to: 4.0 * scale, life: 0.32, t0: impactT, intensity: 1.1, spin: 0.9 });
    this.dustPuff({
      pos: target, count: 20, radius: 0.7 * scale, speed: 6.5, life: 1.6,
      t0: impactT, size: 0.5, grow: 2.6, up: 1.4, intensity: 0.32, color: 0x8d8271,
    });
    this.flash({
      pos: target, color: 0x7fd0ff, intensity: 42 * scale, distance: 22 * scale,
      life: 0.42, t0: impactT, priority: 9,
    });
    if (terrain) {
      const gp = target.clone();
      gp.y = terrain.heightAt(gp.x, gp.z);
      this.shockwave({ pos: gp, terrain, radius: 6.5 * scale, color: 0x5fb0e8, t0: impactT, intensity: 1.1, dust: false });
      this.ground.decal({
        pos: gp, terrain, size: 4.6 * scale, map: this.tex.crack,
        color: 0x1a2026, opacity: 0.85, life: 30, rotate: rng.next() * 6.28,
        age: this.clock - impactT,
      });
    }
    // falling shard debris settling after the hit
    for (let i = 0; i < 34; i++) {
      const a = rng.next() * Math.PI * 2;
      V.copy(target).add(V3.set(Math.cos(a) * rng.next() * 1.2, rng.range(-0.5, 1.2), Math.sin(a) * rng.next() * 1.2));
      V3.set(Math.cos(a) * rng.range(1, 5), rng.range(1.5, 6.5), Math.sin(a) * rng.range(1, 5));
      this.shards.emit({
        pos: V, vel: V3, axis: { x: rng.gauss(), y: rng.gauss(), z: rng.gauss() },
        color: C.set(0x63c0ff), t0: impactT + rng.next() * 0.08,
        life: 0.7 + rng.next() * 0.7, size: (0.045 + rng.next() * 0.085) * scale,
        spin: rng.gauss(0, 6), drag: 0.6, gravity: -13, phase: rng.next() * 6.28,
      });
    }

    return impactT;
  }

  /** Short repositioning warp (no strike). */
  warpTo({ from, to, t0 = this.clock, terrain = null }: WarpToOpts) {
    this.crystalBurst({ pos: from, count: 18, speed: 4.5, t0, life: 0.5, size: 0.2 });
    const b = this.acquireBeam();
    b.uniforms.uTaper.value = 0.8;
    b.uniforms.uIntensity.value = 2.4;
    b.width = 0.16;
    b.setLine(from, to);
    this.track(t0, 0.32, (n: number) => { b.strength = n < 0 || n > 1 ? 0 : Math.pow(1 - n, 1.4); });
    this.crystalBurst({ pos: to, count: 22, speed: 5, t0: t0 + 0.12, life: 0.6, size: 0.22 });
    this.flash({ pos: to, color: 0x59b8ff, intensity: 30, distance: 9, life: 0.28, t0: t0 + 0.12 });
    if (terrain) this.ground.ring({ pos: to, terrain, radius: 2.0, color: 0x8ed4ff, life: 0.5, age: this.clock - t0 - 0.12 });
  }

  /* ---------------------------------------------------------- decals */

  scorch(pos: THREE.Vector3, size = 3, terrain = this.game.get('Terrain')) {
    return this.ground.decal({ pos, terrain, size, map: this.tex.scorch, color: 0xffffff, opacity: 0.95, life: 40, rotate: this.rng.next() * 6.28 });
  }

  crack(pos: THREE.Vector3, size = 3.5, terrain = this.game.get('Terrain')) {
    return this.ground.decal({ pos, terrain, size, map: this.tex.crack, color: 0x1b2026, opacity: 0.9, life: 40, rotate: this.rng.next() * 6.28 });
  }

  frost(pos: THREE.Vector3, size = 4, terrain = this.game.get('Terrain')) {
    return this.ground.decal({ pos, terrain, size, map: this.tex.frost, color: 0xbfe6ff, opacity: 0.85, life: 22, rotate: this.rng.next() * 6.28, intensity: 1.6 });
  }

  /* ------------------------------------------------------- lightning */

  /** Jagged branching arc between two points, with a flash light. */
  lightningArc({ from, to, t0 = this.clock, life = 0.20, color = 0xc0d8ff, width = 0.10, branches = 2 }: LightningArcOpts) {
    const main = this.acquireBeam();
    main.uniforms.uHead.value.set(color);
    main.uniforms.uTail.value.set(color);
    main.uniforms.uCore.value.set(0xffffff);
    main.uniforms.uTaper.value = 0.0;
    main.uniforms.uFalloff.value = 0.0;
    main.uniforms.uIntensity.value = 4.0;
    main.uniforms.uWobble.value = 0;
    main.width = width;
    main.setPath(lightningPath(from, to, this.rng, { jitter: 1.0, points: 16 }));
    this.track(t0, life, (n: number) => {
      if (n < 0 || n > 1) { main.strength = 0; return; }
      // strobe: three sharp flickers over the life
      main.strength = (0.35 + 0.65 * Math.abs(Math.sin(n * 11.0))) * (1 - n * 0.4);
    });
    for (let i = 0; i < branches; i++) {
      const b = this.acquireBeam();
      b.uniforms.uHead.value.set(color);
      b.uniforms.uTail.value.set(color);
      b.uniforms.uIntensity.value = 3.0;
      b.uniforms.uTaper.value = 0.0;
      b.uniforms.uFalloff.value = 0.0;
      b.width = width * 0.5;
      const f = 0.3 + this.rng.next() * 0.4;
      const mid = V.lerpVectors(from, to, f).clone();
      const end = mid.clone().add(new THREE.Vector3(
        this.rng.gauss(0, 1.6), this.rng.gauss(0, 1.0), this.rng.gauss(0, 1.6)
      ));
      b.setPath(lightningPath(mid, end, this.rng, { jitter: 1.4, points: 8 }));
      this.track(t0, life * 0.7, (n: number) => {
        b.strength = n < 0 || n > 1 ? 0 : (0.3 + 0.7 * Math.abs(Math.sin(n * 14))) * (1 - n);
      });
    }
    this.flash({ pos: to, color: 0x9fc4ff, intensity: 34, distance: 16, life: 0.22, t0, priority: 4 });
  }

  /* ----------------------------------------------------------- depth */

  _initDepth(game: Game) {
    this.softEnabled = game.rnd.quality !== 'low';
    if (!this.softEnabled) return;
    const size = game.renderer.getDrawingBufferSize(new THREE.Vector2());
    this._makeDepthRT(Math.max(2, Math.floor(size.x * 0.5)), Math.max(2, Math.floor(size.y * 0.5)));
  }

  /**
   * Hook the post chain. Two things happen here:
   *
   *  1. The GTAO pass renders the scene into a normal+depth G-buffer with an
   *     override material. Additive VFX must be *excluded* from that or every
   *     spark punches a black ambient-occlusion hole into the frame behind it.
   *  2. That same G-buffer is already a full-resolution scene depth texture,
   *     so we borrow it for soft particles instead of paying for our own
   *     prepass — one frame of latency, invisible in motion and exact once a
   *     screenshot has settled.
   */
  attachPost(game: Game) {
    if (this._postPatched || !game.post) return;
    const gtao = game.post.gtao;
    if (!gtao) return;
    this._postPatched = true;
    const root = this.root;
    const original = gtao.render.bind(gtao);
    gtao.render = (...args: Parameters<typeof original>) => {
      const was = root.visible;
      root.visible = false;
      try { original(...args); } finally { root.visible = was; }
    };
    if (gtao.depthTexture) {
      this.usingGtaoDepth = true;
      for (const s of this.systems) s.setDepth(gtao.depthTexture, game.camera.near, game.camera.far);
      if (this.depthRT) { this.depthRT.dispose(); this.depthRT = null; }
    }
  }

  _makeDepthRT(w: number, h: number) {
    if (this.depthRT) this.depthRT.dispose();
    const dt = new THREE.DepthTexture(w, h);
    dt.format = THREE.DepthFormat;
    dt.type = THREE.UnsignedIntType;
    dt.minFilter = THREE.NearestFilter;
    dt.magFilter = THREE.NearestFilter;
    this.depthRT = new THREE.WebGLRenderTarget(w, h, {
      depthTexture: dt, depthBuffer: true, stencilBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    this._depthSize = new THREE.Vector2(w, h);
    for (const s of this.systems) s.setDepth(dt, 0.15, 6000);
  }

  /**
   * Half-resolution depth prepass. Called from `Director.lateUpdate` — the
   * last lateUpdate in the frame — so the camera transform is already final.
   */
  renderDepthPrepass(game: Game) {
    this.attachPost(game);
    if (this.usingGtaoDepth) {
      const cam = game.camera;
      for (const s of this.systems) s.uniforms.uCamNF.value.set(cam.near, cam.far);
      return;
    }
    if (!this.softEnabled || !this.depthRT) return;
    const r = game.renderer;
    const size = r.getDrawingBufferSize(V2D);
    const w = Math.max(2, Math.floor(size.x * 0.5)), h = Math.max(2, Math.floor(size.y * 0.5));
    if (w !== this._depthSize.x || h !== this._depthSize.y) this._makeDepthRT(w, h);

    const cam = game.camera;
    for (const s of this.systems) s.uniforms.uCamNF.value.set(cam.near, cam.far);

    const wasVisible = this.root.visible;
    const wasShadow = r.shadowMap.autoUpdate;
    const prevTarget = r.getRenderTarget();
    this.root.visible = false;              // never occlude ourselves
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.depthRT);
    r.clear(true, true, false);
    r.render(game.scene, cam);
    r.setRenderTarget(prevTarget);
    r.shadowMap.autoUpdate = wasShadow;
    this.root.visible = wasVisible;
  }

  /* ----------------------------------------------------------- frame */

  update(dt: number, game: Game) {
    if (this.pinned === null) this.clock += dt;
    else this.clock = this.pinned;
    const c = this.clock;

    for (const s of this.systems) { s.setClock(c); s.flush(); s.syncFog(game.scene); }
    this.shards.setClock(c); this.shards.flush();
    for (const b of this.beams) b.setClock(c);
    this.trails.update(this.pinned === null ? dt : 0, c);
    this.ground.update(this.pinned === null ? dt : 0, c);

    // evaluate timed tracks
    const keep: Track[] = [];
    for (const t of this._tracks) {
      const n = (c - t.t0) / t.life;
      t.fn(n, c - t.t0);
      if (n <= 1.02 || this.pinned !== null) keep.push(t);
    }
    if (keep.length !== this._tracks.length) this._tracks = keep;
    if (this._tracks.length > 400) this._tracks.splice(0, this._tracks.length - 400);
  }

  /** Drop every live effect (scenario switches). */
  reset() {
    for (const s of this.systems) s.clear();
    this.shards.clear();
    this.trails.clear();
    this.ground.clear();
    for (const b of this.beams) { b.strength = 0; b.hide(); }
    for (const s of this.lights) { s.light.visible = false; s.light.intensity = 0; s.priority = 0; }
    this._tracks.length = 0;
    this.rng = new Rng(20114);
  }
}

const V2D = new THREE.Vector2();

/** Uniformly sample a direction inside a cone of half-angle `spread` about `dir`. */
function randomCone(rng: Rng, dir: THREE.Vector3, spread: number, out: THREE.Vector3) {
  const cosMax = Math.cos(Math.min(Math.PI, spread));
  const z = rng.range(cosMax, 1);
  const s = Math.sqrt(Math.max(0, 1 - z * z));
  const phi = rng.next() * Math.PI * 2;
  // basis around dir
  const up = Math.abs(dir.y) > 0.94 ? UP_X : UP_Y;
  TX.crossVectors(dir, up).normalize();
  TY.crossVectors(dir, TX).normalize();
  return out.copy(dir).multiplyScalar(z)
    .addScaledVector(TX, Math.cos(phi) * s)
    .addScaledVector(TY, Math.sin(phi) * s);
}
const UP_X = new THREE.Vector3(1, 0, 0);
const UP_Y = new THREE.Vector3(0, 1, 0);
const TX = new THREE.Vector3();
const TY = new THREE.Vector3();

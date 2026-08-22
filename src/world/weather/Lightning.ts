import * as THREE from 'three';
import type { Game } from '../../game/Game.ts';

/**
 * Lightning: a deterministic strike schedule, a multi-pulse flash envelope and
 * the thunder that follows it a distance later.
 *
 * The schedule is generated from the world seed and the clock alone, so a
 * capture of the same frame always sees the same strike — no wall-clock, no
 * random walk. A strike does three things at once: a hemisphere light spike so
 * geometry is genuinely re-lit from above, an in-scatter punch through the fog
 * volume, and a delayed thunder crack.
 */
/** One scheduled strike on the storm's deterministic timeline. */
interface Strike {
  /** Seconds on the storm clock. */
  t: number;
  /** Metres away; drives both the flash strength and the thunder delay. */
  dist: number;
  /** 0..1.4 how bright this one is. */
  bias: number;
  /** Set the frame the strike goes off, so its thunder is queued once. */
  fired?: boolean;
}

/** A thunder crack in flight, waiting on the speed of sound. */
interface Thunder {
  /** Storm-clock time it arrives. */
  at: number;
  /** 0..1 */
  vol: number;
  dist: number;
}

export class Lightning {
  /** The whole timeline, built once per storm period. */
  _schedule!: Strike[] | null;
  _thunder!: Thunder[];
  color!: THREE.Vector3;
  flash!: number;
  light!: THREE.HemisphereLight;
  seed!: number;
  constructor(seed: number) {
    this.seed = seed >>> 0;
    /** Current flash strength, 0..~1.6. */
    this.flash = 0;
    this.color = new THREE.Vector3(0.62, 0.74, 1.0);
    this.light = new THREE.HemisphereLight(0xcfe0ff, 0x8fa4c8, 0);
    this.light.name = 'lightning';
    this._thunder = [];
    this.reset();
  }

  reset() {
    this.flash = 0;
    this._schedule = null;
    this._thunder.length = 0;
    this.light.intensity = 0;
  }

  /** Strike times, in seconds since the clock reset, out to `horizon`. */
  _build(period: number, horizon: number) {
    let s = this.seed;
    const rnd = () => {
      s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
      return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
    };
    const out: Strike[] = [];
    // The first strike lands early on purpose: a storm that has not flashed
    // yet inside the first second of a capture is a storm nobody believes.
    let t = 1.05;
    let first = true;
    while (t < horizon) {
      out.push({
        t,
        // distance drives both the flash strength and the thunder delay
        dist: first ? 700 : 260 + rnd() * 2400,
        bias: first ? 0.85 : 0.55 + rnd() * 0.9,
      });
      first = false;
      t += period * (0.45 + rnd() * 1.5);
    }
    return out;
  }

  /**
   * @param now seconds since the clock reset
   * @param period mean seconds between strikes, 0 = no lightning
   */
  update(dt: number, now: number, period: number, game: Game) {
    if (!this.light.parent && game && game.scene) game.scene.add(this.light);
    if (period <= 0.001) {
      this.flash += (0 - this.flash) * Math.min(1, dt * 6);
      this.light.intensity = this.flash * 0.55;
      return;
    }
    if (!this._schedule) this._schedule = this._build(period, now + 900);

    let f = 0;
    for (const s of this._schedule) {
      const age = now - s.t;
      if (age < 0 || age > 0.9) continue;
      f = Math.max(f, envelope(age, s.bias) * (0.45 + 0.75 * (1 - s.dist / 2700)));
      if (!s.fired) {
        s.fired = true;
        this._thunder.push({ at: now + s.dist / 340, vol: 1 - s.dist / 3400, dist: s.dist });
      }
    }
    this.flash = f;
    // the sky itself becomes the light source for a tenth of a second
    this.light.intensity = f * 1.3;

    if (game) {
      const audio = game.get('AudioSystem');
      for (let i = this._thunder.length - 1; i >= 0; i--) {
        if (now >= this._thunder[i].at) {
          const vol = Math.max(0.15, this._thunder[i].vol);
          if (audio && audio.play) {
            audio.play('thunder', undefined, { volume: vol * 1.4, distance: this._thunder[i].dist });
          }
          this._thunder.splice(i, 1);
        }
      }
    }
  }
}

/**
 * Real lightning is a stroke plus two or three return strokes, which is why it
 * flickers rather than fading smoothly.
 */
function envelope(age: number, bias: number) {
  const pulse = (t0: number, amp: number, decay: number) => {
    const a = age - t0;
    return a < 0 ? 0 : amp * Math.exp(-a * decay);
  };
  return (pulse(0, 1.0, 26) + pulse(0.055, 0.72, 14) + pulse(0.14, 0.85, 9)
    + pulse(0.27, 0.34, 7)) * bias;
}

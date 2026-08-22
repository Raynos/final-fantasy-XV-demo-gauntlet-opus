import * as THREE from 'three';
import { Rain } from './weather/Rain.ts';
import { VolumePass } from './weather/VolumePass.ts';
import { Lightning } from './weather/Lightning.ts';
import { Wetness } from './weather/Wetness.ts';
import type { Game } from '../game/Game.ts';
import type { Terrain } from './Terrain.ts';

const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;

/**
 * Weather presets. Every field is lerped toward its target so a change of
 * weather is a front moving in, not a cut. `Sky` owns the matching lighting /
 * cloud preset; this class only *reads* the sky and never writes to it.
 *
 *   rain      0..1  drop density and splash rate
 *   wind      m/s   base horizontal wind speed (Vegetation reads windStrength)
 *   gust      0..1  how much the gust envelope swings the base
 *   fog       0..1  valley fog density multiplier
 *   fogTop    m     world altitude of the fog ceiling — below it, terrain drowns
 *   dust      0..1  blowing dust sheets hugging the ground
 *   haze      0..1  flat rain haze
 *   squall    0..1  travelling curtains of rain across the basin
 *   scud      0..1  ragged dark cloud blowing under the deck
 *   strike    s     mean seconds between lightning strikes (0 = none)
 *   wet       0..1  how wet the world gets once it has been raining a while
 */
/**
 * One weather preset: what the rain, wind, fog and lightning systems each get
 * from the current conditions. All four presets carry the whole set, so a
 * cross-fade between any two is a straight per-field lerp.
 */
export interface WeatherPreset {
  /** Every field is a number, which is what lets `update` lerp the lot. */
  [field: string]: number;
  /** 0..1 rain intensity. */
  rain: number;
  /** Base wind speed, m/s. */
  wind: number;
  /** 0..1 how gusty on top of that. */
  gust: number;
  /** Ground fog density. */
  fog: number;
  /** Height the fog fades out by, metres. */
  fogTop: number;
  /** 0..1 airborne dust. */
  dust: number;
  haze: number;
  /** 0..1 squall lines driving the rain sideways. */
  squall: number;
  /** 0..1 low scud racing under the deck. */
  scud: number;
  /** Lightning strikes per minute. */
  strike: number;
  /** 0..1 how wet the world gets. */
  wet: number;
}

const PRESETS: Record<WeatherName, WeatherPreset> = {
  clear: {
    rain: 0, wind: 2.4, gust: 0.30, fog: 0.05, fogTop: 16, dust: 0.05,
    haze: 0, squall: 0, scud: 0, strike: 0, wet: 0,
  },
  overcast: {
    rain: 0, wind: 4.2, gust: 0.55, fog: 0.16, fogTop: 26, dust: 0.10,
    haze: 0.02, squall: 0, scud: 0.22, strike: 0, wet: 0.10,
  },
  storm: {
    rain: 1, wind: 16.0, gust: 0.95, fog: 0.26, fogTop: 32, dust: 0.26,
    haze: 0.018, squall: 0.30, scud: 1.0, strike: 6.5, wet: 1,
  },
  fog: {
    rain: 0, wind: 1.1, gust: 0.20, fog: 1.0, fogTop: 44, dust: 0.0,
    haze: 0.01, squall: 0, scud: 0.10, strike: 0, wet: 0.30,
  },
};

/** Dawn adds a cold pool of mist to the low ground whatever the weather is. */
function dawnFogBoost(hours: number) {
  const h = ((hours % 24) + 24) % 24;
  const dawn = Math.max(0, 1 - Math.abs(h - 6.6) / 2.4);
  const dusk = Math.max(0, 1 - Math.abs(h - 20.0) / 1.8);
  return dawn * dawn * 0.75 + dusk * dusk * 0.28;
}

/**
 * Weather: rain, wind, wet surfaces, valley fog, dust and lightning.
 *
 * Public surface used by the rest of the game:
 *   set('clear'|'overcast'|'storm'|'fog')   transition to a preset
 *   windStrength / windDir / windVector     Vegetation reads windStrength
 *   wetness                                 0..1, builds and dries slowly
 *   rainIntensity                           0..1
 */
/** The four weather states, as `Shots.ts` and the `weather` cvar spell them. */
export type WeatherName = 'clear' | 'overcast' | 'storm' | 'fog';

/** The same four, as a value — for anything that has to iterate or validate them. */
export const WEATHER_NAMES = ['clear', 'overcast', 'storm', 'fog'] as const satisfies readonly WeatherName[];

/** For the places a name arrives as an untyped string: a cvar, a URL, a save. */
export const isWeatherName = (v: unknown): v is WeatherName =>
  typeof v === 'string' && (WEATHER_NAMES as readonly string[]).includes(v);

export class Weather {
  _snap!: boolean;
  _camPos!: THREE.Vector3;
  _dustCol!: THREE.Vector3;
  _fogCol!: THREE.Vector3;
  _fogSun!: THREE.Vector3;
  _gust!: number;
  /** `game.currentShot` the weather was last staged for. */
  _shotSeen!: string | null;
  game!: Game;
  lightning!: Lightning;
  name!: WeatherName;
  /** The conditions in force right now, cross-fading toward `target`. */
  p!: WeatherPreset;
  rain!: Rain;
  rainIntensity!: number;
  target!: WeatherPreset;
  terrain!: Terrain | null;
  volume!: VolumePass;
  wet!: Wetness;
  wetness!: number;
  windDir!: number;
  windStrength!: number;
  windVector!: THREE.Vector2;
  constructor() {
    this.name = 'clear';
    this.p = Object.assign({}, PRESETS.clear);
    this.target = Object.assign({}, PRESETS.clear);

    /** Wind heading, radians in the XZ plane. */
    this.windDir = 2.05;
    /** Current wind speed including gusts — Vegetation reads this. */
    this.windStrength = 1.0;
    this.windVector = new THREE.Vector2(1, 0);
    /** 0..1, how wet the world is. Builds while raining, dries slowly after. */
    this.wetness = 0;
    this.rainIntensity = 0;

    this._gust = 0;
    this._camPos = new THREE.Vector3();
    this._fogCol = new THREE.Vector3();
    this._fogSun = new THREE.Vector3();
    this._dustCol = new THREE.Vector3();
  }

  async init(game: import('../game/Game.ts').Game) {
    this.game = game;
    const terrain = game.get('Terrain');
    this.terrain = terrain ?? null;

    const quality = game.rnd && game.rnd.quality === 'low' ? 0.4
      : game.rnd && game.rnd.quality === 'medium' ? 0.7 : 1.0;

    // deterministic drop seeds
    let s = (game.seed || 1337) >>> 0;
    const rand = () => {
      s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
      return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
    };

    const tu = terrain && terrain.res ? terrain.res.uniforms : null;
    this.rain = new Rain({
      scene: game.scene,
      quality,
      terrainUniforms: tu ? {
        uHeightTex: tu.uHeightTex, uFarHeightTex: tu.uFarHeightTex,
        uField: tu.uField, uFarP: tu.uFarP,
      } : {
        uHeightTex: { value: null }, uFarHeightTex: { value: null },
        uField: { value: new THREE.Vector4(1, 1, 1, 1) },
        uFarP: { value: new THREE.Vector4(1, 1, 1, 1) },
      },
    });
    this.rain.build(rand);

    this.lightning = new Lightning(game.seed || 1337);
    // added now, at zero intensity, so every material compiles with it in the
    // light list — adding a light later forces a full shader rebuild mid-game
    game.scene.add(this.lightning.light);
    this.wet = new Wetness(game);

    this._shotSeen = game.currentShot;
    this._snap = true;
  }

  // -------------------------------------------------------------------- API

  /**
   * Move the weather toward a preset. The transition is continuous — call it
   * once and the front rolls in over a few seconds.
   */
  set(name: WeatherName) {
    const preset = PRESETS[name];
    if (!preset) return;
    this.name = name;
    this.target = Object.assign({}, preset);
    const sky = this.game && this.game.get('Sky');
    if (sky && sky.setWeather) sky.setWeather(name);
    const audio = this.game && this.game.get('AudioSystem');
    if (audio && audio.setWeather) audio.setWeather(name);
  }

  /** Jump straight to the target state — used on shot cuts and clock resets. */
  snap() {
    this.p = Object.assign({}, this.target);
    this.wetness = this.target.wet;
    this._gust = 0;
    if (this.lightning) this.lightning.reset();
  }

  resetClock() { this._snap = true; }

  // ----------------------------------------------------------------- update

  update(dt: number, game: Game) {
    // A named shot is a cut to a different world state, not a front rolling
    // in: snap so a capture never lands mid-transition. Sky does the same.
    if (game.currentShot !== this._shotSeen) {
      this._shotSeen = game.currentShot;
      this._snap = true;
    }

    const k = 1 - Math.exp(-dt * 1.6);
    for (const key of Object.keys(this.target)) {
      this.p[key] = this._snap ? this.target[key] : lerp(this.p[key], this.target[key], k);
    }

    // --- wind ---------------------------------------------------------------
    this._gust += dt;
    const g = this.p.gust;
    const gust = 1
      + g * 0.55 * Math.sin(this._gust * 0.83)
      + g * 0.30 * Math.sin(this._gust * 2.17 + 1.7)
      + g * 0.18 * Math.sin(this._gust * 5.31 + 0.4);
    const speed = this.p.wind * gust;
    // Vegetation's contract: 0.4 = still, 2.5 = storm. Map m/s onto that.
    this.windStrength = clamp(0.35 + speed * 0.20, 0.3, 3.4);
    this.windDir += dt * 0.035 * Math.sin(this._gust * 0.19);
    this.windVector.set(Math.cos(this.windDir), Math.sin(this.windDir)).multiplyScalar(speed);

    const veg = game.get('Vegetation');
    if (veg && veg.setWind) veg.setWind(this.windStrength, this.windDir);

    // --- rain / wetness -----------------------------------------------------
    this.rainIntensity = this.p.rain;
    const wetTarget = this.p.wet;
    if (this._snap) {
      this.wetness = wetTarget;
    } else {
      // soaking is fast, drying is slow — puddles outlive the shower
      const tau = wetTarget > this.wetness ? 9.0 : 55.0;
      this.wetness += (wetTarget - this.wetness) * (1 - Math.exp(-dt / tau));
    }

    this._camPos.setFromMatrixPosition(game.camera.matrixWorld);
    const px = (game.camera.fov * Math.PI / 180) / Math.max(1, game.rnd ? game.rnd.height : 900);
    this.rain.update(game.time.now, this._camPos, this.rainIntensity, this.windVector, px);

    // --- lightning ----------------------------------------------------------
    this.lightning.update(dt, game.time.now, this.p.strike, game);

    // --- wet surfaces -------------------------------------------------------
    this.wet.apply(this.wetness, game);

    this._snap = false;
  }

  lateUpdate(dt: number, game: Game) {
    if (!game.post) return;
    if (!this.volume) {
      this.volume = new VolumePass(game.post);
      const tu = this.terrain && this.terrain.res ? this.terrain.res.uniforms : null;
      if (tu) {
        const u = this.volume.material.uniforms;
        u.uHeightTex.value = tu.uHeightTex.value;
        u.uFarHeightTex.value = tu.uFarHeightTex.value;
        u.uField.value.copy(tu.uField.value);
        u.uFarP.value.copy(tu.uFarP.value);
      }
      const idx = game.post.composer.passes.indexOf(game.post.bloom);
      game.post.composer.insertPass(this.volume, idx >= 0 ? idx : 2);
    }
    this._pushVolume(game);
  }

  /** Feed the ray-march from the sky's current lighting state. */
  _pushVolume(game: Game) {
    const sky = game.get('Sky');
    const u = this.volume.material.uniforms;
    const t = game.time.now;

    // Fog colour is the key light plus the sky fill, not a hand-picked grey:
    // it has to sit in the same exposure as everything else in frame.
    let sunI = 1.2, ambI = 0.16;
    const sunCol = new THREE.Color(1, 1, 1);
    const skyCol = new THREE.Color(0.55, 0.65, 0.85);
    let hours = 12;
    if (sky) {
      hours = sky.hours;
      sunI = sky.sun.intensity;
      sunCol.copy(sky.sun.color);
      ambI = sky.ambient.intensity * (sky.u ? sky.u.uSkyDim.value : 1);
      skyCol.copy(sky.ambient.color);
      u.uSunDir.value.copy(sky.sunDir);
    }

    const flash = this.lightning.flash;
    const lit = ambI * 3.4 + sunI * 0.055;
    this._fogCol.set(
      skyCol.r * lit + 0.010, skyCol.g * lit + 0.012, skyCol.b * lit + 0.016
    );
    const fw = 0.11 * sunI;
    this._fogSun.set(sunCol.r * fw, sunCol.g * fw, sunCol.b * fw);
    // dust picks up the ochre of the ground it is torn from — until it is
    // raining, when what blows off the ground is spray, not dust
    const dw = 1 - 0.85 * this.wetness;
    this._dustCol.set(
      (0.86 * dw + 0.62 * (1 - dw)) * lit + 0.02,
      (0.60 * dw + 0.68 * (1 - dw)) * lit + 0.014,
      (0.38 * dw + 0.80 * (1 - dw)) * lit + 0.012
    );

    u.uFogColor.value.copy(this._fogCol);
    u.uFogSun.value.copy(this._fogSun);
    u.uDustColor.value.copy(this._dustCol);
    u.uTime.value = t;
    u.uWind.value.copy(this.windVector);

    const dawnBoost = dawnFogBoost(hours);
    const fogAmt = this.p.fog + dawnBoost * (0.28 + 0.5 * this.p.fog);
    u.uFogP.value.set(
      0.0034 * fogAmt,
      this.p.fogTop + 14 * dawnBoost,
      13.0 + 10.0 * fogAmt,
      2800
    );
    u.uDustP.value.set(0.0026 * this.p.dust, 26.0, 0.0026, 0);
    u.uRainP.value.set(0.0050 * this.p.haze, 0.0062 * this.p.squall, 0.0019, 0);
    u.uScudP.value.set(0.0030 * this.p.scud, 380, 300, 0.0044);
    u.uLens.value.set(
      0.30 * this.rainIntensity,
      0.10 * this.rainIntensity,
      flash,
      0
    );
    u.uFlashColor.value.copy(this.lightning.color);
    this.volume.enabled = !this.volume.idle;
  }
}

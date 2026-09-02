import { QUALITY_TIERS, type QualityTier } from '../engine/Renderer.ts';
import { WEATHER_NAMES, Weather, type WeatherName } from '../world/Weather.ts';
import { ViewModes } from '../dev/ViewModes.ts';
import type { Game } from '../game/Game.ts';

/**
 * Look Lab: the four knobs that change how the world *reads*, and nothing else.
 *
 * Time of day, weather, quality tier and a whole-scene material override. Every
 * one of them is a thing you set and then go and look at the world, which is
 * the test for a studio control — a knob you cannot see the result of belongs
 * in a console, not on a screen.
 *
 * ## Why `Weather` is booted here and not in the world profile
 *
 * The world profile is **eight geometry systems**, and `studiocheck` asserts
 * that exact set so "just the geometry of the world" cannot quietly become a
 * game again. `Weather` is not geometry: it is a simulation that rolls its own
 * transitions, drives rain particles and fires lightning. So it is booted
 * *on demand*, the first time somebody asks for weather, by the same lazy rule
 * every section already follows — the Model Explorer never causes a world to
 * exist, and the world never causes a storm to.
 *
 * `Weather.init` reads `Terrain` (always present here) and everything else it
 * touches — `Sky`, `AudioSystem`, `Vegetation` — behind a null check, so the
 * subset is a supported configuration for the same reason the other eight are.
 *
 * ## Why the times are presets and not a slider
 *
 * A slider on a phone is a drag inside a 44 px track over a 24-hour range: two
 * minutes of fiddling to land on the golden hour that every frame in this
 * project is judged at. The six below are the hours the corpus actually uses,
 * and `18.55` is the one the title screen pins because it is the only time
 * Leide looks like itself.
 */

/** The hours worth having a button for. @see the class header */
export const TIMES: Array<{ label: string, h: number }> = [
  { label: 'Dawn', h: 6.2 },
  { label: 'Morning', h: 9.0 },
  { label: 'Noon', h: 12.5 },
  { label: 'Golden', h: 18.55 },
  { label: 'Dusk', h: 19.6 },
  { label: 'Night', h: 23.0 },
];

export const VIEW_MODES = ViewModes.names;

export class LookLab {
  game: Game;
  views: ViewModes;
  /** Booted lazily, and only if somebody asks for weather. */
  _weather: Weather | null;
  _booting: boolean;

  constructor(game: Game) {
    this.game = game;
    this.views = new ViewModes();
    this._weather = null;
    this._booting = false;
  }

  /** Is there a world to change the look of? */
  ready(): boolean { return !!this.game.get('Sky'); }

  /* ----------------------------------------------------------------- time */

  time(): number {
    const sky = this.game.get('Sky');
    return sky ? sky.hours : 12;
  }

  setTime(h: number) {
    const sky = this.game.get('Sky');
    if (sky && sky.setTimeOfDay) sky.setTimeOfDay(h);
  }

  /** The preset the clock is currently on, or null between them. */
  timeLabel(): string | null {
    const h = this.time();
    const hit = TIMES.find((t) => Math.abs(t.h - h) < 0.05);
    return hit ? hit.label : null;
  }

  /* -------------------------------------------------------------- weather */

  weather(): WeatherName {
    const w = this.game.get('Weather');
    return w ? w.name : 'clear';
  }

  /**
   * Set the weather, booting the system the first time.
   *
   * Async, and the caller redraws when it lands: the boot builds rain geometry
   * and a lightning rig, which is a frame or two, and a control that silently
   * did nothing for two frames would be pressed twice.
   */
  async setWeather(name: WeatherName): Promise<void> {
    if (!WEATHER_NAMES.includes(name)) return;
    let w = this.game.get('Weather');
    if (!w && !this._booting) {
      this._booting = true;
      try {
        const made = new Weather();
        this.game.add(made as never, 'Weather' as never);
        await made.init(this.game);
        this._weather = made;
        w = this.game.get('Weather');
      } finally {
        this._booting = false;
      }
    }
    if (w && w.set) w.set(name);
  }

  /** Is the weather system up? A shell greys the row until it is. */
  hasWeather(): boolean { return !!this.game.get('Weather'); }

  /* -------------------------------------------------------------- quality */

  tier(): QualityTier {
    return (this.game.rnd?.quality as QualityTier) || 'high';
  }

  /**
   * Change the render tier live.
   *
   * Both halves, always. `Renderer` and `PostFX` each hold a tier and
   * `Msaa.ts`'s own docblock records what happens when they disagree: a
   * detected phone rendering at `low` while MSAA stayed at 4x, and
   * `PostFX._wantSamples` firing a warning at boot that nobody read.
   */
  setTier(t: QualityTier) {
    if (!QUALITY_TIERS.includes(t)) return;
    this.game.rnd?.setQuality(t);
    this.game.post?.setQuality(t);
  }

  /* ----------------------------------------------------------- view modes */

  view(): string { return this.views.mode; }

  setView(name: string) {
    this.views.set(name, this.game.scene);
  }
}

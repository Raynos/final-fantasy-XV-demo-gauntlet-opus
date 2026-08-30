import * as THREE from 'three';
import { el } from '../../ui/UIKit.ts';
import type { Game } from '../../game/Game.ts';
import type { System } from '../../engine/System.ts';

/**
 * What being under the water looks like, and the one gauge that says how long
 * you may stay.
 *
 * ### The murk is the shared fog, repointed — not a new post pass
 *
 * The obvious implementation is a full-screen underwater pass in the post
 * chain. It is the wrong one twice over: `PostFX.ts` belongs to another
 * workstream, and a screen-space tint is depth-blind, so the rock two metres
 * away and the far wall of the basin get the same amount of water in front of
 * them. `Dungeons._applyInteriorAtmosphere` had already solved this exact
 * problem for a cave — set `uSkyDim` to 0 so no sky inscatter reaches the
 * aerial-perspective term, drive `uNightTint` to the interior's own fog colour,
 * and the shared height-fog integral in `sky/MaterialPatch.ts` becomes an
 * exact, depth-correct interior fog that every patched material in the world
 * already obeys. Water is a cave that happens to be wet.
 *
 * Two deviations from the dungeon's settings, and both are physics:
 *
 * - **The fog is homogeneous, not exponential-with-height.** `uFogBase` is
 *   pinned to the *camera* and `uFogHeight` to 100 km, so `y0` is 0 and the
 *   integral collapses to `density * distance` — Beer–Lambert through a
 *   uniform medium, which is precisely what a lake is. Pinning the base to the
 *   water level instead (the first thing I tried) makes the murk get thinner
 *   the deeper you go, because the term is an *atmosphere* and atmospheres
 *   thin out upward.
 * - **The sun stays on.** A dungeon kills the cascades because no sun gets in.
 *   Sun very much gets into the first ten metres of a lake, and killing it is
 *   what makes underwater footage read as a black-and-teal void.
 *
 * ### Everything is restored through one saved block
 *
 * `Sky.update` rewrites every one of these uniforms each frame (Sky.ts's own
 * atmosphere pass), which is why this runs in `lateUpdate` and why it is
 * written unconditionally while submerged rather than once on entry. The saved
 * block therefore holds only what is *not* rewritten per frame — `autoGrade`
 * and the exposure band — plus the uniform values as a belt-and-braces restore
 * for the frame the state ends.
 */

/** Per-metre extinction of the murk. 1/0.075 = a 13 m e-folding distance. */
const MURK_DENSITY = 0.075;
/** Inscattered colour of the water column, before the 1.6 the fog term applies. */
const MURK_TINT = new THREE.Vector3(0.114, 0.290, 0.322);
/** How deep the tint goes toward black, and over how many metres. */
const MURK_DEEP = new THREE.Vector3(0.031, 0.094, 0.122);
const MURK_FALLOFF = 22;

interface SavedAtm {
  autoGrade: boolean;
  skyDim: number; night: number; nightTint: THREE.Vector3;
  fogBase: number; fogHeight: number; fogDensity: number; hazeBase: number;
  aerialStrength: number; aerialTint: THREE.Vector3;
}

export class Underwater implements System {
  game!: Game;
  _saved!: SavedAtm | null;
  /** The breath gauge, built lazily on the first dive and then reused. */
  _root!: HTMLElement | null;
  _fill!: HTMLElement | null;
  _label!: HTMLElement | null;
  _tint!: THREE.Vector3;
  /** Last value written to the gauge, so a still frame does no DOM work. */
  _shown!: number;

  constructor() {
    this._saved = null;
    this._root = null;
    this._fill = null;
    this._label = null;
    this._tint = new THREE.Vector3();
    this._shown = -1;
  }

  init(game: Game) { this.game = game; return this; }

  reset() {
    this._restore();
    this._show(false);
    this._shown = -1;
  }

  lateUpdate(_dt: number, game: Game) {
    const swim = game.get('Swim');
    if (!swim) return;
    /*
     * **The camera decides, and only the camera.**
     *
     * The first version asked whether the *player* was swimming, and the first
     * two underwater frames ever taken -- `under_alstor`, `under_vesper`, an
     * authored framing with no swimmer in it -- came back as a crisp dry
     * daylight scene: bright green grass, unattenuated rock, no medium between
     * the lens and the world at all, with a dark ceiling floating over it. A
     * lens under the waterline is looking at an underwater scene whether or not
     * anybody is in the water, and a diver whose camera has swung up out of the
     * water is not.
     */
    const cam = game.camera.position;
    const level = swim.levelAt(cam.x, cam.z);
    const terr = game.get('Terrain');
    const under = Number.isFinite(level) && cam.y < level - 0.02
      // ...and there has to be water UNDER the lens as well as over it. A body
      // is a rectangle over a basin, so `levelAt` says wet over dry ground
      // inside that rectangle; without this a camera on a hillside beside a
      // lake, below the waterline but not in the lake, fills with murk.
      && !!terr && terr.heightAt(cam.x, cam.z) < cam.y;
    if (under) this._apply(game, level - game.camera.position.y);
    else this._restore();
    this._gauge(game, swim.swimming, swim.breath, swim.forcedAscent);
  }

  /**
   * @param depth how far the lens is below the surface, m
   */
  _apply(game: Game, depth: number) {
    const sky = game.get('Sky');
    const post = game.post;
    if (!sky || !sky.u) return;
    const u = sky.u;
    if (!this._saved) {
      this._saved = {
        autoGrade: post ? post.autoGrade : true,
        skyDim: u.uSkyDim.value, night: u.uNight.value,
        nightTint: u.uNightTint.value.clone(),
        fogBase: u.uFogBase.value, fogHeight: u.uFogHeight.value,
        fogDensity: u.uFogDensity.value, hazeBase: u.uHazeBase.value,
        aerialStrength: u.uAerialStrength.value,
        aerialTint: u.uAerialTint.value.clone(),
      };
      if (post) post.autoGrade = false;
    }
    // Colour goes toward the deep tint with depth — the red is gone in the
    // first two metres, so a diver descending should watch the world lose its
    // warmth rather than have it switch off at a threshold.
    const k = THREE.MathUtils.clamp(depth / MURK_FALLOFF, 0, 1);
    this._tint.copy(MURK_TINT).lerp(MURK_DEEP, k * k);
    u.uSkyDim.value = 0.0;
    u.uNight.value = 1.0;
    u.uNightTint.value.copy(this._tint).multiplyScalar(1 / 1.6);
    u.uAerialTint.value.set(1, 1, 1);
    u.uAerialStrength.value = 1.0;
    // Homogeneous: base at the eye, scale height effectively infinite, so the
    // integral in MaterialPatch collapses to density * distance.
    u.uFogBase.value = game.camera.position.y;
    u.uFogHeight.value = 1e5;
    u.uFogDensity.value = MURK_DENSITY * (1.0 + 0.45 * k);
    u.uHazeBase.value = 0.0;
  }

  _restore() {
    const s = this._saved;
    if (!s) return;
    this._saved = null;
    const game = this.game;
    const sky = game && game.get('Sky');
    if (sky && sky.u) {
      const u = sky.u;
      u.uSkyDim.value = s.skyDim;
      u.uNight.value = s.night;
      u.uNightTint.value.copy(s.nightTint);
      u.uFogBase.value = s.fogBase;
      u.uFogHeight.value = s.fogHeight;
      u.uFogDensity.value = s.fogDensity;
      u.uHazeBase.value = s.hazeBase;
      u.uAerialStrength.value = s.aerialStrength;
      u.uAerialTint.value.copy(s.aerialTint);
    }
    if (game && game.post) game.post.autoGrade = s.autoGrade;
  }

  /**
   * The breath gauge.
   *
   * Its own element appended to `game.uiRoot` with inline style, so no file in
   * `src/ui/` is touched. Written per frame from the state rather than
   * animated in CSS, per that directory's standing rule: a screenshot taken
   * after N sim steps has to be byte-identical.
   */
  _gauge(game: Game, swimming: boolean, breath: number, forced: boolean) {
    // Hidden until it means something: a full bar that is always on screen is
    // just clutter, and the first time it matters is the first time it moves.
    const want = swimming && (breath < 0.999 || forced);
    if (!want) { this._show(false); return; }
    if (!this._root) this._build(game);
    this._show(true);
    const pct = Math.round(breath * 1000) / 10;
    if (pct === this._shown) return;
    this._shown = pct;
    if (this._fill) {
      this._fill.style.width = pct + '%';
      // Amber under a third, red under a tenth: the same three-band language
      // the HP gauge uses, so it needs no explaining.
      this._fill.style.background = breath > 0.34 ? '#7fd8e8'
        : breath > 0.11 ? '#e8c15f' : '#e8635f';
    }
    if (this._label) this._label.textContent = forced ? 'SURFACING' : 'BREATH';
  }

  _build(game: Game) {
    this._label = el('div', {
      text: 'BREATH',
      style: 'font:600 10px/1.2 system-ui,sans-serif;letter-spacing:.18em;'
        + 'color:#bfe6ee;text-shadow:0 1px 2px rgba(0,0,0,.75);margin-bottom:4px;text-align:center',
    });
    this._fill = el('div', {
      style: 'height:100%;width:100%;background:#7fd8e8;border-radius:2px',
    });
    this._root = el('div', {
      style: 'position:absolute;left:50%;bottom:13%;transform:translateX(-50%);'
        + 'width:190px;pointer-events:none;z-index:6;display:none',
    }, [
      this._label,
      el('div', {
        style: 'height:5px;border-radius:3px;background:rgba(4,18,24,.62);'
          + 'box-shadow:inset 0 0 0 1px rgba(190,235,245,.35);overflow:hidden',
      }, [this._fill]),
    ]);
    game.uiRoot.appendChild(this._root);
  }

  _show(on: boolean) {
    if (this._root) this._root.style.display = on ? 'block' : 'none';
  }
}

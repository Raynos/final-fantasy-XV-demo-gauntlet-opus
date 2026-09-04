import './studio.css';
import * as THREE from 'three';
import { demoActive, touchActive } from '../engine/Device.ts';
import { el, uiScale } from '../ui/UIKit.ts';
import { Freecam } from '../dev/Freecam.ts';
import { bootStudio, WORLD_SYSTEMS, type Progress } from './StudioBoot.ts';
import { ModelExplorer } from './ModelExplorer.ts';
import { WorldExplorer } from './WorldExplorer.ts';
import { ShotGallery } from './ShotGallery.ts';
import { LookLab } from './LookLab.ts';
import { Thumbs } from './Thumbs.ts';
import { SECTIONS, type SectionId } from './Sections.ts';
import type { Game } from '../game/Game.ts';

/**
 * The Game Studio: a different program that shares the game's content.
 *
 * ## What changed from v1, and why
 *
 * v1 ran inside a fully booted game — thirty systems — and then spent code
 * suppressing what it had just built: pausing the simulation, clearing
 * encounters every frame, hiding a party it had spawned, hand-ticking the
 * streamers the pause had stopped. `holdWorld()` and `pumpWorld()` were the
 * tell: both were machinery for suppressing things that should never have
 * existed. **Neither exists here.** The correct amount of code for holding the
 * game still in a studio is zero, because there is no game.
 *
 * ## The scene, and the one honest compromise
 *
 * `PostFX` binds its scene in its constructor, so there is exactly one scene
 * per page. That is fine, because **the world is only ever built if you open
 * the World Explorer**: open the studio and go to Models and no terrain, no
 * vegetation, no props and no characters are ever constructed — which was the
 * complaint. The compromise is the rarer path: if you visit World *and then*
 * Models, the world exists and has to be hidden rather than un-built.
 * `showWorld(false)` does that by toggling five system roots, not by walking
 * `scene.children` the way `dev/Stage` had to.
 *
 * ## It drives its own frames
 *
 * `Game.start()` is the game's loop and it is never called. The studio runs its
 * own `requestAnimationFrame`, ticks only what it booted, and renders. That is
 * why nothing can wander into a shot: an enemy that does not exist cannot.
 */
/**
 * The sections that need a world under them, named once.
 *
 * Three now, not two. **Look Lab is one of them**, and its absence was the bug:
 * `setSection('look')` fell through to the `else` arm, which boots nothing — so
 * the one section whose entire job is "change how the world reads" opened onto
 * an empty scene with no sky to set the hour on. A set rather than a chain of
 * `||` because it is asked in two places (the frame loop and the boot) and two
 * copies of a condition is exactly how they come to disagree.
 */
const WORLD_SECTIONS = new Set<string>(['world', 'shots', 'look']);

export class StudioShell {
  game: Game;
  root: HTMLElement;
  /** True on a coarse-pointer device: the mobile shell is in charge. */
  touch: boolean;
  /** Which section is open, or null while the studio menu is showing. */
  section: SectionId | null;
  /** The studio's camera. One for the whole studio; nothing else owns it. */
  cam: Freecam;
  model: ModelExplorer;
  world: WorldExplorer;
  /** The 166 framings, as destinations. @see ShotGallery */
  gallery: ShotGallery;
  /** Time, weather, tier and the material overrides. @see LookLab */
  look: LookLab;
  /** Model tiles, copied out of the frames already drawn. @see Thumbs */
  thumbs: Thumbs;
  /**
   * The model key whose frame is worth keeping, set on selection.
   *
   * A frame, not a promise: the capture has to run inside the render loop
   * because the drawing buffer is not readable once the browser has composited
   * it. @see Thumbs
   */
  _wantThumb: string | null;
  /** Has the five-system world profile been booted? */
  worldBooted: boolean;
  /** Redraw hook, installed by whichever shell is drawing. @see setSection */
  onSection: ((id: SectionId | null) => void) | null;
  /**
   * The baked tiles landed; whatever list is on screen wants repainting.
   *
   * A fetch cannot be awaited before the shell draws — that would put a network
   * round trip in front of the first frame to decorate a list — so the tiles
   * arrive after it, and the row reconciler only reads `thumbs.get()` when it
   * syncs. Without this the first list you opened stayed blank until you
   * navigated, which is the bug the bake exists to fix.
   */
  onThumbs: (() => void) | null;
  /** Progress hook while a section boots what it needs. */
  onBusy: ((label: string | null, t: number) => void) | null;
  /**
   * What to do instead of reloading on exit. @see close
   *
   * Set by `main.ts`, which owns the front door. Null falls back to a reload,
   * so a studio opened by a probe or a gate still has a way out.
   */
  onExit: (() => void) | null;
  _raf: number;
  _last: number;
  /**
   * True while a profile is booting, and the loop must not run.
   *
   * The studio renders on its own `requestAnimationFrame` from the moment it
   * opens, which the game never does — `Game.init()` finishes before
   * `Game.start()` is called. That difference is a real race and it was
   * measured: `game.add()` registers a system *before* its `init()` is
   * awaited, so a frame drawn mid-boot found `Sky` sampling a `Terrain` whose
   * height field had not been allocated yet, and `Field.rawHeightAt` threw on
   * every frame until the boot finished. A half-built world is not worth
   * drawing anyway, and not drawing it gives the boot the main thread.
   */
  _booting: boolean;
  /** What `showWorld` was last told. @see _reapplyWorld */
  _worldShown: boolean;
  /** `scene.children.length` when it was told. @see _reapplyWorld */
  _sceneCount: number;
  /**
   * World objects lifted out of the scene while the Model Explorer is open.
   *
   * Held, never disposed: going back to the World Explorer is a `scene.add`
   * per entry, and re-building eight systems to return from a turntable would
   * be the v1 mistake in a new place. @see showWorld
   */
  _parked: THREE.Object3D[];
  _onResize: () => void;

  constructor(game: Game) {
    this.game = game;
    this.touch = touchActive();
    this.section = null;
    this.worldBooted = false;
    this.cam = new Freecam();
    this.model = new ModelExplorer(game);
    this.world = new WorldExplorer(game, this.cam);
    this.gallery = new ShotGallery(game, this.cam);
    this.look = new LookLab(game);
    this.thumbs = new Thumbs();
    this._wantThumb = null;
    this.onSection = null;
    this.onThumbs = null;
    this.onBusy = null;
    this.onExit = null;
    this._raf = 0;
    this._last = 0;
    this._booting = false;
    this._worldShown = true;
    this._sceneCount = 0;
    this._parked = [];

    this.root = el('div', { id: 'studio' });
    this.root.classList.add(this.touch ? 'st-touch' : 'st-desk');
    this.root.appendChild(el('div.st-scrim'));
    document.body.appendChild(this.root);

    this._onResize = () => this._scale();
    window.addEventListener('resize', this._onResize);
    this._scale();
  }

  _scale() {
    // A tool wants more per screen than a HUD does, so it takes the game's
    // scale pulled back toward 1 rather than the scale itself.
    //
    // **Except on a phone, where it takes nothing at all.** `uiScale` answers
    // "how do I fit a 1280x720 HUD onto this screen", and on a 390x740 portrait
    // handset that is 0.30 -- which put this shell at zoom 0.69 and took the
    // 58 px rows `studio.css` authors for a thumb down to 40 real pixels, under
    // the 44 px floor the same file's comment claims. `.st-touch` is already
    // written in real screen px for exactly this device; scaling it is the bug.
    this.root.style.zoom = this.touch ? '1' : (1 + (uiScale(demoActive()) - 1) * 0.45).toFixed(4);
  }

  /* --------------------------------------------------------------- frames */

  /**
   * The studio's own loop.
   *
   * Ticks **only what was booted**. In the `none` profile that is nothing at
   * all and this is a camera and a render; in `world` it is the five geometry
   * systems, which stream around the camera exactly as they do in the game
   * because nothing is paused.
   */
  start() {
    const loop = (now: number) => {
      this._raf = requestAnimationFrame(loop);
      // Nothing is drawn mid-boot. @see _booting
      if (this._booting) { this._last = now; return; }
      const dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 1 / 60;
      this._last = now;
      const g = this.game;
      g.time.tick();
      g.input.update();

      if (this.worldBooted && WORLD_SECTIONS.has(this.section as string)) {
        for (const s of g.systems) if (s.update) s.update(dt, g);
      }
      // Anything the world added to the scene since the last decision has to
      // obey it. @see _reapplyWorld
      this._reapplyWorld();

      if (this.section === 'model') this.model.update(dt, this.cam);
      this.cam.update(dt, g.input);
      this.cam.apply(g.camera);

      g.post.update(g.time);
      g.post.render();
      // Immediately after the draw and before the browser composites it, which
      // is the only moment the drawing buffer can be read. @see Thumbs
      if (this._wantThumb && this.section === 'model') {
        this.thumbs.capture(this._wantThumb, g.renderer.domElement);
        this._wantThumb = null;
      }
      g.input.endFrame();
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  /* ------------------------------------------------------------- sections */

  /**
   * Open a section, booting whatever it needs and nothing more.
   *
   * The boot is **lazy and per-section**, which is the whole architecture: the
   * Model Explorer never causes a world to exist, and the World Explorer's five
   * systems are paid for once, the first time somebody asks for them.
   *
   * This is also the only way in, and it tells the shell — v1 shipped two
   * captures showing correct world state under stale chrome because redrawing
   * was the caller's job.
   */
  async setSection(id: SectionId | null) {
    if (this.section === id) return;
    if (this.section === 'model') this.model.exit();
    this.section = id;
    this.root.classList.toggle('st-in-section', !!id);
    // The menu and the section screens that boot nothing sit in front of an
    // EMPTY scene -- the `none` profile is a renderer and a camera -- so
    // without this they float on the page's black. The class carries the front
    // door's own dusk gradient through, so the studio opens on the same sky the
    // door closed on rather than on a void. @see studio.css
    this.root.classList.toggle('st-void', id == null || id === 'notes' || id === 'device');

    if (WORLD_SECTIONS.has(id as string)) {
      if (!this.worldBooted) {
        const p: Progress = (t, label) => this.onBusy?.(label, t);
        this.onBusy?.('Building the world', 0);
        this._booting = true;
        try {
          await bootStudio(this.game, 'world', p);
        } finally {
          this._booting = false;
        }
        this.worldBooted = true;
        this.onBusy?.(null, 1);
      }
      this.showWorld(true);
      this.fly(true);
      this.pinExposure(false);
    } else if (id === 'model') {
      this.showWorld(false);
      this.model.enter();
      // **`true`, not `false`.** `ModelStage.update` computes the turntable's
      // camera pose and writes it onto the FREECAM -- and `Freecam.apply` is a
      // no-op while `enabled` is false, so with flight off the stage's framing
      // was computed every selection and thrown away every frame. The camera
      // stayed wherever it happened to be, which is why the audit found the
      // model "in the bottom third" and the lighting "flat": neither was a
      // framing bug or a lighting bug, the lens was simply never moved.
      //
      // Caught by the contrast probe in `studiocheck`, which read the subject
      // at 0.2 luminance against an 11.1 backdrop -- a model somewhere off
      // frame, not a model that was too dark.
      this.fly(true);
      this.pinExposure(true);
    } else {
      this.showWorld(true);
      this.fly(false);
      this.pinExposure(false);
    }

    if (this.onSection) this.onSection(id);
  }

  /**
   * Take the world out of the scene, or put it back.
   *
   * ## Two versions of this were wrong, and the second one is instructive
   *
   * The first toggled `visible` on whichever of `group | root | mesh | dome |
   * sky` each system happened to have — and not one of the eight has a single
   * root, so most of the world stayed on screen. The second hid every
   * top-level scene child except the model stage, which is exact about *what*
   * the world is and still shipped a bug: the phone kept showing a band of
   * terrain through the studio backdrop, and the Model Explorer was reported
   * slow "with the world loaded behind".
   *
   * Both of those are the same mistake in different clothes. `visible = false`
   * is a *rendering* hint on an object that is still in the graph: three.js
   * still walks it every frame to build the render list, anything that re-shows
   * a child re-shows it for good, and a subtree added after the toggle has
   * never heard of it. It is a guess that has to be re-made every frame and
   * re-made correctly, and it was neither.
   *
   * **So the world is removed from the scene instead.** `scene.remove` is
   * exact: an object that is not in the graph cannot be drawn by accident, and
   * cannot be traversed either — which is the half that answers "slow". Nothing
   * is disposed, so coming back is `scene.add` and costs nothing; the geometry,
   * the textures and the systems are all still resident and still correct.
   *
   * Late arrivals are the reason `_parkStrays` exists rather than this being a
   * one-shot: `Props.mega` and `Dungeons`'s entrances both build on the
   * `game-ready` beat, `Hammerhead` builds on approach, and `Water` adds meshes
   * as it streams. Any of those can land while the Model Explorer is open.
   */
  showWorld(on: boolean) {
    if (!this.worldBooted) return;
    this._worldShown = on;
    if (on) {
      for (const o of this._parked) this.game.scene.add(o);
      this._parked.length = 0;
    } else {
      this._parkStrays();
    }
    this._sceneCount = this.game.scene.children.length;
  }

  /**
   * Move everything that is not the model stage out of the scene.
   *
   * Iterates a copy, because `scene.remove` splices `children` and a live
   * for-of over it would skip every second object — which is exactly the shape
   * of "some of the world disappeared and some of it did not".
   */
  _parkStrays() {
    const keep = this.model.stage.group;
    for (const o of [...this.game.scene.children]) {
      if (o === keep) continue;
      this.game.scene.remove(o);
      this._parked.push(o);
    }
  }

  /**
   * Catch anything the world added to the scene since the last decision.
   *
   * One integer compare per frame, and a park only when the count actually
   * moved. @see showWorld for what can arrive late and why.
   */
  _reapplyWorld() {
    if (!this.worldBooted || this._worldShown) return;
    if (this.game.scene.children.length === this._sceneCount) return;
    this._parkStrays();
    this._sceneCount = this.game.scene.children.length;
  }

  /**
   * Keep the next frame as this model's tile.
   *
   * Two frames of grace, not one: `ModelStage.update` writes the camera on the
   * frame after `show()` sets `_needFrame`, so capturing on the very next draw
   * would photograph the previous model's framing. @see Thumbs
   */
  wantThumb(key: string) {
    this._wantThumb = null;
    requestAnimationFrame(() => requestAnimationFrame(() => { this._wantThumb = key; }));
  }

  /**
   * Pin the lens while a model is on the turntable.
   *
   * ## Why the backdrop change alone could not work
   *
   * Metering runs on the un-exposed HDR buffer and drives the frame toward
   * `key`, so **darkening the backdrop sphere cannot make it darker relative to
   * the subject** — the integrator opens up and puts it back at middle grey,
   * taking the model with it. Measured: after a 0.42x albedo cut the subject
   * still came back at 0.97x the backdrop's luminance. That is the audit's
   * finding 7 and it is a lens problem, not a lighting one.
   *
   * ## Why it pins the BAND and does not disable the integrator
   *
   * The first attempt set `exposure.enabled = false`. That does not fix the
   * exposure at a known value — it freezes whatever multiplier happened to be
   * in the adapt texture, which after a visit to the World Explorer is a sunlit
   * outdoor scene's. The measured result was a model frame four times too dark
   * (subject 29.0 -> 7.6) and a probe that failed for a completely different
   * reason than the one it was written for.
   *
   * `bounds` is `[max(min, base*rangeLo), min(max, ceiling, base*rangeHi)]`, so
   * a band of exactly 1.0 around a base of 1.0 clamps the target to 1.0 no
   * matter what `avg` is. The integrator keeps running and converges there from
   * wherever it was, which is a fixed exposure arrived at honestly.
   *
   * A turntable is the one view in this project where auto-exposure is wrong on
   * purpose. It exists so a player walking out of a cave is not blinded; here
   * the frame is one model on a fixed backdrop under a fixed three-point rig,
   * and a lens that re-meters per subject means two creatures photographed a
   * minute apart cannot be compared — which is the entire job of the section.
   */
  pinExposure(on: boolean) {
    const exp = this.game.post?.exposure;
    if (!exp) return;
    exp.enabled = true;
    // The constructor's own band on the way back out. `Sky` publishes `base`
    // in the world sections and adaptation resumes around it.
    // 1.6, not 1.0. The band it replaces is [0.62, 1.65] around a base of 1,
    // and on a dark backdrop with one subject the integrator was settling at
    // the top of it — so pinning at 1.0 is not "no change", it is 1.65x darker
    // than the frame everybody has been reviewing. Measured on `bloodhorn`, the
    // darkest asset in the roster: at 1.0 the animal is a silhouette.
    if (on) exp.setSceneExposure(1.6, { lo: 1, hi: 1 });
    else exp.setSceneExposure(1, { lo: 0.62, hi: 1.65 });
  }

  /** Hand the camera to the freecam, adopting the current pose. */
  fly(on: boolean) {
    this.cam.setEnabled(on, this.game.camera);
  }

  /**
   * Leave the studio: back to the front door, with no reload.
   *
   * The comment above this used to say exactly that and the line under it said
   * `location.reload()`. A full page load only to re-render two rows of text
   * throws away the renderer, every compiled program and — after the World
   * Explorer — a whole streamed world, so going out and back in cost seconds
   * for nothing.
   *
   * `onExit` is `main.ts`'s hook, because the door belongs to the router and
   * not to the studio. The fallback stays a reload: a studio opened directly by
   * `?studio=1`, by a probe or by a gate has no router to hand back to.
   */
  close() {
    this.stop();
    this.dispose();
    if (this.onExit) { this.onExit(); return; }
    location.reload();
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.root.remove();
  }

  /** Sections this build can actually offer. @see Sections.ts */
  available() {
    return SECTIONS.filter((s) => s.available());
  }

  /**
   * The world profile's system names, as the module defines them.
   *
   * Exposed so `studiocheck` can assert the booted set against the **single
   * source of truth** rather than a list retyped in the gate. A second copy is
   * exactly how a gate comes to pass while the thing it guards is broken, and
   * the list just grew from five to eight.
   */
  worldSystems(): readonly string[] { return WORLD_SYSTEMS; }
}

/**
 * Boot the studio to its lightest profile and hand back the shell.
 *
 * `none`: a renderer, an empty scene, a camera. No systems, no world, no
 * characters, no simulation. Everything past that is a section asking for it.
 */
export async function openStudio(game: Game): Promise<StudioShell> {
  await bootStudio(game, 'none');
  const shell = new StudioShell(game);

  const mod = shell.touch
    ? await import('./mobile/Shell.ts')
    : await import('./desktop/Shell.ts');
  mod.install(shell);

  shell.start();
  // After `install`, so the shell has an `onThumbs` to call, and deliberately
  // not awaited: the studio opens at once and the tiles arrive when they
  // arrive. @see Thumbs.seed
  void shell.thumbs.seed().then((n) => {
    if (n && shell.onThumbs) shell.onThumbs();
    console.info(`[studio] ${n} baked tiles`);
  });
  // The gate's handle on the studio. `window.GAME` is already a declared
  // contract with `src/tools/**` for exactly this reason (see globals.d.ts);
  // a studio that cannot be driven from `page.evaluate` cannot be gated, and
  // an ungated architecture claim rots.
  window.__STUDIO = shell;
  console.info(`[studio] open — ${shell.touch ? 'mobile' : 'desktop'} shell, `
    + `${game.systems.length} systems booted, ${shell.available().length} sections`);
  return shell;
}

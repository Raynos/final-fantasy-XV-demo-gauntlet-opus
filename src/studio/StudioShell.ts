import './studio.css';
import * as THREE from 'three';
import { demoActive, touchActive } from '../engine/Device.ts';
import { el, uiScale } from '../ui/UIKit.ts';
import { Freecam } from '../dev/Freecam.ts';
import { bootStudio, WORLD_SYSTEMS, type Progress } from './StudioBoot.ts';
import { ModelExplorer } from './ModelExplorer.ts';
import { WorldExplorer } from './WorldExplorer.ts';
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
  /** Has the five-system world profile been booted? */
  worldBooted: boolean;
  /** Redraw hook, installed by whichever shell is drawing. @see setSection */
  onSection: ((id: SectionId | null) => void) | null;
  /** Progress hook while a section boots what it needs. */
  onBusy: ((label: string | null, t: number) => void) | null;
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
  _onResize: () => void;

  constructor(game: Game) {
    this.game = game;
    this.touch = touchActive();
    this.section = null;
    this.worldBooted = false;
    this.cam = new Freecam();
    this.model = new ModelExplorer(game);
    this.world = new WorldExplorer(game, this.cam);
    this.onSection = null;
    this.onBusy = null;
    this._raf = 0;
    this._last = 0;
    this._booting = false;

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
    this.root.style.zoom = (1 + (uiScale(demoActive()) - 1) * 0.45).toFixed(4);
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

      if (this.worldBooted && (this.section === 'world' || this.section === 'shots')) {
        for (const s of g.systems) if (s.update) s.update(dt, g);
      }

      if (this.section === 'model') this.model.update(dt, this.cam);
      this.cam.update(dt, g.input);
      this.cam.apply(g.camera);

      g.post.update(g.time);
      g.post.render();
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

    if (id === 'world' || id === 'shots') {
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
    } else if (id === 'model') {
      this.showWorld(false);
      this.model.enter();
      this.fly(false);
    } else {
      this.showWorld(true);
      this.fly(false);
    }

    if (this.onSection) this.onSection(id);
  }

  /**
   * Show or hide the world, when there is one.
   *
   * A no-op on the common path, because a studio that only ever opened Models
   * has no world to hide. When there is one, it toggles the five systems' roots
   * rather than walking `scene.children` — `dev/Stage` had to do the latter
   * because it could not know what was in the scene; here we booted it and we
   * know exactly.
   */
  showWorld(on: boolean) {
    if (!this.worldBooted) return;
    for (const name of WORLD_SYSTEMS) {
      const sys = this.game.get(name as never) as unknown as Record<string, unknown> | null;
      if (!sys) continue;
      for (const k of ['group', 'root', 'mesh', 'dome', 'sky']) {
        const o = sys[k];
        if (o instanceof THREE.Object3D) o.visible = on;
      }
    }
  }

  /** Hand the camera to the freecam, adopting the current pose. */
  fly(on: boolean) {
    this.cam.setEnabled(on, this.game.camera);
  }

  /** Leave the studio: back to the front door, with no reload. */
  close() {
    this.stop();
    this.dispose();
    // A full page load only to re-render two rows of text would throw away the
    // renderer and every compiled program for nothing. v1 reloaded because it
    // had a whole game to unwind; there is nothing here to unwind.
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
  // The gate's handle on the studio. `window.GAME` is already a declared
  // contract with `src/tools/**` for exactly this reason (see globals.d.ts);
  // a studio that cannot be driven from `page.evaluate` cannot be gated, and
  // an ungated architecture claim rots.
  window.__STUDIO = shell;
  console.info(`[studio] open — ${shell.touch ? 'mobile' : 'desktop'} shell, `
    + `${game.systems.length} systems booted, ${shell.available().length} sections`);
  return shell;
}

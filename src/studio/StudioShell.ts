import './studio.css';
import { demoActive, touchActive } from '../engine/Device.ts';
import { el, uiScale } from '../ui/UIKit.ts';
import { Freecam } from '../dev/Freecam.ts';
import { Stage } from '../dev/Stage.ts';
import { ModelExplorer } from './ModelExplorer.ts';
import { WorldExplorer } from './WorldExplorer.ts';
import { SECTIONS, type SectionId } from './Sections.ts';
import type { Game } from '../game/Game.ts';

/**
 * The Game Studio: a mode you enter *instead of* the game.
 *
 * `src/dev/`'s suite is an overlay you summon on top of a running game. This is
 * the other half — the world still renders, but nothing plays. See
 * `docs/plans/2026-09-02-opus-game-studio.md`.
 *
 * ## The one rule
 *
 * **In the studio the game is not running.** `game.paused` is set, the story
 * system is never started, encounters and live enemies are held down, and the
 * HUD is hidden. The world keeps *rendering* — which is the entire point —
 * because `Game.frame()` runs every `update()` then every `lateUpdate()`, and
 * `paused` skips only the first. A system appended last therefore still gets a
 * pass after `CameraRig` has written the camera, and can overwrite it. That is
 * how `src/dev/DevSuite.ts` has always worked and it needs no change to
 * `Game.ts`, which BRIEF rule 4 forbids editing.
 *
 * ## Leaving is a reload, on purpose
 *
 * The studio pools enemies, clears `visible` across `scene.children`, drives
 * the sun and swaps `scene.overrideMaterial`. Unwinding all of that exactly is
 * a bug farm whose failures surface later as phantom rendering faults in the
 * *game*, which is much more expensive than a 6.5 s boot. So exit is
 * `location.reload()` and the game you come back to is the game you booted.
 *
 * ## Two shells, one core
 *
 * `touchActive()` picks the shell once, at open, and it is never re-asked —
 * the same predicate the game already trusts, resolved once at module load.
 * `hover: none` is not a small screen: it is no keyboard, no wheel, no MMB and
 * no cursor to hover, so the two shells differ in navigation and input rather
 * than in scale. This file owns what is common to both; `desktop/` and
 * `mobile/` own the rest.
 */
export class StudioShell {
  game: Game;
  root: HTMLElement;
  /** True on a coarse-pointer device: the mobile shell is in charge. */
  touch: boolean;
  /** Which section is open, or null while the studio menu is showing. */
  section: SectionId | null;
  _onResize: () => void;
  /** `game.paused` as it was before the studio took over. */
  _pausedWas: boolean;
  /**
   * The studio's camera. Every section that shows the world flies it.
   *
   * One `Freecam` for the whole studio rather than one per section, because
   * `CameraRig` is not running and something has to own the transform — two
   * owners would fight for it on the frame a section changes.
   */
  cam: Freecam;
  /** The isolation stage. Only the Model Explorer enters it. */
  stage: Stage;
  model: ModelExplorer;
  world: WorldExplorer;
  /**
   * Installed by whichever shell is drawing, called on every section change.
   *
   * @see setSection for why this is the setter's job and not the caller's.
   */
  onSection: ((id: SectionId | null) => void) | null;

  constructor(game: Game) {
    this.game = game;
    this.touch = touchActive();
    this.section = null;
    this._pausedWas = !!game.paused;
    this.cam = new Freecam();
    this.stage = new Stage();
    this.model = new ModelExplorer(game, this.stage);
    this.world = new WorldExplorer(game, this.cam);
    this.onSection = null;

    this.root = el('div', { id: 'studio' });
    this.root.classList.add(this.touch ? 'st-touch' : 'st-desk');
    // First child, so everything a shell appends draws over it. @see studio.css
    this.root.appendChild(el('div.st-scrim'));
    document.body.appendChild(this.root);

    this._onResize = () => this._scale();
    window.addEventListener('resize', this._onResize);
    this._scale();
  }

  _scale() {
    // The studio is a tool, so it wants more information per screen than the
    // HUD does. Scaling it like the game would make a 23-row list unreadable
    // on a phone and comically large on a 27-inch panel, so it takes the game's
    // scale pulled back toward 1 rather than the scale itself.
    const s = uiScale(demoActive());
    this.root.style.zoom = (1 + (s - 1) * 0.45).toFixed(4);
  }

  /* --------------------------------------------------------------- mode -- */

  /**
   * Take the screen and stop the game.
   *
   * Everything here is idempotent and defensive: the studio opens from the
   * title screen on a page where the story system never started, and also from
   * `?studio=1` before anything has been shown, so no system can be assumed to
   * be in a particular state — or to exist at all on the phone build.
   */
  open() {
    const g = this.game;
    g.paused = true;

    const story = g.get('Story');
    if (story) {
      story.hideTitle?.();
      story.onStudio = null;
      // `hideTitle()` only clears `shown`; the screen keeps drawing while its
      // fade amount runs down, and its root is only display:none'd once that
      // reaches zero. Entering from `?studio=1` gives it no frames to do that
      // in, so the crest sits over the studio menu -- measured, in the first
      // capture of this shell. Put it down now rather than waiting for a fade
      // nobody is going to watch.
      const t = story.title;
      if (t) { t.a = 0; t.t = 0; t.chosen = null; t.root.style.display = 'none'; }
    }
    g.get('Cinematics')?.stop?.({ skipped: true });
    g.get('Menus')?.setScreen?.(null);

    const hud = g.get('HUD');
    if (hud) {
      hud.setVisible?.(false);
      hud.setMenuOpen?.(false);
      // `setVisible(false)` does not reach the hint cards, which own their own
      // layer and their own queue -- so "A Better Engine Blade..." was still
      // sitting over the studio menu. Mute the source and drain what is queued;
      // `holdWorld()` keeps it muted, because a hint can re-arm.
      if (hud.hints) { hud.hints.muted = true; hud.hints.cur = null; hud.hints.a = 0; hud.hints.queue.length = 0; }
      hud.toasts?.clear?.();
    }

    // Encounters re-arm on a timer, so pushing the timer out is not enough on
    // its own -- `holdWorld()` runs every frame for as long as the studio is
    // open. This is the first pass, before anything is drawn.
    this.holdWorld();

    // Pointer lock belongs to gameplay. A studio that grabs the cursor cannot
    // be clicked, and on a trackpad it cannot be escaped without a keyboard.
    if (g.input) g.input.pointerLocked = false;
    document.exitPointerLock?.();
  }

  /**
   * Hold the world still. Called every frame, not once.
   *
   * `game.paused` stops `update()`, but a system that spawns from a
   * `lateUpdate()` or from a timer it owns is not covered by it, and an enemy
   * that slipped through would wander into a model shot minutes later. Clearing
   * is cheap and unconditional beats clever here.
   */
  holdWorld() {
    const g = this.game;
    const hints = g.get('HUD')?.hints;
    if (hints) hints.muted = true;
    this.hideGameUi();
    const enc = g.get('Encounters');
    if (enc) {
      if (enc.packs) enc.packs.length = 0;
      enc.active?.clear?.();
      enc._roamTimer = 1e9;
    }
    g.get('Enemies')?.clear?.();
  }

  /**
   * Stream the world around the camera without running the game.
   *
   * "The world renders, nothing plays" has to include the world *loading*, and
   * it did not. `Props.update` is where POI sites are built and packed — "at
   * most one site is built per frame" — and `Game.frame` skips every `update()`
   * while `paused`. So with the studio holding the pause, teleporting three
   * kilometres put the camera in front of geometry that would never be built,
   * and `WorldExplorer.settled()` sat at false forever waiting for a counter
   * nothing was advancing. The first fly of the Signature band hit its ten
   * second hold at all twelve destinations for exactly this reason.
   *
   * Calling the streamers directly is the narrow fix: they are the systems
   * whose job is "make the world near the camera exist", and none of them is
   * gameplay. `Terrain` and `Vegetation` go first because props are placed
   * against ground that has to be there, and each is optional because the
   * phone build does not necessarily have all three.
   *
   * Only while a world-facing section is open. The Model Explorer hides the
   * world behind `Stage`, and streaming into a hidden scene is pure cost.
   *
   * `Terrain` is absent from the list because `Terrain.update()` is empty — it
   * builds from `heightAt` on demand rather than on a tick, so there is nothing
   * to pump.
   */
  pumpWorld(dt: number, game: Game) {
    game.get('Vegetation')?.update?.(dt, game);
    game.get('Props')?.update?.(dt, game);
  }

  /**
   * Put the game's own DOM layers down, every frame.
   *
   * `hud.setVisible(false)` reaches the HUD and nothing else: hints, toasts,
   * the minimap, the interact prompt and the key legend each own a root, and
   * the legend — "SELECT / CONFIRM / BACK / PAUSE" — was printing across the
   * world in the World Explorer's first capture.
   *
   * Re-asserted every frame rather than once, because `Stage.exit` **restores**
   * these roots: it hides them on entry and puts back whatever `display` they
   * had. So leaving the Model Explorer for any other section would hand the
   * game's UI back on top of the studio. Rather than fight over who owns the
   * saved value, the studio simply keeps re-hiding for as long as it is open —
   * and since exit is a reload, nothing needs restoring.
   */
  hideGameUi() {
    for (const id of ['ui', 'title', 'hints']) {
      const node = document.getElementById(id);
      if (node && node.style.display !== 'none') node.style.display = 'none';
    }
  }

  /** Leave the studio. @see the class header — this is deliberately a reload. */
  close() {
    const p = new URLSearchParams(location.search);
    p.delete('studio');
    const q = p.toString();
    location.replace(location.pathname + (q ? `?${q}` : ''));
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.root.remove();
    this.game.paused = this._pausedWas;
  }

  /* --------------------------------------------------------------- tick -- */

  /**
   * Registered last, so this runs after `CameraRig` has written the camera.
   *
   * `lateUpdate` rather than `update` for exactly that reason, and because
   * `game.paused` skips `update()` — a studio ticked from `update()` would
   * freeze itself along with the world it is freezing.
   */
  lateUpdate(dt: number, game: Game) {
    this.holdWorld();
    // Order matters and is the same order `DevSuite` uses: the stage may move
    // the camera (turntable, or a re-frame after a selection), then flight
    // integrates on top of that, then the pose is written to the real camera.
    // Writing before flight would make the turntable win every frame and
    // manual orbiting would do nothing.
    if (this.section === 'world' || this.section === 'shots') this.pumpWorld(dt, game);
    this.stage.update(dt, this.cam, game);
    // After the stage has moved the camera, so the pin reads this frame's yaw
    // rather than last frame's. @see ModelExplorer.pinFacing
    if (this.section === 'model') this.model.pinFacing();
    this.cam.update(dt, game.input);
    this.cam.apply(game.camera);
  }

  /**
   * Point the camera at the world and let it be flown.
   *
   * `adopt` first, so flight continues from wherever the frame already was
   * rather than snapping to an arbitrary pose — the same reason `DevSuite`'s
   * eject does it.
   */
  fly(on: boolean) {
    this.cam.setEnabled(on, this.game.camera);
  }

  /* ------------------------------------------------------------- sections */

  /**
   * Enter or leave a section's world state.
   *
   * Sections are mutually exclusive by construction: the Model Explorer owns
   * the stage, which hides every scene child, so leaving it has to restore the
   * world before anything else can show it.
   *
   * **This is the only way in, and it tells the shell.** Twice during L2 a
   * capture came back showing correct world state under stale chrome — a staged
   * bloodhorn beside a list still reading "Pick a family", and Hammerhead with
   * the studio menu printed over it — both because something changed the
   * section without the shell being told to redraw. Making the notification
   * part of the setter rather than the caller's responsibility is what stops
   * that being possible a third time.
   */
  setSection(id: SectionId | null) {
    if (this.section === id) return;
    if (this.section === 'model') this.model.exit();
    this.section = id;
    // The scrim is heavy behind the menu and almost gone inside a section, so
    // a model on a turntable is not judged through a vignette. @see studio.css
    this.root.classList.toggle('st-in-section', !!id);
    if (id === 'model') { this.model.enter(); this.fly(true); }
    else if (id === 'world' || id === 'shots') this.fly(true);
    else this.fly(false);
    if (this.onSection) this.onSection(id);
  }

  /* ------------------------------------------------------------ sections -- */

  /** Sections this build can actually offer. @see Sections.ts */
  available() {
    return SECTIONS.filter((s) => s.available());
  }
}

/**
 * Build the studio, register it, and hand back the shell.
 *
 * Registered **last** so its `lateUpdate` is the final word on the camera, the
 * same trick `installDevSuite` uses. The shells are dynamic imports so a page
 * only ever parses the one it is going to draw with.
 */
export async function openStudio(game: Game): Promise<StudioShell> {
  const shell = new StudioShell(game);
  shell.open();
  game.systems.push(shell as unknown as { lateUpdate(dt: number, game: Game): void });

  const mod = shell.touch
    ? await import('./mobile/Shell.ts')
    : await import('./desktop/Shell.ts');
  mod.install(shell);

  console.info(`[studio] open — ${shell.touch ? 'mobile' : 'desktop'} shell, ${shell.available().length} sections`);
  return shell;
}

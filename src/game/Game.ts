import * as THREE from 'three';
import { Renderer, type QualityTier } from '../engine/Renderer.ts';
import { PostFX } from '../engine/PostFX.ts';
import { Time } from '../engine/Time.ts';
import { Input } from '../engine/Input.ts';
import { Sky } from '../world/Sky.ts';
import { Terrain } from '../world/Terrain.ts';
import { Vegetation } from '../world/Vegetation.ts';
import { Water } from '../world/Water.ts';
import { Weather } from '../world/Weather.ts';
import { Props } from '../world/Props.ts';
import { Player } from '../characters/Player.ts';
import { Party } from '../characters/Party.ts';
import { Enemies } from '../characters/Enemies.ts';
import { CameraRig } from './CameraRig.ts';
import { CombatSystem } from '../combat/CombatSystem.ts';
import { VFX } from '../combat/VFX.ts';
import { HUD } from '../ui/HUD.ts';
import { Menus } from '../ui/Menus.ts';
import { AudioSystem } from '../audio/AudioSystem.ts';
import { Director } from './Director.ts';
import { RpgSystem } from './rpg/RpgSystem.ts';
import { RegaliaSystem } from '../world/vehicle/RegaliaSystem.ts';
import { InteractionSystem } from './interaction/Interactables.ts';
import { Hammerhead } from '../world/town/Hammerhead.ts';
import { Npcs } from '../characters/npc/Npcs.ts';
import { Minimap } from '../ui/Minimap.ts';
import { Cinematics } from './cinematics/Cinematics.ts';
import { StorySystem } from './story/StorySystem.ts';
import { Dungeons } from '../world/dungeons/Dungeons.ts';
import { SHOTS, isFollowShot, isApplicableShot } from './Shots.ts';
import type { ApplicableShot } from './Shots.ts';
import type { System } from '../engine/System.ts';
import type { HudCache } from '../ui/GameData.ts';

/**
 * Every key the registry answers to, and what comes back for each.
 *
 * This union is the reason `add()` takes an explicit name. Lookup once keyed on
 * `constructor.name`, which worked in dev and returned `undefined` for *every*
 * system in a production build, because the minifier mangles class names -- the
 * game crashed on load in `vite preview` while the capture harness, which only
 * ever ran the dev server, stayed green. A literal union makes `get('Terain')`
 * a compile error and `get('Terrain')` a `Terrain` rather than an `any`.
 */
export interface SystemRegistry {
  Sky: Sky;
  Terrain: Terrain;
  Water: Water;
  Vegetation: Vegetation;
  Props: Props;
  Weather: Weather;
  VFX: VFX;
  Player: Player;
  Party: Party;
  Enemies: Enemies;
  Combat: CombatSystem;
  Camera: CameraRig;
  Regalia: RegaliaSystem;
  Audio: AudioSystem;
  Rpg: RpgSystem;
  HUD: HUD;
  Minimap: Minimap;
  Menus: Menus;
  Cinematics: Cinematics;
  Story: StorySystem;
  Interaction: InteractionSystem;
  Town: Hammerhead;
  Npcs: Npcs;
  Director: Director;
  Dungeons: Dungeons;
  /**
   * Registered by `Director` once the world is up, not by the boot order --
   * they tick after Player, Party and Combat have moved everything for the
   * frame, which is the whole reason they are added late.
   */
  Encounters: import('./encounters/EncounterDirector.ts').EncounterDirector;
  PartyAI: import('../characters/ai/PartyAI.ts').PartyAI;
  Downed: import('./encounters/Downed.ts').Downed;
  /** Registered by `Player`, which builds the collision world it needs. */
  Collision: import('../world/collision/CollisionWorld.ts').CollisionWorld;
  /**
   * The `?debug` suite, registered by `installDevSuite` when the flag is on --
   * a type-only import, so the dev code stays out of a production bundle.
   */
  Dev: import('../dev/DevSuite.ts').DevSuite;
  // aliases -- callers grew up using the class name as well as the short label
  CombatSystem: CombatSystem;
  CameraRig: CameraRig;
  AudioSystem: AudioSystem;
  RpgSystem: RpgSystem;
  StorySystem: StorySystem;
}

/** Any key `Game.get()` accepts. */
export type SystemKey = keyof SystemRegistry;

/**
 * Yield to the event loop — a real task, not a microtask.
 *
 * See {@link Game.init} for the measurement that made this necessary. Kept at
 * module scope so it costs one closure for the life of the page rather than one
 * per phase, and exported because a generator loop that wants to chunk itself
 * against a time budget needs the same primitive.
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise<void>((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
    ch.port2.postMessage(0);
  });
}

/**
 * Extra keys each system answers to. Callers grew up using both the short
 * label and the class name, and neither may be derived from `constructor.name`
 * because a production build mangles it.
 */
const SYSTEM_ALIASES = {
  Combat: ['CombatSystem'],
  Camera: ['CameraRig'],
  Audio: ['AudioSystem'],
  Rpg: ['RpgSystem'],
  Story: ['StorySystem'],
};

/** What `main.ts` hands the game at construction. */
export interface GameOpts {
  /** Canvas host — `Renderer` builds its WebGL context inside this element. */
  container: HTMLElement;
  /** Where every DOM UI layer (HUD, menus, minimap, subtitles) appends itself. */
  uiRoot: HTMLElement;
  /** Loading-screen progress: 0..1 and the stage being booted. */
  onProgress?: (t: number, label: string | null) => void;
}

/**
 * Root orchestrator. Systems are initialised in dependency order and then
 * ticked every frame: update() for simulation, lateUpdate() for anything that
 * must observe the final transforms (camera, HUD, culling).
 */
export class Game {
  state!: string;
  _hudCache: HudCache | null = null;
  _raf!: number;
  _registry!: Map<string, System>;
  _running!: boolean;
  camera!: THREE.PerspectiveCamera;
  container!: HTMLElement;
  /** The shot `applyShot` last locked the world into, or null in normal play. */
  currentShot!: ApplicableShot | null;
  debug!: boolean;
  input!: Input;
  /**
   * rAF callbacks `start()`'s loop has been OFFERED, against `time.frame`
   * frames it chose to draw. The gap between the two is the cap; without it a
   * loop drawing 90 a second on a 90 Hz display is indistinguishable from an
   * uncapped one, and `time.frame` structurally cannot tell them apart because
   * the cap works by skipping. Read by `src/tools/idlecpu.mts`, which counted
   * it with a second rAF chain of its own until that chain's own BeginFrames
   * showed up as ~2% of a core in the ablation arm that is supposed to cost
   * nothing.
   */
  _rafTicks!: number;
  /**
   * Frames per second `start()`'s loop may draw; `0` free-runs at the display's
   * refresh rate, as this loop did before the cap. Live — set it on
   * `window.GAME` and the very next vsync obeys it. See `start()`.
   */
  maxFps!: number;
  onProgress!: (t: number, label: string | null) => void;
  paused!: boolean;
  post!: PostFX;
  ready!: boolean;
  renderer!: THREE.WebGLRenderer;
  rnd!: Renderer;
  scene!: THREE.Scene;
  seed!: number;
  systems!: System[];
  time!: Time;
  uiRoot!: HTMLElement;
  constructor({ container, uiRoot, onProgress }: GameOpts) {
    this.container = container;
    this.uiRoot = uiRoot;
    this.onProgress = onProgress || (() => {});
    this.time = new Time();
    this.systems = [];
    this._registry = new Map();
    this.paused = false;
    this._rafTicks = 0;
    this.state = 'boot';           // boot | field | combat | menu | cutscene
    const qs = new URLSearchParams(location.search);
    this.debug = qs.has('debug');
    /**
     * `?fps=` is a console/debugging hatch (`?fps=0` free-runs, `?fps=30`
     * halves it) and deliberately NOT a harness door. No gate sets it: `perf`
     * and `gameplay` step `frame()` by hand on a `?shoot=1` page that never
     * calls `start()`, so they are frame-*cost* instruments the cap cannot
     * reach, and `idlecpu` is supposed to measure the capped loop because the
     * capped loop is what a player runs. A flag that let a gate off the cap
     * would be the same blindfold `?shoot=1` already was.
     */
    const fps = Number(qs.get('fps'));
    this.maxFps = qs.has('fps') && Number.isFinite(fps) && fps >= 0 ? fps : 60;
  }

  /**
   * Register a system under an explicit key plus any aliases.
   *
   * Lookup must never depend on `constructor.name` — a production build
   * mangles class names, so every `game.get('Terrain')` would return
   * undefined in `vite build` output while working fine in dev.
   *
   * @param [name] registry key; defaults to the (dev-only) class name
   */
  add<K extends SystemKey>(system: SystemRegistry[K] & System, name?: K): SystemRegistry[K] {
    this.systems.push(system);
    const key = name || system.constructor.name;
    this._registry.set(key, system);
    for (const alias of SYSTEM_ALIASES[key as keyof typeof SYSTEM_ALIASES] || []) this._registry.set(alias, system);
    return system;
  }

  /** @param name registry key or alias */
  get<K extends SystemKey>(name: K): SystemRegistry[K] | undefined { return this._registry.get(name) as SystemRegistry[K] | undefined; }

  /**
   * Give the thread back to the browser, for real.
   *
   * **`await` did not do this and everybody assumed it did.** `Game.init()`
   * awaits `sys.init(this)` for twenty-six systems, and an `await` on a promise
   * that is already settled — which most of these are — schedules a
   * *microtask*. Microtasks drain at the end of the *current* task without ever
   * returning to the event loop, so there is no rendering opportunity between
   * them. Measured before this existed (`src/tools/coldload.mts --prod`): the
   * `longtask` observer saw **two** entries for an entire 8.4 s first visit and
   * the worst was **7961 ms**. The browser got 43 frames in 8.5 s, and 96% of
   * the load had no paint and no input.
   *
   * That is also why the loading bar freezes exactly when it is meant to
   * reassure: `#boot .bar i` animates `right`, which is not a compositor
   * property, so it repaints on the same main thread the boot is holding.
   *
   * A `MessageChannel` message is a genuine task, so the browser gets its
   * rendering opportunity before the next phase starts. Not `setTimeout(0)`:
   * nested timeouts are clamped to 4 ms after five levels, which across a
   * twenty-six-phase boot is ~100 ms of pure clamp.
   *
   * This does not make any single phase shorter — `Npcs` is still 1.7 s of
   * unbroken work. It turns one 8 s block into twenty-six blocks, each of which
   * the loading screen can be redrawn between.
   */
  async init() {
    const p = this.onProgress;
    p(0.02, 'Booting renderer');
    await yieldToBrowser();

    this.rnd = new Renderer(this.container);
    this.scene = this.rnd.scene;
    this.camera = this.rnd.camera;
    this.renderer = this.rnd.renderer;
    this.input = new Input(this.rnd.domElement);

    // Deterministic seeded RNG so every screenshot of the same shot matches.
    this.seed = 1337;

    /**
     * Boot order. `step` ties each factory to its own key, so a line that
     * builds the wrong system for its name is a compile error. It closes over
     * the pair rather than storing it, because a `[K, () => R[K]]` *union*
     * loses the correlation the moment it is destructured — which is what the
     * `as any` this replaced was hiding.
     */
    const step = <K extends SystemKey>(name: K, make: () => SystemRegistry[K] & System) =>
      ({ name, boot: () => this.add(make(), name) });
    const order: Array<{ name: SystemKey, boot: () => System }> = [
      step('Sky', () => new Sky()),
      step('Terrain', () => new Terrain()),
      step('Water', () => new Water()),
      step('Vegetation', () => new Vegetation()),
      step('Props', () => new Props()),
      step('Weather', () => new Weather()),
      step('VFX', () => new VFX()),
      step('Player', () => new Player()),
      step('Party', () => new Party()),
      step('Enemies', () => new Enemies()),
      step('Combat', () => new CombatSystem()),
      step('Camera', () => new CameraRig()),
      // After Camera: the drive camera writes the lens in lateUpdate.
      step('Regalia', () => new RegaliaSystem()),
      step('Audio', () => new AudioSystem()),
      // Before HUD — the HUD reads it during init. Start mid-game so the
      // capture shots show a party with real progression, not a level 1 save:
      // a level-27 retinue with a walked Ascension path, a live quest log, a
      // stocked bag and AP left to spend. Every number the UI draws comes from
      // here (see src/ui/GameData.ts).
      step('Rpg', () => new RpgSystem({ startLevel: 27, startGil: 42180, startAp: 148 })),
      step('HUD', () => new HUD()),
      step('Minimap', () => new Minimap()),
      step('Menus', () => new Menus()),
      // WS-3: the interaction verb, then Hammerhead, then the people in it.
      // Order matters — Town registers its interactables and its two screens,
      // and Npcs places itself against the anchors Town publishes.
      // After Camera so cinematics win the lens; before Director so its VFX
      // depth prepass sees the final camera.
      step('Cinematics', () => new Cinematics()),
      step('Story', () => new StorySystem()),
      step('Interaction', () => new InteractionSystem()),
      step('Town', () => new Hammerhead()),
      step('Npcs', () => new Npcs()),
      step('Director', () => new Director()),
      // Last: entering a dungeon overrides exposure, grade and the whole
      // atmosphere, so it must get the final word each frame.
      step('Dungeons', () => new Dungeons()),
    ];

    for (let i = 0; i < order.length; i++) {
      const { name, boot } = order[i];
      p(0.05 + 0.8 * (i / order.length), name);
      // The yield goes AFTER the label is set and BEFORE the work starts, so
      // the phase a person is about to wait for is the one they can read.
      // eslint-disable-next-line no-await-in-loop
      await yieldToBrowser();
      const sys = boot();
      // eslint-disable-next-line no-await-in-loop
      if (sys.init) await sys.init(this);
    }

    p(0.9, 'Compiling shaders');
    await yieldToBrowser();
    this.post = new PostFX(this.rnd);
    this.renderer.compile(this.scene, this.camera);
    p(1.0, 'Ready');

    // one warm frame so lazily-created GPU resources exist before we report ready
    this.post.render();
    // After the warm frame, so what we record is the state a caller actually
    // finds on a freshly booted page — see `_boot`.
    this.captureBootState();
    this.ready = true;
    window.dispatchEvent(new CustomEvent('game-ready'));
  }

  /**
   * Free-run the game, drawing at most `maxFps` frames a second.
   *
   * **The cap is the whole cost of an idle tab, and it is not a bug fix.**
   * `frame()` draws a full post-processed frame unconditionally — the world is
   * never static (day cycle, water, wind, TAA all animate), so there is no
   * render-on-demand path to take and never will be. Idle CPU is therefore
   * `frame cost x frame rate`, and this loop used to take every vsync the
   * display offered: measured at 96-105% of one core at 60 Hz, ~200% at 120 Hz
   * and 113% at Retina pixel scale (`idlecpu --q high --dpr 1.5`, and
   * `docs/BOOT_PERF.md` for the table). `stop()` cancels this rAF and nothing
   * else, and the same page falls to 0.5-2.4%.
   *
   * So the second factor is the lever, and 60 is `BRIEF.md` rule 3's own
   * target. This changes nothing a person sees on a 60 Hz panel — the loop was
   * already drawing 60 a second there — and halves the cost on everything
   * faster.
   *
   * ## The cap is a vsync divisor, and it is floored rather than rounded
   *
   * A wall-clock cap — `if (now - last < 1000 / 60) return` — **halves the
   * frame rate on the display it is meant to leave alone**. A 60 Hz vsync
   * arrives at 16.67 ms minus a little jitter, that reads as "too early", and
   * the next candidate is 33.3 ms away. 30 fps, on the exact hardware the cap
   * was supposed to be invisible on. Every naive frame limiter has this bug.
   *
   * rAF fires once per vsync whether or not we draw, so the gap between two
   * *callbacks* is the display's refresh period, free and measured. The only
   * rates a vsync-locked loop can actually hold are `refresh / n`, so the cap
   * is a choice of `n` — and the choice is `floor`, never `round`:
   *
   *     refresh   period   n   result
   *      30 Hz    33.33    1    30.0 fps   slower than the cap: keeps every frame
   *      60 Hz    16.67    1    60.0 fps   the cap is invisible here
   *     100 Hz    10.00    1   100.0 fps   n=2 would be 50 — under rule 3's floor
   *     120 Hz     8.33    2    60.0 fps
   *     144 Hz     6.94    2    72.0 fps   144 is not a multiple of 60
   *     165 Hz     6.06    2    82.5 fps
   *     240 Hz     4.17    4    60.0 fps
   *
   * `floor` is the whole point: `BRIEF.md` rule 3 is a **floor** of 60 fps, and
   * rounding to the nearest divisor breaks it. On a 100 Hz panel `round` picks
   * n=2 and delivers **50 fps** — a cap that makes the game worse than the rule
   * it was chosen to match. `floor` picks the highest rate at or above the cap
   * that the display can hold, so it can only ever draw *more* than 60, never
   * fewer. The price is that a 61-119 Hz panel gets no saving at all; there is
   * no vsync division there that stays legal, and the rule wins.
   * (`floor` and `round` agree on 60 and 120 Hz, which is every Mac.)
   *
   * The 5% tolerance absorbs jitter in the period estimate: at 240 Hz an
   * unsmoothed `interval / period` of 3.97 would floor to 3 and give 80 fps
   * instead of 60. `period` is an EMA seeded from the first callback-to-callback
   * delta, never from the synchronous first `loop()` — that one sits a random
   * fraction of a frame before the next vsync and would seed a lie.
   *
   * Verified against synthetic vsync trains from 30 to 360 Hz at +/-0.2, 0.4 and
   * 1.0 ms of jitter, and measured on a real page: `idlecpu --q high --dpr 1.5`
   * holds 60.0-60.2 fps in all three running arms where it held 77.8-117.5.
   */
  start() {
    if (this._running) return;
    this._running = true;
    /** `performance.now()` of the previous rAF callback, drawn or skipped. */
    let prevTick = 0;
    /** EMA of the rAF callback interval, i.e. the display's refresh period. */
    let period = 0;
    /** vsyncs seen since the last frame we drew. */
    let ticks = 0;
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      this._rafTicks++;
      const now = performance.now();
      if (prevTick) {
        const d = now - prevTick;
        // Reject a hidden tab's throttled ticks (Chrome drops rAF to ~1 Hz in a
        // background tab) rather than letting one poison the estimate.
        if (d > 0 && d < 100) period = period ? period + (d - period) * 0.05 : d;
      }
      prevTick = now;
      const cap = this.maxFps;
      if (cap > 0 && period > 0) {
        const n = Math.max(1, Math.floor((1000 / cap) / period * 1.05));
        if (++ticks < n) return;
      }
      ticks = 0;
      this.frame();
    };
    loop();
  }

  stop() { this._running = false; cancelAnimationFrame(this._raf); }

  /**
   * Put the page back where a fresh load leaves it, without reloading it.
   *
   * This is the contract the capture daemon's page reuse rests on. Measured
   * (`project/journal/2026-08-23-harness-bench.md`): a soft reset plus a repose
   * is **1.97 s against an 11.1 s reload**, and 2.00 s against 10.9 s even from
   * a dungeon interior — the lighting-changing case that was expected to invert
   * the result, because RESCUE recorded 43 shader recompiles and a 9.5 s freeze
   * from toggling one light. Leaving a dungeon costs 6 recompiles, not 43.
   *
   * THE SPEED IS NOT THE RISK. A reset that leaves formation, dungeon lighting,
   * weather or a toast behind produces frames that are *plausible and wrong*,
   * which is the most expensive kind — nothing looks broken, so the difference
   * gets attributed to whatever code changed. Under a shared daemon that state
   * crosses *agents*, where it is invisible and unattributable. So the daemon
   * checks this claim rather than trusting it: `checkResetDrift` poses a
   * `follow` shot on a reset page and byte-compares it against the fresh-boot
   * frame, once per build, because RESCUE §B1 says all 47 `follow` shots are
   * order-dependent and they are therefore the ones with something to say.
   *
   * Order matters. The dungeon is left FIRST, because leaving restores the
   * exterior lighting rig that everything after it renders under; the clock is
   * zeroed BEFORE the systems reset, so anything that stamps `time.now` (the
   * HUD's banter timer does) stamps zero.
   */
  /**
   * The state `reset()` puts back, captured the instant boot finished.
   *
   * `reset()` used to return the *systems* to their initial state and leave the
   * things that live on `Game` itself exactly where the last caller had dragged
   * them. `src/tools/resetcheck.mts` names them: after a combat-shaped
   * workload the camera sat at `252.9, 17.5, -170.4` instead of `0, 3, 8`, the
   * player at `250, 14.6, -175` instead of the origin, and the menu was still
   * open — across a reset, on a page the next gate would have been handed.
   *
   * That is the whole reason `routeLease` hardcodes `cold: true` and every play
   * gate pays a 7.46 s boot: **188 boots across 190 lease jobs**, the largest
   * remaining cost in the harness. The fix is not to relax the daemon's rule,
   * it is to make the rule unnecessary.
   *
   * Captured rather than recomputed, because "the state at boot" is the only
   * definition of correct here that cannot drift away from what actually
   * happened — a hardcoded `camera.position.set(0, 3, 8)` is a second source of
   * truth that goes stale the first time boot changes.
   */
  private _boot: {
    playerPos: THREE.Vector3; playerRotY: number; playerHeading: number;
    playerVel: THREE.Vector3;
    cameraPos: THREE.Vector3; cameraQuat: THREE.Quaternion; cameraFov: number;
    invertY: boolean; lookScale: number; quality: QualityTier;
  } | null = null;

  /** Called once, at the end of boot. See {@link _boot}. */
  private captureBootState() {
    const player = this.get('Player');
    this._boot = {
      playerPos: player ? player.root.position.clone() : new THREE.Vector3(),
      playerRotY: player ? player.root.rotation.y : 0,
      playerHeading: player ? player.heading : 0,
      playerVel: player && player.velocity ? player.velocity.clone() : new THREE.Vector3(),
      cameraPos: this.camera.position.clone(),
      cameraQuat: this.camera.quaternion.clone(),
      cameraFov: this.camera.fov,
      invertY: this.input.invertY,
      lookScale: this.input.lookScale,
      quality: this.rnd.quality,
    };
  }

  /**
   * Put back what {@link captureBootState} recorded.
   *
   * Deliberately tolerant of a missing snapshot: `reset()` is reachable from
   * photo mode and from the harness before boot has finished, and a reset that
   * throws is worse than one that restores nothing.
   */
  private restoreBootState() {
    const b = this._boot;
    if (!b) return;
    const player = this.get('Player');
    if (player) {
      player.root.position.copy(b.playerPos);
      player.root.rotation.y = b.playerRotY;
      player.heading = b.playerHeading;
      if (player.velocity) player.velocity.copy(b.playerVel);
    }
    this.camera.position.copy(b.cameraPos);
    this.camera.quaternion.copy(b.cameraQuat);
    if (this.camera.fov !== b.cameraFov) {
      this.camera.fov = b.cameraFov;
      this.camera.updateProjectionMatrix();
    }
    this.input.invertY = b.invertY;
    this.input.lookScale = b.lookScale;
    if (this.rnd.quality !== b.quality) this.rnd.setQuality(b.quality);
  }

  /**
   * Ask every system to build what it would otherwise build lazily.
   *
   * Idempotent and cheap after the first call, so the daemon can call it on
   * every `/shots` request without checking whether it already has.
   */
  warmup() {
    for (const s of this.systems) if (s.warmup) s.warmup();
  }

  reset() {
    this.stop();
    // `instant`, or the leave animates over frames nobody is going to step.
    const dungeons = this.get('Dungeons');
    if (dungeons && dungeons.isInside) dungeons.leave({ instant: true });
    this.resetClock();
    this.currentShot = null;
    this.get('Party')?.snap();
    this.get('Story')?.applyShot(null);
    this.get('Menus')?.setScreen('main');
    this.get('HUD')?.resetDemo();
    for (const s of this.systems) if (s !== dungeons && s.reset) s.reset();
    // AFTER the systems, not before: a system's own reset() may move the player
    // or the lens, and the booted state has to be the one that wins. Re-snap the
    // party afterwards so the followers land against the restored player rather
    // than the position they were dragged to.
    this.restoreBootState();
    this.get('Party')?.snap();
    // The loading screen is removed rather than faded: the transition needs
    // frames, and a page whose render loop has just been stopped is not
    // guaranteed to get them.
    document.getElementById('boot')?.remove();
  }

  /**
   * Put the world into a named, reproducible state (see Shots.ts) and lock the
   * camera. Used by src/tools/shoot.mts and by photo mode.
   */
  applyShot(name: string) {
    if (!isApplicableShot(name)) throw new Error(`unknown shot: ${name}`);
    const shot = SHOTS[name];
    // Only `PROBE_SHOT` can be a name with no shot behind it: the slot is
    // declared, and the harness has to write a framing into it first.
    if (!shot) throw new Error(`shot slot is empty: ${name}`);
    this.currentShot = name;

    // Rewind the clock per shot, not once per page. Everything phased off
    // `time.now` -- wind, grass sway, water, ambient wildlife, film grain, the
    // TAA history -- otherwise sits at a different phase depending on how many
    // shots ran before this one, so the same shot alone and sixth in a batch
    // came back measurably different. `settle()` then advances from zero.
    this.resetClock();

    const sky = this.get('Sky');
    if (shot.time != null && sky && sky.setTimeOfDay) sky.setTimeOfDay(shot.time);

    const weather = this.get('Weather');
    if (shot.weather && weather && weather.set) weather.set(shot.weather);

    const director = this.get('Director');
    if (director && director.setScenario) director.setScenario(shot.scenario || 'field');

    const hud = this.get('HUD');
    // notifications are transient by nature; without this, an AP award earned
    // during the previous shot's settle is still on screen during this one
    if (hud && hud.toasts) hud.toasts.clear();

    const menus = this.get('Menus');
    if (menus && menus.setScreen) menus.setScreen(shot.menu || null);

    const story = this.get('Story');
    if (story && story.applyShot) story.applyShot(shot.story || null);

    // HUD visibility is set *last* and wins. Story's applyShot hides the title
    // screen, and hiding it restores whatever HUD state the title had saved —
    // which defaults to visible. Setting the HUD before that call let the story
    // system silently turn the HUD back on for every shot that never asked for
    // it, which put the party panel and minimap over all 126 non-HUD shots.
    if (hud && hud.setVisible) hud.setVisible(!!shot.hud);

    // Erase animation and formation history BEFORE the camera anchors, so a
    // `follow` shot frames a settled subject rather than one still steering to
    // its slot. Formation state used to carry across shots, which made every
    // follow shot depend on what ran before it: `prompto_closeup` read as out of
    // focus (a whole-frame TAA/motion-blur smear, not DOF), and one batch put the
    // camera inside another party member. See `Party.snap`.
    const party = this.get('Party');
    if (party && party.snap) party.snap();
    const player = this.get('Player');
    if (player && player.character && player.character.anim) player.character.anim.rest();

    const rig = this.get('CameraRig');
    if (isFollowShot(shot)) {
      const p = this.followAnchor(shot.follow);
      rig!.setShot({
        pos: [p.x + shot.offset[0], p.y + shot.offset[1], p.z + shot.offset[2]],
        target: [
          p.x + (shot.lookOffset?.[0] ?? 0),
          p.y + (shot.lookOffset?.[1] ?? 1.2),
          p.z + (shot.lookOffset?.[2] ?? 0),
        ],
        fov: shot.fov,
      });
      rig!.followShot = shot;
    } else {
      rig!.followShot = null;
      rig!.setShot({ pos: [...shot.pos], target: [...shot.target], fov: shot.fov });
    }
    return shot;
  }

  /**
   * World position a follow-shot is framed against.
   *
   * `follow: 'player'` is Noctis; `'gladio' | 'ignis' | 'prompto'` frames that
   * companion directly. Guessing a companion's position as an offset from the
   * player does not work — they steer to a wandering formation slot, so the
   * guess drifts and the shot ends up pointing at empty ground.
   *
   */
  followAnchor(who: string): THREE.Vector3 {
    // `Player` is registered in the boot order, so by the time any shot is
    // applied it is there -- but the assertion this used to carry was not
    // true during a dev-server hot reload, and it surfaced as
    // `Cannot read properties of undefined (reading 'position')` thrown out of
    // `applyShot` with nothing naming the cause. Say what went wrong instead.
    const player = this.get('Player');
    if (!player) throw new Error(`followAnchor('${who}'): no Player is registered yet`);
    if (!who || who === 'player') return player.position;
    const party = this.get('Party');
    const m = party && party.get && party.get(who);
    return (m && m.root && m.root.position) || player.position;
  }

  /** Advance the simulation by `frames` fixed steps without presenting. */
  settle(frames = 30, dt = 1 / 60) {
    for (let i = 0; i < frames; i++) {
      this.frame(dt);
      // After the first frame CameraRig has the camera at the shot, so the
      // streaming systems can be told to finish *there*. Doing it here rather
      // than in `applyShot` is the whole point: at `applyShot` time the camera
      // is still wherever the previous shot left it.
      if (i === 0) for (const s of this.systems) if (s.converge) s.converge();
    }
  }

  /**
   * Zero the clock so a capture depends only on the number of fixed steps
   * taken, not on how long boot happened to take. Without this, anything
   * phased off `time.now` — film grain, wind, water, VFX — differs run to run.
   */
  resetClock() {
    const t = this.time;
    t.now = 0; t.raw = 0; t.dt = 0; t.rawDt = 0; t.frame = 0; t.scale = 1;
    t._last = performance.now() / 1000;
    // the UI memoises rpg.hudState() by frame number; rewinding the frame
    // counter would otherwise let a stale record survive the reset
    this._hudCache = null;
    for (const s of this.systems) if (s.resetClock) s.resetClock();
    if (this.post && this.post.resetHistory) this.post.resetHistory();
  }

  /** Advance one frame. Exposed so the screenshot harness can step deterministically. */
  frame(fixedDt?: number) {
    const t = this.time;
    if (fixedDt != null) {
      t.rawDt = fixedDt; t.raw += fixedDt;
      t.dt = fixedDt * t.scale; t.now += t.dt; t.frame++;
    } else {
      t.tick();
    }
    this.input.update();

    if (!this.paused) {
      for (const s of this.systems) if (s.update) s.update(t.dt, this);
    }
    for (const s of this.systems) if (s.lateUpdate) s.lateUpdate(t.dt, this);

    this.renderer.info.reset();
    this.post.update(t);
    this.post.render();
    this.input.endFrame();
  }
}

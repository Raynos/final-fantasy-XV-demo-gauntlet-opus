import * as THREE from 'three';
import { Renderer } from '../engine/Renderer.js';
import { PostFX } from '../engine/PostFX.js';
import { Time } from '../engine/Time.js';
import { Input } from '../engine/Input.js';
import { Sky } from '../world/Sky.js';
import { Terrain } from '../world/Terrain.js';
import { Vegetation } from '../world/Vegetation.js';
import { Water } from '../world/Water.js';
import { Weather } from '../world/Weather.js';
import { Props } from '../world/Props.js';
import { Player } from '../characters/Player.js';
import { Party } from '../characters/Party.js';
import { Enemies } from '../characters/Enemies.js';
import { CameraRig } from './CameraRig.js';
import { CombatSystem } from '../combat/CombatSystem.js';
import { VFX } from '../combat/VFX.js';
import { HUD } from '../ui/HUD.js';
import { Menus } from '../ui/Menus.js';
import { AudioSystem } from '../audio/AudioSystem.js';
import { Director } from './Director.js';
import { RpgSystem } from './rpg/RpgSystem.js';
import { RegaliaSystem } from '../world/vehicle/RegaliaSystem.js';
import { InteractionSystem } from './interaction/Interactables.js';
import { Hammerhead } from '../world/town/Hammerhead.js';
import { Npcs } from '../characters/npc/Npcs.js';
import { Minimap } from '../ui/Minimap.js';
import { Dungeons } from '../world/dungeons/Dungeons.js';
import { SHOTS } from './Shots.js';

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
};

/**
 * Root orchestrator. Systems are initialised in dependency order and then
 * ticked every frame: update() for simulation, lateUpdate() for anything that
 * must observe the final transforms (camera, HUD, culling).
 */
export class Game {
  constructor({ container, uiRoot, onProgress }) {
    this.container = container;
    this.uiRoot = uiRoot;
    this.onProgress = onProgress || (() => {});
    this.time = new Time();
    this.systems = [];
    this._registry = new Map();
    this.paused = false;
    this.state = 'boot';           // boot | field | combat | menu | cutscene
    this.debug = new URLSearchParams(location.search).has('debug');
  }

  /**
   * Register a system under an explicit key plus any aliases.
   *
   * Lookup must never depend on `constructor.name` — a production build
   * mangles class names, so every `game.get('Terrain')` would return
   * undefined in `vite build` output while working fine in dev.
   *
   * @param {object} system
   * @param {string} [name] registry key; defaults to the (dev-only) class name
   */
  add(system, name) {
    this.systems.push(system);
    const key = name || system.constructor.name;
    this._registry.set(key, system);
    for (const alias of SYSTEM_ALIASES[key] || []) this._registry.set(alias, system);
    return system;
  }

  /** @param {string} name registry key or alias @returns {object|undefined} */
  get(name) { return this._registry.get(name); }

  async init() {
    const p = this.onProgress;
    p(0.02, 'Booting renderer');

    this.rnd = new Renderer(this.container);
    this.scene = this.rnd.scene;
    this.camera = this.rnd.camera;
    this.renderer = this.rnd.renderer;
    this.input = new Input(this.rnd.domElement);

    // Deterministic seeded RNG so every screenshot of the same shot matches.
    this.seed = 1337;

    const order = [
      ['Sky', () => new Sky()],
      ['Terrain', () => new Terrain()],
      ['Water', () => new Water()],
      ['Vegetation', () => new Vegetation()],
      ['Props', () => new Props()],
      ['Weather', () => new Weather()],
      ['VFX', () => new VFX()],
      ['Player', () => new Player()],
      ['Party', () => new Party()],
      ['Enemies', () => new Enemies()],
      ['Combat', () => new CombatSystem()],
      ['Camera', () => new CameraRig()],
      // After Camera: the drive camera writes the lens in lateUpdate.
      ['Regalia', () => new RegaliaSystem()],
      ['Audio', () => new AudioSystem()],
      // Before HUD — the HUD reads it during init. Start mid-game so the
      // capture shots show a party with real progression, not a level 1 save:
      // a level-27 retinue with a walked Ascension path, a live quest log, a
      // stocked bag and AP left to spend. Every number the UI draws comes from
      // here (see src/ui/GameData.js).
      ['Rpg', () => new RpgSystem({ startLevel: 27, startGil: 42180, startAp: 148 })],
      ['HUD', () => new HUD()],
      ['Minimap', () => new Minimap()],
      ['Menus', () => new Menus()],
      // WS-3: the interaction verb, then Hammerhead, then the people in it.
      // Order matters — Town registers its interactables and its two screens,
      // and Npcs places itself against the anchors Town publishes.
      ['Interaction', () => new InteractionSystem()],
      ['Town', () => new Hammerhead()],
      ['Npcs', () => new Npcs()],
      ['Director', () => new Director()],
      // Last: entering a dungeon overrides exposure, grade and the whole
      // atmosphere, so it must get the final word each frame.
      ['Dungeons', () => new Dungeons()],
    ];

    for (let i = 0; i < order.length; i++) {
      const [name, make] = order[i];
      p(0.05 + 0.8 * (i / order.length), name);
      const sys = this.add(make(), name);
      // eslint-disable-next-line no-await-in-loop
      if (sys.init) await sys.init(this);
    }

    p(0.9, 'Compiling shaders');
    this.post = new PostFX(this.rnd);
    this.renderer.compile(this.scene, this.camera);
    p(1.0, 'Ready');

    // one warm frame so lazily-created GPU resources exist before we report ready
    this.post.render();
    this.ready = true;
    window.dispatchEvent(new CustomEvent('game-ready'));
  }

  start() {
    if (this._running) return;
    this._running = true;
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  stop() { this._running = false; cancelAnimationFrame(this._raf); }

  /**
   * Put the world into a named, reproducible state (see Shots.js) and lock the
   * camera. Used by tools/shoot.mjs and by photo mode.
   */
  applyShot(name) {
    const shot = SHOTS[name];
    if (!shot) throw new Error(`unknown shot: ${name}`);
    this.currentShot = name;

    const sky = this.get('Sky');
    if (shot.time != null && sky && sky.setTimeOfDay) sky.setTimeOfDay(shot.time);

    const weather = this.get('Weather');
    if (shot.weather && weather && weather.set) weather.set(shot.weather);

    const director = this.get('Director');
    if (director && director.setScenario) director.setScenario(shot.scenario || 'field');

    const hud = this.get('HUD');
    if (hud && hud.setVisible) hud.setVisible(!!shot.hud);
    // notifications are transient by nature; without this, an AP award earned
    // during the previous shot's settle is still on screen during this one
    if (hud && hud.toasts) hud.toasts.clear();

    const menus = this.get('Menus');
    if (menus && menus.setScreen) menus.setScreen(shot.menu || null);

    const rig = this.get('CameraRig');
    if (shot.follow) {
      const player = this.get('Player');
      const p = player.position;
      rig.setShot({
        pos: [p.x + shot.offset[0], p.y + shot.offset[1], p.z + shot.offset[2]],
        target: [
          p.x + (shot.lookOffset?.[0] ?? 0),
          p.y + (shot.lookOffset?.[1] ?? 1.2),
          p.z + (shot.lookOffset?.[2] ?? 0),
        ],
        fov: shot.fov,
      });
      rig.followShot = shot;
    } else {
      rig.followShot = null;
      rig.setShot({ pos: shot.pos, target: shot.target, fov: shot.fov });
    }
    return shot;
  }

  /** Advance the simulation by `frames` fixed steps without presenting. */
  settle(frames = 30, dt = 1 / 60) {
    for (let i = 0; i < frames; i++) this.frame(dt);
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
  frame(fixedDt) {
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

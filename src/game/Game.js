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
import { SHOTS } from './Shots.js';

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
    this.paused = false;
    this.state = 'boot';           // boot | field | combat | menu | cutscene
    this.debug = new URLSearchParams(location.search).has('debug');
  }

  add(system) { this.systems.push(system); return system; }
  get(name) { return this.systems.find((s) => s.constructor.name === name); }

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
      ['Audio', () => new AudioSystem()],
      ['HUD', () => new HUD()],
      ['Menus', () => new Menus()],
      ['Director', () => new Director()],
    ];

    for (let i = 0; i < order.length; i++) {
      const [name, make] = order[i];
      p(0.05 + 0.8 * (i / order.length), name);
      const sys = this.add(make());
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

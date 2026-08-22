import * as THREE from 'three';
import type { Game } from '../game/Game.ts';
import { WEATHER_NAMES } from '../world/Weather.ts';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { isLight } from '../util/three-guards.ts';
import { WEAPONS } from '../combat/Weapons.ts';
import type { WeaponClass } from '../combat/Weapons.ts';

/**
 * One entry in the warm-up log: how long a step took and what it cost, or why
 * it failed. Every step is wrapped, so a step that threw still has a row.
 */
export interface WarmupStep {
  name: string;
  ms?: number;
  /** Programs compiled by this step. */
  programs?: number;
  error?: string;
}

/**
 * `CombatSystem.weaponCache` is keyed by class but declared `Map<string, …>`,
 * so the restore at the end of `_warmWeapons` has to re-narrow. `WEAPONS` is
 * the class table itself, which makes this the definition rather than a guess.
 */
function isWeaponClass(k: string): k is WeaponClass {
  return Object.hasOwn(WEAPONS, k);
}


/**
 * Boot-time shader pre-warm.
 *
 * A WebGL program is compiled and linked the first time the renderer needs it,
 * synchronously, in the middle of whatever frame asked for it. On this content
 * a single patched `MeshStandardMaterial` program takes 300–500 ms to build on
 * the Metal backend, so a material that first appears when the player swaps
 * weapon, when a storm rolls in, or when a distant prop swaps LOD, stops the
 * game dead. Players read that as the game freezing; it was measured at up to
 * 15 seconds on a weapon swap.
 *
 * `renderer.compile(scene, camera)` covers the base program of everything that
 * is *in the scene graph* — visible or not — but not:
 *
 *   - shadow depth variants, which are only built when an object is actually
 *     drawn into a shadow map;
 *   - material states that only exist once a system changes mode (weather
 *     presets, night lighting, the wet/dry terrain split);
 *   - materials constructed lazily on first use.
 *
 * So this walks the reachable state space once, during load, forcing each
 * permutation to render one throwaway frame into a tiny target. Every piece is
 * wrapped in a try/catch: a warm-up that fails must cost us a stutter later,
 * never the boot.
 */
export class Warmup {
  renderer!: THREE.WebGLRenderer;
  camera!: THREE.Camera;
  game!: Game;
  log!: WarmupStep[];
  ms!: number;
  scene!: THREE.Scene;
  /**
   * Programs three has compiled so far. `info.programs` is nullable in three's
   * own types (it is only populated once the renderer has an info block), so
   * the null lands here once instead of at each of the four call sites.
   */
  get programCount(): number { return this.renderer.info.programs?.length ?? 0; }

  constructor(game: Game) {
    this.game = game;
    this.renderer = game.renderer;
    this.scene = game.scene;
    this.camera = game.camera;
    this.log = [];
    this.ms = 0;
  }

  /**
   * Run the whole sweep. Blocking, and meant to be: it belongs on the loading
   * screen. Restores every piece of state it touches.
   */
  run(): { ms: number, programs: number, steps: WarmupStep[] } {
    const t0 = performance.now();
    const rt = new THREE.WebGLRenderTarget(64, 64, { depthBuffer: true });
    const prevTarget = this.renderer.getRenderTarget();
    const before = this.programCount;

    try {
      this._step('scene', () => this._compileScene(rt));
      this._rest(rt);
    } finally {
      this.renderer.setRenderTarget(prevTarget);
      rt.dispose();
    }

    this.ms = performance.now() - t0;
    return {
      ms: this.ms,
      programs: this.programCount - before,
      steps: this.log,
    };
  }

  /**
   * The same sweep with the scene compile handed to `renderer.compileAsync`.
   *
   * `KHR_parallel_shader_compile` lets the driver link on its own threads and
   * three polls `COMPLETION_STATUS_KHR` until they are done, so on paper the
   * 110 programs of the `scene` step could overlap instead of queueing. Whether
   * that is true *here* is the whole question, and a probe that clones a
   * material and adds an unread `#define` cannot answer it — that changes
   * three's program key without changing the GLSL ANGLE compiles, so it
   * measures the polling loop and nothing else. This measures the real sweep.
   *
   * Everything after the scene step stays synchronous and in order, because
   * `_warmPostPasses` renders through the composer and resets the temporal
   * history: interleaving it with anything is a determinism problem, not a
   * speed one.
   */
  async runAsync(): Promise<{ ms: number, programs: number, steps: WarmupStep[] }> {
    const t0 = performance.now();
    const rt = new THREE.WebGLRenderTarget(64, 64, { depthBuffer: true });
    const prevTarget = this.renderer.getRenderTarget();
    const before = this.programCount;

    try {
      const t = performance.now();
      const p0 = this.programCount;
      try {
        this._patchAll();
        await this.renderer.compileAsync(this.scene, this.camera);
        this._render(rt);
        this.log.push({ name: 'scene (async)', ms: +(performance.now() - t).toFixed(1), programs: this.programCount - p0 });
      } catch (e: unknown) {
        this.log.push({ name: 'scene (async)', error: e instanceof Error ? e.message : String(e) });
      }
      this._rest(rt);
    } finally {
      this.renderer.setRenderTarget(prevTarget);
      rt.dispose();
    }

    this.ms = performance.now() - t0;
    return { ms: this.ms, programs: this.programCount - before, steps: this.log };
  }

  /**
   * Everything after the scene compile. Shared by both entry points so the two
   * are the same sweep and the only variable is how the scene was compiled.
   */
  _rest(rt: THREE.WebGLRenderTarget) {
    this._step('shadow casters', () => this._warmShadows(rt));
    this._step('weapons', () => this._warmWeapons(rt));
    this._step('vfx', () => this._warmVfx(rt));
    this._step('weather', () => this._warmWeather(rt));
    this._step('post passes', () => this._warmPostPasses());
    this._step('time of day', () => this._warmTimeOfDay(rt));
  }

  _step(name: string, fn: () => void) {
    const t = performance.now();
    const p0 = this.programCount;
    try { fn(); } catch (e: unknown) {
      this.log.push({ name, error: e instanceof Error ? e.message : String(e) });
      return;
    }
    this.log.push({
      name,
      ms: +(performance.now() - t).toFixed(1),
      programs: this.programCount - p0,
    });
  }

  /**
   * Make sure the atmosphere patch has claimed every material *before* we
   * compile anything.
   *
   * The patch rescans on a countdown, so a material born between two scans is
   * compiled once bare and then again once patched — paying the expensive
   * compile twice, the second time mid-frame.
   */
  _patchAll() {
    const sky = this.game.get('Sky');
    if (sky && sky.patch) sky.patch.scan(this.scene);
    if (this.game.post && this.game.post.guardOverrides) this.game.post.guardOverrides(this.scene);
  }

  /** One render of the whole scene into a tiny target, shadows included. */
  _render(rt: THREE.WebGLRenderTarget, { shadows = false } = {}) {
    this._patchAll();
    const r = this.renderer;
    const sky = this.game.get('Sky');
    if (shadows && sky && sky.csm) for (const l of sky.csm.lights) l.shadow.needsUpdate = true;
    r.setRenderTarget(rt);
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
  }

  _compileScene(rt: THREE.WebGLRenderTarget) {
    this._patchAll();
    this.renderer.compile(this.scene, this.camera);
    this._render(rt);
  }

  /**
   * Draw every mesh in the scene once, visible, with the cascades forced to
   * refresh — that is the only way three builds the depth variants.
   */
  _warmShadows(rt: THREE.WebGLRenderTarget) {
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o: THREE.Object3D) => {
      // Lights are deliberately left alone: their visibility is the light
      // budget's business, and showing them all would push the count past it.
      if (isLight(o)) return;
      if (o.visible === false) { hidden.push(o); o.visible = true; }
    });
    try {
      this._render(rt, { shadows: true });
    } finally {
      for (const o of hidden) o.visible = false;
    }
  }

  /** Every weapon class and the Armiger swarm, drawn once. */
  _warmWeapons(rt: THREE.WebGLRenderTarget) {
    const combat = this.game.get('Combat');
    if (!combat) return;
    const kind = combat.weapon && combat.weapon.kind;
    const current = kind && isWeaponClass(kind) ? kind : null;
    const armiger = combat.armiger;
    const armWas = armiger && armiger.group.visible;
    const armActive = armiger && armiger.active;

    if (armiger) {
      armiger.active = 1;
      armiger.layout(this.camera.position, 0);
      armiger.group.visible = true;
    }
    try {
      for (const [, w] of combat.weaponCache) {
        const was = w.root.visible;
        w.root.visible = true;
        w.setReveal(0.5);            // the dissolve branch of the shader too
        this._render(rt, { shadows: true });
        w.setReveal(was ? 1 : 0);
        w.root.visible = was;
      }
      this._render(rt, { shadows: true });
    } finally {
      if (armiger) {
        armiger.active = armActive;
        armiger.layout(this.camera.position, 0);
        armiger.group.visible = armWas;
      }
      if (current) combat.setWeapon(current, { materialise: false });
    }
  }

  /**
   * VFX systems keep their meshes resident but empty, so their programs only
   * compile the first time something is actually on screen. Drawing them once
   * with everything visible is enough — the geometry can stay empty.
   */
  _warmVfx(rt: THREE.WebGLRenderTarget) {
    const vfx = this.game.get('VFX');
    if (!vfx || !vfx.root) return;
    const hidden: THREE.Object3D[] = [];
    vfx.root.traverse((o: THREE.Object3D) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    const wasRoot = vfx.root.visible;
    vfx.root.visible = true;
    try {
      this._render(rt, { shadows: true });
    } finally {
      for (const o of hidden) o.visible = false;
      vfx.root.visible = wasRoot;
    }
  }

  /** Every weather preset, including the wet-surface variants. */
  _warmWeather(rt: THREE.WebGLRenderTarget) {
    const wx = this.game.get('Weather');
    if (!wx || !wx.set) return;
    // `Weather.name` is declared `string`, so narrow it rather than trusting it.
    const back = wx.name || 'clear';
    try {
      for (const name of WEATHER_NAMES) {
        wx.set(name);
        if (wx.snap) wx.snap();
        // Wetness ramps over a couple of seconds and only *then* switches
        // surfaces to a clearcoat shader, so a single tick warms the dry
        // variant and leaves the wet one to compile out in the rain.
        if (wx.update) for (let i = 0; i < 24; i++) wx.update(1 / 12, this.game);
        this._render(rt, { shadows: true });
      }
    } finally {
      wx.set(back);
      if (wx.snap) wx.snap();
      if (wx.update) wx.update(1 / 60, this.game);
      this.renderer.compile(this.scene, this.camera);
    }
  }

  /**
   * Post passes that boot disabled.
   *
   * Everything above compiles through `renderer.render(scene, camera)`, which
   * never touches the composer — so a pass that is off at boot only builds its
   * program the first frame something turns it on. That is a real hitch in
   * play, not a theoretical one: screen-space reflections come on with the wet
   * ground when a storm clears, and the compile was measured at **240 ms**
   * inside `SsrPass.render`, which was the whole of the weather-change spike.
   *
   * One composer pass with every disabled pass forced on is enough. It draws a
   * junk frame — the matrices this early are whatever the camera had before
   * `PostFX.render()` set them — so the temporal history is dropped afterwards.
   */
  _warmPostPasses() {
    const post = this.game.post;
    if (!post || !post.composer) return;
    const forced: Pass[] = [];
    for (const pass of post.composer.passes) {
      if (pass.enabled === false) { pass.enabled = true; forced.push(pass); }
    }
    if (!forced.length) return;
    try {
      post.composer.render(1 / 60);
    } finally {
      for (const pass of forced) pass.enabled = false;
      if (post.resetHistory) post.resetHistory();
      this.renderer.setRenderTarget(null);
    }
  }

  /**
   * Night swaps the key light from sun to moon and turns the world's emissive
   * and lamp materials on, which is a different shader state from noon.
   */
  _warmTimeOfDay(rt: THREE.WebGLRenderTarget) {
    const sky = this.game.get('Sky');
    if (!sky || !sky.setTimeOfDay) return;
    const back = sky.hours ?? 12;
    try {
      for (const h of [1, 6.5, 12, 18.5, 22]) {
        sky.setTimeOfDay(h);
        this._render(rt, { shadows: true });
      }
    } finally {
      sky.setTimeOfDay(back);
      this._render(rt, { shadows: true });
    }
  }
}

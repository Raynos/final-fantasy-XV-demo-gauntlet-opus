import * as THREE from 'three';

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
  /** @param {object} game */
  constructor(game) {
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
   * @returns {{ms:number, programs:number, steps:Array}}
   */
  run() {
    const t0 = performance.now();
    const rt = new THREE.WebGLRenderTarget(64, 64, { depthBuffer: true });
    const prevTarget = this.renderer.getRenderTarget();
    const before = this.renderer.info.programs.length;

    try {
      this._step('scene', () => this._compileScene(rt));
      this._step('shadow casters', () => this._warmShadows(rt));
      this._step('weapons', () => this._warmWeapons(rt));
      this._step('vfx', () => this._warmVfx(rt));
      this._step('weather', () => this._warmWeather(rt));
      this._step('time of day', () => this._warmTimeOfDay(rt));
    } finally {
      this.renderer.setRenderTarget(prevTarget);
      rt.dispose();
    }

    this.ms = performance.now() - t0;
    return {
      ms: this.ms,
      programs: this.renderer.info.programs.length - before,
      steps: this.log,
    };
  }

  _step(name, fn) {
    const t = performance.now();
    const p0 = this.renderer.info.programs.length;
    try { fn(); } catch (e) {
      this.log.push({ name, error: String((e && e.message) || e) });
      return;
    }
    this.log.push({
      name,
      ms: +(performance.now() - t).toFixed(1),
      programs: this.renderer.info.programs.length - p0,
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
  _render(rt, { shadows = false } = {}) {
    this._patchAll();
    const r = this.renderer;
    const sky = this.game.get('Sky');
    if (shadows && sky && sky.csm) for (const l of sky.csm.lights) l.shadow.needsUpdate = true;
    r.setRenderTarget(rt);
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
  }

  _compileScene(rt) {
    this._patchAll();
    this.renderer.compile(this.scene, this.camera);
    this._render(rt);
  }

  /**
   * Draw every mesh in the scene once, visible, with the cascades forced to
   * refresh — that is the only way three builds the depth variants.
   */
  _warmShadows(rt) {
    const hidden = [];
    this.scene.traverse((o) => {
      // Lights are deliberately left alone: their visibility is the light
      // budget's business, and showing them all would push the count past it.
      if (o.isLight) return;
      if (o.visible === false) { hidden.push(o); o.visible = true; }
    });
    try {
      this._render(rt, { shadows: true });
    } finally {
      for (const o of hidden) o.visible = false;
    }
  }

  /** Every weapon class and the Armiger swarm, drawn once. */
  _warmWeapons(rt) {
    const combat = this.game.get('Combat');
    if (!combat) return;
    const current = combat.weapon && combat.weapon.kind;
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
  _warmVfx(rt) {
    const vfx = this.game.get('VFX');
    if (!vfx || !vfx.root) return;
    const hidden = [];
    vfx.root.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
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
  _warmWeather(rt) {
    const wx = this.game.get('Weather');
    if (!wx || !wx.set) return;
    const back = wx.name || 'clear';
    try {
      for (const name of ['clear', 'overcast', 'storm', 'fog']) {
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
   * Night swaps the key light from sun to moon and turns the world's emissive
   * and lamp materials on, which is a different shader state from noon.
   */
  _warmTimeOfDay(rt) {
    const sky = this.game.get('Sky');
    if (!sky || !sky.setTimeOfDay) return;
    const back = sky.timeOfDay ?? sky.hours ?? sky.hour ?? 12;
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

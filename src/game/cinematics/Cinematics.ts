import * as THREE from 'three';
import { Letterbox } from './Letterbox.ts';
import { Stage } from './Stage.ts';
import { Timeline } from './Timeline.ts';
import { Frame } from './CameraMove.ts';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The cutscene runtime.
 *
 * A scene is plain data (see `src/game/story/scenes/`): a staging function, a
 * list of camera set-ups, a list of timed cues, and an optional per-frame
 * `tick`. This class turns that into a played cutscene — it takes the camera,
 * the four characters, the HUD and the lens away from gameplay, runs the
 * timeline, and hands every one of them back in `stop()` whether the scene ran
 * to the end, was skipped, or threw.
 *
 * ```js
 * const cine = game.get('Cinematics');
 * cine.play(OPENING);                 // returns a promise resolving on end
 * cine.seek(18.5);                    // capture harness: park at one frame
 * cine.skip();                        // player pressed Escape
 * ```
 *
 * Costs nothing when idle: `update` returns on the first line and the whole DOM
 * layer sets `display:none`.
 *
 * Ordering contract: register **after** `Camera` (so writing the camera in
 * `lateUpdate` wins over the third-person rig) and **before** `Director` (whose
 * `lateUpdate` runs the VFX depth prepass and needs the final camera).
 */
export class Cinematics {
  _cam!: any;
  _cut!: boolean;
  _dofWas!: any;
  _prevHud!: boolean;
  _prevScale!: number;
  _prevState!: string;
  _resolve!: any;
  _skipHeld!: number;
  _slow!: any;
  _v!: THREE.Vector3;
  box!: Letterbox;
  ctx!: any;
  external!: any;
  game!: any;
  playing!: boolean;
  scene!: any;
  skippable!: boolean;
  stage!: Stage;
  tl!: Timeline | null;
  async init(game: any) {
    this.game = game;
    this.box = new Letterbox(game.uiRoot);
    this.stage = new Stage(game);
    this.scene = null;
    this.tl = null;
    this.ctx = null;
    this.playing = false;
    this._resolve = null;
    this._prevHud = true;
    this._prevState = 'field';
    this._prevScale = 1;
    this._slow = null;
    this._cut = true;
    this._cam = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 45, roll: 0 };
    this._v = new THREE.Vector3();
    this._skipHeld = 0;
    /** Set true by the title screen so its attract camera can borrow the rig. */
    this.external = null;
  }

  /* --------------------------------------------------------------- API -- */

  /**
   * Play a scene.
   * @param def scene definition
   * @param [opts] `{ skippable }`
   */
  play(def: any, opts: any = {}): Promise<{skipped:boolean, id:string | null}> {
    if (!def) return Promise.resolve({ skipped: false, id: null });
    if (this.playing) this.stop({ skipped: true });

    const game = this.game;
    this.scene = def;
    this.skippable = opts.skippable !== false && def.skippable !== false;

    const ctx = {
      game,
      stage: this.stage,
      cine: this,
      terrain: game.get('Terrain'),
      props: game.get('Props'),
      rpg: game.get('Rpg'),
      sky: game.get('Sky'),
      audio: game.get('Audio'),
      vfx: game.get('VFX'),
      box: this.box,
      Frame,
      data: {},
    };
    this.ctx = ctx;

    this.stage.acquire();
    if (def.stage) def.stage(ctx);

    // Camera set-ups are built *after* staging so their keyframes can be
    // written in scene-local metres against a frame the scene just resolved
    // from the live world.
    const shots = def.buildShots ? def.buildShots(ctx) : (def.shots || []);
    this.tl = new Timeline({ ...def, shots }, ctx);
    this.playing = true;
    this._cut = true;
    this._skipHeld = 0;

    // take the screen
    const hud = game.get('HUD');
    this._prevHud = hud ? hud.visible : true;
    if (hud) hud.setVisible(false);
    const menus = game.get('Menus');
    if (menus && menus.name) menus.setScreen(null);

    this._prevState = game.state;
    game.state = 'cutscene';
    this._prevScale = game.time.scale;

    this.box.reset();
    this.box.setBars(def.letterbox ?? 1);
    if (def.openFromBlack) this.box.snapFade(1);
    const rig = game.get('CameraRig');
    if (rig) rig.clearShot();

    if (def.onStart) def.onStart(ctx);
    window.dispatchEvent(new CustomEvent('ffxv-cutscene', { detail: { phase: 'start', id: def.id } }));

    return new Promise((res) => { this._resolve = res; });
  }

  /**
   * Fast-forward to the end: every world-changing cue still fires, so the game
   * state after a skip is identical to the state after watching.
   */
  skip() {
    if (!this.playing || !this.skippable) return;
    this.tl!.fastForward((c) => this._cue(c, true));
    this.box.clearLine();
    this.stop({ skipped: true });
  }

  /**
   * End the scene and give everything back.
   * @param [opts] `{ skipped }`
   */
  stop(opts: any = {}) {
    if (!this.playing) return;
    const def = this.scene;
    const ctx = this.ctx;
    this.playing = false;

    try { if (def && def.onEnd) def.onEnd(ctx, !!opts.skipped); } catch (e) { console.warn('[Cinematics] onEnd', e); }

    this.stage.release({ restorePositions: !!(def && def.restorePositions) });

    const game = this.game;
    const hud = game.get('HUD');
    if (hud) { hud.setVisible(this._prevHud); if (hud.setMenuOpen) hud.setMenuOpen(false); }
    game.state = this._prevState === 'cutscene' ? 'field' : this._prevState;
    game.time.scale = this._prevScale;
    this._slow = null;

    const rig = game.get('CameraRig');
    if (rig) rig.clearShot();
    if (game.post) { game.post.resetHistory(); if (game.post.snapFocus) game.post.snapFocus(); }
    if (this._dofWas != null && game.post && game.post.dof) {
      game.post.dof.fStop = this._dofWas;
      this._dofWas = null;
    }

    // Drop the subtitle before the bars go. The line lives on `Letterbox`
    // (`#cine .cine-line`), deliberately separate from the HUD's `Subtitles`
    // stack, and `clearLine()` was only ever called from `skip()` -- so a scene
    // ended by a new shot left its last line on screen. It then burned into
    // *every* later capture on the same page, not just `menu_title`:
    // `zone_malmalam` shot after `cine_astral` came back with "the ground is
    // moving" across the frame, silently corrupting full-corpus runs.
    if (this.box.clearLine) this.box.clearLine();
    this.box.setBars(0);
    this.box.setFade(0, def && def.closeFadeOut ? def.closeFadeOut : 0.9);

    const id = def ? def.id : null;
    this.scene = null;
    this.tl = null;
    this.ctx = null;
    window.dispatchEvent(new CustomEvent('ffxv-cutscene', { detail: { phase: 'end', id, skipped: !!opts.skipped } }));
    const r = this._resolve;
    this._resolve = null;
    if (r) r({ skipped: !!opts.skipped, id });
  }

  /**
   * Park a playing scene at an absolute time. Used by the capture harness to
   * grab a named beat without waiting for it in real time.
   * @param t seconds
   * @param [step=1/30] integration step used to walk the play-head
   */
  seek(t: number, step: number = 1 / 30) {
    if (!this.playing) return;
    let guard = 0;
    while (this.tl!.t < t && guard++ < 4000) {
      const dt = Math.min(step, t - this.tl!.t);
      this._advance(dt, dt);
      if (!this.playing) break;
    }
  }

  /* -------------------------------------------------------------- tick -- */

  update(dt: any, game: any) {
    if (!this.playing) { this.box.update(dt, false); return; }
    // `hud.setVisible(false)` only stands the *field* HUD down; the combat
    // layer follows combat state on its own, so a scene that spawns enemies as
    // set dressing would otherwise draw a reticle and a tech bar over its own
    // dialogue. The menu flag suppresses both, and Menus writes it earlier in
    // the tick, so re-asserting it here wins.
    const hud = game.get('HUD');
    if (hud && hud.setMenuOpen) hud.setMenuOpen(true);
    this._input(game);
    if (!this.playing) { this.box.update(dt, false); return; }
    this._advance(game.time.rawDt || dt, dt);
  }

  /** One timeline step. `sceneDt` drives cues, `worldDt` drives the actors. */
  _advance(sceneDt: any, worldDt: any) {
    const def = this.scene;
    const ctx = this.ctx;

    if (this._slow) {
      this._slow.t += sceneDt;
      const s = this._slow;
      const k = Math.min(1, s.t / s.dur);
      // ease back to real time over the tail of the beat
      this.game.time.scale = k < 0.72 ? s.scale : s.scale + (1 - s.scale) * ((k - 0.72) / 0.28);
      if (k >= 1) { this.game.time.scale = 1; this._slow = null; }
    }

    const cut = this.tl!.step(sceneDt, (c) => this._cue(c, false));
    if (cut) this._cut = true;

    if (def.tick) {
      try { def.tick(this.tl!.t, worldDt, ctx); } catch (e) { console.warn('[Cinematics] tick', e); }
    }
    this.stage.tick(worldDt);
    this.box.update(sceneDt, true);

    if (this.tl!.done) this.stop({ skipped: false });
  }

  lateUpdate(dt: any, game: any) {
    if (!this.playing || !this.tl) return;
    const i = this.tl.shotIndex >= 0 ? this.tl.shotIndex : 0;
    const shot = this.tl.shots[i];
    if (!shot) return;
    const s = shot.sample(this.tl.t);

    // A tracking shot must aim at where the subject *is*, not at where a
    // keyframe guessed he would be: over a twelve-second dolly alongside a
    // walking actor the two diverge by most of a metre, which is the whole
    // difference between a centred two-shot and one hanging off the frame edge.
    if (shot.aim) this._aim(shot, s.target);

    const cam = game.camera;
    cam.up.copy(UP);
    cam.position.copy(s.pos);
    this._cam.target.copy(s.target);
    cam.lookAt(this._cam.target);
    if (s.roll) cam.rotateZ(s.roll);
    if (Math.abs(cam.fov - s.fov) > 1e-4) { cam.fov = s.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld(true);

    // ---- lens: focus and aperture per set-up
    const post = game.post;
    if (post) {
      if (shot.fStop != null && post.dof) {
        if (this._dofWas == null) this._dofWas = post.dof.fStop;
        post.dof.fStop = shot.fStop;
      }
      const d = shot.focus === 'auto' || shot.focus == null
        ? cam.position.distanceTo(this._cam.target)
        : typeof shot.focus === 'number'
          ? shot.focus
          : cam.position.distanceTo(this._resolveFocus(shot.focus));
      if (post.setFocusDistance) post.setFocusDistance(d);
      if (this._cut) {
        post.resetHistory();
        if (post.snapFocus) post.snapFocus();
        else if (post.dof) post.dof.focusDistance = d;
        this._cut = false;
      }
    }
  }

  /**
   * Resolve a shot's live aim into `out`. `aim` is one actor id, a list of them
   * (aim at their centroid), or `'crew'` for everyone on stage.
   * @param out sampled target; overwritten in place
   */
  _aim(shot: any, out: THREE.Vector3) {
    const ids = shot.aim === 'crew' ? this.stage.ids
      : Array.isArray(shot.aim) ? shot.aim : [shot.aim];
    let n = 0;
    let x = 0, y = 0, z = 0;
    for (const id of ids) {
      const a = this.stage.actor(id);
      if (!a) continue;
      x += a.pos.x; y += a.pos.y; z += a.pos.z; n++;
    }
    if (!n) return;
    // `aimU` is metres above the staged foot position — the same ground the
    // shot's own camera height is measured from, which is what keeps a shot
    // level when the two are sampled at different points on sloping terrain.
    // The camera body still wobbles (handheld rides its position), so the
    // framing stays alive even though the aim itself is dead-on.
    out.set(x / n, y / n + shot.aimU, z / n);
  }

  /** `focus: 'noctis'` etc. — pull focus onto a staged actor's eyes. */
  _resolveFocus(name: any) {
    const a = this.stage.actor(name);
    if (a) return this.stage.eyeOf(name, this._v);
    return this._cam.target;
  }

  /* -------------------------------------------------------------- cues -- */

  _cue(c: any, skipping: any) {
    const ctx = this.ctx;
    try {
      if (c.fn) c.fn(ctx, skipping);
      if (skipping) return;
      if (c.say) this.box.say(c.say[0], c.say[1], c.dur);
      if (c.clearLine) this.box.clearLine();
      if (c.bars != null) this.box.setBars(c.bars);
      if (c.fade) this.box.setFade(c.fade.to ?? 0, c.fade.dur ?? 1, c.fade.colour || 'black');
      if (c.area) {
        window.dispatchEvent(new CustomEvent('ffxv-area', {
          detail: { name: c.area.name, sub: c.area.sub, meta: c.area.meta },
        }));
      }
      if (c.chapter) {
        this.box.chapterCard(c.chapter.n, c.chapter.name, c.chapter.sub, c.chapter.kind || 'open');
      }
      if (c.objective) this.box.objective(c.objective.title, c.objective.sub);
      if (c.slowmo) this._slow = { t: 0, scale: c.slowmo.scale ?? 0.35, dur: c.slowmo.dur ?? 1.2 };
      if (c.shake && ctx) {
        const rig = ctx.game.get('CameraRig');
        if (rig && rig.addTrauma) rig.addTrauma(c.shake);
      }
      if (c.sfx && ctx && ctx.audio && ctx.audio.play) ctx.audio.play(c.sfx, c.sfxAt || null, c.sfxOpts || {});
      if (c.music && ctx && ctx.audio && ctx.audio.setState) ctx.audio.setState(c.music);
    } catch (e) {
      console.warn('[Cinematics] cue', e);
    }
  }

  _input(game: any) {
    const inp = game.input;
    if (!inp || !this.skippable) return;
    const down = (k: any) => inp.keyDown && inp.keyDown(k);
    const gp = (i: any) => inp.gamepad && inp.gamepad.buttons && inp.gamepad.buttons[i] && inp.gamepad.buttons[i].pressed;
    if (down('Escape') || down('Enter') || down('Space') || gp(1)) this.skip();
  }
}

export default Cinematics;

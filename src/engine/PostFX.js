import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

import { ScenePass } from './postfx/ScenePass.js';
import { VelocityPass } from './postfx/VelocityPass.js';
import { TaaPass } from './postfx/TaaPass.js';
import { DofPass } from './postfx/DofPass.js';
import { MotionBlurPass } from './postfx/MotionBlurPass.js';
import { BloomPass } from './postfx/BloomPass.js';
import { SsrPass } from './postfx/SsrPass.js';
import { ContactShadowPass } from './postfx/ContactShadowPass.js';
import { GradePass } from './postfx/GradePass.js';
import { CasPass } from './postfx/CasPass.js';
import { Exposure } from './postfx/Exposure.js';
import { GRADES, lutFor } from '../shaders/post/grades.js';

/**
 * Cinematic post-processing pipeline.
 *
 *   scene(HDR + depth, jittered)
 *     -> auto exposure -> GTAO -> contact shadows -> SSR -> TAA
 *     -> bokeh DOF -> motion blur
 *     -> bloom / anamorphic / lens dirt / flares / sun glare
 *     -> grade (white balance, contrast, LGG, vignette, ACES, 3D LUT, grain)
 *     -> CAS sharpen + dither -> screen
 *
 * Public surface used by other systems:
 *   post.bloom            strength / radius / threshold / anamorphic / dirtAmount
 *   post.gtao             three GTAOPass (fed our depth buffer, no extra scene pass)
 *   post.contact          screen-space contact shadows (intensity / length)
 *   post.dof              fStop / focusDistance / bokehScale / maxCoc
 *   post.motionBlur       shutter / maxRadius
 *   post.taa, post.ssr, post.grade, post.cas, post.exposure
 *   post.setGrade(name, t), post.setGradeBlend(a, b, t)
 *   post.setFocusTarget(obj|vec3|null), post.setFocusDistance(m)
 *   post.setQuality(tier), post.setAA('taa'|'smaa'|'none')
 *   post.resetHistory()
 */
export class PostFX {
  constructor(rnd) {
    this.rnd = rnd;
    const { renderer, scene, camera } = rnd;
    this.scene = scene;
    this.camera = camera;

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.width = size.x;
    this.height = size.y;
    this.dt = 1 / 60;
    this.frame = 0;

    // ---- matrices used by every reprojecting pass ----------------------
    this.viewProj = new THREE.Matrix4();
    this.prevViewProj = new THREE.Matrix4();
    this.invViewProj = new THREE.Matrix4();
    this.jitterUv = new THREE.Vector2();
    this._prevCamPos = new THREE.Vector3();

    // ---- sun / lens flare driver ---------------------------------------
    this.sun = null;
    this.sunScreen = new THREE.Vector4(0.5, 0.5, 0, 1);
    this.sunColor = new THREE.Vector3(1.0, 0.84, 0.6);
    this._v = new THREE.Vector3();

    // ---- targets --------------------------------------------------------
    this.rtScene = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    this.rtScene.texture.name = 'PostFX.scene';
    this.rtScene.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.rtScene.depthTexture.type = THREE.UnsignedIntType;

    this.rtVel = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    this.rtVel.depthTexture = this.rtScene.depthTexture;

    this.oneTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.oneTexture.needsUpdate = true;

    // ---- composer -------------------------------------------------------
    const composerRT = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    this.composer = new EffectComposer(renderer, composerRT);
    this.composer.setPixelRatio(1);

    this.exposure = new Exposure(size.x, size.y);

    this.scenePass = new ScenePass(this);
    this.composer.addPass(this.scenePass);

    this.velocity = new VelocityPass(this);
    this.composer.addPass(this.velocity);

    this.gtao = new GTAOPass(scene, camera, size.x, size.y);
    // reuse our depth buffer: no second scene render, normals from depth
    this.gtao.setGBuffer(this.rtScene.depthTexture);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    // A 1.1 m gather is a *room* radius: it darkens the underside of a cliff
    // beautifully and does nothing at all to the eight centimetres where a
    // boot meets the ground, because at that scale the ground is its own
    // horizon. Pulling it in to knee height puts the occlusion where a human
    // figure actually needs it, and the contact-shadow pass below covers the
    // last few centimetres the AO still cannot see.
    this.gtao.updateGtaoMaterial({
      radius: 0.62,
      distanceExponent: 1.35,
      thickness: 0.45,
      scale: 1.25,
      samples: 16,
      distanceFallOff: 1.0,
      screenSpaceRadius: false,
    });
    this.gtao.blendIntensity = 0.9;
    this.composer.addPass(this.gtao);

    this.contact = new ContactShadowPass(this);
    this.composer.addPass(this.contact);

    this.ssr = new SsrPass(this);
    this.composer.addPass(this.ssr);

    this.taa = new TaaPass(this, size.x, size.y);
    this.composer.addPass(this.taa);

    this.dof = new DofPass(this, size.x, size.y);
    this.composer.addPass(this.dof);

    this.motionBlur = new MotionBlurPass(this);
    this.composer.addPass(this.motionBlur);

    this.bloom = new BloomPass(this, size.x, size.y);
    this.composer.addPass(this.bloom);

    this.grade = new GradePass(this);
    this.composer.addPass(this.grade);

    this.smaa = new SMAAPass();
    this.smaa.enabled = false;
    this.composer.addPass(this.smaa);

    this.cas = new CasPass(this);
    this.composer.addPass(this.cas);

    // ---- grade state ----------------------------------------------------
    this.autoGrade = true;
    this.gradeA = 'day';
    this.gradeB = 'day';
    this.gradeMix = 0;
    this._applyGrade();

    // ---- focus ----------------------------------------------------------
    this.focusTarget = null;
    this.focusDistance = 10;
    this.focusSpeed = 3.5;        // focus-pull rate (per second, exponential)
    this._focusGoal = 10;

    // A camera rig frames a character from a *root* pivot — hips, or a fixed
    // height above the feet. Focus there and the eyes sit anywhere from 10 to
    // 40 cm behind the focal plane, which at a portrait distance is most of
    // the depth of field: the one thing the audience is looking at is the one
    // thing that is soft. So when the rig is clearly framing the player, snap
    // the plane onto the head instead. The window keeps a shot that happens to
    // point somewhere else entirely (a landscape, a vehicle) from being
    // hijacked by a character standing off in the field.
    this.autoFocusHead = true;
    this.headFocusWindow = 3.2;   // metres of disagreement we will override
    this._head = null;
    this._v2 = new THREE.Vector3();

    this.jitter = true;
    this.aoScale = 1.0;
    this._halton = haltonSequence(8);

    this.setQuality(rnd.quality || 'high');
    this.setSize(rnd.width, rnd.height);

    rnd.onResize = (w, h) => this.setSize(w, h);

    const dbg = new URLSearchParams(location.search).get('post');
    if (dbg) this.debugToggle(dbg);
  }

  /**
   * `?post=nodof,nobloom` — turn individual stages off for A/B comparison.
   * @param {string} list comma separated tokens
   */
  debugToggle(list) {
    for (const raw of String(list).split(',')) {
      const t = raw.trim().toLowerCase();
      if (t === 'nodof') this.dof.enabled = false;
      else if (t === 'nobloom') this.bloom.enabled = false;
      else if (t === 'notaa') this.setAA('none');
      else if (t === 'smaa') this.setAA('smaa');
      else if (t === 'nogtao') this.gtao.enabled = false;
      else if (t === 'nocontact') this.contact.enabled = false;
      else if (t === 'nomb') this.motionBlur.enabled = false;
      else if (t === 'nocas') this.cas.sharpness = 0;
      else if (t === 'nograin') this.grade.uniforms.uGrain.value = 0;
      else if (t === 'nolut') this.grade.uniforms.uLutAmount.value = 0;
      else if (t === 'novig') this.grade.uniforms.uVignette.value = 0;
      else if (t === 'noflare') { this.bloom.ghostAmount = 0; this.bloom.haloAmount = 0; this.bloom.sunAmount = 0; }
      else if (t === 'nodirt') this.bloom.dirtAmount = 0;
      else if (t === 'noexp') { this.exposure.enabled = false; this.autoGrade = false; }
      else if (t === 'ssr') this.ssr.enabled = true;
      else if (t === 'plain') {
        this.dof.enabled = false; this.bloom.enabled = false; this.gtao.enabled = false;
        this.contact.enabled = false;
        this.motionBlur.enabled = false; this.grade.uniforms.uGrain.value = 0;
        this.grade.uniforms.uVignette.value = 0; this.cas.sharpness = 0;
      }
    }
  }

  // ------------------------------------------------------------------ API

  /**
   * Attach the game so the grade can follow the sky's time of day. Called by
   * CameraRig on its first tick — PostFX is constructed before Game finishes.
   * @param {object} game
   */
  attach(game) { this.game = game; }

  /**
   * Own the `scene.overrideMaterial` contract for the whole engine.
   *
   * Any pass that swaps in a single override material to rebuild a G-buffer
   * (three's GTAOPass does this whenever it renders its own depth+normals)
   * loses every material's alpha test, so an alpha-cut foliage card stamps a
   * solid rectangle into the AO buffer. three r185 lets an individual material
   * opt out with `allowOverride = false`: it then draws with its own shader,
   * keeping `alphaTest` / `alphaMap` and writing a correct silhouette.
   *
   * That is strictly better than the alternative each system used to reach for
   * — hiding the mesh for the duration of the pass — because the foliage still
   * contributes real occlusion instead of vanishing. Doing it here, once, also
   * means a new vegetation or VFX system gets it for free.
   *
   * @param {THREE.Scene} scene
   */
  guardOverrides(scene) {
    scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      const list = Array.isArray(m) ? m : [m];
      for (const mat of list) {
        if (mat.userData.__overrideGuarded) continue;
        mat.userData.__overrideGuarded = true;
        if (mat.alphaTest > 0 || mat.alphaMap) mat.allowOverride = false;
      }
    });
  }

  /**
   * Quality tier. `low` drops the expensive gathers, `ultra` widens them.
   * @param {'low'|'medium'|'high'|'ultra'} tier
   */
  setQuality(tier) {
    this.quality = tier;
    const low = tier === 'low', med = tier === 'medium', ultra = tier === 'ultra';
    this.gtao.enabled = !low;
    this.contact.enabled = !low;
    this.ssr.enabled = this.ssr.enabled && !low;
    this.dof.enabled = !low;
    this.motionBlur.enabled = !low;
    this.velocity.enabled = !low;
    this.bloom.levels = low ? 4 : 6;
    this.gtao.updateGtaoMaterial({ samples: low ? 6 : med ? 8 : ultra ? 16 : 11 });
    this.gtao.updatePdMaterial({ samples: low ? 4 : ultra ? 12 : 8, rings: 2, radiusExponent: 2 });
    // half-res AO upsamples badly across the sky/terrain depth edge, so the
    // saving comes from the sample counts instead
    this.aoScale = low ? 0.5 : 1.0;
    this.cas.sharpness = ultra ? 0.38 : 0.45;
  }

  /**
   * @param {'taa'|'smaa'|'none'} mode
   */
  setAA(mode) {
    this.aaMode = mode;
    this.taa.enabled = mode === 'taa';
    this.smaa.enabled = mode === 'smaa';
    this.jitter = mode === 'taa';
    if (mode !== 'taa') this.rnd.camera.clearViewOffset();
  }

  /** Force TAA / exposure history to re-seed (camera cuts, shot changes). */
  resetHistory() {
    this.taa.reset();
    this.exposure.reset();
    // The jitter index selects the Halton sample, so leaving it running makes
    // an otherwise identical capture land on a different subpixel offset.
    this.frame = 0;
    this.prevViewProj.identity();
  }

  /**
   * Select a grade preset, optionally as a partial blend over the current one.
   * @param {'day'|'golden'|'night'|'storm'} name
   * @param {number} [t] 1 = full switch, 0..1 = blend weight
   */
  setGrade(name, t = 1) {
    if (!GRADES[name]) return;
    if (t >= 0.999) { this.gradeA = name; this.gradeB = name; this.gradeMix = 0; }
    else { this.gradeB = name; this.gradeMix = THREE.MathUtils.clamp(t, 0, 1); }
    this._applyGrade();
  }

  /**
   * Explicit cross-fade between two presets (used by the day/night cycle).
   * @param {string} a @param {string} b @param {number} t
   */
  setGradeBlend(a, b, t) {
    this.gradeA = a; this.gradeB = b;
    this.gradeMix = THREE.MathUtils.clamp(t, 0, 1);
    this._applyGrade();
  }

  /** Pick and cross-fade the grade from a 0..24 clock. */
  setGradeForTimeOfDay(h) {
    const [a, b, t] = todGrade(h);
    this.setGradeBlend(a, b, t);
  }

  /**
   * Focus the lens on an object (or a fixed world point). Pass null to hold.
   * @param {THREE.Object3D|THREE.Vector3|null} target
   */
  setFocusTarget(target) { this.focusTarget = target || null; }

  /** Focus at an explicit distance in metres. */
  setFocusDistance(d) { this.focusTarget = null; this._focusGoal = Math.max(0.2, d); }

  /** Snap the focus instead of pulling to it (camera cuts). */
  snapFocus() {
    const h = this._headFocusDistance();
    if (h > 0 && Math.abs(h - this._focusGoal) < this.headFocusWindow) this._focusGoal = h;
    this.dof.focusDistance = this._focusGoal;
  }

  /**
   * The player's head/eye transform, if the character system has one built.
   * Deliberately forgiving: characters are rebuilt often and any of these
   * handles disappearing must cost us the head lock, never a frame.
   * @returns {THREE.Object3D|null}
   */
  _headObject() {
    if (this._head && this._head.parent) return this._head;
    this._head = null;
    const game = this.game;
    if (!game || !game.get) return null;
    const player = game.get('Player');
    const char = player && player.character;
    if (!char) return null;
    const rigBones = char.rig && char.rig.byName;
    this._head = char.eyes
      || (char.attach && char.attach.head)
      || (rigBones && (rigBones.head || rigBones.Head || rigBones.neck))
      || null;
    return this._head;
  }

  /** Camera distance to the player's eyes, or -1 when there is no head. */
  _headFocusDistance() {
    if (!this.autoFocusHead) return -1;
    const head = this._headObject();
    if (!head) return -1;
    head.updateWorldMatrix(true, false);
    const p = this._v2.setFromMatrixPosition(head.matrixWorld);
    if (!isFinite(p.x)) return -1;
    return this._v.setFromMatrixPosition(this.camera.matrixWorld).distanceTo(p);
  }

  // -------------------------------------------------------------- internals

  _applyGrade() {
    const A = GRADES[this.gradeA] || GRADES.day;
    const B = GRADES[this.gradeB] || A;
    const t = this.gradeMix;
    const u = this.grade.uniforms;
    u.tLutA.value = lutFor(this.gradeA);
    u.tLutB.value = lutFor(this.gradeB);
    u.uLutMix.value = t;
    u.uVignette.value = lerp(A.vignette, B.vignette, t);
    u.uGrain.value = lerp(A.grain, B.grain, t);
    u.uChroma.value = lerp(A.chroma, B.chroma, t);
    u.uSaturation.value = lerp(A.saturation, B.saturation, t);
    u.uContrast.value = lerp(A.contrast, B.contrast, t);
    u.uBalance.value.set(lerp(A.balance[0], B.balance[0], t), lerp(A.balance[1], B.balance[1], t));
    u.uLift.value.set(
      lerp(A.lift[0], B.lift[0], t), lerp(A.lift[1], B.lift[1], t), lerp(A.lift[2], B.lift[2], t));
    u.uGain.value.set(
      lerp(A.gain[0], B.gain[0], t), lerp(A.gain[1], B.gain[1], t), lerp(A.gain[2], B.gain[2], t));
    this.exposure.key = lerp(A.key, B.key, t);
  }

  _findSun() {
    if (this.sun && this.sun.parent) return this.sun;
    let found = null;
    this.scene.traverse((o) => {
      if (!found && o.isDirectionalLight) found = o;
    });
    this.sun = found;
    return found;
  }

  _updateSun() {
    const sun = (this.frame % 30 === 0 || !this.sun) ? this._findSun() : this.sun;
    if (!sun) { this.sunScreen.set(0.5, 0.5, 0, 1); return; }
    const cam = this.camera;

    // direction from the sun toward its target = the light direction
    const sp = this._v.setFromMatrixPosition(sun.matrixWorld);
    const tp = sun.target ? new THREE.Vector3().setFromMatrixPosition(sun.target.matrixWorld) : new THREE.Vector3();
    const dir = sp.clone().sub(tp).normalize();

    const camPos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const facing = dir.dot(fwd);

    const world = camPos.clone().addScaledVector(dir, Math.min(cam.far * 0.4, 2000));
    const ndc = world.project(cam);
    const inFrame = Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
    let vis = facing > 0.02 ? 1 : 0;
    vis *= THREE.MathUtils.clamp(1.0 - (inFrame - 0.85) / 0.65, 0, 1);
    vis *= THREE.MathUtils.clamp((facing - 0.02) / 0.25, 0, 1);

    this.sunScreen.set(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5, vis, 1);
    const c = sun.color;
    const boost = THREE.MathUtils.clamp(sun.intensity / 3.0, 0.15, 1.4);
    this.sunColor.set(c.r * boost, c.g * boost, c.b * boost);
  }

  // ----------------------------------------------------------- lifecycle

  setSize(w, h) {
    const dpr = this.rnd.renderer.getPixelRatio();
    const dw = Math.max(1, Math.round(w * dpr));
    const dh = Math.max(1, Math.round(h * dpr));
    this.width = dw; this.height = dh;

    this.rtScene.setSize(dw, dh);
    this.rtVel.setSize(dw, dh);
    this.rtVel.depthTexture = this.rtScene.depthTexture;
    this.composer.setSize(dw, dh);
    this.gtao.setSize(Math.max(1, Math.round(dw * this.aoScale)),
      Math.max(1, Math.round(dh * this.aoScale)));
    this.exposure.setSize(dw, dh);
    this.grade.uniforms.uResolution.value.set(dw, dh);
    this.resetHistory();
  }

  /**
   * Per-frame CPU work: grade blending, focus pull, sun projection.
   * @param {{now:number, dt:number}} time
   */
  update(time) {
    this.dt = Math.min(time.dt || 1 / 60, 0.1);
    this.grade.uniforms.uTime.value = time.now;

    // cheap: only untagged materials do any work, and streamed-in content is
    // picked up within a few frames
    if ((this.frame & 15) === 0) this.guardOverrides(this.scene);

    if (this.autoGrade && this.game) {
      const sky = this.game.get('Sky');
      const h = sky && (sky.timeOfDay ?? sky.hours ?? sky.hour);
      if (typeof h === 'number') {
        const [a, b, t] = todGrade(h);
        const wx = this.game.get('Weather');
        const w = wx && (wx.mode ?? wx.current ?? wx.type ?? wx.preset);
        if (w === 'storm' || w === 'overcast' || w === 'fog') {
          // heavy weather flattens the look whatever the clock says
          this.setGradeBlend(t > 0.5 ? b : a, 'storm', w === 'fog' ? 0.55 : 0.85);
        } else {
          this.setGradeBlend(a, b, t);
        }
      }
    }

    // focus pull
    if (this.focusTarget) {
      const p = this.focusTarget.isVector3
        ? this.focusTarget
        : this._v.setFromMatrixPosition(this.focusTarget.matrixWorld);
      this._focusGoal = this.camera.position.distanceTo(p);
    }
    const headDist = this._headFocusDistance();
    if (headDist > 0 && Math.abs(headDist - this._focusGoal) < this.headFocusWindow) {
      this._focusGoal = headDist;
    }
    this.dof.focusDistance = THREE.MathUtils.damp(
      this.dof.focusDistance, this._focusGoal, this.focusSpeed, this.dt);

    this._updateSun();
  }

  render() {
    const cam = this.camera;
    const renderer = this.rnd.renderer;
    this.frame++;

    cam.updateMatrixWorld();

    // a hard cut invalidates every temporal buffer
    const camPos = this._v.setFromMatrixPosition(cam.matrixWorld);
    if (this.frame > 1 && camPos.distanceToSquared(this._prevCamPos) > 25) this.resetHistory();
    this._prevCamPos.copy(camPos);

    // unjittered matrices for reprojection
    cam.clearViewOffset();
    this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.invViewProj.copy(this.viewProj).invert();
    const cleanE8 = cam.projectionMatrix.elements[8];
    const cleanE9 = cam.projectionMatrix.elements[9];

    if (this.jitter && this.taa.enabled) {
      const j = this._halton[this.frame % this._halton.length];
      cam.setViewOffset(this.width, this.height, j[0] - 0.5, j[1] - 0.5, this.width, this.height);
      // recover the exact sub-pixel shift the view offset produced
      this.jitterUv.set(
        -(cam.projectionMatrix.elements[8] - cleanE8) * 0.5,
        -(cam.projectionMatrix.elements[9] - cleanE9) * 0.5
      );
    } else {
      this.jitterUv.set(0, 0);
    }
    this.taa.material.uniforms.uJitter.value.copy(this.jitterUv);
    this.motionBlur.material.uniforms.uJitter.value.copy(this.jitterUv);

    this.composer.render(this.dt);

    cam.clearViewOffset();
    this.prevViewProj.copy(this.viewProj);
    renderer.setRenderTarget(null);
  }

  dispose() {
    this.rtScene.dispose();
    this.rtVel.dispose();
    this.exposure.dispose();
    for (const p of this.composer.passes) if (p.dispose) p.dispose();
  }
}

/**
 * Grade preset pair + blend weight for a 0..24 clock.
 * @returns {[string, string, number]}
 */
function todGrade(hours) {
  const h = ((hours % 24) + 24) % 24;
  if (h < 4.6) return ['night', 'night', 0];
  if (h < 6.6) return ['night', 'golden', smooth((h - 4.6) / 2.0)];
  if (h < 8.6) return ['golden', 'day', smooth((h - 6.6) / 2.0)];
  if (h < 15.5) return ['day', 'day', 0];
  if (h < 18.6) return ['day', 'golden', smooth((h - 15.5) / 3.1)];
  if (h < 20.4) return ['golden', 'night', smooth((h - 18.6) / 1.8)];
  return ['night', 'night', 0];
}

function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(t) { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }

/** Halton(2,3) low-discrepancy sequence for the TAA jitter. */
function haltonSequence(n) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push([radical(i, 2), radical(i, 3)]);
  return out;
}
function radical(index, base) {
  let f = 1, r = 0, i = index;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}

// The grade used to be an inline ShaderPass exported from this module; it now
// lives in postfx/GradePass.js. Re-exported so old imports keep resolving.
export { GradePass } from './postfx/GradePass.js';
export { GRADES } from '../shaders/post/grades.js';

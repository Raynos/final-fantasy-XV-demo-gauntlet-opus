import * as THREE from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { isInstancedMesh, isMesh, isSkinnedMesh } from '../../util/three-guards.ts';
import type { PostFX } from '../PostFX.ts';

/**
 * Per-object motion vectors.
 *
 * Only objects whose world matrix actually changed this frame (plus every
 * skinned mesh) are drawn, into a buffer that shares the scene depth
 * attachment — so the pass costs a handful of draw calls instead of a second
 * full scene render, and static geometry gets its motion reconstructed from
 * depth in the consuming shaders instead.
 *
 * Encoding: rg = screen-space motion in UV units, a = 1 where an object wrote.
 */

const VEL_VERT = /* glsl */`
  #include <common>
  #include <skinning_pars_vertex>
  uniform mat4 uPrevModel;
  uniform mat4 uCurrViewProj;
  uniform mat4 uPrevViewProj;
  varying vec4 vCurr;
  varying vec4 vPrev;
  void main() {
    #include <skinbase_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>

    vec4 objPos = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      objPos = instanceMatrix * objPos;
    #endif

    vCurr = uCurrViewProj * (modelMatrix * objPos);
    vPrev = uPrevViewProj * (uPrevModel * objPos);

    vec4 mvPosition = modelViewMatrix * objPos;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const VEL_FRAG = /* glsl */`
  precision highp float;
  varying vec4 vCurr;
  varying vec4 vPrev;
  void main() {
    vec2 a = vCurr.xy / max(vCurr.w, 1e-6);
    vec2 b = vPrev.xy / max(vPrev.w, 1e-6);
    gl_FragColor = vec4((a - b) * 0.5, 0.0, 1.0);
  }
`;

/**
 * One mesh the pass is following, and the proxy it draws for it.
 *
 * `proxy` is built lazily -- the first frame a mesh is seen there is no
 * previous matrix to difference against, so most tracked meshes never need one.
 */
interface TrackedMesh {
  src: THREE.Mesh;
  /** `src.matrixWorld` as of the previous frame. */
  prev: THREE.Matrix4;
  proxy: THREE.Mesh | null;
  /** The proxy's velocity material, held here so nothing has to re-narrow
   *  `Mesh.material`, which three declares as `Material | Material[]`. */
  mat: THREE.ShaderMaterial | null;
  /** Frame counter when it was last seen; prunes meshes that left the scene. */
  seen: number;
}

export class VelocityPass extends Pass {
  _black!: THREE.Color;
  _frame!: number;
  /** Set by `reset()`; consumed by the next `render()` as one motion-free frame. */
  _reseed!: boolean;
  fx!: PostFX;
  moverCount!: number;
  proxyScene!: THREE.Scene;
  /** Kept alive by {@link warm} so three does not release its programs. */
  _warmHeld: { geo: THREE.BufferGeometry, mats: THREE.ShaderMaterial[] } | null = null;
  /** Keyed by `Object3D.uuid`. */
  tracked!: Map<string, TrackedMesh>;
  constructor(fx: PostFX) {
    super();
    this.fx = fx;
    this.needsSwap = false;
    this.enabled = true;
    this.proxyScene = new THREE.Scene();
    this.proxyScene.matrixWorldAutoUpdate = false;
    this.tracked = new Map();
    this._frame = 0;
    this._reseed = false;
    this._black = new THREE.Color(0, 0, 0);
  }

  /**
   * Drop motion history, the way `PostFX.resetHistory` drops TAA's and
   * exposure's. A cut or a shot change means no object moved *across* it, so
   * every `prev` is meaningless and every velocity is zero.
   *
   * The proxies and their materials are deliberately KEPT. They are keyed on
   * the source mesh and are still valid; disposing 127 materials on every
   * camera cut would trade a correctness fix for allocation churn on the one
   * frame that is already the most expensive in the shot.
   *
   * **`_frame` is deliberately NOT rewound.** It is the clock the prune below
   * runs on (`_frame - seen > 120`), so zeroing it on every camera cut — and
   * `CameraRig` cuts often — means the difference never reaches 120 and the map
   * grows without bound. The first version of this method did exactly that and
   * pinned `tracked` at 913 entries. A one-frame flag says "no motion" without
   * touching the clock.
   */
  reset() {
    this._reseed = true;
    for (const [, e] of this.tracked) if (e.proxy) e.proxy.visible = false;
    this.moverCount = 0;
  }

  /**
   * Link every proxy program variant now, into a throwaway target, so that no
   * frame of play ever links one.
   *
   * **This was the second of the two remaining >33 ms gameplay frames.**
   * `gameplay.mts`'s `sprint+turn` segment hit 33.1-40.7 ms at frame index 23
   * every run; replayed under `src/tools/probes/perfstall.mts`, the whole of it
   * is ONE `renderBufferDirect` call — 30.8-61.2 ms in a single draw — and
   * `renderer.info.programs` grows by exactly one across that frame. The new
   * program's cache key differs from an already-linked one in a single bit of
   * three's second `getProgramCacheKeyBooleans` mask: **bit 5, `skinning`**.
   *
   * That is this pass. Every mover in the world at boot is a character, so only
   * the SKINNED flavour of `VEL_VERT` had ever been linked; the first plain
   * `Mesh` to move on screen — a road sign, a door, a swaying prop — linked the
   * non-skinned one mid-frame. `Warmup` could not reach it either, because the
   * proxies live in `proxyScene`, which is not `game.scene` and is not what
   * `renderer.compile(scene, camera)` walks.
   *
   * Three geometry flavours (`skinning` / `instancing` / neither) times the two
   * `side` values a proxy inherits from its source, because `doubleSided` is
   * bit 11 of that same mask and is exactly what separated the OTHER stall's
   * pair. Six programs, linked on the loading screen where they belong.
   *
   * @param rt throwaway target to draw into — `Warmup` owns it
   */
  warm(renderer: THREE.WebGLRenderer, camera: THREE.Camera, rt: THREE.WebGLRenderTarget) {
    // A tri with the attribute set a real proxy has. `skinIndex`/`skinWeight`
    // are what make the skinned variant legal; three reads them off the
    // geometry, not off the mesh.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(12), 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
    const bone = new THREE.Bone();
    const skeleton = new THREE.Skeleton([bone]);
    const made: THREE.Mesh[] = [];
    for (const side of [THREE.FrontSide, THREE.DoubleSide]) {
      // `_makeMaterial` reads `src.material.side`, so a stand-in source with
      // the side we want is the honest way to ask it for that variant.
      const stand = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side }));
      const plain = new THREE.Mesh(geo, this._makeMaterial(stand));
      const skinned = new THREE.SkinnedMesh(geo, this._makeMaterial(stand));
      skinned.add(bone);
      skinned.bind(skeleton);
      const inst = new THREE.InstancedMesh(geo, this._makeMaterial(stand), 1);
      for (const m of [plain, skinned, inst]) {
        m.frustumCulled = false;
        this.proxyScene.add(m);
        made.push(m);
      }
      stand.material.dispose();
    }
    const prevTarget = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(rt);
      renderer.render(this.proxyScene, camera);
    } finally {
      renderer.setRenderTarget(prevTarget);
      for (const m of made) this.proxyScene.remove(m);
      skeleton.dispose();
    }
    // **Held, not disposed, and this is the difference between a fix and a
    // half-fix.** three refcounts a program by the materials using it, so
    // disposing these six releases the six programs again and the frame goes
    // back to linking one. Measured: dispose them and the `sprint+turn` spike
    // falls 43 -> 7.1 ms (ANGLE still has the translated shader cached) but
    // `renderer.info.programs` still grows by one on that frame; hold them and
    // it does not. Six tiny materials and one 3-vertex geometry, against a pass
    // that already keeps one material per tracked mesh.
    this._warmHeld = { geo, mats: made.map((m) => m.material as THREE.ShaderMaterial) };
  }

  _makeMaterial(src: THREE.Mesh): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uPrevModel: { value: new THREE.Matrix4() },
        uCurrViewProj: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() },
      },
      vertexShader: VEL_VERT,
      fragmentShader: VEL_FRAG,
      side: Array.isArray(src.material) ? THREE.FrontSide : (src.material?.side ?? THREE.FrontSide),
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
  }

  _proxyFor(src: THREE.Mesh, entry: TrackedMesh): { proxy: THREE.Mesh, mat: THREE.ShaderMaterial } {
    if (entry.proxy && entry.mat) return { proxy: entry.proxy, mat: entry.mat };
    const mat = this._makeMaterial(src);
    let proxy: THREE.Mesh;
    if (isSkinnedMesh(src)) {
      const skinned = new THREE.SkinnedMesh(src.geometry, mat);
      skinned.bindMode = src.bindMode;
      skinned.bind(src.skeleton, src.bindMatrix);
      proxy = skinned;
    } else if (isInstancedMesh(src)) {
      const inst = new THREE.InstancedMesh(src.geometry, mat, src.count);
      inst.instanceMatrix = src.instanceMatrix;
      inst.count = src.count;
      proxy = inst;
    } else {
      proxy = new THREE.Mesh(src.geometry, mat);
    }
    /**
     * **Cull the ones three.js can actually cull.**
     *
     * This was `false` for every proxy, so a scene with a hundred movers in it
     * drew a hundred velocity proxies whether or not any of them was on
     * screen. Attributed on `town_forecourt`'s peak frame by wrapping
     * `renderer.renderBufferDirect`, this pass was **~106 of that frame's
     * draws** against a total of 1013 and a BRIEF budget of 800 — the single
     * cheapest block left in the frame, and it was cost with nothing on screen
     * to show for it.
     *
     * `matrixWorld` is copied from the source every frame just below, and
     * three.js culls from `matrixWorld` and the geometry's bounding sphere, so
     * a plain mesh proxy culls correctly even with `matrixAutoUpdate` off.
     *
     * The two kinds that must stay unculled are unculled for real reasons and
     * not out of caution:
     *
     * - **Skinned**: three.js culls a `SkinnedMesh` against the geometry's
     *   *bind pose* bounding sphere, which a posed skeleton routinely leaves.
     *   A character whose velocity proxy pops out at the frame edge streaks
     *   under motion blur exactly where the eye is.
     * - **Instanced**: an `InstancedMesh` culls against the geometry's own
     *   sphere, not the union of its instances, so a camera-following
     *   instanced field would vanish wholesale. That is the same reason every
     *   layer in `src/world/veg/` sets `frustumCulled = false`.
     */
    proxy.frustumCulled = !isSkinnedMesh(proxy) && !(proxy as THREE.InstancedMesh).isInstancedMesh;
    proxy.matrixAutoUpdate = false;
    proxy.matrixWorldAutoUpdate = false;
    entry.proxy = proxy;
    entry.mat = mat;
    this.proxyScene.add(proxy);
    return { proxy, mat };
  }

  override render(renderer: THREE.WebGLRenderer) {
    const fx = this.fx;
    const rt = fx.rtVel;
    if (!rt) return;
    this._frame++;
    const reseed = this._reseed;
    this._reseed = false;

    const movers: TrackedMesh[] = [];
    fx.rnd.scene.traverse((o) => {
      if (!o.visible || !isMesh(o)) return;
      if (o.userData && o.userData.noVelocity) return;
      if (!o.geometry || !o.material) return;
      if (!Array.isArray(o.material) && o.material.transparent) return;
      let e = this.tracked.get(o.uuid);
      if (!e) {
        e = { src: o, prev: o.matrixWorld.clone(), proxy: null, mat: null, seen: this._frame };
        this.tracked.set(o.uuid, e);
        return; // first sight: no motion yet
      }
      /**
       * **A mesh that was absent last frame has no previous position.**
       *
       * The traverse skips anything invisible, so `prev` is only rolled forward
       * on frames where the mesh was drawn. An LOD ring or a streamed prop that
       * pops back in therefore compares its *current* matrix against wherever
       * it was the last time it was visible — which may be a different shot
       * entirely — and reads as having moved that whole distance in one frame.
       *
       * The consequences were two, and they looked unrelated:
       *
       * - **Visually**, a popped-in object gets a velocity vector the length of
       *   its own absence and streaks under motion blur on the frame it
       *   returns. This is the reason to fix it.
       * - **In `drawcheck`**, it made the draw count a function of run history.
       *   Measured on `town_forecourt`: the first pose on a page drew 806 and
       *   every pose after it drew 786, deterministically, because 20 meshes
       *   carried a `prev` from boot into the first pose and none after it.
       *   That is the whole of the ±60 the gate disagreed with itself by, and
       *   six earlier hypotheses missed it because it is not in the frame, the
       *   chunk, the roster or the bestiary — it is in this map.
       *
       * `resetcheck.mts` digests 35 fields of game state and every one of them
       * is clean across the boundary. This was the 36th, and it lives in a post
       * pass rather than in the game, which is why nothing in the game's own
       * reset could ever have caught it.
       *
       * The rule is the one the branch above already applies to a mesh seen for
       * the very first time; it just was not applied to one seen again.
       */
      const contiguous = !reseed && e.seen === this._frame - 1;
      e.seen = this._frame;
      // `prev` is rolled forward by the tail loop below for anything seen this
      // frame, so returning here is exactly "no motion", with no second copy.
      if (!contiguous) return;
      const moved = isSkinnedMesh(o) || !matrixNearlyEqual(e.prev, o.matrixWorld);
      if (moved) movers.push(e);
    });
    /** How much of the frame is actually in motion — motion blur reads this. */
    this.moverCount = movers.length;

    const prevAutoClear = renderer.autoClear;
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.autoClear = false;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(this._black, 0);
    renderer.clear(true, false, false);   // colour only — depth is the scene's

    if (movers.length) {
      for (const e of movers) {
        const { proxy, mat } = this._proxyFor(e.src, e);
        proxy.visible = true;
        proxy.matrixWorld.copy(e.src.matrixWorld);
        if (isSkinnedMesh(proxy) && isSkinnedMesh(e.src)) proxy.skeleton = e.src.skeleton;
        const u = mat.uniforms;
        u.uPrevModel.value.copy(e.prev);
        u.uCurrViewProj.value.copy(fx.viewProj);
        u.uPrevViewProj.value.copy(fx.prevViewProj);
      }
      for (const [, e] of this.tracked) {
        if (e.proxy && movers.indexOf(e) === -1) e.proxy.visible = false;
      }
      renderer.render(this.proxyScene, fx.rnd.camera);
    }

    renderer.setClearColor(prevClear, prevAlpha);
    renderer.autoClear = prevAutoClear;

    // roll the history forward and prune anything that left the scene
    for (const [key, e] of this.tracked) {
      if (e.seen === this._frame) {
        e.prev.copy(e.src.matrixWorld);
      } else if (this._frame - e.seen > 120) {
        if (e.proxy) { e.mat?.dispose(); this.proxyScene.remove(e.proxy); }
        this.tracked.delete(key);
      }
    }
  }
}

function matrixNearlyEqual(a: THREE.Matrix4, b: THREE.Matrix4) {
  const ae = a.elements, be = b.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(ae[i] - be[i]) > 1e-6) return false;
  return true;
}

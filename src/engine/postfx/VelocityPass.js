import * as THREE from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

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

export class VelocityPass extends Pass {
  constructor(fx) {
    super();
    this.fx = fx;
    this.needsSwap = false;
    this.enabled = true;
    this.proxyScene = new THREE.Scene();
    this.proxyScene.matrixWorldAutoUpdate = false;
    /** @type {Map<string, {src:THREE.Object3D, prev:THREE.Matrix4, proxy:THREE.Object3D, seen:number}>} */
    this.tracked = new Map();
    this._frame = 0;
    this._black = new THREE.Color(0, 0, 0);
  }

  _makeMaterial(src) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uPrevModel: { value: new THREE.Matrix4() },
        uCurrViewProj: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() },
      },
      vertexShader: VEL_VERT,
      fragmentShader: VEL_FRAG,
      side: src.material && src.material.side !== undefined ? src.material.side : THREE.FrontSide,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
  }

  _proxyFor(src, entry) {
    if (entry.proxy) return entry.proxy;
    const mat = this._makeMaterial(src);
    let proxy;
    if (src.isSkinnedMesh) {
      proxy = new THREE.SkinnedMesh(src.geometry, mat);
      proxy.bindMode = src.bindMode;
      proxy.bind(src.skeleton, src.bindMatrix);
    } else if (src.isInstancedMesh) {
      proxy = new THREE.InstancedMesh(src.geometry, mat, src.count);
      proxy.instanceMatrix = src.instanceMatrix;
      proxy.count = src.count;
    } else {
      proxy = new THREE.Mesh(src.geometry, mat);
    }
    proxy.frustumCulled = false;
    proxy.matrixAutoUpdate = false;
    proxy.matrixWorldAutoUpdate = false;
    entry.proxy = proxy;
    this.proxyScene.add(proxy);
    return proxy;
  }

  render(renderer) {
    const fx = this.fx;
    const rt = fx.rtVel;
    if (!rt) return;
    this._frame++;

    const movers = [];
    fx.rnd.scene.traverse((o) => {
      if (!o.visible || !o.isMesh) return;
      if (o.userData && o.userData.noVelocity) return;
      if (!o.geometry || !o.material || o.material.transparent) return;
      let e = this.tracked.get(o.uuid);
      if (!e) {
        e = { src: o, prev: o.matrixWorld.clone(), proxy: null, seen: this._frame };
        this.tracked.set(o.uuid, e);
        return; // first sight: no motion yet
      }
      e.seen = this._frame;
      const moved = o.isSkinnedMesh || !matrixNearlyEqual(e.prev, o.matrixWorld);
      if (moved) movers.push(e);
    });

    const prevAutoClear = renderer.autoClear;
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.autoClear = false;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(this._black, 0);
    renderer.clear(true, false, false);   // colour only — depth is the scene's

    if (movers.length) {
      for (const e of movers) {
        const proxy = this._proxyFor(e.src, e);
        proxy.visible = true;
        proxy.matrixWorld.copy(e.src.matrixWorld);
        if (proxy.isSkinnedMesh) proxy.skeleton = e.src.skeleton;
        const u = proxy.material.uniforms;
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
        if (e.proxy) { e.proxy.material.dispose(); this.proxyScene.remove(e.proxy); }
        this.tracked.delete(key);
      }
    }
  }
}

function matrixNearlyEqual(a, b) {
  const ae = a.elements, be = b.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(ae[i] - be[i]) > 1e-6) return false;
  return true;
}

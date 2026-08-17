import * as THREE from 'three';
import { Noise } from '../util/Noise.js';
import { makeTexture, normalFromHeight } from '../util/TextureGen.js';

/**
 * Lakes and pools.
 *
 * Planar reflection (half-res, sky + terrain only) + depth-based refraction
 * tint + two scrolling procedural normal maps + shoreline foam + sun glint.
 * Water bodies are discovered from the terrain: any basin below `level` that is
 * large enough gets a surface.
 */
/**
 * Layer the mirrored pass draws. Nothing is on it until `Water` opts the sky
 * dome and the terrain clipmap in, so the reflection is *only* those two.
 */
const REFLECT_LAYER = 3;

export class Water {
  constructor() {
    this.level = -6.5;          // world Y of the water plane
    this.bodies = [];
    this.reflectionRes = 192;
    /** Frames between reflection refreshes. */
    this.stride = 2;
    this._frustum = new THREE.Frustum();
    this._vp = new THREE.Matrix4();
    this._box = new THREE.Box3();
    this._reflecting = false;
    this._reflectRoots = null;
    this._sinceReflect = 1e9;
  }

  async init(game) {
    this.game = game;
    const terrain = game.get('Terrain');
    if (!terrain) return;

    this.noise = new Noise(4242);
    this._buildTextures();
    this._buildReflection(game);

    // Find basins on a coarse grid; group them into a few lake surfaces.
    const bodies = this._findBasins(terrain);
    for (const b of bodies) this._makeSurface(game, b);

    this.enabled = this.bodies.length > 0;
    if (this.enabled) this._collectReflectRoots(game);
  }

  // ---------------------------------------------------------------- textures

  _buildTextures() {
    const n = this.noise;
    // Two octave sets at different scales so the normals never visibly repeat.
    const wave = (u, v, sx, sy) =>
      n.fbm2(u * sx, v * sy, 4, 2.1, 0.55) * 0.6 +
      n.fbm2(u * sx * 3.7 + 11, v * sy * 3.7 + 3, 3, 2.3, 0.5) * 0.4;

    this.normalA = normalFromHeight(256, (u, v) => wave(u, v, 6, 6), 1.6, { repeat: 14 });
    this.normalB = normalFromHeight(256, (u, v) => wave(u + 0.37, v + 0.71, 11, 11), 1.1, { repeat: 31 });

    // Subtle caustic-ish sub-surface texture for shallow water.
    this.caustics = makeTexture(256, (u, v, c) => {
      const w = n.worley2(u * 7, v * 7);
      const g = Math.pow(1 - Math.min(1, w.f2 - w.f1), 6);
      c[0] = c[1] = c[2] = g;
    }, { colorSpace: THREE.NoColorSpace, repeat: 9 });
  }

  _buildReflection(game) {
    this.reflectTarget = new THREE.WebGLRenderTarget(this.reflectionRes * 2, this.reflectionRes, {
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: true,
    });
    this.reflectCam = new THREE.PerspectiveCamera();
    // Layer 3 = "reflected by water", and *only* layer 3: the camera used to
    // enable layer 0 as well, which is the default layer of every object in
    // the scene, so the "sky + terrain only" reflection was in fact a second
    // full render of the world — 500 draw calls and six million triangles to
    // fill a 384x192 buffer that a wave normal then smears beyond recognition.
    this.reflectCam.layers.set(REFLECT_LAYER);
    this._reflMatrix = new THREE.Matrix4();
  }

  /**
   * Opt the sky dome and the terrain clipmap into the reflection layer.
   *
   * Done from here rather than from those systems because the contract is
   * Water's: it is the only thing that reads layer 3, and what belongs in a
   * mirrored view is a decision about the reflection, not about the sky.
   */
  _collectReflectRoots(game) {
    const roots = [];
    const sky = game.get('Sky');
    if (sky && sky.dome) roots.push(sky.dome);
    const terrain = game.get('Terrain');
    if (terrain && terrain.clipmap && terrain.clipmap.group) roots.push(terrain.clipmap.group);
    for (const r of roots) r.traverse((o) => o.layers.enable(REFLECT_LAYER));
    this._reflectRoots = roots;
  }

  // ------------------------------------------------------------------ basins

  _findBasins(terrain) {
    const step = 12, half = (terrain.size || 1400) * 0.5;
    const seen = new Set();
    const key = (i, j) => `${i},${j}`;
    const cells = new Map();
    const n = Math.floor((half * 2) / step);

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -half + i * step, z = -half + j * step;
        if (terrain.heightAt(x, z) < this.level) cells.set(key(i, j), { i, j, x, z });
      }
    }

    // Flood fill into connected bodies, keeping the sizeable ones.
    const bodies = [];
    for (const [k, cell] of cells) {
      if (seen.has(k)) continue;
      const stack = [cell]; seen.add(k);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, count = 0;
      while (stack.length) {
        const c = stack.pop();
        count++;
        minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
        minZ = Math.min(minZ, c.z); maxZ = Math.max(maxZ, c.z);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nk = key(c.i + di, c.j + dj);
          if (cells.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(cells.get(nk)); }
        }
      }
      if (count >= 12) {
        bodies.push({
          cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2,
          w: maxX - minX + step * 4, d: maxZ - minZ + step * 4,
        });
      }
    }
    return bodies.slice(0, 4);
  }

  _makeSurface(game, b) {
    const geo = new THREE.PlaneGeometry(b.w, b.d, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = this._makeMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(b.cx, this.level, b.cz);
    mesh.renderOrder = 5;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    game.scene.add(mesh);
    // World bounds with headroom above the plane: a lake below the horizon is
    // still visible through its own reflection, so test a slab, not a plane.
    const bounds = new THREE.Box3(
      new THREE.Vector3(b.cx - b.w * 0.5, this.level - 2, b.cz - b.d * 0.5),
      new THREE.Vector3(b.cx + b.w * 0.5, this.level + 40, b.cz + b.d * 0.5)
    );
    this.bodies.push({ mesh, mat, bounds, ...b });
  }

  _makeMaterial() {
    const uniforms = {
      uTime: { value: 0 },
      uNormalA: { value: this.normalA },
      uNormalB: { value: this.normalB },
      uCaustics: { value: this.caustics },
      uReflect: { value: this.reflectTarget.texture },
      uReflectMatrix: { value: new THREE.Matrix4() },
      uShallow: { value: new THREE.Color(0x1e5f63) },
      uDeep: { value: new THREE.Color(0x04171f) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3) },
      uSunColor: { value: new THREE.Color(0xfff0d8) },
      uCameraPos: { value: new THREE.Vector3() },
      uLevel: { value: this.level },
      uWindDir: { value: new THREE.Vector2(0.8, 0.6) },
      uRoughness: { value: 0.06 },
    };

    return new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        varying vec4 vClip;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vClip = projectionMatrix * viewMatrix * wp;
          gl_Position = vClip;
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform float uTime, uLevel, uRoughness;
        uniform sampler2D uNormalA, uNormalB, uCaustics, uReflect;
        uniform vec3 uShallow, uDeep, uSunDir, uSunColor, uCameraPos;
        uniform vec2 uWindDir;
        varying vec3 vWorld;
        varying vec4 vClip;

        vec3 sampleNormal(sampler2D t, vec2 uv){
          return normalize(texture2D(t, uv).xyz * 2.0 - 1.0);
        }

        void main(){
          vec2 w = uWindDir * uTime;
          vec2 uvA = vWorld.xz * 0.021 + w * 0.012;
          vec2 uvB = vWorld.xz * 0.052 - w * 0.021;
          vec3 nA = sampleNormal(uNormalA, uvA);
          vec3 nB = sampleNormal(uNormalB, uvB);
          // blend in tangent space, then lift into world (plane normal is +Y)
          vec3 nt = normalize(vec3(nA.xy + nB.xy * 0.7, nA.z * nB.z));
          vec3 N = normalize(vec3(nt.x, nt.z * 2.2, nt.y));

          vec3 V = normalize(uCameraPos - vWorld);
          float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
          fres = mix(0.02, 1.0, fres);

          // planar reflection, distorted by the wave normal
          vec2 sUv = (vClip.xy / vClip.w) * 0.5 + 0.5;
          sUv += N.xz * 0.045;
          vec3 refl = texture2D(uReflect, clamp(sUv, 0.001, 0.999)).rgb;

          // depth-tinted body colour (cheap: distance from the shoreline plane)
          float depthFade = clamp((uLevel - vWorld.y + 6.0) / 9.0, 0.0, 1.0);
          vec3 body = mix(uShallow, uDeep, depthFade);

          float caust = texture2D(uCaustics, vWorld.xz * 0.06 + w * 0.004).r;
          body += caust * 0.06 * (1.0 - depthFade);

          vec3 col = mix(body, refl, fres);

          // sun glint — sharp specular on the wave normals
          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(dot(N, H), 0.0), mix(2000.0, 60.0, uRoughness * 6.0));
          col += uSunColor * spec * 2.4;

          gl_FragColor = vec4(col, mix(0.86, 1.0, fres));
          #include <tonemapping_fragment>
        }
      `,
    });
  }

  // ------------------------------------------------------------------ update

  update(dt, game) {
    if (!this.enabled) return;
    const cam = game.camera;
    const sky = game.get('Sky');
    for (const b of this.bodies) {
      const u = b.mat.uniforms;
      u.uTime.value = game.time.now;
      u.uCameraPos.value.copy(cam.position);
      if (sky && sky.sun) {
        u.uSunDir.value.copy(sky.sun.position).normalize();
        u.uSunColor.value.copy(sky.sun.color).multiplyScalar(Math.min(2, sky.sun.intensity));
      }
    }
  }

  /**
   * Is any water body inside the camera frustum?
   *
   * This mattered more than anything else in the system: the reflection is a
   * second full render of the world — its own draw list, its own shadow pass —
   * and it was running every frame of every shot, including the twelve of the
   * fifteen capture shots that contain no water at all.
   *
   * @param {THREE.Camera} cam
   * @returns {boolean}
   */
  _visible(cam) {
    this._vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._vp);
    for (const b of this.bodies) {
      if (b.mesh.visible && this._frustum.intersectsBox(b.bounds)) return true;
    }
    return false;
  }

  /**
   * Does the reflection need re-rendering this frame?
   *
   * Four cheap rejections, in increasing order of cost. The first three are the
   * common case: most of the map, and most of the capture shots, contain no
   * water at all, and a menu or a cutscene is looking at a frozen or occluded
   * world where last frame's mirror is still exactly right.
   */
  _shouldReflect(dt, game) {
    if (!this.enabled) return false;
    const cam = game.camera;
    if (cam.position.y < this.level) return false;      // underwater
    if (game.state === 'menu' || game.state === 'cutscene') return false;
    const menus = game.get('Menus');
    // A menu is a scrim over a still world: nothing behind it moves enough for
    // a wave-distorted mirror to disagree with the one already in the buffer.
    if (menus && menus.name && menus.name !== 'photo') return false;
    cam.updateMatrixWorld();
    if (!this._visible(cam)) return false;
    // Refresh on a stride once it has been drawn at least once. The surface is
    // 1-2% of the frame, moving, and read through a distorting normal; a
    // half-rate mirror is not resolvable, and this is a whole extra scene pass.
    this._sinceReflect += 1;
    if (this._sinceReflect < this.stride) return false;
    this._sinceReflect = 0;
    return true;
  }

  /** Render the mirrored view. Called from lateUpdate so transforms are final. */
  lateUpdate(dt, game) {
    if (!this._shouldReflect(dt, game)) return;
    const cam = game.camera;

    const rc = this.reflectCam;
    rc.copy(cam);
    rc.position.y = 2 * this.level - cam.position.y;
    rc.layers.set(REFLECT_LAYER);

    // mirror the orientation about the water plane
    const q = this._q || (this._q = new THREE.Quaternion());
    const e = this._e || (this._e = new THREE.Euler());
    cam.getWorldQuaternion(q);
    e.setFromQuaternion(q, 'YXZ');
    e.x = -e.x; e.z = -e.z;
    rc.quaternion.setFromEuler(e);
    rc.updateMatrixWorld(true);
    rc.updateProjectionMatrix();

    const renderer = game.renderer;
    const prevTarget = renderer.getRenderTarget();
    // No need to hide the surfaces: they are not on the reflection layer.

    // The cascades were being re-rendered for this pass — three re-runs the
    // whole shadow map on every top-level `render()` — so a mirrored view at a
    // quarter of the screen area was paying full price for three 2048² depth
    // passes. Nothing in a wave-distorted reflection resolves a shadow edge, so
    // it reuses the maps the beauty pass already has.
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    this._reflecting = true;

    renderer.setRenderTarget(this.reflectTarget);
    renderer.clear();
    renderer.render(game.scene, rc);
    renderer.setRenderTarget(prevTarget);

    this._reflecting = false;
    renderer.shadowMap.autoUpdate = prevShadow;
  }

  /** Height of the water surface, or null if this point isn't over water. */
  surfaceAt(x, z) {
    for (const b of this.bodies) {
      if (Math.abs(x - b.cx) < b.w * 0.5 && Math.abs(z - b.cz) < b.d * 0.5) return this.level;
    }
    return null;
  }
}

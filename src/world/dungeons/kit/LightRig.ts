import * as THREE from 'three';
import { glowCardMaterial, glowSprite } from './InteriorMaterials.ts';

/**
 * The interior lighting rig.
 *
 * A dungeon declares as many light *emitters* as it likes — every strip lamp,
 * brazier, generator LED and glowing fungus cluster is one — but only a small
 * pool of real `PointLight`s ever exists. Each frame the pool is re-pointed at
 * the emitters that matter most from where the camera is, weighted by
 * brightness over distance, and faded in and out over their tail so nothing
 * pops. Twelve real lights is what a 30 fps budget will carry; a hundred
 * emitters is what a dungeon needs to look inhabited.
 *
 * Alongside the real lights the rig draws two things that cost almost nothing
 * and do most of the visual work:
 *
 *   - **glow cards**: one additive, camera-facing quad per emitter, all in a
 *     single draw call. This is the halo the bloom pass picks up, and it is
 *     what makes the air in a corridor look like it has dust in it.
 *   - **motes**: a slow drift of lit particles that follows the camera, so a
 *     still frame still reads as a volume rather than as a diorama.
 */
export class LightRig {
  /**
   * @param {object} o
   * 
   */
  constructor(o: { poolSize?: number, ambientSky?: number, ambientGround?: number, ambientIntensity?: number, moteColor?: number, moteCount?: number } = {}) {
    this.poolSize = o.poolSize || 12;
    /**
     * Emitters are authored in "how bright does this fixture feel" units, 1..12.
     * Three's point lights are candela with inverse-square falloff, so a lamp
     * that should throw light four metres needs two orders of magnitude more
     * than that. One gain per dungeon converts between the two and stays the
     * single knob for how lit an interior is.
     */
    this.gain = o.gain != null ? o.gain : 14;
    this.emitters = [];
    this.shafts = [];
    this.group = new THREE.Group();
    this.group.name = 'dungeon-lights';
    this._tmp = new THREE.Vector3();

    this.ambient = new THREE.HemisphereLight(
      o.ambientSky != null ? o.ambientSky : 0x2a3742,
      o.ambientGround != null ? o.ambientGround : 0x120e0a,
      o.ambientIntensity != null ? o.ambientIntensity : 0.30
    );
    this.group.add(this.ambient);

    this.pool = [];
    for (let i = 0; i < this.poolSize; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 20, 2);
      l.castShadow = false;
      l.visible = false;
      this.group.add(l);
      this.pool.push(l);
    }

    // A soft, cool fill riding on the camera. Not a torch — just enough that
    // the surface directly under the lens never falls to pure black, which is
    // the difference between "dark" and "broken".
    this.lamp = new THREE.PointLight(
      o.lampColor != null ? o.lampColor : 0xbcd2e8,
      (o.lampIntensity != null ? o.lampIntensity : 2.2) * this.gain,
      o.lampRange != null ? o.lampRange : 13, 2
    );
    this.lamp.castShadow = false;
    this.group.add(this.lamp);

    this.moteColor = o.moteColor != null ? o.moteColor : 0xd8c49a;
    this.moteCount = o.moteCount != null ? o.moteCount : 420;
    this.moteBox = o.moteBox || 26;
    this._time = 0;
  }

  /**
   * Declare a light source.
   */
  add(e: any) {
    const em = {
      pos: new THREE.Vector3(e.pos[0], e.pos[1], e.pos[2]),
      color: new THREE.Color(e.color != null ? e.color : 0xffb473),
      intensity: e.intensity != null ? e.intensity : 6,
      range: e.range || 14,
      flicker: e.flicker != null ? e.flicker : 0.08,
      glow: e.glow != null ? e.glow : 1,
      glowSize: e.glowSize || 1.0,
      phase: (this.emitters.length * 0.61803) % 1,
      score: 0,
    };
    this.emitters.push(em);
    return em;
  }

  /** A visible light shaft or lamp cone; its material's clock is ticked here. */
  addShaft(mesh) { this.shafts.push(mesh); this.group.add(mesh); return mesh; }

  /**
   * Build the single-draw-call glow layer and the mote volume. Call once, after
   * every emitter has been declared.
   */
  finalise() {
    this._buildGlow();
    this._buildMotes();
  }

  _buildGlow() {
    const list = this.emitters.filter((e) => e.glow > 0.001);
    if (!list.length) return;
    const n = list.length;
    const pos = new Float32Array(n * 4 * 3);
    const uv = new Float32Array(n * 4 * 2);
    const centre = new Float32Array(n * 4 * 3);
    const col = new Float32Array(n * 4 * 3);
    const par = new Float32Array(n * 4 * 2);
    const idx = new Uint32Array(n * 6);
    const corner = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
    for (let i = 0; i < n; i++) {
      const e = list[i];
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        pos[v * 3] = corner[k][0] * 0.5;
        pos[v * 3 + 1] = corner[k][1] * 0.5;
        pos[v * 3 + 2] = 0;
        uv[v * 2] = corner[k][2];
        uv[v * 2 + 1] = corner[k][3];
        centre[v * 3] = e.pos.x; centre[v * 3 + 1] = e.pos.y; centre[v * 3 + 2] = e.pos.z;
        // the halo carries the emitter's colour at a fraction of its power;
        // bloom does the rest
        col[v * 3] = e.color.r * e.glow;
        col[v * 3 + 1] = e.color.g * e.glow;
        col[v * 3 + 2] = e.color.b * e.glow;
        par[v * 2] = 1.35 * e.glowSize;
        par[v * 2 + 1] = e.flicker > 0.001 ? e.phase : 0;
      }
      const b = i * 4;
      idx.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aCentre', new THREE.BufferAttribute(centre, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aParams', new THREE.BufferAttribute(par, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.glowMat = glowCardMaterial(glowSprite(128, 2.4));
    this.glow = new THREE.Mesh(g, this.glowMat);
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 6;
    this.group.add(this.glow);
  }

  _buildMotes() {
    const n = this.moteCount;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (hash(i * 3 + 1) - 0.5) * this.moteBox;
      pos[i * 3 + 1] = (hash(i * 3 + 2) - 0.5) * this.moteBox * 0.5;
      pos[i * 3 + 2] = (hash(i * 3 + 3) - 0.5) * this.moteBox;
      seed[i * 2] = hash(i * 7 + 11);
      seed[i * 2 + 1] = hash(i * 13 + 5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

    this.moteMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uBox: { value: this.moteBox },
        uColor: { value: new THREE.Color(this.moteColor) },
        uMap: { value: glowSprite(64, 2.0) },
        uScale: { value: 300 },
        uFade: { value: 1 },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec2 aSeed;
        uniform float uTime; uniform vec3 uCam; uniform float uBox; uniform float uScale;
        varying float vA;
        void main() {
          // drift, then wrap the cloud around the camera so it is always here
          vec3 p = position;
          p.y += sin(uTime * (0.16 + aSeed.x * 0.22) + aSeed.y * 19.0) * 1.4 + uTime * 0.16 * (aSeed.y - 0.35);
          p.x += sin(uTime * 0.13 + aSeed.x * 27.0) * 1.1;
          p.z += cos(uTime * 0.11 + aSeed.y * 23.0) * 1.1;
          vec3 rel = p - uCam;
          rel = mod(rel + uBox * 0.5, uBox) - uBox * 0.5;
          vec3 world = uCam + rel;
          vec4 mv = modelViewMatrix * vec4(world, 1.0);
          float d = -mv.z;
          // motes only exist where you can see them catch light
          vA = smoothstep(uBox * 0.5, uBox * 0.16, d) * smoothstep(0.4, 1.8, d) * (0.35 + 0.65 * aSeed.x);
          gl_PointSize = (uScale / max(d, 0.4)) * (0.5 + aSeed.y * 0.9);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D uMap; uniform vec3 uColor; uniform float uFade;
        varying float vA;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vA * uFade;
          gl_FragColor = vec4(uColor * a, a);
        }
      `,
    });
    this.motes = new THREE.Points(g, this.moteMat);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 5;
    this.group.add(this.motes);
  }

  /**
   * Re-point the pool at whatever matters from here.
   * @param now seconds
   */
  update(dt: number, camera: THREE.Camera, now: number) {
    this._time = now;
    const cp = camera.position;

    for (const e of this.emitters) {
      const d = e.pos.distanceTo(cp);
      // brightness reaching the eye, with a hard tail so nothing pops in
      e.dist = d;
      e.reach = d < e.range * 2.6 ? 1 - Math.pow(Math.min(1, d / (e.range * 2.6)), 2) : 0;
      e.score = e.reach * e.intensity;
    }
    const active = this.emitters.filter((e) => e.score > 0.001)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.poolSize);

    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i];
      const e = active[i];
      if (!e) { l.visible = false; continue; }
      l.visible = true;
      l.position.copy(e.pos);
      l.color.copy(e.color);
      l.distance = e.range;
      const f = e.flicker > 0.001
        ? 1 - e.flicker * (0.5 + 0.5 * Math.sin(now * (5.5 + e.phase * 4) + e.phase * 31)
          * Math.sin(now * 2.3 + e.phase * 11))
        : 1;
      l.intensity = e.intensity * this.gain * f * (0.25 + 0.75 * e.reach);
    }

    this.lamp.position.set(cp.x, cp.y, cp.z);

    if (this.glowMat) this.glowMat.uniforms.uTime.value = now;
    if (this.moteMat) {
      this.moteMat.uniforms.uTime.value = now;
      this.moteMat.uniforms.uCam.value.copy(cp);
    }
    for (const s of this.shafts) {
      if (s.material && s.material.uniforms && s.material.uniforms.uTime) {
        s.material.uniforms.uTime.value = now;
      }
    }
  }

  /** Cross-fade the whole rig, used by the portal transition. */
  setFade(f) {
    if (this.glowMat) this.glowMat.uniforms.uFade.value = f;
    if (this.moteMat) this.moteMat.uniforms.uFade.value = f;
  }

  dispose() {
    if (this.glow) { this.glow.geometry.dispose(); this.glowMat.dispose(); }
    if (this.motes) { this.motes.geometry.dispose(); this.moteMat.dispose(); }
  }
}

function hash(i) {
  let s = (i * 2654435761) >>> 0;
  s = Math.imul(s ^ (s >>> 15), s | 1);
  s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
  return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
}

import * as THREE from 'three';

import { TERRAIN_FIELD_GLSL } from '../terrain/TerrainMaterial.ts';

/**
 * GPU rain: falling streaks and ground splashes, two draw calls total.
 *
 * Every drop is an instanced quad whose world position is *computed* in the
 * vertex shader from a per-instance seed and the clock, wrapped into a box that
 * rides with the camera. Nothing is simulated on the CPU, so the field is
 * already full on the first frame after a weather change — no warm-up — and
 * scrubbing the clock is exactly reproducible.
 *
 * The quad is stretched along the drop's *view-space* velocity, so streaks
 * lengthen with fall speed and wind shear and foreshorten correctly when you
 * look up the rain column. Three nested layers at different box sizes and drop
 * widths give parallax depth without a per-drop depth sort.
 */

const RAIN_VERT = /* glsl */`
attribute vec4 aSeed;          // xyz random in [0,1), w = layer index
uniform float uTime;
uniform vec3  uCamPos;
uniform vec2  uWind;           // horizontal drift, m/s
uniform float uIntensity;      // 0..1 — thins the field out by culling drops
uniform vec4  uL0;             // per layer: halfExtent, columnHeight, fallSpeed, streakLen
uniform vec4  uL1;
uniform vec4  uL2;
uniform float uWidth;
uniform float uPixel;          // radians of view angle per screen pixel
varying vec2  vUv;
varying float vFade;
varying float vBright;

void main() {
  vec4 L = aSeed.w < 0.5 ? uL0 : (aSeed.w < 1.5 ? uL1 : uL2);
  float E = L.x, H = L.y, speed = L.z;

  // per-drop random draw: below the intensity threshold the drop exists
  float pick = fract(aSeed.x * 71.13 + aSeed.y * 37.71 + aSeed.z * 13.37);
  float alive = step(pick, uIntensity);

  // horizontal placement, wrapped into a 2E box centred on the camera so the
  // field is seamless however far the player walks
  vec2 seedXZ = aSeed.xy * (2.0 * E) - E + uWind * uTime * 0.35;
  vec2 rel = mod(seedXZ - uCamPos.xz + E, 2.0 * E) - E;
  vec2 pxz = uCamPos.xz + rel;

  float ph = fract(aSeed.z + uTime * speed / H);
  float py = uCamPos.y + 0.34 * H - ph * H;

  vec3 world = vec3(pxz.x, py, pxz.y);
  vec4 mv = viewMatrix * vec4(world, 1.0);

  // velocity-aligned stretch, done in view space so it is a true screen streak
  vec3 vel = vec3(uWind.x, -speed, uWind.y);
  vec3 vvel = (viewMatrix * vec4(vel, 0.0)).xyz;
  float dl = length(vvel.xy);
  float vl = max(length(vvel), 1e-4);
  vec2 dir = dl > 1e-4 ? vvel.xy / dl : vec2(0.0, 1.0);
  vec2 perp = vec2(-dir.y, dir.x);

  float lenScale = mix(0.22, 1.0, dl / vl);
  float len = L.w * lenScale * (0.7 + 0.6 * fract(aSeed.y * 91.7));
  float wid = uWidth * (0.55 + 0.9 * fract(aSeed.x * 13.79)) * (0.6 + 0.5 * L.x / 30.0);

  // A drop thinner than a pixel is not drawn at all by the rasteriser, which
  // is why a naive rain field thins to a handful of near streaks. Widen it to
  // a minimum of one pixel and take the brightness back out again, so the
  // energy is conserved and the far shells resolve as a fine veil.
  float dist = length(mv.xyz);
  float minWid = dist * uPixel * 1.15;
  float widDraw = max(wid, minWid);
  float shrink = wid / widDraw;

  mv.xy += dir * (position.y * len) + perp * (position.x * widDraw);
  vFade = smoothstep(0.45, 2.6, dist) * (1.0 - smoothstep(E * 0.72, E * 1.02, dist)) * alive;
  // near drops read brighter and softer, far drops sit back into the haze
  vBright = mix(1.00, 0.45, clamp(dist / max(E, 1.0), 0.0, 1.0)) * pow(shrink, 0.45);
  vUv = uv;
  gl_Position = projectionMatrix * mv;
}
`;

const RAIN_FRAG = /* glsl */`
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vFade;
varying float vBright;
void main() {
  float x = vUv.x * 2.0 - 1.0;
  float core = 1.0 - x * x;                       // round cross section
  float a = core * core;
  // taper both ends so the streak is a drop trail, not a rod
  a *= smoothstep(0.0, 0.30, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  a *= vFade * uOpacity * vBright;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

const SPLASH_VERT = /* glsl */`
${TERRAIN_FIELD_GLSL}
attribute vec3 aSeed;
uniform float uTime;
uniform vec3  uCamPos;
uniform float uExtent;
uniform float uIntensity;
uniform float uRate;
varying vec2  vUv;
varying float vLife;
varying float vFade;

void main() {
  vec2 seedXZ = aSeed.xy * (2.0 * uExtent) - uExtent;
  vec2 rel = mod(seedXZ - uCamPos.xz + uExtent, 2.0 * uExtent) - uExtent;
  vec2 pxz = uCamPos.xz + rel;

  float pick = fract(aSeed.x * 53.17 + aSeed.z * 19.31);
  float alive = step(pick, uIntensity);

  float life = fract(aSeed.z + uTime * uRate * (0.7 + 0.6 * fract(aSeed.y * 27.1)));
  float h = tf_height(pxz);

  // expanding ring, flat on the ground
  float r = 0.045 + life * 0.34;
  vec3 world = vec3(pxz.x + position.x * r, h + 0.012, pxz.y + position.y * r);

  float d = distance(world, uCamPos);
  vFade = alive * (1.0 - smoothstep(uExtent * 0.55, uExtent, d)) * (1.0 - smoothstep(1.2, 0.25, d));
  vLife = life;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const SPLASH_FRAG = /* glsl */`
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vLife;
varying float vFade;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  // thin bright ring that widens and dims as it spreads
  float ring = exp(-pow((r - 0.82) / (0.16 + 0.22 * vLife), 2.0));
  float pop = exp(-pow(r / 0.35, 2.0)) * (1.0 - smoothstep(0.0, 0.28, vLife));
  float a = (ring * (1.0 - vLife) + pop * 0.8) * vFade * uOpacity;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

/** Build an instanced quad field with a per-instance seed attribute. */
function instancedQuad(count: number, seedSize: number, rand: () => number) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  geo.instanceCount = count;
  const seeds = new Float32Array(count * seedSize);
  for (let i = 0; i < count * seedSize; i++) seeds[i] = rand();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, seedSize));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  base.dispose();
  return { geo, seeds };
}

/**
 * The slice of the terrain's uniform block a rain splash needs to find the
 * ground. `Weather` hands over these four; the rest of the terrain block is
 * nothing to do with rain.
 */
export interface RainGroundUniforms {
  [uniform: string]: THREE.IUniform;
  uHeightTex: THREE.IUniform<THREE.Texture | null>;
  uFarHeightTex: THREE.IUniform<THREE.Texture | null>;
  uField: THREE.IUniform<THREE.Vector4>;
  uFarP: THREE.IUniform<THREE.Vector4>;
}

export class Rain {
  intensity!: number;
  material!: THREE.ShaderMaterial;
  mesh!: THREE.Mesh;
  quality!: number;
  scene!: THREE.Scene;
  splash!: THREE.Mesh;
  splashMaterial!: THREE.ShaderMaterial;
  /** What the build produced, for the dev overlay. */
  stats!: { drops: number, splashes: number, draws: number };
  /** The terrain's block, so a splash can read the ground height. */
  terrainUniforms!: RainGroundUniforms;
  /**
   * @param {object} opts
   * */
  constructor({ scene, terrainUniforms, quality = 1 }: { scene: THREE.Scene, terrainUniforms: RainGroundUniforms, quality?: number }) {
    this.scene = scene;
    this.terrainUniforms = terrainUniforms;
    this.quality = quality;
    this.intensity = 0;
  }

  build(rand: () => number) {
    const q = this.quality;
    const dropCount = Math.round(92000 * q);

    const { geo, seeds } = instancedQuad(dropCount, 4, rand);
    // distribute across three parallax shells: near shell gets the fewest but
    // fattest drops, far shell the most
    for (let i = 0; i < dropCount; i++) {
      const f = i / dropCount;
      seeds[i * 4 + 3] = f < 0.20 ? 0 : f < 0.55 ? 1 : 2;
    }
    geo.attributes.aSeed.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
        uWind: { value: new THREE.Vector2(3, 0) },
        uIntensity: { value: 0 },
        //            halfExtent, column, fallSpeed, streakLen
        uL0: { value: new THREE.Vector4(6.5, 20.0, 13.0, 0.30) },
        uL1: { value: new THREE.Vector4(17.0, 30.0, 16.0, 0.27) },
        uL2: { value: new THREE.Vector4(44.0, 48.0, 19.0, 0.22) },
        uWidth: { value: 0.030 },
        uPixel: { value: 0.0009 },
        uColor: { value: new THREE.Color(0.62, 0.70, 0.82) },
        uOpacity: { value: 0.55 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 18;
    this.mesh.visible = false;
    this.mesh.userData.noWet = true;
    this.scene.add(this.mesh);

    // --- splashes ----------------------------------------------------------
    const splashCount = Math.round(1500 * q);
    const sp = instancedQuad(splashCount, 3, rand);
    this.splashMaterial = new THREE.ShaderMaterial({
      vertexShader: SPLASH_VERT,
      fragmentShader: SPLASH_FRAG,
      uniforms: Object.assign({}, this.terrainUniforms, {
        uTime: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
        uExtent: { value: 22.0 },
        uIntensity: { value: 0 },
        uRate: { value: 2.4 },
        uColor: { value: new THREE.Color(0.75, 0.80, 0.88) },
        uOpacity: { value: 0.55 },
      }),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.splash = new THREE.Mesh(sp.geo, this.splashMaterial);
    this.splash.frustumCulled = false;
    this.splash.renderOrder = 17;
    this.splash.visible = false;
    this.splash.userData.noWet = true;
    this.scene.add(this.splash);

    this.stats = { drops: dropCount, splashes: splashCount, draws: 2 };
  }

  /**
   * @param time seconds
   * @param intensity 0..1
   * @param wind horizontal wind velocity, m/s
   * @param pixelAngle view radians per screen pixel
   */
  update(time: number, camPos: THREE.Vector3, intensity: number, wind: THREE.Vector2, pixelAngle: number) {
    this.intensity = intensity;
    const on = intensity > 0.012;
    this.mesh.visible = on;
    this.splash.visible = on;
    if (!on) return;

    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uCamPos.value.copy(camPos);
    u.uWind.value.copy(wind);
    u.uIntensity.value = intensity;
    u.uPixel.value = pixelAngle;
    // heavier rain is fatter and more opaque, not just denser
    u.uWidth.value = 0.0075 + 0.0065 * intensity;
    u.uOpacity.value = 0.26 + 0.36 * intensity;

    const s = this.splashMaterial.uniforms;
    s.uTime.value = time;
    s.uCamPos.value.copy(camPos);
    s.uIntensity.value = intensity;
    s.uRate.value = 1.9 + 1.6 * intensity;
    s.uOpacity.value = 0.14 + 0.20 * intensity;
  }
}

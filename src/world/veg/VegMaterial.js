import * as THREE from 'three';

/**
 * Shared shader plumbing for everything that grows.
 *
 * A single set of uniform objects is shared by every patched material, so the
 * Vegetation system updates wind/time/player once per frame and the whole
 * world responds. Patching MeshStandardMaterial (rather than writing a bespoke
 * ShaderMaterial) keeps us inside three's lighting, shadow, fog and tone-map
 * pipeline — vegetation then automatically matches whatever the Sky agent does.
 */

export const VegUniforms = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.82, 0.57) },
  uWindStrength: { value: 1.0 },
  uPlayer: { value: new THREE.Vector3(0, 0, 0) },
};

/**
 * Meshes whose silhouette exists only in the alpha channel.
 *
 * Any pass that swaps in a `scene.overrideMaterial` (three's GTAO g-buffer
 * path does exactly this) loses the alpha test and would render these cards as
 * solid quads. **PostFX owns that problem now** — see `PostFX.guardOverrides`,
 * which flags every alpha-cut material `allowOverride = false` so it keeps its
 * own shader through such a pass. Registering here just marks the card
 * immediately instead of waiting for PostFX's next scan, and keeps the
 * inventory available for debugging.
 */
const alphaCards = new Set();

/** Mark a mesh as alpha-silhouetted. @returns {THREE.Mesh} the mesh */
export function registerAlphaCard(mesh) {
  alphaCards.add(mesh);
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of list) if (m) m.allowOverride = false;
  return mesh;
}

/** Every mesh registered with {@link registerAlphaCard}. */
export function alphaCardMeshes() { return alphaCards; }

/**
 * Retained for callers written before PostFX took ownership of the
 * override-material contract. It no longer touches `visible`: hiding foliage
 * for the AO pass punched holes in the occlusion instead of fixing it.
 * @param {THREE.Scene} scene
 */
export function installAlphaCardGuard(scene) {
  scene.userData._vegAlphaGuard = true;
  for (const mesh of alphaCards) registerAlphaCard(mesh);
}

const COMMON = /* glsl */`
uniform float uTime;
uniform vec2  uWindDir;
uniform float uWindStrength;
uniform vec3  uPlayer;
attribute float aFlex;
varying float vFlexOut;

// World-space displacement for a point whose instance origin is o, with
// normalised stiffness weight f (0 at the anchor, 1 at the tip).
vec3 vegSway(vec3 o, float f, float bend, float flutter, float gustFreq) {
  vec2 wd = normalize(uWindDir);
  // large-scale gust front sweeping across the field
  float phase = dot(o.xz, wd) * gustFreq - uTime * 1.35;
  float gust = sin(phase) * 0.5 + 0.5;
  gust = gust * gust * (0.55 + 0.45 * (sin(phase * 0.37 + 1.7) * 0.5 + 0.5));
  float amp = uWindStrength * (0.22 + 1.05 * gust);

  // per-instance high frequency flutter, phase-offset by world position
  float ph = o.x * 1.93 + o.z * 2.71;
  float fl = sin(uTime * 5.4 + ph) * 0.6 + sin(uTime * 9.1 + ph * 1.63) * 0.4;

  vec2 perp = vec2(-wd.y, wd.x);
  vec2 lat = wd * (amp * bend * f) + perp * (fl * flutter * amp * f);

  // keep length roughly constant: dip as we lean
  float drop = -(dot(lat, lat)) * 0.34;
  return vec3(lat.x, drop, lat.y);
}

// Grass gets shoved aside by whoever walks through it.
vec3 vegTrample(vec3 o, float f, float radius, float strength) {
  vec2 d = o.xz - uPlayer.xz;
  float dist = length(d);
  float vert = abs(o.y - uPlayer.y);
  float push = (1.0 - smoothstep(radius * 0.25, radius, dist)) * (1.0 - smoothstep(1.2, 2.6, vert));
  vec2 dir = dist > 0.0001 ? d / dist : vec2(1.0, 0.0);
  return vec3(dir.x, -0.55, dir.y) * push * strength * f;
}
`;

/**
 * Patch a MeshStandardMaterial with instanced wind sway (+ optional trample and
 * backlit leaf translucency).
 *
 * @param {THREE.MeshStandardMaterial} mat
 * @param {object} opts
 * @param {number} opts.bend      lateral sway metres at full gust
 * @param {number} opts.flutter   high-frequency flutter scale
 * @param {number} opts.gustFreq  spatial frequency of the gust front
 * @param {number} opts.trample   player push-aside strength (0 disables)
 * @param {number} opts.translucency  backlit leaf glow (0 disables)
 * @param {number} opts.flexPow   how sharply stiffness ramps toward the tip
 */
export function patchVeg(mat, {
  bend = 0.35, flutter = 0.25, gustFreq = 0.055, trample = 0,
  translucency = 0, flexPow = 1.7, aoBoost = 0, twoSidedNormals = false,
} = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = VegUniforms.uTime;
    shader.uniforms.uWindDir = VegUniforms.uWindDir;
    shader.uniforms.uWindStrength = VegUniforms.uWindStrength;
    shader.uniforms.uPlayer = VegUniforms.uPlayer;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <begin_vertex>', /* glsl */`
        #include <begin_vertex>
        vec3 vegInstOrigin = vec3(0.0);
        #ifdef USE_INSTANCING
          vegInstOrigin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        vec3 vegOrigin = (modelMatrix * vec4(vegInstOrigin, 1.0)).xyz;
        float vegF = pow(clamp(aFlex, 0.0, 1.0), ${flexPow.toFixed(2)});
        vFlexOut = clamp(aFlex, 0.0, 1.0);
        vec3 vegOff = vegSway(vegOrigin, vegF, ${bend.toFixed(3)}, ${flutter.toFixed(3)}, ${gustFreq.toFixed(4)});
        ${trample > 0 ? `vegOff += vegTrample(vegOrigin, vegF, 2.1, ${trample.toFixed(3)});` : ''}
      `)
      .replace('#include <project_vertex>', /* glsl */`
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        mvPosition.xyz += vegOff;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
      `)
      .replace('#include <worldpos_vertex>', /* glsl */`
        #if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
          vec4 worldPosition = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            worldPosition = instanceMatrix * worldPosition;
          #endif
          worldPosition.xyz += vegOff;
          worldPosition = modelMatrix * worldPosition;
        #endif
      `);

    if (twoSidedNormals) {
      // Grass blades and leaf cards carry deliberately "wrong" up-facing
      // normals for soft foliage lighting; undo three's back-face flip so the
      // far side of a card doesn't render black.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_begin>', /* glsl */`
          #include <normal_fragment_begin>
          #ifdef DOUBLE_SIDED
            normal *= faceDirection;
          #endif
        `);
    }

    if (translucency > 0 || aoBoost > 0) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFlexOut;')
        .replace('#include <lights_fragment_end>', /* glsl */`
          #include <lights_fragment_end>
          #if ( NUM_DIR_LIGHTS > 0 ) && ${translucency > 0 ? 1 : 0}
            {
              vec3 V = geometryViewDir;
              vec3 L = normalize(directionalLights[0].direction);
              // Light travelling through the leaf toward the eye. Two things
              // keep this honest: it is radiance, so it carries the same 1/PI
              // the lambert lobe does, and it is gated by how much light the
              // leaf actually intercepts. Without the gate a canopy transmits
              // the full key colour regardless of geometry, which is invisible
              // under a high sun but turns every tree into a lantern on a
              // moonlit night, when the key rakes in at a few degrees and the
              // direct term has all but vanished.
              float back = clamp(dot(V, -L), 0.0, 1.0);
              float gate = 0.06 + 0.94 * abs(dot(geometryNormal, L));
              float trans = pow(back, 3.2) * gate * ${translucency.toFixed(3)};
              trans += pow(clamp(dot(-geometryNormal, L), 0.0, 1.0), 1.5) * ${(translucency * 0.22).toFixed(3)};
              reflectedLight.indirectDiffuse += directionalLights[0].color *
                (trans * RECIPROCAL_PI * 2.6) * diffuseColor.rgb * (0.45 + 0.55 * vFlexOut);
            }
          #endif
          ${aoBoost > 0 ? `reflectedLight.indirectDiffuse *= mix(${(1 - aoBoost).toFixed(3)}, 1.0, vFlexOut);` : ''}
        `);
    }
  };
  // force a distinct program so patched/unpatched variants don't collide
  mat.customProgramCacheKey = () =>
    `veg${bend}|${flutter}|${trample}|${translucency}|${flexPow}|${aoBoost}|${twoSidedNormals}`;
  return mat;
}

/**
 * Ensure a geometry carries the `aFlex` stiffness attribute the wind shader
 * needs. `fn(x,y,z,i)` returns 0..1; without it we ramp on local Y.
 */
export function bakeFlex(geo, fn) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const arr = new Float32Array(n);
  let maxY = 1e-6;
  for (let i = 0; i < n; i++) maxY = Math.max(maxY, pos.getY(i));
  for (let i = 0; i < n; i++) {
    arr[i] = fn
      ? fn(pos.getX(i), pos.getY(i), pos.getZ(i), i)
      : THREE.MathUtils.clamp(pos.getY(i) / maxY, 0, 1);
  }
  geo.setAttribute('aFlex', new THREE.BufferAttribute(arr, 1));
  return geo;
}

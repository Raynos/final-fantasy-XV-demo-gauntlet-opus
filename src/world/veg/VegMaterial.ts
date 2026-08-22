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

/** Most actors we will part the grass around in one frame. */
export const VEG_ACTOR_MAX = 10;

export const VegUniforms = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.82, 0.57) },
  uWindStrength: { value: 1.0 },
  uPlayer: { value: new THREE.Vector3(0, 0, 0) },
  // xyz = feet position, w = clearance radius in metres. Count is a float so
  // the loop bound works identically on every driver.
  uActors: {
    value: Array.from({ length: VEG_ACTOR_MAX }, () => new THREE.Vector4(0, -1e5, 0, 0)),
  },
  uActorCount: { value: 0 },
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

/** Mark a mesh as alpha-silhouetted. @returns the mesh */
export function registerAlphaCard(mesh: any): THREE.Mesh {
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
 */
export function installAlphaCardGuard(scene: THREE.Scene) {
  scene.userData._vegAlphaGuard = true;
  for (const mesh of alphaCards) registerAlphaCard(mesh);
}

const COMMON = /* glsl */`
uniform float uTime;
uniform vec2  uWindDir;
uniform float uWindStrength;
uniform vec3  uPlayer;
uniform vec4  uActors[VEG_ACTOR_MAX];
uniform float uActorCount;
attribute float aFlex;
varying float vFlexOut;

// World-space displacement for a point whose instance origin is o, with
// normalised stiffness weight f (0 at the anchor, 1 at the tip).
vec3 vegSway(vec3 o, float f, float bend, float flutter, float gustFreq) {
  vec2 wd = normalize(uWindDir);
  vec2 perp = vec2(-wd.y, wd.x);

  // The gust front is not a plane wave. It used to be exactly that — the phase
  // was dot(o.xz, wd) * gustFreq - time and nothing else — so every clump in
  // sight lifted and dropped in perfect unison, which is the one thing a real
  // field never does. A slower cross-wind wave now beats against the front and
  // shifts the phase along it, and a second, much larger, drifting field
  // modulates the amplitude. Both are smooth functions of world position,
  // deliberately: a per-instance hash would give the blades inside one tuft
  // different phases and shred the tuft, because an instance origin here is one
  // blade, not one plant.
  //
  // Two naming traps here, both of which cost a round: neither of these locals
  // may be called cross or patch. Both are GLSL reserved words, and both fail
  // as "Illegal use of reserved word" at *link* time behind the unhelpful
  // VALIDATE_STATUS false. (This is also a JS template literal, so no
  // backticks in these comments either.)
  float crossWave = sin(dot(o.xz, perp) * gustFreq * 0.63 + uTime * 0.41);
  float phase = dot(o.xz, wd) * gustFreq - uTime * 1.35 + crossWave * 1.9;
  float gust = sin(phase) * 0.5 + 0.5;
  gust = gust * gust * (0.55 + 0.45 * (sin(phase * 0.37 + 1.7) * 0.5 + 0.5));
  float windPatch = sin(o.x * 0.031 + uTime * 0.17) * sin(o.z * 0.027 - uTime * 0.13);
  float amp = uWindStrength * (0.22 + 1.05 * gust) * (0.78 + 0.34 * windPatch);

  // per-instance high frequency flutter, phase-offset by world position
  float ph = o.x * 1.93 + o.z * 2.71;
  float fl = sin(uTime * 5.4 + ph) * 0.6 + sin(uTime * 9.1 + ph * 1.63) * 0.4;

  vec2 lat = wd * (amp * bend * f) + perp * (fl * flutter * amp * f);

  // keep length roughly constant: dip as we lean
  float drop = -(dot(lat, lat)) * 0.34;
  return vec3(lat.x, drop, lat.y);
}

// Grass parts around whoever is standing in it.
//
// The old version pushed blades sideways by a fixed distance, which for a
// half-metre blade is a lean and for a metre-tall clump is nothing — so legs
// still came out sliced in half by alpha planes and no silhouette ever read.
// Scaling the response by the blade's own height instead turns it into a
// *rotation*: at full strength the blade lies over at roughly the angle real
// trodden grass does, tip on the ground, pointing away from the foot. Because
// it is proportional, one tuning works from a seedling to a metre of tussock.
//
// h is this vertex's height above its own instance origin. f is the *linear*
// root-to-tip weight, not the wind's stiffness curve: wind bows a blade, which
// wants a stiff base, but a boot rotates the whole blade about its root, and
// with the curved weight the lower two-thirds stayed bolt upright and went on
// slicing through the shin the response was there to clear.
vec3 vegClearance(vec3 o, float f, float h, float strength) {
  vec2 dsum = vec2(0.0);
  float kmax = 0.0;
  for (int i = 0; i < VEG_ACTOR_MAX; i++) {
    if (float(i) >= uActorCount) break;
    vec4 a = uActors[i];
    if (a.w <= 0.0) continue;
    vec2 d = o.xz - a.xz;
    float dist = length(d);
    if (dist > a.w) continue;
    // a character two storeys below on a slope is not standing in this grass
    float k = (1.0 - smoothstep(a.w * 0.30, a.w, dist))
            * (1.0 - smoothstep(1.1, 2.4, abs(o.y - a.y)));
    if (k <= 0.0) continue;
    dsum += (dist > 1e-4 ? d / dist : vec2(1.0, 0.0)) * k;
    kmax = max(kmax, k);
  }
  if (kmax <= 0.0) return vec3(0.0);
  vec2 dir = dot(dsum, dsum) > 1e-8 ? normalize(dsum) : vec2(1.0, 0.0);
  float lay = kmax * kmax;                       // hard core, feathered skirt
  float lean = (0.40 * kmax + 0.78 * lay) * strength;
  float drop = (0.18 * kmax + 0.68 * lay) * strength;
  return vec3(dir.x * lean, -drop, dir.y * lean) * h * f;
}
`;

/**
 * Patch a MeshStandardMaterial with instanced wind sway (+ optional trample and
 * backlit leaf translucency).
 *
 * @param {object} opts
 * */
export function patchVeg(mat: THREE.MeshStandardMaterial, {
  bend = 0.35, flutter = 0.25, gustFreq = 0.055, trample = 0,
  translucency = 0, flexPow = 1.7, aoBoost = 0, twoSidedNormals = false,
  specular = 1,
}: { bend?: number, flutter?: number, gustFreq?: number, trample?: number, translucency?: number, flexPow?: number, aoBoost?: number, specular?: number, twoSidedNormals?: boolean } = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = VegUniforms.uTime;
    shader.uniforms.uWindDir = VegUniforms.uWindDir;
    shader.uniforms.uWindStrength = VegUniforms.uWindStrength;
    shader.uniforms.uPlayer = VegUniforms.uPlayer;
    shader.uniforms.uActors = VegUniforms.uActors;
    shader.uniforms.uActorCount = VegUniforms.uActorCount;

    // The sway is folded back into `transformed` — the pre-instance object
    // vertex — instead of being post-multiplied onto `mvPosition`.
    //
    // This is not a tidy-up. Overriding `<project_vertex>` *consumes the
    // include marker*, and `world/sky/MaterialPatch.ts` gets its turn after us
    // and finds nothing to replace: the `vAtmWorld` varying its aerial
    // perspective and cloud shadows both read is then declared and never
    // written. An unwritten varying reads as zero, so every leaf and every
    // grass card computed its distance to the eye as the distance from the
    // *world origin*, and any vegetation more than a kilometre from Hammerhead
    // came out flooded to 100 % sky inscatter — flat blue-white cards over
    // brown ground. That is the "blue-white speckle" reported in Malmalam and
    // the Nebulawood, and the reason it went unreported at Hammerhead is that
    // there `length(cameraPosition)` really is nearly zero. Leaving the include
    // alone lets three, CSM and the atmosphere all see the displaced vertex.
    //
    // Inverting the instance basis is exact for any translate-rotate-scale
    // instance matrix, uniform scale or not: column i of an R*S matrix is
    // s_i * R_i, so dot(v, c_i) / dot(c_i, c_i) is (R_i . v) / s_i, which is
    // precisely the i-th component of S^-1 * R^T * v. The meshes themselves sit
    // at the scene root with an identity transform, so world and model space
    // coincide and no modelMatrix inverse is needed.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        `#include <common>\n#define VEG_ACTOR_MAX ${VEG_ACTOR_MAX}\n${COMMON}`)
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
        float vegHeight = max(transformed.y, 0.0);
        #ifdef USE_INSTANCING
          vegHeight = max((instanceMatrix * vec4(transformed, 1.0)).y - vegInstOrigin.y, 0.0);
        #endif
        ${trample > 0 ? `vegOff += vegClearance(vegOrigin, vFlexOut, vegHeight, ${trample.toFixed(3)});` : ''}
        #ifdef USE_INSTANCING
          vec3 vegC0 = instanceMatrix[0].xyz;
          vec3 vegC1 = instanceMatrix[1].xyz;
          vec3 vegC2 = instanceMatrix[2].xyz;
          transformed += vec3(
            dot(vegOff, vegC0) / max(dot(vegC0, vegC0), 1e-8),
            dot(vegOff, vegC1) / max(dot(vegC1, vegC1), 1e-8),
            dot(vegOff, vegC2) / max(dot(vegC2, vegC2), 1e-8));
        #else
          transformed += vegOff;
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

    if (translucency > 0 || aoBoost > 0 || specular < 1) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFlexOut;')
        .replace('#include <lights_fragment_end>', /* glsl */`
          #include <lights_fragment_end>
          ${specular < 1 ? `
          reflectedLight.directSpecular *= ${specular.toFixed(3)};
          reflectedLight.indirectSpecular *= ${specular.toFixed(3)};
          ` : ''}
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
    `veg${bend}|${flutter}|${trample}|${translucency}|${flexPow}|${aoBoost}|${twoSidedNormals}|${specular}`;
  return mat;
}

/**
 * Ensure a geometry carries the `aFlex` stiffness attribute the wind shader
 * needs. `fn(x,y,z,i)` returns 0..1; without it we ramp on local Y.
 */
export function bakeFlex(geo: any, fn?: any) {
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

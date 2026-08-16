import { ShaderChunk } from 'three';
import { ATMO_COMMON } from '../../shaders/atmosphere.glsl.js';

/**
 * Injects the atmosphere into every lit material in the scene:
 *
 *   - aerial perspective: surfaces fade toward the *sky colour in their own
 *     view direction* (sampled from the sky-view LUT), plus exponential height
 *     fog that pools in valleys. This is what makes distant hills read as
 *     distant instead of grey.
 *   - cloud shadows: the tiling ground-transmittance bake multiplies every
 *     directional light, so cloud banks drift across the terrain.
 *   - cascaded shadow maps (three's CSM addon) for crisp shadows near the
 *     camera and coverage out to a few hundred metres.
 *
 * Materials created by other systems are picked up automatically by rescanning
 * the scene; any onBeforeCompile they already installed is preserved.
 */
export class MaterialPatch {
  /**
   * @param {import('three/examples/jsm/csm/CSM.js').CSM} csm
   * @param {Object} uniforms shared uniform objects (LUTs, fog, cloud shadow)
   */
  constructor(csm, uniforms) {
    this.csm = csm;
    this.uniforms = uniforms;
    this.count = 0;
  }

  /** Walk the scene and patch anything new. Cheap enough to run every frame. */
  scan(scene) {
    scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) { for (const mm of m) this.patch(mm); } else this.patch(m);
    });
  }

  /** @param {THREE.Material} mat */
  patch(mat) {
    if (!mat || mat.userData.__atmo) return;
    const lit = mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial ||
                mat.isMeshLambertMaterial || mat.isMeshPhongMaterial ||
                mat.isMeshToonMaterial;
    if (!lit) return;
    mat.userData.__atmo = true;

    const prev = mat.onBeforeCompile;
    this.csm.setupMaterial(mat);
    const csmHook = mat.onBeforeCompile;
    const self = this;

    mat.onBeforeCompile = function (shader, renderer) {
      if (prev) prev.call(this, shader, renderer);
      if (csmHook) csmHook.call(this, shader, renderer);
      self.inject(shader);
    };
    const key = mat.customProgramCacheKey;
    mat.customProgramCacheKey = function () {
      return 'atmo1|' + (key ? key.call(this) : '');
    };
    mat.needsUpdate = true;
    this.count++;
  }

  /** @param {{uniforms:Object, vertexShader:string, fragmentShader:string}} shader */
  inject(shader) {
    for (const k of Object.keys(this.uniforms)) shader.uniforms[k] = this.uniforms[k];

    shader.vertexShader = 'varying vec3 vAtmWorld;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      /* glsl */`#include <project_vertex>
      vec4 atmP = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        atmP = batchingMatrix * atmP;
      #endif
      #ifdef USE_INSTANCING
        atmP = instanceMatrix * atmP;
      #endif
      vAtmWorld = (modelMatrix * atmP).xyz;`
    );

    const head = /* glsl */`
      varying vec3 vAtmWorld;
      uniform sampler2D uSkyLut;
      uniform sampler2D uTransLut;
      uniform sampler2D uCloudShadowMap;
      uniform vec3  uSunDir;
      uniform float uSunIntensity;
      uniform float uCamAlt;
      uniform float uShadowTile;
      uniform float uCloudShadowStrength;
      uniform float uFogDensity;
      uniform float uFogHeight;
      uniform float uFogBase;
      uniform float uHazeBase;
      uniform vec3  uAerialTint;
      uniform float uAerialStrength;
      uniform float uSpecIBL;
      uniform float uSkyDim;
      uniform float uOvercast;
      uniform float uNight;
      uniform vec3  uNightTint;
      ${ATMO_COMMON}

      float atmCloudShadow(vec3 wp) {
        vec2 uv = wp.xz / uShadowTile + 0.5;
        float s = texture2D(uCloudShadowMap, uv).r;
        return mix(1.0, s, uCloudShadowStrength);
      }
    `;
    shader.fragmentShader = head + shader.fragmentShader;

    // Cloud shadows modulate every directional light (sun by day, moon by
    // night). The lighting code lives in a ShaderChunk, and includes are not
    // expanded yet at onBeforeCompile time, so inline the chunk (CSM has
    // already replaced the global one) and patch that.
    const shadowCall = 'directLight.color *= atmCloudShadow( vAtmWorld );';
    let lightsBegin = ShaderChunk.lights_fragment_begin
      .split('getDirectionalLightInfo( directionalLight, directLight );')
      .join('getDirectionalLightInfo( directionalLight, directLight );\n\t\t' + shadowCall)
      .split('getDirectionalLightInfo( directionalLights[0], directLight );')
      .join('getDirectionalLightInfo( directionalLights[0], directLight );\n\t\t' + shadowCall);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_begin>', lightsBegin
    );

    // Horizon occlusion for image based specular. Rough ground viewed at a
    // grazing angle otherwise mirrors the whole sky and turns the frame into a
    // flat wash; real micro-geometry shadows most of that away.
    const maps = ShaderChunk.lights_fragment_maps.replace(
      'radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );',
      'radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness ) * mix( 1.0, uSpecIBL, material.roughness );'
    );
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', maps);

    // aerial perspective replaces three's flat fog entirely
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      /* glsl */`
      {
        vec3 atmV = vAtmWorld - cameraPosition;
        float atmDist = length(atmV);
        vec3 atmDir = atmDist > 1e-4 ? atmV / atmDist : vec3(0.0, 1.0, 0.0);

        float H = max(uFogHeight, 1.0);
        float y0 = cameraPosition.y - uFogBase;
        float dy = atmDir.y;
        float integ;
        if (abs(dy) > 1e-3) {
          integ = (H / dy) * (exp(-y0 / H) - exp(-(y0 + dy * atmDist) / H));
        } else {
          integ = atmDist * exp(-y0 / H);
        }
        integ = max(integ, 0.0);

        float od = uFogDensity * integ + uHazeBase * atmDist;
        float T = exp(-od);

        float r = ATM_PLANET_R + max(uCamAlt, 1.0);
        // haze between the eye and a surface is lit like the sky just above the
        // horizon, never like the (occluded) ground below it
        vec3 apDir = normalize(vec3(atmDir.x, max(atmDir.y, 0.004), atmDir.z));

        // --- Rayleigh / Mie split ------------------------------------------
        // Sampling the LUT along the view ray alone makes *every* azimuth warm
        // at low sun, because the horizon band is reddened all the way round.
        // The air is not one colour: the molecular (Rayleigh) term is blue and
        // near-isotropic, the aerosol (Mie) term is warm and lives in a tight
        // forward lobe about the sun. Weighting them separately is what puts
        // cool haze on the anti-solar side of a golden hour frame and keeps the
        // warm inscatter where the sun actually is.
        vec3 highDir = normalize(vec3(apDir.x, apDir.y + 0.55, apDir.z));
        vec3 zenith  = atmSkyRadiance(uSkyLut, r, vec3(0.0, 1.0, 0.0), uSunDir) * uSunIntensity;
        vec3 rayCol  = atmSkyRadiance(uSkyLut, r, highDir, uSunDir) * uSunIntensity;
        rayCol = mix(rayCol, zenith, 0.40);
        vec3 mieCol  = atmSkyRadiance(uSkyLut, r, apDir, uSunDir) * uSunIntensity;
        // The near-sun entry of the sky LUT carries the whole solar aureole,
        // integrated over the entire atmosphere. A few kilometres of surface
        // haze is nowhere near that bright, and letting it through blows the
        // sun-side third of a sunset frame to flat white. Cap the magnitude
        // against the molecular term and keep only the hue.
        float apRef = dot(rayCol, vec3(0.3333)) + 1e-5;
        float apLum = dot(mieCol, vec3(0.3333)) + 1e-5;
        mieCol *= min(1.0, (apRef * 2.2) / apLum);
        // ~57 deg to ~10 deg from the sun vector
        float apCos = dot(atmDir, uSunDir);
        float mieW  = smoothstep(0.55, 0.985, apCos);
        vec3 inCol  = mix(rayCol, mieCol, mix(0.10, 0.42, mieW));

        if (uOvercast > 0.01) {
          vec3 upSky = atmSkyRadiance(uSkyLut, r, vec3(0.0, 1.0, 0.0), uSunDir) * uSunIntensity;
          vec3 flat3 = vec3(dot(upSky, vec3(0.3333)));
          // a storm deck is darkest at the horizon, not brightest: the light
          // gets there through kilometres more cloud than it does overhead
          vec3 deck = mix(upSky, mix(upSky, flat3, 0.50), 0.65) * 1.10;
          float slot = exp(-max(atmDir.y, 0.0) * 7.0);
          deck *= mix(0.58, 1.0, smoothstep(-0.03, 0.45, atmDir.y)) + 0.70 * slot;
          inCol = mix(inCol, deck, uOvercast);
        }
        inCol *= uSkyDim * uAerialTint;
        // Airglow. The sky dome already sits on this floor at night; without
        // the same floor here the air between the eye and a distant ridge is
        // perfectly black, so moonlit faces read as snow cut out of nothing.
        // Aerial perspective has to reach the same colour the sky does or the
        // horizon stops joining up.
        inCol += uNightTint * uNight * 1.6;
        float k = (1.0 - T) * uAerialStrength;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, inCol, clamp(k, 0.0, 1.0));
      }
      `
    );
  }
}

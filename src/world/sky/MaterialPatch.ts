import { ShaderChunk } from 'three';
import { isLitMaterial, isMesh } from '../../util/three-guards.ts';
import type { AtmosphereUniforms } from '../Sky.ts';
import type * as THREE from 'three';
import { ATMO_COMMON } from '../../shaders/atmosphere.glsl.ts';

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
  count!: number;
  csm!: import('three/examples/jsm/csm/CSM.js').CSM;
  uniforms!: AtmosphereUniforms;
  /** {@link guardCompile} installs its wrapper once. */
  _guarded = false;
  /**
   * @param uniforms shared uniform objects (LUTs, fog, cloud shadow)
   */
  constructor(csm: import('three/examples/jsm/csm/CSM.js').CSM, uniforms: AtmosphereUniforms) {
    this.csm = csm;
    this.uniforms = uniforms;
    this.count = 0;
  }

  /**
   * Make every `renderer.compile()` on this renderer scan first.
   *
   * **This is worth 60 shader programs, measured.** `Game.init()` runs
   * `renderer.compile(scene, camera)` and then one warm `post.render()` before
   * `Warmup` — and therefore before `Warmup._patchAll()` — so every lit
   * material visible at that moment compiled UNPATCHED. Then the patch landed,
   * `needsUpdate` fired, and three compiled the same material again with the
   * CSM defines and the `atmo1|` key. `src/tools/probes/progbare.mts` counts
   * the survivors: 60 `physical` programs with neither, `usedTimes` 234, and
   * `progused.mts` shows not one of them is bound by any frame in a
   * twelve-shot spread of the corpus. They are compiled, held for the life of
   * the page, and dead the instant they are born.
   *
   * The fix belongs here rather than in `Game.ts` — which is shared, and whose
   * compile call is *correct*; it is only early. Wrapping the renderer makes
   * the invariant "a compile is always preceded by a scan" true for every
   * caller, including the two inside `Warmup`, instead of true for whoever
   * remembered. Same shape as `BootProfile` wrapping `Game.add`.
   *
   * @param renderer the renderer whose `compile` should scan first
   */
  guardCompile(renderer: THREE.WebGLRenderer) {
    if (this._guarded) return;
    this._guarded = true;
    const orig = renderer.compile.bind(renderer);
    const self = this;
    renderer.compile = function (scene, camera, targetScene) {
      self.scan(scene);
      return orig(scene, camera, targetScene);
    };
  }

  /**
   * Walk the scene and patch anything new. Cheap enough to run every frame.
   *
   * Takes an `Object3D` rather than a `Scene` because {@link guardCompile}
   * hands it whatever `renderer.compile` was given, which three types as
   * `Object3D`.
   */
  scan(scene: THREE.Object3D) {
    scene.traverse((o) => {
      if (!isMesh(o)) return;
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) { for (const mm of m) this.patch(mm); } else this.patch(m);
    });
  }

  patch(mat: THREE.Material) {
    if (!mat || mat.userData.__atmo) return;
    // three's per-class runtime flags; `Material` itself declares none of them
    if (!isLitMaterial(mat)) return;
    mat.userData.__atmo = true;

    const prev = mat.onBeforeCompile;
    this.csm.setupMaterial(mat);
    const csmHook = mat.onBeforeCompile;
    const self = this;

    mat.onBeforeCompile = function (shader, renderer) {
      if (prev) prev.call(this, shader, renderer);
      if (csmHook) csmHook.call(this, shader, renderer);
      self.inject(shader, this as THREE.Material);
    };
    const key = mat.customProgramCacheKey;
    mat.customProgramCacheKey = function () {
      return 'atmo1|' + (key ? key.call(this) : '');
    };
    mat.needsUpdate = true;
    this.count++;
  }

  inject(shader: { uniforms: Record<string, THREE.IUniform>, vertexShader: string, fragmentShader: string }, mat?: THREE.Material) {
    for (const k of Object.keys(this.uniforms)) shader.uniforms[k] = this.uniforms[k];
    // Per-material, so it must not come from the shared uniform block above.
    shader.uniforms.uActorHaze = { value: mat?.userData?.__actorHaze ? 1 : 0 };

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
      uniform float uActorHaze;
      uniform vec2  uAerialNear;
      uniform float uSpecIBL;
      uniform float uEnvDiffuse;
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
      // An L2 projection of a sky that is bright above and near-black below
      // overshoots, and three's `shGetIrradianceAt` does not clamp — so the down
      // lobe can come back **negative** and subtract light from anything facing
      // the ground. Measured at 22:00 before this line: −0.0017. Small, but
      // negative irradiance is not a small kind of wrong, and it grows with the
      // up/down contrast, which is exactly what a good sky has.
      //
      // Clamped here rather than de-ringed at projection time: windowing the
      // higher bands would also smooth away the directionality that is the
      // entire point of the probe, to fix a defect that only ever shows on the
      // one lobe where the light really is zero.
      .split('irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );')
      .join('irradiance += max( getLightProbeIrradiance( lightProbe, geometryNormal ), vec3( 0.0 ) );')
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
    ).replace(
      // The env cube is specular-only since 3.8(a): its diffuse irradiance is
      // now the SH probe's job, and the probe can carry the sky's *direction*
      // where a cube's cosine convolution arrives as one unaimable flood. Both
      // at once would double-count, which is the failure FFXV-opus's own audit
      // found on exactly this path. Gated per-material rather than by
      // overwriting `ShaderChunk` globally: a chunk override reaches materials
      // this patch has deliberately never touched, and CSM already writes to
      // `onBeforeCompile` here — two systems editing one global string is how
      // the shader-audit landmine got written.
      'iblIrradiance += getIBLIrradiance( geometryNormal );',
      'iblIrradiance += getIBLIrradiance( geometryNormal ) * uEnvDiffuse;'
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
        // The elevation this is sampled at decides the *value* aerial
        // perspective converges to, and it was the whole defect. Measured with
        // ?post=aerialmax (haze driven to full opacity, so a distant ridge
        // renders as pure inscatter and can be read with an eyedropper): a
        // 0.55 rise — about 29 degrees — mixed 40% toward the zenith converged
        // on #274f8e, a deep navy at luma 72. ART-DIRECTION.md §2 measures
        // a distant FFXV ridge at #bad2e4, luma 206. Right hue, a third of
        // the value, which is why turning the density up made far ranges go
        // dark and muddy instead of pale — and why every previous attempt to
        // strengthen aerial perspective here would have made the frame worse.
        //
        // It is wrong physically as well as by the numbers. mix(surface,
        // inCol, 1-T) converges to the *equilibrium* radiance of the path,
        // and the equilibrium of a near-horizontal path a few kilometres above
        // the ground is the sky radiance at that elevation — a long column,
        // hence pale and bright. Sampling 29 degrees up reads a column several
        // times shorter, and the zenith mix takes it further the same way.
        //
        // The small rise that remains is real: a few kilometres of ground haze
        // is not the infinite column the true horizon sample integrates, so it
        // sits a little short of full horizon brightness.
        // The rise and the zenith mix were the residue of the navy bug, kept on
        // the argument that "a few kilometres of ground haze is not the infinite
        // column the true horizon sample integrates". That argument does not
        // survive its own numbers. uHazeBase is 2.4e-4 per metre where the
        // sky LUT's own near-ground extinction is about 3.4e-5 -- Rayleigh at
        // 1.35e-5 plus the LUT's Mie -- so our haze is roughly SEVEN TIMES the
        // atmosphere the LUT integrates. Four kilometres of it is optically as
        // deep as the LUT's whole horizon column, and the equilibrium radiance
        // a path that deep converges on is the true horizon radiance, not one
        // lifted 5.7 degrees and pulled an eighth of the way to the zenith.
        //
        // Measured, ?post=aerialmax --ablate noexp, zone_vannath: the
        // converged colour was #99bbd2 -- luma 182, R-B -57 -- while the sky
        // band directly above the same ridge in the same frame reads #c3d6d9,
        // luma 210. ART-DIRECTION.md §2's measured FFXV ridge is #bad2e4, luma
        // 206. So the term was converging 24 levels below, and 15 levels bluer
        // than, the value the project's own reference measures, and 28 levels
        // below the sky it is supposed to join.
        //
        // The rise is not deleted, because the reason it was introduced is
        // real: at low sun the horizon band is reddened all the way round, and
        // sampling flat at the view azimuth makes every azimuth warm. 0.03 is
        // about 1.7 degrees, enough to clear the horizon's own reddest sliver
        // while landing on its value.
        vec3 highDir = normalize(vec3(apDir.x, apDir.y + 0.03, apDir.z));
        vec3 zenith  = atmSkyRadiance(uSkyLut, r, vec3(0.0, 1.0, 0.0), uSunDir) * uSunIntensity;
        vec3 rayCol  = atmSkyRadiance(uSkyLut, r, highDir, uSunDir) * uSunIntensity;
        rayCol = mix(rayCol, zenith, 0.05);
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

        // The creature/terrain haze split (sibling-ports 3.4).
        //
        // 1 - T is already the airDepth law -- how much air sits in front of
        // this pixel -- and it is physically right for *terrain*, which is a
        // continuous surface receding into the distance. It is wrong for an
        // actor, and the reference is unambiguous about it: a boss standing
        // against the sky in FFXV is a near-black 1:10 cutout that takes no
        // aerial perspective at all, while the hillside behind it at the same
        // range is fully hazed. That contrast is what reads as "a character in
        // a place" rather than a decal at the same depth as its background.
        //
        // Physically this is not a cheat: an actor is metres deep where the
        // terrain behind it is kilometres deep, and it is lit by a key that the
        // haze column never intercepts. So on an actor the haze is suppressed
        // across the near field and ramps in only past uAerialNear.y, where
        // there really is a scattering column in front of it.
        //
        // ACTORS ARE MARKED BY userData.__actorHaze, NOT BY LAYER. A layer or
        // visible flag cannot express this -- the same mesh has to be hazed
        // one way in the colour pass and is irrelevant in the shadow pass.
        float actorK = mix(1.0, smoothstep(uAerialNear.x, uAerialNear.y, atmDist), uActorHaze);
        k *= actorK;

        gl_FragColor.rgb = mix(gl_FragColor.rgb, inCol, clamp(k, 0.0, 1.0));
      }
      `
    );
  }
}

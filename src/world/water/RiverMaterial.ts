import * as THREE from 'three';
import { RIVER_WAVES_GLSL } from './Waves.ts';
import { STATION } from './River.ts';

/**
 * The two river materials — plan §6.2's shading half.
 *
 * **The water** is a displaced, absorbing surface. `uv.y` carries the signed bed
 * depth in metres, so the Beer-Lambert body colour is the same physics the lakes
 * use and a creek and a reach do not come out the same colour. `uv.x` is the
 * edge alpha, which is what lets the strip end at its own waterline without a
 * cut. Both stages of this material call {@link RIVER_WAVES_GLSL} and nothing
 * else, so the displacement, the normal, the Jacobian and the RMS slope are one
 * sum — see that file for why that is a rule rather than a tidiness.
 *
 * **The banks** are a decal, and they are blended the way the shore ribbon is:
 * `dst * a + c`, `a` the albedo drop of wet gravel and `c` the spray. The
 * terrain's own light survives underneath and there is no second lighting model
 * to drift out of step with the first.
 *
 * ### Foam is derived, never stamped
 *
 * Four terms and every one of them is a number the geometry already knows:
 *
 * - **Froude**, per station, from Manning's velocity over the wave celerity.
 *   Below about 0.6 a reach is a pool and cannot hold white water at all.
 * - **Reach alternation.** Real channels alternate riffle and pool on a period
 *   of a few channel widths; two detuned sine sets in station give that without
 *   ever repeating exactly.
 * - **Jacobian crests.** The second derivative of the wave sum along the
 *   channel, which is positive where the surface is steepening — the same place
 *   a real wave breaks.
 * - **Shoaling gate.** White water needs shallow water. Deep pools stay dark
 *   however fast they run.
 *
 * A contour of foam stamped at a fixed offset from the bank is the single
 * clearest tell that a river was drawn rather than simulated.
 */

/** Uniforms both river materials share and the owner drives. */
export interface RiverUniforms {
  uTime: { value: number };
  uCameraPos: { value: THREE.Vector3 };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uAmbient: { value: THREE.Color };
  uNoise: { value: THREE.Texture | null };
  [k: string]: THREE.IUniform;
}

function common(noise: THREE.Texture | null): RiverUniforms {
  return {
    uTime: { value: 0 },
    uCameraPos: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3) },
    uSunColor: { value: new THREE.Color(0xfff0d8) },
    uAmbient: { value: new THREE.Color(0x9fc0ee).multiplyScalar(0.18) },
    uNoise: { value: noise },
  };
}

/** The flowing surface. */
export function makeRiverWaterMaterial(noise: THREE.Texture | null): THREE.ShaderMaterial {
  const uniforms: RiverUniforms = {
    ...common(noise),
    /**
     * Per-metre extinction, one coefficient per channel — the same model and
     * the same argument as the lakes: red is absorbed an order of magnitude
     * faster than blue, which is why shallow water reads warm over its own bed
     * and deep water reads green then blue-black. River water carries more
     * sediment than a lake, so the coefficients are higher and the transition
     * happens over a metre rather than over ten.
     */
    uSigma: { value: new THREE.Vector3(0.72, 0.26, 0.14) },
    uScatter: { value: new THREE.Color(0x2c3a30) },
    uBed: { value: new THREE.Color(0x6d6350) },
    /**
     * Wavelength floor for displacement: six vertex samples per wavelength, the
     * same Nyquist rule the terrain lattice obeys, derived from the builder's
     * own station spacing rather than picked.
     */
    uDispCut: { value: 6 * STATION },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    vertexShader: /* glsl */`
      precision highp float;
      ${RIVER_WAVES_GLSL}
      uniform float uTime, uDispCut;
      attribute vec3 aRiver;      // station (m), lateral (m), froude
      attribute vec2 aFlow;       // unit downstream direction in xz
      varying vec3 vRiver;
      varying vec2 vFlow;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main(){
        vRiver = aRiver;
        vFlow = aFlow;
        vUv = uv;
        // Waves fade out into the shallows and into the bank, so the surface
        // meets its own waterline flat. A wave that displaces at the edge lifts
        // the strip off the ground and puts a rim of sky under it.
        float scale = smoothstep(0.03, 0.55, uv.y) * smoothstep(0.0, 0.28, uv.x);
        float y; vec2 g; float jac, rms;
        rvWaves(aRiver.xy, uTime, uDispCut, scale, y, g, jac, rms);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += y;
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      ${RIVER_WAVES_GLSL}
      uniform float uTime, uDispCut;
      uniform vec3 uCameraPos, uSunDir, uSunColor, uAmbient, uSigma, uScatter, uBed;
      uniform sampler2D uNoise;
      varying vec3 vRiver;
      varying vec2 vFlow;
      varying vec2 vUv;
      varying vec3 vWorld;

      void main(){
        float depth = max(vUv.y, 0.0);
        float edge = vUv.x;
        float station = vRiver.x;
        float froude = vRiver.z;
        float dist = length(uCameraPos - vWorld);

        // The same sum the vertex stage displaced from. Identical arguments, so
        // the crest the light sits on is the crest the geometry has.
        float scale = smoothstep(0.03, 0.55, depth) * smoothstep(0.0, 0.28, edge);
        float y; vec2 g; float jac, rms;
        rvWaves(vRiver.xy, uTime, uDispCut, scale, y, g, jac, rms);

        // Channel frame -> world. T is downstream, B across.
        vec3 T = vec3(vFlow.x, 0.0, vFlow.y);
        vec3 B = vec3(-vFlow.y, 0.0, vFlow.x);
        vec3 grad = g.x * T + g.y * B;
        vec3 N = normalize(vec3(-grad.x, 1.0, -grad.z));

        vec3 V = normalize(uCameraPos - vWorld);
        // Capped at 0.62, not 1.0. A river surface is rough at every scale
        // below a pixel, so its grazing reflection is a wide diffuse lobe rather
        // than a mirror -- and an uncapped Fresnel against a flat sky colour is
        // what made the first build read as a sheet of white plastic laid over
        // the badlands. The RMS slope of the waves the pixel cannot resolve is
        // exactly the right thing to widen it with.
        float grazeK = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
        float fres = mix(0.02, mix(0.62, 0.34, clamp(rms * 6.0, 0.0, 1.0)), grazeK);

        // --- body colour, metric depth ------------------------------------
        // Path length along the refracted ray, one Snell step, exactly as the
        // lakes do it: a grazing view across a shallow margin is looking through
        // more water than a plan view of the same spot.
        vec3 R = refract(-V, N, 0.7502);
        float down = max(-R.y, 0.12);
        float path = depth / down;
        vec3 Tr = exp(-uSigma * path);
        float caust = texture2D(uNoise, vWorld.xz * 0.11 + vec2(uTime * 0.05 * vFlow.x, uTime * 0.05 * vFlow.y)).x;
        vec3 bed = uBed * (1.0 + caust * 0.7 * Tr.g);
        vec3 downwelling = uSunColor * max(uSunDir.y, 0.0) * 0.42 + uAmbient * 1.9;
        vec3 body = (bed * Tr + uScatter * (1.0 - Tr)) * downwelling;

        // Sky, cheaply. A river is narrow and moving; a planar reflection of it
        // would be a second scene render for a surface a wave normal smears
        // beyond recognition, and the lakes already pay that once.
        vec3 sky = uAmbient * 1.15 + uSunColor * max(uSunDir.y, 0.0) * 0.06;

        // --- foam, derived ------------------------------------------------
        // Riffle-pool alternation. Two detuned periods, so the pattern never
        // closes on itself along a reach.
        float riffle = 0.5 + 0.5 * (0.62 * sin(station * 0.1140 + 0.7) + 0.38 * sin(station * 0.0713 - 2.1));
        // Crests that are steepening. Positive curvature along the channel is
        // where a real wave stands up and breaks.
        float crest = smoothstep(0.008, 0.055, -jac);
        // Shoaling: white water is a shallow-water phenomenon.
        float shoal = 1.0 - smoothstep(0.30, 1.05, depth);
        float fr = smoothstep(0.52, 1.10, froude);
        float foam = fr * mix(0.18, 1.0, riffle) * crest * mix(0.25, 1.0, shoal);
        // Where it runs against the bank, always. That is not the Froude term,
        // it is the strip's own edge, and it is what stops the water ending in
        // a line.
        float lip = (1.0 - smoothstep(0.0, 0.14, edge)) * (0.20 + 0.55 * fr);
        float scud = texture2D(uNoise, vec2(station * 0.055 - uTime * 0.16, vRiver.y * 0.09)).y;
        foam = clamp(foam * (0.45 + 0.9 * scud) + lip * (0.25 + 0.45 * scud), 0.0, 1.0);
        foam *= 1.0 - smoothstep(300.0, 800.0, dist);

        vec3 col = mix(body, sky, fres);
        col = mix(col, vec3(0.92, 0.94, 0.95) * (downwelling * 0.8 + 0.08), foam * 0.9);

        // Specular, roughened by the RMS slope of the waves the pixel cannot
        // resolve. That is the honest use of the fourth output of the sum: the
        // sub-pixel waves widen the lobe instead of aliasing in the normal.
        vec3 H = normalize(uSunDir + V);
        float shine = pow(max(dot(N, H), 0.0), mix(900.0, 40.0, clamp(rms * 3.0, 0.0, 1.0)));
        col += uSunColor * shine * 0.6 * (1.0 - foam * 0.7);

        float alpha = 1.0 - max(max(Tr.r, Tr.g), Tr.b);
        alpha = clamp(max(max(alpha, fres * 0.9), foam * 0.95), 0.0, 1.0);
        // Fade the last few centimetres into the bank so the strip has no rim.
        alpha *= smoothstep(0.0, 0.06, edge);

        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
      }
    `,
  });
  mat.name = 'riverWater';
  return mat;
}

/**
 * The bank decal: wet gravel, and the spray a fast reach throws onto it.
 *
 * `uv.x` runs 0 at the waterline to 1 at the bank top, `uv.y` is metres above
 * the water surface. Wetness keys off `uv.y`, not `uv.x`, for the same reason
 * the shore ribbon's rows do: how far up the bank the water reaches is an
 * elevation, and a flat gravel bar and a cut bank get the right answer from the
 * same number.
 */
export function makeRiverBankMaterial(noise: THREE.Texture | null): THREE.ShaderMaterial {
  const uniforms: RiverUniforms = { ...common(noise), uWetDark: { value: 0.50 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.SrcAlphaFactor,
    blendEquation: THREE.AddEquation,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -6,
    vertexShader: /* glsl */`
      attribute vec3 aRiver;
      varying vec3 vRiver;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main(){
        vRiver = aRiver;
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime, uWetDark;
      uniform sampler2D uNoise;
      uniform vec3 uCameraPos, uSunDir, uSunColor, uAmbient;
      varying vec3 vRiver;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main(){
        float above = vUv.y;              // metres above the water surface
        float station = vRiver.x;
        float froude = vRiver.z;
        float dist = length(uCameraPos - vWorld);
        float near = 1.0 - smoothstep(240.0, 720.0, dist);

        // The wetted margin. A fast reach throws water further up its bank than
        // a pool does, and the surge travels downstream rather than sitting
        // still, so the limit is advected in station.
        float surge = texture2D(uNoise, vec2(station * 0.021 - uTime * 0.045, 0.3)).x;
        float limit = mix(0.10, 0.42, clamp(froude, 0.0, 1.4) / 1.4) * (0.55 + 0.9 * surge);
        float wet = 1.0 - smoothstep(limit - 0.06, limit + 0.16, above);
        // Below the water line the gravel is submerged, and the darkening eases
        // off with depth so the decal's outer edge is not a step in albedo.
        wet = mix(wet, 1.0, smoothstep(0.02, -0.06, above));
        wet *= smoothstep(-1.20, -0.45, above) * 0.5 + 0.5;

        // Spray, only where the reach is fast enough to make any AND only in
        // the first quarter of the bank.
        //
        // Gated on elevation alone it covered the whole decal, because a bank
        // that climbs 1.5 m over 13 m is inside the elevation window for almost
        // all of its width -- and the decal is the wider of the two surfaces, so
        // the river came back as a thirty-nine metre streak of white lace with a
        // three-metre stream somewhere inside it. Spray needs BOTH: low enough
        // above the water, and close enough to it.
        float fr = smoothstep(0.60, 1.15, froude);
        float lace = texture2D(uNoise, vec2(station * 0.09 - uTime * 0.22, above * 0.9)).y;
        float spray = fr * smoothstep(0.66, 0.95, lace)
          * (1.0 - smoothstep(limit * 0.4, limit * 1.6, above))
          * (1.0 - smoothstep(0.05, 0.34, vUv.x));

        vec3 lit = uSunColor * max(uSunDir.y, 0.0) * 0.55 + uAmbient * 1.6;
        vec3 V = normalize(uCameraPos - vWorld);
        float graze = pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
        vec3 sheen = uAmbient * (graze * wet * 1.4 * near);

        float mul = mix(1.0, uWetDark, wet * near);
        gl_FragColor = vec4(lit * spray * 0.30 * near + sheen, mul);
      }
    `,
  });
  mat.name = 'riverBank';
  return mat;
}

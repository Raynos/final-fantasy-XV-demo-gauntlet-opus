import * as THREE from 'three';

/**
 * The swash material for the shoreline ribbon — plan §6.1's shading half.
 *
 * ### It multiplies the frame, it does not paint over it
 *
 * See the note in `Shore.ts`: the ribbon is blended `dst * a + c`, so the ground
 * underneath keeps its own sun, shadow, aerial perspective and grade. `a` is the
 * albedo drop of wet sand and `c` is foam plus the sky sheen on the wet film.
 * That is also why there is no lighting code here at all — there is nothing to
 * get wrong, and nothing to drift out of step with the terrain shader when
 * somebody changes the terrain shader.
 *
 * ### The swash is a run-up *elevation*, not a distance
 *
 * A wave does not run a fixed number of metres up the beach; it runs until it
 * has climbed a certain height, which is why a steep beach has a narrow swash
 * band and a flat one has a band forty metres wide from the same sea. So the
 * shader compares the vertex's own elevation above the water against a run-up
 * limit in metres, and the width of the wet band falls out of the ground's slope
 * for free. On a cliff it collapses to a wet stripe at the waterline, which is
 * exactly right.
 *
 * ### Three detuned sets, and a group envelope
 *
 * The run-up limit is the sum of three sine sets whose along-shore wavelengths
 * are 43 / 71 / 113 m — deliberately not harmonic. A clean series beats into a
 * stationary pattern; a harmonic one produces a repeating scallop that reads as
 * a texture. The sum is then modulated by a slow noise envelope so the sets
 * arrive in groups, because a beach where every wave runs the same distance is
 * the corduroy failure of the river strip in another coordinate.
 *
 * ### Blind to
 *
 * The ribbon has no idea where the water plane's own foam is; the two are tuned
 * to meet at the waterline and nothing enforces it. It also cannot see props, so
 * a jetty leg gets no wet ring.
 */

/** Uniforms the owning system drives each frame. */
export interface ShoreUniforms {
  uTime: { value: number };
  uCameraPos: { value: THREE.Vector3 };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uAmbient: { value: THREE.Color };
  uNoise: { value: THREE.Texture | null };
  uWetDark: { value: number };
  uFoam: { value: number };
  [k: string]: THREE.IUniform;
}

/**
 * @param noise a tiling greyscale-ish texture; the ribbon reads .x and .y
 */
export function makeShoreMaterial(noise: THREE.Texture | null): THREE.ShaderMaterial {
  const uniforms: ShoreUniforms = {
    uTime: { value: 0 },
    uCameraPos: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3) },
    uSunColor: { value: new THREE.Color(0xfff0d8) },
    uAmbient: { value: new THREE.Color(0x9fc0ee).multiplyScalar(0.18) },
    uNoise: { value: noise },
    /** How far wet sand drops the ground's albedo. Measured beaches: 0.45-0.6. */
    uWetDark: { value: 0.52 },
    /** Master foam gain, so a storm preset can push it without a recompile. */
    uFoam: { value: 1.0 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    // FrontSide on purpose. DoubleSide is what let the sibling's ribbon ship
    // inside-out through four rounds: a backwards strip still draws, so nothing
    // downstream can report the defect. Here a winding bug makes the ribbon
    // vanish, and `assertUpFacing` refuses to build it in the first place.
    side: THREE.FrontSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.SrcAlphaFactor,
    blendEquation: THREE.AddEquation,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -6,
    vertexShader: /* glsl */`
      attribute vec3 aPhase;
      attribute vec3 aShore;     // elevation above this body's level, offset, paleness
      varying vec3 vPhase;
      varying vec3 vShore;
      varying vec3 vWorld;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vPhase = aPhase;
        vShore = aShore;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime, uWetDark, uFoam;
      uniform sampler2D uNoise;
      uniform vec3 uCameraPos, uSunDir, uSunColor, uAmbient;
      varying vec3 vPhase;
      varying vec3 vShore;
      varying vec3 vWorld;

      const float TAU = 6.28318530718;

      void main(){
        float elev = vShore.x;          // metres above this body's water level
        float dist = length(uCameraPos - vWorld);

        // --- the swash ---------------------------------------------------
        // Three detuned sets. vPhase is already in cycles and, on a closed
        // shoreline, quantised so the loop closes on a whole number of them.
        float s1 = sin(TAU * vPhase.x - uTime * 1.31);
        float s2 = sin(TAU * vPhase.y - uTime * 0.87 + 1.7);
        float s3 = sin(TAU * vPhase.z - uTime * 0.54 + 4.1);
        float sum = (0.50 * s1 + 0.31 * s2 + 0.23 * s3) / 1.04;
        // Group envelope: sets arrive in trains, and without this every wave on
        // the beach runs to the same line.
        float env = texture2D(uNoise, vec2(vPhase.z * 0.37, uTime * 0.011)).x;
        float runup = mix(0.05, 0.52, (0.5 + 0.5 * sum) * mix(0.55, 1.0, env));
        // Cusps. Everything above runs at the ribbon's own along-shore
        // wavelengths -- 43, 71 and 113 m -- so the run-up line was straight
        // over every metre of beach anyone stands on, and a Gaussian around a
        // straight line is a painted stripe. Beach cusps are a 4-8 m
        // phenomenon; vPhase.x is in cycles of 43 m, so x 7.2 puts one noise
        // period on six metres of shore. Advected slowly, because a cusp field
        // migrates along a beach rather than standing still.
        float cusp = texture2D(uNoise, vec2(vPhase.x * 7.2, uTime * 0.008)).z;
        runup *= 0.74 + 0.52 * cusp;

        // Wet below the run-up line, plus the capillary fringe that never dries.
        float swashWet = 1.0 - smoothstep(runup - 0.05, runup + 0.10, elev);
        float fringe = 1.0 - smoothstep(0.02, 0.66, elev);
        float wet = clamp(max(swashWet, fringe * 0.55), 0.0, 1.0);
        // Under water the sand is wet by definition; the darkening then eases
        // off with depth so the ribbon's own outer edge is not a step in albedo
        // where the geometry stops.
        wet = mix(wet, 1.0, smoothstep(0.02, -0.10, elev));
        wet *= smoothstep(-1.45, -0.62, elev) * 0.55 + 0.45;

        // Sand holds the water; bare rock and grass barely darken. The baked
        // ground albedo is the only handle on that here, and a pale dry surface
        // is a sand-or-dust surface almost everywhere on this map.
        float pale = clamp(vShore.z * 1.55, 0.25, 1.0);
        wet *= mix(0.55, 1.0, pale);

        // --- foam ---------------------------------------------------------
        // The bright line at the top of the run-up, where the sheet thins and
        // the bubbles are left standing.
        float d = (elev - runup) / 0.055;
        // Tongues. The lip is the brightest term in the shader at 0.80 and it
        // was the flat white patch: an unmodulated Gaussian around an
        // unmodulated contour. Broken by a two-metre field advected up and down
        // the beach, it comes apart into the fingers a real sheet of swash
        // leaves. Floored at 0.18 rather than 0, because a swash edge is
        // continuous -- it thins, it does not have holes punched in it.
        vec2 tu = vec2(vPhase.x * 21.5, vShore.y * 0.42 - uTime * 0.10);
        float tongue = 0.18 + 1.05 * smoothstep(0.34, 0.80, texture2D(uNoise, tu).z);
        float lip = exp(-d * d) * (0.55 + 0.45 * env) * tongue;

        // The lace of foam sliding back down behind it. Advected in offset, so
        // it travels up and down the beach rather than along it.
        //
        // Held to a BAND behind the run-up edge rather than to the whole wet
        // zone. Keyed on the wet flag alone it covered everything below the
        // run-up line, which on a beach shallow enough to have a run-up line at
        // all is most of the frame; the shoreline came back reading as snow.
        vec2 lu = vec2(vPhase.y * 1.7, vShore.y * 0.05 - uTime * 0.055);
        float lace = texture2D(uNoise, lu).y;
        float behind = (elev - runup * 0.45) / 0.20;
        lace = smoothstep(0.66, 0.95, lace) * swashWet * exp(-behind * behind);

        // Broken water in the last metre of depth: the shore break itself.
        float shoal = smoothstep(-0.95, -0.08, elev) * (1.0 - smoothstep(-0.05, 0.10, elev));
        float bore = texture2D(uNoise, vec2(vPhase.x * 0.9 + uTime * 0.02, vShore.y * 0.03)).x;
        // The bore also needs breaking up, and for the same reason: shoal spans
        // the last metre of *depth*, which on the gentle beaches this term
        // exists for is ten-plus metres of ground, and an unbroken mask over
        // ten metres of ground is a sheet of white.
        float fine = texture2D(uNoise, vec2(vPhase.y * 16.0 + uTime * 0.05, vShore.y * 0.28)).z;
        float brk = shoal * smoothstep(0.58, 0.90, bore * (0.62 + 0.38 * (0.5 + 0.5 * s1)))
          * (0.22 + 1.15 * smoothstep(0.30, 0.78, fine));

        float foam = clamp(lip * 0.80 + lace * 0.42 + brk * 0.45, 0.0, 1.0) * uFoam;
        // Grain, last. Every term above is a smooth function of two smooth
        // fields, so wherever two of them overlap the sum saturates and the
        // result is a solid white area with a shaped *edge* and no interior --
        // which is what a close-up of the swash showed even after the edge was
        // broken into cusps. Foam is bubbles: at half a metre it is mottled,
        // and a photograph of it has grain everywhere, not only at its rim.
        // Advected across the beach so it moves with the sheet.
        float grain = texture2D(uNoise, vec2(vPhase.x * 34.0, vShore.y * 0.75 - uTime * 0.16)).z;
        foam *= 0.46 + 0.86 * grain;

        // A foam band thinner than a pixel can only alias, and a white confetti
        // line along every far shore is the cheapest way to lose a blind test.
        float near = 1.0 - smoothstep(260.0, 780.0, dist);
        foam *= near;

        // --- what actually leaves the shader -------------------------------
        // Downwelling light, so foam under a storm is storm-grey and foam at
        // dusk is orange. A constant white here is how a shoreline ends up
        // looking sunlit in a frame where nothing else is.
        vec3 lit = uSunColor * max(uSunDir.y, 0.0) * 0.55 + uAmbient * 1.6;

        // The wet film is a mirror at grazing angles; that sheen is most of what
        // separates a wet beach from a dark one in a photograph.
        vec3 V = normalize(uCameraPos - vWorld);
        float graze = pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
        vec3 sheen = uAmbient * (graze * wet * 1.5 * near);

        float mul = mix(1.0, uWetDark, wet * near);
        // 0.40, not 0.85. Foam is bright but it is not a light source, and at
        // 0.85 against a multiplier that floors at 0.52 a fully foamed pixel
        // clipped white in a linear HDR buffer whatever was underneath it.
        vec3 add = lit * foam * 0.40 + sheen;

        gl_FragColor = vec4(add, mul);
      }
    `,
  });
  mat.name = 'shoreRibbon';
  return mat;
}

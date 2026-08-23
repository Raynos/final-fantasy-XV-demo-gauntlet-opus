/**
 * The river's wave field, as **one GLSL string used by both shader stages**.
 *
 * Plan §6.2. This file exists because of a single failure the source repo
 * recorded: when the vertex stage displaces from one sum and the fragment stage
 * shades from another, the shading *slides off the geometry*. The two sums drift
 * — a different octave count, a rounded constant, an envelope applied in one and
 * not the other — and the result is a surface whose highlights sit next to its
 * crests instead of on them. It reads as a lighting bug and it is not one.
 *
 * So the sum is written once, here, and injected into both stages verbatim.
 * Displacement, the shading normal, the Jacobian that the foam keys off and the
 * RMS slope all come out of the same loop over the same table.
 *
 * ### The Nyquist gate
 *
 * A wave may only be *displaced* if the vertex lattice carries at least six
 * samples per wavelength — the same rule the terrain lattice obeys. Below that,
 * displacing it does not produce the wave, it produces aliasing that crawls when
 * the camera moves. Every wave still contributes to the **normal**, because a
 * normal is evaluated per pixel and has no such limit. That split is the whole
 * reason a river can look like it has centimetre ripples on it while its
 * geometry only carries the metre-scale swell.
 *
 * `uDispCut` is the wavelength floor, handed in by the builder as six times its
 * own vertex spacing, so it stays honest if the lattice changes.
 *
 * ### Channel coordinates
 *
 * The field is defined in `(station, lateral)` metres along the channel, not in
 * world xz. A river bends; a plane wave in world space would run across the
 * bank on one reach and along it on the next, and rotating a world-space wave
 * per vertex breaks phase continuity outright. In channel space the waves travel
 * downstream everywhere and the surface stays continuous through every bend.
 *
 * ### Detuning and the group envelope
 *
 * Eight wavelengths, no two in a small-integer ratio. A clean harmonic series
 * beats into a stationary diamond lattice that reads as a texture rather than as
 * water, and beats *in the same place every frame*, which is worse. On top of
 * that a 30 m fbm envelope makes the sets arrive in groups; without one the
 * surface is corduroy — every wave the same height for ever.
 */

/**
 * Wave table and the sum, in GLSL. Injected into both stages of the river
 * material. Declares nothing but functions and constants, so it can sit above
 * `main()` in either.
 */
export const RIVER_WAVES_GLSL = /* glsl */`
  #define RV_N 8

  // lambda (m), amplitude (m), lateral direction cosine, phase speed (m/s).
  // The lateral component is small everywhere: a river's waves run downstream.
  // The three long sets carry the geometry, the five short ones the shading.
  const vec4 RV_W[RV_N] = vec4[RV_N](
    vec4(27.30, 0.075,  0.13, 1.55),
    vec4(18.70, 0.058, -0.21, 1.32),
    vec4(13.10, 0.041,  0.31, 1.14),
    vec4( 8.30, 0.030, -0.37, 0.95),
    vec4( 5.30, 0.021,  0.44, 0.80),
    vec4( 3.41, 0.014, -0.52, 0.67),
    vec4( 2.13, 0.009,  0.61, 0.55),
    vec4( 1.37, 0.006, -0.68, 0.44)
  );

  /** Cheap value noise, for the group envelope only. */
  float rvHash(vec2 p){
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float rvNoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(rvHash(i), rvHash(i + vec2(1, 0)), f.x),
               mix(rvHash(i + vec2(0, 1)), rvHash(i + vec2(1, 1)), f.x), f.y);
  }
  /** 30 m group envelope. Two octaves is enough to break the regularity. */
  float rvEnvelope(vec2 sn, float t){
    float a = rvNoise(sn * vec2(1.0 / 30.0, 1.0 / 22.0) + vec2(t * 0.031, 0.0));
    float b = rvNoise(sn * vec2(1.0 / 11.0, 1.0 / 9.0) + vec2(t * 0.074, 3.1));
    return 0.42 + 0.78 * (a * 0.66 + b * 0.34);
  }

  /**
   * The sum. Both stages call this and nothing else.
   *
   * @param sn      (station, lateral) in metres along the channel
   * @param t       seconds
   * @param dispCut wavelength floor for DISPLACEMENT; six times vertex spacing
   * @param scale   0..1 amplitude scale (shallow water carries less)
   * @param y       vertical displacement, metres — only waves at or above dispCut
   * @param g       surface gradient in (station, lateral), ALL waves
   * @param jac     second derivative along the channel: crest steepening
   * @param rms     RMS slope, for the roughness the specular lobe uses
   */
  void rvWaves(vec2 sn, float t, float dispCut, float scale,
               out float y, out vec2 g, out float jac, out float rms){
    y = 0.0; g = vec2(0.0); jac = 0.0; rms = 0.0;
    float env = rvEnvelope(sn, t);
    for (int i = 0; i < RV_N; i++){
      vec4 w = RV_W[i];
      float lambda = w.x;
      float amp = w.y * scale * env;
      vec2 dir = normalize(vec2(1.0, w.z));
      float k = 6.28318530718 / lambda;
      float ph = dot(sn, dir) * k - t * w.w * k;
      float s = sin(ph), c = cos(ph);
      // The Nyquist gate: geometry only for waves the lattice can carry.
      if (lambda >= dispCut) y += amp * s;
      // Shading takes every wave. A normal is evaluated per pixel and has no
      // sampling limit, which is why a two-metre ripple can be seen on a
      // surface whose vertices are three metres apart.
      g += dir * (amp * k * c);
      jac += -amp * k * k * s * dir.x * dir.x;
      rms += 0.5 * amp * amp * k * k;
    }
    rms = sqrt(rms);
  }
`;

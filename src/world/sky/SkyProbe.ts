import * as THREE from 'three';

/**
 * The scene's diffuse ambient, as an L2 spherical-harmonic probe projected from
 * the live sky dome.
 *
 * WHY THIS EXISTS. Before it, the frame had *two* declared diffuse ambients and
 * between them they did one job badly (`docs/plans/2026-08-21-fable-sibling-ports.md`
 * §3.8, measured under `?post=noexp` because closed-loop exposure otherwise
 * compensates for whatever you ablate and the numbers read backwards):
 *
 * - A `HemisphereLight`, declared, tuned, updated every frame, and **inert** —
 *   0.4 luma of 87.7, and 0.1 of the shadow R−B. A sky fill reaching the frame
 *   not at all while holding a slot in the pinned light pool.
 * - The PMREM env cube, which was therefore the *entire* diffuse ambient: 5% of
 *   scene luma and 3.9 of the 12.5-point shadow-colour gap, **and nothing
 *   shadows it**. An unshadowable flood is exactly what flattens shadows, and
 *   it is why the daylight grade's one remaining miss is shadow warmth
 *   (−8.8 R−B against a +5.8 reference) that no amount of re-tinting moved.
 *
 * Both are the same defect seen twice: irradiance arriving from a direction the
 * renderer has no way to occlude, in a quantity nobody could aim. The fix is one
 * probe carrying the sky's *own* directionality — shadow colour is sky colour by
 * construction, because it is literally an integral of the sky — with the env
 * cube demoted to specular-only so nothing is counted twice.
 *
 * WHY A CUBE READBACK AND NOT THE PMREM. `PMREMGenerator` produces a CubeUV 2D
 * texture, not a `CubeTexture`, so `LightProbeGenerator` cannot read it. It also
 * only offers an **async** path (`readRenderTargetPixelsAsync`), and this must be
 * synchronous: a capture poses, settles a fixed number of frames and shoots, so
 * a probe that lands one frame late is a probe that is sometimes stale and
 * sometimes not — which is a determinism hole of exactly the kind §2.1 spent a
 * session closing. 16x16x6 half-float texels is 1,536 of them; the readback is a
 * pipeline flush on a path that already runs at most a few times a second.
 *
 * WHY THE GROUND IS SUBSTITUTED, NOT SCALED. The dome renders below its own
 * horizon as the horizon colour dimmed to 0.55 (`sky.glsl.ts`) — a haze stand-in
 * for distant ground, which is right for a *view* ray and wrong for irradiance:
 * that light is blue, and it has been through the atmosphere on its way to the
 * eye rather than off the ground on its way to the subject. So the downward
 * texels are **replaced** by {@link groundRadiance}, a Lambertian ground lit by
 * the key. Scaling them by an albedo instead — which is what the first version
 * did — returns grey: a warm albedo times blue haze is neutral, and the probe
 * readout measured exactly that, R−B +0.9 on the down lobe against an albedo
 * whose own R:B is 1.31. That is where the dead `HemisphereLight.groundColor`
 * goes: not deleted, but turned from a free-floating constant into what it
 * always claimed to be — an albedo modulating light that actually exists.
 */
export class SkyProbe {
  /** Cosine-blend width across the horizon, in units of `dir.y`. */
  static HORIZON_FEATHER = 0.15;

  /** Scratch, module-lifetime: this runs per frame-ish and must not allocate. */
  private _coord = new THREE.Vector3();
  private _dir = new THREE.Vector3();
  private _basis: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  private _data: Uint16Array;
  private _cam: THREE.CubeCamera;
  private _rt: THREE.WebGLCubeRenderTarget;
  private _size: number;

  /**
   * Albedo of the ground the lower hemisphere bounces off. Sky writes this per
   * frame from the same curve that used to drive `HemisphereLight.groundColor`.
   * Kept separately from {@link groundRadiance} because the probe readout wants
   * to print both, and because a bounce that is wrong is almost always wrong in
   * the *light*, not in the albedo.
   */
  groundAlbedo = new THREE.Color(0.30, 0.26, 0.20);

  /**
   * Radiance leaving the ground, in the renderer's units. Sky writes it as
   * `keyIrradiance * albedo / pi` each time the probe is re-projected.
   *
   * This *replaces* the dome's below-horizon texels rather than scaling them,
   * and that distinction was the whole first attempt's failure. `sky.glsl.ts`
   * draws under its own horizon as horizon haze dimmed to 0.55 — correct for a
   * view ray, and completely wrong as an irradiance source, because it is sky
   * light, blue, and has already been through the atmosphere on its way to the
   * eye rather than off the ground on its way to the subject. Multiplying it by
   * a warm albedo returns grey: measured, the down lobe came back at R−B +0.9
   * where the albedo's own R:B is 1.31.
   */
  groundRadiance = new THREE.Color(0, 0, 0);

  /** The light itself. Added to the scene by `Sky`; one, always visible. */
  light = new THREE.LightProbe();

  /**
   * @param size cube face resolution. 16 is not a compromise: the projection is
   *   an integral against nine basis functions with no frequency above L2, so
   *   detail finer than the basis cannot survive it. Doubling this costs 4x the
   *   readback and moves no coefficient measurably.
   */
  constructor(size = 16) {
    this._size = size;
    this._rt = new THREE.WebGLCubeRenderTarget(size, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.LinearSRGBColorSpace,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    // Near/far bracket the dome's 4000 m radius with room either side. The dome
    // draws with `depthTest: false`, so these only have to not cull it.
    this._cam = new THREE.CubeCamera(1, 20000, this._rt);
    this._data = new Uint16Array(size * size * 4);
  }

  /**
   * Re-project the probe from `envScene`, synchronously.
   *
   * Call it exactly where the env cube is re-baked — the two must never
   * disagree about which sky they describe, or the specular and the diffuse
   * halves of the same ambient come from different hours.
   */
  update(renderer: THREE.WebGLRenderer, envScene: THREE.Scene): void {
    const prevRT = renderer.getRenderTarget();
    this._cam.update(renderer, envScene);
    renderer.setRenderTarget(prevRT);

    const n = this._size;
    const sh = this.light.sh;
    const c = sh.coefficients;
    for (let j = 0; j < 9; j++) c[j].set(0, 0, 0);

    const pixelSize = 2 / n;
    const gr = this.groundRadiance;
    const feather = SkyProbe.HORIZON_FEATHER;
    let totalWeight = 0;

    for (let face = 0; face < 6; face++) {
      renderer.readRenderTargetPixels(this._rt, 0, 0, n, n, this._data, face);
      const data = this._data;
      for (let i = 0, il = data.length; i < il; i += 4) {
        let r = THREE.DataUtils.fromHalfFloat(data[i]);
        let g = THREE.DataUtils.fromHalfFloat(data[i + 1]);
        let b = THREE.DataUtils.fromHalfFloat(data[i + 2]);

        const pixelIndex = i / 4;
        // Transcribed from `LightProbeGenerator.fromCubeRenderTarget`, `flip`
        // and all — WebGL's coordinate system makes it -1, and folding that
        // into the cases by hand is how you get a probe that is subtly mirrored
        // in one axis and looks plausible in every frame.
        const flip = -1;
        const col = (1 - ((pixelIndex % n) + 0.5) * pixelSize) * flip;
        const row = 1 - (Math.floor(pixelIndex / n) + 0.5) * pixelSize;
        const coord = this._coord;
        switch (face) {
          case 0: coord.set(-1 * flip, row, col * flip); break;
          case 1: coord.set(1 * flip, row, -col * flip); break;
          case 2: coord.set(col, 1, -row); break;
          case 3: coord.set(col, -1, row); break;
          case 4: coord.set(col, row, 1); break;
          default: coord.set(-col, row, -1); break;
        }

        // Solid angle of this texel, as a fraction of the unit cube's face.
        const lengthSq = coord.lengthSq();
        const weight = 4 / (Math.sqrt(lengthSq) * lengthSq);
        totalWeight += weight;

        const dir = this._dir.copy(coord).normalize();

        // Ground bounce. `k` is 1 straight down, 0 above the horizon, with a
        // feather across it — a hard step would put an L2-unrepresentable edge
        // into the integrand and the projection would ring, which shows up as a
        // band of the wrong colour on anything near horizontal.
        if (dir.y < feather) {
          const k = Math.min(1, (feather - dir.y) / (2 * feather));
          r += k * (gr.r - r);
          g += k * (gr.g - g);
          b += k * (gr.b - b);
        }

        THREE.SphericalHarmonics3.getBasisAt(dir, this._basis);
        const basis = this._basis;
        for (let j = 0; j < 9; j++) {
          const w = basis[j] * weight;
          c[j].x += w * r;
          c[j].y += w * g;
          c[j].z += w * b;
        }
      }
    }

    const norm = (4 * Math.PI) / totalWeight;
    for (let j = 0; j < 9; j++) c[j].multiplyScalar(norm);
  }

  /**
   * Irradiance the probe delivers to an up-facing surface, in the renderer's
   * own units.
   *
   * `Sky` meters exposure off the light that actually lands on a horizontal
   * surface, and the probe is now part of that. Reading it back rather than
   * re-deriving it is the difference between a closed loop and two open ones
   * that agree until somebody edits either.
   */
  upwardIrradiance(): number {
    // shGetIrradianceAt for normal = +Y, keeping only the terms that survive it.
    const c = this.light.sh.coefficients;
    const y = (v: THREE.Vector3) => 0.2126 * v.x + 0.7152 * v.y + 0.0722 * v.z;
    return Math.max(0, 0.886227 * y(c[0]) + 1.023328 * y(c[2]) + 0.495416 * y(c[6]));
  }

  dispose(): void {
    this._rt.dispose();
  }
}

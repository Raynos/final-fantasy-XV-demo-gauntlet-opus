/**
 * Volumetric cloud GLSL: density field (Nubis-style shape/erode pipeline) and
 * the lighting march. Shared by the screen-space cloud pass, the cloud shadow
 * bake and the analytic fallback used for the environment map.
 */

/** Uniform declarations + the density field. */
export const CLOUD_COMMON = /* glsl */`
uniform sampler3D uCloudBase;
uniform sampler3D uCloudDetail;
uniform sampler2D uCloudWeather;
uniform float uCloudBottom;
uniform float uCloudTop;
uniform float uCloudCoverage;
uniform float uCloudDensity;
uniform float uCloudDetailAmt;
uniform float uCloudType;
uniform float uCloudBaseTile;
uniform float uCloudVertTile;
uniform float uCloudDetailTile;
uniform float uWeatherTile;
uniform vec2  uCloudWind;
uniform float uAnvil;

float cRemap(float v, float a, float b, float c, float d) {
  return c + (v - a) / max(1e-5, b - a) * (d - c);
}

/**
 * Vertical density profile. type 0 = flat stratus slab, 1 = tall cumulus with
 * a rounded top and a narrow base.
 */
float cHeightGradient(float hf, float type) {
  float stratus = clamp(cRemap(hf, 0.0, 0.07, 0.0, 1.0), 0.0, 1.0) *
                  clamp(cRemap(hf, 0.20, 0.42, 1.0, 0.0), 0.0, 1.0);
  float cumulus = clamp(cRemap(hf, 0.02, 0.22, 0.0, 1.0), 0.0, 1.0) *
                  clamp(cRemap(hf, 0.60, 1.0, 1.0, 0.0), 0.0, 1.0);
  return mix(stratus, cumulus, clamp(type, 0.0, 1.0));
}

/**
 * Cloud density at world point p (metres, y = altitude).
 * detail > 0 adds the high frequency erosion; skip it for cheap empty-space
 * probing and for the shadow bake.
 */
float cloudDensity(vec3 p, float detail) {
  float hf = (p.y - uCloudBottom) / max(1.0, uCloudTop - uCloudBottom);
  if (hf < 0.0 || hf > 1.0) return 0.0;

  vec2 wp = (p.xz + uCloudWind) / uWeatherTile;
  vec3 w = texture2D(uCloudWeather, wp).rgb;

  float type = clamp(uCloudType + (w.g - 0.5) * 0.6, 0.0, 1.0);
  float grad = cHeightGradient(hf, type);
  // anvil-ish spread near the top of tall banks
  grad *= mix(1.0, clamp(cRemap(hf, 0.55, 1.0, 1.0, 0.35), 0.0, 1.0), uAnvil);
  if (grad <= 0.002) return 0.0;

  vec3 bp;
  bp.xz = (p.xz + uCloudWind) / uCloudBaseTile;
  bp.y = p.y / uCloudVertTile;
  vec4 base = texture(uCloudBase, bp);
  float wf = dot(base.gba, vec3(0.625, 0.25, 0.125));
  float shape = clamp(cRemap(base.r, wf - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0) * grad;

  float cov = clamp(uCloudCoverage * (0.30 + w.r * 1.35), 0.0, 1.0);
  // conservative early out (the octave below can only scale shape by <= 1.25)
  if (shape * 1.25 < 1.0 - cov) return 0.0;
  // a second, rotated octave breaks up the visible cell grid of the volume
  float o2 = texture(uCloudBase, bp * 2.63 + vec3(0.37, 0.11, 0.53)).r;
  shape *= (0.70 + 0.55 * o2);
  float d = clamp(cRemap(shape, 1.0 - cov, 1.0, 0.0, 1.0), 0.0, 1.0) * cov;
  if (d <= 0.0) return 0.0;

  if (detail > 0.0) {
    vec3 dp = (p + vec3(uCloudWind.x * 1.7, uCloudWind.y * 0.2, uCloudWind.y * 1.7)) / uCloudDetailTile;
    vec3 hi = texture(uCloudDetail, dp).rgb;
    float hif = dot(hi, vec3(0.625, 0.25, 0.125));
    // wispy at the base, billowy at the top
    float m = mix(1.0 - hif, hif, clamp(hf * 3.0, 0.0, 1.0));
    d = clamp(cRemap(d, m * uCloudDetailAmt * detail, 1.0, 0.0, 1.0), 0.0, 1.0);
  }

  return d * uCloudDensity;
}

/** Optical depth of the cloud layer from p toward dir (used for lighting). */
float cloudLightOpticalDepth(vec3 p, vec3 dir, float scale) {
  float tau = 0.0;
  float t = 0.0;
  float step = 55.0 * scale;
  for (int i = 0; i < 5; i++) {
    t += step;
    vec3 sp = p + dir * t;
    tau += cloudDensity(sp, i < 2 ? 0.6 : 0.0) * step;
    step *= 2.1;
  }
  return tau;
}
`;

/**
 * Analytic 2-D stand-in for the volume, used when baking the environment map
 * (where a full march per cube texel would be wasteful and the result is
 * blurred to irradiance anyway).
 */
export const CLOUD_ANALYTIC = /* glsl */`
uniform float uEnvCloudGain;
vec4 cloudAnalytic(vec3 ro, vec3 rd, vec3 sunDir, vec3 sunColor, vec3 skyColor) {
  if (rd.y < 0.015) return vec4(0.0, 0.0, 0.0, 1.0);
  float mid = mix(uCloudBottom, uCloudTop, 0.42);
  float t = (mid - ro.y) / rd.y;
  if (t < 0.0 || t > 300000.0) return vec4(0.0, 0.0, 0.0, 1.0);
  vec3 p = vec3(ro.x + rd.x * t, mid, ro.z + rd.z * t);
  float d = cloudDensity(p, 0.0);
  if (d <= 1e-5) return vec4(0.0, 0.0, 0.0, 1.0);

  // horizontal optical depth toward the sun: what makes cloud bases dark
  float tau = 0.0;
  for (int i = 0; i < 3; i++) {
    vec3 sp = p + sunDir * (150.0 + float(i) * 320.0);
    tau += cloudDensity(vec3(sp.x, clamp(sp.y, uCloudBottom + 1.0, uCloudTop - 1.0), sp.z), 0.0) * 320.0;
  }

  float thickness = (uCloudTop - uCloudBottom) * 0.5;
  float tr = exp(-d * thickness);
  float ph = min(mix(atmHG(dot(rd, sunDir), 0.72), 0.0796, 0.45), 0.45);
  float energy = (exp(-tau) * 0.55 + 0.25 * exp(-tau * 0.22)) * (0.70 + 1.2 * ph);
  vec3 col = (sunColor * energy * uEnvCloudGain + skyColor * 0.8) * (1.0 - tr);

  // fade the layer out at the horizon so it does not form a hard band
  float horizon = smoothstep(0.015, 0.13, rd.y);
  return vec4(col * horizon, mix(1.0, tr, horizon));
}
`;

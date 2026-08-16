/**
 * Shared GLSL for the physically based atmosphere.
 *
 * The model is a Bruneton/Hillaire style single-scattering integration with a
 * cheap analytic multiple-scattering term:
 *   - Rayleigh (molecular) scattering, 8 km scale height
 *   - Mie (aerosol) scattering + absorption, 1.2 km scale height, g = 0.8
 *   - Ozone absorption, tent function centred at 25 km
 *
 * Two LUTs are rendered on the GPU:
 *   - transmittance   (r, mu)                    -- static, built once
 *   - sky-view        (azimuth-from-sun, zenith) -- rebuilt when the sun moves
 *
 * Everything downstream (sky dome, aerial perspective in every surface shader,
 * cloud lighting, environment map) reads those two textures so the whole frame
 * agrees on what colour the air is.
 */

/** Constants, densities, phase functions and the LUT parametrisations. */
export const ATMO_COMMON = /* glsl */`
#ifndef ATM_PI
#define ATM_PI 3.141592653589793
#endif

const float ATM_PLANET_R = 6360000.0;
const float ATM_TOP_R    = 6460000.0;
const vec3  ATM_BETA_R   = vec3(5.802e-6, 13.558e-6, 33.10e-6);
const float ATM_BETA_MS  = 2.60e-6;
const float ATM_BETA_MA  = 2.90e-6;
const vec3  ATM_BETA_O   = vec3(0.650e-6, 1.881e-6, 0.085e-6);
const float ATM_HR       = 8000.0;
const float ATM_HM       = 1200.0;

/** x = rayleigh density, y = mie density, z = ozone density at altitude h. */
vec3 atmDensities(float h) {
  return vec3(
    exp(-max(h, 0.0) / ATM_HR),
    exp(-max(h, 0.0) / ATM_HM),
    max(0.0, 1.0 - abs(h - 25000.0) / 15000.0)
  );
}

vec3 atmExtinction(float h) {
  vec3 d = atmDensities(h);
  return ATM_BETA_R * d.x + (ATM_BETA_MS + ATM_BETA_MA) * d.y + ATM_BETA_O * d.z;
}

float atmRayleighPhase(float c) { return 3.0 / (16.0 * ATM_PI) * (1.0 + c * c); }

float atmHG(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * ATM_PI * pow(max(1e-4, 1.0 + g2 - 2.0 * g * c), 1.5));
}

/** Cornette-Shanks: better forward lobe than plain HG for aerosols. */
float atmMiePhase(float c) {
  const float g = 0.76;
  float g2 = g * g;
  return 3.0 / (8.0 * ATM_PI) * ((1.0 - g2) * (1.0 + c * c)) /
         ((2.0 + g2) * pow(max(1e-4, 1.0 + g2 - 2.0 * g * c), 1.5));
}

/** Nearest positive hit of a ray with a sphere centred at the origin, or -1. */
float atmRaySphere(vec3 ro, vec3 rd, float R) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - R * R;
  float d = b * b - c;
  if (d < 0.0) return -1.0;
  d = sqrt(d);
  float t0 = -b - d, t1 = -b + d;
  if (t1 < 0.0) return -1.0;
  return t0 < 0.0 ? t1 : t0;
}

/** Bruneton (r, mu) -> transmittance LUT uv. */
vec2 atmTransmittanceUV(float r, float mu) {
  float H   = sqrt(max(0.0, ATM_TOP_R * ATM_TOP_R - ATM_PLANET_R * ATM_PLANET_R));
  float rho = sqrt(max(0.0, r * r - ATM_PLANET_R * ATM_PLANET_R));
  float disc = r * r * (mu * mu - 1.0) + ATM_TOP_R * ATM_TOP_R;
  float d    = max(0.0, -r * mu + sqrt(max(0.0, disc)));
  float dMin = ATM_TOP_R - r;
  float dMax = rho + H;
  return vec2((d - dMin) / max(1e-3, dMax - dMin), rho / H);
}

/** Inverse of the above, used when baking the LUT. */
void atmTransmittanceRMu(vec2 uv, out float r, out float mu) {
  float H   = sqrt(max(0.0, ATM_TOP_R * ATM_TOP_R - ATM_PLANET_R * ATM_PLANET_R));
  float rho = uv.y * H;
  r = sqrt(rho * rho + ATM_PLANET_R * ATM_PLANET_R);
  float dMin = ATM_TOP_R - r;
  float dMax = rho + H;
  float d = dMin + uv.x * (dMax - dMin);
  mu = d == 0.0 ? 1.0 : (H * H - rho * rho - d * d) / (2.0 * r * d);
  mu = clamp(mu, -1.0, 1.0);
}

vec3 atmTransmittance(sampler2D lut, float r, float mu) {
  // rays that dive into the planet are fully occluded; without this the LUT
  // parametrisation clamps them to the grazing (deep red) entry and the night
  // sky glows orange
  float horizonMu = -sqrt(max(0.0, 1.0 - (ATM_PLANET_R * ATM_PLANET_R) / (r * r)));
  if (mu < horizonMu) return vec3(0.0);
  vec2 uv = atmTransmittanceUV(r, mu);
  return texture2D(lut, clamp(uv, vec2(0.002), vec2(0.998))).rgb;
}

/**
 * Sky-view LUT parametrisation (Hillaire 2020). v = 0 zenith, 0.5 horizon,
 * 1 nadir with a sqrt squeeze so the horizon gets most of the texels.
 * u = angle away from the sun azimuth / PI (the sky is mirror symmetric).
 */
vec2 atmSkyViewUV(float r, vec3 dir, vec3 sunDir) {
  float beta = asin(clamp(ATM_PLANET_R / r, -1.0, 1.0));
  float zenithHorizon = ATM_PI - beta;
  float vza = acos(clamp(dir.y, -1.0, 1.0));

  float v;
  if (vza < zenithHorizon) {
    float t = vza / zenithHorizon;
    v = 0.5 * (1.0 - sqrt(max(0.0, 1.0 - t)));
  } else {
    float t = (vza - zenithHorizon) / max(1e-4, beta);
    v = 0.5 + 0.5 * sqrt(clamp(t, 0.0, 1.0));
  }

  vec2 fwd = normalize(vec2(sunDir.x, sunDir.z) + vec2(1e-5));
  vec2 vd  = vec2(dir.x, dir.z);
  float len = length(vd);
  float cosA = len < 1e-5 ? 1.0 : clamp(dot(vd / len, fwd), -1.0, 1.0);
  float u = acos(cosA) / ATM_PI;
  return vec2(u, v);
}

/** Inverse: uv -> view direction (sun placed on the +x azimuth). */
vec3 atmSkyViewDir(vec2 uv, float r) {
  float beta = asin(clamp(ATM_PLANET_R / r, -1.0, 1.0));
  float zenithHorizon = ATM_PI - beta;
  float vza;
  if (uv.y < 0.5) {
    float c = 1.0 - 2.0 * uv.y;
    vza = zenithHorizon * (1.0 - c * c);
  } else {
    float c = 2.0 * uv.y - 1.0;
    vza = zenithHorizon + beta * c * c;
  }
  float az = uv.x * ATM_PI;
  float s = sin(vza);
  return vec3(s * cos(az), cos(vza), s * sin(az));
}

/** Sample the sky-view LUT for an arbitrary world direction. */
vec3 atmSkyRadiance(sampler2D skyLut, float r, vec3 dir, vec3 sunDir) {
  vec2 uv = atmSkyViewUV(r, dir, sunDir);
  return texture2D(skyLut, clamp(uv, vec2(0.0, 0.001), vec2(1.0, 0.999))).rgb;
}

/** Interleaved-gradient dither, used to break up 8-bit gradient banding. */
float atmDither(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
`;

/** Ray-marched single scattering, shared by the LUT bake and the env bake. */
export const ATMO_SCATTER = /* glsl */`
/**
 * Integrate scattering along rd from a point at radius r (up = +y).
 * Returns luminance in arbitrary units scaled by uSunIntensity outside.
 */
vec3 atmIntegrate(vec3 ro, vec3 rd, vec3 sunDir, sampler2D tLut, int steps,
                  float msBoost, out vec3 outTransmittance) {
  float tTop = atmRaySphere(ro, rd, ATM_TOP_R);
  float tGround = atmRaySphere(ro, rd, ATM_PLANET_R);
  float tMax = tTop;
  bool hitGround = tGround > 0.0;
  if (hitGround) tMax = tGround;
  outTransmittance = vec3(1.0);
  if (tMax <= 0.0) return vec3(0.0);
  tMax = min(tMax, 3.0e6);

  float cosTheta = dot(rd, sunDir);
  float pr = atmRayleighPhase(cosTheta);
  float pm = atmMiePhase(cosTheta);

  vec3 L = vec3(0.0);
  vec3 tr = vec3(1.0);
  float t = 0.0;
  float fSteps = float(steps);

  for (int i = 0; i < 64; i++) {
    if (i >= steps) break;
    // quadratic step distribution: dense near the camera, coarse far away
    float t0 = tMax * pow(float(i) / fSteps, 2.0);
    float t1 = tMax * pow(float(i + 1) / fSteps, 2.0);
    float dt = t1 - t0;
    t = 0.5 * (t0 + t1);

    vec3 p = ro + rd * t;
    float r = length(p);
    float h = r - ATM_PLANET_R;
    vec3 dens = atmDensities(h);

    vec3 ext = ATM_BETA_R * dens.x + (ATM_BETA_MS + ATM_BETA_MA) * dens.y + ATM_BETA_O * dens.z;
    vec3 sampleTr = exp(-ext * dt);

    vec3 up = p / r;
    float muSun = dot(up, sunDir);
    // shadow of the planet on the ray
    vec3 sunT = atmTransmittance(tLut, r, muSun);
    float ground = atmRaySphere(p, sunDir, ATM_PLANET_R) > 0.0 ? 0.0 : 1.0;

    vec3 scatterR = ATM_BETA_R * dens.x;
    vec3 scatterM = vec3(ATM_BETA_MS) * dens.y;

    vec3 phased = scatterR * pr + scatterM * pm;
    // cheap multiple scattering: isotropic (1/4pi), scaled by the boost
    vec3 iso = (scatterR + scatterM) * (msBoost * 0.0796) * (0.35 + 0.65 * max(muSun, 0.0));

    // multiple scattering keeps far more blue than the direct path: real MS
    // light has been redirected many times, so use a softened transmittance
    vec3 msT = pow(max(sunT, vec3(1e-4)), vec3(0.62));
    vec3 inScatter = (phased * sunT + iso * msT) * ground;

    // energy conserving integration of the segment (Hillaire)
    vec3 safeExt = max(ext, vec3(1e-9));
    vec3 integ = (inScatter - inScatter * sampleTr) / safeExt;
    L += tr * integ;
    tr *= sampleTr;
    if (max(tr.r, max(tr.g, tr.b)) < 0.0015) break;
  }

  outTransmittance = hitGround ? vec3(0.0) : tr;
  return L;
}
`;

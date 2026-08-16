/**
 * Shared GLSL chunks for the post chain. Everything here is written in the
 * GLSL-1 dialect three.js accepts (it rewrites `texture2D` / `varying` /
 * `gl_FragColor` for WebGL2 automatically).
 */

/** Fullscreen-triangle vertex shader used by every filter pass. */
export const FS_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Luminance, colour-space and packing helpers. */
export const CHUNK_COLOR = /* glsl */`
  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  float maxc(vec3 c) { return max(c.r, max(c.g, c.b)); }

  vec3 rgb2ycocg(vec3 c) {
    return vec3(
      0.25 * c.r + 0.5 * c.g + 0.25 * c.b,
      0.5 * c.r - 0.5 * c.b,
      -0.25 * c.r + 0.5 * c.g - 0.25 * c.b
    );
  }
  vec3 ycocg2rgb(vec3 c) {
    float t = c.x - c.z;
    return vec3(t + c.y, c.x + c.z, t - c.y);
  }

  vec3 linearToSrgb(vec3 c) {
    c = max(c, vec3(0.0));
    return mix(c * 12.92, 1.055 * pow(max(c, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  vec3 srgbToLinear(vec3 c) {
    c = max(c, vec3(0.0));
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
`;

/** Depth helpers. `uNear`/`uFar` must exist in the including shader. */
export const CHUNK_DEPTH = /* glsl */`
  // hardware depth (0..1) -> positive distance along the view axis
  float viewDepth(float d, float n, float f) {
    float z = d * 2.0 - 1.0;
    return (2.0 * n * f) / (f + n - z * (f - n));
  }

  vec3 worldFromDepth(vec2 uv, float d, mat4 invViewProj) {
    vec4 p = invViewProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }
`;

/** Cheap deterministic hashes / interleaved gradient noise. */
export const CHUNK_HASH = /* glsl */`
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }
  // Jimenez interleaved gradient noise - the good dither for sample offsets
  float ign(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }
`;

/**
 * Filmic tone mapping. ACES fitted (Stephen Hill) with a small toe lift so the
 * blacks do not crush the way the stock three ACES approximation does.
 */
export const CHUNK_TONEMAP = /* glsl */`
  const mat3 ACES_IN = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777
  );
  const mat3 ACES_OUT = mat3(
     1.60475, -0.10208, -0.00327,
    -0.53108,  1.10813, -0.07276,
    -0.07367, -0.00605,  1.07602
  );
  vec3 rrtOdt(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  vec3 tonemapACES(vec3 c) {
    c = ACES_IN * c;
    c = rrtOdt(c);
    c = ACES_OUT * c;
    return clamp(c, 0.0, 1.0);
  }
`;

/** 32^3 colour cube stored as a 1024x32 strip. */
export const CHUNK_LUT = /* glsl */`
  vec3 sampleLut(sampler2D lut, vec3 c) {
    c = clamp(c, 0.0, 1.0);
    float b = c.b * 31.0;
    float b0 = min(floor(b), 30.0);
    float f = b - b0;
    float u = (c.r * 31.0 + 0.5) / 1024.0;
    float v = (c.g * 31.0 + 0.5) / 32.0;
    vec3 c0 = texture2D(lut, vec2(u + b0 * (32.0 / 1024.0), v)).rgb;
    vec3 c1 = texture2D(lut, vec2(u + (b0 + 1.0) * (32.0 / 1024.0), v)).rgb;
    return mix(c0, c1, f);
  }
`;

/** Catmull-Rom style 5-tap bicubic history sample (Filmic SMAA / Karis). */
export const CHUNK_BICUBIC = /* glsl */`
  vec4 sampleCatmullRom(sampler2D tex, vec2 uv, vec2 texSize) {
    vec2 samplePos = uv * texSize;
    vec2 texPos1 = floor(samplePos - 0.5) + 0.5;
    vec2 f = samplePos - texPos1;

    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
    vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
    vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
    vec2 w3 = f * f * (-0.5 + 0.5 * f);

    vec2 w12 = w1 + w2;
    vec2 offset12 = w2 / max(w12, vec2(1e-5));

    vec2 texPos0 = (texPos1 - 1.0) / texSize;
    vec2 texPos3 = (texPos1 + 2.0) / texSize;
    vec2 texPos12 = (texPos1 + offset12) / texSize;

    vec4 result = vec4(0.0);
    result += texture2D(tex, vec2(texPos12.x, texPos0.y)) * w12.x * w0.y;
    result += texture2D(tex, vec2(texPos0.x, texPos12.y)) * w0.x * w12.y;
    result += texture2D(tex, vec2(texPos12.x, texPos12.y)) * w12.x * w12.y;
    result += texture2D(tex, vec2(texPos3.x, texPos12.y)) * w3.x * w12.y;
    result += texture2D(tex, vec2(texPos12.x, texPos3.y)) * w12.x * w3.y;
    float wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
    return result / max(wsum, 1e-5);
  }
`;

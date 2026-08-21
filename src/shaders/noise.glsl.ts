/**
 * Small GLSL noise kit shared by the sky, cirrus and cloud shaders.
 * Hash based (no texture dependency) so everything stays deterministic.
 */
export const NOISE_GLSL = /* glsl */`
float nHash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec2 nHash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec4 nHash42(vec2 p) {
  vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}

float nHash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

/** Value noise, 2D. */
float nValue2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = nHash13(vec3(i, 0.0));
  float b = nHash13(vec3(i + vec2(1.0, 0.0), 0.0));
  float c = nHash13(vec3(i + vec2(0.0, 1.0), 0.0));
  float d = nHash13(vec3(i + vec2(1.0, 1.0), 0.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/** Value noise, 3D. */
float nValue3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = nHash13(i);
  float n100 = nHash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = nHash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = nHash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = nHash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = nHash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = nHash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = nHash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

float nFbm2(vec2 p, int octaves) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    s += a * nValue2(p);
    n += a;
    a *= 0.5;
    p = p * 2.03 + vec2(17.3, 5.1);
  }
  return s / max(n, 1e-4);
}

float nFbm3(vec3 p, int octaves) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    s += a * nValue3(p);
    n += a;
    a *= 0.5;
    p = p * 2.03 + vec3(11.7, 5.1, 23.9);
  }
  return s / max(n, 1e-4);
}

/**
 * Direction -> (face index, face uv in [0,1]) cube mapping. Used to lay a
 * near-uniform 2D cell grid over the celestial sphere for the starfield.
 */
void nCubeFace(vec3 d, out float face, out vec2 uv) {
  vec3 a = abs(d);
  if (a.x >= a.y && a.x >= a.z) {
    face = d.x > 0.0 ? 0.0 : 1.0;
    uv = vec2(d.z, d.y) / a.x;
  } else if (a.y >= a.z) {
    face = d.y > 0.0 ? 2.0 : 3.0;
    uv = vec2(d.x, d.z) / a.y;
  } else {
    face = d.z > 0.0 ? 4.0 : 5.0;
    uv = vec2(d.x, d.y) / a.z;
  }
  uv = uv * 0.5 + 0.5;
}
`;

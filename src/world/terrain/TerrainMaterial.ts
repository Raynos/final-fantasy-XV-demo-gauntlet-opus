import * as THREE from 'three';
import { LAYER_AVG, LAYER_ROUGH, LAYER_SCALE } from './Layers.ts';

/**
 * Terrain surface shader. Built on MeshStandardMaterial via onBeforeCompile so
 * it inherits the project's lighting, shadows, fog and tone mapping, then
 * replaces the surface evaluation with:
 *
 *   - vertex displacement from the shared heightfield textures (clipmap LOD
 *     with a morph band so level seams are crack-free),
 *   - six-layer height-blended splatting driven by slope / altitude / flow /
 *     sediment / curvature / macro noise,
 *   - triplanar projection with procedural sedimentary banding on cliffs,
 *   - close-range parallax + detail normals, distance-faded.
 */

const NOISE_GLSL = /* glsl */`
vec3 tf_perm(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float tf_snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = tf_perm(tf_perm(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

const FIELD_GLSL = /* glsl */`
uniform sampler2D uHeightTex;
uniform sampler2D uFarHeightTex;
uniform vec4 uField;    // half, cell, N, blendOut
uniform vec4 uFarP;     // half, cell, N, -

// --- micro-relief -----------------------------------------------------------
// The macro grid is 4 m; this puts the 6-25 m surface band back analytically.
// It is the exact twin of microDetail() in Field.js -- a character standing on
// this ground is placed by the JS version, so the two must not drift.
vec3 tf_mperm(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float tf_msnoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = tf_mperm(tf_mperm(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float tf_micro(vec2 p) {
  return (0.62 * tf_msnoise(p * 0.0930)
        + 0.30 * tf_msnoise(p * 0.2650 + vec2(5.0, -3.0))) * 0.95;
}
float tf_grid(sampler2D tex, vec2 p, vec4 P) {
  vec2 f = (p + P.x) / P.y;
  vec2 i0 = floor(f);
  vec2 t = f - i0;
  i0 = clamp(i0, vec2(0.0), vec2(P.z - 2.0));
  ivec2 c = ivec2(i0);
  float a = texelFetch(tex, c, 0).r;
  float b = texelFetch(tex, c + ivec2(1, 0), 0).r;
  float d = texelFetch(tex, c + ivec2(0, 1), 0).r;
  float e = texelFetch(tex, c + ivec2(1, 1), 0).r;
  return mix(mix(a, b, t.x), mix(d, e, t.x), t.y);
}
float tf_height(vec2 p) {
  // Roads pre-compensate for the micro term when they are carved, so a highway
  // stays a highway even though the relief is added everywhere.
  if (max(abs(p.x), abs(p.y)) >= uField.w) return tf_grid(uFarHeightTex, p, uFarP) + tf_micro(p);
  return tf_grid(uHeightTex, p, uField) + tf_micro(p);
}
vec2 tf_uv(vec2 p, vec4 P) { return ((p + P.x) / P.y + 0.5) / P.z; }

/**
 * The height a clipmap level whose cells are "cell" metres across is allowed
 * to carry.
 *
 * A vertex lattice cannot represent anything finer than its own spacing, so
 * point-sampling the 4 m field at a 24 m or 48 m vertex pitch does not make a
 * coarse mountain — it *decimates* one, and the mesh picks up several metres of
 * pseudo-random per-vertex jitter. The shading normal is already low-passed
 * with distance (tf_surfNormal); this is the other half of the same idea for
 * the geometry, and it is what a geometry clipmap is supposed to do: filter the
 * height pyramid, never decimate it.
 *
 * It matters far more than a silhouette tidy-up. GTAO is fed the scene depth
 * buffer and reconstructs its normals from it, so it sees the raw triangles —
 * and a grazing wall of 8-pixel facets with a few metres of random tilt each
 * came back as the regular chevron hatch that wallpapered every conical peak in
 * the world.
 */
float tf_gridH(vec2 p) {
  if (max(abs(p.x), abs(p.y)) >= uField.w) return tf_grid(uFarHeightTex, p, uFarP);
  return tf_grid(uHeightTex, p, uField);
}
float tf_heightLod(vec2 p, float cell) {
  float w = (cell - 4.0) * 1.1;
  if (w <= 0.25) return tf_height(p);
  // The four extra taps read the *grid* only. tf_micro is a 4-11 m band and a
  // lattice this coarse cannot carry it at all, so it is faded out with the
  // cell rather than sampled five times — which both removes a decimetre of
  // pure aliasing and makes the filter about half the cost it would otherwise
  // be, the two simplex octaves being the expensive half of tf_height.
  return tf_gridH(p) * 0.36
    + (tf_gridH(p + vec2(w, 0.0)) + tf_gridH(p - vec2(w, 0.0))
     + tf_gridH(p + vec2(0.0, w)) + tf_gridH(p - vec2(0.0, w))) * 0.16
    + tf_micro(p) * (1.0 - smoothstep(4.0, 14.0, cell));
}
`;

/**
 * The heightfield sampler, exported so other systems that need to know where
 * the ground is on the GPU (rain splashes, the weather volume) read exactly the
 * same surface the terrain displaces to instead of an approximation.
 */
export const TERRAIN_FIELD_GLSL = FIELD_GLSL;

const VERT_PARS = /* glsl */`
${FIELD_GLSL}
uniform sampler2D uNormalTex;
uniform sampler2D uFarNormalTex;
uniform float uCell;
attribute vec2 aClip;   // x = LOD morph alpha, y = terrain flag
varying vec3 vTW;
varying float vTDist;
vec3 tf_normal(vec2 p) {
  vec2 nn = (max(abs(p.x), abs(p.y)) >= uField.w)
    ? textureLod(uFarNormalTex, tf_uv(p, uFarP), 0.0).rg
    : textureLod(uNormalTex, tf_uv(p, uField), 0.0).rg;
  return normalize(vec3(nn.x, sqrt(max(0.02, 1.0 - dot(nn, nn))), nn.y));
}
`;

const VERT_BEGIN = /* glsl */`
vec2 tfWP = (modelMatrix * vec4(position, 1.0)).xz;
float tfH = tf_heightLod(tfWP, uCell);
if (aClip.x > 0.0) {
  float c2 = uCell * 2.0;
  vec2 g = tfWP / c2;
  vec2 g0 = floor(g);
  vec2 gt = g - g0;
  // the morph target is the *next* level's surface, so it has to be filtered
  // with that level's cell or the two rings no longer meet and the seam cracks
  float h00 = tf_heightLod(g0 * c2, c2);
  float h10 = tf_heightLod((g0 + vec2(1.0, 0.0)) * c2, c2);
  float h01 = tf_heightLod((g0 + vec2(0.0, 1.0)) * c2, c2);
  float h11 = tf_heightLod((g0 + vec2(1.0, 1.0)) * c2, c2);
  tfH = mix(tfH, mix(mix(h00, h10, gt.x), mix(h01, h11, gt.x), gt.y), aClip.x);
}
vec3 transformed = vec3(position.x, tfH, position.z);
vTW = vec3(tfWP.x, tfH, tfWP.y);
vTDist = length(cameraPosition - vTW);
`;

/**
 * The vertex-side displacement chunks, exported so a regression tool can build
 * a probe material that displaces *bit-identically* to the rendered terrain —
 * including the clipmap LOD morph, which a fragment-only probe of `tf_height`
 * cannot see. `src/tools/driftcheck.mjs` is the consumer.
 */
export const TERRAIN_VERT_PARS = VERT_PARS;
export const TERRAIN_VERT_BEGIN = VERT_BEGIN;

const FRAG_PARS = /* glsl */`
${NOISE_GLSL}
uniform sampler2D uNormalTex;
uniform sampler2D uFarNormalTex;
uniform sampler2D uCtrlTex;
uniform sampler2D uFarCtrlTex;
uniform highp sampler2DArray uDetailArr;   // 0 = grit, 1 = 2-4 m surface, 2-3 = biome LUT
uniform float uNearScale;
uniform vec4 uEnv;      // seaLevel, 1 / worldSize, -, -
uniform vec4 uWet;      // wetness, puddleGain, -, -
uniform highp sampler2DArray uAlbedoArr;
uniform highp sampler2DArray uSurfArr;
uniform vec4 uField;
uniform vec4 uFarP;
uniform vec3 uLayerAvg[6];
uniform float uLayerRough[6];
uniform float uLayerScale[6];
uniform float uLayerRot[6];
uniform float uDetailScale;
uniform float uMicro;
varying vec3 vTW;
varying float vTDist;

vec3 tfAlbedo; float tfRough; vec3 tfNormalW; float tfAO;

vec2 tf_uv(vec2 p, vec4 P) { return ((p + P.x) / P.y + 0.5) / P.z; }

/**
 * Surface normal, low-pass filtered with distance.
 *
 * A range 3 km out projects a 12 m normal grid onto a couple of pixels. Point
 * sampling that is what makes far ridges break into a crawling zigzag hatch —
 * the horizon "wallpaper" artefact. Widening the kernel with distance both
 * kills the aliasing and is physically right: at that range you are seeing the
 * massif, not its boulders.
 */
vec3 tf_surfNormal(vec2 p) {
  bool far = max(abs(p.x), abs(p.y)) >= uField.w;
  vec4 P = far ? uFarP : uField;
  vec2 uv = tf_uv(p, P);
  vec2 texel = vec2(1.0 / P.z);
  float k = clamp(vTDist / 900.0, 0.0, 3.2);
  vec2 nn;
  if (k < 0.06) {
    nn = far ? texture2D(uFarNormalTex, uv).rg : texture2D(uNormalTex, uv).rg;
  } else {
    vec2 o = texel * (0.75 + k * 1.9);
    vec2 a, b, c, d, e;
    if (far) {
      a = texture2D(uFarNormalTex, uv).rg;
      b = texture2D(uFarNormalTex, uv + vec2(o.x, 0.0)).rg;
      c = texture2D(uFarNormalTex, uv - vec2(o.x, 0.0)).rg;
      d = texture2D(uFarNormalTex, uv + vec2(0.0, o.y)).rg;
      e = texture2D(uFarNormalTex, uv - vec2(0.0, o.y)).rg;
    } else {
      a = texture2D(uNormalTex, uv).rg;
      b = texture2D(uNormalTex, uv + vec2(o.x, 0.0)).rg;
      c = texture2D(uNormalTex, uv - vec2(o.x, 0.0)).rg;
      d = texture2D(uNormalTex, uv + vec2(0.0, o.y)).rg;
      e = texture2D(uNormalTex, uv - vec2(0.0, o.y)).rg;
    }
    nn = (a * 0.36 + (b + c + d + e) * 0.16);
  }
  return normalize(vec3(nn.x, sqrt(max(0.02, 1.0 - dot(nn, nn))), nn.y));
}
vec4 tf_ctrl(vec2 p) {
  return (max(abs(p.x), abs(p.y)) >= uField.w)
    ? texture2D(uFarCtrlTex, tf_uv(p, uFarP))
    : texture2D(uCtrlTex, tf_uv(p, uField));
}
vec2 tf_rot(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

// ---- stochastic tile sampling ----------------------------------------------
// A repeating texture is a lattice, and domain-warping a lattice does not
// remove it: the same polygon pattern still reappears on the same pitch, only
// bent. The previous defence was to draw every layer twice, at uLayerScale
// and at a third of it, cross-faded with distance — and *that* is what the
// r4 critique read as "cracks two metres wide": the coarse tap of the dirt
// layer was a 27 m tile whose worley cells are 4.5 m across, weighted to 0.82
// over most of a plain.
//
// This is the Heitz & Neyret triangle-grid sampler instead. Each layer is
// drawn three times, at three independently hashed offsets *and* rotations
// picked per vertex of a simplex lattice, and the three are blended by the
// barycentric weights. There is no lattice left to find, at any scale.
//
// Two details that matter:
//   * the blend is height-aware — each tap is weighted by exp2(height), so two
//     plates meet along a crack instead of ghosting through each other, which
//     is what a plain barycentric average looks like;
//   * the rotation is applied about *that tap's own cell centre*, so the
//     coordinate stays near the origin instead of running to 1500 tile units,
//     where fp32 no longer resolves a texel.
const mat2 TF_SKEW = mat2(1.0, 0.0, -0.57735027, 1.15470054);
const mat2 TF_UNSKEW = mat2(1.0, 0.0, 0.5, 0.86602540);
/** Lattice cells per tile. 0.65 puts a cell at ~1.5 tiles. */
const float TF_LAT = 0.65;
/** Extra chlorophyll pushed into the grass layer where the region is green. */
const vec3 TF_CHLORO = vec3(0.80, 1.12, 0.60);

vec2 tf_hash2(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

/**
 * One stochastic tap: rotate + offset by this cell's hash, sample both arrays
 * with explicit gradients (the offsets are discontinuous, so an implicit mip
 * would break at every cell edge), and un-rotate the tangent normal so the
 * per-cell rotation cannot shear the lighting.
 */
void tf_tap(vec2 uv, vec2 cell, float layer, vec2 ddx, vec2 ddy,
            out vec4 alb, out vec4 srf) {
  vec2 o = tf_hash2(cell);
  float a = (o.x + o.y * 3.0) * 6.2831853;
  vec2 c = (TF_UNSKEW * cell) / TF_LAT;
  vec2 u = tf_rot(uv - c, a) + o;
  vec2 dx = tf_rot(ddx, a), dy = tf_rot(ddy, a);
  alb = textureGrad(uAlbedoArr, vec3(u, layer), dx, dy);
  vec4 q = textureGrad(uSurfArr, vec3(u, layer), dx, dy);
  srf = vec4(tf_rot(q.rg * 2.0 - 1.0, -a) * 0.5 + 0.5, q.ba);
}

void tf_stoch(vec2 uv, float layer, vec2 ddx, vec2 ddy,
              out vec4 albOut, out vec4 srfOut) {
  vec2 sk = TF_SKEW * (uv * TF_LAT);
  vec2 base = floor(sk);
  vec2 f = sk - base;
  vec3 bw;
  vec2 g1, g2, g3;
  if (f.x + f.y < 1.0) {
    bw = vec3(1.0 - f.x - f.y, f.y, f.x);
    g1 = base; g2 = base + vec2(0.0, 1.0); g3 = base + vec2(1.0, 0.0);
  } else {
    bw = vec3(f.x + f.y - 1.0, 1.0 - f.y, 1.0 - f.x);
    g1 = base + vec2(1.0, 1.0); g2 = base + vec2(1.0, 0.0); g3 = base + vec2(0.0, 1.0);
  }

  vec4 a1, a2, a3, s1, s2, s3;
  tf_tap(uv, g1, layer, ddx, ddy, a1, s1);
  tf_tap(uv, g2, layer, ddx, ddy, a2, s2);
  tf_tap(uv, g3, layer, ddx, ddy, a3, s3);

  // Height-aware weighting, multiplied into the barycentric weight rather than
  // added to it: a tap whose triangle weight has reached zero must contribute
  // nothing however tall it is, or the cell edges themselves become visible.
  vec3 hw = bw * exp2(vec3(a1.a, a2.a, a3.a) * 5.0);
  hw /= max(hw.x + hw.y + hw.z, 1e-5);
  albOut = a1 * hw.x + a2 * hw.y + a3 * hw.z;
  srfOut = s1 * hw.x + s2 * hw.y + s3 * hw.z;
  // Blending three taps flattens the layer's own contrast; push it back around
  // the tap mean so a stochastic surface is not visibly softer than a tiled one.
  vec3 mean = (a1.rgb + a2.rgb + a3.rgb) * (1.0 / 3.0);
  albOut.rgb = max(mean + (albOut.rgb - mean) * 1.55, vec3(0.0));
}

void tf_shade() {
  vec3 P = vTW;
  vec3 N = tf_surfNormal(P.xz);
  vec4 ctl = tf_ctrl(P.xz);
  float sedi = ctl.g, road = ctl.b, rocky = ctl.a;
  // ctl.r is flow accumulation off-road, signed lateral position on it
  float onRoad = step(0.02, road);
  float flow = mix(ctl.r, 0.0, onRoad);
  float roadLat = (ctl.r * 2.0 - 1.0) * 16.0;   // metres from the centreline
  float slope = clamp(1.0 - N.y, 0.0, 1.0);
  float alt = P.y;

  // ---- the regional palette ------------------------------------------------
  // Everything below this line used to derive its colour from slope, altitude,
  // flow and noise — all global fields that have never heard of the map — which
  // is why the whole 8 km world drew as one Leide badland. terrain/Biome.js
  // bakes an authored per-zone palette, blended by the map's own Gaussian zone
  // weights, into layers 2 and 3 of the detail array; two fetches read it.
  // Explicit LOD 0 because the array is RepeatWrapping for the tiled detail
  // maps' sake and these two layers span the world exactly once.
  vec2 bioUv = clamp(P.xz * uEnv.y + 0.5, 0.0015, 0.9985);
  vec4 bioG = textureLod(uDetailArr, vec3(bioUv, 2.0), 0.0);
  vec4 bioR = textureLod(uDetailArr, vec3(bioUv, 3.0), 0.0);
  vec3 bioGround = bioG.rgb * 2.0;    // tint on sand / dirt / gravel / grass / road
  vec3 bioRock = bioR.rgb * 2.0;      // tint on the rock layer and the strata
  float bioGreen = bioG.a;            // how vegetated the ground itself is
  float bioDamp = bioR.a;             // standing humidity, independent of weather
  // how far off the Leide iron-oxide axis this region sits
  float bioCool = clamp(bioGreen * 0.90 + bioDamp * 0.40, 0.0, 1.0);

  // macro variation across hundreds of metres so nothing ever reads as tiled
  float m1 = tf_snoise(P.xz * 0.0017);
  float m2 = tf_snoise(P.xz * 0.0072 + 21.0);
  float m3 = tf_snoise(P.xz * 0.027 + 7.0);
  float macro = 0.5 * m1 + 0.32 * m2 + 0.18 * m3;
  // patch fields: these are what turn a uniform blend into ground that reads as
  // sand pans, gravel fields and scrub, the way a real basin does
  float p1 = tf_snoise(P.xz * 0.0125 + 3.3);     // ~80 m
  float p2 = tf_snoise(P.xz * 0.043 - 9.1);      // ~23 m
  float patchN = 0.62 * p1 + 0.38 * p2;
  float dryness = clamp(0.5 + 0.45 * m1 + 0.55 * patchN - 0.40 * bioGreen, 0.0, 1.0);
  float flatAmt = 1.0 - smoothstep(0.06, 0.28, slope);
  // The altitude gate on grass and sand is *regional*. A fixed 48-120 m band
  // switched the grass off above 120 m — and Duscae's basins are authored at
  // base 66-120 m and Cleigne's shelf at 100 m, so the gate was cutting the
  // grass out of precisely the zones that are defined as green.
  float lowAlt = 1.0 - smoothstep(48.0 + 190.0 * bioGreen, 120.0 + 320.0 * bioGreen, alt);

  float w[6];
  // no desert pans in a humid basin
  w[0] = flatAmt * lowAlt * (0.14 + 1.05 * sedi + 1.70 * smoothstep(0.60, 0.95, dryness))
       * (1.0 - 0.80 * bioGreen);
  w[1] = 0.72 + 0.55 * (0.5 + 0.5 * p2) - 1.35 * smoothstep(0.10, 0.44, slope);
  w[2] = smoothstep(0.14, 0.42, slope) * (0.5 + 0.8 * (0.5 + 0.5 * m2))
       + 1.20 * flow + 0.40 * rocky
       + 0.62 * smoothstep(0.34, 0.04, dryness) * flatAmt * (1.0 - 0.70 * bioGreen);
  w[3] = smoothstep(0.20, 0.48, slope) * 1.80 + 1.10 * rocky
       + 0.65 * smoothstep(80.0, 175.0, alt);
  // Talus / scree: the mid-slope band directly under a cliff face, where the
  // material that spalled off it collects. Badlands read as badlands largely
  // because every wall stands on a skirt of its own debris.
  float scree = smoothstep(0.15, 0.31, slope) * (1.0 - smoothstep(0.33, 0.52, slope))
              * smoothstep(0.30, 0.70, rocky)
              * (0.55 + 0.45 * (0.5 + 0.5 * tf_snoise(vTW.xz * 0.021 - 3.0)));
  w[2] += 0.70 * scree;
  w[3] -= 0.26 * scree;
  // Tinting the ground green is not enough on its own — a green basin is green
  // because there is a *mat* on it. Both the gain and the threshold move with
  // the region, so Duscae's flats are grassland with dirt showing through in
  // patches rather than dirt with the odd tuft.
  w[4] = flatAmt * lowAlt * (1.30 + 3.20 * bioGreen)
       * smoothstep(0.12 - 0.26 * bioGreen, 0.66 - 0.44 * bioGreen,
           0.42 * flow + 0.36 * patchN + 0.22 * m1 + 0.17 + 0.14 * sedi);
  // a road can never read as a pale scar up a cliff face, whatever the mask says
  w[5] = road * 5.5 * (1.0 - smoothstep(0.30, 0.55, slope));

  // sharpen before normalising: without this every layer averages into mud
  float wsum = 0.0;
  for (int i = 0; i < 6; i++) { w[i] = pow(max(w[i], 0.0), 1.7); wsum += w[i]; }
  wsum = max(wsum, 1e-4);
  for (int i = 0; i < 6; i++) w[i] /= wsum;

  // ---- per-massif identity and sedimentary strata -------------------------
  // Deliberately evaluated *before* the detail branch: the far LOD path used
  // to get none of this, which is exactly why every range past 1.1 km was a
  // smooth untextured cone. Strata and runnels are the cues that tell the eye
  // how far away a mountain is, so they have to survive to the horizon.

  // Three overlapping ~0.9-1.6 km fields stand in for "which range am I on":
  // smooth, so no seam ever cuts across a mountain, but decorrelated enough
  // that no two massifs share a bed thickness, a dip direction or a texture
  // scale.
  float mr1 = 0.5 + 0.5 * tf_snoise(P.xz * 0.00115 + 41.0);
  float mr2 = 0.5 + 0.5 * tf_snoise(P.xz * 0.00088 - 17.0);
  float mr3 = 0.5 + 0.5 * tf_snoise(P.xz * 0.00061 + 73.0);
  // faster fields for the tiling itself: two neighbouring buttes must not
  // share a bed thickness, or a wide shot still reads as one printed sheet
  float mrA = 0.5 + 0.5 * tf_snoise(P.xz * 0.0027 + 91.0);
  float mrB = 0.5 + 0.5 * tf_snoise(P.xz * 0.0034 - 55.0);

  // Structural slope, read from the *unfiltered* normal grid. tf_surfNormal
  // deliberately low-passes with distance so far ridges cannot alias into a
  // crawling hatch — but that also flattens every distant face toward zero
  // slope, which silently switched the strata and the runnels off on exactly
  // the ranges that need them most to read as far away rather than merely big.
  // It is measured as sin(tilt), not as 1 - N.y: the latter is 0.13 at 30 deg
  // and 0.29 at 45, so a threshold that admitted a real badland face also
  // admitted the pans, and a threshold that excluded the pans excluded every
  // face. sin(tilt) is 0.50 and 0.71 for the same angles — a usable range.
  vec2 rawN = (max(abs(P.x), abs(P.z)) >= uField.w)
    ? textureLod(uFarNormalTex, tf_uv(P.xz, uFarP), 0.0).rg
    : textureLod(uNormalTex, tf_uv(P.xz, uField), 0.0).rg;
  // Past ~1.5 km it hands back to the filtered normal: a 12 m grid sampled
  // point-wise at that range is itself an aliasing source, and the horizon
  // hatch it produces is worse than the detail it buys.
  float structSlope = mix(
    clamp(max(length(rawN), length(N.xz)), 0.0, 1.0),
    clamp(length(N.xz), 0.0, 1.0),
    smoothstep(900.0, 2200.0, vTDist));

  // Everything below — the runnels, the bedding stack, the laminations — is
  // multiplied by smoothstep(0.34, 0.78, structSlope) (cliffAmt),
  // smoothstep(0.34, 0.80, structSlope) (bedThrough) or
  // smoothstep(0.30, 0.72, structSlope) (runnelAmt). Below a sin(tilt) of 0.30,
  // which is a 17 degree slope — the pans, the gravel flats, the road, the
  // whole floor of the basin — all three are identically zero, and the twelve
  // noise octaves that feed them were being evaluated and multiplied by nothing.
  // On a badland face the branch is taken and the result is bit-identical.
  float runnel = 1.0, bedA = 0.0, cliffAmt = 0.0, bedThrough = 0.0, runnelAmt = 0.0;
  vec3 bedCol = vec3(1.0);
  if (structSlope > 0.295) {
  // Vertical erosion runnels. Every badland face is raked by rain channels
  // that cut straight down across the bedding; without them the horizontal
  // strata have nothing to interrupt them and the whole range reads as a
  // printed stripe. These run with the *slope*, not with world Y, so they fan
  // out over ridges instead of marching in lockstep.
  float rn1 = tf_snoise(vec2((P.x * 0.83 - P.z * 0.56) * 0.052, P.y * 0.0045 + 2.0));
  float rn2 = tf_snoise(vec2((P.x * 0.41 + P.z * 0.91) * 0.155, P.y * 0.011 - 5.0));
  float rn3 = tf_snoise(vec2((P.x * 0.67 - P.z * 0.74) * 0.017, P.y * 0.0018 + 8.0));
  runnel = smoothstep(0.16, 0.82, 0.5 + 0.34 * rn1 + 0.22 * rn2 + 0.30 * rn3);

  // Procedural sedimentary banding — the Leide signature. Bed thickness and
  // colour are randomised per bed index so the stack never reads as a regular
  // stripe pattern.
  // The bedding coordinate is *not* world Y. It is a warped, per-massif tilted
  // surface bent by the local rock form: beds dip, thicken and bend with the
  // landform, which is what a real sedimentary stack does and what a straight
  // world-Y band never will.
  vec2 dip = vec2(mr2 - 0.5, mr3 - 0.5) * 0.92;
  // Bed thickness. A real Leide butte bands at metres, not tens of metres:
  // 0.070..0.285 cycles/m is a 3.5-14 m repeat, and with the per-bed thickness
  // jitter below, the visible beds land at roughly 1-9 m. That is 4-5x tighter
  // than the 16-70 m stack this used to draw, and fine banding is one of the
  // strongest distance cues there is — it is what separates a range that reads
  // as *far* from one that merely reads as *big*.
  // Beds also coarsen downward, the way a real stack does toward its base.
  // The pitch has to change *within* a range as well as between ranges — a
  // single massif drawn at one pitch is still wallpaper, just finer wallpaper.
  float freq = (0.058 + 0.170 * mr1 + 0.085 * mrA)
             * mix(0.74, 1.28, smoothstep(20.0, 300.0, P.y));
  float warp = 3.4 * tf_snoise(P.xz * 0.0041) + 1.2 * tf_snoise(P.xz * 0.018)
             + 0.5 * tf_snoise(P.xz * 0.075)
             + 2.6 * tf_snoise(vec2(P.y * 0.019 + 5.0, (P.x - P.z) * 0.0033))
             + 1.1 * tf_snoise(vec2(P.y * 0.062 - 3.0, (P.x + P.z) * 0.0125));
  // beds wrap round a nose and splay in a re-entrant instead of ruling
  // straight across the landscape like paint
  // Form-following, expressed in *metres of bedding offset* rather than as a
  // dot with the absolute world position. Scaling it by |P| meant the offset
  // ran to tens of bed thicknesses and swung by several whole cycles across a
  // single flute, so the beds averaged out to nothing on every massif more
  // than a few hundred metres from the origin — the reason mid-range faces
  // came out as smooth dunes. Bounded, it does what it should: bends the beds
  // round a nose and splays them in a re-entrant.
  // Bounded, and *softer* than it was: at full strength the term swings by most
  // of a bed thickness as the normal sweeps round a cone, which draws a
  // perfectly regular chevron on every conical peak instead of bending the beds
  // round a nose. Half the swing bends; the full swing wallpapers.
  float form = 1.9 * (1.0 - N.y) + 1.1 * N.x - 0.8 * N.z;
  float sy1 = (P.y + dot(P.xz, dip) + form * (0.6 + 0.8 * mr2)) * freq
            + warp * 0.20 + mr3 * 7.0;
  // Analytic band filtering. Once a bed projects to less than a pixel the
  // contrast is rolled off instead of aliasing, which is what lets the beds
  // survive out to kilometres and simply *dissolve* into haze at the limit.
  float sw = fwidth(sy1);
  float aaFade = 1.0 - smoothstep(0.17, 0.68, sw);
  float edge = max(sw * 1.1, 0.02);
  float bedIdx = floor(sy1);
  float bedR = fract(sin(bedIdx * 12.9898 + mr1 * 31.7) * 43758.5453);
  float bedR2 = fract(sin(bedIdx * 7.137 + 1.7 + mr2 * 17.3) * 21254.13);
  float band = fract(sy1);
  // Bed profile. This must swing the full 0..1 or the beds have no contrast to
  // give: everything that says *how strongly* this rock is bedded belongs in
  // bedStr below, multiplied into the effect, never into the profile. (It
  // used to be folded in here, and the product of three modulators pinned the
  // profile near zero — which is why entire massifs came out unbanded.)
  float thick = 0.18 + 0.38 * bedR;
  float fall = clamp(edge * 2.0, 0.14, 0.32);
  bedA = smoothstep(0.0, min(edge + 0.14 * bedR, 0.26), band)
             * (1.0 - smoothstep(thick, thick + fall, band));
  // erosion gullies chew the beds apart — without this they read as wallpaper
  float bedStr = 0.30 + 0.70 * smoothstep(0.22, 0.78,
    0.5 + 0.34 * tf_snoise(P.xz * 0.085) + 0.22 * tf_snoise(P.xz * 0.31));
  // and whole stretches of a range are simply massive, unbedded rock
  bedStr *= mix(0.28, 1.0, smoothstep(0.30, 0.72,
    0.5 + 0.5 * tf_snoise(P.xz * 0.0021 - 27.0) * 1.3));
  // Stratigraphic hierarchy: the fine beds come in packages ~6x thicker,
  // bounded by resistant units. A cliff with one single pitch of banding reads
  // as corduroy; a cliff with two nested scales reads as rock.
  float pkg = 0.5 + 0.5 * sin((sy1 * 0.165 + mr2 * 4.0 + warp * 0.05) * 6.2831);
  bedStr = clamp(bedStr * (0.50 + 0.70 * pkg), 0.0, 1.0);
  // fine laminations inside a bed: per-massif frequency and cut by the same
  // runnels, so they can never comb the whole range at one pitch
  float lamPh = (P.y + dot(P.xz, dip)) * (0.42 + 1.15 * mrB + 0.48 * bedR2) + warp * 1.6;
  float lam = 0.5 + 0.5 * sin(lamPh * 6.2831);
  // the laminations are finer than the beds, so they need their own filter
  lam = mix(0.5, lam, 1.0 - smoothstep(0.10, 0.42, fwidth(lamPh)));
  lam *= 0.35 + 0.65 * runnel;
  float bedTint = clamp(bedA * 0.76 + lam * 0.24, 0.0, 1.0);
  // Leide is red-ochre badlands: the bands run rust -> ash -> bleached, never
  // through neutral grey, or the whole massif desaturates into concrete.
  vec3 strataWarm = vec3(1.13, 0.96, 0.80);
  vec3 strataCool = vec3(0.93, 0.93, 0.95);
  vec3 strataPale = vec3(1.07, 1.02, 0.94);
  bedCol = mix(mix(strataCool, strataWarm, bedTint), strataPale, bedR2 * 0.55);
  // each range carries its own iron / ash balance
  bedCol *= mix(vec3(0.94, 0.97, 1.06), vec3(1.10, 0.98, 0.86), mr3);
  // Leide's bands run rust; a Cleigne limestone shelf's do not. Pull the
  // stack toward neutral wherever the region has moved off the ochre axis.
  bedCol = mix(bedCol, vec3(dot(bedCol, vec3(0.2126, 0.7152, 0.0722))), bioCool * 0.65);
  // With the beds analytically filtered they no longer have to be faded out at
  // 600 m to avoid moire: they run to the horizon and dissolve when a bed drops
  // below a pixel. That dissolve *is* the distance cue.
  float bandFade = aaFade * (1.0 - smoothstep(2400.0, 5000.0, vTDist));
  // contrast also falls with how strongly this massif is bedded at all
  // 0.34..0.78 in sin(tilt) is 20..51 degrees: beds show wherever the ground is
  // steep enough to shed its cover, which on a badland massif is most of it.
  // Contrast is pushed *up* with distance to pay back what the aerial
  // perspective takes away. A 10% albedo swing at 20 m survives to the eye; the
  // same swing at 900 m, behind that much scattering, does not — and a range
  // whose bedding has been washed flat is exactly the one that reads as a big
  // near lump rather than a distant mountain.
  // Sedimentary banding is a *badland* signature. Where the region is green the
  // same face is under soil and root mat, and drawing rust strata through it is
  // what made every Duscae and Cleigne hillside read as printed wood grain.
  //
  // This has to be a *threshold*, not a lerp. A plain mix() left a mid-green
  // region like Taelpar at 0.63 of full bedding strength, and since the same
  // expression then multiplies the contrast back up by 2.1x with distance, a
  // 300-900 m hillside came out more strongly banded than a near one: the
  // Taelpar valley walls read as varnished plywood. Bedding is either the
  // exposed rock of a badland or it is buried, so the curve should switch, and
  // it should be all the way off by the time a region is properly vegetated.
  float bedRegion = mix(1.0, 0.08, smoothstep(0.12, 0.50, bioGreen));
  cliffAmt = clamp(smoothstep(0.34, 0.78, structSlope) * bandFade
    * (0.45 + 0.80 * mr1) * bedStr * bedRegion
    * (1.0 + 1.10 * smoothstep(250.0, 1200.0, vTDist)), 0.0, 1.0);

  bedThrough = clamp(0.72 * smoothstep(0.34, 0.80, structSlope) * bedRegion, 0.0, 1.0);
  // the runnels darken independently of the bedding, at every distance, so even
  // a range past the band fade still has vertical structure. These survive a
  // green region far better than the beds do — a wooded valley wall still has
  // gullies raked down it — so they are only damped, never switched off.
  runnelAmt = smoothstep(0.30, 0.72, structSlope)
            * mix(1.0, 0.45, smoothstep(0.12, 0.50, bioGreen))
            * (1.0 - smoothstep(1500.0, 3400.0, vTDist));
  }

  // Large-scale value and hue drift across each landform. Three octaves from
  // ~1.4 km down to ~110 m: no two rock faces in a wide shot resolve to the
  // same material, which is the other half of killing the "one printed sheet
  // behind every peak" read.
  float vv1 = tf_snoise(P.xz * 0.00071 + 5.0);
  float vv2 = tf_snoise(P.xz * 0.0026 - 61.0);
  float vv3 = tf_snoise(P.xz * 0.0092 + 23.0);
  float faceV = clamp(0.5 + 0.44 * vv1 + 0.33 * vv2 + 0.23 * vv3, 0.0, 1.0);

  vec3 rockTint = mix(vec3(1.0), bedCol, cliffAmt)
    * mix(1.0, 0.83 + 0.31 * bedA, cliffAmt)
    * (0.84 + 0.34 * faceV)
    // Face-to-face hue drift. In Leide it stays on the ochre/ash axis and is
    // warm-biased; in a cool region both endpoints close toward neutral, or
    // every Cleigne cliff comes out rusty however the palette tints it.
    * mix(mix(vec3(0.95, 0.96, 1.02), vec3(0.99, 1.00, 1.03), bioCool),
          mix(vec3(1.18, 1.00, 0.80), vec3(1.08, 1.04, 0.97), bioCool),
          clamp(0.5 + 0.75 * vv2, 0.0, 1.0))
    * mix(1.0, 0.74 + 0.36 * runnel, runnelAmt)
    // the regional rock colour: rust in Leide, pale limestone in Cleigne,
    // black basalt on Ravatogh
    * bioRock;

  // ---- cheap far shading -------------------------------------------------
  vec3 farCol = vec3(0.0);
  float farRough = 0.0;
  for (int i = 0; i < 6; i++) { farCol += uLayerAvg[i] * w[i]; farRough += uLayerRough[i] * w[i]; }
  // On a steep face the dirt and gravel are a veneer a few centimetres thick
  // and the beds show straight through them. Without this the strata switch
  // off wherever the splat happens to favour a soft layer, which on a 30 deg
  // badland flank is most of the time — and the massif goes back to being a
  // smooth dune.
  // the far LOD is a flat average of the layers; without the rock tint every
  // distant massif is the same untextured lump of one colour
  float rockShare = clamp(w[3] * 1.25 + w[2] * 0.35 + bedThrough, 0.0, 1.0);
  // the soft layers take the region's ground colour, the rock its own
  farCol *= mix(bioGround * mix(vec3(1.0), TF_CHLORO, bioGreen * clamp(w[4] * 1.6, 0.0, 1.0)),
                vec3(1.0), rockShare);
  farCol *= mix(vec3(1.0), rockTint, rockShare);

  float detailAmt = 1.0 - smoothstep(420.0, 1100.0, vTDist);
  vec3 col = farCol;
  float rgh = farRough;
  float ao = 1.0;
  vec3 Nw = N;

  if (detailAmt > 0.002) {
    // close-range parallax offset from the shared detail height
    float nearAmt = 1.0 - smoothstep(2.5, 22.0, vTDist);
    vec2 poff = vec2(0.0);
    if (nearAmt > 0.001) {
      vec3 V = normalize(cameraPosition - P);
      float dh = texture(uDetailArr, vec3(P.xz * uDetailScale, 0.0)).a - 0.55;
      poff = -V.xz / max(0.45, V.y) * dh * 0.035 * nearAmt;
      poff = clamp(poff, vec2(-0.045), vec2(0.045));
    }
    vec2 wp = P.xz + poff;

    // Two tiling scales per layer, cross-faded by low-frequency noise. The
    // repeat period of the pair is irrational at any given point, so the eye
    // never finds the grid — and the coarse scale keeps distant ground varied.
    // Close up the fine tiling carries the detail; further out a 3x coarser
    // sample of the same layer takes over, so the repeat never lines up.
    float macroMix = clamp(0.05 + 0.26 * (0.5 + 0.5 * tf_snoise(P.xz * 0.0036 + 13.0))
      + 0.50 * smoothstep(25.0, 300.0, vTDist), 0.0, 0.82);

    // A slow world-space jitter warps the tile lattice so it never lines up
    // into a grid, without the shear a varying rotation would introduce.
    vec2 jit = vec2(tf_snoise(P.xz * 0.0031), tf_snoise(P.xz * 0.0031 + 31.0)) * 7.0
             + vec2(tf_snoise(P.xz * 0.0138 + 5.0), tf_snoise(P.xz * 0.0138 - 3.0)) * 1.6
             + vec2(tf_snoise(P.xz * 0.052 - 11.0), tf_snoise(P.xz * 0.052 + 17.0)) * 0.42;
    vec2 wj = wp + jit;

    // Sample only the layers the splat actually asked for.
    //
    // The six weights come out of a pow(1.7) sharpen and are extremely peaked:
    // a gravel flat is essentially one layer, a cliff face two. The height
    // blend below then throws away everything more than 0.30 under the leader,
    // so a layer sitting at a few percent of the dominant weight cannot reach
    // the final colour at all — and it was costing four array fetches to prove
    // it. Skipping those is where most of the splat's bandwidth was going.
    // Screen-space derivatives of the *shared* jittered coordinate, taken here
    // in uniform control flow. Each layer's own gradient is this one rotated
    // and scaled, so no dFdx is ever evaluated inside the divergent loop below
    // — which would be undefined, and is the exact class of bug that made the
    // mip level unpredictable when this shader last grew a branch.
    vec2 jdx = dFdx(wj), jdy = dFdy(wj);

    float maxW = 0.0;
    for (int i = 0; i < 6; i++) maxW = max(maxW, w[i]);
    float wCut = maxW * 0.06;
    vec4 alb[6];
    vec4 srf[6];
    for (int i = 0; i < 6; i++) {
      // layer 3 is triplanar and is resolved on its own below
      if (i == 3 || w[i] < wCut) {
        alb[i] = vec4(0.0); srf[i] = vec4(0.5, 0.5, uLayerRough[i], 1.0); continue;
      }
      float sc = uLayerScale[i], rt = uLayerRot[i];
      tf_stoch(tf_rot(wj, rt) * sc, float(i),
               tf_rot(jdx, rt) * sc, tf_rot(jdy, rt) * sc, alb[i], srf[i]);
    }

    // ---- rock is triplanar so cliffs never smear, and carries the strata ---
    // Eight more fetches, and on the basin floor the rock layer loses the
    // height blend outright — so it is only worth projecting where it is in
    // contention.
    vec3 bw = pow(abs(N), vec3(5.0));
    bw /= max(bw.x + bw.y + bw.z, 1e-4);
    const vec4 SURF_FLAT = vec4(0.5, 0.5, 0.5, 1.0);
    vec4 sx = SURF_FLAT, sy = SURF_FLAT, sz = SURF_FLAT;
    if (w[3] >= wCut) {

    // The rock tile is scaled *separately* in the horizontal and the bedding
    // axis: the horizontal scale controls grain, the vertical one controls bed
    // thickness. Both drift massif to massif, bed thickness also grows with
    // altitude the way a real stack coarsens toward its base, and the whole
    // tile is coarsened with distance so a face 800 m out is not drawn at the
    // same grain as one at 20 m.
    float distGrain = mix(1.0, 0.46, smoothstep(90.0, 700.0, vTDist));
    float rsH = uLayerScale[3] * (0.55 + 1.15 * mrA) * distGrain;
    float rsV = uLayerScale[3] * (0.38 + 1.45 * mrB)
              * (0.82 + 0.62 * smoothstep(20.0, 320.0, P.y)) * distGrain;
    // undulate the bedding plane so the texture's own strata are not a perfect
    // world-aligned stack across every cliff in the region
    float yw = P.y + 6.5 * tf_snoise(P.xz * 0.0031 + 3.0)
             + 2.6 * tf_snoise(P.xz * 0.0072) + 0.9 * tf_snoise(P.xz * 0.028);
    vec2 rzy = vec2((P.z + jit.y * 0.35) * rsH, yw * rsV);
    vec2 rxz = (P.xz + jit) * rsH;
    vec2 rxy = vec2((P.x + jit.x * 0.35) * rsH, yw * rsV);
    // A pow(5) blend weight is savagely peaked: on the basin floor bw is
    // (0.00, 1.00, 0.00) and on a cliff face one lateral axis owns it just as
    // completely. Sampling all three planes unconditionally spent eight array
    // fetches per pixel to add two contributions of well under one percent.
    // The neutral fill is what a zero-weighted plane contributes anyway.
    vec4 ax = SURF_FLAT, ay = SURF_FLAT, az = SURF_FLAT;
    // Second, incommensurate sample of the bedded planes, cross-faded by the
    // same low-frequency field the other layers use. Layer 3 was the one layer
    // still drawn at a single scale, which is precisely why every cliff in a
    // wide shot repeated on the same 12 m vertical period.
    if (bw.x > 0.012) {
      ax = mix(texture(uAlbedoArr, vec3(rzy, 3.0)),
               texture(uAlbedoArr, vec3(rzy * 0.415 + 7.13, 3.0)), macroMix);
      sx = texture(uSurfArr, vec3(rzy, 3.0));
    }
    if (bw.y > 0.012) {
      ay = texture(uAlbedoArr, vec3(rxz, 3.0));
      sy = texture(uSurfArr, vec3(rxz, 3.0));
    }
    if (bw.z > 0.012) {
      az = mix(texture(uAlbedoArr, vec3(rxy, 3.0)),
               texture(uAlbedoArr, vec3(rxy * 0.415 + 7.13, 3.0)), macroMix);
      sz = texture(uSurfArr, vec3(rxy, 3.0));
    }
    alb[3] = ax * bw.x + ay * bw.y + az * bw.z;
    srf[3] = sx * bw.x + sy * bw.y + sz * bw.z;

    // the strata, runnels and per-massif colour were all resolved above so
    // that the far LOD gets them too; here they simply modulate the sampled
    // rock tile, and the bed alpha pushes bedded rock up in the height blend
    alb[3].rgb *= rockTint;
    alb[3].a = mix(alb[3].a, alb[3].a * (0.7 + 0.45 * bedA), cliffAmt);
    }
    // the same veneer argument as the far path: dirt and gravel on a steep
    // face take the colour of the bed they are sitting on
    vec3 through = mix(vec3(1.0), rockTint, bedThrough);
    alb[1].rgb *= through;
    alb[2].rgb *= through;

    // Regional ground colour. The six layer tiles are authored as Leide
    // red-ochre and there is only one set of them; the palette is a multiplier
    // on top, which is what lets a humid basin read as real Duscae green and a
    // volcano as basalt without a second set of textures — or a seventh
    // sampler to hold them.
    alb[0].rgb *= bioGround;
    // bare soil in a humid basin is dark forest loam, not pale dust
    alb[1].rgb *= bioGround * mix(vec3(1.0), vec3(0.84, 0.86, 0.76), bioGreen);
    alb[2].rgb *= mix(bioGround, bioRock, 0.5);   // gravel is broken local rock
    alb[4].rgb *= bioGround * mix(vec3(1.0), TF_CHLORO, bioGreen);
    alb[5].rgb *= mix(vec3(1.0), bioGround, 0.45);  // the road stays pale dust

    // ---- height blend ------------------------------------------------------
    float b[6];
    float mx = -1e9;
    for (int i = 0; i < 6; i++) { b[i] = w[i] + alb[i].a * 0.42; mx = max(mx, b[i]); }
    float lo = mx - 0.30;
    float s2 = 0.0;
    float w2[6];
    for (int i = 0; i < 6; i++) { w2[i] = max(0.0, b[i] - lo); s2 += w2[i]; }
    s2 = max(s2, 1e-4);
    for (int i = 0; i < 6; i++) w2[i] /= s2;

    vec3 dcol = vec3(0.0);
    float drough = 0.0, dao = 0.0;
    vec2 tnXY = vec2(0.0);
    for (int i = 0; i < 6; i++) {
      dcol += alb[i].rgb * w2[i];
      drough += srf[i].b * w2[i];
      dao += srf[i].a * w2[i];
      if (i != 3) tnXY += tf_rot((srf[i].rg * 2.0 - 1.0), -uLayerRot[i]) * w2[i];
    }

    // detail normals: pebble scale at the camera, a coarser octave further out.
    // The pebble octave carries both the normal (xyz) and the albedo detail (a),
    // and was being fetched twice from the same coordinate for the two of them.
    float dAmtA = (1.0 - smoothstep(14.0, 90.0, vTDist)) * uMicro;
    float dAmtB = (1.0 - smoothstep(90.0, 420.0, vTDist)) * uMicro;
    vec4 dPeb = vec4(0.5, 0.5, 1.0, 0.5);
    if (dAmtA > 0.003) dPeb = texture(uDetailArr, vec3(wj * uDetailScale, 0.0));
    if (dAmtB > 0.003) {
      vec3 dnC = texture(uDetailArr, vec3(wj * uDetailScale * 0.37 + 0.71, 0.0)).xyz * 2.0 - 1.0;
      vec3 dnB = texture(uDetailArr, vec3(wj * uDetailScale * 0.085 + 0.37, 0.0)).xyz * 2.0 - 1.0;
      tnXY += dnC.xy * 0.34 * dAmtB + dnB.xy * 0.22 * dAmtB;
    }
    tnXY += (dPeb.xy * 2.0 - 1.0) * 0.55 * dAmtA;
    // hard clamp: an over-tilted tangent normal turns ground into torn foil
    tnXY = clamp(tnXY, vec2(-0.95), vec2(0.95));

    // Close-range albedo detail. The layer tiles are 3-12 m, so a metre from
    // the camera they are magnified into mush; this puts pebble-and-crack
    // scale contrast back into the colour, not just the normal. The finest
    // octave of it is gone by 16 m, so past that it is not fetched at all.
    float gritAmt = (1.0 - smoothstep(2.0, 16.0, vTDist)) * 0.85;
    float grit = 0.5;
    if (gritAmt > 0.003) grit = texture(uDetailArr, vec3(wj * uDetailScale * 2.9, 0.0)).a;
    float micro = mix(1.0, 0.78 + 0.46 * dPeb.a, dAmtA * 0.8)
                * mix(1.0, 0.86 + 0.28 * grit, gritAmt);

    // ---- near-field surface: gravel, cracking and scour at 2-4 m ----------
    // Triplanar, because the near ground is exactly where the camera looks
    // along the surface: a planar XZ projection smears to nothing at a grazing
    // angle, which is why detail used to "die past ~15 m".
    vec3 nearN = vec3(0.0, 0.0, 1.0);
    float nearAlb = 0.5;
    float nfAmt = (1.0 - smoothstep(38.0, 105.0, vTDist)) * uMicro;
    if (nfAmt > 0.003) {
      vec3 nbw = pow(abs(N), vec3(3.0));
      nbw /= max(nbw.x + nbw.y + nbw.z, 1e-4);
      float ns = uNearScale;
      vec2 nzy = vec2(P.z + jit.y * 0.5, P.y) * ns;
      vec2 nxz = (P.xz + jit * 0.5) * ns;
      vec2 nxy = vec2(P.x + jit.x * 0.5, P.y) * ns;
      vec4 q0 = texture(uDetailArr, vec3(nzy, 1.0));
      vec4 q1 = texture(uDetailArr, vec3(nxz, 1.0));
      vec4 q2 = texture(uDetailArr, vec3(nxy, 1.0));
      // second, finer octave rotated off the first so the 2-4 m lattice never
      // resolves into a grid at a metre from the lens
      vec4 r0 = texture(uDetailArr, vec3(tf_rot(nzy, 1.13) * 2.63 + 0.41, 1.0));
      vec4 r1 = texture(uDetailArr, vec3(tf_rot(nxz, 1.13) * 2.63 + 0.41, 1.0));
      vec4 r2 = texture(uDetailArr, vec3(tf_rot(nxy, 1.13) * 2.63 + 0.41, 1.0));
      float fine = (1.0 - smoothstep(3.0, 15.0, vTDist));
      vec4 nq = mix(q0 * nbw.x + q1 * nbw.y + q2 * nbw.z,
                    r0 * nbw.x + r1 * nbw.y + r2 * nbw.z, 0.42 * fine);
      // whiteout triplanar normal for the near map
      vec3 m0 = nq.rgb * 2.0 - 1.0;
      nearN = normalize(vec3(m0.xy * 1.35, max(m0.z, 0.22)));
      nearAlb = nq.a;
    }

    // Gravel gets stronger on slopes: loose material collects where the ground
    // starts to tip, so the near ground stops being one uniform mud.
    float scree = smoothstep(0.08, 0.34, slope) * nfAmt;
    // push the contrast of the near map: the raw field is centred and gentle,
    // and gentle is exactly what reads as a smooth brown mound
    float na = clamp((nearAlb - 0.5) * 1.75 + 0.5, 0.0, 1.0);
    float nearCol = mix(1.0, 0.55 + 0.95 * na, nfAmt * 0.80);
    micro *= nearCol;
    // pebbles read a touch cooler and the cracks a touch warmer than the bed
    vec3 nearTint = mix(vec3(1.09, 0.95, 0.85), vec3(0.94, 0.99, 1.07), na);
    micro *= 1.0 + 0.10 * scree;

    // build the world normal from the terrain frame + blended tangent normal
    vec3 T = normalize(vec3(1.0, 0.0, 0.0) - N * N.x);
    vec3 B = cross(N, T);
    tnXY += nearN.xy * (0.88 + 0.55 * scree) * nfAmt;
    tnXY = clamp(tnXY, vec2(-0.95), vec2(0.95));
    vec3 tn = normalize(vec3(tnXY, 1.0));
    vec3 planarN = normalize(T * tn.x + B * tn.y + N * tn.z);

    // triplanar (whiteout) normal for the rock layer
    vec3 nX = sx.rgb * 2.0 - 1.0, nY = sy.rgb * 2.0 - 1.0, nZ = sz.rgb * 2.0 - 1.0;
    vec3 tX = vec3(nX.xy + N.zy, abs(nX.z) * N.x).zyx;
    vec3 tY = vec3(nY.xy + N.xz, abs(nY.z) * N.y).xzy;
    vec3 tZ = vec3(nZ.xy + N.xy, abs(nZ.z) * N.z).xyz;
    vec3 rockN = normalize(tX * bw.x + tY * bw.y + tZ * bw.z);
    rockN = normalize(mix(N, rockN, 0.85));

    vec3 dN = normalize(mix(planarN, rockN, clamp(w2[3] * 1.15, 0.0, 1.0)));

    col = mix(farCol, dcol * micro * mix(vec3(1.0), nearTint, nfAmt * 0.5), detailAmt);
    rgh = mix(farRough, drough, detailAmt);
    // cracks and scour hold shade; pebble crowns are polished by the wind
    rgh = mix(rgh, rgh * (1.14 - 0.40 * na), nfAmt * 0.60);
    ao = mix(1.0, dao * (0.76 + 0.36 * na), detailAmt);
    Nw = normalize(mix(N, dN, detailAmt));
  }

  // ---- macro tinting -------------------------------------------------------
  // three overlapping colour fields at 600 m / 140 m / 40 m: the thing that
  // makes a procedural surface stop reading as one material.
  float t1 = clamp(0.5 + 0.72 * m1 + 0.30 * m2, 0.0, 1.0);
  // The three endpoints are regional: in Leide they are the original ochre /
  // ash / olive, and they close toward a cool green as the region does.
  vec3 ochre = mix(vec3(1.20, 0.96, 0.74), vec3(1.02, 1.06, 0.88), bioCool);
  vec3 ash   = mix(vec3(0.84, 0.90, 1.00), vec3(0.86, 0.95, 1.02), bioCool);
  vec3 olive = mix(vec3(1.02, 1.03, 0.80), vec3(0.90, 1.07, 0.80), bioGreen);
  col *= mix(ash, ochre, t1);
  col *= mix(vec3(1.0), olive, clamp(0.5 + 0.9 * m2 - 0.4 * m1, 0.0, 1.0) * 0.45);
  // widened: hectare-scale value drift is what stops a region reading as one
  // flat wash of its own palette
  col *= 0.76 + 0.48 * (0.5 + 0.5 * m3);
  // damp channels read darker and slicker
  col *= mix(1.0, 0.78, flow * 0.75);
  rgh = mix(rgh, rgh * 0.84, flow * 0.7);

  // wheel ruts: two polished, dust-cleared tracks either side of a raised crown
  if (onRoad > 0.5) {
    float la = abs(roadLat);
    float rut = exp(-pow((la - 1.85) / 0.75, 2.0));
    float crown = exp(-pow(la / 1.05, 2.0));
    float verge = smoothstep(3.6, 5.4, la);
    float trackAmt = road * (1.0 - smoothstep(0.30, 0.55, slope));
    col *= mix(1.0, 0.80 + 0.06 * tf_snoise(P.xz * 0.9), rut * 0.9 * trackAmt);
    col *= mix(1.0, 1.09, crown * 0.6 * trackAmt);
    col *= mix(1.0, 0.90, verge * 0.55 * trackAmt);
    rgh = mix(rgh, rgh * 0.78, rut * trackAmt);
  }
  // bleach the high plateaus, warm the pans
  col *= mix(1.0, 1.12, smoothstep(90.0, 210.0, alt));
  col *= mix(1.0, 0.94, smoothstep(0.35, 0.75, slope));
  // sun-bleached naturalism, not candy: pull a little saturation back out
  col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 0.86);

  // ---- standing humidity and the shore line --------------------------------
  // Weather-independent wetness: a slough is wet in high summer, and the metre
  // or two of ground above any water line is dark everywhere in the world.
  // Only the flats hold it — water runs off a face.
  float damp = bioDamp * (1.0 - smoothstep(0.16, 0.44, slope));
  float shore = (1.0 - smoothstep(0.0, 9.0, alt - uEnv.x))
              * (1.0 - smoothstep(0.05, 0.30, slope));
  damp = clamp(max(damp, shore * 0.88), 0.0, 1.0);
  col *= mix(1.0, 0.66, damp);
  col = mix(col, col * vec3(0.90, 0.97, 1.05), damp * 0.85);
  rgh = mix(rgh, rgh * 0.55, damp);

  // ---- wet response --------------------------------------------------------
  // A water film fills the surface micro-relief, so roughness collapses, and it
  // traps light that would otherwise have scattered back out of the top layer,
  // so albedo darkens. Standing water then collects exactly where the erosion
  // sim already says water goes — the flow channels, the sediment pans, the
  // wheel ruts — rather than in an arbitrary noise field.
  float wet = uWet.x;
  if (wet > 0.002) {
    float flatW = 1.0 - smoothstep(0.05, 0.22, slope);
    float pn1 = 0.5 + 0.5 * tf_snoise(P.xz * 0.19 + 4.0);
    float pn2 = 0.5 + 0.5 * tf_snoise(P.xz * 0.052 - 12.0);
    float basin = clamp(flow * 2.1 + sedi * 0.55 + pn2 * 0.42 - 0.28, 0.0, 1.0);
    if (onRoad > 0.5) {
      float rutW = exp(-pow((abs(roadLat) - 1.85) / 0.70, 2.0)) * road;
      basin = max(basin, rutW * 0.92);
    }
    float puddle = flatW * smoothstep(0.40, 0.84, basin * (0.55 + 0.65 * pn1))
                 * smoothstep(0.12, 0.62, wet);

    float damp = wet * mix(0.60, 1.0, flatW);
    col *= mix(1.0, 0.50, damp);
    // and a soaked surface loses the dry-dust warm cast
    col = mix(col, col * vec3(0.88, 0.94, 1.04), damp);
    rgh = mix(rgh, rgh * 0.40, damp);
    // standing water on top of the damp ground
    col = mix(col, col * 0.28 + vec3(0.010, 0.013, 0.018), puddle);
    rgh = mix(rgh, 0.055, puddle);
    Nw = normalize(mix(Nw, vec3(0.0, 1.0, 0.0), puddle * 0.88));
    ao = mix(ao, mix(ao, 1.0, 0.6), puddle);
  }

  tfAlbedo = col;
  tfRough = clamp(rgh, mix(mix(0.35, 0.12, damp), 0.045, wet), 1.0);
  tfNormalW = Nw;
  tfAO = clamp(ao, 0.0, 1.0);
}
`;

const FRAG_MAP = /* glsl */`
tf_shade();
diffuseColor.rgb *= tfAlbedo;
`;

const FRAG_ROUGH = /* glsl */`
float roughnessFactor = tfRough;
`;

const FRAG_NORMAL = /* glsl */`
float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
vec3 normal = tfNormalW;
vec3 nonPerturbedNormal = normal;
`;

const FRAG_AO = /* glsl */`
reflectedLight.indirectDiffuse *= mix(1.0, tfAO, 0.85);
reflectedLight.indirectSpecular *= mix(1.0, tfAO, 0.95);
`;

/**
 * @param res shared textures + uniform values
 * @param cell world size of this LOD level's cells
 * @param level LOD index (0 = finest) — drives polygon offset
 */
export function createTerrainMaterial(res: any, cell: number, level: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0,
    dithering: true,
  });
  // Weather drives the terrain's wet response through uWet, not by scaling the
  // material's authored colour/roughness the way it does for props.
  mat.userData.terrainSurface = true;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = 1.0 + level * 0.5;
  mat.polygonOffsetUnits = 2.0 + level * 6.0;

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, res.uniforms, { uCell: { value: cell } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', VERT_BEGIN)
      .replace('#include <beginnormal_vertex>',
        'vec3 objectNormal = tf_normal((modelMatrix * vec4(position, 1.0)).xz);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', FRAG_ROUGH)
      .replace('#include <normal_fragment_begin>', FRAG_NORMAL)
      .replace('#include <normal_fragment_maps>', '')
      .replace('#include <aomap_fragment>', FRAG_AO);
    mat.userData.shader = shader;
  };
  mat.customProgramCacheKey = () => 'terrain-surface';
  return mat;
}

/** Depth material for shadow casting — must displace identically. */
export function createTerrainDepthMaterial(res, cell) {
  const mat = new THREE.MeshDepthMaterial();
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, res.uniforms, { uCell: { value: cell } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', VERT_BEGIN);
  };
  mat.customProgramCacheKey = () => 'terrain-depth';
  return mat;
}

/**
 * GTAOPass draws the scene's depth+normal g-buffer through a single
 * `scene.overrideMaterial`, which would see our terrain as an undisplaced
 * plane. Patch that one material so it displaces anything carrying the terrain
 * flag (`aClip.y`); every other object is untouched because an unbound
 * attribute reads back as zero.
 * @param res shared uniform block
 */
export function patchGBufferMaterial(normalMaterial: THREE.MeshNormalMaterial, res: any) {
  if (!normalMaterial || normalMaterial.userData.terrainPatched) return;
  normalMaterial.userData.terrainPatched = true;
  normalMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, res.uniforms, { uCell: { value: res.finestCell } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', /* glsl */`
        vec3 objectNormal = vec3(normal);
        if (aClip.y > 0.5) objectNormal = tf_normal((modelMatrix * vec4(position, 1.0)).xz);
      `)
      .replace('#include <begin_vertex>', /* glsl */`
        vec3 transformed = vec3(position);
        vec2 tfWP = vec2(0.0);
        vTW = vec3(0.0); vTDist = 0.0;
        if (aClip.y > 0.5) {
          tfWP = (modelMatrix * vec4(position, 1.0)).xz;
          transformed = vec3(position.x, tf_height(tfWP), position.z);
        }
      `);
  };
  normalMaterial.customProgramCacheKey = () => 'terrain-gbuffer';
  normalMaterial.needsUpdate = true;
}

/**
 * Uniform block shared by every LOD level.
 * @param tex the shared texture set
 * @param field heightfield grid constants
 * @param [world] `WorldMap.WORLD` — sea level and world span
 */
export function makeTerrainUniforms(tex: any, field: any, world: any = { seaLevel: -6.5, size: 8192 }) {
  return {
    uHeightTex: { value: tex.height },
    uFarHeightTex: { value: tex.farHeight },
    uNormalTex: { value: tex.normal },
    uFarNormalTex: { value: tex.farNormal },
    uCtrlTex: { value: tex.ctrl },
    uFarCtrlTex: { value: tex.farCtrl },
    uDetailArr: { value: tex.detailArray },
    uAlbedoArr: { value: tex.albedoArray },
    uSurfArr: { value: tex.surfArray },
    uField: { value: new THREE.Vector4(field.HALF, field.CELL, field.N, field.BLEND_OUT) },
    uFarP: { value: new THREE.Vector4(field.FAR_HALF, field.FAR_CELL, field.FAR_N, 0) },
    uLayerAvg: { value: LAYER_AVG.map((c) => new THREE.Vector3(c[0], c[1], c[2])) },
    uLayerRough: { value: LAYER_ROUGH.slice() },
    uLayerScale: { value: LAYER_SCALE.slice() },
    uLayerRot: { value: [0.0, 0.72, 1.63, 0.31, 2.41, 0.0] },
    uDetailScale: { value: 1.55 },
    // 0.34 tiles/m ~= a 2.9 m repeat: the band between the layer tiles (3-12 m)
    // and the pebble detail map (0.65 m)
    uNearScale: { value: 0.34 },
    uMicro: { value: 1.0 },
    // sea level lets the ground darken as it runs into the water, and the
    // reciprocal world span maps a world position onto the biome LUT. Both are
    // uniforms rather than a texture on purpose: the fragment shader has no
    // spare texture unit.
    uEnv: { value: new THREE.Vector4(world.seaLevel, 1 / world.size, 0, 0) },
    uWet: { value: new THREE.Vector4(0, 1, 0, 0) },
  };
}

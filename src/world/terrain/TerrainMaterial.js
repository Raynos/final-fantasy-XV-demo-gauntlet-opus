import * as THREE from 'three';
import { LAYER_AVG, LAYER_ROUGH, LAYER_SCALE } from './Layers.js';

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
  if (max(abs(p.x), abs(p.y)) >= uField.w) return tf_grid(uFarHeightTex, p, uFarP);
  return tf_grid(uHeightTex, p, uField);
}
vec2 tf_uv(vec2 p, vec4 P) { return ((p + P.x) / P.y + 0.5) / P.z; }
`;

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
float tfH = tf_height(tfWP);
if (aClip.x > 0.0) {
  float c2 = uCell * 2.0;
  vec2 g = tfWP / c2;
  vec2 g0 = floor(g);
  vec2 gt = g - g0;
  float h00 = tf_height(g0 * c2);
  float h10 = tf_height((g0 + vec2(1.0, 0.0)) * c2);
  float h01 = tf_height((g0 + vec2(0.0, 1.0)) * c2);
  float h11 = tf_height((g0 + vec2(1.0, 1.0)) * c2);
  tfH = mix(tfH, mix(mix(h00, h10, gt.x), mix(h01, h11, gt.x), gt.y), aClip.x);
}
vec3 transformed = vec3(position.x, tfH, position.z);
vTW = vec3(tfWP.x, tfH, tfWP.y);
vTDist = length(cameraPosition - vTW);
`;

const FRAG_PARS = /* glsl */`
${NOISE_GLSL}
uniform sampler2D uNormalTex;
uniform sampler2D uFarNormalTex;
uniform sampler2D uCtrlTex;
uniform sampler2D uFarCtrlTex;
uniform sampler2D uDetailTex;
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

vec3 tf_surfNormal(vec2 p) {
  vec2 nn = (max(abs(p.x), abs(p.y)) >= uField.w)
    ? texture2D(uFarNormalTex, tf_uv(p, uFarP)).rg
    : texture2D(uNormalTex, tf_uv(p, uField)).rg;
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
  float dryness = clamp(0.5 + 0.45 * m1 + 0.55 * patchN, 0.0, 1.0);
  float flatAmt = 1.0 - smoothstep(0.06, 0.28, slope);
  float lowAlt = 1.0 - smoothstep(48.0, 120.0, alt);

  float w[6];
  w[0] = flatAmt * lowAlt * (0.14 + 1.05 * sedi + 1.70 * smoothstep(0.60, 0.95, dryness));
  w[1] = 0.72 + 0.55 * (0.5 + 0.5 * p2) - 1.35 * smoothstep(0.10, 0.44, slope);
  w[2] = smoothstep(0.14, 0.42, slope) * (0.5 + 0.8 * (0.5 + 0.5 * m2))
       + 1.20 * flow + 0.40 * rocky
       + 0.62 * smoothstep(0.34, 0.04, dryness) * flatAmt;
  w[3] = smoothstep(0.20, 0.48, slope) * 1.80 + 1.10 * rocky
       + 0.65 * smoothstep(80.0, 175.0, alt);
  w[4] = flatAmt * lowAlt * 1.30
       * smoothstep(0.12, 0.66, 0.42 * flow + 0.36 * patchN + 0.22 * m1 + 0.17 + 0.14 * sedi);
  // a road can never read as a pale scar up a cliff face, whatever the mask says
  w[5] = road * 5.5 * (1.0 - smoothstep(0.30, 0.55, slope));

  // sharpen before normalising: without this every layer averages into mud
  float wsum = 0.0;
  for (int i = 0; i < 6; i++) { w[i] = pow(max(w[i], 0.0), 1.7); wsum += w[i]; }
  wsum = max(wsum, 1e-4);
  for (int i = 0; i < 6; i++) w[i] /= wsum;

  // ---- cheap far shading -------------------------------------------------
  vec3 farCol = vec3(0.0);
  float farRough = 0.0;
  for (int i = 0; i < 6; i++) { farCol += uLayerAvg[i] * w[i]; farRough += uLayerRough[i] * w[i]; }

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
      float dh = texture2D(uDetailTex, P.xz * uDetailScale).a - 0.55;
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

    vec4 alb[6];
    vec4 srf[6];
    for (int i = 0; i < 6; i++) {
      vec2 uvA = tf_rot(wj, uLayerRot[i]) * uLayerScale[i];
      vec2 uvB = tf_rot(wj, uLayerRot[i] + 1.87) * (uLayerScale[i] * 0.34) + 11.3;
      alb[i] = mix(texture(uAlbedoArr, vec3(uvA, float(i))),
                   texture(uAlbedoArr, vec3(uvB, float(i))), macroMix);
      srf[i] = mix(texture(uSurfArr, vec3(uvA, float(i))),
                   texture(uSurfArr, vec3(uvB, float(i))), macroMix * 0.6);
    }

    // ---- rock is triplanar so cliffs never smear, and carries the strata ---
    vec3 bw = pow(abs(N), vec3(5.0));
    bw /= max(bw.x + bw.y + bw.z, 1e-4);
    float rs = uLayerScale[3];
    // undulate the bedding plane so the texture's own strata are not a perfect
    // world-aligned stack across every cliff in the region
    float yw = P.y + 2.6 * tf_snoise(P.xz * 0.0072) + 0.9 * tf_snoise(P.xz * 0.028);
    vec2 rzy = vec2(P.z + jit.y * 0.35, yw) * rs;
    vec2 rxz = (P.xz + jit) * rs;
    vec2 rxy = vec2(P.x + jit.x * 0.35, yw) * rs;
    vec4 ax = texture(uAlbedoArr, vec3(rzy, 3.0));
    vec4 ay = texture(uAlbedoArr, vec3(rxz, 3.0));
    vec4 az = texture(uAlbedoArr, vec3(rxy, 3.0));
    vec4 sx = texture(uSurfArr, vec3(rzy, 3.0));
    vec4 sy = texture(uSurfArr, vec3(rxz, 3.0));
    vec4 sz = texture(uSurfArr, vec3(rxy, 3.0));
    alb[3] = ax * bw.x + ay * bw.y + az * bw.z;
    srf[3] = sx * bw.x + sy * bw.y + sz * bw.z;

    // Procedural sedimentary banding — the Leide signature. Bed thickness and
    // colour are randomised per bed index so the stack never reads as a
    // regular stripe pattern, and the contrast falls off with distance so the
    // bands cannot alias into moire on far ranges.
    float warp = 3.4 * tf_snoise(P.xz * 0.0041) + 1.2 * tf_snoise(P.xz * 0.018)
               + 0.5 * tf_snoise(P.xz * 0.075);
    float sy1 = P.y * 0.034 + warp * 0.14;
    float bedIdx = floor(sy1);
    float bedR = fract(sin(bedIdx * 12.9898) * 43758.5453);
    float bedR2 = fract(sin(bedIdx * 7.137 + 1.7) * 21254.13);
    float band = fract(sy1);
    float thick = 0.24 + 0.58 * bedR;
    float bedA = smoothstep(0.02, 0.06 + 0.16 * bedR, band)
               * (1.0 - smoothstep(thick, thick + 0.34, band));
    // erosion gullies chew the beds apart — without this they read as wallpaper
    bedA *= 0.30 + 0.70 * smoothstep(0.22, 0.78,
      0.5 + 0.34 * tf_snoise(P.xz * 0.085) + 0.22 * tf_snoise(P.xz * 0.31));
    float lam = 0.5 + 0.5 * sin((P.y * (0.44 + 0.3 * bedR2) + warp * 1.1) * 6.2831);
    float bedTint = clamp(bedA * 0.68 + lam * 0.32, 0.0, 1.0);
    vec3 strataWarm = vec3(1.15, 0.97, 0.80);
    vec3 strataCool = vec3(0.86, 0.89, 0.95);
    vec3 strataPale = vec3(1.07, 1.04, 0.96);
    vec3 bedCol = mix(mix(strataCool, strataWarm, bedTint), strataPale, bedR2 * 0.55);
    float bandFade = 1.0 - smoothstep(220.0, 780.0, vTDist);
    float cliffAmt = smoothstep(0.30, 0.62, slope) * bandFade;
    alb[3].rgb *= mix(vec3(1.0), bedCol, cliffAmt);
    alb[3].rgb *= mix(1.0, 0.87 + 0.24 * bedA, cliffAmt);
    alb[3].a = mix(alb[3].a, alb[3].a * (0.7 + 0.45 * bedA), cliffAmt);

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

    // detail normals: pebble scale at the camera, a coarser octave further out
    float dAmtA = (1.0 - smoothstep(9.0, 60.0, vTDist)) * uMicro;
    float dAmtB = (1.0 - smoothstep(90.0, 420.0, vTDist)) * uMicro;
    vec3 dnA = texture2D(uDetailTex, wj * uDetailScale).xyz * 2.0 - 1.0;
    vec3 dnC = texture2D(uDetailTex, wj * uDetailScale * 0.37 + 0.71).xyz * 2.0 - 1.0;
    vec3 dnB = texture2D(uDetailTex, wj * uDetailScale * 0.085 + 0.37).xyz * 2.0 - 1.0;
    tnXY += dnA.xy * 0.55 * dAmtA + dnC.xy * 0.34 * dAmtB + dnB.xy * 0.22 * dAmtB;
    // hard clamp: an over-tilted tangent normal turns ground into torn foil
    tnXY = clamp(tnXY, vec2(-0.95), vec2(0.95));

    // Close-range albedo detail. The layer tiles are 3-12 m, so a metre from
    // the camera they are magnified into mush; this puts pebble-and-crack
    // scale contrast back into the colour, not just the normal.
    float grit = texture2D(uDetailTex, wj * uDetailScale * 2.9).a;
    float pebA = texture2D(uDetailTex, wj * uDetailScale).a;
    float micro = mix(1.0, 0.78 + 0.46 * pebA, dAmtA * 0.8)
                * mix(1.0, 0.86 + 0.28 * grit, (1.0 - smoothstep(2.0, 16.0, vTDist)) * 0.85);

    // build the world normal from the terrain frame + blended tangent normal
    vec3 T = normalize(vec3(1.0, 0.0, 0.0) - N * N.x);
    vec3 B = cross(N, T);
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

    col = mix(farCol, dcol * micro, detailAmt);
    rgh = mix(farRough, drough, detailAmt);
    ao = mix(1.0, dao, detailAmt);
    Nw = normalize(mix(N, dN, detailAmt));
  }

  // ---- macro tinting -------------------------------------------------------
  // three overlapping colour fields at 600 m / 140 m / 40 m: the thing that
  // makes a procedural surface stop reading as one material.
  float t1 = clamp(0.5 + 0.72 * m1 + 0.30 * m2, 0.0, 1.0);
  vec3 ochre = vec3(1.20, 0.96, 0.74);
  vec3 ash   = vec3(0.84, 0.90, 1.00);
  vec3 olive = vec3(1.02, 1.03, 0.80);
  col *= mix(ash, ochre, t1);
  col *= mix(vec3(1.0), olive, clamp(0.5 + 0.9 * m2 - 0.4 * m1, 0.0, 1.0) * 0.45);
  col *= 0.80 + 0.40 * (0.5 + 0.5 * m3);
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

  tfAlbedo = col;
  tfRough = clamp(rgh, 0.35, 1.0);
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
 * @param {object} res shared textures + uniform values
 * @param {number} cell world size of this LOD level's cells
 * @param {number} level LOD index (0 = finest) — drives polygon offset
 * @returns {THREE.MeshStandardMaterial}
 */
export function createTerrainMaterial(res, cell, level) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0,
    dithering: true,
  });
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
 * @param {THREE.MeshNormalMaterial} normalMaterial
 * @param {object} res shared uniform block
 */
export function patchGBufferMaterial(normalMaterial, res) {
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

/** Uniform block shared by every LOD level. */
export function makeTerrainUniforms(tex, field) {
  return {
    uHeightTex: { value: tex.height },
    uFarHeightTex: { value: tex.farHeight },
    uNormalTex: { value: tex.normal },
    uFarNormalTex: { value: tex.farNormal },
    uCtrlTex: { value: tex.ctrl },
    uFarCtrlTex: { value: tex.farCtrl },
    uDetailTex: { value: tex.detail },
    uAlbedoArr: { value: tex.albedoArray },
    uSurfArr: { value: tex.surfArray },
    uField: { value: new THREE.Vector4(field.HALF, field.CELL, field.N, field.BLEND_OUT) },
    uFarP: { value: new THREE.Vector4(field.FAR_HALF, field.FAR_CELL, field.FAR_N, 0) },
    uLayerAvg: { value: LAYER_AVG.map((c) => new THREE.Vector3(c[0], c[1], c[2])) },
    uLayerRough: { value: LAYER_ROUGH.slice() },
    uLayerScale: { value: LAYER_SCALE.slice() },
    uLayerRot: { value: [0.0, 0.72, 1.63, 0.31, 2.41, 0.0] },
    uDetailScale: { value: 1.55 },
    uMicro: { value: 1.0 },
  };
}

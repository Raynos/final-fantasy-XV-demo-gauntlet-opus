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
uniform highp sampler2DArray uDetailArr;   // 0 = sub-metre grit, 1 = 2-4 m surface
uniform float uNearScale;
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
  // Talus / scree: the mid-slope band directly under a cliff face, where the
  // material that spalled off it collects. Badlands read as badlands largely
  // because every wall stands on a skirt of its own debris.
  float scree = smoothstep(0.15, 0.31, slope) * (1.0 - smoothstep(0.33, 0.52, slope))
              * smoothstep(0.30, 0.70, rocky)
              * (0.55 + 0.45 * (0.5 + 0.5 * tf_snoise(vTW.xz * 0.021 - 3.0)));
  w[2] += 0.55 * scree;
  w[3] -= 0.22 * scree;
  w[4] = flatAmt * lowAlt * 1.30
       * smoothstep(0.12, 0.66, 0.42 * flow + 0.36 * patchN + 0.22 * m1 + 0.17 + 0.14 * sedi);
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

  // Vertical erosion runnels. Every badland face is raked by rain channels
  // that cut straight down across the bedding; without them the horizontal
  // strata have nothing to interrupt them and the whole range reads as a
  // printed stripe. These run with the *slope*, not with world Y, so they fan
  // out over ridges instead of marching in lockstep.
  float rn1 = tf_snoise(vec2((P.x * 0.83 - P.z * 0.56) * 0.052, P.y * 0.0045 + 2.0));
  float rn2 = tf_snoise(vec2((P.x * 0.41 + P.z * 0.91) * 0.155, P.y * 0.011 - 5.0));
  float rn3 = tf_snoise(vec2((P.x * 0.67 - P.z * 0.74) * 0.017, P.y * 0.0018 + 8.0));
  float runnel = smoothstep(0.16, 0.82, 0.5 + 0.34 * rn1 + 0.22 * rn2 + 0.30 * rn3);

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
  float form = 3.6 * (1.0 - N.y) + 2.0 * N.x - 1.4 * N.z;
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
  float bedA = smoothstep(0.0, min(edge + 0.14 * bedR, 0.26), band)
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
  vec3 bedCol = mix(mix(strataCool, strataWarm, bedTint), strataPale, bedR2 * 0.55);
  // each range carries its own iron / ash balance
  bedCol *= mix(vec3(0.94, 0.97, 1.06), vec3(1.10, 0.98, 0.86), mr3);
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
  float cliffAmt = clamp(smoothstep(0.34, 0.78, structSlope) * bandFade
    * (0.45 + 0.80 * mr1) * bedStr
    * (1.0 + 1.10 * smoothstep(250.0, 1200.0, vTDist)), 0.0, 1.0);

  // Large-scale value and hue drift across each landform. Three octaves from
  // ~1.4 km down to ~110 m: no two rock faces in a wide shot resolve to the
  // same material, which is the other half of killing the "one printed sheet
  // behind every peak" read.
  float vv1 = tf_snoise(P.xz * 0.00071 + 5.0);
  float vv2 = tf_snoise(P.xz * 0.0026 - 61.0);
  float vv3 = tf_snoise(P.xz * 0.0092 + 23.0);
  float faceV = clamp(0.5 + 0.44 * vv1 + 0.33 * vv2 + 0.23 * vv3, 0.0, 1.0);
  // the runnels darken independently of the bedding, at every distance, so even
  // a range past the band fade still has vertical structure
  float runnelAmt = smoothstep(0.30, 0.72, structSlope) * (1.0 - smoothstep(1500.0, 3400.0, vTDist));

  vec3 rockTint = mix(vec3(1.0), bedCol, cliffAmt)
    * mix(1.0, 0.83 + 0.31 * bedA, cliffAmt)
    * (0.84 + 0.34 * faceV)
    // face-to-face hue drift stays on the ochre/ash axis, warm-biased
    * mix(vec3(0.95, 0.96, 1.02), vec3(1.18, 1.00, 0.80), clamp(0.5 + 0.75 * vv2, 0.0, 1.0))
    * mix(1.0, 0.74 + 0.36 * runnel, runnelAmt)
    * vec3(1.05, 1.00, 0.93);

  // ---- cheap far shading -------------------------------------------------
  vec3 farCol = vec3(0.0);
  float farRough = 0.0;
  for (int i = 0; i < 6; i++) { farCol += uLayerAvg[i] * w[i]; farRough += uLayerRough[i] * w[i]; }
  // On a steep face the dirt and gravel are a veneer a few centimetres thick
  // and the beds show straight through them. Without this the strata switch
  // off wherever the splat happens to favour a soft layer, which on a 30 deg
  // badland flank is most of the time — and the massif goes back to being a
  // smooth dune.
  float bedThrough = clamp(0.72 * smoothstep(0.34, 0.80, structSlope), 0.0, 1.0);
  // the far LOD is a flat average of the layers; without the rock tint every
  // distant massif is the same untextured lump of one colour
  farCol *= mix(vec3(1.0), rockTint,
    clamp(w[3] * 1.25 + w[2] * 0.35 + bedThrough, 0.0, 1.0));

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
    vec4 ax = texture(uAlbedoArr, vec3(rzy, 3.0));
    vec4 ay = texture(uAlbedoArr, vec3(rxz, 3.0));
    vec4 az = texture(uAlbedoArr, vec3(rxy, 3.0));
    // Second, incommensurate sample of the bedded planes, cross-faded by the
    // same low-frequency field the other layers use. Layer 3 was the one layer
    // still drawn at a single scale, which is precisely why every cliff in a
    // wide shot repeated on the same 12 m vertical period.
    ax = mix(ax, texture(uAlbedoArr, vec3(rzy * 0.415 + 7.13, 3.0)), macroMix);
    az = mix(az, texture(uAlbedoArr, vec3(rxy * 0.415 + 7.13, 3.0)), macroMix);
    vec4 sx = texture(uSurfArr, vec3(rzy, 3.0));
    vec4 sy = texture(uSurfArr, vec3(rxz, 3.0));
    vec4 sz = texture(uSurfArr, vec3(rxy, 3.0));
    alb[3] = ax * bw.x + ay * bw.y + az * bw.z;
    srf[3] = sx * bw.x + sy * bw.y + sz * bw.z;

    // the strata, runnels and per-massif colour were all resolved above so
    // that the far LOD gets them too; here they simply modulate the sampled
    // rock tile, and the bed alpha pushes bedded rock up in the height blend
    alb[3].rgb *= rockTint;
    alb[3].a = mix(alb[3].a, alb[3].a * (0.7 + 0.45 * bedA), cliffAmt);
    // the same veneer argument as the far path: dirt and gravel on a steep
    // face take the colour of the bed they are sitting on
    vec3 through = mix(vec3(1.0), rockTint, bedThrough);
    alb[1].rgb *= through;
    alb[2].rgb *= through;

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
    float dAmtA = (1.0 - smoothstep(14.0, 90.0, vTDist)) * uMicro;
    float dAmtB = (1.0 - smoothstep(90.0, 420.0, vTDist)) * uMicro;
    vec3 dnA = texture(uDetailArr, vec3(wj * uDetailScale, 0.0)).xyz * 2.0 - 1.0;
    vec3 dnC = texture(uDetailArr, vec3(wj * uDetailScale * 0.37 + 0.71, 0.0)).xyz * 2.0 - 1.0;
    vec3 dnB = texture(uDetailArr, vec3(wj * uDetailScale * 0.085 + 0.37, 0.0)).xyz * 2.0 - 1.0;
    tnXY += dnA.xy * 0.55 * dAmtA + dnC.xy * 0.34 * dAmtB + dnB.xy * 0.22 * dAmtB;
    // hard clamp: an over-tilted tangent normal turns ground into torn foil
    tnXY = clamp(tnXY, vec2(-0.95), vec2(0.95));

    // Close-range albedo detail. The layer tiles are 3-12 m, so a metre from
    // the camera they are magnified into mush; this puts pebble-and-crack
    // scale contrast back into the colour, not just the normal.
    float grit = texture(uDetailArr, vec3(wj * uDetailScale * 2.9, 0.0)).a;
    float pebA = texture(uDetailArr, vec3(wj * uDetailScale, 0.0)).a;
    float micro = mix(1.0, 0.78 + 0.46 * pebA, dAmtA * 0.8)
                * mix(1.0, 0.86 + 0.28 * grit, (1.0 - smoothstep(2.0, 16.0, vTDist)) * 0.85);

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
  tfRough = clamp(rgh, mix(0.35, 0.045, wet), 1.0);
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
    uWet: { value: new THREE.Vector4(0, 1, 0, 0) },
  };
}

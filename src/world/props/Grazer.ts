import * as THREE from 'three';
import { tube, mergeParts, col, mix, smooth, rigMaterial, RIG_PREAMBLE } from './CreatureGeo.ts';

/**
 * The ambient garula — the grazing herds of the Leide flats and the Duscae
 * downs.
 *
 * This is the same animal as `characters/enemies/Garula.js`, drawn for a
 * different job. The enemy is a skinned rig you fight at four metres; this one
 * is eighty head in a single instanced draw call, read at forty to a hundred
 * and fifty metres. What survives that distance is exactly three things — the
 * mass over the shoulders, the flat tusked head slung low in front of it, and
 * daylight under four pillar legs — so those are the three things this model
 * spends its triangles on. The proportions, the mane over the withers and the
 * upward-hooking tusks are lifted straight off the enemy so the herd on the
 * horizon and the boss in the frame are recognisably one species.
 *
 * Everything moves, and none of it costs the CPU anything. The animals are
 * articulated in the vertex shader off two attributes: a per-vertex
 * `arig = (region, weight)` binding and a per-instance `aanim` carrying the
 * animal's phase. A closed-form cycle decides whether it is cropping grass
 * with its head down or has lifted it to walk a few paces, and the same cycle
 * — evaluated identically on the CPU by {@link walkCycle} — moves the
 * instance matrix, so the feet swing when and only when the animal advances.
 */

// ----------------------------------------------------------------- palette

// Sun-bleached, dusty and desaturated: at eighty metres through Leide haze an
// animal the colour of the enemy Garula's hide reads as a black hole in the
// frame. The herd is the same species seen through a hundred metres of dust,
// so everything is lifted two stops and pushed towards the ground it stands on.
// Hide albedo, not "how it looks in the frame": a garula's coat is a dark
// russet, and under a Leide noon the tone map lifts it two stops on its own.
// Authoring it as light as it *reads* blows the whole animal out to a
// marshmallow the moment the sun is on it.
const HIDE = 0x60452c;          // russet flank
const HIDE_LIT = 0x805e3a;      // sun-bleached along the spine
const HIDE_DARK = 0x38251a;
const SHAG = 0x805a2c;          // the straw ruff over withers and neck
const SHAG_LIT = 0x9c7440;
const SHAG_DARK = 0x453218;
const BELLY = 0x473726;
const TUSK = 0xd6c9a4;
const TUSK_DARK = 0x94875f;
const HOOF = 0x2b2620;

// ------------------------------------------------------------------- rig

/** Rig regions. Region 0 is the torso and never rotates on its own. */
const R_BODY = 0, R_HEAD = 1, R_TAIL = 2;
const R_FL = 3, R_FR = 4, R_BL = 5, R_BR = 6;

const BODY_PIVOT = [0, 1.94, -1.05];
const NECK_PIVOT = [0, 2.10, 0.74];
const TAIL_PIVOT = [0, 1.96, -1.62];
const FSH = [0.54, 2.16, 0.42];      // fore shoulder, mirrored in x
const BHP = [0.50, 2.02, -1.20];     // hind hip

/** Strides taken per walk burst, shared by the shader and the CPU drift. */
export const STRIDES = 3.0;
/** Peak fore/aft leg swing, radians. */
const SWING = 0.30;
/** Ground covered per full animation cycle at scale 1, metres. */
export const CYCLE_DISTANCE = 3.3;

/**
 * The walk cycle, evaluated on the CPU exactly as the vertex shader does it.
 *
 * `s` ramps 0→1 through the walk burst and is the animal's progress along the
 * ground; `gate` peaks mid-burst and is how hard the legs are swinging. The
 * instance matrix advances by `s`, so a garula's feet only move while the
 * garula does.
 *
 * @param t seconds
 * @param phase per-animal phase offset
 * @param rate cycles per second
 */
export function walkCycle(t: number, phase: number, rate: number): {u:number, s:number, gate:number} {
  const u = t * rate + phase;
  const s = smooth(0.70, 0.97, u - Math.floor(u));
  return { u, s, gate: 4 * s * (1 - s) };
}

// -------------------------------------------------------------- geometry

/**
 * Coat mottling, 0..1.
 *
 * Driven off the *section* coordinates rather than world position. A low-poly
 * barrel lays its vertices out in rings, so a pattern in (th, u) puts one clump
 * every few vertices and actually shows; a world-space noise lands between
 * vertices and averages back out to a flat wash.
 */
function fur(th: number, u: number) {
  return 0.5 + 0.5 * Math.sin(th * 5.0 + u * 9.0) * Math.sin(th * 11.0 - u * 27.0);
}

/**
 * Build the merged, rig-tagged garula body.
 */
export function garulaGeometry(): THREE.BufferGeometry {
  const parts = [];

  /* ------------------------------------------------------------ torso -- */
  // One continuous barrel: deepest just behind the shoulder, tapering to a
  // small rump. The mane over the withers is a raised mass in the section
  // profile rather than added geometry, so it costs nothing.
  parts.push(tube({
    nodes: [
      { p: [0, 1.86, -1.78], r: 0.40, rz: 0.42 },
      { p: [0, 1.96, -1.34], r: 0.64, rz: 0.68 },
      { p: [0, 2.02, -0.74], r: 0.72, rz: 0.80 },
      { p: [0, 2.06, -0.12], r: 0.79, rz: 0.92 },
      { p: [0, 2.08, 0.46], r: 0.83, rz: 1.01 },
      { p: [0, 2.06, 0.88], r: 0.68, rz: 0.82 },
      { p: [0, 2.02, 1.08], r: 0.46, rz: 0.56 },
    ],
    steps: 20, seg: 15, ref: [0, 1, 0], capStart: 0.75, capEnd: 0.30,
    region: R_BODY,
    shape: (th, u) => {
      const b = Math.cos(th);                       // +1 spine, -1 belly
      const side = Math.abs(Math.sin(th));
      let m = 1;
      // withers mane: the highest point of the animal, and deliberately
      // ragged — the clumping is what makes a shaggy animal read as shaggy
      // instead of as an upholstered sofa, and doing it in the section costs
      // nothing where hanging locks of geometry cost silhouette and triangles
      const mane = Math.max(0, b) * Math.exp(-Math.pow((u - 0.74) / 0.22, 2));
      m += mane * (0.22 + Math.sin(th * 6 + u * 9) * 0.075
        + Math.sin(th * 13 - u * 21) * 0.035);
      // flat back, sagging gut
      m += b > 0 ? -0.05 * b * b * (1 - smooth(0.60, 0.80, u)) : 0.10 * b * b;
      // shoulder and haunch bosses
      m += side * 0.09 * Math.exp(-Math.pow((u - 0.80) / 0.13, 2));
      m += side * 0.08 * Math.exp(-Math.pow((u - 0.22) / 0.16, 2));
      // coarse shag hanging off the flank
      m += Math.max(0, -b + 0.45) * side * 0.05
        * Math.max(0, Math.sin(th * 12 + u * 6)) * smooth(0.25, 0.60, u);
      // and a fine clumping over the whole coat: shallow enough not to touch
      // the silhouette, deep enough that the key light breaks up across it
      m += Math.sin(th * 9 + u * 13) * Math.sin(u * 31) * 0.018;
      return m;
    },
    colorAt: (th, u, p) => {
      const b = Math.cos(th);
      const f = fur(th, u);
      // countershading: bleached along the spine, mid on the flank, deep
      // shadow-brown under the gut, with the pale ruff over the withers
      const hide = mix(mix(HIDE, HIDE_LIT, smooth(-0.1, 0.85, b) * (0.35 + f * 0.5))
        .getHex(THREE.SRGBColorSpace), BELLY, smooth(-0.15, -0.85, b));
      const ruff = smooth(-0.20, 0.7, b) * smooth(0.30, 0.62, u);
      return mix(hide.getHex(THREE.SRGBColorSpace),
        mix(SHAG, SHAG_LIT, f).getHex(THREE.SRGBColorSpace), ruff * 0.9);
    },
  }));

  /* ------------------------------------------------------- neck and head */
  // Slung low and forward — this animal grazes, so its head hangs below the
  // line of its back even at rest.
  const neckBlend = (p: any) => smooth(0.70, 1.16, p.z);
  parts.push(tube({
    nodes: [
      { p: [0, 2.12, 0.72], r: 0.56, rz: 0.58 },
      { p: [0, 1.98, 1.06], r: 0.47, rz: 0.48 },
      { p: [0, 1.80, 1.36], r: 0.39, rz: 0.40 },
    ],
    steps: 8, seg: 12, ref: [0, 1, 0], region: R_HEAD, blendAt: neckBlend,
    shape: (th, u) => {
      const b = Math.cos(th);
      // crest of mane on top, loose dewlap swinging underneath
      return 1 + Math.max(0, b) * 0.24 * (1 - u * 0.3)
        + Math.max(0, -b) * 0.22 * smooth(0.10, 0.70, u)
        + Math.max(0, b) * Math.sin(th * 9) * 0.05;
    },
    colorAt: (th, u, p) => (Math.cos(th) > -0.1
      ? mix(SHAG, SHAG_LIT, 0.2 + 0.6 * fur(th, u))
      : mix(HIDE, BELLY, smooth(0.2, 0.8, u) * 0.6)),
  }));
  // skull: broad and flat-faced, the snout dropping below it
  parts.push(tube({
    nodes: [
      { p: [0, 1.78, 1.32], r: 0.36, rz: 0.34 },
      { p: [0, 1.70, 1.62], r: 0.42, rz: 0.34 },
      { p: [0, 1.62, 1.88], r: 0.40, rz: 0.30 },
      { p: [0, 1.52, 2.06], r: 0.28, rz: 0.22 },
    ],
    steps: 9, seg: 12, ref: [0, 1, 0], capEnd: 0.35, region: R_HEAD, blendAt: neckBlend,
    shape: (th, u) => {
      const b = Math.cos(th);
      // flat crown, heavy jaw, cheek slabs
      return 1 - Math.max(0, b) * 0.14 + Math.max(0, -b) * 0.10
        + Math.abs(Math.sin(th)) * 0.10 * Math.exp(-Math.pow((u - 0.45) / 0.3, 2));
    },
    colorAt: (th, u, p) => {
      const b = Math.cos(th);
      if (u > 0.90) return mix(HIDE_DARK, 0x2e2620, 0.5);          // nose pad
      // the ruff runs up over the crown; the flat face plate is bare hide,
      // pale enough to catch the key light and show which way the head points
      return b > 0.1
        ? mix(mix(SHAG, HIDE_LIT, 0.45).getHex(THREE.SRGBColorSpace), SHAG_DARK, fur(th, u) * 0.35)
        : mix(HIDE, HIDE_LIT, 0.35 - fur(th, u) * 0.25);
    },
  }));
  for (const s of [-1, 1]) {
    // tusk: forward out of the lip, then hooking hard up. The one element
    // that reads instantly at thirty metres.
    parts.push(tube({
      nodes: [
        { p: [s * 0.26, 1.52, 1.76], r: 0.085 },
        { p: [s * 0.31, 1.50, 2.06], r: 0.068 },
        { p: [s * 0.35, 1.62, 2.28], r: 0.048 },
        { p: [s * 0.37, 1.84, 2.30], r: 0.028 },
        { p: [s * 0.38, 2.00, 2.18], r: 0.010 },
      ],
      steps: 9, seg: 6, ref: [1, 0, 0], capEnd: 0.6, region: R_HEAD, blendAt: () => 1,
      colorAt: (th, u) => mix(TUSK_DARK, TUSK, smooth(0.0, 0.5, u)),
    }));
    // ear, half lost in the mane
    parts.push(tube({
      nodes: [
        { p: [s * 0.30, 1.86, 1.34], r: 0.09, rz: 0.04 },
        { p: [s * 0.42, 1.90, 1.22], r: 0.06, rz: 0.03 },
        { p: [s * 0.50, 1.88, 1.12], r: 0.015, rz: 0.01 },
      ],
      steps: 3, seg: 5, ref: [0, 1, 0], capEnd: 0.5, region: R_HEAD, blendAt: () => 1,
      colorAt: (th, u) => mix(SHAG_DARK, HIDE, u * 0.4),
    }));
    // eye set far out on the corner of the face
    parts.push(tube({
      nodes: [
        { p: [s * 0.34, 1.70, 1.66], r: 0.055 },
        { p: [s * 0.40, 1.70, 1.68], r: 0.030 },
      ],
      steps: 1, seg: 5, ref: [0, 1, 0], capEnd: 0.7, region: R_HEAD, blendAt: () => 1,
      colorAt: () => col(0x171009),
    }));
  }

  /* -------------------------------------------------------------- legs -- */
  const legColor = (th: any, u: any, p: any) => {
    if (p.y < 0.28) return mix(HOOF, HIDE_DARK, smooth(0.28, 0.16, p.y) * 0.2);
    const feather = 1 - smooth(0.26, 0.52, u);
    return mix(mix(HIDE, HIDE_DARK, smooth(0.30, 0.95, u) * 0.75).getHex(THREE.SRGBColorSpace),
      SHAG_DARK, feather * 0.45 * (0.6 + fur(th, u) * 0.4));
  };
  const legShape = (th: number, u: number) => {
    const back = -Math.cos(th);
    return 1 + Math.max(0, back) * 0.26 * Math.exp(-Math.pow((u - 0.14) / 0.20, 2))
      + Math.max(0, back) * 0.10 * Math.exp(-Math.pow((u - 0.46) / 0.12, 2));
  };
  for (const s of [-1, 1]) {
    parts.push(tube({
      nodes: [
        { p: [s * FSH[0], FSH[1] + 0.06, FSH[2] - 0.02], r: 0.30, rz: 0.34 },
        { p: [s * 0.58, 1.72, 0.46], r: 0.26, rz: 0.30 },
        { p: [s * 0.60, 1.34, 0.44], r: 0.19, rz: 0.22 },
        { p: [s * 0.61, 0.88, 0.34], r: 0.165, rz: 0.18 },
        { p: [s * 0.62, 0.44, 0.34], r: 0.145, rz: 0.155 },
        { p: [s * 0.62, 0.14, 0.36], r: 0.165, rz: 0.175 },
      ],
      steps: 11, seg: 9, ref: [0, 0, 1], capEnd: 0.4,
      region: s < 0 ? R_FL : R_FR,
      blendAt: (p) => smooth(FSH[1] - 0.02, FSH[1] - 0.55, p.y),
      shape: legShape, colorAt: legColor,
    }));
    parts.push(tube({
      nodes: [
        { p: [s * BHP[0], BHP[1] + 0.06, BHP[2] + 0.02], r: 0.34, rz: 0.38 },
        { p: [s * 0.54, 1.58, -1.34], r: 0.29, rz: 0.33 },
        { p: [s * 0.56, 1.20, -1.46], r: 0.20, rz: 0.22 },
        { p: [s * 0.57, 0.80, -1.24], r: 0.165, rz: 0.18 },
        { p: [s * 0.58, 0.42, -1.18], r: 0.14, rz: 0.15 },
        { p: [s * 0.58, 0.14, -1.18], r: 0.16, rz: 0.17 },
      ],
      steps: 11, seg: 9, ref: [0, 0, 1], capEnd: 0.4,
      region: s < 0 ? R_BL : R_BR,
      blendAt: (p) => smooth(BHP[1] - 0.02, BHP[1] - 0.55, p.y),
      shape: legShape, colorAt: legColor,
    }));
  }

  /* -------------------------------------------------------------- tail -- */
  parts.push(tube({
    nodes: [
      { p: [0, 1.94, -1.66], r: 0.11 },
      { p: [0, 1.72, -1.84], r: 0.075 },
      { p: [0, 1.48, -1.92], r: 0.05 },
      { p: [0, 1.30, -1.94], r: 0.14 },
      { p: [0, 1.14, -1.94], r: 0.05 },
    ],
    steps: 10, seg: 7, ref: [1, 0, 0], capEnd: 0.6, region: R_TAIL,
    blendAt: (p) => smooth(1.96, 1.66, p.y),
    colorAt: (th, u) => mix(HIDE_DARK, SHAG_DARK, smooth(0.4, 0.75, u)),
  }));

  return mergeParts(parts);
}

// ---------------------------------------------------------------- shader

const V3 = (a: number[]) => `vec3(${a[0].toFixed(4)}, ${a[1].toFixed(4)}, ${a[2].toFixed(4)})`;

const RIG_GLSL = RIG_PREAMBLE + /* glsl */`
// aanim = (phase, cycle rate, alertness, coat brightness)
void creatureRig(out mat3 R, out vec3 P, out mat3 RB, out vec3 PB, out vec3 OFF) {
  float reg  = arig.x;
  float w    = arig.y;
  float ph   = aanim.x;
  float rate = aanim.y;
  float alert = aanim.z;

  float u    = uTime * rate + ph;
  float s    = smoothstep(0.70, 0.97, fract(u));
  float gate = 4.0 * s * (1.0 - s);
  // a second, slower cycle lifts the head to look around without walking
  float c2   = fract(uTime * rate * 0.37 + ph * 4.13);
  float look = smoothstep(0.64, 0.72, c2) - smoothstep(0.89, 0.97, c2);
  float head = clamp(max(gate, max(look, alert)), 0.0, 1.0);
  float graze = 1.0 - head;
  float strideT = s * 6.2831853 * ${STRIDES.toFixed(1)};

  PB  = ${V3(BODY_PIVOT)};
  RB  = hrX(graze * 0.085) * hrZ(sin(uTime * 0.63 + ph * 8.1) * 0.016);
  OFF = vec3(0.0, gate * 0.030 * abs(sin(strideT)) + sin(uTime * 0.8 + ph * 13.0) * 0.010, 0.0);

  R = mat3(1.0);
  P = vec3(0.0);

  if (reg < 0.5) return;                                        // torso

  if (reg < 1.5) {                                              // head + neck
    float crop  = sin(uTime * 1.9 + ph * 27.0);
    float pitch = graze * (0.60 + crop * 0.09) - head * 0.10;
    float yaw   = graze * sin(uTime * 0.31 + ph * 17.0) * 0.28
                + head  * sin(uTime * 0.85 + ph * 5.0) * 0.24;
    P = ${V3(NECK_PIVOT)};
    R = hrY(yaw * w) * hrX(pitch * w);
    return;
  }

  if (reg < 2.5) {                                              // tail
    float ft    = fract(uTime * 0.21 + ph * 6.7);
    float flick = exp(-9.0 * ft) * sin(ft * 90.0);
    P = ${V3(TAIL_PIVOT)};
    R = hrY((sin(uTime * 1.15 + ph * 11.0) * 0.10 + flick * 0.60) * w)
      * hrX((sin(uTime * 0.7 + ph * 3.0) * 0.06 - flick * 0.25) * w);
    return;
  }

  // legs — diagonal pairs, plus a slow weight shift while standing
  float legPh = (reg < 3.5 || reg > 5.5) ? 0.0 : 3.1415927;
  float swing = gate * ${SWING.toFixed(3)} * sin(strideT + legPh)
              + (1.0 - gate) * sin(uTime * 0.45 + ph * 7.0 + legPh) * 0.022;
  float sx = (reg < 3.5 || (reg > 4.5 && reg < 5.5)) ? -1.0 : 1.0;
  vec3 hip = reg < 4.5 ? ${V3(FSH)} : ${V3(BHP)};
  P = vec3(hip.x * sx, hip.y, hip.z);
  R = hrX(swing * w);
}
`;

/**
 * Material set for the grazer herd: a lit surface plus a matching depth
 * material, so the animal's *shadow* grazes too instead of standing in the
 * bind pose while the animal's head is in the grass.
 *
 */
export function grazerMaterials(timeRef: {value:number}): {material:THREE.Material, depth:THREE.Material} {
  const material = rigMaterial(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.95, metalness: 0, vertexColors: true,
  }), timeRef, RIG_GLSL, { tint: true, key: 'grazer' });
  material.name = 'garula_grazer';
  const depth = rigMaterial(new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  }), timeRef, RIG_GLSL, { key: 'grazer' });
  depth.name = 'garula_grazer_depth';
  return { material, depth };
}

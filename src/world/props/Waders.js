import * as THREE from 'three';
import { tube, mergeParts, mix, smooth, rigMaterial, RIG_PREAMBLE } from './CreatureGeo.js';

/**
 * Waders — the long-legged birds that work the edge of every body of water in
 * Lucis.
 *
 * A lake with nothing standing in it reads as a texture. One line of pale
 * birds along the shallows, each of them still except for the one that just
 * stabbed at something, turns the same lake into a place. They are the cheapest
 * possible population: no drift, no flocking, no collision — each bird holds
 * its patch of mud and only its neck moves, which is exactly what a real heron
 * does for minutes at a time.
 *
 * Two thirds are pale egret-white so they read against dark water at two
 * hundred metres; the rest are grey-brown herons, produced from the same
 * geometry by the per-instance brightness in `aanim.w`.
 */

const PALE = 0xc9c4b4;
const PALE_LIT = 0xdedac9;
const SHADE = 0x8e8878;
const DARK = 0x4a463d;
const LEG = 0x453f34;
const BILL = 0x7d6733;

/** Rig regions. */
const W_BODY = 0, W_HEAD = 1;
const NECK_PIVOT = [0, 0.72, 0.10];

/**
 * Build the merged, rig-tagged wader.
 * @returns {THREE.BufferGeometry}
 */
export function waderGeometry() {
  const parts = [];

  // body: a deep teardrop carried level, tail tapering behind
  parts.push(tube({
    nodes: [
      { p: [0, 0.70, -0.40], r: 0.028, rz: 0.022 },
      { p: [0, 0.69, -0.22], r: 0.085, rz: 0.075 },
      { p: [0, 0.69, -0.02], r: 0.125, rz: 0.115 },
      { p: [0, 0.71, 0.14], r: 0.105, rz: 0.100 },
      { p: [0, 0.73, 0.24], r: 0.060, rz: 0.058 },
    ],
    steps: 12, seg: 10, ref: [0, 1, 0], capStart: 0.5, capEnd: 0.6, region: W_BODY,
    shape: (th, u) => {
      const b = Math.cos(th);
      // folded wing sitting proud of the flank, breast keel below
      return 1 + Math.abs(Math.sin(th)) * 0.12 * Math.exp(-Math.pow((u - 0.42) / 0.28, 2))
        + Math.max(0, -b) * 0.10 * smooth(0.25, 0.75, u);
    },
    colorAt: (th, u) => {
      const b = Math.cos(th);
      // dark primaries at the back of the folded wing, pale everywhere else
      if (u < 0.22) return mix(DARK, SHADE, smooth(0.0, 0.24, u));
      return mix(mix(PALE, PALE_LIT, Math.max(0, b)).getHex(THREE.SRGBColorSpace),
        SHADE, Math.abs(Math.sin(th)) * 0.35);
    },
  }));

  // legs: bare sticks with a backward hock, and a splayed foot in the mud
  for (const s of [-1, 1]) {
    parts.push(tube({
      nodes: [
        { p: [s * 0.048, 0.66, 0.00], r: 0.024 },
        { p: [s * 0.055, 0.44, 0.03], r: 0.016 },
        { p: [s * 0.058, 0.24, -0.02], r: 0.012 },
        { p: [s * 0.060, 0.04, 0.01], r: 0.011 },
      ],
      steps: 7, seg: 5, ref: [0, 0, 1], capEnd: 0.4, region: W_BODY,
      colorAt: (th, u) => mix(SHADE, LEG, smooth(0.05, 0.4, u)),
    }));
    parts.push(tube({
      nodes: [
        { p: [s * 0.060, 0.022, -0.03], r: 0.020, rz: 0.008 },
        { p: [s * 0.060, 0.018, 0.06], r: 0.014, rz: 0.006 },
      ],
      steps: 2, seg: 5, ref: [0, 1, 0], capEnd: 0.5, region: W_BODY,
      colorAt: () => mix(LEG, DARK, 0.4),
    }));
  }

  // neck: the S every wader stands in, straightening as it stabs
  const neckBlend = (p) => smooth(0.70, 0.92, p.y);
  parts.push(tube({
    nodes: [
      { p: [0, 0.72, 0.12], r: 0.055 },
      { p: [0, 0.84, 0.05], r: 0.036 },
      { p: [0, 0.96, 0.07], r: 0.030 },
      { p: [0, 1.03, 0.15], r: 0.034 },
    ],
    steps: 9, seg: 7, ref: [0, 0, 1], region: W_HEAD, blendAt: neckBlend,
    colorAt: (th, u) => mix(PALE, SHADE, 0.2 + Math.max(0, -Math.cos(th)) * 0.3 * u),
  }));
  parts.push(tube({
    nodes: [
      { p: [0, 1.03, 0.13], r: 0.045, rz: 0.042 },
      { p: [0, 1.02, 0.22], r: 0.036, rz: 0.034 },
      { p: [0, 1.00, 0.28], r: 0.022, rz: 0.020 },
    ],
    steps: 4, seg: 7, ref: [0, 1, 0], capStart: 0.5, capEnd: 0.3,
    region: W_HEAD, blendAt: () => 1,
    colorAt: (th, u) => (u > 0.7 ? mix(BILL, SHADE, 0.3) : mix(PALE_LIT, DARK, Math.max(0, Math.cos(th)) * 0.45)),
  }));
  // bill
  parts.push(tube({
    nodes: [
      { p: [0, 1.00, 0.26], r: 0.020, rz: 0.017 },
      { p: [0, 0.985, 0.38], r: 0.010, rz: 0.009 },
      { p: [0, 0.972, 0.50], r: 0.003, rz: 0.003 },
    ],
    steps: 4, seg: 5, ref: [0, 1, 0], capEnd: 0.6, region: W_HEAD, blendAt: () => 1,
    colorAt: (th, u) => mix(BILL, DARK, smooth(0.2, 1.0, u) * 0.6),
  }));

  return mergeParts(parts);
}

// ---------------------------------------------------------------- shader

const V3 = (a) => `vec3(${a[0].toFixed(4)}, ${a[1].toFixed(4)}, ${a[2].toFixed(4)})`;

const RIG_GLSL = RIG_PREAMBLE + /* glsl */`
// aanim = (phase, stab rate, spare, plumage brightness)
void creatureRig(out mat3 R, out vec3 P, out mat3 RB, out vec3 PB, out vec3 OFF) {
  float reg  = arig.x;
  float w    = arig.y;
  float ph   = aanim.x;
  float rate = aanim.y;

  // the bird's whole weight shifts from one leg to the other, very slowly
  PB  = vec3(0.0, 0.60, 0.0);
  RB  = hrZ(sin(uTime * 0.37 + ph * 7.3) * 0.035);
  OFF = vec3(0.0, 0.0, 0.0);
  R = mat3(1.0);
  P = vec3(0.0);
  if (reg < 0.5) return;

  // neck: held in its S and scanning, then a fast stab down and a slow lift
  float c    = fract(uTime * rate + ph);
  float stab = smoothstep(0.62, 0.665, c) - smoothstep(0.70, 0.86, c);
  float idle = sin(uTime * 0.44 + ph * 13.0) * 0.09;
  float pitch = stab * 1.30 + (1.0 - stab) * idle;
  float yaw   = (1.0 - stab) * sin(uTime * 0.26 + ph * 23.0) * 0.5;
  P = ${V3(NECK_PIVOT)};
  R = hrY(yaw * w) * hrX(pitch * w);
}
`;

/**
 * @param {{value:number}} timeRef
 * @returns {THREE.Material}
 */
export function waderMaterial(timeRef) {
  const m = rigMaterial(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.72, metalness: 0, vertexColors: true,
  }), timeRef, RIG_GLSL, { tint: true, key: 'wader' });
  m.name = 'wader';
  return m;
}

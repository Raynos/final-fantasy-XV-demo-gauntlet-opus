import * as THREE from 'three';
import {
  loft, circleCross, chamferCross, edgedCross, wrapCross,
  tube, slab, place, tint, glow, surf, merge,
} from './GeoKit.ts';
import { makeDataMap, normalFromHeight } from '../util/TextureGen.ts';

/**
 * Weapon definitions, procedural weapon geometry, the blue-crystal
 * materialisation shader and the Armiger phantom-weapon swarm.
 *
 * Each class has its own reach, combo timing and swing arc, which the combat
 * system reads directly — the arcs also drive the trail ribbons, so a
 * greatsword really does sweep a wider, slower band than the daggers.
 *
 * `motion` is the class' motion value: what one swing is worth to
 * `Stats.computeDamage`, before the per-step `dmg` multiplier. It is the only
 * place a weapon's *power* now lives — `damage` survives as the fallback for a
 * world booted with no RPG model behind it.
 */

/** @typedef {'sword'|'greatsword'|'polearm'|'daggers'|'firearm'} WeaponClass */

export const WEAPONS = {
  sword: {
    name: 'Engine Blade', reach: 2.05, damage: 118, poise: 22, motion: 1.05,
    // per-hit: windup, active, recovery (seconds) and the arc the blade sweeps
    combo: [
      { wind: 0.11, active: 0.13, rec: 0.16, arc: [-2.5, 0.9], axis: [0.10, 1, 0.15], tilt: 0.22, dmg: 1.0 },
      { wind: 0.09, active: 0.12, rec: 0.14, arc: [2.4, -0.8], axis: [-0.05, 1, -0.2], tilt: -0.3, dmg: 1.05 },
      { wind: 0.12, active: 0.13, rec: 0.15, arc: [-1.2, 1.9], axis: [1, 0.25, 0], tilt: 0.1, dmg: 1.1 },
      { wind: 0.15, active: 0.16, rec: 0.30, arc: [2.9, -1.4], axis: [0.2, 0.85, 0.4], tilt: 0.5, dmg: 1.6 },
    ],
    trail: { head: 0xbfe4ff, tail: 0x1b4fa8, life: 0.30, width: 1.0 },
    hitbox: 0.42,
  },
  greatsword: {
    name: 'Ultima Blade', reach: 2.6, damage: 226, poise: 60, motion: 2.00,
    combo: [
      { wind: 0.26, active: 0.20, rec: 0.34, arc: [-2.9, 1.3], axis: [0.05, 1, 0.1], tilt: 0.3, dmg: 1.0 },
      { wind: 0.30, active: 0.22, rec: 0.40, arc: [2.6, -1.5], axis: [1, 0.1, 0.15], tilt: -0.2, dmg: 1.25 },
      { wind: 0.38, active: 0.24, rec: 0.55, arc: [-0.4, 2.7], axis: [1, 0.0, 0], tilt: 0.0, dmg: 1.9 },
    ],
    trail: { head: 0xffd9a8, tail: 0x8a3a12, life: 0.42, width: 1.5 },
    hitbox: 0.72,
  },
  polearm: {
    name: 'Zwill Crossblade', reach: 3.1, damage: 96, poise: 18, motion: 0.85,
    combo: [
      { wind: 0.10, active: 0.10, rec: 0.13, arc: [0.2, 0.2], axis: [0, 1, 0], thrust: 1, tilt: 0, dmg: 0.9 },
      { wind: 0.09, active: 0.10, rec: 0.12, arc: [-2.2, 1.4], axis: [0, 1, 0], tilt: 0.05, dmg: 1.0 },
      { wind: 0.10, active: 0.11, rec: 0.14, arc: [2.4, -1.6], axis: [0, 1, 0], tilt: -0.05, dmg: 1.05 },
      { wind: 0.14, active: 0.14, rec: 0.26, arc: [-3.1, 3.1], axis: [0, 1, 0], tilt: 0, dmg: 1.4 },
    ],
    trail: { head: 0xcfe9ff, tail: 0x2a6ea8, life: 0.26, width: 0.85 },
    hitbox: 0.34,
  },
  daggers: {
    name: 'Auroral Kukris', reach: 1.35, damage: 62, poise: 8, motion: 0.55,
    combo: [
      { wind: 0.06, active: 0.07, rec: 0.07, arc: [-1.9, 0.7], axis: [0.2, 1, 0.1], tilt: 0.3, dmg: 0.85 },
      { wind: 0.05, active: 0.07, rec: 0.07, arc: [1.9, -0.7], axis: [-0.2, 1, -0.1], tilt: -0.3, dmg: 0.85 },
      { wind: 0.05, active: 0.06, rec: 0.07, arc: [-1.4, 1.4], axis: [1, 0.3, 0], tilt: 0.5, dmg: 0.9 },
      { wind: 0.05, active: 0.06, rec: 0.07, arc: [1.4, -1.4], axis: [1, -0.3, 0], tilt: -0.5, dmg: 0.9 },
      { wind: 0.10, active: 0.12, rec: 0.24, arc: [-3.0, 3.0], axis: [0.1, 1, 0], tilt: 0.1, dmg: 1.5 },
    ],
    trail: { head: 0xd8fff2, tail: 0x1c8f7a, life: 0.20, width: 0.6 },
    hitbox: 0.28,
  },
  firearm: {
    name: 'Quicksilver', reach: 26, damage: 44, poise: 4, ranged: true, motion: 0.40,
    combo: [
      { wind: 0.05, active: 0.02, rec: 0.11, arc: [0, 0], axis: [0, 1, 0], shoot: 1, tilt: 0, dmg: 1.0 },
      { wind: 0.04, active: 0.02, rec: 0.11, arc: [0, 0], axis: [0, 1, 0], shoot: 1, tilt: 0, dmg: 1.0 },
      { wind: 0.04, active: 0.02, rec: 0.22, arc: [0, 0], axis: [0, 1, 0], shoot: 1, tilt: 0, dmg: 1.4 },
    ],
    trail: { head: 0xffe2b0, tail: 0x904a10, life: 0.10, width: 0.3 },
    hitbox: 0.16,
  },
};

/* -------------------------------------------------------------- geometry */

/**
 * ## Authoring convention
 *
 * **`y = 0` is the point the main hand closes around** — not the crossguard.
 * The blade runs +Y, the cutting edge faces +X, the flats face ±Z, and
 * everything below the fist (the lower grip, the pommel) is negative Y.
 *
 * This is load-bearing. Every socket in the game — `Character.attach.handR`,
 * `PartyAI._equip`, the `CombatSystem` weapon anchor — puts the *origin* of a
 * weapon in the hand. While the origin was the crossguard, 7–50 cm of grip and
 * pommel hung in mid air below the fist, which is exactly the "weapons float
 * detached from the hands" read across forty screenshots. Moving an origin
 * moves that weapon relative to every hand in the game: if you re-author one
 * of these, keep the fist at y = 0 and update `WEAPON_ANCHORS` in the same
 * edit.
 *
 * The firearm is the one exception in orientation. A pistol's *grip* is what
 * the hand holds, so its grip runs down −Y from the origin and the slide and
 * barrel run along +Z; its anchors say so.
 */

// Neutral-to-warm, deliberately. These are near-metals lit almost entirely by
// a *blue* sky env map, so a cool base (the old 0x8e97a1 had b - r = +0x13)
// reinforced the tint instead of cancelling it and every blade read navy.
const STEEL_HI = 0xc8c7c1;     // polished flats and bevels
const STEEL = 0x9e9b94;        // general blade body
const STEEL_LO = 0x66635c;     // fuller floors, spines, shadowed grinds
const IRON = 0x3a3e46;         // dark furniture
const BLACKOX = 0x1b1d22;      // blued / oxidised parts
const BRONZE = 0x8f6a34;
const BRASS = 0xc09648;
const LEATHER = 0x2a2018;
const GUNMETAL = 0x2c313a;
const AMBER = 0xff8c1e;
const LUCII = 0x3d94dd;        // the royal blue every Lucian arm carries

/**
 * Loft a blade and tint it *across its width* rather than flat.
 *
 * A blade is not one colour. The secondary bevel is a freshly ground strip
 * that throws back nearly everything; the primary face is duller; the fuller
 * floor and the spine sit in their own shadow. Painting one hex over the whole
 * thing and leaving the shader to find the difference does not work, because a
 * polished metal under a sky env returns nearly the same value from every
 * facet — the flat blue plane the critic saw. This bakes the gradient in.
 *
 * The colour is keyed off the **cross-section index**, not the world x of the
 * vertex, because a swept blade (the kukri, the axe bit) carries a `dx` far
 * larger than its own half-width and world x would read the sweep as the
 * grind. `loft` emits vertices section-major, so `i % cross.length` recovers
 * exactly which point of the profile a vertex came from; the trailing cap
 * centres fall through to the body colour.
 *
 * @param {Array<[number,number]>} cross section, cutting edge on +X
 * @param {Array<object>} sections loft sections
 * @param {number} edge colour at the cutting edge
 * @param {number} body colour across the primary face
 * @param {number} [spine] colour at the −X side (defaults to `body`)
 */
function groundBlade(cross, sections, edge, body, spine = body) {
  const geo = loft(cross, sections);
  const n = cross.length;
  const p = geo.attributes.position;
  const rows = Math.floor(p.count / n);
  const cE = new THREE.Color(edge), cB = new THREE.Color(body), cS = new THREE.Color(spine);
  const arr = new Float32Array(p.count * 3);
  const t = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const k = i < rows * n ? THREE.MathUtils.clamp(cross[i % n][0], -1, 1) : 0;
    t.copy(cB).lerp(k >= 0 ? cE : cS, Math.pow(Math.abs(k), 1.5));
    arr[i * 3] = t.r; arr[i * 3 + 1] = t.g; arr[i * 3 + 2] = t.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  // faceted last: `toNonIndexed` carries the colour attribute through
  return faceted(geo);
}

/** Faceted shading: every triangle keeps its own plane normal. */
function faceted(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.computeVertexNormals();
  return g;
}

/**
 * A leather- or cord-wrapped grip: a lobed section screwed up +Y so the ridges
 * wind round it. `turns` is how many times a ridge travels the circumference
 * over the length — that helix is what reads as wrapping rather than as a
 * ribbed rubber tube, and the ridges catch the rim light that tells you a hand
 * belongs there.
 */
function wrappedGrip(y0, y1, r0, r1,
  { flat = 0.76, turns = 2.6, lobes = 4, steps = 16, waist = 0.10 } = {}) {
  const secs = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = THREE.MathUtils.lerp(r0, r1, t) * (1 - waist * Math.sin(t * Math.PI));
    secs.push({
      y: THREE.MathUtils.lerp(y0, y1, t),
      sx: r, sz: r * flat, rot: t * turns * Math.PI * 2,
    });
  }
  return loft(wrapCross(12, lobes, 0.17), secs);
}

/** Noctis' Engine Blade: slim, single-edged, a machined engine block at the guard. */
export function swordGeometry() {
  const parts = [];

  // --- blade: 84 cm of 59 x 12 mm single-edged steel, fuller near the spine
  const sec = edgedCross({
    edge: 0.05, bevel: 0.14, bevelRise: 0.42, ridge: 0.44,
    fuller: 0.56, fullerAt: -0.34, fullerW: 0.18, spine: 0.84,
  });
  const blade = groundBlade(sec, [
    { y: 0.186, sx: 0.0268, sz: 0.0063 },
    { y: 0.250, sx: 0.0296, sz: 0.0061 },
    { y: 0.480, sx: 0.0294, sz: 0.0058 },
    { y: 0.700, sx: 0.0286, sz: 0.0054 },
    { y: 0.860, sx: 0.0268, sz: 0.0050 },
    { y: 0.945, sx: 0.0234, sz: 0.0045 },
    { y: 0.992, sx: 0.0192, sz: 0.0038, dx: 0.0030 },
    { y: 1.024, sx: 0.0108, sz: 0.0025, dx: 0.0078 },
    { y: 1.048, sx: 0.0018, sz: 0.0007, dx: 0.0120 },
  ], STEEL_HI, STEEL, STEEL_LO);
  parts.push(blade);

  // The Lucian blue lives *in* the fuller, recessed below the faces, so it
  // reads as a line drawn along the blade rather than a painted stripe.
  const inlay = loft(chamferCross(0.42), [
    { y: 0.240, sx: 0.0026, sz: 0.0030, dx: -0.0100 },
    { y: 0.900, sx: 0.0021, sz: 0.0025, dx: -0.0097 },
  ]);
  parts.push(glow(tint(inlay, 0x11284a), LUCII, 0.55));

  // --- engine block above the guard: a milled housing with piston pots
  const block = faceted(loft(chamferCross(0.30), [
    { y: 0.106, sx: 0.0250, sz: 0.0180 },
    { y: 0.124, sx: 0.0268, sz: 0.0192 },
    { y: 0.168, sx: 0.0262, sz: 0.0186 },
    { y: 0.186, sx: 0.0190, sz: 0.0128 },
  ]));
  parts.push(tint(block, IRON, 0.05));
  for (let i = 0; i < 3; i++) {
    const y = 0.124 + i * 0.021;
    for (const sg of [1, -1]) {
      const pot = place(loft(circleCross(8), [
        { y: 0.0000, sx: 0.0068 }, { y: 0.0055, sx: 0.0072 }, { y: 0.0100, sx: 0.0050 },
      ]), { pos: [0, y, sg * 0.0180], rot: [sg > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0] });
      parts.push(tint(pot, i === 1 ? BRASS : 0x8d949d, 0.04));
    }
  }
  const port = place(slab(0.030, 0.012, 0.008, 0.002), { pos: [0, 0.152, 0.020] });
  parts.push(glow(tint(port, 0x39230c), AMBER, 0.32));

  // --- crossguard: a compact angular cross-piece, not a pair of gold wings
  const guard = place(slab(0.108, 0.030, 0.032, 0.006), { pos: [0, 0.090, 0] });
  parts.push(tint(guard, IRON));
  const quillon = (side) => place(faceted(loft(chamferCross(0.36), [
    { y: 0.000, sx: 0.0130, sz: 0.0150 },
    { y: 0.020, sx: 0.0110, sz: 0.0125 },
    { y: 0.034, sx: 0.0042, sz: 0.0050 },
  ])), { pos: [side * 0.052, 0.088, 0], rot: [0, 0, side * -Math.PI * 0.5] });
  parts.push(tint(quillon(1), 0x4a4f58), tint(quillon(-1), 0x4a4f58));

  // ferrule between guard and grip
  const ferrule = faceted(loft(chamferCross(0.34), [
    { y: 0.050, sx: 0.0150, sz: 0.0118 },
    { y: 0.075, sx: 0.0162, sz: 0.0126 },
  ]));
  parts.push(tint(ferrule, BRASS, 0.05));

  parts.push(surf(tint(wrappedGrip(-0.082, 0.050, 0.0134, 0.0128, { turns: 2.8 }), LEATHER, 0.05), 0.84, 0));

  // --- pommel: a faceted block with the crystal core set into both cheeks
  const pommel = faceted(loft(chamferCross(0.34), [
    { y: -0.082, sx: 0.0160, sz: 0.0128 },
    { y: -0.100, sx: 0.0215, sz: 0.0172 },
    { y: -0.118, sx: 0.0182, sz: 0.0146 },
  ]));
  parts.push(tint(pommel, BRASS, 0.06));
  for (const sg of [1, -1]) {
    const core = place(faceted(loft(circleCross(6), [
      { y: -0.006, sx: 0.0058 }, { y: 0.000, sx: 0.0084 }, { y: 0.006, sx: 0.0050 },
    ])), { pos: [0, -0.100, sg * 0.0125], rot: [sg > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0] });
    parts.push(glow(tint(core, 0x10294c), LUCII, 0.60));
  }
  return merge(parts);
}

/** Gladiolus' greatsword: genuinely massive, but proportioned like a weapon. */
export function greatswordGeometry() {
  const parts = [];

  // --- blade: 1.33 m of 192 x 30 mm steel with a broad shallow fuller
  const sec = edgedCross({
    edge: 0.07, bevel: 0.17, bevelRise: 0.46, ridge: 0.54,
    fuller: 0.52, fullerAt: 0, fullerW: 0.36,
  });
  const blade = groundBlade(sec, [
    { y: 0.270, sx: 0.0790, sz: 0.0154 },
    { y: 0.360, sx: 0.0955, sz: 0.0150 },
    { y: 0.780, sx: 0.0960, sz: 0.0142 },
    { y: 1.160, sx: 0.0912, sz: 0.0130 },
    { y: 1.380, sx: 0.0820, sz: 0.0118 },
    { y: 1.490, sx: 0.0650, sz: 0.0100, dx: 0.006 },
    { y: 1.560, sx: 0.0360, sz: 0.0070, dx: 0.014 },
    { y: 1.600, sx: 0.0070, sz: 0.0026, dx: 0.020 },
  ], STEEL_HI, STEEL_LO, STEEL_HI);
  parts.push(blade);

  // bronze inlay laid into the fuller — the furniture metal, not a painted
  // emissive stripe. The old orange `spineGlow` was the stripe the critic saw.
  const inlay = loft(chamferCross(0.40), [
    { y: 0.340, sx: 0.0175, sz: 0.0092 },
    { y: 1.330, sx: 0.0130, sz: 0.0076 },
  ]);
  parts.push(tint(inlay, BRONZE, 0.06));

  // --- ricasso: a thick squared shoulder the blade grows out of
  const ricasso = faceted(loft(chamferCross(0.26), [
    { y: 0.150, sx: 0.0330, sz: 0.0210 },
    { y: 0.185, sx: 0.0360, sz: 0.0215 },
    { y: 0.248, sx: 0.0355, sz: 0.0198 },
    { y: 0.272, sx: 0.0700, sz: 0.0158 },
  ]));
  parts.push(tint(ricasso, 0x4c515a, 0.05));

  // --- crossbar: short, heavy, swept forward. Not a 400 mm slab.
  const bar = (side) => place(faceted(loft(chamferCross(0.32), [
    { y: 0.000, sx: 0.0230, sz: 0.0250 },
    { y: 0.048, sx: 0.0205, sz: 0.0215 },
    { y: 0.092, sx: 0.0175, sz: 0.0170 },
    { y: 0.116, sx: 0.0080, sz: 0.0080 },
  ])), { pos: [side * 0.026, 0.116, 0], rot: [0.16, 0, side * -Math.PI * 0.47] });
  parts.push(tint(bar(1), BRONZE, 0.05), tint(bar(-1), BRONZE, 0.05));
  const boss = place(slab(0.062, 0.062, 0.052, 0.010), { pos: [0, 0.118, 0] });
  parts.push(tint(boss, 0x3d424a));
  const collar = faceted(loft(chamferCross(0.30), [
    { y: 0.076, sx: 0.0250, sz: 0.0205 },
    { y: 0.096, sx: 0.0270, sz: 0.0220 },
  ]));
  parts.push(tint(collar, BRONZE, 0.05));

  // --- the long two-hand grip: lead hand at y = 0, off hand near -0.30
  parts.push(surf(tint(wrappedGrip(-0.380, 0.076, 0.0225, 0.0215,
    { turns: 6.2, steps: 26, waist: 0.05 }), LEATHER, 0.05), 0.84, 0));
  const band = (y) => faceted(loft(chamferCross(0.30), [
    { y: y - 0.008, sx: 0.0245, sz: 0.0198 },
    { y: y + 0.008, sx: 0.0245, sz: 0.0198 },
  ]));
  parts.push(tint(band(-0.140), BRONZE, 0.04), tint(band(-0.270), BRONZE, 0.04));

  // --- blunt weighted pommel
  const pommel = faceted(loft(chamferCross(0.30), [
    { y: -0.380, sx: 0.0240, sz: 0.0205 },
    { y: -0.412, sx: 0.0340, sz: 0.0290 },
    { y: -0.448, sx: 0.0270, sz: 0.0232 },
  ]));
  parts.push(tint(pommel, BRONZE, 0.06));
  return merge(parts);
}

/** A real spear: wrapped haft, langets, a fullered leaf head and a butt spike. */
export function polearmGeometry() {
  const parts = [];
  const haft = loft(circleCross(9), [
    { y: -0.920, sx: 0.0182 }, { y: -0.300, sx: 0.0196 },
    { y: 0.520, sx: 0.0200 }, { y: 1.020, sx: 0.0184 },
  ]);
  parts.push(surf(tint(haft, 0x4a3a26, 0.05), 0.74, 0));
  // wrapped section around the origin, where the lead hand closes
  parts.push(surf(tint(wrappedGrip(-0.120, 0.150, 0.0212, 0.0208,
    { flat: 1, turns: 3.0, waist: 0.03 }), LEATHER, 0.05), 0.84, 0));
  const ring = (y) => loft(chamferCross(0.34), [
    { y: y - 0.008, sx: 0.0222, sz: 0.0222 },
    { y: y + 0.008, sx: 0.0222, sz: 0.0222 },
  ]);
  parts.push(tint(ring(-0.135), BRONZE, 0.04), tint(ring(0.165), BRONZE, 0.04));

  // langets: two steel straps running up the haft into the head socket
  for (const sg of [1, -1]) {
    const lang = place(slab(0.014, 0.190, 0.008, 0.002), { pos: [sg * 0.0195, 0.945, 0] });
    parts.push(tint(lang, 0x878f99, 0.04));
  }
  const socket = faceted(loft(chamferCross(0.32), [
    { y: 1.020, sx: 0.0206, sz: 0.0206 },
    { y: 1.052, sx: 0.0242, sz: 0.0238 },
    { y: 1.100, sx: 0.0200, sz: 0.0180 },
  ]));
  parts.push(tint(socket, 0x8d959f, 0.05));

  const head = groundBlade(edgedCross({
    edge: 0.06, bevel: 0.16, bevelRise: 0.44, ridge: 0.46,
    fuller: 0.34, fullerAt: 0, fullerW: 0.24,
  }), [
    { y: 1.098, sx: 0.0180, sz: 0.0102 },
    { y: 1.155, sx: 0.0420, sz: 0.0108 },
    { y: 1.270, sx: 0.0470, sz: 0.0098 },
    { y: 1.420, sx: 0.0330, sz: 0.0072 },
    { y: 1.500, sx: 0.0140, sz: 0.0038 },
    { y: 1.530, sx: 0.0030, sz: 0.0012 },
  ], STEEL_HI, STEEL, STEEL_HI);
  parts.push(head);
  const crystal = place(faceted(loft(circleCross(6), [
    { y: -0.006, sx: 0.0062 }, { y: 0.000, sx: 0.0090 }, { y: 0.006, sx: 0.0054 },
  ])), { pos: [0, 1.072, 0.020], rot: [Math.PI / 2, 0, 0] });
  parts.push(glow(tint(crystal, 0x12294a), LUCII, 0.50));

  const butt = place(faceted(loft(chamferCross(0.34), [
    { y: 0.000, sx: 0.0200, sz: 0.0200 },
    { y: 0.030, sx: 0.0168, sz: 0.0168 },
    { y: 0.110, sx: 0.0026, sz: 0.0026 },
  ])), { pos: [0, -0.920, 0], rot: [Math.PI, 0, 0] });
  parts.push(tint(butt, 0x8d959f, 0.05));
  return merge(parts);
}

/** Single kukri-style dagger (the pair is two instances). */
export function daggerGeometry() {
  const parts = [];
  const sec = edgedCross({
    edge: 0.05, bevel: 0.20, bevelRise: 0.50, ridge: 0.52, spine: 0.88,
  });
  const blade = groundBlade(sec, [
    { y: 0.048, sx: 0.0165, sz: 0.0042 },
    { y: 0.082, sx: 0.0205, sz: 0.0040, dx: 0.0035 },   // choil
    { y: 0.150, sx: 0.0248, sz: 0.0037, dx: 0.0140 },
    { y: 0.235, sx: 0.0262, sz: 0.0033, dx: 0.0330 },
    { y: 0.300, sx: 0.0206, sz: 0.0027, dx: 0.0505 },
    { y: 0.336, sx: 0.0090, sz: 0.0015, dx: 0.0610 },
    { y: 0.352, sx: 0.0016, sz: 0.0006, dx: 0.0660 },
  ], STEEL_HI, STEEL, STEEL_LO);
  parts.push(blade);
  // the hollow-ground flat: a narrow bright line chasing the spine
  const flat = loft(chamferCross(0.40), [
    { y: 0.095, sx: 0.0020, sz: 0.0032, dx: -0.0088 },
    { y: 0.300, sx: 0.0016, sz: 0.0026, dx: 0.0410 },
  ]);
  parts.push(glow(tint(flat, 0x0f3a34), 0x30e0b8, 0.42));

  const bolster = faceted(loft(chamferCross(0.34), [
    { y: 0.022, sx: 0.0130, sz: 0.0098 },
    { y: 0.038, sx: 0.0182, sz: 0.0118 },
    { y: 0.050, sx: 0.0132, sz: 0.0086 },
  ]));
  parts.push(tint(bolster, IRON, 0.05));
  parts.push(surf(tint(wrappedGrip(-0.078, 0.022, 0.0112, 0.0118,
    { turns: 2.2, steps: 12 }), BLACKOX, 0.04), 0.70, 0));

  // finger-ring pommel — the tell that says kukri and not letter-opener
  const ringPts = [], ringR = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a) * 0.0135, -0.098 + Math.sin(a) * 0.0135, 0));
    ringR.push(0.0034);
  }
  parts.push(tint(tube(ringPts, ringR, { radialSeg: 5, capStart: false, capEnd: false }), IRON, 0.04));
  const neck = faceted(loft(chamferCross(0.34), [
    { y: -0.078, sx: 0.0110, sz: 0.0092 },
    { y: -0.090, sx: 0.0074, sz: 0.0066 },
  ]));
  parts.push(tint(neck, IRON, 0.04));
  return merge(parts);
}

/**
 * Prompto's Quicksilver: a real pistol. The grip runs down −Y from the fist
 * and the slide and barrel run along +Z — see the orientation note above.
 */
export function firearmGeometry() {
  const parts = [];

  // --- frame: the spine of the gun, backstrap forward under the slide
  const frame = place(slab(0.022, 0.034, 0.150, 0.004), { pos: [0, 0.050, 0.028] });
  parts.push(tint(frame, GUNMETAL, 0.04));
  const dust = place(slab(0.026, 0.014, 0.108, 0.003), { pos: [0, 0.062, 0.052] });
  parts.push(tint(dust, 0x3a4048, 0.04));

  // --- slide: the mass on top, with an ejection port and rear serrations
  const slide = faceted(loft(chamferCross(0.24), [
    { y: 0.080, sx: 0.0142, sz: 0.0850, dz: 0.0300 },
    { y: 0.100, sx: 0.0150, sz: 0.0860, dz: 0.0305 },
    { y: 0.114, sx: 0.0138, sz: 0.0855, dz: 0.0300 },
  ]));
  parts.push(tint(slide, 0x656d77, 0.05));
  const eject = place(slab(0.046, 0.016, 0.010, 0.002),
    { pos: [0.0125, 0.104, 0.052], rot: [0, Math.PI / 2, 0] });
  parts.push(tint(eject, BLACKOX));
  for (let i = 0; i < 5; i++) {
    const ser = place(slab(0.030, 0.026, 0.0035, 0.001),
      { pos: [0, 0.100, -0.030 + i * 0.0075], rot: [0, Math.PI / 2, 0] });
    parts.push(tint(ser, 0x4c535c));
  }

  // --- barrel and muzzle crown
  const barrel = place(loft(circleCross(10), [
    { y: 0.000, sx: 0.0088 }, { y: 0.052, sx: 0.0082 }, { y: 0.060, sx: 0.0092 },
  ]), { pos: [0, 0.0965, 0.112], rot: [Math.PI / 2, 0, 0] });
  parts.push(tint(barrel, 0x9aa2ab, 0.04));
  const bore = place(loft(circleCross(8), [{ y: 0, sx: 0.0044 }, { y: 0.010, sx: 0.0044 }]),
    { pos: [0, 0.0965, 0.160], rot: [Math.PI / 2, 0, 0] });
  parts.push(tint(bore, 0x0a0b0d));

  // --- sights, with a tritium dot on the front post
  parts.push(tint(place(slab(0.008, 0.010, 0.007, 0.001), { pos: [0, 0.121, 0.104] }), BLACKOX));
  parts.push(tint(place(slab(0.024, 0.010, 0.008, 0.001), { pos: [0, 0.121, -0.020] }), BLACKOX));
  parts.push(glow(tint(place(slab(0.0035, 0.0035, 0.004, 0.001),
    { pos: [0, 0.123, 0.106] }), 0x2a4a60), 0x66d9ff, 0.45));

  // --- hammer
  const hammer = place(faceted(loft(chamferCross(0.36), [
    { y: 0.000, sx: 0.0058, sz: 0.0090 },
    { y: 0.022, sx: 0.0052, sz: 0.0110 },
    { y: 0.030, sx: 0.0040, sz: 0.0062 },
  ])), { pos: [0, 0.092, -0.040], rot: [-0.42, 0, 0] });
  parts.push(tint(hammer, 0x545b64, 0.04));

  // --- trigger guard: a real loop, with a trigger inside it
  const guardPts = [], guardR = [];
  for (let i = 0; i <= 12; i++) {
    const a = -0.6 + (i / 12) * (Math.PI + 1.2);
    guardPts.push(new THREE.Vector3(0, 0.020 + Math.sin(a) * -0.026, 0.036 + Math.cos(a) * 0.028));
    guardR.push(0.0044);
  }
  parts.push(tint(tube(guardPts, guardR, { radialSeg: 5, flat: 1.3 }), GUNMETAL, 0.04));
  const trigger = place(slab(0.007, 0.026, 0.006, 0.001), { pos: [0, 0.024, 0.030], rot: [0.18, 0, 0] });
  parts.push(tint(trigger, 0x8d949c));

  // --- grip: checkered, raked back, magazine floorplate under it
  const gripSecs = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    gripSecs.push({
      y: 0.042 - t * 0.104,
      sx: 0.0155 + t * 0.0012,
      sz: 0.0230 - t * 0.0026,
      dz: -0.010 - t * 0.0225,
    });
  }
  parts.push(surf(tint(faceted(loft(wrapCross(12, 8, 0.11), gripSecs)), BLACKOX, 0.05), 0.62, 0));
  const floor = place(slab(0.036, 0.009, 0.052, 0.002), { pos: [0, -0.066, -0.033], rot: [0.23, 0, 0] });
  parts.push(tint(floor, 0x3c424a));
  const badge = place(slab(0.006, 0.014, 0.010, 0.001), { pos: [0.0155, -0.010, -0.024] });
  parts.push(glow(tint(badge, 0x33210c), AMBER, 0.30));
  return merge(parts);
}

/** Broad battle-axe — Armiger filler. Origin at the lead hand on the haft. */
export function axeGeometry() {
  const parts = [];
  const haft = loft(circleCross(8), [
    { y: -0.480, sx: 0.0185 }, { y: 0.100, sx: 0.0200 }, { y: 0.560, sx: 0.0192 },
  ]);
  parts.push(surf(tint(haft, 0x4a3a26, 0.05), 0.74, 0));
  parts.push(surf(tint(wrappedGrip(-0.110, 0.110, 0.0210, 0.0206,
    { flat: 1, turns: 2.6, steps: 12, waist: 0.03 }), LEATHER, 0.05), 0.84, 0));
  const head = groundBlade(edgedCross({ edge: 0.05, bevel: 0.22, bevelRise: 0.52, ridge: 0.58 }), [
    { y: 0.300, sx: 0.038, sz: 0.0180, dx: 0.026 },
    { y: 0.360, sx: 0.130, sz: 0.0190, dx: 0.108 },
    { y: 0.520, sx: 0.135, sz: 0.0175, dx: 0.112 },
    { y: 0.590, sx: 0.040, sz: 0.0120, dx: 0.030 },
  ], STEEL_HI, STEEL, STEEL_LO);
  parts.push(head);
  const eye = faceted(loft(chamferCross(0.30), [
    { y: 0.290, sx: 0.0270, sz: 0.0245 },
    { y: 0.600, sx: 0.0260, sz: 0.0235 },
  ]));
  parts.push(tint(eye, IRON, 0.05));
  const top = place(faceted(loft(chamferCross(0.34), [
    { y: 0.000, sx: 0.0180, sz: 0.0180 }, { y: 0.120, sx: 0.0026, sz: 0.0026 },
  ])), { pos: [0, 0.600, 0] });
  parts.push(tint(top, 0x9aa2ab, 0.04));
  const butt = place(faceted(loft(chamferCross(0.34), [
    { y: 0.000, sx: 0.0210, sz: 0.0210 }, { y: 0.048, sx: 0.0150, sz: 0.0150 },
  ])), { pos: [0, -0.528, 0] });
  parts.push(tint(butt, BRONZE, 0.04));
  return merge(parts);
}

/** Long lance — Armiger filler. Origin at the lead hand on the shaft. */
export function lanceGeometry() {
  const parts = [];
  const shaft = loft(circleCross(8), [
    { y: -0.860, sx: 0.0160 }, { y: 0.000, sx: 0.0182 }, { y: 1.180, sx: 0.0152 },
  ]);
  parts.push(tint(shaft, 0x3d434b, 0.05));
  parts.push(surf(tint(wrappedGrip(-0.130, 0.140, 0.0196, 0.0192,
    { flat: 1, turns: 3.0, steps: 12, waist: 0.03 }), LEATHER, 0.05), 0.84, 0));
  const head = groundBlade(edgedCross({
    edge: 0.05, bevel: 0.18, bevelRise: 0.46, ridge: 0.48,
    fuller: 0.32, fullerAt: 0, fullerW: 0.22,
  }), [
    { y: 1.175, sx: 0.0150, sz: 0.0086 },
    { y: 1.235, sx: 0.0380, sz: 0.0092 },
    { y: 1.420, sx: 0.0340, sz: 0.0080 },
    { y: 1.580, sx: 0.0140, sz: 0.0040 },
    { y: 1.620, sx: 0.0026, sz: 0.0011 },
  ], STEEL_HI, STEEL, STEEL_HI);
  parts.push(head);
  for (let i = 0; i < 3; i++) {
    const y = 0.34 + i * 0.28;
    const r = loft(chamferCross(0.34), [
      { y: y - 0.010, sx: 0.0215, sz: 0.0215 },
      { y: y + 0.010, sx: 0.0215, sz: 0.0215 },
    ]);
    parts.push(glow(tint(r, 0x1e3450), LUCII, 0.38));
  }
  const butt = place(faceted(loft(chamferCross(0.34), [
    { y: 0.000, sx: 0.0180, sz: 0.0180 }, { y: 0.070, sx: 0.0022, sz: 0.0022 },
  ])), { pos: [0, -0.860, 0], rot: [Math.PI, 0, 0] });
  parts.push(tint(butt, 0x8d959f, 0.04));
  return merge(parts);
}

export const WEAPON_GEOMETRY = {
  sword: swordGeometry,
  greatsword: greatswordGeometry,
  polearm: polearmGeometry,
  daggers: daggerGeometry,
  firearm: firearmGeometry,
  axe: axeGeometry,
  lance: lanceGeometry,
};

/**
 * Where the damaging part of each weapon starts and ends, in the weapon's own
 * frame. `CombatSystem` sweeps a capsule from `base` to `tip` for hit
 * detection and pushes the same pair into the trail ribbon; `_shoot` uses
 * `tip` as the muzzle.
 *
 * These used to be derived as `reach * 0.52`, which is a guess that happened
 * to land near the tip for the melee classes and was catastrophically wrong
 * for the gun: `firearm.reach` is 26 m, so every muzzle flash and tracer for
 * Prompto's pistol originated **13 metres above his head**. Authored now.
 */
export const WEAPON_ANCHORS = {
  sword: { base: [0, 0.190, 0], tip: [0.012, 1.048, 0] },
  greatsword: { base: [0, 0.270, 0], tip: [0.020, 1.600, 0] },
  polearm: { base: [0, 1.100, 0], tip: [0, 1.530, 0] },
  daggers: { base: [0, 0.050, 0], tip: [0.066, 0.352, 0] },
  firearm: { base: [0, 0.0965, 0.060], tip: [0, 0.0965, 0.168] },
  axe: { base: [0.02, 0.300, 0], tip: [0.110, 0.560, 0] },
  lance: { base: [0, 1.180, 0], tip: [0, 1.620, 0] },
};

/* --------------------------------------------------- materialise shader */

/**
 * Brushed-steel micro-surface, generated once and shared by every weapon.
 *
 * `metalness 0.84 / roughness 0.38` with no maps against the sky env RT is a
 * *mirror*: every facet returns nearly the same slice of sky, so the whole
 * blade renders as one flat blue plane. That is where the blue surfboard came
 * from. Fine anisotropic streaks running lengthwise break the reflection into
 * the stretched highlight that reads as ground steel, without needing a
 * `MeshPhysicalMaterial` anisotropy upgrade.
 *
 * The maps are module-level and shared so that **every weapon material stays
 * configuration-identical** — `CombatSystem._prebuildWeapons` relies on all
 * five classes sharing one compiled program, so a weapon swap costs a
 * visibility flip rather than a half-second stall.
 */
let STEEL_MAPS = null;
function steelMaps() {
  if (STEEL_MAPS) return STEEL_MAPS;
  const N = 256;
  const frac = (x) => x - Math.floor(x);
  // `p` is the tiling period in cells, so the streaks wrap cleanly in u
  const h1 = (i, p) => frac(Math.sin((((i % p) + p) % p) * 127.1 + p * 3.7) * 43758.5453);
  const vn = (x, p) => {
    const i = Math.floor(x), f = frac(x), s = f * f * (3 - 2 * f);
    return h1(i, p) * (1 - s) + h1(i + 1, p) * s;
  };
  // Variation across the blade, near-constant along it: a brushed streak.
  // The v terms must stay tiny — the loft's v runs the length of the blade,
  // so any real drift skews the streaks into visible corrugation instead of
  // a grind.
  const height = (u, v) => (
    0.58 * vn((u + v * 0.0016) * 17, 17) +
    0.30 * vn((u + v * 0.0026) * 43, 43) +
    0.12 * vn((u + v * 0.0040) * 97, 97)
  );
  STEEL_MAPS = {
    rough: makeDataMap(N, (u, v) => 0.32 + 0.62 * height(u, v)),
    norm: normalFromHeight(N, height, 0.30),
  };
  return STEEL_MAPS;
}

/**
 * Standard weapon material with a crystal materialisation dissolve.
 * `uReveal` runs 0 -> 1; below the threshold the metal is solid, at the
 * boundary a band of blue crystal light burns, above it nothing is drawn.
 */
export function makeWeaponMaterial() {
  const maps = steelMaps();
  // At metalness 0.90 the diffuse term is ~0, so a blade took its colour
  // *entirely* from `scene.environment` -- the blue sky PMREM -- and rendered
  // as one uniform navy plane with no edge highlight, no bevel line and no
  // fuller shading. The baked `groundBlade` gradient was invisible because it
  // only tints F0. Backing metalness off leaves a real diffuse term for the
  // warm sun to pick up, and the lower roughness lets it throw a specular line
  // along the bevel rather than smearing it across the whole flat.
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0.76,
    emissive: 0x000000, roughnessMap: maps.rough, normalMap: maps.norm,
    envMapIntensity: 0.82,
  });
  mat.normalScale.set(0.16, 0.16);
  const uniforms = { uReveal: { value: 1 }, uEdge: { value: new THREE.Color(0x4fb6ff) } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = uniforms.uReveal;
    shader.uniforms.uEdge = uniforms.uEdge;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        '#include <common>\nattribute vec3 aEmissive;\nattribute vec2 aSurf;\n'
        + 'varying vec3 vEmissive;\nvarying vec2 vSurf;\nvarying float vLocalY;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvEmissive = aEmissive;\nvSurf = aSurf;\nvLocalY = position.y;');
    shader.fragmentShader = shader.fragmentShader
      // per-vertex surface: the brushed-steel roughness map only applies where
      // the part is actually metal; leather, wood and polymer take their own
      .replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(vSurf.x, roughnessFactor, vSurf.y);')
      .replace('#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor *= vSurf.y;')
      .replace('#include <common>',
        '#include <common>\nvarying vec3 vEmissive;\nvarying vec2 vSurf;\nvarying float vLocalY;\nuniform float uReveal;\nuniform vec3 uEdge;')
      .replace('#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
         float rev = mix(-0.95, 2.4, uReveal);
         if (vLocalY > rev) discard;`)
      .replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float band = smoothstep(0.30, 0.0, mix(-0.95, 2.4, uReveal) - vLocalY);
         totalEmissiveRadiance += vEmissive + uEdge * band * 6.0;`);
  };
  mat.customProgramCacheKey = () => 'weaponMaterialise';
  return mat;
}

/**
 * A drawn weapon: geometry + material + materialisation state.
 * `root` is parented to the wielder's hand transform by the combat system.
 */
export class Weapon {
  /** @param {WeaponClass|string} kind */
  constructor(kind) {
    this.kind = kind;
    this.def = WEAPONS[kind] || WEAPONS.sword;
    this.geometry = (WEAPON_GEOMETRY[kind] || swordGeometry)();
    this.material = makeWeaponMaterial();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.root = new THREE.Group();
    this.root.add(this.mesh);
    this.reveal = 1;
    const a = WEAPON_ANCHORS[kind];
    if (a) {
      this.baseLocal = new THREE.Vector3().fromArray(a.base);
      this.tipLocal = new THREE.Vector3().fromArray(a.tip);
    } else {
      // an unlisted kind (modded gear): measure the geometry rather than guess
      this.geometry.computeBoundingBox();
      const bb = this.geometry.boundingBox;
      this.baseLocal = new THREE.Vector3(0, bb.max.y * 0.18, 0);
      this.tipLocal = new THREE.Vector3(0, bb.max.y, 0);
    }
    this._tip = new THREE.Vector3();
    this._base = new THREE.Vector3();
  }

  /** 0 = fully dematerialised, 1 = solid steel. */
  setReveal(v) {
    this.reveal = THREE.MathUtils.clamp(v, 0, 1);
    this.material.userData.uniforms.uReveal.value = this.reveal;
    this.root.visible = this.reveal > 0.001;
  }

  /** World-space blade base, for trail sampling. */
  base() { return this._base.copy(this.baseLocal).applyMatrix4(this.root.matrixWorld); }
  /** World-space blade tip, for trail sampling and hit sweeps. */
  tip() { return this._tip.copy(this.tipLocal).applyMatrix4(this.root.matrixWorld); }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

/* ------------------------------------------------------------- Armiger */

/**
 * Armiger: 8–13 phantom royal arms orbiting the wielder in a slow, tilted
 * ring, ready to strike. Each weapon type is one InstancedMesh, so the whole
 * swarm costs a handful of draw calls no matter how many blades are up.
 */
export class Armiger {
  constructor({ count = 13 } = {}) {
    this.count = count;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = true;
    this.active = 0;              // 0..1 fade
    this.phase = 0;
    this.strikePhase = -1;

    const kinds = ['sword', 'greatsword', 'polearm', 'axe', 'lance'];
    this.slots = [];
    this.meshes = [];
    const perKind = new Map();
    for (let i = 0; i < count; i++) {
      const k = kinds[i % kinds.length];
      perKind.set(k, (perKind.get(k) || 0) + 1);
    }
    const material = phantomMaterial();
    this.material = material;
    let i = 0;
    for (const [kind, n] of perKind) {
      const geo = WEAPON_GEOMETRY[kind]();
      const im = new THREE.InstancedMesh(geo, material, n);
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = false;
      im.renderOrder = 19;
      this.group.add(im);
      this.meshes.push(im);
      for (let j = 0; j < n; j++) {
        this.slots.push({ mesh: im, index: j, seed: i * 0.618034, kind });
        i++;
      }
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._e = new THREE.Euler();
    this.group.visible = false;
  }

  /**
   * Lay out the ring around `center`.
   *
   * The weapons are hilt-inward, which since the re-origin means each one is
   * pinned by the point a hand would hold — so the ring reads as a crown of
   * arms waiting to be grasped rather than as blades skewered on a circle.
   *
   * @param {THREE.Vector3} center
   * @param {number} t phase in seconds (deterministic when pinned)
   */
  layout(center, t, { radius = 2.0, height = 2.35, tilt = 0.32 } = {}) {
    const n = this.slots.length;
    for (let k = 0; k < n; k++) {
      const s = this.slots[k];
      const a = (k / n) * Math.PI * 2 + t * 0.45;
      // two interleaved rings at different heights so it reads as a swarm
      const tierR = radius * (k % 2 ? 1.0 : 0.78);
      const tierY = height + (k % 2 ? 0.0 : 0.95) + Math.sin(a * 2 + s.seed * 9) * 0.30;
      this._p.set(
        center.x + Math.cos(a) * tierR,
        center.y + tierY,
        center.z + Math.sin(a) * tierR
      );
      // hilts inward, points swept outward and down — a crown of royal arms
      this._e.set(
        tilt + Math.sin(t * 1.3 + s.seed * 12) * 0.16,
        -a + Math.PI * 0.5,
        Math.PI * 0.92 + Math.cos(t * 1.1 + s.seed * 7) * 0.14,
        'YXZ'
      );
      this._q.setFromEuler(this._e);
      const sc = 0.46 + (k % 3) * 0.05;
      this._s.set(sc, sc, sc).multiplyScalar(this.active);
      this._m.compose(this._p, this._q, this._s);
      s.mesh.setMatrixAt(s.index, this._m);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    this.group.visible = this.active > 0.01;
    this.material.uniforms.uStrength.value = this.active;
  }

  setClock(c) { this.material.uniforms.uTime.value = c; }
  dispose() { for (const m of this.meshes) m.geometry.dispose(); this.material.dispose(); }
}

/** Ghostly blue phantom-weapon shader: fresnel shell + crawling energy. */
function phantomMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 1 },
      uColor: { value: new THREE.Color(0x2f8fe8) },
      uCore: { value: new THREE.Color(0xd8f0ff) },
    },
    vertexShader: /* glsl */`
      precision highp float;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        vY = position.y;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime, uStrength;
      uniform vec3 uColor, uCore;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 2.6);
        float scan = 0.6 + 0.4 * sin(vY * 12.0 - uTime * 2.6);
        // a saturated blue shell whose energy lives almost entirely in the rim
        float a = (0.070 + f * 0.34) * uStrength * (0.75 + 0.35 * scan);
        vec3 col = uColor * (0.30 + 0.75 * f) + uCore * pow(f, 5.0) * 0.9;
        gl_FragColor = vec4(col, clamp(a, 0.0, 0.6));
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

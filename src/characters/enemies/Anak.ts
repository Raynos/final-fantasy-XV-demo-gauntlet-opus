import { Rig, poseBone, creatureMaterial } from './RigBuilder.ts';
import type { Part } from './RigBuilder.ts';
import { Enemy, organicNormal, organicRoughness } from './EnemyBase.ts';
import type { PoseName, SpeciesDef, SpawnOpts } from './EnemyBase.ts';
import { CBuilder, sweep, sculptBlob, horn } from '../rig/Sculpt.ts';
import { clamp01, smooth } from '../rig/CreatureAnim.ts';
import { mixc } from './Palette.ts';

/* A pale animal on pale ground has only one thing going for it: value
 * structure. A gazelle's is three bands and they are not decoration — dun
 * above, a hard near-black lateral stripe, cream below — and it is the stripe
 * that does the work, because it puts a hard edge between the two values the
 * sun would otherwise flatten into one. Everything here is authored against
 * that: the saddle is a stop darker than the flank, the belly a stop and a
 * half lighter, and the stripe sits exactly on the seam between them. */
const DUN = 0xb2946a;         // flank, the animal's base value
const DUN_MID = 0x9a7d55;     // the ticking's other end
const DUN_DEEP = 0x7d6440;    // saddle over the topline
const DUN_DARK = 0x4f3f28;    // nuchal crest, facial blaze, ear rim
const BAND = 0x241b12;        // the lateral stripe and the tail tuft
const CREAM = 0xe0d2b0;       // belly, throat, inner leg
const CREAM_HI = 0xf2e9d0;    // rump patch and muzzle band
const SOCK = 0x35291d;        // black points from the knee down
const HORN = 0x796850;
const HORN_DARK = 0x39301f;
const HOOF = 0x141110;
const HOOF_TOP = 0x342b23;
const NOSE = 0x1d1611;
const GLAND = 0x231a12;
const EYE_DARK = 0x0d0906;
const EYE_GLOW = 0x2a1d0c;

/* A grazer's coat is short and slightly slick, not the sabertusk's matted
 * guard hair, and horn and hoof are keratin — both a good deal glossier than
 * anything else on the animal. One draw call, five surfaces. */
const M_HIDE = [0.88, 0];
const M_BELLY = [0.83, 0];
const M_HORN = [0.42, 0.03];
const M_HOOF = [0.30, 0.04];
const M_WET = [0.13, 0.0];

/**
 * Anak — the stilt-legged grazer of the Leide highlands. Three metres tall
 * and almost none of it is body: a small dun barrel slung high on four
 * absurdly long spindly legs in dark socks, a long neck, and a narrow deer
 * skull carrying two backswept ribbed horns. It wants nothing to do with
 * anyone — it grazes, it startles, and if something actually corners it, it
 * kicks backwards and runs.
 */
export const ANAK = {
  key: 'anak',
  questId: 'anak',
  faction: 'beast',
  expClass: 'trash',
  stats: {
    name: 'Anak', hp: 900, poise: 40, speed: 5.2, attackRange: 2.6,
    aggroRange: 14, radius: 0.7, height: 3.0, damage: 60, level: 9,
  },
  // neutral to every element — nothing about it is built for a fight
  senses: { sight: 22, fov: 1.2, hearing: 20, nocturnal: false },
  /** Hints for the encounter code: it never opens hostilities, and it bolts. */
  passive: true,
  skittish: true,
  drops: [
    { id: 'anak_meat', chance: 0.6, count: 1 },
  ],
  timing: { telegraph: 0.5, strike: 0.18, attack: 0.6, recover: 0.8 },
  attacks: [
    // a panicked rear-leg lash at whatever is behind it
    {
      id: 'kick', range: 2.6, weight: 3, mult: 1.0, poise: 22, hitRadius: 2.4, arc: 1.4,
      telegraph: 0.5, strike: 0.18, attack: 0.6, recover: 0.8, cooldown: 2.4,
      backward: true,
    },
    // a shove with the horns, all shoulder, no malice
    {
      id: 'headbutt', range: 2.4, weight: 2, mult: 0.8, poise: 16, hitRadius: 1.8, arc: 1.0,
      telegraph: 0.45, strike: 0.16, attack: 0.5, recover: 0.7, cooldown: 2.0,
    },
  ],
  buildPrototype,
  make(opts: SpawnOpts) { return new AnakEnemy(opts); },
} satisfies SpeciesDef;

/* Shoulder 2.35 m, horn tips 3.14 m, nose at z = 1.04, rump at z = -0.72.
 *
 * Rebuilt from `GeoKit` primitives to `CBuilder`/`sweep`, the way the sabertusk
 * is built. The old sculpt was 2,770 triangles — a tenth of every other
 * quadruped in the roster — and the **only species with no `colorAt`
 * anywhere**: every part carried one flat `tint()` plus 4 % jitter, which is
 * why the animal read as a single sheet of cream however the palette was
 * tuned. A `markings()` pass that walked the finished buffers and painted
 * three bands by world height half-landed, because a height threshold cannot
 * tell a belly from a thigh — they occupy the same band — and it could not
 * reach the four specific defects the review named:
 *
 *   * legs ending in round brown balls rather than hooves
 *   * a tail that was a flat card sticking out sideways
 *   * a visible box where the shoulder met the neck
 *   * a faceted body
 *
 * All four are geometry, not paint. The body, neck, both pairs of legs and the
 * tail are now continuous shaped sweeps; the skull is a brushed blob; each
 * foot is a **cloven hoof** of two keratin toes with a flat sole and a pair of
 * dewclaws; and the value structure is authored per vertex in the sweep's own
 * `(theta, u)` rather than stamped on afterwards.
 *
 * The skeleton is unchanged, bone for bone and metre for metre, so every pose
 * in `AnakEnemy.pose` and all nine `creaturecheck` poses address exactly the
 * geometry they addressed before.
 */
function buildPrototype() {
  const rig = new Rig();
  rig.bone('root', null, [0, 0, 0]);
  rig.bone('hips', 'root', [0, 1.95, -0.42]);
  rig.bone('spine', 'hips', [0, 2.02, -0.08]);
  rig.bone('chest', 'spine', [0, 2.08, 0.26]);
  rig.bone('neck1', 'chest', [0, 2.26, 0.44]);
  rig.bone('neck2', 'neck1', [0, 2.56, 0.55]);
  rig.bone('head', 'neck2', [0, 2.80, 0.62]);
  rig.bone('jaw', 'head', [0, 2.72, 0.70]);
  rig.bone('tail1', 'hips', [0, 1.92, -0.58]);
  rig.bone('tail2', 'tail1', [0, 1.80, -0.72]);
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    rig.bone(`fsh${n}`, 'chest', [0.22 * s, 2.02, 0.26]);
    rig.bone(`fkn${n}`, `fsh${n}`, [0.24 * s, 1.34, 0.34]);
    rig.bone(`fca${n}`, `fkn${n}`, [0.25 * s, 0.60, 0.22]);
    rig.bone(`fho${n}`, `fca${n}`, [0.25 * s, 0.07, 0.28]);
    rig.bone(`bhp${n}`, 'hips', [0.20 * s, 1.94, -0.40]);
    rig.bone(`bst${n}`, `bhp${n}`, [0.23 * s, 1.30, -0.54]);
    rig.bone(`bhk${n}`, `bst${n}`, [0.24 * s, 0.60, -0.32]);
    rig.bone(`bho${n}`, `bhk${n}`, [0.24 * s, 0.07, -0.26]);
  }

  const B = new CBuilder();
  const P: Part[] = [];

  /* ---------------------------------------------------------- torso ----
   * One sweep from the pin bones to the base of the neck. `ref: [0,1,0]` with
   * a centreline running along +Z puts theta 0 on the spine and theta pi on
   * the belly, so `cos(theta)` is the dorsal-ventral axis and every band below
   * is written in it. */
  B.group(1);
  const backline = (th: number) => Math.cos(th);
  const torsoColour = (th: number, u: number) => {
    const b = backline(th);
    // Ticking first, so no zone is a flat field. Held to ~3 cycles axially on
    // a 30-step sweep and 3 around a 26-segment ring: anything finer than
    // about six samples per cycle stops being a coat and becomes streaking.
    const tick = 0.44 + 0.30 * Math.sin(u * 19 + th * 3) + 0.14 * Math.sin(u * 11 - th * 5);
    const flank = mixc(DUN, DUN_MID, tick);
    // A gazelle's three bands, in the order the light finds them: a deeper
    // saddle over the topline, a hard near-black lateral stripe exactly where
    // dun meets cream, and the cream underside below it. The stripe sits ON
    // the boundary rather than beside it, so even where the ring can only
    // spare two segments for it the two values it separates still read.
    let c = mixc(flank, DUN_DEEP, clamp01((b - 0.05) / 0.55) * 0.80);
    c = mixc(c, CREAM, Math.pow(clamp01((-b - 0.16) / 0.40), 2) * 0.95);
    c = mixc(c, BAND, Math.exp(-Math.pow((b + 0.26) / 0.24, 2)) * 0.92);
    // and the pale rump the tail flags against
    return mixc(c, CREAM_HI, clamp01((0.11 - u) / 0.11) * 0.62);
  };
  sweep(B, {
    nodes: [
      { p: [0, 1.94, -0.68], rx: 0.126, rz: 0.136 },   // pin bones, under the tail
      { p: [0, 1.965, -0.46], rx: 0.198, rz: 0.218 },  // croup
      { p: [0, 1.975, -0.22], rx: 0.194, rz: 0.246 },  // loin — narrow, deep, tucked
      { p: [0, 1.995, 0.02], rx: 0.204, rz: 0.262 },
      { p: [0, 2.02, 0.24], rx: 0.222, rz: 0.286 },    // girth, the deepest section
      { p: [0, 2.05, 0.42], rx: 0.186, rz: 0.238 },    // shoulder
      { p: [0, 2.085, 0.53], rx: 0.126, rz: 0.158 },   // base of the neck
    ],
    steps: 30, seg: 26, ref: [0, 1, 0],
    capStart: 0.65, capEnd: 0.15,
    shape: (th, u) => {
      const b = backline(th);
      const side = Math.abs(Math.sin(th));
      let m = 1;
      // a flat back and a keeled brisket — the vertical section is an egg
      m += b > 0 ? -0.05 * b * b : 0.11 * b * b * smooth(1 - Math.abs(u - 0.70) * 2.4);
      // the tuck behind the ribs, which is most of what makes a grazer look
      // light on its feet rather than like a barrel on sticks
      m -= smooth((u - 0.18) / 0.28) * (1 - smooth((u - 0.52) / 0.22)) * 0.13 * clamp01(-b);
      // haunch and shoulder blade push out sideways
      m += side * 0.13 * Math.exp(-Math.pow((u - 0.16) / 0.15, 2));
      m += side * 0.10 * Math.exp(-Math.pow((u - 0.80) / 0.13, 2));
      // hip points — a gazelle in condition still shows them
      m += clamp01(b - 0.15) * side * 0.06 * Math.exp(-Math.pow((u - 0.13) / 0.06, 2));
      // withers, so the topline is not a bare cylinder into the neck
      m += clamp01(b - 0.35) * 0.07 * Math.exp(-Math.pow((u - 0.78) / 0.10, 2));
      // shallow rib banding on the lower flank, where raking light finds it
      m += Math.sin(u * 22) * 0.008 * side * clamp01(-b + 0.4) * smooth((u - 0.45) / 0.2);
      return m;
    },
    colorAt: torsoColour,
    matAt: (th) => (backline(th) < -0.55 ? M_BELLY : M_HIDE),
  });
  P.push({ geo: B.build(), bind: ['chain', ['hips', 'spine', 'chest']] });
  resetB(B);

  /* ----------------------------------------------------------- neck ----
   * Starts *inside* the chest — the old sculpt butted a neck tube against a
   * torso tube and a shoulder blob, which is the visible box the review
   * named. `ref: [0,0,1]` on a centreline running up-and-forward puts
   * `cos(theta)` on the throat. */
  B.group(2);
  sweep(B, {
    nodes: [
      { p: [0, 2.04, 0.36], rx: 0.170, rz: 0.186 },   // buried in the chest
      { p: [0, 2.20, 0.445], rx: 0.134, rz: 0.148 },
      { p: [0, 2.42, 0.500], rx: 0.108, rz: 0.120 },
      { p: [0, 2.62, 0.552], rx: 0.093, rz: 0.103 },
      { p: [0, 2.78, 0.604], rx: 0.081, rz: 0.089 },
      { p: [0, 2.87, 0.640], rx: 0.066, rz: 0.072 },  // into the skull
    ],
    steps: 20, seg: 18, ref: [0, 0, 1], capStart: false, capEnd: false,
    shape: (th, u) => {
      const f = Math.cos(th);
      // the nuchal crest along the back of the neck
      let m = 1 + clamp01(-f - 0.1) * 0.13 * smooth((u - 0.05) / 0.35) * (1 - smooth((u - 0.72) / 0.28));
      // and the fullness of the throat where it leaves the chest
      m += clamp01(f) * 0.09 * Math.exp(-Math.pow((u - 0.16) / 0.22, 2));
      return m;
    },
    colorAt: (th, u) => {
      const f = Math.cos(th);
      const tick = 0.44 + 0.26 * Math.sin(u * 13 + th * 3);
      let c = mixc(DUN, DUN_MID, tick);
      // the cream throat runs the whole length of it — the field mark that
      // separates the head from the shoulder at any distance
      c = mixc(c, CREAM, clamp01((f - 0.22) / 0.58) * 0.88);
      return mixc(c, DUN_DARK, clamp01((-f - 0.12) / 0.62) * 0.52 * (1 - smooth((u - 0.78) / 0.22)));
    },
    matAt: (th) => (Math.cos(th) > 0.35 ? M_BELLY : M_HIDE),
  });
  P.push({ geo: B.build(), bind: ['chain', ['chest', 'neck1', 'neck2', 'head']] });
  resetB(B);

  /* ------------------------------------------------------------ head ---
   * A narrow deer skull: braincase, a brow shelf over deep-set eyes, cheek
   * arches, and a long tapering muzzle — one brushed blob rather than a blob
   * with a tube pushed into the front of it. */
  B.group(3);
  sculptBlob(B, {
    center: [0, 2.792, 0.792], scale: [0.084, 0.094, 0.243], segU: 28, segV: 20,
    brushes: [
      { p: [0, 2.855, 0.625], r: [0.09, 0.075, 0.09], amt: 0.015, dir: [0, 1, -0.25] },      // braincase
      { p: [0, 2.858, 0.705], r: [0.10, 0.042, 0.065], amt: 0.020, dir: [0, 1, 0.18] },      // brow shelf
      { p: [0.070, 2.836, 0.740], r: [0.048, 0.046, 0.055], amt: -0.026, dir: 'normal', mirror: true }, // eye socket
      { p: [0.070, 2.858, 0.742], r: [0.038, 0.020, 0.040], amt: 0.011, dir: [0.3, 1, 0.1], mirror: true }, // upper lid
      { p: [0.030, 2.746, 1.016], r: [0.020, 0.020, 0.026], amt: -0.010, dir: 'normal', mirror: true },  // nostril
      { p: [0.070, 2.786, 0.706], r: [0.042, 0.050, 0.062], amt: 0.014, dir: [1, -0.15, 0], mirror: true }, // cheek arch
      { p: [0, 2.752, 0.985], r: [0.10, 0.10, 0.14], amt: -0.044, dir: 'normal' },           // muzzle taper
      { p: [0, 2.742, 1.032], r: [0.09, 0.09, 0.09], amt: -0.020, dir: 'normal' },           // and again at the tip
      { p: [0, 2.792, 0.900], r: [0.030, 0.040, 0.09], amt: 0.010, dir: [0, 1, 0] },         // nasal bone
      { p: [0, 2.722, 0.995], r: [0.05, 0.04, 0.06], amt: 0.010, dir: [0, -1, 0.3] },        // upper lip
    ],
    colorAt: (u, v, p) => {
      // The face is dun with cream *under* it, not cream with dun on top: the
      // first pass had `under` and `cheek` reaching so far up the skull that
      // the whole head came back near-white and the blaze had nothing to sit
      // against.
      const under = clamp01((2.762 - p.y) / 0.050);
      const cheek = clamp01(1 - Math.abs(Math.abs(p.x) - 0.058) / 0.038) * clamp01((2.800 - p.y) / 0.048);
      let c = mixc(DUN, CREAM, Math.max(under * 0.85, cheek * 0.42));
      // the facial blaze: a dark stripe down the bridge, the thing that turns
      // a pale wedge into a face
      const blaze = clamp01(1 - Math.abs(p.x) / 0.052) * clamp01((p.z - 0.700) / 0.09)
        * clamp01((1.010 - p.z) / 0.05) * clamp01((p.y - 2.740) / 0.03);
      c = mixc(c, DUN_DARK, blaze * 0.85);
      // a dark lid ring, so the eye is set in something rather than printed on
      const lid = Math.exp(-(
        Math.pow((Math.hypot((Math.abs(p.x) - 0.070) / 0.046, (p.y - 2.838) / 0.042) - 0.92) / 0.34, 2)
        + Math.pow((p.z - 0.752) / 0.055, 2)));
      c = mixc(c, GLAND, lid * 0.85);
      // the lip line
      c = mixc(c, DUN_DARK, clamp01((2.735 - p.y) / 0.014) * clamp01((p.z - 0.900) / 0.05) * 0.7);
      // a pale muzzle band behind the nose leather
      c = mixc(c, CREAM_HI, clamp01((p.z - 0.955) / 0.045) * 0.80);
      // and the preorbital gland, a dark slit below the eye
      const gland = Math.exp(-(
        Math.pow((Math.abs(p.x) - 0.060) / 0.030, 2)
        + Math.pow((p.y - 2.806) / 0.018, 2)
        + Math.pow((p.z - 0.782) / 0.038, 2)));
      return mixc(c, GLAND, gland * 0.72);
    },
    matAt: (u, v, p) => (p.z > 1.005 ? M_WET : M_HIDE),
  });
  // nose leather
  sculptBlob(B, {
    center: [0, 2.728, 1.034], scale: [0.046, 0.036, 0.030], segU: 14, segV: 9,
    brushes: [
      { p: [0.022, 2.732, 1.052], r: [0.016, 0.020, 0.024], amt: -0.008, dir: 'normal', mirror: true },
    ],
    colorAt: () => NOSE, matAt: () => M_WET,
  });
  for (const s of [-1, 1]) {
    // The eye is this animal's whole character: a prey animal's is huge, dark,
    // set high and wide enough on the skull to see behind itself. Radiance is
    // low — a wet highlight, not the predator's lit iris.
    B.glow(EYE_GLOW, 2.4);
    sculptBlob(B, {
      center: [0.0755 * s, 2.838, 0.754], scale: [0.034, 0.038, 0.030], segU: 14, segV: 10,
      colorAt: () => EYE_DARK, matAt: () => M_WET,
    });
    B.glow(null);
    // ear: a tall leaf, thin front-to-back, pale inside with a dark rim
    sweep(B, {
      // Splayed sideways, not upward: the first version rose *inside* the
      // horns' arc and the two read as four blades from the front.
      nodes: [
        { p: [0.078 * s, 2.840, 0.622], rx: 0.030, rz: 0.020 },
        { p: [0.148 * s, 2.900, 0.560], rx: 0.058, rz: 0.018 },
        { p: [0.216 * s, 2.952, 0.484], rx: 0.052, rz: 0.015 },
        { p: [0.262 * s, 2.980, 0.428], rx: 0.017, rz: 0.008 },
      ],
      steps: 10, seg: 12, ref: [0, 0, 1], capStart: 0.4, capEnd: 0.5,
      // cupped forward — the inside of the ear is a dish, and the dish is what
      // stops it reading as a leaf stuck to the skull
      shape: (th, u) => 1 + Math.max(0, Math.cos(th)) * 0.28 * smooth((u - 0.08) / 0.42),
      colorAt: (th, u) => {
        const inner = clamp01((Math.cos(th) - 0.05) / 0.7);
        const rim = clamp01((Math.abs(Math.sin(th)) - 0.72) / 0.28);
        return mixc(mixc(DUN_MID, CREAM, inner * 0.82), DUN_DARK, Math.max(rim * 0.7, clamp01((u - 0.7) / 0.3) * 0.5));
      },
      matAt: () => M_HIDE,
    });
    // backswept ribbed horn — the ribbing is in the sweep's own section, not
    // five loose rings stacked beside it
    sweep(B, {
      nodes: [
        { p: [0.048 * s, 2.880, 0.652], rx: 0.046, rz: 0.038 },
        { p: [0.071 * s, 2.988, 0.578], rx: 0.038, rz: 0.031 },
        { p: [0.093 * s, 3.074, 0.456], rx: 0.030, rz: 0.025 },
        { p: [0.105 * s, 3.126, 0.306], rx: 0.021, rz: 0.017 },
        { p: [0.102 * s, 3.138, 0.156], rx: 0.011, rz: 0.009 },
        { p: [0.092 * s, 3.116, 0.052], rx: 0.004, rz: 0.0035 },
      ],
      steps: 26, seg: 10, ref: [0, 1, 0], capStart: 0.4, capEnd: 0.6,
      // The ribs have to be a *shape*, not a shade: at 26 steps four cycles is
      // 6.5 samples each, which is the finest a ring this size can carry
      // without the rings turning into streaks (the garula-mane rule).
      shape: (th, u) => 1 + Math.max(0, Math.sin(u * 25)) * 0.26 * (1 - smooth((u - 0.62) / 0.30)),
      colorAt: (th, u) => mixc(mixc(HORN_DARK, HORN, clamp01((u - 0.12) / 0.55)),
        HORN_DARK, Math.max(0, -Math.sin(u * 25)) * 0.42),
      matAt: () => M_HORN,
    });
  }
  P.push({ geo: B.build(), bind: ['bone', 'head'] });
  resetB(B);

  /* ------------------------------------------------------------- jaw --- */
  B.group(4);
  sweep(B, {
    nodes: [
      { p: [0, 2.736, 0.700], rx: 0.058, rz: 0.050 },
      { p: [0, 2.716, 0.840], rx: 0.044, rz: 0.038 },
      { p: [0, 2.708, 0.958], rx: 0.032, rz: 0.028 },
      { p: [0, 2.708, 1.020], rx: 0.021, rz: 0.019 },
    ],
    steps: 12, seg: 12, ref: [0, 1, 0], capStart: 0.5, capEnd: 0.6,
    shape: (th) => 1 + Math.max(0, -Math.cos(th)) * 0.16,
    colorAt: (th, u) => mixc(Math.cos(th) < -0.15 ? CREAM : DUN_MID, CREAM_HI, clamp01((u - 0.55) / 0.45) * 0.55),
    matAt: () => M_BELLY,
  });
  P.push({ geo: B.build(), bind: ['bone', 'jaw'] });
  resetB(B);

  /* ------------------------------------------------------------ legs ---
   * Nearly two metres of leg each, and the whole species reads on them. One
   * sweep per limb bound across all four bones, with radii that are
   * deliberately **not** monotone: a real ungulate limb swells at the
   * forearm, pinches hard at the carpus, runs down a thin cannon and swells
   * again at the fetlock, and it is those changes of direction that stop a
   * leg reading as a cone. */
  const legColour = (s: number) => (th: number, u: number) => {
    const inner = clamp01(-Math.sin(th) * s);
    const top = mixc(DUN, CREAM, inner * clamp01((0.45 - u) / 0.35) * 0.6);
    return mixc(top, SOCK, clamp01((u - 0.44) / 0.28) * 0.92);
  };
  const legShape = (backAmt: number) => (th: number, u: number) => {
    const back = -Math.cos(th);
    return 1 + Math.max(0, back) * backAmt * Math.exp(-Math.pow((u - 0.14) / 0.15, 2))
      // the flexor tendon standing off the back of the cannon
      + Math.max(0, back) * 0.11 * smooth((u - 0.56) / 0.16) * (1 - smooth((u - 0.86) / 0.12));
  };
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';

    B.group(5);
    sweep(B, {
      nodes: [
        // Node 0 is deliberately small and buried inside the barrel. At its
        // first size the sweep's start cap broke the torso surface and read as
        // a cut cylinder end stuck on the shoulder — visible even at eight
        // metres. The shoulder mass is the *second* node, which is a swell in
        // a continuous sweep and has no cap in it.
        { p: [0.130 * s, 2.16, 0.250], rx: 0.052, rz: 0.058 },   // buried scapula
        { p: [0.208 * s, 1.94, 0.272], rx: 0.090, rz: 0.100 },   // shoulder / upper arm
        { p: [0.234 * s, 1.62, 0.320], rx: 0.058, rz: 0.065 },   // forearm belly
        { p: [0.241 * s, 1.36, 0.340], rx: 0.038, rz: 0.044 },   // carpus — the pinch
        { p: [0.246 * s, 1.06, 0.300], rx: 0.030, rz: 0.034 },   // cannon
        { p: [0.249 * s, 0.74, 0.250], rx: 0.027, rz: 0.031 },
        { p: [0.250 * s, 0.605, 0.220], rx: 0.043, rz: 0.048 },  // fetlock — a real joint, not a bump
        { p: [0.250 * s, 0.44, 0.236], rx: 0.024, rz: 0.028 },   // pastern
        { p: [0.250 * s, 0.245, 0.264], rx: 0.021, rz: 0.025 },  // coronet
      ],
      steps: 26, seg: 12, ref: [0, 0, 1], capStart: 1.0, capEnd: 0.25,
      shape: legShape(0.20), colorAt: legColour(s), matAt: () => M_HIDE,
    });
    P.push({ geo: B.build(), bind: ['chain', [`fsh${n}`, `fkn${n}`, `fca${n}`, `fho${n}`]] });
    resetB(B);

    B.group(6);
    hoof(B, 0.250 * s, 0.276);
    P.push({ geo: B.build(), bind: ['bone', `fho${n}`] });
    resetB(B);

    B.group(5);
    sweep(B, {
      nodes: [
        { p: [0.120 * s, 2.12, -0.36], rx: 0.055, rz: 0.060 },   // buried pelvis — see the foreleg
        { p: [0.200 * s, 1.88, -0.425], rx: 0.104, rz: 0.114 },  // thigh
        { p: [0.221 * s, 1.58, -0.500], rx: 0.070, rz: 0.078 },  // gaskin, the drive muscle
        { p: [0.231 * s, 1.30, -0.545], rx: 0.039, rz: 0.045 },  // stifle — the pinch
        { p: [0.237 * s, 0.98, -0.455], rx: 0.031, rz: 0.035 },  // cannon
        { p: [0.240 * s, 0.74, -0.375], rx: 0.027, rz: 0.031 },
        { p: [0.240 * s, 0.605, -0.320], rx: 0.043, rz: 0.048 }, // fetlock
        { p: [0.240 * s, 0.44, -0.296], rx: 0.024, rz: 0.028 },
        { p: [0.240 * s, 0.245, -0.270], rx: 0.021, rz: 0.025 },
      ],
      steps: 26, seg: 12, ref: [0, 0, 1], capStart: 1.0, capEnd: 0.25,
      shape: legShape(0.27), colorAt: legColour(s), matAt: () => M_HIDE,
    });
    P.push({ geo: B.build(), bind: ['chain', [`bhp${n}`, `bst${n}`, `bhk${n}`, `bho${n}`]] });
    resetB(B);

    B.group(6);
    hoof(B, 0.240 * s, -0.258);
    P.push({ geo: B.build(), bind: ['bone', `bho${n}`] });
    resetB(B);
  }

  /* ------------------------------------------------------------ tail ---
   * It used to be a `spike` rotated 143 degrees off vertical and pinned to
   * `tail2`: a flat white card standing out sideways from the rump, which is
   * exactly what the review saw. It is now a swept tail that hangs, dark
   * above and cream below, thickening into a tuft over its last third. */
  B.group(7);
  sweep(B, {
    nodes: [
      { p: [0, 1.945, -0.600], rx: 0.045, rz: 0.048 },
      { p: [0, 1.870, -0.685], rx: 0.033, rz: 0.036 },
      { p: [0, 1.775, -0.735], rx: 0.026, rz: 0.028 },
      { p: [0, 1.680, -0.756], rx: 0.020, rz: 0.022 },
      { p: [0, 1.600, -0.762], rx: 0.010, rz: 0.011 },
    ],
    steps: 16, seg: 10, ref: [0, 1, 0], capStart: false, capEnd: 0.6,
    shape: (th, u) => 1
      + smooth((u - 0.42) / 0.30) * (1 - smooth((u - 0.90) / 0.10)) * 0.90
      + Math.sin(th * 5) * 0.10 * smooth((u - 0.40) / 0.30),
    colorAt: (th, u) => {
      const top = Math.cos(th);
      const c = mixc(CREAM_HI, DUN_DEEP, clamp01((top + 0.15) / 0.7) * 0.9);
      return mixc(c, BAND, clamp01((u - 0.50) / 0.35) * 0.85);
    },
    matAt: () => M_HIDE,
  });
  P.push({ geo: B.build(), bind: ['chain', ['tail1', 'tail2']] });
  resetB(B);

  for (const p of P) {
    if (p.bind[0] === 'chain') rig.attachChain(p.geo, p.bind[1], 0.95);
    else rig.attach(p.geo, p.bind[1]);
  }

  const mat = creatureMaterial({
    roughness: 0.88, metalness: 0.0,
    normalMap: organicNormal(), normalScale: 0.60, roughnessMap: organicRoughness(),
  });
  return rig.build(mat, { radius: 3.4, coat: { mottle: 0.12, tick: 0.14, shade: 0.18, dust: 0.30, dustTop: 0.55 } });
}

/**
 * A cloven hoof: two keratin toes with a flat sole and a pair of dewclaws.
 *
 * The old sculpt ended every leg in a `blob(0.036, 0.055, 0.048)` — a round
 * brown ball, which is the single defect the review named first. A hoof is not
 * a ball: it is a wall of keratin that is widest at the coronet, splits down
 * the middle, comes to a point at the toe and is **flat underneath**. The flat
 * sole is the `shape` term; without it a hoof reads as a bead however it is
 * coloured, because the ground contact is what the eye reads.
 *
 * @param x lateral centreline of the leg
 * @param z the coronet's z; the toes run forward from it
 */
function hoof(B: CBuilder, x: number, z: number) {
  for (const t of [-1, 1]) {
    const ox = x + t * 0.020;
    sweep(B, {
      nodes: [
        { p: [ox, 0.255, z - 0.016], rx: 0.028, rz: 0.034 },              // coronet, swallowing the leg's end
        { p: [ox + t * 0.003, 0.165, z + 0.004], rx: 0.031, rz: 0.040 },  // wall — the hoof's widest point
        { p: [ox + t * 0.004, 0.065, z + 0.034], rx: 0.026, rz: 0.038 },  // toe
        { p: [ox + t * 0.004, 0.018, z + 0.066], rx: 0.010, rz: 0.016 },  // point
      ],
      steps: 9, seg: 10, ref: [0, 0, 1], capStart: false, capEnd: 0.35,
      // the sole: flatten the underside so the foot meets the ground on a
      // plane instead of on a tangent point
      shape: (th, u) => 1 - clamp01(-Math.cos(th) - 0.1) * 0.30 * smooth(u * 1.4),
      colorAt: (th, u) => mixc(HOOF_TOP, HOOF, clamp01((u - 0.08) / 0.5)),
      matAt: () => M_HOOF,
    });
    // dewclaw, high on the back of the fetlock
    horn(B, {
      from: [x + t * 0.020, 0.470, z - 0.048], dir: [t * 0.15, -0.85, -0.50], len: 0.042,
      curve: [0, -0.006, -0.010], r0: 0.011, r1: 0.002, seg: 6, steps: 4,
      colorAt: () => HOOF, matAt: () => M_HOOF,
    });
  }
}

/** Empty the builder between parts — each `build()` consumes what is in it. */
function resetB(B: CBuilder) {
  B.pos.length = 0; B.uv.length = 0; B.col.length = 0;
  B.emi.length = 0; B.mp.length = 0; B.grp.length = 0; B.idx.length = 0;
  B.glow(null);
}

class AnakEnemy extends Enemy {
  constructor(opts: SpawnOpts) { super(ANAK, opts); }

  override pose(state: PoseName, t: number) {
    const rig = this.rig;
    if (!rig) return;
    const S = (n: string, x: number, y: number, z: number) => poseBone(rig, n, x, y, z);
    // neck as one curve: 0 = head up and alert, 1 = muzzle in the grass
    const neck = (down: number, yaw = 0, roll = 0) => {
      S('neck1', 0.55 * down - 0.10, yaw * 0.35, roll * 0.3);
      S('neck2', 0.60 * down, yaw * 0.45, roll * 0.35);
      S('head', 0.35 * down - 0.12, yaw * 0.55, roll * 0.4);
    };
    // long-legged loping trot; the legs swing from the shoulder like pendulums
    const gait = (phase: number, amp: number, kneeAmp: number, front: boolean) => {
      for (const s of [-1, 1]) {
        const n = s < 0 ? 'L' : 'R';
        const off = (s < 0 ? 0 : Math.PI) + (front ? 0 : Math.PI * 0.45);
        const a = Math.sin(phase + off);
        const b = Math.sin(phase + off + 1.8);
        if (front) {
          S(`fsh${n}`, a * amp, 0, 0);
          S(`fkn${n}`, -0.20 + Math.max(0, b) * kneeAmp, 0, 0);
          S(`fca${n}`, 0.30 - a * 0.35, 0, 0);
          S(`fho${n}`, -0.15 + a * 0.2, 0, 0);
        } else {
          S(`bhp${n}`, -a * amp, 0, 0);
          S(`bst${n}`, 0.45 - Math.max(0, b) * kneeAmp, 0, 0);
          S(`bhk${n}`, -0.40 + a * 0.4, 0, 0);
          S(`bho${n}`, 0.20 - a * 0.2, 0, 0);
        }
      }
    };

    switch (state) {
      case 'run':
      case 'approach': {
        const ph = t * 7.6;
        gait(ph, 0.72, 0.85, true);
        gait(ph, 0.66, 0.80, false);
        S('spine', Math.sin(ph * 2) * 0.05, 0, 0);
        S('chest', -0.04 + Math.sin(ph * 2 + 1) * 0.04, 0, 0);
        // the head stays high and level while the body lopes underneath it
        neck(0.05 + Math.sin(ph) * 0.05, Math.sin(ph * 0.4) * 0.12, 0);
        S('jaw', 0.06 + Math.max(0, Math.sin(ph * 2)) * 0.06, 0, 0);
        S('tail1', -0.45, Math.sin(ph * 0.9) * 0.25, 0);
        S('tail2', -0.30, Math.sin(ph * 0.9 + 0.6) * 0.3, 0);
        this.visual.position.y = Math.abs(Math.sin(ph)) * 0.11;
        this.visual.rotation.z = Math.sin(ph) * 0.04;
        break;
      }
      case 'telegraph': {
        const k = Math.min(1, this.stateTime / 0.28);
        const e = k * k * (3 - 2 * k);
        const flinchy = Math.sin(t * 26) * 0.025 * k;
        if (this.attackId === 'kick') {
          // shifts its whole weight onto the forelegs, tucks the head away and
          // cocks one hind leg — it is not looking at what it is about to hit
          S('spine', -0.12 * e, 0, 0);
          S('chest', -0.10 * e, 0, 0);
          neck(-0.18 * e + flinchy, -0.30 * e, 0);
          S('jaw', 0.10 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.20 * e, 0, 0); S(`fkn${n}`, -0.45 * e, 0, 0); S(`fca${n}`, 0.45 * e, 0, 0);
            S(`bhp${n}`, -0.85 * e, 0, 0); S(`bst${n}`, 1.35 * e, 0, 0); S(`bhk${n}`, -1.05 * e, 0, 0);
          }
          S('tail1', 0.85 * e, 0, 0); S('tail2', 0.6 * e, 0, 0);
          this.visual.position.y = -0.10 * e;
        } else {
          // headbutt: neck drawn back and the horns tipped forward
          S('spine', 0.06 * e, 0, 0);
          S('chest', 0.05 * e, 0, 0);
          neck(-0.30 * e + flinchy, 0, 0);
          S('head', -0.55 * e, 0, 0);
          S('jaw', 0.12 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.30 * e, 0, 0); S(`fkn${n}`, -0.55 * e, 0, 0); S(`fca${n}`, 0.4 * e, 0, 0);
            S(`bhp${n}`, -0.40 * e, 0, 0); S(`bst${n}`, 0.70 * e, 0, 0); S(`bhk${n}`, -0.55 * e, 0, 0);
          }
          this.visual.position.y = -0.08 * e;
        }
        this.visual.rotation.z = 0;
        break;
      }
      case 'attack': {
        if (this.attackId === 'kick') {
          // both hind legs snap straight out behind, body pitched forward
          const k = Math.min(1, this.stateTime / 0.12);
          const e = 1 - Math.pow(1 - k, 4);
          S('spine', -0.12 - 0.20 * e, 0, 0);
          S('chest', -0.10 - 0.14 * e, 0, 0);
          neck(-0.18 - 0.25 * e, -0.30, 0);
          S('jaw', 0.35 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.20 + 0.35 * e, 0, 0); S(`fkn${n}`, -0.45 - 0.2 * e, 0, 0); S(`fca${n}`, 0.45, 0, 0);
            S(`bhp${n}`, -0.85 + 1.85 * e, 0, 0);
            S(`bst${n}`, 1.35 - 1.60 * e, 0, 0);
            S(`bhk${n}`, -1.05 + 1.35 * e, 0, 0);
            S(`bho${n}`, 0.45 * e, 0, 0);
          }
          S('tail1', 0.85 - 1.5 * e, 0, 0); S('tail2', 0.6 - 1.1 * e, 0, 0);
          this.visual.position.y = -0.10 + 0.28 * e;
        } else {
          // headbutt: the neck uncoils and the horns come through
          const k = Math.min(1, this.stateTime / 0.13);
          const e = 1 - Math.pow(1 - k, 3);
          S('spine', 0.06 + 0.12 * e, 0, 0);
          S('chest', 0.05 + 0.10 * e, 0, 0);
          S('neck1', -0.10 - 0.30 + 0.75 * e, 0, 0);
          S('neck2', -0.30 + 0.85 * e, 0, 0);
          S('head', -0.12 - 0.55 + 1.05 * e, 0, 0);
          S('jaw', 0.12 + 0.2 * e, 0, 0);
          for (const s of [-1, 1]) {
            const n = s < 0 ? 'L' : 'R';
            S(`fsh${n}`, 0.30 - 0.5 * e, 0, 0); S(`fkn${n}`, -0.55 + 0.35 * e, 0, 0); S(`fca${n}`, 0.4 - 0.25 * e, 0, 0);
            S(`bhp${n}`, -0.40 + 0.2 * e, 0, 0); S(`bst${n}`, 0.70 - 0.3 * e, 0, 0); S(`bhk${n}`, -0.55 + 0.25 * e, 0, 0);
          }
          this.visual.position.y = -0.08 + 0.14 * e;
        }
        this.visual.rotation.z = 0;
        break;
      }
      case 'flinch': {
        // a full-body startle: everything jumps at once, then settles
        const k = Math.exp(-this.stateTime * 8) * (1 - Math.min(1, this.stateTime / 0.35));
        const sh = Math.sin(this.stateTime * 44) * k;
        S('spine', 0.20 * k, sh * 0.4, 0);
        S('chest', 0.14 * k, sh * 0.3, 0);
        neck(-0.55 * k, sh * 0.9, 0.4 * k);
        S('jaw', 0.45 * k, 0, 0);
        S('tail1', 1.0 * k, 0, 0); S('tail2', 0.7 * k, 0, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, -0.45 * k, 0, 0); S(`fkn${n}`, -0.30 * k, 0, 0); S(`fca${n}`, 0.5 * k, 0, 0);
          S(`bhp${n}`, -0.35 * k, 0, 0); S(`bst${n}`, 0.65 * k, 0, 0); S(`bhk${n}`, -0.5 * k, 0, 0);
        }
        this.visual.position.y = 0.14 * k;
        break;
      }
      case 'stagger': {
        // the long legs splay and the neck hangs — nothing holding it up
        const k = Math.min(1, this.stateTime / 0.22) * Math.max(0, 1 - this.stateTime / 2.3);
        S('spine', 0.28 * k, 0.24 * k, 0.18 * k);
        S('chest', 0.18 * k, 0.16 * k, 0);
        neck(0.75 * k, 0.30 * k, 0.5 * k);
        S('jaw', 0.5 * k, 0, 0);
        S('tail1', 0.3 * k, 0.3 * k, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.55 * k, 0, 0.30 * s * k); S(`fkn${n}`, -1.10 * k, 0, 0); S(`fca${n}`, 0.85 * k, 0, 0);
          S(`bhp${n}`, -0.70 * k, 0, 0.24 * s * k); S(`bst${n}`, 1.15 * k, 0, 0); S(`bhk${n}`, -0.85 * k, 0, 0);
        }
        this.visual.position.y = -0.55 * k;
        this.visual.rotation.z = 0.12 * k;
        break;
      }
      case 'death': {
        // the legs fold first, then the whole frame tips over sideways
        const k = Math.min(1, this.stateTime / 0.7);
        const e = 1 - Math.pow(1 - k, 3);
        this.visual.rotation.z = e * 1.5;
        this.visual.position.y = -0.85 * e;
        S('spine', 0.22 * e, 0, 0);
        neck(0.85 * e, 0.35 * e, 0);
        S('jaw', 0.4 * e, 0, 0);
        S('tail1', 0.35 * e, 0.3 * e, 0); S('tail2', 0.25 * e, 0.35 * e, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          S(`fsh${n}`, 0.75 * e, 0, 0); S(`fkn${n}`, -1.5 * e, 0, 0); S(`fca${n}`, 1.1 * e, 0, 0);
          S(`bhp${n}`, -0.85 * e, 0, 0); S(`bst${n}`, 1.55 * e, 0, 0); S(`bhk${n}`, -1.15 * e, 0, 0);
        }
        break;
      }
      default: {
        // grazing. Muzzle in the grass with a slow side-to-side crop, then
        // every few seconds the head comes up, sweeps a look around, and goes
        // back down. Ears and tail keep flicking throughout.
        const lift = Math.pow(Math.max(0, Math.sin(t * 0.28)), 5);
        const down = 1 - lift;
        const crop = Math.sin(t * 1.9) * down;
        const scan = Math.sin(t * 0.9) * lift;
        const breath = Math.sin(t * 1.5) * 0.025;
        S('spine', breath, crop * 0.05, 0);
        S('chest', breath * 0.6, crop * 0.06, 0);
        neck(down * 1.05 + breath, crop * 0.55 + scan * 1.1, crop * 0.35);
        // little chewing motion while the head is down
        S('jaw', 0.08 + Math.max(0, Math.sin(t * 6.2)) * 0.20 * down, 0, 0);
        S('tail1', -0.20, Math.sin(t * 1.7) * 0.35, 0);
        S('tail2', -0.12, Math.sin(t * 1.7 + 0.7) * 0.42, 0);
        for (const s of [-1, 1]) {
          const n = s < 0 ? 'L' : 'R';
          // weight shifts foot to foot; the forelegs splay a little to reach down
          const shift = Math.sin(t * 0.6 + (s < 0 ? 0 : Math.PI)) * 0.05;
          S(`fsh${n}`, 0.16 * down + shift, 0, 0.06 * s * down);
          S(`fkn${n}`, -0.20 - 0.14 * down, 0, 0);
          S(`fca${n}`, 0.18 + 0.10 * down, 0, 0);
          S(`fho${n}`, -0.10, 0, 0);
          S(`bhp${n}`, -0.14 - shift, 0, 0);
          S(`bst${n}`, 0.34, 0, 0);
          S(`bhk${n}`, -0.28, 0, 0);
          S(`bho${n}`, 0.14, 0, 0);
        }
        this.visual.position.y = breath * 0.4;
        this.visual.rotation.z = 0;
        break;
      }
    }
  }
}

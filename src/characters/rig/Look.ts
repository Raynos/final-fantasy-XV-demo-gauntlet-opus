import type * as THREE from 'three';
import type { BodyProfileSpec } from './Skeleton.ts';

/**
 * What an author writes to describe one character's appearance.
 *
 * This is the *authored* half of the rig contract: `Cast.ts` and
 * `NpcCast.ts` hold nothing but these, and every builder under
 * `characters/rig/**` reads them. Almost everything is optional because a
 * `Look` is a diff against the reference character — the defaults live in the
 * builder that consumes each field, next to the reasoning for the number.
 *
 * The colour fields come in two flavours on purpose. Anything that ends up in
 * a vertex colour or a material is a hex `number` or a `THREE.Color`; anything
 * painted onto the face canvas is a CSS colour *string*, because it is handed
 * straight to a 2D context.
 */

/**
 * One grooming guide: an authored flow *curve* for a region of the scalp.
 *
 * A tuft's `dir` can only say "every strand here ends up pointing that way",
 * which is a direction field with no shape in it — a strand leaves the scalp and
 * travels in what is nearly a straight line to its tip. That is a quill, and no
 * amount of jitter on a quill makes a groom: there is no parting, no flow across
 * a tuft boundary and no way to say "lie along the skull for four centimetres,
 * then fall".
 *
 * A guide says exactly that, as a cubic Bezier from the root. Each strand bends
 * as an inverse-square blend of its **two nearest** guides, which is what makes
 * a few hundred independent ribbons read as one continuous mass: neighbouring
 * strands either side of a tuft boundary see the same two guides and agree, and
 * a parting appears wherever two adjacent guides send hair opposite ways.
 *
 * The curve is **scale-free** — `Hair.ts` normalises it by `|c3|` — so it carries
 * shape only and the tuft's own `len` still sets the strand's length in metres.
 * That keeps every length already tuned in `Cast.ts` meaningful.
 *
 * Ported from `final-fantasy-XV-demo-opus`'s `src/actors/body/hair.ts`, whose
 * grooming model is described in `docs/plans/2026-08-21-fable-procedural-modeling.md`
 * §8.3. Theirs grows alpha cards directly off the guides; ours keeps this repo's
 * tufts as the root *placement* and takes only the flow, which is the part we
 * were missing.
 */
export interface HairGuide {
  /** scalp anchor azimuth in radians — same convention as `HairTuft.th`, 0 is front. */
  th: number;
  /** scalp anchor elevation: 0 at the crown, 1 at the hairline. */
  v: number;
  /** first Bezier handle, canonical head space. Near-tangential keeps hair *on* the head. */
  c1: number[];
  c2: number[];
  /** the tip, relative to the root. Its direction is the strand's overall fall. */
  c3: number[];
}

/** One clump of hair strands: where it roots, which way it flows, how it tapers. */
export interface HairTuft {
  /** azimuth range on the skull, `[from, to]` radians. */
  th: number[];
  /** styled flow direction the strand bends toward. Ignored when guides apply. */
  dir: number[];
  /**
   * Opt out of the style's grooming guides, keeping the `dir`/`out`/`bend` path.
   * Beards and other `absPhi` tufts opt out automatically: they are not on the
   * scalp, so the guides' `(th, v)` coordinates do not describe them.
   */
  guided?: boolean;
  /** strands to emit (default 8). */
  n?: number;
  /** elevation range, `[from, to]`; a fraction of the hairline unless `absPhi`. */
  phi?: number[];
  /** read `phi` as a real polar angle — beards, sideburns, jaw stubble. */
  absPhi?: boolean;
  /** jitter on the root azimuth. */
  thJit?: number;
  /** lift the root off the scalp shell. */
  lift?: number;
  /** strand length in canonical head metres. */
  len?: number;
  lenVar?: number;
  /** how far the root direction starts from the surface normal, 0..1. */
  out?: number;
  dirJit?: number;
  /** how much of the way to `dir` the strand has turned by its tip. */
  bend?: number;
  bendPow?: number;
  /** sideways bow, peaking mid-strand. */
  bow?: number;
  /** how hard the strand is held against the skull, 0..1. */
  hug?: number;
  /** how far off the skull the hug target floats by the tip. */
  puff?: number;
  /** droop under gravity. */
  sag?: number;
  curl?: number;
  /** control points along the strand (default 4, or 5 for long strands). */
  segs?: number;
  /** ribbon subdivisions along the strand. */
  steps?: number;
  /** points on the ribbon cross section. */
  sides?: number;
  width?: number;
  /** cross-section depth as a fraction of `width`. */
  thick?: number;
  /** tip sharpness, 0 blunt .. ~1.2 needle. */
  spike?: number;
  /** ribbons emitted per root — several locks sharing a root and splaying. */
  clump?: number;
  splay?: number;
  /**
   * Emit this tuft as opaque tubes rather than as alpha cards.
   *
   * The default is cards for anything on the scalp; `absPhi` tufts (beards,
   * sideburns, stubble) opt out by construction because they are 5-8 mm long
   * and a 15 mm card is wider than the hair it would carry. Set `false` only
   * with a *pixel* reason — see `emitCard` in `Hair.ts`, whose whole premise is
   * that a sub-pixel opaque tube can only shimmer.
   */
  cards?: boolean;
  /** card width multiplier on the style's 12-18 mm band. */
  cardW?: number;
  /** weight on the `tail` spring bone, so the tuft swings. */
  spring?: number;
  rough?: number;
  color?: number;
  tipColor?: number;
}

/** A hairstyle: the scalp shell's shape and value, plus its tufts. */
export interface HairStyle {
  color: number;
  tufts: HairTuft[];
  /**
   * The groom's flow field. Two or more enable the guide path for every scalp
   * tuft that does not set `guided: false`; absent, tufts keep the `dir` path.
   */
  guides?: HairGuide[];
  tipColor?: number;
  rough?: number;
  /** scalp shell standoff in canonical head metres. */
  shell?: number;
  /** multiplier on `shell` — the mass of the style. */
  volume?: number;
  /** extra shell relief as a function of `(theta, tFromHairline)`. */
  shellShape?: (theta: number, t: number) => number;
  /** raise or lower the whole hairline. */
  hairline?: number;
  /** how far the hairline drops at the temples. */
  temple?: number;
  /** widow's peak. */
  peak?: number;
  /** how far the hairline rises to clear the ear. */
  earNotch?: number;
  /** fine strands crossing the hairline, so the shell edge is not a seam. */
  wisps?: number;
  wispLen?: number;
  /**
   * Flyaways riding *outside* the scalp shell, so the head's outline is broken
   * by strands rather than being the shell's own edge. See the halo pass in
   * `Hair.ts` for why a groom made entirely of guided locks cannot do this.
   */
  halo?: number;
  /** how far the halo floats off the shell, as a multiple of the shell standoff. */
  haloLift?: number;
  /**
   * Cards emitted per authored root, 0..1 (default 0.25).
   *
   * A card carries 5-7 filaments in its cutout, so it replaces a whole clump of
   * tubes, and it is 6-8x their width. `Cast.ts`'s root counts are still what
   * sets a style's *distribution*; this sets how many cards that distribution
   * is resolved into. See the block comment at `cardDensity`'s use in
   * `Hair.ts` for the coverage arithmetic.
   */
  cardDensity?: number;
  /** default `clump` for tufts that do not set their own. */
  clump?: number;
}

/** Eyebrow ribbons. */
export interface BrowSpec {
  /** defaults to the hair colour. */
  color?: number;
  /** length in canonical head metres. */
  len?: number;
  width?: number;
  /** raise or lower the whole brow. */
  lift?: number;
}

/** A painted scar, authored as two canonical head-space points. */
export interface ScarSpec {
  from: number[];
  to: number[];
  /** CSS colour — this is painted onto the face canvas. */
  color?: string;
  /** stroke width in texels. */
  width?: number;
}

/** Gloves: the hand geometry re-coloured and given a cloth response. */
export interface GloveSpec {
  color: number | THREE.Color;
  rough?: number;
}

/**
 * One garment, as an author writes it.
 *
 * The `type` selects a builder from `Outfit.PIECES` at runtime, by string, so
 * this cannot be a discriminated union: the dispatch the compiler would need to
 * narrow on does not exist until the table is indexed. It is therefore one
 * authored spec covering every piece, grouped below by which builder reads
 * which field. A field a piece does not read is simply ignored by it.
 */
export interface OutfitPiece {
  /** which builder in `Outfit.PIECES` renders this piece. */
  type: string;

  // ---- shared: every sweep-based piece --------------------------------
  /** base colour, applied before the piece runs. */
  color?: number;
  rough?: number;
  metal?: number;
  /** start / end parameter on the body sweep the piece is cut from. */
  u0?: number;
  u1?: number;
  /** a single parameter, for the pieces that are a band rather than a tube. */
  u?: number;
  /** radial padding off the body, in metres. */
  pad?: number;
  padZ?: number;
  steps?: number;
  seg?: number;
  /** amplitude of the procedural creases. */
  wrinkle?: number;
  /** raised topstitch height along the seams. */
  seamRib?: number;
  /** angles the seams run down. */
  seams?: number[];
  seamW?: number;
  /** parameter of the yoke seam. */
  yoke?: number;
  /** parameter the hem wear is centred on. */
  hemAt?: number;
  /** overall wear amount. */
  wear?: number;
  /** which sides to mirror the piece onto — `'L'` and/or `'R'`. */
  sides?: string[];
  /** single side, for the pieces that only ever have one (`strap`). */
  side?: string;

  // ---- shirt ----------------------------------------------------------
  neckCut?: number;
  chest?: number;
  neckRib?: number;
  hemRib?: number;
  /** chest print mask in sweep space, 0..1. */
  print?: (theta: number, t: number) => number;
  printColor?: number;
  /**
   * The print is drawn as its own re-swept decal patch rather than as vertex
   * colour on the garment, because at the garment's own vertex density a chest
   * logo is about nine vertices across and renders as a blur no falloff tuning
   * can rescue. These size that patch.
   */
  printWindow?: number[];
  /** Lift of the patch off the garment, metres. Tapers to zero at the border. */
  printLift?: number;
  printSteps?: number;
  printSeg?: number;
  hemBand?: boolean;

  // ---- jacket / collar ------------------------------------------------
  /** half-angle of the open front. */
  gap?: number;
  thickness?: number;
  flare?: number;
  waist?: number | false;
  hemBreak?: number;
  /** raised placket inboard of each front edge. */
  placket?: number;
  /** how far the top edge follows the trapezius down. */
  shoulderDrop?: number;
  collar?: false;
  collarH?: number;
  collarR?: number;
  collarY?: number;
  collarGap?: number;
  collarFlare?: number;
  collarColor?: number;
  collarRough?: number;

  // ---- skirt ----------------------------------------------------------
  top?: number;
  bottom?: number;
  rTop?: number;
  rBot?: number;
  /** weight handed to the coat spring bones at the free hem. */
  spring?: number;
  depth?: number;
  wave?: number;
  backLong?: number;

  // ---- sleeve ---------------------------------------------------------
  cuff?: number;
  cuffBand?: boolean;
  cuffColor?: number;
  taper?: number;
  shoulderPad?: number;

  // ---- pants ----------------------------------------------------------
  padHip?: number;
  padAnkle?: number;
  knee?: number;
  cargo?: number;
  boot?: number;
  waistColor?: number;

  // ---- boots ----------------------------------------------------------
  width?: number;
  height?: number;
  sole?: number;
  soleColor?: number;
  /** parameter on the leg sweep the shaft reaches up to. */
  shaft?: number;
  strap?: boolean;
  strapColor?: number;

  // ---- jacket hardware -------------------------------------------------
  // Panels alone read as a shell. See `hardware()` in `rig/Outfit.ts`: at a
  // metre the difference between "a black garment" and "a tailored one" is
  // pockets, studs, tabs and a zip slider, and all of it is geometry, so it
  // catches a real specular edge from any direction and survives minification
  // in a way a painted line does not.
  /** flapped patch pockets on the chest, each closed by a stud. */
  pockets?: boolean;
  /** azimuth of the pocket pair, radians either side of centre front. */
  pocketTh?: number;
  /** height of the pocket on the jacket sweep, 0 hem .. 1 shoulder. */
  pocketT?: number;
  pocketW?: number;
  /** buttoned strap across each shoulder. */
  epaulettes?: boolean;
  epauletteTh?: number;
  /** zip tape down both front edges, plus the slider. */
  zip?: boolean;
  /** where the slider sits on the sweep. */
  zipAt?: number;
  /** metal colour for studs, buttons and the zip slider. */
  studColor?: number;

  // ---- belt / band / pad / pouch / camera / plate ----------------------
  buckle?: number;
  buckleBox?: boolean;
  buckleColor?: number;
  /** ribbing amplitude on a wrist band. */
  ridge?: number;
  /** shoulder pad radius / lift / squash. */
  r?: number;
  lift?: number;
  squash?: number;
  /** block size for a pouch, `[x, y, z]`. */
  size?: number[];
  /** where a camera body hangs, in body-height units. */
  at?: number[];
  /** where a strap ends, in body-height units. */
  to?: number[];
  /** angular span of a decorative plate, `[theta0, theta1]`. */
  theta?: number[];
}

/**
 * A character's appearance. See the field docs; everything optional has its
 * default at the point of use.
 */
export interface Look {
  /** seeds every `Rng`/`Noise` in the face, hair and texture builders. */
  seed: number;
  skin: THREE.Color;
  hair: HairStyle;
  outfit: OutfitPiece[];

  // ---- pose -----------------------------------------------------------
  /** hand-authored rest offsets, bone name -> XYZ Euler radians. */
  idle?: Record<string, number[]>;
  /** which foot the weight sits on at rest, −1 left .. +1 right. */
  stance?: number;

  // ---- face shape -----------------------------------------------------
  /** −1 fine .. +1 square and heavy. */
  jaw?: number;
  cheek?: number;
  nose?: number;
  brow?: number;
  /** multiplier on the skull's X half-extent. */
  headWidth?: number;
  /** multiplier on the lid opening, 1 being the reference eye. */
  eyeOpen?: number;

  // ---- eyes -----------------------------------------------------------
  iris?: number;
  lashColor?: number;
  /** CSS colour of the painted lash line. */
  lash?: string;
  /** spectacle lenses over the eyes. */
  lenses?: boolean;

  // ---- painted face map (CSS colours: these go to a 2D context) --------
  blush?: string;
  lip?: string;
  browShadow?: string;
  /** 0..1 — how much five-o'clock shadow the jaw carries. */
  stubble?: number;
  stubbleColor?: string;
  freckles?: boolean;
  freckleColor?: string;
  scar?: ScarSpec;
  /** how dark a shadow the fringe throws on the forehead. */
  fringeShadow?: number;

  // ---- extras ---------------------------------------------------------
  brows?: BrowSpec;
  gloves?: GloveSpec;
  /** ink mask in torso-sweep space, 0..1 — see `Cast.eagleInk`. */
  tattoo?: (theta: number, t: number) => number;
}

/** One entry of `CAST` / `NPC_CAST`: who they are, how they are built. */
export interface CharacterDef {
  name: string;
  profile?: BodyProfileSpec;
  look: Look;
}

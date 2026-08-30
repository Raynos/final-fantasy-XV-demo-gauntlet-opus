import * as THREE from 'three';
import { Noise } from '../../util/Noise.ts';
import { Rng } from '../../util/Rng.ts';
import { coverY } from './Seat.ts';
import type { Ecology } from '../veg/Ecology.ts';

/**
 * How a built place meets the land: wear as a distance field, and the pad as a
 * measured cut-and-fill platform.
 *
 * Two defects this file exists to fix, both named in
 * `docs/plans/2026-08-21-fable-procedural-modeling.md` §5.4 and both visible in
 * `tmp/shots/kits-r0b/poi_alstor_haven.png` — a cream disc standing a metre and
 * a half proud of the grass on a vertical faceted skirt, with a ring of white
 * boulders round its foot and no trace of anybody ever having walked to it.
 *
 * ## 1. Wear has to be a texture, and it has to store distance
 *
 * The obvious construction is a per-vertex mask: rasterise the paths, ask each
 * vertex whether it is on one, write 1 or 0. It does not survive, and the
 * reason is arithmetic rather than taste. A path is 1.5 m wide and the pad
 * lattice is 1.5-1.7 m, so on average a path passes *between* two vertices; the
 * mask is 0 at both, and the linear reconstruction between them is 0 as well.
 * The sibling measured the peak reconstructed value of a 1.5 m path on a 1.7 m
 * lattice at **0.31** of what was authored — a path that is there in the data
 * and gone in the frame. {@link reconstructionTest} runs that same comparison
 * on our own numbers and is the check this item ships with.
 *
 * A **distance field** survives, because bilinear interpolation of a linear
 * ramp *is* the ramp. So {@link WearField} rasterises `distance to the nearest
 * path centreline` at 0.5 m per texel, hands it to the GPU as an 8-bit texture,
 * and lets the shader do the thresholding after the interpolation rather than
 * before it. That ordering is the whole item.
 *
 * ## 2. A pad is an earthwork, not a plinth
 *
 * {@link gradePad} builds the platform as a real cut-and-fill: the deck is
 * level, the ground is not, and the difference is carried by a batter that runs
 * out until it *meets the ground at whatever height the ground happens to be*
 * and then buries itself. That is the single difference between a platform and
 * a cake stand — a cake stand has a bottom edge, an earthwork does not.
 *
 * Four things it does that a cylinder cannot:
 *
 * - **It measures its own fill.** `cut` and `fill` come back in cubic metres,
 *   summed over the grid, so the spoil that appears on the cut side is the
 *   spoil the cut actually produced.
 * - **1:3 fill, 1:1.5 cut, and a 1:9 ramp** written down the road bearing —
 *   the slopes a wheeled machine can actually build and drive.
 * - **Spoil berms ride the pad isoline**, not a circle: they sit on the crest
 *   where the batter meets the hillside, which is where a dozer leaves them.
 * - **The outline wobbles.** A perfectly offset rounded rectangle of earthwork
 *   is the tell — real cut lines wander with the material. Two octaves of
 *   angular noise, ~8% of the radius.
 */

/* ========================================================================== */
/* Wear fields                                                                */
/* ========================================================================== */

/** Metres of world per texel. The plan's number, and it is a resolution floor. */
export const WEAR_MPT = 0.5;
/**
 * How far the stored distance ramp runs before it saturates, in metres.
 *
 * Everything past this is "not worn" and stores 0. It has to be several times
 * the widest path or the ramp has nowhere to be a ramp — which is the mask
 * failure again, just with a coarser staircase.
 */
export const WEAR_REACH = 6.0;

/** A polyline someone walks along, in the field's own local frame. */
export interface WearLine {
  /** `[x0, z0, x1, z1, ...]`, metres, local to the field centre. */
  pts: number[];
  /** Half-width of the trodden strip, metres. */
  half: number;
  /** 0..1 — how hard the ground is worn along it. */
  weight?: number;
}

/**
 * A square raster of `distance to the nearest worn thing`, centred on a place.
 *
 * The stored byte is `clamp(1 - d / reach) * weight`, i.e. **1 on the
 * centreline falling linearly to 0 at `reach`**. Storing the ramp rather than
 * the threshold is what makes it survive magnification: the texture is sampled
 * at 0.5 m/texel and drawn across a pad whose triangles are metres wide, so
 * every visible pixel is an interpolation between texels and nothing else.
 */
export class WearField {
  /** World x of the field centre. */
  cx: number;
  /** World z of the field centre. */
  cz: number;
  /** Half-width of the covered square, metres. */
  half: number;
  /** Texels per side. */
  n: number;
  /** Row-major `n * n`, 0..1. */
  data: Float32Array;

  constructor(cx: number, cz: number, half: number, mpt = WEAR_MPT) {
    this.cx = cx;
    this.cz = cz;
    this.half = half;
    // Cap the raster so a 60 m imperial compound cannot ask for 240x240 texels
    // at half-metre resolution and then be sampled at ten metres per pixel
    // anyway. 128 is 0.5 m/texel out to a 32 m half-width and degrades
    // gracefully past it.
    this.n = Math.min(128, Math.max(16, Math.ceil((half * 2) / mpt)));
    this.data = new Float32Array(this.n * this.n);
  }

  /** Metres of world per texel, after the size cap. */
  get mpt() { return (this.half * 2) / this.n; }

  /** Local metres -> texel coordinate (fractional). */
  _toTexel(x: number, z: number) {
    const s = this.n / (this.half * 2);
    return [(x + this.half) * s, (z + this.half) * s];
  }

  /**
   * Stamp one trodden polyline into the field.
   *
   * Distance is taken to the **segment**, not to its endpoints, so a dog-leg in
   * a desire line does not pinch. The write is a `max`, so two paths crossing
   * make a junction rather than a double-dark patch.
   */
  addLine(l: WearLine) {
    const w = l.weight ?? 1;
    const reach = WEAR_REACH;
    const m = this.mpt;
    for (let k = 0; k + 3 < l.pts.length; k += 2) {
      const ax = l.pts[k], az = l.pts[k + 1];
      const bx = l.pts[k + 2], bz = l.pts[k + 3];
      const lo = this._toTexel(Math.min(ax, bx) - reach - l.half, Math.min(az, bz) - reach - l.half);
      const hi = this._toTexel(Math.max(ax, bx) + reach + l.half, Math.max(az, bz) + reach + l.half);
      const i0 = Math.max(0, Math.floor(lo[0])), i1 = Math.min(this.n - 1, Math.ceil(hi[0]));
      const j0 = Math.max(0, Math.floor(lo[1])), j1 = Math.min(this.n - 1, Math.ceil(hi[1]));
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz || 1e-6;
      for (let j = j0; j <= j1; j++) {
        const pz = (j + 0.5) * m - this.half;
        for (let i = i0; i <= i1; i++) {
          const px = (i + 0.5) * m - this.half;
          let t = ((px - ax) * dx + (pz - az) * dz) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = px - (ax + dx * t), ez = pz - (az + dz * t);
          const d = Math.max(0, Math.hypot(ex, ez) - l.half);
          if (d >= reach) continue;
          const v = (1 - d / reach) * w;
          const o = j * this.n + i;
          if (v > this.data[o]) this.data[o] = v;
        }
      }
    }
  }

  /** Stamp a worn disc — a fire ring, a turning circle, a pump island. */
  addDisc(x: number, z: number, r: number, weight = 1) {
    this.addLine({ pts: [x, z, x + 1e-4, z], half: r, weight });
  }

  /** Sample the field with bilinear reconstruction — what the GPU will see. */
  sample(x: number, z: number) {
    const [u, v] = this._toTexel(x, z);
    const fu = u - 0.5, fv = v - 0.5;
    const i0 = Math.floor(fu), j0 = Math.floor(fv);
    const tu = fu - i0, tv = fv - j0;
    const at = (i: number, j: number) => {
      if (i < 0 || j < 0 || i >= this.n || j >= this.n) return 0;
      return this.data[j * this.n + i];
    };
    const a = at(i0, j0) * (1 - tu) + at(i0 + 1, j0) * tu;
    const b = at(i0, j0 + 1) * (1 - tu) + at(i0 + 1, j0 + 1) * tu;
    return a * (1 - tv) + b * tv;
  }

  /**
   * Multiply the wear into a geometry's vertex colours, sampled at its own
   * vertices — the cheap carrier, and the one the 124 POI aprons use.
   *
   * The plan asks for a texture and {@link applyWear} is that. It is the right
   * answer where there is one pad (Hammerhead), and the wrong one at 124,
   * because a per-place field means a per-place material, and a material split
   * is a **draw call** — 8.7 µs each against a budget of 800, with ten POIs in
   * frame in a wide shot. So the aprons carry the field in `attributes.color`
   * instead.
   *
   * That is not the failure the plan measured. What fails as vertex data is a
   * **mask**: 1 inside the path, 0 outside, on a lattice coarser than the path,
   * reconstructing to 0.31 of the authored value. A *ramp* interpolates
   * linearly across a triangle, which is exactly what it did in the texture —
   * the encoding is what survives, not the carrier. {@link reconstructionTest}
   * measures both and is what this claim rests on.
   *
   * @param g       a geometry whose `uv` is world metres about the field centre
   * @param strength how dark the fully worn ground goes, 0..1
   */
  sampleInto(g: THREE.BufferGeometry, strength = 0.34, lo = 0.18, hi = 0.72) {
    const uv = g.attributes.uv, col = g.attributes.color;
    if (!uv || !col) return g;
    for (let i = 0; i < uv.count; i++) {
      const d = this.sample(uv.getX(i), uv.getY(i));
      const w = Math.max(0, Math.min(1, (d - lo) / (hi - lo)));
      const k = 1 - strength * w * w * (3 - 2 * w);
      col.setXYZ(i, col.getX(i) * k, col.getY(i) * k * 0.985, col.getZ(i) * k * 0.96);
    }
    col.needsUpdate = true;
    return g;
  }

  /**
   * The 8-bit texture the pad material samples.
   *
   * `LinearFilter` on purpose and it is the point of the whole class: the
   * interpolation happens on the *distance*, and the shader thresholds after.
   * `ClampToEdgeWrapping` because the field is a place, not a tile.
   */
  texture(): THREE.DataTexture {
    const bytes = new Uint8Array(this.n * this.n);
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.round(Math.min(1, this.data[i]) * 255);
    const t = new THREE.DataTexture(bytes, this.n, this.n, THREE.RedFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  }
}

/**
 * Walk a desire line between two places.
 *
 * People do not walk the straight line and they do not walk a smooth curve
 * either: they leave the direct route where the ground makes them and rejoin
 * it, so a real path is the straight line plus a couple of low-frequency
 * lateral wanders. Three control points is enough to read as a path and few
 * enough that the raster stays cheap.
 */
export function desireLine(
  ax: number, az: number, bx: number, bz: number, rng: Rng, sway = 0.11,
): number[] {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len, nz = dx / len;
  const pts: number[] = [];
  const N = Math.max(3, Math.round(len / 6));
  // Two sine lobes at random phase, tapering to zero at both ends: a path is
  // pinned at its destinations and free in between.
  const p1 = rng.range(0, Math.PI * 2), p2 = rng.range(0, Math.PI * 2);
  const a1 = rng.gauss(0, sway) * len, a2 = rng.gauss(0, sway * 0.45) * len;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const taper = Math.sin(Math.PI * t);
    const off = taper * (a1 * Math.sin(t * Math.PI + p1) + a2 * Math.sin(t * Math.PI * 3 + p2));
    pts.push(ax + dx * t + nx * off, az + dz * t + nz * off);
  }
  return pts;
}

/* ========================================================================== */
/* The pad                                                                    */
/* ========================================================================== */

export interface PadOpts {
  /** For terrain heights and the drawn-surface envelope. */
  eco: Ecology;
  /** World centre. */
  x: number;
  /** World centre. */
  z: number;
  /** Deck height, world y — what the kit builds on. */
  base: number;
  /** Nominal deck radius, metres. */
  r: number;
  /** Seeds the outline wobble and the spoil. */
  seed: number;
  /** How far this kind of place is still drawn; picks the clipmap ring. */
  cull?: number;
  /** Bearing (radians, world) of the road approach; a 1:9 ramp is cut down it. */
  rampYaw?: number | null;
  /** Fill batter, run per unit rise. 3 is a dozed embankment. */
  fill?: number;
  /** Cut batter, run per unit rise. Steeper than fill: it stands in situ. */
  cut?: number;
  /** Outline wobble as a fraction of `r`. */
  wobble?: number;
  /** Angular / radial resolution. */
  seg?: number;
}

export interface PadResult {
  /** Local to the POI group: y is relative to `base`, x/z in the world frame. */
  geo: THREE.BufferGeometry;
  /** Cubic metres of material carted in, measured over the grid. */
  fill: number;
  /** Cubic metres cut out of the hill, measured over the grid. */
  cut: number;
  /** Furthest the earthwork reaches from the centre, metres. */
  toe: number;
  /** The wobbled deck edge at a world bearing. */
  edgeAt(theta: number): number;
  /** Where the spoil ended up: local `[x, z, scale]` triples, on the isoline. */
  spoil: number[][];
}

/**
 * The engineered platform every settlement, camp and compound stands on.
 *
 * Built as a polar grid from the centre out. Inside the wobbled deck edge it is
 * dead level; outside, it runs down (or up) a constant batter until it reaches
 * the drawn ground, and the last ring is pushed 120 mm *under* that ground so
 * the earthwork emerges from the terrain instead of ending on a coplanar line.
 *
 * `coverY` rather than `seatY`: this is the one class of object whose whole job
 * is to be visible lying flat, and `Seat.ts` records the sibling's apron built
 * on the lower envelope that produced 12,450 frustum pixels with none of them
 * passing the depth test.
 *
 * Vertex colours carry the material story — deck, batter, spoil — so one
 * material draws the whole earthwork in one call.
 */
/** Linear blend of two RGB triples. */
function mix3(a: number[], b: number[], t: number): number[] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function gradePad(o: PadOpts): PadResult {
  const {
    eco, x, z, base, r, seed, cull = 400, rampYaw = null,
    fill = 3, cut = 1.5, wobble = 0.085,
  } = o;
  // Angular resolution. The old floor of 20 gave a haven's 12.6 m pad a 3.9 m
  // facet on its rim, and a wobbled outline sampled at 20 points is not a
  // wandering dozed edge -- it is a scalloped polygon, which is what the
  // coordinator read off `reframe-r2/hav_d.png` as a poker chip. Chord error
  // is what matters, not radius: at 36 segments a 12.6 m rim is 2.2 m per
  // facet and at 64 a 40 m one is 3.9 m. It is one merged mesh either way, so
  // this buys silhouette for triangles and not for draw calls.
  const seg = o.seg ?? Math.max(36, Math.min(64, Math.round(r * 2.2)));
  const rng = new Rng((seed >>> 0) * 2654435761 % 4294967291);
  const nz2 = new Noise(seed ^ 0x9e37);

  // The wobbled deck edge. Two octaves in *angle*, so the cut line wanders the
  // way a dozed edge does rather than scalloping regularly.
  const edgeAt = (th: number) => {
    const w = nz2.simplex2(Math.cos(th) * 1.7, Math.sin(th) * 1.7) * 0.68
      + nz2.simplex2(Math.cos(th) * 4.3 + 11, Math.sin(th) * 4.3 - 7) * 0.32;
    return r * (1 + wobble * w);
  };

  // Radial stations: dense across the batter, sparse on the deck, because the
  // deck is flat and the batter is where every silhouette comes from.
  const rings: number[] = [];
  const nDeck = Math.max(3, Math.round(r / 6));
  for (let i = 0; i <= nDeck; i++) rings.push(i / nDeck);           // 0..1 of edge
  const OUT = 14;                                                   // batter stations
  for (let i = 1; i <= OUT; i++) rings.push(1 + i / OUT);           // 1..2 of edge+reach

  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const spoil: number[][] = [];
  let fillV = 0, cutV = 0, toe = 0;

  // Deck, batter and spoil colours. Multiplied into one flat ground material,
  // so this is where "poured surface / raw fill / cast-up spoil" is decided.
  const C_DECK = [1.0, 1.0, 1.0];
  /**
   * **Three values down the batter, not one.**
   *
   * The batter was a single flat `C_BATTER` from the deck edge to the toe. That
   * is the second half of the cake stand and it survived the whole earthwork
   * rewrite: `gradePad` gave the pad a wobbled outline, a measured cut and fill,
   * a 1:9 ramp and a buried toe, and then painted the entire embankment one
   * colour and ran it down a straight 1:3 line. A ruled surface in one value is
   * a cone whatever its outline does, and a cone at 30 m across is what
   * `tmp/shots/lm-hv/pad.png` shows.
   *
   * A real fill weathers into three bands within a season. The crest is scoured
   * — raw material, the palest thing on the pad. The face is the mean. The toe
   * is where every fine that washes off the face ends up, plus the first grass:
   * darker and slightly greener. So the value ramps `CREST -> BATTER -> TOE`
   * with `u`, the fraction of the way down the batter, and the rill field
   * modulates it, because a gully is a wash channel and its floor carries more
   * fines than the interfluve beside it.
   */
  const C_CREST = [0.94, 0.905, 0.855];
  const C_BATTER = [0.86, 0.825, 0.78];
  const C_TOE = [0.70, 0.685, 0.655];
  const C_SPOIL = [0.74, 0.70, 0.65];
  /** A cut face, not a fill: darker than the toe and with none of its bleach. */
  const C_SCARP = [0.58, 0.555, 0.525];

  const groundAt = (wx: number, wz: number) => coverY(eco, wx, wz, r * 0.35, cull) - base;
  /**
   * The ground the earthwork has to **bury itself under**, which is not the one
   * it is **seated against**.
   *
   * `coverY` is `Terrain.drawnEnvelope`, and that is an *upper* envelope: the
   * highest this point is drawn at any clip level in the neighbourhood. That is
   * the right answer for a seat — a compound placed against the lowest reading
   * sinks into its own hill as soon as the LOD coarsens — and it is exactly the
   * wrong answer for a toe, which has to be under the surface at **every** LOD
   * or it stands out of it at one of them. Measured at the four worst pads: the
   * upper envelope runs 0.3 m over the finest drawn ground at `tomb_conqueror2`
   * and **11.2 m** over it at `tomb_fierce`, which is most of that pad's 21 m
   * of hang all on its own.
   *
   * So the batter grades against the *lower* envelope over the same clip range,
   * and everything about the deck — its size, its retreat, the cut and fill
   * volumes — stays on the upper one. Two questions, two answers; stating one
   * in the other's frame is the error class this file has now paid for twice.
   */
  const _t = eco.terrain;
  const _cell0 = _t && _t.clipmap ? _t.clipmap.cell0 : 1.5;
  const _coarse = _t && typeof _t.clipSpacingForDistance === 'function'
    ? _t.clipSpacingForDistance(cull) : _cell0;
  const groundLo = (wx: number, wz: number): number => {
    if (!_t || typeof _t.drawnHeightAt !== 'function') return groundAt(wx, wz);
    let lo = eco.height(wx, wz);
    for (let c = _cell0; c <= _coarse + 1e-6; c *= 2) lo = Math.min(lo, _t.drawnHeightAt(wx, wz, c));
    return lo - base;
  };
  /**
   * How far below the deck the DECK RETREAT may look before it stops retreating.
   *
   * Was also the batter's reach limit, and that was the bug: see `catchSlope`.
   * The retreat is a question about the deck's own size and it is properly
   * scaled to the deck; the batter's reach is a question about the hillside and
   * it is not.
   */
  const deckPlunge = Math.max(6, r * 0.5);
  /**
   * The gentlest fill face this pad will ever build, as **run per unit drop**.
   *
   * `fill` is 3 — a 1:3 embankment, 18 degrees. Leide is not 18 degrees. A
   * batter gentler than the ground it is chasing never catches it, so it stays
   * above the hillside all the way out to the reach cap and then stops, and
   * what that draws is a disc of ground floating over a slope. `catchSlope`
   * below solves for the gentlest face that actually lands, and this is the
   * floor: 1:0.45 is 66 degrees, a rock-cut scarp. Past it there is no
   * earthwork, the ground itself is the wall, and the kerb is right.
   */
  const SCARP = 0.45;
  /**
   * The deepest this pad's fill will ever reach, in metres below the deck.
   *
   * Not an engineering number — a fill can be built to any depth — but a
   * compositional one. `1:3 over capOut` could only ever descend `capOut / 3`,
   * which is 7 m on a thirteen-metre pad; letting the solved slope descend
   * without a limit instead put 46 m of smooth pale fill across a red cliff
   * face at three of the Keycatrich sites, and that is a bigger lie than the
   * saucer it replaced. Ten metres on a small pad and eighteen on a town's is
   * a spur; past it the pad is on a brink and takes the kerb.
   */
  const FILL_MAX = Math.min(18, Math.max(10, r * 0.5));
  /**
   * How far under the ground the earthwork buries itself once it has met it.
   *
   * Not a constant, and that is the difference between a toe and an outline. A
   * constant burial makes the fill vanish along a smooth curve — a *drawn line*
   * round the place at exactly the radius the batter happened to reach, which
   * is the cake stand's bottom edge returning in a new costume. Two octaves of
   * world-space noise either side of grade instead, so the crossing wanders and
   * the fill fingers out into the grass the way spread material does.
   */
  const bury = (wx: number, wz: number) => 0.16
    - 0.30 * nz2.fbm2(wx * 0.13, wz * 0.13, 2)
    - 0.10 * nz2.fbm2(wx * 0.41 + 31, wz * 0.41 - 17, 2);

  /**
   * **Rills: the reason a smooth batter reads as a cake stand.**
   *
   * Everything else on this pad is right and the face is still a ruled surface.
   * Wobbling the *outline* does nothing about that — the outline is what
   * `edgeAt` already fixed, and the coordinator still read the result as a
   * poker chip — because what says "turned on a lathe" is a constant slope with
   * no cross-section, not a circular plan. Water does not run off an embankment
   * evenly; it collects into shallow gullies every few metres and the ground
   * between them stands up as an interfluve.
   *
   * The frequency is **world-referenced, and it has to be**. A rill every 5 m
   * of rim is what an embankment looks like; a fixed number of rills round the
   * circle would give a 52 m town pad gullies eleven metres apart and an 8 m
   * waymark gullies at the resolution of its own facets. `k` converts a wanted
   * rill spacing into the radius at which to sample a 2-D noise on the unit
   * circle — `simplex2` has about one feature per unit, so a circle of radius
   * `k` carries `2*pi*k` of them — and it is capped at `seg/14` so the field is
   * always oversampled by the geometry rather than aliased into a scallop,
   * which is the same Nyquist argument `edgeAt`'s segment floor is written on.
   *
   * `max(0, …)` and not the raw field: a rill is a CUT. Letting it go both ways
   * would build ribs standing off the batter, which is a corduroy roof, not an
   * embankment.
   */
  const rillK = Math.max(1.0, Math.min(seg / 14, (2 * Math.PI * r / 5.0) / (2 * Math.PI)));

  /**
   * How far below the deck this bearing's fill may be asked to reach before the
   * deck itself is the thing that is wrong.
   *
   * `plunge` caps the batter, for the reason written on it — an uncapped reach
   * hung a fifty-metre curtain off a pad that clipped a cliff. But a capped
   * batter over ground that is further down than the cap does not *fail*
   * gracefully: it stops in the air, and what you see is a disc on a column.
   * That is `coernix_cauthess`, measured — its deck stands **8.4 to 14.1 m**
   * above the ground at its own edge on four of six bearings, against a plunge
   * of 7.0 m, so seven metres of it is embankment and the rest is nothing.
   */
  const maxFill = deckPlunge * 0.75;
  for (let j = 0; j <= seg; j++) {
    const th = (j / seg) * Math.PI * 2;
    const ct = Math.cos(th), st = Math.sin(th);
    // The deck retreats off ground it cannot be filled up to. A dozer does not
    // cantilever a platform over a drop; it cuts the platform back to the spur
    // it is standing on, and the compound gets smaller on that side. Floored at
    // three quarters of the nominal radius, because the kit's own structures
    // are placed inside that and a deck that retreated past them would strand
    // them in the air — which is the same defect one level in.
    const capOut = r * 1.15 + 6;
    let e = edgeAt(th);
    for (let k = 0; k < 8 && e > r * 0.75; k++) {
      if (groundAt(x + ct * e, z + st * e) > -maxFill) break;
      e = Math.max(r * 0.75, e * 0.9);
    }
    /*
     * ...and where it cannot retreat far enough, it stops being an earthwork.
     *
     * `nebula_parking` sits on a shelf whose ground is dead level out to 12.6 m
     * and then falls **10 to 21 m within the next six**. Its deck is 13 m, so
     * the deck is right — it is exactly the shelf. What was wrong is what came
     * after it: the batter ran out at 1:3, never caught a cliff, and the
     * outermost station's `-plunge` clamp parked it 6.5 m down **in mid air**.
     * A 6.5 m skirt hanging over a 20 m drop is the brim of the mushroom the
     * coordinator read off `reframe-r1/neb_a_high.png`, and the stalk under it
     * is the shelf itself.
     *
     * There is no embankment that fixes that, because there is no embankment: a
     * platform on a cliff shelf ends at the shelf. So on a bearing where the
     * ground is already past the plunge limit, the pad gets a kerb — 1.6 m of
     * chamfer, 0.9 m deep — and the cliff is what holds it up. That reads as
     * what it is, which is the whole of §5.4's argument about the cake stand.
     */
    /*
     * **The gentlest face that actually lands, solved rather than assumed.**
     *
     * This test used to be a boolean — "does the 1:3 line reach the ground at
     * any station out to the cap?" — and if it did not, the bearing gave up and
     * took the 1.6 m kerb on the theory that the terrain was a cliff and would
     * hold the pad up. A 1:3 line is **18 degrees**, and Leide is not 18
     * degrees. So the test fired on ordinary hillside and the pad finished as a
     * disc of ground floating over a slope, which is the cake stand it was
     * written to prevent, one level down.
     *
     * Measured before the change (`probes/padhang.mts`, the toe ring against
     * `drawnHeightAt` at the finest ring): **90 of 91 shipped aprons end above
     * the ground they stand on**, 41 by over a metre and **19 by over six**;
     * `tomb_conqueror2` hangs **22.1 m** — read `tmp/shots/lr2-tombp/float.png`
     * for a temple on a flying saucer. And `probes/cliffwhy` says which clamp
     * did it: on that pad **11 of 36 bearings took the kerb and 4 more took the
     * plunge clamp**, while the ground under them falls 11.7 m on average and
     * 41.6 m at worst.
     *
     * A batter gentler than the ground it is chasing never catches it, whatever
     * you cap its reach at. So solve for the gentlest one that does: at each
     * station a face of slope `s` sits at `-run/s`, so it lands at that station
     * when `s <= run / drop`, and the whole bearing lands when `s` is at or
     * under the **largest** of those ratios. Take that, never gentler than the
     * 1:3 a dozer builds and never steeper than {@link SCARP}; past the floor
     * there genuinely is no embankment and the kerb is right — which is
     * `nebula_parking`, and it still gets one.
     */
    let need = 0, anyDrop = false, deepest = 0;
    for (let k = 1; k <= 6; k++) {
      const run = (k / 6) * capOut;
      const raw = -groundLo(x + ct * (e + run), z + st * (e + run));
      if (raw > deepest) deepest = raw;
      const drop = Math.min(FILL_MAX, raw);
      if (drop > 0.05) { anyDrop = true; need = Math.max(need, run / drop); }
    }
    // `Infinity` means "this bearing is uphill or level and unconstrained".
    const catchSlope = anyDrop ? need : Infinity;
    /*
     * The kerb, and now it has two reasons rather than one.
     *
     * `catchSlope < SCARP` is the wall — the ground goes down faster than fill
     * stands, so there is nothing to embank against. `deepest > FILL_MAX` is
     * the other end, and it is a **composition** limit rather than an
     * engineering one: the first cut of this fix let the batter chase the
     * ground however far it fell, and `tmp/shots/lr2-a1j/tomb_320.jpg` is what
     * that draws — three smooth tan cones up to 46 m tall pasted across a red
     * cliff face, with the temple in front of one of them. The measurement was
     * better (mean toe +1.13 -> -0.92 m) and the frame was worse, and the frame
     * is the bar. A pad on the lip of a forty-metre drop cannot be fixed by
     * making the pad bigger; the pin is on a brink and the earthwork should say
     * so and stop.
     */
    const cliff = anyDrop
      && (catchSlope < SCARP || deepest > FILL_MAX * 1.35)
      && groundLo(x + ct * e, z + st * e) < 0;
    // The ramp. A truck has to get onto the pad, so one sector is graded at
    // 1:9 instead of 1:3 and pushed further out; the transition is smooth in
    // angle or the ramp reads as a wedge glued on.
    let slopeFill = fill;
    if (rampYaw !== null) {
      let d = th - rampYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const k = Math.max(0, 1 - Math.abs(d) / 0.26);
      slopeFill = fill + (9 - fill) * (k * k * (3 - 2 * k));
    }
    // A ramp that runs off a bluff is not a ramp. Where the ground demands a
    // steeper face than the sector wants, the ground wins — on a gentle bearing
    // `catchSlope` is Infinity or well over 9 and this does nothing, which is
    // every ramp that was ever right.
    slopeFill = Math.min(slopeFill, Math.max(SCARP, catchSlope));
    // How far this bearing's batter has to run: measured, not assumed -- and
    // measured ALONG the batter rather than at the deck edge alone.
    //
    // Reading only `groundAt(edge)` is what produced the mushroom in
    // `tmp/shots/reframe-r1/neb_a_high.png`. On a shoulder the ground is level
    // with the deck *at the edge* and then falls away just outside it, so
    // `hEdge` is ~0, the reach comes out at its 3.0 m floor, and the batter has
    // no room: the outermost station then takes the `plunge` clamp below and
    // drops five metres in one ring step. That is a vertical curtain at the rim
    // -- a cap on an undercut stalk. So walk out to the cap and take the
    // deepest ground the batter will actually have to cross.
    let hEdge = groundLo(x + ct * e, z + st * e);
    for (let k = 1; k <= 4; k++) {
      const gk = groundLo(x + ct * (e + (k / 4) * capOut), z + st * (e + (k / 4) * capOut));
      if (gk < hEdge) hEdge = gk;
    }
    // Clamped to the same limit the slope was solved against, or the reach
    // comes back sized for a drop the batter is not allowed to make.
    hEdge = Math.max(hEdge, -FILL_MAX);
    // Capped, and the cap is a composition decision rather than an engineering
    // one: a pad on a real hillside wants forty metres of 1:3 embankment, and
    // forty metres of bare fill is then the largest thing in the frame. Beyond
    // the cap the batter simply meets the ground steeper than a dozer would.
    const reachOut = cliff ? 1.6 : Math.min(
      capOut,
      Math.max(2.5, Math.abs(hEdge) * (hEdge < 0 ? slopeFill : cut) + 3.0),
    );
    /**
     * How deep this bearing's outermost station may go, and it is a property of
     * the hillside rather than of the pad.
     *
     * `deckPlunge` is `max(6, r/2)` — six metres under a thirteen-metre haven —
     * and it used to clamp the last ring as well, so once the ground fell
     * further than that the batter stopped six metres down **in the air** no
     * matter how steep it was allowed to be. Solving the slope without lifting
     * this would have bought nothing: the face would dive correctly and then be
     * cut off at the same height. It follows the ground the bearing actually
     * measured, and is still capped, because a fill that reaches fifty metres
     * down a gorge is the largest object in the frame and belongs to the
     * terrain, not to the pad.
     */
    const reachDown = Math.min(FILL_MAX, Math.max(6, -hEdge + 1.2));
    let crestY = 0, crestS = e;
    // This bearing's place in the rill field, drawn once for the whole radial.
    const rillRaw = nz2.simplex2(ct * rillK, st * rillK) * 0.70
      + nz2.simplex2(ct * rillK * 2.4 + 13, st * rillK * 2.4 - 9) * 0.30;
    const rill = Math.max(0, rillRaw);
    // Depth scales with how far the batter actually falls: a 0.4 m kerb has no
    // rills and a six-metre embankment has real ones. Capped, because past
    // about a metre a gully stops being erosion and starts being a canyon.
    const rillAmp = Math.min(1.05, 0.20 * Math.abs(hEdge)) * rill;

    /*
     * Cumulative surface arc along this bearing, for the V of the world-metre
     * UV -- see the push at the bottom of the loop.
     */
    let arc = 0, prevS = 0, prevY = 0;
    for (let i = 0; i < rings.length; i++) {
      const t = rings[i];
      const s = t <= 1 ? e * t : e + (t - 1) * reachOut;
      const wx = x + ct * s, wz = z + st * s;
      let y: number, c: number[];
      const last = i === rings.length - 1;
      if (t <= 1) {
        y = 0;
        c = C_DECK;
        // Cut and fill, measured on the deck cells: the patch of annulus this
        // station owns, times the gap between the deck and the ground under it.
        const gh = groundAt(wx, wz);
        const dr = e / nDeck;
        const area = (2 * Math.PI * Math.max(s, dr * 0.5) * dr) / seg;
        if (gh < 0) fillV += -gh * area;
        else cutV += gh * area;
      } else if (cliff) {
        /*
         * The kerb, and then a **retaining wall** rather than nothing.
         *
         * The kerb alone was a 0.9 m chamfer that stopped, on the theory that
         * the terrain is the cliff and holds the pad up. Where it really is a
         * cliff that is true and where it is not the pad is a saucer, which is
         * what `catchSlope` above now separates. But even at a genuine brink
         * the chamfer leaves **daylight under the rim** — read
         * `tmp/shots/lr2-a2/float.png`, sky under the Tomb of the Conqueror's
         * plinth with a spoil block hanging beside it.
         *
         * A wall costs nothing horizontally, so it cannot become the dune the
         * `FILL_MAX` note is about, and it is what an engineer actually builds
         * at a brink. Chamfer for the first third of the kerb, then straight
         * down to the ground the bearing measured, capped — past 26 m it is a
         * cliff face and the terrain owns it.
         */
        const run = s - e;
        const u = run / 1.6;
        const wall = -Math.min(26, Math.max(0.9, deepest + 1.2));
        y = u <= 0.34
          ? -0.9 * (u / 0.34)
          : -0.9 + (wall + 0.9) * ((u - 0.34) / 0.66);
        c = mix3(C_BATTER, C_SCARP, Math.min(1, u * 1.3));
      } else {
        const g = groundLo(wx, wz);
        const run = s - e;
        c = C_BATTER;
        if (g < 0) {
          // Fill: the embankment falls away on its batter until it meets the
          // ground, and past that point it buries itself 120 mm under — which
          // is the whole difference between an earthwork and a cake stand.
          y = Math.max(g, -run / slopeFill);
          if (y <= g + 1e-3) y = g - bury(wx, wz);
        } else {
          // Cut: the batter climbs into the hillside and stops at the crest.
          y = Math.min(g, run / cut);
          if (y >= g - 1e-3) y = g - bury(wx, wz);
          if (y > crestY) { crestY = y; crestS = s; }
        }
        // The outermost station reaches for the ground whatever slope that
        // takes, because the reach cap can otherwise end the batter in mid-air
        // on a steep site and leave the whole compound floating on nothing --
        // `floatcheck` caught exactly that, 13 POIs in the air.
        //
        // But *only* down to `reachDown`. Reaching without a limit is the same
        // mistake with the sign flipped: a pad whose footprint clips a cliff
        // finds ground fifty metres down and hangs a fifty-metre curtain off
        // its own edge, which `floatcheck` then reads as a compound buried
        // 56 m into the hill (`disc_overlook`, `greyshire`, 23 of them). Past
        // the limit it is a retaining wall, and the other three sides of the
        // pad are what keep the compound on the ground.
        if (last) y = Math.max(g - bury(wx, wz), -reachDown);
        // Cut the rill in, but only where the batter is standing ABOVE the
        // ground it crosses. Below that the surface is already buried and
        // deepening it is invisible geometry; worse, it would pull the last
        // ring further down and widen the very outline `bury` exists to hide.
        if (rillAmp > 0.01 && y > g + 0.05) {
          const u = Math.min(1, run / Math.max(1e-3, reachOut));
          y = Math.max(g + 0.02, y - rillAmp * Math.sin(Math.PI * u));
        }
        if (Math.abs(y - g) < 0.14) toe = Math.max(toe, s);
        // The value ramp down the face, deepened in the gullies.
        const u2 = Math.min(1, run / Math.max(1e-3, reachOut));
        const w2 = u2 * u2 * (3 - 2 * u2);
        const wash = Math.min(1, w2 * (0.75 + 0.5 * rill));
        c = wash < 0.5
          ? mix3(C_CREST, C_BATTER, wash * 2)
          : mix3(C_BATTER, C_TOE, (wash - 0.5) * 2);
        // A face steeper than a fill can stand at is not a fill, and painting it
        // in the three fill values is what makes a twenty-metre embankment read
        // as poured concrete on a red hillside. Past 1:1.6 it goes toward the
        // scarp value — the darker, less bleached tone of a cut face — in step
        // with how far past it is. Below that this is a no-op and every pad on
        // level ground is untouched.
        if (slopeFill < 1.6) c = mix3(c, C_SCARP, Math.min(1, (1.6 - slopeFill) / 0.9));
      }
      pos.push(ct * s, y, st * s);
      col.push(c[0], c[1], c[2]);
      /*
       * World-metre UVs in the field's own frame, so a wear texture stamped in
       * world metres lines up with the geometry whatever the pad's rotation --
       * but laid out on the **surface**, not on its plan.
       *
       * It used to be `uv.push(ct * s, st * s)`, a straight planar projection
       * of the horizontal position, and a planar projection of a vertical
       * surface has no texture on it at all. The `cliff` branch above walks
       * `reachOut = 1.6` m outward while `y` dives to `-min(26, deepest + 1.2)`:
       * **16.25 metres of wall per metre of UV**, so the tile is smeared into
       * vertical streaks down exactly the twenty-six-metre retaining curtain
       * the LANDMINES entry about `gradePad` at a brink is about. The pad the
       * texture was added for is the one place it could not land.
       *
       * The radius the UV is built from is therefore the cumulative 3-D arc
       * length along the bearing -- `hypot(ds, dy)` summed out from the centre
       * -- rather than the horizontal run. On the deck `y` is 0, so `arc === s`
       * and every flat pad's UVs are bit-identical to before; on a 1:3 batter
       * it stretches by 5%; only a genuinely steep face moves, and there it
       * moves to 1:1 down the fall line, which is the axis the smear was on.
       *
       * The circumferential axis is then over-sampled by `arc / s` (2.7:1 at a
       * haven's 26 m wall, since the 13 m deck radius dominates both), and that
       * is the deliberate trade: keeping the planar form keeps the UV field
       * continuous around the pad, where the metrically exact alternative --
       * (s * theta, arc) -- puts a hard tile seam down one bearing of every
       * deck in the game to fix a face most pads do not have. Worst-case
       * anisotropy goes 16.25:1 -> 2.7:1, and finer-than-true reads as grain
       * where stretched-past-true reads as a smear.
       */
      arc += Math.hypot(s - prevS, y - prevY);
      prevS = s; prevY = y;
      uv.push(ct * arc, st * arc);
    }
    // Spoil rides the isoline of the cut, one lump per few degrees.
    if (crestY > 0.35 && j % 3 === 0) {
      const jitter = rng.gauss(0, 0.6);
      spoil.push([
        ct * (crestS + 0.9 + jitter), st * (crestS + 0.9 + jitter),
        rng.range(0.5, 1.35) * Math.min(2.2, 0.6 + crestY * 0.5),
      ]);
    }
  }

  const perRing = rings.length;
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < perRing - 1; i++) {
      const a = j * perRing + i, b = a + 1;
      const c = (j + 1) * perRing + i, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  // Spoil is real material: tint the vertices nearest each lump toward the
  // spoil colour so the berm reads as cast-up earth even before a rock lands
  // on it. Cheaper than more geometry and it survives the merge.
  for (const sp of spoil) {
    for (let v = 0; v < pos.length / 3; v++) {
      const dx = pos[v * 3] - sp[0], dz = pos[v * 3 + 2] - sp[1];
      const d = Math.hypot(dx, dz);
      if (d > sp[2] * 2.2) continue;
      const k = 1 - d / (sp[2] * 2.2);
      col[v * 3] += (C_SPOIL[0] - col[v * 3]) * k;
      col[v * 3 + 1] += (C_SPOIL[1] - col[v * 3 + 1]) * k;
      col[v * 3 + 2] += (C_SPOIL[2] - col[v * 3 + 2]) * k;
      // and lift it: a berm is a berm because it stands above the crest.
      pos[v * 3 + 1] += k * k * sp[2] * 0.5;
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();

  return { geo: g, fill: fillV, cut: cutV, toe: toe || r * 1.4, edgeAt, spoil };
}

/* ========================================================================== */
/* The material that reads the field                                          */
/* ========================================================================== */

/**
 * Mix a worn colour into a ground material by the wear field.
 *
 * Patched into a standard material rather than written as a `ShaderMaterial`,
 * so the pad keeps the project's lighting, fog, shadows and the atmosphere
 * patch — a bespoke shader here would be a hole in the aerial perspective, and
 * `LANDMINES` has that failure twice already.
 *
 * The threshold is applied to the **interpolated** distance, which is the whole
 * reason the field stores distance. `smoothstep` over a band rather than a
 * `step`, because a hard edge on a magnified texture is a staircase.
 */
export function applyWear(
  mat: THREE.MeshStandardMaterial,
  field: WearField,
  o: { worn?: THREE.Color | number; lo?: number; hi?: number; rough?: number } = {},
) {
  const worn = o.worn instanceof THREE.Color ? o.worn : new THREE.Color(o.worn ?? 0x6b5d4c);
  const lo = o.lo ?? 0.18, hi = o.hi ?? 0.72;
  const tex = field.texture();
  // Sampled from **world position**, not from `uv`. The material already uses
  // `uv` for its own albedo/normal/roughness tile, and a second consumer of the
  // same attribute is a collision waiting to happen the first time somebody
  // re-tiles the surface. World XZ also means the field lines up with the place
  // rather than with the mesh, so a pad rebuilt at a different rotation still
  // has its oil stains under its own pumps.
  const uWear = { value: tex };
  const uParam = { value: new THREE.Vector4(field.cx, field.cz, field.half, o.rough ?? 0.12) };
  const uBand = { value: new THREE.Vector2(lo, hi) };
  const uWorn = { value: worn };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWear = uWear;
    shader.uniforms.uWearParam = uParam;
    shader.uniforms.uWearBand = uBand;
    shader.uniforms.uWornColor = uWorn;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWearPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvWearPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        '#include <common>\nvarying vec3 vWearPos;\nuniform sampler2D uWear;\nuniform vec4 uWearParam;\nuniform vec2 uWearBand;\nuniform vec3 uWornColor;\nfloat wearAt() {\n\tvec2 w = (vWearPos.xz - uWearParam.xy) / (2.0 * uWearParam.z) + 0.5;\n\tif (w.x < 0.0 || w.x > 1.0 || w.y < 0.0 || w.y > 1.0) return 0.0;\n\treturn smoothstep(uWearBand.x, uWearBand.y, texture2D(uWear, w).r);\n}')
      .replace('#include <color_fragment>',
        '#include <color_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, uWornColor, wearAt());')
      .replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\n\troughnessFactor = clamp(roughnessFactor + uWearParam.w * wearAt(), 0.0, 1.0);');
  };
  // A material's program is keyed on this: two surfaces with different fields
  // must not share a compiled shader, and two calls with the same field should.
  mat.customProgramCacheKey = () => `wear:${tex.uuid}`;
  mat.needsUpdate = true;
  return mat;
}

/* ========================================================================== */
/* The check                                                                  */
/* ========================================================================== */

/**
 * The section 9 check for this item: does the encoding survive the lattice?
 *
 * The first version of this took one path offset and reported one number, and
 * it was **an instrument that measured its own phase**: with the path centred
 * on a lattice node the mask reconstructs to 1.000 and the check "fails"; half
 * a cell over it reconstructs to 0.000 and the check "passes". Both runs are
 * correct and neither is an answer. `LANDMINES` calls this exact shape out —
 * a real number with an inference attached that was never itself tested — so
 * the offset is **swept** across a whole lattice cell and what comes back is
 * the distribution.
 *
 * Two encodings of the same 1.5 m path, both sampled on a `latticeM` lattice
 * and reconstructed linearly the way a vertex attribute is across a triangle:
 *
 * - **mask** — 1 where the vertex is on the path, 0 elsewhere. This is the
 *   obvious construction and it is phase-dependent by nature: whether the path
 *   appears at all depends on where the lattice happens to fall.
 * - **field** — the distance ramp {@link WearField} stores, sampled bilinearly
 *   from the 0.5 m raster and thresholded *after* the interpolation.
 *
 * @returns per-encoding `mean` and `worst` peak recovered value over the sweep,
 *          and `pass` — the field must recover the path from **every** phase.
 */
export function reconstructionTest(pathW = 1.5, latticeM = 1.7, phases = 64) {
  const half = 24;
  const maskPeaks: number[] = [], fieldPeaks: number[] = [];
  for (let ph = 0; ph < phases; ph++) {
    const offset = (ph / phases) * latticeM;
    const f = new WearField(0, 0, half, WEAR_MPT);
    f.addLine({ pts: [-half, offset, half, offset], half: pathW / 2 });
    const maskAt = (zz: number) => (Math.abs(zz - offset) <= pathW / 2 ? 1 : 0);
    let pm = 0, pf = 0;
    for (let s = -6; s <= 6; s += 0.02) {
      const j = Math.floor(s / latticeM);
      const t = s / latticeM - j;
      const m = maskAt(j * latticeM) * (1 - t) + maskAt((j + 1) * latticeM) * t;
      if (m > pm) pm = m;
      const v = f.sample(0, s);
      const w = Math.max(0, Math.min(1, (v - 0.18) / (0.72 - 0.18)));
      if (w > pf) pf = w;
    }
    maskPeaks.push(pm); fieldPeaks.push(pf);
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const out = {
    pathW, latticeM, phases,
    maskMean: +mean(maskPeaks).toFixed(3),
    maskWorst: +Math.min(...maskPeaks).toFixed(3),
    fieldMean: +mean(fieldPeaks).toFixed(3),
    fieldWorst: +Math.min(...fieldPeaks).toFixed(3),
    pass: false,
  };
  // The claim, stated so it can fail: the field recovers the path from every
  // phase, and the mask does not.
  out.pass = out.fieldWorst > 0.9 && out.maskWorst < 0.5;
  return out;
}

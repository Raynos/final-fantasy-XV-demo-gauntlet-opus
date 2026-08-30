import * as THREE from 'three';
import { Rng } from '../../util/Rng.ts';
import { hash3 } from './Ecology.ts';
import type { VegWindOpts } from './VegMaterial.ts';
import { patchVeg, bakeFlex, registerAlphaCard } from './VegMaterial.ts';
import { grassClumpTex } from './VegTextures.ts';
import type { Ecology } from './Ecology.ts';

/**
 * Camera-following instanced grass with three LOD rings:
 *
 *   0  real tapered blade geometry, grown in tufts, 0-26 m
 *   1  crossed alpha-cut tuft cards, 21-84 m
 *   2  sparse multi-tuft clump cards, 78-155 m
 *
 * All three read their height from one place — {@link tuftHeight} — because
 * they had drifted to a measured 1 : 2 : 3.5 when each computed its own.
 *
 * Placement is *position-hashed*, never sequence-dependent, so a tile
 * regenerates byte-identically no matter which order tiles stream in.
 *
 * Each tile is its own instanced mesh, built once and then immutable, so the
 * ring moving costs nothing but a `visible` flip — see {@link GrassField#_tileFor}
 * for why one big buffer per ring was the wrong shape.
 */

// Ring sizing, two rules:
//
// The blade ring is short because Leide grass is an ankle tuft. Past twenty-odd
// metres a whole tuft is a couple of pixels, and one textured card per tuft is
// then both cheaper and *more* accurate than a hundred sub-pixel triangles.
// `spacing` on that ring is therefore the tuft grid, not the blade grid: every
// accepted cell spawns a whole clump. Every ring came in when the grass got
// shorter (30/95/190 -> 26/84/155) for exactly that reason: a 0.16 m tuft goes
// sub-pixel sooner than the 0.34 m one the old numbers were drawn around, and
// the metres bought back pay for the tighter tuft grid.
//
// The outer ring used to reach 300 m. An alpha-cut card that small samples the
// coarsest mips, where its silhouette no longer exists, so the whole quad
// passes or fails as one block and the field turns into a rash of dark
// rectangles. Ending the ring where the cards are still several pixels across
// and handing the rest to the terrain's own grass tint reads far better than
// stamping geometry the alpha test cannot resolve.
const LODS = [
  { name: 'blade', tile: 12, far: 26, spacing: 0.27, max: 240000, hMul: 1.0 },
  { name: 'clump', tile: 24, near: 21, far: 84, spacing: 0.40, max: 105000, hMul: 1.05 },
  { name: 'far', tile: 48, near: 78, far: 155, spacing: 1.35, max: 44000, hMul: 1.45 },
];

/** Blades in the fattest tuft. Sizes the tile scratch buffer. */
const MAX_PER_CLUMP = 22;

/**
 * How much of the dirt's colour bleeds into the grass growing out of it.
 *
 * Some is right — it ties the field to the ground and stops the vegetation
 * reading as a decal laid on top.
 *
 * It was cut 0.32 -> 0.22 while the terrain's macro tint was a **hard-coded
 * Leide ochre** that never read the world map: a third of every blade's hue
 * was then coming from a desert, including in Duscae. That is no longer true —
 * the terrain carries a regional palette, so what bleeds in is the colour of
 * the dirt this particular blade actually grows out of, and the reason to hold
 * it down is gone.
 *
 * Back up, and slightly past where it started. Measured at the chocobo post,
 * `grassColor` returns linear r/g 0.44, b/g 0.22 — the `alstor` lush end, a
 * green far more saturated than any real sward — while `groundColor` there is
 * r/g 1.23, b/g 0.42. At 0.22 the field rendered as flat emerald lawn; at 0.34
 * it lands olive with the dirt reading between the tufts, which is the Duscae
 * basin (`tmp/shots/veg-b22/poi_chocobo.jpg` against `veg-b34/`). Leide gains
 * the same way and had the more visible improvement: the near field at
 * `hero_face` goes from a uniform yellow-green mat to warm khaki tussocks with
 * open dirt between them.
 */
const GROUND_BLEED = 0.34;

/**
 * The one height law for the whole field: the apparent height in metres of a
 * single tuft — the number the blade ring's tallest stems reach, and the number
 * a clump card that replaces that tuft is built to.
 *
 * It exists because the three rings were each computing their own height from
 * the same inputs and had drifted badly apart. Measured in the field at
 * Hammerhead before this change: blade ring mean 0.171 m / max 0.407 m, LOD1
 * cards 0.340 / 0.668, LOD2 cards 0.604 / 1.068 — a ratio of **1 : 2 : 3.5**
 * across a boundary the eye is supposed to be unable to find. Half of why the
 * grass read as knee-high straw is simply that a metre-tall card was standing
 * where a 0.2 m tussock belongs. Leide grass is an ankle tuft; at d = 0.68 this
 * gives 0.10-0.25 m with a mean of 0.157, and the zone `grassH` multiplier
 * still takes Alstor Slough and the Vesperpool to waist-high reed.
 *
 * Every ring multiplies this by its own `LODS[i].hMul` and nothing else. A card
 * ring is allowed to be slightly taller than one tuft because it stands in for
 * several at once and inherits the tallest — but "slightly" is 1.05 and 1.45,
 * not 2 and 3.5.
 *
 * @param d    local grass density 0..1
 * @param wet  local wetness 0..1
 * @param hMul the zone's `grassH`
 * @param jitter per-tuft 0..1 draw
 * @returns metres
 */
function tuftHeight(d: number, wet: number, hMul: number, jitter: number): number {
  return (0.100 + 0.090 * d + 0.130 * wet * wet) * hMul * (0.62 + jitter * 0.88);
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _cGrass = new THREE.Color();
const _cGround = new THREE.Color();

/**
 * One blade, built in *units of its own height* so the instance scale can stay
 * (near) uniform.
 *
 * That constraint is not cosmetic. three has no per-instance normal matrix; it
 * divides the object normal by the squared length of each instance-matrix
 * column, so a blade scaled (1, 0.25, 1) has its Y normal multiplied by four
 * relative to X and Z and every blade in the field ends up with a normal
 * pointing dead up — which is exactly the flat-green-cardboard read. Modelling
 * the blade at unit height and scaling it uniformly keeps the authored normals
 * intact, and it also makes the silhouette self-similar: a short blade is a
 * small blade, not a squashed one.
 *
 * The authored normals fan hard to left and right (`FAN`). Interpolated across
 * a two-column ribbon that is a round cross-section: the shading sweeps from
 * one edge, through a bright centre line where the normal points straight out
 * of the fold, to the other edge. That centre line is the midrib highlight.
 *
 * The tip is a single vertex, so the blade tapers to a real point and we spend
 * one triangle there instead of a degenerate quad.
 */
function bladeGeometry(segs = 5) {
  const pos = [], nor = [], uv = [], col = [], flex = [], idx = [];
  const HALF_W = 0.046;   // half width at the root, as a fraction of height
  const CURVE = 0.34;     // tip offset along +Z, as a fraction of height
  const SWAY = 0.085;     // lateral S, as a fraction of height
  const FAN = 0.95;       // lateral normal spread -> rounded cross-section
  // Width profile: a real blade is near enough parallel-sided for its lower
  // half and then draws to a point over the last quarter. `pow(1 - t, 0.6)`
  // did the opposite — it took a sixth of the width off in the first eighth of
  // the length, which is a spear, and a field of spears is the "spiky star"
  // read the tufts had.
  const widthAt = (t: number) => HALF_W * Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.2)));
  // A slight lateral S on top of the forward droop, so a blade is not a plane
  // curve. Instance yaw is already random, so this reads as blades twisting out
  // of the tuft rather than as a field all bending one way.
  const swayAt = (t: number) => SWAY * t * t * (1.35 - t);
  const shadeAt = (t: number) => 0.40 + Math.pow(t, 0.75) * 0.62;
  // The root-to-tip ramp carries *hue* as well as value. A real blade loses
  // chroma into the shaded litter it grows out of and bleaches warm at the tip,
  // so the base is darker and greyer and the tip is lighter and strawier. The
  // old constant (0.99, 1, 0.83) gave every blade the same warm cast from root
  // to point, which is one more reason the field averaged to a single colour.
  const warmAt = (t: number) => 0.92 + t * 0.16;
  const coolAt = (t: number) => 0.94 - t * 0.20;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const w = widthAt(t);
    const z = CURVE * t * t;
    const sx = swayAt(t);
    for (let s = -1; s <= 1; s += 2) {
      pos.push(sx + s * w, t, z);
      // the blade leans further off vertical as it droops, so the face normal
      // tips forward with it
      nor.push(s * FAN, 0.9, 0.42 + t * 0.72);
      uv.push(s * 0.5 + 0.5, t);
      const shade = shadeAt(t);
      col.push(shade * warmAt(t), shade, shade * coolAt(t));
      flex.push(t);
    }
  }
  pos.push(swayAt(1), 1, CURVE);
  nor.push(0, 0.9, 1.14);
  uv.push(0.5, 1);
  const st = shadeAt(1);
  col.push(st * warmAt(1), st, st * coolAt(1));
  flex.push(1);

  for (let i = 0; i < segs - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const last = (segs - 1) * 2;
  idx.push(last, segs * 2, last + 1);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aFlex', new THREE.Float32BufferAttribute(flex, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * N crossed quads, unit height, used for clump cards.
 *
 * The vertical vertex ramp is deliberately shallow (0.86 at the root to 1.06 at
 * the tip, coverage-weighted mean 0.931). It used to run 0.50 to 0.98, which
 * *double-counted* the root-to-tip gradient the clump texture already paints
 * into every blade it draws, and then `aoBoost` darkened the base a third time.
 * Three stacked occlusion ramps on a card that is one tuft seen from thirty
 * metres is most of why the card rings rendered as black gravel. The texture
 * owns that gradient now; this ramp only keeps the mass from reading as a flat
 * decal.
 */
function crossCardGeometry(planes = 3, width = 1.0) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  let v = 0;
  for (let p = 0; p < planes; p++) {
    const a = (p / planes) * Math.PI;
    const cx = Math.cos(a) * width * 0.5, cz = Math.sin(a) * width * 0.5;
    const nx = -Math.sin(a) * 0.5, nz = Math.cos(a) * 0.5;
    const quad = [
      [-cx, 0, -cz, 0, 0], [cx, 0, cz, 1, 0],
      [cx, 1, cz, 1, 1], [-cx, 1, -cz, 0, 1],
    ];
    for (const [x, y, z, u, vv] of quad) {
      pos.push(x, y, z);
      nor.push(nx * 0.35, 0.9, nz * 0.35);
      uv.push(u, vv);
      const shade = 0.86 + vv * 0.20;
      col.push(shade, shade, shade);
    }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  bakeFlex(g);
  g.computeBoundingSphere();
  return g;
}

/**
 * The shadow proxy for one tuft: two crossed quads, origin at the root.
 *
 * Grass casts nothing. A blade is ~6 mm across and a shadow cascade texel is
 * roughly ten times that, so blades *cannot* resolve into a shadow — but the
 * consequence is that the ground between tufts is fully lit, and a field of
 * plants sitting on undarkened dirt is the "everything floats" tell that cost
 * the sibling repos every blind test they ran. The fix all three converged on
 * is to cast from something coarse enough to resolve, and to draw nothing in
 * the colour pass.
 *
 * Four triangles. The quads are unit-sized and the instance matrix scales them
 * to the tuft's own radius and height, so a fat tussock lays down a fat shadow
 * and a sprig lays down almost none.
 */
function swardProxyGeo(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // two quads at right angles, spanning -0.5..0.5 in x/z and 0..1 in y
  const pos: number[] = [], idx: number[] = [];
  for (let q = 0; q < 2; q++) {
    const c = q === 0 ? 1 : 0, sN = q === 0 ? 0 : 1;
    const b = q * 4;
    pos.push(-0.5 * c, 0, -0.5 * sN, 0.5 * c, 0, 0.5 * sN, 0.5 * c, 1, 0.5 * sN, -0.5 * c, 1, -0.5 * sN);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * A material that renders nothing in the colour pass but casts a normal shadow.
 *
 * The vertex shader pushes every vertex behind the far plane, so the colour
 * pass clips all four triangles and rasterises no fragments at all. The shadow
 * pass never sees this program: three builds its own depth material from the
 * material's *properties* (map, alphaTest, side), and `onBeforeCompile` patches
 * are not carried over. So the same mesh is invisible to the camera and solid
 * to the light, which is exactly the contract wanted.
 *
 * `material.visible` and `layers` cannot do this — three tests shadow-caster
 * visibility against the view camera, so hiding the mesh hides its shadow too.
 */
function swardProxyMat(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial();
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      // behind the far plane, and degenerate: nothing to clip, nothing to shade
      'gl_Position = vec4(0.0, 0.0, 2.0, 1.0);'
    );
  };
  m.customProgramCacheKey = () => 'swardProxy';
  return m;
}

/** One built tile of one ring: its mesh (null when the tile came out empty). */
interface GrassTile {
  mesh: THREE.InstancedMesh | null;
  /** Shadow-only proxy for this tile, blade ring only. */
  sward: THREE.InstancedMesh | null;
  /** Instances in it. */
  n: number;
  /** The frame it was last drawn on, for eviction. */
  stamp: number;
}

/** One LOD ring: its geometry, its material, and its pool of built tiles. */
interface GrassRing {
  lod: typeof LODS[number];
  geo: THREE.BufferGeometry;
  mat: THREE.MeshStandardMaterial;
  /** Shadow-caster proxy, on the blade ring only; null on the card rings. */
  swardGeo: THREE.BufferGeometry | null;
  swardMat: THREE.MeshBasicMaterial | null;
  group: THREE.Group;
  /** Instance cap for this ring. */
  max: number;
  /** Packed tile key -> the built tile. */
  pool: Map<number, GrassTile>;
  cacheMax: number;
  /** Hash of the visible tile list, and whether that list was left incomplete. */
  packSig: number;
  packPending: boolean;
}

export class GrassField {
  _deadline!: number;
  _last!: THREE.Vector3;
  _pending!: boolean;
  _primed!: boolean;
  _stamp!: number;
  /** True only inside `converge`: tile generation then ignores `budgetMs`. */
  _unbounded!: boolean;
  budgetMs!: number;
  eco!: Ecology;
  group!: THREE.Group;
  quality!: number;
  rings!: GrassRing[];
  scene!: THREE.Scene;
  /** Debug switch for bisecting the pack-skip optimisation against a capture. */
  constructor(eco: import('./Ecology.ts').Ecology, scene: THREE.Scene, { quality = 1 } = {}) {
    this.eco = eco;
    this.scene = scene;
    this.quality = quality;
    /** One entry per LOD ring; each owns a pool of per-tile instanced meshes. */
    this.rings = [];
    /** Parent of every ring group, so the whole field can be hidden at once. */
    this.group = new THREE.Group();
    this.group.name = 'grass';
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);
    this._last = new THREE.Vector3(1e9, 0, 1e9);
    this._pending = true;
    /**
     * Milliseconds of tile *generation* one update may spend.
     *
     * Building a blade tile is ~1.5 ms of matrix composition, and a hop across
     * the map wants a hundred of them. The old fixed budget of ten tiles per
     * update put 15-30 ms of CPU into single frames — measured as the whole of
     * `streaming-traverse`'s 26 ms median. Time is the honest unit: the ring
     * fills over as many frames as it needs and the frame budget is never
     * blown. The very first update runs unbounded so the loading screen, not
     * the first second of play, pays for the initial dressing.
     *
     * **4 -> 2, because the frame it was sized against was never real.** This
     * plus `Trees` (4) and `Bushes` (2) told the streamers they could spend
     * 10 ms of wall clock per frame, which is defensible against the 23 ms
     * frame the old harness reported and absurd against the 4.3 ms one it
     * actually is — see `project/LANDMINES.md`, *The measurement trap*.
     * `Vegetation.update` was the largest single cost in the moving frame at
     * 7.8 ms, more than the entire renderer.
     *
     * Measured on the halving, over a 180-frame traverse
     * (`src/tools/probes/perfvegbudget.mts`):
     *
     *     4/2/4 ms   14.4 ms frame, 69 fps, 19% of frames over budget
     *     2/1/2 ms   12.3 ms frame, 81 fps,  6% over
     *     1/0.5/1    11.2 ms frame, 89 fps,  6% over
     *
     * and it costs nothing visible: resident vegetation triangles came back
     * *higher* at 2/1/2 than at 4/2/4 in both runs, and two mid-traverse
     * captures at the same frame index are indistinguishable
     * (`src/tools/probes/perfvegpop.mts`, `tmp/shots/vegpop/`). Note that no
     * ordinary capture can see this either way: `Vegetation.converge()`
     * ignores `budgetMs` and `Game.settle` calls it, so every posed shot in
     * the corpus is fully filled whatever this says. Only live traversal
     * shows it.
     *
     * **Halved again, 2 -> 1, and the same evidence says the same thing.**
     * `src/tools/probes/perfvegbudget2.mts` toggles all three budgets at
     * runtime inside one page and interleaves the arms A-B-B-A-A-B, because by
     * this round the trunk had other lanes live on it and a before/after run of
     * `gameplay.mts` would have been measuring their content and their load as
     * much as this number. Halved: `streaming-traverse` 20.4 -> 17.9 ms,
     * 49 -> 55.9 fps, over the *same* 7.84 -> 7.85 M resident triangles a
     * frame. Under a 60 Hz budget the streamers finish the work either way;
     * the budget only decides how much of it lands in one frame.
     *
     * The thing this is protecting against is a frame like the ones
     * `gameplay.mts` hits when it teleports the player 660 m: real motion is
     * nowhere near it. What is left on the table now is the eighth budget,
     * which a later lane tuning grass *density* should re-measure rather than
     * inherit, since every one of these numbers is tuned against a density.
     */
    this.budgetMs = 1;
    this._primed = false;
    this._deadline = 0;
    this._stamp = 0;
    this._unbounded = false;
  }

  /**
   * Build every tile this camera wants, now, ignoring the per-frame budget.
   *
   * The budget above is a wall-clock deadline, which means how much of the
   * field exists after N frames depends on how fast the machine was and on
   * what the *previous* camera position had already cached. That is fine in
   * play and fatal for a capture: it made the same shot differ by 1.8/255
   * alone versus sixth in a batch, against a 0.30 floor, concentrated in the
   * ground. `Game.settle` calls this once the camera is at the shot, so
   * residency becomes a pure function of where the camera is.
   */
  converge(camPos: THREE.Vector3) {
    this._unbounded = true;
    // defeat the movement early-out: this is an explicit request, not a poll
    this._last.set(1e9, 0, 1e9);
    this._pending = true;
    try { this.update(camPos); } finally { this._unbounded = false; }
  }

  build() {
    // Five segments, not four. The blade now has a real S in it and a tip that
    // draws to a point over the last quarter, and four segments cannot describe
    // either — the curve came out as two straight facets with a visible kink.
    // Two extra triangles per blade is the cheapest silhouette in the file.
    const bladeGeo = bladeGeometry(5);
    const clumpGeo = crossCardGeometry(3, 1.0);
    const farGeo = crossCardGeometry(2, 1.0);

    const grassMat = (opts: { mat: THREE.MeshStandardMaterialParameters, veg: VegWindOpts }) => patchVeg(new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.86, metalness: 0,
      side: THREE.DoubleSide, ...opts.mat,
    }), opts.veg);

    // roughness low enough that the rounded cross-section actually catches a
    // specular streak down the midrib; translucency so backlit blades glow
    // at dawn/dusk instead of going to silhouette.
    // Backlit glow is not a near-field luxury: the blade ring had
    // `translucency 1.05` and both card rings had none, so a field lit from
    // behind at dawn or dusk *dropped to silhouette exactly at the LOD ring* —
    // a hard dark arc drawn across the grass at twenty-odd metres. The cards
    // carry it too now, scaled down because a whole tuft transmits less than a
    // single blade does.
    const m0 = grassMat({
      mat: { roughness: 0.62 },
      veg: {
        bend: 0.34, flutter: 0.34, gustFreq: 0.052, trample: 1.15, flexPow: 1.9,
        twoSidedNormals: true, aoBoost: 0.42, translucency: 1.05,
      },
    });
    // the alpha reference the mip chain preserves must be the alpha test the
    // material will actually run, or the far LODs come out denser than the
    // near ones and the field grows a hard edge at the LOD ring
    const clumpTexA = grassClumpTex(0, 46, 0.42);
    const clumpTexB = grassClumpTex(1, 30, 0.42);
    // `specular: 0` on both card rings is the fix for the blue-white speckle
    // two agents reported in Malmalam and the Nebulawood. A tuft card carries a
    // deliberately up-facing normal; from any camera above the ground that
    // normal reflects the sky straight into the lens, so the card's 4 %
    // dielectric lobe painted every quad with sky colour. Rendering the ring
    // with a *black* albedo changed the flake count by 0.6 %, which is the
    // proof it was never the texture or the tint. A blade of grass at 40 m has
    // no coherent highlight to lose.
    const m1 = grassMat({
      mat: { map: clumpTexA, alphaTest: 0.42, transparent: false, roughness: 0.94 },
      veg: {
        bend: 0.3, flutter: 0.2, gustFreq: 0.05, trample: 0.7, flexPow: 2.0,
        twoSidedNormals: true, aoBoost: 0.3, specular: 0, translucency: 0.62,
      },
    });
    const m2 = grassMat({
      mat: { map: clumpTexB, alphaTest: 0.42, transparent: false, roughness: 0.96 },
      veg: {
        bend: 0.24, flutter: 0.1, gustFreq: 0.045, flexPow: 2.0,
        twoSidedNormals: true, aoBoost: 0.2, specular: 0, translucency: 0.34,
      },
    });

    const geos = [bladeGeo, clumpGeo, farGeo];
    const mats = [m0, m1, m2];

    for (let i = 0; i < LODS.length; i++) {
      const lod = LODS[i];
      const r = Math.ceil(lod.far / lod.tile);
      const slots = (2 * r + 1) * (2 * r + 1);
      // The override guard is a *material* contract (`allowOverride = false`),
      // not a per-mesh one, and the ring now owns hundreds of short-lived
      // meshes — registering each of them would grow that set forever.
      if (i > 0) registerAlphaCard({ material: mats[i] });
      const group = new THREE.Group();
      group.name = `grass_${lod.name}`;
      group.matrixAutoUpdate = false;
      this.group.add(group);
      this.rings.push({
        lod, geo: geos[i], mat: mats[i], group,
        // Only the blade ring casts. Past its 26 m the tuft is a card whose own
        // shadow would be a floating rectangle, and past ~60 m a tuft shadow is
        // smaller than a cascade texel and can only shimmer.
        swardGeo: i === 0 ? swardProxyGeo() : null,
        swardMat: i === 0 ? swardProxyMat() : null,
        max: Math.max(64, Math.floor(lod.max * this.quality)),
        /** key -> { mesh, n, stamp }. Also the tile cache: a built tile is a mesh. */
        pool: new Map(),
        // enough hysteresis that walking back and forth over a boundary never
        // rebuilds, but bounded so a drive across Leide cannot grow forever
        cacheMax: Math.max(48, Math.round(slots * 1.7)),
        // hash of the visible tile list, and whether it was left incomplete
        packSig: 0, packPending: true,
      });
    }
  }

  /**
   * Get (building at most one) the mesh for one tile of one ring.
   *
   * Each tile owns its own instanced mesh, sized exactly to its own instance
   * count, written once and never touched again. That is the whole point: the
   * ring used to be one 240 k-instance mesh whose entire 15.4 MB matrix buffer
   * was re-uploaded whenever the tile *set* changed — and ANGLE's Metal backend
   * answers a write to a buffer that is in use by committing a full-size shadow
   * copy, which was measured at 130-290 ms of dead CPU per crossing. Per-tile
   * buffers are ~350 kB, uploaded once on creation when nothing references
   * them, and a ring shift uploads nothing at all.
   *
   * The second dividend is culling: one ring-sized mesh had to run with
   * `frustumCulled = false`, so every blade behind the camera was still shaded.
   * A tile has real bounds.
   *
   * @returns
   *   null when the frame's generation budget is spent.
   */
  _tileFor(ring: GrassRing, li: number, tx: number, tz: number): GrassTile | null {
    const key = (tx & 2047) * 4096 + (tz & 2047);
    const e = ring.pool.get(key);
    if (e) return e;
    if (this._primed && !this._unbounded && performance.now() > this._deadline) return null;

    const t = this._makeTile(li, tx, tz);
    let mesh: THREE.InstancedMesh | null = null;
    if (t.n > 0) {
      mesh = new THREE.InstancedMesh(ring.geo, ring.mat, 0);
      mesh.instanceMatrix = new THREE.InstancedBufferAttribute(t.m, 16);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(t.c, 3);
      mesh.count = t.n;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      mesh.matrixAutoUpdate = false;
      mesh.visible = false;
      // Instances carry world positions, so the mesh sits at the origin and
      // its bounds are the tile's own footprint. The margin covers blade
      // height and the wind sway the vertex shader adds on top.
      const T = LODS[li].tile;
      mesh.boundingSphere = new THREE.Sphere(
        new THREE.Vector3((tx + 0.5) * T, (t.y0 + t.y1) * 0.5, (tz + 0.5) * T),
        Math.hypot(T * 0.71, (t.y1 - t.y0) * 0.5 + 3) + 1
      );
      ring.group.add(mesh);
    }

    // The shadow-only proxy rides alongside, sharing the tile's visibility.
    let sward: THREE.InstancedMesh | null = null;
    if (t.sn > 0 && ring.swardGeo && ring.swardMat) {
      sward = new THREE.InstancedMesh(ring.swardGeo, ring.swardMat, 0);
      sward.instanceMatrix = new THREE.InstancedBufferAttribute(t.s, 16);
      sward.count = t.sn;
      sward.castShadow = true;
      sward.receiveShadow = false;
      sward.matrixAutoUpdate = false;
      sward.visible = false;
      // Same footprint as the tile it shadows. It must not be frustum-culled
      // against the *view* camera when the tuft is off screen but its shadow is
      // not, so the bound is generous rather than tight.
      const Ts = LODS[li].tile;
      sward.boundingSphere = new THREE.Sphere(
        new THREE.Vector3((tx + 0.5) * Ts, (t.y0 + t.y1) * 0.5, (tz + 0.5) * Ts),
        Math.hypot(Ts * 0.71, (t.y1 - t.y0) * 0.5 + 3) + 1
      );
      ring.group.add(sward);
    }

    const entry = { mesh, sward, n: t.n, stamp: 0 };
    ring.pool.set(key, entry);
    if (ring.pool.size > ring.cacheMax) this._evict(ring);
    return entry;
  }

  /** Drop the oldest tiles that are not currently on screen. */
  _evict(ring: GrassRing) {
    const target = Math.round(ring.cacheMax * 0.8);
    for (const [k, e] of ring.pool) {
      if (ring.pool.size <= target) break;
      if (e.stamp === this._stamp) continue;      // in this frame's ring
      if (e.mesh) { ring.group.remove(e.mesh); e.mesh.dispose(); }
      if (e.sward) { ring.group.remove(e.sward); e.sward.dispose(); }
      ring.pool.delete(k);
    }
  }

  /** Build (and cache) one tile's instance data. */
  _makeTile(li: number, tx: number, tz: number) {
    const lod = LODS[li];
    const eco = this.eco;
    const T = lod.tile;
    const x0 = tx * T, z0 = tz * T;
    const rng = new Rng(hash3(tx, tz, 7717 + li * 131));

    // coarse fields, bilerped per instance — density noise is far too costly
    // to evaluate hundreds of thousands of times.
    const CG = 6;                      // density / colour / wetness grid
    const HG = li === 0 ? 24 : 12;     // height grid
    const dg = new Float32Array((CG + 1) * (CG + 1));
    const wg = new Float32Array((CG + 1) * (CG + 1));
    // Per-zone height and bleach fraction. Leide is a 0.15-0.35 m ankle tuft;
    // Alstor Slough and the Vesperpool are waist-high marsh grass; a closed
    // forest floor is long and sparse. One global height made every zone the
    // same field.
    const sg = new Float32Array((CG + 1) * (CG + 1));
    const kg = new Float32Array((CG + 1) * (CG + 1));
    const cg = new Float32Array((CG + 1) * (CG + 1) * 3);
    // The same grid sampled at the *dry* end of the zone's ramp. A bleached
    // tuft is interpolated toward this instead of being pushed there by a
    // per-channel gain, so no clump can leave the authored palette.
    const cd = new Float32Array((CG + 1) * (CG + 1) * 3);
    for (let j = 0; j <= CG; j++) {
      for (let i = 0; i <= CG; i++) {
        const x = x0 + (i / CG) * T, z = z0 + (j / CG) * T;
        const k = j * (CG + 1) + i;
        dg[k] = eco.grassDensity(x, z);
        wg[k] = eco.wetness(x, z);
        sg[k] = eco.grassScale(x, z);
        kg[k] = eco.grassDead(x, z);
        eco.groundColor(x, z, _cGround);
        // Grass picks up the colour of the dirt it grows out of. Now that the
        // terrain's tint is regional this is real information and not a leak
        // of Leide ochre into Duscae — see GROUND_BLEED.
        eco.grassColor(x, z, _cGrass).lerp(_cGround, GROUND_BLEED);
        cg[k * 3] = _cGrass.r; cg[k * 3 + 1] = _cGrass.g; cg[k * 3 + 2] = _cGrass.b;
        eco.grassDryColor(x, z, _cGrass).lerp(_cGround, GROUND_BLEED);
        cd[k * 3] = _cGrass.r; cd[k * 3 + 1] = _cGrass.g; cd[k * 3 + 2] = _cGrass.b;
      }
    }
    const hg = new Float32Array((HG + 1) * (HG + 1));
    let y0 = Infinity, y1 = -Infinity;
    for (let j = 0; j <= HG; j++) {
      for (let i = 0; i <= HG; i++) {
        const h = eco.height(x0 + (i / HG) * T, z0 + (j / HG) * T);
        hg[j * (HG + 1) + i] = h;
        if (h < y0) y0 = h;
        if (h > y1) y1 = h;
      }
    }
    const bil = (arr: Float32Array, g: number, u: number, v: number, stride = 1, c = 0) => {
      const fu = u * g, fv = v * g;
      const iu = Math.min(g - 1, fu | 0), iv = Math.min(g - 1, fv | 0);
      const su = fu - iu, sv = fv - iv;
      const a = arr[(iv * (g + 1) + iu) * stride + c];
      const b = arr[(iv * (g + 1) + iu + 1) * stride + c];
      const cc = arr[((iv + 1) * (g + 1) + iu) * stride + c];
      const d = arr[((iv + 1) * (g + 1) + iu + 1) * stride + c];
      return (a * (1 - su) + b * su) * (1 - sv) + (cc * (1 - su) + d * su) * sv;
    };

    const n = Math.max(1, Math.round(T / lod.spacing));
    const isBlade = li === 0;
    const cap = n * n * (isBlade ? MAX_PER_CLUMP : 1);
    const mArr = new Float32Array(cap * 16);
    const cArr = new Float32Array(cap * 3);
    // One shadow proxy per *tuft*, blade ring only, and at most one per grid
    // cell — a tuft is what casts a readable shadow, a blade is not.
    const sCap = isBlade ? n * n : 0;
    const sArr = new Float32Array(sCap * 16);
    let sCount = 0;
    let count = 0;

    // Per-clump colour: a tuft is one plant, so it is one colour. Spreading
    // the dry/green spread across individual blades instead just averages back
    // out to a uniform field at any distance.
    //
    // What this replaced: `r * (1 + dry*0.44)`, `b * (1 - dry*0.40)` and a
    // value-only jitter. That pair is ~1.8x on red and ~0.6x on blue at the dry
    // end, and it does not care what the palette says — measured in Leide it
    // put the field at r/g 1.76 and b/g 0.21 from a ramp whose own dry end is
    // 1.33 and 0.33. No amount of palette editing can undo a channel gain
    // applied after the palette, which is why the grass stayed highlighter
    // yellow through several rounds of recolouring.
    //
    // Now: walk the zone's *own* ramp toward its *own* dry end, jitter the hue
    // a little at constant luminance so neighbouring tufts differ in more than
    // brightness, pull everything back toward its own luminance so no clump can
    // be more saturated than the palette allows, and only then apply a value
    // jitter that is symmetric about the base instead of a one-way lift.
    const tint = (u: number, v: number, dry: number, k: number, hue: number, sat: number) => {
      const lr = bil(cg, CG, u, v, 3, 0), lg = bil(cg, CG, u, v, 3, 1), lb = bil(cg, CG, u, v, 3, 2);
      const dr = bil(cd, CG, u, v, 3, 0), dgc = bil(cd, CG, u, v, 3, 1), db = bil(cd, CG, u, v, 3, 2);
      let r = lr + (dr - lr) * dry;
      let g = lg + (dgc - lg) * dry;
      let b = lb + (db - lb) * dry;
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // hue push: +1 straw, -1 green, renormalised so it costs no value
      r *= 1 + hue * 0.22; g *= 1 + hue * 0.02; b *= 1 - hue * 0.34;
      const L2 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const n = L2 > 1e-5 ? L / L2 : 1;
      r *= n; g *= n; b *= n;
      cArr[count * 3] = (L + (r - L) * sat) * k;
      cArr[count * 3 + 1] = (L + (g - L) * sat) * k;
      cArr[count * 3 + 2] = (L + (b - L) * sat) * k;
    };

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const u = (i + rng.next()) / n, v = (j + rng.next()) / n;
        const d = bil(dg, CG, u, v);
        const roll = rng.next();
        const clumpRnd = rng.next();
        const colRnd = rng.next();
        const deadRnd = rng.next();
        const hueRnd = rng.next();
        if (d < 0.02 || roll > d * 1.3) continue;
        const x = x0 + u * T, z = z0 + v * T;
        const y = bil(hg, HG, u, v);
        // The density lattice is 6x6 per tile -- 2 m pitch here, 4 on the clump
        // ring, 8 on the far one -- which is wider than most rivers in this
        // world, so `grassDensity`'s own water test reads dry at both ends of a
        // cell the channel runs through and the bilerp puts grass back on the
        // water. Asked exactly, per tuft: see `Ecology.standsInWater`.
        if (eco.standsInWater(x, z, y)) continue;
        const wet = bil(wg, CG, u, v);
        const hMul = bil(sg, CG, u, v);
        const deadFrac = bil(kg, CG, u, v);
        // Green only where the water collects; everything else goes to straw.
        // A fifth of the tufts are last season's, dead and bleached whatever
        // the ground is doing — that speckle of pale tussocks among the olive
        // is the single most recognisable thing about the Leide flats.
        const dead = deadRnd < deadFrac * (1 - wet * 0.4);
        const dry = dead ? 1
          : Math.pow(colRnd, 0.42) * THREE.MathUtils.clamp(1.5 - wet * 1.45, 0, 1);
        // Per-clump hue: -1 leans green, +1 leans straw, applied at constant
        // luminance. This is the variation the field never had — every previous
        // jitter was value-only, and a field whose only variation is brightness
        // averages back to one flat colour at any distance past a few metres.
        //
        // `dry` has to push the hue as well as walk the ramp, because in Leide
        // the local colour is *already* the ramp's dry end: with nothing further
        // along it to interpolate toward, the bleach term did nothing at all and
        // the whole flats came out one sage green. A luminance-preserving push
        // toward straw still cannot leave the palette — `sat` below bounds it.
        const hue = (hueRnd - 0.5) * 1.8 + dry * 0.55 + (dead ? 0.4 : 0);
        // Bleaching is a *loss* of chroma, not a gain: last season's tussock is
        // pale grey-straw, and a sun-dried live one is halfway there.
        const sat = dead ? 0.54 : 0.88 - dry * 0.22;

        if (isBlade) {
          // one tuft: a ring of blades leaning out of a shared root, tallest
          // in the middle. Radius and population both vary, so the field is
          // tufts-and-dirt rather than an even scatter.
          // heavy-tailed tuft size: mostly small sprigs, the odd fat tussock
          const hTuft = tuftHeight(d, wet, hMul, Math.pow(clumpRnd, 1.7)) * lod.hMul;
          // Radius follows height. It used to be an absolute range that worked
          // out at ~0.83x the tuft's own height, which is not a tussock, it is
          // a pancake — and a pancake of blades is exactly the shape that reads
          // as an unbroken mat rather than as separate plants.
          const rad = hTuft * (0.26 + rng.next() * 0.30);
          // whole-tuft lean: a real tussock is combed over by the prevailing
          // wind, so it is never the radially symmetric pom-pom that a pure
          // outward splay produces
          const tuftA = rng.next() * Math.PI * 2;
          const tuftL = rng.next() * 0.30;
          // Shadow proxy for this tuft — the biggest half only.
          //
          // A sprig's shadow is a few centimetres and costs four triangles to
          // say nothing; the fat tussocks are what actually darken the ground
          // between plants. Taking the top half by height halves the caster
          // count for almost all of the effect, and the threshold is on the
          // tuft's own height so it scales with the zone rather than being an
          // absolute metre value tuned in one biome.
          if (sCount < sCap && hTuft > 0.16 * lod.hMul) {
            const w = rad * 2.1;
            const o = sCount * 16;
            // scale (w, hTuft*0.85, w), no rotation: crossed quads are already
            // symmetric enough that a per-tuft yaw buys nothing at this size
            sArr[o] = w; sArr[o + 5] = hTuft * 0.85; sArr[o + 10] = w; sArr[o + 15] = 1;
            sArr[o + 12] = x; sArr[o + 13] = y; sArr[o + 14] = z;
            sCount++;
          }
          // How many blades make one tuft.
          //
          // This ran at 3-6 for a while, on the argument that the same instance
          // budget spent on more, smaller plants is what puts open dirt back
          // between them. That is true of the *tuft grid* and false of the
          // blade count: four blades leaning out of a shared root is an
          // asterisk, not a plant, and the near field was reading as one
          // because the clump cards — which are the thing that actually
          // covered it, and which are now pushed back out to 22 m where they
          // belong — were hiding it. With the cards gone from the near field
          // the blade ring has to carry 0-22 m on its own, and it cannot do
          // that at four blades a tuft. Now 5-19, still under MAX_PER_CLUMP.
          // The dirt between plants comes from the acceptance roll below, not
          // from starving each plant.
          const nb = Math.min(MAX_PER_CLUMP,
            Math.max(5, Math.round((3.5 + d * 9.5) * (0.55 + rng.next() * 0.95))));
          // Value jitter symmetric about the base rather than a one-way lift:
          // the old `0.62 + colRnd*0.62`, times another 0.9-1.2 per blade,
          // could only ever make a clump brighter than the palette.
          const k = ((dead ? 1.02 : 0.78) + colRnd * (dead ? 0.34 : 0.44))
            * (1 + dry * 0.12);
          for (let bI = 0; bI < nb; bI++) {
            if (count >= cap) break;
            const a = rng.next() * Math.PI * 2;
            const rr = Math.sqrt(rng.next()) * rad;
            // blades at the edge of a tuft are shorter and lean out further
            const edge = rr / Math.max(rad, 1e-4);
            // Long tail on the height so a few stems overtop the tuft, scaled
            // so that the tallest of them lands on `hTuft` and not past it —
            // that is the contract the card rings are matched against.
            const h = hTuft * (0.30 + Math.pow(rng.next(), 0.7) * 0.72) * (1 - edge * 0.28);
            // Lean and droop both scale with the blade's own share of the
            // tuft's height. A tall stem lies over under its own weight while
            // its short neighbour stands up, which is what stops a tuft reading
            // as one shape scaled N times.
            const hRel = h / Math.max(hTuft, 1e-4);
            // Splay, bounded so a tuft reads as a tussock rather than a
            // starburst.
            //
            // This used to reach 0.99 rad -- 57 degrees -- at the rim of a tall
            // tuft, and a ring of blades laid over that far from a shared root
            // is a sea urchin, not a plant. The measured reference
            // (docs/reference/ART-DIRECTION.md section 7, sampled from
            // duscae-plains-chocobo-02) shows near-camera blades standing close
            // to upright with rim-light down individual silhouettes; the splay
            // is at the edge of the clump, not the whole clump. Ceiling is now
            // ~0.58 rad, and edge blades still lean furthest.
            const lean = (0.06 + edge * 0.22) * (0.55 + rng.next() * 0.85)
              * (0.62 + hRel * 0.85);
            const yaw = a + rng.gauss(0, 0.5);
            const zj = (0.42 + h * 3.4) * (0.55 + rng.next() * 1.05)
              * (0.70 + hRel * 0.55);
            _e.set(Math.sin(a) * lean + Math.sin(tuftA) * tuftL,
              yaw, -Math.cos(a) * lean - Math.cos(tuftA) * tuftL);
            _q.setFromEuler(_e);
            _pos.set(x + Math.cos(a) * rr, y - 0.015, z + Math.sin(a) * rr);
            _scl.set(h * (0.82 + rng.next() * 0.4), h, h * zj);
            _m.compose(_pos, _q, _scl);
            _m.toArray(mArr, count * 16);
            tint(u, v, dry, k * (0.94 + rng.next() * 0.12), hue, sat);
            count++;
          }
          continue;
        }

        // One card is one tuft (LOD1) or a small stand of them (LOD2), and both
        // get their height from the same law the blade ring does — that is the
        // whole point of `tuftHeight`. The cards are proportionally *wider*
        // than they used to be so that halving their height does not quarter
        // the coverage: a tuft seen at fifty metres is a low sprawling shape,
        // not a tall narrow one.
        const jitter = rng.next();
        const h = tuftHeight(d, wet, hMul, jitter) * lod.hMul;
        const w = h * (li === 1 ? 2.2 + rng.next() * 1.5 : 2.6 + rng.next() * 1.8);
        const yaw = rng.next() * Math.PI * 2;
        _e.set(rng.gauss(0, 0.07), yaw, rng.gauss(0, 0.06));
        _q.setFromEuler(_e);
        // sink proportionally, not absolutely: 3 cm hid the root of a 0.6 m
        // card and buries a fifth of a 0.16 m one
        _pos.set(x, y - h * 0.07, z);
        _scl.set(w, h, w);
        _m.compose(_pos, _q, _scl);
        _m.toArray(mArr, count * 16);
        tint(u, v, dry, ((dead ? 1.00 : 0.76) + jitter * (dead ? 0.34 : 0.44))
          * (1 + dry * 0.12), hue, sat);
        count++;
      }
    }
    // slice (not subarray) so the oversized candidate buffer can be collected
    return {
      m: mArr.slice(0, count * 16), c: cArr.slice(0, count * 3), n: count,
      s: sArr.slice(0, sCount * 16), sn: sCount, y0, y1,
    };
  }

  /**
   * True when {@link GrassField.update} would take its heavy path this frame.
   *
   * Exactly the negation of that method's own early-out, with no side effect,
   * so `Vegetation.update` can rotate the three layers instead of letting all
   * three gather and upload on the same frame. See `Vegetation.update`.
   */
  wants(camPos: THREE.Vector3): boolean {
    return this._last.distanceToSquared(camPos) >= 25 || this._pending;
  }

  update(camPos: THREE.Vector3) {
    const moved = this._last.distanceToSquared(camPos);
    if (moved < 25 && !this._pending) return;
    this._deadline = this._unbounded ? Infinity : performance.now() + this.budgetMs;
    this._last.copy(camPos);
    this._stamp++;
    let pending = false;

    for (let li = 0; li < this.rings.length; li++) {
      const ring = this.rings[li];
      const { lod, max } = ring;
      const T = lod.tile;
      const far = lod.far, near = lod.near || 0;
      const r = Math.ceil(far / T);
      const cx = Math.round(camPos.x / T), cz = Math.round(camPos.z / T);

      // Which tiles this ring wants. Membership is tested against the
      // continuous camera position, not the centre tile, so it can change on
      // sub-metre movement — the identity of the ring has to be the tile list
      // itself, never a quantised camera cell.
      let w = 0, sig = 2166136261, tilePending = false;

      outer:
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const tx = cx + dx, tz = cz + dz;
          const ox = (tx + 0.5) * T - camPos.x, oz = (tz + 0.5) * T - camPos.z;
          const dist = Math.hypot(ox, oz);
          if (dist > far + T * 0.75) continue;
          // The near test has to be the OPPOSITE sign of the far one, and it
          // was not. `dist` is to the tile CENTRE, so `near - T * 0.75` admits
          // any tile whose centre is 3 m from the lens on the clump ring
          // (21 - 18) and 42 m on the far one (78 - 36) — and a tile is 24 and
          // 48 m across, so both rings were drawing their cards from zero
          // metres. Measured on `hero_full` with `--raw` on both sides: hiding
          // `grass_clump` moves 16.734/255 over 35.3% of the frame against a
          // 2.25 floor, while hiding `grass_blade` moves 1.830 over 4.0% and
          // does not clear it. The star tufts at the party's feet were three
          // crossed quads each painting a whole tuft, seen from six metres up.
          //
          // Requiring the tile's nearest CORNER to be outside `near`
          // (`T * 0.75` is a hair over the half-diagonal `T * 0.707`) starts
          // the clump cards at 22 m and the far cards at 80 m, which is where
          // they were always specified to start. Nothing is uncovered: the
          // blade ring's own tiles reach 41 m under the far test above.
          if (near > 0 && dist < near + T * 0.75) continue;
          if (Math.hypot((tx + 0.5) * T, (tz + 0.5) * T) > this.eco.worldRadius + T) continue;
          const e = this._tileFor(ring, li, tx, tz);
          if (!e) { tilePending = true; continue; }
          if (w + e.n > max) break outer;
          e.stamp = this._stamp;
          w += e.n;
          sig = Math.imul(sig ^ (tx & 0xffff), 16777619);
          sig = Math.imul(sig ^ (tz & 0xffff), 16777619);
        }
      }
      ring.packPending = tilePending;
      // Same tile list == same meshes already shown. Nothing to upload either
      // way now; this only skips walking the pool.
      if (sig === ring.packSig && !tilePending) continue;
      const stamp = this._stamp;
      for (const e of ring.pool.values()) {
        const vis = e.stamp === stamp;
        if (e.mesh && e.mesh.visible !== vis) e.mesh.visible = vis;
        if (e.sward && e.sward.visible !== vis) e.sward.visible = vis;
      }
      ring.packSig = sig;
    }
    for (const e of this.rings) if (e.packPending) pending = true;
    this._pending = pending;
    // The first update runs unbounded: it happens during load, and a ring that
    // streams in over the opening second of play is worse than a longer bar.
    this._primed = true;
  }

  get stats() {
    let inst = 0, draws = 0;
    for (const ring of this.rings) {
      for (const e of ring.pool.values()) if (e.mesh && e.mesh.visible) { inst += e.n; draws++; }
    }
    return { instances: inst, draws };
  }
}

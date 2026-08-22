import * as THREE from 'three';
import { Rng } from '../../util/Rng.ts';
import { hash3 } from './Ecology.ts';
import { buildTree, TREE_SPECIES } from './TreeBuilder.ts';
import { patchVeg, bakeFlex, registerAlphaCard } from './VegMaterial.ts';
import { leafClusterTex, bakeTreeImpostor, bakeCanopyCard, barkMaps } from './VegTextures.ts';

/**
 * The forest. Streamed, instanced, three LODs deep.
 *
 *   geometry   0 - 100 m   real branch geometry, casts shadows
 *   impostor   100 - 340 m one baked billboard per tree
 *   canopy     300 - 1250 m one baked *stand* card per 51 m cell
 *
 * Why it is shaped like this. The old version scattered ~2 600 trees once, in a
 * 460 m disc around the world origin, and never moved them. On a 3 km world
 * that was nearly the whole map; on the 8 km world it means the Nebulawood,
 * Malmalam Thicket, the Vesperpool and every other forest zone in the
 * cartography have terrain and no trees at all. Trees now stream on a 64 m tile
 * grid around the camera exactly the way the grass field does, with a
 * millisecond budget on tile generation so a hop across the map fills in over
 * frames instead of dropping one.
 *
 * Why it is affordable. A closed canopy really is tens of thousands of trees
 * per square kilometre, and you cannot draw that as trees. Past ~300 m a tree
 * is smaller than the clump it belongs to, so the far ring's primitive is the
 * clump: `bakeCanopyCard` renders six copies of the real geometry into one 46 m
 * card, and one card per 51 m cell covers a kilometre of forest in ~1 500
 * instances of eight triangles. Everything is baked off the same geometry the
 * near ring draws, so the three LODs agree in silhouette and colour.
 */

const VARIANTS = 3;

/** Tree placement tile, metres, and candidate slots per axis inside it. */
const TILE = 64;
const GRID = 8;
/** Density samples per axis inside a tile (a (DG+1)^2 grid, bilerped). */
const DG = 6;

/** Far canopy tile and the cells inside it. */
const CTILE = 256;
const CGRID = 5;
/** Baked width of a canopy stand card, metres. */
const CANOPY_W = 46;

/** Per-species canopy tint so a grove never reads as one flat colour. */
const SPECIES_TINT = {
  dead: [1.0, 1.0, 1.0],
  savanna: [1.00, 0.92, 0.58],     // dry olive
  conifer: [0.70, 0.83, 0.70],     // cool blue-green
  broadleaf: [0.82, 0.86, 0.66],   // dusty, never lawn-green
  duscae: [0.76, 0.86, 0.64],      // humid basin green
  thicket: [0.62, 0.74, 0.58],     // Malmalam: dark, almost blue-green
  swamp: [0.82, 0.88, 0.70],       // pale willow
};

/**
 * Per-tree value multiplier, applied on top of the composed tint.
 *
 * It used to be `0.62 + rng * 0.40` — a 1.6:1 spread between neighbours, which
 * on top of self-shadowing put near-black trees against near-white ones in the
 * same grove (`tmp/shots/veg0/poi_chocobo.jpg`) and read as a random tint per
 * tree rather than as a forest. Its top end was also 1.02, i.e. an albedo over
 * one before either tint was applied, the same shape as the grass tint bug.
 */
const SHADE_MIN = 0.70, SHADE_SPAN = 0.30;

/**
 * Compose the species tint with the biome's `treeTint` **without squaring their
 * chroma**.
 *
 * Both are green, and `t * bt` multiplies two saturations together: for a
 * Duscae tree in a Duscae zone that took linear r/g to 0.76 and b/g to 0.54
 * from two tints that are each only mildly green on their own. Stacked on the
 * leaf card's own ink — before it was neutralised — the canopy arrived at r/g
 * 0.56, b/g 0.26, which is the candy lime every forest shot showed.
 *
 * So each tint is split into a luminance and a unit-luminance chroma. The
 * luminances multiply, which is what they mean: two independent statements
 * about how dark this canopy is. The chromas *blend* — the species' hue is the
 * subject and the biome's is a nudge at {@link BIOME_HUE} strength — because
 * they are two statements about the same thing, and a product of two hues is
 * not a hue.
 */
const BIOME_HUE = 0.5;
const _lum = (c: any) => Math.max(1e-4, 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
/** biome tint array -> species key -> composed [r,g,b]. Keyed by identity. */
const _tintCache = new WeakMap();
function composeTint(sp: any, t: any, bt: any) {
  let bySpecies = _tintCache.get(bt);
  if (!bySpecies) { bySpecies = new Map(); _tintCache.set(bt, bySpecies); }
  let out = bySpecies.get(sp);
  if (out) return out;
  const lt = _lum(t), lb = _lum(bt);
  const v = lt * lb;
  out = [
    v * (t[0] / lt) * Math.pow(bt[0] / lb, BIOME_HUE),
    v * (t[1] / lt) * Math.pow(bt[1] / lb, BIOME_HUE),
    v * (t[2] / lt) * Math.pow(bt[2] / lb, BIOME_HUE),
  ];
  bySpecies.set(sp, out);
  return out;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Impostor: two crossed quads anchored at the base. */
function billboardGeo(width: any, height: any) {
  const g = new THREE.BufferGeometry();
  const p = [], n = [], uv = [], idx = [], col = [];
  const hw = width * 0.5;
  for (let k = 0; k < 2; k++) {
    const dx = k === 0 ? hw : 0, dz = k === 0 ? 0 : hw;
    const base = k * 4;
    p.push(-dx, 0, -dz, dx, 0, dz, dx, height, dz, -dx, height, -dz);
    for (let i = 0; i < 4; i++) n.push(0, 0.62, 0.78);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let i = 0; i < 4; i++) col.push(1, 1, 1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  bakeFlex(g);
  g.computeBoundingSphere();
  return g;
}

export class Trees {
  tiles!: Map<any, any>;
  _deadline!: number;
  _last!: THREE.Vector3;
  _pending!: boolean;
  _primed!: boolean;
  _stamp!: number;
  _tick!: number;
  budgetMs!: number;
  byKey!: Map<any, any>;
  canBudget!: number;
  canCount!: number;
  canopies!: Map<any, any>;
  canopyNear!: number;
  canopyRange!: number;
  ctiles!: Map<any, any>;
  eco!: any;
  geoBudget!: number;
  geoCount!: number;
  geoRange!: number;
  group!: THREE.Group;
  impBudget!: number;
  impCount!: number;
  impRange!: number;
  impostors!: Map<any, any>;
  quality!: number;
  scene!: any;
  tileCacheMax!: number;
  variants!: any[];
  constructor(eco: any, scene: any, {
    quality = 1, geoRange = 88, impRange = 330,
    canopyNear = 296, canopyRange = 1250,
  } = {}) {
    this.eco = eco;
    this.scene = scene;
    // Everything this system draws hangs off one named group, so `attrib.mjs`
    // (and anything else that wants to price the forest) can hide it in one
    // call instead of walking the scene for meshes by name.
    this.group = new THREE.Group();
    this.group.name = 'trees';
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);
    this.quality = quality;
    this.geoRange = geoRange;
    this.impRange = impRange;
    this.canopyNear = canopyNear;
    this.canopyRange = canopyRange;
    this.variants = [];
    this.impostors = new Map();
    this.canopies = new Map();
    /** key -> array of placements. Built lazily, evicted by age. */
    this.tiles = new Map();
    this.ctiles = new Map();
    this._last = new THREE.Vector3(1e9, 0, 1e9);
    this._pending = true;
    this._primed = false;
    this._deadline = 0;
    this._stamp = 0;
    /** Milliseconds of *tile generation* one update may spend. See GrassField. */
    this.budgetMs = 4;

    // How many of each LOD may be on screen at once. These are the honest
    // cost knobs: geometry is ~1-3 k triangles a tree, the other two are eight.
    this.geoBudget = Math.max(24, Math.round(130 * quality));
    this.impBudget = Math.max(200, Math.round(3000 * quality));
    this.canBudget = Math.max(120, Math.round(1200 * quality));
    this.tileCacheMax = 320;
  }

  /** @param renderer needed to bake impostors */
  build(renderer: THREE.WebGLRenderer) {
    const speciesList = Object.keys(TREE_SPECIES);
    const bark = barkMaps(0x6f5a45);
    const perVariant = Math.max(6, Math.round(52 * this.quality));
    const perImpostor = Math.max(32, Math.round(340 * this.quality));
    const perCanopy = Math.max(48, Math.round(400 * this.quality));

    for (const sp of speciesList) {
      const S = TREE_SPECIES[sp as keyof typeof TREE_SPECIES];
      const woodMat = patchVeg(new THREE.MeshStandardMaterial({
        color: S.bark, roughness: S.barkRough, metalness: 0,
        map: bark.map, normalMap: bark.normalMap,
        normalScale: new THREE.Vector2(0.85, 0.85),
      }), { bend: 0.55, flutter: 0.1, gustFreq: 0.03, flexPow: 2.4 });

      let leafMat: any = null;
      if (S.leafCount > 0) {
        leafMat = patchVeg(new THREE.MeshStandardMaterial({
          map: leafClusterTex(S.leafKind),
          color: 0xffffff, vertexColors: true,
          alphaTest: 0.42, transparent: false, side: THREE.DoubleSide,
          roughness: 0.86, metalness: 0,
        }), {
          bend: 0.75, flutter: 0.5, gustFreq: 0.032, flexPow: 2.2,
          translucency: 0.75, twoSidedNormals: true, specular: 0.12,
        });
      }

      let canopySrc: any = null;
      for (let v = 0; v < VARIANTS; v++) {
        const t = buildTree(sp, 9001 + v * 733 + sp.length * 37);
        const wood = new THREE.InstancedMesh(t.wood, woodMat, perVariant);
        wood.castShadow = true; wood.receiveShadow = true;
        wood.count = 0; wood.visible = false; wood.frustumCulled = false;
        wood.name = `tree_${sp}_${v}_wood`;
        this.group.add(wood);

        let leaves: any = null;
        if (t.leaves && leafMat) {
          leaves = new THREE.InstancedMesh(t.leaves, leafMat, perVariant);
          leaves.castShadow = true; leaves.receiveShadow = true;
          leaves.count = 0; leaves.visible = false; leaves.frustumCulled = false;
          leaves.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(perVariant * 3), 3);
          leaves.name = `tree_${sp}_${v}_leaf`;
          registerAlphaCard(leaves);
          this.group.add(leaves);
        }
        const key = `${sp}_${v}`;
        this.variants.push({ sp, v, key, wood, leaves, height: t.height, radius: t.radius, max: perVariant });

        const src = {
          wood: t.wood, leaves: t.leaves,
          woodMap: bark.map, woodColor: S.bark,
          leafMap: leafMat ? leafMat.map : null,
          height: t.height, radius: Math.max(t.radius, t.height * 0.22),
        };
        if (v === 0) canopySrc = src;

        // distance impostor, baked straight off this variant's geometry
        const impTex = bakeTreeImpostor(renderer, src, 256);
        const impMat = patchVeg(new THREE.MeshStandardMaterial({
          map: impTex, color: 0xffffff, vertexColors: true,
          alphaTest: 0.42, transparent: false, side: THREE.DoubleSide,
          roughness: 0.95, metalness: 0,
        }), {
          bend: 0.2, flutter: 0.06, gustFreq: 0.03, flexPow: 3.0,
          twoSidedNormals: true, translucency: 0.5, specular: 0.06,
        });
        const cardW = src.radius * 2.12;
        const imp = new THREE.InstancedMesh(billboardGeo(cardW, t.height * 1.02), impMat, perImpostor);
        imp.castShadow = false; imp.receiveShadow = true;
        imp.count = 0; imp.visible = false; imp.frustumCulled = false;
        imp.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(perImpostor * 3), 3);
        imp.name = `tree_${key}_impostor`;
        registerAlphaCard(imp);
        this.group.add(imp);
        this.impostors.set(key, { mesh: imp, max: perImpostor });
      }

      // one stand card per species — the far ring's primitive
      const stand = bakeCanopyCard(renderer, canopySrc, {
        count: 6, spread: CANOPY_W / (2 * 1.35 * canopySrc.radius),
        size: 384, seed: 7717 + sp.length * 131,
      });
      const canMat = patchVeg(new THREE.MeshStandardMaterial({
        map: stand.tex, color: 0xffffff, vertexColors: true,
        alphaTest: 0.4, transparent: false, side: THREE.DoubleSide,
        roughness: 0.98, metalness: 0,
      }), {
        bend: 0.06, flutter: 0.02, gustFreq: 0.02, flexPow: 3.0,
        twoSidedNormals: true, translucency: 0.35, specular: 0.0,
      });
      const can = new THREE.InstancedMesh(
        billboardGeo(stand.width, stand.height), canMat, perCanopy);
      can.castShadow = false; can.receiveShadow = false;
      can.count = 0; can.visible = false; can.frustumCulled = false;
      can.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(perCanopy * 3), 3);
      can.name = `canopy_${sp}`;
      registerAlphaCard(can);
      this.group.add(can);
      this.canopies.set(sp, { mesh: can, max: perCanopy, width: stand.width, height: stand.height });
    }

    this.byKey = new Map();
    for (const v of this.variants) this.byKey.set(v.key, v);
  }

  // ------------------------------------------------------------------ tiles

  /**
   * Build (and cache) the tree placements for one 64 m tile.
   *
   * Density is sampled on a coarse grid and bilerped per candidate, the same
   * trick the grass field uses: `treeDensity` costs half a dozen heightfield
   * probes and evaluating it once per candidate would put tens of milliseconds
   * into a stream-in.
   */
  _makeTile(tx: any, tz: any) {
    const eco = this.eco;
    const x0 = tx * TILE, z0 = tz * TILE;
    const rng = new Rng(hash3(tx, tz, 0x7ee5));

    const dg = new Float32Array((DG + 1) * (DG + 1));
    let any = 0;
    for (let j = 0; j <= DG; j++) {
      for (let i = 0; i <= DG; i++) {
        const d = eco.treeDensity(x0 + (i / DG) * TILE, z0 + (j / DG) * TILE);
        dg[j * (DG + 1) + i] = d;
        if (d > any) any = d;
      }
    }
    if (any < 0.015) return [];

    const bil = (u: any, v: any) => {
      const fu = u * DG, fv = v * DG;
      const iu = Math.min(DG - 1, fu | 0), iv = Math.min(DG - 1, fv | 0);
      const su = fu - iu, sv = fv - iv;
      const a = dg[iv * (DG + 1) + iu], b = dg[iv * (DG + 1) + iu + 1];
      const c = dg[(iv + 1) * (DG + 1) + iu], d = dg[(iv + 1) * (DG + 1) + iu + 1];
      return (a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + d * su) * sv;
    };

    const out = [];
    for (let gz = 0; gz < GRID; gz++) {
      for (let gx = 0; gx < GRID; gx++) {
        const u = (gx + rng.next()) / GRID, v = (gz + rng.next()) / GRID;
        const d = bil(u, v);
        if (d < 0.02 || rng.next() > d) continue;
        const x = x0 + u * TILE, z = z0 + v * TILE;
        if (Math.hypot(x, z) > eco.worldRadius) continue;
        const b = eco.veg(x, z);
        const sp = eco.treeSpecies(x, z);
        if (!TREE_SPECIES[sp as keyof typeof TREE_SPECIES]) continue;
        const vi = (rng.next() * VARIANTS) | 0;
        const variant = this.byKey.get(`${sp}_${vi}`);
        if (!variant) continue;
        const s = b.treeS[0] + Math.pow(rng.next(), 1.4) * (b.treeS[1] - b.treeS[0]);
        const c = composeTint(sp, SPECIES_TINT[sp as keyof typeof SPECIES_TINT] || [1, 1, 1], b.treeTint);
        const shade = SHADE_MIN + rng.next() * SHADE_SPAN;
        const hue = rng.gauss(0, 0.06);
        out.push({
          x, z, y: eco.height(x, z), sp, vi, s,
          yaw: rng.next() * Math.PI * 2,
          tilt: rng.gauss(0, 0.04),
          r: shade * c[0] * (1 + hue),
          g: shade * c[1],
          b: shade * c[2] * (1 - hue * 0.8),
          h: variant.height * s,
        });
      }
    }
    return out;
  }

  /** Build (and cache) the far canopy stand cards for one 256 m tile. */
  _makeCanopyTile(tx: any, tz: any) {
    const eco = this.eco;
    const x0 = tx * CTILE, z0 = tz * CTILE;
    const rng = new Rng(hash3(tx, tz, 0x51c0));
    const cell = CTILE / CGRID;
    const out = [];
    for (let j = 0; j < CGRID; j++) {
      for (let i = 0; i < CGRID; i++) {
        const x = x0 + (i + 0.35 + rng.next() * 0.3) * cell;
        const z = z0 + (j + 0.35 + rng.next() * 0.3) * cell;
        if (Math.hypot(x, z) > eco.worldRadius) continue;
        const d = eco.treeDensity(x, z);
        // a stand card is a *mass*; below a quarter cover the ring should show
        // individual impostors thinning out instead
        if (d < 0.26) continue;
        const sp = eco.treeSpecies(x, z);
        const c = this.canopies.get(sp);
        if (!c) continue;
        const b = eco.veg(x, z);
        const tc = composeTint(sp, SPECIES_TINT[sp as keyof typeof SPECIES_TINT] || [1, 1, 1], b.treeTint);
        // fill the cell in plan, keep the real tree height in elevation
        const sx = (cell * 1.28 / c.width) * rng.range(0.86, 1.16);
        const sy = ((b.treeS[0] + b.treeS[1]) * 0.5) * rng.range(0.9, 1.1)
          * (0.72 + 0.34 * d);
        // capped at one: this is a shade, and an albedo multiplier over one is
        // how the near ring used to blow its highlights out to white
        const shade = Math.min(1, (0.62 + 0.3 * d) * rng.range(0.9, 1.1));
        out.push({
          x, z, y: eco.height(x, z), sp,
          sx, sy, yaw: rng.next() * Math.PI * 2,
          r: shade * tc[0], g: shade * tc[1], b: shade * tc[2],
        });
      }
    }
    return out;
  }

  /** @returns null when this frame's generation budget is spent */
  _tile(map: any, key: any, make: any): any[] | null {
    const e = map.get(key);
    if (e) { e.stamp = this._stamp; return e.list; }
    if (this._primed && performance.now() > this._deadline) return null;
    const list = make();
    map.set(key, { list, stamp: this._stamp });
    if (map.size > this.tileCacheMax) {
      const target = Math.round(this.tileCacheMax * 0.8);
      for (const [k, v] of map) {
        if (map.size <= target) break;
        if (v.stamp === this._stamp) continue;
        map.delete(k);
      }
    }
    return list;
  }

  // ----------------------------------------------------------------- update

  /**
   * @param camPos
   *
   * Two throttles, both load-bearing. The camera has to move a full stride
   * before anything is recomputed, because a rebuild rewrites and re-uploads
   * every instance buffer in the forest — about a megabyte. And while tiles are
   * still being generated (`_pending`) the rebuild is rate-limited rather than
   * run every frame: without that, a static camera waiting on a stream-in paid
   * the whole gather and upload sixty times a second, which is exactly how the
   * `menu-open` segment went CPU-bound.
   */
  update(camPos: THREE.Vector3) {
    const moved = this._last.distanceToSquared(camPos);
    if (moved < 144) {
      if (!this._pending) return;
      if ((this._tick = (this._tick | 0) + 1) % 6 !== 0) return;
    }
    this._last.copy(camPos);
    this._deadline = performance.now() + this.budgetMs;
    this._stamp++;
    let pending = false;

    for (const v of this.variants) v._w = 0;
    for (const [, im] of this.impostors) im._w = 0;
    for (const [, c] of this.canopies) c._w = 0;

    const geoR2 = this.geoRange * this.geoRange;
    // A tree the camera is buried *inside* is not scenery, it is a blindfold:
    // one 1.5 m leaf card a metre from the lens fills a third of the frame.
    // Such a tree is dropped for the frame — but only when the eye is properly
    // up in the crown, more than 3.5 m above the root and still under the top.
    // On foot the camera rides two or three metres up, below that floor, so
    // nothing ever blinks out while you walk through a wood; it only bites when
    // the camera is on a bank looking down into the canopy next to it.
    //
    // The radius has to scale with the tree, and a flat 12 m did not. A Duscae
    // canopy tree stands 19 m before its scale multiplier and carries a crown
    // eight metres or more across, so one rooted 15 m away still wraps a camera
    // sitting up in the canopy — outside the flat radius, and `zone_alstor`
    // came back an almost entirely black frame with no instance of anything
    // within 10 m of the lens. `0.55 * h + 3` is roughly the crown radius plus
    // a margin: ~16 m for that Duscae tree, ~8 m for a Leide scrub tree, which
    // is what the flat number was tuned on in the first place.
    const cullFloor = 3.5;
    const impR2 = this.impRange * this.impRange;
    const near: any[] = [];
    let far = 0;

    const rTiles = Math.ceil(this.impRange / TILE) + 1;
    const ctx0 = Math.floor(camPos.x / TILE), ctz0 = Math.floor(camPos.z / TILE);
    for (let dz = -rTiles; dz <= rTiles; dz++) {
      for (let dx = -rTiles; dx <= rTiles; dx++) {
        const tx = ctx0 + dx, tz = ctz0 + dz;
        const ox = (tx + 0.5) * TILE - camPos.x, oz = (tz + 0.5) * TILE - camPos.z;
        if (Math.hypot(ox, oz) > this.impRange + TILE) continue;
        const list = this._tile(this.tiles, (tx & 4095) * 8192 + (tz & 4095),
          () => this._makeTile(tx, tz));
        if (!list) { pending = true; continue; }
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          const ddx = p.x - camPos.x, ddz = p.z - camPos.z;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 > impR2) continue;
          if (camPos.y > p.y + cullFloor && camPos.y < p.y + p.h) {
            const cr = 0.55 * p.h + 3;
            if (d2 < cr * cr) continue;
          }
          if (d2 < geoR2) near.push(d2, p);
          else if (far < this.impBudget && this._writeImpostor(p)) far++;
        }
      }
    }

    // near pass second but sorted, so the closest trees always win the
    // geometry budget and everything else falls back to its own impostor
    const order = [];
    for (let i = 0; i < near.length; i += 2) order.push(i);
    order.sort((a, b) => near[a] - near[b]);
    let geo = 0;
    for (let i = 0; i < order.length; i++) {
      const p = near[order[i] + 1];
      const v = this.byKey.get(`${p.sp}_${p.vi}`);
      if (!v) continue;
      if (geo >= this.geoBudget || v._w >= v.max) {
        if (far < this.impBudget && this._writeImpostor(p)) far++;
        continue;
      }
      const w = v._w++;
      geo++;
      _e.set(p.tilt, p.yaw, p.tilt * 0.7);
      _q.setFromEuler(_e);
      _p.set(p.x, p.y - 0.15, p.z);
      _s.set(p.s, p.s, p.s);
      _m.compose(_p, _q, _s);
      _m.toArray(v.wood.instanceMatrix.array, w * 16);
      if (v.leaves) {
        _m.toArray(v.leaves.instanceMatrix.array, w * 16);
        const c = v.leaves.instanceColor.array;
        c[w * 3] = p.r; c[w * 3 + 1] = p.g; c[w * 3 + 2] = p.b;
      }
    }

    // far ring: stand cards
    const nearC2 = this.canopyNear * this.canopyNear;
    const farC = this.canopyRange;
    const rc = Math.ceil(farC / CTILE) + 1;
    const cx0 = Math.floor(camPos.x / CTILE), cz0 = Math.floor(camPos.z / CTILE);
    let cn = 0;
    for (let dz = -rc; dz <= rc; dz++) {
      for (let dx = -rc; dx <= rc; dx++) {
        const tx = cx0 + dx, tz = cz0 + dz;
        const ox = (tx + 0.5) * CTILE - camPos.x, oz = (tz + 0.5) * CTILE - camPos.z;
        const dist = Math.hypot(ox, oz);
        if (dist > farC + CTILE) continue;
        if (dist < this.canopyNear - CTILE) continue;
        const list = this._tile(this.ctiles, (tx & 4095) * 8192 + (tz & 4095),
          () => this._makeCanopyTile(tx, tz));
        if (!list) { pending = true; continue; }
        for (let i = 0; i < list.length && cn < this.canBudget; i++) {
          const p = list[i];
          const ddx = p.x - camPos.x, ddz = p.z - camPos.z;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 < nearC2 || d2 > farC * farC) continue;
          const c = this.canopies.get(p.sp);
          if (!c || c._w >= c.max) continue;
          const w = c._w++;
          cn++;
          _e.set(0, p.yaw, 0);
          _q.setFromEuler(_e);
          _p.set(p.x, p.y - 0.4, p.z);
          _s.set(p.sx, p.sy, p.sx);
          _m.compose(_p, _q, _s);
          _m.toArray(c.mesh.instanceMatrix.array, w * 16);
          const a = c.mesh.instanceColor.array;
          a[w * 3] = p.r; a[w * 3 + 1] = p.g; a[w * 3 + 2] = p.b;
        }
      }
    }

    for (const v of this.variants) {
      v.wood.count = v._w;
      v.wood.visible = v._w > 0;
      v.wood.instanceMatrix.needsUpdate = true;
      if (v.leaves) {
        v.leaves.count = v._w;
        v.leaves.visible = v._w > 0;
        v.leaves.instanceMatrix.needsUpdate = true;
        v.leaves.instanceColor.needsUpdate = true;
      }
    }
    for (const [, im] of this.impostors) {
      im.mesh.count = im._w;
      im.mesh.visible = im._w > 0;
      im.mesh.instanceMatrix.needsUpdate = true;
      im.mesh.instanceColor.needsUpdate = true;
    }
    for (const [, c] of this.canopies) {
      c.mesh.count = c._w;
      c.mesh.visible = c._w > 0;
      c.mesh.instanceMatrix.needsUpdate = true;
      c.mesh.instanceColor.needsUpdate = true;
    }

    this.geoCount = geo; this.impCount = far; this.canCount = cn;
    this._pending = pending;
    this._primed = true;
  }

  /** @returns true if the placement found a slot */
  _writeImpostor(p: any): boolean {
    const im = this.impostors.get(`${p.sp}_${p.vi}`);
    if (!im || im._w >= im.max) return false;
    const w = im._w++;
    _e.set(0, p.yaw, 0);
    _q.setFromEuler(_e);
    _p.set(p.x, p.y - 0.15, p.z);
    _s.set(p.s, p.s, p.s);
    _m.compose(_p, _q, _s);
    _m.toArray(im.mesh.instanceMatrix.array, w * 16);
    const c = im.mesh.instanceColor.array;
    c[w * 3] = p.r; c[w * 3 + 1] = p.g; c[w * 3 + 2] = p.b;
    return true;
  }

  get stats() {
    return {
      geometry: this.geoCount | 0, impostors: this.impCount | 0,
      canopy: this.canCount | 0, tiles: this.tiles.size,
    };
  }
}

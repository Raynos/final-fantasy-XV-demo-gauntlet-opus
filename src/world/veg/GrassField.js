import * as THREE from 'three';
import { Rng } from '../../util/Rng.js';
import { hash3 } from './Ecology.js';
import { patchVeg, bakeFlex, registerAlphaCard } from './VegMaterial.js';
import { grassClumpTex } from './VegTextures.js';

/**
 * Camera-following instanced grass with three LOD rings:
 *
 *   0  real tapered blade geometry, grown in tufts, 0-30 m
 *   1  crossed alpha-cut tuft cards, 25-95 m
 *   2  big sparse clump cards, 88-190 m
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
// The blade ring is short because Leide grass is ankle-to-calf high. Past
// thirty metres a whole tuft is a couple of pixels, and one textured card per
// tuft is then both cheaper and *more* accurate than a hundred sub-pixel
// triangles. `spacing` on that ring is therefore the tuft grid, not the blade
// grid: every accepted cell spawns a whole clump.
//
// The outer ring used to reach 300 m. An alpha-cut card that small samples the
// coarsest mips, where its silhouette no longer exists, so the whole quad
// passes or fails as one block and the field turns into a rash of dark
// rectangles. Ending the ring where the cards are still several pixels across
// and handing the rest to the terrain's own grass tint reads far better than
// stamping geometry the alpha test cannot resolve.
const LODS = [
  { name: 'blade', tile: 12, far: 30, spacing: 0.36, max: 240000 },
  { name: 'clump', tile: 24, near: 25, far: 95, spacing: 0.46, max: 105000 },
  { name: 'far', tile: 48, near: 88, far: 190, spacing: 1.7, max: 44000 },
];

/** Blades in the fattest tuft. Sizes the tile scratch buffer. */
const MAX_PER_CLUMP = 22;

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
function bladeGeometry(segs = 4) {
  const pos = [], nor = [], uv = [], col = [], flex = [], idx = [];
  const HALF_W = 0.043;   // half width at the root, as a fraction of height
  const CURVE = 0.34;     // tip offset along +Z, as a fraction of height
  const FAN = 0.95;       // lateral normal spread -> rounded cross-section
  const shadeAt = (t) => 0.40 + Math.pow(t, 0.75) * 0.62;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const w = HALF_W * Math.pow(1 - t, 0.6);
    const z = CURVE * t * t;
    for (let s = -1; s <= 1; s += 2) {
      pos.push(s * w, t, z);
      // the blade leans further off vertical as it droops, so the face normal
      // tips forward with it
      nor.push(s * FAN, 0.9, 0.42 + t * 0.72);
      uv.push(s * 0.5 + 0.5, t);
      const shade = shadeAt(t);
      col.push(shade * 0.99, shade, shade * 0.83);
      flex.push(t);
    }
  }
  pos.push(0, 1, CURVE);
  nor.push(0, 0.9, 1.14);
  uv.push(0.5, 1);
  const st = shadeAt(1);
  col.push(st * 0.99, st, st * 0.83);
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

/** N crossed quads, unit height, used for clump cards. */
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
      const shade = 0.5 + vv * 0.48;
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

export class GrassField {
  /** Debug switch for bisecting the pack-skip optimisation against a capture. */
  /**
   * @param {import('./Ecology.js').Ecology} eco
   * @param {THREE.Scene} scene
   */
  constructor(eco, scene, { quality = 1 } = {}) {
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
     */
    this.budgetMs = 4;
    this._primed = false;
    this._deadline = 0;
    this._stamp = 0;
  }

  build() {
    const bladeGeo = bladeGeometry(4);
    const clumpGeo = crossCardGeometry(3, 1.0);
    const farGeo = crossCardGeometry(2, 1.0);

    const grassMat = (opts) => patchVeg(new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.86, metalness: 0,
      side: THREE.DoubleSide, ...opts.mat,
    }), opts.veg);

    // roughness low enough that the rounded cross-section actually catches a
    // specular streak down the midrib; translucency so backlit blades glow
    // at dawn/dusk instead of going to silhouette.
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
        twoSidedNormals: true, aoBoost: 0.3, specular: 0,
      },
    });
    const m2 = grassMat({
      mat: { map: clumpTexB, alphaTest: 0.42, transparent: false, roughness: 0.96 },
      veg: {
        bend: 0.24, flutter: 0.1, gustFreq: 0.045, flexPow: 2.0,
        twoSidedNormals: true, aoBoost: 0.2, specular: 0,
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
   * @returns {{mesh:THREE.InstancedMesh|null, n:number, stamp:number}|null}
   *   null when the frame's generation budget is spent.
   */
  _tileFor(ring, li, tx, tz) {
    const key = (tx & 2047) * 4096 + (tz & 2047);
    const e = ring.pool.get(key);
    if (e) return e;
    if (this._primed && performance.now() > this._deadline) return null;

    const t = this._makeTile(li, tx, tz);
    let mesh = null;
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
    const entry = { mesh, n: t.n, stamp: 0 };
    ring.pool.set(key, entry);
    if (ring.pool.size > ring.cacheMax) this._evict(ring);
    return entry;
  }

  /** Drop the oldest tiles that are not currently on screen. */
  _evict(ring) {
    const target = Math.round(ring.cacheMax * 0.8);
    for (const [k, e] of ring.pool) {
      if (ring.pool.size <= target) break;
      if (e.stamp === this._stamp) continue;      // in this frame's ring
      if (e.mesh) { ring.group.remove(e.mesh); e.mesh.dispose(); }
      ring.pool.delete(k);
    }
  }

  /** Build (and cache) one tile's instance data. */
  _makeTile(li, tx, tz) {
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
    for (let j = 0; j <= CG; j++) {
      for (let i = 0; i <= CG; i++) {
        const x = x0 + (i / CG) * T, z = z0 + (j / CG) * T;
        const k = j * (CG + 1) + i;
        dg[k] = eco.grassDensity(x, z);
        wg[k] = eco.wetness(x, z);
        sg[k] = eco.grassScale(x, z);
        kg[k] = eco.grassDead(x, z);
        eco.grassColor(x, z, _cGrass);
        eco.groundColor(x, z, _cGround);
        _cGrass.lerp(_cGround, 0.32);
        cg[k * 3] = _cGrass.r; cg[k * 3 + 1] = _cGrass.g; cg[k * 3 + 2] = _cGrass.b;
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
    const bil = (arr, g, u, v, stride = 1, c = 0) => {
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
    let count = 0;

    // Per-clump colour: a tuft is one plant, so it is one colour. Spreading
    // the dry/green spread across individual blades instead just averages back
    // out to a uniform field at any distance.
    const tint = (u, v, wet, dry, k) => {
      const r = bil(cg, CG, u, v, 3, 0), g = bil(cg, CG, u, v, 3, 1), b = bil(cg, CG, u, v, 3, 2);
      // dry tufts bleach toward straw: red up, blue down, value up
      const lift = k * (1 + dry * 0.10);
      cArr[count * 3] = r * lift * (1 + dry * 0.44);
      cArr[count * 3 + 1] = g * lift * (1 + dry * 0.13);
      cArr[count * 3 + 2] = b * lift * (1 - dry * 0.40) * (0.9 + wet * 0.28);
    };

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const u = (i + rng.next()) / n, v = (j + rng.next()) / n;
        const d = bil(dg, CG, u, v);
        const roll = rng.next();
        const clumpRnd = rng.next();
        const colRnd = rng.next();
        const deadRnd = rng.next();
        if (d < 0.02 || roll > d * 1.3) continue;
        const x = x0 + u * T, z = z0 + v * T;
        const y = bil(hg, HG, u, v);
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

        if (isBlade) {
          // one tuft: a ring of blades leaning out of a shared root, tallest
          // in the middle. Radius and population both vary, so the field is
          // tufts-and-dirt rather than an even scatter.
          // heavy-tailed tuft size: mostly small sprigs, the odd fat tussock
          const vig = 0.55 + Math.pow(clumpRnd, 1.7) * 1.35;
          const rad = (0.05 + clumpRnd * 0.13 + rng.next() * 0.07) * vig;
          // whole-tuft lean: a real tussock is combed over by the prevailing
          // wind, so it is never the radially symmetric pom-pom that a pure
          // outward splay produces
          const tuftA = rng.next() * Math.PI * 2;
          const tuftL = rng.next() * 0.30;
          const nb = Math.min(MAX_PER_CLUMP,
            Math.max(3, Math.round((4 + d * 14) * (0.55 + rng.next() * 0.95))));
          const hBase = (0.10 + 0.10 * d + 0.13 * wet * wet) * (0.68 + vig * 0.38) * hMul;
          const k = (dead ? 0.92 : 0.62) + colRnd * 0.62;
          for (let bI = 0; bI < nb; bI++) {
            if (count >= cap) break;
            const a = rng.next() * Math.PI * 2;
            const rr = Math.sqrt(rng.next()) * rad;
            // blades at the edge of a tuft are shorter and lean out further
            const edge = rr / Math.max(rad, 1e-4);
            // long tail on the height so a few stems overtop the tuft
            const h = hBase * (0.45 + Math.pow(rng.next(), 0.7) * 1.15) * (1 - edge * 0.28);
            const lean = (0.10 + edge * 0.42) * (0.6 + rng.next() * 0.9);
            const yaw = a + rng.gauss(0, 0.5);
            // droop grows faster than height: a half-metre stem lies over
            // under its own weight, an ankle-high one stands up
            const zj = (0.55 + h * 2.4) * (0.7 + rng.next() * 0.7);
            _e.set(Math.sin(a) * lean + Math.sin(tuftA) * tuftL,
              yaw, -Math.cos(a) * lean - Math.cos(tuftA) * tuftL);
            _q.setFromEuler(_e);
            _pos.set(x + Math.cos(a) * rr, y - 0.015, z + Math.sin(a) * rr);
            _scl.set(h * (0.82 + rng.next() * 0.4), h, h * zj);
            _m.compose(_pos, _q, _scl);
            _m.toArray(mArr, count * 16);
            tint(u, v, wet, dry, k * (0.9 + rng.next() * 0.2));
            count++;
          }
          continue;
        }

        const jitter = rng.next();
        let h, w;
        if (li === 1) {
          // one card == one tuft, matched to the blade ring it takes over from
          h = (0.16 + 0.22 * d + 0.2 * wet * wet) * (0.75 + jitter * 0.85) * hMul;
          w = h * (1.5 + rng.next() * 1.1);
        } else {
          // bigger cards on the outer ring: a few large clumps resolve, a
          // scatter of tiny ones only aliases
          h = (0.3 + 0.4 * d) * (0.8 + jitter * 0.8) * hMul;
          w = h * (1.8 + rng.next() * 1.2);
        }
        const yaw = rng.next() * Math.PI * 2;
        _e.set(rng.gauss(0, 0.07), yaw, rng.gauss(0, 0.06));
        _q.setFromEuler(_e);
        _pos.set(x, y - 0.03, z);
        _scl.set(w, h, w);
        _m.compose(_pos, _q, _scl);
        _m.toArray(mArr, count * 16);
        tint(u, v, wet, dry, (dead ? 0.85 : 0.58) + jitter * 0.46);
        count++;
      }
    }
    // slice (not subarray) so the oversized candidate buffer can be collected
    return { m: mArr.slice(0, count * 16), c: cArr.slice(0, count * 3), n: count, y0, y1 };
  }

  /** @param {THREE.Vector3} camPos */
  update(camPos) {
    const moved = this._last.distanceToSquared(camPos);
    if (moved < 25 && !this._pending) return;
    this._deadline = performance.now() + this.budgetMs;
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
          if (near > 0 && dist < near - T * 0.75) continue;
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
        if (!e.mesh) continue;
        const vis = e.stamp === stamp;
        if (e.mesh.visible !== vis) e.mesh.visible = vis;
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

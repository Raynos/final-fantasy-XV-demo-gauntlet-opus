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
 * regenerates byte-identically no matter which order tiles stream in. Tiles are
 * cached as flat matrix/colour arrays; a refill is then just a memcpy, which is
 * what keeps the whole field at three draw calls with no per-frame CPU cost.
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
    this.tiles = new Map();
    this.meshes = [];
    this._last = new THREE.Vector3(1e9, 0, 1e9);
    this._budget = 10;         // new tiles generated per update
    this._pending = true;
    /** Scratch: the tiles a single ring pack visits, reused every update. */
    this._list = [];
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
    const m1 = grassMat({
      mat: { map: clumpTexA, alphaTest: 0.42, transparent: false },
      veg: { bend: 0.3, flutter: 0.2, gustFreq: 0.05, trample: 0.7, flexPow: 2.0, twoSidedNormals: true, aoBoost: 0.3 },
    });
    const m2 = grassMat({
      mat: { map: clumpTexB, alphaTest: 0.42, transparent: false },
      veg: { bend: 0.24, flutter: 0.1, gustFreq: 0.045, flexPow: 2.0, twoSidedNormals: true, aoBoost: 0.2 },
    });

    const geos = [bladeGeo, clumpGeo, farGeo];
    const mats = [m0, m1, m2];

    for (let i = 0; i < LODS.length; i++) {
      const lod = LODS[i];
      const max = Math.max(64, Math.floor(lod.max * this.quality));
      const mesh = new THREE.InstancedMesh(geos[i], mats[i], max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;

      // Double buffer. Re-uploading the blade ring's 240 k instance matrices
      // into the buffer the GPU is still reading costs 14 ms of pipeline stall
      // (measured: 5.6 ms/frame without the upload, 20.0 ms with). Writing into
      // the *other* buffer and swapping means the driver never has to wait for
      // the in-flight draw to retire.
      const alt = {
        matrix: new THREE.InstancedBufferAttribute(new Float32Array(max * 16), 16),
        color: new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3),
      };
      alt.matrix.setUsage(THREE.DynamicDrawUsage);
      alt.color.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      mesh.name = `grass_${lod.name}`;
      if (i > 0) registerAlphaCard(mesh);
      this.scene.add(mesh);
      this.meshes.push({
        mesh, lod, max, alt,
        // hash of the packed tile list, and whether the pack was left incomplete
        packSig: 0, packPending: true,
      });
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
    const cg = new Float32Array((CG + 1) * (CG + 1) * 3);
    for (let j = 0; j <= CG; j++) {
      for (let i = 0; i <= CG; i++) {
        const x = x0 + (i / CG) * T, z = z0 + (j / CG) * T;
        const k = j * (CG + 1) + i;
        dg[k] = eco.grassDensity(x, z);
        wg[k] = eco.wetness(x, z);
        eco.grassColor(x, z, _cGrass);
        eco.groundColor(x, z, _cGround);
        _cGrass.lerp(_cGround, 0.32);
        cg[k * 3] = _cGrass.r; cg[k * 3 + 1] = _cGrass.g; cg[k * 3 + 2] = _cGrass.b;
      }
    }
    const hg = new Float32Array((HG + 1) * (HG + 1));
    for (let j = 0; j <= HG; j++) {
      for (let i = 0; i <= HG; i++) {
        hg[j * (HG + 1) + i] = eco.height(x0 + (i / HG) * T, z0 + (j / HG) * T);
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
        // Green only where the water collects; everything else goes to straw.
        // A fifth of the tufts are last season's, dead and bleached whatever
        // the ground is doing — that speckle of pale tussocks among the olive
        // is the single most recognisable thing about the Leide flats.
        const dead = deadRnd < 0.2 - wet * 0.12;
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
          const hBase = (0.10 + 0.10 * d + 0.13 * wet * wet) * (0.68 + vig * 0.38);
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
          h = (0.16 + 0.22 * d + 0.2 * wet * wet) * (0.75 + jitter * 0.85);
          w = h * (1.5 + rng.next() * 1.1);
        } else {
          // bigger cards on the outer ring: a few large clumps resolve, a
          // scatter of tiny ones only aliases
          h = (0.3 + 0.4 * d) * (0.8 + jitter * 0.8);
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
    return { m: mArr.slice(0, count * 16), c: cArr.slice(0, count * 3), n: count };
  }

  _tileFor(li, tx, tz) {
    const key = (li * 4096 + (tx & 2047)) * 4096 + (tz & 2047);
    let t = this.tiles.get(key);
    if (t) return t;
    if (this._budget <= 0) return null;
    this._budget--;
    t = this._makeTile(li, tx, tz);
    this.tiles.set(key, t);
    if (this.tiles.size > 900) {
      // cheap FIFO eviction — tiles are pure functions of position
      const it = this.tiles.keys();
      for (let i = 0; i < 120; i++) { const k = it.next().value; if (k !== key) this.tiles.delete(k); }
    }
    return t;
  }

  /** @param {THREE.Vector3} camPos */
  update(camPos) {
    const moved = this._last.distanceToSquared(camPos);
    if (moved < 25 && !this._pending) return;
    this._budget = 10;
    this._last.copy(camPos);
    let pending = false;

    for (let li = 0; li < this.meshes.length; li++) {
      const entry = this.meshes[li];
      const { mesh, lod, max, alt } = entry;
      const T = lod.tile;
      const far = lod.far, near = lod.near || 0;
      const r = Math.ceil(far / T);
      const cx = Math.round(camPos.x / T), cz = Math.round(camPos.z / T);

      // Pass one: work out *which* tiles this ring wants and whether that set
      // is the one already sitting in the buffer. Ring membership is tested
      // against the continuous camera position, not the centre tile, so it can
      // change on sub-metre movement — the identity of the pack has to be the
      // tile list itself, never a quantised camera cell.
      const list = this._list;
      let count = 0, w = 0, sig = 2166136261, tilePending = false;

      outer:
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const tx = cx + dx, tz = cz + dz;
          const ox = (tx + 0.5) * T - camPos.x, oz = (tz + 0.5) * T - camPos.z;
          const dist = Math.hypot(ox, oz);
          if (dist > far + T * 0.75) continue;
          if (near > 0 && dist < near - T * 0.75) continue;
          if (Math.hypot((tx + 0.5) * T, (tz + 0.5) * T) > this.eco.worldRadius + T) continue;
          const t = this._tileFor(li, tx, tz);
          if (!t) { tilePending = true; continue; }
          if (w + t.n > max) break outer;
          list[count++] = t;
          w += t.n;
          sig = Math.imul(sig ^ (tx & 0xffff), 16777619);
          sig = Math.imul(sig ^ (tz & 0xffff), 16777619);
        }
      }
      entry.packPending = tilePending;
      // Identical tile list in the same order == identical bytes. Re-uploading
      // the blade ring's 240 k matrices costs ~14 ms of pipeline stall, and on
      // most frames the ring has not changed at all.
      if (sig === entry.packSig && w === mesh.count) continue;

      const mAttr = alt.matrix, cAttr = alt.color;
      const mArr = mAttr.array, cArr = cAttr.array;
      let o = 0;
      for (let k = 0; k < count; k++) {
        const t = list[k];
        mArr.set(t.m, o * 16);
        cArr.set(t.c, o * 3);
        o += t.n;
      }
      // Only the written prefix is dirty; the tail is whatever the last pack
      // left there and is never drawn, so there is no reason to send it.
      mAttr.clearUpdateRanges();
      mAttr.addUpdateRange(0, w * 16);
      cAttr.clearUpdateRanges();
      cAttr.addUpdateRange(0, w * 3);
      mAttr.needsUpdate = true;
      cAttr.needsUpdate = true;

      alt.matrix = mesh.instanceMatrix;
      alt.color = mesh.instanceColor;
      mesh.instanceMatrix = mAttr;
      mesh.instanceColor = cAttr;
      mesh.count = w;
      entry.packSig = sig;
    }
    for (const e of this.meshes) if (e.packPending) pending = true;
    this._pending = pending;
  }

  get stats() {
    let inst = 0;
    for (const m of this.meshes) inst += m.mesh.count;
    return { instances: inst, draws: this.meshes.length };
  }
}

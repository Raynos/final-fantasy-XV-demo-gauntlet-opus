import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assertAttributeContract } from '../../util/GeoAssert.ts';
import { bakedGeo } from '../../engine/GeoBake.ts';

/**
 * A position / rotation / scale triple, written as an array literal at every
 * call site in the prop kits. Not a tuple: the kits index it and pass slices
 * around, and a `[number, number, number]` would only make those sites cast.
 */
export type Vec3 = number[];

/** One cross-section of a {@link loft}: a station at `x`, and its ring of `[y,z]`. */
export interface LoftSection { x: number; pts: number[][] }

/**
 * The population {@link PartBuilder.build}'s attribute-contract check has seen.
 *
 * **A zero over a population of zero is a check that never ran**, which is the
 * lesson `geocheck` learned when it gated `assertAttributeContract` over the
 * bestiary and had to print the pair count next to the verdict. `broken` alone
 * is not evidence of anything; `checked` and `binding` are what make it
 * evidence. `binding` counts the pairs where the material actually asks for an
 * attribute — a map, an aoMap, a normalMap or `vertexColors` — because a
 * contract check over materials that bind nothing is vacuous.
 *
 * Read by `src/tools/probes/attrcontract.mts`.
 */
export const ATTR_CONTRACT = { checked: 0, binding: 0, broken: 0 };

/**
 * Accumulates transformed geometry per material and emits one merged mesh per
 * material. Keeping a whole structure (car, shack, campsite) to a handful of
 * draw calls is the whole point.
 */
export class PartBuilder {
  byMat!: Map<THREE.Material, THREE.BufferGeometry[]>;
  constructor() { this.byMat = new Map(); }

  /**
   * @param geo consumed (cloned internally when transformed)
   * @param matrix optional transform
   */
  add(mat: THREE.Material, geo: THREE.BufferGeometry, matrix?: THREE.Matrix4 | null) {
    const g = prep(matrix ? geo.clone().applyMatrix4(matrix) : geo);
    let list = this.byMat.get(mat);
    if (!list) { list = []; this.byMat.set(mat, list); }
    list.push(g);
    return this;
  }

  /** Convenience: place a primitive with position / rotation / scale. */
  place(mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(pos[0], pos[1], pos[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
      new THREE.Vector3(scale[0], scale[1], scale[2])
    );
    return this.add(mat, geo, m);
  }

  /**
   * Emit one merged mesh per material into `parent`.
   *
   * `mergeShadow` adds one more: a position-only {@link shadowProxy} standing in
   * for every opaque mesh this call produced, which then stop casting for
   * themselves. Use it wherever a structure is split by material rather than by
   * object — see the note on {@link shadowProxy} for when it pays.
   *
   * Split into {@link PartBuilder.merge} and {@link emitParts} so the geometry
   * bake can sit between the two: `merge()` is what a cache hit replaces,
   * `emitParts()` is what both paths still run. Behaviour is unchanged either
   * way round.
   */
  build(parent: THREE.Object3D, opts: BuildOpts = {}): THREE.Object3D {
    emitParts(parent, this.merge(), opts);
    return parent;
  }

  /**
   * Merge the accumulated pieces into one geometry per material.
   *
   * Consumes the builder — `byMat` is cleared — and makes no meshes, so this is
   * the half of `build()` that produces *vertices*, and therefore the half a
   * cache can serve. Measured: the merge itself is 23 ms of the 417 ms the eight
   * prebuilt POI compounds cost, so the win is in never running the kit function
   * at all, not in skipping the merge.
   */
  merge(): MergedPart[] {
    const out: MergedPart[] = [];
    for (const [mat, list] of this.byMat) {
      // If the material reads vertex colours -- or if any piece in this batch
      // carries them -- then every piece must have them. `mergeGeometries`
      // returns null on an attribute mismatch and does so silently, and a
      // material with `vertexColors` and no `color` attribute draws BLACK,
      // because GLSL reads an absent attribute as zero. Both failures are
      // invisible until something in the frame is missing or is a silhouette.
      const wantsColor = (mat as THREE.Material & { vertexColors?: boolean }).vertexColors === true;
      if ((wantsColor || list.some(g => g.attributes.color)) && list.some(g => !g.attributes.color)) {
        for (const g of list) {
          if (g.attributes.color) continue;
          const n = g.attributes.position.count;
          const white = new Float32Array(n * 3).fill(1);
          g.setAttribute('color', new THREE.BufferAttribute(white, 3));
        }
      }
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!merged) {
        // A null merge used to `continue`, which deletes a whole structure and
        // says nothing -- the systemic failure plan section 5.5 exists to fix,
        // and the one our own `Debris` found independently. `prep` should make
        // it unreachable; if it happens anyway the pieces still ship, at one
        // draw call each, and the console says which material it was.
        console.warn(`[PartBuilder] merge returned null for ${mat.name || mat.type} (${list.length} pieces); drawing them unmerged`);
        for (const g of list) {
          g.computeBoundingSphere();
          out.push({ mat, geo: g, unmerged: true });
        }
        continue;
      }
      merged.computeBoundingSphere();
      out.push({ mat, geo: merged });
    }
    this.byMat.clear();
    return out;
  }
}

/** One material's merged geometry, on its way to a mesh. */
export interface MergedPart {
  mat: THREE.Material;
  geo: THREE.BufferGeometry;
  /** true when `mergeGeometries` refused and the piece ships on its own */
  unmerged?: boolean;
}

/** {@link PartBuilder.build}'s options, shared with {@link bakedParts}. */
export interface BuildOpts { cast?: boolean; receive?: boolean; name?: string; mergeShadow?: boolean }

/**
 * Turn merged parts into meshes under `parent`.
 *
 * @returns only what THIS call made — `parent` may already hold another
 *   builder's output (`RoadFurniture` runs two builders into one group) and a
 *   proxy that swallowed those would take their shadows with it.
 */
export function emitParts(parent: THREE.Object3D, parts: MergedPart[],
  { cast = true, receive = true, name = 'part', mergeShadow = false }: BuildOpts = {}): THREE.Mesh[] {
  const made: THREE.Mesh[] = [];
  for (const { mat, geo, unmerged } of parts) {
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    if (unmerged) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast; m.receiveShadow = receive;
      m.name = `${name}_unmerged`;
      parent.add(m);
      made.push(m);
      continue;
    }
    /**
     * **The attribute contract, checked on the shipped mesh.**
     *
     * `assertAttributeContract` was the one assert in `GeoAssert.ts` with no
     * caller in the game at all — `geocheck` gates it over the bestiary, which
     * is the only population it can build in bare Node, and nothing in
     * `src/world/` had ever run it. This is the call site the harness lane
     * handed over, and it is the right one because it is where the geometry and
     * the material finally meet: every prop kit, all 124 POIs, the
     * megastructures, the outposts and the road furniture come through here, so
     * one call covers the whole prop layer.
     *
     * It also runs on geometry restored from the **geometry bake**, which makes
     * it a free correctness gate on that codec: a part whose attributes did not
     * survive the round trip fails here, loudly, on the first boot after a bake.
     *
     * The failure it is looking for is silent by construction. An undeclared
     * attribute binds to a constant of zero, so a missing UV samples texel
     * (0,0) of every map — which is a colour, so it reads as a material
     * choice — and `vertexColors` with no `color` attribute draws BLACK. This
     * class of bug has shipped here more than once: it is the reason `merge`
     * synthesises white, and it is the reason `Megastructures.M.stone` carries
     * a paragraph about `instanceTint`.
     *
     * **`try`/`catch` + `console.error`, never a bare throw.** A throw from
     * anything on an `init()` path means `GAME.ready` is never set, and every
     * browser-backed tool on the machine then returns a bare `waitForFunction`
     * timeout with no message — indistinguishable from a slow boot, a broken
     * build or a restarting daemon, all of which can be true at once. That cost
     * an agent most of an hour the day `GeoAssert.ts` landed. Catching and
     * logging is still red — `shoot.mts` exits non-zero on any console error —
     * and the page still boots, so you can look at the thing the assert is
     * complaining about.
     */
    ATTR_CONTRACT.checked++;
    const mm = mat as THREE.Material & { map?: unknown, normalMap?: unknown, aoMap?: unknown };
    if (mm.map || mm.normalMap || mm.aoMap || mm.vertexColors) ATTR_CONTRACT.binding++;
    try { assertAttributeContract(geo, mm, `PartBuilder.build ${name}/${mat.name || mat.type}`); }
    catch (e) { ATTR_CONTRACT.broken++; console.error(e); }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.name = `${name}_${mat.name || mat.uuid.slice(0, 4)}`;
    parent.add(mesh);
    made.push(mesh);
  }
  if (cast && mergeShadow) {
    const proxy = shadowProxy(made, `${name}_shadow`);
    if (proxy) {
      proxy.visible = true;
      for (const m of made) if (!alphaCut(m.material)) m.castShadow = false;
      parent.add(proxy);
    }
  }
  return made;
}

/**
 * {@link PartBuilder.build}, served from the geometry bake.
 *
 * On a hit `fill` never runs: the kit function, every primitive it lofts and
 * every merge are all replaced by an array copy out of the container. On a miss
 * it runs exactly as it always did and the parts are recorded on the way past.
 *
 * `resolve` is what makes a hit safe. A material's only identity that survives a
 * page load is its `name`, so the entry stores names and this turns them back
 * into materials; a name the caller cannot answer means the entry was never
 * recorded in the first place. See {@link bakedGeo}.
 *
 * @param key namespaced cache key, `system/thing`
 * @param parent where the meshes go
 * @param resolve `material.name` -> material
 * @param fill runs the generator into a fresh builder; its return value is
 *   carried through the cache as JSON, so keep it small and plain
 */
export function bakedParts<M>(
  key: string,
  parent: THREE.Object3D,
  resolve: (name: string) => THREE.Material | undefined,
  fill: (B: PartBuilder) => M,
  opts: BuildOpts = {},
): { made: THREE.Mesh[], meta: M, hit: boolean } {
  const r = bakedGeo<M>(key, resolve, () => {
    const B = new PartBuilder();
    const meta = fill(B);
    return { parts: B.merge().map(({ mat, geo }) => ({ mat: mat.name, geo })), meta };
  });
  const parts: MergedPart[] = [];
  for (const p of r.parts) {
    const mat = resolve(p.mat);
    if (mat) parts.push({ mat, geo: p.geo });
  }
  const made = emitParts(parent, parts, opts);
  return { made, meta: r.meta, hit: r.hit };
}

/** Does this material's silhouette live in its alpha channel? */
export function alphaCut(m: THREE.Material | THREE.Material[]): boolean {
  const one = Array.isArray(m) ? m[0] : m;
  return !!one && ((one as THREE.MeshStandardMaterial).alphaTest > 0 || one.transparent === true);
}

/**
 * One merged, colour-less caster standing in for a whole compound.
 *
 * **Why this is a merge and not a cull.** A shadow map writes depth, and reads a
 * material only to find an alpha cutout. A structure built through
 * {@link PartBuilder} is split into meshes because it has that many *materials*,
 * not that many objects — so its pieces cast exactly the silhouette their union
 * casts, at one draw per cascade instead of one each. With three cascades that
 * is a 3:1 return on every material a compound carries, and the win scales with
 * how BIG the compound is, not how many there are: one merged town saved sixty
 * draws, while three small haven kits gave three colour draws back for what they
 * saved.
 *
 * **The exception** is an alpha-tested or transparent surface — a chain-link
 * run, a foliage card — whose shadow *is* the holes in its map. Those keep
 * casting as themselves; {@link alphaCut} is what filters them out.
 *
 * **And why the proxy is visible when it casts.** three.js skips an object whose
 * `visible` is false, whose material's `visible` is false, or that fails
 * `object.layers.test(camera.layers)` against the VIEW camera, in the shadow
 * pass exactly as in the colour pass (`WebGLShadowMap.renderObject` tests all
 * three) — so there is no such thing as a caster the main camera cannot see. It
 * therefore costs ONE colour-pass draw, with `colorWrite` and `depthWrite` off
 * so it changes no pixel and no depth, against the dozens it removes. A caller
 * that range-gates its compound should hide it outright out of shadow range,
 * where that one draw would do nothing at all.
 *
 * `userData.noVelocity` is set for the same reason `colorWrite` is off:
 * `VelocityPass` would otherwise give the proxy a motion-vector proxy of its
 * own, writing velocity into pixels its own sources have already written.
 *
 * This is the canonical copy. `src/world/town/Hammerhead.ts` still carries its
 * own — that file belongs to another lane.
 */
export function shadowProxy(meshes: THREE.Object3D[], name: string): THREE.Mesh | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const m of meshes) {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry || !mesh.material || alphaCut(mesh.material)) continue;
    const src = mesh.geometry;
    const pos = src.getAttribute('position');
    if (!pos) continue;
    // Position only: a depth pass binds no normal, no UV and no vertex colour,
    // so carrying them through the merge would triple a buffer whose only
    // reader is `gl_Position`.
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', pos.clone());
    // `mergeGeometries` returns **null**, silently, when one member of a batch
    // is indexed and another is not — and a null merge here deletes a whole
    // compound's shadow. So the index is synthesised rather than left absent.
    const idx = src.getIndex();
    if (idx) g.setIndex(idx.clone());
    else {
      const seq = new Uint32Array(pos.count);
      for (let i = 0; i < pos.count; i++) seq[i] = i;
      g.setIndex(new THREE.BufferAttribute(seq, 1));
    }
    // The sources share the parent's frame and the proxy joins that same
    // parent, so no matrix is applied here on purpose.
    parts.push(g);
  }
  if (!parts.length) return null;
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!merged) return null;
  merged.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  mat.name = `${name}_mat`;
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.visible = false;
  mesh.userData.noVelocity = true;
  return mesh;
}

/** Attributes a merged prop geometry is allowed to carry, and the only ones. */
export const KEEP = ['position', 'normal', 'uv', 'color'] as const;

/**
 * Normalise one piece so a merge cannot fail on it, and so nothing it is
 * missing reads back as zero.
 *
 * Plan section 5.5. Three things have to agree across a merge batch — the index,
 * the attribute set, and what each attribute *means* — and `mergeGeometries`
 * enforces none of them: it returns **null**, without throwing and without
 * logging, and a whole building disappears. The sibling's audit records a
 * variation stamp that existed only on the unmerged pieces silently pinning
 * every merged surface to one value for four rounds.
 *
 * The part people get wrong is the third one. Synthesising a *zero* UV for a
 * piece that has none makes the merge succeed and makes the piece sample one
 * texel of its map forever — a flat patch of colour that reads as a shading
 * decision rather than as missing data, which is exactly section 9.5's
 * "undeclared attributes read as zero, silently". So a missing UV is
 * synthesised as a **planar projection in the piece's own frame**, which is
 * wrong in the same way a box projection is wrong and is at least *varying*: a
 * seam is a bug you can see, and a flat patch is not.
 *
 * Our object-level variation stamp is `BuildKit.bakeTone`, which writes value,
 * warmth, grime and the chamfer lift into `attributes.color` **before** the
 * merge and on the finished, placed piece. `color` is on {@link KEEP} for that
 * reason and this function must never drop it.
 */
export function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes)) {
    if (!(KEEP as readonly string[]).includes(k)) g.deleteAttribute(k);
  }
  const pos = g.attributes.position;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    g.computeBoundingBox();
    const bb = g.boundingBox;
    const sx = bb ? Math.max(1e-3, bb.max.x - bb.min.x) : 1;
    const sy = bb ? Math.max(1e-3, bb.max.y - bb.min.y) : 1;
    const sz = bb ? Math.max(1e-3, bb.max.z - bb.min.z) : 1;
    // Project on the two widest axes, so the piece's largest face is the one
    // that comes out undistorted.
    const drop = sx <= sy && sx <= sz ? 0 : sy <= sz ? 1 : 2;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      uv[i * 2] = drop === 0 ? z / sz : x / sx;
      uv[i * 2 + 1] = drop === 1 ? z / sz : y / sy;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  if (!g.index) {
    const n = pos.count;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return g;
}

/**
 * Loft a closed tube through a list of cross-sections.
 * @param sections rings of [y,z]
 */
/**
 * A box whose UVs are a world-space projection rather than 0..1 per face.
 *
 * `PropMaterials`' maps are tiles authored for a roughly metre-sized part:
 * `paintedMaterial`'s chipping is `fbm2(u * 11)`, so one chip is a tenth of a
 * tile. A plain `BoxGeometry` puts exactly one tile on every face whatever the
 * face is, so a 6.1 m shipping container gets 60 cm paint chips — which is what
 * turns the stacked containers at the mesa outpost into a red-and-black
 * checkerboard, and it is the same defect the town's canopy soffit had.
 *
 * The dominant axis of each face normal picks which two coordinates become U
 * and V, so all six faces come out at the same texels per metre.
 *
 * @param mpt metres of world per texture tile
 */
export function texelBox(w: number, h: number, d: number, mpt = 2.0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  const s = 1 / mpt;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i)), nz = Math.abs(nrm.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny >= nx && ny >= nz) uv.setXY(i, x * s, z * s);
    else if (nx >= nz) uv.setXY(i, z * s, y * s);
    else uv.setXY(i, x * s, y * s);
  }
  uv.needsUpdate = true;
  return g;
}

export function loft(sections: LoftSection[], { caps = true }: {caps?:boolean, vScale?:number} = {}) {
  const N = sections[0].pts.length;
  const S = sections.length;
  const pos = new Float32Array(S * N * 3);
  const uv = new Float32Array(S * N * 2);
  const idx = [];
  for (let i = 0; i < S; i++) {
    const sec = sections[i];
    for (let j = 0; j < N; j++) {
      const k = (i * N + j) * 3;
      pos[k] = sec.x; pos[k + 1] = sec.pts[j][0]; pos[k + 2] = sec.pts[j][1];
      uv[(i * N + j) * 2] = i / (S - 1);
      uv[(i * N + j) * 2 + 1] = j / N;
    }
  }
  for (let i = 0; i < S - 1; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * N + j, b = i * N + ((j + 1) % N);
      const c = (i + 1) * N + j, d = (i + 1) * N + ((j + 1) % N);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);

  if (caps) {
    // fan-cap both ends by adding a centre vertex each
    const extra: { x: number, y: number, z: number, ring: number, flip: boolean }[] = [];
    const addCap = (i: number, flip: boolean) => {
      let cy = 0, cz = 0;
      for (let j = 0; j < N; j++) { cy += sections[i].pts[j][0]; cz += sections[i].pts[j][1]; }
      cy /= N; cz /= N;
      extra.push({ x: sections[i].x, y: cy, z: cz, ring: i, flip });
    };
    addCap(0, true); addCap(S - 1, false);
    const base = S * N;
    const p2 = new Float32Array((S * N + 2) * 3);
    const u2 = new Float32Array((S * N + 2) * 2);
    p2.set(pos); u2.set(uv);
    for (let e = 0; e < 2; e++) {
      const c = extra[e];
      p2[(base + e) * 3] = c.x; p2[(base + e) * 3 + 1] = c.y; p2[(base + e) * 3 + 2] = c.z;
      u2[(base + e) * 2] = 0.5; u2[(base + e) * 2 + 1] = 0.5;
      const ringStart = c.ring * N;
      for (let j = 0; j < N; j++) {
        const a = ringStart + j, b = ringStart + ((j + 1) % N);
        if (c.flip) idx.push(base + e, a, b); else idx.push(base + e, b, a);
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(p2, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(u2, 2));
    g.setIndex(idx);
  }
  g.computeVertexNormals();
  return g;
}

/** A superelliptic ring in the YZ plane, used for lofted car bodies. */
export function ring(n: number, halfWidth: number, yLow: number, yHigh: number, power = 3.6, shear = 0) {
  const pts = [];
  const cy = (yLow + yHigh) * 0.5, hh = (yHigh - yLow) * 0.5;
  const e = 2 / power;
  for (let j = 0; j < n; j++) {
    const th = -Math.PI / 2 + (j / n) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    const z = Math.sign(c) * Math.pow(Math.abs(c), e) * halfWidth;
    const y = cy + Math.sign(s) * Math.pow(Math.abs(s), e) * hh;
    pts.push([y + shear * z, z]);
  }
  return pts;
}

/** Extract a contiguous band of a loft's rings as an open shell. */
export function loftBand(sections: LoftSection[], j0: number, j1: number, offsetOut = 0) {
  const N = sections[0].pts.length;
  const S = sections.length;
  const cols = [];
  for (let j = j0; j <= j1; j++) cols.push(((j % N) + N) % N);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < S; i++) {
    const sec = sections[i];
    let cy = 0, cz = 0;
    for (let j = 0; j < N; j++) { cy += sec.pts[j][0]; cz += sec.pts[j][1]; }
    cy /= N; cz /= N;
    for (let k = 0; k < cols.length; k++) {
      const [y, z] = sec.pts[cols[k]];
      const dy = y - cy, dz = z - cz;
      const l = Math.hypot(dy, dz) || 1;
      pos.push(sec.x, y + (dy / l) * offsetOut, z + (dz / l) * offsetOut);
      uv.push(i / (S - 1), k / (cols.length - 1));
    }
  }
  const W = cols.length;
  for (let i = 0; i < S - 1; i++) {
    for (let k = 0; k < W - 1; k++) {
      const a = i * W + k, b = a + 1, c = (i + 1) * W + k, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

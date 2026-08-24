/**
 * Matérn cluster scattering — the sampler that puts things in groves.
 *
 * Plan `docs/plans/2026-08-21-fable-procedural-modeling.md` §2.3, ported from
 * OGL `gen/place.ts` / `scatter.ts`. Measure it with `src/tools/scatterstat.mts`,
 * which is the other half of the item: **this file is only worth having if the
 * Clark–Evans R it produces is well below 1**, and R is not something you can
 * read off a screenshot.
 *
 * ## What was here before, and why it is not clustering
 *
 * Every scatter in this world is a *jittered grid*: one candidate per cell of a
 * regular lattice, displaced inside its own cell, kept with probability
 * `density(x, z)`. That is a **stratified** sample, and stratification is what
 * you reach for when you want spacing *more even than random* — it is the
 * opposite of clustering. `Trees._makeTile` (8 m cells), `Bushes._makeTile`
 * (4 m) and `Ecology.scatterClustered` all did it, and all three measure at or
 * above R = 1, i.e. Poisson-to-dispersed. The sibling repo measured the same
 * pattern in their own world and replaced it: **R 0.890 -> 0.531**.
 *
 * ## The construction
 *
 * A Matérn cluster process is two stages, and the order matters:
 *
 *   1. **Parents**, dart-thrown with a minimum spacing `parentMin`. These are
 *      the *sites* — the hollow the wood grows in, the bar the boulders came to
 *      rest on. Nothing is drawn at a parent.
 *   2. **Children**, a Poisson *count* per parent, offset by an isotropic
 *      Gaussian of s.d. `spread`. These are the instances.
 *
 * **Suitability is applied to the parent and to nothing else.** This is the
 * single load-bearing line in the item. Thinning children by a smooth
 * suitability field re-imposes that field's own (almost uniform) statistics on
 * the result and shreds the groves straight back to Poisson — you get a
 * Matérn-shaped generator whose output measures like the thing it replaced.
 * Here `suitability(px, pz)` scales the parent's Poisson *rate*, which leaves
 * the Gaussian child cloud exactly intact: a poor site grows a smaller grove or
 * none, never a moth-eaten one.
 *
 * `reject(x, z)` is the deliberate exception and it is a different kind of
 * thing: hard geometric exclusion — under water, off a cliff, on the
 * carriageway, inside a town's cleared pad. Those are not preferences to be
 * traded off, and a tree standing in a lake because its parent was on the shore
 * is not "grove coherence".
 *
 * ## Determinism under streaming
 *
 * The world streams in tiles and a grove is bigger than a tile, so every
 * decision here is a pure function of *absolute* cell coordinates, never of the
 * rect being asked for. Two rules do that work:
 *
 *   - **Parents**: one candidate per `parentMin`-sized cell, each with a hashed
 *     priority; a candidate is accepted iff no candidate within `parentMin` has
 *     a higher priority. With the cell equal to the spacing, only the 3x3
 *     neighbourhood can conflict, so this is a one-pass local rule with no
 *     recursion that still produces a genuine minimum-spacing point process.
 *   - **Separation** (`slack > 0`) uses the same priority trick rather than a
 *     greedy sweep, because a greedy sweep's answer depends on where the sweep
 *     started and therefore on the tile you asked about. It over-rejects
 *     slightly against greedy; it is exactly reproducible, which greedy is not.
 *
 * Children are generated for every parent within `halo` of the rect and then
 * clipped to it, so a grove straddling a tile edge is the same grove from both
 * sides.
 *
 * ## Decorrelated draws (plan §2.5)
 *
 * Every decision draws from its own salt: position, priority, kind, count,
 * offset, radius, truncation. Reusing one draw for two decisions biases exactly
 * the property it also selects — a parent whose priority *is* its x offset
 * makes the surviving parents lean to one side of every cell. The salts are the
 * `S_*` constants below and they are not interchangeable.
 */

/**
 * Cheap integer hash so tile content is position-derived, not sequence-derived.
 *
 * Lives here rather than in `Ecology.ts` (which re-exports it, so every existing
 * importer is unaffected) because this file is the lower layer: `Ecology`
 * imports `Cluster`, not the other way round.
 */
export function hash3(x: number, y: number, s: number) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** A hashed draw in [0, 1). */
export function hashU(x: number, y: number, s: number) { return hash3(x, y, s) / 4294967296; }

// One salt per decision. See the §2.5 note above: these are not interchangeable.
const S_PX = 0x51a3d1;
const S_PZ = 0x9e3779;
const S_PRIO = 0x2f1d5c;
const S_KIND = 0x77c193;
const S_COUNT = 0x3b8f2d;
const S_CHILD = 0x1b7e41;
const S_CRAD = 0x6c9a07;
const S_CPRIO = 0xa53f19;
const S_TRUNC = 0xd0e2b5;

/** One placed instance, as the sampler records it. */
export interface ClusterPoint {
  x: number;
  z: number;
  /** World position of the cluster's parent — the site, not an instance. */
  px: number;
  pz: number;
  /**
   * Distance from the parent in units of `spread`: 0 at the heart of the
   * cluster, ~1 at one standard deviation, >1.5 out on the fringe. This is
   * OGL's `fromParent`, and it is what puts scree at the edge of a boulder
   * cluster and the big stems in the middle of a grove.
   */
  fromParent: number;
  /** The kind chosen once for the whole cluster — a grove is one species. */
  kind: string;
  /** The PARENT's suitability, 0..1. Constant across a cluster, by design. */
  w: number;
  /** Radius this instance claimed for separation, metres. 0 when unused. */
  r: number;
  /**
   * A per-instance uint32 for the caller's own decorrelated draws. Use
   * `hashU(pt.seed, k, YOUR_SALT)`, never `pt.seed` itself as a value: it is a
   * hash of the parent cell and the child index, so consecutive children share
   * structure in their low bits.
   */
  seed: number;
}

/** A cluster parent — the site. Returned for diagnostics; nothing is drawn here. */
export interface ClusterParent {
  x: number;
  z: number;
  /** Suitability at the parent, 0..1. */
  w: number;
  kind: string;
  /** How many children it actually emitted into the rect. */
  n: number;
}

export interface MaternOpts {
  seed: number;
  /** Rect to fill, metres. Children outside it are generated and then clipped. */
  x0: number;
  z0: number;
  w: number;
  h: number;
  /** Minimum spacing between cluster parents, metres. Sets the grove pitch. */
  parentMin: number;
  /** Gaussian s.d. of a child's offset from its parent, metres. Grove radius. */
  spread: number;
  /** Mean children per parent at suitability 1. The Poisson rate. */
  mean: number;
  /**
   * 0..1 at the PARENT position only. Scales the Poisson rate. Never evaluated
   * at a child — see the file header.
   */
  suitability: (x: number, z: number) => number;
  /**
   * Hard per-child exclusion: water, cliff, carriageway, cleared pad. Return
   * true to drop this instance. This is not a thinning field; do not put a
   * smooth preference in here.
   */
  reject?: (x: number, z: number) => boolean;
  /** The kind for one whole cluster, chosen at the parent. */
  kind?: (x: number, z: number, u: number) => string;
  /**
   * Radius this instance claims, metres. Two instances are separated when they
   * are closer than `(r1 + r2) * slack`, so a big boulder pushes harder than a
   * pebble — which a single global spacing cannot express.
   */
  radius?: (x: number, z: number, u: number, kind: string) => number;
  /** Separation slack. 0 (the default) skips the separation pass entirely. */
  slack?: number;
  /**
   * Cap on emitted instances. Truncation is **hash-shuffled**, not scan-order
   * (plan §2.5): dropping the tail of a scan packs the whole budget into one
   * corner of the rect and leaves the rest empty.
   */
  maxCount?: number;
  /** Filled with the parents that were considered, for `scatterstat`. */
  parentsOut?: ClusterParent[];
}

/** Knuth's small-lambda Poisson. Exact, and lambda here is single digits. */
function poisson(lambda: number, u: () => number) {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= u(); } while (p > L);
  return k - 1;
}

/**
 * The parents of one rect: dart-thrown, minimum spacing `parentMin`.
 *
 * Exported because `scatterstat.mts` measures the parent process separately —
 * a cluster process with a *Poisson* parent field is a different animal from
 * one with a dispersed parent field, and only the second gives evenly-spread
 * groves with empty ground between them.
 */
export function clusterParents(
  seed: number, x0: number, z0: number, w: number, h: number, parentMin: number,
): Array<{ x: number, z: number, cx: number, cz: number }> {
  const cell = parentMin;
  const i0 = Math.floor(x0 / cell), i1 = Math.floor((x0 + w) / cell);
  const j0 = Math.floor(z0 / cell), j1 = Math.floor((z0 + h) / cell);
  const out = [];
  const cand = (cx: number, cz: number) => ({
    x: (cx + hashU(cx, cz, seed ^ S_PX)) * cell,
    z: (cz + hashU(cx, cz, seed ^ S_PZ)) * cell,
    p: hashU(cx, cz, seed ^ S_PRIO),
  });
  for (let cz = j0; cz <= j1; cz++) {
    for (let cx = i0; cx <= i1; cx++) {
      const a = cand(cx, cz);
      let ok = true;
      for (let dz = -1; dz <= 1 && ok; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const b = cand(cx + dx, cz + dz);
          // Ties broken by cell order so the rule is total, not merely a
          // preference: two cells that hash to the same priority must still
          // agree about which of them wins, from either side.
          const bWins = b.p > a.p || (b.p === a.p && (cz + dz < cz || (dz === 0 && dx < 0)));
          if (bWins && Math.hypot(a.x - b.x, a.z - b.z) < parentMin) { ok = false; break; }
        }
      }
      if (ok) out.push({ x: a.x, z: a.z, cx, cz });
    }
  }
  return out;
}

/**
 * Matérn cluster scatter over a rect. See the file header for the contract.
 *
 * @returns the emitted instances, in a deterministic order that does not depend
 *   on which rect was asked for.
 */
export function maternScatter(o: MaternOpts): ClusterPoint[] {
  const {
    seed, x0, z0, w, h, parentMin, spread, mean, suitability,
    reject, kind, radius, slack = 0, maxCount = 1e9, parentsOut,
  } = o;

  // Everything within reach of the rect. 3.2 sigma keeps 99.8% of a Gaussian
  // cloud, and the separation pass needs one more radius on top of that.
  const halo = spread * 3.2 + (slack > 0 ? parentMin : 0);
  const parents = clusterParents(
    seed, x0 - halo, z0 - halo, w + 2 * halo, h + 2 * halo, parentMin);

  const x1 = x0 + w, z1 = z0 + h;
  const out: ClusterPoint[] = [];
  // Parallel arrays for the separation pass; kept off ClusterPoint so the
  // emitted record carries nothing a consumer would be tempted to misread.
  const prio: number[] = [];

  for (const p of parents) {
    const s = suitability(p.x, p.z);
    const k = kind ? kind(p.x, p.z, hashU(p.cx, p.cz, seed ^ S_KIND)) : '';
    let emitted = 0;
    if (s > 0) {
      // One Rng per parent, from the parent's own cell. Sequence-derived draws
      // inside a cluster are fine — mulberry32 avalanches inside next() — but
      // the *seed* must be position-derived or a grove's size would depend on
      // how many parents happened to precede it in the scan.
      let st = (hash3(p.cx, p.cz, seed ^ S_COUNT)) >>> 0;
      const u = () => {
        st = (st + 0x6d2b79f5) >>> 0;
        let t = st;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const n = poisson(mean * s, u);
      for (let i = 0; i < n; i++) {
        // Box–Muller, from the child's own salt rather than the count's.
        const ha = hash3(p.cx * 8191 + i, p.cz, seed ^ S_CHILD);
        const hb = hash3(p.cx, p.cz * 8191 + i, seed ^ S_CHILD);
        const ua = Math.max(1e-7, ha / 4294967296), ub = hb / 4294967296;
        const g = Math.sqrt(-2 * Math.log(ua));
        const ang = 2 * Math.PI * ub;
        const dx = g * Math.cos(ang) * spread, dz = g * Math.sin(ang) * spread;
        const x = p.x + dx, z = p.z + dz;
        const inRect = x >= x0 && x < x1 && z >= z0 && z < z1;
        const inHalo = x >= x0 - halo && x < x1 + halo && z >= z0 - halo && z < z1 + halo;
        if (!inHalo) continue;
        if (reject && reject(x, z)) continue;
        const cseed = hash3(p.cx * 8191 + i, p.cz * 131 + i, seed);
        const r = radius ? radius(x, z, hashU(cseed, i, S_CRAD), k) : 0;
        if (!inRect && slack <= 0) continue;   // halo only matters for separation
        out.push({ x, z, px: p.x, pz: p.z, fromParent: g, kind: k, w: s, r, seed: cseed });
        prio.push(hashU(cseed, i, S_CPRIO));
        if (inRect) emitted++;
      }
    }
    if (parentsOut) parentsOut.push({ x: p.x, z: p.z, w: s, kind: k, n: emitted });
  }

  let kept = out;
  // **`slack > 0` alone, not `&& out.length > 1`.** The rect filter lives
  // inside this block, and the halo points are only excluded from `out` when
  // `slack <= 0` — so a window that produced exactly ONE point returned it
  // whether or not it was in the rect, and two adjacent tiles both emitted it.
  // Latent while `rockScatter` was the only caller passing a slack (a 56 m rock
  // cell is rarely that empty); it fires the moment a sparse zone's tree
  // scatter does. Found as an exact 0.00 m same-asset nearest-neighbour pair in
  // `three_valleys` by `src/tools/probes/copies.mts` — two identical trees in
  // one hole, emitted by tiles 21,15 and 22,15.
  if (slack > 0) {
    // Radius-aware separation, by priority rather than by a greedy sweep: a
    // point survives iff no HIGHER-priority point lies inside the sum of the
    // two radii. Local, order-free, and identical from either side of a tile
    // edge — see the header. Grid-bucketed at the largest reach so this is
    // linear rather than quadratic.
    let maxR = 0;
    for (const q of out) if (q.r > maxR) maxR = q.r;
    const cell = Math.max(1e-3, maxR * 2 * slack);
    const grid = new Map<number, number[]>();
    for (let i = 0; i < out.length; i++) {
      const key = (Math.floor(out[i].x / cell) | 0) * 65536 + (Math.floor(out[i].z / cell) | 0);
      let a = grid.get(key);
      if (!a) { a = []; grid.set(key, a); }
      a.push(i);
    }
    kept = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[i];
      if (a.x < x0 || a.x >= x1 || a.z < z0 || a.z >= z1) continue;
      const ci = Math.floor(a.x / cell) | 0, cj = Math.floor(a.z / cell) | 0;
      let ok = true;
      for (let dj = -1; dj <= 1 && ok; dj++) {
        for (let di = -1; di <= 1 && ok; di++) {
          const bucket = grid.get((ci + di) * 65536 + (cj + dj));
          if (!bucket) continue;
          for (const j of bucket) {
            if (j === i) continue;
            if (prio[j] < prio[i] || (prio[j] === prio[i] && j > i)) continue;
            const b = out[j];
            const sep = (a.r + b.r) * slack;
            if (Math.hypot(a.x - b.x, a.z - b.z) < sep) { ok = false; break; }
          }
        }
      }
      if (ok) kept.push(a);
    }
  }

  if (kept.length > maxCount) {
    // Hash-shuffled truncation (plan §2.5). Scan order here runs cell by cell,
    // so keeping the first `maxCount` would fill the low corner of the rect and
    // leave the rest bare — a budget cap that authors a diagonal edge across
    // the world. Rank by an independent hash instead, then restore scan order
    // so the emitted sequence stays stable for anything downstream that draws
    // per candidate.
    const idx = kept.map((_, i) => i);
    idx.sort((a, b) => hashU(kept[a].seed, a, S_TRUNC) - hashU(kept[b].seed, b, S_TRUNC));
    const keep = new Set(idx.slice(0, maxCount));
    kept = kept.filter((_, i) => keep.has(i));
  }
  return kept;
}

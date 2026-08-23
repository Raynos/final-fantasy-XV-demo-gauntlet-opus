#!/usr/bin/env node
/**
 * The silhouette bench: does a family of meshes actually have different SHAPES?
 *
 *   node src/tools/silhouette.mts                    # calibrate, then gate trees + enemies
 *   node src/tools/silhouette.mts --set trees        # one family
 *   node src/tools/silhouette.mts --calibrate        # the calibration pairs alone
 *   node src/tools/silhouette.mts --pairs conifer    # every pairwise distance in a family
 *   node src/tools/silhouette.mts --json tmp/sil.json
 *
 * Runs in **bare Node**. No browser, no daemon, no build ref: it imports the
 * generators and grows the geometry in process, so it reads the *working tree*
 * and takes about three seconds. It is deliberately not a capture tool — a frame
 * cannot tell you two trees are the same tree, because they are never framed
 * the same way twice.
 *
 * ## What it measures
 *
 * For each mesh: rasterise the silhouette at **8 azimuths** over 180 degrees
 * (past 180 the outline is its own mirror and the extent width is identical),
 * cut it into **24 horizontal bands over the mesh's own height**, and record
 * each band's width **divided by that height**. Pure scale therefore scores
 * exactly zero, which is the point: a big conifer and a small conifer are one
 * silhouette, and `Trees` already varies scale per instance for free.
 *
 * The distance between two meshes is the RMS over those 8x24 numbers,
 * minimised over every cyclic azimuth shift and the mirror — two trees that
 * differ only by yaw are one silhouette too, because the scatter yaws every
 * instance at random. It is reported in **percent of the mesh's own height**.
 *
 * ## Why the thresholds are calibrated and not picked
 *
 * `project/LANDMINES.md` records seven instruments here that measured
 * themselves: `imgdiff`'s global noise floor sat *above* all twelve measured
 * per-shot floors, so it could never fail anything. So this bench refuses to
 * report a verdict until it has measured two cases whose answers are already
 * known, every run, and printed them:
 *
 *   known-same       one mesh against itself scaled 1.73x and yawed 37 deg.
 *                    The true answer is 0; what comes back is this bench's own
 *                    floor, which is the azimuth quantisation (37 deg is not a
 *                    multiple of the 22.5 deg bin on purpose).
 *   known-different  a conifer against a savanna: a spire against a parasol.
 *                    The two most different silhouettes the tree set can make.
 *
 * The distinctness threshold is the **geometric mean** of those two anchors —
 * a midpoint on the log scale the metric actually lives on, not a number
 * somebody liked — and the run is void unless they are separated by at least
 * {@link MIN_DYNAMIC_RANGE}x. A bench whose floor and ceiling are a factor of
 * three apart cannot discriminate anything and must say so instead of grading.
 *
 * Sibling anchors, for scale only (`final-fantasy-XV-demo-ogl-opus`): a single
 * corestone rock scored 3.90 and a stack of them 6.1-8.3; their conifer band
 * went from 2 to 6 distinct silhouettes. Same units — percent of height.
 *
 * ## What this check is blind to
 *
 * Printed in its own output, per plan section 9.3, because a gate that does not
 * declare its blind spots gets trusted for things it never measured:
 *
 *   - **Colour, material, texture and albedo.** Two identically-shaped trees in
 *     different greens score zero here. `edgestat.mts` and a capture cover that.
 *   - **Interior structure.** The profile is the outline's *extent* per band, so
 *     a solid drum and a hollow ring of the same outline are one silhouette.
 *     The companion crown bench below is the paired half that sees this: `fill`
 *     is filled area over the outline's own box, and a card cloud reads ~100%
 *     where a real canopy reads 40-70%.
 *   - **Everything below the silhouette's own bounding box.** Burial, seating
 *     and float are `seatcheck.mts` and `floatcheck.mts`, not this.
 *   - **Handedness and winding.** A mirrored mesh scores zero against its
 *     original by construction. `geocheck.mts` is that gate.
 *   - **Animation.** Enemies are measured in bind pose.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = path.join(ROOT, 'project', 'silhouette-baseline.json');

/** Azimuths in the reported profile, over 180 degrees. */
const AZ = 8;
/**
 * Sub-steps between reported azimuths, used only to ALIGN two profiles.
 *
 * The profile is 8 azimuths, as the plan specifies. But if the only alignments
 * tried are the 8 cyclic shifts, then a mesh yawed by 22.5/2 degrees reads as
 * different from itself: measured, that self-distance was **1.84**, which is
 * the same size as the closest real pair in the bestiary. An instrument whose
 * floor sits on top of its signal is `imgdiff`'s global-noise-floor mistake
 * again, so the raster is taken at `AZ * SUB` azimuths and the alignment search
 * runs over all of them. The reported profile is still every `SUB`-th one.
 */
const SUB = 4;
/** Azimuths actually rasterised. */
const AZF = AZ * SUB;
/** Horizontal bands the height is cut into. */
const BANDS = 24;
/** Raster rows per band. `BANDS * ROWS` is the raster's height in pixels. */
const ROWS = 10;
/**
 * How far apart the known-same and known-different anchors must be before a
 * verdict means anything. Three would be a bench that cannot tell a tree from
 * a rock; ten is the smallest separation where the geometric midpoint is more
 * than a rounding error away from both ends.
 */
const MIN_DYNAMIC_RANGE = 10;

/** One measured mesh. */
interface Sil {
  /** `AZF * BANDS` band widths, each divided by the mesh's own height. */
  profile: Float64Array;
  /** Metres. Reported for context; the profile is already normalised by it. */
  height: number;
  /** Widest band, in units of height. A spire is ~0.3, a parasol ~1.0. */
  aspect: number;
  /** Filled area over the outline's own bounding box, mean over azimuths, 0..1. */
  fill: number;
  /** Same, over the crown alone. */
  crownFill: number;
  /** Fraction of the crown's bands that are more than 90% empty. */
  crownEmpty: number;
  /** Triangles rasterised. Zero is an error, not a thin mesh. */
  tris: number;
}

/** A named subject: a family member with its triangles in local space. */
interface Subject {
  family: string;
  name: string;
  /** Flat `[ax,ay,az, bx,by,bz, cx,cy,cz, ...]` in the mesh's own space. */
  tris: Float32Array;
}

/* ------------------------------------------------------------------ geometry */

/**
 * Flatten an object tree into world-space triangles.
 *
 * Indexed and non-indexed geometry both, because `mergeGeometries` returns null
 * silently on a mix of the two (`LANDMINES.md`) and this bench must never be
 * the thing that quietly measured nothing.
 */
function trisOf(root: THREE.Object3D): Float32Array {
  root.updateMatrixWorld(true);
  const out: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((o: THREE.Object3D) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) return;
    const idx = m.geometry.getIndex();
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i++) {
      const j = idx ? idx.getX(i) : i;
      v.fromBufferAttribute(pos, j).applyMatrix4(m.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
  });
  return new Float32Array(out);
}

/** The same, for loose geometries that were never put in a scene. */
function trisOfGeoms(geoms: readonly (THREE.BufferGeometry | null)[]): Float32Array {
  const g = new THREE.Group();
  for (const geo of geoms) {
    if (!geo) continue;
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));
  }
  return trisOf(g);
}

/* --------------------------------------------------------------- the raster */

/**
 * Rasterise one azimuth into a `w * h` occupancy mask.
 *
 * A plain scanline fill over each projected triangle. No anti-aliasing on
 * purpose: the metric is an outline, and a coverage-weighted edge would make a
 * leaf card's width depend on its alpha rather than on its shape.
 */
function raster(
  tris: Float32Array, cos: number, sin: number,
  u0: number, du: number, y0: number, dy: number, w: number, h: number,
): Uint8Array {
  const mask = new Uint8Array(w * h);
  const ux = new Float64Array(3), uy = new Float64Array(3);
  for (let t = 0; t < tris.length; t += 9) {
    for (let k = 0; k < 3; k++) {
      const x = tris[t + k * 3], z = tris[t + k * 3 + 2];
      ux[k] = ((x * cos + z * sin) - u0) / du;
      uy[k] = (tris[t + k * 3 + 1] - y0) / dy;
    }
    let lo = Math.max(0, Math.floor(Math.min(uy[0], uy[1], uy[2])));
    let hi = Math.min(h - 1, Math.ceil(Math.max(uy[0], uy[1], uy[2])));
    // A triangle thinner than a row still has to mark one: a whorl of conifer
    // needles is exactly that, and dropping it turns an airy crown solid.
    if (hi < lo) { lo = Math.max(0, Math.min(h - 1, lo)); hi = lo; }
    for (let row = lo; row <= hi; row++) {
      const yc = row + 0.5;
      let xmin = Infinity, xmax = -Infinity, hits = 0;
      for (let e = 0; e < 3; e++) {
        const a = e, b = (e + 1) % 3;
        const ya = uy[a], yb = uy[b];
        if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) {
          const s = (yc - ya) / (yb - ya);
          const x = ux[a] + s * (ux[b] - ux[a]);
          if (x < xmin) xmin = x;
          if (x > xmax) xmax = x;
          hits++;
        }
      }
      if (hits < 2) {
        // Degenerate against this scanline (a horizontal sliver): use the
        // triangle's own extent so it is not silently dropped.
        xmin = Math.min(ux[0], ux[1], ux[2]);
        xmax = Math.max(ux[0], ux[1], ux[2]);
      }
      const c0 = Math.max(0, Math.floor(xmin));
      const c1 = Math.min(w - 1, Math.ceil(xmax) - 1);
      const base = row * w;
      for (let c = c0; c <= Math.max(c0, c1); c++) mask[base + c] = 1;
    }
  }
  return mask;
}

/**
 * Measure one mesh.
 *
 * @param tris flat world-space triangles
 * @param label used only in the error a degenerate mesh raises
 */
export function silhouette(tris: Float32Array, label: string): Sil {
  if (tris.length < 9) throw new Error(`silhouette: ${label} has no triangles`);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < tris.length; i += 3) {
    if (tris[i] < minY) minY = tris[i];
    if (tris[i] > maxY) maxY = tris[i];
  }
  const height = maxY - minY;
  if (!(height > 1e-6)) throw new Error(`silhouette: ${label} is flat (height ${height})`);

  const h = BANDS * ROWS;
  const dy = height / h;
  const profile = new Float64Array(AZF * BANDS);
  let fillSum = 0, crownFillSum = 0, crownEmptySum = 0;

  for (let a = 0; a < AZF; a++) {
    const th = (Math.PI * a) / AZF;
    const cos = Math.cos(th), sin = Math.sin(th);
    let u0 = Infinity, u1 = -Infinity;
    for (let i = 0; i < tris.length; i += 3) {
      const u = tris[i] * cos + tris[i + 2] * sin;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
    }
    const span = Math.max(u1 - u0, height * 1e-3);
    // One column is one row, so a band's width in pixels is directly
    // comparable to its height in pixels and the aspect is not a free parameter.
    const w = Math.max(8, Math.min(2048, Math.round((span / height) * h)));
    const du = span / w;
    const mask = raster(tris, cos, sin, u0, du, minY, dy, w, h);

    const bandCov = new Float64Array(BANDS);
    for (let b = 0; b < BANDS; b++) {
      let lo = w, hi = -1, filled = 0;
      for (let r = b * ROWS; r < (b + 1) * ROWS; r++) {
        const base = r * w;
        for (let c = 0; c < w; c++) {
          if (!mask[base + c]) continue;
          filled++;
          if (c < lo) lo = c;
          if (c > hi) hi = c;
        }
      }
      const extent = hi < lo ? 0 : (hi - lo + 1) * du;
      profile[a * BANDS + b] = extent / height;
      bandCov[b] = extent > 0 ? filled / (ROWS * ((hi - lo + 1))) : 0;
    }

    // Fill over the whole outline's own box.
    let boxLo = w, boxHi = -1, tot = 0, rowsUsed = 0;
    for (let r = 0; r < h; r++) {
      const base = r * w;
      let any = false;
      for (let c = 0; c < w; c++) {
        if (!mask[base + c]) continue;
        tot++; any = true;
        if (c < boxLo) boxLo = c;
        if (c > boxHi) boxHi = c;
      }
      if (any) rowsUsed++;
    }
    fillSum += boxHi < boxLo ? 0 : tot / (rowsUsed * (boxHi - boxLo + 1));

    // The crown is everything above the lowest band that reaches 60% of the
    // widest band: the bole is what is below it. On a mesh with no bole (a
    // rock, a quadruped) the crown is the whole thing, which is correct.
    let wmax = 0;
    for (let b = 0; b < BANDS; b++) wmax = Math.max(wmax, profile[a * BANDS + b]);
    let crownLo = 0;
    for (let b = 0; b < BANDS; b++) {
      if (profile[a * BANDS + b] >= 0.6 * wmax) { crownLo = b; break; }
    }
    let cTot = 0, cRows = 0, cLo = w, cHi = -1, empty = 0;
    for (let b = crownLo; b < BANDS; b++) {
      if (bandCov[b] < 0.10) empty++;
      for (let r = b * ROWS; r < (b + 1) * ROWS; r++) {
        const base = r * w;
        let any = false;
        for (let c = 0; c < w; c++) {
          if (!mask[base + c]) continue;
          cTot++; any = true;
          if (c < cLo) cLo = c;
          if (c > cHi) cHi = c;
        }
        if (any) cRows++;
      }
    }
    crownFillSum += cHi < cLo ? 0 : cTot / (cRows * (cHi - cLo + 1));
    crownEmptySum += empty / (BANDS - crownLo);
  }

  let aspect = 0;
  for (let i = 0; i < profile.length; i++) aspect = Math.max(aspect, profile[i]);
  return {
    profile, height, aspect,
    fill: fillSum / AZF, crownFill: crownFillSum / AZF, crownEmpty: crownEmptySum / AZF,
    tris: tris.length / 9,
  };
}

/**
 * RMS distance between two profiles, in percent of height, minimised over the
 * 8 cyclic azimuth shifts and the mirror.
 *
 * Both invariances are deliberate and both are things the game does for free:
 * `Trees` yaws every instance and `Ecology` scales it. A metric that scored
 * those as variety would report the world as varied while shipping one tree.
 */
export function profileDistance(a: Sil, b: Sil): number {
  let best = Infinity;
  for (let mirror = 0; mirror < 2; mirror++) {
    for (let shift = 0; shift < AZF; shift++) {
      let s = 0;
      for (let k = 0; k < AZ; k++) {
        const ai = k * SUB;
        const bi = ((mirror ? (AZF - ai) % AZF : ai) + shift) % AZF;
        for (let bd = 0; bd < BANDS; bd++) {
          const d = a.profile[ai * BANDS + bd] - b.profile[bi * BANDS + bd];
          s += d * d;
        }
      }
      const rms = Math.sqrt(s / (AZ * BANDS)) * 100;
      if (rms < best) best = rms;
    }
  }
  return best;
}

/* ------------------------------------------------------------- the subjects */

async function treeSubjects(seeds: number): Promise<Subject[]> {
  const { buildTree, TREE_SPECIES } = await import('../world/veg/TreeBuilder.ts');
  const out: Subject[] = [];
  for (const species of Object.keys(TREE_SPECIES)) {
    for (let v = 0; v < seeds; v++) {
      // `Trees.ts` builds its variants with `species + '#' + v` style seeds off
      // a hashed base; the exact seeds do not matter here, only that they are
      // the same every run and that there are `VARIANTS` of them.
      const t = buildTree(species, 1000 + v * 7919);
      out.push({
        family: `tree:${species}`,
        name: `${species}#${v}`,
        tris: trisOfGeoms([t.wood, t.leaves]),
      });
    }
  }
  return out;
}

async function enemySubjects(): Promise<Subject[]> {
  const { BESTIARY } = await import('../characters/enemies/Bestiary.ts');
  const out: Subject[] = [];
  for (const [key, def] of Object.entries(BESTIARY)) {
    // A `variant()` mark reuses the base species' geometry by design — it is
    // re-statted, not re-modelled — so measuring it would report a duplicate
    // silhouette that is not a defect.
    if (def.protoKey && def.protoKey !== key) continue;
    const proto = def.buildPrototype();
    out.push({ family: 'enemy', name: key, tris: trisOf(proto.group) });
  }
  return out;
}

/* ------------------------------------------------------------ calibration */

interface Calib { same: number; diff: number; threshold: number; ratio: number; }

/**
 * Measure the two cases whose answers are already known, and derive the
 * threshold from them. Runs on every invocation; never cached.
 */
async function calibrate(): Promise<Calib> {
  const { buildTree } = await import('../world/veg/TreeBuilder.ts');

  // Known-same: one mesh against a scaled, yawed copy of itself. True answer 0.
  const base = buildTree('broadleaf', 4242);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(base.wood, new THREE.MeshBasicMaterial()));
  if (base.leaves) g.add(new THREE.Mesh(base.leaves, new THREE.MeshBasicMaterial()));
  const plain = silhouette(trisOf(g), 'calib-same-a');
  g.scale.setScalar(1.73);
  g.rotation.y = (37 * Math.PI) / 180;
  const moved = silhouette(trisOf(g), 'calib-same-b');
  const same = profileDistance(plain, moved);

  // Known-different: a spire against a parasol.
  const conifer = buildTree('conifer', 4242);
  const savanna = buildTree('savanna', 4242);
  const diff = profileDistance(
    silhouette(trisOfGeoms([conifer.wood, conifer.leaves]), 'calib-conifer'),
    silhouette(trisOfGeoms([savanna.wood, savanna.leaves]), 'calib-savanna'),
  );

  const floor = Math.max(same, 1e-3);
  return { same, diff, threshold: Math.sqrt(floor * diff), ratio: diff / floor };
}

/* ------------------------------------------------------------------- report */

/** Single-linkage clustering at `t`: how many silhouettes are really here. */
function distinct(sils: Sil[], t: number): number {
  const parent = sils.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < sils.length; i++) {
    for (let j = i + 1; j < sils.length; j++) {
      if (profileDistance(sils[i], sils[j]) <= t) parent[find(i)] = find(j);
    }
  }
  return new Set(parent.map((_, i) => find(i))).size;
}

interface Opts {
  sets: string[]; seeds: number; calibrateOnly: boolean;
  pairs: string | null; json: string | null; setBaseline: boolean;
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = {
    sets: [], seeds: 3, calibrateOnly: false, pairs: null, json: null, setBaseline: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--set') o.sets.push(argv[++i]);
    else if (a === '--seeds') o.seeds = Number(argv[++i]);
    else if (a === '--calibrate') o.calibrateOnly = true;
    else if (a === '--pairs') o.pairs = argv[++i];
    else if (a === '--json') o.json = argv[++i];
    else if (a === '--set-baseline') o.setBaseline = true;
    else throw new Error(`unknown flag ${a}`);
  }
  if (!o.sets.length) o.sets = ['trees', 'enemies'];
  return o;
}

/**
 * The ratchet, in the shape `anycheck.mts` already uses here.
 *
 * Two silhouettes in this world are already the same shape, and that is a real
 * defect owned by the lane that built them, not by whoever next runs the gate.
 * So the baseline records the collapsed pairs that existed when the bench
 * landed and the gate fails on a **new** one. It is a one-way street: nothing
 * raises the ceiling but an edit to the file, and a pair that becomes distinct
 * is reported so the baseline can be lowered.
 */
interface Baseline { note: string; collapsed: string[]; }

const PAIR = (a: string, b: string) => [a, b].sort().join(' ~ ');

const opts = parseArgs(process.argv.slice(2));

console.log(`silhouette bench — ${AZ} azimuths x ${BANDS} height-normalised bands (rastered at ${AZF} for alignment), RMS in % of height`);
console.log('reads the WORKING TREE (bare Node, no build ref, no browser)\n');

const cal = await calibrate();
console.log('calibration, measured this run, on cases whose answers are known:');
console.log(`  known-same       broadleaf#4242 vs itself x1.73, yawed 37 deg   ${cal.same.toFixed(3)}  (true answer 0)`);
console.log(`  known-different  conifer vs savanna — a spire vs a parasol      ${cal.diff.toFixed(3)}`);
console.log(`  dynamic range    ${cal.ratio.toFixed(1)}x  (needs >= ${MIN_DYNAMIC_RANGE}x)`);
console.log(`  threshold        ${cal.threshold.toFixed(3)}  = geometric mean of the two anchors\n`);

if (cal.ratio < MIN_DYNAMIC_RANGE) {
  console.log(`VOID: the bench cannot discriminate — its floor and ceiling are only ${cal.ratio.toFixed(1)}x apart.`);
  console.log('Do not read any verdict below. Fix the bench before fixing the meshes.');
  process.exit(2);
}
if (opts.calibrateOnly) process.exit(0);

const subjects: Subject[] = [];
for (const s of opts.sets) {
  if (s === 'trees') subjects.push(...await treeSubjects(opts.seeds));
  else if (s === 'enemies') subjects.push(...await enemySubjects());
  else throw new Error(`unknown --set ${s} (trees|enemies)`);
}

const sils = new Map<string, Sil>();
for (const s of subjects) sils.set(s.name, silhouette(s.tris, s.name));

const families = [...new Set(subjects.map((s) => s.family))].sort();
const collapsed: { pair: string; d: number }[] = [];
const rows: {
  family: string; n: number; distinct: number; min: number; mean: number;
  fill: number; crownEmpty: number; aspect: number;
}[] = [];

for (const fam of families) {
  const mem = subjects.filter((s) => s.family === fam);
  if (mem.length < 2) continue;
  const ss = mem.map((m) => sils.get(m.name)!);
  let min = Infinity, sum = 0, n = 0;
  for (let i = 0; i < ss.length; i++) {
    for (let j = i + 1; j < ss.length; j++) {
      const d = profileDistance(ss[i], ss[j]);
      sum += d; n++;
      if (d < min) min = d;
      if (d <= cal.threshold) collapsed.push({ pair: PAIR(mem[i].name, mem[j].name), d });
    }
  }
  rows.push({
    family: fam, n: mem.length, distinct: distinct(ss, cal.threshold), min, mean: sum / n,
    fill: ss.reduce((a, s) => a + s.fill, 0) / ss.length,
    crownEmpty: ss.reduce((a, s) => a + s.crownEmpty, 0) / ss.length,
    aspect: ss.reduce((a, s) => a + s.aspect, 0) / ss.length,
  });
}

console.log('family                   n  distinct   min-d  mean-d  aspect   fill  crown-empty');
for (const r of rows) {
  const flag = r.distinct < r.n ? '  <-- collapsed' : '';
  console.log(
    `${r.family.padEnd(22)} ${String(r.n).padStart(2)}   ${String(r.distinct).padStart(4)}   `
    + `${r.min.toFixed(2).padStart(6)}  ${r.mean.toFixed(2).padStart(6)}  `
    + `${r.aspect.toFixed(2).padStart(6)}  ${(r.fill * 100).toFixed(0).padStart(4)}%  `
    + `${(r.crownEmpty * 100).toFixed(0).padStart(6)}%${flag}`,
  );
}

if (opts.pairs !== null) {
  const want = opts.pairs;
  const mem = subjects.filter((s) => s.family === want || s.name.startsWith(want));
  console.log(`\npairwise, ${want}:`);
  for (let i = 0; i < mem.length; i++) {
    for (let j = i + 1; j < mem.length; j++) {
      const d = profileDistance(sils.get(mem[i].name)!, sils.get(mem[j].name)!);
      console.log(`  ${mem[i].name.padEnd(18)} ${mem[j].name.padEnd(18)} ${d.toFixed(3)}${d <= cal.threshold ? '  SAME' : ''}`);
    }
  }
}

console.log('\nblind to: colour and material; interior structure (see the fill column);');
console.log('          anything below the outline (that is seatcheck/floatcheck);');
console.log('          winding and handedness (that is geocheck); animation — bind pose only.');

if (opts.json) {
  await writeFile(opts.json, JSON.stringify({
    calibration: cal,
    families: rows,
    meshes: subjects.map((s) => {
      const q = sils.get(s.name)!;
      return {
        name: s.name, family: s.family, height: q.height, aspect: q.aspect,
        fill: q.fill, crownFill: q.crownFill, crownEmpty: q.crownEmpty, tris: q.tris,
      };
    }),
  }, null, 1));
  console.log(`\nwrote ${opts.json}`);
}

/* --------------------------------------------------------------- the ratchet */

if (opts.setBaseline) {
  const b: Baseline = {
    note: 'Pairs already sharing one silhouette when the bench landed. The gate '
      + 'fails on a NEW collapse; these are debt, owned by the lane that built them. '
      + 'Re-run `node src/tools/silhouette.mts --set-baseline` only to LOWER this list.',
    collapsed: collapsed.map((c) => c.pair).sort(),
  };
  await writeFile(BASELINE, `${JSON.stringify(b, null, 1)}\n`);
  console.log(`\nwrote ${path.relative(ROOT, BASELINE)} with ${b.collapsed.length} known-collapsed pairs`);
  process.exit(0);
}

let known: string[] = [];
try {
  known = (JSON.parse(await readFile(BASELINE, 'utf8')) as Baseline).collapsed;
} catch {
  console.log(`\nno ${path.relative(ROOT, BASELINE)} — run --set-baseline once to arm the ratchet.`);
}

const fresh = collapsed.filter((c) => !known.includes(c.pair));
const fixed = known.filter((k) => !collapsed.some((c) => c.pair === k));

if (known.length) {
  console.log(`\nknown-collapsed (debt, not a regression): ${known.length}`);
  for (const k of known) {
    const now = collapsed.find((c) => c.pair === k);
    console.log(`  ${k}${now ? ` — still ${now.d.toFixed(2)}` : '  FIXED'}`);
  }
}
if (fixed.length) {
  console.log(`\n${fixed.length} baseline pair(s) are now distinct. Lower the ratchet: --set-baseline`);
}
if (fresh.length) {
  console.log(`\nFAIL — ${fresh.length} NEW collapsed pair(s) at threshold ${cal.threshold.toFixed(2)}:`);
  for (const f of fresh) console.log(`  ${f.pair}  ${f.d.toFixed(2)}`);
  console.log('Two meshes that share a silhouette are one mesh to the eye at any range.');
  process.exit(1);
}
console.log(`\nPASS — no new collapsed silhouettes across ${subjects.length} meshes in ${rows.length} families.`);

#!/usr/bin/env node
/**
 * The silhouette bench: does a family of meshes actually have different SHAPES?
 *
 *   node src/tools/silhouette.mts                    # calibrate, then gate trees + enemies
 *   node src/tools/silhouette.mts --set trees        # one family
 *   node src/tools/silhouette.mts --set rocks --seeds 24 --reseeds 5   # the rock gate
 *   node src/tools/silhouette.mts --calibrate        # the calibration pairs alone
 *   node src/tools/silhouette.mts --pairs conifer    # every pairwise distance in a family
 *   node src/tools/silhouette.mts --json tmp/sil.json
 *
 * ## Two ratchets, because two kinds of family
 *
 * A tree is `broadleaf#3` forever: `TreeBuilder` has a species by that name and
 * builds variant 3 of it. So the trees and the bestiary are ratcheted on **named
 * pairs** — the baseline lists the pairs already sharing one silhouette and the
 * gate fails on a new one.
 *
 * A tor is `tor#146:fin` because seed 146 happened to draw a fin *this* time.
 * `torPlan` consumes a different number of random draws after any edit to it, so
 * any edit at all renumbers every subject, and a pair-named ratchet reads a
 * strict improvement as a fresh set of failures. Generated families are
 * therefore ratcheted on the **property**: how many distinct silhouettes the
 * family holds, and how far apart they are relative to what this metric can
 * reach at that family's own aspect (`variety`). Both survive renumbering.
 *
 * Both floors are set from several `--reseeds` samples of the same generator,
 * because a single sample of either statistic moves further than the regression
 * they exist to catch. See {@link FamilyFloor} and the block above it.
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
  /**
   * Which ratchet governs this family. Default `pairs`.
   *
   * **`pairs` needs stable names and a generated family does not have them.**
   * A tree is `broadleaf#3` because `TreeBuilder` has a species called
   * `broadleaf` and builds variant 3 of it forever; a tor is `tor#146:fin`
   * because seed 146 happened to draw a fin *this* time, and any edit to
   * `torPlan`'s draw order — which is any edit at all — renumbers every subject
   * in the set. A pair-named ratchet on that reads a strict improvement as a
   * baseline of "fixed" pairs plus a fresh set of failures, which is a gate
   * that cries wolf on exactly the commits it exists to protect.
   *
   * `floor` families are ratcheted on the *property* instead: how many distinct
   * silhouettes the family holds, and how far apart they are relative to what
   * this metric can reach at that family's aspect. Both survive renumbering.
   */
  ratchet?: 'pairs' | 'floor';
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
      let hit = false;
      for (let c = 0; c < w; c++) {
        if (!mask[base + c]) continue;
        tot++; hit = true;
        if (c < boxLo) boxLo = c;
        if (c > boxHi) boxHi = c;
      }
      if (hit) rowsUsed++;
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
        let hit = false;
        for (let c = 0; c < w; c++) {
          if (!mask[base + c]) continue;
          cTot++; hit = true;
          if (c < cLo) cLo = c;
          if (c > cHi) cHi = c;
        }
        if (hit) cRows++;
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

/**
 * The rock family, and the three levels it has to be measured at.
 *
 * The blind judge named this defect in two consecutive rounds — *"one instance,
 * scattered by noise, never rotated… the same mushroom rock appears eight-plus
 * times per frame at the same orientation"* — and the verdict is factually
 * wrong about the rotation and right about the read. `Rocks.ts` yaws every
 * instance uniformly over a full turn. **Yaw is the one rotation that cannot
 * change the silhouette of a shape that is roughly radially symmetric about its
 * own vertical axis**, and this bench is built to say exactly that: it
 * minimises over every azimuth and the mirror, so a family that differs only by
 * yaw scores its own floor, and it normalises every band by the mesh's own
 * height, so a family that differs only by scale scores zero too.
 *
 *   `rock:base`    the eight base meshes of §3.7's variety ceiling.
 *   `rock:tor`     whole tors, composed through the shipped `torPlan`.
 *   `rock:stack`   corestone stacks, through the shipped `stackPlan`.
 *
 * The composed families are the ones that matter, because a tor is what a Leide
 * frame actually puts on the horizon — a base mesh is never drawn alone at that
 * size. Both are composed through the **shipped** functions and through
 * `placedScale`, the one place the aspect and burial floors are stated, because
 * the rocks lane shipped a stacking table measured by a bench carrying its own
 * copy of the rule and the copy had gone stale with no symptom at all.
 */
async function rockSubjects(seeds: number, reseed: number): Promise<Subject[]> {
  const R = await import('../world/props/Rocks.ts');
  const { Rng } = await import('../util/Rng.ts');
  type Kind = import('../world/props/ZoneDress.ts').StoneKind;
  const geo = new Map<string, THREE.BufferGeometry>();
  const ext = new Map<Kind, [number, number, number]>();
  for (const k of R.KINDS) {
    const g = R.rockGeometry(k.seed, k.opts);
    geo.set(k.key, g);
    ext.set(k.key, R.hullExtents(g));
  }
  const out: Subject[] = [];
  for (const k of R.KINDS) {
    out.push({
      family: 'rock:base', name: `base:${k.key}`, ratchet: 'floor',
      tris: trisOfGeoms([geo.get(k.key)!]),
    });
  }
  // `--reseeds` draws several samples of the same generator. It exists so the
  // family floors below can be set against the row's own resampling noise
  // rather than against one draw: `torPlan` consumes a different number of
  // random draws after any edit to it, so which seeds land in which archetype
  // row shifts even when nothing about the shapes changed. A ratchet set at a
  // single sample's value would fire on that shift alone.
  const base = reseed * 104729;

  /** One course, placed exactly as `Rocks.update`'s `emit` would place it. */
  const place = (
    kind: Kind, x: number, y: number, z: number,
    s: number, sx: number, sy: number, sz: number,
    yaw: number, pitch: number, roll: number, bury: number,
  ) => {
    const e = ext.get(kind)!;
    const ps = R.placedScale(e, s, sx, sy, sz, bury);
    const m = new THREE.Mesh(geo.get(kind)!, new THREE.MeshBasicMaterial());
    // `emit` sinks along the terrain normal; on flat ground that is straight
    // down, and a tor only stands on ground under 0.30 slope by construction.
    m.position.set(x, y - ps.sink, z);
    m.rotation.set(pitch, yaw, roll);
    m.scale.set(s * ps.jx, s * ps.jy, s * ps.jz);
    return m;
  };

  // **Tors are stratified by form, and that is the whole point of the row.**
  //
  // `torPlan` draws one of three archetypes and they differ by a factor of
  // three in height, so a single `rock:tor` family's mean distance is dominated
  // by fin-vs-boss pairs and reads as healthy however identical the pinnacles
  // are. The judge's complaint — *"the same mushroom rock appears eight-plus
  // times per frame"* — is a complaint about repetition **within** the form
  // that breaks the horizon. So the seeds are drawn exactly as the game draws
  // them and then sorted by the form that came out; nothing about the rule is
  // changed, only which plans land in which row.
  //
  // `rockS` 1.05 is Longwythe's, the zone the judge photographed.
  const want = new Map<string, number>(
    (['fin', 'boss', 'pinnacle', 'hoodoo'] as const).map((k) => [k, seeds]),
  );
  for (let v = 0; v < seeds * 40; v++) {
    const rng = new Rng(9001 + base + v * 7919);
    const plan = R.torPlan(rng, 1.05, ext);
    const left = want.get(plan.form) ?? 0;
    if (left <= 0) continue;
    want.set(plan.form, left - 1);
    const g = new THREE.Group();
    for (const c of plan.courses) {
      g.add(place(c.kind, c.dx, c.dy, c.dz, c.s, c.sx, c.sy, c.sz, c.yaw, c.pitch, c.roll, 0));
    }
    out.push({
      family: `rock:tor:${plan.form}`, name: `tor#${v}:${plan.form}`,
      ratchet: 'floor', tris: trisOf(g),
    });
    if ([...want.values()].every((n) => n <= 0)) break;
  }

  // A `granite` anchor at 4.4 m long axis is the median big block `_item` draws
  // in Leide, and `_genCell` turns roughly half of them into a stack.
  for (let v = 0; v < seeds; v++) {
    const rng = new Rng(4201 + base + v * 7919);
    const g = new THREE.Group();
    for (const c of R.stackPlan('granite', 4.4, 1, rng, ext)) {
      g.add(place(c.kind, c.dx, c.dy, c.dz, c.s, 1, c.sy, 1, c.yaw, 0, 0, c.bury ?? 0.26));
    }
    out.push({ family: 'rock:stack', name: `stack#${v}`, ratchet: 'floor', tris: trisOf(g) });
  }
  return out;
}

/* ------------------------------------------------------------ calibration */

interface Calib { same: number; diff: number; threshold: number; ratio: number; }

/**
 * The threshold this metric can reach depends on the family's ASPECT, and that
 * is not a nuisance — it is arithmetic.
 *
 * A profile entry is a band's width divided by the mesh's own height, so a
 * family whose widest band is 0.43 of its height has every one of its 192
 * numbers bounded by 0.43, and the largest RMS distance two such shapes can
 * possibly reach is bounded with them. The tree anchors that set the global
 * threshold are parasols and spires at aspect 0.6-1.0. So a `rock:tor:fin` row
 * scoring 4 does not mean what a `tree:savanna` row scoring 4 means, and
 * reading it as if it did is exactly the "instrument measuring itself" failure
 * this bench exists to avoid. Measured: at aspect 0.43 a prism, a cone and an
 * ellipsoid — three shapes nobody would call the same — come back at 23.7 /
 * 20.6 / **9.8**, against a general known-different of 51.5.
 *
 * So the anchors are re-measured at a ladder of aspects on every run and the
 * threshold a family is graded at is read off that ladder at the family's own
 * aspect.
 */
const ANCHOR_ASPECTS = [0.25, 0.43, 0.6, 0.8, 1, 1.3, 1.7] as const;

/** One rung of that ladder, measured rather than assumed. */
interface AspectAnchor {
  aspect: number;
  /** A prism against a x1.73, 37-degree-yawed copy of itself. True answer 0. */
  same: number;
  /** The CLOSEST of prism/cone/ellipsoid at this aspect — the hardest real pair. */
  diff: number;
  threshold: number;
  ratio: number;
}

/**
 * Three shapes nobody would call the same, cut to one aspect, plus one of them
 * against a moved copy of itself.
 *
 * `diff` is the **minimum** of the three pairwise distances and not their mean,
 * because the question a threshold answers is "how small can two genuinely
 * different shapes get", not "how far apart can they get".
 */
function shapeAnchors(aspect: number): AspectAnchor {
  const tag = aspect.toFixed(2);
  const prism = new THREE.CylinderGeometry(aspect, aspect, 2, 24);
  const cone = new THREE.ConeGeometry(aspect, 2, 24);
  const egg = new THREE.SphereGeometry(1, 24, 16);
  egg.scale(aspect, 1, aspect);
  const sp = silhouette(trisOfGeoms([prism]), `anchor-prism-${tag}`);
  const sc = silhouette(trisOfGeoms([cone]), `anchor-cone-${tag}`);
  const se = silhouette(trisOfGeoms([egg]), `anchor-ellipsoid-${tag}`);
  const diff = Math.min(
    profileDistance(sp, sc), profileDistance(sp, se), profileDistance(sc, se),
  );
  const g = new THREE.Group();
  g.add(new THREE.Mesh(prism, new THREE.MeshBasicMaterial()));
  g.scale.setScalar(1.73);
  g.rotation.y = (37 * Math.PI) / 180;
  const same = profileDistance(sp, silhouette(trisOf(g), `anchor-prism-moved-${tag}`));
  const floor = Math.max(same, 1e-3);
  return { aspect, same, diff, threshold: Math.sqrt(floor * diff), ratio: diff / floor };
}

/**
 * Read the ladder's known-different at an arbitrary aspect.
 *
 * Log-linear in aspect and clamped at both ends: extrapolating a calibration is
 * how an instrument starts making numbers up. (The measured ladder is very
 * close to a straight line through the origin — 5.55 / 9.82 / 13.77 / 18.40 /
 * 23.18 at 0.25 / 0.43 / 0.60 / 0.80 / 1.00 — so the interpolation is doing
 * almost nothing and the clamp is doing all of the safety. The ladder runs past
 * 1.0 because a rock is routinely wider than it is tall: `rock:base` averages
 * aspect 1.60 and would otherwise be graded against a clamp.)
 */
function diffAt(ladder: AspectAnchor[], aspect: number): number {
  if (aspect <= ladder[0].aspect) return ladder[0].diff;
  const last = ladder[ladder.length - 1];
  if (aspect >= last.aspect) return last.diff;
  for (let i = 1; i < ladder.length; i++) {
    const a = ladder[i - 1], b = ladder[i];
    if (aspect > b.aspect) continue;
    const t = (aspect - a.aspect) / (b.aspect - a.aspect);
    return Math.exp(Math.log(a.diff) * (1 - t) + Math.log(b.diff) * t);
  }
  return last.diff;
}

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
  pairs: string | null; json: string | null; setBaseline: boolean; reseeds: number;
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = {
    sets: [], seeds: 3, calibrateOnly: false, pairs: null, json: null,
    setBaseline: false, reseeds: 1,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--set') o.sets.push(argv[++i]);
    else if (a === '--seeds') o.seeds = Number(argv[++i]);
    else if (a === '--calibrate') o.calibrateOnly = true;
    else if (a === '--pairs') o.pairs = argv[++i];
    else if (a === '--json') o.json = argv[++i];
    else if (a === '--set-baseline') o.setBaseline = true;
    else if (a === '--reseeds') o.reseeds = Math.max(1, Number(argv[++i]));
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
interface Baseline {
  note: string;
  collapsed: string[];
  /**
   * The family-level half, for generated families whose member names are seed
   * indices. Keyed by family; `n` is the sample size the floor was recorded at
   * and a floor is only comparable at that same `n`.
   */
  families?: Record<string, FamilyFloor>;
}

/**
 * What a generated family has to keep.
 *
 * `distinct` is the count of silhouettes single-linkage clustering finds at the
 * global threshold. `variety` is the family's mean pairwise distance divided by
 * what "clearly different" is worth **at that family's own aspect** — the whole
 * reason the aspect ladder is measured. It is the number that means the same
 * thing in the `fin` row (aspect 0.53) and the `boss` row (aspect 0.9), and
 * without it those two rows' `mean-d` columns are not comparable at all: the
 * variety lane's own record is that `rock:tor:fin` sat at mean 4.93 while a
 * general known-different was 51.5 and a narrow one was 9.82.
 */
interface FamilyFloor { n: number; reseeds: number; distinct: number; variety: number; }

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

// The same two anchors, on synthetic shapes, at a ladder of aspects — because
// the number this metric can reach falls with the family's aspect and grading a
// 0.43-aspect family against a 0.8-aspect threshold is the instrument measuring
// itself. Re-measured every run, like everything else here.
const ladder = ANCHOR_ASPECTS.map(shapeAnchors);
console.log('aspect ladder — prism / cone / ellipsoid cut to one aspect, measured this run:');
console.log('  aspect   known-same   known-different   range   threshold');
for (const a of ladder) {
  console.log(
    `  ${a.aspect.toFixed(2).padStart(5)}   ${a.same.toFixed(3).padStart(9)}   `
    + `${a.diff.toFixed(3).padStart(14)}   ${`${a.ratio.toFixed(0)}x`.padStart(5)}   ${a.threshold.toFixed(3).padStart(8)}`,
  );
}
console.log('  (known-different is the CLOSEST of the three pairs, i.e. the hardest real case.)\n');

const voids = ladder.filter((a) => a.ratio < MIN_DYNAMIC_RANGE);
if (cal.ratio < MIN_DYNAMIC_RANGE || voids.length) {
  const why = cal.ratio < MIN_DYNAMIC_RANGE
    ? `the tree anchors are only ${cal.ratio.toFixed(1)}x apart`
    : `the aspect ladder collapses at ${voids.map((a) => a.aspect.toFixed(2)).join(', ')}`;
  console.log(`VOID: the bench cannot discriminate — ${why}.`);
  console.log('Do not read any verdict below. Fix the bench before fixing the meshes.');
  process.exit(2);
}
if (opts.calibrateOnly) process.exit(0);

/** Build one sample of the requested sets. `reseed` only moves generated families. */
async function build(reseed: number): Promise<Subject[]> {
  const out: Subject[] = [];
  for (const set of opts.sets) {
    if (set === 'trees') out.push(...await treeSubjects(opts.seeds));
    else if (set === 'enemies') out.push(...await enemySubjects());
    else if (set === 'rocks') out.push(...await rockSubjects(Math.max(opts.seeds, 10), reseed));
    else throw new Error(`unknown --set ${set} (trees|enemies|rocks)`);
  }
  return out;
}

const subjects = await build(0);
const sils = new Map<string, Sil>();
for (const s of subjects) sils.set(s.name, silhouette(s.tris, s.name));

/** One family's row in the report. */
interface Row {
  family: string; n: number; distinct: number; min: number; mean: number;
  fill: number; crownEmpty: number; aspect: number;
  /** Known-different at this family's own aspect, read off the ladder. */
  ceiling: number;
  /** `mean` over `ceiling`: the one number comparable across aspects. */
  variety: number;
  floored: boolean;
}

/**
 * Grade one built set: a row per family, plus the collapsed pairs.
 *
 * A function rather than straight-line code because the floor ratchet has to
 * run it several times over `--reseeds` samples of the same generator, and a
 * second copy of the rule is how `handoff/rocks.md`'s stacking table went stale
 * with no symptom at all.
 */
function grade(subs: Subject[]): { rows: Row[]; collapsed: { pair: string; d: number }[] } {
  const sils = new Map<string, Sil>();
  for (const q of subs) sils.set(q.name, silhouette(q.tris, q.name));
  const families = [...new Set(subs.map((q) => q.family))].sort();
  const collapsed: { pair: string; d: number }[] = [];
  const rows: Row[] = [];
  for (const fam of families) {
    const mem = subs.filter((q) => q.family === fam);
    if (mem.length < 2) continue;
    const floored = mem[0].ratchet === 'floor';
    const ss = mem.map((m) => sils.get(m.name)!);
    let min = Infinity, sum = 0, n = 0;
    for (let i = 0; i < ss.length; i++) {
      for (let j = i + 1; j < ss.length; j++) {
        const d = profileDistance(ss[i], ss[j]);
        sum += d; n++;
        if (d < min) min = d;
        // A floor-ratcheted family is deliberately absent from the pair list:
        // its member names are seed indices and a pair of them is not a stable
        // fact about anything.
        if (!floored && d <= cal.threshold) collapsed.push({ pair: PAIR(mem[i].name, mem[j].name), d });
      }
    }
    const aspect = ss.reduce((a, q) => a + q.aspect, 0) / ss.length;
    const ceiling = diffAt(ladder, aspect);
    rows.push({
      family: fam, n: mem.length, distinct: distinct(ss, cal.threshold), min, mean: sum / n,
      fill: ss.reduce((a, q) => a + q.fill, 0) / ss.length,
      crownEmpty: ss.reduce((a, q) => a + q.crownEmpty, 0) / ss.length,
      aspect, ceiling, variety: sum / n / ceiling, floored,
    });
  }
  return { rows, collapsed };
}

const { rows, collapsed } = grade(subjects);

console.log('family                   n  distinct   min-d  mean-d  aspect  ceiling  variety   fill  crown-empty');
for (const r of rows) {
  const flag = r.distinct < r.n ? '  <-- collapsed' : '';
  console.log(
    `${r.family.padEnd(22)} ${String(r.n).padStart(2)}   ${String(r.distinct).padStart(4)}   `
    + `${r.min.toFixed(2).padStart(6)}  ${r.mean.toFixed(2).padStart(6)}  `
    + `${r.aspect.toFixed(2).padStart(6)}  ${r.ceiling.toFixed(2).padStart(7)}  `
    + `${r.variety.toFixed(2).padStart(7)}  ${(r.fill * 100).toFixed(0).padStart(4)}%  `
    + `${(r.crownEmpty * 100).toFixed(0).padStart(6)}%${flag}`,
  );
}
console.log('  ceiling = the aspect ladder\'s known-different at THIS family\'s aspect — what');
console.log('  "clearly different, this narrow" is worth here. variety = mean-d / ceiling, and');
console.log('  it is the only column in this table that compares across families.');

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

/** Read the baseline, tolerating its absence. */
async function readBaseline(): Promise<Baseline | null> {
  try {
    return JSON.parse(await readFile(BASELINE, 'utf8')) as Baseline;
  } catch {
    return null;
  }
}

// **Only the pairs this run could have seen.** `--set rocks` does not build the
// bestiary, so without this the run reported `irongiant ~ redgiant` as FIXED and
// invited the next reader to lower a ratchet on a family it never measured — and
// `--set-baseline` would then have deleted it from the file outright.
const measured = new Set(subjects.map((q) => q.name));
const inScope = (pair: string) => pair.split(' ~ ').every((nm) => measured.has(nm));

/**
 * The floor ratchet's own noise floor, measured rather than assumed.
 *
 * `--reseeds K` draws K independent samples of the same generator. That is not
 * a nicety: `torPlan` consumes a different number of random draws after any
 * edit to it, so which seeds land in which archetype row shifts even when
 * nothing about the shapes changed, and the two obvious family statistics move
 * a long way with it. Measured over five samples of an UNCHANGED generator:
 *
 *     family              distinct        variety
 *     rock:tor:fin        15..20  sd 2.15   1.06..1.42  sd 0.115
 *     rock:tor:pinnacle   15..22  sd 2.45   1.03..1.37  sd 0.119
 *     rock:tor:boss       24..24  sd 0      1.19..1.62  sd 0.182
 *
 * So `rock:tor:fin`'s 19/24 — the number the variety lane proposed as the
 * floor — is breached by three of five resamples of the code that produced it.
 * A floor set on one draw is the pair ratchet's cry-wolf failure in a new
 * dress, and it would have shipped as the fix for it.
 *
 * So: the gate compares the **mean over K samples** against a floor recorded at
 * `mean - 2 sd` of a single sample. The mean of K has standard error `sd/sqrt(K)`,
 * so the floor sits `2 sqrt(K)` standard errors below it and a false failure is
 * not a thing that happens; what the gate can still resolve is a real loss of
 * more than about two single-sample standard deviations, which is 20-25% here.
 * The variety lane's own fix moved `rock:tor:fin` from 0.41 to 1.42, five times
 * that, so the gate has the sensitivity the defect it exists for actually needs.
 */
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sdev = (v: number[]) => {
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
};

/** Per-family `distinct` and `variety` across every sample. */
const samples = new Map<string, { n: number; distinct: number[]; variety: number[] }>();
const note = (rs: Row[]) => {
  for (const r of rs) {
    if (!r.floored) continue;
    const e = samples.get(r.family) ?? { n: r.n, distinct: [], variety: [] };
    e.distinct.push(r.distinct);
    e.variety.push(r.variety);
    samples.set(r.family, e);
  }
};
note(rows);
for (let k = 1; k < opts.reseeds; k++) note(grade(await build(k)).rows);

if (samples.size && opts.reseeds > 1) {
  console.log(`\nover ${opts.reseeds} resamples of the same generator (this is the floor ratchet's own noise):`);
  console.log('family                  distinct  mean    sd     variety  mean     sd');
  for (const [fam, e] of samples) {
    console.log(
      `${fam.padEnd(22)}  ${`${Math.min(...e.distinct)}..${Math.max(...e.distinct)}`.padStart(8)}`
      + `  ${mean(e.distinct).toFixed(1).padStart(4)}  ${sdev(e.distinct).toFixed(2).padStart(4)}`
      + `     ${`${Math.min(...e.variety).toFixed(2)}..${Math.max(...e.variety).toFixed(2)}`.padStart(11)}`
      + `  ${mean(e.variety).toFixed(2).padStart(4)}  ${sdev(e.variety).toFixed(3).padStart(5)}`,
    );
  }
}

if (opts.setBaseline) {
  const prev = await readBaseline();
  const families: Record<string, FamilyFloor> = { ...(prev?.families ?? {}) };
  for (const [fam, e] of samples) {
    families[fam] = {
      n: e.n,
      reseeds: opts.reseeds,
      distinct: Math.floor(mean(e.distinct) - 2 * sdev(e.distinct)),
      variety: Math.floor((mean(e.variety) - 2 * sdev(e.variety)) * 10) / 10,
    };
  }
  const b: Baseline = {
    note: 'Two ratchets. `collapsed` is the pair ratchet, for families whose member '
      + 'names are stable facts (a tree species, a bestiary key): it lists the pairs '
      + 'already sharing one silhouette when the bench landed, and the gate fails on a '
      + 'NEW one. `families` is the floor ratchet, for GENERATED families whose member '
      + 'names are seed indices and therefore renumber on any edit to the generator. '
      + 'Its floors are set at (mean - 2 sd) over `reseeds` independent samples of the '
      + 'same generator, because a single sample of these two statistics moves by more '
      + 'than the regression they are meant to catch; the gate compares the MEAN over '
      + 'the same number of samples. Re-run `--set-baseline` only to LOWER `collapsed` '
      + 'or to RAISE a family floor -- both directions are the improving one.',
    // Pairs from families this run did not build are carried through
    // untouched: `--set-baseline` after a `--set rocks` run must not silently
    // delete the bestiary's recorded debt.
    collapsed: [...new Set([
      ...collapsed.map((c) => c.pair),
      ...(prev?.collapsed ?? []).filter((q) => !inScope(q)),
    ])].sort(),
    families,
  };
  await writeFile(BASELINE, `${JSON.stringify(b, null, 1)}\n`);
  console.log(`\nwrote ${path.relative(ROOT, BASELINE)}: ${b.collapsed.length} known-collapsed pair(s), `
    + `${Object.keys(families).length} family floor(s) at ${opts.reseeds} resample(s)`);
  process.exit(0);
}

const baseline = await readBaseline();
if (!baseline) {
  console.log(`\nno ${path.relative(ROOT, BASELINE)} — run --set-baseline once to arm the ratchet.`);
}

/* ------------------------------------------------- the pair ratchet */

const known = (baseline?.collapsed ?? []).filter(inScope);
const skipped = (baseline?.collapsed ?? []).length - known.length;

const fresh = collapsed.filter((c) => !known.includes(c.pair));
const fixed = known.filter((k) => !collapsed.some((c) => c.pair === k));

if (known.length || skipped) {
  console.log(`\nknown-collapsed (debt, not a regression): ${known.length}`
    + `${skipped ? `, plus ${skipped} in families this run did not build` : ''}`);
  for (const k of known) {
    const now = collapsed.find((c) => c.pair === k);
    console.log(`  ${k}${now ? ` — still ${now.d.toFixed(2)}` : '  FIXED'}`);
  }
}
if (fixed.length) {
  console.log(`\n${fixed.length} baseline pair(s) are now distinct. Lower the ratchet: --set-baseline`);
}

/* ----------------------------------------------- the family-floor ratchet */

const failures: string[] = [];
let checked = 0, ungraded = 0;

if (samples.size) {
  console.log('\nfamily floors — a generated family is graded on the property, not on named pairs:');
  for (const [fam, e] of samples) {
    const f = baseline?.families?.[fam];
    if (!f) {
      console.log(`  ${fam.padEnd(22)} no floor recorded — run --set-baseline to arm it`);
      continue;
    }
    if (f.n !== e.n || f.reseeds !== opts.reseeds) {
      // Not a failure and not a pass: a floor recorded over 24 draws and 5
      // resamples says nothing about 10 draws and 1. Say so rather than compare
      // anyway.
      ungraded++;
      console.log(`  ${fam.padEnd(22)} n/a — floor recorded at n=${f.n} x ${f.reseeds} resample(s), `
        + `this run is n=${e.n} x ${opts.reseeds}`);
      continue;
    }
    checked++;
    const d = mean(e.distinct), v = mean(e.variety);
    const ok = d >= f.distinct && v >= f.variety;
    console.log(
      `  ${fam.padEnd(22)} distinct ${d.toFixed(1).padStart(4)}/${e.n} (floor ${f.distinct})`
      + `   variety ${v.toFixed(2)} (floor ${f.variety.toFixed(1)})${ok ? '' : '   <-- BELOW FLOOR'}`,
    );
    if (d < f.distinct) failures.push(`${fam}: ${d.toFixed(1)}/${e.n} distinct, floor ${f.distinct}`);
    if (v < f.variety) failures.push(`${fam}: variety ${v.toFixed(2)}, floor ${f.variety.toFixed(1)}`);
  }
  // **A recorded floor that could not be compared is not a pass.** The guard
  // has to be "any", not "none": `rock:base` is the eight shipped meshes and its
  // `n` is 8 whatever `--seeds` says, so a run at the wrong sample size graded
  // that one family, skipped the other five and reported PASS. That is how a
  // gate silently stops gating, which is the failure this whole file is a
  // reaction to.
  if (ungraded) {
    console.log(`\nVOID: ${ungraded} recorded floor(s) could not be compared against this run`);
    console.log(`(${checked} could). Run at the --seeds and --reseeds the floors were recorded at:`);
    console.log('  node src/tools/silhouette.mts --set rocks --seeds 24 --reseeds 5');
    process.exit(2);
  }
}

if (fresh.length) {
  console.log(`\nFAIL — ${fresh.length} NEW collapsed pair(s) at threshold ${cal.threshold.toFixed(2)}:`);
  for (const f of fresh) console.log(`  ${f.pair}  ${f.d.toFixed(2)}`);
  console.log('Two meshes that share a silhouette are one mesh to the eye at any range.');
}
if (failures.length) {
  console.log(`\nFAIL — ${failures.length} family floor(s) breached:`);
  for (const f of failures) console.log(`  ${f}`);
  console.log('A generated family may not get less varied than it already was.');
}
if (fresh.length || failures.length) process.exit(1);

console.log(`\nPASS — no new collapsed silhouettes across ${subjects.length} meshes in ${rows.length} families`
  + `${checked ? `, and ${checked} family floor(s) held` : ''}.`);

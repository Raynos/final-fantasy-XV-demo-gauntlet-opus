/**
 * Is there DAYLIGHT between the courses of a stacked rock, once it is SUNK?
 *
 *   node src/tools/probes/stackjoint.mts
 *
 * Bare Node, no browser. It composes the shipped `stackPlan` / `torPlan` and
 * then **raycasts the placed triangles**: for every joint it puts both blocks
 * where the renderer would put them — the plan's transform, less the sink
 * `placedScale` applies — and asks the two meshes directly where their surfaces
 * are. A joint is OPEN when the upper block's underside clears the lower
 * block's topside at *every* sampled contact point, i.e. when you can see
 * through the joint from any side.
 *
 * **Why it works this way, and why the previous version could not see the bug
 * it was written to catch.** Until `rockseat` this probe computed each course's
 * half-height as `c.s * c.sy * ext[kind][1]` — the same `hullExtents` number the
 * plan itself authors the joint through. That is the recipe measured against
 * itself: it reported **0 open joints of 6207** while `poi_imperial` drew a
 * three-course tor with daylight all the way across its top joint
 * (`tmp/shots/lr2-impp/rock.png`).
 *
 * `hullExtents` is a **bounding box**, and it is one number for both faces:
 * `max(bb.max.y, -bb.min.y)`. These meshes are cut by half-spaces and are not
 * symmetric about their own origin — `granite`'s box runs y ∈ [-0.657, +0.361]
 * and its surface directly over the axis is at **+0.293**. So a joint authored
 * on `ext[1]` believes granite's top is 0.364 higher than the triangle the
 * renderer actually draws, which is **55% of the block's own half-height**, and
 * a joint pays it on both blocks. `probes/hullseat.mts` measured the underside
 * half of this (`slab` 0.139, ~0.55 m per joint); the topside half is larger
 * again.
 *
 * Reading the position buffer is the whole point: the instrument shares no
 * arithmetic with the thing it grades, so it stays true through any change to
 * how the plan states a course's height. It is the same rule
 * `Seat.supportPoints` is written on — enforce, and measure, on the finished
 * placed mesh — arriving at the one gate built to catch this class.
 *
 * **What it still does not see.** The sink runs along the terrain normal in
 * `Rocks.update`'s `emit` and along -Y here; tors are only sited under
 * `slope01 <= 0.30`, so the two differ by under 5%. It grades the two composed
 * landforms and not `_genOutcrop`'s laid courses, which need an `Ecology`.
 */
import * as THREE from 'three';
import { Rng } from '../../util/Rng.ts';
import {
  KINDS, rockGeometry, hullExtents, torPlan, stackPlan, placedScale, type HullExt,
} from '../../world/props/Rocks.ts';
import type { StoneKind } from '../../world/props/ZoneDress.ts';

const ext = new Map<StoneKind, HullExt>();
const meshes = new Map<StoneKind, THREE.Mesh>();
for (const k of KINDS) {
  const g = rockGeometry(k.seed, k.opts);
  ext.set(k.key, hullExtents(g));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  m.matrixAutoUpdate = false;
  meshes.set(k.key, m);
}

/** One course, placed exactly where `emit` would draw it. */
interface Placed {
  kind: StoneKind;
  x: number; y: number; z: number;
  s: number; sx: number; sy: number; sz: number;
  yaw: number; pitch: number; roll: number;
}

const ray = new THREE.Raycaster();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _o = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);

function put(p: Placed): THREE.Mesh {
  const m = meshes.get(p.kind)!;
  _e.set(p.pitch, p.yaw, p.roll, 'XYZ');
  _q.setFromEuler(_e);
  _p.set(p.x, p.y, p.z);
  _v.set(p.s * p.sx, p.s * p.sy, p.s * p.sz);
  m.matrix.compose(_p, _q, _v);
  m.matrixWorld.copy(m.matrix);
  m.matrixWorldNeedsUpdate = false;
  return m;
}

/** Where the mesh's surface is at world (x, z): topmost, or bottom-most. */
function surface(m: THREE.Mesh, x: number, z: number, fromBelow: boolean): number | null {
  _o.set(x, fromBelow ? -1e4 : 1e4, z);
  ray.set(_o, fromBelow ? UP : DOWN);
  const hit = ray.intersectObject(m, false);
  return hit.length ? hit[0].point.y : null;
}

/**
 * The smallest clearance anywhere across the contact, in metres.
 *
 * Negative is overlap — the blocks interpenetrate somewhere, which is what
 * every joint is supposed to do and what makes a stack read as one landform.
 * Positive is sky: the upper block stands clear of the lower one at every point
 * of its own footprint, and the joint is a black line at any viewing azimuth.
 *
 * Sampled on the UPPER block's footprint (the joint is only as wide as the
 * block that has to be held up) at three radii and eight azimuths, in that
 * block's own yawed frame. A sample where either ray misses is not part of the
 * contact and is dropped.
 */
function jointGap(lo: Placed, hi: Placed): number | null {
  const eh = ext.get(hi.kind)!;
  const ax = hi.s * hi.sx * eh[0], az = hi.s * hi.sz * eh[2];
  const pts: Array<[number, number]> = [];
  for (const f of [0, 0.35, 0.7]) {
    const n = f === 0 ? 1 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hi.yaw;
      pts.push([hi.x + Math.cos(a) * f * ax, hi.z + Math.sin(a) * f * az]);
    }
  }
  // The lower block first: `put` reuses one mesh per kind, and a stack may have
  // the same kind on both sides of a joint.
  const mLo = put(lo);
  const tops = pts.map(([x, z]) => surface(mLo, x, z, false));
  const mHi = put(hi);
  let worst: number | null = null;
  for (let i = 0; i < pts.length; i++) {
    if (tops[i] === null) continue;
    const bot = surface(mHi, pts[i][0], pts[i][1], true);
    if (bot === null) continue;
    const c = bot - tops[i]!;
    if (worst === null || c < worst) worst = c;
  }
  return worst;
}

const rows = new Map<string, number[]>();
const push = (k: string, v: number) => { const a = rows.get(k) ?? []; a.push(v); rows.set(k, a); };

// --- tors: `dy` is the course origin, `bury` is 0 on every course ----------
for (let v = 0; v < 900; v++) {
  const plan = torPlan(new Rng(9001 + v * 7919), 1.05, ext);
  const placed: Placed[] = plan.courses.map((c) => ({
    kind: c.kind, x: c.dx, z: c.dz,
    y: c.dy - placedScale(ext.get(c.kind)!, c.s, c.sx, c.sy, c.sz, 0).sink,
    s: c.s, sx: c.sx, sy: c.sy, sz: c.sz,
    yaw: c.yaw, pitch: c.pitch, roll: c.roll,
  }));
  for (let i = 1; i < placed.length; i++) {
    const g = jointGap(placed[i - 1], placed[i]);
    if (g !== null) push(`tor:${plan.form}`, g);
  }
}

// --- corestone stacks: base keeps its kind's bury, the rest get 0 ----------
for (const [label, bury0] of [
  ['stack granite (bury 0.26)', 0.26], ['stack slab (bury 0.40)', 0.40],
] as Array<[string, number]>) {
  for (let v = 0; v < 900; v++) {
    const rng = new Rng(4201 + v * 7919);
    const cs = stackPlan(v % 2 ? 'granite' : 'slab', 4.4, 1, rng, ext, 0.38, bury0);
    const placed: Placed[] = cs.map((c, i) => ({
      kind: c.kind, x: c.dx, z: c.dz,
      y: c.dy - placedScale(ext.get(c.kind)!, c.s, 1, c.sy, 1, i === 0 ? bury0 : 0).sink,
      s: c.s, sx: 1, sy: c.sy, sz: 1,
      // `Rocks._stack` inherits the anchor's pitch and roll times `c.tilt`, and
      // the anchor's own settle is a per-instance draw this probe has no seat
      // for. Level courses are the case the plan authors; a tilt only ever
      // opens a joint further, so this reads as the optimistic bound.
      yaw: c.yaw, pitch: 0, roll: 0,
    }));
    for (let i = 1; i < placed.length; i++) {
      const g = jointGap(placed[i - 1], placed[i]);
      if (g !== null) push(label, g);
    }
  }
}

const q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.floor(a.length * f))];
console.log('family                       joints   drawn joint gap, metres (negative = overlap)');
console.log('                                       p50      p90      p99      max   open');
let anyOpen = 0, total = 0;
for (const [k, a] of rows) {
  a.sort((x, y) => x - y);
  const open = a.filter((v) => v > 0).length;
  anyOpen += open; total += a.length;
  console.log(`  ${k.padEnd(26)} ${String(a.length).padStart(6)}  `
    + [q(a, 0.5), q(a, 0.9), q(a, 0.99), a[a.length - 1]].map((v) => v.toFixed(3).padStart(8)).join(' ')
    + `  ${String(open).padStart(5)}`);
}
console.log(`\n${anyOpen === 0 ? 'PASS' : 'FAIL'} — ${anyOpen} open joints of ${total}`);
process.exit(anyOpen === 0 ? 0 : 1);

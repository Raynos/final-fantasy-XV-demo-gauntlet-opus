/**
 * Is there DAYLIGHT between the courses of a stacked rock, once it is SUNK?
 *
 *   node src/tools/probes/stackjoint.mts
 *
 * Bare Node, no browser: it runs the shipped `stackPlan` / `torPlan` against the
 * shipped `hullExtents`, and composes the joint the way `Rocks.update`'s `emit`
 * does -- through `placedScale`, so the sink is the sink the renderer applies
 * and not a copy of the formula.
 *
 * **Why this probe exists.** `probes/mushroom.mts` grades the WIDTH ratio of one
 * course to the one below it -- the balanced-rock defect -- and by construction
 * says nothing about the vertical. `floatcheck` gate 2 measures every placed
 * instance against the TERRAIN, and a course standing on another rock is not
 * above terrain, so it sits in that gate's own published blind list ("props
 * burying each other"). Between them a stack whose upper course hangs in the
 * air was invisible to both.
 *
 * **The mechanism.** Every instance is drawn at `y - ny * sink`, where
 * `placedScale` gives `sink = s * max(bury, SINK_FRAC * max(ex0, ex2) * 2)`.
 * That is per-course: it scales with `s`, and a stack tapers, so the block below
 * always sinks further than the block above it. The planned overlap is eaten by
 * the difference and then the joint opens. The base course is worse again in a
 * corestone stack, where it keeps its kind's own `bury` (0.22-0.42) while every
 * course above it is handed 0.
 *
 * A negative gap is overlap and is what every joint is supposed to have. A
 * positive gap is sky.
 */
import { Rng } from '../../util/Rng.ts';
import {
  KINDS, rockGeometry, hullExtents, torPlan, stackPlan, placedScale,
} from '../../world/props/Rocks.ts';
import type { StoneKind } from '../../world/props/ZoneDress.ts';

const ext = new Map<StoneKind, [number, number, number]>();
for (const k of KINDS) ext.set(k.key, hullExtents(rockGeometry(k.seed, k.opts)));

const rows = new Map<string, number[]>();
const push = (k: string, v: number) => { const a = rows.get(k) ?? []; a.push(v); rows.set(k, a); };

// --- tors: `dy` is the course CENTRE, `bury` is 0 on every course ----------
for (let v = 0; v < 900; v++) {
  const plan = torPlan(new Rng(9001 + v * 7919), 1.05, ext);
  for (let i = 1; i < plan.courses.length; i++) {
    const c = plan.courses[i], p = plan.courses[i - 1];
    const ec = ext.get(c.kind)!, ep = ext.get(p.kind)!;
    const hc = c.s * c.sy * ec[1], hp = p.s * p.sy * ep[1];
    const sc = placedScale(ec, c.s, c.sx, c.sy, c.sz, 0).sink;
    const sp = placedScale(ep, p.s, p.sx, p.sy, p.sz, 0).sink;
    push(`tor:${plan.form}`, (c.dy - hc - sc) - (p.dy + hp - sp));
  }
}

// --- corestone stacks: base keeps its kind's bury, the rest get 0 ----------
for (const [label, bury0] of [['stack granite (bury 0.26)', 0.26], ['stack slab (bury 0.40)', 0.40]] as Array<[string, number]>) {
  for (let v = 0; v < 900; v++) {
    const rng = new Rng(4201 + v * 7919);
    const cs = stackPlan(v % 2 ? 'granite' : 'slab', 4.4, 1, rng, ext, 0.38, bury0);
    for (let i = 1; i < cs.length; i++) {
      const c = cs[i], p = cs[i - 1];
      const ec = ext.get(c.kind)!, ep = ext.get(p.kind)!;
      const hc = c.s * c.sy * ec[1], hp = p.s * p.sy * ep[1];
      const sc = placedScale(ec, c.s, 1, c.sy, 1, c.bury ?? 0).sink;
      const sp = placedScale(ep, p.s, 1, p.sy, 1, p.bury ?? (i - 1 === 0 ? bury0 : 0)).sink;
      push(label, (c.dy - hc - sc) - (p.dy + hp - sp));
      push(`${label} BEFORE`, (c.dy - hc - sc) - (p.dy + hp - sp) + (sp - sc));
    }
  }
}

/**
 * **The `BEFORE` rows are exact, and only `stackPlan` has them.** `stackPlan`
 * adds `sink_i - sink_{i-1}` to the cumulative `y` unconditionally, and that
 * telescopes: the per-joint difference between the corrected and the
 * uncorrected plan is exactly `sinkPrev - sink`, so the old value is recoverable
 * from the new one without keeping a second copy of the rule -- which is the
 * thing that made `2d91563` ship a stale table.
 *
 * `torPlan`'s correction is CLAMPED to `min(0, …)` -- it may only pull a course
 * down, never lift one, because the unclamped version cost two silhouette
 * floors on joints that were not open. A clamped term does not telescope, so
 * there is no exact reconstruction and no BEFORE row for the tors. What the tor
 * rows say is that after the guard nothing is open, over 900 tors.
 */
const q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.floor(a.length * f))];
console.log('family                       joints   drawn joint gap, metres (negative = overlap)');
console.log('                                       p50      p90      p99      max   open');
let anyOpen = 0, total = 0;
for (const [k, a] of rows) {
  a.sort((x, y) => x - y);
  const open = a.filter(v => v > 0).length;
  if (!k.endsWith('BEFORE')) { anyOpen += open; total += a.length; }
  console.log(`  ${k.padEnd(26)} ${String(a.length).padStart(6)}  `
    + [q(a, 0.5), q(a, 0.9), q(a, 0.99), a[a.length - 1]].map(v => v.toFixed(3).padStart(8)).join(' ')
    + `  ${String(open).padStart(5)}`);
}
console.log(`\n${anyOpen === 0 ? 'PASS' : 'FAIL'} — ${anyOpen} open joints of ${total}`);
process.exit(anyOpen === 0 ? 0 : 1);

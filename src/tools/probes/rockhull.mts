/**
 * Plan §3.5's guarantees, read off the world the game is actually drawing.
 *
 * `Rocks.update` enforces an aspect floor and a burial floor on the finished,
 * placed hull. This prints how often each fires and what the worst shipped
 * aspect ratio is, so the guarantee is *proved to run* rather than merely
 * present — `orphans` proves reachable, this proves executed.
 *
 * The worst-aspect number is re-derived **from the instance matrices**, not
 * from the counters, so it does not come from the same code that enforced it.
 *
 *   node src/tools/probe.mts src/tools/probes/rockhull.mts
 *
 * Evaluated as a function body in the page: plain JS, no type annotations, and
 * a top-level `return` is correct.
 */
const g = window.GAME;
const rocks = g.get('Props').rocks;
const out = { guard: { ...rocks.guard }, kinds: {}, fromMatrices: null };
for (const [k, e] of rocks.ext) {
  out.kinds[k] = {
    ext: e.map((v) => +v.toFixed(3)),
    meshAspect: +(Math.max.apply(null, e) / Math.min.apply(null, e)).toFixed(2),
  };
}
let worst = 0, n = 0;
for (const grp of rocks.groups) {
  for (const m of [grp.near, grp.far]) {
    if (!m || !m.count) continue;
    const a = m.instanceMatrix.array;
    const e = rocks.ext.get(grp.key);
    for (let i = 0; i < m.count; i++) {
      const o = i * 16;
      const sx = Math.hypot(a[o], a[o + 1], a[o + 2]) * e[0];
      const sy = Math.hypot(a[o + 4], a[o + 5], a[o + 6]) * e[1];
      const sz = Math.hypot(a[o + 8], a[o + 9], a[o + 10]) * e[2];
      const r = Math.max(sx, sy, sz) / Math.max(1e-9, Math.min(sx, sy, sz));
      if (r > worst) worst = r;
      n++;
    }
  }
}
out.fromMatrices = { instances: n, worstAspect: +worst.toFixed(3) };
return out;

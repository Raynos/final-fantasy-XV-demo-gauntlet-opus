/*
 * Does a bedrock knot's upper course have DAYLIGHT under it?
 *
 *   node src/tools/probe.mts src/tools/probes/outcropjoint.mts
 *   node src/tools/probe.mts src/tools/probes/outcropjoint.mts --set __OJ_CELLS=14
 *
 * `Rocks._genOutcrop` is the third site that authors a joint -- `stackPlan` and
 * `torPlan` are the other two -- and it was the one nothing graded.
 * `probes/stackjoint.mts` cannot reach it: that probe is bare Node because
 * those two are pure functions, and `_genOutcrop` is not. It reads
 * `Ecology.slope01`, `cleared`, `roadDist`, `dressAt` and the drawn terrain, so
 * it needs a page.
 *
 * **The question is not "is the joint open".** `_genOutcrop` lays each block on
 * a NAMED block below it and never records which, so there is no joint list to
 * walk. It asks the thing the eye asks, which is stronger: **is there any
 * support under this block at all?** At every sampled point of a block's own
 * footprint the support is the higher of the drawn terrain and the topside of
 * any other instance within 40 m. If the block's underside clears that
 * everywhere, it is standing in the air.
 *
 * `floatcheck` cannot answer this and says so in its own blind list: its gate 2
 * measures instances against the TERRAIN, and a course standing on another rock
 * is not above terrain. This is that blind spot, for one generator.
 *
 * **It shares no arithmetic with what it grades.** Every height is read off the
 * placed triangles -- each instance's own position buffer through its own world
 * matrix -- and never off `hullExtents`, which is the tuple `_genOutcrop`
 * authors the seat through. That is the rule `probes/stackjoint.mts` was
 * rewritten on after it reported 0 open joints of 1615 for a defect that was
 * plainly in frame.
 */
const g = window.GAME;
const CELLS = Number(window.__OJ_CELLS || 10);
const props = g.get('Props');
const terrain = g.get('Terrain');
const rocks = props.rocks;
const R = await import('/world/props/Rocks.ts');

// Everything `_genOutcrop` would emit over a block of its own 176 m cells.
const inst = [];
for (let cx = -CELLS; cx < CELLS; cx++) {
  for (let cz = -CELLS; cz < CELLS; cz++) {
    const out = [];
    try { rocks._genOutcrop(cx, cz, out); } catch (e) { void e; }
    for (const it of out) inst.push(it);
  }
}

// `three` is not a resolvable specifier in the page and the app never
// constructs a `Raycaster`, so the surface is read by walking the triangles
// directly. One `Mesh` per kind, borrowed for its world matrix.
const MeshC = Object.getPrototypeOf(rocks.groups[0].mesh).constructor;
const meshOf = new Map();
for (const grp of rocks.groups) {
  // `matrixAutoUpdate` stays ON: with it off, `updateMatrixWorld` does not
  // recompose `matrix` from position/rotation/scale, and every triangle comes
  // back at the unit mesh's origin -- which reads as "no surface anywhere" and
  // not as an error.
  meshOf.set(grp.key, new MeshC(grp.mesh.geometry, grp.mesh.material));
}

/**
 * The instance's triangles, in world space, as a flat Float64Array of 9 per
 * face. Placed the way `Rocks.update`'s `emit` places it: the aspect floor and
 * the sink both from the shipped `placedScale`, the sink along the instance's
 * own terrain normal.
 */
const worldTris = (it) => {
  const m = meshOf.get(it.k);
  if (!m) return null;
  const ps = R.placedScale(rocks.ext.get(it.k), it.s, it.sx, it.sy, it.sz, it.bury);
  m.position.set(it.x - it.nx * ps.sink, it.y - it.ny * ps.sink, it.z - it.nz * ps.sink);
  m.rotation.set(it.pitch, it.yaw, it.roll);
  m.scale.set(it.s * ps.jx, it.s * ps.jy, it.s * ps.jz);
  m.updateMatrixWorld(true);
  const e = m.matrixWorld.elements;
  const p = m.geometry.attributes.position;
  const idx = m.geometry.index;
  const n = idx ? idx.count : p.count;
  const t = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = idx ? idx.getX(i) : i;
    const x = p.getX(v), y = p.getY(v), z = p.getZ(v);
    t[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
    t[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    t[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  return t;
};

/** The mesh's topmost (or bottom-most) surface directly over world (px, pz). */
const surface = (t, px, pz, wantTop) => {
  let best = null;
  for (let f = 0; f + 8 < t.length; f += 9) {
    const ax = t[f] - px, az = t[f + 2] - pz;
    const bx = t[f + 3] - px, bz = t[f + 5] - pz;
    const cx = t[f + 6] - px, cz = t[f + 8] - pz;
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (d > -1e-12 && d < 1e-12) continue;
    const l0 = ((bz - cz) * -cx + (cx - bx) * -cz) / d;
    const l1 = ((cz - az) * -cx + (ax - cx) * -cz) / d;
    const l2 = 1 - l0 - l1;
    if (l0 < 0 || l1 < 0 || l2 < 0) continue;
    const y = l0 * t[f + 1] + l1 * t[f + 4] + l2 * t[f + 7];
    if (best === null || (wantTop ? y > best : y < best)) best = y;
  }
  return best;
};

// Only the laid course blocks: scree, cobbles and pebbles lie in soil and are
// `floatcheck` gate 2's business, not a joint's.
const BIG = new Set(['granite', 'bedded', 'slab', 'spire', 'worn']);
const subjects = inst.filter((it) => it.far && BIG.has(it.k) && it.s > 2);

const tris = new Map();
const trisOf = (it) => {
  let t = tris.get(it);
  if (t === undefined) { t = worldTris(it); tris.set(it, t); }
  return t;
};

const gaps = [];
let floating = 0, worst = -Infinity, worstAt = null;
for (const it of subjects) {
  const ex = rocks.ext.get(it.k);
  const self = trisOf(it);
  if (!ex || !self) continue;
  const ax = it.s * it.sx * ex[0], az = it.s * it.sz * ex[2];
  const pts = [];
  for (const f of [0, 0.4, 0.75]) {
    const n = f === 0 ? 1 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + it.yaw;
      pts.push([it.x + Math.cos(a) * f * ax, it.z + Math.sin(a) * f * az]);
    }
  }
  const support = pts.map(([x, z]) => terrain.drawnHeightAt(x, z));
  for (const o of inst) {
    if (o === it) continue;
    const dx = o.x - it.x, dz = o.z - it.z;
    if (dx * dx + dz * dz > 1600) continue;
    const t = trisOf(o);
    if (!t) continue;
    for (let i = 0; i < pts.length; i++) {
      const top = surface(t, pts[i][0], pts[i][1], true);
      if (top !== null && top > support[i]) support[i] = top;
    }
  }
  let gap = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const b = surface(self, pts[i][0], pts[i][1], false);
    if (b === null) continue;
    gap = Math.min(gap, b - support[i]);
  }
  if (!Number.isFinite(gap)) continue;
  gaps.push(gap);
  if (gap > 0) floating++;
  if (gap > worst) { worst = gap; worstAt = `${Math.round(it.x)},${Math.round(it.z)} ${it.k} s=${it.s.toFixed(1)}`; }
}

gaps.sort((a, b) => a - b);
const q = (f) => (gaps.length ? +gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * f))].toFixed(3) : null);
return {
  note: 'gap = a block underside minus the highest support under it (the drawn terrain, '
    + 'or another instance within 40 m), minimised over its own footprint. '
    + 'Positive is daylight all the way under the block.',
  cellsPerSide: CELLS * 2,
  cellM: 176,
  instances: inst.length,
  graded: gaps.length,
  floating,
  floatingPct: gaps.length ? +((floating / gaps.length) * 100).toFixed(2) : null,
  p50: q(0.5), p90: q(0.9), p99: q(0.99),
  worstM: +worst.toFixed(2),
  worstAt,
};

/**
 * Whose NaN is it? A hide-walk of the scene graph with the NaN count as the
 * metric.
 *
 *   node src/tools/probe.mts src/tools/probes/nanwalk.mts --set __SHOT=combat_armiger
 *
 * `nanscan.mts` says which shots carry NaN in `post.rtScene`; this says which
 * subtree writes it. A NaN is binary and localised, so "the count goes to zero"
 * is a far stronger signal than a pixel diff — hiding an object also stops it
 * occluding, and against a mean delta that confound is most of the answer.
 *
 * **HIDE AFTER THE POSE, AND RE-POSE BETWEEN CANDIDATES.** Both halves are
 * load-bearing and each one cost this probe a wrong answer:
 *
 *  - `applyShot` REBUILDS subtrees — `VFX` above all. Hide a child and then
 *    pose, and the pose hands you a fresh set of children with the hide undone.
 *    That reads as "this object is innocent" for every object in the group,
 *    while hiding the *group* still works (a hidden parent stays hidden however
 *    many children are added under it) — so the walk blames the group and every
 *    child alibis. Which is exactly what it did.
 *  - ...but simply rendering on without re-posing lets the simulation run, and
 *    on a VFX-heavy shot the count drifts (50 -> 47 -> 42 -> 40 over one pass)
 *    so every later candidate is measured against a different frame. So: pose,
 *    re-find the candidate by its index path, hide, render, scan.
 *
 * `--set __SHOT=<name>` picks the shot; `--set __ROOT=VFX` starts the walk
 * inside one named child of the scene.
 */
const g = window.GAME;
const r = g.renderer;
const p = g.post;
const rt = p.rtScene;
const SHOT = window.__SHOT || 'combat_armiger';
const ROOT = window.__ROOT || '';

const pose = () => {
  g.resetClock();
  g.applyShot(SHOT);
  g.settle(40);
  g.applyShot(SHOT);
  g.settle(8);
};

const h2f = (h) => {
  const s = (h & 0x8000) ? -1 : 1, e = (h & 0x7c00) >> 10, f = h & 0x03ff;
  if (e === 0) return s * 6.103515625e-5 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
};
const buf = new Uint16Array(rt.width * rt.height * 4);
const scan = () => {
  r.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buf);
  let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0; i < rt.width * rt.height; i++) {
    if (!Number.isNaN(h2f(buf[i * 4]) + h2f(buf[i * 4 + 1]) + h2f(buf[i * 4 + 2]))) continue;
    n++;
    const x = i % rt.width, y = rt.height - 1 - ((i / rt.width) | 0);
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return n ? { n, box: [x0, y0, x1, y1] } : { n: 0 };
};

/** Index path from the scene root — the only handle that survives a re-pose. */
const pathOf = (o) => {
  const ix = [];
  for (let n = o; n && n.parent; n = n.parent) ix.unshift(n.parent.children.indexOf(n));
  return ix;
};
const atPath = (ix) => {
  let n = g.scene;
  for (const i of ix) { n = n && n.children[i]; if (!n) return null; }
  return n;
};

const label = (o) => `${o.name || o.type}${o.isInstancedMesh ? `[${o.count}]` : ''}`;

/** Pose, re-find the candidate, hide it, render, and count. */
const withHidden = (ix) => {
  pose();
  const o = ix.length ? atPath(ix) : null;
  if (ix.length && !o) return { n: -1 };
  const was = o ? o.visible : true;
  if (o) o.visible = false;
  for (let i = 0; i < 10; i++) g.frame(1 / 60);
  const s = scan();
  if (o) o.visible = was;
  return s;
};

const out = { shot: SHOT, base: withHidden([]), levels: [] };
console.log(`[nanwalk] ${SHOT} base ${JSON.stringify(out.base)}`);

let node = ROOT ? g.scene.children.find((c) => c.name === ROOT) : g.scene;
for (let depth = 0; depth < 7 && node; depth++) {
  const kids = node.children.filter((k) => k.visible);
  if (!kids.length) break;
  const rows = [];
  let win = null;
  for (const k of kids) {
    const s = withHidden(pathOf(k));
    rows.push({ child: label(k), n: s.n });
    if (!win || s.n < win.n) win = { path: pathOf(k), n: s.n, label: label(k) };
  }
  rows.sort((a, b) => a.n - b.n);
  console.log(`[nanwalk] d${depth} in ${label(node)}: ${rows.slice(0, 4).map((x) => `${x.child}=${x.n}`).join(' ')}`);
  out.levels.push({ node: label(node), kids: kids.length, best: rows.slice(0, 4) });
  if (!win || win.n > 0) break;
  node = atPath(win.path);
}

if (node) {
  const m = Array.isArray(node.material) ? node.material[0] : node.material;
  out.owner = {
    chain: (() => { const a = []; let o = node, h = 0; while (o && h++ < 8) { a.push(o.name || o.type); o = o.parent; } return a.join('/'); })(),
    type: node.type,
    mat: m && { type: m.type, name: m.name, transparent: m.transparent, blending: m.blending,
      defines: m.defines ? Object.keys(m.defines) : null },
  };
  console.log(`[nanwalk] owner ${JSON.stringify(out.owner)}`);
}
return out;

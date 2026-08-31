/**
 * Hair colour, measured the way `ART-DIRECTION` 12.3 measures the FFXV plates —
 * percentiles over the hair region — but with a **mask instead of a rectangle**.
 *
 * §12.3's numbers come from a hand-picked rect on a still photograph, which is
 * fine for a photograph and is a trap on a live frame: `project/LANDMINES.md`
 * records the same fixed rect reading black hair in one run and blown sky in
 * the next. So this hides every mesh on the hero except the hair, renders the
 * head through `Portraits.bake` (transparent surround, one lens, deterministic
 * framing), and lets the **alpha channel** be the region. Every covered pixel
 * is hair by construction and nothing else can leak in.
 *
 *   node src/tools/framecam.mts --probe src/tools/_probe/hairstat.mts \
 *     --out tmp/shots/hairstat > tmp/l12b/hair.json
 *
 * The caller decodes the PNGs and takes p10/p50/p90/p99 of Y and of R-B. Y is
 * what lane 1 matched against the plates and it is matched; **R-B is the axis
 * nobody measured**, and it is the whole complaint — a hair that matches a
 * plate's luminance distribution with no chroma in it is grey hair.
 *
 * Evaluated as a function body with `new Function`: no type annotations.
 */
const g = window.GAME;
const P = await import('/ui/Portraits.ts');
const RAW = { ...P.DEFAULT_BAKE, targetLuma: 10, maxGain: 1 };

const out = {};
for (const id of ['noctis', 'gladio', 'ignis', 'prompto']) {
  const ch = P.heroCharacter(g, id);
  if (!ch) { out[id] = 'MISSING'; continue; }
  const hidden = [];
  ch.root.traverse((o) => {
    if (o.isMesh && o !== ch.hair && o.visible) { o.visible = false; hidden.push(o); }
  });
  try {
    out[id] = P.bake(g, ch, RAW) || 'NULL';
  } finally {
    for (const o of hidden) o.visible = true;
  }
}
return { hair: out };

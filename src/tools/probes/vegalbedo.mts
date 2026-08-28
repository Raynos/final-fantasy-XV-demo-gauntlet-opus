// What albedo does each vegetation card actually carry?
//
// `grass.md` found the same defect twice and it was worth money both times: a
// card LOD whose alpha-weighted mean luminance nobody pinned drifts from the
// ring it replaces, and the frame reads it as a different *material* rather
// than as a shade. `GRASS_CARD_ALBEDO = 0.58` and `LEAF_CARD_ALBEDO = 0.125`
// are the two that were pinned; the handoff's own open item says the bush,
// fern, reed and pad cards never were, and that "their albedo has never been
// pinned the way the grass and leaf cards now are -- that is the same class of
// defect twice found and twice worth money."
//
// This is that measurement rather than that assertion. For every card texture
// `src/world/veg` builds, print the alpha-weighted mean *linear* luminance --
// the exact quantity `normalizeAlbedo` targets -- plus mean chroma and
// coverage, so an unpinned card can be compared against a pinned one on the
// same axis.
//
//   node src/tools/probe.mts src/tools/probes/vegalbedo.mts
const VT = await import('/world/veg/VegTextures.ts');

const toLin = (b) => { const s = b / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };

/** Alpha-weighted mean linear luminance, mean sRGB rgb and coverage of a card. */
function stat(tex) {
  const d = tex?.image?.data;
  if (!d) return null;
  let w = 0, L = 0, R = 0, G = 0, B = 0, n = 0, cov = 0;
  for (let i = 0; i < d.length; i += 4) {
    n++;
    const a = d[i + 3] / 255;
    if (a >= 0.4) cov++;
    if (a <= 0) continue;
    L += a * (0.2126 * toLin(d[i]) + 0.7152 * toLin(d[i + 1]) + 0.0722 * toLin(d[i + 2]));
    R += a * d[i]; G += a * d[i + 1]; B += a * d[i + 2];
    w += a;
  }
  if (w <= 0) return null;
  return { lum: L / w, r: R / w, g: G / w, b: B / w, cov: cov / n, px: n };
}

const rows = [];
const add = (name, tex, pinned) => {
  const s = stat(tex);
  rows.push(s
    ? `${name.padEnd(26)} ${s.lum.toFixed(4).padStart(7)}   ${s.r.toFixed(0).padStart(3)},${s.g.toFixed(0).padStart(4)},${s.b.toFixed(0).padStart(4)}   cov ${(100 * s.cov).toFixed(1).padStart(5)}%   ${pinned}`
    : `${name.padEnd(26)} (no data)`);
};

add('grassClumpTex(0)', VT.grassClumpTex(0), `pinned ${VT.GRASS_CARD_ALBEDO}`);
add('grassClumpTex(1)', VT.grassClumpTex(1), `pinned ${VT.GRASS_CARD_ALBEDO}`);
for (const k of ['broad', 'conifer', 'dry']) {
  try { add(`leafClusterTex('${k}')`, VT.leafClusterTex(k), `pinned ${VT.LEAF_CARD_ALBEDO}`); } catch (e) { rows.push(`leafClusterTex('${k}') -> ${e.message}`); }
}
add('fernTex()', VT.fernTex(), 'UNPINNED');
add('reedTex()', VT.reedTex(), 'UNPINNED');
add('padTex()', VT.padTex(), 'UNPINNED');

// The blade ring carries no map at all: its albedo is the vertex colour, and
// the pinned card targets are quoted against it. Read it off the live field so
// the comparison is against what this build actually draws.
const g = window.GAME;
const veg = g.get('Vegetation');
let bladeNote = 'blade ring: not found';
try {
  const gf = veg.grass;
  const geo = gf?.geo?.[0] || gf?.tiles?.[0]?.geometry;
  const col = geo?.getAttribute?.('color');
  if (col) {
    let s = 0;
    for (let i = 0; i < col.count; i++) s += 0.2126 * col.getX(i) + 0.7152 * col.getY(i) + 0.0722 * col.getZ(i);
    bladeNote = `blade ring vertex-colour mean luminance ${(s / col.count).toFixed(4)} over ${col.count} verts`;
  }
} catch (e) { bladeNote = `blade ring: ${e.message}`; }

return [
  'card                        lin-lum   mean sRGB rgb    coverage    pin',
  '-----------------------------------------------------------------------------',
  ...rows,
  '',
  bladeNote,
].join('\n');

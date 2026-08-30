/*
 * lane13: what CPU-side image memory the RENDERER process is still holding
 * after boot — the half of the tab that `bootprof --mem` files under
 * "unattributed".
 *
 *   node src/tools/probe.mts src/tools/_probe/cpuimages.mts
 *
 * A GPU texture lives in the gpu process. What lives HERE is whatever the
 * `Texture.image` still points at: a `DataTexture`'s typed array, an
 * `HTMLCanvasElement`'s 2D backing store, an `ImageBitmap`, plus every mip
 * level a canvas mip chain kept. Those are only free when nothing references
 * them, and a three.js `Texture` references its image for life.
 */
const g = window.GAME;
const MB = (b) => `${(b / 1e6).toFixed(1)} MB`;
const out = [];
const seenTex = new Set(), seenImg = new Set();
const kinds = new Map();
const bump = (k, bytes, n = 1) => {
  const r = kinds.get(k) || { bytes: 0, n: 0 };
  r.bytes += bytes; r.n += n; kinds.set(k, r);
};

const imgBytes = (img) => {
  if (!img) return ['none', 0];
  if (img.data && img.data.byteLength) return ['DataTexture texels', img.data.byteLength];
  if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) {
    return ['HTMLCanvasElement 2d backing', img.width * img.height * 4];
  }
  if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) {
    return ['ImageBitmap', img.width * img.height * 4];
  }
  // A texture whose texels have already been released keeps `{width, height}`
  // with `data` null -- `dropTexelsAfterUpload` does exactly that. It costs
  // nothing and must NOT be priced at w*h*4, which is how a first run of this
  // probe reported 160 MB when the true figure was 40.6.
  if (img.width) return [`released (w/h only, 0 bytes) ${img.width}x${img.height}`, 0];
  return ['unknown', 0];
};

const visit = (t) => {
  if (!t || !t.isTexture || seenTex.has(t)) return;
  seenTex.add(t);
  const imgs = Array.isArray(t.image) ? t.image : [t.image];
  for (const im of imgs) {
    if (!im || seenImg.has(im)) continue;
    seenImg.add(im);
    const [k, b] = imgBytes(im);
    bump(k, b);
  }
  // mipmaps[] is where a canvas mip chain and a compressed chain both live
  if (t.mipmaps && t.mipmaps.length) {
    for (const m of t.mipmaps) {
      if (!m || seenImg.has(m)) continue;
      seenImg.add(m);
      const [k, b] = imgBytes(m);
      bump(`mipmaps[] ${k}`, b);
    }
  }
};

g.scene.traverse((o) => {
  const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
  for (const m of mats) for (const v of Object.values(m)) visit(v);
});
visit(g.scene.environment); visit(g.scene.background);

out.push('=== CPU-side image memory still referenced by a live Texture');
const rows = [...kinds].sort((a, b) => b[1].bytes - a[1].bytes);
let tot = 0;
for (const [k, r] of rows) { out.push(`  ${String(r.n).padStart(5)} x  ${MB(r.bytes).padStart(9)}  ${k}`); tot += r.bytes; }
out.push(`  TOTAL ${MB(tot)} over ${seenTex.size} textures`);

/* every canvas in the document, whether a texture points at it or not */
let cvB = 0, cvN = 0;
for (const c of document.querySelectorAll('canvas')) { cvB += c.width * c.height * 4; cvN++; }
out.push(`\n=== <canvas> elements in the document: ${cvN}, ${MB(cvB)} of 2d/webgl backing store`);
return out.join('\n');

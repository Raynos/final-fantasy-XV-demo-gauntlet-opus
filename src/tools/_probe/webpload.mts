// Does the phone path actually read the WebP containers, and are the texels
// the same texels?
//
// A container that 404s is silent by design -- the generator takes over and
// the page is merely slower -- so "it looked fine" proves nothing. This asks
// the store directly.
const g = window.GAME;
const store = window.__TEXSTORE;
const keys = store ? [...store.index.keys()] : [];
const sample = keys.filter((k) => k.startsWith('props/')).slice(0, 3);
const rows = sample.map((k) => {
  const e = store.index.get(k);
  const px = new Uint8Array(e.buf.buffer, e.buf.byteOffset + e.off, 64);
  return { k, wh: `${e.w}x${e.h}`, first8: [...px.slice(0, 8)] };
});
return {
  ready: !!store,
  entries: keys.length,
  prefixes: [...new Set(keys.map((k) => k.split('/')[0]))],
  rows,
  tier: g.rnd.quality,
};

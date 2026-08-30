// Every WebGLRenderTarget the page owns, named, sized, and priced correctly.
//
// `bootprof.mts`'s `sizeOfRt` (bootprof.mts:76-89) is the number the plan's
// task 45 is written against, and it is wrong in three ways that all point the
// same direction -- it *understates*:
//
//  - **it ignores `samples`.** `PostFX.rtScene` is multisampled (PostFX.ts,
//    `_wantSamples`). A multisampled target is a multisampled colour
//    renderbuffer *plus* a multisampled depth renderbuffer *plus* the
//    single-sample resolve texture that every later pass reads. At 4x that is
//    ~5x the colour and ~5x the depth, not 1x.
//  - **it assumes four channels at the texture's own type.** A RedFormat
//    half-float target is 2 bytes a texel, not 8; three quarters of the bytes
//    it charges Exposure's ladder do not exist.
//  - **`depthBuffer ? 1.25 : 1` is a fudge.** A depth attachment is 4 bytes a
//    texel (DEPTH_COMPONENT24 / DEPTH24_STENCIL8, or the DepthTexture's own
//    type) regardless of what the colour costs, so it is 1.0x on an 8-bit
//    target and 0.5x on a half-float one -- never 0.25x.
//
// Two errors in opposite directions cannot be reconciled by a scale factor,
// which is exactly why this walks and prices each target instead.
//
// **A shared depth texture is charged once.** `rtVel` attaches `rtScene`'s
// depth texture (PostFX.ts) and must not be billed for it twice; the visited
// set is keyed on the texture object, not on the target.
//
// Ownership is by which root reached the target first, walked in the order
// postfx -> renderer -> shadow -> systems -> scene, so `post` claims what it
// owns and the world keeps the rest. The plan's <120 MB exit is the `post`
// subtotal; the recorded 181 MB/33 includes the world half.
const g = window.GAME;

// three's enums, spelled out because a probe body has no imports.
const T = { UB: 1009, BYTE: 1010, SHORT: 1011, USHORT: 1012, INT: 1013, UINT: 1014, FLOAT: 1015, HALF: 1016, UINT248: 1020 };
const F = { ALPHA: 1021, RGB: 1022, RGBA: 1023, LUM: 1024, LUMA: 1025, DEPTH: 1026, DEPTHSTENCIL: 1027, RED: 1028, REDINT: 1029, RG: 1030, RGINT: 1031, RGBAINT: 1033 };

const bytesPerChannel = (ty) => (
  ty === T.FLOAT || ty === T.INT || ty === T.UINT || ty === T.UINT248 ? 4
  : ty === T.HALF || ty === T.SHORT || ty === T.USHORT ? 2
  : 1
);
const channels = (fmt) => (
  fmt === F.RED || fmt === F.REDINT || fmt === F.LUM || fmt === F.ALPHA || fmt === F.DEPTH ? 1
  : fmt === F.RG || fmt === F.RGINT || fmt === F.LUMA || fmt === F.DEPTHSTENCIL ? 2
  : fmt === F.RGB ? 3
  : 4
);
const texelBytes = (t) => (t ? bytesPerChannel(t.type) * channels(t.format) : 4);

const depthSeen = new Set();

function priceRt(rt) {
  const t = rt.texture;
  const w = rt.width || (t && t.image && t.image.width) || 0;
  const h = rt.height || (t && t.image && t.image.height) || 0;
  if (!w || !h) return null;
  const px = w * h * (rt.depth && rt.depth > 1 ? rt.depth : 1);
  const n = (rt.textures && rt.textures.length) || 1;
  // A depth-format colour attachment (a shadow map) is its own depth; do not
  // then charge it a second depth buffer below.
  const colorIsDepth = t && (t.format === F.DEPTH || t.format === F.DEPTHSTENCIL || t.isDepthTexture);
  const perTexel = texelBytes(t);
  const color = px * perTexel * n;

  let depth = 0;
  const dt = rt.depthTexture;
  if (dt) {
    // Shared: `rtVel` attaches `rtScene`'s. Bill it to whoever gets there first.
    if (!depthSeen.has(dt)) { depthSeen.add(dt); depth = px * texelBytes(dt); }
  } else if (rt.depthBuffer && !colorIsDepth) {
    depth = px * (rt.stencilBuffer ? 4 : 4); // DEPTH_COMPONENT24 and DEPTH24_STENCIL8 are both 4
  }

  // Multisample: the resolve texture above still exists, and the multisampled
  // colour + depth renderbuffers sit beside it. The depth side is charged even
  // when the resolve depth was billed to somebody else -- these are different
  // allocations.
  const s = rt.samples || 0;
  let ms = 0;
  if (s > 1) {
    const msDepthTexel = dt ? texelBytes(dt) : (rt.depthBuffer ? 4 : 0);
    ms = px * perTexel * n * s + px * msDepthTexel * s;
  }
  return { w, h, n, samples: s, depthAttached: !!dt || !!rt.depthBuffer, color, depth, ms, total: color + depth + ms };
}

const rows = [];
const seen = new Set();

function walk(root, owner, label) {
  const vis = new Set();
  const q = [[root, label, 0]];
  while (q.length) {
    const [o, path, d] = q.shift();
    if (!o || typeof o !== 'object' || vis.has(o) || d > 5) continue;
    vis.add(o);
    if (vis.size > 20000) break;
    if (o.isRenderTarget || o.isWebGLRenderTarget) {
      if (!seen.has(o)) {
        seen.add(o);
        const p = priceRt(o);
        if (p) rows.push(Object.assign({ owner, path, name: (o.texture && o.texture.name) || '' }, p));
      }
      continue;
    }
    if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) q.push([o[i], path + '[' + i + ']', d + 1]); continue; }
    if (o.isTexture || o.isMaterial || o.isBufferGeometry) continue;
    for (const k in o) {
      if (k === 'parent' || k === 'children' || k === 'scene' || k === 'renderer' || k === 'game' || k === 'fx') continue;
      let v;
      try { v = o[k]; } catch { continue; }
      if (v && typeof v === 'object') q.push([v, path + '.' + k, d + 1]);
    }
  }
}

walk(g.post, 'post', 'post');
walk(g.rnd, 'renderer', 'rnd');
walk(g.renderer.shadowMap, 'shadow', 'shadowMap');
for (const [k, s] of g._registry) { if (s && typeof s === 'object') walk(s, 'world', k); }
g.scene.traverse((o) => { if (o.shadow && o.shadow.map) walk(o.shadow.map, 'shadow', 'light:' + (o.name || o.type)); });
walk(g.scene, 'world', 'scene');

rows.sort((a, b) => b.total - a.total);
const MB = (b) => +(b / 1048576).toFixed(2);
const by = {};
for (const r of rows) { const o = (by[r.owner] || (by[r.owner] = { mb: 0, n: 0 })); o.mb += r.total; o.n++; }
for (const k in by) by[k].mb = MB(by[k].mb);

return {
  dpr: g.renderer.getPixelRatio(),
  drawing: g.renderer.getContext().drawingBufferWidth + 'x' + g.renderer.getContext().drawingBufferHeight,
  quality: g.rnd ? g.rnd.quality : '?',
  totalMB: MB(rows.reduce((s, r) => s + r.total, 0)),
  byOwner: by,
  rows: rows.map((r) => ({
    path: r.path + (r.name ? ' <' + r.name + '>' : ''),
    own: r.owner,
    px: r.w + 'x' + r.h + (r.n > 1 ? ' x' + r.n : '') + (r.samples > 1 ? ' MSAA' + r.samples : ''),
    colorMB: MB(r.color), depthMB: MB(r.depth), msaaMB: MB(r.ms), MB: MB(r.total),
  })),
};

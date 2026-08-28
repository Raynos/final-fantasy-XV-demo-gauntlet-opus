// How many alpha-map texels does one on-screen pixel of near foliage get?
//
// `docs/plans/2026-08-26-opus-the-standing-backlog.md` WS-3.3 says the near
// ring's leaf cards "are still chunky at 8x -- no longer an AA defect but the
// alpha map's own texel resolution and mip chain", and that `alphaRef` is
// therefore the wrong reference for `VegTextures.buildAlphaMips`. That is a
// claim with a number in it and nobody had taken the number.
//
// The number is **texels per screen pixel**, measured the only way that is not
// a guess: per triangle, from the geometry's own UVs.
//
//   texel/px = (|duv| * texSize) / screenPixels(|dp|)
//
// A bounding box cannot answer this -- a crown mesh is dozens of cards merged
// into one geometry, each carrying the whole 0..1 UV square, so its box is
// tens of times the size of one card. Per-triangle UV length is the card.
//
//   > 1  minified. The mip chain and its coverage-preserving alpha scale are
//        doing the work, and `alphaRef` is the right question to ask of them.
//   < 1  MAGNIFIED. Mip 0 is the only level sampled, `magFilter` is the only
//        filter running, and one texel is smeared over more than one pixel.
//        No AA, no coverage resolve and no mip policy can put back detail the
//        source canvas never drew. The fix at that end is texel count.
//
// Run: node src/tools/probe.mts src/tools/probes/leaftexel.mts
//      SHOTS=zone_fallgrove,hero_full node src/tools/probe.mts ...
const g = window.GAME;
const shots = (window.__SHOTS || 'zone_fallgrove,zone_nebulawood,hero_full').split(',');
const TRIS = 24;        // triangles sampled per geometry
const INSTS = 64;       // instances sampled per instanced mesh

function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; }

function survey(shot) {
  g.applyShot(shot);
  g.settle(70);
  g.applyShot(shot);
  g.settle(6);
  const cam = g.camera;
  cam.updateMatrixWorld(true);
  g.scene.updateMatrixWorld(true);
  const vh = g.renderer.domElement.height;
  const tanHalf = Math.tan((cam.fov * Math.PI) / 360);
  const pxPerWorld = (d) => vh / (2 * tanHalf * Math.max(d, 0.01));
  const cw = cam.matrixWorld.elements;
  const cx = cw[12], cy = cw[13], cz = cw[14];

  const kinds = {};
  g.scene.traverse((o) => {
    if (!o.visible || !o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || !m.map || !(m.alphaTest > 0)) continue;
      const img = m.map.image;
      const tex = (img && (img.width || img.naturalWidth)) || 0;
      const geo = o.geometry;
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      if (!tex || !pos || !uv) continue;

      // Median |duv|/|dp| over a spread of triangles: texels per world unit,
      // divided by the texture size. Scale-free, so it can be evaluated once
      // per geometry and multiplied by each instance's scale and distance.
      const ratios = [];
      const idx = geo.index;
      const triCount = (idx ? idx.count : pos.count) / 3;
      const stride = Math.max(1, Math.floor(triCount / TRIS));
      for (let t = 0; t < triCount; t += stride) {
        const a = idx ? idx.getX(t * 3) : t * 3;
        const b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const dp = Math.hypot(pos.getX(b) - pos.getX(a), pos.getY(b) - pos.getY(a), pos.getZ(b) - pos.getZ(a));
        const du = Math.hypot(uv.getX(b) - uv.getX(a), uv.getY(b) - uv.getY(a));
        if (dp > 1e-6 && du > 1e-6) ratios.push(du / dp);
      }
      const uvPerWorld = median(ratios);
      if (!uvPerWorld) continue;

      const key = `${o.name || o.type}|${tex}`;
      const k = kinds[key] || (kinds[key] = { tex, aniso: m.map.anisotropy || 1,
        mips: (m.map.mipmaps && m.map.mipmaps.length) || 0, alphaTest: +m.alphaTest.toFixed(3),
        n: 0, best: 1e9, bestD: 0 });

      const consider = (scale, wx, wy, wz) => {
        k.n++;
        const d = Math.hypot(wx - cx, wy - cy, wz - cz);
        // texels across one world unit / pixels across one world unit
        const tpp = (uvPerWorld / scale) * tex / pxPerWorld(d);
        if (tpp < k.best) { k.best = tpp; k.bestD = d; }
      };
      const e = o.matrixWorld.elements;
      const oScale = Math.hypot(e[0], e[1], e[2]) || 1;
      if (o.isInstancedMesh) {
        const tmp = new o.matrixWorld.constructor();
        const step = Math.max(1, Math.floor(o.count / INSTS));
        for (let i = 0; i < o.count; i += step) {
          o.getMatrixAt(i, tmp); tmp.premultiply(o.matrixWorld);
          const te = tmp.elements;
          consider(Math.hypot(te[0], te[1], te[2]) || 1, te[12], te[13], te[14]);
        }
      } else consider(oScale, e[12], e[13], e[14]);
    }
  });
  return { shot, kinds: Object.entries(kinds).map(([kk, v]) => ({ kind: kk, n: v.n, tex: v.tex,
    aniso: v.aniso, mips: v.mips, alphaTest: v.alphaTest,
    nearestD: +v.bestD.toFixed(1), texelPerPx: +v.best.toFixed(2) }))
    .sort((a, b) => a.texelPerPx - b.texelPerPx) };
}

return shots.map(survey);

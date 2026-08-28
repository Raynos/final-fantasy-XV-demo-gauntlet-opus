// What actually differentiates the 271 shader programs this page holds?
//
// `material.program` is undefined in three 0.185, so the oracle is
// `renderer.info.programs` -- every WebGLProgram the renderer has built, each
// carrying the `cacheKey` three itself derived from `WebGLPrograms.getParameters`.
//
// That key is `array.join()` -- comma-separated -- with a FIXED-LENGTH TAIL:
//   48 scalar parameters, 2 boolean bitmasks, outputColorSpace, customProgramCacheKey
// = 52 tokens for every non-RawShaderMaterial. The head is the shaderID (or two
// custom shader ids) plus `name,value` for each #define.
//
// **Parsing from the end does not work**: three's DEFAULT `customProgramCacheKey`
// is `this.onBeforeCompile.toString()`, and a stringified function is full of
// commas -- 44 of 271 rows misparse that way. So anchor FORWARD on the first
// GLSL precision qualifier, which is the first token of the tail.
//
// Then the question "what multiplies the programs" is exact: for each field,
// how many distinct values, and how many programs collapse if it were held
// constant. The `equivalence` block is the interesting one -- it asks how many
// programs are the SAME program modulo one deferred patch.
//
// Run: node src/tools/probe.mts src/tools/probes/progkeys.mts --dirty
const g = window.GAME;
const PARAMS = ['precision', 'outColorSpace', 'envMapMode', 'envMapCubeUVHeight', 'mapUv', 'alphaMapUv', 'lightMapUv', 'aoMapUv', 'bumpMapUv', 'normalMapUv', 'displacementMapUv', 'emissiveMapUv', 'metalnessMapUv', 'roughnessMapUv', 'anisotropyMapUv', 'clearcoatMapUv', 'clearcoatNormalMapUv', 'clearcoatRoughnessMapUv', 'iridescenceMapUv', 'iridescenceThicknessMapUv', 'sheenColorMapUv', 'sheenRoughnessMapUv', 'specularMapUv', 'specularColorMapUv', 'specularIntensityMapUv', 'transmissionMapUv', 'thicknessMapUv', 'combine', 'fogExp2', 'sizeAttenuation', 'morphTargetsCount', 'morphAttributeCount', 'numDirLights', 'numPointLights', 'numSpotLights', 'numSpotLightMaps', 'numHemiLights', 'numRectAreaLights', 'numDirLightShadows', 'numPointLightShadows', 'numSpotLightShadows', 'numSpotLightShadowsWithMaps', 'numLightProbes', 'shadowMapType', 'toneMapping', 'numClippingPlanes', 'numClipIntersection', 'depthPacking'];
const BITS_A = ['instancing', 'instancingColor', 'instancingMorph', 'matcap', 'envMap', 'normalMapObjectSpace', 'normalMapTangentSpace', 'clearcoat', 'iridescence', 'alphaTest', 'vertexColors', 'vertexAlphas', 'vertexUv1s', 'vertexUv2s', 'vertexUv3s', 'vertexTangents', 'anisotropy', 'alphaHash', 'batching', 'dispersion', 'batchingColor', 'gradientMap', 'packedNormalMap', 'vertexNormals'];
const BITS_B = ['fog', 'useFog', 'flatShading', 'logarithmicDepthBuffer', 'reversedDepthBuffer', 'skinning', 'morphTargets', 'morphNormals', 'morphColors', 'premultipliedAlpha', 'shadowMapEnabled', 'doubleSided', 'flipSided', 'useDepthPacking', 'dithering', 'transmission', 'sheen', 'opaque', 'pointsUvs', 'decodeVideoTexture', 'decodeVideoTextureEmissive', 'alphaToCoverage', 'lightProbeGrids', 'hasPositionAttribute'];
const TAIL = PARAMS.length + 4;
const PREC = { highp: 1, mediump: 1, lowp: 1 };

function decode(cacheKey) {
  const t = String(cacheKey).split(',');
  let base = -1;
  for (let i = 0; i < t.length - TAIL + 1; i++) {
    if (PREC[t[i]] && (t.length - i) >= TAIL) { base = i; break; }
  }
  if (base < 0) return null;
  const f = {};
  for (let i = 0; i < PARAMS.length; i++) f[PARAMS[i]] = t[base + i];
  const mA = Number(t[base + PARAMS.length]) | 0;
  const mB = Number(t[base + PARAMS.length + 1]) | 0;
  for (let i = 0; i < BITS_A.length; i++) f[BITS_A[i]] = (mA & (1 << i)) ? 1 : 0;
  for (let i = 0; i < BITS_B.length; i++) f[BITS_B[i]] = (mB & (1 << i)) ? 1 : 0;
  f.__space = t[base + PARAMS.length + 2];
  f.__custom = t.slice(base + PARAMS.length + 3).join(',');
  f.__head = t.slice(0, base).join(',');
  return f;
}

const progs = g.renderer.info.programs || [];
const ok = [];
let bad = 0;
for (const p of progs) {
  const f = decode(p.cacheKey);
  if (!f) { bad++; continue; }
  ok.push({ name: p.name, used: p.usedTimes, f });
}

const FIELDS = PARAMS.concat(BITS_A, BITS_B, ['__space', '__custom', '__head']);
const sig = (r, drop, xf) => FIELDS.filter((k) => k !== drop)
  .map((k) => { const v = r.f[k] === undefined ? '' : String(r.f[k]); return xf ? xf(k, v) : v; }).join('|');

const distinctAll = new Set(ok.map((r) => sig(r))).size;

// ---- per-field variety and the single-field collapse test -------------------
const varying = [];
for (const k of FIELDS) {
  const h = {};
  for (const r of ok) { const v = String(r.f[k]); h[v] = (h[v] || 0) + 1; }
  if (Object.keys(h).length > 1) {
    varying.push({ field: k, distinct: Object.keys(h).length, hist: k === '__custom' || k === '__head' ? undefined : h });
  }
}
const collapse = varying.map((v) => {
  const s = new Set(ok.map((r) => sig(r, v.field)));
  return { field: v.field, distinct: v.distinct, remaining: s.size, saves: distinctAll - s.size };
});
collapse.sort((a, b) => b.saves - a.saves);

// ---- equivalence classes: the same program modulo ONE deferred patch --------
// Each transform answers "if this patch had been applied before the first
// compile instead of after it, how many programs would there be?"
const CSM_RE = /,?USE_CSM,1,CSM_CASCADES,\d+,CSM_FADE,/g;
/** Separate, non-global: a `/g` regex carries `lastIndex` across `.test()`. */
const CSM_TEST = /USE_CSM/;
const TRANSFORMS = {
  // three compiles a different program for a render target (srgb-linear) than
  // for the canvas (srgb). Warmup's `renderer.compile()` runs with no target
  // bound; the render that follows it binds a 64x64 target.
  colorSpace: (k, v) => (k === '__space' || k === 'outColorSpace') ? 'X' : v,
  // world/sky/MaterialPatch prepends 'atmo1|' -- but only once it has SCANNED
  // the material, so anything compiled before the scan has a twin without it.
  atmoPatch: (k, v) => k === '__custom' ? v.replace(/^atmo1\|/, '') : v,
  // three-csm injects USE_CSM/CSM_CASCADES/CSM_FADE into the material's defines
  // when it adopts it -- again, after some materials have already compiled.
  csmDefines: (k, v) => k === '__head' ? v.replace(CSM_RE, '') : v,
  // per-INSTANCE ids inside a cache key: each eye, each worn texture uuid and
  // each procedurally-named metal gets its own program for identical GLSL.
  instanceIds: (k, v) => (k === '__custom')
    ? v.replace(/char2-eye\d+/g, 'char2-eye').replace(/wear:[0-9a-f-]+/gi, 'wear').replace(/([A-Za-z]+)\d{4,}/g, '$1')
    : v,
  // three's DEFAULT customProgramCacheKey is onBeforeCompile.toString(): two
  // materials with byte-identical patch functions still key apart if the
  // closure text differs. Collapse every default key to one token.
  onBeforeCompileText: (k, v) => k === '__custom'
    ? (/(function|=>|\{)/.test(v) && !/^atmo1\|/.test(v) ? 'FN' : v) : v,
};
const equivalence = {};
for (const [nm, xf] of Object.entries(TRANSFORMS)) {
  const s = new Set(ok.map((r) => sig(r, null, xf)));
  equivalence[nm] = { remaining: s.size, saves: distinctAll - s.size };
}
// all of them at once
{
  const all = (k, v) => Object.values(TRANSFORMS).reduce((acc, f) => f(k, acc), v);
  const s = new Set(ok.map((r) => sig(r, null, all)));
  equivalence.ALL = { remaining: s.size, saves: distinctAll - s.size };
}

// ---- the two big cross-tabs, so the causes are readable ---------------------
const xtab = (fn) => { const h = {}; for (const r of ok) { const k = fn(r); h[k] = (h[k] || 0) + 1; } return h; };
const shaderKind = (r) => (r.f.__head.split(',')[0] || '?');

return {
  totalPrograms: progs.length,
  undecodable: bad,
  distinctAll,
  equivalence,
  collapse: collapse.slice(0, 22),
  bySpace: xtab((r) => r.f.__space),
  byShaderKind: xtab(shaderKind),
  csmXspace: xtab((r) => (CSM_TEST.test(r.f.__head) ? 'csm' : 'nocsm') + '/' + r.f.__space + '/' + shaderKind(r)),
  atmoXspace: xtab((r) => (/^atmo1\|/.test(r.f.__custom) ? 'atmo' : 'bare') + '/' + r.f.__space),
  customKeys: xtab((r) => r.f.__custom.slice(0, 60)),
  warmup: g.post && g.post.warmupReport ? g.post.warmupReport : null,
};

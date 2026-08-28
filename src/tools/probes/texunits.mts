// Which material asks for a 17th texture unit?
//
// Every page in this repo prints `THREE.WebGLTextures: Trying to use 16 texture
// units while this GPU supports only 16`, dozens of times a frame, and it has
// been carried as "unaddressed" through three plans. It is not cosmetic:
// three's `allocateTextureUnit` warns and then RETURNS 16 anyway, which is not
// a valid unit on a GPU whose `maxTextures` is 16 (0..15), so the sampler that
// gets it is reading from a unit nothing can be bound to. It is also the stated
// reason PCSS was closed as impossible.
//
// `probes/samplercount.mts` tried to answer this from `material.program` and
// came back empty -- `material.program` is `undefined` in three 0.185. This
// asks the renderer instead: three emits the warning from inside
// `setProgram`/`refreshUniforms`, which run inside `renderBufferDirect`, so the
// material being drawn when the warning fires IS the material asking.
//
// Run: node src/tools/probe.mts src/tools/probes/texunits.mts --set __TU_SHOT=town_forecourt
const g = window.GAME;
const SHOT = String(window.__TU_SHOT || 'town_forecourt');
g.resetClock();
g.applyShot(SHOT); g.settle(60);
g.applyShot(SHOT); g.settle(7);

const renderer = g.renderer;
let cur = null;
const hits = new Map();
const origWarn = console.warn;
console.warn = function (...a) {
  const msg = String(a[0] || '');
  if (msg.indexOf('texture units') !== -1) {
    const key = cur ? (cur.mat + ' | ' + cur.type + ' | ' + cur.obj) : '(outside a draw)';
    hits.set(key, (hits.get(key) || 0) + 1);
    return;                      // swallow: this fires dozens of times a frame
  }
  return origWarn.apply(this, a);
};

const rbdOrig = renderer.renderBufferDirect.bind(renderer);
renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
  cur = {
    mat: (material && (material.name || '(unnamed)')),
    type: (material && material.type),
    obj: (object && (object.name || object.type)),
  };
  try { return rbdOrig(camera, scene, geometry, material, object, group); } finally { cur = null; }
};

g.settle(1);

renderer.renderBufferDirect = rbdOrig;
console.warn = origWarn;

const gl = renderer.getContext();
return {
  shot: SHOT,
  maxTextures: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
  maxCombined: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
  totalWarnings: [...hits.values()].reduce((a, b) => a + b, 0),
  culprits: [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([k, n]) => n + '  ' + k),
};

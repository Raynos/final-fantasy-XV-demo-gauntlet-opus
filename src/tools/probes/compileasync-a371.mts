// Would `renderer.compileAsync` make the 1,744 ms shader warm-up cheaper?
//
// Builds two batches of N materials that are identical except for a `#define`
// nobody reads — which is enough to give each one its own program key, so each
// batch really does compile N programs — and times `compile` against
// `compileAsync` on the same content.
const g = window.GAME;
const r = g.renderer;
const THREE = g.scene.constructor.prototype.constructor === undefined ? null : null;
const out = [];

const gl = r.getContext();
const ext = gl.getExtension('KHR_parallel_shader_compile');
out.push(`KHR_parallel_shader_compile: ${ext ? 'present' : 'ABSENT'}`);

// A material from the live world, so the programs are as expensive as the real
// ones rather than a bare MeshBasicMaterial.
let donor = null;
g.scene.traverse((o) => { if (!donor && o.material && o.material.isMeshStandardMaterial && o.material.map) donor = o.material; });
if (!donor) return 'no donor material found';

const Scene = g.scene.constructor;
const N = 24;

function batch(tag) {
  const s = new Scene();
  const proto = g.scene.children.find((c) => c.isLight);
  if (proto) s.add(proto.clone());
  const geoOwner = [];
  g.scene.traverse((o) => { if (geoOwner.length < 1 && o.geometry && o.isMesh) geoOwner.push(o); });
  for (let i = 0; i < N; i++) {
    const m = donor.clone();
    m.defines = { ...(donor.defines || {}), [`WARM_${tag}_${i}`]: 1 };
    m.needsUpdate = true;
    const mesh = new geoOwner[0].constructor(geoOwner[0].geometry, m);
    s.add(mesh);
  }
  return s;
}

const before = r.info.programs.length;
const sa = batch('S');
let t = performance.now();
r.compile(sa, g.camera);
const syncMs = performance.now() - t;
const syncProgs = r.info.programs.length - before;

const b2 = r.info.programs.length;
const sb = batch('A');
t = performance.now();
await r.compileAsync(sb, g.camera);
const asyncMs = performance.now() - t;
const asyncProgs = r.info.programs.length - b2;

out.push(`compile      ${syncMs.toFixed(0)} ms for ${syncProgs} programs  (${(syncMs / Math.max(1, syncProgs)).toFixed(1)} ms each)`);
out.push(`compileAsync ${asyncMs.toFixed(0)} ms for ${asyncProgs} programs  (${(asyncMs / Math.max(1, asyncProgs)).toFixed(1)} ms each)`);
return out.join('\n');

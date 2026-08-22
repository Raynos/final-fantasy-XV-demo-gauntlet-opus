// Attribute the resident heap: CPU-side texel arrays vs geometry attribute
// arrays vs everything else. Walks the live scene graph only (no module
// re-imports), so the numbers are what the shipped page actually holds.
const out = [];
const g = window.GAME;

const texSeen = new Set(), geoSeen = new Set();
let texBytes = 0, texCount = 0, canvasBytes = 0, canvasCount = 0;
let geoBytes = 0, geoCount = 0, idxBytes = 0;
const bySize = new Map();

function addTex(t) {
  if (!t || texSeen.has(t)) return;
  texSeen.add(t);
  const img = t.image;
  if (!img) return;
  if (img.data && img.data.byteLength) {
    texBytes += img.data.byteLength; texCount++;
    const k = `${img.width}x${img.height}`;
    bySize.set(k, (bySize.get(k) || 0) + 1);
  } else if (img.width) {
    // CanvasTexture / ImageBitmap: the pixels live outside the JS heap.
    canvasBytes += img.width * img.height * 4; canvasCount++;
  }
}
function addMat(m) {
  if (!m) return;
  for (const k in m) { const v = m[k]; if (v && v.isTexture) addTex(v); }
  if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) addTex(v); }
}
function addGeo(geo) {
  if (!geo || geoSeen.has(geo)) return;
  geoSeen.add(geo); geoCount++;
  for (const name in geo.attributes) {
    const a = geo.attributes[name];
    if (a && a.array) geoBytes += a.array.byteLength;
  }
  if (geo.index && geo.index.array) idxBytes += geo.index.array.byteLength;
}

g.scene.traverse((o) => {
  if (o.geometry) addGeo(o.geometry);
  const m = o.material;
  if (Array.isArray(m)) m.forEach(addMat); else addMat(m);
});
addTex(g.scene.environment); addTex(g.scene.background);

const mem = performance.memory
  ? { used: (performance.memory.usedJSHeapSize / 1e6).toFixed(1), total: (performance.memory.totalJSHeapSize / 1e6).toFixed(1) }
  : null;

out.push(`JS heap: used ${mem ? mem.used : '?'} MB / total ${mem ? mem.total : '?'} MB`);
out.push(`DataTexture CPU arrays: ${texCount} textures, ${(texBytes / 1e6).toFixed(1)} MB on the JS heap`);
out.push(`Canvas/Image textures: ${canvasCount}, ~${(canvasBytes / 1e6).toFixed(1)} MB off-heap`);
out.push(`Geometry attributes: ${geoCount} geometries, ${(geoBytes / 1e6).toFixed(1)} MB attrs + ${(idxBytes / 1e6).toFixed(1)} MB index`);
out.push(`renderer.info.memory ${JSON.stringify(g.renderer.info.memory)}, programs ${g.renderer.info.programs?.length}`);
const sizes = [...bySize.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
out.push('DataTexture sizes: ' + sizes.map(([k, n]) => `${k}x${n}`).join('  '));
return out.join('\n');

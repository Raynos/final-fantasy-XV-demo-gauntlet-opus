/*
 * WHERE the resident memory is, by owner — the named buckets `project/TODO.md`
 * line 2 has been waiting for.
 *
 *   node src/tools/probe.mts src/tools/probes/memowners.mts
 *
 * `bootprof.mts --mem` prices the whole page and splits it into JS heap / GPU /
 * process overhead. That is the right top-level split and it is not actionable:
 * "260 MB of geometry attributes" names no file. This walks the same scene and
 * attributes every byte to the **top-level scene child** that owns it, which
 * maps one-to-one onto a system in `src/world/`, then lists the individual
 * geometries and textures big enough to matter on their own.
 *
 * Three things it deliberately does NOT do:
 *
 *  - It does not trust `performance.memory`. `Runtime.getHeapUsage` (CDP, from
 *    outside) and `performance.memory` disagree by an order of magnitude on this
 *    build, so both are printed with a known-size control allocation between
 *    them: allocate N MB of `Float32Array`, re-read, and see which one moves.
 *    A typed array's backing store is EXTERNAL to the V8 heap, and that is the
 *    whole reason the two oracles can both be right and both be useless alone.
 *  - It does not count a geometry twice. An `InstancedMesh` of 40 000 rocks
 *    holds ONE geometry; its per-instance matrices are a separate, much smaller
 *    bucket and are reported as such.
 *  - It does not confuse the CPU array with the GPU copy. Every
 *    `BufferAttribute` here is resident TWICE — once as a JS typed array and
 *    once as a GL buffer — unless something called `setUsage`/disposed it.
 */
const g = window.GAME;
const out = [];
const MB = (b) => `${(b / 1e6).toFixed(1)} MB`;

/* ---- 1. the oracle control ------------------------------------------- */
// Read before, allocate a known amount, read after. Printed so the caller can
// see which of the two numbers moved by 200 MB and which did not move at all.
const pm = () => (performance.memory ? performance.memory.usedJSHeapSize : 0);
const before = pm();
const ballast = [];
for (let i = 0; i < 50; i++) ballast.push(new Float32Array(1e6)); // 200 MB exactly
const after = pm();
out.push(`oracle control: allocated 200.0 MB of Float32Array`);
out.push(`  performance.memory.usedJSHeapSize  ${MB(before)} -> ${MB(after)}   (moved ${MB(after - before)})`);
out.push('  (the CDP Runtime.getHeapUsage half of this pair is printed by bootprof --mem)');
ballast.length = 0;

/* ---- 2. every byte, by owning scene subtree --------------------------- */
const geoSeen = new Set(), texSeen = new Set();
/** Per top-level scene child: geometry bytes, texture bytes, counts. */
const owners = new Map();
/** The individual geometries worth naming. */
const bigGeo = [];
/** The individual textures worth naming. */
const bigTex = [];

const texBytes = (t) => {
  const img = t.image;
  if (!img || !img.width) return { gpu: 0, cpu: 0 };
  const mip = t.generateMipmaps === false ? 1 : 4 / 3;
  const cpu = img.data && img.data.byteLength ? img.data.byteLength : 0;
  return { gpu: img.width * img.height * 4 * mip, cpu };
};

const bucket = (name) => {
  let b = owners.get(name);
  if (!b) { owners.set(name, b = { name, geo: 0, idx: 0, inst: 0, tex: 0, cpuTex: 0, geos: 0, meshes: 0, verts: 0 }); }
  return b;
};

for (const top of g.scene.children) {
  const label = top.name || top.type;
  const b = bucket(label);
  top.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh && !o.isLineSegments && !o.isPoints && !o.isSkinnedMesh) {
      // Lights still own a shadow map, which is real GPU memory.
      const sm = o.shadow && o.shadow.map;
      if (sm && sm.texture && !texSeen.has(sm.texture)) {
        texSeen.add(sm.texture);
        const w = sm.width || 0, h = sm.height || 0;
        b.tex += w * h * 4;
      }
      return;
    }
    b.meshes++;
    const geo = o.geometry;
    if (geo && !geoSeen.has(geo)) {
      geoSeen.add(geo);
      b.geos++;
      let bytes = 0;
      for (const nm in geo.attributes) {
        const a = geo.attributes[nm];
        if (!a || !a.array) continue;
        // `instanceMatrix`/`instanceColor` live on the mesh, not the geometry,
        // so anything in `geo.attributes` is genuine per-vertex data.
        bytes += a.array.byteLength;
      }
      const idx = geo.index && geo.index.array ? geo.index.array.byteLength : 0;
      const verts = geo.attributes.position ? geo.attributes.position.count : 0;
      b.geo += bytes; b.idx += idx; b.verts += verts;
      if (bytes + idx > 2e6) {
        bigGeo.push({ owner: label, name: o.name || geo.name || o.type, bytes: bytes + idx, verts });
      }
    }
    if (o.isInstancedMesh) {
      if (o.instanceMatrix && o.instanceMatrix.array) b.inst += o.instanceMatrix.array.byteLength;
      if (o.instanceColor && o.instanceColor.array) b.inst += o.instanceColor.array.byteLength;
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      const addT = (t) => {
        if (!t || !t.isTexture || texSeen.has(t)) return;
        texSeen.add(t);
        const { gpu, cpu } = texBytes(t);
        b.tex += gpu; b.cpuTex += cpu;
        if (gpu > 4e6) bigTex.push({ owner: label, name: t.name || `${t.image.width}x${t.image.height}`, gpu, cpu });
      };
      for (const k in m) { const v = m[k]; if (v && v.isTexture) addT(v); }
      if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) addT(v); }
    }
  });
}

const rows = [...owners.values()].filter((b) => b.geo + b.idx + b.tex + b.inst > 1e6);
rows.sort((a, b) => (b.geo + b.idx + b.tex + b.inst) - (a.geo + a.idx + a.tex + a.inst));
let tg = 0, ti = 0, tt = 0, tc = 0, tn = 0, tv = 0;
out.push('');
out.push('=== resident bytes by top-level scene child (CPU-side typed arrays; each is also resident on the GPU)');
out.push('  owner                         vertex     index  instance   texture   geos    verts');
for (const b of rows) {
  tg += b.geo; ti += b.idx; tt += b.tex; tc += b.cpuTex; tn += b.inst; tv += b.verts;
  out.push(`  ${b.name.slice(0, 26).padEnd(28)}${MB(b.geo).padStart(9)}${MB(b.idx).padStart(10)}`
    + `${MB(b.inst).padStart(10)}${MB(b.tex).padStart(10)}${String(b.geos).padStart(7)}${String(b.verts).padStart(9)}`);
}
out.push(`  ${'TOTAL'.padEnd(28)}${MB(tg).padStart(9)}${MB(ti).padStart(10)}${MB(tn).padStart(10)}${MB(tt).padStart(10)}`
  + `${String(geoSeen.size).padStart(7)}${String(tv).padStart(9)}`);
out.push(`  CPU texel arrays still held after upload: ${MB(tc)}`);

out.push('');
out.push('=== single geometries over 2 MB');
bigGeo.sort((a, b) => b.bytes - a.bytes);
for (const x of bigGeo.slice(0, 25)) {
  out.push(`  ${MB(x.bytes).padStart(9)}  ${String(x.verts).padStart(9)} verts  ${x.owner} / ${x.name}`);
}
out.push(`  ${bigGeo.length} geometries over 2 MB, ${MB(bigGeo.reduce((s, x) => s + x.bytes, 0))} between them`);

out.push('');
out.push('=== single textures over 4 MB (GPU bytes incl. mips)');
bigTex.sort((a, b) => b.gpu - a.gpu);
for (const x of bigTex.slice(0, 20)) {
  out.push(`  ${MB(x.gpu).padStart(9)}  cpu ${MB(x.cpu).padStart(9)}  ${x.owner} / ${x.name}`);
}

/* ---- 3. what a vertex costs here -------------------------------------- */
// The ratio matters more than the total: at 3.7 M vertices, every extra
// attribute is another 3.7 M x 4 x components bytes, and this repo's geometry
// carries far more than position+normal+uv.
const attrHist = new Map();
for (const geo of geoSeen) {
  for (const nm in geo.attributes) {
    const a = geo.attributes[nm];
    if (!a || !a.array) continue;
    const key = `${nm} (${a.itemSize}x ${a.array.constructor.name})`;
    attrHist.set(key, (attrHist.get(key) || 0) + a.array.byteLength);
  }
}
out.push('');
out.push('=== the same vertex bytes, by ATTRIBUTE — what each vertex is carrying');
const ah = [...attrHist.entries()].sort((a, b) => b[1] - a[1]);
for (const [k, v] of ah.slice(0, 16)) out.push(`  ${MB(v).padStart(9)}  ${k}`);

return out.join('\n');

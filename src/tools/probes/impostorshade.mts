// What does an impostor card's *shading* actually depend on?
//
// `billboardGeo` used to give all eight vertices of the two crossed quads one
// constant object-space normal, (0, 0.62, 0.78). An InstancedMesh rotates that
// by the per-instance yaw, so every impostor was flat-shaded by a single N·L
// that is a pure function of the tree's random yaw. A real crown's normals span
// the sphere, so its *mean* lambert term is nearly the same for every tree; a
// card with one normal cannot be.
//
// This reports, per LOD tier, the distribution of each instance's *mean*
// lambert term. The geometry ring is the reference: whatever the cards do, they
// should do it with the same mean and a comparable spread. Where a material
// carries a crown normal map (`material.userData.crownNormal`) the texels are
// sampled and weighted by the albedo card's own alpha, in the same
// view-aligned frame the shader builds, so the two tiers are measured like for
// like rather than one by its vertices and the other by its texture.
const g = window.GAME;
const SHOT = 'zone_fallgrove';
g.applyShot(SHOT);
g.settle(60);
g.applyShot(SHOT);
g.settle(8);

const V3 = g.camera.position.constructor;
const M4 = g.camera.matrixWorld.constructor;
const M3 = g.camera.normalMatrix.constructor;

let sun = null;
g.scene.traverse((o) => { if (o.isDirectionalLight && !sun) sun = o; });
const L = new V3().copy(sun.position).sub(sun.target.position).normalize();
const camPos = g.camera.position;

const out = { shot: SHOT, sun: [+L.x.toFixed(3), +L.y.toFixed(3), +L.z.toFixed(3)] };

function stats(a) {
  if (!a.length) return null;
  a = a.slice().sort((x, y) => x - y);
  const mean = a.reduce((s, v) => s + v, 0) / a.length;
  const sd = Math.sqrt(a.reduce((s, v) => s + (v - mean) * (v - mean), 0) / a.length);
  return {
    n: a.length, min: +a[0].toFixed(3), p10: +a[(a.length * 0.1) | 0].toFixed(3),
    p50: +a[(a.length * 0.5) | 0].toFixed(3), p90: +a[(a.length * 0.9) | 0].toFixed(3),
    max: +a[a.length - 1].toFixed(3), mean: +mean.toFixed(3), sd: +sd.toFixed(3),
  };
}

// Pre-sample each crown-normal texture on a coarse grid, keeping the albedo
// card's alpha as the weight. One pass per texture, not per instance.
const nsamples = new Map();
function crownSamples(mat) {
  const cn = mat && mat.userData && mat.userData.crownNormal;
  if (!cn) return null;
  if (nsamples.has(cn)) return nsamples.get(cn);
  const alphaTex = mat.map;
  const n = cn.image.data, size = cn.image.width;
  const a = alphaTex && alphaTex.image ? alphaTex.image.data : null;
  const step = Math.max(1, (size / 48) | 0);
  const list = [];
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const i = (y * size + x) * 4;
      const w = a ? a[i + 3] / 255 : 1;
      if (w < 0.4) continue;
      list.push([n[i] / 127.5 - 1, n[i + 1] / 127.5 - 1, n[i + 2] / 127.5 - 1, w]);
    }
  }
  nsamples.set(cn, list);
  return list;
}

// Only instances the camera can actually see. The rings write every card in
// range with `frustumCulled = false`, so the raw instance list includes cards
// behind the lens, and a card behind the lens has its view-aligned frame
// pointing the other way — it would drag the mean of a number that is supposed
// to describe the frame.
const proj = new M4().multiplyMatrices(g.camera.projectionMatrix, g.camera.matrixWorldInverse);
const V4 = g.camera.projectionMatrix.elements.constructor === Float32Array
  ? null : null;
function inFrame(p, pad) {
  const e = proj.elements;
  const x = e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12];
  const y = e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13];
  const w = e[3] * p.x + e[7] * p.y + e[11] * p.z + e[15];
  if (w <= 0) return false;
  return Math.abs(x / w) <= 1 + pad && y / w >= -1 - pad && y / w <= 1 + pad * 3;
}

const m = new M4(), nm = new M3(), n0 = new V3(), nw = new V3();
const bz = new V3(), bx = new V3(), by = new V3(), up = new V3(0, 1, 0), pos = new V3();
const buckets = {};
g.scene.traverse((o) => {
  if (!o.isInstancedMesh || !o.visible || !o.count) return;
  const isImp = /_impostor$/.test(o.name);
  const isCan = /^canopy_/.test(o.name);
  const isLeaf = /_leaf$/.test(o.name);
  if (!isImp && !isCan && !isLeaf) return;
  const key = isImp ? 'tree impostor' : isCan ? 'canopy stand card' : 'tree geometry leaf';
  const b = buckets[key] || (buckets[key] = { ndl: [], pos: [], old: [], instances: 0, onScreen: 0, crown: false, upAcc: 0, upW: 0 });
  b.instances += o.count;

  const cs = crownSamples(o.material);
  if (cs) b.crown = true;
  const na = o.geometry.attributes.normal;
  for (let i = 0; i < o.count; i++) {
    o.getMatrixAt(i, m);
    m.premultiply(o.matrixWorld);
    let acc = 0, wsum = 0;
    pos.setFromMatrixPosition(m);
    if (!inFrame(pos, 0.15)) continue;
    b.onScreen++;
    if (cs) {
      // the shader's frame: bz surface-to-camera, by world up, bx their cross
      bz.copy(camPos).sub(pos).normalize();
      bx.crossVectors(up, bz);
      if (bx.lengthSq() < 1e-8) continue;
      bx.normalize();
      by.crossVectors(bz, bx);
      for (const [nx, ny, nz, w] of cs) {
        nw.set(
          bx.x * nx + by.x * ny + bz.x * nz,
          bx.y * nx + by.y * ny + bz.y * nz,
          bx.z * nx + by.z * ny + bz.z * nz,
        ).normalize();
        acc += Math.max(0, nw.dot(L)) * w; wsum += w;
        b.upAcc += nw.y * w; b.upW += w;
      }
    } else {
      nm.getNormalMatrix(m);
      const step = Math.max(1, (na.count / 24) | 0);
      for (let v = 0; v < na.count; v += step) {
        n0.set(na.getX(v), na.getY(v), na.getZ(v));
        nw.copy(n0).applyMatrix3(nm).normalize();
        acc += Math.max(0, nw.dot(L)); wsum++;
        b.upAcc += nw.y; b.upW += 1;
      }
    }
    if (wsum > 0) { b.ndl.push(acc / wsum); b.pos.push([pos.x, pos.y, pos.z]); }

    // The same instance as it was *before* this lane: one constant object-space
    // normal (0, 0.62, 0.78) on all eight vertices, rotated by the instance
    // yaw. Computed here rather than from a checkout so the two numbers share
    // the sun, the camera and the exact same instance set.
    if (cs) {
      nm.getNormalMatrix(m);
      n0.set(0, 0.62, 0.78).normalize().applyMatrix3(nm).normalize();
      b.old.push(Math.max(0, n0.dot(L)));
    }
  }
});

// Neighbour-to-neighbour scatter, which is the number that reads as *noise*.
// A spread that varies smoothly across the frame is a lighting gradient and is
// what a real forest does; a spread that is uncorrelated between adjacent trees
// is salt-and-pepper. Residual against the mean of the eight nearest instances.
function localScatter(vals, pts) {
  if (vals.length < 12) return null;
  const K = 8, res = [];
  const N = Math.min(vals.length, 400);
  const stride = Math.max(1, (vals.length / N) | 0);
  for (let i = 0; i < vals.length; i += stride) {
    const d = [];
    for (let j = 0; j < vals.length; j++) {
      if (j === i) continue;
      const dx = pts[i][0] - pts[j][0], dz = pts[i][2] - pts[j][2];
      d.push([dx * dx + dz * dz, vals[j]]);
    }
    d.sort((a, b) => a[0] - b[0]);
    let s = 0;
    for (let k = 0; k < K; k++) s += d[k][1];
    res.push(vals[i] - s / K);
  }
  const mean = res.reduce((s, v) => s + v, 0) / res.length;
  return +Math.sqrt(res.reduce((s, v) => s + (v - mean) * (v - mean), 0) / res.length).toFixed(3);
}

out.perInstanceLambert = {};
for (const [k, v] of Object.entries(buckets)) {
  out.perInstanceLambert[k] = {
    instances: v.instances, onScreen: v.onScreen, crownNormalMap: v.crown, ...stats(v.ndl),
    neighbourScatter: localScatter(v.ndl, v.pos),
    // mean world-space upness of the tier's normals: the view-independent
    // number the card's `up` bias is calibrated against
    meanUp: +(v.upAcc / Math.max(1, v.upW)).toFixed(3),
    beforeThisLane: v.old.length ? { ...stats(v.old), neighbourScatter: localScatter(v.old, v.pos) } : null,
  };
}
return out;

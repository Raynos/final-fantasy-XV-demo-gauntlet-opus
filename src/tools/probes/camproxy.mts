/*
 * Are `CameraOccluders`' proxies the rocks the game actually draws?
 *
 * This lane's entire claim is a before-and-after taken with an instrument that
 * reads its own proxies, so a proxy that is wrong makes both halves wrong in
 * the same direction and the run still looks like a result. The first version
 * used bounding spheres and reported the lens inside a rock on 12-85% of combat
 * frames; the ellipsoid version reported 0.00% on the next run. Exactly one of
 * those is a measurement.
 *
 * So this grades the proxy against the only authority there is: the drawn
 * `InstancedMesh` triangles, through `THREE.Raycaster`, which knows nothing
 * about `placedScale` and re-derives nothing. It fires a fan of rays from the
 * live camera, and for every ray that hits a rock mesh compares the distance
 * with what the proxy set predicts.
 *
 *   agree     both say hit, or both say miss
 *   proxy-only  the proxy claims a rock the renderer does not draw (the arm
 *               pushes in for nothing — a framing cost, not a safety one)
 *   mesh-only   the renderer draws a rock the proxy does not know about (the
 *               lens goes through it — the failure this lane exists to stop)
 *   err       proxy distance minus mesh distance, metres, on agreed hits.
 *             Negative is the safe sign: the proxy stops the arm early.
 *
 *   node src/tools/probe.mts src/tools/probes/camproxy.mts --dirty
 */
const g = window.GAME;
const rig = g.get('CameraRig');
const props = g.get('Props');
const player = g.get('Player');
if (!rig || !props || !props.rocks) return 'missing CameraRig / Props.rocks';
const occ = rig.occluders;
const rocks = props.rocks;

const dt = 1 / 60;
g.applyShot('hud_field');
g.get('Director')?.play?.();
rig.clearShot?.();
g.resetClock();

const meshes = rocks.groups.map((gr) => gr.mesh);
const FAR = 40;
/**
 * The drawn triangles, in world space, for every instance within `FAR`.
 *
 * A probe is a function body in a page with no bare-specifier imports, so there
 * is no `THREE.Raycaster` to be had -- `outcropjoint.mts` walks triangles for
 * the same reason. That is no loss: `Rocks` drives `mesh.count` itself and
 * writes `instanceMatrix` every update, so reading the matrix buffer straight
 * is reading exactly what was submitted, with no raycaster's own culling rules
 * in between.
 */
function worldTris(camPos) {
  const out = [];
  for (const m of meshes) {
    if (!m || !m.count) continue;
    const pos = m.geometry.attributes.position;
    const idx = m.geometry.index;
    const nTri = (idx ? idx.count : pos.count) / 3;
    const mat = m.instanceMatrix.array;
    for (let s = 0; s < m.count; s++) {
      const o = s * 16;
      const tx = mat[o + 12], ty = mat[o + 13], tz = mat[o + 14];
      // Column lengths are the scales; the longest bounds the hull, the
      // geometry being normalised to bounding radius 1.
      const r = Math.max(
        Math.hypot(mat[o], mat[o + 1], mat[o + 2]),
        Math.hypot(mat[o + 4], mat[o + 5], mat[o + 6]),
        Math.hypot(mat[o + 8], mat[o + 9], mat[o + 10]));
      if (Math.hypot(tx - camPos.x, ty - camPos.y, tz - camPos.z) - r > FAR) continue;
      const tri = new Float64Array(nTri * 9);
      for (let t = 0; t < nTri; t++) {
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k;
          const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
          tri[t * 9 + k * 3] = mat[o] * x + mat[o + 4] * y + mat[o + 8] * z + tx;
          tri[t * 9 + k * 3 + 1] = mat[o + 1] * x + mat[o + 5] * y + mat[o + 9] * z + ty;
          tri[t * 9 + k * 3 + 2] = mat[o + 2] * x + mat[o + 6] * y + mat[o + 10] * z + tz;
        }
      }
      out.push(tri);
    }
  }
  return out;
}

/** Moller-Trumbore, two-sided; nearest hit distance or Infinity. */
function rayTris(tris, ox, oy, oz, dx, dy, dz) {
  let best = Infinity;
  for (const tri of tris) {
    for (let i = 0; i < tri.length; i += 9) {
      const ax = tri[i], ay = tri[i + 1], az = tri[i + 2];
      const e1x = tri[i + 3] - ax, e1y = tri[i + 4] - ay, e1z = tri[i + 5] - az;
      const e2x = tri[i + 6] - ax, e2y = tri[i + 7] - ay, e2z = tri[i + 8] - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-9 && det < 1e-9) continue;
      const inv = 1 / det;
      const tx = ox - ax, ty = oy - ay, tz = oz - az;
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 1e-4 && t < best) best = t;
    }
  }
  return best;
}

const V = rig.cam.position.constructor;
const dir = new V();

let agree = 0, proxyOnly = 0, meshOnly = 0, both = 0;
let errSum = 0, errAbs = 0, errWorst = 0, errWorstSigned = 0;
const samples = [];

/**
 * Walk to somewhere with rocks in it, then fan rays. One standing position
 * samples one rock; the walk is what makes the numbers a population.
 */
const inp = g.input;
inp.pointerLocked = true;
const HEADINGS = [0.4, 1.3, 2.2, 3.1, 4.0, 4.9, 5.8, 0.9];
for (const yaw of HEADINGS) {
  rig.yaw = yaw; rig.yawTarget = yaw;
  inp.keys.clear(); inp.keys.add('KeyW'); inp.keys.add('ShiftLeft');
  for (let f = 0; f < 60 * 12; f++) g.frame(dt);
  inp.keys.clear();
  for (let f = 0; f < 30; f++) g.frame(dt);

  const cam = rig.cam;
  cam.updateMatrixWorld(true);
  // Refresh the window at the lens, not the focus: the rays start at the lens.
  occ.update(g, cam.position, 40, 1e9);
  const tris = worldTris(cam.position);
  if (!tris.length || !occ.count) { samples.push(`(${Math.round(player.position.x)}, ${Math.round(player.position.z)}) proxies ${occ.count} instances-in-range ${tris.length} — skipped`); continue; }

  let a = 0, po = 0, mo = 0, b = 0;
  for (let iy = -3; iy <= 3; iy++) {
    for (let ix = -6; ix <= 6; ix++) {
      dir.set(ix / 6, iy / 6, -1).normalize().applyQuaternion(cam.quaternion);
      const md = rayTris(tris, cam.position.x, cam.position.y, cam.position.z, dir.x, dir.y, dir.z);
      const pd = occ.sweep(cam.position.x, cam.position.y, cam.position.z,
        dir.x, dir.y, dir.z, FAR, 0);
      const mHit = md < FAR, pHit = pd < FAR - 1e-3;
      if (mHit && pHit) {
        b++; both++;
        const e = pd - md;
        errSum += e; errAbs += Math.abs(e);
        if (Math.abs(e) > errWorst) { errWorst = Math.abs(e); errWorstSigned = e; }
      } else if (mHit) { mo++; meshOnly++; } else if (pHit) { po++; proxyOnly++; } else { a++; agree++; }
    }
  }
  samples.push(`(${Math.round(player.position.x)}, ${Math.round(player.position.z)}) `
    + `proxies ${occ.count}  instances ${tris.length}  rays 91  both-hit ${b}  both-miss ${a}  proxy-only ${po}  mesh-only ${mo}`);
}

const n = both + agree + proxyOnly + meshOnly;
const pc = (k) => `${(100 * k / Math.max(1, n)).toFixed(2)}%`;
const out = [];
out.push(...samples);
out.push('');
out.push(`=== ${n} rays over ${HEADINGS.length} standing positions`);
out.push(`  agree (both hit or both miss)  ${both + agree}  ${pc(both + agree)}`);
out.push(`  proxy-only (arm pushes in for nothing)  ${proxyOnly}  ${pc(proxyOnly)}`);
out.push(`  mesh-only  (LENS GOES THROUGH A ROCK)   ${meshOnly}  ${pc(meshOnly)}`);
if (both) {
  out.push(`  distance error on ${both} agreed hits: mean ${(errSum / both).toFixed(3)} m, `
    + `mean |err| ${(errAbs / both).toFixed(3)} m, worst ${errWorstSigned.toFixed(2)} m`);
  out.push('  (negative = the proxy stops the arm EARLY, which is the safe sign)');
}
return out.join('\n');

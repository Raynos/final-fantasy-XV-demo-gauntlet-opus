// Where do the ground points *that are actually on screen* land in each
// cascade's shadow map?
//
// `getShadow` returns 1.0 — fully lit, no shadow possible — unless
// `shadowCoord.xy` is inside [0,1]^2 and `z <= 1`. And the CSM chunk only
// consults cascade `i` when the fragment's `linearDepth` falls in
// `CSM_cascades[i]`. So a cascade whose map does not cover its own depth slice
// cannot cast, whatever the depth map holds.
//
// The first version of this probe sampled points a fixed horizontal distance
// ahead of the camera. That is wrong on any shot where the camera is on high
// ground: the point 5 m ahead at terrain height is 57 degrees below the
// horizon and not in frame at all. March the real camera rays instead.
const g = window.GAME;
const SHOT = window.__SHOT || 'zone_fallgrove';
g.applyShot(SHOT);
g.settle(60);
g.applyShot(SHOT);
g.settle(8);

/** m is column-major elements[16]; v is [x,y,z]. Returns [x,y,z,w]. */
function xf(m, v) {
  const e = m.elements;
  return [
    e[0] * v[0] + e[4] * v[1] + e[8] * v[2] + e[12],
    e[1] * v[0] + e[5] * v[1] + e[9] * v[2] + e[13],
    e[2] * v[0] + e[6] * v[1] + e[10] * v[2] + e[14],
    e[3] * v[0] + e[7] * v[1] + e[11] * v[2] + e[15],
  ];
}

const sky = g.get('Sky');
const terrain = g.get('Terrain');
const cam = g.camera;
const out = { shot: SHOT, cam: [+cam.position.x.toFixed(1), +cam.position.y.toFixed(1), +cam.position.z.toFixed(1)] };

// camera basis from matrixWorld (column-major): right = col0, up = col1, fwd = -col2
const e = cam.matrixWorld.elements;
const R = [e[0], e[1], e[2]], U = [e[4], e[5], e[6]], F = [-e[8], -e[9], -e[10]];
const tanY = Math.tan((cam.fov * Math.PI) / 360);
const tanX = tanY * cam.aspect;

/** March a screen-space ray (ndc x,y in -1..1) onto the terrain. */
function hit(nx, ny) {
  const d = [
    F[0] + R[0] * nx * tanX + U[0] * ny * tanY,
    F[1] + R[1] * nx * tanX + U[1] * ny * tanY,
    F[2] + R[2] * nx * tanX + U[2] * ny * tanY,
  ];
  const l = Math.hypot(d[0], d[1], d[2]); d[0] /= l; d[1] /= l; d[2] /= l;
  const p = cam.position;
  let t = 1, last = 1;
  for (let i = 0; i < 4000; i++) {
    const x = p.x + d[0] * t, y = p.y + d[1] * t, z = p.z + d[2] * t;
    const h = terrain.heightAt(x, z);
    if (y <= h) {
      // bisect between last and t
      let a = last, b = t;
      for (let k = 0; k < 40; k++) {
        const m = (a + b) * 0.5;
        const yy = p.y + d[1] * m;
        if (yy <= terrain.heightAt(p.x + d[0] * m, p.z + d[2] * m)) b = m; else a = m;
      }
      const tt = (a + b) * 0.5;
      return { t: tt, w: [p.x + d[0] * tt, p.y + d[1] * tt, p.z + d[2] * tt] };
    }
    last = t;
    t += Math.max(0.5, t * 0.02);
    if (t > 4000) break;
  }
  return null;
}

const rows = [];
// bottom of frame up to the horizon, centre column
for (const ny of [-0.98, -0.9, -0.8, -0.7, -0.6, -0.5, -0.4, -0.3, -0.2, -0.1, 0.0]) {
  const h = hit(0, ny);
  if (!h) { rows.push({ ny, miss: true }); continue; }
  const v = xf(cam.matrixWorldInverse, h.w);
  const row = { ny, dist: +h.t.toFixed(1), viewZ: +(-v[2]).toFixed(1), world: h.w.map((q) => +q.toFixed(1)), casc: [] };
  row.linDepth = +(row.viewZ / (190 - cam.near)).toFixed(4);
  for (let i = 0; i < sky.csm.lights.length; i++) {
    const c = xf(sky.csm.lights[i].shadow.matrix, h.w);
    const sx = c[0] / c[3], sy = c[1] / c[3], sz = c[2] / c[3];
    row.casc.push({ uv: [+sx.toFixed(3), +sy.toFixed(3)], z: +sz.toFixed(4), in: sx >= 0 && sx <= 1 && sy >= 0 && sy <= 1 && sz <= 1 });
  }
  rows.push(row);
}
out.rows = rows;
out.csm = { maxFar: sky.csm.maxFar, fade: sky.csm.fade, mode: sky.csm.mode, breaks: sky.csm.breaks, cameraNear: cam.near, fov: cam.fov, aspect: +cam.aspect.toFixed(4) };
const halves = sky.csm.lights.map((l) => +(l.shadow.camera.right).toFixed(2));
out.cascadeHalfExtent = halves;
out.lightPos = sky.csm.lights.map((l) => [+l.position.x.toFixed(1), +l.position.y.toFixed(1), +l.position.z.toFixed(1)]);
return out;

// Which part of the head mesh is drawing over the eye? Bisect it, in frames.
//
//   node src/tools/probe.mts src/tools/probes/eyeoccluder.mts \
//     --shot tmp/shots/occ/x.png
//
// `facecam.mts --FRONT_SIDE` proves the covering surface is head geometry that
// is back-facing to the camera; `headfold.mts` narrowed it to the shell around
// the globe but could not separate the lid band from the lashes from the socket
// floor, because they are one mesh with one material and the builder's groups
// are *smoothing* groups.
//
// So delete triangles instead of reasoning about them. Each stage rebuilds the
// head's index buffer without one candidate set and photographs the same
// framing, so the answer is a picture with the suspect removed rather than a
// number about it. This is `--hide` at triangle granularity, which is the one
// thing the harness cannot express.

const g = window.GAME;
const { SHOTS } = await import('/game/Shots.ts');
g.settle(90);
if (g.post && g.post.dof) g.post.dof.enabled = false;
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

const player = g.get('Player');
const ch = player.character;
const dims = ch.rig.dims, o = dims.headOrigin, sc = dims.headScale;

// hair off, gaze pinned, no blink — the frame has to be about the eye
if (ch.hair) ch.hair.visible = false;
const zero = (q) => { q.rotation.set(0, 0, 0); q.updateMatrix(); };
const origUpd = ch.anim.update.bind(ch.anim);
ch.anim.update = (dt, st) => {
  origUpd(dt, st);
  ch.anim.blink = 0;
  zero(ch.eyes);
  if (ch.eyeGlobes) for (const gp of ch.eyeGlobes) zero(gp);
};

// framing: 0.30 m off the near eye, on the head's own forward axis
player.root.updateWorldMatrix(true, false);
const e = player.root.matrixWorld.elements;
const nl0 = Math.hypot(e[8], e[10]) || 1;
const fwd = [e[8] / nl0, 0, e[10] / nl0];
const right = [-fwd[2], 0, fwd[0]];
const hb = ch.rig.byName.head;
hb.updateWorldMatrix(true, false);
const he = hb.matrixWorld.elements;
const rp = player.root.position;
// Dead ahead at 0.55 m, which is exactly `facecam.mts`'s `<key>_face` framing:
// the bisection has to run at the angle where the defect shows, and a probe
// aimed three-quarters from 0.30 m showed an *open* eye on the same build.
const aim = [
  he[12] + fwd[0] * 0.02 - rp.x,
  he[13] + sc * 0.045 - rp.y,
  he[14] + fwd[2] * 0.02 - rp.z,
];
const D = 0.55;
const dl0 = Math.hypot(1, 0.10);
SHOTS.__occ = {
  name: '__occ', fov: 30, time: 16.2, weather: 'clear', follow: 'player', hud: false,
  offset: [aim[0] + fwd[0] / dl0 * D, aim[1] + 0.10 / dl0 * D, aim[2] + fwd[2] / dl0 * D],
  lookOffset: aim,
};

// ---- the index buffer, and the predicates that carve it up --------------
const geo = ch.head.geometry;
const pos = geo.getAttribute('position');
const idx0 = Array.from(geo.getIndex().array);
const P = (j) => [(pos.getX(j) - o.x) / sc, (pos.getY(j) - o.y) / sc, (pos.getZ(j) - o.z) / sc];
const eyeC = [0.0335, -0.006, 0.0646], eyeR = 0.0107;
/** Distance of a triangle's centroid from the near globe's centre, in globe radii. */
const dOf = (t) => {
  const a = P(idx0[t]), b = P(idx0[t + 1]), c = P(idx0[t + 2]);
  const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
  if (cx < 0) return 1e9;
  return Math.hypot(cx - eyeC[0], cy - eyeC[1], cz - eyeC[2]) / eyeR;
};
const dist = [];
for (let t = 0; t < idx0.length; t += 3) dist.push(dOf(t));

const setIndex = (keep) => {
  const out = [];
  for (let i = 0; i < dist.length; i++) {
    if (!keep(dist[i], i)) continue;
    out.push(idx0[i * 3], idx0[i * 3 + 1], idx0[i * 3 + 2]);
  }
  geo.setIndex(out);
  geo.index.needsUpdate = true;
  return out.length / 3;
};

const report = [];
const stage = async (name, keep) => {
  const n = keep ? setIndex(keep) : (geo.setIndex(idx0), idx0.length / 3);
  g.applyShot('__occ');
  g.settle(6);
  await window.__shot(name);
  report.push({ name, triangles: n });
};

// Contiguous index runs inside a tight cone over the pupil, within 2 globe
// radii. `buildHead` emits its parts in a fixed order, so a contiguous run of
// triangle indices *is* a part — and stripping one run at a time names it.
const inCone = [];
for (let i = 0; i < dist.length; i++) {
  if (dist[i] > 2.0) continue;
  const a = P(idx0[i * 3]), b = P(idx0[i * 3 + 1]), c = P(idx0[i * 3 + 2]);
  const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
  const dx = cx - eyeC[0], dy = cy - eyeC[1], dz = cz - eyeC[2];
  const dl = Math.hypot(dx, dy, dz) || 1;
  if (dz / dl < 0.90) continue;
  inCone.push(i);
}
const runs = [];
for (const i of inCone) {
  const last = runs[runs.length - 1];
  if (last && i === last[1] + 1) last[1] = i;
  else runs.push([i, i]);
}
const total = idx0.length / 3;

await stage('0_all', null);
// Progressive tail: `buildHead` emits the skull grid, its chin cap, the ears,
// then the two lids with their waterlines, caruncles and lashes. Adding the
// tail back a thousand triangles at a time names the part that closes the eye,
// which the distance-based split could not because the socket rim and the lid
// band overlap in distance from the globe centre.
for (const K of [8600]) await stage(`k${K}`, (d, i) => i < K);

// What is actually between the camera and the pupil: ray-cast it.
//
// Every predicate before this one was written in canonical head space along
// +Z, and every one of them flagged the wrong triangles — the head carries an
// idle pitch and yaw, so the view ray through the pupil is not the canonical
// gaze axis, and a cylinder or a cone drawn around that axis lands on the brow.
// A ray from the real camera to the real pupil cannot be wrong about which
// triangles are in the way.
g.applyShot('__occ');
g.settle(6);
const cam = g.camera;
cam.updateMatrixWorld(true);
ch.head.updateMatrixWorld(true);
// **Bind space, not mesh space.** `ch.head` is a SkinnedMesh: its geometry
// holds bind-pose vertices and the rendered surface is the bones' doing, so
// `head.matrixWorld` is the wrong frame and a ray cast in it returns zero hits
// through a visibly blocked eye — which is exactly what the first version of
// this cast reported. Every head vertex is weighted [head, 1] (the lids are
// 0.85/0.15), so the map from bind space to world is
// `headBone.matrixWorld * boneInverses[head]`.
const skel = ch.head.skeleton;
const hbi = skel.bones.indexOf(ch.rig.byName.head);
const M = ch.rig.byName.head.matrixWorld.clone().multiply(skel.boneInverses[hbi]);
const inv = M.clone().invert();
// `import('three')` is a bare specifier and the page is a vite dev server, so
// it does not resolve from an eval'd probe. Borrow the constructors off objects
// the game already holds instead.
const V3 = cam.position.constructor;
const camL = cam.getWorldPosition(new V3()).applyMatrix4(inv);
// pupil centre in the head mesh's own space (the mesh is built in character
// space, so canonical -> character is the same put() the builder used)
// The pupil where it actually is: the near globe's own pivot, pushed forward
// by a globe radius along the head's forward axis, read in world space and
// brought back into bind space through the same map.
const gp = ch.eyeGlobes && ch.eyeGlobes[0];
const pupilW = gp ? gp.getWorldPosition(new V3()) : ch.eyes.getWorldPosition(new V3());
const fw = new V3(0, 0, 1).applyQuaternion(ch.rig.byName.head.getWorldQuaternion(cam.quaternion.constructor ? new (cam.quaternion.constructor)() : undefined));
pupilW.addScaledVector(fw, eyeR * sc * 1.02);
const pupil = pupilW.clone().applyMatrix4(inv);
const O = [camL.x, camL.y, camL.z];
const Dv = [pupil.x - O[0], pupil.y - O[1], pupil.z - O[2]];
const Q = (jj) => [pos.getX(jj), pos.getY(jj), pos.getZ(jj)];
const flagged = new Set();
const hits = [];
for (let i = 0; i < dist.length; i++) {
  const a = Q(idx0[i * 3]), b = Q(idx0[i * 3 + 1]), c = Q(idx0[i * 3 + 2]);
  // Moller-Trumbore, both sides, hit recorded with its parametric distance and
  // the sign of the facing so a back face can be told from a front one.
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const pv = [Dv[1] * e2[2] - Dv[2] * e2[1], Dv[2] * e2[0] - Dv[0] * e2[2], Dv[0] * e2[1] - Dv[1] * e2[0]];
  const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
  if (Math.abs(det) < 1e-12) continue;
  const invDet = 1 / det;
  const tv = [O[0] - a[0], O[1] - a[1], O[2] - a[2]];
  const u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) * invDet;
  if (u < 0 || u > 1) continue;
  const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
  const vv = (Dv[0] * qv[0] + Dv[1] * qv[1] + Dv[2] * qv[2]) * invDet;
  if (vv < 0 || u + vv > 1) continue;
  const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * invDet;
  if (tt < 1e-6 || tt > 1) continue;                    // between camera and pupil
  flagged.add(i);
  hits.push({ i, t: +tt.toFixed(4), backface: det > 0 });
}
report.push({ name: '_raycast', hits: hits.length, list: hits.slice(0, 20) });

await stage('f_no_flagged', (d, i) => !flagged.has(i));

// Everything within 1.6 globe radii is the lid band, the waterline, the
// caruncle and the lash roots. Nothing else can be that close to the globe.
await stage('1_no_lidband', (d) => d > 1.6);
// 1.6 .. 2.6 radii: the lash tips and the orbital rim.
await stage('2_no_rim', (d) => d > 2.6);
// Everything inside the orbit gone: whatever is left over the eye is the skull.
await stage('3_no_orbit', (d) => d > 4.0);
// One frame per run, each with only that run removed.
for (let k = 0; k < Math.min(runs.length, 8); k++) {
  const [lo, hi] = runs[k];
  await stage(`r${k}_${lo}-${hi}`, (d, i) => i < lo || i > hi);
}

// The complements, so each stage's suspect can be seen on its own.
await stage('4_only_lidband', (d) => d <= 1.6);
await stage('5_only_rim', (d) => d > 1.6 && d <= 2.6);
geo.setIndex(idx0);

return { report, totalTris: total, runs: runs.map((q) => [q[0], q[1], q[1] - q[0] + 1]), framing: SHOTS.__occ };

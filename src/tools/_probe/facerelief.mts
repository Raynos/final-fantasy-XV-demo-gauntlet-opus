/*
 * How much of a hero's face has turned its back on the key light.
 *
 *   node src/tools/framecam.mts --probe src/tools/_probe/facerelief.mts --out tmp/shots/x
 *
 * WHY THIS EXISTS. The second blind playtest called the four faces "a smear",
 * "an orange blotch", "a bright orange band across the eyes, like they're all
 * wearing blindfolds". Captured at the distance the player judges from —
 * native fov 50 at 5 m, so the head covers 42 px — lit skin lands at Y 180-210
 * and large parts of the mid-face land at **Y 0-20**, a lit:shadow ratio of
 * 10-30x where `ART-DIRECTION` §12.1 measures FFXV at 2.0-3.2x and never more.
 *
 * Ablation says it is none of the things anyone had blamed. A flat albedo,
 * flat vertex colours and a null normal map each move the face by under
 * 0.75/255; `castShadow = false` on the whole character moves it by nothing;
 * and a debug pass writing N·L into the frame reads **exactly 0** on every dark
 * pixel. The face is corrugated: the sculpted relief turns roughly a third of
 * the mid-face past 90 degrees from the key, so those pixels receive no direct
 * light at all and no fill term keyed on the sun can reach them.
 *
 * A capture cannot be the instrument for that — `facecheck` framings are not
 * repeatable (LANDMINES), and a fixed rect reads the background as often as the
 * subject. So this measures the mesh instead: for every vertex on the FRONT of
 * the head, in the head's own frame, dot the shading normal with the sun and
 * report the fraction at or below zero. It needs no camera, no settle and no
 * framing, so it is a valid A/B across builds by construction.
 *
 * `dark` is the number: the fraction of the visible face that the key cannot
 * reach. A smooth head lit from front-and-above should be near 0.
 */
const g = window.GAME;
g.settle(30);

const party = g.get('Party');
const player = g.get('Player');
const all = { noctis: null, gladio: 'gladio', ignis: 'ignis', prompto: 'prompto' };

// The sun, in world space, from the light the game actually renders with.
let sun = null;
g.scene.traverse((o) => {
  if (!sun && o.isDirectionalLight && o.intensity > 0.5) {
    const t = o.target ? o.target.position : { x: 0, y: 0, z: 0 };
    const v = { x: o.position.x - t.x, y: o.position.y - t.y, z: o.position.z - t.z };
    const l = Math.hypot(v.x, v.y, v.z) || 1;
    sun = { x: v.x / l, y: v.y / l, z: v.z / l };
  }
});
if (!sun) return { error: 'no directional light' };

const out = { sun, heroes: {} };
for (const [key, id] of Object.entries(all)) {
  const m = id ? party.get(id) : player;
  const head = m && m.character && m.character.head;
  if (!head) { out.heroes[key] = null; continue; }
  head.updateWorldMatrix(true, false);
  const e = head.matrixWorld.elements;
  // normal matrix for a rigid transform is the rotation part; the head mesh is
  // skinned but its bind transform is what the geometry is authored in, and
  // every hero stands at a different yaw, so the sun has to come INTO that
  // frame rather than the normals going out of it.
  const geo = head.geometry;
  const pos = geo.attributes.position.array;
  const nrm = geo.attributes.normal.array;
  // world -> head-local rotation: transpose of the (orthonormal) upper 3x3
  const sx = e[0] * sun.x + e[1] * sun.y + e[2] * sun.z;
  const sy = e[4] * sun.x + e[5] * sun.y + e[6] * sun.z;
  const sz = e[8] * sun.x + e[9] * sun.y + e[10] * sun.z;
  const sl = Math.hypot(sx, sy, sz) || 1;
  const L = [sx / sl, sy / sl, sz / sl];

  // The face band, in the head mesh's own local coordinates. `origin` is the
  // head bone; the mesh is authored around it, so a fixed box is stable across
  // heroes and across builds.
  // A CANONICAL key, in the head's own frame: front and 45 degrees above. The
  // live sun makes `dark` depend on which way a hero happens to be standing,
  // which is formation state and not a property of the sculpt; this one is a
  // pure measure of the surface and is therefore the A/B number.
  const K = (() => { const v = [0.10, 0.72, 0.69]; const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
  const n = pos.length / 3;
  let total = 0, dark = 0, deep = 0, ndlSum = 0, kDark = 0, kDeep = 0, kSum = 0;
  let minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < n; i++) {
    const nz = nrm[i * 3 + 2];
    if (nz < 0.25) continue;                 // only the front of the head
    const py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    minZ = Math.min(minZ, pz); maxZ = Math.max(maxZ, pz);
    const d = nrm[i * 3] * L[0] + nrm[i * 3 + 1] * L[1] + nz * L[2];
    total++;
    ndlSum += d;
    if (d <= 0) dark++;
    if (d <= -0.3) deep++;
    const k = nrm[i * 3] * K[0] + nrm[i * 3 + 1] * K[1] + nz * K[2];
    kSum += k;
    if (k <= 0) kDark++;
    if (k <= -0.3) kDeep++;
  }
  out.heroes[key] = {
    verts: total,
    keyDark: +(kDark / Math.max(1, total)).toFixed(4),
    keyDeep: +(kDeep / Math.max(1, total)).toFixed(4),
    keyMean: +(kSum / Math.max(1, total)).toFixed(4),
    dark: +(dark / Math.max(1, total)).toFixed(4),
    deep: +(deep / Math.max(1, total)).toFixed(4),
    meanNdl: +(ndlSum / Math.max(1, total)).toFixed(4),
    box: [+minY.toFixed(3), +maxY.toFixed(3), +minZ.toFixed(3), +maxZ.toFixed(3)],
  };
}
return out;

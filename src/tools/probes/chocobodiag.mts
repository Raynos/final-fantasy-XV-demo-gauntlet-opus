/*
 * Why is the chocobo exploded? Ablate the three suspects in order.
 *
 *   node src/tools/probe.mts src/tools/probes/chocobodiag.mts --dirty
 *
 * The symptom: parts bound with `attachChain`/`attachBlend` collapse to a point
 * at the mesh origin, while every part bound with `attach` renders perfectly.
 * Three things could do that and only one of them is true, so measure rather
 * than re-tint: the merged skin weights, the skeleton the clone rebuilt, and
 * the pose the animator writes.
 */
const g = window.GAME;
const out = [];
const mod = await import('/characters/chocobo/ChocoboRig.ts');
const proto = mod.buildChocoboPrototype();
const geo = proto.mesh.geometry;

out.push(`verts ${geo.attributes.position.count}  bones ${proto.mesh.skeleton.bones.length}`);

/* ---- 1. do the merged skin weights sum to 1? ---- */
const sw = geo.attributes.skinWeight, si = geo.attributes.skinIndex;
let bad = 0, minSum = 9, maxSum = -9, maxIdx = -1, firstBad = -1;
for (let i = 0; i < sw.count; i++) {
  const s = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i);
  if (s < 0.5) { bad++; if (firstBad < 0) firstBad = i; }
  if (s < minSum) minSum = s;
  if (s > maxSum) maxSum = s;
  maxIdx = Math.max(maxIdx, si.getX(i), si.getY(i), si.getZ(i), si.getW(i));
}
out.push(`weightSum min ${minSum.toFixed(3)} max ${maxSum.toFixed(3)}  under-0.5 ${bad}  firstBad ${firstBad}`);
out.push(`max skinIndex ${maxIdx} (bones ${proto.mesh.skeleton.bones.length})`);

/* ---- 2. does the BIND POSE skin back to the authored positions? ----
 * With every bone at rest, CPU skinning must reproduce `position` exactly.
 * Any deviation here is a binding bug and nothing to do with the animator. */
// `import('three')` is a bare specifier the page cannot resolve; borrow the
// constructors off objects the game already holds.
const V3 = g.camera.position.constructor;
const M4 = g.camera.matrixWorld.constructor;
proto.group.updateMatrixWorld(true);
const skel = proto.mesh.skeleton;
const v = new V3(), acc = new V3(), tmp = new V3();
const m = new M4();
let worst = 0, worstAt = -1;
const step = Math.max(1, Math.floor(geo.attributes.position.count / 4000));
for (let i = 0; i < geo.attributes.position.count; i += step) {
  v.fromBufferAttribute(geo.attributes.position, i);
  acc.set(0, 0, 0);
  for (let k = 0; k < 4; k++) {
    const wgt = sw.getComponent(i, k);
    if (wgt === 0) continue;
    const bi = si.getComponent(i, k);
    const bone = skel.bones[bi];
    if (!bone) { out.push(`vertex ${i} slot ${k} -> MISSING bone ${bi}`); continue; }
    m.multiplyMatrices(bone.matrixWorld, skel.boneInverses[bi]);
    tmp.copy(v).applyMatrix4(m).multiplyScalar(wgt);
    acc.add(tmp);
  }
  const d = acc.distanceTo(v);
  if (d > worst) { worst = d; worstAt = i; }
}
out.push(`bind-pose CPU skin deviation: worst ${worst.toFixed(4)} m at vertex ${worstAt}`);

/* ---- 3. what does the LIVE bird's skeleton look like? ---- */
const cb = g.get('Chocobo');
if (cb) {
  cb.summon();
  for (let i = 0; i < 400 && cb.state === 'arriving'; i++) g.frame(1 / 60);
  const bird = cb.bird;
  if (bird) {
    const mesh = [];
    bird.visual.traverse((o) => { if (o.isSkinnedMesh) mesh.push(o); });
    out.push(`live: ${mesh.length} skinned mesh, ${mesh[0] ? mesh[0].skeleton.bones.length : 0} bones, rig map ${bird.rig.byName.size}`);
    if (mesh[0]) {
      const miss = mesh[0].skeleton.bones.filter((b) => !b).length;
      out.push(`live: null bones in skeleton = ${miss}`);
      const names = mesh[0].skeleton.bones.map((b) => (b ? b.name : 'NULL'));
      out.push(`live bone order: ${names.join(',')}`);
      out.push(`proto bone order: ${proto.mesh.skeleton.bones.map((b) => b.name).join(',')}`);
    }
  }
}
return out.join('\n');

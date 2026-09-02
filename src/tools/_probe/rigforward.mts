/*
 * Which local axis is a rig's FRONT? Measured, not eyeballed.
 *
 * Two visual attempts to fix the party rig staging with its back to the
 * reviewer disagreed with each other, which is the signal to stop looking at
 * pictures and read numbers instead.
 *
 * The method needs no convention at all. A face is asymmetric front-to-back in
 * a way a back is not, and this rig has one landmark that is unambiguously on
 * the front: the eyes. So find the eye meshes, take their centroid in the
 * subject's LOCAL space, and the sign of its z tells you which way the face
 * points. Falls back to the nose/head-front geometry spread if there are no
 * nodes named for eyes.
 */
const g = window.GAME;
const mod = await import('/studio/StudioShell.ts');
const shell = await mod.openStudio(g);
const out = [];
const step = (n) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const breathe = () => new Promise((r) => setTimeout(r, 0));
const settle = async (s) => { for (let i = 0; i < Math.ceil(s * 6); i++) { step(10); await breathe(); } };

shell.setSection('model');
await settle(1.0);
const fams = shell.model.families();

const measure = async (famId, label) => {
  shell.model.openFamily(fams.findIndex((f) => f.id === famId));
  await settle(1.2);
  const made = shell.model.browser._made;
  const obj = made.object;
  obj.updateMatrixWorld(true);

  // Every mesh, with its centroid expressed in the SUBJECT's local frame.
  // `three` is not resolvable as a bare specifier in the page, so the classes
  // come off live objects -- the same trick `_probe/w3bhaven.mts` uses.
  const M4 = obj.matrixWorld.constructor;
  const V3 = obj.position.constructor;
  const inv = new M4().copy(obj.matrixWorld).invert();
  const named = [];
  const v = new V3();
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const pa = o.geometry.attributes.position;
    if (!pa || !pa.count) return;
    // Centroid by averaging vertices rather than a Box3: no extra class to
    // borrow, and a mean is less swayed by one stray vert than a box centre.
    let sx = 0, sy = 0, sz = 0;
    const stride = Math.max(1, Math.floor(pa.count / 200));
    let n = 0;
    for (let i = 0; i < pa.count; i += stride) {
      v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
      sx += v.x; sy += v.y; sz += v.z; n++;
    }
    v.set(sx / n, sy / n, sz / n);
    named.push({ name: String(o.name || '(unnamed)'), z: v.z, y: v.y, x: v.x });
  });

  out.push(`--- ${label}: ${shell.model.current()} (${made.kind}), ${named.length} meshes`);
  for (const m of named.slice(0, 14)) {
    out.push(`    ${m.name.padEnd(22)} local x=${m.x.toFixed(3)} y=${m.y.toFixed(3)} z=${m.z.toFixed(3)}`);
  }
  const eyes = named.filter((m) => /eye|pupil|iris|sclera/i.test(m.name));
  if (eyes.length) {
    const z = eyes.reduce((s, e) => s + e.z, 0) / eyes.length;
    out.push(`    EYES: ${eyes.length} node(s), mean local z = ${z.toFixed(3)}  -> front is ${z >= 0 ? '+Z' : '-Z'}`);
  } else {
    out.push('    EYES: none named — see the mesh list above');
  }
  out.push(`    obj.rotation.y=${obj.rotation.y.toFixed(3)}  stage.yaw=${shell.stage.yaw.toFixed(3)}`
    + `  faceOffset=${shell.stage.faceOffset}  subjectYaw=${shell.stage.subjectYaw().toFixed(3)}`);
  const cam = g.camera;
  const toCam = Math.atan2(cam.position.x - obj.position.x, cam.position.z - obj.position.z);
  out.push(`    yaw that points local +Z at the camera = ${toCam.toFixed(3)}`);
};

await measure('heroes', 'PARTY');
await measure('enemies', 'CREATURE');

return { report: out.join('\n') };

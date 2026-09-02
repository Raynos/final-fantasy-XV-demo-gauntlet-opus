/*
 * Which way does a party rig face?
 *
 * `Stage.subjectYaw()`'s comment states that "the rigs in this project face +Z,
 * so facing the camera is simply the camera azimuth", and the creature roster
 * agrees -- bloodhorn stages facing the reviewer. Gladio stages showing his
 * back. One of those two statements is wrong and the comment is load-bearing
 * for every asset the Model Explorer will ever show, so this measures it rather
 * than reasoning about it.
 *
 * Ablation, not inspection: same subject, same stage, same light, four
 * rotations 90 degrees apart. Whichever frame shows a face is the answer.
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
shell.model.openFamily(fams.findIndex((f) => f.id === 'heroes'));
await settle(1.5);

const made = shell.model.browser._made;
const stage = shell.stage;
out.push(`subject=${shell.model.current()} kind=${made && made.kind}`);
out.push(`stage.yaw=${stage.yaw.toFixed(3)} faceOffset=${stage.faceOffset} subjectYaw=${stage.subjectYaw().toFixed(3)}`);

for (const [name, turn] of [['0', 0], ['90', Math.PI / 2], ['180', Math.PI], ['270', -Math.PI / 2]]) {
  made.object.rotation.y = stage.subjectYaw() + turn;
  // The turntable re-frames but does not re-rotate the subject, so a settle
  // here cannot undo the write above.
  await settle(0.5);
  out.push(`${name}: rotation.y=${made.object.rotation.y.toFixed(3)}`);
  await window.__shot(`face-${name}`);
}

return { report: out.join('\n') };

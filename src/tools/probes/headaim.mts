/**
 * Where is the head actually pointing in a settled shot, and who pointed it?
 *
 *   node src/tools/probe.mts src/tools/probes/headaim.mts --dirty
 *   node src/tools/probe.mts src/tools/probes/headaim.mts --set __HA_SHOTS=hero_portrait,hero_profile
 *
 * `Shots.ts` says of `hero_portrait`: *"the head is pitched down in the settled
 * pose ... the remaining fix is a head-pitch change or a shorter fringe, both in
 * `src/characters/`"*, and two handoffs have repeated it without ever putting a
 * number on the pitch. Every character instrument in this repo measures the
 * head in *canonical head space*, where the pose does not exist.
 *
 * This reads the posed skeleton: the world direction the face points, the
 * camera's own aim, and the angle between them — which is the number that
 * decides whether a portrait sees a face or the top of a skull. Then it
 * attributes the pitch to the chain, bone by bone, so a fix can be aimed at the
 * term that carries it rather than at the head bone (which, on this rig, is not
 * where the pitch is).
 */
const g = window.GAME;
// No `import` here: the probe body is evaluated in the page, and the page's
// three is bundled — there is no module URL to reach it by. Everything below is
// read off `matrixWorld.elements` instead, which needs no library.
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const axis = (o, i) => { o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; return nrm([e[i * 4], e[i * 4 + 1], e[i * 4 + 2]]); };
const posOf = (o) => { o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; return [e[12], e[13], e[14]]; };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const shots = String(window.__HA_SHOTS || 'hero_portrait,hero_profile,hero_face').split(',');
const CHAIN = ['hips', 'spine01', 'spine02', 'spine03', 'neck', 'head'];

const lines = [];
for (const shot of shots) {
  g.applyShot(shot);
  g.settle(30);
  const pl = g.get('Player');
  const ch = pl && pl.character;
  if (!ch) { lines.push(`${shot}: no character`); continue; }
  const bones = ch.bones || (ch.rig && ch.rig.bones) || (ch.skeleton && ch.skeleton.bones);
  const byName = {};
  if (Array.isArray(bones)) for (const b of bones) byName[b.name] = b;
  else if (bones) Object.assign(byName, bones);
  const head = byName.head;
  if (!head) { lines.push(`${shot}: no head bone. have: ${Object.keys(byName).slice(0, 30).join(',')}`); continue; }

  const fwdZ = axis(head, 2);
  const fwdY = axis(head, 1);
  const hp = posOf(head);

  const cam = g.camera;
  const camFwd = axis(cam, 2).map((v) => -v);
  const cp = posOf(cam);
  const toCam = nrm([cp[0] - hp[0], cp[1] - hp[1], cp[2] - hp[2]]);
  const dist = Math.hypot(cp[0] - hp[0], cp[1] - hp[1], cp[2] - hp[2]);

  const deg = (v) => (v * 180 / Math.PI).toFixed(1);
  const pitchOf = (v) => Math.asin(Math.max(-1, Math.min(1, v[1])));
  const f3 = (v) => v.map((x) => x.toFixed(3)).join(', ');

  lines.push(`--- ${shot}`);
  lines.push(`  head world pos ${f3(hp)}`);
  lines.push(`  head +Z ${f3(fwdZ)}  pitch ${deg(pitchOf(fwdZ))} deg`);
  lines.push(`  head +Y ${f3(fwdY)}  pitch ${deg(pitchOf(fwdY))} deg`);
  lines.push(`  cam pos ${f3(cp)}  fwd ${f3(camFwd)}  cam pitch ${deg(pitchOf(camFwd))} deg  dist ${dist.toFixed(3)} m`);
  lines.push(`  face-to-camera: angle(faceFwd, toCam) = ${deg(Math.acos(Math.max(-1, Math.min(1, dot3(fwdZ, toCam)))))} deg`
    + `   (0 = dead front, 90 = pure profile)`);
  const local = CHAIN.map((n) => {
    const b = byName[n];
    if (!b) return `${n}=--`;
    return `${n}=${(b.rotation.x * 180 / Math.PI).toFixed(2)}`;
  });
  lines.push(`  local X euler (deg): ${local.join('  ')}`);
  // accumulated world pitch of each bone's own +Z
  const accum = CHAIN.map((n) => {
    const b = byName[n];
    if (!b) return `${n}=--`;
    return `${n}=${deg(pitchOf(axis(b, 2)))}`;
  });
  lines.push(`  world +Z pitch by bone: ${accum.join('  ')}`);
}
return lines.join('\n');

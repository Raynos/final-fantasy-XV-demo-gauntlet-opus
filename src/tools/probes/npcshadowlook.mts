// Do the townspeople still cast the shadow they used to?
//
// The corpus town shots frame architecture; the people in them are twenty
// pixels tall and half of them stand in the building's own shade, so a shadow
// that lost a limb would not show up in any of them. This poses `town_npcs`,
// then walks the camera to each NPC who is actually in sunlight and frames
// them from DOWN-SUN, so the cast shadow stretches toward the lens and fills
// the bottom of the frame. Same seed, same pose, same camera on both builds --
// so `--build A` against `--build B` is a like-for-like pair.
const g = window.GAME;
const SHOT = 'town_npcs';
g.applyShot(SHOT);
g.settle(60);
g.applyShot(SHOT);
g.settle(8);

const npcs = g.get('Npcs');
const sky = g.get('Sky');
const rig = g.get('CameraRig');
const out = { sun: null, framed: [] };

// three points a DirectionalLight FROM `position` TOWARD `target`, so the
// shadow of a person at P lands along (target - position) from P.
const sp = sky.sun.position.clone().normalize();
out.sun = [+sp.x.toFixed(2), +sp.y.toFixed(2), +sp.z.toFixed(2)];

// Sort by how lit they are: pick people standing on open tarmac, which here
// means the ones furthest from the diner block.
const list = npcs.list.slice().sort((a, b) => a.id < b.id ? -1 : 1);
for (const npc of list) {
  const p = npc.pos;
  // Stand the lens down-sun of them and a little above eye height: the person
  // is lit from behind the camera and their shadow runs toward it.
  const d = 3.4;
  const pos = [p.x - sp.x * d, p.y + 1.75, p.z - sp.z * d];
  const target = [p.x, p.y + 0.85, p.z];
  rig.setShot({ pos, target, fov: 40 });
  g.settle(2);
  out.framed.push({ id: npc.id, name: npc.name, lod: npc.body._lod, pos: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)] });
  await window.__shot(npc.id);
}
rig.clearShot();
return out;

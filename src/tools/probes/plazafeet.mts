/* Ablate the plaza deck and look: what is eating the townspeople's legs?
 *
 * `cityfeet.mts` says every body on the Lestallum square stands at exactly the
 * paving's own top -- sink 0.000 against `town_poi_paving`, measured by walking
 * the triangle that contains its (x, z) -- and `plaza-nopaving.jpg` says the
 * legs are still cut with the disc hidden. So the deck is not the occluder and
 * the sink is not a sink. This walks the rest of the scene one class at a
 * time, and finishes with the bodies alone against the sky: if the legs are
 * still short there, nothing is occluding them and the rig is not drawing them.
 */
const g = window.GAME;
const out = [];
const { SHOTS } = await import('/game/Shots.ts');
const npcs = g.get('Npcs');

SHOTS.__probe = {
  name: '__probe',
  pos: [-2956.8, 123.615, -696.8],
  target: [-2961.5, 121.215, -701.5],
  fov: 55,
  time: 10.5,
};
g.applyShot('__probe');
g.settle(90);
g.applyShot('__probe');
g.settle(10);

/** Hide every mesh whose name (or its parent's) matches, and say how many. */
const hide = (re) => {
  const hidden = [];
  g.scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const n = `${o.name} ${(o.parent && o.parent.name) || ''}`;
    if (re.test(n)) { hidden.push(o); o.visible = false; }
  });
  return hidden;
};
const shot = async (name, re) => {
  const h = re ? hide(re) : [];
  g.settle(4);
  await window.__shot(name);
  for (const o of h) o.visible = true;
  out.push(`${name.padEnd(12)} hid ${h.length}`);
};

await shot('a-control', null);
// The contact-shadow blob is a 1 x 1 plane 3.5 cm over the boots, drawn first
// (`renderOrder -2`). If it writes depth it eats whatever is under it.
await shot('b-noblob', /contact|blob/i);
await shot('b2-noshadow', /shadow/i);
await shot('c-noroad', /road/i);
await shot('d-noterrain', /terrain|clipmap|ground/i);
await shot('e-nopoi', /poi_/i);
// Everything but the people.
await shot('f-bodiesonly', /^(?!.*npc_).*$/);

const near = npcs.list.filter((n) => Math.hypot(n.pos.x + 2960, n.pos.z + 700) < 30);
for (const n of near.slice(0, 8)) {
  out.push(`  ${n.id.padEnd(12)} lod ${n.body._lod} blob ${n.body.groundShadow.visible} `
    + `blobMat depthWrite=${n.body.groundShadow.material.depthWrite} `
    + `transparent=${n.body.groundShadow.material.transparent} `
    + `renderOrder=${n.body.groundShadow.renderOrder} scale=${n.body.groundShadow.scale.x.toFixed(2)}`);
}

return out.join('\n');

/* Where does a townsperson's boot actually END?
 *
 * Three ablations said the Lestallum crowd is cut off mid-shin with NOTHING in
 * front of it -- hide the paving disc, hide the whole POI compound, hide every
 * mesh in the scene that is not a person, and the cut does not move. So the
 * question is no longer "what occludes the legs" but "does the rig draw them".
 *
 * `applyBoneTransform` is the CPU twin of the skinning the vertex shader does,
 * so it is the sole of the boot AS PHOTOGRAPHED. Every cheaper answer -- the
 * root, the foot bone, `Box3.setFromObject` -- reports the BIND pose and is
 * exactly as wrong as the bug being looked for.
 */
const g = window.GAME;
const out = [];
const terr = g.get('Terrain');
const player = g.get('Player');
const npcs = g.get('Npcs');
const props = g.get('Props');
const kits = props && props.poiKits;
const wm = (await import('/world/map/WorldMap.ts')).worldMap;
const V3 = g.camera.position.constructor;

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
g.get('Director').play();
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus').setScreen(null); step(10);

/** Lowest skinned vertex of a body, in world space, per mesh. */
const drawnFloor = (body) => {
  const v = new V3();
  const per = [];
  let lo = 1e9;
  for (const m of body.meshes) {
    if (!m.isSkinnedMesh) continue;
    m.updateMatrixWorld(true);
    const pa = m.geometry.getAttribute('position');
    if (!pa) continue;
    let mlo = 1e9, blo = 1e9;
    for (let i = 0; i < pa.count; i++) {
      if (pa.getY(i) < blo) blo = pa.getY(i);
      if (m.applyBoneTransform) {
        m.applyBoneTransform(i, v);
        v.applyMatrix4(m.matrixWorld);
        if (v.y < mlo) mlo = v.y;
      }
    }
    if (mlo < lo) lo = mlo;
    per.push(`${m.name.replace(/^npc_/, '')} skinned ${mlo.toFixed(3)} bind ${blo.toFixed(3)}${m.visible ? '' : ' HIDDEN'}`);
  }
  return { lo, per };
};

const report = (label, npc) => {
  const f = drawnFloor(npc.body);
  const b = npc.body.rig.byName;
  const bone = (n) => (b[n] ? (b[n].updateMatrixWorld(true), b[n].matrixWorld.elements[13].toFixed(3)) : '--');
  out.push(`${label} ${npc.id}  pos.y ${npc.pos.y.toFixed(3)}  lod ${npc.body._lod}  height ${npc.body.height.toFixed(2)}`);
  out.push(`   drawn floor ${f.lo.toFixed(3)}  = pos.y + ${(f.lo - npc.pos.y).toFixed(3)}`);
  out.push(`   bones: hipL ${bone('hipL')} kneeL ${bone('kneeL')} footL ${bone('footL')} toeL ${bone('toeL')}`);
  out.push(`   bone names: ${Object.keys(b).join(' ')}`);
  for (const p of f.per) out.push(`   ${p}`);
};

// The four at Hammerhead are the control: same rig, same archetype cache, and
// nobody has ever reported them footless.
const home = npcs.list.filter((n) => ['cindy', 'cid', 'takka'].includes(n.id));
for (const n of home) report('HAMMERHEAD', n);

const poi = wm.poiById('lestallum');
const px = poi.x, pz = poi.z, py = terr.heightAt(px, pz);
player.root.position.set(px, py, pz);
g.camera.position.set(px, py + 4, pz + 8);
g.camera.lookAt(px, py + 1, pz);
for (let i = 0; i < 200; i++) { player.root.position.set(px, py, pz); step(1); }
const plaza = kits && kits.anchorAt('lestallum', 'plaza');
out.push('');
out.push(`plaza anchor y ${plaza ? plaza.y.toFixed(3) : 'NULL'}`);
const near = npcs.list.filter((n) => plaza && Math.hypot(n.pos.x - plaza.x, n.pos.z - plaza.z) < 14);
for (const n of near.slice(0, 5)) report('LESTALLUM', n);

return out.join('\n');

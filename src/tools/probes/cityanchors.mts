/* Do the `_town` kit anchors resolve to world points on open pavement? */
const g = window.GAME;
const out = [];
const terr = g.get('Terrain');
const player = g.get('Player');
const props = g.get('Props');
const wm = (await import('/world/map/WorldMap.ts')).worldMap;
const kits = props && props.poiKits;

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
g.get('Director').play();
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus').setScreen(null); step(10);

if (!kits) return 'no PoiKits';

const _c = g.camera.position.clone();

/**
 * Vertices of everything solid near (cx, cz), as a flat world-space array.
 *
 * **A bounding box is useless here.** A POI compound is merged per material,
 * so `town_poi_render4` is one buffer whose box is the whole 92 m footprint --
 * every point in Lestallum tests "inside a building", including the middle of
 * the square. That false positive is the same shape as the `CollisionWorld`
 * one in `standingroom.mts`'s header, one level down. So this asks the
 * geometry itself: is there any surface standing at chest height where the
 * person would stand?
 */
const _p = g.camera.position.clone();
const _m = g.camera.matrixWorld.clone();
const srcNames = [];
const cloud = (cx, cz, range) => {
  const pts = [];
  srcNames.length = 0;
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    if (!o.visible || !o.isMesh || !o.geometry) return;
    // Every skinned body in the scene is a person, and the probe parks the
    // whole party on the pin to stream the place in. They are not architecture.
    if (o.isSkinnedMesh) return;
    const n = `${o.name} ${(o.parent && o.parent.name) || ''}`;
    if (/terrain|clipmap|water|grass|veg|sky|cloud|shadow|decal|npc|player|party|rain|fx|apron|pad|noctis|ignis|gladio|prompto|regalia|umbra/i.test(n)) return;
    const ni = srcNames.push(n.trim()) - 1;
    const pa = o.geometry.getAttribute('position');
    if (!pa) return;
    // An InstancedMesh's `position` attribute is the TEMPLATE at the geometry
    // origin; where the copies actually are lives in `instanceMatrix`. Reading
    // it raw put every vertex of the scatter at the group's own origin, which
    // is the middle of the square -- 80,154 "surfaces at chest height" on the
    // one spot in Lestallum that is definitionally empty. Walk the instances.
    if (o.isInstancedMesh) {
      const bb = o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox);
      const hi = bb ? bb.max.y : 0.4;
      src.length = src.length;
      for (let m = 0; m < o.count; m++) {
        o.getMatrixAt(m, _m);
        _p.set(_m.elements[12], _m.elements[13], _m.elements[14]).applyMatrix4(o.matrixWorld);
        if (Math.abs(_p.x - cx) > range || Math.abs(_p.z - cz) > range) continue;
        // one point at the base and one at the top, which is all a scatter is
        pts.push(_p.x, _p.y, _p.z, _p.x, _p.y + hi, _p.z);
        src.push(ni, ni);
      }
      return;
    }
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const bs = o.geometry.boundingSphere;
    if (bs) {
      _p.copy(bs.center).applyMatrix4(o.matrixWorld);
      if (Math.hypot(_p.x - cx, _p.z - cz) > range + bs.radius * Math.max(o.scale.x, o.scale.z) + 4) return;
    }
    for (let i = 0; i < pa.count; i++) {
      _p.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(o.matrixWorld);
      if (Math.abs(_p.x - cx) > range || Math.abs(_p.z - cz) > range) continue;
      pts.push(_p.x, _p.y, _p.z);
      src.push(ni);
    }
  });
  return pts;
};

/**
 * Is a person standing at (x, y, z) inside something?
 *
 * A surface between knee and head height within `r` metres is a wall, a
 * counter or a stall leg. The plaza slab is below the feet and the awnings and
 * strung lights are above the head, so neither trips it.
 */
const src = [];
const blockedAt = (pts, x, y, z, r, tally) => {
  let hits = 0;
  for (let i = 0; i < pts.length; i += 3) {
    const dy = pts[i + 1] - y;
    if (dy < 0.35 || dy > 1.85) continue;
    if (Math.hypot(pts[i] - x, pts[i + 2] - z) > r) continue;
    hits++;
    if (tally) tally[src[i / 3]] = (tally[src[i / 3]] || 0) + 1;
  }
  return hits;
};

for (const id of ['lestallum', 'galdin_quay']) {
  const poi = wm.poiById(id);
  out.push('');
  out.push(`-- ${poi.name} (${poi.x}, ${poi.z}) --`);
  const px = poi.x, pz = poi.z, py = terr.heightAt(px, pz);
  player.root.position.set(px, py, pz);
  g.camera.position.set(px, py + 4, pz + 8);
  g.camera.lookAt(px, py + 1, pz);
  for (let i = 0; i < 140; i++) { player.root.position.set(px, py, pz); step(1); }
  // Streamed. Now get the party off the square: four unnamed, un-skinned
  // meshes standing exactly on the pin are the companions, and they read as
  // 8,239 surfaces at chest height on the one spot that must be empty.
  player.root.position.set(px + 300, terr.heightAt(px + 300, pz), pz);
  step(4);

  const names = kits.anchorNames(id);
  out.push(`  ${names.length} anchors published`);
  if (!names.length) { out.push('  NOT BUILT (or kit published none)'); continue; }
  src.length = 0;
  const pts = cloud(px, pz, 60);
  out.push(`  ${pts.length / 3} surface points within 60 m`);
  let bad = 0;
  for (const n of names.sort()) {
    const w = kits.anchorAt(id, n);
    if (!w) { out.push(`  ${n.padEnd(8)} NULL`); bad++; continue; }
    if (/^light/.test(n)) { out.push(`  ${n.padEnd(8)} (${w.x.toFixed(1)}, ${w.y.toFixed(1)}, ${w.z.toFixed(1)})  bulb, ${(w.y - terr.heightAt(w.x, w.z)).toFixed(1)} m up`); continue; }
    const tally = {};
    const self = blockedAt(pts, w.x, w.y, w.z, 0.55, tally);
    if (self > 0) {
      const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 3);
      out.push(`    culprits: ${top.map(([k, v]) => `${srcNames[k]} x${v}`).join(', ')}`);
    }
    // Room to be walked up to: the eight compass points at 1.6 m.
    let clear = 8;
    for (let k = 0; k < 8; k++) {
      const t2 = (k / 8) * Math.PI * 2;
      if (blockedAt(pts, w.x + Math.cos(t2) * 1.6, w.y, w.z + Math.sin(t2) * 1.6, 0.5) > 0) clear--;
    }
    const th = terr.heightAt(w.x, w.z);
    const ok = self === 0 && clear >= 5;
    if (!ok) bad++;
    out.push(`  ${n.padEnd(8)} (${w.x.toFixed(1)}, ${w.y.toFixed(1)}, ${w.z.toFixed(1)})  ${ok ? 'OPEN' : 'BLOCKED'}  ${self} pts at chest  ${clear}/8 approach  terrain ${th.toFixed(1)} (${(w.y - th).toFixed(2)} above)`);
  }
  out.push(`  ${bad} anchor(s) not on open pavement`);
}

return out.join('\n');

/* Where, around each outpost POI, is there room for a person to stand and be seen? */
const g = window.GAME;
const out = [];
const terr = g.get('Terrain');
const player = g.get('Player');
const wm = (await import('/world/map/WorldMap.ts')).worldMap;
const { REMOTE } = await import('/characters/npc/Npcs.ts');

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
g.get('Director').play();
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus').setScreen(null); step(10);

const col = g.get('Collision');
out.push(`collision world: ${col ? 'present' : 'MISSING'}`);

// A probe is a function body in the page and the page has no bare-specifier
// map, so `import('three')` throws and `/node_modules/...` is outside vite's
// root. Everything below therefore uses only methods that already live on the
// objects in the scene: `clone()` off a live vector for scratch, and each
// mesh's own `computeBoundingBox` / `matrixWorld`.
const _c = g.camera.position.clone();

/**
 * World-space footprints of everything solid standing near (cx, cz).
 *
 * `CollisionWorld` does not carry the Lestallum or Galdin buildings - the
 * first placement pass trusted `blocked()` and put Iris in the middle of an
 * apartment block, which reported perfectly clear because the inside of a room
 * *is* clear standing room. So this asks the scene graph instead.
 */
const footprints = (cx, cz, range) => {
  const boxes = [];
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    if (!o.visible || !o.isMesh || !o.geometry) return;
    const n = `${o.name} ${(o.parent && o.parent.name) || ''}`;
    if (/terrain|clipmap|water|grass|veg|sky|cloud|shadow|decal|npc|player|party|rain|fx/i.test(n)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    if (!bb) return;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = -Infinity, y0 = Infinity;
    for (let i = 0; i < 8; i++) {
      _c.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
      _c.applyMatrix4(o.matrixWorld);
      if (_c.x < x0) x0 = _c.x;
      if (_c.x > x1) x1 = _c.x;
      if (_c.z < z0) z0 = _c.z;
      if (_c.z > z1) z1 = _c.z;
      if (_c.y < y0) y0 = _c.y;
      if (_c.y > y1) y1 = _c.y;
    }
    if (x1 < cx - range || x0 > cx + range || z1 < cz - range || z0 > cz + range) return;
    // A merged prop group covering half a kilometre says nothing about any one
    // spot, so ignore anything whose box is bigger than the outpost.
    if (x1 - x0 > range * 2 || z1 - z0 > range * 2) return;
    if (y1 - y0 < 1.2) return;                      // a kerb is not a building
    boxes.push({ x0, x1, z0, z1, y0, y1, name: n.trim() });
  });
  return boxes;
};

/** the building standing over (x, z), or null */
const inside = (boxes, x, z, y) => {
  for (const b of boxes) {
    if (x < b.x0 - 0.6 || x > b.x1 + 0.6 || z < b.z0 - 0.6 || z > b.z1 + 0.6) continue;
    if (b.y1 < y + 1.4) continue;                   // shorter than a person: not a roof
    return b;
  }
  return null;
};

for (const r of REMOTE) {
  const poi = wm.poiById(r.at);
  out.push('');
  out.push(`-- ${r.castKey} at ${poi.name} (${poi.x}, ${poi.z}) --`);

  // Stream this part of the world in before measuring it.
  const px = poi.x, pz = poi.z, py = terr.heightAt(px, pz);
  player.root.position.set(px, py, pz);
  g.camera.position.set(px, py + 4, pz + 8);
  g.camera.lookAt(px, py + 1, pz);
  for (let i = 0; i < 120; i++) { player.root.position.set(px, py, pz); step(1); }

  const boxes = footprints(px, pz, 120);
  out.push(`  ${boxes.length} solid volumes within 120 m`);

  const cx = poi.x + (r.dx || 0), cz = poi.z + (r.dz || 0);
  const hit = inside(boxes, cx, cz, terr.heightAt(cx, cz));
  out.push(`  authored (${r.dx || 0}, ${r.dz || 0}) -> (${cx.toFixed(0)}, ${cz.toFixed(0)})  ${hit ? `INSIDE "${hit.name}" (top ${hit.y1.toFixed(0)})` : 'open sky'}`);

  // Sweep for open ground with room to be walked up to from any side.
  const hits = [];
  for (let ring = 14; ring <= 110 && hits.length < 10; ring += 6) {
    for (let a = 0; a < 32; a++) {
      const th = (a / 32) * Math.PI * 2;
      const x = poi.x + Math.cos(th) * ring, z = poi.z + Math.sin(th) * ring;
      const y = terr.heightAt(x, z);
      if (inside(boxes, x, z, y)) continue;
      let room = true;
      for (let k = 0; k < 8 && room; k++) {
        const t2 = (k / 8) * Math.PI * 2;
        const rx = x + Math.cos(t2) * 2.4, rz = z + Math.sin(t2) * 2.4;
        if (inside(boxes, rx, rz, terr.heightAt(rx, rz))) room = false;
      }
      if (!room) continue;
      const gx = terr.heightAt(x + 8, z) - terr.heightAt(x - 8, z);
      const gz = terr.heightAt(x, z + 8) - terr.heightAt(x, z - 8);
      const grad = Math.hypot(gx, gz) / 16;
      if (grad > 0.2 || y < -5.5) continue;
      // How close is the nearest building? Standing beside one reads far better
      // than standing in the middle of a field.
      let near = 1e9;
      for (const b of boxes) {
        const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
        near = Math.min(near, Math.hypot(dx, dz));
      }
      hits.push({ dx: Math.round(Math.cos(th) * ring), dz: Math.round(Math.sin(th) * ring), ring, grad, y, near });
    }
  }
  hits.sort((a, b) => a.near - b.near);
  if (!hits.length) out.push('  no open standing room found within 110 m');
  else {
    for (const c of hits.slice(0, 8)) {
      out.push(`  open: dx ${String(c.dx).padStart(4)} dz ${String(c.dz).padStart(4)}  (${poi.x + c.dx}, ${poi.z + c.dz})  ${c.ring} m out  h=${c.y.toFixed(1)} grad=${c.grad.toFixed(2)}  ${c.near.toFixed(1)} m from the nearest building`);
    }
  }
}

return out.join('\n');

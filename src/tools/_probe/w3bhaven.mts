/*
 * The haven letterbox: name the mesh.
 *
 * Playtest complaint #1, case four: "Camping at the haven, the top ~35% and
 * bottom ~15% of the frame were a solid orange-brown plank (the awning). The
 * whole camp scene watched through a letterbox slit."
 *
 * REPRODUCED at `spawn_haven` "Redlyn Haven" (-31, -20) — the haven 37 m from
 * the party spawn and the first one anybody camps at. Two different systems
 * both build there and the census (pass 5) sees both:
 *   - `PoiKits._haven` (`PoiKits.ts:904`), meshes `haven_poi_*` — tent, tarp,
 *     chairs, lamp. No awning.
 *   - `Landmarks._haven` (`Landmarks.ts:177`), meshes `landmark_*` — the hero
 *     camp, whose 8.0 x 6.6 m cloth CANOPY on four 3.5 m poles
 *     (`Landmarks.ts:288-322`) is the awning. `Shots.ts:59` still records this
 *     camp at (-99.6, -59.7); pass 6 censused that spot and found nothing but
 *     terrain, so that note is stale.
 *
 * `CameraRig` "has never collided with a prop" (`CameraRig.ts:113`), so the arm
 * stays at its full 5.60 m and walks straight through the canopy. This pass
 * names the mesh: material identity against `Landmarks.mats`, and the band of
 * frame each mesh spans split above/below the lens.
 */
const g = window.GAME;
const player = g.get('Player');
const terr = g.get('Terrain');
const rig = g.get('CameraRig');
const hud = g.get('HUD');
const props = g.get('Props');
const dt = 1 / 60;
const inp = g.input;

g.applyShot('hud_field');
g.get('Director')?.play?.();
rig.clearShot?.();
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus')?.setScreen?.(null);
hud?.setVisible?.(true);
hud?.setMenuOpen?.(false);
g.resetClock();
inp.pointerLocked = true;
const step = (n) => { for (let i = 0; i < n; i++) g.frame(dt); };
const breathe = () => new Promise((r) => setTimeout(r, 0));
const out = [];
const emit = (s) => { out.push(s); console.log(s); };
const f1 = (n) => n.toFixed(1);
const f2 = (n) => n.toFixed(2);

const HX = Number(window.__HX ?? -31);
const HZ = Number(window.__HZ ?? -20);
const NEAR_R = Number(window.__NEAR ?? 12);
const CENSUS_R = Number(window.__CENSUS ?? 26);
const V3 = rig.cam.position.constructor;

/** Material identity -> the name the kit calls it. */
const matKey = new Map();
for (const [owner, bag] of [['landmark', props?.landmarks?.mats], ['poi', props?.poiKits?.mats]]) {
  if (!bag) continue;
  for (const k in bag) {
    const m = bag[k];
    if (m && m.uuid) matKey.set(m.uuid, `${owner}.${k}`);
  }
}
emit(`material identities known: ${matKey.size}`);

/* ------------------------------------------------------- put him on the deck */

player.root.position.set(HX, terr.heightAt(HX, HZ) + 3.0, HZ);
player.velocity?.set?.(0, 0, 0);
g.get('Party')?.snap?.();
rig._first = true;
for (let i = 0; i < 20; i++) { step(30); await breathe(); }
{
  const p = player.position;
  emit(`STANDING (${f1(p.x)}, ${f2(p.y)}, ${f1(p.z)})  terrain ${f2(terr.heightAt(p.x, p.z))}`
    + `  lift ${f2(p.y - terr.heightAt(p.x, p.z))}`);
}

/* ------------------------------------------------------------- the census */

const cands = [];
emit(`--- meshes with vertices within ${CENSUS_R} m of (${HX}, ${HZ})`);
g.scene.updateMatrixWorld(true);
g.scene.traverse((o) => {
  if (!o.isMesh || !o.visible) return;
  const nm = String(o.name || '');
  // Characters and terrain are not the complaint; keep the census to props.
  if (!/^landmark|^haven_poi|^roadkit|^roadflat/.test(nm)) return;
  const pa = o.geometry?.attributes?.position;
  if (!pa || !pa.count) return;
  const v = new V3();
  const kept = [];
  const lo = new V3(Infinity, Infinity, Infinity), hi = new V3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < pa.count; i++) {
    v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld);
    if (Math.hypot(v.x - HX, v.z - HZ) > CENSUS_R) continue;
    kept.push(v.x, v.y, v.z);
    lo.min(v); hi.max(v);
  }
  if (kept.length < 12) return;
  const mat = Array.isArray(o.material) ? o.material[0] : o.material;
  const key = matKey.get(mat?.uuid) || '(unmatched)';
  const col = mat?.color?.getHexString?.() ?? '??????';
  const geo = o.geometry;
  const tris = geo.index ? geo.index.count / 3 : pa.count / 3;
  cands.push({ name: nm, key, col, verts: kept, side: mat?.side, lo, hi });
  emit(`  ${nm}  ${key}  #${col} side=${mat?.side} ${String(tris).padStart(6)} tris`
    + `  ${kept.length / 3} verts near  box ${f1(hi.x - lo.x)}x${f1(hi.y - lo.y)}x${f1(hi.z - lo.z)}`
    + `  centre (${f1((lo.x + hi.x) / 2)}, ${f2((lo.y + hi.y) / 2)}, ${f1((lo.z + hi.z) / 2)})`
    + `  y ${f2(lo.y)}..${f2(hi.y)}`);
});

/* ------------------------------------------------------------ photograph it */

const bandOf = (cand, cam) => {
  const v = new V3(), w = new V3();
  let n = 0, y0 = Infinity, y1 = -Infinity, minD = Infinity;
  let above = 0, below = 0, aTop = -Infinity, bBot = Infinity;
  const a = cand.verts;
  for (let i = 0; i < a.length; i += 3) {
    w.set(a[i], a[i + 1], a[i + 2]);
    const d = w.distanceTo(cam.position);
    if (d > NEAR_R) continue;
    if (d < minD) minD = d;
    v.copy(w).project(cam);
    if (v.z > 1 || v.z < -1) continue;
    if (v.x < -1.1 || v.x > 1.1) continue;           // roughly on frame
    n++;
    if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y;
    if (w.y > cam.position.y) { above++; if (v.y > aTop) aTop = v.y; }
    else { below++; if (v.y < bBot) bBot = v.y; }
  }
  return n ? { n, y0, y1, minD, above, below, aTop, bBot } : null;
};

const PITCHES = String(window.__PITCH ?? '0.22').split(',').map(Number);
const YAWS = Number(window.__YAWS ?? 12);
for (const pitch of PITCHES) {
  for (let i = 0; i < YAWS; i++) {
    const yaw = (i / YAWS) * Math.PI * 2;
    rig.yaw = yaw; rig.yawTarget = yaw;
    rig.pitch = pitch; rig.pitchTarget = pitch;
    rig._first = true;
    step(30);
    await breathe();
    const cam = rig.cam;
    cam.updateMatrixWorld(true);
    const c = cam.position;
    const rows = [];
    for (const cd of cands) {
      const b = bandOf(cd, cam);
      if (b) rows.push({ cd, b });
    }
    rows.sort((a, b) => a.b.minD - b.b.minD);
    const tag = `p${String(pitch).replace('.', '')}-h${String(i).padStart(2, '0')}`;
    emit(`pitch ${f2(pitch)} yaw ${(yaw * 180 / Math.PI).toFixed(0).padStart(3)}: arm ${f2(rig.distance)} m`
      + `  lens (${f1(c.x)}, ${f2(c.y)}, ${f1(c.z)})  -> ${tag}`);
    const t = (v) => (Math.max(0, Math.min(1, (v + 1) / 2)) * 100).toFixed(0);
    for (const r of rows.slice(0, 5)) {
      emit(`    ${r.cd.name} ${r.cd.key} #${r.cd.col}  nearest ${f2(r.b.minD)} m`
        + `  frame y ${t(r.b.y0)}%..${t(r.b.y1)}%`
        + `  above lens ${r.b.above} verts (down to ${t(r.b.aTop)}%)`
        + `  below lens ${r.b.below} verts (up to ${t(r.b.bBot)}%)`);
    }
    if (window.__shot) await window.__shot(tag);
  }
}
return out.join('\n');

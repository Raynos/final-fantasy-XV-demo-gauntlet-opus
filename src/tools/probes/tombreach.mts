/*
 * A tomb's prompt must not move while it is being offered.
 *
 * This is the instrument for the defect `integration` found as
 * `1/86 unreachable: tomb_tomb_rogue->nothing` and could not explain, because
 * the row prints only the miss. `Tombs` hands `Interaction` a **live**
 * `Vector3` on the POI pin and re-points it onto the kit's `sarcophagus` anchor
 * the first time the streamer builds the temple, and `PoiKits._tomb` puts the
 * coffin at kit-local `z = cD / 2 + 2.6` under a 1.4 world scale -- so that
 * re-point is a constant **7.19 m**, with only the bearing turning under the
 * per-site yaw. `Interaction._pick` reads `pos` live, so a bind that lands
 * while the prompt is up teleports the target out from under whoever walked to
 * where it was advertised.
 *
 * Four claims, in the order they have to be true:
 *
 *  1. every tomb's kit eventually publishes a `sarcophagus` anchor, and
 *     `Tombs` binds to it -- if this fails the prompt is off forever, which is
 *     the price of the `enabled: () => n.anchored` gate;
 *  2. the pin-to-coffin distance is the same 7.19 m at every site, which is
 *     what makes any reach under it unable to cover the pin;
 *  3. **no enabled interactable's `pos` moves during its own walk-up**, which
 *     is the invariant the picker is written against and the one the pin-parked
 *     prompt broke;
 *  4. the walk-up itself -- `integration`'s own 2.2 m diagonal approach, over
 *     every enabled item, so a regression here is caught without waiting for
 *     the full audit.
 */
const g = window.GAME;
const worldMap = (await import('/world/map/WorldMap.ts')).worldMap;
const ix = g.get('Interaction'), player = g.get('Player'), terrain = g.get('Terrain');
const rpg = g.get('Rpg'), menus = g.get('Menus'), hud = g.get('HUD');
const kits = g.get('Props') && g.get('Props').poiKits;
if (!rpg || !rpg.tombs) return { error: 'no Rpg.tombs' };
if (!kits) return { error: 'no Props.poiKits' };
const out = [];
const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };

g.input.pointerLocked = true;
g.get('Director').play();
g.get('Story') && g.get('Story').applyShot && g.get('Story').applyShot(null);
g.get('Cinematics') && g.get('Cinematics').stop && g.get('Cinematics').stop({ skipped: true });
menus.setScreen(null); step(24);
hud.setMenuOpen(false); step(4);

/*
 * Claim 1 and 2. The **player** has to visit each site, not the camera:
 * `PoiKits.update` builds against the camera, and the camera rig re-derives the
 * camera from the player on every stepped frame, so a camera written straight
 * into `g.camera` is gone before `Props` reads it. Writing it and stepping 30
 * frames left four of the ten sites unbuilt, which reads exactly like a missing
 * anchor. `BUILD_R` is 1500 m and the ten tombs are spread over 7 km, and the
 * bind is throttled to a few times a second, so each site gets a few dozen
 * frames rather than one.
 */
const anchors = [];
let unanchored = 0, offPitch = 0;
for (const n of rpg.tombs.nodes) {
  const poi = worldMap.poiById(n.poiId);
  const py = terrain.heightAt(poi.x + 12, poi.z);
  for (let i = 0; i < 40; i++) { player.root.position.set(poi.x + 12, py, poi.z); step(1); }
  const a = kits.anchorAt(n.poiId, 'sarcophagus');
  const dPin = a ? Math.hypot(a.x - poi.x, a.z - poi.z) : NaN;
  if (!n.anchored || !a) unanchored++;
  // 7.19 m is `1.4 * (spanZ * 1.3 / 2 + 2.6)` out of `PoiKits._tomb`. A tomb
  // that disagrees means the kit's proportions moved and this file's arithmetic
  // -- and `Tombs`' reach -- have to move with them.
  if (!(Math.abs(dPin - 7.19) < 0.05)) offPitch++;
  anchors.push(`  ${n.poiId.padEnd(16)} anchored=${n.anchored ? 'y' : 'n'}`
    + ` enabled=${n.handle && n.handle.item.enabled() ? 'y' : 'n'}`
    + ` reach=${n.handle ? n.handle.item.radius : '?'}`
    + ` dPin=${a ? dPin.toFixed(2) : 'NO ANCHOR'}`);
}

/*
 * Claims 3 and 4. `integration`'s walk-up, verbatim: 2.2 m out on the diagonal,
 * facing the anchor, camera brought along (`Npcs.update` stops writing talk
 * anchors past 85 m), player pinned for eight stepped frames.
 */
const items = [...ix.items.values()].filter((i) => i.enabled());
const missed = [], moved = [];
for (const it of items) {
  const x0 = it.pos.x, z0 = it.pos.z;
  const ax = it.pos.x + 1.55, az = it.pos.z + 1.55;
  const ay = terrain.heightAt(ax, az);
  player.root.position.set(ax, ay, az);
  player.heading = Math.atan2(it.pos.x - ax, it.pos.z - az);
  player.root.rotation.y = player.heading;
  g.camera.position.set(ax + 4, ay + 3, az + 4);
  g.camera.lookAt(it.pos.x, ay + 1.2, it.pos.z);
  ix.current = null;
  for (let i = 0; i < 8; i++) { player.root.position.set(ax, ay, az); step(1); }
  const d = Math.hypot(it.pos.x - x0, it.pos.z - z0);
  if (d > 0.01) moved.push(`${it.id} moved ${d.toFixed(2)} m mid-walk-up`);
  const got = ix.current ? String(ix.current.id) : null;
  if (got !== it.id) missed.push(`${it.id}->${got || 'nothing'}`);
}

out.push(`${rpg.tombs.nodes.length} tombs; ${unanchored} never anchored; ${offPitch} off the 7.19 m pin-to-coffin pitch`);
for (const a of anchors) out.push(a);
out.push(`walk-up: ${items.length} enabled interactables, ${missed.length} unreachable, ${moved.length} moved while offered`);
for (const m of missed.slice(0, 8)) out.push(`  MISS  ${m}`);
for (const m of moved.slice(0, 8)) out.push(`  MOVED ${m}`);

return {
  report: out.join('\n'),
  tombs: rpg.tombs.nodes.length,
  unanchored,
  offPitch,
  items: items.length,
  missed,
  moved,
  pass: unanchored === 0 && offPitch === 0 && missed.length === 0 && moved.length === 0,
};

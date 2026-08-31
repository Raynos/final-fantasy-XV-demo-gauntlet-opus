/*
 * Where does fast travel put you, and is anything within reach when it does?
 *
 * "Fast-travelled to Hammerhead, stood in it, pressed INTERACT ten times.
 * Nothing. No prompt ever appeared telling me what was interactive or where to
 * stand. I have 42,180 gil and never spent any of it."
 *
 * No probe in this repo exercises fast travel at all -- `tombreach`,
 * `reachall`, `reaudit` and `integration` all place the player 1.3-2.2 m from
 * an anchor they already know about and ask whether it selects. That answers
 * "is this anchor reachable from beside it", never "is it reachable from where
 * the game actually puts the player", and never "could a human have walked to
 * the place the probe teleported to" -- all three write `player.root.position`
 * directly, which bypasses `CollisionWorld` entirely.
 *
 * This one does what `WorldMapScreen.accept()` does, for every `travel: true`
 * POI, and then asks three things at the arrival point:
 *
 *   1. is the arrival point itself inside geometry (`collision.blocked`)?
 *   2. what is the nearest ENABLED interactable, and is it inside its reach?
 *   3. how far is the nearest one that is NOT in reach -- i.e. how far the
 *      player has to walk, blind, before the game says anything?
 *
 * Run: node src/tools/probe.mts src/tools/probes/travelland.mts --dirty
 */
const g = window.GAME;
const { worldMap } = await import('/world/map/WorldMap.ts');
const ix = g.get('Interaction'), player = g.get('Player'), terrain = g.get('Terrain');
const collision = g.get('Collision');
const out = [];
const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };

g.get('Director')?.play?.();
g.get('Menus')?.setScreen?.(null);
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
step(30);

const dests = worldMap.pois.filter((p) => p.travel);
out.push(`${dests.length} fast-travel destinations, ${ix.items.size} interactables`);
out.push('');
out.push('poi                        blocked  nearest enabled item        dist  reach  in?');

let nothing = 0, blocked = 0;
const worst = [];
for (const p of dests) {
  const y = terrain.heightAt(p.x, p.z) + 0.1;
  player.position.set(p.x, y, p.z);
  if (player.root) player.root.position.copy(player.position);
  if (player.velocity) player.velocity.set(0, 0, 0);
  step(8);

  const bl = collision?.blocked ? collision.blocked(p.x, p.z, player.root.position.y, 0.36, 1.72, 0.45) : null;
  if (bl) blocked++;

  let best = null, bestD = Infinity;
  for (const it of ix.items.values()) {
    if (!it.enabled()) continue;
    const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
    if (d < bestD) { bestD = d; best = it; }
  }
  const inReach = best ? bestD <= best.radius : false;
  if (!inReach) { nothing++; worst.push([p.id, bestD, best ? best.id : '-']); }
  out.push(`${p.id.padEnd(26)} ${String(bl).padEnd(8)} ${(best ? best.id : '-').padEnd(26)}`
    + ` ${bestD === Infinity ? '  inf' : bestD.toFixed(1).padStart(5)}`
    + ` ${best ? best.radius.toFixed(1).padStart(5) : '    -'}  ${inReach ? 'yes' : 'NO'}`);
}

out.push('');
out.push(`arrivals inside geometry: ${blocked}/${dests.length}`);
out.push(`arrivals with NOTHING in reach: ${nothing}/${dests.length}`);
worst.sort((a, b) => a[1] - b[1]);
out.push(`nearest-miss distances, closest 10: ${worst.slice(0, 10).map((w) => `${w[0]} ${w[1].toFixed(1)}m`).join(', ')}`);

// And the specific one the report names.
const hh = worldMap.byId.get('hammerhead');
player.position.set(hh.x, terrain.heightAt(hh.x, hh.z) + 0.1, hh.z);
if (player.root) player.root.position.copy(player.position);
step(20);
out.push('');
out.push(`--- standing on the Hammerhead pin (${hh.x}, ${hh.z}) ---`);
out.push(`player y ${player.root.position.y.toFixed(2)}, terrain ${terrain.heightAt(hh.x, hh.z).toFixed(2)}`);
out.push(`prompt: ${ix.current ? `${ix.current.verb} ${ix.current.label}` : 'NONE'}`);
out.push(`far markers: ${ix.nearby ? ix.nearby.map((i) => `${i.id}@${Math.hypot(i.pos.x - hh.x, i.pos.z - hh.z).toFixed(1)}m`).join(', ') : 'n/a'}`);
const all = [...ix.items.values()].filter((i) => i.id.startsWith('hh_') && i.enabled())
  .map((i) => `${i.id} ${Math.hypot(i.pos.x - hh.x, i.pos.z - hh.z).toFixed(1)}m/r${i.radius}`);
out.push(`every hammerhead fixture: ${all.join(', ')}`);

// And a frame of it: what a player sees the moment they arrive.
const { SHOTS } = await import('/game/Shots.ts');
const gs = ix.items.get('hh_garage_shop');
if (gs && window.__shot) {
  const dx = gs.pos.x - hh.x, dz = gs.pos.z - hh.z;
  const L = Math.hypot(dx, dz);
  SHOTS.__probe = {
    pos: [hh.x - dx / L * 1.2, player.root.position.y + 1.7, hh.z - dz / L * 1.2],
    target: [gs.pos.x, gs.pos.y + 1.5, gs.pos.z],
    fov: 52, time: 11.0, weather: 'clear', hud: true,
  };
  g.applyShot('__probe');
  g.settle(50);
  player.position.set(hh.x, terrain.heightAt(hh.x, hh.z) + 0.1, hh.z);
  if (player.root) player.root.position.copy(player.position);
  step(12);
  await window.__shot('arrival');
  delete SHOTS.__probe;
}

return out.join('\n');

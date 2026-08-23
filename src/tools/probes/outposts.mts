/* The five people outside Hammerhead: do they build, stand on dry flat ground,
   and answer E? */
const g = window.GAME;
const out = [];
const ix = g.get('Interaction');
const npcs = g.get('Npcs');
const player = g.get('Player');
const terr = g.get('Terrain');
const menus = g.get('Menus');
const wm = (await import('/world/map/WorldMap.ts')).worldMap;
const SEA = -6.5;

let _hold = null;
const hold = () => {
  if (!_hold) return;
  player.root.position.set(_hold.x, _hold.y, _hold.z);
  player.heading = _hold.h; player.root.rotation.y = _hold.h;
  if (player.velocity) player.velocity.set(0, 0, 0);
};
const step = (n = 1) => { for (let i = 0; i < n; i++) { hold(); g.frame(1 / 60); hold(); } };
const tap = (code, frames = 3) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  step(frames);
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  step(2);
};
/** put the party AND the camera at (x, z) looking at `at`. */
const standAt = (x, z, at) => {
  const y = terr.heightAt(x, z);
  const h = at ? Math.atan2(at[0] - x, at[1] - z) : 0;
  _hold = { x, y, z, h };
  g.camera.position.set(x - Math.sin(h) * 4, y + 3, z - Math.cos(h) * 4);
  g.camera.lookAt(at ? at[0] : x, y + 1.2, at ? at[1] : z);
  step(30);
};

g.input.pointerLocked = true;
g.get('Director').play();
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null); step(20);
g.get('HUD').setMenuOpen(false); step(4);

const remote = (npcs._pending || []).slice();
out.push(`${remote.length} remote placements pending at boot; ${npcs.list.length} people built`);
out.push('');

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; out.push(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  ${extra}` : ''}`); };

for (const r of remote) {
  const poi = wm.poiById(r.at);
  const x = poi.x + (r.dx || 0), z = poi.z + (r.dz || 0);
  const h = terr.heightAt(x, z);
  const gx = terr.heightAt(x + 8, z) - terr.heightAt(x - 8, z);
  const gz = terr.heightAt(x, z + 8) - terr.heightAt(x, z - 8);
  const grad = Math.hypot(gx, gz) / 16;
  out.push(`-- ${r.castKey} at ${poi.name} (${Math.round(x)}, ${Math.round(z)}) h=${h.toFixed(1)} grad=${grad.toFixed(2)} --`);
  check('stands on dry ground', h > SEA + 1, `h=${h.toFixed(1)}`);
  check('stands somewhere walkable', grad < 0.42, `grad=${grad.toFixed(2)}`);

  // walk up from 2 m out, which is what makes the lazy build happen
  standAt(x + 2.0, z, [x, z]);
  const npc = npcs.list.find((n) => n.castKey === r.castKey);
  check('is built once the party is here', !!npc, npc ? '' : 'never spawned');
  if (!npc) { out.push(''); continue; }
  check('stands on the ground, not in it', Math.abs(npc.pos.y - h) < 1.2,
    `npc.y=${npc.pos.y.toFixed(1)} ground=${h.toFixed(1)}`);

  const sel = ix.current;
  check('E offers a conversation', !!sel && sel.id === `npc_${r.castKey}`,
    `prompt: ${sel ? `[E] ${sel.verb} ${sel.label}` : 'none'}`);
  if (sel && sel.id === `npc_${r.castKey}`) {
    tap('KeyE', 3);
    check('and the conversation opens', !!ix.talking);
    // Escape out rather than walking the hub: most of these loop back to the
    // menu, and a probe that presses E forty times just goes round it forty
    // times. Escape always leaves — a conversation must never trap the player.
    for (let i = 0; i < 6 && ix.talking; i++) tap('Escape', 3);
    check('and Escape leaves it', !ix.talking);
  }
  out.push('');
}

out.push(`${fails} failures`);
return out.join('\n');

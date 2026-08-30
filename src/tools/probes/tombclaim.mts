/*
 * Walk onto all ten royal tombs, press E, and check the arsenal afterwards.
 *
 * Eight of `Inventory`'s weapons carry the `royal` tag, cost 0 gil and were
 * granted by nothing anywhere in the game. `game/rpg/Tombs.ts` is the register
 * that hands them over; this is the instrument that says whether it does.
 *
 * It teleports rather than walks -- ten tombs are spread over 7 km of Lucis and
 * this is a correctness probe, not a traversal one. The POI streamer is given a
 * few dozen frames at each site so the temple actually builds, because the
 * prompt late-binds onto the kit's `sarcophagus` anchor and the *unanchored*
 * path is a different code path worth exercising at least once.
 */
const g = window.GAME;
const out = [];
const rpg = g.get('Rpg'), ix = g.get('Interaction'), menus = g.get('Menus');
const player = g.get('Player'), hud = g.get('HUD'), terrain = g.get('Terrain');
const tombs = rpg && rpg.tombs;
if (!tombs) return { error: 'no Rpg.tombs' };

let _hold = null;
const hold = () => {
  if (!_hold) return;
  player.root.position.set(_hold.x, _hold.y, _hold.z);
  player.heading = _hold.h; player.root.rotation.y = _hold.h;
  if (player.velocity) player.velocity.set(0, 0, 0);
};
const step = (n = 1) => { for (let i = 0; i < n; i++) { hold(); g.frame(1 / 60); hold(); } };
const tap = (code, frames = 1) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  step(frames);
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  step(2);
};

g.input.pointerLocked = true;
g.get('Director').play();
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null); step(24);
hud.setMenuOpen(false); step(4);

out.push(`${tombs.nodes.length} tombs registered, ${ix.items.size} interactables live`);

const rows = [];
let claimed = 0, prompted = 0, anchored = 0;
for (const n of tombs.nodes) {
  // Stand 3.5 m in front of the pin and look at it. Once the kit has built,
  // `Tombs.update` moves `n.pos` onto the sarcophagus and the hold moves with
  // it, which is exactly what a player walking up would experience.
  const place = () => {
    const px = n.pos.x + 3.5, pz = n.pos.z;
    _hold = { x: px, y: terrain.heightAt(px, pz), z: pz, h: Math.atan2(0, -1) };
  };
  place(); step(40); place(); step(20);

  const cur = ix.current;
  if (cur) prompted++;
  if (n.anchored) anchored++;
  const before = n.site.arm ? rpg.inventory.count(n.site.arm) : 0;
  const ap0 = rpg.ascension.ap;
  if (cur && String(cur.id).startsWith('tomb_')) { tap('KeyE'); step(8); }
  const after = n.site.arm ? rpg.inventory.count(n.site.arm) : 0;
  if (n.site.arm && after > before) claimed++;
  rows.push({
    tomb: n.poiId,
    name: n.name,
    arm: n.site.arm || '(plundered)',
    anchored: n.anchored,
    prompt: cur ? `${cur.verb} ${cur.label}` : 'NONE',
    got: n.site.arm ? after > before : n.claimed,
    ap: rpg.ascension.ap - ap0,
  });
}

// The arsenal, as the gear and Armiger screens read it.
const royal = ['sword_wise', 'blade_mystic', 'sword_father', 'axe_conqueror',
  'trident_oracle', 'star_rogue', 'bow_clever', 'shield_just'];
const held = royal.filter((id) => rpg.inventory.has(id));
const missing = royal.filter((id) => !rpg.inventory.has(id));

for (const r of rows) {
  out.push(`  ${String(r.tomb).padEnd(18)} ${String(r.name).padEnd(24)} ${String(r.arm).padEnd(16)}`
    + ` anchored=${r.anchored ? 'y' : 'n'} got=${r.got ? 'y' : 'n'} +${r.ap}ap  [${r.prompt}]`);
}
out.push(`prompts offered ${prompted}/${tombs.nodes.length}, sarcophagus-anchored ${anchored}/${tombs.nodes.length}`);
out.push(`royal arms held ${held.length}/8${missing.length ? ` -- MISSING ${missing.join(',')}` : ''}`);

return {
  report: out.join('\n'),
  tombs: tombs.nodes.length,
  prompted,
  anchored,
  claimed,
  royalArmsHeld: held.length,
  missing,
  pass: prompted === tombs.nodes.length && held.length === 8,
};

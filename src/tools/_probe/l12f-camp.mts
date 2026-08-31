/*
 * Lane 12f: photograph the haven camp the way a player stands in it.
 *
 * `poi_haven` is a 60 m aerial and `haven_dusk` does not point at a haven at
 * all, so neither frame can show the five defects the playtest filed (the light
 * cone, the log stripes, the tent moire, the missing party, the menu contrast).
 * This stands the player two metres off the fire, holds him there so the rig
 * settles behind his shoulder, and photographs the approach, the arrival lines
 * and the cook menu.
 *
 *   node src/tools/_probe/../probe.mts src/tools/_probe/l12f-camp.mts \
 *     --shot tmp/l12f/camp/c.jpg --set __L12F_HOUR=18.8
 */
const g = window.GAME;
const out = [];
const rpg = g.get('Rpg'), ix = g.get('Interaction'), menus = g.get('Menus');
const player = g.get('Player'), hud = g.get('HUD'), rig = g.get('CameraRig');
const terr = g.get('Terrain');
const HOUR = typeof __L12F_HOUR !== 'undefined' ? Number(__L12F_HOUR) : 18.8;

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

// Time of day: the playtest arrived at dusk. `setHour` is the only writer that
// also pushes the sky; assigning `rpg.day.hour` alone is silently undone.
rpg.day.setHour(HOUR);
const sky = g.get('Sky'); if (sky?.setTimeOfDay) sky.setTimeOfDay(HOUR);
step(8);

const h = rpg.day.havens()[0];
// Stand off the centre and face it, so the shoulder camera looks INTO the camp.
const party = g.get('Party') || g.get('Companions') || null;
const off = 9;
const px = h.pos[0] + off, pz = h.pos[2] + off;
_hold = { x: px, y: terr.heightAt(px, pz), z: pz, h: Math.atan2(-off, -off) };
step(60);
// The probe teleports Noctis, so the retinue is left wherever it booted and
// walks in at the 1.9 m/s a standing player allows. `snap()` puts them on their
// formation slots first, which is where a player who WALKED here would leave
// them -- otherwise this measures the teleport, not the stationing.
party?.snap?.();
rig.yaw = Math.atan2(px - h.pos[0], pz - h.pos[2]);
rig.pitch = -0.06;
step(90);
out.push(`haven ${h.id} at (${Math.round(h.pos[0])},${Math.round(h.pos[2])}) hour=${rpg.day.hour.toFixed(1)}`);
out.push(`prompt = ${ix.current ? `[E] ${ix.current.verb} ${ix.current.label}` : 'none'}`);

// Who is actually standing here?
const names = [];
g.scene.traverse((o) => {
  if (!o.visible) return;
  if (!/gladio|ignis|prompto|noctis/i.test(o.name || '')) return;
  const p = new (o.position.constructor)(); o.getWorldPosition(p);
  const d = Math.hypot(p.x - h.pos[0], p.z - h.pos[2]);
  if (d < 60) names.push(`${o.name}@${d.toFixed(0)}m`);
});
out.push(`party system: ${party ? party.constructor?.name || 'yes' : 'NONE'}`);
out.push(`character nodes within 60 m (${names.length}): ${names.slice(0, 12).join(', ')}`);

await window.__shot('1-approach');

tap('KeyE'); step(20);
await window.__shot('2-arrive');
/**
 * Advance to the CHOOSING state, not merely to the end of the first line.
 *
 * `Dialogue.update` renders the choice list at 0.45 (was 0.24) until
 * `_lineDone && _lineIdx >= _lines.length - 1`, and the cook node has two lines
 * whenever a meal is already running. A loop that stops at `_lineDone`
 * photographs the preview dim and reads as "the fix did nothing".
 */
const choosing = () => {
  const d = ix.dialogue;
  return !!(d && d._visibleChoices?.().length && d._lineDone
    && d._lineIdx >= (d._lines || []).length - 1);
};
for (let i = 0; i < 10 && !choosing(); i++) { tap('KeyE'); step(12); }
await window.__shot('3-menu');
let ch = ix.dialogue?._visibleChoices?.() || [];
out.push(`menu: ${ch.map((c) => c.label).join(' | ')}`);
if (ch.length) {
  ix.dialogue._sel = 0; step(2); tap('KeyE'); step(12);
  for (let i = 0; i < 10 && !choosing(); i++) { tap('KeyE'); step(12); }
  // The retinue WALKS to its camp marks, so give them the seconds they need.
  step(400);
  await window.__shot('4-cook');
  const hv = h;
  const dists = [];
  for (const m of (party?.members || [])) {
    dists.push(`${m.name || '?'}@${Math.hypot(m.root.position.x - hv.pos[0], m.root.position.z - hv.pos[2]).toFixed(1)}m`);
  }
  out.push(`party distance from the fire after stationing: ${dists.join(', ')}`);
  const st = party?.stations;
  out.push(`stations: ${st ? JSON.stringify(st.map((m) => m.map((v) => +v.toFixed(1)))) : 'null'}`);
  if (st) {
    const per = (party.members || []).map((m, i) => `${m.name}: ${Math.hypot(m.root.position.x - st[i][0], m.root.position.z - st[i][1]).toFixed(1)}m from mark, speed ${m.speed.toFixed(2)}`);
    out.push(per.join(' | '));
  }
  out.push(`haven origin (${hv.pos[0]},${hv.pos[2]}) player (${player.position.x.toFixed(1)},${player.position.z.toFixed(1)}) cam (${g.camera.position.x.toFixed(1)},${g.camera.position.z.toFixed(1)})`);
  out.push(`cook (${ix.dialogue.nodeId}) choosing=${choosing()}: ${ix.dialogue._visibleChoices().map((c) => c.label).join(' | ')}`);
}
if (ix.dialogue?.active) ix.dialogue.end();
return out.join('\n');

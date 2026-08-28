/* Frame the Titan's planted hand, which is the one part of him a player stands
   next to and the place a dozen fissure wedges were reported floating free. */
const g = window.GAME;
const out = [];
const enc = g.get('Encounters');
const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };

g.get('Director').play();
g.get('Menus').setScreen(null);
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('HUD')?.setVisible?.(false);
if (g.uiRoot) g.uiRoot.style.display = 'none';
step(10);
enc.startSetPiece('titan');
step(40);
const fight = enc.boss;
if (!fight) return 'no fight';
const boss = fight.boss;
const rig = g.get('CameraRig');
for (const which of ['handL', 'handR']) {
  const h = fight._handPos(which);
  if (!h) { out.push(`${which}: no bone`); continue; }
  out.push(`${which} at (${h.x.toFixed(1)}, ${h.y.toFixed(1)}, ${h.z.toFixed(1)}); boss root (${boss.root.position.x.toFixed(1)}, ${boss.root.position.y.toFixed(1)}, ${boss.root.position.z.toFixed(1)}) scale ${boss.scale}`);
  for (const [nm, dx, dy, dz, fov] of [['wide', 26, 14, 26, 42], ['close', 11, 6, 13, 40]]) {
    rig.setShot({ pos: [h.x + dx, h.y + dy, h.z + dz], target: [h.x, h.y + 1, h.z], fov });
    step(3);
    await window.__shot(`${which}-${nm}`);
  }
}
rig.clearShot();
return out.join('\n');

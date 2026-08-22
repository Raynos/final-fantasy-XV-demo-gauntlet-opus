/* Replicate combatloop's "damage numbers appear on the HUD" check, verbosely. */
const g = window.GAME;
const out = [];
const combat = g.get('Combat');
const enemies = g.get('Enemies');
const enc = g.get('Encounters');
const player = g.get('Player');
const hud = g.get('HUD');
const menus = g.get('Menus');

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const mouseDown = (b) => window.dispatchEvent(new MouseEvent('mousedown', { button: b, bubbles: true }));
const mouseUp = (b) => window.dispatchEvent(new MouseEvent('mouseup', { button: b, bubbles: true }));
const dom = () => [...document.querySelectorAll('.dmg .dv')].map((n) => n.textContent).join(' | ') || '(none)';

g.input.pointerLocked = true;
g.get('Director').play();
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null); step(20);
hud.setMenuOpen(false); step(4);

for (const id of [...enc.active.keys()]) enc.deactivate(id);
enc.packs.length = 0;
enemies.clear();
step(2);

const f = g.camera.getWorldDirection(player.position.clone());
f.y = 0; f.normalize();
const pos = player.position.clone().addScaledVector(f, 1.6);
player.heading = Math.atan2(f.x, f.z);
player.root.rotation.y = player.heading;
const e = enemies.spawn('sabertusk', { pos, heading: player.heading + Math.PI });
e.frozenPose = { state: 'idle', phase: 0 };
combat.drawSlot(0); step(2);

document.querySelectorAll('.dmg').forEach((n) => n.remove());
const log = [];
const f0 = g.time.frame;
const off = combat.on('damage', (d) => log.push(`   +${g.time.frame - f0} EVENT dmg=${d.damage} pos=${!!d.position} src=${d.source ? 'ally' : 'player'}`));
mouseDown(0);
for (let i = 0; i < 90; i++) {
  g.frame(1 / 60);
  const n = hud.combat.numbers.length;
  if (n) log.push(`   +${i} live=${n} dom=[${dom()}]`);
}
mouseUp(0); step(1);
off();
out.push(`sabertusk hp ${e.maxHp}; player level ${g.get('Rpg').noctis.level}`);
out.push(`immediately after the hold: numbers=${hud.combat.numbers.length} dom=[${dom()}]`);
out.push('frame log (first 40 lines):');
out.push(log.slice(0, 40).join('\n'));
out.push(`enemy alive=${!e.dead} hp=${Math.round(e.hp)}/${e.maxHp}`);
out.push(`combatA=${hud.combatA.toFixed(2)} fieldA=${hud.fieldA.toFixed(2)} mode=${hud.mode} menuOpen=${hud.menuOpen}`);

return out.join('\n');

/* Trace exactly where the E press is lost. */
const g = window.GAME;
const out = [];
const player = g.get('Player'), ix = g.get('Interaction'), town = g.get('Town');
const menus = g.get('Menus'), dir = g.get('Director'), hud = g.get('HUD'), story = g.get('Story');
const c = town.anchors.caravan;
const px = c.x - 1.4, pz = c.z, ph = Math.atan2(1, 0);
const y = g.get('Terrain').heightAt(px, pz);
const hold = () => {
  player.root.position.set(px, y, pz);
  player.heading = ph; player.root.rotation.y = ph;
  if (player.velocity) player.velocity.set(0, 0, 0);
};
const step = (n = 1) => { for (let i = 0; i < n; i++) { hold(); g.frame(1 / 60); hold(); } };

g.input.pointerLocked = true;
dir.play();
story?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null);
step(30);
hud.setMenuOpen(false);
step(14);
out.push(`current=${ix.current && ix.current.id}`);

// spy on keyDown for the press frame
const log = [];
const origKD = g.input.keyDown.bind(g.input);
g.input.keyDown = (code) => { const r = origKD(code); if (code === 'KeyE' || code === 'Enter') log.push(`${code}=${r}`); return r; };
// mark when Interaction.update starts and finishes
const origUpd = ix.update.bind(ix);
ix.update = (dt, game) => { log.push('>ix'); const r = origUpd(dt, game); log.push(`<ix cur=${ix.current && ix.current.id} firedAt=${ix._firedAt}`); return r; };

window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
log.push(`pressedSet=${[...g.input.pressed].join('|') || '-'}`);
hold(); g.frame(1 / 60); hold();
window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', bubbles: true }));
step(2);
out.push('trace: ' + log.join(' , '));
out.push(`dlg=${ix.dialogue.active} menu=${menus.name} firedAt=${ix._firedAt}`);
return out.join('\n');

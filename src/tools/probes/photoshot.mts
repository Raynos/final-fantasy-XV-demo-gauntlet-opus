/* Press the shutter. Does the quest log hear it? */
const g = window.GAME;
const out = [];
const menus = g.get('Menus');
const rpg = g.get('Rpg');
const player = g.get('Player');
const terr = g.get('Terrain');
const dir = g.get('Director');

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const tap = (code, frames = 3) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  step(frames);
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  step(2);
};

g.input.pointerLocked = true;
dir.play();
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null); step(20);
g.get('HUD').setMenuOpen(false); step(4);

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; out.push(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  ${extra}` : ''}`); };

const shot = menus.screens.photo;
check('the photo screen classifies subjects', typeof shot.subjects === 'function');

/** point the camera at (x, z) from `at` */
const aim = (ax, az, tx, tz) => {
  const ay = terr.heightAt(ax, az);
  player.root.position.set(ax, ay, az);
  g.camera.position.set(ax, ay + 1.7, az);
  g.camera.lookAt(tx, terr.heightAt(tx, tz) + 1.4, tz);
  g.camera.updateMatrixWorld(true);
};

// 1. the Meteor of the Disc, from the Lestallum parking
aim(-2880, -760, -1020, -2160);
out.push(`from the Lestallum parking, looking at the Disc: ${JSON.stringify(shot.subjects(g))}`);
check('the Meteor is a subject', shot.subjects(g).includes('meteor'));

// looking the other way it must not be
aim(-2880, -760, -4000, 400);
check('and only when the camera is pointed at it', !shot.subjects(g).includes('meteor'),
  JSON.stringify(shot.subjects(g)));

// 2. a beast in frame
const enemies = g.get('Enemies');
const px = 0, pz = 0, py = terr.heightAt(0, 0);
const e = enemies.spawn('sabertusk', { pos: g.camera.position.clone().set(px + 14, terr.heightAt(px + 14, pz), pz), level: 6 });
step(4);
aim(px, pz, px + 14, pz);
out.push(`with a sabertusk 14 m ahead: ${JSON.stringify(shot.subjects(g))}`);
check('a beast in frame is a subject', shot.subjects(g).includes('beast'));
aim(px, pz, px - 40, pz);
check('and not one behind the lens', !shot.subjects(g).includes('beast'), JSON.stringify(shot.subjects(g)));

// 3. the party, at a camp -- which is what the objective actually asks for
const party = g.get('Party');
const haven = rpg.day.havens().find((h) => h.pos);
/** put the party at the haven and let the formation settle */
const gather = () => {
  aim(haven.pos[0], haven.pos[2], haven.pos[0] + 40, haven.pos[2]);
  // `Party.snap` is the supported way to reform around a teleported player;
  // stepping and hoping leaves three companions three kilometres behind, which
  // is a harness artefact and reads exactly like a broken subject test.
  party.snap?.();
  step(2);
  aim(haven.pos[0], haven.pos[2], haven.pos[0] + 40, haven.pos[2]);
};
gather();
const camp = rpg.day.canCamp({ x: player.position.x, z: player.position.z });
out.push(`standing at "${haven.name}" with the party: ${JSON.stringify(shot.subjects(g))}`);
out.push(`  canCamp: ${camp.ok ? 'ok' : camp.reason}; party within 22 m: ${party.members.filter((m) => Math.hypot(m.root.position.x - g.camera.position.x, m.root.position.z - g.camera.position.z) < 22).length}/${party.members.length}`);
check('the party at a haven is a subject', shot.subjects(g).includes('party'));
aim(px, pz, px + 40, pz);
check('and not in the middle of the highway', !shot.subjects(g).includes('party'),
  JSON.stringify(shot.subjects(g)));

// 4. and the shutter has to reach the quest log
out.push('');
out.push('driving the real path: accept the quest, open photo mode, press the shutter');
const q = () => {
  const v = rpg.quests.view('side_nice_shot');
  return `${v.status} ${v.objectives.map((o) => `${o.progress}/${o.count}${o.done ? '*' : ''}`).join(' ')}`;
};
// the quest needs main_ch3_openworld done first
rpg.quests.states.main_ch3_openworld.status = 'complete';
rpg.quests.refresh();
const acc = rpg.quests.accept('side_nice_shot');
out.push(`  accept: ${acc.ok ? 'ok' : acc.reason}`);
out.push(`  before: ${q()}`);

// vista first, which is objective 1
aim(px, pz, px + 900, pz + 900);
g.camera.rotateX(0.12);
g.camera.updateMatrixWorld(true);
menus.setScreen('photo'); step(6);
tap('Space', 3); step(4);
out.push(`  after a vista: ${q()}`);

// then a beast
menus.setScreen(null); step(4);
if (!e.dead) e.root.position.set(px + 14, terr.heightAt(px + 14, pz), pz);
aim(px, pz, px + 14, pz);
menus.setScreen('photo'); step(6);
tap('Space', 3); step(4);
out.push(`  after a beast: ${q()}`);

// then the party, at the haven
menus.setScreen(null); step(4);
gather();
menus.setScreen('photo'); step(6);
gather();                                  // the six frames of screen-open drift the party
tap('Space', 3); step(6);
out.push(`  after the party: ${q()}`);
check('three photographs finish the quest', rpg.quests.status('side_nice_shot') === 'complete',
  rpg.quests.status('side_nice_shot'));
menus.setScreen(null);

out.push('');
out.push(`${fails} failures`);
return out.join('\n');

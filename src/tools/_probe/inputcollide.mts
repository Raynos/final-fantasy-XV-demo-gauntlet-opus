// Do combat's key bindings actually fire while you are driving the Regalia?
//
// The controls card documents two keymaps as if they were modes. They are not
// modes: `CombatSystem.update` gates `_readInput` on `input.enabled !== false`
// and `scenarioLock` only, and nothing in the tree sets either when the player
// gets into the car (`grep -rn isDriving src` finds three readers, all UI).
// So T, B, V, F and Space are read by BOTH systems on the same frame.
//
// This measures it rather than arguing it: get in the car, press each of the
// five shared keys for one frame, and record whether the combat side moved.
//
// Run: node src/tools/probe.mts src/tools/_probe/inputcollide.mts --dirty
const g = window.GAME;
const out = [];

g.applyShot('regalia_road');
g.get('Director')?.play?.();
g.get('CameraRig')?.clearShot?.();
g.resetClock();

const reg = g.get('Regalia');
const cbt = g.get('Combat') || g.get('CombatSystem');
const inp = g.input;
if (!reg) return 'NO REGALIA SYSTEM';
if (!cbt) return `NO COMBAT SYSTEM (systems: ${Object.keys(g.systems || {}).join(', ')})`;
const step = (n) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };

reg.enter(false);
step(30);
out.push(`driving = ${reg.isDriving}, input.enabled = ${inp.enabled}, scenarioLock = ${cbt.scenarioLock}`);
out.push('');

// Give combat something to spend, so a verb that needs MP is not silently
// refused for the wrong reason -- a "no collision" that is really "no MP" is
// exactly the false negative this probe exists to avoid.
if (cbt.setMp) cbt.setMp(cbt.maxMp ?? 100);
cbt.armiger && (cbt.armiger.gauge = 1);

const snap = () => ({
  state: cbt.state,
  stateTime: +(cbt.stateTime ?? 0).toFixed(3),
  lock: !!cbt.lockTarget,
  mp: +(cbt.mp ?? 0).toFixed(2),
  weapon: cbt.weapon,
  driving: reg.isDriving,
  cam: reg.driveCam && reg.driveCam.mode,
  offRoad: !!(reg.body && reg.body.offRoadMode),
  station: reg.radio && reg.radio.index,
});

const press = (key) => {
  const a = snap();
  inp.pressed.add(key);
  g.frame(1 / 60);
  step(4);
  const b = snap();
  const moved = Object.keys(a).filter((k) => a[k] !== b[k]);
  out.push(`  ${key.padEnd(7)} -> ${moved.length ? moved.map((k) => `${k}: ${a[k]} -> ${b[k]}`).join(', ') : 'nothing changed'}`);
  return moved;
};

// Outcomes are conditional -- `setLockOn(autoTarget())` with no enemy in the
// scene changes nothing, and reading that as "no collision" is the false
// negative that would let this ship. So count the CALLS: the claim under test
// is that combat reads the key at all while the player is in the car.
const calls = {};
for (const verb of ['heavy', 'dodge', 'drawEnergy', 'castSlot', 'setLockOn', 'tryArmiger', 'warpToPoint']) {
  const orig = cbt[verb];
  if (typeof orig !== 'function') { calls[verb] = 'ABSENT'; continue; }
  calls[verb] = 0;
  cbt[verb] = function (...a) { calls[verb]++; return orig.apply(this, a); };
}

out.push('--- the five keys both systems read ---');
for (const k of ['KeyV', 'KeyT', 'KeyB', 'Space', 'KeyF']) {
  press(k);
  // F exits the car; get back in so the rest of the run is still "while driving"
  if (!reg.isDriving) { reg.enter(false); step(20); }
}

out.push('');
out.push('--- combat verbs CALLED during the five presses above, while driving ---');
for (const k of Object.keys(calls)) out.push(`  ${k.padEnd(12)} ${calls[k]}`);

out.push('');
out.push('--- a control: a combat-only key, while driving ---');
press('KeyR');

out.push('');
out.push('--- and a Regalia-only key, while driving ---');
press('KeyI');
if (reg.auto) { reg.setAutoDrive(false); step(10); }

// ---------------------------------------------------------------------
// THE SECOND ARM, and the one that matters once a guard exists.
//
// A guard that switches combat off while driving is one `&&` away from
// switching combat off altogether, and nothing in the first arm above would
// notice -- "no combat verb fired" is exactly what it asserts. So get out of
// the car and press the same five keys standing in a field. Every one of them
// must come back.
out.push('');
out.push('--- the same five keys, ON FOOT ---');
reg.exit();
step(30);
for (const k of Object.keys(calls)) if (typeof calls[k] === 'number') calls[k] = 0;
// Read the state BEFORE the loop: `KeyF` is the last key pressed and it puts
// him straight back in the car, so a reading taken afterwards says
// `driving = true` and makes the arm look like it tested nothing.
out.push(`driving = ${reg.isDriving} (state at the start of this arm)`);
for (const k of ['KeyV', 'KeyT', 'KeyB', 'Space', 'KeyF']) {
  inp.pressed.add(k);
  g.frame(1 / 60);
  step(4);
}
for (const k of Object.keys(calls)) out.push(`  ${k.padEnd(12)} ${calls[k]}`);

const shared = ['heavy', 'dodge', 'drawEnergy', 'castSlot', 'setLockOn'];
out.push('');
out.push(shared.every((k) => calls[k] > 0)
  ? 'ON FOOT: every shared verb still fires. The guard is a mode, not a mute.'
  : `*** ON FOOT: ${shared.filter((k) => !calls[k]).join(', ')} did NOT fire -- the guard is too wide ***`);

return out.join('\n');

// The watchdog: does a party held at nought resolve even if nothing else does?
//
// `_probe/wipe.mts` shows the ordinary path resolving in six frames, so this
// tests the backstop directly -- `goDown` is stubbed out to simulate whatever
// the played session hit, and the question is whether the game still ends.
const g = window.GAME;
const d = g.get('Downed');
const rpg = g.get('Rpg');
const party = g.get('Party');
const player = g.get('Player');

rpg.inventory.remove?.('phoenix_down', rpg.inventory.count('phoenix_down'));
rpg.inventory.remove?.('potion', rpg.inventory.count('potion'));

// Break the ordinary path. Whatever the real cause was, the symptom reported
// was a party at nought that never went down; this reproduces the SYMPTOM.
d.goDown = () => {};

const zero = () => {
  d.noctis.hp = 0;
  player.stats.hp = 0;
  for (const m of party.members) { const s = d.memberStats(m.key); if (s) { s.hp = 0; m.downed = false; } }
};

zero();
const out = { everyoneDown: d._everyoneDown(), rows: [] };
for (const secs of [1, 2, 4]) {
  for (let i = 0; i < 60 * secs; i++) { zero(); g.frame(1 / 60); }
  out.rows.push({ atSeconds: secs, held: +d._wipeHeld.toFixed(1), state: d.state, inputEnabled: g.input.enabled });
}
out.resolved = d.state === 'gameover';
return out;

// Reproduce the party wipe that a green combatloop believes it covers.
//
// Reported twice, once over an hour: all four at 0 HP, Noctis still walking,
// enemies still alive, the prompt bar still offering ATTACK -- no game over, no
// revive, no message. This drives the same state directly and watches what
// `Downed` does with it.
const g = window.GAME;
const d = g.get('Downed');
const rpg = g.get('Rpg');
const party = g.get('Party');
const player = g.get('Player');

const snap = (label) => ({
  label,
  state: d.state,
  noctisHp: Math.round(d.noctis?.hp ?? -1),
  playerHp: Math.round(player.stats?.hp ?? -1),
  bleedOut: +(d.bleedOut ?? 0).toFixed(1),
  liveAllies: d._liveAllies().map((m) => m.key),
  memberHp: party.members.map((m) => `${m.key}:${Math.round(d.memberStats(m.key)?.hp ?? -1)}${m.downed ? '(down)' : ''}`),
  inputEnabled: g.input.enabled,
});

const zeroAll = () => {
  d.noctis.hp = 0;
  player.stats.hp = 0;
  for (const m of party.members) {
    const s = d.memberStats(m.key);
    if (s) s.hp = 0;
  }
};

const out = { phoenix: rpg.inventory.count('phoenix_down'), rows: [] };
// No Phoenix Down in the bag, or the last-resort revive fires and this tests
// nothing. Same for potions, which allies drink at 28%.
rpg.inventory.remove?.('phoenix_down', out.phoenix);
rpg.inventory.remove?.('potion', rpg.inventory.count('potion'));

zeroAll();
out.rows.push(snap('t=0, everything at zero'));
for (let i = 0; i < 6; i++) { g.frame(1 / 60); zeroAll(); }
out.rows.push(snap('after 6 frames held at zero'));
// Long enough for bleedOut (and then some) without holding HP down, so the
// systems get to resolve it however they mean to.
for (let i = 0; i < 60 * 12; i++) g.frame(1 / 60);
out.rows.push(snap('after 12 s of simulation'));
out.reachedGameOver = d.state === 'gameover';
return out;

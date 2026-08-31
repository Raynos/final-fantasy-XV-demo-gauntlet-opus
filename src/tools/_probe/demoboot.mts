// Does the demo path actually assemble itself after the first frame?
//
// The town, its nine people and their painted faces all now arrive AFTER the
// frame that shows the game. That is the whole point of the split and it is
// also the one way it can be wrong: a deferred thing that never lands looks
// exactly like a deferred thing, until you walk up to an empty forecourt.
const g = window.GAME;
const town = g.get('Town');
const npcs = g.get('Npcs');
const before = {
  townDeferred: town._deferred,
  townShell: !!town.shell,
  npcCount: npcs.list.length,
  awaitTown: npcs._awaitTown,
  chartSize: g.get('Minimap').chart.size,
};
// Run wall-clock frames until the deferred containers land and the town builds.
const t0 = performance.now();
while (performance.now() - t0 < 12000 && (town._deferred || npcs._awaitTown)) {
  g.frame(1 / 60);
  await new Promise((r) => setTimeout(r, 4));
}
const heads = npcs.list.filter((n) => n.body && n.body.root).length;
return {
  before,
  after: {
    townDeferred: town._deferred,
    townShell: !!town.shell,
    npcCount: npcs.list.length,
    heads,
    awaitTown: npcs._awaitTown,
    tookMs: Math.round(performance.now() - t0),
  },
};

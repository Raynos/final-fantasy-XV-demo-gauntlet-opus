/*
 * Ride one authored race course end to end, and buy the things the stable sells.
 *
 *   node src/tools/probe.mts src/tools/probes/chocoborace.mts --ttl 90 --dirty
 *   node src/tools/probe.mts src/tools/probes/chocoborace.mts --set __RACE=race_weaverwilds
 *
 * This is task 71's done-when instrument: *one race completable end-to-end by
 * a probe*. It does not simulate the race — it plays it. The autopilot writes
 * `input.move`, so every metre goes through the real `ChocoboBody`: the same
 * `CharacterController`, the same slope refusal, the same damped acceleration
 * a player gets. A course this cannot finish is a course a player cannot
 * finish.
 *
 * **`Input.update` writes `this.move.set(...)` at the top of every
 * `Game.frame`**, so setting `move` before the frame is overwritten by it and
 * replacing the vector wholesale throws. Wrap `update` — the same trick
 * `chocobostage.mts` uses to gallop.
 *
 *   --set __RACE=race_paddock|race_weaverwilds|race_alpine
 *   --set __HUB=wiz|alpine
 */
const g = window.GAME;
const out = [];
const terr = g.get('Terrain');
const player = g.get('Player');
const cb = g.get('Chocobo');
const rpg = g.get('Rpg');
const wm = (await import('/world/map/WorldMap.ts')).worldMap;

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
if (!cb) return 'no Chocobo system registered';

g.get('Director')?.play?.();
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus')?.setScreen?.(null);
step(10);

const raceId = String(window.__RACE ?? 'race_paddock');
const course = cb.races.course_(raceId);
if (!course) return `no such course: ${raceId}`;
const hub = cb.hub.hubDef(course.hub);
const poi = wm.poiById(hub.poi);
out.push(`${hub.name} — poi ${hub.poi} at (${poi.x.toFixed(0)}, ${poi.z.toFixed(0)}), ground ${terr.heightAt(poi.x, poi.z).toFixed(1)} m`);

/* -- walk into the yard --------------------------------------------------- */

const px = poi.x + hub.dx - 4, pz = poi.z + hub.dz - 4;
player.root.position.set(px, terr.heightAt(px, pz), pz);
player.velocity?.set?.(0, 0, 0);
g.get('Party')?.snap?.();
// Streaming, collision and vegetation all need frames after a teleport; a
// measurement taken on the first frame after one is a measurement of the
// loading screen.
step(90);

/* -- the stable is furniture, and it has to be there ---------------------- */

const ix = g.get('Interaction');
for (const id of [`chocobo-stable-${hub.key}`, `chocobo-races-${hub.key}`]) {
  const item = ix?.items?.get(id);
  out.push(item
    ? `interactable ${id}: "${item.verb} ${item.label}" at ground ${item.pos.y.toFixed(1)} m, ${Math.hypot(item.pos.x - player.position.x, item.pos.z - player.position.z).toFixed(1)} m away`
    : `interactable ${id}: MISSING`);
}

/* -- the economy, driven through the real dialogue rows ------------------- */

const inv = rpg?.inventory;
const gil0 = inv?.gil ?? 0;
const ap0 = rpg?.ascension?.ap ?? 0;

if (hub.dyes) {
  const script = cb.hub.stableScript(hub);
  const row = script.nodes.dyelist.choices.find((c) => c.label === 'Black');
  const to = row.action(g);
  out.push(`dye Black -> node "${to}", colour now ${cb.colour}, gil ${gil0} -> ${inv.gil}, owned ${[...cb.ownedColours].join('/')}`);
}

{
  // Feed her, from nothing: the greens are bought the way a player buys them.
  inv?.add?.('sylkis_greens', 2, 'probe');
  const script = cb.hub.stableScript(hub);
  const row = script.nodes.feedmenu.choices.find((c) => c.label === 'Feed her');
  const to = row.action(g);
  out.push(`feed -> node "${to}", tier ${cb.feedTier}, greens left ${inv?.count?.('sylkis_greens')}`);
}

/* -- enter the race, through the board's own row -------------------------- */

const board = cb.hub.raceScript(hub);
const entryRow = board.nodes.pick.choices.find((c) => c.label === course.name);
const gilAtLine = inv?.gil ?? 0;
const redirect = entryRow.action(g);
out.push(`enter "${course.name}" -> ${redirect === null ? 'started' : `node "${redirect}"`}, entry ${course.entry} gil (${gilAtLine} -> ${inv?.gil})`);
if (!cb.races.running) return `${out.join('\n')}\nRACE DID NOT START`;
out.push(`riding: ${cb.isRiding}, gates ${cb.races._gates.length}`);
for (let i = 0; i < cb.races._gates.length; i++) {
  const gt = cb.races._gates[i];
  const auth = course.checkpoints[i];
  const drift = Math.hypot(gt.x - (poi.x + auth.dx), gt.z - (poi.z + auth.dz));
  out.push(`  gate ${i + 1}: (${gt.x.toFixed(0)}, ${gt.z.toFixed(0)}) h=${gt.y.toFixed(1)} r=${gt.r}${drift > 0.5 ? `  [legalised ${drift.toFixed(0)} m off the authored spot]` : ''}`);
}

/* -- the autopilot -------------------------------------------------------- */

/*
 * No `import('three')` here. A probe body is evaluated **inside the page**,
 * where a bare specifier does not resolve — `Failed to resolve module
 * specifier 'three'` is what you get, and it is not worth a URL import for six
 * lines of arithmetic. The camera's world forward is the negated third column
 * of its world matrix, which is all `getWorldDirection` does.
 */
const inp = g.input;
const realUpdate = inp.update.bind(inp);
const realKey = inp.key.bind(inp);
/**
 * Steer at the next gate, in camera space.
 *
 * `ChocoboBody.step` builds its wish vector as `right * mv.x + fwd * mv.y`
 * with `fwd` the camera's flattened forward and `right = fwd x up`. Both are
 * unit and orthogonal, so the input that produces a world direction `d` is
 * just `d` projected onto each of them — no inverse, no atan2, and it stays
 * correct as the follow camera swings behind the turn.
 */
inp.update = () => {
  realUpdate();
  const gate = cb.races._gates[cb.races.idx];
  if (!gate) { inp.move.set(0, 0); return; }
  const e = g.camera.matrixWorld.elements;
  let fx = -e[8], fz = -e[10];
  const fl = Math.hypot(fx, fz);
  if (fl < 1e-6) { fx = 0; fz = 1; } else { fx /= fl; fz /= fl; }
  // right = fwd x up, with up = (0,1,0) -- which is (-fz, 0, fx).
  const rx = -fz, rz = fx;
  let dx = gate.x - player.position.x, dz = gate.z - player.position.z;
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl; dz /= dl;
  inp.move.set(dx * rx + dz * rz, dx * fx + dz * fz);
};
// Hold the burst the whole way. Stamina is finite and recovers, so this is the
// realistic ceiling a good rider gets, not a cheat.
inp.key = (code) => (code === 'ShiftLeft' ? true : realKey(code));

const CAP = Math.ceil(course.limit * 62);
let frames = 0;
while (cb.races.running && frames < CAP) { step(); frames++; }
inp.update = realUpdate;
inp.key = realKey;
step(2);

/* -- what happened -------------------------------------------------------- */

const last = cb.races.last;
out.push(`ran ${(frames / 60).toFixed(1)} s of frames`);
out.push(last
  ? `RESULT ${last.outcome.toUpperCase()}  ${last.time.toFixed(2)} s  (par ${course.par})  +${last.gil} gil  +${last.ap} AP`
  : 'RESULT none — the race neither finished nor aborted');
out.push(`best for ${course.id}: ${cb.races.best[course.id] != null ? `${cb.races.best[course.id].toFixed(2)} s` : 'none'}`);
out.push(`gil ${gil0} -> ${inv?.gil}   AP ${ap0} -> ${rpg?.ascension?.ap}`);
out.push(`after: running=${cb.races.running}, riding=${cb.isRiding}, waypoint=${g.get('Minimap')?.waypoint ? 'set' : 'cleared'}, clock DOM=${document.querySelector('.race-clock') ? 'PRESENT' : 'removed'}`);
return out.join('\n');

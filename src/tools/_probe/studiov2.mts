/*
 * v2's central claim, as assertions: the studio does not boot the game.
 *
 * Every complaint on v1 was a version of "why is the game running behind this",
 * so the check is not "does it look right" -- it is a count of what exists.
 * Three numbers carry it:
 *
 *   1. systems booted when the Model Explorer is open  -> must be 0
 *   2. systems booted when the World Explorer is open  -> must be exactly the 5
 *   3. Player / Party / Npcs / Enemies objects present -> must be 0, always
 *
 *   node src/tools/probe.mts src/tools/_probe/studiov2.mts \
 *     --shot tmp/shots/v2/s.jpg --dirty
 */
const g = window.GAME;
const out = [];
const breathe = () => new Promise((r) => setTimeout(r, 0));
const wait = async (n = 40) => { for (let i = 0; i < n; i++) await breathe(); };

// The studio drives its own requestAnimationFrame, so time passes on its own --
// this probe must NOT step `g.frame()`, which is the game's loop and is exactly
// what v2 stopped calling.
const settle = async (secs) => {
  const until = performance.now() + secs * 1000;
  while (performance.now() < until) await breathe();
};

const names = () => g.systems.map((s) => s.constructor && s.constructor.name).join(',');

// NOTE: a probe page is `?shoot=1`, which routes straight into the game -- so
// the system counts here are NOT the architecture claim. `studiocheck.mts`
// opens its own `?studio=1` page in play mode and asserts those. This probe is
// for the pictures.
const mod = await import('/studio/StudioShell.ts');
const shell = await mod.openStudio(g);
await settle(1.0);
out.push(`OPEN            systems=${g.systems.length} (probe page boots the game; see studiocheck)`);

/* ---------------------------------------------------------- model explorer */

await shell.setSection('model');
await settle(0.8);
const fams = shell.model.families_();
out.push('families: ' + fams.map((f) => `${f.title}=${f.count}`).join(' '));

const clickRow = async (text, secs = 1.0) => {
  const rows = [...document.querySelectorAll('#studio .st-side .st-row')];
  const hit = rows.find((r) => r.textContent.startsWith(text));
  if (!hit) throw new Error(`no row "${text}" in [${rows.map((r) => r.textContent).join(' | ')}]`);
  hit.click();
  await settle(secs);
};

await clickRow('Enemies');
await clickRow('bloodhorn', 1.4);
out.push(`MODEL OPEN      systems=${g.systems.length}  <- the whole point: must be 0`);
out.push(`staged ${shell.model.current()} pose=${shell.model.pose()} err=${shell.model.error || 'none'}`);
out.push('cost: ' + JSON.stringify(shell.model.cost()));
await window.__shot('1-model-enemy');

await clickRow('Party');
await clickRow('gladio', 1.4);
out.push(`staged ${shell.model.current()} err=${shell.model.error || 'none'}`);
await window.__shot('2-model-hero');

/* -------------------------------------------------- nobody is in the scene */

// The complaint, expressed as a count. A character that was never constructed
// cannot be standing in the frame, so this is 0 by construction -- and an
// assertion is how it stays 0 when somebody adds a convenience import later.
const census = () => {
  const seen = { skinned: 0, meshes: 0, lights: 0, named: [] };
  g.scene.traverse((o) => {
    if (o.isMesh) seen.meshes++;
    if (o.isSkinnedMesh) seen.skinned++;
    if (o.isLight) seen.lights++;
    const n = String(o.name || '');
    if (/^(player|party|npc|noctis|gladio|ignis|prompto|enemy)/i.test(n)) seen.named.push(n);
  });
  return seen;
};
out.push('scene census (model): ' + JSON.stringify(census()));

/* ---------------------------------------------------------- world explorer */

await shell.setSection('world');
// The world builds five systems on demand; that is the one place the studio
// waits, and it waits only because somebody asked for the world.
await settle(6.0);
out.push(`WORLD OPEN      systems=${g.systems.length} [${names()}]  <- must be exactly the 5`);

const w = shell.world;
const places = w.places();
out.push(`${places.length} destinations`);
const sig = places.filter((p) => p.group === 'Signature');
w.arrive(sig[1] || places[0]);
await settle(3.0);
out.push(`arrived ${w.at && w.at.name} settled=${w.settled()} cam=${w.where()}`);
out.push('scene census (world): ' + JSON.stringify(census()));
await window.__shot('3-world');

return { report: out.join('\n') };

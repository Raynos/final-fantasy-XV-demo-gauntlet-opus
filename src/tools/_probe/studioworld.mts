/*
 * Fly the World Explorer's Signature band and photograph every arrival.
 *
 * Two things this is for. It proves the section works -- the list builds, a row
 * click lands the camera, the streamer catches up -- and it produces the
 * contact sheet the Signature list is supposed to be *chosen from*. That list
 * is a first draft picked off the map (`src/studio/Signature.ts` says so), and
 * the whole point of authoring it by hand is that somebody looks at the places
 * and disagrees.
 *
 *   node src/tools/probe.mts src/tools/_probe/studioworld.mts \
 *     --shot tmp/shots/signature/s.jpg --dirty --ttl 25
 */
const g = window.GAME;
const mod = await import('/studio/StudioShell.ts');
const shell = await mod.openStudio(g);
const out = [];
const step = (n) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const breathe = () => new Promise((r) => setTimeout(r, 0));
const settle = async (s) => { for (let i = 0; i < Math.ceil(s * 6); i++) { step(10); await breathe(); } };

shell.setSection('world');
await settle(0.5);

const w = shell.world;
const places = w.places();
const sig = places.filter((p) => p.group === 'Signature');
const groups = [...new Set(places.map((p) => p.group))];
out.push(`${places.length} destinations in ${groups.length} bands`);
out.push('bands: ' + groups.join(' | '));
// Counted from the module, never from a number written here -- the same rule
// the Model Explorer's family counts follow, and for the same reason.
const authored = (await import('/studio/Signature.ts')).SIGNATURE;
out.push(`signature: ${sig.length} resolved of ${authored.length} authored`);
const missing = authored.filter((a) => !sig.some((s) => s.id === a.id)).map((a) => a.id);
if (missing.length) out.push('NOT IN THIS BUILD: ' + missing.join(' '));

for (const p of sig) {
  w.arrive(p);
  // Arrival is a sequence, not a jump: the world streams around the camera, so
  // hold until `Props` says it has packed everything it has built rather than
  // photographing a grey field. Bounded, because a hold that never ends is a
  // hang and this has to fail loudly instead.
  let held = 0;
  await settle(1.2);
  while (!w.settled() && held < 40) { await settle(0.25); held++; }
  await settle(1.0);
  out.push(`${p.id.padEnd(24)} (${p.x.toFixed(0)}, ${p.z.toFixed(0)}) back=${p.back}`
    + ` held=${(held * 0.25).toFixed(1)}s settled=${w.settled()} cam=${w.where()}`);
  await window.__shot(p.id);
}

return { report: out.join('\n') };

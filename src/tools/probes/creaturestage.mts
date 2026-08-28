/*
 * Photograph one species from four angles, on real ground, in real light.
 *
 *   node src/tools/probe.mts src/tools/probes/creaturestage.mts \
 *     --shot tmp/shots/cs/a.jpg --set __SPECIES=anak --dirty
 *
 * Thirteen of the twenty-three species have a shot in `src/game/Shots.ts`; the
 * other ten — the anak among them — have never been photographable without
 * either editing the corpus (which invalidates the daemon's warm page) or
 * driving the `?debug=1` isolation stage by hand. The enemies handoff asked
 * three rounds running for a permanent version of the throwaway script it kept
 * rewriting; this is it.
 *
 * Four framings, because the four questions a sculpt has to answer are not the
 * same question: the SIDE is the silhouette and the value structure, the
 * THREE-QUARTER is whether the masses join, the HEAD is the read at combat
 * range, and the FEET framing exists because feet are where every creature in
 * this roster has been weakest and no full-body shot has ever resolved one.
 *
 * `--set __SPECIES=a,b,c` for several, `--set __POSE=run` for a gait.
 * The subject is frozen through `Enemy.freeze` + `Enemies.frozen`, the same
 * path `creaturecheck` and the bestiary shots use, so what is photographed is
 * the pose the gate measures.
 */
const g = window.GAME;
const out = [];
const enemies = g.get('Enemies');
const terr = g.get('Terrain');
const player = g.get('Player');

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };

g.get('Director')?.play?.();
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus')?.setScreen?.(null);
g.get('HUD')?.setVisible?.(false);
// `HUD.setVisible(false)` does not reach the objective card, the tutorial
// prompt or the quest toast — they are separate DOM under `uiRoot`, and one of
// them sat across the subject's shoulders in the first capture taken here.
if (g.uiRoot) g.uiRoot.style.display = 'none';
g.get('Sky')?.setTimeOfDay?.(Number(window.__HOUR ?? 15.4));
g.get('Weather')?.set?.(String(window.__WEATHER ?? 'clear'));
step(20);

const rig = g.get('CameraRig');
const species = String(window.__SPECIES ?? 'anak').split(',').filter(Boolean);
const pose = String(window.__POSE ?? 'idle');
/* `idle` is a *loop*, not a pose: the anak's grazes with its muzzle in the
 * grass and lifts its head every few seconds, so the phase decides whether you
 * photograph a neck or a face. 3.1 is what `creaturecheck` holds; 5.6 is the
 * top of the lift. */
const phase = Number(window.__PHASE ?? 3.1);

/* The stage is the player's own footing — ground the harness already trusts —
 * with the party walked out of frame rather than hidden, because a hidden
 * mesh still lights the shot and a hero standing in it reads as a scale bar
 * nobody asked for. */
const base = player.position.clone();
player.root.position.set(base.x + 26, terr.heightAt(base.x + 26, base.z + 26), base.z + 26);
g.get('Party')?.snap?.();
step(4);

const views = [
  { name: 'side', bearing: Math.PI * 0.5, dist: 2.55, eye: 0.56, aim: 0.50, fov: 34 },
  { name: 'front34', bearing: Math.PI * 0.20, dist: 2.35, eye: 0.64, aim: 0.52, fov: 34 },
  { name: 'head', bearing: Math.PI * 0.26, dist: 0.95, eye: 0.96, aim: 0.93, fov: 30 },
  { name: 'feet', bearing: Math.PI * 0.42, dist: 1.25, eye: 0.20, aim: 0.15, fov: 32 },
  // the read at the range a player actually meets one
  { name: 'far', bearing: Math.PI * 0.34, dist: 5.0, eye: 0.62, aim: 0.48, fov: 30 },
];

for (const key of species) {
  enemies.clear();
  enemies.frozen = false;
  let e;
  try { e = enemies.spawn(key, { pos: base, heading: 0 }); }
  catch (err) { out.push(`${key}: SPAWN FAILED ${String(err).slice(0, 140)}`); continue; }
  e.stateTime = 0.42;
  e.freeze(pose, phase);
  enemies.frozen = true;
  step(6);

  const h = e.height * e.scale;
  const p = e.root.position;
  out.push(`${key}: height ${h.toFixed(2)} m, root (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}), pose ${pose}`);
  for (const v of views) {
    const d = v.dist * h;
    const cx = p.x + Math.sin(v.bearing) * d;
    const cz = p.z + Math.cos(v.bearing) * d;
    // never let the lens end up inside a hill that happens to be there
    const cy = Math.max(p.y + v.eye * h, terr.heightAt(cx, cz) + 0.35);
    rig.setShot({ pos: [cx, cy, cz], target: [p.x, p.y + v.aim * h, p.z], fov: v.fov });
    step(3);
    await window.__shot(`${key}-${v.name}`);
  }
  rig.clearShot();
  enemies.frozen = false;
  enemies.clear();
}

out.push('');
out.push(`${species.length} species x ${views.length} views`);
return out.join('\n');

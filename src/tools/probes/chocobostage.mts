/*
 * Photograph the chocobo, on real ground, in real light.
 *
 *   node src/tools/probe.mts src/tools/probes/chocobostage.mts \
 *     --shot tmp/shots/cb/a.jpg --jpeg --dirty
 *
 * `src/game/Shots.ts` is owned by another lane, so the mount cannot get a shot
 * in the corpus tonight. This is `creaturestage.mts`'s trick applied to a thing
 * that is not an `Enemy`: summon through the real `ChocoboSystem`, fast-forward
 * the arrival, park the party out of frame, and drive `CameraRig.setShot` from
 * the bird's own root.
 *
 * Five framings, because a sculpt has to answer five different questions and a
 * full-body shot answers none of them well: SIDE is the silhouette and the
 * value structure, THREE-QUARTER is whether the masses join, HEAD is the read
 * at the range the player mounts from, FEET is where every creature in this
 * roster has been weakest, and FAR is the read from the saddle of the bird
 * behind it.
 *
 *   --set __MODE=stand|ride|gallop   --set __COLOUR=yellow|black|...
 *   --set __HOUR=15.4
 */
const g = window.GAME;
const out = [];
const terr = g.get('Terrain');
const player = g.get('Player');
const cb = g.get('Chocobo');

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };

g.get('Director')?.play?.();
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus')?.setScreen?.(null);
g.get('HUD')?.setVisible?.(false);
// `HUD.setVisible(false)` does not reach the objective card, the tutorial
// prompt or the quest toast -- they are separate DOM under `uiRoot`.
if (g.uiRoot) g.uiRoot.style.display = 'none';
g.get('Sky')?.setTimeOfDay?.(Number(window.__HOUR ?? 15.4));
g.get('Weather')?.set?.(String(window.__WEATHER ?? 'clear'));
step(20);

if (!cb) return 'no Chocobo system registered';

const mode = String(window.__MODE ?? 'stand');
const colour = String(window.__COLOUR ?? 'yellow');
cb.colour = colour;

const base = player.position.clone();
if (!cb.summon()) { out.push('summon REFUSED'); return out.join('\n'); }

// Fast-forward the run-in rather than waiting 22 m of it.
for (let i = 0; i < 400 && cb.state === 'arriving'; i++) step();
out.push(`state after run-in: ${cb.state}`);

const bird = cb.bird;
if (!bird) return 'no bird';

if (mode === 'ride' || mode === 'gallop') {
  out.push(`mount: ${cb.mount()}`);
  step(8);
  if (mode === 'gallop') {
    // Drive it forward at full tilt so the gait is photographed at speed.
    // `Input.update` writes `this.move.set(...)` at the top of every
    // `Game.frame`, so replacing the vector wholesale throws and setting it
    // before the frame is overwritten by it. Wrap `update` instead.
    const inp = g.input;
    const realUpdate = inp.update.bind(inp);
    inp.update = () => { realUpdate(); inp.move.set(0, 1); };
    for (let i = 0; i < 200; i++) step();
    out.push(`speed ${cb.body ? cb.body.speed.toFixed(2) : '?'} m/s after 3.3 s`);
    out.push(`stamina ${cb.body ? cb.body.stamina.toFixed(2) : '?'}`);
    inp.update = realUpdate;
    step(2);
  }
} else {
  // park the party out of frame; a hidden mesh still lights the shot and a
  // hero standing in it reads as a scale bar nobody asked for
  player.root.position.set(base.x + 30, terr.heightAt(base.x + 30, base.z + 30), base.z + 30);
  g.get('Party')?.snap?.();
  step(4);
}

const p = bird.root.position.clone();
const h = 2.34;
out.push(`bird root (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}), heading ${bird.heading.toFixed(2)}`);

const views = [
  { name: 'side', bearing: Math.PI * 0.5, dist: 1.55, eye: 0.60, aim: 0.52, fov: 34 },
  { name: 'front34', bearing: Math.PI * 0.18, dist: 1.45, eye: 0.66, aim: 0.54, fov: 34 },
  { name: 'head', bearing: Math.PI * 0.26, dist: 0.62, eye: 1.00, aim: 0.92, fov: 30, fwd: 0.60 },
  { name: 'feet', bearing: Math.PI * 0.42, dist: 0.80, eye: 0.22, aim: 0.16, fov: 32 },
  { name: 'far', bearing: Math.PI * 0.34, dist: 3.4, eye: 0.66, aim: 0.50, fov: 30 },
  { name: 'rear34', bearing: Math.PI * 0.80, dist: 1.55, eye: 0.64, aim: 0.52, fov: 34 },
];

/**
 * A ridden bird is a taller subject than a standing one.
 *
 * Every framing above is authored in multiples of the bird's own 2.34 m, and a
 * rider adds about 0.8 m — 0.34 of that unit — above the saddle. Shot at the
 * standing numbers, `side` and `front34` cut the rider's head off and `head`
 * caught a companion's forearm crossing the frame. Pull back a quarter and
 * lift the eye and the aim by a sixth of a bird when there is somebody on it.
 */
const RIDER = mode === 'stand' ? 0 : 1;
const rig = g.get('CameraRig');
for (const v of views) {
  const d = v.dist * (1 + 0.25 * RIDER) * h;
  const a = bird.heading + v.bearing;
  const cx = p.x + Math.sin(a) * d;
  const cz = p.z + Math.cos(a) * d;
  const cy = Math.max(p.y + (v.eye + 0.16 * RIDER) * h, terr.heightAt(cx, cz) + 0.30);
  // The head sits 0.62 m FORWARD of the root, so aiming at the root's own xz
  // at head height points the lens at the shoulder -- which is what the first
  // `head` framing photographed.
  const fx = p.x + Math.sin(bird.heading) * (v.fwd || 0);
  const fz = p.z + Math.cos(bird.heading) * (v.fwd || 0);
  rig.setShot({ pos: [cx, cy, cz], target: [fx, p.y + (v.aim + 0.16 * RIDER) * h, fz], fov: v.fov });
  step(3);
  await window.__shot(`${mode}-${v.name}`);
}
rig.clearShot();

out.push('');
out.push(`${views.length} views, mode ${mode}, colour ${colour}`);
return out.join('\n');

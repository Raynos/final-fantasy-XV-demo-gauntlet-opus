/*
 * Lane W3-D: what the light actually does over one 30-minute sitting.
 *
 *   node src/tools/probe.mts src/tools/_probe/w3dday.mts \
 *     --shot tmp/w3d/day-10.jpg --set __W3D_MIN=10
 *
 * The clock is verified numerically by `w3dclock.mts`; this is the half that
 * has to be looked at. It plays -- the clock is driven by nothing but
 * `DayCycle.update`, exactly as it is for a player -- for `__W3D_MIN` game
 * minutes, then settles and photographs the field. Coarse dt while running the
 * clock forward (the advance is linear in dt) and a real 1/60 settle before the
 * frame, so wind, water and TAA are photographed at their normal phase.
 */
const g = window.GAME;
const sky = g.get('Sky');
const day = g.get('Rpg').day;
const MIN = Number(window.__W3D_MIN ?? 0);

g.applyShot('hud_field');
g.get('Director').play();
g.get('Story')?.applyShot?.(null);
g.get('HUD')?.setVisible?.(true);
sky.setTimeOfDay(12.0);
g.settle(60);
for (let i = 0; i < MIN * 120; i++) g.frame(0.5);
g.settle(90);
return `after ${MIN} minutes of play: ${day.clockString} DAY ${day.day} ${day.phase.name.toUpperCase()}`
  + `  sky ${sky.hours.toFixed(3)}  nightDepth ${day.nightDepth.toFixed(2)}  exposure ${sky.exposure.toFixed(2)}`;

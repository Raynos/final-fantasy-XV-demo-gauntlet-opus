// Photograph the world as a PLAYER sees it: live, moving, populated.
// Every shot in `Shots.ts` is posed with the encounter loop switched off, so
// no capture in this repo has ever contained a wild den.
const g = window.GAME;
g.applyShot('hud_field');
g.get('Director')?.play?.();
g.get('CameraRig')?.clearShot?.();
g.resetClock();
const inp = g.input, rig = g.get('CameraRig'), p = g.get('Player');
const enc = g.get('EncounterDirector') || g.get('Encounters');
const out = [];
const legs = [[0.9, 55], [2.4, 55], [4.1, 55], [5.4, 55]];
let i = 0;
for (const [yaw, secs] of legs) {
  p.position.set(0, p.position.y, 0);
  rig.yaw = yaw; rig.yawTarget = yaw;
  inp.keys.clear(); inp.keys.add('KeyW'); inp.keys.add('ShiftLeft');
  for (let f = 0; f < 60 * secs; f++) g.frame(1 / 60);
  inp.keys.clear();
  for (let f = 0; f < 40; f++) g.frame(1 / 60);   // let the party settle
  const live = enc.enemies.list.filter((e) => !e.dead);
  const near = live.filter((e) => Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z) < 140);
  out.push(`leg${++i} pos ${p.position.x.toFixed(0)},${p.position.z.toFixed(0)}  live ${live.length}  within140 ${near.length}  `
    + `${near.map((e) => e.name || e.type?.key).slice(0, 6).join(',')}  draws ${g.renderer.info.render.calls}`);
  await window.__shot(`leg${i}`);
}
return out.join('\n');

/*
 * Does the end of a fight read as an ending, and does the call-out survive a
 * bright sky?
 *
 * Two UI beats no authored shot in the corpus reaches. `encounter:victory`
 * carries kills, EXP, gil and drops and, until the card in `ScreenFX`, nothing
 * drew any of it. And the `STAGGER!` banner is white 200-weight letterspaced
 * type at 22% of frame height, which over cloud is a ghost — the hard case is
 * the one to photograph, so this poses the camera to put sky behind the word.
 *
 * Also fans four simultaneous damage numbers at one world point, which is the
 * arrangement that printed "1,8039" in `tmp/shots/cb0/f-victory.jpg`.
 *
 *   node src/tools/probe.mts src/tools/probes/endbeat.mts --shot tmp/shots/eb/e.jpg
 */
const g = window.GAME;
const dt = 1 / 60;
const hud = g.get('HUD');
const rig = g.get('CameraRig');
const player = g.get('Player');
const step = (n) => { for (let i = 0; i < n; i++) g.frame(dt); };

g.applyShot('hud_field');
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus')?.setScreen?.(null);
hud?.setVisible?.(true);
hud?.setMenuOpen?.(false);
step(20);

const out = [];
const p = player.position;
/** Pitch the lens down so the horizon sits low and the banner lands on sky. */
const skyward = () => {
  rig.setShot({
    pos: [p.x + 1.7, p.y + 1.55, p.z + 5.4],
    target: [p.x, p.y + 2.9, p.z],
    fov: 50,
  });
};
/** Level, so the banner lands on ground — the easy case, for comparison. */
const groundward = () => {
  rig.setShot({
    pos: [p.x + 1.7, p.y + 3.4, p.z + 5.4],
    target: [p.x, p.y + 1.1, p.z],
    fov: 50,
  });
};

// The combat layer only draws while `HUD.combatA` is up, and `lateUpdate`
// recomputes that every frame from `Director.scenario` — writing `combatA`
// directly is overwritten before the next paint. Posing the scenario is the
// switch, and the layer's own `_rewindStandIn` clears any call-out on the
// frame it comes up, so the banner has to be raised AFTER it is live.
g.get('Director').scenario = 'combat';
step(40);

for (const [name, pose] of [['sky', skyward], ['ground', groundward]]) {
  /* ---- the stagger banner ------------------------------------------- */
  pose();
  hud.combat.callout = null;
  hud.callOut('Stagger!', 'Poise broken  ·  ×1.9 damage');
  step(26);
  await window.__shot(`callout-${name}`);
  out.push(`callout-${name}: word="${hud.combat.calloutWord.textContent}" opacity=${hud.combat.calloutNode.style.opacity}`);

  /* ---- four numbers at one point ------------------------------------ */
  hud.combat.resetDemo();
  const w = { x: p.x, y: p.y + 1.4, z: p.z - 1.2 };
  for (const [amt, crit] of [[1803, true], [689, false], [231, false], [126, false]]) {
    hud.damage({ world: w, amount: amt, crit, kind: crit ? 'crit' : 'hit' });
  }
  step(8);
  await window.__shot(`numbers-${name}`);
  // how far apart are they on screen, at the moment they are largest?
  const boxes = [...document.querySelectorAll('.dmg')].map((n) => n.getBoundingClientRect());
  let overlaps = 0, minGap = 1e9;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const gx = Math.max(a.left, b.left) - Math.min(a.right, b.right);
      const gy = Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);
      // Boxes overlap only when they overlap on BOTH axes; the separation of
      // a non-overlapping pair is the larger of the two gaps.
      if (gx < 0 && gy < 0) overlaps++;
      else minGap = Math.min(minGap, Math.max(gx, gy));
    }
  }
  out.push(`numbers-${name}: ${boxes.length} on screen, ${overlaps} overlapping pairs, closest edge gap ${minGap.toFixed(0)} px`);

  /* ---- the victory card --------------------------------------------- */
  hud.combat.resetDemo();
  hud.combat.callout = null;
  pose();
  hud.victory({ name: 'Sabertusk', kills: 3, exp: 687, gil: 276, drops: ['Sabertusk Fang', 'Venom Fang'] });
  step(60);
  await window.__shot(`victory-${name}`);
  const r = hud.fx.vic.getBoundingClientRect();
  out.push(`victory-${name}: card ${r.width.toFixed(0)}x${r.height.toFixed(0)} at (${r.left.toFixed(0)}, ${r.top.toFixed(0)}) opacity=${hud.fx.vic.style.opacity}`);
  step(180);
  out.push(`victory-${name}: after 3 s, state=${hud.fx.vicState ? 'still up' : 'gone'} opacity=${hud.fx.vic.style.opacity}`);
}

rig.clearShot();
return out.join('\n');

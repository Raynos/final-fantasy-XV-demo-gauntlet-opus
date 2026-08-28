/*
 * What is the smear in a fight frame?
 *
 * Every `stagger` and `kill` frame `fightshape` takes comes back blurred edge
 * to edge. Rewriting the combat framing block halved the lens speed
 * (`probes/armwhip.mts`) and the frames are still soft, so the question is
 * which post stage is turning the remaining camera motion into mush.
 *
 * A held pose cannot answer it, so this drives the real fight and, at the
 * moment of a stagger, photographs the SAME simulation state four times —
 * re-rendering through `post.render()` with one stage switched off each time.
 * The sim does not advance between arms, so anything that differs between two
 * frames is the stage that was turned off and nothing else.
 *
 *   node src/tools/probe.mts src/tools/probes/smearsrc.mts --shot tmp/shots/sm/s.jpg
 */
const g = window.GAME;
const dt = 1 / 60;
const inp = g.input;
const player = g.get('Player');
const rig = g.get('CameraRig');
const enemies = g.get('Enemies');
const enc = g.get('Encounters');
const post = g.post;

g.applyShot('hud_field');
g.get('Director')?.play?.();
rig?.clearShot?.();
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus')?.setScreen?.(null);
g.get('HUD')?.setVisible?.(true);
g.get('HUD')?.setMenuOpen?.(false);
g.resetClock();
inp.pointerLocked = true;

const keyDown = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
const keyUp = (c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true }));
const step = (n) => { for (let i = 0; i < n; i++) g.frame(dt); };
const breathe = () => new Promise((r) => setTimeout(r, 0));
const tap = (c) => { keyDown(c); step(2); keyUp(c); step(1); };
const mouse = (d, b = 0) => window.dispatchEvent(new MouseEvent(d ? 'mousedown' : 'mouseup', { button: b, bubbles: true }));
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const hostiles = () => (enemies.list || []).filter((e) => !e.dead && !e.passive);
const nearest = () => {
  let best = null, bd = 1e9;
  for (const e of hostiles()) { const d = d2(e.position, player.position); if (d < bd) { bd = d; best = e; } }
  return best ? { e: best, d: bd } : null;
};
const angDiff = (a, b) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const faceToward = (p, snap = false) => {
  const yaw = Math.atan2(-(p.x - player.position.x), -(p.z - player.position.z));
  if (snap) { rig.yawTarget = yaw; rig.yaw = yaw; return; }
  rig.yawTarget += Math.max(-5 * dt, Math.min(5 * dt, angDiff(yaw, rig.yawTarget)));
};

const log = [];
/** Photograph the frame that has just been rendered, then re-render it with
 *  one post stage off and photograph that. The sim does not advance. */
const ladder = async (tag) => {
  const p = rig.cam.position;
  log.push(`${tag}: lens (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})  arm ${rig.distance.toFixed(2)}  trauma ${rig.trauma.toFixed(3)}  fov ${rig.cam.fov.toFixed(1)}`);
  await window.__shot(`${tag}-full`);
  const arms = [
    ['nomb', () => { post.motionBlur.enabled = false; }, () => { post.motionBlur.enabled = true; }],
    ['nodof', () => { post.dof.enabled = false; }, () => { post.dof.enabled = true; }],
    ['notaa', () => { post.taa.enabled = false; }, () => { post.taa.enabled = true; }],
    ['nomb-nodof-notaa', () => {
      post.motionBlur.enabled = false; post.dof.enabled = false; post.taa.enabled = false;
    }, () => { post.motionBlur.enabled = true; post.dof.enabled = true; post.taa.enabled = true; }],
  ];
  for (const [name, off, on] of arms) {
    off();
    post.render();
    await window.__shot(`${tag}-${name}`);
    on();
  }
  post.render();
};

const findDen = async (headings, secs) => {
  for (const yaw of headings) {
    rig.yaw = yaw; rig.yawTarget = yaw;
    inp.keys.clear(); inp.keys.add('KeyW'); inp.keys.add('ShiftLeft');
    for (let f = 0; f < 60 * secs; f++) {
      g.frame(dt);
      if (f % 300 === 0) await breathe();
      if (f % 15) continue;
      const n = nearest();
      if (n && n.d < 100) { inp.keys.clear(); return n; }
    }
  }
  inp.keys.clear();
  return null;
};

const found = await findDen([0.9, 2.4, 4.1], 28);
if (!found) return 'no den found';
faceToward(found.e.position, true);
inp.keys.add('KeyW');
for (let f = 0; f < 60 * 40; f++) {
  g.frame(dt);
  if (f % 300 === 0) await breathe();
  const n = nearest(); if (n) faceToward(n.e.position);
  if (enc.state === 'combat') break;
}
inp.keys.clear();

let attacking = false, shot = 0, overFor = 0, reaiming = false;
const inFight = () => hostiles().filter((e) => d2(e.position, player.position) < 45);
for (let f = 0; f < 60 * 120 && shot < 3; f++) {
  const live = inFight();
  if (!live.length) break;
  if (enc.state !== 'combat') { overFor += dt; if (overFor > 2) break; } else overFor = 0;
  const n = nearest();
  if (n) {
    const c = rig.cam.position;
    const off = Math.abs(angDiff(Math.atan2(-(n.e.position.x - c.x), -(n.e.position.z - c.z)), rig.yaw));
    if (off > 0.55) reaiming = true; else if (off < 0.20) reaiming = false;
    if (reaiming) faceToward(n.e.position);
  }
  const t = n && n.e;
  const reach = t ? (t.radius || 1) : 1;
  const inDanger = live.some((e) => e.state === 'telegraph' && d2(e.position, player.position) < (e.reach || 4) + 2.5);
  if (t && n.d > reach + 3.4) inp.keys.add('KeyW'); else inp.keys.delete('KeyW');
  if (inDanger && f % 30 === 0) { tap('Space'); if (attacking) { mouse(false); attacking = false; } }
  else if (t && t.staggered && f % 45 === 0) tap('KeyQ');
  else if (!attacking && n && n.d < reach + 3.6) { mouse(true); attacking = true; }
  else if (attacking && n && n.d > reach + 5.5) { mouse(false); attacking = false; }
  g.frame(dt);
  if (f % 300 === 0) await breathe();
  if (live.some((e) => e.staggered) && f % 90 === 0) { await ladder(`stagger${++shot}`); }
}
if (attacking) mouse(false);
inp.keys.clear();
return log.join('\n');

/*
 * Can you SEE the fight? The playtest's number-one complaint, as a number.
 *
 * "Fights happen inside a hill, and I can't see any of them. Two frames in a
 * row were 100% ground texture." Lane 11 filed the same defect independently
 * from its `f-engage` frame: the camera fully inside a boulder at the moment an
 * encounter starts.
 *
 * `probes/camview.mts` sweeps that question statically over the heightfield and
 * comes back clean -- 0.00% of 2592 combat poses put Noctis behind the ground --
 * which is the useful negative: **the terrain is not what buries the lens.** The
 * "hill" is a boulder, and `CameraRig` had no collision against a prop at all.
 *
 * So this walks the real player into real wild dens the way `fightshape.mts`
 * does, and for every frame of every fight asks four questions of the real
 * camera:
 *
 *   solid   is the lens sphere inside a wall or a boulder? Walls come from
 *           `Collision.blocked`; boulders from the rig's own `CameraOccluders`,
 *           because `Harvest.collectRockProxies` returns `[]` and the collision
 *           world has never held a rock (`stats.rockProxies` reads 0 live)
 *   was     the same question of the lens the PRE-FIX arm would have placed on
 *           this exact frame -- the paired before/after
 *   blind   is the ground between the lens and Noctis' chest?
 *   clear   metres of air under the lens
 *   mud3    fraction of the frame that is ground or rock within 3 m, from a
 *           ray grid fired at the sampled beats
 *
 * The headline is the percentage of combat frames that are `solid` or `blind`,
 * and the worst `mud3` of the fight. A camera you can fight behind has none of
 * the first two.
 *
 *   node src/tools/probe.mts src/tools/probes/fightcam.mts --dirty --ttl 25 \
 *        --set rounds=4 --shot tmp/shots/lane12a/fc.jpg > tmp/fightcam.txt 2>&1
 */
const g = window.GAME;
const dt = 1 / 60;
const inp = g.input;
const player = g.get('Player');
const rig = g.get('CameraRig');
const enemies = g.get('Enemies');
const combat = g.get('Combat');
const terr = g.get('Terrain');
const coll = g.get('Collision');
const hud = g.get('HUD');

/* ---- live world, no title card (the `?shoot` page boots the loop OFF) --- */
g.applyShot('hud_field');
g.get('Director')?.play?.();
rig?.clearShot?.();
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus')?.setScreen?.(null);
hud?.setVisible?.(true);
hud?.setMenuOpen?.(false);
g.resetClock();
inp.pointerLocked = true;

const V = rig.cam.position.constructor;
const fwd = new V(), right = new V(), up = new V(), ray = new V();
const WORLD_UP = new V(0, 1, 0);
const R = rig.probeRadius;
const FAR = 30;

/**
 * Is the lens inside a solid?
 *
 * Two sources, because they answer different halves. `CollisionWorld` holds the
 * town, the landmarks and the dungeon mouths -- but **not** boulders:
 * `Harvest.collectRockProxies` returns `[]`, so `stats.rockProxies` reads 0 in
 * a live page and the wall soup has no rock in it at all. The rig's own
 * `CameraOccluders` window is the boulder half, and boulders are what lane 11's
 * `f-engage` frame is the inside of.
 */
const occ = rig.occluders;
const inWall = (p) => !!(coll && coll.ready && coll.blocked(p.x, p.z, p.y - R, R, R * 2, 0));
const inRock = (p) => !!(occ && occ.count && occ.inside(p.x, p.y, p.z, R));
const inSolid = (p) => inWall(p) || inRock(p);

/**
 * Where the lens would have been WITHOUT the boulder push-out, from this exact
 * frame's focus and orbit -- the paired counterfactual, so the before and the
 * after are measured on the same fight rather than on two different dens.
 */
const legacy = rig.cam.position.clone();
const legacyLens = () => {
  const was = rig.occluderPush;
  rig.occluderPush = false;
  rig._solveLens(g, rig._focusSmooth, rig.yaw, rig.pitch, rig.restDistance, legacy);
  rig.occluderPush = was;
  return legacy;
};

/** Ground distance along a ray, capped at `FAR`. */
function rayGround(o, d) {
  let t = 0.2;
  while (t < FAR) {
    if (o.y + d.y * t <= terr.heightAt(o.x + d.x * t, o.z + d.z * t)) return t;
    t = t * 1.25 + 0.1;
  }
  return FAR;
}
/** Nearest boulder along a ray, capped at `FAR`. Analytic, so it is exact. */
function raySolid(o, d) {
  if (!occ || !occ.count) return FAR;
  return occ.sweep(o.x, o.y, o.z, d.x, d.y, d.z, FAR, 0);
}
/** Is the segment a->b clear of the heightfield? */
function sees(a, bx, by, bz) {
  for (let i = 1; i < 14; i++) {
    const u = i / 14;
    const x = a.x + (bx - a.x) * u, y = a.y + (by - a.y) * u, z = a.z + (bz - a.z) * u;
    if (y < terr.heightAt(x, z)) return false;
  }
  return true;
}

const th = Math.tan((rig.cam.fov * Math.PI / 180) / 2);
const NX = 12, NY = 7;
/** Fraction of the frame that is ground or rock within `near` metres. */
function frameMud(near) {
  const cam = rig.cam;
  cam.updateMatrixWorld(true);
  const m = cam.matrixWorld.elements;
  right.set(m[0], m[1], m[2]);
  up.set(m[4], m[5], m[6]);
  fwd.set(-m[8], -m[9], -m[10]);
  const aspect = cam.aspect || 16 / 9;
  let n = 0;
  for (let iy = 0; iy < NY; iy++) {
    const sy = (2 * (iy + 0.5) / NY - 1) * th;
    for (let ix = 0; ix < NX; ix++) {
      const sx = (2 * (ix + 0.5) / NX - 1) * th * aspect;
      ray.copy(fwd).addScaledVector(right, sx).addScaledVector(up, sy).normalize();
      const t = Math.min(rayGround(cam.position, ray), raySolid(cam.position, ray));
      if (t < near) n++;
    }
  }
  return n / (NX * NY);
}

const keyDown = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
const keyUp = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
const mouse = (down, button = 0) => window.dispatchEvent(new MouseEvent(down ? 'mousedown' : 'mouseup', { button, bubbles: true }));
const breathe = () => new Promise((r) => setTimeout(r, 0));
const tap = (code) => { keyDown(code); for (let i = 0; i < 2; i++) g.frame(dt); keyUp(code); g.frame(dt); };
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
const PLAYER_SLEW = 5.0;
const faceToward = (p, snap = false) => {
  const yaw = Math.atan2(-(p.x - player.position.x), -(p.z - player.position.z));
  if (snap) { rig.yawTarget = yaw; rig.yaw = yaw; return; }
  rig.yawTarget += Math.max(-PLAYER_SLEW * dt, Math.min(PLAYER_SLEW * dt, angDiff(yaw, rig.yawTarget)));
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

const HEADINGS = [[0.9, 2.4, 4.1], [5.4, 3.2], [1.7, 0.3], [4.7, 2.0], [2.9, 5.9], [0.4, 3.7]];
const ROUNDS = Math.max(1, Math.min(HEADINGS.length, Number(window.rounds) || 4));
const SHOOT = Number(window.__FC_SHOOT ?? 1);

const rows = [];
const emit = (s) => { rows.push(s); console.log(s); };
const all = { frames: 0, solid: 0, blind: 0, clearSum: 0, worstClear: 1e9, was: 0, heroIn: 0, wallOnly: 0 };
const beats = [];

for (let round = 0; round < ROUNDS; round++) {
  const found = await findDen(HEADINGS[round] || [round], 26);
  if (!found) { emit(`round ${round + 1}: no den found`); continue; }
  faceToward(found.e.position, true);

  /* ---- walk in until the fight starts ------------------------------- */
  inp.keys.add('KeyW');
  let started = false;
  for (let f = 0; f < 60 * 30 && !started; f++) {
    g.frame(dt);
    if (f % 300 === 0) await breathe();
    const n = nearest();
    if (n) faceToward(n.e.position);
    if (n && n.d < 6) started = true;
  }
  inp.keys.delete('ShiftLeft');

  /* ---- the fight ----------------------------------------------------- */
  const r = { round: round + 1, frames: 0, solid: 0, blind: 0, worstClear: 1e9,
    clearSum: 0, mud: [], solidRuns: 0, was: 0, wasRuns: 0, prox: 0,
    /** Noctis' own chest inside a boulder -- rocks have no CHARACTER collision
     *  either, so he can stand in one, and then no arm can save the frame. */
    heroIn: 0, wallOnly: 0 };
  let wasWas = false;
  let wasSolid = false;
  const sampleAt = new Set([0, 60, 150, 300, 600]);
  mouse(true);
  for (let f = 0; f < 60 * 26; f++) {
    g.frame(dt);
    if (f % 240 === 0) await breathe();
    const n = nearest();
    if (n) faceToward(n.e.position);
    if (!n || n.d > 45) break;
    if (n.d > 3.2) inp.keys.add('KeyW'); else inp.keys.delete('KeyW');
    if (f % 210 === 90) { mouse(false); tap('Space'); mouse(true); }
    if (f % 330 === 200) { mouse(false); tap('KeyQ'); mouse(true); }

    const p = rig.cam.position;
    const lg = legacyLens();
    const solWas = inSolid(lg);
    if (solWas) r.was++;
    if (solWas && !wasWas) r.wasRuns++;
    wasWas = solWas;
    r.prox = Math.max(r.prox, occ ? occ.count : 0);
    const rockNow = inRock(p), wallNow = inWall(p);
    const sol = rockNow || wallNow;
    if (wallNow && !rockNow) r.wallOnly++;
    if (occ && occ.count && occ.inside(player.position.x, player.position.y + 1.3, player.position.z, 0.3)) r.heroIn++;
    const bl = !sees(p, player.position.x, player.position.y + 1.3, player.position.z);
    const clear = p.y - terr.heightAt(p.x, p.z);
    r.frames++; if (sol) r.solid++; if (bl) r.blind++;
    if (sol && !wasSolid) r.solidRuns++;
    wasSolid = sol;
    r.clearSum += clear;
    if (clear < r.worstClear) r.worstClear = clear;

    if (sampleAt.has(f)) {
      const mud = frameMud(3);
      r.mud.push(`${(f / 60).toFixed(1)}s:${mud.toFixed(2)}${sol ? 'S' : ''}${bl ? 'B' : ''}`);
      if (SHOOT && round === 0 && window.__shot) await window.__shot(`r1-${(f / 60).toFixed(0)}s`);
      if (SHOOT && round > 0 && f === 0 && window.__shot) await window.__shot(`r${round + 1}-engage`);
    }
  }
  mouse(false);
  inp.keys.clear();
  all.frames += r.frames; all.solid += r.solid; all.blind += r.blind; all.was += r.was; all.heroIn += r.heroIn; all.wallOnly += r.wallOnly;
  all.clearSum += r.clearSum; all.worstClear = Math.min(all.worstClear, r.worstClear);
  const pc = (n) => `${(100 * n / Math.max(1, r.frames)).toFixed(1)}%`;
  emit(`round ${r.round}: ${r.frames} combat frames  solid ${r.solid} (${pc(r.solid)}, ${r.solidRuns} runs)`
    + `  [no push-out: ${r.was} (${pc(r.was)}, ${r.wasRuns} runs)]`
    + `  blind ${r.blind} (${pc(r.blind)})  clear mean ${(r.clearSum / Math.max(1, r.frames)).toFixed(2)} m`
    + ` min ${r.worstClear.toFixed(2)} m  proxies<=${r.prox}  heroInRock ${pc(r.heroIn)}  wallOnly ${pc(r.wallOnly)}`
    + `  mud3 ${r.mud.join(' ')}`);
  beats.push(r);
}

const pc = (n) => `${(100 * n / Math.max(1, all.frames)).toFixed(2)}%`;
emit('');
emit(`=== ${beats.length} fights, ${all.frames} combat frames`);
emit(`  lens INSIDE a solid   ${all.solid}  ${pc(all.solid)}`);
emit(`  ...without push-out   ${all.was}  ${pc(all.was)}   (same frames, same fights, arm re-solved with rig.occluderPush = false)`);
emit(`  ...of which WALL, not rock ${all.wallOnly}  ${pc(all.wallOnly)}   (town/landmark soup; the camera does not push out of those)`);
emit(`  Noctis himself in a rock ${all.heroIn}  ${pc(all.heroIn)}   (characters have no boulder collision either -- no arm can fix these)`);
emit(`  occluder window       ${occ.count} proxies now, ${occ.rebuilds} rebuilds, ${occ.scanned} instances scanned last, ${occ.lastMs.toFixed(3)} ms`);
emit(`  Noctis BEHIND ground  ${all.blind}  ${pc(all.blind)}`);
emit(`  clearance             mean ${(all.clearSum / Math.max(1, all.frames)).toFixed(2)} m   min ${all.worstClear.toFixed(2)} m`);
emit(`  collision world ready ${coll && coll.ready ? `yes (${coll.stats.wallTris} wall tris, ${coll.stats.rockProxies} rock proxies)` : 'NO -- solid numbers are meaningless'}`);
return rows.join('\n');

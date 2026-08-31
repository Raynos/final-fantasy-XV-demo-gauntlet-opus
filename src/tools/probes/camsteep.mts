/*
 * Sprint uphill into a slope too steep to climb, twice, and photograph it.
 *
 * **The frame this exists to produce.** Second blind playtest, complaint #1,
 * verbatim: "Sprinting uphill: at 40 s the camera was 2.1 m behind Noctis; by
 * 60 s and still at 80 s the entire screen was a featureless wall of brown dirt
 * with moire on it — no character, no horizon, no landmarks, minimap a blank
 * disc. The game printed TOO STEEP — find a way around, which is a good
 * message, but I could not see which way around. Measured: camera distance
 * collapsed 5.2 m -> 1.4 m as I climbed."
 *
 * `probes/camview.mts` sweeps poses and grades frames and is the quotable
 * paired number; it cannot produce this frame, because the frame needs a player
 * who has *run into* the slope and a camera that has been damped into it for
 * seconds. So this is `rockwalk`'s shape applied to terrain: find the steep
 * ground by sweeping it, drive the same held key from the same start pose with
 * one `CameraRig` knob off and then on, and grade every frame of both.
 *
 * **What it found**, which is not what either earlier camera lane thought and
 * is not the arm: at the frame in the picture the point the camera orbits is
 * `focus (-302.3, 44.0, -266.8)` with `ground under focus 46.2` — 2.2 m INSIDE
 * the hill, put there by the velocity look-ahead. From a buried origin every
 * arm sweep returns `minDistance` at every pitch (`armAt +0.00:1.10 ...
 * +0.55:1.10`), which is why a slope lift that measures 6x on `camview`'s
 * standing poses does nothing at all here: `camview` has no look-ahead in it.
 *
 * Per frame it records what the player recorded — the arm length — plus the
 * three things that decide whether the frame is a picture or a wall:
 *
 *   arm     `rig.distance`, the number in the complaint
 *   clear   metres of air under the lens; moire is a lens grazing the ground
 *   ground  fraction of the frame that is terrain within 6 m of the lens
 *   open    fraction that reaches 40 m — sky, horizon, the mesa
 *
 *   node src/tools/probe.mts src/tools/probes/camsteep.mts --dirty --ttl 25 \
 *        --shot tmp/shots/w3b/cs.jpg
 *   node src/tools/probe.mts src/tools/probes/camsteep.mts --set __CS_SITES=2
 */
const g = window.GAME;
const player = g.get('Player');
const party = g.get('Party');
const terr = g.get('Terrain');
const rig = g.get('CameraRig');
const hud = g.get('HUD');
const dt = 1 / 60;
const inp = g.input;
if (!rig || !terr || !player) return `missing ${!rig ? 'CameraRig' : !terr ? 'Terrain' : 'Player'}`;

g.applyShot('hud_field');
g.get('Director')?.play?.();
rig.clearShot?.();
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus')?.setScreen?.(null);
hud?.setVisible?.(true);
hud?.setMenuOpen?.(false);
g.resetClock();
inp.pointerLocked = true;
const step = (n) => { for (let i = 0; i < n; i++) g.frame(dt); };
const breathe = () => new Promise((r) => setTimeout(r, 0));
step(120);

const SITES = Math.max(1, Number(window.__CS_SITES) || 3);
const SECS = Number(window.__CS_SECS) || 14;
/** How far downhill of the steep face the run starts, metres. */
const APPROACH = Number(window.__CS_APPROACH) || 26;
/** Ray grid over the frame, and how far a ray may travel before it is "open". */
const NX = 12, NY = 7, FAR = 40;
/**
 * Which rig knob the pairing ablates. `focusClear` by default: it is the one
 * that carries this frame. `slopeLift` is the other half of the same defect and
 * `camview`'s standing poses are where it shows.
 */
const ABLATE = String(window.__CS_ABLATE || 'focusClear');
const V = rig.cam.position.constructor;
const out = [];
const emit = (s) => { out.push(s); console.log(s); };

/* ------------------------------------------------------ find the steep ground */

/** Slope magnitude from a 4 m cross, as a gradient (rise per metre). */
function slopeAt(x, z) {
  return Math.hypot(terr.heightAt(x + 2, z) - terr.heightAt(x - 2, z),
    terr.heightAt(x, z + 2) - terr.heightAt(x, z - 2)) / 4;
}
/** Uphill direction, normalised in XZ. */
function uphill(x, z) {
  const gx = terr.heightAt(x + 2, z) - terr.heightAt(x - 2, z);
  const gz = terr.heightAt(x, z + 2) - terr.heightAt(x, z - 2);
  const m = Math.hypot(gx, gz) || 1;
  return [gx / m, gz / m];
}

const P0 = player.position;
const steep = [];
for (let dx = -300; dx <= 300; dx += 15) {
  for (let dz = -300; dz <= 300; dz += 15) {
    const x = P0.x + dx, z = P0.z + dz;
    if (terr.heightAt(x, z) < 1) continue;
    const s = slopeAt(x, z);
    if (s > 0.45) steep.push([x, z, s]);      // ~24 degrees and up
  }
}
emit(`swept a 600 m square: ${steep.length} points steeper than 24 degrees`);
if (!steep.length) return out.concat('no steep ground in the streamed window').join('\n');
steep.sort((a, b) => b[2] - a[2]);
const chosen = [];
for (const s of steep) {
  if (chosen.length >= SITES) break;
  if (chosen.some((c) => Math.hypot(c[0] - s[0], c[1] - s[1]) < 110)) continue;
  chosen.push(s);
}
for (const c of chosen) {
  emit(`  site (${c[0].toFixed(0)}, ${c[1].toFixed(0)}) — slope ${(Math.atan(c[2]) * 180 / Math.PI).toFixed(0)} deg`);
}

/* ------------------------------------------------------------- frame grading */

const fwd = new V(), right = new V(), up = new V(), ray = new V();
const WORLD_UP = new V(0, 1, 0);
const th = Math.tan((rig.cam.fov * Math.PI / 180) / 2);
const ASPECT = 16 / 9;
const occ = rig.occluders || null;

/** Distance along a ray to the terrain, or `FAR`. */
function rayGround(o, dx, dy, dz) {
  let t = 0.15;
  while (t < FAR) {
    if (o.y + dy * t <= terr.heightAt(o.x + dx * t, o.z + dz * t)) return t;
    t *= 1.22;
    t += 0.08;
  }
  return FAR;
}
/**
 * What is in the frame, right now, from the live camera — its real position and
 * its real orientation, not a re-derived one. A probe that re-derives the rig's
 * arithmetic cannot notice the rig changing.
 */
function frameGrade() {
  const cam = rig.cam;
  cam.getWorldDirection(fwd);
  right.copy(fwd).cross(WORLD_UP).normalize();
  up.copy(right).cross(fwd).normalize();
  let near = 0, open = 0;
  for (let iy = 0; iy < NY; iy++) {
    const sy = (2 * (iy + 0.5) / NY - 1) * th;
    for (let ix = 0; ix < NX; ix++) {
      const sx = (2 * (ix + 0.5) / NX - 1) * th * ASPECT;
      ray.copy(fwd).addScaledVector(right, sx).addScaledVector(up, sy).normalize();
      const t = Math.min(rayGround(cam.position, ray.x, ray.y, ray.z),
        occ && occ.count ? occ.sweep(cam.position.x, cam.position.y, cam.position.z,
          ray.x, ray.y, ray.z, FAR, 0) : FAR);
      if (t < 6) near++;
      if (t >= FAR) open++;
    }
  }
  return { near: near / (NX * NY), open: open / (NX * NY) };
}
/** Is the player's chest visible from the lens? */
function seesHero() {
  const c = rig.cam.position, p = player.position;
  const fx = p.x, fy = p.y + 1.3, fz = p.z;
  for (let i = 1; i < 14; i++) {
    const u = i / 14;
    const x = c.x + (fx - c.x) * u, y = c.y + (fy - c.y) * u, z = c.z + (fz - c.z) * u;
    if (y < terr.heightAt(x, z)) return false;
  }
  return true;
}

/* --------------------------------------------------------------- the two runs */

const yawTo = (fromX, fromZ, toX, toZ) => Math.atan2(-(toX - fromX), -(toZ - fromZ));
const totals = { off: null, on: null };
const col = () => ({ f: 0, arm: 0, clear: 0, near: 0, open: 0, short: 0, walled: 0, blind: 0, minArm: 9e9, minClear: 9e9, lift: 0, want: 0, wantN: 0, maxLift: 0 });
totals.off = col(); totals.on = col();

for (let i = 0; i < chosen.length; i++) {
  const [sx, sz] = chosen[i];
  const [ux, uz] = uphill(sx, sz);
  // Start downhill of the face and run straight up it.
  const startX = sx - ux * APPROACH, startZ = sz - uz * APPROACH;
  const startY = terr.heightAt(startX, startZ);
  const yaw = yawTo(startX, startZ, sx, sz);
  let shotAt = -1;

  for (const lift of [false, true]) {
    const key = lift ? 'on' : 'off';
    rig[ABLATE] = lift;
    rig._lift = 0;
    player.root.position.set(startX, startY, startZ);
    player.velocity?.set?.(0, 0, 0);
    party?.snap?.();
    rig.yaw = yaw; rig.yawTarget = yaw;
    rig.pitch = 0.22; rig.pitchTarget = 0.22;
    rig._first = true;
    inp.keys.clear();
    step(90);

    const r = col();
    let worstScore = -1;
    inp.keys.add('KeyW');
    inp.keys.add('ShiftLeft');
    for (let f = 0; f < SECS * 60; f++) {
      g.frame(dt);
      if (f % 120 === 0) await breathe();
      rig.yawTarget = yaw;
      if (!lift) rig.pitchTarget = 0.22;
      const fr = frameGrade();
      const c = rig.cam.position;
      const clear = c.y - terr.heightAt(c.x, c.z);
      r.f++;
      r.arm += rig.distance; r.clear += clear; r.near += fr.near; r.open += fr.open;
      r.lift += rig._lift || 0;
      if (rig._lift > r.maxLift) r.maxLift = rig._lift;
      const wl = rig._liftFor ? rig._liftFor(g, rig._focusSmooth, rig.yaw, rig.pitch, rig.restDistance) : 0;
      r.want += wl; if (wl > 0.01) r.wantN++;
      if (rig.distance < 2.5) r.short++;
      if (fr.open < 0.05) r.walled++;
      if (!seesHero()) r.blind++;
      if (rig.distance < r.minArm) r.minArm = rig.distance;
      if (clear < r.minClear) r.minClear = clear;
      // The frame worth a picture is the most walled one of the OFF run, and
      // the ON run is photographed at the same frame index of the same walk.
      const score = fr.near + (1 - fr.open);
      if (!lift && f > 120 && score > worstScore) { worstScore = score; shotAt = f; }
    }
    inp.keys.clear();
    const p = player.position;
    const pc = (n) => `${(100 * n / Math.max(1, r.f)).toFixed(1)}%`;
    emit(`site ${i + 1} (${sx.toFixed(0)}, ${sz.toFixed(0)})  ${ABLATE} ${lift ? 'ON ' : 'OFF'}`
      + `  arm mean ${(r.arm / r.f).toFixed(2)} m min ${r.minArm.toFixed(2)} m`
      + `  crushed<2.5m ${pc(r.short)}`
      + `  clear mean ${(r.clear / r.f).toFixed(2)} m min ${r.minClear.toFixed(2)} m`
      + `  frame within 6 m ${(r.near / r.f).toFixed(3)}  reaching 40 m ${(r.open / r.f).toFixed(3)}`
      + `  WALLED ${pc(r.walled)}  hero hidden ${pc(r.blind)}`
      + `  lift mean ${(r.lift / r.f * 180 / Math.PI).toFixed(1)} deg max ${(r.maxLift * 180 / Math.PI).toFixed(1)}`
      + `  wanted mean ${(r.want / r.f * 180 / Math.PI).toFixed(1)} deg on ${pc(r.wantN)} of frames`
      + `  climbed ${(terr.heightAt(p.x, p.z) - startY).toFixed(1)} m`);
    const t = totals[key];
    for (const k of ['f', 'arm', 'clear', 'near', 'open', 'short', 'walled', 'blind']) t[k] += r[k];
    t.minArm = Math.min(t.minArm, r.minArm); t.minClear = Math.min(t.minClear, r.minClear);

    if (window.__shot && shotAt >= 0) {
      rig[ABLATE] = lift;
      rig._lift = 0;
      player.root.position.set(startX, startY, startZ);
      player.velocity?.set?.(0, 0, 0);
      party?.snap?.();
      rig.yaw = yaw; rig.yawTarget = yaw;
      rig.pitch = 0.22; rig.pitchTarget = 0.22;
      rig._first = true;
      step(90);
      inp.keys.add('KeyW');
      inp.keys.add('ShiftLeft');
      for (let f = 0; f <= shotAt; f++) {
        g.frame(dt);
        rig.yawTarget = yaw;
        if (!lift) rig.pitchTarget = 0.22;
        if (f % 120 === 0) await breathe();
      }
      inp.keys.clear();
      step(4);
      const fr = frameGrade();
      emit(`  shot s${i + 1}-${key} at frame ${shotAt} (${(shotAt / 60).toFixed(1)}s): arm ${rig.distance.toFixed(2)} m`
        + `  lift ${(rig._lift * 180 / Math.PI).toFixed(0)} deg  clear ${(rig.cam.position.y - terr.heightAt(rig.cam.position.x, rig.cam.position.z)).toFixed(2)} m`
        + `  within 6 m ${fr.near.toFixed(2)}  reaching 40 m ${fr.open.toFixed(2)}  hero visible ${seesHero()}`);
      // Why the lift did or did not fire, at the frame in the picture.
      const armsAt = [];
      for (const dp of [0, 0.11, 0.22, 0.33, 0.44, 0.55]) {
        armsAt.push(`+${dp.toFixed(2)}:${rig._armAt(g, rig._focusSmooth, rig.yaw, rig.pitch + dp, rig.restDistance).toFixed(2)}`);
      }
      emit(`    rest ${rig.restDistance.toFixed(2)} target ${rig.targetDistance.toFixed(2)} pitch ${rig.pitch.toFixed(2)}`
        + `  focus (${rig._focusSmooth.x.toFixed(1)}, ${rig._focusSmooth.y.toFixed(1)}, ${rig._focusSmooth.z.toFixed(1)})`
        + `  ground under focus ${terr.heightAt(rig._focusSmooth.x, rig._focusSmooth.z).toFixed(1)}`
        + `  armAt ${armsAt.join(' ')}`);
      await window.__shot(`s${i + 1}-${key}`);
    }
  }
}

rig[ABLATE] = true;
const line = (k) => {
  const t = totals[k];
  const pc = (n) => `${(100 * n / Math.max(1, t.f)).toFixed(2)}%`;
  return `  ${ABLATE} ${k === 'on' ? 'ON ' : 'OFF'}  arm ${(t.arm / t.f).toFixed(2)} m (min ${t.minArm.toFixed(2)})`
    + `  crushed<2.5m ${pc(t.short)}`
    + `  clearance ${(t.clear / t.f).toFixed(2)} m (min ${t.minClear.toFixed(2)})`
    + `  frame within 6 m ${(t.near / t.f).toFixed(3)}`
    + `  reaching 40 m ${(t.open / t.f).toFixed(3)}`
    + `  WALLED ${pc(t.walled)}  hero hidden ${pc(t.blind)}`
    + `  lift ${(t.lift / t.f * 180 / Math.PI).toFixed(1)} deg, wanted ${(t.want / t.f * 180 / Math.PI).toFixed(1)} deg on ${pc(t.wantN)}   (${t.f} frames)`;
};
emit('');
emit(`=== ${chosen.length} steep faces, the same start pose and the same held keys both ways`);
emit(line('off'));
emit(line('on'));
return out.join('\n');

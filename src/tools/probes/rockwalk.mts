/*
 * Walk into a boulder field twice — once with rock collision off, once on.
 *
 * **The number this exists to replace.** `probes/fightcam.mts` reports the
 * quantity that matters (`heroInRock`: Noctis' own chest inside a boulder) and
 * cannot be quoted across runs, and lane 12a wrote down why: the camera arm
 * feeds `Props.update`, therefore streaming, therefore `Terrain.drawnHeightAt`,
 * therefore where the feet land — so two runs find two different dens and the
 * absolute percentages swing from 31.5% to 0.00% with nothing changed. Its own
 * handoff says "quote `camview`'s paired sweep, not `fightcam`'s absolutes".
 *
 * So this is the paired instrument for the character half, built the way
 * `camview` is: **the same world, the same start pose, the same command
 * stream**, run twice with `Collision.rockPush` false and then true. The routes
 * diverge — that is the entire point of the fix, one walks through the rock and
 * one walks round it — but nothing else does, and the sites are found by the
 * probe rather than chosen by hand.
 *
 * Sites are picked by sweeping the streamed window for points where a standing
 * character's chest would be *inside* a boulder, then clustering: a tor is a
 * place where hundreds of such points sit together. That is the terrain the
 * playtest's fight happened in.
 *
 *   node src/tools/probe.mts src/tools/probes/rockwalk.mts --dirty --ttl 25 \
 *        --shot tmp/shots/lane12b/rw.jpg > tmp/rockwalk.txt 2>&1
 *   node src/tools/probe.mts src/tools/probes/rockwalk.mts --dirty \
 *        --set __RW_SITES=3 --set __RW_SECS=10
 */
const g = window.GAME;
const player = g.get('Player');
const party = g.get('Party');
const terr = g.get('Terrain');
const coll = g.get('Collision');
const rig = g.get('CameraRig');
const hud = g.get('HUD');
const dt = 1 / 60;
const inp = g.input;
if (!coll || !coll.rocks) return 'no Collision.rocks -- RockField is not wired';

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
const step = (n) => { for (let i = 0; i < n; i++) g.frame(dt); };
const breathe = () => new Promise((r) => setTimeout(r, 0));
// The streamed window follows the camera; a probe body reads constructor
// defaults until the page has stepped frames.
step(120);

const field = coll.rocks;
const SITES = Math.max(1, Number(window.__RW_SITES) || 4);
const SECS = Number(window.__RW_SECS) || 12;
/** How far back from a site the walk starts, metres. */
const APPROACH = Number(window.__RW_APPROACH) || 30;
/** Chest height above the feet — `fightcam`'s, so the two agree. */
const CHEST = 1.3;

const out = [];
const emit = (s) => { out.push(s); console.log(s); };

/* ------------------------------------------------------- find the boulders */

const P0 = player.position;
const hits = [];
for (let dx = -280; dx <= 280; dx += 14) {
  for (let dz = -280; dz <= 280; dz += 14) {
    const x = P0.x + dx, z = P0.z + dz;
    const h = terr.heightAt(x, z);
    if (h < 1) continue;
    if (field.inside(x, h + CHEST, z, 0.3)) hits.push([x, z]);
  }
}
emit(`swept ${(560 / 14 + 1) ** 2 | 0} points over a 560 m square: ${hits.length}`
  + ` put a standing chest inside a boulder (${(100 * hits.length / Math.max(1, ((560 / 14 + 1) ** 2 | 0))).toFixed(1)}%)`
  + `  [cache: ${field.proxies} proxies in ${field.builds} cells, last build ${field.lastMs.toFixed(2)} ms]`);
if (!hits.length) return out.concat('no boulder in the streamed window contains a chest -- nothing to walk into').join('\n');

// Cluster: a tor is where these points crowd together, and a lone pebble is not
// worth a twelve-second walk.
const scored = hits.map(([x, z]) => {
  let n = 0;
  for (const [ox, oz] of hits) if (Math.hypot(ox - x, oz - z) < 25) n++;
  return [x, z, n];
});
scored.sort((a, b) => b[2] - a[2]);
const chosen = [];
for (const s of scored) {
  if (chosen.length >= SITES) break;
  if (chosen.some((c) => Math.hypot(c[0] - s[0], c[1] - s[1]) < 90)) continue;
  chosen.push(s);
}
for (const c of chosen) emit(`  site (${c[0].toFixed(0)}, ${c[1].toFixed(0)}) — ${c[2]} buried chest points within 25 m`);

/* ------------------------------------------------------------- the two runs */

const yawTo = (fromX, fromZ, toX, toZ) => Math.atan2(-(toX - fromX), -(toZ - fromZ));
const chestIn = (p) => field.inside(p.x, p.y + CHEST, p.z, 0.3);
const feetIn = (p) => field.inside(p.x, p.y + 0.25, p.z, 0.15);

const totals = { off: { f: 0, hero: 0, feet: 0, ally: 0, allyF: 0 }, on: { f: 0, hero: 0, feet: 0, ally: 0, allyF: 0 } };

for (let i = 0; i < chosen.length; i++) {
  const [sx, sz] = chosen[i];
  // Approach from whichever side of the site is open, so both runs start in
  // clear air and t = 0 is identical for the pair.
  let start = null;
  for (let k = 0; k < 8 && !start; k++) {
    const a = (k / 8) * Math.PI * 2;
    const x = sx + Math.cos(a) * APPROACH, z = sz + Math.sin(a) * APPROACH;
    const h = terr.heightAt(x, z);
    if (h < 1) continue;
    if (field.inside(x, h + CHEST, z, 0.3)) continue;
    start = [x, z, h];
  }
  if (!start) { emit(`site ${i + 1}: no clear approach, skipped`); continue; }
  const yaw = yawTo(start[0], start[1], sx, sz);

  for (const push of [false, true]) {
    const key = push ? 'on' : 'off';
    coll.rockPush = push;
    player.root.position.set(start[0], start[2], start[1]);
    player.velocity?.set?.(0, 0, 0);
    party?.snap?.();
    rig.yaw = yaw; rig.yawTarget = yaw;
    rig.pitch = 0.30; rig.pitchTarget = 0.30;
    rig._first = true;
    inp.keys.clear();
    step(90);
    const from = { x: player.position.x, z: player.position.z };
    const push0 = field.hits;

    const r = { f: 0, hero: 0, feet: 0, ally: 0, allyF: 0, deepest: -1, deepAt: 0 };
    inp.keys.add('KeyW');
    for (let f = 0; f < SECS * 60; f++) {
      g.frame(dt);
      if (f % 240 === 0) await breathe();
      rig.yawTarget = yaw;
      const p = player.position;
      r.f++;
      const hero = chestIn(p);
      if (hero) r.hero++;
      if (feetIn(p)) r.feet++;
      for (const m of (party?.members || [])) {
        if (!m || !m.position) continue;
        r.allyF++;
        if (chestIn(m.position)) r.ally++;
      }
      // The frame to photograph is the one nearest the site's heart.
      const d = -Math.hypot(p.x - sx, p.z - sz);
      if (d > r.deepest) { r.deepest = d; r.deepAt = f; }
    }
    inp.keys.clear();
    const p = player.position;
    const travelled = Math.hypot(p.x - from.x, p.z - from.z);
    const pc = (n, d) => `${(100 * n / Math.max(1, d)).toFixed(1)}%`;
    emit(`site ${i + 1} (${sx.toFixed(0)}, ${sz.toFixed(0)})  rockPush ${push ? 'ON ' : 'OFF'}`
      + `  chest in rock ${pc(r.hero, r.f)}  feet in rock ${pc(r.feet, r.f)}`
      + `  allies in rock ${pc(r.ally, r.allyF)}`
      + `  travelled ${travelled.toFixed(1)} m  ended ${Math.hypot(p.x - sx, p.z - sz).toFixed(1)} m from the site`
      + `  push-outs ${field.hits - push0}`);
    totals[key].f += r.f; totals[key].hero += r.hero; totals[key].feet += r.feet;
    totals[key].ally += r.ally; totals[key].allyF += r.allyF;

    if (window.__shot) {
      // Re-walk to the closest beat and photograph it, so the pair is the same
      // instant of the same approach rather than two arbitrary frames.
      player.root.position.set(start[0], start[2], start[1]);
      player.velocity?.set?.(0, 0, 0);
      party?.snap?.();
      rig.yaw = yaw; rig.yawTarget = yaw;
      rig.pitch = 0.30; rig.pitchTarget = 0.30;
      rig._first = true;
      step(90);
      inp.keys.add('KeyW');
      for (let f = 0; f <= r.deepAt; f++) { g.frame(dt); rig.yawTarget = yaw; if (f % 240 === 0) await breathe(); }
      inp.keys.clear();
      step(20);
      await window.__shot(`s${i + 1}-${key}`);
    }
  }
}

coll.rockPush = true;

const line = (k) => {
  const t = totals[k];
  return `  rockPush ${k === 'on' ? 'ON ' : 'OFF'}   chest in rock ${(100 * t.hero / Math.max(1, t.f)).toFixed(2)}%`
    + `   feet in rock ${(100 * t.feet / Math.max(1, t.f)).toFixed(2)}%`
    + `   allies in rock ${(100 * t.ally / Math.max(1, t.allyF)).toFixed(2)}%`
    + `   (${t.f} frames, ${t.allyF} ally-frames)`;
};
emit('');
emit(`=== ${chosen.length} boulder fields, the same start pose and the same held key both ways`);
emit(line('off'));
emit(line('on'));
emit(`  RockField: ${field.proxies} proxies cached over ${field.builds} cell builds,`
  + ` last build ${field.lastMs.toFixed(2)} ms, ${field.hits} push-outs applied`);
emit(`  collision world ${coll.ready ? `ready (${coll.stats.wallTris} wall tris)` : 'NOT ready'}`);
return out.join('\n');

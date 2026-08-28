/*
 * Photograph the two content holes: an elemental deposit, and Fociaugh's mouth
 * seen from where a player walks up to it.
 *
 *   node src/tools/probe.mts src/tools/probes/depositlook.mts \
 *     --shot tmp/shots/dep/x.jpg --jpeg --dirty
 *
 * Neither subject has a shot in `src/game/Shots.ts` and neither can get one
 * from a `follow:` pose: `CameraRig.followShot` re-derives pos/target every
 * frame and silently overwrites `setShot` — all 47 of those, and the reason the
 * Titan sweep came back as ten byte-identical frames. So this clears
 * `followShot` first, then poses the rig by hand.
 *
 * `--set __SITE=fociaugh` names one site instead of the default sweep.
 */
const g = window.GAME;
const rig = g.get('CameraRig');
const terrain = g.get('Terrain');
const dungeons = g.get('Dungeons');
const rpg = g.get('Rpg');
const out = [];

// A `follow:` shot would put this back every frame. Clear it once.
rig.followShot = null;
if (rig.clearShot) rig.clearShot();

/**
 * Pose the rig at `pos` looking at `target`, settle, photograph.
 * `setShot` is re-asserted every frame because `lateUpdate` re-derives the
 * lens from the player otherwise.
 */
const look = async (name, pos, target, fov = 46) => {
  // Pose FIRST, then reset the clock and settle. The first version stepped 26
  // frames from wherever the camera already was, and every frame it produced
  // was smeared end to end by motion blur and TAA history — a hundred metres of
  // camera travel is exactly what those two are built to render. `resetClock`
  // is in the page contract for this: a capture then depends only on the step
  // count. 60 frames is a full TAA convergence at this history weight.
  // ONCE, not every frame. `setShot` calls `_cut()`, and re-cutting the lens
  // on every step is what left the first two rounds of these frames smeared
  // end to end: the rig never gets a settled previous-frame matrix, so the
  // motion-blur pass renders a hundred metres of camera travel into every
  // capture. Set it, zero the clock, then let it converge.
  rig.setShot({ pos, target, fov });
  g.resetClock();
  if (g.post && g.post.resetHistory) g.post.resetHistory();
  for (let i = 0; i < 60; i++) g.frame(1 / 60);
  await window.__shot(name);
  out.push(`  shot ${name}  cam (${pos[0].toFixed(0)}, ${pos[1].toFixed(0)}, ${pos[2].toFixed(0)})`);
};

// A console error fails every capture (BRIEF rule 5) and three's own merge
// error names no call site. Trap it with a stack.
const traps = [];
const ce = console.error;
console.error = (...a) => {
  if (String(a[0] || '').includes('mergeGeometries')) traps.push(new Error('trap').stack.split('\n').slice(1, 6).join(' | '));
  ce.apply(console, a);
};

const only = window.__SITE || '';

/* ---- the deposits ----------------------------------------------------- */
// `Deposits.install` runs on `RpgSystem`'s FIRST TICK, and a `?shoot=1` page
// does not free-run — so on a page nobody has stepped, `nodes` is empty and
// reading it here reports zero deposits on a build that has twelve. Step first.
for (let i = 0; i < 3; i++) g.frame(1 / 60);
const deps = rpg && rpg.deposits ? rpg.deposits.nodes : [];
out.push(`deposits built: ${deps.length}`);
for (const n of deps) {
  const p = n.group.position;
  out.push(`  ${n.def.id.padEnd(16)} ${n.def.element.padEnd(10)} cap ${String(n.def.capacity).padStart(3)}`
    + `  at (${p.x.toFixed(0)}, ${p.y.toFixed(1)}, ${p.z.toFixed(0)})  visible ${n.group.visible}`);
}
if (!only || only === 'deposits') {
  // Three of the twelve, one per element, at a walk-up framing: 7 m back, at
  // eye height, looking slightly down at the cluster's middle.
  const pick = ['dep_hammerhead', 'dep_galdin', 'dep_valleys'];
  for (const id of pick) {
    const n = deps.find((d) => d.def.id === id);
    if (!n) continue;
    const p = n.group.position;
    // Face the deposit from the south-east, so the sun rakes it.
    const a = 0.9;
    await look(`dep_${n.def.element}_${id}`,
      [p.x + Math.cos(a) * 7, p.y + 2.4, p.z + Math.sin(a) * 7],
      [p.x, p.y + 1.0, p.z]);
    // And once from twenty metres, which is the range the thing has to be
    // legible at for a player to walk towards it at all.
    await look(`dep_far_${id}`,
      [p.x + Math.cos(a) * 22, p.y + 7.0, p.z + Math.sin(a) * 22],
      [p.x, p.y + 1.2, p.z]);
  }
}

/* ---- Fociaugh's mouth from outside ------------------------------------ */
if (!only || only === 'fociaugh') {
  for (const e of dungeons.entrances) {
    if (only === 'fociaugh' && e.id !== 'fociaugh') continue;
    const h = e.def.entrance.heading;
    // `dungeondoor.mts` measures the approach 6 m along -heading, which is the
    // outside. Stand there, at eye height over the LOCAL ground, and look at
    // the sill: that is the frame a player arrives in.
    // Straight out of the door, AND along the two gentlest bearings. The single
    // number `dungeondoor.mts` reports is the grade on the door's own axis; a
    // door on a spur has a walkable contour approach that number cannot see,
    // and whether Fociaugh is one is the entire question.
    const bearings = [];
    for (let i = 0; i < 24; i++) {
      const b = (i / 24) * Math.PI * 2;
      const ax = e.pos.x + Math.sin(b) * 8, az = e.pos.z + Math.cos(b) * 8;
      bearings.push({ b, gr: (e.pos.y - terrain.heightAt(ax, az)) / 8 });
    }
    bearings.sort((x, y) => Math.abs(x.gr) - Math.abs(y.gr));
    out.push(`  ${e.id} gentlest approach bearings at 8 m: `
      + bearings.slice(0, 3).map((x) => `${Math.round(x.b * 180 / Math.PI)}deg ${x.gr.toFixed(2)}`).join('  '));
    {
      const x = bearings[0];
      const ax = e.pos.x + Math.sin(x.b) * 8, az = e.pos.z + Math.cos(x.b) * 8;
      await look(`mouth_${e.id}_gentle`, [ax, terrain.heightAt(ax, az) + 1.7, az],
        [e.pos.x, e.pos.y + 1.4, e.pos.z], 52);
    }
    for (const d of [8, 20]) {
      const ax = e.pos.x + Math.sin(h) * -d, az = e.pos.z + Math.cos(h) * -d;
      const ay = terrain.heightAt(ax, az) + 1.7;
      out.push(`  ${e.id} at ${d} m out: eye ${ay.toFixed(1)}, sill ${e.pos.y.toFixed(1)},`
        + ` sill is ${(e.pos.y - ay).toFixed(1)} m above the eye`);
      await look(`mouth_${e.id}_${d}m`, [ax, ay, az], [e.pos.x, e.pos.y + 1.4, e.pos.z], 52);
    }
  }
}

out.push('');
out.push(`mergeGeometries console errors: ${traps.length}`);
for (const t of traps.slice(0, 3)) out.push(`  ${t}`);
console.error = ce;

return out.join('\n');

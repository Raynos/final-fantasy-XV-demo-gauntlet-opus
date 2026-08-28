/*
 * Is there a walkable sill anywhere near a dungeon door, or is the hillside
 * uniformly a cliff?
 *
 *   node src/tools/probe.mts src/tools/probes/doorsill.mts
 *
 * `probes/dungeondoor.mts` prints one number per dungeon — rise over run at
 * 6 m in front of the door — and Fociaugh reads **1.26**, a 51 degree bank a
 * player cannot walk up. Before anything is built to hide that, this asks the
 * prior question: how big is the flat, and is it reachable?
 *
 * Two things it measures that the single grade cannot:
 *
 *  - the grade in EVERY direction, not just the door's heading, so a mouth that
 *    is simply pointed the wrong way is distinguishable from one on a spike;
 *  - the grade at every candidate sill on a disc around the nominal door, so
 *    "move the door two metres" is either an available fix or a measured
 *    negative. `dungeondoor.mts` asserts the door is within 4.6 m of its map
 *    pin, so anything inside ~4 m is free to take.
 */
const g = window.GAME;
const terrain = g.get('Terrain');
const dungeons = g.get('Dungeons');
const out = [];

/** Rise over run from `(x,z)` towards `heading`, at `run` metres. */
const grade = (x, z, heading, run = 6) => {
  const y0 = terrain.heightAt(x, z);
  const x1 = x + Math.sin(heading) * run, z1 = z + Math.cos(heading) * run;
  return (y0 - terrain.heightAt(x1, z1)) / run;
};

// `Dungeons.entrances` carries the built doorway; the heading a builder was
// given lives on the def's `entrance`, which is the frame every `P`/`G` call
// inside `Portal.ts` is expressed in.
const sites = [];
for (const e of dungeons.entrances) {
  sites.push({ id: e.id, x: e.pos.x, z: e.pos.z, heading: e.def.entrance.heading || 0 });
}
out.push(`sites: ${sites.map((s) => s.id).join(', ') || '(none found)'}`);

for (const s of sites) {
  out.push('');
  out.push(`=== ${s.id}  at (${s.x.toFixed(0)}, ${s.z.toFixed(0)})  y ${terrain.heightAt(s.x, s.z).toFixed(1)}  heading ${(s.heading * 180 / Math.PI).toFixed(0)}deg`);

  // 1. the grade in every direction from the nominal door.
  const dirs = [];
  for (let i = 0; i < 12; i++) {
    const h = (i / 12) * Math.PI * 2;
    dirs.push({ deg: Math.round(h * 180 / Math.PI), gr: grade(s.x, s.z, h) });
  }
  dirs.sort((a, b) => Math.abs(a.gr) - Math.abs(b.gr));
  out.push(`  gentlest bearings: ${dirs.slice(0, 4).map((d) => `${d.deg}deg ${d.gr.toFixed(2)}`).join('  ')}`);
  out.push(`  steepest bearings: ${dirs.slice(-3).map((d) => `${d.deg}deg ${d.gr.toFixed(2)}`).join('  ')}`);
  out.push(`  grade on the door's own heading: ${grade(s.x, s.z, s.heading).toFixed(2)}`);

  // 2. every candidate sill within 4 m: how flat can the door get without
  //    moving off its map pin?
  let best = null;
  for (let ri = 1; ri <= 8; ri++) {
    const r = ri * 0.5;
    for (let ai = 0; ai < 16; ai++) {
      const a = (ai / 16) * Math.PI * 2;
      const cx = s.x + Math.cos(a) * r, cz = s.z + Math.sin(a) * r;
      // The sill's own grade on the door heading, and the worst grade over the
      // 90 degree arc a player might approach through.
      let worst = 0;
      for (let k = -2; k <= 2; k++) {
        const gr = Math.abs(grade(cx, cz, s.heading + k * 0.22));
        if (gr > worst) worst = gr;
      }
      if (!best || worst < best.worst) best = { r, a, cx, cz, worst, gr: grade(cx, cz, s.heading) };
    }
  }
  if (best) {
    out.push(`  best sill within 4 m: ${best.r.toFixed(1)} m away, worst approach grade ${best.worst.toFixed(2)}`
      + ` (heading grade ${best.gr.toFixed(2)}), dy ${(terrain.heightAt(best.cx, best.cz) - terrain.heightAt(s.x, s.z)).toFixed(1)} m`);
  }

  // 3. the profile straight out of the door, so "7.6 m up in 6 m" is visible
  //    as a shape rather than as one ratio.
  const prof = [];
  for (let d = 0; d <= 24; d += 3) {
    const px = s.x + Math.sin(s.heading) * d, pz = s.z + Math.cos(s.heading) * d;
    prof.push(`${d}m ${(terrain.heightAt(px, pz) - terrain.heightAt(s.x, s.z)).toFixed(1)}`);
  }
  out.push(`  profile out of the door: ${prof.join('  ')}`);
}

/* ---- what else is built on top of each door --------------------------- */
// The frame from 8 m out at Fociaugh is dominated by large beige slabs that
// nothing in `Portal.ts` builds. A door's problem is not always its own
// geometry, and no grade number can say so.
out.push('');
out.push('=== every scene mesh within 40 m of a door, nearest first, by owner');
for (const s of sites) {
  const near = new Map();
  const y0 = terrain.heightAt(s.x, s.z);
  for (const top of g.scene.children) {
    const label = top.name || top.type;
    top.updateMatrixWorld(true);
    top.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      // A MERGED mesh has its origin at the world origin, so `getWorldPosition`
      // is nowhere near the thing it draws — the first version of this census
      // reported one neighbour at Keycatrich and none at all at the other two,
      // on doors that photograph as walled in. Ask the bounding box.
      const geo = o.geometry;
      if (!geo) return;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox.clone().applyMatrix4(o.matrixWorld);
      const dx = Math.max(bb.min.x - s.x, 0, s.x - bb.max.x);
      const dz = Math.max(bb.min.z - s.z, 0, s.z - bb.max.z);
      const d = Math.hypot(dx, dz);
      if (d > 40) return;
      const k = `${label} / ${o.name || o.type}`;
      const cur = near.get(k);
      if (!cur || d < cur.d) near.set(k, { d, y: bb.max.y - y0 });
    });
  }
  const rows = [...near.entries()].sort((a, b) => a[1].d - b[1].d).slice(0, 12);
  out.push(`  [${s.id}]`);
  for (const [k, v] of rows) out.push(`     ${v.d.toFixed(1).padStart(5)} m  dy ${v.y.toFixed(1).padStart(6)}  ${k}`);
}

return out.join('\n');

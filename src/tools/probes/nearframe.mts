// Candidate-framing sweep for the near-field lane, with the number that decides
// it measured rather than eyeballed.
//
// The lane's opening thesis was that the bottom third of a vista reads bare
// because the bottom of frame lands at 59-121 m, past every vegetation ring
// that has a silhouette, and that dropping the camera's clearance over its own
// ground would fix it for free. `bottom-hit` is roughly
// `clearance / tan(|pitch| + fov/2)`, so the arithmetic said yes.
//
// It was a negative. Fifteen candidates at 7/10/14 m of clearance on five
// shots produced individual grass blades in NONE of them: the near ground is
// dirt speckle in Leide and a crushed dark mat in the green zones, at every
// clearance. The instrument stays because the numbers are still the right ones
// to argue a re-framing from -- but read the ranking off the frames, not off
// `bottom-hit`.
//
//   node src/tools/framecam.mts --probe src/tools/probes/nearframe.mts \
//     --out tmp/shots/l3-sweep --jpeg
//
// `__NF_EYES` overrides the swept clearances and `__NF_SHOTS` the shot list.
// `__NF_SPECS` is a JSON array of explicit candidates, each
// `{ shot, name?, dx?, dz?, eye?, fov?, aimDx?, aimDz?, aimDy? }`, offsets in
// metres from the named shot's own camera and target -- which is how a vista is
// slid sideways along a scarp lip to put an existing tree at the frame edge
// instead of over the lens.
const g = window.GAME;
const terr = g.get('Terrain');
const { SHOTS } = await import('/game/Shots.ts');

const EYES = (window.__NF_EYES || '7,10,14').split(',').map(Number);
const NAMES = (window.__NF_SHOTS
  || 'zone_longwythe,zone_vannath,zone_three_valleys,vista_dusk,zone_lestallum')
  .split(',').map((s) => s.trim()).filter(Boolean);

/** March a ray until it is under the ground; returns metres, or -1. */
function hit(ox, oy, oz, dx, dy, dz, far = 5000) {
  let t = 1;
  while (t < far) {
    const y = oy + dy * t;
    if (y <= terr.heightAt(ox + dx * t, oz + dz * t)) {
      let lo = Math.max(0, t - 8), hi = t;
      for (let k = 0; k < 26; k++) {
        const m = (lo + hi) / 2;
        if (oy + dy * m <= terr.heightAt(ox + dx * m, oz + dz * m)) hi = m; else lo = m;
      }
      return hi;
    }
    t += Math.max(1, t * 0.015);
  }
  return -1;
}

const V3 = g.camera.position.constructor;
const rows = ['shot                            eye   camY   bottom  centre'];
const specs = [];

/** Resolve one candidate, measure it, and queue it for capture. */
function consider(spec) {
  SHOTS.__probe = spec;
  g.applyShot('__probe');
  g.settle(4);
  const cam = g.camera;
  cam.updateMatrixWorld(true);
  const p = cam.position;
  const bottom = new V3(0, -1, 0.5).unproject(cam).sub(p).normalize();
  const centre = new V3(0, 0, 0.5).unproject(cam).sub(p).normalize();
  const bh = hit(p.x, p.y, p.z, bottom.x, bottom.y, bottom.z);
  const ch = hit(p.x, p.y, p.z, centre.x, centre.y, centre.z);
  rows.push(`${spec.name.padEnd(30)} ${String(spec._eye ?? '').padStart(4)} `
    + `${p.y.toFixed(1).padStart(6)} ${bh.toFixed(0).padStart(7)} ${ch.toFixed(0).padStart(7)}`);
  specs.push(spec);
}

const explicit = window.__NF_SPECS ? JSON.parse(window.__NF_SPECS) : null;
if (explicit) {
  for (let i = 0; i < explicit.length; i++) {
    const c = explicit[i];
    const base = SHOTS[c.shot];
    if (!base || !base.pos) { rows.push(`${c.shot}: not a fixed shot, skipped`); continue; }
    const x = base.pos[0] + (c.dx || 0), z = base.pos[2] + (c.dz || 0);
    const ground = terr.heightAt(x, z);
    const eye = c.eye != null ? c.eye : base.pos[1] - terr.heightAt(base.pos[0], base.pos[2]);
    consider({
      ...base,
      name: c.name || `${c.shot}__c${i}`,
      fov: c.fov != null ? c.fov : base.fov,
      pos: [+x.toFixed(1), +(ground + eye).toFixed(1), +z.toFixed(1)],
      target: [base.target[0] + (c.aimDx || 0), base.target[1] + (c.aimDy || 0),
        base.target[2] + (c.aimDz || 0)],
      _eye: +eye.toFixed(1),
    });
  }
} else {
  for (const name of NAMES) {
    const base = SHOTS[name];
    if (!base || !base.pos) { rows.push(`${name}: not a fixed shot, skipped`); continue; }
    const ground = terr.heightAt(base.pos[0], base.pos[2]);
    for (const eye of EYES) {
      consider({
        ...base,
        name: `${name}__e${eye}`,
        pos: [base.pos[0], +(ground + eye).toFixed(1), base.pos[2]],
        target: [...base.target],
        _eye: eye,
      });
    }
  }
}

return { table: rows, specs };

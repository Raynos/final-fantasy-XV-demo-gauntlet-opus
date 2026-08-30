/**
 * Does the body poke through the clothes?
 *
 *   node src/tools/probe.mts src/tools/probes/skinclip.mts --dirty
 *
 * Written the day `Geo.ts`'s inward winding was fixed. While every sweep was
 * wound inward and the skin material was `FrontSide`, what drew for the body
 * was the *far* side of each limb — a surface 5-30 cm BEHIND the true one — so
 * the garment won every depth test no matter how far inside the skin it sat.
 * The moment the winding was right, the skin's real surface drew where it
 * actually is, and the party came out in patches of bare shoulder, back and
 * thigh. Nothing about the clothes changed; they had simply never been in
 * front of anything.
 *
 * For each body vertex this finds the nearest outfit vertex and reports the
 * signed distance along the OUTFIT's normal there: positive means the skin is
 * outside the cloth, i.e. it will draw through it. Bind pose, which is where
 * both meshes are authored; the skinning is shared, so a bind-pose clearance
 * is what the authoring has to fix.
 */
const g = window.GAME;
const party = g.get('Party');
const chars = [g.get('Player').character];
for (const m of (party && party.members) || []) {
  const c = m && (m.character || (m.actor && m.actor.character));
  if (c && c.root && !chars.includes(c)) chars.push(c);
}
const L = [];

// Slice comparison, which is the only sign-safe way to do this: a garment is a
// layered set of shells and the NEAREST cloth vertex to a skin vertex is often
// on an inner face, whose normal points back at the body — so a
// nearest-vertex signed distance reports "outside" for a body that is properly
// covered. A horizontal slice about a known axis has no such ambiguity: at a
// given height and azimuth, the cloth radius must simply exceed the skin
// radius.
function slice(name, verts, y, ax, az, tag, out) {
  const BINS = 24;
  const bodyR = new Array(BINS).fill(-1), clothR = new Array(BINS).fill(1e9);
  for (const [p, isCloth] of verts) {
    for (let i = 0; i < p.count; i++) {
      const vy = p.getY(i);
      if (Math.abs(vy - y) > 0.006) continue;
      const dx = p.getX(i) - ax, dz = p.getZ(i) - az;
      const r = Math.hypot(dx, dz);
      if (r > 0.35) continue;
      const b = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * BINS) % BINS;
      if (isCloth) clothR[b] = Math.min(clothR[b], r); else bodyR[b] = Math.max(bodyR[b], r);
    }
  }
  const gaps = [];
  for (let b = 0; b < BINS; b++) {
    if (bodyR[b] < 0 || clothR[b] > 1e8) continue;
    gaps.push([b, (clothR[b] - bodyR[b]) * 1000]);
  }
  if (!gaps.length) return;
  const worst = gaps.slice().sort((a, b) => a[1] - b[1]);
  const nBad = gaps.filter((q) => q[1] < 0).length;
  out.push(`  ${tag.padEnd(16)} y=${y.toFixed(2)}  bins ${String(gaps.length).padStart(2)}  `
    + `skin proud in ${String(nBad).padStart(2)}  worst ${worst[0][1].toFixed(1)} mm @bin ${worst[0][0]}  `
    + `median ${gaps.map((q) => q[1]).sort((a, b) => a - b)[Math.floor(gaps.length / 2)].toFixed(1)} mm`);
}

for (const ch of chars) {
  const bg = ch.body && ch.body.geometry, og = ch.outfit && ch.outfit.geometry;
  if (!bg || !og) { L.push(`${ch.name}: no body/outfit`); continue; }
  const verts = [[bg.attributes.position, false], [og.attributes.position, true]];
  L.push(`${ch.name}:`);
  const out = [];
  // torso column about the midline
  for (const y of [1.45, 1.35, 1.25, 1.15, 1.05, 0.95]) slice(ch.name, verts, y, 0, 0, 'torso/midline', out);
  // each thigh/shin about the limb's own centre, found from the body slice
  for (const sgn of [1, -1]) {
    for (const y of [0.80, 0.70, 0.55, 0.40, 0.25]) {
      let sx = 0, sz = 0, n = 0;
      const bp = bg.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        if (Math.abs(bp.getY(i) - y) > 0.006) continue;
        if (Math.sign(bp.getX(i)) !== sgn || Math.abs(bp.getX(i)) < 0.02) continue;
        sx += bp.getX(i); sz += bp.getZ(i); n++;
      }
      if (n < 6) continue;
      slice(ch.name, verts, y, sx / n, sz / n, `leg${sgn > 0 ? 'L' : 'R'}`, out);
    }
  }
  L.push(...out);
}
return L.join('\n');

/**
 * **How far does each hair vertex stand off the sculpted skull?**
 *
 *   node src/tools/probe.mts src/tools/probes/hairstand.mts --dirty
 *
 * Round 13's judge listed as an outright defect *"hair cards floating clear of
 * the scalp"* on one side. Nothing in the repo measured that. `Hair.ts` has two
 * corridor clamps — `hugSkull`, which has a floor and a ceiling, and
 * `liftOutOfSkull`, which is **floor only** and is what every *guided* strand
 * gets — so a guided card's path can wander arbitrarily far from the head with
 * nothing to stop it, and the only symptom is a frame.
 *
 * This reports the distribution of the signed offset along the skull normal,
 * per character, in millimetres of character space. Read the percentiles: the
 * groom legitimately stands off (a fringe is not glued down), so the question
 * is not "is anything off the scalp" but "where does the tail go".
 *
 * ## Controls, because seven instruments here measured themselves
 *
 * 1. **The head mesh itself, through the identical code path.** Its vertices
 *    ARE the skull, so its offsets must be ~0. Anything else means the
 *    canonical-space transform below is wrong and no hair number means
 *    anything. Reported as `controls.headMeshMm`.
 * 2. **The scalp shell**, the first rows `buildHair` emits, which is authored
 *    as the skull surface inflated by a fixed `vol`. It must come back at that
 *    inflation and no more.
 */
const g = window.GAME;
g.settle(20);
const Face = await import('/characters/rig/Face.ts');

const party = g.get('Party');
const player = g.get('Player');
const who = [['noctis', player], ['gladio', party && party.get && party.get('gladio')],
  ['ignis', party && party.get && party.get('ignis')], ['prompto', party && party.get && party.get('prompto')]];

const r = (x, n = 2) => (x === null || !isFinite(x) ? null : +x.toFixed(n));
const out = { controls: {}, chars: {} };

/**
 * Offset of every vertex of `attr` from the sculpted skull, along the skull
 * normal, in mm. `sampler` is `skullSampler(look)` in canonical head space.
 */
function offsets(attr, sampler, o, sc, rr, limit, from, to) {
  const list = [];
  const worst = [];
  const lo = from || 0, hi = to === undefined ? attr.count : Math.min(to, attr.count);
  const n = limit ? Math.min(limit, hi - lo) : (hi - lo);
  const step = (hi - lo) > n ? Math.floor((hi - lo) / n) : 1;
  for (let i = lo; i < hi; i += step) {
    const vx = (attr.getX(i) - o.x) / sc, vy = (attr.getY(i) - o.y) / sc, vz = (attr.getZ(i) - o.z) / sc;
    const th = Math.atan2(vx / rr[0], vz / rr[2]);
    const ph = Math.acos(Math.max(-1, Math.min(1, vy / rr[1])));
    const { p: q, n: nn } = sampler(th, ph);
    const d = ((vx - q.x) * nn.x + (vy - q.y) * nn.y + (vz - q.z) * nn.z) * sc * 1000;
    list.push(d);
    if (d > 60) worst.push({ i, d: r(d), yMm: r(vy * 1000, 1), xMm: r(vx * 1000, 1), zMm: r(vz * 1000, 1) });
  }
  worst.sort((a, b) => b.d - a.d);
  list.sort((a, b) => a - b);
  const pc = (f) => list[Math.min(list.length - 1, Math.max(0, Math.round(f * (list.length - 1))))];
  return {
    n: list.length,
    minMm: r(list[0]), p50Mm: r(pc(0.5)), p90Mm: r(pc(0.9)), p99Mm: r(pc(0.99)),
    p999Mm: r(pc(0.999)), maxMm: r(list[list.length - 1]),
    over40mm: list.filter((x) => x > 40).length,
    over60mm: list.filter((x) => x > 60).length,
    /**
     * The ten worst, with their vertex index and their canonical position.
     * The index says which emitter they belong to — `buildHair` emits the
     * scalp shell, then the cards, then the halo, then the wisps, in that
     * order — and x/y/z says where on the head they are.
     */
    worst10: worst.slice(0, 10),
  };
}

for (const [key, m] of who) {
  const ch = m && m.character;
  if (!ch || !ch.head || !ch.hair) { out.chars[key] = null; continue; }
  const dims = ch.rig.dims;
  const o = dims.headOrigin, sc = dims.headScale;
  const look = ch.look;
  const sampler = Face.skullSampler(look);
  const rr = [Face.HEAD_R[0] * (look.headWidth ?? 1), Face.HEAD_R[1], Face.HEAD_R[2]];

  if (!out.controls.skullGridMm) {
    // **The skull grid only.** `buildHead` emits (SEGU+1)x(SEGV+1) shell
    // vertices first and then the chin cap, the ears and the lids, none of
    // which lie on the skull, so including them measures the ear rather than
    // the instrument.
    const NSK = 145 * 121;
    out.controls.skullGridMm = offsets(ch.head.geometry.getAttribute('position'), sampler, o, sc, rr, 6000, 0, NSK);
    out.controls.headMeshAllMm = offsets(ch.head.geometry.getAttribute('position'), sampler, o, sc, rr, 6000);
    out.controls._note = 'skullGridMm IS the skull through this path and is the noise floor: '
      + 'the (theta, phi) recovered from a SCULPTED vertex is not the (theta, phi) it was '
      + 'built at, because the brushes move y as well as z. Every hair number below is '
      + 'only meaningful against this spread. headMeshAllMm adds the ears, lids and chin '
      + 'cap, which genuinely stand off the skull and are not a control.';
  }
  const hp = ch.hair.geometry.getAttribute('position');
  out.chars[key] = {
    all: offsets(hp, sampler, o, sc, rr, 12000),
    /** The scalp shell is emitted first and is the skull inflated by `vol`. */
    shellFirst4k: offsets(hp, sampler, o, sc, rr, 4000, 0, 4000),
    verts: hp.count,
  };
}

return out;

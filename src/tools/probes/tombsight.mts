/*
 * Is `poi_tomb` framed THROUGH a ridge?
 *
 *   node src/tools/probe.mts src/tools/probes/tombsight.mts
 *
 * `landmarks-r2` closed the "the tomb is a 40-px grey box" claim as a negative:
 * `_tomb` is a full `BuildKit` temple — crepidoma, entasis, entablature,
 * pediment, cella — and on a clear sightline at the same 320 m every one of
 * those reads (`tmp/shots/lr2-tomb/tomb_320.jpg`, verified by eye). What is
 * left is the FRAMING, and framing is a number: this walks the drawn ground
 * along the shot's own sightline and asks how much of the temple the camera can
 * actually see over the highest thing between them.
 *
 * `Shots.ts` belongs to the coordinator. This measures and recommends; it
 * changes nothing.
 */
const g = window.GAME;
const terrain = g.get('Terrain');
const h = (x, z) => terrain.drawnHeightAt(x, z);

// `poi_tomb` in src/game/Shots.ts, and the pin it is aimed at.
const CAM = [330, 95.8, -1330];
const PIN = [66, -1514];          // tomb_wise, WorldMap.ts
// The temple's own height above its deck. `_tomb`'s crepidoma + columns +
// entablature + pediment, through the kit's `world` scale of 1.4.
const TEMPLE_H = Number(window.__TS_H || 13);

const dx = PIN[0] - CAM[0], dz = PIN[1] - CAM[2];
const D = Math.hypot(dx, dz);
const deck = h(PIN[0], PIN[1]);

// The elevation angle from the camera eye to each station of the ground, and to
// the temple's base and crown. Anything whose angle exceeds the crown's angle
// hides the whole building; anything between base and crown hides part of it.
const angTo = (y, d) => Math.atan2(y - CAM[1], d);
const aBase = angTo(deck, D), aCrown = angTo(deck + TEMPLE_H, D);

let worstA = -Math.PI, worstD = 0, worstY = 0;
const prof = [];
for (let i = 1; i <= 120; i++) {
  const t = i / 120, d = D * t;
  const y = h(CAM[0] + dx * t, CAM[2] + dz * t);
  const a = angTo(y, d);
  if (i < 120 && a > worstA) { worstA = a; worstD = d; worstY = y; }
  if (i % 10 === 0) prof.push(`${d.toFixed(0)}m ${y.toFixed(1)}`);
}

// How much of the temple clears the crest, in metres and as a fraction.
const clearY = CAM[1] + Math.tan(worstA) * D;   // the crest line projected out to the pin
const visible = Math.max(0, deck + TEMPLE_H - Math.max(deck, clearY));

// What it would take to see the whole thing from the same spot: raise the eye
// until the crest's angle drops under the temple's base angle.
const needEye = worstD > 0 && worstD < D
  ? (worstY - deck * (worstD / D)) / (1 - worstD / D)
  : CAM[1];

/**
 * Two ways out, both priced.
 *
 * (a) Raise the eye where it stands. The binding crest moves as the eye rises,
 *     so this is a sweep and not the one-line solve.
 * (b) Keep the range and swing the bearing. `landmarks-r2` photographed the
 *     temple whole at this same 322 m from a clear line, so a clear bearing
 *     exists; this says which ones and how wide the clear arc is.
 */
const visibleFrom = (ex, ey, ez) => {
  const ddx = PIN[0] - ex, ddz = PIN[1] - ez, dd = Math.hypot(ddx, ddz);
  let wa = -Math.PI;
  for (let i = 1; i < 120; i++) {
    const t = i / 120;
    wa = Math.max(wa, Math.atan2(h(ex + ddx * t, ez + ddz * t) - ey, dd * t));
  }
  const cy = ey + Math.tan(wa) * dd;
  return Math.max(0, deck + TEMPLE_H - Math.max(deck, cy));
};

let eyeNeeded = null;
for (let e = CAM[1]; e <= CAM[1] + 80; e += 0.5) {
  if (visibleFrom(CAM[0], e, CAM[2]) >= TEMPLE_H - 0.05) { eyeNeeded = e; break; }
}

// Bearings, at the shot's own range, with the eye at the ground plus the shot's
// own 4.4 m of eye height over the terrain under it.
const eyeOverGround = CAM[1] - h(CAM[0], CAM[2]);
const bearings = [];
for (let b = 0; b < 360; b += 10) {
  const th = (b * Math.PI) / 180;
  const ex = PIN[0] + Math.cos(th) * D, ez = PIN[1] + Math.sin(th) * D;
  const ey = h(ex, ez) + eyeOverGround;
  const v = visibleFrom(ex, ey, ez);
  bearings.push({ deg: b, eyeY: +ey.toFixed(1), visibleM: +v.toFixed(1) });
}
const clear = bearings.filter((b) => b.visibleM >= TEMPLE_H - 0.5).map((b) => b.deg);
const shotBearing = ((Math.atan2(CAM[2] - PIN[1], CAM[0] - PIN[0]) * 180) / Math.PI + 360) % 360;

return {
  note: 'Every height is Terrain.drawnHeightAt — the surface the clipmap draws, '
    + 'not the analytic field. `visible` is the metres of a '
    + `${TEMPLE_H} m temple that clear the highest ground between camera and pin.`,
  camera: CAM, pin: PIN, rangeM: +D.toFixed(1),
  deckY: +deck.toFixed(1), eyeAboveDeck: +(CAM[1] - deck).toFixed(1),
  crest: { atM: +worstD.toFixed(0), y: +worstY.toFixed(1), degAboveEye: +(worstA * 180 / Math.PI).toFixed(2) },
  templeDeg: { base: +(aBase * 180 / Math.PI).toFixed(2), crown: +(aCrown * 180 / Math.PI).toFixed(2) },
  sightlineYAtPin: +clearY.toFixed(1),
  visibleM: +visible.toFixed(1),
  visibleFrac: +(visible / TEMPLE_H).toFixed(2),
  eyeYToClearWholly: +needEye.toFixed(1),
  profile: prof,
  fixA_eyeYForWholeTemple: eyeNeeded,
  fixA_riseM: eyeNeeded === null ? null : +(eyeNeeded - CAM[1]).toFixed(1),
  shotBearingDeg: +shotBearing.toFixed(0),
  eyeOverGroundM: +eyeOverGround.toFixed(1),
  fixB_clearBearingsDeg: clear,
  bearings: bearings.map((b) => `${b.deg} ${b.visibleM}`),
};

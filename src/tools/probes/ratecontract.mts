/*
 * Is any driven joint vibrating rather than moving?
 *
 * Sibling-ports Wave 4, the animation rate contract. FFXV-opus's final two
 * commits exist because a rig differentiated its own *interpolated render*
 * transform to recover motion under a fixed-step accumulator: the chest swung
 * 15 degrees per frame and reversed direction on 63% of them. The portable half
 * of that lesson is not the fix, it is the METRIC — a signal that reverses on
 * 40-50% of frames is vibrating, whatever it looks like in a still.
 *
 * Our rigs already satisfy the contract structurally: `Anim.update` is handed
 * `st.speed` and `st.velocity`, and both `Player` and `Party` build velocity
 * from the sim's own heading and speed rather than by differencing positions.
 * Nothing under `characters/rig/` subtracts a previous transform. That is an
 * argument from reading, and this is the measurement that makes it a fact —
 * and the one to re-run after any posture or gait work, which is what RESCUE
 * §B2's unverified posture merge was never checked against.
 *
 * Reported per bone per axis: the fraction of steps on which the frame-to-frame
 * delta changes sign, over the steps where the joint is actually moving. A
 * still joint is excluded rather than counted as 0% or 50% depending on noise.
 */
const g = window.GAME;
const party = g.get('Party');
const player = g.get('Player');
if (!party || !party.members || !party.members.length) return 'no Party members';

const FRAMES = 240;
const DT = 1 / 60;
/* Below this the joint is not moving and its sign is noise, not a signal.
 * Radians per step: 0.0002 rad at 60 Hz is 0.7 degrees per second. */
const STILL = 2e-4;

/* Walk the party forward so the gait is actually running. Driving `speed`
 * directly is the point: a probe that measures an idle rig measures nothing,
 * and every failure this metric is for lives in locomotion. */
if (player) { player.speed = 3.2; player.heading = 0.6; }

const tracks = [];
for (const m of party.members) {
  // `Character.rig` is `buildSkeleton()`'s return, so the bone array is
  // `rig.bones` -- not `character.skeleton`, which does not exist and which
  // this probe reported as "no bones found" on its first run rather than as an
  // error. A probe that returns a clean negative for a wrong property name is
  // the same failure class as the one it is here to catch.
  const rig = m.character && m.character.rig;
  if (!rig || !rig.bones) continue;
  for (const b of rig.bones) {
    tracks.push({
      who: m.name, bone: b.name, node: b,
      prev: [b.rotation.x, b.rotation.y, b.rotation.z],
      lastD: [0, 0, 0], flips: [0, 0, 0], moves: [0, 0, 0], amp: [0, 0, 0],
    });
  }
}
if (!tracks.length) return 'no bones found on any party member';

for (let f = 0; f < FRAMES; f++) {
  g.frame(DT);
  for (const t of tracks) {
    const r = [t.node.rotation.x, t.node.rotation.y, t.node.rotation.z];
    for (let a = 0; a < 3; a++) {
      const d = r[a] - t.prev[a];
      t.prev[a] = r[a];
      if (Math.abs(d) < STILL) continue;
      t.amp[a] = Math.max(t.amp[a], Math.abs(d));
      t.moves[a]++;
      if (t.lastD[a] !== 0 && Math.sign(d) !== Math.sign(t.lastD[a])) t.flips[a]++;
      t.lastD[a] = d;
    }
  }
}

const AX = ['x', 'y', 'z'];
const rows = [];
let worst = 0, worstName = '-';
for (const t of tracks) {
  for (let a = 0; a < 3; a++) {
    // Under ~30 moving steps the rate is not estimated, it is guessed.
    if (t.moves[a] < 30) continue;
    const rate = t.flips[a] / t.moves[a];
    if (rate > worst) { worst = rate; worstName = `${t.who}.${t.bone}.${AX[a]}`; }
    if (rate >= 0.35) {
      rows.push(`  VIBRATING  ${t.who}.${t.bone}.${AX[a]}  `
        + `${(rate * 100).toFixed(1)}% sign flips over ${t.moves[a]} moving steps, `
        + `peak ${(t.amp[a] * 180 / Math.PI).toFixed(2)} deg/frame`);
    }
  }
}

const out = [];
out.push(`rate contract: ${tracks.length} bones x 3 axes over ${FRAMES} steps at ${(1 / DT).toFixed(0)} Hz`);
out.push(`worst sign-flip rate: ${(worst * 100).toFixed(1)}% on ${worstName}`);
if (!rows.length) {
  out.push('PASS — no driven joint reverses on 35% or more of its moving frames.');
  out.push('A rig that differentiated its render transform would sit at 40-63% here.');
} else {
  out.push(`FAIL — ${rows.length} vibrating signal(s):`);
  out.push(...rows);
}
return out.join('\n');

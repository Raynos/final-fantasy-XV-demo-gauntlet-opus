/*
 * Is `Water.riverJoins` empty because the routing found no confluences, or
 * because a confluence was found and then dropped on the way out?
 *
 *   node src/tools/probe.mts src/tools/_probe/l23joins.mts
 *
 * `River.ts:596` increments `stats.confluences` exactly when `tk >= 0`, and
 * `:778` is the `if (tk < 0) continue;` that decides whether a join is
 * emitted. So the two numbers answer it between them: confluences 0 and joins
 * 0 means the routing genuinely found none (nine reaches all ending in the
 * same sea, and `:594` rejects "two reaches meeting end to end at the sea");
 * confluences > 0 with joins 0 is a bug.
 */
const g = window.GAME;
const w = g.get('Water');
const s = w.riverStats;
const out = {
  joins: w.riverJoins ? w.riverJoins.length : null,
  confluences: s ? s.confluences : null,
  sources: s ? s.sources : null,
  reaches: s ? s.reaches : null,
  dropped: s ? s.dropped : null,
  metres: s ? Math.round(s.metres) : null,
};
console.log(`[l23joins] joins=${out.joins} confluences=${out.confluences} `
  + `sources=${out.sources} reaches=${out.reaches} dropped=${out.dropped} metres=${out.metres}`);
return out;

/**
 * The distribution of hair self-occlusion, straight off the built groom.
 *
 *   node src/tools/probe.mts src/tools/probes/hairocc.mts
 *
 * `Hair.ts` writes depth-in-the-pile into `aMat.y` — 0 at the outside of the
 * groom, 1 against the skull — and `Materials.ts`'s hair branch spends the sky
 * fill's pedestal on it. A modulation is only mean-preserving if you know the
 * mean, and every emitter that does NOT compute it (the scalp shell, the halo,
 * the hairline wisps, the brows) writes 0 and is counted here too, because they
 * are also lit by the same term. So this prints the histogram per hero.
 */
const g = window.GAME;
const party = g.get('Party');
const out = [];
const subjects = [['noctis', g.get('Player')]];
for (const id of ['gladio', 'ignis', 'prompto']) {
  const m = party && party.get && party.get(id);
  if (m) subjects.push([id, m]);
}
for (const [key, m] of subjects) {
  const ch = m.character;
  if (!ch || !ch.hair) { out.push(`${key}: no hair`); continue; }
  let n = 0, sum = 0;
  const bins = new Array(10).fill(0);
  ch.hair.traverse((o) => {
    const a = o.geometry && o.geometry.attributes && o.geometry.attributes.aMat;
    if (!a) return;
    for (let i = 0; i < a.count; i++) {
      const v = a.getY(i);
      n++; sum += v;
      bins[Math.max(0, Math.min(9, Math.floor(v * 10)))]++;
    }
  });
  if (!n) { out.push(`${key}: no aMat`); continue; }
  const pct = bins.map((b) => ((b / n) * 100).toFixed(1).padStart(5));
  out.push(`${key.padEnd(8)} n=${String(n).padStart(7)}  mean occ ${(sum / n).toFixed(3)}  bins 0.0-1.0 %:${pct.join('')}`);
}
return out.join('\n');

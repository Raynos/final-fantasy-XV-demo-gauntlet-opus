/*
 * Does a POI's earthwork end in the air?
 *
 *   node src/tools/probe.mts src/tools/probes/padhang.mts
 *   node src/tools/probe.mts src/tools/probes/padhang.mts --set __PH_WORST=30
 *
 * `floatcheck` gate 1 is `min over MESHES of the gap`, and it says so in its own
 * blind list: a compound passes as soon as ONE of its merged meshes reaches the
 * ground. So a pad whose uphill half is buried two metres and whose downhill
 * half hangs eight metres over a crest passes at 0.00, and what you see in the
 * frame is a temple on a flying saucer (`tmp/shots/lr2-tombp/float.png`).
 *
 * `gradePad` already knows about this case — `cliff`, `maxFill`, the deck
 * retreat — so the question is not whether the intent exists but whether it
 * holds on the pads we ship. This measures the one thing those three mechanisms
 * exist to prevent: **the toe ring, the outermost station of the batter, is
 * supposed to be UNDER the drawn ground.** Where it is above it, the earthwork
 * stops in mid air and the number is how far.
 *
 * Measured per apron mesh (`*_poi_ground` / `*_poi_gravel` — `_apron` is the
 * only thing that adds one), on the outer 12% of the mesh's own radius so the
 * deck and the ramp cannot dilute it, against `Terrain.drawnHeightAt` at the
 * finest ring, which is the ground a player standing beside it sees.
 */
const g = window.GAME;
const WORST = Number(window.__PH_WORST || 20);
const props = g.get('Props');
const terrain = g.get('Terrain');
const cell0 = terrain.clipmap ? terrain.clipmap.cell0 : 1.5;
const pk = props.poiKits;

let builtNow = 0;
for (const s of pk.sites) {
  if (s.group) continue;
  try { pk._make(s, g); builtNow++; } catch (e) { void e; }
}

const V = Object.getPrototypeOf(g.camera.position).constructor;
const v = new V();
const rows = [];
for (const b of pk.built) {
  b.group.updateMatrixWorld(true);
  const cx = b.poi.x, cz = b.poi.z;
  b.group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const nm = String(o.name || '');
    if (!/_poi_(ground|gravel)$/.test(nm)) return;
    const p = o.geometry.attributes.position;
    // The mesh's own outer radius, so the band is the toe and not a constant.
    let rmax = 0;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      const d = Math.hypot(v.x - cx, v.z - cz);
      if (d > rmax) rmax = d;
    }
    const band = rmax * 0.88;
    let hang = -1e9, hx = 0, hz = 0, n = 0, sum = 0;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (Math.hypot(v.x - cx, v.z - cz) < band) continue;
      const gy = terrain.drawnHeightAt(v.x, v.z, cell0);
      const gap = v.y - gy;
      n++; sum += gap;
      if (gap > hang) { hang = gap; hx = v.x; hz = v.z; }
    }
    if (!n) return;
    rows.push({
      id: b.poi.id, type: b.poi.type, mesh: nm, r: +rmax.toFixed(1),
      toeN: n, toeMean: +(sum / n).toFixed(2), hang: +hang.toFixed(2),
      at: [Math.round(hx), Math.round(hz)],
    });
  });
}
rows.sort((a, b) => b.hang - a.hang);
const over = (t) => rows.filter((r) => r.hang > t).length;
// One line per pad: `probe.mts` prints the return value with a depth limit, and
// a nested array of 91 objects is elided exactly where the answer is.
const pad = (s, n) => (String(s) + '                        ').slice(0, n);
return {
  builtNow, aprons: rows.length,
  overhang: { over0: over(0), over1: over(1), over3: over(3), over6: over(6) },
  meanToe: +(rows.reduce((s, r) => s + r.toeMean, 0) / Math.max(1, rows.length)).toFixed(2),
  worst: rows.slice(0, WORST).map((r) =>
    `${pad(r.id, 24)} ${pad(r.type, 9)} r=${pad(r.r, 6)} toeMean=${pad(r.toeMean, 8)} hang=${pad(r.hang, 8)} @${r.at[0]},${r.at[1]}`),
};

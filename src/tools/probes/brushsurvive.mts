/**
 * **Does the sculpt survive the tessellation?** — the bench-versus-frame
 * resolution for plan §8.2.
 *
 *   node src/tools/probe.mts src/tools/probes/brushsurvive.mts --dirty
 *
 * `headprofile.mts` says the head has full anatomy (sagittal relief 0.445 against
 * 0.172 for its own ablation). A blind judge at portrait range says the face has
 * *no mouth, no nose, no sockets*. Both are looking at the same head, so one of
 * them is blind to something.
 *
 * This probe answers it by ablating **one brush at a time** — the sibling's
 * `--without <op>` — and measuring the displacement each brush actually achieves
 * at two sampling rates:
 *
 *   - `mesh`  : the shipped grid, `segU=76 x segV=56`, exactly what `buildHead`
 *               evaluates.
 *   - `fine`  : the same surface at 6x in both directions, i.e. the continuous
 *               sculpt the brush table is *authored against*.
 *
 * `survival = maxDisp(mesh) / maxDisp(fine)`. A brush wide enough for the grid
 * scores ~1. A brush whose radius is at or below the vertex spacing scores near
 * 0 — it exists in the recipe, is invisible in the mesh, and no amount of
 * material, normal or lighting work will ever show it.
 *
 * Controls, because seven instruments in this repo measured themselves:
 *   - a synthetic **wide** brush (r = 40 mm) must score ~1.0
 *   - a synthetic **tiny** brush (r = 1 mm) must score ~0.0
 *   - the null ablation (remove nothing) must score exactly 0 displacement
 * If those three do not come out that way, every number below is noise.
 */
const g = window.GAME;
g.settle(10);

const Face = await import('/characters/rig/Face.ts');
const Geo = await import('/characters/rig/Geo.ts');
const THREE = await import('/vendor/three.ts').catch(() => null);

const r = (x, n = 4) => (x === null || !isFinite(x) ? null : +x.toFixed(n));

const party = g.get('Party');
const player = g.get('Player');
const subjects = [['noctis', player], ['gladio', party && party.get && party.get('gladio')]];

const out = { grid: {}, controls: {}, chars: {} };

// The shipped surface evaluator, re-implemented against the exported pieces so
// the two sampling rates run through identical code.
function makeEval(look, brs) {
  const hw = look.headWidth ?? 1;
  const HR = Face.HEAD_R;
  const rr = [HR[0] * hw, HR[1], HR[2]];
  return (theta, phi) => {
    const { p, n } = Face.skullPoint(theta, phi, rr);
    Geo.applyBrushes(p, n, brs);
    return p;
  };
}

function gridPts(ev, su, sv) {
  const pts = new Float64Array((su + 1) * (sv + 1) * 3);
  let k = 0;
  for (let v = 0; v <= sv; v++) {
    const phi = Face.phiWarp(v / sv) * Math.PI;
    for (let u = 0; u <= su; u++) {
      const th = Math.PI + Face.thetaWarp(u / su) * Math.PI * 2;
      const p = ev(th, phi);
      pts[k++] = p.x; pts[k++] = p.y; pts[k++] = p.z;
    }
  }
  return pts;
}

function maxDisp(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i += 3) {
    const d = Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]);
    if (d > m) m = d;
  }
  return m;
}

const SU = Face.HEAD_SEG_U, SV = Face.HEAD_SEG_V, F = 3;

for (const [key, m] of subjects) {
  const ch = m && m.character;
  if (!ch || !ch.look) continue;
  const look = ch.look;
  const all = Face.brushes(look);
  const expanded = all;                       // brushes() already expands mirrors

  const evAll = makeEval(look, expanded);
  const meshAll = gridPts(evAll, SU, SV);
  const fineAll = gridPts(evAll, SU * F, SV * F);

  // ---- grid geometry, reported once ------------------------------------
  if (!out.grid.dyAtMouth) {
    // Real spacing between the two adjacent *shipped* rows/columns nearest the
    // given canonical height, so the warp is measured rather than assumed.
    const phiOf = (y) => Math.acos(Math.max(-1, Math.min(1, y / Face.HEAD_R[1])));
    const nearestRow = (y) => {
      const want = phiOf(y) / Math.PI;
      let best = 0, bd = 9;
      for (let v = 1; v < SV; v++) {
        const d = Math.abs(Face.phiWarp(v / SV) - want);
        if (d < bd) { bd = d; best = v; }
      }
      return best;
    };
    const probeY = (y) => {
      const v = nearestRow(y);
      const a = evAll(0, Face.phiWarp((v - 1) / SV) * Math.PI);
      const b = evAll(0, Face.phiWarp((v + 1) / SV) * Math.PI);
      return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / 2;
    };
    const probeDy = (y) => {
      const v = nearestRow(y);
      const a = evAll(0, Face.phiWarp((v - 1) / SV) * Math.PI);
      const b = evAll(0, Face.phiWarp((v + 1) / SV) * Math.PI);
      return Math.abs(a.y - b.y) / 2;
    };
    const probeX = (y) => {
      const phi = Face.phiWarp(nearestRow(y) / SV) * Math.PI;
      // columns either side of the front midline (thetaWarp(0.5) === 0.5)
      const uf = 0.5, du = 1 / SU;
      const a = evAll(Math.PI + Face.thetaWarp(uf - du) * Math.PI * 2, phi);
      const b = evAll(Math.PI + Face.thetaWarp(uf + du) * Math.PI * 2, phi);
      return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / 2;
    };
    out.grid = {
      segU: SU, segV: SV, headVerts: (SU + 1) * (SV + 1),
      rowSpacing_mm: { brow: r(probeY(0.005) * 1000, 2), eye: r(probeY(-0.006) * 1000, 2),
        nose: r(probeY(-0.046) * 1000, 2), mouth: r(probeY(-0.079) * 1000, 2),
        chin: r(probeY(-0.104) * 1000, 2) },
      rowDy_mm: { eye: r(probeDy(-0.006) * 1000, 2), mouth: r(probeDy(-0.079) * 1000, 2) },
      colSpacing_mm: { eye: r(probeX(-0.006) * 1000, 2), mouth: r(probeX(-0.079) * 1000, 2) },
      note: 'spacing at the front midline, in millimetres of surface',
    };
  }

  // ---- controls ---------------------------------------------------------
  if (key === 'noctis') {
    const nullAbl = maxDisp(meshAll, gridPts(makeEval(look, expanded), SU, SV));
    const wide = expanded.concat([{ p: [0, -0.079, 0.084], r: [0.040, 0.040, 0.040], amt: 0.010, dir: [0, 0, 1] }]);
    const tiny = expanded.concat([{ p: [0, -0.079, 0.084], r: [0.001, 0.001, 0.001], amt: 0.010, dir: [0, 0, 1] }]);
    const surv = (list) => {
      const ev = makeEval(look, list);
      const mm = maxDisp(gridPts(ev, SU, SV), meshAll);
      const ff = maxDisp(gridPts(ev, SU * F, SV * F), fineAll);
      return { mesh_mm: r(mm * 1000, 3), fine_mm: r(ff * 1000, 3), survival: r(ff > 1e-9 ? mm / ff : 0, 3) };
    };
    out.controls = {
      nullAblation_mm: r(nullAbl * 1000, 6),
      wideBrush_r40mm: surv(wide),
      tinyBrush_r1mm: surv(tiny),
    };
  }

  // ---- one brush at a time ----------------------------------------------
  const rows = [];
  for (let i = 0; i < expanded.length; i++) {
    const br = expanded[i];
    if (br.p[0] < -1e-9) continue;               // report one side of a mirrored pair
    const without = expanded.filter((_, j) => j !== i
      && !(expanded[j].mirror && expanded[j].p[0] === -br.p[0] && expanded[j].p[1] === br.p[1]
           && expanded[j].p[2] === br.p[2] && expanded[j].amt === br.amt));
    const ev = makeEval(look, without);
    const mm = maxDisp(gridPts(ev, SU, SV), meshAll);
    const ff = maxDisp(gridPts(ev, SU * F, SV * F), fineAll);
    // how many shipped vertices sit inside the brush's support at weight > 0.5
    let inSupport = 0;
    for (let k = 0; k < meshAll.length; k += 3) {
      const dx = (meshAll[k] - br.p[0]) / br.r[0];
      const dy = (meshAll[k + 1] - br.p[1]) / br.r[1];
      const dz = (meshAll[k + 2] - br.p[2]) / br.r[2];
      const d = Math.hypot(dx, dy, dz);
      if (d < 1 && 0.5 * (1 + Math.cos(d * Math.PI)) > 0.5) inSupport++;
    }
    rows.push({
      p: br.p.map((v) => r(v, 4)), r_mm: br.r.map((v) => r(v * 1000, 1)),
      amt_mm: r(br.amt * 1000, 2),
      fine_mm: r(ff * 1000, 2), mesh_mm: r(mm * 1000, 2),
      survival: r(ff > 1e-9 ? mm / ff : 0, 3),
      vertsInSupport: inSupport,
    });
  }
  rows.sort((a, b) => a.vertsInSupport - b.vertsInSupport || a.survival - b.survival);
  // how many shipped vertices land on the front of the face at all
  let faceVerts = 0;
  for (let k = 0; k < meshAll.length; k += 3) {
    if (meshAll[k + 2] > 0.045 && meshAll[k + 1] > -0.115 && meshAll[k + 1] < 0.03
      && Math.abs(meshAll[k]) < 0.062) faceVerts++;
  }
  out.chars[key] = {
    brushes: rows.length,
    starved: rows.filter((q) => q.vertsInSupport < 4).length,
    faceFrontVerts: faceVerts,
    rows,
  };
}

// Compact table — this report is meant to be read whole.
const L = [];
L.push(`grid  segU=${out.grid.segU} segV=${out.grid.segV}  headVerts=${out.grid.headVerts}`);
L.push(`      row spacing mm  brow ${out.grid.rowSpacing_mm.brow}  eye ${out.grid.rowSpacing_mm.eye}  nose ${out.grid.rowSpacing_mm.nose}  mouth ${out.grid.rowSpacing_mm.mouth}  chin ${out.grid.rowSpacing_mm.chin}`);
L.push(`      col spacing mm  eye ${out.grid.colSpacing_mm.eye}  mouth ${out.grid.colSpacing_mm.mouth}`);
L.push(`      row dy mm       eye ${out.grid.rowDy_mm.eye}  mouth ${out.grid.rowDy_mm.mouth}`);
L.push(`controls  null=${out.controls.nullAblation_mm}mm  wide(r40mm) surv=${out.controls.wideBrush_r40mm.survival}  tiny(r1mm) surv=${out.controls.tinyBrush_r1mm.survival}`);
for (const [k, c] of Object.entries(out.chars)) {
  L.push('');
  L.push(`${k}: ${c.brushes} brushes, ${c.starved} with <4 verts in support; face-front verts ${c.faceFrontVerts}`);
  L.push('  verts  surv   fine   mesh   amt    r(mm)                 p');
  for (const q of c.rows) {
    L.push(`  ${String(q.vertsInSupport).padStart(5)}  ${String(q.survival).padEnd(5)}  ${String(q.fine_mm).padStart(5)}  ${String(q.mesh_mm).padStart(5)}  ${String(q.amt_mm).padStart(6)}  ${q.r_mm.join(',').padEnd(20)}  ${q.p.join(',')}`);
  }
}
return L.join('\n');

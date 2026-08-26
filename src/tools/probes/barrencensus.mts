// How much stuff is there, per distance ring from the camera?
//
// The human's report is that the world "feels barren and empty", and the
// vista frames agree: past the near field the ground is naked. Every scatter
// layer here streams in a disc around the *camera*, so what a standing shot
// sees and what an elevated vista sees are very different worlds. This counts
// visible instances by ground distance so the falloff is a number rather than
// an impression.
//
// Instance transforms are read out of each InstancedMesh's matrix array, so a
// mesh with 6725 instances contributes 6725 samples, not one.
//
// Run: node src/tools/probe.mts src/tools/probes/barrencensus.mts
const g = window.GAME;
const list = (window.__BARREN_SHOTS || 'zone_longwythe,zone_three_valleys,hud_field,vista_dawn')
  .split(',');

const RINGS = [0, 25, 50, 100, 200, 400, 800, 1600, 1e9];
const ringName = (i) => (RINGS[i + 1] >= 1e9 ? `${RINGS[i]}m+` : `${RINGS[i]}-${RINGS[i + 1]}m`);

function ringOf(d) {
  for (let i = 0; i < RINGS.length - 1; i++) if (d >= RINGS[i] && d < RINGS[i + 1]) return i;
  return RINGS.length - 2;
}

const out = [];
for (const shot of list) {
  g.applyShot(shot);
  g.settle(70);
  g.applyShot(shot);
  g.settle(6);
  g.scene.updateMatrixWorld(true);
  const cam = g.camera;
  cam.updateMatrixWorld(true);
  const cp = cam.getWorldPosition(new (cam.position.constructor)());

  // by ring: total instances, and a split by coarse family
  const rings = RINGS.slice(0, -1).map(() => ({ all: 0, grass: 0, scrub: 0, tree: 0, rock: 0, other: 0 }));
  const fam = (name) => {
    const n = (name || '').toLowerCase();
    if (n.includes('grass') || n.includes('sward')) return 'grass';
    if (n.includes('scrub') || n.includes('bush')) return 'scrub';
    if (n.includes('tree') || n.includes('canopy') || n.includes('leaf') || n.includes('trunk')) return 'tree';
    if (n.includes('rock') || n.includes('boulder') || n.includes('outcrop') || n.includes('stone') || n.includes('rubble')) return 'rock';
    return 'other';
  };

  const _p = new (cam.position.constructor)();
  g.scene.traverseVisible((o) => {
    if (!o.isMesh) return;
    // family tag from the mesh and its named ancestry
    let tag = o.name || '';
    let p = o;
    while (p.parent && p.parent !== g.scene) { p = p.parent; if (p.name) tag = p.name + '/' + tag; }
    const f = fam(tag);
    if (o.isInstancedMesh) {
      const n = o.count | 0;
      const arr = o.instanceMatrix.array;
      const m = o.matrixWorld.elements;
      for (let i = 0; i < n; i++) {
        // instance translation, then the mesh's own world transform
        const x = arr[i * 16 + 12], y = arr[i * 16 + 13], z = arr[i * 16 + 14];
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        const d = Math.hypot(wx - cp.x, wz - cp.z);
        const r = rings[ringOf(d)];
        r.all++; r[f]++;
      }
    } else {
      o.getWorldPosition(_p);
      const d = Math.hypot(_p.x - cp.x, _p.z - cp.z);
      const r = rings[ringOf(d)];
      r.all++; r[f]++;
    }
  });

  const lines = [`=== ${shot}   cam y=${cp.y.toFixed(0)}m`];
  lines.push('  ring          all    grass    scrub     tree     rock    other      per hectare');
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    if (!r.all) continue;
    const inner = RINGS[i], outer = Math.min(RINGS[i + 1], 3000);
    const areaHa = Math.PI * (outer * outer - inner * inner) / 10000;
    const nonGrass = r.all - r.grass;
    lines.push(`  ${ringName(i).padEnd(10)} ${String(r.all).padStart(8)} ${String(r.grass).padStart(8)} `
      + `${String(r.scrub).padStart(8)} ${String(r.tree).padStart(8)} ${String(r.rock).padStart(8)} `
      + `${String(r.other).padStart(8)}   ${(nonGrass / areaHa).toFixed(1)} non-grass/ha`);
  }
  out.push(lines.join('\n'));
}
return out.join('\n\n');

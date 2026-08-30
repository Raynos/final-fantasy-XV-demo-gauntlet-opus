// Is the white radial splat in a fight frame `GroundFX`, and which call?
//
// Lane 11's look-loop at `b24d958` reported "a large white radial ground splat
// blows out the centre of f-midfight and f-kill and smears across the terrain
// to the right", observed and never diagnosed. `BRIEF.md` says ablate before
// re-tinting, so this fires the ground rings **one at a time on a still, posed
// frame** — same camera, same sun, same TAA history — against a clean plate.
//
//   node src/tools/probe.mts src/tools/probes/groundbloom.mts \
//        --shot tmp/shots/bloom/g.jpg
//
// The four arms are the four `GroundFX.ring` calls a fight actually makes,
// with the arguments their call sites pass. Three of the four pass no
// `intensity` and no `opacity` at all, so they take `ring()`'s defaults —
// intensity **3.2**, opacity **1.0** — which is the hottest configuration in
// the file, on the most frequent events in a fight.
const g = window.GAME;
const dt = 1 / 60;
const player = g.get('Player');
const vfx = g.get('VFX');
const terrain = g.get('Terrain');
const step = (n) => { for (let i = 0; i < n; i++) g.frame(dt); };

g.applyShot('hud_field');
g.get('Director')?.play?.();
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus')?.setScreen?.(null);
g.settle(40);

const pos = player.position.clone();
const report = { pos: [+pos.x.toFixed(1), +pos.y.toFixed(1), +pos.z.toFixed(1)], arms: [] };

// Peak of a ring's life: `GroundFX.update` fades opacity as (1-n)^1.5 and
// expands as 1-(1-n)^2.6, so the widest *bright* moment is early — n ~ 0.22.
const PEAK = 8;

async function arm(name, fire) {
  vfx.ground.clear();
  g.settle(6);
  if (fire) { fire(); step(PEAK); }
  await window.__shot(name);
  report.arms.push(name);
}

await arm('a-clean', null);
// CombatSystem:1179 — the stagger ring.
await arm('b-stagger', () => vfx.ground.ring({
  pos, terrain, radius: 2.4, color: 0xffc888, life: 0.7,
}));
// CombatSystem:1237 — the warp-strike landing ring. Pale blue-white already.
await arm('c-warpland', () => vfx.ground.ring({
  pos, terrain, radius: 3.2, color: 0xbfe8ff, life: 0.6,
}));
// CombatSystem:879 — the phase/parry ring.
await arm('d-parry', () => vfx.ground.ring({
  pos, terrain, radius: 4, color: 0x8ed4ff, life: 0.9,
}));
// The same warp landing with the two numbers the call site never passed.
await arm('e-warpland-tuned', () => vfx.ground.ring({
  pos, terrain, radius: 3.2, color: 0xbfe8ff, life: 0.6,
  intensity: 1.35, opacity: 0.6,
}));
vfx.ground.clear();
g.settle(6);

return report;

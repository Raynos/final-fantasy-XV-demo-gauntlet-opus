/*
 * What does a framing inside Lestallum or Galdin Quay cost, and how much of it
 * is people?
 *
 * `npcdraws.mts` answers this for one shot named in `Shots.ts`, and the city
 * shots do not exist yet -- `Shots.ts` has one owner at a time and the fourteen
 * city framings are a later lane's. So this borrows `framecam`'s trick (inject
 * a shot object into the live `SHOTS` map under `__probe`) and `npcdraws`'
 * instrument (wrap `renderer.renderBufferDirect`, the only thing that sees the
 * shadow cascades and the velocity pass as well as the colour pass), and runs
 * both together over a list of framings this lane authored.
 *
 * The pose reproduces `shoot.mts`: settle(60), re-apply, settle(8), with the
 * wrapper installed for the LAST of those eight steps, because the cascade
 * refresh is on a rotating schedule and the number only means anything on the
 * phase a capture lands on.
 *
 * Budgets it is measured against (plan Part D, lane 19): <= 60 colour draws of
 * people per city, <= 12 bodies in an authored framing, <= 800 draws overall.
 */
const g = window.GAME;
const { SHOTS } = await import('/game/Shots.ts');
const out = [];

const FRAMINGS = [
  { name: 'lest_market_day', pos: [-2966, 122.6, -706], target: [-2957, 121.9, -697], fov: 44, time: 10.5 },
  { name: 'lest_market_dusk', pos: [-2966, 122.6, -706], target: [-2957, 121.9, -697], fov: 44, time: 19.0 },
  { name: 'lest_festoon_night', pos: [-2964, 122.4, -704], target: [-2956, 122.6, -696], fov: 50, time: 21.5 },
  { name: 'lest_crowd', pos: [-2971, 124.0, -710], target: [-2958, 121.9, -698], fov: 38, time: 12.0 },
  { name: 'galdin_pier_sunset', pos: [2322, 15.6, 2373], target: [2332, 14.6, 2382], fov: 44, time: 18.1 },
  { name: 'galdin_square_day', pos: [2320, 16.4, 2371], target: [2332, 14.6, 2382], fov: 40, time: 11.0 },
  { name: 'galdin_festoon_night', pos: [2324, 15.4, 2375], target: [2333, 15.2, 2383], fov: 50, time: 21.5 },
];

const npcRoot = g.scene.getObjectByName('npcs');

for (const f of FRAMINGS) {
  SHOTS.__probe = { ...f, weather: 'clear', hud: false };
  g.applyShot('__probe');
  g.settle(60);
  g.applyShot('__probe');
  g.settle(7);

  // Recomputed per framing: the city bodies are streamed, so the set grows.
  const npcSet = new Set();
  if (npcRoot) npcRoot.traverse((o) => npcSet.add(o));

  const renderer = g.renderer;
  const orig = renderer.renderBufferDirect.bind(renderer);
  let total = 0, shadow = 0, velocity = 0, npcColour = 0, npcTotal = 0;
  const bodies = new Set();
  renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    total++;
    const isShadow = !!(material && (material.isMeshDepthMaterial || material.isMeshDistanceMaterial));
    const isVel = !isShadow && scene !== g.scene && !!(material && material.isShaderMaterial);
    if (isShadow) shadow++;
    if (isVel) velocity++;
    let isNpc = npcSet.has(object);
    let p = object.parent;
    while (!isNpc && p) { if (npcSet.has(p)) isNpc = true; p = p.parent; }
    if (isNpc) {
      npcTotal++;
      if (!isShadow && !isVel) {
        npcColour++;
        // The body root under `npcs` is the person; count distinct ones so the
        // "<= 12 bodies in a framing" budget has a number and not an opinion.
        let q = object;
        while (q.parent && q.parent !== npcRoot) q = q.parent;
        bodies.add(q);
      }
    }
    return orig(camera, scene, geometry, material, object, group);
  };
  g.settle(1);
  renderer.renderBufferDirect = orig;

  out.push({
    shot: f.name,
    frameCalls: renderer.info.render.calls,
    colour: total - shadow - velocity,
    shadow,
    velocity,
    npcColour,
    npcTotal,
    bodiesDrawn: bodies.size,
    npcsAlive: g.get('Npcs')?.list?.length ?? 0,
  });
}

delete SHOTS.__probe;
return out;

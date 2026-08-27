// Where do a frame's draw calls actually go?
//
// `renderer.info.render.calls` says a frame is over budget and never which
// system spent it, and `traverseVisible` cannot see the shadow cascades or the
// velocity pass's proxy scene -- which are ~40% of a town frame. Wrapping
// `renderBufferDirect` sees every real draw, because that is the function that
// issues them.
//
//   node src/tools/probe.mts src/tools/_probe/drawattrib.mts --dirty
//
// Reports the PEAK frame of eight consecutive held-pose frames, because the
// cascades refresh on a rotating schedule and `drawcheck`'s capture lands on
// the expensive phase (see `drawcheck.mts`'s header).
const g = window.GAME;
const SHOTS = ['town_forecourt'];
const r = g.renderer;
const out = {};

/** Which system owns this object? Nearest named ancestor wins. */
const owner = (o) => {
  let n = o, hops = 0;
  const names = [];
  while (n && hops++ < 8) { if (n.name) names.push(n.name); n = n.parent; }
  const joined = names.join('/');
  const first = names[0] || o.type;
  const rules = [
    [/grass|GrassRing|blade/i, 'veg:grass'],
    [/tree|leaf|trunk|impostor|canopy/i, 'veg:trees'],
    [/bush|shrub|scrub|fern/i, 'veg:bushes'],
    [/terrain|clipmap/i, 'terrain:clipmap'],
    [/hammerhead|town/i, 'town:Hammerhead'],
    [/poi_/i, 'props:PoiKits'],
    [/rock|boulder|spire|scree/i, 'props:Rocks'],
    [/landmark|pylon|ruin|monument/i, 'props:Landmarks'],
    [/roadfurn|guardrail|signpost|milestone|road_|culvert|barrier/i, 'props:RoadFurniture'],
    [/outpost|haven|camp_/i, 'props:Outposts'],
    [/debris|wear|litter/i, 'props:Debris'],
    [/npc/i, 'char:npc'],
    [/noctis|gladio|ignis|prompto|party|hero|hair|head|body|outfit/i, 'char:party'],
    [/regalia|car|vehicle/i, 'vehicle'],
    [/sky|cloud|star|moon|sun/i, 'sky'],
    [/water|river|shore/i, 'water'],
  ];
  for (const [re, label] of rules) if (re.test(joined)) return label;
  return `?:${first}`;
};

for (const SHOT of SHOTS) {
  g.resetClock(); g.applyShot(SHOT); g.settle(60); g.applyShot(SHOT); g.settle(8);
  const frames = [];
  const orig = r.renderBufferDirect.bind(r);
  let tally = null;
  r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (tally) {
      const depth = !!(material && (material.isMeshDepthMaterial || material.isMeshDistanceMaterial));
      const pass = depth ? 'shadow' : (camera === g.camera ? 'colour' : 'other');
      const k = `${owner(object)}`;
      if (/^props:|^town:/.test(k)) {
        const dk = `${k} :: ${object.name || object.type} ${depth ? '[shadow]' : ''}`;
        tally.__detail[dk] = (tally.__detail[dk] || 0) + 1;
      }
      const e = tally[k] || (tally[k] = { total: 0, colour: 0, shadow: 0, other: 0 });
      e.total++; e[pass]++;
      tally.__total.total++; tally.__total[pass]++;
    }
    return orig(camera, scene, geometry, material, object, group);
  };
  for (let i = 0; i < 8; i++) {
    tally = { __total: { total: 0, colour: 0, shadow: 0, other: 0 }, __detail: {} };
    g.frame(1 / 60);
    frames.push(tally);
  }
  tally = null;
  r.renderBufferDirect = orig;
  const peak = frames.reduce((a, b) => (b.__total.total > a.__total.total ? b : a));
  const rows = Object.entries(peak).filter(([k]) => k !== '__total' && k !== '__detail')
    .sort((a, b) => b[1].total - a[1].total).slice(0, 28)
    .map(([k, v]) => `${String(v.total).padStart(4)}  c${String(v.colour).padStart(3)} s${String(v.shadow).padStart(3)} o${String(v.other).padStart(3)}  ${k}`);
  out[SHOT] = {
    perFrame: frames.map((f) => f.__total.total),
    peak: peak.__total,
    rows,
    detail: Object.entries(peak.__detail).sort((a, b) => b[1] - a[1]).slice(0, 70)
      .map(([k, v]) => `${String(v).padStart(4)}  ${k}`),
  };
}
return out;

// geometry-bake: how much geometry do the bake candidates actually make, and
// how big would the artifact be?
//
// Counts every BufferGeometry reachable from the four candidate subtrees, its
// attributes, their byte sizes and their types. The artifact size is the whole
// question: a cache that costs more to inflate than the generator costs to run
// is not a cache.
//
//   node src/tools/probe.mts src/tools/probes/geofootprint.mts --dirty
const g = window.GAME;
const props = g.get('Props');
const water = g.get('Water');
const veg = g.get('Vegetation');

const seen = new Set();
const scan = (root) => {
  const out = { geos: 0, verts: 0, tris: 0, bytes: 0, attrs: {}, meshes: 0, insts: 0 };
  if (!root) return out;
  root.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh && !o.isLineSegments && !o.isPoints) return;
    out.meshes++;
    if (o.isInstancedMesh) out.insts++;
    const geo = o.geometry;
    if (!geo || seen.has(geo)) return;
    seen.add(geo);
    out.geos++;
    const pos = geo.attributes.position;
    if (pos) out.verts += pos.count;
    if (geo.index) out.tris += geo.index.count / 3;
    else if (pos) out.tris += pos.count / 3;
    for (const [name, a] of Object.entries(geo.attributes)) {
      const b = a.array.byteLength;
      out.bytes += b;
      const k = `${name}:${a.array.constructor.name}:${a.itemSize}${a.normalized ? ':n' : ''}`;
      out.attrs[k] = (out.attrs[k] || 0) + b;
    }
    if (geo.index) {
      out.bytes += geo.index.array.byteLength;
      const k = `index:${geo.index.array.constructor.name}`;
      out.attrs[k] = (out.attrs[k] || 0) + geo.index.array.byteLength;
    }
  });
  return out;
};

const roots = {
  poiKits: props && props.poiKits && props.poiKits.root,
  mega: props && props.mega && (props.mega.root || props.mega.group),
  rocks: props && props.rocks && (props.rocks.root || props.rocks.group),
  landmarks: props && props.landmarks && (props.landmarks.root || props.landmarks.group),
  shore: water && (water.shoreRibbon || water.shore),
  bushes: veg && veg.bushes && (veg.bushes.root || veg.bushes.group),
};
const out = {};
for (const [k, r] of Object.entries(roots)) {
  out[k] = r ? scan(r) : 'MISSING';
}
// what the whole scene holds, for scale
out._scene = scan(g.scene);

// name of the roots we could not find, so the probe cannot silently measure nothing
out._keys = {
  props: props ? Object.keys(props) : null,
  water: water ? Object.keys(water).filter((k) => /shore|river|surf/i.test(k)) : null,
  mega: props && props.mega ? Object.keys(props.mega) : null,
  rocks: props && props.rocks ? Object.keys(props.rocks) : null,
};
return out;

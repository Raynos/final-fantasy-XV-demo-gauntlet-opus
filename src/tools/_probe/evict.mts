// Does the demo's POI-kit eviction free, and does the site come back?
//
// Two failure modes, and only the second is obvious. A kit that is dropped but
// never rebuilt is a hole in the world; a kit that is "evicted" while its
// geometry stays reachable is a lie that shows up as a dead tab an hour later.
// This probe checks both ends: the built count falls, the geometry refcount
// falls with it, and driving back rebuilds.
const g = window.GAME;
const kits = g.get('Props').poiKits;
const cam = g.camera;
const _v = new (Object.getPrototypeOf(cam.position).constructor)();

const step = (x, z, frames) => {
  for (let i = 0; i < frames; i++) {
    cam.position.set(x, 60, z);
    cam.updateMatrixWorld(true);
    kits.update(1 / 60, g.time.now, 0, cam.position, g);
  }
};

// Settle at the origin: everything inside BUILD_R builds, one per frame.
step(0, 0, 200);
const near = { built: kits.built.length, geos: kits._geoRefs.size, evict: kits._evict };
const ids = kits.built.map((b) => b.poi.id).slice(0, 4);

// Now stand 6 km away. Everything at the origin is well past EVICT_R.
step(6000, 6000, 400);
const far = { built: kits.built.length, geos: kits._geoRefs.size };
const stillHome = kits.built.filter((b) => Math.hypot(b.poi.x, b.poi.z) < 1500).length;

// And drive home again.
step(0, 0, 400);
const back = { built: kits.built.length, geos: kits._geoRefs.size };
const rebuilt = ids.filter((id) => kits.built.some((b) => b.poi.id === id)).length;

return {
  near, far, back,
  homeSitesStillBuiltFromFarAway: stillHome,
  sampledIds: ids.length,
  rebuiltOnReturn: rebuilt,
  freed: near.geos > 0 && far.geos < near.geos,
};

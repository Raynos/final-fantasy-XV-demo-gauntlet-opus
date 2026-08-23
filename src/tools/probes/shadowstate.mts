const g = window.GAME;
g.applyShot('zone_fallgrove');
g.settle(60);
g.applyShot('zone_fallgrove');
g.settle(8);

const r = g.renderer;
const out = {};
out.renderer = {
  shadowMapEnabled: r.shadowMap.enabled,
  shadowMapType: r.shadowMap.type,
  autoUpdate: r.shadowMap.autoUpdate,
  needsUpdate: r.shadowMap.needsUpdate,
};

const lights = [];
g.scene.traverse((o) => {
  if (!o.isLight) return;
  const e = { name: o.name, type: o.type, visible: o.visible, intensity: o.intensity, castShadow: o.castShadow };
  if (o.position) e.pos = [+o.position.x.toFixed(1), +o.position.y.toFixed(1), +o.position.z.toFixed(1)];
  if (o.target && o.target.position) e.target = [+o.target.position.x.toFixed(1), +o.target.position.y.toFixed(1), +o.target.position.z.toFixed(1)];
  if (o.shadow) {
    const c = o.shadow.camera;
    e.shadow = {
      mapSize: [o.shadow.mapSize.x, o.shadow.mapSize.y],
      bias: o.shadow.bias, normalBias: o.shadow.normalBias, radius: o.shadow.radius,
      cam: { left: c.left, right: c.right, top: c.top, bottom: c.bottom, near: c.near, far: c.far },
      mapAllocated: !!o.shadow.map,
      mapDims: o.shadow.map ? [o.shadow.map.width, o.shadow.map.height] : null,
      autoUpdate: o.shadow.autoUpdate, needsUpdate: o.shadow.needsUpdate,
      intensity: o.shadow.intensity,
    };
  }
  lights.push(e);
});
out.lights = lights;
out.cam = { pos: [+g.camera.position.x.toFixed(1), +g.camera.position.y.toFixed(1), +g.camera.position.z.toFixed(1)], far: g.camera.far, near: g.camera.near };

let casters = 0, receivers = 0, meshes = 0;
const casterNames = {};
g.scene.traverse((o) => {
  if (!o.isMesh && !o.isInstancedMesh && !o.isPoints) return;
  meshes++;
  if (o.castShadow) { casters++; const k = o.name || o.type; casterNames[k] = (casterNames[k] || 0) + 1; }
  if (o.receiveShadow) receivers++;
});
out.census = { meshes, casters, receivers };
out.casterNames = casterNames;
return out;

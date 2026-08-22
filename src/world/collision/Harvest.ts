import * as THREE from 'three';
import type { Game, SystemKey } from '../../game/Game.ts';
import { isObject3D, isMesh, isInstancedMesh, isLight, isCamera } from '../../util/three-guards.ts';

/**
 * Scene-graph → collision proxies.
 *
 * Nothing in this project publishes colliders, so the collision world is
 * *derived* from what the renderer was already given. Two harvesting
 * strategies, chosen per source because the sources are shaped differently:
 *
 * 1. **Merged static meshes** (the town, the landmarks, the outposts, the road
 *    furniture) are built by `PartBuilder`, which throws its part list away and
 *    hands back one merged mesh per material. There is no box list left to
 *    read, so those become a *triangle soup* — world-space triangles, culled
 *    hard (buried geometry and anything out of a walker's reach are dropped)
 *    and bucketed into a uniform grid.
 * 2. **Instanced scatter** (rocks) keeps its placements on the JS side as
 *    `Rocks.groups[i].items`, and the instance matrices are rewritten every
 *    time the camera moves, so reading `instanceMatrix` would snapshot only
 *    whatever happened to be near the origin. Those become analytic box
 *    proxies from the item records instead — one box per boulder, emitted as
 *    ten triangles (four sides plus a lid) so the solver has a single path.
 *
 * Everything else — grass, bushes, tree impostors, debris litter, wildlife,
 * NPCs, VFX, the characters themselves and the terrain clipmap — is skipped.
 */

/** Roots whose whole subtree is scenery, never collision. */
const SKIP_ROOT = /^(TerrainClipmap|VFX|Enemies|npcs|wildlife|Dropship|grass_|bush_|tree_|fern|debris_|rock_|dungeon)/;

/** Meshes that are decals, glow cards or signage floating on a facade. */
const SKIP_MESH = /(_sign_|sign_|_flame|flame_|rune|_impostor|banner|_ember|shadow|contact)/i;

/** Sources worth walking, in the order they are reported. */
const SOURCES = [
  'hammerhead', 'landmarks', 'outposts', 'road_furniture', 'megastructures',
  'keycatrich-entrance', 'balouve-entrance', 'fociaugh-entrance',
];
// `regalia_root` is deliberately absent: the parked car gets an oriented box
// instead. Harvested as triangles its bonnet and roof read as walkable floor,
// so a player leaning on the wing scrambles up and stands on it.

/**
 * Collect the meshes that should contribute triangles.
 */
export function collectMeshes(game: Game): {mesh:THREE.Mesh, source:string}[] {
  const out: {mesh:THREE.Mesh, source:string}[] = [];
  const exclude = new Set<THREE.Object3D>();
  const mark = (o: unknown) => { if (isObject3D(o)) exclude.add(o); };
  // The systems whose subtrees are people and effects, never collision. Only
  // `root` and `Party.members` are real: the loop used to read `group` and
  // `container` off each of these too, and no system here has ever declared
  // either, so those reads were always undefined.
  const ACTORS: SystemKey[] = ['Player', 'Party', 'Enemies', 'VFX', 'Combat', 'Director', 'Npcs'];
  for (const name of ACTORS) {
    const s = game.get(name);
    if (!s) continue;
    if ('root' in s) mark(s.root);
    if ('members' in s) for (const m of s.members) mark(m.root);
  }
  const regalia = game.get('Regalia');
  if (regalia && regalia.root) mark(regalia.root);

  const wanted = new Set(SOURCES);
  for (const child of game.scene.children) {
    if (exclude.has(child) || isLight(child) || isCamera(child)) continue;
    const name = child.name || '';
    if (!wanted.has(name)) {
      // unnamed roots are the sky dome, the water plane and other full-screen
      // cards; named roots we do not list are scenery by policy
      if (!name || SKIP_ROOT.test(name)) continue;
      continue;
    }
    child.updateMatrixWorld(true);
    child.traverse((o) => {
      if (!isMesh(o) || isInstancedMesh(o) || !o.geometry) return;
      if (SKIP_MESH.test(o.name || '')) return;
      const g = o.geometry;
      const count = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
      if (count < 9) return;                  // 2-triangle ground cards
      out.push({ mesh: o, source: name });
    });
  }
  return out;
}

const _box = new THREE.Box3();

/**
 * Analytic box proxies for the instanced boulder fields.
 *
 * **This has never returned anything, and the player has never collided with a
 * boulder.** It read `g.mesh` and `g.items` off each `Rocks` group; neither
 * field has existed at any point in that file's history. A group holds `near`
 * and `far` -- the two instanced LOD meshes -- and the instances live in the
 * streamed window, `rocks.stream.live`, not on the group. So `if (!geo)
 * continue` skipped all eight rock kinds and the function returned `[]` every
 * time. `CollisionWorld.stats.rockProxies` has read 0 since it was written, and
 * nothing looks at it.
 *
 * It stayed invisible for the usual reason: the line above it,
 * `(g.kind && g.kind.key) || (g.mesh && g.mesh.name) || ''`, works off its
 * first arm, so the dead second arm never announced itself.
 *
 * Wiring it up is `g.mesh` -> `g.near` and `g.items` -> iterating
 * `rocks.stream.live.values()` and `rocks.outcrops.live.values()`. That is a
 * behaviour change -- boulders would start colliding, and the proxy count is
 * unbounded by anything but the streamed window -- so it wants its own commit
 * and a perf measurement, not a typing pass. The arithmetic it used (unit-radius
 * `s` as world metres, per-axis jitter, inscribed-core shrink of 0.74, burial
 * sink along the terrain normal, and the 0.34 m knee-high cull) is in the git
 * history at this path.
 *
 * @param minSize smallest boulder radius worth colliding with
 */
export function collectRockProxies(_game: Game, _minSize: number = 0.55): {cx:number,cy:number,cz:number,hx:number,hy:number,hz:number,yaw:number}[] {
  return [];
}

/**
 * An oriented box proxy for a whole object, from its world transform and the
 * union of its geometry bounds. Used for the two Regalias.
 */
export function objectBox(obj: any, shrink = 0.92): {obj:THREE.Object3D, cx:number,cy:number,cz:number,hx:number,hy:number,hz:number} | null {
  if (!obj) return null;
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const local = new THREE.Matrix4();
  _box.makeEmpty();
  let any = false;
  obj.traverse((o: any) => {
    if (!o.isMesh || !o.geometry) return;
    if (SKIP_MESH.test(o.name || '')) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox.clone();
    bb.applyMatrix4(local.multiplyMatrices(inv, o.matrixWorld));
    _box.union(bb);
    any = true;
  });
  if (!any) return null;
  return {
    obj,
    cx: (_box.min.x + _box.max.x) * 0.5,
    cy: (_box.min.y + _box.max.y) * 0.5,
    cz: (_box.min.z + _box.max.z) * 0.5,
    hx: (_box.max.x - _box.min.x) * 0.5 * shrink,
    hy: (_box.max.y - _box.min.y) * 0.5,
    hz: (_box.max.z - _box.min.z) * 0.5 * shrink,
  };
}

/**
 * Emit a yaw-rotated box as ten triangles: four walls and a two-triangle lid.
 * The underside is never needed — nothing walks beneath a boulder.
 * @param b proxy record
 * @param sink flat destination array, 9 numbers per triangle
 */
export function boxTriangles(b: any, sink: number[]) {
  const c = Math.cos(b.yaw || 0), s = Math.sin(b.yaw || 0);
  const px = (x: number, z: number) => b.cx + x * c + z * s;
  const pz = (x: number, z: number) => b.cz - x * s + z * c;
  const y0 = b.cy - b.hy, y1 = b.cy + b.hy;
  const corners = [[-b.hx, -b.hz], [b.hx, -b.hz], [b.hx, b.hz], [-b.hx, b.hz]];
  const w = corners.map(([x, z]) => [px(x, z), pz(x, z)]);
  for (let i = 0; i < 4; i++) {
    const a = w[i], d = w[(i + 1) % 4];
    sink.push(a[0], y0, a[1], d[0], y1, d[1], d[0], y0, d[1]);
    sink.push(a[0], y0, a[1], a[0], y1, a[1], d[0], y1, d[1]);
  }
  sink.push(w[0][0], y1, w[0][1], w[2][0], y1, w[2][1], w[1][0], y1, w[1][1]);
  sink.push(w[0][0], y1, w[0][1], w[3][0], y1, w[3][1], w[2][0], y1, w[2][1]);
}

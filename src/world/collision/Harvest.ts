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
 * 2. **Instanced scatter** (rocks) is **not harvested here at all**, and the
 *    attempt to is gone. `collectRockProxies` read `g.mesh` and `g.items` off
 *    each `Rocks` group; neither field has existed at any point in that file's
 *    history, so it returned `[]` every time it was called and
 *    `CollisionWorld.stats.rockProxies` read 0 for its whole life — which is
 *    why a character could stand inside a boulder, and why the playtest's
 *    number-one complaint was a fight held inside one. The real reason it could
 *    never live here is that this harvest runs **once**, off the first few
 *    frames, and rocks **stream** for the whole session. They are answered per
 *    stream cell by `RockField` instead, which `CollisionWorld` queries from
 *    `_resolvePass`.
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
 * A yaw-rotated box standing in for a whole object: centre, half-extents and
 * (for a boulder proxy) the yaw it is turned by.
 */
export interface BoxProxy {
  /** The object this stands for, when it came from one. */
  obj?: THREE.Object3D;
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
  /** Rotation about +Y, radians. Absent means axis-aligned. */
  yaw?: number;
}

/**
 * An oriented box proxy for a whole object, from its world transform and the
 * union of its geometry bounds. Used for the two Regalias.
 */
export function objectBox(obj: THREE.Object3D | null | undefined, shrink = 0.92): BoxProxy | null {
  if (!obj) return null;
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const local = new THREE.Matrix4();
  _box.makeEmpty();
  let found = false;
  obj.traverse((o) => {
    if (!isMesh(o) || !o.geometry) return;
    if (SKIP_MESH.test(o.name || '')) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    // `computeBoundingBox` always leaves one behind, empty at worst
    const bb = (o.geometry.boundingBox ?? new THREE.Box3()).clone();
    bb.applyMatrix4(local.multiplyMatrices(inv, o.matrixWorld));
    _box.union(bb);
    found = true;
  });
  if (!found) return null;
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

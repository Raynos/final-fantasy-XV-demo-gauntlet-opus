import * as THREE from 'three';
import { InteriorMerger } from './Build.ts';
import { Layout } from './Layout.ts';
import { ShellBuilder, cutDoorways } from './Shell.ts';
import { LightRig } from './LightRig.ts';
import { PropKit } from './InteriorProps.ts';
import { buildExitVestibule } from './Portal.ts';
import { DungeonMap } from './DungeonMap.ts';

/**
 * One built dungeon interior.
 *
 * A *definition* (see `Keycatrich.js` and friends) is pure data plus two
 * authoring hooks — `author(layout)` writes the room graph, `dress(kit, ...)`
 * hangs the props and the lights on it. This class runs the common pipeline
 * over that: cut the doorways, grow the shell, dress it, wire the chests and
 * doors up as interactables, and merge the lot into a handful of draw calls.
 *
 * Nothing here exists until the party walks through the entrance, and
 * `dispose()` gives all of it back.
 */
export class Dungeon {
  built!: boolean;
  def!: any;
  discovered!: Set<any>;
  game!: any;
  group!: THREE.Group;
  id!: any;
  interactables!: any;
  keys!: Set<any>;
  kit!: any;
  layout!: any;
  map!: DungeonMap;
  name!: any;
  origin!: THREE.Vector3;
  rig!: any;
  stats!: any;
  vestibule!: any;
  /**
   * @param def dungeon definition
   */
  constructor(def: any, game: import('../../../game/Game.ts').Game) {
    this.def = def;
    this.game = game;
    this.id = def.id;
    this.name = def.name;
    this.built = false;
    this.group = new THREE.Group();
    this.group.name = `dungeon-${def.id}`;
    this.group.visible = false;
    /** Local -> world offset. Interiors are authored around their own origin. */
    this.origin = new THREE.Vector3(def.origin[0], def.origin[1], def.origin[2]);
    this.stats = { tris: 0, calls: 0, buildMs: 0, lights: 0 };
    this.keys = new Set();
    this.discovered = new Set();
  }

  /** Build the whole interior. Synchronous; a few tens of milliseconds. */
  build() {
    if (this.built) return this;
    const t0 = performance.now();
    const def = this.def;

    const layout = new Layout(def.id, {
      name: def.name, style: def.style,
      corridorWidth: def.corridorWidth, corridorHeight: def.corridorHeight,
    });
    def.author(layout);
    cutDoorways(layout);
    this.layout = layout;

    const rig = new LightRig(def.lighting || {});
    this.rig = rig;
    this.group.add(rig.group);

    const merger = new InteriorMerger();
    const shell = new ShellBuilder(layout, {
      seed: def.seed || 4242,
      wallMat: def.wallMat, floorMat: def.floorMat, ceilMat: def.ceilMat,
    });
    shell.build(merger);

    const loose = new THREE.Group();
    loose.name = 'dungeon-loose';
    this.group.add(loose);

    const kit = new PropKit({ merger, rig, layout, group: loose, seed: (def.seed || 4242) ^ 0x77 });
    this.kit = kit;

    // author-declared lights and props first, then the dungeon's own dressing
    for (const l of layout.lamps) this._lamp(kit, l);
    for (const p of layout.props) kit.place(p.kind, p);
    if (def.dress) def.dress(kit, layout, rig, this);
    for (const c of layout.chests) kit.chest(c);
    for (const d of layout.doors) kit.door(d);

    // the way back out
    const ex = def.exit;
    if (ex) {
      this.vestibule = buildExitVestibule(loose, rig, {
        x: ex.at[0], y: layout.floorAt(ex.at[0], ex.at[1]) || 0, z: ex.at[1],
        facing: ex.facing || 0, w: ex.w || 3.2, h: ex.h || 3.2,
        color: ex.color || 0xcfe2ff, intensity: ex.intensity || 14,
      });
      kit.interactables.push({
        kind: 'exit', id: 'exit', name: `Leave ${this.name}`,
        pos: new THREE.Vector3(ex.at[0], (layout.floorAt(ex.at[0], ex.at[1]) || 0) + 1.2, ex.at[1]),
        radius: 3.4, verb: 'Exit',
      });
    }

    const built = merger.build(this.group, def.id);
    this.stats.tris = built.tris;
    this.stats.calls = built.calls + loose.children.length + 2;
    this.stats.lights = rig.emitters.length;
    rig.finalise();

    this.group.position.copy(this.origin);
    this.interactables = kit.interactables;
    this.map = new DungeonMap(layout, this);
    this.stats.buildMs = Math.round(performance.now() - t0);
    this.built = true;
    return this;
  }

  /** Resolve a layout lamp declaration into fixture geometry plus an emitter. */
  _lamp(kit: any, l: any) {
    const [x, z] = l.at;
    const floor = this.layout.floorAt(x, z);
    const y = l.y != null ? l.y : (floor != null ? floor + 2.6 : 2.6);
    const fn = ({
      emergency: 'emergencyStrip', dead: 'deadStrip', flood: 'floodLight',
      lantern: 'lantern', fungus: 'fungus',
    } as any)[l.kind];
    if (fn && kit[fn]) kit[fn](x, y, z, l);
    else rigOnly(kit.rig, x, y, z, l);
  }

  // --------------------------------------------------------------- runtime

  /** World-space walkable height, or null when the point is outside. */
  floorAt(wx: any, wz: any) {
    const h = this.layout.floorAt(wx - this.origin.x, wz - this.origin.z);
    return h == null ? null : h + this.origin.y;
  }

  /** Push a world-space point back inside the shell. */
  clamp(wx: any, wz: any, margin = 0.6) {
    const p = this.layout.clampInside(wx - this.origin.x, wz - this.origin.z, margin);
    return [p[0] + this.origin.x, p[1] + this.origin.z];
  }

  /** World-space spawn point when entering. */
  spawnPoint() {
    const s = this.def.spawn;
    const y = this.layout.floorAt(s[0], s[1]) || 0;
    return new THREE.Vector3(s[0] + this.origin.x, y + this.origin.y, s[1] + this.origin.z);
  }

  /** Interactables in world space, nearest first. */
  near(worldPos: any, extra = 0) {
    const lx = worldPos.x - this.origin.x, ly = worldPos.y - this.origin.y, lz = worldPos.z - this.origin.z;
    const out = [];
    for (const it of this.interactables) {
      const d = Math.hypot(it.pos.x - lx, (it.pos.y - ly) * 0.6, it.pos.z - lz);
      if (d <= it.radius + extra) out.push({ it, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out.map((o) => o.it);
  }

  update(dt: any, now: any, cameraLocal: any) {
    this.kit.update(dt, now);
    this.rig.update(dt, cameraLocal, now);
    // reveal the map as the party moves through
    const r = this.layout.regionAt(cameraLocal.position.x, cameraLocal.position.z);
    if (r) this.discovered.add(r.id);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.rig.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
    this.built = false;
  }
}

function rigOnly(rig: any, x: any, y: any, z: any, l: any) {
  rig.add({
    pos: [x, y, z], color: l.color, intensity: l.intensity,
    range: l.range, flicker: l.flicker, glow: l.glow,
  });
}

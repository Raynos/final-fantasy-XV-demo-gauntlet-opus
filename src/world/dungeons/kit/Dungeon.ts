import * as THREE from 'three';
import { InteriorMerger } from './Build.ts';
import { Layout } from './Layout.ts';
import { ShellBuilder, cutDoorways } from './Shell.ts';
import { LightRig } from './LightRig.ts';
import { PropKit } from './InteriorProps.ts';
import { buildExitVestibule } from './Portal.ts';
import { DungeonMap } from './DungeonMap.ts';
import type { MergeStats } from './Build.ts';
import type { DungeonStyle, Lamp, LampKind, Point2 } from './Layout.ts';
import type { Interactable, PropPlacer } from './InteriorProps.ts';
import type { LightRigOptions, LocalView } from './LightRig.ts';
import type { MaterialPicker } from './Shell.ts';
import type { Vestibule } from './Portal.ts';
import type { AmbienceDesc } from './Ambience.ts';
import type { Game } from '../../../game/Game.ts';

/**
 * The interior's own weather. `Dungeons._applyInteriorAtmosphere` drives the
 * shared aerial-perspective uniforms from this, which is what makes an interior
 * read as an interior rather than a room with the sun switched off.
 */
export interface DungeonAtmosphere {
  /** Fog colour as linear RGB, 0..1. */
  fog: [number, number, number];
  density: number;
  /** Fog scale height above the dungeon floor, metres. */
  height: number;
  haze: number;
  exposure: number;
  /**
   * **Read by nothing.** `_applyInteriorAtmosphere` blends the `night` and
   * `storm` grades by name, so this records the author's intent and does not
   * reach the post chain.
   */
  grade?: string;
  /** 0..1 toward the `night` grade. Defaults to 0.7. */
  gradeMix?: number;
}

/** Where a dungeon's exterior architecture sits in the world. */
export interface EntranceDef {
  x: number;
  z: number;
  /** Which way the doorway faces, radians. */
  heading: number;
  /** Which piece of architecture `Dungeons.init` builds. */
  kind: 'bunker' | 'mine' | 'cave';
}

/** The way back out, as the author places it inside the interior. */
export interface ExitDef {
  at: Point2;
  facing?: number;
  w?: number;
  h?: number;
  color?: number;
  intensity?: number;
}

/**
 * A dungeon definition: pure data plus the two authoring hooks.
 *
 * `author(layout)` writes the room graph; `dress(kit, ...)` hangs the props and
 * the lights on it. Everything else is declarative, and `Dungeon.build()` runs
 * the same pipeline over all of them.
 */
export interface DungeonDef {
  id: string;
  name: string;
  /** The world region it is in. Shown by the map screen. */
  region: string;
  /** Default shell style; a room may override it. */
  style: DungeonStyle;
  seed?: number;
  corridorWidth?: number;
  corridorHeight?: number;
  entrance: EntranceDef;
  /** Local-to-world offset. Interiors are authored around their own origin. */
  origin: [number, number, number];
  /** Dungeon-local `[x, z]` the party arrives at. */
  spawn: Point2;
  exit?: ExitDef;
  wallMat: MaterialPicker;
  floorMat: MaterialPicker;
  ceilMat: MaterialPicker;
  atmosphere: DungeonAtmosphere;
  lighting?: LightRigOptions;
  ambience?: AmbienceDesc;
  /** Write the room graph. */
  author(L: Layout): void;
  /** Hang props and lights on the built shell. */
  dress?(kit: PropKit, L: Layout, rig: LightRig, dungeon: Dungeon): void;
  /** Anything that has to be positioned against the finished geometry. */
  extras?(dungeon: Dungeon): void;
}

/** What one built interior cost. */
export interface DungeonStats extends MergeStats {
  buildMs: number;
  lights: number;
}

/** The placers a declared lamp can resolve to. */
type LampFixture = 'emergencyStrip' | 'deadStrip' | 'floodLight' | 'lantern' | 'fungus';

/** Which fixture geometry a declared lamp grows. Total over {@link LampKind}. */
const LAMP_FIXTURE: Record<LampKind, LampFixture> = {
  emergency: 'emergencyStrip',
  dead: 'deadStrip',
  flood: 'floodLight',
  lantern: 'lantern',
  fungus: 'fungus',
};

/**
 * One built dungeon interior.
 *
 * A *definition* (see `Keycatrich.ts` and friends) is pure data plus two
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
  def!: DungeonDef;
  /** Ids of the rooms and corridors the party has walked through. */
  discovered!: Set<string>;
  game!: Game;
  group!: THREE.Group;
  id!: string;
  interactables!: Interactable[];
  /** Dungeon-local key items the party is carrying. Unused: `Dungeons` owns the real set. */
  keys!: Set<string>;
  kit!: PropKit;
  layout!: Layout;
  map!: DungeonMap;
  name!: string;
  origin!: THREE.Vector3;
  rig!: LightRig;
  stats!: DungeonStats;
  vestibule!: Vestibule;
  constructor(def: DungeonDef, game: Game) {
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

  /**
   * Resolve a layout lamp declaration into fixture geometry plus an emitter.
   *
   * Unexercised: `Layout.lamp()` has no call sites, so `layout.lamps` is always
   * empty. See `Layout.prop` for the same note.
   *
   * This used to fall back to a bare emitter when the fixture lookup missed.
   * `LampKind` is exactly the five keys of `LAMP_FIXTURE`, so it never did.
   */
  _lamp(kit: PropKit, l: Lamp) {
    const [x, z] = l.at;
    const floor = this.layout.floorAt(x, z);
    const y = l.y != null ? l.y : (floor != null ? floor + 2.6 : 2.6);
    const make: PropPlacer = kit[LAMP_FIXTURE[l.kind]];
    make.call(kit, x, y, z, l);
  }

  // --------------------------------------------------------------- runtime

  /** World-space walkable height, or null when the point is outside. */
  floorAt(wx: number, wz: number) {
    const h = this.layout.floorAt(wx - this.origin.x, wz - this.origin.z);
    return h == null ? null : h + this.origin.y;
  }

  /** Push a world-space point back inside the shell. */
  clamp(wx: number, wz: number, margin = 0.6) {
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
  near(worldPos: THREE.Vector3, extra = 0): Interactable[] {
    const lx = worldPos.x - this.origin.x, ly = worldPos.y - this.origin.y, lz = worldPos.z - this.origin.z;
    const out = [];
    for (const it of this.interactables) {
      const d = Math.hypot(it.pos.x - lx, (it.pos.y - ly) * 0.6, it.pos.z - lz);
      if (d <= it.radius + extra) out.push({ it, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out.map((o) => o.it);
  }

  update(dt: number, now: number, cameraLocal: LocalView) {
    this.kit.update(dt, now);
    this.rig.update(dt, cameraLocal, now);
    // reveal the map as the party moves through
    const r = this.layout.regionAt(cameraLocal.position.x, cameraLocal.position.z);
    if (r) this.discovered.add(r.id);
  }

  dispose() {
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
    });
    this.rig.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
    this.built = false;
  }
}


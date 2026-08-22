import { clamp, smoothstep } from './Build.ts';
import type { PropKind, PropOptions } from './InteriorProps.ts';

/* ------------------------------------------------------------- vocabulary */

/**
 * The three shell styles. Not decoration: the style decides whether a region is
 * built as a box or lofted as a cave, and `Shell.STYLE` is keyed on exactly
 * these three.
 */
export type DungeonStyle = 'bunker' | 'mine' | 'cave';

/** What a room is *for*. The map colours the boss room from this. */
export type RoomKind =
  | 'entry' | 'hall' | 'junction' | 'treasure' | 'boss' | 'shaft' | 'dead-end';

/** What a run between two rooms is. `rail` is a mine drift with track in it. */
export type CorridorKind = 'corridor' | 'rail';

/** A horizontal axis. Ramps run along one; doors face across one. */
export type Axis = 'x' | 'z';

/** Which wall of an axis-aligned room. */
export type WallSide = 'x-' | 'x+' | 'z-' | 'z+';

/** `[x, z]` in dungeon-local metres. Interiors are authored around their origin. */
export type Point2 = [number, number];

/**
 * A corridor waypoint an author writes: `[x, z]`, or `[x, z, y]` to pin the
 * height at that corner. `link()` fills the height in for the plain form, which
 * is why this is a plain array and not a fixed-length tuple.
 */
export type Waypoint = number[];

/** A resolved corridor point, `[x, z, y]`. Every one has a height. */
export type PathPoint = number[];

/** A raised slab inside a room. Floor queries return its top. */
export interface Platform {
  x: number; z: number; w: number; d: number; y: number;
}

/** A sloped walkway between two floor heights, running along one axis. */
export interface Ramp {
  x: number; z: number; w: number; d: number;
  /** Floor height at the low end and the high end. */
  y0: number; y1: number;
  axis: Axis;
}

/**
 * A doorway subtracted from one room wall. `u` runs along the wall from its
 * start corner, `v` up from the room floor. Written by `cutDoorways`.
 */
export interface Opening {
  side: WallSide;
  u0: number; u1: number; v0: number; v1: number;
}

/**
 * The cave-chamber equivalent of an {@link Opening}: a lofted surface has no
 * wall to cut a rectangle out of, so a passage mouth is an angular window and
 * the loft skips the quads inside it.
 */
export interface CaveHole {
  /** Bearing from the chamber centre, radians. */
  theta: number;
  /** Half-width of the window, radians. */
  half: number;
  y0: number; y1: number;
}

/** What a dungeon author writes for a room. */
export interface RoomSpec {
  x: number; z: number; w: number; d: number;
  /** Floor height. Defaults to 0. */
  y?: number;
  /** Floor-to-ceiling height. Defaults to 4.2. */
  h?: number;
  style?: DungeonStyle;
  kind?: RoomKind;
  /** Shown on the map. Unnamed rooms are drawn but not labelled. */
  name?: string;
  platforms?: Platform[];
  ramps?: Ramp[];
}

/** A room, once `Layout.room()` has applied the defaults. */
export interface Room {
  id: string;
  kind: RoomKind;
  name: string | null;
  x: number; z: number; w: number; d: number; y: number; h: number;
  style: DungeonStyle;
  platforms: Platform[];
  ramps: Ramp[];
  /** Filled in by `cutDoorways` for box rooms. */
  openings: Opening[];
  /** Filled in by `cutDoorways` for `cave` rooms only. */
  holes?: CaveHole[];
  /** Discriminant against {@link Corridor}. See {@link isRoom}. */
  isRoom: true;
}

/** What a dungeon author writes for a run between two rooms. */
export interface LinkSpec {
  /** Corners the run must pass through. Diagonal legs are elbowed automatically. */
  via?: Waypoint[];
  /** Which leg of an inserted elbow comes first. Defaults to `'x'`. */
  elbow?: Axis;
  width?: number;
  height?: number;
  style?: DungeonStyle;
  kind?: CorridorKind;
  /** On the critical path. Recorded in `Layout._critical`. */
  critical?: boolean;
}

/** A corridor, once `Layout.link()` has resolved the path and the defaults. */
export interface Corridor {
  /** `"<a>><b>"`. The map reveals a run by this id. */
  id: string;
  a: string;
  b: string;
  path: PathPoint[];
  width: number;
  height: number;
  style: DungeonStyle;
  kind: CorridorKind;
  critical: boolean;
  /** Discriminant against {@link Room}. See {@link isRoom}. */
  isCorridor: true;
}

/** Anywhere the party can stand: a room or a corridor. */
export type Region = Room | Corridor;

/** Narrow a {@link Region}. Rooms and corridors answer floor queries differently. */
export function isRoom(r: Region): r is Room { return 'isRoom' in r; }

/** What a dungeon author writes for a chest. */
export interface ChestSpec {
  at: Point2;
  /** Floor height at `at` when omitted. */
  y?: number;
  /** Item ids. Ids the item table does not know are treated as dungeon keys. */
  items?: string[];
  gil?: number;
  name?: string;
  /** A bigger box. */
  big?: boolean;
  rot?: number;
  /** Imperial plate and a cold glow rather than timber and amber. */
  magitek?: boolean;
}

/** A chest, once `Layout.chest()` has applied the defaults. */
export interface Chest {
  id: string;
  at: Point2;
  y?: number;
  items: string[];
  gil: number;
  name: string;
  big: boolean;
  rot: number;
  /** Flipped by `Dungeons._openChest`, and read back on a later visit. */
  opened: boolean;
  /**
   * **Never set.** `Layout.chest()` builds this record field by field and does
   * not copy `magitek` off the spec, so the four Keycatrich chests authored
   * `magitek: true` have always been built in pit timber with an amber glow.
   * `PropKit.chest` still reads it, and the author intent is real: adding
   * `magitek: !!s.magitek` below is the one-line fix, and it changes what those
   * chests look like, which is why a typing pass has not made it.
   */
  magitek?: boolean;
}

/** What a dungeon author writes for a door. */
export interface DoorSpec {
  at: Point2;
  /** The axis the leaf spans. Defaults to `'z'`. */
  facing?: Axis;
  y?: number;
  w?: number;
  h?: number;
  /** A dungeon-local key item id. Without it in the party's keys the door stays shut. */
  key?: string;
  name?: string;
  kind?: DoorKind;
  /** Starts open. */
  open?: boolean;
}

/**
 * Which leaf and frame the prop kit builds.
 *
 * Only `magitek` is actually implemented: `PropKit.door` branches on it alone,
 * so Fociaugh's `stone` flowstone curtain is built from the same corroded steel
 * and red status lamp as Keycatrich's `blast` door. Authored, never drawn.
 */
export type DoorKind = 'blast' | 'magitek' | 'stone';

/** A door, once `Layout.door()` has applied the defaults. */
export interface Door {
  id: string;
  at: Point2;
  facing: Axis;
  y?: number;
  w: number;
  h: number;
  key: string | null;
  name: string;
  kind: DoorKind;
  /** Flipped by `Dungeons._openDoor`. */
  open: boolean;
  /** Leaf travel, 0..1. Driven by `PropKit.update`. */
  t: number;
}

/** Which fixture geometry `Dungeon._lamp` grows around a declared light. */
export type LampKind = 'emergency' | 'dead' | 'flood' | 'lantern' | 'fungus';

/** What a dungeon author writes for a light. */
export interface LampSpec {
  at: Point2;
  y?: number;
  color?: number;
  intensity?: number;
  range?: number;
  kind?: LampKind;
  flicker?: number;
  rot?: number;
  glow?: number;
}

/** A light, once `Layout.lamp()` has applied the defaults. */
export interface Lamp {
  id: string;
  at: Point2;
  y?: number;
  color: number;
  intensity: number;
  range: number;
  kind: LampKind;
  flicker: number;
  rot: number;
  glow: number;
}

/** What the hazard does to whoever stands in it. */
export type HazardKind =
  | 'electrified-water' | 'steam-vent' | 'deep-water' | 'spores' | 'fall' | 'firedamp';

/** What a dungeon author writes for a hazard. */
export interface HazardSpec {
  at: Point2;
  /** Radius, metres. */
  r: number;
  kind: HazardKind;
  /** Damage per second. Defaults to 40; `0` is a marker with no damage. */
  dps?: number;
  y?: number;
  name?: string;
}

/** A hazard, once `Layout.hazard()` has applied the defaults. */
export interface Hazard extends Omit<HazardSpec, 'dps' | 'y'> {
  id: string;
  dps: number;
  /** Unused by the runtime: `Dungeons._hazards` is a flat cylinder test. */
  y: number | null;
}

/** What the encounter marker is asking for. */
export type EncounterKind =
  | 'mt-squad' | 'mt-commander' | 'sabertusk-pack' | 'mindflayer'
  | 'goblin-pack' | 'iron-giant';

/** What a dungeon author writes for an encounter marker. */
export interface EncounterSpec {
  at: Point2;
  /** Trigger radius, metres. */
  r: number;
  kind: EncounterKind;
  count?: number;
  boss?: boolean;
  name?: string;
}

/** An encounter marker, once `Layout.encounter()` has given it an id. */
export interface Encounter extends EncounterSpec {
  id: string;
}

/**
 * A data-driven prop placement: `layout.prop('minecart', [x, z], {...})`.
 * `kind` names a `PropKit` placer and the rest is that placer's option bag.
 */
export type PropPlacement = PropOptions & {
  kind: PropKind;
  at: Point2;
  /** Floor height at `at` when omitted. */
  y?: number;
  rot: number;
  scale: number;
};


/** What `Dungeon.build()` hands `new Layout()` off the definition. */
export interface LayoutOptions {
  name?: string;
  style?: DungeonStyle;
  corridorWidth?: number;
  corridorHeight?: number;
}

/**
 * A hand-authored interior graph: rooms, the corridors that join them, and the
 * markers (chests, doors, lamps, hazards, encounters) hung off both.
 *
 * This is deliberately *not* a maze generator. A dungeon author writes rooms
 * with names and roles and joins them with axis-aligned runs, exactly the way a
 * level designer would block one out; the procedural part is the geometry,
 * dressing and lighting that the kit grows on top of it.
 *
 * Every coordinate is local to the dungeon. `Dungeons` places the whole graph
 * in the world by translating the group, so a dungeon can be authored around
 * the origin and dropped anywhere.
 *
 * Query API used by the player, the camera and the map:
 *   floorAt(x, z)  -> number|null    walkable height, null when outside
 *   ceilingAt(x,z) -> number|null
 *   clampInside(x, z, margin) -> [x, z]
 *   regionAt(x, z) -> Room|Corridor|null
 */
export class Layout {
  chests!: Chest[];
  doors!: Door[];
  encounters!: Encounter[];
  hazards!: Hazard[];
  lamps!: Lamp[];
  props!: PropPlacement[];
  rooms!: Map<string, Room>;
  /** Ids of the corridors an author marked `critical`. */
  _critical!: string[];
  corridorHeight!: number;
  corridorWidth!: number;
  corridors!: Corridor[];
  exitAt!: Point2;
  id!: string;
  name!: string;
  spawn!: Point2;
  style!: DungeonStyle;
  constructor(id: string, opts: LayoutOptions = {}) {
    this.id = id;
    this.name = opts.name || id;
    this.style = opts.style || 'bunker';
    this.corridorWidth = opts.corridorWidth || 3.2;
    this.corridorHeight = opts.corridorHeight || 3.4;
    this.rooms = new Map();
    this.corridors = [];
    this.chests = [];
    this.doors = [];
    this.lamps = [];
    this.hazards = [];
    this.props = [];
    this.encounters = [];
    this.spawn = [0, 0];
    this.exitAt = [0, 0];
    this._critical = [];
  }

  /** Add a room. */
  room(id: string, s: RoomSpec): Room {
    const r: Room = {
      id, kind: s.kind || 'hall', name: s.name || null,
      x: s.x, z: s.z, w: s.w, d: s.d,
      y: s.y || 0, h: s.h || 4.2,
      style: s.style || this.style,
      platforms: s.platforms || [],
      ramps: s.ramps || [],
      openings: [],
      isRoom: true,
    };
    this.rooms.set(id, r);
    return r;
  }

  /** A room by id, or a throw naming the dungeon and the id. */
  get(id: string): Room {
    const r = this.rooms.get(id);
    if (!r) throw new Error(`[Layout ${this.id}] no room "${id}"`);
    return r;
  }

  /**
   * Join two rooms with an axis-aligned run. Diagonal legs are elbowed
   * automatically, so `via` only ever needs the corners that matter.
   *
   */
  link(aId: string, bId: string, s: LinkSpec = {}): Corridor {
    const a = this.get(aId), b = this.get(bId);
    const raw: Waypoint[] = [[a.x, a.z], ...(s.via || []), [b.x, b.z]];
    const pts = elbow(raw, s.elbow || 'x');

    // heights: linear in arc length from A's floor to B's floor unless the
    // author pinned a waypoint height
    const lengths = [0];
    for (let i = 1; i < pts.length; i++) {
      lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const total = lengths[lengths.length - 1] || 1;
    const path = pts.map((p, i) => [p[0], p[1], p[2] != null ? p[2] : a.y + (b.y - a.y) * (lengths[i] / total)]);

    const width = s.width || this.corridorWidth;
    const c: Corridor = {
      id: `${aId}>${bId}`, a: aId, b: bId, path,
      width, height: s.height || this.corridorHeight,
      style: s.style || this.style,
      kind: s.kind || 'corridor',
      critical: !!s.critical,
      isCorridor: true,
    };
    // clip the ends back to the room walls so the run starts at a doorway
    clipToRoom(c.path, a, width, false);
    clipToRoom(c.path, b, width, true);
    this.corridors.push(c);
    if (s.critical) this._critical.push(c.id);
    return c;
  }

  /**
   * A treasure chest.
   */
  chest(s: ChestSpec): Chest {
    const c: Chest = {
      id: `chest${this.chests.length}`, at: s.at, y: s.y,
      items: s.items || [], gil: s.gil || 0,
      name: s.name || 'Chest', big: !!s.big, rot: s.rot || 0,
      opened: false,
    };
    this.chests.push(c);
    return c;
  }

  /**
   * A door across a corridor. `key` names a dungeon-local key item; when it is
   * set the door will not open until the party is carrying it.
   */
  door(s: DoorSpec): Door {
    const d: Door = {
      id: `door${this.doors.length}`, at: s.at, facing: s.facing || 'z',
      y: s.y, w: s.w || 3.4, h: s.h || 3.0,
      key: s.key || null, name: s.name || 'Door', kind: s.kind || 'blast',
      open: !!s.open, t: s.open ? 1 : 0,
    };
    this.doors.push(d);
    return d;
  }

  /**
   * A light source. `kind` selects the fixture geometry and the falloff.
   */
  lamp(s: LampSpec): Lamp {
    const l: Lamp = {
      id: `lamp${this.lamps.length}`, at: s.at, y: s.y,
      color: s.color != null ? s.color : 0xffb473,
      intensity: s.intensity != null ? s.intensity : 6,
      range: s.range || 14,
      kind: s.kind || 'emergency',
      flicker: s.flicker != null ? s.flicker : 0.1,
      rot: s.rot || 0,
      glow: s.glow != null ? s.glow : 1,
    };
    this.lamps.push(l);
    return l;
  }

  /**
   * Environmental hazard. Purely declarative — `Dungeons` reads these to apply
   * damage and to place the VFX.
   */
  hazard(s: HazardSpec): Hazard {
    const h: Hazard = { id: `hz${this.hazards.length}`, dps: 40, y: null, ...s };
    this.hazards.push(h);
    return h;
  }

  /**
   * Set dressing: `kind` names a `PropKit` placer.
   *
   * **No dungeon uses this.** All three definitions dress themselves by calling
   * the kit directly from `dress()`, so `this.props` has always been empty and
   * `PropKit.place` has never run. Kept because it is the documented
   * data-driven path and it now type-checks; delete it if it is still unused
   * when a fourth dungeon lands.
   */
  prop(kind: PropKind, at: Point2, s: PropOptions & { y?: number, rot?: number, scale?: number } = {}): PropPlacement {
    const p: PropPlacement = { kind, at, y: s.y, rot: s.rot || 0, scale: s.scale || 1, ...s };
    this.props.push(p);
    return p;
  }

  /**
   * A scripted encounter marker.
   *
   * Declarative only: nothing outside the map reads these. `EncounterDirector`
   * runs on its own tables and has never been handed a dungeon's markers, so
   * these draw an enemy pip on the map and spawn nothing.
   */
  encounter(s: EncounterSpec): Encounter {
    const e: Encounter = { id: `enc${this.encounters.length}`, ...s };
    this.encounters.push(e);
    return e;
  }

  // ------------------------------------------------------------------ query

  /** Room or corridor containing a point, or null. Rooms win over corridors. */
  regionAt(x: number, z: number): Region | null {
    for (const r of this.rooms.values()) {
      if (Math.abs(x - r.x) <= r.w * 0.5 && Math.abs(z - r.z) <= r.d * 0.5) return r;
    }
    for (const c of this.corridors) {
      if (corridorContains(c, x, z, 0)) return c;
    }
    return null;
  }

  /**
   * Walkable floor height, or null outside the dungeon.
   */
  floorAt(x: number, z: number): number | null {
    const r = this.regionAt(x, z);
    if (!r) return null;
    if (isRoom(r)) return roomFloor(r, x, z);
    return corridorFloor(r, x, z);
  }

  ceilingAt(x: number, z: number): number | null {
    const r = this.regionAt(x, z);
    if (!r) return null;
    return isRoom(r) ? r.y + r.h : corridorFloor(r, x, z) + r.height;
  }

  /**
   * Push a point back inside the walkable volume. Used as the player's wall
   * collision — cheap, exact for axis-aligned shells, and forgiving in the
   * doorways where two regions overlap.
   * @returns [x, z]
   */
  clampInside(x: number, z: number, margin = 0.55): Point2 {
    const inside = this.regionAt(x, z);
    if (inside) {
      // already inside: only nudge if a wall is closer than the margin *and*
      // no neighbouring region covers the overlap (i.e. it is not a doorway)
      const r = inside;
      const p = pushIn(r, x, z, margin);
      if (p[0] === x && p[1] === z) return [x, z];
      if (this.regionAt(p[0], p[1]) && !this._coveredElsewhere(r, x, z)) return p;
      return [x, z];
    }
    // outside: snap to the nearest region
    let best: Region | null = null, bestD = Infinity, bestP: Point2 | null = null;
    for (const r of this.rooms.values()) {
      const p = nearestInRect(r.x, r.z, r.w, r.d, x, z, margin);
      const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
      if (d < bestD) { bestD = d; best = r; bestP = p; }
    }
    for (const c of this.corridors) {
      const p = nearestOnCorridor(c, x, z, margin);
      const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
      if (d < bestD) { bestD = d; best = c; bestP = p; }
    }
    return best && bestP ? bestP : [x, z];
  }

  _coveredElsewhere(self: Region, x: number, z: number) {
    for (const r of this.rooms.values()) {
      if (r === self) continue;
      if (Math.abs(x - r.x) <= r.w * 0.5 + 1.2 && Math.abs(z - r.z) <= r.d * 0.5 + 1.2) return true;
    }
    for (const c of this.corridors) {
      if (c === self) continue;
      if (corridorContains(c, x, z, 1.2)) return true;
    }
    return false;
  }

  /**
   * Vertex occlusion at a point: 1 fully open, ~0.25 in a corner. The shell
   * builder bakes this into the colour attribute.
   */
  occlusion(x: number, y: number, z: number): number {
    const r = this.regionAt(x, z);
    if (!r) return 0.55;
    let wall;
    let floorY, ceilY;
    if (isRoom(r)) {
      wall = Math.min(
        r.w * 0.5 - Math.abs(x - r.x),
        r.d * 0.5 - Math.abs(z - r.z)
      );
      floorY = roomFloor(r, x, z);
      ceilY = r.y + r.h;
    } else {
      wall = r.width * 0.5 - distToPath(r.path, x, z);
      floorY = corridorFloor(r, x, z);
      ceilY = floorY + r.height;
    }
    const fromWall = smoothstep(0.0, 2.6, Math.max(0, wall));
    const fromFloor = smoothstep(-0.1, 1.6, y - floorY);
    const fromCeil = smoothstep(-0.1, 1.5, ceilY - y);
    // corners multiply, so a wall/floor junction goes properly dark
    const open = 0.22 + 0.78 * (0.34 + 0.66 * fromWall) * (0.44 + 0.56 * fromFloor) * (0.5 + 0.5 * fromCeil);
    return clamp(open, 0.16, 1.0);
  }

  /** Axis-aligned bounds of everything, for the map and for culling. */
  bounds() {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const r of this.rooms.values()) {
      x0 = Math.min(x0, r.x - r.w * 0.5); x1 = Math.max(x1, r.x + r.w * 0.5);
      z0 = Math.min(z0, r.z - r.d * 0.5); z1 = Math.max(z1, r.z + r.d * 0.5);
      y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y + r.h);
    }
    for (const c of this.corridors) {
      for (const p of c.path) {
        x0 = Math.min(x0, p[0] - c.width); x1 = Math.max(x1, p[0] + c.width);
        z0 = Math.min(z0, p[1] - c.width); z1 = Math.max(z1, p[1] + c.width);
        y0 = Math.min(y0, p[2]); y1 = Math.max(y1, p[2] + c.height);
      }
    }
    return { x0, x1, z0, z1, y0, y1 };
  }
}

/* ---------------------------------------------------------------- internals */

/** Insert elbows so every leg of a polyline is axis aligned. */
function elbow(pts: Waypoint[], order: Axis): Waypoint[] {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = out[out.length - 1], q = pts[i];
    const dx = Math.abs(q[0] - p[0]), dz = Math.abs(q[1] - p[1]);
    if (dx > 1e-3 && dz > 1e-3) {
      out.push(order === 'x' ? [q[0], p[1]] : [p[0], q[1]]);
    }
    out.push(q);
  }
  return out;
}

/**
 * Trim a corridor path so it begins on the room's wall rather than at its
 * centre. Without this every corridor would tunnel through the room's floor.
 */
function clipToRoom(path: PathPoint[], room: Room, width: number, fromEnd: boolean) {
  const hx = room.w * 0.5, hz = room.d * 0.5;
  const inside = (p: PathPoint) => Math.abs(p[0] - room.x) < hx - 0.01 && Math.abs(p[1] - room.z) < hz - 0.01;
  if (fromEnd) {
    while (path.length > 2 && inside(path[path.length - 2])) path.pop();
    const n = path.length - 1;
    path[n] = wallPoint(path[n - 1], path[n], room);
  } else {
    while (path.length > 2 && inside(path[1])) path.shift();
    path[0] = wallPoint(path[1], path[0], room);
  }
}

/** Where the segment from `outside` to `centre` crosses the room's wall. */
function wallPoint(outside: PathPoint, centre: PathPoint, room: Room): PathPoint {
  const hx = room.w * 0.5, hz = room.d * 0.5;
  const dx = centre[0] - outside[0], dz = centre[1] - outside[1];
  let t = 1;
  if (Math.abs(dx) > Math.abs(dz)) {
    const wallX = room.x + (dx > 0 ? -hx : hx);
    t = Math.abs(dx) > 1e-6 ? (wallX - outside[0]) / dx : 1;
  } else {
    const wallZ = room.z + (dz > 0 ? -hz : hz);
    t = Math.abs(dz) > 1e-6 ? (wallZ - outside[1]) / dz : 1;
  }
  t = clamp(t, 0.02, 1);
  // Height is interpolated, never copied from the room centre: a corridor that
  // meets a tall room part way up its wall (a shaft gallery) must keep the
  // height its author pinned, not drop to the room's floor.
  const y0 = outside[2] != null ? outside[2] : 0;
  const y1 = centre[2] != null ? centre[2] : y0;
  return [outside[0] + dx * t, outside[1] + dz * t, y0 + (y1 - y0) * t];
}

export function corridorContains(c: Corridor, x: number, z: number, pad: number) {
  return distToPath(c.path, x, z) <= c.width * 0.5 + pad;
}

export function distToPath(path: PathPoint[], x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    best = Math.min(best, distToSeg(path[i], path[i + 1], x, z).d);
  }
  return best;
}

function distToSeg(a: PathPoint, b: PathPoint, x: number, z: number) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz || 1e-6;
  let t = ((x - a[0]) * dx + (z - a[1]) * dz) / len2;
  t = clamp(t, 0, 1);
  const px = a[0] + dx * t, pz = a[1] + dz * t;
  return { d: Math.hypot(x - px, z - pz), t, px, pz };
}

function corridorFloor(c: Corridor, x: number, z: number) {
  let best: number | null = null, bestD = Infinity;
  for (let i = 0; i < c.path.length - 1; i++) {
    const s = distToSeg(c.path[i], c.path[i + 1], x, z);
    if (s.d < bestD) {
      bestD = s.d;
      best = c.path[i][2] + (c.path[i + 1][2] - c.path[i][2]) * s.t;
    }
  }
  return best != null ? best : c.path[0][2];
}

function roomFloor(r: Room, x: number, z: number) {
  for (const p of r.platforms) {
    if (Math.abs(x - p.x) <= p.w * 0.5 && Math.abs(z - p.z) <= p.d * 0.5) return p.y;
  }
  for (const m of r.ramps) {
    if (Math.abs(x - m.x) <= m.w * 0.5 && Math.abs(z - m.z) <= m.d * 0.5) {
      const t = m.axis === 'x'
        ? (x - (m.x - m.w * 0.5)) / m.w
        : (z - (m.z - m.d * 0.5)) / m.d;
      return m.y0 + (m.y1 - m.y0) * clamp(t, 0, 1);
    }
  }
  return r.y;
}

function pushIn(r: Region, x: number, z: number, margin: number): Point2 {
  if (isRoom(r)) return nearestInRect(r.x, r.z, r.w, r.d, x, z, margin);
  return nearestOnCorridor(r, x, z, margin);
}

function nearestInRect(cx: number, cz: number, w: number, d: number, x: number, z: number, margin: number): Point2 {
  const hx = Math.max(0.2, w * 0.5 - margin), hz = Math.max(0.2, d * 0.5 - margin);
  return [clamp(x, cx - hx, cx + hx), clamp(z, cz - hz, cz + hz)];
}

function nearestOnCorridor(c: Corridor, x: number, z: number, margin: number): Point2 {
  let best: { d: number, t: number, px: number, pz: number } | null = null, bestD = Infinity;
  for (let i = 0; i < c.path.length - 1; i++) {
    const s = distToSeg(c.path[i], c.path[i + 1], x, z);
    if (s.d < bestD) { bestD = s.d; best = s; }
  }
  if (!best) return [x, z];
  const half = Math.max(0.25, c.width * 0.5 - margin);
  if (bestD <= half) return [x, z];
  const k = half / Math.max(bestD, 1e-5);
  return [best.px + (x - best.px) * k, best.pz + (z - best.pz) * k];
}

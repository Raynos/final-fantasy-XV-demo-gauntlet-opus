import { clamp, smoothstep } from './Build.ts';

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
  chests!: any[];
  doors!: any[];
  encounters!: any[];
  hazards!: any[];
  lamps!: any[];
  props!: any[];
  rooms!: Map<any, any>;
  _critical!: any[];
  corridorHeight!: any;
  corridorWidth!: any;
  corridors!: any[];
  exitAt!: number[];
  id!: any;
  name!: any;
  spawn!: number[];
  style!: any;
  constructor(id: string, opts: {name?:string, style?:string, corridorWidth?:number, corridorHeight?:number} = {}) {
    this.id = id;
    this.name = opts.name || id;
    this.style = opts.style || 'bunker';
    this.corridorWidth = opts.corridorWidth || 3.2;
    this.corridorHeight = opts.corridorHeight || 3.4;
    /** @type {Map<string, object>} */
    this.rooms = new Map();
    /** @type {object[]} */
    this.corridors = [];
    /** @type {object[]} */
    this.chests = [];
    /** @type {object[]} */
    this.doors = [];
    /** @type {object[]} */
    this.lamps = [];
    /** @type {object[]} */
    this.hazards = [];
    /** @type {object[]} */
    this.props = [];
    /** @type {object[]} */
    this.encounters = [];
    this.spawn = [0, 0];
    this.exitAt = [0, 0];
    this._critical = [];
  }

  /**
   * Add a room.
   *
   * @param {object} s
   * */
  room(id: string, s: { x: number, z: number, w: number, d: number, y?: number, h?: number, style?: 'bunker' | 'mine' | 'cave', kind?: 'entry' | 'hall' | 'junction' | 'treasure' | 'boss' | 'shaft' | 'dead-end', name?: string }) {
    const r = {
      id, kind: s.kind || 'hall', name: s.name || null,
      x: s.x, z: s.z, w: s.w, d: s.d,
      y: s.y || 0, h: s.h || 4.2,
      style: s.style || this.style,
      platforms: s.platforms || [],
      ramps: s.ramps || [],
      pillars: s.pillars || 0,
      openings: [],
      isRoom: true,
      rubble: s.rubble != null ? s.rubble : 0.5,
      water: s.water != null ? s.water : null,
    };
    this.rooms.set(id, r);
    return r;
  }

  /** @param id @returns */
  get(id: string): any {
    const r = this.rooms.get(id);
    if (!r) throw new Error(`[Layout ${this.id}] no room "${id}"`);
    return r;
  }

  /**
   * Join two rooms with an axis-aligned run. Diagonal legs are elbowed
   * automatically, so `via` only ever needs the corners that matter.
   *
   */
  link(aId: string, bId: string, s: any = {}) {
    const a = this.get(aId), b = this.get(bId);
    const raw = [[a.x, a.z], ...(s.via || []), [b.x, b.z]];
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
    const c = {
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
  chest(s: any) {
    const c = {
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
  door(s: any) {
    const d = {
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
  lamp(s: any) {
    const l = {
      id: `lamp${this.lamps.length}`, at: s.at, y: s.y,
      color: s.color != null ? s.color : 0xffb473,
      intensity: s.intensity != null ? s.intensity : 6,
      range: s.range || 14,
      kind: s.kind || 'emergency',
      flicker: s.flicker != null ? s.flicker : 0.1,
      rot: s.rot || 0,
      shaft: s.shaft || null,
      glow: s.glow != null ? s.glow : 1,
    };
    this.lamps.push(l);
    return l;
  }

  /**
   * Environmental hazard. Purely declarative — `Dungeons` reads these to apply
   * damage and to place the VFX.
   */
  hazard(s: {at:number[], r:number, kind:string, dps?:number, y?:number, name?:string}) {
    const h = { id: `hz${this.hazards.length}`, dps: 40, y: null, ...s };
    this.hazards.push(h);
    return h;
  }

  /** Set dressing: `kind` is resolved by the dungeon's prop kit. */
  prop(kind: any, at: any, s = {}) {
    const p = { kind, at, y: s.y, rot: s.rot || 0, scale: s.scale || 1, ...s };
    this.props.push(p);
    return p;
  }

  /** A scripted encounter marker (the Enemies system may consume these). */
  encounter(s: any) {
    const e = { id: `enc${this.encounters.length}`, ...s };
    this.encounters.push(e);
    return e;
  }

  // ------------------------------------------------------------------ query

  /** Room or corridor containing a point, or null. Rooms win over corridors. */
  regionAt(x: any, z: any) {
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
  floorAt(x: any, z: any): number | null {
    const r = this.regionAt(x, z);
    if (!r) return null;
    if (r.isRoom) return roomFloor(r, x, z);
    return corridorFloor(r, x, z);
  }

  ceilingAt(x: any, z: any): number | null {
    const r = this.regionAt(x, z);
    if (!r) return null;
    return r.isRoom ? r.y + r.h : corridorFloor(r, x, z) + r.height;
  }

  /**
   * Push a point back inside the walkable volume. Used as the player's wall
   * collision — cheap, exact for axis-aligned shells, and forgiving in the
   * doorways where two regions overlap.
   * @returns [x, z]
   */
  clampInside(x: any, z: any, margin = 0.55): number[] {
    if (this.regionAt(x, z)) {
      // already inside: only nudge if a wall is closer than the margin *and*
      // no neighbouring region covers the overlap (i.e. it is not a doorway)
      const r = this.regionAt(x, z);
      const p = pushIn(r, x, z, margin);
      if (p[0] === x && p[1] === z) return [x, z];
      if (this.regionAt(p[0], p[1]) && !this._coveredElsewhere(r, x, z)) return p;
      return [x, z];
    }
    // outside: snap to the nearest region
    let best = null, bestD = Infinity, bestP = null;
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
    return best ? bestP : [x, z];
  }

  _coveredElsewhere(self: any, x: any, z: any) {
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
  occlusion(x: any, y: any, z: any): number {
    const r = this.regionAt(x, z);
    if (!r) return 0.55;
    let wall;
    let floorY, ceilY;
    if (r.isRoom) {
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
function elbow(pts: any, order: any) {
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
function clipToRoom(path: any, room: any, width: any, fromEnd: any) {
  const hx = room.w * 0.5, hz = room.d * 0.5;
  const inside = (p: any) => Math.abs(p[0] - room.x) < hx - 0.01 && Math.abs(p[1] - room.z) < hz - 0.01;
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
function wallPoint(outside: any, centre: any, room: any) {
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

export function corridorContains(c: any, x: any, z: any, pad: any) {
  return distToPath(c.path, x, z) <= c.width * 0.5 + pad;
}

export function distToPath(path: any, x: any, z: any) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    best = Math.min(best, distToSeg(path[i], path[i + 1], x, z).d);
  }
  return best;
}

function distToSeg(a: any, b: any, x: any, z: any) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz || 1e-6;
  let t = ((x - a[0]) * dx + (z - a[1]) * dz) / len2;
  t = clamp(t, 0, 1);
  const px = a[0] + dx * t, pz = a[1] + dz * t;
  return { d: Math.hypot(x - px, z - pz), t, px, pz };
}

function corridorFloor(c: any, x: any, z: any) {
  let best = null, bestD = Infinity;
  for (let i = 0; i < c.path.length - 1; i++) {
    const s = distToSeg(c.path[i], c.path[i + 1], x, z);
    if (s.d < bestD) {
      bestD = s.d;
      best = c.path[i][2] + (c.path[i + 1][2] - c.path[i][2]) * s.t;
    }
  }
  return best != null ? best : c.path[0][2];
}

function roomFloor(r: any, x: any, z: any) {
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

function pushIn(r: any, x: any, z: any, margin: any) {
  if (r.isRoom) return nearestInRect(r.x, r.z, r.w, r.d, x, z, margin);
  return nearestOnCorridor(r, x, z, margin);
}

function nearestInRect(cx: any, cz: any, w: any, d: any, x: any, z: any, margin: any) {
  const hx = Math.max(0.2, w * 0.5 - margin), hz = Math.max(0.2, d * 0.5 - margin);
  return [clamp(x, cx - hx, cx + hx), clamp(z, cz - hz, cz + hz)];
}

function nearestOnCorridor(c: any, x: any, z: any, margin: any) {
  let best = null, bestD = Infinity;
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

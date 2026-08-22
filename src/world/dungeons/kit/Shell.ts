import * as THREE from 'three';
import { Noise } from '../../../util/Noise.ts';
import { SurfaceBuilder, clamp, smoothstep } from './Build.ts';
import type { Layout } from './Layout.ts';
import type { InteriorMerger } from './Build.ts';

/**
 * Turns a {@link Layout} into interior geometry.
 *
 * Three shell styles, because that is where a dungeon's identity actually
 * lives:
 *
 *   `bunker` — poured concrete boxes, hard edges, shuttering seams, low
 *              ceilings, square doorways with steel headers. Keycatrich.
 *   `mine`   — the same box topology but hewn: every surface is displaced by
 *              blast-and-drill noise and the ceiling sags between the timbers.
 *   `cave`   — no boxes at all. Passages are swept tubes and chambers are
 *              lofted domes, both irregular. Fociaugh.
 *
 * The builder writes into one {@link SurfaceBuilder} per material so the whole
 * dungeon collapses to a handful of draw calls.
 */

const STYLE = {
  bunker: { cell: 2.4, wall: 0.030, floor: 0.020, ceil: 0.035, uv: 3.2 },
  mine: { cell: 1.35, wall: 0.30, floor: 0.10, ceil: 0.38, uv: 4.6 },
  cave: { cell: 0.95, wall: 0.55, floor: 0.16, ceil: 0.60, uv: 4.4 },
};

export class ShellBuilder {
  L!: Layout;
  _ao!: any;
  n!: Noise;
  opts!: any;
  surfaces!: Map<any, any>;
  /**
   * @param opts
   *        materials may be a single material or a `(region)=>material` picker
   */
  constructor(layout: import('./Layout.ts').Layout, opts: {seed?:number, wallMat:any, floorMat:any, ceilMat:any}) {
    this.L = layout;
    this.opts = opts;
    this.n = new Noise(opts.seed || 4242);
    /** @type {Map<object, SurfaceBuilder>} */
    this.surfaces = new Map();
    this._ao = (x: any, y: any, z: any) => layout.occlusion(x, y, z);
  }

  sb(mat: any) {
    if (!this.surfaces.has(mat)) this.surfaces.set(mat, new SurfaceBuilder());
    return this.surfaces.get(mat);
  }

  pick(which: string, region: any) {
    const m = this.opts[which];
    return typeof m === 'function' ? m(region) : m;
  }

  /** Displacement field for a style, in metres along the surface normal. */
  disp(style: any, amount: any, freq = 0.35) {
    const n = this.n;
    if (amount <= 0.001) return null;
    return (x: any, y: any, z: any) => {
      const a = n.fbm2(x * freq + z * 0.07, y * freq * 1.35 + z * freq, 4) * amount;
      const b = n.fbm2(x * freq * 3.1 - 11, z * freq * 3.1 + y * 0.9, 3) * amount * 0.42;
      return a + b;
    };
  }

  /** Build everything and merge into `merger`. */
  build(merger: InteriorMerger) {
    for (const r of this.L.rooms.values()) {
      if (r.style === 'cave') this.caveChamber(r);
      else this.boxRoom(r);
    }
    for (const c of this.L.corridors) {
      if (c.style === 'cave') this.caveTunnel(c);
      else this.boxCorridor(c);
    }
    for (const [mat, sb] of this.surfaces) {
      if (!sb.empty) merger.add(mat, sb.geometry());
    }
    this.surfaces.clear();
  }

  // ------------------------------------------------------------------ rooms

  /** A concrete or hewn box: floor, ceiling, four walls with doorways cut. */
  boxRoom(r: any) {
    const s = STYLE[r.style as keyof typeof STYLE] || STYLE.bunker;
    const wallMat = this.pick('wallMat', r);
    const floorMat = this.pick('floorMat', r);
    const ceilMat = this.pick('ceilMat', r);
    const hx = r.w * 0.5, hz = r.d * 0.5;
    const ao = this._ao;

    // --- floor -------------------------------------------------------------
    this.sb(floorMat).patch({
      origin: [r.x - hx, r.y, r.z - hz],
      uAxis: [1, 0, 0], vAxis: [0, 0, 1], uLen: r.w, vLen: r.d,
      cell: s.cell, uvScale: s.uv, flip: false,
      displace: this.disp(r.style, s.floor * (r.style === 'bunker' ? 1 : 1.4), 0.5),
      ao, uvOffset: [r.x, r.z],
    });

    // --- ceiling -----------------------------------------------------------
    this.sb(ceilMat).patch({
      origin: [r.x - hx, r.y + r.h, r.z - hz],
      uAxis: [1, 0, 0], vAxis: [0, 0, 1], uLen: r.w, vLen: r.d,
      cell: s.cell, uvScale: s.uv, flip: true,
      displace: this.disp(r.style, s.ceil, 0.42),
      ao, uvOffset: [r.x, r.z],
    });

    // --- platforms and ramps ----------------------------------------------
    for (const p of r.platforms) this.slab(floorMat, wallMat, p, r, s);
    for (const m of r.ramps) this.ramp(floorMat, m, r, s);

    // --- walls -------------------------------------------------------------
    const sides = [
      { key: 'x-', o: [r.x - hx, r.y, r.z - hz], u: [0, 0, 1], len: r.d, flip: false, base: r.z - hz },
      { key: 'x+', o: [r.x + hx, r.y, r.z - hz], u: [0, 0, 1], len: r.d, flip: true, base: r.z - hz },
      { key: 'z-', o: [r.x - hx, r.y, r.z - hz], u: [1, 0, 0], len: r.w, flip: true, base: r.x - hx },
      { key: 'z+', o: [r.x - hx, r.y, r.z + hz], u: [1, 0, 0], len: r.w, flip: false, base: r.x - hx },
    ];
    for (const side of sides) {
      const openings = r.openings.filter((o: any) => o.side === side.key).map((o: any) => ({
        u0: o.u0 - side.base, u1: o.u1 - side.base, v0: o.v0, v1: o.v1,
      }));
      this.wall(wallMat, side, r.h, openings, s, r.style);
    }
  }

  /** A wall panel with rectangular doorways subtracted. */
  wall(mat: any, side: any, height: any, openings: any, s: any, style: any) {
    const sb = this.sb(mat);
    const ao = this._ao;
    const disp = this.disp(style, s.wall, 0.4);
    const emit = (u0: any, u1: any, v0: any, v1: any) => {
      if (u1 - u0 < 0.05 || v1 - v0 < 0.05) return;
      sb.patch({
        origin: [
          side.o[0] + side.u[0] * u0,
          side.o[1] + v0,
          side.o[2] + side.u[2] * u0,
        ],
        uAxis: side.u, vAxis: [0, 1, 0], uLen: u1 - u0, vLen: v1 - v0,
        cell: s.cell, uvScale: s.uv, flip: side.flip, displace: disp, ao,
        uvOffset: [u0 + side.o[0] + side.o[2], v0],
      });
    };
    const ops = openings.slice().sort((a: any, b: any) => a.u0 - b.u0);
    let cursor = 0;
    for (const o of ops) {
      const u0 = clamp(o.u0, 0, side.len), u1 = clamp(o.u1, 0, side.len);
      if (u1 <= cursor) continue;
      emit(cursor, u0, 0, height);
      if (o.v0 > 0.02) emit(u0, u1, 0, o.v0);
      if (o.v1 < height - 0.02) emit(u0, u1, o.v1, height);
      cursor = Math.max(cursor, u1);
    }
    emit(cursor, side.len, 0, height);
  }

  /** A raised platform inside a room: top face plus four skirts. */
  slab(topMat: any, sideMat: any, p: any, r: any, s: any) {
    const hx = p.w * 0.5, hz = p.d * 0.5;
    const ao = this._ao;
    this.sb(topMat).patch({
      origin: [p.x - hx, p.y, p.z - hz], uAxis: [1, 0, 0], vAxis: [0, 0, 1],
      uLen: p.w, vLen: p.d, cell: s.cell, uvScale: s.uv, ao, uvOffset: [p.x, p.z],
    });
    const drop = p.y - r.y;
    if (drop <= 0.02) return;
    const sides = [
      { o: [p.x - hx, r.y, p.z - hz], u: [0, 0, 1], len: p.d, flip: true },
      { o: [p.x + hx, r.y, p.z - hz], u: [0, 0, 1], len: p.d, flip: false },
      { o: [p.x - hx, r.y, p.z - hz], u: [1, 0, 0], len: p.w, flip: false },
      { o: [p.x - hx, r.y, p.z + hz], u: [1, 0, 0], len: p.w, flip: true },
    ];
    for (const sd of sides) {
      this.sb(sideMat).patch({
        origin: sd.o, uAxis: sd.u, vAxis: [0, 1, 0], uLen: sd.len, vLen: drop,
        cell: s.cell, uvScale: s.uv, flip: sd.flip, ao,
      });
    }
  }

  /** A sloped walkway between two floor heights. */
  ramp(mat: any, m: any, r: any, s: any) {
    const hx = m.w * 0.5, hz = m.d * 0.5;
    const ao = this._ao;
    const sb = this.sb(mat);
    const along = m.axis === 'x' ? [1, 0, 0] : [0, 0, 1];
    const len = m.axis === 'x' ? m.w : m.d;
    const cross = m.axis === 'x' ? [0, 0, 1] : [1, 0, 0];
    const crossLen = m.axis === 'x' ? m.d : m.w;
    const rise = m.y1 - m.y0;
    const dir = [along[0], rise / len, along[2]];
    const l = Math.hypot(dir[0], dir[1], dir[2]);
    sb.patch({
      origin: [m.x - hx, m.y0, m.z - hz],
      uAxis: [dir[0] / l, dir[1] / l, dir[2] / l], vAxis: cross,
      uLen: Math.hypot(len, rise), vLen: crossLen,
      // a run along Z pairs with a cross axis of +X, which reverses the handedness
      flip: m.axis === 'z',
      cell: s.cell, uvScale: s.uv, ao, uvOffset: [m.x, m.z],
    });
  }

  // -------------------------------------------------------------- corridors

  /** A square-section run with elbow patches at every corner. */
  boxCorridor(c: any) {
    const s = STYLE[c.style as keyof typeof STYLE] || STYLE.bunker;
    const wallMat = this.pick('wallMat', c);
    const floorMat = this.pick('floorMat', c);
    const ceilMat = this.pick('ceilMat', c);
    const hw = c.width * 0.5;
    const ao = this._ao;
    const wallDisp = this.disp(c.style, s.wall, 0.4);
    const floorDisp = this.disp(c.style, s.floor, 0.5);
    const ceilDisp = this.disp(c.style, s.ceil, 0.42);
    const n = c.path.length;

    for (let i = 0; i < n - 1; i++) {
      const a = c.path[i], b = c.path[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      const dir = [dx / len, 0, dz / len];
      const right = [-dir[2], 0, dir[0]];
      const t0 = i > 0 ? hw : 0;
      const t1 = i < n - 2 ? len - hw : len;
      const span = t1 - t0;
      if (span < 0.05) continue;
      const rise = (b[2] - a[2]) / len;
      const y0 = a[2] + rise * t0;
      const along = [dir[0], rise, dir[2]];
      const al = Math.hypot(along[0], along[1], along[2]);
      const alongN = [along[0] / al, along[1] / al, along[2] / al];
      const sLen = span * al;
      const start = [a[0] + dir[0] * t0, y0, a[1] + dir[2] * t0];

      // floor
      this.sb(floorMat).patch({
        origin: [start[0] - right[0] * hw, start[1], start[2] - right[2] * hw],
        uAxis: alongN, vAxis: right, uLen: sLen, vLen: c.width,
        cell: s.cell, uvScale: s.uv, displace: floorDisp, ao,
        uvOffset: [t0, 0],
      });
      // ceiling
      this.sb(ceilMat).patch({
        origin: [start[0] - right[0] * hw, start[1] + c.height, start[2] - right[2] * hw],
        uAxis: alongN, vAxis: right, uLen: sLen, vLen: c.width,
        cell: s.cell, uvScale: s.uv, flip: true, displace: ceilDisp, ao,
        uvOffset: [t0, 0],
      });
      // side walls
      for (const sgn of [-1, 1]) {
        this.sb(wallMat).patch({
          origin: [start[0] + right[0] * hw * sgn, start[1], start[2] + right[2] * hw * sgn],
          uAxis: alongN, vAxis: [0, 1, 0], uLen: sLen, vLen: c.height,
          cell: s.cell, uvScale: s.uv, flip: sgn < 0, displace: wallDisp, ao,
          uvOffset: [t0, 0],
        });
      }
    }

    // elbow boxes
    for (let i = 1; i < n - 1; i++) {
      const p = c.path[i];
      const inDir = dirOf(c.path[i - 1], p);
      const outDir = dirOf(p, c.path[i + 1]);
      this.elbow(c, p, inDir, outDir, s, { wallMat, floorMat, ceilMat }, hw);
    }
  }

  /** The square where two corridor legs meet: floor, ceiling and two walls. */
  elbow(c: any, p: any, inDir: number[], outDir: number[], s: any, mats: any, hw: number) {
    const ao = this._ao;
    const y = p[2];
    this.sb(mats.floorMat).patch({
      origin: [p[0] - hw, y, p[1] - hw], uAxis: [1, 0, 0], vAxis: [0, 0, 1],
      uLen: c.width, vLen: c.width, cell: s.cell, uvScale: s.uv,
      displace: this.disp(c.style, s.floor, 0.5), ao, uvOffset: [p[0], p[1]],
    });
    this.sb(mats.ceilMat).patch({
      origin: [p[0] - hw, y + c.height, p[1] - hw], uAxis: [1, 0, 0], vAxis: [0, 0, 1],
      uLen: c.width, vLen: c.width, cell: s.cell, uvScale: s.uv, flip: true,
      displace: this.disp(c.style, s.ceil, 0.42), ao, uvOffset: [p[0], p[1]],
    });
    // the two faces of the square that are not a corridor mouth
    const open = new Set([faceKey(inDir, true), faceKey(outDir, false)]);
    const faces = [
      { key: 'x-', o: [p[0] - hw, y, p[1] - hw], u: [0, 0, 1], flip: false },
      { key: 'x+', o: [p[0] + hw, y, p[1] - hw], u: [0, 0, 1], flip: true },
      { key: 'z-', o: [p[0] - hw, y, p[1] - hw], u: [1, 0, 0], flip: true },
      { key: 'z+', o: [p[0] - hw, y, p[1] + hw], u: [1, 0, 0], flip: false },
    ];
    for (const f of faces) {
      if (open.has(f.key)) continue;
      this.sb(mats.wallMat).patch({
        origin: f.o, uAxis: f.u, vAxis: [0, 1, 0], uLen: c.width, vLen: c.height,
        cell: s.cell, uvScale: s.uv, flip: f.flip,
        displace: this.disp(c.style, s.wall, 0.4), ao,
      });
    }
  }

  // ------------------------------------------------------------- cave forms

  /** A natural passage: an irregular swept tube you can stand up inside. */
  caveTunnel(c: any) {
    const s = STYLE.cave;
    const mat = this.pick('wallMat', c);
    const floorMat = this.pick('floorMat', c);
    const n = this.n;
    const ao = this._ao;
    const r0 = c.width * 0.62;
    const axisY = 1.55;

    // resample the polyline so the sweep bends instead of kinking
    const dense = resample(c.path, 1.4);
    const path = dense.map((p) => [p[0], p[2] + axisY, p[1]]);
    this.sb(mat).tube(path, (t: any, th: any, x: any, y: any, z: any) => {
      const bulge = 1 + 0.26 * n.fbm2(x * 0.14 + z * 0.10, y * 0.22 + th * 0.40, 3);
      const squeeze = 1 - 0.20 * Math.sin(t * Math.PI * 3.1 + 1.2);
      return r0 * bulge * squeeze * (1 + 0.07 * Math.sin(th * 3 + t * 9));
    }, { sides: 16, ao, uvScale: s.uv, flatten: 0.34 });

    // a silt floor laid inside the tube so there is something dry to walk on
    for (let i = 0; i < dense.length - 1; i++) {
      const a = dense[i], b = dense[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.02) continue;
      const dir = [dx / len, (b[2] - a[2]) / len, dz / len];
      const dl = Math.hypot(dir[0], dir[1], dir[2]);
      const right = [-dz / len, 0, dx / len];
      const w = c.width * 0.86;
      this.sb(floorMat).patch({
        origin: [a[0] - right[0] * w * 0.5, a[2] - 0.02, a[1] - right[2] * w * 0.5],
        uAxis: [dir[0] / dl, dir[1] / dl, dir[2] / dl], vAxis: right,
        uLen: len * dl, vLen: w, cell: 1.1, uvScale: s.uv,
        displace: (x: any, y: any, z: any) => n.fbm2(x * 0.5, z * 0.5, 3) * 0.09, ao,
        uvOffset: [a[0], a[1]],
      });
    }
  }

  /**
   * A cave chamber: a lofted, noise-bulged dome with a silted floor. This is
   * also what the mine's bottom cavern uses — a hewn shaft never reads as
   * "vast", but a chamber whose walls fall away from you does.
   */
  caveChamber(r: any) {
    const mat = this.pick('wallMat', r);
    const floorMat = this.pick('floorMat', r);
    const n = this.n;
    const ao = this._ao;
    const sbW = this.sb(mat);
    const RINGS = 14, SIDES = 30;
    const a = r.w * 0.5, b = r.d * 0.5;

    const radius = (th: number, k: number) => {
      const t = k / RINGS;
      const ct = Math.cos(th), st = Math.sin(th);
      const ell = 1 / Math.sqrt((ct / a) ** 2 + (st / b) ** 2);
      // wide at the shoulder, pinched at the crown — a real chamber section
      const profile = 0.94 + 0.16 * Math.sin(t * Math.PI * 0.92) - 0.9 * Math.pow(Math.max(0, t - 0.55) / 0.45, 2.2);
      const wob = 1 + 0.22 * n.fbm2(Math.cos(th) * 2.4 + 11, Math.sin(th) * 2.4 + t * 3.1, 4);
      return Math.max(0.6, ell * profile * wob);
    };

    const base = sbW.pos.length / 3;
    for (let k = 0; k <= RINGS; k++) {
      const t = k / RINGS;
      const y = r.y + r.h * t;
      for (let j = 0; j < SIDES; j++) {
        const th = (j / SIDES) * Math.PI * 2;
        const rad = radius(th, k);
        const x = r.x + Math.cos(th) * rad;
        const z = r.z + Math.sin(th) * rad;
        sbW._push([x, y, z], [0, 1, 0], [(th * rad) / 3.0, y / 3.0], ao(x, y, z));
      }
    }
    const holes = r.holes || [];
    const inHole = (th: number, yLo: any, yHi: any) => {
      for (const h of holes) {
        let d = th - h.theta;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) <= h.half && yHi > h.y0 && yLo < h.y1) return true;
      }
      return false;
    };
    for (let k = 0; k < RINGS; k++) {
      const yLo = r.y + r.h * (k / RINGS), yHi = r.y + r.h * ((k + 1) / RINGS);
      for (let j = 0; j < SIDES; j++) {
        const th = ((j + 0.5) / SIDES) * Math.PI * 2;
        if (inHole(th, yLo, yHi)) continue;
        const p0 = base + k * SIDES + j;
        const p1 = base + k * SIDES + ((j + 1) % SIDES);
        const p2 = p0 + SIDES, p3 = p1 + SIDES;
        sbW.idx.push(p0, p1, p2, p1, p3, p2);
      }
    }
    // crown cap
    const apex = sbW._push([r.x, r.y + r.h + 0.8, r.z], [0, -1, 0], [0.5, 0.5], ao(r.x, r.y + r.h, r.z));
    for (let j = 0; j < SIDES; j++) {
      const p0 = base + RINGS * SIDES + j;
      const p1 = base + RINGS * SIDES + ((j + 1) % SIDES);
      sbW.idx.push(apex, p0, p1);
    }
    sbW._needsNormals = true;

    // silted floor disc
    const sbF = this.sb(floorMat);
    const fbase = sbF.pos.length / 3;
    const FR = 8;
    for (let k = 0; k <= FR; k++) {
      const rr = k / FR;
      for (let j = 0; j < SIDES; j++) {
        const th = (j / SIDES) * Math.PI * 2;
        const rad = radius(th, 0) * rr;
        const x = r.x + Math.cos(th) * rad;
        const z = r.z + Math.sin(th) * rad;
        const y = r.y + n.fbm2(x * 0.22, z * 0.22, 3) * 0.28 * (r.style === 'cave' ? 1 : 0.4);
        sbF._push([x, y, z], [0, 1, 0], [x / 3.2, z / 3.2], ao(x, y + 0.1, z));
      }
    }
    for (let k = 0; k < FR; k++) {
      for (let j = 0; j < SIDES; j++) {
        const p0 = fbase + k * SIDES + j;
        const p1 = fbase + k * SIDES + ((j + 1) % SIDES);
        const p2 = p0 + SIDES, p3 = p1 + SIDES;
        sbF.idx.push(p0, p1, p2, p1, p3, p2);
      }
    }
    sbF._needsNormals = true;

    for (const p of r.platforms) {
      this.slab(floorMat, mat, p, r, STYLE[r.style as keyof typeof STYLE] || STYLE.cave);
    }
    for (const m of r.ramps) this.ramp(floorMat, m, r, STYLE[r.style as keyof typeof STYLE] || STYLE.cave);
  }
}

/**
 * Register a doorway on every room wall a corridor touches. Called once by the
 * dungeon before geometry is built.
 */
export function cutDoorways(layout: import('./Layout.ts').Layout) {
  for (const c of layout.corridors) {
    cutEnd(layout, c, c.a, c.path[0], c.path[1]);
    cutEnd(layout, c, c.b, c.path[c.path.length - 1], c.path[c.path.length - 2]);
  }
}

function cutEnd(layout: Layout, c: any, roomId: any, end: any, inner: any) {
  const r = layout.rooms.get(roomId);
  if (!r || !end || !inner) return;

  // A cave chamber has no walls to subtract a rectangle from — it is a lofted
  // surface — so its openings are recorded as an angular window instead, and
  // the loft simply skips the quads inside it.
  if (r.style === 'cave') {
    const dx = end[0] - r.x, dz = end[1] - r.z;
    const rad = Math.max(1.5, Math.hypot(dx, dz));
    if (!r.holes) r.holes = [];
    r.holes.push({
      theta: Math.atan2(dz, dx),
      half: Math.asin(Math.min(0.95, (c.width * 0.5 + 0.9) / rad)),
      y0: end[2] - 0.6,
      y1: end[2] + c.height + 0.5,
    });
    return;
  }

  const hx = r.w * 0.5, hz = r.d * 0.5;
  const dx = Math.abs(Math.abs(end[0] - r.x) - hx);
  const dz = Math.abs(Math.abs(end[1] - r.z) - hz);
  const half = c.width * 0.5 + 0.16;
  const v0 = Math.max(0, end[2] - r.y - 0.35);
  const v1 = Math.min(r.h - 0.05, v0 + c.height + 0.25);
  if (dx < dz) {
    r.openings.push({
      side: end[0] < r.x ? 'x-' : 'x+',
      u0: end[1] - half, u1: end[1] + half, v0, v1,
    });
  } else {
    r.openings.push({
      side: end[1] < r.z ? 'z-' : 'z+',
      u0: end[0] - half, u1: end[0] + half, v0, v1,
    });
  }
}

/* ---------------------------------------------------------------- helpers */

function dirOf(a: any, b: any) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  return Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
}

/** Which face of an elbow square a leg enters or leaves through. */
function faceKey(d: number[], incoming: boolean) {
  const s = incoming ? -1 : 1;
  if (d[0] !== 0) return d[0] * s > 0 ? 'x+' : 'x-';
  return d[1] * s > 0 ? 'z+' : 'z-';
}

function resample(path: any, step: number) {
  const out = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  out.push(path[path.length - 1].slice());
  return out;
}

export { STYLE, smoothstep, THREE };

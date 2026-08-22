/**
 * THE ROAD NETWORK OF LUCIS — a graph, not a spline.
 *
 * Nodes are junctions and terminals; routes are ordered lists of nodes with
 * shaping points between them. Two routes that name the same node meet there,
 * so junction geometry falls out of the data instead of being hand-placed.
 *
 * Everything downstream — the heightfield carve, the driving system, the
 * minimap, the world map screen, the pathfinder — reads this one graph.
 *
 * Design constraints, enforced by `src/tools/roadcheck.mts`:
 *   - every POI with `drive: true` sits within `reach` metres of a drivable edge
 *   - no sustained grade steeper than the class limit
 *   - no corner tighter than the class minimum radius
 *   - every dead end terminates in a turning circle (a `parking` POI)
 */

/**
 * Road classes. `half` is the half-width of the running surface, `shoulder`
 * the half-width of the disturbed verge beyond it.
 */
/** One road class: how wide it is, how steep and tight it may get, how fast. */
export interface RoadClass {
  id: string;
  label: string;
  /** Half-width of the running surface, metres. */
  half: number;
  /** Half-width of the disturbed verge beyond the surface, metres. */
  shoulder: number;
  /** Steepest sustained grade allowed, as a slope. */
  maxGrade: number;
  /** Tightest corner allowed, metres. */
  minRadius: number;
  /** Travel speed, m/s. Zero means no car goes here. */
  speed: number;
  sealed: boolean;
  /** How close a drivable POI has to be to this class, metres. */
  reach: number;
  /** Line weight on the map screen. */
  draw: number;
}

/** Every road class there is. `RouteSpec.cls` names one. */
export type RoadClassName = 'highway' | 'road' | 'track' | 'trail';

export const ROAD_CLASS: Record<RoadClassName, RoadClass> = {
  highway: {
    id: 'highway', label: 'Highway', half: 5.2, shoulder: 10.5,
    maxGrade: 0.070, minRadius: 70, speed: 30, sealed: true, reach: 60, draw: 3.2,
  },
  road: {
    id: 'road', label: 'Road', half: 4.2, shoulder: 8.0,
    maxGrade: 0.090, minRadius: 45, speed: 22, sealed: true, reach: 55, draw: 2.2,
  },
  track: {
    id: 'track', label: 'Dirt Track', half: 3.2, shoulder: 6.0,
    maxGrade: 0.130, minRadius: 24, speed: 14, sealed: false, reach: 50, draw: 1.5,
  },
  trail: {
    id: 'trail', label: 'Trail', half: 1.4, shoulder: 2.4,
    maxGrade: 0.360, minRadius: 6, speed: 0, sealed: false, reach: 0, draw: 0.8,
  },
};

/**
 * Junctions and terminals. Ids beginning `j_` are pure junctions; the rest
 * correspond to a POI of the same stem.
 */
/**
 * A junction or terminal as authored: `[x, z]` in world metres.
 * `RoadGraph` turns each into a {@link RoadNode}.
 */
export type NodeTable = Record<string, number[]>;

export const NODES: NodeTable = {
  // --- Route 1, the spine. Its Z decreases monotonically from the Insomnia
  //     gate in the south-east to Lestallum in the north-west: several systems
  //     locate the highway by bracketing on Z, and a spine that doubled back
  //     would make them pick the wrong carriageway a continent away.
  n_insomnia: [3520, 512],
  j_formouth: [3120, 402],
  j_crestholm: [2620, 300],
  j_galdin: [1866, 172],
  j_threevalleys: [1420, 100],
  n_longwythe: [1120, 62],
  j_keycatrich: [520, 42],
  n_hammerhead: [60, 18],
  j_prairie: [-620, -36],
  j_alstor: [-1080, -120],
  n_norduscaen: [-1560, -228],
  j_cauthess: [-1760, -290],
  n_taelpar: [-2130, -420],
  n_taelpar_bridge: [-2286, -486],
  n_lestallum: [-2960, -700],

  // --- Leide branches
  n_formouth: [3240, -170],
  n_crestholm: [3060, 1220],
  n_balouve: [2740, 1080],
  j_balouve: [2560, 700],
  n_galdin_quay: [2330, 2380],
  j_kelbass: [2110, 1400],
  n_daurell: [1300, 1780],
  j_daurell: [1560, 1180],
  n_keycatrich: [236, -1150],
  n_longwythe_peak: [905, -800],

  // --- Duscae branches
  n_prairie: [-700, 1020],
  j_fallgrove: [-980, 1300],
  n_costlemark: [-1010, 1560],
  j_wiz: [-1700, 900],
  n_wiz: [-2050, 460],
  n_aracheole: [-2440, 180],
  j_caem: [-2200, 1120],
  n_cape_caem: [-2430, 1660],
  j_malmalam: [-2900, 1300],
  n_malmalam: [-3100, 1430],
  n_perpetouss: [-1750, 1380],
  n_coernix_cauthess: [-1460, -980],
  n_disc: [-1220, -1360],
  n_nebulawood: [-1500, -1180],

  // --- Cleigne
  n_old_lestallum: [-3200, -1220],
  j_cotisse: [-3080, -1800],
  j_vesper: [-2620, -2060],
  n_vesper_dock: [-2680, -2280],
  n_meldacio: [-1950, -2960],
  j_meldacio_e: [-1560, -2860],
  n_myrlwood: [-2420, -3180],
  j_verinas: [-3320, -2000],
  n_verinas: [-3420, -2260],
  n_ravatogh: [-3470, -2790],
  n_fort_vaullerey: [-2560, -2700],
};

/**
 * Routes. `path` entries are either a node id (string) or a raw `[x, z]`
 * shaping point. Consecutive node ids define graph edges; shaping points only
 * bend the geometry between them.
 */
/**
 * One authored route. `path` alternates node ids with bare `[x, z]` shaping
 * points: a string opens (and closes) an edge, a pair bends the one in hand.
 */
export interface RouteSpec {
  id: string;
  name: string;
  cls: RoadClassName;
  /** What the road is *for*, in design terms. */
  doc: string;
  path: Array<string | number[]>;
}

export const ROUTES: RouteSpec[] = [
  {
    id: 'route1', name: 'Route 1 — The Crown City Highway', cls: 'highway',
    doc: 'The spine. Runs the whole width of Lucis, from the Insomnia gate in '
      + 'the east to Lestallum in the west, and every other road hangs off it.',
    path: [
      'n_insomnia', [3340, 470], 'j_formouth', [2900, 356], 'j_crestholm',
      [2280, 236], 'j_galdin', [1620, 130], 'j_threevalleys', 'n_longwythe',
      [800, 52], 'j_keycatrich', [300, 30], 'n_hammerhead', [-300, -2],
      'j_prairie', [-860, -76], 'j_alstor', [-1330, -170], 'n_norduscaen',
      'j_cauthess', [-1980, -356], 'n_taelpar', 'n_taelpar_bridge',
      [-2520, -574], [-2760, -636], 'n_lestallum',
    ],
  },
  {
    id: 'route2', name: 'Route 2 — The Galdin Road', cls: 'highway',
    doc: 'South from the highway across the Kelbass grasslands to the coast.',
    path: [
      'j_galdin', [1930, 620], [2020, 1020], 'j_kelbass', [2190, 1860],
      [2280, 2140], 'n_galdin_quay',
    ],
  },
  {
    id: 'route3', name: 'Route 3 — The Slough Loop', cls: 'road',
    doc: 'The Duscae ring: leaves the highway at Prairie, swings south around '
      + 'Alstor Slough through Wiz country and rejoins at the Taelpar fork.',
    path: [
      'j_prairie', [-660, 440], 'n_prairie', 'j_fallgrove', [-1320, 1180],
      'j_wiz', [-1980, 760], 'n_wiz', [-2180, 240], 'n_aracheole', [-2320, -140],
      [-2200, -330], 'n_taelpar',
    ],
  },
  {
    id: 'route4', name: 'Route 4 — The Caem Road', cls: 'road',
    doc: 'From the slough loop down to the southern headland.',
    path: ['j_wiz', 'j_caem', [-2320, 1420], 'n_cape_caem'],
  },
  {
    id: 'route5', name: 'Route 5 — The Cleigne North Road', cls: 'road',
    doc: 'Lestallum to the hunter country: Old Lestallum, the Vesperpool '
      + 'causeway and the Meldacio pass.',
    path: [
      'n_lestallum', [-3080, -980], 'n_old_lestallum', [-3220, -1560],
      'j_cotisse', [-2900, -1960], 'j_vesper', [-2560, -2460], [-2420, -2780],
      [-2180, -2970], 'n_meldacio', 'j_meldacio_e',
    ],
  },
  {
    id: 'route6', name: 'Route 6 — The Ravatogh Ash Road', cls: 'track',
    doc: 'Round the north shore of the pool and up onto the ash field.',
    path: ['j_cotisse', [-3230, -1880], 'j_verinas', 'n_verinas', [-3480, -2520], 'n_ravatogh'],
  },
  {
    id: 'route7', name: 'Cauthess Spur', cls: 'road',
    doc: 'The Disc approach: Coernix Station, the rest area, the overlook.',
    path: ['j_cauthess', [-1660, -620], 'n_coernix_cauthess', [-1300, -1280], 'n_disc'],
  },
  {
    id: 'route8', name: 'Nebulawood Track', cls: 'track',
    doc: 'A logging track that gives up where the canopy closes.',
    path: ['j_alstor', [-1180, -560], [-1300, -880], 'n_nebulawood'],
  },
  {
    id: 'route9', name: 'Keycatrich Track', cls: 'track',
    doc: 'North off the highway to the ruined town and the trench.',
    path: ['j_keycatrich', [480, -380], [360, -780], 'n_keycatrich'],
  },
  {
    id: 'route10', name: 'Longwythe Peak Track', cls: 'track',
    doc: 'Up onto the shoulder of the peak. Steep, loose, worth it.',
    path: ['j_threevalleys', [1300, -260], [1080, -560], 'n_longwythe_peak'],
  },
  {
    id: 'route11', name: 'Balouve Mine Road', cls: 'road',
    doc: 'The old ore road to the shaft heads, and on to the Crestholm inlet.',
    path: ['j_crestholm', 'j_balouve', [2640, 900], 'n_balouve', [2900, 1160], 'n_crestholm'],
  },
  {
    id: 'route12', name: 'Daurell Valley Track', cls: 'track',
    doc: 'Down the third of the Three Valleys to the cavern mouth.',
    path: ['j_galdin', 'j_daurell', [1440, 1520], 'n_daurell'],
  },
  {
    id: 'route13', name: 'Costlemark Lane', cls: 'track',
    doc: 'A field lane across the Fallgrove downs. Closed by day, they say.',
    path: ['j_fallgrove', 'n_costlemark'],
  },
  {
    id: 'route14', name: 'Malmalam Approach', cls: 'track',
    doc: 'The road runs out at a wall of trees.',
    path: ['j_caem', 'j_malmalam', 'n_malmalam'],
  },
  {
    id: 'route15', name: 'Perpetouss Access', cls: 'track',
    doc: 'Imperial service road to the dropship depot.',
    path: ['j_fallgrove', [-1560, 1420], 'n_perpetouss'],
  },
  {
    id: 'route16', name: 'Formouth Access', cls: 'road',
    doc: 'Imperial approach to the garrison gate.',
    path: ['j_formouth', [3230, 130], 'n_formouth'],
  },
  {
    id: 'route17', name: 'Vaullerey Cliff Road', cls: 'track',
    doc: 'Switchbacks up to the fort on the pass wall.',
    path: ['j_vesper', [-2640, -2440], 'n_fort_vaullerey'],
  },
  {
    id: 'route18', name: 'Myrlwood Track', cls: 'track',
    doc: 'West off the pass road into the fungal wood.',
    path: ['n_meldacio', [-2180, -3080], 'n_myrlwood'],
  },
  {
    id: 'route19', name: 'Vesperpool Causeway', cls: 'road',
    doc: 'A raised bank out to the water and the fishing stage.',
    path: ['j_vesper', 'n_vesper_dock'],
  },
];

const SAMPLE_STEP = 6;

/**
 * One resampled point on a centreline. `y` is written back by the terrain
 * carve; everything else is fixed when the graph is built.
 */
export interface RoadSample {
  x: number;
  z: number;
  /** Ground height, filled in by the terrain carve. 0 until then. */
  y: number;
  /** Arc length from the start of the edge, metres. */
  s: number;
  /** Unit tangent in the XZ plane. */
  tx: number;
  tz: number;
}

/** A junction or terminal, and the indices of the edges meeting there. */
export interface RoadNode {
  id: string;
  x: number;
  z: number;
  /** Indices into `RoadGraph.edges`. */
  edges: number[];
}

/** One stretch of road between two nodes. */
export interface RoadEdge {
  /** `"<route>:<a>-><b>"`. */
  id: string;
  /** `RouteSpec.id` this edge belongs to. */
  route: string;
  cls: RoadClassName;
  clsDef: RoadClass;
  /** Node ids at each end. */
  a: string;
  b: string;
  pts: RoadSample[];
  /** Arc length, metres. */
  length: number;
}

/** A whole route: its spec, its edges, and one continuous polyline to draw. */
export interface Route extends Omit<RouteSpec, 'cls'> {
  cls: RoadClass;
  /** Indices into `RoadGraph.edges`, in order. */
  edges: number[];
  pts: RoadSample[];
  length: number;
}

/** Where a point on the network is, and how far off it the query was. */
export interface RoadHit {
  /** Metres from the query point to the centreline. */
  dist: number;
  edge: RoadEdge;
  /** Index of the sample the hit sits on or just after. */
  i: number;
  x: number;
  z: number;
  s: number;
  y: number;
  tx: number;
  tz: number;
  /** Which side of the road the query point is on: +1 or -1. */
  side: number;
}

/** Catmull-Rom through a control list, resampled at ~`step` metres. */
function resample(ctrl: number[][], step: number): RoadSample[] {
  if (ctrl.length < 2) return ctrl.map((p) => ({ x: p[0], z: p[1], y: 0, s: 0, tx: 0, tz: 1 }));
  const raw: RoadSample[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i];
    const p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(seg / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t
        + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
        + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t
        + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
        + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      raw.push({ x, z, y: 0, s: 0, tx: 0, tz: 1 });
    }
  }
  const last = ctrl[ctrl.length - 1];
  raw.push({ x: last[0], z: last[1], y: 0, s: 0, tx: 0, tz: 1 });

  // Drop coincident samples. A Catmull-Rom with a doubled end control point
  // can emit two points a millimetre apart, and every downstream grade,
  // curvature and tangent calculation then divides by ~zero.
  for (let i = raw.length - 2; i > 0; i--) {
    if (Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z) < 0.75) raw.splice(i, 1);
  }
  if (raw.length > 2
    && Math.hypot(raw[raw.length - 1].x - raw[raw.length - 2].x,
      raw[raw.length - 1].z - raw[raw.length - 2].z) < 0.75) raw.splice(raw.length - 2, 1);

  let s = 0;
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) s += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z);
    raw[i].s = s;
    const a = raw[Math.max(0, i - 1)], b = raw[Math.min(raw.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    raw[i].tx = dx / l; raw[i].tz = dz / l;
  }
  return raw;
}

/**
 * The whole network: geometry, connectivity, nearest-point queries and
 * routing. Pure 2D — elevation is fitted later by the terrain carve, which
 * writes `y` back into every sample.
 */
export class RoadGraph {
  routes!: Route[];
  _cell!: number;
  /** `"i,j"` cell -> packed `(edgeIndex << 16) | sampleIndex`. */
  _grid!: Map<string, number[]>;
  classes!: Record<RoadClassName, RoadClass>;
  edges!: RoadEdge[];
  nodes!: Map<string, RoadNode>;
  routeById!: Map<string, Route>;
  /** Metres of road in the whole network. */
  totalLength!: number;
  /**
   * @param nodes id -> [x, z]
   * @param routes see {@link ROUTES}
   * @param classes see {@link ROAD_CLASS}
   */
  constructor(nodes: NodeTable, routes: RouteSpec[], classes: Record<RoadClassName, RoadClass>) {
    this.classes = classes;
    this.nodes = new Map();
    for (const id of Object.keys(nodes)) {
      this.nodes.set(id, { id, x: nodes[id][0], z: nodes[id][1], edges: [] });
    }

    /** @type {Array<{id:string,route:string,cls:string,a:string,b:string,pts:object[],length:number}>} */
    this.edges = [];
    this.routes = [];

    for (const r of routes) {
      const cls = classes[r.cls];
      // Split the path at node ids into per-edge control lists.
      const chunks: Array<{ a: string, b: string, ctrl: number[][] }> = [];
      let cur: { a: string, b: string, ctrl: number[][] } | null = null;
      for (const step of r.path) {
        if (typeof step === 'string') {
          const nd = this.nodes.get(step);
          if (!nd) throw new Error(`RoadGraph: unknown node ${step} in ${r.id}`);
          if (cur) { cur.ctrl.push([nd.x, nd.z]); cur.b = step; chunks.push(cur); }
          cur = { a: step, b: '', ctrl: [[nd.x, nd.z]] };
        } else if (cur) {
          cur.ctrl.push([step[0], step[1]]);
        }
      }

      const routeRec: Route = { ...r, cls, edges: [], pts: [], length: 0 };
      for (const c of chunks) {
        // Give the spline one control point of lead-in/lead-out from the
        // neighbouring chunk so junction tangents stay continuous.
        const pts = resample(c.ctrl, SAMPLE_STEP);
        const e: RoadEdge = {
          id: `${r.id}:${c.a}->${c.b}`,
          route: r.id, cls: r.cls, clsDef: cls,
          a: c.a, b: c.b, pts, length: pts[pts.length - 1].s,
        };
        const ei = this.edges.length;
        this.edges.push(e);
        // both ends were resolved out of `this.nodes` above, or we threw
        this.nodes.get(c.a)!.edges.push(ei);
        this.nodes.get(c.b)!.edges.push(ei);
        routeRec.edges.push(ei);
      }
      // one continuous polyline per route, for drawing
      let s = 0;
      for (const ei of routeRec.edges) {
        const e = this.edges[ei];
        for (let i = routeRec.pts.length ? 1 : 0; i < e.pts.length; i++) {
          const p = e.pts[i];
          routeRec.pts.push({ x: p.x, z: p.z, y: 0, s: s + p.s, tx: p.tx, tz: p.tz });
        }
        s += e.length;
      }
      routeRec.length = s;
      this.routes.push(routeRec);
    }

    this.routeById = new Map(this.routes.map((r) => [r.id, r]));
    this.totalLength = this.routes.reduce((a, r) => a + r.length, 0);
    this._buildAccel();
  }

  // ------------------------------------------------------------- accel grid

  _buildAccel() {
    this._cell = 96;
    this._grid = new Map();
    for (let ei = 0; ei < this.edges.length; ei++) {
      const e = this.edges[ei];
      for (let i = 0; i < e.pts.length; i++) {
        const p = e.pts[i];
        const key = `${Math.floor(p.x / this._cell)},${Math.floor(p.z / this._cell)}`;
        let a = this._grid.get(key);
        if (!a) { a = []; this._grid.set(key, a); }
        a.push((ei << 16) | i);
      }
    }
  }

  /**
   * Closest point on any road centreline.
   * @param x @param z
   * @param [maxR] give up beyond this many metres
   */
  nearest(x: number, z: number, maxR: number = 400): RoadHit | null {
    const cell = this._cell;
    const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
    const rings = Math.ceil(maxR / cell);
    let bestD2 = Infinity, bestEi = -1, bestI = 0;
    for (let r = 0; r <= rings; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (r > 0 && Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const arr = this._grid.get(`${ci + di},${cj + dj}`);
          if (!arr) continue;
          for (let k = 0; k < arr.length; k++) {
            const ei = arr[k] >>> 16, i = arr[k] & 0xffff;
            const p = this.edges[ei].pts[i];
            const d2 = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
            if (d2 < bestD2) { bestD2 = d2; bestEi = ei; bestI = i; }
          }
        }
      }
      if (bestEi >= 0 && Math.sqrt(bestD2) < cell * r) break;
    }
    if (bestEi < 0) return null;

    // refine against the two adjacent segments
    const e = this.edges[bestEi];
    let best: RoadHit | null = null, bestD = Math.sqrt(bestD2);
    const pts = e.pts;
    for (let k = -1; k <= 0; k++) {
      const ia = Math.max(0, Math.min(pts.length - 2, bestI + k));
      const a = pts[ia], b = pts[ia + 1];
      const ex = b.x - a.x, ez = b.z - a.z;
      const len2 = ex * ex + ez * ez || 1;
      let t = ((x - a.x) * ex + (z - a.z) * ez) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + ex * t, pz = a.z + ez * t;
      const d = Math.hypot(px - x, pz - z);
      if (d <= bestD) {
        bestD = d;
        best = {
          dist: d, edge: e, i: ia, x: px, z: pz,
          s: a.s + (b.s - a.s) * t,
          y: a.y + (b.y - a.y) * t,
          tx: a.tx + (b.tx - a.tx) * t, tz: a.tz + (b.tz - a.tz) * t,
          side: ((x - px) * ez - (z - pz) * ex) >= 0 ? 1 : -1,
        };
      }
    }
    return best;
  }

  /** Metres to the nearest road centreline (saturating at `maxR`). */
  distance(x: number, z: number, maxR = 400) {
    const n = this.nearest(x, z, maxR);
    return n ? n.dist : maxR;
  }

  // ---------------------------------------------------------------- routing

  /**
   * Shortest drivable path between two world points, snapping each end to the
   * nearest road. Dijkstra over the node graph plus the two partial edges.
   */
  route(ax: number, az: number, bx: number, bz: number): {length:number, seconds:number, pts:Array<{x:number,z:number}>} | null {
    const A = this.nearest(ax, az, 1200), B = this.nearest(bx, bz, 1200);
    if (!A || !B) return null;
    if (A.edge === B.edge) {
      const pts = this._slice(A.edge, A.s, B.s);
      return { length: Math.abs(B.s - A.s), seconds: Math.abs(B.s - A.s) / A.edge.clsDef.speed, pts };
    }

    // cost from each end-node of the start edge
    const start = [
      { node: A.edge.a, cost: A.s / A.edge.clsDef.speed },
      { node: A.edge.b, cost: (A.edge.length - A.s) / A.edge.clsDef.speed },
    ];
    const goal = new Map([
      [B.edge.a, B.s / B.edge.clsDef.speed],
      [B.edge.b, (B.edge.length - B.s) / B.edge.clsDef.speed],
    ]);

    const dist = new Map<string, number>(), prev = new Map<string, { from: string, edge: number }>();
    const open: string[] = [];
    for (const s of start) { dist.set(s.node, s.cost); open.push(s.node); }
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (dist.get(open[i])! < dist.get(open[bi])!) bi = i;
      const cur = open.splice(bi, 1)[0];
      const dc = dist.get(cur)!;
      for (const ei of this.nodes.get(cur)!.edges) {
        const e = this.edges[ei];
        if (e.clsDef.speed <= 0) continue;
        const other = e.a === cur ? e.b : e.a;
        const nd = dc + e.length / e.clsDef.speed;
        if (nd < (dist.has(other) ? dist.get(other)! : Infinity)) {
          dist.set(other, nd);
          prev.set(other, { from: cur, edge: ei });
          if (open.indexOf(other) < 0) open.push(other);
        }
      }
    }

    let bestNode: string | null = null, bestCost = Infinity;
    for (const [n, tail] of goal) {
      const d = dist.has(n) ? dist.get(n)! + tail : Infinity;
      if (d < bestCost) { bestCost = d; bestNode = n; }
    }
    if (!bestNode) return null;

    // walk back
    const chain: number[] = [];
    let n = bestNode;
    while (prev.has(n)) { const p = prev.get(n)!; chain.unshift(p.edge); n = p.from; }

    const pts = [];
    let length = 0;
    const startNode = n;
    pts.push(...this._slice(A.edge, A.s, startNode === A.edge.a ? 0 : A.edge.length));
    length += startNode === A.edge.a ? A.s : A.edge.length - A.s;
    let at = startNode;
    for (const ei of chain) {
      const e = this.edges[ei];
      pts.push(...this._slice(e, at === e.a ? 0 : e.length, at === e.a ? e.length : 0));
      length += e.length;
      at = e.a === at ? e.b : e.a;
    }
    pts.push(...this._slice(B.edge, at === B.edge.a ? 0 : B.edge.length, B.s));
    length += at === B.edge.a ? B.s : B.edge.length - B.s;
    return { length, seconds: bestCost, pts };
  }

  _slice(edge: RoadEdge, s0: number, s1: number) {
    const out = [];
    const fwd = s1 >= s0;
    const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
    for (const p of edge.pts) if (p.s >= lo && p.s <= hi) out.push({ x: p.x, z: p.z, y: p.y });
    if (!fwd) out.reverse();
    return out;
  }

  // ------------------------------------------------------------------ audit

  /**
   * Signed curvature radius at each sample of an edge, metres. `Infinity` on a
   * straight. Used by the drivability test and by the driving AI.
   */
  radii(edge: RoadEdge): number[] {
    const p = edge.pts, out = new Array(p.length).fill(Infinity);
    for (let i = 1; i < p.length - 1; i++) {
      const a = p[i - 1], b = p[i], c = p[i + 1];
      const ab = Math.hypot(b.x - a.x, b.z - a.z);
      const bc = Math.hypot(c.x - b.x, c.z - b.z);
      const ca = Math.hypot(a.x - c.x, a.z - c.z);
      const area = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) * 0.5;
      out[i] = area < 1e-4 ? Infinity : (ab * bc * ca) / (4 * area);
    }
    return out;
  }

  /** Every sample of every edge, flattened, each tagged with its edge. */
  allSamples(): Array<RoadSample & { edge: RoadEdge }> {
    const out: Array<RoadSample & { edge: RoadEdge }> = [];
    for (const e of this.edges) for (const p of e.pts) out.push({ ...p, edge: e });
    return out;
  }

  /** Node ids with exactly one edge — every one needs a turning circle. */
  deadEnds(): string[] {
    const out: string[] = [];
    for (const [id, n] of this.nodes) if (n.edges.length === 1) out.push(id);
    return out;
  }
}

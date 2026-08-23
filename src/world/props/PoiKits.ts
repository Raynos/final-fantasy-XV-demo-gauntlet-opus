import * as THREE from 'three';
import { Rng } from '../../util/Rng.ts';
import { PartBuilder, type Vec3 } from './PartBuilder.ts';
import { worldMap, WORLD, type Poi } from '../map/WorldMap.ts';
import { dressAt, type Dress } from './ZoneDress.ts';
import {
  bag, mergeBag, box, cyl, xform, wallRun, windowUnit, doorUnit, plinth, parapet,
  cornerPier, stringCourse, plantUnit, roofTank, stairHead, bakeTone, toneVariant,
  container, STOREY, CILL, type Opening,
} from './BuildKit.ts';
import {
  woodMaterial, rustMaterial, glowMaterial, canvasClothMaterial,
  signTexture, imperialTexture, runeTexture,
} from './PropMaterials.ts';
import type { Ecology } from '../veg/Ecology.ts';
import type { Game } from '../../game/Game.ts';

/**
 * Built form for the hundred and twenty-four points of interest of Lucis.
 *
 * Before this file the map had 124 named places and almost no geometry at any
 * of them: arriving at the Tomb of the Wise or Wiz Chocobo Post put you on the
 * same bare hillside you had just walked across, with a marker on the compass
 * and nothing to look at. A place has to be *built* before it can be a place.
 *
 * The trade taken here is a strong **per-type kit** rather than 124 unique
 * builds: every royal tomb is the same columned mausoleum, every imperial base
 * the same walled magitek compound — but seeded off its own id, so the column
 * count, the wall breaches, the container layout and the wear differ, and
 * tinted by {@link dressAt} so a Leide tomb is ochre limestone and a Cleigne
 * one is cold grey. That is how the real game does it too.
 *
 * Everything is **streamed and lazy**: a POI is built the first time the
 * camera comes within `BUILD_R`, at one POI per frame, and its group is hidden
 * beyond `DRAW_R`. Building all 124 up front cost 1.4 s of merge work and
 * several hundred permanently resident draw calls for structures a thousand
 * metres behind the player.
 */

const BUILD_R = 1500;
/**
 * How far each kit is worth drawing.
 *
 * A parking bay at a kilometre is four pixels of grey and eight draw calls; a
 * royal tomb or a chimney stack at the same range is the thing that tells you
 * a place exists. So the draw radius is per type, not global — that one change
 * is worth about seventy draw calls in a wide zone shot.
 */
const DRAW_BY_TYPE = {
  town: 2400, imperial: 1700, tomb: 1300, landmark: 1500, outpost: 900,
  reststop: 900, chocobo: 800, menace: 700, dungeon: 750, haven: 800,
  fishing: 650, parking: 600,
};
const DRAW_R = 900;
/** Types the rest of the codebase already builds; we must not double up. */
const SKIP_IDS = new Set(['hammerhead']);

const _v = new THREE.Vector3();

function mat4(pos: Vec3, rot: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
    new THREE.Vector3(scale[0], scale[1], scale[2])
  );
}

/**
 * Flat-coloured PBR material — no map, so it cannot stretch.
 *
 * `vertexColors` is on for all of them and it is what makes flat acceptable.
 * These materials are deliberately mapless above a couple of metres (see
 * {@link poiMaterials}), which used to mean thirty-five buildings drawn from
 * four literal colours. `BuildKit.bakeTone` multiplies in a per-vertex tone --
 * grime at the splash zone, bleach at the parapet, a per-object value and
 * warmth jitter, and a pale lift on every chamfer facet -- so the same four
 * colours carry as much variation as a texture would, and cost one byte-free
 * attribute rather than a sampler. `PartBuilder` synthesises white for any
 * piece that does not bake one, so nothing here can draw black.
 */
function plain(hex: number, rough = 0.85, metal = 0) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, vertexColors: true });
}

/** A slab with a slightly irregular top — reads as cut stone, not a cube. */
function roughBox(seed: number, w: number, h: number, d: number, amp = 0.05) {
  const g = new THREE.BoxGeometry(w, h, d, 2, 1, 2);
  const rng = new Rng(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) + rng.gauss(0, amp) * w * 0.2,
      p.getY(i) + rng.gauss(0, amp) * h * 0.2,
      p.getZ(i) + rng.gauss(0, amp) * d * 0.2);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * The three things every kit builder is handed, named.
 *
 * `B` accumulates the geometry, `site` is the place being built and `ctx` is
 * everything about *where* it is being built that the kit did not work out for
 * itself. Splitting `ctx` out of the site is what lets {@link PoiKits._make} do
 * the seeded, terrain-reading work once for all twelve kits.
 */
export interface KitCtx {
  /** Seeded off the POI id, so a kit varies between places but never between runs. */
  rng: Rng;
  /** The zone dressing recipe here — stone size, tint, litter. */
  dress: Dress;
  /** Facing, radians: down the nearest road if there is one, else seeded. */
  yaw: number;
  /** Deck height the group is placed at; kits that reach the sea need it. */
  base: number;
}

/**
 * What a kit reports back about what it built. Everything is optional because
 * most kits want the defaults; {@link PoiKits._make} is where they resolve.
 */
export interface KitResult {
  /** `false` to never cast shadows. Default `true`. */
  cast?: boolean;
  /** Footprint radius in metres. Default 20. */
  r?: number;
  /**
   * The kit laid its own ground and wants no apron.
   *
   * **Nothing reads this.** Each kit calls {@link PoiKits._apron} for itself,
   * so the flag only records which two kits (`_fishing`, and `_landmark` off
   * the lighthouse branch) deliberately skip it. Left in place because it is
   * true; do not add a consumer without checking those two still want it.
   */
  noApron?: boolean;
}

/** A kit builder. Invoked with `this` bound to the {@link PoiKits} instance. */
export type KitFn = (this: PoiKits, B: PartBuilder, site: PoiSite, ctx: KitCtx) => KitResult;

/**
 * A POI the streamer knows about but has not built yet.
 *
 * `group` is the flag: `null` means "still queued", and it is set exactly once
 * — to an empty group for a site another system already owns.
 */
export interface PoiSite {
  poi: Poi;
  fn: KitFn;
  /**
   * The POI's ground-plane position. Write-only today: `update` measures
   * distance off `poi.x`/`poi.z` directly rather than through this.
   */
  pos: THREE.Vector3;
  group: THREE.Group | null;
}

/**
 * The same site once {@link PoiKits._make} has run it: its group is in the
 * scene and the per-type draw and shadow budgets are resolved.
 *
 * This is the map's own `PoiSpec`/`Poi` split applied to the streamer's queue.
 * `update` reads `draw` and `canCast` for every built site every frame and must
 * never have to guard them, so they are required here and absent above rather
 * than optional on one type that means both things.
 */
export interface BuiltSite extends PoiSite {
  group: THREE.Group;
  canCast: boolean;
  /** Footprint radius the kit reported. Write-only today — nothing reads it. */
  radius: number;
  /** Beyond this range the group is hidden outright. */
  draw: number;
  /** Whether the group is currently casting; unset until the first test. */
  casting?: boolean;
}

/**
 * The shared material set, built once by {@link PoiKits.build}.
 *
 * A function rather than an object literal inside the class so that
 * {@link PoiMats} is the set itself, and a kit that wants a new colour cannot
 * drift from a hand-maintained parallel interface.
 */
export function poiMaterials() {
  return {
    // Anything bigger than a couple of metres gets a *plain* material.
    // PropMaterials' concrete and enamel maps are authored for a 1 m part
    // and every primitive here carries 0..1 box UVs, so on a fourteen metre
    // wall the paint-chip noise stretches into metre-wide grey blotches —
    // which is what made the first pass of Lestallum look like granite
    // chippings. Flat colour at that scale reads far better.
    stone: plain(0x968a76, 0.93),
    dark: plain(0x6b6357, 0.94),
    concrete: plain(0x8d8779, 0.9),
    ground: plain(0x796450, 0.96),
    gravel: plain(0x796f5f, 0.95),
    roof: plain(0x4b5058, 0.72, 0.3),
    wall: plain(0xa2957e, 0.82),
    wall2: plain(0x7b7160, 0.84),
    // Four more renders, and the point of them is that they are not four more
    // greys. The kit's whole wall palette was `a2957e / 7b7160 / 8d8779 /
    // 968a76` -- one hue, one value, four names -- so a settlement read as one
    // flat colour no matter how many buildings it had. These are a Lucian
    // hill-town palette: limewashed ochre, sun-bleached sand, an oxide render
    // and a cool grey-green, far enough apart in hue that two neighbours are
    // visibly different buildings rather than the same building twice.
    render1: plain(0xb08a5c, 0.86),
    render2: plain(0xc3b393, 0.84),
    render3: plain(0x9a6f5e, 0.87),
    render4: plain(0x7d8478, 0.85),
    /** Painted joinery: architraves, copings, window frames. */
    joinery: plain(0xb6a98f, 0.74),
    wood: woodMaterial(0x7d674c),
    plank: woodMaterial(0x5d4c39),
    rust: Object.assign(rustMaterial(0x8f5c39, 0.5), { side: THREE.DoubleSide }),
    steel: plain(0x8f959b, 0.48, 0.7),
    cream: plain(0xc8bfa6, 0.7),
    red: plain(0x8f3a2c, 0.68, 0.1),
    magitek: plain(0x3a4048, 0.62, 0.45),
    cloth: canvasClothMaterial(0x3d4148),
    // Glass, and it is deliberately not black. A pane lit only by the sky, with
    // a 0.06 roughness and nothing behind it, renders as a hole -- which is how
    // the first pass drew every unlit window on a shaded elevation. Dusty glass
    // with a real base value reads as a window at every sun angle, and the
    // reveal's own shadow is still the darkest thing in the opening.
    glass: new THREE.MeshStandardMaterial({ color: 0x4b5560, roughness: 0.3, metalness: 0.3 }),
    lamp: glowMaterial(0xffe6b4, 0.5, 0x141310),
    rune: glowMaterial(0x8fd8ff, 1.4, 0x0b1620),
    arcane: glowMaterial(0xa878ff, 1.2, 0x140b20),
    hot: glowMaterial(0xff5a20, 1.4, 0x1a0703),
    void: new THREE.MeshBasicMaterial({ color: 0x05070a }),
    // The card behind a pane. Not `void`: an unlit 0x05070a quad reads as a
    // hole punched through the world rather than as a room, and a window that
    // is a hole is the same defect as a window that is a decal. A dark warm
    // grey that takes ambient sits a stop or two under the wall and lets the
    // reveal's own shadow still be the darkest thing in the opening.
    interior: plain(0x211f1c, 0.97),
    runeface: new THREE.MeshStandardMaterial({
      map: runeTexture(), transparent: true, roughness: 0.7, metalness: 0,
      emissive: 0x2a5f8a, emissiveIntensity: 0.6, side: THREE.DoubleSide,
    }),
    banner: new THREE.MeshStandardMaterial({
      map: imperialTexture(), roughness: 0.8, metalness: 0, side: THREE.DoubleSide,
    }),
    sign: new THREE.MeshStandardMaterial({
      map: signTexture(0), roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide,
    }),
  };
}

/** Every material a POI kit can ask for. */
export type PoiMats = ReturnType<typeof poiMaterials>;

export class PoiKits {
  built!: BuiltSite[];
  _exclusions!: THREE.Vector3[] | null;
  eco!: Ecology;
  mats!: PoiMats;
  quality!: number;
  root!: THREE.Group;
  scene!: THREE.Scene;
  sites!: PoiSite[];
  constructor(eco: import('../veg/Ecology.ts').Ecology, scene: THREE.Scene, { quality = 1 }: {quality?:number} = {}) {
    this.eco = eco;
    this.scene = scene;
    this.quality = quality;
    this.root = new THREE.Group();
    this.root.name = 'poi_kits';
    this.scene.add(this.root);
    this.sites = [];
    this.built = [];
    this._exclusions = null;
  }

  build() {
    const M = this.mats = poiMaterials();
    for (const [k, m] of Object.entries(M)) if (!m.name) m.name = `poi_${k}`;

    const kits: Record<string, KitFn> = {
      haven: this._haven, parking: this._parking, reststop: this._restStop,
      outpost: this._outpost, town: this._town, tomb: this._tomb,
      imperial: this._imperial, chocobo: this._chocobo, fishing: this._fishing,
      landmark: this._landmark, menace: this._menace, dungeon: this._dungeon,
    };
    for (const p of worldMap.pois) {
      if (SKIP_IDS.has(p.id)) continue;
      const fn = kits[p.type];
      if (!fn) continue;
      this.sites.push({ poi: p, fn, pos: new THREE.Vector3(p.x, 0, p.z), group: null });
    }
    // nearest-to-spawn first so the opening view is already furnished
    this.sites.sort((a, b) => Math.hypot(a.poi.x, a.poi.z) - Math.hypot(b.poi.x, b.poi.z));
  }

  // ------------------------------------------------------------- placement

  /**
   * Deck height for a structure with a footprint of radius `r`.
   *
   * The naive answer — the lowest ground under the footprint — buries a forty
   * metre compound twenty metres deep the moment it lands on a hillside, which
   * is exactly how six of these kits went missing the first time round. So the
   * deck sits at the ring *average*, is never allowed more than `drop` metres
   * below the point the map actually names, and the skirt in {@link _apron}
   * covers whatever gap is left on the downhill side.
   */
  _base(x: number, z: number, r: number, drop = 2.2) {
    const h0 = this.eco.height(x, z);
    let sum = 0, lo = h0;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const h = this.eco.height(x + Math.cos(a) * r * 0.72, z + Math.sin(a) * r * 0.72);
      sum += h; lo = Math.min(lo, h);
    }
    const avg = (sum / 10) * 0.6 + h0 * 0.4;
    return Math.max(Math.min(avg, h0), h0 - drop, lo - 0.2);
  }

  /**
   * A skirt of ground-coloured rock filling the gap between a level platform
   * and a sloping hillside. Cheaper and far more robust than trying to level
   * the heightfield from here — the terrain belongs to another system.
   */
  _apron(B: PartBuilder, r: number, depth: number, seed: number, mat?: THREE.Material) {
    const M = this.mats;
    const rng = new Rng(seed);
    // A tapering, faceted drum rather than a smooth cylinder: on a hillside
    // this is the most visible thing the kit builds, and a clean extruded
    // circle reads as a cake stand. Sixteen facets with jittered radii and a
    // batter on the face read as cut-and-fill.
    const g = new THREE.CylinderGeometry(r, r * 1.12, depth, 16, 3);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + rng.gauss(0, 0.075);
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    B.add(mat || M.ground, g, mat4([0, -depth * 0.5 + 0.06, 0]));
    // spoil at the foot of the cut, so the drum does not meet the hill on a line
    const n = Math.round(10 + r * 0.55);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.gauss(0, 0.2);
      const d = r * rng.range(0.98, 1.22);
      const sc = rng.range(0.5, 1.9) * (0.7 + r * 0.03);
      B.add(M.dark, new THREE.DodecahedronGeometry(sc, 0),
        mat4([Math.cos(a) * d, -rng.range(0.2, 1.4) - sc * 0.2, Math.sin(a) * d],
          [rng.gauss(0, 0.5), rng.next() * 6, rng.gauss(0, 0.5)],
          [1, rng.range(0.55, 0.9), 1]));
    }
  }

  /** Which way the structure faces: down the nearest road, else seeded. */
  _yaw(p: Poi, rng: Rng) {
    const road = this.eco.terrain && this.eco.terrain.map && this.eco.terrain.map.roadGraph;
    if (road) {
      let bestD = 90, bestA: number | null = null;
      for (const e of road.edges) {
        for (let i = 0; i < e.pts.length; i += 4) {
          const q = e.pts[i];
          const d = Math.hypot(q.x - p.x, q.z - p.z);
          if (d < bestD) { bestD = d; bestA = Math.atan2(p.x - q.x, p.z - q.z); }
        }
      }
      if (bestA !== null) return bestA;
    }
    return rng.next() * Math.PI * 2;
  }

  // ----------------------------------------------------------------- kits

  /**
   * A haven: the rune-marked camp rock. Raised shelf, a ring of glyphs the
   * player can see from a distance at night, a fire ring and camp stones.
   */
  _haven(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, dress } = ctx;
    const r = 9.6;
    // A haven is a *raised* shelf you climb onto, not a disc painted on the
    // ground: the rune plate stands a metre and a half proud so it catches the
    // light and reads as a destination from the far side of the valley.
    const lift = 1.6;
    this._apron(B, r, 9.5, s.poi.id.length * 7 + 1, M.stone);
    const plate = new THREE.CylinderGeometry(r, r * 0.97, 1.5, 15, 1);
    const p = plate.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setX(i, p.getX(i) * (1 + rng.gauss(0, 0.05)));
      p.setZ(i, p.getZ(i) * (1 + rng.gauss(0, 0.05)));
    }
    plate.computeVertexNormals();
    B.add(M.stone, plate, mat4([0, lift - 0.15, 0]));
    const deck = lift + 0.6;
    // glyph ring, flat on the deck
    const ring = new THREE.RingGeometry(r * 0.44, r * 0.88, 44);
    ring.rotateX(-Math.PI / 2);
    B.add(M.runeface, ring, mat4([0, deck + 0.02, 0]));
    const inner = new THREE.RingGeometry(r * 0.18, r * 0.29, 30);
    inner.rotateX(-Math.PI / 2);
    B.add(M.rune, inner, mat4([0, deck + 0.03, 0]));
    // fire ring: stones round a bed of embers
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      B.add(M.dark, new THREE.DodecahedronGeometry(0.26 * rng.range(0.7, 1.3), 0),
        mat4([Math.cos(a) * 1.15, deck + 0.1, Math.sin(a) * 1.15], [rng.next(), rng.next(), 0]));
    }
    B.add(M.hot, new THREE.CircleGeometry(0.85, 14).rotateX(-Math.PI / 2), mat4([0, deck + 0.05, 0]));
    for (let i = 0; i < 4; i++) {
      const a = rng.next() * 6.28;
      B.add(M.plank, new THREE.CylinderGeometry(0.06, 0.08, 1.4, 5).rotateZ(1.15),
        mat4([Math.cos(a) * 0.4, deck + 0.28, Math.sin(a) * 0.4], [0, a, 0]));
    }
    // a tent, so the camp reads as a camp and not as a magic circle
    const tent = new THREE.CylinderGeometry(1.5, 1.5, 3.0, 3, 1, false)
      .rotateZ(Math.PI / 2).rotateY(rng.next() * 3);
    B.add(M.cloth, tent, mat4([-r * 0.42, deck + 0.85, r * 0.3]));
    // seating boulders and a lantern pole
    for (let i = 0; i < 6; i++) {
      const a = rng.next() * 6.28, d = r * rng.range(0.55, 0.94);
      const sc = rng.range(0.55, 1.3) * dress.rockS;
      B.add(M.stone, new THREE.DodecahedronGeometry(sc, 0),
        mat4([Math.cos(a) * d, deck + sc * 0.3, Math.sin(a) * d],
          [rng.gauss(0, 0.3), rng.next() * 6, rng.gauss(0, 0.3)]));
    }
    B.add(M.steel, new THREE.CylinderGeometry(0.05, 0.06, 2.6, 6), mat4([r * 0.7, deck + 1.3, -r * 0.35]));
    B.add(M.lamp, new THREE.BoxGeometry(0.26, 0.34, 0.26), mat4([r * 0.7, deck + 2.7, -r * 0.35]));
    // a boulder pile against one flank so the shelf grows out of the hill
    for (let i = 0; i < 7; i++) {
      const a = rng.range(2.0, 4.2), d = r * rng.range(1.0, 1.5);
      const sc = rng.range(0.9, 2.6) * dress.rockS;
      B.add(M.stone, new THREE.DodecahedronGeometry(sc, 0),
        mat4([Math.cos(a) * d, -0.2 + sc * 0.2, Math.sin(a) * d],
          [rng.gauss(0, 0.4), rng.next() * 6, rng.gauss(0, 0.4)]));
    }
    return { cast: true, r: r + 4 };
  }

  /** A gravel pull-in: apron, wheel stops, a barrier on the drop side, signs. */
  _parking(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const w = 22, d = 13;
    const world = mat4([0, 0, 0], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 13.5, 6.0, 91);
    put(M.gravel, new THREE.BoxGeometry(w, 0.26, d), [0, 0.13, 0]);
    // bay markings as thin raised strips: paint on a procedural world is a
    // texture we would have to author, geometry is free and reads the same
    for (let i = -2; i <= 2; i++) {
      put(M.cream, new THREE.BoxGeometry(0.16, 0.04, d * 0.62), [i * 3.4, 0.27, -d * 0.12]);
    }
    for (let i = -3; i <= 3; i++) {
      put(M.gravel, new THREE.BoxGeometry(1.5, 0.22, 0.3), [i * 3.0, 0.36, d * 0.34]);
    }
    // post-and-rope barrier along the outer edge
    for (let i = -4; i <= 4; i++) {
      put(M.plank, new THREE.CylinderGeometry(0.08, 0.09, 1.0, 6), [i * 2.6, 0.72, -d * 0.5]);
      if (i < 4) put(M.plank, new THREE.BoxGeometry(2.6, 0.09, 0.06), [i * 2.6 + 1.3, 1.05, -d * 0.5]);
    }
    // signpost, bin, and a battered vending machine at half of them
    put(M.steel, new THREE.CylinderGeometry(0.06, 0.07, 2.5, 6), [w * 0.42, 1.25, d * 0.34]);
    put(M.sign, new THREE.PlaneGeometry(1.5, 0.72), [w * 0.42, 2.35, d * 0.34], [0, 0, 0]);
    put(M.rust, new THREE.CylinderGeometry(0.32, 0.28, 0.9, 10), [w * 0.33, 0.6, d * 0.2]);
    if (rng.next() < 0.55) {
      put(M.red, new THREE.BoxGeometry(0.9, 1.9, 0.7), [-w * 0.42, 1.1, d * 0.28]);
      put(M.lamp, new THREE.BoxGeometry(0.72, 1.2, 0.05), [-w * 0.42, 1.35, d * 0.64]);
    }
    return { cast: true, r: 15 };
  }

  /** Fuel canopy, shop and a pylon sign — the lit thing on a night road. */
  _restStop(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 19, 8.0, 55);
    put(M.gravel, new THREE.BoxGeometry(30, 0.3, 22), [0, 0.14, 0]);
    // canopy
    for (const sx of [-6.5, 6.5]) {
      for (const sz of [-4.5, 4.5]) {
        put(M.steel, new THREE.BoxGeometry(0.4, 5.2, 0.4), [sx, 2.7, sz]);
      }
    }
    put(M.cream, new THREE.BoxGeometry(17, 0.7, 12), [0, 5.5, 0]);
    put(M.red, new THREE.BoxGeometry(17.4, 0.5, 12.4), [0, 5.05, 0]);
    put(M.lamp, new THREE.BoxGeometry(15, 0.08, 10), [0, 5.1, 0]);
    // pumps
    for (const sx of [-3.2, 3.2]) {
      put(M.cream, new THREE.BoxGeometry(1.1, 1.7, 0.8), [sx, 0.95, 0]);
      put(M.steel, new THREE.BoxGeometry(1.3, 0.16, 1.0), [sx, 1.85, 0]);
      put(M.glass, new THREE.BoxGeometry(0.7, 0.5, 0.05), [sx, 1.35, 0.42]);
    }
    // shop: a real hut with a door you can see into, not a box with two decals
    this._hut(B, world, { w: 11, d: 7, x: -3, z: -12, rng, base: 0.15 });
    // pylon sign
    put(M.steel, new THREE.BoxGeometry(0.5, 8.5, 0.5), [13.5, 4.4, 6]);
    put(M.sign, new THREE.PlaneGeometry(4.2, 2.4), [13.5, 9.4, 6.3]);
    put(M.cream, new THREE.BoxGeometry(4.4, 2.6, 0.4), [13.5, 9.4, 6]);
    // picnic tables and drums
    for (let i = 0; i < 3; i++) {
      const px = rng.range(-12, 12), pz = rng.range(4, 9);
      put(M.plank, new THREE.BoxGeometry(2.0, 0.12, 0.9), [px, 0.85, pz], [0, rng.next() * 3, 0]);
      put(M.rust, new THREE.CylinderGeometry(0.32, 0.32, 0.9, 10), [px + 2.4, 0.6, pz]);
    }
    return { cast: true, r: 22 };
  }

  /** A wayside outpost: prefab huts, a pump, containers and a comms mast. */
  _outpost(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 14, 8.0, 71);
    put(M.gravel, new THREE.BoxGeometry(22, 0.3, 16), [0, 0.14, 0]);
    const huts = 2 + Math.floor(rng.next() * 2);
    for (let i = 0; i < huts; i++) {
      const px = -8 + i * 8.5 + rng.gauss(0, 0.6), pz = -6 + rng.gauss(0, 1.4);
      const w = rng.range(5, 8), d = rng.range(4, 6);
      this._hut(B, world, { w, d, x: px, z: pz, rng, base: 0.3 });
    }
    // fuel pump and a canopy over it
    put(M.cream, new THREE.BoxGeometry(1.1, 1.7, 0.8), [7, 1.15, 4]);
    put(M.steel, new THREE.BoxGeometry(0.3, 3.6, 0.3), [5.6, 2.1, 4]);
    put(M.steel, new THREE.BoxGeometry(0.3, 3.6, 0.3), [8.4, 2.1, 4]);
    put(M.roof, new THREE.BoxGeometry(4.2, 0.28, 3.2), [7, 3.9, 4]);
    // containers
    this._containers(B, world, { n: 3, x: -9, z: 6, rng, stack: true });
    // comms mast: four legs and cross-bracing, tapering
    const H = 16;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI * 0.5 + 0.78;
      put(M.steel, new THREE.CylinderGeometry(0.09, 0.11, H, 5),
        [11 + Math.cos(a) * 0.8, H * 0.5 + 0.3, -8 + Math.sin(a) * 0.8],
        [Math.sin(a) * 0.035, 0, -Math.cos(a) * 0.035]);
    }
    for (let i = 0; i < 6; i++) {
      put(M.steel, new THREE.TorusGeometry(1.05 - i * 0.06, 0.045, 4, 4).rotateX(Math.PI / 2),
        [11, 1.6 + i * 2.5, -8]);
    }
    put(M.lamp, new THREE.SphereGeometry(0.22, 7, 6), [11, H + 0.6, -8]);
    // oil drums
    for (let i = 0; i < 5; i++) {
      put(M.rust, new THREE.CylinderGeometry(0.32, 0.32, 0.92, 10),
        [rng.range(-11, 11), 0.76, rng.range(7, 9.5)], [0, rng.next() * 3, 0]);
    }
    return { cast: true, r: 20 };
  }

  /**
   * One building. The thing the POI kits did not have.
   *
   * Before this, a settlement block was a `BoxGeometry` with 3% vertex noise, a
   * parapet made of two more boxes, one 2.4 m cube on the roof for plant, and
   * emissive quads sitting 70 mm proud of the wall for windows. Captured
   * `poi_fishing` and read it: they were flat dark slabs with a lighter top,
   * and they were the worst thing in the frame by a wide margin in a shot where
   * the terrain, the sky and the trees are not.
   *
   * What is different here is entirely geometric, because the defect was:
   *
   * - **Every wall is a run of real thickness with the openings punched
   *   through it** ({@link wallRun}), so a window is a hole with a 280 mm
   *   reveal, a cill that throws a shadow, and a lintel — not a bright quad
   *   floating on the wall plane.
   * - **The block stands on a plinth** and is finished with a parapet whose
   *   coping has a drip lip, so it neither runs straight into the ground nor
   *   ends at a single hard edge against the sky.
   * - **The four silhouette corners are piers**, 340 mm square and struck with
   *   a 75 mm chamfer, which is the only size of arris that survives the
   *   projection at the range a town is seen from.
   * - **Roof furniture is cased plant, a stair head and a tank**, not a cube.
   * - **Tone is baked per vertex** ({@link bakeTone}), so the four flat wall
   *   colours become thirty-odd buildings that differ in value, warmth, how
   *   dirty their splash zone is and how bleached their parapets are.
   *
   * Built in a local frame with the ground at y=0 and `faceZ` naming which of
   * the two long elevations is the street, then merged per role and placed once.
   * Merging in local space is what keeps a whole block to one geometry per
   * material instead of one per box.
   */
  _block(this: PoiKits, B: PartBuilder, world: THREE.Matrix4, o: {
    w: number; d: number; storeys: number; x: number; z: number; ry?: number;
    shell: THREE.Material; rng: Rng; faceZ?: 1 | -1; lit?: number; base?: number;
  }) {
    const M = this.mats;
    const { w, d, storeys, x, z, ry = 0, shell, rng, faceZ = 1, lit = 0.3, base = 0.5 } = o;
    const b = bag();
    const wallT = 0.3;
    const H = storeys * STOREY;
    // The plinth stands ON the pad, not inside it. Built from y=0 with the pad
    // top at `base`, all three of its courses were buried and the walls met the
    // ground on a line again -- the exact defect the course exists to fix.
    const plinthH = 0.5;
    const y0 = base + plinthH;
    const tv = toneVariant(rng);

    plinth(b.shell, { w, d, h: plinthH, proud: 0.15, y: base });

    // Elevations. Each storey is its own run so the openings land on the floor
    // they belong to, and the two long faces carry the window rhythm while the
    // ends get half as many -- which is how a terrace block is actually
    // fenestrated, and it halves the cost of the faces nobody stands in front of.
    const bays = (len: number, spacing: number) => Math.max(1, Math.round(len / spacing) - 1);
    const faces: { len: number; ry: number; ox: number; oz: number; n: number; street: boolean }[] = [
      { len: w, ry: 0, ox: 0, oz: 1, n: bays(w, 3.0), street: faceZ > 0 },
      { len: w, ry: Math.PI, ox: 0, oz: -1, n: bays(w, 3.0), street: faceZ < 0 },
      { len: d, ry: Math.PI / 2, ox: 1, oz: 0, n: bays(d, 4.4), street: false },
      { len: d, ry: -Math.PI / 2, ox: -1, oz: 0, n: bays(d, 4.4), street: false },
    ];
    const half = { x: w / 2 - wallT / 2, z: d / 2 - wallT / 2 };
    for (const f of faces) {
      const runLen = f.ox ? d - wallT * 2 : w;
      for (let st = 0; st < storeys; st++) {
        const local = bag();
        const openings: Opening[] = [];
        const ground = st === 0;
        // Run-local: `wallRun` and the window units are built with the storey's
        // own floor at y=0 and the whole run is translated into place below.
        // Adding `st * STOREY` here as well put the top storey's windows above
        // the parapet and left the wall solid, because the opening no longer
        // fell inside the run `wallRun` was punching.
        const wy = ground ? CILL + 0.28 : CILL;
        const wh = ground ? 1.75 : 1.5;
        for (let i = 0; i < f.n; i++) {
          const bx = -runLen / 2 + (runLen * (i + 1)) / (f.n + 1);
          // A shopfront door in the middle bay of the street elevation, ground
          // floor only: the one opening a person walks through, so it is the one
          // that gets the hood, the threshold and the step.
          if (ground && f.street && f.n >= 3 && i === (f.n - 1) >> 1) {
            openings.push(doorUnit(local, { x: bx, wallT, w: 1.35, h: 2.25 }));
            continue;
          }
          openings.push(windowUnit(local, {
            x: bx, y: wy, w: ground ? 1.35 : 1.15, h: wh, wallT,
            lit: rng.next() < lit, plain: !ground,
          }));
        }
        for (const g of wallRun(runLen, STOREY, wallT, openings)) local.shell.push(g);
        const px = f.ox * half.x, pz = f.oz * half.z;
        for (const k of Object.keys(local)) {
          for (const g of local[k]) b[k].push(xform(g, { ry: f.ry, x: px, y: y0 + st * STOREY, z: pz }));
        }
      }
    }

    // String course at every floor line above the first: the single cheapest way
    // to stop a multi-storey facade reading as one flat rectangle.
    // In the shell material, not a contrasting one: a projecting course reads by
    // the shadow it throws, and painting it a different colour turns the one
    // horizontal that should be architecture into a racing stripe.
    for (let st = 1; st < storeys; st++) stringCourse(b.shell, { w, d, y: y0 + st * STOREY - 0.1 });
    cornerPier(b.shell, { w: w + 0.7, d: d + 0.7, y0: y0 + 0.12, y1: y0 + H, sec: 0.42, proud: 0.05, arris: 0.09 });

    // Roof: a deck INSIDE the parapet, then furniture that is not a cube. The
    // deck has to clear the parapet's inner face and sit above the wall head,
    // or it shows on the elevation as a dark band between the wall and the
    // coping -- which is what the first pass drew.
    const par = 0.19;
    b.roof.push(box(w - par * 2 - 0.06, 0.2, d - par * 2 - 0.06, { y: y0 + H + 0.1 }));
    parapet(b.shell, b.trim, { w, d, y: y0 + H, t: par, h: 0.62 });
    const ry0 = y0 + H + 0.2;
    const spot = () => [rng.range(-1, 1) * (w / 2 - 2.0), rng.range(-1, 1) * (d / 2 - 1.8)];
    {
      const [ax, az] = spot();
      plantUnit(b, { x: ax, y: ry0, z: az, w: rng.range(1.6, 2.4), h: rng.range(1.0, 1.5), d: rng.range(1.3, 1.9), ry: rng.range(0, 3.1) });
    }
    if (rng.next() < 0.55) { const [ax, az] = spot(); stairHead(b, { x: ax, y: ry0, z: az, ry: rng.range(0, 3.1) }); }
    if (rng.next() < 0.45) { const [ax, az] = spot(); roofTank(b, { x: ax, y: ry0, z: az, r: rng.range(0.8, 1.2), h: rng.range(1.2, 1.7) }); }
    // Aerials: two thin verticals off the parapet. Free silhouette.
    for (let i = 0; i < 2; i++) {
      const [ax, az] = spot();
      b.metal.push(cyl(0.035, rng.range(1.6, 3.2), 4, { x: ax, y: ry0 + rng.range(0.8, 1.6), z: az }));
    }

    // Scuppers and downpipes. Two per building: they are where the vertical
    // staining on a real facade comes from, and a 110 mm pipe standing 70 mm off
    // the wall is a hard vertical line and its own shadow all the way down --
    // the cheapest thing that stops an elevation being a plane.
    for (const sx of [-w * 0.34, w * 0.36]) {
      const zf = faceZ * (d / 2 + 0.09);
      b.metal.push(cyl(0.055, H + 0.4, 6, { x: sx, y: base + (H + 0.4) / 2, z: zf }));
      b.metal.push(xform(cyl(0.05, 0.42, 6), { rx: Math.PI / 2, x: sx, y: y0 + H + 0.32, z: zf + faceZ * 0.2 }));
      for (let k = 0; k < storeys; k++) b.metal.push(box(0.18, 0.05, 0.05, { x: sx, y: y0 + 0.9 + k * STOREY, z: zf - faceZ * 0.03 }));
    }

    // Ground-floor awning on the street elevation: canvas on two struts, tilted.
    if (rng.next() < 0.6) {
      const aw = w * 0.62, zf = faceZ * (d / 2 + 0.95);
      b.cloth.push(box(aw, 0.09, 2.0, { y: y0 + 2.95, z: zf, rx: faceZ * -0.19 }));
      b.cloth.push(box(aw, 0.34, 0.06, { y: y0 + 2.72, z: zf + faceZ * 0.95 }));
      for (const sx of [-1, 1]) {
        b.metal.push(cyl(0.035, 2.6, 5, { x: sx * aw * 0.46, y: y0 + 1.5, z: zf + faceZ * 0.85 }));
      }
    }

    const merged = mergeBag(b);
    const mats: Record<string, THREE.Material> = {
      shell, shell2: M.concrete, trim: M.joinery, metal: M.steel, glass: M.glass,
      glow: M.lamp, dark: M.interior, roof: M.roof, wood: M.plank, cloth: M.red,
    };
    const place = world.clone().multiply(mat4([x, 0, z], [0, ry, 0]));
    for (const [role, g] of Object.entries(merged)) {
      // Tone is baked on the finished, merged piece and measured against the
      // building's own extent -- the plan's meta-lesson, applied: enforce on the
      // shipped mesh, not on the recipe. Emissive and glass roles opt out; a
      // grime gradient on a lit window is nonsense.
      if (role !== 'glow' && role !== 'glass' && role !== 'dark') {
        bakeTone(g, { y0: base, y1: y0 + H, grime: tv.grime, jitter: tv.jitter, tint: tv.tint, streak: tv.streak });
      }
      B.add(mats[role] ?? shell, g, place);
    }
  }

  /**
   * A short row of shipping containers, optionally stacked.
   *
   * These were three 6.1 x 2.6 x 2.5 boxes wearing `rustMaterial` -- a map
   * authored for a one-metre part, stretched over six metres, which renders as
   * lava. `poiMaterials` documents that exact failure for walls; nothing had
   * applied it to props. {@link container} builds the corrugations instead, and
   * they are the whole read.
   */
  _containers(this: PoiKits, B: PartBuilder, world: THREE.Matrix4, o: {
    n: number; x: number; z: number; rng: Rng; stack?: boolean; y?: number;
  }) {
    const M = this.mats;
    const { n, x, z, rng, stack = false, y = 0 } = o;
    const paint = [M.red, M.render3, M.render4, M.wall2, M.steel];
    for (let i = 0; i < n; i++) {
      const b = bag();
      container(b, {});
      const merged = mergeBag(b);
      const tv = toneVariant(rng, { valueAmp: 0.2, warmAmp: 0.05 });
      const shell = paint[Math.floor(rng.next() * paint.length)];
      const place = world.clone().multiply(mat4(
        [x + rng.gauss(0, 1.2), y + (stack && i === n - 1 ? 2.62 : 0), z + i * 0.45],
        [0, rng.gauss(0, 0.09), 0]));
      for (const [role, g] of Object.entries(merged)) {
        bakeTone(g, { y0: 0, y1: 2.59, grime: tv.grime * 0.92, jitter: tv.jitter, tint: tv.tint, streak: tv.streak * 1.6 });
        B.add(role === 'metal' ? M.steel : role === 'trim' ? shell : shell, g, place);
      }
    }
  }

  /**
   * A single-storey hut: the outpost's, the reststop's, the workshop's.
   *
   * The same three defects {@link PoiKits._block} fixes, at a scale where they
   * are *worse* rather than better, because an outpost hut is something a
   * player stands two metres from. It gets a monopitch roof rather than a flat
   * one -- a slab lid on a box is the tell that survives every other fix -- with
   * a real eaves overhang, a fascia and a rafter row under it, so the roof
   * throws a hard shadow line across the elevation instead of ending on the wall.
   */
  _hut(this: PoiKits, B: PartBuilder, world: THREE.Matrix4, o: {
    w: number; d: number; x: number; z: number; ry?: number; rng: Rng; base?: number;
  }) {
    const M = this.mats;
    const { w, d, x, z, ry = 0, rng, base = 0 } = o;
    const b = bag();
    const wallT = 0.22;
    const h = 2.85, rise = 0.55;               // monopitch, falling toward -Z
    const plinthH = 0.28;
    const y0 = base + plinthH;
    const tv = toneVariant(rng, { valueAmp: 0.2, warmAmp: 0.07 });
    plinth(b.shell, { w, d, h: plinthH, proud: 0.11, y: base });

    // Front elevation: a door, and a window beside it.
    const front = bag();
    const openings: Opening[] = [
      doorUnit(front, { x: w * 0.28, wallT, w: 0.95, h: 2.05 }),
      windowUnit(front, { x: -w * 0.2, y: 1.0, w: Math.min(1.5, w * 0.32), h: 1.1, wallT, lit: rng.next() < 0.3 }),
    ];
    for (const g of wallRun(w, h + rise, wallT, openings)) front.shell.push(g);
    for (const k of Object.keys(front)) for (const g of front[k]) b[k].push(xform(g, { y: y0, z: d / 2 - wallT / 2 }));
    for (const g of wallRun(w, h, wallT, [])) b.shell.push(xform(g, { y: y0, z: -d / 2 + wallT / 2 }));
    // The two ends step up under the pitch: three short runs of rising height
    // rather than a trapezoid, which keeps every piece a chamfered box.
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const zc = -d / 2 + (d * (k + 0.5)) / 3;
        const hk = h + rise * ((k + 0.5) / 3);
        b.shell.push(xform(box(d / 3, hk, wallT, { y: hk / 2 }), { ry: Math.PI / 2, x: sx * (w / 2 - wallT / 2), y: y0, z: zc }));
      }
    }
    // Roof: deck, fascia, and a rafter row showing under the eaves.
    const pitch = Math.atan2(rise, d);
    const rl = Math.hypot(d + 0.8, rise);
    b.roof.push(xform(box(w + 0.9, 0.16, rl), { rx: -pitch, x: 0, y: y0 + h + rise / 2 + 0.08, z: 0 }));
    b.trim.push(box(w + 1.0, 0.16, 0.1, { x: 0, y: y0 + h + rise - 0.02, z: d / 2 + 0.42 }));
    const nr = Math.max(3, Math.round(w / 0.9));
    for (let i = 0; i < nr; i++) {
      const rx2 = -w / 2 + (w * (i + 0.5)) / nr;
      b.wood.push(box(0.07, 0.14, 0.5, { x: rx2, y: y0 + h + rise - 0.12, z: d / 2 + 0.2 }));
    }
    b.metal.push(box(0.5, 0.2, 0.12, { x: w * 0.28, y: y0 + 2.5, z: d / 2 + 0.16 }));

    const merged = mergeBag(b);
    const mats: Record<string, THREE.Material> = {
      shell: M.cream, shell2: M.concrete, trim: M.joinery, metal: M.steel, glass: M.glass,
      glow: M.lamp, dark: M.interior, roof: M.roof, wood: M.plank, cloth: M.red,
    };
    const place = world.clone().multiply(mat4([x, 0, z], [0, ry, 0]));
    for (const [role, g] of Object.entries(merged)) {
      if (role !== 'glow' && role !== 'glass' && role !== 'dark') {
        bakeTone(g, { y0: base, y1: y0 + h + rise, grime: tv.grime, jitter: tv.jitter, tint: tv.tint, streak: tv.streak });
      }
      B.add(mats[role] ?? M.cream, g, place);
    }
  }

  /**
   * A settlement, built as a *skyline* rather than as architecture.
   *
   * Lestallum and Galdin Quay are seen from a kilometre away far more often
   * than they are walked through, so what matters is the massing: a tight
   * block plan on a levelled terrace, flat roofs at four or five distinct
   * heights, parapets to break the silhouette, and one vertical — a chimney
   * or a water tower — tall enough to name the place on the horizon.
   */
  _town(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 52, 18, 33);
    put(M.gravel, new THREE.CylinderGeometry(51, 52, 0.6, 26), [0, 0.2, 0]);
    // a street grid rather than a scatter: blocks share walls and align
    const walls = [M.wall, M.wall2, M.stone, M.render1, M.render2, M.render3, M.render4];
    for (let gx = -2; gx <= 2; gx++) {
      for (let gz = -2; gz <= 2; gz++) {
        if (gx === 0 && gz === 0) continue;                 // the square
        const jx = gx * 17 + rng.gauss(0, 1.4), jz = gz * 15 + rng.gauss(0, 1.4);
        if (Math.hypot(jx, jz) > 46) continue;
        const blocks = 1 + (rng.next() < 0.5 ? 1 : 0);
        for (let b = 0; b < blocks; b++) {
          const w = rng.range(9, 14), dp = rng.range(8, 12);
          // Storeys, not a continuous height: a building is a stack of floors
          // and every horizontal on it lands on a multiple of STOREY. The
          // continuous `range(4.5, 9)` this replaces is why the old blocks had
          // window rows that did not agree with their own parapets.
          const storeys = 1 + Math.floor(rng.next() * 2) + (Math.hypot(jx, jz) < 22 ? Math.floor(rng.next() * 2) : 0);
          const px = jx + (b ? rng.range(-5, 5) : 0), pz = jz + (b ? rng.range(-5, 5) : 0);
          this._block(B, world, {
            w, d: dp, storeys, x: px, z: pz, ry: rng.range(-0.06, 0.06),
            shell: walls[Math.floor(rng.next() * walls.length)],
            rng, faceZ: pz > 0 ? -1 : 1, lit: 0.35,
          });
        }
      }
    }
    // the square: a paved plaza, market stalls and strung lights
    put(M.concrete, new THREE.CylinderGeometry(11, 11, 0.35, 22), [0, 0.5, 0]);
    // Market stalls. These were a single 3.0 x 0.12 x 2.4 box of dark canvas on
    // two poles, which at eye level in the square reads as a flat black slab
    // hanging in the air -- and the square is the one place in a settlement the
    // player actually stands still. A stall is a *gable*: two sloped panels
    // meeting at a ridge, with a valance hanging off the eaves, four legs, a
    // counter you could put something on, and crates under it.
    const stallCloth = [M.red, M.render3, M.render1, M.wall2];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = bag();
      const cw = 3.2, cd = 2.4, top = 2.55, eave = 2.15;
      const slope = Math.atan2(top - eave, cd / 2);
      const panel = Math.hypot(cd / 2, top - eave);
      for (const sz of [-1, 1]) {
        b.cloth.push(box(cw, 0.07, panel, { y: (top + eave) / 2, z: sz * cd / 4, rx: sz * slope }));
        // Valance: the scalloped strip that hangs off the eaves and is most of
        // what makes a market stall read as one from twenty metres.
        b.cloth.push(box(cw + 0.1, 0.34, 0.05, { y: eave - 0.15, z: sz * (cd / 2 + 0.02) }));
      }
      b.wood.push(box(0.09, 0.09, cd + 0.2, { y: top }));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        b.wood.push(cyl(0.05, eave, 5, { x: sx * (cw / 2 - 0.12), y: eave / 2, z: sz * (cd / 2 - 0.12) }));
      }
      b.wood.push(box(cw - 0.2, 0.09, 0.75, { y: 0.94, z: -cd * 0.18 }));
      b.wood.push(box(cw - 0.3, 0.85, 0.06, { y: 0.47, z: -cd * 0.18 - 0.35 }));
      for (let k = 0; k < 3; k++) {
        b.wood.push(box(0.5, 0.42, 0.4, { x: -cw / 2 + 0.45 + k * 0.85, y: 0.21, z: cd * 0.2 }));
      }
      const merged = mergeBag(b);
      const cloth = stallCloth[i % stallCloth.length];
      const tv = toneVariant(rng, { valueAmp: 0.16, warmAmp: 0.05 });
      const place = world.clone().multiply(mat4([Math.cos(a) * 7.5, 0.5, Math.sin(a) * 7.5], [0, -a, 0]));
      for (const [role, g] of Object.entries(merged)) {
        bakeTone(g, { y0: 0, y1: top, grime: tv.grime + 0.1, jitter: tv.jitter, tint: tv.tint, streak: 0 });
        B.add(role === 'cloth' ? cloth : M.plank, g, place);
      }
      put(M.lamp, new THREE.SphereGeometry(0.16, 6, 5), [Math.cos(a) * 10.5, 4.4, Math.sin(a) * 10.5]);
    }
    // the vertical: a chimney stack and a water tower
    put(M.wall2, new THREE.CylinderGeometry(2.2, 3.0, 34, 14), [22, 17.5, -18]);
    put(M.roof, new THREE.CylinderGeometry(2.6, 2.6, 1.2, 14), [22, 34.6, -18]);
    put(M.hot, new THREE.SphereGeometry(0.34, 7, 6), [22, 35.4, -18]);
    put(M.steel, new THREE.CylinderGeometry(3.2, 3.6, 4.4, 12), [-20, 16.4, 14]);
    put(M.roof, new THREE.ConeGeometry(3.7, 1.9, 12), [-20, 19.5, 14]);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI * 0.5 + 0.78;
      put(M.steel, new THREE.CylinderGeometry(0.14, 0.18, 14.4, 5),
        [-20 + Math.cos(a) * 2.5, 7.4, 14 + Math.sin(a) * 2.5],
        [Math.sin(a) * 0.11, 0, -Math.cos(a) * 0.11]);
    }
    return { cast: false, r: 58 };
  }

  /**
   * A royal tomb. Stepped plinth, a colonnade, a heavy lintel and the arm
   * itself hanging over the sarcophagus. This is the kit that most has to read
   * from a kilometre away — a tomb is a landmark before it is a room.
   */
  _tomb(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    // 1.4x: a royal tomb has to hold its own against a 200 m mesa behind it
    const world = mat4([0, 0, 0], [0, yaw, 0], [1.4, 1.4, 1.4]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 13, 11, 17);
    // three steps
    for (let i = 0; i < 3; i++) {
      const w = 15 - i * 1.6, d = 12 - i * 1.6;
      put(M.stone, roughBox(i * 3 + 2, w, 0.55, d, 0.03), [0, 0.28 + i * 0.55, 0]);
    }
    const deck = 1.65;
    // colonnade
    const cols = 6;
    for (let i = 0; i < cols; i++) {
      for (const sz of [-1, 1]) {
        const px = (i / (cols - 1) - 0.5) * 9.6;
        const broken = rng.next() < 0.18;
        const h = broken ? rng.range(1.6, 4.2) : 5.4;
        put(M.stone, new THREE.CylinderGeometry(0.42, 0.5, h, 10), [px, deck + h * 0.5, sz * 3.6]);
        if (!broken) {
          put(M.stone, new THREE.BoxGeometry(1.25, 0.4, 1.25), [px, deck + h + 0.2, sz * 3.6]);
        }
      }
    }
    // cella walls and roof
    put(M.stone, roughBox(9, 8.2, 4.6, 4.4, 0.03), [0, deck + 2.3, 0]);
    put(M.void, new THREE.BoxGeometry(2.6, 3.4, 0.2), [0, deck + 1.7, 2.25]);
    put(M.stone, roughBox(11, 12.6, 0.85, 9.4, 0.025), [0, deck + 6.2, 0]);
    put(M.stone, roughBox(12, 11.0, 0.6, 8.0, 0.025), [0, deck + 6.85, 0]);
    // pediment
    put(M.stone, new THREE.CylinderGeometry(0.01, 2.4, 12.4, 3).rotateZ(Math.PI / 2),
      [0, deck + 8.0, 0], [Math.PI / 2, 0, 0]);
    // sarcophagus and the arm, glowing
    put(M.dark, new THREE.BoxGeometry(3.0, 1.1, 1.4), [0, deck + 0.55, 4.4]);
    put(M.rune, new THREE.BoxGeometry(0.12, 2.6, 0.5), [0, deck + 3.1, 4.4], [0, 0, 0.22]);
    put(M.rune, new THREE.BoxGeometry(0.5, 0.12, 0.12), [0, deck + 2.5, 4.4], [0, 0, 0.22]);
    // braziers
    for (const sx of [-5.2, 5.2]) {
      put(M.dark, new THREE.CylinderGeometry(0.5, 0.34, 1.2, 8), [sx, deck + 0.6, 4.6]);
      put(M.hot, new THREE.SphereGeometry(0.42, 8, 6), [sx, deck + 1.35, 4.6]);
    }
    // fallen blocks around the base
    for (let i = 0; i < 7; i++) {
      const a = rng.next() * 6.28, d = rng.range(7.5, 12);
      put(M.stone, roughBox(i * 7 + 31, rng.range(0.6, 1.8), rng.range(0.5, 1.2), rng.range(0.6, 1.6), 0.1),
        [Math.cos(a) * d, 0.4, Math.sin(a) * d], [rng.gauss(0, 0.2), rng.next() * 3, rng.gauss(0, 0.2)]);
    }
    return { cast: true, r: 19 };
  }

  /** A magitek base: wall, towers, landing pad, banners, floodlights. */
  _imperial(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 34, 13, 47);
    put(M.gravel, new THREE.BoxGeometry(64, 0.4, 52), [0, 0.18, 0]);
    // perimeter wall with a gate and a breach
    const N = 26;
    const gate = Math.floor(rng.range(3, 9));
    for (let i = 0; i < N; i++) {
      const t = i / N * Math.PI * 2, t2 = (i + 1) / N * Math.PI * 2;
      const px = (Math.cos(t) + Math.cos(t2)) * 15, pz = (Math.sin(t) + Math.sin(t2)) * 12;
      const len = Math.hypot((Math.cos(t2) - Math.cos(t)) * 30, (Math.sin(t2) - Math.sin(t)) * 24);
      const ang = Math.atan2((Math.sin(t2) - Math.sin(t)) * 24, (Math.cos(t2) - Math.cos(t)) * 30);
      if (i === gate || i === gate + 1) continue;
      const breach = rng.next() < 0.14;
      const h = breach ? rng.range(1.4, 3.0) : 6.2;
      put(M.concrete, new THREE.BoxGeometry(len + 0.4, h, 1.1), [px, h * 0.5 + 0.3, pz], [0, -ang, 0]);
      if (!breach) put(M.magitek, new THREE.BoxGeometry(len + 0.6, 0.5, 1.5), [px, h + 0.5, pz], [0, -ang, 0]);
    }
    // gate: two pylons and a barrier arm
    for (const sy of [-1, 1]) {
      put(M.magitek, new THREE.BoxGeometry(2.0, 6.0, 2.0),
        [Math.cos(gate / 16 * 6.28) * 30 + sy * 2.4, 3.2, Math.sin(gate / 16 * 6.28) * 24 + sy * 2.0]);
    }
    // watchtowers
    for (const [tx, tz] of [[-26, -20], [26, 20], [26, -20]]) {
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI * 0.5 + 0.78;
        put(M.steel, new THREE.CylinderGeometry(0.14, 0.18, 11, 5),
          [tx + Math.cos(a) * 1.5, 5.8, tz + Math.sin(a) * 1.5],
          [Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08]);
      }
      put(M.magitek, new THREE.BoxGeometry(4.4, 2.4, 4.4), [tx, 12.4, tz]);
      put(M.roof, new THREE.BoxGeometry(5.2, 0.3, 5.2), [tx, 13.7, tz]);
      put(M.hot, new THREE.BoxGeometry(3.4, 0.4, 0.1), [tx, 12.6, tz + 2.25]);
    }
    // landing pad
    put(M.magitek, new THREE.CylinderGeometry(11, 11, 0.5, 22), [0, 0.5, 0]);
    put(M.red, new THREE.TorusGeometry(8.4, 0.28, 5, 26).rotateX(Math.PI / 2), [0, 0.78, 0]);
    // hangar
    put(M.concrete, new THREE.BoxGeometry(18, 7.5, 12), [-14, 4.1, 14]);
    put(M.roof, new THREE.CylinderGeometry(5.9, 5.9, 18, 14, 1, false, 0, Math.PI)
      .rotateZ(Math.PI / 2), [-14, 7.7, 14], [0, Math.PI / 2, 0]);
    put(M.magitek, new THREE.BoxGeometry(18.6, 0.7, 12.6), [-14, 7.9, 14]);
    put(M.void, new THREE.BoxGeometry(8, 6.4, 0.2), [-14, 3.5, 20.1]);
    // banners and floodlights
    for (let i = 0; i < 5; i++) {
      const a = rng.next() * 6.28;
      put(M.banner, new THREE.PlaneGeometry(2.2, 5.4),
        [Math.cos(a) * 28, 4.0, Math.sin(a) * 22], [0, -a + Math.PI / 2, 0]);
    }
    for (const [fx, fz] of [[18, -14], [-20, -16], [20, 16]]) {
      put(M.steel, new THREE.CylinderGeometry(0.12, 0.16, 9, 6), [fx, 4.8, fz]);
      put(M.lamp, new THREE.BoxGeometry(1.1, 0.7, 0.4), [fx, 9.3, fz], [0.5, 0, 0]);
    }
    // crates and drums inside the wire
    for (let i = 0; i < 9; i++) {
      put(i % 3 ? M.magitek : M.rust,
        i % 3 ? new THREE.BoxGeometry(2.4, 1.6, 1.8) : new THREE.CylinderGeometry(0.34, 0.34, 1.0, 10),
        [rng.range(-24, 24), 1.1, rng.range(-18, 18)], [0, rng.next() * 3, 0]);
    }
    return { cast: false, r: 40 };
  }

  /** A chocobo post: paddock rails, barn, feed silo, trough, signboard. */
  _chocobo(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 22, 9, 63);
    put(M.gravel, new THREE.CylinderGeometry(22, 23, 0.4, 20), [0, 0.16, 0]);
    // paddock: post and two rails, all the way round
    const N = 34, R = 20;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, a2 = ((i + 1) / N) * Math.PI * 2;
      put(M.plank, new THREE.CylinderGeometry(0.09, 0.11, 1.5, 6), [Math.cos(a) * R, 0.9, Math.sin(a) * R]);
      const mx = (Math.cos(a) + Math.cos(a2)) * 0.5 * R, mz = (Math.sin(a) + Math.sin(a2)) * 0.5 * R;
      const len = Math.hypot(Math.cos(a2) - Math.cos(a), Math.sin(a2) - Math.sin(a)) * R;
      for (const h of [0.8, 1.3]) {
        put(M.plank, new THREE.BoxGeometry(len + 0.1, 0.1, 0.06), [mx, h, mz], [0, -(a + a2) * 0.5 + Math.PI / 2, 0]);
      }
    }
    // barn
    put(M.plank, new THREE.BoxGeometry(13, 5.2, 9), [-9, 2.9, -11]);
    put(M.red, new THREE.CylinderGeometry(5.0, 5.0, 13, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2),
      [-9, 5.5, -11], [0, Math.PI / 2, 0]);
    put(M.void, new THREE.BoxGeometry(4.4, 4.0, 0.2), [-9, 2.3, -6.55]);
    put(M.lamp, new THREE.BoxGeometry(0.6, 0.24, 0.14), [-6, 5.0, -6.6]);
    // feed silo
    put(M.steel, new THREE.CylinderGeometry(1.9, 1.9, 7.5, 14), [4, 4.1, -13]);
    put(M.steel, new THREE.ConeGeometry(2.0, 1.6, 14), [4, 8.6, -13]);
    put(M.steel, new THREE.ConeGeometry(1.9, 2.2, 14).rotateZ(Math.PI), [4, 0.9, -13]);
    // trough, hay bales, signboard
    put(M.plank, new THREE.BoxGeometry(4.4, 0.6, 1.1), [6, 0.65, 4]);
    for (let i = 0; i < 6; i++) {
      put(M.wood, new THREE.CylinderGeometry(0.8, 0.8, 1.5, 10).rotateZ(Math.PI / 2),
        [rng.range(-14, 12), 0.9 + (i > 3 ? 1.6 : 0), rng.range(-4, 8)], [0, rng.next() * 3, 0]);
    }
    put(M.plank, new THREE.CylinderGeometry(0.13, 0.15, 4.4, 6), [13, 2.4, 12]);
    put(M.sign, new THREE.PlaneGeometry(3.4, 1.8), [13, 4.6, 12.1]);
    put(M.cream, new THREE.BoxGeometry(3.6, 2.0, 0.16), [13, 4.6, 12]);
    return { cast: true, r: 26 };
  }

  /** A fishing spot: a timber jetty on piles, a tackle shack and a boat. */
  _fishing(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    // the deck has to clear the water, whatever the ground is doing
    const deck = Math.max(1.4, WORLD.seaLevel + 1.5 - ctx.base);
    const L = 22;
    for (let i = 0; i < 10; i++) {
      const pz = -2 + (i / 9) * L;
      for (const sx of [-1.5, 1.5]) {
        put(M.plank, new THREE.CylinderGeometry(0.16, 0.18, deck + 3.4, 7), [sx, deck - 1.4, pz]);
      }
    }
    put(M.plank, new THREE.BoxGeometry(3.6, 0.16, L + 3), [0, deck, L * 0.5 - 1]);
    for (let i = 0; i < 12; i++) {
      const pz = -1.5 + (i / 11) * L;
      for (const sx of [-1.75, 1.75]) {
        put(M.plank, new THREE.CylinderGeometry(0.07, 0.08, 1.0, 5), [sx, deck + 0.5, pz]);
      }
      if (i < 11) {
        for (const sx of [-1.75, 1.75]) {
          put(M.plank, new THREE.BoxGeometry(0.06, 0.07, L / 11), [sx, deck + 0.95, pz + L / 22]);
        }
      }
    }
    // tackle shack on the bank
    put(M.plank, new THREE.BoxGeometry(4.4, 2.8, 3.6), [3.6, deck + 1.2, -3.5]);
    put(M.roof, new THREE.BoxGeometry(5.0, 0.3, 4.2), [3.6, deck + 2.7, -3.5], [0, 0, 0.09]);
    put(M.void, new THREE.BoxGeometry(1.0, 2.0, 0.14), [2.6, deck + 0.8, -1.72]);
    put(M.lamp, new THREE.BoxGeometry(0.4, 0.2, 0.12), [4.4, deck + 2.4, -1.75]);
    // rod stands, a bench, a crate
    for (let i = 0; i < 4; i++) {
      const pz = 4 + i * 4.2;
      put(M.plank, new THREE.CylinderGeometry(0.04, 0.04, 3.2, 5), [1.4, deck + 1.4, pz], [0.4, 0, 0]);
    }
    put(M.plank, new THREE.BoxGeometry(2.2, 0.12, 0.5), [-1.2, deck + 0.5, 6]);
    put(M.plank, new THREE.BoxGeometry(0.9, 0.7, 0.7), [-1.0, deck + 0.4, 12], [0, rng.next(), 0]);
    // a moored rowboat
    put(M.plank, new THREE.SphereGeometry(1.5, 10, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
      [-3.4, deck - 0.85, 13], [0, 0.3, 0], [0.62, 0.5, 1.7]);
    put(M.plank, new THREE.BoxGeometry(1.5, 0.1, 0.4), [-3.4, deck - 0.7, 13], [0, 0.3, 0]);
    return { cast: true, r: 16, noApron: true };
  }

  /** A viewpoint: waymark stele, cairn, a bench. Lighthouses get a tower. */
  _landmark(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    if (/lighthouse/.test(s.poi.id)) {
      this._apron(B, 6, 9, 21);
      put(M.cream, new THREE.CylinderGeometry(2.0, 3.2, 20, 16), [0, 10, 0]);
      put(M.red, new THREE.CylinderGeometry(2.1, 2.1, 1.4, 16), [0, 13.5, 0]);
      put(M.steel, new THREE.CylinderGeometry(2.5, 2.5, 0.35, 16), [0, 20.2, 0]);
      put(M.glass, new THREE.CylinderGeometry(1.8, 1.8, 2.4, 12), [0, 21.6, 0]);
      put(M.lamp, new THREE.SphereGeometry(1.1, 10, 8), [0, 21.6, 0]);
      put(M.rust, new THREE.ConeGeometry(2.3, 2.0, 16), [0, 23.8, 0]);
      put(M.cream, new THREE.BoxGeometry(6.5, 3.2, 5.0), [4.5, 1.9, 3.0]);
      put(M.roof, new THREE.BoxGeometry(7.1, 0.3, 5.6), [4.5, 3.6, 3.0]);
      return { cast: true, r: 10 };
    }
    // waymark stele
    put(M.stone, roughBox(3, 1.1, 3.4, 0.5, 0.05), [0, 1.7, 0], [0.03, 0, rng.gauss(0, 0.03)]);
    put(M.runeface, new THREE.PlaneGeometry(0.85, 1.7), [0, 2.2, 0.27]);
    put(M.stone, roughBox(5, 2.2, 0.5, 1.6, 0.06), [0, 0.25, 0]);
    // cairn
    let h = 0;
    for (let i = 0; i < 7; i++) {
      const r = 0.55 * (1 - i / 9);
      put(M.dark, new THREE.DodecahedronGeometry(r, 0),
        [2.6 + rng.gauss(0, 0.06), h + r * 0.7, -1.4 + rng.gauss(0, 0.06)],
        [rng.gauss(0, 0.3), rng.next() * 3, rng.gauss(0, 0.3)]);
      h += r * 1.35;
    }
    // a bench facing the view, and a couple of set stones
    put(M.plank, new THREE.BoxGeometry(2.4, 0.14, 0.55), [-2.6, 0.62, 1.2], [0, rng.gauss(0, 0.2), 0]);
    for (const sx of [-3.5, -1.7]) put(M.dark, new THREE.BoxGeometry(0.3, 0.6, 0.5), [sx, 0.3, 1.2]);
    for (let i = 0; i < 5; i++) {
      const a = rng.next() * 6.28, d = rng.range(3.5, 8);
      put(M.stone, new THREE.DodecahedronGeometry(rng.range(0.4, 1.1), 0),
        [Math.cos(a) * d, 0.3, Math.sin(a) * d], [rng.gauss(0, 0.4), rng.next() * 3, rng.gauss(0, 0.4)]);
    }
    return { cast: true, r: 9, noApron: true };
  }

  /** A menace lair: a sealed sigil in a ring of leaning stones. */
  _menace(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0], [1.3, 1.3, 1.3]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 12, 9, 83);
    put(M.dark, new THREE.CylinderGeometry(9.4, 10, 0.6, 22), [0, 0.24, 0]);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const h = rng.range(3.2, 5.8);
      put(M.dark, roughBox(i * 5 + 2, 1.2, h, 0.8, 0.08),
        [Math.cos(a) * 8, h * 0.5 + 0.4, Math.sin(a) * 8],
        [Math.sin(a) * 0.12, -a, -Math.cos(a) * 0.12]);
    }
    // the sigil and the stair down
    put(M.arcane, new THREE.RingGeometry(2.0, 3.4, 32).rotateX(-Math.PI / 2), [0, 0.58, 0]);
    put(M.arcane, new THREE.RingGeometry(0.5, 0.9, 20).rotateX(-Math.PI / 2), [0, 0.59, 0]);
    put(M.void, new THREE.CircleGeometry(1.9, 24).rotateX(-Math.PI / 2), [0, 0.5, 0]);
    for (let i = 0; i < 5; i++) {
      put(M.dark, new THREE.BoxGeometry(3.4, 0.3, 0.7), [0, 0.4 - i * 0.32, 2.2 + i * 0.7]);
    }
    return { cast: true, r: 12 };
  }

  /** A dungeon mouth: dressed jambs and a lintel set into a rubble mound. */
  _dungeon(this: PoiKits, B: PartBuilder, s: PoiSite, ctx: KitCtx): KitResult {
    const M = this.mats, { rng, yaw } = ctx;
    const world = mat4([0, 0, 0], [0, yaw, 0], [1.35, 1.35, 1.35]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3, rot?: Vec3, sc?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(pos, rot, sc)));
    this._apron(B, 11, 9, 29);
    // the mound the portal is cut into
    put(M.dark, new THREE.SphereGeometry(9, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
      [0, -0.6, -4], [0, 0, 0], [1, 0.62, 1]);
    for (const sx of [-2.4, 2.4]) {
      put(M.stone, roughBox(sx > 0 ? 7 : 8, 1.3, 5.4, 1.6, 0.04), [sx, 2.7, 0.5]);
    }
    put(M.stone, roughBox(9, 6.6, 1.3, 2.0, 0.04), [0, 5.9, 0.5]);
    put(M.stone, roughBox(10, 7.4, 0.7, 2.6, 0.05), [0, 6.85, 0.5]);
    put(M.void, new THREE.BoxGeometry(3.6, 5.0, 0.3), [0, 2.5, 0.2]);
    put(M.runeface, new THREE.PlaneGeometry(2.6, 0.9), [0, 5.9, 1.55]);
    // braziers and spill
    for (const sx of [-3.6, 3.6]) {
      put(M.dark, new THREE.CylinderGeometry(0.42, 0.3, 1.0, 8), [sx, 0.5, 2.4]);
      put(M.hot, new THREE.SphereGeometry(0.36, 8, 6), [sx, 1.15, 2.4]);
    }
    for (let i = 0; i < 12; i++) {
      const a = rng.range(-1.6, 1.6), d = rng.range(3, 9);
      put(M.stone, new THREE.DodecahedronGeometry(rng.range(0.25, 0.95), 0),
        [Math.sin(a) * d, 0.2, Math.cos(a) * d + 1], [rng.gauss(0, 0.5), rng.next() * 3, rng.gauss(0, 0.5)]);
    }
    return { cast: true, r: 11 };
  }

  // ---------------------------------------------------------------- stream

  /** Positions we must not build on: another system already owns them. */
  _exclude(game: Game): THREE.Vector3[] {
    if (this._exclusions) return this._exclusions;
    const out: THREE.Vector3[] = [];
    const d = game.get('Dungeons');
    if (d) for (const e of d.entrances) out.push(e.pos.clone());
    // `origin` is declared but only assigned when the town builds, so this
    // guard is about *when* we are asked, not about whether the field exists.
    const t = game.get('Town');
    if (t && t.origin) out.push(t.origin.clone());
    this._exclusions = out;
    return out;
  }

  _make(site: PoiSite, game: Game) {
    const p = site.poi;
    for (const e of this._exclude(game)) {
      if (Math.hypot(e.x - p.x, e.z - p.z) < 130) { site.group = new THREE.Group(); return; }
    }
    const rng = new Rng(hashId(p.id));
    const dress = dressAt(p.x, p.z);
    const yaw = this._yaw(p, rng);
    const B = new PartBuilder();
    const probe = p.type === 'town' ? 40 : p.type === 'imperial' ? 26 : 10;
    const base = this._base(p.x, p.z, probe);
    const res = site.fn.call(this, B, site, { rng, dress, yaw, base }) || {};
    const g = new THREE.Group();
    g.name = `poi_${p.type}_${p.id}`;
    g.position.set(p.x, base, p.z);
    B.build(g, { cast: false, receive: true, name: p.type });
    this.root.add(g);
    site.group = g;
    this.built.push({
      ...site,
      group: g,
      canCast: res.cast !== false,
      radius: res.r || 20,
      draw: DRAW_BY_TYPE[p.type as keyof typeof DRAW_BY_TYPE] || DRAW_R,
    });
  }

  /**
   * @param dt @param t @param night
   * @param camPos @param game
   */
  update(dt: number, t: number, night: number, camPos: THREE.Vector3, game: Game) {
    // build at most one POI per frame, nearest first
    let best: PoiSite | null = null, bestD = BUILD_R * BUILD_R;
    for (const s of this.sites) {
      if (s.group) continue;
      const dx = s.poi.x - camPos.x, dz = s.poi.z - camPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = s; }
    }
    if (best) this._make(best, game);

    for (const s of this.built) {
      const dx = s.poi.x - camPos.x, dz = s.poi.z - camPos.z;
      const d2 = dx * dx + dz * dz;
      const vis = d2 < s.draw * s.draw;
      if (s.group.visible !== vis) s.group.visible = vis;
      const cast = s.canCast && d2 < 90 * 90;
      if (s.casting !== cast) {
        s.casting = cast;
        for (const m of s.group.children) m.castShadow = cast;
      }
    }
    const M = this.mats;
    if (M) {
      M.lamp.emissiveIntensity = 0.3 + night * 1.15;
      M.hot.emissiveIntensity = 1.1 + night * 1.9 + Math.sin(t * 5.3) * 0.12;
      M.rune.emissiveIntensity = 0.9 + night * 1.8 + Math.sin(t * 1.4) * 0.1;
      M.arcane.emissiveIntensity = 0.8 + night * 1.6 + Math.sin(t * 0.9 + 1) * 0.15;
      M.runeface.emissiveIntensity = 0.4 + night * 1.5;
    }
    void _v;
  }
}

/** Stable 32-bit hash of a POI id, so every kit varies but never drifts. */
function hashId(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

import * as THREE from 'three';
import { Rng } from '../../util/Rng.ts';
import { PartBuilder, type Vec3 } from './PartBuilder.ts';
import {
  rockMaterial, woodMaterial, rustMaterial, concreteMaterial, paintedMaterial,
  magitekMaterial, glowMaterial, canvasClothMaterial, imperialTexture, signTexture,
} from './PropMaterials.ts';
import type { Ecology } from '../veg/Ecology.ts';
import type { EcoSite } from './EcoSites.ts';

/**
 * The built world between the landmarks: a fuel stop, an imperial roadblock,
 * a bus shelter, dead cars, a crashed magitek dropship still smoking, a comms
 * mast at the foot of Blackrock Mesa, a water tower, a wind pump and a row of
 * Solheim columns.
 *
 * Two rules govern where these go: every vista must contain at least one of
 * them, and every large landform must have one at its foot so the eye has a
 * known-size object to measure the rock against.
 *
 * Sites come from `Ecology._layoutSites`, so vegetation has already cleared
 * the ground before any of this is built.
 */

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

function mat4(pos: Vec3, rot: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]) {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]), _q,
    new THREE.Vector3(scale[0], scale[1], scale[2])
  );
}

/** The proportions of a lattice tower. `bays` and `leg` have sane defaults. */
interface LatticeSpec {
  /** Total height, metres. */
  height: number;
  /** Width across the legs at the foot, and at the top. */
  baseW: number;
  topW: number;
  /** How many stacked bays the taper is divided into. */
  bays?: number;
  /** Leg section, metres square. */
  leg?: number;
}

/** Four-leg lattice tower: legs, X-bracing, horizontal belts. */
function lattice(B: PartBuilder, mat: THREE.Material, world: THREE.Matrix4, { height, baseW, topW, bays = 6, leg = 0.11 }: LatticeSpec) {
  const put = (geo: THREE.BoxGeometry, p: Vec3, r?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(p, r)));
  const wAt = (t: number) => baseW + (topW - baseW) * t;
  for (let i = 0; i < bays; i++) {
    const t0 = i / bays, t1 = (i + 1) / bays;
    const y0 = t0 * height, y1 = t1 * height;
    const w0 = wAt(t0), w1 = wAt(t1);
    const dy = y1 - y0;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const dx = (w1 - w0) * sx * 0.5, dz = (w1 - w0) * sz * 0.5;
        const len = Math.hypot(dy, dx, dz);
        put(new THREE.BoxGeometry(leg, len, leg),
          [sx * (w0 + w1) * 0.25, (y0 + y1) * 0.5, sz * (w0 + w1) * 0.25],
          [Math.atan2(dz, dy) * 0.9, 0, -Math.atan2(dx, dy) * 0.9]);
      }
    }
    // belt
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      for (const s of [-1, 1]) {
        put(new THREE.BoxGeometry(ax ? w1 : leg * 0.8, leg * 0.8, az ? w1 : leg * 0.8),
          [ax ? 0 : s * w1 * 0.5, y1, az ? 0 : s * w1 * 0.5]);
      }
    }
    // X bracing on two faces
    const diag = Math.hypot(dy, w0);
    for (const s of [-1, 1]) {
      for (const f of [-1, 1]) {
        put(new THREE.BoxGeometry(leg * 0.65, diag, leg * 0.65),
          [f === 1 ? 0 : s * w0 * 0.5, (y0 + y1) * 0.5, f === 1 ? s * w0 * 0.5 : 0],
          f === 1 ? [0, 0, s * Math.atan2(w0, dy)] : [s * Math.atan2(w0, dy), 0, 0]);
      }
    }
  }
}

/**
 * The shared material set, built once by {@link Outposts.build}. A function
 * rather than a literal inside the class so {@link OutpostMats} is the set
 * itself and cannot drift from a parallel interface.
 */
function outpostMaterials() {
  return {
    rock: rockMaterial(0x8d7663, 0.93, false),
    pale: rockMaterial(0xa2967e, 0.9, false),
    wood: woodMaterial(0x7d674c),
    dark: woodMaterial(0x4a3d30),
    rust: Object.assign(rustMaterial(0x8f5c39, 0.5), { side: THREE.DoubleSide }),
    steel: paintedMaterial(0x8b9095, 0.5, 0.8),
    cream: paintedMaterial(0xcfc4a8, 0.6, 0.1),
    red: paintedMaterial(0x8f2b22, 0.55, 0.3),
    concrete: concreteMaterial(0x9d9689, 0.93),
    magitek: magitekMaterial(0x2b2f36),
    cloth: canvasClothMaterial(0x3d4148),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.12, metalness: 0.3 }),
    lamp: glowMaterial(0xfff0c8, 0.4, 0x141310),
    hot: glowMaterial(0xff3a18, 1.6, 0x180604),
    banner: new THREE.MeshStandardMaterial({
      map: imperialTexture(), roughness: 0.8, metalness: 0, side: THREE.DoubleSide,
    }),
    sign: new THREE.MeshStandardMaterial({
      map: signTexture(0), roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide,
    }),
  };
}

/** Every material an outpost builder can ask for. */
export type OutpostMats = ReturnType<typeof outpostMaterials>;

/** A point light the day/night ramp drives. */
interface OutpostLight {
  light: THREE.PointLight;
  /** Intensity after dark. */
  night: number;
  /** Intensity by day; absent means off. */
  day?: number;
  /** Whether to add the campfire flicker on top. */
  flicker?: boolean;
}

/** One site's merged group, and whether it is close enough to earn a cascade. */
interface OutpostGroup {
  group: THREE.Group;
  pos: THREE.Vector3;
  /** Whether this site type is ever allowed to cast. */
  cast: boolean;
  /** Whether it is casting right now; unset until the first distance test. */
  casting?: boolean;
}

/** Something that turns forever: the wind pump wheel. */
interface Spinner { obj: THREE.Object3D; rate: number }

export class Outposts {
  /**
   * Where the dropship went in, for anything that wants to smoke over it.
   *
   * **Nothing reads this.** `Wildlife` finds the crash by asking `eco.sites`
   * for the `crashsite` again rather than through here.
   */
  crash?: { x: number, y: number, z: number };
  eco!: Ecology;
  groups!: OutpostGroup[];
  lights!: OutpostLight[];
  mats!: OutpostMats;
  root!: THREE.Group;
  scene!: THREE.Scene;
  spinners!: Spinner[];
  constructor(eco: import('../veg/Ecology.ts').Ecology, scene: THREE.Scene) {
    this.eco = eco;
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'outposts';
    this.lights = [];
    this.spinners = [];
    this.groups = [];
  }

  build() {
    const M = this.mats = outpostMaterials();
    for (const [k, m] of Object.entries(M)) if (!m.name) m.name = `out_${k}`;
    // One builder *per site*, not one for the whole world. A single merged
    // mesh spanning a kilometre has a kilometre-wide bounding sphere and is
    // therefore drawn in every frame and every shadow cascade; per-site groups
    // give the frustum something it can actually reject. Only the structures
    // near the road are allowed to cast — nothing at half a kilometre earns a
    // cascade render.
    const builders = {
      reststop: this._restStop, blockade: this._blockade, layby: this._layby,
      wreck: this._wreck, crashsite: this._crashSite, outpost: this._mesaOutpost,
      watertower: this._waterTower, ruins: this._ruins, windpump: this._windPump,
    };
    const casters = new Set(['reststop', 'blockade', 'layby', 'wreck']);
    for (const s of this.eco.sites) {
      const fn = builders[s.type as keyof typeof builders];
      if (!fn) continue;
      const B = new PartBuilder();
      fn.call(this, B, s);
      const g = new THREE.Group();
      g.name = `site_${s.type}`;
      B.build(g, { cast: casters.has(s.type), receive: true, name: s.type });
      this.root.add(g);
      this.groups.push({ group: g, pos: new THREE.Vector3(s.x, s.y || 0, s.z), cast: casters.has(s.type) });
    }
    this.scene.add(this.root);
  }

  /** Lowest ground under a footprint, so slabs never float on one corner. */
  _base(x: number, z: number, r: number) {
    let base = this.eco.height(x, z);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      base = Math.min(base, this.eco.height(x + Math.cos(a) * r, z + Math.sin(a) * r));
    }
    return base;
  }

  // -------------------------------------------------------------- rest stop

  /** Fuel canopy, shop, pylon sign — the one lit thing on this road at night. */
  _restStop(this: Outposts, B: PartBuilder, site: EcoSite) {
    const M = this.mats;
    const rng = new Rng(1701);
    const base = this._base(site.x, site.z, 12);
    const yaw = (site.yaw || 0) + Math.PI / 2;
    const world = mat4([site.x, base, site.z], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, p: Vec3, r?: Vec3, s?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(p, r, s)));

    // forecourt slab
    put(M.concrete, new THREE.BoxGeometry(20, 0.3, 15), [0, 0.12, 0]);

    // canopy on four columns
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        put(M.cream, new THREE.BoxGeometry(0.45, 4.6, 0.45), [sx * 4.4, 2.35, sz * 2.6]);
      }
    }
    put(M.cream, new THREE.BoxGeometry(12.4, 0.8, 8.2), [0, 5.0, 0]);
    put(M.red, new THREE.BoxGeometry(12.6, 0.5, 8.4), [0, 5.45, 0]);
    // soffit light panels
    for (const sx of [-1, 0, 1]) {
      put(M.lamp, new THREE.BoxGeometry(3.0, 0.14, 1.1), [sx * 3.6, 4.55, 0]);
    }

    // two pump islands
    for (const sz of [-1, 1]) {
      put(M.concrete, new THREE.BoxGeometry(4.2, 0.35, 1.6), [0, 0.42, sz * 2.4]);
      for (const sx of [-1, 1]) {
        put(M.cream, new THREE.BoxGeometry(0.7, 1.5, 0.55), [sx * 1.2, 1.3, sz * 2.4]);
        put(M.dark, new THREE.BoxGeometry(0.2, 0.4, 0.16), [sx * 1.2, 1.85, sz * 2.4 + 0.3]);
        put(M.dark, new THREE.CylinderGeometry(0.02, 0.02, 1.2, 5),
          [sx * 1.55, 1.5, sz * 2.4], [0.5, 0, 0.6]);
      }
    }

    // shop: block with a shuttered front and a lit window
    const sx0 = -12.5;
    put(M.concrete, new THREE.BoxGeometry(9, 3.4, 6.4), [sx0, 1.7, 0]);
    put(M.rust, new THREE.BoxGeometry(9.6, 0.35, 7.0), [sx0, 3.55, 0]);
    put(M.cream, new THREE.BoxGeometry(9.4, 0.9, 0.3), [sx0, 3.0, 3.25]);
    put(M.glass, new THREE.BoxGeometry(3.4, 1.7, 0.12), [sx0 - 1.6, 1.9, 3.24]);
    put(M.lamp, new THREE.BoxGeometry(3.2, 1.5, 0.06), [sx0 - 1.6, 1.9, 3.18]);
    put(M.dark, new THREE.BoxGeometry(1.1, 2.2, 0.12), [sx0 + 2.4, 1.2, 3.24]);
    put(M.rust, new THREE.BoxGeometry(9.4, 2.6, 0.2), [sx0, 4.6, -3.1]);
    // porch
    for (const s of [-1, 1]) put(M.steel, new THREE.CylinderGeometry(0.07, 0.07, 2.8, 6), [sx0 + s * 4.0, 1.4, 5.2]);
    put(M.rust, new THREE.BoxGeometry(9.0, 0.15, 4.2), [sx0, 2.85, 4.3], [0.09, 0, 0]);

    // pylon sign, the tallest thing for a kilometre in either direction
    put(M.steel, new THREE.CylinderGeometry(0.22, 0.3, 9.5, 8), [8.5, 4.75, 5.5]);
    put(M.cream, new THREE.BoxGeometry(0.5, 3.2, 4.4), [8.5, 10.6, 5.5]);
    put(M.sign, new THREE.PlaneGeometry(3.9, 2.8), [8.24, 10.6, 5.5], [0, -Math.PI / 2, 0]);
    put(M.sign, new THREE.PlaneGeometry(3.9, 2.8), [8.76, 10.6, 5.5], [0, Math.PI / 2, 0]);
    put(M.lamp, new THREE.BoxGeometry(0.42, 0.1, 3.2), [8.5, 12.3, 5.5]);

    // clutter: bins, tyres, a pallet stack, an ice box
    for (let i = 0; i < 9; i++) {
      const px = rng.range(-11, 9), pz = rng.range(-6.5, 6.5);
      const r = rng.next();
      if (r < 0.3) put(M.rust, new THREE.CylinderGeometry(0.32, 0.28, 0.95, 10), [px, 0.75, pz]);
      else if (r < 0.6) put(M.dark, new THREE.TorusGeometry(0.4, 0.15, 6, 10), [px, 0.42, pz], [Math.PI / 2, rng.next() * 3, 0]);
      else put(M.wood, new THREE.BoxGeometry(1.1, 0.16, 0.9), [px, 0.36 + rng.range(0, 0.3), pz], [0, rng.next() * 3, 0]);
    }
    put(M.steel, new THREE.BoxGeometry(0.9, 1.85, 0.7), [sx0 + 4.9, 1.2, 2.2]);

    // canopy light + shop glow
    const l = new THREE.PointLight(0xffe0a8, 0, 34, 2);
    l.position.set(site.x, base + 4.6, site.z);
    this.root.add(l);
    this.lights.push({ light: l, night: 26 });
  }

  // --------------------------------------------------------------- blockade

  /** Niflheim roadblock: barriers, boom, floodlights and a standing walker. */
  _blockade(this: Outposts, B: PartBuilder, site: EcoSite) {
    const M = this.mats;
    const rng = new Rng(4499);
    const yaw = (site.yaw || 0) + Math.PI / 2;
    const base = this._base(site.x, site.z, 8);
    const world = mat4([site.x, base, site.z], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, p: Vec3, r?: Vec3, s?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(p, r, s)));

    // staggered jersey barriers forcing a chicane
    const jersey = new THREE.BoxGeometry(3.0, 0.95, 0.62);
    for (let i = -3; i <= 3; i++) {
      const stagger = (i % 2 === 0) ? -1.5 : 1.5;
      put(M.concrete, jersey, [i * 3.1, 0.48, stagger], [0, rng.gauss(0, 0.04), 0]);
      put(M.red, new THREE.BoxGeometry(3.05, 0.18, 0.66), [i * 3.1, 0.86, stagger]);
    }
    // sandbag emplacement
    for (let i = 0; i < 22; i++) {
      const row = Math.floor(i / 8);
      const k = i % 8;
      put(M.cloth, new THREE.BoxGeometry(0.62, 0.24, 0.4),
        [-8.5 + k * 0.55 + row * 0.2, 0.12 + row * 0.24, -4.4], [0, rng.gauss(0, 0.1), 0]);
    }

    // boom gate
    put(M.steel, new THREE.CylinderGeometry(0.16, 0.2, 2.2, 8), [9.5, 1.1, 0]);
    put(M.red, new THREE.BoxGeometry(9.5, 0.22, 0.22), [5.0, 1.9, 0], [0, 0, 0.06]);
    put(M.cream, new THREE.BoxGeometry(1.2, 0.24, 0.24), [2.0, 1.72, 0]);

    // guard hut
    put(M.magitek, new THREE.BoxGeometry(2.8, 2.6, 2.4), [11.5, 1.3, -3.2]);
    put(M.magitek, new THREE.BoxGeometry(3.1, 0.2, 2.7), [11.5, 2.7, -3.2]);
    put(M.hot, new THREE.BoxGeometry(1.6, 0.5, 0.1), [11.5, 1.9, -1.95]);

    // floodlight masts
    for (const s of [-1, 1]) {
      const mx = s * 12, mz = 3.6;
      put(M.steel, new THREE.CylinderGeometry(0.12, 0.16, 7.4, 8), [mx, 3.7, mz]);
      put(M.steel, new THREE.BoxGeometry(1.8, 0.3, 0.5), [mx, 7.4, mz]);
      for (const k of [-1, 1]) {
        put(M.dark, new THREE.BoxGeometry(0.6, 0.5, 0.4), [mx + k * 0.6, 7.15, mz], [0.4, 0, 0]);
        put(M.lamp, new THREE.BoxGeometry(0.5, 0.06, 0.34), [mx + k * 0.6, 7.0, mz + 0.22], [0.4, 0, 0]);
      }
      const l = new THREE.PointLight(0xdfe8ff, 0, 30, 2);
      l.position.set(site.x + Math.cos(yaw) * mx, base + 7.2, site.z - Math.sin(yaw) * mx);
      this.root.add(l);
      this.lights.push({ light: l, night: 20 });
    }

    // banners on poles
    for (const s of [-1, 1]) {
      put(M.steel, new THREE.CylinderGeometry(0.06, 0.06, 5.4, 6), [s * 6.5, 2.7, -4.6]);
      put(M.banner, new THREE.PlaneGeometry(1.4, 2.6), [s * 6.5 + 0.7, 3.6, -4.6], [0, 0.1, 0.03]);
    }

    // MA-X walker standing sentry — a person-and-a-half of imperial hardware
    this._walker(B, world.clone().multiply(mat4([-4.5, 0, -6.4], [0, 0.9, 0])));

    // crates and a parked transport
    for (let i = 0; i < 5; i++) {
      put(M.magitek, new THREE.BoxGeometry(1.2, 0.9, 0.9),
        [-11 + i * 0.4, 0.45 + (i % 2) * 0.9, -5.4 + (i % 3) * 1.1], [0, rng.gauss(0, 0.2), 0]);
    }
  }

  /** Bipedal magitek armour: reverse-jointed legs, slab torso, one red eye. */
  _walker(this: Outposts, B: PartBuilder, world: THREE.Matrix4) {
    const M = this.mats;
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, p: Vec3, r?: Vec3, s?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(p, r, s)));
    for (const s of [-1, 1]) {
      put(M.magitek, new THREE.BoxGeometry(0.42, 1.5, 0.5), [s * 0.55, 2.35, 0.15], [0.35, 0, 0]);
      put(M.magitek, new THREE.BoxGeometry(0.36, 1.6, 0.42), [s * 0.55, 1.28, -0.28], [-0.42, 0, 0]);
      put(M.magitek, new THREE.BoxGeometry(0.5, 0.22, 1.1), [s * 0.55, 0.12, 0.12]);
      put(M.magitek, new THREE.SphereGeometry(0.28, 8, 6), [s * 0.55, 3.05, 0.35]);
    }
    put(M.magitek, new THREE.BoxGeometry(1.7, 1.3, 1.05), [0, 3.75, 0.1]);
    put(M.magitek, new THREE.BoxGeometry(1.9, 0.3, 1.2), [0, 4.45, 0.1]);
    put(M.hot, new THREE.BoxGeometry(1.15, 0.14, 0.08), [0, 3.9, 0.66]);
    for (const s of [-1, 1]) {
      put(M.magitek, new THREE.BoxGeometry(0.34, 1.5, 0.34), [s * 1.05, 3.4, 0.1], [0.2, 0, s * 0.12]);
      put(M.magitek, new THREE.CylinderGeometry(0.13, 0.13, 1.3, 8), [s * 1.15, 2.7, 0.55], [0.25, 0, 0]);
    }
    put(M.magitek, new THREE.BoxGeometry(0.7, 0.7, 0.5), [0, 4.7, -0.2], [0.3, 0, 0]);
  }

  // ------------------------------------------------------------------ layby

  /** Gravel pull-in with a bus shelter, a bin and a noticeboard. */
  _layby(this: Outposts, B: PartBuilder, site: EcoSite) {
    const M = this.mats;
    const base = this._base(site.x, site.z, 6);
    const yaw = (site.yaw || 0) + Math.PI / 2;
    const world = mat4([site.x, base, site.z], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, p: Vec3, r?: Vec3, s?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(p, r, s)));

    put(M.concrete, new THREE.BoxGeometry(11, 0.22, 5), [0, 0.09, 0]);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        put(M.steel, new THREE.BoxGeometry(0.1, 2.4, 0.1), [sx * 1.7, 1.2, sz * 0.75]);
      }
    }
    put(M.rust, new THREE.BoxGeometry(4.0, 0.12, 2.1), [0, 2.5, 0], [0.06, 0, 0]);
    put(M.glass, new THREE.BoxGeometry(3.6, 1.9, 0.06), [0, 1.4, -0.78]);
    put(M.steel, new THREE.BoxGeometry(3.4, 0.08, 0.4), [0, 0.6, -0.5]);
    for (const sx of [-1, 1]) put(M.steel, new THREE.BoxGeometry(0.08, 0.5, 0.4), [sx * 1.4, 0.35, -0.5]);
    put(M.dark, new THREE.CylinderGeometry(0.28, 0.24, 0.85, 10), [2.6, 0.55, 0.6]);
    put(M.steel, new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), [-3.2, 1.1, 0.4]);
    put(M.cream, new THREE.BoxGeometry(0.06, 0.9, 1.3), [-3.2, 1.95, 0.4]);
  }

  // ------------------------------------------------------------------ wreck

  /** A burnt-out sedan (kind 0) or an overturned hauler (kind 1). */
  _wreck(this: Outposts, B: PartBuilder, site: EcoSite) {
    const M = this.mats;
    const rng = new Rng(920 + (site.kind || 0) * 37);
    const y = this.eco.height(site.x, site.z);
    const yaw = (site.yaw || 0) + (site.kind ? 1.1 : 0.35);
    const world = mat4([site.x, y, site.z], [0, yaw, site.kind ? 0.9 : 0.02]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, p: Vec3, r?: Vec3, s?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(p, r, s)));

    if (!site.kind) {
      put(M.rust, new THREE.BoxGeometry(4.2, 0.5, 1.75), [0, 0.55, 0]);
      put(M.rust, new THREE.BoxGeometry(2.1, 0.72, 1.62), [-0.2, 1.12, 0]);
      put(M.dark, new THREE.BoxGeometry(1.85, 0.06, 1.5), [-0.2, 1.5, 0]);
      put(M.rust, new THREE.BoxGeometry(1.15, 0.3, 1.66), [1.7, 0.85, 0], [0, 0, -0.1]);
      put(M.rust, new THREE.BoxGeometry(1.3, 0.34, 1.66), [-1.75, 0.86, 0], [0, 0, 0.08]);
      const tyre = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
      tyre.rotateX(Math.PI / 2);
      put(M.dark, tyre, [1.35, 0.36, 0.86]);
      put(M.dark, tyre, [-1.3, 0.36, -0.86]);
      // up on stacked blocks where the wheels were taken
      put(M.concrete, new THREE.BoxGeometry(0.5, 0.5, 0.5), [1.35, 0.25, -0.86]);
      put(M.concrete, new THREE.BoxGeometry(0.5, 0.34, 0.5), [-1.3, 0.17, 0.86]);
      put(M.dark, tyre, [2.4, 0.15, -1.9], [Math.PI / 2, 0.4, 0]);
    } else {
      put(M.rust, new THREE.BoxGeometry(7.2, 2.5, 2.5), [0, 1.5, 0]);
      put(M.rust, new THREE.BoxGeometry(2.4, 2.2, 2.4), [4.4, 1.4, 0]);
      put(M.steel, new THREE.BoxGeometry(0.1, 1.0, 2.0), [5.6, 1.8, 0], [0, 0, -0.2]);
      const tyre = new THREE.CylinderGeometry(0.62, 0.62, 0.4, 12);
      tyre.rotateX(Math.PI / 2);
      for (const ax of [3.6, -1.4, -2.6]) {
        for (const sz of [-1, 1]) put(M.dark, tyre, [ax, 0.3, sz * 1.35]);
      }
      // spilled load
      for (let i = 0; i < 7; i++) {
        const px = rng.range(-9, -3), pz = rng.range(-4, 4);
        B.add(M.wood, new THREE.BoxGeometry(0.9, 0.62, 0.8),
          mat4([site.x + px, this.eco.height(site.x + px, site.z + pz) + 0.3, site.z + pz],
            [rng.gauss(0, 0.3), rng.next() * 3, rng.gauss(0, 0.3)]));
      }
    }
  }

  // -------------------------------------------------------------- crash site

  /** Magitek dropship down in the basin, broken-backed in its own furrow. */
  _crashSite(this: Outposts, B: PartBuilder, site: EcoSite) {
    const M = this.mats;
    const eco = this.eco;
    const rng = new Rng(7373);
    const yaw = site.yaw || 0;
    const y = eco.height(site.x, site.z);
    const world = mat4([site.x, y, site.z], [0, yaw, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, p: Vec3, r?: Vec3, s?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(p, r, s)));

    // forward hull, nose buried and tail up
    put(M.magitek, new THREE.BoxGeometry(15, 5.2, 8.6), [0, 1.6, 0], [0, 0, -0.22]);
    put(M.magitek, new THREE.BoxGeometry(6.5, 4.2, 7.4), [8.6, -0.4, 0], [0, 0, -0.34]);
    put(M.hot, new THREE.BoxGeometry(2.4, 0.5, 6.2), [4.2, 2.6, 0], [0, 0, -0.22]);
    // severed tail section thrown clear
    put(M.magitek, new THREE.BoxGeometry(9, 4.4, 7.2), [-16, 1.4, 5.5], [0.2, 0.6, 0.5]);
    put(M.magitek, new THREE.BoxGeometry(6, 5.5, 0.5), [-19, 4.2, 5.5], [0.2, 0.6, 0.5]);
    // wings: one snapped off and stuck in the dirt
    put(M.magitek, new THREE.BoxGeometry(9, 0.7, 8), [-1, 3.2, 7.4], [0.4, 0, -0.2]);
    put(M.magitek, new THREE.BoxGeometry(9, 0.7, 8), [-6, 3.0, -9], [1.15, 0.4, 0.2]);
    // engine nacelles
    for (const sz of [-1, 1]) {
      put(M.magitek, new THREE.CylinderGeometry(1.5, 1.7, 6, 10), [-3, 3.6, sz * 5.2], [0, 0, Math.PI / 2 - 0.2]);
    }

    // ploughed furrow: rubble ridges either side of the impact track
    for (let i = 0; i < 34; i++) {
      const t = i / 34;
      const along = 12 + t * 78;
      const px = site.x + Math.sin(yaw) * along + rng.gauss(0, 4);
      const pz = site.z + Math.cos(yaw) * along + rng.gauss(0, 4);
      const s = rng.range(0.7, 2.6) * (1 - t * 0.5);
      B.add(M.rock, new THREE.IcosahedronGeometry(s, 0),
        mat4([px, eco.height(px, pz) + s * 0.25, pz], [rng.gauss(0, 0.5), rng.next() * 3, rng.gauss(0, 0.5)]));
    }
    // shed panels and struts
    for (let i = 0; i < 16; i++) {
      const a = rng.next() * Math.PI * 2, d = 12 + rng.range(0, 34);
      const px = site.x + Math.cos(a) * d, pz = site.z + Math.sin(a) * d;
      B.add(M.magitek, new THREE.BoxGeometry(rng.range(1.2, 3.4), 0.22, rng.range(0.9, 2.6)),
        mat4([px, eco.height(px, pz) + 0.14, pz], [rng.gauss(0, 0.3), rng.next() * 3, rng.gauss(0, 0.3)]));
    }

    this.crash = { x: site.x, y: y + 5, z: site.z };
    const l = new THREE.PointLight(0xff5a1e, 3.0, 26, 2);
    l.position.set(site.x + 3, y + 2.4, site.z);
    this.root.add(l);
    this.lights.push({ light: l, night: 9, day: 2.4, flicker: true });
  }

  // ------------------------------------------------------------ mesa outpost

  /** Comms mast, containers and a truck at the foot of Blackrock Mesa. */
  _mesaOutpost(this: Outposts, B: PartBuilder, site: EcoSite) {
    const M = this.mats;
    const rng = new Rng(3030);
    const base = this._base(site.x, site.z, 10);
    const world = mat4([site.x, base, site.z], [0, 0.7, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, p: Vec3, r?: Vec3, s?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(p, r, s)));

    put(M.concrete, new THREE.BoxGeometry(6, 0.5, 6), [0, 0.2, 0]);
    lattice(B, M.steel, world.clone().multiply(mat4([0, 0.4, 0])),
      { height: 34, baseW: 3.4, topW: 1.1, bays: 8, leg: 0.16 });
    put(M.steel, new THREE.CylinderGeometry(0.07, 0.07, 6, 6), [0, 37, 0]);
    put(M.hot, new THREE.SphereGeometry(0.35, 8, 6), [0, 40.2, 0]);
    for (const [h, r] of [[26, 1.5], [30, 1.2]]) {
      put(M.steel, new THREE.BoxGeometry(0.5, 2.0, 0.12), [r, h, 0], [0, 0, 0]);
      put(M.steel, new THREE.BoxGeometry(0.12, 2.0, 0.5), [0, h, r]);
    }
    // dish
    const dish = new THREE.SphereGeometry(1.9, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.36);
    put(M.cream, dish, [3.2, 8.5, 0], [Math.PI * 0.62, 0, 0.5]);
    put(M.steel, new THREE.CylinderGeometry(0.12, 0.14, 8.5, 6), [3.2, 4.3, 0]);

    // shipping containers
    const box = new THREE.BoxGeometry(6.1, 2.6, 2.44);
    put(M.rust, box, [9, 1.3, -3], [0, 0.12, 0]);
    put(M.red, box, [9.4, 3.95, -3.1], [0, -0.05, 0]);
    put(M.rust, box, [7.5, 1.3, 3.6], [0, 1.35, 0]);
    // chain fence posts around the compound
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = Math.cos(a) * 16, pz = Math.sin(a) * 16;
      put(M.steel, new THREE.CylinderGeometry(0.05, 0.06, 2.0, 5), [px, 1.0, pz], [0, 0, rng.gauss(0, 0.05)]);
    }
    // a truck parked in the compound, for scale against the mast
    put(M.rust, new THREE.BoxGeometry(5.2, 1.0, 2.1), [-8, 0.9, 4], [0, 0.4, 0]);
    put(M.rust, new THREE.BoxGeometry(1.9, 1.4, 2.0), [-6.4, 1.9, 3.3], [0, 0.4, 0]);
    const tyre = new THREE.CylinderGeometry(0.5, 0.5, 0.34, 10);
    tyre.rotateX(Math.PI / 2);
    for (const [ax, az] of [[-6.6, 4.9], [-6.6, 3.1], [-9.4, 4.9], [-9.4, 3.1]]) {
      put(M.dark, tyre, [ax, 0.5, az], [0, 0.4, 0]);
    }
  }

  // ----------------------------------------------------------- water tower

  /** Riveted tank on lattice legs — pure vertical scale next to the buttes. */
  _waterTower(this: Outposts, B: PartBuilder, site: EcoSite) {
    const M = this.mats;
    const base = this._base(site.x, site.z, 6);
    const world = mat4([site.x, base, site.z], [0, 0.4, 0]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, p: Vec3, r?: Vec3, s?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(p, r, s)));

    lattice(B, M.steel, world, { height: 16, baseW: 5.2, topW: 3.4, bays: 4, leg: 0.15 });
    put(M.rust, new THREE.CylinderGeometry(3.4, 3.4, 6.2, 14), [0, 19.4, 0]);
    put(M.rust, new THREE.ConeGeometry(3.6, 1.9, 14), [0, 23.4, 0]);
    put(M.rust, new THREE.ConeGeometry(3.5, 2.0, 14), [0, 15.3, 0], [Math.PI, 0, 0]);
    for (const y of [17.4, 21.2]) {
      put(M.steel, new THREE.TorusGeometry(3.45, 0.09, 5, 16), [0, y, 0], [Math.PI / 2, 0, 0]);
    }
    // access ladder and rail
    for (let i = 0; i < 22; i++) {
      put(M.steel, new THREE.BoxGeometry(0.5, 0.05, 0.05), [3.7, 1.0 + i * 0.9, 0]);
    }
    put(M.steel, new THREE.TorusGeometry(3.9, 0.05, 4, 16), [0, 22.6, 0], [Math.PI / 2, 0, 0]);
    put(M.steel, new THREE.CylinderGeometry(0.16, 0.16, 15, 8), [2.2, 8.0, 1.6]);
  }

  // ------------------------------------------------------------------ ruins

  /** A Solheim colonnade, half standing, half fallen into the scrub. */
  _ruins(this: Outposts, B: PartBuilder, site: EcoSite) {
    const M = this.mats;
    const rng = new Rng(6060);
    const eco = this.eco;
    const yaw = 0.55;
    const cols = 11;
    const drum = new THREE.CylinderGeometry(1.05, 1.15, 1.5, 12);

    // stylobate
    for (let i = 0; i < 3; i++) {
      const bx = site.x, bz = site.z;
      B.add(M.pale, new THREE.BoxGeometry(38 - i * 2.6, 0.6, 15 - i * 1.6),
        mat4([bx, this._base(bx, bz, 14) + 0.3 + i * 0.55, bz], [0, yaw, 0]));
    }
    const top = this._base(site.x, site.z, 14) + 1.75;

    for (let i = 0; i < cols; i++) {
      for (const sz of [-1, 1]) {
        const t = (i / (cols - 1) - 0.5) * 34;
        const px = site.x + Math.cos(yaw) * t, pz = site.z - Math.sin(yaw) * t;
        const zx = px + Math.sin(yaw) * sz * 5.2, zz = pz + Math.cos(yaw) * sz * 5.2;
        const drums = i % 4 === 1 ? rng.int(1, 3) : rng.int(5, 8);
        for (let d = 0; d < drums; d++) {
          B.add(M.pale, drum, mat4([zx + rng.gauss(0, 0.06), top + 0.75 + d * 1.5, zz + rng.gauss(0, 0.06)],
            [rng.gauss(0, 0.012), rng.next() * 3, rng.gauss(0, 0.012)]));
        }
        if (drums > 4) {
          // capital block on the columns that are still up
          B.add(M.pale, new THREE.BoxGeometry(2.6, 0.5, 2.6),
            mat4([zx, top + 0.75 + drums * 1.5, zz], [0, yaw, 0]));
        }
      }
    }
    // architrave fragments over the intact end
    for (let i = 0; i < 4; i++) {
      const t = (i / 10 - 0.42) * 34;
      const px = site.x + Math.cos(yaw) * t, pz = site.z - Math.sin(yaw) * t;
      B.add(M.pale, new THREE.BoxGeometry(4.0, 1.5, 12.6), mat4([px, top + 12.9, pz], [0, yaw, 0]));
    }
    // fallen drums rolling away downhill
    for (let i = 0; i < 22; i++) {
      const a = rng.next() * Math.PI * 2, d = 8 + rng.range(0, 24);
      const px = site.x + Math.cos(a) * d, pz = site.z + Math.sin(a) * d;
      B.add(M.pale, drum, mat4([px, eco.height(px, pz) + 0.7, pz],
        [Math.PI / 2 + rng.gauss(0, 0.3), rng.next() * 3, rng.gauss(0, 0.3)]));
    }
  }

  // -------------------------------------------------------------- wind pump

  /** Farm windmill and stock pens: the sign that somebody worked this land. */
  _windPump(this: Outposts, B: PartBuilder, site: EcoSite) {
    const M = this.mats;
    const rng = new Rng(1515);
    const base = this._base(site.x, site.z, 5);
    const world = mat4([site.x, base, site.z]);
    const put = (mat: THREE.Material, geo: THREE.BufferGeometry, p: Vec3, r?: Vec3, s?: Vec3) => B.add(mat, geo, world.clone().multiply(mat4(p, r, s)));

    lattice(B, M.steel, world, { height: 11, baseW: 2.6, topW: 0.9, bays: 4, leg: 0.09 });
    put(M.steel, new THREE.BoxGeometry(0.6, 0.5, 0.6), [0, 11.2, 0]);
    put(M.rust, new THREE.BoxGeometry(0.1, 1.6, 2.4), [-1.2, 11.6, 0]);
    // trough and pens
    put(M.rust, new THREE.CylinderGeometry(1.7, 1.7, 0.7, 14), [2.6, 0.35, 1.2]);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      put(M.wood, new THREE.CylinderGeometry(0.07, 0.09, 1.3, 5),
        [Math.cos(a) * 9, 0.6, 6 + Math.sin(a) * 6], [rng.gauss(0, 0.06), 0, rng.gauss(0, 0.06)]);
    }

    // the wheel spins, so this corner of the frame is never quite still
    const hub = new THREE.Group();
    const WB = new PartBuilder();
    WB.add(M.steel, new THREE.CylinderGeometry(0.22, 0.22, 0.34, 10), mat4([0, 0, 0], [Math.PI / 2, 0, 0]));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      WB.add(M.rust, new THREE.BoxGeometry(0.42, 1.5, 0.05),
        mat4([Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0], [0, 0, a + 0.5]));
      WB.add(M.steel, new THREE.BoxGeometry(0.05, 1.5, 0.05),
        mat4([Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0], [0, 0, a]));
    }
    WB.add(M.steel, new THREE.TorusGeometry(2.2, 0.04, 4, 20));
    WB.build(hub, { cast: true, receive: false, name: 'windwheel' });
    hub.position.set(site.x, base + 11.4, site.z + 0.8);
    this.root.add(hub);
    this.spinners.push({ obj: hub, rate: 1.35 });
  }

  // ----------------------------------------------------------------- update

  /**
   * @param t seconds
   * @param night 0 by day, 1 after dark
   */
  update(dt: number, t: number, night: number, camPos?: THREE.Vector3) {
    for (const s of this.spinners) s.obj.rotation.z += dt * s.rate;
    if (camPos) {
      // structures are only worth a shadow cascade while you can walk up to
      // them; past that they are silhouettes and nothing else
      for (const g of this.groups) {
        const d = g.pos.distanceTo(camPos);
        const cast = g.cast && d < 65;
        if (g.casting !== cast) {
          g.casting = cast;
          for (const m of g.group.children) m.castShadow = cast;
        }
      }
    }
    for (const l of this.lights) {
      const flick = l.flicker
        ? 0.78 + 0.3 * Math.sin(t * 9.1) * Math.sin(t * 3.3) + 0.1 * Math.sin(t * 19.4)
        : 1;
      l.light.intensity = ((l.day || 0) + (l.night - (l.day || 0)) * night) * flick;
    }
    if (this.mats) {
      this.mats.lamp.emissiveIntensity = 0.3 + night * 1.9;
      this.mats.hot.emissiveIntensity = 1.3 + night * 1.8;
    }
  }
}

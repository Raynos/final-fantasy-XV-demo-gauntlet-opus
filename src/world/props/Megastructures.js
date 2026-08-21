import * as THREE from 'three';
import { Rng } from '../../util/Rng.js';
import { Noise } from '../../util/Noise.js';
import { PartBuilder, loft, ring } from './PartBuilder.js';
import { magitekMaterial, concreteMaterial, glowMaterial, rockMaterial } from './PropMaterials.js';

/**
 * The things on the horizon that tell you what world this is.
 *
 * Four story-bearing silhouettes sit 1-4.5 km out, one in each quadrant the
 * cinematic shots look toward, so no framing of the basin is ever a pure
 * landscape: a Niflheim dreadnought hanging over the northern ranges, the
 * Imperial capital's tower cluster on the north-east skyline, the Meteor of
 * the Disc glowing in the south-west, and a Solheim viaduct striding across
 * the western basin at a kilometre.
 *
 * Everything is merged per material and never casts shadows — a shadow map
 * cascade has no business rendering a thing four kilometres away — so the
 * whole set costs a handful of draw calls. Aerial perspective (injected by
 * `sky/MaterialPatch`) does the distance work for us.
 */

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

function mat4(pos, rot = [0, 0, 0], scale = [1, 1, 1]) {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]), _q,
    new THREE.Vector3(scale[0], scale[1], scale[2])
  );
}

/** Angular rock/crystal mass — meteor shards and ruin rubble at scale. */
function shard(seed, r, stretch = [1, 1, 1], warp = 0.4) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const n = new Noise(seed);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + n.fbm3(v.x / r, v.y / r, v.z / r, 3) * warp;
    v.multiplyScalar(k);
    v.x *= stretch[0]; v.y *= stretch[1]; v.z *= stretch[2];
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export class Megastructures {
  /**
   * @param {import('../veg/Ecology.js').Ecology} eco
   * @param {THREE.Scene} scene
   */
  constructor(eco, scene) {
    this.eco = eco;
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'megastructures';
    this.movers = [];
    this.glows = [];
  }

  build() {
    this.mats = {
      hull: magitekMaterial(0x2a2f37),
      hullDark: magitekMaterial(0x171a20),
      stone: rockMaterial(0x8b7f6d, 0.95, false),
      pale: concreteMaterial(0x8e8779, 0.94),
      city: concreteMaterial(0x5d6470, 0.85),
      lamp: glowMaterial(0xffb066, 2.0, 0x100a06),
      beacon: glowMaterial(0xff3b21, 3.0, 0x140503),
      thruster: glowMaterial(0x63c8ff, 3.4, 0x040a12),
      meteorGlow: glowMaterial(0xff8a2e, 2.2, 0x1a0d05),
      windows: glowMaterial(0xffd9a0, 0.0, 0x555c67),
    };
    for (const k of Object.keys(this.mats)) this.mats[k].name = `mega_${k}`;

    this._dreadnought();
    this._escort();
    this._capital();
    this._meteor();
    this._viaduct();

    this.scene.add(this.root);
  }

  // ------------------------------------------------------------- dreadnought

  /**
   * Niflheim capital ship, 560 m of angular iron, hanging nose-down-basin over
   * the northern ranges. Placed so it clears the ridgeline in every shot that
   * looks north or west.
   */
  _dreadnought() {
    const M = this.mats;
    const B = new PartBuilder();
    const L = 640, W = 126, H = 88;

    // hull: a long asymmetric wedge, deepest a third of the way back
    const secs = [];
    const prof = [
      [-0.50, 0.10, 0.10, 0.04], [-0.42, 0.30, 0.34, 0.10], [-0.30, 0.62, 0.72, 0.22],
      [-0.14, 0.92, 1.00, 0.34], [0.04, 1.00, 0.96, 0.40], [0.22, 0.92, 0.82, 0.40],
      [0.36, 0.80, 0.68, 0.36], [0.46, 0.60, 0.48, 0.28], [0.50, 0.44, 0.34, 0.22],
    ];
    for (const [t, w, h, drop] of prof) {
      secs.push({ x: t * L, pts: ring(14, w * W * 0.5, -h * H * drop, h * H * (1 - drop), 3.0) });
    }
    B.add(M.hull, loft(secs));

    // armoured prow: a wedge ram out past the bow so the ship reads as a
    // weapon and not as a zeppelin
    B.add(M.hullDark, new THREE.BoxGeometry(96, 22, 34),
      mat4([-L * 0.52, -6, 0], [0, 0, 0.13]));
    B.add(M.hull, new THREE.BoxGeometry(60, 12, 20), mat4([-L * 0.56, -14, 0], [0, 0, 0.2]));

    // dorsal deck + stepped command tower
    B.add(M.hullDark, new THREE.BoxGeometry(L * 0.54, 6, W * 0.44), mat4([L * 0.02, H * 0.5, 0]));
    B.add(M.hull, new THREE.BoxGeometry(74, 26, 44), mat4([L * 0.16, H * 0.5 + 14, 0], [0, 0, -0.03]));
    B.add(M.hull, new THREE.BoxGeometry(50, 30, 32), mat4([L * 0.20, H * 0.5 + 40, 0]));
    B.add(M.hull, new THREE.BoxGeometry(30, 26, 22), mat4([L * 0.23, H * 0.5 + 66, 0]));
    B.add(M.hullDark, new THREE.CylinderGeometry(1.4, 2.6, 54, 6), mat4([L * 0.25, H * 0.5 + 104, 0]));
    // gun batteries down the spine, the detail that gives the hull its length
    for (let i = 0; i < 7; i++) {
      const x = (-0.34 + i * 0.10) * L;
      B.add(M.hullDark, new THREE.CylinderGeometry(6, 7.5, 7, 8), mat4([x, H * 0.5 + 5, 0]));
      B.add(M.hull, new THREE.BoxGeometry(20, 5, 7), mat4([x - 9, H * 0.5 + 9, 0], [0, 0, 0.12]));
    }

    // ventral hangar throat
    B.add(M.hullDark, new THREE.BoxGeometry(L * 0.30, 10, W * 0.44), mat4([-L * 0.06, -H * 0.34, 0]));

    // engine block: four nacelles under the stern, glowing aft
    for (const sz of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const p = [L * 0.40, sy * 17 - 4, sz * 30];
        B.add(M.hull, new THREE.CylinderGeometry(13, 15, 62, 10),
          mat4(p, [0, 0, Math.PI / 2]));
        B.add(M.thruster, new THREE.CylinderGeometry(11, 11, 3, 10),
          mat4([p[0] + 32, p[1], p[2]], [0, 0, Math.PI / 2]));
      }
    }

    // stabiliser fins, swept back
    for (const sz of [-1, 1]) {
      B.add(M.hull, new THREE.BoxGeometry(120, 3.4, 78),
        mat4([L * 0.24, 6, sz * (W * 0.5 + 26)], [sz * 0.22, sz * 0.30, 0]));
    }
    B.add(M.hull, new THREE.BoxGeometry(90, 54, 3.4), mat4([L * 0.40, 32, 0], [0, 0, 0.16]));

    // running lights along the chine and under the bow
    for (let i = 0; i < 26; i++) {
      const t = -0.48 + (i / 25) * 0.96;
      for (const sz of [-1, 1]) {
        B.add(i % 5 === 0 ? M.beacon : M.lamp, new THREE.BoxGeometry(4, 1.6, 1.6),
          mat4([t * L, -2 + Math.cos(t * 3) * 6, sz * (W * 0.5) * (0.35 + 0.65 * Math.cos(t * 2.2))]));
      }
    }

    const g = B.build(new THREE.Group(), { cast: false, receive: false, name: 'dreadnought' });
    g.position.set(-1240, 470, -1560);
    g.rotation.y = 2.05;
    g.rotation.z = 0.03;
    this.root.add(g);
    this.movers.push({ obj: g, base: g.position.clone(), drift: [0.42, 0, -0.16], bob: 9, rate: 0.021 });
    this.dreadnought = g;
  }

  /** Three magitek dropships running escort, closer and lower than the ship. */
  _escort() {
    const M = this.mats;
    const B = new PartBuilder();
    const rng = new Rng(3311);
    const body = [];
    for (const t of [-0.5, -0.3, 0.0, 0.28, 0.5]) {
      const w = 1 - Math.abs(t) * 0.9;
      body.push({ x: t * 34, pts: ring(10, 6.5 * w, -3.4 * w, 4.2 * w, 2.6) });
    }
    const hullGeo = loft(body);

    for (let i = 0; i < 3; i++) {
      const at = mat4([i * -128 + rng.gauss(0, 26), i * 22, i * -92 + rng.gauss(0, 26)],
        [0, rng.gauss(0, 0.06), 0], [1.6, 1.6, 1.6]);
      const put = (mat, geo, p, r) => B.add(mat, geo, at.clone().multiply(mat4(p, r)));
      put(M.hull, hullGeo, [0, 0, 0]);
      for (const sz of [-1, 1]) {
        put(M.hullDark, new THREE.BoxGeometry(15, 1.6, 16), [-2, 3, sz * 10], [sz * 0.2, 0, 0]);
        put(M.thruster, new THREE.CylinderGeometry(2.1, 2.1, 1.2, 8), [15, 0, sz * 4], [0, 0, Math.PI / 2]);
      }
      put(M.beacon, new THREE.BoxGeometry(1.4, 1.4, 1.4), [-15, 3.5, 0]);
    }

    const g = B.build(new THREE.Group(), { cast: false, receive: false, name: 'dropships' });
    g.position.set(-820, 300, -980);
    g.rotation.y = 2.05;
    this.root.add(g);
    this.movers.push({ obj: g, base: g.position.clone(), drift: [1.5, 0, -0.6], bob: 5, rate: 0.06 });
  }

  // ----------------------------------------------------------------- capital

  /**
   * The Imperial capital on the north-east skyline: a curtain wall, a dense
   * tower cluster and one colossal spire. Sits on a raised plinth so the far
   * ranges cannot swallow it.
   */
  _capital() {
    const M = this.mats;
    const B = new PartBuilder();
    const rng = new Rng(7702);
    const spread = 1500;

    // curtain wall with towers
    for (let i = -9; i <= 9; i++) {
      const x = i * (spread / 19);
      const h = 96 + rng.range(0, 26);
      B.add(M.city, new THREE.BoxGeometry(spread / 18, h, 60), mat4([x, h * 0.5, 0]));
      if (i % 3 === 0) {
        B.add(M.city, new THREE.CylinderGeometry(34, 40, h + 74, 8), mat4([x, (h + 74) * 0.5, 6]));
      }
    }

    // tower cluster rising behind it
    for (let i = 0; i < 44; i++) {
      const x = rng.gauss(0, spread * 0.30);
      const z = 130 + Math.abs(rng.gauss(0, 300));
      const fall = 1 - Math.min(1, Math.abs(x) / (spread * 0.62));
      const h = (110 + rng.range(0, 300)) * (0.4 + 0.85 * fall);
      const w = 26 + rng.range(0, 46);
      // a good half of the blocks are lit stock, so the skyline comes alight
      // after dark instead of staying a dead grey comb
      const face = rng.next() < 0.55 ? this.mats.windows : M.city;
      B.add(face, new THREE.BoxGeometry(w, h, w * rng.range(0.7, 1.3)),
        mat4([x, h * 0.5, z], [0, rng.next() * 1.5, 0]));
      if (rng.next() < 0.35) {
        B.add(M.city, new THREE.CylinderGeometry(1.6, 4, h * 0.28, 6), mat4([x, h + h * 0.14, z]));
      }
    }

    // the Citadel: one spire that dwarfs everything around it
    const spire = [];
    for (const [t, w] of [[0, 1.0], [0.12, 0.82], [0.34, 0.56], [0.58, 0.40], [0.80, 0.26], [0.93, 0.30], [1.0, 0.05]]) {
      spire.push({ x: t * 640, pts: ring(8, 62 * w, -62 * w, 62 * w, 4.5) });
    }
    const spireGeo = loft(spire);
    spireGeo.rotateZ(Math.PI / 2);
    B.add(M.city, spireGeo, mat4([-160, 0, 420]));
    B.add(M.lamp, new THREE.BoxGeometry(10, 10, 10), mat4([-160, 660, 420]));
    // flanking buttress towers
    for (const sx of [-1, 1]) {
      B.add(M.city, new THREE.CylinderGeometry(20, 30, 380, 6), mat4([-160 + sx * 120, 190, 420]));
    }

    const g = B.build(new THREE.Group(), { cast: false, receive: false, name: 'capital' });
    g.position.set(2560, 150, -3180);
    g.rotation.y = -0.42;
    this.root.add(g);
    this.glows.push(M.windows);
  }

  // ------------------------------------------------------------------ meteor

  /**
   * The Meteor of the Disc: a mountain-sized starfall wedged in the south-west
   * horizon, its fissures still burning. Reads as a warm accent against the
   * cool distance haze.
   */
  _meteor() {
    const M = this.mats;
    const B = new PartBuilder();
    const rng = new Rng(1919);

    B.add(M.stone, shard(2201, 330, [1.35, 1.05, 1.1], 0.34), mat4([0, 130, 0]));
    B.add(M.stone, shard(2202, 190, [1.05, 1.9, 0.9], 0.42), mat4([-250, 190, 150], [0.3, 0.7, 0.4]));
    B.add(M.stone, shard(2203, 160, [1.2, 2.2, 1.0], 0.44), mat4([280, 230, -110], [-0.24, 1.4, -0.3]));
    // glowing fissures: thin slabs peeking between the masses
    for (let i = 0; i < 26; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 190 + rng.range(0, 210);
      B.add(M.meteorGlow, new THREE.BoxGeometry(rng.range(26, 90), rng.range(18, 80), 14),
        mat4([Math.cos(a) * r, 40 + rng.range(0, 280), Math.sin(a) * r * 0.7],
          [rng.gauss(0, 0.4), a, rng.gauss(0, 0.5)]));
    }
    // ejecta ring around the impact
    for (let i = 0; i < 30; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 420 + rng.range(0, 380);
      const s = rng.range(20, 74);
      const px = Math.cos(a) * r, pz = Math.sin(a) * r * 0.8;
      B.add(M.stone, shard(2300 + i, s, [1.3, 1.6, 1.0], 0.5),
        mat4([px, s * 0.3, pz], [rng.gauss(0, 0.5), rng.next() * 3, rng.gauss(0, 0.5)]));
    }

    const g = B.build(new THREE.Group(), { cast: false, receive: false, name: 'meteor' });
    // Centre of the `cauthess` zone in WorldMap.js -- "a meteor the size of a
    // mountain range, still glowing where it struck", which is also where the
    // `discCrater` landform puts the impact bowl. It used to sit at
    // (-2010, 1890): 4 km away, in the wrong region, close enough to Cape Caem
    // that its 857 m outer shards leaned over the headland and read as
    // unexplained slabs floating above the sea.
    const x = -1020, z = -2160;
    g.position.set(x, this.eco.height(x, z) - 90, z);
    g.rotation.y = 0.6;
    this.root.add(g);
  }

  // ----------------------------------------------------------------- viaduct

  /**
   * A Solheim viaduct, a kilometre west, striding north-south across the basin
   * on piers up to 90 m with its centre spans long collapsed. Close enough to
   * read as masonry, far enough to give the basin a scale it otherwise has no
   * way to state.
   *
   * The deck follows a smoothed copy of the ground so the structure spans the
   * valleys instead of burying itself in the ridges between them.
   */
  _viaduct() {
    const M = this.mats;
    const B = new PartBuilder();
    const eco = this.eco;
    const rng = new Rng(5150);
    const a = { x: -1010, z: -740 }, b = { x: -790, z: 300 };
    const bays = 21;
    const bayAt = (i) => ({
      x: a.x + (b.x - a.x) * (i / bays),
      z: a.z + (b.z - a.z) * (i / bays),
    });
    const span = Math.hypot(b.x - a.x, b.z - a.z) / bays;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;

    // ground profile, then a heavy smooth so the deck is a viaduct, not a wall
    const ground = [];
    for (let i = 0; i <= bays; i++) { const p = bayAt(i); ground.push(eco.height(p.x, p.z)); }
    let deck = ground.slice();
    for (let pass = 0; pass < 12; pass++) {
      const t = deck.slice();
      for (let i = 0; i <= bays; i++) {
        const l = t[Math.max(0, i - 1)], r = t[Math.min(bays, i + 1)];
        deck[i] = Math.max((l + t[i] * 2 + r) * 0.25, ground[i] + 16);
      }
    }
    for (let i = 0; i <= bays; i++) deck[i] += 54;

    // the middle bays came down long ago
    const gone = (i) => i >= 9 && i <= 12;

    for (let i = 0; i <= bays; i++) {
      const p = bayAt(i);
      const gy = ground[i];
      const top = gone(i) ? gy + (deck[i] - gy) * rng.range(0.25, 0.6) : deck[i];
      const h = top - gy;
      if (h < 6) continue;
      // battered pier, wider at the foot
      const steps = 5;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const w = 24 * (1 - t * 0.40);
        B.add(M.pale, new THREE.BoxGeometry(w, h / steps + 0.6, 16 * (1 - t * 0.3)),
          mat4([p.x, gy + h * (t + 0.5 / steps), p.z], [0, yaw, 0]));
      }
      // arch springing (a coarse ring of voussoirs) toward the next pier
      if (!gone(i) && !gone(i + 1) && i < bays) {
        const q = bayAt(i + 1);
        const dY = deck[i + 1] - deck[i];
        const segs = 9;
        for (let k = 1; k < segs; k++) {
          const t = k / segs;
          const arc = Math.PI * t;
          const mx = p.x + (q.x - p.x) * t, mz = p.z + (q.z - p.z) * t;
          B.add(M.pale, new THREE.BoxGeometry(span / segs + 2.5, 12, 14),
            mat4([mx, deck[i] + dY * t - 28 + Math.sin(arc) * 24, mz], [0, yaw, -Math.cos(arc) * 0.9]));
        }
        // deck slab and parapet
        const my = deck[i] + dY * 0.5;
        B.add(M.pale, new THREE.BoxGeometry(span + 3, 7, 21),
          mat4([(p.x + q.x) * 0.5, my + 3.5, (p.z + q.z) * 0.5], [0, yaw, Math.atan2(dY, span)]));
        for (const sz of [-1, 1]) {
          B.add(M.pale, new THREE.BoxGeometry(span + 3, 5, 2.6),
            mat4([(p.x + q.x) * 0.5 + Math.cos(yaw) * sz * 10.5, my + 9,
              (p.z + q.z) * 0.5 - Math.sin(yaw) * sz * 10.5], [0, yaw, Math.atan2(dY, span)]));
        }
      }
    }

    // collapsed masonry heaped under the gap
    for (let i = 0; i < 34; i++) {
      const p = bayAt(8.5 + rng.next() * 4.5);
      const px = p.x + rng.gauss(0, 34), pz = p.z + rng.gauss(0, 34);
      const s = rng.range(4, 15);
      B.add(M.pale, shard(2400 + i, s, [1.5, 0.7, 1.2], 0.3),
        mat4([px, eco.height(px, pz) + s * 0.25, pz], [rng.gauss(0, 0.4), rng.next() * 3, rng.gauss(0, 0.4)]));
    }

    B.build(this.root, { cast: false, receive: true, name: 'viaduct' });
  }

  // ------------------------------------------------------------------ update

  /**
   * Airborne hulls drift and breathe; the capital's windows come up at night.
   * @param {number} dt
   * @param {number} t seconds
   * @param {number} night 0 by day, 1 after dark
   */
  update(dt, t, night) {
    for (const m of this.movers) {
      m.obj.position.set(
        m.base.x + m.drift[0] * t * 0.35,
        m.base.y + Math.sin(t * m.rate * 6.0) * m.bob,
        m.base.z + m.drift[2] * t * 0.35
      );
      m.obj.rotation.z = Math.sin(t * m.rate * 4.1) * 0.012;
    }
    for (const g of this.glows) g.emissiveIntensity = night * 1.6;
    if (this.mats) {
      this.mats.beacon.emissiveIntensity = 2.2 + 2.6 * (0.5 + 0.5 * Math.sin(t * 2.4));
      this.mats.meteorGlow.emissiveIntensity = 1.6 + 1.4 * night;
      this.mats.lamp.emissiveIntensity = 1.2 + 2.2 * night;
    }
  }
}

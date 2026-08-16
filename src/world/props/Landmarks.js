import * as THREE from 'three';
import { Rng } from '../../util/Rng.js';
import { Noise } from '../../util/Noise.js';
import { PartBuilder } from './PartBuilder.js';
import {
  rockMaterial, woodMaterial, rustMaterial, canvasClothMaterial,
  runeTexture, signTexture,
} from './PropMaterials.js';

/**
 * FFXV-flavoured structures: a haven, ruined pylons, an abandoned outpost,
 * telegraph poles carrying sagging wire along the road, signage, a dead truck
 * and fence runs. Everything is baked into world space and merged per material
 * so the whole set of landmarks costs under a dozen draw calls.
 */

const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

function mat4(pos, rot = [0, 0, 0], scale = [1, 1, 1]) {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]), _q,
    new THREE.Vector3(scale[0], scale[1], scale[2])
  );
}

/** Corrugated sheet: a plane rippled along its width. */
function corrugated(w, h, pitch = 0.16, amp = 0.028) {
  const segs = Math.max(8, Math.round(w / pitch) * 2);
  const g = new THREE.PlaneGeometry(w, h, segs, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setZ(i, Math.sin((p.getX(i) / pitch) * Math.PI) * amp);
  }
  g.computeVertexNormals();
  return g;
}

/** Lumpy stone block, used for rubble, camp rocks and pylon debris. */
function block(seed, w, h, d, rough = 0.16) {
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const n = new Noise(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = n.fbm3(x * 1.3, y * 1.3, z * 1.3, 3) * rough;
    p.setXYZ(i, x * (1 + k), y * (1 + k * 0.7), z * (1 + k));
  }
  g.computeVertexNormals();
  return g;
}

export class Landmarks {
  constructor(eco, scene) {
    this.eco = eco;
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'landmarks';
    this.lights = [];
  }

  build() {
    const eco = this.eco;
    this.mats = {
      rock: rockMaterial(0x8d7663, 0.93),
      pale: rockMaterial(0x9c8d78, 0.9),
      wood: woodMaterial(0x7d674c),
      dark: woodMaterial(0x4a3d30),
      rust: Object.assign(rustMaterial(0x8f5c39, 0.5), { side: THREE.DoubleSide }),
      steel: new THREE.MeshStandardMaterial({ color: 0x6a6d72, roughness: 0.55, metalness: 0.85 }),
      cloth: canvasClothMaterial(0x36414c),
      ceramic: new THREE.MeshStandardMaterial({ color: 0xd8d4c6, roughness: 0.35, metalness: 0 }),
      wire: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.7, metalness: 0.4 }),
      ember: new THREE.MeshStandardMaterial({
        color: 0x2a1208, emissive: 0xff5a12, emissiveIntensity: 3.2, roughness: 0.85,
      }),
      rune: new THREE.MeshBasicMaterial({
        map: runeTexture(), transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0.85, side: THREE.DoubleSide,
      }),
      signA: new THREE.MeshStandardMaterial({ map: signTexture(0), roughness: 0.62, metalness: 0.1, side: THREE.DoubleSide }),
      signB: new THREE.MeshStandardMaterial({ map: signTexture(1), roughness: 0.62, metalness: 0.1, side: THREE.DoubleSide }),
    };
    this.mats.rock.name = 'rock';
    this.mats.wood.name = 'wood';

    const B = new PartBuilder();
    this.B = B;

    for (const s of eco.sites) {
      if (s.type === 'haven') this._haven(B, s);
      else if (s.type === 'obelisk') this._obelisk(B, s);
      else if (s.type === 'shack') this._shack(B, s);
      else if (s.type === 'truck') this._truck(B, s);
      else if (s.type === 'sign') this._sign(B, s);
    }
    this._telegraph(B);
    this._fences(B);

    B.build(this.root, { cast: true, receive: true, name: 'landmark' });
    this.scene.add(this.root);
  }

  // ------------------------------------------------------------------ haven

  _haven(B, site) {
    const eco = this.eco, M = this.mats;
    const rng = new Rng(9182);
    const cx = site.x, cz = site.z;
    // level the camp on the lowest ground it touches
    let base = Infinity;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      base = Math.min(base, eco.height(cx + Math.cos(a) * 4.6, cz + Math.sin(a) * 4.6));
    }
    base = Math.min(base, eco.height(cx, cz));
    const top = base + 0.62;

    // the haven slab itself
    const slab = block(5511, 10.4, 1.5, 8.6, 0.1);
    B.add(M.pale, slab, mat4([cx, base - 0.12, cz], [0, 0.22, 0]));
    // skirt of broken rock so it isn't a table floating on grass
    for (let i = 0; i < 14; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = 4.2 + rng.range(0, 1.7);
      const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d;
      const s = rng.range(0.4, 1.5);
      B.add(M.rock, block(600 + i, s * 1.6, s, s * 1.4, 0.3),
        mat4([px, eco.height(px, pz) - s * 0.28, pz], [rng.gauss(0, 0.3), rng.next() * 3, rng.gauss(0, 0.3)]));
    }

    // runes etched into the slab surface — kept out of the merged/shadow pass
    const rune = new THREE.PlaneGeometry(8.2, 8.2);
    rune.rotateX(-Math.PI / 2);
    const runeMesh = new THREE.Mesh(rune, M.rune);
    runeMesh.position.set(cx, top + 0.02, cz);
    runeMesh.rotation.y = 0.22;
    runeMesh.castShadow = false;
    runeMesh.receiveShadow = false;
    runeMesh.renderOrder = 3;
    this.root.add(runeMesh);
    this.runeMesh = runeMesh;

    // firepit
    const fx = cx + 1.5, fz = cz - 0.9;
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + rng.gauss(0, 0.1);
      const r = 0.72 + rng.gauss(0, 0.05);
      B.add(M.rock, block(300 + i, 0.34, 0.3, 0.28, 0.35),
        mat4([fx + Math.cos(a) * r, top + 0.11, fz + Math.sin(a) * r],
          [rng.gauss(0, 0.2), rng.next() * 3, rng.gauss(0, 0.2)]));
    }
    const log = new THREE.CylinderGeometry(0.075, 0.09, 1.0, 7);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      B.add(M.dark, log, mat4([fx + Math.cos(a) * 0.16, top + 0.28, fz + Math.sin(a) * 0.16],
        [Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95]));
    }
    B.add(M.ember, new THREE.SphereGeometry(0.3, 12, 8),
      mat4([fx, top + 0.12, fz], [0, 0, 0], [1, 0.45, 1]));
    const fire = new THREE.PointLight(0xff7a26, 9, 16, 2);
    fire.position.set(fx, top + 0.55, fz);
    fire.castShadow = false;
    this.root.add(fire);
    this.lights.push({ light: fire, kind: 'fire', base: 9 });

    // tent: A-frame with a fly sheet and guy lines
    const tx = cx - 2.4, tz = cz + 1.1;
    const panel = new THREE.PlaneGeometry(3.4, 2.05);
    B.add(M.cloth, panel, mat4([tx, top + 0.72, tz + 0.72], [0.0, 0, 0], [1, 1, 1])
      .multiply(new THREE.Matrix4().makeRotationX(-0.62)));
    B.add(M.cloth, panel, mat4([tx, top + 0.72, tz - 0.72], [0, 0, 0], [1, 1, 1])
      .multiply(new THREE.Matrix4().makeRotationX(0.62)));
    const gable = new THREE.BufferGeometry();
    gable.setAttribute('position', new THREE.Float32BufferAttribute(
      [-0.95, 0, 0, 0.95, 0, 0, 0, 1.42, 0], 3));
    gable.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    gable.computeVertexNormals();
    B.add(M.cloth, gable, mat4([tx + 1.7, top, tz], [0, Math.PI / 2, 0]));
    B.add(M.cloth, gable, mat4([tx - 1.7, top, tz], [0, Math.PI / 2, 0]));
    const pole = new THREE.CylinderGeometry(0.028, 0.028, 1.5, 6);
    B.add(M.steel, pole, mat4([tx + 1.7, top + 0.75, tz]));
    B.add(M.steel, pole, mat4([tx - 1.7, top + 0.75, tz]));
    const guy = new THREE.CylinderGeometry(0.008, 0.008, 1.5, 4);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        B.add(M.wire, guy, mat4([tx + sx * 2.25, top + 0.42, tz + sz * 0.55],
          [sz * 0.55, 0, -sx * 0.72]));
      }
    }

    // two camp chairs + a cooler, angled at the fire
    for (let i = 0; i < 2; i++) {
      const a = -0.9 + i * 1.5;
      const px = fx + Math.cos(a) * 2.0, pz = fz + Math.sin(a) * 2.0;
      const yaw = Math.atan2(fx - px, fz - pz);
      B.add(M.cloth, new THREE.BoxGeometry(0.6, 0.06, 0.58), mat4([px, top + 0.44, pz], [0, yaw, 0]));
      B.add(M.cloth, new THREE.BoxGeometry(0.6, 0.6, 0.06), mat4([px, top + 0.72, pz], [0.28, yaw, 0])
        .multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.28)));
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          B.add(M.steel, new THREE.CylinderGeometry(0.018, 0.018, 0.46, 5),
            mat4([px + sx * 0.26, top + 0.22, pz + sz * 0.24], [0, yaw, 0]));
        }
      }
    }
    B.add(M.steel, new THREE.BoxGeometry(0.78, 0.46, 0.5), mat4([cx - 0.4, top + 0.23, cz - 2.3], [0, 0.4, 0]));
    B.add(M.wood, new THREE.BoxGeometry(0.62, 0.5, 0.62), mat4([cx + 2.9, top + 0.25, cz + 1.9], [0, -0.3, 0]));
    this.havenTop = top;
  }

  // ---------------------------------------------------------------- obelisk

  _obelisk(B, site) {
    const M = this.mats, eco = this.eco;
    const rng = new Rng(1300 + Math.round(site.x));
    const h = site.tall || 20;
    const y = eco.height(site.x, site.z);
    // stepped plinth
    B.add(M.pale, block(880, 7.4, 1.1, 7.4, 0.06), mat4([site.x, y + 0.2, site.z], [0, 0.3, 0]));
    B.add(M.pale, block(881, 5.4, 0.9, 5.4, 0.06), mat4([site.x, y + 1.1, site.z], [0, 0.1, 0]));
    // tapered shaft, snapped off at the top
    const segs = 7;
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const sh = h / segs;
      const w = 2.6 * (1 - t * 0.55);
      const lean = t * t * 0.06;
      B.add(M.pale, block(890 + i, w, sh * 1.02, w, 0.05),
        mat4([site.x + lean * h * 0.2, y + 1.55 + sh * (i + 0.5), site.z],
          [0, 0.14 * i, lean]));
    }
    // broken crown
    B.add(M.pale, block(899, 1.9, 1.3, 1.6, 0.35),
      mat4([site.x + 0.28, y + 1.55 + h + 0.4, site.z + 0.1], [0.14, 0.7, -0.2]));
    // fallen debris
    for (let i = 0; i < 9; i++) {
      const a = rng.next() * Math.PI * 2, d = 4 + rng.range(0, 7);
      const px = site.x + Math.cos(a) * d, pz = site.z + Math.sin(a) * d;
      const s = rng.range(0.6, 2.2);
      B.add(M.pale, block(910 + i, s * 1.5, s * 0.8, s, 0.2),
        mat4([px, eco.height(px, pz) - s * 0.2, pz],
          [rng.gauss(0, 0.4), rng.next() * 3, rng.gauss(0, 0.4)]));
    }
  }

  // ------------------------------------------------------------------ shack

  _shack(B, site) {
    const M = this.mats, eco = this.eco;
    const rng = new Rng(2077);
    const cx = site.x, cz = site.z;
    let base = Infinity;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      base = Math.min(base, eco.height(cx + Math.cos(a) * 3.4, cz + Math.sin(a) * 3.4));
    }
    const yaw = -0.35;
    const W = 5.4, D = 4.2, H = 2.9;
    const T = (p, r = [0, 0, 0], s) => {
      const m = mat4([0, 0, 0], [0, yaw, 0]);
      return m.multiply(mat4(p, r, s));
    };
    const world = mat4([cx, base, cz]);
    const put = (mat, geo, p, r, s) => B.add(mat, geo, world.clone().multiply(T(p, r, s)));

    // stumpy foundation piers
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      put(M.rock, block(1200, 0.5, 0.5, 0.5, 0.3), [sx * (W / 2 - 0.3), 0.12, sz * (D / 2 - 0.3)]);
    }
    // floor + frame
    put(M.wood, new THREE.BoxGeometry(W, 0.16, D), [0, 0.3, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      put(M.wood, new THREE.BoxGeometry(0.14, H, 0.14), [sx * (W / 2 - 0.1), 0.38 + H / 2, sz * (D / 2 - 0.1)]);
    }
    // corrugated walls
    const wallL = corrugated(W, H);
    const wallS = corrugated(D, H);
    put(M.rust, wallL, [0, 0.38 + H / 2, -D / 2], [0, 0, 0]);
    put(M.rust, wallS, [-W / 2, 0.38 + H / 2, 0], [0, Math.PI / 2, 0]);
    put(M.rust, wallS, [W / 2, 0.38 + H / 2, 0], [0, -Math.PI / 2, 0]);
    // front wall with a doorway gap: two narrow panels
    put(M.rust, corrugated(1.8, H), [-1.7, 0.38 + H / 2, D / 2], [0, Math.PI, 0]);
    put(M.rust, corrugated(2.2, H), [1.5, 0.38 + H / 2, D / 2], [0, Math.PI, 0]);
    put(M.rust, corrugated(1.6, 0.8), [-0.3, 0.38 + H - 0.4, D / 2], [0, Math.PI, 0]);
    put(M.wood, new THREE.BoxGeometry(0.12, 2.2, 0.14), [-1.1, 0.38 + 1.1, D / 2]);
    put(M.wood, new THREE.BoxGeometry(0.12, 2.2, 0.14), [0.5, 0.38 + 1.1, D / 2]);
    // pitched roof
    const roof = corrugated(W + 0.6, D * 0.62, 0.2, 0.035);
    put(M.rust, roof, [0, 0.38 + H + 0.5, -D * 0.28], [-Math.PI / 2 + 0.42, 0, 0]);
    put(M.rust, roof, [0, 0.38 + H + 0.5, D * 0.28], [-Math.PI / 2 - 0.42, 0, 0]);
    put(M.wood, new THREE.BoxGeometry(W + 0.7, 0.1, 0.12), [0, 0.38 + H + 1.03, 0]);
    // lean-to porch
    for (const sx of [-1, 1]) {
      put(M.wood, new THREE.BoxGeometry(0.12, 2.4, 0.12), [sx * 2.2, 0.38 + 1.2, D / 2 + 1.7]);
    }
    put(M.rust, corrugated(W, 2.0, 0.2, 0.03), [0, 0.38 + 2.62, D / 2 + 0.95], [-Math.PI / 2 + 0.16, 0, 0]);

    // clutter: barrels, crates, a leaning plank
    for (let i = 0; i < 4; i++) {
      const a = rng.next() * Math.PI * 2, d = 3.6 + rng.range(0, 2.4);
      const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d;
      const gy = eco.height(px, pz);
      if (i % 2 === 0) {
        B.add(M.rust, new THREE.CylinderGeometry(0.31, 0.31, 0.9, 14),
          mat4([px, gy + 0.44, pz], [rng.gauss(0, 0.05), rng.next() * 3, rng.gauss(0, 0.05)]));
      } else {
        B.add(M.wood, new THREE.BoxGeometry(0.7, 0.55, 0.62),
          mat4([px, gy + 0.28, pz], [0, rng.next() * 3, 0]));
      }
    }
    B.add(M.wood, new THREE.BoxGeometry(0.25, 2.6, 0.05),
      mat4([cx + 2.9, base + 1.1, cz + 1.2], [0.25, 0.6, 0.45]));
  }

  // ------------------------------------------------------------------ truck

  _truck(B, site) {
    const M = this.mats, eco = this.eco;
    const y = eco.height(site.x, site.z);
    const world = mat4([site.x, y, site.z], [0, site.yaw || 0, 0.03]);
    const put = (mat, geo, p, r, s) => B.add(mat, geo, world.clone().multiply(mat4(p, r, s)));

    // chassis + flatbed
    put(M.rust, new THREE.BoxGeometry(5.4, 0.22, 2.0), [0, 0.72, 0]);
    put(M.rust, new THREE.BoxGeometry(2.9, 0.5, 2.06), [-1.2, 1.05, 0]);
    for (const sz of [-1, 1]) {
      put(M.wood, new THREE.BoxGeometry(2.9, 0.6, 0.08), [-1.2, 1.4, sz * 1.0]);
    }
    put(M.wood, new THREE.BoxGeometry(0.08, 0.6, 2.0), [-2.62, 1.4, 0]);
    // cab
    put(M.rust, new THREE.BoxGeometry(1.9, 1.35, 1.95), [1.35, 1.42, 0]);
    put(M.steel, new THREE.BoxGeometry(0.06, 0.72, 1.7), [2.28, 1.72, 0], [0, 0, -0.22]);
    for (const sz of [-1, 1]) {
      put(M.steel, new THREE.BoxGeometry(1.2, 0.62, 0.05), [1.3, 1.75, sz * 0.98]);
    }
    // bonnet, grille, one light smashed
    put(M.rust, new THREE.BoxGeometry(1.35, 0.62, 1.75), [2.85, 1.2, 0]);
    put(M.steel, new THREE.BoxGeometry(0.1, 0.5, 1.5), [3.5, 1.1, 0]);
    put(M.steel, new THREE.CylinderGeometry(0.08, 0.08, 2.0, 10), [3.5, 0.75, 0], [Math.PI / 2, 0, 0]);
    // wheels — one is off and lying flat
    const tyre = new THREE.CylinderGeometry(0.52, 0.52, 0.34, 16);
    tyre.rotateX(Math.PI / 2);
    const wheels = [[1.7, 1], [1.7, -1], [-1.5, 1]];
    for (const [ax, sz] of wheels) {
      put(M.dark, tyre, [ax, 0.55, sz * 0.98]);
      put(M.steel, new THREE.CylinderGeometry(0.24, 0.24, 0.36, 12), [ax, 0.55, sz * 0.98], [Math.PI / 2, 0, 0]);
    }
    put(M.dark, tyre, [-1.9, 0.19, -2.1], [Math.PI / 2, 0.4, 0]);
    // axle stub where the wheel came off
    put(M.steel, new THREE.CylinderGeometry(0.09, 0.09, 0.4, 8), [-1.5, 0.5, -0.98], [Math.PI / 2, 0, 0]);
  }

  // ------------------------------------------------------------------- sign

  _sign(B, site) {
    const M = this.mats, eco = this.eco;
    const z = site.roadZ, side = site.side;
    const p = eco.roadPoint(z, side, 6.2, _v.clone());
    const t = eco.roadTangent(z);
    const yaw = Math.atan2(t.x, t.y) + (side > 0 ? Math.PI : 0);
    const world = mat4([p.x, p.y, p.z], [0, yaw, 0]);
    const put = (mat, geo, pp, r, s) => B.add(mat, geo, world.clone().multiply(mat4(pp, r, s)));
    const kind = z > 0 ? M.signA : M.signB;
    put(M.steel, new THREE.CylinderGeometry(0.065, 0.075, 3.5, 8), [-0.9, 1.75, 0]);
    put(M.steel, new THREE.CylinderGeometry(0.065, 0.075, 3.5, 8), [0.9, 1.75, 0]);
    put(M.steel, new THREE.BoxGeometry(2.5, 1.7, 0.06), [0, 2.7, 0]);
    put(kind, new THREE.PlaneGeometry(2.4, 1.6), [0, 2.7, 0.045]);
  }

  // -------------------------------------------------------------- telegraph

  _telegraph(B) {
    const M = this.mats, eco = this.eco;
    const rng = new Rng(4004);
    const step = 36;
    const from = -430, to = 430;
    const tops = [];
    for (let z = from; z <= to; z += step) {
      const p = eco.roadPoint(z, 1, 9.5, new THREE.Vector3());
      const lean = rng.gauss(0, 0.035);
      const h = 7.2 + rng.range(0, 1.1);
      const yaw = rng.gauss(0, 0.25);
      const world = mat4([p.x, p.y - 0.4, p.z], [lean, yaw, rng.gauss(0, 0.03)]);
      B.add(M.dark, new THREE.CylinderGeometry(0.11, 0.17, h, 8),
        world.clone().multiply(mat4([0, h / 2, 0])));
      B.add(M.dark, new THREE.BoxGeometry(2.1, 0.12, 0.14),
        world.clone().multiply(mat4([0, h - 0.5, 0])));
      B.add(M.dark, new THREE.BoxGeometry(1.5, 0.11, 0.12),
        world.clone().multiply(mat4([0, h - 1.25, 0])));
      const anchors = [];
      for (const [dx, dy] of [[-0.95, h - 0.38], [0, h - 0.38], [0.95, h - 0.38], [-0.68, h - 1.13], [0.68, h - 1.13]]) {
        B.add(M.ceramic, new THREE.CylinderGeometry(0.055, 0.07, 0.16, 8),
          world.clone().multiply(mat4([dx, dy + 0.08, 0])));
        const a = new THREE.Vector3(dx, dy + 0.16, 0).applyMatrix4(world);
        anchors.push(a);
      }
      tops.push(anchors);
    }
    // sagging catenary wire between consecutive poles
    const wireGeo = [];
    for (let i = 0; i < tops.length - 1; i++) {
      const a = tops[i], b = tops[i + 1];
      const near = Math.min(Math.hypot(a[0].x, a[0].z), Math.hypot(b[0].x, b[0].z));
      const segs = near < 220 ? 9 : 4;
      const r = near < 220 ? 0.022 : 0.035;
      for (let w = 0; w < a.length; w++) {
        const pts = [];
        for (let s = 0; s <= segs; s++) {
          const t = s / segs;
          const x = a[w].x + (b[w].x - a[w].x) * t;
          const z = a[w].z + (b[w].z - a[w].z) * t;
          const y = a[w].y + (b[w].y - a[w].y) * t - Math.sin(t * Math.PI) * 1.35;
          pts.push(new THREE.Vector3(x, y, z));
        }
        wireGeo.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, r, 3, false));
      }
    }
    for (const g of wireGeo) B.add(M.wire, g);
  }

  // ------------------------------------------------------------------ fence

  _fences(B) {
    const M = this.mats, eco = this.eco;
    const rng = new Rng(6006);
    const runs = [
      { z0: 60, z1: 132, side: 1, off: 22 },
      { z0: -180, z1: -108, side: -1, off: 17 },
    ];
    for (const run of runs) {
      const n = Math.round((run.z1 - run.z0) / 3.1);
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const z = run.z0 + (run.z1 - run.z0) * (i / n);
        const p = eco.roadPoint(z, run.side, run.off, new THREE.Vector3());
        const h = 1.25 + rng.range(0, 0.2);
        const lean = rng.gauss(0, 0.09);
        const broken = rng.next() < 0.1;
        if (!broken) {
          B.add(M.dark, new THREE.CylinderGeometry(0.055, 0.075, h, 6),
            mat4([p.x, p.y + h / 2 - 0.15, p.z], [lean, rng.next() * 3, rng.gauss(0, 0.06)]));
        }
        if (prev && !broken) {
          for (const dy of [0.45, 0.85, 1.15]) {
            const a = new THREE.Vector3(prev.x, prev.y + dy, prev.z);
            const b = new THREE.Vector3(p.x, p.y + dy, p.z);
            const mid = a.clone().lerp(b, 0.5); mid.y -= 0.07;
            const curve = new THREE.CatmullRomCurve3([a, mid, b]);
            B.add(M.wire, new THREE.TubeGeometry(curve, 3, 0.016, 3, false));
          }
        }
        prev = broken ? null : p;
      }
    }
  }

  update(dt, time) {
    // firelight flicker
    for (const l of this.lights) {
      if (l.kind !== 'fire') continue;
      const f = 0.78 + 0.34 * Math.sin(time * 11.3) * Math.sin(time * 4.1) + 0.1 * Math.sin(time * 23.7);
      l.light.intensity = l.base * f;
    }
  }
}

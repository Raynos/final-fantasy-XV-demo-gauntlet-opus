import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../util/Rng.js';
import { puffTexture } from './PropMaterials.js';

/**
 * The moving half of "inhabited".
 *
 * Three populations, one draw call each: raptors riding thermals over the
 * badlands, herds of garula grazing across the midground, and clouds of
 * insects that only come out near the camera at dusk. Nothing here is
 * simulated — every animal is a closed-form function of time, so a capture of
 * frame 60 is identical every run.
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** A gliding raptor: two swept wings, a body and a fanned tail. */
function birdGeometry() {
  const parts = [];
  const body = new THREE.ConeGeometry(0.16, 1.0, 6);
  body.rotateZ(Math.PI / 2);
  parts.push(body);
  for (const s of [-1, 1]) {
    const wing = new THREE.BufferGeometry();
    // root, mid, tip — swept back and dihedral-up
    const p = [
      0.18, 0.0, s * 0.05, -0.14, 0.0, s * 0.05,
      0.10, 0.09, s * 0.95, -0.30, 0.07, s * 0.95,
      -0.06, 0.16, s * 1.75, -0.34, 0.15, s * 1.70,
    ];
    const idx = s > 0
      ? [0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5]
      : [0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4];
    wing.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    wing.setIndex(idx);
    wing.computeVertexNormals();
    parts.push(wing);
  }
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute(
    [-0.4, 0, 0, -0.95, 0.02, 0.26, -0.95, 0.02, -0.26], 3));
  tail.setIndex([0, 1, 2]);
  tail.computeVertexNormals();
  parts.push(tail);
  for (const g of parts) {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  }
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere();
  return g;
}

/**
 * Garula: the shaggy, horned grazer of the Leide plains. Low poly on purpose —
 * it is never nearer than a hundred metres, and what has to read is the
 * silhouette: heavy shoulders, low head, four stumpy legs.
 */
function garulaGeometry() {
  const parts = [];
  const body = new THREE.SphereGeometry(1.0, 10, 8);
  body.scale(1.75, 0.95, 1.0);
  body.translate(0, 1.35, 0);
  parts.push(body);
  const hump = new THREE.SphereGeometry(0.72, 8, 6);
  hump.scale(1.1, 0.8, 0.95);
  hump.translate(0.75, 1.95, 0);
  parts.push(hump);
  const neck = new THREE.CylinderGeometry(0.42, 0.55, 1.0, 7);
  neck.rotateZ(-0.95);
  neck.translate(1.85, 1.25, 0);
  parts.push(neck);
  const head = new THREE.SphereGeometry(0.46, 8, 6);
  head.scale(1.5, 0.85, 0.8);
  head.translate(2.55, 0.95, 0);
  parts.push(head);
  for (const s of [-1, 1]) {
    const horn = new THREE.ConeGeometry(0.09, 0.72, 5);
    horn.rotateZ(0.5);
    horn.rotateX(s * 0.55);
    horn.translate(2.45, 1.35, s * 0.3);
    parts.push(horn);
  }
  for (const ax of [1.15, -1.05]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.CylinderGeometry(0.19, 0.15, 1.0, 6);
      leg.translate(ax, 0.5, sz * 0.62);
      parts.push(leg);
      const hoof = new THREE.CylinderGeometry(0.2, 0.22, 0.16, 6);
      hoof.translate(ax, 0.08, sz * 0.62);
      parts.push(hoof);
    }
  }
  const tail = new THREE.CylinderGeometry(0.07, 0.03, 0.8, 5);
  tail.rotateZ(0.5);
  tail.translate(-1.9, 1.15, 0);
  parts.push(tail);
  for (const g of parts) {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  }
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere();
  return g;
}

export class Wildlife {
  /**
   * @param {import('../veg/Ecology.js').Ecology} eco
   * @param {THREE.Scene} scene
   * @param {{quality?:number}} opts
   */
  constructor(eco, scene, { quality = 1 } = {}) {
    this.eco = eco;
    this.scene = scene;
    this.quality = quality;
    this.root = new THREE.Group();
    this.root.name = 'wildlife';
    this.scene.add(this.root);
  }

  build() {
    this._birds();
    this._herds();
    this._insects();
    this._smoke();
  }

  // ------------------------------------------------------------------ birds

  /** Four kettles of raptors turning on thermals over the hot ground. */
  _birds() {
    const rng = new Rng(1234);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2b2723, roughness: 0.86, metalness: 0, side: THREE.DoubleSide,
    });
    mat.name = 'bird';
    const anchors = [
      { x: -110, z: -250, r: 78, y: 96, n: 13 },
      { x: 150, z: -60, r: 62, y: 74, n: 9 },
      { x: -300, z: 130, r: 90, y: 118, n: 11 },
      { x: -40, z: -420, r: 70, y: 132, n: 8 },
      // low kettle right over the spawn, so the sky is never empty on the road
      { x: 0, z: -60, r: 55, y: 34, n: 10 },
    ];
    const items = [];
    for (const a of anchors) {
      const ground = this.eco.height(a.x, a.z);
      for (let i = 0; i < a.n; i++) {
        items.push({
          cx: a.x, cz: a.z, y: ground + a.y + rng.range(-14, 22),
          r: a.r * rng.range(0.35, 1.05),
          phase: rng.next() * Math.PI * 2,
          rate: (rng.next() < 0.5 ? -1 : 1) * rng.range(0.055, 0.12),
          climb: rng.range(3, 11), climbRate: rng.range(0.13, 0.3),
          scale: rng.range(0.8, 1.45),
        });
      }
    }
    const mesh = new THREE.InstancedMesh(birdGeometry(), mat, items.length);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.name = 'wildlife_birds';
    this.root.add(mesh);
    this.birds = { mesh, items };
  }

  // ------------------------------------------------------------------ herds

  /** Garula grazing the sites Ecology marked, drifting slowly downwind. */
  _herds() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6b5b48, roughness: 0.92, metalness: 0, vertexColors: false,
    });
    mat.name = 'garula';
    const items = [];
    for (const s of this.eco.sites) {
      if (s.type !== 'graze') continue;
      const rng = new Rng(s.seed || 41);
      const range = s.range || 40;
      for (let i = 0; i < (s.count || 8); i++) {
        const a = rng.next() * Math.PI * 2;
        const d = Math.sqrt(rng.next()) * range;
        items.push({
          ax: s.x + Math.cos(a) * d, az: s.z + Math.sin(a) * d,
          wander: rng.range(4, 13), phase: rng.next() * Math.PI * 2,
          rate: rng.range(0.016, 0.045),
          scale: rng.range(0.85, 1.35) * (rng.next() < 0.18 ? 0.6 : 1),
          bob: rng.range(0.5, 1.6),
        });
      }
    }
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(garulaGeometry(), mat, items.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = 'wildlife_herd';
    this.root.add(mesh);
    this.herd = { mesh, items };
  }

  // ---------------------------------------------------------------- insects

  /**
   * Midges near the eye. Points, so the whole swarm is one call and every
   * particle faces the camera for free. They fade in as the light goes.
   */
  _insects() {
    const rng = new Rng(5566);
    const n = Math.round(520 * this.quality);
    const pos = new Float32Array(n * 3);
    const seeds = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      seeds[i * 3] = rng.next() * 100;
      seeds[i * 3 + 1] = rng.range(0.4, 3.4);
      seeds[i * 3 + 2] = rng.next() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.PointsMaterial({
      size: 0.035, sizeAttenuation: true, map: puffTexture(),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      color: 0xffd9a0, opacity: 0,
    });
    mat.name = 'insects';
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 4;
    pts.name = 'wildlife_insects';
    this.root.add(pts);
    this.insects = { pts, geo, mat, seeds, n };
  }

  // ------------------------------------------------------------------ smoke

  /** The column still coming off the downed dropship. One draw call. */
  _smoke() {
    const site = this.eco.sites.find((s) => s.type === 'crashsite');
    if (!site) return;
    const rng = new Rng(9090);
    // Many faint puffs rather than few solid ones: a handful of half-opaque
    // discs reads as a swarm of flies, a couple of hundred at a tenth opacity
    // accumulate into something that looks like smoke.
    const n = Math.round(240 * this.quality);
    const pos = new Float32Array(n * 3);
    const seeds = [];
    for (let i = 0; i < n; i++) {
      seeds.push({ t0: rng.next(), spin: rng.range(-1, 1), wob: rng.range(0.4, 1.8), sz: rng.range(0.6, 1.5) });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(site.x, this.eco.height(site.x, site.z) + 30, site.z), 90);
    const mat = new THREE.PointsMaterial({
      size: 16, sizeAttenuation: true, map: puffTexture(),
      transparent: true, depthWrite: false, opacity: 0.11, color: 0x37332c,
    });
    mat.name = 'crash_smoke';
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = 3;
    pts.name = 'wildlife_smoke';
    this.root.add(pts);
    this.smoke = {
      pts, geo, seeds, n,
      x: site.x, z: site.z, y: this.eco.height(site.x, site.z) + 3,
    };
  }

  // ----------------------------------------------------------------- update

  /**
   * @param {number} dt
   * @param {number} t seconds
   * @param {number} night 0 by day, 1 after dark
   * @param {THREE.Vector3} camPos
   */
  update(dt, t, night, camPos) {
    if (this.birds) {
      const g = this.birds;
      for (let i = 0; i < g.items.length; i++) {
        const b = g.items[i];
        const a = b.phase + t * b.rate;
        const x = b.cx + Math.cos(a) * b.r;
        const z = b.cz + Math.sin(a) * b.r;
        const y = b.y + Math.sin(t * b.climbRate + b.phase) * b.climb;
        // heading is the circle tangent; bank into the turn
        const yaw = Math.atan2(-Math.sin(a) * Math.sign(b.rate), -Math.cos(a) * Math.sign(b.rate)) + Math.PI / 2;
        _e.set(0, yaw, Math.sign(b.rate) * 0.42 + Math.sin(t * 0.7 + b.phase) * 0.08);
        _q.setFromEuler(_e);
        _p.set(x, y, z);
        _s.setScalar(b.scale);
        _m.compose(_p, _q, _s);
        _m.toArray(g.mesh.instanceMatrix.array, i * 16);
      }
      g.mesh.instanceMatrix.needsUpdate = true;
    }

    if (this.herd) {
      const g = this.herd;
      const eco = this.eco;
      for (let i = 0; i < g.items.length; i++) {
        const h = g.items[i];
        const a = h.phase + t * h.rate;
        const x = h.ax + Math.cos(a) * h.wander;
        const z = h.az + Math.sin(a * 0.73) * h.wander * 0.7;
        const yaw = Math.atan2(-Math.sin(a) * h.wander * h.rate,
          Math.cos(a * 0.73) * 0.73 * h.wander * 0.7 * h.rate) + Math.PI / 2;
        // graze: nose dips every few seconds
        const dip = Math.max(0, Math.sin(t * 0.35 + h.phase * 3)) * 0.22;
        _e.set(dip, yaw, 0);
        _q.setFromEuler(_e);
        _p.set(x, eco.height(x, z) - 0.05, z);
        _s.setScalar(h.scale);
        _m.compose(_p, _q, _s);
        _m.toArray(g.mesh.instanceMatrix.array, i * 16);
      }
      g.mesh.instanceMatrix.needsUpdate = true;
    }

    if (this.insects && camPos) {
      const s = this.insects;
      // midges are a dusk and dawn thing; they read as motion right at the eye
      s.mat.opacity = 0.16 + 0.5 * THREE.MathUtils.smoothstep(night, 0.1, 0.7);
      const arr = s.geo.attributes.position.array;
      // hang the swarm off the eye, not off the ground: a camera on a ridge
      // would otherwise leave every midge forty metres below the frame
      const gy = Math.min(camPos.y - 1.2, this.eco.height(camPos.x, camPos.z) + 3.2);
      for (let i = 0; i < s.n; i++) {
        const sx = s.seeds[i * 3], hy = s.seeds[i * 3 + 1], sz = s.seeds[i * 3 + 2];
        const a = sx * 0.63 + t * (0.5 + (sz % 1) * 0.9);
        const r = 2.0 + (sx % 7) * 1.4;
        arr[i * 3] = camPos.x + Math.cos(a) * r + Math.sin(t * 1.9 + sz) * 0.5;
        arr[i * 3 + 1] = gy + hy + Math.sin(t * 2.4 + sx) * 0.28;
        arr[i * 3 + 2] = camPos.z + Math.sin(a * 1.13 + sz) * r + Math.cos(t * 2.2 + sx) * 0.5;
      }
      s.geo.attributes.position.needsUpdate = true;
      s.geo.boundingSphere.center.set(camPos.x, gy + 2, camPos.z);
      s.geo.boundingSphere.radius = 14;
    }

    if (this.smoke) {
      const k = this.smoke;
      const arr = k.geo.attributes.position.array;
      for (let i = 0; i < k.n; i++) {
        const sd = k.seeds[i];
        const life = (sd.t0 + t * 0.045) % 1;
        // rise fast off the wreck then stall and spread as the column cools
        const h = Math.pow(life, 0.78) * 58;
        const spread = 1.2 + life * life * 16;
        arr[i * 3] = k.x + Math.sin(life * 5.5 * sd.wob + sd.spin * 6) * spread + life * life * 13;
        arr[i * 3 + 1] = k.y + h;
        arr[i * 3 + 2] = k.z + Math.cos(life * 4.1 * sd.wob + sd.spin * 6) * spread + life * life * 8;
      }
      k.geo.attributes.position.needsUpdate = true;
    }
  }
}

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

/**
 * Merge a list of primitives into one buffer, stripping everything but
 * position and normal and tagging each part with a flat vertex colour so the
 * animal can be shaded (pale back, dark belly, bone-coloured horns) from a
 * single unlit-looking material.
 *
 * @param {Array<{geo:THREE.BufferGeometry, c:number[]}>} parts
 */
function mergeTinted(parts) {
  const geos = [];
  for (const { geo, c } of parts) {
    for (const k of Object.keys(geo.attributes)) {
      if (!['position', 'normal'].includes(k)) geo.deleteAttribute(k);
    }
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(geo);
  }
  const g = mergeGeometries(geos, false);
  g.computeBoundingSphere();
  return g;
}

/**
 * A gliding raptor.
 *
 * Everything that makes a bird read at range is planform, so the wing is a
 * proper crescent — swept leading edge, concave trailing edge, and three
 * splayed primary "fingers" at the tip — rather than the two-triangle sliver
 * it used to be. Body, head and a fanned tail complete the silhouette.
 */
function birdGeometry() {
  const parts = [];
  const dark = [0.34, 0.31, 0.28], light = [0.62, 0.56, 0.48];

  const body = new THREE.SphereGeometry(0.19, 8, 6);
  body.scale(3.0, 0.9, 1.0);
  parts.push({ geo: body, c: dark });
  const head = new THREE.SphereGeometry(0.13, 7, 5);
  head.scale(1.5, 1.0, 1.0);
  head.translate(0.62, 0.03, 0);
  parts.push({ geo: head, c: light });
  const beak = new THREE.ConeGeometry(0.045, 0.18, 5);
  beak.rotateZ(-Math.PI / 2);
  beak.translate(0.80, 0.0, 0);
  parts.push({ geo: beak, c: light });

  // wing planform: leading edge sweeps back, trailing edge is concave, and
  // the tip splits into finger feathers
  const le = [[0.30, 0.0], [0.26, 0.62], [0.10, 1.28], [-0.10, 1.86]];
  const te = [[-0.30, 0.0], [-0.44, 0.60], [-0.44, 1.24], [-0.30, 1.80]];
  for (const s of [-1, 1]) {
    const p = [], idx = [];
    for (let i = 0; i < le.length; i++) {
      p.push(le[i][0], 0.02 + le[i][1] * 0.09, s * le[i][1]);
      p.push(te[i][0], 0.0 + te[i][1] * 0.085, s * te[i][1]);
    }
    for (let i = 0; i < le.length - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      if (s > 0) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    wing.setIndex(idx);
    wing.computeVertexNormals();
    parts.push({ geo: wing, c: dark });

    // three primaries fanning off the tip
    for (let f = 0; f < 3; f++) {
      const a0 = -0.12 - f * 0.11, a1 = a0 - 0.16;
      const fp = [
        -0.10, 0.166, s * 1.86,
        a0, 0.20, s * 2.30,
        a1, 0.20, s * 2.26,
      ];
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
      fg.setIndex(s > 0 ? [0, 1, 2] : [0, 2, 1]);
      fg.computeVertexNormals();
      parts.push({ geo: fg, c: dark });
    }
  }
  // fanned tail
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute(
    [-0.45, 0, 0, -1.05, 0.02, 0.30, -0.92, 0.02, 0, -1.05, 0.02, -0.30], 3));
  tail.setIndex([0, 1, 2, 0, 2, 3]);
  tail.computeVertexNormals();
  parts.push({ geo: tail, c: dark });

  return mergeTinted(parts);
}

/**
 * Garula: the shaggy, horned grazer of the Leide plains.
 *
 * At a hundred metres only three things carry: the mass over the shoulders,
 * the head hung low and forward of it, and daylight between four load-bearing
 * legs. So the body is a barrel with a sloping croup rather than an ellipsoid,
 * the legs are jointed (femur angled back, cannon bone dropping vertically,
 * splayed hoof) with a real gap under the belly, and the horns are a heavy
 * forward-curving pair on a broad skull. Roughly 3.6 m nose to tail and 2.3 m
 * at the hump — twice the height of a 1.8 m character.
 */
function garulaGeometry() {
  const parts = [];
  const coat = [0.52, 0.44, 0.34];
  const belly = [0.30, 0.25, 0.20];
  const mane = [0.38, 0.30, 0.23];
  const bone = [0.78, 0.74, 0.64];
  const hoofC = [0.20, 0.18, 0.16];

  // --- barrel body: ribcage forward, narrower croup behind ---------------
  const chest = new THREE.SphereGeometry(1.0, 11, 8);
  chest.scale(1.05, 0.98, 0.9);
  chest.translate(0.45, 1.42, 0);
  parts.push({ geo: chest, c: coat });
  const rump = new THREE.SphereGeometry(1.0, 10, 7);
  rump.scale(0.95, 0.8, 0.76);
  rump.translate(-0.95, 1.30, 0);
  parts.push({ geo: rump, c: coat });
  const flank = new THREE.CylinderGeometry(0.86, 0.78, 1.6, 10);
  flank.rotateZ(Math.PI / 2);
  flank.scale(1, 1, 0.92);
  flank.translate(-0.25, 1.36, 0);
  parts.push({ geo: flank, c: coat });
  const under = new THREE.SphereGeometry(0.78, 9, 6);
  under.scale(1.5, 0.5, 0.85);
  under.translate(-0.1, 1.02, 0);
  parts.push({ geo: under, c: belly });

  // --- withers hump: the highest point of the animal ---------------------
  const hump = new THREE.SphereGeometry(0.78, 9, 7);
  hump.scale(1.15, 0.92, 0.8);
  hump.translate(0.55, 2.02, 0);
  parts.push({ geo: hump, c: mane });
  // shaggy mane spilling off the hump and down the neck
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const tuft = new THREE.ConeGeometry(0.22 - t * 0.06, 0.62, 5);
    tuft.rotateZ(0.9 + t * 0.5);
    tuft.translate(0.9 + t * 0.75, 2.28 - t * 0.5, (i % 2 ? 0.16 : -0.16) * (1 - t));
    parts.push({ geo: tuft, c: mane });
  }

  // --- neck and skull: slung low and forward -----------------------------
  const neck = new THREE.CylinderGeometry(0.40, 0.62, 1.25, 8);
  neck.rotateZ(-1.02);
  neck.translate(1.62, 1.52, 0);
  parts.push({ geo: neck, c: mane });
  const skull = new THREE.SphereGeometry(0.44, 9, 7);
  skull.scale(1.6, 0.86, 0.92);
  skull.translate(2.42, 1.02, 0);
  parts.push({ geo: skull, c: coat });
  const muzzle = new THREE.CylinderGeometry(0.22, 0.29, 0.5, 7);
  muzzle.rotateZ(-1.35);
  muzzle.translate(2.98, 0.90, 0);
  parts.push({ geo: muzzle, c: belly });
  // brow ridge the horns spring from
  const brow = new THREE.BoxGeometry(0.3, 0.2, 0.86);
  brow.translate(2.34, 1.28, 0);
  parts.push({ geo: brow, c: bone });
  for (const s of [-1, 1]) {
    // heavy forward-curving horn built from three tapering segments
    let px = 2.34, py = 1.36, pz = s * 0.4;
    const seg = [[0.30, 0.15, 0.55, 0.36], [0.34, 0.30, 0.28, 0.5], [0.34, 0.34, 0.10, 0.26]];
    let r = 0.15;
    for (const [dx, dy, dz, rr] of seg) {
      const h = Math.hypot(dx, dy, dz);
      const c = new THREE.CylinderGeometry(rr * 0.75, r, h, 6);
      // orient +Y along the segment
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, s * dz).normalize());
      c.applyQuaternion(q);
      c.translate(px + dx / 2, py + dy / 2, pz + s * dz / 2);
      parts.push({ geo: c, c: bone });
      px += dx; py += dy; pz += s * dz; r = rr * 0.75;
    }
    const tip = new THREE.ConeGeometry(r, 0.3, 6);
    tip.rotateZ(-0.6);
    tip.translate(px + 0.08, py + 0.1, pz);
    parts.push({ geo: tip, c: bone });
    // ear
    const ear = new THREE.ConeGeometry(0.1, 0.3, 5);
    ear.rotateX(s * 1.2);
    ear.translate(2.16, 1.2, s * 0.42);
    parts.push({ geo: ear, c: coat });
  }

  // --- jointed legs -------------------------------------------------------
  // front pair sits under the chest, rear pair under the croup, and each is
  // femur -> cannon -> hoof so there is a visible knee and real ground gap
  const leg = (ax, az, femurLean, upperR, lowerR, top) => {
    const knee = 0.72;
    const dx = femurLean * (top - knee);
    const fem = new THREE.CylinderGeometry(lowerR * 1.05, upperR, top - knee, 6);
    fem.rotateZ(Math.atan2(-dx, top - knee));
    fem.translate(ax + dx * 0.5, (top + knee) * 0.5, az);
    parts.push({ geo: fem, c: coat });
    const cannon = new THREE.CylinderGeometry(lowerR * 0.8, lowerR * 1.02, knee - 0.13, 6);
    cannon.translate(ax + dx, (knee + 0.13) * 0.5, az);
    parts.push({ geo: cannon, c: belly });
    const hoof = new THREE.CylinderGeometry(lowerR * 1.25, lowerR * 1.5, 0.17, 6);
    hoof.translate(ax + dx, 0.085, az);
    parts.push({ geo: hoof, c: hoofC });
  };
  for (const sz of [-1, 1]) {
    leg(1.02, sz * 0.62, 0.16, 0.30, 0.16, 1.36);   // foreleg, shoulder high
    leg(-1.12, sz * 0.6, -0.2, 0.34, 0.17, 1.24);   // hind leg, hock kicked back
  }

  // --- tail ---------------------------------------------------------------
  const tail = new THREE.CylinderGeometry(0.08, 0.035, 0.95, 5);
  tail.rotateZ(0.42);
  tail.translate(-1.92, 1.12, 0);
  parts.push({ geo: tail, c: coat });
  const tuft = new THREE.SphereGeometry(0.15, 6, 5);
  tuft.scale(0.8, 1.4, 0.8);
  tuft.translate(-2.12, 0.68, 0);
  parts.push({ geo: tuft, c: mane });

  return mergeTinted(parts);
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
      color: 0x6d6459, roughness: 0.86, metalness: 0, side: THREE.DoubleSide,
      vertexColors: true,
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
          scale: rng.range(1.15, 2.1),
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
      color: 0x8c7c67, roughness: 0.92, metalness: 0, vertexColors: true,
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

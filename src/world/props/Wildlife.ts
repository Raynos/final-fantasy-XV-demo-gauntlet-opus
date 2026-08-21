import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../util/Rng.ts';
import { hash3 } from '../veg/Ecology.ts';
import { TileStream } from './TileStream.ts';
import { dressAt } from './ZoneDress.ts';
import { puffTexture } from './PropMaterials.ts';
import { garulaGeometry, grazerMaterials, walkCycle, CYCLE_DISTANCE } from './Grazer.ts';
import { waderGeometry, waderMaterial } from './Waders.ts';
import { WORLD } from '../map/WorldMap.ts';

/**
 * The moving half of "inhabited".
 *
 * Four populations, one draw call each: raptors riding thermals over the
 * badlands, herds of garula grazing across the midground, waders working the
 * edge of every lake, and clouds of insects that only come out near the camera
 * at dusk. Nothing here is simulated — every animal is a closed-form function
 * of time, so a capture of frame 60 is identical every run.
 *
 * The two ground populations are *articulated* as well as placed, and the
 * articulation is entirely in the vertex shader (see `Grazer.js` and
 * `Waders.js`). The CPU's whole job per animal is one matrix and four floats:
 * where it stands, which way it faces, and what phase of its cycle it is in.
 * Heads drop into the grass, tails flick, legs swing and necks stab without
 * the main thread knowing about any of it, which is the only way seventy-odd
 * animated animals fit in one draw call and a rounding error of frame time.
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

/**
 * Merge a list of primitives into one buffer, stripping everything but
 * position and normal and tagging each part with a flat vertex colour so the
 * animal can be shaded (pale back, dark belly, bone-coloured horns) from a
 * single unlit-looking material.
 *
 */
function mergeTinted(parts: Array<{geo:THREE.BufferGeometry, c:number[]}>) {
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

export class Wildlife {
  birds!: any;
  insects!: any;
  smoke!: any;
  waders!: any;
  eco!: any;
  herd!: any;
  quality!: any;
  root!: THREE.Group;
  scene!: any;
  timeRef!: any;
  constructor(eco: import('../veg/Ecology.ts').Ecology, scene: THREE.Scene, { quality = 1 }: {quality?:number} = {}) {
    this.eco = eco;
    this.scene = scene;
    this.quality = quality;
    /** Shared clock uniform for every vertex-animated population. */
    this.timeRef = { value: 0 };
    this.root = new THREE.Group();
    this.root.name = 'wildlife';
    this.scene.add(this.root);
  }

  build() {
    this._birds();
    this._herds();
    this._waders();
    this._insects();
    this._smoke();
  }

  // ------------------------------------------------------------------ birds

  /**
   * Kettles of raptors turning on thermals, streamed across the whole map.
   *
   * The old set was five hand-placed circles within four hundred metres of
   * Hammerhead, so the sky over the other sixty square kilometres of Lucis was
   * empty. Kettles are now a streamed field weighted by the zone's `life.birds`
   * — thick over the Galdin coast and Cape Caem, thin over the ash slopes of
   * Ravatogh, which is what a volcano's sky should look like.
   */
  _birds() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6d6459, roughness: 0.86, metalness: 0, side: THREE.DoubleSide,
      vertexColors: true,
    });
    mat.name = 'bird';
    const CAP = Math.round(110 * this.quality);
    const mesh = new THREE.InstancedMesh(birdGeometry(), mat, CAP);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.name = 'wildlife_birds';
    this.root.add(mesh);
    this.birds = {
      mesh, cap: CAP,
      stream: new TileStream({
        cell: 340, radius: 1150, budget: 4,
        gen: (cx, cz, out) => this._genKettle(cx, cz, out),
      }),
    };
    this.birds.stream.flush(new THREE.Vector3());
  }

  _genKettle(cx: any, cz: any, out: any) {
    const c = 340;
    const rng = new Rng(hash3(cx, cz, 0x8175));
    const x = (cx + rng.next()) * c, z = (cz + rng.next()) * c;
    const dress = dressAt(x, z);
    const want = dress.life.birds;
    if (rng.next() > want * 0.55) return;
    const ground = this.eco.height(x, z);
    const n = 5 + Math.floor(rng.next() * 8 * want);
    const r0 = rng.range(40, 95);
    const y0 = rng.range(30, 130);
    for (let i = 0; i < n; i++) {
      out.push({
        cx: x, cz: z, y: ground + y0 + rng.range(-14, 22),
        r: r0 * rng.range(0.35, 1.05),
        phase: rng.next() * Math.PI * 2,
        rate: (rng.next() < 0.5 ? -1 : 1) * rng.range(0.055, 0.12),
        climb: rng.range(3, 11), climbRate: rng.range(0.13, 0.3),
        scale: rng.range(1.15, 2.1),
      });
    }
  }

  // ------------------------------------------------------------------ herds

  /**
   * Grazing garula, streamed and zone-weighted.
   *
   * Thick on the Kelbass downs and the Weaverwilds, a working herd on the
   * Longwythe flats where most of the Leide frames are shot, a token few in
   * the deep woods and none at all on a volcano, in a ruin, or on the
   * approach to a dungeon — see `life.herd` in `ZoneDress.js`.
   *
   * The mesh carries a matching `customDepthMaterial`, so the animal's
   * *shadow* grazes with it rather than standing in the bind pose with its
   * head up while the animal's nose is in the grass.
   */
  _herds() {
    const { material, depth } = grazerMaterials(this.timeRef);
    const CAP = Math.round(72 * this.quality);
    const geo = garulaGeometry();
    // per-instance animation: phase, cycle rate, alertness, coat brightness
    geo.setAttribute('aanim', new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4));
    const mesh = new THREE.InstancedMesh(geo, material, CAP);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.name = 'wildlife_herd';
    this.root.add(mesh);
    this.herd = {
      mesh, cap: CAP, range: 440, anim: geo.attributes.aanim,
      stream: new TileStream({
        cell: 260, radius: 620, budget: 4,
        gen: (cx, cz, out) => this._genHerd(cx, cz, out),
      }),
    };
    this.herd.stream.flush(new THREE.Vector3());
  }

  /**
   * One herd per cell, on open grazing ground.
   *
   * Stock want three things and the test is all three: grass to eat, ground
   * flat enough to stand a two-and-a-half tonne animal on, and a zone that
   * keeps stock at all. That rules out cliff faces, scree and the dungeon
   * approaches on its own — `grassDensity` is already zero on bare rock and
   * the slope term kills anything above about twenty degrees.
   *
   * Each animal gets a wander circle rather than a fixed post: it walks a
   * few paces along the arc every cycle and crops with its head down in
   * between, so a herd slowly redistributes itself across the pasture.
   */
  _genHerd(cx: any, cz: any, out: any) {
    const c = 260, eco = this.eco;
    const rng = new Rng(hash3(cx, cz, 0x2b91));
    const x = (cx + rng.next()) * c, z = (cz + rng.next()) * c;
    const dress = dressAt(x, z);
    const want = dress.life.herd;
    if (want <= 0.01) return;
    // stock stand on grass, on the flat, away from the carriageway
    const flat = 1 - THREE.MathUtils.smoothstep(eco.slope01(x, z), 0.10, 0.34);
    // and they come down to the water: the strip of ground a metre or two
    // above the lake surface is where a real herd spends its afternoon
    const above = eco.height(x, z) - WORLD.seaLevel;
    const shore = (1 - THREE.MathUtils.smoothstep(above, 1.5, 11)) * THREE.MathUtils.smoothstep(above, -0.5, 0.8);
    const graze = eco.grassDensity(x, z) * flat * (1 + shore * 0.9);
    if (rng.next() > want * graze * 1.4) return;
    const range = rng.range(22, 46);
    const n = 4 + Math.floor(rng.next() * 9 * Math.min(1.4, want));
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = Math.sqrt(rng.next()) * range;
      const ax = x + Math.cos(a) * d, az = z + Math.sin(a) * d;
      // a beast that would be standing on a boulder or a cliff edge is
      // simply not born
      if (eco.slope01(ax, az) > 0.30) continue;
      const calf = rng.next() < 0.20;
      // the animal walks an arc; the arc's centre is placed so that at t=0 it
      // stands exactly on its anchor, otherwise a "herd" scatters itself over
      // twice the wander radius the moment the clock starts
      const radius = rng.range(9, 22);
      const theta0 = rng.next() * Math.PI * 2;
      out.push({
        cx: ax - Math.cos(theta0) * radius, cz: az - Math.sin(theta0) * radius,
        radius,
        theta0,
        ax, az,
        dir: rng.next() < 0.5 ? -1 : 1,
        phase: rng.next(),
        rate: rng.range(1 / 21, 1 / 11) * (calf ? 1.7 : 1),
        scale: (calf ? rng.range(0.42, 0.56) : rng.range(0.78, 1.04)),
        // a couple of head in every group stand watch instead of cropping —
        // a field where every animal has its nose in the grass reads as a
        // field of identical props, which is precisely what it would be
        idle: rng.next() < 0.18 ? rng.range(0.55, 0.9) : 0,
        tint: rng.next(),
      });
    }
  }

  // ------------------------------------------------------------------ shore

  /**
   * Waders along the waterline.
   *
   * The hard part is finding the waterline at all: the world is 8 km on a side
   * and almost none of it is within a metre of the lake surface, so a blind
   * scatter would test tens of thousands of points to find one. Instead each
   * cell rejects itself on a single height sample if it is nowhere near the
   * water, then hunts the band with a couple of dozen samples only if it might
   * be. Birds stand *in* the shallows — their feet clamp to just under the
   * surface — because a heron on dry ground beside a lake looks lost.
   */
  _waders() {
    const CAP = Math.round(64 * this.quality);
    const geo = waderGeometry();
    geo.setAttribute('aanim', new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4));
    const mesh = new THREE.InstancedMesh(geo, waderMaterial(this.timeRef), CAP);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.name = 'wildlife_waders';
    this.root.add(mesh);
    this.waders = {
      mesh, cap: CAP, range: 300, anim: geo.attributes.aanim,
      stream: new TileStream({
        cell: 180, radius: 420, budget: 3,
        gen: (cx, cz, out) => this._genWaders(cx, cz, out),
      }),
    };
    this.waders.stream.flush(new THREE.Vector3());
  }

  _genWaders(cx: any, cz: any, out: any) {
    const c = 180, eco = this.eco, sea = WORLD.seaLevel;
    // one sample rejects every cell that is not lake country
    if (eco.height((cx + 0.5) * c, (cz + 0.5) * c) > sea + 60) return;
    const rng = new Rng(hash3(cx, cz, 0x53a7));
    const dress = dressAt((cx + 0.5) * c, (cz + 0.5) * c);
    const want = dress.life.shore;
    if (want <= 0.02) return;
    for (let a = 0; a < 24; a++) {
      const x = (cx + rng.next()) * c, z = (cz + rng.next()) * c;
      const d = eco.height(x, z) - sea;
      if (d < -0.5 || d > 0.9) continue;
      if (rng.next() > want * 0.55) continue;
      // a loose scatter of two to six birds working the same bay
      const n = 2 + Math.floor(rng.next() * 5 * Math.min(1.4, want));
      for (let i = 0; i < n; i++) {
        const ang = rng.next() * Math.PI * 2;
        const r = Math.sqrt(rng.next()) * rng.range(5, 16);
        const bx = x + Math.cos(ang) * r, bz = z + Math.sin(ang) * r;
        const bd = eco.height(bx, bz) - sea;
        if (bd < -0.9 || bd > 1.3) continue;
        out.push({
          x: bx, z: bz,
          y: Math.max(eco.height(bx, bz), sea - 0.12),
          yaw: rng.next() * Math.PI * 2,
          sway: rng.range(0.25, 0.9),
          phase: rng.next(),
          rate: rng.range(1 / 14, 1 / 5),
          scale: rng.range(0.86, 1.16),
          // two thirds egret-pale, the rest grey-brown herons
          tint: rng.next() < 0.66 ? rng.range(0.72, 1.0) : rng.range(0.06, 0.3),
        });
      }
      if (out.length > 40) return;
    }
  }

  /**
   * @param t seconds
   */
  _updateWaders(t: number, camPos: THREE.Vector3) {
    const g = this.waders;
    if (camPos) g.stream.update(camPos);
    const anim = g.anim.array;
    let i = 0;
    for (const arr of g.stream.live.values()) {
      for (const b of arr) {
        if (i >= g.cap) break;
        if (camPos) {
          const dx = b.x - camPos.x, dz = b.z - camPos.z;
          if (dx * dx + dz * dz > g.range * g.range) continue;
        }
        _e.set(0, b.yaw + Math.sin(t * 0.11 + b.phase * 19) * b.sway, 0);
        _q.setFromEuler(_e);
        _p.set(b.x, b.y, b.z);
        _s.setScalar(b.scale);
        _m.compose(_p, _q, _s);
        _m.toArray(g.mesh.instanceMatrix.array, i * 16);
        anim[i * 4] = b.phase;
        anim[i * 4 + 1] = b.rate;
        anim[i * 4 + 2] = 0;
        anim[i * 4 + 3] = b.tint;
        i++;
      }
      if (i >= g.cap) break;
    }
    g.mesh.count = i;
    g.mesh.visible = i > 0;
    g.mesh.instanceMatrix.needsUpdate = true;
    g.anim.needsUpdate = true;
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
    const site = this.eco.sites.find((s: any) => s.type === 'crashsite');
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
   * Place the herd for this frame.
   *
   * The CPU only ever does two things per animal: work out where on its
   * wander arc it has got to, and stand it on the ground facing the way it
   * is walking. Every joint — head down cropping, the look-up, the tail
   * flick, the legs — happens in the vertex shader off `aanim`, which is why
   * seventy-two animated garula are still one draw call and about forty
   * microseconds of JavaScript.
   *
   * @param t seconds
   */
  _updateHerd(t: number, camPos: THREE.Vector3) {
    const g = this.herd, eco = this.eco;
    if (camPos) g.stream.update(camPos);
    const anim = g.anim.array;
    let i = 0;
    for (const arr of g.stream.live.values()) {
      for (const h of arr) {
        if (i >= g.cap) break;
        if (camPos) {
          const dx = h.ax - camPos.x, dz = h.az - camPos.z;
          if (dx * dx + dz * dz > g.range * g.range) continue;
        }
        // walk along the arc only while the shader is swinging the legs
        const { u, s } = walkCycle(t, h.phase, h.rate);
        const dist = (Math.floor(u) + s) * CYCLE_DISTANCE * h.scale;
        const th = h.theta0 + (dist / h.radius) * h.dir;
        const x = h.cx + Math.cos(th) * h.radius;
        const z = h.cz + Math.sin(th) * h.radius;
        // heading is the tangent of the arc
        _fwd.set(-Math.sin(th) * h.dir, 0, Math.cos(th) * h.dir).normalize();
        // plant it on the slope, but only three-quarters of the way — a
        // fully slope-aligned animal on a lumpy field looks drunk
        eco.normal(x, z, _up).lerp(_worldUp, 0.28).normalize();
        _right.crossVectors(_up, _fwd).normalize();
        _fwd.crossVectors(_right, _up).normalize();
        _m.makeBasis(_right, _up, _fwd);
        _m.scale(_s.setScalar(h.scale));
        _m.setPosition(x, eco.height(x, z) - 0.04, z);
        _m.toArray(g.mesh.instanceMatrix.array, i * 16);

        anim[i * 4] = h.phase;
        anim[i * 4 + 1] = h.rate;
        // heads come up when something the size of a Regalia is close
        anim[i * 4 + 2] = Math.max(h.idle, camPos
          ? 1 - THREE.MathUtils.smoothstep(camPos.distanceTo(_p.set(x, camPos.y, z)), 16, 42) : 0);
        anim[i * 4 + 3] = h.tint;
        i++;
      }
      if (i >= g.cap) break;
    }
    g.mesh.count = i;
    g.mesh.visible = i > 0;
    g.mesh.instanceMatrix.needsUpdate = true;
    g.anim.needsUpdate = true;
  }

  /**
   * @param t seconds
   * @param night 0 by day, 1 after dark
   */
  update(dt: number, t: number, night: number, camPos: THREE.Vector3) {
    this.timeRef.value = t;
    if (this.birds) {
      const g = this.birds;
      if (camPos) g.stream.update(camPos);
      let i = 0;
      for (const arr of g.stream.live.values()) for (const b of arr) {
        if (i >= g.cap) break;
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
        i++;
      }
      g.mesh.count = i;
      g.mesh.visible = i > 0;
      g.mesh.instanceMatrix.needsUpdate = true;
    }

    if (this.herd) this._updateHerd(t, camPos);
    if (this.waders) this._updateWaders(t, camPos);

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

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../util/Rng.js';
import { hash3 } from '../veg/Ecology.js';
import { woodMaterial, rustMaterial } from './PropMaterials.js';
import { TileStream } from './TileStream.js';
import { dressAt, zoneMoist, LITTER_KINDS } from './ZoneDress.js';
import { WORLD } from '../map/WorldMap.js';
import { leafClusterTex } from '../veg/VegTextures.js';
import { patchVeg, registerAlphaCard } from '../veg/VegMaterial.js';

/**
 * The small stuff — fallen timber, leaf drift, bleached bones, road rubble,
 * driftwood, waymark cairns and the standing dead trunks of a drowned forest.
 * Individually worthless, collectively the difference between "landscape" and
 * "place" — and the fastest way to tell one zone from another at eye level.
 */

/** Water plane height; several litter kinds key off proximity to it. */
const SEA = WORLD.seaLevel;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** A few bent sticks lying together. */
function branchGeometry(seed) {
  const rng = new Rng(seed);
  const parts = [];
  const n = 2 + Math.floor(rng.next() * 3);
  for (let i = 0; i < n; i++) {
    const len = rng.range(0.5, 1.5);
    const r = rng.range(0.017, 0.045);
    const g = new THREE.CylinderGeometry(r * 0.5, r, len, 5, 2);
    g.rotateZ(Math.PI / 2);
    // kink it so it doesn't read as dowel
    const pos = g.attributes.position;
    const bend = rng.gauss(0, 0.35);
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      pos.setY(v, pos.getY(v) + bend * (x / len) * (x / len) * len * 0.4);
      pos.setZ(v, pos.getZ(v) + rng.gauss(0, 0.004));
    }
    g.computeVertexNormals();
    g.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(rng.gauss(0, 0.22), r, rng.gauss(0, 0.22)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.gauss(0, 0.2), rng.next() * Math.PI * 2, rng.gauss(0, 0.14))),
      new THREE.Vector3(1, 1, 1)
    ));
    parts.push(g);
    // a couple of side twigs
    if (rng.next() < 0.6) {
      const t = new THREE.CylinderGeometry(r * 0.25, r * 0.5, len * 0.42, 4, 1);
      t.rotateZ(Math.PI / 2);
      t.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(rng.gauss(0, 0.3), r * 1.4, rng.gauss(0, 0.3)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.gauss(0, 0.4), rng.next() * 6, rng.gauss(0, 0.3))),
        new THREE.Vector3(1, 1, 1)
      ));
      parts.push(t);
    }
  }
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere();
  return g;
}

/** Flat drift of dry leaves, lying on the ground. */
function leafDriftGeometry(seed) {
  const rng = new Rng(seed);
  const p = [], n = [], uv = [], idx = [], flex = [], col = [];
  const cards = 4;
  for (let i = 0; i < cards; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = rng.range(0, 0.4);
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const size = rng.range(0.28, 0.6);
    const rot = rng.next() * Math.PI * 2;
    const ca = Math.cos(rot), sa = Math.sin(rot);
    const base = p.length / 3;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [ux, uz] of corners) {
      const dx = (ux * ca - uz * sa) * size * 0.5;
      const dz = (ux * sa + uz * ca) * size * 0.5;
      p.push(cx + dx, 0.012 + i * 0.004, cz + dz);
      n.push(0, 1, 0);
      uv.push(ux * 0.5 + 0.5, uz * 0.5 + 0.5);
      const sh = 0.8 + rng.next() * 0.4;
      col.push(sh, sh * 0.94, sh * 0.8);
      flex.push(0);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aFlex', new THREE.Float32BufferAttribute(flex, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Half-buried skull and ribs. */
function bonesGeometry(seed) {
  const rng = new Rng(seed);
  const parts = [];
  const skull = new THREE.SphereGeometry(0.24, 12, 9);
  skull.scale(1.5, 0.85, 0.9);
  skull.translate(0, 0.16, 0);
  parts.push(skull);
  const snout = new THREE.CylinderGeometry(0.09, 0.13, 0.34, 8);
  snout.rotateZ(Math.PI / 2);
  snout.translate(0.42, 0.12, 0);
  parts.push(snout);
  for (const s of [-1, 1]) {
    const horn = new THREE.ConeGeometry(0.055, 0.5, 7);
    horn.rotateZ(s * 0.9);
    horn.translate(-0.1, 0.36, s * 0.2);
    parts.push(horn);
  }
  const spine = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6);
  spine.rotateZ(Math.PI / 2);
  spine.translate(-1.0, 0.08, 0);
  parts.push(spine);
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) {
      const rib = new THREE.TorusGeometry(0.26, 0.022, 5, 10, Math.PI * 0.85);
      rib.rotateY(Math.PI / 2);
      rib.rotateX(s > 0 ? 0 : Math.PI);
      rib.translate(-0.5 - i * 0.17, 0.1, 0);
      parts.push(rib);
    }
  }
  for (const g of parts) g.applyMatrix4(new THREE.Matrix4().makeRotationY(rng.next() * 0.2));
  const g = mergeGeometries(parts.map((x) => {
    for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k);
    return x;
  }), false);
  g.computeBoundingSphere();
  return g;
}

/** A fallen trunk: tapered, bark-rough, one broken end and a couple of stubs. */
function logGeometry(seed) {
  const rng = new Rng(seed);
  const parts = [];
  const len = rng.range(4.0, 7.5);
  const r0 = rng.range(0.22, 0.42);
  const g = new THREE.CylinderGeometry(r0 * 0.62, r0, len, 9, 4);
  g.rotateZ(Math.PI / 2);
  const pos = g.attributes.position;
  const bend = rng.gauss(0, 0.22);
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v) / len;
    pos.setY(v, pos.getY(v) + bend * x * x * len * 0.5 + rng.gauss(0, 0.012));
    pos.setZ(v, pos.getZ(v) + rng.gauss(0, 0.014));
  }
  g.computeVertexNormals();
  parts.push(g);
  // splintered break at the thick end
  const br = new THREE.ConeGeometry(r0, r0 * 2.2, 7);
  br.rotateZ(-Math.PI / 2);
  br.translate(-len * 0.5 - r0 * 0.7, 0, 0);
  parts.push(br);
  // limb stubs
  for (let i = 0; i < 3; i++) {
    const t = rng.range(-0.35, 0.4) * len;
    const s = new THREE.CylinderGeometry(r0 * 0.16, r0 * 0.34, rng.range(0.5, 1.3), 5);
    s.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(t, r0 * 0.6, rng.gauss(0, 0.1)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.gauss(0, 0.6), rng.next() * 6, rng.range(-1.1, 1.1))),
      new THREE.Vector3(1, 1, 1)
    ));
    parts.push(s);
  }
  const out = mergeGeometries(parts.map(stripAttrs), false);
  out.translate(0, r0 * 0.9, 0);
  out.computeBoundingSphere();
  return out;
}

/** A broken stump with buttress roots spreading into the soil. */
function stumpGeometry(seed) {
  const rng = new Rng(seed);
  const parts = [];
  const r = rng.range(0.3, 0.55);
  const h = rng.range(0.6, 1.5);
  const trunk = new THREE.CylinderGeometry(r * 0.86, r, h, 10, 2);
  const pos = trunk.attributes.position;
  for (let v = 0; v < pos.count; v++) {
    if (pos.getY(v) > h * 0.4) pos.setY(v, pos.getY(v) - Math.abs(rng.gauss(0, 0.16)));
  }
  trunk.computeVertexNormals();
  trunk.translate(0, h * 0.5, 0);
  parts.push(trunk);
  const n = 4 + Math.floor(rng.next() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.gauss(0, 0.3);
    const root = new THREE.CylinderGeometry(0.05, r * 0.5, rng.range(0.7, 1.5), 5);
    root.rotateZ(Math.PI * 0.5);
    root.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * r * 0.9, 0.08, Math.sin(a) * r * 0.9),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, -0.35)),
      new THREE.Vector3(1, 1, 1)
    ));
    parts.push(root);
  }
  const out = mergeGeometries(parts.map(stripAttrs), false);
  out.computeBoundingSphere();
  return out;
}

/**
 * A standing dead trunk — the whole silhouette of the Vesperpool.
 *
 * Snapped off at four to nine metres, no canopy, a couple of bare limbs. A
 * hundred of these standing in black water is the drowned forest; without
 * them the Vesperpool is a lake with nothing in it.
 */
function deadTrunkGeometry(seed) {
  const rng = new Rng(seed);
  const parts = [];
  const h = rng.range(4.5, 9.0);
  const r = rng.range(0.16, 0.3);
  const g = new THREE.CylinderGeometry(r * 0.4, r, h, 8, 5);
  const pos = g.attributes.position;
  const lean = rng.gauss(0, 0.05);
  for (let v = 0; v < pos.count; v++) {
    const t = (pos.getY(v) + h * 0.5) / h;
    pos.setX(v, pos.getX(v) + lean * t * t * h);
    pos.setZ(v, pos.getZ(v) + rng.gauss(0, 0.02));
  }
  g.computeVertexNormals();
  g.translate(0, h * 0.5, 0);
  parts.push(g);
  for (let i = 0; i < 3; i++) {
    const y = rng.range(0.45, 0.9) * h;
    const limb = new THREE.CylinderGeometry(0.02, r * 0.42, rng.range(0.8, 2.2), 5);
    limb.rotateZ(Math.PI / 2);
    limb.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(0, y, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.next() * 6.28, rng.range(0.1, 0.9))),
      new THREE.Vector3(1, 1, 1)
    ));
    parts.push(limb);
  }
  const out = mergeGeometries(parts.map(stripAttrs), false);
  out.computeBoundingSphere();
  return out;
}

/** Sun-bleached driftwood: a root ball with a few bare arms. */
function driftwoodGeometry(seed) {
  const rng = new Rng(seed);
  const parts = [];
  const core = new THREE.DodecahedronGeometry(rng.range(0.3, 0.5), 0);
  core.scale(1.3, 0.7, 1.0);
  parts.push(core);
  for (let i = 0; i < 6; i++) {
    const a = rng.next() * Math.PI * 2;
    const l = rng.range(0.7, 2.0);
    const arm = new THREE.CylinderGeometry(0.03, rng.range(0.07, 0.14), l, 5);
    arm.rotateZ(Math.PI / 2);
    arm.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(0, rng.range(-0.1, 0.25), 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.gauss(0, 0.5), a, rng.range(-0.5, 0.7))),
      new THREE.Vector3(1, 1, 1)
    ));
    parts.push(arm);
  }
  const out = mergeGeometries(parts.map(stripAttrs), false);
  out.translate(0, 0.28, 0);
  out.computeBoundingSphere();
  return out;
}

/** A chunk of broken carriageway: slab, aggregate face, bent rebar. */
function rubbleGeometry(seed) {
  const rng = new Rng(seed);
  const parts = [];
  const w = rng.range(0.8, 2.0), h = rng.range(0.18, 0.4), d = rng.range(0.6, 1.5);
  const slab = new THREE.BoxGeometry(w, h, d, 2, 1, 2);
  const p = slab.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) + rng.gauss(0, 0.06), p.getY(i) + rng.gauss(0, 0.03), p.getZ(i) + rng.gauss(0, 0.06));
  }
  slab.computeVertexNormals();
  parts.push(slab);
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.CylinderGeometry(0.018, 0.018, rng.range(0.3, 0.9), 4);
    bar.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(rng.range(-w * 0.4, w * 0.4), h * 0.5, rng.range(-d * 0.4, d * 0.4)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-1.2, 1.2), rng.next() * 6, rng.range(-1.2, 1.2))),
      new THREE.Vector3(1, 1, 1)
    ));
    parts.push(bar);
  }
  const out = mergeGeometries(parts.map(stripAttrs), false);
  out.translate(0, h * 0.4, 0);
  out.computeBoundingSphere();
  return out;
}

/** A hunter's waymark: five or six flat stones stacked and settled. */
function cairnGeometry(seed) {
  const rng = new Rng(seed);
  const parts = [];
  let y = 0;
  const n = 5 + Math.floor(rng.next() * 3);
  for (let i = 0; i < n; i++) {
    const r = 0.34 * (1 - i / (n + 2));
    const st = new THREE.CylinderGeometry(r, r * 1.12, r * 0.62, 7, 1);
    st.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(rng.gauss(0, 0.03), y + r * 0.31, rng.gauss(0, 0.03)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.gauss(0, 0.08), rng.next() * 6, rng.gauss(0, 0.08))),
      new THREE.Vector3(1, 1, 1)
    ));
    parts.push(st);
    y += r * 0.6;
  }
  const out = mergeGeometries(parts.map(stripAttrs), false);
  out.computeBoundingSphere();
  return out;
}

/** An oil drum, standing or fallen. */
function barrelGeometry(seed) {
  const rng = new Rng(seed);
  const parts = [new THREE.CylinderGeometry(0.3, 0.3, 0.88, 12, 1)];
  for (const y of [-0.22, 0.22]) {
    const rib = new THREE.TorusGeometry(0.305, 0.025, 5, 12);
    rib.rotateX(Math.PI / 2);
    rib.translate(0, y, 0);
    parts.push(rib);
  }
  const out = mergeGeometries(parts.map(stripAttrs), false);
  out.translate(0, 0.44 + rng.next() * 0, 0);
  out.computeBoundingSphere();
  return out;
}

/**
 * Normalise a primitive for merging.
 *
 * `mergeGeometries` returns **null** — not an error — if one input is indexed
 * and another is not, which is how a DodecahedronGeometry mixed in with a pile
 * of cylinders silently produced a null driftwood mesh. Force both an index
 * and a uv set on everything.
 */
function stripAttrs(g) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return g;
}

/**
 * The litter layer, streamed and zone-driven.
 *
 * Each kind carries its own *terrain* preference — leaf drift wants a canopy,
 * bones want dry ground, driftwood wants a shoreline, a standing dead trunk
 * wants water round its ankles — and the *amount* comes from the zone recipe
 * in {@link ZONE_DRESS}. The two multiply, so the Nebulawood floor is timber
 * and leaf mould, the Leide washes are bone and dry brush, Ravatogh has almost
 * nothing on it, and none of it has to be authored per region.
 */
const LITTER = {
  branch: { seed: 11, geo: branchGeometry, mat: 'wood', per: 6, range: 105, scale: [0.7, 1.7], sink: 0.02, flat: false },
  log: { seed: 61, geo: logGeometry, mat: 'wood', per: 2.2, range: 200, scale: [0.8, 1.5], sink: 0.06, lie: true },
  stump: { seed: 62, geo: stumpGeometry, mat: 'wood', per: 1.6, range: 150, scale: [0.8, 1.6], sink: 0.05 },
  leaves: { seed: 23, geo: leafDriftGeometry, mat: 'leaf', per: 9, range: 62, scale: [0.8, 1.9], flat: true, card: true, cast: false },
  bones: { seed: 37, geo: bonesGeometry, mat: 'bone', per: 0.5, range: 175, scale: [0.8, 1.5], sink: 0.05 },
  planks: { seed: 77, geo: null, mat: 'wood', per: 0.9, range: 130, scale: [0.7, 1.4], sink: 0.01 },
  rubble: { seed: 81, geo: rubbleGeometry, mat: 'stone', per: 3.0, range: 150, scale: [0.7, 1.7], sink: 0.04 },
  driftwood: { seed: 83, geo: driftwoodGeometry, mat: 'bleach', per: 1.6, range: 165, scale: [0.8, 1.7], sink: 0.03 },
  deadtrunk: { seed: 85, geo: deadTrunkGeometry, mat: 'bleach', per: 2.4, range: 560, scale: [0.8, 1.5], sink: 0.03, tilt: 0.06 },
  cairn: { seed: 87, geo: cairnGeometry, mat: 'stone', per: 0.5, range: 150, scale: [0.9, 1.7], sink: 0.02 },
  barrel: { seed: 89, geo: barrelGeometry, mat: 'rust', per: 0.8, range: 130, scale: [0.85, 1.2], sink: 0.02 },
};

const CAPS = {
  branch: 620, log: 260, stump: 200, leaves: 900, bones: 90, planks: 150,
  rubble: 300, driftwood: 180, deadtrunk: 460, cairn: 70, barrel: 110,
};

export class Debris {
  constructor(eco, scene, { quality = 1 } = {}) {
    this.eco = eco; this.scene = scene; this.quality = quality;
    this.groups = new Map();
    this.cell = 64;
    this.radius = 540 * (quality < 0.7 ? 0.8 : 1);
    this._last = new THREE.Vector3(1e9, 0, 1e9);
  }

  build() {
    const wood = woodMaterial(0x6d5a44);
    const M = {
      wood,
      bone: new THREE.MeshStandardMaterial({ color: 0xcfc6ae, roughness: 0.72, metalness: 0 }),
      bleach: woodMaterial(0xa79c86),
      stone: new THREE.MeshStandardMaterial({ color: 0x8e8778, roughness: 0.94, metalness: 0 }),
      rust: rustMaterial(0x8a5a38, 0.5),
      leaf: patchVeg(new THREE.MeshStandardMaterial({
        map: leafClusterTex('dry'), color: 0xc9a566, vertexColors: true,
        alphaTest: 0.36, transparent: false, side: THREE.DoubleSide,
        roughness: 0.9, metalness: 0,
      }), { bend: 0.02, flutter: 0.05, gustFreq: 0.06, flexPow: 1.0 }),
    };
    for (const k of Object.keys(M)) if (!M[k].name) M[k].name = `debris_${k}`;
    this.mats = M;

    const plankGeo = mergeGeometries([
      new THREE.BoxGeometry(1.5, 0.05, 0.2),
      new THREE.BoxGeometry(1.1, 0.05, 0.16).translate(0.2, 0.06, 0.26),
    ], false);

    for (const key of LITTER_KINDS) {
      const def = LITTER[key];
      if (!def) continue;
      const geo = key === 'planks' ? plankGeo : def.geo(def.seed);
      const max = Math.max(8, Math.round(CAPS[key] * this.quality));
      const mesh = new THREE.InstancedMesh(geo, M[def.mat], max);
      mesh.castShadow = def.cast !== false;
      mesh.receiveShadow = true;
      mesh.count = 0; mesh.frustumCulled = false;
      mesh.name = `debris_${key}`;
      if (def.card) registerAlphaCard(mesh);
      this.scene.add(mesh);
      this.groups.set(key, { def, mesh, max, w: 0 });
    }

    this.stream = new TileStream({
      cell: this.cell, radius: this.radius,
      gen: (cx, cz, out) => this._genCell(cx, cz, out),
      budget: 10,
    });
    const o = new THREE.Vector3();
    this.stream.flush(o);
    this.update(o);
  }

  /**
   * Per-kind terrain suitability, 0..1. This is the half of the recipe the
   * zone table does not know: a zone can want driftwood, but only the water's
   * edge can actually have any.
   */
  _fit(key, x, z) {
    const eco = this.eco;
    const slope = eco.slope01(x, z);
    if (slope > 0.72) return 0;
    // Lucis is rolling badland: gating litter at a 0.55 slope meant almost the
    // whole map counted as "too steep" and the debris layer only ever landed
    // on the valley floors.
    const flat = 1 - THREE.MathUtils.smoothstep(slope, 0.38, 0.72);
    const road = THREE.MathUtils.smoothstep(eco.roadDist(x, z), 5, 14);
    const site = 1 - eco.siteBlock(x, z) * 0.85;
    const base = flat * road * site;
    if (base <= 0.01) return 0;
    const h = eco.height(x, z);
    switch (key) {
      case 'leaves':
      case 'branch':
      case 'log':
      case 'stump': {
        // Deliberately NOT gated on `treeDensity`. That sampler reads a global
        // moisture fbm which does not know the Nebulawood is a rainforest, so
        // gating on it left the wettest zones in Lucis with a bare floor. The
        // zone recipe already says how much timber belongs here; all this adds
        // is clumping, plus a bonus under an actual grove.
        const clump = 0.35 + 0.65 * eco.patch(x - 120, z + 260, 0.02, 2);
        return base * THREE.MathUtils.clamp(clump * (0.7 + eco.treeDensity(x, z) * 0.9), 0, 1);
      }
      case 'bones':
        return base * (1 - THREE.MathUtils.smoothstep(
          Math.max(eco.moisture(x, z), zoneMoist(x, z)), 0.3, 0.62));
      case 'deadtrunk': {
        // Depth of water over the bed, in metres. A trunk stands on the bed,
        // so it only reads if the bed is within a trunk's height of the
        // surface: any deeper and the whole thing is submerged, which is how
        // the first attempt put four hundred invisible trees in the Vesperpool.
        const d = SEA - h;
        return base * THREE.MathUtils.smoothstep(d, -2.5, 0.5)
          * (1 - THREE.MathUtils.smoothstep(d, 4.0, 6.5));
      }
      case 'driftwood':
        return base * (1 - THREE.MathUtils.smoothstep(Math.abs(h - SEA), 3, 22));
      case 'rubble':
      case 'barrel':
      case 'planks':
        // man-made rubbish gathers where people were: near the road
        return base * (0.3 + 0.7 * (1 - THREE.MathUtils.smoothstep(eco.roadDist(x, z), 20, 90)));
      case 'cairn':
        // waymarks sit on high ground you can see from
        return base * THREE.MathUtils.smoothstep(eco.patch(x + 4000, z - 2200, 0.02, 2), 0.55, 0.85);
      default:
        return base;
    }
  }

  _genCell(cx, cz, out) {
    const c = this.cell;
    const rng = new Rng(hash3(cx, cz, 0x5d13));
    const bx = cx * c, bz = cz * c;
    const dress = dressAt(bx + c * 0.5, bz + c * 0.5);
    for (const key of LITTER_KINDS) {
      const want = dress.litter[key];
      if (!want) continue;
      const def = LITTER[key];
      const n = Math.round(def.per * want * rng.range(0.35, 1.7));
      for (let i = 0; i < n; i++) {
        const x = bx + rng.next() * c, z = bz + rng.next() * c;
        const f = this._fit(key, x, z);
        if (f <= 0.02 || rng.next() > f) continue;
        out.push({
          k: key, x, z, y: this.eco.height(x, z),
          s: def.scale[0] + rng.next() * (def.scale[1] - def.scale[0]),
          yaw: rng.next() * Math.PI * 2,
          tilt: def.flat ? 0 : rng.gauss(0, def.tilt !== undefined ? def.tilt : 0.12),
          roll: def.lie ? rng.gauss(0, 0.1) : 0,
          sink: def.sink || 0,
        });
      }
    }
  }

  update(camPos) {
    const moved = this._last.distanceToSquared(camPos) >= 100;
    const changed = this.stream.update(camPos);
    if (!moved && !changed) return;
    this._last.copy(camPos);
    for (const g of this.groups.values()) g.w = 0;
    const cx = camPos.x, cz = camPos.z;
    for (const arr of this.stream.live.values()) {
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        const g = this.groups.get(it.k);
        if (!g || g.w >= g.max) continue;
        const dx = it.x - cx, dz = it.z - cz;
        const r = g.def.range;
        if (dx * dx + dz * dz > r * r) continue;
        _e.set(it.tilt, it.yaw, it.roll || it.tilt * 0.7);
        _q.setFromEuler(_e);
        _p.set(it.x, it.y - it.sink, it.z);
        _s.set(it.s, it.s, it.s);
        _m.compose(_p, _q, _s);
        _m.toArray(g.mesh.instanceMatrix.array, g.w * 16);
        g.w++;
      }
    }
    for (const g of this.groups.values()) {
      g.mesh.count = g.w;
      g.mesh.visible = g.w > 0;
      g.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

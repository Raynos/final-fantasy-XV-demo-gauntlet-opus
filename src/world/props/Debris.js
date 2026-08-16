import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../util/Rng.js';
import { woodMaterial } from './PropMaterials.js';
import { leafClusterTex } from '../veg/VegTextures.js';
import { patchVeg, registerAlphaCard } from '../veg/VegMaterial.js';

/**
 * The small stuff — dead branches, drifts of dry leaves, bleached bones and
 * broken planks. Individually worthless, collectively the difference between
 * "landscape" and "place".
 */

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

export class Debris {
  constructor(eco, scene, { quality = 1 } = {}) {
    this.eco = eco; this.scene = scene; this.quality = quality;
    this.groups = [];
    this._last = new THREE.Vector3(1e9, 0, 1e9);
  }

  build() {
    const eco = this.eco;
    const rng = new Rng(2468);
    const wood = woodMaterial(0x6d5a44);
    const bone = new THREE.MeshStandardMaterial({ color: 0xcfc6ae, roughness: 0.72, metalness: 0 });
    const leafMat = patchVeg(new THREE.MeshStandardMaterial({
      map: leafClusterTex('dry'), color: 0xc9a566, vertexColors: true,
      alphaTest: 0.36, transparent: false, side: THREE.DoubleSide,
      roughness: 0.9, metalness: 0,
    }), { bend: 0.02, flutter: 0.05, gustFreq: 0.06, flexPow: 1.0 });

    const add = (name, geo, mat, pts, range, scale, opts = {}) => {
      const max = Math.max(8, Math.min(pts.length, Math.round(pts.length * this.quality)));
      const mesh = new THREE.InstancedMesh(geo, mat, max);
      mesh.castShadow = opts.cast !== false;
      mesh.receiveShadow = true;
      mesh.count = 0; mesh.frustumCulled = false;
      mesh.name = `debris_${name}`;
      if (opts.card) registerAlphaCard(mesh);
      this.scene.add(mesh);
      this.groups.push({
        mesh, max, range,
        items: pts.map((p) => ({
          x: p.x, y: p.y, z: p.z,
          s: scale[0] + rng.next() * (scale[1] - scale[0]),
          yaw: rng.next() * Math.PI * 2,
          tilt: opts.flat ? 0 : rng.gauss(0, 0.12),
          sink: opts.sink || 0,
        })),
      });
    };

    // dead branches — thickest under trees, thinner in the open
    const branchPts = eco.scatterClustered(0x8b13, {
      radius: 130, cellSize: 30, perCell: 10, spread: 10,
      density: (x, z) => THREE.MathUtils.clamp(
        eco.treeDensity(x, z) * 1.6 + eco.scrubDensity(x, z) * 0.35, 0, 1),
      maxCount: 1500,
    });
    add('branch', branchGeometry(11), wood, branchPts, 105, [0.7, 1.7], { sink: 0.02 });

    // leaf litter, close in only
    const leafPts = eco.scatterClustered(0x5c22, {
      radius: 66, cellSize: 22, perCell: 12, spread: 7,
      density: (x, z) => THREE.MathUtils.clamp(
        eco.treeDensity(x, z) * 1.4 + 0.14 * (1 - eco.grassDensity(x, z)), 0, 1),
      maxCount: 2400,
    });
    add('leaves', leafDriftGeometry(23), leafMat, leafPts, 58, [0.8, 1.9], { flat: true, cast: false, card: true });

    // bones: rare, dry ground only
    const bonePts = eco.scatterClustered(0x9f01, {
      radius: 190, cellSize: 90, perCell: 2, spread: 6,
      density: (x, z) => {
        const m = eco.moisture(x, z);
        return (1 - THREE.MathUtils.smoothstep(m, 0.25, 0.6)) * 0.5
          * THREE.MathUtils.smoothstep(eco.roadDist(x, z), 6, 16);
      },
      maxCount: 60,
    });
    add('bones', bonesGeometry(37), bone, bonePts, 175, [0.8, 1.5], { sink: 0.05 });

    // broken planks and posts near the road/outpost
    const plankGeo = mergeGeometries([
      new THREE.BoxGeometry(1.5, 0.05, 0.2),
      new THREE.BoxGeometry(1.1, 0.05, 0.16).translate(0.2, 0.06, 0.26),
    ], false);
    const plankPts = eco.scatterClustered(0x77aa, {
      radius: 140, cellSize: 55, perCell: 3, spread: 9,
      density: (x, z) => {
        const near = 1 - THREE.MathUtils.smoothstep(eco.roadDist(x, z), 8, 40);
        return near * 0.5 * (1 - eco.siteBlock(x, z) * 0.4);
      },
      maxCount: 180,
    });
    add('planks', plankGeo, wood, plankPts, 120, [0.7, 1.4], { sink: 0.01 });

    this.update(new THREE.Vector3());
  }

  update(camPos) {
    if (this._last.distanceToSquared(camPos) < 64) return;
    this._last.copy(camPos);
    for (const g of this.groups) {
      let w = 0;
      const r2 = g.range * g.range;
      for (const it of g.items) {
        const dx = it.x - camPos.x, dz = it.z - camPos.z;
        if (dx * dx + dz * dz > r2) continue;
        if (w >= g.max) break;
        _e.set(it.tilt, it.yaw, it.tilt * 0.7);
        _q.setFromEuler(_e);
        _p.set(it.x, it.y - it.sink, it.z);
        _s.set(it.s, it.s, it.s);
        _m.compose(_p, _q, _s);
        _m.toArray(g.mesh.instanceMatrix.array, w * 16);
        w++;
      }
      g.mesh.count = w;
      g.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

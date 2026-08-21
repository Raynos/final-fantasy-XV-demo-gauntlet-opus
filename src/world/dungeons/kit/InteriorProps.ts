import * as THREE from 'three';
import { Rng } from '../../../util/Rng.ts';
import { Noise } from '../../../util/Noise.ts';
import * as M from './InteriorMaterials.ts';

/**
 * The set-dressing kit. Everything a dungeon puts inside its shell — the
 * emergency strips and magitek crates of an imperial trench, the pit props and
 * rail of a mine, the dripstone and glowing fungus of a cave — is built here
 * and merged into a handful of draw calls.
 *
 * Props are *placed by the dungeon author*, not scattered. A minecart sits at
 * the end of a rail run because someone pushed it there; rebar bursts out of a
 * wall where the shell was breached. That intent is what separates a dungeon
 * from a room with clutter in it.
 */

const G = {};
function geo(key, make) { if (!G[key]) G[key] = make(); return G[key]; }
const box = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const cyl = (seg = 10) => geo(`cyl${seg}`, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg));
const cone = (seg = 9) => geo(`cone${seg}`, () => new THREE.ConeGeometry(0.5, 1, seg));
const sph = (seg = 10) => geo(`sph${seg}`, () => new THREE.SphereGeometry(0.5, seg, Math.max(4, seg >> 1)));
const plane = () => geo('plane', () => new THREE.PlaneGeometry(1, 1));
const torus = () => geo('torus', () => new THREE.TorusGeometry(0.5, 0.12, 6, 14));

export class PropKit {
  /**
   * @param {object} o
   * @param {import('./Build.ts').InteriorMerger} o.merger
   * @param {import('./LightRig.ts').LightRig} o.rig
   * @param {import('./Layout.ts').Layout} o.layout
   * @param {THREE.Group} o.group loose (animated) objects go here
   * @param {number} [o.seed]
   */
  constructor(o) {
    this.m = o.merger;
    this.rig = o.rig;
    this.L = o.layout;
    this.group = o.group;
    this.rng = new Rng(o.seed || 20016);
    this.n = new Noise((o.seed || 20016) ^ 0x51ab);
    /** @type {object[]} interactable descriptors handed to the game */
    this.interactables = [];
    this.animated = [];
  }

  /** Baked occlusion at a point so props share the shell's shading. */
  ao(x, y, z) { return this.L.occlusion(x, y, z); }

  /** Data-driven placement: `layout.prop('minecart', [x,z], {...})`. */
  place(kind, spec) {
    const fn = this[kind];
    if (typeof fn !== 'function') return;
    const [x, z] = spec.at;
    const y = spec.y != null ? spec.y : (this.L.floorAt(x, z) || 0);
    fn.call(this, x, y, z, spec);
  }

  /* ------------------------------------------------------------- Keycatrich */

  /**
   * Caged emergency strip light. The single most important prop in the trench:
   * a long, hard, cold source that rakes the concrete and gives every corridor
   * a direction.
   */
  emergencyStrip(x, y, z, s = {}) {
    const rot = s.rot || 0;
    const len = s.len || 1.9;
    const col = s.color != null ? s.color : 0xffb267;
    const steel = M.corrodedSteel(0x3c3a36);
    const lamp = M.emissiveMaterial(col, 1.7);
    const t = this.ao(x, y, z);
    // back plate + end caps
    this.m.place(steel, box(), [x, y, z], [0, rot, 0], [len + 0.22, 0.30, 0.16], t);
    this.m.place(lamp, box(), [x, y, z], [0, rot, 0], [len, 0.13, 0.09]);
    // protective cage
    const c = Math.cos(rot), sn = Math.sin(rot);
    for (let i = -2; i <= 2; i++) {
      const o = (i / 2) * len * 0.46;
      this.m.place(steel, box(), [x + c * o, y, z - sn * o], [0, rot, 0], [0.035, 0.30, 0.19], t);
    }
    this.rig.add({
      pos: [x - sn * 0.0, y - 0.16, z - c * 0.0],
      color: col, intensity: s.intensity != null ? s.intensity : 5.5,
      range: s.range || 12, flicker: s.flicker != null ? s.flicker : 0.10,
      glow: s.glow != null ? s.glow : 0.9, glowSize: 1.5,
    });
  }

  /** A dead strip: same fixture, no light. Contrast is what sells the live ones. */
  deadStrip(x, y, z, s = {}) {
    const steel = M.corrodedSteel(0x3c3a36);
    const t = this.ao(x, y, z) * 0.8;
    this.m.place(steel, box(), [x, y, z], [0, s.rot || 0, 0], [(s.len || 1.9) + 0.22, 0.30, 0.16], t);
    this.m.place(M.emissiveMaterial(0x14161a, 0.04), box(), [x, y, z], [0, s.rot || 0, 0], [s.len || 1.9, 0.13, 0.09]);
  }

  /** Stacked Niflheim supply crates with a live seam of blue running light. */
  magitekCrate(x, y, z, s = {}) {
    const plate = M.magitekPlate();
    const glow = M.emissiveMaterial(0x63d0ff, 1.2);
    const n = s.stack || 1;
    const rot = s.rot || 0;
    for (let i = 0; i < n; i++) {
      const h = 0.78 - i * 0.06;
      const w = 1.05 - i * 0.08;
      const yy = y + 0.39 + i * 0.80;
      const jitter = (this.rng.next() - 0.5) * 0.14;
      this.m.place(plate, box(), [x + jitter, yy, z + jitter * 0.5],
        [0, rot + jitter * 0.4, 0], [w, h, w * 0.86], this.ao(x, yy, z));
      // seam
      this.m.place(glow, box(), [x + jitter, yy + h * 0.14, z + jitter * 0.5],
        [0, rot + jitter * 0.4, 0], [w * 1.005, 0.035, w * 0.865]);
    }
    this.rig.add({
      pos: [x, y + 0.5 + (n - 1) * 0.8, z], color: 0x63d0ff,
      intensity: 1.5, range: 5.5, flicker: 0.02, glow: 0.55, glowSize: 0.8,
    });
  }

  /** Bent reinforcement bar bursting out of spalled concrete. */
  rebar(x, y, z, s = {}) {
    const steel = M.corrodedSteel(0x6a4a30);
    const n = s.count || 5;
    const rot = s.rot || 0;
    for (let i = 0; i < n; i++) {
      const a = rot + (this.rng.next() - 0.5) * 1.5;
      const len = 0.9 + this.rng.next() * 1.5;
      const tilt = 0.4 + this.rng.next() * 0.9;
      const yy = y + (s.up ? this.rng.next() * 0.4 : 0.2 + this.rng.next() * 1.4);
      this.m.place(steel, cyl(5),
        [x + Math.cos(a) * len * 0.3, yy + Math.cos(tilt) * len * 0.3, z + Math.sin(a) * len * 0.3],
        [tilt * Math.cos(a + 1.57), a, tilt * Math.sin(a)],
        [0.035, len, 0.035], this.ao(x, yy, z));
    }
  }

  /** Concrete spall and broken block. */
  rubble(x, y, z, s = {}) {
    const mat = s.mat || M.trenchFloor();
    const n = s.count || 9;
    const r = s.radius || 1.8;
    for (let i = 0; i < n; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const d = Math.sqrt(this.rng.next()) * r;
      const sz = (0.16 + this.rng.next() * 0.5) * (s.scale || 1);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      this.m.place(mat, box(), [px, y + sz * 0.35, pz],
        [this.rng.range(-0.5, 0.5), this.rng.range(0, 3.14), this.rng.range(-0.5, 0.5)],
        [sz * 1.4, sz * 0.7, sz * 1.15], this.ao(px, y + sz, pz) * 0.92);
    }
  }

  /** A collapsed tunnel: a wall of rubble and bent steel plugging a passage. */
  collapse(x, y, z, s = {}) {
    const rot = s.rot || 0;
    const w = s.width || 3.4;
    this.rubble(x, y, z, { count: 26, radius: w * 0.55, scale: 1.5, mat: s.mat || M.trenchFloor() });
    for (let i = 0; i < 14; i++) {
      const px = x + this.rng.range(-w * 0.5, w * 0.5) * Math.cos(rot);
      const pz = z + this.rng.range(-w * 0.5, w * 0.5) * Math.sin(rot);
      const sz = 0.5 + this.rng.next() * 1.1;
      this.m.place(s.mat || M.trenchConcrete(), box(),
        [px, y + this.rng.range(0.2, 2.2), pz],
        [this.rng.range(-1, 1), this.rng.range(0, 3.14), this.rng.range(-1, 1)],
        [sz * 1.6, sz * 0.6, sz * 1.2], this.ao(px, y + 1, pz) * 0.82);
    }
    this.rebar(x, y + 0.6, z, { count: 8, rot, up: true });
  }

  /** Ceiling service run: pipe bundle on brackets. Reads as "someone built this". */
  pipeRun(x, y, z, s = {}) {
    const steel = M.corrodedSteel(0x554438);
    const len = s.len || 8;
    const rot = s.rot || 0;
    const t = this.ao(x, y, z);
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 0.24;
      const r = 0.10 - i * 0.018;
      this.m.place(steel, cyl(8), [x + Math.sin(rot) * off, y - 0.1 - (i % 2) * 0.05, z + Math.cos(rot) * off],
        [Math.PI / 2, 0, rot], [r, len, r], t);
    }
    const c = Math.cos(rot), sn = Math.sin(rot);
    for (let i = -2; i <= 2; i++) {
      const o = (i / 2) * len * 0.44;
      this.m.place(steel, box(), [x - sn * o, y - 0.03, z - c * o], [0, rot, 0], [0.75, 0.07, 0.06], t);
    }
  }

  /** Slack cabling stapled along a wall — pure silhouette detail. */
  cableRun(x, y, z, s = {}) {
    const mat = M.corrodedSteel(0x1e1c1a);
    const len = s.len || 6;
    const rot = s.rot || 0;
    const segs = 8;
    const c = Math.cos(rot), sn = Math.sin(rot);
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs - 0.5, t1 = (i + 1) / segs - 0.5;
        const sag = (a) => -Math.sin((a + 0.5) % (1 / 3) * Math.PI * 3) * 0.16;
        const p0 = [x + c * t0 * len, y + sag(t0) - k * 0.11, z - sn * t0 * len];
        const p1 = [x + c * t1 * len, y + sag(t1) - k * 0.11, z - sn * t1 * len];
        const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
        const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
        const pitch = Math.atan2(p1[1] - p0[1], Math.hypot(p1[0] - p0[0], p1[2] - p0[2]));
        this.m.place(mat, cyl(5), mid, [0, rot, Math.PI / 2 - pitch], [0.028, d, 0.028], this.ao(mid[0], mid[1], mid[2]));
      }
    }
  }

  /** Sandbag revetment. */
  sandbags(x, y, z, s = {}) {
    const mat = M.trenchFloor();
    const rot = s.rot || 0;
    const rows = s.rows || 3, per = s.per || 5;
    const c = Math.cos(rot), sn = Math.sin(rot);
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < per - r; i++) {
        const o = (i - (per - r - 1) / 2) * 0.52 + (r % 2) * 0.13;
        const px = x + c * o, pz = z - sn * o;
        const py = y + 0.14 + r * 0.25;
        this.m.place(mat, sph(8), [px, py, pz], [0, rot + this.rng.range(-0.2, 0.2), 0],
          [0.56, 0.26, 0.36], this.ao(px, py, pz) * 0.95);
      }
    }
  }

  /** The generator: the heart of the imperial power room. */
  generator(x, y, z, s = {}) {
    const rot = s.rot || 0;
    const plate = M.magitekPlate();
    const steel = M.corrodedSteel(0x4b4238);
    const glow = M.emissiveMaterial(0x8fe4ff, 1.3);
    const hot = M.emissiveMaterial(0xff6a2c, 1.5);
    const t = this.ao(x, y + 1, z);
    // plinth and casing
    this.m.place(M.trenchConcrete(), box(), [x, y + 0.18, z], [0, rot, 0], [4.2, 0.36, 2.6], t);
    this.m.place(plate, box(), [x, y + 1.25, z], [0, rot, 0], [3.4, 1.8, 1.9], t);
    this.m.place(steel, cyl(14), [x, y + 2.35, z], [0, rot, 0], [1.5, 0.6, 1.5], t);
    this.m.place(steel, cyl(12), [x - 1.9 * Math.cos(rot), y + 1.7, z + 1.9 * Math.sin(rot)],
      [0, rot, 0], [0.9, 2.6, 0.9], t);
    // exhaust up into the ceiling
    this.m.place(steel, cyl(10), [x + 1.3 * Math.cos(rot), y + 3.2, z - 1.3 * Math.sin(rot)],
      [0, rot, 0], [0.42, 3.0, 0.42], t);
    // instrument face
    this.m.place(glow, box(), [x + Math.sin(rot) * 0.98, y + 1.5, z + Math.cos(rot) * 0.98],
      [0, rot, 0], [1.5, 0.55, 0.04]);
    for (let i = 0; i < 5; i++) {
      this.m.place(i % 2 ? hot : glow, box(),
        [x + Math.sin(rot) * 0.98 + Math.cos(rot) * (i - 2) * 0.3, y + 0.75, z + Math.cos(rot) * 0.98 - Math.sin(rot) * (i - 2) * 0.3],
        [0, rot, 0], [0.12, 0.12, 0.05]);
    }
    // vents glowing from inside the casing
    this.m.place(hot, box(), [x, y + 0.55, z], [0, rot, 0], [3.15, 0.22, 2.0]);

    this.rig.add({ pos: [x + Math.sin(rot) * 1.3, y + 1.5, z + Math.cos(rot) * 1.3], color: 0x8fe4ff, intensity: 7, range: 13, flicker: 0.06, glow: 1.1, glowSize: 1.6 });
    this.rig.add({ pos: [x, y + 0.55, z], color: 0xff7a34, intensity: 5, range: 9, flicker: 0.22, glow: 0.9, glowSize: 1.9 });
    this.animated.push({ kind: 'hum', pos: new THREE.Vector3(x, y + 1, z) });
  }

  /**
   * A magitek pylon: a floor-to-ceiling column of imperial machinery with a
   * live coolant seam running up it. Four of these turn a big empty concrete
   * box into a room the Empire built, and give a boss arena its vertical beats.
   */
  magitekPylon(x, y, z, s = {}) {
    const plate = M.magitekPlate();
    const steel = M.corrodedSteel(0x3e3a34);
    const glow = M.emissiveMaterial(s.color || 0x63d0ff, 1.4);
    const h = s.h || 7;
    const r = s.r || 0.72;
    const rot = s.rot || 0;
    const t = this.ao(x, y + h * 0.5, z);
    this.m.place(steel, box(), [x, y + 0.18, z], [0, rot, 0], [r * 3.4, 0.36, r * 3.4], t);
    this.m.place(plate, box(), [x, y + h * 0.5 + 0.3, z], [0, rot, 0], [r * 2, h, r * 2], t);
    for (let i = 0; i < 4; i++) {
      const yy = y + 0.9 + i * (h / 4.4);
      this.m.place(steel, box(), [x, yy, z], [0, rot, 0], [r * 2.35, 0.16, r * 2.35], t);
    }
    for (const sg of [-1, 1]) {
      this.m.place(glow, box(), [x + Math.cos(rot) * r * sg, y + h * 0.5 + 0.3, z - Math.sin(rot) * r * sg],
        [0, rot, 0], [0.06, h * 0.82, 0.16]);
    }
    this.m.place(steel, box(), [x, y + h + 0.5, z], [0, rot, 0], [r * 3.0, 0.4, r * 3.0], t);
    this.rig.add({
      pos: [x, y + h * 0.55, z], color: s.color || 0x63d0ff,
      intensity: s.intensity || 4.0, range: s.range || 13,
      flicker: 0.04, glow: 0.85, glowSize: 1.4,
    });
  }

  /** A burning oil drum. Warm, unstable, and the only friendly light in a boss room. */
  brazier(x, y, z, s = {}) {
    const steel = M.corrodedSteel(0x6b4a2e);
    const fire = M.emissiveMaterial(0xff6a20, 0.85);
    const t = this.ao(x, y + 0.5, z);
    this.m.place(steel, cyl(12), [x, y + 0.45, z], [0, 0, 0], [0.62, 0.9, 0.62], t);
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      const w = 0.30 * (1 - t * 0.78);
      this.m.place(fire, cone(6),
        [x + this.rng.range(-0.20, 0.20) * (0.35 + t), y + 0.80 + t * 0.52, z + this.rng.range(-0.20, 0.20) * (0.35 + t)],
        [this.rng.range(-0.32, 0.32), this.rng.range(0, 3), this.rng.range(-0.32, 0.32)],
        [w, 0.22 + t * 0.22, w]);
    }
    this.rig.add({
      pos: [x, y + 1.15, z], color: 0xff8a3c,
      intensity: s.intensity || 9, range: s.range || 16,
      flicker: 0.30, glow: 1.3, glowSize: 1.7,
    });
  }

  /** Tripod work light aimed along a corridor. */
  floodLight(x, y, z, s = {}) {
    const steel = M.corrodedSteel(0x585048);
    const rot = s.rot || 0;
    const t = this.ao(x, y + 1, z);
    for (let i = 0; i < 3; i++) {
      const a = rot + (i / 3) * Math.PI * 2;
      this.m.place(steel, cyl(5), [x + Math.cos(a) * 0.28, y + 0.62, z + Math.sin(a) * 0.28],
        [0.42 * Math.sin(a), 0, -0.42 * Math.cos(a)], [0.045, 1.35, 0.045], t);
    }
    this.m.place(steel, box(), [x, y + 1.4, z], [0, rot, 0], [0.62, 0.42, 0.30], t);
    this.m.place(M.emissiveMaterial(0xffe0b0, 2.2), box(),
      [x + Math.sin(rot) * 0.16, y + 1.4, z + Math.cos(rot) * 0.16], [0, rot, 0], [0.5, 0.32, 0.04]);
    this.rig.add({
      pos: [x + Math.sin(rot) * 0.5, y + 1.4, z + Math.cos(rot) * 0.5],
      color: 0xffe0b0, intensity: s.intensity || 9, range: s.range || 15,
      flicker: 0.03, glow: 1.3, glowSize: 1.6,
    });
  }

  /* ----------------------------------------------------------------- Balouve */

  /** A pit-prop frame: two posts, a cap and lagging boards over the roof. */
  timberFrame(x, y, z, s = {}) {
    const w = M.pitTimber();
    const rot = s.rot || 0;
    const width = s.width || 3.4;
    const height = s.height || 3.2;
    const c = Math.cos(rot), sn = Math.sin(rot);
    const t = this.ao(x, y + 1, z);
    for (const sg of [-1, 1]) {
      const px = x + c * width * 0.5 * sg, pz = z - sn * width * 0.5 * sg;
      this.m.place(w, box(), [px, y + height * 0.5, pz],
        [0, rot + this.rng.range(-0.03, 0.03), sg * 0.035], [0.30, height, 0.28], t);
    }
    this.m.place(w, box(), [x, y + height + 0.13, z], [0, rot, 0], [width + 0.7, 0.28, 0.34], t);
    if (s.lagging !== false) {
      for (let i = -2; i <= 2; i++) {
        this.m.place(w, box(), [x - sn * i * 0.42, y + height + 0.34, z - c * i * 0.42],
          [0, rot, 0], [width + 0.4, 0.13, 0.30], t * 0.9);
      }
    }
  }

  /** Rail: sleepers and two running rails laid along a polyline. */
  railTrack(path, s = {}) {
    const steel = M.railSteel();
    const wood = M.pitTimber();
    const gauge = s.gauge || 0.86;
    const step = 0.72;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const dx = b[0] - a[0], dz = b[2] - a[2];
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const ang = Math.atan2(dx, dz);
      const n = Math.max(1, Math.round(len / step));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const px = a[0] + dx * t, pz = a[2] + dz * t;
        const py = a[1] + (b[1] - a[1]) * t;
        this.m.place(wood, box(), [px, py + 0.055, pz], [0, ang, 0], [gauge + 0.5, 0.11, 0.19],
          this.ao(px, py, pz) * 0.95);
      }
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.14, (a[2] + b[2]) / 2];
      const pitch = Math.atan2(b[1] - a[1], len);
      for (const sg of [-1, 1]) {
        const ox = Math.cos(ang) * gauge * 0.5 * sg, oz = -Math.sin(ang) * gauge * 0.5 * sg;
        this.m.place(steel, box(), [mid[0] + ox, mid[1], mid[2] + oz],
          [-pitch * Math.cos(ang), ang, 0], [0.075, 0.11, len], this.ao(mid[0], mid[1], mid[2]));
      }
    }
  }

  /** A minecart, upright or tipped on its side. */
  minecart(x, y, z, s = {}) {
    const steel = M.corrodedSteel(0x6b4a30);
    const wood = M.pitTimber();
    const rot = s.rot || 0;
    const tip = s.tipped ? 1.25 : 0;
    const t = this.ao(x, y + 0.5, z);
    const cy = y + (s.tipped ? 0.42 : 0.72);
    // hopper — four canted sides so it does not read as a crate
    const push = (dx, dz, sx, sz, tilt) => {
      const px = x + Math.cos(rot) * dx - Math.sin(rot) * dz;
      const pz = z + Math.sin(rot) * dx + Math.cos(rot) * dz;
      this.m.place(steel, box(), [px, cy, pz], [tilt * Math.cos(rot) + tip, rot, tilt * Math.sin(rot)],
        [sx, 0.72, sz], t);
    };
    if (!s.tipped) {
      push(0, 0.52, 1.16, 0.06, -0.16);
      push(0, -0.52, 1.16, 0.06, 0.16);
      push(0.6, 0, 0.06, 1.1, 0);
      push(-0.6, 0, 0.06, 1.1, 0);
      this.m.place(steel, box(), [x, y + 0.38, z], [0, rot, 0], [1.2, 0.06, 1.02], t);
      this.m.place(wood, box(), [x, y + 0.30, z], [0, rot, 0], [1.35, 0.13, 1.15], t);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          this.m.place(steel, cyl(9),
            [x + Math.cos(rot) * 0.44 * sx - Math.sin(rot) * 0.42 * sz, y + 0.16, z + Math.sin(rot) * 0.44 * sx + Math.cos(rot) * 0.42 * sz],
            [0, rot, Math.PI / 2], [0.30, 0.09, 0.30], t);
        }
      }
      if (s.ore) this.oreHeap(x, y + 0.75, z, { radius: 0.5, count: 8, scale: 0.8 });
    } else {
      this.m.place(steel, box(), [x, y + 0.55, z], [tip, rot, 0], [1.3, 1.0, 1.15], t);
      this.m.place(steel, cyl(9), [x + 0.7, y + 0.9, z], [0, rot, Math.PI / 2], [0.32, 0.09, 0.32], t);
      this.oreHeap(x + Math.cos(rot) * 1.2, y, z + Math.sin(rot) * 1.2, { radius: 1.1, count: 12 });
    }
  }

  /** Spoil heap of broken ore. */
  oreHeap(x, y, z, s = {}) {
    const mat = s.mat || M.oreSeam();
    const n = s.count || 14;
    const r = s.radius || 1.4;
    for (let i = 0; i < n; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const d = Math.sqrt(this.rng.next()) * r;
      const sz = (0.13 + this.rng.next() * 0.3) * (s.scale || 1);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const py = y + sz * 0.4 + (1 - d / r) * 0.28 * (s.scale || 1);
      this.m.place(mat, box(), [px, py, pz],
        [this.rng.range(-1, 1), this.rng.range(0, 3.1), this.rng.range(-1, 1)],
        [sz * 1.3, sz, sz * 1.1], this.ao(px, py, pz) * 0.95);
    }
  }

  /** An exposed seam of ore in a wall, faceted so a lamp glints off it. */
  oreVein(x, y, z, s = {}) {
    const mat = M.oreSeam();
    const rot = s.rot || 0;
    const n = s.count || 10;
    for (let i = 0; i < n; i++) {
      const o = (i / n - 0.5) * (s.len || 4);
      const px = x + Math.cos(rot) * o, pz = z - Math.sin(rot) * o;
      const py = y + Math.sin(i * 1.7) * 0.5;
      this.m.place(mat, box(), [px, py, pz],
        [this.rng.range(-0.4, 0.4), rot, this.rng.range(-0.5, 0.5)],
        [0.5 + this.rng.next() * 0.6, 0.22 + this.rng.next() * 0.3, 0.18],
        this.ao(px, py, pz));
    }
  }

  /** Hanging oil lantern — the mine's warm, swinging key light. */
  lantern(x, y, z, s = {}) {
    const steel = M.corrodedSteel(0x4a3c2e);
    const flame = M.emissiveMaterial(0xffa246, 2.2);
    const drop = s.drop || 0.9;
    const t = this.ao(x, y, z);
    this.m.place(steel, cyl(4), [x, y + drop * 0.5, z], [0, 0, 0], [0.02, drop, 0.02], t);
    this.m.place(steel, cyl(8), [x, y - 0.02, z], [0, 0, 0], [0.22, 0.1, 0.22], t);
    this.m.place(flame, sph(8), [x, y - 0.20, z], [0, 0, 0], [0.19, 0.26, 0.19]);
    this.m.place(steel, cyl(8), [x, y - 0.38, z], [0, 0, 0], [0.20, 0.08, 0.20], t);
    this.rig.add({
      pos: [x, y - 0.22, z], color: s.color || 0xffa246,
      intensity: s.intensity || 6.5, range: s.range || 13,
      flicker: 0.16, glow: 1.15, glowSize: 1.5,
    });
  }

  /** Timber ladder against a face. */
  ladder(x, y, z, s = {}) {
    const w = M.pitTimber();
    const h = s.height || 4;
    const rot = s.rot || 0;
    const t = this.ao(x, y + h * 0.5, z);
    for (const sg of [-1, 1]) {
      this.m.place(w, box(), [x + Math.cos(rot) * 0.28 * sg, y + h * 0.5, z - Math.sin(rot) * 0.28 * sg],
        [0, rot, 0], [0.09, h, 0.07], t);
    }
    const rungs = Math.floor(h / 0.34);
    for (let i = 1; i < rungs; i++) {
      this.m.place(w, box(), [x, y + i * 0.34, z], [0, rot, 0], [0.62, 0.05, 0.05], t);
    }
  }

  /** The lift cage and its headgear at the top of a shaft. */
  liftCage(x, y, z, s = {}) {
    const steel = M.corrodedSteel(0x554438);
    const wood = M.pitTimber();
    const w = s.w || 3.2, d = s.d || 3.2, h = s.h || 2.8;
    const g = new THREE.Group();
    const sub = new (this.m.constructor)();
    sub.place(wood, box(), [0, 0.09, 0], [0, 0, 0], [w, 0.18, d], 0.9);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        sub.place(steel, box(), [sx * w * 0.47, h * 0.5, sz * d * 0.47], [0, 0, 0], [0.13, h, 0.13], 0.85);
      }
    }
    for (const sz of [-1, 1]) {
      sub.place(steel, box(), [0, h, sz * d * 0.47], [0, 0, 0], [w, 0.12, 0.12], 0.85);
      for (let i = -1; i <= 1; i++) {
        sub.place(steel, box(), [i * w * 0.3, h * 0.5, sz * d * 0.47], [0, 0, 0], [0.07, h, 0.07], 0.8);
      }
    }
    sub.place(steel, cyl(6), [0, h + 3.0, 0], [0, 0, 0], [0.05, 6.0, 0.05], 0.8);
    sub.build(g, 'lift');
    g.position.set(x, y, z);
    this.group.add(g);
    this.animated.push({ kind: 'lift', obj: g, y0: y, y1: s.y1 != null ? s.y1 : y, speed: s.speed || 0 });
    this.rig.add({ pos: [x, y + h - 0.2, z], color: 0xffb46a, intensity: 4.5, range: 11, flicker: 0.12, glow: 0.9, glowSize: 1.3 });
    this.m.place(M.emissiveMaterial(0xffb46a, 1.6), sph(6), [x, y + h - 0.2, z], [0, 0, 0], [0.16, 0.2, 0.16]);
    return g;
  }

  /** Steel catwalk with a handrail, spanning a drop. */
  catwalk(x, y, z, s = {}) {
    const steel = M.corrodedSteel(0x4f4238);
    const rot = s.rot || 0, len = s.len || 8, w = s.w || 1.5;
    const t = this.ao(x, y, z);
    this.m.place(steel, box(), [x, y, z], [0, rot, 0], [w, 0.10, len], t);
    for (const sg of [-1, 1]) {
      const ox = Math.cos(rot) * w * 0.5 * sg, oz = -Math.sin(rot) * w * 0.5 * sg;
      this.m.place(steel, box(), [x + ox, y + 0.95, z + oz], [0, rot, 0], [0.06, 0.06, len], t);
      const posts = Math.max(2, Math.round(len / 1.6));
      for (let i = 0; i <= posts; i++) {
        const o = (i / posts - 0.5) * len;
        this.m.place(steel, box(), [x + ox - Math.sin(rot) * o, y + 0.5, z + oz - Math.cos(rot) * o],
          [0, rot, 0], [0.06, 1.0, 0.06], t);
      }
    }
  }

  /* ---------------------------------------------------------------- Fociaugh */

  /** A stalactite hanging from the roof (or a stalagmite, flipped). */
  dripSpike(x, y, z, s = {}) {
    const mat = M.dripstone();
    const len = s.len || 1.6;
    const r = s.r || 0.24;
    const up = s.up ? 1 : -1;
    const segs = 3;
    let py = y, pr = r;
    for (let i = 0; i < segs; i++) {
      const l = (len / segs) * (1 + i * 0.15);
      const nr = pr * (0.60 - i * 0.05);
      const g = geo(`taper${(nr / pr).toFixed(2)}`, () => new THREE.CylinderGeometry(0.5 * (nr / pr), 0.5, 1, 8));
      // the taper always points away from the rock it grew out of
      const lean = (s.lean != null ? s.lean : 0.16) * (i + 1);
      const la = s.leanA != null ? s.leanA : this.rng.range(0, 6.28);
      this.m.place(mat, g,
        [x + Math.cos(la) * lean * 0.35 * l, py + up * l * 0.5, z + Math.sin(la) * lean * 0.35 * l],
        [(up > 0 ? 0 : Math.PI) + Math.sin(la) * lean * 0.5, this.rng.range(0, 3), -Math.cos(la) * lean * 0.5],
        [pr * 2 * this.rng.range(0.85, 1.2), l, pr * 2 * this.rng.range(0.85, 1.2)],
        this.ao(x, py, z));
      py += up * l;
      pr = nr;
    }
    this.m.place(mat, cone(7), [x, py + up * pr * 2.2, z], [up > 0 ? 0 : Math.PI, 0, 0],
      [pr * 2, pr * 4.4, pr * 2], this.ao(x, py, z));
  }

  /** A field of spikes across a ceiling or floor patch. */
  dripField(x, y, z, s = {}) {
    const n = s.count || 14;
    const r = s.radius || 4;
    for (let i = 0; i < n; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const d = Math.sqrt(this.rng.next()) * r;
      this.dripSpike(x + Math.cos(a) * d, y, z + Math.sin(a) * d, {
        len: (s.len || 1.6) * this.rng.range(0.5, 1.5),
        r: (s.r || 0.22) * this.rng.range(0.6, 1.4),
        up: s.up,
      });
    }
  }

  /** A flowstone column joining floor to roof. */
  column(x, y, z, s = {}) {
    const mat = M.dripstone();
    const h = s.h || 6;
    const r = s.r || 0.55;
    const segs = 9;
    // stacked truncated cones with a waist: a column is two cones that met in
    // the middle over a few thousand years, not a length of pipe
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const prof = (t) => 0.42 + 0.72 * Math.abs(Math.cos(t * Math.PI))
        + 0.26 * (this.n.fbm2(x * 0.5 + t * 5, z * 0.5, 3) * 0.5 + 0.5);
      const r0 = r * prof(t0), r1 = r * prof(t1);
      const g = geo(`taper${(r1 / r0).toFixed(2)}`, () => new THREE.CylinderGeometry(0.5 * (r1 / r0), 0.5, 1, 9));
      const wob = 0.10;
      this.m.place(mat, g,
        [x + Math.sin(t0 * 6 + x) * wob, y + h * (t0 + t1) * 0.5, z + Math.cos(t0 * 5 + z) * wob],
        [0, t0 * 3, 0], [r0 * 2, h / segs * 1.04, r0 * 2],
        this.ao(x, y + h * t0, z));
    }
  }

  /**
   * Bioluminescent fungus. The cave's only real light: cold, blue-green, and
   * clustered where water runs.
   */
  fungus(x, y, z, s = {}) {
    const cap = M.emissiveMaterial(s.color || 0x63ffd0, s.emissive || 1.05);
    const stem = M.emissiveMaterial(0x1b3a34, 0.5);
    const n = s.count || 7;
    const spread = s.spread || 0.7;
    for (let i = 0; i < n; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const d = Math.sqrt(this.rng.next()) * spread;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const hh = (0.12 + this.rng.next() * 0.30) * (s.scale || 1);
      const rr = (0.07 + this.rng.next() * 0.11) * (s.scale || 1);
      const up = s.up ? -1 : 1;
      this.m.place(stem, cyl(5), [px, y + up * hh * 0.5, pz], [0, 0, this.rng.range(-0.2, 0.2)], [rr * 0.4, hh, rr * 0.4]);
      const squash = 0.62 + this.rng.next() * 0.75;
      this.m.place(cap, sph(7), [px, y + up * hh, pz],
        [this.rng.range(-0.3, 0.3), 0, this.rng.range(-0.3, 0.3)],
        [rr * 1.55, rr * 1.55 * squash, rr * 1.55]);
    }
    this.rig.add({
      pos: [x, y + (s.up ? -0.3 : 0.3), z], color: s.color || 0x63ffd0,
      intensity: s.intensity || 2.6, range: s.range || 8,
      flicker: 0.05, glow: s.glow != null ? s.glow : 1.25, glowSize: (s.scale || 1) * 2.2,
    });
  }

  /** Still water: a dark mirror that doubles every light above it. */
  pool(x, y, z, s = {}) {
    const g = new THREE.Mesh(plane(), M.poolMaterial(s.tint || 0x08151a));
    g.rotation.x = -Math.PI / 2;
    g.scale.set(s.w || 6, s.d || 6, 1);
    g.position.set(x, y + (s.depth || 0.06), z);
    g.receiveShadow = false;
    g.castShadow = false;
    g.name = 'pool';
    this.group.add(g);
    // wet rim
    this.rubble(x, y, z, { count: 10, radius: (s.w || 6) * 0.62, scale: 0.8, mat: M.caveSilt() });
    return g;
  }

  /** A rounded boulder or breakdown block. */
  boulder(x, y, z, s = {}) {
    const mat = s.mat || M.wetLimestone();
    const r = s.r || 1.0;
    this.m.place(mat, sph(9), [x, y + r * 0.55, z],
      [this.rng.range(0, 3), this.rng.range(0, 3), this.rng.range(0, 3)],
      [r * 2, r * 1.4, r * 1.7], this.ao(x, y + r, z) * 0.95);
    for (let i = 0; i < 3; i++) {
      const a = this.rng.next() * 6.28;
      this.m.place(mat, sph(7), [x + Math.cos(a) * r * 0.8, y + r * 0.3, z + Math.sin(a) * r * 0.8],
        [this.rng.range(0, 3), this.rng.range(0, 3), 0], [r * 0.7, r * 0.5, r * 0.6],
        this.ao(x, y + r * 0.3, z) * 0.9);
    }
  }

  /* ------------------------------------------------------------------ shared */

  /**
   * A treasure chest. The lid is a separate object so it can swing open when
   * the party takes what is inside.
   * @returns {object} interactable descriptor
   */
  chest(spec) {
    const [x, z] = spec.at;
    const y = spec.y != null ? spec.y : (this.L.floorAt(x, z) || 0);
    const rot = spec.rot || 0;
    const scale = spec.big ? 1.35 : 1;
    const wood = spec.magitek ? M.magitekPlate() : M.pitTimber();
    const iron = M.corrodedSteel(spec.magitek ? 0x2c3038 : 0x6a4a30);
    const t = this.ao(x, y + 0.4, z);
    const w = 1.15 * scale, d = 0.72 * scale, h = 0.56 * scale;

    this.m.place(wood, box(), [x, y + h * 0.5, z], [0, rot, 0], [w, h, d], t);
    for (const sg of [-1, 1]) {
      this.m.place(iron, box(), [x + Math.cos(rot) * w * 0.36 * sg, y + h * 0.5, z - Math.sin(rot) * w * 0.36 * sg],
        [0, rot, 0], [0.09, h * 1.06, d * 1.03], t);
    }
    this.m.place(iron, box(), [x + Math.sin(rot) * d * 0.52, y + h * 0.62, z + Math.cos(rot) * d * 0.52],
      [0, rot, 0], [0.24, 0.2, 0.06], t);

    // lid
    const lid = new THREE.Group();
    const sub = new (this.m.constructor)();
    sub.place(wood, box(), [0, 0.09 * scale, -d * 0.5], [0, 0, 0], [w, 0.18 * scale, d], t);
    for (const sg of [-1, 1]) {
      sub.place(iron, box(), [w * 0.36 * sg, 0.10 * scale, -d * 0.5], [0, 0, 0], [0.09, 0.21 * scale, d * 1.03], t);
    }
    sub.build(lid, 'chestlid');
    lid.position.set(x - Math.sin(rot) * d * 0.5 * -1, y + h, z - Math.cos(rot) * d * 0.5 * -1);
    lid.rotation.y = rot;
    this.group.add(lid);

    const item = {
      kind: 'chest', id: spec.id, name: spec.name || 'Chest',
      pos: new THREE.Vector3(x, y + 0.5, z),
      radius: 2.4, verb: 'Open', lid, spec, opened: false,
      glowEmitter: this.rig.add({
        pos: [x, y + h + 0.1, z], color: spec.magitek ? 0x63d0ff : 0xffd08a,
        intensity: 1.1, range: 4.5, flicker: 0.07, glow: 0.5, glowSize: 0.7,
      }),
    };
    this.interactables.push(item);
    this.animated.push({ kind: 'chest', item });
    return item;
  }

  /**
   * A door across a passage. Locked doors need a dungeon key; the leaf slides
   * up into the header when it opens.
   * @returns {object} interactable descriptor
   */
  door(spec) {
    const [x, z] = spec.at;
    const y = spec.y != null ? spec.y : (this.L.floorAt(x, z) || 0);
    const w = spec.w, h = spec.h;
    const rot = spec.facing === 'x' ? Math.PI / 2 : 0;
    const steel = spec.kind === 'magitek' ? M.magitekPlate() : M.corrodedSteel(0x54402e);
    const t = this.ao(x, y + h * 0.5, z);
    // frame
    for (const sg of [-1, 1]) {
      this.m.place(steel, box(), [x + Math.cos(rot) * (w * 0.5 + 0.16) * sg, y + h * 0.5, z - Math.sin(rot) * (w * 0.5 + 0.16) * sg],
        [0, rot, 0], [0.32, h + 0.3, 0.5], t);
    }
    this.m.place(steel, box(), [x, y + h + 0.16, z], [0, rot, 0], [w + 0.9, 0.34, 0.55], t);

    const leaf = new THREE.Group();
    const sub = new (this.m.constructor)();
    sub.place(steel, box(), [0, 0, 0], [0, 0, 0], [w, h, 0.22], t);
    for (let i = -1; i <= 1; i++) {
      sub.place(M.corrodedSteel(0x3a3630), box(), [i * w * 0.3, 0, 0.14], [0, 0, 0], [0.14, h * 0.9, 0.08], t);
    }
    const lampColor = spec.key ? 0xff4a3a : 0x63ffb0;
    sub.place(M.emissiveMaterial(lampColor, 1.5), box(), [0, h * 0.28, 0.15], [0, 0, 0], [0.3, 0.09, 0.05]);
    sub.build(leaf, 'doorleaf');
    leaf.position.set(x, y + h * 0.5, z);
    leaf.rotation.y = rot;
    this.group.add(leaf);

    this.rig.add({ pos: [x, y + h * 0.78, z], color: lampColor, intensity: 1.6, range: 5, flicker: 0.05, glow: 0.6, glowSize: 0.6 });

    const item = {
      kind: 'door', id: spec.id, name: spec.name,
      pos: new THREE.Vector3(x, y + 1.2, z),
      radius: 3.0, verb: spec.key ? 'Unlock' : 'Open',
      leaf, spec, y0: y + h * 0.5, h, open: !!spec.open, t: spec.open ? 1 : 0,
    };
    if (spec.open) leaf.position.y = item.y0 + h * 0.98;
    this.interactables.push(item);
    this.animated.push({ kind: 'door', item });
    return item;
  }

  /** Advance chest lids, door leaves and lifts. */
  update(dt, now) {
    for (const a of this.animated) {
      if (a.kind === 'chest') {
        const it = a.item;
        const target = it.opened ? 1 : 0;
        it.t = (it.t || 0) + (target - (it.t || 0)) * Math.min(1, dt * 5);
        it.lid.rotation.x = -it.t * 1.9;
        if (it.glowEmitter) it.glowEmitter.intensity = 1.1 * (1 - it.t * 0.85);
      } else if (a.kind === 'door') {
        const it = a.item;
        const target = it.open ? 1 : 0;
        it.t = (it.t || 0) + (target - (it.t || 0)) * Math.min(1, dt * 2.2);
        it.leaf.position.y = it.y0 + it.t * it.h * 0.98;
      } else if (a.kind === 'lift' && a.speed) {
        const t = 0.5 - 0.5 * Math.cos(now * a.speed);
        a.obj.position.y = a.y0 + (a.y1 - a.y0) * t;
      }
    }
  }
}

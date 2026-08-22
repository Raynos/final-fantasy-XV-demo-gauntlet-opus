import * as THREE from 'three';
import { Rng } from '../../../util/Rng.ts';
import { InteriorMerger } from './Build.ts';
import * as M from './InteriorMaterials.ts';
import type { LightRig } from './LightRig.ts';
import type { Terrain } from '../../Terrain.ts';

/**
 * Entrances, and the transition through them.
 *
 * Each dungeon owns a piece of *exterior* architecture that announces it from
 * a distance — a concrete headwall cut into a slope, a mine's headframe against
 * the sky, a black cave mouth under an overhang — and a matching interior
 * vestibule with daylight coming the other way through the same opening. The
 * cut between the two is a short fade, not a hard jump.
 *
 * The exterior pieces are cheap and permanent (they are part of the world);
 * the interiors are streamed in on entry.
 */

/* ------------------------------------------------------------------ exterior */

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 9);
const SPH = new THREE.SphereGeometry(0.5, 10, 7);
const CONE = new THREE.ConeGeometry(0.5, 1, 8);

/**
 * A frame for placing an entrance on the terrain.
 *
 * `P` is *door space*: heights are measured from the doorway sill, which is
 * what a built structure wants. `G` is *ground space*: heights are measured
 * from the terrain directly under the point, which is what every piece of
 * scatter wants — spoil, sandbags and boulders laid out in door space float
 * off a slope, and a Leide slope moves twenty metres in thirty.
 */
function frame(terrain: any, x: number, z: number, heading: number) {
  const y = terrain.heightAt(x, z);
  const c = Math.cos(heading), s = Math.sin(heading);
  const w = (r: number, f: number) => [x + c * r + s * f, z - s * r + c * f];
  return {
    y,
    P: (r: number, f: number, u: number) => { const p = w(r, f); return [p[0], y + u, p[1]]; },
    G: (r: number, f: number, u: number) => { const p = w(r, f); return [p[0], terrain.heightAt(p[0], p[1]) + u, p[1]]; },
    ground: (r: number, f: number) => { const p = w(r, f); return terrain.heightAt(p[0], p[1]); },
  };
}

/**
 * A natural rock mass grown out of the terrain: overlapping displaced spheres
 * whose bases are pinned to the ground under each one. A single big box reads
 * as a crate dropped on the landscape from orbit; this reads as an outcrop.
 */
function mound(mg: InteriorMerger, mat: THREE.Material, F: any, rng: Rng, { r = 0, f = 0, radius = 9, height = 8, blobs = 14, tint = 0.9 }) {
  for (let i = 0; i < blobs; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.pow(rng.next(), 0.6) * radius;
    const rr = r + Math.cos(a) * d, ff = f + Math.sin(a) * d;
    // taller in the middle, shouldered at the edge
    const t = 1 - d / Math.max(radius, 0.01);
    const h = height * (0.34 + 0.66 * t) * rng.range(0.7, 1.15);
    const w = radius * rng.range(0.30, 0.55) * (0.6 + 0.5 * t);
    mg.place(mat, SPH, F.G(rr, ff, h * 0.28), [rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)],
      [w * 2, h, w * 1.7], tint * rng.range(0.88, 1.0));
  }
}

/**
 * Keycatrich: an imperial blockhouse driven into a spoil berm, with a cut
 * trench approach, a blast door and a great deal of rusted steel.
 */
export function buildBunkerEntrance(terrain: Terrain | null, x: number, z: number, heading = 0, seed = 11): {group:THREE.Object3D, stats:any, doorway:THREE.Vector3, lamp?: any } {
  const g = new THREE.Group();
  g.name = 'keycatrich-entrance';
  const mg = new InteriorMerger();
  const rng = new Rng(seed);
  const conc = M.trenchConcrete();
  const steel = M.corrodedSteel(0x5a4638);
  const plate = M.magitekPlate();
  const rock = M.mineRock();
  const F = frame(terrain, x, z, heading);
  const y = F.y;

  // the berm the blockhouse is driven into: two flanking spoil banks
  for (const sg of [-1, 1]) {
    mound(mg, rock, F, rng, { r: sg * 9.5, f: 3.0, radius: 7.5, height: 7.5, blobs: 9, tint: 0.85 });
  }
  mound(mg, rock, F, rng, { r: 0, f: 10.5, radius: 9.0, height: 8.5, blobs: 10, tint: 0.85 });

  // Approach cut: two retaining walls flanking a ramp down to the door. These
  // are *built*, so they stay in door space and are deliberately over-tall —
  // where the ground rises past them they bury themselves, which is exactly
  // what a cut into a slope looks like.
  for (const sg of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const f = -2 - i * 2.6;
      mg.place(conc, BOX, F.P(sg * 3.05, f, -0.6), [0, heading, 0], [0.5, 5.6, 2.7], 0.80 - i * 0.03);
    }
  }
  // the headwall
  mg.place(conc, BOX, F.P(0, 0.6, 2.2), [0, heading, 0], [9.5, 5.4, 3.2], 0.92);
  mg.place(conc, BOX, F.P(0, -1.6, 3.6), [0, heading, 0], [11.0, 1.3, 2.0], 0.86);
  // recessed doorway
  mg.place(steel, BOX, F.P(0, -1.0, 1.55), [0, heading, 0], [4.2, 3.4, 0.5], 0.7);
  mg.place(plate, BOX, F.P(0, -1.22, 1.5), [0, heading, 0], [3.3, 2.9, 0.28], 0.62);
  mg.place(M.voidMaterial(), BOX, F.P(0, -0.4, 1.5), [0, heading, 0], [2.9, 2.7, 0.2], 0.02);
  for (const sg of [-1, 1]) {
    mg.place(steel, BOX, F.P(sg * 1.95, -1.1, 1.6), [0, heading, 0], [0.36, 3.6, 0.7], 0.8);
  }
  mg.place(steel, BOX, F.P(0, -1.1, 3.45), [0, heading, 0], [4.9, 0.42, 0.8], 0.85);

  // vent stacks and an aerial on the roof
  for (let i = 0; i < 3; i++) {
    mg.place(steel, CYL, F.P((i - 1) * 2.6 + rng.range(-0.3, 0.3), 1.4, 4.6), [0, 0, 0], [0.55, 1.8, 0.55], 0.9);
  }
  mg.place(steel, CYL, F.P(3.6, 1.0, 6.6), [0, 0, 0], [0.09, 6.0, 0.09], 0.9);

  // sandbags and wrecked barrier on the approach, laid on the actual ground
  for (let i = 0; i < 14; i++) {
    mg.place(M.trenchFloor(), SPH, F.G(rng.range(-3.2, 3.2), rng.range(-11, -4), 0.16),
      [0, rng.range(0, 3), 0], [0.62, 0.3, 0.42], 0.9);
  }
  for (let i = 0; i < 10; i++) {
    mg.place(conc, BOX, F.G(rng.range(-6, 6), rng.range(-13, -6), 0.22),
      [rng.range(-0.4, 0.4), rng.range(0, 3), rng.range(-0.4, 0.4)],
      [rng.range(0.5, 1.4), rng.range(0.3, 0.7), rng.range(0.5, 1.2)], 0.86);
  }
  const stats = mg.build(g, 'keycatrich-ext');

  // a live emergency lamp over the door, visible from the road at night
  const lamp = new THREE.PointLight(0xffc07a, 130, 18, 2);
  const lp = F.P(0, -0.4, 3.3);
  lamp.position.set(lp[0], lp[1], lp[2]);
  g.add(lamp);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.2), M.emissiveMaterial(0xffc07a, 5));
  bulb.position.copy(lamp.position);
  bulb.rotation.y = heading;
  g.add(bulb);

  const door = F.P(0, -1.4, 0);
  return { group: g, stats, doorway: new THREE.Vector3(door[0], y, door[2]), lamp };
}

/**
 * Balouve: an adit driven into an outcrop under a timber-and-steel headframe,
 * with the rail running out of the portal to a spoil tip.
 */
export function buildMineHead(terrain: any, x: number, z: number, heading = 0, seed = 22) {
  const g = new THREE.Group();
  g.name = 'balouve-entrance';
  const mg = new InteriorMerger();
  const rng = new Rng(seed);
  const timber = M.pitTimber();
  const steel = M.corrodedSteel(0x6a4a30);
  const rock = M.mineRock();
  const rail = M.railSteel();
  const F = frame(terrain, x, z, heading);
  const y = F.y;

  // the outcrop the adit is driven into — grown from the ground, never a box
  mound(mg, rock, F, rng, { r: 0, f: 9.0, radius: 11.0, height: 12.0, blobs: 18, tint: 0.9 });
  for (const sg of [-1, 1]) {
    mound(mg, rock, F, rng, { r: sg * 7.0, f: 2.6, radius: 4.6, height: 6.5, blobs: 6, tint: 0.88 });
  }

  // portal set: two heavy legs, a cap, and lagging over the mouth
  for (const sg of [-1, 1]) {
    mg.place(timber, BOX, F.P(sg * 2.4, 0.4, 1.8), [0, heading, 0], [0.5, 3.6, 0.55], 0.85);
    mg.place(timber, BOX, F.P(sg * 2.9, 1.4, 1.8), [0, heading, 0.35 * sg], [0.34, 2.6, 0.4], 0.8);
  }
  mg.place(timber, BOX, F.P(0, 0.4, 3.5), [0, heading, 0], [6.2, 0.6, 0.7], 0.85);
  for (let i = -3; i <= 3; i++) {
    mg.place(timber, BOX, F.P(i * 0.8, 0.9, 3.95), [0, heading, 0], [0.62, 0.7, 1.5], 0.8);
  }
  // the dark of the adit
  mg.place(M.voidMaterial(), BOX, F.P(0, 1.6, 1.6), [0, heading, 0], [4.4, 3.2, 0.2], 0.05);

  // headframe over the shaft, off to one side and standing on real ground
  const hf = 8.5;
  const base = F.ground(6.5, -3);
  const lift = base - y;
  for (const sr of [-1, 1]) {
    for (const sf of [-1, 1]) {
      mg.place(steel, BOX, F.P(6.5 + sr * 1.7, -3 + sf * 1.7, lift + hf * 0.5),
        [sf * 0.11, heading, -sr * 0.11], [0.30, hf, 0.30], 0.88);
    }
  }
  for (let i = 1; i <= 3; i++) {
    const u = lift + (i / 4) * hf;
    for (const sf of [-1, 1]) mg.place(steel, BOX, F.P(6.5, -3 + sf * 1.7, u), [0, heading, 0], [3.6, 0.16, 0.16], 0.85);
    for (const sr of [-1, 1]) mg.place(steel, BOX, F.P(6.5 + sr * 1.7, -3, u), [0, heading, 0], [0.16, 0.16, 3.6], 0.85);
  }
  const wheel = new THREE.TorusGeometry(1.5, 0.14, 6, 18);
  mg.place(steel, wheel, F.P(6.5, -3, lift + hf + 0.7), [0, heading + Math.PI / 2, 0], [1, 1, 1], 0.9);
  for (let i = 0; i < 6; i++) {
    mg.place(steel, CYL, F.P(6.5, -3, lift + hf + 0.7), [0, heading + Math.PI / 2, (i / 6) * Math.PI], [0.08, 3.0, 0.08], 0.9);
  }
  mg.place(steel, CYL, F.P(3.0, -3, lift + hf * 0.5 + 2.2), [0, heading, Math.PI * 0.30], [0.05, 10.5, 0.05], 0.9);

  // rail out of the portal and a spoil tip, both following the ground
  for (let i = 0; i < 18; i++) {
    mg.place(timber, BOX, F.G(0, 1.2 - i * 0.95, 0.07), [0, heading, 0], [1.7, 0.14, 0.24], 0.9);
  }
  for (const sg of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      mg.place(rail, BOX, F.G(sg * 0.44, 0.8 - i * 1.9, 0.20), [0, heading, 0], [0.09, 0.14, 1.95], 0.92);
    }
  }
  for (let i = 0; i < 34; i++) {
    mg.place(rock, BOX, F.G(rng.range(-6, 6), rng.range(-19, -11), rng.range(0.1, 1.0)),
      [rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)],
      [rng.range(0.4, 1.5), rng.range(0.3, 1.0), rng.range(0.4, 1.3)], 0.85);
  }

  const stats = mg.build(g, 'balouve-ext');
  const door = F.P(0, 0.4, 0);
  return { group: g, stats, doorway: new THREE.Vector3(door[0], y, door[2]) };
}

/**
 * Fociaugh: a collapse-dolined cave mouth under a limestone overhang, ringed by
 * breakdown blocks. No architecture at all — the world just opens.
 */
export function buildCaveMouth(terrain: any, x: number, z: number, heading = 0, seed = 33) {
  const g = new THREE.Group();
  g.name = 'fociaugh-entrance';
  const mg = new InteriorMerger();
  const rng = new Rng(seed);
  const rock = M.wetLimestone();
  const drip = M.dripstone();
  const F = frame(terrain, x, z, heading);
  const y = F.y;

  // the limestone knoll the mouth is cut into
  mound(mg, rock, F, rng, { r: 0, f: 12.0, radius: 14.0, height: 13.0, blobs: 22, tint: 0.92 });
  for (const sg of [-1, 1]) {
    mound(mg, rock, F, rng, { r: sg * 8.0, f: 3.0, radius: 5.0, height: 8.0, blobs: 8, tint: 0.9 });
  }
  // overhanging brow over the throat
  mg.place(rock, SPH, F.P(0, 3.2, 5.2), [0.18, heading, 0], [12, 4.0, 8], 0.88);
  for (const sg of [-1, 1]) {
    mg.place(rock, SPH, F.P(sg * 3.7, 0.8, 2.1), [0, 0, sg * 0.3], [3.6, 5.0, 4.2], 0.82);
  }
  mg.place(M.voidMaterial(), BOX, F.P(0, 2.4, 1.9), [0, heading, 0], [5.4, 4.2, 0.2], 0.02);

  // stalactites over the entrance, breakdown blocks below it
  for (let i = 0; i < 9; i++) {
    const len = rng.range(0.6, 2.0);
    mg.place(drip, CONE, F.P(rng.range(-2.6, 2.6), 1.6, 4.6 - len * 0.5),
      [Math.PI, rng.range(0, 3), 0], [rng.range(0.2, 0.5), len, rng.range(0.2, 0.5)], 0.7);
  }
  for (let i = 0; i < 20; i++) {
    mg.place(rock, SPH, F.G(rng.range(-9, 9), rng.range(-12, -1), rng.range(0.15, 0.75)),
      [rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)],
      [rng.range(0.8, 2.6), rng.range(0.6, 1.6), rng.range(0.8, 2.2)], 0.9);
  }

  const stats = mg.build(g, 'fociaugh-ext');
  const door = F.P(0, 0.5, 0);
  return { group: g, stats, doorway: new THREE.Vector3(door[0], y, door[2]) };
}

/* ------------------------------------------------------------------ interior */

/**
 * The inside face of an entrance: daylight coming down the passage you came in
 * by. A flat emissive card plus a hard, cold light — the one place in a dungeon
 * that is allowed to be bright, and the reason the rest reads as dark.
 *
 */
export function buildExitVestibule(parent: THREE.Group, rig: LightRig, { x, y, z, facing = 0, w = 3.2, h = 3.2, color = 0xbcd8ff, intensity = 260 }: any): {group:THREE.Group, light:THREE.PointLight, card:THREE.Mesh, halo?: any } {
  const group = new THREE.Group();
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.80, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: true,
    })
  );
  card.position.set(x, y + h * 0.5, z);
  card.rotation.y = facing;
  card.renderOrder = 2;
  group.add(card);

  // a soft bloom halo around the opening so it blows out like a real exit
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 2.3, h * 2.1),
    new THREE.MeshBasicMaterial({
      map: M.glowSprite(128, 1.7), color, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.34,
    })
  );
  halo.position.set(x, y + h * 0.5, z);
  halo.rotation.y = facing;
  halo.renderOrder = 3;
  group.add(halo);

  const light = new THREE.PointLight(color, intensity, 30, 2);
  light.position.set(x - Math.sin(facing) * 1.6, y + h * 0.55, z - Math.cos(facing) * 1.6);
  group.add(light);
  parent.add(group);
  rig.add({ pos: [light.position.x, light.position.y, light.position.z], color, intensity: 0, range: 20, glow: 0 });
  return { group, light, card, halo };
}

/**
 * A short black fade over the whole screen. Owned here rather than borrowed
 * from the UI so a dungeon transition never depends on another system existing.
 */
export class Fader {
  _onBlack!: any;
  el!: HTMLDivElement;
  speed!: number;
  target!: number;
  value!: number;
  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute', 'inset:0', 'background:#000', 'opacity:0',
      'pointer-events:none', 'z-index:40', 'transition:none',
    ].join(';');
    if (root) root.appendChild(this.el);
    this.value = 0;
    this.target = 0;
    this.speed = 3.4;
    this._onBlack = null;
  }

  /** @param atBlack run once the screen is fully covered */
  toBlack(atBlack: ()=>void) { this.target = 1; this._onBlack = atBlack || null; }
  toClear() { this.target = 0; }

  update(dt: number) {
    const d = this.target - this.value;
    if (Math.abs(d) < 0.001) {
      if (this.value >= 0.999 && this._onBlack) {
        const f = this._onBlack; this._onBlack = null; f();
      }
      return;
    }
    this.value += Math.sign(d) * Math.min(Math.abs(d), this.speed * dt);
    this.el.style.opacity = String(this.value);
    if (this.value >= 0.999 && this._onBlack) {
      const f = this._onBlack; this._onBlack = null; f();
    }
  }

  /** Snap, used by the deterministic capture harness. */
  set(v: number) { this.value = this.target = v; this.el.style.opacity = String(v); }
}

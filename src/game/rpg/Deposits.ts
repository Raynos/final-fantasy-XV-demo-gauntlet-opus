import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEPOSITS, ELEMENT_COLOR } from './Elemancy.ts';
import { Rng } from '../../util/Rng.ts';
import { srgb } from '../../util/TextureGen.ts';
import type { Deposit, MagicElement } from './Elemancy.ts';
import type { RpgSystem } from './RpgSystem.ts';
import type { Game } from '../Game.ts';
import type { InteractableHandle } from '../interaction/Interactables.ts';

/**
 * The twelve elemental deposits, as objects in the world.
 *
 * The Elemancy *model* has been complete for a long time — `Elemancy.draw`,
 * capacity, refill hours, the crafting maths and a whole `ElemancyScreen`. What
 * did not exist was **any of it in the world**: no geometry at the twelve
 * anchor points, and not one `Interaction.register` call. The only way to draw
 * was to stand within twelve metres of an invisible coordinate and press an
 * unlisted `T` (`CombatSystem.ts:1519`), which `docs/SCOPE.md:318` already
 * called out. A player looking for the deposit the world map has a pin for
 * found bare ground.
 *
 * Geometry first, prompt second — that order matters. `content-wire.md` ranked
 * a prompt with no visible subject as the second-worst defect a blind judge
 * found, because it reads as the game being broken rather than as a feature
 * being missing. So this builds the deposit, and the prompt hangs off the thing
 * you can see.
 *
 * Installed from `RpgSystem.update`'s first tick rather than from `init()`, for
 * exactly the reason `HavenCamp` is: `Interaction` boots six systems after
 * `Rpg`, so the handles cannot be taken during init.
 */

/** Beyond this many metres a deposit's meshes are switched off outright. */
const VISIBLE_M = 240;
/** Metres the "Draw" prompt appears within. */
const REACH_M = 6.5;
/** Seconds a deposit stays visibly spent after being drained. */
const SPENT_FADE = 1.2;

/** One built deposit: its meshes, its prompt and its live state. */
interface DepositNode {
  def: Deposit;
  group: THREE.Group;
  /** The emissive crystal material, pulsed in `update`. */
  mat: THREE.MeshStandardMaterial;
  handle: InteractableHandle | null;
  /** Base emissive intensity, so the pulse has something to modulate. */
  base: number;
  /** Phase offset so twelve deposits do not breathe in unison. */
  phase: number;
  /** 0..1, driven to 0 while depleted. */
  charge: number;
}

/**
 * A deterministic integer from a deposit id, so two runs build the same rock.
 * `Rng` wants a number and the ids are strings; djb2 is enough and is stable
 * across sessions, which a `Math.random` seed would not be.
 */
function seedOf(id: string) {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  return h % 100000;
}

/**
 * The crystal cluster for one deposit.
 *
 * Five-sided tapered shards leaning out of a common root, the way a real
 * crystal druse grows: nothing is axis-aligned, nothing is the same height, and
 * the tallest is off-centre. Scaled by `capacity`, so the 99-unit Ravatogh vent
 * is visibly a bigger find than the 32-unit Three Valleys fissure — the world
 * telling you what it is worth before you press anything.
 *
 * Every transform here has a positive determinant. A mirrored scale would flip
 * the winding, and `MeshStandardMaterial` is `FrontSide`: that is precisely the
 * bug that made the character head render as the inside of its own skull for
 * two months (`WS-1`, `d866db7`), and it is invisible until you look.
 */
function crystalCluster(rng: Rng, capacity: number): { shards: THREE.BufferGeometry, socket: THREE.BufferGeometry } {
  // 32 units -> 0.86, 99 units -> 1.30. A gentle curve: a triple-capacity
  // deposit should read as bigger, not as three times bigger.
  const scale = 0.55 + 0.55 * Math.sqrt(capacity / 60);
  const shards: THREE.BufferGeometry[] = [];
  const rubble: THREE.BufferGeometry[] = [];
  const n = 11 + Math.floor(rng.next() * 6);
  for (let i = 0; i < n; i++) {
    // The first shard is the hero: tallest, nearest the centre, most upright.
    const hero = i === 0;
    const h = (hero ? rng.range(1.7, 2.3) : rng.range(0.35, 1.5)) * scale;
    const r = (hero ? rng.range(0.10, 0.15) : rng.range(0.035, 0.11)) * scale;
    // `ConeGeometry` is indexed and `DodecahedronGeometry` is not, and
    // `mergeGeometries` returns **null** on a mixed list rather than throwing —
    // the trap `src/util/GeoAssert.ts:207` documents. Everything here is
    // de-indexed, which flat shading wants anyway.
    const g = new THREE.ConeGeometry(r, h, 5, 1, false).toNonIndexed();
    // A crystal is a prism with a point, not a smooth cone: flat-shade it so
    // the five faces catch the sun separately and the silhouette reads faceted.
    g.computeVertexNormals();
    const lean = hero ? rng.range(0, 0.14) : rng.range(0.10, 0.70);
    const az = rng.range(0, Math.PI * 2);
    const d = hero ? rng.range(0, 0.14) : rng.range(0.12, 0.95) * scale;
    const m = new THREE.Matrix4()
      .makeTranslation(Math.cos(az) * d, h * 0.40, Math.sin(az) * d)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(
        new THREE.Euler(Math.cos(az + Math.PI) * lean, rng.range(0, Math.PI * 2), Math.sin(az + Math.PI) * lean)));
    g.applyMatrix4(m);
    shards.push(g);
  }
  // The socket: dark broken rock the crystal has forced its way out of. It is a
  // SEPARATE material from the shards on purpose — the first version tinted the
  // rubble with the same emissive and the whole thing read as a campfire on a
  // car park rather than as a crystal. A bright thing needs a dark thing under
  // it or there is no crystal, only a glow.
  for (let i = 0; i < 18; i++) {
    const sz = rng.range(0.13, 0.40) * scale;
    const g = new THREE.DodecahedronGeometry(sz, 0).toNonIndexed();
    const az = rng.range(0, Math.PI * 2);
    const d = rng.range(0.20, 1.7) * scale;
    g.applyMatrix4(new THREE.Matrix4()
      .makeTranslation(Math.cos(az) * d, sz * rng.range(0.10, 0.40), Math.sin(az) * d)
      .multiply(new THREE.Matrix4().makeScale(1, rng.range(0.35, 0.65), 1)));
    rubble.push(g);
  }
  const a = mergeGeometries(shards, false);
  const b = mergeGeometries(rubble, false);
  for (const p of shards) p.dispose();
  for (const p of rubble) p.dispose();
  if (!a || !b) throw new Error('Deposits: mergeGeometries returned null (mixed indexed/non-indexed)');
  return { shards: a, socket: b };
}

/**
 * Where a deposit actually stands.
 *
 * `DEPOSIT_SITES` anchors each deposit to a **world-map POI**, which is the
 * right fix for the coordinates that had drifted kilometres — and a POI centre
 * is the middle of whatever the kit built there. The first build put the
 * Hammerhead deposit on the painted lane markings of the outpost's own asphalt
 * deck and the Three Valleys one inside a pylon's plinth. So: keep the anchor,
 * step off the furniture. A seeded ring search for the best spot 14-34 m out,
 * scored on distance from the road network and on local flatness, which is
 * still well inside the radius the map pin claims.
 */
function siteNear(terrain: { heightAt(x: number, z: number): number, slopeAt(x: number, z: number): number, roadDistance(x: number, z: number): number },
  x0: number, z0: number, rng: Rng) {
  let best: { x: number, z: number, score: number } | null = null;
  const a0 = rng.range(0, Math.PI * 2);
  for (let ri = 0; ri < 5; ri++) {
    const r = 14 + ri * 5;
    for (let ai = 0; ai < 12; ai++) {
      const a = a0 + (ai / 12) * Math.PI * 2;
      const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
      // Flat enough to stand a crystal on, and off the carriageway. Being far
      // from the road is worth a little; being on a cliff disqualifies.
      const slope = terrain.slopeAt(x, z);
      if (slope > 0.30) continue;
      const road = Math.min(40, terrain.roadDistance(x, z));
      if (road < 9) continue;
      const score = road * 0.05 - slope * 14 - r * 0.02;
      if (!best || score > best.score) best = { x, z, score };
    }
  }
  return best || { x: x0, z: z0, score: 0 };
}

export class Deposits {
  _installed = false;
  game: Game | null = null;
  nodes: DepositNode[] = [];
  rpg: RpgSystem;
  _t = 0;
  /** Reused by `update`, so the per-frame distance test allocates nothing. */
  _v = new THREE.Vector3();

  constructor(rpg: RpgSystem) { this.rpg = rpg; }

  /**
   * Build the twelve deposits and take their prompts, once. Safe to call every
   * frame; returns true on the tick that actually did the work.
   */
  install(game: Game) {
    if (this._installed) return false;
    const ix = game?.get?.('Interaction');
    const terrain = game?.get?.('Terrain');
    if (!ix || !terrain || !game.scene) return false;
    this.game = game;
    this._installed = true;

    const root = new THREE.Group();
    root.name = 'energy_deposits';
    // One dark rock for all twelve sockets. The crystal is the only thing that
    // gets a per-element material.
    const rockMat = new THREE.MeshStandardMaterial({
      color: srgb(0x8a7a68), roughness: 0.95, metalness: 0.0, flatShading: true,
    });

    for (const def of DEPOSITS) {
      const rng = new Rng(seedOf(def.id));
      const el = def.element as MagicElement;
      const colour = srgb(Number(`0x${ELEMENT_COLOR[el].slice(1)}`));

      const g = new THREE.Group();
      g.name = `deposit_${def.id}`;
      // `DEPOSITS[i].pos[1]` is hard-coded 0 — the anchor is a map POI, which
      // has no height. Anything that draws or prompts has to ask the terrain.
      const site = siteNear(terrain, def.pos[0], def.pos[2], rng);
      g.position.set(site.x, terrain.heightAt(site.x, site.z), site.z);
      g.rotation.y = rng.range(0, Math.PI * 2);

      // Emissive at 0.75 rather than the 1.6 the first pass used. Past about
      // one the shards clip to a flat colour under `Exposure`'s meter and the
      // faceting the geometry was built for stops existing — they read as
      // paper flames. Bloom is what makes them glow; the material only has to
      // be bright enough to reach it.
      const mat = new THREE.MeshStandardMaterial({
        color: colour.clone().multiplyScalar(0.30),
        emissive: colour,
        emissiveIntensity: 0.75,
        roughness: 0.18,
        metalness: 0.0,
        flatShading: true,
      });
      const parts = crystalCluster(rng, def.capacity);
      const crystal = new THREE.Mesh(parts.shards, mat);
      crystal.name = `deposit_${def.id}_crystal`;
      crystal.castShadow = true;
      crystal.receiveShadow = true;
      g.add(crystal);

      const socket = new THREE.Mesh(parts.socket, rockMat);
      socket.name = `deposit_${def.id}_socket`;
      socket.castShadow = true;
      socket.receiveShadow = true;
      g.add(socket);

      g.visible = false;
      root.add(g);

      this.nodes.push({
        def, group: g, mat, handle: null, base: 0.75,
        phase: rng.range(0, Math.PI * 2), charge: 1,
      });
    }
    game.scene.add(root);

    for (const node of this.nodes) {
      const d = node.def;
      node.handle = ix.register({
        id: `deposit_${d.id}`,
        pos: node.group.position,
        radius: REACH_M,
        // Wide, because a deposit is a thing you walk up to and stand over
        // rather than a face you address. Same argument as `HavenCamp`.
        cone: 200,
        priority: 2,
        verb: 'Draw',
        label: d.name,
        hint: `${d.element} energy`,
        yOffset: 2.2,
        handler: () => this.draw(node),
      });
    }
    return true;
  }

  /** Drop every handle and mesh. For tests and for a world rebuild. */
  dispose() {
    for (const n of this.nodes) {
      if (n.handle) n.handle.dispose();
      n.group.removeFromParent();
      n.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      n.mat.dispose();
    }
    this.nodes.length = 0;
    this._installed = false;
  }

  /**
   * Pull energy out of one deposit.
   *
   * Routed through `CombatSystem.drawEnergy` rather than `Elemancy.draw`
   * directly, because that is where the mote burst, the flare and the `draw`
   * event already live — the mechanic was never missing, only its door. The
   * fallback is the model call, so this still works on a page with no combat
   * system (which is what `combatloop` and the probes drive).
   */
  draw(node: DepositNode) {
    const game = this.game;
    const rpg = this.rpg;
    if (!game) return;
    const combat = game.get('Combat');
    const res = combat && combat.drawEnergy
      ? combat.drawEnergy()
      : rpg.drawNearby({ x: node.def.pos[0], z: node.def.pos[2] }, REACH_M * 2);
    const hud = game.get('HUD');
    if (res && res.ok) {
      node.charge = 0;
      if (hud && hud.toast) {
        hud.toast(node.def.name, `+${'gained' in res ? res.gained : 0} ${node.def.element}`, '✦', node.def.element);
      }
    } else if (hud && hud.toast) {
      // A refusal has to say *why*, or an empty deposit is indistinguishable
      // from a broken key. `refillAt` is an absolute in-game hour.
      const reason = res && 'reason' in res ? res.reason : 'unknown';
      const wait = res && 'refillAt' in res && typeof res.refillAt === 'number'
        ? Math.max(0, Math.round(res.refillAt - rpg.day.absoluteHour))
        : 0;
      hud.toast(node.def.name,
        reason === 'depleted' ? (wait > 0 ? `Spent — ${wait} h to recharge` : 'Spent') : 'Nothing to draw',
        '✦', 'warn');
    }
    return res;
  }

  /**
   * Pulse the crystals, fade a spent one out, and switch off everything the
   * camera is nowhere near.
   *
   * The distance cull is the whole reason this can be twelve separate groups
   * instead of three merged ones: merged, a deposit's bounding sphere spans the
   * map and every one of them is submitted from every camera in the world —
   * including as a bright emissive dot on the horizon sixty kilometres away.
   * Culled at 240 m, at most one or two are ever drawn.
   */
  update(dt: number, game: Game) {
    if (!this._installed || !this.nodes.length) return;
    this._t += dt;
    const cam = game.camera;
    if (!cam) return;
    const hour = this.rpg.day.absoluteHour;
    for (const n of this.nodes) {
      const dist = this._v.copy(n.group.position).distanceTo(cam.position);
      const near = dist < VISIBLE_M;
      if (n.group.visible !== near) n.group.visible = near;
      if (!near) continue;

      // Live state, read rather than cached: an hour can pass in a camp menu.
      const st = this.rpg.elemancy.deposits[n.def.id];
      const remaining = st ? Math.max(0, n.def.capacity - st.drawn) : n.def.capacity;
      const spent = remaining <= 0 && hour < (st ? st.refillAt : 0);
      const want = spent ? 0.08 : 1;
      n.charge += (want - n.charge) * Math.min(1, dt / SPENT_FADE);

      // Two beats at different rates, so the pulse never reads as a sine.
      const pulse = 1 + 0.22 * Math.sin(this._t * 1.7 + n.phase)
        + 0.09 * Math.sin(this._t * 4.3 + n.phase * 2.1);
      n.mat.emissiveIntensity = n.base * pulse * n.charge;

      if (n.handle) {
        n.handle.set({
          hint: spent
            ? `Spent — ${Math.max(0, Math.round((st ? st.refillAt : 0) - hour))} h to recharge`
            : `${remaining} units of ${n.def.element}`,
        });
      }
    }
  }
}

export default Deposits;

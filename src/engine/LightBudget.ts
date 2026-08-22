import * as THREE from 'three';
import { isLight, isPointLight, isSpotLight } from '../util/three-guards.ts';

/**
 * Pins the number of *visible* dynamic lights so three never has to rebuild
 * its shader programs mid-frame.
 *
 * three bakes `numPointLights` / `numSpotLights` into every lit program's
 * cache key, and a light with `visible === false` (or any invisible ancestor)
 * is not counted. So the moment a VFX flash pops on, a distant lamp gets
 * distance-culled, or the VFX root is hidden for the soft-particle depth
 * prepass, the count changes and **every material in the scene recompiles**.
 * Measured on an M5 Max: going from one visible point light to two cost
 * 9.5 seconds and 43 new programs. That is the 12-second freeze players saw
 * on a weapon swap, and the 300–900 ms hitches while sprinting across the map.
 *
 * The fix is a fixed light budget. A pool of inert "ballast" lights sits in the
 * scene with zero intensity; before every render we count the real visible
 * lights and show exactly enough ballast to make the total constant. If more
 * real lights want to be on than the budget allows, the least important ones
 * (dim, far away) are held off for that frame rather than being allowed to
 * change the count.
 *
 * Because the count never changes, the programs compiled during the boot-time
 * `renderer.compile()` stay valid for the whole session.
 */
/** The two light kinds that move around and therefore need budgeting. */
type LightKind = 'point' | 'spot';

/** One real scene light, with the ancestors whose visibility also gates it. */
interface LightEntry {
  light: THREE.Light;
  /** Every parent between the light and the scene root. */
  chain: THREE.Object3D[];
  /** Importance for this frame; only set while over budget. */
  score?: number;
}

export class LightBudget {
  _camPos!: THREE.Vector3;
  /** Lights this system switched off, restored at the top of `balance`. */
  _forced!: THREE.Light[];
  _lp!: THREE.Vector3;
  /** The real lights in the scene, by kind. Refreshed by `rescan`. */
  _real!: Record<LightKind, LightEntry[]>;
  _scanIn!: number;
  /** Zero-intensity lights that hold the slot count steady. */
  ballast!: Record<LightKind, THREE.Light[]>;
  /** Visible lights allowed of each kind. */
  budget!: Record<LightKind, number>;
  enabled!: boolean;
  scene!: THREE.Scene;
  /**
   * @param [budget] visible lights of each type
   */
  constructor(scene: THREE.Scene, { point = 12, spot = 2 }: {point?:number, spot?:number} = {}) {
    this.scene = scene;
    this.enabled = true;
    this.budget = { point, spot };
    this.ballast = { point: [], spot: [] };
    this._real = { point: [], spot: [] };
    this._forced = [];
    this._scanIn = 0;
    this._camPos = new THREE.Vector3();

    this._makeBallast('point', point);
    this._makeBallast('spot', spot);
    this.rescan();
    // Balance immediately: `renderer.compile()` gathers lights with
    // `traverseVisible`, so the boot-time warm-up must see the budgeted count.
    this.balance();
  }

  /**
   * Resize the budget. One recompile happens on the next render; only ever
   * call this from a quality change, never per frame.
   */
  setBudget({ point, spot }: {point?:number, spot?:number}) {
    if (point != null && point !== this.budget.point) {
      this.budget.point = point;
      this._makeBallast('point', point);
    }
    if (spot != null && spot !== this.budget.spot) {
      this.budget.spot = spot;
      this._makeBallast('spot', spot);
    }
    this.rescan();
  }

  _makeBallast(kind: LightKind, n: number) {
    const pool = this.ballast[kind];
    while (pool.length > n) {
      const l = pool.pop();
      if (!l) break;
      this.scene.remove(l);
      l.dispose?.();
    }
    while (pool.length < n) {
      const l = kind === 'point'
        ? new THREE.PointLight(0xffffff, 0, 0.001, 2)
        : new THREE.SpotLight(0xffffff, 0, 0.001, 0.01, 0, 2);
      // Far below the world, no range, no intensity: it lights nothing and
      // costs a handful of ALU per fragment. All it does is hold a slot.
      l.position.set(0, -9000, 0);
      l.castShadow = false;
      l.matrixAutoUpdate = false;
      l.updateMatrix();
      l.userData.lightBallast = true;
      l.name = `ballast-${kind}-${pool.length}`;
      this.scene.add(l);
      const target = (l as THREE.SpotLight).target;
      if (target) { target.position.set(0, -9001, 0); this.scene.add(target); }
      pool.push(l);
    }
  }

  /** Re-collect the real lights in the scene. Cheap, but not free — run rarely. */
  rescan() {
    const point: LightEntry[] = [], spot: LightEntry[] = [];
    this.scene.traverse((o) => {
      if (!isLight(o) || o.userData.lightBallast) return;
      // Only unshadowed point/spot lights move around; the CSM cascades and the
      // hemisphere fills are permanent and never change the counts.
      if (o.castShadow) return;
      const chain: THREE.Object3D[] = [];
      for (let p = o.parent; p && p !== this.scene; p = p.parent) chain.push(p);
      const entry: LightEntry = { light: o, chain };
      if (isPointLight(o)) point.push(entry);
      else if (isSpotLight(o)) spot.push(entry);
    });
    this._real.point = point;
    this._real.spot = spot;
  }

  /**
   * Bring the visible light count back to budget. Must run before *every*
   * `renderer.render()` — the water reflection and the VFX depth prepass are
   * separate renders and each one hits the program cache.
   * @param [camera] used to rank lights when over budget
   */
  balance(camera?: THREE.Camera) {
    if (!this.enabled) return;
    if (this._scanIn-- <= 0) { this._scanIn = 60; this.rescan(); }
    if (camera) this._camPos.setFromMatrixPosition(camera.matrixWorld);

    // Anything we forced off last time goes back on before we recount, so the
    // owner — not us — decides whether it is still wanted.
    for (const l of this._forced) { if (l.userData.__lbForced) { l.userData.__lbForced = false; l.visible = true; } }
    this._forced.length = 0;

    this._balanceKind('point');
    this._balanceKind('spot');
  }

  _balanceKind(kind: LightKind) {
    const entries = this._real[kind];
    const budget = this.budget[kind];
    const live: LightEntry[] = [];
    for (const e of entries) {
      if (!e.light.visible) continue;
      let hidden = false;
      for (const p of e.chain) if (!p.visible) { hidden = true; break; }
      if (!hidden) live.push(e);
    }

    // Over budget: hold off the least useful lights. Importance falls off with
    // distance so a bright flash at the player always beats a distant lamp.
    if (live.length > budget) {
      const p = this._camPos;
      const lp = this._lp || (this._lp = new THREE.Vector3());
      for (const e of live) {
        // world, not local: a lamp parented under an outpost group has a
        // local position that says nothing about where it is on the map
        lp.setFromMatrixPosition(e.light.matrixWorld);
        e.score = (e.light.intensity || 0) / (1 + lp.distanceToSquared(p) * 0.02);
      }
      live.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      for (let i = budget; i < live.length; i++) {
        live[i].light.visible = false;
        live[i].light.userData.__lbForced = true;
        this._forced.push(live[i].light);
      }
      live.length = budget;
    }

    const pool = this.ballast[kind];
    const want = budget - live.length;
    for (let i = 0; i < pool.length; i++) pool[i].visible = i < want;
  }

  dispose() {
    for (const kind of ['point', 'spot'] as LightKind[]) {
      for (const l of this.ballast[kind]) {
        this.scene.remove(l);
        // Only a spot light has a target object, and `_makeBallast` added it.
        if (isSpotLight(l)) this.scene.remove(l.target);
      }
      this.ballast[kind].length = 0;
    }
  }
}

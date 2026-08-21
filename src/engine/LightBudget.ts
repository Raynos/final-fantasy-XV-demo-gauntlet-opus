import * as THREE from 'three';

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
export class LightBudget {
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

  _makeBallast(kind, n) {
    const pool = this.ballast[kind];
    while (pool.length > n) {
      const l = pool.pop();
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
      if (l.target) { l.target.position.set(0, -9001, 0); this.scene.add(l.target); }
      pool.push(l);
    }
  }

  /** Re-collect the real lights in the scene. Cheap, but not free — run rarely. */
  rescan() {
    const point = [], spot = [];
    this.scene.traverse((o) => {
      if (!o.isLight || o.userData.lightBallast) return;
      // Only unshadowed point/spot lights move around; the CSM cascades and the
      // hemisphere fills are permanent and never change the counts.
      if (o.castShadow) return;
      const chain = [];
      for (let p = o.parent; p && p !== this.scene; p = p.parent) chain.push(p);
      const entry = { light: o, chain };
      if (o.isPointLight) point.push(entry);
      else if (o.isSpotLight) spot.push(entry);
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

  _balanceKind(kind) {
    const entries = this._real[kind];
    const budget = this.budget[kind];
    const live = [];
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
      live.sort((a, b) => b.score - a.score);
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
    for (const kind of ['point', 'spot']) {
      for (const l of this.ballast[kind]) {
        this.scene.remove(l);
        if (l.target) this.scene.remove(l.target);
      }
      this.ballast[kind].length = 0;
    }
  }
}

import * as THREE from 'three';

/**
 * Wet-surface response.
 *
 * A wet dielectric does two measurable things: the water film fills the surface
 * micro-relief so it becomes far smoother, and light that would have scattered
 * back out of the top layer is trapped, so the albedo darkens. Both are applied
 * here — to the terrain through its own shader uniform (which also grows
 * puddles in the erosion flow channels), and to every other lit material in the
 * scene by scaling the values they were authored with.
 *
 * Originals are cached the first time a material is touched and every later
 * value is derived from that cache, so repeatedly soaking and drying can never
 * ratchet a material darker.
 */
export class Wetness {
  _mats!: any[];
  _scanIn!: number;
  _ssrOn!: boolean;
  game!: any;
  value!: number;
  constructor(game: any) {
    this.game = game;
    this.value = -1;
    this._scanIn = 0;
    this._mats = [];
  }

  /**
   * @param w 0..1
   */
  apply(w: number, game: any) {
    // terrain: its shader grows puddles in the flow map, so it gets the raw value
    const terrain = game.get('Terrain');
    if (terrain && terrain.setWetness) terrain.setWetness(w);

    // Screen-space reflections are what actually sell standing water. They are
    // off by default; rain is exactly the case they were written for.
    const post = game.post;
    if (post && post.ssr) {
      if (w > 0.08) {
        post.ssr.enabled = true;
        post.ssr.intensity = 0.42 * w;
        post.ssr.maxHeight = 300;
        post.ssr.roughness = 0.10;
        post.ssr.maxDistance = 70;
        this._ssrOn = true;
      } else if (this._ssrOn) {
        post.ssr.enabled = false;
        this._ssrOn = false;
      }
    }

    if (this._scanIn-- <= 0) {
      this._scanIn = 20;
      this._collect(game.scene);
    }
    if (Math.abs(w - this.value) < 0.002) return;
    this.value = w;

    for (const m of this._mats) {
      const d = m.userData.__dry;
      m.roughness = THREE.MathUtils.clamp(d.rough * (1 - 0.62 * w), 0.045, 1);
      m.color.setRGB(
        d.r * (1 - 0.30 * w), d.g * (1 - 0.30 * w), d.b * (1 - 0.28 * w)
      );
      if (d.env != null) m.envMapIntensity = d.env * (1 + 1.35 * w);
    }
  }

  /** Cache the dry authored values of anything new in the scene. */
  _collect(scene: any) {
    this._mats.length = 0;
    scene.traverse((o: any) => {
      if (!o.material || o.userData.noWet) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) {
        if (!m || m.userData.noWet) continue;
        if (!(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) continue;
        // the terrain drives its own wetness inside its shader
        if (m.userData.terrainSurface) continue;
        if (!m.userData.__dry) {
          m.userData.__dry = {
            rough: m.roughness, r: m.color.r, g: m.color.g, b: m.color.b,
            env: m.envMapIntensity,
          };
        }
        this._mats.push(m);
      }
    });
  }
}

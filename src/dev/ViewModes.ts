import * as THREE from 'three';

/**
 * Whole-scene material overrides for reading geometry rather than art.
 *
 * Implemented with `scene.overrideMaterial`, which swaps the material at draw
 * time without touching any real material — so nothing is mutated, nothing is
 * recompiled per-object, and turning a mode off restores the frame exactly.
 * That matters here more than usual: this project has a documented incident
 * where changing render state recompiled 43 programs in a 9.5 s freeze.
 *
 * The four that earn their place for a procedural world:
 *   - **wireframe** — density and tessellation, and whether an LOD is where you
 *     think it is.
 *   - **unlit** — albedo with the lighting removed. The fastest way to tell
 *     "this is too dark" from "this is lit too dark".
 *   - **normals** — surface direction as colour. Flipped faces and smoothing
 *     seams are invisible otherwise, and both have bitten this project.
 *   - **overdraw** — additive, depth-test off, so stacked transparency glows.
 *     Vegetation cards are the usual culprit.
 */
export class ViewModes {
  _mats!: any;
  mode!: string;
  constructor() {
    this.mode = 'off';
    this._mats = null;
  }

  /** Built lazily: none of these exist until someone asks for a debug view. */
  _build() {
    if (this._mats) return this._mats;
    this._mats = {
      wireframe: new THREE.MeshBasicMaterial({ color: 0x8fd0ff, wireframe: true }),
      unlit: new THREE.MeshBasicMaterial({ vertexColors: false, color: 0xb0b0b0 }),
      normals: new THREE.MeshNormalMaterial(),
      overdraw: new THREE.MeshBasicMaterial({
        color: 0x220d05,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    };
    return this._mats;
  }

  static get names(): string[] { return ['off', 'wireframe', 'unlit', 'normals', 'overdraw']; }

  set(name: string, scene: THREE.Scene) {
    const want = String(name || 'off');
    if (!ViewModes.names.includes(want)) throw new Error(`view: ${ViewModes.names.join(' | ')}`);
    this.mode = want;
    scene.overrideMaterial = want === 'off' ? null : this._build()[want];
    return want;
  }
}

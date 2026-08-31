import * as THREE from 'three';
import { setPortrait } from './PortraitStore.ts';
import type { Game } from '../game/Game.ts';
import type { Character } from '../characters/rig/Character.ts';

/**
 * Hero portraits, baked off the real heads.
 *
 * Every portrait in the game — the HUD party stack, the pause menu, the Gear
 * screen, camp dialogue — used to be one procedural bust silhouette tinted by a
 * per-character hue at 8-11% saturation. At 38 px that is four identical grey
 * blanks, and a playtester named it in the first ten seconds: *"every portrait
 * is the empty grey no-avatar silhouette"*. The hue carried the whole burden of
 * telling four people apart and it could not, because it was deliberately
 * desaturated to stop the pause menu reading as a colour-swatch strip.
 *
 * So the portrait is now a render of the character who is actually standing in
 * the world: same sculpt, same hair, same jacket, same light. It cannot drift
 * from the model, and Prompto's blond and Gladiolus' scar arrive for free the
 * day the rig lane changes them.
 *
 * ### How it renders without disturbing anything
 *
 * The obvious implementation — a private scene with a three-point light rig —
 * is the expensive one. Character materials are `MeshPhysicalMaterial`, so the
 * light *counts* are program parameters: adding a key light compiles a fresh
 * variant of every character program (`project/LANDMINES.md` records a light
 * `visible` toggle costing 43 recompiles and 9.5 s). A private scene also loses
 * the environment probe and the cascaded shadow maps, so the face comes back
 * flat.
 *
 * This bakes **in the live scene** instead, and isolates the subject with a
 * camera layer:
 *
 * - every mesh of one character gets `layers.enable(PORTRAIT_LAYER)`, and so do
 *   the scene's lights (three tests lights against the camera's layer mask like
 *   any other object — miss this and the head renders unlit black);
 * - the portrait camera is `layers.set(PORTRAIT_LAYER)`, so the world, the
 *   other three heroes and the terrain are simply not submitted;
 * - `scene.background` is dropped for the one render so the plate comes back
 *   with a transparent surround and the SVG's own gradient shows through;
 * - `shadowMap.autoUpdate` is off for the render, so the CSM cascades built for
 *   the gameplay camera are reused rather than re-rendered from a 0.6 m lens.
 *
 * Nothing about `scene.fog`, the light count or `shadowMap.enabled` is touched,
 * because each of those is a program parameter. The whole bake is uniform-level
 * and compiles nothing.
 *
 * ### Why it runs a few frames after boot, not during it
 *
 * It borrows the shadow maps, and at `Game` construction time no frame has been
 * drawn, so the cascades hold nothing. `HUD.lateUpdate` calls `tickPortraits`
 * once a handful of frames have been drawn, and bakes **one hero per frame** so
 * the cost lands as four sub-millisecond additions rather than one visible
 * hitch. Plates opened before then show the procedural bust and swap silently.
 *
 * ### Exposure
 *
 * A render target gets neither tone mapping nor an output transfer function
 * (three applies both only when drawing to the canvas), so the readback is
 * clamped linear. Tone mapping therefore happens here, in JS, with the same
 * ACES fit the renderer uses — plus a normalisation pass: the mean luminance of
 * the covered pixels is measured and pushed onto a fixed target before the
 * curve. That is what makes the plate legible at dawn, at noon and at night
 * without pinning the bake to a time of day.
 */

/**
 * Free camera layer. 0 is the world, 3 is `Water`'s reflection pass.
 * Nothing else in the project uses layers.
 */
const PORTRAIT_LAYER = 5;

/** Plate resolution. 48x56 is `Icons.portrait`'s viewBox; this is 6x it. */
const W = 288;
const H = 336;

/** Mean luminance the normalisation aims the covered pixels at, pre-curve. */
const TARGET_LUMA = 0.30;

/** Roster ids in the order the party stack lists them. */
const ORDER = ['noctis', 'gladio', 'ignis', 'prompto'] as const;

/**
 * Everything the framing and the grade are allowed to argue about.
 *
 * Named and overridable because tuning a portrait is a look-loop, and a boot
 * per attempt is the wrong price: `src/tools/_probe/pfbake.mts` sweeps a dozen
 * of these in one boot and hands back the plates.
 */
export interface BakeOpts {
  /** metres from the eye midpoint to the lens. */
  dist: number;
  /** radians off dead-on, toward the character's left. */
  swing: number;
  /** metres the lens sits below the eye line. */
  dip: number;
  /** metres above the eye line the lens aims, i.e. headroom. */
  aimUp: number;
  /** vertical field of view, degrees. */
  fov: number;
  /** mean luminance the covered pixels are normalised onto, pre-curve. */
  targetLuma: number;
  /** ceiling on the normalisation gain, so a dark plate cannot blow out. */
  maxGain: number;
}

export const DEFAULT_BAKE: BakeOpts = {
  dist: 0.62, swing: 0.42, dip: 0.085, aimUp: 0.035,
  fov: 26, targetLuma: TARGET_LUMA, maxGain: 6,
};

let rt: THREE.WebGLRenderTarget | null = null;
let cam: THREE.PerspectiveCamera | null = null;
let cursor = 0;
let armed = 0;

/**
 * Bake at most one portrait. Cheap and idempotent once all four are done.
 *
 * @param game the live game
 * @returns true while there is still work to do
 */
export function tickPortraits(game: Game): boolean {
  if (cursor >= ORDER.length) return false;
  // Give the renderer a few real frames first: the bake reads the shadow
  // cascades and the environment probe, and neither exists on frame 0.
  if (armed++ < 4) return true;
  const id = ORDER[cursor];
  const ch = heroCharacter(game, id);
  // A character that is not built yet is retried next frame rather than
  // skipped — companions are added a step after the player.
  if (!ch) { armed = 4; return true; }
  cursor++;
  try {
    const url = bake(game, ch, DEFAULT_BAKE);
    if (url) setPortrait(id, url);
  } catch (e) {
    // A portrait is decoration. Never let it take the frame loop down.
    console.warn('[portraits] bake failed', id, e);
  }
  if (cursor >= ORDER.length) dispose();
  return cursor < ORDER.length;
}

export function heroCharacter(game: Game, id: string): Character | null {
  if (id === 'noctis') return game.get('Player')?.character ?? null;
  return game.get('Party')?.get(id)?.character ?? null;
}

/** Every mesh of a character that belongs in a portrait. */
function plateMeshes(ch: Character): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  ch.root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    // The contact blob and the merged shadow caster are lighting furniture:
    // in a 0.6 m portrait the blob is a black disc across the chin.
    if (o === ch.groundShadow || o === ch.shadowProxy) return;
    out.push(o);
  });
  return out;
}

/**
 * Render one head to a data URL. Exported for the tuning probe; the game
 * itself only ever reaches it through `tickPortraits`.
 */
export function bake(game: Game, ch: Character, o: BakeOpts = DEFAULT_BAKE): string | null {
  const renderer = game.renderer;
  const scene = game.scene;
  if (!renderer || !scene || !ch.eyes) return null;

  if (!rt) {
    rt = new THREE.WebGLRenderTarget(W, H, { samples: 4, depthBuffer: true, stencilBuffer: false });
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  }
  if (!cam) cam = new THREE.PerspectiveCamera(o.fov, W / H, 0.05, 12);
  cam.fov = o.fov;
  cam.updateProjectionMatrix();
  cam.layers.set(PORTRAIT_LAYER);

  const meshes = plateMeshes(ch);
  const lights: THREE.Object3D[] = [];
  scene.traverse((o) => { if ((o as THREE.Light).isLight) lights.push(o); });
  for (const m of meshes) m.layers.enable(PORTRAIT_LAYER);
  for (const l of lights) l.layers.enable(PORTRAIT_LAYER);

  frameHead(ch, cam, o);

  const prevTarget = renderer.getRenderTarget();
  const prevClear = new THREE.Color();
  renderer.getClearColor(prevClear);
  const prevAlpha = renderer.getClearAlpha();
  const prevBg = scene.background;
  const prevAuto = renderer.shadowMap.autoUpdate;
  const prevXR = renderer.xr.enabled;

  scene.background = null;
  renderer.shadowMap.autoUpdate = false;
  renderer.xr.enabled = false;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, false);
  renderer.render(scene, cam);

  const buf = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);

  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  scene.background = prevBg;
  renderer.shadowMap.autoUpdate = prevAuto;
  renderer.xr.enabled = prevXR;
  for (const m of meshes) m.layers.disable(PORTRAIT_LAYER);
  for (const l of lights) l.layers.disable(PORTRAIT_LAYER);

  return encode(buf, o);
}

const _eye = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _tgt = new THREE.Vector3();

/**
 * Put the lens on a head-and-shoulders three-quarter.
 *
 * Aimed off `Character.eyes`, the gaze carrier at the midpoint between the
 * globes, because it is the one node that means the same thing on four
 * differently proportioned skulls — a head *socket* sits above the crown and a
 * skinned bounding box is in bind pose.
 *
 * The lens sits slightly **below** the eye line and looks up, which is not the
 * obvious portrait framing and is the same trick `Shots.hero_portrait` records:
 * the settled idle pose pitches the head down and the fringe hangs over the
 * brow, so a lens at or above eye height photographs the top of a head.
 */
function frameHead(ch: Character, camera: THREE.PerspectiveCamera, o: BakeOpts) {
  ch.root.updateWorldMatrix(true, true);
  ch.eyes.getWorldPosition(_eye);
  // The character's own facing, so the three-quarter is theirs and not the
  // world's — companions stand on their own headings in formation.
  ch.root.getWorldDirection(_fwd);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, 1);
  _fwd.normalize();
  _right.set(_fwd.z, 0, -_fwd.x);

  const { dist, swing, dip } = o;
  _pos.copy(_eye)
    .addScaledVector(_fwd, Math.cos(swing) * dist)
    .addScaledVector(_right, Math.sin(swing) * dist);
  _pos.y = _eye.y - dip;
  // Aim a little above the eyes so the frame carries hair, not neck.
  _tgt.copy(_eye).addScaledVector(_fwd, 0.02);
  _tgt.y = _eye.y + o.aimUp;
  camera.position.copy(_pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(_tgt);
  camera.updateMatrixWorld(true);
}

/**
 * Clamped-linear RGBA -> a tone-mapped, sRGB-encoded, y-flipped data URL.
 *
 * The exposure gain is chosen from the image itself (see the class note), and
 * MSAA edge texels come back premultiplied against a transparent black clear,
 * so they are divided back out before encoding or the silhouette wears a dark
 * fringe — the same correction `VegTextures.bakeTreeImpostor` makes.
 */
function encode(buf: Uint8Array, o: BakeOpts): string {
  let sum = 0; let n = 0;
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] < 128) continue;
    sum += (buf[i] * 0.2126 + buf[i + 1] * 0.7152 + buf[i + 2] * 0.0722) / 255;
    n++;
  }
  // Under ~2% coverage the frame missed the head; a gain read off that is
  // noise, so fall back to neutral rather than blowing the plate out.
  const mean = n > W * H * 0.02 ? sum / n : o.targetLuma;
  const gain = Math.min(o.maxGain, Math.max(0.5, o.targetLuma / Math.max(1e-4, mean)));

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const src = (H - 1 - y) * W * 4;   // GL reads bottom-up
    const dst = y * W * 4;
    for (let x = 0; x < W * 4; x += 4) {
      const a = buf[src + x + 3];
      const un = a > 0 && a < 255 ? 255 / a : 1;
      for (let c = 0; c < 3; c++) {
        const lin = (buf[src + x + c] / 255) * un * gain;
        d[dst + x + c] = Math.round(255 * srgb(aces(lin)));
      }
      d[dst + x + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}

/** The Narkowicz ACES fit, i.e. what `ACESFilmicToneMapping` does. */
function aces(v: number): number {
  const x = v * 0.6;
  const r = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  return r < 0 ? 0 : r > 1 ? 1 : r;
}

function srgb(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function dispose() {
  if (rt) { rt.dispose(); rt = null; }
  cam = null;
}

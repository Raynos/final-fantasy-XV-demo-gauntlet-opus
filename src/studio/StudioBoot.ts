import * as THREE from 'three';
import { yieldToBrowser } from '../game/Game.ts';
import { Renderer } from '../engine/Renderer.ts';
import { PostFX } from '../engine/PostFX.ts';
import { Input } from '../engine/Input.ts';
import { Sky } from '../world/Sky.ts';
import { Terrain } from '../world/Terrain.ts';
import { Water } from '../world/Water.ts';
import { Vegetation } from '../world/Vegetation.ts';
import { Props } from '../world/Props.ts';
import { Hammerhead } from '../world/town/Hammerhead.ts';
import { CityHub } from '../world/town/CityHub.ts';
import { Dungeons } from '../world/dungeons/Dungeons.ts';
import type { Game } from '../game/Game.ts';

/**
 * Boot profiles: how much of the engine the studio is allowed to build.
 *
 * ## Why this file exists
 *
 * v1 of the studio ran inside a fully booted game — all thirty systems — and
 * then spent code suppressing what it had just built: pausing the simulation,
 * clearing encounters every frame, hiding the party, hand-ticking the streamers
 * that the pause had stopped. That is backwards. The studio is not a mode of
 * the game; it is a different program that shares the game's *content*.
 *
 * So there are three profiles and the studio picks one before anything heavy
 * runs:
 *
 * | profile | systems | who |
 * |---|---|---|
 * | `none`  | **0**   | the front door, and the Model Explorer |
 * | `world` | **8**   | the World Explorer — geometry, nothing else |
 * | `full`  | 30      | the game, via `Game.init()`, unchanged |
 *
 * The front door needing nothing is worth ~6.2 of the 6.5 seconds a person
 * used to wait before they could press a key.
 *
 * ## Why eight, and why it is safe
 *
 * `Sky`, `Terrain`, `Water`, `Vegetation`, `Props`, `Town`, `Cities`,
 * `Dungeons` are the systems that build *the world as geometry*. Everything
 * else is a game: a player, a party, an enemy pool, combat, a camera rig, a
 * story, a HUD.
 *
 * **It was five, and five was wrong.** The v2 audit photographed Hammerhead in
 * the World Explorer and found one red-roofed shed and a pole where the game
 * has a garage complex, because the settlement is not props — it is the
 * `Hammerhead` system. Cities are `CityHub` and dungeon mouths are `Dungeons`,
 * and "just the geometry of the world" was missing all three. Each was audited
 * the way the first five were, line by line, on 2026-09-02:
 *
 *   - **`Hammerhead`** already splits cleanly. `init` builds geometry and then
 *     calls `_registerScreens` and `_registerInteractables`, and both begin
 *     with a guard (`if (!menus …) return`, `if (!ix) { warn; return; }`), so
 *     the gameplay half no-ops and the town is built. Its `update` reads only
 *     `game.camera` and `Sky` through `_night`, both guarded.
 *   - **`CityHub`** needed one change, made in its own file. `bind()` returned
 *     early on a missing `Interaction` *before* stringing the festoon, so a
 *     city square in the studio had its lights unstrung. The festoon is
 *     geometry and is now bound whether or not anything can be pressed; the
 *     game reaches it on the same frame it always did.
 *   - **`Dungeons`** requires `Terrain` and throws without it, which is
 *     satisfied here; `Sky`, `Audio`, `Interaction`, `Player`, `Party` and
 *     `HUD` are every one of them behind a null check. `_buildEntrances` is
 *     pure geometry against the terrain, and interiors are built on `enter()`,
 *     which nothing in the studio calls.
 *
 * The original five were audited the same way and are quoted in the v2 plan's
 * §3.3: `Vegetation` reads `Player`, `Party`, `Enemies` and `Weather` behind
 * null or `Array.isArray` checks; `Water` reads `Menus` behind
 * `if (menus && menus.name …)`; `Props` falls back to `new Ecology(...)` when
 * `Vegetation` has none and returns 0 night when `Sky` has no sun; `Sky`
 * returns `camera.near` when `Terrain` has no `heightAt`.
 *
 * Nothing throws on a missing system. The subset is a supported configuration
 * by good defensive style rather than by luck, and `studiocheck` asserts the
 * exact set so it stays one.
 *
 * ## Why this duplicates eight lines of `Game.init()`
 *
 * BRIEF rule 4 forbids editing `src/game/Game.ts`, and `init()` is a single
 * monolithic method: renderer prologue, then thirty systems, then post and a
 * shader compile. There is no seam to call half of it.
 *
 * So the prologue is reproduced here and the systems are added through
 * `game.add()`, which is already public and is exactly what `init()`'s own
 * `step()` helper calls. **This is the honest cost of rule 4 and it is the top
 * risk in the plan**: if `Game.init()`'s prologue changes, this drifts
 * silently. `studiocheck` boots both paths and compares the surface.
 */
export type StudioProfile = 'none' | 'world';

/**
 * The world profile, named once.
 *
 * Exported so `studiocheck` can assert the booted set against it rather than
 * against a list retyped in the gate — a second copy of this array is exactly
 * how it would come to disagree with reality.
 */
export const WORLD_SYSTEMS = [
  'Sky', 'Terrain', 'Water', 'Vegetation', 'Props',
  // The three the v2 audit found missing, and the reason Hammerhead was one
  // red-roofed shed in the World Explorer while the game had a garage complex.
  // @see the "Why eight, and not five" section of the file header.
  'Town', 'Cities', 'Dungeons',
] as const;

/** What `bootStudio` reports while it works, for a progress bar. */
export type Progress = (t: number, label: string | null) => void;

/**
 * Stand up the renderer, the scene, the camera and input — and nothing else.
 *
 * The eight lines from `Game.init()`'s prologue. @see the file header for why
 * they are here rather than called.
 */
function prologue(game: Game) {
  if (game.rnd) return;                    // already booted; profiles compose
  game.rnd = new Renderer(game.container);
  game.scene = game.rnd.scene;
  game.camera = game.rnd.camera;
  game.renderer = game.rnd.renderer;
  game.input = new Input(game.rnd.domElement);
  // The same fixed seed the game uses. A studio that generated a *different*
  // world would be showing you geometry the game does not have, which is worse
  // than useless for reviewing it.
  game.seed = 1337;
}

/**
 * Boot the studio to a profile.
 *
 * `none` gives a renderer and an empty scene: enough for the Model Explorer to
 * put one model in front of one camera, and enough for the front door to have
 * something to fade over. No world, no characters, no simulation.
 *
 * `world` adds the eight geometry systems. It is idempotent and additive, so
 * opening the Model Explorer first and the World Explorer second costs the
 * world boot once and the renderer never twice.
 */
export async function bootStudio(game: Game, profile: StudioProfile, p: Progress = () => {}): Promise<void> {
  p(0.05, 'Renderer');
  await yieldToBrowser();
  prologue(game);

  if (profile === 'world') {
    // Order is a dependency order, not a preference. `Hammerhead` reads
    // `Props.ecology` (falling back to `Vegetation.ecology`) to find the rest
    // stop it replaces; `CityHub` binds against `Props.poiKits`; `Dungeons`
    // requires `Terrain` and throws without it. Registered under the same names
    // `Game.init` uses -- `Town`, `Cities` -- because `game.get('Town')` is a
    // contract those systems' own callers already speak.
    const order: Array<[string, () => { init?(g: Game): unknown }]> = [
      ['Sky', () => new Sky()],
      ['Terrain', () => new Terrain()],
      ['Water', () => new Water()],
      ['Vegetation', () => new Vegetation()],
      ['Props', () => new Props()],
      ['Town', () => new Hammerhead()],
      ['Cities', () => new CityHub()],
      ['Dungeons', () => new Dungeons()],
    ];
    for (let i = 0; i < order.length; i++) {
      const [name, make] = order[i];
      if (game.get(name as never)) continue;          // already up
      p(0.10 + 0.65 * (i / order.length), `${name}  ${i + 1}/${order.length}`);
      // The yield goes after the label and before the work, so the phase a
      // person is about to wait for is the one they can read. Same reasoning
      // as `Game.init()`.
      // eslint-disable-next-line no-await-in-loop
      await yieldToBrowser();
      const sys = game.add(make() as never, name as never) as { init?(g: Game): unknown };
      // eslint-disable-next-line no-await-in-loop
      if (sys.init) await sys.init(game);
    }
  }

  if (!game.post) {
    p(0.78, 'Compiling shaders');
    await yieldToBrowser();
    game.post = new PostFX(game.rnd);
    await compile(game, p);
  }

  p(1.0, 'Ready');
  game.post.render();
  game.ready = true;
  // The same beat `Game.init` fires at the end of its own boot, and three
  // systems listen for it: `Props.mega` defers 624 ms of skyline to it on the
  // phone, `Dungeons` defers 1061 ms of entrance mouths, and `TexBake` defers
  // its container fetch. Without it the studio on a handset showed a world with
  // no distant city and no dungeon doorways, and nothing said why -- the
  // deferral is invisible on a desktop, where `demoActive()` is false and all
  // three build inline.
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('game-ready'));
}

/**
 * Compile every program, reporting n of N while the driver links them.
 *
 * The same shape as `Game._compileWithProgress`, which is private. Without
 * `KHR_parallel_shader_compile` the first `isReady()` answers true and this
 * costs one frame; the compile still happened inside `compile()`.
 */
async function compile(game: Game, p: Progress) {
  const pending = game.renderer.compile(game.scene, game.camera) as Set<THREE.Material> | undefined;
  const total = pending ? pending.size : 0;
  if (!total || !pending) return;
  const props = (game.renderer as unknown as {
    properties: { get(m: THREE.Material): { currentProgram?: { isReady(): boolean } } };
  }).properties;
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  for (let guard = 0; pending.size && guard < 600; guard++) {
    for (const m of [...pending]) {
      const prog = props.get(m)?.currentProgram;
      if (!prog || prog.isReady()) pending.delete(m);
    }
    const done = total - pending.size;
    p(0.78 + 0.20 * (done / total), `Compiling shaders  ${done}/${total}`);
    // eslint-disable-next-line no-await-in-loop
    if (pending.size) await frame();
  }
}

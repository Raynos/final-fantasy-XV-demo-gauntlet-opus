/**
 * The harness's own additions to the page's `window`.
 *
 * There used to be a `declare module '/*'` wildcard above this, because the
 * harness imports game modules *inside the page* by dev-server URL --
 * `page.evaluate(() => import('/world/map/Chart.ts'))`, which vite resolves
 * against its own root (`src/`) at runtime while the type checker sees no
 * `/world` directory at all.
 *
 * That is now resolved properly: `tsconfig.tools.json` maps `"/*"` to
 * `"./src/*"`, so each in-page import gets the real module's types. Per-module
 * ambient declarations (`declare module '/ui/Minimap.ts'`) do **not** work --
 * TypeScript reads an ambient module name starting with `/` as a rooted path
 * and refuses to match it -- so the path mapping is the only form that closes
 * it. Two contract bugs fell out the moment it did: `SHOTS.__probe` (now
 * `PROBE_SHOT` in `game/Shots.ts`) and `WorldMapScreen`'s constructor, which
 * asked for a whole `Menus` and uses one method of it (`ScreenHost`).
 */
/**
 * What the harness itself installs on the page's `window`.
 *
 * `uxcheck` drives the game by dispatching real key events and stepping the
 * sim by hand, and it parks those two helpers on `window` so every later
 * `page.evaluate` can reach them. `mapshoot` does the same with the two map
 * screens it builds. None of it is game code, which is why it is declared here
 * rather than in `src/globals.d.ts`. Declared non-optional: every reader runs
 * after the installer in the same page session.
 */
interface Window {
  /** Advance the sim by `n` fixed 1/60 s frames. */
  step: (n?: number) => void;
  /** Dispatch a real key event by code. */
  key: (code: string, type?: string) => void;
  /** `key` down, step, `key` up, settle. */
  press: (code: string, frames?: number) => void;
  /**
   * Dispatch a real `PointerEvent` at a node. `touchcheck` drives the
   * on-screen controls through the same events a thumb produces, rather than
   * calling into `VirtualPad` -- an assertion that skipped the DOM would not
   * notice a button that stopped receiving taps.
   */
  ptr: (node: Element, type: string, x?: number, y?: number, id?: number) => void;
  /** One of the touch layer's buttons, by its stable slot id. */
  btn: (id: string) => import('../ui/touch/TouchButton.ts').TouchButton;
  /** Press and release a touch button, then settle. */
  tap: (id: string, frames?: number) => void;
  /**
   * Rising edges seen per pad index since `watch()`, counted from inside
   * `Input.endFrame`. An edge is only visible during the frame that carries
   * it -- `_gpPrev` is rewritten on the way out -- so counting it from outside
   * `game.frame()` always reads zero.
   */
  edges: Record<string, number>;
  /** Start counting edges on these pad indices, discarding any previous count. */
  watch: (...idx: number[]) => void;
  /**
   * The minimap under test. `mapshoot` builds one by hand because `Minimap`
   * is not in the boot order yet -- the harness is how it gets looked at
   * before the registration line is handed over.
   */
  __mm?: import('../ui/Minimap.ts').Minimap;
  /** The world-map screen under test, and the element it was built into. */
  __ws?: {
    screen: import('../ui/screens/WorldMapScreen.ts').WorldMapScreen,
    host: HTMLElement,
  };
}

/**
 * The trailer recorder's finished takes, base64 per stem, parked on `window`
 * for the Node side to pull after `MediaRecorder.stop()` has flushed.
 *
 * It goes here rather than crossing as an `evaluate` return value because a
 * take is tens of megabytes: the transfer is sliced, and it happens strictly
 * *after* the recording, so none of it can cost a frame.
 */
interface Window {
  __TRAILER_BLOBS: Record<string, string>;
}

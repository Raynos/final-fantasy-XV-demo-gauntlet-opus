/**
 * Modules the harness imports *inside the page*, by dev-server URL.
 *
 * `page.evaluate(() => import('/world/map/Chart.ts'))` is resolved by vite at
 * runtime against its own root (`src/`), not by the type checker against the
 * filesystem -- there is no `/world` directory.
 *
 * The wildcard says "this is a URL the page resolves", which is more honest
 * than a `@ts-expect-error` on each of the ten call sites.
 *
 * **This is the last `any` in `src/tools/`.** Mapping each URL to the real
 * module -- `declare module '/ui/Minimap.ts' { export * from '../ui/Minimap.ts' }`
 * -- does not work: TypeScript treats an ambient module name beginning with
 * `/` as a rooted path and refuses to match the declaration, so only the
 * wildcard form resolves at all. Closing it properly means giving the tools
 * config a path mapping from `/` to `src/`, which is a config change rather
 * than a typing one.
 */
declare module '/*' {
  const mod: any;
  export = mod;
}

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

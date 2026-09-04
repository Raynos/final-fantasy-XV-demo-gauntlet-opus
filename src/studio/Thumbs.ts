/**
 * Thumbnails for the model roster: baked at build time, topped up as you look.
 *
 * ## Why nothing is rendered for a thumbnail AT RUNTIME
 *
 * The obvious build is: walk 56 assets, render each into an offscreen target,
 * cache the result. That is 56 rig constructions, 56 skinned-mesh uploads and
 * 56 draws before the first tile appears — on a phone, seconds of frozen main
 * thread to decorate a list, for assets the reviewer may never open.
 *
 * So nothing is rendered *for* a thumbnail in the page. The studio already
 * draws the selected model at full size every frame; {@link Thumbs.capture}
 * copies that frame down to 128 px the moment after it is drawn.
 *
 * ## Why that was not enough, and what {@link Thumbs.seed} adds
 *
 * Capturing only what you have already staged means the list is empty the
 * first time you open it — reported from a phone as "preview images only show
 * after loading the model". The tiles are most useful in exactly the moment
 * they did not exist: choosing which of 23 enemies to open.
 *
 * The 56 renders still have to happen somewhere; they just do not have to
 * happen on the reviewer's phone. `src/tools/thumbbake.mts` does the same walk
 * once, in the daemon's browser, at build time, and writes the results to
 * `baked/thumbs.json`. `seed()` fetches that on studio boot and fills the
 * cache before anything is staged. A live `capture()` still wins over a baked
 * tile for the asset you are looking at, so an edit you have not re-baked
 * shows through the moment you open it.
 *
 * The capture has to happen **inside the render loop**, immediately after
 * `post.render()`. The renderer is created without `preserveDrawingBuffer`, so
 * the drawing buffer is only readable before the browser composites it; a
 * `drawImage` from a `setTimeout` gets a blank canvas. `StudioShell.start` owns
 * that call site for this reason.
 *
 * ## Why the cache itself is not persisted
 *
 * A 128 px JPEG is ~4 kB and the roster is 56, so a full set is ~220 kB —
 * comfortably over what is sensible to put in `localStorage`. It does not need
 * to be: the bake is served with the build and the browser's HTTP cache is
 * already the right place for a file that changes when the build does, which
 * is why `seed()` fetches `force-cache` rather than copying the payload into
 * storage of its own. The in-memory cache lives for the session.
 */

/** The long edge of a stored thumbnail, in device pixels. */
const SIZE = 128;

/**
 * Where the build-time bake lands.
 *
 * Under `baked/` rather than beside the code because that is the directory
 * vite copies into `dist/` and the deploy carries — the same path
 * `webpbake.mts` writes to, for the same reason. @see src/tools/thumbbake.mts
 */
const BAKED_URL = '/baked/thumbs.json';

/**
 * How many are kept.
 *
 * The roster is 56 today and the cap is 200, so nothing is evicted in practice
 * — it is here so that a roster that triples cannot turn a decoration into a
 * memory leak. Oldest-first, which for a review pass means the assets you have
 * moved furthest past.
 */
const CAP = 200;

export class Thumbs {
  _cache: Map<string, string>;
  _canvas: HTMLCanvasElement | null;
  /** Keys that came from the bake rather than from a frame drawn here. */
  _baked: Set<string>;
  _seeding: Promise<number> | null;

  constructor() {
    this._cache = new Map();
    this._canvas = null;
    this._baked = new Set();
    this._seeding = null;
  }

  /**
   * Fill the cache from the build-time bake. Resolves with how many landed.
   *
   * Idempotent and never throws: a missing or malformed `thumbs.json` is the
   * state every build had before this existed, and the studio works there —
   * the tiles just come in as you look, which is what `capture()` is for. A
   * bake is an optimisation, not a dependency, and a dev tree that has run
   * `pnpm run build` but not `build:full` legitimately has no file to fetch.
   *
   * Baked entries never overwrite a live capture: `capture()` is looking at
   * the current tree and the bake may be a build old.
   */
  seed(): Promise<number> {
    if (this._seeding) return this._seeding;
    this._seeding = (async () => {
      try {
        const res = await fetch(BAKED_URL, { cache: 'force-cache' });
        if (!res.ok) return 0;
        const data = await res.json() as Record<string, unknown>;
        let n = 0;
        for (const [key, src] of Object.entries(data)) {
          if (typeof src !== 'string' || !src.startsWith('data:image/')) continue;
          if (this._cache.has(key)) continue;
          this._cache.set(key, src);
          this._baked.add(key);
          n++;
        }
        return n;
      } catch {
        return 0;
      }
    })();
    return this._seeding;
  }

  /** The data URL for a key, or null if it has not been seen yet. */
  get(key: string): string | null {
    return this._cache.get(key) ?? null;
  }

  has(key: string): boolean { return this._cache.has(key); }

  /** How many of a roster are covered, for a shell that wants to say so. */
  size(): number { return this._cache.size; }

  /**
   * Copy the frame that was just drawn.
   *
   * Returns false and keeps nothing when the source canvas has no size or the
   * read is refused — a tainted or zero-area canvas throws on `toDataURL`, and
   * a thumbnail is never worth an exception in a render loop.
   */
  capture(key: string, source: HTMLCanvasElement): boolean {
    if (!key || !source || !source.width || !source.height) return false;
    this._baked.delete(key);
    if (!this._canvas) this._canvas = document.createElement('canvas');
    const c = this._canvas;
    const ratio = source.width / source.height;
    c.width = ratio >= 1 ? SIZE : Math.max(1, Math.round(SIZE * ratio));
    c.height = ratio >= 1 ? Math.max(1, Math.round(SIZE / ratio)) : SIZE;
    try {
      const ctx = c.getContext('2d');
      if (!ctx) return false;
      ctx.drawImage(source, 0, 0, c.width, c.height);
      // 0.62 rather than a PNG: these are 128 px pictures of a model on a flat
      // backdrop, and the difference is invisible at four times the bytes.
      this._cache.set(key, c.toDataURL('image/jpeg', 0.62));
    } catch {
      return false;
    }
    while (this._cache.size > CAP) {
      const oldest = this._cache.keys().next().value;
      if (oldest === undefined) break;
      this._cache.delete(oldest);
      this._baked.delete(oldest);
    }
    return true;
  }
}

/**
 * Thumbnails for the model roster, taken from the frames you already looked at.
 *
 * ## Why they are captured and not rendered
 *
 * The obvious build is: walk 56 assets, render each into an offscreen target,
 * cache the result. That is 56 rig constructions, 56 skinned-mesh uploads and
 * 56 draws before the first tile appears — on a phone, seconds of frozen main
 * thread to decorate a list, for assets the reviewer may never open.
 *
 * So nothing is rendered *for* a thumbnail. The studio already draws the
 * selected model at full size every frame; this copies that frame down to
 * 128 px the moment after it is drawn. A review pass fills the grid in as it
 * goes, which is exactly the order the tiles become useful in.
 *
 * The capture has to happen **inside the render loop**, immediately after
 * `post.render()`. The renderer is created without `preserveDrawingBuffer`, so
 * the drawing buffer is only readable before the browser composites it; a
 * `drawImage` from a `setTimeout` gets a blank canvas. `StudioShell.start` owns
 * that call site for this reason.
 *
 * ## Why they are not persisted
 *
 * A 128 px JPEG is ~4 kB and the roster is 56, so a full set is ~220 kB —
 * comfortably over what is sensible to put in `localStorage` next to the review
 * verdicts, which are the thing in there that actually matters and must not be
 * evicted to make room for pictures. They live for the session.
 */

/** The long edge of a stored thumbnail, in device pixels. */
const SIZE = 128;

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

  constructor() {
    this._cache = new Map();
    this._canvas = null;
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
    }
    return true;
  }
}

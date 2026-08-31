/**
 * Real numbers for the loading screen.
 *
 * The bar used to be a lie in two directions at once. It stepped
 * `0.05 + 0.8 * (i / order.length)` through twenty-six systems, so every system
 * was worth the same 3% whether it cost 5 ms or 950 ms — which is why the text
 * raced. And then it sat at **0.9 for the single longest phase in the boot**,
 * because shader compilation was one blocking call with nothing to report.
 *
 * Both halves are fixed by knowing something real:
 *
 *  - **Bytes.** The world arrives as a handful of big containers whose
 *    `Content-Length` the server tells us. Counting them gives "8.2 / 13.5 MB",
 *    which on a phone is the only number that matters — the download IS the
 *    wait, and a person watching a byte counter knows the difference between
 *    slow and stuck.
 *  - **Programs.** `WebGLRenderer.compile()` hands back the Set of materials it
 *    just queued, and with `KHR_parallel_shader_compile` the driver links them
 *    off-thread. So the count is knowable *and* the wait is pollable, which is
 *    exactly the shape a progress bar wants.
 *
 * This module is the shared counter the fetch sites report into. It is a leaf:
 * no imports, no DOM, safe to touch from anywhere in the boot.
 */

/** One in-flight or finished download. */
interface FileProgress {
  /** Bytes received so far. */
  loaded: number;
  /** `Content-Length`, or 0 until the response headers arrive. */
  total: number;
}

const files = new Map<string, FileProgress>();

/**
 * Declare a download and its size. Called once the response headers are in.
 * @param total `Content-Length`, or 0 if the server did not say
 */
export function noteFetchStart(path: string, total: number) {
  files.set(path, { loaded: 0, total: Math.max(0, total) });
}

/** Report cumulative bytes received for a path opened by `noteFetchStart`. */
export function noteFetchBytes(path: string, loaded: number) {
  const f = files.get(path);
  if (f) f.loaded = loaded;
}

/**
 * What to show.
 *
 * `total` counts only files whose length the server declared, so a
 * `Content-Length`-less response contributes to neither side and cannot make
 * the bar go backwards. `pending` is how many are still open, which is what
 * decides whether the download line is worth showing at all.
 */
export function bytes(): { loaded: number, total: number, pending: number } {
  let loaded = 0, total = 0, pending = 0;
  for (const f of files.values()) {
    if (!f.total) continue;
    loaded += Math.min(f.loaded, f.total);
    total += f.total;
    if (f.loaded < f.total) pending++;
  }
  return { loaded, total, pending };
}

/** `13.5 MB` / `812 KB`. One decimal past a megabyte, none below. */
export function human(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`;
}

/**
 * Read a response body to completion while reporting bytes.
 *
 * Returns the same bytes `response.arrayBuffer()` would have, so a caller
 * swaps one for the other and changes nothing else. Falls back to
 * `arrayBuffer()` whenever the body cannot be streamed — a `Content-Encoding`
 * the browser is inflating for us still streams, but a null body (a 204, a
 * cache hit served synthetically) does not.
 */
export async function readCounted(res: Response, path: string): Promise<Uint8Array> {
  const len = Number(res.headers.get('content-length') || 0);
  noteFetchStart(path, Number.isFinite(len) ? len : 0);
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    noteFetchBytes(path, len || buf.length);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    noteFetchBytes(path, got);
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

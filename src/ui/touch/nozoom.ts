/**
 * Stop the browser zooming a page that has nothing to zoom into.
 *
 * ## Why this is not just the viewport meta tag
 *
 * `index.html` carries `user-scalable=no`, and **iOS Safari has ignored it
 * since iOS 10** — deliberately, as an accessibility decision. So a phone will
 * happily double-tap-zoom and pinch-zoom this page, and every one of those
 * gestures is a bug here: a double tap on the world is two attacks, a pinch on
 * the model viewer is meant to dolly the turntable, and a page that zooms out
 * from under a thumb mid-fight is the most annoying possible failure.
 *
 * Three separate mechanisms, because they are three separate gestures:
 *
 *   - **`touch-action: manipulation`** on the root removes the browser's
 *     300 ms double-tap-to-zoom recogniser. This is the one that matters most
 *     and the only one that is declarative.
 *   - **`gesturestart` / `gesturechange` / `gestureend`** are Safari's
 *     non-standard pinch events. No CSS reaches them; they have to be
 *     cancelled.
 *   - **A second tap inside 320 ms** still slips past `touch-action` on older
 *     iOS, so it is cancelled by hand as well.
 *
 * ## Why it lives here and not in `TouchControls`
 *
 * It used to live there, and that meant it only applied **once the game had
 * booted and loaded the touch layer** — so the front door, the title screen and
 * the entire Game Studio could all be double-tap-zoomed, which is where it was
 * reported. The suppression is a property of *this page on a phone*, not of the
 * on-screen control layer, so `main.ts` installs it before anything boots and
 * `TouchControls` no longer carries a copy.
 */

let installed = false;

/** Idempotent: safe to call from more than one entry point. */
export function installNoZoom() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  document.documentElement.style.touchAction = 'manipulation';

  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e: Event) => e.preventDefault(), { passive: false });
  }

  let lastTap = 0;
  document.addEventListener('touchend', (e: TouchEvent) => {
    const now = performance.now();
    // `preventDefault` on the second tap cancels the synthetic zoom without
    // cancelling the click, which is why this is on `touchend` and not on a
    // pointer event: a pointer handler here would eat the tap itself.
    if (now - lastTap < 320) e.preventDefault();
    lastTap = now;
  }, { passive: false });
}

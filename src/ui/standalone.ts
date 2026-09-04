/**
 * Give an installed iOS web app the whole screen it was promised.
 *
 * ## The bug, measured rather than guessed
 *
 * Installed to the home screen with `apple-mobile-web-app-status-bar-style:
 * black-translucent`, iOS puts the page's ORIGIN at the top of the glass —
 * under the clock, which is the point of `black-translucent` — but sizes the
 * viewport as if it had not, at `screen height − status bar`. The page is
 * therefore correct at the top and short at the bottom by exactly the status
 * bar's height, and what shows in the deficit is the body's background.
 *
 * Measured off three device screenshots on a 402x874 pt iPhone: a **62.0 pt**
 * band of `#05060a` at the bottom of every one — the body colour, not black,
 * which is the tell that the page simply ended there. 874 − 62 = 812, and 62 pt
 * is that phone's status bar exactly. It reproduces in the tab-mode CSS too, in
 * the sense that `100dvh`, `100vh`, `100lvh` and a `position: fixed; inset: 0`
 * initial containing block ALL report the short 812: there is no CSS length on
 * that page that knows about the missing band.
 *
 * ## Why the fix is `screen`, and why it is clamped
 *
 * `screen.width/height` are the one pair iOS reports against the physical
 * panel rather than the web view, so they still say 402x874 when everything
 * else says 812. They also do **not** swap on rotation on iOS, hence the
 * max/min by orientation rather than reading `screen.height` directly.
 *
 * Everything here is guarded so that being wrong is inert:
 *
 *   - standalone only — in a tab the browser chrome is real, `innerHeight` is
 *     honest, and `100dvh` is exactly right;
 *   - only when `screen` is TALLER than the viewport, so the day iOS fixes
 *     this the correction stops applying on its own;
 *   - and only when the deficit is under {@link MAX_DEFICIT}, so a reading
 *     this code did not anticipate cannot stretch the page off the screen.
 *
 * When nothing is applied `--app-h` is left unset and the stylesheet's
 * `var(--app-h, 100dvh)` falls back to the unit that is right everywhere else.
 */

/**
 * The largest gap this will paper over, in CSS px.
 *
 * A status bar is 20–62 pt across every iPhone that has ever run this; 96 is
 * comfortably past the largest and nowhere near "the viewport is a different
 * screen", which is the reading that would be a bug rather than a chrome
 * inset.
 */
const MAX_DEFICIT = 96;

let installed = false;

/** Idempotent: safe to call from more than one entry point. */
export function installStandaloneHeight() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const mq = (q: string) => {
    try { return window.matchMedia(q).matches; } catch { return false; }
  };
  // `navigator.standalone` is the iOS-only one and the only one that is true
  // on an older iOS; the media queries cover every other installed context.
  const standalone = () => mq('(display-mode: standalone)')
    || mq('(display-mode: fullscreen)')
    || !!(navigator as unknown as { standalone?: boolean }).standalone;

  const apply = () => {
    const root = document.documentElement;
    if (!standalone()) { root.style.removeProperty('--app-h'); return; }

    const s = window.screen;
    if (!s || !s.width || !s.height) return;
    // Portrait wants the long edge, landscape the short one. iOS keeps
    // `screen.width`/`screen.height` in portrait orientation whatever the
    // device is doing, so this cannot be `s.height`.
    const portrait = mq('(orientation: portrait)') || window.innerHeight >= window.innerWidth;
    const screenH = portrait ? Math.max(s.width, s.height) : Math.min(s.width, s.height);

    const deficit = screenH - window.innerHeight;
    if (deficit > 0 && deficit <= MAX_DEFICIT) root.style.setProperty('--app-h', `${screenH}px`);
    else root.style.removeProperty('--app-h');
  };

  apply();
  // The same three the renderer listens to, for the same reason: iOS settles
  // its metrics after the event rather than before it. @see engine/Renderer.ts
  const again = () => { apply(); requestAnimationFrame(apply); };
  window.addEventListener('resize', again);
  window.addEventListener('orientationchange', again);
  window.visualViewport?.addEventListener('resize', again);
}

/**
 * What the correction decided, for the Device section to print.
 *
 * A number a person holding the phone can read beats a fix they have to take
 * on trust — this one cannot be reproduced in Chromium at all.
 */
export function standaloneHeightReport(): string {
  const set = document.documentElement.style.getPropertyValue('--app-h');
  const s = window.screen;
  const portrait = window.innerHeight >= window.innerWidth;
  const screenH = s ? (portrait ? Math.max(s.width, s.height) : Math.min(s.width, s.height)) : 0;
  const deficit = screenH - window.innerHeight;
  if (!set) return `${window.innerHeight} px, screen ${screenH} — no correction`;
  return `${set.trim()} (was ${window.innerHeight}, +${deficit} reclaimed)`;
}

import { demoActive, touchActive, renderScale, demoFps, resolveQualityTier } from '../engine/Device.ts';
import type { Game } from '../game/Game.ts';

/**
 * Device: what this build decided at boot, and the way back out of it.
 *
 * Every number here is **read from the running module**, never recomputed. A
 * report that reimplemented `isPhoneLike()` would agree with itself and
 * disagree with the page, which is the failure mode `devicecheck.mts` exists to
 * prevent at the gate — this is the same discipline on screen.
 *
 * The section earns its slot because the decisions are invisible and
 * consequential: the demo path picks the render tier, the vegetation radius,
 * the frame cap and which texture container a key lives in, and it is chosen
 * once at module evaluation from three media queries. When somebody reports
 * that the game "looks wrong on my phone", this is the screen that says which
 * build they are actually running.
 */

/** One line of the readout. */
export interface DeviceRow {
  k: string;
  v: string;
  /** Why it matters, one line. Shown under the value where there is room. */
  note?: string;
}

/** A URL that flips one decision, for the way back. */
export interface DeviceDoor {
  label: string;
  param: string;
  value: string;
  why: string;
}

const mq = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q).matches : false);

export function deviceRows(game: Game): DeviceRow[] {
  const legs = {
    touchPoints: (typeof navigator !== 'undefined' && navigator.maxTouchPoints) || 0,
    coarse: mq('(pointer: coarse)'),
    noHover: mq('(hover: none)'),
  };
  const rows: DeviceRow[] = [
    {
      k: 'build',
      v: demoActive() ? 'phone' : 'full',
      note: 'the demo path: low tier, thinner vegetation, a 30 fps cap',
    },
    {
      k: 'touch layer',
      v: touchActive() ? 'on' : 'off',
      note: 'on-screen sticks and buttons, and this shell',
    },
    { k: 'quality tier', v: resolveQualityTier() },
    { k: 'frame cap', v: `${demoActive() ? demoFps() : 60} fps` },
    { k: 'render scale', v: renderScale().toFixed(2) },
    {
      k: 'detection',
      v: `touch ${legs.touchPoints} · coarse ${legs.coarse ? 'yes' : 'no'} · hover ${legs.noHover ? 'none' : 'yes'}`,
      note: 'all three must hold; no user-agent sniffing anywhere',
    },
    {
      k: 'viewport',
      v: `${window.innerWidth}x${window.innerHeight} @ ${(window.devicePixelRatio || 1).toFixed(1)}x`,
    },
    { k: 'systems booted', v: String(game.systems.length) },
  ];

  /*
   * Whether the browser's own chrome is on screen, and what to do about it.
   *
   * A landscape iPhone spends about a quarter of its short edge on the address
   * bar, and **nothing a page can do reclaims it in a tab**: iPhone Safari does
   * not implement the Fullscreen API, and the toolbar only auto-hides on a page
   * that scrolls, which a game must not. Installed to the home screen there is
   * no chrome at all, and `display-mode: standalone` is how the page knows
   * which of the two it is in — so this row is a readout when it is already
   * fullscreen, and an instruction when it is not.
   */
  const standalone = mq('(display-mode: standalone)')
    || mq('(display-mode: fullscreen)')
    || !!(navigator as unknown as { standalone?: boolean }).standalone;
  rows.push({
    k: 'display',
    v: standalone ? 'fullscreen — installed' : 'in a browser tab',
    note: standalone
      ? 'no browser chrome; the whole screen is the game'
      : 'Share → Add to Home Screen for the full screen. Safari keeps the address bar in a tab and no page can hide it.',
  });

  const r = game.renderer;
  if (r && r.info) {
    rows.push({
      k: 'scene',
      v: `${r.info.render.calls} calls · ${(r.info.render.triangles / 1e6).toFixed(2)}M tris`,
      note: 'last frame drawn by the studio, not by the game',
    });
    rows.push({ k: 'resident', v: `${r.info.memory.geometries} geo · ${r.info.memory.textures} tex` });
  }
  return rows;
}

/**
 * The documented ways back.
 *
 * Every one of these is a URL flag that already existed and was only written
 * down in a source comment — which is to say, was reachable by nobody holding
 * the phone. `demo=0` in particular is the *only* way off the phone build once
 * detection has chosen it, and `Device.ts`'s own docblock says so.
 */
export const DOORS: DeviceDoor[] = [
  { label: 'Full build', param: 'demo', value: '0', why: 'the desktop world, on this device' },
  { label: 'Phone build', param: 'demo', value: '1', why: 'the handset cut, on any device' },
  { label: 'No touch layer', param: 'touch', value: '0', why: 'for a paired controller' },
  { label: 'Touch layer', param: 'touch', value: '1', why: 'to see the thumb layout on a desktop' },
  { label: 'Ultra quality', param: 'q', value: 'ultra', why: 'the tier the corpus is shot at' },
  { label: 'Full stats', param: 'stats', value: 'full', why: 'the graph and the six-row readout' },
];

/** Where a door leads: this page, with one parameter set. */
export function doorHref(d: DeviceDoor): string {
  const u = new URL(location.href);
  u.searchParams.set(d.param, d.value);
  return u.toString();
}

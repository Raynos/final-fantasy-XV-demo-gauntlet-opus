import { svg } from './UIKit.ts';

/**
 * Procedural inline-SVG icon set.
 *
 * Everything is drawn as strokes inside a 24x24 box at a single nominal weight
 * (1.15 user units) so a weapon icon, a status icon and a menu icon all read
 * with identical visual density. Fills are used only for small solid accents.
 */

const D = {
  // --- weapons ---------------------------------------------------------
  sword: 'M6.2 17.8 17 7M14.6 4.6 19.4 9.4M14.6 4.6 19.4 9.4 17.9 10.9 13.1 6.1ZM7.6 16.4 4.4 19.6M5.2 15.6 8.4 18.8',
  greatsword: 'M5.6 18.4 16.4 7.6M12.6 3.4 20.6 11.4 18 14 10 6ZM7.4 16.6 3.2 20.8M4.6 13.8 10.2 19.4',
  lance: 'M4 20 17.5 6.5M15 4 20 9 17.6 11.4 12.6 6.4ZM8.6 15.4 11.2 18M6 12.8 5 19 11.2 18',
  daggers: 'M4.4 19.6 12 12M9.6 4.4 14.4 9.2 12 11.6 7.2 6.8ZM19.6 19.6 12.4 12.4M14.4 4.4 9.6 9.2M6.6 17.4 3.4 20.6M17.4 17.4 20.6 20.6',
  firearm: 'M3.5 9.5h13l3 3.4h1.8V9.9M6 9.5v4.2h5.2l1.5 3.4h3l-1.2-3.4M8.4 13.7l-2.6 4.9M3.5 9.5V7.2h4.2',
  shield: 'M12 3.2 4.8 6v6.2c0 4 3 6.9 7.2 8.6 4.2-1.7 7.2-4.6 7.2-8.6V6ZM12 6.6v11',
  machinery: 'M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8ZM12 2.6v3.4M12 18v3.4M4.2 7.4l2.9 1.7M16.9 15l2.9 1.7M4.2 16.7l2.9-1.7M16.9 9.1l2.9-1.7',

  // --- magic / elements ------------------------------------------------
  fire: 'M12 21.2c3.3 0 5.6-2.2 5.6-5.2 0-3.9-3.6-5.6-3.2-9.4-2.1.9-3.4 2.6-3.4 4.4 0 1.4.7 2.2.7 3.1 0 .8-.6 1.4-1.4 1.4-1 0-1.6-.9-1.6-2.3-1.4 1.2-2.3 2.9-2.3 4.7 0 3 2.3 5.3 5.6 5.3Z',
  ice: 'M12 2.8v18.4M4 7.4l16 9.2M20 7.4 4 16.6M12 6.2 9.8 4M12 6.2 14.2 4M12 17.8 9.8 20M12 17.8 14.2 20',
  lightning: 'M13.6 2.6 6.4 13.2h4.3l-1.1 8.2 8.1-11H13l.6-7.8Z',
  potion: 'M10 3h4M11 3v4.4L7.4 15a3.6 3.6 0 0 0 3.2 5.4h2.8A3.6 3.6 0 0 0 16.6 15L13 7.4V3M8.6 13.6h6.8',

  // --- status ----------------------------------------------------------
  haste: 'M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2ZM12 7.4V12l3.2 2M3.6 6.4h4M2.6 10h3.4',
  poison: 'M9 3.4h6M10.2 3.4v3.6L6.8 14a4.4 4.4 0 0 0 3.9 6.5h2.6a4.4 4.4 0 0 0 3.9-6.5l-3.4-7V3.4M10.4 12.6h3.2M11.2 16.2h1.6',
  shieldUp: 'M12 3.2 5.4 5.8v5.6c0 3.7 2.7 6.4 6.6 8 3.9-1.6 6.6-4.3 6.6-8V5.8ZM9 11.6 12 8.6l3 3M12 8.8v6',
  swordUp: 'M7 16.6 15.4 8.2M13.6 5.6l4.8 4.8M13.6 5.6l4.8 4.8-1.4 1.4-4.8-4.8ZM8 15.6 4.6 19M6 13.6l4 4M3.2 8.6l2.6-2.6 2.6 2.6',
  regen: 'M12 20.6c-4.6-2.6-7-5.6-7-9a4 4 0 0 1 7-2.6 4 4 0 0 1 7 2.6c0 3.4-2.4 6.4-7 9ZM18.6 3.6v4M16.6 5.6h4',

  // --- menu ------------------------------------------------------------
  items: 'M4.4 8.2 12 4.2l7.6 4v7.6L12 19.8l-7.6-4ZM4.4 8.2 12 12.2l7.6-4M12 12.2v7.6',
  ascension: 'M12 3.4 12 8M12 16v4.6M4.6 7.6 8.6 9.9M15.4 14.1l4 2.3M4.6 16.4l4-2.3M15.4 9.9l4-2.3M12 9.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8ZM12 2a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 12 2ZM3.4 6.2a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2ZM20.6 14.6a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z',
  armiger: 'M12 2.6 6.4 12l5.6 9.4L17.6 12ZM6.4 12h11.2M12 2.6v18.8M3.4 12h2M18.6 12h2',
  gear: 'M6.6 20.4V9.6L12 3.6l5.4 6v10.8ZM6.6 9.6h10.8M12 3.6v16.8M9 13.4h6',
  map: 'M3.4 6.6 9 4.2v13.2l-5.6 2.4ZM9 4.2l6 2.4v13.2L9 17.4M15 6.6l5.6-2.4v13.2L15 19.8',
  quests: 'M6 3.6h9.4l3.6 3.6v13.2H6ZM15.4 3.6v3.6H19M8.8 11h6.4M8.8 14.4h6.4M8.8 17.8h4',
  archives: 'M5 4.6h5c1.2 0 2 .8 2 2v13c0-1.2-.8-2-2-2H5ZM19 4.6h-5c-1.2 0-2 .8-2 2v13c0-1.2.8-2 2-2h5Z',
  system: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM12 2.8v2.6M12 18.6v2.6M4.5 7.4l2.3 1.3M17.2 15.3l2.3 1.3M4.5 16.6l2.3-1.3M17.2 8.7l2.3-1.3',
  camera: 'M3.4 8.2h4l1.6-2.4h6l1.6 2.4h4v11H3.4ZM12 9.6a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z',
  compassPin: 'M12 2.6 15 12l-3 9.4L9 12Z',
  ap: 'M12 2.8 14.6 9l6.6.6-5 4.3 1.5 6.4L12 16.9l-5.7 3.4 1.5-6.4-5-4.3L9.4 9Z',
};

/** Two-tone accent shapes drawn on top of some icons. */
const ACCENT = {
  fire: 'M12 21.2c1.7 0 2.9-1.2 2.9-2.8 0-1.9-1.9-2.9-1.7-4.9-1.4.7-2.1 1.7-2.1 2.9 0 1.4 1.1 1.9 1.1 3 0 .9-.6 1.5-1.4 1.5Z',
};

/**
 * @param name key from the icon table
 * @param [opts] `{ size, stroke, cls, fill }`
 */
export function icon(name: string, opts: any = {}): SVGElement {
  const { size = 20, stroke = 1.15, cls = '', fill = 'none' } = opts;
  const d = D[name as keyof typeof D] || D.items;
  const root = svg('svg', {
    class: `ico ${cls}`.trim(),
    viewBox: '0 0 24 24', width: size, height: size,
    fill: 'none', stroke: 'currentColor',
    'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'vector-effect': 'non-scaling-stroke', 'aria-hidden': 'true',
  }, [svg('path', { d, fill })]);
  if (ACCENT[name as keyof typeof ACCENT]) root.appendChild(svg('path', { d: ACCENT[name as keyof typeof ACCENT], fill: 'currentColor', opacity: 0.35, stroke: 'none' }));
  return root;
}

/**
 * A controller / key prompt glyph — a rounded square or circle carrying a
 * short label, matched in weight to `icon()`.
 * @param label e.g. 'A', 'B', 'Y', 'X', 'LB', 'Esc'
 * @param [opts] `{ size, shape: 'round'|'square', tone }`
 */
export function button(label: string, opts: any = {}) {
  const { size = 18, shape = label.length > 1 ? 'square' : 'round', tone = '' } = opts;
  const root = svg('svg', {
    class: `btn-glyph ${tone}`.trim(), viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true',
  });
  if (shape === 'round') {
    root.appendChild(svg('circle', { cx: 12, cy: 12, r: 9.4, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3, opacity: 0.9 }));
  } else {
    root.appendChild(svg('rect', { x: 2.2, y: 5.4, width: 19.6, height: 13.2, rx: 3.2, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3, opacity: 0.9 }));
  }
  root.appendChild(svg('text', {
    x: 12, y: 12, 'text-anchor': 'middle', 'dominant-baseline': 'central',
    'font-size': label.length > 2 ? 7.4 : label.length > 1 ? 8.6 : 10.4,
    'font-family': 'inherit', 'font-weight': 500, 'letter-spacing': label.length > 1 ? 0.2 : 0,
    fill: 'currentColor',
  }, [label]));
  return root;
}

/** A directional-pad glyph with one direction highlighted. */
export function dpad(dir = 'up', size = 18) {
  const on = { up: 0, right: 1, down: 2, left: 3 }[dir] ?? 0;
  const root = svg('svg', { class: 'btn-glyph', viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true' });
  const arms = [
    'M9.4 2.6h5.2v6.8H9.4Z', 'M14.6 9.4h6.8v5.2h-6.8Z',
    'M9.4 14.6h5.2v6.8H9.4Z', 'M2.6 9.4h6.8v5.2H2.6Z',
  ];
  arms.forEach((d, i) => root.appendChild(svg('path', {
    d, fill: i === on ? 'currentColor' : 'none', stroke: 'currentColor',
    'stroke-width': 1.2, opacity: i === on ? 1 : 0.42, 'stroke-linejoin': 'round',
  })));
  return root;
}

let _pfId = 0;

/**
 * Procedural bust portrait for a party plate — a lit silhouette on a tinted
 * gradient with a raking highlight. Stylised rather than literal, which reads
 * cleanly at 38px and still holds up at 110px in the menu.
 * @param seedHue base hue for the character
 * @param [tone] 0..1 backing lightness
 */
export function portrait(seedHue: number, tone: number = 0.5) {
  const id = `pf${_pfId++}`;
  const root = svg('svg', {
    class: 'pf', viewBox: '0 0 48 56', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true',
  });
  const bust = 'M24 9.4a8.7 9.7 0 0 1 8.7 9.7 8.7 9.7 0 0 1-8.7 9.7 8.7 9.7 0 0 1-8.7-9.7A8.7 9.7 0 0 1 24 9.4Z'
    + 'M19.7 26.6h8.6v4.7c0 1.1 1.3 1.7 3.6 2.4C38.6 35.6 43.4 40.6 44.6 56H3.4c1.2-15.4 6-20.4 12.7-22.3'
    + 'c2.3-.7 3.6-1.3 3.6-2.4Z';
  root.appendChild(svg('defs', {}, [
    svg('linearGradient', { id: `${id}b`, x1: 0.1, y1: 0, x2: 0.9, y2: 1 }, [
      // Near-monochrome on purpose. At HUD size these are 38 px chips, but the
      // pause menu blows them up to 112x132 and at 26-30% saturation the four
      // of them read as an orange/purple/olive colour swatch strip — nothing
      // like FFXV's portrait cards, which are almost grey with a breath of the
      // character's colour in the shadow.
      svg('stop', { offset: 0, 'stop-color': `hsl(${seedHue} 11% ${28 + tone * 15}%)` }),
      svg('stop', { offset: 0.55, 'stop-color': `hsl(${seedHue + 8} 9% ${13 + tone * 7}%)` }),
      svg('stop', { offset: 1, 'stop-color': `hsl(${seedHue + 18} 8% 6%)` }),
    ]),
    svg('linearGradient', { id: `${id}f`, x1: 0.15, y1: 0, x2: 0.95, y2: 0.9 }, [
      svg('stop', { offset: 0, 'stop-color': 'rgba(16,22,34,.30)' }),
      svg('stop', { offset: 0.45, 'stop-color': 'rgba(8,12,20,.86)' }),
      svg('stop', { offset: 1, 'stop-color': 'rgba(4,7,12,.96)' }),
    ]),
    // rim light falls off fast so only the lit edge catches — a full outline
    // would read as a placeholder avatar glyph
    svg('linearGradient', { id: `${id}r`, x1: 0.05, y1: 0, x2: 0.62, y2: 0.55 }, [
      svg('stop', { offset: 0, 'stop-color': 'rgba(232,244,255,.95)' }),
      svg('stop', { offset: 0.26, 'stop-color': 'rgba(168,200,240,.34)' }),
      svg('stop', { offset: 0.52, 'stop-color': 'rgba(120,150,196,0)' }),
    ]),
  ]));
  root.appendChild(svg('rect', { width: 48, height: 56, fill: `url(#${id}b)` }));
  root.appendChild(svg('path', { d: 'M-10 56 26 -6 40 -6 4 56Z', fill: 'rgba(198,226,255,.10)' }));
  // the bust is over-scaled and pushed right so the frame crops it like art
  const g = svg('g', { transform: 'translate(-5 -7) scale(1.45)' });
  g.appendChild(svg('path', { d: bust, fill: `url(#${id}f)` }));
  g.appendChild(svg('path', { d: bust, fill: 'none', stroke: `url(#${id}r)`, 'stroke-width': 1.3 }));
  root.appendChild(g);
  root.appendChild(svg('rect', { width: 48, height: 20, y: 36, fill: `url(#${id}v)` }));
  root.appendChild(svg('rect', { width: 48, height: 56, fill: 'none', stroke: 'rgba(190,214,248,.24)', 'stroke-width': 1.2 }));
  root.querySelector('defs').appendChild(svg('linearGradient', { id: `${id}v`, x1: 0, y1: 0, x2: 0, y2: 1 }, [
    svg('stop', { offset: 0, 'stop-color': 'rgba(3,6,11,0)' }),
    svg('stop', { offset: 1, 'stop-color': 'rgba(3,6,11,.72)' }),
  ]));
  return root;
}

export const ICON_NAMES = Object.keys(D);

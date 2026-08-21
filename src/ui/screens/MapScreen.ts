import { WorldMapScreen } from './WorldMapScreen.ts';

/**
 * The `map` menu slot.
 *
 * There is only one chart of Lucis, and this is it. The slot used to carry a
 * stylised blob with hand-placed pins that agreed with nothing else in the
 * game; it now shows the same atlas as the `world` slot — the real
 * heightfield, the real road graph, the real nineteen regions and the real
 * 124 points of interest — so whichever way the player opens the map, they get
 * the map.
 *
 * See `WorldMapScreen` for everything it does. This subclass exists only so
 * `Menus` can keep both registration names alive.
 */
export class MapScreen extends WorldMapScreen {
  constructor(menus: import('../Menus.ts').Menus) {
    super(menus);
    this.sub = 'Lucis  ·  scale 1 : 240 000';
  }
}

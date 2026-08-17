/**
 * Cartography facade.
 *
 * The chart used to be one file; it is now four, split along the lines the
 * work actually divides on:
 *
 *   `Chart.js`      bakes the relief image out of the terrain heightfield
 *   `MapDraw.js`    roads, region borders, letterspaced type, label collision
 *   `MapGlyphs.js`  one procedural glyph per point-of-interest type
 *   `FogOfWar.js`   the shared survey mask and its parchment haze
 *
 * This module keeps the old import path working and is the one place to look
 * for what the map layer exposes.
 */

export { Chart, bakeChart, getChart } from './Chart.js';
export {
  ROAD_STYLE, drawRoads, drawJunctions, zoneBorders, drawZoneBorders,
  spacedText, spacedWidth, LabelPlacer,
} from './MapDraw.js';
export { GLYPH, POI_GLYPH, drawGlyph, glyphSvg } from './MapGlyphs.js';
export { FogOfWar, fog } from './FogOfWar.js';

import { getChart as _getChart } from './Chart.js';

/**
 * @deprecated use {@link getChart}. Kept because the capture harness and older
 * callers ask for the raster by this name.
 */
export function drawWorldRaster(terrain, opt) { return _getChart(terrain, opt); }

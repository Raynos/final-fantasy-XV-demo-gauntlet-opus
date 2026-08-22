import { worldMap, WORLD } from './WorldMap.ts';
import { routeClass } from './MapDraw.ts';

/**
 * FOG OF WAR — the unsurveyed country.
 *
 * One shared mask, owned here rather than by the minimap, so the minimap, the
 * world-map screen and anything else that draws a chart all agree about what
 * the player has actually seen.
 *
 * It is deliberately *not* black. Unexplored Lucis is drawn as a pale
 * parchment haze at partial opacity: the landforms stay faintly legible the
 * way an old survey sheet shows country nobody has walked, and the explored
 * ground reads as the part of the map that has been *inked in*. Black holes in
 * a map look like a bug; a haze looks like a map.
 *
 * The haze is composited once into a sheet canvas and blitted with the same
 * transform as the chart, so the per-frame cost is a single `drawImage` no
 * matter how much of the world is hidden.
 */

const CELLS = 128;                 // 64 m per cell over the 8192 m field
const SHEET = 512;                 // 16 m per sheet pixel
const BLUR = 1.3;                  // sheet px — a 21 m edge, crisp on purpose

export class FogOfWar {
  _sheet!: any;
  _ctx!: CanvasRenderingContext2D | null;
  _dirty!: boolean;
  _maskCanvas!: HTMLCanvasElement;
  _maskCtx!: any;
  _maskImg!: any;
  _parchment!: any;
  cell!: number;
  mask!: Uint8Array;
  n!: number;
  constructor(n = CELLS) {
    this.n = n;
    this.cell = WORLD.size / n;
    /** 0 = unsurveyed, 255 = walked. */
    this.mask = new Uint8Array(n * n);
    this._dirty = true;
    this._sheet = null;
  }

  /** Reveal every cell whose centre is within `r` metres of (x, z). */
  reveal(x: any, z: any, r: number) {
    const c = this.cell, n = this.n;
    const i0 = Math.max(0, Math.floor((x - r + WORLD.half) / c));
    const i1 = Math.min(n - 1, Math.ceil((x + r + WORLD.half) / c));
    const j0 = Math.max(0, Math.floor((z - r + WORLD.half) / c));
    const j1 = Math.min(n - 1, Math.ceil((z + r + WORLD.half) / c));
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) {
      const pz = -WORLD.half + (j + 0.5) * c;
      for (let i = i0; i <= i1; i++) {
        const px = -WORLD.half + (i + 0.5) * c;
        const dx = px - x, dz = pz - z;
        if (dx * dx + dz * dz <= r2 && !this.mask[j * n + i]) {
          this.mask[j * n + i] = 255;
          this._dirty = true;
        }
      }
    }
  }

  /** Reveal the whole continent (used by the capture harness). */
  revealAll() { this.mask.fill(255); this._dirty = true; }

  /**
   * Survey the road network.
   *
   * Lucis has roads and Lucis has road signs: the country a highway crosses is
   * charted whether or not this particular royal party has driven it. Calling
   * this once at boot is also what stops the map opening as a blank sheet —
   * the player gets the skeleton of the continent and fills in the wilderness
   * between the roads by walking it, which is the shape the reveal should have.
   * @param [r] corridor half-width, metres
   */
  revealRoads(r: number = 260) {
    for (const route of worldMap.roadGraph.routes) {
      if (routeClass(route) === 'trail') continue;
      const pts = route.pts;
      const step = Math.max(1, Math.floor(r / 12));
      for (let i = 0; i < pts.length; i += step) this.reveal(pts[i].x, pts[i].z, r);
      const last = pts[pts.length - 1];
      if (last) this.reveal(last.x, last.z, r);
    }
  }

  /** 0..1 how surveyed the cell containing this point is. */
  at(x: any, z: any) {
    const n = this.n;
    let i = Math.floor((x + WORLD.half) / this.cell);
    let j = Math.floor((z + WORLD.half) / this.cell);
    i = i < 0 ? 0 : i > n - 1 ? n - 1 : i;
    j = j < 0 ? 0 : j > n - 1 ? n - 1 : j;
    return this.mask[j * n + i] / 255;
  }

  /**
   * The haze sheet, rebuilt only when the mask has changed.
   */
  sheet(): {canvas: HTMLCanvasElement, ppm: number, toPx: (x: number) => number, toPz: (z: number) => number} {
    if (!this._sheet) this._build();
    if (this._dirty) this._paint();
    return this._sheet;
  }

  _build() {
    const n = this.n;
    this._maskCanvas = document.createElement('canvas');
    this._maskCanvas.width = n;
    this._maskCanvas.height = n;
    this._maskCtx = this._maskCanvas.getContext('2d');
    this._maskImg = this._maskCtx.createImageData(n, n);

    const canvas = document.createElement('canvas');
    canvas.width = SHEET;
    canvas.height = SHEET;
    this._ctx = canvas.getContext('2d');
    const ppm = SHEET / WORLD.size;
    this._sheet = {
      canvas,
      ppm,
      toPx: (x: any) => (x + WORLD.half) * ppm,
      toPz: (z: any) => (z + WORLD.half) * ppm,
    };
    this._parchment = this._ctx!.createPattern(parchmentTile(), 'repeat');
  }

  _paint() {
    this._dirty = false;
    const n = this.n, d = this._maskImg.data;
    for (let i = 0; i < n * n; i++) {
      const o = i * 4;
      d[o] = 255; d[o + 1] = 255; d[o + 2] = 255;
      d[o + 3] = 255 - this.mask[i];
    }
    this._maskCtx.putImageData(this._maskImg, 0, 0);

    const c = this._ctx;
    c!.setTransform(1, 0, 0, 1, 0, 0);
    c!.globalCompositeOperation = 'source-over';
    c!.clearRect(0, 0, SHEET, SHEET);
    c!.imageSmoothingEnabled = true;
    c!.imageSmoothingQuality = 'high';
    c!.filter = `blur(${BLUR}px)`;
    c!.drawImage(this._maskCanvas, 0, 0, SHEET, SHEET);
    c!.filter = 'none';
    // paint the haze through the mask
    c!.globalCompositeOperation = 'source-in';
    c!.fillStyle = this._parchment;
    c!.fillRect(0, 0, SHEET, SHEET);
    c!.globalCompositeOperation = 'source-over';
  }
}

/**
 * The haze itself.
 *
 * A cool blue-slate wash with a fine grain and a slack diagonal hatch. It goes
 * *under* the value of the chart rather than over it: unsurveyed Lucis reads as
 * country seen at dusk from a long way off — the landforms still there, the
 * colour gone out of them — while the surveyed corridors keep their warmth and
 * carry the labels. A pale wash was tried first and read as a washed-out map
 * rather than a deliberate one.
 * @returns a 128 px seamless tile
 */
function parchmentTile(): HTMLCanvasElement {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const c = cv.getContext('2d');
  const img = c!.createImageData(S, S);
  const d = img.data;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const o = (j * S + i) * 4;
      // two octaves of value noise, wrapped so the tile is seamless
      const nz = 0.6 * vnoise(i, j, 16, S) + 0.4 * vnoise(i, j, 4, S);
      const hatch = 0.5 + 0.5 * Math.sin((i + j) * (Math.PI * 2 * 32 / S));
      const k = 0.80 + 0.24 * nz + 0.14 * hatch;
      d[o] = 48 * k;
      d[o + 1] = 57 * k;
      d[o + 2] = 70 * k;
      d[o + 3] = 178;
    }
  }
  c!.putImageData(img, 0, 0);
  return cv;
}

/** Wrapping value noise on a `p`-cell lattice over an `S` px tile. */
function vnoise(x: number, y: number, p: number, S: number) {
  const cell = S / p;
  const fx = x / cell, fy = y / cell;
  const i0 = Math.floor(fx), j0 = Math.floor(fy);
  const tx = fx - i0, ty = fy - j0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const h = (a: number, b: number) => {
    let n = Math.imul(((a % p) + p) % p, 0x27d4eb2d) ^ Math.imul(((b % p) + p) % p, 0x165667b1);
    n = Math.imul(n ^ (n >>> 15), 0x2545f491);
    return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
  };
  const a = h(i0, j0), b = h(i0 + 1, j0), cc = h(i0, j0 + 1), dd = h(i0 + 1, j0 + 1);
  return (a + (b - a) * sx) * (1 - sy) + (cc + (dd - cc) * sx) * sy;
}

/** The shared fog. Import this; do not construct your own. */
export const fog = new FogOfWar();
export default fog;

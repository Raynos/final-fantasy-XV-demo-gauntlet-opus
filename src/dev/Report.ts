/**
 * Everything a review note carries besides the prose.
 *
 * The rule from every studio bug-reporter postmortem: **the human should type
 * only the sentence.** Anything the machine can know, the machine records —
 * because the field that actually decides whether a report is actionable six
 * weeks later is never the prose, it is the build id and the repro state.
 *
 * This project has a structural advantage worth exploiting: the world is fully
 * procedural and seeded, so seed + camera + shot *is* the repro. In an
 * asset-heavy engine "put me back exactly where the reporter was" is close to
 * impossible; here it is a teleport and a re-seed. That is what makes
 * `review.restore` cheap and it is the whole reason to capture this much.
 */

import { worldMap } from '../world/map/WorldMap.ts';
import type { Game } from '../game/Game.ts';
import type { CvarDelta } from './Registry.ts';

/**
 * Grab the rendered frame as a PNG data URI.
 *
 * Works at any time because `Renderer` sets `preserveDrawingBuffer: true`, and
 * the composer's final pass renders to the visible canvas — so this is the
 * fully graded, tone-mapped, post-processed image, not the raw scene.
 *
 * **Known limitation, stated rather than hidden:** the HUD and menus are DOM,
 * not canvas, so they are *not* in this image. The note records their state
 * instead. Anyone reading a note with `hud.visible: true` and no HUD in the PNG
 * should know why.
 *
 * @returns `data:image/png;base64,...`
 */
export function capture(game: Game): string | null {
  try {
    return game.renderer.domElement.toDataURL('image/png');
  } catch (err) {
    console.warn('[dev] capture failed', err);
    return null;
  }
}

const r1 = (n: number) => Number(Number(n).toFixed(1));
const r3 = (n: number) => Number(Number(n).toFixed(3));

/**
 * The metadata block that rides along with every review note.
 *
 * The five optional fields are the ones that need a system to be present:
 * a note filed from a partial world still has coordinates, a camera and the
 * cvar deltas, which is what makes it routable.
 */
export interface ReviewNote {
  at: string;
  seed: number;
  shot: string | null;
  state: string;
  paused: boolean;
  camera: { pos: number[], quat: number[], fov: number };
  /** Every cvar that differs from its boot value. */
  cvars: Record<string, CvarDelta>;
  /** The last sixteen console lines typed. */
  commands: string[];
  perf: {
    fps: number,
    frame: number,
    calls: number | null,
    triangles: number | null,
    geometries: number | null,
    textures: number | null,
    programs: number | null,
  };
  ui: { hud: boolean | null, menu: string | null };
  client: { ua: string, dpr: number, canvas: number[], gpu: string | null };
  /** World position, when a `Player` exists. */
  player?: number[];
  /** Hours, 0..24. */
  time?: number;
  weather?: string | null;
  zone?: string | null;
  region?: string | null;
  poi?: string | null;
  [extra: string]: unknown;
}

/**
 * Assemble the metadata block.
 */
export function gather(game: Game, reg: import('./Registry.ts').Registry, extra: Record<string, unknown> = {}): ReviewNote {
  const cam = game.camera;
  const player = game.get('Player');
  const sky = game.get('Sky');
  const weather = game.get('Weather');
  const hud = game.get('HUD');
  const menus = game.get('Menus');
  const info = game.renderer && game.renderer.info;

  const note: ReviewNote = {
    at: new Date().toISOString(),
    seed: game.seed,
    shot: game.currentShot || null,
    state: game.state,
    paused: !!game.paused,

    camera: {
      pos: [r1(cam.position.x), r1(cam.position.y), r1(cam.position.z)],
      quat: [r3(cam.quaternion.x), r3(cam.quaternion.y), r3(cam.quaternion.z), r3(cam.quaternion.w)],
      fov: r1(cam.fov),
    },

    // Every cvar differing from its boot value. A note filed from a tampered
    // state is not worthless, but it must never be mistaken for a clean one.
    cvars: reg ? reg.deltas() : {},
    commands: reg ? reg.history.slice(-16) : [],

    perf: {
      fps: r1(game.time.fps || 0),
      frame: game.time.frame,
      calls: info ? info.render.calls : null,
      triangles: info ? info.render.triangles : null,
      geometries: info ? info.memory.geometries : null,
      textures: info ? info.memory.textures : null,
      programs: info && info.programs ? info.programs.length : null,
    },

    ui: {
      hud: hud ? !!hud.visible : null,
      menu: menus ? (menus.name || null) : null,
    },

    client: {
      ua: navigator.userAgent,
      dpr: window.devicePixelRatio,
      canvas: [game.renderer.domElement.width, game.renderer.domElement.height],
      gpu: gpuString(game),
    },
    ...extra,
  };

  if (player && player.position) {
    note.player = [r1(player.position.x), r1(player.position.y), r1(player.position.z)];
  }
  if (sky) note.time = r3(sky.hours);
  if (weather) note.weather = weather.name || null;

  // Zone/POI naming turns "somewhere at (-2564, 1966)" into "Cape Caem", which
  // is the difference between a note an agent can route and one it cannot.
  // Import the cartography singleton rather than digging for it through a
  // system: no system actually exposes it, so the dug-for version silently
  // produced notes with no zone at all.
  try {
    const p = note.player || note.camera.pos;
    const zone = worldMap.zoneAt(p[0], p[2]);
    const region = worldMap.regionAt(p[0], p[2]);
    const poi = worldMap.nearestPOI(p[0], p[2], { maxDist: 400 });
    // `id` is always present on both, so the `|| .name` arms these carried
    // could never run.
    note.zone = zone ? zone.id : null;
    note.region = region ? region.id : null;
    // `nearestPOI` returns `{ poi, dist }`; the `poi.id` arm this used to try
    // first has never existed on that wrapper.
    note.poi = poi ? poi.poi.id : null;
  } catch { /* cartography unavailable; the coordinates still are */ }

  return note;
}

/** Unmasked GPU string — worth having when a report is about a visual artefact. */
function gpuString(game: Game) {
  try {
    const gl = game.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
  } catch { return null; }
}

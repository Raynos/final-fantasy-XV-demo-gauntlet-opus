import * as THREE from 'three';
import { worldMap } from '../../world/map/WorldMap.ts';
import type { Game } from '../Game.ts';
import type { ChocoboSystem } from './ChocoboSystem.ts';

/**
 * Chocobo racing: three authored checkpoint courses.
 *
 * ### Why the checkpoints are not `Triggers`
 * The cold-start brief already answered this and it is worth keeping written
 * down: `Triggers` fires `place` events off the `PLACES` table in
 * `story/Chapters.ts`, which resolves against the world's site list and is the
 * story layer's property. Eighteen checkpoints across three courses would put
 * eighteen rows of racing furniture into the table the chapter script reads,
 * for a radius test this file can do in four lines. A race also needs its
 * checkpoints *ordered* and *re-armed* every run, and `Trigger.once` is the
 * opposite of that.
 *
 * ### Why the course is authored as offsets, then legalised at the start line
 * A checkpoint is a hand-placed number in a world whose terrain is generated,
 * and a gate that lands inside a cliff is a course nobody can finish. Every
 * checkpoint is therefore resolved through `ChocoboSystem.canStandAt` when the
 * race starts, with a short outward spiral search if the authored spot is
 * water or steeper than the 50° a walker will stand on. The search is bounded
 * and it is deterministic — the same seed of terrain gives the same course
 * every run — so a capture of a race is still reproducible.
 */

/** One gate: where it is relative to its hub's POI, and how wide it is. */
export interface Checkpoint {
  dx: number;
  dz: number;
  /** Metres from the centre that count as through the gate. */
  r: number;
}

export interface RaceCourse {
  id: string;
  /** `HubDef.key` — which board it is posted on. */
  hub: string;
  name: string;
  blurb: string;
  checkpoints: Checkpoint[];
  /** Entry fee, gil. */
  entry: number;
  /** Base purse, doubled by beating par. */
  prizeGil: number;
  /** AP paid on any finish, +50% for beating par. */
  prizeAp: number;
  /** The time to beat, seconds. */
  par: number;
  /** DNF after this many seconds. */
  limit: number;
}

/**
 * The three courses.
 *
 * ### Par is measured, not guessed
 * The first pass set par "a little over the straight-line time at cruise",
 * which was wrong by nearly a factor of two, because a racing bird is not
 * cruising: it opens on the burst and drops to 11.0 only when the tank is
 * empty. `chocoborace.mts`'s autopilot — perfect line, sprint held from the
 * gun, every gate cut at its radius — ran the paddock course in **21.75 s
 * against a par of 44**, so the purse's beat-par bonus was not a bonus, it was
 * the price. Par is now set about 15% over the measured perfect lap, which is
 * a bar a good rider clears and a wandering one does not.
 *
 * The measured decomposition, for whoever re-authors a course: the tank is
 * `STAMINA_MAX * tier * ascension` seconds of `CHOCOBO_SPRINT * sprintMul`,
 * then it is 11.0 m/s until the rider stops asking. Gate radius is cut off
 * every leg, so the *ridden* length of a course is roughly its centre-to-centre
 * length minus `r` per gate.
 */
export const RACES: RaceCourse[] = [
  {
    id: 'race_paddock', hub: 'wiz', name: 'The Paddock Sprint',
    blurb: 'Four gates around the training rings. Wiz starts every new rider on it.',
    checkpoints: [
      { dx: 78, dz: 62, r: 9 },
      { dx: 150, dz: 8, r: 9 },
      { dx: 96, dz: -68, r: 9 },
      { dx: 6, dz: -24, r: 10 },
    ],
    // 348 m centre-to-centre, ~310 m ridden; measured perfect lap 21.75 s.
    entry: 100, prizeGil: 900, prizeAp: 4, par: 25, limit: 110,
  },
  {
    id: 'race_weaverwilds', hub: 'wiz', name: 'Weaverwilds Circuit',
    blurb: 'Six gates out across the open grass and back. A real lap.',
    checkpoints: [
      { dx: 120, dz: 150, r: 11 },
      { dx: 305, dz: 118, r: 11 },
      { dx: 380, dz: -44, r: 11 },
      { dx: 236, dz: -205, r: 11 },
      { dx: 58, dz: -178, r: 11 },
      { dx: -18, dz: -16, r: 12 },
    ],
    // 1102 m centre-to-centre, ~1035 m ridden. One tank of burst is a much
    // smaller share of a lap this long, so the average sits nearer cruise.
    entry: 400, prizeGil: 3200, prizeAp: 9, par: 100, limit: 280,
  },
  {
    id: 'race_alpine', hub: 'alpine', name: 'The Alpine Ascent',
    blurb: 'Five gates up the pass road. Nobody has ever called it fair.',
    checkpoints: [
      { dx: 62, dz: 58, r: 11 },
      { dx: 172, dz: 26, r: 11 },
      { dx: 252, dz: -66, r: 11 },
      { dx: 158, dz: -164, r: 11 },
      { dx: 22, dz: -62, r: 12 },
    ],
    // 620 m centre-to-centre, ~565 m ridden, on ground that fights you: the
    // pass is the one course where the slope refusal costs real seconds.
    entry: 700, prizeGil: 5200, prizeAp: 13, par: 80, limit: 240,
  },
];

/** How far the legality search will walk before it gives up on a gate. */
const SEARCH_STEP = 6;
const SEARCH_RINGS = 7;

/** A gate resolved into the world, plus the marker that shows where it is. */
interface LiveGate {
  x: number;
  y: number;
  z: number;
  r: number;
  mesh: THREE.Mesh;
}

export type RaceOutcome = 'won' | 'dnf' | 'abandoned';

export class Races {
  _dom!: HTMLElement | null;
  _gates!: LiveGate[];
  _mat!: THREE.MeshBasicMaterial | null;
  _matNext!: THREE.MeshBasicMaterial | null;
  /** Best time per course id, seconds. */
  best!: Record<string, number>;
  course!: RaceCourse | null;
  game!: Game;
  /** Index of the gate the rider is heading for. */
  idx!: number;
  /** The last run's result, for a probe to read. */
  last!: { id: string, outcome: RaceOutcome, time: number, gil: number, ap: number } | null;
  running!: boolean;
  sys!: ChocoboSystem;
  /** Elapsed race time, seconds. */
  t!: number;
  constructor(system: ChocoboSystem) {
    this.sys = system;
    this.course = null;
    this.running = false;
    this.t = 0;
    this.idx = 0;
    this.best = {};
    this.last = null;
    this._gates = [];
    this._dom = null;
    this._mat = null;
    this._matNext = null;
  }

  init(game: Game) { this.game = game; }

  course_(id: string) { return RACES.find((r) => r.id === id) || null; }

  /* --------------------------------------------------------------- start */

  /**
   * Enter a race.
   *
   * The bird is brought to the line rather than the rider being asked to whistle
   * for it and walk over: a race that begins with two minutes of admin is a
   * race nobody enters twice. `mountAt` is the same summon path as the whistle,
   * with the run-in skipped.
   *
   * @returns false if the course is unknown, one is already running, or the
   *   start line is somewhere the bird will not stand.
   */
  start(id: string): boolean {
    if (this.running) return false;
    const course = this.course_(id);
    if (!course) return false;
    const hubPoi = this._poi(course);
    if (!hubPoi) return false;
    const terrain = this.game.get('Terrain');

    this._clearGates();
    for (const cp of course.checkpoints) {
      const [x, z] = this._legalise(hubPoi.x + cp.dx, hubPoi.z + cp.dz);
      const y = terrain ? terrain.heightAt(x, z) : 0;
      this._gates.push({ x, y, z, r: cp.r, mesh: this._marker(x, y, z, cp.r) });
    }

    const line = this.sys.hub.startLine(course.hub);
    if (!line) return false;
    const first = this._gates[0];
    const heading = Math.atan2(first.x - line.x, first.z - line.z);
    if (!this.sys.mountAt(line.x, line.z, heading)) { this._clearGates(); return false; }

    this.course = course;
    this.t = 0;
    this.idx = 0;
    this.running = true;
    this.last = null;
    this._showGates();
    this._say('Race', `${course.name}  ·  par ${course.par.toFixed(0)}s`, 'quests', 'gold');
    return true;
  }

  /** Give up. Called on a dismount mid-race and by `abort` from a probe. */
  abort(outcome: RaceOutcome = 'abandoned') {
    if (!this.running || !this.course) return;
    const id = this.course.id;
    this._end();
    this.last = { id, outcome, time: this.t, gil: 0, ap: 0 };
    this._say('Race', outcome === 'dnf' ? 'Out of time' : 'Withdrawn', 'quests');
  }

  /* ---------------------------------------------------------------- tick */

  update(dt: number) {
    if (!this.running || !this.course) return;
    // A rider who steps off has left the race. The alternative — letting the
    // clock run while the player walks the course — is a course you can finish
    // without the mount the whole system exists for.
    if (!this.sys.isRiding) { this.abort('abandoned'); return; }

    this.t += dt;
    const player = this.game.get('Player');
    if (!player) return;
    const g = this._gates[this.idx];
    if (g) {
      const d = Math.hypot(player.position.x - g.x, player.position.z - g.z);
      if (d < g.r) {
        this.idx += 1;
        if (this.idx >= this._gates.length) { this._finish(); return; }
        this._showGates();
        this._say('Gate', `${this.idx} / ${this._gates.length}  ·  ${this.t.toFixed(1)}s`, 'quests', 'ice');
      }
    }
    if (this.t > this.course.limit) { this.abort('dnf'); return; }
    this._paint();
  }

  _finish() {
    const course = this.course;
    if (!course) return;
    const time = this.t;
    const beatPar = time <= course.par;
    const gil = Math.round(course.prizeGil * (beatPar ? 2 : 1));
    const ap = Math.round(course.prizeAp * (beatPar ? 1.5 : 1));
    const rpg = this.game.get('Rpg');
    rpg?.inventory?.addGil(gil, 'race');
    // `grantRaw`, not `awardAp`: `AP_RULES` is the combat/exploration earning
    // table and lives in another lane's file. A race purse is a story reward
    // and `grantRaw` is documented as exactly that, so racing pays without a
    // cross-lane edit to the rules table.
    rpg?.ascension?.grantRaw?.(ap, 'chocobo-race');
    const prev = this.best[course.id];
    if (prev == null || time < prev) this.best[course.id] = time;
    this._end();
    this.last = { id: course.id, outcome: 'won', time, gil, ap };
    const hud = this.game.get('HUD');
    if (hud?.areaTitle) hud.areaTitle(beatPar ? 'Course Record Pace' : 'Race Complete', course.name, `${time.toFixed(2)}s  ·  par ${course.par.toFixed(0)}s`);
    this._say('Race', `${time.toFixed(2)}s  ·  ${gil.toLocaleString()} gil`, 'quests', 'gold');
  }

  _end() {
    this.running = false;
    this.course = null;
    this._clearGates();
    const mm = this.game.get('Minimap');
    if (mm) mm.waypoint = null;
    this._paint();
  }

  /** One line for the stable's "how is she doing?" node. */
  bestSummary(): string | null {
    const rows = RACES.filter((r) => this.best[r.id] != null);
    if (!rows.length) return null;
    return `Best times: ${rows.map((r) => `${r.name} ${this.best[r.id].toFixed(2)}s`).join(', ')}.`;
  }

  /* ------------------------------------------------------------- geometry */

  _poi(course: RaceCourse) {
    const hub = this.sys.hub.hubDef(course.hub);
    return hub ? worldMap.poiById(hub.poi) : null;
  }

  /**
   * Walk outward until the ground under a gate is ground a bird will stand on.
   *
   * A square spiral rather than a ring sweep because the failure it exists for
   * is a *cliff face or a lake edge*, which is a half-plane: stepping straight
   * off it in one of eight directions clears it, and a ring sweep spends its
   * budget on the seven bearings that are still in the water.
   */
  _legalise(x: number, z: number): [number, number] {
    if (this.sys.canStandAt(x, z)) return [x, z];
    for (let ring = 1; ring <= SEARCH_RINGS; ring++) {
      const d = ring * SEARCH_STEP;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const cx = x + Math.sin(a) * d, cz = z + Math.cos(a) * d;
        if (this.sys.canStandAt(cx, cz)) return [cx, cz];
      }
    }
    return [x, z];
  }

  /**
   * A gate marker: an open-ended cylinder, drawn from both sides, standing in
   * the grass like a column of light.
   *
   * One mesh and one draw call per gate, and only the next two are ever
   * visible, so a race costs two draws over the ride it is already paying for.
   * Nothing about it animates: a pulse would move vertices between frames and
   * `shoot.mts` would stop giving the same draw count twice (`LANDMINES`, the
   * converge rule).
   */
  _marker(x: number, y: number, z: number, r: number): THREE.Mesh {
    if (!this._mat) {
      this._mat = new THREE.MeshBasicMaterial({ color: 0x2e6f4e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
      this._matNext = new THREE.MeshBasicMaterial({ color: 0xf2c73c, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false });
    }
    const geo = new THREE.CylinderGeometry(r * 0.55, r * 0.55, 16, 14, 1, true);
    const m = new THREE.Mesh(geo, this._mat);
    m.position.set(x, y + 8, z);
    m.visible = false;
    m.frustumCulled = true;
    this.game.scene.add(m);
    return m;
  }

  /** The next gate is gold, the one after is green, everything else is off. */
  _showGates() {
    for (let i = 0; i < this._gates.length; i++) {
      const g = this._gates[i];
      g.mesh.visible = i === this.idx || i === this.idx + 1;
      g.mesh.material = (i === this.idx ? this._matNext : this._mat) as THREE.Material;
    }
    const mm = this.game.get('Minimap');
    const g = this._gates[this.idx];
    if (mm && g) mm.waypoint = { x: g.x, z: g.z };
  }

  _clearGates() {
    for (const g of this._gates) {
      this.game.scene.remove(g.mesh);
      g.mesh.geometry.dispose();
    }
    this._gates.length = 0;
  }

  /* ------------------------------------------------------------------ hud */

  _say(k: string, v: string, ico = 'quests', tone = '') {
    const hud = this.game.get('HUD');
    if (hud?.toast) hud.toast(k, v, ico, tone);
  }

  /**
   * The clock.
   *
   * Twelve lines of DOM rather than a row in `HUD.ts`: the HUD is a shared
   * file with an owner, and a race readout is live for ninety seconds of a
   * playthrough. It is removed the moment the race ends, so a capture taken
   * outside a race is byte-identical to one taken before this file existed.
   */
  _paint() {
    const root = this.game.uiRoot;
    if (!root || typeof document === 'undefined') return;
    if (!this.running || !this.course) {
      if (this._dom) { this._dom.remove(); this._dom = null; }
      return;
    }
    if (!this._dom) {
      const d = document.createElement('div');
      d.className = 'race-clock';
      d.style.cssText = 'position:absolute;top:11%;left:50%;transform:translateX(-50%);'
        + 'font:600 26px/1.05 "Rajdhani",system-ui,sans-serif;letter-spacing:.06em;'
        + 'color:#f4ecd8;text-shadow:0 2px 10px rgba(0,0,0,.75);text-align:center;'
        + 'pointer-events:none;z-index:6;';
      root.appendChild(d);
      this._dom = d;
    }
    const over = this.t > this.course.par;
    this._dom.innerHTML = `<div style="font-size:34px;color:${over ? '#e08a58' : '#f4ecd8'}">${this.t.toFixed(2)}<span style="font-size:17px;opacity:.7">s</span></div>`
      + `<div style="font-size:13px;letter-spacing:.18em;opacity:.72">GATE ${Math.min(this.idx + 1, this._gates.length)} / ${this._gates.length}  ·  PAR ${this.course.par.toFixed(0)}</div>`;
  }
}

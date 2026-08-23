import * as THREE from 'three';
import { FISH, HOLES, rollFish } from './FishTable.ts';
import type { FishSpec } from './FishTable.ts';
import { FishingHud } from './FishingHud.ts';
import type { FishingPhase, FishingView } from './FishingHud.ts';
import { worldMap } from '../../world/map/WorldMap.ts';
import type { Game } from '../Game.ts';
import type { RpgSystem } from '../rpg/RpgSystem.ts';
import type { InteractableHandle } from '../interaction/Interactables.ts';

/**
 * Fishing — the world's only non-combat verb.
 *
 * Ten `type: 'fishing'` POIs have been on the map since it was authored, each
 * with a jetty, a tackle shack and a boat built by `PoiKits._fishing`, each
 * naming three species in its `does:` line, and none of them doing anything.
 * The previous lane cut the `fish` objective rather than tick it off a
 * keypress — "a lie with a trout in it" — and was right to. This is the real
 * thing.
 *
 * ## The shape of a cast
 *
 * `cast` → `flight` → `wait` → `bite` → `fight` → `landed` | `lost`.
 *
 * - **cast** — hold `E`. The power meter sweeps up and back; release picks a
 *   distance. Far water bites sooner and pays better, and puts more line
 *   between you and the fish to take back.
 * - **wait** — the bobber sits. Striking early costs you the wait over again,
 *   which is the only thing that makes waiting mean anything.
 * - **bite** — a 0.85 s window on `E`.
 * - **fight** — the game. The fish alternates *runs* and *rests*. Reeling
 *   during a run loads the line fast enough to break it; reeling during a rest
 *   is nearly free. `A`/`D` lean the rod against the run: side-strain bleeds
 *   tension and tires the fish faster, and leaning the *wrong* way loads it.
 *   Tension past 0.82 starts a strain timer; run it out and the line goes.
 *   Stop reeling for too long and it takes line until it spools you.
 *
 * Both loss modes are real and both were hit while tuning this. A fish that
 * cannot be lost is a cutscene with a progress bar.
 *
 * ## Where the spots are, and why there are only three
 *
 * `Water` is a **single global plane at y = -6.5**: a basin below that gets a
 * surface and everything else is dry, so a fishing pin standing at 68 m of
 * elevation can never have water under it no matter what its `does:` line
 * says. Seven of the ten pins are in that position — the survey is in
 * `probes/fishwater.mts` and the numbers are in the handoff. `_spots` walks
 * out from each pin looking for a genuine waterline within `SEARCH_R`, places
 * the stand on the bank facing the water, and **silently skips a pin it cannot
 * find water for** rather than registering a rod over dry rock.
 *
 * ## Where this lives
 *
 * Owned and ticked by `RpgSystem`, exactly like `HavenCamp`, and for the same
 * reason: `Interaction` boots six systems *after* `Rpg`, so the handles cannot
 * be taken in `init()` and are taken on the first frame instead. `Game.ts` is
 * the coordinator's file and a new system cannot register itself there.
 */

/** How far from a fishing pin to look for real water. */
const SEARCH_R = 170;
/** Metres inland of the waterline the player stands. */
const STAND_BACK = 2.6;
/** Seconds the bite window stays open. */
const BITE_WINDOW = 0.85;
/** Tension above which the strain timer runs. Drawn as a tick on the gauge. */
const SNAP_AT = 0.82;
/** Seconds at full strain before the line parts, before the Ascension bonus. */
const LINE_HOLD = 0.85;
/** Seconds the result card stays up before control comes back. */
const CARD_TIME = 2.6;

/** One fishable place, resolved against the water that is actually there. */
export interface FishingSpot {
  /** `WorldMap` POI id. */
  id: string;
  name: string;
  /** Where the player stands. */
  stand: THREE.Vector3;
  /** Unit vector from the stand out over the water. */
  out: THREE.Vector2;
  /** Metres of open water along `out` before the far bank. */
  fetch: number;
  /** Species ids, from `HOLES`. */
  fish: string[];
  /** POI level — scales the EXP and gates nothing. */
  lv: number;
}

export class Fishing {
  rpg: RpgSystem;
  game: Game | null = null;
  _installed = false;
  /** Resolved spots, keyed by POI id. Empty until `install`. */
  spots: Map<string, FishingSpot> = new Map();
  _handles: InteractableHandle[] = [];
  /** POI ids that have no water within `SEARCH_R`. Read by the probe. */
  dry: string[] = [];

  /* ---- live cast state ---------------------------------------------- */
  /** Null when not fishing. */
  active: FishingSpot | null = null;
  phase: FishingPhase = 'cast';
  /** Seconds spent in the current phase. */
  t = 0;
  power = 0;
  _powerUp = true;
  tension = 0;
  strain = 0;
  line = 0;
  line0 = 0;
  stamina = 1;
  fish: FishSpec | null = null;
  kg = 0;
  run: -1 | 0 | 1 = 0;
  tilt: -1 | 0 | 1 = 0;
  reeling = false;
  note = '';
  _runTimer = 0;
  _biteAt = 0;
  _held = false;
  _seed = 1;
  /** Set while `_end` is unwinding, so the tick that ends a cast cannot re-enter. */
  _ending = false;

  /* ---- presentation -------------------------------------------------- */
  hud: FishingHud | null = null;
  _rod: THREE.Object3D | null = null;
  _tip: THREE.Object3D | null = null;
  _bob: THREE.Object3D | null = null;
  _ring: THREE.Mesh | null = null;
  _lineMesh: THREE.Line | null = null;
  _bobTarget = new THREE.Vector3();
  _bobFrom = new THREE.Vector3();

  constructor(rpg: RpgSystem) { this.rpg = rpg; }

  /**
   * Resolve the spots and take the interaction handles, once. Safe to call
   * every frame; a no-op after the first tick that finds `Interaction`,
   * `Water` and `Terrain` all up.
   */
  install(game: Game) {
    if (this._installed) return false;
    const ix = game?.get?.('Interaction');
    const water = game?.get?.('Water');
    const terrain = game?.get?.('Terrain');
    if (!ix || !water || !terrain || !water.bodies?.length) return false;
    this.game = game;
    this._installed = true;

    for (const spot of this._survey(game)) {
      this.spots.set(spot.id, spot);
      this._handles.push(ix.register({
        id: `fish_${spot.id}`,
        pos: spot.stand.clone(),
        // A bank is a place you walk onto, not a face you stand in front of --
        // the same argument the haven's 7 m radius is written from.
        radius: 6,
        cone: 200,
        priority: 2,
        verb: 'Fish',
        label: spot.name,
        hint: 'Hold E to cast',
        yOffset: 1.5,
        enabled: () => this.rpg.inventory.count('fishing_rod') > 0,
        handler: () => this.open(spot),
      }));
    }
    return true;
  }

  /** Drop every handle and any live cast. For tests and world rebuilds. */
  dispose() {
    this.abort();
    for (const h of this._handles) h?.dispose?.();
    this._handles.length = 0;
    this.spots.clear();
    this.hud?.dispose();
    this.hud = null;
    this._installed = false;
  }

  /* ------------------------------------------------------------------ */
  /* Survey                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Turn each `fishing` POI into a stand on a real bank, or drop it.
   *
   * The pin is a map label; it is not a promise that the terrain under it is
   * wet. This walks 36 rays out from the pin, finds the nearest sample that is
   * genuinely submerged (inside a water body's footprint *and* with ground
   * below the water plane), then steps back along that ray to the last dry
   * sample and stands the player `STAND_BACK` behind it.
   */
  _survey(game: Game): FishingSpot[] {
    const water = game.get('Water')!;
    const terrain = game.get('Terrain')!;
    const wet = (x: number, z: number) =>
      water.surfaceAt(x, z) != null && terrain.heightAt(x, z) < water.level;

    const out: FishingSpot[] = [];
    this.dry.length = 0;
    for (const p of worldMap.pois) {
      if (p.type !== 'fishing') continue;
      const fish = HOLES[p.id];
      // A hole with no species list is an authoring mistake, not a runtime
      // condition -- the whole class of bug this lane exists to kill is a table
      // that names a place the other table does not.
      if (!fish) throw new Error(`Fishing: no catch table for fishing POI ${p.id}`);
      for (const id of fish) if (!FISH[id]) throw new Error(`Fishing: ${p.id} lists unknown fish ${id}`);

      let hit: { x: number, z: number, a: number, r: number } | null = null;
      for (let r = 6; r <= SEARCH_R && !hit; r += 4) {
        for (let k = 0; k < 36; k++) {
          const a = (k / 36) * Math.PI * 2;
          const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
          if (wet(x, z)) { hit = { x, z, a, r }; break; }
        }
      }
      if (!hit) { this.dry.push(p.id); continue; }

      // Back up along the ray to the last dry metre: that is the waterline.
      const dx = Math.cos(hit.a), dz = Math.sin(hit.a);
      let edge = hit.r;
      while (edge > 1 && wet(p.x + dx * (edge - 1), p.z + dz * (edge - 1))) edge -= 1;
      const sx = p.x + dx * (edge - STAND_BACK), sz = p.z + dz * (edge - STAND_BACK);

      // How much open water is in front of it, so a cast cannot land on the
      // far bank of a narrow inlet.
      let fetch = 0;
      while (fetch < 90 && wet(p.x + dx * (edge + fetch + 2), p.z + dz * (edge + fetch + 2))) fetch += 2;

      out.push({
        id: p.id,
        name: p.name,
        stand: new THREE.Vector3(sx, terrain.heightAt(sx, sz), sz),
        out: new THREE.Vector2(dx, dz),
        fetch: Math.max(10, fetch),
        fish,
        lv: p.lv || 1,
      });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* The cast                                                            */
  /* ------------------------------------------------------------------ */

  /** True while a cast is live and the fishing layer owns the input. */
  get busy() { return this.active != null; }

  /**
   * Begin fishing at a spot. Takes the stick and the camera; `_end` gives both
   * back. Called by the interactable, and directly by the probe.
   */
  open(spot: FishingSpot) {
    const game = this.game;
    if (!game || this.active) return false;
    this.active = spot;
    this._enter('cast');
    this.power = 0; this._powerUp = true;
    this.fish = null; this.kg = 0;
    this.tension = 0; this.strain = 0; this.line = 0; this.line0 = 0; this.stamina = 1;
    this.run = 0; this.tilt = 0; this.reeling = false;
    this.note = 'Hold E — release to cast';
    this._held = false;

    const player = game.get('Player');
    if (player) {
      // Stand on the bank, facing the water. `input.enabled = false` zeroes
      // `move`, so nothing overwrites the heading after this.
      player.position.copy(spot.stand);
      player.heading = Math.atan2(spot.out.x, spot.out.y);
      player.root.rotation.y = player.heading;
      player.velocity?.set(0, 0, 0);
      game.get('Party')?.snap?.();
      // Camera behind the shoulder, looking the way the rod points: the rig's
      // `dir` runs *from* the focus *to* the camera, so the yaw that frames the
      // water is the player's heading turned through pi.
      game.get('Camera')?.setOrbit?.(player.heading + Math.PI, 0.10);
    }

    const ix = game.get('Interaction');
    if (ix) ix.blocked = true;
    if (game.input) game.input.enabled = false;
    if (!this.hud) this.hud = new FishingHud(game.uiRoot);
    this._buildTackle(game);
    game.get('Audio')?.play?.('ui');
    return true;
  }

  /** Give up on a live cast without a result. */
  abort() { if (this.active) this._end(); }

  _enter(phase: FishingPhase) { this.phase = phase; this.t = 0; }

  /**
   * Hand control back: the stick, the prompt, the tackle and the overlay.
   * Idempotent, because both loss paths and the landed path all route here.
   */
  _end() {
    const game = this.game;
    this._ending = true;
    this.active = null;
    this.fish = null;
    this.hud?.hide();
    this._dropTackle();
    if (game) {
      if (game.input) game.input.enabled = true;
      const ix = game.get('Interaction');
      // Suppress the prompt for a beat so the key that landed the fish does not
      // immediately re-open the cast -- the same guard `openScreen` uses.
      if (ix) { ix.blocked = false; ix._firedAt = game.time.now; }
    }
    this._ending = false;
  }

  /* ------------------------------------------------------------------ */
  /* Tick                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Drive the live cast. Called from `RpgSystem.update` every frame; returns
   * immediately when nothing is on the line.
   */
  update(dt: number, game: Game) {
    this.install(game);
    if (!this.active || this._ending) return;
    this.game = game;

    // Anything that takes the screen ends the cast rather than fighting it for
    // the E key: a menu, a conversation, a cutscene, or the party going down.
    const menus = game.get('Menus');
    const story = game.get('Story');
    if ((menus && menus.name) || story?.cine?.playing || game.get('Interaction')?.talking) {
      this._end();
      return;
    }

    const input = game.input;
    const down = (c: string) => !!input?.key?.(c);
    const pressed = (c: string) => !!input?.keyDown?.(c);
    const pad = input?.gamepad?.buttons?.[0]?.pressed;
    const holdE = down('KeyE') || down('Enter') || !!pad;
    const hitE = pressed('KeyE') || pressed('Enter');
    this.tilt = down('KeyA') || down('ArrowLeft') ? -1
      : down('KeyD') || down('ArrowRight') ? 1 : 0;

    if (pressed('KeyQ')) { this.note = ''; this._end(); return; }

    this.t += dt;
    switch (this.phase) {
      case 'cast': this._tickCast(dt, holdE, game); break;
      case 'flight': this._tickFlight(dt, game); break;
      case 'wait': this._tickWait(dt, hitE, game); break;
      case 'bite': this._tickBite(dt, hitE, game); break;
      case 'fight': this._tickFight(dt, holdE, game); break;
      case 'landed':
      case 'lost':
        if (this.t > CARD_TIME) { this._end(); return; }
        break;
    }
    this._tackleFrame(dt, game);
    this.hud?.draw(this.view());
  }

  /** Everything the overlay and the probe read. */
  view(): FishingView {
    return {
      phase: this.phase,
      spot: this.active?.name || '',
      power: this.power,
      tension: this.tension,
      strain: this.strain,
      line: this.line,
      line0: this.line0,
      stamina: this.stamina,
      fishName: this.fish?.name || '',
      kg: this.kg,
      run: this.run,
      tilt: this.tilt,
      reeling: this.reeling,
      note: this.note,
    };
  }

  /**
   * The power meter. It sweeps 0 → 1 → 0 at 0.85/s while `E` is held and the
   * cast goes on release, so distance is a timing choice and not a number in a
   * menu. Holding through a whole sweep without releasing is a short cast,
   * which is the honest cost of dithering.
   */
  _tickCast(dt: number, hold: boolean, game: Game) {
    if (hold) {
      this._held = true;
      const rate = 0.85 * dt;
      this.power += this._powerUp ? rate : -rate;
      if (this.power >= 1) { this.power = 1; this._powerUp = false; }
      if (this.power <= 0) { this.power = 0; this._powerUp = true; }
      this.note = 'Release to cast';
      return;
    }
    // Wait for the key that opened the prompt to come up before arming.
    if (!this._held) { if (this.t > 0.6) this._held = true; return; }
    this._launch(game);
  }

  _launch(game: Game) {
    const spot = this.active;
    if (!spot) return;
    const dist = 7 + this.power * Math.min(28, spot.fetch * 0.8);
    this._bobFrom.copy(this._tipWorld(game));
    this._bobTarget.set(
      spot.stand.x + spot.out.x * dist,
      (game.get('Water')?.level ?? 0),
      spot.stand.z + spot.out.y * dist,
    );
    this.line0 = dist;
    this.line = dist;
    // Far water bites sooner: it is where the fish are, and it is what makes a
    // full-power cast worth the timing.
    this._biteAt = 1.5 + this._rnd() * 5.2 - this.power * 1.6;
    this._enter('flight');
    this.note = '';
    game.get('Audio')?.play?.('warp', spot.stand, { volume: 0.35 });
  }

  _tickFlight(dt: number, game: Game) {
    if (this.t >= 0.62) {
      this._enter('wait');
      this.note = 'Wait for the bite — strike early and it spooks';
      game.get('Audio')?.play?.('hit', this._bobTarget, { volume: 0.22 });
    }
  }

  _tickWait(dt: number, hit: boolean, game: Game) {
    if (hit) {
      // Striking at nothing is the cost of impatience, and it is the only thing
      // that makes the wait a decision rather than a loading bar.
      this._biteAt = this.t + 2.2 + this._rnd() * 3.4;
      this.note = 'Nothing there. It will take longer now.';
      return;
    }
    if (this.t >= this._biteAt) {
      const spot = this.active;
      if (!spot) return;
      // A stronger cast pulls the roll toward the rare end of the hole.
      const r = Math.max(0, Math.min(0.9999, this._rnd() * (1 - this.power * 0.42)));
      this.fish = rollFish(spot.fish, r);
      this.kg = this.fish.kg[0] + this._rnd() * (this.fish.kg[1] - this.fish.kg[0]);
      this.stamina = 1;
      this.tension = 0.12;
      this.strain = 0;
      this._runTimer = 0.45;
      this.run = 0;
      this._enter('bite');
      this.note = 'Strike!';
      game.get('Audio')?.play?.('ui', null, { volume: 0.9 });
    }
  }

  _tickBite(dt: number, hit: boolean, game: Game) {
    if (hit) {
      this._enter('fight');
      this.note = 'Reel on the rests. Lean against the runs.';
      // Line out is set at the cast; the hook does not move it.
      return;
    }
    if (this.t >= BITE_WINDOW) {
      this.fish = null;
      this._enter('wait');
      this._biteAt = 1.8 + this._rnd() * 3.0;
      this.note = 'It took the bait and went.';
    }
  }

  /**
   * The fight.
   *
   * Every constant here was tuned by playing it, not by reasoning about it,
   * and the shape it converged on is: **the fish decides when you may reel.**
   * Runs are unreelable for anything above about 1.1 `power` unless you are
   * leaning against them; rests are nearly free. That rhythm — watch, lean,
   * reel in the gap — is the whole game, and it is why the run indicator is the
   * biggest thing on the overlay.
   */
  _tickFight(dt: number, hold: boolean, game: Game) {
    const f = this.fish;
    const spot = this.active;
    if (!f || !spot) { this._end(); return; }
    // `exp_fish` on the Ascension grid: "Fish tire 25% faster and the line
    // holds longer." Both halves are this one number.
    const anglersEye = this.rpg.ascension?.value?.('fishing') || 0;

    // -- runs and rests ------------------------------------------------
    this._runTimer -= dt;
    if (this._runTimer <= 0) {
      if (this.run !== 0) {
        this.run = 0;
        // A tired fish rests longer. This is what makes the back half of a big
        // fight winnable at all.
        this._runTimer = 0.7 + this._rnd() * 0.8 + (1 - this.stamina) * 1.4;
      } else {
        this.run = this._rnd() < 0.5 ? -1 : 1;
        this._runTimer = 0.7 + this._rnd() * 1.5 * Math.max(0.35, this.stamina);
      }
    }
    const running = this.run !== 0;
    const pull = f.power * (running ? 1 : 0.22);
    const counter = running && this.tilt !== 0 && this.tilt === -this.run;
    const withIt = running && this.tilt !== 0 && this.tilt === this.run;
    this.reeling = hold;

    // -- tension --------------------------------------------------------
    let rate = hold ? (0.12 + pull * 1.45) : -0.95;
    if (counter) rate -= 0.46;
    if (withIt) rate += 0.28;
    this.tension = Math.max(0, Math.min(1, this.tension + rate * dt));

    const hold_s = LINE_HOLD * (1 + anglersEye);
    if (this.tension >= SNAP_AT) this.strain = Math.min(1.2, this.strain + dt / hold_s);
    else this.strain = Math.max(0, this.strain - dt * 1.7);
    if (this.strain >= 1) { this._lose(game, 'The line parted.'); return; }

    // -- line -----------------------------------------------------------
    if (hold) this.line -= Math.max(0.25, 2.9 - pull * 1.55) * dt;
    else this.line += (running ? 1.15 : 0.35) * dt;
    if (this.line <= 0) { this._land(game); return; }
    if (this.line > this.line0 * 1.35 + 4) { this._lose(game, 'It spooled you.'); return; }

    // -- stamina --------------------------------------------------------
    const drain = (0.06 + (hold ? 0.05 : 0) + (counter ? 0.115 : 0)) * (1 + anglersEye);
    this.stamina = Math.max(0, this.stamina - (drain * dt * 8) / f.stamina);

    this.note = this.tension > SNAP_AT ? 'Give it line!'
      : running ? (counter ? 'Holding it — reel when it tires' : 'It is running — lean against it')
        : 'It is tiring — reel now';
  }

  /* ------------------------------------------------------------------ */
  /* Outcomes                                                            */
  /* ------------------------------------------------------------------ */

  _lose(game: Game, why: string) {
    this.note = why;
    this._enter('lost');
    this.tension = 0;
    game.get('Audio')?.play?.('hit', null, { volume: 0.7 });
  }

  /**
   * Landed. The catch is an **ingredient in the bag**, which is the whole
   * point: `notify('fish')` ticks the quest log, `awardAp('fishing')` pays the
   * Ascension activity that has been in `AP_RULES` since the grid was written,
   * and the EXP goes in the bank so it cashes at the next haven like everything
   * else.
   */
  _land(game: Game) {
    const f = this.fish;
    const spot = this.active;
    if (!f || !spot) return;
    this.line = 0;
    this._enter('landed');
    this.rpg.inventory.add(f.id, 1, 'fishing');
    this.rpg.gainExp(Math.round(f.exp * (1 + spot.lv * 0.012)), 'fishing');
    this.rpg.ascension?.awardAp?.('fishing');
    this.rpg.quests?.notify?.('fish', { target: f.id, count: 1 });
    this.rpg.quests?.notify?.('fish', { target: 'any', count: 1 });
    game.get('Audio')?.play?.('ui', null, { volume: 1 });
    game.get('HUD')?.toast?.('Landed', `${f.name}  ·  ${this.kg.toFixed(1)} kg`, 'items', 'gold');
  }

  /* ------------------------------------------------------------------ */
  /* Tackle                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Rod, line and float. Three draw calls that exist only while a cast is
   * live: a fishing minigame with no rod in frame reads as a menu bolted to a
   * lake, and the line is what makes the distance readout mean anything.
   */
  _buildTackle(game: Game) {
    if (this._rod) return;
    const player = game.get('Player');
    const hand = player?.attach?.handR;
    const rod = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.55, metalness: 0.1 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.017, 2.05, 6), mat);
    shaft.position.y = 1.0;
    rod.add(shaft);
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.023, 0.021, 0.26, 6),
      new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.9 }));
    grip.position.y = 0.1;
    rod.add(grip);
    const tip = new THREE.Object3D();
    tip.position.y = 2.02;
    rod.add(tip);
    // Held out and up, the way a rod sits between casts.
    rod.rotation.set(-0.62, 0, 0.22);
    this._rod = rod; this._tip = tip;
    (hand || game.scene).add(rod);

    const bob = new THREE.Group();
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xd6432f, roughness: 0.5, emissive: 0x2a0703 }));
    top.position.y = 0.045;
    const bottom = new THREE.Mesh(
      new THREE.SphereGeometry(0.062, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xf1efe6, roughness: 0.6 }));
    bottom.position.y = -0.03;
    bob.add(top, bottom);
    this._bob = bob;
    game.scene.add(bob);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.34, 24),
      new THREE.MeshBasicMaterial({ color: 0xbcd6e8, transparent: true, opacity: 0.4, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    this._ring = ring;
    game.scene.add(ring);

    const geo = new THREE.BufferGeometry().setFromPoints(
      [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    const lineMesh = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xe8f0f8, transparent: true, opacity: 0.55, depthWrite: false,
    }));
    lineMesh.frustumCulled = false;
    this._lineMesh = lineMesh;
    game.scene.add(lineMesh);
  }

  _dropTackle() {
    for (const o of [this._rod, this._bob, this._ring, this._lineMesh]) o?.parent?.remove(o);
    this._rod = null; this._tip = null; this._bob = null; this._ring = null; this._lineMesh = null;
  }

  _tipWorld(game: Game): THREE.Vector3 {
    if (this._tip) { this._tip.updateWorldMatrix(true, false); return this._tip.getWorldPosition(new THREE.Vector3()); }
    const p = game.get('Player');
    return p ? p.position.clone().add(new THREE.Vector3(0, 1.6, 0)) : new THREE.Vector3();
  }

  /** Move the float and redraw the line. Pure presentation; no state changes. */
  _tackleFrame(dt: number, game: Game) {
    const bob = this._bob, rod = this._rod, ring = this._ring, lm = this._lineMesh;
    if (!bob || !lm || !ring) return;
    const spot = this.active;
    if (!spot) return;
    const now = game.time.now;
    const level = game.get('Water')?.level ?? 0;

    if (this.phase === 'cast') {
      // Reeled in: the float hangs off the tip.
      bob.position.copy(this._tipWorld(game)).y -= 0.35;
      ring.visible = false;
    } else if (this.phase === 'flight') {
      const k = Math.min(1, this.t / 0.62);
      bob.position.lerpVectors(this._bobFrom, this._bobTarget, k);
      bob.position.y += Math.sin(k * Math.PI) * 4.2;
      ring.visible = false;
    } else {
      // Sat on the water at whatever distance is still out, bobbing. A hooked
      // fish that is running drags it sideways, which is the only cue that does
      // not need the overlay to be read.
      const d = Math.max(0.4, this.line);
      const lateral = this.phase === 'fight' && this.run !== 0
        ? Math.sin(now * 2.4) * 0.9 * this.run : 0;
      bob.position.set(
        spot.stand.x + spot.out.x * d - spot.out.y * lateral,
        level,
        spot.stand.z + spot.out.y * d + spot.out.x * lateral,
      );
      const dip = this.phase === 'fight'
        ? (this.run !== 0 ? -0.10 - this.tension * 0.06 : Math.sin(now * 5.5) * 0.035)
        : Math.sin(now * 1.9) * 0.045;
      bob.position.y += dip;
      ring.visible = true;
      ring.position.set(bob.position.x, level + 0.02, bob.position.z);
      const s = 1 + (this.phase === 'fight' ? 0.5 + this.tension * 1.2 : 0.35) * (0.6 + 0.4 * Math.sin(now * 3.1));
      ring.scale.setScalar(s);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.34 * (this.phase === 'fight' ? 1 : 0.7);
    }

    // Rod bend: a rotation, because a bent cylinder needs a skinned mesh and
    // the silhouette that reads at 12 m is the angle, not the curve.
    if (rod) {
      const load = this.phase === 'fight' ? this.tension : this.phase === 'cast' ? this.power * 0.4 : 0.08;
      rod.rotation.x = -0.62 + load * 0.55;
      rod.rotation.z = 0.22 - (this.phase === 'fight' ? this.tilt * 0.3 : 0);
    }

    const tip = this._tipWorld(game);
    const mid = tip.clone().lerp(bob.position, 0.5);
    mid.y -= 0.25 + (this.phase === 'fight' ? -this.tension * 0.22 : 0.5) * Math.min(1, this.line / 12);
    const pos = lm.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, tip.x, tip.y, tip.z);
    pos.setXYZ(1, mid.x, mid.y, mid.z);
    pos.setXYZ(2, bob.position.x, bob.position.y, bob.position.z);
    pos.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */

  /**
   * Deterministic PRNG.
   *
   * Every other random in this file goes through here so a probe can seed a
   * cast and get the same fish twice. `Math.random` in a minigame is a test you
   * cannot write.
   */
  _rnd() {
    this._seed = (this._seed * 1664525 + 1013904223) >>> 0;
    return this._seed / 4294967296;
  }

  /** Seed the roll. The probe calls this; nothing in play does. */
  seed(n: number) { this._seed = n >>> 0 || 1; }
}

export default Fishing;

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
 * `Water` is **not** a single global plane. It was when this file was written,
 * and the sentence that used to be here — "a fishing pin standing at 68 m of
 * elevation can never have water under it" — went stale the night
 * `Water._findTarns` started measuring a level per body and `Field._tarnBasins`
 * carved a basin under every inland pin. Four pins had real water 6 m away and
 * were reported dry for a week, because the survey still compared the ground
 * against `Water.level` (−6.5 m, the sea) instead of against the body's own
 * surface. Every level in here is per spot now.
 *
 * `_survey` walks out from each pin to the nearest **waterline** — a wet/dry
 * transition, in whichever direction the pin happens to be standing — places
 * the stand on the dry side of it, and **silently skips a pin it cannot find
 * water for** rather than registering a rod over dry rock. Two pins are in that
 * position and the world map draws them as unavailable rather than promising
 * them; `probes/fishwater.mts` is the live survey.
 *
 * ## Where this lives
 *
 * Owned and ticked by `RpgSystem`, exactly like `HavenCamp`, and for the same
 * reason: `Interaction` boots six systems *after* `Rpg`, so the handles cannot
 * be taken in `init()` and are taken on the first frame instead. `Game.ts` is
 * the coordinator's file and a new system cannot register itself there.
 */

const _seg = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _rodEuler = new THREE.Euler();
const _rodQ = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();

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
  /**
   * The surface height of *this* hole's water body.
   *
   * Not `Water.level`. `Water` stopped being one global plane when `_findTarns`
   * gave every inland pin its own measured level, and this file did not notice:
   * four pins with real water at +36.9 to +80.5 m were surveyed against the sea
   * at −6.5 m, reported dry, and drew no rod. A float lands here.
   */
  level: number;
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
  /** Seconds left of a surge. A run that starts as a lunge pulls harder. */
  _lunge = 0;
  /** Seconds the line has been slack. Past 1.5 the hook comes out. */
  _slack = 0;
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
  _lineMesh: THREE.Mesh | null = null;
  _bobTarget = new THREE.Vector3();
  _bobFrom = new THREE.Vector3();
  /** Camera framing to put back when the cast ends. */
  _camWas: { d: number, s: number, h: number } | null = null;
  /** Formation slots to put back when the cast ends. */
  _slotsWere: THREE.Vector2[] | null = null;

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
    // Submerged means "under **this** body's surface", not under the sea.
    // `surfaceAt` already returns the body's own level; comparing the ground
    // against the global `water.level` instead was the whole bug — every tarn
    // stands tens of metres above −6.5 m, so the test could only ever pass at
    // the coast, and six of ten pins reported dry over water 6 m away.
    const wet = (x: number, z: number) => {
      const lv = water.surfaceAt(x, z);
      return lv != null && terrain.heightAt(x, z) < lv;
    };

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

      // **Two shapes of pin, and only one of them was ever handled.** A dock
      // pin stands on dry land beside its water; a tarn pin stands at the
      // *centre* of a basin `Water._findTarns` cut around it, so the pin is
      // itself two to four metres under. Walking outward for the first wet
      // sample from inside the lake finds the pin's own puddle at r = 6 and
      // parks the rod in the middle of it. So look for the transition, in
      // whichever direction the pin is standing.
      const inWater = wet(p.x, p.z);
      let hit: { a: number, r: number } | null = null;
      for (let r = 6; r <= SEARCH_R && !hit; r += 4) {
        for (let k = 0; k < 36; k++) {
          const a = (k / 36) * Math.PI * 2;
          const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
          if (wet(x, z) !== inWater) { hit = { a, r }; break; }
        }
      }
      if (!hit) {
        // Wholly dry within the search radius, or — for a pin already in the
        // water — a basin wider than it, which is not a failure.
        if (!inWater) { this.dry.push(p.id); continue; }
        hit = { a: 0, r: SEARCH_R };
      }

      // `ax`/`az` points at the bank; `dx`/`dz` points out over the water.
      const ax = Math.cos(hit.a), az = Math.sin(hit.a);
      const dx = inWater ? -ax : ax, dz = inWater ? -az : az;
      // Walk back to the last metre on the near side: that is the waterline.
      let edge = hit.r;
      while (edge > 1 && wet(p.x + ax * (edge - 1), p.z + az * (edge - 1)) !== inWater) edge -= 1;
      // The stand is always `STAND_BACK` on the dry side of the waterline,
      // which is `-out` by construction whichever shape of pin this is.
      const sx = p.x + ax * (edge + (inWater ? STAND_BACK : -STAND_BACK));
      const sz = p.z + az * (edge + (inWater ? STAND_BACK : -STAND_BACK));

      // How much open water is in front of it, so a cast cannot land on the
      // far bank of a narrow inlet. Measured from the waterline, outward.
      const ex = p.x + ax * edge, ez = p.z + az * edge;
      let fetch = 0;
      while (fetch < 90 && wet(ex + dx * (fetch + 2), ez + dz * (fetch + 2))) fetch += 2;

      out.push({
        id: p.id,
        name: p.name,
        level: water.surfaceAt(ex + dx * 2, ez + dz * 2) ?? water.surfaceAt(p.x, p.z) ?? water.level,
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
      // **Give the party room.** At 3.4 m the default formation puts Gladiolus
      // between the lens and the rod -- he took a third of the first close
      // frame. Widening the slots and pushing them back is also simply what
      // three people do when the fourth is casting; they are restored the
      // moment the cast ends.
      const party = game.get('Party');
      if (party?.members) {
        this._slotsWere = party.members.map((m) => m.slot.clone());
        for (const m of party.members) m.slot.set(m.slot.x * 1.85, m.slot.y * 2.4 - 1.8);
      }
      party?.snap?.();
      // Camera behind the shoulder, looking the way the rod points: the rig's
      // `dir` runs *from* the focus *to* the camera, so the yaw that frames the
      // water is the player's heading turned through pi.
      //
      // And **in close**, which the first capture proved is not optional. At
      // the field distance of 5.6 m the rod is a stub, the float is four pixels
      // on moving water, and three companions stand between the player and the
      // thing he is doing. 3.4 m over a wider shoulder with the lens tipped
      // down puts the rod, the line and the float in one frame.
      const cam = game.get('Camera');
      if (cam) {
        this._camWas = { d: cam.targetDistance, s: cam.shoulder, h: cam.height };
        cam.targetDistance = 3.4;
        cam.shoulder = 1.0;
        cam.height = 1.70;
        cam.setOrbit(player.heading + Math.PI, 0.20);
      }
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
      const party = game.get('Party');
      if (party?.members && this._slotsWere) {
        party.members.forEach((m, i) => { const w = this._slotsWere?.[i]; if (w) m.slot.copy(w); });
        this._slotsWere = null;
      }
      const cam = game.get('Camera');
      if (cam && this._camWas) {
        cam.targetDistance = this._camWas.d;
        cam.shoulder = this._camWas.s;
        cam.height = this._camWas.h;
        this._camWas = null;
      }
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
    this.hud?.draw(this.view());
  }

  /**
   * Presentation, after everything has moved.
   *
   * The rod hangs off `attach.handR`, which is a **bone socket**: read during
   * `RpgSystem.update` its world matrix is whatever the last frame's animation
   * left there, and the first capture had the line leaving Noctis at chest
   * height and lying flat in the grass instead of running from the rod tip.
   * `Rpg` also boots before `Menus`, so a `setMenuOpen` written in `update` is
   * overwritten by `Menus.update` in the same frame -- which is why the field
   * HUD stayed at full brightness underneath the gauges. Both belong here.
   */
  lateUpdate(dt: number, game: Game) {
    if (!this.active) return;
    // Fade the field HUD the way a conversation does: the party panel and the
    // weapon wheel sit exactly where the gauges go.
    game.get('HUD')?.setMenuOpen?.(true);
    this._tackleFrame(dt, game);
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
      lunge: this._lunge > 0,
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
      spot.level,
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
      this._lunge = 0;
      this._slack = 0;
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
      } else if (this.stamina <= 0.06) {
        // Spent. It has nothing left and the last few metres are the reward
        // for the fight -- without this the fish keeps running on an empty bar
        // and the stamina gauge is decoration.
        this.run = 0;
        this._runTimer = 1.5;
      } else {
        this.run = this._rnd() < 0.5 ? -1 : 1;
        this._runTimer = 0.7 + this._rnd() * 1.5 * Math.max(0.35, this.stamina);
        // A third of runs start as a surge. Without one the fight is a solved
        // policy: tension is a perfectly predictable integrator, so a player
        // who has learnt "reel under 0.6, lean against the run" can never lose
        // again. The lunge is the reason to leave headroom on the gauge, and
        // it is telegraphed -- the chevrons treble and the caption changes on
        // the frame it starts -- so it is a reaction test and not a coin toss.
        if (this._rnd() < 0.32 && this.stamina > 0.25) this._lunge = 0.55;
      }
    }
    this._lunge = Math.max(0, this._lunge - dt);
    const running = this.run !== 0;
    // A surge is **additive**, not a multiplier. A multiplier turned the top of
    // the table into a wall -- 1.9 x the Devil's 1.62 is a pull no amount of
    // side-strain can answer, and it measured 0/12 for every way of playing it.
    // A flat +0.55 nearly doubles a trout and adds a third to the Devil, which
    // is the right shape: a surge is the fish's whole body, and a trout has
    // proportionally more of that in reserve than something already pulling at
    // its limit.
    const pull = f.power * (running ? 1 : 0.22) + (this._lunge > 0 ? 0.55 : 0);
    const counter = running && this.tilt !== 0 && this.tilt === -this.run;
    const withIt = running && this.tilt !== 0 && this.tilt === this.run;
    this.reeling = hold;

    // -- tension --------------------------------------------------------
    // **A running fish loads the rod whether you are reeling or not.** Letting
    // go used to be a free and total reset, which is what made the fight
    // solvable: there was no state a competent player could not bleed out of.
    // Now the drag itself pulls against a run, so above about 1.15 `power` --
    // the gar and the Devil -- tension *climbs* on an idle reel and the
    // side-strain lean is the only relief there is.
    let rate = hold ? (0.12 + pull * 1.45) : (-0.95 + pull * 0.82);
    // Side-strain relief scales with the pull, so **there is always a correct
    // play**. A flat relief left the gar and the Devil in a state no input
    // could bleed out of, which is not difficulty, it is a bug with a gauge on
    // it. It still does not make reeling through a run survivable on a big
    // fish -- that is the intended answer to a run, and it is why the counter
    // is worth learning at all.
    if (counter) rate -= 0.46 + pull * 0.42;
    if (withIt) rate += 0.28;
    this.tension = Math.max(0, Math.min(1, this.tension + rate * dt));

    const hold_s = LINE_HOLD * (1 + anglersEye);
    if (this.tension >= SNAP_AT) this.strain = Math.min(1.2, this.strain + dt / hold_s);
    else this.strain = Math.max(0, this.strain - dt * 1.7);
    if (this.strain >= 1) { this._lose(game, 'The line parted.'); return; }

    // **Slack loses the fish too.** Without this the safe play against anything
    // under about 1.1 `power` is to hold nothing down at all: tension floors at
    // zero, the fish takes line at 0.85 m/s and the fight becomes a waiting
    // game with no way to fail it. Keeping a bend in the rod is the actual
    // skill of playing a fish, so the gauge has a floor as well as a ceiling.
    this._slack = this.tension < 0.06 ? this._slack + dt : 0;
    if (this._slack > 1.5) { this._lose(game, 'Slack line — it threw the hook.'); return; }

    // -- line -----------------------------------------------------------
    if (hold) this.line -= Math.max(0.25, 2.9 - pull * 1.55) * dt;
    else this.line += (running ? 0.85 : 0.3) * dt;
    if (this.line <= 0) { this._land(game); return; }
    if (this.line > this.line0 * 1.35 + 4) { this._lose(game, 'It spooled you.'); return; }

    // -- stamina --------------------------------------------------------
    const drain = (0.06 + (hold ? 0.05 : 0) + (counter ? 0.115 : 0)) * (1 + anglersEye);
    this.stamina = Math.max(0, this.stamina - (drain * dt * 8) / f.stamina);

    this.note = this._lunge > 0 ? 'It is going! Off the reel and lean into it'
      : this.tension > SNAP_AT ? 'Give it line!'
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
    // The fight's last note ("It is tiring -- reel now") otherwise sits under
    // the result card telling you to reel a fish that is already in the bag.
    this.note = 'Into the bag. Ignis can work with that.';
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
    // Warm dark brown with a little sheen, not black: at this size a pure-black
    // cylinder against water reads as a hole in the frame rather than a rod.
    const mat = new THREE.MeshStandardMaterial({ color: 0x50402e, roughness: 0.38, metalness: 0.22 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.019, 1.72, 6), mat);
    shaft.position.y = 0.85;
    rod.add(shaft);
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.023, 0.021, 0.26, 6),
      new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.9 }));
    grip.position.y = 0.1;
    rod.add(grip);
    const tip = new THREE.Object3D();
    tip.position.y = 1.70;
    rod.add(tip);
    // The orientation is written every frame in `_tackleFrame`; this is only
    // what it looks like on the frame it is created.
    rod.rotation.set(0.42, 0, 0.08);
    this._rod = rod; this._tip = tip;
    (hand || game.scene).add(rod);

    const bob = new THREE.Group();
    // A float has to be legible at 30 m against moving water, so it is bigger
    // than scale and lit from inside. The first pass was 7.5 cm and physically
    // correct, and could not be found in the capture at all.
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xf2543c, roughness: 0.42, emissive: 0x7a1a0c, emissiveIntensity: 1.1 }));
    top.position.y = 0.10;
    const bottom = new THREE.Mesh(
      new THREE.SphereGeometry(0.125, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xf6f4ec, roughness: 0.5, emissive: 0x3a3a34 }));
    bottom.position.y = -0.05;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.34, 5),
      new THREE.MeshStandardMaterial({ color: 0xf6f4ec, roughness: 0.5, emissive: 0x3a3a34 }));
    stem.position.y = 0.30;
    bob.add(stem);
    bob.add(top, bottom);
    this._bob = bob;
    game.scene.add(bob);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.66, 28),
      new THREE.MeshBasicMaterial({ color: 0xdceaf5, transparent: true, opacity: 0.45, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    this._ring = ring;
    game.scene.add(ring);

    // **A cylinder, not a `THREE.Line`.** `linewidth` is a no-op on every WebGL
    // renderer, so a `Line` is one pixel wide whatever you ask for -- against
    // sunlit water it disappeared entirely in the first three captures, and a
    // fishing game where you cannot see the line is missing its subject. A unit
    // cylinder scaled and aimed between the rod tip and the float is one draw
    // call with real thickness. It is drawn taut, which is what a hooked line
    // is; the sag the `Line` carried never read anyway.
    const lineMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 5, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xf8fcff, transparent: true, opacity: 0.85, depthWrite: false }));
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
    const level = spot.level;

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

    // **Aim the rod in world space, not in the socket's.** It hangs off
    // `attach.handR`, which is a bone: whatever local Euler looks right in one
    // pose is a spear through Noctis' head in the next, and the first capture
    // was exactly that. The shaft is the group's +Y, so a `YXZ` Euler of
    // (tilt, heading, roll) points it along the player's facing and leans it
    // back by `tilt` -- and then the parent's world rotation is divided out.
    const player = game.get('Player');
    if (rod && rod.parent && player) {
      const load = this.phase === 'fight' ? this.tension
        : this.phase === 'cast' ? this.power * 0.5 : 0.1;
      // Upright between casts, driven down toward the water as the fish loads
      // it. 0.42 rad off vertical at rest, 1.05 with the line singing.
      const tilt = 0.42 + load * 0.63;
      const roll = this.phase === 'fight' ? -this.tilt * 0.42 : 0.08;
      _rodEuler.set(tilt, player.heading, roll, 'YXZ');
      _rodQ.setFromEuler(_rodEuler);
      rod.parent.getWorldQuaternion(_parentQ);
      rod.quaternion.copy(_parentQ.invert()).multiply(_rodQ);
    }

    const tip = this._tipWorld(game);
    _seg.subVectors(bob.position, tip);
    const len = Math.max(0.05, _seg.length());
    lm.position.copy(tip).addScaledVector(_seg, 0.5);
    // A cylinder's axis is +Y, so aim it by rotating +Y onto the segment.
    lm.quaternion.setFromUnitVectors(_up, _seg.divideScalar(len));
    // Thicker further out so it does not vanish at 30 m, but never a rope.
    const r = 0.006 + len * 0.0005;
    lm.scale.set(r, len, r);
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

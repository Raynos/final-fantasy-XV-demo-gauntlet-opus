import * as THREE from 'three';
import { Rng } from '../util/Rng.ts';
import { EncounterDirector } from './encounters/EncounterDirector.ts';
import { Downed } from './encounters/Downed.ts';
import { HuntRuntime } from './encounters/HuntRuntime.ts';
import { PartyAI } from '../characters/ai/PartyAI.ts';
import type { ScenarioName } from './Shots.ts';
import type { Game } from './Game.ts';
import type { Enemies } from '../characters/Enemies.ts';
import type { PoseName as EnemyPoseName } from '../characters/enemies/EnemyBase.ts';
import type { Player } from '../characters/Player.ts';
import type { CombatSystem } from '../combat/CombatSystem.ts';
import type { VFX } from '../combat/VFX.ts';
import type { TrailRibbon } from '../combat/Trails.ts';
import type { Terrain } from '../world/Terrain.ts';
import { SET_PIECES } from './encounters/SpawnTables.ts';
import { bootPhase } from '../engine/BootProfile.ts';

/** Where the player was parked by a scenario, so every frame can re-assert it. */
interface FrozenPlayer {
  pos: THREE.Vector3;
  heading: number;
}

/**
 * The armiger swing a combat tableau leaves hanging in the air. Rebuilt every
 * frame against the live camera, which is why the pivot and the reach vector
 * have to survive the frame that authored them.
 */
interface FrozenSwing {
  trail: TrailRibbon;
  pivot: THREE.Vector3;
  /** Pivot -> target, in world space. */
  toTarget: THREE.Vector3;
}

/**
 * Scenario director, and the host for the live gameplay systems.
 *
 * Owns `setScenario('field'|'combat'|'warp')` — the reproducible world states
 * the screenshot harness captures. A scenario spawns enemies at seeded
 * positions, freezes them in authored poses, authors the whole VFX timeline
 * against the VFX effect clock and then **pins** that clock at the money
 * frame. Nothing depends on how many frames the harness settles for, so two
 * runs produce byte-identical images.
 *
 * Director is the last system in the tick order, which also makes it the right
 * place to run the VFX depth prepass: by `lateUpdate` the camera rig has
 * already written its final transform.
 */
export class Director {
  _ambient!: number;
  _frozenPlayer!: FrozenPlayer | null;
  _swing!: FrozenSwing | null;
  _tmp!: THREE.Vector3;
  combat!: CombatSystem | undefined;
  downed!: Downed;
  encounters!: EncounterDirector;
  enemies!: Enemies | undefined;
  game!: Game;
  /** The scenario anchor: where the player stood at boot. */
  home!: THREE.Vector3;
  homeHeading!: number;
  hunts!: HuntRuntime;
  live!: boolean;
  /** What kind of moment the HUD should dress for. Written by
   *  `EncounterDirector._publishMode()` and read by `HUD._resolveMode()`;
   *  `null` (or absent) means "no live opinion", and the scenario wins. */
  mode!: string | null;
  partyAI!: PartyAI;
  pinTime!: number;
  player!: Player | undefined;
  rng!: Rng;
  scenario!: ScenarioName | 'live' | null;
  terrain!: Terrain | undefined;
  vfx!: VFX | undefined;
  async init(game: Game) {
    this.game = game;
    this.rng = new Rng(88123);
    this.scenario = null;
    this.pinTime = 40;
    this.vfx = game.get('VFX');
    this.enemies = game.get('Enemies');
    this.combat = game.get('Combat') || game.get('CombatSystem');
    this.terrain = game.get('Terrain');
    this.player = game.get('Player');
    this.home = this.player ? this.player.position.clone() : new THREE.Vector3();
    /** Boot heading, restored by `setScenario` so a posed shot never inherits
     *  the facing a previous scenario left behind. */
    this.homeHeading = this.player ? this.player.root.rotation.y : 0;
    this._frozenPlayer = null;
    this._ambient = 0;
    this._tmp = new THREE.Vector3();

    /* ---- the live game ------------------------------------------------
     * Director is the last system in the boot order, so this is where the
     * gameplay systems get built and registered. `game.add` puts them in the
     * tick list *after* Director, which is exactly where they want to be:
     * after Player, Party and Combat have moved everything for this frame.
     */
    this.encounters = game.add(new EncounterDirector(), 'Encounters');
    await this.encounters.init(game);

    this.partyAI = game.add(new PartyAI(), 'PartyAI');
    await bootPhase('Director.partyAI', () => this.partyAI.init(game));

    this.downed = game.add(new Downed(), 'Downed');
    await bootPhase('Director.downed', () => this.downed.init(game));

    // `HuntRuntime` drives itself off the RPG's `quest-updated` events and
    // holds its own reference to the encounter director. The back-pointer that
    // used to be written here (`encounters.huntRuntime`) was never declared and
    // never read by anything.
    //
    // **Armed here, at boot, even under `?shoot`.** `init()` stages every
    // accepted quest's set piece, and under `?shoot` the `setLive(false)`
    // below tears the boss down again — 209 ms spent on a fight no frame ever
    // shows. Deferring it to the first `setLive(true)` was tried (2026-08-25)
    // and **reverted**: the staging is load-bearing for the *posed combat
    // scenarios*. Two cold captures either side of that change, against floors
    // measured for the purpose, moved `combat_stagger` 3.300/255 (floor 2.27)
    // and `combat_armiger` 2.232 (floor 2.06), with creatures visibly at
    // different points in their animation. Building and discarding the boss
    // advances state the scenarios inherit. Do not re-try this without
    // re-baselining every combat shot on purpose.
    this.hunts = bootPhase('Director.hunts', () => new HuntRuntime(this.encounters).init());

    // The capture harness boots straight into a posed shot and must not have
    // a wandering pack walk into frame; a real session starts playing.
    const posed = typeof location !== 'undefined'
      && new URLSearchParams(location.search).has('shoot');
    if (posed) this.setLive(false);
    else this.play();
  }

  /**
   * Turn the live encounter loop on or off. The screenshot scenarios author
   * the world by hand and must not have a wandering sabertusk walk into frame.
   */
  setLive(on: boolean) {
    this.live = on;
    if (this.encounters) {
      this.encounters.enabled = on;
      if (!on) {
        if (this.encounters.boss) this.encounters.endBoss(false);
        this.encounters.active.clear();
        this.encounters.packs.length = 0;
        this.encounters.state = 'field';
        /**
         * AND THE ENEMIES THEMSELVES, which this used to leave standing.
         *
         * `active` and `packs` are the *bookkeeping*; clearing them told the
         * encounter system to stop tracking spawns without despawning them.
         * `HuntRuntime.init()` stages every accepted quest's set piece at boot
         * (deliberately -- see `init()`), so under `?shoot` the tear-down left
         * **ten staged enemies alive in the world** on a page whose entire
         * purpose is a posed capture. That contradicts this method's own
         * contract two lines up: "must not have a wandering sabertusk walk
         * into frame".
         *
         * It is also, measured, the whole of `drawcheck`'s 60-call
         * disagreement with itself. Posing one shot repeatedly and restarting
         * the daemon between series gave `579 514 514 514 514 574 514`, three
         * times identically: runs 1 and 6 boot a page, the rest reuse one, and
         * a reused page drew 60 FEWER calls -- ten enemies at roughly six
         * draws each (mesh, three shadow cascades, velocity proxy). The
         * *reused* page was right and the freshly booted one was wrong.
         * `Director.scenario()` already calls `enemies.clear()` on the first
         * posed shot, so every scenario has always started from an empty field;
         * this only makes boot agree with it instead of disagreeing for one
         * shot.
         */
        if (this.enemies) { this.enemies.clear(); this.enemies.frozen = false; }
      }
    }
    if (this.partyAI) {
      this.partyAI.enabled = on;
      if (!on && this.partyAI.party) {
        for (const m of this.partyAI.party.members) {
          if (m.baseSlot) m.slot.copy(m.baseSlot);
          if (m.baseSpeedMul) m.speedMul = m.baseSpeedMul;
          m.aiState = 'follow';
          m.aiTarget = null;
          m.reviveTarget = null;
        }
      }
    }
    if (this.downed && !on) {
      this.downed.state = 'ok';
      if (this.player) this.player.downed = false;
      if (this.game.input) this.game.input.enabled = true;
    }
  }

  /* --------------------------------------------------------- helpers */

  /** World position relative to the scenario anchor, snapped to the terrain. */
  at(dx: number, dz: number, dy = 0) {
    const p = new THREE.Vector3(this.home.x + dx, 0, this.home.z + dz);
    p.y = (this.terrain ? this.terrain.heightAt(p.x, p.z) : 0) + dy;
    return p;
  }

  /** Face `e` toward a world point. */
  face<T extends { heading: number, root: THREE.Object3D }>(e: T, p: THREE.Vector3): T {
    e.heading = Math.atan2(p.x - e.root.position.x, p.z - e.root.position.z);
    e.root.rotation.y = e.heading;
    return e;
  }

  /**
   * Fill the air with drifting motes/dust whose spawn times are spread into
   * the past, so a *frozen* frame still shows a fully populated, mid-life
   * particle field instead of a single burst.
   */
  seedAmbient(centre: THREE.Vector3, radius: number, t0: number, { motes = 90, dust = 60, color = 0xffd9a8 } = {}) {
    const vfx = this.vfx, rng = this.rng;
    if (!vfx) return;
    const c = new THREE.Color(color);
    for (let i = 0; i < motes; i++) {
      const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * radius;
      vfx.motes.emit({
        pos: {
          x: centre.x + Math.cos(a) * r,
          y: centre.y + rng.range(0.1, 5.0),
          z: centre.z + Math.sin(a) * r,
        },
        vel: { x: rng.gauss(0, 0.35), y: rng.range(0.15, 0.8), z: rng.gauss(0, 0.35) },
        color: c, t0: t0 - rng.range(0.1, 3.4), life: 3.6,
        size0: rng.range(0.05, 0.14), size1: rng.range(0.02, 0.08),
        drag: 0.5, gravity: 0.05, turbulence: 0.18,
        intensity: rng.range(1.6, 4.2), fade: 1.0,
      });
    }
    const d = new THREE.Color(0xc4b49a);
    for (let i = 0; i < dust; i++) {
      const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * radius * 1.4;
      vfx.dust.emit({
        pos: {
          x: centre.x + Math.cos(a) * r,
          y: centre.y + rng.range(0.05, 3.2),
          z: centre.z + Math.sin(a) * r,
        },
        vel: { x: rng.gauss(0, 0.5), y: rng.range(0.05, 0.4), z: rng.gauss(0, 0.5) },
        color: d, t0: t0 - rng.range(0.2, 4.0), life: 4.6,
        size0: rng.range(0.10, 0.35), size1: rng.range(0.3, 0.9),
        drag: 0.7, gravity: -0.05, turbulence: 0.25,
        spin: rng.next() * 6.28, spinRate: rng.gauss(0, 0.4),
        intensity: 0.45, fade: 1.6,
      });
    }
  }

  /* ------------------------------------------------------- scenarios */

  /**
   * Put the world into a named, reproducible gameplay state.
   */
  setScenario(name: ScenarioName) {
    // Deliberately NOT `if (name === this.scenario) return`.
    //
    // A scenario is a *reproducible world state*, so re-applying it has to
    // actually re-apply. The early-out that used to be here made consecutive
    // shots of the same scenario skip the reset entirely: in a corpus run the
    // fifth and sixth `field` shots inherited wherever the previous shot's
    // settle frames had drifted the player, so a `follow` shot's framing
    // depended on what ran before it. `prompto_closeup` came back with the
    // camera behind his head, and one batch put it inside another party member.
    // Re-running costs a few ms of respawn per shot and buys determinism.
    this.scenario = name;
    // a posed scenario owns the whole field; the live loop stands down
    this.setLive(false);

    const { vfx, enemies, combat, player } = this;
    if (vfx) vfx.reset();
    if (enemies) { enemies.clear(); enemies.frozen = false; }
    if (combat) {
      combat.scenarioLock = false;
      combat.lockOn(null);
      combat.armiger.active = 0;
      combat.armiger.group.visible = false;
      combat.state = 'idle';
      combat.warp = null;
      if (combat.weapon) combat.weapon.setReveal(1);
    }
    this._frozenPlayer = null;
    this._swing = null;
    if (player) {
      player.root.position.copy(this.home);
      player.velocity.set(0, 0, 0);
      // Heading carries too: without this a field shot after a boss scenario
      // keeps the boss facing, and the party formation - which is defined in
      // the player's frame - rotates with it.
      player.heading = this.homeHeading;
      player.root.rotation.y = this.homeHeading;
      player.speed = 0;
      if (player.character && player.character.anim) player.character.anim.rest();
    }
    this.rng = new Rng(88123);

    if (name === 'combat') this._combatScenario();
    else if (name === 'warp') this._warpScenario();
    else if (name === 'boss_field') this._bossScenario('bloodhorn');
    else if (name === 'boss_imperial') this._bossScenario('magitek_armour');
    else if (name === 'boss_astral') this._bossScenario('titan');
    else if (name === 'daemons') this._daemonScenario();
    else if (name === 'setpiece_astral') this._setPieceScenario('titan');
    else if (name === 'setpiece_field') this._setPieceScenario('deadeye');
    else this._fieldScenario();
  }

  /**
   * A set piece that is actually **running**, rather than a posed still of one.
   *
   * Every other boss scenario here spawns the mark itself and freezes it. That
   * is right for a portrait and it is precisely why `BossFight` — the system
   * that owns arena bounds, phase transitions and the fist that lands — had
   * never executed in a capture or in play. `LANDMINES.md` has carried
   * `BossFight.resolveStrike` as dead code for weeks; it is not dead, it was
   * unreachable, and the two are indistinguishable from a coverage report.
   *
   * So this one starts the fight through the same `startSetPiece` the hunt
   * runtime calls and then leaves the loop live, which means the capture is of
   * whatever the fight genuinely does N fixed steps in.
   *
   * Determinism survives because the ingredients are deterministic: `settle()`
   * is a fixed timestep, `this.rng` was reseeded above, `BossFight` contains no
   * `Math.random`, and roamers — the one live system that would wander
   * something unrelated into frame — are suppressed. The VFX clock is
   * deliberately *not* pinned: pinning it is what makes the posed shots
   * reproducible, and here the whole subject is the passage of time.
   *
   * @param id which `SET_PIECES` entry to run
   */
  _setPieceScenario(id: 'titan' | 'deadeye') {
    const enc = this.encounters;
    const { enemies, player } = this;
    if (!enc || !enemies) { this._fieldScenario(); return; }
    this.game.state = 'combat';

    // Live, but only for the fight. `setLive(true)` re-enables the encounter
    // loop wholesale, so the roamer half is turned back off immediately —
    // a wandering sabertusk in a Titan capture is the exact failure the posed
    // scenarios exist to avoid.
    this.setLive(true);
    enc.suppressRoamers = true;
    enc.packs.length = 0;
    enc.active.clear();
    enemies.frozen = false;

    // The player moves BEFORE the fight starts, not after. `BossFight.begin`
    // computes the mark's standing position from a bearing off the player, so
    // starting first and repositioning second puts the boss behind the camera.
    // That ordering is load-bearing and not obvious from either file alone.
    const def = SET_PIECES[id];
    const arena = def ? def.at : null;
    if (player && arena) {
      // Outside the mark's reach, facing it. Titan's arena is 62 m and his
      // reach is most of it, so the stand-off comes from the kind rather than
      // from a guess.
      const back = def.kind === 'astral' ? 34 : 12;
      const px = arena[0], pz = arena[1] + back;
      player.root.position.set(px, this.groundY(px, pz), pz);
      player.velocity.set(0, 0, 0);
      const h = Math.PI;                       // looking back along -z, at the mark
      player.heading = h;
      player.root.rotation.y = h;
      player.speed = 0;
      if (player.character && player.character.anim) player.character.anim.rest();
    }

    return enc.startSetPiece(id);
  }

  /** Ground height at a world xz, or the scenario anchor's if terrain is absent. */
  groundY(x: number, z: number): number {
    const t = this.game.get('Terrain');
    return t && t.heightAt ? t.heightAt(x, z) : this.home.y;
  }

  /**
   * A posed boss encounter for the harness: the mark mid-telegraph, its adds
   * fanned out around it, the party braced, and the VFX clock pinned.
   */
  _bossScenario(key: 'bloodhorn' | 'magitek_armour' | 'titan') {
    const { vfx, enemies, combat, player } = this;
    const T = this.pinTime;
    this.game.state = 'combat';
    if (!vfx || !enemies) return;
    vfx.pin(T);
    if (combat) combat.scenarioLock = true;

    const A = this.home.clone();
    if (player) {
      player.heading = Math.PI;
      player.root.rotation.y = Math.PI;
      this._frozenPlayer = { pos: A.clone(), heading: Math.PI };
    }

    const far = key === 'titan' ? -54 : key === 'magitek_armour' ? -17 : -13;
    const boss = enemies.spawn(key, { pos: this.at(key === 'titan' ? 4 : -1.5, far), expClass: 'boss' });
    this.face(boss, A);
    boss.stateTime = 0.7;
    boss.phaseIndex = key === 'titan' ? 1 : 2;
    boss.attackId = key === 'titan' ? 'slam_r' : key === 'magitek_armour' ? 'overload' : 'charge';
    boss.attack = (boss.attacks || []).find((a) => a.id === boss.attackId) || null;
    boss.freeze('telegraph', key === 'titan' ? 6.2 : 4.4);

    if (key === 'magitek_armour') {
      const spots = [[-7.5, -12], [6.2, -13], [-11, -19], [10.5, -20]];
      spots.forEach((s, i) => {
        const e = enemies.spawn(i === 3 ? 'axeman' : 'mt', { pos: this.at(s[0], s[1]) });
        this.face(e, A);
        e.stateTime = 0.3 + i * 0.15;
        e.freeze(i % 2 ? 'attack' : 'approach', 2.1 + i * 0.9);
      });
    } else if (key === 'bloodhorn') {
      [[-8.5, -9], [7.5, -10]].forEach((s, i) => {
        const e = enemies.spawn('dualhorn', { pos: this.at(s[0], s[1]) });
        this.face(e, A);
        e.stateTime = 0.5;
        e.freeze(i ? 'approach' : 'telegraph', 1.7 + i * 1.3);
      });
    }
    enemies.frozen = true;

    if (combat) {
      combat.setWeapon('greatsword', { materialise: false });
      combat.weapon.setReveal(1);
      combat.lockOn(boss);
    }

    const c = boss.centre();
    if (key === 'titan') {
      const at = this.at(2, -20);
      vfx.shockwave({ pos: at, terrain: this.terrain, radius: 15, color: 0xffb060, t0: T - 0.45, intensity: 4.2 });
      vfx.dustPuff({ pos: at, count: 60, radius: 8, speed: 15, life: 3.4, t0: T - 0.5, size: 2.4, grow: 3.4, up: 1.6, intensity: 0.55 });
      vfx.flash({ pos: at, color: 0xffa060, intensity: 70, distance: 40, life: 0.6, t0: T - 0.45, priority: 6 });
    } else {
      vfx.flare({ pos: c, color: key === 'magitek_armour' ? 0xff5030 : 0xffd090, size: 2.6, life: 0.6, t0: T - 0.2, intensity: 6 });
      vfx.dustPuff({ pos: this.at(-1.5, far), count: 30, radius: 2.6, speed: 6, life: 2.4, t0: T - 0.8, size: 1.1, grow: 3.2, intensity: 0.5 });
    }
    this.seedAmbient(A, 26, T, { motes: 110, dust: 90, color: key === 'titan' ? 0xffb070 : 0xffd9a8 });
    if (combat) {
      combat.emit('lockon', { enemy: boss });
      combat.emit('damage', {
        enemy: boss, damage: key === 'titan' ? 4871 : 2166, position: c,
        crit: true, element: null, killed: false, staggered: false,
      });
    }
  }

  /** A night daemon pack, for the "the sun went down" capture. */
  _daemonScenario() {
    const { vfx, enemies, combat, player } = this;
    const T = this.pinTime;
    this.game.state = 'combat';
    if (!vfx || !enemies) return;
    vfx.pin(T);
    if (combat) combat.scenarioLock = true;

    const A = this.home.clone();
    if (player) {
      player.heading = Math.PI;
      player.root.rotation.y = Math.PI;
      this._frozenPlayer = { pos: A.clone(), heading: Math.PI };
    }
    const cast: Array<[string, number, number, EnemyPoseName, number]> = [
      ['goblin', -3.2, -5.0, 'attack', 1.6],
      ['goblin', 2.6, -6.2, 'approach', 2.4],
      ['hobgoblin', -6.4, -8.0, 'telegraph', 3.1],
      ['bussemand', 5.5, -11.0, 'telegraph', 4.2],
      ['necromancer', -10.5, -14.0, 'attack', 5.0],
      ['arachne', 9.0, -15.5, 'approach', 2.8],
    ];
    for (const [key, dx, dz, state, phase] of cast) {
      const e = enemies.spawn(key, { pos: this.at(dx, dz) });
      this.face(e, A);
      e.stateTime = 0.4;
      e.freeze(state, phase);
    }
    enemies.frozen = true;
    if (combat) {
      combat.setWeapon('polearm', { materialise: false });
      combat.weapon.setReveal(1);
    }
    this.seedAmbient(A, 24, T, { motes: 130, dust: 70, color: 0x8a7cff });
  }

  _fieldScenario() {
    if (this.vfx) this.vfx.unpin();
    this.game.state = 'field';
  }

  /**
   * Hand the world to the live encounter loop: roaming packs, patrols,
   * day/night spawn windows, party combat AI, death and revive.
   *
   * This is what `main.ts` (or a test harness) calls to actually play.
   */
  play() {
    this.scenario = 'live';
    /**
     * A posed shot is no longer in force, and several systems test for that by
     * reading `game.currentShot` directly rather than by asking the Director.
     *
     * `RegaliaSystem._input` is the one that bites: its first line is
     * `if (!inp || inp.enabled === false || game.currentShot) return`, so
     * **once any shot has been applied, the car's entire input path is dead
     * for the life of the page** — no Drive prompt, no F, no camera, no radio,
     * no handing the wheel to Ignis. `probes/regaliadrive.mts` found it at
     * 3.4 m from the driver's door with the prompt reading null.
     *
     * It never showed in a real session, because a real session never applies
     * a shot. It shows in every path that goes posed -> live: the `?debug` dev
     * suite, a cutscene handing back to play, and every probe in
     * `src/tools/probes/`. `play()` is *the* go-live entry point and it was
     * leaving the flag that says "a capture owns this frame" standing.
     */
    this.game.currentShot = null;
    if (this.vfx) this.vfx.unpin();
    if (this.enemies) { this.enemies.clear(); this.enemies.frozen = false; }
    if (this.combat) this.combat.scenarioLock = false;
    this._frozenPlayer = null;
    this._swing = null;
    this.game.state = 'field';
    this.setLive(true);
    return this.encounters;
  }

  /* ------------------------------------------------------------ combat */

  _combatScenario() {
    const { vfx, enemies, combat, player, terrain } = this;
    const T = this.pinTime;
    this.game.state = 'combat';
    if (!vfx || !enemies) return;
    vfx.pin(T);
    if (combat) combat.scenarioLock = true;

    const A = this.home.clone();
    if (player) {
      player.heading = Math.PI;              // facing away from camera, into the fight
      player.root.rotation.y = Math.PI;
      this._frozenPlayer = { pos: A.clone(), heading: Math.PI };
    }

    /* ---- the pack ---------------------------------------------------- */
    const lunge = enemies.spawn('sabertusk', { pos: this.at(-2.0, -3.6) });
    lunge.root.position.y += 1.15;                    // mid-pounce, airborne
    this.face(lunge, A);
    lunge.stateTime = 0.14;
    lunge.freeze('pounce', 3.1);

    const runner = enemies.spawn('sabertusk', { pos: this.at(3.0, -4.6) });
    this.face(runner, A);
    runner.stateTime = 0.8;
    runner.freeze('run', 1.42);

    const stalker = enemies.spawn('sabertusk', { pos: this.at(-9.0, -4.5) });
    this.face(stalker, A);
    stalker.stateTime = 0.34;
    stalker.freeze('telegraph', 2.2);

    const goblin = enemies.spawn('goblin', { pos: this.at(2.9, -2.3) });
    this.face(goblin, A);
    goblin.stateTime = 0.42;
    goblin.freeze('stagger', 1.9);

    const mt = enemies.spawn('mt', { pos: this.at(-2.0, -12.0) });
    this.face(mt, A);
    mt.stateTime = 0.035;
    mt.freeze('attack', 4.4);

    const giant = enemies.spawn('irongiant', { pos: this.at(-14.0, -10.0) });
    this.face(giant, A);
    giant.stateTime = 0.86;
    giant.freeze('telegraph', 5.5);

    enemies.frozen = true;

    /* ---- the player's swing ------------------------------------------ */
    const target = lunge.centre();
    const pivot = A.clone(); pivot.y += 1.28;
    const toTarget = this._tmp.subVectors(target, pivot).normalize().clone();
    if (combat) {
      combat.setWeapon('sword', { materialise: false });
      combat.weapon.setReveal(1);
      // orient the blade along the end of the arc
      combat.hand.position.set(0.34, 1.30, 0.18);
      const trail = vfx.trails.acquire();
      const t = combat.weapon.def.trail;
      trail.setColors(t.head, t.tail, 0xffffff);
      trail.life = 0.34;
      trail.uniforms.uLife.value = 0.34;
      trail.uniforms.uIntensity.value = 2.1;
      // The swing plane is rebuilt every frame against the live camera so the
      // arc always presents itself face-on instead of collapsing edge-on.
      this._swing = { trail, pivot, toTarget: toTarget.clone() };
      this._rebuildSwing();
      combat.lockOn(lunge);
      combat.armiger.active = 0.75;
      combat._armigerCentre = A.clone();
      combat._armigerOpts = { radius: 1.65, height: 1.95, tilt: 0.42 };
      combat.armiger.setClock(T);
      combat.armiger.layout(A, T, combat._armigerOpts);
    }

    /* ---- the hit landing on the lunging sabertusk -------------------- */
    const hitAt = lunge.centre();
    hitAt.y += 0.12;
    const hitDir = new THREE.Vector3().subVectors(hitAt, pivot).normalize();
    vfx.impact({
      pos: hitAt, dir: hitDir, scale: 1.7, color: 0xffd49a,
      t0: T - 0.085, blood: true, terrain: null,
    });
    vfx.flare({ pos: hitAt, color: 0xfff0d8, size: 1.5, life: 0.28, t0: T - 0.085, intensity: 3.0 });
    vfx.airRing({ pos: hitAt, color: 0xffd9a0, from: 0.25, to: 3.2, life: 0.30, t0: T - 0.085, intensity: 2.6 });
    vfx.crystalBurst({
      pos: hitAt, count: 14, speed: 5.5, t0: T - 0.085, life: 0.55,
      size: 0.16, color: 0x8fd8ff, gravity: -7,
    });
    vfx.dustPuff({
      pos: this.at(-2.0, -3.6), count: 22, radius: 0.7, speed: 3.6,
      life: 1.6, t0: T - 0.42, size: 0.7, grow: 3.2,
    });

    /* ---- elemancy in the background --------------------------------- */
    if (combat && combat.elemancy) {
      const firePos = mt.centre(); firePos.y = this.at(-2.0, -12.0).y + 0.25;
      combat.elemancy.cast('fire', { pos: firePos, t0: T - 1.15, power: 1.3, terrain });
      const icePos = this.at(-7.2, -6.4, 0.15);
      combat.elemancy.cast('ice', { pos: icePos, t0: T - 0.95, power: 1.0, terrain });
    }

    /* ---- running dust from the flanker ------------------------------- */
    vfx.dustPuff({
      pos: this.at(3.0, -4.6), count: 18, radius: 0.5, speed: 2.6,
      life: 1.5, t0: T - 0.55, size: 0.55, grow: 3.0,
    });
    vfx.dustPuff({
      pos: this.at(-14.0, -10.0), count: 26, radius: 1.6, speed: 3.0,
      life: 2.4, t0: T - 1.1, size: 1.2, grow: 3.2, intensity: 0.7,
    });

    this.seedAmbient(A, 22, T, { motes: 110, dust: 80 });

    /* ---- surface the damage numbers other systems render ------------- */
    if (combat) {
      combat.emit('damage', {
        enemy: lunge, damage: 1284, position: hitAt, crit: true,
        element: null, killed: false, staggered: false,
      });
      combat.emit('damage', {
        enemy: goblin, damage: 486, position: goblin.centre(),
        crit: false, element: 'ice', killed: false, staggered: true,
      });
      combat.emit('damage', {
        enemy: mt, damage: 731, position: mt.centre(),
        crit: false, element: 'fire', killed: false, staggered: false,
      });
      combat.emit('hit', { enemy: lunge, position: hitAt, weapon: 'sword', blindside: true });
    }
  }

  /* -------------------------------------------------------------- warp */

  _warpScenario() {
    const { vfx, enemies, combat, player, terrain } = this;
    const T = this.pinTime;
    this.game.state = 'combat';
    if (!vfx || !enemies) return;
    vfx.pin(T);
    if (combat) combat.scenarioLock = true;

    const A = this.home.clone();

    /* ---- the target: an Iron Giant caught mid-swing ------------------ */
    const giantPos = this.at(0.6, -12.0);
    const giant = enemies.spawn('irongiant', { pos: giantPos });
    this.face(giant, A);
    giant.stateTime = 0.92;
    giant.freeze('telegraph', 7.3);

    const flankA = enemies.spawn('sabertusk', { pos: this.at(5.2, -6.0) });
    this.face(flankA, A); flankA.stateTime = 0.6; flankA.freeze('run', 0.9);
    const flankB = enemies.spawn('sabertusk', { pos: this.at(-8.5, -5.5) });
    this.face(flankB, A); flankB.stateTime = 0.4; flankB.freeze('run', 2.35);
    const mt = enemies.spawn('mt', { pos: this.at(-5.5, -16.0) });
    this.face(mt, A); mt.stateTime = 0.6; mt.freeze('telegraph', 3.0);
    enemies.frozen = true;

    /* ---- the warp itself --------------------------------------------- */
    const impact = giantPos.clone().add(new THREE.Vector3(0.30, 3.25, 3.50));
    const origin = impact.clone().add(new THREE.Vector3(-9.2, -3.0, -1.4));
    const groundY = terrain ? terrain.heightAt(origin.x, origin.z) : 0;
    origin.y = Math.max(origin.y, groundY + 0.95);

    const dash = 0.16;
    const t0 = T - 0.235;                  // impact lands 0.075 s before the pin
    const impactT = vfx.warpStrike({
      from: origin, to: impact, t0, dash, terrain, scale: 1.2,
    });

    /* ---- Noctis, materialising at the point of impact ---------------- */
    const dir = new THREE.Vector3().subVectors(impact, origin).normalize();
    if (player) {
      const stand = impact.clone().addScaledVector(dir, -0.75);
      player.root.position.set(stand.x, stand.y - 1.12, stand.z);
      player.heading = Math.atan2(dir.x, dir.z);
      player.root.rotation.y = player.heading;
      player.velocity.set(0, 0, 0);
      this._frozenPlayer = { pos: player.root.position.clone(), heading: player.heading };
    }
    if (combat) {
      combat.setWeapon('sword', { materialise: false });
      combat.weapon.setReveal(1);
      combat.hand.position.set(0.24, 1.30, 0.44);
      combat.hand.quaternion.setFromUnitVectors(UP, dir);
      // straight blade smear pulled along the dash line, not an arc
      const trail = vfx.trails.acquire();
      trail.setColors(0xdff2ff, 0x1f5fd0, 0xffffff);
      trail.life = 0.26;
      trail.uniforms.uLife.value = 0.26;
      trail.uniforms.uIntensity.value = 1.8;
      const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
      const n = trail.segments;
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1);
        const c = impact.clone().addScaledVector(dir, -f * 2.6);
        const sm = trail._samples[i];
        sm.b.copy(c).addScaledVector(side, -0.05 - f * 0.10);
        sm.t.copy(c).addScaledVector(side, 0.05 + f * 0.10).addScaledVector(UP, 0.55 - f * 0.35);
        sm.age = f * 0.26 * 0.8;
      }
      trail.count = n;
      trail.active = true;
      trail.strength = 1;
      trail.uniforms.uStrength.value = 1;
      trail.mesh.visible = true;
      trail._rebuild();
      combat.lockOn(giant);
      // a few phantom arms still hanging in the air from the launch
      combat.armiger.active = 0.55;
      combat._armigerCentre = origin.clone();
      combat._armigerOpts = { radius: 1.7, height: 1.2, tilt: 0.4 };
      combat.armiger.setClock(T);
      combat.armiger.layout(origin, T, combat._armigerOpts);
    }

    /* ---- crystal aura still clinging to the body -------------------- */
    const body = impact.clone().addScaledVector(dir, -0.55);
    vfx.crystalBurst({
      pos: body, count: 20, speed: 3.4, t0: T - 0.09, life: 0.75,
      size: 0.20, color: 0x4fb6ff, gravity: -4, drag: 2.4,
    });
    vfx.moteBurst({
      pos: body, count: 30, speed: 2.2, color: 0x7fd0ff, life: 0.9,
      t0: T - 0.14, size: 0.22, gravity: 0.6, intensity: 4.5, jitter: 0.45,
    });

    /* ---- world reaction ---------------------------------------------- */
    vfx.flash({ pos: body, color: 0x8ed4ff, intensity: 40, distance: 12, life: 0.6, t0: T - 0.1, priority: 6 });
    vfx.dustPuff({
      pos: this.at(0.6, -12.0), count: 28, radius: 2.2, speed: 5.5,
      life: 2.0, t0: impactT, size: 0.85, grow: 3.0, up: 1.0, intensity: 0.45,
    });
    vfx.dustPuff({
      pos: origin.clone().setY(groundY), count: 22, radius: 1.1, speed: 4.6,
      life: 1.8, t0, size: 0.6, grow: 2.8, up: 1.2, intensity: 0.45,
    });

    this.seedAmbient(A.clone().lerp(giantPos, 0.5), 20, T, { motes: 120, dust: 90, color: 0x9fd8ff });

    if (combat) {
      combat.emit('warp', { phase: 'impact', from: origin, to: impact, enemy: giant });
      combat.emit('damage', {
        enemy: giant, damage: 3187, position: impact, crit: true,
        element: null, killed: false, staggered: true,
      });
      combat.emit('stagger', { enemy: giant });
    }
  }

  /**
   * Re-aim the authored swing arc against the live camera.
   *
   * The sweep axis is the view direction and the blade direction is the
   * component of the aim vector perpendicular to it — i.e. the target's
   * *screen-space* direction. That guarantees the arc is presented face-on
   * instead of collapsing into an edge-on sliver, whatever the shot.
   */
  _rebuildSwing() {
    const sw = this._swing;
    if (!sw) return;
    const axis = new THREE.Vector3().subVectors(sw.pivot, this.game.camera.position).normalize();
    const start = sw.toTarget.clone().addScaledVector(axis, -sw.toTarget.dot(axis));
    if (start.lengthSq() < 1e-4) start.copy(UP).addScaledVector(axis, -UP.dot(axis));
    start.normalize();
    sw.trail.setArc({
      pivot: sw.pivot,
      axis,
      start,
      from: -2.30, to: 0.14,
      inner: 1.78, outer: 2.42,
      ageSpread: 0.95,
    });
    // the blade itself finishes on the arc, not pointing down the lens
    if (this.combat && this.combat.hand) {
      const end = start.clone().applyAxisAngle(axis, 0.12).normalize();
      this.combat.hand.quaternion.setFromUnitVectors(UP, end);
    }
  }

  /* ------------------------------------------------------------- tick */

  update(dt: number, game: Game) {
    // hold the authored player transform against Player.update
    if (this._frozenPlayer && this.player) {
      this.player.root.position.copy(this._frozenPlayer.pos);
      this.player.heading = this._frozenPlayer.heading;
      this.player.root.rotation.y = this._frozenPlayer.heading;
      this.player.velocity.set(0, 0, 0);
    }
    if (this._swing) this._rebuildSwing();
    if (this.scenario === 'field' && this.vfx && this.player) {
      // a little drifting life in the air so field shots are never sterile
      this._ambient += dt;
      if (this._ambient > 0.12) {
        this._ambient = 0;
        const p = this.player.position;
        const a = this.rng.next() * Math.PI * 2, r = 4 + this.rng.next() * 14;
        this.vfx.motes.emit({
          pos: { x: p.x + Math.cos(a) * r, y: p.y + this.rng.range(0.3, 4.5), z: p.z + Math.sin(a) * r },
          vel: { x: this.rng.gauss(0, 0.3), y: this.rng.range(0.1, 0.6), z: this.rng.gauss(0, 0.3) },
          color: AMBIENT_COL, t0: this.vfx.clock, life: 4.5,
          size0: this.rng.range(0.04, 0.12), size1: 0.02,
          drag: 0.5, gravity: 0.04, turbulence: 0.2,
          intensity: this.rng.range(1.4, 3.4), fade: 1.0,
        });
      }
    }
  }

  /**
   * Last lateUpdate of the frame — the camera is final, so this is where the
   * VFX depth prepass runs (soft particles need scene depth from this frame's
   * viewpoint).
   */
  lateUpdate(dt: number, game: Game) {
    if (this.vfx && this.vfx.renderDepthPrepass) this.vfx.renderDepthPrepass(game);
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const AMBIENT_COL = new THREE.Color(0xffd9a8);

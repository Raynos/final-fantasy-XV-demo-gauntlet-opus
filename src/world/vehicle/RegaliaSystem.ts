import * as THREE from 'three';
import { buildRegalia } from '../props/Regalia.ts';
import { RoadPath } from './RoadPath.ts';
import { VehicleBody } from './VehicleBody.ts';
import { AutoDrive } from './AutoDrive.ts';
import { DriveCamera } from './DriveCamera.ts';
import { Occupants } from './Occupants.ts';
import { Banter } from './Banter.ts';
import { Radio } from '../../audio/Radio.ts';
import type { Game } from '../../game/Game.ts';
import type { RegaliaBuild, RegaliaWheel } from '../props/Regalia.ts';
import type { RoadPoint } from './RoadPath.ts';
import type { DriveControls } from './VehicleBody.ts';
import type { BanterCtx, NearLandmark } from './Banter.ts';
import type { Terrain } from '../Terrain.ts';
import type { Landmark } from '../terrain/Field.ts';
import type { EcoSite } from '../props/EcoSites.ts';
import { ROAMERS } from '../../game/encounters/SpawnTables.ts';

/**
 * The road trip.
 *
 * One system that owns the drivable Regalia and everything hanging off it:
 * the chassis simulation, Ignis at the wheel, the driving camera, the four of
 * them sitting in it, the banter, the radio, the fuel, and the headlights that
 * have to earn their keep after dark.
 *
 * Node hierarchy — every layer exists for a reason:
 *
 *   root    position = chassis, rotation.y = heading
 *     tilt    rotation.x = pitch, rotation.z = roll   (heading frame: +Z fwd)
 *       pivot   rotation.y = -90 deg, y = -wheelRadius
 *         car   the Regalia mesh, whose own forward is +X and whose y=0 is the
 *               ground plane
 *       seat_*  four occupant anchors, unscaled, in the heading frame
 *
 * Keeping pitch/roll on their own node above the -90 degree pivot means the
 * weight-transfer maths never has to care which way the art happens to face.
 *
 * Cross-system surface (nothing else may edit this file's neighbours):
 *   regalia.enter() / .exit() / .isDriving
 *   regalia.setAutoDrive(bool) / .driveTo(x, z, name)
 *   regalia.refuel(fraction)              <- Hammerhead calls this
 *   regalia.addFuelStation({x, z, r, name})
 *   regalia.fuel  0..1
 *   regalia.body  the VehicleBody, for the HUD speedo
 */

/**
 * The driving keymap.
 *
 * Every key here except `enter` only does anything while you are actually in
 * the car — and, since `da4530c`, that sentence is finally true of the game
 * rather than only of this file.
 *
 * **The history is worth keeping, because the comment that used to sit here
 * was the bug.** It claimed these keys "are still chosen not to collide with
 * anything on foot", which reads as if getting into the car switches keymaps.
 * It did not. `CombatSystem.update` gated its input read on `input.enabled`
 * and its own `scenarioLock`; nothing set either when the player got in, and
 * `isDriving` had three readers in the tree, all UI. Combat and the car read
 * the same keyboard on the same frame, so five keys fired two verbs each:
 *
 *   V -> camera + `setLockOn`     T -> Type-D + `drawEnergy`
 *   B -> radio  + `castSlot(2)`   F -> exit   + `heavy`
 *   Space -> handbrake + `dodge`  (visible: `state: idle -> dodge` at 90 km/h)
 *
 * Measured by counting calls rather than outcomes in
 * `src/tools/_probe/inputcollide.mts`, because an outcome is conditional and
 * `setLockOn(autoTarget())` with no enemy nearby changes nothing.
 *
 * These three keys were briefly rebound to Y / O / U as a lane-local
 * workaround while the real fix — one line in `CombatSystem.update` — belonged
 * to another lane. That line landed, so they are back where every document in
 * the game says they are, and `uxcheck` no longer takes the mode on trust: it
 * drives the car, presses these keys, and asserts no combat verb answers, then
 * gets out and asserts every one of them does.
 *
 * `I` for "let Ignis drive" (it was G, which is Gladiolus' technique) and `L`
 * for lights (it was H, the global controls card) remain chosen to avoid
 * on-foot collisions outright, which is still the better way to pick a key.
 */
const KEY = {
  enter: 'KeyF',
  camera: 'KeyV',
  auto: 'KeyI',
  typeD: 'KeyT',
  radio: 'KeyB',
  radioPower: 'KeyN',
  lights: 'KeyL',
  handbrake: 'Space',
};

/** Metres of range on a full tank at a steady cruise. */
const RANGE = 14000;

/** A pump the car can refuel at. */
export interface FuelStation {
  x: number;
  z: number;
  /** Trigger radius, metres. */
  r: number;
  name: string;
}

/** Somewhere Ignis can be sent, and how far along the highway it is. */
export interface Destination {
  name: string;
  x: number;
  z: number;
  /** Arc length along the spine, metres. Filled in at layout. */
  s: number;
}

/** The interact prompt this system publishes for the HUD to draw. */
export interface DrivePrompt {
  key: string;
  label: string;
  /** Secondary bindings, as `[key, label]`. */
  extra: string[][];
}

export class RegaliaSystem {
  autoDrive!: AutoDrive;
  fuelStations!: FuelStation[];
  _ahead!: THREE.Vector3;
  /** Headlamp intensity at full beam, captured the first time they come on. */
  _beam!: number | null;
  _brake!: number;
  _ctx!: BanterCtx | null;
  _distanceAp!: number;
  /** Seconds until the next night-road roll; see {@link RegaliaSystem._nightRoadDanger}. */
  _nightRoll!: number;
  _ducked!: boolean;
  _enterCooldown!: number;
  _gaze!: THREE.Vector3[];
  _interest!: THREE.Vector3;
  _lastControls!: DriveControls | null;
  _lightLevel!: number;
  /** Reused landmark record; `_nearestLandmark` fills it in. */
  _lm!: NearLandmark | null;
  _onRefuelEvent!: (e: Event) => void;
  _parked!: DriveControls | null;
  /** The static Regalia `Props` scattered, hidden while this one is drivable. */
  _parkedProxy!: THREE.Object3D | null;
  _pc!: DriveControls | null;
  _prompt!: boolean;
  /** `game.currentShot` the staging was last applied for. */
  _shotApplied!: string | null;
  /** Reused centreline point for shot staging. */
  _sp!: RoadPoint | null;
  _stagedShot!: boolean;
  _tmp!: THREE.Vector3;
  _wasNear!: boolean;
  auto!: boolean;
  banter!: Banter;
  body!: VehicleBody;
  built!: RegaliaBuild;
  /** The `scene.environment` the car's materials currently point at. */
  _envMap!: THREE.Texture | null;
  /** The `scene.environmentIntensity` those materials are trimmed against. */
  _envK!: number;
  cabinLight!: THREE.PointLight;
  destinations!: Destination[];
  driveCam!: DriveCamera;
  enabled!: boolean;
  fuel!: number;
  game!: Game;
  headlights!: string;
  homeS!: number;
  isDriving!: boolean;
  lampMat!: THREE.MeshStandardMaterial;
  lights!: THREE.SpotLight[];
  occupants!: Occupants;
  path!: RoadPath;
  pivot!: THREE.Group;
  prompt!: DrivePrompt | null;
  radio!: Radio;
  root!: THREE.Group;
  shadow!: THREE.Mesh;
  shadowRoot!: THREE.Group;
  startParked!: boolean;
  tailMat!: THREE.MeshStandardMaterial;
  terrain!: Terrain | null;
  tilt!: THREE.Group;
  wheels!: RegaliaWheel[];
  constructor(opts: { startParked?: boolean } = {}) {
    this.enabled = true;
    /** true while anyone is in the car with the engine running. */
    this.isDriving = false;
    /** true when Ignis has the wheel. */
    this.auto = false;
    /** 0..1 */
    this.fuel = 1;
    this.fuelStations = [];
    this.headlights = 'auto';       // 'auto' | 'on' | 'off'
    this._lightLevel = 0;
    this._brake = 0;
    this._prompt = false;
    this._distanceAp = 0;
    this._nightRoll = 70;
    this._enterCooldown = 0;
    this.startParked = opts.startParked !== false;
    this._tmp = new THREE.Vector3();
    this._ahead = new THREE.Vector3();
    this._interest = new THREE.Vector3();
    this._gaze = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }

  /* ------------------------------------------------------------------ init */

  async init(game: Game) {
    this.game = game;
    const terrain = game.get('Terrain') ?? null;
    this.terrain = terrain;
    if (!terrain || !terrain.road) { this.enabled = false; return; }

    this.path = new RoadPath(terrain.road);
    this.body = new VehicleBody({ terrain, road: this.path, collision: game.get('Collision') });
    this.autoDrive = new AutoDrive(this.path);
    this.driveCam = new DriveCamera(game.camera);
    this.driveCam._terrain = terrain;
    this.banter = new Banter(game.seed ? game.seed * 7 + 11 : 31337);
    this.radio = new Radio();

    // ---- mesh ------------------------------------------------------------
    const props = game.get('Props');
    // No `envMap` here on purpose -- see `_syncEnv`. The drivable car used to
    // copy `game.scene.environment` into six materials at boot and never look
    // again, and that one line is why the Regalia rendered as a flat black
    // silhouette in full midday sun.
    const built = buildRegalia({ drivable: true });
    this.built = built;
    this.lights = built.lights;
    this.lampMat = built.lamp;
    this.tailMat = built.tail;
    this.wheels = built.wheels || [];
    this.shadow = built.shadow;

    this.root = new THREE.Group();
    this.root.name = 'regalia_drivable';
    this.tilt = new THREE.Group();
    this.tilt.name = 'regalia_tilt';
    this.pivot = new THREE.Group();
    this.pivot.name = 'regalia_pivot';
    this.pivot.rotation.y = -Math.PI / 2;      // the art faces +X; the world wants +Z
    this.pivot.position.y = -this.body.wheelR;
    this.pivot.add(built.group);
    this.tilt.add(this.pivot);
    this.root.add(this.tilt);
    game.scene.add(this.root);

    // the contact shadow must lie flat on the ground, not tilt with the body
    built.group.remove(built.shadow);
    this.shadowRoot = new THREE.Group();
    this.shadowRoot.add(built.shadow);
    built.shadow.position.set(0, 0.03, 0);
    built.shadow.rotation.set(-Math.PI / 2, 0, 0);
    game.scene.add(this.shadowRoot);

    // The dash glow. In FFXV the single thing that keeps the four of them
    // readable on a night drive is the instrument light coming up under their
    // chins — without it they are four black cut-outs in a black car.
    this.cabinLight = new THREE.PointLight(0xffb877, 0, 5.5, 1.15);
    this.cabinLight.position.set(0, 0.72, 0.30);
    this.cabinLight.castShadow = false;
    this.tilt.add(this.cabinLight);

    this.occupants = new Occupants(this.tilt);
    this.occupants.attach(game);

    // ---- park it where the world already expects a Regalia -----------------
    // Props scatters a static one at the roadside site; take that spot over and
    // hide theirs, so the world still reads the same but the car can be driven.
    let px = 47, pz = 14;
    if (props && props.ecology && props.ecology.sites) {
      const site = props.ecology.sites.find((s: EcoSite) => s.type === 'regalia');
      if (site) { px = site.x; pz = site.z; }
    }
    if (props && props.regalia) {
      props.regalia.visible = false;
      if (props.regaliaLights) for (const l of props.regaliaLights) l.visible = false;
      this._parkedProxy = props.regalia;
    }
    const hit = this.path.nearest(px, pz, this.path.makeHit());
    /** Arc length of the parking spot — every capture is staged relative to it. */
    this.homeS = hit.s;
    // sit it on the near side of the carriageway, pointing up the road
    const nx = -hit.tz, nz = hit.tx;
    this.body.reset(hit.x + nx * 2.1, hit.z + nz * 2.1, Math.atan2(hit.tx, hit.tz));
    this._sync(0);

    // ---- fuel stops --------------------------------------------------------
    // The reststop on this stretch of Route 1, plus Hammerhead where the
    // opening quest pushes the car to. Another agent owns the buildings; this
    // is only the pump trigger, and `addFuelStation` lets them add more.
    if (props && props.ecology && props.ecology.sites) {
      for (const s of props.ecology.sites) {
        if (s.type === 'reststop') this.addFuelStation({ x: s.x, z: s.z, r: 34, name: 'Coernix Station' });
      }
    }
    this.addFuelStation({ x: 8, z: -102, r: 30, name: 'Hammerhead' });

    // ---- destinations you can send Ignis to ---------------------------------
    this.destinations = this._layoutDestinations();
    const first = this.destinations.find((d) => d.s > this.homeS + 60) || this.destinations[this.destinations.length - 1];
    this.autoDrive.setTargetS(first.s, first.name);

    window.addEventListener('ffxv-regalia-refuel', this._onRefuelEvent = (e: Event) => {
      this.refuel(e instanceof CustomEvent ? e.detail?.amount : undefined);
    });

    if (game.debug) console.log('[Regalia] ready', this.destinations.map((d) => d.name).join(', '));
  }

  /** Named stops along the highway, ordered by arc length. */
  _layoutDestinations() {
    const list: { name: string, x: number, z: number, s: number }[] = [
      { name: 'Hammerhead', x: 8, z: -102, s: 0 },
      { name: 'Coernix Station', x: 0, z: 25, s: 0 },
      { name: 'Longwythe Rest Area', x: 128, z: 84, s: 0 },
      { name: 'Keycatrich Trench', x: -154, z: -132, s: 0 },
      { name: 'Galdin Quay', x: 198, z: 244, s: 0 },
      { name: 'Prairie Outpost', x: -92, z: 60, s: 0 },
    ];
    const hit = this.path.makeHit();
    for (const d of list) {
      this.path.nearest(d.x, d.z, hit);
      d.s = hit.s;
    }
    return list.sort((a, b) => a.s - b.s);
  }

  /* --------------------------------------------------------------- public */

  /** Distance from the player to the driver's door, metres. */
  distanceToPlayer() {
    const p = this.game.get('Player');
    if (!p) return 1e5;
    return Math.hypot(p.position.x - this.body.pos.x, p.position.z - this.body.pos.z);
  }

  /** Get in and start the engine. @param [autoDrive] */
  enter(autoDrive: boolean = false) {
    if (this.isDriving || !this.enabled) return false;
    this.isDriving = true;
    this.auto = !!autoDrive;
    this.occupants.enter(!this.auto);
    this.driveCam.reset(this.body);
    this.banter.reset();
    this.radio.setEngaged(true);
    this.banter.trigger(autoDrive ? 'autodrive' : 'depart', { force: true });
    const hud = this.game.get('HUD');
    if (hud && hud.setVisible && this.game.currentShot == null) hud.setVisible(true);
    return true;
  }

  /** Get out. Everyone is put back on their feet beside the car. */
  exit() {
    if (!this.isDriving) return false;
    this.isDriving = false;
    this.occupants.exit(this.body.pos, this.body.heading);
    this.radio.setEngaged(false);
    const rig = this.game.get('CameraRig');
    if (rig && rig.clearShot && !this.game.currentShot) rig.clearShot();
    return true;
  }

  /** Hand the wheel to Ignis, or take it back. @param v */
  setAutoDrive(v: boolean) {
    const want = !!v;
    if (want === this.auto) return;
    this.auto = want;
    if (this.isDriving) {
      this.occupants.exit(this.body.pos, this.body.heading);
      this.occupants.enter(!this.auto);
      this.banter.trigger(want ? 'autodrive' : 'takeover', { force: true });
    }
  }

  /**
   * Send the car somewhere. Snaps to the nearest point on the highway.
   * @param x @param z @param [name]
   */
  driveTo(x: number, z: number, name?: string) {
    this.autoDrive.setTargetPos(x, z, name || null);
    if (!this.auto) this.setAutoDrive(true);
    if (!this.isDriving) this.enter(true);
  }

  /** Cycle to the next named destination up the road. */
  nextDestination() {
    const s = this.body.roadS;
    const d = this.destinations.find((x) => x.s > s + 40) || this.destinations[0];
    this.driveTo(d.x, d.z, d.name);
    return d;
  }

  /**
   * Fill the tank. Hammerhead's pumps call this — either directly, or by
   * dispatching a `ffxv-regalia-refuel` window event.
   * @param [amount] 0..1 fraction to add; omitted means fill it
   * @returns the new fuel level
   */
  refuel(amount?: number): number {
    const before = this.fuel;
    this.fuel = Math.min(1, this.fuel + (amount == null ? 1 : amount));
    if (this.fuel > before + 0.05) this.banter.trigger('refuel');
    return this.fuel;
  }

  /**
   * Register a set of pumps. Stopping inside `r` metres refuels the car.
   */
  addFuelStation(s: {x:number, z:number, r:number, name:string}) {
    if (!this.fuelStations.some((f) => f.name === s.name)) this.fuelStations.push({ ...s });
    return this.fuelStations.length;
  }

  /** Fit or remove the Type-D off-road package. @param v */
  setOffRoad(v: boolean) {
    this.body.offRoadMode = !!v;
    if (this.isDriving) this.banter.trigger(v ? 'typeD' : 'offroad');
  }

  /** Everything the HUD needs, in one object. */
  status() {
    const b = this.body;
    return {
      driving: this.isDriving, auto: this.auto, kmh: b.kmh, fuel: this.fuel,
      gear: b.vLong < -0.4 ? 'R' : b.vLong < 0.4 ? 'N' : 'D',
      offRoad: b.offRoadMode, camera: this.driveCam.mode,
      station: this.radio.station ? this.radio.station.name : null,
      destination: this.autoDrive.destination,
      remaining: this.autoDrive.remaining(b.roadS),
      odometer: b.odometer,
    };
  }

  /* --------------------------------------------------------------- update */

  /**
   * Keep the car's environment map pointed at the live one.
   *
   * **The bug this exists to kill.** `RegaliaSystem.init` used to do
   * `buildRegalia({ envMap: game.scene.environment })`, which pins the texture
   * of `Sky`'s PMREM render target into `paint`, `chrome`, `glass`, `lamp`,
   * `trim` and `hide`. `Sky._updateEnv` rebuilds that target and **disposes
   * the previous one** on every time-of-day change (`Sky.ts:1350`) -- and
   * three.js does not fail loudly on a disposed render-target texture:
   * `setTexture2D`'s re-upload path is guarded by
   * `texture.isRenderTargetTexture === false`, so a PMREM output falls through
   * to `bindTexture(TEXTURE_2D, undefined)` and lands on `emptyTextures`, a
   * 1x1 RGBA(0,0,0,0). No warning, no error, no red gate.
   *
   * `setTimeOfDay` runs on the title screen, on every chapter start, in every
   * story scene and on every posed shot with a `time` -- which is all six
   * Regalia shots -- so in practice the car's env map was one black pixel from
   * the first frame anybody ever photographed. `chrome` is `metalness 1.0` and
   * therefore has **no diffuse term at all**: its only light is
   * `getIBLRadiance() * envMapIntensity`, so every mirror, bumper blade, grille
   * slat, rim and spoke went pure black. The near-black clearcoat paint reads
   * lacquer only because it reflects the sky, so the body went with it, and
   * the near-black shut lines stopped reading because they had nothing lighter
   * to be a line against. That is the whole of "the Regalia has no material...
   * two black hooks for mirrors".
   *
   * Every other consumer in the tree (weapons, towns, dungeons, characters,
   * and the *static* roadside Regalia via `Props._fallbackEnv`, which returns
   * null once Sky is up) leaves `envMap` null and lets three resolve
   * `material.envMap || scene.environment` per frame. The car cannot simply do
   * that, because three overwrites `envMapIntensity` with
   * `scene.environmentIntensity` for any lit material whose own `envMap` is
   * null -- which would throw away the authored 0.3 / 1.15 / 2.2 trim that
   * makes glass read as glass. So it holds its own pointer and re-points it,
   * multiplying the authored intensity by the scene's own env trim so the car
   * still dims with the sky after dark.
   *
   * A texture-to-texture swap does not change a program's cache key, so this
   * costs nothing but the comparison, and the comparison is six materials on
   * the frames where anything changed at all.
   */
  _syncEnv(game: Game) {
    if (!this.built) return;
    const env = game.scene.environment || null;
    const k = game.scene.environmentIntensity ?? 1;
    if (env === this._envMap && k === this._envK) return;
    this._envMap = env;
    this._envK = k;
    for (const m of this.built.envMats) {
      m.envMap = env;
      const base = m.userData.baseEnvI;
      m.envMapIntensity = (base == null ? 1 : base) * k;
    }
  }

  update(dt: number, game: Game) {
    if (!this.enabled) return;
    this._syncEnv(game);
    if (this._enterCooldown > 0) this._enterCooldown -= dt;

    this._shotStaging(game);
    this._input(dt, game);

    const c = this.isDriving
      ? (this.auto ? this.autoDrive.update(dt, this.body) : this._playerControls(game))
      : this._parkedControls();

    if (this.fuel <= 0) { c.throttle = 0; }
    this.body.step(dt, c);
    this._lastControls = c;
    // a landing you can feel
    if (this.body.landImpact > 2.2) this.driveCam.addTrauma(Math.min(0.7, this.body.landImpact * 0.06));

    // ---- fuel -------------------------------------------------------------
    if (this.isDriving) {
      const eff = this._fuelEfficiency(game);
      const burn = (this.body.speed * dt) / (RANGE * eff)
        * (0.55 + 0.9 * c.throttle + 0.010 * this.body.speed);
      this.fuel = Math.max(0, this.fuel - burn);
      this._refuelIfParked();
      this._awardDistance(game);
      this._nightRoadDanger(dt, game);
    }

    // ---- weather / wetness --------------------------------------------------
    const weather = game.get('Weather');
    if (weather) {
      this.body.wetness = Math.max(0, Math.min(1, weather.wetness || 0));
    }

    // ---- lights ------------------------------------------------------------
    this._lightsTick(game);

    // ---- banter -------------------------------------------------------------
    // A capture is a still frame; a subtitle popping into it is noise.
    this.banter.muted = !!game.currentShot;
    this.banter.update(dt);
    if (this.isDriving) this.banter.observe(dt, this._banterCtx(game));
    if (this.radio.enabled) {
      // duck the music whenever anyone is mid-sentence
      if (this.banter.t < this.banter._busyUntil && !this._ducked) {
        this.radio.duck(Math.min(6, this.banter._busyUntil - this.banter.t));
        this._ducked = true;
      } else if (this.banter.t >= this.banter._busyUntil) this._ducked = false;
    }

    // ---- radio --------------------------------------------------------------
    const audio = game.get('Audio');
    if (audio && audio.ctx && !this.radio.enabled) this.radio.attach(audio);
    this.radio.update(dt);
  }

  lateUpdate(dt: number, game: Game) {
    if (!this.enabled) return;
    this._sync(dt);
    if (this.isDriving) {
      const b = this.body;
      const f = b.forward();
      this._ahead.copy(b.pos).addScaledVector(f, 26); this._ahead.y += 1.2;
      const lm = this._nearestLandmark();
      let interest: THREE.Vector3 | null = null;
      if (lm && lm.dist < 260) { this._interest.set(lm.x, lm.y + 30, lm.z); interest = this._interest; }
      this.occupants.gaze(this._ahead, interest);
      this.occupants.update(dt, {
        speed: b.speed,
        lateralG: b.vLong * b.yawRate,
        longG: b._axPrev || 0,
        slide: b.slide,
        rough: b.rough,
        steer: b.steer / 0.6,
        auto: this.auto,
      });
      this._driveCameraTick(dt, game);
    }
  }

  /* -------------------------------------------------------------- internals */

  /**
   * Finish settling now, so no capture depends on how long the page has run.
   *
   * `Game.settle()` calls this on every system that has it, on its first frame,
   * which is the same contract `Vegetation.converge` and `Props.converge` are
   * written against. The car's suspension is an exponential damp and therefore
   * never actually arrives — see `VehicleBody.converge` for what that cost.
   */
  converge() {
    this.body.converge();
    this._sync(0);
  }

  /** Push the simulation state onto the scene graph. */
  _sync(_dt?: number) {
    const b = this.body;
    this.root.position.copy(b.pos);
    this.root.rotation.y = b.heading;
    this.tilt.rotation.set(b.pitch, 0, b.roll);

    const s = this.built.scale;
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      const sim = b.wheels[i];
      if (!sim) continue;
      w.steer.rotation.y = w.front ? b.steer : 0;
      w.steer.position.y = w.restY + sim.travel / s;
      w.spin.rotation.z = -sim.spinAngle * w.side;
    }

    // the painted contact pool lies on the ground, unrotated by the body
    const sh = this.shadowRoot;
    sh.position.set(b.pos.x, (b._groundAvg || (b.pos.y - b.wheelR)) + 0.03, b.pos.z);
    sh.rotation.y = b.heading - Math.PI / 2;
    // it fades as the body lifts off its springs, so a crest reads as air
    const lift = Math.min(1, Math.max(0, (b.chassisY - (b._groundAvg || 0) - b.wheelR) / 0.14));
    // the contact pool is one mesh with one material; `Mesh.material` is
    // declared as either, so ask before writing
    const shadowMat = this.shadow.material;
    if (!Array.isArray(shadowMat)) shadowMat.opacity = 0.85 * (1 - lift * 0.5);
  }

  /** Keyboard + gamepad -> vehicle controls. */
  _playerControls(game: Game) {
    const inp = game.input;
    const c = this._pc || (this._pc = { throttle: 0, brake: 0, steer: 0, handbrake: false, gear: 1 });
    let th = 0, br = 0, st = 0;
    if (inp.key('KeyW') || inp.key('ArrowUp')) th = 1;
    if (inp.key('KeyS') || inp.key('ArrowDown')) br = 1;
    // Steering is NEGATIVE-is-right, and that is not a typo. `forward()` is
    // `(sin h, 0, cos h)`, so at h = 0 the car faces +Z; facing +Z with +Y up in
    // a right-handed frame the driver's right hand points at -X, and increasing
    // `heading` swings forward toward +X — the driver's LEFT. The low-speed
    // model settles it with no geometry at all: `wKin = vl * tan(delta) / L`, so
    // a positive steer raises `heading`, which turns left.
    //
    // Everything else in the car already agrees with that frame and is correct:
    // `AutoDrive` aims along `right()` (which is really the car's left) and
    // steers with the same sign, which is why the AI drives the highway
    // perfectly and only a human at the wheel ever noticed. The bug was here,
    // in the two lines that turn a keypress into a sign, and it shipped because
    // no gate drives the car — all five posed regalia shots are a parked car.
    if (inp.key('KeyD') || inp.key('ArrowRight')) st -= 1;
    if (inp.key('KeyA') || inp.key('ArrowLeft')) st += 1;

    const gp = inp.gamepad;
    if (gp) {
      const bt = gp.buttons;
      // analogue triggers: RT throttle, LT brake
      if (bt[7]) th = Math.max(th, bt[7].value != null ? bt[7].value : (bt[7].pressed ? 1 : 0));
      if (bt[6]) br = Math.max(br, bt[6].value != null ? bt[6].value : (bt[6].pressed ? 1 : 0));
      // same frame as the keys above: stick right is negative steer
      const ax = gp.axes[0] || 0;
      if (Math.abs(ax) > 0.12) st = -ax;
    }

    // S is brake while rolling forward and reverse once stopped — one pedal,
    // the way an automatic behaves, instead of asking for a gear key
    const v = this.body.vLong;
    if (br > 0.02 && v < 0.5) { c.gear = -1; c.throttle = br; c.brake = 0; }
    else { c.gear = 1; c.throttle = th; c.brake = br; }
    c.steer = st;
    c.handbrake = inp.key(KEY.handbrake) || inp.gpButton(0);
    this._brake = c.brake;
    return c;
  }

  _parkedControls() {
    const c = this._parked || (this._parked = { throttle: 0, brake: 1, steer: 0, handbrake: true, gear: 1 });
    return c;
  }

  /** Doors, camera modes, radio, off-road, auto-drive. */
  _input(dt: number, game: Game) {
    const inp = game.input;
    // `enabled === false` means a menu, a shop or a conversation owns the
    // keyboard — without this, Backspace-ing out of the shop screen while
    // parked beside the car would also fire F and put you in it.
    if (!inp || inp.enabled === false || game.currentShot) return;

    // "Drive" — offered whenever Noctis is beside the car. There is no event
    // channel into the prompt strip, so the state is published on `this.prompt`
    // for the HUD to read, and the moment of first approach is marked in
    // fiction instead, through the banter channel that does exist.
    const near = !this.isDriving && this.distanceToPlayer() < 6.5;
    this.prompt = this.isDriving
      // These three glyphs are the only in-car controls documentation a player
      // sees without opening a menu, and they named `G` for a verb bound to
      // `KeyI` — G is Gladiolus' technique. They are read off `KEY` now so a
      // rebind cannot leave them behind again.
      ? { key: KEY.enter.slice(3), label: 'Get out', extra: [[KEY.auto.slice(3), this.auto ? 'Take the wheel' : 'Let Ignis drive'], [KEY.camera.slice(3), 'Camera'], [KEY.radio.slice(3), 'Radio']] }
      : near ? { key: KEY.enter.slice(3), label: 'Drive', extra: [] } : null;
    if (near && !this._wasNear) {
      this._wasNear = true;
      this.banter.trigger(this.auto ? 'autodrive' : 'takeover');
    } else if (!near) this._wasNear = false;

    if (inp.keyDown(KEY.enter) && this._enterCooldown <= 0) {
      this._enterCooldown = 0.4;
      if (this.isDriving) this.exit();
      else if (near) this.enter(false);
    }
    if (!this.isDriving) return;

    if (inp.keyDown(KEY.camera)) this.driveCam.cycleMode();
    if (inp.keyDown(KEY.auto)) this.setAutoDrive(!this.auto);
    if (inp.keyDown(KEY.typeD)) this.setOffRoad(!this.body.offRoadMode);
    if (inp.keyDown(KEY.radio)) { this.radio.next(); this.banter.trigger('radio'); }
    if (inp.keyDown(KEY.radioPower)) this.radio.setOn(!this.radio.on);
    if (inp.keyDown(KEY.lights)) {
      this.headlights = this.headlights === 'auto' ? 'on' : this.headlights === 'on' ? 'off' : 'auto';
    }
  }

  /** The chase camera writes the camera last, and only while we are driving. */
  _driveCameraTick(dt: number, game: Game) {
    const rig = game.get('CameraRig');
    if (rig && rig.shot && !this._stagedShot) return;      // a capture owns the lens
    this.driveCam.update(dt, this.body, game.input ? { lookX: game.input.look.x, lookY: game.input.look.y } : null);
    // keep the depth-of-field focused on the road, like the on-foot rig does
    const post = game.post;
    if (post && post.setFocusDistance) {
      post.setFocusDistance(game.camera.position.distanceTo(this.body.pos) + 6);
    }
  }

  /** Headlights, tail lights and the emissive lenses. */
  _lightsTick(game: Game) {
    const sky = game.get('Sky');
    let night = 0;
    if (sky && sky.sun && sky.sun.position) {
      const p = sky.sun.position;
      const elev = p.y / (p.length() || 1);
      night = Math.max(0, Math.min(1, 1 - (elev + 0.06) * 6.5));
    }
    const weather = game.get('Weather');
    if (weather && (weather.name === 'storm' || weather.name === 'fog')) night = Math.max(night, 0.55);
    const want = this.headlights === 'on' ? 1 : this.headlights === 'off' ? 0 : night;
    this._lightLevel += (want - this._lightLevel) * 0.08;
    const n = this._lightLevel;
    // scale the beam the builder gave us — hard-coding a number here is how
    // the headlights ended up two orders of magnitude too dim for a
    // physically-lit scene
    if (this._beam == null) this._beam = this.lights.length ? this.lights[0].intensity : 900;
    for (const l of this.lights) l.intensity = this._beam * (0.03 + 0.97 * n);
    this.lampMat.emissiveIntensity = 0.28 + n * 3.4;
    // brakes glow hard, and the tails sit at a low ember the rest of the time
    const bl = Math.max(this._brake, this.body.vLong < -0.2 ? 0.4 : 0);
    this.tailMat.emissiveIntensity = 0.22 + n * 1.2 + bl * 2.6;
    if (this.cabinLight) this.cabinLight.intensity = n * (this.isDriving ? 7.5 : 1.2);
    return n;
  }

  _fuelEfficiency(game: Game) {
    const rpg = game.get('Rpg');
    const bonus = rpg && rpg.ascension && rpg.ascension.value
      ? (rpg.ascension.value('fuelEfficiency') || 0) : 0;
    return 1 + bonus;
  }

  _refuelIfParked() {
    if (this.body.speed > 1.2 || this.fuel > 0.995) return;
    for (const s of this.fuelStations) {
      if (Math.hypot(this.body.pos.x - s.x, this.body.pos.z - s.z) < s.r) { this.refuel(); return; }
    }
  }

  _awardDistance(game: Game) {
    const rpg = game.get('Rpg');
    if (!rpg || !rpg.drove) return;
    this._distanceAp += this.body.speed * (game.time.dt || 0);
    if (this._distanceAp >= 100) { rpg.drove(this._distanceAp); this._distanceAp = 0; }
  }

  _banterCtx(game: Game) {
    const ctx = this._ctx || (this._ctx = {
      speed: 0, driving: false, auto: false, roadDist: 0, offRoadMode: false,
      slide: 0, hour: 12, weather: 'clear', fuel: 1, landmark: null,
    });
    const rpg = game.get('Rpg');
    const weather = game.get('Weather');
    ctx.speed = this.body.speed;
    ctx.driving = this.isDriving;
    ctx.auto = this.auto;
    ctx.roadDist = this.body.roadDist;
    ctx.offRoadMode = this.body.offRoadMode;
    ctx.slide = this.body.slide;
    ctx.hour = rpg && rpg.day ? rpg.day.hour : game.get('Sky')?.hours ?? 12;
    ctx.weather = weather && weather.name ? weather.name : 'clear';
    ctx.fuel = this.fuel;
    ctx.landmark = this._nearestLandmark();
    return ctx;
  }

  /** Nearest hero feature to the car — drives the landmark banter and gaze. */
  _nearestLandmark() {
    const t = this.terrain;
    if (!t || !t.landmarks) return null;
    const out = this._lm || (this._lm = { name: '', x: 0, y: 0, z: 0, dist: 0, kind: '' });
    let best = Infinity, bn: { k: string, l: Landmark } | null = null;
    for (const k in t.landmarks) {
      const l = t.landmarks[k];
      if (l.kind === 'basin') continue;
      const d = Math.hypot(l.x - this.body.pos.x, l.z - this.body.pos.z) - l.r;
      if (d < best) { best = d; bn = { k, l }; }
    }
    if (!bn) return null;
    out.name = bn.k; out.kind = bn.l.kind;
    out.x = bn.l.x; out.z = bn.l.z; out.y = bn.l.h;
    out.dist = Math.max(0, best);
    return out;
  }

  /**
   * **The night on the road.** The consumer {@link RegaliaSystem.nightDanger}
   * never had.
   *
   * `nightDanger()` has been correct and orphaned: it returns the same daemon
   * pressure the Enemies system reads and nothing called it, so driving after
   * dark was exactly as safe as driving at noon and the headlights were the
   * only thing the night changed. The whole point of a Lucian night is that the
   * road stops being a corridor and starts being a place daemons stand in.
   *
   * Deliberately narrow, because the failure mode of a roadside ambush is that
   * it fires while the player is parked at a haven reading a menu:
   *
   * - **only above 8 m/s and only while driving.** A stationary car is a camp,
   *   not a road.
   * - **only above 0.5 pressure**, which is `night_giant`'s old window and
   *   about two hours either side of the small hours.
   * - **never during a capture** (`game.currentShot`), because a pack that
   *   arrives on frame 40 of a 60-frame settle is a different photograph every
   *   run.
   * - **never on top of a fight already happening** — 90 m, generous, because
   *   the car covers 30 of them a second.
   *
   * The spawn itself is `EncounterDirector.spawnRoamer`, unmodified: it already
   * picks a bearing 30–42 m out, scales to the party, alerts the pack and fires
   * the `encounter:warn` HUD banner. At road speed a ring of that radius *is*
   * the road ahead — the car is inside it in a second and a half — so nothing
   * here needs to reach into the director to aim it, which matters because that
   * file belongs to another lane.
   */
  _nightRoadDanger(dt: number, game: Game) {
    if (game.currentShot || !this.isDriving || this.body.speed < 8) return;
    this._nightRoll -= dt;
    if (this._nightRoll > 0) return;
    // Re-armed whether or not the roll lands, so a player who stays in a fight
    // is not immediately handed a second one when it ends.
    this._nightRoll = 55 + Math.random() * 55;
    const depth = this.nightDanger();
    if (depth <= 0.5) return;
    const enc = game.get('Encounters');
    if (!enc || enc.suppressRoamers || enc.boss) return;
    const pos = this.body.pos;
    if (enc.enemies && enc.enemies.countNear(pos, 90) > 0) return;
    // `ronin_duel` carries its own 0.6 floor and is the rarer of the two; the
    // pack is the ordinary answer.
    const wantRonin = depth >= 0.6 && Math.random() < 0.25;
    const def = ROAMERS.find((r) => r.id === (wantRonin ? 'ronin_duel' : 'daemon_pack'));
    if (!def) return;
    enc.spawnRoamer(def);
    game.get('Story')?.talk?.react('nightfall');
  }

  /**
   * How hard the night is pushing on this stretch of road — the same model the
   * Enemies system reads. 0 in daylight, 1 in the deep hours.
   * @returns 0..1
   */
  nightDanger(): number {
    const rpg = this.game && this.game.get('Rpg');
    if (!rpg || !rpg.day || !rpg.day.daemonPressure) return 0;
    const p = rpg.day.daemonPressure(rpg.party ? 27 : 1);
    return p.spawn ? p.density : 0;
  }

  /**
   * Capture staging.
   *
   * The harness picks a shot and freezes the camera; a car simulated from the
   * player's inputs would be somewhere different every run. Named shots get an
   * explicit pose here — position along the highway, speed, who is driving —
   * so a capture is reproducible frame for frame.
   */
  _shotStaging(game: Game) {
    const name = game.currentShot;
    if (name === this._shotApplied) return;
    this._shotApplied = name;
    this._stagedShot = false;
    if (!name) return;

    const stage = SHOT_STAGES[name as keyof typeof SHOT_STAGES];
    if (!stage) {
      // any other shot: park it where Props used to put it and stay out of it
      if (this.isDriving) this.exit();
      return;
    }
    this._stagedShot = true;
    this.path.at(this.homeS + (stage.ds || 0), this._sp || (this._sp = { x: 0, y: 0, z: 0, tx: 0, tz: 1 }));
    const p = this._sp;
    const nx = -p.tz, nz = p.tx;
    const lat = stage.lat ?? 2.0;
    this.body.reset(p.x + nx * lat, p.z + nz * lat, Math.atan2(p.tx, p.tz) + (stage.yaw || 0));
    this.body.vLong = stage.speed || 0;
    this.body.speed = Math.abs(stage.speed || 0);
    this.body.steer = stage.steer || 0;
    this.body.pitch = 0; this.body.roll = 0;

    if (stage.driving) {
      // somewhere far enough up the road that Ignis never lifts off for it
      this.autoDrive.setTargetS(this.homeS + 900, 'Galdin Quay');
      if (!this.isDriving) this.enter(!!stage.auto);
      else { this.auto = !!stage.auto; this.occupants.exit(this.body.pos, this.body.heading); this.occupants.enter(!stage.auto); }
      this.driveCam.setMode(stage.camera || 'chase');
      this.driveCam.reset(this.body);
    } else if (this.isDriving) {
      this.exit();
    }
    this.headlights = stage.lights || 'auto';
    this.banter.reset();
    this.banter.muted = true;
    this._sync(0);
  }
}

/**
 * How the car is posed for each named capture.
 *
 * `ds` is metres along the highway from the parking spot the world already
 * expects a Regalia at, so a stage is stable even if the road spline moves.
 * The harness settles ~90 frames after staging, so a moving shot is placed
 * *upstream* of where it should end up and allowed to drive into frame — which
 * also means the suspension, the camera spring and the driver have all settled
 * by the time the shutter opens.
 */
/** One staged capture: where on the road, how fast, and how it is filmed. */
export interface ShotStage {
  /** Metres along the highway from the parking spot. */
  ds: number;
  /** Lateral offset from the centre line. */
  lat: number;
  speed: number;
  driving: boolean;
  /** Hand the wheel to the auto-driver. */
  auto?: boolean;
  camera?: string;
  lights?: string;
  yaw?: number;
  steer?: number;
}

export const SHOT_STAGES: Record<string, ShotStage> = {
  regalia_road: { ds: 0, lat: 2.1, speed: 0, driving: false },
  regalia_drive: { ds: -46, lat: 1.9, speed: 27, driving: true, auto: true, camera: 'chase' },
  regalia_cruise: { ds: -36, lat: 2.0, speed: 21, driving: true, auto: true, camera: 'cinematic' },
  regalia_night: { ds: -30, lat: 2.0, speed: 17, driving: true, auto: true, camera: 'chase', lights: 'on' },
  regalia_cockpit: { ds: -32, lat: 2.0, speed: 19, driving: true, auto: true, camera: 'bonnet' },
};

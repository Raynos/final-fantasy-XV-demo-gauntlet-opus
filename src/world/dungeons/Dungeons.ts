import * as THREE from 'three';
import { SHOTS } from '../../game/Shots.ts';
import { Dungeon } from './kit/Dungeon.ts';
import { Fader, buildBunkerEntrance, buildMineHead, buildCaveMouth } from './kit/Portal.ts';
import { DungeonAmbience } from './kit/Ambience.ts';
import { KEYCATRICH } from './Keycatrich.ts';
import { BALOUVE } from './Balouve.ts';
import { FOCIAUGH } from './Fociaugh.ts';

const DEFS = [KEYCATRICH, BALOUVE, FOCIAUGH];

/**
 * Dungeons and interiors.
 *
 * Owns three things:
 *
 * 1. **The entrances.** Three pieces of permanent world architecture — an
 *    imperial blockhouse, a mine headframe, a cave mouth — placed on the
 *    terrain and registered as interactables.
 * 2. **The transition.** Walking into an entrance fades down, streams the
 *    interior in, culls the entire exterior world, re-points the lighting rig
 *    and puts the party inside; leaving reverses all of it exactly.
 * 3. **The interior state.** While inside it owns the atmosphere (the sun does
 *    not reach in here), the exposure, the colour grade, the floor the party
 *    walks on, the wall collision, the treasure, the hazards, the map and the
 *    ambient audio.
 *
 * ### Cost
 * Outside, this system is three merged prop groups (~13 draw calls, ~9k
 * triangles) plus one distance check per frame; a dungeon that has never been
 * entered has not allocated a single vertex. Inside, the entire exterior —
 * terrain clipmap, vegetation, water, props, weather, sky dome and the cloud
 * raymarch — is switched off, so an interior is *cheaper* than the field.
 *
 * ### Interaction
 * `listInteractables()` / `nearest(pos)` / `interact(target)` are the public
 * verb API. If a system registered as `Interaction` exists and exposes `add`,
 * every door, chest and entrance is handed to it at init; otherwise the same
 * data is available for any other system to poll.
 */
export class Dungeons {
  _interaction!: any;
  _camLocal!: any;
  _hidden!: any[];
  _returnTo!: any;
  _saved!: any;
  _shotSeen!: any;
  _tmp!: THREE.Vector3;
  ambience!: DungeonAmbience;
  built!: Map<any, any>;
  current!: any;
  defs!: Map<any, any>;
  entrances!: any[];
  fader!: Fader;
  game!: any;
  keys!: Set<any>;
  prompt!: any;
  sky!: any;
  state!: string;
  stats!: any;
  terrain!: any;
  constructor() {
    /** @type {Map<string, object>} id -> definition */
    this.defs = new Map(DEFS.map((d) => [d.id, d]));
    /** @type {Map<string, Dungeon>} built interiors, by id */
    this.built = new Map();
    /** @type {Dungeon|null} */
    this.current = null;
    this.state = 'outside';      // outside | entering | inside | leaving
    this.entrances = [];
    this.keys = new Set();
    this._hidden = [];
    this._saved = null;
    this._tmp = new THREE.Vector3();
    this._camLocal = { position: new THREE.Vector3() };
    this.prompt = null;
    this.stats = { insideCalls: 0, insideTris: 0, outsideCalls: 0, outsideTris: 0 };
  }

  async init(game: import('../../game/Game.ts').Game) {
    this.game = game;
    this.terrain = game.get('Terrain');
    this.sky = game.get('Sky');
    this.fader = new Fader(game.uiRoot);
    this.ambience = new DungeonAmbience(game.get('Audio'));

    const builders = { bunker: buildBunkerEntrance, mine: buildMineHead, cave: buildCaveMouth };
    let calls = 0, tris = 0;
    for (const def of this.defs.values()) {
      const e = def.entrance;
      const make = builders[e.kind] || buildBunkerEntrance;
      const built = make(this.terrain, e.x, e.z, e.heading, def.seed || 7);
      game.scene.add(built.group);
      calls += built.stats.calls;
      tris += built.stats.tris;
      this.entrances.push({
        kind: 'entrance', id: def.id, def,
        name: def.name, verb: 'Enter',
        pos: built.doorway.clone(),
        radius: 4.6,
        group: built.group,
      });
    }
    this.stats.outsideCalls = calls;
    this.stats.outsideTris = tris;
    if (game.debug) console.log('[Dungeons] entrances', JSON.stringify(this.stats));

    // hand the verbs to a town/interaction system if one has been registered
    const interaction = game.get('Interaction');
    if (interaction && typeof interaction.add === 'function') {
      for (const e of this.entrances) {
        interaction.add({
          position: e.pos, radius: e.radius, verb: e.verb, label: e.name,
          onUse: () => this.enter(e.id),
        });
      }
      this._interaction = interaction;
    }
  }

  // ------------------------------------------------------------------- API

  get isInside(): boolean { return this.state === 'inside' || this.state === 'entering'; }

  /**
   * Enter a dungeon. Builds the interior the first time; subsequent entries
   * reuse it, so a dungeon you have already explored costs nothing to re-enter.
   */
  enter(id: string, opts: {instant?:boolean} = {}) {
    const def = this.defs.get(id);
    if (!def || this.isInside) return false;
    const run = () => this._doEnter(def);
    this.state = 'entering';
    if (opts.instant) { this.fader.set(1); run(); this.fader.set(0); }
    else this.fader.toBlack(run);
    return true;
  }

  /** Return to the world at the entrance you came in by. */
  leave(opts = {}) {
    if (!this.isInside) return false;
    const run = () => this._doLeave();
    this.state = 'leaving';
    if (opts.instant) { this.fader.set(1); run(); this.fader.set(0); }
    else this.fader.toBlack(run);
    return true;
  }

  /**
   * Everything the party can act on right now: the entrances when outside, the
   * doors / chests / exit when inside.
   */
  listInteractables(): any[] {
    if (!this.isInside) return this.entrances;
    return this.current ? this.current.interactables : [];
  }

  /**
   * Nearest actionable thing to a world position, or null.
   */
  nearest(pos: THREE.Vector3): any | null {
    if (this.isInside && this.current) {
      const list = this.current.near(pos, 0);
      return list.length ? list[0] : null;
    }
    let best = null, bestD = Infinity;
    for (const e of this.entrances) {
      const d = e.pos.distanceTo(pos);
      if (d <= e.radius && d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /**
   * Act on an interactable. Safe to call with the result of {@link nearest}.
   */
  interact(target: any): {ok:boolean, reason?:string, rewards?:any} {
    if (!target) return { ok: false, reason: 'nothing' };
    if (target.kind === 'entrance') { this.enter(target.id); return { ok: true }; }
    if (target.kind === 'exit') { this.leave(); return { ok: true }; }
    if (target.kind === 'door') return this._openDoor(target);
    if (target.kind === 'chest') return this._openChest(target);
    return { ok: false, reason: 'unknown' };
  }

  /** Map payload for the UI. @returns */
  mapData(): any | null {
    if (!this.current || !this.current.map) return null;
    const p = this.game.get('Player');
    const local = p ? this._tmp.copy(p.position).sub(this.current.origin) : null;
    return this.current.map.data(local);
  }

  /**
   * Draw the current dungeon map onto a 2D context.
   */
  drawMap(ctx: CanvasRenderingContext2D, w: any, h: any, opts: any) {
    if (!this.current || !this.current.map) return false;
    const p = this.game.get('Player');
    const local = p ? this._tmp.copy(p.position).sub(this.current.origin) : null;
    this.current.map.draw(ctx, w, h, { party: local, ...opts });
    return true;
  }

  /** World-space floor height inside the current dungeon, else null. */
  floorAt(x: any, z: any) { return this.current ? this.current.floorAt(x, z) : null; }

  // -------------------------------------------------------------- transition

  _doEnter(def: any) {
    const game = this.game;
    let d = this.built.get(def.id);
    if (!d) {
      d = new Dungeon(def, game).build();
      if (def.extras) def.extras(d);
      game.scene.add(d.group);
      this.built.set(def.id, d);
      if (game.debug) console.log(`[Dungeons] built ${def.id}`, JSON.stringify(d.stats));
    }
    this.current = d;
    d.group.visible = true;
    this.stats.insideCalls = d.stats.calls;
    this.stats.insideTris = d.stats.tris;

    // Snapshot *before* hiding: `sky.dome` is a direct child of `game.scene`,
    // so `_hideExterior()` clears its `visible` flag, and a snapshot taken
    // afterwards records `domeVisible: false`. On leave, `_restoreWorldLighting()`
    // then writes that false back over the correct value and the sky dome stays
    // hidden for the rest of the session -- which is why every cutscene rendered
    // correctly-lit golden-hour ground under an absolutely black sky.
    //
    // It only reproduces when a `dun_*` shot runs earlier in the same page
    // (`shoot.mjs dun_keycatrich_hall cine_opening`). Re-shooting the `cine_*`
    // shots on their own looks perfect, which is how it survived a whole
    // corpus review. `--settle` makes no difference.
    this._saveWorldLighting();
    this._hideExterior();
    this._patchTerrain();

    // put the party at the interior spawn
    const spawn = d.spawnPoint();
    this._returnTo = this._exitPoint(def);
    const player = game.get('Player');
    if (player) {
      player.root.position.copy(spawn);
      player.velocity.set(0, 0, 0);
      player.speed = 0;
    }
    const party = game.get('Party');
    if (party && party.members) {
      for (const m of party.members) {
        m.root.position.set(spawn.x + m.slot.x * 0.8, spawn.y, spawn.z + m.slot.y * 0.8);
      }
    }
    const cam = game.get('Camera');
    if (cam && cam.snap) cam.snap();

    this.ambience.start(def.ambience || {});
    const audio = game.get('Audio');
    if (audio && audio.setState) audio.setState('tension');

    this.state = 'inside';
    this.fader.toClear();
  }

  _doLeave() {
    const game = this.game;
    const d = this.current;
    if (d) d.group.visible = false;
    this._restoreExterior();
    this._unpatchTerrain();
    this._restoreWorldLighting();

    const back = this._returnTo;
    const player = game.get('Player');
    if (player && back) {
      player.root.position.copy(back);
      player.velocity.set(0, 0, 0);
      player.speed = 0;
    }
    const party = game.get('Party');
    if (party && party.members && back) {
      for (const m of party.members) {
        m.root.position.set(back.x + m.slot.x * 0.8, back.y, back.z + m.slot.y * 0.8);
      }
    }
    const cam = game.get('Camera');
    if (cam && cam.snap) cam.snap();

    this.ambience.stop();
    const audio = game.get('Audio');
    if (audio && audio.setState) audio.setState('field');

    this.current = null;
    this.state = 'outside';
    this.stats.insideCalls = 0;
    this.stats.insideTris = 0;
    this.fader.toClear();
  }

  /** Where the party is standing when they step back out. */
  _exitPoint(def: any) {
    const e = def.entrance;
    const c = Math.cos(e.heading), s = Math.sin(e.heading);
    const x = e.x + s * -7.5, z = e.z + c * -7.5;
    return new THREE.Vector3(x, this.terrain.heightAt(x, z), z);
  }

  /**
   * Hide the whole exterior. Everything parented to the scene root is switched
   * off except the party, the things that fight them, and this dungeon —
   * deliberately generic, so another agent adding a new world system gets
   * culled correctly without either of us knowing about the other.
   */
  _hideExterior() {
    const game = this.game;
    const keep = new Set();
    const add = (o: any) => { if (o && o.isObject3D) keep.add(o); };
    for (const name of ['Player', 'Party', 'Enemies', 'VFX', 'Combat', 'Director']) {
      const s = game.get(name);
      if (!s) continue;
      for (const k of ['root', 'group', 'container']) add(s[k]);
      if (s.members) for (const m of s.members) add(m.root);
    }
    if (this.current) keep.add(this.current.group);

    this._hidden = [];
    for (const c of game.scene.children) {
      if (keep.has(c) || c.isCamera || c.isLight || !c.visible) continue;
      c.visible = false;
      this._hidden.push(c);
    }
    // the cloud raymarch is a full-screen pass with nothing to show for it in
    // here; a temporary override is cheaper than asking Sky for a switch
    const sky = this.sky;
    if (sky && sky.clouds && !sky.clouds.__dungeonStub) {
      sky.clouds.__dungeonStub = sky.clouds.render;
      sky.clouds.render = () => {};
    }
  }

  _restoreExterior() {
    for (const o of this._hidden) o.visible = true;
    this._hidden = [];
    const sky = this.sky;
    if (sky && sky.clouds && sky.clouds.__dungeonStub) {
      sky.clouds.render = sky.clouds.__dungeonStub;
      sky.clouds.__dungeonStub = null;
    }
  }

  /**
   * Redirect every ground query to the dungeon floor. Characters ask the
   * terrain how high the ground is every frame — inside, the answer is the
   * room they are standing in.
   */
  _patchTerrain() {
    const t = this.terrain;
    if (t.__dungeonPatch) return;
    const origH = t.heightAt.bind(t);
    const origN = t.normalAt.bind(t);
    const self = this;
    t.heightAt = function (x: any, z: any) {
      const h = self.floorAt(x, z);
      return h != null ? h : origH(x, z);
    };
    t.normalAt = function (x: any, z: any, out: any) {
      const h = self.floorAt(x, z);
      if (h != null) return (out || new THREE.Vector3()).set(0, 1, 0);
      return origN(x, z, out);
    };
    t.__dungeonPatch = { origH, origN };
  }

  _unpatchTerrain() {
    const t = this.terrain;
    if (!t.__dungeonPatch) return;
    t.heightAt = t.__dungeonPatch.origH;
    t.normalAt = t.__dungeonPatch.origN;
    t.__dungeonPatch = null;
  }

  _saveWorldLighting() {
    const sky = this.sky;
    if (!sky || this._saved) return;
    this._saved = {
      ambient: sky.ambient ? sky.ambient.intensity : 0,
      env: this.game.scene.environmentIntensity,
      shadows: sky.csm ? sky.csm.lights.map((l: any) => l.castShadow) : [],
      domeVisible: sky.dome ? sky.dome.visible : true,
      autoGrade: this.game.post ? this.game.post.autoGrade : true,
    };
    if (sky.csm) for (const l of sky.csm.lights) l.castShadow = false;
    if (sky.dome) sky.dome.visible = false;
  }

  _restoreWorldLighting() {
    const sky = this.sky;
    if (!sky || !this._saved) return;
    if (sky.csm) sky.csm.lights.forEach((l: any, i: any) => { l.castShadow = this._saved.shadows[i] !== false; });
    if (sky.dome) sky.dome.visible = this._saved.domeVisible;
    if (sky.ambient) sky.ambient.intensity = this._saved.ambient;
    this.game.scene.environmentIntensity = this._saved.env;
    if (this.game.post) this.game.post.autoGrade = this._saved.autoGrade;
    // force a full recompute so the sun, exposure and grade come back exactly
    if (sky.setTimeOfDay) sky.setTimeOfDay(sky.hours);
    this._saved = null;
  }

  // ----------------------------------------------------------------- verbs

  _openDoor(item: any) {
    if (item.open) return { ok: true };
    const key = item.spec.key;
    if (key && !this.keys.has(key)) {
      return { ok: false, reason: 'locked', key, message: `${item.name} is locked.` };
    }
    item.open = true;
    if (item.spec) item.spec.open = true;
    const audio = this.game.get('Audio');
    if (audio && audio.play) audio.play('hit', item.pos, { volume: 0.5 });
    return { ok: true };
  }

  _openChest(item: any) {
    if (item.opened) return { ok: false, reason: 'empty' };
    item.opened = true;
    if (item.spec) item.spec.opened = true;
    const rpg = this.game.get('Rpg');
    const spec = item.spec;
    const items = [];
    for (const id of spec.items || []) {
      // ids the item table does not know are dungeon-local key items; they are
      // tracked here so a dungeon can gate itself without owning the economy
      if (rpg && rpg.tables && rpg.tables.items && rpg.tables.items[id]) items.push({ id, count: 1 });
      else this.keys.add(id);
    }
    const rewards = { gil: spec.gil || 0, items };
    if (rpg && rpg.grantRewards) rpg.grantRewards(rewards, 'treasure');
    const audio = this.game.get('Audio');
    if (audio && audio.play) audio.play('ui', item.pos, { volume: 0.6 });
    return { ok: true, rewards };
  }

  // ---------------------------------------------------------------- ticking

  update(dt: any, game: any) {
    this.fader.update(dt);

    // the capture harness selects a dungeon through the shot definition
    if (game.currentShot !== this._shotSeen) {
      this._shotSeen = game.currentShot;
      const want = (SHOTS[game.currentShot] || {}).dungeon || null;
      if (want && (!this.current || this.current.id !== want)) {
        if (this.isInside) { this.leave({ instant: true }); }
        this.enter(want, { instant: true });
      } else if (!want && this.isInside) {
        this.leave({ instant: true });
      }
    }

    if (!this.current || this.state !== 'inside') return;
    const d = this.current;

    this._camLocal.position.copy(game.camera.position).sub(d.origin);
    d.update(dt, game.time.now, this._camLocal);
    this.ambience.update(dt, game.time.now, game.camera.position);

    // wall collision for the party
    const player = game.get('Player');
    if (player) this._confine(player.root.position, 0.55);
    const party = game.get('Party');
    if (party && party.members) for (const m of party.members) this._confine(m.root.position, 0.7);

    if (player) {
      this._hazards(dt, player);
      const near = this.nearest(player.position);
      this.prompt = near ? { verb: near.verb, label: near.name, target: near } : null;
    }
  }

  _confine(pos: any, margin: any) {
    const p = this.current.clamp(pos.x, pos.z, margin);
    pos.x = p[0];
    pos.z = p[1];
    const doors = this.current.interactables;
    for (const it of doors) {
      if (it.kind !== 'door' || it.open) continue;
      const wx = it.pos.x + this.current.origin.x, wz = it.pos.z + this.current.origin.z;
      const dx = pos.x - wx, dz = pos.z - wz;
      const along = it.spec.facing === 'x' ? dz : dx;
      const across = it.spec.facing === 'x' ? dx : dz;
      if (Math.abs(along) < it.spec.w * 0.5 + 0.4 && Math.abs(across) < 0.9) {
        const push = Math.sign(across || 1) * 0.9;
        if (it.spec.facing === 'x') pos.x = wx + push; else pos.z = wz + push;
      }
    }
  }

  _hazards(dt: any, player: any) {
    const L = this.current.layout;
    const o = this.current.origin;
    const lx = player.position.x - o.x, lz = player.position.z - o.z;
    for (const h of L.hazards) {
      if (!h.dps) continue;
      const d = Math.hypot(lx - h.at[0], lz - h.at[1]);
      if (d > h.r) continue;
      const s = player.stats;
      if (s && s.hp > 1) s.hp = Math.max(1, s.hp - h.dps * dt);
    }
  }

  lateUpdate(dt: any, game: any) {
    // exterior entrances are only worth drawing when they are in reach
    if (!this.isInside) {
      const cp = game.camera.position;
      for (const e of this.entrances) e.group.visible = e.pos.distanceToSquared(cp) < 620 * 620;
      return;
    }
    if (!this.current) return;
    this._applyInteriorAtmosphere();
  }

  /**
   * Take the atmosphere over completely.
   *
   * The one thing that decides whether an interior reads as an interior is
   * whether the sun gets in, and in this engine the sun gets in three ways: the
   * cascade lights, the hemisphere fill and the image-based probe. All three
   * are shut down here and replaced with the dungeon's own rig.
   *
   * The fog is not switched off — it is *repointed*. Setting `uSkyDim` to zero
   * removes the sky's inscatter entirely and the night-tint term is then driven
   * to the dungeon's own fog colour, which turns the shared aerial-perspective
   * code into an exact, time-of-day-independent interior fog that props,
   * characters and combat VFX all obey.
   */
  _applyInteriorAtmosphere() {
    const sky = this.sky;
    const game = this.game;
    const atm = this.current.def.atmosphere;
    const floor = this.current.origin.y + (this.current.layout.bounds().y0 || 0);
    if (sky && sky.u) {
      const u = sky.u;
      u.uSkyDim.value = 0.0;
      u.uOvercast.value = 0.0;
      u.uNight.value = 1.0;
      u.uNightTint.value.set(atm.fog[0] / 1.6, atm.fog[1] / 1.6, atm.fog[2] / 1.6);
      u.uAerialTint.value.set(1, 1, 1);
      u.uAerialStrength.value = 1.0;
      u.uFogBase.value = floor;
      u.uFogHeight.value = atm.height;
      u.uFogDensity.value = atm.density;
      u.uHazeBase.value = atm.haze;
      u.uCloudShadowStrength.value = 0.0;
      if (sky.csm) for (const l of sky.csm.lights) l.intensity = 0;
      if (sky.ambient) sky.ambient.intensity = 0;
      if (sky.godRays) sky.godRays.compositeMaterial.uniforms.uIntensity.value = 0;
      if (sky.dome) sky.dome.visible = false;
    }
    // a whisper of image-based light so wet rock and steel keep a highlight
    game.scene.environmentIntensity = 0.05;

    const post = game.post;
    if (post) {
      post.autoGrade = false;
      if (post.setGradeBlend) post.setGradeBlend('night', 'storm', 1 - (atm.gradeMix != null ? atm.gradeMix : 0.7));
      if (post.exposure && post.exposure.setSceneExposure) {
        // a narrow band: eye adaptation may breathe, but it may not decide that
        // a dungeon is a bright room
        post.exposure.setSceneExposure(atm.exposure, {
          lo: 0.88, hi: 1.14, ceiling: atm.exposure * 1.2,
        });
      }
      game.renderer.toneMappingExposure = 1.0;
    }
  }
}

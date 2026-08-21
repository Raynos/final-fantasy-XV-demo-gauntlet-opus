import * as THREE from 'three';
import { AudioGraph, BUSES } from './Graph.ts';
import { Instruments } from './Instruments.ts';
import { Score } from './Score.ts';
import { Sfx } from './Sfx.ts';
import { Ambience } from './Ambience.ts';
import { clamp } from './Dsp.ts';

/**
 * Audio.
 *
 * Everything is synthesised at runtime — there is not a single sample file in
 * this project (BRIEF: no binary assets), so the orchestra, the sword hits, the
 * weather and the reverb tails are all built from oscillators, filtered noise
 * and impulse responses computed at boot.
 *
 * Four subsystems hang off this class:
 *   `Score`      an adaptive orchestral cue that changes chart and orchestration
 *                by game state and cross-fades at the bar line,
 *   `Sfx`        the one-shot bank, driven by the combat event stream,
 *   `Ambience`   weather, time of day, water, wildlife and mains hum,
 *   `AudioGraph` the mix: five buses, ducking, two convolution reverbs and a
 *                limiter.
 *
 * Browsers refuse to start an AudioContext without a gesture, so the whole
 * thing is created lazily on the first click or key. Under the screenshot
 * harness (`?shoot=1`) it stays off entirely — captures are silent and the
 * scheduler would only cost frame time — unless `?audio=force` is also present,
 * which is what the offline verification harness uses.
 */
export class AudioSystem {
  _userVolume!: any;
  _volume!: any;
  state!: string;
  _camping!: boolean;
  _encounterKills!: number;
  _enemyState!: Map<any, any>;
  _enemyStride!: Map<any, any>;
  _lastMenu!: any;
  _matCache!: Map<any, any>;
  _musicState!: string;
  _probeTimer!: number;
  _scoreSuspended!: boolean;
  _stride!: number;
  _sweepAt!: number;
  _wasInCombat!: boolean;
  amb!: Ambience;
  cpuMs!: number;
  ctx!: AudioContext | null;
  enabled!: boolean;
  game!: any;
  graph!: AudioGraph;
  headless!: any;
  inst!: Instruments;
  score!: Score;
  sfx!: Sfx;
  weatherName!: any;
  async init(game: any) {
    this.game = game;
    this.enabled = false;
    this.ctx = null;

    const params = new URLSearchParams(location.search);
    const forced = params.get('audio') === 'force';
    this.headless = params.has('shoot') && !forced;
    /** Kept for older call sites that read `.state`. */
    this.state = 'field';

    // Per-frame bookkeeping.
    this._stride = 0;
    this._enemyState = new Map();
    this._enemyStride = new Map();
    this._encounterKills = 0;
    this._wasInCombat = false;
    this._probeTimer = 0;
    this._sweepAt = 0;
    this._matCache = new Map();
    this._lastMenu = null;
    this.cpuMs = 0;
    this._musicState = 'field';
    this._camping = false;
    /** @type {Record<string, number>} user-facing volume per bus, 0..1 */
    this._userVolume = { music: 1, sfx: 1, amb: 1, ui: 1, voice: 1 };

    if (this.headless) return;
    if (forced) { this._boot(); return; }

    const unlock = () => {
      this._boot();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  /* -------------------------------------------------------------- boot */

  _boot() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') this.ctx.resume();

    this.graph = new AudioGraph(this.ctx, { maxVoices: 72 });
    this.inst = new Instruments(this.graph);
    this.sfx = new Sfx(this.graph, this.inst);
    this.amb = new Ambience(this.graph, this.sfx);
    this.score = new Score(this.graph, this.inst);

    const sky = this.game && this.game.get('Sky');
    const hours = sky ? sky.hours : 12;
    const night = hours >= 19 || hours < 5;
    this.score.start(night ? 'night' : 'field');
    this._musicState = night ? 'night' : 'field';
    this.amb.setTimeOfDay(hours, 0);
    this.amb.setWind(1.0);

    const weather = this.game && this.game.get('Weather');
    if (weather) this.setWeather(weather.name);

    // A hidden tab should not be paying for an orchestra.
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    });

    this._wireEvents();
    this.enabled = true;
  }

  /* ------------------------------------------------------------ events */

  /**
   * Subscribe to everything the rest of the game already broadcasts. Combat
   * mirrors every event onto `window` as `combat:<name>`, so no other system
   * needs a line of code added to make the game audible.
   */
  _wireEvents() {
    const on = (name: any, fn: any) => window.addEventListener(`combat:${name}`, (e) => {
      try { fn(e.detail || {}); } catch (err) { console.error('[audio]', name, err); }
    });

    on('combo', (d: any) => {
      const kind = d.weapon || 'sword';
      if (kind === 'firearm') return;                 // the shot is the sound
      this.sfx.play(`swing:${kind}`, this._playerPos(), { volume: 0.85 });
      this.sfx.play('cloth', null, { volume: 0.5 });
      if (d.index > 0) this.sfx.play('combo', null, { index: d.index });
    });

    on('hit', (d: any) => {
      const mat = this._enemyMaterial(d.enemy);
      this.sfx.play(`impact:${mat}`, d.position, {
        hrtf: true, scale: d.blindside ? 1.45 : 1.0, crit: !!d.blindside, volume: 0.95,
      });
    });

    on('damage', (d: any) => {
      if (d.killed) return;                            // the death cue covers it
      const key = this._speciesOf(d.enemy);
      if (key && this.sfx.rng() < 0.55) {
        this.sfx.play(`voc:${key}:hurt`, d.position, { volume: 0.8 });
      }
      if (d.crit) this.graph.duck(0.78, 0.06, 0.28);
    });

    on('death', (d: any) => {
      this._encounterKills++;
      const key = this._speciesOf(d.enemy);
      const at = d.enemy && d.enemy.centre ? d.enemy.centre() : null;
      if (key) this.sfx.play(`voc:${key}:death`, at, { volume: 1.0, hrtf: true });
      this.sfx.play('impact:ground', at, { scale: 1.2, volume: 0.7 });
      if (d.enemy) this._enemyState.delete(d.enemy);
    });

    on('stagger', (d: any) => {
      const at = d.enemy && d.enemy.centre ? d.enemy.centre() : null;
      this.sfx.play('stagger', at, { volume: 0.9 });
    });

    on('parry', (d: any) => {
      this.sfx.play('parry', d.position, { hrtf: true, volume: 1.0 });
      this.score.setFilter(1400, 0.08);
      setTimeout(() => this.score.setFilter(20000, 0.5), 620);
    });

    on('warp', (d: any) => {
      if (d.phase === 'impact') this.sfx.play('warp:impact', d.to, { hrtf: true });
      else this.sfx.play('warp:start', d.from, { hrtf: true });
    });

    on('link', (d: any) => {
      const at = d.enemy && d.enemy.centre ? d.enemy.centre() : null;
      this.sfx.play('link', at, { volume: 0.95 });
    });

    on('armiger', () => {
      this.sfx.play('armiger', null, {});
      this.score.setIntensity(1);
    });

    on('spell', (d: any) => {
      this.sfx.play(`spell:${d.element || 'fire'}`, d.position, { hrtf: true });
    });

    on('playerHit', (d: any) => {
      this.sfx.play('grunt', null, {});
      this.sfx.play('impact:flesh', d.position, { scale: 1.2, volume: 0.9 });
      if (d.hp <= 0) this.sfx.play('death', null, {});
    });

    on('mp', (d: any) => { if (d.stasis) this.sfx.play('stasis', null, {}); });
    on('lockon', (d: any) => { if (d.enemy) this.sfx.play('lockon', null, {}); });

    // Events the combat system does not emit yet. Each is a one-line `emit()`
    // at the matching call site; until then these listeners simply never fire.
    on('materialise', (d: any) => this.sfx.play('materialise', d.position || this._playerPos(), {}));
    on('shot', (d: any) => this.sfx.play('gunshot', d.position, { hrtf: true }));
    on('dodge', () => {
      this.sfx.play('cloth', null, { volume: 1.1 });
      this.sfx.play('step:dirt', null, { run: true, volume: 0.7 });
    });
    on('armigerHit', (d: any) => this.sfx.play('armigerHit', d.position, {}));

    /* ---- RPG: level ups, quests, loot -------------------------------- */
    const rpg = this.game && this.game.get('Rpg');
    if (rpg && rpg.on) {
      rpg.on('level-up', () => this.sfx.play('levelup', null, {}));
      rpg.on('quest-updated', (p: any) => {
        if (p && (p.phase === 'complete' || p.phase === 'accepted' || p.phase === 'objective')) {
          this.sfx.play('quest', null, {});
        }
      });
      rpg.on('item-gained', () => this.sfx.play('item', null, {}));
      rpg.on('gil-changed', (p: any) => { if (p && p.delta > 0) this.sfx.play('ui:move', null, {}); });
      rpg.on('rested', () => { this._camping = false; this.sfx.play('quest', null, {}); });
      rpg.on('game-saved', () => this.sfx.play('ui:confirm', null, {}));
    }

    /* ---- dialogue ------------------------------------------------------ */
    // The HUD's own `ffxv-*` broadcast channel. A line of dialogue ducks the
    // score hard; ambient party banter only leans on it.
    window.addEventListener('ffxv-say', (e) => this.say(e.detail?.dur ?? 3.0));
    window.addEventListener('ffxv-banter', (e) => this.banter(e.detail?.dur ?? 2.5));
    window.addEventListener('ffxv-callout', () => this.say(1.4, 0.5));
    window.addEventListener('ffxv-area', () => this.sfx.play('quest', null, {}));

    /* ---- global volume ------------------------------------------------ */
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.metaKey || e.ctrlKey || e.altKey) return;
      // Backquote, not M: M is the world map. Volume also has real sliders on
      // the System screen now, so this is only the quick mute.
      if (e.code === 'Backquote') { this.setMuted(); this.sfx.play('ui:cancel', null, {}); }
      else if (e.code === 'BracketLeft') this._nudgeVolume(-0.1);
      else if (e.code === 'BracketRight') this._nudgeVolume(0.1);
    });

    /* ---- UI navigation ------------------------------------------------ */
    // Menus reads the keyboard directly rather than emitting, so we listen to
    // the same keys and only speak when a screen is actually open.
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const menus = this.game && this.game.get('Menus');
      const open = !!(menus && menus.name);
      if (!open) return;
      if (e.code.startsWith('Arrow') || e.code === 'KeyW' || e.code === 'KeyA'
        || e.code === 'KeyS' || e.code === 'KeyD' || e.code === 'Tab') {
        this.sfx.play('ui:move', null, {});
      } else if (e.code === 'Enter' || e.code === 'Space') {
        this.sfx.play('ui:confirm', null, {});
      } else if (e.code === 'Escape' || e.code === 'Backspace') {
        this.sfx.play('ui:cancel', null, {});
      }
    });
  }

  /* --------------------------------------------------------- public API */

  /**
   * Play a sound.
   * @param name see `Sfx` — `swing:greatsword`, `impact:metal`,
   *   `voc:sabertusk:aggro`, `step:gravel`, `spell:ice`, `ui:confirm`,
   *   `thunder`, plus the legacy short names `hit` / `swing` / `warp` / `step` /
   *   `magic` / `ui` / `parry`.
   * @param [pos] world position, omit for 2D
   * @param [opts] {volume, hrtf, scale, distance, at}
   */
  play(name: string, pos?: {x:number,y:number,z:number}, opts: any = {}) {
    if (!this.enabled || !this.sfx) return false;
    return this.sfx.play(name, pos, opts);
  }

  /**
   * Force the music state. The game normally picks this itself from combat and
   * the clock; call it for scripted moments.
   */
  setState(s: 'field' | 'night' | 'tension' | 'combat' | 'boss' | 'camp' | 'victory' | 'silence') {
    this.state = s;
    if (!this.enabled) return;
    this._musicState = s;
    this.score.setState(s);
  }

  /**
   * Weather changed. `Weather.set()` already calls this; the per-frame values
   * (wind strength, rain intensity, gusts) are read straight off the Weather
   * system in `_environment`, so this only needs to move the bed immediately
   * rather than waiting for the next probe.
   */
  setWeather(w: 'clear' | 'overcast' | 'storm' | 'fog' | 'rain') {
    if (!this.enabled) return;
    this.weatherName = w;
    this.amb.setRain(w === 'storm' ? 1 : w === 'rain' ? 0.55 : 0);
    this.amb.setWind(w === 'storm' ? 3.0 : w === 'overcast' ? 1.3 : w === 'fog' ? 0.5 : 1.0);
  }

  /**
   * A character speaks. Ducks the score and ambience for the length of the
   * line so dialogue and party banter always sit on top.
   * @param [depth] 0..1, lower ducks harder
   */
  say(seconds: number = 2.5, depth: number = 0.42) {
    if (!this.enabled) return;
    this.graph.duck(depth, Math.max(0.2, seconds), 0.7);
  }

  /** Lighter duck for in-world banter. */
  banter(seconds = 2) { this.say(seconds, 0.62); }

  /**
   * @param v 0..1
   */
  setVolume(bus: 'master' | 'music' | 'sfx' | 'amb' | 'ui' | 'voice', v: number) {
    this._userVolume[bus] = clamp(v, 0, 1);
    if (this.graph) this.graph.setVolume(bus, this._userVolume[bus]);
  }

  /** Current user setting for a bus, 0..1. */
  volumeOf(bus: any) { return this._userVolume[bus] ?? 1; }

  setMuted(on?: boolean) { return this.graph ? this.graph.setMuted(on) : false; }

  /** Master volume, 0..1. */
  get volume() { return this._volume ?? 1; }

  _nudgeVolume(d: any) {
    this._volume = clamp((this._volume ?? 1) + d, 0, 1);
    this.graph.setVolume('master', this._volume);
    this.sfx.play('ui:move', null, {});
  }

  get buses(): string[] { return BUSES.slice(); }

  /**
   * The live AudioContext, or null before the first gesture unlocks it.
   * Another system that wants to make its own sound (the Regalia radio, for
   * instance) should build against this rather than opening a second context —
   * two contexts means two device streams, two limiters and no shared ducking.
   */
  get context() { return this.ctx; }

  /**
   * A bus to route an external source into, so it inherits the mix: ducking,
   * the glue compressor, the limiter and the user's volume sliders.
   */
  busNode(name: 'music' | 'sfx' | 'amb' | 'ui' | 'voice' = 'music'): GainNode | null { return this.graph ? this.graph.bus[name] || null : null; }

  /**
   * Hand the music over to something else (the car radio) and take it back.
   * The score keeps its clock, so returning mid-journey resumes in tempo.
   */
  suspendScore(on: boolean) {
    if (!this.enabled) return;
    this._scoreSuspended = !!on;
    this.score.setState(on ? 'silence' : this._musicState, { fade: on ? 1.2 : 2.0 });
  }

  /** Acoustic space for the short reverb. */
  setSpace(name: any) { if (this.graph) this.graph.setSpace(name); }

  /** Everything the verification harness and the debug overlay want. */
  stats() {
    if (!this.enabled) return { enabled: false };
    return {
      enabled: true,
      cpuMs: +this.cpuMs.toFixed(3),
      graph: this.graph.stats(),
      score: this.score.stats(),
      sfx: this.sfx.stats(),
      ambience: this.amb.stats(),
      musicState: this._musicState,
    };
  }

  /* -------------------------------------------------------------- tick */

  update(dt: any, game: any) {
    if (!this.enabled) return;
    const t0 = performance.now();

    this._listener(game);
    this._music(dt, game);
    this._footsteps(dt, game);
    this._enemies(dt, game);

    // Backstop for voices whose `onended` never arrived (tab hidden, context
    // suspended, a frame long enough to starve the event loop). Timed off the
    // audio clock, not the simulation clock: hitstop and slow-motion scale
    // `dt`, and a voice's lifetime is in real seconds regardless.
    const now = this.graph.now;
    if (now > this._sweepAt) { this._sweepAt = now + 0.5; this.graph.sweep(now); }

    this._probeTimer -= dt;
    if (this._probeTimer <= 0) {
      this._probeTimer = 0.4;
      this._environment(game);
    }
    this.amb.update(this._playerPos() || ORIGIN);

    this.cpuMs += ((performance.now() - t0) - this.cpuMs) * 0.05;
  }

  _playerPos() {
    const p = this.game && this.game.get('Player');
    return p && p.position ? p.position : null;
  }

  _listener(game: any) {
    const cam = game.camera;
    cam.getWorldDirection(FWD);
    UP.set(0, 1, 0).applyQuaternion(cam.quaternion);
    POS.setFromMatrixPosition(cam.matrixWorld);
    this.graph.setListener(POS, FWD, UP);
  }

  /* ------------------------------------------------------------- music */

  _music(dt: any, game: any) {
    const combat = game.get('Combat');
    const enemies = game.get('Enemies');
    const sky = game.get('Sky');
    const menus = game.get('Menus');
    const player = game.get('Player');

    // Menus muffle the score rather than replacing it.
    const menu = menus && menus.name;
    if (menu !== this._lastMenu) {
      if (menu && !this._lastMenu) this.sfx.play('ui:open', null, {});
      else if (!menu && this._lastMenu) this.sfx.play('ui:close', null, {});
      this._lastMenu = menu;
      this.score.setFilter(menu ? 900 : 20000, 0.3);
      // Pull the world down behind a menu without clobbering the user's slider.
      this.graph.setVolume('sfx', this.volumeOf('sfx') * (menu ? 0.55 : 1), 0.3);
      this.graph.setVolume('amb', this.volumeOf('amb') * (menu ? 0.5 : 1), 0.3);
    }

    const inCombat = !!(combat && combat.inCombat);
    const hours = sky ? sky.hours : 12;
    const night = hours >= 19 || hours < 5.2;

    // Encounter resolution: the fanfare fires when the last enemy near us dies.
    if (this._wasInCombat && !inCombat) {
      if (this._encounterKills > 0) this.score.victory(night ? 'night' : 'field');
      this._encounterKills = 0;
    }
    if (!this._wasInCombat && inCombat) {
      // A stinger covers the bar we have to wait for before the cue changes.
      this.sfx.play('impact:metal', null, { volume: 0.5, scale: 1.4 });
      this.graph.duck(0.7, 0.15, 0.6);
    }
    this._wasInCombat = inCombat;

    let want;
    if (this._camping) want = 'camp';
    else if (inCombat) want = this._bossPresent(enemies, player) ? 'boss' : 'combat';
    else if (this._threat(enemies, player) > 0) want = 'tension';
    else want = night ? 'night' : 'field';

    if (this._scoreSuspended) { this._musicState = want; return; }
    if (want !== this._musicState && this.score.stateName !== 'victory') {
      this._musicState = want;
      this.state = want;
      this.score.setState(want, { fade: want === 'combat' || want === 'boss' ? 1.4 : 3.2 });
    }

    // Intensity: how much of the encounter is still standing, and how close.
    if (inCombat && enemies && player) {
      let hp = 0, max = 0, near = 0;
      for (const e of enemies.list) {
        if (e.dead) continue;
        const d = e.root.position.distanceTo(player.position);
        if (d > 40) continue;
        hp += e.hp; max += e.maxHp;
        if (d < 12) near++;
      }
      const pressure = clamp(near / 3, 0, 1);
      const remaining = max > 0 ? hp / max : 0;
      this.score.setIntensity(clamp(0.35 + 0.4 * pressure + 0.35 * (1 - remaining), 0, 1));
    } else {
      this.score.setIntensity(0.2);
    }
  }

  /** Any enemy big enough to warrant the boss cue. */
  _bossPresent(enemies: any, player: any) {
    if (!enemies || !player) return false;
    for (const e of enemies.list) {
      if (e.dead) continue;
      const key = this._speciesOf(e);
      if (key === 'irongiant' && e.root.position.distanceTo(player.position) < 45) return true;
    }
    return false;
  }

  /** Enemies aware of us but not yet engaged — the tension bed. */
  _threat(enemies: any, player: any) {
    if (!enemies || !player) return 0;
    let n = 0;
    for (const e of enemies.list) {
      if (e.dead) continue;
      if (e.root.position.distanceTo(player.position) < 70) n++;
    }
    return n;
  }

  /* --------------------------------------------------------- footsteps */

  _footsteps(dt: any, game: any) {
    const p = game.get('Player');
    if (!p || !p.position) return;
    const speed = p.speed || 0;
    if (speed < 0.25) { this._stride = 0.35; return; }
    const run = speed > 5.0;
    // Stride length grows with speed, so the cadence stays believable across
    // the whole locomotion blend rather than turning into a machine gun.
    const strideLen = run ? 2.45 : 1.55;
    this._stride += (speed / strideLen) * dt;
    if (this._stride < 1) return;
    this._stride -= 1;

    const surface = this._surfaceAt(p.position.x, p.position.z);
    this.sfx.play(`step:${surface}`, null, {
      run, volume: clamp(0.45 + speed * 0.07, 0.4, 1.05), minGap: 0.05,
    });
    if (this.sfx.rng() < (run ? 0.8 : 0.35)) this.sfx.play('cloth', null, { volume: run ? 0.7 : 0.4 });
  }

  /** Terrain material, cached on a 3 m grid — `sampleMaterial` is not free. */
  _surfaceAt(x: any, z: any) {
    const terrain = this.game.get('Terrain');
    if (!terrain || !terrain.sampleMaterial) return 'dirt';
    const water = this.game.get('Water');
    if (water && water.surfaceAt) {
      const s = water.surfaceAt(x, z);
      if (s != null && terrain.heightAt(x, z) < s + 0.35) return 'water';
    }
    const key = `${Math.round(x / 3)},${Math.round(z / 3)}`;
    let m = this._matCache.get(key);
    if (m === undefined) {
      m = terrain.sampleMaterial(x, z).name;
      if (this._matCache.size > 512) this._matCache.clear();
      this._matCache.set(key, m);
    }
    return m;
  }

  /* ----------------------------------------------------------- enemies */

  _enemies(dt: any, game: any) {
    const enemies = game.get('Enemies');
    const player = game.get('Player');
    if (!enemies || !player) return;
    for (const e of enemies.list) {
      if (e.dead) { this._enemyState.delete(e); continue; }
      const d = e.root.position.distanceTo(player.position);
      if (d > 48) continue;
      const key = this._speciesOf(e);
      const prev = this._enemyState.get(e);
      if (prev !== e.state) {
        this._enemyState.set(e, e.state);
        if (e.state === 'telegraph' && key) {
          this.sfx.play(`voc:${key}:aggro`, e.centre(), { volume: 0.85, hrtf: d < 20, minGap: 0.2 });
        } else if (e.state === 'attack') {
          this.sfx.play(key === 'mt' ? 'swing:firearm' : key === 'irongiant' ? 'swing:greatsword' : 'swing:sword',
            e.centre(), { volume: 0.7, minGap: 0.05 });
        }
      }
      // Enemy footfalls: heavy things must be heard moving.
      if (e.state === 'approach' && d < 26) {
        let s = this._enemyStride.get(e) || 0;
        s += (e.speed / (1.6 * e.scale)) * dt;
        if (s >= 1) {
          s -= 1;
          const heavy = key === 'irongiant';
          this.sfx.play(`step:${heavy ? 'rock' : this._surfaceAt(e.root.position.x, e.root.position.z)}`,
            e.root.position, { volume: heavy ? 1.3 : 0.5, run: true, minGap: 0.04 });
        }
        this._enemyStride.set(e, s);
      }
    }
  }

  /** What a hit on this enemy should sound like. */
  _enemyMaterial(enemy: any) {
    const key = this._speciesOf(enemy);
    if (key === 'mt') return 'metal';
    if (key === 'irongiant') return 'armour';
    return 'flesh';
  }

  _speciesOf(enemy: any) {
    if (!enemy) return null;
    return (enemy.type && enemy.type.key) || null;
  }

  /* ------------------------------------------------------- environment */

  /** Weather, clock, nearby water, floodlights and the shape of the space. */
  _environment(game: any) {
    const weather = game.get('Weather');
    if (weather) {
      this.amb.setWind(weather.windStrength ?? 1);
      this.amb.setRain(weather.rainIntensity ?? 0);
    }
    const sky = game.get('Sky');
    const rpg = game.get('Rpg');
    const depth = rpg && rpg.day && rpg.day.nightDepth != null ? rpg.day.nightDepth : 0;
    if (sky) this.amb.setTimeOfDay(sky.hours, depth);

    const p = this._playerPos();
    if (!p) return;

    // Water: nearest lake, clamped to its footprint so the sound comes from the
    // shore in front of us rather than the centre of the basin.
    const water = game.get('Water');
    if (water && water.bodies && water.bodies.length) {
      let best: any = null, bestD = Infinity;
      for (const b of water.bodies) {
        const x = clamp(p.x, b.cx - b.w * 0.5, b.cx + b.w * 0.5);
        const z = clamp(p.z, b.cz - b.d * 0.5, b.cz + b.d * 0.5);
        const dd = Math.hypot(p.x - x, p.z - z);
        if (dd < bestD) { bestD = dd; best = { x, y: water.level, z }; }
      }
      this.amb.setWater(best, bestD);
    }

    // Floodlights: the nearest practical light at a fuel stop or outpost.
    const props = game.get('Props');
    const lights = props && props.outposts && props.outposts.lights;
    if (lights && lights.length) {
      let best: any = null, bestD = Infinity;
      for (const l of lights) {
        const lp = l.light.position;
        const dd = Math.hypot(p.x - lp.x, p.z - lp.z);
        if (dd < bestD) { bestD = dd; best = lp; }
      }
      const on = best && (!sky || sky.hours >= 17.5 || sky.hours < 7);
      this.amb.setFloodlights(on ? best : null, bestD);
    }

    // Acoustic space: if the ground rises on every side we are in a cut, and a
    // cut answers you. This is cheap and it is real.
    const terrain = game.get('Terrain');
    if (terrain && terrain.heightAt) {
      const h0 = terrain.heightAt(p.x, p.z);
      let walls = 0;
      for (const [dx, dz] of PROBE) {
        if (terrain.heightAt(p.x + dx, p.z + dz) - h0 > 7) walls++;
      }
      this.graph.setSpace(walls >= 3 ? 'canyon' : 'outdoor');
    }

    // Camping: standing on a haven at night is the camp cue.
    const day = rpg && rpg.day;
    if (day && day.canCamp) {
      const camp = day.canCamp({ x: p.x, z: p.z });
      const shouldCamp = !!(camp.ok && day.isNight);
      if (shouldCamp !== this._camping) this._camping = shouldCamp;
    }
  }

  /* ------------------------------------------------------------- reset */

  /** Called by `Game.resetClock()` before a deterministic capture. */
  resetClock() { /* the audio clock is independent of the sim clock */ }

  /**
   * Render a scripted session through an OfflineAudioContext.
   *
   * This is how the audio gets verified: you cannot screenshot a mix, so the
   * harness renders one and measures it. The whole stack is built against the
   * offline context, the script schedules state changes and one-shots at
   * explicit times, and the score and ambience are asked to fill the entire
   * session in one pass instead of from a timer.
   *
   * @param {object} o
   */
  static async renderSession(o: { seconds: number, sampleRate?: number, script: (api:any)=>void, maxVoices?: any }): Promise<{buffer:AudioBuffer, stats:any}> {
    const seconds = o.seconds ?? 30;
    const sampleRate = o.sampleRate ?? 44100;
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new Off(2, Math.ceil(seconds * sampleRate), sampleRate);

    const graph = new AudioGraph(ctx, { offline: true, maxVoices: o.maxVoices ?? 72 });
    const inst = new Instruments(graph);
    const sfx = new Sfx(graph, inst);
    const amb = new Ambience(graph, sfx);
    const score = new Score(graph, inst);
    score.nextBarTime = 0.05;

    const api = { ctx, graph, inst, sfx, amb, score, seconds };
    if (o.script) o.script(api);

    // One pass fills the whole timeline; the queue inside Score applies the
    // scripted state changes as the musical clock reaches them.
    score._scheduleUntil(seconds);
    amb.scheduleUntil(seconds, { x: 0, y: 1.6, z: 0 });

    const buffer = await ctx.startRendering();
    return {
      buffer,
      stats: { graph: graph.stats(), score: score.stats(), sfx: sfx.stats(), ambience: amb.stats() },
    };
  }
}

const PROBE = [[14, 0], [-14, 0], [0, 14], [0, -14]];
const ORIGIN = { x: 0, y: 0, z: 0 };

// Scratch vectors — the listener update runs every frame and must not allocate.
const FWD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
const POS = new THREE.Vector3();

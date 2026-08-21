import { Registry } from './Registry.ts';
import { DevConsole } from './Console.ts';
import { StatsHud } from './StatsHud.ts';
import { Freecam } from './Freecam.ts';
import { Inbox } from './Inbox.ts';
import { Stage } from './Stage.ts';
import { AssetBrowser } from './AssetBrowser.ts';
import { ViewModes } from './ViewModes.ts';
import { SHOTS } from '../game/Shots.ts';
import { worldMap } from '../world/map/WorldMap.ts';
import './dev.css';

/**
 * In-game developer / review suite. Loaded only under `?debug`.
 *
 * Registered as the **last** system, which is the whole trick: `Game.frame()`
 * runs every `update()` then every `lateUpdate()`, so a system appended last
 * sees the final camera after `CameraRig` has written it and can overwrite it.
 * It also means `game.paused` — which skips `update()` but not `lateUpdate()` —
 * freezes the world while this suite keeps running. Neither behaviour needed a
 * change to `Game.js`, which BRIEF rule 4 forbids editing.
 *
 * The suite never touches `src/ui/**`: it mounts its own `#dev` root, the same
 * way `TitleScreen` owns `#title`.
 */
class DevSuite {
  _inputWas!: any;
  _scale!: any;
  _tainted!: any;
  bookmarks!: any;
  browser!: AssetBrowser;
  cam!: Freecam;
  console!: DevConsole;
  game!: any;
  hint!: any;
  inbox!: Inbox;
  reg!: Registry;
  root!: any;
  shotAt!: number;
  shotNames!: any;
  stage!: Stage;
  stats!: StatsHud;
  taint!: any;
  tuning!: any;
  views!: ViewModes;
  constructor() {
    this.reg = new Registry();
    this.bookmarks = load('dev.bookmarks', {});
    this.tuning = load('dev.tuning', {});
    this.shotNames = Object.keys(SHOTS);
    this.shotAt = -1;
    this._inputWas = null;
  }

  init(game: any) {
    this.game = game;

    this.root = document.createElement('div');
    this.root.id = 'dev';
    document.body.appendChild(this.root);

    this.stats = new StatsHud(this.root);
    this.console = new DevConsole(this.root, this.reg);
    this.console.installHelp();
    this.cam = new Freecam();
    this.inbox = new Inbox(this.root, game, this.reg);
    this.stage = new Stage();
    this.browser = new AssetBrowser(this.root, game, this.stage);
    this.views = new ViewModes();

    this.hint = document.createElement('div');
    this.hint.className = 'dev-hint';
    this.hint.innerHTML = HINT;
    this.root.appendChild(this.hint);

    this.taint = document.createElement('div');
    this.taint.className = 'dev-taint';
    this.taint.textContent = 'DEBUG STATE MODIFIED';
    this.taint.style.display = 'none';
    this.root.appendChild(this.taint);

    this._register(game);
    console.info('[dev] suite ready — ` for console, F8 to fly');
  }

  // ------------------------------------------------------------- registry

  _register(game: any) {
    const reg = this.reg;
    const post = () => game.post;

    reg.cvar({
      name: 'cam.speed', category: 'camera', help: 'freecam metres/sec (mouse wheel also)',
      min: 0.25, max: 4000, get: () => this.cam.speed, set: (v: any) => { this.cam.speed = v; },
    });
    reg.cvar({
      name: 'cam.fov', category: 'camera', help: 'freecam vertical FOV',
      min: 8, max: 120, get: () => this.cam.fov, set: (v: any) => { this.cam.fov = v; },
    });
    reg.cvar({
      name: 'cam.roll', category: 'camera', help: 'dutch angle, radians',
      min: -1.5, max: 1.5, get: () => this.cam.roll, set: (v: any) => { this.cam.roll = v; },
    });

    reg.cvar({
      name: 'time.scale', category: 'time', help: 'simulation speed multiplier',
      min: 0, max: 4,
      get: () => (this._scale == null ? 1 : this._scale),
      // Applied in lateUpdate, after every system's update() has run. That is
      // why this needs no change to CombatSystem, which damps time.scale back
      // to 1 during its own update and would otherwise fight us every frame.
      set: (v: any) => { this._scale = v; },
    });
    reg.cvar({
      name: 'time.paused', category: 'time', help: 'freeze update(), keep lateUpdate()',
      get: () => !!game.paused, set: (v: any) => { game.paused = !!v; },
    });

    reg.cvar({
      name: 'sky.time', category: 'world', help: 'time of day, hours 0-24',
      min: 0, max: 24,
      get: () => { const s = game.get('Sky'); return s ? s.hours : 12; },
      set: (v: any) => { const s = game.get('Sky'); if (s) s.setTimeOfDay(v); },
    });
    reg.cvar({
      name: 'sky.weather', category: 'world', help: 'clear | overcast | storm | fog',
      choices: ['clear', 'overcast', 'storm', 'fog'],
      get: () => { const w = game.get('Weather'); return w ? w.name : 'clear'; },
      set: (v: any) => { const w = game.get('Weather'); if (w) w.set(String(v)); },
    });

    reg.cmd({
      name: 'post', category: 'render', args: '<flags|clear>',
      help: 'post-process kill switches, e.g. `post nodof,nobloom`',
      exec: (a: any) => { post().debugToggle(a === 'clear' ? '' : a); return `post: ${a}`; },
    });
    reg.cmd({
      name: 'quality', category: 'render', args: '<low|medium|high|ultra>',
      help: 'renderer quality tier',
      exec: (a: any) => { game.rnd.setQuality(a.trim()); return `quality: ${a}`; },
    });

    // -------- navigation

    reg.cmd({
      name: 'fly', category: 'camera', args: '[on|off]',
      help: 'toggle freecam, simulation keeps running',
      exec: (a: any) => this._setFly(a ? a !== 'off' : !this.cam.enabled),
    });
    reg.cmd({
      name: 'goto', category: 'camera', args: '<x> <z> [y]',
      help: 'fly to world coordinates',
      exec: (a: any) => {
        const n = a.split(/[\s,]+/).map(Number);
        if (n.length < 2 || n.some((v: any) => !Number.isFinite(v))) throw new Error('goto <x> <z> [y]');
        const terr = game.get('Terrain');
        const y = n[2] != null ? n[2] : (terr ? terr.heightAt(n[0], n[1]) + 40 : 100);
        this._setFly(true);
        this.cam.jump([n[0], y, n[1]], game.post);
        return `at ${n[0]}, ${y.toFixed(1)}, ${n[1]}`;
      },
    });
    reg.cmd({
      name: 'warp', category: 'camera', args: '<poiId|zoneId>',
      help: 'fly to a named POI or zone centre',
      exec: (a: any) => this._warp(a.trim()),
    });
    reg.cmd({
      name: 'where', category: 'camera', help: 'print camera position, zone and nearest POI',
      exec: () => {
        const p = game.camera.position;
        const z = worldMap.zoneAt(p.x, p.z);
        const poi = worldMap.nearestPOI(p.x, p.z, { maxDist: 2000 });
        return `${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}  zone=${z ? z.id : '-'}  near=${poi ? (poi.id || poi.poi?.id) : '-'}`;
      },
    });

    // -------- shots

    reg.cmd({
      name: 'shot', category: 'shots', args: '<name|next|prev|list>',
      help: 'apply a corpus shot',
      exec: (a: any) => this._shot(a.trim()),
    });
    reg.cmd({
      name: 'eject', category: 'shots',
      help: 'leave the posed shot and fly from exactly where it stood',
      exec: () => this._setFly(true),
    });
    reg.cmd({
      name: 'shot.save', category: 'shots', args: '[name]',
      help: 'record the live camera as this shot\'s framing into .review/tuning',
      exec: (a: any) => this._saveFraming(a.trim()),
    });

    // -------- bookmarks

    reg.cmd({
      name: 'mark', category: 'camera', args: '<slot> [name]',
      help: 'store the camera in a bookmark slot',
      exec: (a: any) => {
        const [slot, ...rest] = a.split(/\s+/);
        if (!slot) throw new Error('mark <slot> [name]');
        this.bookmarks[slot] = { ...this.cam.asShot(), name: rest.join(' ') || slot };
        save('dev.bookmarks', this.bookmarks);
        return `marked ${slot}`;
      },
    });
    reg.cmd({
      name: 'jump', category: 'camera', args: '<slot>',
      help: 'fly to a bookmark',
      exec: (a: any) => this._jump(a.trim()),
    });
    reg.cmd({
      name: 'marks', category: 'camera', help: 'list bookmarks',
      exec: () => Object.entries(this.bookmarks)
        .map(([k, v]) => `${k}  ${v.name}  ${v.pos.join(', ')}`).join('\n') || 'none',
    });

    // -------- misc

    reg.cmd({
      name: 'note', category: 'review', help: 'capture the frame and file a review note',
      exec: () => { this.inbox.begin(); return ''; },
    });
    reg.cmd({
      name: 'reset', category: 'console', help: 'restore every cvar to its boot value',
      exec: () => { reg.reset(); this._scale = null; return 'cvars restored'; },
    });

    // -------- asset browser

    reg.cmd({
      name: 'assets', category: 'assets', args: '[on|off]',
      help: 'isolation stage: step every enemy, hero, NPC and weapon',
      exec: (a: any) => {
        const on = a ? a !== 'off' : !this.browser.open;
        this.browser.setOpen(on);
        // The stage writes `cam.pos`, but only `Freecam.apply` puts it on the
        // real camera -- so the browser is useless unless flight is on.
        this._setFly(on);
        return on ? 'browser open — arrows to step, F4 to close' : 'browser closed';
      },
    });
    reg.cmd({
      name: 'asset', category: 'assets', args: '<family> <key>',
      help: 'stage one named asset, e.g. `asset enemies irongiant`',
      exec: (a: any) => {
        const [fam, key] = a.split(/\s+/);
        const i = this.browser.families.findIndex((f: any) => f.id === fam);
        if (i < 0) throw new Error(`family: ${this.browser.families.map((f: any) => f.id).join(' | ')}`);
        if (!this.browser.open) this.browser.setOpen(true);
        this.browser.familyAt = i;
        const keys = this.browser.list();
        const at = keys.indexOf(key);
        if (at < 0) throw new Error(`${fam}: ${keys.join(' ')}`);
        this.browser.select(at);
        return `${fam}/${key}`;
      },
    });
    reg.cvar({
      name: 'stage.spin', category: 'assets', help: 'turntable auto-rotate',
      get: () => this.stage.spin, set: (v: any) => { this.stage.spin = !!v; },
    });
    reg.cvar({
      name: 'stage.rate', category: 'assets', help: 'turntable radians/sec',
      min: 0, max: 3, get: () => this.stage.rate, set: (v: any) => { this.stage.rate = v; },
    });

    // -------- render debug views

    reg.cmd({
      name: 'view', category: 'render', args: `<${ViewModes.names.join('|')}>`,
      help: 'whole-scene material override',
      exec: (a: any) => `view: ${this.views.set(a.trim() || 'off', game.scene)}`,
    });
  }

  // ------------------------------------------------------------- actions

  _setFly(on: boolean) {
    const want = !!on;
    if (want === this.cam.enabled) return want ? 'flying' : 'grounded';
    this.cam.setEnabled(want, this.game.camera);
    const input = this.game.input;
    if (want) {
      // Stop the same WASD press from also walking Noctis across the map.
      // Freecam reads the raw held-key set, which `enabled` does not gate.
      this._inputWas = input.enabled;
      input.enabled = false;
    } else if (this._inputWas != null) {
      input.enabled = this._inputWas;
      this._inputWas = null;
      // Hand the lens back to whatever owned it.
      const rig = this.game.get('Camera');
      if (rig && rig._cut) rig._cut();
    }
    return want ? 'flying' : 'grounded';
  }

  _warp(id: any) {
    if (!id) throw new Error('warp <poiId|zoneId>');
    const poi = worldMap.poiById(id);
    const zone = worldMap.zoneById && worldMap.zoneById.get
      ? worldMap.zoneById.get(id)
      : worldMap.zones.find((z: any) => z.id === id);
    const x = poi ? poi.x : (zone ? zone.cx : null);
    const z = poi ? poi.z : (zone ? zone.cz : null);
    if (x == null) throw new Error(`no POI or zone '${id}'`);
    const terr = this.game.get('Terrain');
    // Stand off and above rather than landing on the exact point: a zone centre
    // is frequently *inside* whatever landmark defines it. Dropping the camera
    // on `cauthess`'s centre puts you inside a mountain-sized meteor.
    const h = terr ? terr.heightAt(x, z) : 0;
    const back = poi ? 90 : 900;
    this._setFly(true);
    this.cam.jump([x, h + back * 0.45, z + back], this.game.post);
    this.cam.lookAt(x, h + 10, z);
    return `${poi ? 'poi' : 'zone'} ${id} @ ${x}, ${z}`;
  }

  _jump(slot: any) {
    const b = this.bookmarks[slot];
    if (!b) throw new Error(`no bookmark '${slot}'`);
    this._setFly(true);
    this.cam.jump(b.pos, this.game.post);
    if (b.target) this.cam.lookAt(b.target[0], b.target[1], b.target[2]);
    if (b.fov) this.cam.fov = b.fov;
    return `jumped ${slot}`;
  }

  _shot(arg: any) {
    if (arg === 'list') return this.shotNames.join(' ');
    let name = arg;
    if (arg === 'next' || arg === 'prev' || !arg) {
      const d = arg === 'prev' ? -1 : 1;
      this.shotAt = (this.shotAt + d + this.shotNames.length) % this.shotNames.length;
      name = this.shotNames[this.shotAt];
    } else {
      const i = this.shotNames.indexOf(name);
      if (i < 0) throw new Error(`unknown shot '${name}'`);
      this.shotAt = i;
    }
    this._setFly(false);
    this.game.applyShot(name);
    const doc = SHOTS[name].doc || '';
    this._toast(`${name} — ${doc}`);
    return `${name}: ${doc}`;
  }

  /**
   * Write the live camera back as a shot framing.
   *
   * Goes to `.review/tuning/`, never to `src/game/Shots.js`. Two reasons: BRIEF
   * rule 4 makes `Shots.js` a shared file, and the capture daemon reboots its
   * warm page on any `src/` edit — a suite that wrote into `src/` would
   * invalidate every running agent's page mid-capture.
   */
  async _saveFraming(name: any) {
    const key = name || this.shotNames[this.shotAt];
    if (!key) throw new Error('shot.save <name> (or step to a shot first)');
    this.tuning[key] = this.cam.asShot();
    save('dev.tuning', this.tuning);
    try {
      const res = await fetch('/__review/tuning', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'shots.patch.json', patch: this.tuning }),
      });
      const out = await res.json();
      this.console.print(`wrote ${out.file}`, 'dim');
    } catch {
      this.console.print('no review server — kept in localStorage only', 'err');
    }
    return `${key}: ${JSON.stringify(this.tuning[key])}`;
  }

  _toast(text: any) {
    this.hint.textContent = text;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { this.hint.innerHTML = HINT; }, 4000);
  }

  /** Browser navigation. Only bound while the browser is open. */
  _browserKeys(input: any) {
    const b = this.browser;
    if (input.keyDown('ArrowRight')) b.step(1);
    if (input.keyDown('ArrowLeft')) b.step(-1);
    if (input.keyDown('ArrowDown')) b.stepFamily(1);
    if (input.keyDown('ArrowUp')) b.stepFamily(-1);
    if (input.keyDown('Comma')) b.stepPose(-1);
    if (input.keyDown('Period')) b.stepPose(1);
    if (input.keyDown('Space')) { b.playing = !b.playing; b.render(); }
    if (input.keyDown('KeyO')) b.mark('ok');
    if (input.keyDown('KeyK')) b.mark('flag');
    if (input.keyDown('KeyU')) { b.unreviewedOnly = !b.unreviewedOnly; b.select(0); }
  }

  // ------------------------------------------------------------- per frame

  lateUpdate(dt: any, game: any) {
    const input = game.input;
    const typing = this.console.open || this.inbox.open;

    if (input.keyDown('Backquote')) this.console.toggle();
    if (!typing) {
      if (input.keyDown('F2')) this.stats.setVisible(!this.stats.visible);
      if (input.keyDown('F8')) this._setFly(!this.cam.enabled);
      if (input.keyDown('F9')) this.inbox.begin();
      if (input.keyDown('F4')) this.reg.exec('assets');
      if (this.browser.open) this._browserKeys(input);
      if (input.keyDown('KeyP')) {
        game.paused = !game.paused;
        this._setFly(game.paused || this.cam.enabled);
        this._toast(game.paused ? 'paused — flying' : 'running');
      }
      if (this.cam.enabled) {
        if (input.keyDown('BracketLeft')) this.reg.exec('shot prev');
        if (input.keyDown('BracketRight')) this.reg.exec('shot next');
      }
    }

    if (!typing) this.cam.update(dt, input);
    this.browser.update(dt);
    // Turntable writes the camera *before* apply(), so manual flight still
    // wins whenever `stage.spin` is off.
    this.stage.update(dt, this.cam, game);
    this.cam.apply(game.camera);

    // Written here, after every update(), so nothing can damp it back.
    if (this._scale != null) game.time.scale = this._scale;

    this.stats.update(game.time.rawDt || dt, game);

    const tainted = Object.keys(this.reg.deltas()).length > 0;
    if (tainted !== this._tainted) {
      this._tainted = tainted;
      this.taint.style.display = tainted ? '' : 'none';
    }
  }
}

const HINT = '<b>`</b> console · <b>F8</b> fly · <b>P</b> pause+fly · <b>F4</b> assets · <b>F9</b> note · <b>F2</b> stats';

const load = (k: any, fallback: any) => {
  try { return JSON.parse(localStorage.getItem(k)) || fallback; } catch { return fallback; }
};
const save = (k: any, v: any) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ }
};

/**
 * Attach the suite to a booted game.
 */
export async function installDevSuite(game: any) {
  const suite = new DevSuite();
  game.add(suite, 'Dev');
  suite.init(game);
  window.DEV = suite;
  return suite;
}

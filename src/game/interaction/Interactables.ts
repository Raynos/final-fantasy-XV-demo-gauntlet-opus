import * as THREE from 'three';
import { InteractPrompt } from './InteractPrompt.ts';
import { Dialogue } from './Dialogue.ts';
import type { DialogueScript } from './Dialogue.ts';
import type { Game } from '../Game.ts';
import type { ScreenName } from '../../ui/Menus.ts';

/**
 * The interaction verb.
 *
 * Anything in the world that the player can stand in front of and press a key
 * at registers itself here with a position, a reach, a label and a handler.
 * Every frame the system picks the single best candidate — near enough, inside
 * the facing cone, highest priority — raises the contextual prompt over it, and
 * fires its handler on `E` / gamepad A.
 *
 * ```js
 * const h = game.get('Interaction').register({
 *   id: 'regalia-drive',
 *   pos: car.position,           // Vector3 (live reference is fine)
 *   radius: 3.2,
 *   verb: 'Drive',
 *   label: 'Regalia',
 *   priority: 2,
 *   handler: (game) => vehicle.enter(),
 * });
 * h.dispose();
 * ```
 *
 * Selection rules, in order:
 *  1. Reject anything further than `radius` (plus a hysteresis bonus for the
 *     currently-selected target, so the prompt never flickers between two
 *     things you are standing between).
 *  2. Reject anything outside `cone` degrees of where the player is facing,
 *     unless it is very close (inside `radius * 0.4`, where facing stops
 *     mattering because you are practically standing on it).
 *  3. Of the survivors, take the highest `priority`; ties break on the smallest
 *     normalised distance.
 */

/**
 * How far a far marker reaches, metres.
 *
 * A little wider than Hammerhead's forecourt (the fast-travel pin lands 6.2 m
 * from the garage counter, 11.5 m from the hunt board, 22.8 m from the pump),
 * so arriving in a town lights up the town rather than one corner of it.
 */
const FAR = 22;

/** At most this many diamonds at once: a map, not confetti. */
const MAX_MARKERS = 8;

const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();

let _nextId = 0;

/**
 * A thing in the world the player can press E on, **as registered**: every
 * default is filled in, which is what `_pick` scores against.
 */
export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  /** Metres the prompt appears within. */
  radius: number;
  /** Degrees off the player's facing that still count as looking at it. */
  cone: number;
  /** The word on the prompt -- 'Talk', 'Open', 'Rest'. */
  verb: string;
  label: string;
  hint: string;
  /** Higher wins a tie; distance and facing break the rest. */
  priority: number;
  /** Metres above `pos` the prompt floats. */
  yOffset: number;
  handler: (game: Game, item: Interactable) => void;
  enabled: () => boolean;
  /** Key cap drawn on the prompt. */
  key: string;
}

/** The same thing **as authored**: everything but `pos` and `handler` optional. */
export interface InteractableSpec {
  id?: string;
  pos: THREE.Vector3 | number[];
  radius?: number;
  cone?: number;
  verb?: string;
  label?: string;
  hint?: string;
  priority?: number;
  yOffset?: number;
  handler: (game: Game, item: Interactable) => void;
  enabled?: () => boolean;
  key?: string;
}

/** What `register` hands back, so a caller never touches the registry. */
export interface InteractableHandle {
  id: string;
  item: Interactable;
  set: (patch: Partial<Interactable>) => void;
  dispose: () => void;
}

export class InteractionSystem {
  _firedAt!: number;
  _gpPrev!: boolean;
  _hyst!: number;
  _playerPos!: THREE.Vector3;
  appear!: number;
  blocked!: boolean;
  /** The interactable the prompt is currently offering, or null. */
  current!: Interactable | null;
  dialogue!: Dialogue;
  game!: Game;
  /** Live interactables keyed by id. */
  items!: Map<string, Interactable>;
  prompt!: InteractPrompt;
  /**
   * Everything else in sight that could be walked up to, nearest first.
   *
   * `current` is the one thing already inside its own 2.6-3.8 m reach. That is
   * the offer. This is the affordance: what a player can SEE is interactive
   * from where they are standing, which used to be nothing at all.
   */
  nearby!: Interactable[];
  constructor() {
    this.items = new Map();
    this.current = null;
    this.nearby = [];
    /** Raised while a screen, dialogue or cutscene owns the E key. */
    this.blocked = false;
    /** Smoothed 0..1 appear amount for the prompt. */
    this.appear = 0;
    this._hyst = 0;
    this._firedAt = -10;
  }

  async init(game: Game) {
    this.game = game;
    this.prompt = new InteractPrompt(game.uiRoot);
    this.dialogue = new Dialogue(game.uiRoot);
    this._playerPos = new THREE.Vector3();
    return this;
  }

  /**
   * Add an interactable. The returned handle can be disposed, re-labelled or
   * disabled without touching the registry directly.
   *
   * @param {object} def
   */
  register(def: InteractableSpec): InteractableHandle {
    const id = def.id || `ix${_nextId++}`;
    const item: Interactable = {
      id,
      pos: def.pos instanceof THREE.Vector3 ? def.pos : new THREE.Vector3().fromArray(def.pos || [0, 0, 0]),
      radius: def.radius ?? 2.8,
      cone: def.cone ?? 105,
      verb: def.verb || 'Talk',
      label: def.label || '',
      hint: def.hint || '',
      priority: def.priority ?? 0,
      yOffset: def.yOffset ?? 1.55,
      handler: def.handler || (() => {}),
      enabled: def.enabled || (() => true),
      key: def.key || 'E',
    };
    this.items.set(id, item);
    return {
      id,
      item,
      set: (patch) => Object.assign(item, patch),
      dispose: () => this.items.delete(id),
    };
  }

  unregister(id: string) { this.items.delete(id); }

  /** Look an interactable up by id. */
  get(id: string): Interactable | null { return this.items.get(id) || null; }

  /**
   * Start a conversation. While one is running the interaction verb is blocked
   * and the dialogue owns E / Enter / arrows.
   * @param script see Dialogue.start
   */
  say(script: DialogueScript) { return this.dialogue.start(script, this.game); }

  /** True while a conversation is on screen. */
  get talking() { return this.dialogue && this.dialogue.active; }

  /**
   * Push a screen and suppress the prompt until it closes. Used by the shop and
   * the hunt board so E does not immediately re-trigger on the way out.
   */
  openScreen(name: ScreenName) {
    const menus = this.game?.get?.('Menus');
    if (!menus) return false;
    menus.stack.length = 0;
    menus.setScreen(name);
    this._firedAt = this.game.time.now;
    return true;
  }

  update(dt: number, game: Game) {
    const player = game.get('Player');
    const menus = game.get('Menus');
    const menuOpen = !!(menus && menus.name);
    this.dialogue.update(dt, game);

    // Fade the field HUD down behind a conversation the same way a menu does,
    // so the party panel is not competing with the speaker's nameplate. Menus
    // rewrites this flag every frame from its own state, so this only has to
    // assert the `true` case — releasing it takes care of itself.
    const hud = game.get('HUD');
    if (hud && hud.setMenuOpen && this.dialogue.active) hud.setMenuOpen(true);

    // Nothing to point at while a full-screen menu or a conversation is up.
    // The title screen and a playing cutscene are not gameplay: neither routes
    // input here, so a "Talk" prompt over either is pure noise.
    const story = game.get('Story');
    const cinematic = !!(story && (story.title?.shown || story.cine?.playing));
    const suppressed = menuOpen || cinematic || this.dialogue.active || this.blocked || !player;
    const best = suppressed ? null : this._pick(player);

    if (best !== this.current) {
      this.current = best;
      this._hyst = best ? 1 : 0;
    }

    const target = this.current ? 1 : 0;
    const rate = dt / (target > this.appear ? 0.16 : 0.12);
    this.appear = THREE.MathUtils.clamp(this.appear + (target > this.appear ? rate : -rate), 0, 1);

    this.prompt.update(dt, game, this.current, this.appear);
    // The markers are part of the field HUD and follow it, the way the minimap
    // does: they are an affordance for a player holding the controller, and a
    // posed or cinematic frame has neither. Without this they would appear in
    // every non-HUD shot in the corpus that happens to stand within 22 m of a
    // counter, which is a lot of them.
    const hudOn = hud ? hud.visible !== false : true;
    this._scanNearby(suppressed || !hudOn ? null : player);
    this.prompt.updateMarkers(game, this.nearby, FAR);

    if (suppressed || !this.current) return;
    // A one-frame guard so the same press cannot fire twice through a screen
    // opening and closing in the same tick.
    if (game.time.now - this._firedAt < 0.25) return;
    const inp = game.input;
    const pressed = inp?.keyDown?.('KeyE') || inp?.keyDown?.('Enter')
      || (inp?.gamepad?.buttons?.[0]?.pressed && !this._gpPrev);
    this._gpPrev = !!inp?.gamepad?.buttons?.[0]?.pressed;
    if (!pressed) return;
    this._firedAt = game.time.now;
    const item = this.current;
    item.handler(game, item);
  }

  /**
   * Everything enabled and in sight, minus whatever the prompt is already
   * offering, nearest first and capped.
   *
   * The cap is not a performance measure -- 101 items is a trivial loop -- it
   * is a design one: eight diamonds over a town square is a map, twenty is
   * confetti. `FAR` is 22 m because that is a little further than the width of
   * Hammerhead's forecourt, so arriving in the middle of it lights up the
   * garage counter, the hunt board and the pump without also lighting up
   * Cid's van 31 m away behind a building.
   */
  _scanNearby(player: import('../../characters/Player.ts').Player | null) {
    const out = this.nearby;
    out.length = 0;
    if (!player) return;
    const p = this._playerPos.copy(player.position);
    for (const item of this.items.values()) {
      if (item === this.current || !item.enabled()) continue;
      _to.copy(item.pos).sub(p);
      _to.y = 0;
      const d = _to.length();
      if (d > FAR) continue;
      out.push(item);
      if (out.length > 64) break;
    }
    out.sort((a, b) => a.pos.distanceToSquared(p) - b.pos.distanceToSquared(p));
    if (out.length > MAX_MARKERS) out.length = MAX_MARKERS;
  }

  /** Nearest valid interactable, with hysteresis for the incumbent. */
  _pick(player: import('../../characters/Player.ts').Player): Interactable | null {
    const p = this._playerPos.copy(player.position);
    // Face the way the player's body is pointing, not the camera: FFXV's prompt
    // follows the character, which is what makes walking past a pump feel like
    // walking past it rather than glancing at it.
    const h = player.heading ?? 0;
    _fwd.set(Math.sin(h), 0, Math.cos(h));

    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const item of this.items.values()) {
      if (!item.enabled()) continue;
      const incumbent = item === this.current;
      const reach = item.radius * (incumbent ? 1.35 : 1);
      _to.copy(item.pos).sub(p);
      _to.y = 0;
      const d = _to.length();
      if (d > reach) continue;
      let facing = 1;
      if (d > item.radius * 0.4) {
        _to.multiplyScalar(1 / Math.max(d, 1e-4));
        const cos = _to.dot(_fwd);
        const limit = Math.cos(THREE.MathUtils.degToRad(item.cone * (incumbent ? 0.62 : 0.5)));
        if (cos < limit) continue;
        facing = (cos - limit) / (1 - limit + 1e-4);
      }
      // Lower is better. The doc on `priority` says "higher wins a tie;
      // distance and facing break the rest", and this line used to say the
      // opposite: `-priority * 10` against a distance term that spans 1.0 and a
      // facing term that spans 0.35, so a priority step could never be closed
      // by standing closer or looking straight at something.
      //
      // What that cost: Dave stands 1.8 m from the Hammerhead hunt board and is
      // priority 3 to the board's 2, so **the board was unreachable** from every
      // approach except dead-on frontal, where Dave happens to fall outside his
      // own cone. Walk up to the bounty board at any angle and you talked to
      // Dave instead. Measured with `src/tools/probes/reachall.mts`: 1/12 of the
      // Hammerhead cluster missed on a 45-degree approach, and it was that one.
      //
      // 0.3 is under the 1.35 the other two terms span, so priority now decides
      // only when distance and facing are close — which is the intent it was
      // written for: a person standing at a counter beats the counter, and does
      // not beat the counter you are pressed against.
      const score = -item.priority * 0.3
        + (d / reach) * 1.0
        - facing * 0.35
        - (incumbent ? 0.22 : 0);
      if (score < bestScore) { bestScore = score; best = item; }
    }
    return best;
  }

  lateUpdate() {}
}

export default InteractionSystem;

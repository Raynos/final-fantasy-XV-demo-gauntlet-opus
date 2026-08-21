import { CHAPTERS, CHAPTER_BY_N, chapterOfQuest, REGION_CARDS } from './Chapters.ts';
import { SCENES } from './scenes/index.ts';
import { Triggers } from './Triggers.ts';
import { Conversation } from './Dialogue.ts';
import { TitleScreen } from './TitleScreen.ts';

/**
 * The narrative spine.
 *
 * `RpgSystem` knows what a quest is. `Cinematics` knows how to shoot a scene.
 * This is the thing that knows *what happens next* — it opens and closes
 * chapters, gates the main line so content unlocks in order, fires cutscenes
 * off quest and world triggers, prints the area and chapter cards, and keeps
 * the four of them talking to each other in between.
 *
 * Public surface:
 *
 * ```js
 * const story = game.get('Story');
 * story.newGame();               // title -> chapter 1 -> the opening
 * story.startChapter(3);
 * story.playScene('ch1_opening_push');
 * story.showTitle();  story.hideTitle();
 * story.chapter                  // current chapter record
 * ```
 *
 * Register after `Cinematics` (it drives it) and before `Director`.
 */
export class StorySystem {
  async init(game) {
    this.game = game;
    this.rpg = game.get('Rpg');
    this.cine = game.get('Cinematics');
    this.triggers = new Triggers(game);
    this.talk = new Conversation();
    this.title = new TitleScreen(game.uiRoot, game);
    this.title.onChoose = (pick) => this._titleChoice(pick);

    /** Current chapter number. Mirrors `rpg.chapter` but leads it. */
    this.chapterN = 0;
    this.chapter = null;
    /** Scene ids already played, so nothing repeats after a reload. */
    this.seen = new Set();
    this.queue = [];
    this._banterAt = 8;
    this._lastTag = null;
    this._started = false;

    this._wireQuests();
    this._installWorldTriggers();

    // Under the capture harness the page must stay exactly where the harness
    // put it: no title screen, no auto-playing cutscene, no clock changes.
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
    this.headless = params.has('shoot');
    const scene = params.get('scene');
    if (scene) { this.playScene(scene); this._started = true; }
    else if (!this.headless) {
      if (params.has('continue')) this._resume();
      else this.showTitle();
    }
    return this;
  }

  /* --------------------------------------------------------------- API -- */

  /** Show the title screen and its attract camera. */
  showTitle() { this.title.show(); }
  /** Dismiss the title screen. */
  hideTitle() { this.title.hide(); }

  /** Start a brand new game from the title screen. */
  newGame() {
    this._started = true;
    this.seen.clear();
    this.startChapter(1);
  }

  /**
   * Open a chapter: set its light, announce it, take its first quest, and play
   * whatever scene is bound to its start.
   * @param {number} n
   */
  startChapter(n) {
    const ch = CHAPTER_BY_N[n];
    if (!ch) return null;
    this.chapterN = n;
    this.chapter = ch;
    const rpg = this.rpg;
    if (rpg) {
      rpg.chapter = Math.max(rpg.chapter || 1, n);
      if (rpg.day && rpg.day.setHour && ch.hour != null) rpg.day.setHour(ch.hour);
      // Gate: everything up to this chapter's first quest is available, and
      // nothing beyond it is. Content unlocks in order or it is not a story.
      const first = ch.quests[0];
      if (first && rpg.quests.status(first) === 'available') rpg.quests.accept(first);
      if (first) rpg.quests.track(first);
    }
    const sky = this.game.get('Sky');
    if (sky && sky.setTimeOfDay && ch.hour != null) sky.setTimeOfDay(ch.hour);

    const startScene = ch.scenes && ch.scenes.start;
    if (startScene && SCENES[startScene]) this.playScene(startScene);
    else this._announceChapter(ch);
    window.dispatchEvent(new CustomEvent('ffxv-chapter', { detail: { phase: 'start', chapter: n, name: ch.name } }));
    return ch;
  }

  /**
   * Close a chapter with the flourish and roll into the next one.
   * @param {number} n
   */
  completeChapter(n) {
    const ch = CHAPTER_BY_N[n];
    if (!ch) return;
    const box = this.cine && this.cine.box;
    if (box) {
      box.chapterCard(n, ch.name, ch.summary, 'complete');
      const next = CHAPTER_BY_N[n + 1];
      if (next) {
        this.queue.push({ at: 4.6, fn: () => this.startChapter(n + 1) });
      }
    }
    this.talk.react('chapter-complete');
    window.dispatchEvent(new CustomEvent('ffxv-chapter', { detail: { phase: 'complete', chapter: n, name: ch.name } }));
  }

  /**
   * Play a named cutscene. Refuses to double-play and refuses while another
   * scene owns the screen.
   * @param {string} id
   * @param {object} [opts] `{ replay }`
   * @returns {Promise|null}
   */
  playScene(id, opts = {}) {
    const def = SCENES[id];
    if (!def) { console.warn(`[Story] unknown scene: ${id}`); return null; }
    if (!opts.replay && this.seen.has(id)) return null;
    if (this.cine && this.cine.playing) return null;
    this.seen.add(id);
    const p = this.cine ? this.cine.play(def) : null;
    if (p) {
      p.then(() => {
        const ch = CHAPTER_BY_N[def.chapter];
        if (ch && def.id === (ch.scenes && ch.scenes.start)) this._announceChapter(ch, 1.0);
      });
    }
    return p;
  }

  /**
   * Capture-harness entry point, so `Shots.js` can name a story state the same
   * way it names a weather or a scenario.
   *
   * ```js
   * story: 'title'                                  // the title screen
   * story: { scene: 'ch1_opening_push', at: 25 }    // a cutscene, parked at 25 s
   * ```
   *
   * @param {string|object} spec
   */
  applyShot(spec) {
    if (!spec) { this.title.hide(); if (this.cine) this.cine.stop(); return; }
    if (spec === 'title' || spec.title) {
      if (this.cine && this.cine.playing) this.cine.stop();
      this.title.show();
      // `spec` may be the bare string 'title'. Reading `.at` off a string finds
      // String.prototype.at — a function, not undefined — so `??` never fires
      // and `t` becomes a function. `t += dt` then string-concatenates and the
      // attract camera resolves to NaN, which renders a black screen.
      const at = typeof spec === 'object' ? spec.at : undefined;
      this.title.t = typeof at === 'number' ? at : 6;
      return;
    }
    this.title.hide();
    if (!spec.scene || !this.cine) return;
    if (this.cine.playing) this.cine.stop();
    const def = SCENES[spec.scene];
    if (!def) { console.warn(`[Story] unknown scene: ${spec.scene}`); return; }
    this.cine.play(def, { skippable: false });
    if (spec.at) this.cine.seek(spec.at);
  }

  /** The chapter card + area card pair that opens a chapter's play. */
  _announceChapter(ch, delay = 0) {
    const run = () => {
      window.dispatchEvent(new CustomEvent('ffxv-area', { detail: ch.area }));
      const rpg = this.rpg;
      const q = rpg && ch.quests[0] ? rpg.quests.view(ch.quests[0]) : null;
      if (q && this.cine && this.cine.box) {
        const next = q.objectives.find((o) => !o.done);
        this.queue.push({ at: 2.6, fn: () => this.cine.box.objective(q.name, next ? next.desc : q.summary) });
      }
    };
    if (delay > 0) this.queue.push({ at: delay, fn: run });
    else run();
  }

  /* ---------------------------------------------------------- reactions -- */

  _wireQuests() {
    const rpg = this.rpg;
    if (!rpg) return;
    rpg.on('quest-updated', (p) => {
      const q = p.quest;
      if (!q) return;
      const payload = { id: q.id, quest: q.id, phase: p.phase, objective: p.objective && p.objective.id };
      this.triggers.notify('quest', payload, (t, pl) => this._fire(t, pl));

      if (p.phase === 'accepted') this.talk.react('quest-accepted');
      if (p.phase !== 'complete' || q.type !== 'main') return;

      // A chapter is done when its last main quest is.
      const ch = chapterOfQuest(q.id);
      if (!ch) return;
      const all = ch.quests.every((id) => rpg.quests.status(id) === 'complete');
      if (all) this.queue.push({ at: 1.4, fn: () => this.completeChapter(ch.n) });
    });
    rpg.on('level-up', () => this.talk.react('level-up'));
    rpg.on('daemons-rising', () => this.talk.react('nightfall'));
  }

  /** Triggers that exist for the whole game, regardless of chapter. */
  _installWorldTriggers() {
    const T = this.triggers;

    // Arriving anywhere named announces itself, once.
    T.add({
      kind: 'place', once: false, tag: 'world',
      run: (ctx, pl) => {
        if (!pl.place) return;
        if (this._seenPlace && this._seenPlace.has(pl.id)) return;
        (this._seenPlace = this._seenPlace || new Set()).add(pl.id);
        window.dispatchEvent(new CustomEvent('ffxv-area', {
          detail: { name: pl.place.name, sub: pl.place.sub, meta: 'Leide' },
        }));
      },
    });

    // Crossing a region border.
    T.add({
      kind: 'region', once: false, tag: 'world',
      run: (ctx, pl) => {
        if (!pl.from || !pl.card) return;
        window.dispatchEvent(new CustomEvent('ffxv-area', { detail: pl.card }));
      },
    });

    // Reaching Hammerhead the first time is the chapter-1 hand-off.
    T.add({
      kind: 'place', id: 'hammerhead', tag: 'ch1',
      require: () => this.chapterN === 1,
      run: () => this.playScene('ch1_hammerhead'),
    });

    // Taking the bounty leads straight into the Longwythe hunt.
    T.add({
      kind: 'quest', quest: 'main_ch1_pauper', phase: 'accepted', tag: 'ch1',
      run: () => this.queue.push({ at: 1.2, fn: () => this.playScene('ch1_longwythe_hunt') }),
    });

    // The imperial checkpoint is a story beat, not a fight you stumble into.
    T.add({
      kind: 'place', id: 'blockade', tag: 'ch2',
      require: () => this.chapterN >= 1,
      run: () => this.playScene('ch2_blockade'),
    });

    // Nightfall, first time only.
    T.add({
      kind: 'hour', hour: 19.5, tag: 'world',
      run: () => this.talk.react('nightfall'),
    });
  }

  _fire(t, payload) {
    try { if (t.run) t.run(this, payload); } catch (e) { console.warn('[Story] trigger', e); }
  }

  _titleChoice(pick) {
    if (pick === 'continue') {
      const rpg = this.rpg;
      if (rpg && rpg.loadGame) rpg.loadGame('auto');
      this._resume();
      return;
    }
    this.newGame();
  }

  /** Drop straight into play at whatever chapter the save is on. */
  _resume() {
    this._started = true;
    const n = (this.rpg && this.rpg.chapter) || 1;
    const ch = CHAPTER_BY_N[n] || CHAPTERS[0];
    this.chapterN = ch.n;
    this.chapter = ch;
    for (const c of CHAPTERS) if (c.n <= ch.n && c.scenes && c.scenes.start) this.seen.add(c.scenes.start);
    this._announceChapter(ch, 0.6);
  }

  /* -------------------------------------------------------------- tick -- */

  update(dt, game) {
    // Delayed one-shots. A story is mostly a list of things that should happen
    // slightly after the thing that caused them.
    if (this.queue.length) {
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const q = this.queue[i];
        q.at -= dt;
        if (q.at <= 0) { this.queue.splice(i, 1); try { q.fn(); } catch (e) { console.warn('[Story] queued', e); } }
      }
    }

    this.title.update(dt, game);
    if (this.title.shown) return;

    const cinePlaying = this.cine && this.cine.playing;
    if (!cinePlaying) {
      this.triggers.update(dt, (t, pl) => this._fire(t, pl));
      this.talk.update(dt);
      this._ambient(dt, game);
    }
  }

  /**
   * Ambient conversation, chosen from where the party is and what time it is.
   * The HUD's own fallback banter still runs when the story has nothing to say,
   * so the field frame is never silent.
   */
  _ambient(dt, game) {
    if (this.talk.busy || this.talk.cooldown > 0) return;
    this._banterAt -= dt;
    if (this._banterAt > 0) return;
    this._banterAt = 6;
    const player = game.get('Player');
    if (!player || (player.speed || 0) < 0.8) return;      // they talk while walking

    const rpg = this.rpg;
    const hour = rpg ? rpg.hour : 12;
    const place = this.triggers.place;
    let tag = 'leide';
    if (place === 'hammerhead') tag = 'hammerhead';
    else if (hour >= 20 || hour < 5) tag = 'night';
    else if (hour >= 17.4) tag = 'dusk';
    else if (this._lastTag === 'leide') tag = 'road';
    else if (this._lastTag === 'road') tag = 'quiet';
    this._lastTag = tag;
    this.talk.play(tag);
  }

  lateUpdate(dt, game) {
    // The attract camera has to be the last word on the transform, same as a
    // cutscene: it runs after CameraRig, and after Cinematics has had its say.
    this.title.updateCamera(dt, game);
  }
}

export default StorySystem;

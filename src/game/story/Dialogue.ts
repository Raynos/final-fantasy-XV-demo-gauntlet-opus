/**
 * The party's voices.
 *
 * Cutscene dialogue lives with its timing, inside each scene file. This module
 * holds everything that fires *outside* a cutscene: the ambient banter pools
 * that play while you walk, the reactive one-liners keyed to what just
 * happened, and the small conversation runner that spaces them out so the four
 * of them sound like people travelling together rather than a random line
 * generator.
 *
 * The voices, held to strictly:
 *
 * - **Noctis** — laconic and a little sullen. Short sentences. Deflects
 *   sincerity, and when he does not, it lands. Never explains a joke, never
 *   makes one at length.
 * - **Gladiolus** — blunt, physical, teasing. Talks in verbs. Kind underneath,
 *   but he would rather show it by carrying something.
 * - **Ignis** — precise, dry, formal register. Complete sentences. Understates.
 *   The joke is always in the choice of word, never in the delivery.
 * - **Prompto** — nervous, eager, fills silence. Runs on. Undercuts himself
 *   before anyone else can. The one who says the thing everyone is thinking.
 */

export const SPEAKERS = {
  noctis: 'Noctis',
  gladio: 'Gladiolus',
  ignis: 'Ignis',
  prompto: 'Prompto',
  cindy: 'Cindy',
  cid: 'Cid',
  takka: 'Takka',
  dave: 'Dave',
  cor: 'Cor',
  radio: null,
};

const L = (who: string, line: string) => ({ who: SPEAKERS[who as keyof typeof SPEAKERS] ?? who, line });

/**
 * Ambient exchanges. Each entry is a short back-and-forth; the runner plays it
 * one line at a time so the bubbles stack the way a conversation does.
 * `tag` gates an exchange to a context; `once` retires it after one play.
 */
export const BANTER = [
  {
    tag: 'road', lines: [
      L('prompto', 'Okay but seriously — how far does one country go?'),
      L('ignis', 'Lucis is roughly the size of your attention span. So: quite far.'),
      L('prompto', "That's not a real measurement!"),
    ],
  },
  {
    tag: 'road', lines: [
      L('gladio', "Y'know there's a trick to walking all day."),
      L('noctis', 'Is it "stop walking"?'),
      L('gladio', "It's 'shut up and walk'. Close enough."),
    ],
  },
  {
    tag: 'road', lines: [
      L('ignis', 'Mind the ruts. That axle is held together by optimism.'),
      L('gladio', 'And Cid.'),
      L('ignis', 'Cid is optimism with a wrench.'),
    ],
  },
  {
    tag: 'leide', lines: [
      L('prompto', "It's all... orange. Everything's orange."),
      L('noctis', 'Leide.'),
      L('prompto', 'Right. Thanks. Very informative.'),
    ],
  },
  {
    tag: 'leide', lines: [
      L('ignis', 'Nothing grows here that has not learned to bite.'),
      L('prompto', 'Cool. Cool cool cool.'),
    ],
  },
  {
    tag: 'leide', lines: [
      L('gladio', 'Rock. More rock. Rock with a hat on.'),
      L('noctis', "That's a mesa."),
      L('gladio', "It's a rock with a hat on."),
    ],
  },
  {
    tag: 'dusk', lines: [
      L('prompto', 'Whoa. Hold up — nobody move, the light is doing a thing.'),
      L('gladio', 'The light does that every day.'),
      L('prompto', 'And every day nobody photographs it! Tragedy.'),
    ],
  },
  {
    tag: 'dusk', lines: [
      L('ignis', 'We should find a haven before the light goes.'),
      L('noctis', 'How long have we got?'),
      L('ignis', 'Less than I would like. More than you will hurry for.'),
    ],
  },
  {
    tag: 'night', lines: [
      L('ignis', 'Stay close. The dark out here is not an absence of light.'),
      L('prompto', "...You couldn't have just said 'stay close'?"),
    ],
  },
  {
    tag: 'night', lines: [
      L('gladio', 'Something moved.'),
      L('noctis', 'Where?'),
      L('gladio', 'Everywhere. Keep your voice down.'),
    ],
  },
  {
    tag: 'combat-win', lines: [
      L('prompto', 'Did you see that?! Tell me somebody saw that.'),
      L('gladio', 'I saw you fall over.'),
      L('prompto', 'That was a tactical fall.'),
    ],
  },
  {
    tag: 'combat-win', lines: [
      L('ignis', 'Efficient. Barely.'),
      L('noctis', "I'll take barely."),
    ],
  },
  {
    tag: 'combat-win', lines: [
      L('gladio', "Not bad. You're getting your weight behind it."),
      L('noctis', "Don't."),
      L('gladio', "That's me being nice. Get used to it."),
    ],
  },
  {
    tag: 'combat-start', lines: [
      L('gladio', 'Company!'),
      L('ignis', 'Noct — on your left.'),
    ],
  },
  {
    tag: 'combat-start', lines: [
      L('prompto', "They saw us. They definitely saw us."),
      L('gladio', 'Good. Saves the introductions.'),
    ],
  },
  {
    tag: 'hammerhead', lines: [
      L('prompto', 'Civilisation! Sort of! There is a vending machine!'),
      L('ignis', 'Try not to weep on it.'),
    ],
  },
  {
    tag: 'regalia', lines: [
      L('gladio', 'Careful with her. Cid will know.'),
      L('noctis', 'Cid always knows.'),
    ],
  },
  {
    tag: 'hunt', lines: [
      L('ignis', 'The bounty specified a pack. That is more than a pack.'),
      L('gladio', 'Then we get paid more.'),
      L('ignis', 'That is not how bounties work.'),
    ],
  },
  {
    tag: 'quiet', lines: [
      L('prompto', "You've been quiet."),
      L('noctis', "I'm always quiet."),
      L('prompto', 'Quieter, then.'),
    ],
  },
  {
    tag: 'quiet', lines: [
      L('ignis', 'You should eat something.'),
      L('noctis', "I'm fine."),
      L('ignis', 'That was not a diagnosis. It was an instruction.'),
    ],
  },
];

/** One-shot reactions, keyed by event. Picked round-robin, deterministically. */
export const REACTIONS = {
  'level-up': [
    L('gladio', 'There it is. Felt that one.'),
    L('ignis', 'Marked improvement. Do it again.'),
    L('prompto', 'Look at us! Growing! Emotionally and statistically!'),
  ],
  'low-hp': [
    L('ignis', 'Noct — you are bleeding. Sit down or drink something.'),
    L('gladio', 'Hey. Hey! Get behind me.'),
    L('prompto', "That's a lot of you on the outside!"),
  ],
  'chapter-complete': [
    L('ignis', "That's it done. Onward, then."),
    L('gladio', 'One down.'),
  ],
  'quest-accepted': [
    L('ignis', 'Noted. I will plot us a route.'),
    L('gladio', 'Point me at it.'),
  ],
  'nightfall': [
    L('ignis', 'The sun is going. So should we.'),
    L('prompto', 'Nope. Nope nope. Camp. Camping. Now.'),
  ],
  'rain': [
    L('prompto', 'Of course it rains. Of course it does.'),
    L('gladio', "Builds character."),
    L('ignis', 'It builds mildew.'),
  ],
};

/**
 * Plays banter and reactions into the HUD, spaced so the four never talk over
 * themselves. Fires window `ffxv-banter` events — the HUD's bubble stack is
 * already listening, and it hides itself during cutscenes and title cards.
 */
export class Conversation {
  _n!: number;
  cooldown!: number;
  gap!: number;
  next!: number;
  queue!: any[];
  rest!: number;
  used!: Set<any>;
  constructor() {
    this.queue = [];
    this.next = 0;
    this.cooldown = 0;
    this.gap = 2.4;         // seconds between lines of one exchange
    this.rest = 26;         // seconds between exchanges
    this.used = new Set();
    this._n = 0;
  }

  /**
   * Queue an exchange chosen from `tag`. Deterministic round-robin — a seeded
   * shuffle would still be deterministic, but round-robin also guarantees the
   * player hears everything written before hearing anything twice.
   * @param [force] ignore the rest timer
   */
  play(tag: string, force: boolean = false) {
    if (!force && this.queue.length) return false;
    const pool = BANTER.filter((b) => b.tag === tag);
    if (!pool.length) return false;
    const pick = pool[(this._n++) % pool.length];
    this.queue = pick.lines.slice();
    this.next = 0;
    return true;
  }

  /** Queue a single reaction line for an event key. */
  react(key: string) {
    const pool = REACTIONS[key as keyof typeof REACTIONS];
    if (!pool || !pool.length) return false;
    if (this.queue.length) return false;
    this.queue = [pool[(this._n++) % pool.length]];
    this.next = 0;
    return true;
  }

  /** Anything still to say? */
  get busy() { return this.queue.length > 0; }

  /** @param dt seconds */
  update(dt: number) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (!this.queue.length) return;
    this.next -= dt;
    if (this.next > 0) return;
    const l = this.queue.shift();
    window.dispatchEvent(new CustomEvent('ffxv-banter', { detail: { who: l.who, line: l.line } }));
    this.next = this.gap;
    if (!this.queue.length) this.cooldown = this.rest;
  }
}

export default BANTER;

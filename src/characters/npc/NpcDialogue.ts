import type { Game } from '../../game/Game.ts';
/**
 * What the people of Hammerhead have to say.
 *
 * Each entry is a factory that gets the live `game` and returns a script for
 * `Dialogue`. Building them per conversation rather than once at load is what
 * lets a line read the quest log, the gil count or the clock at the moment it
 * is spoken — Cid knows whether you have already brought him the scrap, Takka
 * knows whether you are carrying a contract, Dave knows whether it is dark.
 *
 * Voice notes, so lines stay in character when they get extended:
 *  - **Cindy** — Georgia drawl, dropped Gs, generous, all business under it.
 *  - **Cid** — clipped, sceptical, never says two words where one will do,
 *    knew Regis and is not impressed by his son yet.
 *  - **Takka** — short flat sentences, feeds people, does not editorialise.
 *  - **Dave** — hunter's shorthand, warm, slightly haunted.
 */

/** Small helpers so the scripts below read like dialogue, not like plumbing. */
const rpgOf = (game: Game) => game.get('RpgSystem') || game.get('Rpg') || null;
const questStatus = (game: Game, id: string) => rpgOf(game)?.quests?.status?.(id) || 'unknown';
const openShop = (game: Game, id: string) => {
  const ix = game.get('Interaction');
  const menus = game.get('Menus');
  if (menus?.screens?.shop?.setShop) menus.screens.shop.setShop(id);
  ix?.openScreen('shop');
};
const openHunts = (game: Game) => game.get('Interaction')?.openScreen('hunts');

/**
 * One row of a `choices` node, as `Dialogue._renderChoices` and
 * `Dialogue._pick` read it.
 *
 * Declared here because `Dialogue.start` still takes an untyped script; when
 * that gains a real `DialogueScript` type this belongs beside it.
 */
export interface DialogueChoice {
  label: string;
  /** node id to jump to when this row is taken. */
  next?: string;
  /**
   * Run on selection. Returning a node id redirects there; returning null
   * falls through to `end` / `next`.
   */
  action?: (game: Game) => string | null;
  /** close the conversation after `action`. */
  end?: boolean;
  /** small right-hand tag on the row — `Shop`, `Hunts`. */
  note?: string;
  /** shown only while this passes. */
  when?: (game: Game) => boolean;
}

/** Shared "anything else?" hub used by most of the named cast. */
function hub(choices: DialogueChoice[]) { return { choices }; }

export const NPC_DIALOGUE = {
  /* ------------------------------------------------------------- Cindy -- */
  cindy: (game: Game) => ({
    speaker: 'Cindy', role: 'Chief Mechanic · Hammerhead', hue: 46, tone: 0.62,
    start: 'hello',
    nodes: {
      hello: {
        lines: () => {
          const night = rpgOf(game)?.isNight;
          return night
            ? ["Y'all are up late. Bay lights are on if you need 'em.",
              "Anythin' movin' out on that highway after dark ain't friendly, so mind how you go."]
            : ["Well hey there, Prince! Y'all look like you been through it.",
              "Whatever it is, me an' Paw-Paw can prob'ly fix it. Prob'ly."];
        },
        next: 'menu',
      },
      menu: hub([
        { label: 'The Regalia', next: 'car' },
        { label: 'Parts and supplies', action: () => { openShop(game, 'garage'); return null; }, end: true, note: 'Shop' },
        { label: 'About Hammerhead', next: 'town' },
        { label: 'About Cid', next: 'cid' },
        { label: 'Nothing right now', next: 'bye' },
      ]),
      car: {
        lines: () => {
          const car = game.get('Regalia');
          const fuel = car && typeof car.fuel === 'number' ? car.fuel : null;
          const out = ['She is a beautiful piece of engineerin\', and y\'all have been drivin\' her like a rental.'];
          if (fuel != null && fuel < 0.3) out.push('And you are runnin\' on fumes. Pump\'s under the canopy — ten gil a fill.');
          else out.push('Tank\'s fine, tyres are fine. Bring her in when somethin\' ain\'t.');
          return out;
        },
        next: 'menu',
      },
      town: {
        lines: [
          "Hammerhead is a gas station, a garage and a diner, and that is the whole of it.",
          "Takka runs the Crow's Nest — best pepper steak in Leide, and he keeps the bounty ledger too.",
          "Anythin' else you need, it is forty klicks up the road at Longwythe.",
        ],
        next: 'menu',
      },
      cid: {
        lines: [
          "Paw-Paw? He built cars for your daddy, back before the Wall.",
          "He'll grouse at you. He grouses at everybody. It ain't personal — well. It's a little personal.",
        ],
        next: 'menu',
      },
      bye: {
        lines: ["Y'all drive safe, now. And come back before dark."],
        next: null,
      },
    },
  }),

  /* --------------------------------------------------------------- Cid -- */
  cid: (game: Game) => {
    const QID = 'side_engine_blade';
    const rpg = rpgOf(game);
    const status = questStatus(game, QID);
    const scrap = rpg?.inventory?.count?.('rusted_bit') ?? 0;
    return {
      speaker: 'Cid', role: 'Sophiar Automotive', hue: 200, tone: 0.34,
      start: status === 'active' ? (scrap >= 3 ? 'deliver' : 'nag') : status === 'complete' ? 'done' : 'hello',
      nodes: {
        hello: {
          lines: [
            "Huh. Regis' boy. Thought you'd be taller.",
            "Well, don't just stand there breathin' my air. You want somethin' or you sightseein'?",
          ],
          next: 'menu',
        },
        menu: hub([
          { label: 'That sword of mine', next: 'blade', when: () => status === 'available' || status === 'locked' },
          { label: 'The road ahead', next: 'road' },
          { label: 'My father', next: 'regis' },
          { label: "I'll leave you to it", next: 'bye' },
        ]),
        blade: {
          lines: () => (status === 'locked'
            ? ["That Engine Blade of yours. Built it out of a Regalia piston, y'know. Bring it back when you've earned somethin' better to say about it."]
            : ["That Engine Blade. Decent steel, lousy edge. I can do somethin' about that.",
              "Bring me three Rusted Bits — scrap iron, the wastes are full of it — and I'll make it worth carryin'."]),
          next: status === 'locked' ? 'menu' : 'blademenu',
        },
        blademenu: hub([
          {
            label: "I'll find the scrap", note: 'Accept',
            action: () => {
              const r = rpg?.quests?.accept?.(QID);
              if (r?.ok) { rpg?.quests?.track?.(QID); return 'accepted'; }
              return 'refused';
            },
          },
          { label: 'Later', next: 'menu' },
        ]),
        accepted: {
          lines: ['"A Better Engine Blade." Three Rusted Bits. Don\'t make a project of it.'],
          next: null,
        },
        refused: { lines: ['Suit yourself.'], next: null },
        nag: {
          lines: () => [`Three Rusted Bits. You have got ${scrap}. I can count, boy.`],
          next: null,
        },
        deliver: {
          lines: ['That the scrap? Give it here before you lose it.'],
          next: 'delivermenu',
        },
        delivermenu: hub([
          {
            label: 'Hand over the Rusted Bits', note: '×3',
            action: () => {
              rpg?.inventory?.remove?.('rusted_bit', 3);
              rpg?.quests?.notify?.('fetch', { target: 'rusted_bit', count: 3 });
              rpg?.quests?.notify?.('talk', { target: 'cid' });
              return 'upgraded';
            },
          },
          { label: 'Not yet', end: true },
        ]),
        upgraded: {
          lines: [
            'Give me a night with it. Come back and it will cut somethin\' worth cuttin\'.',
            '...And tell Cindy to eat somethin\'. She lives on coffee and spite.',
          ],
          next: null,
        },
        done: {
          lines: ['Blade holdin\' up? Good. Don\'t bring it back chipped.'],
          next: 'menu',
        },
        road: {
          lines: [
            'North is Longwythe and the peak. South is Galdin and a ferry you can\'t afford.',
            'Everythin\' between is rock, dust and things that eat hunters. Sleep indoors.',
          ],
          next: 'menu',
        },
        regis: {
          lines: [
            'Regis and me drove that car from Insomnia to Accordo and back, forty years ago.',
            'He was a better man than a king, and it cost him. Mind you don\'t make the same trade.',
          ],
          next: 'menu',
        },
        bye: { lines: ['Mm.'], next: null },
      },
    };
  },

  /* ------------------------------------------------------------- Takka -- */
  takka: (game: Game) => {
    const rpg = rpgOf(game);
    return {
      speaker: 'Takka', role: "The Crow's Nest · Tipster", hue: 22, tone: 0.4,
      start: 'hello',
      nodes: {
        hello: {
          lines: () => {
            const h = rpg?.hour ?? 12;
            if (h < 10) return ['Grill\'s been on an hour. Coffee\'s fresh. Sit anywhere.'];
            if (h > 20) return ['Kitchen closes at midnight. Board stays up all night.'];
            return ['Four of you. Big lunch, then.', 'Board\'s on the wall outside if you\'re workin\'.'];
          },
          next: 'menu',
        },
        menu: hub([
          { label: 'Something to eat', note: 'Shop', action: () => { openShop(game, 'crowsnest'); return null; }, end: true },
          { label: 'Any work going?', next: 'work' },
          { label: 'About the ledger', next: 'ledger' },
          { label: 'Thanks', next: 'bye' },
        ]),
        work: {
          lines: () => {
            const active = rpg?.quests?.active?.filter?.((q) => q?.type === 'hunt') || [];
            return active.length
              ? [`You\'re already carryin\' ${active.length === 1 ? 'a contract' : `${active.length} contracts`}. Finish one, I\'ll pay you for it.`,
                'Board\'s outside if you want to look again.']
              : ['Always. Board\'s on the wall by the door.',
                'Take somethin\' your size. Dead hunters don\'t collect.'];
          },
          next: 'workmenu',
        },
        workmenu: hub([
          { label: 'Read the board', note: 'Hunts', action: () => { openHunts(game); return null; }, end: true },
          { label: 'Maybe later', next: 'menu' },
        ]),
        ledger: {
          lines: [
            'Every tipster keeps one. Mine\'s the Leide book — everythin\' between here and Longwythe.',
            'Duscae\'s book is Old Lestif\'s, at the Prairie Outpost. Meldacio keeps the master tome.',
            'You bring me a mark, I stamp it, you get paid and the ladder moves. That\'s the whole business.',
          ],
          next: 'menu',
        },
        bye: { lines: ['Mm. Eat somethin\'.'], next: null },
      },
    };
  },

  /* -------------------------------------------------------------- Dave -- */
  dave: (game: Game) => {
    const QID = 'side_dog_tags';
    const rpg = rpgOf(game);
    const status = questStatus(game, QID);
    return {
      speaker: 'Dave', role: 'Hunter', hue: 96, tone: 0.46,
      start: 'hello',
      nodes: {
        hello: {
          lines: () => (rpg?.isNight
            ? ['Wouldn\'t be out here after sundown if I were you. Wouldn\'t be out here myself, but here we are.']
            : ['Hey. You\'re the ones with the black car.', 'Word travels. There\'s four people in Leide and three of \'em talk.']),
          next: 'menu',
        },
        menu: hub([
          { label: 'You look like you need something', next: 'tags', when: () => status === 'available' },
          { label: 'About that dog tag', next: 'tagnag', when: () => status === 'active' },
          { label: 'Hunting advice', next: 'advice' },
          { label: 'What\'s out there?', next: 'beasts' },
          { label: 'See you around', next: 'bye' },
        ]),
        tags: {
          lines: [
            'I do, as it happens. Friend of mine went out past the Prairie eight days ago and didn\'t come back.',
            'I\'m not asking anyone to bring him back. Just his tag. Hunters get a name on a wall, if somebody carries it home.',
          ],
          next: 'tagmenu',
        },
        tagmenu: hub([
          {
            label: 'I\'ll bring it back', note: 'Accept',
            action: () => {
              const r = rpg?.quests?.accept?.(QID);
              if (r?.ok) { rpg?.quests?.track?.(QID); return 'tagaccept'; }
              return 'tagno';
            },
          },
          { label: 'Not my business', next: 'menu' },
        ]),
        tagaccept: {
          lines: ['Ravine east of Longwythe. Look for the vehicle. ...Thanks. Genuinely.'],
          next: null,
        },
        tagno: { lines: ['No. I suppose it isn\'t.'], next: null },
        tagnag: {
          lines: ['Ravine east of Longwythe. Take a light. And take the daytime, if you can pick.'],
          next: 'menu',
        },
        advice: {
          lines: [
            'Three rules. Don\'t fight what you can\'t outrun. Don\'t fight at night. Don\'t fight hungry.',
            'The fourth rule is that everybody breaks the first three, so carry a Phoenix Down.',
          ],
          next: 'menu',
        },
        beasts: {
          lines: [
            'Sabertusks run in packs, so if you see one you\'ve already seen four.',
            'Dualhorns won\'t start it but they will finish it. Give them the field.',
            'And when the sun goes down, whatever comes up out of the ground is not an animal. Don\'t treat it like one.',
          ],
          next: 'menu',
        },
        bye: { lines: ['Keep your head down.'], next: null },
      },
    };
  },

  /* ------------------------------------------------------ ambient folk -- */
  trucker: () => ({
    speaker: 'Haulier', role: 'Passing through', hue: 20, tone: 0.4,
    start: 'a',
    nodes: {
      a: {
        lines: [
          'Twelve hours from Galdin and the last four of \'em were washboard.',
          'They keep sayin\' they\'ll seal that stretch. They been sayin\' it since I had hair.',
        ],
        next: null,
      },
    },
  }),

  mechanic: () => ({
    speaker: 'Garage Hand', role: 'Sophiar Automotive', hue: 210, tone: 0.4,
    start: 'a',
    nodes: {
      a: {
        lines: () => {
          const pick = Math.floor((Date.now() / 60000) % 3);
          return [[
            'Miss Cindy can hear a bad bearing from across the lot. I\'ve seen her do it.',
            'Don\'t touch the blue car. I mean it. Don\'t.',
            'You want the pump, it\'s under the canopy. You want the old man, good luck.',
          ][pick]];
        },
        next: null,
      },
    },
  }),

  traveller: () => ({
    speaker: 'Traveller', role: 'Waiting on a lift', hue: 260, tone: 0.5,
    start: 'a',
    nodes: {
      a: {
        lines: [
          'I\'ve been waiting on the Lestallum bus for two days. It may not be coming.',
          'Still. The coffee here is good and nobody has tried to eat me. Low bar, met.',
        ],
        next: null,
      },
    },
  }),

  kid: () => ({
    speaker: 'Kid', role: 'Local', hue: 150, tone: 0.6,
    start: 'a',
    nodes: {
      a: {
        lines: [
          'Is that YOUR car? That\'s the king\'s car. That\'s a KING car.',
          'Cindy says if I touch it she\'ll sell me to the chocobos.',
        ],
        next: null,
      },
    },
  }),
};

export default NPC_DIALOGUE;

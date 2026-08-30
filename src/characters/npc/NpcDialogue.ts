import type { Game } from '../../game/Game.ts';
import type { DialogueChoice, DialogueNode } from '../../game/interaction/Dialogue.ts';
/**
 * What the people of Lucis have to say.
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

/** Shared "anything else?" hub used by most of the named cast. */
function hub(choices: DialogueChoice[]): DialogueNode { return { choices }; }

/**
 * Take a quest from the person standing in front of you, and count the taking.
 *
 * Several quests open with "talk to X" and are *given by* X — `side_chocobo`,
 * `side_power_play` and `main_ch3_deadeye` all do. The generic `notify('talk')`
 * in `Npcs._registerTalkFor` fires when the conversation opens, which is before
 * the player has said yes, and by then the quest is still `available`, so the
 * notify lands nowhere and the objective needs a *second* conversation to tick.
 * Accepting and notifying together is what Cid's hand-over already does, and it
 * is the difference between one conversation and two identical ones.
 *
 * @param who the cast key, which is what the `talk` objectives name
 * @returns the node to go to: `okNode` if it was taken, `noNode` if not
 */
function takeQuest(game: Game, id: string, who: string, okNode: string, noNode: string) {
  const rpg = rpgOf(game);
  const r = rpg?.quests?.accept?.(id);
  if (!r?.ok) return noNode;
  rpg?.quests?.track?.(id);
  rpg?.quests?.notify?.('talk', { target: who });
  return okNode;
}

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
          // Chapter 3's second half. `StorySystem` accepts it as the chapter
          // line advances, so by the time the player is standing here it is
          // usually already active and this is the briefing, not the offer.
          { label: 'Deadeye', next: 'deadeye', when: () => ['available', 'active'].includes(questStatus(game, 'main_ch3_deadeye')) },
          { label: 'You look like you need something', next: 'tags', when: () => status === 'available' },
          { label: 'About that dog tag', next: 'tagnag', when: () => status === 'active' },
          { label: 'Hunting advice', next: 'advice' },
          { label: 'What\'s out there?', next: 'beasts' },
          { label: 'See you around', next: 'bye' },
        ]),
        deadeye: {
          lines: [
            'Behemoth. Big one. Lost an eye to a hunter thirty years back and has been collecting ours ever since.',
            'It ranges the Nebulawood. You will know the trail — nothing else out there leaves a footprint you can lie down in.',
          ],
          next: 'deadeyemenu',
        },
        deadeyemenu: hub([
          {
            label: 'We will take it', note: 'Accept',
            when: () => questStatus(game, 'main_ch3_deadeye') === 'available',
            action: () => takeQuest(game, 'main_ch3_deadeye', 'dave', 'deadeyeyes', 'deadeyeno'),
          },
          {
            label: 'We are already on it',
            when: () => questStatus(game, 'main_ch3_deadeye') === 'active',
            action: () => { rpg?.quests?.notify?.('talk', { target: 'dave' }); return 'deadeyeyes'; },
          },
          { label: 'Not today', next: 'menu' },
        ]),
        deadeyeyes: {
          lines: ['Follow the trail in from the Nebulawood road. And do not let it get behind you.'],
          next: null,
        },
        deadeyeno: { lines: ['Then it keeps eating hunters. Your call.'], next: null },
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

  /* --------------------------------------------------------------- Dino -- */
  /*
   * The five below live outside Hammerhead and every one of them exists because
   * a quest objective names them. Voice notes, same as above:
   *  - **Dino** — Accordo, fast, transactional, calls everyone "kid".
   *  - **Iris** — bright, unguarded, says the true thing a beat too early.
   *  - **Wiz** — slow, gentle, talks about birds the way other men talk about
   *    children.
   *  - **Holly** — precise, tired, has already worked out what you are going to
   *    ask and has the answer ready.
   *  - **Randolph** — enormous, courteous, entirely uninterested in urgency.
   */
  dino: (game: Game) => {
    const rpg = rpgOf(game);
    return {
      speaker: 'Dino', role: 'Galdin Quay', hue: 310, tone: 0.58,
      start: 'hello',
      nodes: {
        hello: {
          lines: () => (questStatus(game, 'main_ch2_galdin') === 'complete'
            ? ['Back again. The ferry is still not running, kid, and I am still not sorry about it.']
            : ['Hey — hey. You are the four from the black car. News travels down the coast faster than you drive.',
              'Dino Ghiranze. I write a column nobody reads and cut stones nobody can afford.']),
          next: 'menu',
        },
        menu: hub([
          { label: 'The bench', note: 'Shop', action: () => { openShop(game, 'dinos_bench'); return null; }, end: true },
          { label: 'Take our picture', next: 'postcards', when: () => questStatus(game, 'city_gald_postcards') === 'available' },
          { label: 'About the postcards', next: 'postnag', when: () => questStatus(game, 'city_gald_postcards') === 'active' },
          { label: 'The ferry to Altissia', next: 'ferry' },
          { label: 'Somewhere to sleep', next: 'lodging' },
          { label: 'What do you do here?', next: 'stones' },
          { label: 'We should go', next: 'bye' },
        ]),
        postcards: {
          lines: [
            'Other way round, kid. I need pictures, you have the blond with the camera.',
            'Three frames. The causeway, the rock off the point, and something on the water at the right hour. My column runs Thursday and I have four column inches of nothing.',
          ],
          next: 'postmenu',
        },
        postmenu: hub([
          {
            label: 'Prompto will love this', note: 'Accept',
            action: () => takeQuest(game, 'city_gald_postcards', 'dino', 'postyes', 'postno'),
          },
          { label: 'Write it yourself', next: 'menu' },
        ]),
        postyes: { lines: ['Dusk, if you can. Everything here photographs like a postcard at dusk and like a car park at noon.'], next: null },
        postno: { lines: ['Fine. I will describe it. Badly.'], next: null },
        postnag: {
          lines: ['Still four inches of nothing. Dusk, from the boards — press C and point it at the water.'],
          next: 'menu',
        },
        ferry: {
          lines: [
            'Sailing is suspended. Has been since this morning, and nobody at the desk will tell you why.',
            'My advice? Take the room, eat the fish, and see what the morning says. It usually says something.',
          ],
          next: 'menu',
        },
        lodging: {
          lines: [
            'Mother of Pearl, end of the boardwalk. Not cheap. Worth it.',
            'Coctura runs the kitchen and the bounty ledger both, which tells you how busy the coast is.',
          ],
          next: 'menu',
        },
        stones: {
          lines: [
            'Gemstones, kid. People bring me rocks, I make them into something a lady will wear.',
            'You find anything that catches the light out there, you bring it to me first. I pay better than I look.',
          ],
          next: 'menu',
        },
        bye: {
          lines: () => (rpg?.isNight
            ? ['Sleep on it. Whole coast looks better at breakfast.']
            : ['Go on. And if the ferry moves I will find you before you find me.']),
          next: null,
        },
      },
    };
  },

  /* --------------------------------------------------------------- Iris -- */
  iris: (game: Game) => ({
    speaker: 'Iris', role: 'Lestallum', hue: 348, tone: 0.72,
    start: 'hello',
    nodes: {
      hello: {
        lines: () => (questStatus(game, 'main_ch4_lestallum') === 'complete'
          ? ['Still here! Somebody has to show you around and Gladio is not going to do it.']
          : ['Noct! You are — okay. You are actually okay.',
            'Sorry. Sorry. I had a whole speech and I have forgotten all of it.']),
        next: 'menu',
      },
      menu: hub([
        { label: 'Show us the city', next: 'tour', when: () => questStatus(game, 'city_lest_arrival') === 'available' },
        { label: 'About the tour', next: 'tournag', when: () => questStatus(game, 'city_lest_arrival') === 'active' },
        { label: 'Lestallum', next: 'town' },
        { label: 'The Meteor', next: 'meteor' },
        { label: 'Your brother', next: 'gladio' },
        { label: 'Later, Iris', next: 'bye' },
      ]),
      tour: {
        lines: [
          'Okay — okay, this is the good bit. Market first, because Verdough will be insufferable if we go anywhere else first.',
          'Then the lookout, and you have to let Prompto take the picture or he will sulk for a day. Then coffee at the Beanmine, and then I will stop.',
        ],
        next: 'tourmenu',
      },
      tourmenu: hub([
        {
          label: 'Lead the way', note: 'Accept',
          action: () => takeQuest(game, 'city_lest_arrival', 'iris', 'touryes', 'tourno'),
        },
        { label: 'Maybe in a minute', next: 'menu' },
      ]),
      touryes: { lines: ['Market, lookout, Beanmine. Try to look like tourists. You are all extremely bad at it.'], next: null },
      tourno: { lines: ['Sure. No. It is fine. It has only been a year.'], next: null },
      tournag: {
        lines: ['Market, then the lookout with the camera, then the Beanmine. In that order, it is a whole thing.'],
        next: 'menu',
      },
      town: {
        lines: [
          'The whole city runs off the Meteor. That is not a metaphor — EXINERIS taps the heat straight out of it.',
          'Which means the lights never go out, which means nothing comes up out of the ground here. Best night\'s sleep in Lucis.',
        ],
        next: 'menu',
      },
      meteor: {
        lines: [
          'You can see it from the lookout on the east side. Go at dusk. Take Prompto — he will want the shot.',
          'It has been falling for two thousand years and it has never landed. Nobody can explain that to me properly.',
        ],
        next: 'menu',
      },
      gladio: {
        lines: [
          'He is fine. He is always fine. He would say "fine" with a broken arm and mean it.',
          'Just... keep him talking, would you? He goes quiet and then he goes off on his own.',
        ],
        next: 'menu',
      },
      bye: { lines: ['Go on. And eat something that is not a Cup Noodle.'], next: null },
    },
  }),

  /* ---------------------------------------------------------------- Wiz -- */
  wiz: (game: Game) => {
    const QID = 'side_chocobo';
    const status = questStatus(game, QID);
    return {
      speaker: 'Wiz', role: 'Wiz Chocobo Post', hue: 40, tone: 0.44,
      start: status === 'complete' ? 'done' : 'hello',
      nodes: {
        hello: {
          lines: [
            'Afternoon. Mind the fence — they lean on it and it leans back.',
            'Wiz Forlane. Sixty birds, and every one of them thinks it is the fastest.',
          ],
          next: 'menu',
        },
        menu: hub([
          { label: 'About the birds', next: 'birds', when: () => status !== 'available' },
          { label: 'You are short of chocobos', next: 'offer', when: () => status === 'available' },
          { label: 'About the stray', next: 'nag', when: () => status === 'active' },
          { label: 'Deadeye', next: 'deadeye' },
          { label: 'Good day to you', next: 'bye' },
        ]),
        offer: {
          lines: [
            'Half my stock will not come in. They can smell that behemoth from four miles off and they are not wrong to.',
            'One of them is holed up out at the paddocks and will not be moved by anybody it does not know. Which, oddly, might be you.',
          ],
          next: 'offermenu',
        },
        offermenu: hub([
          {
            label: 'We will bring it in', note: 'Accept',
            action: () => takeQuest(game, QID, 'wiz', 'accepted', 'refused'),
          },
          { label: 'We have somewhere to be', next: 'menu' },
        ]),
        accepted: {
          lines: ['Paddocks are the far side of the ridge. Walk in slow and let it decide about you.'],
          next: null,
        },
        refused: { lines: ['No harm. She will come home or she will not.'], next: null },
        nag: {
          lines: ['Still out at the paddocks. Take your time — a hurried man reads as a predator to a chocobo.'],
          next: 'menu',
        },
        done: {
          lines: [
            'She walked in behind you like she had never left. Whole yard settled after that.',
            'Whistle is yours. Any post in Lucis, you blow it and something comes.',
          ],
          next: 'menu',
        },
        birds: {
          lines: [
            'A chocobo will carry you further than a car and it will not run out of anything.',
            'It will also go exactly where it likes if it decides you are not paying attention. That is the trade.',
          ],
          next: 'menu',
        },
        deadeye: {
          lines: () => (questStatus(game, 'main_ch3_deadeye') === 'complete'
            ? ['Heard. Birds heard first, mind — they were back on the north pasture before the news was.']
            : ['Behemoth. Blind on the left. It does not hunt the birds, it just walks through them, and that is worse.',
              'Dave at Longwythe has the contract if you have the arms for it.']),
          next: 'menu',
        },
        bye: { lines: ['Mind the fence.'], next: null },
      },
    };
  },

  /* -------------------------------------------------------------- Holly -- */
  holly: (game: Game) => {
    const QID = 'side_power_play';
    const status = questStatus(game, QID);
    return {
      speaker: 'Holly', role: 'EXINERIS Power Plant', hue: 172, tone: 0.38,
      start: status === 'complete' ? 'done' : 'hello',
      nodes: {
        hello: {
          lines: [
            'You are not contractors and you are not press, so you are the other thing. Good.',
            'Holly Teulle. I run the plant, which currently means I run a list of things that are wrong with it.',
          ],
          next: 'menu',
        },
        menu: hub([
          { label: 'What is wrong with it?', next: 'offer', when: () => status === 'available' },
          { label: 'About the substation', next: 'nag', when: () => status === 'active' },
          { label: 'The city lights are going out', next: 'lights', when: () => questStatus(game, 'city_lest_lights') === 'available' },
          { label: 'About the outage', next: 'lightsnag', when: () => questStatus(game, 'city_lest_lights') === 'active' },
          { label: 'How the plant works', next: 'plant' },
          { label: 'We will leave you to it', next: 'bye' },
        ]),
        lights: {
          lines: [
            'The market strings dropped out twice last night. In this city that is not an inconvenience, it is a body count.',
            'There is a relay station three hundred metres out on the shelf that has stopped answering, and the last two people I sent up there did not come back down.',
          ],
          next: 'lightsmenu',
        },
        lightsmenu: hub([
          {
            label: 'We will go up there', note: 'Accept',
            action: () => takeQuest(game, 'city_lest_lights', 'holly', 'lightsyes', 'lightsno'),
          },
          { label: 'That is a plant problem', next: 'menu' },
        ]),
        lightsyes: { lines: ['Substation is on the shelf edge, north-west. Whatever is in it, I want the relay back and I want it working.'], next: null },
        lightsno: { lines: ['Then I send a third person. Sleep well.'], next: null },
        lightsnag: {
          lines: ['Still dark. North-west on the shelf — you will see the pylons before you see the building.'],
          next: 'menu',
        },
        offer: {
          lines: [
            'Pressure on the number-four line has dropped eleven per cent in two days. Nothing is broken. I have checked twice.',
            'Which leaves somebody standing where they should not be. There are imperial units in the substation and nobody will say so out loud.',
          ],
          next: 'offermenu',
        },
        offermenu: hub([
          {
            label: 'We will clear them out', note: 'Accept',
            action: () => takeQuest(game, QID, 'holly', 'accepted', 'refused'),
          },
          { label: 'Not our fight', next: 'menu' },
        ]),
        accepted: {
          lines: ['Substation is downhill, east of the stacks. Bring me whatever they left behind — I want it on my desk, not in a report.'],
          next: null,
        },
        refused: { lines: ['Then I will keep pretending it is a valve.'], next: null },
        nag: {
          lines: ['Twelve of them, near as I can count from the pressure. And I want that relay unit.'],
          next: 'menu',
        },
        done: {
          lines: ['Pressure came back inside the hour. Whatever that relay was doing, it was doing it deliberately.'],
          next: 'menu',
        },
        plant: {
          lines: [
            'We do not burn anything. The Meteor puts out more heat than this city could spend in a thousand years and we take the edge off it.',
            'Every light between here and Cape Caem is on because forty women keep this floor running. Remember that when you are complimenting the view.',
          ],
          next: 'menu',
        },
        bye: { lines: ['Mind the yellow line on your way out.'], next: null },
      },
    };
  },

  /* ----------------------------------------------------------- Randolph -- */
  randolph: (game: Game) => {
    const QID = 'side_gemstone_run';
    const rpg = rpgOf(game);
    const status = questStatus(game, QID);
    const gems = rpg?.inventory?.count?.('sky_gemstone') ?? 0;
    return {
      speaker: 'Randolph', role: 'Lestallum Weaponsmith', hue: 14, tone: 0.3,
      start: status === 'active' && gems >= 2 ? 'deliver' : status === 'complete' ? 'done' : 'hello',
      nodes: {
        hello: {
          lines: [
            'Mind the anvil. It is hotter than it looks and it looks hot.',
            'Randolph. I make things that cut. Slowly, and properly.',
          ],
          next: 'menu',
        },
        menu: hub([
          // The rack is new: Randolph has moved off the Lestallum car park and
          // onto his own forge on the market square, and `TOWN_SHOPS.forge` is
          // the top half of the weapon catalogue Culless no longer carries.
          { label: 'Show me the rack', note: 'Shop', action: () => { openShop(game, 'forge'); return null; }, end: true },
          { label: 'You are working on something', next: 'offer', when: () => status === 'available' },
          { label: 'About those gemstones', next: 'nag', when: () => status === 'active' },
          { label: 'About the work', next: 'craft' },
          { label: 'We will let you work', next: 'bye' },
        ]),
        offer: {
          lines: [
            'A pair of kukris, and the commission says sky gemstone in the pommels. Sky gemstone comes off things that fly.',
            'I am four hundred pounds of blacksmith. Things that fly do not concern themselves with me.',
          ],
          next: 'offermenu',
        },
        offermenu: hub([
          {
            label: 'We will find you two', note: 'Accept',
            action: () => takeQuest(game, QID, 'randolph', 'accepted', 'refused'),
          },
          { label: 'Find another courier', next: 'menu' },
        ]),
        accepted: {
          lines: ['Two. No hurry — the commission has waited a year, it will wait a week.'],
          next: null,
        },
        refused: { lines: ['Mm. Fair.'], next: null },
        nag: {
          lines: () => [`Two sky gemstones. You are carrying ${gems}. Take your time.`],
          next: 'menu',
        },
        deliver: {
          lines: ['Ah. Let me see them.'],
          next: 'delivermenu',
        },
        delivermenu: hub([
          {
            label: 'Hand over the sky gemstones', note: '×2',
            action: () => {
              rpg?.inventory?.remove?.('sky_gemstone', 2);
              rpg?.quests?.notify?.('fetch', { target: 'sky_gemstone', count: 2 });
              rpg?.quests?.notify?.('talk', { target: 'randolph' });
              return 'delivered';
            },
          },
          { label: 'Not yet', end: true },
        ]),
        delivered: {
          lines: [
            'Good colour. Good weight. That is a year of somebody\'s patience closed off.',
            'Take the kukris. I had a spare pair and you have earned the walk.',
          ],
          next: null,
        },
        done: {
          lines: ['Blades holding? Keep the edge off the stone and they will outlive you.'],
          next: 'menu',
        },
        craft: {
          lines: [
            'Everything worth carrying was made by somebody who was not in a hurry.',
            'That is the whole of the trade. The rest is just heat.',
          ],
          next: 'menu',
        },
        bye: { lines: ['Mm.'], next: null },
      },
    };
  },

  /* ------------------------------------------------------ ambient folk -- */
  /* ------------------------------------------------- the two cities -- */
  /*
   * Sania and Navyth are the two names the quest table has been carrying with
   * nobody attached to them: `side_scraps` is *given by Sania* and
   * `side_legendary_fish` *by Navyth*, and both were handed out by nobody and
   * turned in to nobody. These scripts are where those two quests finally have
   * a mouth, and where the three counters on each square get a person behind
   * them instead of a floating prompt.
   */
  sania: (game: Game) => {
    const SCRAPS = 'side_scraps';
    const MARKET = 'city_lest_market';
    const scraps = questStatus(game, SCRAPS);
    const market = questStatus(game, MARKET);
    const rpg = rpgOf(game);
    const books = () => rpg?.inventory?.count?.('old_book') ?? 0;
    return {
      speaker: 'Sania', role: 'Biologist · Lestallum', hue: 128, tone: 0.52,
      start: 'hello',
      nodes: {
        hello: {
          lines: [
            'She is holding a jar up to the light with something small and unhappy in it, and does not lower it to talk.',
            '"Sania Yeagre. Do not apologise, everybody interrupts. What do you know about frogs?"',
          ],
          next: 'menu',
        },
        menu: hub([
          { label: 'Frogs?', next: 'frogs' },
          { label: 'You are collecting something', next: 'offer', when: () => scraps === 'available' },
          { label: 'About the map scraps', next: 'scrapnag', when: () => scraps === 'active' && books() < 5 },
          { label: 'We have all five scraps', next: 'scrapdone', when: () => scraps === 'active' && books() >= 5 },
          { label: 'The market wants something', next: 'marketoffer', when: () => market === 'available' },
          { label: 'About the Meteor', next: 'meteor' },
          { label: 'We should go', next: 'bye' },
        ]),
        frogs: {
          lines: [
            '"Myrlwood frogs. Six of them, one in each region, and every single one is somewhere with a daemon problem."',
            '"I am a field biologist with a laboratory the size of a wardrobe and a grant that ran out in the spring. I ask people."',
          ],
          next: 'menu',
        },
        offer: {
          lines: [
            '"Not frogs. Paper. Somebody in the last century tore a survey map into five and posted it to five different people, which was either very clever or the worst filing in Lucis."',
            '"Old books turn up with the scraps still in them. Collectors here pay for the books and throw the paper away, which is criminal."',
          ],
          next: 'offermenu',
        },
        offermenu: hub([
          {
            label: 'We will keep an eye out', note: 'Accept',
            action: () => takeQuest(game, SCRAPS, 'sania', 'scrapyes', 'scrapno'),
          },
          { label: 'Not our sort of errand', next: 'menu' },
        ]),
        scrapyes: {
          lines: ['"Five. Any old book you find, check the endpapers before you sell it. Especially to Verdough."'], next: null,
        },
        scrapno: { lines: ['"Mm. Everyone says that until they find one."'], next: null },
        scrapnag: {
          lines: () => [`"${books()} of five. Keep looking — they turn up in the places nobody has cleared out yet."`],
          next: 'menu',
        },
        scrapdone: {
          lines: [
            '"All five. Give me the table." She lays them out and they do not match, and then they do.',
            '"That is a survey marker nobody has walked to since the Fall. I am not going. You, however, look like people who go places."',
          ],
          next: null,
        },
        marketoffer: {
          lines: [
            '"While you are here. I need three things off this market and every one of them is behind a person who wants to talk to me for an hour."',
            '"Ulwaat berries, a sky gemstone and something from Surgate that is not coffee. Buy them, bring them, and I will tell you where the Cleigne frog is."',
          ],
          next: 'marketmenu',
        },
        marketmenu: hub([
          {
            label: 'We will do the shopping', note: 'Accept',
            action: () => takeQuest(game, MARKET, 'sania', 'marketyes', 'marketno'),
          },
          { label: 'Ask somebody else', next: 'menu' },
        ]),
        marketyes: { lines: ['"Partellum for the berries and the stone. The Beanmine for the third. Do not let Verdough see you are in a hurry."'], next: null },
        marketno: { lines: ['"Fine. I will send the intern. I do not have an intern."'], next: null },
        meteor: {
          lines: [
            '"It has been sitting on the Disc for a very long time and the whole of this city is plugged into the heat coming off it."',
            '"Nobody has ever explained to me what happens when it cools. I have stopped asking, because of the faces people make."',
          ],
          next: 'menu',
        },
        bye: { lines: ['"Take a jar. Everyone should carry a jar."'], next: null },
      },
    };
  },

  /* ----------------------------------------------------------- Verdough -- */
  verdough: (game: Game) => ({
    speaker: 'Verdough', role: 'Grocer · Partellum Market', hue: 92, tone: 0.5,
    start: 'hello',
    nodes: {
      hello: {
        lines: [
          'A trestle four metres long under a red awning, stacked in a way that suggests a man who has thought about it.',
          '"Morning. Everything on this table came up the shelf road before dawn and none of it will be here tomorrow."',
        ],
        next: 'menu',
      },
      menu: hub([
        { label: 'Show me the table', note: 'Shop', action: () => { openShop(game, 'partellum'); return null; }, end: true },
        { label: 'About the stones', next: 'stones' },
        { label: 'About the city', next: 'city' },
        { label: 'Later', next: 'bye' },
      ]),
      stones: {
        lines: [
          '"Sky and earth, both. Come out of the Disc and the quarries under it, and every elemancer between here and Altissia wants one."',
          '"Randolph over there will tell you they belong in a hilt. Randolph is wrong about most things that are not steel."',
        ],
        next: 'menu',
      },
      city: {
        lines: [
          '"Nobody in Lestallum owns a generator. Whole city runs off the Meteor and has done since before my mother."',
          '"The women run the plant, the men run the market, and everybody complains about the heat. That is the whole place."',
        ],
        next: 'menu',
      },
      bye: { lines: ['"Before Thursday, mind. It does not keep."'], next: null },
    },
  }),

  /* ------------------------------------------------------------ Surgate -- */
  surgate: (game: Game) => ({
    speaker: 'Surgate', role: "Proprietor · Surgate's Beanmine", hue: 28, tone: 0.42,
    start: 'hello',
    nodes: {
      hello: {
        lines: [
          '"Sit or do not, but do not stand in the doorway. Board is on the wall and Tony is the one who talks about it."',
          'Behind her the machine makes a noise like a small industrial accident and produces, eventually, coffee.',
        ],
        next: 'menu',
      },
      menu: hub([
        { label: 'The counter', note: 'Shop', action: () => { openShop(game, 'beanmine'); return null; }, end: true },
        { label: 'The board', next: 'board' },
        { label: 'About Tony', next: 'tony' },
        { label: 'Thanks', next: 'bye' },
      ]),
      board: {
        lines: [
          '"Duscae ledger. Everything from the Disc down to the slough, and half of it has been up there since spring."',
          '"You want it, take it. I only serve the coffee the hunters do not pay for."',
        ],
        next: 'menu',
      },
      tony: {
        lines: [
          '"Tipster. Sits in that corner, knows what is where, has never once bought anything."',
          '"Every hunt in the region goes through my wall and not one gil of it goes through my till. I have made my peace."',
        ],
        next: 'menu',
      },
      bye: { lines: ['"Mind, it is hot. Everything here is hot."'], next: null },
    },
  }),

  /* ------------------------------------------------------------ Coctura -- */
  coctura: (game: Game) => {
    const QID = 'city_gald_catch';
    const status = questStatus(game, QID);
    const rpg = rpgOf(game);
    /** Everything in the bag the sea gave you. */
    const catchList = () => {
      const items = rpg?.tables?.items;
      const bag = rpg?.inventory?.bag || {};
      const out: { id: string, n: number, gil: number }[] = [];
      for (const id of Object.keys(bag)) {
        const d = items?.[id];
        if (!d || !d.tags?.includes('fish') || !bag[id]) continue;
        out.push({ id, n: bag[id], gil: Math.round((rpg?.inventory?.sellPrice?.(id) ?? 0) * 1.4) });
      }
      return out;
    };
    const catchWorth = () => catchList().reduce((a, c) => a + c.gil * c.n, 0);
    /**
     * Sell the whole catch at 1.4x.
     *
     * The premium is HERE and not on the shop row on purpose:
     * `Inventory.sellPrice` is global and `ShopScreen` has no per-shop hook, so
     * a `sellMult` on `TOWN_SHOPS.pearl` would be a field nothing reads. This
     * sells at the normal rate through the normal path and pays the 40% on top
     * as a separate credit, so the ledger and the events stay correct.
     */
    const sellCatch = () => {
      const inv = rpg?.inventory;
      if (!inv) return 'nocatch';
      let extra = 0, sold = 0;
      for (const c of catchList()) {
        const base = inv.sellPrice(c.id) * c.n;
        const r = inv.sell(c.id, c.n);
        if (!r?.ok) continue;
        extra += Math.round(base * 0.4);
        sold += c.n;
      }
      if (!sold) return 'nocatch';
      inv.addGil(extra, 'coctura-premium');
      rpg?.quests?.notify?.('fetch', { target: 'sea_bass', count: 0 });
      return 'sold';
    };
    return {
      speaker: 'Coctura', role: 'Chef · Mother of Pearl', hue: 186, tone: 0.5,
      start: 'hello',
      nodes: {
        hello: {
          lines: [
            '"Sit anywhere. If it came out of that water this morning I will cook it, and if it did not I will not pretend."',
            'Behind her the whole restaurant is built out over the sea on piles, and the floor moves a centimetre with the swell.',
          ],
          next: 'menu',
        },
        menu: hub([
          { label: 'The kitchen', note: 'Shop', action: () => { openShop(game, 'pearl'); return null; }, end: true },
          {
            label: 'Sell you our catch', note: `${catchWorth().toLocaleString()} gil · +40%`,
            when: () => catchWorth() > 0,
            action: () => sellCatch(),
          },
          { label: 'You are short of something', next: 'offer', when: () => status === 'available' },
          { label: 'About the order', next: 'nag', when: () => status === 'active' },
          { label: 'About Navyth', next: 'navyth' },
          { label: 'The hunts', note: 'Hunts', action: () => { openHunts(game); return null; }, end: true },
          { label: 'Enjoy your evening', next: 'bye' },
        ]),
        sold: {
          lines: [
            '"Good fish. Better than what the boats bring me, which tells you something about the boats."',
            'She pays over the odds without being asked, which is the only kind of generosity anyone in Leide accepts.',
          ],
          next: 'menu',
        },
        nocatch: { lines: ['"Come back with a fish and we will talk about money."'], next: 'menu' },
        offer: {
          lines: [
            '"I have a table of eleven tomorrow and no sea bass, because the boat that brings it has decided it is a ferry now."',
            '"The shoals are a hundred and fifty metres that way. You have a rod. I have a kitchen. This solves itself."',
          ],
          next: 'offermenu',
        },
        offermenu: hub([
          {
            label: 'We will fish it', note: 'Accept',
            action: () => takeQuest(game, QID, 'coctura', 'yes', 'no'),
          },
          { label: 'Buy them off somebody', next: 'menu' },
        ]),
        yes: { lines: ['"East along the shingle, off the rocks. Do not fall in; I am not insured for princes."'], next: null },
        no: { lines: ['"Then it is a table of eleven eating vegetables. On my conscience, not yours."'], next: null },
        nag: {
          lines: ['"Still nothing. The rocks east of here, and go at dusk — they come in with the light going."'],
          next: 'menu',
        },
        navyth: {
          lines: [
            '"My brother. He has been standing on that rail for eleven years waiting for one fish that I am fairly sure is a rumour."',
            '"Talk to him. He will tell you the whole thing and you will not get your evening back."',
          ],
          next: 'menu',
        },
        bye: { lines: ['"Watch the boards on the way out. They are wet, always, forever."'], next: null },
      },
    };
  },

  /* ------------------------------------------------------------- Navyth -- */
  navyth: (game: Game) => {
    const QID = 'side_legendary_fish';
    const status = questStatus(game, QID);
    const rpg = rpgOf(game);
    const hasRod = () => !!rpg?.inventory?.has?.('fishing_rod');
    return {
      speaker: 'Navyth', role: 'Fisherman · Galdin Quay', hue: 200, tone: 0.4,
      start: status === 'complete' ? 'done' : 'hello',
      nodes: {
        hello: {
          lines: [
            'A big man folded over the quay rail with his forearms on it, watching water that is doing nothing at all.',
            '"Navyth. You are the fourth people today. The other three had cameras."',
          ],
          next: 'menu',
        },
        menu: hub([
          { label: 'What are you watching for?', next: 'watching', when: () => status !== 'available' },
          { label: 'Something is wrong with the water', next: 'offer', when: () => status === 'available' },
          { label: 'About the fish', next: 'nag', when: () => status === 'active' },
          { label: 'About fishing', next: 'craft' },
          { label: 'Good luck', next: 'bye' },
        ]),
        watching: {
          lines: [
            '"Nothing. Which is the point. Eleven years I have been coming down here and the nothing is very consistent."',
            '"My sister runs the restaurant behind you and thinks I am wasting a life. She is probably right and it is still my life."',
          ],
          next: 'menu',
        },
        offer: {
          lines: [
            '"Alstor Slough. Something has been through it and every fish in it is either gone or hiding under the bank."',
            '"Voretooth. A pack of them working the shallows, which they do not do, which is how you know something is wrong further up."',
            '"Clear them and then put a line in, and if a bass takes it, the slough is alive. If nothing takes it, I will stop coming down here."',
          ],
          next: 'offermenu',
        },
        offermenu: hub([
          {
            label: 'We will find out', note: 'Accept',
            action: () => takeQuest(game, QID, 'navyth', 'yes', 'no'),
          },
          { label: 'Not today', next: 'menu' },
        ]),
        yes: {
          lines: () => (hasRod()
            ? ['"You have a rod. Good. The bass will fight you the whole way in and that is how you know it is a bass."']
            : ['"You will want a rod. Ask at the Pearl; Coctura keeps my spare and pretends she does not."']),
          next: null,
        },
        no: { lines: ['"Aye. It has waited eleven years."'], next: null },
        nag: {
          lines: ['"Voretooth first, then the line. In that order — you cannot fish a bank with something eating off it."'],
          next: 'menu',
        },
        craft: {
          lines: [
            '"A rod is patience with a handle on it. You hold, you wait, and when it goes you do not pull, you lean."',
            '"Everything else about it is people telling you what they caught."',
          ],
          next: 'menu',
        },
        done: {
          lines: [
            '"It took. I watched it take." He has not moved off the rail but he is standing differently.',
            '"The slough is alive. Tell my sister. Do not tell her I asked you to."',
          ],
          next: 'menu',
        },
        bye: { lines: ['"Mind the boards."'], next: null },
      },
    };
  },

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

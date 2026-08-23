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
          { label: 'The ferry to Altissia', next: 'ferry' },
          { label: 'Somewhere to sleep', next: 'lodging' },
          { label: 'What do you do here?', next: 'stones' },
          { label: 'We should go', next: 'bye' },
        ]),
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
        { label: 'Lestallum', next: 'town' },
        { label: 'The Meteor', next: 'meteor' },
        { label: 'Your brother', next: 'gladio' },
        { label: 'Later, Iris', next: 'bye' },
      ]),
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
          { label: 'How the plant works', next: 'plant' },
          { label: 'We will leave you to it', next: 'bye' },
        ]),
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

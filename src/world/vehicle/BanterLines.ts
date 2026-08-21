/**
 * The road-trip line pool.
 *
 * Everything the four of them say in the car, filed by the situation that
 * triggers it. Some entries carry a `reply` (and occasionally a second reply)
 * so a beat can land as an exchange rather than four disconnected one-liners —
 * that back-and-forth is most of what makes FFXV's car feel inhabited.
 *
 * Voices, held to throughout:
 *   noctis  — flat, dry, minimum words, warms up only by accident
 *   gladio  — gruff, teasing, physical, calls Noct "princess" and means it fondly
 *   ignis   — precise, formal, deadpan, and quietly the funniest of the four
 *   prompto — loud, insecure, delighted by everything, always holding a camera
 *
 * @typedef {{who:string, line:string,
 *            reply?:{who:string, line:string, delay?:number},
 *            reply2?:{who:string, line:string, delay?:number}}} Line
 */

const N = 'Noctis', G = 'Gladiolus', I = 'Ignis', P = 'Prompto';

export const BANTER: Record<string, Line[]> = {
  // ---------------------------------------------------------------- setting off
  depart: [
    { who: I, line: 'Off we go. Try not to fall asleep before we clear the city limits.', reply: { who: N, line: 'No promises.', delay: 2.6 } },
    { who: P, line: 'Road trip! Okay, okay — everybody say "Insomnia"!', reply: { who: G, line: 'Nobody is saying Insomnia.', delay: 2.4 } },
    { who: G, line: 'Long way to Galdin. Get comfortable.' },
    { who: I, line: 'Fuel is good, tyres are good. The prince is asleep. All normal.' },
    { who: N, line: 'Wake me when something happens.', reply: { who: G, line: 'Something is always happening, Noct.', delay: 2.5 } },
    { who: P, line: 'First one to spot a chocobo gets shotgun for a week!' },
    { who: I, line: 'Everyone in? Then let us not keep the road waiting.' },
    { who: G, line: 'Top down. Good call.' },
    { who: N, line: 'Feels weird. Leaving.', reply: { who: I, line: 'It should. Give it a few miles.', delay: 2.8 } },
    { who: P, line: 'Man, this car. I still can\'t believe we get to ride in this car.' },
  ],

  // -------------------------------------------------------------- long straights
  straight: [
    { who: G, line: 'Nothing but road out here. Kinda like it.' },
    { who: P, line: 'Are we there yet?', reply: { who: I, line: 'We are approximately nowhere near there yet.', delay: 2.3 } },
    { who: N, line: 'Straight road. Finally.' },
    { who: I, line: 'Making decent time. We may even arrive before dark.' },
    { who: P, line: 'Okay so if a behemoth raced the Regalia — who wins?', reply: { who: G, line: 'The behemoth. It doesn\'t stop for fuel.', delay: 2.6 } },
    { who: G, line: 'You know, out here you can actually hear yourself think.', reply: { who: P, line: 'Then how come you\'re still talking?', delay: 2.5 } },
    { who: I, line: 'Leide. Rock, dust, and more rock. It grows on you. Slowly.' },
    { who: N, line: 'How long\'s this stretch?', reply: { who: I, line: 'Forty kilometres of exactly this.', delay: 2.4 } },
    { who: P, line: 'I love this song. Turn it up!' },
    { who: G, line: 'Iggy, don\'t let him touch the radio again.' },
    { who: N, line: 'Wind\'s not bad.' },
    { who: I, line: 'A straight road is a rare luxury. Enjoy it while it lasts.' },
    { who: P, line: 'Hey Noct. Noct. You awake? ...He\'s out.', reply: { who: N, line: 'I\'m awake.', delay: 2.2 } },
    { who: G, line: 'Twelve years I trained for this and mostly I sit in a car.' },
  ],

  // -------------------------------------------------------------- fast / spirited
  fast: [
    { who: P, line: 'Whoa — okay! We are MOVING!' },
    { who: G, line: 'That\'s more like it.' },
    { who: I, line: 'Noct. The Regalia is a royal vehicle, not a projectile.', reply: { who: N, line: 'It handles it fine.', delay: 2.4 } },
    { who: P, line: 'My hair! My beautiful hair!' },
    { who: N, line: 'Told you she moves.' },
    { who: G, line: 'Ha! Now you\'re driving.' },
    { who: I, line: 'Do please remember that stopping also takes distance.' },
    { who: P, line: 'This is the best day of my life. Also I might be sick.' },
  ],

  slide: [
    { who: I, line: 'Both hands, Noct.' },
    { who: P, line: 'AAAH — okay, we\'re fine, we\'re fine.' },
    { who: G, line: 'Whoa! Hey! Watch it!' },
    { who: N, line: 'Meant to do that.', reply: { who: G, line: 'Sure you did.', delay: 2.2 } },
    { who: I, line: 'I would rather not repaint the Regalia this week.' },
    { who: P, line: 'Did anybody else see their whole life just now, or was that just me?' },
  ],

  // --------------------------------------------------------------- off the tarmac
  offroad: [
    { who: I, line: 'We are off the road. That is not a road. Noct.' },
    { who: G, line: 'Feel that? That\'s the suspension filing a complaint.' },
    { who: P, line: 'Ow — ow — my tailbone!' },
    { who: N, line: 'Shortcut.', reply: { who: I, line: 'It is not a shortcut if we arrive on three wheels.', delay: 2.6 } },
    { who: G, line: 'This thing wasn\'t built for the badlands, Noct.' },
    { who: I, line: 'The dust alone is going to take an hour to get out of the vents.' },
  ],

  typeD: [
    { who: P, line: 'Type-D! Off-road mode, baby! Go anywhere!' },
    { who: I, line: 'The off-road package is fitted. Within reason, the terrain is now our problem to choose.' },
    { who: G, line: 'Now we\'re talking. Point it at the hills.' },
    { who: N, line: 'Cindy\'s work. It holds.' },
  ],

  // -------------------------------------------------------------------- landmarks
  landmark: [
    { who: P, line: 'Whoa, check out that rock! Pull over — I need this shot!' },
    { who: G, line: 'That mesa\'s got a good haven on top of it. Slept there once.' },
    { who: I, line: 'Blackrock Mesa. You can see the strata from here — a few million years of Eos, stacked up.' },
    { who: N, line: 'Big.', reply: { who: G, line: 'Poet.', delay: 2.2 } },
    { who: I, line: 'Those pylons are Solheim-era. Older than the Wall, older than the Line.' },
    { who: P, line: 'How does something even get that big? Like, geologically?' },
    { who: G, line: 'Hunters use that ridge as a marker. If you\'re past it, you\'re out of easy country.' },
    { who: I, line: 'A ruined obelisk, and nobody left who remembers what it commemorated.' },
    { who: P, line: 'Okay that one\'s going in the album. Definitely the album.' },
    { who: N, line: 'Dad used to talk about these roads.', reply: { who: I, line: 'He drove them himself, once. Long before us.', delay: 3.0 } },
  ],

  outpost: [
    { who: P, line: 'Ooh — a gas station! Snacks? Can we do snacks?' },
    { who: I, line: 'A rest stop ahead. We could top up the tank while we have the chance.' },
    { who: G, line: 'Coernix. Cold drinks, bad coffee, decent people.' },
    { who: N, line: 'We stopping?' },
  ],

  // ---------------------------------------------------------------------- weather
  weather_rain: [
    { who: P, line: 'Rain! Roof! Roof, Iggy, roof!' },
    { who: I, line: 'Rain. The road will be greasy for the next while — I would ease off.' },
    { who: G, line: 'Little water never hurt anybody.', reply: { who: P, line: 'It\'s hurting my hair!', delay: 2.3 } },
    { who: N, line: 'Great.' },
  ],
  weather_storm: [
    { who: I, line: 'That is a proper storm front. Visibility is about to become a real problem.' },
    { who: G, line: 'Lightning out over the flats. Don\'t stop under anything tall.' },
    { who: P, line: 'Okay, that thunder was NOT far away.' },
    { who: N, line: 'Keep going. We\'re not sitting in that.' },
  ],
  weather_fog: [
    { who: I, line: 'Fog. Slow down — I can see perhaps forty metres of road.' },
    { who: P, line: 'This is exactly how every scary story I know starts.' },
    { who: G, line: 'Eyes up. Fog\'s good cover for things that hunt.' },
  ],
  weather_clear: [
    { who: P, line: 'Look at that sky! Not one cloud!' },
    { who: I, line: 'Clear skies. We should make good time.' },
    { who: G, line: 'Perfect day for it.' },
  ],

  // ------------------------------------------------------------------ time of day
  dusk: [
    { who: I, line: 'The sun is going down. I would rather not be on this road much longer.' },
    { who: G, line: 'Light\'s going. You know what comes with the dark out here.' },
    { who: P, line: 'Uh — guys? It\'s getting dark. That\'s the bad one, right? That\'s the bad one.' },
    { who: N, line: 'Daemons.', reply: { who: I, line: 'Daemons. Find us a haven, or we keep driving.', delay: 2.6 } },
    { who: I, line: 'Sunset. Headlights on. Eyes on the shoulder, all of you.' },
    { who: G, line: 'Nothing good stands by the road after dark. Nothing that\'s still alive, anyway.' },
  ],
  night: [
    { who: P, line: 'I hate night driving. I hate it so much.' },
    { who: I, line: 'Stay on the road and stay moving. They will not come at a moving car.' },
    { who: G, line: 'Was that — no. Nothing. Keep going.' },
    { who: N, line: 'Something moved out there.', reply: { who: G, line: 'Yeah. Don\'t slow down.', delay: 2.4 } },
    { who: I, line: 'The Starscourge does not sleep, and neither, it seems, do we.' },
    { who: P, line: 'Okay, new rule. Nobody says the word "daemon" until sunrise.' },
    { who: G, line: 'Headlights only reach so far. Slow it down a notch.' },
    { who: I, line: 'Every light out there is somebody who did not make it to a haven.' },
    { who: N, line: 'Stars are good, at least.', reply: { who: P, line: 'Right? You never see them like this in the city.', delay: 2.8 } },
  ],
  dawn: [
    { who: P, line: 'Sunrise! We made it! WE MADE IT!' },
    { who: I, line: 'Dawn. Well done, everyone. Breakfast at the next stop.' },
    { who: G, line: 'Made it through another one.' },
    { who: N, line: 'Never been so happy to see the sun.' },
  ],

  // --------------------------------------------------------------------- Prompto
  photo: [
    { who: P, line: 'Ooh — stop stop stop! The light\'s perfect right now!', reply: { who: I, line: 'We are doing ninety, Prompto.', delay: 2.4 } },
    { who: P, line: 'Okay everybody look natural. Noct — that\'s not natural.' },
    { who: P, line: 'One more! Come on, one more and I\'ll shut up.', reply: { who: G, line: 'You will not.', delay: 2.2 } },
    { who: P, line: 'This is going straight in the album. Chapter one: "The Boys Leave Town".' },
    { who: P, line: 'Got it! Oh man, the way the sun hit the hood — chef\'s kiss.' },
    { who: P, line: 'Hey Noct, smile. Just once. For posterity.', reply: { who: N, line: 'That was a smile.', delay: 2.4 } },
  ],

  // ------------------------------------------------------------------------ Ignis
  recipe: [
    { who: I, line: 'I\'ve come up with a new recipeh.', reply: { who: P, line: 'YESSS. What is it? Tell me it\'s the skewers.', delay: 2.5 } },
    { who: I, line: 'Leiden pepper, a little anak, high heat. I think I have it.' },
    { who: I, line: 'That roadside stand had daggerquill breast. I have plans for it.' },
    { who: I, line: 'Noct. If you keep picking the vegetables out I will start blending them.', reply: { who: N, line: 'You wouldn\'t.', delay: 2.4 } },
    { who: I, line: 'Cooking on the road is a discipline. So is eating what you are given.' },
    { who: G, line: 'Whatever it is, make double.', reply: { who: I, line: 'I always make double. You are the reason I make double.', delay: 2.6 } },
    { who: I, line: 'There is a herb that grows out here that turns cheap meat into something worth stopping for.' },
  ],

  // --------------------------------------------------------------------- Gladio
  scenery: [
    { who: G, line: 'Look at that light on the rock. Insomnia never gave us that.' },
    { who: G, line: 'You can see weather coming from twenty miles out here. Kinda beautiful.' },
    { who: G, line: 'My old man would\'ve liked this stretch.' },
    { who: G, line: 'Hey Noct. Look up from the phone. This is the part you\'ll remember.', reply: { who: N, line: '...Yeah. Yeah, okay.', delay: 2.8 } },
    { who: G, line: 'Iris keeps asking me what it looks like out here. Never know what to tell her.' },
    { who: G, line: 'Country like this makes you feel small. Good for you, once in a while.' },
  ],

  // ----------------------------------------------------------------------- fuel
  fuel_low: [
    { who: I, line: 'We are low on fuel. There is a station ahead — I suggest we use it.' },
    { who: P, line: 'Uh, guys? The little needle is doing the thing. The bad thing.' },
    { who: G, line: 'Running dry. Don\'t make me push this thing again.', reply: { who: N, line: 'Once. That happened once.', delay: 2.5 } },
    { who: I, line: 'Fuel warning. I would rather not walk to Hammerhead in the dark.' },
  ],
  fuel_empty: [
    { who: I, line: 'That\'s it. We are out. Everyone out and push — you know the drill.' },
    { who: G, line: 'Again? Seriously?' },
    { who: P, line: 'I\'m not pushing. I\'m steering. I called steering.' },
    { who: N, line: 'This is not happening.' },
  ],
  refuel: [
    { who: I, line: 'Tank\'s full. That should see us across Leide comfortably.' },
    { who: P, line: 'Full tank, cold drinks. We are unstoppable.' },
    { who: G, line: 'Alright. Let\'s move.' },
    { who: N, line: 'Thanks, Cindy.', reply: { who: P, line: 'Yeah — thanks, Cindy! ...She wasn\'t even there, Noct.', delay: 2.8 } },
  ],

  // --------------------------------------------------------------------- arrival
  arrive: [
    { who: I, line: 'We have arrived. All in one piece, which I consider a personal achievement.' },
    { who: G, line: 'Alright. Everybody out.' },
    { who: P, line: 'Land! Sweet, solid land!' },
    { who: N, line: 'Finally.' },
  ],

  // ------------------------------------------------------------------ after a fight
  after_combat: [
    { who: G, line: 'Not bad. Get in, we\'re losing light.' },
    { who: I, line: 'Everyone accounted for? Good. Back to the car.' },
    { who: P, line: 'Did you SEE that? I got like four of them! Maybe three. Two, definitely two.' },
    { who: N, line: 'Anyone hurt?', reply: { who: I, line: 'Nothing a potion and a hot meal will not fix.', delay: 2.6 } },
    { who: G, line: 'You dropped your guard on the second one. Work on it.', reply: { who: N, line: 'Noted.', delay: 2.3 } },
    { who: I, line: 'That is the third patrol on this road. The Empire is not being subtle.' },
  ],

  // ------------------------------------------------------------------- auto-drive
  autodrive: [
    { who: I, line: 'I have the wheel. Sit back.' },
    { who: N, line: 'All yours, Ignis.' },
    { who: G, line: 'Good. Now nobody\'s gonna die.' },
    { who: P, line: 'Ignis-mode engaged! Nap time, everybody.' },
  ],
  takeover: [
    { who: I, line: 'You have the wheel. Do try to keep her on the tarmac.' },
    { who: G, line: 'Prince is driving. Everybody hold on to something.' },
    { who: P, line: 'Noct\'s driving! Noct\'s driving! Okay, seatbelts.' },
    { who: N, line: 'I\'ve got it.' },
  ],

  // ------------------------------------------------------------------------ radio
  radio: [
    { who: P, line: 'Oh, this one! This one is a classic!' },
    { who: G, line: 'Change it.', reply: { who: P, line: 'Never.', delay: 2.0 } },
    { who: I, line: 'A reasonable choice, for once.' },
    { who: N, line: 'Leave it. It\'s good.' },
    { who: P, line: 'You know they say this one was written before the Wall went up?' },
  ],

  // --------------------------------------------------------------------- odd lulls
  lull: [
    { who: P, line: 'So... anybody know any games?' },
    { who: G, line: 'Quiet\'s not a bad thing, Prompto.' },
    { who: I, line: 'Mind the temperature gauge. She runs warm on a long pull.' },
    { who: N, line: '...' },
    { who: P, line: 'I spy, with my little eye, something beginning with... R.', reply: { who: G, line: 'Rock.', delay: 2.2 }, reply2: { who: P, line: 'Rock. Yeah. It was rock.', delay: 4.4 } },
    { who: I, line: 'We should reach the next waypoint within the hour.' },
    { who: G, line: 'Get some sleep, Noct. I\'ll take the next leg.' },
    { who: P, line: 'Y\'know, if you\'d told me a year ago I\'d be here, in this car, with you guys...' },
    { who: N, line: 'Yeah. Me neither.' },
  ],
};

/** Every category name, for validation and the debug overlay. */
export const CATEGORIES = Object.keys(BANTER);

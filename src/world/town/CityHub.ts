import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glowMaterial } from '../props/PropMaterials.ts';
import { ShopScreen } from '../../ui/screens/ShopScreen.ts';
import { HuntBoardScreen } from '../../ui/screens/HuntBoardScreen.ts';
import type { Game } from '../../game/Game.ts';
import type { Menus, ScreenMap } from '../../ui/Menus.ts';
import type { InteractableHandle } from '../../game/interaction/Interactables.ts';
import type { RestSummary } from '../../game/rpg/DayCycle.ts';
import type { DialogueScript } from '../../game/interaction/Dialogue.ts';

type MenuScreenCtor<K extends 'shop' | 'hunts'> = new (menus: Menus) => NonNullable<ScreenMap[K]>;

/** One thing you can walk up to in a city, in anchor-relative terms. */
interface CityFixture {
  /** anchor name the `_town` kit published. */
  at: string;
  id: string;
  verb: string;
  label: string;
  hint: string;
  radius?: number;
  yOffset?: number;
  priority?: number;
  /**
   * What pressing E does. `shop` opens a counter, `hunts` the board, `rest`
   * the lodging conversation, `read` a one-off script (a notice, a bell, a
   * view). `read` gets the live `game` so a line can read the quest log.
   */
  does: { shop: string } | { hunts: true } | { rest: true } | { eat: true }
  | { read: (game: Game) => DialogueScript };
}

/** A city hub: which POI it lives on, what stands on its square. */
interface CityDef {
  /** POI id in `WorldMap`. */
  poi: string;
  name: string;
  region: string;
  /** dialogue-card hue for the lodging conversation. */
  hue: number;
  /** the two lodging rows in `Stats.LODGINGS`, cheapest first. */
  lodgings: [string, string];
  /** flavour for the lodging offer. */
  lodgeSpeaker: string;
  lodgeSub: string;
  lodgeLines: string[];
  fixtures: CityFixture[];
  /** festoon runs, as pairs of `light{i}` anchor indices. */
  festoon: [number, number][];
  /** the warm bulb colour over this square. */
  bulb: number;
}

/**
 * LESTALLUM and GALDIN QUAY — the two cities, inhabited.
 *
 * Both places have existed as **sets** for weeks: `PoiKits._town` builds a
 * paved square, six gabled market stalls, strung lights, a chimney stack and a
 * five-by-five street grid at each of them, and the frames are handsome. What
 * neither had was a single thing to do. You could walk into Lestallum, look at
 * it, and walk out again, and the only counter in Lucis was three hundred
 * metres of dirt road away at Hammerhead.
 *
 * This is the same job {@link Hammerhead} does, done against the kit instead of
 * against a hand-authored local frame — because there are two cities and there
 * will be more, and forty thousand more lines of `local(u, y, v)` is not the
 * way to get them. Everything below places against the **anchors** the kit now
 * publishes (`PoiKits.anchorAt`), so a fixture lands on real pavement in a
 * square whose stalls were laid out by a seeded loop nobody typed.
 *
 * ### It has to late-bind, and that is not a style choice
 *
 * `PoiKits._make` runs when the camera comes within `BUILD_R` of a POI, one
 * site per frame. At `init` neither city exists, `anchorAt` returns `null` for
 * every name, and a hub that read them once at boot would register nothing and
 * report no error. So `update` polls for the plaza anchor and binds the city
 * the first time it resolves — once, guarded by {@link _bound}.
 *
 * ### What the two cities do NOT share with Hammerhead
 *
 * The screens. `_registerScreens` is a copy of Hammerhead's on purpose,
 * including its early-return guard: whichever of the two systems reaches
 * `Menus` first builds `shop` and `hunts`, the other finds them and leaves them
 * alone. That guard is what makes a second caller safe, and it is why this
 * system can boot before or after Hammerhead without a flag.
 */
export class CityHub {
  _bound!: Set<string>;
  _camPos!: THREE.Vector3;
  /** Interaction registrations, kept so they could be disposed. */
  _handles!: InteractableHandle[];
  /** The meal just eaten, for the `ate` node. */
  _ateName?: string;
  /** Why the last stay was refused, for the `failed` node. */
  _restFail?: string;
  _restSummary?: RestSummary;
  /** The emissive the festoon bulbs share; ramped by `update`. */
  festoonMat!: THREE.MeshStandardMaterial;
  game!: Game;
  /** Per-city point lights over the square, on the night ramp. */
  lights!: { light: THREE.PointLight, night: number, day: number }[];
  root!: THREE.Group;
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'cityhub';
    this._bound = new Set();
    this._handles = [];
    this._camPos = new THREE.Vector3();
    this.lights = [];
  }

  /**
   * Attach the two shared screens and put the group in the scene.
   *
   * Nothing is placed here — see the class note on late binding.
   * @param game the game
   */
  async init(game: Game) {
    this.game = game;
    game.scene.add(this.root);
    // Its own material, NOT `PoiMats.lamp`: six kits share that one and a
    // brighter festoon would brighten every lamp on every POI in Lucis.
    this.festoonMat = glowMaterial(0xffd9a0, 0.5, 0x120c06);
    this.festoonMat.name = 'city_festoon';
    this._registerScreens(game);
    return this;
  }

  /** Attach the shop and hunt screens if nobody has yet. @param game the game */
  _registerScreens(game: Game) {
    const menus = game.get('Menus');
    if (!menus || !menus.screens || !menus.wrap) return;
    const add = <K extends 'shop' | 'hunts'>(key: K, Screen: MenuScreenCtor<K>) => {
      // The guard that makes a second caller safe. Hammerhead runs the same
      // block; whoever gets there first wins and the other one no-ops.
      if (menus.screens[key]) return;
      const s = new Screen(menus);
      s.node = document.createElement('div');
      s.node.className = `screen s-${key}`;
      s.node.style.display = 'none';
      menus.wrap.appendChild(s.node);
      s.build(s.node, game);
      menus.screens[key] = s;
    };
    add('shop', ShopScreen);
    add('hunts', HuntBoardScreen);
  }

  /* ---------------------------------------------------------------- bind */

  /**
   * Put one city's verbs and lights on the ground.
   *
   * @param city the definition
   * @param game the game
   * @returns false if the kit has not built the square yet
   */
  bind(city: CityDef, game: Game): boolean {
    const props = game.get('Props');
    const kits = props && props.poiKits;
    if (!kits || !kits.anchorAt(city.poi, 'plaza')) return false;
    const ix = game.get('Interaction');
    if (!ix) return false;

    const A = (name: string) => kits.anchorAt(city.poi, name);

    const openShop = (id: string) => {
      const menus = game.get('Menus');
      const screen = menus?.screens?.shop;
      // `setShop` returns silently on an unknown id, so a typo here is an
      // empty shop and no error anywhere. Every id below is in `TOWN_SHOPS`.
      if (screen && screen.setShop) screen.setShop(id);
      ix.openScreen('shop');
    };

    for (const f of city.fixtures) {
      const pos = A(f.at);
      if (!pos) { console.warn(`[CityHub] ${city.poi} has no anchor "${f.at}"`); continue; }
      const does = f.does;
      const handler = 'shop' in does ? () => openShop(does.shop)
        : 'hunts' in does ? () => ix.openScreen('hunts')
          : 'rest' in does ? () => this._rest(city, game)
            : 'eat' in does ? () => this._eat(game)
              : () => ix.say(does.read(game));
      this._handles.push(ix.register({
        id: f.id, pos, radius: f.radius ?? 2.8, priority: f.priority ?? 1,
        verb: f.verb, label: f.label, hint: f.hint, yOffset: f.yOffset ?? 1.5,
        handler,
      }));
    }

    this._festoon(city, kits);
    return true;
  }

  /**
   * String the lights that were never strung.
   *
   * `_town` puts six unconnected 0.16 m spheres on `M.lamp` at 10.5 m and 4.4 m
   * up, which at night is six floating dots. A festoon is the *catenary between
   * them*: that is what reads as a market square after dark, and it is the shot
   * the two cities exist for. Both the cable and the bulbs merge into one
   * geometry each, so a whole square's lighting is two draw calls.
   *
   * @param city the definition
   * @param kits the POI streamer, already holding the anchors
   */
  _festoon(city: CityDef, kits: NonNullable<import('../Props.ts').Props['poiKits']>) {
    const cable: THREE.BufferGeometry[] = [];
    const bulbs: THREE.BufferGeometry[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    // One shared bulb, instanced by merging: a pear 6x5 sphere is 40 triangles
    // and there are about seventy of them.
    const bulbGeo = new THREE.SphereGeometry(0.105, 6, 5);
    const SEG = 9;
    for (const [i, j] of city.festoon) {
      const pa = kits.anchorAt(city.poi, `light${i}`, a);
      const pb = kits.anchorAt(city.poi, `light${j}`, b);
      if (!pa || !pb) continue;
      // A real festoon sags; the sag is most of what makes it read as a cable
      // and not as a wire model. 8% of the span, quadratic.
      const span = pa.distanceTo(pb);
      const sag = span * 0.09;
      for (let s = 0; s < SEG; s++) {
        const t0 = s / SEG, t1 = (s + 1) / SEG;
        const y = (t: number) => THREE.MathUtils.lerp(pa.y, pb.y, t) - sag * 4 * t * (1 - t);
        p.set(THREE.MathUtils.lerp(pa.x, pb.x, t0), y(t0), THREE.MathUtils.lerp(pa.z, pb.z, t0));
        q.set(THREE.MathUtils.lerp(pa.x, pb.x, t1), y(t1), THREE.MathUtils.lerp(pa.z, pb.z, t1));
        const mid = p.clone().lerp(q, 0.5);
        const len = p.distanceTo(q);
        const g = new THREE.CylinderGeometry(0.017, 0.017, len, 4, 1);
        const m = new THREE.Matrix4().lookAt(p, q, new THREE.Vector3(0, 1, 0));
        // `lookAt` builds a -Z basis; a cylinder is +Y, so tip it first.
        m.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
        m.setPosition(mid);
        cable.push(g.applyMatrix4(m));
        // a bulb hanging off every segment joint but the last, which is the
        // pole. Eight to a run, six runs: forty-eight bulbs in one draw.
        if (s < SEG - 1) {
          const bg = bulbGeo.clone();
          bg.translate(q.x, q.y - 0.19, q.z);
          bulbs.push(bg);
        }
      }
    }
    if (!cable.length) return;
    const cableGeo = mergeGeometries(cable, false);
    const bulbGeoAll = mergeGeometries(bulbs, false);
    for (const g of cable) g.dispose();
    for (const g of bulbs) g.dispose();
    bulbGeo.dispose();
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x1a1614, roughness: 0.9, metalness: 0 });
    cableMat.name = `city_cable_${city.poi}`;
    if (cableGeo) {
      const m = new THREE.Mesh(cableGeo, cableMat);
      m.name = `festoon_cable_${city.poi}`;
      m.frustumCulled = true;
      this.root.add(m);
    }
    if (bulbGeoAll) {
      const m = new THREE.Mesh(bulbGeoAll, this.festoonMat);
      m.name = `festoon_bulbs_${city.poi}`;
      this.root.add(m);
    }
    // One warm point light over the square so the festoon actually lights the
    // pavement and the people standing on it, rather than merely glowing.
    const plaza = kits.anchorAt(city.poi, 'plaza');
    if (plaza) {
      const l = new THREE.PointLight(city.bulb, 0, 44, 2);
      l.position.set(plaza.x, plaza.y + 5.2, plaza.z);
      l.name = `city_plaza_light_${city.poi}`;
      this.root.add(l);
      this.lights.push({ light: l, night: 70, day: 0 });
    }
  }

  /* ------------------------------------------------------------- lodging */

  /**
   * Book a night at either tier of a city's hotel.
   *
   * Copied from Hammerhead's caravan, with the difference the two cities have
   * and the truck stop does not: **two rows**. `restAt` spends the gil itself
   * through `DayCycle.rest`, so nothing here touches the wallet.
   *
   * @param city the definition
   * @param game the game
   */
  _rest(city: CityDef, game: Game) {
    const ix = game.get('Interaction');
    const rpg = game.get('RpgSystem');
    if (!ix || !rpg) return;
    const rows = city.lodgings.map((id) => {
      const l = (rpg.tables?.lodgings as Record<string, { name?: string, gil?: number, bonus?: number, desc?: string }>)?.[id];
      return { id, name: l?.name ?? id, gil: l?.gil ?? 0, mult: 1 + (l?.bonus ?? 0), desc: l?.desc ?? '' };
    });
    const book = (id: string) => {
      const r = rpg.restAt(id, { wakeHour: 7.0 });
      if (!r || r.ok === false) { this._restFail = r?.reason ?? 'unknown'; return 'failed'; }
      this._restSummary = r;
      const hud = game.get('HUD');
      if (hud && hud.areaTitle) hud.areaTitle(city.name.toUpperCase(), city.region, 'Morning · Day ' + r.day);
      return 'slept';
    };

    ix.say({
      speaker: city.lodgeSpeaker, role: city.lodgeSub, hue: city.hue,
      start: 'offer',
      nodes: {
        offer: {
          lines: () => {
            const banked = Math.round(rpg.expBank?.banked ?? 0);
            return banked > 0
              ? [...city.lodgeLines,
                `You are carrying ${banked.toLocaleString()} EXP nobody has slept on. A bed here cashes it at ×${rows[1].mult.toFixed(1)}.`]
              : city.lodgeLines;
          },
          next: 'menu',
        },
        menu: {
          choices: [
            ...rows.map((r) => ({
              label: r.name, note: `${r.gil.toLocaleString()} gil · EXP ×${r.mult.toFixed(1)}`,
              when: () => (rpg.inventory?.gil ?? 0) >= r.gil,
              action: () => book(r.id),
            })),
            {
              label: 'Not enough gil', note: `from ${rows[0].gil.toLocaleString()} gil`,
              when: () => (rpg.inventory?.gil ?? 0) < rows[0].gil,
              next: 'broke',
            },
            { label: 'Some other night', end: true },
          ],
        },
        slept: {
          lines: () => {
            const r = this._restSummary;
            const lv = (r?.exp?.perMember ?? []).filter((m: { levels?: number[] }) => m.levels && m.levels.length);
            const out = [`You sleep through to ${r?.wokeAt || '07:00'}, in a bed, off the ground, for once.`];
            if (lv.length) {
              out.push(lv.map((m: { name: string, levels: number[] }) => `${m.name} reached level ${m.levels[m.levels.length - 1]}`).join('. ') + '.');
            } else if ((r?.exp?.total ?? 0) > 0) {
              out.push(`${Math.round(r?.exp?.total ?? 0).toLocaleString()} EXP cashed in.`);
            }
            return out;
          },
          next: null,
        },
        broke: { lines: ['The desk clerk does not look up. "When you have the gil, sir."'], next: null },
        failed: { lines: () => [`The night does not happen. (${this._restFail})`], next: null },
      },
    });
  }

  /* ---------------------------------------------------------------- eat */

  /**
   * A meal at a counter, which is the only way to buy a buff in this game.
   *
   * Everything else that grants one is a camp: `RpgSystem.camp` cooks a recipe
   * and `addBuff`s it on waking. That means a party mid-afternoon in a city has
   * no way to prepare for a fight except to drive out and sleep. A cooked meal
   * over a counter is the FFXV answer and it is four lines of state.
   *
   * Priced 300-1,800, which is deliberately cheap against the 42,180-gil
   * wallet: this is a verb, not a gil sink. The gil sink is the Forge.
   *
   * @param game the game
   */
  _eat(game: Game) {
    const ix = game.get('Interaction');
    const rpg = game.get('RpgSystem');
    if (!ix || !rpg) return;
    const eat = (m: typeof MEALS[number]) => {
      if (!rpg.inventory?.spendGil?.(m.gil)) return 'broke';
      rpg.party?.addBuff?.({
        kind: 'meal', id: `beanmine_${m.id}`, name: m.name,
        mods: m.mods, effects: m.effects, hours: m.hours,
      }, rpg.day?.absoluteHour ?? 0);
      this._ateName = m.name;
      const hud = game.get('HUD');
      if (hud?.callOut) hud.callOut('MEAL', `${m.name}  ·  ${m.hours} h`);
      return 'ate';
    };
    ix.say({
      speaker: 'Surgate', role: "Surgate's Beanmine · Lestallum", hue: 30,
      start: 'hello',
      nodes: {
        hello: {
          lines: [
            'A long zinc counter, four stools, and a coffee machine that sounds like a small industrial accident.',
            '"Sit. Board is on the wall. Tony is the one who talks; I am the one who cooks."',
          ],
          next: 'menu',
        },
        menu: {
          choices: [
            ...MEALS.map((m) => ({
              label: m.name, note: `${m.gil} gil · ${m.blurb}`,
              action: () => eat(m),
            })),
            { label: 'Just the coffee, thanks', end: true },
          ],
        },
        ate: {
          lines: () => [
            `${this._ateName}. Eaten standing up, in about four minutes, the way everyone in this city eats.`,
            'Everyone feels better for it and says so, at length, for the rest of the afternoon.',
          ],
          next: null,
        },
        broke: { lines: ['"Gil first. It is a coffee house, not a charity."'], next: null },
      },
    });
  }

  /* -------------------------------------------------------------- update */

  /** 0 in full daylight, 1 once the sun is well below the horizon. */
  _night(game: Game) {
    const sky = game.get('Sky');
    if (!sky || !sky.sun || !sky.sun.position) return 0;
    const p = sky.sun.position;
    const elev = p.y / (p.length() || 1);
    return THREE.MathUtils.clamp(1 - (elev + 0.06) * 6.5, 0, 1);
  }

  /** @param dt seconds @param game the game */
  update(dt: number, game: Game) {
    void dt;
    if (this._bound.size < CITIES.length) {
      for (const c of CITIES) {
        if (this._bound.has(c.poi)) continue;
        if (this.bind(c, game)) this._bound.add(c.poi);
      }
    }
    if (!this.lights.length) return;
    const night = this._night(game);
    for (const l of this.lights) l.light.intensity = l.day + (l.night - l.day) * night;
    // Same ramp shape as `PoiKits.update` gives `M.lamp`, one stop brighter,
    // because a festoon is the light source in the frame and a POI lamp is a
    // detail on a wall.
    this.festoonMat.emissiveIntensity = 0.25 + night * 4.2;
  }
}

/* ------------------------------------------------------------------------ */
/* The two cities                                                            */
/* ------------------------------------------------------------------------ */

/**
 * Which anchors are usable was **measured**, not chosen.
 *
 * `src/tools/probes/cityanchors.mts` walks the built geometry and reports, for
 * every anchor, whether anything solid stands between knee and head height on
 * it and how many of the eight compass approaches are clear. At Lestallum a
 * block of the street grid leans into the square and takes out `edge0`,
 * `edge1`, `edge5` and `stall5`; at Galdin Quay it takes out `edge4`. Nothing
 * below uses one of those five. Re-run the probe if `_town` changes.
 */
export const CITIES: CityDef[] = [
  {
    poi: 'lestallum',
    name: 'Lestallum',
    region: 'Cleigne',
    hue: 22,
    bulb: 0xffce8a,
    lodgings: ['leville_std', 'leville_deluxe'],
    lodgeSpeaker: 'The Leville',
    lodgeSub: 'Lestallum · Hotel',
    lodgeLines: [
      'The lobby is all dark wood and ceiling fans, and it has been too warm in here since 1962.',
      '"Two rooms free. The suite faces the Meteor, if His Highness cares for a view."',
    ],
    // Anchors: stall0 / stall2 / stall4 are the three counters, edge2 the
    // hotel door, edge3 the board, edge4 the rail over the drop.
    fixtures: [
      {
        at: 'stall0', id: 'lest_market', verb: 'Shop',
        label: 'Partellum Market', hint: 'Ingredients & gemstones',
        does: { shop: 'partellum' },
      },
      {
        at: 'stall2', id: 'lest_beanmine', verb: 'Shop',
        label: "Surgate's Beanmine", hint: 'Coffee, cooked meals, hunt tips',
        does: { shop: 'beanmine' },
      },
      {
        at: 'stall4', id: 'lest_forge', verb: 'Shop',
        label: 'Forge & Filigree', hint: 'Arms & accessories, the good ones',
        does: { shop: 'forge' },
      },
      {
        at: 'stall1', id: 'lest_surgate_counter', verb: 'Eat',
        label: "Surgate's Counter", hint: 'A cooked meal, and a buff with it',
        yOffset: 1.5, priority: 2,
        does: { eat: true },
      },
      {
        at: 'edge2', id: 'lest_leville', verb: 'Rest',
        label: 'The Leville', hint: '1,000 or 3,000 gil', yOffset: 1.7,
        does: { rest: true },
      },
      {
        at: 'edge3', id: 'lest_huntboard', verb: 'Hunts',
        label: 'Bounty Board', hint: 'Duscae Bounty Ledger', yOffset: 1.9, priority: 2,
        does: { hunts: true },
      },
      {
        at: 'edge4', id: 'lest_lookout', verb: 'View',
        label: 'The Lookout', hint: 'The Meteor of the Disc', yOffset: 1.4, priority: 0,
        does: {
          read: () => ({
            speaker: 'The Lookout', role: 'Lestallum · East rail', hue: 22,
            start: 'a',
            nodes: {
              a: {
                lines: [
                  'The shelf ends here in one clean drop, and past it the whole of the Disc lies '
                  + 'open with the Meteor sitting in the middle of it like something dropped and '
                  + 'never picked up.',
                  'Prompto has the camera out before anyone says anything. (C for the camera.)',
                ],
                next: null,
              },
            },
          }),
        },
      },
    ],
    festoon: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]],
  },
  {
    poi: 'galdin_quay',
    name: 'Galdin Quay',
    region: 'Leide',
    hue: 194,
    bulb: 0xffe0b4,
    lodgings: ['galdin_std', 'galdin_pearl'],
    lodgeSpeaker: 'Galdin Quay',
    lodgeSub: 'Reception · Over the water',
    lodgeLines: [
      'The whole hotel is built out over the sea on piles, and the floor moves about a centimetre when the swell comes in.',
      '"A bayside room, or the Mother of Pearl. The Pearl is not cheap, and nobody who has taken it has complained."',
    ],
    fixtures: [
      {
        at: 'stall0', id: 'gald_pearl', verb: 'Shop',
        label: 'Mother of Pearl', hint: "Coctura's kitchen · sells & buys fish",
        does: { shop: 'pearl' },
      },
      {
        at: 'stall3', id: 'gald_dino', verb: 'Shop',
        label: "Dino's Bench", hint: 'Jewellery, and he buys stones',
        does: { shop: 'dinos_bench' },
      },
      {
        at: 'edge2', id: 'gald_hotel', verb: 'Rest',
        label: 'Quay Reception', hint: '5,000 or 10,000 gil', yOffset: 1.7,
        does: { rest: true },
      },
      {
        at: 'edge5', id: 'gald_huntboard', verb: 'Hunts',
        label: 'Bounty Board', hint: 'Coastal Bounty Ledger', yOffset: 1.9, priority: 2,
        does: { hunts: true },
      },
      {
        at: 'edge0', id: 'gald_ferrybell', verb: 'Read',
        label: 'Ferry Bell', hint: 'Accordo Line', yOffset: 1.6, priority: 0,
        does: {
          read: () => ({
            speaker: 'Notice', role: 'Quayside · Accordo Line', hue: 194,
            start: 'a',
            nodes: {
              a: {
                lines: [
                  'A brass bell on a post, green with salt, and a hand-lettered board wired under it:',
                  'SERVICE SUSPENDED — ACCORDO LINE. NO CROSSINGS UNTIL FURTHER NOTICE. '
                  + 'ENQUIRIES TO THE OFFICE, WHICH IS ALSO CLOSED.',
                  'Gladio rings it anyway. It carries a long way over flat water, and nothing answers.',
                ],
                next: null,
              },
            },
          }),
        },
      },
      {
        at: 'edge1', id: 'gald_causeway', verb: 'View',
        label: 'The Causeway', hint: 'Where the boards run out over the sea', yOffset: 1.4, priority: 0,
        does: {
          read: () => ({
            speaker: 'The Causeway', role: 'Galdin Quay', hue: 194,
            start: 'a',
            nodes: {
              a: {
                lines: [
                  'The boardwalk runs three hundred metres out on piles, and from the end of it '
                  + 'there is no land in any direction you would call near.',
                  'Ignis observes that this is the furthest south any of them has ever stood. '
                  + 'Nobody says the obvious thing about Altissia.',
                ],
                next: null,
              },
            },
          }),
        },
      },
      {
        at: 'stall5', id: 'gald_angelgard', verb: 'View',
        label: 'Angelgard', hint: 'The island off the point', yOffset: 1.4, priority: 0,
        does: {
          read: () => ({
            speaker: 'Angelgard', role: 'Galdin Quay · Offshore', hue: 194,
            start: 'a',
            nodes: {
              a: {
                lines: [
                  'A black rock two kilometres out with nothing on it, which is what everyone says '
                  + 'about it, in the tone people use when a thing is not nothing.',
                  '(C for the camera. It photographs better at dusk.)',
                ],
                next: null,
              },
            },
          }),
        },
      },
      {
        at: 'edge3', id: 'gald_shoals_sign', verb: 'Read',
        label: 'Fishing Notice', hint: 'Galdin Shoals', yOffset: 1.6, priority: 0,
        does: {
          read: (game: Game) => {
            const rod = !!game.get('Rpg')?.inventory?.has?.('fishing_rod');
            return {
              speaker: 'Notice', role: 'Quayside · Angling', hue: 194,
              start: 'a',
              nodes: {
                a: {
                  lines: () => [
                    'GALDIN SHOALS — 150 M EAST ALONG THE SHINGLE. DEEP WATER OFF THE ROCKS. '
                    + 'ALLOCRAB, SEA BASS, AND SOMETHING NOBODY HAS LANDED.',
                    rod
                      ? 'Under it, in pencil: "Coctura pays over the odds for anything landed here. '
                        + 'Do not tell her I told you."'
                      : 'Under it, in pencil: "No rod, no supper. Ask at the Pearl."',
                  ],
                  next: null,
                },
              },
            };
          },
        },
      },
    ],
    festoon: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]],
  },
];

/**
 * What Surgate cooks. Three plates, three shapes of buff.
 *
 * Modelled on FFXV's meal buffs rather than on a potion: a meal is a long,
 * moderate, *specific* effect you choose before you go out, not a heal. The
 * numbers are in the same units `PartyState.addBuff` takes from a cooked
 * recipe, so a Beanmine meal and a camp meal are the same object downstream.
 */
const MEALS = [
  {
    id: 'skewers', name: 'Lestallum Skewers', gil: 300, hours: 3,
    blurb: 'HP +800',
    mods: { hp: 800 }, effects: [] as string[],
  },
  {
    id: 'sizzling', name: 'Sizzling Meteor Steak', gil: 900, hours: 4,
    blurb: 'Strength +60',
    mods: { strength: 60, hp: 400 }, effects: [] as string[],
  },
  {
    id: 'speciality', name: "Surgate's Speciality", gil: 1800, hours: 5,
    blurb: 'Magic +80, MP regen',
    mods: { magic: 80, mp: 30, spirit: 30 }, effects: ['mp-regen'],
  },
];

import * as THREE from 'three';
import { el, clamp, easeOut, easeOutQuint } from '../UIKit.ts';
import { icon } from '../Icons.ts';
import type { Menus } from '../Menus.ts';
import type { CachedNode } from '../UIKit.ts';
import type { Game } from '../../game/Game.ts';

const FILTERS = [
  'None', 'Vintage', 'Monochrome', 'Cross Process', 'Sepia Wash',
  'Golden Hour', 'Neon Fringe', 'Sunbleach',
];
const FRAMES = ['3:2 Full', '16:9 Wide', '1:1 Square', 'Polaroid'];

/**
 * The Meteor of the Disc, in world space.
 *
 * `Megastructures._meteor` hard-codes the same pair, which is the centre of
 * the `cauthess` zone. Duplicated rather than imported because the props lane
 * owns that file and a photo objective must not be able to break its build.
 */
const METEOR: [number, number] = [-1020, -2160];

/** What the shutter says it caught. */
const SUBJECT_NAME = (s: string) => ({
  meteor: 'The Meteor of the Disc', beast: 'A beast', party: 'The four of us', vista: 'A vista',
}[s] ?? s);

const _fwd = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _to = new THREE.Vector3();

/**
 * Prompto's camera. A framing overlay with rule-of-thirds guides and corner
 * marks, a filter list on the left, and aperture / exposure dials on the right.
 * Chrome-free: the shared menu heading and footer are suppressed.
 */
export class PhotoScreen {
  /** The screen root. Created and assigned by whoever registers the screen
   *  (`Menus.init`, or `Hammerhead._registerScreens` for the two town
   *  counters), never by this constructor. */
  node!: HTMLElement;
  _ap!: string;
  age!: number;
  apBar!: HTMLElement;
  apV!: HTMLElement;
  aperture!: number;
  /** The two letterbox bars, top and bottom. */
  bars!: Array<{ b: HTMLElement, k: string }>;
  chrome!: boolean;
  corners!: HTMLElement[];
  dials!: HTMLElement;
  exBar!: HTMLElement;
  exV!: HTMLElement;
  exposure!: number;
  filter!: number;
  flashAt!: number;
  frV!: HTMLElement;
  frame!: number;
  frameEl!: HTMLElement;
  grid!: HTMLElement;
  /** Rule-of-thirds guides. */
  gridLines!: HTMLElement[];
  menus!: Menus;
  rows!: CachedNode[];
  scrim!: boolean;
  side!: HTMLElement;
  title!: string;
  title2!: HTMLElement;
  constructor(menus: import('../Menus.ts').Menus) {
    this.menus = menus;
    this.title = 'Photo';
    this.chrome = false;
    this.scrim = false;
    this.filter = 5;
    this.frame = 1;
    this.aperture = 2.8;
    this.exposure = 0.0;
  }

  build(root: HTMLElement) {
    this.frameEl = el('div.photo-frame');
    this.bars = ['t', 'b'].map((k) => {
      const b = el('div.bar');
      this.frameEl.appendChild(b);
      return { b, k };
    });

    this.grid = el('div.photo-grid');
    this.gridLines = [];
    for (let i = 1; i <= 2; i++) {
      const v = el('i', { style: `left:${(i * 100 / 3).toFixed(3)}%;top:0;bottom:0;width:1px` });
      const h = el('i', { style: `top:${(i * 100 / 3).toFixed(3)}%;left:0;right:0;height:1px` });
      this.grid.appendChild(v); this.grid.appendChild(h);
      this.gridLines.push(v, h);
    }
    this.frameEl.appendChild(this.grid);

    this.corners = [[0, 0, '4px 0 0 4px'], [1, 0, '4px 4px 0 0'], [0, 1, '0 0 4px 4px'], [1, 1, '0 4px 4px 0']]
      .map(([x, y]) => {
        const c = el('div.photo-corner');
        c.style.left = x ? 'auto' : '0'; c.style.right = x ? '0' : 'auto';
        c.style.top = y ? 'auto' : '0'; c.style.bottom = y ? '0' : 'auto';
        c.style.borderTopWidth = y ? '0' : '1.5px';
        c.style.borderBottomWidth = y ? '1.5px' : '0';
        c.style.borderLeftWidth = x ? '0' : '1.5px';
        c.style.borderRightWidth = x ? '1.5px' : '0';
        this.frameEl.appendChild(c);
        return c;
      });
    root.appendChild(this.frameEl);

    this.title2 = el('div.photo-title', {}, [
      el('div.pt', { text: 'Photo Mode' }),
      el('div.ps', { text: 'Prompto Argentum  ·  shot 128 of 200' }),
    ]);
    root.appendChild(this.title2);

    this.side = el('div.photo-side.plate');
    this.side.appendChild(el('div.ph-k', { text: 'Filter' }));
    this.rows = FILTERS.map((f) => {
      const r = el('div.ph-row', {}, [el('div.dot'), el('div.n', { text: f })]);
      this.side.appendChild(r);
      return r;
    });
    root.appendChild(this.side);

    this.dials = el('div.photo-dials.plate');
    this.apV = el('div.v', { text: 'f/2.8' });
    this.exV = el('div.v', { text: '±0.0 EV' });
    this.frV = el('div.v', { text: FRAMES[this.frame] });
    this.apBar = el('div.gauge.slim', {}, [el('i.fill')]);
    this.exBar = el('div.gauge.slim', {}, [el('i.fill')]);
    this.dials.appendChild(el('div.dial', {}, [el('div.k', { text: 'Aperture' }), this.apV, this.apBar]));
    this.dials.appendChild(el('div.dial', {}, [el('div.k', { text: 'Exposure' }), this.exV, this.exBar]));
    this.dials.appendChild(el('div.dial', {}, [el('div.k', { text: 'Framing' }), this.frV]));
    this.dials.appendChild(el('div.ph-shoot', {}, [icon('camera', { size: 22, stroke: 1.1 }), el('span', { text: 'Space  ·  Shoot' })]));
    root.appendChild(this.dials);
  }

  nav(dx: number, dy: number) {
    if (dy) this.filter = (this.filter + dy + FILTERS.length) % FILTERS.length;
    if (dx) this.aperture = clamp(Math.round((this.aperture + dx * 0.4) * 10) / 10, 1.2, 16);
  }

  /**
   * The shutter — and the only thing in the game that ever notified `photo`.
   *
   * Four quest objectives are `photo` objectives (`side_nice_shot` wants a
   * vista, a beast and the party; `main_ch4_lestallum` wants the Meteor) and
   * **nothing in the repo posted the event**, so all four were uncompletable
   * and chapter 4 could not close. The screen itself was finished: framing
   * guides, filters, aperture, a flash. It just never told anyone.
   *
   * Wiring the verb rather than cutting the objectives, because the cost is
   * this method and the alternative is deleting the only non-combat verb in
   * the game.
   */
  accept() {
    this.flashAt = 0;
    const game = this.menus?.game;
    if (!game) return;
    const got = this.subjects(game);
    const rpg = game.get('Rpg');
    for (const s of got) rpg?.quests?.notify?.('photo', { target: s });
    const hud = game.get('HUD');
    if (hud?.callOut) hud.callOut('PHOTO TAKEN', got.length ? got.map(SUBJECT_NAME).join(' · ') : 'No subject');
  }

  /**
   * What is in this frame that a quest cares about.
   *
   * Deliberately generous on angle and mean on distance: a player framing a
   * shot has already done the work of pointing the camera, and a photo mode
   * that rejects a good-looking frame on a two-degree miss is worse than one
   * that occasionally credits a lucky one. Everything is judged against the
   * live camera, so it is the *frame* that counts, not where the party stands.
   */
  subjects(game: Game): string[] {
    const cam = game.camera;
    cam.getWorldDirection(_fwd);
    cam.getWorldPosition(_eye);
    const out: string[] = [];

    /** cosine of the angle between the camera and a world point */
    const facing = (x: number, z: number) => {
      _to.set(x - _eye.x, 0, z - _eye.z);
      const d = Math.hypot(_to.x, _to.z);
      if (d < 0.001) return { cos: 1, dist: 0 };
      return { cos: (_to.x * _fwd.x + _to.z * _fwd.z) / (d * Math.hypot(_fwd.x, _fwd.z)), dist: d };
    };

    // The Meteor of the Disc, the thing the whole Cauthess region is named for.
    const m = facing(METEOR[0], METEOR[1]);
    if (m.dist < 4200 && m.cos > 0.77) out.push('meteor');

    // A beast, mid-battle or not: anything alive and pointed at.
    const enemies = game.get('Enemies');
    for (const e of enemies?.list ?? []) {
      if (e.dead || !e.root) continue;
      const f = facing(e.root.position.x, e.root.position.z);
      if (f.dist < 90 && f.cos > 0.71) { out.push('beast'); break; }
    }

    // The party, "all four of you at camp".
    //
    // Not judged on facing, which was the first attempt and was wrong: the
    // party *follows* the player, so from a camera on the player's shoulder
    // they are permanently behind the lens and the objective could never tick.
    // It is a camp photo — Prompto holds the camera out — so the test is the
    // camp: at a haven, with the party gathered. That also stops it being
    // satisfiable by every photograph ever taken, which a bare distance test
    // would be.
    const party = game.get('Party');
    const rpg = game.get('Rpg');
    // `canCamp` is the same test the camp prompt uses, so "at camp" means the
    // same thing to the camera as it does to the bedroll -- and it is asked of
    // the **player**, not the lens. The camera trails several metres behind and
    // can be outside the haven while the party is sitting in the middle of it.
    const at = game.get('Player')?.position ?? _eye;
    const camp = rpg?.day?.canCamp?.({ x: at.x, z: at.z });
    if (camp?.ok) {
      let gathered = 0;
      for (const mm of party?.members ?? []) {
        if (!mm.root) continue;
        if (facing(mm.root.position.x, mm.root.position.z).dist < 22) gathered++;
      }
      if (gathered >= 3) out.push('party');
    }

    // A vista: outdoors, above the horizon line, and not standing in a hole.
    const inside = game.get('Dungeons')?.isInside;
    if (!inside && _fwd.y > -0.16 && !out.includes('party')) out.push('vista');

    return out;
  }

  enter() { this.age = 0; }

  /** @param dt @param game @param a */
  update(dt: number, game: Game, a: number) {
    const e = easeOutQuint(clamp((a - 0.05) / 0.8, 0, 1));
    // letterbox to the chosen framing
    const inset = (1 - e) * 0 + 42;
    this.bars[0].b.style.cssText = `left:0;right:0;top:0;height:${(inset * e).toFixed(1)}px`;
    this.bars[1].b.style.cssText = `left:0;right:0;bottom:0;height:${(inset * e).toFixed(1)}px`;
    for (const g of this.gridLines) g.style.opacity = (e * 0.55).toFixed(3);
    this.grid.style.top = `${(inset * e).toFixed(1)}px`;
    this.grid.style.bottom = `${(inset * e).toFixed(1)}px`;
    for (const c of this.corners) {
      c.style.opacity = e.toFixed(3);
      c.style.margin = `${(inset * e + 26).toFixed(1)}px 26px`;
    }
    this.title2.style.opacity = easeOut(clamp((a - 0.2) / 0.5, 0, 1)).toFixed(3);

    for (let i = 0; i < this.rows.length; i++) {
      const on = i === this.filter;
      if (this.rows[i]._on !== on) { this.rows[i].classList.toggle('on', on); this.rows[i]._on = on; }
      const t = easeOut(clamp((a - 0.14 - i * 0.028) / 0.5, 0, 1));
      this.rows[i].style.opacity = t.toFixed(3);
      this.rows[i].style.transform = `translateX(${((1 - t) * -14).toFixed(2)}px)`;
    }
    const s = easeOut(clamp((a - 0.15) / 0.6, 0, 1));
    this.side.style.opacity = s.toFixed(3);
    this.dials.style.opacity = s.toFixed(3);
    this.dials.style.transform = `translateY(-50%) translateX(${((1 - s) * 18).toFixed(2)}px)`;
    this.side.style.transform = `translateY(-50%) translateX(${((1 - s) * -18).toFixed(2)}px)`;

    const ap = `f/${this.aperture.toFixed(1)}`;
    if (ap !== this._ap) { this.apV.textContent = ap; this._ap = ap; }
    (this.apBar.firstChild as HTMLElement).style.width = `${(clamp((16 - this.aperture) / 14.8, 0, 1) * 100).toFixed(1)}%`;
    (this.exBar.firstChild as HTMLElement).style.width = '50%';
    this.frV.textContent = FRAMES[this.frame];
  }
}
